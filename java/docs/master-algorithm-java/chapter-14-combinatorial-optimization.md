# 第14章 组合优化

> "当问题规模爆炸、精确解遥不可及时，近似算法与启发式方法成为理论计算机科学对现实世界最有力的馈赠——不求最优，但求足够好、足够快。"

---

## 14.1 贪心策略的组合优化

### 14.1.1 拟阵理论：贪心何时最优

许多贪心算法成功的背后有一个统一的数学结构——**拟阵（Matroid）**。

**拟阵**是一个二元组 $(S, \mathcal{I})$，其中 $S$ 是有限集合，$\mathcal{I}$ 是 $S$ 的子集族，满足：

1. **空集性：** $\emptyset \in \mathcal{I}$
2. **遗传性：** 若 $A \in \mathcal{I}$ 且 $B \subseteq A$，则 $B \in \mathcal{I}$
3. **交换性：** 若 $A, B \in \mathcal{I}$ 且 $|A| < |B|$，则存在 $x \in B \setminus A$ 使得 $A \cup \{x\} \in \mathcal{I}$

$\mathcal{I}$ 中的集合称为**独立集（Independent Sets）**。**极大独立集**称为**基（Basis）**，所有基的大小相同，称为拟阵的**秩（Rank）**。

**拟阵的定义直接对应贪心算法的正确性条件：** 在带权拟阵上，按权重降序、依次将元素加入独立集（只要保持独立性）的贪心策略，总能得到最大权独立集。

**经典拟阵例子：**

- **图拟阵（Graphic Matroid）：** $S =$ 图的边集，$\mathcal{I} =$ 所有无环边子集（森林）。极大独立集 = 生成树。Kruskal算法正是在此拟阵上的贪心算法。
- **均匀拟阵（Uniform Matroid）：** $\mathcal{I} = \{A \subseteq S : |A| \le k\}$。选择不超过 $k$ 个元素。
- **划分拟阵（Partition Matroid）：** 将 $S$ 划分为若干组，每组最多选指定数量的元素。

**定理（拟阵贪心最优性）：** 若 $(S, \mathcal{I})$ 是拟阵，则按权重降序贪心选择能保持独立性的最大权独立集的算法是最优的。

Kruskal算法的正确性正是由图拟阵保证的。Prim算法同样适用——虽然Prim以顶点为视角，但它的选择序列也对应图拟阵的一个基。

### 14.1.2 子模函数与贪心保证

拟阵理论对"最大权独立集"给出了贪心的最优性保证。但对于更一般的目标函数，贪心依然可以提供有界近似。

**子模函数（Submodular Function）：** 集合函数 $f: 2^V \to \mathbb{R}$ 满足对任意 $A \subseteq B \subseteq V$ 和 $x \notin B$：

$$f(A \cup \{x\}) - f(A) \ge f(B \cup \{x\}) - f(B)$$

即**边际收益递减**——随着集合增大，新增一个元素的收益不会增加。

**单调子模函数**还满足：$f(A) \le f(B)$ 当 $A \subseteq B$。

**定理（贪心保证）：** 对于单调子模函数 $f$（$f(\emptyset)=0$），在基数约束（最多选 $k$ 个元素）下，贪心选择（每一步选边际收益最大的元素）得到的解 $G$ 满足：

$$f(G) \ge (1 - 1/e) \cdot f(OPT)$$

其中 $e \approx 2.718$，因此 $(1 - 1/e) \approx 0.632$。这是理论上最优的近似比（除非 P = NP）。

**应用示例——最大覆盖问题（Maximum Coverage）：** 给定 $m$ 个集合，选 $k$ 个使并集元素数最多。覆盖函数 $f(S) = |\bigcup_{i \in S} A_i|$ 是单调子模函数。贪心选当前覆盖最多新元素的集合，得到 $(1-1/e)$ 近似。

**Python风格伪代码：**

```
greedy_submodular(V, f, k):
    S = ∅
    for i = 1 to k:
        x* = argmax_{x ∉ S} [f(S ∪ {x}) - f(S)]
        S = S ∪ {x*}
    return S
```

---

## 14.2 近似算法

当问题属于 NP-hard 时，我们放弃求精确解，转而寻找**近似算法**——能在多项式时间内给出有质量保证的近似解。

### 14.2.1 基本定义

