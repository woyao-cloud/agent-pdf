# 第16章 典型问题与解题模板

> **本章内容**：双指针技巧 → 滑动窗口 → 区间问题 → 位运算技巧 → 常用解题模板

---

## 16.1 双指针技巧

### 解决的问题

双指针（Two Pointers）适用于**线性数据结构上的遍历与搜索**，核心思想是使用两个指针以不同的方向或速度遍历数组/字符串，将多层循环降为一层。

### 模式识别

| 模式 | 指针方向 | 典型特征 | 例题 |
|------|---------|---------|------|
| **相向双指针** | 左→右，右←左 | 排序数组、求两数之和、回文判断 | Two Sum II, Three Sum, Trapping Rain Water |
| **同向双指针** | 左→右，右→左 | 原地去重、链表快慢指针 | Remove Duplicates, Linked List Cycle |
| **快慢指针** | 一快一慢 | 检测环、找中点、找第K个节点 | 环形链表、链表中点 |

### 模板代码

```python
# === 相向双指针模板 ===
def opposite_two_pointers(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        if condition(arr[left], arr[right]):
            left += 1
        else:
            right -= 1
    return result

# === 同向双指针模板 ===
def same_direction_two_pointers(arr):
    slow = 0
    for fast in range(len(arr)):
        if condition(arr[fast]):
            arr[slow] = arr[fast]
            slow += 1
    return slow
```

### 例题分析：三数之和（Three Sum）

**问题**：在数组中找出所有和为 0 的三元组。

**思路**：排序 → 固定一个数 → 相向双指针找另外两个数。

```python
def three_sum(nums):
    nums.sort()
    n, res = len(nums), []
    for i in range(n - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        left, right = i + 1, n - 1
        target = -nums[i]
        while left < right:
            s = nums[left] + nums[right]
            if s == target:
                res.append([nums[i], nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
            elif s < target:
                left += 1
            else:
                right -= 1
    return res
```

**复杂度**：时间 O(n²)，空间 O(1)（不计输出）

---

## 16.2 滑动窗口

### 解决的问题

滑动窗口（Sliding Window）处理**连续子数组/子串**的最优解问题。核心是维护一个窗口，通过扩展右边界和收缩左边界来找到满足条件的窗口。

### 模式识别

| 类型 | 窗口大小 | 典型特征 | 例题 |
|------|---------|---------|------|
| **固定窗口** | 固定 k | 求窗口内最大/最小/平均值 | Maximum Sum Subarray of Size K |
| **可变窗口（求最小）** | 变长 | 包含/覆盖目标的最短子串 | Minimum Window Substring |
| **可变窗口（求最大）** | 变长 | 满足条件的最长子串 | Longest Substring Without Repeating |

### 模板代码

```python
# === 固定窗口模板 ===
def fixed_window(arr, k):
    window_sum = sum(arr[:k])
    max_sum = window_sum
    for i in range(k, len(arr)):
        window_sum += arr[i] - arr[i - k]
        max_sum = max(max_sum, window_sum)
    return max_sum

# === 可变窗口（求最短）模板 ===
def min_window(s, t):
    need = {}
    for c in t:
        need[c] = need.get(c, 0) + 1
    left = 0
    valid = 0
    min_len, start = float('inf'), 0
    for right in range(len(s)):
        c = s[right]
        if c in need:
            need[c] -= 1
            if need[c] == 0:
                valid += 1
        while valid == len(need):
            if right - left + 1 < min_len:
                min_len = right - left + 1
                start = left
            d = s[left]
            left += 1
            if d in need:
                if need[d] == 0:
                    valid -= 1
                need[d] += 1
    return s[start:start + min_len] if min_len != float('inf') else ""

# === 可变窗口（求最长）模板 ===
def max_window(s):
    window = set()
    left = 0
    max_len = 0
    for right in range(len(s)):
        while s[right] in window:
            window.remove(s[left])
            left += 1
        window.add(s[right])
        max_len = max(max_len, right - left + 1)
    return max_len
```

### 例题分析：无重复字符的最长子串（Longest Substring Without Repeating）

**问题**：给定一个字符串，找出不含重复字符的最长子串长度。

**思路**：右指针逐步扩展，遇到重复时左指针收缩，用 set/hashmap 维护窗口内字符。

**复杂度**：时间 O(n)，空间 O(字符集大小)

---

## 16.3 区间问题

### 解决的问题

区间问题处理**一组区间（interval）的交叠、合并、划分**操作，核心是排序后扫描。

### 模式识别

| 类型 | 操作 | 典型特征 | 例题 |
|------|------|---------|------|
| **区间合并** | 合并重叠区间 | 按 start 排序，比较 end | Merge Intervals |
| **区间交集** | 求交集 | 双指针同时遍历两个区间列表 | Interval List Intersections |
| **区间划分** | 将区间划分为不重叠组 | 贪心，按 end 排序 | Non-overlapping Intervals, Partition Labels |

### 模板代码

```python
# === 区间合并模板 ===
def merge_intervals(intervals):
    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        last_end = merged[-1][1]
        if start <= last_end:
            merged[-1][1] = max(last_end, end)
        else:
            merged.append([start, end])
    return merged

# === 区间交集模板 ===
def interval_intersection(A, B):
    i = j = 0
    res = []
    while i < len(A) and j < len(B):
        start = max(A[i][0], B[j][0])
        end = min(A[i][1], B[j][1])
        if start <= end:
            res.append([start, end])
        if A[i][1] < B[j][1]:
            i += 1
        else:
            j += 1
    return res
```

### 例题分析：合并区间（Merge Intervals）

**问题**：给出一组区间，合并所有重叠区间。

