# 第14章 采集端与缓冲层典型问题

## 本章导读

一个真实案例：某公司的日志系统"丢"了 2 小时的日志。排查发现，Filebeat 在凌晨 2 点因为日志文件轮转（log → log.1），Registry 记录了一个错误，导致 Filebeat 认为"这个文件已经处理完了"，实际上文件轮转时还有 3000 条日志没来得及读取。这 3000 条日志就"丢了"——没人知道，没人发现，直到 2 小时后有人发现 Kibana 中有一段"空白期"才意识到出问题了。

采集层（Filebeat/Fluent Bit）处于"第一公里"的位置。它们出了问题，后面整个日志链路都是"无源之水"。但由于采集层太平凡了（"不就是读个文件吗？"），很多问题被忽视了。本章整理了采集层最常见的三个问题及其解决方案。

---

## 14.1 Filebeat Registry 损坏导致日志重复/丢失

```
Registry 的作用：

  Filebeat 用 Registry 文件记录"我读到哪个文件的哪个位置了"。

  Registry 中的一条记录（简化）：
  ┌──────────────────────────────────────────────┐
  │  source: /var/log/apps/order-service.log     │
  │  offset: 12345678  ← 已经读到这里了         │
  │  timestamp: 2024-01-15T10:30:00Z             │
  │  ttl: -1                                     │
  └──────────────────────────────────────────────┘

  正常流程：
  Filebeat 读取日志 → 更新 Registry 中的 offset
  → Filebeat 重启 → 从 Registry 记录的 offset 继续读取
  → 不重复、不遗漏

  Registry 损坏的场景：
  场景 A：Registry 文件所在卷没有持久化
        → 容器重启 → Registry 丢失 → Filebeat 重新读所有文件
        → 所有日志重复发送！→ ES 中大量重复文档

  场景 B：Filebeat 被强制 kill（docker kill）
        → Registry 可能只写入一半（文件损坏）
        → Filebeat 重启后读取 Registry 失败
        → 最坏情况：从文件头开始读（重复），或跳过文件（丢失）
```

### 解决方案

```yaml
# 解决方案 1：Registry 所在目录必须持久化
# docker-compose.yml 中

services:
  filebeat:
    volumes:
      # Registry 数据——必须持久化！
      - filebeat-data:/usr/share/filebeat/data

volumes:
  filebeat-data:      # 使用 Docker 数据卷（不是 bind mount）
    driver: local
```

```bash
# 解决方案 2：Registry 备份机制
# 定期备份 Registry，在损坏时恢复

# 备份脚本
#!/bin/bash
# backup-filebeat-registry.sh

REGISTRY_PATH="/var/lib/filebeat/registry"
BACKUP_PATH="/backup/filebeat-registry"

mkdir -p $BACKUP_PATH
# 备份 Registry 文件
cp -r $REGISTRY_PATH $BACKUP_PATH/registry-$(date +%Y%m%d-%H%M%S)

# 保留最近 7 天的备份
find $BACKUP_PATH -name "registry-*" -mtime +7 -delete
```

```yaml
# 解决方案 3：配置 clean_removed: false
# filebeat.yml
filebeat:
  registry:
    # 默认 true：文件被删除（如日志轮转后旧文件清理）后，
    # Filebeat 会自动从 Registry 中移除这个文件的记录
    # 但如果文件轮转时还有未读取的数据，这会导致数据丢失
    #
    # 设为 false：保留已删除文件的 Registry 记录
    # 下次启动时不会重新读取（因为它认为"已经读完了"）
    clean_removed: false

    # 清理过期的 Registry 记录（默认 24 小时后清理）
    # 确保 Filebeat 不会保留已经删除多天的日志文件记录
    clean_inactive: 240h  # 10 天后清理
```

---

## 14.2 Kafka 消费 Lag 持续飙升

### 问题症状

```bash
# 查看 Kafka 消费者 Lag
docker exec kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group logstash-elk \
  --describe

# 健康状态（Lag ≈ 0）：
# TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# app-logs   0          15000           15002           2      ← 正常
# app-logs   1          15000           15001           1      ← 正常
# app-logs   2          15000           15000           0      ← 正常

# 警告状态（Lag 持续增加）：
# TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# app-logs   0          15000           20000           5000   ← 在增加！
# app-logs   1          15000           20000           5000   ← 在增加！
# app-logs   2          15000           20000           5000   ← 在增加！
```

### 三大根因

