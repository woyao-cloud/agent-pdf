package masteralgo.chapter11;

import java.util.*;

/**
 * Dijkstra算法 与 Bellman-Ford算法 对比演示
 *
 * 功能：
 * 1. Dijkstra（优先级队列实现），仅处理非负权图
 * 2. Bellman-Ford（V-1 轮松弛），支持负权边
 * 3. 负权环检测（第V轮松弛）
 * 4. 路径重建：从源点到目标点的完整路径
 * 5. 验证 Dijkstra 在负权边场景下的错误行为
 */
public class DijkstraAndBellmanFord {

    // 加权有向边
    static class Edge {
        int from, to, weight;
        Edge(int f, int t, int w) { from = f; to = t; weight = w; }
    }

    // 邻接表用边（只需 to 和 weight）
    static class AdjEdge {
        int to, weight;
        AdjEdge(int t, int w) { to = t; weight = w; }
    }

    // Dijkstra 优先队列辅助类
    static class Pair {
        int vertex, distance;
        Pair(int v, int d) { vertex = v; distance = d; }
    }

    // ============================================================
    //  1. Dijkstra 算法（优先队列实现）
    // ============================================================
    public static int[] dijkstra(int source, List<AdjEdge>[] graph, int[] prev) {
        int n = graph.length;
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[source] = 0;

        PriorityQueue<Pair> pq = new PriorityQueue<>(
                (a, b) -> a.distance - b.distance);
        pq.offer(new Pair(source, 0));

        while (!pq.isEmpty()) {
            Pair cur = pq.poll();
            int u = cur.vertex;
            if (cur.distance > dist[u]) continue;  // 过时条目，跳过

            for (AdjEdge e : graph[u]) {
                int v = e.to;
                int w = e.weight;
                if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
                    dist[v] = dist[u] + w;
                    prev[v] = u;
                    pq.offer(new Pair(v, dist[v]));
                }
            }
        }
        return dist;
    }

    // ============================================================
    //  2. Bellman-Ford 算法（支持负权边 + 负权环检测）
    // ============================================================
    /**
     * @return 最短距离数组；如果存在负权环则返回 null
     */
    public static int[] bellmanFord(int source, int V, List<Edge> edges, int[] prev) {
        int[] dist = new int[V];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[source] = 0;

        // V-1 轮松弛
        for (int i = 0; i < V - 1; i++) {
            boolean updated = false;
            for (Edge e : edges) {
                if (dist[e.from] != Integer.MAX_VALUE
                        && dist[e.from] + e.weight < dist[e.to]) {
                    dist[e.to] = dist[e.from] + e.weight;
                    prev[e.to] = e.from;
                    updated = true;
                }
            }
            if (!updated) break;  // 提前退出：已收敛
        }

        // 第 V 轮：检测负权环
        for (Edge e : edges) {
            if (dist[e.from] != Integer.MAX_VALUE
                    && dist[e.from] + e.weight < dist[e.to]) {
                System.out.println("  [检测到负权环] 顶点 " + e.from
                        + " → " + e.to + " 仍可松弛");
                return null;  // 存在负权环
            }
        }

        return dist;
    }

    // ============================================================
    //  3. 路径重建（通用）
    // ============================================================
    public static List<Integer> reconstructPath(int target, int[] prev) {
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != -1; v = prev[v]) {
            path.add(v);
        }
        Collections.reverse(path);
        return path;
    }

    // ============================================================
    //  4. 打印结果
    // ============================================================
    public static void printResult(String algoName, int source, int[] dist,
                                    int[] prev, int target) {
        System.out.println("  [" + algoName + "] 从顶点 " + source + " 出发：");
        for (int v = 0; v < dist.length; v++) {
            if (dist[v] == Integer.MAX_VALUE) {
                System.out.println("    到 " + v + ": 不可达");
            } else {
                System.out.println("    到 " + v + ": " + dist[v]);
            }
        }
        // 路径重建
        if (target != -1 && dist[target] != Integer.MAX_VALUE) {
            List<Integer> path = reconstructPath(target, prev);
            System.out.println("  到 " + target + " 的路径: " + path);
        }
        System.out.println();
    }

    // ============================================================
    //  5. 构建图（邻接表 & 边列表）
    // ============================================================

    /** 构建图1：所有边非负（Dijkstra 和 Bellman-Ford 均可处理） */
    public static void buildNonNegativeGraph(
            List<AdjEdge>[] adjGraph, List<Edge> edges) {
        // 图结构:
        //     0 → 1 (4)
        //     0 → 2 (2)
        //     1 → 2 (1)
        //     1 → 3 (5)
        //     2 → 3 (8)
        //     2 → 4 (10)
        //     3 → 4 (2)
        //     3 → 5 (6)
        //     4 → 5 (3)
        addDirEdge(adjGraph, edges, 0, 1, 4);
        addDirEdge(adjGraph, edges, 0, 2, 2);
        addDirEdge(adjGraph, edges, 1, 2, 1);
        addDirEdge(adjGraph, edges, 1, 3, 5);
        addDirEdge(adjGraph, edges, 2, 3, 8);
        addDirEdge(adjGraph, edges, 2, 4, 10);
        addDirEdge(adjGraph, edges, 3, 4, 2);
        addDirEdge(adjGraph, edges, 3, 5, 6);
        addDirEdge(adjGraph, edges, 4, 5, 3);
    }

    /** 构建图2：包含负权边（无负权环）—— 展示 Bellman-Ford 的优势 */
    public static void buildNegativeEdgeGraph(
            List<AdjEdge>[] adjGraph, List<Edge> edges) {
        // 图结构 (Cormen 教材经典例子):
        //     0 → 1 (6)
        //     0 → 2 (7)
        //     1 → 2 (8)
        //     1 → 3 (5)
        //     1 → 4 (-4)
        //     2 → 3 (-3)
        //     2 → 4 (9)
        //     3 → 1 (-2)   ← 负权边，但不是负权环
        //     3 → 4 (7)
        //     4 → 0 (2)
        //     4 → 3 (7)
        //
        // 注意：有负权边但没有负权环
        addDirEdge(adjGraph, edges, 0, 1, 6);
        addDirEdge(adjGraph, edges, 0, 2, 7);
        addDirEdge(adjGraph, edges, 1, 2, 8);
        addDirEdge(adjGraph, edges, 1, 3, 5);
        addDirEdge(adjGraph, edges, 1, 4, -4);
        addDirEdge(adjGraph, edges, 2, 3, -3);
        addDirEdge(adjGraph, edges, 2, 4, 9);
        addDirEdge(adjGraph, edges, 3, 1, -2);
        addDirEdge(adjGraph, edges, 3, 4, 7);
        addDirEdge(adjGraph, edges, 4, 0, 2);
        addDirEdge(adjGraph, edges, 4, 3, 7);
    }

    /** 构建图3：包含负权环 */
    public static void buildNegativeCycleGraph(
            List<AdjEdge>[] adjGraph, List<Edge> edges) {
        // 图结构: 1 → 2 (-2), 2 → 3 (-1), 3 → 1 (-1)
        //     1 → 2 → 3 → 1 形成负权环，总权重 = -4
        //     0 → 1 (5)
        //     0 → 3 (10)
        //     3 → 4 (2)
        addDirEdge(adjGraph, edges, 0, 1, 5);
        addDirEdge(adjGraph, edges, 0, 3, 10);
        addDirEdge(adjGraph, edges, 1, 2, -2);
        addDirEdge(adjGraph, edges, 2, 3, -1);
        addDirEdge(adjGraph, edges, 3, 1, -1);
        addDirEdge(adjGraph, edges, 3, 4, 2);
    }

    private static void addDirEdge(List<AdjEdge>[] adjGraph,
                                    List<Edge> edges, int from, int to, int w) {
        adjGraph[from].add(new AdjEdge(to, w));
        edges.add(new Edge(from, to, w));
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  Dijkstra & Bellman-Ford 对比演示");
        System.out.println("================================================\n");

        // ---------- 测试1: 非负权图 ----------
        System.out.println("----- Test 1: 非负权图 -----");
        int V1 = 6;
        @SuppressWarnings("unchecked")
        List<AdjEdge>[] adj1 = new ArrayList[V1];
        for (int i = 0; i < V1; i++) adj1[i] = new ArrayList<>();
        List<Edge> edges1 = new ArrayList<>();
        buildNonNegativeGraph(adj1, edges1);

        int[] prevDijk1 = new int[V1];
        int[] distDijk1 = dijkstra(0, adj1, prevDijk1);
        printResult("Dijkstra", 0, distDijk1, prevDijk1, 5);

        int[] prevBF1 = new int[V1];
        int[] distBF1 = bellmanFord(0, V1, edges1, prevBF1);
        printResult("Bellman-Ford", 0, distBF1, prevBF1, 5);

        // ---------- 测试2: 负权边（无负权环） ----------
        System.out.println("----- Test 2: 包含负权边（无负权环） -----");
        int V2 = 5;
        @SuppressWarnings("unchecked")
        List<AdjEdge>[] adj2 = new ArrayList[V2];
        for (int i = 0; i < V2; i++) adj2[i] = new ArrayList<>();
        List<Edge> edges2 = new ArrayList<>();
        buildNegativeEdgeGraph(adj2, edges2);

        System.out.println("  [Dijkstra] 在有负权边的图上运行（结果可能错误）:");
        int[] prevDijk2 = new int[V2];
        int[] distDijk2 = dijkstra(0, adj2, prevDijk2);
        printResult("Dijkstra", 0, distDijk2, prevDijk2, 4);

        System.out.println("  [Bellman-Ford] 正确处理负权边:");
        int[] prevBF2 = new int[V2];
        int[] distBF2 = bellmanFord(0, V2, edges2, prevBF2);
        printResult("Bellman-Ford", 0, distBF2, prevBF2, 4);

        // ---------- 测试3: 负权环检测 ----------
        System.out.println("----- Test 3: 负权环检测 -----");
        int V3 = 5;
        @SuppressWarnings("unchecked")
        List<AdjEdge>[] adj3 = new ArrayList[V3];
        for (int i = 0; i < V3; i++) adj3[i] = new ArrayList<>();
        List<Edge> edges3 = new ArrayList<>();
        buildNegativeCycleGraph(adj3, edges3);

        System.out.println("  图包含负权环: 1 → 2 (-2) → 3 (-1) → 1 (-1)");
        int[] prevBF3 = new int[V3];
        int[] distBF3 = bellmanFord(0, V3, edges3, prevBF3);
        if (distBF3 == null) {
            System.out.println("  Bellman-Ford 正确检测到负权环，返回 null\n");
        }

        // ---------- 测试4: 路径重建展示 ----------
        System.out.println("----- Test 4: 路径重建详情 -----");
        System.out.println("  使用 Test 1 的非负权图，起点=0，终点=5");
        System.out.println("  Dijkstra 路径: " + reconstructPath(5, prevDijk1)
                + " (距离=" + distDijk1[5] + ")");
        System.out.println("  Bellman-Ford 路径: " + reconstructPath(5, prevBF1)
                + " (距离=" + distBF1[5] + ")");
        System.out.println();

        System.out.println("================================================");
        System.out.println("  演示总结");
        System.out.println("  - Dijkstra 无法处理负权边（结果可能错误）");
        System.out.println("  - Bellman-Ford 可以处理负权边并检测负权环");
        System.out.println("  - 但 Bellman-Ford 时间复杂度 O(VE) 远高于 Dijkstra");
        System.out.println("  - 实际选择：无负权边用 Dijkstra，有负权边用 Bellman-Ford");
        System.out.println("================================================");
    }
}