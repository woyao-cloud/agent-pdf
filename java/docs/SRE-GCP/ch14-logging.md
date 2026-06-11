# 第 14 章 日志管理与分析

## 14.1 为什么日志管理很重要？

### 一个故事：海量日志中的"针"

某团队的应用每天产生 50GB 的日志。一天晚上，支付服务出现了间歇性的失败——大约 5% 的支付请求超时。

On-call 工程师查看日志，输入了"error"关键词——返回了 10 万条结果。他又加了"payment"——还有 3 万条。他一条一条地翻看，试图找到规律。

30 分钟后，他终于发现了一个模式：所有失败的请求都发生在整点后的前 2 分钟内。进一步排查发现，是一个定时任务在整点触发，占用了大量数据库连接，导致支付请求超时。

**如果一开始就用精确的搜索条件，他可能 5 分钟就能定位问题。**

### 日志在 SRE 工作中的角色

日志是 SRE 工作中最常使用的数据源之一：

- **故障排查**：日志告诉你"具体发生了什么错误"
- **趋势分析**：日志告诉你"错误的模式是什么"
- **安全审计**：日志告诉你"谁在什么时候做了什么"
- **业务分析**：日志告诉你"用户的行为模式是什么"

---

## 14.2 结构化日志

### 为什么需要结构化日志？

**非结构化日志（纯文本）：**

```
2025-01-15 10:00:00 User 123 logged in from IP 192.168.1.1
2025-01-15 10:00:01 Order created: ID 45678, amount $150.50
2025-01-15 10:00:02 ERROR: Database connection failed
```

**结构化日志（JSON）：**

```json
{"timestamp": "2025-01-15T10:00:00Z", "severity": "INFO", "event": "user.login", "user_id": 123, "ip": "192.168.1.1", "trace_id": "abc123"}
{"timestamp": "2025-01-15T10:00:01Z", "severity": "INFO", "event": "order.created", "order_id": 45678, "amount": 150.50, "user_id": 123, "trace_id": "abc123"}
{"timestamp": "2025-01-15T10:00:02Z", "severity": "ERROR", "event": "db.connection_failed", "database": "orders_db", "error": "Connection timeout", "trace_id": "def456"}
```

**结构化日志的优势：**

| 维度 | 非结构化日志 | 结构化日志 |
|------|------------|-----------|
| 搜索 | 只能用关键词模糊搜索 | 可以按字段精确搜索 |
| 分析 | 无法自动解析 | 可以自动解析和聚合 |
| 关联 | 难以与其他数据关联 | 通过 trace_id 关联追踪数据 |
| 查询 | 只能全文检索 | 支持 SQL 级别的查询 |

### 如何输出结构化日志

**Python 示例：**

```python
import json
import logging
from datetime import datetime

class StructuredFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": getattr(record, "trace_id", ""),
            "service": getattr(record, "service", "unknown"),
        }
        
        # 包含异常信息（如果有）
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_entry)

# 配置日志
handler = logging.StreamHandler()
handler.setFormatter(StructuredFormatter())
logger = logging.getLogger("payment-service")
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# 使用示例
logger.info("Payment processed", extra={
    "trace_id": "abc123",
    "service": "payment",
    "payment_id": "PAY-789",
    "amount": 150.50,
    "currency": "USD"
})
```

**Go 示例：**

```go
package main

import (
    "encoding/json"
    "log"
    "os"
    "time"
)

type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Severity  string `json:"severity"`
    Message   string `json:"message"`
    Service   string `json:"service"`
    TraceID   string `json:"trace_id"`
    Extra     map[string]interface{} `json:"extra,omitempty"`
}

func structuredLog(severity, message, service, traceID string, extra map[string]interface{}) {
    entry := LogEntry{
        Timestamp: time.Now().UTC().Format(time.RFC3339),
        Severity:  severity,
        Message:   message,
        Service:   service,
        TraceID:   traceID,
        Extra:     extra,
    }
    
    data, _ := json.Marshal(entry)
    log.Println(string(data))
}

func main() {
    structuredLog("INFO", "Payment processed", "payment", "abc123", 
        map[string]interface{}{"payment_id": "PAY-789", "amount": 150.50})
}
```

### 日志字段规范建议

```json
{
  "timestamp": "ISO 8601 时间戳",
  "severity": "DEBUG|INFO|WARNING|ERROR|CRITICAL",
  "message": "人类可读的描述",
  "service": "服务名称",
  "version": "服务版本号",
  "trace_id": "关联追踪 ID",
  "user_id": "用户 ID（如果涉及用户操作）",
  "request_id": "请求 ID",
  "duration_ms": "操作耗时（毫秒）",
  "extra": {
    "其他上下文信息"
  }
}
```

---

## 14.3 高效的日志搜索

### Cloud Logging 的两种搜索方式

**基础过滤器：** 类似搜索引擎的简单搜索。

```bash
# 搜索关键词
gcloud logging read "error"

# 搜索特定级别的日志
gcloud logging read "severity=ERROR"

# 搜索特定时间范围
gcloud logging read "timestamp>=\"2025-01-15T10:00:00Z\""
```

