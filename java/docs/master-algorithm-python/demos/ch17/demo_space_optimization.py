"""
demo_space_optimization.py — 空间优化技巧对比演示

配合第17章"算法性能优化"使用，包含以下对比：

  [原地算法]     before vs after: 数组反转、数组去重
  [滚动数组]     before vs after: 斐波那契 DP O(n) vs O(1)
  [位压缩]       位图替代布尔列表、位运算 flags
  [对象池]       大量临时对象 vs 复用对象池
"""

import sys
import time
import random
from typing import List


# ============================================================
# 17.2.1 原地算法 — 数组反转与去重
# ============================================================

def reverse_extra(arr: List[int]) -> List[int]:
    """非原地：创建新数组 O(n) 额外空间"""
    return arr[::-1]


def reverse_inplace(arr: List[int]) -> None:
    """原地：双指针交换 O(1) 额外空间"""
    left, right = 0, len(arr) - 1
    while left < right:
        arr[left], arr[right] = arr[right], arr[left]
        left += 1
        right -= 1


def remove_duplicates_extra(arr: List[int]) -> List[int]:
    """非原地去重：需要额外存储"""
    seen = set()
    result = []
    for x in arr:
        if x not in seen:
            seen.add(x)
            result.append(x)
    return result


def remove_duplicates_inplace(arr: List[int]) -> int:
    """
    原地去重（已排序数组）：返回新长度，前 k 位即为去重结果
    类似 std::unique — 双指针，O(1) 额外空间
    """
    if not arr:
        return 0
    write_pos = 1
    for i in range(1, len(arr)):
        if arr[i] != arr[write_pos - 1]:
            arr[write_pos] = arr[i]
            write_pos += 1
    return write_pos


def _test_inplace():
    """测试原地算法"""
    print("  数组反转:")
    data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    original = data[:]
    print(f"    原始:      {original}")
    r = reverse_extra(data)
    print(f"    非原地反转: {r}")
    reverse_inplace(data)
    print(f"    原地反转:   {data}")
    assert data == r == list(reversed(original))

    print("  数组去重（已排序）:")
    data = [1, 1, 2, 2, 3, 4, 4, 4, 5, 5]
    print(f"    原始:           {data}")
    new_len = remove_duplicates_inplace(data)
    print(f"    原地去重结果:   {data[:new_len]}")
    assert data[:new_len] == [1, 2, 3, 4, 5]


# ============================================================
# 17.2.2 滚动数组 — 斐波那契 DP 空间优化
# ============================================================

def fibonacci_full_dp(n: int) -> int:
    """O(n) 空间：保存整个 DP 表"""
    dp = [0] * (n + 1)
    dp[0], dp[1] = 0, 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]


def fibonacci_rolling(n: int) -> int:
    """O(1) 空间：只用两个变量滚动"""
    if n < 2:
        return n
    prev2, prev1 = 0, 1
    for _ in range(2, n + 1):
        prev2, prev1 = prev1, prev1 + prev2
    return prev1


def _test_rolling_array():
    """测试滚动数组空间优化"""
    n = 1_000_000
    print(f"  计算 Fibonacci({n})...")

    start = time.perf_counter()
    r2 = fibonacci_rolling(n)
    t2 = time.perf_counter() - start
    print(f"    滚动数组 O(1) 空间: {t2:.4f}s  结果位宽: {r2.bit_length()} bits")

    # 小 n 验证正确性
    for n_small in range(20):
        assert fibonacci_full_dp(n_small) == fibonacci_rolling(n_small)
    print(f"    小规模正确性验证通过")


# ============================================================
# 17.2.3 位压缩 — 布尔标记 vs 位图
# ============================================================

class BoolList:
    """用 Python list of bool，每个元素 ~28 字节"""

    def __init__(self, n: int):
        self._data = [False] * n

    def set(self, idx: int, val: bool) -> None:
        self._data[idx] = val

    def get(self, idx: int) -> bool:
        return self._data[idx]

    def memory_bytes(self) -> int:
        return sys.getsizeof(self._data) + sum(sys.getsizeof(b) for b in self._data)


class Bitmap:
    """用 int 位运算压缩存储，1 bit 标记一个位置"""

    def __init__(self, n: int):
        self._n = n
        self._data = 0

    def set(self, idx: int, val: bool) -> None:
        if val:
            self._data |= (1 << idx)
        else:
            self._data &= ~(1 << idx)

    def get(self, idx: int) -> bool:
        return (self._data >> idx) & 1 == 1

    def memory_bytes(self) -> int:
        # Python int 对象 + 内部 digit 数组
        return sys.getsizeof(self._data)


def _test_bit_compression():
    """测试位压缩的内存节省效果"""
    n = 10_000

    bl = BoolList(n)
    bm = Bitmap(n)

    for i in range(n):
        val = i % 3 == 0
        bl.set(i, val)
        bm.set(i, val)

    # 验证正确性
    for i in range(n):
        assert bl.get(i) == bm.get(i), f"Mismatch at {i}"

    mem_bl = bl.memory_bytes()
    mem_bm = bm.memory_bytes()

    print(f"  BoolList (n={n}): ~{mem_bl} bytes")
    print(f"  Bitmap   (n={n}): ~{mem_bm} bytes")
    print(f"  节省倍数:         {mem_bl / max(mem_bm, 1):.1f}x")


# ============================================================
# 17.2.4 对象池 — 减少频繁分配
# ============================================================

class Point:
    __slots__ = ('x', 'y')

    def __init__(self, x=0, y=0):
        self.x = x
        self.y = y


class PointPool:
    def __init__(self, size=1000):
        self._pool = [Point() for _ in range(size)]
        self._available = list(range(size))

    def acquire(self, x, y):
        if not self._available:
            raise RuntimeError("Pool exhausted")
        idx = self._available.pop()
        p = self._pool[idx]
        p.x, p.y = x, y
        return p

    def release(self, point):
        for idx, p in enumerate(self._pool):
            if p is point:
                self._available.append(idx)
                return


def _test_object_pool():
    """测试对象池的分配速度"""
    n = 100_000

    # 普通分配
    start = time.perf_counter()
    points1 = [Point(random.random(), random.random()) for _ in range(n)]
    t1 = time.perf_counter() - start

    # 对象池分配
    pool = PointPool(n)
    start = time.perf_counter()
    points2 = []
    for _ in range(n):
        pt = pool.acquire(random.random(), random.random())
        points2.append(pt)
    t2 = time.perf_counter() - start

    print(f"  普通分配 {n} 个 Point:          {t1:.4f}s")
    print(f"  对象池分配 {n} 个 Point:         {t2:.4f}s  ({t1/t2:.2f}x)")


# ============================================================
# 主测试入口
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("17.2.1 原地算法 — 数组反转与去重")
    print("=" * 60)
    _test_inplace()

    print(f"\n{'=' * 60}")
    print("17.2.2 滚动数组 — 斐波那契")
    print("=" * 60)
    _test_rolling_array()

    print(f"\n{'=' * 60}")
    print("17.2.3 位压缩 — BoolList vs Bitmap")
    print("=" * 60)
    _test_bit_compression()

    print(f"\n{'=' * 60}")
    print("17.2.4 对象池 — 分配速度对比")
    print("=" * 60)
    _test_object_pool()