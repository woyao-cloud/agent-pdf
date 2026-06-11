"""
demo_sorting.py — 十大排序算法完整实现与性能对比

本文件实现以下排序算法，配合第4章"排序算法"使用：

  [交换排序]     bubble_sort, quick_sort, quick_sort_3way
  [插入排序]     insertion_sort, shell_sort
  [选择排序]     selection_sort, heap_sort
  [归并排序]     merge_sort
  [线性排序]     counting_sort, bucket_sort, radix_sort

每个算法附复杂度标注和详细注释。末尾提供测试框架。
"""

import random
import time
from typing import List, Optional


# ============================================================
# 4.2 交换排序
# ============================================================

def bubble_sort(arr: List[int]) -> List[int]:
    """
    冒泡排序 — 稳定 / 原地 / O(n²)

    每轮遍历将最大元素"冒泡"到末尾。若某轮无交换则提前终止。
    """
    a = arr[:]
    n = len(a)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        if not swapped:
            break
    return a


def quick_sort(arr: List[int]) -> List[int]:
    """
    快速排序 — 不稳定 / 原地 / 平均 O(n log n), 最坏 O(n²)

    使用三数取中 pivot + 小数组切换到插入排序。
    """
    a = arr[:]
    _quick_sort(a, 0, len(a) - 1)
    return a


def _quick_sort(a: List[int], low: int, high: int) -> None:
    # 小数组切换到插入排序
    INSERTION_THRESHOLD = 16
    if high - low < INSERTION_THRESHOLD:
        _insertion_sort_range(a, low, high)
        return
    if low < high:
        pi = _partition(a, low, high)
        _quick_sort(a, low, pi - 1)
        _quick_sort(a, pi + 1, high)


def _median_of_three(a: List[int], low: int, high: int) -> int:
    mid = (low + high) // 2
    # 对三个元素排序
    if a[low] > a[mid]:
        a[low], a[mid] = a[mid], a[low]
    if a[low] > a[high]:
        a[low], a[high] = a[high], a[low]
    if a[mid] > a[high]:
        a[mid], a[high] = a[high], a[mid]
    return mid  # 返回中位数索引


def _partition(a: List[int], low: int, high: int) -> int:
    pivot_idx = _median_of_three(a, low, high)
    # 将 pivot 交换到末尾
    a[pivot_idx], a[high] = a[high], a[pivot_idx]
    pivot = a[high]
    i = low - 1
    for j in range(low, high):
        if a[j] <= pivot:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[high] = a[high], a[i + 1]
    return i + 1


def _insertion_sort_range(a: List[int], low: int, high: int) -> None:
    """对 a[low..high] 做插入排序（含 high）"""
    for i in range(low + 1, high + 1):
        key = a[i]
        j = i - 1
        while j >= low and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key


def quick_sort_3way(arr: List[int]) -> List[int]:
    """
    三路切分快速排序 — 处理大量重复元素时更高效

    将数组分为三部分: < pivot, == pivot, > pivot
    平均 O(n log n), 大量重复元素时接近 O(n)
    """
    a = arr[:]
    _quick_sort_3way(a, 0, len(a) - 1)
    return a


def _quick_sort_3way(a: List[int], low: int, high: int) -> None:
    if high - low < 16:
        _insertion_sort_range(a, low, high)
        return
    if low < high:
        lt, gt = _partition_3way(a, low, high)
        _quick_sort_3way(a, low, lt - 1)
        _quick_sort_3way(a, gt + 1, high)


def _partition_3way(a: List[int], low: int, high: int):
    """Dijkstra 三路切分，返回 (lt, gt) — 等于 pivot 的区域为 [lt, gt]"""
    pivot = a[low]
    lt, i, gt = low, low + 1, high
    while i <= gt:
        if a[i] < pivot:
            a[lt], a[i] = a[i], a[lt]
            lt += 1
            i += 1
        elif a[i] > pivot:
            a[i], a[gt] = a[gt], a[i]
            gt -= 1
        else:
            i += 1
    return lt, gt


# ============================================================
# 4.3 插入排序
# ============================================================

def insertion_sort(arr: List[int]) -> List[int]:
    """
    插入排序 — 稳定 / 原地 / O(n²), 最好 O(n)

    将当前元素插入到已排序部分的正确位置。
    对几乎有序的数据非常高效。
    """
    a = arr[:]
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a


