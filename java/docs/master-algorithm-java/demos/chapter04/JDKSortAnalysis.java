package masteralgo.chapter04;

import java.util.Arrays;
import java.util.Random;

/**
 * JDK 排序行为分析演示
 *
 * 对比分析：
 * 1. Arrays.sort(int[]) —— 基本类型排序（Dual-Pivot QuickSort）
 * 2. Arrays.sort(Integer[]) —— 引用类型排序（TimSort）
 * 3. Arrays.sort() 在部分有序数据上的自适应优势（TimSort 特性）
 * 4. Arrays.parallelSort() 在大数组上的并行加速效果
 */
public class JDKSortAnalysis {

    private static final Random RANDOM = new Random(42);

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  JDK 排序源码行为分析");
        System.out.println("================================================");

        // ============================================================
        // 实验一：基本类型 vs 引用类型排序
        // 对比 Arrays.sort(int[]) 和 Arrays.sort(Integer[])
        // 底层分别使用 Dual-Pivot QuickSort 和 TimSort
        // ============================================================
        System.out.println("\n===== 实验一：基本类型 vs 引用类型排序 =====");
        int N = 100_000;

        // 准备相同的随机数据
        int[] primitiveData = generateRandomIntArray(N);
        Integer[] objectData = toBoxedArray(primitiveData.clone());

        // 对基本类型排序
        int[] p1 = primitiveData.clone();
        long t1 = System.nanoTime();
        Arrays.sort(p1);
        long t1End = System.nanoTime();
        System.out.printf("Arrays.sort(int[%d]):        %8.2f ms  (Dual-Pivot QuickSort)%n",
                N, (t1End - t1) / 1_000_000.0);

        // 对引用类型排序
        Integer[] o1 = objectData.clone();
        long t2 = System.nanoTime();
        Arrays.sort(o1);
        long t2End = System.nanoTime();
        System.out.printf("Arrays.sort(Integer[%d]):   %8.2f ms  (TimSort)%n",
                N, (t2End - t2) / 1_000_000.0);

        // 计算比值（引用类型通常比基本类型慢 1.5~3 倍，因为需要拆箱比较 + TimSort 额外内存操作）
        double ratio = (double) (t2End - t2) / (t1End - t1);
        System.out.printf("  比值: 引用类型 / 基本类型 ≈ %.2f 倍%n", ratio);
        System.out.println("  原因：Integer 对象内存开销大，比较需要拆箱，TimSort 需要额外空间");

        // ============================================================
        // 实验二：TimSort 在部分有序数据上的自适应优势
        //
        // 对完全随机和部分有序数据分别排序，观察 TimSort 的适应性
        // TimSort 的核心优势就是识别天然有序的 runs
        // ============================================================
        System.out.println("\n===== 实验二：TimSort 对部分有序数据的自适应 =====");

        int M = 1_000_000;

        // 完全随机数据
        Integer[] randomData = toBoxedArray(generateRandomIntArray(M));

        // 近乎有序数据：对有序数组做 0.1% 的随机交换
        Integer[] nearlySortedData = new Integer[M];
        for (int i = 0; i < M; i++) nearlySortedData[i] = i;
        int swaps = M / 1000;
        for (int k = 0; k < swaps; k++) {
            int i = RANDOM.nextInt(M);
            int j = RANDOM.nextInt(M);
            Integer tmp = nearlySortedData[i];
            nearlySortedData[i] = nearlySortedData[j];
            nearlySortedData[j] = tmp;
        }

        // 带少量末尾乱序的数据（模拟实际工程中"追加一批数据后重新排序"的场景）
        Integer[] tailUnsortedData = new Integer[M];
        for (int i = 0; i < M; i++) tailUnsortedData[i] = i;
        // 打乱最后 1% 的元素
        for (int i = M - M / 100; i < M; i++) {
            tailUnsortedData[i] = RANDOM.nextInt(M);
        }

