package masteralgo.chapter10;

import java.util.*;

/**
 * 拓扑排序演示——Kahn 算法 vs DFS 后序法
 *
 * 功能：
 * 1. Kahn 算法（BFS + 入度）
 * 2. DFS 后序逆序拓扑排序
 * 3. 构建课程先修 DAG 并输出拓扑顺序
 * 4. 检测环（有环时不存在拓扑排序）
 * 5. 打印两种算法的结果对比
 */
public class TopologicalSort {

    // ============================================================
    //  Kahn 算法（BFS + 入度数组）
    // ============================================================
    public static List<Integer> kahnSort(List<Integer>[] graph) {
        int n = graph.length;
        int[] indegree = new int[n];

        // 计算入度
        for (int u = 0; u < n; u++) {
            for (int v : graph[u]) {
                indegree[v]++;
            }
        }

        // 入度为 0 的顶点入队
        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < n; i++) {
            if (indegree[i] == 0) {
                queue.offer(i);
            }
        }

        List<Integer> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            result.add(u);
            for (int v : graph[u]) {
                indegree[v]--;
                if (indegree[v] == 0) {
                    queue.offer(v);
                }
            }
        }

        // 如果结果数量不等于顶点数，说明存在环
        if (result.size() != n) {
            throw new RuntimeException("图中存在环，无法进行拓扑排序！");
        }

        return result;
    }

    // ============================================================
    //  DFS 后序法拓扑排序
    // ============================================================
    public static List<Integer> dfsTopologicalSort(List<Integer>[] graph) {
        int n = graph.length;
        boolean[] visited = new boolean[n];
        Deque<Integer> stack = new ArrayDeque<>();

        for (int v = 0; v < n; v++) {
            if (!visited[v]) {
                dfsTopoHelper(v, visited, stack, graph);
            }
        }

        List<Integer> result = new ArrayList<>();
        while (!stack.isEmpty()) {
            result.add(stack.pop());
        }
        return result;
    }

    private static void dfsTopoHelper(int v, boolean[] visited,
                                       Deque<Integer> stack, List<Integer>[] graph) {
        visited[v] = true;
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                dfsTopoHelper(neighbor, visited, stack, graph);
            }
        }
        stack.push(v);  // 后序入栈，最终栈顶是拓扑序的第一个元素
    }

    // ============================================================
    //  有向图环检测（Kahn 算法的副产品）
    // ============================================================
    public static boolean hasCycle(List<Integer>[] graph) {
        try {
            kahnSort(graph);
            return false;
        } catch (RuntimeException e) {
            return true;
        }
    }

    /** 打印图的结构 */
    public static void printGraph(List<Integer>[] graph) {
        for (int i = 0; i < graph.length; i++) {
            System.out.println("    " + i + " → " + graph[i]);
        }
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  拓扑排序演示");
        System.out.println("================================================\n");

        // ---------- 1. 课程先修 DAG ----------
        // 计算机专业课程依赖关系：
        // 课程编号:
        //   0: 程序设计  1: 数据结构  2: 离散数学
        //   3: 算法分析  4: 操作系统  5: 数据库
        //   6: 编译原理  7: 计算机网络
        //
        // 依赖关系（有向边 u→v 表示"先修 u 才能修 v"）:
        //   程序设计(0) → 数据结构(1)
        //   程序设计(0) → 离散数学(2)
        //   数据结构(1) → 算法分析(3)
        //   离散数学(2) → 算法分析(3)
        //   数据结构(1) → 操作系统(4)
        //   算法分析(3) → 编译原理(6)
        //   操作系统(4) → 编译原理(6)
        //   操作系统(4) → 计算机网络(7)
        //   程序设计(0) → 数据库(5)
        System.out.println("----- 课程先修 DAG -----");
        System.out.println("  0: 程序设计  1: 数据结构  2: 离散数学");
        System.out.println("  3: 算法分析  4: 操作系统  5: 数据库");
        System.out.println("  6: 编译原理  7: 计算机网络\n");

        int n = 8;
        @SuppressWarnings("unchecked")
        List<Integer>[] courseGraph = new ArrayList[n];
        for (int i = 0; i < n; i++) courseGraph[i] = new ArrayList<>();

        courseGraph[0].addAll(Arrays.asList(1, 2, 5));  // 程序设计 → 数据结构, 离散数学, 数据库
        courseGraph[1].addAll(Arrays.asList(3, 4));     // 数据结构 → 算法分析, 操作系统
        courseGraph[2].add(3);                           // 离散数学 → 算法分析
        courseGraph[3].add(6);                           // 算法分析 → 编译原理
        courseGraph[4].addAll(Arrays.asList(6, 7));     // 操作系统 → 编译原理, 计算机网络

        System.out.println("  依赖关系:");
        printGraph(courseGraph);
        System.out.println("  (若无环，可以输出合法选课顺序)\n");

        // ---------- 2. Kahn 算法 ----------
        System.out.println("----- Kahn 算法拓扑排序 -----");
        try {
            List<Integer> kahnResult = kahnSort(courseGraph);
            System.out.print("  选课顺序: ");
            for (int v : kahnResult) System.out.print(v + " ");
            System.out.println();
            System.out.println("  课程名: ");
            String[] courseNames = {"程序设计", "数据结构", "离散数学", "算法分析",
                                    "操作系统", "数据库", "编译原理", "计算机网络"};
            System.out.print("  ");
            for (int v : kahnResult) System.out.print(courseNames[v] + " → ");
            System.out.println("完成");
        } catch (RuntimeException e) {
            System.out.println("  " + e.getMessage());
        }
        System.out.println();

        // ---------- 3. DFS 后序拓扑排序 ----------
        System.out.println("----- DFS 后序法拓扑排序 -----");
        List<Integer> dfsResult = dfsTopologicalSort(courseGraph);
        System.out.print("  选课顺序: ");
        for (int v : dfsResult) System.out.print(v + " ");
        System.out.println();
        String[] courseNames = {"程序设计", "数据结构", "离散数学", "算法分析",
                                "操作系统", "数据库", "编译原理", "计算机网络"};
        System.out.print("  ");
        for (int v : dfsResult) System.out.print(courseNames[v] + " → ");
        System.out.println("完成");
        System.out.println();

        // ---------- 4. 有环图检测 ----------
        System.out.println("----- 有环图检测 -----");
        @SuppressWarnings("unchecked")
        List<Integer>[] cyclicGraph = new ArrayList[3];
        for (int i = 0; i < 3; i++) cyclicGraph[i] = new ArrayList<>();
        cyclicGraph[0].add(1);
        cyclicGraph[1].add(2);
        cyclicGraph[2].add(0);
        System.out.println("  有环图: 0→1→2→0");
        System.out.println("  Kahn算法检测有环? " + hasCycle(cyclicGraph));

        // 使用 try-catch 展示 Kahn 在环上的行为
        try {
            kahnSort(cyclicGraph);
        } catch (RuntimeException e) {
            System.out.println("  Kahn算法抛出异常: " + e.getMessage());
        }
        System.out.println();

        // ---------- 5. 另一种 DAG ----------
        System.out.println("----- 更大规模 DAG (7个顶点) -----");
        @SuppressWarnings("unchecked")
        List<Integer>[] dag = new ArrayList[7];
        for (int i = 0; i < 7; i++) dag[i] = new ArrayList<>();
        dag[0].addAll(Arrays.asList(1, 2));
        dag[1].addAll(Arrays.asList(3, 4));
        dag[2].addAll(Arrays.asList(5, 6));
        dag[3].addAll(Arrays.asList(5));
        dag[4].addAll(Arrays.asList(6));

        System.out.println("  图结构:");
        printGraph(dag);

        List<Integer> kahn = kahnSort(dag);
        List<Integer> dfs = dfsTopologicalSort(dag);

        System.out.print("  Kahn: ");
        for (int v : kahn) System.out.print(v + " ");
        System.out.println();
        System.out.print("  DFS:  ");
        for (int v : dfs) System.out.print(v + " ");
        System.out.println();
        System.out.println("  两种算法结果是否相同? " + kahn.equals(dfs));
        System.out.println("  (注意: 拓扑排序不唯一，两种算法结果可能不同但都合法)");

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}