```
根因 1：Logstash pipeline.workers 不够
  ┌────────────────────────────────────────────┐
  │  Kafka 有 3 个分区，写入速度 5000 条/秒     │
  │  Logstash 默认只有 1 个 worker              │
  │  一个 worker 处理能力 = 2000 条/秒          │
  │  Logstash 消费速度 = 2000 < 5000（写入）     │
  │  → Lag 每秒增加 3000                        │
  │                                              │
  │  解决：增加 pipeline.workers = 3            │
  │  每个 worker 处理一个 Kafka 分区              │
  │  消费速度 = 3 × 2000 = 6000 > 5000          │
  │  → Lag 逐渐缩小                             │
  └────────────────────────────────────────────┘

根因 2：Grok 正则性能灾难
  ┌────────────────────────────────────────────┐
  │  如果你还在用 Grok 解析非结构化日志           │
  │  一个复杂的 Grok 正则可能消耗 1-5ms/条       │
  │  5000 条/秒 × 5ms = 25 秒的 CPU 时间        │
  │  1 个 Logstash 实例只有 4 个 worker          │
  │  → 每秒只能处理 800 条！→ Lag 暴涨           │
  │                                              │
  │  解决：输出 JSON 日志，不使用 Grok           │
  │  或者优化 Grok 正则，避免回溯灾难             │
  └────────────────────────────────────────────┘

根因 3：ES 写入变慢导致 Logstash 阻塞
  ┌────────────────────────────────────────────┐
  │  Logstash 将数据写入 ES 时阻塞等待          │
  │  如果 ES 集群压力大（如正在做 Merge）        │
  │  写入速度从 5000 降到 500 条/秒              │
  │  → Logstash 整体输出变慢                    │
  │  → Kafka 消费变慢                          │
  │  → Lag 增加                                │
  │                                              │
  │  解决：排查 ES 写入瓶颈，而不是 Logstash    │
  └────────────────────────────────────────────┘
```

### Logstash 调优

```yaml
# logstash.yml —— 性能调优配置

# Pipeline 配置
pipeline:
  # Worker 数（建议 = Kafka 分区数）
  workers: 4

  # 批处理配置
  batch:
    size: 2048              # 每批最多 2048 条事件（默认 125）
    delay: 50               # 最多等待 50ms 凑一个批次（默认 5ms）

# 如果日志量极大，可以启用多 Pipeline
# 每个 Pipeline 独立运行，互不影响
# 例如：一个 Pipeline 处理常规日志，一个处理错误日志
# pipeline.id: main
# path.config: "/usr/share/logstash/pipeline"
```

```conf
# pipeline 配置——分 Pipeline 隔离处理

# Pipeline 1：正常日志（处理量大，不需要复杂 filter）
# pipeline/main.conf
input {
  kafka { topics => ["app-logs"] group_id => "logstash-main" }
}
output {
  elasticsearch { hosts => ["es:9200"] index => "app-logs-%{+YYYY.MM.dd}" }
}

# Pipeline 2：错误日志（数据量小，但需要复杂 filter）
# pipeline/error.conf
input {
  kafka { topics => ["app-logs-error"] group_id => "logstash-error" }
}
filter {
  # ... 复杂的脱敏和处理逻辑 ...
}
output {
  elasticsearch { hosts => ["es:9200"] index => "app-logs-error-%{+YYYY.MM.dd}" }
}
```

---

## 14.3 单条日志过大导致 Agent OOM

### 问题症状

Java 的异常栈、超长 SQL 查询（https://xxx?param1=xxx&param2=xxx...）、大型 JSON 响应体，可能导致单条日志达到几百 KB 甚至几 MB。

```
后果：

  Filebeat 端：
  ┌────────────────────────────────────────────┐
  │  一条日志 5MB                              │
  │  Filebeat 分配一个 5MB 的 buffer 读取它     │
  │  同时有 100 个这样的日志在排队              │
  │  → Filebeat 内存 500MB                     │
  │  → 容器 OOM                                │
  └────────────────────────────────────────────┘

  Logstash 端：
  ┌────────────────────────────────────────────┐
  │  Logstash 收到 5MB 的日志                  │
  │  尝试用 JSON 解析 → 解析失败               │
  │  → 写入 ES 失败 → 进入死信队列             │
  │  → 死信队列文件也很大 → 磁盘空间减少        │
  └────────────────────────────────────────────┘
```

### 解决方案

