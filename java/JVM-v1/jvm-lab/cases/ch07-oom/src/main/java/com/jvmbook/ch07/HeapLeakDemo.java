package com.jvmbook.ch07;

import java.util.ArrayList;
import java.util.List;

/**
 * 模拟堆内存泄漏场景。
 *
 * 每隔 50ms 向静态 List 中添加 512KB 的 byte 数组，
 * 导致堆内存持续增长直至 OutOfMemoryError。
 *
 * JVM 参数建议：-Xmx128m -XX:+UseG1GC
 */
public class HeapLeakDemo {

    private static final List<byte[]> LEAK = new ArrayList<>();
    private static final int CHUNK_SIZE = 512 * 1024; // 512KB
    private static final long INTERVAL_MS = 50;

    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== Heap Leak Simulation ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println("Allocating " + (CHUNK_SIZE / 1024) + "KB every " + INTERVAL_MS + "ms...");
        System.out.println("Heap size: ~" + (Runtime.getRuntime().maxMemory() / 1024 / 1024) + "MB");

        int count = 0;
        try {
            //noinspection InfiniteLoopStatement
            while (true) {
                LEAK.add(new byte[CHUNK_SIZE]);
                count++;
                if (count % 100 == 0) {
                    long totalMb = (long) count * CHUNK_SIZE / 1024 / 1024;
                    System.out.println("Allocated " + count + " chunks (~" + totalMb + "MB)");
                }
                Thread.sleep(INTERVAL_MS);
            }
        } catch (OutOfMemoryError e) {
            System.out.println("=== OutOfMemoryError caught after " + count + " allocations ===");
            System.out.println("Total allocated: ~" + ((long) count * CHUNK_SIZE / 1024 / 1024) + "MB");
            System.err.println(e.getClass().getName() + ": " + e.getMessage());
            // 保留堆转储线索，以便后续用 MAT 分析
            System.out.println("Hint: Run 'jcmd " + ProcessHandle.current().pid()
                    + " GC.heap_dump /tmp/heap.hprof' to capture heap dump");
        }
    }
}
