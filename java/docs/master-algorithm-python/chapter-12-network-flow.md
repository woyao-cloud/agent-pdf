# 第12章 图算法 - 网络流与匹配

> **核心问题**：给定一个有容量限制的流网络，如何从源点（Source）到汇点（Sink）输送最多的流量？如何找到图的最大匹配？

网络流（Network Flow）是图论中极具实用价值的分支，它将运输、分配、匹配等实际问题抽象为有容量限制的图中的流（Flow）。本章将系统介绍最大流问题、最小割理论、二分图匹配和费用流问题。

---

## 12.1 最大流问题（Ford-Fulkerson、Dinic）

### 解决的问题

**最大流问题（Maximum Flow Problem）**：给定一个有向图 G = (V, E)，每条边 (u, v) 有一个非负容量 c(u, v)。指定源点 s 和汇点 t，求从 s 到 t 的最大可行流量。

| 应用领域 | 问题建模 |
|---------|---------|
| 网络带宽 | 链路容量为边容量，求最大端到端吞吐量 |
| 交通流量 | 道路通行能力为容量，求最大车流量 |
| 排水系统 | 管道容量为边容量，求最大排水量 |
| 任务分配 | 将任务-工人关系建模为流网络 |

### 实现原理

#### Ford-Fulkerson 算法

Ford-Fulkerson 的核心思想是：只要存在从 s 到 t 的**增广路径（Augmenting Path）**（在残余网络中），就沿该路径推送流量，直到不存在任何增广路径为止。

**残余网络（Residual Network）**：对于每条边 (u, v)，记录两个值：
- 正向残余容量：`c(u, v) - f(u, v)`（还能发送多少）
- 反向残余容量：`f(u, v)`（能撤销多少回流）

```
初始状态：
  s ──[16]──→ a ──[12]──→ t
  │           ↑
  └─[13]──→ b ──[14]──┘

沿 s→a→t 推送 12 后：
  s ──[4]──→ a ──[0]──→ t
  │          ↑      ↓[12]
  └─[13]──→ b ──[14]──┘
  (反向边 s←a 增加容量 12，a←t 增加容量 12)
```

**伪代码**：
```
for each edge (u, v):
    f(u, v) = 0
while there is a path p from s to t in residual network:
    c_f(p) = min residual capacity on p
    for each edge (u, v) on p:
        f(u, v) += c_f(p)
        f(v, u) -= c_f(p)
return f
```

**复杂度**：O(E × |f*|)，其中 |f*| 是最大流的值。这意味着如果容量值很大或为无理数，算法可能很慢甚至永不终止。

#### Dinic 算法

Dinic 通过引入**分层图（Level Graph）**和**阻塞流（Blocking Flow）**两个概念，大幅提升了效率。

```
BFS 建分层图 → DFS 找阻塞流 → 重复直到汇点不可达

分层图（Level Graph）：
   level 0       level 1       level 2       level 3
     s ────────→ a ────────→ b ────────→ t
     │           │           │
     └──────────→ c ────────→ d ────────→ t
```

| 步骤 | BFS 分层 | DFS 推送 |
|------|---------|---------|
| Phase 1 | 计算 dist[s..t] | 沿 level+1 的边推送尽可能多流量 |
| Phase 2 | 重新分层（如果 t 可达） | 继续推送阻塞流 |
| 终止 | t 不可达 | — |

**Dinic 的复杂度**：O(V²E)。对于单位容量的二分图，可优化到 O(E√V)。

### 代码实现

参见 `demos/ch12/demo_max_flow.py`，包含以下实现：

1. **Ford-Fulkerson（DFS 版本）**：每次 DFS 找一条增广路径，推送路径上的最小残余容量。
2. **Dinic**：BFS 构建层次图，DFS 在多条路径上同时推送阻塞流，支持当前弧优化（Current Arc Optimization）。

关键差异对比：

| 维度 | Ford-Fulkerson | Dinic |
|------|---------------|-------|
| 寻找路径 | DFS（每次一条） | 分层图 + DFS（多路阻塞流） |
| 时间复杂度 | O(E × f) | O(V²E) |
| 依赖容量值 | 是（影响迭代次数） | 否 |
| 适用场景 | 小规模、容量小 | 大规模通用 |

