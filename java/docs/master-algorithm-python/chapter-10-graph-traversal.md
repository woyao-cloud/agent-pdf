# 第10章 图算法 — 遍历与基础

> **图 (Graph)** 是计算机科学中最强大也最灵活的数据结构之一。从社交网络的好友关系到地图导航的路径规划，从网页链接的搜索引擎到神经网络的网络拓扑，图的抽象无处不在。本章从图的表示方法入手，系统讲解深度优先搜索、广度优先搜索、连通分量分析、割点检测与拓扑排序这五大基石。

---

## 10.1 图的表示方法

在讨论任何图算法之前，必须回答一个问题：**图在内存中如何存储？** 选择不同的表示方法会直接影响算法的时间复杂度和空间占用。

### 10.1.1 基本概念

一个图 $G = (V, E)$ 由**顶点集合 (Vertices)** $V$ 和**边集合 (Edges)** $E$ 组成。

| 属性 | 说明 |
|---|---|
| **有向图 (Directed Graph)** | 边有方向，$(u, v)$ 和 $(v, u)$ 不同 |
| **无向图 (Undirected Graph)** | 边无方向，$(u, v)$ 和 $(v, u)$ 等价 |
| **无权图 (Unweighted Graph)** | 边只表示连接关系，没有权重 |
| **加权图 (Weighted Graph)** | 每条边有一个数值权重 |
| **稀疏图 (Sparse Graph)** | $|E| \ll |V|^2$ |
| **稠密图 (Dense Graph)** | $|E| \approx |V|^2$ |

### 10.1.2 邻接矩阵 (Adjacency Matrix)

用一个 $n \times n$ 的二维数组表示图，$matrix[u][v]$ 表示顶点 $u$ 到 $v$ 的边。

```
# 无向无权图的邻接矩阵
   0  1  2  3
0  0  1  1  0
1  1  0  1  1
2  1  1  0  0
3  0  1  0  0
```

**Python 实现：**

```python
class AdjacencyMatrix:
    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.matrix = [[0] * n for _ in range(n)]

    def add_edge(self, u: int, v: int, weight=1):
        self.matrix[u][v] = weight
        if not self.directed:
            self.matrix[v][u] = weight

    def has_edge(self, u: int, v: int) -> bool:
        return self.matrix[u][v] != 0

    def neighbors(self, u: int):
        return [v for v in range(self.n) if self.matrix[u][v] != 0]
```

| 特性 | 说明 |
|---|---|
| **时间复杂度 — 查边** | O(1) — 直接通过下标访问 |
| **时间复杂度 — 遍历邻居** | O(n) — 需要扫描整行 |
| **空间复杂度** | O(n²) — 对稀疏图极度浪费 |
| **适用场景** | 稠密图（$n < 2000$）、需要频繁查边的算法（如 Floyd-Warshall） |

### 10.1.3 邻接表 (Adjacency List)

每个顶点维护一个列表，存储与其相邻的顶点。

```
# 无向图的邻接表
0: [1, 2]
1: [0, 2, 3]
2: [0, 1]
3: [1]
```

**Python 实现：**

```python
class AdjacencyList:
    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.graph = [[] for _ in range(n)]

    def add_edge(self, u: int, v: int, weight=None):
        entry = (v, weight) if weight is not None else v
        self.graph[u].append(entry)
        if not self.directed:
            entry2 = (u, weight) if weight is not None else u
            self.graph[v].append(entry2)

    def neighbors(self, u: int):
        return self.graph[u]
```

| 特性 | 说明 |
|---|---|
| **时间复杂度 — 查边** | O(degree(u)) — 需遍历邻居列表 |
| **时间复杂度 — 遍历邻居** | O(degree(u)) — 直接迭代 |
| **空间复杂度** | O(n + m) — 对稀疏图友好 |
| **适用场景** | 绝大多数图算法（DFS、BFS、Dijkstra、拓扑排序等） |

### 10.1.4 边列表 (Edge List)

将所有边存储为一个列表，每条边是一个 `(u, v, weight)` 三元组。

```python
class EdgeList:
    def __init__(self, n: int, directed=False):
        self.n = n
        self.directed = directed
        self.edges = []

    def add_edge(self, u: int, v: int, weight=1):
        self.edges.append((u, v, weight))
        if not self.directed:
            self.edges.append((v, u, weight))

    def all_edges(self):
        return self.edges
```

| 特性 | 说明 |
|---|---|
| **时间复杂度 — 查边** | O(m) — 需遍历所有边 |
| **空间复杂度** | O(m) — 仅存储边 |
| **适用场景** | Bellman-Ford、Kruskal 最小生成树、需要批量处理所有边的算法 |

### 10.1.5 三种表示的对比例

