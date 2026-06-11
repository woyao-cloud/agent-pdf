"""
demo_induction.py — 数学归纳法证明算法正确性演示

配合第19章"算法设计能力"之 19.3（正确性证明）使用。

演示内容：
  1. 二分查找正确性证明（数学归纳法）
  2. 归并排序正确性证明（数学归纳法）
  3. 归纳步骤的可视化追踪
"""

from typing import List, Optional, Tuple


# ============================================================
# 1. 二分查找 — 数学归纳法证明追踪
# ============================================================

def binary_search_tracked(arr: List[int], target: int) -> Tuple[int, List[str]]:
    """
    二分查找（带归纳证明追踪）。

    数学归纳法证明：
      P(k): 对长度为 k 的已排序数组，binary_search 正确返回 target 的索引
            或 -1（不存在）。

      Base Case: k=0（空数组）→ 返回 -1 [OK]
                  k=1（单元素数组）→ 如果唯一元素 == target 返回 0，否则 -1 [OK]

      Inductive Step:
        假设 P(1), P(2), ..., P(k) 成立
        对长度为 k+1 的数组:
          - 比较 mid 元素与 target
          - 如果相等 → 返回 mid [OK]
          - 如果 target < arr[mid] → 在左半部分递归（长度 ≤ k）→ 由 IH 成立 [OK]
          - 如果 target > arr[mid] → 在右半部分递归（长度 ≤ k）→ 由 IH 成立 [OK]
    """
    proof_steps: List[str] = []

    def _bs(l: int, r: int, depth: int = 0) -> int:
        indent = "  " * depth

        if l > r:
            proof_steps.append(
                f"{indent}Base: arr[{l}:{r}] 为空 → 返回 -1"
            )
            return -1

        mid = (l + r) // 2
        subarray = arr[l:r + 1]

        proof_steps.append(
            f"{indent}P({len(subarray)}): arr[{l}..{r}] = {subarray}"
        )

        if arr[mid] == target:
            proof_steps.append(
                f"{indent}  mid={mid}, arr[mid]={arr[mid]} == target={target} → 找到!"
            )
            return mid
        elif target < arr[mid]:
            proof_steps.append(
                f"{indent}  target < arr[mid] ({target} < {arr[mid]})"
                f" → 左半 {arr[l:mid]}（P({mid - l}) 由 IH 成立）"
            )
            return _bs(l, mid - 1, depth + 1)
        else:
            proof_steps.append(
                f"{indent}  target > arr[mid] ({target} > {arr[mid]})"
                f" → 右半 {arr[mid + 1:r + 1]}（P({r - mid}) 由 IH 成立）"
            )
            return _bs(mid + 1, r, depth + 1)

    result = _bs(0, len(arr) - 1)
    return result, proof_steps


# ============================================================
# 2. 归并排序 — 数学归纳法证明追踪
# ============================================================

def merge_sort_tracked(arr: List[int]) -> Tuple[List[int], List[str]]:
    """
    归并排序（带归纳证明追踪）。

    数学归纳法证明：
      P(k): 对长度为 k 的数组，merge_sort 返回有序数组。

      Base Case: k=0 或 k=1 → 直接返回 [OK]

      Inductive Step:
        假设 P(1..k) 成立。
        对长度为 k+1 的数组:
          - 分成两半，长度分别为 left_len 和 right_len
          - 由 IH，两半分别有序
          - merge 过程保证合并结果有序:
            * 每步取两有序子数组的最小头部
            * 所以 result 始终有序 [OK]
    """
    proof_steps: List[str] = []

    def _ms(a: List[int], depth: int = 0) -> List[int]:
        indent = "  " * depth
        n = len(a)

        if n <= 1:
            proof_steps.append(
                f"{indent}Base: len={n}, arr={a} → 直接返回（已有序）"
            )
            return a[:]

        mid = n // 2
        left_part = a[:mid]
        right_part = a[mid:]

        proof_steps.append(
            f"{indent}P({n}): 分 [{left_part}] | [{right_part}]"
        )

        # IH: 左右半递归排序后各自有序
        left_sorted = _ms(left_part, depth + 1)
        right_sorted = _ms(right_part, depth + 1)

        proof_steps.append(
            f"{indent}  IH 后左={left_sorted}, 右={right_sorted}"
        )

        result = _merge_tracked(left_sorted, right_sorted, indent + "  ",
                                proof_steps)

        proof_steps.append(
            f"{indent}  merge→{result}（由 IH 和 merge 正确性，P({n}) 成立）"
        )

        return result

    sorted_arr = _ms(arr)
    return sorted_arr, proof_steps


