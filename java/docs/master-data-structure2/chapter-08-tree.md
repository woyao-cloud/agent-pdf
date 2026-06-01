# 第8章 树与二叉树

## 8.1 树的定义与术语

### 解决的问题

树是一种**层次化**的数据结构，用于表示具有层级关系的数据。它解决了线性结构（数组、链表）无法高效表达的**一对多关系**。文件系统、组织结构、HTML DOM、编译器语法树，都是树的应用。

> **核心价值**：树是处理层次化数据和实现高效查找的核心结构，是平衡树、堆、B树等高级数据结构的基础。

### 实现原理

**树的定义**：树是n（n≥0）个节点的有限集合。当n=0时为空树。在任意非空树中：
- 有且仅有一个根节点（Root）
- 其余节点分为m（m>0）个互不相交的有限集合，每个集合本身也是一棵树（子树）

**树的术语**：

```
         A (根节点)            ← 根节点（没有父节点）
       / | \
     B   C   D               ← 兄弟节点（同一层）
    / \     / \
   E   F   G   H             ← 叶节点（没有子节点）
   
节点A的度=3, 节点B的度=2, 节点E的度=0
树的度=max(所有节点的度)=3
树的深度=4（根为第1层）
```

| 术语 | 定义 |
|------|------|
| 根节点 | 没有父节点的节点 |
| 叶节点 | 没有子节点的节点 |
| 父节点/子节点 | 直接相连的上下层节点 |
| 兄弟节点 | 同一父节点的子节点 |
| 节点的度 | 节点的子节点数 |
| 树的度 | 所有节点中的最大度数 |
| 树的深度/高度 | 树的最大层数 |

### 代码实现

```java
/**
 * 树的通用表示方式
 */
public class TreeRepresentation {
    
    // 1. 双亲表示法（每个节点记录父节点索引）
    static class ParentTree {
        static class Node {
            String data;
            int parent;  // 父节点索引，根节点为-1
        }
        Node[] nodes;
        int rootIndex;  // 根节点索引
    }
    
    // 2. 孩子表示法（每个节点记录子节点列表）
    static class ChildTree {
        static class Node {
            String data;
            List<Node> children;
        }
        Node root;
    }
    
    // 3. 左孩子右兄弟表示法（将多叉树转为二叉树）
    static class BinaryRepresentation {
        static class Node {
            String data;
            Node firstChild;   // 第一个子节点
            Node nextSibling;  // 下一个兄弟节点
        }
        Node root;
    }
}
```

### 使用场景

- **文件系统**：目录的层次结构
- **HTML DOM**：文档对象模型
- **组织结构**：公司部门层级
- **编译器**：抽象语法树（AST）
- **网络路由**：路由表

### 潜在风险与问题

- **退化风险**：树可能退化为链表（如只有左子树）
- **深度过大**：递归操作可能导致栈溢出
- **平衡问题**：不平衡的树影响查找效率

### 优化策略

- 控制树的深度，保持平衡
- 使用非递归遍历避免栈溢出
- 使用平衡树（AVL、红黑树）保证性能

### 典型问题处理

**面试题：树的度和树的深度之间的关系？**

在有n个节点的m叉树中，最小深度为log_m(n)+1（完全m叉树），最大深度为n（退化为链表）。

---

## 8.2 二叉树的遍历（递归与非递归）

### 解决的问题

二叉树遍历是树操作的核心。掌握递归和非递归两种遍历方式，是解决树相关问题的基本功。

> **核心价值**：前序、中序、后序、层序四种遍历方式，覆盖了所有树的访问需求。

### 实现原理

**二叉树节点定义**：
```java
class TreeNode {
    int val;
    TreeNode left;   // 左子节点
    TreeNode right;  // 右子节点
}
```

**四种遍历方式**：

```
      1
     / \
    2   3
   / \   \
  4   5   6

前序（根左右）：1, 2, 4, 5, 3, 6
中序（左根右）：4, 2, 5, 1, 3, 6
后序（左右根）：4, 5, 2, 6, 3, 1
层序（逐层）：  1, 2, 3, 4, 5, 6
```

### 代码实现

