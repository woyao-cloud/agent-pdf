# 第6章 图算法：从路径搜索到图嵌入的完整实践

图数据库的核心价值不仅在于数据存储与查询，更在于**直接在存储层执行图算法**，避免传统方案中"从数据库导出数据→在应用层计算"的巨大开销。本章从经典路径搜索出发，逐步深入到中心性分析、社区发现、图嵌入，最后落地到推荐系统和反欺诈两大工业场景，每节均提供可直接运行的 Java 代码。

---

## 6.1 路径搜索算法

### 6.1.1 解决的问题

在社交网络、地图导航、网络路由等场景中，核心需求是**在图中找到两个节点之间的最优路径**。"最优"的定义因场景而异：无权图中是边数最少，加权图中是权重总和最小，导航场景中还需考虑启发式信息。

### 6.1.2 核心原理

**BFS（广度优先搜索）** 在无权图中保证找到最短路径，时间复杂度 O(V+E)。**DFS（深度优先搜索）** 适用于路径存在性判断和拓扑排序，空间复杂度 O(V)。

**Dijkstra** 使用优先队列（最小堆）维护当前已知最短距离，每次取出距离最小的节点进行松弛操作。使用斐波那契堆可实现 O(E+V log V)，工业实现通常用二叉堆 O((V+E) log V)。

**A\*** 在 Dijkstra 基础上引入启发式函数 h(n)，估计从当前节点到目标节点的代价。总估价函数 f(n)=g(n)+h(n)。当 h(n) 满足可采纳性（admissible，即不高估实际代价）时，A\* 保证找到最优解。

**双向 BFS** 同时从起点和终点执行 BFS，当两个搜索前沿相遇时停止。在分支因子较大的图中，可将搜索空间从 b^d 降低到约 2b^(d/2)。

### 6.1.3 代码实现

```java
import java.util.*;

public class PathSearchAlgorithms {

    static class Edge {
        int to, weight;
        Edge(int to, int weight) { this.to = to; this.weight = weight; }
    }

    // ========== 1. BFS 最短路径（无权图） ==========
    public static List<Integer> bfsShortestPath(List<List<Integer>> graph, int start, int target) {
        int n = graph.size();
        int[] prev = new int[n];
        Arrays.fill(prev, -1);
        Queue<Integer> q = new ArrayDeque<>();
        q.offer(start);
        prev[start] = start;
        while (!q.isEmpty()) {
            int cur = q.poll();
            if (cur == target) break;
            for (int nb : graph.get(cur)) {
                if (prev[nb] == -1) {
                    prev[nb] = cur;
                    q.offer(nb);
                }
            }
        }
        if (prev[target] == -1) return Collections.emptyList();
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != start; v = prev[v]) path.add(v);
        path.add(start);
        Collections.reverse(path);
        return path;
    }

    // ========== 2. Dijkstra（优先队列优化） ==========
    public static int[] dijkstra(List<List<Edge>> graph, int start) {
        int n = graph.size();
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[start] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
        pq.offer(new int[]{start, 0});
        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int u = cur[0], d = cur[1];
            if (d > dist[u]) continue;
            for (Edge e : graph.get(u)) {
                int nd = d + e.weight;
                if (nd < dist[e.to]) {
                    dist[e.to] = nd;
                    pq.offer(new int[]{e.to, nd});
                }
            }
        }
        return dist;
    }

    // ========== 3. A* 搜索 ==========
    public static List<Integer> aStar(List<List<Edge>> graph, int start, int target, Heuristic heuristic) {
        int n = graph.size();
        int[] gScore = new int[n];
        Arrays.fill(gScore, Integer.MAX_VALUE);
        gScore[start] = 0;
        int[] prev = new int[n];
        Arrays.fill(prev, -1);
        PriorityQueue<Integer> open = new PriorityQueue<>(Comparator.comparingInt(
            v -> gScore[v] + heuristic.estimate(v, target)));
        open.offer(start);
        prev[start] = start;
        while (!open.isEmpty()) {
            int cur = open.poll();
            if (cur == target) break;
            for (Edge e : graph.get(cur)) {
                int tentativeG = gScore[cur] + e.weight;
                if (tentativeG < gScore[e.to]) {
                    gScore[e.to] = tentativeG;
                    prev[e.to] = cur;
                    open.offer(e.to);
                }
            }
        }
        if (prev[target] == -1) return Collections.emptyList();
        List<Integer> path = new ArrayList<>();
        for (int v = target; v != start; v = prev[v]) path.add(v);
        path.add(start);
        Collections.reverse(path);
        return path;
    }

    @FunctionalInterface
    interface Heuristic { int estimate(int node, int target); }

    // ========== 4. 双向 BFS ==========
    public static List<Integer> bidirectionalBFS(List<List<Integer>> graph, int start, int target) {
        if (start == target) return List.of(start);
        int n = graph.size();
        int[] prevFromStart = new int[n], prevFromTarget = new int[n];
        Arrays.fill(prevFromStart, -1);
        Arrays.fill(prevFromTarget, -1);
        Queue<Integer> qStart = new ArrayDeque<>(), qTarget = new ArrayDeque<>();
        qStart.offer(start); prevFromStart[start] = start;
        qTarget.offer(target); prevFromTarget[target] = target;
        int meet = -1;
        while (!qStart.isEmpty() && !qTarget.isEmpty()) {
            meet = expandLayer(graph, qStart, prevFromStart, prevFromTarget);
            if (meet != -1) break;
            meet = expandLayer(graph, qTarget, prevFromTarget, prevFromStart);
            if (meet != -1) break;
        }
        if (meet == -1) return Collections.emptyList();
        List<Integer> path = new ArrayList<>();
        for (int v = meet; v != start; v = prevFromStart[v]) path.add(v);
        path.add(start);
        Collections.reverse(path);
        for (int v = prevFromTarget[meet]; v != target; v = prevFromTarget[v]) path.add(v);
        path.add(target);
        return path;
    }

    private static int expandLayer(List<List<Integer>> graph, Queue<Integer> queue,
                                    int[] curPrev, int[] otherPrev) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
            int u = queue.poll();
            for (int v : graph.get(u)) {
                if (curPrev[v] != -1) continue;
                curPrev[v] = u;
                if (otherPrev[v] != -1) return v;
                queue.offer(v);
            }
        }
        return -1;
    }
}
```

### 6.1.4 使用场景

