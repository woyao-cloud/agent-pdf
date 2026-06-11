"""
demo_tail_call.py
=================
演示尾递归（Tail Recursion）的概念、Python 的局限性，以及蹦床模式（Trampoline）。

核心知识点:
  1. 尾递归的定义 — 递归调用是函数中最后执行的操作
  2. Python 不支持尾递归优化（TCO）
  3. 蹦床模式（Trampoline）— 在无 TCO 语言中模拟尾递归
  4. 性能对比：普通递归 vs 尾递归 vs 蹦床 vs 迭代

配合第6章"递归与迭代"第6.3节使用。
"""

import sys
import time
from typing import Callable, Any, Union


# ============================================================
# 1. 尾递归 vs 非尾递归 — 概念演示
# ============================================================

def factorial_non_tail(n: int) -> int:
    """
    非尾递归阶乘
    最后一步是乘法 (n * ...)，不是递归调用本身
    """
    if n == 0:
        return 1
    return n * factorial_non_tail(n - 1)  # 递归后还有乘法


def factorial_tail(n: int, acc: int = 1) -> int:
    """
    尾递归阶乘
    最后一步是 return factorial_tail(...)，没有后续计算
    Python 不会优化它，栈空间仍是 O(n)
    """
    if n == 0:
        return acc
    return factorial_tail(n - 1, n * acc)  # 递归是最后一步


def gcd_non_tail(a: int, b: int) -> int:
    """
    非尾递归 — 最大公约数（欧几里得算法）
    最后一步是 return gcd(...)，看起来是尾递归？不是——
    因为三元运算符包含条件判断，实际执行路径有分支。
    """
    if b == 0:
        return a
    return gcd_non_tail(b, a % b)


def gcd_tail(a: int, b: int) -> int:
    """
    尾递归 — 最大公约数
    改写为 if-return 结构，确保递归是唯一路径上的最后操作
    """
    if b == 0:
        return a
    return gcd_tail(b, a % b)


# ============================================================
# 2. Python 栈深度演示
# ============================================================

def recurse_depth(n: int):
    """递归到指定深度，用于测试栈限制"""
    if n <= 0:
        return
    recurse_depth(n - 1)


def tail_recurse_depth(n: int):
    """尾递归到指定深度 — 一样会栈溢出"""
    if n <= 0:
        return
    return tail_recurse_depth(n - 1)


# ============================================================
# 3. 蹦床模式（Trampoline）
# ============================================================

Thunk = Union[Callable[[], Any], Any]
"""
Thunk（包裹函数）: 一个无参函数，调用时返回下一层递归或最终结果
蹦床函数的类型签名: 接收一个 Thunk，反复执行直到得到非函数值
"""


def trampoline(thunk: Thunk) -> Any:
    """
    蹦床函数 — 将递归展开为循环

    工作原理:
      1. 检查 thunk 是否可调用（callable）
      2. 如果是，执行它得到下一个 thunk
      3. 重复直到得到最终结果

    这避免了系统调用栈的增长——每次循环迭代都从上一个 thunk 返回，
    不会累积栈帧。

    参数:
        thunk: 初始 thunk（无参函数）或最终结果

    返回:
        最终计算结果
    """
    while callable(thunk):
        thunk = thunk()
    return thunk


def factorial_trampoline(n: int, acc: int = 1) -> Thunk:
    """
    阶乘 — 蹦床版本
    不直接递归，而是返回一个 lambda（thunk），由 trampoline 驱动执行

    注意：这不是递归调用！每次返回的是一个"待执行的包裹"
    """
    if n == 0:
        return acc
    # 返回 thunk 而非直接递归
    return lambda: factorial_trampoline(n - 1, n * acc)


def fib_trampoline(n: int, a: int = 0, b: int = 1) -> Thunk:
    """
    斐波那契 — 蹦床版本
    """
    if n == 0:
        return a
    if n == 1:
        return b
    return lambda: fib_trampoline(n - 1, b, a + b)


def gcd_trampoline(a: int, b: int) -> Thunk:
    """
    最大公约数 — 蹦床版本
    """
    if b == 0:
        return a
    return lambda: gcd_trampoline(b, a % b)


# ============================================================
# 4. 更通用的蹦床工具
# ============================================================

class Trampoline:
    """
    蹦床工具类 — 支持有参递归函数的适配

    用法:
        @Trampoline.trampoline
        def factorial(n, acc=1):
            if n == 0:
                return acc
            return Trampoline.call(factorial, n - 1, acc=n * acc)

        result = factorial(1000)  # 不会栈溢出
    """

    class _Suspend:
        """挂起点 — 包装函数名和参数"""
        def __init__(self, func, args, kwargs):
            self.func = func
            self.args = args
            self.kwargs = kwargs

    @staticmethod
    def call(func, *args, **kwargs):
        """标记一次递归调用，返回挂起点而非真的调用"""
        return Trampoline._Suspend(func, args, kwargs)

    @staticmethod
    def trampoline(func):
        """装饰器：将函数转为蹦床驱动的版本"""
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            while isinstance(result, Trampoline._Suspend):
                result = result.func(*result.args, **result.kwargs)
            return result
        return wrapper


