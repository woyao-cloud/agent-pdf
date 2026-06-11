# 第14章 组合优化

> **核心问题**：当问题的搜索空间呈指数级增长，且精确求解在多项式时间内不可行（NP-难）时，我们该如何"聪明地"找到足够好的解？

组合优化（Combinatorial Optimization）研究如何在离散的、有限的数学结构中找到最优解。旅行商问题（TSP）、顶点覆盖（Vertex Cover）、背包问题（Knapsack）都属于这一类。本章讨论四类应对策略：贪心策略、近似算法、启发式算法和线性规划松弛。

---

## 14.1 贪心策略的组合优化

贪心算法在每一步都做出**当前最优**的选择，期望局部最优累积为全局最优。在组合优化中，贪心策略通常作为**近似解**的快速构造手段。

### 贪心在组合优化中的典型应用

| 问题 | 贪心策略 | 最优性保证 |
|------|---------|-----------|
| 活动选择（Activity Selection） | 按结束时间最早选 | 精确最优 |
| 哈夫曼编码（Huffman Coding） | 频率最低的两个合并 | 精确最优 |
| 最小生成树（MST）—— Prim | 每次选最近的未连接顶点 | 精确最优 |
| 最小生成树（MST）—— Kruskal | 每次选权重最小的不形成环的边 | 精确最优 |
| 集合覆盖（Set Cover） | 每次选覆盖最多未覆盖元素的集合 | 近似比 O(log n) |
| 0/1 背包（分数背包可行） | 按价值/重量比从大到小选 | 分数版本精确，0/1 版本无保证 |

### 示例：活动选择问题

```
活动按结束时间排序 → 贪婪选择结束最早且不冲突的 → 得到最多活动数
```

贪心在活动选择和 MST 中之所以有效，是因为这些问题的**拟阵（Matroid）**结构保证了局部最优即全局最优。

### 贪心的局限

当问题**不满足拟阵结构**时，贪心结果与最优解可能相去甚远。例如 0/1 背包问题，贪心按价值/重量比选择可能不是最优。

> **关键判断**：贪心是否可行，取决于问题是否具有**最优子结构**且贪心选择性质（Greedy Choice Property）成立。否则，贪心只能作为快速构造初始解的手段。

---

## 14.2 近似算法

近似算法（Approximation Algorithm）在多项式时间内给出一个**有理论保证**的近似解。它不追求精确最优，而是保证解的质量不超过最优解的某个倍数。

### 近似比（Approximation Ratio）

对于最小化问题，若算法总是输出解 `S`，且 `C(S) ≤ ρ · C(OPT)`，则称该算法有**近似比 ρ**（ρ ≥ 1）。对于最大化问题，标准是 `C(S) ≥ (1/ρ) · C(OPT)`。

其中 `OPT` 表示最优解的目标函数值。

### 顶点覆盖问题的 2-近似

**顶点覆盖（Vertex Cover）**：给定无向图 G=(V,E)，找最小的顶点集合，使得每条边至少有一个端点在这个集合中。

**近似算法（贪心匹配策略——2-近似）**：

```python
def vertex_cover_2approx(edges: List[Tuple[int, int]]) -> Set[int]:
    cover = set()
    uncovered = set(edges)
    while uncovered:
        u, v = uncovered.pop()
        cover.add(u)
        cover.add(v)
        uncovered = {(a, b) for (a, b) in uncovered
                     if a != u and a != v and b != u and b != v}
    return cover
```

**为什么是 2-近似？**：算法选择的每条边 (u,v) 至少有一个端点在最优解中——因为最优解必须覆盖这条边。算法每次选取两个顶点，而最优解每对至少选一个，所以 `|算法解| ≤ 2 · |最优解|`。

### 旅行商问题的近似

**度量 TSP（Metric TSP）**：满足三角不等式（Triangle Inequality）的 TSP 版本，即 `dist(A,C) ≤ dist(A,B) + dist(B,C)`。

**Christofides 算法——1.5-近似**：

1. 计算最小生成树（MST）
2. 找出 MST 中度为奇数的顶点，计算这些顶点的最小权重完美匹配（Minimum Weight Perfect Matching）
3. 合并 MST 和匹配边，得到欧拉图
4. 找欧拉回路，跳过重复顶点得到哈密顿回路

