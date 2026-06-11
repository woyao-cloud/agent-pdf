package masteralgo.chapter11;

import java.util.*;

/**
 * 最短路径问题变形演示
 *
 * 功能：
 * 1. 双向 Dijkstra（从源点和目标点同时搜索）
 * 2. DAG 最短路径（DP + 拓扑排序，O(V+E)）
 * 3. A* 搜索（曼哈顿距离启发式，网格图）
 * 4. 打印路径和搜索过程中的探索范围对比
 */
public class ShortestPathVariants {

    // ============================================================
    //  1. 工具类
    // ============================================================

    static class AdjEdge {
        int to, weight;
        AdjEdge(int t, int w) { to = t; weight = w; }
    }

    static class Pair {
        int vertex, distance;
        Pair(int v, int d) { vertex = v; distance = d; }
    }

    // ============================================================
    //  2. 双向 Dijkstra
    // ============================================================

    /**
     * 双向 Dijkstra：从 source 和 target 同时搜索
     *
     * @return 最短距离，如果不可达则返回 Integer.MAX_VALUE
     */
    public static int bidirectionalDijkstra(
            int source, int target,
            List<AdjEdge>[] forwardGraph,
            List<AdjEdge>[] reverseGraph,
            List<Integer> explored) {

        int n = forwardGraph.length;
        if (source == target) return 0;

        // 前向和后向的距离、前驱、已访问集合
        int[] fDist = new int[n];
        int[] rDist = new int[n];
        int[] fPrev = new int[n];
        int[] rPrev = new int[n];
        Arrays.fill(fDist, Integer.MAX_VALUE);
        Arrays.fill(rDist, Integer.MAX_VALUE);
        Arrays.fill(fPrev, -1);
        Arrays.fill(rPrev, -1);
        fDist[source] = 0;
        rDist[target] = 0;

        boolean[] fSettled = new boolean[n];
        boolean[] rSettled = new boolean[n];

        PriorityQueue<Pair> fPq = new PriorityQueue<>((a, b) -> a.distance - b.distance);
        PriorityQueue<Pair> rPq = new PriorityQueue<>((a, b) -> a.distance - b.distance);
        fPq.offer(new Pair(source, 0));
        rPq.offer(new Pair(target, 0));

        int best = Integer.MAX_VALUE;
        int meetingVertex = -1;

        while (!fPq.isEmpty() && !rPq.isEmpty()) {
            // 前向搜索一步
            if (!fPq.isEmpty()) {
                Pair fCur = fPq.poll();
                int u = fCur.vertex;
                if (fSettled[u]) continue;
                fSettled[u] = true;
                explored.add(u);

                // 如果当前顶点已在后向搜索中被 settle
                if (rSettled[u]) {
                    if (fDist[u] + rDist[u] < best) {
                        best = fDist[u] + rDist[u];
                        meetingVertex = u;
                    }
                }

                for (AdjEdge e : forwardGraph[u]) {
                    int v = e.to;
                    if (!fSettled[v] && fDist[u] + e.weight < fDist[v]) {
                        fDist[v] = fDist[u] + e.weight;
                        fPrev[v] = u;
                        fPq.offer(new Pair(v, fDist[v]));
                    }
                }

                // 提前终止条件：当前最小距离已经 >= best
                if (fPq.peek() != null && rPq.peek() != null
                        && fPq.peek().distance + rPq.peek().distance >= best) {
                    break;
                }
            }

            // 后向搜索一步
            if (!rPq.isEmpty()) {
                Pair rCur = rPq.poll();
                int u = rCur.vertex;
                if (rSettled[u]) continue;
                rSettled[u] = true;
                explored.add(u);

                if (fSettled[u]) {
                    if (fDist[u] + rDist[u] < best) {
                        best = fDist[u] + rDist[u];
                        meetingVertex = u;
                    }
                }

                for (AdjEdge e : reverseGraph[u]) {
                    int v = e.to;
                    if (!rSettled[v] && rDist[u] + e.weight < rDist[v]) {
                        rDist[v] = rDist[u] + e.weight;
                        rPrev[v] = u;
                        rPq.offer(new Pair(v, rDist[v]));
                    }
                }

                if (fPq.peek() != null && rPq.peek() != null
                        && fPq.peek().distance + rPq.peek().distance >= best) {
                    break;
                }
            }
        }

        return best == Integer.MAX_VALUE ? Integer.MAX_VALUE : best;
    }

