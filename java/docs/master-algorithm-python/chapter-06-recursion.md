# 第6章 递归与迭代

> **核心思想**：递归是函数调用自身的编程技巧，迭代是重复执行一段代码。两者都能处理重复性任务，但思维方式截然不同。

---

## 6.1 递归的基本原理

### 解决的问题

现实中的许多问题天然具有"自相似"结构——一个大问题可以分解为若干规模更小的同类子问题。例如：遍历文件夹（文件夹里还有文件夹）、解析 JSON（嵌套的对象）、计算阶乘（n! = n × (n-1)!）。递归正是为这类问题而生的编程范式。

### 实现原理

**递归（Recursion）** 的核心思想：一个函数直接或间接地调用自身。

一个正确的递归函数必须包含两个部分：

| 组成部分 | 英文 | 作用 |
|---------|------|------|
| **基本情况** | Base Case | 递归的终止条件——不再调用自身，直接返回结果 |
| **递归情况** | Recursive Case | 函数调用自身，但传入的参数朝着基本情况逼近（通常规模更小） |

#### 调用栈可视化

每次函数调用，系统都会在**调用栈（Call Stack）** 上分配一个栈帧（Stack Frame），保存函数的局部变量、参数和返回地址。

以 `factorial(3)` 为例，调用栈的变化如下：

```
步骤 1: factorial(3) 入栈         步骤 2: factorial(2) 入栈
┌──────────────┐                  ┌──────────────┐
│ factorial(3) │                  │ factorial(2) │
│ n=3          │                  │ n=2          │
│ returns ?    │                  │ returns ?    │
├──────────────┤                  ├──────────────┤
│      ...     │                  │ factorial(3) │
│              │                  │ n=3          │
└──────────────┘                  │ returns ?    │
                                  └──────────────┘

步骤 3: factorial(1) 入栈         步骤 4: factorial(0) 入栈 → 命中 Base Case
┌──────────────┐                  ┌──────────────┐
│ factorial(1) │                  │ factorial(0) │ ← base case: return 1
│ n=1          │                  │ n=0          │
│ returns ?    │                  │ returns 1    │
├──────────────┤                  ├──────────────┤
│ factorial(2) │                  │ factorial(1) │
│ n=2          │                  │ n=1          │
│ returns ?    │                  │ returns ?    │
├──────────────┤                  ├──────────────┤
│ factorial(3) │                  │ factorial(2) │
│ n=3          │                  │ n=2          │
│ returns ?    │                  │ returns ?    │
└──────────────┘                  └──────────────┘
```

#### 递归的展开与回溯

递归过程分为两个阶段：

1. **展开（Unwinding / Forward）**：不断调用自身，向 base case 前进。每层调用入栈。
2. **回溯（Rewinding / Backward）**：从 base case 开始，逐层返回结果。每层计算完毕后出栈。

```
factorial(3) 的执行轨迹:

展开方向:                                 回溯方向:
factorial(3)                              returns 6
  └─ 3 * factorial(2)          ↑            ↑
       └─ 2 * factorial(1)     ↑            ↑ returns 2
            └─ 1 * factorial(0) ↑            ↑ returns 1
                 └─ return 1    ↑ (base)     ↑ returns 1
```

### 代码实现：最简单的递归

```python
# ---------- 阶乘：递归入门 ----------
def factorial(n: int) -> int:
    if n == 0:          # Base case: 0! = 1
        return 1
    return n * factorial(n - 1)  # Recursive case

# ---------- 倒计时：直观展示展开与回溯 ----------
def countdown(n: int) -> None:
    if n <= 0:          # Base case
        print("发射！")
        return
    print(f"展开: {n}")
    countdown(n - 1)
    print(f"回溯: {n}")  # 回溯时才会执行这一行

# 调用 countdown(3) 输出:
# 展开: 3
# 展开: 2
# 展开: 1
# 发射！
# 回溯: 1
# 回溯: 2
# 回溯: 3
```

### 使用场景

