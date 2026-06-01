# 第8章 Elasticsearch 索引设计与生命周期管理（ILM）

## 本章导读

日志系统与业务系统有一个本质区别：**日志只有写入和查询，没有修改**。昨天的日志不会变，今天的日志源源不断。这种模式非常适合 ILM（索引生命周期管理）——让 ES 自动管理索引的创建、滚动、归档和删除。

但如果没有提前设计好索引模板，日志写入后会出现各种问题：字段类型错误（字符串被识别为 text 而不是 keyword）、Mapping 爆炸（动态字段太多）、单索引过大（性能下降）。本章的目标是在日志写入之前就把这些问题全部解决。

---

## 8.1 拒绝 Mapping 爆炸

```json
// 创建 Index Template——所有 app-logs-* 索引遵循此模板
// 关键：dynamic: strict 禁止自动创建未定义字段

PUT _index_template/app-logs-template
{
  "priority": 100,
  "index_patterns": ["app-logs-*", "app-logs-error-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s",
      "translog": {
        "durability": "async",
        "sync_interval": "5s",
        "flush_threshold_size": "512mb"
      }
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
        "spanId":       { "type": "keyword" },
        "userId":       { "type": "keyword" },
        "orderId":      { "type": "keyword" },
        "duration":     { "type": "long" },
        "stack_trace":  { "type": "text", "index": false },
        "status_code":  { "type": "integer" },
        "request_path": { "type": "keyword" },
        "method":       { "type": "keyword" }
      }
    }
  }
}
```

---

## 8.2 ILM 策略配置

```json
// ILM 策略：自动管理日志索引的生命周期
// 阶段：Hot → Warm → Delete

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
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

---

## 8.3 日志索引模板 + ILM 完整配置

```json
// 创建同时包含 Template 和 ILM 的完整配置

PUT _index_template/app-logs-template
{
  "priority": 100,
  "index_patterns": ["app-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s",
      "index.lifecycle.name": "app-logs-policy",
      "index.lifecycle.rollover_alias": "app-logs"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":   { "type": "date" },
        "level":        { "type": "keyword" },
        "message":      { "type": "text" },
        "serviceName":  { "type": "keyword" },
        "traceId":      { "type": "keyword" },
        "userId":       { "type": "keyword" }
      }
    }
  }
}

// 创建第一个索引，绑定 ILM
PUT app-logs-000001
{
  "aliases": {
    "app-logs": {
      "is_write_index": true
    }
  }
}
```

---

## 本章总结

| 配置项 | 作用 | 推荐值 |
|-------|------|--------|
| `dynamic: strict` | 禁止未知字段 | 生产环境必须 |
| `number_of_shards` | 分片数 | 3（日志场景） |
| `refresh_interval` | 刷新频率 | 5s-30s（日志不需要实时） |
| `rollover max_size` | 滚动大小 | 50GB |
| `rollover max_age` | 滚动时间 | 1d |
| `delete min_age` | 保留天数 | 30d |

**核心原则**：索引模板必须在写入日志前创建，ILM 是日志场景的标配