# 第2章 复杂度分析

> **算法分析的核心：评估效率，预测性能，指导优化。**

---

## 2.1 时间复杂度深度解析

### 解决的问题

时间复杂度衡量算法执行时间随输入规模增长的变化趋势。它帮助我们在不运行代码的情况下，预测算法在大规模数据上的表现，并在不同算法之间做出理性选择。

### 实现原理

**核心思想**：将算法的执行时间建模为输入规模 `n` 的函数 `T(n)`，关注 `n → ∞` 时的增长趋势（渐进分析）。

#### 三种渐近符号

| 符号 | 含义 | 数学定义 | 类比 |
|------|------|----------|------|
| **Big O** `O(g(n))` | 上界（最坏情况） | `∃ c>0, n₀>0, ∀ n≥n₀: 0 ≤ T(n) ≤ c·g(n)` | 最高限速 |
| **Big Ω** `Ω(g(n))` | 下界（最好情况） | `∃ c>0, n₀>0, ∀ n≥n₀: 0 ≤ c·g(n) ≤ T(n)` | 最低限速 |
| **Big Θ** `Θ(g(n))` | 紧界（精确界） | `T(n) = O(g(n))` 且 `T(n) = Ω(g(n))` | 速度区间 |

```
      T(n)
       ↑
  c₂·g│─────── 上界 (O)
       │      ╱
   g·g │─────╱── 紧界 (Θ)
       │    ╱
  c₁·g │───╱─── 下界 (Ω)
       │  ╱
       │ ╱
       │╱
       └──────────────────→ n
```

**实际工程**中，Big O 是最常用的符号——我们通常关心"最坏情况下算法有多慢"。

### 代码实现

#### 常见复杂度类别的 Python 示例

```python
import time
import random

# ---------- O(1) — 常数时间 ----------
def get_first(arr):
    return arr[0]  # 无论数组多大，只执行一次操作

# ---------- O(log n) — 对数时间 ----------
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
# 每次迭代将搜索范围减半，需要 log₂(n) 次

# ---------- O(n) — 线性时间 ----------
def linear_search(arr, target):
    for i, val in enumerate(arr):
        if val == target:
            return i
    return -1
# 最坏情况下需要遍历所有 n 个元素

# ---------- O(n log n) — 线性对数时间 ----------
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
# 分治：每层 O(n)，共 log n 层

# ---------- O(n²) — 平方时间 ----------
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
# 双重循环：n * n/2 ≈ n²/2

# ---------- O(2ⁿ) — 指数时间 ----------
def fibonacci_recursive(n):
    if n <= 1:
        return n
    return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2)
# 每个调用分裂为两个子调用，形成二叉树，节点数 2ⁿ
```

### 常见算法复杂度速查表

| 复杂度 | 代表算法 | n=10 | n=100 | n=1000 | n=10⁶ |
|--------|----------|------|-------|--------|-------|
| `O(1)` | 数组随机访问 | 1 | 1 | 1 | 1 |
| `O(log n)` | 二分查找 | 3 | 7 | 10 | 20 |
| `O(√n)` | 素数检测 | 3 | 10 | 32 | 1000 |
| `O(n)` | 线性查找 | 10 | 100 | 1000 | 10⁶ |
| `O(n log n)` | 归并排序 | 23 | 664 | 9966 | 2×10⁷ |
| `O(n²)` | 冒泡排序 | 100 | 10⁴ | 10⁶ | 10¹² |
| `O(n³)` | 矩阵乘法 | 1000 | 10⁶ | 10⁹ | 10¹⁸ |
| `O(2ⁿ)` | 斐波那契(递归) | 1024 | 2¹⁰⁰ | — | — |

### 增长率可视化

```
操作数
  ↑
  │                         2ⁿ
  │                       /
  │                     /
  │                   / n²
  │                 /
  │               /  n log n
  │             / |
  │           /  |  n
  │         /   | /
  │    ____/    |/
  │   /    log n
  │  /  O(1)
  └────────────────────────────→ n
```

### 使用场景

