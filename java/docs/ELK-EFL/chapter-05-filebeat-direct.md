# 第5章 方案 A：轻量级直连（Filebeat -> Elasticsearch）

## 本章导读

Filebeat 是 ELK 栈中最轻量的"搬运工"。它的工作极其纯粹——**读日志文件 → 发送到目的地**。没有复杂的数据处理能力，但正是这种"纯粹"让它占用的资源极少（内存 20-50MB），适合部署在每一台应用服务器上。

在 ELK 架构中，Filebeat 始终是"第一公里"——它负责把日志从应用服务器采集出来。至于数据送到哪里（直接到 ES？还是到 Kafka？），取决于你的架构设计。

---

## 5.1 Filebeat 的 Harvester 与 Spooler 机制

```
Filebeat 的内部工作流程：

  ┌──────────────────────────────────────────────────────────┐
  │  Filebeat 进程                                           │
  │                                                          │
  │  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐ │
  │  │  Harvester   │    │   Spooler   │    │  Output      │ │
  │  │  (读取文件)  │──► │  (批量组装) │──► │  (发送)     │ │
  │  └─────────────┘    └─────────────┘    └──────────────┘ │
  │         │                   │                  │         │
  │         ▼                   ▼                  ▼         │
  │  ┌──────────────────────────────────────────────────┐   │
  │  │  Registry（记录读取位置）                         │   │
  │  │  /var/lib/filebeat/registry/filebeat.log          │   │
  │  │  ← 记录了每个文件读到了哪一行                     │   │
  │  │  ← Filebeat 重启后从上次位置继续读取              │   │
  │  └──────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────┘

  Harvester（收割者）：
  - 每个日志文件对应一个 Harvester
  - 负责打开文件、读取新内容
  - 检测文件轮转（日志从 app.log 变到 app.log.1）
  
  Spooler（事件队列）：
  - Harvester 读到的日志行放入 Spooler 队列
  - 达到 batch 大小（如 2048 条）或超时（如 5 秒）后发送
  
  Registry（注册表）：
  - 记录每个文件当前的读取位置（offset）
  - 文件系统持久化，重启后继续
  - 防止重复发送或漏发
```

---

## 5.2 核心配置：filebeat.yml

```yaml
# filebeat.yml —— 采集 Spring Boot JSON 日志，直连 ES
# 配置说明：
#   inputs: 定义采集哪些日志文件
#   processors: 对日志做轻量级处理
#   output: 输出到 ES

filebeat.inputs:
  - type: log
    enabled: true

    # 采集 Spring Boot 应用的 JSON 日志文件
    paths:
      - /app/logs/*.log          # Docker 容器中的日志路径
      - /var/log/apps/*.log       # 物理机/虚拟机中的日志路径

    # JSON 解析：告知 Filebeat 日志文件是 JSON 格式
    # 这样 Filebeat 可以直接解析 JSON，提取字段
    json.keys_under_root: true    # JSON 字段提到根层级
    json.overwrite_keys: true     # 覆盖 Filebeat 自带的字段（如 @timestamp）
    json.add_error_key: true      # 如果解析失败，添加 error.message 字段

    # 多行日志合并（用于 Java 异常栈）
    # Java 异常栈的每一行不是独立的 JSON，不能作为独立事件发送
    # multiline 将它们合并为一个事件
    multiline:
      type: pattern
      pattern: '^\d{4}-\d{2}-\d{2}'  # 以日期开头的行是新日志的开始
      negate: true                     # 不匹配模式的行（异常栈的后续行）
      match: after                    # 追加到上一行的后面

    # 字段添加
    fields:
      service_name: "order-service"   # 标记日志来源服务（也可以在 logback 中设）
      environment: "production"

    # 标签（可用于 ES 索引路由）
    tags: ["json", "spring-boot"]

# ===== 处理器：轻量级数据处理 =====
processors:
  # 添加 Docker/K8s 容器元数据（如果 Filebeat 运行在容器中）
  - add_docker_metadata:
      host: "unix:///var/run/docker.sock"

  # 添加时间戳
  - add_host_metadata:
      when.not.contains.tags: forwarded

  # 字段删除（移除不必要的字段，减少 ES 存储）
  - drop_fields:
      fields: ["input", "ecs", "agent", "host.architecture"]

# ===== 输出：直接发送到 Elasticsearch =====
output.elasticsearch:
  hosts: ["localhost:9200"]           # ES 地址
  protocol: "http"
  index: "app-logs-%{+yyyy.MM.dd}"   # 按天创建索引

  # Bulk 索引配置（控制写入吞吐）
  bulk_max_size: 2048                  # 每次批量 2048 条
  worker: 4                            # 4 个并行 worker（提高写入速度）
  flush_bytes: 10485760                # 每 10MB 强制 flush

# ===== 性能配置 =====
logging.level: info
logging.to_files: true
logging.files:
  keepfiles: 7
  permissions: 0644
```

