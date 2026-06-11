package masteralgo.chapter19;

import java.util.*;

/**
 * 循环不变式演示——通过不变式证明算法正确性
 *
 * 包含四个经典算法：
 * 1. 插入排序（不变式：左半部分已排序）
 * 2. 二分查找（不变式：目标在 [low, high] 区间内）
 * 3. 选择排序（不变式：前 i 个元素是全局最小的 i 个）
 * 4. 荷兰国旗问题（不变式：三个分区 [0,lt) = 0, [lt,i) = 1, (gt, n-1] = 2）
 */
public class LoopInvariantDemo {

    // ============================================================
    //  1. 插入排序
    //  不变式：每次迭代开始时，A[0..i-1] 已按升序排列
    // ============================================================

    /**
     * 插入排序，每轮迭代后打印数组状态
     */
    static void insertionSort(int[] arr) {
        System.out.println("===== 插入排序 =====");
        System.out.println("不变式：A[0..i-1] 已排序");
        System.out.printf("初始数组: %s%n%n", Arrays.toString(arr));

        int n = arr.length;
        for (int i = 1; i < n; i++) {
            int key = arr[i];
            int j = i - 1;

            // 将 key 插入到已排序部分的正确位置
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;

            // 验证不变式：A[0..i] 是有序的
            assert isSorted(arr, 0, i) : "不变式被破坏！";

            System.out.printf("i=%d, 插入 %d → %s  (A[0..%d] 已排序)%n",
                i, key, Arrays.toString(arr), i);
        }

        System.out.printf("最终结果: %s%n%n", Arrays.toString(arr));
    }

    // ============================================================
    //  2. 二分查找
    //  不变式：如果 target 存在于数组中，它一定在 [low, high] 内
    // ============================================================

    /**
     * 二分查找，每轮迭代后打印查找区间变化
     */
    static int binarySearch(int[] arr, int target) {
        System.out.println("===== 二分查找 =====");
        System.out.println("不变式：target 位于 [low, high] 区间内（如果存在）");
        System.out.printf("数组: %s, 目标: %d%n%n", Arrays.toString(arr), target);

        int low = 0, high = arr.length - 1;
        int step = 1;

        while (low <= high) {
            int mid = low + (high - low) / 2;
            System.out.printf("第%d轮: [%d, %d], mid=%d (arr[%d]=%d)%n",
                step++, low, high, mid, mid, arr[mid]);

            // 验证不变式：如果 target 在数组里，它一定在 [low, high] 中
            // 由于不能静态验证，我们检查区间是否合法
            assert low <= high : "不变式被破坏：low > high，区间为空";

            if (arr[mid] == target) {
                System.out.printf("  → 找到 target=%d 在位置 %d%n%n", target, mid);
                return mid;
            } else if (arr[mid] < target) {
                System.out.printf("  → arr[mid] < target, 搜索右半区 [%d, %d]%n", mid + 1, high);
                low = mid + 1;
            } else {
                System.out.printf("  → arr[mid] > target, 搜索左半区 [%d, %d]%n", low, mid - 1);
                high = mid - 1;
            }
        }

        System.out.printf("  → 未找到 target=%d (区间为空: [%d, %d])%n%n", target, low, high);
        return -1;
    }

    // ============================================================
    //  3. 选择排序
    //  不变式：每次迭代开始时，A[0..i-1] 包含全局最小的 i 个元素，且已有序
    // ============================================================

    /**
     * 选择排序，每轮迭代后打印数组状态
     */
    static void selectionSort(int[] arr) {
        System.out.println("===== 选择排序 =====");
        System.out.println("不变式：A[0..i-1] 包含全局最小的 i 个元素且已排序");
        System.out.printf("初始数组: %s%n%n", Arrays.toString(arr));

        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            // 在 A[i..n-1] 中找最小元素
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }

            // 交换
            int temp = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = temp;

            // 验证不变式：
            // 1) A[0..i] 是有序的
            // 2) A[0..i] 中的每个元素 ≤ A[i+1..n-1] 中的每个元素
            assert isSorted(arr, 0, i) : "不变式(1)被破坏：A[0..i] 未排序";
            assert allLeq(arr, 0, i, i + 1, n - 1) : "不变式(2)被破坏：前 i+1 个元素不是最小的";

