# 第2章 榨干磁盘与内存：TSDB 存储引擎揭秘

## 2.1 时序数据库的存储挑战

### 写入特征

时序数据的写入模式与传统数据库截然不同。一个运行中的 Prometheus 实例每秒可能要处理数百万个数据点（samples），每个 sample 只是一个 `(timestamp, value)` 对。这种写入模式有几个显著特征：

| 特征 | 时序数据 | 传统 OLTP |
|------|---------|-----------|
| 写入模式 | 追加写，几乎无更新 | 随机读写 |
| 写入规模 | 千万级/秒 | 千级/秒 |
| 数据热点 | 最新数据 | 随机访问 |
| 删除模式 | 按时间批量删除 | 单行删除 |

### 存储挑战

**挑战一：高写入吞吐。** 时序数据是持续产生的，7×24 不间断。存储引擎必须能够持续吸收高吞吐的写入流量，不能因为 compaction、GC 等操作阻塞写入。

**挑战二：高基数导致的内存爆炸。** 当 Label 组合数量很大时（如 `user_id` 有 10 万个取值），每条时间序列都要在内存中维护一份索引，直接考验内存上限。

**挑战三：长周期查询性能。** 查询"过去 7 天的 P99 延迟"需要扫描数十亿个数据点，没有高效的索引和压缩机制是不可能完成的。

### Prometheus TSDB 的设计哲学

Prometheus 的 TSDB（Time Series Database）引擎设计于 2017 年（Prometheus v2.0），替代了之前基于 LevelDB 的存储实现。它的核心设计理念是：

1. **以空间换时间**：通过精心设计的 Block 结构和倒排索引，使得查询可以在毫秒级完成，代价是额外的存储空间
2. **充分利用时序数据的局部性**：最近的数据最常被查询，所以全部放在内存中；历史数据被高效压缩后存储到磁盘
3. **零拷贝读取**：通过 mmap 技术将索引文件映射到虚拟内存，由操作系统管理缓存

## 2.2 Head Block 与 Persistent Block

### 内存中的热数据：Head Block

Prometheus 将最近约 2 小时的数据全部放在内存中，这就是 **Head Block**。Head Block 是可读可写的：Prometheus scrape 到的数据先写入 Head Block，同时也写入 WAL 做持久化保障。

为什么是 2 小时？这是设计上的权衡：
- 时间太短：频繁落盘会增加 I/O 开销
- 时间太长：内存消耗过大，崩溃恢复时 WAL 重放时间过长
- 2 小时是一个在实践中验证过的平衡点

### Block 的内部结构

2 小时后，Head Block 被"冻结"（Freeze），落盘成为一个 Persistent Block。一个典型的 Block 目录结构如下：

```
01EM6Q6A1YPX4Z3X3X3X3X3X3X/
├── chunks/
│   └── 000001              # 压缩后的时序数据，每个最大 32KB
├── index/                   # 倒排索引（mmap 映射到虚拟内存）
├── meta.json               # Block 元数据
└── tombstones              # 删除标记
```

**meta.json** 示例：
```json
{
  "minTime": 1700000000000,
  "maxTime": 1700007200000,
  "stats": {
    "numSamples": 1048576,
    "numSeries": 1500,
    "numChunks": 4096
  }
}
```

