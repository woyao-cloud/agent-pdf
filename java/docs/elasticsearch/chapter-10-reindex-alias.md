# 第10章 零停机重建索引（Reindex）与别名（Alias）

## 本章导读

在 ES 中，Mapping 字段类型一旦创建就**不可修改**。你不能把 `text` 变成 `keyword`，不能修改 `analyzer`，也不能给已有的字段添加 `doc_values`。这是因为 ES 底层的数据结构（倒排索引、DocValues）在索引创建时就确定了，修改字段类型意味着重写所有数据。

如果业务需求变化了——比如原来 `title` 是 `text` 类型，现在需要把它改为 `keyword` 来做精确匹配——你该怎么办？答案是：**重建索引（Reindex）**。这个过程涉及创建一个新的索引（具有正确的 Mapping），从旧索引复制数据，然后通过**别名（Alias）** 无缝切换。

---

## 10.1 为什么需要 Reindex？

```
Reindex 的核心场景：

  场景 1：修改字段类型
  原来：{ "price": { "type": "text" } }          ← 不好排序
  需要：{ "price": { "type": "integer" } }

  场景 2：修改分词器
  原来：{ "title": { "analyzer": "standard" } }  ← 中文搜索不准
  需要：{ "title": { "analyzer": "ik_max_word" } }

  场景 3：增加字段属性
  原来：{ "product_id": { "type": "text" } }     ← 不能用 term 精确匹配
  需要：{ "product_id": { "type": "keyword" } }

  场景 4：修改分片数
  原来：5 个主分片（太少了）
  需要：10 个主分片（需要承担更多数据）
  → 主分片数不可改，只能 Reindex

  场景 5：从旧集群迁移到新集群
  原来：ES 6.x（节点版本过低）
  需要：ES 8.x
  → 跨版本升级需要通过 Reindex
```

---

## 10.2 别名无缝切换架构

### 别名的核心思想

别名（Alias）是 ES 中一个极其重要但常被忽视的功能。它的核心价值是：**应用程序只通过别名访问索引，不直接访问索引名**。当需要切换索引时，只需要修改别名指向，应用程序不需要做任何变更。

```
别名的运作模式：

  业务代码             别名                 实际索引
    │                   │                    │
    │ "写入数据"          │                    │
    │ ──────────────────► │                    │
    │                    │ ──► products_v1   │
    │                    │                    │
    │ "搜索数据"                                   │
    │ ──────────────────► │                    │
    │                    │ ──► products_v1   │
    │                    │                    │

  需要切换（v1 → v2）：
    │                   │                    │
    │ "搜索数据"                                  │
    │ ──────────────────► │                    │
    │                    │ ──► products_v2   │ ← 别名指向变了
    │                    │      products_v1   │    但业务代码没改
    │                    │     （不再使用）         │
```

### 别名实战：零停机从 v1 切换到 v2

```json
// 第 1 步：创建新索引（v2，具有正确的 Mapping）
PUT products_v2
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "price": {
        "type": "integer"       // 改为 integer 类型
      },
      "product_id": {
        "type": "keyword"       // 改为 keyword 类型
      }
    }
  }
}

// 第 2 步：从 v1 Reindex 数据到 v2
// 注意：Reindex 可以在线执行，不影响 v1 的使用
POST _reindex
{
  "source": {
    "index": "products_v1"
  },
  "dest": {
    "index": "products_v2"
  }
}

// 如果数据量大，Reindex 可能耗时很长
// 查看 Reindex 进度
GET _tasks?actions=*reindex&detailed=true

// 第 3 步：切换别名——原子操作！
// 删除 v1 的别名，添加 v2 的别名
// 这在一个 API 调用中完成，要么全部成功要么全部失败
POST _aliases
{
  "actions": [
    { "remove": { "index": "products_v1", "alias": "products" } },
    { "add":    { "index": "products_v2", "alias": "products" } }
  ]
}

// 第 4 步：验证切换
GET products/_search     // 此时指向 v2

// 第 5 步：删除旧索引
DELETE products_v1
```

### 写别名 + 读别名分离

在更精细的场景下，可以将"写别名"和"读别名"分开：

```json
// 场景：搜索时从多个索引读取，写入时只写当前索引
// 适用于：按时间分区且需要跨索引搜索的日志系统

// 创建索引时指定别名
PUT logs-2024-01-01
{
  "aliases": {
    "logs_search": {},             // 读别名——包含所有日志索引
    "logs_write": {                // 写别名——只指向最新索引
      "is_write_index": true
    }
  }
}

// 第二天创建新索引
PUT logs-2024-01-02
{
  "aliases": {
    "logs_search": {},             // 新索引也加入读别名
    "logs_write": {                // 写别名切换到新索引
      "is_write_index": true
    }
  }
}

// 检查别名指向
GET _alias/logs_write
// 返回：logs-2024-01-02 是写别名

// 搜索时使用读别名——自动搜索两个索引
GET logs_search/_search
{
  "query": {
    "match": { "message": "error" }
  }
}
```

### Reindex 的性能优化

大数据量的 Reindex 可能耗时很长。以下优化策略可以大幅加速：

```json
// 优化 1：增大批次大小（默认 1000）
POST _reindex
{
  "source": {
    "index": "products_v1",
    "size": 5000              // 每次读取 5000 条
  },
  "dest": {
    "index": "products_v2"
  }
}

// 优化 2：用 Scroll + Slice 并行 Reindex
// slices = 并行度，建议 = 源索引的分片数
POST _reindex?slices=5
{
  "source": {
    "index": "products_v1"
  },
  "dest": {
    "index": "products_v2"
  }
}

// 优化 3：Reindex 时临时关闭副本和 refresh
PUT products_v2/_settings
{
  "index": {
    "number_of_replicas": 0,       // 先关副本
    "refresh_interval": "-1"       // 关掉自动 refresh
  }
}
// 执行 Reindex...
// Reindex 完成后恢复
PUT products_v2/_settings
{
  "index": {
    "number_of_replicas": 1,
    "refresh_interval": "1s"
  }
}
```

---

## 本章总结

| 操作 | 用途 | 注意点 |
|------|------|--------|
| **Reindex** | 在线数据迁移 | 大索引需要切片并行加速 |
| **Alias** | 零停机索引切换 | 原子操作确保切换过程不丢数据 |
| **写 Alias** | 只指向一个索引 | `is_write_index: true` 确保写入不乱 |
| **读 Alias** | 可指向多个索引 | 跨索引搜索时使用 |

**核心原则**：
1. **应用程序只使用别名，不使用直接索引名**——这是 ES 的最佳实践。别名让索引切换对应用程序完全透明
2. **Reindex 可以在线执行**——在执行 Reindex 期间，旧索引仍然可以正常提供服务。切换别名后旧索引才下线
3. **大索引 Reindex 一定要用 slices 并行**——slices = 源索引的分片数，在不增加节点的情况下充分利用并行能力
4. **先解除 Mapping 错误的索引，Reindex 后更新 Mapping**——不要试图在已有索引上修改字段类型，那是不可能的