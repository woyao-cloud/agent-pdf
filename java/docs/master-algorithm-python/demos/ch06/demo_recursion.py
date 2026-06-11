"""
demo_recursion.py
=================
演示递归的三大经典问题：阶乘、斐波那契数列（多种实现）、汉诺塔。

功能：
  1. 阶乘 — 递归 vs 迭代，附带调用栈可视化
  2. 斐波那契 — 朴素递归 / 记忆化 / 迭代 / 矩阵快速幂
  3. 汉诺塔 — 递归解法 + 步数统计

配合第6章"递归与迭代"使用。
"""

import sys
import time
from functools import lru_cache


# ============================================================
# 工具函数：调用栈可视化
# ============================================================

_depth = 0
_trace_enabled = False


def _trace(func_name: str, n, *args):
    """打印当前调用深度，用于可视化递归展开与回溯"""
    if not _trace_enabled:
        return
    indent = "  " * _depth
    if args:
        print(f"{indent}→ {func_name}(n={n}, {', '.join(str(a) for a in args)})")
    else:
        print(f"{indent}→ {func_name}(n={n})")


# ============================================================
# 1. 阶乘（Factorial）
# ============================================================

def factorial_recursive(n: int) -> int:
    """
    阶乘 — 递归实现
    复杂度: O(n) 时间, O(n) 栈空间
    递推关系: T(n) = T(n-1) + O(1) → O(n)
    """
    global _depth
    _trace("factorial_recursive", n)
    _depth += 1

    if n == 0:
        _depth -= 1
        _trace("factorial_recursive", n, "→ 返回 1")
        return 1

    result = n * factorial_recursive(n - 1)

    _depth -= 1
    _trace("factorial_recursive", n, f"→ 返回 {result}")
    return result


def factorial_iterative(n: int) -> int:
    """
    阶乘 — 迭代实现
    复杂度: O(n) 时间, O(1) 空间
    """
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


def factorial_tail(n: int, acc: int = 1) -> int:
    """
    阶乘 — 尾递归形式（Python 不支持 TCO，仅作演示）
    复杂度: O(n) 时间, O(n) 栈空间（Python 不会优化）
    """
    if n == 0:
        return acc
    return factorial_tail(n - 1, n * acc)


# ============================================================
# 2. 斐波那契数列（Fibonacci）
# ============================================================

def fib_naive(n: int) -> int:
    """
    斐波那契 — 朴素递归
    复杂度: O(2ⁿ) 时间, O(n) 栈空间
    递推关系: T(n) = T(n-1) + T(n-2) + O(1) → O(2ⁿ)
    """
    global _depth
    _trace("fib_naive", n)
    _depth += 1

    if n <= 1:
        _depth -= 1
        _trace("fib_naive", n, f"→ 返回 {n}")
        return n

    result = fib_naive(n - 1) + fib_naive(n - 2)

    _depth -= 1
    _trace("fib_naive", n, f"→ 返回 {result}")
    return result


def fib_memo(n: int, memo: dict = None) -> int:
    """
    斐波那契 — 记忆化递归
    复杂度: O(n) 时间, O(n) 空间（memo 缓存 + 栈空间）
    """
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n <= 1:
        return n

    memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo)
    return memo[n]


@lru_cache(maxsize=None)
def fib_lru(n: int) -> int:
    """
    斐波那契 — @lru_cache 记忆化
    复杂度: O(n) 时间, O(n) 空间
    lru_cache 自动管理缓存，比手动 memo 更简洁
    """
    if n <= 1:
        return n
    return fib_lru(n - 1) + fib_lru(n - 2)


def fib_iterative(n: int) -> int:
    """
    斐波那契 — 迭代
    复杂度: O(n) 时间, O(1) 空间
    """
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


