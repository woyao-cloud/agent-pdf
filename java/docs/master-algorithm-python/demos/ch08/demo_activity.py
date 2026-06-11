"""
demo_activity.py — 活动选择与区间调度：贪心 vs DP 对比

配合第8章"贪心算法"之 8.3（经典问题）使用。

演示内容：
  1. Activity Selection: 贪心（最早结束时间优先）
  2. Activity Selection: DP 版本（复杂度高，保证最优）
  3. Interval Scheduling: 贪心求最大不相交区间数
  4. Interval Scheduling: 最少区间覆盖点（贪心选最右端点）
  5. 对比实验：贪心 vs DP 结果和性能
"""

from typing import List, Tuple


# ============================================================
# 活动选择 — 贪心（最早结束时间优先）
# ============================================================
def activity_selection_greedy(activities: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    活动选择 — 贪心算法。

    贪心策略：按结束时间升序排序，每次选结束最早且不与已选活动冲突的。

    参数: activities = [(start_i, end_i), ...]
    返回: 选中的活动列表
    """
    if not activities:
        return []

    sorted_acts = sorted(activities, key=lambda x: x[1])
    selected = [sorted_acts[0]]

    for act in sorted_acts[1:]:
        if act[0] >= selected[-1][1]:
            selected.append(act)

    return selected


# ============================================================
# 活动选择 — DP（自底向上Tabulation）
# ============================================================
def activity_selection_dp(activities: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    活动选择 — DP 版本。

    思路：先按结束时间排序，对每个活动 i，找到"在 i 开始之前结束的最后一个活动" p[i]。
    状态: dp[i] = 前 i 个活动（排序后）能选的最大活动数
    转移: dp[i] = max(dp[i-1], dp[p[i]] + 1)

    返回: 选中的活动列表
    """
    if not activities:
        return []

    sorted_acts = sorted(activities, key=lambda x: x[1])
    n = len(sorted_acts)

    # p[i] = 在活动 i 开始前结束的最后一个活动的索引（-1 表示不存在）
    p = [-1] * n
    for i in range(n):
        for j in range(i - 1, -1, -1):
            if sorted_acts[j][1] <= sorted_acts[i][0]:
                p[i] = j
                break

    dp = [0] * n
    choice = [False] * n  # 记录是否选了活动 i

    for i in range(n):
        take = 1 + (dp[p[i]] if p[i] >= 0 else 0)
        skip = dp[i - 1] if i > 0 else 0

        if take >= skip:
            dp[i] = take
            choice[i] = True
        else:
            dp[i] = skip
            choice[i] = False

    # 回溯
    selected = []
    i = n - 1
    while i >= 0:
        if choice[i]:
            selected.append(sorted_acts[i])
            i = p[i]
        else:
            i -= 1
    selected.reverse()

    return selected


# ============================================================
# 区间调度 — 求最大不相交区间数
# ============================================================
def max_non_overlapping_intervals(intervals: List[Tuple[int, int]]) -> int:
    """
    求最大不相交区间数（贪心）。

    与活动选择完全一样，按右端点排序贪心选取。
    """
    return len(activity_selection_greedy(intervals))


# ============================================================
# 最少区间覆盖点 — 用最少的点覆盖所有区间
# ============================================================
def min_points_cover_intervals(intervals: List[Tuple[int, int]]) -> List[int]:
    """
    最少区间覆盖点问题（贪心）。

    贪心策略：按右端点排序，每次选当前最右端点作为点，
    所有包含该点的区间被覆盖，继续处理剩余区间。

    返回：选中的点的列表
    """
    if not intervals:
        return []

    sorted_its = sorted(intervals, key=lambda x: x[1])
    points = []
    last_point = -float("inf")

    for l, r in sorted_its:
        if l > last_point:
            last_point = r
            points.append(r)

    return points


# ============================================================
# 最小移除区间数（使得剩余区间互不相交）
# ============================================================
def min_remove_to_make_non_overlapping(intervals: List[Tuple[int, int]]) -> int:
    """
    最小移除区间数 = 总区间数 - 最大不相交区间数。
    """
    total = len(intervals)
    max_non_overlap = max_non_overlapping_intervals(intervals)
    return total - max_non_overlap


# ============================================================
# 会议室 II — 最少需要多少会议室
# ============================================================
def min_meeting_rooms(intervals: List[Tuple[int, int]]) -> int:
    """
    会议室 II：扫描线算法。

    思路：将开始和结束事件打平排序，扫描时遇到开始+1，遇到结束-1，
    记录过程中的最大值。

    复杂度：O(n log n)，空间 O(n)
    """
    events = []
    for l, r in intervals:
        events.append((l, 1))
        events.append((r, -1))

    events.sort(key=lambda x: (x[0], x[1]))

    count = 0
    max_count = 0
    for _, delta in events:
        count += delta
        max_count = max(max_count, count)

    return max_count


# ============================================================
# DP 表格打印（活动选择 DP 表）
# ============================================================
def _print_dp_details(activities: List[Tuple[int, int]]):
    """打印活动选择 DP 的 p[i] 和 dp[i] 表格"""
    sorted_acts = sorted(activities, key=lambda x: x[1])
    n = len(sorted_acts)

    p = [-1] * n
    for i in range(n):
        for j in range(i - 1, -1, -1):
            if sorted_acts[j][1] <= sorted_acts[i][0]:
                p[i] = j
                break

    print(f"\n活动排序（按结束时间）:")
    print(f"  {'i':>3} {'活动':>10} {'p[i]':>6}")
    print(f"  {'-' * 22}")
    for i in range(n):
        print(f"  {i:>3}  ({sorted_acts[i][0]},{sorted_acts[i][1]})  {p[i]:>5}")

    dp = [0] * n
    for i in range(n):
        take = 1 + (dp[p[i]] if p[i] >= 0 else 0)
        skip = dp[i - 1] if i > 0 else 0
        dp[i] = max(take, skip)

    print(f"\nDP 表:")
    print(f"  {'i':>3} {'take':>6} {'skip':>6} {'dp[i]':>6}")
    print(f"  {'-' * 24}")
    for i in range(n):
        take = 1 + (dp[p[i]] if p[i] >= 0 else 0)
        skip = dp[i - 1] if i > 0 else 0
        print(f"  {i:>3} {take:>6} {skip:>6} {dp[i]:>6}")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("活动选择与区间调度 演示")
    print("=" * 72)

    # ---- 测试用例 ----
    activities = [
        (1, 3),
        (2, 4),
        (3, 5),
        (4, 6),
        (5, 7),
    ]

    print(f"\n活动列表: {activities}")
    print()

    # ---- 1. 贪心活动选择 ----
    print("-" * 72)
    print("1. 活动选择 — 贪心（最早结束时间优先）")
    print("-" * 72)

    greedy_result = activity_selection_greedy(activities)
    print(f"\n贪心选取的活动: {greedy_result}")
    print(f"选中数量: {len(greedy_result)}")

    # 可视化时间轴
    print("\n时间轴可视化:")
    max_time = max(a[1] for a in activities)
    timeline = [" "] * (max_time + 1)
    for s, e in greedy_result:
        for t in range(s, e):
            timeline[t] = "█"
    print(f"  {' '.join(str(i) for i in range(max_time + 1))}")
    print(f"  {' '.join(timeline)}")

    # ---- 2. DP 活动选择 ----
    print("-" * 72)
    print("2. 活动选择 — DP 版本")
    print("-" * 72)

    _print_dp_details(activities)

    dp_result = activity_selection_dp(activities)
    print(f"\nDP 选取的活动: {dp_result}")
    print(f"选中数量: {len(dp_result)}")

    # ---- 3. 贪心 vs DP 对比 ----
    print("-" * 72)
    print("3. 贪心 vs DP 结果对比")
    print("-" * 72)

    greedy_ok = "OK" if len(greedy_result) == len(dp_result) else "FAIL"
    print(f"\n{'方法':<15} {'选中数':<10} {'结果':<8}")
    print(f"{'-' * 33}")
    print(f"{'贪心 (Greedy)':<15} {len(greedy_result):<10} {greedy_ok:<8}")
    print(f"{'DP':<15} {len(dp_result):<10} {'OK':<8}")

    # ---- 4. 多组活动测试 ----
    print("-" * 72)
    print("4. 多组活动测试")
    print("-" * 72)

    test_cases = [
        [(1, 3), (2, 5), (3, 7), (4, 6)],
        [(0, 6), (1, 2), (3, 4), (5, 7), (5, 9), (8, 9)],
        [(1, 2), (2, 3), (3, 4), (1, 3)],
        [(1, 10)],
        [],
    ]

    for acts in test_cases:
        g = activity_selection_greedy(acts)
        d = activity_selection_dp(acts)
        ok = "[OK]" if len(g) == len(d) else "[FAIL]"
        print(f"  {str(acts):<55} 贪心={len(g)} DP={len(d)} {ok}")

    # ---- 5. 区间调度变体 ----
    print("-" * 72)
    print("5. 区间调度变体问题")
    print("-" * 72)

    intervals = [(1, 3), (2, 4), (3, 6), (5, 7), (6, 8), (8, 9)]
    print(f"\n区间: {intervals}")
    print(f"最大不相交区间数: {max_non_overlapping_intervals(intervals)}")
    print(f"最小移除区间数: {min_remove_to_make_non_overlapping(intervals)}")

    # ---- 6. 最少覆盖点 ----
    print("-" * 72)
    print("6. 最少区间覆盖点")
    print("-" * 72)

    cover_cases = [
        [(1, 3), (2, 5), (3, 6)],
        [(1, 4), (4, 5), (7, 9), (9, 12)],
        [(1, 2), (2, 3), (3, 4), (4, 5)],
    ]

    for intervals in cover_cases:
        pts = min_points_cover_intervals(intervals)
        print(f"  区间: {str(intervals):<35} 覆盖点: {pts}")

    # ---- 7. 会议室 II ----
    print("-" * 72)
    print("7. 会议室 II — 最少需要多少会议室")
    print("-" * 72)

    meeting_cases = [
        [(0, 30), (5, 10), (15, 20)],
        [(0, 10), (10, 20), (20, 30)],
        [(1, 5), (2, 6), (3, 7), (4, 8)],
    ]

    for meetings in meeting_cases:
        rooms = min_meeting_rooms(meetings)
        print(f"  会议: {str(meetings):<40} 会议室: {rooms}")


if __name__ == "__main__":
    _test()