| 维度 | 邻接矩阵 | 邻接表 | 边列表 |
|---|---|---|---|
| 空间 | O(n²) | O(n + m) | O(m) |
| 查边 (u, v) | O(1) | O(deg(u)) | O(m) |
| 遍历 u 的邻居 | O(n) | O(deg(u)) | O(m) |
| 遍历所有边 | O(n²) | O(n + m) | O(m) |
| 添加边 | O(1) | O(1) | O(1) |
| 删除边 | O(1) | O(deg(u)) | O(m)（需查找） |
| 稀疏图友好 | 否 | 是 | 是 |
| 稠密图友好 | 是 | 是 | 否 |

**工程建议**：
- **邻接表**是工程中最常用的选择，适合 95% 的图算法场景
- **邻接矩阵**仅在稠密图或需要极速查边时使用（如 Floyd-Warshall 的 O(n³) 算法）
- **边列表**在需要对所有边进行统一处理的算法中无可替代（如 Kruskal、Bellman-Ford）

---

## 10.2 深度优先搜索 (Depth-First Search, DFS)

DFS 是图遍历的基础算法之一，其核心思想是**从起点出发，尽可能深入，直到无法继续，再回溯**。

### 10.2.1 基本原理

DFS 可以直观地类比为"走迷宫"：选择一个方向一直走，遇到死路就回头，换一个方向继续走。

```
DFS 遍历过程（从 0 开始）：
    0
   / \
  1   2
  |
  3

访问顺序: 0 → 1 → 3 → 2
```

**递归实现**：

```python
def dfs_recursive(graph, start, visited=None):
    if visited is None:
        visited = set()
    visited.add(start)
    # 访问当前节点
    for neighbor in graph[start]:
        if neighbor not in visited:
            dfs_recursive(graph, neighbor, visited)
    return visited
```

**迭代实现（显式栈）**：

```python
def dfs_iterative(graph, start):
    visited = set()
    stack = [start]
    while stack:
        vertex = stack.pop()
        if vertex not in visited:
            visited.add(vertex)
            # 将未访问的邻居入栈
            for neighbor in reversed(graph[vertex]):
                if neighbor not in visited:
                    stack.append(neighbor)
    return visited
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) — 每个顶点和每条边恰好访问一次 |
| **空间复杂度** | O(n) — 递归栈（递归版）或显式栈（迭代版） |
| **是否保证访问所有节点** | 仅在连通图中保证；非连通图需遍历每个未访问起点 |

### 10.2.2 递归 vs 迭代

| 维度 | 递归实现 | 迭代实现 |
|---|---|---|
| 代码简洁性 | 极高，几行即可 | 中等，需管理栈 |
| 栈深度风险 | 有（Python 默认递归深度限制 ~1000） | 无 |
| 遍历顺序 | 自然的深度优先 | 取决于入栈顺序 |
| 工程适用 | 小图、树形结构 | 大图、生产环境 |

**安全选择**：对于深度 > 500 的图，使用迭代版本或用 `sys.setrecursionlimit` 提高递归限制。

### 10.2.3 DFS 应用

DFS 是许多高级图算法的构建基础：

| 应用 | 说明 |
|---|---|
| **拓扑排序** | 基于 DFS 的后序遍历（见 10.5 节） |
| **连通分量** | 对每个未访问顶点执行 DFS（见 10.4 节） |
| **割点与桥** | Tarjan 算法基于 DFS 时间戳 |
| **强连通分量** | Kosaraju 和 Tarjan 算法均基于 DFS |
| **二分图检测** | DFS 染色法 |
| **路径搜索** | 在树/图中寻找特定路径 |

### 10.2.4 回溯与剪枝

在 DFS 基础上增加"回溯"逻辑（撤销选择）和"剪枝"条件（跳过无希望的分支），就得到了第 9 章的回溯算法。DFS 是回溯的骨架。

---

## 10.3 广度优先搜索 (Breadth-First Search, BFS)

BFS 逐层向外扩展——先访问距离起点最近的所有节点，再访问次近的，以此类推。

### 10.3.1 基本原理

BFS 使用**队列 (Queue)** 来实现"先入先出"的访问顺序，天然适合寻找最短路径（无权图）。

```
BFS 遍历过程（从 0 开始）：
    0
   / \
  1   2
  |
  3

访问顺序: 0 → 1 → 2 → 3  (按层)
```

**Python 实现**：

```python
from collections import deque

def bfs(graph, start):
    visited = {start}
    queue = deque([start])
    while queue:
        vertex = queue.popleft()
        for neighbor in graph[vertex]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return visited
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) — 每个顶点和每条边恰好访问一次 |
| **空间复杂度** | O(n) — visited 集合 + 队列中最多同时存 n 个顶点 |

### 10.3.2 BFS 求最短路径

BFS 能保证在无权图中找到从起点到任意可达顶点的**最短路径（按边数）**：