def _merge_tracked(left: List[int], right: List[int], indent: str,
                   proof_steps: List[str]) -> List[int]:
    """
    归并两个有序数组（带追踪）。

    merge 正确的归纳证明:
      每次迭代前，result 包含两数组已处理部分且有序。
      取 l[0] 和 r[0] 中较小的 → 放入 result → 两数组仍有序。
      最终 l 和 r 全部放入 result → result 有序 [OK]
    """
    result = []
    i = j = 0

    proof_steps.append(
        f"{indent}merge 开始: left={left}, right={right}"
    )

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            proof_steps.append(
                f"{indent}  取 left[{i}]={left[i]} → result={result}"
            )
            i += 1
        else:
            result.append(right[j])
            proof_steps.append(
                f"{indent}  取 right[{j}]={right[j]} → result={result}"
            )
            j += 1

    result.extend(left[i:])
    result.extend(right[j:])

    proof_steps.append(
        f"{indent}merge 完成 → {result}（左右剩余追加，结果有序）"
    )

    return result


# ============================================================
# 3. 阶乘的归纳证明（简化示例）
# ============================================================

def factorial_proof(n: int) -> Tuple[int, List[str]]:
    """
    阶乘计算的归纳证明。

    P(n): factorial(n) 返回 n! = n × (n-1) × ... × 1
    Base: P(0): factorial(0) = 1 = 0! [OK]
    Step: 假设 P(k) 成立，factorial(k) = k!
          factorial(k+1) = (k+1) × factorial(k)
                         = (k+1) × k!    [由 IH]
                         = (k+1)!        [OK]
    """
    proof_steps: List[str] = []

    def _fact(x: int, depth: int = 0) -> int:
        indent = "  " * depth
        if x == 0:
            proof_steps.append(f"{indent}P(0): factorial(0) = 1 (base case)")
            return 1

        sub = _fact(x - 1, depth + 1)
        result = x * sub
        proof_steps.append(
            f"{indent}P({x}): factorial({x}) = {x} × factorial({x - 1})"
            f" = {x} × {sub} = {result}  [由 P({x - 1}) IH 成立]"
        )
        return result

    result = _fact(n)
    return result, proof_steps


# ============================================================
# 4. 斐波那契的归纳证明（追踪比较 naive vs 优化）
# ============================================================

def fibonacci_correctness_proof() -> List[str]:
    """
    斐波那契数列算法正确性的归纳证明。

    P(n): fib(n) 返回第 n 个斐波那契数 F_n
          F_0 = 0, F_1 = 1, F_n = F_{n-1} + F_{n-2}

    Base:
      P(0): fib(0) = 0 = F_0 [OK]
      P(1): fib(1) = 1 = F_1 [OK]

    Step: 假设 P(k-1) 和 P(k-2) 成立
          fib(k) = fib(k-1) + fib(k-2)
                 = F_{k-1} + F_{k-2}  [由 IH]
                 = F_k                 [OK]
    """
    steps = [
        "斐波那契归纳证明:",
        "",
        "  定义: F_0 = 0, F_1 = 1, F_n = F_{n-1} + F_{n-2}",
        "",
        "  Base Cases:",
        "    P(0): fib(0) = 0 = F_0  [OK]",
        "    P(1): fib(1) = 1 = F_1  [OK]",
        "",
        "  Inductive Hypothesis:",
        "    假设 P(k-1)和 P(k-2)成立，即",
        "    fib(k-1) = F_{k-1} 且 fib(k-2) = F_{k-2}",
        "",
        "  Inductive Step (P(k)):",
        "    fib(k) = fib(k-1) + fib(k-2)",
        "           = F_{k-1} + F_{k-2}    (由 IH)",
        "           = F_k                    (斐波那契定义)",
        "    ∴ P(k) 成立  [OK]",
        "",
        "  [!] 注意: 归纳法证明的是正确性，NOT 效率",
        "    naive 递归 O(2^n) 是正确但低效的 — 证明与复杂度是正交的"
    ]
    return steps


