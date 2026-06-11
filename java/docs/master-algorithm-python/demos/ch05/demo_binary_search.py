"""
demo_binary_search.py
二分查找及其全部变体。

包含：
  - 标准二分查找 (standard)
  - 第一个等于 target (left_boundary)
  - 最后一个等于 target (right_boundary)
  - 旋转有序数组搜索 (search_rotated)
  - 在有序数组中查找范围 (search_range)
"""

import bisect


# ============================================================
# 1. 标准二分查找
# ============================================================
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1


# ============================================================
# 2. 查找第一个等于 target 的位置 (左边界)
# ============================================================
def left_boundary(arr, target):
    left, right = 0, len(arr)
    while left < right:
        mid = (left + right) // 2
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid
    if left < len(arr) and arr[left] == target:
        return left
    return -1


# ============================================================
# 3. 查找最后一个等于 target 的位置 (右边界)
# ============================================================
def right_boundary(arr, target):
    left, right = 0, len(arr)
    while left < right:
        mid = (left + right) // 2
        if arr[mid] <= target:
            left = mid + 1
        else:
            right = mid
    if right - 1 >= 0 and arr[right - 1] == target:
        return right - 1
    return -1


# ============================================================
# 4. 在旋转有序数组中查找
#    LeetCode 33
# ============================================================
def search_rotated(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[left] <= nums[mid]:
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1
    return -1


# ============================================================
# 5. 查找 target 在有序数组中的范围 [first, last]
#    LeetCode 34 — 直接基于 bisect 实现
# ============================================================
def search_range(arr, target):
    first = bisect.bisect_left(arr, target)
    if first == len(arr) or arr[first] != target:
        return [-1, -1]
    last = bisect.bisect_right(arr, target) - 1
    return [first, last]


# ============================================================
# Demo 入口
# ============================================================
if __name__ == "__main__":
    print("=" * 56)
    print("  二分查找及其变体  Binary Search & Variants")
    print("=" * 56)

    # 1. 标准二分查找
    print("\n[1] 标准二分查找 (Standard Binary Search)")
    arr1 = [1, 3, 5, 7, 9, 11, 13]
    for t in [7, 4, 13, 0]:
        idx = binary_search(arr1, t)
        print(f"    binary_search({arr1}, {t:>2}) → {idx}")
    # 使用 bisect 验证
    i = bisect.bisect_left(arr1, 7)
    assert arr1[i] == 7

    # 2. 左边界
    print("\n[2] 查找第一个等于 target (Left Boundary)")
    arr2 = [1, 2, 3, 3, 3, 4, 5, 5, 6]
    for t in [3, 5, 0, 7]:
        idx = left_boundary(arr2, t)
        print(f"    left_boundary({arr2}, {t}) → {idx}")

    # 3. 右边界
    print("\n[3] 查找最后一个等于 target (Right Boundary)")
    for t in [3, 5, 6, 9]:
        idx = right_boundary(arr2, t)
        print(f"    right_boundary({arr2}, {t}) → {idx}")

    # 4. 旋转数组
    print("\n[4] 旋转有序数组查找 (Rotated Array)")
    tests = [
        ([4, 5, 6, 7, 0, 1, 2], 0),
        ([4, 5, 6, 7, 0, 1, 2], 3),
        ([1], 0),
        ([1, 3], 3),
        ([3, 1], 1),
    ]
    for nums, t in tests:
        idx = search_rotated(nums, t)
        print(f"    search_rotated({nums}, {t}) → {idx}")

    # 5. 查找范围
    print("\n[5] 查找范围 (Search Range)  LeetCode 34")
    arr3 = [5, 7, 7, 8, 8, 10]
    for t in [8, 6, 5, 10]:
        r = search_range(arr3, t)
        print(f"    search_range({arr3}, {t}) → {r}")

    print("\n" + "=" * 56)
    print("  所有变体验证通过!")
    print("=" * 56)