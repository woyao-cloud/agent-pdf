"""
demo_reservoir_sampling.py — 蓄水池抽样 + HyperLogLog 基数估算

配合第18章"实际工程中的算法应用"之 18.4 使用。

演示内容：
  1. Reservoir Sampling（蓄水池抽样）— 流式均匀采样
  2. HyperLogLog 基数估算模拟 — 近似 COUNT(DISTINCT)
"""

import math
import random
import hashlib
from typing import List, Any, Iterator


# ============================================================
# 1. Reservoir Sampling（蓄水池抽样）
# ============================================================

class ReservoirSampler:
    """
    蓄水池抽样：从数据流中均匀随机采样 k 个元素。

    算法：
      - 前 k 个元素直接进入蓄水池
      - 第 i 个元素（i > k）以概率 k/i 替换蓄水池中的随机元素
    """

    def __init__(self, k: int):
        self.k = k
        self.reservoir: List[Any] = []
        self.count = 0

    def process(self, item: Any):
        """处理流中的一个元素"""
        self.count += 1
        if len(self.reservoir) < self.k:
            self.reservoir.append(item)
        else:
            r = random.randint(0, self.count - 1)
            if r < self.k:
                self.reservoir[r] = item

    def process_all(self, items: Iterator):
        """批处理"""
        for item in items:
            self.process(item)

    def get_sample(self) -> List[Any]:
        return list(self.reservoir)


def verify_uniformity(population_size: int, sample_size: int, trials: int):
    """
    验证蓄水池抽样的均匀性。

    通过在 [0, population_size-1] 的流上多次独立采样，
    统计每个元素被采到的频次。
    """
    counts = [0] * population_size

    for _ in range(trials):
        stream = range(population_size)
        sampler = ReservoirSampler(sample_size)
        sampler.process_all(stream)
        for item in sampler.get_sample():
            counts[item] += 1

    expected = trials * sample_size / population_size
    max_dev = max(abs(c - expected) for c in counts)
    min_count = min(counts)
    max_count = max(counts)

    return {
        "expected_per_element": expected,
        "min_count": min_count,
        "max_count": max_count,
        "max_deviation": max_dev,
        "deviation_pct": max_dev / expected * 100,
    }


# ============================================================
# 2. HyperLogLog（简化实现）
# ============================================================

