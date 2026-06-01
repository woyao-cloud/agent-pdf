# 第4章 场景二：海量日志分析与 ELK 架构（时序数据）

## 本章导读

ELK（Elasticsearch + Logstash + Kibana）是最广泛使用的日志分析技术栈，几乎成了日志系统的代名词。每家公司都有日志，但不是每家公司的日志搜索都"好用"——在一个拥有 500 台服务器的集群中，每天产生 10TB 的日志。如果不对索引做任何规划，一个月后你的 ES 集群将拥有 300TB 数据、数万个分片——性能崩溃是必然的。

2018 年某知名互联网公司的 ES 集群曾出现过一次"史诗级"事故：一个研发团队在做日志采集时，未对 Dynamic Mapping 做限制，业务端发送了一个包含 10 万个新字段的 JSON 文档给 ES。ES 的 Dynamic Mapping 机制自动为每个新字段创建了 Mapping——10 万个字段的 Mapping 变更导致 Master 节点 OOM、集群 Red 状态持续了数小时。

本章将系统讲解日志场景下的索引设计范式、ILM（索引生命周期管理）、以及如何避免"小分片灾难"和"Mapping 爆炸"。

---

## 4.1 实现原理

### 基于时间序列的索引设计

日志数据天生是时间序列的——昨天的日志不会被修改，今天的日志不断产生，明天的日志还没生成。ES 在日志场景中的最佳实践是**按时间分区创建索引**：

```
时间序列索引的命名范式：

  按天分区（最常用）：
  logs-2024-01-01
  logs-2024-01-02
  logs-2024-01-03
  ...

  按月分区（数据量小）：
  logs-2024-01
  logs-2024-02
  ...

  按小时分区（数据量大）：
  logs-2024-01-01-00
  logs-2024-01-01-01
  ...
```

**为什么按时间分区？** 因为时间分区让索引管理变得极其自然——今天的索引是可写的，昨天的索引可以设为只读并合并 Segment，30 天前的索引可以归档到冷存储甚至删除。

### ILM（索引生命周期管理）——自动管理索引

ES 的 ILM 机制将索引的生命周期分为 4 个阶段（Phase）：

```
ILM 的四阶段：

  Hot（热阶段）——SSD 存储，索引可读写
  ├── 数据在 SSD 上，性能最好
  ├── 接受写入和搜索请求
  ├── 触发 Rollover 后进入 Warm 阶段
  └── 一般持续几小时到几天

  Warm（温阶段）——HDD 存储，索引只读
  ├── 数据迁移到 HDD，降低成本
  ├── 不再接受写入
  ├── 可以 force_merge 减少 Segment
  └── 一般持续几天到几周

  Cold（冷阶段）——HDD/对象存储，索引可搜但很慢
  ├── 进一步降低存储成本
  ├── 搜索仍然可用，但延迟较高
  └── 一般持续几周到几个月

  Delete（删除阶段）——直接删除
  ├── 数据超过保留期限
  ├── 直接删除索引释放空间
  └── 不再保留
```

```json
// 定义 ILM 策略（生命周期的"规则"）
PUT _ilm/policy/logs_policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",           // 立即进入 Hot 阶段
        "actions": {
          "rollover": {
            "max_size": "50gb",     // 索引超过 50GB 时滚动
            "max_age": "1d",        // 或者超过 1 天时滚动
            "max_docs": 10000000    // 或者超过 1000 万文档时滚动
          },
          "set_priority": {
            "priority": 100         // Hot 阶段优先级最高
          }
        }
      },
      "warm": {
        "min_age": "3d",            // 3 天后进入 Warm 阶段
        "actions": {
          "forcemerge": {
            "max_num_segments": 1   // 强制合并为 1 个 Segment
          },
          "shrink": {
            "number_of_shards": 1   // 收缩分片数（从 5 缩到 1）
          },
          "allocate": {
            "require": {
              "data_type": "warm"   // 分配到 Warm 节点
            }
          },
          "set_priority": {
            "priority": 50
          }
        }
      },
      "cold": {
        "min_age": "30d",           // 30 天后进入 Cold 阶段
        "actions": {
          "allocate": {
            "require": {
              "data_type": "cold"   // 分配到 Cold 节点
            }
          },
          "set_priority": {
            "priority": 0
          }
        }
      },
      "delete": {
        "min_age": "90d",           // 90 天后删除
        "actions": {
          "delete": {}              // 删除索引
        }
      }
    }
  }
}
```

### Rollover——按大小滚动索引

Rollover API 是解决"小分片问题"的核心工具。它根据索引大小、文档数或时间自动创建新索引：