**α-近似算法（α-Approximation Algorithm）：** 对问题的所有实例，算法输出的解的值 $ALG$ 与最优值 $OPT$ 满足：

- **最小化问题：** $ALG \le \alpha \cdot OPT$，其中 $\alpha \ge 1$
- **最大化问题：** $ALG \ge \alpha \cdot OPT$，其中 $\alpha \le 1$

$\alpha$ 称为**近似比（Approximation Ratio）**。

**近似方案（Approximation Scheme）：** 对任意 $\epsilon > 0$ 能给出 $(1+\epsilon)$ 近似的算法族。若运行时间为 $\text{poly}(n, 1/\epsilon)$，称为**PTAS**；若为 $\text{poly}(n) \cdot f(1/\epsilon)$，称为**FPTAS**。

### 14.2.2 顶点覆盖——2-近似

**顶点覆盖（Vertex Cover）问题：** 给定无向图 $G = (V, E)$，找到最小的顶点子集 $C \subseteq V$，使每条边至少有一个端点在 $C$ 中。

**2-近似算法：基于极大匹配**

1. 找到图的**极大匹配（Maximal Matching）** $M$（注意不是最大匹配）
2. 输出 $C = \{v : v \text{ 是 } M \text{ 中某条边的端点}\}$

```
vertex_cover_2approx(G):
    C = ∅
    M = ∅  // 极大匹配
    for each edge (u,v) in E:
        if u ∉ C and v ∉ C:
            C = C ∪ {u, v}
            M = M ∪ {(u, v)}
    return C
```

**证明（近似比 2）：** 设 $OPT$ 是最优顶点覆盖。每条极大匹配中的边至少需要一个端点覆盖，且这些边互不相交，因此 $|M| \le |OPT|$。而 $C$ 包含每条匹配边的两个端点，故 $|C| = 2|M| \le 2|OPT|$。

### 14.2.3 集合覆盖——贪心 $O(\log n)$ 近似

**集合覆盖（Set Cover）问题：** 给定全集 $U$ 和子集族 $\mathcal{S} = \{S_1, S_2, \ldots, S_m\}$，选择最少的子集使它们的并等于 $U$。

**贪心算法：** 每次选覆盖当前最多未覆盖元素的子集。

```
greedy_set_cover(U, S):
    uncovered = U
    C = ∅
    while uncovered ≠ ∅:
        选 S_i 使 |S_i ∩ uncovered| 最大
        C = C ∪ {i}
        uncovered = uncovered \ S_i
    return C
```

**近似比：** $H(d) = 1 + 1/2 + \cdots + 1/d \le \ln d + 1$，其中 $d = \max |S_i|$。在最坏情况下，贪心集合覆盖的近似比为 $\Theta(\log n)$，且这是多项式时间内的最优近似比（除非 P = NP）。

### 14.2.4 旅行商问题

**旅行商问题（TSP）：** 给定 $n$ 个城市及两两之间的距离，找一条最短的回路，每个城市恰好访问一次。

一般 TSP 无法近似（除非 P = NP）。但如果距离满足**三角不等式（Triangle Inequality）** $d(u, w) \le d(u, v) + d(v, w)$（即度量空间），则存在常数因子近似算法。

**MST-based 2-近似：**

```
tsp_2approx(G):
    1. 计算最小生成树 T (Prim/Kruskal)
    2. 对 T 做 DFS 得到遍历序列（前序遍历）
    3. 按该序列访问城市（跳过重复），得到哈密顿回路
```

**分析：**
- $OPT_{\text{TSP}} \ge MST$（删除最优回路的一条边得到生成树）
- DFS 遍历的路径总长为 $2 \cdot MST$（每条边走两次）
- 三角不等式保证路径缩短后不会超过 $2 \cdot MST$
- 因此 $ALG \le 2 \cdot OPT_{\text{TSP}}$

**Christofides 1.5-近似：**

Christofides算法改进了上述方法，将近似比从 2 压缩到 1.5：

```
christofides(G):
    1. 计算最小生成树 T
    2. 在 T 的奇数度顶点间求最小权完美匹配 M
    3. 将 T 和 M 合并得到欧拉图 H
    4. 在 H 上找欧拉回路
    5. 跳过重复顶点，得到哈密顿回路
```

