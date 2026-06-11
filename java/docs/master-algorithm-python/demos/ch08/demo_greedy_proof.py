"""
demo_greedy_proof.py — 贪心正确性证明演示与反例分析

配合第8章"贪心算法"之 8.4（正确性证明）使用。

演示内容：
  1. 活动选择 —— Greedy Stays Ahead 证明的追踪演示
  2. 硬币找零 —— 贪心有效 vs 贪心失败的对比
  3. Greedy Stays Ahead 与 Exchange Argument 的可视化
  4. 如何构造反例证伪贪心策略
"""

from typing import List, Tuple, Dict


# ============================================================
# 活动选择 — Greedy Stays Ahead 证明追踪
# ============================================================
def activity_selection_tracked(activities: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    活动选择（带证明追踪）。

    贪心策略: 按结束时间排序，每次选最早结束的。

    Greedy Stays Ahead 证明:
设贪心选择的活动为 G = (g1, g2, ..., gk)
       任意最优解为 O = (o1, o2, ..., om)
      归纳证明: 对每个步骤 t，gₜ 的结束时间 ≤ oₜ 的结束时间
        → 贪心至少和最优解一样好（Greedy Stays Ahead）
        → 因此 k = m（贪心是最优的）
    """
    if not activities:
        return []

    sorted_acts = sorted(activities, key=lambda x: x[1])
    selected = [sorted_acts[0]]
    proof_steps: List[Dict] = []

    print(f"\nGreedy Stays Ahead 证明追踪:")
    print(f"  已排序活动（按结束时间）: {sorted_acts}")
    print(f"  {'步数':>4} {'贪心选择':>16} {'结束':>6} {'证明':>40}")
    print(f"  {'-' * 68}")

    # 第 1 步
    g_current = sorted_acts[0]
    proof_steps.append({
        "step": 1,
        "g": g_current,
        "g_end": g_current[1],
        "claim": f"g1 = {g_current}, 结束于 {g_current[1]} <= 任何最优解的第一个活动",
    })
    print(f"  {1:>4} {str(g_current):>16} {g_current[1]:>6} {'g1 是结束最早的':>40}")

    # 后续步骤
    for i, act in enumerate(sorted_acts[1:], start=2):
        if act[0] >= selected[-1][1]:
            selected.append(act)
            proof_steps.append({
                "step": i,
                "g": act,
                "g_end": act[1],
                "claim": f"g{i} 结束于 {act[1]}, "
                         f"在已选最后一个 ({selected[-2][1]}) 之后开始",
            })
            label = f"g{i} 是剩余活动中结束最早的"
            print(f"  {i:>4} {str(act):>16} {act[1]:>6} {label:>40}")
        else:
            print(f"  {i:>4} {str(act):>16} {'':>6} "
                  f"{'(跳过，与已选活动重叠)':>40}")

    print(f"\n贪心共选择 {len(selected)} 个活动")
    print(f"\n证明完成: 贪心选择 = 最优解 [OK]")

    proof_steps.append({
        "step": "∞",
        "g": None,
        "g_end": None,
        "claim": f"贪心选择 {len(selected)} 个活动等于最优解大小"
    })

    return selected


# ============================================================
# 硬币找零 — 何时贪心有效 / 无效
# ============================================================
def coin_change_greedy(coins: List[int], amount: int) -> List[int]:
    """
    贪心找零：每次选当前能选的最大面值。
    返回硬币组合（无法恰好找零时返回空列表）。
    """
    coins_sorted = sorted(coins, reverse=True)
    result = []
    remaining = amount

    for coin in coins_sorted:
        while remaining >= coin:
            result.append(coin)
            remaining -= coin

    return result if remaining == 0 else []


def coin_change_dp(coins: List[int], amount: int) -> Tuple[int, List[int]]:
    """
    DP 找零：保证找到最优解。
    返回 (最少硬币数, 硬币组合)
    """
    INF = amount + 1
    dp = [INF] * (amount + 1)
    choice = [-1] * (amount + 1)
    dp[0] = 0

    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i and dp[i - coin] + 1 < dp[i]:
                dp[i] = dp[i - coin] + 1
                choice[i] = coin

    if dp[amount] == INF:
        return (-1, [])

    combination = []
    remaining = amount
    while remaining > 0:
        c = choice[remaining]
        combination.append(c)
        remaining -= c

    return (dp[amount], combination)


# ============================================================
# 分析贪心为什么有效 / 无效
# ============================================================
def analyze_coin_system(coins: List[int], max_amount: int = 20):
    """
    分析硬币系统：找出贪心失败的金额。

    一个硬币系统满足"贪心有效"当且仅当：
    对于任意金额，贪心结果 = 最优结果。
    """
    failures = []

    for amount in range(1, max_amount + 1):
        greedy = coin_change_greedy(coins, amount)
        dp_count_val, dp_combo = coin_change_dp(coins, amount)

        greedy_count = len(greedy) if greedy else float("inf")
        dp_count = dp_count_val if dp_count_val >= 0 else float("inf")

        if greedy_count != dp_count:
            failures.append({
                "amount": amount,
                "greedy": greedy,
                "greedy_count": greedy_count,
                "optimal": dp_combo,
                "dp_count": dp_count,
            })

    return failures


# ============================================================
# Exchange Argument 演示（硬币找零）
# ============================================================
def exchange_argument_demo(coins: List[int], amount: int):
    """
    Exchange Argument 演示。

    假设贪心解 G = [c1, c2, ..., ck]
    最优解 O = [d1, d2, ..., dm]

    我们尝试通过交换操作将 O 转换为 G：
    找到第一个不同位置，用贪心选择的硬币替换，证明不降低最优性。
    """
    greedy_result = coin_change_greedy(coins, amount)
    _, dp_result = coin_change_dp(coins, amount)
    dp_combo = dp_result if dp_result else []

    print(f"\nExchange Argument 分析:")
    print(f"  金额: {amount}")
    print(f"  面值: {coins}")
    print(f"  贪心解 G: {greedy_result} ({len(greedy_result)} 枚)")
    print(f"  最优解 O: {dp_combo} ({len(dp_combo)} 枚)")

    if len(greedy_result) == len(dp_combo):
        print(f"  [OK] 贪心有效: |G| = |O| = {len(greedy_result)}")
        return

    print(f"  [FAIL] 贪心失败: |G| = {len(greedy_result)}, |O| = {len(dp_combo)}")

    # 找出第一个差异
    for i in range(min(len(greedy_result), len(dp_combo))):
        if greedy_result[i] != dp_combo[i]:
            print(f"\n  第一个差异在位置 {i}:")
            print(f"    G[{i}] = {greedy_result[i]}（贪心选最大面值 {greedy_result[i]}）")
            print(f"    O[{i}] = {dp_combo[i]}（最优解选 {dp_combo[i]}）")
            print(f"    贪心选 {greedy_result[i]} 导致剩余金额 {amount - sum(greedy_result[:i+1])}")
            print(f"    最优解选 {dp_combo[i]} 导致剩余金额 {amount - sum(dp_combo[:i+1])}")
            break

    print(f"\n  为什么失败?")
    print(f"    贪心选择性质不成立:")
    print(f"    - 每步选最大面值看似合理，但可能排除更优组合")
    print(f"    - 本例中选 {greedy_result[0]} 后无法用剩余面值凑出最优")
    print(f"    - 而选 {dp_combo[0]} 加上其他面值能得到更好的结果")
    print(f"    结论: 该硬币系统不满足贪心选择性质")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("贪心正确性证明演示")
    print("=" * 72)

    # ---- 1. 活动选择 — Greedy Stays Ahead ----
    print("-" * 72)
    print("1. Greedy Stays Ahead — 活动选择证明追踪")
    print("-" * 72)

    activities = [(1, 3), (2, 4), (3, 5), (4, 6), (5, 7)]
    result = activity_selection_tracked(activities)
    print(f"\n最终选择: {result}")

    # ---- 2. 硬币找零 — 有效性分析 ----
    print("-" * 72)
    print("2. 硬币找零 — 贪心有效 vs 贪心无效")
    print("-" * 72)

    systems = [
        {"name": "标准货币 [1, 5, 10, 25]", "coins": [1, 5, 10, 25]},
        {"name": "贪心有效 [1, 2, 5]", "coins": [1, 2, 5]},
        {"name": "贪心失败 [1, 3, 4]", "coins": [1, 3, 4]},
        {"name": "贪心失败 [1, 5, 11]", "coins": [1, 5, 11]},
        {"name": "贪心失败 [1, 10, 25]", "coins": [1, 10, 25]},
    ]

    for sys in systems:
        name = sys["name"]
        coins = sys["coins"]
        failures = analyze_coin_system(coins, max_amount=30)

        print(f"\n{name} (面值: {coins})")
        if not failures:
            print(f"  [OK] 全部正确: 在 1-30 范围内贪心总有效")
        else:
            print(f"  [FAIL] 发现 {len(failures)} 个失败金额:")
            for f in failures[:5]:
                print(f"    amount={f['amount']:2d}: "
                      f"贪心={f['greedy_count']}枚{f['greedy']} "
                      f"最优={f['dp_count']}枚{f['optimal']}")
            if len(failures) > 5:
                print(f"    ... 还有 {len(failures) - 5} 个")

    # ---- 3. Exchange Argument 演示 ----
    print("-" * 72)
    print("3. Exchange Argument 演示（硬币找零失败案例）")
    print("-" * 72)

    exchange_argument_demo([1, 3, 4], 6)
    print()
    exchange_argument_demo([1, 3, 4], 8)
    print()
    exchange_argument_demo([1, 5, 11], 15)

    # ---- 4. 如何构造反例 ----
    print("-" * 72)
    print("4. 构造反例的方法")
    print("-" * 72)

    print(f"""
构造贪心反例的一般方法:
  假设贪心策略是"每步选最大面值"（硬币找零）。

  方法：找三种面值 a < b < c，使得：
    1. c > b（最大面值最大）
    2. c % b != 0（最大面值不是次大面值的倍数）
    3. 存在某个金额 amount，用 c 会浪费，而用 b 的组合更优

  示例: coins = [1, 3, 4], amount = 6
    - 贪心: 4 + 1 + 1 = 3 枚
    - 最优: 3 + 3 = 2 枚
    - 原因: 4 % 3 = 1 ≠ 0，用 4 会留下 2 只能用两个 1

  示例: coins = [1, 5, 11], amount = 15
    - 贪心: 11 + 1 + 1 + 1 + 1 = 5 枚
    - 最优: 5 + 5 + 5 = 3 枚
    - 原因: 11 % 5 = 1，用 11 留下 4 只能用四个 1

  对活动选择的反例：
    如果不用"最早结束"策略而用"最早开始"：
    activities = [(0, 10), (1, 2), (3, 4)]
    最早开始: (0, 10) → 1 个活动
    最优解: (1, 2), (3, 4) → 2 个活动
    """)

    # 演示最早开始策略的反例
    print("  活动选择 — 错误贪心策略（最早开始）:")
    wrong_activities = [(0, 10), (1, 2), (3, 4)]
    sorted_by_start = sorted(wrong_activities, key=lambda x: x[0])
    wrong_selected = [sorted_by_start[0]]
    for act in sorted_by_start[1:]:
        if act[0] >= wrong_selected[-1][1]:
            wrong_selected.append(act)
    right_selected = activity_selection_tracked(wrong_activities)

    print(f"    活动: {wrong_activities}")
    print(f"    最早开始策略: {wrong_selected} ({len(wrong_selected)} 个)")
    print(f"    最早结束策略（正确）: {right_selected} ({len(right_selected)} 个)")

    # ---- 5. 贪心有效 vs 无效的场景对比 ----
    print("-" * 72)
    print("5. 贪心有效 vs 无效 — 总结")
    print("-" * 72)

    print(f"""
┌─────────────────────────────────────────────────────────────┐
│                     贪心算法正确性判断                        │
├───────────────┬─────────────────────────────────────────────┤
│  贪心有效     │  典型问题:                                   │
│  (可证明)     │  活动选择（最早结束）                         │
│               │  Huffman 编码（最小频率合并）                 │
│               │  Dijkstra 最短路（当前最短路优先）             │
│               │  Prim/Kruskal 最小生成树（最小边优先）        │
│               │  分数背包（单位价值最高优先）                  │
├───────────────┼─────────────────────────────────────────────┤
│  贪心无效     │  典型问题:                                   │
│  (需反例)     │  0/1 背包（贪心只能近似）                    │
│               │  硬币找零（某些面值组合）                     │
│               │  TSP 旅行商（最近邻贪心不保证最优）           │
│               │  图着色（贪心不保证最少颜色数）               │
├───────────────┼─────────────────────────────────────────────┤
│  判断方法     │ ① 尝试证明贪心选择性质                       │
│               │ ② 寻找反例（贪心失败的具体输入）             │
│               │ ③ 如果问题结构是 matroid，贪心一定有效       │
│               │ ④ 当没有确定的"度量"时，通常贪心不适用      │
└───────────────┴─────────────────────────────────────────────┘""")


if __name__ == "__main__":
    _test()