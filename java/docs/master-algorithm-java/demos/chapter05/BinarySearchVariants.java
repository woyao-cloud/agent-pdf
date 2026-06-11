package masteralgo.chapter05;

/**
 * 二分查找全部变体实现与测试
 *
 * 涵盖：标准二分查找、左右边界、旋转数组、山脉峰值、平方根
 * 每个方法包含多个测试用例，使用断言验证正确性。
 */
public class BinarySearchVariants {

    // ============ 1. 标准二分查找 ============

    /**
     * 标准二分查找：返回任意一个匹配位置，未找到返回 -1
     */
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

    // ============ 2. 左边界（第一个匹配） ============

    /**
     * 查找目标值第一次出现的位置
     * 例如 [1,2,2,2,3] 查找 2 → 返回 1
     */
    public static int leftmost(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        int result = -1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) {
                result = mid;
                right = mid - 1; // 继续向左搜索
            } else if (arr[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return result;
    }

    // ============ 3. 右边界（最后一个匹配） ============

    /**
     * 查找目标值最后一次出现的位置
     * 例如 [1,2,2,2,3] 查找 2 → 返回 3
     */
    public static int rightmost(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        int result = -1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) {
                result = mid;
                left = mid + 1; // 继续向右搜索
            } else if (arr[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return result;
    }

    // ============ 4. 旋转数组查找 ============

    /**
     * 在旋转排序数组中查找目标值
     * 例如 [4,5,6,7,0,1,2] 查找 0 → 返回 4
     *
     * 思路：数组从中间切分后，至少有一半是有序的。
     * 先判断哪一半有序，再判断目标是否在有序半区内。
     */
    public static int searchRotated(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;

            // 左半有序
            if (arr[left] <= arr[mid]) {
                if (target >= arr[left] && target < arr[mid]) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }
            // 右半有序
            else {
                if (target > arr[mid] && target <= arr[right]) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }
        }
        return -1;
    }

    // ============ 5. 山脉数组找峰值 ============

    /**
     * 查找山脉数组中的峰值元素索引
     * 山脉数组定义：先严格递增后严格递减，如 [1,3,5,4,2]
     * 保证 arr.length >= 3
     *
     * 利用 arr[mid] 和 arr[mid+1] 的比较判断上下坡
     */
    public static int findPeakElement(int[] arr) {
        int left = 0, right = arr.length - 1;
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] < arr[mid + 1]) {
                left = mid + 1; // 上坡，峰值在右侧
            } else {
                right = mid;    // 下坡或峰顶
            }
        }
        return left;
    }

    // ============ 6. 整数平方根 ============

    /**
     * 计算整数平方根（向下取整）
     * sqrt(8) → 2, sqrt(9) → 3
     */
    public static int sqrtInt(int x) {
        if (x < 2) return x;
        int left = 1, right = x / 2;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            long midSq = (long) mid * mid;
            if (midSq == x) return mid;
            if (midSq < x) left = mid + 1;
            else right = mid - 1;
        }
        return right;
    }

    // ============ 7. 高精度平方根 ============

    /**
     * 计算高精度平方根，指定精度
     * sqrt(2, 1e-6) → 1.414213...
     */
    public static double sqrtDouble(double x, double precision) {
        if (x < 0) return Double.NaN;
        if (x == 0) return 0;
        double left = 0, right = Math.max(1, x);
        while (right - left > precision) {
            double mid = left + (right - left) / 2;
            if (mid * mid < x) left = mid;
            else right = mid;
        }
        return left + (right - left) / 2;
    }

    // ============================================================
    //  测试主方法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  二分查找变体全集 —— 测试与验证");
        System.out.println("================================================\n");

        // ---------- 1. 标准二分查找 ----------
        System.out.println("----- 1. 标准二分查找 -----");
        int[] arr1 = {1, 3, 5, 7, 9, 11, 13};
        test("查找 7",           binarySearch(arr1, 7) == 3);
        test("查找 1（首元素）",  binarySearch(arr1, 1) == 0);
        test("查找 13（尾元素）", binarySearch(arr1, 13) == 6);
        test("查找 4（不存在）",  binarySearch(arr1, 4) == -1);
        test("空数组查找",       binarySearch(new int[]{}, 5) == -1);

        // ---------- 2. 左边界 ----------
        System.out.println("\n----- 2. 左边界（第一次出现） -----");
        int[] arr2 = {1, 2, 2, 2, 3, 4, 4, 5};
        test("2 的左边界",    leftmost(arr2, 2) == 1);
        test("4 的左边界",    leftmost(arr2, 4) == 5);
        test("1 的左边界",    leftmost(arr2, 1) == 0);
        test("5 的左边界",    leftmost(arr2, 5) == 7);
        test("6（不存在）",   leftmost(arr2, 6) == -1);

        // ---------- 3. 右边界 ----------
        System.out.println("\n----- 3. 右边界（最后一次出现） -----");
        test("2 的右边界",    rightmost(arr2, 2) == 3);
        test("4 的右边界",    rightmost(arr2, 4) == 6);
        test("1 的右边界",    rightmost(arr2, 1) == 0);
        test("5 的右边界",    rightmost(arr2, 5) == 7);

        // ---------- 4. 旋转数组查找 ----------
        System.out.println("\n----- 4. 旋转数组查找 -----");
        int[] rotated1 = {4, 5, 6, 7, 0, 1, 2};
        test("旋转数组找 0",  searchRotated(rotated1, 0) == 4);
        test("旋转数组找 7",  searchRotated(rotated1, 7) == 3);
        test("旋转数组找 4",  searchRotated(rotated1, 4) == 0);
        test("旋转数组找 2",  searchRotated(rotated1, 2) == 6);
        test("旋转数组找 3（不存在）", searchRotated(rotated1, 3) == -1);

        int[] rotated2 = {1, 3};
        test("旋转数组[1,3]找 1", searchRotated(rotated2, 1) == 0);
        test("旋转数组[1,3]找 3", searchRotated(rotated2, 3) == 1);

        // ---------- 5. 山脉数组找峰值 ----------
        System.out.println("\n----- 5. 山脉数组找峰值 -----");
        test("山峰 [1,3,5,4,2]",       findPeakElement(new int[]{1,3,5,4,2}) == 2);
        test("山峰 [1,2,3,1]",         findPeakElement(new int[]{1,2,3,1}) == 2);
        test("山峰 [0,1,0]",           findPeakElement(new int[]{0,1,0}) == 1);
        test("山峰 [1,2,3,4,5,3,1]",  findPeakElement(new int[]{1,2,3,4,5,3,1}) == 4);

        // ---------- 6. 整数平方根 ----------
        System.out.println("\n----- 6. 整数平方根 -----");
        test("sqrt(0)",   sqrtInt(0) == 0);
        test("sqrt(1)",   sqrtInt(1) == 1);
        test("sqrt(4)",   sqrtInt(4) == 2);
        test("sqrt(8)",   sqrtInt(8) == 2);
        test("sqrt(9)",   sqrtInt(9) == 3);
        test("sqrt(16)",  sqrtInt(16) == 4);
        test("sqrt(99)",  sqrtInt(99) == 9);
        test("sqrt(100)", sqrtInt(100) == 10);
        test("sqrt(Integer.MAX_VALUE)", sqrtInt(Integer.MAX_VALUE) == 46340);

        // ---------- 7. 高精度平方根 ----------
        System.out.println("\n----- 7. 高精度平方根 -----");
        double sqrt2 = sqrtDouble(2, 1e-10);
        System.out.printf("  sqrt(2) ≈ %.10f (误差 < 1e-10)%n", sqrt2);
        test("sqrt(2) 精度验证", Math.abs(sqrt2 - Math.sqrt(2)) < 1e-10);

        double sqrt10 = sqrtDouble(10, 1e-8);
        System.out.printf("  sqrt(10) ≈ %.8f (误差 < 1e-8)%n", sqrt10);
        test("sqrt(10) 精度验证", Math.abs(sqrt10 - Math.sqrt(10)) < 1e-8);

        System.out.println("\n================================================");
        System.out.println("  全部测试完成");
        System.out.println("================================================");
    }

    /**
     * 辅助测试方法：输出断言结果
     */
    private static void test(String description, boolean passed) {
        if (passed) {
            System.out.printf("  [✓] %s%n", description);
        } else {
            System.out.printf("  [✗] %s <-- 失败！%n", description);
        }
    }
}