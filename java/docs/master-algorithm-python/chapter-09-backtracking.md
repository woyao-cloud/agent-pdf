# 第9章 回溯算法

> **核心思想**：回溯算法（Backtracking）通过不断"选择→递归→撤销选择"的方式遍历所有可能的候选解，并在搜索过程中利用剪枝（Pruning）提前排除不可能通向合法解的分支。

回溯的本质是**深度优先搜索（DFS）** 在**决策树（Decision Tree）** 上的系统化遍历。它看似暴力，但借助剪枝往往能高效求解组合优化问题。

---

## 9.1 回溯算法基本思想

### 解决的问题

回溯适用于需要**枚举所有（或部分）候选解**的搜索与优化问题，典型特征：

- **多阶段决策**：问题的解由一系列决策组成，每个阶段有若干选项
- **约束满足**：存在约束条件，非法组合需要排除
- **解空间巨大**：穷举不可行，需要剪枝

**经典问题**：
- 排列 / 组合 / 子集生成
- N 皇后、数独（Sudoku）、填字游戏
- 图的着色（Graph Coloring）
- 括号生成（Generate Parentheses）
- 组合求和（Combination Sum）

### 实现原理

**决策树（Decision Tree）**：每个节点代表一个部分解，每条边代表一次决策，叶子节点代表完整的候选解。

回溯遵循**DFS + 状态撤销**的模式：

```
递归函数 backtrack(状态):
    如果 状态 是合法解:
        记录该解
        返回 (或继续搜索)

    对于 当前状态下的每个选择:
        如果 选择不违反约束:          ← 剪枝
            做出选择 (更新状态)        ← 前进一步
            backtrack(新状态)         ← 递归探索
            撤销选择 (恢复状态)        ← 回溯一步
```

**通过全排列** `[1,2,3]` **的决策树理解回溯**：

```
                         root (path=[])
                       /      |       \
          选择1       /        |         \  选择3
                    /         |           \
               [1]          [2]          [3]
             /    \        /    \        /   \
            /      \      /      \      /     \
         [1,2]   [1,3] [2,1]   [2,3] [3,1]  [3,2]
           |        |    |        |    |       |
         [1,2,3] [1,3,2] [2,1,3] [2,3,1] [3,1,2] [3,2,1]
```

回溯遍历到叶子 `[1,2,3]` 后，撤销 3 回到 `[1,2]`，再撤销 2 回到 `[1]`，然后选择 3 走向 `[1,3]`。

### 回溯 vs 其他算法

| 算法 | 特点 |
|------|------|
| **暴力枚举** | 列出所有可能，无剪枝。回溯是其系统化版本 |
| **DFS** | 回溯 = DFS + 状态撤销 + 剪枝 |
| **动态规划** | 依赖重叠子问题和最优子结构，回溯不依赖 |
| **分支限界** | 类似回溯，但用 BFS + 界限函数剪枝 |
| **贪心** | 每步选局部最优，不做后悔。回溯允许后悔 |

### 通用回溯框架

```python
from typing import List, Any

def backtrack(candidate: Any, path: List, result: List, constraints: Any) -> None:
    # 1. 判断是否找到合法解
    if is_solution(candidate):
        result.append(path[:])   # 深拷贝！
        return

    # 2. 生成候选下一步
    for choice in generate_choices(candidate, constraints):
        if not is_valid(choice, path, constraints):
            continue             # 剪枝

        # 3. 做出选择
        path.append(choice)
        # 4. 递归探索
        backtrack(choice, path, result, constraints)
        # 5. 撤销选择
        path.pop()
```

**关键细节**：
- `path[:]` 必须深拷贝，否则后续 `pop` 会修改已保存的结果
- 剪枝越早，搜索空间越小
- 选择顺序影响搜索效率（先试约束最强的选项）

### 使用场景

| 场景 | 问题规模 | 策略 |
|------|---------|------|
| 全排列 | n ≤ 10 | 无剪枝 |
| 子集生成 | n ≤ 30 | 选/不选决策 |
| N 皇后 | n ≤ 15 | 行列对角线约束 |
| 组合求和 | 目标和较小 | 排序 + 剪枝 |
| 数独 | 9×9 | 候选数约束 |
| 括号生成 | n ≤ 15 | 左右括号计数 |

