"""
demo_two_pointers.py — 双指针技巧演示

配合第16章"典型问题与解题模板"之 16.1 双指针技巧使用。

演示内容：
  1. Two Sum II (相向双指针)
  2. Three Sum (相向双指针 + 固定一数)
  3. Trapping Rain Water (相向双指针)
  4. Container With Most Water (相向双指针)
  5. Remove Duplicates from Sorted Array (同向双指针)
"""

from typing import List


# ============================================================
# 1. Two Sum II — Input Array Is Sorted
# ============================================================
def two_sum_sorted(numbers: List[int], target: int) -> List[int]:
    """
    两数之和 II（有序数组）。

    相向双指针：
      - left 指向开头，right 指向结尾
      - sum = numbers[left] + numbers[right]
      - sum == target → 找到答案
      - sum < target → left++（需要更大的和）
      - sum > target → right--（需要更小的和）

    返回 1-based 索引。
    """
    left, right = 0, len(numbers) - 1
    while left < right:
        s = numbers[left] + numbers[right]
        if s == target:
            return [left + 1, right + 1]
        elif s < target:
            left += 1
        else:
            right -= 1
    return [-1, -1]


# ============================================================
# 2. Three Sum
# ============================================================
def three_sum(nums: List[int]) -> List[List[int]]:
    """
    三数之和。

    排序 + 固定一数 + 相向双指针。
    跳过重复值以去重。
    """
    nums.sort()
    n, res = len(nums), []
    for i in range(n - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        left, right = i + 1, n - 1
        target = -nums[i]
        while left < right:
            s = nums[left] + nums[right]
            if s == target:
                res.append([nums[i], nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
            elif s < target:
                left += 1
            else:
                right -= 1
    return res


# ============================================================
# 3. Trapping Rain Water
# ============================================================
def trap_rain_water(height: List[int]) -> int:
    """
    接雨水。

    相向双指针 + 维护左右最大高度。
    较矮的一侧决定能接多少水。
    """
    left, right = 0, len(height) - 1
    left_max = right_max = 0
    total = 0

    while left < right:
        if height[left] < height[right]:
            if height[left] >= left_max:
                left_max = height[left]
            else:
                total += left_max - height[left]
            left += 1
        else:
            if height[right] >= right_max:
                right_max = height[right]
            else:
                total += right_max - height[right]
            right -= 1

    return total


# ============================================================
# 4. Container With Most Water
# ============================================================
def max_area(heights: List[int]) -> int:
    """
    盛最多水的容器。

    相向双指针，每次移动较矮的一侧（因为高度受限于较矮的板）。
    """
    left, right = 0, len(heights) - 1
    best = 0

    while left < right:
        h = min(heights[left], heights[right])
        w = right - left
        best = max(best, h * w)

        if heights[left] < heights[right]:
            left += 1
        else:
            right -= 1

    return best


# ============================================================
# 5. Remove Duplicates from Sorted Array
# ============================================================
def remove_duplicates(nums: List[int]) -> int:
    """
    删除有序数组中的重复项。

    同向双指针：
      - slow 指向下一个不重复元素的位置
      - fast 遍历数组
      - 遇到新元素就放到 slow 位置
    """
    if not nums:
        return 0

    slow = 1
    for fast in range(1, len(nums)):
        if nums[fast] != nums[fast - 1]:
            nums[slow] = nums[fast]
            slow += 1

    return slow


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("双指针技巧演示")
    print("=" * 72)

    # ---- 1. Two Sum II ----
    print("-" * 72)
    print("1. Two Sum II (有序数组两数之和)")
    print("-" * 72)

    nums1 = [2, 7, 11, 15]
    target1 = 9
    res1 = two_sum_sorted(nums1, target1)
    print(f"  数组: {nums1}, 目标: {target1}")
    print(f"  结果: {res1} → nums[{res1[0]}-1] + nums[{res1[1]}-1] = {nums1[res1[0] - 1]} + {nums1[res1[1] - 1]} = {target1}")
    print(f"  预期: [1, 2] → {'PASS' if res1 == [1, 2] else 'FAIL'}")

    nums1b = [1, 3, 4, 5, 7, 10, 11]
    target1b = 9
    res1b = two_sum_sorted(nums1b, target1b)
    print(f"  数组: {nums1b}, 目标: {target1b}")
    print(f"  结果: {res1b} → {nums1b[res1b[0] - 1]} + {nums1b[res1b[1] - 1]} = 9")
    print(f"  预期: [3, 4] → {'PASS' if res1b == [3, 4] else 'FAIL'}")

    # ---- 2. Three Sum ----
    print("-" * 72)
    print("2. Three Sum (三数之和)")
    print("-" * 72)

    nums2 = [-1, 0, 1, 2, -1, -4]
    res2 = three_sum(nums2)
    print(f"  数组: {nums2}")
    print(f"  结果: {res2}")
    print(f"  预期: [[-1, -1, 2], [-1, 0, 1]]")
    ok2 = set(tuple(sorted(t)) for t in res2) == {(-1, -1, 2), (-1, 0, 1)}
    print(f"  {'PASS' if ok2 else 'FAIL'}")

    # ---- 3. Trapping Rain Water ----
    print("-" * 72)
    print("3. Trapping Rain Water (接雨水)")
    print("-" * 72)

    heights3 = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
    res3 = trap_rain_water(heights3)
    print(f"  高度图: {heights3}")
    print(f"  接水量: {res3}")
    print(f"  预期: 6 → {'PASS' if res3 == 6 else 'FAIL'}")

    heights3b = [4, 2, 0, 3, 2, 5]
    res3b = trap_rain_water(heights3b)
    print(f"  高度图: {heights3b}")
    print(f"  接水量: {res3b}")
    print(f"  预期: 9 → {'PASS' if res3b == 9 else 'FAIL'}")

    # ---- 4. Container With Most Water ----
    print("-" * 72)
    print("4. Container With Most Water (盛最多水的容器)")
    print("-" * 72)

    heights4 = [1, 8, 6, 2, 5, 4, 8, 3, 7]
    res4 = max_area(heights4)
    print(f"  高度: {heights4}")
    print(f"  最大面积: {res4}")
    print(f"  预期: 49 → {'PASS' if res4 == 49 else 'FAIL'}")

    heights4b = [1, 1]
    res4b = max_area(heights4b)
    print(f"  高度: {heights4b}")
    print(f"  最大面积: {res4b}")
    print(f"  预期: 1 → {'PASS' if res4b == 1 else 'FAIL'}")

    # ---- 5. Remove Duplicates ----
    print("-" * 72)
    print("5. Remove Duplicates (删除有序数组中的重复项)")
    print("-" * 72)

    nums5 = [1, 1, 2]
    res5 = remove_duplicates(nums5)
    print(f"  数组: [1, 1, 2]")
    print(f"  新长度: {res5}")
    print(f"  前 {res5} 项: {nums5[:res5]}")
    print(f"  预期: 2, [1, 2] → {'PASS' if res5 == 2 and nums5[:2] == [1, 2] else 'FAIL'}")

    nums5b = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4]
    res5b = remove_duplicates(nums5b)
    print(f"  数组: [0, 0, 1, 1, 1, 2, 2, 3, 3, 4]")
    print(f"  新长度: {res5b}")
    print(f"  前 {res5b} 项: {nums5b[:res5b]}")
    print(f"  预期: 5, [0, 1, 2, 3, 4] → {'PASS' if res5b == 5 and nums5b[:5] == [0, 1, 2, 3, 4] else 'FAIL'}")

    # ---- 汇总 ----
    print("=" * 72)
    print("测试完成")


if __name__ == "__main__":
    _test()
