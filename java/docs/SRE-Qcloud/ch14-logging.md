# 第14章 腾讯云 CLS 日志服务实战

## 14.1 概述

日志是系统运行状态的"黑匣子"。在微服务架构和容器化部署成为主流的今天，一个中等规模的业务系统每天产生的日志量可达 TB 级别。如何高效地采集、存储、检索和分析海量日志，是 SRE 团队必须解决的核心问题。

腾讯云日志服务（Cloud Log Service，简称 CLS）是腾讯云提供的一站式日志解决方案。它支持日志的实时采集、结构化处理、高性能检索、SQL 分析、监控告警以及低成本长期存储。本章将从 SRE 的实战视角出发，覆盖 LogListener 部署（DaemonSet 与 Sidecar 模式）、JSON 结构化日志、日志检索与 SQL 分析、日志告警以及成本控制等核心主题，并结合 LogConfig YAML 和 Logback XML 配置给出可直接落地的方案。

## 14.2 LogListener 部署：DaemonSet 与 Sidecar 模式

LogListener 是 CLS 的日志采集客户端，负责从服务器、容器或云产品中采集日志并上报到 CLS 后端。在 Kubernetes 环境下，LogListener 有两种主流部署模式：DaemonSet 和 Sidecar。

### 14.2.1 DaemonSet 模式

DaemonSet 模式在每个 Kubernetes 节点上部署一个 LogListener Pod，该 Pod 通过挂载宿主机目录（如 `/var/log/containers/`）来采集节点上所有容器的日志。这是最常用的模式，资源占用低，管理简单。

**优点：**
- 每个节点仅需一个 LogListener 实例，资源开销小
- 新增 Pod 自动被采集，无需额外配置
- 集中管理采集规则，运维成本低

**缺点：**
- 日志与容器生命周期解耦，容器重启后日志仍可追溯
- 多行日志（如 Java 异常堆栈）需要特殊处理
- 无法采集容器内特定路径的日志（如应用写往 `/data/app/logs/` 的日志）

以下是一个典型的 DaemonSet 部署 YAML：

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: loglistener
  namespace: cls
  labels:
    app: loglistener
spec:
  selector:
    matchLabels:
      app: loglistener
  template:
    metadata:
      labels:
        app: loglistener
    spec:
      containers:
        - name: loglistener
          image: ccr.ccs.tencentyun.com/cls/loglistener:latest
          env:
            - name: CLS_SECRET_ID
              valueFrom:
                secretKeyRef:
                  name: cls-secret
                  key: secret_id
            - name: CLS_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: cls-secret
                  key: secret_key
            - name: CLS_REGION
              value: "ap-guangzhou"
          resources:
            limits:
              cpu: "1"
              memory: 1Gi
            requests:
              cpu: "0.3"
              memory: 256Mi
          volumeMounts:
            - name: container-log
              mountPath: /var/log/containers
            - name: pod-log
              mountPath: /var/log/pods
            - name: docker-log
              mountPath: /var/lib/docker/containers
            - name: cls-config
              mountPath: /etc/loglistener
      volumes:
        - name: container-log
          hostPath:
            path: /var/log/containers
        - name: pod-log
          hostPath:
            path: /var/log/pods
        - name: docker-log
          hostPath:
            path: /var/lib/docker/containers
        - name: cls-config
          configMap:
            name: loglistener-config
```

对应的 ConfigMap 用于定义采集规则：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: loglistener-config
  namespace: cls
data:
  loglistener.conf: |
    {
      "agent": {
        "region": "ap-guangzhou",
        "log_level": "info",
        "send_retry": 3,
        "batch_size": 1048576,
        "batch_count": 4096,
        "max_batch_wait": 3
      },
      "logs": {
        "inputs": [
          {
            "type": "container_file",
            "container_file": {
              "auto_match": true,
              "k8s_namespace_regex": "^(production|staging)-.*",
              "exclude_container_regex": "^loglistener$",
              "metadata": {
                "enable_k8s_metadata": true
              }
            }
          }
        ]
      }
    }
```

