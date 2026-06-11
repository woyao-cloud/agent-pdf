# 第15章 面试高频算法题

> **核心问题**：面试中哪些算法题出现频率最高？如何系统性地准备这些题目，在有限时间内写出正确、高效的代码？

算法面试是技术面试的核心环节。本章精选各大科技公司面试中出现频率最高的算法题，按主题分类，每道题都包含问题描述、解题思路、复杂度分析、代码实现和 follow-up 问题。

---

## 15.1 链表算法题

链表（Linked List）是面试中最基础也最常考的数据结构之一。指针操作、边界条件处理、空间复杂度优化是考察重点。

### 15.1.1 反转链表（Reverse Linked List）

**问题描述**：给定单链表的头节点 `head`，反转链表并返回反转后的头节点。

**解题思路**：
- 迭代法：使用三个指针 `prev`、`curr`、`next`，逐个反转节点的指向
- 递归法：先反转后续链表，再将当前节点接到末尾

```python
def reverse_list(head: ListNode) -> ListNode:
    prev = None
    curr = head
    while curr:
        next_temp = curr.next
        curr.next = prev
        prev = curr
        curr = next_temp
    return prev
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(1)

**Follow-up**：反转链表的前 N 个节点、反转区间 [m, n] 内的节点、K 个一组反转链表。

---

### 15.1.2 检测链表环（Linked List Cycle）

**问题描述**：给定一个链表，判断链表中是否有环。如果链表中存在环，返回环的起始节点。

**解题思路**：
- Floyd 判圈算法（快慢指针）：快指针每次走两步，慢指针每次走一步
- 若相遇则有环；相遇后，将慢指针重置到头节点，两指针同步移动，再次相遇点即为环入口

```python
def detect_cycle(head: ListNode) -> Optional[ListNode]:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            slow = head
            while slow != fast:
                slow = slow.next
                fast = fast.next
            return slow
    return None
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(1)

**Follow-up**：找到环的长度、判断两个链表是否相交。

---

### 15.1.3 合并两个有序链表（Merge Two Sorted Lists）

**问题描述**：将两个升序链表合并为一个新的升序链表。

**解题思路**：
- 迭代法：使用虚拟头节点（dummy node）简化边界处理，双指针比较
- 递归法：每次比较两个头节点，取较小的节点，递归处理剩余部分

```python
def merge_two_lists(l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
    dummy = ListNode(0)
    curr = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            curr.next = l1
            l1 = l1.next
        else:
            curr.next = l2
            l2 = l2.next
        curr = curr.next
    curr.next = l1 or l2
    return dummy.next
```

**复杂度**：时间复杂度 O(n + m)，空间复杂度 O(1)

**Follow-up**：合并 K 个有序链表（使用优先队列）、合并后去重。

---

### 15.1.4 寻找链表中间节点（Middle of the Linked List）

**问题描述**：给定一个链表的头节点，返回链表的中间节点。如果链表长度为偶数，返回第二个中间节点。

**解题思路**：快慢指针法，快指针每次走两步，慢指针每次走一步。快指针到达末尾时，慢指针恰好在中间。

```python
def middle_node(head: ListNode) -> ListNode:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(1)

**Follow-up**：返回前一个中间节点（用于删除中间节点）、判断链表是否为回文（结合反转）。

---

### 15.1.5 LRU 缓存（LRU Cache）

**问题描述**：设计一个 LRU（最近最少使用）缓存，支持 `get(key)` 和 `put(key, value)` 操作，所有操作的时间复杂度均为 O(1)。

**解题思路**：
- 哈希表 + 双向链表：哈希表提供 O(1) 查找，双向链表维护访问顺序
- 每次访问时将节点移到链表头部，淘汰时移除链表尾部节点

```python
class DLinkedNode:
    def __init__(self, key=0, value=0):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}
        self.head = DLinkedNode()
        self.tail = DLinkedNode()
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove_node(self, node: DLinkedNode):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_to_head(self, node: DLinkedNode):
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        node = self.cache[key]
        self._remove_node(node)
        self._add_to_head(node)
        return node.value

    def put(self, key: int, value: int):
        if key in self.cache:
            node = self.cache[key]
            node.value = value
            self._remove_node(node)
            self._add_to_head(node)
        else:
            if len(self.cache) >= self.capacity:
                removed = self.tail.prev
                self._remove_node(removed)
                del self.cache[removed.key]
            new_node = DLinkedNode(key, value)
            self.cache[key] = new_node
            self._add_to_head(new_node)
