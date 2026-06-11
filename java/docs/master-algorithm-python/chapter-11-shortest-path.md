# 第11章 图算法 - 最短路径

> **核心问题**：给定一个带权图（Weighted Graph），如何找到从一个顶点到另一个顶点的最短路径（即边权之和最小的路径）？

最短路径问题是图论中最经典也最实用的问题之一。GPS 导航、网络路由、社交网络中的"六度分隔"、游戏中的寻路——背后都是最短路径算法在驱动。不同场景对图的性质有不同的约束：边权可正可负、图可能是稀疏或稠密的、需要单源还是多源——每种约束对应不同的最优算法选择。

---

## 11.1 Dijkstra 算法

Dijkstra 算法是单源最短路径（Single-Source Shortest Path, SSSP）中最著名的算法。它于 1959 年由 Edsger W. Dijkstra 提出，适用于**所有边权均为非负数**的图。

### 解决的问题

给定一个带权有向/无向图 G = (V, E) 和一个源点 s，求 s 到所有其他顶点的最短路径。要求所有边权 `w(u, v) ≥ 0`。

### 实现原理

**核心思想**：贪心策略——每次从未确定最短距离的顶点中，选择距离源点最近的那个，然后"松弛"（Relax）它的邻接边。

**松弛操作**：如果通过顶点 u 到达 v 比当前已知的 s→v 距离更短，就更新 dist[v]：

```
if dist[u] + w(u, v) < dist[v]:
    dist[v] = dist[u] + w(u, v)
```

**正确性依赖**：所有边权非负。这保证了当选择一个顶点作为"当前最近顶点"时，它的最短距离已经确定——因为任何绕路只会让路径更长。

**算法流程**：

```
① 初始化：dist[s] = 0，其他 dist[v] = ∞
② 将 (dist[s], s) 加入优先队列（最小堆）
③ 重复以下步骤直到队列为空：
   └→ 弹出距离最小的顶点 u
   └→ 如果 dist[u] 已被"过时"（大于记录值），跳过
   └→ 对每条出边 (u, v, w) 执行松弛
   └→ 如果松弛成功，将 (dist[v], v) 入队
```

**可视化执行过程**：

```
初始图（s=A）：
      2      3
  A ───→ B ───→ D
  │       │       │
  1│      1│       │1
  ↓       ↓       ↓
  C ───→ E ───→ F
      4      2

执行过程（括号内为当前 dist）：

step 0: dist = {A:0, B:∞, C:∞, D:∞, E:∞, F:∞}
        堆: [(0,A)]

step 1: 弹出 A(0)，松弛 B(2), C(1)
        dist = {A:0, B:2, C:1, D:∞, E:∞, F:∞}
        堆: [(1,C), (2,B)]

step 2: 弹出 C(1)，松弛 E(1+4=5)
        dist = {A:0, B:2, C:1, D:∞, E:5, F:∞}
        堆: [(2,B), (5,E)]

step 3: 弹出 B(2)，松弛 D(2+3=5), E(2+1=3)
        dist = {A:0, B:2, C:1, D:5, E:3, F:∞}
        堆: [(3,E), (5,D), (5,E)]

step 4: 弹出 E(3)，松弛 F(3+2=5)
        dist = {A:0, B:2, C:1, D:5, E:3, F:5}
        堆: [(5,D), (5,E), (5,F)]

step 5: 弹出 D(5)，松弛 F(5+1=6 > 5, 不更新)
step 6: 弹出 F(5)，无出边

最终 dist = {A:0, B:2, C:1, D:5, E:3, F:5}
                                            用 B→E 的 1 而不是 C→E 的 4
```

### 复杂度分析

| 实现方式 | 时间复杂度 | 空间复杂度 |
|---------|-----------|-----------|
| 朴素数组 | O(V²) | O(V) |
| 二叉堆（优先队列）| O(E log V) | O(V + E) |
| 斐波那契堆 | O(E + V log V) | O(V + E) |

实际工程中最常用的是二叉堆实现（Python 的 `heapq`），复杂度 O(E log V)。

### 代码实现

