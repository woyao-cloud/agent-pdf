"""
demo_greedy_vs_dp.py — 硬币找零问题：贪心 vs 动态规划对比

配合第3章"算法思维模式"之 3.2（贪心）和 3.3（动态规划）使用。

核心问题：给定硬币面值 coins 和总金额 amount，求组成 amount
所需的最少硬币数。

关键发现：
  - 某些面值组合下贪心算法是正确的（如人民币面值 [1, 5, 10, 25]）
  - 某些面值组合下贪心算法会失败（如 [1, 3, 4]，amount=6）
  - 动态规划始终能找到最优解，但实现更复杂

演示内容：
  1. 贪心算法（简单快速，可能失败）
  2. DP - Tabulation（自底向上，一定正确）
  3. DP - Memoization（自顶向下，一定正确）
  4. 对比实验：展示贪心何时失败
"""

from typing import List
import sys


# ============================================================
# 贪心算法
# ============================================================
def coin_change_greedy(coins: List[int], amount: int) -> List[int]:
    """
    贪心找零：每次都选当前能选的最大面值。

    正确性条件：硬币系统必须具有"贪心选择性质"（如标准货币系统）。
    否则可能无法得到全局最优解，甚至可能找不到解。

    返回：组成 amount 的硬币组合列表。（找不到解时返回 []）
    """
    # 贪心要求硬币面值降序排列
    coins_sorted = sorted(coins, reverse=True)
    result = []
    remaining = amount

    for coin in coins_sorted:
        while remaining >= coin:
            result.append(coin)
            remaining -= coin

    if remaining != 0:
        return []   # 贪心失败，无法恰好找零
    return result


def coin_change_greedy_count(coins: List[int], amount: int) -> int:
    """贪心找零，只返回硬币数量"""
    result = coin_change_greedy(coins, amount)
    return len(result) if result else float("inf")


# ============================================================
# 动态规划 — Tabulation（自底向上）
# ============================================================
def coin_change_dp_tab(coins: List[int], amount: int) -> int:
    """
    DP 表格式找零：保证找到最少硬币数。

    状态定义：dp[i] = 组成金额 i 所需的最少硬币数
    转移方程：dp[i] = min(dp[i - coin] + 1) 对所有 coin ∈ coins
    初始条件：dp[0] = 0

    演示 dp 表的构建过程（自底向上填充）：
        i=0  dp[0]=0
        i=1  dp[1]=dp[0]+1=1          (coin=1)
        i=2  dp[2]=dp[1]+1=2          (coin=1)
        i=3  dp[3]=min(dp[2]+1=3, dp[0]+1=1) = 1  (coin=3)
        i=4  dp[4]=min(dp[3]+1=2, dp[1]+1=2, dp[0]+1=1) = 1  (coin=4)
        i=5  dp[5]=min(dp[4]+1=2, dp[2]+1=3, dp[1]+1=2) = 2
        i=6  dp[6]=min(dp[5]+1=3, dp[3]+1=2, dp[2]+1=3) = 2  (coin=3)
    """
    # 初始化为一个很大的数（表示"无法组成"）
    INF = amount + 1
    dp = [INF] * (amount + 1)
    dp[0] = 0

    # 自底向上填充 dp 表
    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i:
                dp[i] = min(dp[i], dp[i - coin] + 1)

    return dp[amount] if dp[amount] != INF else -1


def coin_change_dp_tab_detail(coins: List[int], amount: int) -> dict:
    """
    DP 表格找零（带详细过程记录）。

    返回：包含最少硬币数和 dp 表快照的字典。
    """
    INF = amount + 1
    dp = [INF] * (amount + 1)
    dp[0] = 0
    # 记录选择的硬币（用于回溯具体组合）
    choice = [-1] * (amount + 1)

    print(f"\nDP 表格构建过程 (coins={coins}, amount={amount}):")
    print("  i    dp[i]    选择")

    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i and dp[i - coin] + 1 < dp[i]:
                dp[i] = dp[i - coin] + 1
                choice[i] = coin
        print(f"  {i:2d}    {dp[i]:<8}  coin={choice[i]}" if choice[i] != -1
              else f"  {i:2d}    {dp[i]:<8}  不可达")

    # 回溯硬币组合
    combination = []
    if dp[amount] != INF:
        remaining = amount
        while remaining > 0:
            c = choice[remaining]
            combination.append(c)
            remaining -= c

    return {
        "min_coins": dp[amount] if dp[amount] != INF else -1,
        "combination": combination,
        "dp_table": dp,
    }


