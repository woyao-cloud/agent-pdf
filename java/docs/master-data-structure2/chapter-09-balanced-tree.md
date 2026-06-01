# 第9章 平衡二叉树

## 9.1 二叉搜索树（BST）

### 解决的问题

普通二叉搜索树在特定输入下会退化为链表（如升序插入时全成右子树），查找复杂度从O(log n)降为O(n)。解决这个问题的根本方法是**保持树的平衡**。

> **核心价值**：BST是所有平衡树（AVL、红黑树）的基础。理解BST的退化问题是理解平衡树设计的起点。

### 实现原理

**BST的退化问题**：

```
有序插入 1, 2, 3, 4, 5 的结果：
1                   1
 \                   \
  2        →          2
   \                   \
    3                   3
     \                   \
      4                   4
       \                   \
        5                   5

退化为链表！查找5需要O(n)！
```

**解决思路**：在插入和删除操作后，通过旋转操作重新平衡树。

### 代码实现

```java
/**
 * BST的旋转操作（平衡树的基础）
 */
public class BSTRotation {
    
    // 右旋（左子节点上升为父节点）
    //       y              x
    //      / \            / \
    //     x   C    →     A   y
    //    / \                / \
    //   A   B              B   C
    private TreeNode rotateRight(TreeNode y) {
        TreeNode x = y.left;
        TreeNode B = x.right;
        
        x.right = y;
        y.left = B;
        
        return x;  // 新的根
    }
    
    // 左旋（右子节点上升为父节点）
    //     x                y
    //    / \              / \
    //   A   y     →     x   C
    //      / \          / \
    //     B   C        A   B
    private TreeNode rotateLeft(TreeNode x) {
        TreeNode y = x.right;
        TreeNode B = y.left;
        
        y.left = x;
        x.right = B;
        
        return y;  // 新的根
    }
}
```

---

## 9.2 AVL树旋转操作

### 解决的问题

AVL树是最早的自平衡二叉搜索树。它的核心思想是：**每个节点的左右子树高度差不超过1**，通过旋转操作维持这个平衡条件。

> **核心价值**：AVL树是严格平衡的二叉搜索树，操作复杂度严格O(log n)，适合查找远多于插入的场景。

### 实现原理

**平衡因子（Balance Factor）**：BF = 左子树高度 - 右子树高度

```
AVL树平衡条件：|BF| ≤ 1

BF=2或BF=-2时需要进行旋转平衡

四种不平衡情况：
1. 左-左（LL）：右旋
2. 右-右（RR）：左旋
3. 左-右（LR）：左旋+右旋
4. 右-左（RL）：右旋+左旋
```

### 代码实现