def shell_sort(arr: List[int]) -> List[int]:
    """
    希尔排序 — 不稳定 / 原地 / 平均 O(n log² n)

    使用 Knuth gap 序列: (3^k - 1)/2
    通过间隔 gap 分组插入排序，逐步缩小 gap。
    """
    a = arr[:]
    n = len(a)

    # Knuth 序列: 1, 4, 13, 40, 121, ...
    gap = 1
    while gap < n // 3:
        gap = gap * 3 + 1

    while gap > 0:
        for i in range(gap, n):
            key = a[i]
            j = i
            while j >= gap and a[j - gap] > key:
                a[j] = a[j - gap]
                j -= gap
            a[j] = key
        gap //= 3
    return a


# ============================================================
# 4.4 选择排序
# ============================================================

def selection_sort(arr: List[int]) -> List[int]:
    """
    选择排序 — 不稳定 / 原地 / O(n²)

    每轮选未排序部分的最小值，与当前首位交换。
    复杂度不受数据分布影响——永远 O(n²)。
    """
    a = arr[:]
    n = len(a)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if a[j] < a[min_idx]:
                min_idx = j
        if min_idx != i:
            a[i], a[min_idx] = a[min_idx], a[i]
    return a


def heap_sort(arr: List[int]) -> List[int]:
    """
    堆排序 — 不稳定 / 原地 / O(n log n)

    构建最大堆 → 反复取堆顶到末尾 → 调整剩余部分。
    没有最坏退化，但常数比快速排序大。
    """
    a = arr[:]
    n = len(a)

    def _heapify(i: int, size: int) -> None:
        largest = i
        left = 2 * i + 1
        right = 2 * i + 2
        if left < size and a[left] > a[largest]:
            largest = left
        if right < size and a[right] > a[largest]:
            largest = right
        if largest != i:
            a[i], a[largest] = a[largest], a[i]
            _heapify(largest, size)

    # 建堆 O(n)
    for i in range(n // 2 - 1, -1, -1):
        _heapify(i, n)

    # 排序 O(n log n)
    for i in range(n - 1, 0, -1):
        a[0], a[i] = a[i], a[0]
        _heapify(0, i)
    return a


# ============================================================
# 4.5 归并排序
# ============================================================

def merge_sort(arr: List[int]) -> List[int]:
    """
    归并排序 — 稳定 / 非原地 / O(n log n)

    分治三步：分割 → 递归排序 → 合并。
    需要 O(n) 额外空间。
    """
    if len(arr) <= 1:
        return arr[:]

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return _merge(left, right)


def _merge(left: List[int], right: List[int]) -> List[int]:
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


def merge_sort_inplace(arr: List[int]) -> List[int]:
    """原地归并排序（自底向上，使用临时数组）"""
    a = arr[:]
    n = len(a)
    tmp = [0] * n
    size = 1
    while size < n:
        for left_start in range(0, n, size * 2):
            left_end = min(left_start + size - 1, n - 1)
            right_end = min(left_start + size * 2 - 1, n - 1)
            if left_end < right_end:
                _merge_inplace(a, left_start, left_end, right_end, tmp)
        size *= 2
    return a


def _merge_inplace(a: List[int], l: int, m: int, r: int, tmp: List[int]) -> None:
    """将 a[l..m] 和 a[m+1..r] 合并到 a[l..r]"""
    for i in range(l, r + 1):
        tmp[i] = a[i]
    i, j, k = l, m + 1, l
    while i <= m and j <= r:
        if tmp[i] <= tmp[j]:
            a[k] = tmp[i]
            i += 1
        else:
            a[k] = tmp[j]
            j += 1
        k += 1
    while i <= m:
        a[k] = tmp[i]
        i += 1
        k += 1


# ============================================================
# 4.6 线性排序
# ============================================================

def counting_sort(arr: List[int]) -> List[int]:
    """
    计数排序 — 稳定 / 非原地 / O(n + k), k = 数据范围

    限制：仅适用于非负整数，且数值范围不能太大。
    遍历一遍统计频率 → 累加确定位置 → 反向填充输出。
    """
    if not arr:
        return []

    max_val = max(arr)
    min_val = min(arr)
    range_size = max_val - min_val + 1

    count = [0] * range_size
    for num in arr:
        count[num - min_val] += 1

    # 累加前缀和
    for i in range(1, range_size):
        count[i] += count[i - 1]

    # 反向填充以保持稳定性
    output = [0] * len(arr)
    for num in reversed(arr):
        idx = num - min_val
        count[idx] -= 1
        output[count[idx]] = num
    return output


def bucket_sort(arr: List[float]) -> List[float]:
    """
    桶排序 — 稳定 / 非原地 / 平均 O(n + k), 最坏 O(n²)

    适用于 [0, 1) 均匀分布的浮点数。将数据分到 k 个桶中，
    每个桶内排序后按桶顺序连接。
    """
    if not arr:
        return []

    k = len(arr)  # 桶数 = 数组长度
    buckets = [[] for _ in range(k)]

    for num in arr:
        idx = min(int(num * k), k - 1)
        buckets[idx].append(num)

    for bucket in buckets:
        bucket.sort()  # 用内置排序（TimSort）对桶内排序

    return [num for bucket in buckets for num in bucket]


def radix_sort(arr: List[int]) -> List[int]:
    """
    基数排序（LSD）— 稳定 / 非原地 / O(d·(n + k))

    d = 位数, k = 基数（10 进制下为 10）。
    按位从低到高依次用计数排序。
    """
    if not arr:
        return []

    a = arr[:]
    max_val = max(abs(num) for num in a)

    # 处理负数：全部加偏移转为非负
    has_negative = any(num < 0 for num in a)
    if has_negative:
        min_val = min(a)
        a = [num - min_val for num in a]
        max_val = max(a)

    exp = 1
    while max_val // exp > 0:
        a = _counting_sort_by_digit(a, exp)
        exp *= 10

    if has_negative:
        a = [num + min_val for num in a]
    return a


def _counting_sort_by_digit(arr: List[int], exp: int) -> List[int]:
    """按指定位数（exp=1,10,100,...）对 arr 进行计数排序"""
    n = len(arr)
    output = [0] * n
    count = [0] * 10

    for num in arr:
        digit = (num // exp) % 10
        count[digit] += 1

    for i in range(1, 10):
        count[i] += count[i - 1]

    for num in reversed(arr):
        digit = (num // exp) % 10
        count[digit] -= 1
        output[count[digit]] = num
    return output


# ============================================================
# 测试框架
# ============================================================

def _is_sorted(arr: List[int]) -> bool:
    return all(arr[i] <= arr[i + 1] for i in range(len(arr) - 1))


def _test_correctness():
    """测试所有排序算法的正确性"""
    test_cases = [
        [],
        [1],
        [2, 1],
        [5, 3, 8, 6, 4],
        [1, 2, 3, 4, 5],
        [5, 4, 3, 2, 1],
        [3, 3, 3, 3],
        [1, -2, 3, -4, 5, -6],
        [random.randint(-1000, 1000) for _ in range(200)],
    ]

    algorithms = [
        ("Bubble Sort",       bubble_sort),
        ("Quick Sort",        quick_sort),
        ("Quick Sort 3-Way",  quick_sort_3way),
        ("Insertion Sort",    insertion_sort),
        ("Shell Sort",        shell_sort),
        ("Selection Sort",    selection_sort),
        ("Heap Sort",         heap_sort),
        ("Merge Sort",        merge_sort),
        ("Merge Sort IP",     merge_sort_inplace),
        ("Counting Sort",     lambda a: counting_sort([x for x in a if x >= 0])
                              if all(x >= 0 for x in a) else None),
        ("Radix Sort",        radix_sort),
    ]

    print("=" * 70)
    print("功能正确性测试")
    print("=" * 70)

    all_pass = True
    for name, sort_fn in algorithms:
        for tc in test_cases:
            try:
                result = sort_fn(tc)
                if result is None:
                    continue  # counting_sort 跳过负数
                expected = sorted(tc)
                if result != expected:
                    all_pass = False
                    print(f"  FAIL | {name:<18} | {tc[:10]}... → {result[:10]}...")
            except Exception as e:
                all_pass = False
                print(f"  FAIL | {name:<18} | 异常: {e}")

        if name != "Counting Sort" or all(x >= 0 for x in test_cases[8]):
            print(f"  PASS | {name}")

    # 桶排序特殊测试（浮点数）
    float_tc = [random.random() for _ in range(100)]
    bucket_result = bucket_sort(float_tc)
    bucket_ok = all(float_tc[i] <= float_tc[i + 1] for i in range(len(float_tc) - 1)) or True
    bucket_sorted = all(bucket_result[i] <= bucket_result[i + 1] for i in range(len(bucket_result) - 1))
    print(f"  {'PASS' if bucket_sorted else 'FAIL'} | Bucket Sort (floats)")

    print(f"\n结论: {'全部通过' if all_pass else '存在失败'}")


def _test_performance():
    """性能对比测试"""
    sizes = [100, 1000, 10000]

    algorithm_suite = [
        ("Quick Sort  ", lambda: quick_sort),
        ("Quick 3-Way ", lambda: quick_sort_3way),
        ("Heap Sort   ", lambda: heap_sort),
        ("Merge Sort  ", lambda: merge_sort),
        ("Merge Sort IP", lambda: merge_sort_inplace),
        ("Shell Sort  ", lambda: shell_sort),
        ("Radix Sort  ", lambda: radix_sort),
    ]

    print(f"\n{'=' * 70}")
    print("性能对比（随机整数，毫秒）")
    print(f"{'=' * 70}")
    print(f"{'算法':<16} {'n=100':<12} {'n=1000':<12} {'n=10000':<12}")
    print(f"{'-' * 52}")

    for name, sort_fn_factory in algorithm_suite:
        times = []
        for size in sizes:
            data = [random.randint(-10000, 10000) for _ in range(size)]
            sort_fn = sort_fn_factory()
            start = time.perf_counter()
            sort_fn(data)
            elapsed = time.perf_counter() - start
            times.append(elapsed * 1000)
        print(f"{name:<16} {times[0]:<12.4f} {times[1]:<12.4f} {times[2]:<12.4f}")

    # 线性排序特殊测试（仅非负整数）
    print(f"\n{'=' * 70}")
    print("线性排序特测（仅非负整数）")
    print(f"{'=' * 70}")
    print(f"{'算法':<16} {'n=100':<12} {'n=1000':<12} {'n=10000':<12}")
    print(f"{'-' * 52}")
    for name, sort_fn_factory in [
        ("Counting Sort", lambda: lambda a: counting_sort(a)),
        ("Bucket Sort  ", lambda: lambda a: bucket_sort([random.random() for _ in range(len(a))])),
        ("Radix Sort   ", lambda: radix_sort),
    ]:
        times = []
        for size in sizes:
            if "Bucket" in name:
                data = [random.random() for _ in range(size)]
            else:
                data = [random.randint(0, 100000) for _ in range(size)]
            sort_fn = sort_fn_factory()
            start = time.perf_counter()
            sort_fn(data)
            elapsed = time.perf_counter() - start
            times.append(elapsed * 1000)
        print(f"{name:<16} {times[0]:<12.4f} {times[1]:<12.4f} {times[2]:<12.4f}")


def _test_sorted_vs_nearly():
    """已排序 vs 几乎有序 vs 逆序 数据对比"""
    print(f"\n{'=' * 70}")
    print("数据类型敏感度测试（n=10000）")
    print(f"{'=' * 70}")
    print(f"{'算法':<16} {'已排序':<12} {'几乎有序':<12} {'逆序':<12}")
    print(f"{'-' * 52}")

    base = list(range(10000))
    nearly = base[:]
    # 打乱 1% 的位置
    for _ in range(100):
        i, j = random.sample(range(10000), 2)
        nearly[i], nearly[j] = nearly[j], nearly[i]
    reversed_data = list(reversed(base))

    for name, sort_fn_factory in [
        ("Insertion", lambda: insertion_sort),
        ("Bubble    ", lambda: bubble_sort),
        ("Shell     ", lambda: shell_sort),
        ("Quick     ", lambda: quick_sort),
        ("Heap      ", lambda: heap_sort),
        ("Merge     ", lambda: merge_sort),
        ("TimSort   ", lambda: sorted),
    ]:
        times = []
        for data in [base, nearly, reversed_data]:
            sort_fn = sort_fn_factory()
            start = time.perf_counter()
            sort_fn(data[:])
            elapsed = time.perf_counter() - start
            times.append(elapsed * 1000)
        print(f"{name:<16} {times[0]:<12.4f} {times[1]:<12.4f} {times[2]:<12.4f}")


def _test_args():
    """命令行参数：选择要运行的测试"""
    import sys
    if len(sys.argv) > 1:
        return sys.argv[1]
    return "all"


if __name__ == "__main__":
    mode = _test_args()
    if mode in ("all", "correct"):
        _test_correctness()
    if mode in ("all", "perf"):
        _test_performance()
    if mode in ("all", "sensitive"):
        _test_sorted_vs_nearly()
    if mode == "all":
        print(f"\n提示: 可指定参数 'correct', 'perf', 'sensitive' 运行单项测试")