| 场景 | 说明 |
|------|------|
| **树形结构遍历** | 文件系统、DOM 树、JSON 解析 |
| **分治算法** | 归并排序、快速排序、二分查找 |
| **回溯问题** | N 皇后、数独、全排列 |
| **数学定义** | 阶乘、斐波那契、最大公约数 |
| **图遍历** | DFS（深度优先搜索） |

### 潜在风险

| 风险 | 说明 |
|------|------|
| **栈溢出（Stack Overflow）** | 递归过深导致调用栈超出内存限制。Python 默认递归深度约 1000 |
| **缺少 Base Case** | 导致无限递归，最终崩溃 |
| **Base Case 不可达** | 递归参数不朝着 base case 收敛 |
| **重复计算** | 朴素递归斐波那契有大量重复子问题 |
| **性能开销** | 函数调用有额外开销（参数压栈、跳转、返回） |

### 优化策略

1. **确保 Base Case 正确且可达**：写递归的第一原则
2. **考虑记忆化**：缓存重复子问题的结果
3. **考虑转为迭代**：栈空间敏感时用显式栈替代系统栈
4. **使用尾递归形式**（见 6.3 节）

---

## 6.2 递归 vs 迭代

### 解决的问题

同一个问题往往既能用递归解决，也能用迭代解决。理解两者的区别，帮助你在合适的场景选择合适的方法。

### 实现原理

**迭代（Iteration）** 使用循环结构（`for`、`while`）重复执行一段代码。递归依赖函数调用栈，迭代依赖循环变量。

#### 对比表格

| 维度 | 递归 | 迭代 |
|------|------|------|
| **可读性** | 对自相似问题更直观、更接近数学定义 | 对简单重复更自然 |
| **性能** | 函数调用有额外开销 | 循环无调用开销，更快 |
| **内存** | 每层调用占用栈空间（O(n)） | 通常 O(1) 额外空间 |
| **栈风险** | 深度过大时栈溢出 | 无栈溢出风险 |
| **实现难度** | 对树/图/分治问题更简单 | 对线性问题更简单 |
| **问题范围** | 适合有自相似结构的问题 | 适合所有重复性问题 |
| **调试难度** | 调用栈复杂，调试较困难 | 线性执行，调试容易 |

#### 何时优先选择递归

- 问题天然具有树形或递归结构（文件系统遍历、JSON 解析）
- 分治算法（归并排序、快速排序）
- 回溯与搜索（N 皇后、迷宫寻路）
- 数学递推定义（阶乘、斐波那契）
- 代码简洁性远超迭代版本

#### 何时优先选择迭代

- 简单线性重复（遍历数组、求和）
- 递归深度可能很大（>1000）
- 性能敏感的关键路径
- 内存受限的环境

### 代码实现：同一个问题的两种解法

```python
# ---------- 问题：反转字符串 ----------

def reverse_recursive(s: str) -> str:
    """递归解法：每次处理首字符"""
    if len(s) <= 1:
        return s
    return reverse_recursive(s[1:]) + s[0]

def reverse_iterative(s: str) -> str:
    """迭代解法：双指针交换"""
    chars = list(s)
    i, j = 0, len(chars) - 1
    while i < j:
        chars[i], chars[j] = chars[j], chars[i]
        i += 1
        j -= 1
    return ''.join(chars)

# ---------- 问题：判断回文 ----------

def palindrome_recursive(s: str) -> bool:
    """递归解法：比较首尾字符"""
    if len(s) <= 1:
        return True
    if s[0] != s[-1]:
        return False
    return palindrome_recursive(s[1:-1])

def palindrome_iterative(s: str) -> bool:
    """迭代解法：双指针向中间靠拢"""
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i += 1
        j -= 1
    return True
```

| 问题 | 递归特点 | 迭代特点 |
|------|---------|---------|
| 反转字符串 | 代码极简（3 行），但 O(n) 栈空间 | 代码稍长，O(1) 空间 |
| 判断回文 | 直观清晰，但字符串切片产生 O(n) 副本 | 高效，原地比较 |

### 使用场景速查