```java
/**
 * AVL树完整实现
 */
public class AVLTree {
    
    private TreeNode root;
    
    private static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        int height;  // 以该节点为根的树的高度
        
        TreeNode(int val) {
            this.val = val;
            this.height = 1;
        }
    }
    
    // 获取高度
    private int height(TreeNode node) {
        return node == null ? 0 : node.height;
    }
    
    // 计算平衡因子
    private int balanceFactor(TreeNode node) {
        return node == null ? 0 : height(node.left) - height(node.right);
    }
    
    // 更新高度
    private void updateHeight(TreeNode node) {
        node.height = 1 + Math.max(height(node.left), height(node.right));
    }
    
    // 右旋（LL情况）
    private TreeNode rotateRight(TreeNode y) {
        TreeNode x = y.left;
        TreeNode T2 = x.right;
        
        x.right = y;
        y.left = T2;
        
        updateHeight(y);
        updateHeight(x);
        
        return x;
    }
    
    // 左旋（RR情况）
    private TreeNode rotateLeft(TreeNode x) {
        TreeNode y = x.right;
        TreeNode T2 = y.left;
        
        y.left = x;
        x.right = T2;
        
        updateHeight(x);
        updateHeight(y);
        
        return y;
    }
    
    // 插入
    public void insert(int val) {
        root = insertRec(root, val);
    }
    
    private TreeNode insertRec(TreeNode node, int val) {
        if (node == null) return new TreeNode(val);
        
        if (val < node.val) {
            node.left = insertRec(node.left, val);
        } else if (val > node.val) {
            node.right = insertRec(node.right, val);
        } else {
            return node;  // 重复值
        }
        
        // 更新高度
        updateHeight(node);
        
        // 检查平衡并旋转
        return balance(node);
    }
    
    // 删除
    public void delete(int val) {
        root = deleteRec(root, val);
    }
    
    private TreeNode deleteRec(TreeNode node, int val) {
        if (node == null) return null;
        
        if (val < node.val) {
            node.left = deleteRec(node.left, val);
        } else if (val > node.val) {
            node.right = deleteRec(node.right, val);
        } else {
            if (node.left == null || node.right == null) {
                node = (node.left != null) ? node.left : node.right;
            } else {
                TreeNode min = findMin(node.right);
                node.val = min.val;
                node.right = deleteRec(node.right, min.val);
            }
        }
        
        if (node == null) return null;
        
        updateHeight(node);
        return balance(node);
    }
    
    // 平衡操作
    private TreeNode balance(TreeNode node) {
        int bf = balanceFactor(node);
        
        // LL：左子树比右子树高2，且左子树的左子树更高
        if (bf > 1 && balanceFactor(node.left) >= 0) {
            return rotateRight(node);
        }
        
        // LR：左子树比右子树高2，但左子树的右子树更高
        if (bf > 1 && balanceFactor(node.left) < 0) {
            node.left = rotateLeft(node.left);
            return rotateRight(node);
        }
        
        // RR：右子树比左子树高2，且右子树的右子树更高
        if (bf < -1 && balanceFactor(node.right) <= 0) {
            return rotateLeft(node);
        }
        
        // RL：右子树比左子树高2，但右子树的左子树更高
        if (bf < -1 && balanceFactor(node.right) > 0) {
            node.right = rotateRight(node.right);
            return rotateLeft(node);
        }
        
        return node;
    }
    
    private TreeNode findMin(TreeNode node) {
        while (node.left != null) node = node.left;
        return node;
    }
    
    // 验证AVL树是否平衡
    public boolean isBalanced() {
        return isBalancedRec(root);
    }
    
    private boolean isBalancedRec(TreeNode node) {
        if (node == null) return true;
        int bf = balanceFactor(node);
        return Math.abs(bf) <= 1 
            && isBalancedRec(node.left) 
            && isBalancedRec(node.right);
    }
    
    public static void main(String[] args) {
        AVLTree avl = new AVLTree();
        
        // 插入有序序列，测试AVL是否平衡
        for (int i = 1; i <= 10; i++) {
            avl.insert(i);
        }
        
        System.out.println("AVL树是否平衡: " + avl.isBalanced());  // true
        
        // 验证树高：10个元素的AVL树高约log₂(10) ≈ 4
        // 如果用普通BST，树高为10（退化为链表）
    }
}
```

### 使用场景

- **查找远多于插入的场景**：如字典、配置管理
- **需要严格性能保证的场景**：实时系统
- **数据库中的辅助索引**：某些场景下使用AVL树

### 潜在风险与问题

- **频繁插入/删除**：每次操作都需要检查平衡并旋转，开销较大
- **额外的存储空间**：每个节点需要存储高度信息
- **实现复杂度**：旋转逻辑复杂，容易出错

### 优化策略

- 插入频繁的场景考虑红黑树（牺牲平衡性换取更少的旋转）
- 使用非递归实现提高性能
- 尾部递归优化

### 典型问题处理

**面试题：AVL树和红黑树的区别？**

- AVL平衡更严格（|BF|≤1），红黑树（最长路径不超过最短路径的2倍）
- AVL查找更快，红黑树插入/删除更快
- AVL适合查找密集场景，红黑树适合频繁增删场景

---

## 9.3 红黑树与变色旋转

### 解决的问题

红黑树是JDK中最重要的平衡树——TreeMap、TreeSet、JDK 8+ HashMap（冲突链表超过8时）都使用红黑树。它通过**松弛的平衡条件**减少了旋转次数，适合频繁插入删除的场景。

> **核心价值**：红黑树是工程实践中使用最广泛的平衡树，Java集合框架的精髓之一。

### 实现原理

**红黑树的五个约束**：

```
1. 每个节点要么是红色，要么是黑色
2. 根节点必须是黑色
3. 每个叶节点（null）是黑色
4. 红色节点的子节点必须是黑色（不能有两个连续的红色节点）
5. 从任意节点到其所有叶节点的路径上，黑色节点的数量相同

这些约束保证了：最长路径 ≤ 2 × 最短路径（最短=全黑，最长=红黑交替）
```