| 算法 | 典型场景 | 图类型 |
|------|----------|--------|
| BFS | 社交网络"好友推荐"最短距离 | 无权图 |
| Dijkstra | 地图导航、网络路由、物流路径规划 | 加权图 |
| A\* | 游戏寻路、机器人路径规划 | 加权图 + 启发式 |
| 双向 BFS | 六度分隔理论验证、大规模社交图 | 无权图 |

### 6.1.5 潜在风险与注意事项

- **Dijkstra 无法处理负权边**：此时应使用 Bellman-Ford 或 SPFA。
- **A\* 的启发式函数设计**：h(n) 过小退化为 Dijkstra，过大则可能找不到最优解。曼哈顿距离和欧几里得距离是常用选择。
- **双向 BFS 的相遇检测**：需要同时维护两个 visited 集合，内存消耗翻倍。
- **优先队列的重复入队**：Dijkstra 中同一节点可能被多次入队，需通过 `d > dist[u]` 跳过过期条目。

### 6.1.6 本章小结

路径搜索是图算法的基础能力。BFS/DFS 解决连通性问题，Dijkstra 解决加权最短路径，A\* 通过启发式信息大幅剪枝，双向 BFS 在社交图中将搜索空间降低一个数量级。实际图数据库中（如 Neo4j 的 `shortestPath` 函数），这些算法经过 C++ 级优化后可在毫秒级返回结果。

---

## 6.2 中心性算法

### 6.2.1 解决的问题

"图中哪些节点最重要？"——中心性算法量化节点在拓扑结构中的影响力，广泛应用于社交网络意见领袖识别、关键基础设施保护、生物网络关键基因发现。

### 6.2.2 核心原理

**PageRank** 由 Google 提出，核心思想：一个节点的重要性由指向它的节点数量和质量共同决定。迭代公式：

```
PR(A) = (1-d) + d × Σ(PR(Ti) / C(Ti))
```

其中 d 为阻尼因子（通常 0.85），C(Ti) 为节点 Ti 的出度。迭代至收敛（各节点 PR 值变化小于阈值）。

**Degree Centrality** 是最简单的中心性度量：`CD(v) = deg(v) / (N-1)`。在有向图中分为入度中心性和出度中心性。

**Betweenness Centrality（Brandes 算法）** 衡量节点作为"桥梁"的重要性：`CB(v) = Σ(s≠v≠t) σst(v) / σst`，其中 σst 是 s 到 t 的最短路径总数，σst(v) 是经过 v 的数目。Brandes 算法通过 BFS（无权）或 Dijkstra（加权）在 O(VE) 或 O(VE + V² log V) 时间内计算。

**Closeness Centrality** 衡量节点到所有其他节点的平均距离：`CC(v) = (N-1) / Σ d(v,u)`，其中 d(v,u) 是最短路径长度。

### 6.2.3 代码实现

```java
import java.util.*;

public class CentralityAlgorithms {

    // ========== 1. PageRank ==========
    public static double[] pageRank(List<List<Integer>> graph, double damping, int maxIter, double tol) {
        int n = graph.size();
        double[] rank = new double[n];
        Arrays.fill(rank, 1.0 / n);
        int[] outDeg = new int[n];
        for (int u = 0; u < n; u++) outDeg[u] = graph.get(u).size();
        for (int iter = 0; iter < maxIter; iter++) {
            double[] newRank = new double[n];
            double danglingSum = 0;
            for (int u = 0; u < n; u++) {
                if (outDeg[u] == 0) { danglingSum += rank[u]; continue; }
                double contrib = rank[u] / outDeg[u];
                for (int v : graph.get(u)) newRank[v] += contrib;
            }
            double base = (1 - damping) / n + damping * danglingSum / n;
            double diff = 0;
            for (int v = 0; v < n; v++) {
                newRank[v] = base + damping * newRank[v];
                diff += Math.abs(newRank[v] - rank[v]);
            }
            rank = newRank;
            if (diff < tol) break;
        }
        return rank;
    }

    // ========== 2. Degree Centrality ==========
    public static double[] degreeCentrality(List<List<Integer>> graph) {
        int n = graph.size();
        double[] dc = new double[n];
        for (int i = 0; i < n; i++) dc[i] = (double) graph.get(i).size() / (n - 1);
        return dc;
    }

    // ========== 3. Betweenness Centrality (Brandes) ==========
    public static double[] betweennessCentrality(List<List<Integer>> graph) {
        int n = graph.size();
        double[] bc = new double[n];
        for (int s = 0; s < n; s++) {
            Deque<Integer> stack = new ArrayDeque<>();
            Queue<Integer> q = new ArrayDeque<>();
            int[] dist = new int[n];
            Arrays.fill(dist, -1);
            int[] sigma = new int[n];
            double[] delta = new double[n];
            List<List<Integer>> pred = new ArrayList<>();
            for (int i = 0; i < n; i++) pred.add(new ArrayList<>());
            dist[s] = 0; sigma[s] = 1; q.offer(s);
            while (!q.isEmpty()) {
                int v = q.poll();
                stack.push(v);
                for (int w : graph.get(v)) {
                    if (dist[w] < 0) {
                        dist[w] = dist[v] + 1;
                        q.offer(w);
                    }
                    if (dist[w] == dist[v] + 1) {
                        sigma[w] += sigma[v];
                        pred.get(w).add(v);
                    }
                }
            }
            while (!stack.isEmpty()) {
                int w = stack.pop();
                for (int v : pred.get(w)) delta[v] += (double) sigma[v] / sigma[w] * (1 + delta[w]);
                if (w != s) bc[w] += delta[w];
            }
        }
        return bc;
    }

    // ========== 4. Closeness Centrality ==========
    public static double[] closenessCentrality(List<List<Integer>> graph) {
        int n = graph.size();
        double[] cc = new double[n];
        for (int s = 0; s < n; s++) {
            int[] dist = new int[n];
            Arrays.fill(dist, -1);
            Queue<Integer> q = new ArrayDeque<>();
            dist[s] = 0; q.offer(s);
            int totalDist = 0, reachable = 0;
            while (!q.isEmpty()) {
                int v = q.poll();
                for (int w : graph.get(v)) {
                    if (dist[w] == -1) {
                        dist[w] = dist[v] + 1;
                        totalDist += dist[w];
                        reachable++;
                        q.offer(w);
                    }
                }
            }
            cc[s] = reachable > 0 ? (double) reachable / totalDist : 0;
        }
        return cc;
    }
}
```

### 6.2.4 使用场景