```python
import itertools

def christofides_tsp(dist_matrix: List[List[float]]) -> List[int]:
    """Christofides 算法求解度量 TSP（1.5-近似）"""
    n = len(dist_matrix)

    # 1. 计算 MST（Prim 算法）
    in_mst = [False] * n
    parent = [-1] * n
    key = [float('inf')] * n
    key[0] = 0
    for _ in range(n):
        u = min((i for i in range(n) if not in_mst[i]), key=lambda i: key[i])
        in_mst[u] = True
        for v in range(n):
            if not in_mst[v] and dist_matrix[u][v] < key[v]:
                key[v] = dist_matrix[u][v]
                parent[v] = u

    mst_edges = set()
    degree = [0] * n
    for v in range(1, n):
        u = parent[v]
        mst_edges.add((u, v))
        degree[u] += 1
        degree[v] += 1

    # 2. 找奇数度顶点
    odd_vertices = [i for i in range(n) if degree[i] % 2 == 1]

    # 3. 最小权重完美匹配（暴力枚举，仅适用于小规模）
    min_weight = float('inf')
    best_matching = []
    odd_set = set(odd_vertices)

    for perm in itertools.permutations(odd_vertices):
        if all(perm[i] < perm[i + 1] for i in range(0, len(perm), 2)):
            weight = 0
            for i in range(0, len(perm), 2):
                weight += dist_matrix[perm[i]][perm[i + 1]]
            if weight < min_weight:
                min_weight = weight
                best_matching = [(perm[i], perm[i + 1]) for i in range(0, len(perm), 2)]

    # 4. 构造欧拉图（MST + 匹配），找欧拉回路
    adj = [[] for _ in range(n)]
    for u, v in mst_edges:
        adj[u].append(v)
        adj[v].append(u)
    for u, v in best_matching:
        adj[u].append(v)
        adj[v].append(u)

    # Hierholzer 算法找欧拉回路
    stack = [0]
    circuit = []
    while stack:
        v = stack[-1]
        if adj[v]:
            u = adj[v].pop()
            adj[u].remove(v)
            stack.append(u)
        else:
            circuit.append(stack.pop())

    # 5. 去重得到哈密顿回路
    visited = set()
    tour = [v for v in circuit if v not in visited and not visited.add(v)]
    tour.append(tour[0])
    return tour
```

### 近似算法分类

| 问题 | 近似比 | 方法 |
|------|--------|------|
| Vertex Cover | 2 | 贪心匹配 |
| Metric TSP | 1.5 | Christofides |
| Set Cover | O(log n) | 贪心 |
| Max Cut | 0.5 | 随机分割 |
| Steiner Tree | 2 | MST-based |
| 一般 TSP（无边权限制） | 不可近似 | — |

> **不可近似性**：如果 P ≠ NP，则某些问题的近似比存在下界。例如一般 TSP 对于任意 ρ 不可近似，否则可精确求解哈密顿回路。

---

## 14.3 启发式算法

启发式算法（Heuristic Algorithm）不提供理论保证，但在实践中对大规模问题往往能找到高质量的解。本节介绍三种经典元启发式（Metaheuristic）。

### 14.3.1 模拟退火（Simulated Annealing）

模拟退火受金属退火过程启发：高温时原子随机运动，缓慢冷却后趋于稳定结构。

**核心思想**：
- 以概率接受更差的解，从而跳出局部最优
- 接受概率随温度下降而降低
- 温度下降速度决定了探索与利用的平衡

```
初始化当前解 S，初始温度 T
while 终止条件不满足：
    从 S 的邻域随机选择新解 S'
    Δ = f(S') - f(S)
    if Δ < 0:           # 更好的解
        S = S'
    else:
        if random() < e^{-Δ/T}:  # 以概率接受更差的解
            S = S'
    降温: T = α · T      # α 通常为 0.95~0.99
```

**关键参数**：
- **初始温度 T0**：足够高，使初始阶段几乎接受所有解
- **降温速率 α**：通常 0.95~0.99，越接近 1 搜索越充分
- **终止温度**：温度低于阈值时停止
- **邻域定义**：决定搜索效率的核心设计

