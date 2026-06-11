package masteralgo.chapter08;

import java.util.*;

/**
 * 最小生成树（Minimum Spanning Tree）—— Prim & Kruskal 实现
 *
 * 实现两种经典贪心算法：
 * 1. Prim 算法：从任意顶点出发，每次选连接已访问/未访问集合的最短边
 * 2. Kruskal 算法：边排序，用 Union-Find 避免环
 */
public class MinimumSpanningTree {

    // ============================================================
    //  图数据结构
    // ============================================================

    static class Edge {
        int u, v, weight;
        Edge(int u, int v, int w) { this.u = u; this.v = v; this.weight = w; }
        public String toString() { return "(" + u + "-" + v + ", w=" + weight + ")"; }
    }

    static class Graph {
        int V; // 顶点数
        List<Edge> edges; // 所有边
        List<List<Edge>> adj; // 邻接表

        Graph(int V) {
            this.V = V;
            edges = new ArrayList<>();
            adj = new ArrayList<>(V);
            for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
        }

        void addEdge(int u, int v, int w) {
            Edge e = new Edge(u, v, w);
            edges.add(e);
            adj.get(u).add(e);
            adj.get(v).add(e); // 无向图添加两次
        }
    }

    // ============================================================
    //  Union-Find 数据结构（用于 Kruskal）
    // ============================================================

    static class UnionFind {
        int[] parent, rank;

        UnionFind(int n) {
            parent = new int[n];
            rank = new int[n];
            for (int i = 0; i < n; i++) parent[i] = i;
        }

        int find(int x) {
            if (parent[x] != x) {
                parent[x] = find(parent[x]); // 路径压缩
            }
            return parent[x];
        }

        boolean union(int x, int y) {
            int px = find(x), py = find(y);
            if (px == py) return false;
            if (rank[px] < rank[py]) {
                parent[px] = py;
            } else if (rank[px] > rank[py]) {
                parent[py] = px;
            } else {
                parent[py] = px;
                rank[px]++;
            }
            return true;
        }
    }

    // ============================================================
    //  Prim 算法
    // ============================================================

    /**
     * Prim 算法求 MST（用优先队列优化）
     * 思路：从顶点 0 开始，维护优先队列存储"连接已访问集合和未访问集合"的边
     * @return MST 的边列表
     */
    public static List<Edge> primMST(Graph g) {
        int V = g.V;
        boolean[] visited = new boolean[V];
        List<Edge> mst = new ArrayList<>();

        // 优先队列：按边权重排序
        PriorityQueue<Edge> pq = new PriorityQueue<>(Comparator.comparingInt(e -> e.weight));

        // 从顶点 0 开始
        visited[0] = true;
        for (Edge e : g.adj.get(0)) {
            pq.offer(e);
        }

        System.out.println("  Prim 算法执行过程：");
        System.out.println("    从顶点 0 开始");

        int step = 1;
        while (!pq.isEmpty() && mst.size() < V - 1) {
            Edge minEdge = pq.poll();
            int u = minEdge.u, v = minEdge.v;

            // 找到未访问的端点
            if (visited[u] && visited[v]) continue;

            int newVertex = visited[u] ? v : u;
            visited[newVertex] = true;
            mst.add(minEdge);

            System.out.printf("    第%d步: 选边 %d-%d(w=%d), 新顶点=%d%n",
                    step++, minEdge.u, minEdge.v, minEdge.weight, newVertex);

            // 将新顶点的邻接边加入优先队列
            for (Edge e : g.adj.get(newVertex)) {
                int other = (e.u == newVertex) ? e.v : e.u;
                if (!visited[other]) {
                    pq.offer(e);
                }
            }
        }

        return mst;
    }

    // ============================================================
    //  Kruskal 算法
    // ============================================================

    /**
     * Kruskal 算法求 MST
     * 思路：按权重排序所有边，从小到大添加，用 Union-Find 检测环
     * @return MST 的边列表
     */
    public static List<Edge> kruskalMST(Graph g) {
        int V = g.V;
        List<Edge> sortedEdges = new ArrayList<>(g.edges);
        sortedEdges.sort(Comparator.comparingInt(e -> e.weight));

        UnionFind uf = new UnionFind(V);
        List<Edge> mst = new ArrayList<>();

        System.out.println("  Kruskal 算法执行过程：");
        System.out.println("    排序后的所有边：");
        for (Edge e : sortedEdges) {
            System.out.printf("      %d-%d(w=%d)%n", e.u, e.v, e.weight);
        }
        System.out.println();

        int step = 1;
        for (Edge e : sortedEdges) {
            if (mst.size() == V - 1) break;
            if (uf.union(e.u, e.v)) {
                mst.add(e);
                System.out.printf("    第%d步: 加边 %d-%d(w=%d) ✔%n",
                        step++, e.u, e.v, e.weight);
            } else {
                System.out.printf("    第%d步: 跳过 %d-%d(w=%d) ✘（会形成环）%n",
                        step++, e.u, e.v, e.weight);
                step++; // 跳过边也算一步，便于追踪过程
                step--;
            }
        }

        // 修正 step 计数
        return mst;
    }

