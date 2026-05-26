package com.jvmbook.ch07;

import net.sf.cglib.proxy.Enhancer;
import net.sf.cglib.proxy.NoOp;

/**
 * 模拟元空间（Metaspace）内存溢出场景。
 *
 * 使用 CGLIB Enhancer 在无限循环中动态创建代理类，
 * 每个代理类都会在元空间中生成新的类元数据。
 * useCache(false) 确保每次都生成全新的 Class 对象。
 *
 * JVM 参数建议：-XX:MaxMetaspaceSize=64m -XX:+PrintGCDetails
 */
public class MetaspaceOomDemo {

    public static void main(String[] args) {
        System.out.println("=== Metaspace OOM Simulation ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println("Generating CGLIB proxy classes in infinite loop...");
        System.out.println("MaxMetaspaceSize: 64m (set via -XX:MaxMetaspaceSize=64m)");
        System.out.println("useCache=false ensures each Enhancer creates a new class.\n");

        int count = 0;
        try {
            //noinspection InfiniteLoopStatement
            while (true) {
                Enhancer enhancer = new Enhancer();
                enhancer.setSuperclass(ProxyTarget.class);
                enhancer.setUseCache(false);
                enhancer.setCallback(NoOp.INSTANCE);
                @SuppressWarnings("unused")
                Object proxy = enhancer.create();
                count++;

                if (count % 1000 == 0) {
                    System.out.println("Created " + count + " proxy classes...");
                }
            }
        } catch (Error e) {
            // OOM extends Error, not Exception — catch Error here
            System.out.println("\n=== " + e.getClass().getName() + " caught after creating "
                    + count + " proxy classes ===");
            System.err.println(e.getClass().getName() + ": " + e.getMessage());
            System.out.println("\nAnalysis:");
            System.out.println("  - Total proxy classes generated: " + count);
            System.out.println("  - Root cause: Dynamic class generation without caching");
            System.out.println("  - Solution:");
            System.out.println("    a) Enable cache: enhancer.setUseCache(true)");
            System.out.println("    b) Reuse Class objects across invocations");
            System.out.println("    c) Increase -XX:MaxMetaspaceSize if necessary");
            System.out.println("\nHint: Use 'jcmd " + ProcessHandle.current().pid()
                    + " GC.class_stats' to inspect loaded classes");
        }
    }

    /** 简单的代理目标类。 */
    public static class ProxyTarget {
        // 空实现，仅作为 CGLIB 代理的超类
    }
}
