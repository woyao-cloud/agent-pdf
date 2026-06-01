# 第9章 生产环境"四大杀手"排查与解决

## 本章导读

ES 在生产环境中遇到的故障，90% 可以归为四类：**深度分页 OOM**、**写入拒绝导致丢数据**、**集群 Red/Yellow 状态**、**内存和 GC 问题**。每一类都有清晰的症状、明确的排查工具和标准的解决方案。

一位 SRE 曾经说过："ES 的故障不可怕，可怕的是你不知道该查什么。" 本章的目标就是让你在遇到问题时，能快速定位到属于哪一类，然后按步骤解决。

---

## 9.1 深度分页（Deep Paging）灾难

### 为什么 `from: 10000, size: 10` 会 OOM？

深度分页是 ES 生产环境中最常见的误用。很多人把 MySQL 中的 `LIMIT 100000, 10` 的思维带到 ES 中，但这两个操作在底层的工作方式完全不同：

```
MySQL LIMIT vs ES from/size 的本质差异：

  MySQL LIMIT 100000, 10：
  ┌────────────────────────────────────────────┐
  │  MySQL 直接定位到第 100000 行开始读取        │
  │  不需要读取前面的 100000 行                  │
  │  B+ 树索引可以直接跳转到目标位置              │
  │  I/O 量：大约 10 行                       │
  └────────────────────────────────────────────┘

  ES from: 10000, size: 10：
  ┌────────────────────────────────────────────┐
  │  每个分片准备 10010 条 (docId, score)       │
  │  → 5 个分片 × 10010 = 50050 条             │
  │  协调节点在内存中排序 50050 条               │
  │  取第 10000-10010 条（Top 50050 中的中间）  │
  │  然后到各分片取这 10 条的 _source           │
  │  I/O 量：50050 条数据在协调节点内存中         │
  │  from 越大，内存消耗线性增长                 │
  └────────────────────────────────────────────┘

  如果用 from: 1000000, size: 10：
  每个分片准备 1000010 条
  5 个分片 × 1000010 = 5000050 条
  协调节点内存中 500 万条数据 → OOM!
```

**核心原因**：ES 的分片架构决定了每个分片不知道其他分片的数据。为了得到全局第 10000-10010 条结果，每个分片必须准备 10010 条候选数据。所有分片的候选数据汇总到协调节点后，协调节点才能算出全局排序。

### 解决方案：Search After + PIT

`search_after` 是 ES 推荐的深度分页方案。它不通过"跳过多条记录"来实现翻页，而是"从上一次的最后一条结果的排序值开始继续搜索"：

```json
// 第一步：创建一个 Point in Time（PIT），固定搜索时间点
// 确保翻页过程中数据不会变化
POST products/_pit?keep_alive=5m

// 返回：{"id": "46ToAwMDaWR5..."}

// 第二步：第一页搜索（传入 PIT）
GET _search
{
  "pit": {
    "id": "46ToAwMDaWR5...",     // 使用刚刚创建的 PIT
    "keep_alive": "5m"           // 延长 PIT 存活时间
  },
  "size": 10,
  "sort": [
    { "sales_volume": "desc" },  // 排序字段
    { "_id": "asc" }             // 必须加上 _id 作为 tiebreaker
  ],
  "query": {
    "match": { "title": "手机" }
  }
}

// 响应中包含每条结果的 sort 值
// "hits": [{
//   "_id": "doc_100",
//   "sort": [98500, "doc_100"]   ← 最后一条的 sort 值是 [98500, "doc_100"]
// }, ...]

// 第三步：下一页搜索（传入 search_after）
GET _search
{
  "pit": {
    "id": "46ToAwMDaWR5...",
    "keep_alive": "5m"
  },
  "size": 10,
  "search_after": [98500, "doc_100"],  // ← 从上次最后一条的位置继续
  "sort": [
    { "sales_volume": "desc" },
    { "_id": "asc" }
  ],
  "query": {
    "match": { "title": "手机" }
  }
}
```