| 复杂度 | 场景举例 |
|--------|----------|
| `O(1)` | 哈希表查找、数组索引、位运算 |
| `O(log n)` | 二分查找、平衡树操作、跳表查询 |
| `O(n)` | 遍历数组/链表、计算和/均值、字符串比较 |
| `O(n log n)` | 排序（快排、归并、堆排）、FFT、Dijkstra |
| `O(n²)` | 简单排序、双层遍历、Floyd-Warshall |
| `O(2ⁿ)` | 暴力枚举、子集生成、TSP 暴力解 |
| `O(n!)` | 全排列、旅行商暴力解 |

### 潜在风险与问题

**1. 忽略常数因子**

`O(n)` 的算法可能常数很大（如 1000n），而 `O(n²)` 的常数很小（如 0.5n²）。在 n 较小时，`O(n²)` 反而更快。**Big O 只在 n 足够大时有意义**。

**2. 忽略输入特征**

Big O 分析最坏情况，但实际数据可能具有特殊结构。例如快速排序最坏 `O(n²)`，但随机数据下期望 `O(n log n)`，且有很好的常数因子。

**3. 忽略摊销成本**

某些操作单次可能很慢（如动态数组扩容），但平均到多次操作后成本很低。

**4. 常见错误**

```python
# 看起来像 O(n)，实际上是 O(n²)
def print_pairs(arr):
    for i in range(len(arr)):          # O(n)
        for j in range(len(arr)):      # O(n) — 嵌套循环！
            print(arr[i], arr[j])

# 看起来像 O(n²)，实际上是 O(n)
def print_triplets(arr):
    n = len(arr)
    for i in range(n):       # O(n)
        for j in range(3):   # O(1) — 常数次！
            for k in range(3):  # O(1)
                print(arr[i], j, k)
```

### 优化策略

**1. 降低复杂度层级**

| 原始复杂度 | 优化后 | 策略 |
|-----------|--------|------|
| `O(n²)` | `O(n log n)` | 用排序+双指针替代嵌套循环 |
| `O(n²)` | `O(n)` | 用哈希表缓存中间结果 |
| `O(2ⁿ)` | `O(n²)` | 用 DP 替代递归枚举 |
| `O(n)` | `O(log n)` | 用二分查找替代线性查找 |

**2. 优化技巧**

```python
# 优化前：O(n²)
def has_duplicate_naive(arr):
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                return True
    return False

# 优化后：O(n)
def has_duplicate_fast(arr):
    seen = set()
    for x in arr:
        if x in seen:
            return True
        seen.add(x)
    return False
```

---

## 2.2 空间复杂度分析

### 解决的问题

空间复杂度衡量算法执行过程中占用的内存空间随输入规模增长的速率。在内存受限的环境（嵌入式系统、移动设备、大数据处理）中，空间复杂度与时间复杂度同等重要。

### 实现原理

与时间复杂度相同的渐近分析框架，但衡量的不是操作次数，而是分配的额外存储单元数量。

**空间分类**：

- **固定空间**：指令代码、常量、变量——与输入规模无关
- **动态空间**：随输入规模变化而分配的空间——分析的焦点
- **栈空间**：递归调用时函数调用栈占用的空间

### 代码实现

```python
# ---------- O(1) 空间 — 原地操作 ----------
def sum_array(arr):
    total = 0                 # 1 个变量，固定大小
    for x in arr:
        total += x
    return total              # 无论输入多大，只用 1 个整数变量

def reverse_in_place(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        arr[left], arr[right] = arr[right], arr[left]
        left += 1
        right -= 1
    return arr                # 原地交换，不需额外数组

# ---------- O(n) 空间 — 线性额外空间 ----------
def copy_array(arr):
    return [x for x in arr]   # 创建新数组，大小与输入相同

def get_fibonacci_sequence(n):
    dp = [0] * (n + 1)        # 长度为 n+1 的数组
    dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp                 # 空间 O(n)

# ---------- O(n²) 空间 — 平方额外空间 ----------
def create_adjacency_matrix(n):
    return [[0] * n for _ in range(n)]  # n×n 矩阵

def all_pairs_distances(points):
    n = len(points)
    dist = [[0] * n for _ in range(n)]  # n×n 矩阵
    for i in range(n):
        for j in range(n):
            dist[i][j] = ((points[i][0] - points[j][0]) ** 2 +
                          (points[i][1] - points[j][1]) ** 2) ** 0.5
    return dist
```

