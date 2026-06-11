"""
demo_timsort.py — 简化版 TimSort 实现

TimSort 是 Python 内置排序算法，融合了归并排序和插入排序的优势：

  1. 找出数据中的天然有序段（runs）
  2. 用插入排序扩展过短的 runs
  3. 维护一个 run 栈，平衡合并
  4. Galloping mode 加速合并

本文件实现了一个简化但功能完整的 TimSort，用于演示其核心机制。

配合第4章 4.7 节使用。
"""

import random
import time
from typing import List

# TimSort 常量
MIN_RUN = 32


def _insertion_sort_range(a: List[int], left: int, right: int) -> None:
    """对 a[left..right] 进行插入排序（闭区间）"""
    for i in range(left + 1, right + 1):
        key = a[i]
        j = i - 1
        while j >= left and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key


def _count_run(a: List[int], lo: int, hi: int):
    """
    返回从 lo 开始的最长有序段（run）的长度。

    如果检测到降序段，直接反转使其变为升序。
    返回 (run_end_index, is_descending)
    """
    if lo >= hi:
        return lo, False

    if a[lo] <= a[lo + 1]:
        # 升序段
        i = lo + 1
        while i < hi and a[i] <= a[i + 1]:
            i += 1
        return i, False
    else:
        # 降序段 → 反转
        i = lo + 1
        while i < hi and a[i] >= a[i + 1]:
            i += 1
        # 反转 a[lo..i]
        left, right = lo, i
        while left < right:
            a[left], a[right] = a[right], a[left]
            left += 1
            right -= 1
        return i, True


def _merge(left_arr: List[int], right_arr: List[int], dest: List[int],
           lo: int) -> None:
    """合并两个已排序数组到 dest[lo..]"""
    i = j = 0
    k = lo
    while i < len(left_arr) and j < len(right_arr):
        if left_arr[i] <= right_arr[j]:
            dest[k] = left_arr[i]
            i += 1
        else:
            dest[k] = right_arr[j]
            j += 1
        k += 1
    while i < len(left_arr):
        dest[k] = left_arr[i]
        i += 1
        k += 1
    while j < len(right_arr):
        dest[k] = right_arr[j]
        j += 1
        k += 1


def _merge_runs(a: List[int], left: int, mid: int, right: int) -> None:
    """
    合并两个相邻的 run:
      a[left..mid]    (有序)
      a[mid+1..right] (有序)
    结果写入 a[left..right]
    """
    left_part = a[left:mid + 1]
    right_part = a[mid + 1:right + 1]
    _merge(left_part, right_part, a, left)


def _calc_min_run(n: int) -> int:
    """
    计算合适的 min_run 长度。

    TimSort 原始算法：如果 n < 64 则返回 n；
    否则返回一个 32-64 的值，使得 n/min_run 接近 2 的幂。
    """
    r = 0
    while n >= MIN_RUN:
        r |= n & 1
        n >>= 1
    return n + r


def timsort(arr: List[int]) -> List[int]:
    """
    TimSort — 稳定 / 非原地 / O(n log n) / 最好 O(n)

    简化版实现，包含核心机制：
      1. run 识别与扩充
      2. run 栈与合并
      3. 归并排序 + 插入排序混合

    参数：
        arr: 待排序数组

    返回：
        排序后的新数组
    """
    if len(arr) <= 1:
        return arr[:]

    a = arr[:]
    n = len(a)
    min_run = _calc_min_run(n)

    # Phase 1: 将数组分割为 runs，将短的 run 用插入排序扩充
    runs = []
    lo = 0
    while lo < n:
        hi, _ = _count_run(a, lo, n - 1)
        run_len = hi - lo + 1
        if run_len < min_run:
            # 扩充到 min_run 长度
            end = min(lo + min_run - 1, n - 1)
            _insertion_sort_range(a, lo, end)
            hi = end
        runs.append((lo, hi))
        lo = hi + 1

    # Phase 2: 合并 runs（自底向上）
    while len(runs) > 1:
        new_runs = []
        i = 0
        while i < len(runs):
            if i + 1 < len(runs):
                left_lo, left_hi = runs[i]
                right_lo, right_hi = runs[i + 1]
                _merge_runs(a, left_lo, left_hi, right_hi)
                new_runs.append((left_lo, right_hi))
            else:
                new_runs.append(runs[i])
            i += 2
        runs = new_runs

    return a


