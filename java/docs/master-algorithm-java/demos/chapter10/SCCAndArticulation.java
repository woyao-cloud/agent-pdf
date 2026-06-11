package masteralgo.chapter10;

import java.util.*;

/**
 * 强连通分量（SCC）与割点（Articulation Points）演示
 *
 * 功能：
 * 1. Kosaraju 算法求有向图 SCC
 * 2. Tarjan 算法（DFS）求无向图割点
 * 3. 构建示例有向图和无向图
 * 4. 打印 SCC 和割点结果
 */
public class SCCAndArticulation {

    // ============================================================
    //  1. Kosaraju 算法求 SCC
    // ============================================================
    static class Kosaraju {
        private int V;
        private List<Integer>[] graph;

        public Kosaraju(List<Integer>[] graph) {
            this.V = graph.length;
            this.graph = graph;
        }

        /** 执行 Kosaraju 算法，返回所有 SCC */
        public List<List<Integer>> findSCCs() {
            // 第 1 步：在原始图上做 DFS，按完成时间入栈
            boolean[] visited = new boolean[V];
            Deque<Integer> stack = new ArrayDeque<>();
            for (int v = 0; v < V; v++) {
                if (!visited[v]) {
                    fillOrder(v, visited, stack);
                }
            }

            // 第 2 步：反转图
            List<Integer>[] reversed = getTranspose();

            // 第 3 步：按栈的顺序（完成时间从晚到早）在反向图上 DFS
            visited = new boolean[V];
            List<List<Integer>> sccList = new ArrayList<>();
            while (!stack.isEmpty()) {
                int v = stack.pop();
                if (!visited[v]) {
                    List<Integer> component = new ArrayList<>();
                    dfsReverse(v, visited, reversed, component);
                    sccList.add(component);
                }
            }

            return sccList;
        }

        /** 第 1 步 DFS：按完成时间入栈（后序入栈） */
        private void fillOrder(int v, boolean[] visited, Deque<Integer> stack) {
            visited[v] = true;
            for (int neighbor : graph[v]) {
                if (!visited[neighbor]) {
                    fillOrder(neighbor, visited, stack);
                }
            }
            stack.push(v);
        }

        /** 第 2 步：构建反向图 */
        private List<Integer>[] getTranspose() {
            @SuppressWarnings("unchecked")
            List<Integer>[] reversed = new ArrayList[V];
            for (int i = 0; i < V; i++) reversed[i] = new ArrayList<>();
            for (int u = 0; u < V; u++) {
                for (int v : graph[u]) {
                    reversed[v].add(u);
                }
            }
            return reversed;
        }

        /** 第 3 步 DFS：在反向图上收集 SCC */
        private void dfsReverse(int v, boolean[] visited,
                                 List<Integer>[] reversed, List<Integer> component) {
            visited[v] = true;
            component.add(v);
            for (int neighbor : reversed[v]) {
                if (!visited[neighbor]) {
                    dfsReverse(neighbor, visited, reversed, component);
                }
            }
        }
    }

    // ============================================================
    //  2. Tarjan 算法求无向图割点
    // ============================================================
    static class TarjanArticulation {
        private int V;
        private List<Integer>[] graph;
        private boolean[] visited;
        private int[] disc;      // 发现时间（DFS 时间戳）
        private int[] low;       // low[v] = 从 v 可达的最早祖先的 disc 值
        private int time;        // 全局时间戳
        private Set<Integer> articulationPoints;

        public TarjanArticulation(List<Integer>[] graph) {
            this.V = graph.length;
            this.graph = graph;
            this.visited = new boolean[V];
            this.disc = new int[V];
            this.low = new int[V];
            this.time = 0;
            this.articulationPoints = new HashSet<>();
        }

        /** 寻找所有割点 */
        public Set<Integer> findArticulationPoints() {
            // 图可能不连通，对每个连通分量运行 Tarjan
            for (int v = 0; v < V; v++) {
                if (!visited[v]) {
                    dfs(v, -1);  // -1 表示父节点不存在（根节点）
                }
            }
            return articulationPoints;
        }

        /** Tarjan DFS */
        private void dfs(int u, int parent) {
            visited[u] = true;
            disc[u] = low[u] = ++time;
            int children = 0;

            for (int v : graph[u]) {
                if (!visited[v]) {
                    children++;
                    dfs(v, u);
                    // 用子节点的 low 更新当前节点
                    low[u] = Math.min(low[u], low[v]);

                    // 割点判定：
                    // 条件 1: u 是根节点（parent == -1）且有两个或以上子节点
                    // 条件 2: u 不是根节点，且 low[v] >= disc[u]
                    if (parent == -1 && children > 1) {
                        articulationPoints.add(u);
                    }
                    if (parent != -1 && low[v] >= disc[u]) {
                        articulationPoints.add(u);
                    }
                } else if (v != parent) {
                    // 遇到回边（访问到已访问的邻居，且不是父节点）
                    low[u] = Math.min(low[u], disc[v]);
                }
            }
        }

        /** 打印割点详细信息（用于调试和教学） */
        public void printDetails() {
            System.out.println("  Tarjan 算法追踪:");
            System.out.printf("    %-6s %-8s %-8s%n", "顶点", "disc[]", "low[]");
            System.out.println("    " + "-".repeat(24));
            for (int v = 0; v < V; v++) {
                System.out.printf("    %-6d %-8d %-8d%n", v, disc[v], low[v]);
            }
            System.out.println("  割点: " + articulationPoints);
            System.out.println("  判定依据:");
            for (int ap : articulationPoints) {
                System.out.println("    - 顶点 " + ap + " 是割点");
            }
        }
    }

