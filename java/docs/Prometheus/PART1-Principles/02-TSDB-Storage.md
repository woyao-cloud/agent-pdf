# 第2章 TSDB 存储引擎：Prometheus 的高性能秘密

## 2.1 故事：用 user_id 做 Label 导致的 OOM

某社交平台公司使用 Prometheus 监控用户请求延迟。开发团队想按用户维度分析性能，于是在指标中加入 `user_id` 标签：

```promql
# 错误做法：user_id 作为标签
http_request_duration_seconds{user_id="12345", path="/api/feed"}
http_request_duration_seconds{user_id="12346", path="/api/feed"}
http_request_duration_seconds{user_id="12347", path="/api/login"}
```

该平台有 1000 万活跃用户，每天产生 100 亿次请求。每个唯一的 `user_id` 都会创建新的时间序列。仅仅一天，时间序列数量从 100 个飙升至 1000 万个。

**结果**：
- Prometheus 内存使用从 2GB 飙升到 48GB
- OOM Killer 每 2 小时杀掉一次 Prometheus 进程
- 监控面板全部变灰
- 运维团队花了一周才找到根因

**教训**：Label 的基数（cardinality）是 TSDB 内存使用的关键因素。高基数标签 = OOM 的入场券。

---

## 2.2 原理比喻：TSDB 的结构

### TSDB = 仓库

把 Prometheus TSDB 想象成一个大型仓库：

```
[Head Block] ─── 临时堆放区 ─── 数据刚进来，还没整理
      │
      ▼
[Memory Chunks] ─ 工作台 ─── 正在处理的数据，读写都很快
      │
      ▼
[Compaction] ─── 整理货架 ─── 把零散的小箱子合并成大箱子
      │
      ▼
[Blocks on Disk] ─ 货架 ─── 整理好的大箱子，整齐摆放
```

**Head Block（临时堆放区）**：
- 新数据到达时先放在这里
- 读写速度最快（全内存）
- 但空间有限，不能放太多

**Compaction（整理货架）**：
- 仓库管理员定期把零散的小箱子合并成大箱子
- 合并后占用的空间更小
- 查找速度更快（大箱子比一堆小箱子好找）

**Blocks on Disk（货架上的箱子）**：
- 每个 block 是一个独立的、不可修改的数据文件
- 包含 `meta.json`（箱子的标签）、`index`（箱子的目录）、`chunks`（实际数据）

### 倒排索引 = 书的目录

```
┌─────────────────────────────────────────────────────┐
│                    书（所有时间序列）                    │
├─────────────────────────────────────────────────────┤
│  目录（倒排索引）                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ job="api-server" → [序列1, 序列2, 序列5, 序列8]   │ │
│  │ method="GET"     → [序列1, 序列3, 序列5, 序列7]   │ │
│  │ status="200"     → [序列1, 序列2, 序列3, 序列5]   │ │
│  │ path="/login"    → [序列2, 序列4, 序列6]          │ │
│  └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  正文（实际数据）                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 序列1: job="api-server", method="GET", status="200" │
│  │ 序列2: job="api-server", method="POST", status="200"│
│  │ 序列3: job="db-server",  method="GET", status="200" │
│  │ ...                                              │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Term（索引词）** = 书的章节名，如 `job="api-server"`、`method="GET"`

**Posting List（页码列表）** = 该章节出现的所有页码，如 `[序列1, 序列2, 序列5, 序列8]`

查询时，Prometheus 先查目录（倒排索引）找到相关序列，再读取数据，而不是遍历所有序列。

---

## 2.3 Before/After：有倒排索引 vs 没有的查询性能

### 查询语句

```promql
# 查询 API 服务器的 GET 请求延迟
http_request_duration_seconds{job="api-server", method="GET"}
```

### 没有倒排索引（遍历所有序列）

```
时间序列总数: 1,000,000
遍历过程:
  ┌─ 检查序列1: job="api-server"? No → 跳过
  ├─ 检查序列2: job="api-server"? No → 跳过
  ├─ 检查序列3: job="api-server"? Yes → method="GET"? No → 跳过
  ├─ 检查序列4: job="api-server"? Yes → method="GET"? No → 跳过
  ├─ 检查序列5: job="api-server"? Yes → method="GET"? Yes → 匹配！
  ...
  └─ 检查序列1,000,000
