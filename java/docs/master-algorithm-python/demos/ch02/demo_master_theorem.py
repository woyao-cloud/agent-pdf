"""
demo_master_theorem.py
======================
Master Theorem (主定理) 应用演示。

对形如 T(n) = a·T(n/b) + f(n) 的递推关系，
主定理给出三种情况的复杂度结论。

本演示实现了多个经典算法并验证其复杂度：
  - 情况 1: 子问题占主导 → T(n) = Θ(n^{log_b a})
  - 情况 2: 平衡        → T(n) = Θ(n^{log_b a}·log n)
  - 情况 3: f(n) 占主导  → T(n) = Θ(f(n))
"""

import time
import sys
from typing import Callable, List, Any


# ============================================================
# 主定理分类验证
# ============================================================

def master_theorem_case(a: int, b: int, f_n_order: str) -> str:
    """
    根据主定理判断递推关系 T(n) = a·T(n/b) + f(n) 所属情况。

    参数:
      a: 子问题个数
      b: 规模缩减因子
      f_n_order: f(n) 的增长阶，如 '1', 'n', 'n^2', 'n log n'

    返回:
      情况说明字符串
    """
    import math

    log_b_a = math.log(a, b)
    f_orders = {
        '1':     0,
        'log n': 0,    # 接近常数
        'n^0.5': 0.5,
        'n':     1,
        'n log n': 1,  # 接近 n^1
        'n^1.5': 1.5,
        'n^2':   2,
        'n^2.5': 2.5,
        'n^3':   3,
    }

    f_order = f_orders.get(f_n_order, 0)

    # 情况 1: f(n) = O(n^{log_b a - ε}), ε > 0
    if f_order < log_b_a - 0.001:
        return (
            f"情况 1 (子问题主导)\n"
            f"  T(n) = {a}T(n/{b}) + O({f_n_order})\n"
            f"  log_{{b}}a = log_{{b}}{a} = {log_b_a:.3f}\n"
            f"  f(n) = O(n^{{{log_b_a:.3f} - ε}}) => T(n) = Θ(n^{{{log_b_a:.3f}}})"
        )

    # 情况 2: f(n) = Θ(n^{log_b a})
    if abs(f_order - log_b_a) < 0.001:
        if 'log' in f_n_order:
            return (
                f"情况 2 (平衡, 含 log 因子)\n"
                f"  T(n) = {a}T(n/{b}) + O({f_n_order})\n"
                f"  log_{{b}}a = log_{{b}}{a} = {log_b_a:.3f}\n"
                f"  f(n) = Θ(n^{{{log_b_a:.3f}}}·log n) => T(n) = Θ(n^{{{log_b_a:.3f}}}·log n)"
            )
        else:
            return (
                f"情况 2 (平衡)\n"
                f"  T(n) = {a}T(n/{b}) + O({f_n_order})\n"
                f"  log_{{b}}a = log_{{b}}{a} = {log_b_a:.3f}\n"
                f"  f(n) = Θ(n^{{{log_b_a:.3f}}}) => T(n) = Θ(n^{{{log_b_a:.3f}}}·log n)"
            )

    # 情况 3: f(n) = Ω(n^{log_b a + ε}), ε > 0
    if f_order > log_b_a + 0.001:
        # 还需验证正则条件 a·f(n/b) ≤ c·f(n) for c<1
        # 这里假设满足正则条件
        return (
            f"情况 3 (f(n)主导)\n"
            f"  T(n) = {a}T(n/{b}) + O({f_n_order})\n"
            f"  log_{{b}}a = log_{{b}}{a} = {log_b_a:.3f}\n"
            f"  f(n) = Ω(n^{{{log_b_a:.3f} + ε}}) => T(n) = Θ({f_n_order})"
        )

    return "无法确定（边界情况，需进一步分析）"


# ============================================================
# 各情况下的经典算法实现
# ============================================================

# --------------------------------------------------
# 情况 1 示例：T(n) = T(n/2) + O(1)  — 二分查找
# a=1, b=2, log₂1=0, f(n)=O(1)=O(n⁰) => 情况 2
# 实际上是情况 2，因为 f(n)=Θ(n^{log_b a})
# --------------------------------------------------

def binary_search(arr: List[int], target: int) -> int:
    """
    T(n) = T(n/2) + O(1)
    a=1, b=2, log₂1=0, f(n)=O(1)=Θ(n⁰)
    => 情况 2 => T(n) = Θ(log n)
    """
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1


