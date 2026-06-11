# 第11章 图算法——最短路径

> "在加权图中寻找最短路径，是计算机科学中最经典的问题之一——从GPS导航到互联网路由，从金融套利到社交网络分析，最短路径算法无处不在。"

---

## 11.1 Dijkstra算法

Dijkstra算法是解决**单源最短路径**问题（Single-Source Shortest Path, SSSP）最著名的算法，由荷兰计算机科学家 Edsger W. Dijkstra 在1956年提出。

### 11.1.1 核心思想

Dijkstra算法基于**贪心策略**和**松弛操作（Relaxation）**：

- **贪心策略**：每次从未确定最短距离的顶点中，选择距离源点最近的顶点
- **松弛操作**：通过已选顶点更新其邻居的距离：`if (dist[u] + w < dist[v]) dist[v] = dist[u] + w`

```
初始化: dist[source] = 0, 其他 dist[v] = ∞
集合 S = {}      // 已确定最短路径的顶点
优先队列 Q = {所有顶点}  // 按 dist 值排序

while (Q 不为空):
    u = Q中dist最小的顶点
    将 u 加入 S
    for (u 的每个邻居 v):
        if dist[u] + weight(u,v) < dist[v]:
            dist[v] = dist[u] + weight(u,v)    // 松弛
            更新 Q 中的 dist[v]
```

### 11.1.2 优先队列实现

使用 `PriorityQueue`（最小堆）实现，每次取出距离最小的顶点：

```java
class Pair {
    int vertex, distance;
    Pair(int v, int d) { vertex = v; distance = d; }
}

int[] dijkstra(int source, List<Edge>[] graph) {
    int n = graph.length;
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[source] = 0;

    PriorityQueue<Pair> pq = new PriorityQueue<>(
        (a, b) -> a.distance - b.distance);
    pq.offer(new Pair(source, 0));

    while (!pq.isEmpty()) {
        Pair cur = pq.poll();
        int u = cur.vertex;
        if (cur.distance > dist[u]) continue;  // 过时条目
        for (Edge e : graph[u]) {
            int v = e.to, w = e.weight;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.offer(new Pair(v, dist[v]));
            }
        }
    }
    return dist;
}
```

**时间复杂度：** O((V+E)logV) —— 每个顶点出队一次（logV），每条边松弛一次（可能在堆中插入新条目）。

### 11.1.3 非负权重要求

Dijkstra算法要求图中**不存在负权边**。原因在于贪心策略的假设：当从优先队列中取出顶点 u 时，`dist[u]` 已经是最小值。但如果存在负权边，后面可能出现通过负权边到达 u 的更短路径，破坏这个假设。

```
负权边反例:
   source → A (权重 5)
   source → B (权重 2)
   B → A (权重 -3)

   执行过程:
   1. 取出 B (dist=2), 更新 A: dist[A] = 2 + (-3) = -1
   2. 取出 A (dist=-1), 正确 ✓ (但 Dijkstra 会出错的原因在于:
      如果 A 先于 B 被取出, dist[A]=5, 后面无法再更新)
```

### 11.1.4 应用场景

**GPS导航系统：**
- 顶点 = 路口/地点，边 = 道路，权重 = 距离/时间/油耗
- 实时导航系统使用 Dijkstra 的变体（如双向 Dijkstra、A*）

**OSPF（Open Shortest Path First）网络路由协议：**
- OSPF 使用 Dijkstra 算法计算网络中到所有其他路由器的最短路径
- 链路状态数据库（LSDB）即为图结构，链路代价（Cost）作为权重
- 所有链路代价为正，符合 Dijkstra 的要求

---

## 11.2 Bellman-Ford算法

Bellman-Ford算法是另一种单源最短路径算法，由 Richard Bellman 和 Lester Ford 各自独立提出。它的最大优势是**支持负权边**，并能**检测负权环**。

### 11.2.1 动态规划思想

Bellman-Ford 的核心是基于**动态规划**的松弛操作：

