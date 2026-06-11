package masteralgo.chapter06;

import java.util.function.Supplier;

/**
 * 尾递归优化演示：尾递归 vs 非尾递归 vs 蹦床模式
 *
 * 本 Demo 展示：
 * 1. 阶乘的非尾递归实现（递归返回后还要做乘法）
 * 2. 阶乘的尾递归实现（使用累加器模式）
 * 3. 证明 Java 不优化尾递归——两者都会栈溢出
 * 4. 蹦床模式（Trampoline）解决深度递归问题
 * 5. 对比各版本的性能与极限深度
 */
public class TailCallOptimization {

    // ============================================================
    //  1. 非尾递归阶乘
    // ============================================================

    /**
     * 非尾递归：乘法在递归返回后执行
     * 每个栈帧需要在返回后继续做乘法运算
     */
    public static long factorialNonTail(int n) {
        if (n <= 1) return 1;
        return n * factorialNonTail(n - 1); // ← 递归不是最后一步
    }

    // ============================================================
    //  2. 尾递归阶乘（累加器模式）
    // ============================================================

    /**
     * 尾递归：递归调用是最后一个操作
     * 在支持 TCO 的语言中，此版本会被优化为循环
     * 但在 Java 中，它仍然会栈溢出！
     */
    public static long factorialTail(int n, long accumulator) {
        if (n <= 1) return accumulator;
        return factorialTail(n - 1, n * accumulator); // ← 递归是最后一步
    }

    /** 尾递归的便捷入口 */
    public static long factorialTail(int n) {
        return factorialTail(n, 1);
    }

    // ============================================================
    //  3. 迭代版（基准对比）
    // ============================================================

    public static long factorialIterative(int n) {
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    // ============================================================
    //  4. 蹦床模式（Trampoline）
    // ============================================================

    /**
     * 蹦床抽象：表示一个"待计算的递归步骤"
     *
     * Trampoline 是一个递归步骤的抽象：
     * - Done（已完成）：封装了最终结果
     * - More（未完成）：封装了下一步的计算
     * 外层循环反复执行"下一步"，直到遇到 Done，此时 JVM 栈深度始终为 1
     */
    interface Trampoline<T> {
        /** 获取最终结果 */
        T get();

        /** 是否已完成 */
        default boolean isComplete() { return true; }

        /** 执行下一步 */
        default Trampoline<T> bounce() { return this; }
    }

    /**
     * 已完成：封装最终结果
     */
    static class Done<T> implements Trampoline<T> {
        final T result;
        Done(T result) { this.result = result; }
        @Override public T get() { return result; }
    }

    /**
     * 未完成：封装下一步的计算
     */
    static class More<T> implements Trampoline<T> {
        final Supplier<Trampoline<T>> next;
        More(Supplier<Trampoline<T>> next) { this.next = next; }
        @Override public T get() { return bounce().get(); }
        @Override public boolean isComplete() { return false; }
        @Override public Trampoline<T> bounce() { return next.get(); }
    }

    /**
     * 蹦床工具：驱动蹦床循环
     */
    public static <T> T trampoline(Trampoline<T> trampoline) {
        Trampoline<T> current = trampoline;
        while (!current.isComplete()) {
            current = current.bounce();
        }
        return current.get();
    }

    /**
     * 阶乘的蹦床版本
     *
     * 关键：不直接递归调用，而是返回一个描述"下一步做什么"的对象
     * 外层 trampoline() 循环负责真正执行这些步骤
     */
    public static Trampoline<Long> factorialTrampoline(int n, long accumulator) {
        if (n <= 1) {
            return new Done<>(accumulator);                    // 已完成
        }
        return new More<>(() -> factorialTrampoline(n - 1, n * accumulator)); // 未完成
    }

    /** 蹦床版阶乘的便捷入口 */
    public static long factorialTrampoline(int n) {
        return trampoline(factorialTrampoline(n, 1L));
    }

    // ============================================================
    //  5. 性能对比与极限深度测试
    // ============================================================

    /**
     * 测试递归能到达的极限深度
     * 返回 true 表示成功，false 表示栈溢出
     */
    public static boolean testRecursiveLimit(String label, RecursiveFunction func, int n) {
        try {
            long result = func.apply(n);
            System.out.printf("  %s(%d) = %d → 成功%n", label, n, result);
            return true;
        } catch (StackOverflowError e) {
            System.out.printf("  %s(%d) → 栈溢出！%n", label, n);
            return false;
        }
    }

    @FunctionalInterface
    interface RecursiveFunction {
        long apply(int n) throws StackOverflowError;
    }

    // ============================================================
    //  主方法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  TailCallOptimization —— 尾递归与优化演示");
        System.out.println("================================================\n");

        // ---------- 1. 小 n 验证正确性 ----------
        System.out.println("----- 1. 正确性验证（n=10） -----");
        int n = 10;
        long r1 = factorialNonTail(n);
        long r2 = factorialTail(n);
        long r3 = factorialIterative(n);
        long r4 = factorialTrampoline(n);
        System.out.printf("  非尾递归(%d) = %d%n", n, r1);
        System.out.printf("  尾递归(%d) = %d%n", n, r2);
        System.out.printf("  迭代(%d) = %d%n", n, r3);
        System.out.printf("  蹦床(%d) = %d%n", n, r4);
        System.out.printf("  全部一致: %s%n%n", (r1 == r2 && r2 == r3 && r3 == r4) ? "✓" : "✗");

        // ---------- 2. 证明 Java 不优化尾递归 ----------
        System.out.println("----- 2. Java 是否优化尾递归？ -----");
        System.out.println("  如果 Java 做了尾递归优化，尾递归应该能到达更大的 n");
        System.out.println("  测试 n=20000：\n");

        boolean nonTailOk = testRecursiveLimit("非尾递归", TailCallOptimization::factorialNonTail, 20000);
        boolean tailOk = testRecursiveLimit("尾递归", TailCallOptimization::factorialTail, 20000);

        System.out.printf("%n  结论: ");
        if (nonTailOk == tailOk) {
            System.out.println("尾递归和非尾递归在相同深度同时失败/成功");
            System.out.println("  → Java 没有做尾递归优化！");
        } else {
            System.out.println("尾递归能到达更深 → Java 做了尾递归优化");
        }

        // ---------- 3. 蹦床模式绕过栈溢出 ----------
        System.out.println("\n----- 3. 蹦床模式测试 -----");
        System.out.println("  蹦床模式通过循环避免栈增长，可以处理极深的递归\n");

        for (int depth : new int[]{100, 1000, 10000, 100000}) {
            try {
                long start = System.nanoTime();
                long result = factorialTrampoline(depth);
                long time = System.nanoTime() - start;
                System.out.printf("  蹦床(%d) = %d, 耗时 %.3fms%n",
                        depth, result, time / 1_000_000.0);
            } catch (StackOverflowError e) {
                System.out.printf("  蹦床(%d) → 栈溢出！（不该发生）%n", depth);
            } catch (Exception e) {
                System.out.printf("  蹦床(%d) → 异常: %s%n", depth, e.getMessage());
            }
        }

        // ---------- 4. 性能对比 ----------
        System.out.println("\n----- 4. 性能对比（n=1000） -----");
        int testN = 1000;
        int warmup = 1000;
        int iterations = 10000;

        // 预热
        for (int i = 0; i < warmup; i++) {
            factorialIterative(testN);
        }

        // 迭代版
        long start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            factorialIterative(testN);
        }
        long iterTime = System.nanoTime() - start;

