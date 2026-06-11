# 第10章 图算法——遍历与基础

> "图是关系网络的数学抽象——从社交网络到网页链接，从交通路线到依赖管理，图的遍历是一切图算法的基石。"

---

## 10.1 图的表示方法

### 10.1.1 图的基本概念

图（Graph）由顶点集合 `V` 和边集合 `E` 组成，记为 `G = (V, E)`。按边的方向性分为：
- **无向图（Undirected Graph）**：边 `(u, v)` 等价于 `(v, u)`
- **有向图（Directed Graph / Digraph）**：边 `u → v` 具有方向

按边是否带权重分为：
- **无权图（Unweighted Graph）**：边仅表示连接关系
- **加权图（Weighted Graph）**：每条边有数值权重

### 10.1.2 邻接矩阵（Adjacency Matrix）

邻接矩阵使用 `V × V` 的二维数组存储图。

```
        ┌───┬───┬───┬───┐
        │ 0 │ 1 │ 2 │ 3 │
    ├───┼───┼───┼───┤
    │ 0 │ 0 │ 1 │ 1 │ 0 │
    ├───┼───┼───┼───┤
    │ 1 │ 1 │ 0 │ 1 │ 0 │
    ├───┼───┼───┼───┤
    │ 2 │ 1 │ 1 │ 0 │ 1 │
    ├───┼───┼───┼───┤
    │ 3 │ 0 │ 0 │ 1 │ 0 │
    └───┴───┴───┴───┘
```

- 无权图：`matrix[u][v] = 1` 表示存在边 `(u, v)`，否则为 0
- 加权图：`matrix[u][v] = w` 表示权重为 w 的边，`∞` 表示无边

**优点：**
- 查询 `hasEdge(u, v)` 的时间复杂度为 O(1)
- 添加/删除边的时间复杂度为 O(1)
- 实现简单，适合稠密图

**缺点：**
- 空间复杂度 O(V²)，对稀疏图浪费严重
- 遍历某个顶点的所有邻接点需要 O(V) 时间（无论实际邻居数）
- 无法存储平行边（同一对顶点间的多条边）

### 10.1.3 邻接表（Adjacency List）

邻接表为每个顶点维护一个链表（或列表），存储其所有邻居。

```
顶点 0 → [1, 2]
顶点 1 → [0, 2]
顶点 2 → [0, 1, 3]
顶点 3 → [2]
```

- 空间复杂度 O(V + E)，适合稀疏图
- 遍历邻接点的时间复杂度 = 实际邻居数

**优点：**
- 空间效率高，适合稀疏图
- 遍历邻接点高效（只需遍历实际邻居）
- 支持平行边（在链表/列表中重复添加即可）

**缺点：**
- 查询 `hasEdge(u, v)` 需要 O(degree(u)) 时间
- 删除边可能需要 O(degree(u)) 时间（需要查找）

**Java 实现方式：**

```java
// 1. 使用 List<Integer>[]
List<Integer>[] graph = new ArrayList[n];
for (int i = 0; i < n; i++) graph[i] = new ArrayList<>();

// 2. 使用 ArrayList<ArrayList<Integer>>
ArrayList<ArrayList<Integer>> graph = new ArrayList<>(n);

// 3. 使用 HashMap（适合顶点编号不连续）
Map<Integer, List<Integer>> graph = new HashMap<>();
```

对于加权图，只需将邻居存储为边对象：

```java
class Edge {
    int to;
    int weight;
}
List<Edge>[] graph = new ArrayList[n];
```

### 10.1.4 边列表（Edge List）

边列表将所有边存储在一个列表中，每条边包含 `(u, v, weight)`。

```java
class Edge {
    int from, to, weight;
}
List<Edge> edgeList = new ArrayList<>();
```

- 空间复杂度 O(E)，最省空间
- 查询 `hasEdge(u, v)` 需要 O(E) 时间
- 主要用于需要迭代所有边的算法（如 Kruskal 最小生成树、Bellman-Ford 最短路径）

### 10.1.5 如何选择表示方式

| 特征 | 邻接矩阵 | 邻接表 | 边列表 |
|------|---------|-------|-------|
| 空间 | O(V²) | O(V+E) | O(E) |
| hasEdge | O(1) | O(度) | O(E) |
| 遍历邻居 | O(V) | O(度) | O(E) |
| 添加边 | O(1) | O(1) | O(1) |
| 删除边 | O(1) | O(度) | O(E) |
| 适用场景 | 稠密图 | 通用（最常用） | 边迭代算法 |

