"""
demo_max.py — 查找数组中的最大元素

本文件展示三种不同的实现策略，每种都附带复杂度分析。
配合第1章"算法概述"使用。
"""

from typing import List, Optional
import time
import random


# ============================================================
# 方法一：线性扫描（Linear Scan）
# 复杂度: O(n) 时间, O(1) 空间
# 这是最直观的算法：遍历整个数组，记录当前最大值。
# ============================================================
def find_max_linear(arr: List[int]) -> Optional[int]:
    if not arr:
        return None

    max_val = arr[0]
    for num in arr[1:]:
        if num > max_val:
            max_val = num
    return max_val


# ============================================================
# 方法二：分治法（Divide and Conquer）
# 复杂度: O(n) 时间, O(log n) 空间（递归调用栈）
# 将数组不断二分，分别求出左右子数组的最大值，再比较。
# ============================================================
def find_max_divide_conquer(arr: List[int], left: int, right: int) -> Optional[int]:
    if not arr:
        return None
    # 基本情况：只有一个元素
    if left == right:
        return arr[left]

    mid = (left + right) // 2
    left_max = find_max_divide_conquer(arr, left, mid)
    right_max = find_max_divide_conquer(arr, mid + 1, right)
    return left_max if left_max > right_max else right_max


def find_max_dc_wrapper(arr: List[int]) -> Optional[int]:
    if not arr:
        return None
    return find_max_divide_conquer(arr, 0, len(arr) - 1)


# ============================================================
# 方法三：Python 内置函数（参考基准）
# 复杂度: O(n) 时间, O(1) 空间（C 层面实现，常数极小）
# ============================================================
def find_max_builtin(arr: List[int]) -> Optional[int]:
    if not arr:
        return None
    return max(arr)


# ============================================================
# 简单测试与性能对比
# ============================================================
def _test():
    test_cases = [
        ([3, 1, 4, 1, 5, 9, 2, 6], 9),
        ([-5, -2, -9, -1], -1),
        ([42], 42),
        ([], None),
        ([1, 2, 3, 4, 5], 5),
        ([5, 4, 3, 2, 1], 5),
    ]

    print("=" * 50)
    print("功能正确性测试")
    print("=" * 50)
    for arr, expected in test_cases:
        r1 = find_max_linear(arr)
        r2 = find_max_dc_wrapper(arr)
        r3 = find_max_builtin(arr)
        status = "PASS" if (r1 == expected and r2 == expected and r3 == expected) else "FAIL"
        print(f"  {status} | arr={str(arr):20s} expected={expected} | "
              f"linear={r1} dc={r2} builtin={r3}")

    print("\n" + "=" * 50)
    print("性能对比 (n=10,000,000)")
    print("=" * 50)
    large_arr = [random.randint(-10_000_000, 10_000_000) for _ in range(10_000_000)]

    for name, fn in [("linear  ", find_max_linear),
                     ("dc      ", find_max_dc_wrapper),
                     ("builtin ", find_max_builtin)]:
        start = time.perf_counter()
        result = fn(large_arr)
        elapsed = time.perf_counter() - start
        print(f"  {name} : max={result}, time={elapsed:.4f}s")


if __name__ == "__main__":
    _test()