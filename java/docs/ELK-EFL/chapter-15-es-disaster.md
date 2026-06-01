# 第15章 Elasticsearch 写入与查询灾难

## 15.1 写入拒绝

```json
// 症状：es_rejected_execution_exception
// 根因：写入线程池队列打满
// 解决方案：

// 1. 查看线程池状态
GET _cat/thread_pool/write?v=true&h=name,active,queue,rejected,completed

// 2. 临时解决方案：调大队列
PUT _cluster/settings
{
  "transient": {
    "thread_pool.write.queue_size": 2000
  }
}

// 3. 长期解决方案
// - 调大 refresh_interval（5s → 30s）
// - Translog 异步刷盘
// - Logstash 端 bulk_max_size 调优
```

---

## 15.2 集群状态 Yellow/Red

```json
// 排查步骤：

// 1. 检查整体状态
GET _cluster/health

// 2. 查看未分配分片的原因
GET _cluster/allocation/explain

// 3. 常见原因和处理
// 磁盘满 → 清理或扩容
// 节点掉线 → 重启节点
// 水位线限制 → 调整水位线

// 调整磁盘水位线（紧急）
PUT _cluster/settings
{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "98%"
  }
}
```

---

## 15.3 Kibana 查询超时

```json
// 症状：Kibana 查询返回 "Timed out"
// 解决方案：

// 1. 避免深度分页
// ❌ 不要用
GET logs/_search { "from": 10000, "size": 10 }

// ✅ 用 search_after
GET logs/_search { "search_after": [123456], "sort": [{ "@timestamp": "desc" }] }

// 2. 优化 DSL
// filter 上下文利用缓存
// 不要在大范围上做 terms 聚合
```

---

## 本章总结

ES 写入/查询问题的最常见根因是"线程池满了"和"磁盘满了"。通过线程池监控和磁盘使用率告警可以提前发现。