| 问题类型 | 推荐方案 | 原因 |
|---------|---------|------|
| 数组遍历 | 迭代 | 无需栈空间，性能好 |
| 链表操作 | 递归或迭代 | 链表天然递归结构，但迭代更省空间 |
| 树遍历 | 递归 | 递归与树的层次结构天然匹配 |
| 图 DFS | 递归或迭代+显式栈 | 递归简洁，显式栈可控 |
| 回溯/搜索 | 递归 | 状态管理方便，代码清晰 |
| 大深度问题 | 迭代 | 避免栈溢出 |

### 潜在风险

- **硬套递归**：对线性问题强行使用递归，既不提升可读性又降低性能
- **忽略递归深度**：Python 默认 recursionlimit 约 1000，生产环境要注意
- **迭代模拟递归过度**：手动维护栈来模拟递归有时比递归本身更复杂

### 优化策略

1. **递归转迭代的标准方法**：用显式栈（Stack）模拟调用栈
2. **用尾递归形式**：便于编译器优化（但 Python 不支持）
3. **二者结合**：分治时递归、合并时迭代

---

## 6.3 递归优化：尾递归与记忆化

### 解决的问题

朴素递归有两个主要缺陷——栈空间占用大（深度 O(n)）和重复计算（指数级复杂度）。尾递归优化减少栈空间，记忆化消除重复计算。

### 实现原理

#### 尾递归（Tail Recursion）

**定义**：递归调用是函数体中**最后一个执行的操作**，且返回值直接返回，不参与后续计算。

```python
# 非尾递归：递归后再乘 n
def factorial(n):
    return n * factorial(n - 1)  # 还有乘法要算

# 尾递归：递归是最后一步
def factorial_tail(n, acc=1):
    if n == 0:
        return acc
    return factorial_tail(n - 1, n * acc)  # 直接返回
```

**尾递归优化的原理**：如果递归是最后一步，当前栈帧在调用子函数后不再需要保留（没有后续操作），因此编译器可以复用当前栈帧——将递归转化为跳转（goto），空间从 O(n) 降为 O(1)。

**Python 的局限**：Python 设计者明确**不支持**尾递归优化。原因：
- 不破坏调用栈回溯（traceback）信息
- 保持语言语义简单一致
- Guido van Rossum 的著名观点：尾递归优化是"语言层面的优化，不应该由编译器做"

因此，在 Python 中，尾递归和普通递归一样消耗 O(n) 栈空间。但写出尾递归形式仍然是好习惯——代码更像迭代，便于阅读理解。

#### 蹦床模式（Trampoline）

**蹦床（Trampoline）** 是一种在缺乏 TCO 的语言中模拟尾递归优化的技术。核心思想是将递归替换为返回"下一层调用的包裹函数"，由一个循环反复执行这些包裹：

```python
def trampoline(func):
    """蹦床函数：反复执行直到返回非函数值"""
    while callable(func):
        func = func()
    return func

def factorial_trampoline(n, acc=1):
    if n == 0:
        return acc
    # 返回一个 thunk（包裹函数），而非直接递归调用
    return lambda: factorial_trampoline(n - 1, n * acc)

# 调用方式
result = trampoline(lambda: factorial_trampoline(5))
print(result)  # 120
```

#### 记忆化（Memoization）

**记忆化**缓存函数调用的结果，确保每个输入只计算一次。

```python
def fibonacci_memo(n, memo=None):
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fibonacci_memo(n - 1, memo) + fibonacci_memo(n - 2, memo)
    return memo[n]
```

**复杂度变化**：

| 实现 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 朴素递归 | O(2ⁿ) | O(n) |
| 记忆化递归 | O(n) | O(n) |
| 迭代 | O(n) | O(1) |

记忆化本质上是用**空间换时间**——用 O(n) 的缓存空间换来了从指数到线性的时间降维。

### 代码实现：Fibonacci 完整对比

