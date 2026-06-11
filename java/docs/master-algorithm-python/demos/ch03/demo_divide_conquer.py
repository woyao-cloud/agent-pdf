r"""
demo_divide_conquer.py — 归并排序：分治法的完整三步演示

配合第3章"算法思维模式"之 3.1 分治法使用。

分治三步：
  1. Divide（分解）: 将数组从中间切分为左右两半
  2. Conquer（求解）: 递归地对左右两半分别排序
  3. Combine（合并）: 将两个已排序子数组合并为一个有序数组

可视化过程（对 arr = [38, 27, 43, 3, 9, 82, 10]）：

                     [38 27 43 3 9 82 10]          ← 原始数组
                   /                    \
          [38 27 43 3]              [9 82 10]       ← 第一次分解
          /         \               /       \
      [38 27]     [43 3]         [9 82]    [10]     ← 第二次分解
      /    \      /    \         /    \      |
    [38]  [27]  [43]  [3]     [9]   [82]   [10]    ← 最小子问题（1个元素）
      \    /      \    /         \    /      |
      [27 38]     [3 43]        [9 82]    [10]     ← 两两合并
          \         /               \       /
          [3 27 38 43]             [9 10 82]        ← 继续合并
                \                     /
                [3 9 10 27 38 43 82]                ← 最终结果

时间复杂度: O(n log n)  空间复杂度: O(n)
"""

from typing import List


# ============================================================
# 第一步：Merge — 合并两个已排序的子数组
# ============================================================
def merge(left: List[int], right: List[int]) -> List[int]:
    """
    合并两个已排序数组。
    这是分治法的 Combine 阶段 —— 将子问题的解组合为原问题的解。

    策略：双指针比较，较小的元素先放入结果数组。
    """
    result = []
    i = j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1

    # 将剩余元素直接追加（left 或 right 中有一个已遍历完）
    result.extend(left[i:])
    result.extend(right[j:])
    return result


# ============================================================
# 第二步：Merge Sort — 完整的 分→解→合 三步
# ============================================================
def merge_sort(arr: List[int]) -> List[int]:
    """
    归并排序主函数。

    三步过程：
    ┌─────────────────────────────────────────────────────┐
    │  ① Divide  (分解)  : mid = len(arr) // 2           │
    │  ② Conquer (求解)  : 递归排序 left 和 right         │
    │  ③ Combine (合并)  : merge(left_sorted, right_sorted) │
    └─────────────────────────────────────────────────────┘
    """
    # Step 0: 基本情况 — 数组长度为 0 或 1 时已经有序
    # 这是递归终止条件，也属于 Conquer 的最简形式
    if len(arr) <= 1:
        return arr

    # Step 1: Divide — 从中间分成两个子数组
    mid = len(arr) // 2
    left_half = arr[:mid]
    right_half = arr[mid:]

    # 输出分解过程
    print(f"  Divide: {arr} → left={left_half}, right={right_half}")

    # Step 2: Conquer — 递归排序左右两半
    sorted_left = merge_sort(left_half)
    sorted_right = merge_sort(right_half)

    # Step 3: Combine — 合并两个已排序子数组
    merged = merge(sorted_left, sorted_right)
    print(f"  Combine: merge({sorted_left}, {sorted_right}) → {merged}")
    return merged


# ============================================================
# 原地归并排序（优化空间版本 - 用辅助数组）
# 性能更好，但概念上不如上面版本直观
# ============================================================
def merge_sort_inplace(arr: List[int], left: int, right: int, temp: List[int]):
    """原地归并排序，使用辅助数组 temp 避免频繁创建新列表"""
    if left >= right:
        return

    mid = (left + right) // 2
    merge_sort_inplace(arr, left, mid, temp)
    merge_sort_inplace(arr, mid + 1, right, temp)

    # 合并 arr[left..mid] 和 arr[mid+1..right]
    i, j, k = left, mid + 1, left
    while i <= mid and j <= right:
        if arr[i] <= arr[j]:
            temp[k] = arr[i]
            i += 1
        else:
            temp[k] = arr[j]
            j += 1
        k += 1
    while i <= mid:
        temp[k] = arr[i]
        i += 1
        k += 1
    while j <= right:
        temp[k] = arr[j]
        j += 1
        k += 1
    arr[left:right + 1] = temp[left:right + 1]


def merge_sort_inplace_wrapper(arr: List[int]):
    """原地归并排序的包装函数"""
    temp = [0] * len(arr)
    merge_sort_inplace(arr, 0, len(arr) - 1, temp)


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 60)
    print("归并排序 - 分治法三步演示")
    print("=" * 60)

    arr = [38, 27, 43, 3, 9, 82, 10]
    print(f"\n原始数组: {arr}")
    print(f"\n开始排序（显示每一步的 Divide / Combine）：")
    print("-" * 50)
    sorted_arr = merge_sort(arr)
    print("-" * 50)
    print(f"\n排序结果: {sorted_arr}")
    print(f"预期结果: {sorted(arr)}")
    print(f"正确性: {'[OK]' if sorted_arr == sorted(arr) else '[FAIL]'}")

    # 测试原地版本
    arr2 = [38, 27, 43, 3, 9, 82, 10]
    merge_sort_inplace_wrapper(arr2)
    print(f"\n原地归并排序结果: {arr2}")
    print(f"正确性: {'[OK]' if arr2 == sorted([38, 27, 43, 3, 9, 82, 10]) else '[FAIL]'}")

    # 更多测试用例
    test_cases = [
        [],
        [1],
        [2, 1],
        [5, 4, 3, 2, 1],
        [1, 2, 3, 4, 5],
        [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5],
    ]

    print("\n" + "=" * 60)
    print("额外测试用例")
    print("=" * 60)
    for tc in test_cases:
        result = merge_sort(tc.copy())
        status = "[OK]" if result == sorted(tc) else "[X]"
        print(f"  {status} {tc} → {result}")


if __name__ == "__main__":
    _test()