平均需要检查 500,000 个序列才能找到匹配结果
耗时：~500ms
```

### 有倒排索引（先查目录）

```
倒排索引查询:
  job="api-server" → [序列1, 序列2, 序列5, 序列8, ...] → 500 个匹配
  method="GET"     → [序列1, 序列3, 序列5, 序列7, ...] → 300 个匹配

取交集: [序列1, 序列5, ...] → 150 个匹配

只读取这 150 个序列的数据！
耗时：~5ms（快 100 倍）
```

### 性能对比总结

| 指标 | 无倒排索引 | 有倒排索引 |
|------|-----------|-----------|
| 100 万序列查询 | ~500ms | ~5ms |
| 1000 万序列查询 | ~5000ms | ~15ms |
| 内存占用 | 低（无索引） | 中（需要索引） |
| 写入性能 | 快 | 稍慢（维护索引） |
| 适用场景 | 少量序列 | 大量序列 |

---

## 2.4 代码旁白：meta.json 逐行解释

每个 TSDB block 目录下都有一个 `meta.json` 文件，记录了该 block 的元数据。下面是一个真实 block 的 `meta.json` 逐行解释：

```json
{
  // 版本号。当前 TSDB 格式版本为 1
  "version": 1,

  // 该 block 包含的数据时间范围
  "minTime": 1704067200000,  // 2024-01-01 00:00:00 UTC
  "maxTime": 1704153599000,  // 2024-01-01 23:59:59 UTC

  // 统计信息（可选）
  "stats": {
    "numSamples": 12345678,   // 该 block 包含的样本总数（约 1234 万）
    "numSeries": 98765,       // 该 block 包含的时间序列总数（约 10 万）
    "numChunks": 123456       // 该 block 包含的数据块总数
  },

  // Compaction 信息
  "compaction": {
    // 该 block 是由哪些更小的 block 合并而来的
    "sources": [
      "01HKABCDEF1234567890",
      "01HKABCDEF1234567891",
      "01HKABCDEF1234567892"
    ],
    // compaction 的层级：1=原始 block，2=第一次合并，3=第二次合并...
    // 层级越高，block 越大，但数量越少
    "level": 2,

    // 是否已经过"完全压缩"（最紧凑的存储格式）
    "deleted": false
  },

  // 该 block 是否包含被删除的数据标记
  "tombstone": {
    "tombstoneIntervalCount": 0  // 0 表示没有删除标记
  }
}
```

### meta.json 的关键作用

Prometheus 启动时，会扫描所有 block 的 `meta.json` 来重建索引。这相当于仓库管理员扫一眼所有箱子的标签，就知道每个箱子里是什么时间段的数据，而不需要打开每个箱子查看。

---

## 2.5 手把手：查看 TSDB 的内部结构

### 步骤 1：找到 Prometheus 的数据目录

默认情况下，Prometheus 将数据存储在启动时指定的目录中：

```bash
# 默认数据目录
./prometheus --storage.tsdb.path=/var/lib/prometheus/data
```

### 步骤 2：查看 block 目录结构

```bash
$ ls -la /var/lib/prometheus/data/