**思路**：按 start 排序 → 遍历，比较当前 start 与上一个 end。

**复杂度**：时间 O(n log n)，空间 O(n)

---

## 16.4 位运算技巧

### 解决的问题

位运算（Bit Manipulation）利用二进制位级操作高效解决**计数、去重、状态枚举**等问题。

### 常用技巧

| 操作 | 表达式 | 说明 |
|------|--------|------|
| 取最低位 1 | `x & -x` | Lowbit，常用于树状数组 |
| 去掉最低位 1 | `x & (x - 1)` | 消除最低位的 1 |
| 判断第 k 位 | `(x >> k) & 1` | 取出第 k 位的值 |
| 设置第 k 位为 1 | `x `|` (1 << k)` | 将第 k 位置 1 |
| 设置第 k 位为 0 | `x & ~(1 << k)` | 将第 k 位置 0 |
| 交换两数 | `a ^= b; b ^= a; a ^= b` | 不借助临时变量 |
| 判断 2 的幂 | `x > 0 and x & (x - 1) == 0` | 二进制只有一位为 1 |

### 模板代码

```python
# === 统计二进制中 1 的个数 ===
def count_bits(n):
    count = 0
    while n:
        count += 1
        n &= n - 1  # 去掉最低位 1
    return count

# === 子集枚举模板 ===
def subsets(nums):
    n = len(nums)
    res = []
    for mask in range(1 << n):
        subset = []
        for i in range(n):
            if mask & (1 << i):
                subset.append(nums[i])
        res.append(subset)
    return res
```

### 例题分析：只出现一次的数字（Single Number）

**问题**：数组中除一个元素出现一次外，其余都出现两次，找出该元素。

**思路**：利用 `a ^ a = 0` 和 `a ^ 0 = a`，将全部元素异或，剩下就是答案。

```python
def single_number(nums):
    res = 0
    for num in nums:
        res ^= num
    return res
```

**复杂度**：时间 O(n)，空间 O(1)

---

## 16.5 常用解题模板

### 16.5.1 二分查找模板（Binary Search）

**三种模板**：

```python
# === 模板 1：基本二分（找确切值） ===
def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

# === 模板 2：找左边界（第一个 >= target） ===
def lower_bound(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = (left + right) // 2
        if nums[mid] >= target:
            right = mid
        else:
            left = mid + 1
    return left

# === 模板 3：找右边界（最后一个 <= target） ===
def upper_bound(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = (left + right) // 2
        if nums[mid] <= target:
            left = mid + 1
        else:
            right = mid
    return left - 1
```

**使用场景**：有序数组搜索、求平方根、旋转数组搜索。

### 16.5.2 BFS 模板（广度优先搜索）

```python
from collections import deque

def bfs(start, target):
    queue = deque([start])
    visited = {start}
    steps = 0
    while queue:
        for _ in range(len(queue)):
            node = queue.popleft()
            if node == target:
                return steps
            for neighbor in get_neighbors(node):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        steps += 1
    return -1
```

**使用场景**：最短路径、层序遍历、拓扑排序。

### 16.5.3 DFS 模板（深度优先搜索）

```python
# === 递归版 ===
def dfs_recursive(node, visited):
    if node is None:
        return
    visited.add(node)
    process(node)
    for neighbor in get_neighbors(node):
        if neighbor not in visited:
            dfs_recursive(neighbor, visited)

# === 迭代版（栈） ===
def dfs_iterative(start):
    stack = [start]
    visited = {start}
    while stack:
        node = stack.pop()
        process(node)
        for neighbor in get_neighbors(node):
            if neighbor not in visited:
                visited.add(neighbor)
                stack.append(neighbor)
```

**使用场景**：全排列、组合、连通分量、拓扑排序（后序）。

### 16.5.4 DP 模板（动态规划）

```python
# === 一维 DP 模板 ===
def dp_1d(nums):
    n = len(nums)
    dp = [0] * n
    dp[0] = nums[0]
    for i in range(1, n):
        dp[i] = max(dp[i - 1] + nums[i], nums[i])
    return max(dp)

# === 二维 DP 模板 ===
def dp_2d(text1, text2):
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i - 1] == text2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]
```

**DP 四步法**：
1. 定义状态（dp 的含义）
2. 找状态转移方程
3. 初始化
4. 确定遍历顺序

### 16.5.5 回溯模板（Backtracking）

```python
def backtrack(path, choices, result):
    if is_solution(path):
        result.append(path[:])  # 深拷贝
        return
    for choice in choices:
        if is_valid(choice, path):
            path.append(choice)
            backtrack(path, choices, result)
            path.pop()

# === 全排列示例 ===
def permute(nums):
    res = []
    def backtrack(path, used):
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if not used[i]:
                used[i] = True
                path.append(nums[i])
                backtrack(path, used)
                path.pop()
                used[i] = False
    backtrack([], [False] * len(nums))
    return res
```

**使用场景**：全排列、组合、子集、N 皇后、数独。

**复杂度**：通常 O(n! · n) 到 O(2ⁿ)，需要剪枝优化。

---

## 本章总结

| 技巧 | 核心思想 | 典型复杂度 | 关键点 |
|------|---------|-----------|--------|
| 双指针 | 两个指针减少循环层数 | O(n) / O(n²) | 单调性、排序预处理 |
| 滑动窗口 | 维护连续区间 | O(n) | 窗口扩展与收缩条件 |
| 区间问题 | 排序 + 扫描 | O(n log n) | 按 start/end 排序 |
| 位运算 | 二进制级操作 | O(n) / O(2ⁿ) | 常用恒等式 |
| 模板方法 | 模式复用 | 视问题而定 | 理解而非死记 |