- 定义 `dp[k][v]` 表示从源点到 v，最多经过 k 条边的最短距离
- 状态转移：`dp[k][v] = min(dp[k-1][v], min_{u→v}(dp[k-1][u] + w(u,v)))`
- 在一个有 V 个顶点的图中，最短路径最多有 V-1 条边（无环的前提）

### 11.2.2 V-1 轮松弛

算法执行 V-1 轮，每轮对所有边进行松弛：

```java
int[] bellmanFord(int source, int V, List<Edge> edges) {
    int[] dist = new int[V];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[source] = 0;

    // V-1 轮松弛
    for (int i = 0; i < V - 1; i++) {
        for (Edge e : edges) {
            if (dist[e.from] != Integer.MAX_VALUE
                    && dist[e.from] + e.weight < dist[e.to]) {
                dist[e.to] = dist[e.from] + e.weight;
            }
        }
    }
    return dist;
}
```

**为什么 V-1 轮就够了？** 最短路径不会包含环路（否则可以去掉环路得到更短路径），因此路径长度最多 V-1 条边。每轮至少确定一个顶点的最短距离，V-1 轮后所有顶点都已确定。

**时间复杂度：** O(VE) —— V-1 轮，每轮遍历 E 条边。

### 11.2.3 负权环检测

执行完 V-1 轮后，再做第 V 轮松弛。如果第 V 轮仍然有边可以松弛，说明图中存在负权环（Negative Cycle）：

```java
boolean hasNegativeCycle = false;
for (Edge e : edges) {
    if (dist[e.from] != Integer.MAX_VALUE
            && dist[e.from] + e.weight < dist[e.to]) {
        hasNegativeCycle = true;
        break;
    }
}
```

**原理：** 如果存在负权环，可以无限循环该环使距离不断减小，因此最短路径无定义（负无穷）。

### 11.2.4 应用场景：货币套利检测

Bellman-Ford 的一个经典应用是**检测货币套利机会**：

- 将每种货币作为顶点，汇率作为边的权重
- 对汇率取负对数：`w = -log(rate)`，使乘积变成加法
- 如果转换后存在负权环，意味着存在套利机会（通过循环兑换可以获利）

```
例子：USD → EUR (汇率 0.9), EUR → GBP (汇率 0.85), GBP → USD (汇率 1.3)
转换后权重: USD→EUR: -log(0.9), EUR→GBP: -log(0.85), GBP→USD: -log(1.3)
如果这三个权重之和 < 0，说明存在套利机会
```

---

## 11.3 SPFA算法

SPFA（Shortest Path Faster Algorithm）是 Bellman-Ford 算法的队列优化版本，由段凡丁在1994年提出。

### 11.3.1 核心优化

Bellman-Ford 每轮松弛**所有边**，但很多边的松弛操作是无效的——只有**被成功松弛的顶点**的出边才可能在下轮被松弛。

SPFA 维护一个队列，只处理"距离被更新过"的顶点：

```java
int[] spfa(int source, List<Edge>[] graph) {
    int n = graph.length;
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[source] = 0;

    boolean[] inQueue = new boolean[n];
    int[] count = new int[n];          // 入队次数
    Queue<Integer> queue = new LinkedList<>();
    queue.offer(source);
    inQueue[source] = true;

    while (!queue.isEmpty()) {
        int u = queue.poll();
        inQueue[u] = false;
        for (Edge e : graph[u]) {
            if (dist[u] + e.weight < dist[e.to]) {
                dist[e.to] = dist[u] + e.weight;
                if (!inQueue[e.to]) {
                    queue.offer(e.to);
                    inQueue[e.to] = true;
                    count[e.to]++;
                    if (count[e.to] >= n) {
                        // 存在负权环
                        return null;
                    }
                }
            }
        }
    }
    return dist;
}
```

### 11.3.2 时间复杂度

- **平均情况：** O(E) —— 实际应用中通常非常快
- **最坏情况：** O(VE) —— 和 Bellman-Ford 相同，需要特殊构造的图才能触发

### 11.3.3 何时使用

