package com.jvmbook.ch09;

import java.util.concurrent.ThreadLocalRandom;

/**
 * JIT 方法内联失效演示。
 *
 * 演示接口多态分发导致的关键路径方法未被内联的问题。
 * 使用 -XX:+PrintInlining 或 -Xlog:jit+compilation* 观察内联决策。
 *
 * JVM 参数（默认，观察内联行为）：
 *   -XX:+PrintInlining
 *
 * JVM 参数（调优，扩大内联阈值）：
 *   -XX:+PrintInlining
 *   -XX:InlineSmallCode=5000
 *   -XX:MaxInlineLevel=15
 *   -XX:MaxInlineSize=500
 */
public class InlineFailureDemo {

    // === 单态分发（应被内联） ===
    interface Processor {
        int process(int input);
    }

    static class InlineProcessor implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input);
        }
    }

    // === 双态分发（可能无法内联） ===
    static class BiProcessorA implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input) + 1;
        }
    }

    static class BiProcessorB implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input) - 1;
        }
    }

    // === 多态分发（大概率不会内联） ===
    static class MegaProcessorA implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input) * 2;
        }
    }

    static class MegaProcessorB implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input) / 2;
        }
    }

    static class MegaProcessorC implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input) + 100;
        }
    }

    /**
     * 模拟的计算密集型操作。
     * 包含一个小循环（100 次迭代），循环体内执行位运算和算术运算。
     * 此方法足够复杂，使其成为内联决策的关注对象。
     */
    static int expensiveOp(int x) {
        int result = x;
        for (int i = 0; i < 100; i++) {
            result ^= (x + i);
            result = Integer.rotateRight(result, 3);
            result += (i * 31) ^ (x >>> i);
        }
        return result;
    }

    /**
     * 双态分发点。参数 p 在运行时可能是 BiProcessorA 或 BiProcessorB。
     * C2 编译器会尝试乐观内联（猜中率 50%），但猜错时需去优化。
     */
    static int processBimorphic(Processor p, int input) {
        return p.process(input);
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== JIT Inline Failure Demo ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println();
        System.out.println("Use JVM flags to observe inlining decisions:");
        System.out.println("  -XX:+PrintInlining");
        System.out.println("  -Xlog:jit+compilation*=debug");
        System.out.println("  -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation");
        System.out.println();
        System.out.println("=== Warmup phase ===");

        // 单态分发：只使用 InlineProcessor
        Processor inlineProcessor = new InlineProcessor();

        // 双态分发：交替使用两个实现
        Processor biA = new BiProcessorA();
        Processor biB = new BiProcessorB();

        // 多态分发：轮流使用多个实现（超过 2 个 = 多态）
        Processor megaA = new MegaProcessorA();
        Processor megaB = new MegaProcessorB();
        Processor megaC = new MegaProcessorC();

        // 预热 + 观察内联行为
        int result = 0;
        long totalNanos = 0;

        // 预热阶段：让 JIT 完成编译和优化
        for (int i = 0; i < 200_000; i++) {
            // 单态分发点——应被内联
            result ^= inlineProcessor.process(i);

            // 双态分发点——可能被内联（乐观），也可能不被内联
            Processor p = (i % 2 == 0) ? biA : biB;
            result ^= processBimorphic(p, i);

            // 多态分发点——几乎不可能内联
            Processor mp = switch (i % 3) {
                case 0 -> megaA;
                case 1 -> megaB;
                default -> megaC;
            };
            result ^= mp.process(i);
        }

        System.out.println("=== Warmup complete. Result: " + result + " ===");
        System.out.println();
        System.out.println("=== Timing phase ===");

        // 计时阶段：测量三种分发模式的性能差异
        long t0, t1;

        // 1. 单态分发
        t0 = System.nanoTime();
        int r1 = 0;
        for (int i = 0; i < 10_000_000; i++) {
            r1 ^= inlineProcessor.process(i & 0xFF);
        }
        t1 = System.nanoTime();
        System.out.printf("Monomorphic dispatch (likely inlined):   %d ms (result=%x)%n",
                (t1 - t0) / 1_000_000, r1);

        // 2. 双态分发
        t0 = System.nanoTime();
        int r2 = 0;
        for (int i = 0; i < 10_000_000; i++) {
            Processor p = (i % 2 == 0) ? biA : biB;
            r2 ^= processBimorphic(p, i & 0xFF);
        }
        t1 = System.nanoTime();
        System.out.printf("Bimorphic dispatch (maybe not inlined):  %d ms (result=%x)%n",
                (t1 - t0) / 1_000_000, r2);

        // 3. 多态分发
        t0 = System.nanoTime();
        int r3 = 0;
        for (int i = 0; i < 10_000_000; i++) {
            Processor mp = switch (i % 3) {
                case 0 -> megaA;
                case 1 -> megaB;
                default -> megaC;
            };
            r3 ^= mp.process(i);
        }
        t1 = System.nanoTime();
        System.out.printf("Megamorphic dispatch (unlikely inlined): %d ms (result=%x)%n",
                (t1 - t0) / 1_000_000, r3);

        System.out.println();
        System.out.println("=== Interpretation ===");
        System.out.println("If monomorphic is significantly faster than bimorphic,");
        System.out.println("it means the bimorphic call site was NOT inlined.");
        System.out.println("If megamorphic is the slowest, inlining failed entirely.");
        System.out.println();
        System.out.println("Tuning flags to improve inlining:");
        System.out.println("  -XX:InlineSmallCode=5000");
        System.out.println("  -XX:MaxInlineLevel=15");
        System.out.println("  -XX:MaxInlineSize=500");
        System.out.println("  -XX:+TrustFinalNonStaticFields");
        System.out.println("  -XX:MaxRecursiveInlineLevel=2");
    }
}
