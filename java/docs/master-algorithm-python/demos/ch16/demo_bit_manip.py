"""
demo_bit_manip.py — 位运算技巧演示

配合第16章"典型问题与解题模板"之 16.4 位运算技巧使用。

演示内容：
  1. 常用位运算技巧 (lowbit, 去掉最低位1, 判2的幂等)
  2. 统计二进制中 1 的个数 (Brian Kernighan 算法)
  3. 判断 2 的幂
  4. 子集枚举 (位掩码法)
  5. 只出现一次的数字 (异或)
"""

from typing import Any, List


# ============================================================
# 1. 常用位运算技巧展示
# ============================================================
def bit_tricks_demo(x: int) -> dict:
    """演示常用位运算技巧，返回结果字典。"""
    return {
        "x": x,
        "binary": bin(x),
        "lowbit (x & -x)": x & -x,
        "drop_lowest_one (x & (x-1))": x & (x - 1),
        "is_power_of_two": x > 0 and (x & (x - 1)) == 0,
        "even? ((x & 1) == 0)": (x & 1) == 0,
    }


# ============================================================
# 2. Count Bits — Brian Kernighan's Algorithm
# ============================================================
def count_bits(n: int) -> int:
    """
    统计二进制中 1 的个数。

    Brian Kernighan 算法：每次 n & (n-1) 去掉最低位的 1。
    """
    count = 0
    while n:
        count += 1
        n &= n - 1
    return count


def count_bits_all(n: int) -> List[int]:
    """
    统计 0 到 n 每个数的二进制中 1 的个数。
    DP 法：ans[i] = ans[i >> 1] + (i & 1)
    """
    ans = [0] * (n + 1)
    for i in range(1, n + 1):
        ans[i] = ans[i >> 1] + (i & 1)
    return ans


# ============================================================
# 3. Power of Two
# ============================================================
def is_power_of_two(n: int) -> bool:
    """
    判断 n 是否为 2 的幂。
    2 的幂的二进制只有一位为 1。
    """
    return n > 0 and (n & (n - 1)) == 0


# ============================================================
# 4. Subset Enumeration
# ============================================================
def subsets(nums: List[int]) -> List[List[int]]:
    """
    子集枚举（位掩码法）。

    对于长度为 n 的数组，有 2ⁿ 个子集。
    将 mask 从 0 到 2ⁿ-1 枚举，第 i 位为 1 表示选第 i 个元素。
    """
    n = len(nums)
    result = []
    for mask in range(1 << n):
        subset = []
        for i in range(n):
            if mask & (1 << i):
                subset.append(nums[i])
        result.append(subset)
    return result


# ============================================================
# 5. Single Number
# ============================================================
def single_number(nums: List[int]) -> int:
    """
    只出现一次的数字。

    利用 a ^ a = 0, a ^ 0 = a。
    将所有数异或，剩下的就是只出现一次的数。
    """
    res = 0
    for num in nums:
        res ^= num
    return res


# ============================================================
# 辅助工具
# ============================================================
def _print_bits(name: str, val: Any):
    """打印位运算结果。"""
    if isinstance(val, int):
        print(f"  {name:>30} = {val:10}  ({bin(val)})")
    else:
        print(f"  {name:>30} = {val}")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("位运算技巧演示")
    print("=" * 72)

    # ---- 1. 常用位运算技巧 ----
    print("-" * 72)
    print("1. 常用位运算技巧")
    print("-" * 72)

    for x in [0, 1, 6, 7, 8, 16, 31]:
        tricks = bit_tricks_demo(x)
        print(f"\n  x = {x:>3}  ({bin(x)})")
        for k, v in tricks.items():
            if k not in ("x", "binary"):
                _print_bits(k, v)

    # ---- 2. Count Bits ----
    print("-" * 72)
    print("2. 统计二进制中 1 的个数")
    print("-" * 72)

    test_nums = [0, 1, 2, 3, 7, 8, 15, 16, 31, 255]
    print(f"\n  {'n':>6} {'bin':>12} {'count':>6}")
    print(f"  {'-' * 28}")
    for n in test_nums:
        cnt = count_bits(n)
        print(f"  {n:>6} {bin(n):>12} {cnt:>6}")

    print("\n  0~15 每个数的 bits 数:")
    ans = count_bits_all(15)
    print(f"  {ans}")
    print(f"  预期: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]")
    expected = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
    print(f"  {'PASS' if ans == expected else 'FAIL'}")

    # ---- 3. Power of Two ----
    print("-" * 72)
    print("3. 判断 2 的幂")
    print("-" * 72)

    test_pow = [0, 1, 2, 3, 4, 5, 8, 16, 32, 64, 100]
    print(f"\n  {'n':>6} {'bin':>12} {'is_power':>10}")
    print(f"  {'-' * 30}")
    for n in test_pow:
        print(f"  {n:>6} {bin(n):>12} {str(is_power_of_two(n)):>10}")

    ok = all(
        is_power_of_two(n) == (n in {1, 2, 4, 8, 16, 32, 64})
        for n in test_pow
    )
    print(f"\n  {'PASS' if ok else 'FAIL'}")

    # ---- 4. Subset Enumeration ----
    print("-" * 72)
    print("4. 子集枚举（位掩码法）")
    print("-" * 72)

    nums4 = [1, 2, 3]
    res4 = subsets(nums4)
    print(f"\n  数组: {nums4}")
    print(f"  子集数: {len(res4)} (预期 8)")
    print(f"  所有子集: {res4}")
    print(f"  预期包含: [], [1], [2], [3], [1,2], [1,3], [2,3], [1,2,3]")

    expected_subsets = {(), (1,), (2,), (3,), (1, 2), (1, 3), (2, 3), (1, 2, 3)}
    actual_subsets = set(tuple(sorted(s)) for s in res4)
    ok4 = len(res4) == 8 and actual_subsets == expected_subsets
    print(f"  {'PASS' if ok4 else 'FAIL'}")

    # ---- 5. Single Number ----
    print("-" * 72)
    print("5. 只出现一次的数字")
    print("-" * 72)

    nums5 = [2, 2, 1]
    res5 = single_number(nums5)
    print(f"  数组: {nums5}")
    print(f"  结果: {res5}")
    print(f"  预期: 1 → {'PASS' if res5 == 1 else 'FAIL'}")

    nums5b = [4, 1, 2, 1, 2]
    res5b = single_number(nums5b)
    print(f"  数组: {nums5b}")
    print(f"  结果: {res5b}")
    print(f"  预期: 4 → {'PASS' if res5b == 4 else 'FAIL'}")

    nums5c = [1]
    res5c = single_number(nums5c)
    print(f"  数组: {nums5c}")
    print(f"  结果: {res5c}")
    print(f"  预期: 1 → {'PASS' if res5c == 1 else 'FAIL'}")

    # ---- 汇总 ----
    print("=" * 72)
    print("测试完成")


if __name__ == "__main__":
    _test()