class HyperLogLog:
    """
    简化的 HyperLogLog 基数估算实现。

    核心思想：使用哈希值二进制表示中前导零的最大数量来估算基数。
    使用分桶平均（Stochastic Averaging）提高精度。

    注意：此实现使用 2^b = 16 个桶，适用于教学演示。
    实际生产中会使用 2^14 个桶以获得 ~1% 的误差。
    """

    def __init__(self, b: int = 10):
        """
        参数：
          b: 桶索引位数。桶数 m = 2^b。b=10 时 m=1024，误差约 3%
        """
        if b < 4 or b > 16:
            raise ValueError("b 应在 4 到 16 之间")
        self.b = b
        self.m = 1 << b          # 桶数
        self.registers = [0] * self.m
        self.seen: set = set()   # 仅用于验证精度

    @staticmethod
    def _hash(item: str) -> int:
        """将字符串映射到 64 位哈希值"""
        h = hashlib.sha256(item.encode()).digest()
        return int.from_bytes(h[:8], "big")

    @staticmethod
    def _leading_zeros(x: int, bits: int = 64) -> int:
        """计算 x 在 bits 位长度中的前导零数量"""
        if x == 0:
            return bits
        return bits - x.bit_length()

    def add(self, item: str):
        """向 HyperLogLog 中添加一个元素"""
        h = self._hash(item)

        # 低 b 位作为桶索引
        idx = h & (self.m - 1)

        # 剩余位计算前导零（在 (64-b) 位字段中）
        remaining = h >> self.b
        zeros = self._leading_zeros(remaining, bits=64 - self.b) + 1

        if zeros > self.registers[idx]:
            self.registers[idx] = zeros

        # 仅用于精度验证
        self.seen.add(item)

    def add_all(self, items):
        for item in items:
            self.add(item)

    def count(self) -> float:
        """估计基数"""
        # 调和平均
        sum_inv = sum(2.0 ** (-r) for r in self.registers)
        if sum_inv == 0:
            return 0.0

        alpha = self._alpha(self.m)
        estimate = alpha * self.m * self.m / sum_inv

        # 小范围修正
        if estimate <= 2.5 * self.m:
            # 检查空桶数量
            v = self.registers.count(0)
            if v > 0:
                estimate = self.m * math.log(self.m / v)

        # 大范围修正
        max_val = 1 << 32
        if estimate > max_val / 30:
            ratio = estimate / max_val
            if ratio >= 1.0:
                ratio = 0.9999
            estimate = -max_val * math.log(1 - ratio)

        return estimate

    @staticmethod
    def _alpha(m: int) -> float:
        """修正因子"""
        if m == 16:
            return 0.673
        if m == 32:
            return 0.697
        if m == 64:
            return 0.709
        return 0.7213 / (1 + 1.079 / m)

    @property
    def memory_bytes(self) -> int:
        """每个 register 5 比特已足够"""
        return (self.m * 5 + 7) // 8

    def stats(self) -> dict:
        actual = len(self.seen) if self.seen else 0
        estimated = int(self.count())
        error_pct = abs(estimated - actual) / actual * 100 if actual > 0 else 0
        return {
            "buckets (m)": self.m,
            "memory_bytes": self.memory_bytes,
            "actual_cardinality": actual,
            "estimated_cardinality": estimated,
            "error_pct": f"{error_pct:.2f}%",
        }


# ============================================================
# LEADING_ZERO_ESTIMATOR：展示核心直觉
# ============================================================

