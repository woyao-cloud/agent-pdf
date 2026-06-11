"""
demo_bloom_filter.py — 布隆过滤器（Bloom Filter）实现

配合第18章"实际工程中的算法应用"之 18.4 使用。

演示内容：
  1. Bloom Filter 标准实现（多个哈希函数）
  2. 假阳性率（False Positive Rate）验证
  3. 参数调优（m, n, k 关系）
"""

import math
import random
import hashlib
import struct
from typing import Set


# ============================================================
# Bloom Filter
# ============================================================
class BloomFilter:
    """
    标准布隆过滤器。

    使用 k 个哈希函数和 m 位的位数组。
    哈希函数通过 double hashing 技术生成：
      h_i(x) = (h1(x) + i × h2(x)) % m
    """

    def __init__(self, capacity: int, error_rate: float = 0.01):
        """
        参数：
          capacity: 预期插入的元素数量 n
          error_rate: 期望的假阳性率（0 < error_rate < 1）
        """
        self.capacity = capacity
        self.error_rate = error_rate

        # 计算最优参数
        # m = -n × ln(p) / (ln(2))^2
        self.m = self._optimal_m(capacity, error_rate)
        # k = (m/n) × ln(2)
        self.k = self._optimal_k(capacity, self.m)

        self.bit_array = bytearray(self.m)
        self.inserted_count = 0

    @staticmethod
    def _optimal_m(n: int, p: float) -> int:
        """计算最优位数组大小 m"""
        m = -n * math.log(p) / (math.log(2) ** 2)
        return max(1, int(m) + 1)

    @staticmethod
    def _optimal_k(n: int, m: int) -> int:
        """计算最优哈希函数数量 k"""
        k = (m / n) * math.log(2)
        return max(1, int(k) + 1)

    def _hash_digest(self, item: str) -> tuple:
        """生成两个基础哈希值（使用 SHA256 拆分）"""
        h = hashlib.sha256(item.encode()).digest()
        # 前 8 字节 → h1，后 8 字节 → h2
        h1 = struct.unpack("<Q", h[:8])[0]
        h2 = struct.unpack("<Q", h[8:16])[0]
        return h1, h2

    def _hashes(self, item: str):
        """生成 k 个哈希位置"""
        h1, h2 = self._hash_digest(item)
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, item: str):
        """向布隆过滤器中插入一个元素"""
        for pos in self._hashes(item):
            byte_idx = pos // 8
            bit_idx = pos % 8
            self.bit_array[byte_idx] |= (1 << bit_idx)
        self.inserted_count += 1

    def __contains__(self, item: str) -> bool:
        """检查元素是否可能存在"""
        for pos in self._hashes(item):
            byte_idx = pos // 8
            bit_idx = pos % 8
            if not (self.bit_array[byte_idx] & (1 << bit_idx)):
                return False
        return True

    def add_all(self, items):
        for item in items:
            self.add(item)

    @property
    def expected_false_positive_rate(self) -> float:
        """理论假阳性率：(1 - e^{-kn/m})^k"""
        if self.m == 0:
            return 1.0
        return (1 - math.exp(-self.k * self.inserted_count / self.m)) ** self.k

    @property
    def fill_ratio(self) -> float:
        """位数组被置 1 的比例"""
        ones = sum(bin(byte).count("1") for byte in self.bit_array)
        return ones / (self.m * 8) if self.m > 0 else 0.0

    def stats(self) -> dict:
        return {
            "capacity (n)": self.capacity,
            "bit_array (m)": self.m,
            "hash_functions (k)": self.k,
            "inserted": self.inserted_count,
            "memory_bytes": len(self.bit_array),
            "fill_ratio": f"{self.fill_ratio:.4f}",
            "expected_fpr": f"{self.expected_false_positive_rate:.6f}",
        }