> **适用场景**：TSP、图划分、作业调度、电路布局等大规模离散优化。

### 14.3.2 遗传算法（Genetic Algorithm）

遗传算法模拟自然选择（Natural Selection）和遗传机制。种群（Population）中的个体通过选择、交叉（Crossover）和变异（Mutation）逐代进化。

**算法框架**：

```
初始化种群（随机生成 N 个个体）
评估每个个体的适应度（Fitness）
while 未达到终止条件：
    选择：按适应度比例选择父代
    交叉：以概率 Pc 对父代进行交叉，产生子代
    变异：以概率 Pm 对子代进行变异
    评估子代适应度
    更新种群（如精英保留 Elitism）
```

**三要素**：
- **编码（Encoding）**：解的表达方式（二进制串、排列、实数向量）
- **适应度函数（Fitness Function）**：衡量个体质量的函数
- **遗传算子（Genetic Operators）**：选择、交叉、变异的具体实现

| 组件 | 常见实现 | 说明 |
|------|---------|------|
| 编码 | 二进制编码、排列编码、实数编码 | 取决于问题性质 |
| 选择 | 轮盘赌、锦标赛选择、排名选择 | 控制选择压力 |
| 交叉 | 单点交叉、两点交叉、均匀交叉 | 探索新组合 |
| 变异 | 位翻转、交换变异、高斯变异 | 维持种群多样性 |

> **适用场景**：函数优化、组合优化（TSP、调度）、机器学习特征选择、神经网络结构搜索。

### 14.3.3 蚁群算法（Ant Colony Optimization）

蚁群算法模拟蚂蚁觅食行为：蚂蚁在路径上释放信息素（Pheromone），信息素浓度越高的路径被更多蚂蚁选择，形成正反馈。

**核心机制**：

```
初始化信息素矩阵 τ
while 未达到终止条件：
    for each 蚂蚁 k:
        根据概率规则构造解（偏向信息素高 + 启发式好的路径）
        更新局部信息素（蒸发 + 沉积）
    全局更新最优解的信息素
```

**概率选择规则**：

```
P_ij = (τ_ij^α · η_ij^β) / Σ(τ_ik^α · η_ik^β)
```

其中 τ_ij 是边 (i,j) 的信息素浓度，η_ij 是启发式信息（如 TSP 中距离的倒数），α 和 β 控制两者的相对重要性。

| 参数 | 作用 | 典型值 |
|------|------|--------|
| α | 信息素权重，越大越依赖历史经验 | 1~3 |
| β | 启发式权重，越大越贪心 | 2~5 |
| ρ | 蒸发率，控制收敛速度 | 0.1~0.5 |
| m | 蚂蚁数量 | 问题规模相当 |

> **适用场景**：TSP、车辆路径问题（VRP）、网络路由、作业调度。

### 三类启发式对比

| 维度 | 模拟退火 | 遗传算法 | 蚁群算法 |
|------|---------|---------|---------|
| 搜索策略 | 单点迭代 | 种群进化 | 群体合作 |
| 记忆机制 | 无（仅当前解） | 种群基因库 | 信息素矩阵 |
| 参数数量 | 少（3~4个） | 较多（5~7个） | 较多（4~5个） |
| 并行性 | 低 | 高 | 中 |
| 对小规模基准 | 快但精度一般 | 精度高 | 精度高 |
| 问题通用性 | 高 | 高 | 适合路径类问题 |

---

## 14.4 线性规划基础

线性规划（Linear Programming, LP）是运筹学中最核心的优化工具，也是许多组合优化问题的重要理论基础。

### 14.4.1 线性规划的标准形式

**目标函数**：最大化或最小化线性函数
**约束条件**：一组线性等式或不等式
**决策变量**：非负实数

```
最大化      c^T · x
满足约束    A · x ≤ b
           x ≥ 0
```

其中：
- x ∈ R^n 是决策变量向量
- c ∈ R^n 是目标系数向量
- A ∈ R^{m×n} 是约束系数矩阵
- b ∈ R^m 是约束右端项向量

### 示例：生产计划问题

