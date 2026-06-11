package masteralgo.chapter12;

import java.util.*;

/**
 * 最小割演示 —— 用 Dinic 求最大流后找出最小割
 *
 * 功能：
 * 1. 利用 Dinic 计算最大流（保留残余网络）
 * 2. 在残余网络中从源点 BFS，找到 S 侧顶点
 * 3. 打印跨越 (S, T) 的原始边（即最小割边集）
 * 4. 验证最小割容量 = 最大流值
 * 5. 使用包含瓶颈边的网络，展示有意义的割
 */
public class MinCutDemo {

    // ============================================================
    //  带残余查询的 Dinic
    // ============================================================
    static class Edge {
        int to, rev, cap;
        int origCap; // 保存原始容量，用于验证和打印
        Edge(int t, int r, int c, int oc) {
            to = t; rev = r; cap = c; origCap = oc;
        }
    }

    static class DinicWithResidual {
        int n;
        List<Edge>[] g;
        int[] level, it;

        @SuppressWarnings("unchecked")
        DinicWithResidual(int n) {
            this.n = n;
            g = new ArrayList[n];
            for (int i = 0; i < n; i++) g[i] = new ArrayList<>();
        }

        void addEdge(int from, int to, int cap) {
            g[from].add(new Edge(to, g[to].size(), cap, cap));
            g[to].add(new Edge(from, g[from].size() - 1, 0, 0));
        }

        boolean bfs(int s, int t) {
            level = new int[n];
            Arrays.fill(level, -1);
            Queue<Integer> q = new LinkedList<>();
            level[s] = 0;
            q.offer(s);
            while (!q.isEmpty()) {
                int v = q.poll();
                for (Edge e : g[v]) {
                    if (e.cap > 0 && level[e.to] < 0) {
                        level[e.to] = level[v] + 1;
                        q.offer(e.to);
                    }
                }
            }
            return level[t] >= 0;
        }

        int dfs(int v, int t, int f) {
            if (v == t) return f;
            for (int i = it[v]; i < g[v].size(); i++) {
                it[v] = i;
                Edge e = g[v].get(i);
                if (e.cap > 0 && level[v] + 1 == level[e.to]) {
                    int d = dfs(e.to, t, Math.min(f, e.cap));
                    if (d > 0) {
                        e.cap -= d;
                        g[e.to].get(e.rev).cap += d;
                        return d;
                    }
                }
            }
            return 0;
        }

        int maxFlow(int s, int t) {
            int flow = 0;
            while (bfs(s, t)) {
                it = new int[n];
                int f;
                while ((f = dfs(s, t, Integer.MAX_VALUE)) > 0) {
                    flow += f;
                }
            }
            return flow;
        }

        /**
         * 在残余网络中从 s 出发找所有可达顶点
         */
        Set<Integer> reachableFromSource(int s) {
            Set<Integer> reachable = new HashSet<>();
            Queue<Integer> q = new LinkedList<>();
            reachable.add(s);
            q.offer(s);
            while (!q.isEmpty()) {
                int v = q.poll();
                for (Edge e : g[v]) {
                    if (e.cap > 0 && !reachable.contains(e.to)) {
                        reachable.add(e.to);
                        q.offer(e.to);
                    }
                }
            }
            return reachable;
        }

        /**
         * 求最小割：返回从 S 到 T 的原始边（正向边）
         */
        List<String> findMinCutEdges(int s, int t) {
            Set<Integer> S = reachableFromSource(s);
            List<String> cutEdges = new ArrayList<>();
            int cutCapacity = 0;
            for (int u = 0; u < n; u++) {
                if (!S.contains(u)) continue;
                for (Edge e : g[u]) {
                    if (!S.contains(e.to) && e.origCap > 0) {
                        cutEdges.add(String.format("    %d -> %d (容量 %d)", u, e.to, e.origCap));
                        cutCapacity += e.origCap;
                    }
                }
            }
            System.out.println("  最小割容量: " + cutCapacity);
            return cutEdges;
        }
    }

    // ============================================================
    //  示例网络
    //  顶点: 0=s, 5=t
    //  关键瓶颈: 1->3 容量为 3（瓶颈边）
    //      0 --5--> 1 --3--> 3 --7--> 5
    //      |         |        |
    //      |4        |6       |2
    //      v         v        v
    //      2 --8--> 4 --5--> 5
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  最小割演示 (Max-Flow Min-Cut Theorem)");
        System.out.println("  网络: 6个顶点 (0=s, 5=t)");
        System.out.println("  瓶颈边 1->3 容量为3");
        System.out.println("==========================================");
        System.out.println();

        DinicWithResidual dinic = new DinicWithResidual(6);
        dinic.addEdge(0, 1, 5);
        dinic.addEdge(0, 2, 4);
        dinic.addEdge(1, 3, 3);  // 瓶颈边
        dinic.addEdge(1, 4, 6);
        dinic.addEdge(2, 4, 8);
        dinic.addEdge(3, 5, 7);
        dinic.addEdge(4, 5, 5);

        int maxFlow = dinic.maxFlow(0, 5);
        System.out.println("  最大流值: " + maxFlow);
        System.out.println();

        // 2. 求最小割（S 侧可达顶点）
        System.out.println("--- 最小割 ---");
        Set<Integer> S = dinic.reachableFromSource(0);
        System.out.println("  S侧顶点 (从源点残余可达): " + S);
        Set<Integer> T = new HashSet<>();
        for (int i = 0; i < 6; i++) {
            if (!S.contains(i)) T.add(i);
        }
        System.out.println("  T侧顶点: " + T);
        System.out.println();

        // 3. 打印跨越 (S,T) 的边
        System.out.println("--- 跨越 (S, T) 的边 (最小割) ---");
        List<String> cutEdges = dinic.findMinCutEdges(0, 5);
        for (String edge : cutEdges) {
            System.out.println(edge);
        }
        System.out.println();

        // 4. 验证最大流最小割定理
        System.out.println("--- 验证 ---");
        int cutCap = 0;
        for (int u = 0; u < 6; u++) {
            if (!S.contains(u)) continue;
            for (Edge e : dinic.g[u]) {
                if (!S.contains(e.to) && e.origCap > 0) {
                    cutCap += e.origCap;
                }
            }
        }
        System.out.printf("  最大流值 = %d, 最小割容量 = %d%n", maxFlow, cutCap);
        System.out.println("  最大流值 == 最小割容量: " + (maxFlow == cutCap));
        System.out.println("  验证了最大流最小割定理!");
    }
}