| 算法 | 典型应用 | 说明 |
|------|----------|------|
| PageRank | 搜索引擎排名、社交影响力评分、论文引用排序 | 全局迭代，收敛稳定 |
| Degree Centrality | Twitter 粉丝数、微博关注数 | 计算简单，实时性高 |
| Betweenness | 关键基础设施识别、网络攻击靶点分析 | 计算代价高，适合离线 |
| Closeness | 物流中心选址、信息传播源定位 | 对图结构敏感 |

### 6.2.5 潜在风险与注意事项

- **PageRank 的收敛性**：阻尼因子 d 越接近 1，收敛越慢。实际中 0.85 是经验值，通常 30-50 次迭代即可收敛。
- **Brandes 算法内存开销**：需要为每个源节点维护前驱列表，大规模图（>10⁶ 节点）建议使用近似算法或采样。
- **Closeness 对不连通图的处理**：传统定义在不连通图上失效，需使用 Wasserman-Faust 改进版本。
- **中心性结果的归一化**：不同规模图之间比较时，必须归一化到 [0,1] 区间。

### 6.2.6 本章小结

中心性算法从不同维度刻画节点重要性：PageRank 关注"被引用质量"，Degree 关注"直接影响力"，Betweenness 关注"桥梁作用"，Closeness 关注"信息可达性"。实际应用中常组合使用——例如在 Neo4j 的 GDS 库中，`gds.pageRank.stream()` 和 `gds.betweenness.stream()` 配合使用可全面评估节点价值。

---

## 6.3 社区发现算法

### 6.3.1 解决的问题

复杂网络中节点往往呈现"物以类聚"的社区结构。社区发现的目标是**将图划分为若干子图，使得子图内部连接紧密、子图之间连接稀疏**。应用包括社交圈识别、蛋白质功能模块发现、商品推荐聚类。

### 6.3.2 核心原理

**Louvain 算法** 是基于模块度优化的层次化算法。模块度 Q 衡量社区划分质量：

```
Q = 1/(2m) × Σ[Aij - ki·kj/(2m)] × δ(ci, cj)
```

其中 m 为边数，ki 为节点 i 的度，Aij 为邻接矩阵，δ(ci,cj) 指示节点是否在同一社区。

Louvain 分两阶段迭代：**阶段一**，遍历每个节点，尝试将其移动到邻居社区中使模块度增量最大的那个；**阶段二**，将每个社区折叠为超节点，构建新图。重复至模块度不再增长。时间复杂度 O(m log n)。

**Label Propagation Algorithm (LPA)** 每个节点初始分配唯一标签，每轮迭代中节点采用其邻居中出现频率最高的标签。传播过程接近线性 O(m)，但结果不稳定（随机性导致多次运行结果不同）。

**Triangle Counting** 统计图中三角形（三个节点两两相连）的数量。**边迭代器**方法：对每条边 (u,v)，求 u 和 v 的共同邻居数。**节点迭代器**方法：对每个节点，遍历其邻居对，检查邻居对之间是否有边。边迭代器在稀疏图中更优，节点迭代器在密集图中更优。

### 6.3.3 代码实现

```java
import java.util.*;

public class CommunityDetection {

    // ========== 1. Louvain 算法 ==========
    public static int[] louvain(List<Set<Integer>> graph) {
        int n = graph.size();
        int[] community = new int[n];
        for (int i = 0; i < n; i++) community[i] = i;
        double totalWeight = 0;
        double[] nodeWeight = new double[n];
        for (int u = 0; u < n; u++) {
            nodeWeight[u] = graph.get(u).stream().mapToInt(v -> 1).sum();
            totalWeight += nodeWeight[u];
        }
        totalWeight /= 2;
        boolean improved = true;
        while (improved) {
            improved = false;
            for (int u = 0; u < n; u++) {
                int curComm = community[u];
                Map<Integer, Double> commEdgeWeight = new HashMap<>();
                for (int v : graph.get(u)) {
                    int vc = community[v];
                    commEdgeWeight.merge(vc, 1.0, Double::sum);
                }
                commEdgeWeight.remove(curComm);
                if (commEdgeWeight.isEmpty()) continue;
                double ki = nodeWeight[u];
                double kiIn = 0;
                for (int v : graph.get(u)) {
                    if (community[v] == curComm) kiIn += 1;
                }
                double sumTotCur = 0;
                for (int v = 0; v < n; v++) {
                    if (community[v] == curComm) sumTotCur += nodeWeight[v];
                }
                double bestDelta = 0;
                int bestComm = curComm;
                for (Map.Entry<Integer, Double> e : commEdgeWeight.entrySet()) {
                    int c = e.getKey();
                    double sumTotC = 0;
                    for (int v = 0; v < n; v++) {
                        if (community[v] == c) sumTotC += nodeWeight[v];
                    }
                    double delta = 2 * e.getValue() - sumTotC * ki / totalWeight
                                 - (2 * kiIn - sumTotCur * ki / totalWeight);
                    if (delta > bestDelta) { bestDelta = delta; bestComm = c; }
                }
                if (bestComm != curComm) {
                    community[u] = bestComm;
                    improved = true;
                }
            }
        }
        return community;
    }

    // ========== 2. Label Propagation ==========
    public static int[] labelPropagation(List<List<Integer>> graph, int maxIter) {
        int n = graph.size();
        int[] label = new int[n];
        for (int i = 0; i < n; i++) label[i] = i;
        Random rnd = new Random(42);
        for (int iter = 0; iter < maxIter; iter++) {
            List<Integer> order = new ArrayList<>();
            for (int i = 0; i < n; i++) order.add(i);
            Collections.shuffle(order, rnd);
            int changes = 0;
            for (int u : order) {
                Map<Integer, Integer> freq = new HashMap<>();
                for (int v : graph.get(u)) freq.merge(label[v], 1, Integer::sum);
                int bestLabel = label[u];
                int bestCount = 0;
                for (Map.Entry<Integer, Integer> e : freq.entrySet()) {
                    if (e.getValue() > bestCount) {
                        bestCount = e.getValue();
                        bestLabel = e.getKey();
                    }
                }
                if (bestLabel != label[u]) { label[u] = bestLabel; changes++; }
            }
            if (changes == 0) break;
        }
        return label;
    }

    // ========== 3. Triangle Counting (边迭代器) ==========
    public static long countTrianglesEdgeIterator(List<Set<Integer>> graph) {
        int n = graph.size();
        long count = 0;
        for (int u = 0; u < n; u++) {
            for (int v : graph.get(u)) {
                if (v > u) {
                    for (int w : graph.get(u)) {
                        if (w > v && graph.get(v).contains(w)) count++;
                    }
                }
            }
        }
        return count;
    }

    // ========== 4. Triangle Counting (节点迭代器) ==========
    public static long countTrianglesNodeIterator(List<Set<Integer>> graph) {
        int n = graph.size();
        long count = 0;
        for (int u = 0; u < n; u++) {
            List<Integer> neighbors = new ArrayList<>(graph.get(u));
            for (int i = 0; i < neighbors.size(); i++) {
                for (int j = i + 1; j < neighbors.size(); j++) {
                    int v = neighbors.get(i), w = neighbors.get(j);
                    if (graph.get(v).contains(w)) count++;
                }
            }
        }
        return count / 3;
    }
}
```