### 14.2.2 Sidecar 模式

Sidecar 模式在每个业务 Pod 中额外运行一个 LogListener 容器，与业务容器共享存储卷。这种模式适用于需要采集容器内特定路径日志的场景。

**优点：**
- 可以精确控制每个 Pod 的采集路径和解析规则
- 日志采集与业务容器同生命周期，随 Pod 启停
- 支持采集容器内任意路径的日志文件

**缺点：**
- 每个 Pod 额外消耗资源（约 128MB 内存 + 0.1 核 CPU）
- 管理成本高，更新 LogListener 需要重建所有 Pod

Sidecar 模式通常在业务 Deployment 中直接注入 LogListener 容器：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: order-service
          image: myapp/order-service:latest
          volumeMounts:
            - name: log-volume
              mountPath: /data/app/logs
        - name: loglistener
          image: ccr.ccs.tencentyun.com/cls/loglistener:latest
          env:
            - name: CLS_SECRET_ID
              valueFrom:
                secretKeyRef:
                  name: cls-secret
                  key: secret_id
            - name: CLS_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: cls-secret
                  key: secret_key
            - name: CLS_REGION
              value: "ap-guangzhou"
          volumeMounts:
            - name: log-volume
              mountPath: /data/app/logs
              readOnly: true
      volumes:
        - name: log-volume
          emptyDir: {}
```

### 14.2.3 选型建议

| 维度 | DaemonSet | Sidecar |
|------|-----------|---------|
| 资源开销 | 低（每节点一个） | 高（每 Pod 一个） |
| 管理复杂度 | 低 | 高 |
| 采集灵活性 | 受限（标准路径） | 灵活（任意路径） |
| 适用场景 | 标准容器 stdout/stderr | 应用写文件、特殊路径 |

**建议：** 优先使用 DaemonSet 模式采集标准输出日志，仅在需要采集容器内特定文件路径时使用 Sidecar。也可以两者结合——DaemonSet 负责标准输出，Sidecar 仅用于有特殊需求的 Pod。

## 14.3 JSON 结构化日志

非结构化日志（如纯文本）在检索时效率低下，难以进行精确的字段过滤和聚合分析。CLS 原生支持 JSON 格式的结构化日志，采集后自动解析每个 JSON 字段，用户可以直接按字段名检索。

### 14.3.1 Logback 配置：输出 JSON 格式日志

Java 应用最常用的日志框架是 Logback。通过引入 `logstash-logback-encoder` 依赖，可以轻松输出 JSON 格式的日志。

**Maven 依赖：**

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

**logback-spring.xml 配置：**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <springProperty scope="context" name="appName" source="spring.application.name"/>
    <springProperty scope="context" name="env" source="spring.profiles.active"/>

    <appender name="CLS_JSON" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>/data/app/logs/${appName}.json.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>/data/app/logs/${appName}.json.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxHistory>3</maxHistory>
            <timeBasedFileNamingAndTriggeringPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedFNATP">
                <maxFileSize>500MB</maxFileSize>
            </timeBasedFileNamingAndTriggeringPolicy>
        </rollingPolicy>
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <includeContext>false</includeContext>
            <customFields>{"app":"${appName}","env":"${env}","team":"sre"}</customFields>
            <fieldNames>
                <timestamp>@timestamp</timestamp>
                <message>message</message>
                <level>level</level>
                <logger>logger</logger>
                <thread>thread</thread>
            </fieldNames>
        </encoder>
    </appender>

    <appender name="ASYNC_CLS_JSON" class="ch.qos.logback.classic.AsyncAppender">
        <queueSize>8192</queueSize>
        <discardingThreshold>0</discardingThreshold>
        <neverBlock>true</neverBlock>
        <appender-ref ref="CLS_JSON"/>
    </appender>

    <root level="INFO">
        <appender-ref ref="ASYNC_CLS_JSON"/>
    </root>
</configuration>
```

**关键配置说明：**

