package com.jvmbook.ch07;

import java.lang.management.ManagementFactory;

/**
 * 模拟栈溢出场景。
 *
 * 通过无限递归调用触发 StackOverflowError，
 * 每 10000 步输出当前递归深度。
 *
 * JVM 参数建议：-Xss256k（缩小栈容量以加速溢出）
 */
public class StackOverflowDemo {

    private static int depth = 0;

    public static void main(String[] args) {
        System.out.println("=== StackOverflow Simulation ===");
        System.out.println("PID: " + ProcessHandle.current().pid());

        // 打印当前 -Xss 值
        for (String arg : ManagementFactory.getRuntimeMXBean().getInputArguments()) {
            if (arg.startsWith("-Xss") || arg.startsWith("-XX:ThreadStackSize")) {
                System.out.println("JVM flag: " + arg);
            }
        }
        System.out.println("Starting infinite recursion...");
        System.out.println("Max stack depth will be reported when StackOverflowError occurs.\n");

        try {
            recurse();
        } catch (StackOverflowError e) {
            System.out.println("\n=== StackOverflowError caught at depth: " + depth + " ===");
            System.err.println(e.getClass().getName() + ": " + e.getMessage());
            System.out.println("\nAnalysis:");
            System.out.println("  - Stack depth: " + depth);
            System.out.println("  - Each stack frame consumes ~" + (depth > 0
                    ? ManagementFactory.getRuntimeMXBean().getInputArguments().stream()
                    .filter(a -> a.startsWith("-Xss")).findFirst()
                    .map(a -> {
                        try {
                            // 粗略估算: -Xss / depth, 包含JVM内部开销, 实际栈帧更大
                            String val = a.replace("-Xss", "").replace("k", "000").replace("m", "000000");
                            long stackBytes = Long.parseLong(val.replaceAll("[^0-9]", ""));
                            return (stackBytes / depth) + " bytes per frame (overestimate, includes JVM overhead)";
                        } catch (Exception ex) {
                            return "unknown";
                        }
                    }).orElse("unknown (no -Xss flag specified)")) : "N/A");
            System.out.println("  - Hint: Increase -Xss or convert recursion to iteration");
        }
    }

    @SuppressWarnings("InfiniteRecursion")
    private static void recurse() {
        depth++;
        if (depth % 10000 == 0) {
            System.out.println("Recursion depth: " + depth);
        }
        recurse();
    }
}