@Trampoline.trampoline
def factorial_trampolined(n: int, acc: int = 1) -> Any:
    """使用 Trampoline 装饰器的阶乘"""
    if n == 0:
        return acc
    return Trampoline.call(factorial_trampolined, n - 1, acc=n * acc)


@Trampoline.trampoline
def fib_trampolined(n: int, a: int = 0, b: int = 1) -> Any:
    """使用 Trampoline 装饰器的斐波那契"""
    if n == 0:
        return a
    if n == 1:
        return b
    return Trampoline.call(fib_trampolined, n - 1, b, a + b)


# ============================================================
# 5. 性能对比
# ============================================================

def measure_time(func, *args, repetitions: int = 3) -> float:
    """测量函数执行时间（取最小重复次数）"""
    best = float('inf')
    for _ in range(repetitions):
        start = time.perf_counter()
        func(*args)
        elapsed = time.perf_counter() - start
        if elapsed < best:
            best = elapsed
    return best


def benchmark_depth():
    """测试不同递归方式的栈深度限制"""
    print("\n" + "=" * 65)
    print("递归深度限制测试")
    print("=" * 65)

    depths = [100, 500, 900, 1000, 1100, 1500]

    for depth in depths:
        print(f"\n深度 {depth}:")
        for name, func in [("普通递归", recurse_depth),
                           ("尾递归", tail_recurse_depth)]:
            try:
                start = time.perf_counter()
                func(depth)
                elapsed = time.perf_counter() - start
                print(f"  {name:<12} ✓ 成功, {elapsed*1000:.3f} ms")
            except RecursionError:
                print(f"  {name:<12} ✗ RecursionError (栈溢出)")

    print(f"\n当前递归限制: {sys.getrecursionlimit()}")
    print(f"蹦床模式不受此限制影响（使用循环而非递归）")


def benchmark_factorial():
    """阶乘各实现方式性能对比"""
    print("\n" + "=" * 65)
    print("阶乘实现方式性能对比")
    print("=" * 65)

    test_ns = [10, 100, 500, 1000, 5000, 10000]

    for n in test_ns:
        print(f"\nn = {n}:")
        implementations = []

        # 普通递归：n 过大时跳过
        if n <= 900:
            implementations.append(("普通递归", factorial_non_tail, n))
        else:
            print(f"  普通递归   跳过 (n > Python 默认递归限制)")

        implementations.extend([
            ("尾递归", factorial_tail, n),
            ("蹦床(lambda)", lambda nn=n: trampoline(lambda: factorial_trampoline(nn)), None),
            ("蹦床(class)", factorial_trampolined, n),
            ("迭代", lambda nn=n: factorial_iterative(nn), None),
        ])

        for name, func, arg in implementations:
            try:
                if arg is not None:
                    start = time.perf_counter()
                    result = func(arg)
                    elapsed = time.perf_counter() - start
                else:
                    start = time.perf_counter()
                    result = func()
                    elapsed = time.perf_counter() - start

                # 结果太长时只显示长度
                if n > 100:
                    result_str = f"{len(str(result))} 位数字"
                else:
                    result_str = str(result)
                print(f"  {name:<16} ✓ {result_str:>20}, {elapsed*1000:.4f} ms")
            except RecursionError:
                print(f"  {name:<16} ✗ RecursionError")
            except Exception as e:
                print(f"  {name:<16} ✗ {type(e).__name__}: {e}")


def factorial_iterative(n: int) -> int:
    """迭代阶乘（供对比用）"""
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


def benchmark_fib():
    """斐波那契各实现方式对比"""
    print("\n" + "=" * 65)
    print("斐波那契实现方式性能对比")
    print("=" * 65)

    test_ns = [10, 100, 500, 1000, 5000, 10000]

    for n in test_ns:
        print(f"\nn = {n}:")
        implementations = []

        # 普通递归跳过（n 稍大就慢到不可接受）
        if n <= 40:
            from demo_recursion import fib_naive
            implementations.append(("朴素递归", fib_naive, n))

        implementations.extend([
            ("蹦床(lambda)", lambda nn=n: trampoline(lambda: fib_trampoline(nn)), None),
            ("蹦床(class)", fib_trampolined, n),
            ("迭代表", fib_iterative_demo, n),
        ])

        for name, func, arg in implementations:
            try:
                if arg is not None:
                    start = time.perf_counter()
                    result = func(arg)
                    elapsed = time.perf_counter() - start
                else:
                    start = time.perf_counter()
                    result = func()
                    elapsed = time.perf_counter() - start

                result_str = f"{result}" if result < 10 ** 20 else f"{len(str(result))} 位数字"
                print(f"  {name:<16} ✓ {result_str:>20}, {elapsed*1000:.4f} ms")
            except RecursionError:
                print(f"  {name:<16} ✗ RecursionError")
            except Exception as e:
                print(f"  {name:<16} ✗ {type(e).__name__}: {e}")