```

**复杂度**：get 和 put 均为 O(1)；空间复杂度 O(capacity)

**Follow-up**：实现 LFU 缓存（最不经常使用）、支持过期时间的缓存、线程安全的 LRU 缓存。

---

## 15.2 树算法题

二叉树相关题目考察递归思维、遍历技巧和树的特性理解。

### 15.2.1 二叉树遍历（Binary Tree Traversal）

**问题描述**：实现二叉树的前序（Pre-order）、中序（In-order）、后序（Post-order）和层序（Level-order）遍历。

**解题思路**：
- 递归法：代码简洁，基于 DFS
- 迭代法：使用栈模拟递归（前中后序），使用队列实现层序
- Morris 遍历：O(1) 空间复杂度的中序遍历

```python
def inorder_traversal(root: TreeNode) -> List[int]:
    result, stack = [], []
    curr = root
    while curr or stack:
        while curr:
            stack.append(curr)
            curr = curr.left
        curr = stack.pop()
        result.append(curr.val)
        curr = curr.right
    return result

def level_order(root: TreeNode) -> List[List[int]]:
    if not root:
        return []
    result, queue = [], [root]
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.pop(0)
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)
    return result
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(n)（递归栈或队列）

**Follow-up**：之字形层序遍历、垂直遍历、边界遍历。

---

### 15.2.2 二叉树最大深度（Maximum Depth of Binary Tree）

**问题描述**：给定二叉树根节点，返回树的最大深度（根到最远叶子节点的距离）。

**解题思路**：
- 递归（DFS）：`maxDepth(root) = 1 + max(maxDepth(root.left), maxDepth(root.right))`
- 迭代（BFS）：层序遍历，统计层数

```python
def max_depth(root: TreeNode) -> int:
    if not root:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(height)

**Follow-up**：平衡二叉树判断、二叉树最小深度、N 叉树的最大深度。

---

### 15.2.3 验证二叉搜索树（Validate BST）

**问题描述**：给定二叉树根节点，判断它是否是有效的二叉搜索树（BST）。

**解题思路**：
- 中序遍历法：BST 的中序遍历结果是严格递增序列
- 区间法：递归传递允许的 (min, max) 范围，检查每个节点是否在范围内

```python
def is_valid_bst(root: TreeNode) -> bool:
    def validate(node: TreeNode, low: float, high: float) -> bool:
        if not node:
            return True
        if node.val <= low or node.val >= high:
            return False
        return validate(node.left, low, node.val) and validate(node.right, node.val, high)
    return validate(root, float('-inf'), float('inf'))
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(height)

**Follow-up**：BST 中查找第 K 小的元素、BST 的最近公共祖先、将有序数组转换为 BST。

---

### 15.2.4 最近公共祖先（Lowest Common Ancestor, LCA）

**问题描述**：给定二叉树和两个节点 p、q，找到它们的最近公共祖先。

**解题思路**：
- 递归法：在左右子树中查找 p 和 q。左子树找到 p（或 q），右子树找到另一个，则当前节点为 LCA
- 路径法：分别记录根到 p、根到 q 的路径，找到路径中最后一个相同节点

