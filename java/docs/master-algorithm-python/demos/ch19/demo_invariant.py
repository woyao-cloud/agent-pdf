"""
demo_invariant.py — 循环不变量证明算法正确性演示

配合第19章"算法设计能力"之 19.3（正确性证明）使用。

演示内容：
  1. 选择排序 — 循环不变量追踪
  2. 插入排序 — 循环不变量追踪
  3. 二分查找 — 循环不变量追踪
  4. 不变量状态表可视化
"""

from typing import List, Any, Dict, Optional


# ============================================================
# 工具：可视化数组状态
# ============================================================

def _visualize(arr: List[Any], low: int, high: int,
               label: str = "") -> str:
    n = len(arr)
    parts = []
    for i in range(n):
        if i < low:
            parts.append(f"[S]{arr[i]}")     # Sorted
        elif low <= i <= high:
            parts.append(f"[A]{arr[i]}")     # Active
        else:
            parts.append(f"[U]{arr[i]}")     # Unsorted
    s = " ".join(f"{v:>3}" for v in arr)
    return f"{label:<45} {s}"


# ============================================================
# 1. 选择排序 — 循环不变量追踪
# ============================================================
#
# 循环不变量:
#   每次外层循环 i 开始前:
#     arr[0..i-1] 已排序，且每个元素 ≤ arr[i..n-1] 中的任意元素
#
# 初始化 (i=0): arr[0..-1] 为空，不变量平凡成立
# 保持: 第 i 轮在 arr[i..n-1] 中找最小值，与 arr[i] 交换
#       交换后 arr[0..i] 有序且 ≤ arr[i+1..n-1]
# 终止 (i=n-1): arr[0..n-1] 已排序 [OK]

def selection_sort_invariant(arr: List[int]) -> List[int]:
    """选择排序 — 循环不变量状态追踪"""
    a = arr[:]
    n = len(a)
    states: List[Dict] = []

    print(f"\n选择排序 循环不变量追踪")
    print(f"{"=" * 72}")
    print(f"不变量: arr[0..i-1] 已排序, 且 ≤ arr[i..n-1]")
    print(f"{"=" * 72}")

    # 初始状态
    states.append({
        "i": "0",
        "arr[0..i-1]": "[]",
        "当前操作": "初始化 — 前 0 个元素已排序",
        "数组": f"{a}",
    })
    print(f"\ni=0 | 不变量: arr[0..-1]=[] 已排序 [OK]")

    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if a[j] < a[min_idx]:
                min_idx = j

        a[i], a[min_idx] = a[min_idx], a[i]

        sorted_part = str(a[:i + 1])
        unsorted_part = str(a[i + 1:])
        claim = f"arr[0..{i}]={sorted_part} 已排序, ≤ arr[{i+1}..]={unsorted_part}"

        states.append({
            "i": str(i + 1),
            "arr[0..i-1]": sorted_part,
            "当前操作": f"交换 a[{i}]<->a[{min_idx}]",
            "数组": f"{a}",
        })
        print(f"i={i + 1} | 不变量: {claim} [OK]")

    # 终止
    print(f"\ni=n | 终止: arr[0..{n-1}]={a} 完全有序 [OK]")

    print(f"\n不变量状态表:")
    print(f"{"=" * 72}")
    print(f"{'i':>3} | {'arr[0..i-1]':<25} | {'操作':<20} | {'数组'}")
    print(f"{"-" * 72}")
    for s in states:
        print(f"{s['i']:>3} | {s['arr[0..i-1]']:<25} | {s['当前操作']:<20} | {s['数组']}")

    return a


# ============================================================
# 2. 插入排序 — 循环不变量追踪
# ============================================================
#
# 循环不变量:
#   每次外层循环 i 开始前:
#     arr[0..i-1] 已排序
#
# 初始化 (i=1): arr[0..0] 只有一个元素，自然有序
# 保持: 第 i 轮将 arr[i] 插入到 arr[0..i-1] 的正确位置
#       插入后 arr[0..i] 有序
# 终止 (i=n): arr[0..n-1] 已排序 [OK]