### 潜在风险

| 风险 | 说明 |
|------|------|
| **组合爆炸** | n! 和 2ⁿ 增长极快，n 稍大就不可行 |
| **误剪枝** | 剪枝条件太强可能漏掉合法解 |
| **浅拷贝陷阱** | `result.append(path)` 保存的是引用 |
| **栈溢出** | 递归深度 = 解的长度，Python 默认约 1000 |

### 优化策略

1. **剪枝（Pruning）**：尽早排除不可能的分支，见 9.5 节
2. **对称性剪枝**：利用问题的对称性减少搜索
3. **启发式排序**：先试约束最强的选项（如数独中候选数最少的格）
4. **迭代加深（IDDFS）**：逐步放宽深度限制
5. **转换为迭代**：用显式栈替代递归，避免栈溢出

---

## 9.2 全排列与子集问题

### 9.2.1 全排列（Permutations）

**问题**：给定不含重复元素的数组 `nums`，返回所有可能的全排列。

**思路**：逐位选择未使用的数字，选择后标记已用。

```python
from typing import List

def permute(nums: List[int]) -> List[List[int]]:
    res = []
    used = [False] * len(nums)

    def backtrack(path: List[int]) -> None:
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            used[i] = False

    backtrack([])
    return res
```

**复杂度**：
- 时间复杂度：O(n · n!) — n! 个排列，每个 O(n) 复制
- 空间复杂度：O(n)（递归栈 + path + used 数组）

### 9.2.2 子集（Subsets）

**问题**：给定不含重复元素的数组 `nums`，返回所有可能的子集（幂集）。

**思路**：对每个元素做"选"或"不选"的二元决策。

```python
from typing import List

def subsets(nums: List[int]) -> List[List[int]]:
    res = []

    def backtrack(start: int, path: List[int]) -> None:
        res.append(path[:])           # 记录当前子集
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)    # 从 i+1 开始，避免重复
            path.pop()

    backtrack(0, [])
    return res
```

**复杂度**：
- 时间复杂度：O(n · 2ⁿ) — 2ⁿ 个子集，每个 O(n) 复制
- 空间复杂度：O(n)（递归栈深度 n）

**决策树**（`nums = [1,2,3]`，**仅聚焦两个分支**以保持可读性）：

```
                        []
                 ┌──────┴──────┐
               [1]              []
           ┌────┴────┐      ┌───┴───┐
        [1,2]        [1]   [2]      []
      ┌───┴───┐   ┌───┴───┐   ┌───┴───┐
   [1,2,3]  [1,2] [1,3]  [1] [2,3]  [2] [3] []
```

### 9.2.3 有重复元素的排列/子集

**问题**：输入可能包含重复元素，输出不能有重复排列/子集。

**核心技巧**：排序 + 同层跳过相同元素。

```python
from typing import List

def permute_unique(nums: List[int]) -> List[List[int]]:
    nums.sort()
    res = []
    used = [False] * len(nums)

    def backtrack(path: List[int]) -> None:
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            # 同层剪枝：相同元素只取第一个未用的
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            used[i] = False

    backtrack([])
    return res
```

```python
def subsets_with_dup(nums: List[int]) -> List[List[int]]:
    nums.sort()
    res = []

    def backtrack(start: int, path: List[int]) -> None:
        res.append(path[:])
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    return res
```

---

## 9.3 N 皇后问题

### 问题描述

N 皇后问题：在 N×N 的棋盘上放置 N 个皇后，使得任意两个皇后**不在同一行、同一列、同一对角线**。

### 实现原理

逐行放置，每行选一个列位置。约束检查：

- **列冲突**：该列已被占用
- **主对角线（\）冲突**：`row - col` 相同
- **副对角线（/）冲突**：`row + col` 相同

