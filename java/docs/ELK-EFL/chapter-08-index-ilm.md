# 第8章 Elasticsearch 索引设计与生命周期管理（ILM）

## 本章导读

一个刚接触 ELK 的团队经常犯的错误：直接把日志写入 ES，不配置 Index Template，不配置 ILM。一个月后——"ES 集群的磁盘满了，怎么办？"

更糟糕的是，他们发现 Logstash 默认将 `@timestamp` 识别为 `date` 类型，但 `level` 字段因为数据中混入了数字和字符串，被识别为 `text` 类型——导致无法用 `term` 查询精确匹配 `"level: ERROR"`。而 `message` 字段因为第一条日志中包含了 HTML 标签，被识别为了 `text` 类型——但业务需求是要做 `term` 精确匹配。

这些问题全都可以通过**提前创建 Index Template** 来避免。本章从 Index Template 开始，到 ILM 的自动滚动和删除，给出日志场景的标准配置。

---

## 8.1 拒绝 Mapping 爆炸

### dynamic: strict 是必须的

```json
// Index Template——所有 app-logs-* 索引遵循此模板
// 关键配置：dynamic: "strict"
// 效果：写入未定义的字段时 ES 拒绝写入（返回错误）
// 而不是自动创建新的 Mapping 字段

PUT _index_template/app-logs-template
{
  "priority": 100,
  "index_patterns": ["app-logs-*", "app-logs-error-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":   { "type": "date" },
        "level":        { "type": "keyword" },
        "logger":       { "type": "keyword" },
        "thread":       { "type": "keyword" },
        "message":      { "type": "text" },
        "serviceName":  { "type": "keyword" },
        "traceId":      { "type": "keyword" },
        "userId":       { "type": "keyword" },
        "orderId":      { "type": "keyword" },
        "duration":     { "type": "long" },
        "status_code":  { "type": "integer" },
        "stack_trace":  { "type": "text", "index": false }
      }
    }
  }
}
```

### 日志场景的分片配置

```
分片数的确定方法：

  场景：每天 500GB 日志，保留 30 天
  总数据量 = 500GB × 30 = 15TB

  单个分片的最佳大小 = 10GB - 50GB
  每天的分片数 = 500GB / 50GB = 10 个主分片

  所以：number_of_shards = 10
        number_of_replicas = 1（至少 1 个副本保障高可用）
        每天总分片数 = 10 × 2 = 20

  30 天共有 20 × 30 = 600 个分片
  对 5 节点的集群来说，完全可以接受
```

---

## 8.2 ILM 策略

```json
// ILM 策略：自动管理日志索引
// 阶段：Hot（写入）→ Warm（只读+合并）→ Delete（删除）

PUT _ilm/policy/app-logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "3d",
        "actions": {
          "forcemerge": { "max_num_segments": 1 },
          "shrink": { "number_of_shards": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": { "delete": {} }
      }
    }
  }
}

// 将 ILM 策略绑定到索引模板
PUT _index_template/app-logs-template
{
  "template": {
    "settings": {
      "index.lifecycle.name": "app-logs-policy",
      "index.lifecycle.rollover_alias": "app-logs"
    }
  }
}
```

---

## 本章总结

索引模板 + ILM 是日志场景的标准配置。提前配置好 dynamic: strict、分片数、ILM 策略，才能避免日志写入后出现 Mapping 错误和磁盘满的问题。