### 使用场景

- **网络带宽规划**：计算链路最大吞吐量，识别瓶颈
- **二分图匹配**：最大流的一种特例（12.3 节详述）
- **项目选择问题**：最大权闭合子图转换为最小割
- **图像分割**：Graph Cut 算法将像素分割建模为最小割问题

### 潜在风险与问题

1. **Ford-Fulkerson 的病理情况**：当容量为无理数时 DFS 可能永不终止；即使为整数，若 |f*| 巨大，迭代次数也巨大。
2. **整数容量保证整数流**：所有边容量为整数时，Ford-Fulkerson 和 Dinic 都保证输出整数最大流。
3. **实际边的反向容量**：实现时需要在图中同时存储正向边和反向边，通常用成对存储（add_edge 同时添加正向和反向边）。

### 优化策略

- **当前弧优化（Current Arc Optimization）**：Dinic 的 DFS 中，记录每个节点当前处理到了哪条邻边，避免重复扫描已满的边。
- **容量缩放（Capacity Scaling）**：从高位到低位逐位推进，减少迭代次数。
- **ISAP（Improved Shortest Augmenting Path）**：只 BFS 一次，动态维护距离标号，常用于竞赛编程。

---

## 12.2 最小割与最大流最小割定理

### 解决的问题

**最小割（Minimum Cut / Min-Cut）**：将图 G 的顶点集 V 划分为两个集合 S 和 T = V \ S，满足 s ∈ S, t ∈ T。**割的容量**定义为从 S 到 T 的所有边的容量之和。最小割就是找到容量最小的这样的划分。

### 实现原理

**最大流最小割定理（Max-Flow Min-Cut Theorem）**：在任何流网络中，最大流的值等于最小割的容量。

```
                  割 (S, T)
    S ←──────────→ T
    s ∈ S          t ∈ T
    ┌──────┐      ┌──────┐
    │  a   │── 4 →│  b   │
    │      │── 2 →│      │
    │  c   │←─────│  d   │
    └──────┘      └──────┘
    割容量 = 4 + 2 = 6
```

**定理的直观理解**：任何从 s 到 t 的流都必须穿过 S 到 T 的边界，因此流的值不可能超过任意割的容量。最大流能够"填满"最小割中的每一条边，使最小割成为瓶颈。

**证明思路**：
1. 任意流 f 的值 ≤ 任意割 (S, T) 的容量（弱对偶性）
2. 对于最大流 f*，在残余网络中 s 不可达 t，令 S = 从 s 在残余网络中可达的顶点集，则 (S, V\S) 是一个割
3. 该割的容量 = |f*|（强对偶性）
4. 因此 |f*| = 最小割容量

### 代码实现

基于最大流算法求最小割：

```python
def min_cut(graph, s, t):
    # 1. 先求最大流
    max_flow, residual = dinic(graph, s, t)
    # 2. BFS/DFS 从 s 出发，只走残余容量 > 0 的边
    reachable = bfs_in_residual(residual, s)
    # 3. 最小割边：所有从 reachable 到 unreachable 的原边
    cut_edges = []
    for u in reachable:
        for v, cap in original_edges(u):
            if v not in reachable:
                cut_edges.append((u, v, cap))
    return max_flow, cut_edges
```

### 使用场景

| 问题类型 | 建模方法 |
|---------|---------|
| 图像分割 | 像素为顶点，相邻相似度为边容量，前景/背景为源/汇 |
| 项目选择 | 收益为正连源，成本为负连汇，依赖关系为无穷容量边 |
| 网络可靠性 | 最小割的边数/容量表示破坏网络连通的最小代价 |
| 社交网络 | 社区发现可建模为最小割问题 |

### 优化策略

- **全局最小割（Stoer-Wagner 算法）**：不要求指定 s, t，O(V³) 求全局最小割
- **边连通度** = 全局最小割的容量
- **点连通度**：通过点拆分（Vertex Splitting）转换为边割

---

## 12.3 二分图匹配

### 解决的问题

**二分图匹配（Bipartite Matching）**：给定二分图 G = (U ∪ V, E)，U 和 V 是两个不相交的顶点集，边只连接 U 和 V。求最大的边集 M ⊆ E，使得 M 中的任意两条边都没有公共顶点。