```python
def lowest_common_ancestor(root: TreeNode, p: TreeNode, q: TreeNode) -> TreeNode:
    if not root or root == p or root == q:
        return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right:
        return root
    return left or right
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(height)

**Follow-up**：BST 的 LCA（利用大小关系优化）、N 叉树的 LCA、多个节点的 LCA。

---

### 15.2.5 序列化与反序列化二叉树（Serialize and Deserialize Binary Tree）

**问题描述**：设计一个算法将二叉树序列化为字符串，并能从字符串反序列化为原始二叉树。

**解题思路**：
- 前序遍历法：使用前序遍历，空节点用特殊标记（如 `null`）表示
- 层序遍历法：使用 BFS 序列化，同样标记空节点

```python
def serialize(root: TreeNode) -> str:
    def dfs(node: TreeNode):
        if not node:
            vals.append('null')
            return
        vals.append(str(node.val))
        dfs(node.left)
        dfs(node.right)
    vals = []
    dfs(root)
    return ','.join(vals)

def deserialize(data: str) -> TreeNode:
    def dfs() -> TreeNode:
        val = next(vals)
        if val == 'null':
            return None
        node = TreeNode(int(val))
        node.left = dfs()
        node.right = dfs()
        return node
    vals = iter(data.split(','))
    return dfs()
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(n)

**Follow-up**：N 叉树的序列化、使用层序遍历（BFS）的序列化方案、紧凑编码方案。

---

## 15.3 动态规划高频题

动态规划（Dynamic Programming）是面试中区分度的关键。掌握状态定义和状态转移方程是核心。

### 15.3.1 爬楼梯（Climbing Stairs）

**问题描述**：爬楼梯需要 n 阶才能到达楼顶。每次可以爬 1 或 2 个台阶，有多少种不同的方法爬到楼顶？

**解题思路**：
- 状态定义：`dp[i]` 表示爬到第 i 阶的方法数
- 转移方程：`dp[i] = dp[i-1] + dp[i-2]`（斐波那契数列）
- 空间优化：只需两个变量滚动计算

```python
def climb_stairs(n: int) -> int:
    if n <= 2:
        return n
    a, b = 1, 2
    for _ in range(3, n + 1):
        a, b = b, a + b
    return b
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(1)

**Follow-up**：每次可以爬 1/2/3 阶、最小花费爬楼梯、带限制的爬楼梯。

---

### 15.3.2 打家劫舍（House Robber）

**问题描述**：不能偷相邻的两家，给定每家的金额，计算能偷到的最大金额。

**解题思路**：
- 状态定义：`dp[i]` 表示偷到第 i 家时的最大金额
- 转移方程：`dp[i] = max(dp[i-1], dp[i-2] + nums[i])`
- 空间优化：两个变量即可

```python
def rob(nums: List[int]) -> int:
    prev, curr = 0, 0
    for num in nums:
        prev, curr = curr, max(curr, prev + num)
    return curr
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(1)

**Follow-up**：环形街区、二叉树版的打家劫舍（House Robber III）。

---

### 15.3.3 最长回文子串（Longest Palindromic Substring）

**问题描述**：给定字符串 s，找到 s 中最长的回文子串。

**解题思路**：
- 中心扩展法：以每个字符（和每两个字符之间）为中心向两边扩展
- DP 法：`dp[i][j]` 表示子串 s[i:j+1] 是否为回文

```python
def longest_palindrome(s: str) -> str:
    def expand(left: int, right: int) -> str:
        while left >= 0 and right < len(s) and s[left] == s[right]:
            left -= 1
            right += 1
        return s[left + 1:right]

    result = ''
    for i in range(len(s)):
        p1 = expand(i, i)
        p2 = expand(i, i + 1)
        result = max(result, p1, p2, key=len)
    return result
```

**复杂度**：时间复杂度 O(n^2)，空间复杂度 O(1)

**Follow-up**：回文子串计数、最长回文子序列、Manacher 算法（O(n)）。

---

