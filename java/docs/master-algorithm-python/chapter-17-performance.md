# 第17章 算法性能优化

> **核心问题**：同一个算法用不同方式实现，性能可差几个数量级。如何通过时间优化、空间优化、并行计算、缓存优化等手段，将算法的理论优势真正转化为工程上的高性能？

算法性能优化是连接"理论算法"与"工程实现"之间的桥梁。一个时间复杂度 O(n log n) 的算法如果实现不当，实际运行可能不如一个精心优化的 O(n²) 实现。本章从四个维度系统性地探讨优化策略。

---

## 17.1 时间优化技巧

### 解决的问题

算法的理论复杂度是固定的，但常数因子、系统开销、数据特征都会影响实际运行时间。本节的目标是在不改变算法渐进复杂度的前提下，通过代码层面的技巧将运行时间降到最低。

### 实现原理

#### 1. 循环优化 (Loop Optimization)

**循环展开 (Loop Unrolling)**：减少循环控制开销，让 CPU 更好地利用指令级并行。

```python
# 未优化
for i in range(n):
    a[i] *= 2

# 循环展开（每次处理4个元素）
for i in range(0, n, 4):
    a[i]   *= 2
    a[i+1] *= 2
    a[i+2] *= 2
    a[i+3] *= 2
```

**减少循环内冗余计算**：将循环不变的表达式提到循环外。

```python
# 差：每次循环都计算 len(data)
for i in range(len(data)):
    ...

# 好：只计算一次
n = len(data)
for i in range(n):
    ...

# 差：循环内重复属性访问
for i in range(n):
    result.append(data[i].value * factor)

# 好：提前提取
values = [item.value for item in data]
for v in values:
    result.append(v * factor)
```

**循环合并 (Loop Fusion)**：将多个遍历同一数据的循环合并为一个，减少 cache miss。

```python
# 差：两次遍历
sum1 = sum(data)
sum2 = sum(x * x for x in data)

# 好：一次遍历
sum1 = sum2 = 0
for x in data:
    sum1 += x
    sum2 += x * x
```

#### 2. 提前终止 (Early Termination)

一旦确定后续计算不影响结果，立即停止。

```python
def find_first_duplicate(arr):
    seen = set()
    for x in arr:
        if x in seen:
            return x  # 找到即返回
        seen.add(x)
    return None
```

#### 3. 预计算 (Precomputation)

用空间换时间，将重复计算结果提前存好。

```python
# 差：每次判断都计算素数表
def is_prime(x):
    if x < 2:
        return False
    for i in range(2, int(x ** 0.5) + 1):
        if x % i == 0:
            return False
    return True

def process(nums):
    return [n for n in nums if is_prime(n)]

# 好：预计算素数表
def sieve(n):
    prime = [True] * (n + 1)
    prime[0] = prime[1] = False
    for i in range(2, int(n ** 0.5) + 1):
        if prime[i]:
            for j in range(i * i, n + 1, i):
                prime[j] = False
    return prime

MAX_N = 10_000_000
prime_cache = sieve(MAX_N)

def is_prime_fast(x):
    return prime_cache[x]

def process_fast(nums):
    return [n for n in nums if is_prime_fast(n)]
```

#### 4. 数据结构选择 (Data Structure Selection)

| 操作 | 列表 | 集合 | 字典 | 堆 | bisect 有序列表 |
|------|:----:|:----:|:----:|:-:|:--------------:|
| 查找 | O(n) | O(1) | O(1) | O(n) | O(log n) |
| 插入 | O(1)末尾 | O(1) | O(1) | O(log n) | O(n) |
| 删除 | O(n) | O(1) | O(1) | O(log n) | O(n) |
| 最小值 | O(n) | O(n) | O(n) | O(1) | O(1) |

经验法则：
- 频繁查找 → 用 `set`/`dict` 代替 `list`
- 需要有序 + 插入删除少 → 用 `bisect` + `list`
- 需要频繁取极值 → 用 `heapq`
- 需要 FIFO → 用 `collections.deque` 而非 `list.pop(0)`

### 代码实现

详见配套代码 `demos/ch17/demo_time_optimization.py`。

### 使用场景

