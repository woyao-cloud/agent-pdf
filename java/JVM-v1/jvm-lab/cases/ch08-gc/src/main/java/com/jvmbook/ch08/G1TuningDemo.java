package com.jvmbook.ch08;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * G1 调优模拟程序。
 *
 * 模拟高分配率服务，维持约 500MB 存活数据，
 * 每个周期分配 5MB 的变长大对象（16KB-100KB），
 * 约 60% 的分配被保留，其余可被 GC 回收。
 *
 * 用于对比默认 G1 参数与调优参数对 GC 停顿时间的影响。
 *
 * JVM 参数（默认）：
 *   -Xmx2g -Xms2g -XX:+UseG1GC -Xlog:gc*=info:file=gc.log:time,uptime,pid,tid
 *
 * JVM 参数（调优）：
 *   -Xmx2g -Xms2g -XX:+UseG1GC
 *   -XX:G1HeapRegionSize=4m
 *   -XX:MaxGCPauseMillis=100
 *   -XX:InitiatingHeapOccupancyPercent=60
 *   -XX:G1MixedGCLiveThresholdPercent=85
 *   -XX:G1MixedGCCountTarget=8
 *   -Xlog:gc*=info:file=gc-tuned.log:time,uptime,pid,tid
 */
public class G1TuningDemo {

    private static final List<byte[]> LIVE_DATA = new ArrayList<>();
    private static final long TARGET_LIVE_BYTES = 500L * 1024 * 1024; // 500MB
    private static final int CYCLE_BYTES = 5 * 1024 * 1024; // 5MB per cycle
    private static final long SLEEP_MS = 200;

    private static final Random RANDOM = new Random();

    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== G1 Tuning Demo ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println("Target live data: ~500MB");
        System.out.println("Allocation per cycle: 5MB (varied chunks 16KB-100KB)");
        System.out.println("Retention ratio: ~60%");

        long liveBytes = 0;
        int cycle = 0;
        long totalAllocated = 0;

        // === 预热阶段：快速填充到目标存活量 ===
        System.out.println("\n--- Warming up: filling to ~500MB live data ---");
        while (liveBytes < TARGET_LIVE_BYTES) {
            byte[] chunk = allocateChunk();
            totalAllocated += chunk.length;
            LIVE_DATA.add(chunk);
            liveBytes += chunk.length;
        }
        System.out.println("Warmup complete. Live objects: " + LIVE_DATA.size()
                + ", total live: " + (liveBytes / 1024 / 1024) + "MB");

        // === 稳态运行阶段 ===
        //noinspection InfiniteLoopStatement
        while (true) {
            cycle++;

            // 分配 5MB 的变长块
            int allocatedThisCycle = 0;
            while (allocatedThisCycle < CYCLE_BYTES) {
                byte[] chunk = allocateChunk();
                allocatedThisCycle += chunk.length;
                totalAllocated += chunk.length;

                // ~60% 概率保留
                if (RANDOM.nextDouble() < 0.6) {
                    // 替换旧对象，保持总存活量稳定
                    int idx = RANDOM.nextInt(LIVE_DATA.size());
                    LIVE_DATA.set(idx, chunk);
                }
            }

            if (cycle % 100 == 0) {
                long currentLive = computeLiveBytes();
                long totalMb = totalAllocated / 1024 / 1024;
                System.out.println("Cycle " + cycle + " | total allocated: "
                        + totalMb + "MB | live: " + (currentLive / 1024 / 1024) + "MB");
            }

            Thread.sleep(SLEEP_MS);
        }
    }

    /**
     * 分配一个 16KB-100KB 之间随机大小的字节数组。
     */
    private static byte[] allocateChunk() {
        int size = 16 * 1024 + RANDOM.nextInt(84 * 1024); // 16KB ~ 100KB
        return new byte[size];
    }

    /**
     * 计算当前存活对象的总字节数。
     */
    private static long computeLiveBytes() {
        long total = 0;
        for (byte[] chunk : LIVE_DATA) {
            total += chunk.length;
        }
        return total;
    }
}
