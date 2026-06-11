package masteralgo.chapter09;

import java.util.*;

/**
 * 回溯算法——排列、子集、组合求和问题合集
 *
 * 涵盖：
 * 1. 全排列（Permutations）—— 无重复元素的全部排列
 * 2. 全排列 II（Permutations II）——含重复元素，去重排列
 * 3. 子集（Subsets）—— 幂集
 * 4. 组合（Combinations）—— 从 n 中选 k 个
 * 5. 组合求和（Combination Sum）—— 可重复使用元素，求和等于 target
 * 6. 组合求和 II（Combination Sum II）—— 不可重复使用，数组含重复元素
 */
public class PermutationsAndSubsets {

    // ============================================================
    //  1. 全排列（无重复）
    // ============================================================

    /**
     * 生成数组的所有全排列（数组元素不重复）
     * 思路：逐位选择未使用的元素
     */
    public static List<List<Integer>> permute(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        boolean[] used = new boolean[nums.length];
        backtrackPermute(nums, used, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackPermute(int[] nums, boolean[] used,
                                         List<Integer> path, List<List<Integer>> result) {
        if (path.size() == nums.length) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;           // 已选，跳过
            used[i] = true;                  // choose
            path.add(nums[i]);
            backtrackPermute(nums, used, path, result); // explore
            path.remove(path.size() - 1);    // unchoose
            used[i] = false;
        }
    }

    // ============================================================
    //  2. 全排列 II（有重复）
    // ============================================================

    /**
     * 生成全排列（含重复元素，结果去重）
     * 关键：排序后，在每一层跳过相同且前一个未使用的元素
     */
    public static List<List<Integer>> permuteUnique(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        Arrays.sort(nums); // 排序，为去重做准备
        boolean[] used = new boolean[nums.length];
        backtrackPermuteUnique(nums, used, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackPermuteUnique(int[] nums, boolean[] used,
                                               List<Integer> path, List<List<Integer>> result) {
        if (path.size() == nums.length) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            // 去重：前一个相同元素未被使用，说明是本层的重复选择，跳过
            if (i > 0 && nums[i] == nums[i - 1] && !used[i - 1]) continue;
            used[i] = true;
            path.add(nums[i]);
            backtrackPermuteUnique(nums, used, path, result);
            path.remove(path.size() - 1);
            used[i] = false;
        }
    }

    // ============================================================
    //  3. 子集（Subsets）
    // ============================================================

    /**
     * 生成数组的所有子集（幂集）
     * 思路：每个元素选或不选，或循环+选一个模式
     */
    public static List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        backtrackSubsets(nums, 0, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackSubsets(int[] nums, int start,
                                         List<Integer> path, List<List<Integer>> result) {
        // 每个节点都是一个子集——先记录当前路径
        result.add(new ArrayList<>(path));
        // 从 start 开始，避免回头
        for (int i = start; i < nums.length; i++) {
            path.add(nums[i]);
            backtrackSubsets(nums, i + 1, path, result);
            path.remove(path.size() - 1);
        }
    }

    // ============================================================
    //  4. 组合（Combinations）
    // ============================================================

    /**
     * 从 1..n 中选 k 个数的所有组合
     * 思路：标准组合模板，path.size() == k 时记录
     */
    public static List<List<Integer>> combine(int n, int k) {
        List<List<Integer>> result = new ArrayList<>();
        backtrackCombine(n, k, 1, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackCombine(int n, int k, int start,
                                         List<Integer> path, List<List<Integer>> result) {
        if (path.size() == k) {
            result.add(new ArrayList<>(path));
            return;
        }
        // 剪枝：i <= n - (k - path.size()) + 1 保证剩余元素足够
        for (int i = start; i <= n - (k - path.size()) + 1; i++) {
            path.add(i);
            backtrackCombine(n, k, i + 1, path, result);
            path.remove(path.size() - 1);
        }
    }

    // ============================================================
    //  5. 组合求和（Combination Sum）——可重复使用元素
    // ============================================================

    /**
     * 找出所有和为 target 的组合，candidates 中的数字可以无限重复使用
     * 思路：排序后，从 start 开始，允许重复使用当前元素
     */
    public static List<List<Integer>> combinationSum(int[] candidates, int target) {
        List<List<Integer>> result = new ArrayList<>();
        Arrays.sort(candidates); // 排序便于剪枝
        backtrackCombinationSum(candidates, target, 0, 0, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackCombinationSum(int[] candidates, int target, int start, int sum,
                                                List<Integer> path, List<List<Integer>> result) {
        if (sum == target) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = start; i < candidates.length; i++) {
            if (sum + candidates[i] > target) break; // 剪枝
            path.add(candidates[i]);
            // 传入 i 而不是 i+1——允许重复使用当前元素
            backtrackCombinationSum(candidates, target, i, sum + candidates[i], path, result);
            path.remove(path.size() - 1);
        }
    }

    // ============================================================
    //  6. 组合求和 II（Combination Sum II）——不可重复使用，含重复元素
    // ============================================================

    /**
     * 找出所有和为 target 的组合，每个数字只能使用一次，结果不能重复
     * 思路：排序 + 去重（同一层跳过相同元素）+ i+1 递归
     */
    public static List<List<Integer>> combinationSum2(int[] candidates, int target) {
        List<List<Integer>> result = new ArrayList<>();
        Arrays.sort(candidates);
        backtrackCombinationSum2(candidates, target, 0, 0, new ArrayList<>(), result);
        return result;
    }

    private static void backtrackCombinationSum2(int[] candidates, int target, int start, int sum,
                                                 List<Integer> path, List<List<Integer>> result) {
        if (sum == target) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = start; i < candidates.length; i++) {
            if (sum + candidates[i] > target) break; // 剪枝
            // 同一层中，跳过与前一个相同的元素（去重）
            if (i > start && candidates[i] == candidates[i - 1]) continue;
            path.add(candidates[i]);
            backtrackCombinationSum2(candidates, target, i + 1, sum + candidates[i], path, result);
            path.remove(path.size() - 1);
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  PermutationsAndSubsets —— 回溯组合问题演示");
        System.out.println("================================================\n");

        // ---------- 1. 全排列 ----------
        System.out.println("----- 1. 全排列（无重复） -----");
        int[] nums1 = {1, 2, 3};
        System.out.println("  输入: " + Arrays.toString(nums1));
        List<List<Integer>> perms = permute(nums1);
        System.out.println("  排列总数: " + perms.size() + " (期望: 6)");
        for (List<Integer> p : perms) {
            System.out.println("    " + p);
        }
        System.out.println();

        // ---------- 2. 全排列 II（有重复）----------
        System.out.println("----- 2. 全排列 II（有重复）-----");
        int[] nums2 = {1, 1, 2};
        System.out.println("  输入: " + Arrays.toString(nums2));
        List<List<Integer>> perms2 = permuteUnique(nums2);
        System.out.println("  不重复排列数: " + perms2.size() + " (期望: 3)");
        for (List<Integer> p : perms2) {
            System.out.println("    " + p);
        }
        System.out.println();

        // ---------- 3. 子集 ----------
        System.out.println("----- 3. 子集 -----");
        int[] nums3 = {1, 2, 3};
        System.out.println("  输入: " + Arrays.toString(nums3));
        List<List<Integer>> subs = subsets(nums3);
        System.out.println("  子集总数: " + subs.size() + " (期望: 8)");
        for (List<Integer> s : subs) {
            System.out.println("    " + s);
        }
        System.out.println();

        // ---------- 4. 组合 ----------
        System.out.println("----- 4. 组合 C(4,2) -----");
        List<List<Integer>> combs = combine(4, 2);
        System.out.println("  C(4,2) 组合数: " + combs.size() + " (期望: 6)");
        for (List<Integer> c : combs) {
            System.out.println("    " + c);
        }
        System.out.println();

        // ---------- 5. 组合求和 ----------
        System.out.println("----- 5. 组合求和（可重复使用）-----");
        int[] candidates1 = {2, 3, 6, 7};
        int target1 = 7;
        System.out.println("  candidates: " + Arrays.toString(candidates1)
                + ", target: " + target1);
        List<List<Integer>> sum1 = combinationSum(candidates1, target1);
        System.out.println("  解的数量: " + sum1.size() + " (期望: 2)");
        for (List<Integer> s : sum1) {
            System.out.println("    " + s);
        }
        System.out.println();

        // ---------- 6. 组合求和 II ----------
        System.out.println("----- 6. 组合求和 II（不可重复使用）-----");
        int[] candidates2 = {10, 1, 2, 7, 6, 1, 5};
        int target2 = 8;
        System.out.println("  candidates: " + Arrays.toString(candidates2)
                + ", target: " + target2);
        List<List<Integer>> sum2 = combinationSum2(candidates2, target2);
        System.out.println("  解的数量: " + sum2.size() + " (期望: 4)");
        for (List<Integer> s : sum2) {
            System.out.println("    " + s);
        }

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}