经验法则：
- **稠密图**（E ≈ V²）：用邻接矩阵
- **稀疏图**（E << V²）：用邻接表（绝大多数实际场景）
- **算法需要全局迭代边**：用边列表

---

## 10.2 深度优先搜索（DFS）

深度优先搜索（Depth-First Search）是一种沿着路径尽可能深入，直到无法继续后再回溯的遍历策略。

### 10.2.1 递归实现

```java
void dfs(int v, boolean[] visited, List<Integer>[] graph) {
    visited[v] = true;
    System.out.print(v + " ");          // 前序遍历
    for (int neighbor : graph[v]) {
        if (!visited[neighbor]) {
            dfs(neighbor, visited, graph);
        }
    }
    System.out.print(v + " ");          // 后序遍历
}
```

### 10.2.2 迭代实现（显式栈）

```java
void dfsIterative(int start, List<Integer>[] graph) {
    boolean[] visited = new boolean[graph.length];
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(start);
    while (!stack.isEmpty()) {
        int v = stack.pop();
        if (visited[v]) continue;
        visited[v] = true;
        System.out.print(v + " ");
        // 倒序入栈以模拟递归顺序
        for (int i = graph[v].size() - 1; i >= 0; i--) {
            int neighbor = graph[v].get(i);
            if (!visited[neighbor]) {
                stack.push(neighbor);
            }
        }
    }
}
```

### 10.2.3 遍历顺序

**前序遍历（Pre-order）：** 在访问子节点之前处理当前节点。适用于复制图结构、计算节点深度。

**后序遍历（Post-order）：** 在访问完所有子节点之后处理当前节点。适用于拓扑排序、计算子树大小、释放资源。

### 10.2.4 DFS 的经典应用

**（1）环检测（Cycle Detection）**

对有向图使用三色标记法（White-Gray-Black）：
- **WHITE（0）：** 未访问
- **GRAY（1）：** 正在访问（在当前递归栈中）
- **BLACK（2）：** 访问完成

如果在 DFS 过程中遇到 GRAY 节点，说明存在环。

```java
// 有向图环检测
boolean hasCycle(int v, int[] color, List<Integer>[] graph) {
    color[v] = 1;  // GRAY
    for (int neighbor : graph[v]) {
        if (color[neighbor] == 1) return true;       // 后向边 → 有环
        if (color[neighbor] == 0 && hasCycle(neighbor, color, graph))
            return true;
    }
    color[v] = 2;  // BLACK
    return false;
}
```

**（2）拓扑排序（Topological Sort）**

见 10.5 节。

**（3）连通分量（Connected Components）**

使用 DFS 标记所有连通的顶点，每个 DFS 起始点对应一个连通分量。

**（4）二分图判定（Bipartite Check）**

用两种颜色交替染色，如果相邻节点同色则不是二分图。

---

## 10.3 广度优先搜索（BFS）

广度优先搜索（Breadth-First Search）按照距离从近到远逐层访问节点。

### 10.3.1 队列实现

```java
void bfs(int start, List<Integer>[] graph) {
    boolean[] visited = new boolean[graph.length];
    Queue<Integer> queue = new LinkedList<>();
    visited[start] = true;
    queue.offer(start);
    while (!queue.isEmpty()) {
        int v = queue.poll();
        System.out.print(v + " ");
        for (int neighbor : graph[v]) {
            if (!visited[neighbor]) {
                visited[neighbor] = true;
                queue.offer(neighbor);
            }
        }
    }
}
```

### 10.3.2 分层遍历（Level-Order）

使用分层 BFS 可以获取每个节点到起点的距离：

```java
void bfsLevelOrder(int start, List<Integer>[] graph) {
    boolean[] visited = new boolean[graph.length];
    Queue<Integer> queue = new LinkedList<>();
    visited[start] = true;
    queue.offer(start);
    int level = 0;
    while (!queue.isEmpty()) {
        int size = queue.size();
        System.out.print("Level " + level + ": ");
        for (int i = 0; i < size; i++) {
            int v = queue.poll();
            System.out.print(v + " ");
            for (int neighbor : graph[v]) {
                if (!visited[neighbor]) {
                    visited[neighbor] = true;
                    queue.offer(neighbor);
                }
            }
        }
        System.out.println();
        level++;
    }
}
```

