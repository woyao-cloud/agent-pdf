package masteralgo.chapter10;

import java.util.*;

/**
 * 图的表示方式演示——邻接矩阵 vs 邻接表
 *
 * 功能：
 * 1. 用邻接矩阵实现 Graph 类（支持有向/无向）
 * 2. 用邻接表实现 Graph 类（支持有向/无向）
 * 3. 支持 addEdge, removeEdge, hasEdge, getNeighbors
 * 4. 构建示例图并打印两种表示
 * 5. 对比两种表示的内存占用概念
 */
public class GraphRepresentation {

    // ============================================================
    //  邻接矩阵实现
    // ============================================================
    static class AdjMatrixGraph {
        private int V;               // 顶点数
        private boolean directed;     // 是否有向
        private int[][] matrix;       // 邻接矩阵 (无权图: 0/1, 加权图: 权重)
        private boolean weighted;     // 是否加权
        private int[][] weightMatrix; // 权重矩阵 (仅加权图使用)

        public AdjMatrixGraph(int V, boolean directed) {
            this(V, directed, false);
        }

        public AdjMatrixGraph(int V, boolean directed, boolean weighted) {
            this.V = V;
            this.directed = directed;
            this.weighted = weighted;
            if (weighted) {
                weightMatrix = new int[V][V];
                for (int i = 0; i < V; i++)
                    Arrays.fill(weightMatrix[i], Integer.MAX_VALUE); // ∞ 表示无边
            } else {
                matrix = new int[V][V];
            }
        }

        /** 添加边（无权图） */
        public void addEdge(int u, int v) {
            matrix[u][v] = 1;
            if (!directed) matrix[v][u] = 1;
        }

        /** 添加边（加权图） */
        public void addEdge(int u, int v, int weight) {
            if (!weighted) throw new IllegalStateException("不是加权图");
            weightMatrix[u][v] = weight;
            if (!directed) weightMatrix[v][u] = weight;
        }

        /** 移除边 */
        public void removeEdge(int u, int v) {
            if (weighted) {
                weightMatrix[u][v] = Integer.MAX_VALUE;
                if (!directed) weightMatrix[v][u] = Integer.MAX_VALUE;
            } else {
                matrix[u][v] = 0;
                if (!directed) matrix[v][u] = 0;
            }
        }

        /** 查询是否存在边 */
        public boolean hasEdge(int u, int v) {
            if (weighted) return weightMatrix[u][v] != Integer.MAX_VALUE;
            return matrix[u][v] != 0;
        }

        /** 获取邻居列表 */
        public List<Integer> getNeighbors(int v) {
            List<Integer> neighbors = new ArrayList<>();
            if (weighted) {
                for (int i = 0; i < V; i++)
                    if (weightMatrix[v][i] != Integer.MAX_VALUE)
                        neighbors.add(i);
            } else {
                for (int i = 0; i < V; i++)
                    if (matrix[v][i] != 0)
                        neighbors.add(i);
            }
            return neighbors;
        }

        public void print() {
            System.out.println("  邻接矩阵 (" + V + "x" + V + ", "
                    + (directed ? "有向" : "无向") + ", "
                    + (weighted ? "加权" : "无权") + "):");
            if (weighted) {
                for (int i = 0; i < V; i++) {
                    System.out.print("    ");
                    for (int j = 0; j < V; j++) {
                        if (weightMatrix[i][j] == Integer.MAX_VALUE)
                            System.out.print(" ∞ ");
                        else
                            System.out.printf("%2d ", weightMatrix[i][j]);
                    }
                    System.out.println();
                }
            } else {
                for (int i = 0; i < V; i++) {
                    System.out.print("    ");
                    for (int j = 0; j < V; j++)
                        System.out.print(matrix[i][j] + " ");
                    System.out.println();
                }
            }
        }
    }

    // ============================================================
    //  邻接表实现
    // ============================================================
    static class AdjListGraph {
        private int V;
        private boolean directed;
        private List<Integer>[] adj;       // 无权图
        private List<Edge>[] weightedAdj;  // 加权图
        private boolean weighted;

        static class Edge {
            int to;
            int weight;
            Edge(int to, int weight) { this.to = to; this.weight = weight; }
            @Override
            public String toString() { return "→" + to + "(w=" + weight + ")"; }
        }

        @SuppressWarnings("unchecked")
        public AdjListGraph(int V, boolean directed, boolean weighted) {
            this.V = V;
            this.directed = directed;
            this.weighted = weighted;
            if (weighted) {
                weightedAdj = new ArrayList[V];
                for (int i = 0; i < V; i++) weightedAdj[i] = new ArrayList<>();
            } else {
                adj = new ArrayList[V];
                for (int i = 0; i < V; i++) adj[i] = new ArrayList<>();
            }
        }

        public AdjListGraph(int V, boolean directed) {
            this(V, directed, false);
        }

        /** 添加边（无权图） */
        public void addEdge(int u, int v) {
            adj[u].add(v);
            if (!directed) adj[v].add(u);
        }

        /** 添加边（加权图） */
        public void addEdge(int u, int v, int weight) {
            if (!weighted) throw new IllegalStateException("不是加权图");
            weightedAdj[u].add(new Edge(v, weight));
            if (!directed) weightedAdj[v].add(new Edge(u, weight));
        }