**红黑树的核心操作**：
- **变色**：节点的颜色从红变黑或黑变红
- **左旋**：与AVL的左旋相同
- **右旋**：与AVL的右旋相同

**插入修复的三种情况**：

```
情况1：叔叔节点是红色 → 变色（父、叔变黑，祖父变红）
情况2：叔叔节点是黑色，LL/RR → 右旋/左旋 + 变色
情况3：叔叔节点是黑色，LR/RL → 先小旋转再大旋转 + 变色
```

### 代码实现

```java
/**
 * 红黑树简化实现（仅展示插入修复）
 */
public class RedBlackTree {
    
    private static final boolean RED = true;
    private static final boolean BLACK = false;
    
    private TreeNode root;
    
    private static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode parent;
        boolean color;  // RED or BLACK
        
        TreeNode(int val) {
            this.val = val;
            this.color = RED;  // 新节点默认为红色
        }
    }
    
    // ========== 左旋 ==========
    private void rotateLeft(TreeNode x) {
        TreeNode y = x.right;
        x.right = y.left;
        if (y.left != null) y.left.parent = x;
        y.parent = x.parent;
        
        if (x.parent == null) {
            root = y;
        } else if (x == x.parent.left) {
            x.parent.left = y;
        } else {
            x.parent.right = y;
        }
        y.left = x;
        x.parent = y;
    }
    
    // ========== 右旋 ==========
    private void rotateRight(TreeNode x) {
        TreeNode y = x.left;
        x.left = y.right;
        if (y.right != null) y.right.parent = x;
        y.parent = x.parent;
        
        if (x.parent == null) {
            root = y;
        } else if (x == x.parent.right) {
            x.parent.right = y;
        } else {
            x.parent.left = y;
        }
        y.right = x;
        x.parent = y;
    }
    
    // ========== 插入 ==========
    public void insert(int val) {
        TreeNode newNode = new TreeNode(val);
        
        if (root == null) {
            root = newNode;
            root.color = BLACK;
            return;
        }
        
        TreeNode curr = root;
        TreeNode parent = null;
        
        while (curr != null) {
            parent = curr;
            if (val < curr.val) curr = curr.left;
            else if (val > curr.val) curr = curr.right;
            else return;  // 已存在
        }
        
        newNode.parent = parent;
        if (val < parent.val) parent.left = newNode;
        else parent.right = newNode;
        
        // 插入后修复
        fixInsert(newNode);
    }
    
    // 插入修复
    private void fixInsert(TreeNode x) {
        while (x != root && x.parent.color == RED) {
            TreeNode parent = x.parent;
            TreeNode grandparent = parent.parent;
            
            // 父节点是祖父的左子节点
            if (parent == grandparent.left) {
                TreeNode uncle = grandparent.right;
                
                // 情况1：叔叔是红色 → 变色
                if (uncle != null && uncle.color == RED) {
                    parent.color = BLACK;
                    uncle.color = BLACK;
                    grandparent.color = RED;
                    x = grandparent;  // 继续向上修复
                } else {
                    // 情况3：x是右子 → 先左旋
                    if (x == parent.right) {
                        x = parent;
                        rotateLeft(x);
                        parent = x.parent;
                    }
                    // 情况2：x是左子 → 右旋+变色
                    parent.color = BLACK;
                    grandparent.color = RED;
                    rotateRight(grandparent);
                }
            } else {
                // 父节点是祖父的右子节点（对称）
                TreeNode uncle = grandparent.left;
                
                if (uncle != null && uncle.color == RED) {
                    parent.color = BLACK;
                    uncle.color = BLACK;
                    grandparent.color = RED;
                    x = grandparent;
                } else {
                    if (x == parent.left) {
                        x = parent;
                        rotateRight(x);
                        parent = x.parent;
                    }
                    parent.color = BLACK;
                    grandparent.color = RED;
                    rotateLeft(grandparent);
                }
            }
        }
        root.color = BLACK;
    }
    
    // 中序遍历验证有序性
    public List<Integer> inorder() {
        List<Integer> result = new ArrayList<>();
        inorderRec(root, result);
        return result;
    }
    
    private void inorderRec(TreeNode node, List<Integer> result) {
        if (node == null) return;
        inorderRec(node.left, result);
        result.add(node.val);
        inorderRec(node.right, result);
    }
    
    // 验证红黑树性质
    public boolean isValidRedBlackTree() {
        return root != null 
            && root.color == BLACK  // 性质2
            && validateRedBlack(root);
    }
    
    private boolean validateRedBlack(TreeNode node) {
        if (node == null) return true;
        
        // 性质4：红色节点的子节点必须是黑色
        if (node.color == RED) {
            if ((node.left != null && node.left.color == RED) ||
                (node.right != null && node.right.color == RED)) {
                return false;
            }
        }
        
        return validateRedBlack(node.left) && validateRedBlack(node.right);
    }
    
    public static void main(String[] args) {
        RedBlackTree rbt = new RedBlackTree();
        
        // 插入1-15
        for (int i = 1; i <= 15; i++) {
            rbt.insert(i);
        }
        
        System.out.println("中序遍历: " + rbt.inorder());
        System.out.println("是否是有效的红黑树: " + rbt.isValidRedBlackTree());
    }
}
```