def insertion_sort_invariant(arr: List[int]) -> List[int]:
    """插入排序 — 循环不变量状态追踪"""
    a = arr[:]
    n = len(a)
    states: List[Dict] = []

    print(f"\n插入排序 循环不变量追踪")
    print(f"{"=" * 72}")
    print(f"不变量: arr[0..i-1] 已排序")
    print(f"{"=" * 72}")

    # i=1 初始状态
    states.append({
        "i": "1",
        "arr[0..i-1]": str(a[:1]),
        "key": "—",
        "插入位置": "—",
        "数组": f"{a}",
    })
    print(f"\ni=1 | 不变量: arr[0..0]={a[:1]} 已排序 [OK]")

    for i in range(1, n):
        key = a[i]
        j = i - 1

        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key

        sorted_part = str(a[:i + 1])
        states.append({
            "i": str(i + 1),
            "arr[0..i-1]": sorted_part,
            "key": str(key),
            "插入位置": str(j + 1),
            "数组": f"{a}",
        })
        print(f"i={i + 1} | key={key} → 插入位置 a[{j + 1}]"
              f" | 不变量: arr[0..{i}]={sorted_part} 已排序 [OK]")

    print(f"\ni=n | 终止: arr[0..{n-1}]={a} 完全有序 [OK]")

    print(f"\n不变量状态表:")
    print(f"{"=" * 72}")
    print(f"{'i':>3} | {'arr[0..i-1]':<25} | {'key':>4} | {'插入位置':<6} | {'数组'}")
    print(f"{"-" * 72}")
    for s in states:
        print(f"{s['i']:>3} | {s['arr[0..i-1]']:<25} | {s['key']:>4} | {s['插入位置']:<6} | {s['数组']}")

    return a


# ============================================================
# 3. 二分查找 — 循环不变量追踪
# ============================================================
#
# 循环不变量:
#   如果 target 在 arr 中，则它在 arr[left..right] 范围内
#
# 初始化: left=0, right=n-1 → target 在整个数组范围内
# 保持: 每轮比较 arr[mid] 与 target，缩小区间
#       且不丢失 target（如果存在）
# 终止: left > right 或找到 target
#       → left > right => target 不在数组中 [OK]
#       → arr[mid] == target => 返回 mid [OK]

def binary_search_invariant(arr: List[int], target: int) -> int:
    """二分查找 — 循环不变量状态追踪"""
    left, right = 0, len(arr) - 1
    states: List[Dict] = []

    print(f"\n二分查找 循环不变量追踪 (target={target})")
    print(f"{"=" * 72}")
    print(f"不变量: target 在 arr[left..right] 范围内（如果存在）")
    print(f"{"=" * 72}")
    print(f"初始: left=0, right={right}, arr[0..{right}]={arr}")

    step = 0
    while left <= right:
        mid = (left + right) // 2
        step += 1

        search_range = arr[left:right + 1]
        state_info = {
            "step": step,
            "left": left,
            "right": right,
            "mid": mid,
            "arr[mid]": arr[mid],
            "arr[left..right]": str(search_range),
            "动作": "",
            "不变量保持": "",
        }

        if arr[mid] == target:
            state_info["动作"] = f"找到!"
            state_info["不变量保持"] = "终止: 找到 target"

            print(f"  Step {step}: left={left}, right={right}, "
                  f"mid={mid}, arr[mid]={arr[mid]} == {target} → 找到!")
            print(f"    区间 [{left}..{right}] = {search_range}")

            states.append(state_info)
            return mid
        elif arr[mid] < target:
            state_info["动作"] = f"arr[mid] < target: left→{mid + 1}"
            state_info["不变量保持"] = f"target 在 arr[{mid + 1}..{right}] 中"

            print(f"  Step {step}: left={left}, right={right}, "
                  f"mid={mid}, arr[mid]={arr[mid]} < {target} → left={mid + 1}")
            print(f"    不变量保持: target 在 arr[{mid + 1}..{right}]={arr[mid + 1:right + 1]}")

            left = mid + 1
        else:
            state_info["动作"] = f"arr[mid] > target: right→{mid - 1}"
            state_info["不变量保持"] = f"target 在 arr[{left}..{mid - 1}] 中"

            print(f"  Step {step}: left={left}, right={right}, "
                  f"mid={mid}, arr[mid]={arr[mid]} > {target} → right={mid - 1}")
            print(f"    不变量保持: target 在 arr[{left}..{mid - 1}]={arr[left:mid]}")

            right = mid - 1

        states.append(state_info)

    # 终止: left > right
    print(f"  终止: left({left}) > right({right}) → target 不存在")
    print(f"  不变量: 搜索区间为空 → 返回 -1 [OK]")

    return -1


