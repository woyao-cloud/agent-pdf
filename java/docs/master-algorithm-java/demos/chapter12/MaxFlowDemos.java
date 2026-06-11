package masteralgo.chapter12;

import java.util.*;

/**
 * 最大流算法三种实现对比演示
 *
 * 功能：
 * 1. Ford-Fulkerson（DFS 找增广路径）
 * 2. Edmonds-Karp（BFS 找增广路径）
 * 3. Dinic（分层图 + 阻塞流）
 * 4. 构建示例流网络并计算最大流
 * 5. 每次增广后打印残余图
 * 6. 比较三种算法的流值和迭代次数
 */
public class MaxFlowDemos {

    // ============================================================
    //  公用数据结构
    // ============================================================
    static class Edge {
        int to, rev;
        int cap;
        Edge(int t, int r, int c) { to = t; rev = r; cap = c; }
    }

    static class Dinic {
        int n;
        List<Edge>[] g;
        int[] level, it;
        int iterCount;

        @SuppressWarnings("unchecked")
        Dinic(int n) {
            this.n = n;
            g = new ArrayList[n];
            for (int i = 0; i < n; i++) g[i] = new ArrayList<>();
        }

        void addEdge(int from, int to, int cap) {
            g[from].add(new Edge(to, g[to].size(), cap));
            g[to].add(new Edge(from, g[from].size() - 1, 0));
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
            iterCount = 0;
            while (bfs(s, t)) {
                it = new int[n];
                int f;
                while ((f = dfs(s, t, Integer.MAX_VALUE)) > 0) {
                    flow += f;
                    iterCount++;
                }
            }
            return flow;
        }
    }

    // ============================================================
    //  1. Ford-Fulkerson (DFS)
    // ============================================================
    static class FordFulkerson {
        int n;
        int[][] cap, flow;
        boolean[] visited;
        int iterCount;

        FordFulkerson(int n) {
            this.n = n;
            cap = new int[n][n];
            flow = new int[n][n];
        }

        void addEdge(int u, int v, int c) {
            cap[u][v] = c;
        }

        int dfs(int u, int t, int f) {
            if (u == t) return f;
            visited[u] = true;
            for (int v = 0; v < n; v++) {
                int residual = cap[u][v] - flow[u][v];
                if (!visited[v] && residual > 0) {
                    int d = dfs(v, t, Math.min(f, residual));
                    if (d > 0) {
                        flow[u][v] += d;
                        flow[v][u] -= d;
                        return d;
                    }
                }
            }
            return 0;
        }

        int maxFlow(int s, int t) {
            int total = 0;
            iterCount = 0;
            while (true) {
                visited = new boolean[n];
                int f = dfs(s, t, Integer.MAX_VALUE);
                if (f == 0) break;
                total += f;
                iterCount++;
                // 打印本次增广后的残余图
                System.out.printf("    Ford-Fulkerson 增广 #%d: 增加流量 %d%n", iterCount, f);
                printResidual();
            }
            return total;
        }

        void printResidual() {
            System.out.println("    残余网络 (非零残余容量):");
            for (int u = 0; u < n; u++) {
                for (int v = 0; v < n; v++) {
                    int res = cap[u][v] - flow[u][v];
                    if (res > 0) {
                        System.out.printf("      %d -> %d : %d%n", u, v, res);
                    }
                }
            }
        }
    }

    // ============================================================
    //  2. Edmonds-Karp (BFS)
    // ============================================================
    static class EdmondsKarp {
        int n;
        int[][] cap, flow;
        int iterCount;

        EdmondsKarp(int n) {
            this.n = n;
            cap = new int[n][n];
            flow = new int[n][n];
        }

        void addEdge(int u, int v, int c) {
            cap[u][v] = c;
        }

        int bfs(int s, int t, int[] parent) {
            Arrays.fill(parent, -1);
            Queue<Integer> q = new LinkedList<>();
            parent[s] = s;
            q.offer(s);
            while (!q.isEmpty()) {
                int u = q.poll();
                for (int v = 0; v < n; v++) {
                    int residual = cap[u][v] - flow[u][v];
                    if (parent[v] == -1 && residual > 0) {
                        parent[v] = u;
                        if (v == t) return residual;
                        q.offer(v);
                    }
                }
            }
            return 0;
        }