| 应用领域 | 建模方式 |
|---------|---------|
| 工作分配 | 工人 U ↔ 任务 V，工人能胜任的任务连边 |
| 在线约会 | 左集 ↔ 右集，相互感兴趣的连边 |
| 课程安排 | 教师 ↔ 时间段 |
| 配对问题 | 任意需要两两配对的场景 |

### 实现原理

#### 增广路径算法（匈牙利算法）

**交替路径（Alternating Path）**：从一条未匹配的边开始，依次经过未匹配边→匹配边→未匹配边→…
**增广路径（Augmenting Path）**：起点和终点都是未匹配顶点的交替路径。将增广路径上的边"翻转"（匹配变未匹配，未匹配变匹配）可使匹配大小 +1。

**核心定理**：一个匹配是最大匹配 ⇔ 不存在增广路径。

```
初始匹配：{(1-a)}
  U:  ①   ②   ③
      │
  V:  a    b    c

查找增广路径：从②出发，沿 ②—b (未匹配) → b—① 不存在
从③出发：③—c (未匹配) → c 未匹配 ✓ → 增广路径 [③—c]
翻转后匹配大小 = 2
```

#### 二分图匹配 → 最大流

在二分图基础上添加源点 s（连向 U 所有顶点，容量 1）和汇点 t（V 所有顶点连向 t，容量 1），每条原边容量为 1，则最大流 = 最大匹配。

```
     ┌─→ u1 ──→ v1 ──┐
s ───│─→ u2 ──→ v2 ──│──→ t
     └─→ u3 ──→ v3 ──┘
  容量 1     容量 1    容量 1
```

### 代码实现

参见 `demos/ch12/demo_bipartite_matching.py`，包含：

1. **DFS 增广路径**：对每个左集顶点执行 DFS 寻找增广路径
2. **时间复杂度**：O(V × E) = O(VE)
3. **与最大流的等价性**：通过最大流也可求解，但匈牙利算法更直接

### 使用场景

- **任务分配**：n 个工人，m 个任务，每个工人只能做一个任务，求最大任务完成数
- **棋盘放置**：棋盘上放互不攻击的车/马
- **最少路径覆盖**：DAG 拆点后求最大匹配

### 优化策略

- **Hopcroft-Karp 算法**：使用 BFS 构建层级图 + 多路增广，O(E√V)
- **带权匹配（Kuhn-Munkres，即 KM 算法）**：边有权重时求最大/最小权完美匹配
- **Hall 定理**：判断是否存在完美匹配的理论工具

---

## 12.4 费用流问题

### 解决的问题

**最小费用最大流（Minimum Cost Maximum Flow）**：在最大流问题的基础上，每条边增加一个费用 w(u, v)（单位流量费用）。在保证流量最大的前提下，求总费用最小的流。

| 应用领域 | 建模方式 |
|---------|---------|
| 运输调度 | 每单位货物的运输成本，总运输量最大时总成本最小 |
| 租赁分配 | 每个工人完成不同任务的成本不同 |
| 网络路由 | 每条链路有单位传输成本 |
| 供应链 | 工厂→仓库→客户，每段有单位成本 |

### 实现原理

#### 连续最短增广路算法（SSP, Successive Shortest Augmenting Path）

核心思想：每次在残余网络中找从 s 到 t 的**最短路径**（以边费用为单位长度），沿该路径推送尽可能多的流量，重复直到不存在增广路径。

**为什么是"最短"？**：将费用视为路径长度，每次找最便宜的路径推送流量，可以保证最终的总费用最小。

```
初始：
  s ──(cap=10, cost=2)──→ a ──(cap=5, cost=3)──→ t
  │                                              ↑
  └──(cap=15, cost=1)──→ b ──(cap=10, cost=4)──┘

第一次迭代：s→b→t 费用 = 1+4 = 5（最短路）
第二次迭代：s→a→t 费用 = 2+3 = 5
第三次迭代：s→b→t 费用 = 1+4 = 5（推送更少流量）
```

