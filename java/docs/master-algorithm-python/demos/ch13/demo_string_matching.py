"""
demo_string_matching.py
四种字符串匹配算法实现与对比。

包含：
  - 暴力匹配 (brute_force)
  - KMP (前缀函数 + 匹配)
  - Rabin-Karp (滚动哈希)
  - Boyer-Moore (坏字符规则)
"""


# ============================================================
# 1. 暴力匹配 (Brute Force)
# ============================================================
def brute_force(text, pattern):
    n, m = len(text), len(pattern)
    for i in range(n - m + 1):
        j = 0
        while j < m and text[i + j] == pattern[j]:
            j += 1
        if j == m:
            yield i


# ============================================================
# 2. KMP (Knuth-Morris-Pratt)
# ============================================================
def build_pi(pattern):
    m = len(pattern)
    pi = [0] * m
    j = 0
    for i in range(1, m):
        while j > 0 and pattern[i] != pattern[j]:
            j = pi[j - 1]
        if pattern[i] == pattern[j]:
            j += 1
            pi[i] = j
    return pi


def kmp_search(text, pattern):
    n, m = len(text), len(pattern)
    if m == 0:
        return
    pi = build_pi(pattern)
    j = 0
    for i in range(n):
        while j > 0 and text[i] != pattern[j]:
            j = pi[j - 1]
        if text[i] == pattern[j]:
            j += 1
        if j == m:
            yield i - m + 1
            j = pi[j - 1]


# ============================================================
# 3. Rabin-Karp (滚动哈希)
# ============================================================
def rabin_karp_search(text, pattern, d=256, q=101):
    n, m = len(text), len(pattern)
    if m > n or m == 0:
        return
    h = pow(d, m - 1, q)
    p_hash = 0
    t_hash = 0

    for i in range(m):
        p_hash = (p_hash * d + ord(pattern[i])) % q
        t_hash = (t_hash * d + ord(text[i])) % q

    for i in range(n - m + 1):
        if p_hash == t_hash:
            if text[i:i + m] == pattern:
                yield i
        if i < n - m:
            t_hash = (d * (t_hash - ord(text[i]) * h) + ord(text[i + m])) % q
            if t_hash < 0:
                t_hash += q


# ============================================================
# 4. Boyer-Moore (坏字符规则)
# ============================================================
def build_bad_char(pattern):
    m = len(pattern)
    table = {}
    for i in range(m):
        table[pattern[i]] = i
    return table


def bm_search(text, pattern):
    n, m = len(text), len(pattern)
    if m == 0:
        return
    bc = build_bad_char(pattern)
    i = 0
    while i <= n - m:
        j = m - 1
        while j >= 0 and pattern[j] == text[i + j]:
            j -= 1
        if j < 0:
            yield i
            i += m - bc.get(text[i + m], -1) if i + m < n else 1
        else:
            shift = j - bc.get(text[i + j], -1)
            i += max(1, shift)


# ============================================================
# 辅助工具：计时对比
# ============================================================
def _test_all(text, pattern, label=""):
    print(f"\n  Pattern: {pattern!r}{'  ' + label if label else ''}")
    print(f"  Text:    {text!r}")

    results = {}
    for name, func in [
        ("Brute Force", brute_force),
        ("KMP         ", kmp_search),
        ("Rabin-Karp  ", rabin_karp_search),
        ("BM          ", bm_search),
    ]:
        matches = list(func(text, pattern))
        results[name.strip()] = matches
        print(f"    {name}: {matches}")

    all_sets = [set(v) for v in results.values()]
    for s in all_sets[1:]:
        assert s == all_sets[0], f"结果不一致: {results}"
    print(f"    => 结果一致")


# ============================================================
# Demo 入口
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  字符串匹配算法对比  String Matching Algorithms")
    print("=" * 60)

    # 1. 基本匹配
    print("\n" + "-" * 60)
    print("  [1] 基本匹配")
    _test_all("ABABABACABA", "ABA")

    # 2. 无匹配
    print("\n" + "-" * 60)
    print("  [2] 无匹配")
    _test_all("ABCDEFGH", "XYZ")

    # 3. 完整匹配（模式=文本）
    print("\n" + "-" * 60)
    print("  [3] 完整匹配")
    _test_all("ALGORITHM", "ALGORITHM")

    # 4. 重复字符（KMP 的最坏情况）
    print("\n" + "-" * 60)
    print("  [4] 重复字符（KMP 最坏情况）")
    _test_all("AAAAAAAAAAAA", "AAA")

    # 5. 中文匹配
    print("\n" + "-" * 60)
    print("  [5] 中文匹配")
    _test_all("数据结构和算法", "算法")

    # 6. 性能对比
    print("\n" + "-" * 60)
    print("  [6] 性能对比")
    import time

    text_large = "ABABABCABABABCABABABC" * 1000
    pattern_large = "ABABABCABA"

    for name, func in [
        ("Brute Force", brute_force),
        ("KMP         ", kmp_search),
        ("Rabin-Karp  ", rabin_karp_search),
        ("BM          ", bm_search),
    ]:
        start = time.perf_counter()
        count = len(list(func(text_large, pattern_large)))
        elapsed = time.perf_counter() - start
        print(f"    {name}: {count} 个匹配, {elapsed*1000:.2f} ms")

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)