- `customFields`：注入固定字段（应用名、环境、团队），便于在 CLS 中按维度过滤
- `fieldNames`：自定义 JSON 字段名，与 CLS 索引配置对齐
- `AsyncAppender`：异步写入，避免日志 I/O 阻塞业务线程
- `rollingPolicy`：按天和大小滚动，本地保留 3 天，防止磁盘写满

### 14.3.2 输出示例

配置生效后，日志行将呈现为如下 JSON 格式：

```json
{
  "@timestamp": "2026-06-28T10:30:15.123+08:00",
  "level": "ERROR",
  "logger": "com.example.order.OrderService",
  "thread": "http-nio-8080-exec-3",
  "message": "订单支付失败",
  "app": "order-service",
  "env": "production",
  "team": "sre",
  "traceId": "a1b2c3d4e5f6g7h8",
  "userId": "u_10086",
  "orderId": "ORD20260628103015",
  "amount": 299.00,
  "stack_trace": "java.lang.RuntimeException: 余额不足\n\tat com.example.order.OrderService.pay(OrderService.java:85)\n\tat ..."
}
```

### 14.3.3 CLS 索引配置

要让 CLS 正确解析 JSON 字段，需要在日志主题的索引配置中开启"键值索引"并添加字段。CLS 支持自动识别 JSON 结构，但建议手动配置索引以保证字段类型准确：

| 字段名 | 类型 | 分词符 | 说明 |
|--------|------|--------|------|
| `@timestamp` | text | 空 | 日志时间 |
| `level` | keyword | 无 | 日志级别 |
| `message` | text | 空格+标点 | 日志正文 |
| `logger` | keyword | 无 | 类名 |
| `app` | keyword | 无 | 应用名 |
| `env` | keyword | 无 | 环境 |
| `traceId` | keyword | 无 | 链路追踪 ID |
| `userId` | keyword | 无 | 用户 ID |
| `orderId` | keyword | 无 | 订单 ID |
| `amount` | double | 无 | 金额 |
| `stack_trace` | text | 空格+标点 | 异常堆栈 |

### 14.3.4 结构化日志的最佳实践

1. **统一字段命名规范**：全团队约定字段命名风格（推荐 camelCase），避免混用 `user_id`、`userId`、`user-id`
2. **必选字段**：`@timestamp`、`level`、`message`、`app`、`env`、`traceId`
3. **业务字段**：将与排障相关的业务上下文（订单 ID、用户 ID、请求参数）写入日志
4. **避免敏感信息**：不得输出密码、身份证号、银行卡号等敏感数据，必要时脱敏处理
5. **控制单行大小**：单行日志建议不超过 10KB，过大的日志会影响采集和检索性能

## 14.4 日志检索与 SQL 分析

CLS 提供两种查询方式：关键词检索（类似 grep）和 SQL 分析（类似数据库查询）。两者可以组合使用，先通过检索缩小数据范围，再通过 SQL 进行聚合分析。

### 14.4.1 关键词检索语法

CLS 检索语法支持以下操作：

| 语法 | 示例 | 说明 |
|------|------|------|
| 精确短语 | `"订单支付失败"` | 双引号包裹表示精确匹配 |
| 字段精确匹配 | `level:ERROR` | 字段名:值 |
| 字段模糊匹配 | `message:"支付*"` | `*` 匹配任意字符 |
| 多条件 AND | `level:ERROR AND app:order-service` | 默认即 AND |
| 多条件 OR | `level:ERROR OR level:WARN` | 显式 OR |
| 排除 | `level:ERROR NOT message:"健康检查"` | NOT 排除 |
| 范围 | `amount:[100 TO 500]` | 数值范围 |
| 存在性 | `_exists_:traceId` | 字段存在 |
| 嵌套 | `(level:ERROR OR level:FATAL) AND amount:>1000` | 括号分组 |

**常用检索场景示例：**