### 使用场景

- **TreeMap/TreeSet**：JDK中基于红黑树的实现
- **HashMap的冲突优化**：链表超过8时转为红黑树
- **Linux内核**：进程调度、虚拟内存管理
- **Nginx**：定时器管理

### 潜在风险与问题

- **实现复杂**：5个约束条件使代码维护困难
- **调试困难**：旋转和变色组合多
- **非严格平衡**：不如AVL树查找快

### 优化策略

- 使用JDK现成的TreeMap/TreeSet（不必自己实现红黑树）
- 插入性能好于AVL（旋转次数少），查找不如AVL

### 典型问题处理

**面试题：红黑树的5个约束条件为什么能保证平衡？**

性质4（无连续红节点）和性质5（每条路径黑节点数相同）一起保证了：最短路径 = 全黑，最长路径 = 红黑交替 = 2×最短路径。所以任何路径长度不超过最短路径的2倍。

---

## 9.4 JDK源码解析（TreeMap）

### 解决的问题

TreeMap是JDK中基于红黑树的Map实现。与HashMap不同，TreeMap的key是有序的，支持范围查询。

### 实现原理

```
TreeMap<K,V>
├── 底层：红黑树
├── 节点：Entry<K,V>（包含key, value, left, right, parent, color）
├── 排序：Comparator 或 自然顺序（Comparable）
└── 特性：有序、非线程安全
```

### 代码实现

```java
/**
 * TreeMap 源码解析
 */
public class TreeMapSourceAnalysis {
    
    /**
     * ========== 1. 节点定义 ==========
     *
     * static final class Entry<K,V> implements Map.Entry<K,V> {
     *     K key;
     *     V value;
     *     Entry<K,V> left;     // 左子节点
     *     Entry<K,V> right;    // 右子节点
     *     Entry<K,V> parent;   // 父节点
     *     boolean color = BLACK;  // 默认为黑色
     *
     *     Entry(K key, V value, Entry<K,V> parent) {
     *         this.key = key;
     *         this.value = value;
     *         this.parent = parent;
     *     }
     * }
     */
    
    /**
     * ========== 2. put(K key, V value) ==========
     *
     * 1. 如果根为空，创建根节点
     * 2. 从根开始比较key，找到插入位置
     * 3. 创建新节点
     * 4. 调用 fixAfterInsertion(e) 修复红黑树性质
     *
     * 比较过程使用Comparator或Comparable：
     * Comparator<? super K> cpr = comparator;
     * if (cpr != null) {
     *     do {
     *         parent = t;
     *         cmp = cpr.compare(key, t.key);
     *         if (cmp < 0) t = t.left;
     *         else if (cmp > 0) t = t.right;
     *         else return t.setValue(value);  // 找到相同的key
     *     } while (t != null);
     * }
     */
    
    /**
     * ========== 3. 范围查询 ==========
     *
     * // 获取子Map
     * NavigableMap<K,V> subMap(K fromKey, boolean fromInclusive,
     *                         K toKey, boolean toInclusive)
     * NavigableMap<K,V> headMap(K toKey, boolean inclusive)
     * NavigableMap<K,V> tailMap(K fromKey, boolean inclusive)
     *
     * // 获取最近元素
     * Map.Entry<K,V> ceilingEntry(K key)  // >= key的最小元素
     * Map.Entry<K,V> floorEntry(K key)    // <= key的最大元素
     * Map.Entry<K,V> higherEntry(K key)   // > key的最小元素
     * Map.Entry<K,V> lowerEntry(K key)    // < key的最大元素
     */
    
    public static void main(String[] args) {
        TreeMap<Integer, String> treeMap = new TreeMap<>();
        
        treeMap.put(3, "three");
        treeMap.put(1, "one");
        treeMap.put(4, "four");
        treeMap.put(2, "two");
        
        // TreeMap自动排序
        System.out.println(treeMap);  // {1=one, 2=two, 3=three, 4=four}
        
        // 范围查询
        System.out.println(treeMap.subMap(2, true, 4, false));  // {2=two, 3=three}
        System.out.println(treeMap.headMap(3));  // {1=one, 2=two}
        System.out.println(treeMap.tailMap(3));  // {3=three, 4=four}
        
        // 最近元素查询
        System.out.println(treeMap.ceilingKey(3));  // 3
        System.out.println(treeMap.floorKey(5));    // 4
        System.out.println(treeMap.lowerKey(3));    // 2
        System.out.println(treeMap.higherKey(3));   // 4
    }
}
```

