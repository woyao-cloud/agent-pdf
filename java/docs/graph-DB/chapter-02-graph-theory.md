# 第2章 图论基础：从数学定义到图数据库工程实践

> **摘要：** 图论是图数据库的数学基石。本章从图的数学定义出发，系统讲解图的分类、存储表示、经典遍历与路径算法，并通过完整的 Java 代码示例展示每项技术如何映射到图数据库的工程实践中。读者将理解：为什么邻接表是图数据库的主流存储模型、CSR 格式为何成为高性能图计算引擎的标配、Dijkstra 与 Bellman-Ford 在什么场景下分别适用，以及最大流算法如何服务于社交网络中的社区发现。

---

## 2.1 图的定义与分类

### 2.1.1 解决的问题

在关系型数据库中，多对多关系需要中间表来建模，查询时依赖多层 JOIN，性能随关联深度指数下降。图论提供了一种**以边为中心**的数学抽象，将实体（顶点）与关系（边）作为一等公民，使得"朋友的朋友的朋友"这类深度关联查询可以在一次遍历中完成。

### 2.1.2 核心原理

**图 (Graph)** 是一个有序对 $G = (V, E)$，其中：
- $V$ 是顶点（Vertex）的有限集合
- $E$ 是边（Edge）的有限集合，每条边连接两个顶点

**图的分类体系：**

| 分类维度 | 类型 | 定义 | 图数据库对应 |
|---------|------|------|------------|
| 方向性 | 有向图 (Directed) | 边有方向，$(u,v) \neq (v,u)$ | 关注关系、超链接 |
| 方向性 | 无向图 (Undirected) | 边无方向，$(u,v) = (v,u)$ | 好友关系、道路网络 |
| 权重 | 加权图 (Weighted) | 边带有数值权重 | 最短路径、推荐评分 |
| 权重 | 无权图 (Unweighted) | 边仅表示连接 | 权限图谱、血缘关系 |
| 边数 | 简单图 (Simple) | 无自环、无重边 | 大多数业务场景 |
| 边数 | 多重图 (Multigraph) | 允许两顶点间多条边 | 交通网络（多条航线） |
| 结构 | 二分图 (Bipartite) | $V$ 可划分为两个不相交集合，所有边跨集合连接 | 用户-商品、演员-电影 |
| 结构 | 完全图 (Complete) | 任意两顶点间都有边，$K_n$ 有 $\frac{n(n-1)}{2}$ 条边 | 全连接网络 |

**二分图**在推荐系统中极为重要：用户集合 $U$ 与商品集合 $I$ 之间的所有边都跨越 $U$ 和 $I$，没有 $U$ 内部或 $I$ 内部的边。基于二分图的协同过滤是图数据库推荐引擎的核心数学基础。

### 2.1.3 代码实现

```java
// GraphClassification.java — 图的分类体系基础接口
import java.util.*;

interface Graph {
    void addEdge(int u, int v);
    void addEdge(int u, int v, double weight);
    int vertexCount();
    int edgeCount();
    boolean isDirected();
    boolean isWeighted();
}

class DirectedGraph implements Graph {
    protected final int V;
    protected int E;
    protected final boolean weighted;
    protected final List<List<int[]>> adj; // [neighbor, weight]

    public DirectedGraph(int V, boolean weighted) {
        this.V = V;
        this.weighted = weighted;
        this.adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int u, int v) { addEdge(u, v, 1); }

    public void addEdge(int u, int v, double weight) {
        adj.get(u).add(new int[]{v, (int)weight});
        E++;
    }

    public int vertexCount() { return V; }
    public int edgeCount() { return E; }
    public boolean isDirected() { return true; }
    public boolean isWeighted() { return weighted; }
    public List<int[]> neighbors(int v) { return adj.get(v); }
}

class UndirectedGraph extends DirectedGraph {
    public UndirectedGraph(int V, boolean weighted) { super(V, weighted); }

    @Override
    public void addEdge(int u, int v, double weight) {
        super.addEdge(u, v, weight);
        super.addEdge(v, u, weight);
        E--; // 父类加了两次，修正计数
    }
}

class BipartiteGraph {
    private final int leftSize, rightSize;
    private final List<List<Integer>> adj;

    public BipartiteGraph(int left, int right) {
        this.leftSize = left;
        this.rightSize = right;
        this.adj = new ArrayList<>(left);
        for (int i = 0; i < left; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int left, int right) {
        adj.get(left).add(right);
    }

    public boolean isBipartiteCheck() {
        int total = leftSize + rightSize;
        int[] color = new int[total];
        Arrays.fill(color, -1);
        Queue<Integer> q = new LinkedList<>();
        for (int i = 0; i < total; i++) {
            if (color[i] == -1) {
                color[i] = 0;
                q.offer(i);
                while (!q.isEmpty()) {
                    int u = q.poll();
                    List<Integer> neighbors = u < leftSize ? adj.get(u) : getReverseNeighbors(u);
                    for (int v : neighbors) {
                        if (color[v] == -1) { color[v] = 1 - color[u]; q.offer(v); }
                        else if (color[v] == color[u]) return false;
                    }
                }
            }
        }
        return true;
    }

    private List<Integer> getReverseNeighbors(int right) { return List.of(); }
}
```

### 2.1.4 使用场景

- **有向图**：Twitter/X 的关注关系、网页超链接、区块链交易
- **无向图**：Facebook 好友、通信网络、分子结构
- **加权图**：地图导航（距离）、社交推荐（亲密度）
- **二分图**：电商推荐（用户-商品）、招聘平台（求职者-职位）
- **完全图**：集群内部全互联拓扑

### 2.1.5 潜在风险与注意事项

- 多重图在存储时需注意边 ID 的唯一性，图数据库（如 Neo4j）通过内部 ID 区分重边
- 二分图判定是图着色的特例，可用 BFS 染色法在 $O(V+E)$ 时间内完成
- 完全图的边数随顶点数平方增长，$K_{10000}$ 就有约 5000 万条边，必须使用压缩存储

### 2.1.6 本章小结

图的分类决定了存储模型和算法选择。图数据库的核心优势在于**原生处理有向/无向、加权/无权、多重边**等丰富的关系类型，而关系型数据库需要额外建表才能模拟这些语义。

---

## 2.2 图的存储表示

### 2.2.1 解决的问题

图在内存中如何布局，直接决定了算法的时间复杂度和缓存局部性。选择不当会导致 $O(V^2)$ 的空间浪费或 $O(V)$ 的边查询延迟。

### 2.2.2 核心原理

三种主流存储格式的对比：

| 格式 | 空间复杂度 | 边存在性检查 | 遍历邻居 | 适用场景 |
|------|-----------|-------------|---------|---------|
| 邻接矩阵 | $O(V^2)$ | $O(1)$ | $O(V)$ | 稠密图、小规模 |
| 邻接表 | $O(V+E)$ | $O(deg(v))$ | $O(deg(v))$ | 稀疏图、图数据库 |
| CSR | $O(V+E)$ | $O(\log deg(v))$ | $O(deg(v))$ | 高性能计算、只读图 |

