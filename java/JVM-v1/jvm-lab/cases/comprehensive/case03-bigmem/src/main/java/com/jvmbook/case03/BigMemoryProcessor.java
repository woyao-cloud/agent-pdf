package com.jvmbook.case03;

import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * BigMemoryProcessor — Pure Java Data Processing Engine for ZGC Demonstration.
 *
 * Simulates a large-heap analytics workload that:
 *  1. Loads a synthetic dataset into memory via many array allocations.
 *  2. Performs data transformations: filtering, grouping, aggregation.
 *  3. Runs in multiple cycles with growing memory pressure to trigger ZGC concurrent cycles.
 *  4. Prints phase timestamps and memory stats for JFR correlation.
 *  5. Prints PID at start for JFR/profiler attachment.
 *
 * JVM flags to pair with (see run-zgc-test.sh):
 *  -XX:+UseZGC -Xmx4g -Xms4g -Xlog:gc*:file=gc.log
 *  -XX:+UseZGC -XX:+ZGenerational -Xmx4g -Xms4g -Xlog:gc*:file=gc-gen.log
 */
public class BigMemoryProcessor {

    private static final int    RECORD_COUNT       = 2_000_000;
    private static final int    BATCH_SIZE         = 100_000;
    private static final double RETENTION_RATIO    = 0.6;
    private static final int    CYCLES             = 6;
    private static final String TIMESTAMP_FMT      = "yyyy-MM-dd'T'HH:mm:ss.SSS";

    private final List<DataRecord> workingSet = new ArrayList<>();
    private long cycleStart;
    private long phaseStart;

    public static void main(String[] args) throws Exception {
        // Print PID so JFR / profiler can be attached
        System.out.println("[BOOT] PID: " + ManagementFactory.getRuntimeMXBean().getName().split("@")[0]);
        System.out.println("[BOOT] Max heap: " + Runtime.getRuntime().maxMemory() / (1024 * 1024) + " MB");
        System.out.println("[BOOT] ZGC demo — BigMemoryProcessor starting\n");

        BigMemoryProcessor processor = new BigMemoryProcessor();
        processor.execute();
    }

    // ==================== Execution ====================

    public void execute() throws InterruptedException {
        for (int cycle = 1; cycle <= CYCLES; cycle++) {
            cycleStart = System.currentTimeMillis();
            System.out.println(ts() + " [CYCLE " + cycle + "/" + CYCLES + "] ========================");

            // Phase A — Data loading (allocation-heavy)
            phase("LOAD", () -> loadBatch(cycle));

            // Phase B — Filtering
            phase("FILTER", () -> filterRecords());

            // Phase C — Grouping & Aggregation
            phase("AGGREGATE", () -> aggregateRecords());

            // Phase D — Retention (keep a portion to grow memory pressure)
            phase("RETAIN", () -> retainRecords(cycle));

            // Phase E — Explicit idle (allows ZGC concurrent cycle to catch up)
            if (cycle < CYCLES) {
                phase("IDLE", () -> sleepQuiet(2000));
            }

            printMemStats(cycle);
            System.out.println();
        }
        System.out.println(ts() + " [DONE] All cycles completed. Retained "
                + workingSet.size() + " records in heap.");
    }

    // ==================== Phases ====================

    private void loadBatch(int cycle) {
        int target = RECORD_COUNT / CYCLES * cycle;
        while (workingSet.size() < target) {
            int chunk = Math.min(BATCH_SIZE, target - workingSet.size());
            for (int i = 0; i < chunk; i++) {
                workingSet.add(DataRecord.random());
            }
        }
        System.out.println(ts() + "  => loaded " + workingSet.size() + " records");
    }

    private void filterRecords() {
        double threshold = 50.0 + ThreadLocalRandom.current().nextDouble(30);
        List<DataRecord> filtered = workingSet.stream()
                .filter(r -> r.metricA > threshold)
                .collect(Collectors.toList());
        System.out.println(ts() + "  => filtered: " + workingSet.size() + " -> "
                + filtered.size() + " (threshold=" + String.format("%.1f", threshold) + ")");
    }

