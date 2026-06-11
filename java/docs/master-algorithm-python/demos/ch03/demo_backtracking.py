r"""
demo_backtracking.py — 全排列生成：回溯法 + 剪枝可视化

配合第3章"算法思维模式"之 3.4 回溯法使用。

核心框架：
  backtrack(当前路径, 剩余选择):
    1. 如果路径长度 = 目标长度 → 记录结果 (到达叶子节点)
    2. 遍历所有剩余选择:
       a. 剪枝：若不满足约束则跳过
       b. 做选择：将选择加入路径
       c. 递归：backtrack(路径, 剩余选择 - 选择)
       d. 撤销选择：从路径中移除（回溯）

回溯树可视化（以 [1,2,3] 为例）：

                    []
          /          |          \
       [1]          [2]          [3]
      /   \        /   \        /   \
   [1,2] [1,3]  [2,1] [2,3]  [3,1] [3,2]
    |     |      |     |      |     |
  [1,2,3] [1,3,2] [2,1,3] [2,3,1] [3,1,2] [3,2,1]

树中每条根到叶子的路径就是一个排列，共 n! 个叶子节点。

剪枝场景（以 N-Queens 为例）：
  列重复剪枝: 同一列已有皇后
  对角线剪枝: 主/副对角线已有皇后
"""

from typing import List, Any


# ============================================================
# 基本回溯：生成全排列（无剪枝版本）
# ============================================================
def permutations_backtrack(items: List[Any]) -> List[List[Any]]:
    """
    生成 items 的所有全排列。

    回溯过程：
    ┌─────────────────────────────────────────────┐
    │  ① 选择：从剩余元素中取一个加入当前路径       │
    │  ② 递归：继续生成剩下的排列                  │
    │  ③ 回溯：撤销选择，尝试下一个元素             │
    └─────────────────────────────────────────────┘
    """
    result = []
    path = []                  # 当前路径（已选择的元素）
    used = [False] * len(items)  # 标记已使用的元素

    def backtrack():
        # 结束条件：所有元素都已使用
        if len(path) == len(items):
            result.append(path[:])  # 复制一份当前路径
            return

        for i in range(len(items)):
            if used[i]:
                continue            # 剪枝：跳过已使用的元素

            # 做选择
            path.append(items[i])
            used[i] = True

            # 打印当前选择
            indent = "  " * len(path)
            print(f"{indent}选择 {items[i]} → path={path}")

            # 递归进入下一层
            backtrack()

            # 撤销选择（回溯）
            path.pop()
            used[i] = False
            print(f"{indent}回溯 {items[i]} → path={path}")

    print(f"开始回溯生成 {items} 的全排列：")
    print("=" * 50)
    backtrack()
    print("=" * 50)
    return result


# ============================================================
# 带剪枝的回溯：生成不重复排列（处理重复元素）
# ============================================================
def permutations_unique(items: List[Any]) -> List[List[Any]]:
    """
    生成全排列，并处理重复元素（去重剪枝）。

    剪枝策略：
    - 同层剪枝: 如果当前元素与前一个元素相同，且前一个元素
      尚未使用（在同层被回溯了），则跳过当前分支。
    """
    items_sorted = sorted(items)  # 排序以方便去重
    result = []
    path = []
    used = [False] * len(items_sorted)

    def backtrack():
        if len(path) == len(items_sorted):
            result.append(path[:])
            return

        for i in range(len(items_sorted)):
            if used[i]:
                continue

            # 剪枝：去重
            # 如果当前元素与前一个相同，且前一个尚未使用，跳过
            if i > 0 and items_sorted[i] == items_sorted[i - 1] and not used[i - 1]:
                continue

            path.append(items_sorted[i])
            used[i] = True
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result