    // ============================================================
    //  辅助方法
    // ============================================================

    /**
     * 计算 MST 总权重
     */
    public static int totalWeight(List<Edge> mst) {
        return mst.stream().mapToInt(e -> e.weight).sum();
    }

    /**
     * 打印 MST
     */
    public static void printMST(String algorithm, List<Edge> mst) {
        System.out.println("  " + algorithm + " MST 结果：");
        for (Edge e : mst) {
            System.out.println("    " + e.u + " - " + e.v + "  weight=" + e.weight);
        }
        System.out.println("  总权重: " + totalWeight(mst));
        System.out.println();
    }

    // ============================================================
    //  main
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  MinimumSpanningTree —— 最小生成树演示");
        System.out.println("================================================\n");

        // 构建测试图（7 个顶点，连通无向带权图）
        //
        //          2       3
        //     0 ----- 1 ----- 2
        //     |       |       |
        //    1|      4|      5
        //     |       |       |
        //     3 ----- 4 ----- 5
        //         6       7
        //     |             |
        //    8|            9|
        //     |             |
        //     6             7 (未连接)
        // 调整：让图更清晰，移除 6,7 保持简单

        int V = 6;
        Graph graph = new Graph(V);
        graph.addEdge(0, 1, 2);
        graph.addEdge(0, 3, 1);
        graph.addEdge(1, 2, 3);
        graph.addEdge(1, 4, 4);
        graph.addEdge(2, 5, 5);
        graph.addEdge(3, 4, 6);
        graph.addEdge(4, 5, 7);

        System.out.println("  图结构（" + V + " 个顶点）：");
        System.out.println("    0-1(2)  0-3(1)  1-2(3)  1-4(4)  2-5(5)  3-4(6)  4-5(7)");
        System.out.println("  期望 MST 权重: 1+2+3+4+5=15\n");

        // ---------- Prim ----------
        System.out.println("----- Prim 算法 -----");
        List<Edge> primResult = primMST(graph);
        printMST("Prim", primResult);

        // ---------- Kruskal ----------
        System.out.println("----- Kruskal 算法 -----");
        List<Edge> kruskalResult = kruskalMST(graph);
        printMST("Kruskal", kruskalResult);

        // ---------- 对比验证 ----------
        System.out.println("----- 对比验证 -----");
        int primW = totalWeight(primResult);
        int kruskalW = totalWeight(kruskalResult);
        System.out.println("  Prim 总权重: " + primW);
        System.out.println("  Kruskal 总权重: " + kruskalW);
        System.out.println("  一致? " + (primW == kruskalW ? "✔ 是（都是最小生成树）" : "✘ 否"));

        // ---------- 不同起点的 Prim ----------
        System.out.println("\n----- Prim 从不同起点开始（结果相同但加边顺序可能不同） -----");
        // 构建相同的图重新跑 Prim（从顶点 3 开始）
        Graph graph2 = new Graph(V);
        graph2.addEdge(0, 1, 2);
        graph2.addEdge(0, 3, 1);
        graph2.addEdge(1, 2, 3);
        graph2.addEdge(1, 4, 4);
        graph2.addEdge(2, 5, 5);
        graph2.addEdge(3, 4, 6);
        graph2.addEdge(4, 5, 7);

        // 简单修改 Prim 以支持指定起点
        System.out.println("  Prim 从顶点 3 开始：");
        boolean[] visited = new boolean[V];
        List<Edge> mst3 = new ArrayList<>();
        PriorityQueue<Edge> pq = new PriorityQueue<>(Comparator.comparingInt(e -> e.weight));
        visited[3] = true;
        for (Edge e : graph2.adj.get(3)) pq.offer(e);
        while (!pq.isEmpty() && mst3.size() < V - 1) {
            Edge e = pq.poll();
            int nv = visited[e.u] ? e.v : e.u;
            if (visited[nv]) continue;
            visited[nv] = true;
            mst3.add(e);
            for (Edge adjE : graph2.adj.get(nv)) {
                int o = (adjE.u == nv) ? adjE.v : adjE.u;
                if (!visited[o]) pq.offer(adjE);
            }
        }
        printMST("Prim(起点=3)", mst3);
        System.out.println("  从顶点 0 和顶点 3 开始的 MST 总权重相同: "
                + (totalWeight(primResult) == totalWeight(mst3)));

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}