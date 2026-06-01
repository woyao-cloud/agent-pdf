# 第5章 场景三：多维度聚合分析与数据看板（BI）

## 本章导读

如果说搜索是 ES 的"前锋"，那聚合就是 ES 的"中军"。在 BI（商业智能）场景中，用户经常需要**实时**地对百万级甚至亿级数据进行分组统计——比如"按品类统计销售额"、"按时间趋势展示订单量"、"按地区分布展示用户数"。这些操作在传统数据库中可能需要跑几分钟的 SQL，在 ES 中通过聚合（Aggregation）可以在几百毫秒内完成。

但聚合也有它的"Achilles Heel"——**高基数聚合**。当你要对"用户 ID"这种唯一值数量达到千万级的字段做 Terms 聚合时，如果不加控制，ES 节点会直接 OOM。这不是危言耸听，而是生产环境中的常见事故。

本章将深入讲解 ES 聚合的底层原理（DocValues + Global Ordinals），以及如何规避"高基数聚合 OOM"这个最大的坑。

---

## 5.1 实现原理：DocValues 聚合

### 聚合 vs 搜索——两种完全不同的数据访问模式

理解聚合为什么快，首先要理解聚合和搜索在数据访问模式上的本质差异：

```
搜索（Search）：
  ┌────────────────────────────────────────────────────────────┐
  │  数据访问模式：随机读取                                     │
  │  操作：从倒排索引中找到匹配的文档，返回 _source              │
  │  I/O 模式：少量随机读                                       │
  │  瓶颈：磁盘随机 I/O                                         │
  └────────────────────────────────────────────────────────────┘

聚合（Aggregation）：
  ┌────────────────────────────────────────────────────────────┐
  │  数据访问模式：顺序扫描                                     │
  │  操作：扫描整个字段的所有值，分组计数/求和/求平均             │
  │  I/O 模式：大量顺序读                                       │
  │  瓶颈：内存/CPU                                              │
  └────────────────────────────────────────────────────────────┘

  搜索是"找几篇文章"——随机读，数据量小
  聚合是"统计所有文章"——顺序读，数据量大
```

### Terms 聚合的内部执行过程

以 `GROUP BY category` 为例，ES 内部执行了以下步骤：

```
Terms 聚合的执行流程：

  原始数据（products 索引，1000 万文档）：
  ┌────────┬──────────┐
  │  Doc   │ category  │
  ├────────┼──────────┤
  │    1   │ 手机      │
  │    2   │ 电脑      │
  │    3   │ 手机      │
  │  ...   │ ...      │
  │ 10M    │ 平板      │
  └────────┴──────────┘

  步骤 1：读取 DocValues 列文件
  只读取 category 字段的列文件（不是读整个文档）
  ┌────┬────┬────┬────┬────┐
  │手机│电脑│手机│平板│...│  ← 1000 万行，但每行只有 1 个值
  └────┴────┴────┴────┴────┘
  I/O 量：1000 万 × 假设每个值 6 字节 = 60MB
  如果读 _source：1000 万 × 假设每个文档 1KB = 10GB！

  步骤 2：建桶（Bucket）
  遍历 1000 万个值，做计数
  电脑: 200 万, 手机: 500 万, 平板: 300 万

  步骤 3：返回结果（只需返回建好的桶）
  ┌──────────┬────────┐
  │  手机    │ 500 万  │
  │  平板    │ 300 万  │
  │  电脑    │ 200 万  │
  └──────────┴────────┘
```

这就是为什么聚合比 `SELECT ... GROUP BY` 快这么多——ES 读的是列的压缩文件，不是行式存储的整个文档。

### 聚合的两种 Context

理解 Query Context（查询上下文）和 Filter Context（过滤上下文）的区别，对聚合性能至关重要：

