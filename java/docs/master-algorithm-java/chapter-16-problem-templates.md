# 第16章 常用解题模板与技巧

> "面试中 80% 的算法题可以用不到 10 种解题模板解决。掌握这些模板，你就能在考场上快速识别题型、套用框架、写出干净正确的代码。"

---

## 16.1 双指针技巧

双指针是数组和链表问题中最基础也最强大的技巧之一。核心思路是使用两个指针以不同的策略扫描数据。

### 16.1.1 两端向中间的双指针（Two Sum II）

**适用场景：** 有序数组，需要找到满足某种条件的两个元素。

**典型题目：** 有序数组的两数之和。

```
twoSumSorted(numbers, target):
    L = 0; R = numbers.length - 1
    while L < R:
        sum = numbers[L] + numbers[R]
        if sum == target:
            return [L + 1, R + 1]  // 1-indexed
        else if sum < target:
            L++    // 需要更大的和
        else:
            R--    // 需要更小的和
    return [-1, -1]
```

**时间复杂度：** $O(n)$，空间复杂度：$O(1)$。

**扩展应用：** Container With Most Water（盛最多水的容器）、Trapping Rain Water（接雨水）。

### 16.1.2 快慢指针

**适用场景：** 链表或数组中的环检测、中点查找。

**典型应用：**
- 链表环检测（Floyd 算法）
- 寻找链表中点
- 寻找环形链表的入口
- 寻找数组中的重复数（将数组视为链表）

```
// 寻找链表环入口
detectCycle(head):
    slow = fast = head
    while fast ≠ null and fast.next ≠ null:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            slow = head
            while slow ≠ fast:
                slow = slow.next
                fast = fast.next
            return slow
    return null
```

### 16.1.3 同向双指针（分区/去重）

**适用场景：** 需要原地修改数组，将满足条件的元素移到前面。

**典型题目：** 删除排序数组中的重复项。

```
removeDuplicates(nums):
    if nums.length == 0: return 0
    i = 0  // 慢指针：已处理区域的末尾
    for j = 1 to nums.length-1:  // 快指针
        if nums[j] ≠ nums[i]:
            i++
            nums[i] = nums[j]
    return i + 1
```

**Quick Select（快速选择）：** 利用快速排序的 partition 操作找到第 k 大的元素。

```
quickSelect(nums, k):
    // 找到第 k 小的元素（0-indexed）
    function partition(L, R):
        pivot = nums[R]
        i = L
        for j = L to R-1:
            if nums[j] ≤ pivot:
                swap(nums[i], nums[j])
                i++
        swap(nums[i], nums[R])
        return i

    L = 0; R = nums.length - 1
    while L ≤ R:
        pivotIndex = partition(L, R)
        if pivotIndex == k:
            return nums[k]
        else if pivotIndex < k:
            L = pivotIndex + 1
        else:
            R = pivotIndex - 1
    return -1
```

**时间复杂度：** 平均 $O(n)$，最坏 $O(n^2)$。

---

## 16.2 滑动窗口

滑动窗口是处理**连续子数组/子字符串**问题的利器。核心是维护一个窗口，在遍历过程中动态调整窗口的左右边界。

### 16.2.1 固定窗口 vs 可变窗口

**固定窗口：** 窗口大小不变，每次移动一步。

```
// 固定大小为 k 的窗口最大值
fixedWindow(nums, k):
    // 滑动窗口，每次进入一个元素、离开一个元素
    for i = 0 to nums.length - k:
        window = nums[i..i+k-1]
        处理(window)
```

**可变窗口：** 窗口大小根据条件动态调整。

```
// 可变窗口通用框架
variableWindow(nums):
    left = 0
    for right = 0 to nums.length-1:
        将 nums[right] 加入窗口
        while 窗口不满足条件:
            将 nums[left] 移出窗口
            left++
        更新答案
```

### 16.2.2 无重复字符的最长子串

**问题：** 找最长的、不含重复字符的连续子串。