### 常见算法空间复杂度对比

| 算法 | 空间复杂度 | 说明 |
|------|-----------|------|
| 冒泡排序 | `O(1)` | 原地交换 |
| 插入排序 | `O(1)` | 原地插入 |
| 快速排序 | `O(log n)` | 递归栈空间 |
| 归并排序 | `O(n)` | 需辅助数组合并 |
| 堆排序 | `O(1)` | 原地建堆 |
| 计数排序 | `O(k)` | 计数数组，k 为值域 |
| 桶排序 | `O(n + k)` | 桶 + 每个桶内元素 |
| 斐波那契(递归) | `O(n)` | 递归栈深度 |
| 斐波那契(迭代) | `O(1)` | 仅需 2 个变量 |
| Dijkstra | `O(V)` | 距离数组 + 优先队列 |

### 使用场景

- **嵌入式系统**：内存以 KB 计，必须用 `O(1)` 或 `O(log n)` 空间算法
- **大数据处理**：数据量远超内存容量，需流式算法或外排序
- **移动端开发**：内存压力直接影响 App 稳定性
- **实时系统**：GC 触发不可预测，需控制内存分配

### 潜在风险与问题

**1. 空间-时间权衡（Space-Time Tradeoff）**

```python
# 省时间但费空间：缓存计算结果
def fib_memoized(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memoized(n - 1, memo) + fib_memoized(n - 2, memo)
    return memo[n]

# 省空间但费时间：递归计算
def fib_plain(n):
    return n if n <= 1 else fib_plain(n - 1) + fib_plain(n - 2)
```

| 策略 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 递归（朴素） | `O(2ⁿ)` | `O(n)` |
| 记忆化递归 | `O(n)` | `O(n)` |
| 迭代 DP | `O(n)` | `O(n)` |
| 迭代优化 | `O(n)` | `O(1)` |

**2. 递归栈溢出**

```python
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n - 1)  # n=1000 时可能 Stack Overflow
```

Python 默认递归深度限制约 1000，可通过 `sys.setrecursionlimit` 调整，但不推荐依赖。

**3. 隐藏的空间开销**

```python
# 看似 O(1) 空间，实际创建了切片副本（O(n) 空间）
def bad_slice(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = arr[:mid]     # 创建副本！
    right = arr[mid:]    # 创建副本！
    return bad_slice(left) + bad_slice(right)
```

### 优化策略

**1. 原地算法（In-place Algorithm）**

```python
# 原地反转数组：O(1) 空间
def reverse_in_place(arr):
    i, j = 0, len(arr) - 1
    while i < j:
        arr[i], arr[j] = arr[j], arr[i]
        i += 1
        j -= 1

# 原地移除指定元素
def remove_element_in_place(arr, val):
    k = 0
    for i in range(len(arr)):
        if arr[i] != val:
            arr[k] = arr[i]
            k += 1
    return k  # 新长度，原数组前 k 个元素即为结果
```

**2. 空间优化模式**

| 模式 | 描述 | 示例 |
|------|------|------|
| 原地修改 | 直接在输入数据上修改 | 原地排序 |
| 滚动变量 | 只保留必要的几个变量 | 迭代斐波那契 |
| 位压缩 | 用位操作替代数组 | 位图（BitMap） |
| 尾递归 | 将递归转为迭代 | 尾递归优化 |
| 流式处理 | 不加载全部数据 | 生成器（Generator） |

**3. Python 特有优化**

```python
# 使用生成器：O(1) 空间读取大文件
def read_large_file(file_path):
    with open(file_path) as f:
        for line in f:          # 一次只读一行
            yield line.strip()

# 使用 itertools 惰性计算
from itertools import islice
def process_chunks(file_path, chunk_size=1000):
    with open(file_path) as f:
        while True:
            chunk = list(islice(f, chunk_size))
            if not chunk:
                break
            yield process(chunk)  # 处理完释放
```

