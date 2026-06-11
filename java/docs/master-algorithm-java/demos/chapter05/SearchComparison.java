package masteralgo.chapter05;

import java.util.Arrays;
import java.util.Random;

/**
 * 查找算法性能对比
 *
 * 对比线性查找、二分查找、插值查找三种方法在不同数据规模下的性能。
 * 对每个规模生成 1000 个随机目标，统计总耗时。
 *
 * 额外测试插值查找在均匀分布 vs 指数分布数据上的表现差异。
 */
public class SearchComparison {

    private static final Random RANDOM = new Random(42);
    private static final int SEARCHES = 1000; // 每次搜索 1000 个目标

    public static void main(String[] args) {
        System.out.println("============================================================");
        System.out.println("  查找算法性能对比：线性查找 vs 二分查找 vs 插值查找");
        System.out.println("============================================================\n");

        int[] sizes = {1_000, 10_000, 100_000, 1_000_000};

        // 表头
        System.out.printf("  %-12s %-16s %-16s %-16s%n",
                "数据规模", "线性查找(ms)", "二分查找(ms)", "插值查找(ms)");
        System.out.println("  " + "-".repeat(64));

        for (int n : sizes) {
            // 生成均匀分布的排序数组
            int[] data = generateUniformSortedArray(n);
            int[] targets = generateRandomTargets(n, SEARCHES);

            // 线性查找（性能太差，n >= 100000 时只测部分）
            long t1, t2, t3;
            if (n <= 100_000) {
                t1 = measureLinearSearch(data, targets);
            } else {
                t1 = -1; // 跳过
            }

            t2 = measureBinarySearch(data, targets);
            t3 = measureInterpolationSearch(data, targets);

            String linearStr = (t1 == -1) ? "跳过" : String.format("%.2f", t1 / 1_000_000.0);
            System.out.printf("  n=%-8d %-16s %-16s %-16s%n",
                    n, linearStr,
                    String.format("%.2f", t2 / 1_000_000.0),
                    String.format("%.2f", t3 / 1_000_000.0));
        }

        // ============================================================
        //  插值查找：均匀分布 vs 非均匀分布
        // ============================================================
        System.out.println("\n------------------------------------------------------------");
        System.out.println("  插值查找：均匀数据 vs 指数（非均匀）数据对比");
        System.out.println("------------------------------------------------------------\n");
        System.out.printf("  %-12s %-20s %-20s%n", "数据规模", "均匀数据(ms)", "指数数据(ms)");
        System.out.println("  " + "-".repeat(56));

        for (int n : sizes) {
            int[] uniform = generateUniformSortedArray(n);
            int[] skewed = generateSkewedSortedArray(n);
            int[] targets = generateRandomTargets(n, SEARCHES);

            long tu = measureInterpolationSearch(uniform, targets);
            long ts = measureInterpolationSearch(skewed, targets);

            System.out.printf("  n=%-8d %-20s %-20s%n", n,
                    String.format("%.2f", tu / 1_000_000.0),
                    String.format("%.2f", ts / 1_000_000.0));
        }

        System.out.println("\n------------------------------------------------------------");
        System.out.println("  结论：插值查找在均匀分布时优于二分查找，");
        System.out.println("        但数据分布不均匀时性能可能严重退化。");
        System.out.println("------------------------------------------------------------");
    }

    // ================================================================
    //  生成测试数据
    // ================================================================

    /**
     * 生成均匀分布的有序数组（等差数列）
     */
    private static int[] generateUniformSortedArray(int n) {
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = i * 2; // 步长为 2，确保有足够间隙
        }
        return arr;
    }

    /**
     * 生成指数分布的有序数组（数据聚集在前半部分）
     * 模拟 Zipf 分布或幂律分布场景
     */
    private static int[] generateSkewedSortedArray(int n) {
        int[] arr = new int[n];
        arr[0] = 0;
        // 前 80% 的数据集中在值域的 20% 范围内
        int split = (int) (n * 0.8);
        for (int i = 1; i < split; i++) {
            arr[i] = arr[i - 1] + 1; // 密集
        }
        // 后 20% 的数据分布在宽的范围内
        arr[split] = arr[split - 1] + 100;
        for (int i = split + 1; i < n; i++) {
            arr[i] = arr[i - 1] + 100; // 稀疏
        }
        return arr;
    }

    /**
     * 生成随机的目标值，保证大概率在数据范围内
     */
    private static int[] generateRandomTargets(int n, int count) {
        int[] targets = new int[count];
        int maxVal = (n - 1) * 2;
        for (int i = 0; i < count; i++) {
            targets[i] = RANDOM.nextInt(maxVal + 1);
        }
        return targets;
    }

    // ================================================================
    //  查找实现
    // ================================================================

    /** 线性查找 */
    public static int linearSearch(int[] arr, int target) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == target) return i;
        }
        return -1;
    }

    /** 二分查找 */
    public static int binarySearch(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    /** 插值查找 */
    public static int interpolationSearch(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right && target >= arr[left] && target <= arr[right]) {
            if (left == right) {
                return arr[left] == target ? left : -1;
            }
            // 插值公式：根据目标值在值域中的比例估算下标
            int pos = left + ((target - arr[left]) * (right - left))
                            / (arr[right] - arr[left]);
            // 防止越界
            if (pos < left || pos > right) return -1;
            if (arr[pos] == target) return pos;
            if (arr[pos] < target) left = pos + 1;
            else right = pos - 1;
        }
        return -1;
    }

    // ================================================================
    //  性能测量
    // ================================================================

    private static long measureLinearSearch(int[] data, int[] targets) {
        long start = System.nanoTime();
        for (int target : targets) {
            linearSearch(data, target);
        }
        return System.nanoTime() - start;
    }

    private static long measureBinarySearch(int[] data, int[] targets) {
        long start = System.nanoTime();
        for (int target : targets) {
            binarySearch(data, target);
        }
        return System.nanoTime() - start;
    }

    private static long measureInterpolationSearch(int[] data, int[] targets) {
        long start = System.nanoTime();
        for (int target : targets) {
            interpolationSearch(data, target);
        }
        return System.nanoTime() - start;
    }
}