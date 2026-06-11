package masteralgo.chapter03;

import java.util.Arrays;

/**
 * 贪心算法 vs 动态规划 —— 硬币找零问题对比
 *
 * 问题：给定不同面值的硬币和一个目标金额，求凑出该金额所需的最少硬币数。
 *
 * 两种解法对比：
 *   1. 贪心算法（Greedy）：每次选面值最大的可用硬币
 *      - 在美元硬币系统（25, 10, 5, 1）中有效
 *      - 在任意面值系统中可能失败
 *   2. 动态规划（DP）：保证找到全局最优解
 *      - 适用于任意面值系统
 *      - 时间复杂度 O(n * amount)
 *
 * @author master-algorithm-java
 */
public class GreedyVsDPDemo {

    // ============================================================
    // 贪心算法求解硬币找零
    // 时间复杂度：O(n)，其中 n 是硬币种类数
    // 思路：每次选择面值最大的、不超过剩余金额的硬币
    // ============================================================
    public static int coinChangeGreedy(int[] coins, int amount) {
        // 先对硬币面值排序（从大到小），以便优先使用大面值
        int[] sortedCoins = coins.clone();
        Arrays.sort(sortedCoins);

        int count = 0;
        int remaining = amount;

        // 从最大面值开始尝试
        for (int i = sortedCoins.length - 1; i >= 0; i--) {
            if (sortedCoins[i] <= remaining) {
                // 尽可能多地使用当前面值的硬币
                int num = remaining / sortedCoins[i];
                count += num;
                remaining -= num * sortedCoins[i];
            }
        }

        // 如果剩余金额 > 0，说明贪心无法精确凑出该金额
        if (remaining > 0) {
            return -1; // 无解
        }
        return count;
    }

    // ============================================================
    // 动态规划求解硬币找零
    // 时间复杂度：O(n * amount)，空间复杂度：O(amount)
    //
    // 状态定义：dp[i] 表示凑出金额 i 所需的最少硬币数
    // 状态转移：dp[i] = min(dp[i], dp[i - coin] + 1)  for each coin
    // 初始条件：dp[0] = 0，dp[others] = INF
    // ============================================================
    public static int coinChangeDP(int[] coins, int amount) {
        // dp[i] 表示凑出金额 i 所需的最少硬币数
        int[] dp = new int[amount + 1];

        // 初始化：用一个很大的数表示"尚未求解"
        Arrays.fill(dp, amount + 1);
        dp[0] = 0; // 凑出 0 元需要 0 枚硬币

        // 自底向上计算所有金额的最少硬币数
        for (int i = 1; i <= amount; i++) {
            for (int coin : coins) {
                if (coin <= i) {
                    // dp[i - coin] 是凑出剩余金额所需的最少硬币数
                    // 加上当前这枚硬币（+1），就是凑出 i 的一种方案
                    dp[i] = Math.min(dp[i], dp[i - coin] + 1);
                }
            }
        }

        // 如果 dp[amount] 仍然是大数，说明无法凑出
        return dp[amount] > amount ? -1 : dp[amount];
    }

    /**
     * 打印贪心算法的详细找零方案
     */
    public static String greedyDetail(int[] coins, int amount) {
        int[] sortedCoins = coins.clone();
        Arrays.sort(sortedCoins);

        StringBuilder sb = new StringBuilder();
        int remaining = amount;

        for (int i = sortedCoins.length - 1; i >= 0; i--) {
            if (sortedCoins[i] <= remaining) {
                int num = remaining / sortedCoins[i];
                if (num > 0) {
                    if (sb.length() > 0) {
                        sb.append(" + ");
                    }
                    sb.append(num).append("×").append(sortedCoins[i]);
                    remaining -= num * sortedCoins[i];
                }
            }
        }

        if (remaining > 0) {
            return "无法精确凑出";
        }
        return sb.toString();
    }

    /**
     * 打印 DP 算法的详细找零方案（回溯版）
     */
    public static String dpDetail(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        int[] firstCoin = new int[amount + 1]; // 记录凑出金额 i 时使用的第一枚硬币

        Arrays.fill(dp, amount + 1);
        dp[0] = 0;

        for (int i = 1; i <= amount; i++) {
            for (int coin : coins) {
                if (coin <= i && dp[i - coin] + 1 < dp[i]) {
                    dp[i] = dp[i - coin] + 1;
                    firstCoin[i] = coin; // 记录选择
                }
            }
        }

        if (dp[amount] > amount) {
            return "无法精确凑出";
        }

        // 回溯找出方案
        StringBuilder sb = new StringBuilder();
        int remaining = amount;
        while (remaining > 0) {
            int coin = firstCoin[remaining];
            if (sb.length() > 0) {
                sb.append(" + ");
            }
            sb.append(coin);
            remaining -= coin;
        }
        return sb.toString();
    }

    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  贪心算法 vs 动态规划：硬币找零问题");
        System.out.println("============================================\n");