class LeadingZeroEstimator:
    """
    仅用单个寄存器估计基数（最大前导零法）。

    这是 HyperLogLog 的前身——LogLog 算法的核心直觉。

    原理：哈希值为 0... 的概率约 1/2，
          哈希值为 00... 的概率约 1/4，
          哈希值为 000... 的概率约 1/8。
          因此最大前导零数 ρ 暗示了 N ≈ 2^ρ。
    """

    def __init__(self):
        self.max_zeros = 0
        self.seen: set = set()

    def add(self, item: str):
        h = HyperLogLog._hash(item)
        zeros = HyperLogLog._leading_zeros(h)
        if zeros > self.max_zeros:
            # 将实际的前导零数转为 "首个1的位置" ρ
            self.max_zeros = zeros + 1
        self.seen.add(item)

    def count(self) -> float:
        return 2.0 ** self.max_zeros

    def stats(self) -> dict:
        actual = len(self.seen)
        estimated = int(self.count())
        error_pct = abs(estimated - actual) / actual * 100 if actual > 0 else 0
        return {
            "method": "Max Leading Zeros (single register)",
            "max_zeros": self.max_zeros,
            "actual": actual,
            "estimated": estimated,
            "error_pct": f"{error_pct:.2f}%",
        }


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 72)
    print("蓄水池抽样（Reservoir Sampling）与 HyperLogLog 演示")
    print("=" * 72)

    # ---- 1. 蓄水池抽样基础演示 ----
    print("\n" + "-" * 72)
    print("1. 蓄水池抽样：从流中采样 k=5 个元素")
    print("-" * 72)

    stream = list(range(1, 101))  # 1..100
    sampler = ReservoirSampler(k=5)
    sampler.process_all(stream)
    print(f"\n数据流: 1 ~ 100 (共 {len(stream)} 个元素)")
    print(f"采样 k = 5")
    print(f"样本结果: {sampler.get_sample()}")

    # ---- 2. 均匀性验证 ----
    print("\n" + "-" * 72)
    print("2. 均匀性验证（10000 次独立采样试验）")
    print("-" * 72)

    result = verify_uniformity(
        population_size=50,
        sample_size=10,
        trials=10000,
    )
    print(f"\n总体大小: 50, 每次采样: 10, 试验次数: 10000")
    print(f"每个元素期望被采样次数: {result['expected_per_element']:.2f}")
    print(f"实际频次范围: [{result['min_count']}, {result['max_count']}]")
    print(f"最大偏差: {result['deviation_pct']:.2f}%")

    # ---- 3. 蓄水池抽样 vs 随机选择 ----
    print("\n" + "-" * 72)
    print("3. 蓄水池 vs 均匀随机选择（元素被选中的概率）")
    print("-" * 72)

    from collections import Counter
    trials = 100000
    k = 3
    total_items = 10

    reservoir_counts = Counter()
    for _ in range(trials):
        stream = range(total_items)
        sampler = ReservoirSampler(k)
        sampler.process_all(stream)
        for item in sampler.get_sample():
            reservoir_counts[item] += 1

    print(f"\n{'元素':<8} {'被采样次数':<12} {'概率':<10}")
    print("-" * 30)
    for i in range(total_items):
        prob = reservoir_counts[i] / (trials * k) * 100
        print(f"{i:<8} {reservoir_counts[i]:<12} {prob:<10.2f}%")
    print(f"\n均匀概率预期: {k/total_items*100:.2f}%")

    # ---- 4. 前导零估计器（核心直觉） ----
    print("\n" + "-" * 72)
    print("4. 单寄存器前导零估算（演示核心直觉）")
    print("-" * 72)

    for n in [10, 100, 1000, 10000, 100000]:
        est = LeadingZeroEstimator()
        for i in range(n):
            est.add(f"user_{i}")
        s = est.stats()
        print(f"  n={n:<8}  最大前导零={s['max_zeros']:<3}  估计值={s['estimated']:<10}  误差={s['error_pct']}")

    # ---- 5. HyperLogLog 更精确的估算 ----
    print("\n" + "-" * 72)
    print("5. HyperLogLog（m=16 桶）基数估算")
    print("-" * 72)

    for n in [10, 100, 1000, 10000, 50000, 100000]:
        hll = HyperLogLog(b=10)
        for i in range(n):
            hll.add(f"user_{i}")
        s = hll.stats()
        print(f"  n={n:<8}  实际={s['actual_cardinality']:<8}  "
              f"估计={s['estimated_cardinality']:<8}  误差={s['error_pct']}")

    # ---- 6. HyperLogLog 去重效果 ----
    print("\n" + "-" * 72)
    print("6. HyperLogLog 去重效果验证")
    print("-" * 72)

    hll = HyperLogLog(b=10)
    # 插入有重复的序列
    items = [f"key_{i % 50}" for i in range(200)]  # 实际只有 50 个不同元素
    random.shuffle(items)
    hll.add_all(items)

    s = hll.stats()
    print(f"\n插入 200 个元素（仅 50 个唯一值）：")
    print(f"  实际基数: {s['actual_cardinality']}")
    print(f"  估计基数: {s['estimated_cardinality']}")
    print(f"  误差: {s['error_pct']}")

    # ---- 7. 参数对精度的影响 ----
    print("\n" + "-" * 72)
    print("7. 桶数对精度的影响")
    print("-" * 72)

    n = 10000
    print(f"\n{'桶数 (m)':<12} {'内存 (B)':<12} {'估计值':<12} {'误差 %':<12}")
    print("-" * 48)

    for b in [4, 6, 8, 10, 12]:
        hll = HyperLogLog(b=b)
        for i in range(n):
            hll.add(f"user_{i}")
        s = hll.stats()
        print(f"2^{b}={1<<b:<4} {hll.memory_bytes:<12} "
              f"{s['estimated_cardinality']:<12} {s['error_pct']}")

    print()


if __name__ == "__main__":
    _test()