# ============================================================
# 动态规划 — Memoization（自顶向下 + 记忆化）
# ============================================================
def coin_change_dp_memo(coins: List[int], amount: int) -> int:
    """
    记忆化搜索版本。

    思路：f(amount) = min(f(amount - coin) + 1) 对所有 coin ∈ coins
    用 memo 字典缓存已计算过的结果，避免重复计算。

    优势：只计算需要的子问题，不计算所有金额。
    劣势：递归开销，可能有栈溢出风险。
    """
    memo = {0: 0}

    def _dfs(remaining: int) -> int:
        if remaining in memo:
            return memo[remaining]
        if remaining < 0:
            return float("inf")

        best = float("inf")
        for coin in coins:
            best = min(best, _dfs(remaining - coin) + 1)

        memo[remaining] = best
        return best

    # Increase recursion limit for larger amounts
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(amount * 2 + 1000)
    try:
        result = _dfs(amount)
        return result if result != float("inf") else -1
    finally:
        sys.setrecursionlimit(old_limit)


# ============================================================
# 对比实验
# ============================================================
def _test():
    print("=" * 70)
    print("硬币找零问题：贪心 vs 动态规划对比")
    print("=" * 70)

    # 测试用例格式：(coins, amount, description)
    test_cases = [
        ([1, 5, 10, 25], 63, "标准货币 - 贪心有效"),
        ([1, 3, 4],      6,  "贪心失败案例 - 选4+1+1=3枚, 最优3+3=2枚"),
        ([1, 3, 4],      8,  "贪心失败案例 - 选4+4=2枚, 贪心选4+3+1=3枚"),
        ([1, 5, 11],    15,  "贪心失败案例 - 选11+1+1+1+1=5枚, 最优5+5+5=3枚"),
        ([2],            3,  "无法组成 - 所有方法都应返回-1"),
        ([1, 2, 5],     11,  "普通案例 - 贪心有效"),
        ([1],            0,  "边界: amount=0"),
    ]

    for coins, amount, desc in test_cases:
        print(f"\n{'─' * 70}")
        print(f"[{desc}]")
        print(f"  硬币面值: {coins}, 金额: {amount}")

        # 贪心
        greedy_combo = coin_change_greedy(coins, amount)
        greedy_cnt = len(greedy_combo) if greedy_combo else -1
        print(f"  贪心结果: {greedy_combo if greedy_combo else '无解'}")
        print(f"  贪心数量: {greedy_cnt} 枚")

        # DP Tabulation
        dp_tab_result = coin_change_dp_tab_detail(coins, amount)
        print(f"  DP-Tab  : {dp_tab_result['min_coins']} 枚, "
              f"组合: {dp_tab_result['combination']}")

        # DP Memoization
        dp_memo_cnt = coin_change_dp_memo(coins, amount)
        print(f"  DP-Memo : {dp_memo_cnt} 枚")

        # 对比结果
        if greedy_cnt != dp_tab_result["min_coins"]:
            print(f"  [!] 贪心失败！贪心={greedy_cnt}枚 vs DP最优={dp_tab_result['min_coins']}枚")
        else:
            print(f"  [OK] 贪心有效（与最优解一致）")

    # 性能对比
    print(f"\n{'=' * 70}")
    print("性能对比（较大金额）")
    print("=" * 70)
    import time

    coins = [1, 5, 10, 25]
    amount = 1000

    # 贪心
    start = time.perf_counter()
    greedy_cnt = coin_change_greedy_count(coins, amount)
    greedy_time = time.perf_counter() - start

    # DP Tabulation
    start = time.perf_counter()
    dp_tab_cnt = coin_change_dp_tab(coins, amount)
    dp_tab_time = time.perf_counter() - start

    # DP Memoization
    start = time.perf_counter()
    dp_memo_cnt = coin_change_dp_memo(coins, amount)
    dp_memo_time = time.perf_counter() - start

    print(f"  {'方法':<20} {'结果':<10} {'耗时':<10}")
    print(f"  {'-' * 40}")
    print(f"  {'贪心 (Greedy)':<20} {greedy_cnt:<10} {greedy_time:<10.6f}s")
    print(f"  {'DP Tabulation':<20} {dp_tab_cnt:<10} {dp_tab_time:<10.6f}s")
    print(f"  {'DP Memoization':<20} {dp_memo_cnt:<10} {dp_memo_time:<10.6f}s")

    print(f"\n结论: 贪心最快但可能不准，DP 最准但更慢。")


if __name__ == "__main__":
    _test()