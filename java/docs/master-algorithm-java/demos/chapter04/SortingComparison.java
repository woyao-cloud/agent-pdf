package masteralgo.chapter04;

import java.util.Arrays;
import java.util.Random;

/**
 * 排序算法性能对比演示
 *
 * 实现所有经典排序算法，对随机数据和近乎有序数据分别测试，
 * 从 n=1000, 10000, 100000 三个规模维度对比性能。
 *
 * 使用 System.nanoTime() 高精度计时。
 */
public class SortingComparison {

    private static final Random RANDOM = new Random(42);

    // ================================================================
    // 1. 冒泡排序（带提前终止优化）
    // ================================================================
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int tmp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = tmp;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
    }

    // ================================================================
    // 2. 快速排序（三数取中 pivot，提供 Lomuto 和 Hoare 两种分区）
    // ================================================================

    /**
     * 三数取中：选择首、中、尾三个元素的中位数作为 pivot
     */
    private static int medianOf3(int[] arr, int low, int high) {
        int mid = low + (high - low) / 2;
        if (arr[low] > arr[mid]) swap(arr, low, mid);
        if (arr[low] > arr[high]) swap(arr, low, high);
        if (arr[mid] > arr[high]) swap(arr, mid, high);
        return mid;
    }

    // ----- Lomuto 分区 -----
    public static void quickSortLomuto(int[] arr) {
        quickSortLomuto(arr, 0, arr.length - 1);
    }

    private static void quickSortLomuto(int[] arr, int low, int high) {
        if (low >= high) return;

        // 小数组使用插入排序（优化）
        if (high - low < 10) {
            insertionSortRange(arr, low, high);
            return;
        }

        int pivotIdx = medianOf3(arr, low, high);
        swap(arr, pivotIdx, high); // 将 pivot 交换到末尾（Lomuto 习惯）
        int pi = lomutoPartition(arr, low, high);
        quickSortLomuto(arr, low, pi - 1);
        quickSortLomuto(arr, pi + 1, high);
    }

    private static int lomutoPartition(int[] arr, int low, int high) {
        int pivot = arr[high];
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (arr[j] <= pivot) {
                i++;
                swap(arr, i, j);
            }
        }
        swap(arr, i + 1, high);
        return i + 1;
    }

    // ----- Hoare 分区 -----
    public static void quickSortHoare(int[] arr) {
        quickSortHoare(arr, 0, arr.length - 1);
    }

    private static void quickSortHoare(int[] arr, int low, int high) {
        if (low >= high) return;

        if (high - low < 10) {
            insertionSortRange(arr, low, high);
            return;
        }

        int pivotIdx = medianOf3(arr, low, high);
        int pivot = arr[pivotIdx];
        int i = low - 1;
        int j = high + 1;
        while (true) {
            do { i++; } while (arr[i] < pivot);
            do { j--; } while (arr[j] > pivot);
            if (i >= j) break;
            swap(arr, i, j);
        }
        quickSortHoare(arr, low, j);
        quickSortHoare(arr, j + 1, high);
    }

    // ----- 小数组插入排序（供快速排序使用）-----
    private static void insertionSortRange(int[] arr, int low, int high) {
        for (int i = low + 1; i <= high; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= low && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }

    // ================================================================
    // 3. 直接插入排序
    // ================================================================
    public static void insertionSort(int[] arr) {
        for (int i = 1; i < arr.length; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }

    // ================================================================
    // 4. 希尔排序（Knuth 增量序列）
    // ================================================================
    public static void shellSort(int[] arr) {
        int n = arr.length;
        int gap = 1;
        while (gap < n / 3) gap = gap * 3 + 1;

        while (gap >= 1) {
            for (int i = gap; i < n; i++) {
                int key = arr[i];
                int j = i;
                while (j >= gap && arr[j - gap] > key) {
                    arr[j] = arr[j - gap];
                    j -= gap;
                }
                arr[j] = key;
            }
            gap /= 3;
        }
    }

    // ================================================================
    // 5. 简单选择排序
    // ================================================================
    public static void selectionSort(int[] arr) {
        for (int i = 0; i < arr.length - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < arr.length; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            if (minIdx != i) {
                swap(arr, i, minIdx);
            }
        }
    }

    // ================================================================
    // 6. 堆排序
    // ================================================================
    public static void heapSort(int[] arr) {
        int n = arr.length;

        // 建堆：从最后一个非叶子节点开始下沉
        for (int i = n / 2 - 1; i >= 0; i--) {
            siftDown(arr, n, i);
        }

        // 排序：反复将堆顶（最大值）交换到末尾
        for (int i = n - 1; i > 0; i--) {
            swap(arr, 0, i);
            siftDown(arr, i, 0);
        }
    }

    private static void siftDown(int[] arr, int n, int i) {
        while (true) {
            int largest = i;
            int left = 2 * i + 1;
            int right = 2 * i + 2;

            if (left < n && arr[left] > arr[largest]) largest = left;
            if (right < n && arr[right] > arr[largest]) largest = right;
            if (largest == i) break;

            swap(arr, i, largest);
            i = largest;
        }
    }

    // ================================================================
    // 7. 归并排序（自顶向下）
    // ================================================================
    public static void mergeSort(int[] arr) {
        if (arr.length < 2) return;
        int[] temp = new int[arr.length];
        mergeSort(arr, temp, 0, arr.length - 1);
    }

    private static void mergeSort(int[] arr, int[] temp, int left, int right) {
        if (left >= right) return;
        int mid = left + (right - left) / 2;
        mergeSort(arr, temp, left, mid);
        mergeSort(arr, temp, mid + 1, right);
        merge(arr, temp, left, mid, right);
    }

    private static void merge(int[] arr, int[] temp, int left, int mid, int right) {
        System.arraycopy(arr, left, temp, left, right - left + 1);
        int i = left;
        int j = mid + 1;
        int k = left;
        while (i <= mid && j <= right) {
            if (temp[i] <= temp[j]) {
                arr[k++] = temp[i++];
            } else {
                arr[k++] = temp[j++];
            }
        }
        while (i <= mid) arr[k++] = temp[i++];
        while (j <= right) arr[k++] = temp[j++];
    }

    // ================================================================
    // 8. 计数排序（非负整数，已知值域）
    // ================================================================
    public static void countingSort(int[] arr) {
        if (arr.length == 0) return;

        int max = arr[0], min = arr[0];
        for (int v : arr) {
            if (v > max) max = v;
            if (v < min) min = v;
        }
        int range = max - min + 1;

        int[] count = new int[range];
        for (int v : arr) count[v - min]++;

        for (int i = 1; i < range; i++) count[i] += count[i - 1];

        int[] output = new int[arr.length];
        for (int i = arr.length - 1; i >= 0; i--) {
            int idx = --count[arr[i] - min];
            output[idx] = arr[i];
        }

        System.arraycopy(output, 0, arr, 0, arr.length);
    }

    // ================================================================
    // 9. 基数排序（LSD，十进制位）
    // ================================================================
    public static void radixSort(int[] arr) {
        if (arr.length == 0) return;

        // 处理负数：整体偏移到非负数
        int min = arr[0];
        for (int v : arr) if (v < min) min = v;
        if (min < 0) {
            int[] copy = arr.clone();
            for (int i = 0; i < arr.length; i++) arr[i] -= min;
            radixSortLSD(arr);
            for (int i = 0; i < arr.length; i++) arr[i] += min;
        } else {
            radixSortLSD(arr);
        }
    }

    private static void radixSortLSD(int[] arr) {
        int max = arr[0];
        for (int v : arr) if (v > max) max = v;

        for (int exp = 1; max / exp > 0; exp *= 10) {
            countingSortByDigit(arr, exp);
        }
    }

    private static void countingSortByDigit(int[] arr, int exp) {
        int n = arr.length;
        int[] output = new int[n];
        int[] count = new int[10];

        for (int v : arr) count[(v / exp) % 10]++;
        for (int i = 1; i < 10; i++) count[i] += count[i - 1];

        for (int i = n - 1; i >= 0; i--) {
            int digit = (arr[i] / exp) % 10;
            output[--count[digit]] = arr[i];
        }

        System.arraycopy(output, 0, arr, 0, n);
    }

    // ================================================================
    // 辅助工具
    // ================================================================
    private static void swap(int[] arr, int i, int j) {
        int tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    /**
     * 对数组正确性验证
     */
    private static boolean isSorted(int[] arr) {
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] < arr[i - 1]) return false;
        }
        return true;
    }

    /**
     * 生成随机整数数组，值范围 [0, bound)
     */
    private static int[] generateRandom(int size, int bound) {
        int[] arr = new int[size];
        for (int i = 0; i < size; i++) {
            arr[i] = RANDOM.nextInt(bound);
        }
        return arr;
    }

    /**
     * 生成近乎有序的数组（少量随机扰动）
     */
    private static int[] generateNearlySorted(int size) {
        int[] arr = new int[size];
        for (int i = 0; i < size; i++) arr[i] = i;
        // 交换 1% 的相邻元素制造少量无序
        int swaps = size / 100;
        for (int k = 0; k < swaps; k++) {
            int i = RANDOM.nextInt(size - 1);
            swap(arr, i, i + 1);
        }
        return arr;
    }

    // ================================================================
    // 计时与测试
    // ================================================================

    /**
     * 运行单个排序算法并计时
     *
     * @param name     算法名称
     * @param sorter   排序函数（接受 int[] 并就地排序）
     * @param original 原始数据（会被复制一份交给排序函数）
     * @return 耗时（纳秒），如果排序结果错误返回 -1
     */
    private static long runOnce(String name, java.util.function.Consumer<int[]> sorter,
                                int[] original) {
        int[] copy = original.clone();
        long start = System.nanoTime();
        sorter.accept(copy);
        long elapsed = System.nanoTime() - start;
        if (!isSorted(copy)) {
            System.out.printf("  [错误] %s 排序结果不正确！%n", name);
            return -1;
        }
        return elapsed;
    }

    /**
     * 对指定规模和类型的数据运行所有排序算法
     */
    private static void testGroup(String label, int size, int[] data) {
        System.out.printf("%n========== %s (n=%d) ==========%n", label, size);

        // 对于大规模数据跳过 O(n²) 算法（n≥10000 时不跑冒泡和选择排序）
        boolean skipSlow = size >= 10000;

        // 定义所有要测试的排序算法
        // 使用数组存储名称和函数对
        String[] names;
        java.util.function.Consumer<int[]>[] sorters;

        // 对于小规模 + 值域很小的情况，所有算法都跑
        // 从数据中找到最大值来判断是否适合计数/基数排序
        int maxVal = 0;
        for (int v : data) if (v > maxVal) maxVal = v;
        boolean smallRange = maxVal < 5000 && size <= 100000;

        int count = 0;
        count += 1; // bubble
        if (!skipSlow) count += 2; // insertion, selection
        else count += 1; // insertion (only insertion is tested for adaptive)
        count += 3; // quickLomuto, quickHoare, shell
        count += 2; // heap, merge
        if (smallRange) count += 2; // counting, radix

        names = new String[count];
        sorters = new java.util.function.Consumer[count];
        int idx = 0;

        if (!skipSlow) {
            names[idx] = "冒泡排序";
            sorters[idx] = SortingComparison::bubbleSort;
            idx++;
        }
        names[idx] = "快速排序(Lomuto)";
        sorters[idx] = SortingComparison::quickSortLomuto;
        idx++;
        names[idx] = "快速排序(Hoare)";
        sorters[idx] = SortingComparison::quickSortHoare;
        idx++;
        if (!skipSlow || size <= 10000) {
            names[idx] = "插入排序";
            sorters[idx] = SortingComparison::insertionSort;
            idx++;
        }
        names[idx] = "希尔排序";
        sorters[idx] = SortingComparison::shellSort;
        idx++;
        if (!skipSlow) {
            names[idx] = "选择排序";
            sorters[idx] = SortingComparison::selectionSort;
            idx++;
        }
        names[idx] = "堆排序";
        sorters[idx] = SortingComparison::heapSort;
        idx++;
        names[idx] = "归并排序";
        sorters[idx] = SortingComparison::mergeSort;
        idx++;
        if (smallRange) {
            names[idx] = "计数排序";
            sorters[idx] = SortingComparison::countingSort;
            idx++;
            names[idx] = "基数排序";
            sorters[idx] = SortingComparison::radixSort;
            idx++;
        }

        // 运行测试并收集结果
        long[] times = new long[idx];
        String[] resultNames = new String[idx];
        int validCount = 0;
        for (int i = 0; i < idx; i++) {
            long t = runOnce(names[i], sorters[i], data);
            if (t >= 0) {
                resultNames[validCount] = names[i];
                times[validCount] = t;
                validCount++;
            }
        }

        // 打印结果表格
        System.out.printf("%-20s %15s%n", "算法", "耗时(ms)");
        System.out.println("----------------------------------------");
        for (int i = 0; i < validCount; i++) {
            System.out.printf("%-20s %12.3f ms%n",
                    resultNames[i], times[i] / 1_000_000.0);
        }
    }

    // ================================================================
    // 主程序
    // ================================================================
    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  排序算法性能对比分析");
        System.out.println("================================================");

        // ----- 测试 1：随机数据 -----
        System.out.println("\n***** 随机数据测试 *****");

        // n=1000 随机数据（值域 0~9999）
        testGroup("随机数据（含 O(n²) 算法）", 1_000, generateRandom(1_000, 10000));

        // n=10000 随机数据（值域 0~99999）
        testGroup("随机数据（跳过 O(n²)）", 10_000, generateRandom(10_000, 100000));

        // n=100000 随机数据（值域 0~999999）
        testGroup("随机数据（大规模）", 100_000, generateRandom(100_000, 1000000));

        // ----- 测试 2：近乎有序数据（展示自适应行为）-----
        System.out.println("\n\n***** 近乎有序数据测试（n=10000）*****");
        int[] nearlySorted = generateNearlySorted(10000);
        System.out.printf("  数据特征：近乎有序（已排序后扰动 1%% 的相邻元素）%n");

        // 针对近乎有序数据测试关键算法的自适应能力
        System.out.printf("%-20s %15s%n", "算法", "耗时(ms)");
        System.out.println("----------------------------------------");

        // 冒泡排序（带 early exit）在近乎有序数据上应该很快
        long t = runOnce("冒泡排序", SortingComparison::bubbleSort, nearlySorted);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "冒泡排序", t / 1_000_000.0);
        int[] ns = generateNearlySorted(10000);
        t = runOnce("插入排序", SortingComparison::insertionSort, ns);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "插入排序", t / 1_000_000.0);
        int[] ns2 = generateNearlySorted(10000);
        t = runOnce("希尔排序", SortingComparison::shellSort, ns2);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "希尔排序", t / 1_000_000.0);
        int[] ns3 = generateNearlySorted(10000);
        t = runOnce("快速排序", SortingComparison::quickSortHoare, ns3);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "快速排序", t / 1_000_000.0);
        int[] ns4 = generateNearlySorted(10000);
        t = runOnce("归并排序", SortingComparison::mergeSort, ns4);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "归并排序", t / 1_000_000.0);

        // ----- 测试 3：小值域数据（展示线性排序优势）-----
        System.out.println("\n\n***** 小值域数据测试（n=100000, 值域 0~500）*****");
        int[] smallRangeData = generateRandom(100000, 500);
        System.out.printf("%-20s %15s%n", "算法", "耗时(ms)");
        System.out.println("----------------------------------------");
        int[] sr1 = smallRangeData.clone();
        t = runOnce("快速排序", SortingComparison::quickSortHoare, sr1);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "快速排序", t / 1_000_000.0);
        int[] sr2 = smallRangeData.clone();
        t = runOnce("归并排序", SortingComparison::mergeSort, sr2);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "归并排序", t / 1_000_000.0);
        int[] sr3 = smallRangeData.clone();
        t = runOnce("计数排序", SortingComparison::countingSort, sr3);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "计数排序", t / 1_000_000.0);
        int[] sr4 = smallRangeData.clone();
        t = runOnce("基数排序", SortingComparison::radixSort, sr4);
        if (t >= 0) System.out.printf("%-20s %12.3f ms%n", "基数排序", t / 1_000_000.0);
    }
}