```
N=4 的合法解之一：
   0 1 2 3
 0 . Q . .
 1 . . . Q
 2 Q . . .
 3 . . Q .

对角线分析 - 皇后 (0,1)：
  row-col = -1 → 主对角线独占
  row+col =  1 → 副对角线独占
```

### 代码实现

```python
from typing import List

def solve_n_queens(n: int) -> List[List[str]]:
    cols = set()
    diag1 = set()   # row - col
    diag2 = set()   # row + col
    board = [["."] * n for _ in range(n)]
    res = []

    def backtrack(row: int) -> None:
        if row == n:
            res.append(["".join(r) for r in board])
            return
        for col in range(n):
            if col in cols or (row - col) in diag1 or (row + col) in diag2:
                continue
            # 放置皇后
            cols.add(col)
            diag1.add(row - col)
            diag2.add(row + col)
            board[row][col] = "Q"

            backtrack(row + 1)

            # 撤销皇后
            cols.remove(col)
            diag1.remove(row - col)
            diag2.remove(row + col)
            board[row][col] = "."

    backtrack(0)
    return res
```

**复杂度**：
- 时间复杂度：O(n!) — 最坏情况，但剪枝后远小于 n!
- 空间复杂度：O(n)

### N=4 的搜索树（部分）

```
row=0:  ┌─Q──┬────┬────┬────┐   尝试 col=0 → Q 放在 (0,0)
        │    │    │   Q│    │   下一步 row=1: col=3 合法 → Q 在 (1,3)
        │ Q  │    │    │    │   再下一步 row=2: 无合法列 → 回溯
        │    │    │    │    │
        └────┴────┴────┴────┘
                ↓ (回溯到 row=1)
row=0:  ┌─Q──┬────┬────┬────┐   
        │    │ Q  │    │    │   row=1: col=1 → Q 在 (1,1)
        │    │    │   Q│    │   row=2: col=3 → Q 在 (2,3)
        │    │   Q│    │    │   row=3: col=1 → Q 在 (3,1) ✓ 找到解
        └────┴────┴────┴────┘
```

---

## 9.4 组合求和与排列组合

### 9.4.1 组合求和（Combination Sum）

**问题**：给定无重复元素的数组 `candidates` 和目标值 `target`，找出所有和为 target 的组合（每个元素可用无限次）。

**思路**：排序后回溯，当前和超过 target 时剪枝。

```python
from typing import List

def combination_sum(candidates: List[int], target: int) -> List[List[int]]:
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:        # 剪枝：剩余值不够
                break
            path.append(val)
            backtrack(i, path, remaining - val)  # 可重复使用 i
            path.pop()

    backtrack(0, [], target)
    return res
```

**变体：每个元素只能用一次**（Combination Sum II）：

```python
def combination_sum2(candidates: List[int], target: int) -> List[List[int]]:
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:
                break
            if i > start and candidates[i] == candidates[i - 1]:
                continue               # 同层去重
            path.append(val)
            backtrack(i + 1, path, remaining - val)  # i+1: 不重复使用
            path.pop()

    backtrack(0, [], target)
    return res
```

### 9.4.2 有约束的排列

**问题**：生成所有长度为 n 的排列，但满足某些约束（如相邻数字之差为奇数）。

```python
from typing import List

def permute_with_constraint(n: int) -> List[List[int]]:
    nums = list(range(1, n + 1))
    res = []
    used = [False] * n

    def backtrack(path: List[int]) -> None:
        if len(path) == n:
            res.append(path[:])
            return
        for i in range(n):
            if used[i]:
                continue
            # 约束：相邻数字之差为奇数
            if path and (nums[i] - path[-1]) % 2 == 0:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            used[i] = False

    backtrack([])
    return res
```

**搜索树示意**（n=3，约束：相邻差为奇数）：

```
                []
              / | \
         [1]  [2]  [3]
         /    / \    \
      [1,2] [2,1] [2,3] [3,2]
       /     /       \     \
   [1,2,3] [2,1,3] [2,3,1] [3,2,1]
```

- `[1,3,2]` 被剪枝：1→3 差为偶数
- `[3,1,2]` 被剪枝：3→1 差为偶数