#### 邻接矩阵 (Adjacency Matrix)

用 $V \times V$ 的二维数组 $A$ 表示图，$A[i][j] = w$ 表示从 $i$ 到 $j$ 的边权重为 $w$，$0$ 或 $\infty$ 表示无边。

**优点**：边查询 $O(1)$，适合 Floyd-Warshall 等需要频繁随机访问边的算法。
**缺点**：$V=10^5$ 时需 $10^{10}$ 个元素（约 40GB），完全不可行。

#### 邻接表 (Adjacency List)

每个顶点维护一个邻居列表。图数据库（Neo4j、JanusGraph）的物理存储模型本质上是邻接表——每个节点记录其关联边的指针列表。

**优点**：空间与边数成正比，遍历邻居高效。
**缺点**：边存在性检查需遍历邻居列表。

#### CSR (Compressed Sparse Row)

用三个数组压缩存储稀疏图：
- `offset[V+1]`：每个顶点的邻居在 `edges` 中的起始位置
- `edges[E]`：所有邻居按顶点顺序排列
- `weights[E]`：对应的边权重（可选）

CSR 是 GraphX、Galois、Ligra 等高性能图计算系统的标准格式。其缓存局部性远优于邻接表——同一顶点的邻居在内存中连续排列。

### 2.2.3 代码实现

```java
// GraphStorage.java — 三种存储格式的完整实现
import java.util.*;

// ========== 1. 邻接矩阵 ==========
class AdjacencyMatrix {
    private final int V;
    private final double[][] matrix;
    private static final double INF = Double.POSITIVE_INFINITY;

    public AdjacencyMatrix(int V) {
        this.V = V;
        this.matrix = new double[V][V];
        for (int i = 0; i < V; i++) Arrays.fill(matrix[i], INF);
        for (int i = 0; i < V; i++) matrix[i][i] = 0;
    }

    public void addEdge(int u, int v, double w) { matrix[u][v] = w; }

    public boolean hasEdge(int u, int v) { return matrix[u][v] != INF && u != v; }

    public double getWeight(int u, int v) { return matrix[u][v]; }

    public List<Integer> neighbors(int u) {
        List<Integer> res = new ArrayList<>();
        for (int v = 0; v < V; v++)
            if (matrix[u][v] != INF && u != v) res.add(v);
        return res;
    }

    public long memoryBytes() { return (long) V * V * 8; } // double = 8 bytes
}

// ========== 2. 邻接表 ==========
class AdjacencyList {
    private final int V;
    private final List<List<int[]>> adj; // [neighbor, weight]

    public AdjacencyList(int V) {
        this.V = V;
        this.adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int u, int v, int w) { adj.get(u).add(new int[]{v, w}); }

    public boolean hasEdge(int u, int v) {
        for (int[] e : adj.get(u)) if (e[0] == v) return true;
        return false;
    }

    public List<int[]> neighbors(int u) { return adj.get(u); }

    public int degree(int u) { return adj.get(u).size(); }

    public long memoryBytes() {
        long bytes = (long) V * 40; // ArrayList overhead
        for (int u = 0; u < V; u++)
            bytes += (long) adj.get(u).size() * 32; // int[] + Node overhead
        return bytes;
    }
}

// ========== 3. CSR 格式 ==========
class CSRGraph {
    private final int V;
    private final int[] offset;
    private final int[] edges;
    private final float[] weights;
    private final boolean weighted;

    public CSRGraph(int V, int[] offset, int[] edges) {
        this(V, offset, edges, null);
    }

    public CSRGraph(int V, int[] offset, int[] edges, float[] weights) {
        this.V = V;
        this.offset = offset;
        this.edges = edges;
        this.weights = weights;
        this.weighted = weights != null;
    }

    /** 从邻接表构建 CSR */
    public static CSRGraph fromAdjList(AdjacencyList adjList, boolean weighted) {
        int V = adjList.vertexCount();
        int[] offset = new int[V + 1];
        // 第一遍：计算每个顶点的度
        for (int u = 0; u < V; u++) offset[u + 1] = adjList.degree(u);
        // 前缀和
        for (int i = 1; i <= V; i++) offset[i] += offset[i - 1];
        int E = offset[V];
        int[] edges = new int[E];
        float[] weights = weighted ? new float[E] : null;
        // 第二遍：填充
        int[] cursor = new int[V];
        for (int u = 0; u < V; u++) cursor[u] = offset[u];
        for (int u = 0; u < V; u++) {
            for (int[] e : adjList.neighbors(u)) {
                int pos = cursor[u]++;
                edges[pos] = e[0];
                if (weighted) weights[pos] = e[1];
            }
        }
        return new CSRGraph(V, offset, edges, weights);
    }

    public int vertexCount() { return V; }
    public int edgeCount() { return edges.length; }

    /** 获取顶点 u 的邻居范围 [start, end) */
    public int[] neighborRange(int u) {
        return new int[]{offset[u], offset[u + 1]};
    }

    public int neighborAt(int pos) { return edges[pos]; }
    public float weightAt(int pos) { return weighted ? weights[pos] : 1.0f; }

    /** 二分查找边是否存在 */
    public boolean hasEdge(int u, int v) {
        int start = offset[u], end = offset[u + 1];
        // 邻居按顶点 ID 排序时可二分
        int idx = Arrays.binarySearch(edges, start, end, v);
        return idx >= 0;
    }

    public long memoryBytes() {
        return (long) (V + 1) * 4 + (long) edges.length * 4
             + (weighted ? (long) weights.length * 4 : 0);
    }
}

// ========== 4. CSC 格式（列压缩，适合入边遍历） ==========
class CSCGraph {
    private final int V;
    private final int[] offset;
    private final int[] edges;
    private final float[] weights;

    public CSCGraph(int V, int[] offset, int[] edges, float[] weights) {
        this.V = V;
        this.offset = offset;
        this.edges = edges;
        this.weights = weights;
    }

    /** 从 CSR 转置得到 CSC（即反向图） */
    public static CSCGraph transpose(CSRGraph csr) {
        int V = csr.vertexCount();
        int E = csr.edgeCount();
        int[] outDeg = new int[V];
        for (int u = 0; u < V; u++) {
            int[] range = csr.neighborRange(u);
            for (int p = range[0]; p < range[1]; p++) outDeg[csr.neighborAt(p)]++;
        }
        int[] offset = new int[V + 1];
        for (int v = 0; v < V; v++) offset[v + 1] = offset[v] + outDeg[v];
        int[] edges = new int[E];
        float[] weights = new float[E];
        int[] cursor = new int[V];
        for (int v = 0; v < V; v++) cursor[v] = offset[v];
        for (int u = 0; u < V; u++) {
            int[] range = csr.neighborRange(u);
            for (int p = range[0]; p < range[1]; p++) {
                int v = csr.neighborAt(p);
                int pos = cursor[v]++;
                edges[pos] = u;
                weights[pos] = csr.weightAt(p);
            }
        }
        return new CSCGraph(V, offset, edges, weights);
    }

    /** 获取顶点 v 的入边 */
    public int[] inNeighbors(int v) {
        int start = offset[v], end = offset[v + 1];
        return Arrays.copyOfRange(edges, start, end);
    }
}
```

