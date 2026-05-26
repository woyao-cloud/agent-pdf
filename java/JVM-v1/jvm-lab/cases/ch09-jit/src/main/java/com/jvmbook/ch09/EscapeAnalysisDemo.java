package com.jvmbook.ch09;

/**
 * 逃逸分析演示。
 *
 * 对比逃逸与非逃逸对象分配的 JIT 优化效果。
 * 关闭逃逸分析后，性能可能下降 20-50%。
 *
 * JVM 参数（开启逃逸分析，默认行为）：
 *   -XX:+DoEscapeAnalysis
 *
 * JVM 参数（关闭逃逸分析，观察性能回退）：
 *   -XX:-DoEscapeAnalysis
 *
 * JVM 参数（查看逃逸分析结果）：
 *   -XX:+PrintEscapeAnalysis（需要诊断模式）
 *   -XX:+UnlockDiagnosticVMOptions -XX:+PrintEscapeAnalysis
 */
public class EscapeAnalysisDemo {

    /**
     * 用于"逃逸"场景：将 Point 引用赋值给静态字段，强制逃逸。
     */
    private static Point escapedPoint;

    /**
     * 用于演示逃逸分析的点对象。
     * 使用 Java record 语法，是不可变的数据载体。
     */
    record Point(int x, int y) {}

    /**
     * 逃逸分配 —— Point 对象的引用通过调用返回值"逃逸"出方法。
     * JIT 无法对此对象进行标量替换，因为它可能被外部使用。
     */
    static int allocateEscaping(int value) {
        // Point 对象被创建并赋值给静态字段 —— 引用逃逸出本方法，
        // JIT 无法对其进行标量替换，必须在堆上分配
        Point p = new Point(value, value * 2);
        escapedPoint = p;
        return p.x() + p.y();
    }

    /**
     * 非逃逸分配 —— Point 对象的引用不逃逸出方法。
     * JIT 可以对此对象进行标量替换（Scalar Replacement），
     * 将对象拆解为多个局部变量，直接在栈上或寄存器中操作。
     */
    static int allocateNonEscaping(int value) {
        // Point 对象被创建，但其引用从未逃逸出本方法：
        // 它没有作为返回值，没有赋值给静态字段或实例字段，
        // 也没有传递给其他可能使其逃逸的方法。
        // JIT 可以将其完全优化掉（标量替换）。
        Point p = new Point(value, value * 2);
        return p.x() + p.y();
    }

    /**
     * 带条件的非逃逸 —— 对象仅在某个分支中使用。
     * 这种模式也支持标量替换。
     */
    static int allocateConditional(boolean flag, int value) {
        // 条件分支中的对象分配，引用不逃逸
        Point p;
        if (flag) {
            p = new Point(value, value + 1);
        } else {
            p = new Point(value - 1, value);
        }
        return p.x() + p.y();
    }

    public static void main(String[] args) {
        System.out.println("=== Escape Analysis Demo ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println();
        System.out.println("Use JVM flags to observe escape analysis:");
        System.out.println("  -XX:+DoEscapeAnalysis         (default, enable)");
        System.out.println("  -XX:-DoEscapeAnalysis         (disable, observe slowdown)");
        System.out.println("  -XX:+UnlockDiagnosticVMOptions -XX:+PrintEscapeAnalysis");
        System.out.println();
        System.out.println("=== Benchmark ===");

        // 预热阶段
        int warmupIterations = 200_000;
        for (int i = 0; i < warmupIterations; i++) {
            allocateEscaping(i);
            allocateNonEscaping(i);
            allocateConditional(i % 2 == 0, i);
        }
        System.out.println("Warmup complete: " + warmupIterations + " iterations each method.");
        System.out.println();

        // 计时阶段 —— 逃逸分配
        int iterations = 50_000_000;
        int result = 0;

        long t0 = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            result ^= allocateEscaping(i);
        }
        long t1 = System.nanoTime();
        System.out.printf("Escaping allocation (%d iters):    %d ms (result=%x)%n",
                iterations, (t1 - t0) / 1_000_000, result);

        // 计时阶段 —— 非逃逸分配
        result = 0;
        t0 = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            result ^= allocateNonEscaping(i);
        }
        t1 = System.nanoTime();
        System.out.printf("Non-escaping allocation (%d iters): %d ms (result=%x)%n",
                iterations, (t1 - t0) / 1_000_000, result);

        // 计时阶段 —— 条件非逃逸分配
        result = 0;
        t0 = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            result ^= allocateConditional(i % 2 == 0, i);
        }
        t1 = System.nanoTime();
        System.out.printf("Conditional non-escape (%d iters):  %d ms (result=%x)%n",
                iterations, (t1 - t0) / 1_000_000, result);

        System.out.println();
        System.out.println("=== Interpretation ===");
        System.out.println("When escape analysis is ENABLED:");
        System.out.println("  - Non-escaping objects can be scalar-replaced (no heap alloc)");
        System.out.println("  - Performance difference between escaping and non-escaping is large");
        System.out.println();
        System.out.println("When escape analysis is DISABLED (-XX:-DoEscapeAnalysis):");
        System.out.println("  - ALL objects are allocated on the heap (including non-escaping ones)");
        System.out.println("  - Non-escaping path performance drops ~20-50%");
        System.out.println("  - GC pressure increases significantly due to more allocations");
        System.out.println();
        System.out.println("Run twice: once with defaults, once with -XX:-DoEscapeAnalysis,");
        System.out.println("and compare the Non-escaping allocation times.");
    }
}