```java
/**
 * 二叉树的递归和非递归遍历
 */
public class BinaryTreeTraversal {
    
    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode(int val) {
            this.val = val;
        }
    }
    
    // ========== 递归遍历 ==========
    
    // 前序遍历（根左右）
    public void preorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        result.add(root.val);        // 访问根
        preorderRecursive(root.left, result);   // 左子树
        preorderRecursive(root.right, result);  // 右子树
    }
    
    // 中序遍历（左根右）
    public void inorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        inorderRecursive(root.left, result);    // 左子树
        result.add(root.val);        // 访问根
        inorderRecursive(root.right, result);   // 右子树
    }
    
    // 后序遍历（左右根）
    public void postorderRecursive(TreeNode root, List<Integer> result) {
        if (root == null) return;
        postorderRecursive(root.left, result);  // 左子树
        postorderRecursive(root.right, result); // 右子树
        result.add(root.val);        // 访问根
    }
    
    // ========== 非递归遍历（使用栈）==========
    
    // 前序遍历（非递归）
    public List<Integer> preorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;
        
        Deque<TreeNode> stack = new ArrayDeque<>();
        stack.push(root);
        
        while (!stack.isEmpty()) {
            TreeNode node = stack.pop();
            result.add(node.val);
            // 先压右再压左（出栈时先左后右）
            if (node.right != null) stack.push(node.right);
            if (node.left != null) stack.push(node.left);
        }
        return result;
    }
    
    // 中序遍历（非递归）
    public List<Integer> inorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode curr = root;
        
        while (curr != null || !stack.isEmpty()) {
            // 一直向左走，将经过的节点压栈
            while (curr != null) {
                stack.push(curr);
                curr = curr.left;
            }
            // 弹出栈顶，访问，然后转向右子树
            curr = stack.pop();
            result.add(curr.val);
            curr = curr.right;
        }
        return result;
    }
    
    // 后序遍历（非递归，双栈法）
    public List<Integer> postorderIterative(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;
        
        Deque<TreeNode> stack1 = new ArrayDeque<>();
        Deque<TreeNode> stack2 = new ArrayDeque<>();
        stack1.push(root);
        
        while (!stack1.isEmpty()) {
            TreeNode node = stack1.pop();
            stack2.push(node);
            if (node.left != null) stack1.push(node.left);
            if (node.right != null) stack1.push(node.right);
        }
        
        while (!stack2.isEmpty()) {
            result.add(stack2.pop().val);
        }
        return result;
    }
    
    // 层序遍历（BFS，使用队列）
    public List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> result = new ArrayList<>();
        if (root == null) return result;
        
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        
        while (!queue.isEmpty()) {
            int levelSize = queue.size();  // 当前层的节点数
            List<Integer> level = new ArrayList<>();
            
            for (int i = 0; i < levelSize; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            result.add(level);
        }
        return result;
    }
    
    // 使用示例
    public static void main(String[] args) {
        TreeNode root = new TreeNode(1);
        root.left = new TreeNode(2);
        root.right = new TreeNode(3);
        root.left.left = new TreeNode(4);
        root.left.right = new TreeNode(5);
        root.right.right = new TreeNode(6);
        
        BinaryTreeTraversal t = new BinaryTreeTraversal();
        
        System.out.println("前序: " + t.preorderIterative(root));
        System.out.println("中序: " + t.inorderIterative(root));
        System.out.println("后序: " + t.postorderIterative(root));
        System.out.println("层序: " + t.levelOrder(root));
    }
}
```

### 使用场景

| 遍历方式 | 典型应用 |
|---------|---------|
| 前序 | 序列化/反序列化、表达式树的构建 |
| 中序 | 二叉搜索树的顺序输出 |
| 后序 | 计算目录大小（先计算子目录再累加） |
| 层序 | 最短路径、广度优先搜索 |

### 潜在风险与问题

- **递归深度**：树深度过大时递归遍历导致StackOverflowError
- **非递归复杂性**：后序遍历的非递归实现较复杂
- **空间复杂度**：非递归遍历也需要O(h)的栈空间（h为树高）

### 优化策略

- 递归方式简洁，适用于深度可控的树
- 非递归方式可控，适用于深度不可控的树
- Morris遍历可实现O(1)空间复杂度的遍历

### 典型问题处理

**面试题：如何用Morris遍历实现O(1)空间的二叉树遍历？**

