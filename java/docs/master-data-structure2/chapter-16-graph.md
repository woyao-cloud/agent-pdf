# 第16章 图

## 16.1 图的定义与术语

### 解决的问题

图（Graph）解决的是**多对多关系**的建模问题。在此之前的数据结构（数组、链表、树）都只能表达"一对一"或"一对多"的关系，而图可以表达任意两个元素之间的关系。

> **核心价值**：图是表达复杂关系最通用的数据结构，社交网络、地图导航、推荐系统等都以图为基础。

### 实现原理

**图的定义**：图G(V, E)由顶点集合V和边集合E组成。

**基本术语**：

```
无向图：边没有方向
  A —— B      邻接：A的邻居是B
  |    |
  C —— D      路径：A→B→D→C

有向图：边有方向
  A → B       出度：A的出度=1（指向B）
  ↓    ↑      入度：B的入度=1（被A指）
  C → D

带权图：边带有权重
  A ---5--- B  边的权重表示距离/成本/容量
```

| 术语 | 定义 |
|------|------|
| 顶点的度 | 与该顶点相连的边数 |
| 出度/入度 | 有向图中，指向/被指的数量 |
| 路径 | 顶点序列，相邻顶点之间有边相连 |
| 环 | 起点和终点相同的路径 |
| 连通图 | 任意两个顶点之间都有路径 |
| 连通分量 | 极大连通子图 |

### 代码实现

```java
/**
 * 图的定义与基本操作
 */
public class Graph {
    private final int V;           // 顶点数
    private int E;                 // 边数
    private List<Integer>[] adj;   // 邻接表
    
    @SuppressWarnings("unchecked")
    public Graph(int V) {
        this.V = V;
        this.E = 0;
        adj = new ArrayList[V];
        for (int i = 0; i < V; i++) {
            adj[i] = new ArrayList<>();
        }
    }
    
    public void addEdge(int v, int w) {
        adj[v].add(w);
        adj[w].add(v);  // 无向图
        E++;
    }
    
    public Iterable<Integer> adj(int v) {
        return adj[v];
    }
    
    public int V() { return V; }
    public int E() { return E; }
}
```

### 使用场景

- **社交网络**：用户关系图
- **地图导航**：路网图、最短路径
- **推荐系统**：用户-物品二分图
- **网络拓扑**：路由器连接
- **知识图谱**：实体间关系

---

## 16.2 图的存储（邻接表、邻接矩阵）

### 实现原理

两种主要存储方式：

**邻接矩阵**：
```
      A  B  C  D
    A 0  1  1  1
    B 1  0  0  1
    C 1  0  0  1
    D 1  1  1  0
```
- 空间：O(V²)
- 优点：判断两点是否相连O(1)
- 缺点：稀疏图浪费空间

**邻接表**：
```
A → [B, C, D]
B → [A, D]
C → [A, D]
D → [A, B, C]
```
- 空间：O(V + E)
- 优点：节省空间
- 缺点：判断两点是否相连O(degree)

### 代码实现

```java
/**
 * 图的两种存储方式对比
 */
public class GraphStorage {
    
    // 邻接矩阵
    static class AdjMatrix {
        private boolean[][] matrix;
        private int V;
        
        AdjMatrix(int V) {
            this.V = V;
            matrix = new boolean[V][V];
        }
        
        void addEdge(int v, int w) {
            matrix[v][w] = matrix[w][v] = true;
        }
        
        boolean hasEdge(int v, int w) {
            return matrix[v][w];
        }
    }
    
    // 邻接表
    static class AdjList {
        private List<Integer>[] adj;
        private int V;
        
        @SuppressWarnings("unchecked")
        AdjList(int V) {
            this.V = V;
            adj = new ArrayList[V];
            for (int i = 0; i < V; i++) {
                adj[i] = new ArrayList<>();
            }
        }
        
        void addEdge(int v, int w) {
            adj[v].add(w);
            adj[w].add(v);
        }
        
        boolean hasEdge(int v, int w) {
            return adj[v].contains(w);
        }
        
        Iterable<Integer> neighbors(int v) {
            return adj[v];
        }
    }
}
```

---

## 16.3 深度优先搜索（DFS）

### 实现原理

DFS沿着一条路径走到黑，然后回溯。使用栈（递归或显式栈）实现。

### 代码实现

```java
/**
 * 深度优先搜索
 */
public class DepthFirstSearch {
    private boolean[] visited;
    private int count;
    
    public DepthFirstSearch(Graph G, int s) {
        visited = new boolean[G.V()];
        dfs(G, s);
    }
    
    // 递归版
    private void dfs(Graph G, int v) {
        visited[v] = true;
        count++;
        System.out.print(v + " ");
        for (int w : G.adj(v)) {
            if (!visited[w]) {
                dfs(G, w);
            }
        }
    }
    
    // 迭代版（显式栈）
    public void dfsIterative(Graph G, int s) {
        boolean[] visited = new boolean[G.V()];
        Deque<Integer> stack = new ArrayDeque<>();
        
        stack.push(s);
        while (!stack.isEmpty()) {
            int v = stack.pop();
            if (!visited[v]) {
                visited[v] = true;
                System.out.print(v + " ");
                for (int w : G.adj(v)) {
                    if (!visited[w]) {
                        stack.push(w);
                    }
                }
            }
        }
    }
    
    public boolean visited(int v) {
        return visited[v];
    }
    
    public int count() {
        return count;
    }
}
```