---

## 2.3 递归算法复杂度分析

### 解决的问题

递归算法的时间复杂度不能直观看出——它隐含在递归树的结构中。本节教你用系统方法分析任意递归算法的复杂度。

### 实现原理

#### 递推关系（Recurrence Relation）

递归算法的时间复杂度 `T(n)` 可以表示为：

```
T(n) = a·T(n/b) + f(n)
```

| 符号 | 含义 |
|------|------|
| `a` | 子问题个数 |
| `n/b` | 每个子问题的规模（约等） |
| `f(n)` | 分解与合并的开销 |

#### 主定理（Master Theorem）

对于 `T(n) = a·T(n/b) + f(n)`，其中 `a ≥ 1, b > 1`：

| 情况 | 条件 | 结论 |
|------|------|------|
| **情况 1** | `f(n) = O(n^{log_b a - ε})`, ε > 0 | `T(n) = Θ(n^{log_b a})` |
| **情况 2** | `f(n) = Θ(n^{log_b a})` | `T(n) = Θ(n^{log_b a}·log n)` |
| **情况 3** | `f(n) = Ω(n^{log_b a + ε})`, ε > 0 且满足正则条件 | `T(n) = Θ(f(n))` |

```
       T(n)
       ↑
       │                  情况3: f(n) 占主导
       │                  T(n) = Θ(f(n))
       │           ┌──────────────
       │           │  情况2: 平衡
       │           │  T(n) = Θ(n^{log_b a}·log n)
       │     ┌─────┘
       │     │  情况1: 子问题占主导
       │     │  T(n) = Θ(n^{log_b a})
       └─────┴─────────────────────────→ log_b a 的指数
```

#### 常见递归复杂度速查

| 递推关系 | `a` | `b` | `log_b a` | 复杂度 | 算法举例 |
|----------|-----|-----|-----------|--------|----------|
| `T(n) = T(n/2) + O(1)` | 1 | 2 | 0 | `O(log n)` | 二分查找 |
| `T(n) = T(n/2) + O(n)` | 1 | 2 | 0 | `O(n)` | 折半查找最值 |
| `T(n) = 2T(n/2) + O(1)` | 2 | 2 | 1 | `O(n)` | 树遍历 |
| `T(n) = 2T(n/2) + O(n)` | 2 | 2 | 1 | `O(n log n)` | 归并排序 |
| `T(n) = 2T(n/2) + O(n²)` | 2 | 2 | 1 | `O(n²)` | 某些分治算法 |
| `T(n) = 4T(n/2) + O(n)` | 4 | 2 | 2 | `O(n²)` | 暴力矩阵乘 |
| `T(n) = 7T(n/2) + O(n²)` | 7 | 2 | ~2.81 | `O(n^{2.81})` | Strassen 矩阵乘 |
| `T(n) = 3T(n/4) + O(n²)` | 3 | 4 | ~0.79 | `O(n²)` | 情况 3 |
| `T(n) = 2T(n-1) + O(1)` | — | — | — | `O(2ⁿ)` | 汉诺塔 |

### 代码实现

#### 递归 vs 迭代：斐波那契数列复杂度对比

