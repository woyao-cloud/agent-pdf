# 第12章 图算法——网络流与匹配

> "网络流理论将图论与线性规划完美结合——从运输调度到图像分割，从二分匹配到最优分配，网络流算法在最优化世界中占据着核心地位。"

---

## 12.1 最大流问题

**流网络（Flow Network）** 是一个有向图 $G = (V, E)$，其中每条边 $(u, v)$ 有一个**容量（Capacity）** $c(u, v) \ge 0$。两个特殊顶点：**源点（Source）** $s$ 和 **汇点（Sink）** $t$。流是一个函数 $f: V \times V \to \mathbb{R}$，满足：

- **容量约束（Capacity Constraint）：** $0 \le f(u, v) \le c(u, v)$
- **流量守恒（Flow Conservation）：** 对所有中间顶点 $u \neq s, t$，有 $\sum_{v} f(v, u) = \sum_{v} f(u, v)$，即流入 = 流出

**最大流问题**的目标：在满足约束的前提下，最大化从 $s$ 到 $t$ 的总流量 $|f| = \sum_{v} f(s, v) = \sum_{v} f(v, t)$。

### 12.1.1 Ford-Fulkerson方法

Ford-Fulkerson方法的核心思想是沿着**增广路径（Augmenting Path）** 反复推送流量，直到无法找到从 $s$ 到 $t$ 的增广路径。

**残余网络（Residual Graph）：** 对于每条原始边 $(u, v)$，定义：

- **正向残余容量：** $c_f(u, v) = c(u, v) - f(u, v)$，表示还能额外发送的流量
- **反向残余容量：** $c_f(v, u) = f(u, v)$，表示可以撤销的流量

当 $c_f(u, v) > 0$ 时，在残余网络中存在边 $(u, v)$。

```
Ford-Fulkerson(s, t):
    初始化所有 f(u, v) = 0
    while (残余网络中从 s 到 t 存在增广路径 P):
        计算 P 的瓶颈容量 bottleneck = min{c_f(u, v) : (u, v) ∈ P}
        for (P 中的每条边 (u, v)):
            f(u, v) += bottleneck
            f(v, u) -= bottleneck
    return f
```

**时间复杂度**取决于寻找增广路径的算法。如果容量是整数，复杂度为 $O(E \cdot |f^*|)$，其中 $|f^*|$ 是最大流值。非整数容量或整数容量较大时可能很低效。

### 12.1.2 Edmonds-Karp算法

Edmonds-Karp是Ford-Fulkerson的BFS变体，每次用**广度优先搜索**寻找边数最少的增广路径。

```java
int edmondsKarp(int s, int t) {
    int flow = 0;
    int[] parent;
    while ((parent = bfs(s, t)) != null) {
        // 计算瓶颈容量
        int v = t, bottleneck = INF;
        while (v != s) {
            int u = parent[v];
            bottleneck = Math.min(bottleneck, cap[u][v] - flow[u][v]);
            v = u;
        }
        // 沿路径增广
        v = t;
        while (v != s) {
            int u = parent[v];
            flow[u][v] += bottleneck;
            flow[v][u] -= bottleneck;
            v = u;
        }
        totalFlow += bottleneck;
    }
    return totalFlow;
}
```

**时间复杂度：** $O(V \cdot E^2)$。BFS保证每次找到的增广路径边数最短，每条边最多被增广 $O(V)$ 次，增广总次数 $O(V \cdot E)$，每次BFS耗时 $O(E)$。

### 12.1.3 Dinic算法

Dinic算法引入**分层图（Level Graph）** 和**阻塞流（Blocking Flow）** 的概念，比Edmonds-Karp更高效：

1. **构建分层图（BFS）：** 在残余网络中计算每个顶点到 $s$ 的距离（边数），只保留通向下一层的边
2. **寻找阻塞流（DFS）：** 在分层图中一次DFS尝试找到多条增广路径，直到阻塞流形成
3. **重复：** 直到 $t$ 不再可达

```
Dinic(s, t):
    flow = 0
    while (BFS构建分层图，t可达):
        在分层图中DFS寻找阻塞流
        将阻塞流的流量加入总流量
    return flow
```

```java
boolean bfs(int s, int t) {
    Arrays.fill(level, -1);
    Queue<Integer> q = new LinkedList<>();
    level[s] = 0;
    q.offer(s);
    while (!q.isEmpty()) {
        int u = q.poll();
        for (Edge e : graph[u]) {
            if (e.cap > 0 && level[e.to] < 0) {
                level[e.to] = level[u] + 1;
                q.offer(e.to);
            }
        }
    }
    return level[t] >= 0;
}

int dfs(int u, int t, int f) {
    if (u == t) return f;
    for (int i = it[u]; i < graph[u].size(); i++) {
        it[u] = i;
        Edge e = graph[u].get(i);
        if (e.cap > 0 && level[u] + 1 == level[e.to]) {
            int d = dfs(e.to, t, Math.min(f, e.cap));
            if (d > 0) {
                e.cap -= d;
                graph[e.to].get(e.rev).cap += d;
                return d;
            }
        }
    }
    return 0;
}
```