```json
// Query Context——查询上下文
// 特点：计算 _score，不缓存
GET products/_search
{
  "query": {
    "match": { "title": "手机" }  // Query Context
  },
  "aggs": {
    "by_category": {
      "terms": { "field": "category" }
    }
  }
}

// Filter Context——过滤上下文
// 特点：不计算 _score，结果可以被缓存
GET products/_search
{
  "query": {
    "constant_score": {  // wrapping with constant_score 让 match 进入 filter context
      "filter": {
        "match": { "title": "手机" }
      }
    }
  },
  "aggs": {
    "by_category": {
      "terms": { "field": "category" }
    }
  }
}

// ⚠️ 最佳实践：如果不需要评分，用 filter 替代 query
// filter 的缓存机制在重复查询（如仪表盘刷新）时效果显著
```

---

## 5.2 潜在风险：高基数聚合 OOM

### 什么是高基数聚合？

"高基数"（High Cardinality）指的是某个字段的唯一值数量极大：

```
高基数字段的典型例子：

  ┌──────────────┬────────────┬─────────────┐
  │  字段         │ 基数示例    │ 聚合风险     │
  ├──────────────┼────────────┼─────────────┤
  │  user_id     │ 1000 万    │ 🔴 极高风险   │
  │  order_id    │ 5000 万    │ 🔴 极高风险   │
  │  session_id  │ 2 亿       │ 🔴 极高风险   │
  │  ip_address  │ 500 万     │ 🟡 中风险     │
  │  product_id  │ 10 万      │ 🟢 低风险     │
  │  category    │ 50         │ 🟢 无风险     │
  │  status      │ 5          │ 🟢 无风险     │
  └──────────────┴────────────┴─────────────┘
```

**为什么高基数聚合会导致 OOM？**

```
高基数 Terms 聚合的内存消耗：

  对 user_id（1000 万唯一值）做 Terms 聚合：

  ES 的工作方式：
  1. 读取所有 doc 的 user_id DocValues → 已经在 PageCache 中
  2. 对 1000 万个唯一值建桶 → 1000 万个 Bucket
  3. 每个 Bucket 存储：key(user_id) + doc_count
  4. 排序：按 doc_count 排序取 Top 10

  内存占用：
  1000 万个唯一值 × (user_id 字符串平均 10 字节 + doc_count 8 字节)
  ≈ 180MB（仅桶数据）
  加上排序所需的内存 → 可能超过 500MB
  如果同时有 3 个这样的聚合 → 1.5GB！

  即使你只要 Top 10，ES 也必须先建 1000 万个桶再排序取 Top 10
  → 在这过程中，这 1000 万个桶完全在内存中
  → 这就是高基数聚合 OOM 的根因
```

---

## 5.3 优化与应对方案

### 方案一：Composite Aggregation——可翻页的聚合

`Terms` 聚合是一次性返回所有结果，而 `Composite` 聚合支持分页，它可以分批处理数据，大幅降低单次内存消耗：

```json
// 使用 Composite Aggregation 处理高基数聚合

// 场景：统计 user_id 维度的操作次数，但 user_id 有 1000 万

// 第一次请求：获取前 100 个
GET logs/_search
{
  "size": 0,
  "aggs": {
    "user_stats": {
      "composite": {
        "sources": [
          { "user": { "terms": { "field": "user_id" } } }
        ],
        "size": 100,    // 每次返回 100 个桶
        // 排序方式，默认按照 key 的字典序升序
        "order": { "user": "asc" }
      }
    }
  }
}

// 响应中会有一个 after_key 字段
// "after_key": { "user": "user_100" }

// 第二次请求：传入 after_key 获取下一页
GET logs/_search
{
  "size": 0,
  "aggs": {
    "user_stats": {
      "composite": {
        "sources": [
          { "user": { "terms": { "field": "user_id" } } }
        ],
        "size": 100,
        "after": { "user": "user_100" }  // 从上次的位置继续
      }
    }
  }
}
```

**Composite vs Terms 的内存对比**（针对 1000 万唯一值的 user_id）：

| 对比维度 | Terms Aggregation | Composite Aggregation |
|---------|------------------|---------------------|
| 内存占用 | 全量 1000 万桶 ≈ 500MB | 每次 100 个桶 ≈ 5KB |
| 返回数据 | 一次性返回 | 分页获取 |
| 是否可排序 | ✅ 按 doc_count 排序 | ❌ 按 key 字典序 |
| 适用场景 | 基数 < 1 万 | 基数 > 1 万 |

