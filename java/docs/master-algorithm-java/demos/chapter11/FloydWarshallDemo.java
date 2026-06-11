package masteralgo.chapter11;

import java.util.*;

/**
 * Floyd-Warshall 算法演示 —— 所有点对最短路径
 *
 * 功能：
 * 1. Floyd-Warshall 三重循环实现
 * 2. 打印距离矩阵（初始 / 最终）
 * 3. 路径重建：前驱矩阵 + 打印完整路径
 * 4. 负权环检测（对角线负值）
 * 5. 与"从每个顶点跑一次 Dijkstra"对比
 */
public class FloydWarshallDemo {

    private static final int INF = Integer.MAX_VALUE / 2;  // 防溢出

    // ============================================================
    //  1. Floyd-Warshall 算法
    // ============================================================

    /**
     * Floyd-Warshall 求所有点对最短路径
     * @param dist  距离矩阵（输入时是邻接矩阵，输出时是最短距离矩阵）
     * @param next  前驱矩阵，next[i][j] = 路径 i→j 上 i 之后第一个顶点
     */
    public static void floydWarshall(int[][] dist, int[][] next) {
        int V = dist.length;

        // 初始化 next 矩阵
        for (int i = 0; i < V; i++) {
            for (int j = 0; j < V; j++) {
                if (dist[i][j] != INF) {
                    next[i][j] = j;  // i 直接到 j
                } else {
                    next[i][j] = -1; // 不可达
                }
            }
        }

        // 核心三重循环
        for (int k = 0; k < V; k++) {          // 中间顶点
            for (int i = 0; i < V; i++) {      // 起点
                if (dist[i][k] == INF) continue;
                for (int j = 0; j < V; j++) {  // 终点
                    if (dist[k][j] == INF) continue;
                    if (dist[i][k] + dist[k][j] < dist[i][j]) {
                        dist[i][j] = dist[i][k] + dist[k][j];
                        next[i][j] = next[i][k];
                        // i→j 的路径先到 k，所以 i 之后第一个顶点就是 i→k 的第一个顶点
                    }
                }
            }
        }
    }

    // ============================================================
    //  2. 路径重建
    // ============================================================

    /** 使用 next 矩阵重建路径 */
    public static List<Integer> getPath(int i, int j, int[][] next) {
        if (next[i][j] == -1) return Collections.emptyList();
        List<Integer> path = new ArrayList<>();
        path.add(i);
        while (i != j) {
            i = next[i][j];
            path.add(i);
        }
        return path;
    }

    // ============================================================
    //  3. 负权环检测
    // ============================================================

    /** Floyd-Warshall 执行完毕后，对角线出现负值说明存在负权环 */
    public static boolean hasNegativeCycle(int[][] dist) {
        int V = dist.length;
        for (int i = 0; i < V; i++) {
            if (dist[i][i] < 0) {
                System.out.println("  发现负权环: 顶点 " + i
                        + " 的自环距离 = " + dist[i][i]);
                return true;
            }
        }
        return false;
    }

    // ============================================================
    //  4. 打印矩阵
    // ============================================================

    public static void printMatrix(String title, int[][] matrix) {
        int V = matrix.length;
        System.out.println("  " + title);
        for (int i = 0; i < V; i++) {
            System.out.print("    ");
            for (int j = 0; j < V; j++) {
                if (matrix[i][j] == INF) {
                    System.out.print(" ∞ ");
                } else {
                    System.out.printf("%2d ", matrix[i][j]);
                }
            }
            System.out.println();
        }
    }

    // ============================================================
    //  5. 对比：从每个顶点跑一次 Dijkstra
    // ============================================================

    /** 从每个顶点执行 Dijkstra，返回距离矩阵（仅适用于非负权图） */
    public static int[][] runDijkstraAllPairs(List<DijkstraAndBellmanFord.AdjEdge>[] graph) {
        int V = graph.length;
        int[][] dist = new int[V][V];
        for (int s = 0; s < V; s++) {
            for (int i = 0; i < V; i++) dist[s][i] = INF;
            dist[s][s] = 0;
            // 直接用 Dijkstra 的优先队列逻辑
            PriorityQueue<Pair> pq = new PriorityQueue<>(
                    (a, b) -> a.dist - b.dist);
            pq.offer(new Pair(s, 0));
            while (!pq.isEmpty()) {
                Pair cur = pq.poll();
                int u = cur.vertex;
                if (cur.dist > dist[s][u]) continue;
                for (DijkstraAndBellmanFord.AdjEdge e : graph[u]) {
                    int v = e.to, w = e.weight;
                    if (dist[s][u] + w < dist[s][v]) {
                        dist[s][v] = dist[s][u] + w;
                        pq.offer(new Pair(v, dist[s][v]));
                    }
                }
            }
        }
        return dist;
    }

    static class Pair {
        int vertex, dist;
        Pair(int v, int d) { vertex = v; dist = d; }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    @SuppressWarnings("unchecked")
    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  Floyd-Warshall 算法演示");
        System.out.println("================================================\n");