```python
import time

# ---------- 递归实现：O(2ⁿ) 时间，O(n) 栈空间 ----------
def fib_recursive(n):
    """递推关系: T(n) = T(n-1) + T(n-2) + O(1)
       ≈ 2T(n-1) + O(1)
       => O(2ⁿ)
       递归树: 每个节点分裂为 2 个，深度 n，节点数 ≈ 2ⁿ
    """
    if n <= 1:
        return n
    return fib_recursive(n - 1) + fib_recursive(n - 2)

# ---------- 记忆化递归：O(n) 时间，O(n) 空间 ----------
def fib_memoized(n, memo=None):
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memoized(n - 1, memo) + fib_memoized(n - 2, memo)
    return memo[n]
# 每个子问题只计算一次 => O(n)

# ---------- 迭代实现：O(n) 时间，O(1) 空间 ----------
def fib_iterative(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
# 单层循环 => O(n)，只用 2 个变量 => O(1) 空间

# ---------- 矩阵快速幂：O(log n) 时间 ----------
def fib_matrix(n):
    """利用矩阵幂 F(n) = [[1,1],[1,0]]^(n-1)[0][0]"""
    if n <= 1:
        return n

    def matrix_mult(a, b):
        return [
            [a[0][0]*b[0][0] + a[0][1]*b[1][0],
             a[0][0]*b[0][1] + a[0][1]*b[1][1]],
            [a[1][0]*b[0][0] + a[1][1]*b[1][0],
             a[1][0]*b[0][1] + a[1][1]*b[1][1]]
        ]

    def matrix_pow(m, power):
        result = [[1, 0], [0, 1]]  # 单位矩阵
        base = m
        while power:
            if power & 1:
                result = matrix_mult(result, base)
            base = matrix_mult(base, base)
            power >>= 1
        return result

    base = [[1, 1], [1, 0]]
    result = matrix_pow(base, n - 1)
    return result[0][0]
```

#### 性能对比

```python
def benchmark_fib(n):
    # 仅测试较小 n，递归版本 n>35 会很慢
    for name, func in [("递归 O(2ⁿ)", fib_recursive),
                       ("记忆化 O(n)", fib_memoized),
                       ("迭代 O(n)", fib_iterative),
                       ("矩阵幂 O(log n)", fib_matrix)]:
        if name == "递归 O(2ⁿ)" and n > 35:
            print(f"{name}: n={n} 跳过（太慢）")
            continue
        start = time.perf_counter()
        result = func(n)
        elapsed = time.perf_counter() - start
        print(f"{name}: fib({n})={result}, time={elapsed:.6f}s")

# benchmark_fib(30) 的输出示例:
# 递归 O(2ⁿ): fib(30)=832040, time=0.320s
# 记忆化 O(n): fib(30)=832040, time=0.00002s
# 迭代 O(n): fib(30)=832040, time=0.00001s
# 矩阵幂 O(log n): fib(30)=832040, time=0.00005s
```

#### 更多主定理应用示例

```python
# ---------- 二分查找：T(n) = T(n/2) + O(1) ----------
# a=1, b=2, log_b a = 0, f(n)=O(1)=O(n⁰) => 情况 2 => O(log n)
def binary_search(arr, target, left=0, right=None):
    if right is None:
        right = len(arr) - 1
    if left > right:
        return -1
    mid = (left + right) // 2
    if arr[mid] == target:
        return mid
    elif arr[mid] < target:
        return binary_search(arr, target, mid + 1, right)
    else:
        return binary_search(arr, target, left, mid - 1)

# ---------- 归并排序：T(n) = 2T(n/2) + O(n) ----------
# a=2, b=2, log_b a = 1, f(n)=O(n)=Θ(n¹) => 情况 2 => O(n log n)
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

# ---------- 最大子数组和（分治）：T(n) = 2T(n/2) + O(n) ----------
# 同样 a=2, b=2, f(n)=O(n) => O(n log n)
def max_subarray_sum(arr):
    def helper(l, r):
        if l == r:
            return arr[l]
        mid = (l + r) // 2
        left_max = helper(l, mid)
        right_max = helper(mid + 1, r)

        # 跨中间的最大和：O(n)
        left_sum = float('-inf')
        s = 0
        for i in range(mid, l - 1, -1):
            s += arr[i]
            left_sum = max(left_sum, s)

        right_sum = float('-inf')
        s = 0
        for i in range(mid + 1, r + 1):
            s += arr[i]
            right_sum = max(right_sum, s)

        return max(left_max, right_max, left_sum + right_sum)

    return helper(0, len(arr) - 1)
```

### 使用场景