### 2.2.4 使用场景

- **邻接矩阵**：Floyd-Warshall 全源最短路径、稠密图（$E \approx V^2$）、顶点数小于 10000
- **邻接表**：图数据库的物理存储模型、大多数图算法、动态图（频繁增删边）
- **CSR**：PageRank、BFS 等迭代式图计算、GPU 图计算、只读快照查询
- **CSC**：需要高效入边遍历的算法（如 PageRank 的汇聚阶段、反向 BFS）

### 2.2.5 潜在风险与注意事项

- **邻接矩阵的内存爆炸**：$V=10^5$ 时矩阵需要 40GB（double），实际工程中几乎不用邻接矩阵存储大规模图
- **CSR 的构建代价**：需要两遍扫描，不适合频繁更新的动态图
- **CSR 的边存在性检查**：如果邻居未排序，需要 $O(deg(v))$ 遍历；排序后可用二分查找降至 $O(\log deg(v))$
- **图数据库的存储选择**：Neo4j 使用类似邻接表的"免索引邻接"（index-free adjacency），每个节点直接存储关系指针链表，遍历时无需全局索引查找

### 2.2.6 本章小结

CSR 是高性能图计算的事实标准，邻接表是图数据库的主流选择。理解这三种格式的时空权衡，是设计图存储引擎和选择算法的基础。

---

## 2.3 图的遍历

### 2.3.1 解决的问题

遍历是图算法的基础操作——从某个顶点出发，按特定策略访问所有可达顶点。深度优先搜索（DFS）和广度优先搜索（BFS）是两种最基本的遍历策略，分别对应栈和队列两种数据结构。

### 2.3.2 核心原理

**DFS (Depth-First Search)**：沿着一条路径走到黑，再回溯。使用栈（递归调用栈或显式栈）。
- 时间复杂度：$O(V+E)$
- 空间复杂度：$O(V)$（递归栈或显式栈）
- 应用：拓扑排序、连通分量、环检测、二分图判定

**BFS (Breadth-First Search)**：按层逐层扩展，先访问离起点最近的顶点。使用队列。
- 时间复杂度：$O(V+E)$
- 空间复杂度：$O(V)$（队列）
- 应用：无权图最短路径、社交网络"几度好友"、Web 爬虫

### 2.3.3 代码实现

```java
// GraphTraversal.java — DFS 与 BFS 的完整实现
import java.util.*;

class TraversalAlgorithms {

    // ========== DFS 递归实现 ==========
    public static List<Integer> dfsRecursive(List<List<Integer>> adj, int start) {
        int V = adj.size();
        boolean[] visited = new boolean[V];
        List<Integer> result = new ArrayList<>();
        dfsHelper(adj, start, visited, result);
        return result;
    }

    private static void dfsHelper(List<List<Integer>> adj, int u,
                                   boolean[] visited, List<Integer> result) {
        visited[u] = true;
        result.add(u);
        for (int v : adj.get(u)) {
            if (!visited[v]) dfsHelper(adj, v, visited, result);
        }
    }

    // ========== DFS 显式栈实现（避免递归栈溢出） ==========
    public static List<Integer> dfsIterative(List<List<Integer>> adj, int start) {
        int V = adj.size();
        boolean[] visited = new boolean[V];
        List<Integer> result = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);

        while (!stack.isEmpty()) {
            int u = stack.pop();
            if (visited[u]) continue;
            visited[u] = true;
            result.add(u);
            // 逆序入栈以保持与递归相同的访问顺序
            List<Integer> neighbors = adj.get(u);
            for (int i = neighbors.size() - 1; i >= 0; i--) {
                int v = neighbors.get(i);
                if (!visited[v]) stack.push(v);
            }
        }
        return result;
    }

    // ========== BFS 队列实现 ==========
    public static List<Integer> bfs(List<List<Integer>> adj, int start) {
        int V = adj.size();
        boolean[] visited = new boolean[V];
        List<Integer> result = new ArrayList<>();
        Queue<Integer> queue = new LinkedList<>();
        visited[start] = true;
        queue.offer(start);

        while (!queue.isEmpty()) {
            int u = queue.poll();
            result.add(u);
            for (int v : adj.get(u)) {
                if (!visited[v]) {
                    visited[v] = true;
                    queue.offer(v);
                }
            }
        }
        return result;
    }

    // ========== BFS 求无权图最短路径 ==========
    public static int[] shortestPathUnweighted(List<List<Integer>> adj, int start) {
        int V = adj.size();
        int[] dist = new int[V];
        Arrays.fill(dist, -1);
        Queue<Integer> queue = new LinkedList<>();
        dist[start] = 0;
        queue.offer(start);

        while (!queue.isEmpty()) {
            int u = queue.poll();
            for (int v : adj.get(u)) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    queue.offer(v);
                }
            }
        }
        return dist;
    }

    // ========== 连通分量检测 ==========
    public static List<List<Integer>> connectedComponents(List<List<Integer>> adj) {
        int V = adj.size();
        boolean[] visited = new boolean[V];
        List<List<Integer>> components = new ArrayList<>();

        for (int i = 0; i < V; i++) {
            if (!visited[i]) {
                List<Integer> comp = new ArrayList<>();
                dfsHelper(adj, i, visited, comp);
                components.add(comp);
            }
        }
        return components;
    }

    // ========== 拓扑排序（Kahn 算法，BFS 变体） ==========
    public static List<Integer> topologicalSort(List<List<Integer>> adj) {
        int V = adj.size();
        int[] inDegree = new int[V];
        for (int u = 0; u < V; u++)
            for (int v : adj.get(u)) inDegree[v]++;

        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < V; i++)
            if (inDegree[i] == 0) queue.offer(i);

        List<Integer> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            result.add(u);
            for (int v : adj.get(u))
                if (--inDegree[v] == 0) queue.offer(v);
        }
        // 如果 result.size() < V，说明存在环
        return result;
    }

    // ========== 环检测（DFS 染色法） ==========
    public static boolean hasCycle(List<List<Integer>> adj) {
        int V = adj.size();
        int[] state = new int[V]; // 0=未访问, 1=访问中, 2=已结束
        for (int i = 0; i < V; i++)
            if (state[i] == 0 && dfsCycleDetect(adj, i, state)) return true;
        return false;
    }

    private static boolean dfsCycleDetect(List<List<Integer>> adj, int u, int[] state) {
        state[u] = 1;
        for (int v : adj.get(u)) {
            if (state[v] == 1) return true; // 发现回边
            if (state[v] == 0 && dfsCycleDetect(adj, v, state)) return true;
        }
        state[u] = 2;
        return false;
    }

    // ========== 测试主函数 ==========
    public static void main(String[] args) {
        // 构建图: 0-1-2-3, 0-4
        int V = 5;
        List<List<Integer>> adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
        adj.get(0).add(1); adj.get(1).add(0);
        adj.get(1).add(2); adj.get(2).add(1);
        adj.get(2).add(3); adj.get(3).add(2);
        adj.get(0).add(4); adj.get(4).add(0);

        System.out.println("DFS 递归: " + dfsRecursive(adj, 0));
        System.out.println("DFS 栈:   " + dfsIterative(adj, 0));
        System.out.println("BFS:      " + bfs(adj, 0));

        int[] dist = shortestPathUnweighted(adj, 0);
        System.out.println("到各点距离: " + Arrays.toString(dist));

        System.out.println("连通分量: " + connectedComponents(adj));
        System.out.println("有环? " + hasCycle(adj));
    }
}
```

