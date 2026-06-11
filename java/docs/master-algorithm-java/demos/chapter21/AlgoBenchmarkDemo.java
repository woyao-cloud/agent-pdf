package masteralgo.chapter21;

import java.util.*;
import java.util.stream.IntStream;

/**
 * 算法微基准测试演示
 *
 * 对比场景：
 * 1. HashMap 查找 vs TreeMap 查找 vs ArrayList 线性搜索
 * 2. StringBuilder 拼接 vs String 直接拼接
 * 3. Stream API 求和 vs 传统 for 循环求和
 *
 * 每个测试包含：预热阶段 → 测量阶段 → 统计输出（均值、最小值、最大值、标准差）
 */
public class AlgoBenchmarkDemo {

    // 预热和测量参数
    private static final int WARMUP_ITERATIONS = 5_000;
    private static final int MEASURE_ITERATIONS = 10_000;

    /**
     * 基准测试结果
     */
    static class BenchmarkResult {
        final String name;
        final long[] samples;
        final long warmupNanos;

        BenchmarkResult(String name, long[] samples, long warmupNanos) {
            this.name = name;
            this.samples = samples;
            this.warmupNanos = warmupNanos;
        }

        double mean() {
            return Arrays.stream(samples).average().orElse(0);
        }

        long min() {
            return Arrays.stream(samples).min().orElse(0);
        }

        long max() {
            return Arrays.stream(samples).max().orElse(0);
        }

        double stddev() {
            double m = mean();
            double sum = 0;
            for (long s : samples) sum += (s - m) * (s - m);
            return Math.sqrt(sum / samples.length);
        }

        void print() {
            System.out.printf("  %-45s | 均值 %8.2f ns | 最小 %8d | 最大 %10d | 标准差 %8.2f | 预热 %d次%n",
                name, mean(), min(), max(), stddev(), warmupNanos / 1_000_000);
        }

        /** 以第一个结果为基准，计算相对速度 */
        static void compareResults(List<BenchmarkResult> results) {
            if (results.isEmpty()) return;
            double baseline = results.get(0).mean();
            if (baseline == 0) baseline = 1;
            System.out.println("\n  性能对比（以第一个为基准 1.00x）：");
            System.out.println("  " + "-".repeat(65));
            for (int i = 0; i < results.size(); i++) {
                double ratio = results.get(i).mean() / baseline;
                String bar = "█".repeat((int) Math.min(ratio * 10, 50));
                System.out.printf("  %-30s %7.2f x  %s%n",
                    results.get(i).name, ratio, bar);
            }
            System.out.println();
        }
    }

    // ============================================================
    //  测试 1：数据结构查找对比
    // ============================================================

    static BenchmarkResult benchmarkHashMapLookup(int size, int queries) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;

        // 准备数据
        Map<Integer, Integer> map = new HashMap<>(size);
        Random rnd = new Random(42);
        int[] keys = new int[queries];
        for (int i = 0; i < size; i++) map.put(i, i);
        for (int i = 0; i < queries; i++) keys[i] = rnd.nextInt(size);

