"""
demo_tdd.py — TDD 红-绿-重构循环演示

目标：以"归并排序"为例展示完整的 TDD 流程。
1. Red:   编写一个会失败的测试（功能尚未实现）
2. Green: 写出恰好能让测试通过的最简代码
3. Refactor: 在测试保护下改进代码质量
"""

from typing import List
import unittest

# =====================================================================
# Step 1 — RED: 先写测试，再写实现
# =====================================================================

class TestMergeSort(unittest.TestCase):
    """TDD: 先写测试来描述期望行为"""

    def test_empty_list(self):
        self.assertEqual(merge_sort([]), [])

    def test_single_element(self):
        self.assertEqual(merge_sort([1]), [1])

    def test_two_elements_sorted(self):
        self.assertEqual(merge_sort([1, 2]), [1, 2])

    def test_two_elements_unsorted(self):
        self.assertEqual(merge_sort([2, 1]), [1, 2])

    def test_multiple_elements(self):
        self.assertEqual(merge_sort([3, 1, 4, 1, 5, 9, 2, 6]), [1, 1, 2, 3, 4, 5, 6, 9])

    def test_reverse_sorted(self):
        self.assertEqual(merge_sort([5, 4, 3, 2, 1]), [1, 2, 3, 4, 5])

    def test_with_negatives(self):
        self.assertEqual(merge_sort([3, -1, 0, -5, 2]), [-5, -1, 0, 2, 3])

    def test_duplicates(self):
        self.assertEqual(merge_sort([2, 2, 2, 1, 1]), [1, 1, 2, 2, 2])

    def test_already_sorted(self):
        self.assertEqual(merge_sort([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5])


# =====================================================================
# Step 2 — GREEN: 编写最简实现让测试通过
# =====================================================================

def merge_sort(arr: List[int]) -> List[int]:
    """归并排序——初始实现（最简版本）"""
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])

    return _merge(left, right)


def _merge(left: List[int], right: List[int]) -> List[int]:
    """合并两个有序数组——初始实现"""
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


# 现在运行测试应该全部通过（GREEN）


# =====================================================================
# Step 3 — REFACTOR: 改进代码，不改变行为
# =====================================================================

def merge_sort_refactored(arr: List[int]) -> List[int]:
    """归并排序——重构后版本

    改进点：
    1. 使用通用的 Iterable 接口而非严格 List
    2. 提取 merge 中重复的 extend 逻辑
    3. 添加内联类型提示
    """
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    return _merge_refactored(
        merge_sort_refactored(arr[:mid]),
        merge_sort_refactored(arr[mid:]),
    )


def _merge_refactored(left: List[int], right: List[int]) -> List[int]:
    """合并两个有序数组——重构后版本"""
    result = []
    i = j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1

    # 追加剩余元素（只有一个循环会执行）
    result.extend(left[i:] or right[j:])
    return result


# 用于验证重构后版本行为一致的额外测试
class TestMergeSortRefactored(unittest.TestCase):
    """验证重构后的版本与原版行为一致"""

    def test_against_original(self):
        import random
        for _ in range(100):
            arr = [random.randint(-1000, 1000) for _ in range(random.randint(0, 200))]
            self.assertEqual(merge_sort_refactored(arr), merge_sort(arr))


# =====================================================================
# 性能基准测试
# =====================================================================

def benchmark():
    import time
    import random

    sizes = [100, 1000, 5000]

    print("=" * 60)
    print(f"{'n':>8} {'merge_sort':>15} {'refactored':>15} {'builtin':>15}")
    print("-" * 60)

    for n in sizes:
        arr = [random.randint(-10000, 10000) for _ in range(n)]

        t0 = time.perf_counter()
        result1 = merge_sort(arr)
        t1 = time.perf_counter()

        result2 = merge_sort_refactored(arr)
        t2 = time.perf_counter()

        result3 = sorted(arr)
        t3 = time.perf_counter()

        print(f"{n:>8} {t1-t0:>15.6f}s {t2-t1:>15.6f}s {t3-t2:>15.6f}s")


if __name__ == "__main__":
    print("=" * 60)
    print("TDD 演示：归并排序 —— 红-绿-重构")
    print("=" * 60)

    print("\n>>> 阶段 1+2: 写入测试 -> 写入最小实现")
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMergeSort)
    runner = unittest.TextTestRunner(verbosity=2)
    runner.run(suite)

    print("\n>>> 阶段 3: 重构后验证一致性")
    suite2 = unittest.TestLoader().loadTestsFromTestCase(TestMergeSortRefactored)
    runner2 = unittest.TextTestRunner(verbosity=2)
    runner2.run(suite2)

    print("\n>>> 基准测试对比")
    benchmark()