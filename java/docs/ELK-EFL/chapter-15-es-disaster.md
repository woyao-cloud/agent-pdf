# 第15章 Elasticsearch 写入与查询灾难

## 本章导读

那天晚上十点，你的手机收到 P0 告警："订单服务的 ERROR 率飙升到 30%"。你登录服务器，发现 ES 集群的日志索引已经 3 分钟没有更新了——最新的日志停留在 21:57，现在是 22:00。

你查了 Logstash 日志："es_rejected_execution_exception"，ES 写入线程池队列满了。

再看 ES 集群状态：Yellow。有一个索引的 2 个副本分片未分配。

再查 ES 日志：磁盘使用率 91%，超过了 90% 的 high watermark。ES 自动将这台机器上的分片迁移到其他节点——但其他节点的磁盘使用率也在 85% 以上。

这就是典型的 ES 写入+查询灾难的连锁反应：**磁盘快满了 → ES 自动迁移分片 → 迁移过程大量 I/O → 写入变慢 → 写入线程池队列打满 → 写入拒绝 → 数据延迟 → 应用调用超时**。

本章的每个问题都有明确的排查步骤和解决方案。

---

## 15.1 es_rejected_execution_exception（写入拒绝）

### 写入线程池的工作机制

ES 使用线程池来处理不同类型的请求。写入请求由 **write 线程池**处理：

```
ES 写入线程池：

  ┌──────────────────────────────────────────────────────┐
  │  请求队列（queue_size = 10000，可配置）               │
  │  ┌────┬────┬────┬────┬────┬────┬────┬────┬────┐    │
  │  │ R1 │ R2 │ R3 │ R4 │ R5 │ .. │ .. │ .. │ R10000││
  │  └────┴────┴────┴────┴────┴────┴────┴────┴────┘    │
  │      │    │    │    │                                │
  │      ▼    ▼    ▼    ▼                                │
  │  ┌──────────────────────────────┐                   │
  │  │  固定 4 个线程               │                   │
  │  │  每个线程处理一个写入请求     │                   │
  │  └──────────────────────────────┘                   │
  │                                                      │
  │  如果队列满了（请求速度 > 处理速度）：                 │
  │  → 新请求立即返回 429 Too Many Requests               │
  │  → 错误信息: es_rejected_execution_exception         │
  └──────────────────────────────────────────────────────┘
```

### 排查方法

```bash
# 1. 查看写入线程池状态
GET _cat/thread_pool/write?v=true&h=name,active,queue,rejected,completed

# 输出解读：
# name         active  queue  rejected  completed
# es-node1     4       0      0         150000    ← 正常
# es-node2     4       9800   500       120000    ← ⚠️ 队列快满了（9800/10000）
# es-node3     4       5000   0         140000    ← queue 有积压

# 2. 查看被拒绝的请求数
GET _nodes/stats/thread_pool

# 寻找：
# "thread_pool": {
#   "write": {
#     "rejected": 523    ← 累计被拒绝 523 次！
#   }
# }
```

### 解决方案

```json
// 临时缓解：调大队列（治标）
PUT _cluster/settings
{
  "transient": {
    "thread_pool.write.queue_size": 2000
  }
}

// 根本解决方案（选择适合你的场景的）：

// 方案 A：Logstash 端调优 ——降低发送速度
// 在 Logstash 配置中增大 batch 但降低频率
// logstash.conf
output {
  elasticsearch {
    hosts => ["es-node:9200"]
    bulk_max_size => 5000       // 每批 5000 条（默认 1000）
    flush_size => 5000
    idle_flush_time => 3        // 3 秒的间隔（默认 1 秒）
  }
}

// 方案 B：ES 端调优 ——降低 refresh 频率
PUT _index_template/app-logs-template
{
  "template": {
    "settings": {
      "refresh_interval": "30s",   // 默认 1s → 30s
      "translog": {
        "durability": "async",     // 异步刷盘
        "sync_interval": "5s"
      }
    }
  }
}

// 方案 C：增加写入节点
// 增加 ES Data 节点数量，分散写入压力
```

---

## 15.2 集群状态 Yellow/Red

### 三种状态的含义

```
Green  → ✅ 所有主分片和副本分片都已分配
Yellow → ⚠️ 主分片已分配，部分副本未分配（最常见的"问题状态"）
Red    → 🔴 至少一个主分片未分配（数据可能丢失）
```

### 排查步骤