**search_after 的内存优势**：

| 分页方式 | 前 N 页的内存消耗 | 翻 1 万页时的内存 | 适用场景 |
|---------|-----------------|------------------|---------|
| `from: N, size: 10` | 线性增长 | 500MB+ | ❌ 禁止 for 大 offset |
| `scroll` | 快照所有文档 | 大量（快照本身） | ✅ 数据导出（一次性） |
| `search_after + PIT` | 每页 10 条 | 恒定为 10 条 | ✅ 用户交互翻页 |

### 数据导出场景：Scroll API

Scroll 适用于"一次性导出大量数据"（而不是用户的交互式翻页）：

```java
// Spring Boot 中使用 Scroll API 批量导出数据
@Service
public class ScrollExportService {

    private final ElasticsearchRestTemplate template;

    public void exportAll(Consumer<List<Product>> batchProcessor) {
        // 初始化 Scroll
        SearchHitsIterator<Product> iterator = template.search(
            NativeQuery.builder()
                .withQuery(Query.of(q -> q.matchAll(m -> m)))
                .withPageable(PageRequest.of(0, 1000))
                .build(),
            Product.class
        );

        // 分批处理
        List<Product> batch = new ArrayList<>(1000);
        while (iterator.hasNext()) {
            batch.add(iterator.next().getContent());
            if (batch.size() >= 1000) {
                batchProcessor.accept(batch);
                batch.clear();
            }
        }
        // 处理最后一批
        if (!batch.isEmpty()) {
            batchProcessor.accept(batch);
        }
    }
}
```

---

## 9.2 写入拒绝与数据丢失

### es_rejected_execution_exception

当你看到错误日志中出现 `es_rejected_execution_exception` 时，意味着 ES 的写入线程池队列已经满了，无法接受更多的写入请求。

```
写入线程池的工作机制：

  ┌──────────────────────────────────────────────────────────┐
  │  写入线程池（Write Thread Pool）                          │
  │                                                          │
  │  队列（大小 = 10000，write.queue_size 可配置）            │
  │  ┌────────┬────────┬────────┬──────┬────────┐           │
  │  │ 请求1  │ 请求2  │ 请求3  │ ...  │ 请求N  │           │
  │  └────────┴────────┴────────┴──────┴────────┘           │
  │      │        │        │                                 │
  │      ▼        ▼        ▼                                 │
  │  ┌────────────────────────────────────┐                 │
  │  │  线程池（固定 4 个线程）                │                 │
  │  │  处理写入请求                         │                 │
  │  └────────────────────────────────────┘                 │
  │                                                          │
  │  如果队列满了（请求速度 > 处理速度 × 线程数）：             │
  │  → 新请求直接返回 429 Too Many Requests                   │
  │  → es_rejected_execution_exception                      │
  └──────────────────────────────────────────────────────────┘
```

```
写入拒绝的根因分析：

  根因 1：突发的写入流量
  ┌────────────────────────────────────────────┐
  │  写入速度从 10000/s 突然涨到 50000/s        │
  │  → 队列 (10000) 瞬间填满                    │
  │  → 后续的 40000/s 全部被拒绝                │
  │  解决：客户端用指数退避重试                  │
  └────────────────────────────────────────────┘

  根因 2：Merge 赶不上写入速度
  ┌────────────────────────────────────────────┐
  │  每个 refresh 产生一个新 Segment            │
  │  Merge 线程来不及合并                       │
  │  Segment 数量增加 → 每个写入请求更大         │
  │  → 处理速度进一步降低                       │
  │  解决：调大 refresh_interval（每秒→30秒）    │
  └────────────────────────────────────────────┘

  根因 3：磁盘 I/O 成为瓶颈
  ┌────────────────────────────────────────────┐
  │  Translog fsync + Merge 都在争抢磁盘 I/O   │
  │  → 写入吞吐下降                              │
  │  解决：升级 SSD / 使用异步 Translog          │
  └────────────────────────────────────────────┘
```

