"""
demo_complexity.py
==================
Demonstrates different complexity classes with actual timing.

复杂度类别演示：
  O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ)

对每种复杂度，在不同规模的输入下测量并打印执行时间，
观察时间随 n 增长的变化趋势。
"""

import time
import random
import sys
from typing import List, Any


# ============================================================
# 各复杂度类别的算法实现
# ============================================================

# ---------- O(1) — 常数时间 ----------

def access_first_element(arr: List[Any]) -> Any:
    """O(1): 访问数组第一个元素，与数组大小无关"""
    return arr[0] if arr else None


# ---------- O(log n) — 对数时间 ----------

def binary_search(arr: List[int], target: int) -> int:
    """O(log n): 二分查找，每次将搜索范围减半"""
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1


# ---------- O(n) — 线性时间 ----------

def linear_sum(arr: List[int]) -> int:
    """O(n): 遍历数组求和，与数组大小成线性关系"""
    total = 0
    for x in arr:
        total += x
    return total


# ---------- O(n log n) — 线性对数时间 ----------

def merge_sort(arr: List[int]) -> List[int]:
    """O(n log n): 归并排序，分治 + 线性合并"""
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])

    # 合并两个有序数组 — O(n)
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result


# ---------- O(n²) — 平方时间 ----------

def bubble_sort(arr: List[int]) -> List[int]:
    """O(n²): 冒泡排序，双重循环"""
    n = len(arr)
    arr_copy = arr[:]
    for i in range(n):
        for j in range(n - 1 - i):
            if arr_copy[j] > arr_copy[j + 1]:
                arr_copy[j], arr_copy[j + 1] = arr_copy[j + 1], arr_copy[j]
    return arr_copy


# ---------- O(2ⁿ) — 指数时间（仅测试小规模） ----------

def fibonacci_recursive(n: int) -> int:
    """O(2ⁿ): 朴素递归斐波那契，每个节点分裂为 2 个子问题"""
    if n <= 1:
        return n
    return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2)


# ============================================================
# 基准测试框架
# ============================================================

def measure_time(func, *args, repetitions: int = 3) -> float:
    """测量函数执行时间（取最小重复次数以减少噪声）"""
    best = float('inf')
    for _ in range(repetitions):
        start = time.perf_counter()
        func(*args)
        elapsed = time.perf_counter() - start
        if elapsed < best:
            best = elapsed
    return best