**分析：** 奇数度顶点数为偶数（所有顶点度数和为 $2|E|$），故完美匹配存在。$OPT_{\text{TSP}}$ 经过这些奇度顶点时删去间隔边可得匹配，因此 $M \le OPT_{\text{TSP}} / 2$，故 $ALG \le MST + M \le OPT + OPT/2 = 1.5 \cdot OPT$。

**Java代码片段（MST-based 2-近似）：**

```java
// 假设 adjacencyMatrix 存储满足三角不等式的距离
List<Integer> tsp2Approx(double[][] dist) {
    int n = dist.length;
    // 1. Prim 求 MST
    List<Integer>[] mst = primMST(dist);
    // 2. 前序遍历得到回路
    boolean[] visited = new boolean[n];
    List<Integer> tour = new ArrayList<>();
    dfs(0, mst, visited, tour);
    tour.add(0); // 回到起点
    return tour;
}
```

---

## 14.3 启发式算法

当问题的结构过于复杂，以至于无法设计有理论保证的近似算法时，**启发式算法（Heuristics）** 成为最后的武器。它们通常模拟自然界的某种过程，虽然缺乏理论保证，但在实践中往往能给出相当好的解。

### 14.3.1 模拟退火

**模拟退火（Simulated Annealing, SA）** 模拟金属退火过程中原子逐渐趋于最低能量状态的过程。

**核心思想：** 在搜索过程中以一定概率接受更差的解，且该概率随"温度"降低而减小。初期接受较差解以防止陷入局部最优，后期趋向于只接受更好的解。

**Metropolis准则：** 在当前解 $x$ 产生新解 $x'$ 时，接受概率为：