### 2.3.4 使用场景

| 算法 | 图数据库查询 | 工程场景 |
|------|------------|---------|
| DFS | `MATCH (a)-[*]->(b)` 深度路径匹配 | 依赖分析、血缘追踪、权限传播 |
| BFS | 社交"几度好友"查询 | 推荐系统、欺诈团伙发现 |
| 拓扑排序 | 任务依赖调度 | 构建系统（Makefile、Maven）、ETL 流水线 |
| 连通分量 | 社区发现 | 社交网络聚类、金融洗钱网络识别 |
| 环检测 | 死锁检测 | 事务依赖分析、循环引用检查 |

### 2.3.5 潜在风险与注意事项

- **递归 DFS 的栈溢出**：当图深度超过 JVM 默认栈深度（通常约 10000 层）时，递归 DFS 会抛出 `StackOverflowError`。生产环境应使用显式栈实现
- **BFS 的内存消耗**：BFS 队列在最坏情况下（如完全图）可能存储 $O(V)$ 个顶点，对于十亿级图需要仔细管理内存
- **有向图的连通分量**：有向图需区分"弱连通分量"（忽略方向）和"强连通分量"（Kosaraju/Tarjan 算法）
- **图数据库中的遍历优化**：Neo4j 的遍历框架支持"路径唯一性"和"节点唯一性"检查，避免重复访问和无限循环

### 2.3.6 本章小结

DFS 和 BFS 是所有高级图算法的基础。DFS 擅长路径探索和结构分析（环、拓扑序），BFS 擅长最短路径和层级查询。在图数据库中，BFS 是社交网络"几度好友"查询的默认实现，而 DFS 是深度路径匹配的核心引擎。

---

## 2.4 最短路径算法

### 2.4.1 解决的问题

在加权图中找到从源点到目标点的最小代价路径。这是图数据库最频繁的查询类型之一——从"两地之间的最短驾车路线"到"社交网络中影响力传播的最短路径"。

### 2.4.2 核心原理

三种经典算法各有适用场景：

| 算法 | 时间复杂度 | 限制 | 特点 |
|------|-----------|------|------|
| Dijkstra | $O((V+E)\log V)$ | 无负权边 | 单源最快 |
| Bellman-Ford | $O(VE)$ | 无负权环 | 支持负权边 |
| Floyd-Warshall | $O(V^3)$ | 无负权环 | 全源最短路径 |

**Dijkstra 核心思想**：贪心策略，每次选择当前距离最小的未处理顶点，松弛其所有出边。使用优先队列（最小堆）优化后，每次提取最小距离顶点 $O(\log V)$。

**Bellman-Ford 核心思想**：动态规划，对每条边进行 $V-1$ 轮松弛。第 $k$ 轮后得到的是最多经过 $k$ 条边的最短路径。第 $V$ 轮如果还能松弛，说明存在负权环。

**Floyd-Warshall 核心思想**：动态规划，$dist[i][j] = \min(dist[i][j], dist[i][k] + dist[k][j])$，枚举中间顶点 $k$。

### 2.4.3 代码实现

```java
// ShortestPath.java — 三种最短路径算法的完整实现
import java.util.*;

class ShortestPath {

    static class Edge {
        int to;
        int weight;
        Edge(int to, int weight) { this.to = to; this.weight = weight; }
    }

    // ========== Dijkstra（优先队列优化） ==========
    public static int[] dijkstra(List<List<Edge>> adj, int start) {
        int V = adj.size();
        int[] dist = new int[V];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[start] = 0;

        // [距离, 顶点]
        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
        pq.offer(new int[]{0, start});

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int d = cur[0], u = cur[1];
            if (d > dist[u]) continue; // 过期条目

            for (Edge e : adj.get(u)) {
                int nd = d + e.weight;
                if (nd < dist[e.to]) {
                    dist[e.to] = nd;
                    pq.offer(new int[]{nd, e.to});
                }
            }
        }
        return dist;
    }

    // ========== Dijkstra 带路径还原 ==========
    public static int[] dijkstraWithPath(List<List<Edge>> adj, int start, int[] parent) {
        int V = adj.size();
        int[] dist = new int[V];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(parent, -1);
        dist[start] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
        pq.offer(new int[]{0, start});

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int d = cur[0], u = cur[1];
            if (d > dist[u]) continue;

            for (Edge e : adj.get(u)) {
                int nd = d + e.weight;
                if (nd < dist[e.to]) {
                    dist[e.to] = nd;
                    parent[e.to] = u;
                    pq.offer(new int[]{nd, e.to});
                }
            }
        }
        return dist;
    }

    public static List<Integer> reconstructPath(int start, int end, int[] parent) {
        List<Integer> path = new ArrayList<>();
        for (int v = end; v != -1; v = parent[v]) path.add(v);
        Collections.reverse(path);
        if (path.get(0) != start) return List.of(); // 不可达
        return path;
    }

    // ========== Bellman-Ford ==========
    public static int[] bellmanFord(List<List<Edge>> adj, int start) {
        int V = adj.size();
        int[] dist = new int[V];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[start] = 0;

        // V-1 轮松弛
        for (int i = 1; i < V; i++) {
            boolean updated = false;
            for (int u = 0; u < V; u++) {
                if (dist[u] == Integer.MAX_VALUE) continue;
                for (Edge e : adj.get(u)) {
                    if (dist[u] + e.weight < dist[e.to]) {
                        dist[e.to] = dist[u] + e.weight;
                        updated = true;
                    }
                }
            }
            if (!updated) break; // 提前终止
        }

        // 第 V 轮检测负权环
        for (int u = 0; u < V; u++) {
            if (dist[u] == Integer.MAX_VALUE) continue;
            for (Edge e : adj.get(u)) {
                if (dist[u] + e.weight < dist[e.to]) {
                    throw new RuntimeException("Graph contains a negative-weight cycle");
                }
            }
        }
        return dist;
    }

    // ========== Floyd-Warshall ==========
    public static int[][] floydWarshall(int[][] graph) {
        int V = graph.length;
        int[][] dist = new int[V][V];
        for (int i = 0; i < V; i++) System.arraycopy(graph[i], 0, dist[i], 0, V);

        for (int k = 0; k < V; k++)
            for (int i = 0; i < V; i++)
                for (int j = 0; j < V; j++)
                    if (dist[i][k] != Integer.MAX_VALUE && dist[k][j] != Integer.MAX_VALUE
                            && dist[i][k] + dist[k][j] < dist[i][j])
                        dist[i][j] = dist[i][k] + dist[k][j];

        return dist;
    }

    // ========== 测试 ==========
    public static void main(String[] args) {
        int V = 5;
        List<List<Edge>> adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());

        // 0 -> 1(4), 0 -> 2(2)
        // 1 -> 2(1), 1 -> 3(5)
        // 2 -> 3(8), 2 -> 4(10)
        // 3 -> 4(2)
        adj.get(0).add(new Edge(1, 4)); adj.get(0).add(new Edge(2, 2));
        adj.get(1).add(new Edge(2, 1)); adj.get(1).add(new Edge(3, 5));
        adj.get(2).add(new Edge(3, 8)); adj.get(2).add(new Edge(4, 10));
        adj.get(3).add(new Edge(4, 2));

        System.out.println("=== Dijkstra ===");
        int[] dist = dijkstra(adj, 0);
        System.out.println("从 0 出发: " + Arrays.toString(dist));

        int[] parent = new int[V];
        dijkstraWithPath(adj, 0, parent);
        System.out.println("0->4 路径: " + reconstructPath(0, 4, parent));

        System.out.println("\n=== Bellman-Ford ===");
        int[] bf = bellmanFord(adj, 0);
        System.out.println("从 0 出发: " + Arrays.toString(bf));

        System.out.println("\n=== Floyd-Warshall ===");
        int INF = Integer.MAX_VALUE;
        int[][] graph = {
            {0, 4, 2, INF, INF},
            {INF, 0, 1, 5, INF},
            {INF, INF, 0, 8, 10},
            {INF, INF, INF, 0, 2},
            {INF, INF, INF, INF, 0}
        };
        int[][] allPairs = floydWarshall(graph);
        for (int i = 0; i < V; i++)
            System.out.println(i + ": " + Arrays.toString(allPairs[i]));
    }
}
```

