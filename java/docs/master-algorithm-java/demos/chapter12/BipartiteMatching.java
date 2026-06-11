package masteralgo.chapter12;

import java.util.*;

/**
 * 二分图最大匹配演示
 *
 * 功能：
 * 1. 基于最大流规约的二分图匹配（Dinic）
 * 2. 直接DFS增广路径匹配（匈牙利算法风格）
 * 3. 打印匹配结果（左部节点匹配到哪个右部节点）
 * 4. 展示二分图性质和最大匹配大小
 * 5. 两种方法结果对比验证
 */
public class BipartiteMatching {

    // ============================================================
    //  1. 最大流规约法 (Dinic)
    // ============================================================
    static class Dinic {
        List<Edge>[] g;
        int n;
        int[] level, it;

        static class Edge {
            int to, rev, cap;
            Edge(int t, int r, int c) { to = t; rev = r; cap = c; }
        }

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
            while (bfs(s, t)) {
                it = new int[n];
                int f;
                while ((f = dfs(s, t, Integer.MAX_VALUE)) > 0) {
                    flow += f;
                }
            }
            return flow;
        }
    }

    /**
     * 基于最大流的二分图匹配
     * @param left 左部顶点数
     * @param right 右部顶点数
     * @param edges 二分图的边 (左部顶点编号 0..left-1, 右部顶点编号 left..left+right-1)
     * @return 匹配数组 matchRight, matchRight[leftId] = rightId 或 -1
     */
    static int[] maxFlowMatching(int left, int right, List<int[]> edges) {
        int V = left + right + 2;
        int s = left + right;
        int t = s + 1;
        Dinic dinic = new Dinic(V);

        for (int i = 0; i < left; i++) {
            dinic.addEdge(s, i, 1);
        }
        for (int[] e : edges) {
            dinic.addEdge(e[0], left + e[1], 1);
        }
        for (int j = 0; j < right; j++) {
            dinic.addEdge(left + j, t, 1);
        }

        int maxFlow = dinic.maxFlow(s, t);

        // 从残余网络中反推匹配关系
        int[] matchRight = new int[left];
        Arrays.fill(matchRight, -1);
        for (int[] e : edges) {
            int u = e[0];
            int v = left + e[1];
            // 如果左->右的边残余容量为0（原始容量1被用掉了），说明这条边在匹配中
            boolean used = false;
            for (Dinic.Edge de : dinic.g[u]) {
                if (de.to == v && de.cap == 0) {
                    used = true;
                    break;
                }
            }
            if (used) {
                matchRight[u] = e[1];
            }
        }
        System.out.println("  最大匹配大小 (最大流法): " + maxFlow);
        return matchRight;
    }

    // ============================================================
    //  2. 直接DFS增广路径匹配（匈牙利算法风格）
    // ============================================================
    static class HungarianMatching {
        int left, right;
        List<Integer>[] adj;
        int[] matchL, matchR;
        boolean[] visited;

        @SuppressWarnings("unchecked")
        HungarianMatching(int left, int right) {
            this.left = left;
            this.right = right;
            adj = new ArrayList[left];
            for (int i = 0; i < left; i++) adj[i] = new ArrayList<>();
            matchL = new int[left];
            matchR = new int[right];
            Arrays.fill(matchL, -1);
            Arrays.fill(matchR, -1);
        }

        void addEdge(int u, int v) {
            adj[u].add(v);
        }

        boolean dfs(int u) {
            for (int v : adj[u]) {
                if (visited[v]) continue;
                visited[v] = true;
                // 如果v未匹配，或能通过v的匹配节点找到增广路径
                if (matchR[v] == -1 || dfs(matchR[v])) {
                    matchL[u] = v;
                    matchR[v] = u;
                    return true;
                }
            }
            return false;
        }

        int maxMatching() {
            int count = 0;
            for (int u = 0; u < left; u++) {
                visited = new boolean[right];
                if (dfs(u)) count++;
            }
            return count;
        }
    }

    // ============================================================
    //  示例：二分图
    //  左部: {0, 1, 2} (工人)
    //  右部: {3, 4, 5} (任务)
    //  边:
    //    0 -- 3, 0 -- 4
    //    1 -- 4, 1 -- 5
    //    2 -- 3, 2 -- 5
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  二分图最大匹配演示");
        System.out.println("==========================================");
        System.out.println();

        int left = 3, right = 3;
        List<int[]> edges = new ArrayList<>();
        edges.add(new int[]{0, 0});
        edges.add(new int[]{0, 1});
        edges.add(new int[]{1, 1});
        edges.add(new int[]{1, 2});
        edges.add(new int[]{2, 0});
        edges.add(new int[]{2, 2});

        // 打印二分图
        System.out.println("--- 二分图结构 (左部={0,1,2}, 右部={3,4,5}) ---");
        System.out.println("  0 -> 3, 0 -> 4");
        System.out.println("  1 -> 4, 1 -> 5");
        System.out.println("  2 -> 3, 2 -> 5");
        System.out.println();

        // 方法1: 最大流规约
        System.out.println("--- 方法1: 最大流规约 ---");
        int[] matchByFlow = maxFlowMatching(left, right, edges);
        for (int i = 0; i < left; i++) {
            if (matchByFlow[i] != -1) {
                System.out.printf("  左部 %d -> 右部 %d%n", i, matchByFlow[i]);
            } else {
                System.out.printf("  左部 %d -> 未匹配%n", i);
            }
        }
        System.out.println();

        // 方法2: 直接DFS增广（匈牙利）
        System.out.println("--- 方法2: 直接DFS增广路径 (匈牙利算法) ---");
        HungarianMatching hungarian = new HungarianMatching(left, right);
        for (int[] e : edges) {
            hungarian.addEdge(e[0], e[1]);
        }
        int matchSize = hungarian.maxMatching();
        System.out.println("  最大匹配大小 (匈牙利法): " + matchSize);
        for (int i = 0; i < left; i++) {
            if (hungarian.matchL[i] != -1) {
                System.out.printf("  左部 %d -> 右部 %d%n", i, hungarian.matchL[i]);
            } else {
                System.out.printf("  左部 %d -> 未匹配%n", i);
            }
        }
        System.out.println();

        // 验证
        int countByFlow = 0;
        for (int m : matchByFlow) if (m != -1) countByFlow++;
        System.out.println("--- 验证 ---");
        System.out.printf("  最大流法匹配数: %d, 匈牙利法匹配数: %d%n", countByFlow, matchSize);
        System.out.println("  两种方法结果一致: " + (countByFlow == matchSize));
        System.out.println("  二分图最大匹配 = 3 (完美匹配)");
    }
}