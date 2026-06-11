package masteralgo.chapter18;

import java.util.*;

/**
 * PageRank 演示——幂迭代法
 *
 * 构建一个小型网页链接图（6-9 个页面），
 * 用幂迭代法计算每个页面的 PageRank 值，
 * 输出迭代收敛过程，展示 Top-N 重要页面。
 */
public class PageRankDemo {

    // 阻尼因子
    private static final double D = 0.85;
    // 收敛阈值
    private static final double EPS = 1e-8;
    // 最大迭代次数
    private static final int MAX_ITER = 1000;

    /**
     * 计算 PageRank
     *
     * @param graph       邻接表：page -> 出链页面列表
     * @param pageNames   页面名称数组（下标与 graph 对应）
     */
    static Map<String, Double> pageRank(List<List<Integer>> graph, String[] pageNames) {
        int N = graph.size();
        if (N == 0) return Collections.emptyMap();

        // 统计每个页面的出度
        int[] outDegree = new int[N];
        for (int i = 0; i < N; i++) {
            outDegree[i] = graph.get(i).size();
        }

        // 构建入链列表（指向每个页面的页面列表）
        List<List<Integer>> inLinks = new ArrayList<>();
        for (int i = 0; i < N; i++) inLinks.add(new ArrayList<>());
        for (int i = 0; i < N; i++) {
            for (int to : graph.get(i)) {
                inLinks.get(to).add(i);
            }
        }

        // 初始化 PR 值 = 1/N
        double[] rank = new double[N];
        Arrays.fill(rank, 1.0 / N);

        double teleport = (1.0 - D) / N; // 随机跳转项

        System.out.printf("%-10s %s\n", "迭代", "收敛变化(max|Δ|)");
        System.out.println("-".repeat(40));

        for (int iter = 1; iter <= MAX_ITER; iter++) {
            double[] newRank = new double[N];

            for (int i = 0; i < N; i++) {
                double sum = 0;
                for (int j : inLinks.get(i)) {
                    if (outDegree[j] > 0) {
                        sum += rank[j] / outDegree[j];
                    } else {
                        // 悬挂节点：假设链接到所有页面
                        sum += rank[j] / N;
                    }
                }
                newRank[i] = teleport + D * sum;
            }

            // 归一化（确保和为 1）
            double total = 0;
            for (double v : newRank) total += v;
            for (int i = 0; i < N; i++) newRank[i] /= total;

            // 计算最大变化量
            double maxDiff = 0;
            for (int i = 0; i < N; i++) {
                maxDiff = Math.max(maxDiff, Math.abs(newRank[i] - rank[i]));
            }

            rank = newRank;

            // 每 5 次迭代打印一次
            if (iter <= 10 || iter % 20 == 0 || maxDiff < EPS) {
                System.out.printf("%-10d %.2e\n", iter, maxDiff);
            }

            if (maxDiff < EPS) {
                System.out.printf("  （第 %d 次迭代收敛）\n", iter);
                break;
            }
        }

        // 组装结果
        Map<String, Double> result = new LinkedHashMap<>();
        for (int i = 0; i < N; i++) {
            result.put(pageNames[i], rank[i]);
        }
        return result;
    }

    // ============================================================
    //  主程序
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== PageRank 演示 ===\n");

        // 构建小型 Web 图（8 个页面）
        String[] pageNames = {
            "A-首页", "B-新闻", "C-博客", "D-图片",
            "E-视频", "F-论坛", "G-百科", "H-关于"
        };

        // 邻接表（出链）
        // A → B, C, D
        // B → A, C
        // C → A, E, F
        // D → C, G
        // E → C, F, H
        // F → E, G
        // G → C, H
        // H → A
        List<List<Integer>> graph = new ArrayList<>();
        graph.add(Arrays.asList(1, 2, 3));          // A
        graph.add(Arrays.asList(0, 2));             // B
        graph.add(Arrays.asList(0, 4, 5));          // C
        graph.add(Arrays.asList(2, 6));             // D
        graph.add(Arrays.asList(2, 5, 7));          // E
        graph.add(Arrays.asList(4, 6));             // F
        graph.add(Arrays.asList(2, 7));             // G
        graph.add(Arrays.asList(0));                // H

        Map<String, Double> ranks = pageRank(graph, pageNames);

        // 输出结果
        System.out.println("\n各页面 PageRank 值：");
        System.out.println("-".repeat(40));
        for (Map.Entry<String, Double> e : ranks.entrySet()) {
            System.out.printf("  %-12s %.6f\n", e.getKey(), e.getValue());
        }

        // 排序输出 Top-N
        System.out.println("\n页面重要性排序 Top-3：");
        System.out.println("-".repeat(40));
        List<Map.Entry<String, Double>> sorted = ranks.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .limit(3)
            .toList();
        for (int i = 0; i < sorted.size(); i++) {
            System.out.printf("  %d. %-12s (PR = %.6f)\n",
                i + 1, sorted.get(i).getKey(), sorted.get(i).getValue());
        }

        // 验证：PR 值之和应为 1
        double sum = ranks.values().stream().mapToDouble(Double::doubleValue).sum();
        System.out.printf("\nPR 值总和: %.6f %s\n", sum,
            Math.abs(sum - 1.0) < 1e-6 ? "✓" : "✗");
        assert Math.abs(sum - 1.0) < 1e-6 : "PR 值之和不为 1";
    }
}