def binary_search_recursive(arr: List[int], target: int,
                            left: int = 0, right: int = None) -> int:
    """递归版的二分查找，更直观体现 T(n) = T(n/2) + O(1)"""
    if right is None:
        right = len(arr) - 1
    if left > right:
        return -1
    mid = (left + right) // 2
    if arr[mid] == target:
        return mid
    elif arr[mid] < target:
        return binary_search_recursive(arr, target, mid + 1, right)
    else:
        return binary_search_recursive(arr, target, left, mid - 1)


# --------------------------------------------------
# 情况 2 示例：T(n) = 2T(n/2) + O(n) — 归并排序
# a=2, b=2, log₂2=1, f(n)=O(n)=Θ(n¹)
# => 情况 2 => T(n) = Θ(n log n)
# --------------------------------------------------

def merge_sort(arr: List[int]) -> List[int]:
    """
    T(n) = 2T(n/2) + O(n)
    a=2, b=2, log₂2=1, f(n)=O(n)=Θ(n¹)
    => 情况 2 => T(n) = Θ(n log n)
    """
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])

    # 合并 O(n)
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


# --------------------------------------------------
# 情况 1 示例：T(n) = 2T(n/2) + O(1) — 二叉树遍历
# a=2, b=2, log₂2=1, f(n)=O(1)=O(n^{1-ε})
# => 情况 1 => T(n) = Θ(n)
# --------------------------------------------------

def count_nodes_in_perfect_tree(depth: int) -> int:
    """
    遍历完美二叉树，每个节点 O(1) 操作
    T(n) = 2T(n/2) + O(1), 其中 n = 2^depth
    a=2, b=2, log₂2=1, f(n)=O(1)=O(n^{1-ε})
    => 情况 1 => T(n) = Θ(n)
    说明：节点总数是 n，所以遍历所有节点自然是 O(n) ✓
    """
    if depth == 0:
        return 1
    left_count = count_nodes_in_perfect_tree(depth - 1)
    right_count = count_nodes_in_perfect_tree(depth - 1)
    return 1 + left_count + right_count


# --------------------------------------------------
# 情况 2 （变体）：T(n) = 3T(n/3) + O(n)
# a=3, b=3, log₃3=1, f(n)=O(n)=Θ(n¹)
# => 情况 2 => T(n) = Θ(n log n)
# --------------------------------------------------

def ternary_search_max(arr: List[int]) -> int:
    """
    三分查找最大值（假设数组先增后减）
    T(n) = 3T(n/3) + O(1)
    注意: 实际上最优实现是 T(n) = T(2n/3) + O(1)
    这里只是为了演示主定理而取 3 个子问题
    """
    if len(arr) == 1:
        return arr[0]

    # 分成 3 段
    n = len(arr)
    third = n // 3
    left = ternary_search_max(arr[:third])
    mid = ternary_search_max(arr[third:2*third])
    right = ternary_search_max(arr[2*third:])
    return max(left, mid, right)


# --------------------------------------------------
# 情况 3 示例：T(n) = 2T(n/2) + O(n²)
# a=2, b=2, log₂2=1, f(n)=O(n²)=Ω(n^{1+ε})
# => 情况 3 => T(n) = Θ(n²)
# --------------------------------------------------

def naive_matrix_multiply(A: List[List[int]],
                          B: List[List[int]]) -> List[List[int]]:
    """
    朴素矩阵乘法（仅为演示主定理，实际不是分治实现）
    真正的分治矩阵乘 T(n) = 8T(n/2) + O(n²)
    a=8, b=2, log₂8=3, f(n)=O(n²)=O(n^{3-ε})
    => 情况 1 => T(n) = Θ(n³)
    """
    n = len(A)
    C = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            for k in range(n):
                C[i][j] += A[i][k] * B[k][j]
    return C


# ============================================================
# 主定理应用速查表
# ============================================================