### 使用场景

| 问题 | 特点 | 剪枝策略 |
|------|------|---------|
| Combination Sum | 元素可重用 | 排序 + 超值剪枝 |
| Combination Sum II | 元素唯一 | 排序 + 同层去重 |
| 括号生成 | 左右括号计数约束 | 右括号 ≤ 左括号 |
| 电话号码字母组合 | 固定映射 | 无剪枝（所有路径合法） |
| 有约束排列 | 自定义约束 | 约束不满足时跳过 |

---

## 9.5 剪枝优化

### 剪枝的分类

**剪枝（Pruning）** 指在搜索过程中提前判定某分支不可能产生合法解（或更优解），从而跳过该分支的进一步探索。

| 类型 | 描述 | 示例 |
|------|------|------|
| **可行性剪枝** | 当前部分解不可能扩展为合法解 | 组合求和超值 |
| **最优性剪枝** | 当前分支不可能优于已知最优解 | 旅行商问题（TSP） |
| **对称性剪枝** | 利用结构对称性消除等价分支 | N 皇后旋转对称 |
| **重复性剪枝** | 避免相同状态的重复搜索 | 有重复元素的排列 |

### 9.5.1 可行性剪枝（Feasibility Pruning）

最简单的剪枝形式：一旦确定当前路径"不可能"达成目标，立即回溯。

```python
# 组合求和中的可行性剪枝
def combination_sum_pruned(candidates: List[int], target: int) -> List[List[int]]:
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:        # ← 可行性剪枝
                break                  # 排序后，后续更大，直接结束循环
            path.append(val)
            backtrack(i, path, remaining - val)
            path.pop()

    backtrack(0, [], target)
    return res
```

**可视化剪枝效果**（`candidates=[2,3,6,7]`, `target=7`）：

```
搜索空间（无剪枝）:                          搜索空间（有剪枝）:
                                       [ ]
                 [ ]                   ├──2 → [2]
     ┌─────┬─────┼─────┬─────┐        │    ├──2 → [2,2]
   [2]   [3]   [6]   [7]              │    │    └──2 → [2,2,2]
     │     │     │     │              │    │        └──2 → 8>7 ✗
   [2,2] [3,3] [6,6] [7,7]           │    │    └──3 → [2,2,3]=7 ✓
     │     │                          │    ├──3 → [2,3]
   [2,2,2][3,3,3]                     │    │    └──2 → 7=7 ✓
     │                                │    └──6 → 8>7 ✗
   [2,2,2,2] → 8 > 7 ✗               ├──3 → [3]
     │                                │    └──3 → [3,3]
[2,2,2,3] → 9 > 7 ✗                  │         └──3 → 9>7 ✗
     ... 大量无效分支                 ├──6 → 8>7 ✗
                                      └──7 → [7]=7 ✓
```

### 9.5.2 最优性剪枝（Optimality Pruning）

用于**优化问题**（而非满足性问题）。维护当前最优解，如果当前部分解即使完美填充也不可能超过最优值，则剪枝。

```python
# 0/1 背包的回溯解法 + 最优性剪枝
def knapsack_backtrack(weights: List[int], values: List[int], capacity: int) -> int:
    n = len(weights)
    best = 0

    def backtrack(idx: int, curr_weight: int, curr_value: int) -> None:
        nonlocal best
        if idx == n:
            best = max(best, curr_value)
            return

        # 最优性剪枝：剩余物品全部选上（上界估计）
        # 如果仍然不超过 best，剪枝
        remaining = sum(values[idx:])       # 实际中最优上界更复杂
        if curr_value + remaining <= best:
            return

        # 不选当前物品
        backtrack(idx + 1, curr_weight, curr_value)

        # 选当前物品（如果放得下）
        if curr_weight + weights[idx] <= capacity:
            backtrack(idx + 1, curr_weight + weights[idx], curr_value + values[idx])

    backtrack(0, 0, 0)
    return best
```

### 9.5.3 对称性剪枝（Symmetry Pruning）

