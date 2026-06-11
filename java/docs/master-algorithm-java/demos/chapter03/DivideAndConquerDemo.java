package masteralgo.chapter03;

import java.util.Arrays;
import java.util.Random;

/**
 * 分治法演示 —— 归并排序与逆序对计数
 *
 * 1. 经典归并排序（Merge Sort）：分解 → 递归 → 合并
 * 2. 逆序对计数（Count Inversions）：在归并过程中计算逆序对数量
 *
 * 逆序对定义：若 i < j 且 arr[i] > arr[j]，则 (i, j) 为一个逆序对
 *
 * @author master-algorithm-java
 */
public class DivideAndConquerDemo {

    // ============================================================
    // 1. 经典归并排序
    // 时间复杂度：O(n log n)，空间复杂度：O(n)
    // ============================================================

    /**
     * 归并排序入口
     */
    public static void mergeSort(int[] arr) {
        if (arr == null || arr.length < 2) {
            return;
        }
        mergeSort(arr, 0, arr.length - 1);
    }

    /**
     * 归并排序递归实现（分治法三步）
     *
     * 分解：将数组从中间分为左右两半
     * 解决：递归地对左右两半排序
     * 合并：将两个有序半区合并为一个有序数组
     */
    private static void mergeSort(int[] arr, int left, int right) {
        if (left >= right) {
            return; // 子问题足够小，直接返回（一个元素自然有序）
        }

        // 1. 分解：找到中间位置
        int mid = left + (right - left) / 2;

        // 2. 解决：递归排序左右两半
        mergeSort(arr, left, mid);
        mergeSort(arr, mid + 1, right);

        // 3. 合并：将两个有序子数组合并
        merge(arr, left, mid, right);
    }

    /**
     * 合并两个有序子数组 [left, mid] 和 [mid+1, right]
     */
    private static void merge(int[] arr, int left, int mid, int right) {
        // 创建临时数组存放合并结果
        int[] temp = new int[right - left + 1];
        int i = left;      // 左半部分的起始索引
        int j = mid + 1;   // 右半部分的起始索引
        int k = 0;         // 临时数组的索引

        // 双指针合并：比较左右两个子数组的当前元素，取较小的放入临时数组
        while (i <= mid && j <= right) {
            if (arr[i] <= arr[j]) {
                temp[k++] = arr[i++];
            } else {
                temp[k++] = arr[j++];
            }
        }

        // 将左半部分剩余元素复制到临时数组
        while (i <= mid) {
            temp[k++] = arr[i++];
        }

        // 将右半部分剩余元素复制到临时数组
        while (j <= right) {
            temp[k++] = arr[j++];
        }

        // 将临时数组的内容复制回原数组
        System.arraycopy(temp, 0, arr, left, temp.length);
    }

    // ============================================================
    // 2. 逆序对计数 —— 归并排序的巧妙应用
    // 时间复杂度：O(n log n)，空间复杂度：O(n)
    //
    // 核心思路：在合并两个有序子数组时，
    // 如果从右半部分取元素 arr[j]，则左半部分当前及之后的所有元素
    // 都大于 arr[j]，因此每个这样的左半元素都与 arr[j] 构成逆序对。
    // ============================================================

    /**
     * 计算数组中的逆序对总数
     */
    public static long countInversions(int[] arr) {
        if (arr == null || arr.length < 2) {
            return 0;
        }
        int[] temp = new int[arr.length];
        return countInversions(arr, temp, 0, arr.length - 1);
    }

    /**
     * 递归计算逆序对，同时完成归并排序
     */
    private static long countInversions(int[] arr, int[] temp, int left, int right) {
        if (left >= right) {
            return 0;
        }

        int mid = left + (right - left) / 2;
        long count = 0;

        // 左半部分的逆序对 + 右半部分的逆序对
        count += countInversions(arr, temp, left, mid);
        count += countInversions(arr, temp, mid + 1, right);

        // 合并过程中发现的跨左右两部分的逆序对
        count += mergeAndCount(arr, temp, left, mid, right);

        return count;
    }