### 2.4.4 使用场景

| 算法 | 图数据库查询 | 工程场景 |
|------|------------|---------|
| Dijkstra | `MATCH (a)-[r*]->(b) WHERE ... RETURN path ORDER BY cost` | 地图导航、网络路由、推荐路径 |
| Bellman-Ford | 含负权边的金融路径 | 套利检测（汇率转换）、能量最小路径 |
| Floyd-Warshall | 全源最短路径预计算 | 物流网络规划、社交网络"所有用户间最短距离" |
| A*（Dijkstra 变体） | 带启发式的最短路径 | 地图导航（结合地理坐标加速） |

### 2.4.5 潜在风险与注意事项

- **Dijkstra 不支持负权边**：负权边会破坏贪心性质——已确定最短距离的顶点可能在后续被更短的负权路径更新
- **Bellman-Ford 的性能瓶颈**：$O(VE)$ 在大规模图上不可行。实际工程中常用 SPFA（Shortest Path Faster Algorithm）队列优化，但 SPFA 在最坏情况下仍退化为 $O(VE)$
- **Floyd-Warshall 的规模限制**：$V=10000$ 时需要 400MB 内存（int 矩阵），$V=10^5$ 时需 40GB，仅适用于小规模全源计算
- **图数据库中的最短路径**：Neo4j 内置的 `shortestPath` 函数使用双向 BFS（对无权图）和 Dijkstra（对加权图），并支持 `maxLength` 限制以防止无限遍历

### 2.4.6 本章小结

Dijkstra 是单源最短路径的工业标准，Bellman-Ford 是处理负权边的理论工具，Floyd-Warshall 是小规模全源计算的经典选择。在图数据库工程中，90% 的最短路径查询使用 Dijkstra 或其变体（A*、双向 Dijkstra）。

---

## 2.5 最小生成树

### 2.5.1 解决的问题

在加权无向图中找到一棵连接所有顶点的树，使得树中所有边的权重之和最小。MST 是网络设计的基础问题——以最低成本连通所有节点。

### 2.5.2 核心原理

**Kruskal 算法**：按边权重从小到大排序，依次加入不形成环的边。使用并查集（Union-Find）检测环。
- 时间复杂度：$O(E \log E)$（排序主导）
- 空间复杂度：$O(V+E)$

**Prim 算法**：从任意顶点开始，每次选择连接已选集合和未选集合的最小权重边。使用优先队列优化。
- 时间复杂度：$O((V+E)\log V)$
- 空间复杂度：$O(V+E)$

| 对比 | Kruskal | Prim |
|------|---------|------|
| 适用图 | 稀疏图 | 稠密图 |
| 数据结构 | 并查集 | 优先队列 |
| 边排序 | 需要 | 不需要 |
| 在线处理 | 支持边流式处理 | 不支持 |

### 2.5.3 代码实现

