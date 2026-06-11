package masteralgo.chapter18;

import java.util.*;

/**
 * 协同过滤推荐系统演示
 *
 * 功能：
 * 1. 构建用户-物品评分矩阵
 * 2. 基于用户的协同过滤（皮尔逊相关系数作为相似度）
 * 3. 为目标用户预测未评分物品的评分
 * 4. 输出 Top-N 推荐
 */
public class CollaborativeFilteringDemo {

    // 用户 ID 列表
    static final String[] USERS = {"Alice", "Bob", "Charlie", "Diana", "Eve"};
    // 物品（电影）名称
    static final String[] MOVIES = {
        "肖申克的救赎", "盗梦空间", "星际穿越",
        "楚门的世界", "千与千寻", "泰坦尼克号"
    };

    /**
     * 计算皮尔逊相关系数
     *
     * @param ratings 用户-物品评分矩阵
     * @param uIdx    用户 u 的索引
     * @param vIdx    用户 v 的索引
     * @return 相关系数 [-1, 1]
     */
    static double pearsonCorrelation(double[][] ratings, int uIdx, int vIdx) {
        int m = ratings[0].length;
        // 找到共同评分项
        List<Integer> common = new ArrayList<>();
        for (int j = 0; j < m; j++) {
            if (ratings[uIdx][j] > 0 && ratings[vIdx][j] > 0) {
                common.add(j);
            }
        }
        int n = common.size();
        if (n < 2) return 0; // 共同项太少，无意义

        // 计算用户 u 和 v 在共同项上的均值和协方差
        double sumU = 0, sumV = 0;
        for (int idx : common) {
            sumU += ratings[uIdx][idx];
            sumV += ratings[vIdx][idx];
        }
        double meanU = sumU / n;
        double meanV = sumV / n;

        double cov = 0, varU = 0, varV = 0;
        for (int idx : common) {
            double diffU = ratings[uIdx][idx] - meanU;
            double diffV = ratings[vIdx][idx] - meanV;
            cov += diffU * diffV;
            varU += diffU * diffU;
            varV += diffV * diffV;
        }

        double denom = Math.sqrt(varU * varV);
        if (denom == 0) return 0;
        return cov / denom;
    }

    /**
     * 基于用户的协同过滤——预测用户 u 对物品 j 的评分
     *
     * @param ratings   用户-物品评分矩阵（0 表示未评分）
     * @param uIdx      目标用户
     * @param jIdx      目标物品
     * @param topK      取前 K 个最相似用户
     * @return 预测评分
     */
    static double predictRating(double[][] ratings, int uIdx, int jIdx, int topK) {
        int n = ratings.length;
        // 计算目标用户与其他用户的相似度
        List<Similarity> sims = new ArrayList<>();
        for (int v = 0; v < n; v++) {
            if (v == uIdx) continue;
            // 要求用户 v 评分过物品 j
            if (ratings[v][jIdx] <= 0) continue;
            double sim = pearsonCorrelation(ratings, uIdx, v);
            if (sim > 0) { // 仅使用正相关用户
                sims.add(new Similarity(v, sim));
            }
        }

        // 按相似度降序排列，取 topK
        sims.sort((a, b) -> Double.compare(b.sim, a.sim));
        if (sims.isEmpty()) return 0;

        int k = Math.min(topK, sims.size());
        double weightedSum = 0, simSum = 0;
        for (int i = 0; i < k; i++) {
            int v = sims.get(i).userIdx;
            double s = sims.get(i).sim;
            weightedSum += s * ratings[v][jIdx];
            simSum += Math.abs(s);
        }

        if (simSum == 0) return 0;
        return weightedSum / simSum;
    }

    static class Similarity {
        int userIdx;
        double sim;
        Similarity(int userIdx, double sim) {
            this.userIdx = userIdx;
            this.sim = sim;
        }
    }

    // ============================================================
    //  主程序
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 协同过滤推荐系统演示 ===\n");

        int nUsers = USERS.length;
        int nMvies = MOVIES.length;

        // 手动构造评分矩阵（1-5 分，0 表示未评分）
        double[][] ratings = {
            {5, 4, 0, 3, 5, 2},  // Alice
            {3, 5, 4, 0, 4, 5},  // Bob
            {4, 0, 5, 5, 3, 0},  // Charlie
            {0, 3, 4, 4, 0, 5},  // Diana
            {5, 4, 3, 0, 5, 1},  // Eve
        };

        // 打印评分矩阵
        System.out.printf("%-10s", "");
        for (String mv : MOVIES) System.out.printf("%-12s", mv);
        System.out.println();
        for (int i = 0; i < nUsers; i++) {
            System.out.printf("%-10s", USERS[i]);
            for (int j = 0; j < nMvies; j++) {
                if (ratings[i][j] > 0)
                    System.out.printf("%-12.0f", ratings[i][j]);
                else
                    System.out.printf("%-12s", "?");
            }
            System.out.println();
        }

        // 为目标用户预测未评分电影
        int targetUser = 0; // Alice
        System.out.printf("\n为 %s 预测未评分电影的评分（topK=2）：\n", USERS[targetUser]);
        System.out.println("-".repeat(50));

        List<Recommendation> recs = new ArrayList<>();
        for (int j = 0; j < nMvies; j++) {
            if (ratings[targetUser][j] == 0) { // 未评分
                double pred = predictRating(ratings, targetUser, j, 2);
                if (pred > 0) {
                    recs.add(new Recommendation(MOVIES[j], pred));
                    System.out.printf("  %-12s → 预测评分: %.2f\n", MOVIES[j], pred);
                }
            }
        }

        // Top-N 推荐
        System.out.println("\nTop-3 推荐给 Alice 的电影：");
        System.out.println("-".repeat(40));
        recs.sort((a, b) -> Double.compare(b.score, a.score));
        for (int i = 0; i < Math.min(3, recs.size()); i++) {
            System.out.printf("  %d. %-12s (%.2f)\n",
                i + 1, recs.get(i).item, recs.get(i).score);
        }

        // 验证相似度合理性
        System.out.println("\nAlice 与其他用户的相似度：");
        System.out.println("-".repeat(40));
        for (int i = 1; i < nUsers; i++) {
            double sim = pearsonCorrelation(ratings, 0, i);
            System.out.printf("  Alice ↔ %s: %.4f\n", USERS[i], sim);
        }
    }

    static class Recommendation {
        String item;
        double score;
        Recommendation(String item, double score) {
            this.item = item;
            this.score = score;
        }
    }
}