package com.jvmbook.ch10;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.LongAdder;

/**
 * LockContentionDemo -- 对比三种并发计数策略的锁竞争开销。
 *
 * 三种策略：
 *  1. synchronized：对共享 ConcurrentHashMap 做 synchronized 同步，竞争最激烈。
 *  2. Striped Lock：ConcurrentHashMap.computeIfAbsent + LongAdder，降低锁粒度。
 *  3. Lock-Free：每个线程持有自己的 LongAdder，最后汇总，零竞争。
 */
public class LockContentionDemo {

    private static final int THREADS = 8;
    private static final int ITERATIONS = 1_000_000;
    private static final int KEYS = 64;

    // 策略 1：全局 synchronized
    private static final ConcurrentHashMap<String, Long> SYNC_MAP = new ConcurrentHashMap<>();

    // 策略 2：Striped Lock -- 利用 ConcurrentHashMap 的分段能力
    private static final ConcurrentHashMap<String, LongAdder> STRIPED_MAP = new ConcurrentHashMap<>();

    // 策略 3：Lock-Free -- 每个线程的私有计数器
    private static final LongAdder[] LOCK_FREE_COUNTERS = new LongAdder[THREADS];

    static {
        for (int i = 0; i < THREADS; i++) {
            LOCK_FREE_COUNTERS[i] = new LongAdder();
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("=== Lock Contention Demo ===");
        System.out.println("Threads: " + THREADS + ", Iterations per thread: " + ITERATIONS);
        System.out.println();

        // warmup
        System.out.println("--- Warmup ---");
        measure("synchronized", LockContentionDemo::runSynchronized);
        measure("striped lock", LockContentionDemo::runStripedLock);
        measure("lock-free", LockContentionDemo::runLockFree);
        System.out.println();

        // measured run
        System.out.println("--- Measured Run ---");
        long syncMs = measure("synchronized", LockContentionDemo::runSynchronized);
        long stripedMs = measure("striped lock", LockContentionDemo::runStripedLock);
        long lockFreeMs = measure("lock-free", LockContentionDemo::runLockFree);

        System.out.println();
        System.out.println("=== Results ===");
        System.out.printf("synchronized: %d ms (baseline)%n", syncMs);
        System.out.printf("striped lock: %d ms  (%.1fx faster)%n", stripedMs, (double) syncMs / stripedMs);
        System.out.printf("lock-free:    %d ms  (%.1fx faster)%n", lockFreeMs, (double) syncMs / lockFreeMs);
    }

    // ---- 三种策略实现 ----

    static void runSynchronized() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch latch = new CountDownLatch(THREADS);
        for (int t = 0; t < THREADS; t++) {
            final int threadId = t;
            pool.submit(() -> {
                for (int i = 0; i < ITERATIONS; i++) {
                    String key = "key-" + (i % KEYS);
                    synchronized (LockContentionDemo.class) {
                        SYNC_MAP.merge(key, 1L, Long::sum);
                    }
                }
                latch.countDown();
            });
        }
        latch.await();
        pool.shutdown();
    }

    static void runStripedLock() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch latch = new CountDownLatch(THREADS);
        for (int t = 0; t < THREADS; t++) {
            final int threadId = t;
            pool.submit(() -> {
                for (int i = 0; i < ITERATIONS; i++) {
                    String key = "key-" + (i % KEYS);
                    STRIPED_MAP.computeIfAbsent(key, k -> new LongAdder()).increment();
                }
                latch.countDown();
            });
        }
        latch.await();
        pool.shutdown();
    }

    static void runLockFree() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch latch = new CountDownLatch(THREADS);
        for (int t = 0; t < THREADS; t++) {
            final int threadId = t;
            pool.submit(() -> {
                LongAdder myCounter = LOCK_FREE_COUNTERS[threadId];
                for (int i = 0; i < ITERATIONS; i++) {
                    myCounter.increment();
                }
                latch.countDown();
            });
        }
        latch.await();
        pool.shutdown();
        // 汇总
        long total = 0;
        for (LongAdder c : LOCK_FREE_COUNTERS) {
            total += c.sum();
        }
    }

    static long measure(RunnableWithException task) throws Exception {
        long start = System.nanoTime();
        task.run();
        long end = System.nanoTime();
        return (end - start) / 1_000_000;
    }

    @FunctionalInterface
    interface RunnableWithException {
        void run() throws Exception;
    }
}