一个工厂生产两种产品 P1 和 P2。P1 每单位利润 40 元，P2 每单位利润 30 元。P1 消耗原料 A 1 单位、B 2 单位；P2 消耗原料 A 1 单位、B 1 单位。原料 A 可用 8 单位，B 可用 12 单位。

**LP 模型**：

```
最大化 z = 40x1 + 30x2
满足     x1 +  x2 ≤ 8  （原料 A 约束）
       2x1 +  x2 ≤ 12 （原料 B 约束）
        x1, x2 ≥ 0
```

```python
import numpy as np

def solve_production_lp():
    """
    求解生产计划 LP：
    max 40x1 + 30x2
    s.t. x1 +  x2 ≤ 8
         2x1 +  x2 ≤ 12
         x1, x2 ≥ 0
    """
    # 可行域的顶点
    A = np.array([[1, 1], [2, 1]])
    b = np.array([8, 12])

    vertices = []
    vertices.append((0, 0))                         # (0, 0)
    vertices.append((6, 0))                         # x2=0, 2x1=12 → x1=6
    vertices.append((0, 8))                         # x1=0, x2=8
    # 交点：x1+x2=8, 2x1+x2=12  →  x1=4, x2=4
    vertices.append((4, 4))

    c = np.array([40, 30])
    best_val = -np.inf
    best_pt = None
    for x1, x2 in vertices:
        if all(A @ np.array([x1, x2]) <= b + 1e-9):
            val = c @ np.array([x1, x2])
            if val > best_val:
                best_val = val
                best_pt = (x1, x2)

    return best_pt, best_val
```

### 14.4.2 单纯形法概述

单纯形法（Simplex Method）是求解线性规划最经典的算法。它的几何直观是：

1. **可行域**是一个凸多面体（Convex Polytope）
2. **最优解**必然出现在某个顶点（Vertex / Basic Feasible Solution）上
3. 从一个顶点开始，沿边移动到目标函数值更好的相邻顶点
4. 重复直到无法改进（达到最优）

```
┌──────────────────────────────────┐
│ 单纯形法几何直观                   │
│                                  │
│           x2                     │
│           ↑                      │
│         8 ┼───────(0,8)          │
│           │      /               │
│           │     /                │
│           │    /  ★ (4,4)        │
│           │   /  ← 最优解        │
│           │  /                   │
│         0 ┼───────┬──→ x1        │
│           (0,0)  6 (6,0)         │
│                                  │
│ 路径: (0,0) → (6,0) → (4,4) ★   │
└──────────────────────────────────┘
```

**算法步骤**：
1. **初始化**：找一个初始基本可行解（通常引入松弛变量）
2. **最优性检验**：检查当前顶点是否最优（所有 reduced cost ≤ 0）
3. **进基（Entering Variable）**：选择 reduced cost 最大的非基变量
4. **离基（Leaving Variable）**：用最小比值法则确定离基变量
5. **转轴（Pivot）**：更新基，回到步骤 2

> 单纯形法在最坏情况下是指数级时间，但实践中通常高效，平均为多项式时间。

### 14.4.3 整数线性规划

整数线性规划（Integer Linear Programming, ILP）要求部分或全部决策变量为整数。ILP 是**NP-难**的。

**0/1 背包作为 ILP**：

```
最大化     Σ v_i · x_i
满足      Σ w_i · x_i ≤ C
         x_i ∈ {0, 1}
```

**顶点覆盖作为 ILP**：

```
最小化     Σ x_v
满足      x_u + x_v ≥ 1,  ∀(u,v) ∈ E
         x_v ∈ {0, 1}
```

#### LP 松弛（LP Relaxation）

将整数约束 `x ∈ {0,1}` 替换为连续约束 `0 ≤ x ≤ 1`，将 ILP 转化为 LP：

```
最小化     Σ x_v
满足      x_u + x_v ≥ 1,  ∀(u,v) ∈ E
         0 ≤ x_v ≤ 1
```

LP 松弛得到的是 ILP 的**下界**（最小化问题）或**上界**（最大化问题）。然后可以通过**舍入（Rounding）**得到整数解。

#### 顶点覆盖的 LP 舍入 2-近似

