package masteralgo.chapter14;

import java.util.*;

/**
 * 近似算法演示：顶点覆盖 2-近似、集合覆盖贪心 O(log n) 近似、TSP MST-based 2-近似
 *
 * 功能：
 * 1. Vertex Cover：基于极大匹配的 2-近似
 * 2. Set Cover：贪心 O(log n) 近似
 * 3. TSP：基于最小生成树 + 前序遍历的 2-近似（满足三角不等式）
 */
public class ApproximationAlgorithms {

    // ============================================================
    //  1. 顶点覆盖 —— 基于极大匹配的 2-近似
    // ============================================================

    /**
     * 顶点覆盖 2-近似算法（基于极大匹配）
     * @param n 顶点数
     * @param edges 边列表
     * @return 顶点覆盖集合
     */
    static Set<Integer> vertexCover2Approx(int n, List<int[]> edges) {
        Set<Integer> cover = new HashSet<>();
        boolean[] covered = new boolean[n];
        for (int[] e : edges) {
            int u = e[0], v = e[1];
            // 若边的两个端点都未被覆盖，则加入覆盖集
            if (!covered[u] && !covered[v]) {
                cover.add(u);
                cover.add(v);
                covered[u] = true;
                covered[v] = true;
            }
        }
        return cover;
    }

    /** 验证顶点覆盖是否有效 */
    static boolean isValidVertexCover(int n, List<int[]> edges, Set<Integer> cover) {
        for (int[] e : edges) {
            if (!cover.contains(e[0]) && !cover.contains(e[1]))
                return false;
        }
        return true;
    }

    // ============================================================
    //  2. 集合覆盖 —— 贪心 O(log n) 近似
    // ============================================================

    /**
     * 集合覆盖贪心近似算法
     * @param universe 全集元素列表
     * @param subsets 子集列表（每个子集是元素列表）
     * @return 选中的子集索引列表
     */
    static List<Integer> greedySetCover(Set<Integer> universe, List<Set<Integer>> subsets) {
        Set<Integer> uncovered = new HashSet<>(universe);
        List<Integer> chosen = new ArrayList<>();
        boolean[] used = new boolean[subsets.size()];

        while (!uncovered.isEmpty()) {
            int bestIdx = -1;
            int bestCnt = 0;
            // 找到覆盖最多未覆盖元素的子集
            for (int i = 0; i < subsets.size(); i++) {
                if (used[i]) continue;
                Set<Integer> s = subsets.get(i);
                int cnt = 0;
                for (int e : s) {
                    if (uncovered.contains(e)) cnt++;
                }
                if (cnt > bestCnt) {
                    bestCnt = cnt;
                    bestIdx = i;
                }
            }
            if (bestIdx == -1) break;
            used[bestIdx] = true;
            chosen.add(bestIdx);
            uncovered.removeAll(subsets.get(bestIdx));
        }
        return chosen;
    }

    /**
     * 验证集合覆盖是否有效
     * @return true 如果选中的子集覆盖全集
     */
    static boolean isValidSetCover(Set<Integer> universe, List<Set<Integer>> subsets,
                                   List<Integer> chosen) {
        Set<Integer> covered = new HashSet<>();
        for (int idx : chosen) covered.addAll(subsets.get(idx));
        return covered.containsAll(universe);
    }

    // ============================================================
    //  3. TSP —— MST-based 2-近似（三角不等式）
    // ============================================================

    /**
     * TSP 2-近似：基于 MST 前序遍历
     * @param dist 距离矩阵（满足三角不等式）
     * @return TSP回路（顶点序列，首尾相同）
     */
    static List<Integer> tsp2Approx(double[][] dist) {
        int n = dist.length;
        // 1. Prim 求 MST（邻接矩阵实现）
        double[] key = new double[n];
        int[] parent = new int[n];
        boolean[] inMST = new boolean[n];
        Arrays.fill(key, Double.MAX_VALUE);
        key[0] = 0;
        parent[0] = -1;

        for (int count = 0; count < n - 1; count++) {
            int u = -1;
            double minKey = Double.MAX_VALUE;
            for (int i = 0; i < n; i++) {
                if (!inMST[i] && key[i] < minKey) {
                    minKey = key[i];
                    u = i;
                }
            }
            if (u == -1) break;
            inMST[u] = true;

            for (int v = 0; v < n; v++) {
                if (!inMST[v] && dist[u][v] < key[v]) {
                    key[v] = dist[u][v];
                    parent[v] = u;
                }
            }
        }

        // 2. 用邻接表构建MST
        List<Integer>[] mst = new ArrayList[n];
        for (int i = 0; i < n; i++) mst[i] = new ArrayList<>();
        for (int v = 1; v < n; v++) {
            if (parent[v] != -1) {
                mst[parent[v]].add(v);
                mst[v].add(parent[v]);
            }
        }

        // 3. 前序遍历MST得到回路
        boolean[] visited = new boolean[n];
        List<Integer> tour = new ArrayList<>();
        dfsTSP(0, mst, visited, tour);
        tour.add(0); // 回到起点
        return tour;
    }