# ============================================================
# 测试框架
# ============================================================

def _test_correctness():
    """验证简化版 TimSort 的正确性"""
    test_cases = [
        [],
        [1],
        [42, 17],
        [5, 3, 8, 6, 4, 1, 9, 2, 7],
        [1, 2, 3, 4, 5, 6, 7, 8, 9],       # 已排序
        [9, 8, 7, 6, 5, 4, 3, 2, 1],       # 逆序
        [3, 3, 3, 3, 3],                    # 全部相等
        [random.randint(-1000, 1000) for _ in range(500)],
        [random.randint(-10000, 10000) for _ in range(1000)],
    ]

    print("=" * 60)
    print("TimSort 功能正确性测试")
    print("=" * 60)

    all_pass = True
    for tc in test_cases:
        result = timsort(tc)
        expected = sorted(tc)
        ok = result == expected
        if not ok:
            all_pass = False
        status = "PASS" if ok else "FAIL"
        print(f"  {status} | n={len(tc):5d} | {tc[:6]}... → {result[:6]}...")

    print(f"\n结论: {'全部通过' if all_pass else '存在失败'}")


def _test_sorted_property():
    """验证返回结果的有序性"""
    for n in [1, 2, 10, 100, 1000]:
        data = [random.randint(-10000, 10000) for _ in range(n)]
        result = timsort(data)
        sorted_property = all(result[i] <= result[i + 1] for i in range(len(result) - 1))
        status = "PASS" if sorted_property else "FAIL"
        print(f"  {status} | n={n:5d} | ordered={sorted_property}")


def _test_performance():
    """性能对比: TimSort vs Python 内置 sorted"""
    sizes = [100, 1000, 10000, 50000]

    print(f"\n{'=' * 60}")
    print("性能对比（随机整数，毫秒）")
    print(f"{'=' * 60}")
    print(f"{'n':<8} {'TimSort(简化版)':<20} {'Python sorted()':<20}")
    print(f"{'-' * 48}")

    for size in sizes:
        data = [random.randint(-100000, 100000) for _ in range(size)]

        start = time.perf_counter()
        timsort(data)
        timsort_time = time.perf_counter() - start

        start = time.perf_counter()
        sorted(data)
        native_time = time.perf_counter() - start

        ratio = timsort_time / native_time if native_time > 0 else float("inf")
        print(f"{size:<8} {timsort_time * 1000:<20.4f} {native_time * 1000:<20.4f} (x{ratio:.2f})")

    print(f"\n说明: 简化版 TimSort 去除了 galloping mode 等高级优化，")


def _test_data_patterns():
    """不同类型数据上的性能特征"""
    sizes = [100, 1000, 10000]

    print(f"\n{'=' * 60}")
    print("数据模式测试（毫秒）")
    print(f"{'=' * 60}")
    print(f"{'n':<8} {'已排序':<12} {'逆序':<12} {'部分有序':<12} {'随机':<12}")
    print(f"{'-' * 44}")

    for size in sizes:
        base = list(range(size))
        nearly = base[:]
        for _ in range(size // 20):
            i, j = random.sample(range(size), 2)
            nearly[i], nearly[j] = nearly[j], nearly[i]
        reversed_data = list(reversed(base))
        random_data = [random.randint(-100000, 100000) for _ in range(size)]

        times = []
        for data in [base, reversed_data, nearly, random_data]:
            start = time.perf_counter()
            timsort(data)
            elapsed = time.perf_counter() - start
            times.append(elapsed * 1000)

        print(f"{size:<8} {times[0]:<12.4f} {times[1]:<12.4f} {times[2]:<12.4f} {times[3]:<12.4f}")


if __name__ == "__main__":
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "correct"):
        _test_correctness()
    if mode in ("all", "prop"):
        print(f"\n{'=' * 60}")
        print("有序性验证")
        print(f"{'=' * 60}")
        _test_sorted_property()
    if mode in ("all", "perf"):
        _test_performance()
    if mode in ("all", "pattern"):
        _test_data_patterns()

    if mode == "all":
        print(f"\n提示: 运行参数 'correct', 'prop', 'perf', 'pattern' 可单项测试")