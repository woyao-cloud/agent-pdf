# 第6章 方案 B：企业级高吞吐架构（Filebeat -> Kafka -> Logstash -> ES）

## 本章导读

第 5 章的直连方案在数据量小的时候没问题，但当天日志达到 500GB、ES 集群偶尔抖动时，你会发现：Filebeat 的队列满了 → 日志文件读取停下来了 → 磁盘空间被日志撑爆了 → 应用挂了。

引入 Kafka 就是为了解决"ES 抖动导致的数据丢失"问题。Kafka 作为一个持久化能力极强的消息队列，它可以**接受 Filebeat 的所有数据并安全存储**，即使 Logstash 或 ES 暂时不可用，数据也不会丢失。

```
有 Kafka 和没有 Kafka 的区别：

  没有 Kafka：
  Filebeat → (如果 ES 不可用) → 队列满 → 丢数据 → 日志不全

  有 Kafka：
  Filebeat → Kafka（安全存储）→ Logstash → ES
               ↑              ↑
            数据先写到 Kafka   Logstash 从 Kafka 慢悠悠地消费
            Kafka 可以存几天   不着急，不会丢数据
```

---

## 6.1 引入 Kafka 缓冲层的必要性

### 削峰填谷

```
Kafka 的削峰填谷效果：

  日志产生速度（波峰波谷）：

  流量 │
       │  峰
   500 │  ████
   400 │  ██████
   300 │  ████████
   200 │  ████████████    ██████
   100 │  ████████████████        ████████
      └─────────────────────────────────────── 时间
          10:00  10:05  10:10  10:15

  没有 Kafka：Logstash 必须按峰值 500MB/s 配置
  有 Kafka：Logstash 按平均 200MB/s 配置
           峰值时数据在 Kafka 中排队
           低谷时 Logstash 慢慢消费积压数据
```

### 防止 ES 抖动导致数据丢失

```
ES 集群抖动时的数据流：

  没有 Kafka：
  ES 节点 Full GC → 拒绝写入请求
  → Filebeat 写入失败 → Spooler 队列满 → 数据丢失

  有 Kafka：
  ES 节点 Full GC → 拒绝写入请求
  → Logstash 写入 ES 失败 → 但数据还在 Kafka 里！
  → Logstash 重试 → ES 恢复 → Logstash 从 Kafka 继续消费
  → 数据完好无损
```

---

## 6.2 Filebeat 输出到 Kafka

```yaml
# filebeat.yml —— Filebeat 输出到 Kafka

filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/apps/*.log
    json.keys_under_root: true
    multiline:
      type: pattern
      pattern: '^\d{4}-\d{2}-\d{2}'
      negate: true
      match: after

# ===== 输出到 Kafka（取代直连 ES） =====
output.kafka:
  # Kafka 集群地址
  hosts: ["localhost:9092"]

  # 目标 Topic
  topic: "app-logs"

  # 分区策略：按日志级别分区
  # ERROR 在一个分区（优先消费），INFO 在另一个
  partition:
    round_robin:
      reachable_only: false

  # 消息编码：JSON 格式
  codec.json:
    pretty: false

  # ACK 策略
  required_acks: 1         # Leader 写入成功就确认（平衡性能和可靠性）
  compression: gzip        # 压缩传输（减少网络带宽）

  # 生产者缓冲
  bulk_max_size: 2048
  max_message_bytes: 10485760  # 10MB

  # 超时配置
  timeout: 30
  broker_timeout: 10
```

---

## 6.3 Logstash 消费 Kafka 并清洗数据