```python
import heapq
from typing import Dict, List, Optional, Tuple

def dijkstra(graph: Dict[str, List[Tuple[str, int]]],
             start: str) -> Tuple[Dict[str, int], Dict[str, Optional[str]]]:
    """
    Dijkstra 算法。
    
    返回：(dist, prev)
    dist[v] = 从 start 到 v 的最短距离
    prev[v] = 最短路径中 v 的前驱顶点（用于路径重建）
    """
    dist = {v: float('inf') for v in graph}
    prev = {v: None for v in graph}
    dist[start] = 0
    
    pq = [(0, start)]  # (distance, vertex)
    
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:          # 过时记录，跳过
            continue
        for v, w in graph[u]:
            new_d = d + w
            if new_d < dist[v]:
                dist[v] = new_d
                prev[v] = u
                heapq.heappush(pq, (new_d, v))
    
    return dist, prev


def reconstruct_path(prev: Dict[str, Optional[str]],
                     target: str) -> List[str]:
    """重建从 start 到 target 的最短路径"""
    path = []
    v = target
    while v is not None:
        path.append(v)
        v = prev[v]
    path.reverse()
    return path
```

### 使用场景

| 应用领域 | 描述 | 原因 |
|---------|------|------|
| GPS 导航 | 地图上的最短驾车路线 | 道路距离非负，需要实时响应 |
| 网络路由 | OSPF 协议使用 Dijkstra 计算最短路径 | 链路权值为正 |
| 社交网络 | 计算两人之间的最短关系链 | 无权图等价于 BFS，有权用 Dijkstra |
| 游戏寻路 | 角色移动的最短路径 | 可结合启发式加速（A* 基于 Dijkstra）|

### 潜在风险与问题

- **负权边会破坏算法正确性**：一旦确定某点的最短距离就不会再更新，但负权边可能导致更短的路径在之后才被发现
- **无法处理负权环**：即使有检测能力也无意义，因为 Dijkstra 不支持负权边
- **稠密图性能差**：堆实现 O(E log V) 在 E ≈ V² 时退化为 O(V² log V)，此时朴素数组 O(V²) 可能更快
- **大图中的堆操作开销**：每个松弛都 push 一次可能导致堆中元素远多于 V

### 优化策略

- **斐波那契堆**：将 push/pop 的 log V 降为常数摊销，适合 E 远大于 V 的图
- **双向 Dijkstra**：从起点和终点同时搜索，相遇时终止。可将搜索空间减半
- **A\***：加入启发式函数（如欧几里得距离），引导搜索方向，显著减少探索顶点数

---

## 11.2 Bellman-Ford 算法

Dijkstra 无法处理负权边，但现实中有问题需要：某些场景中的"折扣"或"收益"可建模为负权边。Bellman-Ford 算法正是为此而生——不仅能处理负权边，还能**检测负权环**。

### 解决的问题

SSSP 问题的通用解法，允许负权边。如果图中存在从源点可达的负权环（Negative-Weight Cycle），算法能检测出来并报告。

### 实现原理

**核心思想**：动态规划——逐轮松弛所有边。第 k 轮松弛后，dist[v] 就是从源点到 v 的、最多经过 k 条边的最短距离。

```
对于 k = 1 到 V-1：
    对于每条边 (u, v, w)：
        如果 dist[u] + w < dist[v]：
            dist[v] = dist[u] + w
```

**为什么 V-1 轮就够了**？在无负权环的图中，最短路径最多包含 V-1 条边（每条顶点至多一次）。V-1 轮松弛足够将最短距离"传播"到所有顶点。

```
可视化：一条链式传播
       2      1      3
  s ───→ a ───→ b ───→ t

第1轮：只松弛到 a(dist=2)     ← 经过 1 条边
第2轮：松弛到 b(dist=2+1=3)   ← 经过 2 条边
第3轮：松弛到 t(dist=3+3=6)   ← 经过 3 条边

实际只需三轮，因为最长简单路径经过 3 条边。
```

**第五轮检测负权环**：再此遍历所有边，如果还能松弛说明存在从源点可达的负权环。

```
             -1
        a ─────→ b
        ↑        │
        │  -4    │  2
        └────────┘
         c(起点)

正常执行 V-1=2 轮后：
  如果再做第 V 轮还能松弛 dist[a]、dist[b]、dist[c] → 负权环！

检测到负权环后，所有环上顶点及可达顶点的最短距离都是 -∞，
因为可以无限绕环来缩短路径。
```

