package com.jvmbook.ch10;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

/**
 * VirtualThreadDemo -- 对比平台线程与虚拟线程在执行 IO 密集型任务时的吞吐量。
 *
 * 场景：10_000 个任务，每个任务模拟 IO 等待 10ms。
 * - 平台线程：固定线程池（100 线程）
 * - 虚拟线程：按需创建，JDK 21 原生支持
 */
public class VirtualThreadDemo {

    private static final int TASK_COUNT = 10_000;
    private static final int IO_DELAY_MS = 10;

    public static void main(String[] args) throws Exception {
        System.out.println("=== Virtual Thread Demo ===");
        System.out.println("Tasks: " + TASK_COUNT + ", simulated IO delay: " + IO_DELAY_MS + "ms per task");
        System.out.println();

        // warmup
        System.out.println("--- Warmup ---");
        measurePlatformThreads();
        measureVirtualThreads();
        System.out.println();

        // measured run
        System.out.println("--- Measured Run ---");
        long platformMs = measurePlatformThreads();
        long virtualMs = measureVirtualThreads();

        System.out.println();
        System.out.println("=== Results ===");
        System.out.printf("Platform threads (pool=100): %d ms%n", platformMs);
        System.out.printf("Virtual threads:             %d ms%n", virtualMs);
        System.out.printf("Speedup ratio:               %.1fx%n", (double) platformMs / virtualMs);
    }

    static long measurePlatformThreads() throws Exception {
        long start = System.nanoTime();
        ExecutorService pool = Executors.newFixedThreadPool(100);
        CountDownLatch latch = new CountDownLatch(TASK_COUNT);
        IntStream.range(0, TASK_COUNT).forEach(i ->
                pool.submit(() -> {
                    simulateIo();
                    latch.countDown();
                })
        );
        latch.await();
        pool.shutdown();
        long end = System.nanoTime();
        return (end - start) / 1_000_000;
    }

    static long measureVirtualThreads() throws Exception {
        long start = System.nanoTime();
        CountDownLatch latch = new CountDownLatch(TASK_COUNT);
        IntStream.range(0, TASK_COUNT).forEach(i ->
                Thread.startVirtualThread(() -> {
                    simulateIo();
                    latch.countDown();
                })
        );
        latch.await();
        long end = System.nanoTime();
        return (end - start) / 1_000_000;
    }

    private static void simulateIo() {
        try {
            Thread.sleep(IO_DELAY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
