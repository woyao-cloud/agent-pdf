# 第15章 面试高频算法题

> "算法面试不是竞赛——它考察的是你能否在有限时间内，用清晰的思路和正确的代码解决一个中等难度的问题。掌握高频题型，就能以不变应万变。"

---

## 15.1 链表算法题

链表是面试中最高频的数据结构之一，因为它可以在很小的代码量内考察指针操作、边界处理和递归思维。

### 15.1.1 反转链表（Reverse Linked List）

**问题描述：** 反转一个单链表。

**迭代解法：** 维护三个指针 `prev`、`curr`、`next`，每次将 `curr.next` 指向 `prev`。

```
reverseList_iterative(head):
    prev = null
    curr = head
    while curr ≠ null:
        next = curr.next   // 保存下一个节点
        curr.next = prev   // 反转指针
        prev = curr        // 前移
        curr = next
    return prev            // 新头
```

**递归解法：** 假设 `reverseList(head.next)` 已经将后续部分反转，只需将 `head.next.next` 指向 `head`。

```
reverseList_recursive(head):
    if head == null or head.next == null:
        return head
    newHead = reverseList_recursive(head.next)
    head.next.next = head
    head.next = null
    return newHead
```

**易错点：** 递归解法中一定要将 `head.next` 置为 `null`，否则会产生环。

### 15.1.2 检测链表环（Floyd's Tortoise and Hare）

**问题描述：** 判断链表中是否存在环，并找出环的入口。

**算法步骤：**
1. 快指针每次走两步，慢指针每次走一步
2. 若两指针相遇，则存在环
3. 将一个指针移回头部，两者轮同步移动，相遇点即为环入口

```
detectCycle(head):
    slow = fast = head
    while fast ≠ null and fast.next ≠ null:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:           // 相遇，存在环
            slow = head
            while slow ≠ fast:     // 找环入口
                slow = slow.next
                fast = fast.next
            return slow
    return null                    // 无环
```

**数学原理：** 设头到环入口距离为 $a$，环入口到相遇点距离为 $b$，环长度为 $c$。慢指针走了 $a + b$，快指针走了 $a + b + kc$。因为快指针速度是慢指针的2倍，所以 $2(a+b) = a+b+kc \Rightarrow a+b = kc \Rightarrow a = (k-1)c + (c-b)$，即从头到入口的距离等于从相遇点绕环若干圈后到入口的距离。

### 15.1.3 寻找链表中点

**问题描述：** 找到链表的中间节点（偶数长度时返回第二个中间节点）。

**解法：** 快慢指针，快指针到末尾时慢指针恰好在中点。

```
findMiddle(head):
    slow = fast = head
    while fast ≠ null and fast.next ≠ null:
        slow = slow.next
        fast = fast.next.next
    return slow
```

### 15.1.4 合并两个有序链表

**问题描述：** 将两个升序链表合并为一个升序链表。

**迭代解法（哨兵节点技巧）：**

```
mergeTwoLists(l1, l2):
    dummy = new ListNode(-1)
    curr = dummy
    while l1 ≠ null and l2 ≠ null:
        if l1.val ≤ l2.val:
            curr.next = l1
            l1 = l1.next
        else:
            curr.next = l2
            l2 = l2.next
        curr = curr.next
    curr.next = (l1 ≠ null ? l1 : l2)
    return dummy.next
```

**递归解法：**

```
mergeTwoLists_recursive(l1, l2):
    if l1 == null: return l2
    if l2 == null: return l1
    if l1.val ≤ l2.val:
        l1.next = mergeTwoLists_recursive(l1.next, l2)
        return l1
    else:
        l2.next = mergeTwoLists_recursive(l1, l2.next)
        return l2
```

### 15.1.5 LRU缓存

**问题描述：** 设计一个最近最少使用（LRU）缓存，支持 `get(key)` 和 `put(key, value)` 操作，所有操作在 $O(1)$ 时间内完成。