### 使用场景

- **需要有序Map**：按key排序的Map
- **范围查询**：需要查询某个范围内的所有元素
- **最近元素查询**：e.g. 查找>=x的最小元素
- **自动排序**：如实时排行榜

### 潜在风险与问题

- **性能不如HashMap**：所有操作O(log n)
- **key必须可比较**：需要实现Comparable或传入Comparator
- **null处理**：TreeMap不允许null（但Comparator可以为null处理）

### 优化策略

- 不需要排序时使用HashMap
- 需要排序但数据量大时考虑ConcurrentSkipListMap

### 典型问题处理

**面试题：TreeMap什么时候用Comparable什么时候用Comparator？**

- Comparable：key的自然顺序（如Integer、String）
- Comparator：自定义排序方式（如按字符串长度排序）

```java
// 自定义比较器
TreeMap<String, Integer> map = new TreeMap<>((a, b) -> b.compareTo(a));
// 按key降序排列
```

---

## 9.5 使用场景与风险分析

### 平衡树的工程选型

| 场景 | 推荐 | 原因 |
|------|------|------|
| 查找密集 | AVL树 | 严格平衡 |
| 增删频繁 | 红黑树 | 旋转少 |
| 需要有序Map | TreeMap | 红黑树+排序 |
| 并发环境 | ConcurrentSkipListMap | 无锁 |
| 范围查询 | B+树 | 磁盘友好 |

### 潜在风险与问题

- **红黑树理解困难**：增加维护成本
- **旋转开销**：虽然少于AVL但仍有开销
- **空间开销**：每个节点存储颜色和指针

### 优化策略

- 多数场景使用TreeMap/TreeSet，不要手写
- 并发场景使用ConcurrentSkipListMap
- 需要大量范围查询考虑B+树

### 典型问题处理

**工程实践：百万级数据的有序存储**

- 内存中：TreeMap（红黑树）O(log n)
- 磁盘上：B+树（MySQL InnoDB）
- 分布式：跳表（Redis）

---

## 9.6 性能优化技巧

### 平衡树的性能调优

| 优化方向 | 方法 | 效果 |
|---------|------|------|
| 减少比较 | 使用int key，直接比较 | 减少Comparable调用 |
| 减少旋转 | 选择红黑树而非AVL | 插入性能提升20-30% |
| 非递归 | 使用迭代代替递归 | 避免栈溢出 |
| 批量操作 | 使用putAll() | 减少树调整次数 |

### 典型问题处理

**面试题：什么是B树？为什么数据库用B+树而不是红黑树？**

红黑树是二叉树，在磁盘场景下，树高决定了I/O次数。百万级数据的红黑树高度约20，每次查询需要20次I/O。B+树每个节点可以存储上千个键，同样的数据高度只需3-4，I/O次数大大减少。

---

> **本章总结**：平衡树解决了BST的退化问题。AVL树通过严格平衡提供了最优的查找性能，红黑树通过松弛平衡提供了更好的插入性能。JDK中的TreeMap基于红黑树实现，提供了有序Map和范围查询能力。在实际工程中，应根据场景选择合适的平衡树：查找密集用AVL，增删频繁用红黑树，并发环境用跳表。