# ============================================================
# 对比验证：Bloom Filter vs Python Set
# ============================================================
def _test():
    print("=" * 72)
    print("布隆过滤器（Bloom Filter）演示")
    print("=" * 72)

    # ---- 1. 基础演示 ----
    print("\n" + "-" * 72)
    print("1. 基础功能演示")
    print("-" * 72)

    bf = BloomFilter(capacity=100, error_rate=0.01)
    print(f"\n初始化参数：")
    for key, value in bf.stats().items():
        print(f"  {key}: {value}")

    items = ["apple", "banana", "cherry", "date", "elderberry"]
    bf.add_all(items)

    print(f"\n插入 {len(items)} 个元素后的状态：")
    for key, value in bf.stats().items():
        print(f"  {key}: {value}")

    print(f"\n成员查询：")
    for item in items + ["fig", "grape", "apple"]:
        result = "存在" if item in bf else "不存在"
        print(f"  '{item}': {result}")

    # ---- 2. 假阳性率验证 ----
    print("\n" + "-" * 72)
    print("2. 假阳性率验证")
    print("-" * 72)

    n_insert = 1000
    n_test = 10000

    bf = BloomFilter(capacity=n_insert, error_rate=0.01)
    inserted = {f"item_{i}" for i in range(n_insert)}
    bf.add_all(inserted)

    test_items = [f"test_{i}" for i in range(n_test)]
    false_positives = sum(1 for item in test_items if item in bf)

    print(f"\n插入 {n_insert} 个元素，测试 {n_test} 个未见元素：")
    print(f"  假阳性数: {false_positives}")
    print(f"  实际假阳性率: {false_positives / n_test:.6f}")
    print(f"  理论假阳性率: {bf.expected_false_positive_rate:.6f}")

    # ---- 3. 参数调优：m/n 比值的影响 ----
    print("\n" + "-" * 72)
    print("3. 参数调优：m/n（每位元素比特数）的影响")
    print("-" * 72)

    print(f"\n{'m/n':<8} {'k':<6} {'理论 FPR':<12} {'实际 FPR':<12}")
    print("-" * 38)

    n = 500
    n_test_2 = 5000

    for bits_per_item in [4, 6, 8, 10, 12, 16]:
        m = bits_per_item * n
        k = BloomFilter._optimal_k(n, m)

        bf_test = BloomFilter.__new__(BloomFilter)
        bf_test.capacity = n
        bf_test.error_rate = 0.01
        bf_test.m = m
        bf_test.k = k
        bf_test.bit_array = bytearray(m)
        bf_test.inserted_count = 0

        inserted_set = {f"item_{i}" for i in range(n)}
        bf_test.add_all(inserted_set)

        false_pos = sum(1 for i in range(n_test_2) if f"unknown_{i}" in bf_test)
        actual_fpr = false_pos / n_test_2
        expected_fpr = bf_test.expected_false_positive_rate

        print(f"{bits_per_item:<8} {k:<6} {expected_fpr:<12.6f} {actual_fpr:<12.6f}")

    # ---- 4. Bloom Filter 与 Set 的空间对比 ----
    print("\n" + "-" * 72)
    print("4. 空间效率对比")
    print("-" * 72)

    n_elements = [100, 1000, 10000]

    print(f"\n{'元素数':<10} {'Set (KB)':<12} {'Bloom (KB)':<12} {'节省比例':<10}")
    print("-" * 44)

    for n in n_elements:
        # Python Set 空间估算
        s: Set[str] = {f"key_{i}" for i in range(n)}
        set_size_bytes = n * (56 + 50)  # 粗略估算：每个 PyObject + 字符串

        # Bloom Filter
        bf = BloomFilter(capacity=n, error_rate=0.01)
        bloom_size_bytes = len(bf.bit_array)

        ratio = (set_size_bytes - bloom_size_bytes) / set_size_bytes * 100
        print(f"{n:<10} {set_size_bytes / 1024:<12.2f} {bloom_size_bytes / 1024:<12.2f} {ratio:<10.1f}%")

    # ---- 5. 不同错误率下的空间需求 ----
    print("\n" + "-" * 72)
    print("5. 不同假阳性率目标下的空间需求（n=1000）")
    print("-" * 72)

    print(f"\n{'目标 FPR':<12} {'m':<10} {'k':<6} {'内存 (KB)':<12}")
    print("-" * 40)

    n = 1000
    for target_fpr in [0.1, 0.05, 0.01, 0.001, 0.0001]:
        m = BloomFilter._optimal_m(n, target_fpr)
        k = BloomFilter._optimal_k(n, m)
        size_kb = m / 1024
        print(f"{target_fpr:<12.4f} {m:<10} {k:<6} {size_kb:<12.2f}")


if __name__ == "__main__":
    _test()