# 附录

## 附录A：Elasticsearch 核心 DSL 查询与聚合速查手册

### 查询速查

```json
// ===== Match 系列 =====
// 全文搜索（分词后匹配）
GET index/_search
{
  "query": {
    "match": {
      "title": "苹果手机"
    }
  }
}

// 精确匹配（keyword 字段）
GET index/_search
{
  "query": {
    "term": {
      "status": "上架"
    }
  }
}

// 多字段匹配
GET index/_search
{
  "query": {
    "multi_match": {
      "query": "苹果手机",
      "fields": ["title^3", "description"],
      "type": "best_fields"
    }
  }
}

// 范围查询
GET index/_search
{
  "query": {
    "range": {
      "price": {
        "gte": 1000,
        "lte": 5000
      }
    }
  }
}

// 布尔组合查询
GET index/_search
{
  "query": {
    "bool": {
      "must":     [{ "match": { "title": "手机" } }],
      "filter":   [{ "term": { "status": "上架" } }],
      "should":   [{ "term": { "is_recommend": true } }],
      "must_not": [{ "term": { "status": "下架" } }]
    }
  }
}
```

### 聚合速查

```json
// Terms 聚合（分组统计）
GET index/_search
{
  "size": 0,
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 10 }
    }
  }
}

// 统计聚合
GET index/_search
{
  "aggs": {
    "price_stats": {
      "stats": { "field": "price" }
      // 返回：min, max, avg, sum, count
    }
  }
}

// 日期直方图
GET index/_search
{
  "aggs": {
    "sales_over_time": {
      "date_histogram": {
        "field": "create_time",
        "calendar_interval": "day"
      }
    }
  }
}

// 嵌套聚合（分组 + 统计）
GET index/_search
{
  "aggs": {
    "by_category": {
      "terms": { "field": "category" },
      "aggs": {
        "avg_price": {
          "avg": { "field": "price" }
        }
      }
    }
  }
}
```

---

## 附录B：从 MySQL 到 Elasticsearch 的数据同步方案对比

| 方案 | 实时性 | 侵入性 | 复杂度 | 适用场景 |
|------|-------|--------|--------|---------|
| **Logstash JDBC Input** | 分钟级（定时轮询） | 低（读 MySQL） | ⭐⭐ | 全量同步、低频增量 |
| **Canal + MQ** | 秒级（Binlog 订阅） | 低（读 Binlog） | ⭐⭐⭐⭐ | 实时同步 |
| **Flink CDC** | 秒级（Binlog 流式） | 低（读 Binlog） | ⭐⭐⭐⭐⭐ | 大规模实时同步+ETL |
| **应用层双写** | 实时 | 高（改业务代码） | ⭐ | 小规模、简单场景 |

---

## 附录C：ES 集群健康巡检脚本

```bash
#!/bin/bash
# es-health-check.sh —— ES 集群健康巡检

ES_HOST="http://localhost:9200"

echo "===== ES 集群健康巡检 ====="
echo

# 1. 集群整体健康
echo "1. 集群健康状态："
curl -s "$ES_HOST/_cluster/health?pretty" | jq '.status, .number_of_nodes, .active_shards_percent_as_number'

# 2. 节点状态
echo "2. 节点列表："
curl -s "$ES_HOST/_cat/nodes?v=true&h=name,node.role,heap.percent,ram.percent,cpu,load_1m"

# 3. 磁盘使用率
echo "3. 磁盘使用率："
curl -s "$ES_HOST/_cat/allocation?v"

# 4. 是否有未分配分片
echo "4. 未分配索引："
curl -s "$ES_HOST/_cat/indices?v&health=red&health=yellow"

# 5. JVM 内存
echo "5. JVM 堆内存使用："
curl -s "$ES_HOST/_nodes/stats/jvm?pretty" | jq '.nodes[] | {name: .name, heap_used_percent: .jvm.mem.heap_used_percent}'

# 6. 健康评分
HEALTH=$(curl -s "$ES_HOST/_cluster/health?pretty" | jq -r '.status')
if [ "$HEALTH" == "green" ]; then
  echo "✅ 集群健康：GREEN"
elif [ "$HEALTH" == "yellow" ]; then
  echo "⚠️  集群健康：YELLOW（有副本未分配）"
else
  echo "🔴 集群健康：RED（有主分片未分配）"
fi
```