### 6.3.4 使用场景

| 算法 | 典型应用 | 特点 |
|------|----------|------|
| Louvain | 社交网络兴趣圈、基因调控网络模块 | 层次化、质量高、可扩展 |
| LPA | 大规模图快速聚类、实时流式社区检测 | 近线性、结果不稳定 |
| Triangle Counting | 社交网络聚类系数、网络稠密度评估 | 基础统计量，可组合 |

### 6.3.5 潜在风险与注意事项

- **Louvain 的分辨率限制**：可能漏掉小社区。可使用 Constant Potts Model (CPM) 替代模块度优化。
- **LPA 的随机性**：多次运行结果差异大，建议集成运行（ensemble）取共识。
- **三角形计数的性能瓶颈**：边迭代器在稠密图中退化为 O(E·d_max)，节点迭代器在稀疏图中更优。工业实现通常使用邻接矩阵的位运算加速。
- **社区结果的评估**：无标签数据时，可使用模块度 Q 值或 NMI（归一化互信息）评估质量。

### 6.3.6 本章小结

Louvain 是当前最主流的社区发现算法，在 Neo4j GDS、NetworkX 中均有高效实现。LPA 适合超大规模图的快速标注。Triangle Counting 作为基础算子，是聚类系数、局部密度等高级指标的计算基础。实际工程中，社区发现常作为特征工程步骤，为下游推荐或异常检测提供输入。

---

## 6.4 图嵌入算法

### 6.4.1 解决的问题

图结构数据是非欧几里得数据，无法直接作为机器学习模型的输入。图嵌入的目标是**将图中的每个节点映射到低维稠密向量空间**，使得向量空间中的距离/相似度反映原始图中的结构关系。

### 6.4.2 核心原理

**DeepWalk** 首次将 Word2Vec 的思想引入图嵌入。通过在图上执行随机游走生成节点序列，将序列视为"句子"输入 Skip-Gram 模型，学习节点向量表示。随机游走本质上是均匀的、无偏的。

**Node2Vec** 在 DeepWalk 基础上引入**有偏随机游走**，通过两个参数 p（Return parameter）和 q（In-out parameter）控制游走策略：

- p 控制重新访问刚离开节点的概率（p 小 → BFS-like，探索局部）
- q 控制向外探索的概率（q 小 → DFS-like，探索全局）

通过调节 p 和 q，Node2Vec 可以平滑地在同质性（homophily）和结构等价性（structural equivalence）之间切换。

**GraphSAGE** 提出**归纳学习（inductive learning）** 框架，不直接学习节点嵌入，而是学习**聚合邻居信息的函数**。对于新节点，只需聚合其邻居特征即可生成嵌入，无需重新训练。聚合函数包括 Mean、LSTM、Pooling 和 GCN 聚合器。

### 6.4.3 伪代码实现

```python
# ========== Node2Vec 核心逻辑 ==========
import numpy as np
from gensim.models import Word2Vec

class Node2Vec:
    def __init__(self, graph, p=1.0, q=1.0, walk_length=80, num_walks=10):
        self.graph = graph          # adjacency list
        self.p = p
        self.q = q
        self.walk_length = walk_length
        self.num_walks = num_walks
        self._precompute_transition_probs()

    def _precompute_transition_probs(self):
        """预计算别名采样表（Alias Table），加速有偏游走"""
        self.alias_nodes = {}       # 节点 → (alias, prob)
        for node in self.graph:
            unnormalized = [1.0] * len(self.graph[node])
            norm = sum(unnormalized)
            self.alias_nodes[node] = self._alias_setup(
                [u / norm for u in unnormalized])

    def _alias_setup(self, probs):
        """Alias Table 构建（O(n)）"""
        n = len(probs)
        alias = [0] * n
        prob = [p * n for p in probs]
        small, large = [], []
        for i, p in enumerate(prob):
            (small if p < 1.0 else large).append(i)
        while small and large:
            l = small.pop()
            g = large.pop()
            alias[l] = g
            prob[g] = prob[g] - (1.0 - prob[l])
            if prob[g] < 1.0: small.append(g)
            else: large.append(g)
        return alias, prob

    def _biased_walk(self, start):
        walk = [start]
        prev = None
        for _ in range(self.walk_length - 1):
            cur = walk[-1]
            neighbors = self.graph[cur]
            if not neighbors:
                walk.append(cur)
                continue
            if len(walk) == 1:
                t = np.random.choice(neighbors)
            else:
                prev = walk[-2]
                probs = []
                for nxt in neighbors:
                    if nxt == prev:
                        probs.append(1.0 / self.p)
                    elif self.graph[prev] is not None and nxt in self.graph[prev]:
                        probs.append(1.0)
                    else:
                        probs.append(1.0 / self.q)
                t = np.random.choice(neighbors, p=[p/sum(probs) for p in probs])
            walk.append(t)
        return [str(x) for x in walk]

    def fit(self, dimensions=128, window=10, workers=4):
        walks = []
        for _ in range(self.num_walks):
            nodes = list(self.graph.keys())
            np.random.shuffle(nodes)
            for node in nodes:
                walks.append(self._biased_walk(node))
        model = Word2Vec(sentences=walks, vector_size=dimensions,
                         window=window, min_count=0, sg=1, workers=workers)
        return {node: model.wv[str(node)] for node in self.graph}


# ========== GraphSAGE 核心逻辑 ==========
import torch
import torch.nn as nn
import torch.nn.functional as F

class MeanAggregator(nn.Module):
    def __init__(self, input_dim, output_dim):
        super().__init__()
        self.linear = nn.Linear(input_dim * 2, output_dim)

    def forward(self, node_feats, neighbor_feats):
        mean_neighbor = torch.mean(neighbor_feats, dim=1)
        combined = torch.cat([node_feats, mean_neighbor], dim=1)
        return F.relu(self.linear(combined))

class GraphSAGE(nn.Module):
    def __init__(self, in_dim, hidden_dim, out_dim, num_layers=2):
        super().__init__()
        self.aggregators = nn.ModuleList()
        dims = [in_dim] + [hidden_dim] * (num_layers - 1) + [out_dim]
        for i in range(num_layers):
            self.aggregators.append(MeanAggregator(dims[i], dims[i+1]))

    def forward(self, x, adj_lists):
        """x: node features, adj_lists: neighbor indices per node"""
        h = x
        for layer in self.aggregators:
            neighbor_embeds = []
            for neighbors in adj_lists:
                if len(neighbors) == 0:
                    neighbor_embeds.append(torch.zeros_like(h[:1]))
                else:
                    neighbor_embeds.append(torch.mean(h[neighbors], dim=0))
            h = layer(h, torch.stack(neighbor_embeds))
        return F.normalize(h, p=2, dim=1)
```