| 递归模式 | 典型算法 | 复杂度 |
|----------|----------|--------|
| 1 个子问题，规模减半 | 二分查找、二分搜索变体 | `O(log n)` |
| 1 个子问题，规模减常数 | 线性递归（阶乘） | `O(n)` |
| 2 个子问题，规模减半 | 归并排序、快速排序（平均） | `O(n log n)` |
| 多个子问题，规模减半 | Strassen 矩阵乘、FFT | `O(n^c)` |
| 2 个子问题，规模减 1 | 汉诺塔、斐波那契（朴素） | `O(2ⁿ)` |

### 潜在风险与问题

**1. 栈溢出（Stack Overflow）**

```python
# 递归深度过大会导致 RuntimeError
import sys
print(sys.getrecursionlimit())  # 通常 1000

def recursive_depth(n):
    if n == 0:
        return 0
    return 1 + recursive_depth(n - 1)

# recursive_depth(10000)  # RecursionError!
```

**2. 重复计算**

朴素递归斐波那契对 `fib(3)` 计算了 2 次、`fib(2)` 计算了 3 次。当 n 增大时，重复计算的子问题呈指数增长。

**3. 主定理不适用的情况**

- `a` 不是常数（如 `T(n) = n·T(n/2) + O(1)`）
- `f(n)` 不是多项式（如 `T(n) = 2T(n/2) + n·log n`）
- `T(n) = T(n-1) + T(n-2)` 不是主定理的标准形式

这些情况需用递归树法或代入法分析。

### 优化策略

**1. 记忆化（Memoization）**

缓存已计算的结果，将指数时间降为多项式时间。

**2. 尾递归优化（Tail Recursion）**

```python
# 非尾递归：计算完还要乘 n
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n - 1)

# 尾递归：结果直接传递，不回溯
def factorial_tail(n, acc=1):
    if n == 0:
        return acc
    return factorial_tail(n - 1, n * acc)

# Python 不支持尾递归优化，但好的编码习惯仍是尾递归形式
# 效果上等同于迭代
```

**3. 将递归转为迭代**

大部分递归可以转为迭代 + 显式栈，避免栈溢出。

```python
# 递归 DFS
def dfs_recursive(graph, node, visited=None):
    if visited is None:
        visited = set()
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs_recursive(graph, neighbor, visited)
    return visited

# 迭代 DFS（显式栈）
def dfs_iterative(graph, start):
    visited = set()
    stack = [start]
    while stack:
        node = stack.pop()
        if node not in visited:
            visited.add(node)
            for neighbor in graph[node]:
                if neighbor not in visited:
                    stack.append(neighbor)
    return visited
```

---

## 2.4 摊销分析与实际应用

### 解决的问题

摊销分析（Amortized Analysis）衡量**一系列操作**的平均时间复杂度，而非单次操作的最坏情况。它揭示了"偶尔很慢，但平均很快"的数据结构操作的真实成本。

### 实现原理

摊销分析关心的是：如果执行 `m` 次操作，总耗时 `T(m)`，那么摊销成本为 `T(m)/m`。

#### 三种分析方法

| 方法 | 核心理念 | 适用场景 |
|------|----------|----------|
| **Aggregate Method** | 求总成本再除以操作次数 | 最简单，适合固定操作序列 |
| **Accounting Method** | 每次操作"存"信用，昂贵操作时"花"信用 | 直观，像银行账户 |
| **Potential Method** | 用势能函数跟踪系统状态 | 最数学化，最适合分析 |

```
操作成本
↑
│    ██          ██
│    ██          ██     ← 昂贵的扩容操作
│  ████████████████
│  ████████████████
│  ████████████████
│  ████████████████
│  ████████████████  ← 普通插入 O(1)
└──────────────────────────→ 操作序列

━━━━━━━━━━━━━━━━━━━━━ 摊销成本线（摊平后的平均成本）
```

### 代码实现

#### 动态数组的摊销分析

