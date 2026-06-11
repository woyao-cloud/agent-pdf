package masteralgo.chapter07;

import java.util.*;

/**
 * 进阶 DP 问题合集
 *
 * 涵盖：
 * 1. 完全背包（无限物品——1D DP，j 正序遍历）
 * 2. 回文分割（区间 DP + 预处理回文表）
 * 3. 编辑距离（Levenshtein distance + 编辑操作重构）
 */
public class AdvancedDPProblems {

    // ============================================================
    //  1. 完全背包（Unbounded Knapsack）
    // ============================================================

    /**
     * 完全背包——一维 DP
     * j 必须正序遍历，允许同一物品被多次选取
     */
    public static int completeKnapsack(int W, int[] w, int[] v) {
        int n = w.length;
        int[] dp = new int[W + 1];
        for (int i = 0; i < n; i++) {
            for (int j = w[i]; j <= W; j++) {
                dp[j] = Math.max(dp[j], dp[j - w[i]] + v[i]);
            }
        }
        return dp[W];
    }

    /**
     * 完全背包——返回二维 DP 表用于展示
     */
    public static int[][] completeKnapsackTable(int W, int[] w, int[] v) {
        int n = w.length;
        int[][] dp = new int[n + 1][W + 1];
        for (int i = 1; i <= n; i++) {
            for (int j = 0; j <= W; j++) {
                dp[i][j] = dp[i - 1][j];
                if (j >= w[i - 1]) {
                    dp[i][j] = Math.max(dp[i][j], dp[i][j - w[i - 1]] + v[i - 1]);
                }
            }
        }
        return dp;
    }

    // ============================================================
    //  2. 回文分割（Palindrome Partitioning - Minimum Cuts）
    // ============================================================