    private static void dfsTSP(int u, List<Integer>[] mst,
                                boolean[] visited, List<Integer> tour) {
        visited[u] = true;
        tour.add(u);
        for (int v : mst[u]) {
            if (!visited[v]) dfsTSP(v, mst, visited, tour);
        }
    }

    /** 计算 TSP 回路总距离 */
    static double tourDistance(List<Integer> tour, double[][] dist) {
        double total = 0;
        for (int i = 0; i < tour.size() - 1; i++) {
            total += dist[tour.get(i)][tour.get(i + 1)];
        }
        return total;
    }

    // ============================================================
    // 主方法：构建示例并运行算法
    // ============================================================

    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  近似算法演示");
        System.out.println("==========================================");
        System.out.println();

        // ---------- 1. 顶点覆盖 ----------
        System.out.println("--- [顶点覆盖 Vertex Cover] ---");
        // 构建一个简单图：6个顶点，边如下
        // 0-1, 0-2, 1-2, 1-3, 2-4, 3-4, 3-5, 4-5
        int nVC = 6;
        List<int[]> vcEdges = Arrays.asList(
            new int[]{0,1}, new int[]{0,2}, new int[]{1,2},
            new int[]{1,3}, new int[]{2,4}, new int[]{3,4},
            new int[]{3,5}, new int[]{4,5}
        );
        Set<Integer> vc = vertexCover2Approx(nVC, vcEdges);
        System.out.println("  图: 6个顶点，8条边");
        System.out.println("  顶点覆盖解: " + vc + " (大小=" + vc.size() + ")");
        System.out.println("  是否有效覆盖: " + isValidVertexCover(nVC, vcEdges, vc));
        // 已知该图最小顶点覆盖大小为 3（如 {1,2,4} 或 {1,3,4}）
        int optVC = 3;
        System.out.printf("  最优解大小: %d, 近似比: %.2f (理论 2-近似)%n%n",
            optVC, (double) vc.size() / optVC);

        // ---------- 2. 集合覆盖 ----------
        System.out.println("--- [集合覆盖 Set Cover] ---");
        Set<Integer> universe = new HashSet<>();
        for (int i = 0; i < 12; i++) universe.add(i);

        List<Set<Integer>> subsets = new ArrayList<>();
        subsets.add(new HashSet<>(Arrays.asList(0,1,2,3,4,5)));       // S0
        subsets.add(new HashSet<>(Arrays.asList(6,7,8,9,10,11)));     // S1
        subsets.add(new HashSet<>(Arrays.asList(0,2,4,6,8,10)));      // S2
        subsets.add(new HashSet<>(Arrays.asList(1,3,5,7,9,11)));      // S3
        subsets.add(new HashSet<>(Arrays.asList(0,1,2,3)));           // S4
        subsets.add(new HashSet<>(Arrays.asList(4,5,6,7)));           // S5
        subsets.add(new HashSet<>(Arrays.asList(8,9,10,11)));         // S6
        subsets.add(new HashSet<>(Arrays.asList(0,6,11)));            // S7

        List<Integer> sc = greedySetCover(universe, subsets);
        System.out.println("  全集大小: " + universe.size());
        System.out.println("  子集数量: " + subsets.size());
        System.out.println("  选中子集索引: " + sc);
        System.out.println("  选中子集数量: " + sc.size());
        System.out.println("  是否有效覆盖: " + isValidSetCover(universe, subsets, sc));
        // 最优解为 S0+S1 (2个)
        int optSC = 2;
        System.out.printf("  最优解大小: %d, 近似比: %.2f (理论 O(log n))%n%n",
            optSC, (double) sc.size() / optSC);

        // ---------- 3. TSP ----------
        System.out.println("--- [TSP MST-based 2-近似] ---");
        // 5个城市的欧氏距离（满足三角不等式）
        double[][] tspDist = {
            {0, 10, 15, 20, 25},
            {10, 0, 12, 18, 22},
            {15, 12, 0, 8, 14},
            {20, 18, 8, 0, 6},
            {25, 22, 14, 6, 0}
        };
        List<Integer> tspTour = tsp2Approx(tspDist);
        double tspLen = tourDistance(tspTour, tspDist);
        System.out.println("  城市数: " + tspDist.length);
        System.out.println("  TSP回路: " + tspTour);
        System.out.printf("  回路总距离: %.1f%n", tspLen);
        // 最优解（0-1-2-3-4-0）的距离 = 10+12+8+6+25 = 61
        double optTSP = 61;
        System.out.printf("  最优解距离: %.1f, 近似比: %.2f (理论 2-近似)%n%n",
            optTSP, tspLen / optTSP);

        System.out.println("==========================================");
        System.out.println("  演示完毕");
        System.out.println("==========================================");
    }
}