---

## 5.3 适用场景与局限性

```
Filebeat -> ES 直连的适用场景：

  ✅ 适用：
  - 小型部署（< 10 台服务器）
  - 数据量不大（每天 < 100GB 日志）
  - ES 集群与应用服务器同机房（低延迟）
  - 不需要复杂的数据清洗（只需要 JSON 解析）

  ❌ 不适用：
  - 需要 Kafka 缓冲层的架构
  - 需要 Logstash 做复杂数据脱敏
  - ES 宕机时不能丢数据（Filebeat 的内存缓冲有限）
  - 日均日志 > 100GB（需要 Logstash 做批量优化）
```

**Filebeat 直连 ES 的最大风险**：

```
Filebeat 直连的风险：

  ES 宕机时，Filebeat 的行为：
  ┌────────────────────────────────────────────┐
  │  Filebeat 的 Spooler 队列有最大容量限制     │
  │  默认：4MB × worker 数                      │
  │  当队列满了：                             │
  │  → 新的日志无法入队                         │
  │  → Filebeat 停止读取文件                    │
  │  → 磁盘上的日志文件越来越大                  │
  │  → 磁盘满了 → 应用服务也挂了                 │
  └────────────────────────────────────────────┘

  引入 Kafka 后：
  ┌────────────────────────────────────────────┐
  │  Filebeat → Kafka                         │
  │  Kafka 可以保留大量数据（几天到几周）       │
  │  ES 宕机时，数据在 Kafka 中安全保留        │
  │  Logstash 恢复后从 Kafka 继续消费          │
  │  → 数据不丢                               │
  └────────────────────────────────────────────┘
```

---

## 本章总结

```yaml
# 速查：启动 Filebeat

# Docker 方式运行 Filebeat
docker run -d \
  --name filebeat \
  --restart always \
  -v /var/log/apps:/var/log/apps:ro \   # Spring Boot 日志目录
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \  # 容器日志
  -v filebeat-data:/usr/share/filebeat/data \  # Registry 持久化
  -v $(pwd)/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro \  # 配置文件
  docker.elastic.co/beats/filebeat:8.12.0
```

**核心原则**：
1. **Filebeat 只做"搬砖"**——不处理数据格式，不做数据清洗。JSON 解析已经是 Filebeat 能做的"最复杂的操作"。任何需要字段转换、脱敏的路由操作，应该交给 Logstash
2. **Registry 文件必须持久化**——Filebeat 通过 Registry 记录每个文件的读取位置。如果 Registry 丢失（如容器重启没有挂载数据卷），Filebeat 会重新读取整个日志文件 → 数据重复
3. **Multiline 配置对于 Java 异常栈至关重要**——没有 multiline，一个 30 行的异常栈会被拆成 30 条独立的日志。在 Kibana 中看到的是 30 条孤立的 ERROR，而不是一个完整的异常事件
4. **Filebeat -> ES 直连只适合小规模场景**——一旦数据量超过每天 100GB 或 ES 宕机不能接受数据丢失，就必须引入 Kafka