### 6.4.4 使用场景

| 算法 | 典型应用 | 特点 |
|------|----------|------|
| DeepWalk | 社交网络节点分类、链路预测 | 无偏游走，简单高效 |
| Node2Vec | 推荐系统、知识图谱补全 | p/q 可调，灵活控制 |
| GraphSAGE | 动态图、新节点快速推理 | 归纳学习，支持大规模 |

### 6.4.5 潜在风险与注意事项

- **随机游走长度与次数**：过短无法捕获全局结构，过长引入噪声。经验值 walk_length=80, num_walks=10。
- **Node2Vec 的 p/q 调参**：p < 1 强调局部社区（同质性），q < 1 强调结构角色（结构等价性）。可通过网格搜索 + 下游任务验证。
- **GraphSAGE 的邻居采样**：固定采样 K 个邻居（如 K=25），控制计算图大小。采样数过小丢失信息，过大导致 OOM。
- **嵌入维度的选择**：128 维是常见起点。维度越高表达能力越强，但过拟合风险增加。

### 6.4.6 本章小结

图嵌入将图结构转化为向量空间，是连接图分析与深度学习的桥梁。DeepWalk 和 Node2Vec 属于**直推式（transductive）** 学习，GraphSAGE 属于**归纳式（inductive）** 学习。在工业系统中，Node2Vec 常用于离线生成节点特征，GraphSAGE 用于在线推理新节点。图嵌入的质量最终由下游任务（分类、推荐、异常检测）验证。

---

## 6.5 图算法在推荐系统中的应用

### 6.5.1 解决的问题

推荐系统的核心是**预测用户对物品的偏好**。将用户和物品建模为二分图（bipartite graph）的节点，交互行为（购买、点击、评分）建模为边，图算法可以自然地捕获用户-物品之间的高阶协同信号。

### 6.5.2 核心原理

**二分图上的协同过滤**：用户集合 U 和物品集合 I 构成二分图 G=(U∪I, E)。用户 u 对物品 i 的偏好可以通过图中路径传播。核心思想：如果用户 u1 和 u2 都购买了物品 i1，且 u2 还购买了 i2，则 u1 也可能喜欢 i2。

**Personalized PageRank (PPR)** 是 PageRank 的变体，从目标用户节点出发进行随机游走，以概率 α 返回起点，以概率 1-α 沿边游走。PPR 得分高的物品即为推荐候选。PPR 的稳态向量可通过迭代求解：

```
π_u = (1-α) · M · π_u + α · e_u
```

其中 M 是转移概率矩阵，e_u 是用户 u 的指示向量。

**SimRank** 基于"两个节点相似如果它们的邻居也相似"的递归定义：

```
SimRank(a,b) = C / |I(a)|·|I(b)| × Σ Σ SimRank(Ii(a), Ij(b))
```

其中 C 是衰减常数（通常 0.8），I(a) 是 a 的入邻居集合。SimRank 通过迭代计算至收敛。

### 6.5.3 代码实现

```java
import java.util.*;

public class RecommendationAlgorithms {

    static class BipartiteGraph {
        int numUsers, numItems;
        List<List<Integer>> userEdges;   // user → items
        List<List<Integer>> itemEdges;   // item → users

        BipartiteGraph(int numUsers, int numItems) {
            this.numUsers = numUsers;
            this.numItems = numItems;
            userEdges = new ArrayList<>();
            itemEdges = new ArrayList<>();
            for (int i = 0; i < numUsers; i++) userEdges.add(new ArrayList<>());
            for (int i = 0; i < numItems; i++) itemEdges.add(new ArrayList<>());
        }

        void addInteraction(int user, int item) {
            userEdges.get(user).add(item);
            itemEdges.get(item).add(user);
        }
    }

    // ========== 1. Personalized PageRank ==========
    public static double[] personalizedPageRank(BipartiteGraph g, int targetUser,
                                                double alpha, int maxIter, double tol) {
        int n = g.numUsers + g.numItems;
        double[] rank = new double[n];
        rank[targetUser] = 1.0;
        for (int iter = 0; iter < maxIter; iter++) {
            double[] newRank = new double[n];
            for (int u = 0; u < g.numUsers; u++) {
                if (rank[u] == 0) continue;
                List<Integer> items = g.userEdges.get(u);
                if (items.isEmpty()) continue;
                double contrib = rank[u] / items.size();
                for (int item : items) newRank[g.numUsers + item] += contrib;
            }
            for (int i = 0; i < g.numItems; i++) {
                if (rank[g.numUsers + i] == 0) continue;
                List<Integer> users = g.itemEdges.get(i);
                if (users.isEmpty()) continue;
                double contrib = rank[g.numUsers + i] / users.size();
                for (int user : users) newRank[user] += contrib;
            }
            double diff = 0;
            for (int v = 0; v < n; v++) {
                newRank[v] = (1 - alpha) * newRank[v] + alpha * (v == targetUser ? 1.0 : 0.0);
                diff += Math.abs(newRank[v] - rank[v]);
            }
            rank = newRank;
            if (diff < tol) break;
        }
        double[] itemScores = new double[g.numItems];
        for (int i = 0; i < g.numItems; i++) itemScores[i] = rank[g.numUsers + i];
        return itemScores;
    }

    // ========== 2. SimRank ==========
    public static double[][] simRank(BipartiteGraph g, double decay, int maxIter) {
        int n = g.numUsers + g.numItems;
        double[][] sim = new double[n][n];
        for (int i = 0; i < n; i++) sim[i][i] = 1.0;
        for (int iter = 0; iter < maxIter; iter++) {
            double[][] newSim = new double[n][n];
            for (int i = 0; i < n; i++) newSim[i][i] = 1.0;
            for (int a = 0; a < n; a++) {
                List<Integer> inA = inNeighbors(g, a);
                if (inA.isEmpty()) continue;
                for (int b = a + 1; b < n; b++) {
                    List<Integer> inB = inNeighbors(g, b);
                    if (inB.isEmpty()) continue;
                    double sum = 0;
                    for (int ia : inA) for (int ib : inB) sum += sim[ia][ib];
                    double val = decay * sum / (inA.size() * inB.size());
                    newSim[a][b] = val;
                    newSim[b][a] = val;
                }
            }
            sim = newSim;
        }
        return sim;
    }

    private static List<Integer> inNeighbors(BipartiteGraph g, int node) {
        if (node < g.numUsers) return g.userEdges.get(node);
        return g.itemEdges.get(node - g.numUsers);
    }

    // ========== 3. 基于二分图的协同过滤（路径计数） ==========
    public static double[] collaborativeFiltering(BipartiteGraph g, int targetUser) {
        double[] scores = new double[g.numItems];
        Set<Integer> interacted = new HashSet<>(g.userEdges.get(targetUser));
        for (int item : g.userEdges.get(targetUser)) {
            for (int otherUser : g.itemEdges.get(item)) {
                if (otherUser == targetUser) continue;
                for (int candidateItem : g.userEdges.get(otherUser)) {
                    if (!interacted.contains(candidateItem)) {
                        scores[candidateItem] += 1.0 / g.userEdges.get(otherUser).size();
                    }
                }
            }
        }
        return scores;
    }
}
```

