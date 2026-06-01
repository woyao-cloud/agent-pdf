# 第10章 B树与B+树

## 10.1 B树原理与实现

### 解决的问题

当数据量巨大且存储在磁盘上时，二叉树的高度（O(log n)）导致大量磁盘I/O。例如，100万条数据的红黑树高度约20，意味着每次查找最多需要20次磁盘I/O，这在磁盘场景下是无法接受的。

B树是多路搜索树（m阶），每个节点可以包含多个键和多个子节点，大幅降低树的高度。

> **核心价值**：B树通过让每个节点包含更多键来降低树高，从而减少磁盘I/O次数，是数据库和文件系统的核心数据结构。

### 实现原理

**m阶B树的特性**：

```
每个节点最多包含 m 个子节点
除根和叶子节点外，每个节点至少包含 ceil(m/2) 个子节点
每个节点包含 k 个键和 k+1 个子节点（ceil(m/2)-1 ≤ k ≤ m-1）
所有叶子节点在同一层

m=5 的B树示例：
        [10, 20, 30]
       /    |    |    \
    [5,7] [15] [25] [35,40]
```

**与二叉树的关键区别**：

| 特性 | 二叉树 | B树（m=1000） |
|------|--------|-------------|
| 节点键数 | 1 | 最多999 |
| 树高（100万数据） | ~20 | ~2 |
| 磁盘I/O（100万数据） | ~20次 | ~2次 |

### 代码实现

```java
/**
 * B树的简化实现（仅展示核心结构）
 */
public class BTree {
    
    private static final int M = 4;  // B树的阶数
    private Node root;
    
    static class Node {
        int[] keys = new int[M - 1];       // 最多M-1个键
        Node[] children = new Node[M];     // 最多M个子节点
        int keyCount = 0;                  // 当前键的数量
        boolean isLeaf = true;
    }
    
    // 查找
    public boolean search(int key) {
        return search(root, key) != null;
    }
    
    private Node search(Node node, int key) {
        if (node == null) return null;
        
        int i = 0;
        while (i < node.keyCount && key > node.keys[i]) {
            i++;
        }
        
        if (i < node.keyCount && key == node.keys[i]) {
            return node;  // 找到
        }
        
        if (node.isLeaf) return null;  // 未找到
        
        return search(node.children[i], key);
    }
    
    // 插入
    public void insert(int key) {
        if (root == null) {
            root = new Node();
            root.keys[0] = key;
            root.keyCount = 1;
            return;
        }
        
        if (root.keyCount == M - 1) {
            // 根节点已满，需要分裂
            Node newRoot = new Node();
            newRoot.isLeaf = false;
            newRoot.children[0] = root;
            splitChild(newRoot, 0);
            root = newRoot;
        }
        
        insertNonFull(root, key);
    }
    
    private void insertNonFull(Node node, int key) {
        int i = node.keyCount - 1;
        
        if (node.isLeaf) {
            // 叶节点，直接插入
            while (i >= 0 && key < node.keys[i]) {
                node.keys[i + 1] = node.keys[i];
                i--;
            }
            node.keys[i + 1] = key;
            node.keyCount++;
        } else {
            // 内部节点，找到合适的子节点
            while (i >= 0 && key < node.keys[i]) {
                i--;
            }
            i++;
            
            if (node.children[i].keyCount == M - 1) {
                // 子节点已满，先分裂
                splitChild(node, i);
                // 确定插入哪个子节点
                if (key > node.keys[i]) {
                    i++;
                }
            }
            insertNonFull(node.children[i], key);
        }
    }
    
    // 分裂子节点
    private void splitChild(Node parent, int index) {
        Node child = parent.children[index];
        Node newNode = new Node();
        newNode.isLeaf = child.isLeaf;
        
        // 将child的后半部分移到newNode
        newNode.keyCount = M / 2 - 1;
        for (int j = 0; j < M / 2 - 1; j++) {
            newNode.keys[j] = child.keys[j + M / 2];
        }
        if (!child.isLeaf) {
            for (int j = 0; j < M / 2; j++) {
                newNode.children[j] = child.children[j + M / 2];
            }
        }
        child.keyCount = M / 2 - 1;
        
        // 将中间键提升到父节点
        for (int j = parent.keyCount; j > index; j--) {
            parent.children[j + 1] = parent.children[j];
        }
        parent.children[index + 1] = newNode;
        
        for (int j = parent.keyCount - 1; j >= index; j--) {
            parent.keys[j + 1] = parent.keys[j];
        }
        parent.keys[index] = child.keys[M / 2 - 1];
        parent.keyCount++;
    }
    
    // 中序遍历（排序输出）
    public List<Integer> inorder() {
        List<Integer> result = new ArrayList<>();
        inorderRec(root, result);
        return result;
    }
    
    private void inorderRec(Node node, List<Integer> result) {
        if (node == null) return;
        for (int i = 0; i < node.keyCount; i++) {
            if (!node.isLeaf) inorderRec(node.children[i], result);
            result.add(node.keys[i]);
        }
        if (!node.isLeaf) inorderRec(node.children[node.keyCount], result);
    }
}
```