```json
// 第一步：创建索引模板（含 Rollover 别名）
PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 5,
      "number_of_replicas": 1,
      "index.lifecycle.name": "logs_policy",
      "index.lifecycle.rollover_alias": "logs_write"  // 滚动别名
    },
    "mappings": {
      "dynamic": "strict",      // ⚠️ 禁止 Dynamic Mapping！
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" },
        "service_name": { "type": "keyword" },
        "host": {
          "properties": {
            "ip": { "type": "ip" },
            "hostname": { "type": "keyword" }
          }
        }
      }
    }
  }
}

// 第二步：创建第一个索引，指定别名
PUT logs-000001
{
  "aliases": {
    "logs_write": { "is_write_index": true }  // 写 Alias 指向当前索引
  }
}

// 第三步：写入数据时指向 Alias
POST logs_write/_doc
{
  "@timestamp": "2024-01-15T10:30:00Z",
  "level": "ERROR",
  "message": "数据库连接超时",
  "service_name": "order-service"
}

// 第四步：当索引达到 50GB 时，ILM 自动执行 Rollover
// 效果：
// logs-000001 → 设为只读，标记为 Warm
// logs-000002 → 自动创建，logs_write 指向它
// 整个过程零停机，业务层完全无感知
```

---

## 4.2 两大潜在风险

### 风险一：小分片问题（分片爆炸）

```
小分片灾难的真实案例：

  场景：一个日志系统每天产生 2GB 数据，按天建索引，每个索引 5 个主分片

  一个月后：30 个索引 × 5 个分片 = 150 个分片
  一年后：365 个索引 × 5 个分片 = 1825 个分片

  看起来不多？但每个分片在 Master 节点上都有对应的元数据：
  分片元数据 ≈ 每个分片 2KB
  1825 个分片 ≈ 3.6MB ← 不多

  但如果一个开发团队"忘记"了分片设计，按小时建索引：
  一年：365 × 24 × 5 = 43800 个分片！
  分片元数据：43800 × 2KB = 87MB

  Master 节点每 30 秒发布一次 Cluster State：
  Cluster State 序列化为 87MB 的 JSON
  然后广播到所有节点（10 个 Data 节点）
  每次 Cluster State 发布：87MB × 10 节点 = 870MB 网络流量
  → Master 节点 CPU 100%（不停地序列化大 JSON）
  → 其他节点频繁收到大的 Cluster State 更新
  → 集群性能严重下降
```

```
小分片的核心危害：
  
  危害 1：Master 节点内存耗尽
  ┌────────────────────────────────────────────┐
  │  Cluster State（集群元数据）完全在内存中     │
  │  每个分片 → 元数据中的一条记录              │
  │  10 万分片 → Cluster State 可能超过 1GB    │
  │  → Master 节点频繁 GC → 集群不稳定         │
  └────────────────────────────────────────────┘

  危害 2：搜索性能下降
  ┌────────────────────────────────────────────┐
  │  搜索请求需要广播到所有分片                 │
  │  100 个小分片 = 100 次搜索请求              │
  │  每个分片的搜索是串行的（分片内部）          │
  │  但分片之间是并发的（协调节点调度）          │
  │  文件描述符消耗：100 × 每个分片的文件数       │
  └────────────────────────────────────────────┘
```

**解决方案**：使用 Rollover API 按大小滚动，而不是按时间。单个分片的理想大小是 10GB-50GB。

### 风险二：Mapping 爆炸（字段数量失控）

```
Mapping 爆炸的真实案例：

  某公司的研发人员在日志中加入了自定义字段：
  { "level": "ERROR", "message": "超时", "custom_field_1": "xxx" }

  第二天：
  { "level": "ERROR", "message": "超时", "custom_field_2": "yyy" }

  第三天新增 3 个字段，第四天新增 5 个字段...
  一年后：这个索引的 Mapping 中有 5 万个字段！

  每一个字段都在 Cluster State 中占有一席之地
  Mapping 信息膨胀 → Master 节点内存耗尽 → 集群崩溃
```

```json
// 解决方案：严格禁止 Dynamic Mapping

// 方案 A：全局设置为 strict——拒绝任何未定义字段
PUT _index_template/your_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "mappings": {
      "dynamic": "strict",   // ❌ 未定义字段 → 写入报错
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" }
      }
    }
  }
}

// 测试：写入一个未定义的字段
POST logs-000001/_doc
{
  "@timestamp": "2024-01-15T10:30:00Z",
  "level": "ERROR",
  "message": "超时",
  "unknown_field": "这个字段不在 mapping 中"
}
// 返回：illegal_argument_exception
// "mapping set to strict, dynamic introduction of [unknown_field] within [_doc] is not allowed"

// 方案 B：dynamic: false——忽略未定义字段（不报错但不索引）
// 不创建 Mapping，不索引，但 _source 中仍然保留
PUT _index_template/your_template
{
  "template": {
    "mappings": {
      "dynamic": "false",    // 忽略未定义字段
      "properties": { ... }
    }
  }
}

// 方案 C：dynamic: true + 限制字段总数（ES 7.x+）
PUT _cluster/settings
{
  "persistent": {
    "index.mapping.total_fields.limit": 200  // 单个索引最多 200 个字段
  }
}
```

