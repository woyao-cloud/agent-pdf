package masteralgo.chapter18;

import java.util.*;
import java.util.function.Function;

/**
 * 大数据草图算法演示
 *
 * 功能：
 * 1. Bloom Filter（布隆过滤器）——add、mightContain、假阳性率测试
 * 2. Count-Min Sketch——频率估计
 * 3. 蓄水池采样（Reservoir Sampling）——从流中随机抽样
 */
public class SketchAlgorithms {

    // ============================================================
    //  1. Bloom Filter 布隆过滤器
    // ============================================================

    static class BloomFilter {
        private final BitSet bits;
        private final int m;          // bitset 大小
        private final int k;          // 哈希函数个数
        private final Function<String, Integer>[] hashFuncs;

        @SuppressWarnings("unchecked")
        BloomFilter(int m, int k) {
            this.m = m;
            this.k = k;
            this.bits = new BitSet(m);
            this.hashFuncs = new Function[k];
            Random rng = new Random(42);
            for (int i = 0; i < k; i++) {
                int seed = rng.nextInt();
                hashFuncs[i] = s -> {
                    long h = seed;
                    for (char c : s.toCharArray()) {
                        h = h * 31 + c;
                        h ^= (h >>> 16);
                    }
                    return Math.floorMod((int) h, m);
                };
            }
        }

        void add(String s) {
            for (int i = 0; i < k; i++) {
                bits.set(hashFuncs[i].apply(s));
            }
        }

        boolean mightContain(String s) {
            for (int i = 0; i < k; i++) {
                if (!bits.get(hashFuncs[i].apply(s))) return false;
            }
            return true;
        }

        /** 计算假阳性率的理论值 */
        static double expectedFalsePositiveRate(int n, int m, int k) {
            return Math.pow(1 - Math.exp(-(double) k * n / m), k);
        }
    }

    // ============================================================
    //  2. Count-Min Sketch 频率估计
    // ============================================================

    static class CountMinSketch {
        private final int d;     // 行数（哈希函数个数）
        private final int w;     // 列数（每行计数器数）
        private final int[][] table;
        private final Random rng;
        private long total;      // 总计数（用于归一化）

        CountMinSketch(int d, int w) {
            this.d = d;
            this.w = w;
            this.table = new int[d][w];
            this.rng = new Random(42);
            this.total = 0;
        }

        private int hash(String s, int seed) {
            long h = seed;
            for (char c : s.toCharArray()) {
                h = h * 31 + c;
                h ^= (h >>> 16);
            }
            return Math.floorMod((int) h, w);
        }

        void add(String s, int count) {
            total += count;
            int[] seeds = {17, 37, 73, 97}; // 固定种子
            for (int i = 0; i < d; i++) {
                int col = hash(s, seeds[i % seeds.length] + i);
                table[i][col] += count;
            }
        }

        /** 估计某个元素的频率 */
        int estimate(String s) {
            int[] seeds = {17, 37, 73, 97};
            int minVal = Integer.MAX_VALUE;
            for (int i = 0; i < d; i++) {
                int col = hash(s, seeds[i % seeds.length] + i);
                minVal = Math.min(minVal, table[i][col]);
            }
            return minVal;
        }
    }

    // ============================================================
    //  3. 蓄水池采样（Reservoir Sampling）
    // ============================================================

    static class ReservoirSampler<T> {
        private final List<T> reservoir;
        private final int k;
        private long seen;          // 已见元素计数
        private final Random rng;

        ReservoirSampler(int k) {
            this.k = k;
            this.reservoir = new ArrayList<>(k);
            this.seen = 0;
            this.rng = new Random(42);
        }

        /** 处理流中的下一个元素 */
        void feed(T item) {
            seen++;
            if (reservoir.size() < k) {
                reservoir.add(item);
            } else {
                // 以 k/seen 的概率替换蓄水池中的某个元素
                int j = rng.nextInt((int) seen);
                if (j < k) {
                    reservoir.set(j, item);
                }
            }
        }

        List<T> sample() {
            return new ArrayList<>(reservoir);
        }

        long getSeen() { return seen; }
    }

    // ============================================================
    //  4. 测试
    // ============================================================

    public static void main(String[] args) {
        testBloomFilter();
        testCountMinSketch();
        testReservoirSampling();
        System.out.println("\n所有测试通过 ✓");
    }