```python
from functools import lru_cache

# ---------- 朴素递归：O(2ⁿ) ----------
def fib_naive(n: int) -> int:
    if n <= 1:
        return n
    return fib_naive(n - 1) + fib_naive(n - 2)

# ---------- 记忆化递归（手动）：O(n) ----------
def fib_memo_manual(n: int, memo: dict = None) -> int:
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memo_manual(n - 1, memo) + fib_memo_manual(n - 2, memo)
    return memo[n]

# ---------- 记忆化递归（装饰器）：O(n) ----------
@lru_cache(maxsize=None)
def fib_lru(n: int) -> int:
    if n <= 1:
        return n
    return fib_lru(n - 1) + fib_lru(n - 2)

# ---------- 尾递归形式（Python 不优化）：O(n) 栈 ----------
def fib_tail(n: int, a: int = 0, b: int = 1) -> int:
    if n == 0:
        return a
    if n == 1:
        return b
    return fib_tail(n - 1, b, a + b)  # 尾递归

# ---------- 迭代：O(n) 时间，O(1) 空间 ----------
def fib_iterative(n: int) -> int:
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
```

### 使用场景

| 技术 | 适用场景 |
|------|---------|
| 尾递归 | 希望编译器优化时（C/C++/Rust 等），或代码风格偏好 |
| 记忆化 | 纯函数、有大量重叠子问题、输入范围可枚举 |
| 蹦床模式 | 需要在 Python 中模拟深递归且避免栈溢出 |
| 迭代 | 追求最佳性能、栈空间受限 |

### 潜在风险

| 风险 | 说明 |
|------|------|
| Python 无 TCO | 尾递归在 Python 中不省空间，不要误以为能解决栈溢出 |
| 记忆化内存膨胀 | 输入范围广泛时，memo 可能占用大量内存 |
| lru_cache 用错 | 不指定 `maxsize` 可能导致无限增长 |
| 蹦床性能 | 大量 lambda 创建有额外开销 |

### 优化策略

1. **Python 中优先使用迭代**替代尾递归
2. **使用 `@lru_cache`**：比手动 memo 更简洁，支持 maxsize 和过期策略
3. **用字典而非列表做备忘录**：适用于稀疏索引
4. **显式栈转换**：当递归深度可能超过 1000 时，转为迭代 + 手动栈

---

## 6.4 经典递归问题

### 6.4.1 阶乘（Factorial）

$$
n! = \begin{cases}
1 & \text{if } n = 0 \\
n \times (n-1)! & \text{if } n > 0
\end{cases}
$$

#### 代码实现

```python
def factorial_recursive(n: int) -> int:
    if n == 0:
        return 1
    return n * factorial_recursive(n - 1)

def factorial_iterative(n: int) -> int:
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result
```

#### 复杂度分析

| 实现 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 递归 | O(n) | O(n) — 栈空间 |
| 迭代 | O(n) | O(1) |

#### 执行轨迹（n=5）

```
factorial(5)
  = 5 * factorial(4)
    = 5 * 4 * factorial(3)
      = 5 * 4 * 3 * factorial(2)
        = 5 * 4 * 3 * 2 * factorial(1)
          = 5 * 4 * 3 * 2 * 1 * factorial(0)
          = 5 * 4 * 3 * 2 * 1 * 1
        = 5 * 4 * 3 * 2 * 1
      = 5 * 4 * 6
    = 5 * 24
  = 120
```

### 6.4.2 斐波那契数列（Fibonacci）

$$
F(n) = \begin{cases}
0 & \text{if } n = 0 \\
1 & \text{if } n = 1 \\
F(n-1) + F(n-2) & \text{if } n > 1
\end{cases}
$$

#### 四种实现方式对比

| 实现 | 时间复杂度 | 空间复杂度 | n=40 性能 |
|------|-----------|-----------|-----------|
| 朴素递归 | O(2ⁿ) | O(n) | ~30 秒 |
| 记忆化递归 | O(n) | O(n) | ~0.1 ms |
| 迭代 | O(n) | O(1) | ~0.05 ms |
| 矩阵快速幂 | O(log n) | O(1) | ~0.02 ms |

#### 代码实现