```java
// MinimumSpanningTree.java — Kruskal 与 Prim 的完整实现
import java.util.*;

class MinimumSpanningTree {

    // ========== 并查集 ==========
    static class UnionFind {
        int[] parent, rank;
        UnionFind(int n) {
            parent = new int[n];
            rank = new int[n];
            for (int i = 0; i < n; i++) parent[i] = i;
        }
        int find(int x) {
            if (parent[x] != x) parent[x] = find(parent[x]);
            return parent[x];
        }
        boolean union(int x, int y) {
            int rx = find(x), ry = find(y);
            if (rx == ry) return false;
            if (rank[rx] < rank[ry]) parent[rx] = ry;
            else if (rank[rx] > rank[ry]) parent[ry] = rx;
            else { parent[ry] = rx; rank[rx]++; }
            return true;
        }
    }

    static class Edge implements Comparable<Edge> {
        int u, v, weight;
        Edge(int u, int v, int weight) { this.u = u; this.v = v; this.weight = weight; }
        public int compareTo(Edge o) { return Integer.compare(this.weight, o.weight); }
    }

    // ========== Kruskal 算法 ==========
    public static List<Edge> kruskal(int V, List<Edge> edges) {
        Collections.sort(edges);
        UnionFind uf = new UnionFind(V);
        List<Edge> mst = new ArrayList<>();
        int totalWeight = 0;

        for (Edge e : edges) {
            if (uf.union(e.u, e.v)) {
                mst.add(e);
                totalWeight += e.weight;
                if (mst.size() == V - 1) break;
            }
        }
        System.out.println("Kruskal MST 总权重: " + totalWeight);
        return mst;
    }

    // ========== Prim 算法 ==========
    public static List<Edge> prim(List<List<int[]>> adj) {
        int V = adj.size();
        boolean[] inMST = new boolean[V];
        int[] parent = new int[V];
        int[] key = new int[V];
        Arrays.fill(key, Integer.MAX_VALUE);
        Arrays.fill(parent, -1);

        // [权重, 顶点]
        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
        key[0] = 0;
        pq.offer(new int[]{0, 0});

        while (!pq.isEmpty()) {
            int u = pq.poll()[1];
            if (inMST[u]) continue;
            inMST[u] = true;

            for (int[] edge : adj.get(u)) {
                int v = edge[0], w = edge[1];
                if (!inMST[v] && w < key[v]) {
                    key[v] = w;
                    parent[v] = u;
                    pq.offer(new int[]{w, v});
                }
            }
        }

        List<Edge> mst = new ArrayList<>();
        int totalWeight = 0;
        for (int v = 1; v < V; v++) {
            if (parent[v] != -1) {
                mst.add(new Edge(parent[v], v, key[v]));
                totalWeight += key[v];
            }
        }
        System.out.println("Prim MST 总权重: " + totalWeight);
        return mst;
    }

    // ========== 测试 ==========
    public static void main(String[] args) {
        int V = 6;
        List<Edge> edges = Arrays.asList(
            new Edge(0, 1, 4), new Edge(0, 2, 3),
            new Edge(1, 2, 1), new Edge(1, 3, 2),
            new Edge(2, 3, 4), new Edge(2, 4, 5),
            new Edge(3, 4, 6), new Edge(3, 5, 3),
            new Edge(4, 5, 2)
        );

        System.out.println("=== Kruskal ===");
        List<Edge> mst1 = kruskal(V, edges);
        for (Edge e : mst1) System.out.println(e.u + " - " + e.v + " : " + e.weight);

        // 构建邻接表给 Prim
        List<List<int[]>> adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
        for (Edge e : edges) {
            adj.get(e.u).add(new int[]{e.v, e.weight});
            adj.get(e.v).add(new int[]{e.u, e.weight});
        }

        System.out.println("\n=== Prim ===");
        List<Edge> mst2 = prim(adj);
        for (Edge e : mst2) System.out.println(e.u + " - " + e.v + " : " + e.weight);
    }
}
```

### 2.5.4 使用场景

| 场景 | 算法 | 说明 |
|------|------|------|
| 网络布线 | Kruskal | 以最低成本连通所有建筑 |
| 电路设计 | Prim | 芯片上连接所有元件的布线 |
| 聚类分析 | Kruskal | 基于 MST 的层次聚类（切断最长边） |
| 图数据库分区 | Prim | 最小割分区，将关联紧密的节点分配到同一分片 |
| 近似算法 | Kruskal | 旅行商问题（TSP）的 2-近似解基于 MST |

### 2.5.5 潜在风险与注意事项

- **Kruskal 的边排序内存**：$E=10^8$ 时排序需要约 1.6GB 内存（每条边 16 字节），可使用外部排序或边流式处理
- **Prim 的优先队列**：Java 的 `PriorityQueue.remove(Object)` 是 $O(V)$ 操作，不支持 decrease-key。上述实现通过插入新条目并跳过过期条目来规避，但队列中可能积累 $O(E)$ 个条目
- **MST 不唯一**：当边权重有重复时，可能存在多个 MST
- **图数据库中的 MST**：Neo4j 的 GDS（Graph Data Science）库提供了 `gds.alpha.mst` 过程，底层使用 Prim 算法

### 2.5.6 本章小结

Kruskal 和 Prim 是 MST 的两大经典算法。Kruskal 适合稀疏图且支持边流式处理，Prim 适合稠密图。MST 在聚类分析、网络设计、图分区等工程场景中有广泛应用。

---

## 2.6 网络流与最大流

### 2.6.1 解决的问题

在流网络中，每条边有容量限制，求从源点到汇点能传输的最大流量。最大流问题是图论中最深刻的组合优化问题之一，与最小割定理等价。

### 2.6.2 核心原理

**流网络**：有向图 $G=(V,E)$，每条边 $(u,v)$ 有非负容量 $c(u,v)$。源点 $s$ 产生流量，汇点 $t$ 接收流量。

**Ford-Fulkerson 方法**：不断寻找增广路径（从 $s$ 到 $t$ 的路径，每条边还有剩余容量），增加流量，直到没有增广路径为止。

**Edmonds-Karp 算法**：Ford-Fulkerson 的 BFS 实现，每次找最短增广路径（边数最少）。
- 时间复杂度：$O(VE^2)$
- 每次 BFS 找增广路 $O(E)$，最多增广 $O(VE)$ 次

**残量网络**：每条边 $(u,v)$ 的残量 $r(u,v) = c(u,v) - f(u,v)$，同时存在反向边 $r(v,u) = f(u,v)$ 用于"撤销"流量。

### 2.6.3 代码实现

```java
// MaxFlow.java — Edmonds-Karp 最大流算法
import java.util.*;

class MaxFlow {

    static class Edge {
        int to, rev; // rev = 反向边在 adj[to] 中的索引
        int capacity;

        Edge(int to, int rev, int capacity) {
            this.to = to;
            this.rev = rev;
            this.capacity = capacity;
        }
    }

    private final int V;
    private final List<List<Edge>> adj;

    public MaxFlow(int V) {
        this.V = V;
        this.adj = new ArrayList<>(V);
        for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
    }

    public void addEdge(int from, int to, int capacity) {
        Edge fwd = new Edge(to, adj.get(to).size(), capacity);
        Edge rev = new Edge(from, adj.get(from).size(), 0);
        adj.get(from).add(fwd);
        adj.get(to).add(rev);
    }

    // ========== Edmonds-Karp (BFS 找增广路) ==========
    public int edmondsKarp(int s, int t) {
        int flow = 0;
        int[] parent = new int[V];
        int[] parentEdge = new int[V];

        while (true) {
            Arrays.fill(parent, -1);
            Queue<Integer> queue = new LinkedList<>();
            queue.offer(s);
            parent[s] = s;

            while (!queue.isEmpty() && parent[t] == -1) {
                int u = queue.poll();
                for (int i = 0; i < adj.get(u).size(); i++) {
                    Edge e = adj.get(u).get(i);
                    if (parent[e.to] == -1 && e.capacity > 0) {
                        parent[e.to] = u;
                        parentEdge[e.to] = i;
                        queue.offer(e.to);
                    }
                }
            }

            if (parent[t] == -1) break; // 无增广路

            // 找瓶颈容量
            int bottleneck = Integer.MAX_VALUE;
            for (int v = t; v != s; v = parent[v]) {
                Edge e = adj.get(parent[v]).get(parentEdge[v]);
                bottleneck = Math.min(bottleneck, e.capacity);
            }

            // 更新残量网络
            for (int v = t; v != s; v = parent[v]) {
                Edge e = adj.get(parent[v]).get(parentEdge[v]);
                e.capacity -= bottleneck;
                adj.get(v).get(e.rev).capacity += bottleneck;
            }

            flow += bottleneck;
        }
        return flow;
    }

    // ========== 最小割 ==========
    public List<Integer> minCut(int s) {
        boolean[] reachable = new boolean[V];
        Queue<Integer> queue = new LinkedList<>();
        queue.offer(s);
        reachable[s] = true;

        while (!queue.isEmpty()) {
            int u = queue.poll();
            for (Edge e : adj.get(u)) {
                if (e.capacity > 0 && !reachable[e.to]) {
                    reachable[e.to] = true;
                    queue.offer(e.to);
                }
            }
        }

        List<Integer> cut = new ArrayList<>();
        for (int v = 0; v < V; v++) if (reachable[v]) cut.add(v);
        return cut;
    }

    // ========== 测试 ==========
    public static void main(String[] args) {
        // 经典例子: 0 -> 1(10), 0 -> 2(10)
        // 1 -> 2(5), 1 -> 3(15)
        // 2 -> 3(10)
        MaxFlow mf = new MaxFlow(4);
        mf.addEdge(0, 1, 10);
        mf.addEdge(0, 2, 10);
        mf.addEdge(1, 2, 5);
        mf.addEdge(1, 3, 15);
        mf.addEdge(2, 3, 10);

        int maxFlow = mf.edmondsKarp(0, 3);
        System.out.println("最大流: " + maxFlow); // 预期: 20

        List<Integer> cut = mf.minCut(0);
        System.out.println("最小割 (源侧): " + cut);
    }
}
```

