"""
demo_knapsack.py — 背包问题 DP 演示

配合第7章"动态规划"之 7.3（经典问题）和 7.4（状态压缩）使用。

演示内容：
  1. 0/1 Knapsack: 2D DP 表格可视化
  2. 0/1 Knapsack: 空间优化到 1D DP（倒序遍历）
  3. 0/1 Knapsack: 回溯选择的物品
  4. Complete Knapsack: 无限物品版本（正序遍历）
  5. Complete Knapsack: 空间优化到 1D DP
"""

from typing import List, Tuple


# ============================================================
# 0/1 Knapsack — 2D DP
# ============================================================
def knapsack_01_2d(weights: List[int], values: List[int], capacity: int) -> Tuple[int, List[int]]:
    """
    0/1 背包 — 2D DP 表格。

    状态：dp[i][w] = 前 i 个物品中，容量为 w 的最大价值
    转移：dp[i][w] = max(dp[i-1][w], dp[i-1][w-w_i] + v_i)

    返回：(最大价值, 选中物品索引列表)
    """
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        w_i, v_i = weights[i - 1], values[i - 1]
        for w in range(capacity + 1):
            if w_i > w:
                dp[i][w] = dp[i - 1][w]
            else:
                dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - w_i] + v_i)

    # 回溯选中的物品
    selected = []
    w = capacity
    for i in range(n, 0, -1):
        if dp[i][w] != dp[i - 1][w]:
            selected.append(i - 1)
            w -= weights[i - 1]
    selected.reverse()

    return dp[n][capacity], selected


# ============================================================
# 0/1 Knapsack — 1D DP 空间优化
# ============================================================
def knapsack_01_1d(weights: List[int], values: List[int], capacity: int) -> Tuple[int, List[int]]:
    """
    0/1 背包 — 1D DP（滚动数组）。

    容量倒序遍历，确保每个物品只选一次。
    dp[w] = max(dp[w], dp[w - w_i] + v_i)
    """
    n = len(weights)
    dp = [0] * (capacity + 1)
    # 记录选择路径（用于回溯）
    choice = [[-1] * (capacity + 1) for _ in range(n)]

    for i in range(n):
        w_i, v_i = weights[i], values[i]
        for w in range(capacity, w_i - 1, -1):  # 倒序！
            if dp[w - w_i] + v_i > dp[w]:
                dp[w] = dp[w - w_i] + v_i
                choice[i][w] = 1

    # 回溯
    selected = []
    w = capacity
    for i in range(n - 1, -1, -1):
        if choice[i][w] == 1:
            selected.append(i)
            w -= weights[i]
    selected.reverse()

    return dp[capacity], selected


# ============================================================
# Complete Knapsack — 2D DP
# ============================================================
def knapsack_complete_2d(weights: List[int], values: List[int], capacity: int) -> Tuple[int, List[int]]:
    """
    完全背包 — 2D DP。

    状态：dp[i][w] = 前 i 个物品（每种无限），容量为 w 的最大价值
    转移：dp[i][w] = max(dp[i-1][w], dp[i][w-w_i] + v_i)
                     ↑ 注意是 dp[i]，不是 dp[i-1]！

    返回：(最大价值, 选中物品索引列表)
    """
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        w_i, v_i = weights[i - 1], values[i - 1]
        for w in range(capacity + 1):
            if w_i > w:
                dp[i][w] = dp[i - 1][w]
            else:
                dp[i][w] = max(dp[i - 1][w], dp[i][w - w_i] + v_i)

    # 回溯
    selected = []
    w = capacity
    i = n
    while i > 0 and w > 0:
        w_i, v_i = weights[i - 1], values[i - 1]
        if w >= w_i and dp[i][w] == dp[i][w - w_i] + v_i:
            selected.append(i - 1)
            w -= w_i
        else:
            i -= 1
    selected.reverse()

    return dp[n][capacity], selected


# ============================================================
# Complete Knapsack — 1D DP 空间优化
# ============================================================
def knapsack_complete_1d(weights: List[int], values: List[int], capacity: int) -> int:
    """
    完全背包 — 1D DP。

    容量正序遍历，允许同一物品被多次选取。
    dp[w] = max(dp[w], dp[w - w_i] + v_i)
    """
    dp = [0] * (capacity + 1)

    for i in range(len(weights)):
        w_i, v_i = weights[i], values[i]
        for w in range(w_i, capacity + 1):  # 正序！
            dp[w] = max(dp[w], dp[w - w_i] + v_i)

    return dp[capacity]