### 方案二：在 Filter Context 下做聚合

```json
// ❌ 不建议：
GET products/_search
{
  "query": {
    "match": { "title": "手机" }    // Query Context：计算评分
  },
  "aggs": {
    "price_stats": {
      "stats": { "field": "price" }
    }
  }
}

// ✅ 推荐：如果不需要评分
GET products/_search
{
  "query": {
    "bool": {
      "filter": [                     // Filter Context：缓存 + 不评分
        { "match": { "title": "手机" } }
      ]
    }
  },
  "aggs": {
    "price_stats": {
      "stats": { "field": "price" }
    }
  }
}

// 收益：
// 1. filter 的结果可以被 Node Query Cache 缓存
// 2. 不计算 _score，CPU 消耗降低
// 3. 同样的查询在仪表盘上每分钟刷新一次 → 缓存命中 → 亚毫秒级响应
```

### 方案三：Cardinality Aggregation——精准去重 + 近似去重

如果需要统计"有多少个不同的用户"，但不需要知道具体的用户是哪些（即不需要 GROUP BY，只需要 COUNT DISTINCT）：

```json
// 精确去重（基数小于 10 万时）
GET logs/_search
{
  "aggs": {
    "exact_user_count": {
      "cardinality": {
        "field": "user_id",
        "precision_threshold": 100000
        // 当基数低于 precision_threshold 时，结果 100% 准确
        // 当基数高于时，使用 HyperLogLog 近似算法
        // 默认 precision_threshold = 3000
        // 调高 precision_threshold 会消耗更多内存
      }
    }
  }
}

// HyperLogLog 的精度：
// precision_threshold = 100000 → 标准误差约 1%
// 即：COUNT(DISTINCT user_id) = 1000 万
// cardinality 返回 ≈ 990 万 ~ 1010 万
// 对于大部分仪表盘场景，这个精度足够了
```

### 方案四：Date Histogram——时序聚合

```json
// Date Histogram——按时间聚合
// 适用场景：_e_售趋势、QPS 趋势、访问量时序图

GET orders/_search
{
  "size": 0,
  "query": {
    "range": {
      "create_time": {
        "gte": "now-30d",     // 最近 30 天
        "lte": "now"
      }
    }
  },
  "aggs": {
    "sales_over_time": {
      "date_histogram": {
        "field": "create_time",
        "calendar_interval": "day",   // 按天聚合
        "format": "yyyy-MM-dd",
        "min_doc_count": 0,           // 没有数据的日期也返回（值为 0）
        "extended_bounds": {
          "min": "now-30d",
          "max": "now"
        }
      },
      "aggs": {                       // 子聚合：每天内部再统计
        "total_amount": {
          "sum": { "field": "amount" }
        },
        "order_count": {
          "value_count": { "field": "order_id" }
        },
        "avg_amount": {
          "avg": { "field": "amount" }
        }
      }
    }
  }
}
```

---

## 本章总结

| 聚合类型 | 适用场景 | 内存消耗 | 推荐基数上限 |
|---------|---------|---------|-------------|
| **Terms** | 按类别分组统计 | 与唯一值数量成正比 | < 1 万 |
| **Composite** | 高基数分组（可分页） | 与每页大小成正比 | 无上限 |
| **Cardinality** | 近似 COUNT DISTINCT | 低（HyperLogLog） | 无上限 |
| **Date Histogram** | 按时间趋势聚合 | 低 | 与时间区间成正比 |
| **Stats / Extended Stats** | 基本统计（最大/小/均值/方差） | 极低 | 无限制 |

**核心原则**：
1. **高基数字段（user_id、order_id 等）不要直接用 Terms 聚合**——这是生产环境最常见的 OOM 原因。用 Composite Aggregation 或 Cardinality 替代
2. **尽量在 Filter Context 下做聚合**——利用 Node Query Cache 缓存命中，不仅不计算 _score，还能缓存中间结果。仪表盘上重复的查询受益最大
3. **聚合不是万能的**——如果需要对海量数据做复杂的多维分析（比如 OLAP 场景），考虑使用 Elasticsearch 的 SQL 功能或对接 Presto/Trino 做更合适的分析引擎