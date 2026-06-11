"""
demo_sliding_window.py — 滑动窗口演示

配合第16章"典型问题与解题模板"之 16.2 滑动窗口使用。

演示内容：
  1. Maximum Sum Subarray of Size K (固定窗口)
  2. Longest Substring Without Repeating Characters (可变窗口-求最长)
  3. Minimum Window Substring (可变窗口-求最短)
"""

from typing import List


# ============================================================
# 1. Maximum Sum Subarray of Size K
# ============================================================
def max_sum_subarray_k(arr: List[int], k: int) -> int:
    """
    固定大小 k 的最大子数组和。

    窗口每向右滑动一步：加上新元素，减去离开窗口的元素。
    """
    if len(arr) < k:
        return -1

    window_sum = sum(arr[:k])
    max_sum = window_sum

    for i in range(k, len(arr)):
        window_sum += arr[i] - arr[i - k]
        max_sum = max(max_sum, window_sum)

    return max_sum


# ============================================================
# 2. Longest Substring Without Repeating Characters
# ============================================================
def length_of_longest_substring(s: str) -> int:
    """
    无重复字符的最长子串。

    可变窗口（求最长）：
      - 用 set 维护窗口内字符
      - right 扩展，遇到重复则 left 收缩直到无重复
      - 更新 max_len
    """
    window = set()
    left = 0
    max_len = 0

    for right in range(len(s)):
        while s[right] in window:
            window.remove(s[left])
            left += 1
        window.add(s[right])
        max_len = max(max_len, right - left + 1)

    return max_len


# ============================================================
# 3. Minimum Window Substring
# ============================================================
def min_window_substring(s: str, t: str) -> str:
    """
    最小覆盖子串。

    可变窗口（求最短）：
      - 用哈希表 need 记录 t 中字符的需求
      - valid 计数记录已满足的字符种类数
      - 当 valid == len(need) 时尝试收缩左边界
    """
    if not s or not t:
        return ""

    need = {}
    for c in t:
        need[c] = need.get(c, 0) + 1

    left = 0
    valid = 0
    min_len, start = float("inf"), 0

    for right in range(len(s)):
        c = s[right]
        if c in need:
            need[c] -= 1
            if need[c] == 0:
                valid += 1

        while valid == len(need):
            if right - left + 1 < min_len:
                min_len = right - left + 1
                start = left

            d = s[left]
            left += 1
            if d in need:
                if need[d] == 0:
                    valid -= 1
                need[d] += 1

    return s[start:start + min_len] if min_len != float("inf") else ""


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("滑动窗口演示")
    print("=" * 72)

    # ---- 1. Fixed Window ----
    print("-" * 72)
    print("1. Maximum Sum Subarray of Size K (固定窗口)")
    print("-" * 72)

    arr1 = [2, 1, 5, 1, 3, 2]
    k1 = 3
    res1 = max_sum_subarray_k(arr1, k1)
    print(f"  数组: {arr1}, k = {k1}")
    print(f"  最大和: {res1}")
    print(f"  预期: 9 (子数组 [5,1,3]) → {'PASS' if res1 == 9 else 'FAIL'}")

    arr1b = [1, 4, 2, 10, 23, 3, 1, 0, 20]
    k1b = 4
    res1b = max_sum_subarray_k(arr1b, k1b)
    print(f"  数组: {arr1b}, k = {k1b}")
    print(f"  最大和: {res1b}")
    print(f"  预期: 39 (子数组 [4,2,10,23]) → {'PASS' if res1b == 39 else 'FAIL'}")

    # ---- 2. Longest Substring Without Repeating ----
    print("-" * 72)
    print("2. Longest Substring Without Repeating (无重复字符的最长子串)")
    print("-" * 72)

    s2 = "abcabcbb"
    res2 = length_of_longest_substring(s2)
    print(f"  字符串: '{s2}'")
    print(f"  最长长度: {res2}")
    print(f"  预期: 3 ('abc') → {'PASS' if res2 == 3 else 'FAIL'}")

    s2b = "bbbbb"
    res2b = length_of_longest_substring(s2b)
    print(f"  字符串: '{s2b}'")
    print(f"  最长长度: {res2b}")
    print(f"  预期: 1 ('b') → {'PASS' if res2b == 1 else 'FAIL'}")

    s2c = "pwwkew"
    res2c = length_of_longest_substring(s2c)
    print(f"  字符串: '{s2c}'")
    print(f"  最长长度: {res2c}")
    print(f"  预期: 3 ('wke') → {'PASS' if res2c == 3 else 'FAIL'}")

    s2d = ""
    res2d = length_of_longest_substring(s2d)
    print(f"  字符串: ''")
    print(f"  最长长度: {res2d}")
    print(f"  预期: 0 → {'PASS' if res2d == 0 else 'FAIL'}")

    # ---- 3. Minimum Window Substring ----
    print("-" * 72)
    print("3. Minimum Window Substring (最小覆盖子串)")
    print("-" * 72)

    s3 = "ADOBECODEBANC"
    t3 = "ABC"
    res3 = min_window_substring(s3, t3)
    print(f"  s = '{s3}'")
    print(f"  t = '{t3}'")
    print(f"  结果: '{res3}'")
    print(f"  预期: 'BANC' → {'PASS' if res3 == 'BANC' else 'FAIL'}")

    s3b = "a"
    t3b = "a"
    res3b = min_window_substring(s3b, t3b)
    print(f"  s = '{s3b}', t = '{t3b}'")
    print(f"  结果: '{res3b}'")
    print(f"  预期: 'a' → {'PASS' if res3b == 'a' else 'FAIL'}")

    s3c = "a"
    t3c = "aa"
    res3c = min_window_substring(s3c, t3c)
    print(f"  s = '{s3c}', t = '{t3c}'")
    print(f"  结果: '{res3c}'")
    print(f"  预期: '' → {'PASS' if res3c == '' else 'FAIL'}")

    s3d = "ab"
    t3d = "b"
    res3d = min_window_substring(s3d, t3d)
    print(f"  s = '{s3d}', t = '{t3d}'")
    print(f"  结果: '{res3d}'")
    print(f"  预期: 'b' → {'PASS' if res3d == 'b' else 'FAIL'}")

    # ---- 汇总 ----
    print("=" * 72)
    print("测试完成")


if __name__ == "__main__":
    _test()