```python
def lp_rounding_vertex_cover(edges: List[Tuple[int, int]]) -> Set[int]:
    """
    LP 松弛 + 舍入求顶点覆盖（2-近似）。

    解 LP 松弛得到 x_v ∈ [0,1]，然后 x_v ≥ 0.5 的顶点入选。
    """
    n = max(max(u, v) for u, v in edges) + 1

    # 解 LP：min Σ x_v, s.t. x_u+x_v ≥ 1, 0≤x_v≤1
    # 这个 LP 的解析解：x_v = 1/2 总是可行且最优！
    x = [0.5] * n

    # 舍入：x_v ≥ 1/2 → 选入顶点覆盖
    cover = {v for v in range(n) if x[v] >= 0.5}

    # 验证覆盖
    assert all(u in cover or v in cover for u, v in edges)
    return cover
```

这正是 2-近似的另一种推导：因为最优 LP 解的目标值 ≤ 最优 ILP 解的目标值，而舍入使目标值至多翻倍。

### 14.4.4 分支定界法（Branch and Bound）

分支定界法是求解 ILP 的精确方法：

1. **松弛**：求解 LP 松弛，得到上界（最大化问题）
2. **分支**：选择一个非整数变量 x_i，分为 x_i ≤ ⌊x_i⌋ 和 x_i ≥ ⌈x_i⌉ 两个子问题
3. **定界**：对每个子问题计算上界
4. **剪枝**：若某分支的上界 ≤ 当前最优整数解，则剪去该分支

```
x1 = 2.5, x2 = 1.2  (LP 松弛解，目标值 100)
          ↓ 分支 x1
   x1 ≤ 2           x1 ≥ 3
   x1=2, x2=1.3     x1=3, x2=0.8
   目标值 95         目标值 90
   ↓ 分支 x2          ↓ 可行解
x2 ≤ 1    x2 ≥ 2    x1=3, x2=1
目标 92  不可行      目标 88 ★
↓ 整数解              ↓ 剪枝
x1=2,x2=1            90 < 88
目标值 87 (更新下界)
```

### 14.4.5 线性规划的应用

| 领域 | 典型问题 | LP/ILP 建模方式 |
|------|---------|----------------|
| 生产计划 | 产品组合优化 | 资源约束 + 利润最大化 |
| 物流运输 | 运输问题 | 供需平衡 + 运输成本最小化 |
| 金融投资 | 投资组合优化 | 风险约束 + 收益最大化 |
| 网络流 | 最大流、最小割 | 流量守恒 + 容量约束 |
| 图论 | 匹配、覆盖 | 指示变量 + 覆盖约束 |
| 调度 | 作业车间调度 | 时序约束 + 完工时间最小化 |

> **小结**：线性规划提供了组合优化问题的理论框架。LP 松弛是设计近似算法的重要工具，而单纯形法和分支定界法构成了求解 LP 和 ILP 的实践基础。对于大规模 ILP，商业求解器（Gurobi、CPLEX）通常结合多种技术（割平面、启发式、分支定界）协同工作。

---

## 练习

1. **贪心与 Matroid**：证明活动选择问题构成的 Matroid 结构，解释贪心为何能得到最优解。

2. **顶点覆盖近似**：给出一个顶点覆盖的反例，说明 2-近似是紧的（即近似比恰好为 2，不可改进）。

3. **TSP 近似**：用 Christofides 算法求解一个 5 个点的度量 TSP 实例，并验证近似比 ≤ 1.5。

4. **模拟退火调参**：对 TSP 问题，用不同降温速率（α = 0.95, 0.98, 0.99）运行模拟退火，比较解的质量和收敛速度。

5. **遗传算法编码**：设计 TSP 的遗传算法编码方案，解释为什么需要特殊的交叉算子（如 PMX）。

6. **LP 建模**：将以下问题建模为线性规划——一个公司有 3 种产品、2 种原材料，每种产品消耗原材料量和利润已知，原材料库存有限，目标最大化总利润。

7. **LP 松弛分析**：将顶点覆盖的 LP 松弛目标值记为 `OPT_LP`，ILP 最优值记为 `OPT_ILP`。
   证明：对于顶点覆盖，`OPT_LP ≥ 0.5 · OPT_ILP`，从而舍入 x_v ≥ 0.5 的方案是 2-近似。