**数据结构选择：** `HashMap` + **双向链表**。HashMap 提供 $O(1)$ 的查找，双向链表维护访问顺序。

```
class LRUCache:
    capacity: int
    map: HashMap<key, Node>
    head, tail: Node  // 虚拟头尾节点

    get(key):
        if key not in map: return -1
        node = map[key]
        moveToHead(node)   // 最近访问，移到头部
        return node.value

    put(key, value):
        if key in map:
            node = map[key]
            node.value = value
            moveToHead(node)
        else:
            if size == capacity:
                removeTail()   // 移除最久未使用
            node = new Node(key, value)
            addToHead(node)
            map[key] = node

    moveToHead(node):
        removeNode(node)
        addToHead(node)
```

**核心技巧：** 使用虚拟头尾节点（dummy head/tail）避免空指针判断。

---

## 15.2 树算法题

二叉树是递归思维的天然载体，树相关的面试题通常考察递归、DFS 和 BFS 的掌握程度。

### 15.2.1 二叉树的最大深度

**问题描述：** 计算二叉树的最大深度（根到最远叶子的节点数）。

```
maxDepth(root):
    if root == null: return 0
    return 1 + max(maxDepth(root.left), maxDepth(root.right))
```

### 15.2.2 验证二叉搜索树（Validate BST）

**问题描述：** 判断一棵二叉树是否为有效的 BST。

**核心性质：** BST 的中序遍历是严格递增的。有两种解法：

**解法一（中序遍历）：** 递归遍历，维护前一个节点的值。

```
prev = null
isValidBST(root):
    if root == null: return true
    if not isValidBST(root.left): return false
    if prev ≠ null and root.val ≤ prev.val: return false
    prev = root
    return isValidBST(root.right)
```

**解法二（范围约束）：** 递归时传递允许的 `(min, max)` 范围。

```
isValidBST(root, min, max):
    if root == null: return true
    if root.val ≤ min or root.val ≥ max: return false
    return isValidBST(root.left, min, root.val)
       and isValidBST(root.right, root.val, max)
```

**易错点：** 不能只检查左右子节点与根的大小关系，必须维护全局范围约束（因为左子树的所有节点都必须小于根，不仅仅是左孩子）。

### 15.2.3 层序遍历（Level-Order Traversal）

**问题描述：** 按层从上到下遍历二叉树，返回每层节点值的列表。

```
levelOrder(root):
    if root == null: return []
    result = []
    queue = [root]
    while queue not empty:
        level = []
        for i in 0..queue.size-1:
            node = queue.poll()
            level.add(node.val)
            if node.left ≠ null: queue.add(node.left)
            if node.right ≠ null: queue.add(node.right)
        result.add(level)
    return result
```

### 15.2.4 最近公共祖先（LCA）

**问题描述：** 在二叉树中找到两个节点的最近公共祖先。

```
lowestCommonAncestor(root, p, q):
    if root == null or root == p or root == q:
        return root
    left = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    if left ≠ null and right ≠ null: return root  // p,q 在两侧
    return left ≠ null ? left : right
```

**核心思想：** 递归查找左右子树。若 `p` 和 `q` 分别在两侧，则当前节点即为 LCA。若在同一侧，则返回该侧的结果。

### 15.2.5 二叉树的序列化与反序列化

**问题描述：** 设计一个算法将二叉树序列化为字符串，并能反序列化回原树。

**前序遍历 + 标记空节点：**

```
serialize(root):
    if root == null: return "null,"
    return root.val + "," + serialize(root.left) + serialize(root.right)

deserialize(data):
    queue = data.split(",").toList()
    return buildTree(queue)

buildTree(queue):
    val = queue.poll()
    if val == "null": return null
    root = new TreeNode(Integer.parseInt(val))
    root.left = buildTree(queue)
    root.right = buildTree(queue)
    return root
```

---

## 15.3 动态规划高频题

### 15.3.1 打家劫舍（House Robber）

**问题描述：** 在不能偷相邻房屋的条件下，最大化偷窃总金额。

