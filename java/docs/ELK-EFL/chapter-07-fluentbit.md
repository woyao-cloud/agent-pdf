# 第7章 方案 C：云原生标配（Fluent Bit 边缘采集）

## 本章导读

在 K8s 环境中，每个 Pod 的输出日志最终会写到宿主机的某个路径下。Filebeat 需要读取这些文件并跟踪文件轮转——这本身没什么问题。但当一个 Pod 被销毁后，它的日志文件也被删除了。Filebeat 的 registry 中记录了一个"已删除文件"的记录，如果不处理，registry 会不断膨胀；如果处理（`clean_removed: true`），则可能丢失数据。

Fluent Bit 是专为容器化环境设计的解决方案。它由 C 语言编写（不是 Go，不是 Java），内存占用仅 3-50MB。更重要的是，它原生支持 Kubernetes 元数据——自动将 Pod 名称、命名空间、标签等附加到每条日志记录中。在 K8s 中，这是 Filebeat 无法比拟的优势。

---

## 7.1 为什么 K8s 环境首选 Fluent Bit

### Fluent Bit vs Filebeat 在 K8s 中的对比

```
部署模式对比：

  Filebeat in K8s（DaemonSet）：
  ┌────────────────────────────────────────────────────┐
  │  K8s Worker Node                                    │
  │  ┌──────────────────────────────────────────────┐  │
  │  │  Filebeat Pod（DaemonSet）                     │  │
  │  │  内存: 30-50MB                                │  │
  │  │  读取 /var/log/containers/*.log               │  │
  │  │  需要 add_kubernetes 处理器来获取 Pod 元数据    │  │
  │  └──────────────────────────────────────────────┘  │
  │  ┌────────┐ ┌────────┐ ┌────────┐                 │
  │  │ Pod A  │ │ Pod B  │ │ Pod C  │                 │
  │  └────────┘ └────────┘ └────────┘                 │
  └────────────────────────────────────────────────────┘

  Fluent Bit in K8s（DaemonSet）：
  ┌────────────────────────────────────────────────────┐
  │  K8s Worker Node                                    │
  │  ┌──────────────────────────────────────────────┐  │
  │  │  Fluent Bit Pod（DaemonSet）                   │  │
  │  │  内存: 5-20MB                                 │  │
  │  │  ← 原生 K8s 过滤器，自动追加 Pod 元数据         │  │
  │  │  ← 不需要额外的处理器配置                       │  │
  │  └──────────────────────────────────────────────┘  │
  │  ┌────────┐ ┌────────┐ ┌────────┐                 │
  │  │ Pod A  │ │ Pod B  │ │ Pod C  │                 │
  │  └────────┘ └────────┘ └────────┘                 │
  └────────────────────────────────────────────────────┘

  关键差异：
  Filebeat 需要额外配置 add_kubernetes 处理器
  Fluent Bit 内置 K8s 过滤器，一行配置即可
  Fluent Bit 的内存占用是 Filebeat 的 1/3 到 1/5
```

### DaemonSet 部署 Fluent Bit

```yaml
# fluent-bit-ds.yaml —— K8s DaemonSet 部署
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logging
  labels:
    app: fluent-bit
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      serviceAccountName: fluent-bit
      containers:
      - name: fluent-bit
        image: cr.fluentbit.io/fluent/fluent-bit:2.2
        imagePullPolicy: Always
        resources:
          requests:
            cpu: 50m            # 50 毫核
            memory: 20Mi        # 20MB 内存
          limits:
            cpu: 200m
            memory: 100Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
        - name: fluentbit-config
          mountPath: /fluent-bit/etc/
        - name: fluentbit-storage
          mountPath: /fluent-bit/output
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: fluentbit-config
        configMap:
          name: fluent-bit-config
      - name: fluentbit-storage
        hostPath:
          path: /var/log/flb-storage  # 文件缓冲持久化
      terminationGracePeriodSeconds: 10
      tolerations:
      - operator: Exists              # 在所有节点上运行（包括 control plane）
```

---

## 7.2 核心配置：fluent-bit.conf