# ============================================================
# 打印 DP 表格（用于演示）
# ============================================================
def _print_dp_table(dp: List[List[int]], weights: List[int], values: List[int]):
    """打印 2D DP 表格（格式化输出）"""
    n = len(dp) - 1
    cap = len(dp[0]) - 1

    print(f"{'':>4}", end="")
    for w in range(cap + 1):
        print(f"{w:>4}", end="")
    print()

    for i in range(n + 1):
        if i == 0:
            print(f"{'0':>4}", end="")
        else:
            print(f"{i}(w{weights[i-1]},v{values[i-1]})", end="")
        for w in range(cap + 1):
            print(f"{dp[i][w]:>4}", end="")
        print()
    print()


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("背包问题 DP 演示")
    print("=" * 72)

    # ---- 测试用例 ----
    weights = [2, 1, 3, 2]
    values = [3, 2, 4, 2]
    capacity = 5

    print(f"\n物品: {list(zip(weights, values))}")
    print(f"容量: {capacity}")
    print()

    # ---- 1. 0/1 Knapsack 2D ----
    print("-" * 72)
    print("1. 0/1 Knapsack — 2D DP")
    print("-" * 72)

    n, cap = len(weights), capacity
    dp = [[0] * (cap + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w_i, v_i = weights[i - 1], values[i - 1]
        for w in range(cap + 1):
            if w_i > w:
                dp[i][w] = dp[i - 1][w]
            else:
                dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - w_i] + v_i)

    print(f"\nDP 表格（行=物品，列=容量）：")
    _print_dp_table(dp, weights, values)

    # ---- 2. 0/1 Knapsack 1D + 回溯 ----
    print("-" * 72)
    print("2. 0/1 Knapsack — 1D DP 空间优化（含回溯）")
    print("-" * 72)

    max_val, selected = knapsack_01_1d(weights, values, capacity)
    print(f"最大价值: {max_val}")
    print(f"选中物品索引: {selected}")
    print(f"选中物品 (wt, val): {[(weights[i], values[i]) for i in selected]}")
    print(f"总重量: {sum(weights[i] for i in selected)} / {capacity}")

    # ---- 3. 完全背包 2D ----
    print("-" * 72)
    print("3. Complete Knapsack — 2D DP")
    print("-" * 72)

    n, cap = len(weights), capacity
    dp_comp = [[0] * (cap + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w_i, v_i = weights[i - 1], values[i - 1]
        for w in range(cap + 1):
            if w_i > w:
                dp_comp[i][w] = dp_comp[i - 1][w]
            else:
                dp_comp[i][w] = max(dp_comp[i - 1][w], dp_comp[i][w - w_i] + v_i)

    print(f"\nDP 表格（完全背包）：")
    _print_dp_table(dp_comp, weights, values)

    cmp_val, cmp_sel = knapsack_complete_2d(weights, values, capacity)
    print(f"最大价值: {cmp_val}")
    print(f"选中物品索引: {cmp_sel}")
    print(f"选中物品 (wt, val): {[(weights[i], values[i]) for i in cmp_sel]}")

    # ---- 4. 空间优化对比 ----
    print("-" * 72)
    print("4. 空间优化对比")
    print("-" * 72)

    val_01_2d, sel_01 = knapsack_01_2d(weights, values, capacity)
    val_01_1d, _ = knapsack_01_1d(weights, values, capacity)
    val_comp_2d, _ = knapsack_complete_2d(weights, values, capacity)
    val_comp_1d = knapsack_complete_1d(weights, values, capacity)

    ok_01 = "OK" if val_01_2d == val_01_1d else "FAIL"
    ok_comp = "OK" if val_comp_2d == val_comp_1d else "FAIL"
    print(f"\n{'背包类型':<20} {'2D 结果':<12} {'1D 结果':<12} {'一致?':<8}")
    print(f"{'-' * 56}")
    print(f"{'0/1 Knapsack':<20} {val_01_2d:<12} {val_01_1d:<12} {ok_01:<8}")
    print(f"{'Complete Knapsack':<20} {val_comp_2d:<12} {val_comp_1d:<12} {ok_comp:<8}")

    # ---- 5. 容量遍历方向的影响 ----
    print("-" * 72)
    print("5. 容量遍历方向的影响（演示为何 0/1 要倒序，完全要正序）")
    print("-" * 72)

    demo_weights = [1, 2]
    demo_values = [2, 3]
    demo_cap = 4

    print(f"\n物品: {list(zip(demo_weights, demo_values))}, 容量: {demo_cap}")
    print()

    # 模拟 0/1 背包正序遍历会出什么问题
    dp_wrong = [0] * (demo_cap + 1)
    print("0/1 背包 —— 如果错误地用正序遍历容量：")
    for i in range(len(demo_weights)):
        w_i, v_i = demo_weights[i], demo_values[i]
        print(f"  物品{i}(wt={w_i},val={v_i}): ", end="")
        for w in range(w_i, demo_cap + 1):
            old = dp_wrong[w]
            dp_wrong[w] = max(dp_wrong[w], dp_wrong[w - w_i] + v_i)
            if dp_wrong[w] != old:
                print(f"dp[{w}]:{old}→{dp_wrong[w]}  ", end="")
        print()
    print(f"  结果（错误）: dp = {dp_wrong}（物品被多次选取！）")
    print()

    dp_correct = [0] * (demo_cap + 1)
    print("0/1 背包 —— 正确的倒序遍历：")
    for i in range(len(demo_weights)):
        w_i, v_i = demo_weights[i], demo_values[i]
        print(f"  物品{i}(wt={w_i},val={v_i}): ", end="")
        for w in range(demo_cap, w_i - 1, -1):
            old = dp_correct[w]
            dp_correct[w] = max(dp_correct[w], dp_correct[w - w_i] + v_i)
            if dp_correct[w] != old:
                print(f"dp[{w}]:{old}→{dp_correct[w]}  ", end="")
        print()
    print(f"  结果（正确）: dp = {dp_correct}（每个物品最多选一次）")

    # ---- 6. 两种背包结果差异 ----
    print("-" * 72)
    print("6. 0/1 背包 vs 完全背包 结果汇总")
    print("-" * 72)

    print(f"\n{'':>30} {'0/1':>8} {'Complete':>10}")
    print(f"{'最大价值':>30} {val_01_2d:>8} {val_comp_2d:>10}")
    print(f"{'选中物品':>30} {str(sel_01):>8} {str(cmp_sel):>10}")
    print(f"{'总重量':>30} {sum(weights[i] for i in sel_01):>8} / {capacity}")
    print(f"\n结论: 完全背包因物品可重复使用，通常能得到 >= 0/1 背包的价值。")


if __name__ == "__main__":
    _test()