**状态定义：** `dp[i]` 表示到第 `i` 间房屋时能偷到的最大金额。

**状态转移：** `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`——要么不偷当前屋（= 前 i-1 间最优），要么偷当前屋（= 前 i-2 间最优 + 当前金额）。

**空间优化：** 只需维护两个变量 `prev2` 和 `prev1`。

```
houseRobber(nums):
    prev2 = 0      // dp[i-2]
    prev1 = 0      // dp[i-1]
    for num in nums:
        curr = max(prev1, prev2 + num)
        prev2 = prev1
        prev1 = curr
    return prev1
```

### 15.3.2 零钱兑换（Coin Change）

**问题描述：** 给定面值数组 `coins` 和总金额 `amount`，求组成该金额的最少硬币数。

**状态定义：** `dp[i]` 表示组成金额 `i` 所需的最少硬币数。

**状态转移：** `dp[i] = min(dp[i - coin] + 1)` 对所有 `coin ∈ coins`。

```
coinChange(coins, amount):
    dp = new int[amount + 1]
    Arrays.fill(dp, amount + 1)  // 初始化为不可能的大值
    dp[0] = 0
    for i = 1 to amount:
        for coin in coins:
            if i ≥ coin:
                dp[i] = min(dp[i], dp[i - coin] + 1)
    return dp[amount] > amount ? -1 : dp[amount]
```

### 15.3.3 最长回文子串

**问题描述：** 找出字符串中最长的回文子串。

**中心扩展法（$O(n^2)$）：** 每个字符和相邻字符对作为中心向外扩展。

```
longestPalindrome(s):
    start = 0; maxLen = 0
    for i = 0 to s.length-1:
        len1 = expandAroundCenter(s, i, i)      // 奇数长度
        len2 = expandAroundCenter(s, i, i+1)    // 偶数长度
        len = max(len1, len2)
        if len > maxLen:
            start = i - (len-1)/2
            maxLen = len
    return s.substring(start, start + maxLen)

expandAroundCenter(s, L, R):
    while L ≥ 0 and R < s.length and s[L] == s[R]:
        L--; R++
    return R - L - 1
```

### 15.3.4 不同路径（Unique Paths）

**问题描述：** 机器人从 `m×n` 网格左上角走到右下角，只能向右或向下走，求不同路径数。

**状态定义：** `dp[i][j]` 表示到达 `(i,j)` 的路径数。

**状态转移：** `dp[i][j] = dp[i-1][j] + dp[i][j-1]`。

**组合数学解法：** 总共需要走 $m+n-2$ 步，其中 $m-1$ 步向下，$n-1$ 步向右，答案为 $C(m+n-2, m-1)$。

```
uniquePaths(m, n):
    dp = new int[n]
    Arrays.fill(dp, 1)   // 第一行全部为 1
    for i = 1 to m-1:
        for j = 1 to n-1:
            dp[j] += dp[j-1]
    return dp[n-1]
```

### 15.3.5 单词拆分（Word Break）

**问题描述：** 判断字符串能否被分割为字典中的单词。

**状态定义：** `dp[i]` 表示 `s[0..i)` 是否能被成功分割。

**状态转移：** `dp[i] = true` 如果存在 `j < i` 使得 `dp[j] = true` 且 `s[j..i)` 在字典中。

```
wordBreak(s, wordDict):
    set = new HashSet(wordDict)
    dp = new boolean[s.length + 1]
    dp[0] = true
    for i = 1 to s.length:
        for j = 0 to i-1:
            if dp[j] and set.contains(s.substring(j, i)):
                dp[i] = true
                break
    return dp[s.length]
```

---

## 15.4 数组与字符串高频题

### 15.4.1 两数之和（Two Sum）及变体

**问题描述：** 在数组中找到两个数，其和等于目标值，返回索引。

**HashMap 解法：**