```json
// 步骤 1：集群健康总览
GET _cluster/health

// 步骤 2：找到有问题的索引
GET _cat/indices?v&health=red
GET _cat/indices?v&health=yellow

// 步骤 3：查看未分配的原因（最关键！）
GET _cluster/allocation/explain

// 输出示例和解读
{
  "index": "app-logs-2024.01.15",        // 问题索引
  "shard": 2,                             // 问题分片
  "primary": false,                       // 是副本
  "current_state": "unassigned",
  "can_allocate": "no",
  "allocate_explanation":
    "无法分配，因为分配被磁盘阈值决策者阻断",
  "node_allocation_decisions": [{
    "node_name": "es-node2",
    "deciders": [{
      "decider": "disk_threshold",
      "explanation": "节点磁盘使用率 91% (91.2% > 90%)"
    }]
  }]
}
```

### 常见原因的针对性处理

```json
// 原因 1：磁盘水位线限制（最常见，占 80% 以上）
// ES 默认：disk.watermark.low = 85%（不再分配新分片）
//          disk.watermark.high = 90%（迁移分片到其他节点）
//          disk.watermark.flood_stage = 95%（强制索引只读）

// 排查磁盘使用率
GET _cat/allocation?v

// 紧急恢复（临时提高水位线）
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "98%"
  }
}
// ⚠️ 这只是临时措施！长期方案是清理数据或扩容

// 清理旧数据（删除 30 天前的日志索引）
DELETE app-logs-2023.12.*

// 原因 2：节点掉线
// 重启节点
docker restart es-node2

// 手动重新分配分片（紧急情况）
POST _cluster/reroute
{
  "commands": [
    {
      "allocate_empty_primary": {
        "index": "app-logs-2024.01.15",
        "shard": 2,
        "node": "es-node3",
        "accept_data_loss": false
      }
    }
  ]
}
```

---

## 15.3 Kibana 查询超时

```kibana
// 症状：Kibana 中的查询返回 "Timed out" 或长时间"loading"

// 原因 1：深度分页
// ❌ 错误写法（from 太大）
GET app-logs-*/_search
{
  "from": 10000, "size": 10
}

// ✅ 正确写法（search_after）
GET app-logs-*/_search
{
  "size": 10,
  "search_after": [1700000000000, "doc_id"],
  "sort": [{ "@timestamp": "desc" }, { "_id": "asc" }]
}

// 原因 2：跨大量索引搜索
// 日志索引每天一个，如果搜索 30 天内所有日志
// ES 需要打开 30 × 3（分片数） = 90 个分片

// ✅ 优化：加上时间范围限制
GET app-logs-2024.01.15/_search
// 而不是
GET app-logs-*/_search

// 原因 3：聚合查询在 filter 外
// ❌ 聚合在 query context（不缓存）
GET app-logs-*/_search
{
  "query": {
    "match": { "level": "ERROR" }
  },
  "aggs": {
    "over_time": {
      "date_histogram": { "field": "@timestamp", "interval": "hour" }
    }
  }
}

// ✅ 用 filter context（缓存命中）
GET app-logs-*/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "level": "ERROR" } }
      ]
    }
  },
  "aggs": {
    "over_time": {
      "date_histogram": { "field": "@timestamp", "interval": "hour" }
    }
  }
}
```

---

## 本章总结

| 问题 | 排查命令 | 最常见原因 | 紧急措施 | 根因解决 |
|------|---------|-----------|---------|---------|
| **写入拒绝** | `_cat/thread_pool` | 磁盘 I/O 瓶颈 / Refresh 太频繁 | 调大 queue_size | 调大 refresh_interval、增节点 |
| **Yellow/Red** | `_cluster/allocation/explain` | 磁盘水位线（默认 85%/90%） | 临时调高水位线 | 清理旧数据、扩容 |
| **查询超时** | 查看 Kibana 的 query | 深度分页 / 跨太多索引 | 加时间范围限制 | 改用 search_after、加 filter |
| **磁盘满** | `_cat/allocation` | 日志太多没清理 | 删除最旧的索引 | 配置 ILM 自动删除 |

**核心原则**：
1. **磁盘满了是万恶之源**——ES 集群 80% 的问题都可以追溯到"磁盘不够了"。监控磁盘使用率比监控 CPU/内存更重要
2. **写入拒绝的第一反应不是调参数，是排查为什么写入变慢了**——调大 queue_size 只是"把问题往后推"，不是解决。根因通常是 refresh 太频繁或磁盘 I/O 满了
3. **用 `_cluster/allocation/explain` 替代猜测**——不要猜"为什么分片没分配"，ES 会给你一个精确的解释。这个 API 是排查集群问题的第一步
4. **日志索引必须配 ILM**——没有 ILM 的日志集群，3 个月后磁盘必满。ILM 的 Delete 阶段是自动清理的关键