- **批处理系统**：大数据量处理时，循环优化和预计算收益显著
- **实时系统**：提前终止和数据结构选择能大幅降低延迟
- **高频交易**：每个微秒都关键，需要极致的循环优化

### 潜在风险与问题

- **过早优化反模式**：先让代码正确且可读，再针对性优化
- **Python 层面优化 vs C 扩展**：纯 Python 循环慢，考虑用 NumPy、PyPy 或 Cython
- **可读性下降**：极端优化（如循环展开）会破坏代码可维护性

### 优化策略

1. 先用 `cProfile` 定位瓶颈
2. 只优化热点代码（通常 20% 代码消耗 80% 时间）
3. 优化前后用 `timeit` 定量验证

---

## 17.2 空间优化技巧

### 解决的问题

内存不是无限的。当数据规模从百万级增长到十亿级时，空间复杂度 O(n) 和 O(1) 的区别可能意味着程序能否运行。空间优化旨在不显著牺牲时间的前提下，最小化内存使用。

### 实现原理

#### 1. 原地算法 (In-place Algorithm)

直接在输入数据结构上修改，而非创建副本。

```python
# 非原地：创建新数组
def reverse_array_extra(arr):
    return arr[::-1]

# 原地：双指针交换
def reverse_array_inplace(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        arr[left], arr[right] = arr[right], arr[left]
        left += 1
        right -= 1
```

#### 2. 位压缩 (Bit Compression)

用位运算将多个布尔值或小整数压缩到一个整数中。

```python
# 差：每个 bool 占 28 字节
flags = [False] * 1000

# 好：位图，1000 个标记只需要 125 字节
bitmap = 0
def set_bit(bitmap, pos):
    return bitmap | (1 << pos)
def test_bit(bitmap, pos):
    return (bitmap >> pos) & 1
```

#### 3. 滚动数组 (Rolling Array)

动态规划中只用前几行状态，无需保存整个 DP 表。

```python
# 差：O(n²) 空间
dp = [[0] * m for _ in range(n)]

# 好：O(m) 空间
dp = [0] * m
dp_prev = [0] * m
for i in range(1, n):
    for j in range(m):
        dp_prev = dp[:]  # 保存上一行
        ...
```

#### 4. 内存池 (Memory Pool)

对大量小对象的重复分配释放，用预分配池减少 GC 和 malloc 开销。

```python
class ObjectPool:
    def __init__(self, cls, size=100):
        self._pool = [cls() for _ in range(size)]
        self._in_use = [False] * size

    def acquire(self):
        for i, used in enumerate(self._in_use):
            if not used:
                self._in_use[i] = True
                return self._pool[i]
        raise RuntimeError("Pool exhausted")

    def release(self, obj):
        for i, pooled in enumerate(self._pool):
            if pooled is obj:
                self._in_use[i] = False
                return
```

### 代码实现

详见配套代码 `demos/ch17/demo_space_optimization.py`。

### 使用场景

- **嵌入式/移动设备**：内存受限，每个字节都要精打细算
- **大数据处理**：十亿级数据时，O(n) 的额外空间可能不可承受
- **高频服务**：减少 GC 停顿，用对象池降低分配频率

### 潜在风险与问题

- **时间-空间权衡**：空间压缩通常引入额外的 CPU 计算（如位操作的掩码运算）
- **代码复杂度**：原地算法比副本版本更容易出错，滚动数组的索引边界需仔细验证
- **Python 对象开销**：Python 的 int 是对象，一个 int 占 28 字节（64 位系统），位压缩的收益非常显著

### 优化策略

1. 首选原地算法，避免不必要的副本
2. 大量布尔标记用 `bitarray` 库或 `int` 位运算
3. DP 优先考虑滚动数组优化
4. 频繁创建的小对象用 `__slots__` 或对象池

---

## 17.3 并行算法基础

### 解决的问题

摩尔定律的"免费午餐"已经结束——单核性能增长放缓，但核心数量在持续增加。并行算法让程序同时利用多个 CPU 核心，从而在相同时间内处理更多的数据。但并行不是魔法，它带来了数据竞争、锁开销、负载不均衡等一系列新问题。