    // ============================================================
    //  3. DAG 最短路径（拓扑排序 + DP）
    // ============================================================

    /**
     * 使用拓扑排序 + DP 求 DAG 中的单源最短路径
     * 时间复杂度 O(V+E)，是所有最短路径算法中最快的
     */
    public static int[] shortestPathInDAG(int source, List<AdjEdge>[] graph, int[] prev) {
        int n = graph.length;
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[source] = 0;

        // Kahn 算法拓扑排序
        List<Integer> topo = topologicalSort(graph);
        if (topo == null) {
            System.out.println("  图不是 DAG，包含环！");
            return null;
        }

        // 按拓扑序松弛
        for (int u : topo) {
            if (dist[u] != Integer.MAX_VALUE) {
                for (AdjEdge e : graph[u]) {
                    if (dist[u] + e.weight < dist[e.to]) {
                        dist[e.to] = dist[u] + e.weight;
                        prev[e.to] = u;
                    }
                }
            }
        }
        return dist;
    }

    /** Kahn 算法拓扑排序 */
    private static List<Integer> topologicalSort(List<AdjEdge>[] graph) {
        int n = graph.length;
        int[] indegree = new int[n];
        for (int u = 0; u < n; u++) {
            for (AdjEdge e : graph[u]) {
                indegree[e.to]++;
            }
        }

        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < n; i++) {
            if (indegree[i] == 0) queue.offer(i);
        }

