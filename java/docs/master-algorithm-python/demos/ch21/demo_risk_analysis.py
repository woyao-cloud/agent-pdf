"""
demo_risk_analysis.py — 算法风险评估：最坏情况 vs 平均情况

配合第21章"算法工程实践"之 21.3（算法选型与风险评估）使用。

核心演示：同一个算法在不同输入特征下表现差异巨大。
评估四种场景的风险：
  1. 快速排序 — pivot 选择策略（首元素 vs 随机 vs 三数取中）
  2. 哈希表   — 哈希冲突的实际性能退化
  3. KD-Tree  — 维度灾难对最近邻搜索的影响
  4. 缓存     — 不同淘汰策略（LRU vs FIFO）的命中率差异
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import time
import random
from collections import OrderedDict
import math


# ============================================================
# 1. 快速排序：pivot 选择策略的风险评估
# ============================================================

def quicksort_first_pivot(arr):
    """pivot 使用首元素 — 对已排序数据退化为 O(n²)"""
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    left = [x for x in arr[1:] if x <= pivot]
    right = [x for x in arr[1:] if x > pivot]
    return quicksort_first_pivot(left) + [pivot] + quicksort_first_pivot(right)


def quicksort_random_pivot(arr):
    """pivot 随机选择 — 期望 O(n log n)，几乎不会退化"""
    if len(arr) <= 1:
        return arr
    pivot_idx = random.randint(0, len(arr) - 1)
    pivot = arr[pivot_idx]
    left = [x for x in arr[:pivot_idx] + arr[pivot_idx + 1:] if x <= pivot]
    right = [x for x in arr[:pivot_idx] + arr[pivot_idx + 1:] if x > pivot]
    return quicksort_random_pivot(left) + [pivot] + quicksort_random_pivot(right)


def quicksort_median_of_three(arr):
    """pivot 使用三数取中 — 工程常用策略，有效规避最坏情况"""
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    candidates = [(arr[0], 0), (arr[mid], mid), (arr[-1], len(arr) - 1)]
    candidates.sort(key=lambda x: x[0])
    pivot_idx = candidates[1][1]
    pivot = arr[pivot_idx]
    rest = arr[:pivot_idx] + arr[pivot_idx + 1:]
    left = [x for x in rest if x <= pivot]
    right = [x for x in rest if x > pivot]
    return quicksort_median_of_three(left) + [pivot] + quicksort_median_of_three(right)


def benchmark_quicksort():
    """评估不同 pivot 策略的风险：平均情况 vs 最坏情况"""
    print("=" * 72)
    print("风险分析 1：快速排序 Pivot 选择策略")
    print("=" * 72)

    sizes = [100, 300, 500]

    for n in sizes:
        print(f"\n  n = {n}")

        for label, sort_fn in [
            ("首元素 pivot", quicksort_first_pivot),
            ("随机 pivot   ", quicksort_random_pivot),
            ("三数取中     ", quicksort_median_of_three),
        ]:
            # ---- 平均情况（随机数据） ----
            avg_data = [random.random() for _ in range(n)]
            start = time.perf_counter()
            try:
                sort_fn(avg_data)
                avg_time = time.perf_counter() - start
            except RecursionError:
                avg_time = float('inf')

            # ---- 最坏情况（已排序数据） ----
            worst_data = sorted(avg_data)
            start = time.perf_counter()
            try:
                sort_fn(worst_data)
                worst_time = time.perf_counter() - start
            except RecursionError:
                worst_time = float('inf')

            if avg_time == float('inf'):
                avg_str = "  CRASH"
            else:
                avg_str = f"{avg_time * 1000:7.2f}ms"

            if worst_time == float('inf'):
                worst_str = "  CRASH"
                ratio = float('inf')
            elif avg_time == float('inf'):
                worst_str = f"{worst_time * 1000:7.2f}ms"
                ratio = float('inf')
            else:
                worst_str = f"{worst_time * 1000:7.2f}ms"
                ratio = worst_time / avg_time

            risk = "高危" if ratio > 10 else ("中危" if ratio > 3 else "低危")
            if ratio == float('inf'):
                risk_str = " 高危(崩溃)"
            else:
                risk_str = risk

            print(f"    {label}  "
                  f"avg={avg_str:>8}  worst={worst_str:>8}  "
                  f"退化比={'INF' if ratio == float('inf') else f'{ratio:>6.2f}x':>8}  [{risk_str}]")

    print()
    print("  结论：随机 pivot 和三数取中有效规避了快排的最坏情况退化。")
    print("  首元素 pivot 在已排序数据上会灾难性退化为 O(n²)。")


# ============================================================
# 2. 哈希表：哈希冲突的风险评估
# ============================================================

def benchmark_hash_collision():
    """
    模拟哈希表在最坏情况下的性能退化。

    通过自定义哈希函数构造"良性"和"恶意"两种 key 序列，
    展示哈希冲突对插入/查询性能的影响。
    """
    print("\n" + "=" * 72)
    print("风险分析 2：哈希冲突性能退化")
    print("=" * 72)

    class BadHash:
        """悪意哈希：所有 key 映射到同一 bucket"""
        def __init__(self, val):
            self.val = val
        def __hash__(self):
            return 42  # 所有对象哈希值相同！→ 全部冲突
        def __eq__(self, other):
            return self.val == other.val
        def __repr__(self):
            return f"Bad({self.val})"

    class GoodHash:
        """良性哈希：均匀分布"""
        def __init__(self, val):
            self.val = val
        def __hash__(self):
            return hash(self.val)
        def __eq__(self, other):
            return self.val == other.val
        def __repr__(self):
            return f"Good({self.val})"

    sizes = [100, 500, 1000]

    print(f"\n{'n':>8} {'良性插入(ms)':>14} {'悪意插入(ms)':>14} {'退化比':>10} {'风险':>6}")
    print(f"{'-' * 56}")

    for n in sizes:
        # 良性：均匀哈希
        good_keys = [GoodHash(i) for i in range(n)]
        bad_keys = [BadHash(i) for i in range(n)]

        start = time.perf_counter()
        d_good = {k: i for i, k in enumerate(good_keys)}
        good_time = time.perf_counter() - start

        start = time.perf_counter()
        d_bad = {k: i for i, k in enumerate(bad_keys)}
        bad_time = time.perf_counter() - start

        ratio = bad_time / good_time if good_time > 0 else float('inf')
        risk = "高危" if ratio > 20 else ("中危" if ratio > 5 else "低危")

        print(f"{n:>8,} {good_time * 1000:>12.2f} {bad_time * 1000:>12.2f} "
              f"{ratio:>9.1f}x [{risk}]")

    print()
    print("  结论：哈希冲突可将 O(1) 操作退化为 O(n)。")
    print("  生产环境中需防范哈希碰撞 DoS 攻击（如确保哈希函数不可预测）。")


# ============================================================
# 3. KD-Tree：维度灾难风险
# ============================================================

def kdtree_search_bruteforce(points, query):
    """暴力最近邻搜索 —— O(n)"""
    best_dist = float('inf')
    best_pt = None
    for p in points:
        d = sum((a - b) ** 2 for a, b in zip(p, query))
        if d < best_dist:
            best_dist = d
            best_pt = p
    return best_pt, math.sqrt(best_dist)


class KDNode:
    """简易 KD-Tree 节点"""
    def __init__(self, point, left=None, right=None):
        self.point = point
        self.left = left
        self.right = right


def kdtree_build(points, depth=0):
    """构建 KD-Tree"""
    if not points:
        return None
    k = len(points[0])
    axis = depth % k
    points.sort(key=lambda p: p[axis])
    mid = len(points) // 2
    return KDNode(
        point=points[mid],
        left=kdtree_build(points[:mid], depth + 1),
        right=kdtree_build(points[mid + 1:], depth + 1)
    )


def kdtree_search(node, query, depth=0, best=None, best_dist=float('inf')):
    """KD-Tree 最近邻搜索"""
    if node is None:
        return best, best_dist

    k = len(query)
    axis = depth % k
    point = node.point
    dist = sum((a - b) ** 2 for a, b in zip(point, query))

    if dist < best_dist:
        best = point
        best_dist = dist

    diff = query[axis] - point[axis]
    near = node.left if diff < 0 else node.right
    far = node.right if diff < 0 else node.left

    best, best_dist = kdtree_search(near, query, depth + 1, best, best_dist)

    if diff ** 2 < best_dist:
        best, best_dist = kdtree_search(far, query, depth + 1, best, best_dist)

    return best, best_dist


def benchmark_kdtree():
    """
    评估 KD-Tree 在高维数据上的维度灾难风险。

    在 2 维和 50 维数据上分别比较 KD-Tree 和暴力搜索的性能，
    展示 KD-Tree 在高维下退化为 O(n) 的现象。
    """
    print("\n" + "=" * 72)
    print("风险分析 3：KD-Tree 维度灾难")
    print("=" * 72)

    n_points = 500
    n_queries = 20

    for dim, label in [(2, "低维 (2D)"), (50, "高维 (50D)")]:
        print(f"\n  {label}：{n_points} 个点，{n_queries} 次查询")

        points = [[random.random() for _ in range(dim)] for _ in range(n_points)]
        queries = [[random.random() for _ in range(dim)] for _ in range(n_queries)]

        # ---- 暴力搜索 ----
        start = time.perf_counter()
        for q in queries:
            kdtree_search_bruteforce(points, q)
        brute_time = time.perf_counter() - start

        # ---- KD-Tree 搜索 ----
        start = time.perf_counter()
        tree = kdtree_build(points)
        build_time = time.perf_counter() - start

        start = time.perf_counter()
        for q in queries:
            kdtree_search(tree, q, 0)
        search_time = time.perf_counter() - start

        speedup = brute_time / search_time if search_time > 0 else float('inf')
        risk = "低危" if speedup > 5 else ("中危" if speedup > 1 else "高危")

        print(f"    暴力搜索: {brute_time * 1000:.1f}ms")
        print(f"    KD-Tree建树: {build_time * 1000:.1f}ms  |  搜索: {search_time * 1000:.1f}ms")
        print(f"    加速比: {speedup:.2f}x  [{risk}]")

    print()
    print("  结论：KD-Tree 在低维数据上效果好（加速比显著），")
    print("  但在高维数据上因[维度灾难]退化为接近暴力搜索。")
    print("  维度 > 20 时应考虑近似最近邻方法（如 HNSW、LSH）。")


# ============================================================
# 4. 缓存淘汰策略风险
# ============================================================

class LRUCache:
    """LRU (Least Recently Used) 淘汰策略"""
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)

    def clear(self):
        self.cache.clear()


class FIFOCache:
    """FIFO (First In First Out) 淘汰策略"""
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}
        self.queue = []

    def get(self, key):
        return self.cache.get(key, None)

    def put(self, key, value):
        if key not in self.cache and len(self.cache) >= self.capacity:
            oldest = self.queue.pop(0)
            del self.cache[oldest]
        if key not in self.cache:
            self.queue.append(key)
        self.cache[key] = value

    def clear(self):
        self.cache.clear()
        self.queue.clear()


def benchmark_cache():
    """
    评估 LRU vs FIFO 在不同访问模式下的命中率差异。

    访问模式：
      - 局部性访问（最近访问过的很快再访问）
      - 循环扫描（遍历全部 key）
    """
    print("\n" + "=" * 72)
    print("风险分析 4：缓存淘汰策略命中率对比")
    print("=" * 72)

    n_keys = 500
    cache_size = 50
    n_accesses = 5000

    # 访问序列生成
    random.seed(42)
    keys = list(range(n_keys))

    patterns = [
        ("局部性访问（80% 集中在 20% key）", [
            random.choice(keys[:200]) if random.random() < 0.8
            else random.choice(keys)
            for _ in range(n_accesses)
        ]),
        ("循环扫描（遍历全部 key）", [
            keys[i % n_keys]
            for i in range(n_accesses)
        ]),
        ("随机访问（无局部性）", [
            random.choice(keys)
            for _ in range(n_accesses)
        ]),
    ]

    print(f"\n{'访问模式':<30} {'LRU命中率':>12} {'FIFO命中率':>12} {'LRU优势':>10}")
    print(f"{'-' * 64}")

    for pattern_name, access_seq in patterns:
        lru = LRUCache(cache_size)
        fifo = FIFOCache(cache_size)

        lru_hits = 0
        fifo_hits = 0

        for key in access_seq:
            # LRU
            if lru.get(key) is not None:
                lru_hits += 1
            else:
                lru.put(key, key)

            # FIFO
            if fifo.get(key) is not None:
                fifo_hits += 1
            else:
                fifo.put(key, key)

        lru_rate = lru_hits / n_accesses * 100
        fifo_rate = fifo_hits / n_accesses * 100
        advantage = lru_rate - fifo_rate

        print(f"{pattern_name:<30} {lru_rate:>10.1f}% {fifo_rate:>10.1f}% "
              f"{advantage:>+9.1f}%")

    print()
    print("  结论：LRU 在局部性访问模式中显著优于 FIFO；")
    print("  在循环扫描模式下两者命中率都低（缓存抖动）。")
    print("  选型时需分析业务访问模式，不存在万能策略。")


# ============================================================
# 主流程
# ============================================================

def _test():
    print("算法风险评估演示")
    print("最坏情况 vs 平均情况\n")

    benchmark_quicksort()
    benchmark_hash_collision()
    benchmark_kdtree()
    benchmark_cache()

    print("\n" + "=" * 72)
    print("总结")
    print("=" * 72)
    print("""
  算法选型风险评估要点：
    1. 永远不只评估平均情况——最坏情况才是真正的风险
    2. 数据特征会显著影响算法表现（分布、维度、有序性）
    3. 工程中的"小改动"（如 pivot 策略）可能带来质变
    4. 缓存策略没有银弹，需配合实际访问模式选择
    5. 监控生产环境中的 P99 耗时，而非平均耗时
    """)


if __name__ == "__main__":
    _test()