"""
demo_edit_distance.py
编辑距离（Levenshtein Distance）实现与演示。

包含：
  - 标准 DP 实现 (levenshtein)
  - 空间优化版本 (levenshtein_optimized)
  - DP 表格可视化 (levenshtein_table)
  - 编辑操作回溯 (backtrace)
  - 模糊匹配
"""


# ============================================================
# 1. 标准 Levenshtein 距离
# ============================================================
def levenshtein(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[n][m]


# ============================================================
# 2. 空间优化版本（仅保留两行）
# ============================================================
def levenshtein_optimized(a, b):
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


# ============================================================
# 3. DP 表格可视化
# ============================================================
def levenshtein_table(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )

    _print_table(a, b, dp)
    return dp[n][m]


def _print_table(a, b, dp):
    n, m = len(a), len(b)
    header = "      " + "  ".join(f"  {ch}" for ch in " " + b)
    print(f"    {header}")
    for i in range(n + 1):
        row_label = f"  {a[i - 1] if i > 0 else ' '} "
        row = f"    {row_label} ["
        row += "][".join(f"{dp[i][j]:2d}" for j in range(m + 1))
        row += "]"
        print(row)

    print(f"\n    → 编辑距离 = {dp[n][m]}")
    print(f"    → 编辑操作: {_backtrace(a, b, dp)}")


# ============================================================
# 4. 编辑操作回溯
# ============================================================
def _backtrace(a, b, dp):
    i, j = len(a), len(b)
    ops = []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + (0 if a[i - 1] == b[j - 1] else 1):
            if a[i - 1] != b[j - 1]:
                ops.append(f"替换 {a[i-1]}→{b[j-1]}")
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(f"删除 {a[i-1]}")
            i -= 1
        elif j > 0 and dp[i][j] == dp[i][j - 1] + 1:
            ops.append(f"插入 {b[j-1]}")
            j -= 1
    ops.reverse()
    return " → ".join(ops) if ops else "无操作"


# ============================================================
# 5. 模糊匹配
# ============================================================
def fuzzy_search(text, pattern, max_dist=2):
    n, m = len(text), len(pattern)
    if m == 0:
        return [(0, -1, 0)] if n > 0 else [(0, 0, 0)]
    prev = list(range(m + 1))
    results = []
    for i, ch_t in enumerate(text):
        curr = [0] * (m + 1)
        curr[0] = 0
        for j, ch_p in enumerate(pattern, 1):
            cost = 0 if ch_t == ch_p else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        if curr[m] <= max_dist:
            start = max(0, i - m + 1)
            results.append((start, i, curr[m]))
        prev = curr
    return results


# ============================================================
# Demo 入口
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  编辑距离演示  Edit Distance (Levenshtein)")
    print("=" * 60)

    # 1. 基本距离计算
    print("\n" + "-" * 60)
    print("  [1] 基本编辑距离计算")
    pairs = [
        ("kitten", "sitting"),
        ("sunday", "saturday"),
        ("abc", "abc"),
        ("abc", "xyz"),
        ("", "abc"),
        ("abc", ""),
        ("book", "back"),
    ]
    for a, b in pairs:
        d = levenshtein(a, b)
        d_opt = levenshtein_optimized(a, b)
        assert d == d_opt
        print(f"    levenshtein({a!r}, {b!r}) = {d}")

    # 2. DP 表格可视化
    print("\n" + "-" * 60)
    print("  [2] DP 表格可视化")
    levenshtein_table("kitten", "sitting")

    print()
    levenshtein_table("sunday", "saturday")

    # 3. 边界情况
    print("\n" + "-" * 60)
    print("  [3] 边界情况")
    print(f"    空串 vs 空串: {levenshtein('', '')}")
    print(f"    空串 vs 'a':   {levenshtein('', 'a')}")
    print(f"    'a' vs 空串:   {levenshtein('a', '')}")
    print(f"    相同字符串:    {levenshtein('python', 'python')}")
    print(f"    完全不同的串:  {levenshtein('aaaa', 'bbbb')}")

    # 4. 模糊匹配演示
    print("\n" + "-" * 60)
    print("  [4] 模糊匹配 (Fuzzy Search)")
    text = "algorithms are fun to learn"
    for pattern, max_d in [("algoritm", 1), ("algoritm", 2), ("learned", 2), ("xyz", 1)]:
        matches = fuzzy_search(text, pattern, max_d)
        print(f"    fuzzy_search(text, {pattern!r}, max_dist={max_d})")
        for start, end, dist in matches:
            print(f"      位置 [{start}:{end+1}] = {text[start:end+1]!r} (距离={dist})")

    # 5. 性能对比
    print("\n" + "-" * 60)
    print("  [5] 性能对比: 标准 vs 空间优化")
    import time

    a_long = "algorithm" * 200
    b_long = "algorithms" * 200

    start = time.perf_counter()
    d1 = levenshtein(a_long, b_long)
    t1 = time.perf_counter() - start

    start = time.perf_counter()
    d2 = levenshtein_optimized(a_long, b_long)
    t2 = time.perf_counter() - start

    print(f"    标准 O(n*m):     d={d1}, {t1*1000:.2f} ms")
    print(f"    优化 O(2*min):   d={d2}, {t2*1000:.2f} ms")
    assert d1 == d2

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)