        // 预热
        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS; i++) {
            map.get(keys[i % queries]);
        }
        warmupNanos = System.nanoTime() - ws;

        // 测量
        for (int i = 0; i < MEASURE_ITERATIONS; i++) {
            long start = System.nanoTime();
            map.get(keys[i % queries]);
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("HashMap.get() (size=" + size + ")", samples, warmupNanos);
    }

    static BenchmarkResult benchmarkTreeMapLookup(int size, int queries) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;

        TreeMap<Integer, Integer> map = new TreeMap<>();
        Random rnd = new Random(42);
        int[] keys = new int[queries];
        for (int i = 0; i < size; i++) map.put(i, i);
        for (int i = 0; i < queries; i++) keys[i] = rnd.nextInt(size);

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS; i++) {
            map.get(keys[i % queries]);
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS; i++) {
            long start = System.nanoTime();
            map.get(keys[i % queries]);
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("TreeMap.get() (size=" + size + ")", samples, warmupNanos);
    }

    static BenchmarkResult benchmarkArrayListLookup(int size, int queries) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;

        List<Integer> list = new ArrayList<>(size);
        Random rnd = new Random(42);
        int[] keys = new int[queries];
        int[] targets = new int[queries];
        for (int i = 0; i < size; i++) list.add(i);
        for (int i = 0; i < queries; i++) {
            keys[i] = rnd.nextInt(size);
            targets[i] = rnd.nextInt(size); // 搜索目标不一定存在
        }

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS; i++) {
            list.contains(keys[i % queries]); // 线性搜索
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS; i++) {
            long start = System.nanoTime();
            list.contains(keys[i % queries]);
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("ArrayList.contains() (size=" + size + ")", samples, warmupNanos);
    }

    // ============================================================
    //  测试 2：字符串拼接对比
    // ============================================================

    static BenchmarkResult benchmarkStringConcat(int pieces) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;
        String[] tokens = new String[pieces];
        for (int i = 0; i < pieces; i++) tokens[i] = "token" + i;

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS / 10; i++) {
            String s = "";
            for (int j = 0; j < pieces; j++) s += tokens[j];
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS / 10; i++) {
            long start = System.nanoTime();
            String s = "";
            for (int j = 0; j < pieces; j++) s += tokens[j];
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("String + concat (pieces=" + pieces + ")", samples, warmupNanos);
    }

    static BenchmarkResult benchmarkStringBuilder(int pieces) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;
        String[] tokens = new String[pieces];
        for (int i = 0; i < pieces; i++) tokens[i] = "token" + i;

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS / 10; i++) {
            StringBuilder sb = new StringBuilder();
            for (int j = 0; j < pieces; j++) sb.append(tokens[j]);
            sb.toString();
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS / 10; i++) {
            long start = System.nanoTime();
            StringBuilder sb = new StringBuilder(pieces * 6);
            for (int j = 0; j < pieces; j++) sb.append(tokens[j]);
            sb.toString();
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("StringBuilder.append() (pieces=" + pieces + ")", samples, warmupNanos);
    }

    // ============================================================
    //  测试 3：Stream API 对比传统循环
    // ============================================================

    static BenchmarkResult benchmarkTraditionalLoop(int size) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;
        int[] data = new Random(42).ints(size, 0, 1000).toArray();

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS / 10; i++) {
            long sum = 0;
            for (int v : data) sum += v;
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS / 10; i++) {
            long start = System.nanoTime();
            long sum = 0;
            for (int v : data) sum += v;
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("传统 for 循环求和 (size=" + size + ")", samples, warmupNanos);
    }

    static BenchmarkResult benchmarkStreamSum(int size) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;
        int[] data = new Random(42).ints(size, 0, 1000).toArray();

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS / 10; i++) {
            long sum = IntStream.of(data).asLongStream().sum();
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS / 10; i++) {
            long start = System.nanoTime();
            long sum = IntStream.of(data).asLongStream().sum();
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("IntStream.sum() (size=" + size + ")", samples, warmupNanos);
    }

    static BenchmarkResult benchmarkParallelStreamSum(int size) {
        long[] samples = new long[MEASURE_ITERATIONS];
        long warmupNanos = 0;
        int[] data = new Random(42).ints(size, 0, 1000).toArray();

        long ws = System.nanoTime();
        for (int i = 0; i < WARMUP_ITERATIONS / 10; i++) {
            long sum = IntStream.of(data).asLongStream().parallel().sum();
        }
        warmupNanos = System.nanoTime() - ws;

        for (int i = 0; i < MEASURE_ITERATIONS / 10; i++) {
            long start = System.nanoTime();
            long sum = IntStream.of(data).asLongStream().parallel().sum();
            samples[i] = System.nanoTime() - start;
        }
        return new BenchmarkResult("parallelStream.sum() (size=" + size + ")", samples, warmupNanos);
    }

    // ============================================================
    //  运行一组测试并输出结果
    // ============================================================

    static void runGroup(String title, BenchmarkResult... results) {
        System.out.println("\n" + "=".repeat(100));
        System.out.println(title);
        System.out.println("=".repeat(100));
        List<BenchmarkResult> list = new ArrayList<>();
        for (BenchmarkResult r : results) {
            r.print();
            list.add(r);
        }
        if (results.length > 1) {
            BenchmarkResult.compareResults(list);
        }
    }

    // ============================================================
    //  主程序
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 算法微基准测试演示 ===\n");
        System.out.println("配置: 预热 " + WARMUP_ITERATIONS + " 次, 测量 " + MEASURE_ITERATIONS + " 次\n");

        System.out.println("注意：");
        System.out.println("- 微基准测试的结果受 JIT 编译、GC、系统负载等多因素影响");
        System.out.println("- 单次运行仅供参考，实际评估应取多次运行的中位数");
        System.out.println("- warmup 是让 JIT 充分编译，消除启动偏差");
        System.out.println();

        // === 测试 1：数据结构查找对比 ===
        int dataSize = 10_000;
        int queries = 1000;

        BenchmarkResult r1 = benchmarkHashMapLookup(dataSize, queries);
        BenchmarkResult r2 = benchmarkTreeMapLookup(dataSize, queries);
        BenchmarkResult r3 = benchmarkArrayListLookup(dataSize, queries);
        runGroup("测试 1：数据结构查找性能对比 (size=" + dataSize + ", queries=" + queries + ")", r1, r2, r3);

        // === 测试 2：字符串拼接对比 ===
        int pieces = 50;
        BenchmarkResult r4 = benchmarkStringConcat(pieces);
        BenchmarkResult r5 = benchmarkStringBuilder(pieces);
        runGroup("测试 2：字符串拼接性能对比 (pieces=" + pieces + ")", r4, r5);

        // === 测试 3：Stream API vs 传统循环 ===
        int streamSize = 10_000;
        BenchmarkResult r6 = benchmarkTraditionalLoop(streamSize);
        BenchmarkResult r7 = benchmarkStreamSum(streamSize);
        BenchmarkResult r8 = benchmarkParallelStreamSum(streamSize);
        runGroup("测试 3：Stream API vs 传统循环 (size=" + streamSize + ")", r6, r7, r8);

        // === 结果讨论 ===
        System.out.println("\n" + "=".repeat(100));
        System.out.println("结果讨论");
        System.out.println("=".repeat(100));
        System.out.println("""
            1. HashMap vs TreeMap vs ArrayList
               - HashMap.get() 是 O(1)，通常最快
               - TreeMap.get() 是 O(logn)，红黑树查找
               - ArrayList.contains() 是 O(n)，线性搜索
               - 结论：查找密集场景优先用 HashMap

            2. String + vs StringBuilder
               - String + 每次拼接创建新对象，O(n²)
               - StringBuilder 原地修改，O(n)
               - 结论：循环拼接一定用 StringBuilder

            3. for 循环 vs Stream vs parallelStream
               - for 循环通常最快，开销最小
               - Stream 增加 lambda 和 Spliterator 开销
               - parallelStream 在数据量大时有优势（>10K）
               - 结论：性能关键路径用 for，可读性优先用 stream

            注意：
            - 微基准测试的绝对数字意义有限，相对比较更有参考价值
            - JIT 编译后代码性能可能与解释执行阶段差异很大
            - 实际生产环境的性能表现应以真实负载下的 profiling 为准
            """);
    }
}