```
# 查询 order-service 最近 1 小时的 ERROR 日志
app:order-service AND level:ERROR

# 查询特定用户的错误日志
userId:u_10086 AND level:ERROR

# 查询支付金额超过 1000 的订单失败日志
message:"支付失败" AND amount:>1000

# 排除健康检查日志
level:ERROR NOT message:"health" NOT message:"heartbeat"
```

### 14.4.2 SQL 分析

CLS 支持使用 SQL 对检索结果进行聚合分析。SQL 分析在 CLS 的"日志分析"页面中执行，语法兼容标准 SQL 的子集。

**基础语法结构：**

```sql
SELECT 字段1, 聚合函数(字段2)
FROM 日志主题
WHERE 检索条件
GROUP BY 字段1
ORDER BY 聚合值 DESC
LIMIT N
```

**常用分析场景：**

**1. 错误分布统计**

```sql
SELECT
  app,
  level,
  COUNT(*) AS error_count
FROM cls_topic
WHERE
  level IN ('ERROR', 'FATAL')
  AND __TIMESTAMP__ > NOW() - INTERVAL 1 HOUR
GROUP BY app, level
ORDER BY error_count DESC
```

**2. 接口错误率排行**

```sql
SELECT
  logger,
  COUNT(*) AS total,
  SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) AS errors,
  ROUND(SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate
FROM cls_topic
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 DAY
  AND app = 'order-service'
GROUP BY logger
HAVING total > 100
ORDER BY error_rate DESC
LIMIT 20
```

**3. P99 响应时间分析（需在日志中输出耗时字段）**

```sql
SELECT
  logger,
  APPROX_PERCENTILE(duration, 0.5) AS p50,
  APPROX_PERCENTILE(duration, 0.9) AS p90,
  APPROX_PERCENTILE(duration, 0.99) AS p99,
  MAX(duration) AS max
FROM cls_topic
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 HOUR
  AND app = 'order-service'
GROUP BY logger
```

**4. 按分钟统计错误趋势**

```sql
SELECT
  date_trunc('minute', __TIMESTAMP__) AS minute,
  COUNT(*) AS error_count
FROM cls_topic
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 HOUR
  AND level = 'ERROR'
  AND app = 'order-service'
GROUP BY minute
ORDER BY minute ASC
```

**5. Top-N 错误用户**

```sql
SELECT
  userId,
  COUNT(*) AS error_count
FROM cls_topic
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 DAY
  AND level = 'ERROR'
  AND _exists_:userId
GROUP BY userId
ORDER BY error_count DESC
LIMIT 10
```

**6. 慢查询日志分析**

```sql
SELECT
  message,
  COUNT(*) AS occur_count,
  AVG(duration) AS avg_duration,
  MAX(duration) AS max_duration
FROM cls_topic
WHERE
  __TIMESTAMP__ > NOW() - INTERVAL 1 DAY
  AND app = 'order-service'
  AND duration > 1000
GROUP BY message
ORDER BY occur_count DESC
LIMIT 20
```

### 14.4.3 检索与 SQL 分析的最佳实践

1. **先过滤再聚合**：SQL 分析前先用检索条件缩小数据范围，减少扫描量，提升查询速度并降低成本
2. **合理设置时间范围**：CLS 按扫描数据量计费，缩小时间范围可以显著降低成本
3. **避免 `SELECT *`**：只查询需要的字段，减少数据传输量
4. **使用近似函数**：`APPROX_PERCENTILE` 比精确计算快数十倍，误差在 1% 以内
5. **预聚合**：对于频繁查询的指标（如每分钟错误数），使用 CLS 的仪表盘或定时 SQL 任务预聚合结果

## 14.5 日志告警

CLS 支持基于日志内容的告警。当日志中匹配到特定模式或聚合指标超过阈值时，自动通过通知渠道（邮件、企业微信、钉钉、Webhook 等）发送告警。

### 14.5.1 告警配置步骤

1. **创建告警策略**：在 CLS 控制台进入"告警 > 告警策略"，点击新建
2. **配置告警规则**：编写检索语句和 SQL 分析语句，设置触发条件
3. **设置评估周期**：如每 1 分钟执行一次
4. **配置通知**：选择通知渠道和接收人

