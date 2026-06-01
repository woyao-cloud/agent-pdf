# 第11章 Ingest Pipeline：轻量级 ETL 数据清洗

## 本章导读

在 ELK 架构中，Logstash 通常承担数据清洗的工作。但 Logstash 是一个独立服务，需要部署和维护。ES 从 5.x 开始提供了内置的 **Ingest Pipeline** 功能，可以直接在 ES 内部做数据预处理，不需要额外的 Logstash 服务。

用 Ingest Pipeline 替代 Logstash 的场景主要是：**数据清洗逻辑不复杂**（字段转换、GeoIP 解析、删除敏感字段）。如果需要复杂的聚合转换或多数据源 Join，仍然需要 Logstash。

---

## 11.1 原理：数据写入前的"拦截处理"

```
Ingest Pipeline 的工作流程：

  客户端                       Ingest Node（或协调节点）        Data Node
    │                                │                         │
    │ PUT /index/_doc                │                         │
    │ {"name": "张三", "ip": "8.8.8.8", "password": "123456"} │
    │ ──────────────────────────►    │                         │
    │                                │                         │
    │                                │ Pipeline 处理器：        │
    │                                │ 1. GeoIP: 8.8.8.8 →     │
    │                                │    {"city":"Mountain View",...}│
    │                                │ 2. Remove: password     │
    │                                │ 3. Convert: @timestamp  │
    │                                │                         │
    │                                │ ── 处理后的数据 ────►   │
    │                                │ {"name":"张三",          │
    │                                │  "ip":"8.8.8.8",        │
    │                                │  "geoip":{"city":"..."},│
    │                                │  ...}                   │
    │                                │                         │
    │ ◄── 201 Created ───────────────│                         │
```

---

## 11.2 实战：常用 Pipeline 处理器

### GeoIP 解析

```json
// 创建一个 GeoIP Pipeline
// 将 IP 地址解析为地理位置信息
PUT _ingest/pipeline/geoip-pipeline
{
  "description": "将 IP 地址转换为地理位置",
  "processors": [
    {
      "geoip": {
        "field": "client_ip",            // 源字段
        "target_field": "geo",           // 目标字段
        "database_file": "GeoLite2-City.mmdb",  // GeoIP 数据库文件
        "properties": [                   // 需要的字段
          "city_name",
          "country_name",
          "region_name",
          "location"
        ],
        "ignore_missing": true,           // IP 字段不存在时忽略
        "ignore_failure": true            // 解析失败时忽略（如内网 IP）
      }
    }
  ]
}

// 使用 Pipeline 写入数据
PUT logs_write/_doc?pipeline=geoip-pipeline
{
  "message": "登录成功",
  "client_ip": "8.8.8.8"
}

// 查询结果——IP 已被解析为地理位置
GET logs_write/_search
{
  "query": { "match_all": {} }
}
// 响应中的 _source：
// {
//   "message": "登录成功",
//   "client_ip": "8.8.8.8",
//   "geo": {
//     "city_name": "Mountain View",
//     "country_name": "United States",
//     "region_name": "California",
//     "location": { "lat": 37.386, "lon": -122.0838 }
//   }
// }
```

### 敏感字段脱敏

```json
// 在写入日志时自动删除敏感字段
// 避免密码、Token、身份证号等被索引

PUT _ingest/pipeline/sanitize-pipeline
{
  "description": "删除敏感字段",
  "processors": [
    {
      "remove": {
        "field": ["password", "token", "secret", "id_card"],
        "ignore_missing": true
      }
    }
  ]
}
```

### 时间格式转换

```json
// 将多种时间格式统一为 ES 标准日期格式
PUT _ingest/pipeline/date-pipeline
{
  "description": "统一时间格式",
  "processors": [
    {
      "date": {
        "field": "log_time",           // 源字段
        "target_field": "@timestamp",  // 目标字段
        "formats": [                   // 尝试解析的多种格式
          "yyyy-MM-dd HH:mm:ss",
          "ISO8601",
          "yyyy/MM/dd HH:mm:ss"
        ],
        "timezone": "Asia/Shanghai",
        "ignore_failure": true
      }
    }
  ]
}
```

### 字符串修剪与转小写