**高级日志查询：** 基于特定语法的进阶搜索。

```bash
# 查找支付服务的所有 ERROR 日志
gcloud logging read "
    resource.type=cloud_run_revision AND
    resource.labels.service_name=payment-service AND
    severity=ERROR
" --limit 100

# 查找特定错误模式的日志
gcloud logging read "
    \"database connection failed\" AND
    severity>=ERROR
" --limit 50

# 按 JSON 字段搜索（结构化日志）
gcloud logging read "
    jsonPayload.event=order.created AND
    jsonPayload.amount>100
"
```

### 排查问题时的高效搜索策略

**第一步：缩小时间范围**

不要搜索"过去 7 天"，而是从问题发生的时间点开始搜索。

```bash
# 搜索过去 30 分钟的日志
gcloud logging read "
    timestamp>=\"2025-01-15T10:30:00Z\" AND
    severity>=ERROR
"
```

**第二步：确定搜索范围**

指定资源类型和服务，不要全局搜索。

```bash
# 只搜索支付服务的日志
gcloud logging read "
    resource.type=cloud_run_revision AND
    resource.labels.service_name=payment-service AND
    severity>=ERROR AND
    \"timeout\"
"
```

**第三步：使用结构化字段搜索**

如果你的日志是结构化格式，按字段搜索比关键词搜索更精确。

```bash
# 按 trace_id 搜索（关联所有相关日志）
gcloud logging read "
    jsonPayload.trace_id=abc123
"

# 搜索特定事件类型的日志
gcloud logging read "
    jsonPayload.event=db.connection_failed AND
    jsonPayload.database=orders_db
"
```

### 在 Logs Explorer 中使用高级过滤器

Cloud Logging 的 Logs Explorer 界面提供了高级过滤器，你可以直接在搜索框中输入查询语法：

```
resource.type="k8s_container"
resource.labels.cluster_name="prod-cluster"
resource.labels.namespace_name="payment"
severity>=ERROR
jsonPayload.trace_id="abc123"
```

---

## 14.4 日志导出策略

### 为什么需要导出日志？

默认情况下，Cloud Logging 会保存日志，但有存储限制和成本。导出日志的原因：

| 原因 | 说明 | 导出目标 |
|------|------|---------|
| 长期存储 | 日志保留超过默认期限 | Cloud Storage |
| 分析查询 | 对历史日志进行 SQL 分析 | BigQuery |
| 实时处理 | 将日志推送到其他系统 | Pub/Sub |
| 合规审计 | 满足监管机构的日志保存要求 | Cloud Storage（不可变存储） |

### 导出到 BigQuery

```bash
# 创建日志导出到 BigQuery
gcloud logging sinks create bigquery-export \
    bigquery.googleapis.com/projects/my-project/datasets/logs_analytics \
    --log-filter="severity>=WARNING"

# 在 BigQuery 中分析日志
```

**BigQuery 查询示例：**

```sql
-- 分析过去 30 天的错误趋势
SELECT
  DATE(timestamp) as date,
  jsonPayload.service as service,
  COUNT(*) as error_count
FROM `my-project.logs_analytics.cloud_logging`
WHERE
  severity = 'ERROR'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY date, service
ORDER BY date DESC;

-- 找出错误最多的 Top 10 服务
SELECT
  jsonPayload.service as service,
  COUNT(*) as error_count,
  COUNT(DISTINCT jsonPayload.trace_id) as affected_requests
FROM `my-project.logs_analytics.cloud_logging`
WHERE
  severity = 'ERROR'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY service
ORDER BY error_count DESC
LIMIT 10;

-- 分析 MTTR 趋势
SELECT
  DATE(timestamp) as date,
  AVG(TIMESTAMP_DIFF(resolved_at, timestamp, MINUTE)) as avg_mttr_minutes
FROM `my-project.logs_analytics.incidents`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
GROUP BY date
ORDER BY date;
```

### 导出到 Cloud Storage

```bash
# 创建日志导出到 Cloud Storage
gcloud logging sinks create storage-export \
    storage.googleapis.com/my-project-logs-archive \
    --log-filter="severity>=WARNING"

# 配置生命周期管理
cat > lifecycle-config.json << EOF
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 90}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365}
    }
  ]
}
EOF

gcloud storage buckets update gs://my-project-logs-archive \
    --lifecycle-file=lifecycle-config.json
```

### 导出到 Pub/Sub

```bash
# 创建日志导出到 Pub/Sub（用于实时处理）
gcloud logging sinks create pubsub-export \
    pubsub.googleapis.com/projects/my-project/topics/logs-realtime \
    --log-filter="severity=CRITICAL"
```

---

## 14.5 日志保留策略

### 默认保留期限

| 日志类型 | 默认保留期限 |
|---------|------------|
| Cloud Logging 默认日志 | 30 天 |
| 审计日志（Activity） | 400 天 |
| 审计日志（Data Access） | 30 天 |
| 自定义日志 | 30 天 |

### 自定义保留策略