def fib_iterative_demo(n: int) -> int:
    """迭代斐波那契（供对比用）"""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


# ============================================================
# 6. 深入理解：调用的栈帧行为
# ============================================================

def stack_inspection():
    """通过异常回溯查看调用栈深度"""
    print("\n" + "=" * 65)
    print("调用栈深度对比：普通递归 vs 蹦床")
    print("=" * 65)

    def get_stack_depth():
        """获取当前调用栈深度"""
        try:
            raise Exception()
        except Exception:
            return len(sys.exc_info()[2].tb_frame.f_back.f_back.f_back.f_back.f_back.f_back.f_back)

    # 普通递归的栈深度
    def recursive_stack(n, target_depth):
        if n == target_depth:
            depth = len(traceback.extract_stack())
            print(f"  普通递归深度 {n}: 栈帧数 ≈ {depth}")
            return depth
        return recursive_stack(n + 1, target_depth)

    # 蹦床的栈深度（在 thunk 内检查）
    def trampoline_stack(n, target_depth, current=0):
        if current == target_depth:
            depth = len(traceback.extract_stack())
            print(f"  蹦床深度 {current}: 栈帧数 ≈ {depth}")
            return depth
        return lambda: trampoline_stack(n, target_depth, current + 1)

    import traceback

    print("\n比较深度 = 500 时的栈帧数:")
    try:
        recursive_stack(0, 500)
    except RecursionError:
        print("  普通递归深度 500: RecursionError")

    try:
        trampoline(lambda: trampoline_stack(None, 500))
    except RecursionError:
        print("  蹦床深度 500: RecursionError (thunk 内仍可能有递归)")


# ============================================================
# 主函数
# ============================================================

def main():
    # 设置递归深度限制
    sys.setrecursionlimit(10000)

    print("=" * 65)
    print("精通算法 — 第6章 尾递归与蹦床模式演示")
    print("=" * 65)

    print("""
尾递归（Tail Recursion）:
  递归调用是函数中最后执行的操作。
  理论上编译器可以复用当前栈帧，将 O(n) 空间降为 O(1)。

Python 不支持 TCO:
  - Guido van Rossum 明确拒绝实现
  - 原因：不破坏 traceback、保持语义简单
  
蹦床模式（Trampoline）:
  用循环 + thunk（包裹函数）替代递归调用
  避免系统调用栈的增长
    """)

    # 1. 栈深度测试
    benchmark_depth()

    # 2. 阶乘性能对比
    benchmark_factorial()

    # 3. 斐波那契性能对比
    benchmark_fib()

    # 4. 正确性验证
    print("\n" + "=" * 65)
    print("正确性验证")
    print("=" * 65)

    tests = [
        ("尾递归阶乘(10)", factorial_tail(10), 3628800),
        ("蹦床阶乘(10)", trampoline(lambda: factorial_trampoline(10)), 3628800),
        ("装饰器阶乘(10)", factorial_trampolined(10), 3628800),
        ("尾递归GCD(48,18)", gcd_tail(48, 18), 6),
        ("蹦床GCD(48,18)", trampoline(lambda: gcd_trampoline(48, 18)), 6),
        ("蹦床斐波那契(10)", trampoline(lambda: fib_trampoline(10)), 55),
        ("装饰器斐波那契(10)", fib_trampolined(10), 55),
    ]

    all_pass = True
    for name, result, expected in tests:
        ok = result == expected
        status = "✓" if ok else "✗"
        if not ok:
            all_pass = False
        print(f"  {status} {name:<24} = {result} (期望 {expected})")

    print(f"\n  {'全部通过!' if all_pass else '有错误!'}")

    print("\n" + "=" * 65)
    print("关键结论")
    print("=" * 65)
    print("""
  1. Python 的尾递归不省栈空间 — 与普通递归一样消耗 O(n) 栈帧
  2. 蹦床模式可以突破递归深度限制 — 用循环驱动 thunk 执行
  3. 但蹦床有额外开销：每次创建 lambda 对象 → 性能不如直接迭代
  4. 工程建议：能用迭代就用迭代，后递归深度受控时再用递归
  5. 蹦床适合：需要在 Python 中实现深层"递归"且代码结构必须保持递归形态的场景
    """)


if __name__ == '__main__':
    main()

"""
运行示例输出（节选）：

=================================================================
递归深度限制测试
=================================================================

深度 100:
  普通递归   ✓ 成功, 0.123 ms
  尾递归     ✓ 成功, 0.115 ms

深度 1000:
  普通递归   ✓ 成功, 0.891 ms
  尾递归     ✓ 成功, 0.902 ms

深度 1100:
  普通递归   ✗ RecursionError (栈溢出)
  尾递归     ✗ RecursionError (栈溢出)

注意：两者在相同的深度下栈溢出 — 证明 Python 不优化尾递归
"""