```python
import time
import sys

class DynamicArray:
    """模拟 Python list 的动态数组扩容机制"""

    def __init__(self):
        self.capacity = 1          # 初始容量
        self.size = 0
        self.arr = [None] * self.capacity

    def append(self, value):
        if self.size == self.capacity:
            self._resize(self.capacity * 2)  # 扩容为 2 倍
        self.arr[self.size] = value
        self.size += 1

    def _resize(self, new_capacity):
        """扩容：O(n) 时间"""
        new_arr = [None] * new_capacity
        for i in range(self.size):
            new_arr[i] = self.arr[i]
        self.arr = new_arr
        self.capacity = new_capacity

    def __len__(self):
        return self.size

# 摊销分析：
# 假设初始 capacity=1，我们连续插入 n 个元素
# 扩容发生时：size=1→2→4→8→...→2^k
# 总扩容成本：1 + 2 + 4 + 8 + ... + 2^k ≈ 2n
# n 次插入总成本：n 次 O(1) 插入 + 2n 扩容成本 ≈ 3n
# 摊销成本：3n / n = O(1)  ✅
```

**容量翻倍 vs 固定增量**

| 策略 | 总扩容成本 | 摊销成本 | 空间浪费 |
|------|-----------|---------|---------|
| 每次 +1 | `O(n²)` | `O(n)` | 最少 |
| 每次 ×2 | `O(n)` | `O(1)` | 最多 50% |
| 每次 ×1.5 | `O(n)` | `O(1)` | 最多 33% |

Python 的 `list.append()` 就是典型的摊销 `O(1)` 操作。

#### 摊销分析验证

```python
def benchmark_dynamic_array(n):
    arr = DynamicArray()
    start = time.perf_counter()
    for i in range(n):
        arr.append(i)
    elapsed = time.perf_counter() - start
    print(f"n={n}: total={elapsed:.4f}s, avg={elapsed/n*1e6:.2f}µs")

for n in [10_000, 100_000, 1_000_000]:
    benchmark_dynamic_array(n)

# 输出示例（实际取决于机器）：
# n=10000:    total=0.0012s, avg=0.12µs
# n=100000:   total=0.011s,  avg=0.11µs
# n=1000000:  total=0.105s,  avg=0.11µs
# 平均成本稳定 ≈ O(1) ✅
```

#### 更多摊销分析的经典案例

```python
# ---------- 二进制计数器 ----------
# 从 0 开始计数到 n，每次 +1
# 最坏情况：1111 + 1 = 10000 需要翻转所有位
# 摊还分析：总翻转次数 = n/2 + n/4 + n/8 + ... ≈ n
# 摊销成本：O(1)
def binary_counter(n):
    bits = []
    total_flips = 0
    for _ in range(n):
        # 模拟二进制加 1
        i = 0
        flips = 0
        while i < len(bits) and bits[i] == 1:
            bits[i] = 0
            i += 1
            flips += 1
        if i == len(bits):
            bits.append(1)
        else:
            bits[i] = 1
        flips += 1
        total_flips += flips
    return total_flips, total_flips / n

# total_flips ≈ 2n, amortized cost ≈ 2

# ---------- 动态哈希表 ----------
# 与动态数组类似，当负载因子超过阈值时扩容
# 扩容 O(n)，但摊还到每次插入上为 O(1)

# ---------- Union-Find（并查集） ----------
# 按秩合并 + 路径压缩
# 单次操作最坏 O(α(n))，α(n) 是反阿克曼函数
# 在实际问题中 α(n) ≤ 5，可视为 O(1) 摊还
```

### 使用场景

| 数据结构/算法 | 最坏单次 | 摊还 | 说明 |
|--------------|---------|------|------|
| Python `list.append()` | `O(n)` | `O(1)` | 扩容时复制所有元素 |
| 动态哈希表插入 | `O(n)` | `O(1)` | rehash 时复制全部元素 |
| Union-Find 操作 | `O(log n)` | `O(α(n))` | 路径压缩 + 按秩合并 |
| 伸展树（Splay Tree） | `O(n)` | `O(log n)` | 单次旋转可能很深 |
| 二项堆插入 | `O(log n)` | `O(1)` | 合并堆操作 |
| 二进制计数器 | `O(log n)` | `O(1)` | 进位传播 |

### 潜在风险与问题

**1. 混淆摊销分析与平均情况分析**