```java
// Java 客户端——带指数退避的重试
@Component
public class ResilientBulkIndexer {

    private final ElasticsearchRestTemplate template;

    public void bulkWithRetry(List<IndexQuery> queries) {
        int retries = 0;
        int maxRetries = 3;

        while (retries < maxRetries) {
            try {
                template.bulkIndex(queries, IndexCoordinates.of("my_index"));
                return; // 成功
            } catch (Exception e) {
                if (e.getMessage().contains("es_rejected_execution_exception")) {
                    retries++;
                    // 指数退避：1s → 2s → 4s
                    long waitMs = (long) Math.pow(2, retries) * 1000;
                    Thread.sleep(waitMs);
                } else {
                    throw e; // 非写入拒绝异常，立即抛
                }
            }
        }
        log.error("写入失败，重试{}次后放弃", maxRetries);
    }
}
```

---

## 9.3 集群 Red/Yellow 状态排查

### 状态的含义

```
集群状态速查：

  Green  → ✅ 一切正常
          所有主分片和副本分片都已分配

  Yellow → ⚠️ 主分片已分配，部分副本未分配
          数据可读写，但高可用降低
          原因：节点掉线、磁盘满、副本数 > 可用节点数

  Red    → 🔴 至少一个主分片未分配
          数据可能丢失，部分索引不可读写
          原因：节点永久离线、分片数据损坏
```

### 排查步骤

```bash
# 步骤 1：查看集群整体状态
curl http://localhost:9200/_cluster/health?pretty

# 步骤 2：查看哪些索引有问题
curl http://localhost:9200/_cat/indices?v&health=red

# 步骤 3：查看未分配的分片详情（最关键的一步！）
curl http://localhost:9200/_cluster/allocation/explain?pretty

# 输出示例和解读：
# {
#   "index": "my_logs",           ← 哪个索引有问题
#   "shard": 0,                    ← 哪个分片
#   "primary": true,               ← 主分片还是副本
#   "current_state": "unassigned", ← 未分配
#   "can_allocate": "no",          ← 不能分配
#   "allocate_explanation":        ← 原因
#     "cannot allocate because allocation is not permitted
#      to any of the nodes",
#   "node_allocation_decisions": [
#     {
#       "node_name": "es-node1",
#       "deciders": [
#         {
#           "decider": "disk_threshold",  ← 磁盘水位线限制！
#           "explanation": "the node has insufficient disk space"
#         }
#       ]
#     }
#   ]
# }
```

```json
// 常见未分配原因和处理

// 原因 1：磁盘水位线限制（最常见）
// 当磁盘使用率超过 85%（low watermark），ES 不再分配分片到此节点
// 超过 90%（high watermark），ES 会从这个节点迁移分片到其他节点
// 超过 95%（flood stage），强制将索引设为只读

// 查看磁盘使用率
GET _cat/allocation?v

// 临时调整水位线（紧急情况）
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "98%"
  }
}

// 原因 2：节点数不够
// 1 个索引设置了 5 个主分片 + 2 个副本 = 15 个分片
// 但只有 3 个数据节点 → 每个节点 5 个分片
// 如果某个节点宕机 → 部分副本无法分配 → Yellow
// 解决：减少副本数或增加节点

// 原因 3：配置了 routing.allocation.require 但没有匹配标签的节点
// 解决：检查索引的 routing 配置，确保有节点匹配

// 手动重新分配分片（最后手段）
POST _cluster/reroute
{
  "commands": [
    {
      "allocate_empty_primary": {
        "index": "my_index",
        "shard": 0,
        "node": "es-node2",
        "accept_data_loss": true  // ⚠️ 会丢失已有数据
      }
    }
  ]
}
```

---

## 9.4 JVM 与 OS 深度调优