        // 测试随机数据
        Integer[] r1 = randomData.clone();
        long rt1 = System.nanoTime();
        Arrays.sort(r1);
        long rt1End = System.nanoTime();
        System.out.printf("完全随机 (n=%d):            %8.2f ms%n",
                M, (rt1End - rt1) / 1_000_000.0);

        // 测试近乎有序数据
        Integer[] r2 = nearlySortedData.clone();
        long rt2 = System.nanoTime();
        Arrays.sort(r2);
        long rt2End = System.nanoTime();
        System.out.printf("近乎有序 (n=%d, 0.1%%乱序): %8.2f ms  ← 自适应优势%n",
                M, (rt2End - rt2) / 1_000_000.0);

        // 测试尾部乱序
        Integer[] r3 = tailUnsortedData.clone();
        long rt3 = System.nanoTime();
        Arrays.sort(r3);
        long rt3End = System.nanoTime();
        System.out.printf("尾部乱序 (n=%d, 1%%乱序):    %8.2f ms  ← 仍保持高效%n",
                M, (rt3End - rt3) / 1_000_000.0);

        // 近乎有序 vs 完全随机的加速比
        double speedup = (double) (rt1End - rt1) / (rt2End - rt2);
        System.out.printf("  加速比: 近乎有序 / 完全随机 ≈ %.1f 倍%n", speedup);
        System.out.println("  原因：TimSort 能直接利用数据中已存在的有序片段 (runs)，大幅减少合并开销");

        // ============================================================
        // 实验三：Arrays.sort() vs Arrays.parallelSort()
        //
        // 在大型数组上测试并行排序的优势
        // parallelSort() 使用 Fork/Join 框架并行排序，数据量越大优势越明显
        // ============================================================
        System.out.println("\n===== 实验三：串行 vs 并行排序（parallelSort）=====");

        // 测试不同规模
        int[] sizes = {100_000, 1_000_000, 10_000_000};

        for (int size : sizes) {
            System.out.printf("%n--- n=%d ---%n", size);
            int[] data = generateRandomIntArray(size);

            // 串行排序
            int[] serialData = data.clone();
            long s1 = System.nanoTime();
            Arrays.sort(serialData);
            long s1End = System.nanoTime();
            double serialMs = (s1End - s1) / 1_000_000.0;

            // 并行排序
            int[] parallelData = data.clone();
            long s2 = System.nanoTime();
            Arrays.parallelSort(parallelData);
            long s2End = System.nanoTime();
            double parallelMs = (s2End - s2) / 1_000_000.0;

            System.out.printf("  Arrays.sort():        %8.2f ms%n", serialMs);
            System.out.printf("  Arrays.parallelSort(): %8.2f ms%n", parallelMs);
            if (parallelMs > 0) {
                System.out.printf("  加速比: %.2f 倍%n", serialMs / parallelMs);
            }

            // 验证正确性
            boolean ok = Arrays.equals(serialData, parallelData);
            System.out.println("  结果一致: " + (ok ? "✔" : "✘ 不一致！"));
        }

        // ============================================================
        // 总结
        // ============================================================
        System.out.println("\n================================================");
        System.out.println("  实验总结");
        System.out.println("================================================");
        System.out.println("1. 基本类型用 Dual-Pivot QuickSort，引用类型用 TimSort");
        System.out.println("2. TimSort 对部分有序数据有显著的自适应加速效果");
        System.out.println("3. parallelSort() 在大数组（≥1M）上有明显优势，多核环境推荐使用");
        System.out.println("4. 小数组（< 8192）parallelSort 会退化为串行，不必强求");
    }

    // ================================================================
    // 辅助方法
    // ================================================================

    private static int[] generateRandomIntArray(int size) {
        int[] arr = new int[size];
        for (int i = 0; i < size; i++) {
            arr[i] = RANDOM.nextInt(Integer.MAX_VALUE);
        }
        return arr;
    }

    private static Integer[] toBoxedArray(int[] arr) {
        Integer[] result = new Integer[arr.length];
        for (int i = 0; i < arr.length; i++) {
            result[i] = arr[i];
        }
        return result;
    }
}