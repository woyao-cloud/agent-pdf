"""
demo_parallel.py — 并行算法基础演示

配合第17章"算法性能优化"使用，包含以下演示：

  [MapReduce 模式]   并行词频统计
  [并行求和]         串行 vs 多进程求和
  [并行排序]         分治并行排序
  [ThreadPool]       I/O 密集型任务对比
"""

import time
import random
import math
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from typing import List, Tuple, Callable


# ============================================================
# 17.3.1 MapReduce 模式 — 并行词频统计
# ============================================================

def mapper(text: str) -> List[Tuple[str, int]]:
    """Map: 统计一段文本中的词频"""
    counts = defaultdict(int)
    for word in text.split():
        word = word.strip('.,!?;:"\'()[]{}').lower()
        if word:
            counts[word] += 1
    return list(counts.items())


def reducer(key: str, values: List[int]) -> int:
    """Reduce: 合并相同键的值"""
    return sum(values)


def word_count_mapreduce(texts: List[str], num_workers: int = 4):
    """MapReduce 实现并行词频统计"""
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        # Map 阶段
        mapped = list(executor.map(mapper, texts))

    # Shuffle 阶段
    shuffled = defaultdict(list)
    for doc_counts in mapped:
        for word, count in doc_counts:
            shuffled[word].append(count)

    # Reduce 阶段
    return {word: reducer(word, counts) for word, counts in shuffled.items()}


def word_count_sequential(texts: List[str]):
    """串行词频统计"""
    total = defaultdict(int)
    for text in texts:
        for word, count in mapper(text):
            total[word] += count
    return dict(total)


def _test_word_count():
    """测试 MapReduce 词频统计"""
    # 生成测试数据：1000 段文本
    words = ["hello", "world", "python", "parallel", "mapreduce",
             "algorithm", "performance", "optimization", "cache", "memory"]
    texts = []
    for _ in range(1000):
        length = random.randint(50, 200)
        texts.append(" ".join(random.choices(words, k=length)))

    print(f"  数据量: {len(texts)} 段文本")

    start = time.perf_counter()
    seq_result = word_count_sequential(texts)
    t_seq = time.perf_counter() - start

    start = time.perf_counter()
    par_result = word_count_mapreduce(texts, num_workers=4)
    t_par = time.perf_counter() - start

    print(f"  串行:     {t_seq:.4f}s")
    print(f"  并行(4):  {t_par:.4f}s  ({t_seq/t_par:.2f}x)")
    assert seq_result == par_result


# ============================================================
# 17.3.2 并行求和
# ============================================================

def parallel_sum(data: List[float], num_workers: int = 4) -> float:
    """分块并行求和"""
    chunk_size = math.ceil(len(data) / num_workers)
    chunks = [data[i:i + chunk_size] for i in range(0, len(data), chunk_size)]

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        partial_sums = list(executor.map(sum, chunks))

    return sum(partial_sums)


def _test_parallel_sum(size=50_000_000):
    """测试并行求和的加速比"""
    data = [random.random() for _ in range(size)]
    print(f"  数据量: {size} 个浮点数")

    start = time.perf_counter()
    seq_sum = sum(data)
    t_seq = time.perf_counter() - start

    start = time.perf_counter()
    par_sum = parallel_sum(data, num_workers=4)
    t_par = time.perf_counter() - start

    print(f"  串行求和: {t_seq:.4f}s")
    print(f"  并行求和: {t_par:.4f}s  ({t_seq/t_par:.2f}x)")
    assert abs(seq_sum - par_sum) < 1e-6


# ============================================================
# 17.3.3 并行排序
# ============================================================

def parallel_sort(data: List[int], num_workers: int = 4) -> List[int]:
    """
    并行排序：分块排序 → 多路归并

    1. 将数据分成 num_workers 块
    2. 每块并行排序
    3. 多路归并合并结果
    """
    if len(data) < 100_000:
        return sorted(data)

    chunk_size = math.ceil(len(data) / num_workers)
    chunks = [data[i:i + chunk_size] for i in range(0, len(data), chunk_size)]

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        sorted_chunks = list(executor.map(sorted, chunks))

    return _multi_way_merge(sorted_chunks)


def _multi_way_merge(chunks: List[List[int]]) -> List[int]:
    """多路归并：合并 k 个有序数组"""
    import heapq
    result = []
    heap = []
    iterators = [iter(chunk) for chunk in chunks]

    for i, it in enumerate(iterators):
        try:
            first_val = next(it)
            heapq.heappush(heap, (first_val, i, it))
        except StopIteration:
            pass

    while heap:
        val, idx, it = heapq.heappop(heap)
        result.append(val)
        try:
            next_val = next(it)
            heapq.heappush(heap, (next_val, idx, it))
        except StopIteration:
            pass

    return result


def _test_parallel_sort(size=5_000_000):
    """测试并行排序加速比"""
    data = [random.randint(0, 10_000_000) for _ in range(size)]
    print(f"  数据量: {size} 个整数")

    start = time.perf_counter()
    seq_result = sorted(data)
    t_seq = time.perf_counter() - start

    start = time.perf_counter()
    par_result = parallel_sort(data, num_workers=4)
    t_par = time.perf_counter() - start

    print(f"  串行排序: {t_seq:.4f}s")
    print(f"  并行排序: {t_par:.4f}s  ({t_seq/t_par:.2f}x)")
    assert seq_result == par_result, "排序结果不匹配"


# ============================================================
# 17.3.4 ThreadPool — I/O 密集型任务
# ============================================================

def io_task(url_id: int) -> int:
    """模拟 I/O 密集型任务（网络请求或文件读取）"""
    time.sleep(0.05)  # 模拟 50ms I/O 等待
    return url_id * 2


def _test_threadpool(num_tasks=200):
    """测试 ThreadPool 对 I/O 密集型任务的加速"""
    print(f"  模拟 {num_tasks} 个 I/O 任务（每个 50ms）")

    # 串行
    start = time.perf_counter()
    seq_results = [io_task(i) for i in range(num_tasks)]
    t_seq = time.perf_counter() - start

    # 线程池并行
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(io_task, i) for i in range(num_tasks)]
        par_results = [f.result() for f in as_completed(futures)]
    t_par = time.perf_counter() - start

    print(f"  串行:      {t_seq:.4f}s")
    print(f"  线程池(8): {t_par:.4f}s  ({t_seq/t_par:.2f}x)")
    assert sorted(seq_results) == sorted(par_results)


# ============================================================
# 主测试入口
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("17.3.1 MapReduce — 并行词频统计")
    print("=" * 60)
    _test_word_count()

    print(f"\n{'=' * 60}")
    print("17.3.2 并行求和")
    print("=" * 60)
    _test_parallel_sum()

    print(f"\n{'=' * 60}")
    print("17.3.3 并行排序")
    print("=" * 60)
    _test_parallel_sort()

    print(f"\n{'=' * 60}")
    print("17.3.4 ThreadPool — I/O 密集型")
    print("=" * 60)
    _test_threadpool()