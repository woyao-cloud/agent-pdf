package masteralgo.chapter07;

import java.util.*;

/**
 * 经典 DP 问题合集
 *
 * 涵盖：
 * 1. 0/1 背包（二维 DP → 一维空间优化 + 回溯选中的物品）
 * 2. 最长公共子序列 LCS（DP + 重构序列）
 * 3. 最长递增子序列 LIS（O(n²) DP + O(n log n) 耐心排序）
 */
public class ClassicDPProblems {

    // ============================================================
    //  1. 0/1 背包
    // ============================================================

    /**
     * 0/1 背包——二维 DP
     * @param W  背包容量
     * @param w  物品重量数组
     * @param v  物品价值数组
     * @return   最大总价值
     */
    public static int knapsack2D(int W, int[] w, int[] v) {
        int n = w.length;
        int[][] dp = new int[n + 1][W + 1];
        for (int i = 1; i <= n; i++) {
            for (int j = 0; j <= W; j++) {
                if (j < w[i - 1]) {
                    dp[i][j] = dp[i - 1][j];
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j],
                            dp[i - 1][j - w[i - 1]] + v[i - 1]);
                }
            }
        }
        return dp[n][W];
    }

    /**
     * 0/1 背包——一维空间优化（滚动数组）
     * j 必须逆序遍历，保证每个物品只选一次
     */
    public static int knapsack1D(int W, int[] w, int[] v) {
        int n = w.length;
        int[] dp = new int[W + 1];
        for (int i = 0; i < n; i++) {
            for (int j = W; j >= w[i]; j--) {
                dp[j] = Math.max(dp[j], dp[j - w[i]] + v[i]);
            }
        }
        return dp[W];
    }

    /**
     * 0/1 背包 + 回溯选中的物品
     * @return int[0] = 最大价值, int[1..] 为选中物品的下标
     */
    public static int[] knapsackWithBacktrack(int W, int[] w, int[] v) {
        int n = w.length;
        int[][] dp = new int[n + 1][W + 1];
        for (int i = 1; i <= n; i++) {
            for (int j = 0; j <= W; j++) {
                if (j < w[i - 1]) {
                    dp[i][j] = dp[i - 1][j];
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j],
                            dp[i - 1][j - w[i - 1]] + v[i - 1]);
                }
            }
        }

        // 回溯：从 dp[n][W] 逆推，找出选择了哪些物品
        List<Integer> selected = new ArrayList<>();
        int i = n, j = W;
        while (i > 0 && j > 0) {
            if (dp[i][j] != dp[i - 1][j]) {
                selected.add(i - 1); // 选了物品 i-1
                j -= w[i - 1];
            }
            i--;
        }
        Collections.reverse(selected);

        int[] result = new int[selected.size() + 1];
        result[0] = dp[n][W];
        for (int k = 0; k < selected.size(); k++) {
            result[k + 1] = selected.get(k);
        }
        return result;
    }

    // ============================================================
    //  2. 最长公共子序列 LCS
    // ============================================================

    /**
     * LCS——计算长度
     */
    public static int lcsLength(String s1, String s2) {
        int m = s1.length(), n = s2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n];
    }

    /**
     * LCS + 重构具体的子序列
     */
    public static String lcsWithReconstruction(String s1, String s2) {
        int m = s1.length(), n = s2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // 重构 LCS 字符串
        StringBuilder sb = new StringBuilder();
        int i = m, j = n;
        while (i > 0 && j > 0) {
            if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                sb.append(s1.charAt(i - 1));
                i--;
                j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return sb.reverse().toString();
    }

    // ============================================================
    //  3. 最长递增子序列 LIS
    // ============================================================

    /**
     * LIS O(n²)——DP
     */
    public static int lisN2(int[] nums) {
        int n = nums.length;
        if (n == 0) return 0;
        int[] dp = new int[n];
        int maxLen = 1;
        for (int i = 0; i < n; i++) {
            dp[i] = 1;
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i]) {
                    dp[i] = Math.max(dp[i], dp[j] + 1);
                }
            }
            maxLen = Math.max(maxLen, dp[i]);
        }
        return maxLen;
    }

    /**
     * LIS O(n log n)——耐心排序
     * tails[k] 表示长度为 k+1 的递增子序列的最小末尾元素
     */
    public static int lisNLogN(int[] nums) {
        int[] tails = new int[nums.length];
        int len = 0;
        for (int x : nums) {
            int idx = Arrays.binarySearch(tails, 0, len, x);
            if (idx < 0) idx = -(idx + 1);
            tails[idx] = x;
            if (idx == len) len++;
        }
        return len;
    }

    /**
     * LIS O(n log n) + 重构序列本身
     */
    public static List<Integer> lisWithReconstruction(int[] nums) {
        int n = nums.length;
        if (n == 0) return new ArrayList<>();

        int[] tails = new int[n];
        int[] prevIdx = new int[n];
        int[] posInTails = new int[n];
        Arrays.fill(prevIdx, -1);
        int len = 0;

        for (int i = 0; i < n; i++) {
            int idx = Arrays.binarySearch(tails, 0, len, nums[i]);
            if (idx < 0) idx = -(idx + 1);
            tails[idx] = nums[i];
            posInTails[idx] = i;
            if (idx > 0) {
                prevIdx[i] = posInTails[idx - 1];
            }
            if (idx == len) len++;
        }

        // 回溯构造 LIS
        List<Integer> lis = new ArrayList<>();
        int cur = posInTails[len - 1];
        while (cur >= 0) {
            lis.add(nums[cur]);
            cur = prevIdx[cur];
        }
        Collections.reverse(lis);
        return lis;
    }

    // ============================================================
    //  打印 DP 表辅助方法
    // ============================================================

    private static void printDpTable(int[][] dp, String label) {
        System.out.println("  DP 表 (" + label + "):");
        for (int[] row : dp) {
            System.out.print("    ");
            for (int val : row) {
                System.out.printf("%3d ", val);
            }
            System.out.println();
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  ClassicDPProblems —— 经典 DP 问题演示");
        System.out.println("================================================\n");

        // ---------- 1. 0/1 背包 ----------
        System.out.println("----- 1. 0/1 背包 -----");
        int[] w = {2, 3, 4, 5};
        int[] v = {3, 4, 5, 6};
        int W = 8;
        System.out.println("  物品: (重量, 价值) = (2,3), (3,4), (4,5), (5,6), 容量=8");
        System.out.println("  二维DP: " + knapsack2D(W, w, v) + " (期望=10: 选物品 2+4)");
        System.out.println("  一维DP: " + knapsack1D(W, w, v));

        int[] result = knapsackWithBacktrack(W, w, v);
        System.out.print("  回溯选中的物品下标: ");
        for (int k = 1; k < result.length; k++) {
            System.out.print(result[k] + " (重量=" + w[result[k]] + ", 价值=" + v[result[k]] + ")  ");
        }
        System.out.println("  总价值=" + result[0]);

        // 打印 DP 表（小规模数据）
        int[][] smallDp = new int[w.length + 1][W + 1];
        for (int i = 1; i <= w.length; i++) {
            for (int j = 0; j <= W; j++) {
                if (j < w[i - 1]) smallDp[i][j] = smallDp[i - 1][j];
                else smallDp[i][j] = Math.max(smallDp[i - 1][j],
                        smallDp[i - 1][j - w[i - 1]] + v[i - 1]);
            }
        }
        printDpTable(smallDp, "0/1 Knapsack: dp[i][j]");

        // ---------- 2. LCS ----------
        System.out.println("\n----- 2. 最长公共子序列 LCS -----");
        String a = "ABCBDAB", b = "BDCAB";
        System.out.println("  s1 = \"" + a + "\", s2 = \"" + b + "\"");
        System.out.println("  LCS 长度: " + lcsLength(a, b) + " (期望=4: BCAB / BDAB)");
        System.out.println("  LCS 序列: \"" + lcsWithReconstruction(a, b) + "\"");

        // ---------- 3. LIS ----------
        System.out.println("\n----- 3. 最长递增子序列 LIS -----");
        int[] arr = {10, 9, 2, 5, 3, 7, 101, 18};
        System.out.println("  数组: " + Arrays.toString(arr));
        System.out.println("  LIS O(n²) 长度: " + lisN2(arr) + " (期望=4: [2,3,7,101])");
        System.out.println("  LIS O(n log n) 长度: " + lisNLogN(arr));

        List<Integer> lisSeq = lisWithReconstruction(arr);
        System.out.println("  LIS 序列重构: " + lisSeq);

        // ---------- 额外测试 ----------
        System.out.println("\n----- 4. 额外测试用例 -----");
        System.out.println("  LCS(\"abcdef\", \"ace\"): 长度="
                + lcsLength("abcdef", "ace") + " 序列=\"" + lcsWithReconstruction("abcdef", "ace") + "\"");
        System.out.println("  LIS([3,10,2,1,20]): O(n²)=" + lisN2(new int[]{3,10,2,1,20})
                + " O(nlogn)=" + lisNLogN(new int[]{3,10,2,1,20}));
        System.out.println("  LIS([1,3,6,7,9,4,10,5,6]): O(nlogn)="
                + lisNLogN(new int[]{1,3,6,7,9,4,10,5,6}) + " 序列="
                + lisWithReconstruction(new int[]{1,3,6,7,9,4,10,5,6}));

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}