### 15.3.4 编辑距离（Edit Distance）

**问题描述**：计算将 word1 转换成 word2 所需的最少操作数。操作包括：插入、删除、替换一个字符。

```python
def min_distance(word1: str, word2: str) -> int:
    m, n = len(word1), len(word2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]
```

**复杂度**：时间复杂度 O(m*n)，空间复杂度 O(m*n)（可优化为 O(min(m,n))）

**Follow-up**：输出编辑过程（回溯路径）、只允许插入和删除、一次编辑判断。

---

### 15.3.5 零钱兑换（Coin Change）

**问题描述**：给定不同面额的硬币 coins 和一个总金额 amount，计算凑成总金额所需的最少硬币数。

```python
def coin_change(coins: List[int], amount: int) -> int:
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i:
                dp[i] = min(dp[i], dp[i - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1
```

**复杂度**：时间复杂度 O(amount * len(coins))，空间复杂度 O(amount)

**Follow-up**：零钱兑换 II（求组合数）、每种硬币有使用次数限制、找零方案打印。

---

## 15.4 数组与字符串高频题

数组和字符串是面试中出现频率最高的数据类型，哈希表、双指针、滑动窗口是常用技巧。

### 15.4.1 两数之和（Two Sum）

**问题描述**：给定整数数组 nums 和目标值 target，找出和为目标值的两个整数，返回它们的下标。

```python
def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(n)

**Follow-up**：三数之和、四数之和、和为 target 的子数组、两数之和 II（有序数组）。

---

### 15.4.2 三数之和（Three Sum）

**问题描述**：给定整数数组 nums，找出所有和为 0 且不重复的三元组。

```python
def three_sum(nums: List[int]) -> List[List[int]]:
    nums.sort()
    result = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        left, right = i + 1, len(nums) - 1
        while left < right:
            s = nums[i] + nums[left] + nums[right]
            if s < 0:
                left += 1
            elif s > 0:
                right -= 1
            else:
                result.append([nums[i], nums[left], nums[right]])
                while left < right and nums[left] == nums[left + 1]:
                    left += 1
                while left < right and nums[right] == nums[right - 1]:
                    right -= 1
                left += 1
                right -= 1
    return result
```

**复杂度**：时间复杂度 O(n^2)，空间复杂度 O(1)（不计输出空间）

**Follow-up**：最接近的三数之和、四数之和、小于 target 的三元组个数。

---

### 15.4.3 字母异位词分组（Group Anagrams）

**问题描述**：将字母异位词（由相同字母重排列组成的词）分组。

```python
def group_anagrams(strs: List[str]) -> List[List[str]]:
    groups = {}
    for s in strs:
        key = ''.join(sorted(s))
        if key not in groups:
            groups[key] = []
        groups[key].append(s)
    return list(groups.values())
```

**复杂度**：时间复杂度 O(n * k log k)，空间复杂度 O(n * k)

**Follow-up**：用计数法优化 O(n * k)、判断两个字符串是否为异位词、找到所有异位词的起始下标。

---

### 15.4.4 无重复字符的最长子串（Longest Substring Without Repeating Characters）

**问题描述**：给定字符串 s，找出不含重复字符的最长子串的长度。

```python
def length_of_longest_substring(s: str) -> int:
    char_index = {}
    max_len = left = 0
    for right, ch in enumerate(s):
        if ch in char_index and char_index[ch] >= left:
            left = char_index[ch] + 1
        else:
            max_len = max(max_len, right - left + 1)
        char_index[ch] = right
    return max_len
```

**复杂度**：时间复杂度 O(n)，空间复杂度 O(min(m, n))

**Follow-up**：输出最长子串本身、最多包含 K 个不同字符的最长子串。

---

### 15.4.5 合并区间（Merge Intervals）

**问题描述**：给定一组区间，合并所有重叠的区间。

```python
def merge(intervals: List[List[int]]) -> List[List[int]]:
    intervals.sort(key=lambda x: x[0])
    merged = []
    for interval in intervals:
        if not merged or interval[0] > merged[-1][1]:
            merged.append(interval)
        else:
            merged[-1][1] = max(merged[-1][1], interval[1])
    return merged