### 实现原理

#### 1. 数据并行 vs 任务并行

**数据并行 (Data Parallelism)**：将数据分片，每个 worker 处理一部分。

```python
# 数据并行：每个进程处理一部分数据
chunks = [data[i::num_workers] for i in range(num_workers)]
results = pool.map(process_chunk, chunks)
```

**任务并行 (Task Parallelism)**：将不同的独立任务分配给不同 worker。

```python
# 任务并行：不同任务并行执行
pool.apply_async(task_a)
pool.apply_async(task_b)
pool.apply_async(task_c)
```

#### 2. Multiprocessing vs Threading

| 特性 | multiprocessing | threading |
|------|:--------------:|:---------:|
| 内存模型 | 隔离进程 | 共享内存 |
| GIL 影响 | 无 | 有（CPU 密集任务受限） |
| 通信成本 | 高（序列化+IPC） | 低（直接读写） |
| 适用场景 | CPU 密集 | I/O 密集 |
| 启动开销 | 高 | 低 |

**选择规则**：
- CPU 密集型（数值计算、矩阵运算）→ `multiprocessing`
- I/O 密集型（网络请求、文件读写）→ `threading` 或 `asyncio`
- 混合型 → `concurrent.futures` 统一接口

#### 3. MapReduce 模式

经典的并行计算模型，分三步：

```python
def map_reduce(data, mapper, reducer, num_workers=4):
    # Step 1: Map — 每个 worker 处理部分数据
    with Pool(num_workers) as pool:
        mapped = pool.map(mapper, data)

    # Step 2: Shuffle — 按键分组
    shuffled = defaultdict(list)
    for item in mapped:
        shuffled[item[0]].append(item[1])

    # Step 3: Reduce — 合并每组结果
    return {k: reducer(k, v) for k, v in shuffled.items()}
```

#### 4. GPU 计算基础

GPU 拥有数千个计算核心，特别适合 SIMD（单指令多数据）模式。Python 中通过 CuPy、Numba CUDA、PyTorch 等访问 GPU。

```python
# 使用 CuPy 在 GPU 上做向量运算
import cupy as cp

a = cp.array([1, 2, 3])
b = cp.array([4, 5, 6])
c = cp.dot(a, b)  # 在 GPU 上执行
```

GPU 适用条件：
- 计算密集（算术运算 >> 内存访问）
- 数据并行度高
- 分支简单（避免 warp divergence）

### 代码实现

详见配套代码 `demos/ch17/demo_parallel.py`。

### 使用场景

- **批量数据处理**：MapReduce 处理 TB 级日志
- **科学计算**：矩阵乘法、FFT、蒙特卡洛模拟
- **实时渲染/推理**：GPU 加速图像处理和深度学习推理

### 潜在风险与问题

- **Amdahl 定律**：串行部分的占比决定了最大加速比
- **数据竞争**：多线程共享变量需加锁或用 `Queue`
- **进程通信开销**：进程间传输大量数据的序列化成本可能抵消并行收益
- **负载不均衡**：某些 shard 的数据量大或计算密集，导致其他 worker 空闲

### 优化策略

1. 先用 `joblib` 或 `concurrent.futures` 快速跑通并行版本
2. 监控加速比：理想是线性，实际受限于串行部分和通信开销
3. 大块数据用 `mmap` 共享内存，避免重复拷贝
4. I/O 密集型用 `asyncio` + `aiofiles`，比多线程更轻量

---

## 17.4 缓存优化策略

### 解决的问题

CPU 的速度远超内存——一次 L1 cache 命中约 1ns，一次内存访问约 100ns（差两个数量级）。算法的理论复杂度固然重要，但如果数据访问模式导致频繁 cache miss，实际性能可能远低于预期。缓存优化的核心是**最大化数据局部性**。

### 实现原理

#### 1. 缓存层级与访问代价

```
寄存器          ~0.3 ns
L1 cache         ~1   ns
L2 cache         ~4   ns
L3 cache         ~10  ns
主存 (RAM)       ~100 ns
磁盘 (SSD)       ~150 µs
```

**时间局部性 (Temporal Locality)**：刚访问过的地址短期内可能再次访问。