```json
// 数据清洗：修剪空格 + 转小写
PUT _ingest/pipeline/clean-pipeline
{
  "description": "清洗字符串字段",
  "processors": [
    {
      "trim": {
        "field": "name"         // 去掉首尾空格
      }
    },
    {
      "lowercase": {
        "field": "email"        // 邮箱转小写
      }
    },
    {
      "uppercase": {
        "field": "status"       // 状态转大写
      }
    }
  ]
}
```

### 组合使用多个 Pipeline

```json
// 创建一个完整的"日志清理 Pipeline"
// 一次性完成：敏感字段删除 + GeoIP 解析 + 时间转换

PUT _ingest/pipeline/log-cleanup
{
  "description": "日志清洗完整流程",
  "processors": [
    // 1. 删除敏感字段
    { "remove": { "field": ["password", "token"], "ignore_missing": true } },

    // 2. GeoIP 解析
    { "geoip": { "field": "client_ip", "target_field": "geo", "ignore_failure": true } },

    // 3. 统一时间格式
    { "date": { "field": "log_time", "target_field": "@timestamp",
        "formats": ["yyyy-MM-dd HH:mm:ss", "ISO8601"], "ignore_failure": true } },

    // 4. 邮箱转小写
    { "lowercase": { "field": "email" } },

    // 5. 添加默认字段
    { "set": { "field": "ingest_time", "value": "{{_ingest.timestamp}}" } }
  ]
}
```

### 在索引模板中绑定 Pipeline

```json
// 最佳实践：在索引模板中配置默认 Pipeline
// 这样所有写入 logs-* 索引的数据都会自动经过 Pipeline 处理

PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "index.default_pipeline": "log-cleanup"  // 默认 Pipeline
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" },
        "client_ip": { "type": "ip" },
        "geo": {
          "properties": {
            "city_name": { "type": "keyword" },
            "country_name": { "type": "keyword" },
            "location": { "type": "geo_point" }
          }
        }
      }
    }
  }
}
```

### 验证 Pipeline 效果

```json
// 在不实际写入数据的情况下，模拟 Pipeline 执行效果
// 用于调试 Pipeline 配置

POST _ingest/pipeline/log-cleanup/_simulate
{
  "docs": [
    {
      "_source": {
        "message": "用户登录",
        "client_ip": "8.8.8.8",
        "password": "secret123",
        "log_time": "2024-01-15 10:30:00",
        "email": "USER@EXAMPLE.COM"
      }
    }
  ]
}

// 返回处理后的结果：
// {
//   "docs": [
//     {
//       "doc": {
//         "_source": {
//           "message": "用户登录",
//           "client_ip": "8.8.8.8",
//           // "password" 已被删除
//           "@timestamp": "2024-01-15T02:30:00.000Z",
//           "email": "user@example.com",
//           "geo": {
//             "city_name": "Mountain View",
//             "country_name": "United States"
//           },
//           "ingest_time": "2024-01-15T02:30:05.123Z"
//         }
//       }
//     }
//   ]
// }
```

---

## 本章总结

| 处理器 | 用途 | 适用场景 |
|--------|------|---------|
| **geoip** | IP 地址转地理位置 | 日志分析、用户地域分布 |
| **remove** | 删除字段 | 敏感字段脱敏 |
| **date** | 时间格式转换 | 统一多源时间格式 |
| **trim/lowercase/uppercase** | 字符串清洗 | 数据标准化 |
| **set** | 添加字段 | 补充元数据（如入站时间戳） |

**核心原则**：
1. **Ingest Pipeline 替代 Logstash 的 80% 场景**——简单的字段转换、IP 解析、数据清洗都可以在 ES 内部完成。只有当需要复杂的数据聚合、多数据源 Join、条件路由时，才需要部署独立的 Logstash
2. **`_simulate` API 是调试利器**——在配置 Pipeline 时先用 `_simulate` 验证效果，确认无误后再应用到生产环境
3. **Pipeline 应该在索引模板中绑定**——不需要每次写入都指定 `?pipeline=`，在模板中设置 `index.default_pipeline` 即可自动生效
4. **注意 Pipeline 的性能开销**——每个 Processor 都会增加写入延迟。如果一个 Pipeline 有 5 个处理器，写入延迟将增加约 1-2ms