```bash
# 设置日志保留期限（最长 3650 天）
gcloud logging buckets update my-bucket \
    --location=global \
    --retention-days=365

# 创建自定义日志桶不同的保留策略
gcloud logging buckets create critical-logs \
    --location=global \
    --retention-days=365

gcloud logging buckets create debug-logs \
    --location=global \
    --retention-days=7
```

### 日志保留策略建议

| 日志类型 | 保留期限 | 存储位置 | 说明 |
|---------|---------|---------|------|
| CRITICAL 日志 | 365 天 | Cloud Logging + Cloud Storage | 合规需要 |
| ERROR 日志 | 90 天 | Cloud Logging | 排查使用 |
| WARNING 日志 | 30 天 | Cloud Logging | 参考使用 |
| INFO 日志 | 7 天 | Cloud Logging | 日常使用 |
| DEBUG 日志 | 1 天 | Cloud Logging | 仅排查时使用 |
| 审计日志 | 400 天 | Cloud Logging | 合规需要 |

---

## 14.6 日志输出规范

### 团队日志规范文档模板

```markdown
# 团队日志规范

## 1. 日志级别定义
- **CRITICAL**: 系统部分功能完全不可用，需要立即响应
- **ERROR**: 功能受损，需要在工作时间内处理
- **WARNING**: 值得关注但不影响功能
- **INFO**: 正常操作记录
- **DEBUG**: 排查问题时使用，生产环境关闭

## 2. 必选字段
- timestamp: ISO 8601 格式
- severity: 日志级别
- message: 人类可读的描述
- service: 服务名称
- trace_id: 关联追踪

## 3. 禁止记录的内容
- ❌ 密码
- ❌ API 密钥、Token
- ❌ 信用卡号
- ❌ 个人身份信息（PII）
- ❌ 数据库连接字符串中的密码

## 4. 日志格式
所有日志必须使用 JSON 格式。

## 5. 日志保留期限
- ERROR 及以上: 90 天
- INFO 及以上: 30 天
- DEBUG: 1 天
```

### 日志审查流程

1. **代码审查时**：检查是否按照日志规范输出日志
2. **定期检查**：每月扫描日志，确认没有敏感信息泄露
3. **事件复盘时**：确认日志记录是否足够支持事后分析

---

## 14.7 反模式：日志管理中的常见错误

### 反模式一：所有日志使用相同的级别

**表现**：所有日志都用 INFO 级别，或者都用 ERROR 级别。

**后果**：无法通过级别过滤重要信息，ERROR 级别的日志包含大量非错误信息。

**正确的做法**：严格按照规范使用不同的日志级别。

### 反模式二：在日志中记录敏感信息

**表现**：在日志中记录了用户的密码、信用卡号或 Token。

**后果**：安全合规问题，严重的数据泄露。

**正确的做法**：在日志规范中明确定义禁止记录的内容，并在代码审查时检查。

### 反模式三：日志太多导致成本失控

**表现**：生产环境开了 DEBUG 日志，每天产生数 TB 的日志。

**后果**：日志存储成本远超预期，查询速度也受到影响。

**正确的做法**：生产环境使用 INFO 级别，排查问题时临时开启 DEBUG。

### 反模式四：从不清理旧日志

**表现**：日志设置了无限期保留，或者保留期限过长。

**后果**：日志存储成本持续增长，查询历史日志的速度越来越慢。

**正确的做法**：根据实际需求设置保留期限，利用生命周期管理自动清理旧日志。

---

## 14.8 速查总结

### 日志搜索速查表

| 场景 | 搜索条件 | 说明 |
|------|---------|------|
| 搜索特定服务的错误 | `resource.labels.service_name=payment AND severity=ERROR` | 精确到服务 |
| 搜索特定 trace 的日志 | `jsonPayload.trace_id=abc123` | 关联追踪 |
| 搜索时间范围 | `timestamp>="2025-01-15T10:00:00Z"` | 缩小范围 |
| 搜索关键词 | `"database connection failed"` | 精确匹配 |
| 组合搜索 | `severity>=ERROR AND "timeout"` | 多条件 |

### 日志导出场景速查

| 场景 | 导出目标 | 查询方式 |
|------|---------|---------|
| 长期存储 | Cloud Storage | gsutil、生命周期管理 |
| 分析查询 | BigQuery | SQL |
| 实时处理 | Pub/Sub | 订阅处理 |
| 合规审计 | Cloud Storage（不可变） | 对象锁定 |

### 每周日志检查清单

- [ ] 日志中没有敏感信息泄露？
- [ ] 日志量是否有异常增长？
- [ ] 日志导出任务是否正常运行？
- [ ] 所有服务都使用了结构化日志？
- [ ] 日志保留策略是否需要更新？

---

> **下一章预告：** 日志告诉我们"发生了什么"，但还有一个更重要的问题——**"为什么一个请求会变慢？"** 在微服务架构中，答案往往隐藏在多个服务之间的调用链中。第 15 章将介绍分布式追踪——如何通过 Cloud Trace 在复杂的微服务调用链中快速定位延迟瓶颈。