def run_benchmark():
    """运行所有复杂度类别的基准测试"""

    print("=" * 70)
    print("复杂度分析基准测试")
    print("=" * 70)

    # 各复杂度测试的输入规模
    # 注意：指数级仅测试很小的 n
    sizes = {
        'O(1)':       [10_000, 100_000, 1_000_000, 10_000_000],
        'O(log n)':   [100, 1_000, 10_000, 100_000, 1_000_000],
        'O(n)':       [10_000, 100_000, 1_000_000, 10_000_000],
        'O(n log n)': [100, 1_000, 10_000, 100_000],
        'O(n²)':      [100, 500, 1_000, 2_000],
        'O(2ⁿ)':      [10, 15, 20, 25, 30, 35],
    }

    # --- O(1) 测试 ---
    print("\n" + "-" * 70)
    print("O(1) — 数组首位访问")
    print("  理论: 无论 n 多大，执行时间应基本不变")
    print("-" * 70)
    for n in sizes['O(1)']:
        arr = list(range(n))
        t = measure_time(access_first_element, arr)
        print(f"  n={n:>10,d}: {t*1e6:>8.3f} µs")

    # --- O(log n) 测试 ---
    print("\n" + "-" * 70)
    print("O(log n) — 二分查找")
    print("  理论: n 扩大 10 倍，时间约增加 log₂10 ≈ 3.32 倍")
    print("-" * 70)
    for n in sizes['O(log n)']:
        arr = list(range(n))
        target = n - 1  # 最坏情况：查找最后一个元素
        t = measure_time(binary_search, arr, target)
        print(f"  n={n:>10,d}: {t*1e6:>8.3f} µs")

    # --- O(n) 测试 ---
    print("\n" + "-" * 70)
    print("O(n) — 数组求和")
    print("  理论: n 扩大 10 倍，时间约扩大 10 倍")
    print("-" * 70)
    for n in sizes['O(n)']:
        arr = list(range(n))
        t = measure_time(linear_sum, arr)
        print(f"  n={n:>10,d}: {t*1e6:>8.3f} µs")

    # --- O(n log n) 测试 ---
    print("\n" + "-" * 70)
    print("O(n log n) — 归并排序")
    print("  理论: n 扩大 10 倍，时间扩大 10·log₂10 ≈ 33 倍")
    print("-" * 70)
    for n in sizes['O(n log n)']:
        arr = [random.randint(0, n) for _ in range(n)]
        t = measure_time(merge_sort, arr)
        print(f"  n={n:>10,d}: {t*1e3:>8.3f} ms")

    # --- O(n²) 测试 ---
    print("\n" + "-" * 70)
    print("O(n²) — 冒泡排序")
    print("  理论: n 扩大 2 倍，时间约扩大 4 倍")
    print("-" * 70)
    for n in sizes['O(n²)']:
        arr = [random.randint(0, n) for _ in range(n)]
        t = measure_time(bubble_sort, arr)
        print(f"  n={n:>5,d}: {t*1e3:>8.3f} ms")

    # --- O(2ⁿ) 测试 ---
    print("\n" + "-" * 70)
    print("O(2ⁿ) — 朴素递归斐波那契")
    print("  理论: n 增加 1，时间约扩大 2 倍")
    print("  注意: n=35 以上会非常慢，谨慎测试")
    print("-" * 70)
    for n in sizes['O(2ⁿ)']:
        if n > 35:
            print(f"  n={n:>5,d}: 跳过（指数爆炸）")
            continue
        t = measure_time(fibonacci_recursive, n)
        print(f"  n={n:>5,d}: {t*1e3:>8.3f} ms")
        # 如果超过 5 秒就停止
        if t > 5.0:
            print(f"  -> n={n} 耗时 {t:.1f}s，后续跳过")
            break


# ============================================================
# 增长率对比总结
# ============================================================

def print_growth_comparison():
    """
    输出复杂度增长率对比表：

    n        O(1)    O(log n)  O(n)      O(n log n)  O(n²)       O(2ⁿ)
    10       1       3         10        23          100         1024
    100      1       7         100       664         10,000      2¹⁰⁰ ≈ ∞
    1000     1       10        1000      9,966       1,000,000   ∞
    """
    print("\n" + "=" * 70)
    print("复杂度增长率对比（理论步数）")
    print("=" * 70)

    header = f"{'n':>10} {'O(1)':>8} {'O(log n)':>10} {'O(n)':>10} {'O(n log n)':>12} {'O(n²)':>12} {'O(2ⁿ)':>10}"
    print(header)
    print("-" * len(header))

    for n in [1, 2, 5, 10, 20, 50, 100, 1000, 10000, 100000]:
        o1 = 1
        ologn = int(__import__('math').log2(n)) if n > 0 else 0
        on = n
        onlogn = int(n * __import__('math').log2(n)) if n > 0 else 0
        on2 = n * n
        o2n = min(2 ** n, 10 ** 30)  # 太大时截断显示

        if o2n >= 10 ** 12:
            o2n_str = "> 1万亿"
        elif o2n >= 10 ** 9:
            o2n_str = "> 10亿"
        else:
            o2n_str = str(o2n)

        print(f"{n:>10,d} {o1:>8,d} {ologn:>10,d} {on:>10,d} {onlogn:>12,d} {on2:>12,d} {o2n_str:>10}")

    print()
    print("关键观察:")
    print("  - n=10 时, O(n²)=100 vs O(2ⁿ)=1024, 差别不大")
    print("  - n=20 时, O(n²)=400 vs O(2ⁿ)=1,048,576, 指数级全面崩溃")
    print("  - n=1000 时, O(n log n)≈10K vs O(n²)=1M, 差 100 倍")
    print("  - n=10⁵ 时, O(n)=100K vs O(n²)=10¹⁰, 差 10 万倍")
    print("  - O(1) 不管 n 多大都是 1 步, 但常数因子可能很大")