**DFS的应用**：
- 连通分量检测
- 环检测
- 拓扑排序
- 二分图检测

---

## 16.4 广度优先搜索（BFS）

### 实现原理

BFS逐层搜索，先访问距离起点最近的节点。用于求最短路径（无权图）。

### 代码实现

```java
/**
 * 广度优先搜索
 */
public class BreadthFirstSearch {
    private boolean[] visited;
    private int[] edgeTo;   // 记录路径
    private int[] dist;     // 距离
    
    public BreadthFirstSearch(Graph G, int s) {
        visited = new boolean[G.V()];
        edgeTo = new int[G.V()];
        dist = new int[G.V()];
        Arrays.fill(dist, -1);
        bfs(G, s);
    }
    
    private void bfs(Graph G, int s) {
        Queue<Integer> queue = new LinkedList<>();
        visited[s] = true;
        dist[s] = 0;
        queue.offer(s);
        
        while (!queue.isEmpty()) {
            int v = queue.poll();
            System.out.print(v + " ");
            for (int w : G.adj(v)) {
                if (!visited[w]) {
                    visited[w] = true;
                    edgeTo[w] = v;
                    dist[w] = dist[v] + 1;
                    queue.offer(w);
                }
            }
        }
    }
    
    // 获取从s到v的路径
    public Iterable<Integer> pathTo(int v) {
        if (!visited[v]) return null;
        Deque<Integer> path = new ArrayDeque<>();
        for (int x = v; edgeTo[x] != 0; x = edgeTo[x]) {
            path.push(x);
        }
        path.push(0);
        return path;
    }
    
    // 获取从s到v的最短距离
    public int distTo(int v) {
        return dist[v];
    }
}
```

**BFS的应用**：
- 无权图最短路径
- 社交网络的六度分隔
- 二分图检测
- 拓扑排序（Kahn算法）

---

## 16.5 使用场景与风险分析

### 典型问题处理

**面试题：DFS和BFS的对比？**

| 特性 | DFS | BFS |
|------|-----|-----|
| 数据结构 | 栈（递归/显式） | 队列 |
| 空间复杂度 | O(h) h为深度 | O(w) w为宽度 |
| 最短路径 | 不保证 | 保证（无权图） |
| 遍历顺序 | 深度优先 | 逐层 |
| 适用场景 | 连通性、拓扑排序 | 最短路径、层次遍历 |

---

## 16.6 典型问题：最短路径、拓扑排序

### Dijkstra最短路径算法

```java
/**
 * Dijkstra最短路径算法（带权图，无负边）
 */
public class Dijkstra {
    private int[] dist;
    private int[] prev;
    private boolean[] visited;
    
    public Dijkstra(int[][] graph, int start) {
        int n = graph.length;
        dist = new int[n];
        prev = new int[n];
        visited = new boolean[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[start] = 0;
        
        // 使用优先队列优化
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        pq.offer(new int[]{start, 0});
        
        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int u = cur[0];
            if (visited[u]) continue;
            visited[u] = true;
            
            for (int v = 0; v < n; v++) {
                if (graph[u][v] > 0 && !visited[v]) {
                    int newDist = dist[u] + graph[u][v];
                    if (newDist < dist[v]) {
                        dist[v] = newDist;
                        prev[v] = u;
                        pq.offer(new int[]{v, newDist});
                    }
                }
            }
        }
    }
    
    public int distTo(int v) { return dist[v]; }
    public List<Integer> pathTo(int v) {
        List<Integer> path = new ArrayList<>();
        for (int at = v; at != -1; at = prev[at]) {
            path.add(at);
        }
        Collections.reverse(path);
        return path;
    }
}
```

### 拓扑排序

```java
/**
 * 拓扑排序（Kahn算法）
 */
public class TopologicalSort {
    
    public List<Integer> topologicalSort(int V, int[][] edges) {
        // 构建入度表和邻接表
        int[] inDegree = new int[V];
        List<Integer>[] adj = new ArrayList[V];
        for (int i = 0; i < V; i++) adj[i] = new ArrayList<>();
        
        for (int[] edge : edges) {
            int from = edge[0], to = edge[1];
            adj[from].add(to);
            inDegree[to]++;
        }
        
        // 将入度为0的节点入队
        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < V; i++) {
            if (inDegree[i] == 0) queue.offer(i);
        }
        
        List<Integer> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            result.add(u);
            
            for (int v : adj[u]) {
                if (--inDegree[v] == 0) {
                    queue.offer(v);
                }
            }
        }
        
        // 如果result.size() < V，说明有环
        return result;
    }
}
```

---

> **本章总结**：图是最通用的数据结构，可以表达任意复杂的关系。邻接表和邻接矩阵是两种基本存储方式。DFS和BFS是图的两种基本遍历算法，分别适用于连通性检测、拓扑排序和最短路径等场景。Dijkstra算法是带权图最短路径的经典解法。图论是计算机科学中研究最多、应用最广的领域之一，掌握图的基本概念和算法对每个工程师都至关重要。