### 2.6.4 使用场景

| 场景 | 图论映射 | 说明 |
|------|---------|------|
| 二分图最大匹配 | 添加超级源点和超级汇点，边容量为 1 | 任务分配、约会匹配 |
| 图像分割 | 像素为节点，相邻像素间边容量为相似度 | GrabCut 算法 |
| 交通流量规划 | 道路为边，容量为车流量 | 城市交通优化 |
| 社区发现 | 最小割 = 最稀疏的切分 | 社交网络聚类 |
| 推荐系统 | 用户-商品二分图最大流 | 最大商品覆盖 |

### 2.6.5 潜在风险与注意事项

- **Edmonds-Karp 的性能**：$O(VE^2)$ 在 $V=10^4, E=10^5$ 时约 $10^{14}$ 次操作，不可行。实际工程使用 Dinic 算法（$O(V^2E)$，二分图匹配中 $O(\sqrt{V}E)$）或 Push-Relabel（$O(V^3)$）
- **容量为整数**：Ford-Fulkerson 要求容量为有理数，否则可能无限循环
- **图数据库中的最大流**：Neo4j GDS 提供了 `gds.alpha.maxFlow` 过程，用于社区发现和网络分析
- **最小割与最大流等价**：最大流的值等于最小割的容量，这是图论中最深刻的定理之一

### 2.6.6 本章小结

最大流是图论中最强大的工具之一。Edmonds-Karp 是理解增广路径思想的最佳入门算法，但生产环境应使用 Dinic 或 Push-Relabel。最大流与最小割的等价性使其在社区发现、图像分割、网络设计等领域有广泛应用。

---

## 2.7 图论在图数据库工程中的应用

### 2.7.1 解决的问题

将抽象的图论算法映射到具体的图数据库查询语言（Cypher、Gremlin、SPARQL）中，理解图数据库引擎内部如何利用这些算法优化查询。

### 2.7.2 核心原理

图数据库查询引擎本质上是一个**图算法执行器**。每条查询被解析为图遍历或图算法的组合：

| 图论概念 | Cypher 查询 | 引擎内部实现 |
|---------|------------|------------|
| BFS | `MATCH (a)-[:FRIEND*1..3]->(b)` | 双向 BFS，从两端同时扩展 |
| DFS | `MATCH path=(a)-[*]->(b)` | 深度优先遍历，带路径唯一性检查 |
| Dijkstra | `MATCH (a)-[r*]->(b) RETURN path ORDER BY r.cost` | 优先队列 + 松弛 |
| 拓扑排序 | 依赖分析查询 | Kahn 算法 |
| 连通分量 | `gds.alpha.wcc` | Union-Find |
| 最大流 | `gds.alpha.maxFlow` | Dinic 算法 |
| PageRank | `gds.pageRank` | 幂迭代法 |

### 2.7.3 代码实现：图数据库查询模拟