```
lengthOfLongestSubstring(s):
    map = new HashMap()  // 字符 → 索引
    maxLen = 0; left = 0
    for right = 0 to s.length-1:
        ch = s.charAt(right)
        if map.containsKey(ch):
            left = max(left, map.get(ch) + 1)
        map.put(ch, right)
        maxLen = max(maxLen, right - left + 1)
    return maxLen
```

**关键：** `left` 只增不减（避免窗口回退）。

### 16.2.3 最小覆盖子串

**问题：** 找包含目标字符串所有字符的最短子串。

```
minWindow(s, t):
    need = new HashMap()    // t 中字符的需求量
    window = new HashMap()  // 窗口中字符的拥有量
    for ch in t: need[ch]++

    left = 0; right = 0
    valid = 0               // 已满足的需求字符数
    start = 0; minLen = INF

    while right < s.length:
        c = s[right]; right++
        if need.containsKey(c):
            window[c]++
            if window[c] == need[c]: valid++

        while valid == need.size:  // 窗口已覆盖 t
            if right - left < minLen:
                start = left; minLen = right - left

            d = s[left]; left++
            if need.containsKey(d):
                if window[d] == need[d]: valid--
                window[d]--
    return minLen == INF ? "" : s.substring(start, start + minLen)
```

**模板总结：**

```
// 滑动窗口通用模板
left = 0
for right = 0 to n-1:
    加入 s[right] 到窗口
    while (窗口需要收缩):
        移除 s[left] 并 left++
    if (窗口满足条件):
        更新答案
```

---

## 16.3 区间问题

区间问题的核心是排序 + 扫描。先将区间按起点排序，然后线性扫描合并或处理。

### 16.3.1 合并区间（Merge Intervals）

**问题：** 合并所有重叠的区间。

```
mergeIntervals(intervals):
    if intervals.length == 0: return []
    Arrays.sort(intervals, (a, b) -> a[0] - b[0])
    merged = []
    for interval in intervals:
        if merged.isEmpty() or interval[0] > merged[-1][1]:
            merged.add(interval)             // 不重叠，直接加入
        else:
            merged[-1][1] = max(merged[-1][1], interval[1])  // 合并
    return merged
```

### 16.3.2 插入区间（Insert Interval）

**问题：** 在已排序的不重叠区间列表中插入新区间。

```
insertInterval(intervals, newInterval):
    result = []
    i = 0
    // 1. 所有在新区间之前的区间
    while i < intervals.length and intervals[i][1] < newInterval[0]:
        result.add(intervals[i]); i++
    // 2. 合并重叠部分
    while i < intervals.length and intervals[i][0] ≤ newInterval[1]:
        newInterval[0] = min(newInterval[0], intervals[i][0])
        newInterval[1] = max(newInterval[1], intervals[i][1])
        i++
    result.add(newInterval)
    // 3. 剩余区间
    while i < intervals.length:
        result.add(intervals[i]); i++
    return result
```

### 16.3.3 区间交集（Interval Intersection）

**问题：** 找到两组区间列表的交集。

```
intervalIntersection(A, B):
    i = 0; j = 0; result = []
    while i < A.length and j < B.length:
        start = max(A[i][0], B[j][0])
        end = min(A[i][1], B[j][1])
        if start ≤ end:
            result.add([start, end])
        if A[i][1] < B[j][1]: i++   // 移走结束较早的区间
        else: j++
    return result
```

### 16.3.4 会议室 II（Meeting Rooms II）

**问题：** 给定会议时间区间，求所需的最少会议室数量。

**扫描线（Sweep Line）解法：**

```
minMeetingRooms(intervals):
    startTimes = intervals.map(i -> i[0]).sorted()
    endTimes = intervals.map(i -> i[1]).sorted()
    rooms = 0; endIdx = 0
    for start in startTimes:
        if start < endTimes[endIdx]:
            rooms++              // 需要新会议室
        else:
            endIdx++             // 释放一个会议室
    return rooms
```