### 10.3.3 BFS 与 DFS 对比

| 特性 | DFS | BFS |
|------|-----|-----|
| 数据结构 | 栈（递归或显式） | 队列 |
| 空间 | O(h)（h 为深度） | O(w)（w 为最大宽度） |
| 最短路径 | ❌ 不保证 | ✅ 无权图的最短路径 |
| 连通分量 | ✅ | ✅ |
| 环检测 | ✅（三色法） | ✅ |
| 拓扑排序 | ✅（后序逆序） | ✅（Kahn 算法） |

### 10.3.4 BFS 的经典应用

**（1）无权图最短路径**

BFS 首次访问某个节点时的路径一定是最短的（因为 BFS 按距离递增的顺序访问）。

```java
// 返回从 start 到所有节点的最短距离
int[] shortestPath(int start, List<Integer>[] graph) {
    int n = graph.length;
    int[] dist = new int[n];
    Arrays.fill(dist, -1);
    Queue<Integer> queue = new LinkedList<>();
    dist[start] = 0;
    queue.offer(start);
    while (!queue.isEmpty()) {
        int v = queue.poll();
        for (int neighbor : graph[v]) {
            if (dist[neighbor] == -1) {
                dist[neighbor] = dist[v] + 1;
                queue.offer(neighbor);
            }
        }
    }
    return dist;
}
```

**（2）单词接龙（Word Ladder）**

给定起始单词和结束单词，每次改变一个字母，求最短变换路径长度。将每个单词视为顶点，相差一个字母的单词间连边，跑 BFS 即可。

**（3）二分图判定（BFS 版本）**

与 DFS 类似，用 BFS 染色检查相邻节点是否同色。

---

## 10.4 连通分量与割点

### 10.4.1 无向图的连通分量（Connected Components）

无向图中，如果两个顶点之间存在路径，则它们属于同一个连通分量。

```java
int connectedComponents(List<Integer>[] graph) {
    int n = graph.length;
    boolean[] visited = new boolean[n];
    int count = 0;
    for (int v = 0; v < n; v++) {
        if (!visited[v]) {
            dfs(v, visited, graph);
            count++;
        }
    }
    return count;
}
```

### 10.4.2 有向图的强连通分量（Strongly Connected Components, SCC）

在有向图中，如果两个顶点互相可达，则它们属于同一个强连通分量。SCC 将图分解为多个"互相可达"的团块。

**Kosaraju 算法：**

1. 在原始图上做 DFS，按**完成时间**的顺序将顶点入栈（后序）
2. 反转所有边的方向，得到反向图
3. 按栈的顺序（完成时间从晚到早）在反向图上做 DFS
4. 每次 DFS 找到的顶点集合就是一个 SCC

```
步骤 1: 在原始图上 DFS，记录后序顺序
步骤 2: 反转图
步骤 3: 按后序的逆序在反转图上 DFS
步骤 4: 每次 DFS 标记一个 SCC

时间复杂度: O(V + E)
空间复杂度: O(V + E)
```

**Tarjan 算法（单次 DFS 完成）：**

Kosaraju 需要两次 DFS，而 Tarjan 算法只需一次 DFS，使用 `disc[v]`（发现时间）和 `low[v]`（可回溯的最早祖先）两个数组来识别 SCC。

### 10.4.3 割点（Articulation Points / Cut Vertices）

**定义：** 在无向连通图中，如果移除顶点 v 会导致图不连通，则 v 是割点。

**Tarjan 算法寻找割点：**

使用 DFS 树，对每个顶点 v 维护：
- `disc[v]`：顶点 v 在 DFS 中被发现的顺序（时间戳）
- `low[v]`：从 v 出发，通过 DFS 树中的子孙边和一条回边可以到达的最小 `disc` 值

割点的判定条件：
- 如果 v 是 DFS 树的根节点，且有两个或以上子节点，则 v 是割点
- 如果 v 不是根节点，且存在子节点 u 使得 `low[u] >= disc[v]`，则 v 是割点

```
割点判定示例：
        1
       / \
      2---3
     / \
    4   5

顶点 1: 有两个子节点 → 割点
顶点 2: 子节点 4 的 low[4]=4 >= disc[2]=2 → 割点
顶点 3: 存在回边到 1 → 不是割点
```