### 使用场景

- **数据库索引**：MySQL InnoDB使用B+树
- **文件系统**：NTFS、EXT4使用B树变体
- **内存数据库**：Redis的某些特性使用B树

### 潜在风险与问题

- **实现复杂度高**：插入和删除操作涉及分裂和合并
- **内存浪费**：节点未满时浪费空间
- **并发控制复杂**：需要精细的锁机制

### 优化策略

- 选择合适的阶数m（通常根据磁盘页大小，如MySQL InnoDB为4KB）
- 缓存路径节点减少I/O
- 批量插入时先排序再插入

### 典型问题处理

**面试题：B树的阶数m如何选择？**

m = 磁盘页大小 / (键大小 + 指针大小)。InnoDB页大小为16KB，键+指针约40字节，所以m约为400。

---

## 10.2 B+树原理与特点

### 解决的问题

B+树是B树的变体，是数据库索引的事实标准。与B树的区别在于：**只有叶子节点存储数据，内部节点只存储键用于路由**。

> **核心价值**：B+树的叶子节点形成有序链表，支持高效的范围查询和顺序访问。

### 实现原理

**B+树 vs B树**：

```
B树：每个节点都存储键和数据
B+树：只有叶子节点存储数据，内部节点只存储路由键

B+树结构示意：
  内部节点（只存键）：   [10, 20]
                      /     |     \
叶子节点（存数据和键）：[1,5] [10,15] [20,25]
                      ↓     ↓       ↓
                      (数据) (数据)  (数据)
叶子节点之间通过指针连接： [1,5] → [10,15] → [20,25]
```

**B+树的优势**：

| 特性 | B树 | B+树 |
|------|-----|------|
| 数据存储 | 内部节点和叶子节点 | 仅叶子节点 |
| 内部节点容量 | 较小（含数据） | 更大（只有键） |
| 范围查询 | 中序遍历 | 叶子链表遍历 |
| I/O次数 | 较多 | 更少（内部节点容量大） |
| 顺序访问 | O(log n + k) | O(log n + k)但更快 |

### 代码实现