```java
// Morris遍历利用叶子节点的空闲指针（右指针）记录后继节点的位置
// 核心思想：
// 1. 当前节点没有左子树 → 访问当前节点，转向右子树
// 2. 当前节点有左子树 → 找到左子树的最右节点
//    - 如果最右节点的右指针为空，指向当前节点（线索化），转向左子树
//    - 如果最右节点的右指针指向当前节点，恢复为null，访问当前节点，转向右子树
```

---

## 8.3 手写二叉树实现

### 解决的问题

手写二叉树是深入理解树结构的最好方式。通过实现插入、删除、查找、遍历等核心操作，可以巩固对树的理解。

### 代码实现

```java
/**
 * 完整二叉树实现（二叉搜索树）
 */
public class BinarySearchTree {
    
    private TreeNode root;
    
    private static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        
        TreeNode(int val) {
            this.val = val;
        }
    }
    
    // 插入 —— O(log n)平均
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
            // 重复值，根据需求处理
            return node;
        }
        return node;
    }
    
    // 查找 —— O(log n)平均
    public boolean search(int val) {
        TreeNode curr = root;
        while (curr != null) {
            if (curr.val == val) return true;
            if (val < curr.val) curr = curr.left;
            else curr = curr.right;
        }
        return false;
    }
    
    // 删除 —— O(log n)平均
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
            // 找到要删除的节点
            if (node.left == null) return node.right;      // 只有右子树或无子节点
            if (node.right == null) return node.left;      // 只有左子树
            
            // 有两个子节点：找到右子树的最小节点替换
            TreeNode minNode = findMin(node.right);
            node.val = minNode.val;
            node.right = deleteRec(node.right, minNode.val);
        }
        return node;
    }
    
    private TreeNode findMin(TreeNode node) {
        while (node.left != null) node = node.left;
        return node;
    }
    
    // 查找最小值 —— O(log n)
    public int findMin() {
        if (root == null) throw new NoSuchElementException();
        return findMin(root).val;
    }
    
    // 查找最大值 —— O(log n)
    public int findMax() {
        if (root == null) throw new NoSuchElementException();
        TreeNode curr = root;
        while (curr.right != null) curr = curr.right;
        return curr.val;
    }
    
    // 验证是否为二叉搜索树
    public boolean isValidBST() {
        return isValidBST(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }
    
    private boolean isValidBST(TreeNode node, long min, long max) {
        if (node == null) return true;
        if (node.val <= min || node.val >= max) return false;
        return isValidBST(node.left, min, node.val) 
            && isValidBST(node.right, node.val, max);
    }
    
    // 获取树的高度
    public int height() {
        return heightRec(root);
    }
    
    private int heightRec(TreeNode node) {
        if (node == null) return 0;
        return 1 + Math.max(heightRec(node.left), heightRec(node.right));
    }
    
    // 中序遍历（升序输出）
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
    
    public static void main(String[] args) {
        BinarySearchTree bst = new BinarySearchTree();
        bst.insert(5);
        bst.insert(3);
        bst.insert(7);
        bst.insert(1);
        bst.insert(9);
        
        System.out.println("中序遍历: " + bst.inorder());  // [1, 3, 5, 7, 9]
        System.out.println("最小值: " + bst.findMin());    // 1
        System.out.println("最大值: " + bst.findMax());    // 9
        System.out.println("查找7: " + bst.search(7));     // true
        System.out.println("是否是BST: " + bst.isValidBST()); // true
        
        bst.delete(3);
        System.out.println("删除3后: " + bst.inorder());   // [1, 5, 7, 9]
    }
}
```

### 使用场景

- **动态数据集合**：频繁插入、删除、查找的场景
- **排序输出**：BST的中序遍历就是排序输出
- **范围查询**：查找某个范围内的所有元素
- **数据验证**：验证数据是否满足BST性质

### 潜在风险与问题

- **退化问题**：有序插入时BST退化为链表，所有操作降为O(n)
- **删除复杂度**：删除节点有多种情况，实现较为复杂
- **不平衡问题**：普通BST不保证平衡，需要平衡树解决

### 优化策略

- 插入时使用随机化避免退化
- 使用AVL树或红黑树保证平衡
- 使用尾部递归优化（编译器优化后更好）

### 典型问题处理

**面试题：二叉树的直径（两个节点之间的最长路径）**