```yaml
# 方案 1：在 Filebeat 中截断超长日志
# filebeat.yml

processors:
  - truncate_fields:
      fields: ["message"]       # 对 message 字段截断
      max_length: 10000         # 最多保留 10000 个字符
      fail_on_error: false

# 方案 2：在 Logstash 中也做截断（双重保险）
# logstash.conf

filter {
  # 截断 message 字段
  mutate {
    truncate => {
      field => "message"
      length => 10000
    }
  }

  # 截断 stack_trace 字段
  mutate {
    truncate => {
      field => "stack_trace"
      length => 5000
    }
  }
}
```

```xml
<!-- 方案 3：在应用端限制日志长度（最根本的解决方案） -->
<!-- logback-spring.xml 中配置 MessageConverter 截断 -->

<conversionRule conversionWord="truncatedMsg"
                converterClass="com.example.TruncatingConverter"/>
```

```java
// Java 端的截断实现
public class TruncatingConverter extends MessageConverter {

    private static final int MAX_LENGTH = 10000;

    @Override
    public String convert(ILoggingEvent event) {
        String message = event.getFormattedMessage();
        if (message != null && message.length() > MAX_LENGTH) {
            return message.substring(0, MAX_LENGTH) +
                "... [truncated " + (message.length() - MAX_LENGTH) + " chars]";
        }
        return message;
    }
}
```

### 多行日志（Multiline）合并策略

```yaml
# Java 异常栈的多行合并——Filebeat 配置

filebeat.inputs:
  - type: log
    paths:
      - /var/log/apps/*.log

    # Multiline 配置
    multiline:
      # 类型：pattern（正则匹配）
      type: pattern

      # 匹配规则：以日期开头的是新日志的开始
      # 2024-01-15 10:00:00.123 ...
      pattern: '^\d{4}-\d{2}-\d{2}'

      # negate: true → 不匹配 pattern 的行（异常栈的后续行）
      # match: after → 追加到上一行的后面
      negate: true
      match: after

      # 超时：如果 5 秒内没有新行追加，强制结束当前多行
      timeout: 5s

      # 最大行数：最多合并 50 行（防止超长异常栈撑爆）
      max_lines: 50
```

```
Multiline 的效果：

  合并前（Filebeat 眼中的日志文件）：
  ┌────────────────────────────────────────┐
  │ 2024-01-15 10:00:00.123 ERROR 订单失败  │
  │ java.lang.RuntimeException: 超时        │
  │   at OrderService.java:42             │
  │   at PaymentService.java:35           │
  │   ...(50 行异常栈)                     │
  │ 2024-01-15 10:00:01.456 INFO 其他日志  │
  └────────────────────────────────────────┘

  如果不配置 multiline：
  这 50 行异常栈会被拆成 50 条独立的 ERROR 日志
  → ELK 中 50 条孤立的 ERROR，完全看不出它们是一个异常

  配置 multiline after 后：
  → 1 条日志，message 包含完整的 52 行
  → 可以在 Kibana 中看到完整的异常栈
```

---

## 本章总结

| 问题 | 症状 | 根因 | 解决方案 |
|------|------|------|---------|
| **Registry 损坏** | 日志重复/丢失 | Registry 文件损坏或未持久化 | 持久化数据卷 + clean_removed: false |
| **Kafka Lag 飙升** | 日志延迟 | Logstash 处理速度 < 写入速度 | 增加 pipeline.workers、优化 Grok |
| **单条日志过大** | Agent OOM | 超长 SQL/异常栈 | truncate_fields 截断 + multiline 合并 |
| **异常栈被拆分** | 异常不完整 | 没有 multiline 配置 | multiline.pattern + match: after |

**核心原则**：
1. **Registry 是 Filebeat 的"记忆"**——原因把它比作"书签"。Filebeat 重启后靠"书签"知道读到哪里了。Registry 丢失 = 书签丢了 = Filebeat 重新读 = 重复数据
2. **Kafka Lag 是系统健康的"体温计"**——Lag 持续增加说明处理层（Logstash）跟不上了。不要等到 Lag 大到撑爆 Kafka 磁盘才处理
3. **多行日志合并是 Java 开发者必须配置的**——没有 multiline，一个 50 行的异常栈在 ELK 中就是 50 条日志。排查问题时你根本看不出它们是同一个异常
4. **在源头截断比在传输中截断更有效**——应用端限制日志长度 → 减少网络传输 → 减少存储。在 ELK 中"截断"其实已经太晚了（数据已经传了、存了）