**空间局部性 (Spatial Locality)**：访问某个地址后，邻近地址可能很快被访问。

#### 2. 缓存友好的数据结构

**行优先 vs 列优先**：二维数组的遍历顺序至关重要。

```python
# 缓存友好：行优先遍历（按内存布局顺序访问）
for i in range(n):
    for j in range(m):
        matrix[i][j] += 1

# 缓存不友好：列优先遍历（跨行跳跃访问）
for j in range(m):
    for i in range(n):
        matrix[i][j] += 1
```

**紧凑数据结构**：数组 > 链表（数组连续存储，链表节点分散）。

```python
# 缓存友好：连续数组
class GraphAdjMatrix:
    def __init__(self, n):
        self.adj = [[0] * n for _ in range(n)]
    def neighbors(self, v):
        return [i for i, connected in enumerate(self.adj[v]) if connected]

# 缓存不友好：离散节点
class GraphAdjList:
    def __init__(self, n):
        self.adj = [[] for _ in range(n)]
    def neighbors(self, v):
        return self.adj[v]  # 仍可接受，但邻接表遍历指针跳跃
```

#### 3. 预取 (Prefetching)

告诉 CPU 提前加载数据到缓存。Python 中通过 `numpy` 等底层库间接受益，或手动调整访问模式触发硬件预取。

```python
# 利用硬件预取：顺序访问触发自动预取
for i in range(0, n, 64):  # 预取后面 64 个元素
    ...

# Python 层面的预取 hint（CPython 未暴露，但可以用 array 模块）
# 或用 NumPy 的步长访问触发预取
```

#### 4. 伪共享 (False Sharing)

多核 CPU 中，不同核心修改同一 cache line 的不同变量，导致 cache line 反复失效。

```
# 伪共享示意（C 语言级别）：
# 两个线程分别修改 struct 的 a 和 b，但它们在一个 cache line 上
struct { int a; int b; } shared;

# 解决：填充 (padding) 让 a 和 b 在不同 cache line
struct { int a; char pad[64]; int b; char pad2[64]; } padded;
```

Python 层面由于对象头开销大，变量天然分离，伪共享不常见。但在使用 `ctypes`、`numpy` 结构化数组或 `array` 模块时仍需注意。

### 代码实现

本节代码示例嵌入正文，无独立 demo。

### 使用场景

- **高性能数值计算**：矩阵乘法、图像处理、科学模拟
- **数据库引擎**：B+ 树的设计正是为最大化 cache locality
- **游戏引擎**：ECS 架构将数据紧凑排列，利用缓存局部性

### 潜在风险与问题

- **跨平台差异**：不同 CPU 的 cache line 大小（通常 64 字节）、预取策略不同
- **过度优化**：过早考虑缓存优化会导致代码可读性严重下降
- **Python 的抽象开销**：CPython 的字节码执行和对象模型使得底层的 cache 优化收益被稀释——此时考虑 C 扩展

### 优化策略

1. **先保证顺序访问**：遍历数组时按内存布局顺序
2. **数据紧凑化**：用 `array('i')`、`numpy.ndarray` 或 `struct` 替代 `list` of objects
3. **分块 (Tiling)**：将大矩阵切块，每个块完全在 cache 中处理
4. **profile 验证**：用 `perf stat -e cache-misses`（Linux）或 `valgrind --tool=cachegrind` 评估

---

## 本章总结

| 维度 | 核心思想 | 常用手段 |
|------|---------|---------|
| 时间优化 | 减少不必要的计算 | 循环优化、提前终止、预计算、合适的数据结构 |
| 空间优化 | 用更少的内存表达相同信息 | 原地算法、位压缩、滚动数组、对象池 |
| 并行优化 | 同时利用多个计算资源 | multiprocessing、MapReduce、GPU |
| 缓存优化 | 最大化数据局部性 | 顺序访问、紧凑结构、分块处理 |

**黄金法则**：先保证正确性和可读性 → 用 profiler 定位瓶颈 → 用数据指导优化 → 每次优化后验证。

优化的终极目标不是"快"，而是**在可维护性和性能之间找到最适合当前场景的平衡点**。