### 复杂度分析

| 维度 | 值 |
|------|-----|
| 时间复杂度 | O(V·E) |
| 空间复杂度 | O(V) |

在所有最短路径算法中，Bellman-Ford 的效率最低，但它的泛用性最强（支持负权边）。

### 代码实现

```python
from typing import Dict, List, Optional, Tuple

def bellman_ford(edges: List[Tuple[str, str, int]],
                 vertices: List[str],
                 start: str) -> Tuple[bool, Dict[str, int], Dict[str, Optional[str]]]:
    """
    Bellman-Ford 算法。
    
    返回：(has_negative_cycle, dist, prev)
    has_negative_cycle: 是否存在从 start 可达的负权环
    """
    dist = {v: float('inf') for v in vertices}
    prev = {v: None for v in vertices}
    dist[start] = 0
    
    # V-1 轮松弛
    for _ in range(len(vertices) - 1):
        updated = False
        for u, v, w in edges:
            if dist[u] != float('inf') and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                updated = True
        if not updated:  # 提前终止优化
            break
    
    # 检测负权环
    for u, v, w in edges:
        if dist[u] != float('inf') and dist[u] + w < dist[v]:
            return True, dist, prev  # 存在负权环
    
    return False, dist, prev
```

### 使用场景

| 应用领域 | 描述 |
|---------|------|
| 汇率套利 | 货币兑换中找到套利环（取对数后转为负权环检测）|
| 网络协议 | RIP 协议的底层路由算法（分布式 Bellman-Ford）|
| 约束系统 | 差分约束系统（Difference Constraints）转化为最短路径问题 |
| 金融风控 | 检测交易环中的负向收益路径 |

### 潜在风险与问题

- **效率低下**：O(V·E) 在稀疏图中勉强可用，在稠密图中 O(V³) 几乎不可用
- **无法处理无向图负权边**：无向图的负权边隐式形成负权环（来回走一次就形成长度为 2 的负权环）
- **负权环上的顶点距离无意义**：检测到负权环后，仅能报告存在，无法给出有效距离
- **整数溢出风险**：初始化为 `inf` 后做加法可能导致溢出（Python 无此问题）

### 优化策略

- **SPFA 优化**：仅用队列维护"可能引起松弛的顶点"，代替全边扫描（见 11.3 节）
- **提前终止**：如果某轮没有发生松弛，说明已经收敛，可提前退出
- **队列长度限制**：SPFA 中如果某个顶点入队超过 V 次，可判定负权环
- **Yen 优化**：随机打乱边序可减少松弛轮数

---

## 11.3 SPFA 算法

SPFA（Shortest Path Faster Algorithm）是 Bellman-Ford 的队列优化版本，由段凡丁于 1994 年提出。它在平均情况下表现优异，但最坏情况仍会退化。

### 解决的问题

同样解决 SSSP 问题，支持负权边和负权环检测。相比 Bellman-Ford，SPFA 通过避免扫描不必要的边来提升平均性能。

### 实现原理

**关键观察**：在 Bellman-Ford 中，第 k 轮只有**在前一轮距离被更新的顶点**才可能引起新的松弛。其他顶点的松弛尝试是浪费的。

SPFA 用队列（Queue）维护"距离被更新过的顶点"：

```
① dist[s] = 0，s 入队
② 队列不为空时循环：
   └→ 出队一个顶点 u
   └→ 标记 u 不在队列中
   └→ 对 u 的每条出边 (u, v, w) 执行松弛
   └→ 如果 dist[v] 被更新且 v 不在队中，v 入队
③ 检测负权环：如果某个顶点入队次数 ≥ V，存在负权环
```

**与 Bellman-Ford 的对比**：

