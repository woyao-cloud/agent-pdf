# 第 2 章：TSDB 存储引擎揭秘

## 2.1 时序数据库的存储挑战

### 写入特征

时序数据库的工作负载与传统的 OLTP/OLAP 系统完全不同：

| 特征 | Prometheus TSDB | 传统关系型数据库 |
|------|----------------|-----------------|
| 写入模式 | 追加写为主 | 随机读写 |
| 写入频率 | 千万级/秒持续写入 | 事务级写入 |
| 更新操作 | 极少（仅删除） | 频繁 UPDATE |
| 数据特征 | 时间有序 | 无序 |
| 查询模式 | 按时间范围扫描 | 随机点查询 |

这种写入特征使得 B-Tree（关系型数据库的核心数据结构）不再适合。Prometheus TSDB 采用了专门为时序数据优化的**LSM-Tree（Log-Structured Merge-Tree）**变体。

### 存储挑战

**挑战 1：高基数下内存爆炸**

当标签组合数量巨大时，每条时间序列都需要独立维护。10 万条序列 × 每个序列 1KB 元信息 = 100MB 内存。

**挑战 2：查询需扫描大量数据**

一个简单的"过去 1 小时所有指标平均值"查询可能需要扫描数百万个数据点。

### Prometheus TSDB 设计哲学

```
以空间换时间 + 充分利用时序数据的局部性
```

1. **列式压缩**：同一条序列的连续采样值高度相似（通常缓慢变化），适合差分编码和压缩
2. **时间分区**：数据按时间范围划分为 Block，查询时只需读取相关 Block
3. **倒排索引**：标签查询通过倒排索引加速，避免全表扫描

---

## 2.2 Head Block 与 Persistent Block

### Head Block：内存中的热数据

最新约 2 小时的数据全部保留在内存中，称为 **Head Block**：

```
时间线：
  │Head Block│                                         │Persistent Blocks│
  │(内存)    │                                         │(磁盘)           │
  │          │                                         │                 │
  T-2h       T                                         T-4h    T-2h     T
            (当前时间)
```

Head Block 的特点：
- **写入速度极快**：纯内存操作 + WAL 顺序写
- **查询延迟最低**：无需磁盘 I/O
- **容量上限**：默认 2 小时的数据，受 `--storage.tsdb.max-block-duration` 控制

### 落盘流程

Head Block 达到 2 小时后，经历"冻结 → 持久化"两个阶段：

```
1. Freeze（冻结）
   Head Block 停止接受新数据
   标记为只读
   
2. Flush（落盘）
   序列化内存中的 Chunks 到磁盘文件
   构建索引文件
   生成 meta.json
```

落盘后的 Block 目录结构：

```
block/
├── chunks/           # 原始时间序列数据（压缩后）
│   └── 000001         # Chunk 文件，每个最大 32KB
├── index/             # 倒排索引（mmap 映射）
├── meta.json          # Block 元信息
└── tombstones         # 删除标记
```

### Block 内部结构

**chunks/ 目录**：存储压缩后的时序数据

每个 Chunk 文件包含多个序列的连续采样值。压缩算法（Facebook Gorilla 论文变体）利用时序数据的局部性实现高压缩率：

- 整数值：XOR 压缩，相邻值相同 → 1 bit
- 浮点值：XOR 压缩，变化小时仅存储差异位

典型压缩率：原始 16 bytes/sample → 压缩后 ~1.37 bytes/sample

**meta.json**：Block 的元信息文件

```json
{
  "minTime": 1718006400000,
  "maxTime": 1718013600000,
  "stats": {
    "numSamples": 1048576,
    "numSeries": 5000,
    "numChunks": 20000
  },
  "compaction": {
    "level": 1,
    "sources": ["01J2ABC..."]
  }
}
```

**tombstones**：删除标记

Prometheus 不直接修改已落盘的数据，而是写入墓碑标记。下次 Compaction 时真正清理。

---

## 2.3 Compaction（压缩）机制

### 为什么需要 Compaction