```

**复杂度**：时间复杂度 O(n log n)，空间复杂度 O(n)

**Follow-up**：插入区间（Insert Interval）、区间列表的交集、区间覆盖的最小数量。

---

## 15.5 系统设计题中的算法

系统设计面试中有时会涉及具体算法的实现。这些算法通常用于解决分布式系统中的核心问题。

### 15.5.1 一致性哈希（Consistent Hashing）

**问题描述**：设计一致性哈希算法，使得节点增减时最小化 key 的重新分配。

```python
import hashlib

class ConsistentHash:
    def __init__(self, nodes: list[str], virtual_nodes: int = 3):
        self.virtual_nodes = virtual_nodes
        self.ring = {}
        for node in nodes:
            self.add_node(node)

    def _hash(self, key: str) -> int:
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

    def add_node(self, node: str):
        for i in range(self.virtual_nodes):
            h = self._hash(f'{node}:{i}')
            self.ring[h] = node

    def remove_node(self, node: str):
        for i in range(self.virtual_nodes):
            h = self._hash(f'{node}:{i}')
            del self.ring[h]

    def get_node(self, key: str) -> str:
        if not self.ring:
            return None
        h = self._hash(key)
        keys = sorted(self.ring.keys())
        for ring_key in keys:
            if h <= ring_key:
                return self.ring[ring_key]
        return self.ring[keys[0]]
```

**复杂度**：查找 O(log n)，空间 O(n * v)

**Follow-up**：带权重的一致性哈希、跳跃一致性哈希（Google Jumphash）。

---

### 15.5.2 限流器（Rate Limiter）

**问题描述**：设计一个限流器，在指定时间窗口内限制请求数量。

```python
import time

class TokenBucket:
    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_refill = time.time()

    def _refill(self):
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now

    def allow_request(self) -> bool:
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
```

**复杂度**：每个请求 O(1)

**Follow-up**：滑动窗口日志法、分布式限流器（Redis + Lua）、多维度限流。

---

### 15.5.3 分布式唯一 ID 生成器（Distributed Unique ID）

**问题描述**：设计一个高可用、高性能的唯一 ID 生成器，要求 ID 全局唯一、趋势递增。

```python
import time

class SnowflakeID:
    def __init__(self, worker_id: int, datacenter_id: int = 0):
        self.worker_id = worker_id
        self.datacenter_id = datacenter_id
        self.sequence = 0
        self.last_timestamp = -1
        self.epoch = 1288834974657

    def _current_timestamp(self) -> int:
        return int(time.time() * 1000)

    def _wait_next_ms(self, last: int) -> int:
        timestamp = self._current_timestamp()
        while timestamp <= last:
            timestamp = self._current_timestamp()
        return timestamp

    def next_id(self) -> int:
        timestamp = self._current_timestamp()
        if timestamp < self.last_timestamp:
            raise Exception('Clock moved backwards')
        if timestamp == self.last_timestamp:
            self.sequence = (self.sequence + 1) & 4095
            if self.sequence == 0:
                timestamp = self._wait_next_ms(self.last_timestamp)
        else:
            self.sequence = 0
        self.last_timestamp = timestamp
        return ((timestamp - self.epoch) << 22) | (self.datacenter_id << 17) | (self.worker_id << 12) | self.sequence
```

**复杂度**：每个 ID O(1)，单机可达百万级 QPS

**Follow-up**：时钟回拨的处理策略、Leaf 方案（美团）、UUID vs Snowflake 对比。

---

### 15.5.4 布隆过滤器（Bloom Filter）

**问题描述**：设计一个空间高效的 probabilistic 数据结构，判断元素是否在集合中。

```python
import math
import hashlib