    /**
     * 将字符串分割成回文子串所需的最少切割次数
     * 区间 DP + 回文预处理
     */
    public static int minPalindromePartition(String s) {
        int n = s.length();
        if (n <= 1) return 0;

        // isPal[i][j] = s[i..j] 是否为回文
        boolean[][] isPal = new boolean[n][n];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = i; j < n; j++) {
                if (s.charAt(i) == s.charAt(j) && (j - i <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }

        // dp[i] = s[0..i] 的最小切割次数
        int[] dp = new int[n];
        for (int i = 0; i < n; i++) {
            if (isPal[0][i]) {
                dp[i] = 0;
            } else {
                dp[i] = i; // 最坏情况：每个字符切一刀
                for (int j = 0; j < i; j++) {
                    if (isPal[j + 1][i]) {
                        dp[i] = Math.min(dp[i], dp[j] + 1);
                    }
                }
            }
        }
        return dp[n - 1];
    }

    /**
     * 回文分割——返回所有分割方案（用于验证）
     */
    public static List<List<String>> partition(String s) {
        int n = s.length();
        boolean[][] isPal = new boolean[n][n];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = i; j < n; j++) {
                if (s.charAt(i) == s.charAt(j) && (j - i <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }
        List<List<String>> result = new ArrayList<>();
        backtrack(s, 0, new ArrayList<>(), result, isPal);
        return result;
    }

    private static void backtrack(String s, int start, List<String> path,
                                   List<List<String>> result, boolean[][] isPal) {
        if (start == s.length()) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int end = start; end < s.length(); end++) {
            if (isPal[start][end]) {
                path.add(s.substring(start, end + 1));
                backtrack(s, end + 1, path, result, isPal);
                path.remove(path.size() - 1);
            }
        }
    }

    // ============================================================
    //  3. 编辑距离（Edit Distance / Levenshtein Distance）
    // ============================================================

    /**
     * 编辑距离——计算最小操作次数
     * 操作：插入、删除、替换
     */
    public static int editDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[][] dp = new int[m + 1][n + 1];

        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1],      // 替换
                               Math.min(dp[i - 1][j],          // 删除
                                        dp[i][j - 1])) + 1;   // 插入
                }
            }
        }
        return dp[m][n];
    }

    /**
     * 编辑距离 + 重构具体的编辑操作序列
     * 返回格式: List<String>，如 ["替换 a→c", "删除 b", "插入 e"]
     */
    public static List<String> editDistanceWithOps(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[][] dp = new int[m + 1][n + 1];

        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1],
                               Math.min(dp[i - 1][j],
                                        dp[i][j - 1])) + 1;
                }
            }
        }

        // 回溯操作序列
        List<String> ops = new ArrayList<>();
        int i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && word1.charAt(i - 1) == word2.charAt(j - 1)) {
                ops.add("保留 " + word1.charAt(i - 1));
                i--; j--;
            } else if (i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1) {
                ops.add("替换 " + word1.charAt(i - 1) + "→" + word2.charAt(j - 1));
                i--; j--;
            } else if (i > 0 && dp[i][j] == dp[i - 1][j] + 1) {
                ops.add("删除 " + word1.charAt(i - 1));
                i--;
            } else {
                ops.add("插入 " + word2.charAt(j - 1));
                j--;
            }
        }
        Collections.reverse(ops);
        return ops;
    }

    // ============================================================
    //  打印 DP 表
    // ============================================================

    private static void printDpTable(int[][] dp, String label) {
        System.out.println("  " + label + ":");
        for (int[] row : dp) {
            System.out.print("    ");
            for (int val : row) {
                System.out.printf("%3d ", val);
            }
            System.out.println();
        }
    }

    private static void printBoolTable(boolean[][] table, String label) {
        System.out.println("  " + label + ":");
        for (int i = 0; i < table.length; i++) {
            System.out.print("    ");
            for (int j = 0; j < table[i].length; j++) {
                System.out.print(table[i][j] ? " T " : " . ");
            }
            System.out.println();
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  AdvancedDPProblems —— 进阶 DP 问题演示");
        System.out.println("================================================\n");

        // ---------- 1. 完全背包 ----------
        System.out.println("----- 1. 完全背包（无限物品）-----");
        int[] w = {2, 3, 4};
        int[] v = {3, 4, 5};
        int W = 10;
        System.out.println("  物品: (重量,价值) = (2,3), (3,4), (4,5)  容量=" + W);
        System.out.println("  完全背包最大价值: " + completeKnapsack(W, w, v) + " (期望=15: 选 5 个物品1)");

        int[][] completeTable = completeKnapsackTable(W, w, v);
        printDpTable(completeTable, "完全背包 DP 表");

        // 对比 0/1 背包
        int[] w2 = {2, 3, 4};
        int[] v2 = {3, 4, 5};
        int W2 = 10;
        ClassicDPProblems kp = new ClassicDPProblems();
        int zeroOneVal = ClassicDPProblems.knapsack1D(W2, w2, v2);
        System.out.println("  对比: 0/1 背包同数据: " + zeroOneVal + " (期望=12)");
        System.out.println("  完全背包: " + completeKnapsack(W2, w2, v2) + " (期望=15)");

        // ---------- 2. 回文分割 ----------
        System.out.println("\n----- 2. 回文分割（最小切割次数）-----");
        String s = "aab";
        System.out.println("  字符串: \"" + s + "\"");
        System.out.println("  最小切割次数: " + minPalindromePartition(s) + " (期望=1: aa|b)");

        // 测试更复杂的例子
        String s2 = "abccba";
        System.out.println("  \"" + s2 + "\" 最小切割次数: " + minPalindromePartition(s2) + " (期望=0 已是回文)");

        String s3 = "abcba";
        System.out.println("  \"" + s3 + "\" 最小切割次数: " + minPalindromePartition(s3) + " (期望=0)");

        // 打印回文表
        int n = s.length();
        boolean[][] isPal = new boolean[n][n];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = i; j < n; j++) {
                if (s.charAt(i) == s.charAt(j) && (j - i <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }
        printBoolTable(isPal, "\"" + s + "\" 回文表 isPal[i][j]");

        List<List<String>> partitions = partition(s);
        System.out.println("  所有回文分割方案:");
        for (List<String> p : partitions) {
            System.out.println("    " + p);
        }

        // ---------- 3. 编辑距离 ----------
        System.out.println("\n----- 3. 编辑距离（Levenshtein Distance）-----");
        String wa = "horse", wb = "ros";
        System.out.println("  word1=\"" + wa + "\", word2=\"" + wb + "\"");
        System.out.println("  编辑距离: " + editDistance(wa, wb) + " (期望=3)");

        List<String> ops = editDistanceWithOps(wa, wb);
        System.out.println("  操作序列:");
        for (String op : ops) {
            System.out.println("    " + op);
        }

        String wa2 = "intention", wb2 = "execution";
        System.out.println("  word1=\"" + wa2 + "\", word2=\"" + wb2 + "\"");
        System.out.println("  编辑距离: " + editDistance(wa2, wb2) + " (期望=5)");

        ops = editDistanceWithOps(wa2, wb2);
        System.out.println("  操作序列:");
        for (String op : ops) {
            System.out.println("    " + op);
        }

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}