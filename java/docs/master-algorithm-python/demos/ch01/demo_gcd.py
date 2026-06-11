"""
demo_gcd.py — 欧几里得算法（Euclidean Algorithm）求最大公约数

本文件逐步演示算法设计的完整流程：
  问题分析 → 初步实现 → 测试验证 → 优化迭代 → 最终版本

配合第1章"算法设计的一般流程"使用。
"""

import math
import time
import random


# ============================================================
# 阶段一：问题分析
#
# 问题：给定两个非负整数 a 和 b (不同时为 0)，
#       求它们的最大公约数 GCD(a, b)。
#
# 数学原理：
#   GCD(a, b) = GCD(b, a mod b)
#   当 b = 0 时，GCD(a, 0) = a
#
# 证明概要：
#   设 d | a 且 d | b，则 d | (a - k·b) 对任意整数 k 成立。
#   取 k = ⌊a/b⌋，得 d | (a mod b)。因此 GCD(a,b) = GCD(b, a mod b)。
# ============================================================


# ============================================================
# 阶段二：初步实现 — 递归版欧几里得算法
#
# 复杂度: O(log min(a,b)) 时间, O(log min(a,b)) 空间（递归栈）
# ============================================================
def gcd_recursive(a: int, b: int) -> int:
    if b == 0:
        return a
    return gcd_recursive(b, a % b)


# ============================================================
# 阶段三：优化 — 迭代版欧几里得算法
#
# 消除递归调用栈，仅使用常量空间。
# 复杂度: O(log min(a,b)) 时间, O(1) 空间
# ============================================================
def gcd_iterative(a: int, b: int) -> int:
    while b != 0:
        a, b = b, a % b
    return a


# ============================================================
# 阶段四：增强 — 处理负数和边界情况
#
# 扩展定义：GCD 定义为非负值。gcd(0, 0) 按惯例返回 0。
# ============================================================
def gcd_robust(a: int, b: int) -> int:
    a, b = abs(a), abs(b)
    if a == 0 and b == 0:
        return 0
    if a == 0:
        return b
    if b == 0:
        return a
    while b != 0:
        a, b = b, a % b
    return a


# ============================================================
# 阶段五：扩展 — 扩展欧几里得算法（Extended Euclidean）
#
# 除 GCD 外，还求出系数 x, y 使得：
#   a·x + b·y = GCD(a, b)
#
# 用途：求解模线性方程、RSA 密钥生成等。
# ============================================================
def extended_gcd(a: int, b: int):
    if b == 0:
        return a, 1, 0
    gcd, x1, y1 = extended_gcd(b, a % b)
    x = y1
    y = x1 - (a // b) * y1
    return gcd, x, y


# ============================================================
# 测试验证
# ============================================================
def _test():
    test_cases = [
        (48, 18, 6),
        (56, 98, 14),
        (101, 10, 1),
        (0, 5, 5),
        (7, 0, 7),
        (0, 0, 0),
        (-12, 18, 6),
        (17, 13, 1),
        (100, 100, 100),
        (1024, 256, 256),
    ]

    print("=" * 60)
    print("功能正确性测试")
    print("=" * 60)
    all_pass = True
    for a, b, expected in test_cases:
        r1 = gcd_recursive(a, b)
        r2 = gcd_iterative(a, b)
        r3 = gcd_robust(a, b)
        r4 = extended_gcd(a, b)[0]
        ok = (r1 == r2 == r3 == r4 == expected)
        if not ok:
            all_pass = False
        status = "PASS" if ok else "FAIL"
        print(f"  {status} | a={a:5d} b={b:5d} expected={expected:3d} | "
              f"rec={r1} iter={r2} robust={r3} ext={r4}")

    # 验证扩展欧几里得算法的正确性
    print("\n  扩展欧几里得验证（a*x + b*y = gcd）:")
    for a, b, _ in test_cases[:6]:
        if a == 0 and b == 0:
            continue
        gcd, x, y = extended_gcd(a, b)
        check = a * x + b * y
        status = "PASS" if check == gcd else "FAIL"
        print(f"    {status} | a={a:3d} b={b:3d} gcd={gcd:3d} x={x:5d} y={y:5d} "
              f"a*x+b*y={check}")

    print("\n" + "=" * 60)
    print("性能对比（100,000 次调用）")
    print("=" * 60)
    pairs = [(random.randint(1, 10_000_000), random.randint(1, 10_000_000))
             for _ in range(100_000)]

    for name, fn in [("recursive", gcd_recursive),
                     ("iterative", gcd_iterative),
                     ("robust   ", gcd_robust),
                     ("math.gcd ", math.gcd)]:
        start = time.perf_counter()
        for a, b in pairs:
            fn(a, b)
        elapsed = time.perf_counter() - start
        print(f"  {name} : total={elapsed:.4f}s  avg={elapsed/len(pairs)*1e6:.2f}us")


if __name__ == "__main__":
    _test()