    private void aggregateRecords() {
        // Group by category, compute average metricA per group
        Map<String, DoubleSummaryStatistics> stats = workingSet.stream()
                .collect(Collectors.groupingBy(
                        r -> r.category,
                        Collectors.summarizingDouble(r -> r.metricA)
                ));
        // Simulate downstream work: iterate over groups and produce a synthetic result
        StringBuilder sb = new StringBuilder(256);
        stats.forEach((cat, s) -> {
            if (s.getCount() > 0 && ThreadLocalRandom.current().nextInt(100) < 10) {
                sb.append(cat).append('=').append(String.format("%.1f", s.getAverage())).append(';');
            }
        });
        System.out.println(ts() + "  => aggregated " + stats.size() + " groups [" + sb + "]");
    }

    private void retainRecords(int cycle) {
        int threshold = (int) (RECORD_COUNT * RETENTION_RATIO * Math.min(1.0, cycle / (double) CYCLES));
        // Allocate additional retained data — arrays that survive, growing with each cycle
        int extra = Math.max(0, threshold - workingSet.size());
        for (int i = 0; i < extra; i++) {
            workingSet.add(DataRecord.random());
        }
        System.out.println(ts() + "  => retained " + workingSet.size()
                + " records (goal=" + threshold + ")");
    }

    // ==================== Utilities ====================

    private void phase(String label, Runnable task) {
        phaseStart = System.nanoTime();
        System.out.print(ts() + "  [PHASE " + label + "] ");
        task.run();
        long elapsed = (System.nanoTime() - phaseStart) / 1_000_000;
        System.out.println(ts() + "    => " + label + " done in " + elapsed + " ms");
    }

    private void sleepQuiet(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    private void printMemStats(int cycle) {
        MemoryMXBean mem = ManagementFactory.getMemoryMXBean();
        MemoryUsage heap = mem.getHeapMemoryUsage();
        long used = heap.getUsed() / (1024 * 1024);
        long max  = heap.getMax() / (1024 * 1024);
        long gcCount = ManagementFactory.getGarbageCollectorMXBeans().stream()
                .mapToLong(GarbageCollectorMXBean::getCollectionCount)
                .sum();
        long elapsed = (System.currentTimeMillis() - cycleStart);
        System.out.println(ts() + "  [MEM] cycle=" + cycle
                + " used=" + used + "MB max=" + max + "MB"
                + " gcCount=" + gcCount
                + " cycleElapsed=" + elapsed + "ms");
    }

    private static String ts() {
        return new SimpleDateFormat(TIMESTAMP_FMT).format(new Date());
    }

    // ==================== Data Model ====================

    /**
     * Synthetic data record that simulates a telemetry event.
     * Each instance occupies ~200 bytes on the heap (with object header + fields).
     */
    static final class DataRecord {
        final long    id;
        final String  category;
        final double  metricA;
        final double  metricB;
        final long[]  payload;     // simulate variable-length payload

        DataRecord(long id, String category, double metricA, double metricB, int payloadSize) {
            this.id       = id;
            this.category = category;
            this.metricA  = metricA;
            this.metricB  = metricB;
            this.payload  = new long[payloadSize];
            // Fill with noise to ensure memory is committed
            Arrays.fill(this.payload, ThreadLocalRandom.current().nextLong());
        }

        static DataRecord random() {
            ThreadLocalRandom rng = ThreadLocalRandom.current();
            long   id       = rng.nextLong(1_000_000_000);
            String cat      = CATEGORIES[rng.nextInt(CATEGORIES.length)];
            double mA       = rng.nextDouble(200.0);
            double mB       = rng.nextDouble(100.0);
            int    paySz    = rng.nextInt(4) + 1;  // 1..4 longs = 8..32 bytes
            return new DataRecord(id, cat, mA, mB, paySz);
        }

        private static final String[] CATEGORIES = {
            "sensor", "transaction", "log", "metric", "trace",
            "audit", "profile", "alert", "event", "checkpoint"
        };
    }
}