# ============================================================
# 约束剪枝演示：N-Queens 问题骨架（配合章节 3.4 的 N-Queens 说明）
# ============================================================
def solve_n_queens(n: int) -> List[List[int]]:
    """
    N-Queens 问题的回溯解法。

    每个解用列表表示，board[i] = 第 i 行的皇后在第几列。

    剪枝条件：
    - 列冲突：board[i] == col（同一列已有皇后）
    - 主对角线冲突：board[i] - i == col - row
    - 副对角线冲突：board[i] + i == col + row
    """
    result = []
    board = []  # board[row] = col

    def is_safe(row: int, col: int) -> bool:
        for r, c in enumerate(board):
            if c == col or c - r == col - row or c + r == col + row:
                return False
        return True

    def backtrack(row: int):
        if row == n:
            result.append(board[:])
            return

        for col in range(n):
            if not is_safe(row, col):
                continue  # 剪枝：不安全的列

            # 做选择
            board.append(col)
            # 递归
            backtrack(row + 1)
            # 撤销选择（回溯）
            board.pop()

    backtrack(0)
    return result


def print_n_queens(solution: List[int]):
    """打印 N-Queens 的解为棋盘"""
    n = len(solution)
    for row in range(n):
        line = ["Q" if col == solution[row] else "."
                for col in range(n)]
        print(f"    {' '.join(line)}")


# ============================================================
# 回溯过程可视化（详细版 - 显示搜索树和剪枝）
# ============================================================
def permutations_verbose(items: List[Any]) -> List[List[Any]]:
    """
    全排列生成（带详细的树形可视化输出）。
    展示回溯的"选择→递归→回溯"全过程。
    """
    result = []
    path = []
    used = [False] * len(items)
    node_count = [0]  # 跟踪节点数

    def backtrack(depth: int):
        node_count[0] += 1
        prefix = "  " * depth

        if len(path) == len(items):
            print(f"{prefix}[OK] 到达叶子: {path[:]}")
            result.append(path[:])
            return

        for i in range(len(items)):
            if used[i]:
                print(f"{prefix}  [X] 跳过 {items[i]}（已使用）")
                continue

            # 做选择
            path.append(items[i])
            used[i] = True
            print(f"{prefix}→ 选择 {items[i]}, path={path}")

            # 递归
            backtrack(depth + 1)

            # 回溯
            path.pop()
            used[i] = False
            print(f"{prefix}← 回溯 {items[i]}, path={path}")

    print(f"\n回溯搜索树 (items={items}):")
    print(f"{'─' * 50}")
    backtrack(0)
    print(f"{'─' * 50}")
    print(f"共探索 {node_count[0]} 个节点，找到 {len(result)} 个排列")

    return result


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 70)
    print("回溯法演示 - 全排列生成")
    print("=" * 70)

    # 测试 1: 基本全排列（带过程显示）
    print("\n>>> 测试 1: 标准全排列 [1, 2, 3]")
    result = permutations_backtrack([1, 2, 3])
    print(f"结果: {result}")
    print(f"排列数: {len(result)}（预期 3! = 6）")

    # 测试 2: 带重复元素的去重排列
    print(f"\n>>> 测试 2: 去重排列 [1, 1, 2]")
    result_unique = permutations_unique([1, 1, 2])
    print(f"结果: {result_unique}")
    print(f"排列数: {len(result_unique)}（预期 3! / 2! = 3）")

    # 测试 3: 详细可视化版本
    print(f"\n>>> 测试 3: 详细回溯过程 [A, B]")
    permutations_verbose(["A", "B"])

    # 测试 4: N-Queens (n=4)
    print(f"\n>>> 测试 4: 4-Queens 问题")
    queens = solve_n_queens(4)
    print(f"共找到 {len(queens)} 个解")
    for i, solution in enumerate(queens):
        print(f"\n解 {i + 1}: {solution}")
        print_n_queens(solution)

    # 正确性验证
    print(f"\n{'=' * 70}")
    print("正确性验证")
    print("=" * 70)

    import itertools
    items = [1, 2, 3]
    expected = sorted([list(p) for p in itertools.permutations(items)])
    actual = sorted(permutations_backtrack(items) if False else [])  # 避免重复调用

    # 重新跑一次正确的比较
    result = sorted(permutations_backtrack(items))
    expected.sort()
    status = "[OK]" if result == expected else "[FAIL]"
    print(f"全排列正确性: {status}")


if __name__ == "__main__":
    _test()