- **chunks/**：存放压缩后的时序数据。Prometheus 使用了自己设计的 XOR 压缩算法（基于 Facebook Gorilla 论文），可以将浮点数的时间序列数据压缩到平均 1.37 字节/样本
- **index/**：倒排索引文件，通过 mmap 映射到进程虚拟内存
- **meta.json**：Block 的元信息，包括时间范围、样本数、序列数
- **tombstones**：当通过 API 删除数据时，不会立即物理删除，而是在 tombstones 中标记。下次 compaction 时真正清理

## 2.3 Compaction（压缩）机制

### 为什么需要 Compaction？

Prometheus 默认每 2 小时生成一个 Block。运行一天会产生 12 个小 Block。大量小 Block 会带来两个问题：
1. **查询效率低**：一个查询需要打开多个 Block 分别查找
2. **空间利用率低**：每个 Block 都有自己的索引，存在重复

### 合并流程

Compaction 将多个小 Block 合并为更大的 Block：

```
2h Block ─┐
           ├──▶ 4h Block ──▶ 8h Block ──▶ 24h Block
2h Block ─┘
```

合并过程是逐级进行的：2×2h → 4h, 2×4h → 8h, 3×8h → 24h。每次合并都会：
- **去重**：如果同一条时间序列在多个 Block 中都有数据，合并时去重
- **重排**：将分散在不同 Block 中的同一序列的 Chunk 放到一起
- **压缩索引**：合并后的 Block 只需要一个索引文件

### 实验验证

启动 ch02 实验环境，运行 30 分钟后执行：

```bash
docker exec prom-ch02 ls -lh /prometheus/
# 观察多个小 block 逐渐合并
docker exec prom-ch02 promtool tsdb analyze /prometheus
# 比较 compact 前后的 block 数量和大小
```

## 2.4 倒排索引与 Posting List

### 为什么需要倒排索引？

假设有 100 万条时间序列，要查询 `{job="api-server", method="GET"}` 的所有序列。

**没有索引的做法：**
```
for each of 1,000,000 series:
    if series.labels.job == "api-server" AND series.labels.method == "GET":
        add to result set
```
复杂度 O(n)，1 秒都查不完。

**用倒排索引的做法：**
```
job="api-server" 的 Posting List → [0, 5, 12, 18, 25, ...]
method="GET" 的 Posting List   → [2, 5, 8, 12, 15, ...]
交集 → [5, 12]
```
复杂度 O(1)，微秒级完成。

### 索引结构

```
Term Dictionary                 Posting List
job="api-server"    ────────▶   [0, 5, 12, 18, 25, ...]  ← 序列 ID 列表
method="GET"        ────────▶   [2, 5, 8, 12, 15, ...]
status="200"        ────────▶   [0, 2, 5, 8, 12, ...]

查询 {job="api-server", method="GET"}
= [0,5,12,18,25,...] ∩ [2,5,8,12,15,...]
= [5, 12, ...]
```

### mmap 内存映射

索引文件通常很大（几百 MB 到几 GB），如果全部读入物理内存，会占用大量 RAM。Prometheus 采用 mmap（内存映射）技术：

1. 索引文件被映射到进程的虚拟地址空间
2. 物理内存只加载被访问的页
3. 由操作系统管理缓存：内存不足时自动换出不常用的页

### 高基数的致命影响

当 `user_id` 标签有 10 万个取值时，每个取值都会变成一个 Term，对应一个包含大量 ID 的 Posting List：

- 正常场景（总序列数 1000）：索引文件 ≈ 1MB，全部缓存在内存中
- 中等基数（总序列数 10000）：索引文件 ≈ 10MB，大部分可缓存
- 高基数（总序列数 100000+）：索引文件 ≈ 数百 MB，无法全部缓存，查询退化为磁盘 I/O

极端情况下，Prometheus 会 OOM 崩溃——这就是生产中"高基数灾难"的本质。

## 2.5 WAL（Write-Ahead Log）机制

### 三阶段写入流程

Prometheus 的数据写入不是直接写到磁盘的，而是三个阶段：

```
1. WAL Append (顺序写磁盘)
   → 最快路径，保证数据不丢
   
2. Head Block Update (内存操作)
   → 更新内存中的倒排索引和 chunk
   
3. WAL Checkpoint (定时清理)
   → 已落盘的数据从 WAL 中移除
```

**WAL 的写入速度极快**，因为它只是顺序追加写入。每 128MB 自动分割成一个新的 WAL 文件。WAL 支持压缩（通过 `--storage.tsdb.wal-compression` 开启），在不影响写入性能的前提下减少磁盘占用。

### 崩溃恢复

当 Prometheus 进程意外终止后重启，会读取 WAL 并重放（replay）未落盘的数据：

```
ts=2024-01-01T10:00:00Z caller=wal.go:301 msg="replaying WAL"
ts=2024-01-01T10:00:05Z caller=wal.go:301 msg="WAL replay completed"
ts=2024-01-01T10:00:05Z caller=main.go:527 msg="TSDB started"
```

重放时间取决于 WAL 的大小。正常运行时，WAL 中的数据通常在 2 小时以内（即 Head Block 的生命周期），所以重放最多几秒钟。

### 局限性

WAL **不是备份**。它只保证在进程崩溃时最近的数据不丢。如果磁盘损坏或 WAL 文件本身损坏，数据仍然会丢失。对于长期存储需求，需要借助 Thanos 或 VictoriaMetrics 等方案。

## 2.6 为什么 Prometheus 不适合做长期存储

- **单机瓶颈**：单个 Prometheus 实例无法水平扩展。你可以升级硬件（垂直扩展），但总有上限
- **无内置冗余**：WAL 只防进程崩溃，不防磁盘损坏。没有副本机制
- **有限保留期**：默认 15 天，延长 retention 需要更多磁盘，且重启时 WAL replay 时间线性增长
- **解决方案**：Thanos / VictoriaMetrics（详见第 8 章）

## 本章小结

- Prometheus TSDB 通过 Head Block + Persistent Block 两级结构平衡读写性能
- 倒排索引是时序数据库查询性能的关键
- 高基数是 TSDB 最大的敌人——理解它才能预防生产事故
- WAL 机制保证进程崩溃时数据不丢，但不替代备份
- 单机 TSDB 有固有局限，超出范围需借助 Thanos 等方案
- 实验：前往 [TSDB 存储引擎实验](../labs/ch02-tsdb/README.md) 亲眼观察 Block、Compaction 和高基数灾难