    // ============================================================
    //  辅助方法：打印图
    // ============================================================

    static void printGraph(List<Integer>[] graph, String label) {
        System.out.println("  " + label);
        for (int i = 0; i < graph.length; i++) {
            System.out.println("    " + i + " → " + graph[i]);
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  强连通分量（SCC）与割点 演示");
        System.out.println("================================================\n");

        // ---------- 1. Kosaraju 算法 ----------
        System.out.println("----- Kosaraju 算法求 SCC -----");

        // 测试图 1:
        //   0 → 1 → 3 → 4
        //   ↑   ↓
        //   2 ←─┘
        //
        // SCC: {0,1,2}, {3}, {4}
        int n1 = 5;
        @SuppressWarnings("unchecked")
        List<Integer>[] graph1 = new ArrayList[n1];
        for (int i = 0; i < n1; i++) graph1[i] = new ArrayList<>();
        graph1[0].add(1);
        graph1[1].add(2);
        graph1[1].add(3);
        graph1[2].add(0);
        graph1[3].add(4);

        printGraph(graph1, "有向图 1:");
        Kosaraju kosaraju1 = new Kosaraju(graph1);
        List<List<Integer>> sccs1 = kosaraju1.findSCCs();
        System.out.println("  SCC 数量: " + sccs1.size());
        for (int i = 0; i < sccs1.size(); i++) {
            System.out.println("    SCC " + (i + 1) + ": " + sccs1.get(i));
        }
        System.out.println();

        // 测试图 2（更大图）:
        //   0 → 1 → 2
        //   ↑   ↓   ↓
        //   4 ← 3 ←─┘
        //
        // SCC: {0,1,2,3,4} (整个图强连通)
        @SuppressWarnings("unchecked")
        List<Integer>[] graph2 = new ArrayList[5];
        for (int i = 0; i < 5; i++) graph2[i] = new ArrayList<>();
        graph2[0].add(1);
        graph2[1].add(2);
        graph2[2].add(3);
        graph2[3].add(4);
        graph2[4].add(0);

        Kosaraju kosaraju2 = new Kosaraju(graph2);
        List<List<Integer>> sccs2 = kosaraju2.findSCCs();
        System.out.println("  SCC 数量: " + sccs2.size());
        for (int i = 0; i < sccs2.size(); i++) {
            System.out.println("    SCC " + (i + 1) + ": " + sccs2.get(i));
        }
        System.out.println();

        // ---------- 2. Tarjan 割点 ----------
        System.out.println("----- Tarjan 算法求割点 -----");

        // 测试图（无向图）:
        //         0
        //        / \
        //       1   2
        //       |   |
        //       3 — 4
        //       |
        //       5
        //
        // 割点: 1 和 3
        //   - 移除 1 后，{0,2,4} 与 {3,5} 不连通
        //   - 移除 3 后，{1,0,2,4} 与 {5} 不连通
        int n3 = 6;
        @SuppressWarnings("unchecked")
        List<Integer>[] graph3 = new ArrayList[n3];
        for (int i = 0; i < n3; i++) graph3[i] = new ArrayList<>();
        graph3[0].addAll(Arrays.asList(1, 2));
        graph3[1].addAll(Arrays.asList(0, 3));
        graph3[2].addAll(Arrays.asList(0, 4));
        graph3[3].addAll(Arrays.asList(1, 4, 5));
        graph3[4].addAll(Arrays.asList(2, 3));
        graph3[5].add(3);

        printGraph(graph3, "无向图 1:");

        TarjanArticulation tarjan1 = new TarjanArticulation(graph3);
        Set<Integer> aps1 = tarjan1.findArticulationPoints();
        tarjan1.printDetails();
        System.out.println();

        // 测试图 2（简单条状图，所有内部点都是割点）:
        //   0 — 1 — 2 — 3
        //
        // 割点: 1, 2
        @SuppressWarnings("unchecked")
        List<Integer>[] graph4 = new ArrayList[4];
        for (int i = 0; i < 4; i++) graph4[i] = new ArrayList<>();
        graph4[0].add(1);
        graph4[1].addAll(Arrays.asList(0, 2));
        graph4[2].addAll(Arrays.asList(1, 3));
        graph4[3].add(2);

        System.out.println("----- 条状图割点 -----");
        printGraph(graph4, "无向图 2: 0-1-2-3");
        TarjanArticulation tarjan2 = new TarjanArticulation(graph4);
        Set<Integer> aps2 = tarjan2.findArticulationPoints();
        System.out.println("  割点: " + aps2 + " (期望: {1, 2})");
        System.out.println();

        // 测试图 3（环图，没有割点）:
        //   0 — 1
        //   |   |
        //   3 — 2
        @SuppressWarnings("unchecked")
        List<Integer>[] graph5 = new ArrayList[4];
        for (int i = 0; i < 4; i++) graph5[i] = new ArrayList<>();
        graph5[0].addAll(Arrays.asList(1, 3));
        graph5[1].addAll(Arrays.asList(0, 2));
        graph5[2].addAll(Arrays.asList(1, 3));
        graph5[3].addAll(Arrays.asList(0, 2));

        System.out.println("----- 环图割点 -----");
        printGraph(graph5, "无向图 3: 0-1-2-3-0 (环)");
        TarjanArticulation tarjan3 = new TarjanArticulation(graph5);
        Set<Integer> aps3 = tarjan3.findArticulationPoints();
        System.out.println("  割点: " + aps3 + " (期望: {} 空集，环没有割点)");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}