### JVM 堆大小——"不超过 32GB"的铁律

ES 是基于 Lucene 的，Lucene 大量使用操作系统的文件缓存（PageCache）。ES 和 PageCache 共享系统内存。如果 JVM 堆太大，留给 PageCache 的内存就太少——搜索性能反而会下降。

```
ES 节点内存分配的金法则：

  物理内存 64GB 的服务器：
  ┌──────────────────────────────────────────────┐
  │                 物理内存 64GB                  │
  ├──────────────────────┬───────────────────────┤
  │  ES JVM Heap         │  OS PageCache          │
  │  (不超过 50%)        │  (至少 50%)            │
  │                      │                        │
  │  31GB（不超过 32GB)  │  33GB                  │
  │  ├── Indexing Buffer │  ├── Segment 缓存       │
  │  ├── 查询结果缓存     │  ├── Term Dictionary    │
  │  ├── 聚合内存        │  ├── DocValues 文件     │
  │  └── 网络连接缓冲区   │  └── _source 文件      │
  └──────────────────────┴───────────────────────┘
```

**为什么不超过 32GB？** Java 在堆内存不超过 32GB 时，会启用 Compressed Oops（压缩对象指针）。普通 Oops 是 64 位（8 字节），压缩后是 32 位（4 字节）。这意味着：在 32GB 以内，每个对象的引用开销减半。超过 32GB 后，引用指针变回 64 位，同样的对象在 40GB 堆上可能只比 31GB 多放 20% 的对象——多花了 9GB 内存，只换来 20% 的容量提升，完全不划算。

```bash
# elasticsearch.yml —— JVM 配置
# 路径：config/jvm.options

# 堆大小（生产推荐：物理内存的 50%，但不超过 32GB）
-Xms31g
-Xmx31g

# GC 配置（ES 7.x+ 默认使用 G1GC）
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200    # 目标 GC 暂停时间
-XX:G1ReservePercent=25      # 预留空间防止晋升失败
-XX:InitiatingHeapOccupancyPercent=30  # G1 开始并发标记的堆占用率
```

### 操作系统优化

```bash
# /etc/sysctl.conf —— ES 专用优化

# 虚拟内存（ES 必须）
vm.max_map_count = 262144
vm.swappiness = 1              # 尽量不用 Swap

# 网络优化
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 1024

# 文件系统
# ES 官方推荐 ext4 或 xfs
# 挂载参数：noatime,nodiratime（减少文件访问时间更新）
# mount -o noatime,nodiratime /dev/sda1 /data

# 禁用 Swap（ES 官方强烈建议）
# swapoff -a
# 或者在 elasticsearch.yml 中：
# bootstrap.memory_lock: true
```

---

## 本章总结

| 杀手 | 症状 | 排查命令 | 解决方案 |
|------|------|---------|---------|
| **深度分页 OOM** | 协调节点 OOM，搜索返回慢 | 检查 `from` 参数 | search_after + PIT 替代 |
| **写入拒绝** | `es_rejected_execution_exception` | `GET _cat/thread_pool` | 指数退避重试 + 调大 Bulk 批次 |
| **集群 Red/Yellow** | 部分索引不可用 | `_cluster/allocation/explain` | 磁盘清理、增加节点、手动 reroute |
| **JVM 内存** | 频繁 GC，节点不稳定 | `GET _nodes/stats/jvm` | 堆 ≤ 32GB，留 50% 给 PageCache |

**核心原则**：
1. **绝对不要在生产使用 `from: 10000+`** —严格的代码审查规则：禁止超过 10000 的 from。用 search_after + PIT 替代
2. **磁盘满了是最常见的 Yellow 原因**——在监控中重点关注磁盘使用率。超过 85% 设置为警告，超过 95% 设置为严重告警
3. **JVM 堆不要超过 32GB**——这是 Lucene + ES 架构决定的，不是 Java 的问题。留给 PageCache 的内存在有些场景下比堆内存更重要