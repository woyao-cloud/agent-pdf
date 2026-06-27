package com.graphdb.demo.graphtheory;

import java.util.*;

public class ShortestPath {

    static class Edge {
        int to;
        int weight;
        Edge(int to, int weight) {
            this.to = to;
            this.weight = weight;
        }
    }

    private final int n;
    private final List<List<Edge>> adj;

    public ShortestPath(int n) {
        this.n = n;
        this.adj = new ArrayList<>(n);
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int from, int to, int weight) {
        adj.get(from).add(new Edge(to, weight));
    }

    public void addUndirectedEdge(int u, int v, int weight) {
        adj.get(u).add(new Edge(v, weight));
        adj.get(v).add(new Edge(u, weight));
    }

    public int[] dijkstra(int start, int[] prev) {
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[start] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
        pq.offer(new int[]{start, 0});

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int v = cur[0];
            int d = cur[1];
            if (d > dist[v]) continue;
            for (Edge e : adj.get(v)) {
                int nd = d + e.weight;
                if (nd < dist[e.to]) {
                    dist[e.to] = nd;
                    prev[e.to] = v;
                    pq.offer(new int[]{e.to, nd});
                }
            }
        }
        return dist;
    }

    public int[] bellmanFord(int start, int[] prev) {
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[start] = 0;

        List<int[]> edgeList = new ArrayList<>();
        for (int u = 0; u < n; u++) {
            for (Edge e : adj.get(u)) {
                edgeList.add(new int[]{u, e.to, e.weight});
            }
        }

        for (int i = 0; i < n - 1; i++) {
            boolean updated = false;
            for (int[] e : edgeList) {
                if (dist[e[0]] != Integer.MAX_VALUE
                    && dist[e[0]] + e[2] < dist[e[1]]) {
                    dist[e[1]] = dist[e[0]] + e[2];
                    prev[e[1]] = e[0];
                    updated = true;
                }
            }
            if (!updated) break;
        }

        for (int[] e : edgeList) {
            if (dist[e[0]] != Integer.MAX_VALUE
                && dist[e[0]] + e[2] < dist[e[1]]) {
                System.out.println("  [警告] 检测到负权环! 节点 " + e[0] + " -> " + e[1]);
                return null;
            }
        }
        return dist;
    }

    public static String buildPath(int[] prev, int target) {
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != -1; v = prev[v]) {
            path.add(v);
        }
        Collections.reverse(path);
        return path.toString();
    }

    public static void main(String[] args) {
        System.out.println("========== 最短路径演示 ==========");
        System.out.println();

        System.out.println("--- 正权图: Dijkstra & Bellman-Ford ---");
        ShortestPath g1 = new ShortestPath(6);
        g1.addUndirectedEdge(0, 1, 4);
        g1.addUndirectedEdge(0, 2, 2);
        g1.addUndirectedEdge(1, 2, 1);
        g1.addUndirectedEdge(1, 3, 5);
        g1.addUndirectedEdge(2, 4, 3);
        g1.addUndirectedEdge(3, 4, 2);
        g1.addUndirectedEdge(3, 5, 6);
        g1.addUndirectedEdge(4, 5, 1);

        int[] prevD = new int[6];
        int[] distD = g1.dijkstra(0, prevD);
        System.out.println("  Dijkstra 从节点 0 出发:");
        for (int i = 0; i < 6; i++) {
            System.out.println("    到 " + i + " 距离=" + distD[i]
                + " 路径=" + buildPath(prevD, i));
        }

        int[] prevB = new int[6];
        int[] distB = g1.bellmanFord(0, prevB);
        if (distB != null) {
            System.out.println("  Bellman-Ford 从节点 0 出发:");
            for (int i = 0; i < 6; i++) {
                System.out.println("    到 " + i + " 距离=" + distB[i]
                    + " 路径=" + buildPath(prevB, i));
            }
            System.out.println("  结果一致: " + Arrays.equals(distD, distB));
        }
        System.out.println();

        System.out.println("--- 含负权边: Bellman-Ford ---");
        ShortestPath g2 = new ShortestPath(4);
        g2.addEdge(0, 1, 1);
        g2.addEdge(1, 2, -3);
        g2.addEdge(2, 3, 2);
        g2.addEdge(0, 3, 5);

        int[] prevN = new int[4];
        int[] distN = g2.bellmanFord(0, prevN);
        if (distN != null) {
            System.out.println("  Bellman-Ford 从节点 0 出发 (含负权):");
            for (int i = 0; i < 4; i++) {
                System.out.println("    到 " + i + " 距离=" + distN[i]
                    + " 路径=" + buildPath(prevN, i));
            }
        }
        System.out.println();

        System.out.println("--- 负权环检测 ---");
        ShortestPath g3 = new ShortestPath(3);
        g3.addEdge(0, 1, 1);
        g3.addEdge(1, 2, -2);
        g3.addEdge(2, 0, -1);
        int[] prevC = new int[3];
        int[] distC = g3.bellmanFord(0, prevC);
        if (distC == null) {
            System.out.println("  正确检测到负权环, 无最短路径");
        }
        System.out.println();

        System.out.println("--- 算法对比 ---");
        System.out.println("  Dijkstra:    O((V+E)logV), 仅正权, 贪心");
        System.out.println("  Bellman-Ford: O(VE), 支持负权, 可检测负环, DP");
        System.out.println();
    }
}
