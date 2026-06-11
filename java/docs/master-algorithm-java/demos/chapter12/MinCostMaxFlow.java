package masteralgo.chapter12;

import java.util.*;

/**
 * 最小费用最大流演示 (Min-Cost Max-Flow)
 *
 * 功能：
 * 1. 连续最短增广路径算法 (Successive Shortest Augmenting Path)
 * 2. 使用势能 (Potentials / Johnson's algorithm) 保证非负约简费用
 * 3. 构建带容量和费用的流网络
 * 4. 计算发送指定流量时的最小费用
 * 5. 打印每条边上的流量和费用
 */
public class MinCostMaxFlow {

    // ============================================================
    //  边结构
    // ============================================================
    static class Edge {
        int to, rev;
        int cap, cost;
        Edge(int t, int r, int c, int co) {
            to = t; rev = r; cap = c; cost = co;
        }
    }

    // ============================================================
    //  Min-Cost Max-Flow (SSP + Potentials)
    // ============================================================
    static class MinCostFlow {
        int n;
        List<Edge>[] g;
        int[] pot;      // 势能
        int[] dist;     // 最短距离
        int[] prevv;    // 前驱顶点
        int[] preve;    // 前驱边索引

        @SuppressWarnings("unchecked")
        MinCostFlow(int n) {
            this.n = n;
            g = new ArrayList[n];
            for (int i = 0; i < n; i++) g[i] = new ArrayList<>();
            pot = new int[n];
            dist = new int[n];
            prevv = new int[n];
            preve = new int[n];
        }

        void addEdge(int from, int to, int cap, int cost) {
            g[from].add(new Edge(to, g[to].size(), cap, cost));
            g[to].add(new Edge(from, g[from].size() - 1, 0, -cost));
        }

        /**
         * 发送目标流量 targetFlow 的最小费用
         * @return [总流量, 总费用]
         */
        int[] minCostFlow(int s, int t, int targetFlow) {
            int flow = 0, cost = 0;

            // 初始势能用 Bellman-Ford (处理负权边)
            Arrays.fill(pot, Integer.MAX_VALUE / 2);
            pot[s] = 0;
            boolean updated;
            for (int i = 0; i < n; i++) {
                updated = false;
                for (int v = 0; v < n; v++) {
                    if (pot[v] == Integer.MAX_VALUE / 2) continue;
                    for (int ei = 0; ei < g[v].size(); ei++) {
                        Edge e = g[v].get(ei);
                        if (e.cap > 0 && pot[e.to] > pot[v] + e.cost) {
                            pot[e.to] = pot[v] + e.cost;
                            updated = true;
                        }
                    }
                }
                if (!updated) break;
            }

            int augCount = 0;
            while (flow < targetFlow) {
                // 基于约简费用的 Dijkstra
                Arrays.fill(dist, Integer.MAX_VALUE / 2);
                dist[s] = 0;
                PriorityQueue<int[]> pq = new PriorityQueue<>(
                        (a, b) -> a[1] - b[1]);
                pq.offer(new int[]{s, 0});

                while (!pq.isEmpty()) {
                    int[] cur = pq.poll();
                    int v = cur[0];
                    if (cur[1] > dist[v]) continue;
                    for (int ei = 0; ei < g[v].size(); ei++) {
                        Edge e = g[v].get(ei);
                        if (e.cap <= 0) continue;
                        // 约简费用: rcost = e.cost + pot[v] - pot[e.to]
                        int rcost = e.cost + pot[v] - pot[e.to];
                        if (dist[e.to] > dist[v] + rcost) {
                            dist[e.to] = dist[v] + rcost;
                            prevv[e.to] = v;
                            preve[e.to] = ei;
                            pq.offer(new int[]{e.to, dist[e.to]});
                        }
                    }
                }

                // 无法到达汇点
                if (dist[t] == Integer.MAX_VALUE / 2) break;

                // 更新势能
                for (int v = 0; v < n; v++) {
                    if (dist[v] < Integer.MAX_VALUE / 2) {
                        pot[v] += dist[v];
                    }
                }

                // 计算瓶颈流量
                int d = targetFlow - flow;
                for (int v = t; v != s; v = prevv[v]) {
                    Edge e = g[prevv[v]].get(preve[v]);
                    d = Math.min(d, e.cap);
                }

                // 沿路径增广
                for (int v = t; v != s; v = prevv[v]) {
                    Edge e = g[prevv[v]].get(preve[v]);
                    e.cap -= d;
                    g[v].get(e.rev).cap += d;
                }

                flow += d;
                cost += d * pot[t];
                augCount++;

                System.out.printf("    增广 #%d: 发送 %d 单位, 当前总流量=%d, 当前总费用=%d%n",
                        augCount, d, flow, cost);
            }

            return new int[]{flow, cost};
        }