        List<Integer> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            result.add(u);
            for (AdjEdge e : graph[u]) {
                if (--indegree[e.to] == 0) {
                    queue.offer(e.to);
                }
            }
        }

        if (result.size() != n) return null;  // 有环
        return result;
    }

    // ============================================================
    //  4. A* 搜索（网格图 + 曼哈顿距离）
    // ============================================================

    static class GridNode {
        int x, y, g, f;
        GridNode parent;
        GridNode(int x, int y) { this.x = x; this.y = y; }
    }

    // 四个移动方向：上、下、左、右
    private static final int[][] DIRS = {{-1,0}, {1,0}, {0,-1}, {0,1}};

    /**
     * A* 搜索
     *
     * @param grid    网格，0=可通行，1=障碍物
     * @param sx,sy   起点坐标
     * @param tx,ty   目标坐标
     * @param explored 记录探索过的节点数（输出参数）
     * @return 路径（从起点到终点），无路径则返回空列表
     */
    public static List<int[]> aStarSearch(
            int[][] grid, int sx, int sy, int tx, int ty,
            int[] explored) {

        int rows = grid.length, cols = grid[0].length;

        boolean[][] closed = new boolean[rows][cols];
        int[][] gScore = new int[rows][cols];
        for (int i = 0; i < rows; i++) Arrays.fill(gScore[i], Integer.MAX_VALUE);

        PriorityQueue<GridNode> open = new PriorityQueue<>(
                (a, b) -> a.f - b.f);

        GridNode start = new GridNode(sx, sy);
        start.g = 0;
        start.f = manhattan(sx, sy, tx, ty);
        open.offer(start);
        gScore[sx][sy] = 0;

        int exploredCount = 0;

        while (!open.isEmpty()) {
            GridNode cur = open.poll();
            int cx = cur.x, cy = cur.y;

            if (closed[cx][cy]) continue;
            closed[cx][cy] = true;
            exploredCount++;

            // 到达目标
            if (cx == tx && cy == ty) {
                explored[0] = exploredCount;
                return reconstructPath(cur);
            }

            for (int[] d : DIRS) {
                int nx = cx + d[0], ny = cy + d[1];
                if (nx < 0 || nx >= rows || ny < 0 || ny >= cols) continue;
                if (grid[nx][ny] == 1) continue;  // 障碍物
                if (closed[nx][ny]) continue;

                int newG = cur.g + 1;  // 网格中每一步代价为 1
                if (newG < gScore[nx][ny]) {
                    gScore[nx][ny] = newG;
                    GridNode next = new GridNode(nx, ny);
                    next.g = newG;
                    next.f = newG + manhattan(nx, ny, tx, ty);
                    next.parent = cur;
                    open.offer(next);
                }
            }
        }

        explored[0] = exploredCount;
        return Collections.emptyList();  // 无路径
    }

    /** 曼哈顿距离启发式 */
    private static int manhattan(int x1, int y1, int x2, int y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    /** 从 GridNode 父链重建路径 */
    private static List<int[]> reconstructPath(GridNode node) {
        List<int[]> path = new ArrayList<>();
        while (node != null) {
            path.add(new int[]{node.x, node.y});
            node = node.parent;
        }
        Collections.reverse(path);
        return path;
    }

    // ============================================================
    //  5. 路径重建工具
    // ============================================================

    public static List<Integer> reconstructPath(int target, int[] prev) {
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != -1; v = prev[v]) {
            path.add(v);
        }
        Collections.reverse(path);
        return path;
    }

    // ============================================================
    //  main 测试
    // ============================================================

    @SuppressWarnings("unchecked")
    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  最短路径变形算法演示");
        System.out.println("================================================\n");

        // ========== 1. 双向 Dijkstra ==========
        System.out.println("----- 1. 双向 Dijkstra -----");

        // 构建一个 8 个顶点的图
        //     0 → 1 (2),  0 → 2 (4)
        //     1 → 2 (1),  1 → 3 (7)
        //     2 → 3 (3),  2 → 4 (5)
        //     3 → 4 (1),  3 → 5 (6)
        //     4 → 5 (2),  4 → 6 (3)
        //     5 → 6 (1),  5 → 7 (8)
        //     6 → 7 (2)
        int V = 8;
        List<AdjEdge>[] fGraph = new ArrayList[V];
        List<AdjEdge>[] rGraph = new ArrayList[V];
        for (int i = 0; i < V; i++) {
            fGraph[i] = new ArrayList<>();
            rGraph[i] = new ArrayList<>();
        }

        // 前向边
        addBiDirEdge(fGraph, rGraph, 0, 1, 2);
        addBiDirEdge(fGraph, rGraph, 0, 2, 4);
        addBiDirEdge(fGraph, rGraph, 1, 2, 1);
        addBiDirEdge(fGraph, rGraph, 1, 3, 7);
        addBiDirEdge(fGraph, rGraph, 2, 3, 3);
        addBiDirEdge(fGraph, rGraph, 2, 4, 5);
        addBiDirEdge(fGraph, rGraph, 3, 4, 1);
        addBiDirEdge(fGraph, rGraph, 3, 5, 6);
        addBiDirEdge(fGraph, rGraph, 4, 5, 2);
        addBiDirEdge(fGraph, rGraph, 4, 6, 3);
        addBiDirEdge(fGraph, rGraph, 5, 6, 1);
        addBiDirEdge(fGraph, rGraph, 5, 7, 8);
        addBiDirEdge(fGraph, rGraph, 6, 7, 2);

        int src = 0, tgt = 7;
        List<Integer> biExplored = new ArrayList<>();
        int biDist = bidirectionalDijkstra(src, tgt, fGraph, rGraph, biExplored);

        System.out.println("  图: 0 → 1 → 2 → ... → 7 (链状结构)");
        System.out.println("  起点=" + src + ", 终点=" + tgt);
        System.out.println("  最短距离: " + biDist);
        System.out.println("  探索顶点数: " + biExplored.size());
        System.out.println("  (对比：单向 Dijkstra 探索数 ≈ " + V + ")");
        System.out.println();

        // ========== 2. DAG 最短路径 ==========
        System.out.println("----- 2. DAG 最短路径（拓扑排序 + DP）-----");

        // 构建 DAG:
        //     0 → 1 (3),  0 → 2 (6)
        //     1 → 2 (2),  1 → 3 (4)
        //     2 → 3 (1),  2 → 4 (5)
        //     3 → 4 (2)
        int Vd = 5;
        List<AdjEdge>[] dagGraph = new ArrayList[Vd];
        for (int i = 0; i < Vd; i++) dagGraph[i] = new ArrayList<>();
        dagGraph[0].add(new AdjEdge(1, 3));
        dagGraph[0].add(new AdjEdge(2, 6));
        dagGraph[1].add(new AdjEdge(2, 2));
        dagGraph[1].add(new AdjEdge(3, 4));
        dagGraph[2].add(new AdjEdge(3, 1));
        dagGraph[2].add(new AdjEdge(4, 5));
        dagGraph[3].add(new AdjEdge(4, 2));

        int[] dagPrev = new int[Vd];
        int[] dagDist = shortestPathInDAG(0, dagGraph, dagPrev);

        if (dagDist != null) {
            System.out.println("  DAG 图: 0→1, 0→2, 1→2, 1→3, 2→3, 2→4, 3→4");
            System.out.println("  从 0 出发的最短距离:");
            for (int v = 0; v < Vd; v++) {
                System.out.println("    到 " + v + ": " + dagDist[v]
                        + "  路径: " + reconstructPath(v, dagPrev));
            }
            System.out.println("  时间复杂度: O(V+E)，所有算法中最快");
        }
        System.out.println();

        // ========== 3. A* 搜索（网格图） ==========
        System.out.println("----- 3. A* 搜索（网格图 + 曼哈顿距离）-----");

        // 构建 10×10 网格
        int rows = 10, cols = 10;
        int[][] grid = new int[rows][cols];
        // 添加一些障碍物（1 表示障碍）
        grid[3][2] = grid[3][3] = grid[3][4] = 1;
        grid[4][4] = grid[5][4] = grid[6][4] = 1;
        grid[6][2] = grid[6][3] = grid[6][5] = 1;

        System.out.println("  Grid 10×10, 障碍物标记为 █:");
        printGrid(grid, rows, cols);

        int sx = 0, sy = 0, tx = 9, ty = 9;
        int[] exploredCount = new int[1];
        List<int[]> path = aStarSearch(grid, sx, sy, tx, ty, exploredCount);

        if (!path.isEmpty()) {
            System.out.println("  起点: (" + sx + "," + sy + "), 终点: (" + tx + "," + ty + ")");
            System.out.println("  路径长度: " + (path.size() - 1) + " 步");
            System.out.println("  探索节点数: " + exploredCount[0]);
            System.out.println("  路径: ");
            printPathOnGrid(grid, rows, cols, path);
            // 打印路径坐标
            StringBuilder sb = new StringBuilder("  ");
            for (int i = 0; i < path.size(); i++) {
                int[] p = path.get(i);
                sb.append("(").append(p[0]).append(",").append(p[1]).append(")");
                if (i < path.size() - 1) sb.append(" → ");
            }
            System.out.println(sb);
        } else {
            System.out.println("  无路径可达！");
        }
        System.out.println();

        System.out.println("================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }

    // ============================================================
    //  辅助方法
    // ============================================================

    private static void addBiDirEdge(List<AdjEdge>[] fGraph,
                                      List<AdjEdge>[] rGraph,
                                      int from, int to, int w) {
        fGraph[from].add(new AdjEdge(to, w));
        rGraph[to].add(new AdjEdge(from, w));
    }

    private static void printGrid(int[][] grid, int rows, int cols) {
        System.out.print("   ");
        for (int j = 0; j < cols; j++) System.out.print(" " + j);
        System.out.println();
        for (int i = 0; i < rows; i++) {
            System.out.print("  " + i + " ");
            for (int j = 0; j < cols; j++) {
                System.out.print(grid[i][j] == 1 ? " █" : " .");
            }
            System.out.println();
        }
    }

    private static void printPathOnGrid(int[][] grid, int rows, int cols,
                                         List<int[]> path) {
        Set<String> pathSet = new HashSet<>();
        for (int[] p : path) pathSet.add(p[0] + "," + p[1]);

        System.out.print("   ");
        for (int j = 0; j < cols; j++) System.out.print(" " + j);
        System.out.println();
        for (int i = 0; i < rows; i++) {
            System.out.print("  " + i + " ");
            for (int j = 0; j < cols; j++) {
                if (grid[i][j] == 1) {
                    System.out.print(" █");
                } else if (pathSet.contains(i + "," + j)) {
                    System.out.print(" ★");
                } else {
                    System.out.print(" .");
                }
            }
            System.out.println();
        }
    }
}