| 条件 | 推荐算法 |
|------|---------|
| 无负权边 | Dijkstra (O((V+E)logV)，稳定快速) |
| 有负权边，图较稀疏 | SPFA (平均 O(E)，实现简单) |
| 有负权边，需稳定性能 | Bellman-Ford (O(VE)，无最坏情况风险) |
| 需检测负权环 | Bellman-Ford 或 SPFA |

### 11.3.4 负权环与死循环

SPFA 检测负权环的方式：记录每个顶点的入队次数。如果某个顶点入队次数 ≥ V，说明存在负权环。

负权环会导致 SPFA 陷入**无限循环**（距离不断减小，不断入队），因此必须检测并终止。

---

## 11.4 Floyd-Warshall算法

Floyd-Warshall算法解决**所有顶点对之间**的最短路径问题（All-Pairs Shortest Path, APSP），由 Robert Floyd 和 Stephen Warshall 提出。

### 11.4.1 动态规划思想

使用 DP 逐步允许更多顶点作为"中间顶点"：

- 定义 `dp[k][i][j]` 表示从 i 到 j，只允许使用编号 ≤ k 的顶点作为中间顶点的最短距离
- 状态转移：`dp[k][i][j] = min(dp[k-1][i][j], dp[k-1][i][k] + dp[k-1][k][j])`
- 空间优化：可以在原数组上直接更新

### 11.4.2 实现

```java
void floydWarshall(int[][] dist) {
    int V = dist.length;
    for (int k = 0; k < V; k++)           // 中间顶点
        for (int i = 0; i < V; i++)       // 起点
            for (int j = 0; j < V; j++)   // 终点
                if (dist[i][k] != INF && dist[k][j] != INF
                        && dist[i][k] + dist[k][j] < dist[i][j])
                    dist[i][j] = dist[i][k] + dist[k][j];
}
```

### 11.4.3 时间复杂度与空间复杂度

- **时间复杂度：** O(V³) —— 三重循环，无法进一步优化
- **空间复杂度：** O(V²) —— 存储距离矩阵

Dijkstra 从每个顶点跑一次的复杂度为 O(V(V+E)logV)。当图稠密（E ≈ V²）时，Dijkstra 方案为 O(V³logV)，Floyd-Warshall 的 O(V³) 更优。

### 11.4.4 路径重建

维护一个 `next[i][j]` 矩阵记录从 i 到 j 的路径上 i 的下一个顶点：

```java
int[][] next = new int[V][V];
for (int i = 0; i < V; i++)
    for (int j = 0; j < V; j++)
        next[i][j] = j;  // 初始：i 直接到 j

// 在 Floyd-Warshall 更新距离时同步更新 next
if (dist[i][k] + dist[k][j] < dist[i][j]) {
    dist[i][j] = dist[i][k] + dist[k][j];
    next[i][j] = next[i][k];  // i 到 j 的路径上第一个经过 k
}
```

### 11.4.5 负权环检测

Floyd-Warshall 执行完毕后，检查对角线：如果 `dist[i][i] < 0`，说明顶点 i 在某个负权环中（因为从 i 出发经过一个环回到 i 的路径比零短）。

### 11.4.6 经典应用

**传递闭包（Transitive Closure）：**
- 将距离矩阵改为布尔矩阵，`reachable[i][j]` 表示 i 能否到达 j
- 转移条件改为 `reachable[i][j] = reachable[i][j] || (reachable[i][k] && reachable[k][j])`
- 这就是 Warshall 算法（Floyd-Warshall 的无权版本）

**图的直径（Diameter of Graph）：**
- 在所有最短路径中取最大值：`diameter = max(dist[i][j])`
- 社交网络中，"六度分隔"理论中的最大距离就是图的直径

**检测图的连通性：** 如果 `dist[i][j]` 不为无穷大，则 i 和 j 连通。

---

## 11.5 最短路径问题变形

### 11.5.1 单源单目标：双向 Dijkstra

当只需要求从特定源 s 到特定目标 t 的最短路径时，双向搜索可以大幅减少探索范围：