class BloomFilter:
    def __init__(self, capacity: int, error_rate: float = 0.01):
        self.capacity = capacity
        self.error_rate = error_rate
        self.bit_size = self._optimal_bits(capacity, error_rate)
        self.hash_count = self._optimal_hashes(self.bit_size, capacity)
        self.bit_array = [0] * self.bit_size
        self.count = 0

    def _optimal_bits(self, n: int, p: float) -> int:
        return int(-n * math.log(p) / (math.log(2) ** 2)) + 1

    def _optimal_hashes(self, m: int, n: int) -> int:
        return int(m / n * math.log(2)) + 1

    def _hashes(self, item: str) -> list[int]:
        h = int(hashlib.md5(item.encode()).hexdigest(), 16)
        return [(h >> i) & (self.bit_size - 1) for i in range(self.hash_count)]

    def add(self, item: str):
        for pos in self._hashes(item):
            self.bit_array[pos] = 1
        self.count += 1

    def contains(self, item: str) -> bool:
        for pos in self._hashes(item):
            if not self.bit_array[pos]:
                return False
        return True
```

**复杂度**：添加/查询 O(k)，空间 O(m) 位

**Follow-up**：Counting Bloom Filter、布谷鸟过滤器（Cuckoo Filter）。

---

### 15.5.5 领导者选举（Leader Election）

**问题描述**：在分布式系统中，多个节点需要选举一个领导者（Leader）来协调任务。

```python
import random
import time

class RaftNode:
    FOLLOWER = 0
    CANDIDATE = 1
    LEADER = 2

    def __init__(self, node_id: int, peers: list[int]):
        self.node_id = node_id
        self.peers = peers
        self.state = RaftNode.FOLLOWER
        self.current_term = 0
        self.voted_for = None
        self.votes_received = 0
        self.election_timeout = random.uniform(150, 300)
        self.last_heartbeat = time.time()

    def start_election(self):
        self.state = RaftNode.CANDIDATE
        self.current_term += 1
        self.voted_for = self.node_id
        self.votes_received = 1
        for peer in self.peers:
            if peer != self.node_id:
                self._send_request_vote(peer)

    def _send_request_vote(self, peer: int):
        pass

    def handle_request_vote(self, term: int, candidate_id: int) -> bool:
        if term > self.current_term:
            self.current_term = term
            self.state = RaftNode.FOLLOWER
            self.voted_for = None
        if term == self.current_term and self.voted_for is None:
            self.voted_for = candidate_id
            return True
        return False

    def become_leader(self):
        self.state = RaftNode.LEADER
```

**复杂度**：消息复杂度 O(n)，选举时间 O(timeout)

**Follow-up**：Zab 协议（ZooKeeper）、Paxos 算法与 Raft 的对比。

---

## 本章小结

| 类别 | 核心技巧 | 面试关注点 |
|------|---------|-----------|
| 链表 | 指针操作、快慢指针、虚拟头节点 | 边界条件、空间复杂度 |
| 树 | 递归/迭代遍历、分治思想 | 递归思维、复杂度分析 |
| 动态规划 | 状态定义、转移方程推导 | 问题建模、优化技巧 |
| 数组/字符串 | 双指针、哈希表、滑动窗口 | 时间复杂度、代码简洁度 |
| 系统设计算法 | 哈希环、概率数据结构、分布式共识 | 工程思维、trade-off 分析 |

**准备建议**：
1. **理解而非记忆**：理解每种算法的核心思想，而不是死记代码
2. **从暴力到优化**：先给出暴力解，再逐步优化，展示思考过程
3. **沟通为王**：面试中大声说出你的思路，与面试官确认后再编码
4. **测试边界**：写完代码后主动检查空输入、单元素、大数等边界情况
5. **时间管理**：如果卡住超过 5 分钟，换一个思路或向面试官求助