        // ----------------------------------------------------------
        // 用例一：美元硬币系统（贪心有效）
        // ----------------------------------------------------------
        System.out.println("【用例一】美元硬币系统: 面值 {25, 10, 5, 1}");
        int[] usCoins = {25, 10, 5, 1};
        int amount1 = 63;

        System.out.println("  目标金额: " + amount1);
        int greedyResult1 = coinChangeGreedy(usCoins, amount1);
        int dpResult1 = coinChangeDP(usCoins, amount1);
        System.out.println("  贪心方案: " + greedyDetail(usCoins, amount1)
                + " → " + greedyResult1 + " 枚");
        System.out.println("  DP 方案:  " + dpDetail(usCoins, amount1)
                + " → " + dpResult1 + " 枚");
        System.out.println("  结果一致: " + (greedyResult1 == dpResult1 ? "✔" : "✘"));
        System.out.println();

        // ----------------------------------------------------------
        // 用例二：自定义面值（贪心失败！）
        // ----------------------------------------------------------
        System.out.println("【用例二】自定义面值: 面值 {1, 3, 4}，目标 6");
        System.out.println("  （这是一个经典的反例：贪心会失败）");
        int[] customCoins = {1, 3, 4};
        int amount2 = 6;

        System.out.println("  目标金额: " + amount2);
        int greedyResult2 = coinChangeGreedy(customCoins, amount2);
        int dpResult2 = coinChangeDP(customCoins, amount2);
        System.out.println("  贪心方案: " + greedyDetail(customCoins, amount2)
                + " → " + greedyResult2 + " 枚");
        System.out.println("  DP 方案:  " + dpDetail(customCoins, amount2)
                + " → " + dpResult2 + " 枚");
        System.out.println("  贪心解 = DP 解？"
                + (greedyResult2 == dpResult2 ? "✔ 是（巧合）" : "✘ 否（贪心失败！）"));
        System.out.println("  解释：贪心选 4 后剩余 2，需要两个 1，共 3 枚");
        System.out.println("        最优解是两个 3，共 2 枚");
        System.out.println();

        // ----------------------------------------------------------
        // 用例三：多个目标金额对比
        // ----------------------------------------------------------
        System.out.println("【用例三】自定义面值 {1, 3, 4} 多个目标金额对比");
        System.out.println("  " + "-".repeat(55));
        System.out.println("  " + String.format("%-10s %-12s %-12s %-12s", "金额", "贪心", "DP", "贪心正确?"));
        System.out.println("  " + "-".repeat(55));
        for (int amt : new int[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}) {
            int g = coinChangeGreedy(customCoins, amt);
            int d = coinChangeDP(customCoins, amt);
            System.out.println("  " + String.format("%-10d %-12s %-12s %-12s",
                    amt,
                    g == -1 ? "无解" : g + "枚",
                    d == -1 ? "无解" : d + "枚",
                    g == d ? (g == -1 ? "都无解" : "✔") : "✘"));
        }
        System.out.println("  " + "-".repeat(55));
        System.out.println();

        // ----------------------------------------------------------
        // 性能对比
        // ----------------------------------------------------------
        System.out.println("【性能对比】面值 {1, 5, 10, 25}，大金额测试");
        int[] coins = {1, 5, 10, 25};
        int[] testAmounts = {100, 1000, 10000};

        for (int amt : testAmounts) {
            long startG = System.nanoTime();
            int gRes = coinChangeGreedy(coins, amt);
            long endG = System.nanoTime();

            long startD = System.nanoTime();
            int dRes = coinChangeDP(coins, amt);
            long endD = System.nanoTime();

            System.out.printf("  金额 %d: 贪心=%d枚(%dns), DP=%d枚(%dns)%n",
                    amt, gRes, (endG - startG), dRes, (endD - startD));
        }
        System.out.println("  结论：贪心 O(n) 远快于 DP O(n*amount)，但通用性不如 DP");
    }
}