---

## 4.3 优化与应对方案

### 写优化：批量写入 + 调整 Translog

```json
// 日志场景的写入优化

// 1. 增大 Bulk 批次大小
// 客户端（如 Logstash）配置 bulk 大小
// 建议：5MB-15MB 一个批次（不是 1000 条，而是按大小算）

// 2. 调整 refresh 间隔——日志不需要实时可见
PUT my_logs_index/_settings
{
  "index": {
    "refresh_interval": "30s"   // 30 秒刷新一次，降低刷新频率
  }
}

// 3. 调整 Translog 为异步——提升写入吞吐
// ⚠️ 代价：宕机可能丢失最近几秒的数据
PUT my_logs_index/_settings
{
  "index": {
    "translog": {
      "durability": "async",     // 异步刷盘
      "sync_interval": "5s",     // 每 5 秒同步一次
      "flush_threshold_size": "1024mb"  // Translog 到 1GB 才 flush
    }
  }
}

// 4. 禁用 _source——日志不需要"查原文"
// ⚠️ 慎重：禁用后不能再通过搜索返回原始文档
PUT my_logs_index
{
  "mappings": {
    "_source": { "enabled": false }
  }
}
```

### 集群部署：Hot-Warm-Cold 架构

```json
// 节点角色配置

// 1. 标记节点类型
// Hot 节点（SSD）：
// elasticsearch.yml
// node.roles: ["data_hot", "data_content"]
// Node 配置标签
// node.attr.data_type: hot

// Warm 节点（HDD）：
// node.roles: ["data_warm", "data_content"]
// node.attr.data_type: warm

// Cold 节点（大容量 HDD）：
// node.roles: ["data_cold", "data_content"]
// node.attr.data_type: cold
```

### Java 集成：Spring Boot 写入日志

```java
/**
 * 批量写入日志到 ES
 * 使用 Bulk API 提高写入吞吐
 */
@Component
public class LogWriterService {

    private final ElasticsearchRestTemplate template;

    // 每批次 5000 条日志，或者 10MB
    private static final int BATCH_SIZE = 5000;
    private final List<LogEntry> batch = new ArrayList<>();

    @Scheduled(fixedRate = 5000) // 每 5 秒 flush 一次
    public void flush() {
        if (batch.isEmpty()) return;

        List<IndexQuery> queries = batch.stream()
            .map(log -> new IndexQueryBuilder()
                .withIndexName("logs-" + LocalDate.now())
                .withObject(log)
                .build())
            .collect(Collectors.toList());

        template.bulkIndex(queries, IndexCoordinates.of("logs-*"));
        batch.clear();
    }

    public void write(LogEntry log) {
        batch.add(log);
        if (batch.size() >= BATCH_SIZE) {
            flush();
        }
    }
}
```

---

## 本章总结

| 技术 | 解决的问题 | 生产建议 |
|------|-----------|---------|
| **时间序列索引** | 按时间范围组织数据 | 按天或按大小（Rollover，50GB）划分 |
| **ILM** | 自动管理索引生命周期 | 配置 Hot-Warm-Cold-Delete 四阶段 |
| **Rollover** | 防止小分片过多 | 按 50GB 或 1 天滚动一次 |
| **Dynamic: strict** | 防止 Mapping 爆炸 | 生产环境必须设置为 strict |
| **Translog async** | 提高写入吞吐 | 可以接受丢几秒数据的场景使用 |
| **Hot-Warm-Cold** | 降低存储成本 | Hot 用 SSD，Warm 用 HDD，Cold 用大容量盘 |

**核心原则**：
1. **日志索引必须提前规划**——不要用默认配置。必须设计 ILM 策略、Rollover、Dynamic Mapping 策略。一个没有规划过的日志集群，最多撑 3 个月就会出问题
2. **小分片是 Master 节点的头号杀手**——每个分片的元数据都在 Master 节点的内存中。10 万分片 = Master 节点 1GB+ 内存占用。使用 Rollover API 按大小滚动，而不是按时间硬分
3. **禁止 Dynamic Mapping**——严格模式（`dynamic: strict`）是生产环境日志索引的必须配置。开发环境可以用 `dynamic: false`（不报错，但不索引未定义字段）
4. **日志不要求实时可见**——调大 refresh_interval（30 秒甚至 60 秒），异步 Translog，可以大幅提升写入吞吐