```
Bellman-Ford（逐轮全边）:
  round 1: 扫描所有边 → 更新了 {a, b}
  round 2: 扫描所有边 → 更新了 {c, d}  
  round 3: 扫描所有边 → 更新了 {e}
  round 4: 扫描所有边 → 无更新, 结束

SPFA（按需松弛）:
  初始: 队列 = [s]
  处理 s: 松弛 {a, b}, 队列 = [a, b]
  处理 a: 松弛 {c}, 队列 = [b, c]
  处理 b: 松弛 {d}, 队列 = [c, d]
  处理 c: 松弛 {e}, 队列 = [d, e]
  处理 d: 无更新, 队列 = [e]
  处理 e: 无更新, 队列 = []
  → 结束 (只扫描了有更新可能的边)
```

### 复杂度分析

| 维度 | 值 |
|------|-----|
| 平均时间复杂度 | O(E)（远优于 Bellman-Ford 的 O(VE)）|
| 最坏时间复杂度 | O(V·E)（可构造特定图使之退化）|
| 空间复杂度 | O(V) |

虽然最坏情况没有理论提升，但在随机图和实际流量中，SPFA 通常比 Bellman-Ford 快数倍到数十倍。

### 代码实现

```python
from collections import deque
from typing import Dict, List, Optional, Tuple

def spfa(graph: Dict[str, List[Tuple[str, int]]],
         start: str) -> Tuple[bool, Dict[str, int], Dict[str, Optional[str]]]:
    """
    SPFA 算法（队列优化的 Bellman-Ford）。
    
    返回：(has_negative_cycle, dist, prev)
    """
    dist = {v: float('inf') for v in graph}
    prev = {v: None for v in graph}
    in_queue = {v: False for v in graph}
    push_count = {v: 0 for v in graph}
    dist[start] = 0
    
    q = deque([start])
    in_queue[start] = True
    push_count[start] = 1
    
    while q:
        u = q.popleft()
        in_queue[u] = False
        
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                if not in_queue[v]:
                    q.append(v)
                    in_queue[v] = True
                    push_count[v] += 1
                    if push_count[v] >= len(graph):
                        return True, dist, prev  # 负权环
    
    return False, dist, prev
```

### 使用场景

SPFA 适用于所有 Bellman-Ford 能用的场景。特别适合：
- **稀疏图**中的 SSSP 问题（实际流量中多数图是稀疏的）
- **需要响应式更新**：可以增量式地处理边的权值变化
- **竞赛编程**：在节点数和边数适中时，SPFA 实现简单且常数小

### 潜在风险与问题

- **最坏情况退化**：恶意构造的图可以使 SPFA 退化为 O(VE)，和 Bellman-Ford 一样慢
- **队列操作开销**：频繁的入队出队在 V 和 E 较大时不可忽视
- **负权环检测**：需要记录每个顶点的入队次数，额外增加了空间开销
- **存在更优选择**：如果确认没有负权边，优先用 Dijkstra

### 优化策略

- **SLF（Small Label First）**：入队时比较当前顶点距离和队首顶点距离，如果更小则插入队首
- **LLL（Large Label Last）**：计算队列平均距离，如果当前顶点距离大于平均值则移到队尾
- **DFS 版本**：用 DFS 替代 BFS 风格，在检测负权环时更快（但也更容易退化）
- **混合策略**：同时使用 SLF + LLL 进一步提升平均性能

---

## 11.4 Floyd-Warshall 算法

前三节解决的是单源最短路径（SSSP）问题。如果需要**所有顶点对之间的最短路径**（All-Pairs Shortest Path, APSP），运行 V 次 Dijkstra（O(V·E log V)）或 Bellman-Ford（O(V²·E)）显然不够优雅。Floyd-Warshall 算法以 O(V³) 的简洁 DP 解法彻底解决了这个问题。

### 解决的问题

给定带权图 G = (V, E)，求任意两点之间的最短路径。允许负权边，但图中不能有负权环。

### 实现原理

**核心思想**：动态规划。定义 `dist[k][i][j]` 为"中间顶点只允许使用前 k 个顶点时，从 i 到 j 的最短距离"。

```
状态定义：
dist[k][i][j] = 从 i 到 j 的最短路径，中间顶点只允许 {0, 1, ..., k-1}

转移方程：
dist[k+1][i][j] = min(dist[k][i][j], dist[k][i][k] + dist[k][k][j])
                      ↑ 不使用顶点 k        ↑ 使用顶点 k 作为中间点

空间优化：原地更新（in-place），将 k 维去掉
dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])
```