```
前向搜索: 从 s 出发，使用 Dijkstra
反向搜索: 从 t 出发，在反向图上使用 Dijkstra
交替进行，当某个顶点在两个方向都被处理过时停止
```

**探索范围：** 单向 Dijkstra 探索的面积约为 πr²，双向 Dijkstra 约为 2 × π(r/2)² = πr²/2，节省约 50%。在网格图中更加显著。

### 11.5.2 单源单目标：A* 搜索

A* 是 Dijkstra 的启发式版本，使用 `f(v) = g(v) + h(v)` 作为优先级：

- `g(v)`：从源点到 v 的实际代价（同 Dijkstra）
- `h(v)`：从 v 到目标的启发式估计代价
- 要求 `h(v)` 是**可采纳的**（Admissible）：`h(v) ≤ 实际距离`

**曼哈顿距离启发式（网格图）：**
```java
int h(int x1, int y1, int x2, int y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}
```

A* 在路径规划（游戏 AI、机器人导航）中广泛使用，比 Dijkstra 更快找到目标。

### 11.5.3 K-最短路径：Yen's 算法

有时需要不止一条最短路径（如备用路线推荐）。Yen's 算法求从 s 到 t 的前 K 条最短路径：

1. 用 Dijkstra 找出第一条最短路径 A[0]
2. 对于每条已找到的路径 A[k]：
   - 选择路径上的每个顶点作为"偏离点"
   - 临时移除该点到路径上下一个顶点的边（以及之前路径使用的某些边）
   - 从偏离点出发跑 Dijkstra 到 t
   - 将新路径加入候选集合 B
3. 从未确认的候选中选择最短的作为下一条路径

### 11.5.4 DAG 中的最短路径

在**有向无环图（DAG）** 中，可以利用拓扑排序在 O(V+E) 时间内求解：

```java
int[] shortestPathInDAG(int source, List<Edge>[] graph) {
    int n = graph.length;
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[source] = 0;

    List<Integer> topo = topologicalSort(graph);  // O(V+E)
    for (int u : topo) {
        if (dist[u] != Integer.MAX_VALUE) {
            for (Edge e : graph[u]) {
                if (dist[u] + e.weight < dist[e.to])
                    dist[e.to] = dist[u] + e.weight;
            }
        }
    }
    return dist;
}
```

**为什么 O(V+E)？** 利用拓扑序确保在处理顶点 u 时，所有到达 u 的路径都已经考虑过，每条边只需被松弛一次。

### 11.5.5 路径重建

几乎所有最短路径算法都可以通过维护**前驱数组** `prev[v]` 来重建路径：

```java
// 松弛时记录前驱
if (dist[u] + w < dist[v]) {
    dist[v] = dist[u] + w;
    prev[v] = u;  // 记录从 u 到达 v
}

// 重建路径
List<Integer> reconstructPath(int target, int[] prev) {
    List<Integer> path = new ArrayList<>();
    for (int v = target; v != -1; v = prev[v])
        path.add(v);
    Collections.reverse(path);
    return path;
}
```

---

## 本章小结

1. **Dijkstra算法**：贪心 + 优先队列，O((V+E)logV)，要求无负权边。是单源最短路径的默认选择。

2. **Bellman-Ford算法**：DP + V-1 轮松弛，O(VE)，支持负权边和负权环检测。适用于货币套利检测等场景。

3. **SPFA算法**：Bellman-Ford 的队列优化，平均 O(E)，最坏 O(VE)。适合有负权边的稀疏图。

4. **Floyd-Warshall算法**：DP + 三重循环，O(V³)，求解所有点对最短路径。适合稠密图和传递闭包计算。

5. **问题变形**：双向 Dijkstra 和 A* 针对单源单目标优化搜索效率；Yen's 算法求 K-最短路径；DAG 中利用拓扑排序实现 O(V+E) 线性时间。

> "单源最短路径、所有点对最短路径、K-最短路径——这些算法构成了图论应用中最基础的工具箱。理解它们各自的强弱边界，才能在面对具体问题时选择最趁手的工具。"