### 6.5.4 使用场景

| 方法 | 典型应用 | 优势 |
|------|----------|------|
| PPR | Pinterest Pin 推荐、Twitter 关注推荐 | 个性化强，冷启动友好 |
| SimRank | 商品相似度计算、好友推荐 | 语义相似，可解释性强 |
| 二分图协同过滤 | 电商"买了还买"、视频推荐 | 实现简单，效果稳定 |

### 6.5.5 潜在风险与注意事项

- **PPR 的 α 选择**：α=0.15 是经典值。α 越大越偏向个性化（游走更短），α 越小越偏向全局流行度。
- **SimRank 的计算复杂度**：O(n²·d²·k)，n 为节点数，d 为平均度，k 为迭代次数。大规模图需使用 SimRank 变体（如 SimRank++、随机游走近似）。
- **二分图的边权重**：隐式反馈（点击、浏览）和显式反馈（评分、购买）应赋予不同权重。
- **冷启动问题**：新用户/新物品没有交互边，PPR 退化为均匀分布。可结合内容特征（side information）缓解。

### 6.5.6 本章小结

图算法为推荐系统提供了天然的协同信号传播机制。PPR 从用户出发进行带重启的随机游走，SimRank 递归定义节点相似性，二分图协同过滤通过路径计数实现"买了也买"。在 Pinterest 等工业系统中，PPR 驱动的图推荐系统处理数十亿节点，毫秒级返回推荐结果。

---

## 6.6 图算法在欺诈检测中的应用

### 6.6.1 解决的问题

金融欺诈、虚假账户、洗钱等场景中，欺诈行为往往呈现**群体性、模式化**特征。单个交易或账户看似正常，但图结构中的异常模式（环、星型、分层结构）暴露了欺诈本质。图算法可以捕获这些传统统计方法无法发现的拓扑异常。

### 6.6.2 核心原理

**Loopy Belief Propagation (LBP)** 是概率图模型中的消息传递算法。在欺诈检测中，每个节点有一个先验概率（如账户的可疑度），通过迭代传递"信念"更新邻居的置信度。消息更新公式：

```
m_{i→j}(xj) = Σ_{xi} ψij(xi,xj) · φi(xi) · Π_{k∈N(i)\j} m_{k→i}(xi)
```

其中 ψij 是边势函数（描述节点间关系），φi 是节点势函数（先验），m 是消息。LBP 在树状图上保证收敛，在带环图上通常收敛但需设置最大迭代次数。

**可疑模式检测** 包括：
- **循环流（Circular Flow）**：A→B→C→A 的资金循环，常见于洗钱
- **扇入/扇出（Fan-in/Fan-out）**：多个账户向同一账户转账后分散转出
- **分层交易（Layered Transactions）**：资金经过多层账户转移，每层金额接近阈值
- **二部图异常**：大量账户与少量商户交互（套现）

**洗钱检测** 的核心图模式：
- **环形结构**：资金在多个账户间循环，最终回到源头
- **层状结构**：资金经过 3-5 层账户，每层交易时间间隔短、金额接近
- **双向流动**：两个账户之间频繁双向转账（"对敲"）

### 6.6.3 代码实现