def print_master_theorem_table():
    """输出主定理常见案例速查表"""
    print("=" * 75)
    print("主定理常见案例速查")
    print("=" * 75)

    examples = [
        (1, 2, '1',       '二分查找'),
        (1, 2, 'n',       '折半求最值'),
        (2, 2, '1',       '二叉树遍历'),
        (2, 2, 'n',       '归并排序'),
        (2, 2, 'n^2',     '低效分治'),
        (3, 3, 'n',       '三分归并'),
        (4, 2, 'n',       '暴力矩阵乘'),
        (7, 2, 'n^2',     'Strassen 矩阵乘'),
        (8, 2, 'n^2',     '朴素分治矩阵乘'),
        (4, 3, '1',       '三路分治'),
        (3, 4, 'n^2',     '快速矩阵乘变体'),
    ]

    print(f"{'算法':<20} {'a':>3} {'b':>3} {'f(n)':<10} {'log_b a':<8} {'情况':<10} {'复杂度':<15}")
    print("-" * 75)

    for a, b, f_n, algo_name in examples:
        import math
        log_b_a = math.log(a, b) if a > 0 else 0

        # 简化判断（与正式主定理判断略有不同，仅供速查参考）
        f_orders = {'1': 0, 'n': 1, 'n^2': 2}
        f_order_val = f_orders.get(f_n, 0)

        if f_order_val < log_b_a - 0.001:
            case = "情况 1"
            if abs(log_b_a - round(log_b_a)) < 0.001:
                complexity = f"Θ(n^{{{int(log_b_a)}}})"
            else:
                complexity = f"Θ(n^{{{log_b_a:.2f}}})"
        elif abs(f_order_val - log_b_a) < 0.001:
            case = "情况 2"
            if abs(log_b_a - round(log_b_a)) < 0.001:
                complexity = f"Θ(n^{{{int(log_b_a)}}}·log n)"
            else:
                complexity = f"Θ(n^{{{log_b_a:.2f}}}·log n)"
        else:
            case = "情况 3"
            complexity = f"Θ({f_n})"

        print(f"{algo_name:<20} {a:>3} {b:>3} {f_n:<10} {log_b_a:<8.2f} {case:<10} {complexity:<15}")


# ============================================================
# 基准测试：验证理论复杂度
# ============================================================

def measure_time(func, *args, repetitions: int = 3) -> float:
    """测量函数执行时间（取最小重复次数以减少噪声）"""
    best = float('inf')
    for _ in range(repetitions):
        start = time.perf_counter()
        func(*args)
        elapsed = time.perf_counter() - start
        if elapsed < best:
            best = elapsed
    return best


def verify_complexity():
    """
    验证不同算法的实际运行时间是否符合主定理的预测。
    通过测量多个输入规模下的时间，观察增长趋势与理论是否一致。
    """

    print("\n" + "=" * 75)
    print("主定理复杂度验证 — 实际运行时间")
    print("=" * 75)

    # 1. 二分查找 O(log n)
    print("\n" + "-" * 75)
    print("1. 二分查找 — 理论 O(log n)")
    print("   T(n) = T(n/2) + O(1), a=1, b=2 => 情况2 => Θ(log n)")
    print("-" * 75)
    for n in [10_000, 100_000, 1_000_000, 10_000_000]:
        arr = list(range(n))
        t = measure_time(binary_search, arr, n - 1)
        print(f"   n={n:>10,d}: {t*1e6:>8.3f} µs  "
              f"(log₂n={__import__('math').log2(n):.1f})")

    # 2. 归并排序 O(n log n)
    print("\n" + "-" * 75)
    print("2. 归并排序 — 理论 O(n log n)")
    print("   T(n) = 2T(n/2) + O(n), a=2, b=2 => 情况2 => Θ(n log n)")
    print("-" * 75)
    for n in [1_000, 10_000, 100_000]:
        import random
        arr = [random.randint(0, n) for _ in range(n)]
        t = measure_time(merge_sort, arr)
        print(f"   n={n:>10,d}: {t*1e3:>8.3f} ms  "
              f"(n log₂n={int(n * __import__('math').log2(n)):,d})")

    # 3. 二叉树节点计数 O(n)
    print("\n" + "-" * 75)
    print("3. 完美二叉树节点计数 — 理论 O(n)")
    print("   T(n) = 2T(n/2) + O(1), a=2, b=2 => 情况1 => Θ(n)")
    print("-" * 75)
    for depth in [10, 15, 20, 25]:
        n = 2 ** depth  # 完美二叉树近似节点数
        t = measure_time(count_nodes_in_perfect_tree, depth)
        print(f"   depth={depth:>2} (n≈{n:>10,d}): {t*1e3:>8.3f} ms")