        // 蹦床版
        start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            factorialTrampoline(testN);
        }
        long trampTime = System.nanoTime() - start;

        System.out.printf("  迭代版:  %.3f ms  (基准)%n", iterTime / 1_000_000.0);
        System.out.printf("  蹦床版:  %.3f ms  (慢 %.1f 倍)%n",
                trampTime / 1_000_000.0,
                (double) trampTime / iterTime);
        System.out.println("\n  蹦床模式约慢 5-20 倍，因为每个步骤都创建了新的对象。");
        System.out.println("  适用于递归深度极大（>10000）且无法转为迭代的场景。");

        // ---------- 5. 阶乘的尾递归 vs 非尾递归调用示意图 ----------
        System.out.println("\n----- 5. 尾递归 vs 非尾递归示意图 -----");
        System.out.println();
        System.out.println("  非尾递归: factorial(4)");
        System.out.println("    return 4 * factorial(3)");
        System.out.println("         → return 4 * (3 * factorial(2))");
        System.out.println("         → return 4 * (3 * (2 * factorial(1)))");
        System.out.println("         → return 4 * (3 * (2 * 1))");
        System.out.println("         → return 4 * (3 * 2)");
        System.out.println("         → return 4 * 6");
        System.out.println("         → return 24");
        System.out.println("    每个栈帧在返回后还要执行乘法，所以栈不能释放\n");
        System.out.println("  尾递归: factorial(4, 1)");
        System.out.println("    return factorial(3, 4)");
        System.out.println("         → return factorial(2, 12)");
        System.out.println("         → return factorial(1, 24)");
        System.out.println("         → return 24");
        System.out.println("    递归调用是最后一步，如果优化则栈帧可复用");
        System.out.println("    可惜 Java 没做这个优化\n");

        System.out.println("================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}