```
twoSum(nums, target):
    map = new HashMap()
    for i = 0 to nums.length-1:
        complement = target - nums[i]
        if map.containsKey(complement):
            return [map.get(complement), i]
        map.put(nums[i], i)
    return [-1, -1]
```

**变体：**
- **Two Sum II（有序数组）：** 双指针从两端向中间移动
- **Two Sum III（设计类）：** 支持 `add` 和 `find` 操作
- **Two Sum IV（BST）：** BST 上的两数之和，可用中序遍历 + 双指针

### 15.4.2 三数之和（Three Sum）

**问题描述：** 找出数组中所有和为 0 的三元组。

**排序 + 双指针：** 固定一个数，剩余部分用双指针。

```
threeSum(nums):
    Arrays.sort(nums)
    result = []
    for i = 0 to nums.length-3:
        if i > 0 and nums[i] == nums[i-1]: continue  // 去重
        L = i + 1; R = nums.length - 1
        while L < R:
            sum = nums[i] + nums[L] + nums[R]
            if sum == 0:
                result.add([nums[i], nums[L], nums[R]])
                while L < R and nums[L] == nums[L+1]: L++  // 去重
                while L < R and nums[R] == nums[R-1]: R--  // 去重
                L++; R--
            else if sum < 0: L++
            else: R--
    return result
```

**复杂度：** $O(n^2)$ 时间，$O(1)$ 额外空间（不计输出）。

### 15.4.3 无重复字符的最长子串

**问题描述：** 找到字符串中不含重复字符的最长子串的长度。

**滑动窗口：** 维护窗口 `[left, right]`，用 HashMap 记录字符最后出现的位置。

```
lengthOfLongestSubstring(s):
    map = new HashMap()   // 字符 → 索引
    maxLen = 0; left = 0
    for right = 0 to s.length-1:
        ch = s.charAt(right)
        if map.containsKey(ch):
            left = max(left, map.get(ch) + 1)  // left 不能后退
        map.put(ch, right)
        maxLen = max(maxLen, right - left + 1)
    return maxLen
```

### 15.4.4 盛最多水的容器（Container With Most Water）

**问题描述：** 给定数组 `height`，选择两条垂线与 x 轴组成容器，求最大容量。

**双指针：** 从两端向中间移动，每次移动较矮的一端。

```
maxArea(height):
    L = 0; R = height.length - 1; maxArea = 0
    while L < R:
        area = min(height[L], height[R]) * (R - L)
        maxArea = max(maxArea, area)
        if height[L] < height[R]:
            L++
        else:
            R--
    return maxArea
```

**核心思路：** 面积由较短的边决定。移动较短的边才有可能增大面积。

### 15.4.5 有效的括号（Valid Parentheses）

**问题描述：** 判断括号字符串是否合法匹配。

**栈解法：**

```
isValid(s):
    stack = new Stack()
    for ch in s.toCharArray():
        if ch == '(': stack.push(')')
        else if ch == '{': stack.push('}')
        else if ch == '[': stack.push(']')
        else if stack.isEmpty() or stack.pop() ≠ ch:
            return false
    return stack.isEmpty()
```

**技巧：** 遇到左括号时将对应的右括号入栈，遇到右括号时检查是否匹配。

---

## 15.5 系统设计题中的算法

系统设计面试不仅考察架构能力，还经常内嵌对关键算法的理解。

### 15.5.1 限流器（Rate Limiter）

**令牌桶（Token Bucket）：**

```
class TokenBucket:
    capacity: int          // 桶容量
    refillRate: double     // 每秒填充的令牌数
    tokens: double         // 当前令牌数
    lastRefillTime: long   // 上次填充时间

    allowRequest():
        refill()
        if tokens ≥ 1:
            tokens -= 1
            return true
        return false

    refill():
        now = currentTimeMillis()
        elapsed = (now - lastRefillTime) / 1000.0
        tokens = min(capacity, tokens + elapsed * refillRate)
        lastRefillTime = now
```

**滑动窗口日志（Sliding Window Log）：**

