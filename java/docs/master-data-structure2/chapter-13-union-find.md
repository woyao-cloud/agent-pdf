# 第13章 并查集

## 13.1 并查集原理与实现

### 解决的问题

并查集（Union-Find / Disjoint Set）解决的是**动态连通性**问题：在图中判断两个节点是否连通，以及将两个连通分量合并。典型应用包括社交网络的好友关系、计算机网络中的连通性等。

> **核心价值**：并查集以接近O(1)的复杂度解决连通性问题，是图论算法中的基础工具。

### 实现原理

并查集的两种核心操作：
- **Find**：查找元素所属的集合（找到根节点）
- **Union**：将两个元素所在的集合合并

**树形表示法**：
```
初始状态：每个元素自成一个集合
0   1   2   3   4   5

union(0,1)后：
0 ← 1    2   3   4   5

union(2,3)后：
0 ← 1    2 ← 3    4   5

union(0,2)后：
0 ← 1    2 ← 3
↑________|

find(3) → 找到根0
```

### 代码实现

```java
/**
 * 并查集实现（含路径压缩和按秩合并）
 */
public class UnionFind {
    private int[] parent;  // 父节点数组
    private int[] rank;    // 秩（树的高度）
    private int count;     // 连通分量个数
    
    public UnionFind(int n) {
        parent = new int[n];
        rank = new int[n];
        count = n;
        
        // 每个元素的父节点指向自己
        for (int i = 0; i < n; i++) {
            parent[i] = i;
            rank[i] = 1;
        }
    }
    
    // 查找（含路径压缩）
    // 路径压缩：将查找路径上所有节点的父节点直接指向根节点
    public int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]);  // 递归路径压缩
        }
        return parent[x];
    }
    
    // 查找（迭代版）
    public int findIterative(int x) {
        // 先找到根
        int root = x;
        while (parent[root] != root) {
            root = parent[root];
        }
        // 路径压缩：将路径上的所有节点直接指向根
        while (x != root) {
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }
    
    // 合并（按秩合并）
    // 将秩小的树合并到秩大的树上
    public void union(int x, int y) {
        int rootX = find(x);
        int rootY = find(y);
        
        if (rootX == rootY) return;
        
        // 按秩合并：将矮的树合并到高的树上
        if (rank[rootX] < rank[rootY]) {
            parent[rootX] = rootY;
        } else if (rank[rootX] > rank[rootY]) {
            parent[rootY] = rootX;
        } else {
            parent[rootY] = rootX;
            rank[rootX]++;
        }
        
        count--;  // 连通分量减少
    }
    
    // 判断两个元素是否连通
    public boolean connected(int x, int y) {
        return find(x) == find(y);
    }
    
    // 获取连通分量数
    public int getCount() {
        return count;
    }
}
```

### 使用场景

- **社交网络**：好友关系、群组
- **图的连通性**：判断图中两个节点是否连通
- **最小生成树**：Kruskal算法
- **动态连通性**：网络连接、电路连接

### 潜在风险与问题

- **递归栈溢出**：大数据量时递归find可能栈溢出
- **路径压缩开销**：虽然摊销O(1)，单次操作可能较慢
- **不支持断开操作**：并查集只能合并，不能分裂

### 优化策略

- 使用迭代find避免递归
- 同时使用路径压缩和按秩合并
- 大数据量时初始容量要足够

---

## 13.2 路径压缩与按秩合并

### 两种优化

**路径压缩**：查找时将路径上的节点直接指向根节点，降低树高。
**按秩合并**：将秩（树高）较小的树合并到较大的树上。

### 复杂度分析

同时使用两种优化后，单次操作的摊销时间复杂度为O(α(n))，其中α(n)是反阿克曼函数，对于任何实际规模的输入，α(n) ≤ 5。可以认为是**常数时间**。

---

## 13.3 使用场景与风险分析

### 典型问题处理

**面试题：并查集在Kruskal算法中的应用？**

```java
// Kruskal最小生成树算法
class Kruskal {
    static class Edge {
        int u, v, weight;
    }
    
    int minimumSpanningTree(List<Edge> edges, int n) {
        // 按权重排序
        Collections.sort(edges, (a, b) -> a.weight - b.weight);
        
        UnionFind uf = new UnionFind(n);
        int totalWeight = 0;
        
        for (Edge e : edges) {
            if (!uf.connected(e.u, e.v)) {
                uf.union(e.u, e.v);
                totalWeight += e.weight;
            }
        }
        return totalWeight;
    }
}
```

---

## 13.4 典型问题：朋友圈、分组连接

### 经典问题

**问题：朋友圈（LeetCode 547）**

```java
// 已知n个人的好友关系矩阵，求朋友圈的数量
public int findCircleNum(int[][] M) {
    int n = M.length;
    UnionFind uf = new UnionFind(n);
    
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (M[i][j] == 1) {
                uf.union(i, j);
            }
        }
    }
    return uf.getCount();
}
```

---

> **本章总结**：并查集以接近O(1)的复杂度解决动态连通性问题。路径压缩和按秩合并是两种核心优化，同时使用后可以获得极致的性能。并查集应用广泛，从社交网络到最小生成树算法，都是图论问题的基础工具。