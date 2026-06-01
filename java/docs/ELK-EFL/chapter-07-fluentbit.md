# 第7章 方案 C：云原生标配（Fluent Bit 边缘采集）

## 本章导读

在 K8s 环境中，Filebeat 面临一个尴尬问题：每个 Pod 都输出日志到 stdout，然后被 Docker 重定向到文件。Filebeat 需要读取这些文件——但 Pod 销毁后文件也消失了，Filebeat 的 Registry 记录了一个不存在的文件，可能导致数据错乱。

Fluent Bit 是专为容器化环境设计的日志采集器。它由 C 语言编写，内存占用只有 3-50MB（Filebeat 的 1/10），支持直接从 Docker 的守护进程读取日志，完美适配 K8s 环境。

---

## 7.1 为什么 K8s 环境首选 Fluent Bit？

```
Filebeat vs Fluent Bit 在 K8s 环境中的对比：

  Filebeat（Go 语言，内存 30-50MB）：
  优点：配置简单，和 ELK 栈集成最好
  缺点：内存占用高，在 Pod 中部署成本高
       对 K8s 元数据的支持不如 Fluent Bit 丰富

  Fluent Bit（C 语言，内存 3-50MB）：
  优点：内存占用极低，天生适配容器
       内置 K8s 元数据过滤器（自动添加 Pod 名/命名空间/标签）
       支持丰富的 Output：ES、Kafka、S3、Prometheus 等
  缺点：插件生态不如 Logstash 丰富
       复杂的数据处理需要 Lua 脚本

  结论：
  在 K8s 中，Fluent Bit 是事实上的标准选择
  它通常作为 DaemonSet 部署在每个节点上
  采集该节点上所有 Pod 的日志
```

---

## 7.2 核心配置: fluent-bit.conf

```ini
# fluent-bit.conf
# Fluent Bit 配置：采集容器日志 → 发送到 ES（或 Kafka）

[SERVICE]
    # Flush 间隔（每秒 flush 一次）
    flush           1
    
    # 日志级别
    log_level       info
    
    # 是否开启 HTTP 监控
    HTTP_Server     On
    HTTP_Listen     0.0.0.0
    HTTP_Port       2020

# ===== 输入：Docker 控制台日志 =====
[INPUT]
    Name            tail                    # 从文件尾部读取
    Path            /var/log/containers/*.log  # K8s Pod 日志路径
    multiline.parser  docker, cri           # 合并多行日志
    DB              /var/log/flb_kube.db    # 记录处理位置（类似 Filebeat Registry）
    Mem_Buf_Limit   50MB                    # 内存缓冲上限
    Skip_Long_Lines On                      # 跳过超长行

# ===== 过滤器：K8s 元数据 =====
[FILTER]
    Name            kubernetes              # 自动添加 K8s 元数据
    Match           *
    Kube_URL        https://kubernetes.default.svc:443
    Kube_CA_File    /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File /var/run/secrets/kubernetes.io/serviceaccount/token
    Merge_Log       On                      # 自动解析 JSON 日志
    Merge_Log_Key   log_parsed              # 将解析后的日志放入此字段
    K8S-Logging.Parser On

# ===== 过滤器：修改记录 =====
[FILTER]
    Name            modify
    Match           *
    # 删除不必要的字段（减少 ES 存储）
    Remove          stream
    Remove          docker_id
    Remove          container_id
    # 重命名字段
    Rename          log     message

# ===== 输出：发送到 ES =====
[OUTPUT]
    Name            es
    Match           *
    Host            ${ES_HOST}
    Port            ${ES_PORT}
    Index           app-logs-${HOSTNAME}-%Y.%m.%d
    Type            _doc
    Generate_ID     On
    
    # 批量写入
    Buffer_Size     1MB
    Flush_Size      2048
    
    # 重试
    Retry_Limit     6
```

---

## 7.3 Fluent Bit Lua 脚本处理

对于 Fluent Bit 内置 Filter 无法处理的复杂场景，可以用 Lua 脚本扩展：

```lua
-- parsers/redact.lua
-- 用 Lua 脚本实现敏感信息脱敏

function redact_message(tag, timestamp, record)
    -- 脱敏手机号
    if record["message"] then
        local msg = record["message"]
        -- 13812341234 → 138****1234
        msg = string.gsub(msg, "(1[3-9]%d)%d%d%d%d(%d%d%d%d)", "%1****%2")
        record["message"] = msg
    end

    -- 脱敏身份证号
    if record["log_parsed"] and record["log_parsed"]["id_card"] then
        record["log_parsed"]["id_card"] = "******19900101****"
    end

    -- 返回 true 保留记录，返回 false 丢弃
    return true, timestamp, record
end

-- 返回处理后的记录数
return 1
```

```toml
# 在 fluent-bit.conf 中引用 Lua 脚本
[FILTER]
    Name    lua
    Match   *
    script  /fluent-bit/scripts/redact.lua
    call    redact_message
```

---

## 7.4 Fluent Bit 内存缓冲调优

```
Fluent Bit 的缓冲层次：

  内存缓冲 → 文件系统缓冲（可选）→ 输出

  第 1 层：Mem_Buf_Limit（内存缓冲上限）
  ┌────────────────────────────────────────────┐
  │  限制 Fluent Bit 用于缓存日志的内存容量     │
  │  当内存达到上限时，Fluent Bit 的行为：       │
  │  → 如果配置了文件系统缓冲，写入文件缓冲      │
  │  → 如果没有文件缓冲，丢弃最早的数据          │
  │  建议：50MB-100MB（容器环境）               │
  └────────────────────────────────────────────┘

  第 2 层：文件系统缓冲（Storage.type = filesystem）
  ┌────────────────────────────────────────────┐
  │  当输出（ES/Kafka）不可用时                 │
  │  日志先写入磁盘文件                         │
  │  输出恢复后从磁盘文件读取发送             │
  │  ← 这是 Fluent Bit 防丢数据的关键配置       │
  └────────────────────────────────────────────┘
```

```ini
# 文件系统缓冲配置
[SERVICE]
    # 启用文件系统缓冲
    storage.path        /var/log/flb-storage/
    storage.sync        normal
    storage.checksum    on
    storage.backlog.mem_limit 50MB

[INPUT]
    Name    tail
    Path    /var/log/containers/*.log
    # 使用文件系统缓冲（防止输出不可用时丢失数据）
    storage.type    filesystem
    Mem_Buf_Limit   50MB
```

---

## 本章总结

| 对比维度 | Fluent Bit | Filebeat | Logstash |
|---------|-----------|----------|---------|
| **语言** | C | Go | JRuby |
| **内存占用** | 3-50MB | 30-50MB | 500MB-1GB |
| **K8s 集成** | 原生支持 | 需要插件 | 不推荐直接跑在 K8s |
| **数据处理** | Lua 脚本扩展 | 有限 | 插件丰富，能力最强 |
| **适用角色** | **边缘采集（推荐）** | 边缘采集 | 中心处理 |

**核心原则**：
1. **Fluent Bit 是 K8s 环境的第一选择**——它的内存占用和 K8s 元数据支持是 Filebeat 无法比拟的。在 K8s 中，Fluent Bit 通常作为 DaemonSet 部署
2. **Fluent Bit 适合做"边缘采集"而非"中心处理"**——它负责从容器中采集日志并简单处理。复杂的数据清洗（多字段转换、条件路由）应该交给 Logstash 或 Fluentd
3. **文件系统缓冲是防丢数据的关键**——默认 Fluent Bit 只有内存缓冲。开启 `storage.type filesystem` 后，即使 ES 宕机，日志也不会丢失