```java
/**
 * B+树简化实现
 */
public class BPlusTree {
    
    private static final int ORDER = 4;
    private InternalNode root;
    
    // 内部节点（只存键，不存数据）
    static class InternalNode {
        int[] keys = new int[ORDER - 1];
        Node[] children = new Node[ORDER];
        int keyCount = 0;
    }
    
    // 抽象节点
    static abstract class Node {}
    
    // 叶子节点（存键值对）
    static class LeafNode extends Node {
        int[] keys = new int[ORDER - 1];
        String[] values = new String[ORDER - 1];
        int keyCount = 0;
        LeafNode next;  // 指向下一个叶子节点（形成链表）
    }
    
    // 范围查询
    public List<String> rangeQuery(int from, int to) {
        List<String> result = new ArrayList<>();
        LeafNode leaf = findLeaf(from);
        
        while (leaf != null) {
            for (int i = 0; i < leaf.keyCount; i++) {
                if (leaf.keys[i] > to) return result;
                if (leaf.keys[i] >= from) {
                    result.add(leaf.values[i]);
                }
            }
            leaf = leaf.next;
        }
        return result;
    }
    
    // 查找叶子节点
    private LeafNode findLeaf(int key) {
        if (root == null) return null;
        Node node = root;
        
        while (node instanceof InternalNode) {
            InternalNode internal = (InternalNode) node;
            int i = 0;
            while (i < internal.keyCount && key >= internal.keys[i]) {
                i++;
            }
            node = internal.children[i];
        }
        return (LeafNode) node;
    }
    
    // 顺序遍历所有叶子节点
    public List<String> scanAll() {
        if (root == null) return new ArrayList<>();
        
        // 找到最左边的叶子节点
        Node node = root;
        while (node instanceof InternalNode) {
            node = ((InternalNode) node).children[0];
        }
        
        List<String> result = new ArrayList<>();
        LeafNode leaf = (LeafNode) node;
        while (leaf != null) {
            for (int i = 0; i < leaf.keyCount; i++) {
                result.add(leaf.values[i]);
            }
            leaf = leaf.next;
        }
        return result;
    }
}
```

### 使用场景

- **MySQL InnoDB索引**：主键索引 & 二级索引
- **MongoDB索引**：默认使用B+树
- **文件系统**：ReiserFS、XFS

### 潜在风险与问题

- **插入/删除性能**：叶子节点分裂和合并操作复杂
- **空间放大**：内部节点只存路由键，但叶子节点包含所有数据
- **写放大**：LSM-Tree（LevelDB、RocksDB）在这方面优于B+树

### 优化策略

- 使用缓冲池（Buffer Pool）缓存热点节点
- 自适应哈希索引（AHI）：InnoDB将频繁访问的B+树节点转为哈希索引
- 页合并：删除时尝试合并相邻叶子节点

### 典型问题处理

**面试题：为什么数据库用B+树而非B树？**

1. 内部节点不存数据→容量更大→树更低→I/O更少
2. 叶子节点形成链表→范围查询高效
3. 所有数据在叶子节点→查询性能稳定（都到叶子层）

---

## 10.3 数据库索引为什么用B+树

### 磁盘I/O特性

```
机械磁盘随机I/O性能：
- 寻道时间：~10ms
- 传输时间：~0.1ms

如果有100万条数据：
- 二叉树（高度20）：最多20次I/O = 200ms
- B+树（m=500，高度3）：最多3次I/O = 30ms

对于磁盘而言，树高降低1级，性能提升数倍！
```

### 索引类型对比

| 索引类型 | 数据结构 | 特点 |
|---------|---------|------|
| 主键索引 | B+树 | 叶子节点存完整行数据 |
| 二级索引 | B+树 | 叶子节点存主键值 |
| 联合索引 | B+树 | 多列组合排序 |
| 哈希索引 | 哈希表 | O(1)等值查找，不支持范围 |
| 全文索引 | 倒排索引 | 关键词搜索 |

### 典型问题处理

**面试题：为什么MySQL InnoDB用B+树而不是哈希索引？**

哈希索引只支持等值查询（=），不支持范围查询（>, <, BETWEEN）。B+树既支持等值查询也支持范围查询，还支持排序（ORDER BY）。虽然哈希索引等值查询更快（O(1) vs O(log n)），但B+树的通用性更好。

---

> **本章总结**：B树和B+树通过多路分支大幅降低了树高，是磁盘场景下最优秀的索引结构。B+树作为B树的优化版本，通过叶子节点链表和纯路由的内部节点，在范围查询和顺序访问方面更胜一筹。MySQL InnoDB、MongoDB等主流数据库系统都使用B+树作为底层索引结构。