    /**
     * 合并两个有序子数组，同时计算逆序对
     *
     * 关键观察：当 arr[i] > arr[j] 时，
     * 左半部分从 i 到 mid 的所有元素都大于 arr[j]，
     * 所以逆序对数量为 (mid - i + 1)
     */
    private static long mergeAndCount(int[] arr, int[] temp, int left, int mid, int right) {
        // 复制到临时数组
        System.arraycopy(arr, left, temp, left, right - left + 1);

        int i = left;      // 左半部分的指针
        int j = mid + 1;   // 右半部分的指针
        int k = left;      // 原数组的写入位置
        long count = 0;

        while (i <= mid && j <= right) {
            if (temp[i] <= temp[j]) {
                // 左半部分元素 <= 右半部分元素 → 不构成逆序对
                arr[k++] = temp[i++];
            } else {
                // 左半部分元素 > 右半部分元素 → 构成逆序对
                // temp[i], temp[i+1], ..., temp[mid] 都大于 temp[j]
                // 所以增加了 (mid - i + 1) 个逆序对
                arr[k++] = temp[j++];
                count += (mid - i + 1);
            }
        }

        // 复制剩余元素
        while (i <= mid) {
            arr[k++] = temp[i++];
        }
        while (j <= right) {
            arr[k++] = temp[j++];
        }

        return count;
    }

    // ============================================================
    // 验证与测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  分治法演示：归并排序 & 逆序对计数");
        System.out.println("============================================\n");

        // ----------------------------------------------------------
        // 演示一：归并排序
        // ----------------------------------------------------------
        System.out.println("【演示一】归并排序");
        int[] arr1 = {38, 27, 43, 3, 9, 82, 10};
        System.out.println("  排序前: " + Arrays.toString(arr1));
        mergeSort(arr1);
        System.out.println("  排序后: " + Arrays.toString(arr1));
        System.out.println();

        // ----------------------------------------------------------
        // 演示二：逆序对计数
        // ----------------------------------------------------------
        System.out.println("【演示二】逆序对计数");
        int[] arr2 = {2, 4, 1, 3, 5};
        System.out.println("  数组: " + Arrays.toString(arr2));
        long invCount = countInversions(arr2);
        System.out.println("  逆序对数量: " + invCount);
        // 手动验证：逆序对有 (2,1), (4,1), (4,3) 共 3 个
        System.out.println("  (预期: 3  —— (2,1), (4,1), (4,3))");
        System.out.println();

        // ----------------------------------------------------------
        // 演示三：随机数组测试
        // ----------------------------------------------------------
        System.out.println("【演示三】随机数组测试");
        Random rand = new Random(42);
        for (int n : new int[]{5, 10, 20}) {
            int[] arr = new int[n];
            for (int i = 0; i < n; i++) {
                arr[i] = rand.nextInt(100);
            }

            // 用暴力法验证逆序对计数
            long bruteCount = countInversionsBruteForce(arr);
            long fastCount = countInversions(arr.clone());

            System.out.printf("  n=%d, 暴力法=%d, 分治法=%d, 结果%s%n",
                    n, bruteCount, fastCount,
                    bruteCount == fastCount ? "✔ 一致" : "✘ 不一致");
        }
        System.out.println();

        // ----------------------------------------------------------
        // 演示四：归并排序后数组是否有序
        // ----------------------------------------------------------
        System.out.println("【演示四】归并排序正确性验证");
        int[] arr3 = new int[15];
        for (int i = 0; i < arr3.length; i++) {
            arr3[i] = rand.nextInt(100);
        }
        System.out.println("  排序前: " + Arrays.toString(arr3));
        mergeSort(arr3);
        System.out.println("  排序后: " + Arrays.toString(arr3));
        boolean sorted = true;
        for (int i = 1; i < arr3.length; i++) {
            if (arr3[i] < arr3[i - 1]) {
                sorted = false;
                break;
            }
        }
        System.out.println("  是否正确排序: " + (sorted ? "✔ 是" : "✘ 否"));
    }

    /**
     * 暴力法计算逆序对（用于验证）
     * 时间复杂度：O(n²)
     */
    private static long countInversionsBruteForce(int[] arr) {
        long count = 0;
        for (int i = 0; i < arr.length; i++) {
            for (int j = i + 1; j < arr.length; j++) {
                if (arr[i] > arr[j]) {
                    count++;
                }
            }
        }
        return count;
    }
}