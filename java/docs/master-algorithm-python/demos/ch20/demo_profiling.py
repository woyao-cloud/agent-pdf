"""
demo_profiling.py — cProfile 性能分析演示

对比同一算法的四种实现方式，用 cProfile 分析瓶颈，
基于分析结果做出优化决策。

目标：展示"先测量再优化"的工作流。
"""

import cProfile
import pstats
import time
import random
from typing import List, Set


# =====================================================================
# 四种实现：计算两个数组的交集
# =====================================================================

def intersection_brute_force(a: List[int], b: List[int]) -> List[int]:
    """方法一：暴力搜索 — O(n*m)"""
    result = []
    for x in a:
        for y in b:
            if x == y and x not in result:
                result.append(x)
    return result


def intersection_brute_force_set(a: List[int], b: List[int]) -> List[int]:
    """方法二：暴力搜索 + set 去重 — O(n*m) 但避免线性查找"""
    result = set()
    for x in a:
        for y in b:
            if x == y:
                result.add(x)
    return list(result)


def intersection_sort_two_pointers(a: List[int], b: List[int]) -> List[int]:
    """方法三：排序 + 双指针 — O(n log n + m log m)"""
    a_sorted = sorted(a)
    b_sorted = sorted(b)
    result = []
    i = j = 0

    while i < len(a_sorted) and j < len(b_sorted):
        if a_sorted[i] < b_sorted[j]:
            i += 1
        elif a_sorted[i] > b_sorted[j]:
            j += 1
        else:
            if not result or result[-1] != a_sorted[i]:
                result.append(a_sorted[i])
            i += 1
            j += 1

    return result


def intersection_hashtable(a: List[int], b: List[int]) -> List[int]:
    """方法四：哈希集合 — O(n + m)"""
    set_a: Set[int] = set(a)
    return [x for x in set(b) if x in set_a]


# =====================================================================
# 正确性验证
# =====================================================================

def verify_correctness():
    test_cases = [
        ([], [], []),
        ([1, 2, 3], [], []),
        ([], [1, 2, 3], []),
        ([1, 2, 3], [2, 3, 4], [2, 3]),
        ([1, 1, 2, 3], [1, 2, 2, 4], [1, 2]),
        ([5, 5, 5], [5, 5], [5]),
        ([3, 1, 2], [2, 3, 1], [1, 2, 3]),
    ]

    implementations = [
        ("brute_force       ", intersection_brute_force),
        ("brute_force_set   ", intersection_brute_force_set),
        ("sort_two_pointers ", intersection_sort_two_pointers),
        ("hashtable         ", intersection_hashtable),
    ]

    print("=" * 70)
    print("正确性验证")
    print("=" * 70)
    all_pass = True
    for name, fn in implementations:
        for a, b, expected in test_cases:
            result = sorted(fn(a, b))
            expected_sorted = sorted(expected)
            if result != expected_sorted:
                print(f"  FAIL | {name} a={a} b={b} expected={expected_sorted} got={result}")
                all_pass = False
    if all_pass:
        print("  [PASS] 所有测试通过")

    return all_pass


# =====================================================================
# cProfile 分析
# =====================================================================

def run_profiling():
    n = 5000
    a = [random.randint(0, n * 10) for _ in range(n)]
    b = [random.randint(0, n * 10) for _ in range(n)]

    funcs = [
        ("intersection_brute_force     ", intersection_brute_force),
        ("intersection_brute_force_set ", intersection_brute_force_set),
        ("intersection_sort_two_pointers", intersection_sort_two_pointers),
        ("intersection_hashtable       ", intersection_hashtable),
    ]

    print("\n" + "=" * 70)
    print(f"cProfile 分析 (n={n})")
    print("=" * 70)

    for name, fn in funcs:
        profiler = cProfile.Profile()
        profiler.enable()
        result = fn(a, b)
        profiler.disable()

        stats = pstats.Stats(profiler)
        stats.sort_stats('cumtime')

        print(f"\n>>> {name} | result count={len(result)}")
        stats.print_stats(3)


# =====================================================================
# 手动时间基准（更精确的 wall-clock 对比）
# =====================================================================

def run_benchmark():
    sizes = [100, 1000, 5000, 20000]

    funcs = [
        ("brute_force       ", intersection_brute_force),
        ("brute_force_set   ", intersection_brute_force_set),
        ("sort_two_pointers ", intersection_sort_two_pointers),
        ("hashtable         ", intersection_hashtable),
    ]

    print("\n" + "=" * 70)
    header = f"{'n':>8}"
    for name, _ in funcs:
        header += f" {name:>18}"
    print(header)
    print("-" * 70)

    for n in sizes:
        a = [random.randint(0, n * 10) for _ in range(n)]
        b = [random.randint(0, n * 10) for _ in range(n)]

        row = f"{n:>8}"
        for name, fn in funcs:
            arr_a = a.copy()
            arr_b = b.copy()
            start = time.perf_counter()
            fn(arr_a, arr_b)
            elapsed = time.perf_counter() - start
            row += f" {elapsed:>18.6f}s"

        print(row)


# =====================================================================
# 基于分析结果的优化决策
# =====================================================================

def show_optimization_decision():
    print("\n" + "=" * 70)
    print("基于性能分析数据的优化决策")
    print("=" * 70)

    decisions = [
        ("暴力搜索 (O(n*m))", "[NO ] 不适用", "n=5000 时耗时 >1s，复杂度随数据量平方增长"),
        ("暴力 + set 去重 (O(n*m))", "[NO ] 不适用", "虽改用 set 去重，但双重循环仍是瓶颈"),
        ("排序 + 双指针 (O(n log n))", "[YES] 大数据量适用", "适合输入数据需要排序的场景"),
        ("哈希集合 (O(n+m))", "[BEST] 最优选择", "线性复杂度，代码最简洁，综合性能最好"),
    ]

    print(f"\n{'方法':<28} {'结论':<18} {'理由'}")
    print("-" * 70)
    for method, conclusion, reason in decisions:
        print(f"{method:<28} {conclusion:<18} {reason}")

    print()
    print("最终推荐：在生产代码中使用 intersection_hashtable")
    print("理由：1) O(n+m) 时间复杂度  2) 代码最简洁  3) 内存开销可控")


if __name__ == "__main__":
    if verify_correctness():
        run_profiling()
        run_benchmark()
        show_optimization_decision()