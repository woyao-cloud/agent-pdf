"""
demo_nqueens.py — N 皇后问题的回溯解法与棋盘可视化

配合第9章"回溯算法"之 9.3（N皇后问题）使用。

演示内容：
  1. 标准 N 皇后解法（所有解）
  2. 单解快速求解（最早找到的一个解）
  3. 棋盘可视化（终端文本输出）
  4. 解的数量统计
"""

from typing import List, Optional


# ============================================================
# N 皇后 — 标准回溯（所有解）
# ============================================================

def solve_n_queens(n: int) -> List[List[str]]:
    """
    N 皇后 — 返回所有合法棋盘布局。

    使用 set 实现 O(1) 对角线冲突检测。
    时间复杂度: O(n!) 最坏，实际远小于 n!
    空间复杂度: O(n)
    """
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


# ============================================================
# N 皇后 — 只找一个解（首次命中即返回）
# ============================================================

def solve_n_queens_one(n: int) -> Optional[List[str]]:
    """
    N 皇后 — 只返回第一个找到的解。
    适合大 N 快速验证。
    """
    cols = set()
    diag1 = set()
    diag2 = set()
    board = [["."] * n for _ in range(n)]

    def backtrack(row: int) -> bool:
        if row == n:
            return True
        for col in range(n):
            if col in cols or (row - col) in diag1 or (row + col) in diag2:
                continue
            cols.add(col)
            diag1.add(row - col)
            diag2.add(row + col)
            board[row][col] = "Q"

            if backtrack(row + 1):
                return True

            cols.remove(col)
            diag1.remove(row - col)
            diag2.remove(row + col)
            board[row][col] = "."

        return False

    if backtrack(0):
        return ["".join(r) for r in board]
    return None


# ============================================================
# N 皇后 — 整数棋盘表示（行列号，适合大 N）
# ============================================================

def solve_n_queens_int(n: int) -> List[List[int]]:
    """
    N 皇后 — 返回整数表示 [col_of_row_0, col_of_row_1, ...]。
    比字符串棋盘更省空间，适合统计解的数量。
    """
    cols = set()
    diag1 = set()
    diag2 = set()
    res = []

    def backtrack(row: int, placement: List[int]) -> None:
        if row == n:
            res.append(placement[:])
            return
        for col in range(n):
            if col in cols or (row - col) in diag1 or (row + col) in diag2:
                continue
            cols.add(col)
            diag1.add(row - col)
            diag2.add(row + col)
            placement.append(col)

            backtrack(row + 1, placement)

            placement.pop()
            cols.remove(col)
            diag1.remove(row - col)
            diag2.remove(row + col)

    backtrack(0, [])
    return res


# ============================================================
# 棋盘可视化
# ============================================================

def print_board(board: List[str], title: str = "") -> None:
    """
    在终端打印 N 皇后棋盘。

    Q = 皇后
    . = 空格
    行列标号辅助阅读。
    """
    if title:
        print(f"\n{title}")

    n = len(board)

    # 列标号
    print(f"    ", end="")
    for col in range(n):
        print(f" {col} ", end="")
    print()

    # 上边框
    print(f"   ┌" + "───┬" * (n - 1) + "───┐")

    for row in range(n):
        # 行内容
        print(f" {row} │", end="")
        for col in range(n):
            ch = board[row][col]
            if ch == "Q":
                print(f" \033[91mQ\033[0m │", end="")   # 红色皇后
            else:
                print(f"   │", end="")
        print(f" {row}")

        # 行分隔线
        if row < n - 1:
            print(f"   ├" + "───┼" * (n - 1) + "───┤")

    # 下边框
    print(f"   └" + "───┴" * (n - 1) + "───┘")

    # 列标号
    print(f"    ", end="")
    for col in range(n):
        print(f" {col} ", end="")
    print()


def print_board_int(placement: List[int], title: str = "") -> None:
    """从整数表示打印棋盘"""
    n = len(placement)
    board = [["."] * n for _ in range(n)]
    for row, col in enumerate(placement):
        board[row][col] = "Q"
    print_board(["".join(r) for r in board], title)


# ============================================================
# 工具函数：对角线分析显示
# ============================================================