```java
class Solution {
    int maxDiameter = 0;
    
    public int diameterOfBinaryTree(TreeNode root) {
        height(root);
        return maxDiameter;
    }
    
    private int height(TreeNode node) {
        if (node == null) return 0;
        int left = height(node.left);
        int right = height(node.right);
        maxDiameter = Math.max(maxDiameter, left + right);
        return 1 + Math.max(left, right);
    }
}
```

---

## 8.4 使用场景与风险分析

### 二叉树在工程中的应用

| 应用场景 | 具体使用 | 数据结构 |
|---------|---------|---------|
| 文件系统 | 目录树 | N叉树 |
| 数据库索引 | InnoDB B+树 | B+树 |
| 缓存淘汰 | LFU算法 | 二叉树+哈希 |
| 表达式计算 | 表达式树 | 二叉树 |
| 搜索建议 | 字典树 | Trie树 |
| 编译器 | 抽象语法树 | 多叉树 |

### 潜在风险与问题

- **树不平衡**：BST有序插入退化为链表
- **递归深度限制**：Java默认栈深度约10000层
- **内存碎片**：节点分散在堆中，GC压力大
- **并发问题**：非线程安全的树在多线程下需要加锁

### 优化策略

- 使用平衡树（AVL、红黑树）保证操作效率
- 递归操作时考虑迭代替代方案
- 使用线程安全的树结构（ConcurrentSkipListMap）

### 典型问题处理

**工程实践：百万级数据量的二叉搜索树性能**

百万数据量的BST在平衡状态下（高度~20）性能很好。但如果退化为链表（高度=1000000），一次查找就是100万次比较。因此必须使用平衡树。

---

## 8.5 典型问题：二叉树镜像、路径和

### 代码实现

```java
/**
 * 二叉树经典问题
 */
public class BinaryTreeProblems {
    
    // ========== 1. 二叉树的镜像（翻转二叉树） ==========
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode temp = root.left;
        root.left = invertTree(root.right);
        root.right = invertTree(temp);
        return root;
    }
    // 典型应用：Homebrew作者Max Howell面试Google时被问到此题
    // 因为答不出来被拒，引发社区热议
    
    // ========== 2. 判断二叉树是否对称 ==========
    public boolean isSymmetric(TreeNode root) {
        if (root == null) return true;
        return isMirror(root.left, root.right);
    }
    
    private boolean isMirror(TreeNode left, TreeNode right) {
        if (left == null && right == null) return true;
        if (left == null || right == null) return false;
        return (left.val == right.val) 
            && isMirror(left.left, right.right)
            && isMirror(left.right, right.left);
    }
    
    // ========== 3. 路径和（根到叶子节点之和=target） ==========
    public boolean hasPathSum(TreeNode root, int sum) {
        if (root == null) return false;
        if (root.left == null && root.right == null) {
            return sum == root.val;
        }
        return hasPathSum(root.left, sum - root.val)
            || hasPathSum(root.right, sum - root.val);
    }
    
    // ========== 4. 最近公共祖先（LCA） ==========
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;  // p和q分别在左右子树
        return left != null ? left : right;
    }
    
    // ========== 5. 二叉树的序列化与反序列化 ==========
    // 序列化
    public String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        serializeHelper(root, sb);
        return sb.toString();
    }
    
    private void serializeHelper(TreeNode node, StringBuilder sb) {
        if (node == null) {
            sb.append("#,");
            return;
        }
        sb.append(node.val).append(",");
        serializeHelper(node.left, sb);
        serializeHelper(node.right, sb);
    }
    
    // 反序列化
    public TreeNode deserialize(String data) {
        Queue<String> queue = new LinkedList<>(Arrays.asList(data.split(",")));
        return deserializeHelper(queue);
    }
    
    private TreeNode deserializeHelper(Queue<String> queue) {
        String val = queue.poll();
        if ("#".equals(val)) return null;
        TreeNode node = new TreeNode(Integer.parseInt(val));
        node.left = deserializeHelper(queue);
        node.right = deserializeHelper(queue);
        return node;
    }
}
```

---

> **本章总结**：树是处理层次化数据的核心结构。二叉树作为最基础的树形结构，它的四种遍历方式（前序、中序、后序、层序）是解决树问题的基本工具。二叉搜索树通过有序性实现了高效的查找，但需要注意退化问题。树的镜像、路径和、LCA等经典问题，是面试中考察树操作能力的高频题。