**或者用差分数组：** 在每个会议开始时 +1，结束时 -1，扫描过程的最大值即为答案。

---

## 16.4 位运算技巧

位运算是计算机最底层的操作，运行速度极快。掌握常见的位运算技巧能在某些问题上写出极其简洁高效的代码。

### 16.4.1 常用位操作

**获取、设置、清除、切换指定位：**

```
// 获取第 i 位（0-indexed）
getBit(x, i): (x >> i) & 1

// 将第 i 位设为 1
setBit(x, i): x | (1 << i)

// 将第 i 位设为 0
clearBit(x, i): x & ~(1 << i)

// 切换第 i 位
toggleBit(x, i): x ^ (1 << i)

// 清除最右侧的 1
removeRightmostOne(x): x & (x - 1)

// 获取最右侧的 1
getRightmostOne(x): x & (-x)
```

### 16.4.2 统计二进制中 1 的个数（Brian Kernighan's Algorithm）

**核心思想：** `n & (n - 1)` 可以消除最右侧的 1。反复执行直到 n 为 0。

```
countBits(n):
    count = 0
    while n ≠ 0:
        n = n & (n - 1)
        count++
    return count
```

**时间复杂度：** $O(\text{number of 1 bits})$，优于逐位检测的 $O(\log n)$。

### 16.4.3 判断 2 的幂

**性质：** 2 的幂的二进制表示只有一个 1。

```
isPowerOfTwo(n):
    return n > 0 and (n & (n - 1)) == 0
```

### 16.4.4 异或的妙用（XOR）

**核心性质：**
- $a \oplus a = 0$
- $a \oplus 0 = a$
- 交换律和结合律

**典型问题——只出现一次的数字：** 数组中除一个元素外都出现两次，找出那个元素。

```
singleNumber(nums):
    result = 0
    for num in nums:
        result ^= num
    return result
```

**扩展——找出两个只出现一次的数字：** 全员异或得到 `a ^ b`，找到任意一位为 1 的位置，按该位分组异或。

```
singleNumber2(nums):
    xor = 0
    for num in nums: xor ^= num
    // xor = a ^ b，找任意一个为 1 的位
    diff = xor & (-xor)  // 最右侧的 1
    a = 0; b = 0
    for num in nums:
        if (num & diff) == 0:
            a ^= num
        else:
            b ^= num
    return [a, b]
```

### 16.4.5 子集枚举（位掩码）

**核心思想：** 对于大小为 $n$ 的集合，每个子集对应一个 $n$ 位的二进制数，第 $i$ 位为 1 表示包含第 $i$ 个元素。

```
subsetEnumeration(nums):
    n = nums.length
    result = []
    for mask = 0 to (1 << n) - 1:
        subset = []
        for i = 0 to n-1:
            if (mask >> i) & 1 == 1:
                subset.add(nums[i])
        result.add(subset)
    return result
```

**时间复杂度：** $O(n \cdot 2^n)$，空间复杂度：$O(n \cdot 2^n)$。

---

## 16.5 常用解题模板

以下是面试中最实用的代码模板，建议熟记于心。

### 16.5.1 二分查找模板（左/右边界）

**标准二分查找：**

```
binarySearch(nums, target):
    L = 0; R = nums.length - 1
    while L ≤ R:
        mid = L + (R - L) / 2
        if nums[mid] == target: return mid
        else if nums[mid] < target: L = mid + 1
        else: R = mid - 1
    return -1
```

**查找左边界（第一个 ≥ target 的位置）：**

```
lowerBound(nums, target):
    L = 0; R = nums.length  // 注意 R 初始化为 length
    while L < R:
        mid = L + (R - L) / 2
        if nums[mid] ≥ target:
            R = mid
        else:
            L = mid + 1
    return L
```

**查找右边界（最后一个 ≤ target 的位置）：**