**可视化过程**（逐步引入中间顶点）：

```
初始 dist（直接相连的边）：

      2
  0 ─────→ 1
  │        │
  6│        │2
  ↓        ↓
  2 ─────→ 3
      1

dist 矩阵（初始）：
    0   1   2   3
0   0   2   6   ∞
1   ∞   0   ∞   2
2   ∞   ∞   0   1
3   ∞   ∞   ∞   0

引入 k=0 作为中间点：
    检查 dist[i][0] + dist[0][j] < dist[i][j]
    例如：dist[2][0] + dist[0][1] = ∞ + 2 → 不变
          dist[1][0] + dist[0][2] = ∞ + 6 → 不变
    无变化（因为没有负权边，0 没有出边到其他顶点的捷径）

引入 k=1：
    dist[0][3] = min(∞, dist[0][1] + dist[1][3]) = min(∞, 2+2) = 4
    dist[2][3] = min(1, dist[2][1] + dist[1][3]) = min(1, ∞+2) = 1 (不变)

引入 k=2：
    dist[0][3] = min(4, dist[0][2] + dist[2][3]) = min(4, 6+1) = 4 (不变)
    dist[1][3] = min(2, dist[1][2] + dist[2][3]) = min(2, ∞+1) = 2 (不变)

引入 k=3：
    dist[2][0] = min(∞, dist[2][3] + dist[3][0]) = ∞ (3到0不可达)
    ...

最终 dist（所有对最短路径）：
    0   1   2   3
0   0   2   6   4   ← 0→3 的最短路径经过 1: 0→1→3
1   ∞   0   ∞   2
2   ∞   ∞   0   1
3   ∞   ∞   ∞   0
```

### 复杂度分析

| 维度 | 值 |
|------|-----|
| 时间复杂度 | O(V³) |
| 空间复杂度 | O(V²) |

V³ 的复杂度使 Floyd-Warshall 仅适用于 V ≤ 500 左右的场景。对于更大型的图，需要分批运行单源算法或使用 Johnson 算法。

### 代码实现

```python
from typing import Dict, List, Tuple

def floyd_warshall(vertices: List[str],
                   edges: List[Tuple[str, str, int]]) -> Tuple[Dict[Tuple[str, str], int],
                                                                Dict[Tuple[str, str], str]]:
    """
    Floyd-Warshall 算法。
    
    返回：(dist, next)
    dist[(i,j)] = i 到 j 的最短距离
    next[(i,j)] = i 到 j 最短路径上的第一个中间顶点（用于路径重建）
    """
    n = len(vertices)
    idx = {v: i for i, v in enumerate(vertices)}
    
    INF = float('inf')
    dist = [[INF] * n for _ in range(n)]
    nxt = [[None] * n for _ in range(n)]
    
    for i in range(n):
        dist[i][i] = 0
    
    for u, v, w in edges:
        i, j = idx[u], idx[v]
        if w < dist[i][j]:
            dist[i][j] = w
            nxt[i][j] = v  # 记录下一个顶点
    
    for k in range(n):
        for i in range(n):
            if dist[i][k] == INF:
                continue
            for j in range(n):
                if dist[k][j] == INF:
                    continue
                new_d = dist[i][k] + dist[k][j]
                if new_d < dist[i][j]:
                    dist[i][j] = new_d
                    nxt[i][j] = nxt[i][k]  # 继承 i→k 路径中的下一个顶点
    
    # 检测负权环（对角线是否小于 0）
    has_negative_cycle = any(dist[i][i] < 0 for i in range(n))
    
    return dist, nxt, has_negative_cycle


def reconstruct_path(nxt: Dict[Tuple[str, str], str],
                     start: str, target: str) -> List[str]:
    """重建 start 到 target 的最短路径"""
    if start == target:
        return [start]
    if nxt.get((start, target)) is None:
        return []  # 不可达
    path = [start]
    while start != target:
        start = nxt[(start, target)]
        path.append(start)
    return path
```

### 使用场景

