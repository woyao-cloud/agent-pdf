package masteralgo.chapter03;

import java.util.ArrayList;
import java.util.List;

/**
 * 回溯法演示 —— 生成集合的所有子集（幂集）
 *
 * 问题：给定一个集合 {1, 2, 3}，生成所有子集：
 *   {}, {1}, {2}, {3}, {1,2}, {1,3}, {2,3}, {1,2,3}
 *
 * 回溯法思路：对于每个元素，有两个选择——选或不选。
 * 用递归深度优先遍历这棵"决策树"，在叶子节点收集结果。
 *
 * 状态空间树（n=3）：
 *                  根
 *                /     \
 *           选1         不选1
 *          /   \        /   \
 *       选2   不选2   选2   不选2
 *       / \    / \    / \    / \
 *     选3 不3 选3 不3 选3 不3 选3 不3
 *    {123} {12} {13} {1} {23} {2} {3} {}
 *
 * 时间复杂度：O(n * 2^n)，空间复杂度：O(n)
 *
 * @author master-algorithm-java
 */
public class BacktrackingDemo {

    /**
     * 用回溯法生成集合的所有子集
     *
     * @param nums 原始集合
     * @return 所有子集的列表
     */
    public static List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        // 开始回溯：从第 0 个元素开始，当前子集为空
        backtrack(nums, 0, new ArrayList<>(), result);
        return result;
    }

    /**
     * 回溯递归函数
     *
     * @param nums   原始集合
     * @param index  当前正在决策的元素索引
     * @param current 当前正在构建的子集
     * @param result 存储所有子集的结果列表
     */
    private static void backtrack(int[] nums, int index,
                                  List<Integer> current, List<List<Integer>> result) {
        // 到达叶子节点：所有元素都已决策完毕
        // 将当前子集的一个副本加入结果列表
        if (index == nums.length) {
            result.add(new ArrayList<>(current));
            return;
        }

        // 选择一：不选当前元素
        backtrack(nums, index + 1, current, result);

        // 选择二：选当前元素
        current.add(nums[index]);
        backtrack(nums, index + 1, current, result);

        // 撤销选择：回溯的关键——恢复状态
        current.remove(current.size() - 1);
    }

    /**
     * 带剪枝的版本：在构造过程中直接输出，不等到叶子节点
     * 这种写法更适合在搜索过程中提前判断可行性
     */
    public static List<List<Integer>> subsetsWithPruning(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        // 在每一步都记录当前子集（包括中间节点），而非只在叶子节点记录
        backtrackWithOutput(nums, 0, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackWithOutput(int[] nums, int index,
                                            List<Integer> current, List<List<Integer>> result) {
        // 每一步都记录当前状态（包括空集和中间状态）
        result.add(new ArrayList<>(current));

        for (int i = index; i < nums.length; i++) {
            // 选择当前元素
            current.add(nums[i]);
            // 递归处理剩余元素
            backtrackWithOutput(nums, i + 1, current, result);
            // 撤销选择
            current.remove(current.size() - 1);
        }
    }

    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  回溯法演示：生成集合的所有子集");
        System.out.println("============================================\n");

        // ----------------------------------------------------------
        // 演示一：生成 {1, 2, 3} 的所有子集
        // ----------------------------------------------------------
        System.out.println("【演示一】生成集合 {1, 2, 3} 的所有子集");
        int[] set1 = {1, 2, 3};
        List<List<Integer>> subsets1 = subsets(set1);
        System.out.println("  子集总数: " + subsets1.size() + "（应为 2^3 = 8）");
        System.out.println("  所有子集:");
        for (List<Integer> subset : subsets1) {
            System.out.println("    " + formatSubset(subset));
        }
        System.out.println();

        // ----------------------------------------------------------
        // 演示二：生成 {a, b, c, d} 的（用整数表示）所有子集
        // ----------------------------------------------------------
        System.out.println("【演示二】生成集合 {10, 20, 30, 40} 的所有子集");
        int[] set2 = {10, 20, 30, 40};
        List<List<Integer>> subsets2 = subsets(set2);
        System.out.println("  子集总数: " + subsets2.size() + "（应为 2^4 = 16）");
        System.out.println("  所有子集:");
        for (int i = 0; i < subsets2.size(); i++) {
            System.out.println("    " + (i + 1) + ". " + formatSubset(subsets2.get(i)));
        }
        System.out.println();

        // ----------------------------------------------------------
        // 演示三：集合大小的增长趋势
        // ----------------------------------------------------------
        System.out.println("【演示三】子集数量随集合大小的增长");
        System.out.println("  " + "-".repeat(40));
        System.out.println("  " + String.format("%-10s %-10s %-15s", "|集合|", "子集数", "需枚举次数"));
        System.out.println("  " + "-".repeat(40));
        for (int n : new int[]{1, 2, 3, 4, 5, 10, 20}) {
            System.out.printf("  %-10d %-10d %-15d%n", n, (int) Math.pow(2, n), (int) Math.pow(2, n));
        }
        System.out.println("  " + "-".repeat(40));
        System.out.println("  注：当 n=20 时，子集数超过 100 万。");
        System.out.println("  回溯法的时间复杂度 O(n*2^n) 指数增长，仅适用于小规模问题。");
        System.out.println();

        // ----------------------------------------------------------
        // 验证子集生成正确性
        // ----------------------------------------------------------
        System.out.println("【验证】子集总数为 2^n");
        for (int n : new int[]{0, 1, 2, 3, 4, 5}) {
            int[] testSet = new int[n];
            for (int i = 0; i < n; i++) {
                testSet[i] = i + 1;
            }
            List<List<Integer>> result = subsets(testSet);
            boolean correct = result.size() == Math.pow(2, n);
            System.out.println("  n=" + n + ", 子集数=" + result.size()
                    + " (期望 " + (int) Math.pow(2, n) + ") "
                    + (correct ? "✔" : "✘"));
        }
    }

    /**
     * 格式化子集输出
     */
    private static String formatSubset(List<Integer> subset) {
        if (subset.isEmpty()) {
            return "∅ (空集)";
        }
        return "{ " + subset.toString().replace("[", "").replace("]", "") + " }";
    }
}