利用问题的对称性减少搜索。N 皇后的旋转/镜像对称就是典型例子。

**简化示例**：在排列中固定第一个元素，消除旋转对称。

```python
# 圆排列问题：n 个人围成一圈，有多少种排列？
# 消除旋转对称：固定第一个人
def circular_permutations(n: int) -> List[List[int]]:
    nums = list(range(1, n + 1))
    res = []
    used = [False] * n
    used[0] = True  # 固定第一个元素，消除旋转对称
    path = [nums[0]]

    def backtrack():
        if len(path) == n:
            res.append(path[:])
            return
        for i in range(1, n):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return res
```

### 9.5.4 重复性剪枝（Duplicates Pruning）

输入包含重复元素时，通过**排序 + 同层跳过**避免生成重复结果（已在 9.2.3 节详细演示）。

**核心规则**：
```
if i > start and nums[i] == nums[i - 1]:
    continue
```
- `start` 是当前的起始索引（同层的起点）
- 同层中相同值只取第一个，后续跳过

### 剪枝效果对比

| 问题 | n | 无剪枝 | 有剪枝 | 加速比 |
|-----|---|--------|--------|-------|
| 全排列 | 8 | 40320 | 40320 | 1×（无剪枝空间） |
| 组合求和 | 10+target=20 | 指数级 | ~200 | 极大 |
| N 皇后 | 12 | ~4.8 亿 | ~14.3 万 | ~3350× |
| 有重复排列 | 8 (含重复) | 40320 | ~5000 | ~8× |

### 剪枝策略选择

| 场景 | 推荐剪枝 |
|------|---------|
| 组合求和 / 子集和 | 排序 + 可行性剪枝 + 重复性剪枝 |
| N 皇后 | 列/对角线约束 + 对称性剪枝 |
| 排列生成（有重复） | 重复性剪枝（同层跳过） |
| 0/1 背包 / TSP | 最优性剪枝（上界估计） |
| 数独 | 候选数最少优先 + 约束传播 |
| 图着色 | 最大度优先 + 颜色下界 |

---

## 本章总结

### 关键概念

| 概念 | 要点 |
|------|------|
| **回溯** | 系统性搜索决策树的 DFS + 状态撤销 |
| **决策树** | 节点=部分解，边=选择，叶子=完整解 |
| **剪枝** | 提前排除不可能分支——可行性、最优性、对称性、重复性 |
| **排列** | 顺序重要，n! 复杂度 |
| **组合** | 顺序不重要，C(n,k) 复杂度 |
| **子集** | 每个元素选/不选，2ⁿ 复杂度 |
| **去重** | 排序 + 同层跳过相同元素 |

### 思维框架

**写回溯的四步法**：

1. **定义状态**：当前 path（已做选择）、剩余选项、约束条件
2. **定义终止条件**：什么时候到达叶子节点（找到完整解）
3. **生成选择列表**：当前步骤可选的所有合法选项
4. **剪枝条件**：哪些选项一定不可能通向合法解，直接跳过

**回溯的三大要素**：
```
backtrack(状态):
    if 终止条件 → 记录解
    for 每个选择:
        if 剪枝条件 → continue
        做选择 → 递归 → 撤销选择
```

### 思考题

1. 全排列问题中，用 `path[:]` 和 `path` 保存结果有什么区别？
2. N 皇后问题能否在 O(1) 时间内判断对角线冲突？set 实现是否可以优化？
3. Combination Sum II 中，为什么要排序？不排序能否去重？
4. 最优性剪枝的核心挑战是什么——如何估计上界？
5. 从全排列到圆排列（旋转视为相同），剪枝了多少比例的分支？

### 扩展阅读

- *The Art of Computer Programming* Vol.4 (Knuth) — 组合搜索与回溯的权威论述
- *Algorithms* (Sedgewick & Wayne) — Chapter 4: 回溯在图论中的应用
- *Algorithm Design* (Kleinberg & Tardos) — Chapter 10: 扩展回溯与分支限界
- Python `itertools` 模块: `permutations`、`combinations`、`product` 是回溯的标准库实现