$$P(\text{accept } x') = \begin{cases}
1 & \text{if } f(x') < f(x) \text{ (最小化问题)} \\
\exp\left(-\frac{f(x') - f(x)}{T}\right) & \text{otherwise}
\end{cases}$$

**温度调度（Cooling Schedule）：** 温度随迭代次数下降，常见方式：

- **指数退火：** $T_{k+1} = \alpha \cdot T_k$，$\alpha \in (0.8, 0.999)$
- **线性退火：** $T_{k+1} = T_k - \Delta$
- **对数退火：** $T_k = T_0 / \ln(k + 1)$（理论上保证收敛到全局最优）

```
simulated_annealing(initial_solution, initial_T, cooling_rate, max_iter):
    current = initial_solution
    best = current
    T = initial_T
    for i = 1 to max_iter:
        neighbor = random_neighbor(current)
        ΔE = f(neighbor) - f(current)
        if ΔE < 0 or random() < exp(-ΔE / T):
            current = neighbor
            if f(current) < f(best): best = current
        T = T * cooling_rate  // 指数退火
    return best
```

### 14.3.2 遗传算法

**遗传算法（Genetic Algorithm, GA）** 模拟生物进化过程：通过选择、交叉、变异操作在种群中逐步演化出高质量的解。

**核心步骤：**

1. **编码（Encoding）：** 将解表示为染色体（通常是二进制串或排列）
2. **初始化种群（Initialization）：** 随机生成一组初始解
3. **适应度评估（Fitness Evaluation）：** 计算每个个体的适应度
4. **选择（Selection）：** 适应度高的个体更可能被选中繁殖
   - **轮盘赌选择（Roulette Wheel Selection）：** 按适应度比例选择
   - **锦标赛选择（Tournament Selection）：** 随机选 $k$ 个个体，取最优者
5. **交叉（Crossover）：** 两个父代产生子代
   - **单点交叉（Single-Point Crossover）：** 随机选一个交叉点，交换两侧
   - **多点交叉（Multi-Point Crossover）：** 多个交叉点
   - **均匀交叉（Uniform Crossover）：** 每个基因以概率 0.5 来自任一方
6. **变异（Mutation）：** 以较小概率随机改变基因
   - **位翻转（Bit Flip）：** 0→1或1→0
   - **交换变异（Swap Mutation）：** 随机交换两个位置
7. **替换（Replacement）：** 新种群替换旧种群（或部分替换）

```
genetic_algorithm(pop_size, generations, crossover_rate, mutation_rate):
    初始化种群 P (pop_size 个随机个体)
    for gen = 1 to generations:
        计算 P 中每个个体的适应度
        new_population = ∅
        while new_population.size < pop_size:
            parent1 = tournament_select(P)
            parent2 = tournament_select(P)
            if random() < crossover_rate:
                child1, child2 = crossover(parent1, parent2)
            else:
                child1, child2 = parent1, parent2
            mutate(child1, mutation_rate)
            mutate(child2, mutation_rate)
            new_population.add(child1, child2)
        P = new_population
        记录最佳个体
    return 最佳个体
```

### 14.3.3 蚁群算法

**蚁群算法（Ant Colony Optimization, ACO）** 模拟蚂蚁在寻找食物过程中通过信息素（Pheromone）进行间接通信的行为。

**核心机制：**

- **信息素（Pheromone）** 沉积在路径上，吸引后续蚂蚁
- **信息素蒸发（Evaporation）** 防止算法过早收敛
- **启发式信息（Heuristic Information）** 通常是问题的局部贪心引导（如 TSP 中边长的倒数）

**蚂蚁构建解的规则：** 在决策点 $i$ 选择下一个节点 $j$ 的概率：

$$P_{ij} = \frac{(\tau_{ij})^\alpha \cdot (\eta_{ij})^\beta}{\sum_{k \in allowed} (\tau_{ik})^\alpha \cdot (\eta_{ik})^\beta}$$

其中 $\tau_{ij}$ 是信息素强度，$\eta_{ij}$ 是启发式信息，$\alpha$ 和 $\beta$ 控制两者的相对重要性。

**信息素更新：**

$$\tau_{ij} = (1 - \rho) \cdot \tau_{ij} + \sum_{\text{ants}} \Delta \tau_{ij}^{\text{ant}}$$

其中 $\rho$ 是蒸发率，$\Delta \tau_{ij}^{\text{ant}}$ 通常正比于蚂蚁找到的解的质量。

### 14.3.4 禁忌搜索

**禁忌搜索（Tabu Search）** 通过维护一个**禁忌表（Tabu List）** 记录最近做过的移动，避免算法在局部最优附近循环。

**关键要素：**

- **禁忌表：** 记录在最近 $t$ 步内禁止执行的移动（循环队列）
- **禁忌长度 $t$：** 决定搜索的多样性
- **渴望准则（Aspiration Criterion）：** 如果某个被禁忌的移动能产生比当前最佳解更好的解，则打破禁忌

```
tabu_search(initial_solution, max_iter, tabu_tenure):
    current = initial_solution
    best = current
    tabu_list = ∅
    for i = 1 to max_iter:
        生成 current 的邻居集 N(current)
        从 N(current) 中选出不受禁忌（或满足渴望准则）的最佳邻居 next
        current = next
        if f(current) < f(best): best = current
        更新 tabu_list (将 current 的移动加入，过期条目移除)
    return best
```

当理论无能为力时，启发式算法是实践者的可靠伙伴。它们没有漂亮的理论保证，但对于 NP-hard 问题的大规模实例，往往是唯一可行的选择。

---

## 14.4 线性规划基础

线性规划（Linear Programming, LP）是组合优化的支柱工具。它不仅本身可以求解大规模优化问题，还是设计近似算法的强大武器。

### 14.4.1 线性规划的标准形式

一个线性规划问题由三部分组成：

1. **决策变量（Decision Variables）：** $x_1, x_2, \ldots, x_n$
2. **线性目标函数（Linear Objective Function）：** 最大化或最小化
3. **线性约束（Linear Constraints）：** 等式或不等式

**标准形式（Standard Form）：**

$$
\begin{aligned}
\text{minimize} \quad & \mathbf{c}^T \mathbf{x} \\
\text{subject to} \quad & A\mathbf{x} = \mathbf{b} \\
& \mathbf{x} \ge 0
\end{aligned}
$$

其中 $\mathbf{x} \in \mathbb{R}^n$，$A \in \mathbb{R}^{m \times n}$，$\mathbf{b} \in \mathbb{R}^m$，$\mathbf{c} \in \mathbb{R}^n$。

**松弛变量（Slack Variables）：** 将不等式约束 $A\mathbf{x} \le \mathbf{b}$ 转化为等式约束的方法是添加非负松弛变量 $s$：

$$A\mathbf{x} + \mathbf{s} = \mathbf{b}, \quad \mathbf{s} \ge 0$$

### 14.4.2 线性规划的几何直观

从几何角度看，线性规划的可行域是一个**凸多面体（Convex Polytope）**——由所有约束定义的半空间交集。

**基本可行解（Basic Feasible Solution, BFS）：** 凸多面体的顶点。线性规划的一个基本定理是：**若最优解存在，则必有一个基本可行解是最优解**。因此，搜索空间从整个可行域缩小到有限个顶点。

### 14.4.3 单纯形方法

**单纯形方法（Simplex Method）** 从一个顶点出发，沿着边移动到目标函数值更优的相邻顶点，直到无法改进。

```
simplex(A, b, c):
    找到一个初始基本可行解 x
    while (存在非基变量 x_j 满足 c_j < 0 (最小化问题)):
        选择进入变量 x_j (最负的 c_j)
        选择离开变量 x_i (最小比值测试)
        转轴(pivot): 更新基矩阵和所有变量
    return x
```

- **转轴（Pivot）** 是单纯形法的核心操作，将非基变量变为基变量，更新所有变量的值
- 在最坏情况下，单纯形法的时间复杂度是指数级的，但实践中通常为 $O(m^{2.5})$ 到 $O(m^3)$

### 14.4.4 整数线性规划

**整数线性规划（Integer Linear Programming, ILP）** 是线性规划的变体，要求部分或全部变量为整数：

$$
\begin{aligned}
\text{minimize} \quad & \mathbf{c}^T \mathbf{x} \\
\text{subject to} \quad & A\mathbf{x} \ge \mathbf{b} \\
& \mathbf{x} \in \{0, 1\}^n \text{ 或 } \mathbb{Z}_{\ge 0}^n
\end{aligned}
$$

ILP 是可表达性极强的建模框架，但求解ILP是 NP-hard 的。

### 14.4.5 LP松弛与舍入

**LP松弛（LP Relaxation）** 是设计和分析近似算法的经典方法：将整数变量松弛为实数变量，求解后通过**舍入（Rounding）** 得到整数解。

**通用框架：**

1. 将问题建模为 ILP
2. 松弛整数约束为实数，得到 LP
3. 求解 LP（多项式时间）
4. 将 LP 最优解舍入为整数解
5. 分析舍入后的近似比

**示例——顶点覆盖的 LP 松弛与舍入：**

**ILP 模型：**
$$
\begin{aligned}
\text{minimize} \quad & \sum_{v \in V} x_v \\
\text{subject to} \quad & x_u + x_v \ge 1, \quad \forall (u, v) \in E \\
& x_v \in \{0, 1\}, \quad \forall v \in V
\end{aligned}
$$

**LP 松弛（$0 \le x_v \le 1$）：** 求解后得到分数解。舍入策略：$x_v \ge 0.5 \to 1$，否则 $\to 0$。这种简单舍入得到2-近似。

**随机舍入（Randomized Rounding）：** 以概率 $x_v$ 将 $x_v$ 设为 1。这种方法对集合覆盖问题可以得到 $O(\log n)$ 的期望近似比。

**LP基础在组合优化中的核心地位：**

| 技术 | 思路 | 典型近似比 |
|------|------|-----------|
| LP松弛 + 简单舍入 | 阈值舍入 | 顶点覆盖 2-近似 |
| LP松弛 + 随机舍入 | 概率化舍入 | 集合覆盖 $O(\log n)$ |
| 对偶拟合（Dual Fitting） | 利用对偶解构造原始可行解 | 集合覆盖 $H(d)$ |
| 原始-对偶（Primal-Dual） | 同步构造原始和对偶可行解 | 顶点覆盖 2-近似 |

---

## 本章总结

| 概念 | 核心思想 | 典型结果 |
|------|---------|---------|
| 拟阵 | 贪心最优性的充分条件 | Kruskal 最优，$(1-1/e)$ 子模近似 |
| 近似算法 | 多项式时间内的有质量保证的解 | VC 2-近似，Set Cover $O(\log n)$，Christofides 1.5-近似 |
| 启发式算法 | 模拟自然过程，无理论保证但实践有效 | SA、GA、ACO、Tabu Search |
| 线性规划 | 凸优化框架，LP松弛 + 舍入 | ILP建模，近似算法设计 |

组合优化是理论计算机科学与运筹学的交汇点。拟阵和子模函数从理论上界定了"哪些问题贪心有效"，近似算法在 NP-hard 的困境中提供了理论保障，启发式算法在实践中填补了理论与应用的鸿沟，而线性规划则是这一切的底层数学语言。