| 概念 | 含义 |
|------|------|
| **摊销分析** | **确定性的**：对**最坏操作序列**的总成本取平均 |
| **平均情况分析** | **概率性的**：对**随机输入**的期望成本 |

**例如**：哈希表查找的摊销 `O(1)` 是确定性的——只要扩容策略合理，任何 `n` 次插入的序列总成本都是 `O(n)`。而"快速排序平均 `O(n log n)`"是概率性的——最坏输入（已排序数组+选首元素为 pivot）仍是 `O(n²)`。

**2. 忽略常数因子的影响**

摊还 `O(1)` 的常数可能很大。例如，动态数组扩容时复制元素的耗时在数据量大时不可忽略。

**3. 实时系统的禁忌**

摊销 `O(1)` 不代表每次操作都是 `O(1)`。在实时系统（自动驾驶、交易系统）中，单次 `O(n)` 的延迟不可接受，需要用**最坏情况**保证。

### 优化策略

**1. 预分配空间**

```python
# 如果已知最终大小，预分配避免多次扩容
n = 1000000
arr = [None] * n           # O(n) 一次分配
for i in range(n):
    arr[i] = i

# vs Python list 自动扩容
arr = []
for i in range(n):
    arr.append(i)          # 多次扩容，摊还 O(1)
```

**2. 选择合适扩容因子**

```python
class DynamicArrayCustom:
    def __init__(self, growth_factor=1.5):
        self.capacity = 1
        self.size = 0
        self.arr = [None] * self.capacity
        self.growth_factor = growth_factor  # 1.25~2.0

    def append(self, value):
        if self.size == self.capacity:
            new_cap = max(1, int(self.capacity * self.growth_factor))
            # 避免 growth_factor 太接近 1 导致频繁扩容
            if new_cap == self.capacity:
                new_cap += 1
            self._resize(new_cap)
        self.arr[self.size] = value
        self.size += 1

    def _resize(self, new_capacity):
        self.arr = self.arr + [None] * (new_capacity - self.capacity)
        self.capacity = new_capacity
```

**3. 使用分段的永久性数据结构**

```python
# deque 的双端操作都是 O(1) 摊还
from collections import deque

dq = deque()
for i in range(1000000):
    dq.append(i)        # 右端插入 O(1) 摊还
    dq.appendleft(-i)   # 左端插入 O(1) 摊还
# deque 底层是分段数组（block-based），两端操作都是摊还 O(1)
```

---

## 本章总结

### 复杂度图谱总览

```
         O(2ⁿ) ← 指数级——暴力枚举
           ↑
         O(n³) ← 立方级——基础矩阵乘
           ↑
         O(n²) ← 平方级——双层循环、冒泡
           ↑
      O(n log n) ← 线性对数级——最优排序
           ↑
         O(n) ← 线性级——单层遍历
           ↑
       O(log n) ← 对数级——二分查找
           ↑
         O(1) ← 常数级——数组访问
```

### 复杂度分析三步走

1. **识别基本操作**：找到最核心的操作（比较、赋值、访问）
2. **计算执行次数**：分析循环、递归、函数调用
3. **表达为 Big O**：取最高阶项，去掉常数因子

### 思考题

1. 一个算法的时间复杂度是 `O(n²)`，实际测试发现 n=100 时比另一个 `O(n log n)` 的算法还快，为什么？
2. 递归函数 `T(n) = 3T(n/3) + O(n)` 的时间复杂度是多少？
3. 哈希表插入的最坏时间复杂度是 `O(n)`，为什么在实际工程中被广泛使用？
4. 什么时候应该牺牲空间换取时间？什么时候应该相反？
5. 为什么 Python 的 `list.append()` 是摊还 `O(1)` 而不是严格 `O(1)`？

### 扩展阅读

- *Introduction to Algorithms* (CLRS) — Chapter 3: Growth of Functions, Chapter 17: Amortized Analysis
- *Algorithm Design Manual* (Skiena) — Chapter 2: Algorithm Analysis
- Python `timeit` 模块 — 精确测量小段代码执行时间
- `sys.setrecursionlimit` — 调整递归深度限制