多个小 Block 导致查询性能下降——查询需要读取多个 Block 并合并结果。Compaction 通过合并小 Block 来解决。

### 合并流程

```
第 1 轮：2 个 2h Block → 1 个 4h Block
   [2h] [2h]  ──→  [4h]

第 2 轮：2 个 4h Block → 1 个 8h Block
   [4h] [4h]  ──→  [8h]

最终：多个 Block 合并为 1 个 24h Block
   [8h] [8h] [8h]  ──→  [24h]
```

### 去重优化

同一时间序列在多个 Block 中可能有重复数据。Compaction 时会：

1. 根据 `(series_id, timestamp)` 去重
2. 保留最新的值
3. 合并 Chunk 数据

### 下采样（Downsampling）

Compaction 还执行下采样：对历史数据降低采样率以进一步压缩。

```
原始数据：每 15s 一个采样点 → 保留 30d
下采样后：每 5m 一个采样点 → 保留更长周期

下采样策略：对窗口内的采样点取平均值、最大值、最小值
```

> **注意**：Prometheus 内置的下采样仅支持到 5m 分辨率。如需更长时间跨度（如年），需要使用 Thanos 或 VictoriaMetrics。

---

## 2.4 倒排索引与 Posting List

### 为什么需要倒排索引

没有索引时，查询 `{job="api", method="GET"}` 需要扫描所有时间序列——即全表扫描。

倒排索引的核心思想是**以标签值作为 Key，序列 ID 作为 Value**：

```text
正向索引（不用倒排时，按序列 ID 找标签值）：
  Series ID 1: {__name__="http_requests_total", job="api", method="GET", status="200"}
  Series ID 2: {__name__="http_requests_total", job="api", method="POST", status="200"}
  Series ID 3: {__name__="http_requests_total", job="web", method="GET", status="200"}
  ...

查询 {job="api", method="GET"} → 遍历所有序列 → O(N) ← 太慢

倒排索引（按标签值找序列 ID）：
  job="api"    → [1, 2, 3, 5, 8, 12, ...]
  method="GET" → [1, 3, 5, 7, 8, 10, ...]
  status="200" → [1, 2, 5, 8, 15, ...]

查询 {job="api", method="GET"} → 取交集 → [1, 3, 5, 8] → O(log N) ← 极快
```

### 索引结构

```
Term Dictionary:                    Posting List:
job="api"            ──────────▶    [1, 3, 5, 8, 12, ...]
method="GET"         ──────────▶    [2, 5, 7, 8, 10, ...]
status="200"         ──────────▶    [1, 2, 5, 8, 15, ...]

交集查询 {job="api", method="GET"} → [5, 8]
```

Posting List 存储为**差分编码**（只存储与前一个值的差值）并使用 **Varint 编码**压缩，使整数列表在磁盘上占用更小。

### mmap 内存映射

索引文件通过 **mmap（Memory-Mapped File）** 映射到虚拟内存：

```text
进程虚拟地址空间         物理内存            磁盘
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│  index (mmap) │─────▶│   热数据      │◀────│  index 文件   │
│              │      │  (常驻内存)    │     │              │
│              │      │   冷数据      │     │              │
│              │      │  (缺页时加载)  │     │              │
└──────────────┘      └──────────────┘     └──────────────┘
```

优点：
- **按需加载**：只有访问到的页面才加载到物理内存
- **共享内存**：多个进程可共享同一 mmap 区域
- **自动换出**：由操作系统管理，不用的页面自动换出

### 高基数的致命影响

当某个标签（如 `user_id`）有 10 万个不同取值时：

1. 每个 `user_id=X` 的 Posting List 都很短（通常只有 1 条序列）
2. 倒排索引的优势消失——无法通过"取交集"减少扫描量
3. 查询退化为全表扫描
4. Term Dictionary 大到无法缓存在内存中，频繁触发磁盘 I/O

```text
低基数查询：{job="api", method="GET"} → 取交集 → 扫描 2 个短列表
高基数查询：{user_id="12345"} → 取交集 → 扫描 1 个单元素列表（无意义）
```