```java
import java.util.*;

public class FraudDetectionAlgorithms {

    // ========== 1. Loopy Belief Propagation ==========
    public static double[] loopyBP(List<List<Integer>> graph,
                                    double[] prior, double[][] edgePotential,
                                    int maxIter, double tol) {
        int n = graph.size();
        double[][] messages = new double[n][];
        for (int i = 0; i < n; i++) {
            messages[i] = new double[graph.get(i).size()];
            Arrays.fill(messages[i], 0.5);
        }
        double[] belief = new double[n];
        for (int iter = 0; iter < maxIter; iter++) {
            double[][] newMessages = new double[n][];
            for (int i = 0; i < n; i++) newMessages[i] = new double[graph.get(i).size()];
            for (int i = 0; i < n; i++) {
                List<Integer> neighbors = graph.get(i);
                for (int idx = 0; idx < neighbors.size(); idx++) {
                    int j = neighbors.get(idx);
                    double product = 1.0;
                    for (int k = 0; k < neighbors.size(); k++) {
                        if (k == idx) continue;
                        product *= messages[i][k];
                    }
                    double msg = 0;
                    for (int xi = 0; xi <= 1; xi++) {
                        for (int xj = 0; xj <= 1; xj++) {
                            msg += edgePotential[xi][xj] * (xi == 0 ? 1 - prior[i] : prior[i]) * product;
                        }
                    }
                    newMessages[i][idx] = Math.min(msg, 1 - 1e-10);
                }
            }
            double maxDiff = 0;
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < messages[i].length; j++) {
                    maxDiff = Math.max(maxDiff, Math.abs(newMessages[i][j] - messages[i][j]));
                }
            }
            messages = newMessages;
            if (maxDiff < tol) break;
        }
        for (int i = 0; i < n; i++) {
            double product = 1.0;
            for (double msg : messages[i]) product *= msg;
            belief[i] = prior[i] * product;
            belief[i] /= belief[i] + (1 - prior[i]) * product;
        }
        return belief;
    }

    // ========== 2. 环形交易检测（环检测） ==========
    public static List<List<Integer>> detectCircularFlows(List<List<Integer>> graph, int maxLen) {
        int n = graph.size();
        List<List<Integer>> cycles = new ArrayList<>();
        int[] visited = new int[n];
        int[] parent = new int[n];
        Arrays.fill(parent, -1);
        for (int start = 0; start < n; start++) {
            if (visited[start] == 0) {
                Deque<int[]> stack = new ArrayDeque<>();
                stack.push(new int[]{start, -1, 0});
                visited[start] = 1;
                while (!stack.isEmpty()) {
                    int[] cur = stack.peek();
                    int u = cur[0], depth = cur[2];
                    boolean hasChild = false;
                    for (int v : graph.get(u)) {
                        if (v == cur[1]) continue;
                        if (visited[v] == 1) {
                            List<Integer> cycle = new ArrayList<>();
                            cycle.add(v);
                            for (int[] p : stack) {
                                cycle.add(p[0]);
                                if (p[0] == v) break;
                            }
                            if (cycle.size() <= maxLen + 1 && cycle.size() >= 3) {
                                Collections.reverse(cycle);
                                cycles.add(cycle);
                            }
                        } else if (visited[v] == 0) {
                            visited[v] = 1;
                            stack.push(new int[]{v, u, depth + 1});
                            hasChild = true;
                            break;
                        }
                    }
                    if (!hasChild) {
                        stack.pop();
                        visited[u] = 2;
                    }
                }
            }
        }
        return cycles;
    }

    // ========== 3. 扇入/扇出异常检测 ==========
    public static Map<String, List<Integer>> detectFanAnomaly(
            List<List<Integer>> inEdges, List<List<Integer>> outEdges, int threshold) {
        Map<String, List<Integer>> anomalies = new HashMap<>();
        List<Integer> fanIn = new ArrayList<>();
        List<Integer> fanOut = new ArrayList<>();
        for (int i = 0; i < inEdges.size(); i++) {
            if (inEdges.get(i).size() > threshold) fanIn.add(i);
            if (outEdges.get(i).size() > threshold) fanOut.add(i);
        }
        anomalies.put("fanIn", fanIn);
        anomalies.put("fanOut", fanOut);
        return anomalies;
    }

    // ========== 4. 分层交易检测 ==========
    public static List<List<Integer>> detectLayering(List<List<Integer>> graph, int minDepth) {
        int n = graph.size();
        List<List<Integer>> layers = new ArrayList<>();
        for (int start = 0; start < n; start++) {
            int[] dist = new int[n];
            Arrays.fill(dist, -1);
            Queue<Integer> q = new ArrayDeque<>();
            q.offer(start);
            dist[start] = 0;
            int maxDist = 0;
            while (!q.isEmpty()) {
                int u = q.poll();
                for (int v : graph.get(u)) {
                    if (dist[v] == -1) {
                        dist[v] = dist[u] + 1;
                        maxDist = Math.max(maxDist, dist[v]);
                        q.offer(v);
                    }
                }
            }
            if (maxDist >= minDepth) {
                List<Integer> path = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    if (dist[i] >= minDepth) {
                        path.add(i);
                    }
                }
                if (!path.isEmpty()) layers.add(path);
            }
        }
        return layers;
    }
}
```

### 6.6.4 使用场景

| 算法 | 典型应用 | 说明 |
|------|----------|------|
| LBP | 信用卡欺诈评分、账户风险传播 | 概率推理，可解释 |
| 环检测 | 洗钱团伙识别、虚假交易链 | 模式明确，误报率低 |
| 扇入/扇出 | 套现团伙、虚假好评 | 统计特征明显 |
| 分层检测 | 洗钱"多层转账"模式 | 时间序列 + 图结构 |

### 6.6.5 潜在风险与注意事项

- **LBP 在带环图上的收敛性**：带环图上 LBP 不保证收敛，需设置最大迭代次数（通常 10-20）和阻尼因子（0.5-0.9）。
- **环检测的复杂度**：全图环检测是指数级问题。实际中限制路径长度（maxLen ≤ 6）并使用启发式剪枝。
- **误报率控制**：图模式本身不是欺诈证据，需结合金额、时间、设备指纹等多维特征。
- **实时性要求**：欺诈检测通常要求秒级响应。大规模图上的 LBP 和环检测需使用图数据库的增量计算能力。

### 6.6.6 本章小结

图算法在欺诈检测中的核心价值是发现**个体维度不可见的群体异常**。LBP 提供概率推理框架，环检测和扇入/扇出检测捕获特定欺诈模式。在蚂蚁集团、PayPal 等公司的实践中，图算法将欺诈识别率提升了 3-10 倍。关键经验是：图模式必须与金额阈值、时间窗口等业务规则结合，才能有效控制误报。

---

## 6.7 算法性能考量

### 6.7.1 解决的问题

图算法在工业级规模（数十亿节点、数万亿边）下运行时，单机内存计算往往不可行。本节讨论**如何在有限资源下高效执行图算法**，以及不同场景下的技术选型。

### 6.7.2 核心原理

**内存计算 vs. 磁盘计算**：

| 维度 | 内存计算 | 磁盘计算 |
|------|----------|----------|
| 速度 | 微秒级随机访问 | 毫秒级随机访问（差 1000x） |
| 规模上限 | 受限于 RAM（通常 < 1TB） | 受限于磁盘（可达 PB） |
| 典型系统 | Neo4j GDS、GraphX | Apache Giraph、Pregel |
| 适用算法 | BFS、PageRank、LPA | 大规模 PageRank、CC |

**近似算法 vs. 精确算法**：

- **近似 PageRank**：使用 Monte Carlo 随机游走，运行 R 次游走（R=100-1000），统计访问频率作为 PR 近似值。误差 O(1/√R)。
- **近似 Betweenness**：Brandes 算法 O(VE) 在大图上不可行。使用 K 个源节点采样（K=√V），误差可控。
- **近似三角形计数**：使用 Alon 算法或 Flajolet-Martin 草图，在 O(V+E) 时间内估计三角形数。

**并行图算法**：

