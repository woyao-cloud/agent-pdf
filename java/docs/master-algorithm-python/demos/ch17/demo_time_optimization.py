"""
demo_time_optimization.py — 时间优化技巧对比演示

配合第17章"算法性能优化"使用，包含以下对比：

  [循环优化]     before vs after: 循环内冗余计算提取
  [预计算]       before vs after: 每次判断 vs 预计算素数表
  [数据结构]     before vs after: list 查找 vs set 查找
  [提前终止]     before vs after: 无提前终止 vs 提前终止
"""

import random
import time
import math
from typing import List


# ============================================================
# 17.1.1 循环优化：减少循环内冗余计算
# ============================================================

def loop_bad(data: List[float]) -> float:
    """差：每次循环重复调用 len() 和属性访问"""
    total = 0.0
    for i in range(len(data)):       # len(data) 每次循环都求值
        total += data[i] * data[i]   # 属性访问 data[i] 两次
    return total


def loop_good(data: List[float]) -> float:
    """好：n 提到循环外，局部变量引用"""
    n = len(data)
    total = 0.0
    for i in range(n):
        val = data[i]
        total += val * val
    return total


def loop_best(data: List[float]) -> float:
    """最佳：直接迭代元素"""
    total = 0.0
    for val in data:
        total += val * val
    return total


def _test_loop_optimization(size=10_000_000):
    """对比三种循环写法的性能"""
    data = [random.random() for _ in range(size)]

    start = time.perf_counter()
    r1 = loop_bad(data)
    t1 = time.perf_counter() - start

    start = time.perf_counter()
    r2 = loop_good(data)
    t2 = time.perf_counter() - start

    start = time.perf_counter()
    r3 = loop_best(data)
    t3 = time.perf_counter() - start

    print(f"  loop_bad  (len+attr in loop): {t1:.4f}s")
    print(f"  loop_good (hoisted):         {t2:.4f}s  ({t1/t2:.2f}x)")
    print(f"  loop_best (iterate directly):{t3:.4f}s  ({t1/t3:.2f}x)")
    assert abs(r1 - r2) < 1e-6 and abs(r2 - r3) < 1e-6


# ============================================================
# 17.1.2 预计算：素数判断
# ============================================================

def is_prime_slow(x: int) -> bool:
    if x < 2:
        return False
    for i in range(2, int(math.isqrt(x)) + 1):
        if x % i == 0:
            return False
    return True


def sieve(n: int) -> List[bool]:
    prime = [True] * (n + 1)
    prime[0] = prime[1] = False
    for i in range(2, int(math.isqrt(n)) + 1):
        if prime[i]:
            step = i
            start = i * i
            prime[start:n + 1:step] = [False] * ((n - start) // step + 1)
    return prime


def _test_precomputation(size=200_000):
    """对比每次判断 vs 预计算素数表"""
    nums = [random.randint(0, 100_000) for _ in range(size)]

    start = time.perf_counter()
    slow_result = [is_prime_slow(x) for x in nums]
    t_slow = time.perf_counter() - start

    start = time.perf_counter()
    prime_cache = sieve(100_000)
    fast_result = [prime_cache[x] for x in nums]
    t_fast = time.perf_counter() - start

    print(f"  每次判断:      {t_slow:.4f}s")
    print(f"  预计算素数表:  {t_fast:.4f}s  ({t_slow/t_fast:.2f}x)")
    assert slow_result == fast_result


# ============================================================
# 17.1.3 数据结构选择：list 查找 vs set 查找
# ============================================================

def _test_data_structure(size=100_000, query_count=10_000):
    """对比 list 和 set 的成员查找性能"""
    data = [random.randint(0, 2 * size) for _ in range(size)]
    queries = [random.randint(0, 2 * size) for _ in range(query_count)]

    # list 查找
    start = time.perf_counter()
    list_result = [q in data for q in queries]
    t_list = time.perf_counter() - start

    # set 查找
    data_set = set(data)
    start = time.perf_counter()
    set_result = [q in data_set for q in queries]
    t_set = time.perf_counter() - start

    print(f"  list 查找: {t_list:.4f}s")
    print(f"  set  查找: {t_set:.4f}s  ({t_list/t_set:.2f}x)")
    assert list_result == set_result


# ============================================================
# 17.1.4 提前终止：无条件 vs 提前终止
# ============================================================

def find_first_duplicate_no_early(arr: List[int]) -> int:
    """模拟：扫描所有元素，记录出现次数"""
    from collections import Counter
    counts = Counter(arr)
    for x in arr:
        if counts[x] > 1:
            return x
    return -1


def find_first_duplicate_early(arr: List[int]) -> int:
    """提前终止：碰到重复立即返回"""
    seen = set()
    for x in arr:
        if x in seen:
            return x
        seen.add(x)
    return -1


def _test_early_termination(size=1_000_000):
    """对比提前终止的收益"""
    data = list(range(size)) + [42]  # 最终确保有重复

    start = time.perf_counter()
    r1 = find_first_duplicate_no_early(data)
    t1 = time.perf_counter() - start

    start = time.perf_counter()
    r2 = find_first_duplicate_early(data)
    t2 = time.perf_counter() - start

    print(f"  无提前终止: {t1:.4f}s")
    print(f"  提前终止:   {t2:.4f}s  ({t1/t2:.2f}x)")
    assert r1 == r2 and r1 == 42


# ============================================================
# 主测试入口
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("17.1.1 循环优化 — 冗余计算提前提取")
    print("=" * 60)
    _test_loop_optimization()

    print(f"\n{'=' * 60}")
    print("17.1.2 预计算 — 素数判断")
    print("=" * 60)
    _test_precomputation()

    print(f"\n{'=' * 60}")
    print("17.1.3 数据结构选择 — list vs set 查找")
    print("=" * 60)
    _test_data_structure()

    print(f"\n{'=' * 60}")
    print("17.1.4 提前终止 — 查找首个重复元素")
    print("=" * 60)
    _test_early_termination()