# ============================================================
# 4. 冒泡排序 — 循环不变量追踪（简化版）
# ============================================================
#
# 循环不变量:
#   每次外层循环 i 结束后，arr[n-i-1..n-1] 已排序
#   （最后 i 个元素已就位）
#
# 初始化 (i=0): 最后 0 个元素已排序
# 保持: 第 i 轮将最大值"冒泡"到 arr[n-i-1]
# 终止 (i=n-1): arr[0..n-1] 已排序 [OK]

def bubble_sort_invariant(arr: List[int]) -> List[int]:
    """冒泡排序 — 循环不变量追踪"""
    a = arr[:]
    n = len(a)

    print(f"\n冒泡排序 循环不变量追踪")
    print(f"{"=" * 72}")
    print(f"不变量: arr[n-i..n-1] 已排序（末尾 i 个元素已就位）")
    print(f"{"=" * 72}")

    for i in range(n - 1):
        swapped = False
        sorted_suffix = a[n - i:] if i > 0 else []

        print(f"\n  第 {i + 1} 轮: 末尾 {i} 个已就位 {sorted_suffix}")
        print(f"  冒泡范围 arr[0..{n - i - 1}]={a[:n - i]}")

        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
                print(f"    交换 a[{j}]={a[j + 1]}<->a[{j + 1}]={a[j]} → {a}")
            else:
                print(f"    不交换 a[{j}]={a[j]} ≤ a[{j + 1}]={a[j + 1]}")

        if not swapped:
            print(f"    本轮无交换 → 提前终止")
            break

        suffix_now = a[n - i - 1:]
        print(f"  第 {i + 1} 轮结束: 末尾 {i + 1} 个 {suffix_now} 已就位 [OK]")
        print(f"  不变量 arr[{n - i - 1}..{n - 1}]={suffix_now} 已排序 [OK]")

    print(f"\n终止: arr[0..{n-1}]={a} 完全有序 [OK]")
    return a


# ============================================================
# 5. 不变量三要素检查表
# ============================================================

def _invariant_check_table():
    """列示各算法循环不变量的三要素"""
    algorithms = [
        {
            "name": "选择排序",
            "invariant": "arr[0..i-1] 已排序且 ≤ 剩余元素",
            "initialization": "i=0: arr[0..-1] 空，平凡成立",
            "maintenance": "第 i 轮找最小元素与 arr[i] 交换",
            "termination": "i=n: arr[0..n-1] 完全有序",
        },
        {
            "name": "插入排序",
            "invariant": "arr[0..i-1] 已排序",
            "initialization": "i=1: arr[0..0] 单元素，自然有序",
            "maintenance": "第 i 轮将 arr[i] 插入到正确位置",
            "termination": "i=n: arr[0..n-1] 完全有序",
        },
        {
            "name": "冒泡排序",
            "invariant": "arr[n-i..n-1] 已排序",
            "initialization": "i=0: arr[n..n-1] 空，平凡成立",
            "maintenance": "第 i 轮将最大值冒泡到 arr[n-i-1]",
            "termination": "i=n-1: arr[0..n-1] 完全有序",
        },
        {
            "name": "二分查找",
            "invariant": "target 在 arr[left..right] 中（如存在）",
            "initialization": "left=0, right=n-1: 整个数组范围",
            "maintenance": "比较 arr[mid]，缩小一半范围，不丢失 target",
            "termination": "left>right => 不存在; arr[mid]==target => 找到",
        },
        {
            "name": "快速排序(partition)",
            "invariant": "arr[low..i] ≤ pivot < arr[i+1..high]",
            "initialization": "i=low-1: 左右分区皆为空",
            "maintenance": "遇到 ≤ pivot 的元素则扩展左分区",
            "termination": "遍历完: pivot 在最终位置，左右分区正确",
        },
    ]

    print(f"\n循环不变量三要素检查表")
    print(f"{"=" * 100}")
    header = ["算法", "不变量", "初始化", "保持", "终止"]
    data = []
    for alg in algorithms:
        data.append([
            alg["name"],
            alg["invariant"],
            alg["initialization"],
            alg["maintenance"],
            alg["termination"],
        ])

    # 手打表格
    for alg in algorithms:
        print(f"""
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 算法: {alg['name']:<56} │
  ├─────────────────────────────────────────────────────────────────────┤
  │ 不变量: {alg['invariant']:<55} │
  │ 初始化: {alg['initialization']:<55} │
  │ 保持:   {alg['maintenance']:<55} │
  │ 终止:   {alg['termination']:<55} │
  └─────────────────────────────────────────────────────────────────────┘""")


