# 第19章 面试高频题型

## 19.1 链表相关面试题

### 经典链表问题

```java
/**
 * 链表高频面试题
 */
public class LinkedListProblems {
    
    // 1. 反转链表
    public ListNode reverseList(ListNode head) {
        ListNode prev = null, curr = head;
        while (curr != null) {
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        return prev;
    }
    
    // 2. 合并两个有序链表
    public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(0), curr = dummy;
        while (l1 != null && l2 != null) {
            if (l1.val <= l2.val) {
                curr.next = l1;
                l1 = l1.next;
            } else {
                curr.next = l2;
                l2 = l2.next;
            }
            curr = curr.next;
        }
        curr.next = l1 != null ? l1 : l2;
        return dummy.next;
    }
    
    // 3. 检测链表是否有环
    public boolean hasCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) return true;
        }
        return false;
    }
    
    // 4. 找出环形链表的入口
    public ListNode detectCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) {
                slow = head;
                while (slow != fast) {
                    slow = slow.next;
                    fast = fast.next;
                }
                return slow;
            }
        }
        return null;
    }
    
    // 5. 删除链表的倒数第N个节点
    public ListNode removeNthFromEnd(ListNode head, int n) {
        ListNode dummy = new ListNode(0);
        dummy.next = head;
        ListNode fast = dummy, slow = dummy;
        for (int i = 0; i <= n; i++) fast = fast.next;
        while (fast != null) {
            fast = fast.next;
            slow = slow.next;
        }
        slow.next = slow.next.next;
        return dummy.next;
    }
}
```

---

## 19.2 树相关面试题

### 经典树问题

```java
/**
 * 树相关高频面试题
 */
public class TreeProblems {
    
    // 1. 二叉树的最大深度
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
    
    // 2. 验证二叉搜索树
    public boolean isValidBST(TreeNode root) {
        return isValid(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }
    
    private boolean isValid(TreeNode node, long min, long max) {
        if (node == null) return true;
        if (node.val <= min || node.val >= max) return false;
        return isValid(node.left, min, node.val) 
            && isValid(node.right, node.val, max);
    }
    
    // 3. 二叉树的层序遍历
    public List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> result = new ArrayList<>();
        if (root == null) return result;
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            int size = queue.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < size; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            result.add(level);
        }
        return result;
    }
    
    // 4. 最近公共祖先
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;
        return left != null ? left : right;
    }
}
```

---

## 19.3 动态规划与数据结构结合

### 动态规划问题

- **背包问题**：二维数组DP
- **最长递增子序列**：树状数组优化到O(n log n)
- **区间DP**：HashMap缓存中间结果
- **树形DP**：树上的动态规划

---

## 19.4 系统设计题：设计数据结构

### 常见设计题

| 问题 | 核心数据结构 | 关键思路 |
|------|-------------|---------|
| LRU缓存 | HashMap + 双链表 | O(1)访问和淘汰 |
| LFU缓存 | HashMap + 双链表 + 频率Map | 最小频率淘汰 |
| 设计Trie | 前缀树 | 自动补全 |
| 设计一致性哈希 | TreeMap | 虚拟节点 |
| 设计限流器 | 滑动窗口 + 队列 | 时间窗口计数 |

---

> **本章总结**：链表和树是面试中最常考的数据结构。快慢指针、递归遍历、LCA等是核心考点。系统设计题考察的是对数据结构的综合运用能力。建议在理解原理的基础上，多刷LeetCode的经典题目。