```python
from collections import deque

def bfs_shortest_path(graph, start):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        vertex = queue.popleft()
        for neighbor in graph[vertex]:
            if neighbor not in dist:
                dist[neighbor] = dist[vertex] + 1
                queue.append(neighbor)
    return dist
```

### 10.3.3 DFS vs BFS 对比

| 维度 | DFS | BFS |
|---|---|---|
| 数据结构 | 栈（Stack）— LIFO | 队列（Queue）— FIFO |
| 遍历顺序 | 沿一条路径深入再回溯 | 逐层向外扩展 |
| 最短路径（无权图） | 不保证 | 保证找到边数最少的路径 |
| 空间复杂度（最坏） | O(n)（链状图） | O(n)（宽图） |
| 空间复杂度（平均） | O(log n) ~ O(n)，取决于结构 | O(n) 或 O(宽度) |
| 连通分量 | 适合 | 适合 |
| 拓扑排序 | 适合（后序 DFS） | 适合（Kahn 算法） |
| 二分图检测 | 适合（染色 DFS） | 适合（染色 BFS） |

**选择指南**：
- 需要**最短路径**（无权图）→ BFS
- 需要**拓扑排序** → DFS 后序 或 Kahn（BFS）
- 需要**检测环路** → DFS（更直观）
- 需要**连通分量** → 两者均可，DFS 稍简
- **空间敏感**且图较深 → BFS（避免递归栈溢出）
- 需要**访问所有节点** → 任意，但需处理非连通情况

### 10.3.4 双向 BFS (Bidirectional BFS)

当已知起点和终点时，可同时从两端进行 BFS，搜索空间从 $b^d$ 降至约 $2b^{d/2}$。

```python
from collections import deque

def bidirectional_bfs(graph, start, target):
    if start == target:
        return 0
    front_visited = {start: 0}
    back_visited = {target: 0}
    front_queue = deque([start])
    back_queue = deque([target])

    while front_queue and back_queue:
        # 从前向扩展一层
        for _ in range(len(front_queue)):
            vertex = front_queue.popleft()
            for neighbor in graph[vertex]:
                if neighbor not in front_visited:
                    front_visited[neighbor] = front_visited[vertex] + 1
                    if neighbor in back_visited:
                        return front_visited[neighbor] + back_visited[neighbor]
                    front_queue.append(neighbor)

        # 从后向扩展一层
        for _ in range(len(back_queue)):
            vertex = back_queue.popleft()
            for neighbor in graph[vertex]:
                if neighbor not in back_visited:
                    back_visited[neighbor] = back_visited[vertex] + 1
                    if neighbor in front_visited:
                        return front_visited[neighbor] + back_visited[neighbor]
                    back_queue.append(neighbor)

    return -1  # 不可达
```

---

## 10.4 连通分量与割点

### 10.4.1 连通分量 (Connected Components)

**无向图**中，如果顶点 $u$ 和 $v$ 之间存在路径，则它们属于同一连通分量。找连通分量只需对所有未访问顶点执行 DFS 或 BFS。

```python
def connected_components(graph):
    n = len(graph)
    visited = [False] * n
    components = []

    for v in range(n):
        if not visited[v]:
            component = set()
            stack = [v]
            while stack:
                node = stack.pop()
                if not visited[node]:
                    visited[node] = True
                    component.add(node)
                    for nb in graph[node]:
                        if not visited[nb]:
                            stack.append(nb)
            components.append(component)

    return components
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) |
| **空间复杂度** | O(n) |
| **数量** | 连通图 => 1 个分量；非连通图 => > 1 |

### 10.4.2 割点 (Articulation Points / Cut Vertices)

**割点**是指在无向图中移除后会使连通分量数量增加的顶点。割点检测在**网络可靠性分析**（如路由器故障对网络连通性的影响）中至关重要。

**Tarjan 算法 (O(n + m))**：

核心思想是利用 DFS 树，引入两个关键概念：

- **`disc[v]` (discovery time)**：顶点 v 被 DFS 首次发现的顺序编号
- **`low[v]` (lowest reachable)**：从 v 出发，不经过其父节点能到达的最小 `disc` 值

**割点判定条件**：
1. **根节点**：如果根节点有两个或更多子节点（在 DFS 树中），则根是割点
2. **非根节点 u**：如果存在子节点 v 满足 `low[v] >= disc[u]`，则 u 是割点

```python
def find_articulation_points(graph):
    n = len(graph)
    disc = [-1] * n
    low = [0] * n
    visited = [False] * n
    parent = [-1] * n
    ap = [False] * n
    time = [0]

    def dfs(u):
        children = 0
        visited[u] = True
        disc[u] = low[u] = time[0]
        time[0] += 1

        for v in graph[u]:
            if not visited[v]:
                children += 1
                parent[v] = u
                dfs(v)
                low[u] = min(low[u], low[v])

                if parent[u] == -1 and children > 1:
                    ap[u] = True
                if parent[u] != -1 and low[v] >= disc[u]:
                    ap[u] = True
            elif v != parent[u]:
                low[u] = min(low[u], disc[v])

    for i in range(n):
        if not visited[i]:
            dfs(i)

    return [i for i, is_ap in enumerate(ap) if is_ap]
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) — 单次 DFS 完成 |
| **空间复杂度** | O(n) — 存储 disc、low、parent |
| **能否处理有向图** | 否；有向图需用强连通分量算法 |