### 14.5.2 典型告警规则

**规则一：5 分钟内 ERROR 日志超过 100 条**

```
检索语句：level:ERROR AND app:order-service
SQL 分析：SELECT COUNT(*) AS error_count
触发条件：error_count > 100
评估周期：1 分钟
持续周期：2 个周期
```

**规则二：接口错误率超过 5%**

```
检索语句：app:order-service
SQL 分析：
  SELECT
    ROUND(
      SUM(CASE WHEN level='ERROR' THEN 1 ELSE 0 END) * 100.0 /
      NULLIF(COUNT(*), 0), 2
    ) AS error_rate
触发条件：error_rate > 5
评估周期：1 分钟
持续周期：3 个周期
```

**规则三：特定错误码出现**

```
检索语句：message:"订单支付失败" AND app:order-service
SQL 分析：SELECT COUNT(*) AS fail_count
触发条件：fail_count > 0
评估周期：1 分钟
持续周期：1 个周期
```

### 14.5.3 告警通知模板

CLS 告警通知支持自定义模板，建议包含以下信息：

```
【告警级别】{{ .AlarmLevel }}
【告警名称】{{ .AlarmName }}
【触发时间】{{ .TriggerTime }}
【应用】order-service
【环境】production
【当前值】{{ .TriggerCondition.CurrentValue }}
【阈值】{{ .TriggerCondition.Threshold }}
【检索语句】{{ .Query }}
【告警详情】
{{ .AlarmDetail }}
```

### 14.5.4 告警最佳实践

1. **分级告警**：ERROR 日志量突增设为 P0 告警（即时通知），WARN 日志量设为 P2 告警（日汇总）
2. **避免告警风暴**：设置持续周期（如连续 3 个周期都触发才告警），防止抖动导致频繁通知
3. **告警去重**：相同告警在静默期内不再重复发送
4. **通知到人**：配置值班表，确保告警能触达当前值班人员
5. **告警自愈**：对于已知的故障模式，配置 Webhook 触发自动化恢复流程

## 14.6 日志成本控制

CLS 的计费主要包括三部分：**写入量**（采集上报的数据量）、**存储量**（日志在 CLS 中的存储空间）和**检索量**（SQL 分析扫描的数据量）。如果不加控制，日志成本可能迅速膨胀。

### 14.6.1 成本构成分析

| 计费项 | 计费方式 | 典型单价 | 优化空间 |
|--------|----------|----------|----------|
| 写入量 | 每 GB 计费 | 0.5 元/GB/月 | 大 |
| 存储量 | 每 GB/天计费 | 0.011 元/GB/天 | 中 |
| 检索量 | 每 GB 扫描量计费 | 0.15 元/GB/次 | 大 |

以一个日写入 100GB 日志的中型业务为例，月成本估算：

- 写入：100GB × 30 天 × 0.5 元 = 1500 元
- 存储（保留 30 天）：平均 50GB × 30 天 × 0.011 元 × 30 天 = 495 元
- 检索（假设每天 10 次全量扫描）：100GB × 10 次 × 30 天 × 0.15 元 = 4500 元

**检索量往往是最大的成本来源。**

### 14.6.2 成本优化策略

**1. 控制日志写入量**

- **日志分级采样**：ERROR 日志全量采集，WARN 日志采样 50%，INFO 日志采样 10%，DEBUG 日志不采集
- **过滤健康检查日志**：在 LogListener 配置中排除健康检查、心跳等噪音日志
- **合并小日志**：高频短日志（如每秒一次的统计日志）合并为批量输出
- **压缩敏感字段**：长字段（如 SQL 语句）用哈希值替代

LogListener 过滤配置示例：

```yaml
# 在采集配置中排除健康检查日志
"container_file": {
  "auto_match": true,
  "log_filters": [
    {
      "key": "message",
      "regex": "health|heartbeat|status_check",
      "action": "exclude"
    }
  ]
}
```

**2. 分级存储策略**