```conf
# logstash/pipeline/logstash.conf —— 企业级 Logstash 配置
# 功能：
#   1. 从 Kafka 消费日志
#   2. 数据清洗（脱敏、字段转换）
#   3. 根据日志级别路由到不同索引
#   4. 失败消息进入死信队列

input {
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["app-logs"]

    # 消费组（多个 Logstash 实例时使用同一个 group_id）
    group_id => "logstash-elk"

    # 并行度（Kafka 分区数决定了最大并行度）
    consumer_threads => 3

    # 从头开始消费（首次启动时读取历史数据）
    auto_offset_reset => "latest"

    # JSON 解码
    codec => json

    # 性能配置
    fetch_max_wait_ms => 100      # 等待时间
    fetch_min_bytes => 1          # 最小获取字节
    fetch_max_bytes => 52428800   # 最大 50MB/批
  }
}

filter {
  # ===== 1. 日期解析 =====
  date {
    match => ["@timestamp", "ISO8601", "yyyy-MM-dd HH:mm:ss.SSS"]
    target => "@timestamp"
  }

  # ===== 2. 敏感数据脱敏 =====
  # 手机号：13812341234 → 138****1234
  mutate {
    gsub => [
      "message", "(1[3-9]\\d)\\d{4}(\\d{4})", "\\1****\\2",
      # 身份证：110101199001011234 → ******19900101****
      "message", "\\d{6}(\\d{8})\\d{4}", "******\\1****"
    ]
  }

  # ===== 3. 字段清理 =====
  # 删除不必要的字段（减少 ES 存储量）
  mutate {
    remove_field => [
      "message",       # 原始消息（已经被拆分成结构化字段了）
      "original",      # Filebeat 添加的原始字段
      "@version"       # 内部版本号
    ]
    remove_field => ["event", "agent", "log", "input", "ecs"]
  }

  # ===== 4. 添加 ES 索引路由标记 =====
  mutate {
    add_field => {
      "[@metadata][index_prefix]" => "%{[log][level]}"  # 获取日志级别
    ]
  }

  # 如果日志级别不是 ERROR/WARN，标记为 info
  if [@metadata][index_prefix] !~ /^(ERROR|WARN)$/ {
    mutate {
      replace => { "[@metadata][index_prefix]" => "info" }
    }
  }
}

output {
  # ===== ERROR/WARN 路由到错误索引 =====
  if [@metadata][index_prefix] == "ERROR" or [@metadata][index_prefix] == "WARN" {
    elasticsearch {
      hosts => ["es-node1:9200", "es-node2:9200", "es-node3:9200"]
      index => "app-logs-error-%{+YYYY.MM.dd}"
      # 批量写入配置
      bulk_max_size => 2048
      flush_size => 2048
      idle_flush_time => 5  # 5 秒内没有新数据也 flush
    }
  }
  # ===== INFO/DEBUG 路由到主索引 =====
  else {
    elasticsearch {
      hosts => ["es-node1:9200", "es-node2:9200", "es-node3:9200"]
      index => "app-logs-%{+YYYY.MM.dd}"
      bulk_max_size => 2048
      flush_size => 2048
      idle_flush_time => 5
    }
  }

  # ===== 死信队列：处理失败的日志 =====
  # 如果日志写到 ES 失败（如字段类型不匹配）
  # 写入文件而不是丢弃，方便事后排查
  if "_logstash_lost" in [tags] or "_jsonparsefailure" in [tags] {
    file {
      path => "/var/log/logstash/dlq/%{+YYYY.MM.dd}-dlq.log"
      codec => json
    }
  }
}
```

### Logstash 性能调优

```yaml
# logstash/config/logstash.yml
# Logstash 性能调优配置

# Pipeline 配置
pipeline:
  # 同时运行多个 Pipeline（默认 1）
  # 提高 Logstash 的并行处理能力
  workers: 4

  # Pipeline 批处理
  batch:
    size: 2048              # 每批最多 2048 条
    delay: 50               # 等待 50ms 再发（凑更多条）

# 监控
xpack.monitoring.enabled: false

# JVM 配置（config/jvm.options）
# -Xms1g -Xmx1g  # 根据数据量调整，一般 2-4GB
```

---

## 本章总结

| 组件 | 职责 | 性能 | 高可用 |
|------|------|------|--------|
| **Filebeat** | 读日志文件，发到 Kafka | 每实例 50MB 内存 | 本地 Registry 持久化，重启续传 |
| **Kafka** | 持久化存储日志，削峰填谷 | 百万条/秒 吞吐 | 副本机制，可容忍节点故障 |
| **Logstash** | 从 Kafka 消费，清洗数据，写 ES | 每实例 2-5 万条/秒 | 消费组内多个实例负载均衡 |

**核心原则**：
1. **Kafka 是 ELK 企业架构的"稳定器"**——它解耦了"日志产生"和"日志消费"两个过程。Filebeat 只管往 Kafka 写，不管 ES 是否可用；Logstash 只管从 Kafka 读，不管数据产出的速率。即使 ES 宕机 1 小时，Kafka 中的日志也不会丢
2. **Logstash 的 Filter 是数据处理的核心**——脱敏、日期解析、字段清理、路由到不同索引都在 Filter 中完成。如果不需要这些复杂处理，可以用更轻的组件（如 Kafka Connect）
3. **死信队列（DLQ）是必不可少的**——总有少数日志会因为各种原因写 ES 失败（格式不匹配、字段超长等）。不配置 DLQ，这些数据就丢了。配置了 DLQ，你可以事后分析失败原因并修复
4. **按日志级别分索引是搜索优化的最佳实践**——ERROR 日志的搜索频率远高于 INFO 日志。将它们分开到不同的索引后，搜索 ERROR 时只需要在小索引中查，速度更快