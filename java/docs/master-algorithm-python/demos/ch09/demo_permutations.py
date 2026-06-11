"""
demo_permutations.py — 排列、子集、组合的回溯生成

配合第9章"回溯算法"之 9.2（全排列与子集）和 9.4（组合求和）使用。

演示内容：
  1. 无重复元素的全排列
  2. 有重复元素的全排列（去重）
  3. 子集生成
  4. 有重复元素的子集（去重）
  5. 组合求和（元素可重用）
  6. 组合求和 II（元素不可重用）
"""

from typing import List


# ============================================================
# 1. 全排列（无重复）
# ============================================================

def permute(nums: List[int]) -> List[List[int]]:
    """
    全排列 — 标准回溯。

    时间复杂度: O(n · n!)
    空间复杂度: O(n)
    """
    res = []
    used = [False] * len(nums)

    def backtrack(path: List[int]) -> None:
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            used[i] = False

    backtrack([])
    return res


# ============================================================
# 2. 全排列（有重复 — 去重）
# ============================================================

def permute_unique(nums: List[int]) -> List[List[int]]:
    """
    有重复元素的全排列 — 排序 + 同层剪枝。

    时间复杂度: O(n · n!)
    空间复杂度: O(n)
    """
    nums.sort()
    res = []
    used = [False] * len(nums)

    def backtrack(path: List[int]) -> None:
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack(path)
            path.pop()
            used[i] = False

    backtrack([])
    return res


# ============================================================
# 3. 子集
# ============================================================

def subsets(nums: List[int]) -> List[List[int]]:
    """
    子集（幂集）— 选/不选回溯。

    时间复杂度: O(n · 2ⁿ)
    空间复杂度: O(n)
    """
    res = []

    def backtrack(start: int, path: List[int]) -> None:
        res.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    return res


# ============================================================
# 4. 子集（有重复 — 去重）
# ============================================================

def subsets_with_dup(nums: List[int]) -> List[List[int]]:
    """
    有重复元素的子集 — 排序 + 同层跳过。

    时间复杂度: O(n · 2ⁿ)
    空间复杂度: O(n)
    """
    nums.sort()
    res = []

    def backtrack(start: int, path: List[int]) -> None:
        res.append(path[:])
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    return res


# ============================================================
# 5. 组合求和（元素可重用）
# ============================================================

def combination_sum(candidates: List[int], target: int) -> List[List[int]]:
    """
    组合求和 — 元素可无限重用，排序 + 可行性剪枝。

    时间复杂度: O(n^(target/min))  最坏
    空间复杂度: O(target/min)
    """
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:
                break
            path.append(val)
            backtrack(i, path, remaining - val)
            path.pop()

    backtrack(0, [], target)
    return res


# ============================================================
# 6. 组合求和 II（元素不可重用）
# ============================================================

def combination_sum2(candidates: List[int], target: int) -> List[List[int]]:
    """
    组合求和 II — 每个元素只能用一次，排序 + 同层去重。

    时间复杂度: O(2ⁿ)  最坏
    空间复杂度: O(n)
    """
    candidates.sort()
    res = []

    def backtrack(start: int, path: List[int], remaining: int) -> None:
        if remaining == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            val = candidates[i]
            if val > remaining:
                break
            if i > start and candidates[i] == candidates[i - 1]:
                continue
            path.append(val)
            backtrack(i + 1, path, remaining - val)
            path.pop()

    backtrack(0, [], target)
    return res


# ============================================================
# 工具函数：打印结果
# ============================================================

def _print_results(title: str, data: List[List[int]], max_show: int = 12):
    """格式化打印结果，过多时只显示前几个和总数"""
    print(f"\n{'=' * 72}")
    print(f"{title}")
    print(f"{'=' * 72}")
    print(f"总数: {len(data)}")
    if len(data) <= max_show:
        for item in data:
            print(f"  {item}")
    else:
        for item in data[:max_show]:
            print(f"  {item}")
        print(f"  ... (共 {len(data)} 个结果)")


# ============================================================
# 演示
# ============================================================

def main():
    print("=" * 72)
    print("回溯算法 — 排列 / 子集 / 组合 演示")
    print("=" * 72)

    # ---- 1. 全排列 ----
    nums = [1, 2, 3]
    _print_results(f"1. 全排列 nums = {nums}", permute(nums))

    # ---- 2. 有重复的全排列 ----
    nums2 = [1, 1, 2]
    _print_results(f"2. 有重复排列 nums = {nums2}", permute_unique(nums2))

    # ---- 3. 子集 ----
    nums3 = [1, 2, 3]
    _print_results(f"3. 子集 nums = {nums3}", subsets(nums3))

    # ---- 4. 有重复的子集 ----
    nums4 = [1, 2, 2]
    _print_results(f"4. 有重复子集 nums = {nums4}", subsets_with_dup(nums4))

    # ---- 5. 组合求和 ----
    candidates = [2, 3, 6, 7]
    target = 7
    _print_results(f"5. 组合求和 candidates={candidates}, target={target}",
                   combination_sum(candidates, target))

    # ---- 6. 组合求和 II ----
    candidates2 = [10, 1, 2, 7, 6, 1, 5]
    target2 = 8
    _print_results(f"6. 组合求和 II candidates={candidates2}, target={target2}",
                   combination_sum2(candidates2, target2))

    # ---- 7. 性能统计 ----
    print(f"\n{'=' * 72}")
    print("7. 结果统计汇总")
    print(f"{'=' * 72}")
    print(f"{'问题':<30} {'输入':<20} {'结果数':<10}")
    print(f"{'-' * 60}")
    print(f"{'全排列':<30} {str([1,2,3]):<20} {len(permute([1,2,3])):<10}")
    print(f"{'全排列（有重复）':<30} {str([1,1,2]):<20} {len(permute_unique([1,1,2])):<10}")
    print(f"{'子集':<30} {str([1,2,3]):<20} {len(subsets([1,2,3])):<10}")
    print(f"{'子集（有重复）':<30} {str([1,2,2]):<20} {len(subsets_with_dup([1,2,2])):<10}")
    print(f"{'组合求和':<30} {str([2,3,6,7])+',t=7':<20} {len(combination_sum([2,3,6,7],7)):<10}")
    print(f"{'组合求和 II':<30} {str([10,1,2,7,6,1,5])+',t=8':<20} {len(combination_sum2([10,1,2,7,6,1,5],8)):<10}")


if __name__ == "__main__":
    main()

"""
运行示例输出（节选）：

==================================================================
1. 全排列 nums = [1, 2, 3]
==================================================================
总数: 6
  [1, 2, 3]
  [1, 3, 2]
  [2, 1, 3]
  [2, 3, 1]
  [3, 1, 2]
  [3, 2, 1]

==================================================================
2. 有重复排列 nums = [1, 1, 2]
==================================================================
总数: 3
  [1, 1, 2]
  [1, 2, 1]
  [2, 1, 1]
"""