CLS 支持将日志数据在不同存储层之间转换：

| 存储层 | 适用场景 | 单价 | 检索能力 |
|--------|----------|------|----------|
| 标准存储 | 近期日志（1-7 天） | 高 | 全文检索 + SQL |
| 低频存储 | 中期日志（7-30 天） | 中 | 仅关键词检索 |
| 归档存储 | 长期日志（30 天+） | 低 | 需解冻后检索 |

建议配置：

```
第 1-3 天：标准存储（用于实时排障）
第 4-15 天：低频存储（用于趋势分析）
第 16-90 天：归档存储（用于合规审计）
90 天后：自动删除
```

**3. 降低检索成本**

- **缩小时间范围**：每次查询尽量缩小时间窗口，避免扫描全量数据
- **先过滤再分析**：在 SQL 的 WHERE 条件中尽量使用索引字段（keyword 类型）过滤
- **使用仪表盘缓存**：将常用查询保存为仪表盘，CLS 会缓存结果，避免重复扫描
- **避免 SELECT \***：只查询需要的字段

**4. 设置日志额度**

在 CLS 控制台可以为每个日志主题设置写入额度（Quota），超过额度的日志会被丢弃或延迟处理。这可以作为成本控制的"安全阀"。

### 14.6.3 成本监控

建议在 CLS 中创建成本监控仪表盘：

```sql
-- 按日志主题统计日写入量
SELECT
  topic_id,
  date_trunc('day', __TIMESTAMP__) AS day,
  ROUND(SUM(__RAW_SIZE__) / 1024 / 1024 / 1024, 2) AS write_gb
FROM cls_metric
WHERE __TIMESTAMP__ > NOW() - INTERVAL 30 DAY
GROUP BY topic_id, day
ORDER BY day DESC

-- 按应用统计日志量排行
SELECT
  app,
  ROUND(SUM(__RAW_SIZE__) / 1024 / 1024 / 1024, 2) AS total_gb,
  COUNT(*) AS log_lines
FROM cls_topic
WHERE __TIMESTAMP__ > NOW() - INTERVAL 1 DAY
GROUP BY app
ORDER BY total_gb DESC
```

同时设置成本告警：当日写入量超过预估预算的 80% 时触发通知。

## 14.7 LogConfig YAML 完整示例

在通过 CLS 控制台或 API 创建采集配置时，底层使用 LogConfig 资源。以下是一个完整的 LogConfig YAML 示例，展示了 JSON 结构化日志的采集配置：

```yaml
apiVersion: cls.tencentcloud.com/v1
kind: LogConfig
metadata:
  name: order-service-json
  namespace: cls
spec:
  topicId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  logType: json
  extractRule:
    # JSON 模式无需配置提取规则，自动解析
    isJson: true
    # 时间字段解析
    timeKey: "@timestamp"
    timeFormat: "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
    # 过滤规则
    filterRule:
      - key: level
        regex: ^(ERROR|WARN|INFO)$
        action: keep
      - key: message
        regex: health
        action: exclude
    # 元数据标签
    metaTags:
      - key: source
        value: kubernetes
      - key: team
        value: sre
  # 采集路径
  inputType: container_file
  containerFile:
    containerName: order-service
    namespaceRegex: ^production$
    podNameRegex: ^order-service-.*
    logPath: /data/app/logs/*.json.log
    # 多行处理（Java 异常堆栈）
    multiLine:
      mode: json_value
      key: stack_trace
  # 存储配置
  storage:
    hotPeriod: 3          # 标准存储天数
    coldPeriod: 15         # 低频存储天数
    archivePeriod: 90      # 归档存储天数
  # 写入额度
  quota:
    enable: true
    dailyLimit: 50GB
```

## 14.8 完整实战：从采集到告警

本节以一个 Java 微服务 `order-service` 为例，串联从日志采集到告警的完整流程。

### 14.8.1 环境信息

