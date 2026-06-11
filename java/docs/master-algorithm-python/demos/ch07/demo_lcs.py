"""
demo_lcs.py — 最长公共子序列与最长公共子串

配合第7章"动态规划"之 7.3（经典问题）使用。

演示内容：
  1. LCS（Longest Common Subsequence）— DP 表格可视化 + 路径回溯
  2. Longest Common Substring — DP 表格可视化 + 路径回溯
  3. 对比：LCS vs 子串
"""

from typing import Tuple, List


# ============================================================
# Longest Common Subsequence (LCS)
# ============================================================
def lcs(s1: str, s2: str) -> Tuple[int, str, List[List[int]]]:
    """
    最长公共子序列。

    状态：dp[i][j] = s1[0..i-1] 与 s2[0..j-1] 的 LCS 长度

    转移：
      dp[i][j] = dp[i-1][j-1] + 1           if s1[i-1] == s2[j-1]
      dp[i][j] = max(dp[i-1][j], dp[i][j-1]) if s1[i-1] != s2[j-1]

    返回：(LCS 长度, LCS 字符串, dp 表)
    """
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    # 填充 DP 表
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # 回溯：从 dp[m][n] 走到 dp[0][0]
    lcs_str = []
    i, j = m, n
    while i > 0 and j > 0:
        if s1[i - 1] == s2[j - 1]:
            lcs_str.append(s1[i - 1])
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    lcs_str.reverse()

    return dp[m][n], "".join(lcs_str), dp


# ============================================================
# Longest Common Substring（最长公共子串）
# ============================================================
def lcs_substring(s1: str, s2: str) -> Tuple[int, str]:
    """
    最长公共子串（连续）。

    状态：dp[i][j] = 以 s1[i-1] 和 s2[j-1] 结尾的最长公共子串长度

    转移：
      dp[i][j] = dp[i-1][j-1] + 1    if s1[i-1] == s2[j-1]
      dp[i][j] = 0                    if s1[i-1] != s2[j-1]

    返回：(最长公共子串长度, 最长公共子串)
    """
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    max_len = 0
    end_pos = 0  # s1 中的结束位置

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
                if dp[i][j] > max_len:
                    max_len = dp[i][j]
                    end_pos = i  # 记录 s1 中结束位置
            else:
                dp[i][j] = 0

    substring = s1[end_pos - max_len:end_pos] if max_len > 0 else ""
    return max_len, substring


# ============================================================
# DP 表打印工具
# ============================================================
def _print_lcs_table(dp: List[List[int]], s1: str, s2: str):
    """打印 LCS DP 表"""
    m, n = len(s1), len(s2)

    # 列标题
    print(f"{'':>5}", end="")
    print(f"{'':>4}", end="")  # 空串列
    for ch in s2:
        print(f"{ch:>4}", end="")
    print()

    # 行标题 + 表内容
    for i in range(m + 1):
        if i == 0:
            print(f"{'':>4} ", end="")
        else:
            print(f"{s1[i-1]:>3} ", end="")
        for j in range(n + 1):
            print(f"{dp[i][j]:>4}", end="")
        print()
    print()


def _print_substring_table(dp: List[List[int]], s1: str, s2: str):
    """打印子串 DP 表"""
    m, n = len(s1), len(s2)

    print(f"{'':>5}", end="")
    print(f"{'':>4}", end="")
    for ch in s2:
        print(f"{ch:>4}", end="")
    print()

    for i in range(m + 1):
        if i == 0:
            print(f"{'':>4} ", end="")
        else:
            print(f"{s1[i-1]:>3} ", end="")
        for j in range(n + 1):
            v = dp[i][j]
            if v > 0:
                print(f"\033[92m{v:>4}\033[0m", end="")  # 绿色高亮
            else:
                print(f"{v:>4}", end="")
        print()
    print()


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("最长公共子序列 (LCS) 与 最长公共子串 演示")
    print("=" * 72)

    # ---- 测试用例 ----
    s1 = "abcde"
    s2 = "ace"

    print(f"\ns1 = \"{s1}\"")
    print(f"s2 = \"{s2}\"")
    print()

    # ---- 1. LCS ----
    print("-" * 72)
    print("1. 最长公共子序列 (LCS)")
    print("-" * 72)

    lcs_len, lcs_str, dp = lcs(s1, s2)
    print(f"\nDP 表格（行=s1字符，列=s2字符）：")
    _print_lcs_table(dp, s1, s2)

    print(f"LCS 长度: {lcs_len}")
    print(f"LCS 字符串: \"{lcs_str}\"")
    print()

    # ---- 回溯路径可视化 ----
    print("回溯路径（从右下角到左上角）：")
    m, n = len(s1), len(s2)
    i, j = m, n
    steps = []
    while i > 0 and j > 0:
        if s1[i - 1] == s2[j - 1]:
            steps.append(f"↖ 匹配 '{s1[i-1]}' → ({i-1},{j-1})")
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            steps.append(f"↑ 上移 → ({i-1},{j})")
            i -= 1
        else:
            steps.append(f"← 左移 → ({i},{j-1})")
            j -= 1

    for s in reversed(steps):
        print(f"  {s}")

    # ---- 2. 最长公共子串 ----
    print("-" * 72)
    print("2. 最长公共子串 (Longest Common Substring)")
    print("-" * 72)

    # 换一组更直观的测试
    a = "abcdef"
    b = "zcdemf"

    print(f"\na = \"{a}\"")
    print(f"b = \"{b}\"")
    print()

    sub_len, sub_str = lcs_substring(a, b)

    # 构建 DP 表用于打印
    m, n = len(a), len(b)
    dp_sub = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp_sub[i][j] = dp_sub[i - 1][j - 1] + 1
            else:
                dp_sub[i][j] = 0

    print("DP 表格（绿色高亮 = 匹配）：")
    _print_substring_table(dp_sub, a, b)

    print(f"最长公共子串长度: {sub_len}")
    print(f"最长公共子串: \"{sub_str}\"")
    print()

    # ---- 3. LCS vs 子串对比 ----
    print("-" * 72)
    print("3. LCS vs 子串 对比（相同输入）")
    print("-" * 72)

    pairs = [
        ("abcde", "ace"),
        ("abcdef", "zcdemf"),
        ("abc", "abc"),
        ("abc", "def"),
        ("", "abc"),
        ("aaaa", "aa"),
    ]

    print(f"\n{'s1':<12} {'s2':<12} {'LCS长度':<10} {'LCS串':<10} {'子串长度':<10} {'子串':<10}")
    print(f"{'-' * 64}")
    for x, y in pairs:
        l1, lcs_s, _ = lcs(x, y)
        l2, sub_s = lcs_substring(x, y)
        print(f"'{x:<8}' '{y:<8}' {l1:<10} '{lcs_s:<6}' {l2:<10} '{sub_s:<6}'")

    # ---- 4. 多案例 LCS 表 ----
    print("-" * 72)
    print("4. 附加 LCS 示例")
    print("-" * 72)

    extra_cases = [
        ("ABCDGH", "AEDFHR"),
        ("AGGTAB", "GXTXAYB"),
    ]

    for x, y in extra_cases:
        lcs_len, lcs_str, dp_tbl = lcs(x, y)
        print(f"\ns1 = \"{x}\", s2 = \"{y}\"")
        print(f"LCS = \"{lcs_str}\" (长度 {lcs_len})")
        _print_lcs_table(dp_tbl, x, y)


if __name__ == "__main__":
    _test()