```ini
# fluent-bit.conf —— 生产级 Fluent Bit 配置

[SERVICE]
    # Flush 间隔（每秒发送一次）
    flush                    1

    # 日志级别
    log_level                info

    # 启用文件系统缓冲（防丢数据）
    storage.path             /fluent-bit/output
    storage.sync             normal
    storage.checksum         off
    storage.backlog.mem_limit 50M

    # HTTP 监控接口
    HTTP_Server              On
    HTTP_Listen              0.0.0.0
    HTTP_Port                2020

# ===== 输入：读取容器日志文件 =====
[INPUT]
    Name              tail
    Tag               kube.*
    Path              /var/log/containers/*.log
    Parser            docker            # 使用 Docker 日志格式解析
    DB                /var/log/flb_kube.db  # 记录读取位置
    Mem_Buf_Limit     50MB
    Skip_Long_Lines   On
    Refresh_Interval  10

# ===== 解析器：JSON 解析 =====
[PARSER]
    Name        docker
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L

# ===== 过滤器：K8s 元数据 =====
[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Kube_Tag_Prefix     kube.var.log.containers.
    Merge_Log           On            # 自动解析 JSON 格式的日志
    Merge_Log_Key       log_parsed    # 解析后的 JSON 存入此字段
    Keep_Log            Off           # 解析后删除原始 message 字段
    Annotations         Off           # 不追加 Pod 注解（节省空间）
    Labels              On            # 追加 Pod 标签

# ===== 过滤器：字段清理 =====
[FILTER]
    Name                modify
    Match               kube.*
    Remove              stream
    Remove              docker_id
    Remove              container_id

# ===== 输出：发送到 Elasticsearch =====
[OUTPUT]
    Name                es
    Match               kube.*
    Host                ${ES_HOST}
    Port                ${ES_PORT}
    Index               k8s-logs-%Y.%m.%d
    Type                _doc
    Generate_ID         On

    # 批量写入配置
    Buffer_Size         1MB
    Flush_Size          2048

    # 重试
    Retry_Limit         6
```

---

## 7.3 Fluent Bit Lua 脚本

```lua
-- filters/redact.lua —— 敏感信息脱敏

function redact(tag, timestamp, record)
    -- 递归处理消息字段中的敏感信息
    if record["log_parsed"] then
        local msg = record["log_parsed"]["message"]
        if msg then
            -- 手机号脱敏：13812341234 → 138****1234
            msg = string.gsub(msg, "(1[3-9]%d)%d%d%d%d(%d%d%d%d)", "%1****%2")
            -- 身份证脱敏
            msg = string.gsub(msg, "(%d{6})%d%d%d%d%d%d%d%d(%d{4})", "%1********%2")
            record["log_parsed"]["message"] = msg
        end
    end
    return true, timestamp, record
end
```

```ini
# 在 fluent-bit.conf 中引用 Lua 脚本
[FILTER]
    Name    lua
    Match   kube.*
    script  /fluent-bit/scripts/redact.lua
    call    redact
```

---

## 7.4 缓冲层次与持久化

```
Fluent Bit 的两级缓冲：

  第 1 级：内存缓冲（Mem_Buf_Limit）
  ┌────────────────────────────────────────────┐
  │  默认：每个 INPUT 插件最多使用 50MB 内存    │
  │  达到上限后：                              │
  │  → 没有 storage.type=filesystem → 丢弃数据│
  │  → 有 storage.type=filesystem → 写入磁盘  │
  └────────────────────────────────────────────┘

  第 2 级：文件系统缓冲（Storage）
  ┌────────────────────────────────────────────┐
  │  路径：/fluent-bit/output                  │
  │  作用：当 ES 不可用时，缓冲数据到磁盘       │
  │  配置：storage.path + storage.sync         │
  │  注意：必须挂载 hostPath 卷才能持久化      │
  └────────────────────────────────────────────┘
```

---

## 本章总结

```yaml
Fluent Bit 核心优势：
  - 内存占用小（5-20MB），适合 K8s 容器化部署
  - 原生 K8s 过滤器，自动追加 Pod 元数据
  - 两级缓冲（内存 + 文件系统），防止数据丢失

适用场景：K8s 环境、资源受限的容器环境
不适用场景：需要复杂数据清洗（应该用 Logstash）
```