```python
def fib_naive(n: int) -> int:
    """朴素递归 — O(2ⁿ)"""
    # 每个节点分裂为 2 个子调用，递归树节点数 ≈ 2ⁿ
    if n <= 1:
        return n
    return fib_naive(n - 1) + fib_naive(n - 2)

def fib_memo(n: int, memo: dict = None) -> int:
    """记忆化递归 — O(n)"""
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo)
    return memo[n]

def fib_iterative(n: int) -> int:
    """迭代 — O(n) 时间，O(1) 空间"""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def fib_matrix(n: int) -> int:
    """矩阵快速幂 — O(log n)"""
    if n <= 1:
        return n

    def mat_mul(a, b):
        return [
            [a[0][0]*b[0][0] + a[0][1]*b[1][0],
             a[0][0]*b[0][1] + a[0][1]*b[1][1]],
            [a[1][0]*b[0][0] + a[1][1]*b[1][0],
             a[1][0]*b[0][1] + a[1][1]*b[1][1]]
        ]

    def mat_pow(m, p):
        r = [[1, 0], [0, 1]]
        base = m
        while p:
            if p & 1:
                r = mat_mul(r, base)
            base = mat_mul(base, base)
            p >>= 1
        return r

    result = mat_pow([[1, 1], [1, 0]], n - 1)
    return result[0][0]
```

#### 递归树分析

朴素递归 `fib(5)` 的调用树：

```
                        fib(5)
                      /        \
                 fib(4)         fib(3)
                /      \        /     \
           fib(3)     fib(2)  fib(2)  fib(1)
          /     \     /    \   /    \
     fib(2)  fib(1) fib(1) fib(0) fib(1) fib(0)
     /    \
  fib(1) fib(0)
```

- `fib(3)` 被重复计算了 2 次，`fib(2)` 被重复计算了 3 次
- 总调用次数 ≈ 2ⁿ⁺¹ - 1
- 这就是记忆化要解决的问题

### 6.4.3 汉诺塔（Tower of Hanoi）

#### 问题描述

有三根柱子 A、B、C，A 柱上有 n 个大小不同的圆盘，按从大到小叠放。目标：将所有圆盘从 A 移到 C，每次只能移动一个，且大圆盘不能放在小圆盘上。

#### 递归思路

要将 n 个圆盘从 A 移到 C：
1. 将 n-1 个圆盘从 A 移到 B（借助 C）
2. 将第 n 个（最大）圆盘从 A 移到 C
3. 将 n-1 个圆盘从 B 移到 C（借助 A）

#### 代码实现

```python
def hanoi(n: int, source: str, target: str, auxiliary: str) -> None:
    """
    汉诺塔递归解法
    参数:
        n: 圆盘数量
        source: 源柱子
        target: 目标柱子
        auxiliary: 辅助柱子
    """
    if n == 1:
        # Base case: 只有一个圆盘，直接移动
        print(f"移动圆盘 1: {source} → {target}")
        return

    # Step 1: 将 n-1 个圆盘从 source 移到 auxiliary
    hanoi(n - 1, source, auxiliary, target)

    # Step 2: 移动第 n 个圆盘
    print(f"移动圆盘 {n}: {source} → {target}")

    # Step 3: 将 n-1 个圆盘从 auxiliary 移到 target
    hanoi(n - 1, auxiliary, target, source)
```

#### 执行轨迹（n=3）

```
移动圆盘 1: A → C
移动圆盘 2: A → B
移动圆盘 1: C → B
移动圆盘 3: A → C
移动圆盘 1: B → A
移动圆盘 2: B → C
移动圆盘 1: A → C
```

#### 复杂度分析

| 指标 | 值 | 推导 |
|------|-----|------|
| 时间复杂度 | O(2ⁿ) | T(n) = 2T(n-1) + 1, T(1) = 1 → T(n) = 2ⁿ - 1 |
| 空间复杂度 | O(n) | 递归栈深度为 n |

**移动次数**：对于 n 个圆盘，最少需要 `2ⁿ - 1` 步。n=64 时 ≈ 1.84×10¹⁹ 步——即便每秒移动 1 次，也需要约 5800 亿年。

#### 迭代解法（递推规律）

汉诺塔的迭代解法有一个有趣规律：**步数最小的移动总是在三个柱子之间轮换**。

- 如果 n 是奇数，最小盘按 A → C → B → A 循环
- 如果 n 是偶数，最小盘按 A → B → C → A 循环

