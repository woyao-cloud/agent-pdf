package com.graphdb.demo.graphtheory;

import java.util.*;

public class GraphTraversal {

    private final int n;
    private final List<List<Integer>> adj;

    public GraphTraversal(int n) {
        this.n = n;
        this.adj = new ArrayList<>(n);
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int u, int v) {
        adj.get(u).add(v);
        adj.get(v).add(u);
    }

    public List<Integer> dfsRecursive(int start) {
        boolean[] visited = new boolean[n];
        List<Integer> order = new ArrayList<>();
        dfsRecursive(start, visited, order);
        return order;
    }

    private void dfsRecursive(int v, boolean[] visited, List<Integer> order) {
        visited[v] = true;
        order.add(v);
        for (int w : adj.get(v)) {
            if (!visited[w]) {
                dfsRecursive(w, visited, order);
            }
        }
    }

    public List<Integer> dfsIterative(int start) {
        boolean[] visited = new boolean[n];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);
        while (!stack.isEmpty()) {
            int v = stack.pop();
            if (!visited[v]) {
                visited[v] = true;
                order.add(v);
                for (int w : adj.get(v)) {
                    if (!visited[w]) {
                        stack.push(w);
                    }
                }
            }
        }
        return order;
    }

    public List<Integer> bfs(int start) {
        boolean[] visited = new boolean[n];
        List<Integer> order = new ArrayList<>();
        Queue<Integer> queue = new LinkedList<>();
        visited[start] = true;
        queue.offer(start);
        while (!queue.isEmpty()) {
            int v = queue.poll();
            order.add(v);
            for (int w : adj.get(v)) {
                if (!visited[w]) {
                    visited[w] = true;
                    queue.offer(w);
                }
            }
        }
        return order;
    }

    public static void main(String[] args) {
        System.out.println("========== 图遍历演示 ==========");
        System.out.println("构建图：6个节点，边: 0-1, 0-2, 1-2, 1-3, 2-4, 3-4, 3-5, 4-5");
        System.out.println();

        GraphTraversal g = new GraphTraversal(6);
        g.addEdge(0, 1);
        g.addEdge(0, 2);
        g.addEdge(1, 2);
        g.addEdge(1, 3);
        g.addEdge(2, 4);
        g.addEdge(3, 4);
        g.addEdge(3, 5);
        g.addEdge(4, 5);

        System.out.println("--- DFS 递归 (从节点 0) ---");
        List<Integer> dfsRec = g.dfsRecursive(0);
        System.out.println("  遍历顺序: " + dfsRec);
        System.out.println("  原理: 递归调用栈, 深入到底再回溯");
        System.out.println("  应用: 连通分量, 拓扑排序, 环检测");
        System.out.println();

        System.out.println("--- DFS 迭代 (从节点 0) ---");
        List<Integer> dfsIt = g.dfsIterative(0);
        System.out.println("  遍历顺序: " + dfsIt);
        System.out.println("  原理: 显式栈模拟递归, 避免栈溢出");
        System.out.println("  注意: 顺序可能与递归不同 (取决于邻居入栈顺序)");
        System.out.println();

        System.out.println("--- BFS (从节点 0) ---");
        List<Integer> bfs = g.bfs(0);
        System.out.println("  遍历顺序: " + bfs);
        System.out.println("  原理: 队列逐层扩展, 先访问距离近的节点");
        System.out.println("  应用: 无权图最短路径, 层次遍历");
        System.out.println();
    }
}
