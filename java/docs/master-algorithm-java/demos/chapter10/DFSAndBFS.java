package masteralgo.chapter10;

import java.util.*;

/**
 * 深度优先搜索（DFS）与广度优先搜索（BFS）演示
 *
 * 功能：
 * 1. DFS 递归与迭代实现
 * 2. BFS 队列实现
 * 3. 求连通分量（无向图）
 * 4. 有向图环检测（DFS 三色法）
 * 5. 二分图判定（BFS 和 DFS）
 * 6. 打印遍历顺序和结果
 */
public class DFSAndBFS {

    // ============================================================
    //  1. DFS 递归实现
    // ============================================================
    public static void dfsRecursive(int start, List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        System.out.print("  前序: ");
        dfsHelper(start, visited, graph);
        System.out.println();
    }

    private static void dfsHelper(int v, boolean[] visited, List<Integer>[] graph) {
        visited[v] = true;
        System.out.print(v + " ");  // 前序
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                dfsHelper(neighbor, visited, graph);
            }
        }
    }

    /** 带后序遍历的 DFS（用于打印前后序对比） */
    public static void dfsPrePost(int start, List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        System.out.print("  前序: ");
        dfsPrePostHelper(start, visited, graph);
        System.out.println();
    }

    private static void dfsPrePostHelper(int v, boolean[] visited, List<Integer>[] graph) {
        visited[v] = true;
        System.out.print(v + " ");   // 前序
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                dfsPrePostHelper(neighbor, visited, graph);
            }
        }
    }

    /** 后序遍历（单独展示） */
    public static List<Integer> dfsPostOrder(List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        List<Integer> postOrder = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (!visited[i]) {
                dfsPostHelper(i, visited, graph, postOrder);
            }
        }
        return postOrder;
    }

    private static void dfsPostHelper(int v, boolean[] visited,
                                       List<Integer>[] graph, List<Integer> postOrder) {
        visited[v] = true;
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                dfsPostHelper(neighbor, visited, graph, postOrder);
            }
        }
        postOrder.add(v);  // 后序：处理完所有子节点后再记录
    }

    // ============================================================
    //  2. DFS 迭代实现（显式栈）
    // ============================================================
    public static void dfsIterative(int start, List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);

        System.out.print("  DFS迭代: ");
        while (!stack.isEmpty()) {
            int v = stack.pop();
            if (visited[v]) continue;
            visited[v] = true;
            System.out.print(v + " ");
            // 逆序入栈以模拟递归顺序
            List<Integer> neighbors = graph[v];
            for (int i = neighbors.size() - 1; i >= 0; i--) {
                int neighbor = neighbors.get(i);
                if (!visited[neighbor]) {
                    stack.push(neighbor);
                }
            }
        }
        System.out.println();
    }

    // ============================================================
    //  3. BFS 实现
    // ============================================================
    public static void bfs(int start, List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        Queue<Integer> queue = new LinkedList<>();
        visited[start] = true;
        queue.offer(start);

        System.out.print("  BFS: ");
        while (!queue.isEmpty()) {
            int v = queue.poll();
            System.out.print(v + " ");
            for (int neighbor : graph[v]) {
                if (!visited[neighbor]) {
                    visited[neighbor] = true;
                    queue.offer(neighbor);
                }
            }
        }
        System.out.println();
    }

    /** 分层 BFS（按层级打印） */
    public static void bfsLevelOrder(int start, List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        Queue<Integer> queue = new LinkedList<>();
        visited[start] = true;
        queue.offer(start);
        int level = 0;

        System.out.println("  分层 BFS:");
        while (!queue.isEmpty()) {
            int size = queue.size();
            System.out.print("    第 " + level + " 层: ");
            for (int i = 0; i < size; i++) {
                int v = queue.poll();
                System.out.print(v + " ");
                for (int neighbor : graph[v]) {
                    if (!visited[neighbor]) {
                        visited[neighbor] = true;
                        queue.offer(neighbor);
                    }
                }
            }
            System.out.println();
            level++;
        }
    }

    // ============================================================
    //  4. 连通分量（无向图）
    // ============================================================
    public static void findConnectedComponents(List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        List<List<Integer>> components = new ArrayList<>();

        for (int v = 0; v < n; v++) {
            if (!visited[v]) {
                List<Integer> component = new ArrayList<>();
                dfsCollect(v, visited, graph, component);
                components.add(component);
            }
        }

        System.out.println("  连通分量数量: " + components.size());
        for (int i = 0; i < components.size(); i++) {
            System.out.println("    分量 " + (i + 1) + ": " + components.get(i));
        }
    }

    private static void dfsCollect(int v, boolean[] visited,
                                    List<Integer>[] graph, List<Integer> component) {
        visited[v] = true;
        component.add(v);
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                dfsCollect(neighbor, visited, graph, component);
            }
        }
    }

    // ============================================================
    //  5. 有向图环检测（DFS 三色法）
    // ============================================================
    private static final int WHITE = 0;  // 未访问
    private static final int GRAY = 1;   // 在递归栈中
    private static final int BLACK = 2;  // 已访问完成

    public static boolean hasCycleDirected(List<Integer>[] graph) {
        int n = graph.length;
        int[] color = new int[n];
        for (int v = 0; v < n; v++) {
            if (color[v] == WHITE) {
                if (dfsCycleDetect(v, color, graph)) return true;
            }
        }
        return false;
    }

    private static boolean dfsCycleDetect(int v, int[] color, List<Integer>[] graph) {
        color[v] = GRAY;  // 正在访问
        for (int neighbor : graph[v]) {
            if (color[neighbor] == GRAY) {
                return true;  // 遇到正在访问的节点 → 后向边 → 有环
            }
            if (color[neighbor] == WHITE) {
                if (dfsCycleDetect(neighbor, color, graph)) return true;
            }
        }
        color[v] = BLACK;  // 访问完成
        return false;
    }

    // ============================================================
    //  6. 二分图判定
    // ============================================================

    /** BFS 版本 */
    public static boolean isBipartiteBFS(List<Integer>[] graph) {
        int n = graph.length;
        int[] color = new int[n];  // 0=未染色, 1=红色, -1=蓝色
        for (int start = 0; start < n; start++) {
            if (color[start] != 0) continue;
            color[start] = 1;
            Queue<Integer> queue = new LinkedList<>();
            queue.offer(start);
            while (!queue.isEmpty()) {
                int v = queue.poll();
                for (int neighbor : graph[v]) {
                    if (color[neighbor] == 0) {
                        color[neighbor] = -color[v];
                        queue.offer(neighbor);
                    } else if (color[neighbor] == color[v]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /** DFS 版本 */
    public static boolean isBipartiteDFS(List<Integer>[] graph) {
        int n = graph.length;
        int[] color = new int[n];
        for (int v = 0; v < n; v++) {
            if (color[v] == 0) {
                color[v] = 1;
                if (!dfsBipartiteCheck(v, color, graph)) return false;
            }
        }
        return true;
    }

    private static boolean dfsBipartiteCheck(int v, int[] color, List<Integer>[] graph) {
        for (int neighbor : graph[v]) {
            if (color[neighbor] == 0) {
                color[neighbor] = -color[v];
                if (!dfsBipartiteCheck(neighbor, color, graph)) return false;
            } else if (color[neighbor] == color[v]) {
                return false;
            }
        }
        return true;
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  DFS & BFS 遍历演示");
        System.out.println("================================================\n");

        // ---------- 构建测试图 ----------
        // 无向图: 0-1-2-3-4, 且 0-2, 5-6 (两个连通分量)
        //     0 — 1
        //     |   |
        //     2 — 3 — 4    5 — 6
        System.out.println("----- 无向图结构 -----");
        System.out.println("  0 - 1");
        System.out.println("  |   |");
        System.out.println("  2 - 3 - 4    5 - 6\n");
        int n = 7;
        @SuppressWarnings("unchecked")
        List<Integer>[] undirectedGraph = new ArrayList[n];
        for (int i = 0; i < n; i++) undirectedGraph[i] = new ArrayList<>();
        undirectedGraph[0].addAll(Arrays.asList(1, 2));
        undirectedGraph[1].addAll(Arrays.asList(0, 3));
        undirectedGraph[2].addAll(Arrays.asList(0, 3));
        undirectedGraph[3].addAll(Arrays.asList(1, 2, 4));
        undirectedGraph[4].addAll(Arrays.asList(3));
        undirectedGraph[5].addAll(Arrays.asList(6));
        undirectedGraph[6].addAll(Arrays.asList(5));

        // ---------- 1. DFS 递归 ----------
        System.out.println("----- 1. DFS 递归遍历 (从 0 开始) -----");
        dfsRecursive(0, undirectedGraph);
        System.out.println();

        // ---------- 2. DFS 迭代 ----------
        System.out.println("----- 2. DFS 迭代遍历 (从 0 开始) -----");
        dfsIterative(0, undirectedGraph);
        System.out.println();

        // ---------- 3. BFS ----------
        System.out.println("----- 3. BFS 遍历 (从 0 开始) -----");
        bfs(0, undirectedGraph);
        System.out.println();

        // ---------- 4. 分层 BFS ----------
        System.out.println("----- 4. 分层 BFS (从 0 开始) -----");
        bfsLevelOrder(0, undirectedGraph);
        System.out.println();

        // ---------- 5. 连通分量 ----------
        System.out.println("----- 5. 连通分量 -----");
        findConnectedComponents(undirectedGraph);
        System.out.println();

        // ---------- 6. 有向图环检测 ----------
        System.out.println("----- 6. 有向图环检测 -----");
        // 有环图: 0→1→2→0
        @SuppressWarnings("unchecked")
        List<Integer>[] cycleGraph = new ArrayList[3];
        for (int i = 0; i < 3; i++) cycleGraph[i] = new ArrayList<>();
        cycleGraph[0].add(1);
        cycleGraph[1].add(2);
        cycleGraph[2].add(0);
        System.out.println("  图: 0→1→2→0");
        System.out.println("  有环? " + hasCycleDirected(cycleGraph));

        // 无环图: 0→1→2, 0→2
        @SuppressWarnings("unchecked")
        List<Integer>[] dagGraph = new ArrayList[3];
        for (int i = 0; i < 3; i++) dagGraph[i] = new ArrayList<>();
        dagGraph[0].add(1);
        dagGraph[0].add(2);
        dagGraph[1].add(2);
        System.out.println("  图: 0→1, 0→2, 1→2");
        System.out.println("  有环? " + hasCycleDirected(dagGraph));
        System.out.println();

        // ---------- 7. 二分图判定 ----------
        System.out.println("----- 7. 二分图判定 -----");
        // 二分图: 0-1-2-3 (偶数环)
        @SuppressWarnings("unchecked")
        List<Integer>[] bipartiteGraph = new ArrayList[4];
        for (int i = 0; i < 4; i++) bipartiteGraph[i] = new ArrayList<>();
        bipartiteGraph[0].addAll(Arrays.asList(1, 3));
        bipartiteGraph[1].addAll(Arrays.asList(0, 2));
        bipartiteGraph[2].addAll(Arrays.asList(1, 3));
        bipartiteGraph[3].addAll(Arrays.asList(0, 2));
        System.out.println("  二分图: 0-1-2-3-0 (偶数环)");
        System.out.println("  BFS判定: " + isBipartiteBFS(bipartiteGraph));
        System.out.println("  DFS判定: " + isBipartiteDFS(bipartiteGraph));

        // 非二分图: 0-1-2-0 (三角形, 奇数环)
        @SuppressWarnings("unchecked")
        List<Integer>[] nonBipartiteGraph = new ArrayList[3];
        for (int i = 0; i < 3; i++) nonBipartiteGraph[i] = new ArrayList<>();
        nonBipartiteGraph[0].addAll(Arrays.asList(1, 2));
        nonBipartiteGraph[1].addAll(Arrays.asList(0, 2));
        nonBipartiteGraph[2].addAll(Arrays.asList(0, 1));
        System.out.println("  非二分图: 0-1-2-0 (三角形)");
        System.out.println("  BFS判定: " + isBipartiteBFS(nonBipartiteGraph));
        System.out.println("  DFS判定: " + isBipartiteDFS(nonBipartiteGraph));
        System.out.println();

        // ---------- 8. 后序遍历 ----------
        System.out.println("----- 8. DFS 后序遍历 -----");
        List<Integer> postOrder = dfsPostOrder(undirectedGraph);
        System.out.println("  后序: " + postOrder);
        System.out.println("  (对比: 前序: 0 1 3 2 4 5 6)");
        System.out.println("  (后序在拓扑排序中非常有用)");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}