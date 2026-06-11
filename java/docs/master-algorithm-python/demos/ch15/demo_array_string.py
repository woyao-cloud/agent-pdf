"""
demo_array_string.py — 数组与字符串高频面试算法题

配合第15章"面试高频算法题"之 15.4（数组与字符串）使用。

演示内容：
  1. 两数之和（Two Sum）
  2. 三数之和（Three Sum）
  3. 字母异位词分组（Group Anagrams）
  4. 无重复字符的最长子串（Longest Substring Without Repeating Characters）
  5. 合并区间（Merge Intervals）
"""

from typing import List


# ============================================================
# 1. 两数之和
# ============================================================

def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []


# ============================================================
# 2. 三数之和
# ============================================================

def three_sum(nums: List[int]) -> List[List[int]]:
    nums.sort()
    result = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        left, right = i + 1, len(nums) - 1
        while left < right:
            s = nums[i] + nums[left] + nums[right]
            if s < 0:
                left += 1
            elif s > 0:
                right -= 1
            else:
                result.append([nums[i], nums[left], nums[right]])
                while left < right and nums[left] == nums[left + 1]:
                    left += 1
                while left < right and nums[right] == nums[right - 1]:
                    right -= 1
                left += 1
                right -= 1
    return result


# ============================================================
# 3. 字母异位词分组
# ============================================================

def group_anagrams(strs: List[str]) -> List[List[str]]:
    groups = {}
    for s in strs:
        key = ''.join(sorted(s))
        if key not in groups:
            groups[key] = []
        groups[key].append(s)
    return list(groups.values())


# ============================================================
# 4. 无重复字符的最长子串
# ============================================================

def length_of_longest_substring(s: str) -> int:
    char_index = {}
    max_len = left = 0
    for right, ch in enumerate(s):
        if ch in char_index and char_index[ch] >= left:
            left = char_index[ch] + 1
        else:
            max_len = max(max_len, right - left + 1)
        char_index[ch] = right
    return max_len


# ============================================================
# 5. 合并区间
# ============================================================

def merge(intervals: List[List[int]]) -> List[List[int]]:
    intervals.sort(key=lambda x: x[0])
    merged = []
    for interval in intervals:
        if not merged or interval[0] > merged[-1][1]:
            merged.append(interval)
        else:
            merged[-1][1] = max(merged[-1][1], interval[1])
    return merged


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 60)
    print("  数组与字符串高频算法题演示")
    print("=" * 60)

    # ---- 1. 两数之和 ----
    print("\n" + "-" * 60)
    print("  [1] 两数之和 (Two Sum)")
    nums = [2, 7, 11, 15]
    print(f"    nums = {nums}, target = 9")
    print(f"    结果: {two_sum(nums, 9)}")
    print(f"    nums = [3, 2, 4], target = 6")
    print(f"    结果: {two_sum([3, 2, 4], 6)}")

    # ---- 2. 三数之和 ----
    print("\n" + "-" * 60)
    print("  [2] 三数之和 (Three Sum)")
    print(f"    nums = [-1, 0, 1, 2, -1, -4]")
    print(f"    结果: {three_sum([-1, 0, 1, 2, -1, -4])}")

    # ---- 3. 字母异位词分组 ----
    print("\n" + "-" * 60)
    print("  [3] 字母异位词分组 (Group Anagrams)")
    strs = ["eat", "tea", "tan", "ate", "nat", "bat"]
    print(f"    strs = {strs}")
    print(f"    分组: {group_anagrams(strs)}")

    # ---- 4. 无重复字符的最长子串 ----
    print("\n" + "-" * 60)
    print("  [4] 无重复字符的最长子串")
    for s in ["abcabcbb", "bbbbb", "pwwkew", "au", ""]:
        print(f"    '{s}' -> 长度 {length_of_longest_substring(s)}")

    # ---- 5. 合并区间 ----
    print("\n" + "-" * 60)
    print("  [5] 合并区间 (Merge Intervals)")
    print(f"    输入: [[1, 3], [2, 6], [8, 10], [15, 18]]")
    print(f"    合并: {merge([[1, 3], [2, 6], [8, 10], [15, 18]])}")
    print(f"    输入: [[1, 4], [4, 5]]")
    print(f"    合并: {merge([[1, 4], [4, 5]])}")

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)


if __name__ == '__main__':
    _test()