---

## 10.5 拓扑排序 (Topological Sort)

拓扑排序是针对**有向无环图 (DAG, Directed Acyclic Graph)** 的顶点线性排序，使得对每条有向边 $(u, v)$，$u$ 在排序中出现在 $v$ 之前。

### 10.5.1 基本概念与前提

**拓扑排序存在当且仅当图是 DAG**。如果图中存在环，则无法进行拓扑排序。

**典型应用**：
- 课程选修关系（先修课 → 后续课）
- 任务调度（前置任务 → 后续任务）
- 编译依赖（头文件 → 源文件）
- 数据流水线（上游步骤 → 下游步骤）

### 10.5.2 Kahn 算法 (基于 BFS)

Kahn 算法基于贪心思想：**反复删除入度为 0 的顶点**。

```python
from collections import deque

def kahn_topological_sort(graph):
    n = len(graph)
    in_degree = [0] * n
    for u in range(n):
        for v in graph[u]:
            in_degree[v] += 1

    queue = deque([u for u in range(n) if in_degree[u] == 0])
    result = []

    while queue:
        u = queue.popleft()
        result.append(u)
        for v in graph[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)

    if len(result) != n:
        return None  # 存在环，无法拓扑排序
    return result
```

**算法流程**：
```
初始: 计算所有顶点的入度
1. 将所有入度为 0 的顶点入队
2. 循环直到队列为空：
   a. 出队顶点 u，加入结果
   b. 对 u 的所有邻居 v，入度减 1
   c. 如果 v 的入度变为 0，入队
3. 如果结果长度 < n，说明存在环
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) — 每条边处理一次 |
| **空间复杂度** | O(n) — 入度数组 + 队列 |
| **环检测** | 天然支持 — 结果长度 < n 即存在环 |
| **结果唯一性** | 不唯一；取决于队列中顶点的出队顺序 |

### 10.5.3 DFS 拓扑排序

DFS 基于**后序遍历 (post-order)**：在 DFS 递归返回时加入结果，最后逆序。

```python
def dfs_topological_sort(graph):
    n = len(graph)
    visited = [False] * n
    result = []
    has_cycle = [False]

    def dfs(u):
        visited[u] = True
        for v in graph[u]:
            if not visited[v]:
                dfs(v)
        result.append(u)  # 后序加入

    for i in range(n):
        if not visited[i]:
            dfs(i)

    result.reverse()  # 后序的逆序 = 拓扑序
    return result
```

> **注意**：上述简单 DFS 无法检测环。要检测环，需要使用**三色标记法**（白色=未访问，灰色=在栈中，黑色=已处理），见 demo 文件。

### 10.5.4 Kahn vs DFS 比较

| 维度 | Kahn 算法 | DFS 后序 |
|---|---|---|
| 基础数据结构 | BFS + 入度数组 | DFS 递归栈 |
| 环检测 | 天然支持（结果长度判断） | 需三色标记 |
| 遍历顺序 | 从入度为 0 的节点开始 | 从任意节点开始 |
| 实现简洁性 | 更直观、易调试 | 更简洁（无入度计算） |
| 工程首选 | **更推荐**（不容易栈溢出） | 适合中小规模 DAG |

**工程建议**：Kahn 算法是拓扑排序的**首选实现**，因为它天然支持环检测，且使用队列（无递归栈溢出风险）。

---

## 本章小结

1. **图的三种表示方法**中，邻接表是通用首选，邻接矩阵适合稠密图，边列表适合分批处理边
2. **DFS** 沿路径深入后回溯，基于栈结构，是连通分量、割点、拓扑排序等算法的基础
3. **BFS** 逐层扩展，基于队列结构，是**无权图最短路径**的标准解法
4. **Tarjan 算法**在 O(n + m) 时间内通过 DFS 时间戳找到所有割点，是图可靠性分析的核心工具
5. **拓扑排序**只在 DAG 上有解，Kahn 算法（BFS）比 DFS 后序更适合工程使用

> **下一步**：第 11 章将进入图算法的核心——最短路径问题，覆盖 Dijkstra、Bellman-Ford 和 Floyd-Warshall 算法。