        /**
         * 打印各边流量（假设每条边打上标签信息）
         */
        void printEdgeFlows(List<EdgeInfo> edgeInfos) {
            System.out.println("  各边流量分配:");
            for (EdgeInfo info : edgeInfos) {
                // 查看正向边（反向边剩余容量 = 原容量 -> 使用了 0 流量）
                // 正向边的残余容量 = 原容量 - 已用流量
                // 反向边的残余容量 = 已用流量
                int used = 0;
                // 反向边的容量就是正向边的已用流量
                for (Edge e : g[info.to]) {
                    if (e.to == info.from && e.cap > 0) {
                        used = e.cap; // 反向边残余 = 正向流量
                        break;
                    }
                }
                System.out.printf("    %d -> %d: 已用 %d / %d, 单位费用 %d%n",
                        info.from, info.to, used, info.cap, info.cost);
            }
        }
    }

    // 辅助类：记录边的元信息（用于打印）
    static class EdgeInfo {
        int from, to, cap, cost;
        EdgeInfo(int f, int t, int c, int co) {
            from = f; to = t; cap = c; cost = co;
        }
    }

    // ============================================================
    //  示例网络：最小成本运输
    //  顶点: 0=源点, 1=工厂A, 2=工厂B, 3=仓库X, 4=仓库Y, 5=汇点
    //                              容量  单位运费
    //     源点 -> 工厂A              10    0
    //     源点 -> 工厂B              15    0
    //     工厂A -> 仓库X             8     2
    //     工厂A -> 仓库Y             7     3
    //     工厂B -> 仓库X             10    4
    //     工厂B -> 仓库Y             12    1
    //     仓库X -> 汇点              12    0
    //     仓库Y -> 汇点              15    0
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  最小费用最大流演示 (SSP + Potentials)");
        System.out.println("==========================================");
        System.out.println();
        System.out.println("  网络: 6个顶点");
        System.out.println("  源点(0) --0元--> 工厂A(1)[cap=10], 工厂B(2)[cap=15]");
        System.out.println("  工厂A --2元--> 仓库X(3)[cap=8], --3元--> 仓库Y(4)[cap=7]");
        System.out.println("  工厂B --4元--> 仓库X(3)[cap=10], --1元--> 仓库Y(4)[cap=12]");
        System.out.println("  仓库X --0元--> 汇点(5)[cap=12]");
        System.out.println("  仓库Y --0元--> 汇点(5)[cap=15]");
        System.out.println();

        MinCostFlow mcf = new MinCostFlow(6);

        // 记录边信息用于打印
        List<EdgeInfo> edgeInfos = new ArrayList<>();

        // 源点 -> 工厂
        mcf.addEdge(0, 1, 10, 0);
        edgeInfos.add(new EdgeInfo(0, 1, 10, 0));
        mcf.addEdge(0, 2, 15, 0);
        edgeInfos.add(new EdgeInfo(0, 2, 15, 0));

        // 工厂 -> 仓库
        mcf.addEdge(1, 3, 8, 2);
        edgeInfos.add(new EdgeInfo(1, 3, 8, 2));
        mcf.addEdge(1, 4, 7, 3);
        edgeInfos.add(new EdgeInfo(1, 4, 7, 3));
        mcf.addEdge(2, 3, 10, 4);
        edgeInfos.add(new EdgeInfo(2, 3, 10, 4));
        mcf.addEdge(2, 4, 12, 1);
        edgeInfos.add(new EdgeInfo(2, 4, 12, 1));

        // 仓库 -> 汇点
        mcf.addEdge(3, 5, 12, 0);
        edgeInfos.add(new EdgeInfo(3, 5, 12, 0));
        mcf.addEdge(4, 5, 15, 0);
        edgeInfos.add(new EdgeInfo(4, 5, 15, 0));

        // 先发送 10 单位流量
        System.out.println("--- 发送 10 单位流量 ---");
        int[] result1 = mcf.minCostFlow(0, 5, 10);
        System.out.printf("  结果: 发送 %d 单位, 总费用 %d%n", result1[0], result1[1]);
        System.out.println();

        // 打印各边流量
        mcf.printEdgeFlows(edgeInfos);
        System.out.println();

        // 再发送到上限
        System.out.println("--- 发送 15 单位流量 (最大可能) ---");
        // 需要重新构建网络（因为之前的已消耗）
        MinCostFlow mcf2 = new MinCostFlow(6);
        mcf2.addEdge(0, 1, 10, 0);
        mcf2.addEdge(0, 2, 15, 0);
        mcf2.addEdge(1, 3, 8, 2);
        mcf2.addEdge(1, 4, 7, 3);
        mcf2.addEdge(2, 3, 10, 4);
        mcf2.addEdge(2, 4, 12, 1);
        mcf2.addEdge(3, 5, 12, 0);
        mcf2.addEdge(4, 5, 15, 0);

        int[] result2 = mcf2.minCostFlow(0, 5, 15);
        System.out.printf("  结果: 发送 %d 单位, 总费用 %d%n", result2[0], result2[1]);
        System.out.println();
        System.out.println("  说明: 算法优先选择费用低的路径 (工厂A->仓库X 费用2, 工厂B->仓库Y 费用1),");
        System.out.println("  然后才走费用较高的路径。这符合最小费用最大流的原理。");
    }
}