"""
demo_hash_table.py
从零实现哈希表。

包含：
  - 哈希函数
  - 链地址法冲突解决
  - 动态扩容 (rehashing)
  - O(1) 查找演示
"""


class HashTable:
    """使用链地址法 (Separate Chaining) 的哈希表。"""

    def __init__(self, initial_capacity=8, load_factor=0.75):
        self.capacity = initial_capacity
        self.load_factor = load_factor
        self.size = 0
        self.buckets = [[] for _ in range(self.capacity)]

    def _hash(self, key):
        return hash(key) % self.capacity

    def _needs_resize(self):
        return self.size / self.capacity >= self.load_factor

    def _resize(self):
        old_buckets = self.buckets
        self.capacity *= 2
        self.size = 0
        self.buckets = [[] for _ in range(self.capacity)]
        for bucket in old_buckets:
            for k, v in bucket:
                self.put(k, v)

    # ----------------------------------------------------------
    # 公共接口
    # ----------------------------------------------------------
    def put(self, key, value):
        if self._needs_resize():
            print(f"    [rehash] {self.size} 个元素, "
                  f"容量 {self.capacity // 2} -> {self.capacity}")
            self._resize()

        idx = self._hash(key)
        bucket = self.buckets[idx]
        for i, (k, _) in enumerate(bucket):
            if k == key:
                bucket[i] = (key, value)
                return
        bucket.append((key, value))
        self.size += 1

    def get(self, key):
        idx = self._hash(key)
        bucket = self.buckets[idx]
        for k, v in bucket:
            if k == key:
                return v
        raise KeyError(key)

    def __contains__(self, key):
        idx = self._hash(key)
        bucket = self.buckets[idx]
        return any(k == key for k, _ in bucket)

    def __getitem__(self, key):
        return self.get(key)

    def __setitem__(self, key, value):
        self.put(key, value)

    def __len__(self):
        return self.size

    def __repr__(self):
        parts = []
        for i, bucket in enumerate(self.buckets):
            if bucket:
                pairs = ", ".join(f"{k!r}: {v}" for k, v in bucket)
                parts.append(f"  [{i}]: {pairs}")
        return "{\n" + "\n".join(parts) + "\n}"


# ============================================================
# Demo 入口
# ============================================================
if __name__ == "__main__":
    print("=" * 56)
    print("  从零实现哈希表  Hash Table from Scratch")
    print("=" * 56)

    # 1. 基本操作
    print("\n[1] 基本 put / get")
    ht = HashTable()
    ht["apple"] = 5
    ht["banana"] = 8
    ht["cherry"] = 3
    print(f"    ht['apple']  = {ht['apple']}")
    print(f"    ht['banana'] = {ht['banana']}")
    print(f"    ht['cherry'] = {ht['cherry']}")
    print(f"    'apple' in ht  → {'apple' in ht}")
    print(f"    'durian' in ht → {'durian' in ht}")
    print(f"    当前元素数: {len(ht)}")

    # 2. 冲突与链地址
    print("\n[2] 冲突演示 (Collision)")
    ht2 = HashTable(initial_capacity=4, load_factor=10.0)
    ht2["a"] = 1
    ht2["e"] = 2
    ht2["i"] = 3
    print(f"    容量 = {ht2.capacity}, 元素 = {len(ht2)}")
    print(f"    ht2 内部结构:")
    print(f"    {ht2}")

    # 3. 动态扩容
    print("\n[3] 动态扩容 (Dynamic Resizing)")
    ht3 = HashTable(initial_capacity=4, load_factor=0.6)
    for i, ch in enumerate("abcdefghij"):
        ht3[ch] = i
    print(f"    最终容量 = {ht3.capacity}, 元素数 = {len(ht3)}")

    # 4. O(1) 查找性能演示
    print("\n[4] O(1) 查找性能演示")
    import time
    ht4 = HashTable()
    for i in range(10000):
        ht4[f"key_{i}"] = i
    start = time.perf_counter()
    for i in range(10000):
        _ = ht4[f"key_{i}"]
    dur = time.perf_counter() - start
    print(f"    10,000 次查找耗时: {dur*1000:.2f} ms")
    print(f"    平均: {dur*1000000:.1f} ns/次")

    # 5. 与 Python dict 对比
    print("\n[5] 与 Python dict 对比 (同规模)")
    d = {f"key_{i}": i for i in range(10000)}
    start = time.perf_counter()
    for i in range(10000):
        _ = d[f"key_{i}"]
    dur = time.perf_counter() - start
    print(f"    内置 dict 10,000 次查找耗时: {dur*1000:.2f} ms")
    print(f"    内置 dict 平均: {dur*1000000:.1f} ns/次")

    # 6. 边界情况
    print("\n[6] 边界情况")
    ht5 = HashTable()
    ht5[None] = "null_key"
    ht5[0] = "zero"
    ht5[False] = "false_bool"  # Python 中 hash(0) == hash(False)
    print(f"    ht5[None]  = {ht5[None]}")
    print(f"    ht5[0]     = {ht5[0]}")
    print(f"    ht5[False] = {ht5[False]}")
    print(f"    len = {len(ht5)}")

    print("\n" + "=" * 56)
    print("  哈希表演示完成!")
    print("=" * 56)