# ============================================================
# 5. 测试
# ============================================================

def _test():
    print("=" * 72)
    print("  数学归纳法证明算法正确性 — 演示")
    print("=" * 72)

    # ---- 1. 二分查找 ----
    print("\n" + "-" * 72)
    print("1. 二分查找 — 数学归纳法证明追踪")
    print("-" * 72)

    arr = [1, 3, 5, 7, 9, 11, 13, 15, 17]
    targets = [7, 4, 17, 1]

    for t in targets:
        idx, steps = binary_search_tracked(arr, t)
        print(f"\n  binary_search({arr}, {t}) → {idx}")
        print(f"  归纳证明步骤:")
        for s in steps:
            print(f"    {s}")

    # ---- 2. 归并排序 ----
    print("\n" + "-" * 72)
    print("2. 归并排序 — 数学归纳法证明追踪")
    print("-" * 72)

    test_cases = [
        [],
        [1],
        [3, 1],
        [5, 3, 8, 4, 2],
        [7, 2, 9, 1, 5, 3, 8, 4, 6],
    ]

    for tc in test_cases:
        result, steps = merge_sort_tracked(tc)
        print(f"\n  merge_sort({tc})")
        print(f"  结果: {result}")
        print(f"  归纳证明步骤:")
        for s in steps:
            print(f"    {s}")
        expected = sorted(tc)
        assert result == expected, f"排序错误: {result} != {expected}"
        print(f"  [OK] 验证通过")

    # ---- 3. 阶乘 ----
    print("\n" + "-" * 72)
    print("3. 阶乘 — 归纳证明")
    print("-" * 72)

    for n in [0, 1, 3, 5]:
        result, steps = factorial_proof(n)
        print(f"\n  factorial({n}) = {result}")
        for s in steps:
            print(f"    {s}")

    # ---- 4. 斐波那契 ----
    print("\n" + "-" * 72)
    print("4. 斐波那契 — 归纳证明")
    print("-" * 72)

    for line in fibonacci_correctness_proof():
        print(f"  {line}")

    # ---- 5. 总结 ----
    print("\n" + "-" * 72)
    print("5. 归纳法证明总结")
    print("-" * 72)
    print("""
  数学归纳法在算法证明中的应用:

  ┌─────────────────────────────────────────────────────────────┐
  │  算法类型        Base Case        IH 假设          Step   │
  ├─────────────────────────────────────────────────────────────┤
  │  二分查找        n=0 / n=1    P(k) 对小数组成立    P(k+1)  │
  │  归并排序        n=0 / n=1    P(≤k) 对子数组成立   P(k+1)  │
  │  阶乘            n=0          P(k-1) 成立          P(k)    │
  │  斐波那契        n=0,1        P(k-1),P(k-2) 成立   P(k)    │
  │  快速排序        n≤1          P(left),P(right)      P(k)   │
  └─────────────────────────────────────────────────────────────┘

  关键理解:
    - 归纳法连接了"小规模正确"和"大规模正确"
    - 递归算法的递归结构 = 归纳证明的自然框架
    - 证明正确后，再关注效率优化
    """)


if __name__ == "__main__":
    _test()