**时间复杂度：** $O(V^2 \cdot E)$。对于**单位容量图**（Unit Capacity Network）可达到 $O(E \sqrt{V})$。

### 算法对比

| 算法 | 单次增广 | 增广次数 | 总复杂度 |
|------|---------|---------|---------|
| Ford-Fulkerson (DFS) | $O(E)$ | $O(|f^*|)$ | $O(E \cdot |f^*|)$ |
| Edmonds-Karp (BFS) | $O(E)$ | $O(V \cdot E)$ | $O(V \cdot E^2)$ |
| Dinic | $O(V \cdot E)$ (阻塞流) | $O(V)$ | $O(V^2 \cdot E)$ |

---

## 12.2 最小割与最大流最小割定理

### 12.2.1 s-t割定义

**s-t割（Cut）** 是将顶点集 $V$ 划分为两个子集 $S$ 和 $T = V \setminus S$ 的分割，满足 $s \in S$ 且 $t \in T$。

**割的容量（Capacity of Cut）：** 从 $S$ 指向 $T$ 的所有边的容量之和：
$$c(S, T) = \sum_{u \in S, v \in T} c(u, v)$$

**最小割问题：** 找到容量最小的 s-t 割。

### 12.2.2 最大流最小割定理

**最大流最小割定理（Max-Flow Min-Cut Theorem）：** 在任何流网络中，最大流的值等于最小割的容量。

$$|f^*| = \min\{c(S, T) : s \in S, t \in T\}$$

**证明概要：**

1. 对任意可行流 $f$ 和任意割 $(S, T)$，有 $|f| \le c(S, T)$ —— 流的净值不能超过割的容量
2. 当算法终止时，残余图中 $s$ 可达的顶点集合 $S^*$ 定义了一个割 $(S^*, T^*)$
3. 此时所有从 $S^*$ 到 $T^*$ 的原边已饱和（$f = c$），从 $T^*$ 到 $S^*$ 的反向边流量为0
4. 因此 $|f| = c(S^*, T^*)$，结合(1)可知这是最大值

**求解最小割：** 运行最大流算法后，在残余网络中从 $s$ 做BFS/DFS，所有能到达的顶点构成 $S$，其余顶点构成 $T$。从 $S$ 指向 $T$ 的原边即为最小割的边集。

### 12.2.3 应用：图像分割

**图割（Graph Cuts）** 是计算机视觉中图像分割的重要方法：

- 每个像素是一个顶点
- 源点 $s$ 代表"前景"，汇点 $t$ 代表"背景"
- 边的容量表示像素间的"不连续性"（边缘强度）
- 最小割将图像分割为前景区域 $S$ 和背景区域 $T$

### 12.2.4 应用：网络可靠性

- 最小割的容量代表网络中最薄弱的环节
- 要切断 $s$ 和 $t$ 间的所有路径，至少需要移除的边容量 = 最大流值
- 边连通度 = 节点间最大不相交路径数 = 边容量均为1时的最大流值

---

## 12.3 二分图匹配

### 12.3.1 二分图与匹配

**二分图（Bipartite Graph）：** 顶点集可划分为两个不相交集合 $U$ 和 $V$，且所有边都连接 $U$ 和 $V$ 中的顶点。

**匹配（Matching）：** 一组没有公共顶点的边集。

**最大匹配（Maximum Matching）：** 包含最多边数的匹配。

### 12.3.2 二分图最大匹配——最大流规约

将二分图最大匹配转化为最大流问题：

1. 添加**超级源点 $s$**，连接到所有左部顶点，容量为1
2. 添加**超级汇点 $t$**，所有右部顶点连接到 $t$，容量为1
3. 原二分图中的边方向为左 $\to$ 右，容量为1
4. 最大流的值 = 最大匹配的边数

由于所有容量为1，Dinic算法复杂度为 $O(E \sqrt{V})$。

```java
// 二分图最大匹配 —— 规约为最大流
int maxMatching() {
    buildFlowNetwork(); // 添加 s, t 及容量为1的边
    return dinic(s, t); // 最大流值 = 最大匹配数
}
```

### 12.3.3 交替路径与增广路径

在二分图中也可以直接使用DFS寻找增广路径（匈牙利算法的核心）：

- **交替路径（Alternating Path）：** 从某个未匹配顶点出发，交替经过未匹配边和匹配边的路径
- **增广路径（Augmenting Path）：** 起点和终点都是未匹配顶点的交替路径
- 翻转增广路径上的边（未匹配 $\to$ 匹配，匹配 $\to$ 未匹配）可使匹配数+1

```
匈牙利算法（DFS版）:
    for (左部每个未匹配顶点 u):
        清空 visited 标记
        if (dfs(u)): 匹配数++
    
    dfs(u):
        for (u 的每个邻居 v):
            if (!visited[v]):
                visited[v] = true
                if (v 未匹配 或 dfs(match[v])):
                    match[u] = v
                    match[v] = u
                    return true
        return false
```

**时间复杂度：** $O(V \cdot E)$，其中 $V$ 是左部顶点数。

### 12.3.4 匈牙利算法——指派问题