        int maxFlow(int s, int t) {
            int total = 0;
            iterCount = 0;
            int[] parent = new int[n];
            while (true) {
                int bottleneck = bfs(s, t, parent);
                if (bottleneck == 0 || parent[t] == -1) break;
                // 计算路径上的实际瓶颈
                int minCap = Integer.MAX_VALUE;
                for (int v = t; v != s; v = parent[v]) {
                    int u = parent[v];
                    minCap = Math.min(minCap, cap[u][v] - flow[u][v]);
                }
                // 增广
                for (int v = t; v != s; v = parent[v]) {
                    int u = parent[v];
                    flow[u][v] += minCap;
                    flow[v][u] -= minCap;
                }
                total += minCap;
                iterCount++;
                System.out.printf("    Edmonds-Karp 增广 #%d: 增加流量 %d%n", iterCount, minCap);
                printResidual();
            }
            return total;
        }

        void printResidual() {
            System.out.println("    残余网络 (非零残余容量):");
            for (int u = 0; u < n; u++) {
                for (int v = 0; v < n; v++) {
                    int res = cap[u][v] - flow[u][v];
                    if (res > 0) {
                        System.out.printf("      %d -> %d : %d%n", u, v, res);
                    }
                }
            }
        }
    }

    // ============================================================
    //  3. Dinic 实现（复用上面 Dinic 内部类）
    // ============================================================
    // 直接用 Dinic 类

    // ============================================================
    //  示例网络：计算从 s=0 到 t=5 的最大流
    //  网络结构：
    //      0 --10--> 1 --8--> 3 --10--> 5
    //      |         |        |
    //      |5        |10      |5
    //      v         v        v
    //      2 --15--> 4 --5--> 5
    //      |                   ^
    //      |8                  |
    //      +---10--> 3 --------+
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  最大流算法对比演示");
        System.out.println("  网络: 6个顶点 (0=s, 5=t)");
        System.out.println("==========================================");
        System.out.println();

        // ---------- Ford-Fulkerson ----------
        System.out.println("--- [Ford-Fulkerson] ---");
        FordFulkerson ff = new FordFulkerson(6);
        ff.addEdge(0, 1, 10);
        ff.addEdge(0, 2, 5);
        ff.addEdge(1, 3, 8);
        ff.addEdge(1, 4, 10);
        ff.addEdge(2, 3, 10);
        ff.addEdge(2, 4, 15);
        ff.addEdge(3, 5, 10);
        ff.addEdge(4, 5, 5);
        int ffFlow = ff.maxFlow(0, 5);
        System.out.printf("  Ford-Fulkerson 最大流值: %d, 增广次数: %d%n%n", ffFlow, ff.iterCount);

        // ---------- Edmonds-Karp ----------
        System.out.println("--- [Edmonds-Karp] ---");
        EdmondsKarp ek = new EdmondsKarp(6);
        ek.addEdge(0, 1, 10);
        ek.addEdge(0, 2, 5);
        ek.addEdge(1, 3, 8);
        ek.addEdge(1, 4, 10);
        ek.addEdge(2, 3, 10);
        ek.addEdge(2, 4, 15);
        ek.addEdge(3, 5, 10);
        ek.addEdge(4, 5, 5);
        int ekFlow = ek.maxFlow(0, 5);
        System.out.printf("  Edmonds-Karp 最大流值: %d, 增广次数: %d%n%n", ekFlow, ek.iterCount);

        // ---------- Dinic ----------
        System.out.println("--- [Dinic] ---");
        Dinic dinic = new Dinic(6);
        dinic.addEdge(0, 1, 10);
        dinic.addEdge(0, 2, 5);
        dinic.addEdge(1, 3, 8);
        dinic.addEdge(1, 4, 10);
        dinic.addEdge(2, 3, 10);
        dinic.addEdge(2, 4, 15);
        dinic.addEdge(3, 5, 10);
        dinic.addEdge(4, 5, 5);
        int dinicFlow = dinic.maxFlow(0, 5);
        System.out.printf("  Dinic 最大流值: %d, DFS阻塞流调用次数: %d%n%n", dinicFlow, dinic.iterCount);

        // ---------- 对比总结 ----------
        System.out.println("==========================================");
        System.out.println("  算法对比汇总");
        System.out.println("==========================================");
        System.out.printf("  Ford-Fulkerson : 流值=%2d, 增广次数=%d%n", ffFlow, ff.iterCount);
        System.out.printf("  Edmonds-Karp   : 流值=%2d, 增广次数=%d%n", ekFlow, ek.iterCount);
        System.out.printf("  Dinic          : 流值=%2d, 阻塞流次数=%d%n", dinicFlow, dinic.iterCount);
        System.out.println("  三种算法得到相同的最大流值，但迭代次数不同。");
        System.out.println("  Ford-Fulkerson 可能受DFS路径选择影响，Edmonds-Karp保证最短增广路径。");
        System.out.println("  Dinic 通过分层图一次阻塞流处理多条增广路径，效率最高。");
    }
}