### 10.4.4 桥（Bridge / Cut Edge）

**定义：** 在无向连通图中，如果移除边 e 会导致图不连通，则 e 是桥。

桥的判定条件：`low[u] > disc[v]`（注意是严格大于，不含等号）。

---

## 10.5 拓扑排序

**拓扑排序（Topological Sort）** 是 DAG（有向无环图）的顶点线性排列，满足对每条有向边 `u → v`，排序中 u 在 v 之前。

### 10.5.1 Kahn 算法（BFS 实现）

利用入度（indegree）数组，不断移除入度为 0 的顶点：

```
1. 计算所有顶点的入度
2. 将入度为 0 的顶点入队
3. 循环：出队一个顶点，加入结果
   将其所有邻居的入度减 1
   如果邻居入度变为 0，入队
4. 如果结果顶点数 < 总顶点数，说明存在环
```

```java
List<Integer> kahnSort(List<Integer>[] graph) {
    int n = graph.length;
    int[] indegree = new int[n];
    for (int u = 0; u < n; u++)
        for (int v : graph[u])
            indegree[v]++;

    Queue<Integer> queue = new LinkedList<>();
    for (int i = 0; i < n; i++)
        if (indegree[i] == 0) queue.offer(i);

    List<Integer> result = new ArrayList<>();
    while (!queue.isEmpty()) {
        int u = queue.poll();
        result.add(u);
        for (int v : graph[u]) {
            if (--indegree[v] == 0)
                queue.offer(v);
        }
    }

    if (result.size() != n) throw new RuntimeException("Graph has a cycle!");
    return result;
}
```

### 10.5.2 DFS 拓扑排序

利用 DFS 的后序遍历（post-order），将"完成访问"的顶点加入栈，最后从栈顶依次取出即为拓扑序：

```java
void dfsTopo(int v, boolean[] visited, Deque<Integer> stack, List<Integer>[] graph) {
    visited[v] = true;
    for (int neighbor : graph[v]) {
        if (!visited[neighbor])
            dfsTopo(neighbor, visited, stack, graph);
    }
    stack.push(v);  // 后序入栈
}

List<Integer> topologicalSort(List<Integer>[] graph) {
    int n = graph.length;
    boolean[] visited = new boolean[n];
    Deque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < n; i++)
        if (!visited[i])
            dfsTopo(i, visited, stack, graph);
    List<Integer> result = new ArrayList<>();
    while (!stack.isEmpty())
        result.add(stack.pop());
    return result;
}
```

### 10.5.3 DAG 检测（环检测）

Kahn 算法的副产品：如果结果集大小不等于 n，则图有环。

DFS 拓扑排序的副产品：DFS 过程中用三色法检测环。

### 10.5.4 拓扑排序的典型应用

**课程安排（Course Scheduling）：** 某些课程有先修要求（如"数据结构"必须先修"程序设计"）。将课程作为顶点，先修关系作为有向边，拓扑排序给出一个合法的选课顺序。

**依赖解析（Dependency Resolution）：** 软件包管理器（如 Maven、npm）解析依赖时使用拓扑排序。如果有循环依赖（A 依赖 B，B 依赖 A），则无法解析——这正是环检测的作用。

**任务调度（Task Scheduling）：** 构建系统（如 Makefile）使用拓扑排序确定任务的执行顺序。

---

## 本章小结

1. **图的表示**：邻接矩阵适合稠密图（O(1) 查询），邻接表适合稀疏图（广泛使用），边列表适合全局边迭代

2. **DFS**：递归或栈实现，按深度优先访问。应用包括环检测（三色法）、连通分量、拓扑排序、二分图判定

3. **BFS**：队列实现，按层级访问。在无权图中保证最短路径，应用包括分层遍历、单词接龙、二分图判定

4. **连通分量与割点**：
   - 无向图：DFS/BFS 遍历计数连通分量
   - 有向图：Kosaraju（两次 DFS）或 Tarjan（一次 DFS）求 SCC
   - Tarjan 算法寻找割点：`low[u] >= disc[v]`
   - Tarjan 算法寻找桥：`low[u] > disc[v]`

5. **拓扑排序**：Kahn 算法（BFS + 入度）和 DFS 后序逆序，都要求图是 DAG

> "图遍历是理解图结构的窗口——DFS 探索深度，BFS 丈量距离。掌握了这两种遍历，你就掌握了处理图问题的一半力量。"