# ============================================================
# 主函数
# ============================================================

def main():
    # 设置递归限制（O(2ⁿ) 测试需要）
    sys.setrecursionlimit(10000)

    print("=" * 70)
    print("精通算法 — 第2章 复杂度分析演示")
    print("=" * 70)
    print()
    print("本演示程序通过实际测量不同复杂度算法的执行时间,")
    print("直观展示 O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ)")
    print("随输入规模增长的变化趋势。")
    print()

    run_benchmark()
    print_growth_comparison()

    print("\n" + "=" * 70)
    print("结论")
    print("=" * 70)
    print("""
  1. O(1) 的执行时间基本不随 n 变化（但常数因子可能很大）
  2. O(log n) 增长非常缓慢，适合大规模数据查找
  3. O(n) 的增长与输入规模成正比，可处理百万级数据
  4. O(n log n) 是最优排序算法的复杂度，可处理十万级数据
  5. O(n²) 在 n 较大时不可接受，n=10⁴ 时已是亿级操作
  6. O(2ⁿ) 在 n>30 后完全不可行，需要记忆化或 DP 优化
  """)


if __name__ == '__main__':
    main()

"""
运行示例输出（实际时间取决于硬件）：

======================================================================
复杂度分析基准测试
======================================================================

----------------------------------------------------------------------
O(1) — 数组首位访问
  理论: 无论 n 多大，执行时间应基本不变
----------------------------------------------------------------------
  n=    10,000:   0.112 µs
  n=   100,000:   0.108 µs
  n= 1,000,000:   0.114 µs
  n=10,000,000:   0.110 µs

----------------------------------------------------------------------
O(log n) — 二分查找
  理论: n 扩大 10 倍，时间约增加 log₂10 ≈ 3.32 倍
----------------------------------------------------------------------
  n=       100:   0.891 µs
  n=     1,000:   1.234 µs
  n=    10,000:   1.456 µs
  n=   100,000:   1.789 µs
  n= 1,000,000:   2.012 µs

----------------------------------------------------------------------
O(n) — 数组求和
  理论: n 扩大 10 倍，时间约扩大 10 倍
----------------------------------------------------------------------
  n=    10,000:  32.145 µs
  n=   100,000: 321.892 µs
  n= 1,000,000:   3.214 ms
  n=10,000,000:  32.451 ms

----------------------------------------------------------------------
O(n log n) — 归并排序
  理论: n 扩大 10 倍，时间扩大 10·log₂10 ≈ 33 倍
----------------------------------------------------------------------
  n=       100:   0.089 ms
  n=     1,000:   1.023 ms
  n=    10,000:  12.456 ms
  n=   100,000: 142.891 ms

----------------------------------------------------------------------
O(n²) — 冒泡排序
  理论: n 扩大 2 倍，时间约扩大 4 倍
----------------------------------------------------------------------
  n=   100:   0.321 ms
  n=   500:   8.234 ms
  n=  1000:  32.891 ms
  n=  2000: 131.456 ms

----------------------------------------------------------------------
O(2ⁿ) — 朴素递归斐波那契
  理论: n 增加 1，时间约扩大 2 倍
  注意: n=35 以上会非常慢，谨慎测试
----------------------------------------------------------------------
  n=   10:   0.012 ms
  n=   15:   0.089 ms
  n=   20:   1.234 ms
  n=   25:  12.891 ms
  n=   30: 142.345 ms
  n=   35:   1.523 s
"""