**如何处理反向边的费用**：推送流量后，反向边费用为 -w(u, v)（撤销流意味着退还费用），因此残余网络中可能出现负权边。

**处理负权边的方法**：
1. **初始势能（Potential / Johnson's Trick）**：第一次用 Bellman-Ford 算最短路（处理负权），后续每次用 Dijkstra + 势能函数
2. **全程 Bellman-Ford / SPFA**：对于小规模图直接可用 SPFA

**伪代码（SSP）**：
```
f = 0, cost = 0
while True:
    dist, prev = shortest_path(residual, s, t)
    if dist[t] == INF: break
    augment_flow = min residual on path
    f += augment_flow
    cost += augment_flow * dist[t]
    update residual network
return f, cost
```

**复杂度**：O(F × E log V)（F 为最大流值，每次增广至少 1 单位）

### 代码实现

```python
def min_cost_max_flow(graph, s, t):
    n = len(graph)
    flow = 0
    cost = 0
    potential = [0] * n  # 势能函数

    while True:
        dist = [float('inf')] * n
        prev = [-1] * n
        dist[s] = 0

        # SPFA / Bellman-Ford 或 Dijkstra + potential
        pq = [(0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if d != dist[u]:
                continue
            for v, cap, w in graph[u]:
                if cap > 0 and dist[v] > d + w + potential[u] - potential[v]:
                    dist[v] = d + w + potential[u] - potential[v]
                    prev[v] = (u, w)
                    heapq.heappush(pq, (dist[v], v))

        if dist[t] == float('inf'):
            break

        for v in range(n):
            if dist[v] < float('inf'):
                potential[v] += dist[v]

        # 找增广流量
        add = float('inf')
        v = t
        while v != s:
            u, w = prev[v]
            for e in graph[u]:
                if e[0] == v and e[1] > 0:
                    add = min(add, e[1])
                    break
            v = u

        # 推送
        v = t
        while v != s:
            u, w = prev[v]
            for e in graph[u]:
                if e[0] == v:
                    e[1] -= add
                    break
            for e in graph[v]:
                if e[0] == u:
                    e[1] += add
                    break
            v = u

        flow += add
        cost += add * potential[t]

    return flow, cost
```

### 使用场景

| 场景 | 建模 |
|------|------|
| 最小费用运输 | 多源多汇运输问题，每个供给/需求节点的平衡约束 |
| 二分图最优匹配 | 费用流版本可处理非完全图和不等规模匹配 |
| 最大利润流 | 费用取负数，求最大利润 |
| 调度问题 | 时间窗约束下的最低成本调度 |

### 潜在风险与问题

1. **Bellman-Ford vs Dijkstra**：有负权边时必须用 Bellman-Ford（或势能优化的 Dijkstra）。不处理负权会得到错误结果。
2. **SSP 的复杂度与流值成正比**：当容量大且增广慢时，需要容量缩放优化。
3. **费用流退化到最大流**：将所有边费用设为 0，等价于最大流问题

### 优化策略

- **Capacity Scaling 费用流**：按容量大小分组增广，减少迭代次数
- **Primal-Dual 算法**：与 SSP 本质相同，但用势能始终保持非负边权
- **zkw 费用流**：直接在残余网络上多路增广（类似 Dinic 对费用流的推广），适合稠密图

---

## 总结对比

| 算法 | 时间复杂度 | 核心思想 | 适用场景 |
|------|-----------|---------|---------|
| Ford-Fulkerson | O(E × maxflow) | DFS 单路增广 | 小规模、教学演示 |
| Dinic | O(V²E) | 分层图 + 阻塞流 | 通用最大流 |
| 匈牙利算法（二分图匹配） | O(VE) | DFS 增广路径 | 二分图匹配 |
| Hopcroft-Karp | O(E√V) | BFS 多路增广 | 大规模二分图 |
| SSP（费用流） | O(F × E log V) | 最短路增广 | 通用费用流 |
| 势能优化 SSP | O(F × E log V) | Dijkstra + 势能 | 大规模费用流 |

网络流与匹配提供了一种强大的建模框架——许多看似不相关的组合优化问题，都可以转化为流网络模型求解。理解这些算法背后的图论直觉（增广、分层、最小割等概念）比死记代码实现更为根本。