def show_diagonals(n: int, row: int, col: int) -> None:
    """显示某个位置上两条对角线的覆盖范围"""
    print(f"\n位置 ({row},{col}) 的对角线分析：")
    print(f"  主对角线 (row - col = {row - col})：", end="")
    for r in range(n):
        c = r - (row - col)
        if 0 <= c < n:
            print(f"({r},{c}) ", end="")
    print()

    print(f"  副对角线 (row + col = {row + col})：", end="")
    for r in range(n):
        c = (row + col) - r
        if 0 <= c < n:
            print(f"({r},{c}) ", end="")
    print()

    # 棋盘标注
    print(f"\n  棋盘标注（D1=主对角线威胁, D2=副对角线威胁, Q=当前皇后）：")
    print(f"      ", end="")
    for c in range(n):
        print(f" {c} ", end="")
    print()
    for r in range(n):
        print(f"   {r}  ", end="")
        for c in range(n):
            if r == row and c == col:
                print(" Q ", end="")
            elif r - c == row - col:
                print(" D1", end="")
            elif r + c == row + col:
                print(" D2", end="")
            else:
                print(" . ", end="")
        print()


# ============================================================
# 统计 N 皇后解的数量
# ============================================================

def count_n_queens_solutions(max_n: int = 12) -> None:
    """统计 n=1 到 max_n 的解的数量"""
    print(f"\n{'=' * 72}")
    print("N 皇后解的数量统计")
    print(f"{'=' * 72}")
    print(f"{'n':>4} {'解的数量':>16} {'时间 (ms)':>12}")
    print(f"{'-' * 36}")
    for n in range(1, max_n + 1):
        import time
        start = time.perf_counter()
        solutions = solve_n_queens_int(n)
        elapsed = time.perf_counter() - start
        print(f"{n:>4} {len(solutions):>16,} {elapsed * 1000:>12.3f}")


# ============================================================
# 演示
# ============================================================

def main():
    print("=" * 72)
    print("N 皇后问题 — 回溯算法演示")
    print("=" * 72)

    # ---- 1. N=4 所有解 ----
    n = 4
    solutions = solve_n_queens(n)
    print(f"\nN = {n} 的所有解（共 {len(solutions)} 个）：")
    for idx, board in enumerate(solutions):
        print_board(board, f"  解 #{idx + 1}")

    # ---- 2. 显示对角线分析 ----
    print(f"\n{'=' * 72}")
    print("对角线分析示例（N=4, 皇后在 (0,1)）")
    print(f"{'=' * 72}")
    show_diagonals(4, 0, 1)

    # ---- 3. N=8 单解 ----
    print(f"\n{'=' * 72}")
    print("N = 8 — 第一个解")
    print(f"{'=' * 72}")
    one_solution = solve_n_queens_one(8)
    if one_solution:
        print_board(one_solution, "N=8 的一个解")

    # ---- 4. N=8 整数表示 ----
    print(f"\n{'=' * 72}")
    print("N = 8 — 整数表示（每行皇后所在列）")
    print(f"{'=' * 72}")
    int_solutions = solve_n_queens_int(8)
    print(f"总解数: {len(int_solutions)}")
    print(f"前 3 个解: ")
    for i in range(min(3, len(int_solutions))):
        print(f"  #{i+1}: {int_solutions[i]}")
        print_board_int(int_solutions[i], f"  对应棋盘:")

    # ---- 5. 解的数量统计 ----
    count_n_queens_solutions(12)

    # ---- 6. 快速验证大 N ----
    print(f"\n{'=' * 72}")
    print("大 N 快速验证（只找第一个解）")
    print(f"{'=' * 72}")
    for n in [10, 15, 20]:
        import time
        start = time.perf_counter()
        sol = solve_n_queens_one(n)
        elapsed = time.perf_counter() - start
        status = "找到" if sol else "未找到"
        print(f"  N={n}: {status}解, 耗时 {elapsed * 1000:.2f} ms")
        if sol:
            placement = [row.index("Q") for row in sol]
            print(f"    皇后列位置: {placement}")


if __name__ == "__main__":
    main()

"""
运行示例输出（节选）：

==================================================================
N = 4 的所有解（共 2 个）：

  解 #1
     0   1   2   3
   ┌───┬───┬───┬───┐
 0 │ . │ Q │ . │ . │ 0
   ├───┼───┼───┼───┤
 1 │ . │ . │ . │ Q │ 1
   ├───┼───┼───┼───┤
 2 │ Q │ . │ . │ . │ 2
   ├───┼───┼───┼───┤
 3 │ . │ . │ Q │ . │ 3
   └───┴───┴───┴───┘
     0   1   2   3
"""