    static void testBloomFilter() {
        System.out.println("=== Bloom Filter 测试 ===");

        // 参数配置
        int n = 1000;       // 插入元素个数
        int m = 8000;       // bitset 大小（10 bits / element）
        int k = (int) Math.round((double) m / n * Math.log(2)); // 最优 k ≈ 5-6

        BloomFilter bf = new BloomFilter(m, k);
        Set<String> inserted = new HashSet<>();
        Random rng = new Random(123);

        // 插入 n 个随机字符串
        for (int i = 0; i < n; i++) {
            String s = "key_" + rng.nextInt(100000);
            inserted.add(s);
            bf.add(s);
        }

        // 检测插入的元素是否全命中
        int falseMiss = 0;
        for (String s : inserted) {
            if (!bf.mightContain(s)) falseMiss++;
        }
        System.out.printf("插入 %d 个元素，误漏: %d (应为 0)\n", n, falseMiss);
        assert falseMiss == 0 : "Bloom Filter 产生了假阴性！";

        // 测试假阳性率：检测未插入的元素
        int trials = 10000;
        int falsePositive = 0;
        for (int i = 0; i < trials; i++) {
            String s = "test_" + rng.nextInt(1000000);
            if (!inserted.contains(s) && bf.mightContain(s)) {
                falsePositive++;
            }
        }
        double fpRate = (double) falsePositive / trials;
        double expected = BloomFilter.expectedFalsePositiveRate(n, m, k);

        System.out.printf("假阳性率: %.4f (理论: %.4f)\n", fpRate, expected);
        System.out.println();
    }

    static void testCountMinSketch() {
        System.out.println("=== Count-Min Sketch 测试 ===");

        CountMinSketch cms = new CountMinSketch(4, 512);
        Map<String, Integer> groundTruth = new HashMap<>();
        Random rng = new Random(456);

        // 插入 2000 次，分布服从 Zipf 特征（少量高频，大量低频）
        for (int i = 0; i < 2000; i++) {
            // 80% 的数据集中在 20% 的 key 上
            String s;
            if (rng.nextDouble() < 0.2) {
                s = "hot_" + rng.nextInt(20); // 热门 key
            } else {
                s = "cold_" + rng.nextInt(500); // 冷门 key
            }
            int cnt = 1;
            groundTruth.merge(s, cnt, Integer::sum);
            cms.add(s, cnt);
        }

        // 验证估计值
        double totalError = 0;
        int maxError = 0;
        int worstKey = -1;
        for (Map.Entry<String, Integer> e : groundTruth.entrySet()) {
            int actual = e.getValue();
            int estimated = cms.estimate(e.getKey());
            int err = estimated - actual; // CMS 总是高估，所以 err ≥ 0
            totalError += err;
            maxError = Math.max(maxError, err);
        }

        int n = groundTruth.size();
        double avgError = totalError / n;
        System.out.printf("共 %d 个不同 key，平均估计误差: %.2f，最大误差: %d\n",
            n, avgError, maxError);
        System.out.println("  (Count-Min Sketch 总是高估，误差可控)");
        assert maxError >= 0 : "Count-Min Sketch 结果不合理";
        System.out.println();
    }

    static void testReservoirSampling() {
        System.out.println("=== 蓄水池采样测试 ===");

        int k = 10;
        int streamSize = 10000;
        ReservoirSampler<Integer> sampler = new ReservoirSampler<>(k);

        // 模拟数据流 1..10000
        for (int i = 1; i <= streamSize; i++) {
            sampler.feed(i);
        }

        List<Integer> sample = sampler.sample();
        System.out.printf("从 %,d 个元素中采样 %d 个:\n", streamSize, sample.size());
        System.out.print("  样本: ");
        sample.forEach(v -> System.out.print(v + " "));
        System.out.println();

        // 验证：样本大小正确
        assert sample.size() == k : "蓄水池采样大小不正确";

        // 验证：所有元素在流中的概率近似均匀
        // 多次运行独立采样，统计各元素出现次数
        int runs = 100;
        Map<Integer, Integer> freq = new HashMap<>();
        for (int r = 0; r < runs; r++) {
            ReservoirSampler<Integer> rs = new ReservoirSampler<>(k);
            for (int i = 1; i <= streamSize; i++) {
                rs.feed(i);
            }
            for (int v : rs.sample()) {
                freq.merge(v, 1, Integer::sum);
            }
        }

        // 理论上每个元素被选中的总次数 ≈ runs * k / streamSize = 100 * 10 / 10000 = 0.1
        double expectedFreq = (double) runs * k / streamSize;
        double actualAvg = freq.values().stream().mapToInt(Integer::intValue).average().orElse(0);
        System.out.printf("  理论平均频次: %.2f, 实际平均: %.2f\n", expectedFreq, actualAvg);
        System.out.println("  (多次运行后，各元素出现频率应接近均匀)");
    }
}