| 项目 | 值 |
|------|-----|
| 应用 | order-service |
| 环境 | production |
| 集群 | TKE（腾讯云容器服务） |
| 日志框架 | Logback + logstash-logback-encoder |
| 采集模式 | DaemonSet |
| CLS 地域 | ap-guangzhou |

### 14.8.2 步骤一：应用接入 JSON 日志

在 `order-service` 中引入依赖并配置 logback-spring.xml（见 14.3.1 节），确保日志输出为 JSON 格式并包含 `traceId`、`userId`、`orderId` 等业务字段。

### 14.8.3 步骤二：创建 CLS 日志主题

在 CLS 控制台创建日志主题，记录 topicId。配置索引，添加 JSON 字段映射。

### 14.8.4 步骤三：部署 LogListener

使用 DaemonSet 部署 LogListener（见 14.2.1 节），配置采集规则匹配 `order-service` 的日志文件。

### 14.8.5 步骤四：验证采集

在 CLS 控制台的"检索分析"页面执行：

```
app:order-service AND env:production
```

确认日志已成功采集并正确解析 JSON 字段。

### 14.8.6 步骤五：配置告警

创建告警策略，当 `order-service` 的 ERROR 日志在 5 分钟内超过 50 条时，通过企业微信通知值班人员。

### 14.8.7 步骤六：创建仪表盘

在 CLS 仪表盘中添加以下图表：

1. **错误趋势图**：按分钟统计 ERROR 日志数量
2. **错误分布饼图**：按 logger 统计错误分布
3. **Top-10 错误接口**：按错误次数排序
4. **日志量趋势**：按天统计日志写入量（用于成本监控）

## 14.9 常见问题与排障

### 14.9.1 日志采集延迟高

**可能原因：**
- LogListener 资源不足（CPU/内存）
- 网络带宽瓶颈
- 日志主题写入 QPS 达到上限

**排查方法：**
```bash
# 查看 LogListener 日志
kubectl logs -n cls loglistener-xxxxx

# 检查 LogListener 资源使用
kubectl top pod -n cls -l app=loglistener

# 检查 LogListener 指标（CLS 控制台提供采集延迟指标）
```

### 14.9.2 JSON 字段未解析

**可能原因：**
- 日志主题的索引配置未开启键值索引
- JSON 格式不合法（如单引号代替双引号、末尾多余逗号）
- 日志行超过 CLS 单行大小限制（1MB）

**排查方法：**
在 CLS 检索页面查看原始日志（Raw Log），确认 JSON 是否完整。

### 14.9.3 多行日志（异常堆栈）被截断

**解决方案：**
- JSON 模式下，将 `stack_trace` 字段配置为多行模式
- 非 JSON 模式下，在 LogListener 配置中设置多行正则匹配（如以空格或 Tab 开头的行为续行）

### 14.9.4 日志重复采集

**可能原因：**
- DaemonSet 和 Sidecar 同时采集同一份日志
- 采集路径配置了通配符，匹配到多个文件

**排查方法：**
检查 LogListener 配置中的 `exclude_container_regex` 和日志路径是否精确。

## 14.10 本章小结

本章从 SRE 的实战角度出发，系统性地介绍了腾讯云 CLS 日志服务的核心功能与最佳实践：

1. **LogListener 部署**：DaemonSet 模式适合大多数场景，Sidecar 模式用于特殊需求，两者可结合使用
2. **JSON 结构化日志**：通过 Logback + logstash-logback-encoder 输出结构化日志，配合 CLS 的键值索引实现高效检索
3. **日志检索与 SQL 分析**：关键词检索用于快速定位，SQL 分析用于聚合统计，两者组合使用效果最佳
4. **日志告警**：基于日志内容的告警是故障发现的第一道防线，合理配置告警规则和通知渠道至关重要
5. **成本控制**：日志成本可能超出预期，需要从写入量、存储分级、检索优化三个维度持续治理

日志系统的建设不是一次性工作，而是一个持续优化的过程。建议 SRE 团队定期审视日志量、检索模式和告警效果，不断调整策略，在"看得清"和"花得少"之间找到最佳平衡点。