def fib_matrix(n: int) -> int:
    """
    斐波那契 — 矩阵快速幂
    复杂度: O(log n) 时间, O(1) 空间
    数学原理: [[F(n+1), F(n)], [F(n), F(n-1)]] = [[1,1],[1,0]]ⁿ
    """
    if n <= 1:
        return n

    def mat_mul(a, b):
        return [
            [a[0][0] * b[0][0] + a[0][1] * b[1][0],
             a[0][0] * b[0][1] + a[0][1] * b[1][1]],
            [a[1][0] * b[0][0] + a[1][1] * b[1][0],
             a[1][0] * b[0][1] + a[1][1] * b[1][1]]
        ]

    def mat_pow(m, p):
        result = [[1, 0], [0, 1]]  # 单位矩阵
        base = m
        while p:
            if p & 1:
                result = mat_mul(result, base)
            base = mat_mul(base, base)
            p >>= 1
        return result

    result = mat_pow([[1, 1], [1, 0]], n - 1)
    return result[0][0]


def fib_tail(n: int, a: int = 0, b: int = 1) -> int:
    """
    斐波那契 — 尾递归形式（Python 不优化）
    逻辑等价于迭代，但 Python 仍然为每层递归分配栈帧
    """
    if n == 0:
        return a
    if n == 1:
        return b
    return fib_tail(n - 1, b, a + b)


# ============================================================
# 3. 汉诺塔（Tower of Hanoi）
# ============================================================

_hanoi_moves = 0


def hanoi(n: int, source: str, target: str, auxiliary: str, verbose: bool = True) -> int:
    """
    汉诺塔 — 递归解法

    参数:
        n: 圆盘数量
        source: 源柱子
        target: 目标柱子
        auxiliary: 辅助柱子
        verbose: 是否打印每一步

    返回:
        移动总步数

    复杂度: O(2ⁿ) 时间, O(n) 栈空间
    递推关系: T(n) = 2T(n-1) + 1, T(1) = 1 → T(n) = 2ⁿ - 1
    """
    global _hanoi_moves

    if n == 1:
        _hanoi_moves += 1
        if verbose:
            print(f"  移动圆盘 1: {source} → {target}")
        return _hanoi_moves

    # 将 n-1 个盘从 source 移到 auxiliary（借助 target）
    hanoi(n - 1, source, auxiliary, target, verbose)

    # 移动第 n 个盘
    _hanoi_moves += 1
    if verbose:
        print(f"  移动圆盘 {n}: {source} → {target}")

    # 将 n-1 个盘从 auxiliary 移到 target（借助 source）
    hanoi(n - 1, auxiliary, target, source, verbose)

    return _hanoi_moves


def hanoi_step_count(n: int) -> int:
    """仅计算汉诺塔步数（不打印），使用闭包重置计数器"""
    global _hanoi_moves
    _hanoi_moves = 0
    hanoi(n, "A", "C", "B", verbose=False)
    return _hanoi_moves


# ============================================================
# 性能基准测试
# ============================================================

def benchmark_fib(max_n: int = 40):
    """对比不同斐波那契实现的性能"""
    implementations = [
        ("记忆化递归", fib_memo),
        ("@lru_cache", fib_lru),
        ("迭代", fib_iterative),
        ("矩阵快速幂", fib_matrix),
        ("尾递归", fib_tail),
    ]

    print("\n" + "=" * 65)
    print("斐波那契性能对比")
    print("=" * 65)
    print(f"{'实现':<16} {'n':>6} {'结果':>28} {'耗时':>12}")
    print("-" * 65)

    for n in [10, 20, 30, 40, 100, 500]:
        for name, func in implementations:
            # 跳过可能过慢的测试
            if name == "记忆化递归" and n > 500:
                print(f"{name:<16} {n:>6} {'跳过':>28} {'':>12}")
                continue

            start = time.perf_counter()
            result = func(n)
            elapsed = time.perf_counter() - start
            status = f"OK" if elapsed < 1.0 else "SLOW"
            print(f"{name:<16} {n:>6} {result:>28,d} {elapsed*1000:>8.3f} ms ({status})")
        print("-" * 65)


def benchmark_hanoi():
    """汉诺塔步数验证"""
    print("\n" + "=" * 65)
    print("汉诺塔步数验证")
    print("=" * 65)
    print(f"{'n':>6} {'步数':>12} {'2ⁿ-1':>12} {'匹配':>8}")
    print("-" * 38)
    for n in range(1, 15):
        steps = hanoi_step_count(n)
        expected = 2 ** n - 1
        match = "✓" if steps == expected else "✗"
        print(f"{n:>6} {steps:>12,} {expected:>12,} {match:>8}")