# ============================================================
# 6. 测试
# ============================================================

def _test():
    print("=" * 72)
    print("  循环不变量证明算法正确性 — 演示")
    print("=" * 72)

    # ---- 1. 选择排序 ----
    print("\n" + "-" * 72)
    print("1. 选择排序 — 循环不变量")
    print("-" * 72)
    result = selection_sort_invariant([5, 3, 8, 4, 2])
    assert result == sorted([5, 3, 8, 4, 2]), f"选择排序错误: {result}"
    print(f"\n  [OK] 排序正确: {result}")

    # ---- 2. 插入排序 ----
    print("\n" + "-" * 72)
    print("2. 插入排序 — 循环不变量")
    print("-" * 72)
    result = insertion_sort_invariant([5, 3, 8, 4, 2])
    assert result == sorted([5, 3, 8, 4, 2]), f"插入排序错误: {result}"
    print(f"\n  [OK] 排序正确: {result}")

    # ---- 3. 二分查找 ----
    print("\n" + "-" * 72)
    print("3. 二分查找 — 循环不变量")
    print("-" * 72)

    arr = [1, 3, 5, 7, 9, 11, 13, 15]
    test_cases = [
        (arr, 7),
        (arr, 4),
        (arr, 1),
        (arr, 15),
        (arr, 20),
        ([], 5),
        ([5], 5),
        ([5], 3),
    ]

    for a, t in test_cases:
        idx = binary_search_invariant(a, t)
        expected = -1
        if t in a:
            expected = a.index(t)
        status = "[OK]" if idx == expected else "[FAIL]"
        print(f"  {status} binary_search({a}, {t}) → {idx} (预期 {expected})")

    # ---- 4. 冒泡排序 ----
    print("\n" + "-" * 72)
    print("4. 冒泡排序 — 循环不变量")
    print("-" * 72)
    result = bubble_sort_invariant([5, 3, 8, 4, 2])
    assert result == sorted([5, 3, 8, 4, 2]), f"冒泡排序错误: {result}"
    print(f"\n  [OK] 排序正确: {result}")

    # ---- 5. 不变量三要素 ----
    print("\n" + "-" * 72)
    print("5. 循环不变量三要素总结")
    print("-" * 72)
    _invariant_check_table()

    # ---- 6. 总结 ----
    print("\n" + "-" * 72)
    print("6. 使用循环不变量的要点")
    print("-" * 72)
    print("""
  使用循环不变量证明算法正确性的步骤:

  1. 确定不变量 — 在循环中始终保持为真的性质
  2. 验证初始化 — 循环开始前不变量成立
  3. 验证保持 — 如果某次迭代前成立，迭代后依然成立
  4. 验证终止 — 循环结束时，不变量蕴含算法正确

  常见错误:
  - 不变量太弱 (不足以推导出正确性)
  - 不变量被循环内操作破坏 (未在下次迭代前恢复)
  - 未处理边界情况 (空数组、单元素等)

  核心思想: 不变量是"循环进行中"的承诺，
  初始化→保持→终止 的三步证明法将复杂循环的正确性
  分解为三个容易验证的局部问题。
    """)


if __name__ == "__main__":
    _test()