        /** 移除边（无权图，移除第一个匹配的边） */
        public void removeEdge(int u, int v) {
            if (weighted) {
                weightedAdj[u].removeIf(e -> e.to == v);
                if (!directed) weightedAdj[v].removeIf(e -> e.to == u);
            } else {
                adj[u].remove(Integer.valueOf(v));
                if (!directed) adj[v].remove(Integer.valueOf(u));
            }
        }

        /** 查询是否存在边 */
        public boolean hasEdge(int u, int v) {
            if (weighted) {
                return weightedAdj[u].stream().anyMatch(e -> e.to == v);
            }
            return adj[u].contains(v);
        }

        /** 获取邻居列表 */
        public List<Integer> getNeighbors(int v) {
            if (weighted) {
                List<Integer> result = new ArrayList<>();
                for (Edge e : weightedAdj[v]) result.add(e.to);
                return result;
            }
            return new ArrayList<>(adj[v]);
        }

        public void print() {
            System.out.println("  邻接表 (" + V + " 顶点, "
                    + (directed ? "有向" : "无向") + ", "
                    + (weighted ? "加权" : "无权") + "):");
            if (weighted) {
                for (int i = 0; i < V; i++) {
                    System.out.print("    " + i + ": ");
                    for (Edge e : weightedAdj[i])
                        System.out.print(e + " ");
                    System.out.println();
                }
            } else {
                for (int i = 0; i < V; i++)
                    System.out.println("    " + i + ": " + adj[i]);
            }
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  图表示方式演示");
        System.out.println("================================================\n");

        // ---------- 1. 无向无权图（邻接矩阵） ----------
        System.out.println("----- 无向无权图 —— 邻接矩阵 -----");
        AdjMatrixGraph mg = new AdjMatrixGraph(4, false);
        mg.addEdge(0, 1);
        mg.addEdge(0, 2);
        mg.addEdge(1, 2);
        mg.addEdge(2, 3);
        mg.print();
        System.out.println("  hasEdge(1,2) = " + mg.hasEdge(1, 2));
        System.out.println("  hasEdge(0,3) = " + mg.hasEdge(0, 3));
        System.out.println("  getNeighbors(2) = " + mg.getNeighbors(2));
        mg.removeEdge(1, 2);
        System.out.println("  移除边 (1,2) 后 hasEdge(1,2) = " + mg.hasEdge(1, 2));
        System.out.println();

        // ---------- 2. 有向无权图（邻接表） ----------
        System.out.println("----- 有向无权图 —— 邻接表 -----");
        AdjListGraph lg = new AdjListGraph(5, true);
        lg.addEdge(0, 1);
        lg.addEdge(0, 3);
        lg.addEdge(1, 2);
        lg.addEdge(1, 4);
        lg.addEdge(2, 4);
        lg.addEdge(3, 1);
        lg.addEdge(4, 3);
        lg.print();
        System.out.println("  hasEdge(1,2) = " + lg.hasEdge(1, 2));
        System.out.println("  hasEdge(2,1) = " + lg.hasEdge(2, 1));  // 有向，应为 false
        System.out.println("  getNeighbors(1) = " + lg.getNeighbors(1));
        System.out.println();

        // ---------- 3. 加权无向图（邻接表） ----------
        System.out.println("----- 加权无向图 —— 邻接表 -----");
        AdjListGraph wg = new AdjListGraph(4, false, true);
        wg.addEdge(0, 1, 5);
        wg.addEdge(0, 2, 3);
        wg.addEdge(1, 2, 2);
        wg.addEdge(2, 3, 7);
        wg.print();
        System.out.println();

        // ---------- 4. 内存概念对比 ----------
        System.out.println("----- 内存占用概念对比 (V=1000, E=3000 稀疏图) -----");
        System.out.println("  V=1000, E=3000 (稀疏图, 密度 ≈ 0.3%)");
        System.out.println("  邻接矩阵: " + (1000 * 1000 * 4 / 1024 / 1024) + " MB (int[][])");
        System.out.println("  邻接表:   ~" + ((1000 * 4 + 3000 * 8) / 1024) + " KB (ArrayList overhead)");
        System.out.println("  → 稀疏图邻接表更省空间");
        System.out.println();

        System.out.println("  V=1000, E=500000 (稠密图, 密度 ≈ 50%)");
        System.out.println("  邻接矩阵: " + (1000 * 1000 * 4 / 1024 / 1024) + " MB (int[][])");
        System.out.println("  邻接表:   ~" + ((1000 * 4 + 500000 * 8) / 1024 / 1024) + " MB (ArrayList overhead)");
        System.out.println("  → 稠密图邻接矩阵更优 (常数更小)");
        System.out.println();

        // ---------- 5. 使用 HashMap 的邻接表（顶点编号不连续） ----------
        System.out.println("----- HashMap 邻接表（顶点编号不连续） -----");
        // 假设顶点编号为 {10, 20, 30, 40}
        Map<Integer, List<Integer>> hashGraph = new HashMap<>();
        for (int v : new int[]{10, 20, 30, 40}) hashGraph.put(v, new ArrayList<>());
        hashGraph.get(10).add(20);
        hashGraph.get(10).add(30);
        hashGraph.get(20).add(30);
        hashGraph.get(30).add(40);
        for (Map.Entry<Integer, List<Integer>> entry : hashGraph.entrySet())
            System.out.println("    " + entry.getKey() + ": " + entry.getValue());

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}