```java
// GraphDBQueryEngine.java — 模拟图数据库查询引擎如何利用图算法
import java.util.*;
import java.util.stream.*;

class GraphDBQueryEngine {

    // 模拟图数据库中的节点和关系
    static class Node {
        long id;
        String label;
        Map<String, Object> props = new HashMap<>();
        Node(long id, String label) { this.id = id; this.label = label; }
    }

    static class Relationship {
        long id;
        String type;
        Node source, target;
        Map<String, Object> props = new HashMap<>();
        Relationship(long id, String type, Node s, Node t) {
            this.id = id; this.type = type; this.source = s; this.target = t;
        }
    }

    static class GraphDB {
        Map<Long, Node> nodes = new HashMap<>();
        Map<Long, Relationship> rels = new HashMap<>();
        Map<Long, List<Relationship>> outEdges = new HashMap<>();
        Map<Long, List<Relationship>> inEdges = new HashMap<>();

        void addNode(Node n) {
            nodes.put(n.id, n);
            outEdges.putIfAbsent(n.id, new ArrayList<>());
            inEdges.putIfAbsent(n.id, new ArrayList<>());
        }

        void addRel(Relationship r) {
            rels.put(r.id, r);
            outEdges.get(r.source.id).add(r);
            inEdges.get(r.target.id).add(r);
        }

        // ========== "几度好友"查询（BFS） ==========
        List<Node> friendsOfFriends(long userId, int maxDepth) {
            Set<Long> visited = new HashSet<>();
            Queue<long[]> queue = new LinkedList<>(); // [nodeId, depth]
            queue.offer(new long[]{userId, 0});
            visited.add(userId);
            List<Node> result = new ArrayList<>();

            while (!queue.isEmpty()) {
                long[] cur = queue.poll();
                long u = cur[0];
                int depth = (int) cur[1];

                if (depth > 0 && depth <= maxDepth) result.add(nodes.get(u));
                if (depth >= maxDepth) continue;

                for (Relationship r : outEdges.get(u)) {
                    if (!visited.contains(r.target.id)) {
                        visited.add(r.target.id);
                        queue.offer(new long[]{r.target.id, depth + 1});
                    }
                }
            }
            return result;
        }

        // ========== 最短路径查询（双向 BFS） ==========
        List<Node> shortestPath(long from, long to) {
            if (from == to) return List.of(nodes.get(from));

            Map<Long, Long> prevFrom = new HashMap<>(), prevTo = new HashMap<>();
            Set<Long> visitedFrom = new HashSet<>(), visitedTo = new HashSet<>();
            Queue<Long> qFrom = new LinkedList<>(), qTo = new LinkedList<>();

            qFrom.offer(from); visitedFrom.add(from);
            qTo.offer(to); visitedTo.add(to);
            prevFrom.put(from, -1L);
            prevTo.put(to, -1L);

            Long meet = null;

            while (!qFrom.isEmpty() && !qTo.isEmpty()) {
                // 从起点方向扩展一层
                meet = expandLayer(qFrom, visitedFrom, visitedTo, prevFrom, true);
                if (meet != null) break;
                // 从终点方向扩展一层
                meet = expandLayer(qTo, visitedTo, visitedFrom, prevTo, false);
                if (meet != null) break;
            }

            if (meet == null) return List.of();

            // 重建路径
            List<Node> path = new ArrayList<>();
            for (long v = meet; v != -1; v = prevFrom.get(v)) path.add(nodes.get(v));
            Collections.reverse(path);
            List<Node> tail = new ArrayList<>();
            for (long v = prevTo.get(meet); v != -1; v = prevTo.get(v)) tail.add(nodes.get(v));
            path.addAll(tail);
            return path;
        }

        private Long expandLayer(Queue<Long> queue, Set<Long> visited,
                                  Set<Long> otherVisited, Map<Long, Long> prev,
                                  boolean isOutgoing) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                long u = queue.poll();
                List<Relationship> edges = isOutgoing ? outEdges.get(u) : inEdges.get(u);
                for (Relationship r : edges) {
                    long v = isOutgoing ? r.target.id : r.source.id;
                    if (!visited.contains(v)) {
                        visited.add(v);
                        prev.put(v, u);
                        if (otherVisited.contains(v)) return v;
                        queue.offer(v);
                    }
                }
            }
            return null;
        }

        // ========== 影响力传播（PageRank 简化版） ==========
        Map<Long, Double> pageRank(int iterations, double damping) {
            int V = nodes.size();
            Map<Long, Double> rank = new HashMap<>();
            nodes.keySet().forEach(n -> rank.put(n, 1.0 / V));

            for (int iter = 0; iter < iterations; iter++) {
                Map<Long, Double> newRank = new HashMap<>();
                double danglingSum = 0;
                for (long n : nodes.keySet()) {
                    if (outEdges.get(n).isEmpty()) danglingSum += rank.get(n);
                }

                for (long n : nodes.keySet()) {
                    double sum = 0;
                    for (Relationship r : inEdges.get(n)) {
                        long src = r.source.id;
                        int deg = outEdges.get(src).size();
                        sum += rank.get(src) / deg;
                    }
                    newRank.put(n, (1 - damping) / V + damping * (sum + danglingSum / V));
                }
                rank = newRank;
            }
            return rank;
        }
    }

    public static void main(String[] args) {
        GraphDB db = new GraphDB();
        for (long i = 1; i <= 6; i++) db.addNode(new Node(i, "Person"));

        db.addRel(new Relationship(1, "FRIEND", db.nodes.get(1L), db.nodes.get(2L)));
        db.addRel(new Relationship(2, "FRIEND", db.nodes.get(2L), db.nodes.get(3L)));
        db.addRel(new Relationship(3, "FRIEND", db.nodes.get(3L), db.nodes.get(4L)));
        db.addRel(new Relationship(4, "FRIEND", db.nodes.get(4L), db.nodes.get(5L)));
        db.addRel(new Relationship(5, "FRIEND", db.nodes.get(5L), db.nodes.get(6L)));
        db.addRel(new Relationship(6, "FRIEND", db.nodes.get(1L), db.nodes.get(3L)));

        System.out.println("=== 几度好友 (1->2度) ===");
        db.friendsOfFriends(1, 2).forEach(n -> System.out.print(n.id + " "));
        System.out.println();

        System.out.println("\n=== 最短路径 1->6 ===");
        db.shortestPath(1, 6).forEach(n -> System.out.print(n.id + " -> "));
        System.out.println("END");

        System.out.println("\n=== PageRank ===");
        db.pageRank(20, 0.85).forEach((id, r) ->
            System.out.println("Node " + id + ": " + String.format("%.4f", r)));
    }
}
```

### 2.7.4 使用场景

| 图数据库 | 底层存储 | 支持的图算法 |
|---------|---------|------------|
| Neo4j | 免索引邻接（链表） | 最短路径、PageRank、社区检测、中心性 |
| JanusGraph | 分布式邻接表（HBase/Cassandra） | 图遍历、路径查询 |
| TigerGraph | 分布式邻接表 + 边分区 | 内置 10+ 种图算法，支持 GSQL |
| Amazon Neptune | 托管图数据库 | SPARQL、Gremlin 遍历 |
| NebulaGraph | 分布式邻接表 + 属性存储 | 图遍历、子图匹配 |

### 2.7.5 潜在风险与注意事项

- **免索引邻接的物理意义**：Neo4j 的每个节点存储其关系链表的头指针，遍历时无需全局索引查找。这是图数据库相比关系型数据库在深度关联查询上性能优势的根本来源
- **分布式图数据库的挑战**：跨机器遍历时，网络延迟成为瓶颈。TigerGraph 通过边分区（将边与源节点存储在同一机器）减少跨机器通信
- **算法选择与查询优化**：图数据库查询优化器会根据查询模式自动选择算法。例如，Neo4j 的 `shortestPath` 在检测到起点和终点都已知时使用双向 BFS，否则使用单向 Dijkstra
- **内存图计算 vs 磁盘图数据库**：PageRank 等迭代算法通常在内存中完成（Neo4j GDS），而 OLTP 查询直接在存储层遍历

### 2.7.6 本章小结

图论不是纸上谈兵的数学理论——它是图数据库查询引擎的底层操作系统。BFS 驱动社交查询，Dijkstra 驱动路径规划，PageRank 驱动推荐系统。理解这些算法的原理和取舍，是设计和优化图数据库应用的关键能力。

---

## 附录：全章代码汇总

本章所有 Java 代码可在以下文件中找到：

| 文件 | 内容 | 类名 |
|------|------|------|
| `GraphClassification.java` | 图的分类体系 | `Graph`, `DirectedGraph`, `UndirectedGraph`, `BipartiteGraph` |
| `GraphStorage.java` | 三种存储格式 | `AdjacencyMatrix`, `AdjacencyList`, `CSRGraph`, `CSCGraph` |
| `GraphTraversal.java` | DFS/BFS 遍历 | `TraversalAlgorithms` |
| `ShortestPath.java` | 最短路径算法 | `ShortestPath` |
| `MinimumSpanningTree.java` | 最小生成树 | `MinimumSpanningTree` |
| `MaxFlow.java` | 最大流 | `MaxFlow` |
| `GraphDBQueryEngine.java` | 图数据库查询模拟 | `GraphDBQueryEngine` |

编译运行方式：

```bash
# 编译所有文件
javac *.java

# 运行各示例
java TraversalAlgorithms
java ShortestPath
java MinimumSpanningTree
java MaxFlow
java GraphDBQueryEngine
```

---

> **延伸阅读：** 第3章将深入图数据库的存储引擎设计，从本章的 CSR/邻接表理论出发，讲解 Neo4j 的原生图存储、JanusGraph 的分布式存储架构，以及如何为不同查询模式选择存储方案。