        // ========== 测试1：标准图（有正权也有负权，无负权环） ==========
        System.out.println("----- Test 1: 包含负权边的图（无负权环） -----");
        int V1 = 4;
        int[][] dist1 = new int[V1][V1];
        for (int i = 0; i < V1; i++) {
            Arrays.fill(dist1[i], INF);
            dist1[i][i] = 0;
        }
        // 图结构:
        //     0 → 1 (3)
        //     0 → 3 (7)
        //     1 → 2 (4)
        //     1 → 3 (2)
        //     2 → 0 (1)
        //     2 → 3 (1)
        //     3 → 0 (5)
        //     3 → 2 (2)
        dist1[0][1] = 3;
        dist1[0][3] = 7;
        dist1[1][2] = 4;
        dist1[1][3] = 2;
        dist1[2][0] = 1;
        dist1[2][3] = 1;
        dist1[3][0] = 5;
        dist1[3][2] = 2;

        printMatrix("初始距离矩阵:", dist1);

        int[][] next1 = new int[V1][V1];
        floydWarshall(dist1, next1);

        printMatrix("Floyd-Warshall 后距离矩阵:", dist1);
        System.out.println("  负权环检测: " + (hasNegativeCycle(dist1) ? "有" : "无"));
        System.out.println();

        // 打印所有点对的最短路径
        System.out.println("  所有点对最短路径:");
        for (int i = 0; i < V1; i++) {
            for (int j = 0; j < V1; j++) {
                if (i != j && dist1[i][j] != INF) {
                    List<Integer> path = getPath(i, j, next1);
                    System.out.println("    " + i + " → " + j + ": " + path
                            + " 距离=" + dist1[i][j]);
                }
            }
        }
        System.out.println();

        // ========== 测试2：负权环图 ==========
        System.out.println("----- Test 2: 包含负权环的图 -----");
        int V2 = 4;
        int[][] dist2 = new int[V2][V2];
        for (int i = 0; i < V2; i++) {
            Arrays.fill(dist2[i], INF);
            dist2[i][i] = 0;
        }
        // 图结构: 0→1(1), 1→2(-3), 2→3(2), 3→1(1) → 负权环 1→2→3→1, 总权重 = -3+2+1 = 0 ... 不对
        // 改为: 0→1(1), 1→2(-4), 2→3(2), 3→1(1) → 负权环 1→2→3→1: -4+2+1 = -1
        dist2[0][1] = 1;
        dist2[1][2] = -4;
        dist2[2][3] = 2;
        dist2[3][1] = 1;

        printMatrix("初始距离矩阵:", dist2);

        int[][] next2 = new int[V2][V2];
        floydWarshall(dist2, next2);

        printMatrix("Floyd-Warshall 后距离矩阵:", dist2);
        System.out.println("  负权环检测: " + (hasNegativeCycle(dist2) ? "有" : "无"));
        System.out.println();

        // ========== 测试3：与 Dijkstra 对比（仅非负权图） ==========
        System.out.println("----- Test 3: 与[从每个顶点跑Dijkstra]对比 -----");
        int V3 = 5;
        int[][] dist3 = new int[V3][V3];
        for (int i = 0; i < V3; i++) {
            Arrays.fill(dist3[i], INF);
            dist3[i][i] = 0;
        }

        // 构建一个非负权图
        //     0 → 1 (2), 0 → 2 (4)
        //     1 → 2 (1), 1 → 3 (7)
        //     2 → 3 (3), 2 → 4 (5)
        //     3 → 4 (1)
        dist3[0][1] = 2; dist3[0][2] = 4;
        dist3[1][2] = 1; dist3[1][3] = 7;
        dist3[2][3] = 3; dist3[2][4] = 5;
        dist3[3][4] = 1;

        // 同样构建邻接表给 Dijkstra
        List<DijkstraAndBellmanFord.AdjEdge>[] adj3 = new ArrayList[V3];
        for (int i = 0; i < V3; i++) adj3[i] = new ArrayList<>();
        adj3[0].add(new DijkstraAndBellmanFord.AdjEdge(1, 2));
        adj3[0].add(new DijkstraAndBellmanFord.AdjEdge(2, 4));
        adj3[1].add(new DijkstraAndBellmanFord.AdjEdge(2, 1));
        adj3[1].add(new DijkstraAndBellmanFord.AdjEdge(3, 7));
        adj3[2].add(new DijkstraAndBellmanFord.AdjEdge(3, 3));
        adj3[2].add(new DijkstraAndBellmanFord.AdjEdge(4, 5));
        adj3[3].add(new DijkstraAndBellmanFord.AdjEdge(4, 1));

        // Floyd-Warshall
        int[][] next3 = new int[V3][V3];
        floydWarshall(dist3, next3);

        // Dijkstra from each vertex
        int[][] dijkDist3 = runDijkstraAllPairs(adj3);

        // 对比结果
        System.out.println("  Floyd-Warshall 距离矩阵:");
        printMatrix("", dist3);
        System.out.println("  V×Dijkstra 距离矩阵:");
        printMatrix("", dijkDist3);

        boolean match = true;
        for (int i = 0; i < V3; i++)
            for (int j = 0; j < V3; j++)
                if (dist3[i][j] != dijkDist3[i][j]) match = false;
        System.out.println("  两种方法结果一致? " + match);
        System.out.println("  (Floyd-Warshall: O(V³), V×Dijkstra: O(V(V+E)logV))");
        System.out.println("  对稠密图 Floyd-Warshall 更快，对稀疏图 V×Dijkstra 更快");
        System.out.println();

        System.out.println("================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}