这就是为什么高基数（High Cardinality）是 Prometheus 生产环境的第一大杀手。

---

## 2.5 WAL（Write-Ahead Log）机制

### 写入三阶段

Prometheus 的写入路径分为三个阶段，确保数据不丢失：

```
阶段 1：WAL 追加写入
  客户端上报数据
  ↓
  追加写入 WAL（顺序写磁盘）
  ✓ 这一步完成后即可返回客户端"写入成功"
  
阶段 2：更新 Head Block
  WAL 写入成功后
  ↓
  更新内存中的 Head Block
  ↓
  更新倒排索引
  
阶段 3：Checkpoint
  定时（默认每 30 分钟）
  ↓
  将已持久化的 WAL 段标记为可删除
  ↓
  清理旧的 WAL 文件
```

**为什么先写 WAL？** 保证崩溃后数据可恢复。如果先更新内存再写 WAL，崩溃时丢失的是最新数据。如果先写 WAL 再更新内存，崩溃后从 WAL 重放即可恢复。

### 崩溃恢复

当 Prometheus 进程崩溃后重启：

```
1. 扫描 WAL 目录
2. 读取所有未 checkpoint 的 WAL 段
3. 重放指标数据到 Head Block
4. 重建倒排索引
```

恢复时间取决于 WAL 中的数据量。默认 WAL 最多 2 小时的数据，恢复通常在秒级完成。

### WAL 格式

```
wal/
├── 000001         # 第 1 个 WAL 段（128MB）
├── 000002         # 第 2 个 WAL 段（128MB）
├── 000003         # 第 3 个 WAL 段（128MB）
├── checkpoint.000002/
│   └── 000000     # 已 checkpoint 的数据（000002 之前的内容已持久化）
```

- 每个 WAL 段默认 128MB，写满后自动创建新文件
- 支持压缩：`--storage.tsdb.wal-compression`（推荐启用，可减少约 40% 磁盘占用）
- Checkpoint 后旧的 WAL 段可安全删除

---

## 2.6 为什么 Prometheus 不适合做长期存储

### 单机架构限制

Prometheus TSDB 本质上是**单机存储引擎**：

- 所有数据存储在本地磁盘
- 不支持水平扩展（Sharding）
- 内存大小限制了可管理的序列数

### 无冗余备份

WAL 只保证单机 Crash Safety：

- WAL 与数据在同一块磁盘上
- 磁盘损坏 = 数据丢失
- 没有内置的复制或备份机制

### 解决方案预览

| 方案 | 原理 | 适用场景 |
|------|------|---------|
| **Remote Write** | Prometheus 将数据实时转发到远端存储 | 数据备份、长期存储 |
| **Thanos** | Sidecar 上传 Block 到对象存储，提供全局查询 | 跨集群全局视图 |
| **VictoriaMetrics** | 兼容 Remote Write 协议的高性能时序数据库 | 更大规模、更低资源消耗 |

这些方案将在第 8 章中详细展开。

---

## 本章小结

1. **TSDB 设计**：基于 LSM-Tree 变体，针对时序数据的追加写特征优化
2. **Head Block**：最近 2 小时数据在内存中，冻结后落盘为 Persistent Block
3. **Compaction**：将小 Block 合并为大 Block，同时执行去重和下采样
4. **倒排索引 + mmap**：标签查询通过 Posting List 交集加速，mmap 实现按需加载
5. **WAL**：先写日志后更新内存，保证崩溃后数据可恢复
6. **不适合长期存储**：单机架构、无冗余备份，需要 Thanos/VM 等扩展方案

---

## 参考

- [第 2 章实验：TSDB 分析](../labs/ch02-tsdb/README.md)
- [Prometheus TSDB 官方文档](https://prometheus.io/docs/prometheus/latest/storage/)
- [Gorilla: Facebook 时序数据库论文](https://www.vldb.org/pvldb/vol8/p1816-teller.pdf)
- [Prometheus TSDB 源码分析 - 博客系列](https://ganeshvernekar.com/blog/prometheus-tsdb/)