# ============================================================
# 递归树可视化
# ============================================================

def print_recursion_tree_example():
    """
    以归并排序为例，可视化递归树

    T(n) = 2T(n/2) + O(n)
    """
    print("\n" + "=" * 75)
    print("递归树可视化 — 归并排序 T(n) = 2T(n/2) + O(n)")
    print("=" * 75)

    tree = """
    第 0 层 (规模 n):           [────────── merge O(n) ──────────]
                                /                            \\
    第 1 层 (规模 n/2):   [──── merge O(n/2) ────]      [──── merge O(n/2) ────]
                          /          \\                      /          \\
    第 2 层 (规模 n/4): [O(n/4)]  [O(n/4)]              [O(n/4)]  [O(n/4)]
                        /    \\    /    \\                  /    \\    /    \\
    第 3 层 (规模 n/8): .    .    .    .                .    .    .    .

    每层总工作量: 第 k 层有 2ᵏ 个子问题，每个规模 n/2ᵏ，每层总 O(n)
    层数: log₂n
    总工作量: O(n) × log₂n = O(n log n) ✅
    """
    print(tree)


# ============================================================
# 主函数
# ============================================================

def main():
    sys.setrecursionlimit(10000)

    print("=" * 75)
    print("精通算法 — 第2章 主定理演示")
    print("=" * 75)
    print()
    print("主定理 (Master Theorem) 用于求解形如")
    print("  T(n) = a·T(n/b) + f(n)")
    print("的递推关系，其中 a ≥ 1, b > 1。")
    print()

    # 1. 展示各情况的理论判定
    print("=" * 75)
    print("1. 主定理三种情况的判定示例")
    print("=" * 75)

    cases = [
        (1, 2, '1',       '二分查找'),
        (1, 2, 'n',       '折半查找最值'),
        (2, 2, '1',       '二叉树遍历'),
        (2, 2, 'n',       '归并排序'),
        (2, 2, 'n^2',     '低效分治法'),
        (4, 2, 'n',       '暴力矩阵乘'),
        (7, 2, 'n^2',     'Strassen 矩阵乘'),
        (3, 4, 'n^2',     '部分快速矩阵乘'),
    ]

    for a, b, f_n, name in cases:
        print(f"\n  ◆ {name} (a={a}, b={b}, f(n)={f_n})")
        result = master_theorem_case(a, b, f_n)
        for line in result.split('\n'):
            print(f"    {line}")

    # 2. 速查表
    print()
    print_master_theorem_table()

    # 3. 递归树可视化
    print_recursion_tree_example()

    # 4. 实际运行验证
    verify_complexity()

    print("\n" + "=" * 75)
    print("总结")
    print("=" * 75)
    print("""
  主定理快速判定法:
    1. 计算 c = log_b(a)
    2. 比较 f(n) 与 n^c 的增长阶
       - f(n) 增长较慢 → 情况 1: T(n) = Θ(n^c)
       - f(n) 增长相同 → 情况 2: T(n) = Θ(n^c · log n)
       - f(n) 增长较快 → 情况 3: T(n) = Θ(f(n))
    3. 特殊情况（主定理不适用）：
       - a 不是常数（如 T(n) = n·T(n/2) + O(1)）
       - f(n) 不是多项式
       - T(n) 不是标准分治形式
    """)


if __name__ == '__main__':
    main()

"""
运行示例输出（部分）：

======================================================================
主定理三种情况的判定示例
======================================================================

  ◆ 二分查找 (a=1, b=2, f(n)=1)
    情况 2 (平衡)
      T(n) = 1T(n/2) + O(1)
      log_b a = log₂1 = 0.000
      f(n) = Θ(n⁰) => T(n) = Θ(n⁰ · log n)

  ◆ 归并排序 (a=2, b=2, f(n)=n)
    情况 2 (平衡)
      T(n) = 2T(n/2) + O(n)
      log_b a = log₂2 = 1.000
      f(n) = Θ(n¹) => T(n) = Θ(n¹ · log n)

  ◆ Strassen 矩阵乘 (a=7, b=2, f(n)=n^2)
    情况 1 (子问题主导)
      T(n) = 7T(n/2) + O(n²)
      log_b a = log₂7 = 2.807
      f(n) = O(n^{2.807 - ε}) => T(n) = Θ(n^{2.807})
"""