```
upperBound(nums, target):
    L = 0; R = nums.length
    while L < R:
        mid = L + (R - L) / 2
        if nums[mid] ≤ target:
            L = mid + 1
        else:
            R = mid
    return L - 1
```

### 16.5.2 回溯模板

```
backtrack(path, choices, result):
    if 满足结束条件:
        result.add(new path)
        return
    for choice in choices:
        做选择 (path.add(choice))
        backtrack(path, choices, result)
        撤销选择 (path.removeLast())
```

**全排列示例：**

```
permute(nums):
    result = []
    used = new boolean[nums.length]
    backtrack([], nums, used, result)
    return result

backtrack(path, nums, used, result):
    if path.size == nums.length:
        result.add(new ArrayList(path))
        return
    for i = 0 to nums.length-1:
        if used[i]: continue
        used[i] = true
        path.add(nums[i])
        backtrack(path, nums, used, result)
        path.removeLast()
        used[i] = false
```

### 16.5.3 动态规划模板

**基础模板（一维 DP）：**

```
// 以"打家劫舍"为例
dp[i] = max(dp[i-1], dp[i-2] + nums[i])
// 空间优化
prev2 = 0; prev1 = 0
for num in nums:
    curr = max(prev1, prev2 + num)
    prev2 = prev1
    prev1 = curr
return prev1
```

**基础模板（二维 DP）：**

```
// 以"不同路径"为例
dp = new int[m][n]
// 初始化边界
for i = 0 to m-1: dp[i][0] = 1
for j = 0 to n-1: dp[0][j] = 1
// 状态转移
for i = 1 to m-1:
    for j = 1 to n-1:
        dp[i][j] = dp[i-1][j] + dp[i][j-1]
return dp[m-1][n-1]
```

### 16.5.4 BFS/DFS 模板

**DFS（递归）：**

```
dfs(node, visited):
    if node == null or visited.contains(node): return
    visited.add(node)
    process(node)
    for neighbor in node.neighbors:
        dfs(neighbor, visited)
```

**BFS（队列）：**

```
bfs(start, target):
    queue = new Queue()
    visited = new Set()
    queue.add(start)
    visited.add(start)
    steps = 0
    while queue not empty:
        size = queue.size
        for i = 0 to size-1:
            curr = queue.poll()
            if curr == target: return steps
            for neighbor in curr.neighbors:
                if not visited.contains(neighbor):
                    queue.add(neighbor)
                    visited.add(neighbor)
        steps++
    return -1
```

### 16.5.5 滑动窗口模板

```
left = 0
for right = 0 to n-1:
    将 nums[right] 加入窗口
    while 窗口不满足约束:
        将 nums[left] 移出窗口
        left++
    更新答案（通常是 max/min of right-left+1）
```

---

## 本章总结

| 技巧模板 | 适用场景 | 复杂度特征 |
|---------|---------|-----------|
| 双指针 | 有序数组、链表、原地分区 | $O(n)$ 时间，$O(1)$ 空间 |
| 滑动窗口 | 连续子数组/子串 | $O(n)$ 时间，$O(1)$ 或 $O(k)$ 空间 |
| 区间扫描 | 区间合并、重叠、覆盖率 | $O(n \log n)$ 时间（排序为瓶颈） |
| 位运算 | 集合表示、偶次/奇次出现、权限控制 | $O(1)$ 或 $O(n)$ 时间 |
| 解题模板 | 回溯、DP、BFS/DFS、二分查找 | 因题而异 |

面试中拿到题目后，建议按以下思路思考：
1. **能否用双指针？**（有序/子数组/链表）
2. **能否用滑动窗口？**（连续子串/子数组）
3. **能否用二分查找？**（有序/单调性）
4. **能否用回溯/DFS/BFS？**（组合/排列/图遍历）
5. **能否用 DP？**（最优子结构/重叠子问题）

掌握了这些模板和技巧，你就已经有了应对绝大多数面试算法题的武器库。