| 应用领域 | 描述 |
|---------|------|
| 闭包传递 | 计算有向图的传递闭包（Transitive Closure）|
| 公交/航班网络 | 查询任意两城市之间的最短旅行路线 |
| 社交网络分析 | 全源最短路径用于计算紧密度中心性（Closeness Centrality）|
| 基因序列分析 | 在基因编辑距离矩阵中寻找最相似序列对 |
| 最密子图检测 | 借助 APSP 信息求解 |

### 潜在风险与问题

- **V³ 的时间复杂度**：当 V > 1000 时不可接受。即使 V=500，也需要 1.25 亿次迭代
- **空间消耗 O(V²)**：V=10000 时，距离矩阵需要 100M 个元素（~800MB）
- **无法处理负权环**：检测到负权环后距离无意义
- **稠密矩阵限制**：即使图是稀疏的，Floyd-Warshall 仍然使用稠密的 V×V 矩阵

### 优化策略

- **CPU 缓存友好**：调整循环顺序为 `k → i → j`（而非 `i → k → j`）以利用 CPU 缓存
- **SIMD 向量化**：对最内层循环使用向量化指令批量处理
- **分块 Floyd**：将矩阵分块处理，在内存受限时减少缓存失效
- **替代方案**：对于稀疏图，Johnson 算法（运行一次 Bellman-Ford + V 次 Dijkstra）更高效
- **使用 NumPy**：Python 实现中可用 NumPy 加速矩阵运算（虽然代码不再"纯算法"）

---

## 11.5 最短路径问题变形

标准的最短路径问题有许多实际需要的变体。本节介绍几种常见变形。

### 多源最短路径（Multi-Source Shortest Path）

**问题**：给定多个源点，求任意源点到所有其他顶点的最短距离。

**解法**：将所有源点同时加入优先队列（或 BFS 队列），距离为 0，然后运行标准算法。

```python
def multi_source_dijkstra(graph: Dict[str, List[Tuple[str, int]]],
                           sources: List[str]) -> Tuple[Dict[str, int], Dict[str, Optional[str]]]:
    """
    多源 Dijkstra：将所有源点初始距离设为 0 同时入队。
    """
    dist = {v: float('inf') for v in graph}
    prev = {v: None for v in graph}
    pq = []
    
    for s in sources:
        dist[s] = 0
        heapq.heappush(pq, (0, s))
    
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                prev[v] = u
                heapq.heappush(pq, (d + w, v))
    
    return dist, prev
```

**应用**：消防站选址——找到离最近消防站距离最远的建筑物。

### 双向 Dijkstra（Bidirectional Dijkstra）

**问题**：求单对（Point-to-Point）最短路径，需要比标准 Dijkstra 更快。

**解法**：从起点和终点同时向前/向后 Dijkstra 搜索，当两个方向的搜索相遇时终止。

```
标准 Dijkstra 搜索范围（圆形扩散）：
        ███████████████
      ██               ██
    ██      ○ 搜索      ██
   ██       █████       ██
  ██      ████████      ██
  ██     ██████████     ██      ← 搜索区域 ≈ πR²
  ██      ████████      ██
   ██       █████       ██
    ██      ○ 搜索      ██
      ██               ██
        ███████████████

双向搜索范围（两个半圆）：
       ██████
     ██      ██
    ██   ↑   ██
   ██   /|\  ██
  ██   / s \ ██
  ██   相遇   ██     ← 搜索区域 ≈ 2 × π(R/2)² = πR²/2
  ██   \ t / ██
   ██   \|/  ██
    ██   ↓   ██
     ██      ██
       ██████

搜索区域减少约 50%！
```

**实现要点**：
- 前向搜索使用正向边，后向搜索使用反向边
- 当某个顶点被两个方向都访问到时，记录相遇点
- 终止条件需要谨慎：两个方向的最小距离之和>当前最佳距离

**应用**：地图服务中的实时路径规划（Google Maps、高德）。

### A* 算法简介

**问题**：在已知目标位置时，如何更快地找到最短路径？

**解法**：A* 在 Dijkstra 的基础上加入启发式函数（Heuristic Function）`h(v)`，估算从 v 到目标 t 的代价。优先级变为 `f(v) = g(v) + h(v)`，其中 `g(v)` 是起点到 v 的实际距离。

**启发式函数的条件**：