```python
def hanoi_iterative(n: int, source: str, target: str, auxiliary: str) -> None:
    """汉诺塔迭代解法（非递归）"""
    pegs = [source, auxiliary, target]  # 排列依据 n 奇偶调整
    if n % 2 == 0:
        pegs = [source, target, auxiliary]

    # 将圆盘表示为一组栈
    towers = {source: list(range(n, 0, -1)), target: [], auxiliary: []}
    total_moves = 2 ** n - 1

    def move_disk(from_peg, to_peg):
        if towers[from_peg]:
            disk = towers[from_peg].pop()
            towers[to_peg].append(disk)
            print(f"移动圆盘 {disk}: {from_peg} → {to_peg}")

    for step in range(1, total_moves + 1):
        if step % 2 == 1:  # 奇数步：移动最小的圆盘
            move_disk(pegs[0], pegs[(step // 2 + 1) % 3])
        else:  # 偶数步：唯一合法移动
            for i in range(3):
                j = (i + 1) % 3
                if towers[pegs[i]] and towers[pegs[j]]:
                    if towers[pegs[i]][-1] < towers[pegs[j]][-1]:
                        move_disk(pegs[j], pegs[i])
                        break
                    elif towers[pegs[j]][-1] < towers[pegs[i]][-1]:
                        move_disk(pegs[i], pegs[j])
                        break
```

### 经典问题复杂度总结

| 问题 | 递推关系 | 时间复杂度 | 空间复杂度 |
|------|---------|-----------|-----------|
| 阶乘（递归） | T(n) = T(n-1) + O(1) | O(n) | O(n) |
| 阶乘（迭代） | — | O(n) | O(1) |
| 斐波那契（朴素） | T(n) = T(n-1) + T(n-2) + O(1) | O(2ⁿ) | O(n) |
| 斐波那契（记忆化） | T(n) = T(n-1) + O(1) | O(n) | O(n) |
| 斐波那契（迭代） | — | O(n) | O(1) |
| 汉诺塔 | T(n) = 2T(n-1) + O(1) | O(2ⁿ) | O(n) |

---

## 本章总结

### 关键概念

| 概念 | 要点 |
|------|------|
| **递归** | 函数调用自身，包含 Base Case 和 Recursive Case |
| **调用栈** | 每层递归占用一个栈帧，深度过大导致栈溢出 |
| **尾递归** | 递归是最后一步，Python 不优化但值得了解 |
| **记忆化** | 缓存结果消除重复计算，空间换时间 |
| **递归 vs 迭代** | 递归适合自相似结构，迭代性能更好空间更省 |
| **蹦床模式** | 在无 TCO 语言中模拟尾递归 |

### 思维框架

**写递归的三步法**：
1. **定义 Base Case**：什么情况下直接返回？
2. **定义 Recursive Case**：如何把问题缩小？函数如何调用自身？
3. **验证收敛性**：每次递归是否朝 Base Case 推进？

**递归转迭代的通用思路**：
1. 识别递归中的"栈"——将系统调用栈替换为显式栈（`list`）
2. 识别中的"状态变量"——将参数和局部变量放入栈帧结构体
3. 用 `while` 循环 + 栈操作替代递归调用

### 思考题

1. 不使用 `@lru_cache`，用字典实现 fib(100) 需要多少空间？迭代需要多少空间？
2. 汉诺塔 n=10 时总共需要多少步？n=20 呢？
3. 反转链表的递归和迭代实现有什么异同？
4. 哪些问题的递归是"必需"的（无法用迭代简洁实现）？
5. Python 的 `sys.setrecursionlimit(1000000)` 能解决栈溢出问题吗？有什么隐患？

### 扩展阅读

- *Structure and Interpretation of Computer Programs* (SICP) — Chapter 1: 递归与迭代的经典论述
- *Introduction to Algorithms* (CLRS) — Chapter 4: 分治策略与递推关系
- *The Little Schemer* — 以极简方式训练递归思维
- Python 官方文档: `sys.setrecursionlimit`、`functools.lru_cache`