def benchmark_factorial():
    """阶乘性能对比"""
    print("\n" + "=" * 65)
    print("阶乘性能对比")
    print("=" * 65)

    test_ns = [10, 100, 500, 1000]
    implementations = [
        ("递归", factorial_recursive),
        ("迭代", factorial_iterative),
        ("尾递归", factorial_tail),
    ]

    for n in test_ns:
        print(f"\nn = {n}:")
        for name, func in implementations:
            start = time.perf_counter()
            result = func(n)
            elapsed = time.perf_counter() - start
            print(f"  {name:<12} → {result:>5,d} 位数字, {elapsed*1000:.3f} ms")


# ============================================================
# 调用栈可视化演示
# ============================================================

def demo_call_stack():
    """用阶乘演示递归的展开与回溯过程"""
    global _trace_enabled, _depth

    print("\n" + "=" * 65)
    print("递归调用栈可视化 — factorial(5)")
    print("=" * 65)
    print("缩进表示递归深度，→ 表示入栈，← 表示出栈")
    print()

    _trace_enabled = True
    _depth = 0
    result = factorial_recursive(5)
    _trace_enabled = False
    _depth = 0

    print(f"\n结果: factorial(5) = {result}")
    print("观察: 展开阶段深度递增，回溯阶段深度递减")


def demo_fib_tree():
    """用斐波那契演示朴素递归的重复计算"""
    global _trace_enabled, _depth

    print("\n" + "=" * 65)
    print("斐波那契递归树 — fib_naive(5)")
    print("=" * 65)
    print("注意观察 fib(3)、fib(2) 被重复调用了多少次")
    print()

    _trace_enabled = True
    _depth = 0
    result = fib_naive(5)
    _trace_enabled = False
    _depth = 0

    print(f"\n结果: fib(5) = {result}")
    print("同一参数被多次调用 → 说明存在重复计算")


def demo_hanoi():
    """汉诺塔递归执行过程"""
    print("\n" + "=" * 65)
    print("汉诺塔 — n=3 的递归执行过程")
    print("=" * 65)
    print()

    global _hanoi_moves
    _hanoi_moves = 0

    steps = hanoi(3, "A", "C", "B", verbose=True)
    print(f"\n总步数: {steps}")
    print(f"公式验证: 2³ - 1 = {2 ** 3 - 1}")


# ============================================================
# 主函数
# ============================================================

def main():
    # 设置递归深度限制
    sys.setrecursionlimit(10000)

    print("=" * 65)
    print("精通算法 — 第6章 递归与迭代演示")
    print("=" * 65)

    # 1. 调用栈可视化
    demo_call_stack()

    # 2. 斐波那契递归树
    demo_fib_tree()

    # 3. 汉诺塔
    demo_hanoi()

    # 4. 阶乘基准测试
    benchmark_factorial()

    # 5. 斐波那契基准测试
    benchmark_fib(max_n=100)

    # 6. 汉诺塔步数验证
    benchmark_hanoi()

    print("\n" + "=" * 65)
    print("总结")
    print("=" * 65)
    print("""
  1. 朴素递归斐波那契在 n=40 时已经非常慢（O(2ⁿ)）
  2. 记忆化将复杂度从 O(2ⁿ) 降至 O(n)
  3. 迭代是最实用的方案：O(n) 时间，O(1) 空间
  4. 矩阵快速幂在 n 极大时优势明显
  5. 汉诺塔步数始终等于 2ⁿ - 1
  6. Python 的尾递归不节省栈空间
    """)


if __name__ == '__main__':
    main()

"""
运行示例输出（节选）：

=================================================================
递归调用栈可视化 — factorial(5)
=================================================================
缩进表示递归深度，→ 表示入栈，← 表示出栈

→ factorial_recursive(n=5)
  → factorial_recursive(n=4)
    → factorial_recursive(n=3)
      → factorial_recursive(n=2)
        → factorial_recursive(n=1)
          → factorial_recursive(n=0)
          → factorial_recursive(n=0) → 返回 1
        → factorial_recursive(n=1) → 返回 1
      → factorial_recursive(n=2) → 返回 2
    → factorial_recursive(n=3) → 返回 6
  → factorial_recursive(n=4) → 返回 24
→ factorial_recursive(n=5) → 返回 120

结果: factorial(5) = 120
"""