**指派问题（Assignment Problem）：** 在加权完全二分图中，找到**最小权完美匹配**。$n$ 个工人分配 $n$ 个任务，每个工人完成每个任务有不同成本，求总成本最小的分配方案。

匈牙利算法（也称KM算法）使用顶标（Labeling）和相等子图的概念：

```
匈牙利算法（最小权指派）:
    初始化顶标: l[u] = min{w(u,v)}, l[v] = 0
    构建相等子图: 只保留满足 l[u] + l[v] = w(u,v) 的边
    for (每个左部顶点 u):
        while (u 未匹配):
            在相等子图中找增广路径
            if (找不到):
                修改顶标以引入新边
```

**时间复杂度：** $O(n^3)$。

---

## 12.4 费用流问题

### 12.4.1 最小费用最大流

**最小费用最大流（Min-Cost Max-Flow）：** 在每条边增加**费用（Cost）** $a(u, v)$，寻找总费用最小的最大流。

每条边 $(u, v)$ 有三个属性：
- **容量 $c(u, v)$**：最大通过流量
- **费用 $a(u, v)$**：每单位流量的成本
- **流量 $f(u, v)$**：当前流量

目标：在发送流量 $F$ 的前提下，最小化 $\sum_{(u,v) \in E} a(u, v) \cdot f(u, v)$。

### 12.4.2 连续最短增广路径算法

**核心思想：** 每次在残余网络中寻找从 $s$ 到 $t$ 的**费用最短路径**，然后尽可能多地增广流量。

- 残余边 $(u, v)$ 的费用：
  - 正向残余边：费用为 $a(u, v)$（原费用）
  - 反向残余边：费用为 $-a(u, v)$（撤销费用）

**使用Bellman-Ford：**
```
SSP(s, t, targetFlow):
    flow = 0, cost = 0
    while (flow < targetFlow):
        用 Bellman-Ford 找 s -> t 的最短费用路径 dist[]
        if (dist[t] == INF): break  // 无法达到目标流量
        沿路径增广 bottleneck 流量
        flow += bottleneck
        cost += bottleneck * dist[t]
    return (flow, cost)
```

时间复杂度：$O(F \cdot V \cdot E)$（$F$ 为增广次数）。

**使用势能（Potentials）+ Dijkstra 优化：**

引入势能 $\pi(v)$ 使所有边的**约简费用（Reduced Cost）** 非负：

$$a_\pi(u, v) = a(u, v) + \pi(u) - \pi(v)$$

第一次使用Bellman-Ford计算初始势能，之后每次增广后用Dijkstra计算最短路，并更新势能。约简费用非负保证Dijkstra正确。

```
SSP with Potentials:
    Bellman-Ford 计算初始势能 π
    while (flow < targetFlow):
        用 Dijkstra（基于约简费用）找最短路
        沿路径增广
        更新势能: π[v] += dist[v]
```

**时间复杂度：** $O(F \cdot (E \log V))$，其中 $F$ 为增广次数。

### 12.4.3 应用

- **最小成本运输：** 工厂到仓库的运输问题，每条运输路线有容量限制和单位运输成本
- **任务分配：** 与指派问题等价，但允许某些工人不分配任务
- **网络设计：** 在满足流量需求的前提下最小化运营成本

```java
// SSP with potentials 核心骨架
int minCostMaxFlow(int s, int t, int targetFlow) {
    int flow = 0, cost = 0;
    int[] pot = new int[V];
    // 初始势能用 Bellman-Ford（或 SPFA）
    bellmanFord(s, pot);
    
    while (flow < targetFlow) {
        int[] dist = new int[V];
        int[] prev = new int[V];
        dijkstra(s, dist, prev, pot); // 基于约简费用
        
        if (dist[t] == INF) break;
        
        // 更新势能
        for (int v = 0; v < V; v++)
            if (dist[v] < INF) pot[v] += dist[v];
        
        // 计算瓶颈并增广
        int add = targetFlow - flow;
        for (int v = t; v != s; v = prevEdge[v].from)
            add = Math.min(add, capacity[prevEdge[v]]);
        
        for (int v = t; v != s; v = prevEdge[v].from) {
            flowOnEdge[prevEdge[v]] += add;
            // 更新残余容量
        }
        flow += add;
        cost += add * pot[t];
    }
    return cost;
}
```

---

## 本章总结

| 概念 | 核心算法 | 时间复杂度 | 典型应用 |
|------|---------|-----------|---------|
| 最大流 | Dinic | $O(V^2E)$ | 网络流量规划 |
| 最小割 | 最大流后BFS | 同最大流 | 图像分割 |
| 二分最大匹配 | 匈牙利/Dinic | $O(VE) / O(E\sqrt{V})$ | 任务分配 |
| 费用流 | SSP + 势能 | $O(F \cdot E\log V)$ | 最优运输 |

网络流算法的统一思想是**在残余网络中反复寻找增广路径**，区别仅在于寻找策略（DFS/BFS/分层/最短路）。最大流最小割定理提供了流与割之间的深刻对偶关系，而费用流在此基础上引入了优化的维度。