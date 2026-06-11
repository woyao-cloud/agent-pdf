package masteralgo.chapter08;

import java.util.*;

/**
 * 贪心算法 vs 动态规划 —— 同题对比
 *
 * 对比问题：
 * 1. 硬币找零（Coin Change）：贪心在某些面值系统失效
 * 2. 活动选择（Activity Selection）：两者结果一致但效率不同
 *
 * 输出详细步骤对比，展示两种算法的决策差异
 */
public class GreedyVsDP {

    // ============================================================
    //  1. 硬币找零 —— 贪心
    // ============================================================

    /**
     * 贪心找零：每次选面值最大的可用硬币
     * @return 最少硬币数，-1 表示无法凑出
     */
    public static int coinChangeGreedy(int[] coins, int amount) {
        int[] sorted = coins.clone();
        Arrays.sort(sorted);
        int count = 0, rem = amount;
        for (int i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i] <= rem) {
                count += rem / sorted[i];
                rem %= sorted[i];
            }
        }
        return rem == 0 ? count : -1;
    }

    /**
     * 贪心找零 + 打印方案
     */
    public static String coinChangeGreedyDetail(int[] coins, int amount) {
        int[] sorted = coins.clone();
        Arrays.sort(sorted);
        StringBuilder sb = new StringBuilder();
        int rem = amount;
        for (int i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i] <= rem) {
                int num = rem / sorted[i];
                if (num > 0) {
                    if (sb.length() > 0) sb.append(" + ");
                    sb.append(num).append("×").append(sorted[i]);
                }
                rem %= sorted[i];
            }
        }
        return rem == 0 ? sb.toString() : "无解";
    }

    // ============================================================
    //  1. 硬币找零 —— DP
    // ============================================================

    /**
     * DP 找零：保证全局最优
     * 状态: dp[i] = 凑出金额 i 的最小硬币数
     * 转移: dp[i] = min(dp[i], dp[i-coin] + 1)
     */
    public static int coinChangeDP(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++) {
            for (int c : coins) {
                if (c <= i) {
                    dp[i] = Math.min(dp[i], dp[i - c] + 1);
                }
            }
        }
        return dp[amount] > amount ? -1 : dp[amount];
    }

    /**
     * DP 找零 + 打印方案（回溯版）
     */
    public static String coinChangeDPDetail(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        int[] first = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++) {
            for (int c : coins) {
                if (c <= i && dp[i - c] + 1 < dp[i]) {
                    dp[i] = dp[i - c] + 1;
                    first[i] = c;
                }
            }
        }
        if (dp[amount] > amount) return "无解";
        StringBuilder sb = new StringBuilder();
        int rem = amount;
        // 统计每种硬币数量
        Map<Integer, Integer> cnt = new TreeMap<>(Comparator.reverseOrder());
        while (rem > 0) {
            int c = first[rem];
            cnt.put(c, cnt.getOrDefault(c, 0) + 1);
            rem -= c;
        }
        boolean firstItem = true;
        for (Map.Entry<Integer, Integer> e : cnt.entrySet()) {
            if (!firstItem) sb.append(" + ");
            sb.append(e.getValue()).append("×").append(e.getKey());
            firstItem = false;
        }
        return sb.toString();
    }

    // ============================================================
    //  2. 活动选择 —— 贪心
    // ============================================================

    static class Act {
        int id, start, end;
        Act(int i, int s, int e) { id = i; start = s; end = e; }
        public String toString() { return "A" + id + "(" + start + "," + end + ")"; }
    }

    /**
     * 活动选择——贪心
     * 策略：按结束时间排序，每次选结束最早且不冲突的
     */
    public static List<Act> activitySelectionGreedy(Act[] acts) {
        int n = acts.length;
        Act[] sorted = acts.clone();
        Arrays.sort(sorted, (a, b) -> a.end - b.end);

        List<Act> result = new ArrayList<>();
        result.add(sorted[0]);
        int lastEnd = sorted[0].end;

        System.out.print("    排序后的活动: ");
        for (Act a : sorted) System.out.print(a + " ");
        System.out.println();

        for (int i = 1; i < n; i++) {
            if (sorted[i].start >= lastEnd) {
                result.add(sorted[i]);
                lastEnd = sorted[i].end;
            }
        }
        return result;
    }

    // ============================================================
    //  2. 活动选择 —— DP
    // ============================================================

    /**
     * 活动选择——DP
     * 思路：按结束时间排序后，dp[i] = max(dp[i-1], dp[prev[i]] + 1)
     *       prev[i] = 与 i 不冲突的最近一个活动的下标
     */
    public static List<Act> activitySelectionDP(Act[] acts) {
        int n = acts.length;
        Act[] sorted = acts.clone();
        Arrays.sort(sorted, (a, b) -> a.end - b.end);

        // 计算 prev[i]：在 i 之前且与 i 不冲突的最近活动
        int[] prev = new int[n];
        Arrays.fill(prev, -1);
        for (int i = 0; i < n; i++) {
            for (int j = i - 1; j >= 0; j--) {
                if (sorted[j].end <= sorted[i].start) {
                    prev[i] = j;
                    break;
                }
            }
        }

        // DP 填表
        int[] dp = new int[n];
        int[] choice = new int[n]; // 0=不选, 1=选
        dp[0] = 1;
        choice[0] = 1;

        for (int i = 1; i < n; i++) {
            int take = (prev[i] == -1) ? 1 : dp[prev[i]] + 1;
            int skip = dp[i - 1];
            if (take >= skip) {
                dp[i] = take;
                choice[i] = 1;
            } else {
                dp[i] = skip;
                choice[i] = 0;
            }
        }

        // 打印 DP 表
        System.out.print("    DP表: dp[i]=");
        for (int i = 0; i < n; i++) System.out.printf("%2d ", dp[i]);
        System.out.println();

        // 回溯
        List<Act> result = new ArrayList<>();
        int i = n - 1;
        while (i >= 0) {
            if (choice[i] == 1) {
                result.add(sorted[i]);
                i = prev[i];
            } else {
                i--;
            }
        }
        Collections.reverse(result);
        return result;
    }

    // ============================================================
    //  对比打印
    // ============================================================

    private static void printComparison(String title, String rowName,
                                        Object greedyRes, Object dpRes,
                                        String greedyDetail, String dpDetail,
                                        boolean match, String timeG, String timeDP) {
        System.out.println("  " + title);
        System.out.println("  " + "-".repeat(60));
        System.out.printf("  %-12s %-20s %-20s%n", rowName, "贪心算法", "动态规划");
        System.out.println("  " + "-".repeat(60));
        System.out.printf("  %-12s %-20s %-20s%n", "结果", greedyRes, dpRes);
        System.out.printf("  %-12s %-20s %-20s%n", "方案", greedyDetail, dpDetail);
        System.out.printf("  %-12s %-20s %-20s%n", "复杂度", timeG, timeDP);
        System.out.println("  " + "-".repeat(60));
        System.out.println("  是否一致: " + (match ? "✔ 一致" : "✘ 不一致！"));
        System.out.println();
    }

    // ============================================================
    //  main
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  GreedyVsDP —— 贪心 vs 动态规划同题对比");
        System.out.println("================================================\n");

        // ============================================================
        //  对比 1：硬币找零
        // ============================================================
        System.out.println("【对比 1】硬币找零（Coin Change）\n");

        // 用例 A：美元硬币系统（贪心有效）
        System.out.println("  用例 A：美元硬币 {25, 10, 5, 1}，金额 63");
        int[] usCoins = {25, 10, 5, 1};
        int amt1 = 63;
        int g1 = coinChangeGreedy(usCoins, amt1);
        int d1 = coinChangeDP(usCoins, amt1);
        printComparison(
                "  美元硬币系统（贪心应有效）",
                "金额=63",
                g1 + " 枚", d1 + " 枚",
                coinChangeGreedyDetail(usCoins, amt1),
                coinChangeDPDetail(usCoins, amt1),
                g1 == d1,
                "O(n)=O(4)", "O(n×A)=O(4×63)"
        );

        // 用例 B：自定义面值（贪心失败！）
        System.out.println("  用例 B：自定义面值 {1, 3, 4}，金额 6（经典反例）");
        int[] customCoins = {1, 3, 4};
        int amt2 = 6;
        int g2 = coinChangeGreedy(customCoins, amt2);
        int d2 = coinChangeDP(customCoins, amt2);
        printComparison(
                "  自定义面值（贪心应失败）",
                "金额=6",
                g2 + " 枚", d2 + " 枚",
                coinChangeGreedyDetail(customCoins, amt2),
                coinChangeDPDetail(customCoins, amt2),
                g2 == d2,
                "O(n)=O(3)", "O(n×A)=O(3×6)"
        );

        // 多金额对比表
        System.out.println("  多金额对比表：自定义面值 {1, 3, 4}");
        System.out.println("  " + "-".repeat(42));
        System.out.println("  " + String.format("%-8s %-10s %-10s %-10s", "金额", "贪心", "DP", "正确?"));
        System.out.println("  " + "-".repeat(42));
        boolean allMatch = true;
        for (int amt : new int[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}) {
            int g = coinChangeGreedy(customCoins, amt);
            int d = coinChangeDP(customCoins, amt);
            boolean ok = g == d;
            if (!ok) allMatch = false;
            System.out.println("  " + String.format("%-8d %-10s %-10s %-10s",
                    amt,
                    g == -1 ? "无解" : g + "枚",
                    d == -1 ? "无解" : d + "枚",
                    ok ? "✔" : "✘"));
        }
        System.out.println("  " + "-".repeat(42));
        System.out.println("  全部一致? " + (allMatch ? "✔ 是（当前用例恰好一致）" : "✘ 否（贪心在某些金额失败）"));

        // 解释贪心为什么失败
        System.out.println("\n  贪心失败原因分析：");
        System.out.println("    金额 6：贪心选 4+1+1=3枚，最优 3+3=2枚");
        System.out.println("    金额 8：贪心选 4+4=2枚，最优也是 4+4=2枚（巧合）");
        System.out.println("    结论：面值 {1,3,4} 中 4 不是 3 的倍数，破坏了贪心选择性质");
        System.out.println();

        // ============================================================
        //  对比 2：活动选择
        // ============================================================
        System.out.println("【对比 2】活动选择（Activity Selection）\n");

        Act[] acts = {
                new Act(1, 1, 4), new Act(2, 3, 5), new Act(3, 0, 6),
                new Act(4, 5, 7), new Act(5, 3, 8), new Act(6, 5, 9),
                new Act(7, 6, 10), new Act(8, 8, 11), new Act(9, 8, 12),
                new Act(10, 2, 13), new Act(11, 12, 14)
        };

        System.out.print("  所有活动: ");
        for (Act a : acts) System.out.print(a + " ");
        System.out.println("\n");

        // 贪心
        System.out.println("  贪心算法过程：");
        List<Act> gActs = activitySelectionGreedy(acts);
        System.out.print("    贪心选择: ");
        for (Act a : gActs) System.out.print(a + " ");
        System.out.println("  共 " + gActs.size() + " 个");

        // DP
        System.out.println("\n  DP算法过程：");
        List<Act> dActs = activitySelectionDP(acts);
        System.out.print("    DP选择: ");
        for (Act a : dActs) System.out.print(a + " ");
        System.out.println("  共 " + dActs.size() + " 个");

        // 对比
        System.out.println("\n  对比总结：");
        System.out.println("  " + "-".repeat(60));
        System.out.printf("  %-12s %-22s %-22s%n", "", "贪心算法", "动态规划");
        System.out.println("  " + "-".repeat(60));
        System.out.printf("  %-12s %-22s %-22s%n", "结果", gActs.size() + " 个", dActs.size() + " 个");
        System.out.printf("  %-12s %-22s %-22s%n", "一致?", gActs.size() == dActs.size() ? "✔ 一致" : "✘ 不一致", "");
        System.out.printf("  %-12s %-22s %-22s%n", "时间复杂度", "O(n log n)", "O(n log n) + O(n)");
        System.out.printf("  %-12s %-22s %-22s%n", "空间复杂度", "O(1)", "O(n)");
        System.out.println("  " + "-".repeat(60));
        System.out.println("  结论：对于活动选择问题，贪心算法与 DP 结果一致，");
        System.out.println("        但贪心更简洁高效，无需 DP 表空间。");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}