```
class SlidingWindowLog:
    windowSize: long       // 窗口大小（ms）
    maxRequests: int       // 窗口内最大请求数
    logs: Queue<Long>      // 请求时间戳队列

    allowRequest():
        now = currentTimeMillis()
        // 移除窗口外的旧日志
        while logs not empty and now - logs.peek ≥ windowSize:
            logs.poll()
        if logs.size < maxRequests:
            logs.add(now)
            return true
        return false
```

### 15.5.2 一致性哈希（Consistent Hashing）

**问题：** 在分布式缓存中，当节点增减时，最小化需要迁移的键数量。

**核心思想：** 将哈希空间组织成环，节点和数据都映射到环上，数据由环上的下一个节点处理。

```
class ConsistentHash:
    ring: TreeMap<Integer, String>  // 哈希值 → 节点
    virtualNodes: int               // 每个物理节点的虚拟节点数

    addNode(node):
        for i = 0 to virtualNodes-1:
            hash = hash(node + "#" + i)
            ring.put(hash, node)

    removeNode(node):
        for i = 0 to virtualNodes-1:
            hash = hash(node + "#" + i)
            ring.remove(hash)

    getNode(key):
        if ring.isEmpty(): return null
        hash = hash(key)
        entry = ring.ceilingEntry(hash)  // 环上顺时针第一个节点
        if entry == null:
            entry = ring.firstEntry()    // 绕回环起点
        return entry.getValue()
```

**虚拟节点的作用：** 解决真实节点分布不均匀的问题，同时让节点增减时影响范围更均匀。

### 15.5.3 布隆过滤器（Bloom Filter）

**问题：** 高效判断一个元素是否不在集合中（"一定不存在"或"可能存在"）。

**数据结构：** 位数组 + $k$ 个哈希函数。

```
class BloomFilter:
    bits: BitSet
    size: int       // 位数组大小
    hashCount: int  // 哈希函数数量

    add(key):
        for i = 0 to hashCount-1:
            hash = hash(key, i)
            bits.set(hash % size)

    mightContain(key) -> bool:
        for i = 0 to hashCount-1:
            hash = hash(key, i)
            if not bits.get(hash % size):
                return false
        return true  // 可能有假阳性
```

**参数设计：** 期望误判率 $p$，预期元素数 $n$：
- 位数组大小 $m = -\frac{n \ln p}{(\ln 2)^2}$
- 哈希函数数 $k = \frac{m}{n} \ln 2$

### 15.5.4 近似去重（SimHash）

**问题：** 在海量文档中快速检测近似重复（抄袭检测、网页去重）。

**SimHash 算法：**

1. 将文档分词并计算每个词的权重
2. 每个词计算哈希值（64位），统计每一位：该位为1则加权重，为0则减权重
3. 最终每个位：正数→1，负数→0，得到文档的指纹
4. 两文档的相似度用海明距离度量（通常阈值为 3）

```
simhash(document):
    v = new int[64]
    for each (word, weight) in document:
        hash = hash64(word)
        for i = 0 to 63:
            if (hash >> i) & 1 == 1:
                v[i] += weight
            else:
                v[i] -= weight
    fingerprint = 0
    for i = 0 to 63:
        if v[i] > 0:
            fingerprint |= (1 << i)
    return fingerprint
```

**优点：** 将文档相似度比较转化为指纹的海明距离计算，可以用抽屉原理将查询加速到 $O(1)$。

---

## 本章总结

| 题型 | 核心技巧 | 时间复杂度 |
|------|---------|-----------|
| 链表操作 | 指针修改、哨兵节点、快慢指针 | $O(n)$ |
| 二叉树 | 递归、DFS/BFS、中序性质 | $O(n)$ |
| 动态规划 | 状态定义、状态转移、空间优化 | 因题而异 |
| 数组/字符串 | 哈希表、双指针、滑动窗口 | $O(n)$ ~ $O(n^2)$ |
| 系统设计算法 | 环状哈希、概率数据结构 | $O(1)$ ~ $O(n)$ |