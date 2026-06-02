# 第5章 方案 A：轻量级直连（Filebeat -> Elasticsearch）

## 本章导读

在开始部署 Filebeat 之前，先想一个问题：Filebeat 是怎么知道日志文件的哪一行是"新"的？重启后它怎么知道从哪继续读？

答案藏在 Filebeat 的 `registry` 文件中。每读取一个文件，Filebeat 都会在这个 registry 文件里记录"这个文件的 inode、路径、当前读取到哪个位置（offset）"。重启后，Filebeat 读取 registry，找到每个文件对应的 offset，从那里继续读——**不重复、不遗漏**。

但问题是：如果日志文件被轮转了（`app.log` → `app.log.1`，新的 `app.log` 被创建），Filebeat 怎么处理？如果 registry 文件损坏了，Filebeat 会怎么做——从头开始读（数据重复）？还是跳过这个文件（数据丢失）？

这些问题决定了 Filebeat 的可靠性。不理解 registry 的工作原理，就可能在日志轮转场景下丢失数据。本章从 Filebeat 的内部机制开始讲解，然后给出生产级配置和典型问题处理。

---

## 5.1 Filebeat 的 Harvester 与 Spooler 机制

```
Filebeat 的内部架构（三个核心组件）：

  ┌──────────────────────────────────────────────────────────┐
  │  Input（输入）                                            │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │  扫描文件系统，查找匹配 paths 的文件                │ │
  │  │  对新文件启动 Harvester                            │ │
  │  │  对轮转的文件（app.log → app.log.1）做标记          │ │
  │  └────────────────────────────────────────────────────┘ │
  │                            │                             │
  │                            ▼                             │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │  Harvester（收割者）                                 │ │
  │  │  ├── 每个文件对应一个 Harvester                      │ │
  │  │  ├── 打开文件句柄，逐行读取                          │ │
  │  │  ├── 检测文件是否轮转（通过文件 inode）              │ │
  │  │  ├── 将读取的行发送到 Spooler                        │ │
  │  │  └── 更新 Registry 中的 offset                      │ │
  │  └────────────────────────────────────────────────────┘ │
  │                            │                             │
  │                            ▼                             │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │  Spooler + Publisher（输出缓冲 + 发送）              │ │
  │  │  ├── 收集 Harvester 发送来的事件                    │ │
  │  │  ├── 攒够一批（batch_size）或超时（flush_timeout）   │ │
  │  │  ├── 发送到 Output（ES/Kafka/Logstash）             │ │
  │  │  └── 发送成功后确认（ACK），Harvester 再读下一批     │ │
  │  └────────────────────────────────────────────────────┘ │
  │                            │                             │
  │                            ▼                             │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │  Registry（注册表）                                   │ │
  │  │  文件路径: /usr/share/filebeat/data/registry        │ │
  │  │  记录每条日志文件的:                                 │ │
  │  │  ├── source（文件路径）                               │ │
  │  │  ├── offset（当前读取位置）                           │ │
  │  │  ├── inode（文件 inode 号）                          │ │
  │  │  └── timestamp（最后更新时间）                        │ │
  │  │  作用：重启后继续从上次位置读取，不重复不遗漏          │ │
  │  └────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘
```

### Harvester 如何检测文件轮转

这是 Filebeat 最核心的能力之一。日志文件通常会用 Log4j/Logback 的滚动策略：当文件达到一定大小后，将当前文件重命名为 `app.log.1`，然后创建新的 `app.log`。

```
文件轮转场景（Filebeat 的处理方式）：

  轮转前：
  ┌────────────────────────┐
  │  app.log（正在写入）    │ ← Filebeat 在读这个文件，offset=15000
  └────────────────────────┘

  轮转发生（Logback 将 app.log 重命名为 app.log.1，创建新的 app.log）：

  步骤 1：Filebeat 检测到文件 inode 变化
  ┌────────────────────────┐  ┌────────────────────────┐
  │  app.log.1 (旧数据)    │  │  app.log（新文件）      │
  │  inode=1000            │  │  inode=1001（新的！）   │
  │  offset=15000（已读完）│  │  offset=0             │
  └────────────────────────┘  └────────────────────────┘

  步骤 2：Filebeat 关闭旧文件的 Harvester
          → 旧文件的 registry 记录保留（不再读取）

  步骤 3：Filebeat 发现新文件（inode=1001）
          → 启动新的 Harvester
          → 从 offset=0 开始读取新的 app.log

  结果：数据不丢失，不重复
```

---

## 5.2 核心配置：filebeat.yml

```yaml
# filebeat.yml —— 生产级配置（包含完整注释）

# ===== 输入配置：采集哪些日志文件 =====
filebeat.inputs:
  - type: log
    enabled: true

    # 日志文件路径（支持通配符）
    paths:
      - /var/log/apps/*.log
      - /var/log/apps/*.json

    # JSON 解析配置
    json.keys_under_root: true   # JSON 字段合并到根层级
    json.overwrite_keys: true    # 覆盖 Filebeat 自带字段（如 @timestamp）
    json.add_error_key: true     # 加错时增加 error.message 字段
    json.message_key: message    # 指定 JSON 中的 message 字段

    # 多行日志合并（Java 异常栈）
    multiline:
      type: pattern
      pattern: '^\d{4}-\d{2}-\d{2}'
      negate: true
      match: after
      max_lines: 100
      timeout: 5s

    # 排除的行（如健康检查日志）
    exclude_lines: ['^\[HEALTH_CHECK\]']

    # 标记来源
    fields:
      service: order-service
      env: production
    fields_under_root: true

# ===== Registry 配置 =====
filebeat.registry:
  # 文件清理策略
  clean_removed: false      # 已删除文件的 registry 记录保留（防丢失）
  clean_inactive: 240h      # 10 天没有更新的文件自动清理
  flush: 5s                 # registry 写入磁盘的频率

# ===== 处理器 =====
processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_docker_metadata:
      host: "unix:///var/run/docker.sock"
  - drop_fields:
      fields: ["agent.hostname", "agent.type", "agent.version"]

# ===== 输出到 Elasticsearch =====
output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "app-logs-%{+yyyy.MM.dd}"
  bulk_max_size: 2048
  worker: 4
  # 失败重试
  max_retries: 3

# ===== 日志 =====
logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat.log
  keepfiles: 7
```

---

## 5.3 Filebeat 直连的局限性

```yaml
# 适用场景判断

# ✅ 适合使用 Filebeat -> ES 直连的场景：
# - 服务器数量 < 10 台
# - 日均日志量 < 100GB
# - ES 集群与应用服务器同机房（网络延迟 < 1ms）
# - 可以接受短暂的日志丢失（ES 宕机时）

# ❌ 不适合使用直连的场景：
# - 服务器数量 > 10 台
# - 日均日志量 > 100GB
# - ES 宕机绝对不能丢数据
# - 需要 Logstash 做复杂的数据清洗

# ⚠️ 最关键的限制：ES 宕机时 Filebeat 的缓冲能力有限
# Filebeat 的 Spooler 队列默认只有 4MB × worker 数
# ES 宕机 5 分钟 → Filebeat 队列满 → 停止读取日志文件
# 日志在磁盘上持续增长 → 磁盘满 → 应用跟着挂
```

---

## 本章总结

Filebeat 直连适合小规模场景。它的优势是简单、资源占用低；劣势是缓冲能力有限。当日志量增大或需要复杂数据处理时，应该引入 Kafka + Logstash（见第 6 章）。