drwxr-xr-x  prometheus/  01HKABCDEF1234567890  # 一个 block
drwxr-xr-x  prometheus/  01HKLMNOP1234567890   # 另一个 block
drwxr-xr-x  prometheus/  01HQRSTUV1234567890   # 第三个 block
-rw-r--r--  prometheus/  chunks_head            # 当前正在写入的 Head block
-rw-r--r--  prometheus/  queries.active         # 正在执行的查询记录
-rw-r--r--  prometheus/  wal/                   # Write-Ahead Log（预写日志）
```

### 步骤 3：查看单个 block 内部

```bash
$ ls -la /var/lib/prometheus/data/01HKABCDEF1234567890/

-rw-r--r--  meta.json   # block 元数据
-rw-r--r--  index       # 倒排索引
-rw-r--r--  chunks/     # 实际时序数据文件
```

### 步骤 4：使用 Promtool 检查 TSDB 状态

```bash
$ promtool tsdb analyze /var/lib/prometheus/data/

Block ID: 01HKABCDEF1234567890
Duration: 2h0m0s
Series: 98765
Samples: 12345678
Chunks: 123456
Chunk Size: 512 bytes (average)

# 高基数标签分析
Highest cardinality labels:
  instance: 500       # instance 标签有 500 个不同值
  job: 10             # job 标签有 10 个不同值
  __name__: 100       # 指标名称有 100 个不同值
  user_id: 10000000   # ⚠️ user_id 有 1000 万不同值！这是性能杀手！
```

**重要提示**：`promtool tsdb analyze` 输出的"Highest cardinality labels"是你排查 OOM 风险的第一手工具。如果某个标签的基数超过 10 万，就应该考虑重新设计指标结构。

---

## 2.6 真实案例：高基数标签导致的生产事故

### 案例 1：HTTP 状态码拆分过细

**错误做法**：
```promql
# 把用户 IP 作为标签——灾难！
http_requests_total{client_ip="192.168.1.1", status="200"}
http_requests_total{client_ip="192.168.1.2", status="200"}
# 每天产生数十万个新序列
```

**正确做法**：
```promql
# 聚合维度，去掉高基数标签
http_requests_total{status="200"}
# 如果需要按 IP 分析，使用日志系统而非 Prometheus
```

### 案例 2：Label 设计的最佳实践

```promql
# ❌ 错误：高基数标签
http_request_duration_seconds{user_id="12345", session_id="abc-def"}
# → 每个用户、每个会话都创建新序列

# ✅ 正确：有限的、有意义的标签
http_request_duration_seconds{service="api", method="GET", status="200"}
# → 标签值数量有限（几个 HTTP 方法 x 几个状态码）
```

### 标签基数检查清单

| 标签值 | 基数 | 是否安全 |
|--------|------|---------|
| `method="GET/POST/PUT/DELETE"` | 4 | ✅ 安全 |
| `status="2xx/4xx/5xx"` | ~10 | ✅ 安全 |
| `hostname="web-01"`（固定 100 台） | 100 | ✅ 安全 |
| `user_id="12345"`（1000 万用户） | 10,000,000 | ❌ 危险！ |
| `session_id="abc"`（无限） | 无限 | ❌ 极度危险 |
| `request_id="req-xxx"`（每次请求不同） | 无限 | ❌ 极度危险 |

**黄金法则**：一个标签的基数不应超过 10 万。超过这个阈值，就要考虑是否真的需要这个标签。

---

## 2.7 小结

- TSDB 是 Prometheus 的高性能时序存储引擎，核心设计是 **block + 倒排索引**
- **Head Block**（内存）负责快速写入，**Compaction** 负责整理成磁盘 block
- **倒排索引**让查询从 O(n) 变为 O(1)——查目录而不是遍历所有序列
- **Label 基数**是 TSDB 内存使用的关键因素：高基数标签 = OOM 的入场券
- 使用 `promtool tsdb analyze` 定期检查标签基数，预防性能问题
- **设计 Label 时**：只添加基数有限的标签（< 10 万），把高基数信息留给日志系统

---

**下一步**：理解了 Prometheus 如何采集和存储数据，接下来看第 3 章——如何监控 Java/Spring Boot 应用。