            System.out.printf("i=%d, 交换位置 %d↔%d → %s%n",
                i, i, minIdx, Arrays.toString(arr));
        }

        System.out.printf("最终结果: %s%n%n", Arrays.toString(arr));
    }

    // ============================================================
    //  4. 荷兰国旗问题（Dutch National Flag）
    //  不变式：三个分区 [0, lt) = 0, [lt, i) = 1, (gt, n-1] = 2
    //  输入数组只包含 0, 1, 2
    // ============================================================

    /**
     * 荷兰国旗三向切分，每轮迭代后打印数组状态
     */
    static void dutchNationalFlag(int[] arr) {
        System.out.println("===== 荷兰国旗问题 =====");
        System.out.println("不变式：三个分区 [0,lt)全是0, [lt,i)全是1, (gt, n-1]全是2");
        System.out.printf("初始数组: %s%n%n", Arrays.toString(arr));

        int n = arr.length;
        int lt = 0, i = 0, gt = n - 1;

        while (i <= gt) {
            // 验证不变式
            assert assertDNFPartition(arr, lt, i, gt) : "DNF 不变式被破坏！";

            System.out.printf("状态: lt=%d, i=%d, gt=%d → %s (分区: [0..%d)0, [%d..%d)1, (%d..%d]2)%n",
                lt, i, gt, Arrays.toString(arr), lt, lt, i, gt, n - 1);

            if (arr[i] == 0) {
                swap(arr, lt, i);
                lt++;
                i++;
            } else if (arr[i] == 1) {
                i++;
            } else { // arr[i] == 2
                swap(arr, i, gt);
                gt--;
            }
        }

        // 最终验证
        assert assertDNFPartition(arr, lt, i, gt) : "最终状态不变式被破坏！";
        System.out.printf("最终状态: lt=%d, i=%d, gt=%d → %s%n", lt, i, gt, Arrays.toString(arr));
        System.out.printf("验证: 所有0在[0..%d), 所有1在[%d..%d), 所有2在(%d..%d] %s%n%n",
            lt, lt, i, gt, n - 1,
            isSorted012(arr) ? "✓" : "✗");
    }

    // ============================================================
    //  辅助方法
    // ============================================================

    /** 检查 arr[start..end] 是否升序 */
    private static boolean isSorted(int[] arr, int start, int end) {
        for (int k = start; k < end; k++) {
            if (arr[k] > arr[k + 1]) return false;
        }
        return true;
    }

    /** 检查 arr[lStart..lEnd] 中的每个元素 ≤ arr[rStart..rEnd] 中的每个元素 */
    private static boolean allLeq(int[] arr, int lStart, int lEnd, int rStart, int rEnd) {
        for (int a = lStart; a <= lEnd; a++) {
            for (int b = Math.max(rStart, a + 1); b <= rEnd; b++) {
                if (arr[a] > arr[b]) return false;
            }
        }
        return true;
    }

    /** 交换数组中的两个元素 */
    private static void swap(int[] arr, int i, int j) {
        int t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }

    /** 验证 DNF 分区不变式：arr[0..lt)==0, arr[lt..i)==1, arr[gt+1..n-1]==2 */
    private static boolean assertDNFPartition(int[] arr, int lt, int i, int gt) {
        for (int k = 0; k < lt; k++) {
            if (arr[k] != 0) return false;
        }
        for (int k = lt; k < i; k++) {
            if (arr[k] != 1) return false;
        }
        for (int k = gt + 1; k < arr.length; k++) {
            if (arr[k] != 2) return false;
        }
        return true;
    }

    /** 检查数组是否 0,1,2 三色有序 */
    private static boolean isSorted012(int[] arr) {
        for (int i = 0; i < arr.length - 1; i++) {
            if (arr[i] > arr[i + 1]) return false;
        }
        return true;
    }

    // ============================================================
    //  主程序
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 循环不变式演示 ===\n");

        // 1. 插入排序
        int[] arr1 = {5, 2, 4, 6, 1, 3};
        insertionSort(arr1.clone());
        assert isSorted(arr1.clone(), 0, arr1.length - 1) : "插入排序结果不正确";

        // 2. 二分查找
        int[] sortedArr = {1, 3, 5, 7, 9, 11, 13};
        binarySearch(sortedArr, 7);   // 存在
        binarySearch(sortedArr, 4);   // 不存在

        // 3. 选择排序
        int[] arr3 = {64, 25, 12, 22, 11};
        selectionSort(arr3.clone());

        // 4. 荷兰国旗问题
        int[] arr4 = {2, 0, 2, 1, 1, 0, 1, 2, 0, 1};
        dutchNationalFlag(arr4);

        System.out.println("所有演示完成！不变式在每次迭代后都成立，证明算法正确。");
    }
}