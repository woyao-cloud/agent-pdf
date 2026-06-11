package masteralgo.chapter01;

/**
 * 最大子数组和问题（Maximum Subarray Sum）—— 算法设计流程的完整演示
 *
 * 问题描述：
 * 给定一个整数数组，找到一个具有最大和的连续子数组（子数组最少包含一个元素），
 * 返回其最大和。
 *
 * 本文件演示了算法设计的完整流程：
 *   理解问题 → 设计算法 → 正确性证明 → 编码实现 → 测试验证 → 复杂度分析
 *
 * 三种解法对比：
 *   1. bruteForce: O(n³) —— 从暴力枚举开始理解问题
 *   2. optimized:  O(n²) —— 第一次优化，避免重复计算
 *   3. kadane:     O(n) —— 最优解，动态规划思想
 *
 * @author master-algorithm-java
 */
public class AlgorithmDesignProcess {

    // ============================================================
    // 解法一：暴力枚举（Brute Force）
    // 时间复杂度：O(n³)  空间复杂度：O(1)
    // 思路：枚举所有可能的子数组 [i, j]，计算每个子数组的和
    // ============================================================
    public static int maxSubArrayBruteForce(int[] nums) {
        // 处理边界情况：空数组
        if (nums == null || nums.length == 0) {
            throw new IllegalArgumentException("数组不能为空");
        }

        int n = nums.length;
        int maxSum = Integer.MIN_VALUE;

        // 外层循环：子数组的起始位置 i
        for (int i = 0; i < n; i++) {
            // 中层循环：子数组的结束位置 j
            for (int j = i; j < n; j++) {
                // 内层循环：计算从 i 到 j 的和
                int sum = 0;
                for (int k = i; k <= j; k++) {
                    sum += nums[k];
                }
                // 更新最大和
                if (sum > maxSum) {
                    maxSum = sum;
                }
            }
        }
        return maxSum;
    }

    // ============================================================
    // 解法二：优化枚举
    // 时间复杂度：O(n²)  空间复杂度：O(1)
    // 思路：固定起点 i，依次扩展终点 j，利用上一次的计算结果
    // ============================================================
    public static int maxSubArrayOptimized(int[] nums) {
        if (nums == null || nums.length == 0) {
            throw new IllegalArgumentException("数组不能为空");
        }

        int n = nums.length;
        int maxSum = Integer.MIN_VALUE;

        for (int i = 0; i < n; i++) {
            int sum = 0;
            // 当 j 递增时，只需在上一次 sum 的基础上加上 nums[j]
            // 避免了最内层的循环，从 O(n³) 降到 O(n²)
            for (int j = i; j < n; j++) {
                sum += nums[j];
                if (sum > maxSum) {
                    maxSum = sum;
                }
            }
        }
        return maxSum;
    }

    // ============================================================
    // 解法三：Kadane算法
    // 时间复杂度：O(n)  空间复杂度：O(1)
    // 思路：动态规划。遍历数组时，维护两个变量：
    //   maxCurrent：以当前位置结尾的最大子数组和
    //   maxGlobal：全局最大子数组和
    // 核心递推：maxCurrent = max(nums[i], maxCurrent + nums[i])
    // ============================================================
    public static int maxSubArrayKadane(int[] nums) {
        if (nums == null || nums.length == 0) {
            throw new IllegalArgumentException("数组不能为空");
        }

        int maxCurrent = nums[0];  // 以当前元素结尾的最大子数组和
        int maxGlobal = nums[0];   // 全局最大子数组和

        for (int i = 1; i < nums.length; i++) {
            // 关键决策：
            //   要么从当前元素重新开始（丢弃之前的子数组）
            //   要么把当前元素加入之前的子数组
            maxCurrent = Math.max(nums[i], maxCurrent + nums[i]);

            // 更新全局最大值
            if (maxCurrent > maxGlobal) {
                maxGlobal = maxCurrent;
            }
        }
        return maxGlobal;
    }