- **可采纳性（Admissible）**：`h(v)` 不会高估到目标的实际代价 → 保证找到最优解
- **单调性（Consistent / Monotonic）**：`h(u) ≤ w(u,v) + h(v)` → 每个顶点只需处理一次

**常见启发式函数**：

| 图类型 | 启发式函数 |
|--------|-----------|
| 网格（四方向） | 曼哈顿距离 \|dx\| + \|dy\| |
| 网格（八方向） | 切比雪夫距离 max(\|dx\|, \|dy\|) |
| 几何图 | 欧几里得距离 √(dx² + dy²) |
| 路网 | 直线距离（大圆距离）|

**Dijkstra vs A\* 对比**：

```
Dijkstra（无方向性）:
   ○ ○ ○ ○ ○ ○ ○
   ○ ○ ○ ○ ○ ○ ○
   ○ ○ ○ s ○ ○ ○
   ○ ○ ○ ○ ○ ○ ○
   ○ ○ ○ ○ ○ t ○   ← 向所有方向均匀扩散
   ○ ○ ○ ○ ○ ○ ○

A*（有方向性）:
         ○ ○ ○ ○
           ○ ○ ○
             s ○
               ○
               t     ← 优先级引导搜索朝向目标
```

### 路径重建通用方法

无论使用哪种算法，路径重建都是通过**前驱数组** `prev` 回溯：

```python
def reconstruct_path(prev: Dict[str, Optional[str]], target: str) -> List[str]:
    path = []
    v = target
    while v is not None:
        path.append(v)
        v = prev[v]
    path.reverse()
    return path
```

### 最短路径算法选型总结

| 算法 | 单源/全源 | 负权边 | 负权环检测 | 时间复杂度 |
|------|----------|--------|-----------|-----------|
| BFS | 单源（无权） | N/A | N/A | O(V + E) |
| Dijkstra（堆）| 单源 | ❌ 不支持 | ❌ | O(E log V) |
| Bellman-Ford | 单源 | ✅ | ✅ | O(V·E) |
| SPFA | 单源 | ✅ | ✅ | 平均 O(E)，最坏 O(V·E) |
| Floyd-Warshall | 全源 | ✅ | ✅ | O(V³) |
| Johnson | 全源 | ✅ | ✅ | O(V·E + V² log V) |

**选型决策流程**：

```
需要最短路径？
├→ 单源（SSSP）？
│   ├→ 无权图 → BFS
│   ├→ 权值非负 → Dijkstra（堆）
│   └→ 可能有负权边 → SPFA 或 Bellman-Ford
└→ 全源（APSP）？
    ├→ V ≤ 500 → Floyd-Warshall（O(V³)，实现简单）
    └→ V > 500 → Johnson（稀疏图）或 V 次 Dijkstra（稠密图，非负权）
```

---

## 小结

| 概念 | 要点 |
|------|------|
| **松弛操作** | `dist[v] = min(dist[v], dist[u] + w(u,v))`—所有最短路径算法的核心 |
| **Dijkstra** | 贪心 + 优先队列，O(E log V)，要求非负权边 |
| **Bellman-Ford** | DP 逐轮松弛所有边，O(VE)，支持负权边和负权环检测 |
| **SPFA** | 队列优化版 Bellman-Ford，平均 O(E)，最坏 O(VE) |
| **Floyd-Warshall** | DP 全源最短路径，O(V³)，适用于中小规模图 |
| **负权环** | 可无限缩短路径，使最短距离无意义，需单独检测 |
| **双向搜索** | 路径搜索加速技巧，搜索空间减半 |
| **A\*** | Dijkstra + 启发式函数，地图寻路的实际标准 |

**配套代码**：

| 文件 | 说明 |
|------|------|
| `demos/ch11/demo_dijkstra.py` | Dijkstra 堆实现，含完整路径重建 |
| `demos/ch11/demo_bellman_ford.py` | Bellman-Ford 负权环检测，含正/负权测试 |
| `demos/ch11/demo_floyd_warshall.py` | Floyd-Warshall 全源最短路径，含路径重建 |

---

> **下一章预告**：第 12 章将进入**网络流与匹配**——最大流算法（Ford-Fulkerson、Dinic）、最小割定理、二分图匹配和费用流问题，这些是图论中最具工程价值的应用方向。