- **Bulk Synchronous Parallel (BSP)**：Google Pregel 模型，每轮超步（superstep）中所有节点并行计算，然后同步通信。适合 PageRank、BFS。
- **异步并行**：节点无需等待全局同步，收敛更快但实现复杂。
- **GPU 加速**：使用 CUDA 并行处理稠密子图，BFS 和 PageRank 在 GPU 上可达 10-100x 加速。

### 6.7.3 代码实现

```java
import java.util.*;
import java.util.concurrent.*;

public class ParallelGraphAlgorithms {

    // ========== 1. 并行 PageRank（ForkJoin 框架） ==========
    public static double[] parallelPageRank(List<List<Integer>> graph,
                                             double damping, int maxIter, double tol,
                                             ForkJoinPool pool) {
        int n = graph.size();
        double[] rank = new double[n];
        Arrays.fill(rank, 1.0 / n);
        int[] outDeg = new int[n];
        for (int u = 0; u < n; u++) outDeg[u] = graph.get(u).size();
        for (int iter = 0; iter < maxIter; iter++) {
            double[] newRank = new double[n];
            double[] danglingSum = new double[1];
            pool.submit(() -> {
                for (int u = 0; u < n; u++) {
                    if (outDeg[u] == 0) {
                        synchronized (danglingSum) { danglingSum[0] += rank[u]; }
                        continue;
                    }
                    double contrib = rank[u] / outDeg[u];
                    for (int v : graph.get(u)) {
                        synchronized (newRank) { newRank[v] += contrib; }
                    }
                }
            }).join();
            double base = (1 - damping) / n + damping * danglingSum[0] / n;
            double diff = 0;
            for (int v = 0; v < n; v++) {
                newRank[v] = base + damping * newRank[v];
                diff += Math.abs(newRank[v] - rank[v]);
            }
            rank = newRank;
            if (diff < tol) break;
        }
        return rank;
    }

    // ========== 2. 近似 PageRank（Monte Carlo） ==========
    public static double[] approximatePageRank(List<List<Integer>> graph,
                                                int numWalks, int walkLength) {
        int n = graph.size();
        double[] visits = new double[n];
        Random rnd = new Random(42);
        for (int w = 0; w < numWalks; w++) {
            int cur = rnd.nextInt(n);
            visits[cur]++;
            for (int step = 0; step < walkLength; step++) {
                List<Integer> neighbors = graph.get(cur);
                if (neighbors.isEmpty()) { cur = rnd.nextInt(n); }
                else { cur = neighbors.get(rnd.nextInt(neighbors.size())); }
                visits[cur]++;
            }
        }
        double total = 0;
        for (double v : visits) total += v;
        for (int i = 0; i < n; i++) visits[i] /= total;
        return visits;
    }

    // ========== 3. 并行 BFS（层级同步） ==========
    public static int[] parallelBFS(List<List<Integer>> graph, int start, ForkJoinPool pool) {
        int n = graph.size();
        int[] dist = new int[n];
        Arrays.fill(dist, -1);
        dist[start] = 0;
        Set<Integer> frontier = ConcurrentHashMap.newKeySet();
        frontier.add(start);
        int level = 0;
        while (!frontier.isEmpty()) {
            Set<Integer> next = ConcurrentHashMap.newKeySet();
            List<Integer> frontierList = new ArrayList<>(frontier);
            CountDownLatch latch = new CountDownLatch(frontierList.size());
            for (int u : frontierList) {
                pool.submit(() -> {
                    for (int v : graph.get(u)) {
                        if (dist[v] == -1) {
                            synchronized (dist) {
                                if (dist[v] == -1) {
                                    dist[v] = level + 1;
                                    next.add(v);
                                }
                            }
                        }
                    }
                    latch.countDown();
                });
            }
            try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            frontier = next;
            level++;
        }
        return dist;
    }
}
```

### 6.7.4 使用场景

| 策略 | 适用场景 | 典型规模 |
|------|----------|----------|
| 单机内存 | 开发调试、中小规模图 | < 10⁷ 节点 |
| 分布式 BSP | 离线批处理、全图分析 | 10⁹-10¹² 边 |
| 近似算法 | 实时查询、交互式分析 | 任意规模 |
| GPU 加速 | 稠密子图、矩阵运算 | 10⁶-10⁸ 节点 |

### 6.7.5 潜在风险与注意事项

- **数据局部性**：图数据随机访问模式导致 CPU 缓存命中率低。使用 CSR（Compressed Sparse Row）格式存储邻接表可改善。
- **通信开销**：分布式图算法中，网络通信往往是瓶颈。使用 GAS（Gather-Apply-Scatter）模型减少通信。
- **负载均衡**：幂律图中少数节点度极高，需使用度感知分区（如 PowerGraph 的顶点切割）。
- **近似误差控制**：近似算法需提供误差界保证。Monte Carlo PageRank 的误差与 1/√R 成正比，R 为游走次数。

### 6.7.6 本章小结

图算法的性能优化是一个系统工程。内存计算追求极致速度但受容量限制，磁盘计算牺牲速度换取规模，近似算法在精度和速度之间取得平衡。实际工业系统通常采用**分层策略**：热数据（频繁访问的子图）在内存中精确计算，冷数据在磁盘上近似计算。Neo4j GDS 和 TigerGraph 等系统通过 C++ 级优化、SIMD 指令和 NUMA 感知内存分配，在单机上即可处理数十亿边的图分析。

---

## 本章总结

本章覆盖了图算法从基础到前沿的完整图谱：

1. **路径搜索**（BFS/Dijkstra/A\*/双向 BFS）是图算法的基础能力，在导航、社交推荐中直接应用
2. **中心性分析**（PageRank/Betweenness/Closeness）量化节点重要性，是影响力分析和关键节点识别的核心工具
3. **社区发现**（Louvain/LPA/三角形计数）揭示图的模块化结构，为推荐和异常检测提供特征
4. **图嵌入**（Node2Vec/GraphSAGE）将图结构转化为向量，连接图分析与深度学习
5. **推荐系统**中 PPR 和 SimRank 利用图结构实现协同过滤
6. **欺诈检测**中 LBP 和模式检测发现个体维度不可见的群体异常
7. **性能优化**需要在精度、速度和规模之间权衡

在实际图数据库系统中（Neo4j、TigerGraph、NebulaGraph），这些算法通常以插件或存储过程的形式提供。理解算法原理有助于正确选择参数、解释结果，以及在必要时进行定制化改造。图算法是图数据库区别于传统关系数据库的核心能力，掌握它们意味着你能够从"存储数据"跃迁到"从数据中发现价值"。