    // ============================================================
    // 测试验证
    // ============================================================
    public static void main(String[] args) {
        System.out.println("========================================");
        System.out.println("  算法设计流程演示：最大子数组和问题");
        System.out.println("========================================\n");

        // 步骤一：理解问题
        System.out.println("【步骤一】理解问题");
        System.out.println("  问题：给定整数数组，找到具有最大和的连续子数组。");
        System.out.println("  示例：[-2, 1, -3, 4, -1, 2, 1, -5, 4]");
        System.out.println("  答案：6（子数组 [4, -1, 2, 1] 的和）\n");

        int[] testArray = {-2, 1, -3, 4, -1, 2, 1, -5, 4};

        // 步骤二 & 三：设计算法并编码实现
        System.out.println("【步骤二&三】设计并实现算法");
        System.out.println("  解法1（暴力枚举 O(n³)）: "
                + maxSubArrayBruteForce(testArray));
        System.out.println("  解法2（优化枚举 O(n²)）: "
                + maxSubArrayOptimized(testArray));
        System.out.println("  解法3（Kadane算法 O(n)）: "
                + maxSubArrayKadane(testArray));
        System.out.println();

        // 步骤四：正确性证明不在代码中体现，但通过多解法结果一致来验证
        boolean correct = maxSubArrayBruteForce(testArray)
                == maxSubArrayOptimized(testArray)
                && maxSubArrayOptimized(testArray)
                == maxSubArrayKadane(testArray);
        System.out.println("【步骤四】正确性验证");
        System.out.println("  三种解法结果一致: " + (correct ? "✔ 通过" : "✘ 失败"));
        System.out.println();

        // 步骤五：全面测试
        System.out.println("【步骤五】测试验证");
        runTests();
        System.out.println();

        // 步骤六：复杂度分析
        System.out.println("【步骤六】复杂度分析");
        System.out.println("  ┌─────────────────┬──────────┬──────────┐");
        System.out.println("  │ 算法            │ 时间复杂度│ 空间复杂度│");
        System.out.println("  ├─────────────────┼──────────┼──────────┤");
        System.out.println("  │ 暴力枚举        │   O(n³)  │   O(1)   │");
        System.out.println("  │ 优化枚举        │   O(n²)  │   O(1)   │");
        System.out.println("  │ Kadane算法      │   O(n)   │   O(1)   │");
        System.out.println("  └─────────────────┴──────────┴──────────┘");
    }

    /**
     * 运行全面的测试用例
     */
    private static void runTests() {
        // 测试用例 1：常规情况
        int[] test1 = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
        int result1 = maxSubArrayKadane(test1);
        System.out.println("  测试1（常规混合数组）: " + result1
                + (result1 == 6 ? " ✔" : " ✘ (期望 6)"));

        // 测试用例 2：全部为负数
        int[] test2 = {-5, -3, -1, -7};
        int result2 = maxSubArrayKadane(test2);
        System.out.println("  测试2（全负数数组）  : " + result2
                + (result2 == -1 ? " ✔" : " ✘ (期望 -1)"));

        // 测试用例 3：全部为正数
        int[] test3 = {1, 2, 3, 4, 5};
        int result3 = maxSubArrayKadane(test3);
        System.out.println("  测试3（全正数数组）  : " + result3
                + (result3 == 15 ? " ✔" : " ✘ (期望 15)"));

        // 测试用例 4：单个元素
        int[] test4 = {42};
        int result4 = maxSubArrayKadane(test4);
        System.out.println("  测试4（单元素数组）  : " + result4
                + (result4 == 42 ? " ✔" : " ✘ (期望 42)"));

        // 测试用例 5：交替正负数
        int[] test5 = {1, -1, 1, -1, 1};
        int result5 = maxSubArrayKadane(test5);
        System.out.println("  测试5（交替正负数）  : " + result5
                + (result5 == 1 ? " ✔" : " ✘ (期望 1)"));

        // 测试用例 6：所有元素相同
        int[] test6 = {5, 5, 5, 5};
        int result6 = maxSubArrayKadane(test6);
        System.out.println("  测试6（所有元素相同）: " + result6
                + (result6 == 20 ? " ✔" : " ✘ (期望 20)"));
    }
}