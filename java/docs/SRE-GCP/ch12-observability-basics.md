# 第 12 章 可观测性的三个支柱

## 12.1 可观测性不等于监控

### 一个故事：监控做得很"全"，但问题还是查不到

某团队的监控 Dashboard 上布满了图表——CPU 使用率、内存使用率、磁盘 I/O、网络流量……看起来什么都有。

一天，用户反馈"下单很慢"。团队查看所有监控图表——CPU 正常，内存正常，磁盘正常，网络正常。**所有指标都在正常范围内，但用户体验确实很差。**

团队花了好几个小时，最终通过查看应用日志才发现：是一个第三方支付 API 的响应时间从 200ms 变成了 2 秒。这个 API 调用不是每次都触发，只有在特定条件下才调用，所以平均延迟看起来没有明显变化。

**问题出在哪里？** 监控只告诉你"系统层面一切正常"，但无法告诉你"为什么下单变慢了"。

### 监控 vs 可观测性

| 维度 | 监控（Monitoring） | 可观测性（Observability） |
|------|------------------|------------------------|
| 目标 | 已知的未知 | 未知的未知 |
| 方式 | 预设指标和阈值 | 探索和分析 |
| 问题类型 | "CPU 超过 90% 了" | "为什么下单变慢了？" |
| 数据 | 指标（Metrics） | 指标 + 日志 + 追踪 |
| 思维模式 | 我预先知道要监控什么 | 我可以在不预知的情况下发现问题 |

**监控是"我知道可能会出什么问题，所以我盯着它"。**

**可观测性是"我不知道会出什么问题，但出了问题时，我可以从数据中找到答案"。**

### 可观测性的三个支柱

可观测性的三个支柱是：

1. **指标（Metrics）**：系统的量化表达——"CPU 80%，请求数 1000/s"
2. **日志（Logs）**：系统行为的详细记录——"2025-01-15 10:00:00 ERROR 数据库连接超时"
3. **链路追踪（Traces）**：请求在系统中的完整路径——"请求 A → 服务 X → 服务 Y → 数据库 Z"

> 有些团队还会加上**性能分析（Profiles）** 作为第四个支柱——"代码的哪些部分消耗了最多的 CPU 和内存？"

### GCP 可观测性工具链

| 支柱 | GCP 工具 | 说明 |
|------|---------|------|
| 指标 | Cloud Monitoring | 指标收集、仪表盘、告警 |
| 日志 | Cloud Logging | 日志收集、搜索、导出 |
| 追踪 | Cloud Trace | 分布式追踪、延迟分析 |
| 性能分析 | Cloud Profiler | CPU/内存性能分析 |

---

## 12.2 指标（Metrics）：系统的量化表达

### 指标的三个层次

在 GCP 上，指标的来源主要有三个层次：

**平台层指标：** GCP 服务自动上报的指标。

```bash
# 查看 Compute Engine 的 CPU 使用率
gcloud monitoring metrics list \
    --filter="metric.type = compute.googleapis.com/instance/cpu/utilization"

# 查看 Cloud SQL 的活跃连接数
gcloud monitoring metrics list \
    --filter="metric.type = cloudsql.googleapis.com/database/postgresql/num_backends"
```

这些指标是免费提供的，不需要额外配置。GCP 会自动收集并存储。

**应用层指标：** 应用程序内部产生的指标。

```python
# 使用 OpenTelemetry 暴露应用指标
from opentelemetry import metrics
from opentelemetry.exporter.cloud_monitoring import CloudMonitoringMetricsExporter

meter = metrics.get_meter(__name__)

# 创建自定义指标
request_counter = meter.create_counter(
    name="app.requests.total",
    description="Total number of requests",
)

request_latency = meter.create_histogram(
    name="app.requests.latency",
    description="Request latency in milliseconds",
    unit="ms",
)

# 在请求处理中使用
def handle_request(request):
    start_time = time.time()
    
    # 处理请求
    result = process_request(request)
    
    # 记录指标
    request_counter.add(1)
    latency = (time.time() - start_time) * 1000
    request_latency.record(latency)
    
    return result
```

**自定义指标：** 业务层面的指标。

```python
# 将自定义指标写入 Cloud Monitoring
from google.cloud import monitoring_v3

client = monitoring_v3.MetricServiceClient()
project_name = f"projects/{project_id}"

series = monitoring_v3.TimeSeries()
series.metric.type = "custom.googleapis.com/order/total_amount"
series.resource.type = "global"
series.points.add({
    "value": {"double_value": 1500.50},
    "interval": {"end_time": {"seconds": int(time.time())}},
})

client.create_time_series(request={"name": project_name, "time_series": [series]})
```

### 指标的使用原则

| 原则 | 说明 | 例子 |
|------|------|------|
| USE 方法 | 每个资源的利用率、饱和度、错误 | CPU 利用率、队列深度、错误率 |
| RED 方法 | 每个请求的速率、错误、持续时间 | 请求数/秒、错误率、延迟 |
| 四个黄金信号 | 延迟、流量、错误、饱和度 | P99 延迟、请求量、5xx 比例、CPU 使用率 |

---

## 12.3 日志（Logs）：系统的详细记录

### 日志的分类

**基础设施日志：** GCP 服务自动产生的日志。

```bash
# 查看 Cloud SQL 的错误日志
gcloud logging read "resource.type=cloudsql_database AND severity>=ERROR"

# 查看 GKE 集群事件
gcloud logging read "resource.type=k8s_cluster AND jsonPayload.kind=Event"
```

**应用日志：** 应用程序主动输出的日志。

```python
# 使用结构化日志（推荐）
import json
import logging

# 配置结构化日志
class StructuredLogger(logging.Logger):
    def _log(self, level, msg, args, **kwargs):
        extra = kwargs.get('extra', {})
        log_entry = {
            "timestamp": self.formatTime(logging.LogRecord(
                "", level, "", 0, "", (), None
            )),
            "severity": level.name,
            "message": msg % args if args else msg,
            "service": extra.get("service", "unknown"),
            "trace_id": extra.get("trace_id", ""),
        }
        print(json.dumps(log_entry))

# 使用示例
logger = StructuredLogger("myapp")
logger.info("用户登录成功",
    extra={"service": "auth", "trace_id": "abc123"})
logger.error("数据库连接超时",
    extra={"service": "order", "trace_id": "def456"})
```

**审计日志：** 记录谁在什么时候做了什么操作。

```bash
# 查看管理员操作审计日志
gcloud logging read "logName=projects/my-project/logs/cloudaudit.googleapis.com%2Factivity"
```

### 日志级别的最佳实践

| 级别 | 含义 | 使用场景 | 示例 |
|------|------|---------|------|
| DEBUG | 调试信息 | 开发和排障时使用，生产环境关闭 | SQL 查询内容 |
| INFO | 正常信息 | 记录系统正常运行的事件 | 用户登录、订单创建 |
| WARNING | 值得关注 | 不影响功能但值得注意的情况 | 重试请求、配置即将过期 |
| ERROR | 需要处理 | 功能受损，需要人工介入 | 数据库连接失败、API 超时 |
| CRITICAL | 严重错误 | 系统部分功能完全不可用 | 服务宕机、数据损坏 |

### 日志管理的要点

1. **结构化日志**：使用 JSON 格式，不要输出纯文本
2. **包含上下文**：trace_id、user_id、request_id 等
3. **不要记录敏感信息**：密码、Token、信用卡号等绝对不能写入日志
4. **设置保留策略**：高价值日志保存 1 年，低价值日志保存 30 天
5. **日志量控制**：避免在生产环境输出 DEBUG 级别的日志

---

## 12.4 链路追踪（Traces）：请求的完整路径

### 追踪的价值

在微服务架构中，一个用户请求往往会经过多个服务：

```
用户 → API Gateway → 用户服务 → 订单服务 → 支付服务 → 数据库
                                                      ↓
                                                  第三方 API
```

当这个请求变慢或失败时：
- **指标**告诉你"支付服务的延迟升高了"
- **日志**告诉你"支付服务返回了超时错误"
- **追踪**告诉你"这个请求在支付服务的数据库查询阶段花费了 1.5 秒"

### 使用 Cloud Trace 进行追踪

```python
# 使用 OpenTelemetry 集成 Cloud Trace
from opentelemetry import trace
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.trace import TracerProvider

# 配置 Trace
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

# 导出到 Cloud Trace
exporter = CloudTraceSpanExporter()
from opentelemetry.sdk.trace.export import BatchSpanProcessor
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(exporter))

# 在代码中创建追踪 Span
@app.route('/api/order')
def create_order():
    with tracer.start_as_current_span("create_order") as span:
        span.set_attribute("order_id", order_id)
        
        # 调用用户服务
        with tracer.start_as_current_span("get_user") as child_span:
            user = get_user(user_id)
            child_span.set_attribute("user_id", user_id)
        
        # 调用支付服务
        with tracer.start_as_current_span("process_payment") as child_span:
            result = process_payment(order_id, amount)
            child_span.set_attribute("payment_status", result.status)
        
        return {"order_id": order_id}
```

### 追踪采样策略

```python
# 配置采样策略
from opentelemetry.sdk.trace.sampling import Decision
from opentelemetry.sdk.trace import SamplingResult

class SmartSampler:
    """智能采样器：错误请求全量采样，正常请求按比例采样"""
    
    def __init__(self, sample_rate=0.1):
        self.sample_rate = sample_rate
    
    def should_sample(self, parent_context, trace_id, name, kind, attributes, links):
        # 对错误请求全量采样
        if attributes and attributes.get("error", False):
            return SamplingResult(Decision.RECORD_AND_SAMPLE)
        
        # 对正常请求按比例采样
        if trace_id % 100 < self.sample_rate * 100:
            return SamplingResult(Decision.RECORD_AND_SAMPLE)
        
        return SamplingResult(Decision.DROP)
```

---

## 12.5 OpenTelemetry 集成

### 什么是 OpenTelemetry？

OpenTelemetry（简称 OTel）是一个开源的 observability 框架，提供统一的 API 和 SDK 来收集指标、日志和追踪数据。

**OpenTelemetry 的优势：**

- **统一标准**：一套代码同时收集指标、日志和追踪
- **厂商无关**：可以导出到任意后端（Cloud Monitoring、Prometheus、Grafana 等）
- **语言支持广**：支持 Python、Go、Java、Node.js、.NET 等主流语言

### GCP 上的 OpenTelemetry 集成

```python
# OTel + GCP 完整集成示例
from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.cloud_monitoring import CloudMonitoringMetricsExporter
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.resources import Resource

# 配置资源标签
resource = Resource.create({
    "service.name": "payment-service",
    "service.version": "1.0.0",
    "deployment.environment": "production",
})

# 配置 Metrics
metrics.set_meter_provider(MeterProvider(resource=resource))
meter = metrics.get_meter("payment-service")

# 配置 Traces
trace.set_tracer_provider(TracerProvider(resource=resource))
tracer = trace.get_tracer("payment-service")

# 导出到 GCP
metrics_exporter = CloudMonitoringMetricsExporter()
trace_exporter = CloudTraceSpanExporter()
```

---

## 12.6 一个场景：使用可观测性定位问题

### 问题描述

用户反映"搜索功能很慢"，有时候需要 10 秒才能显示结果。

### 排查过程

**第一步：查看指标（30 秒）**

查看 Cloud Monitoring Dashboard：
- CPU：正常（45%）
- 内存：正常（60%）
- 请求量：正常（500 req/s）
- P99 延迟：**5.2 秒**（异常）

**结论：** 搜索服务的延迟确实升高了，但基础设施层面看不出原因。

**第二步：查看日志（2 分钟）**

搜索 Cloud Logging：
```
ERROR 2025-01-15 10:00:00 Search timeout after 5000ms
ERROR 2025-01-15 10:00:01 Search timeout after 5000ms
ERROR 2025-01-15 10:00:02 Search timeout after 5000ms
```

**结论：** 搜索请求超时了，但不知道是哪个环节超时。

**第三步：查看追踪（3 分钟）**

在 Cloud Trace 中查看一个慢请求的追踪：

```
搜索请求 (5.2s)
├── API Gateway (10ms)
├── 搜索服务 (5.1s)
│   ├── 缓存查询 (5ms)
│   ├── Elasticsearch 查询 (4.8s)  ← 问题在这里！
│   └── 结果组装 (50ms)
└── 返回结果 (10ms)
```

**结论：** Elasticsearch 查询耗时 4.8 秒，占总时间的 92%。

**第四步：根因分析**

进一步查看 Elasticsearch 的慢查询日志，发现有一个新上线的搜索功能使用了复杂的聚合查询，没有使用索引，导致全表扫描。

**修复：** 优化查询语句，添加合适的索引。

**第五步：验证**

修复后，P99 延迟从 5.2 秒降到了 200ms。

---

## 12.7 反模式：可观测性中的常见错误

### 反模式一：只有指标，没有日志和追踪

**表现**：Dashboard 上全是 CPU、内存、磁盘的指标，但没有应用日志和链路追踪。

**后果**：知道"系统出问题了"，但不知道"为什么出问题"。

**正确的做法**：同时建设指标、日志、追踪三个支柱。

### 反模式二：日志太多，没有价值

**表现**：生产环境开启了 DEBUG 级别的日志，每天产生 TB 级别的日志。

**后果**：日志存储成本高，真正有用的信息被淹没在海量日志中。

**正确的做法**：生产环境使用 INFO 级别，只在排查特定问题时临时开启 DEBUG。

### 反模式三：没有使用结构化日志

**表现**：日志是纯文本格式，如 `"User 123 logged in at 10:00"`。

**后果**：无法通过日志系统进行高效搜索和分析。

**正确的做法**：使用 JSON 格式的结构化日志，包含事件名称、用户 ID、时间戳等字段。

---

## 12.8 速查总结

### 可观测性三支柱速查

| 支柱 | 回答的问题 | GCP 工具 | 关键配置 |
|------|-----------|---------|---------|
| 指标 | "什么出问题了？" | Cloud Monitoring | 仪表盘、告警策略 |
| 日志 | "具体发生了什么？" | Cloud Logging | 结构化日志、导出策略 |
| 追踪 | "为什么出问题了？" | Cloud Trace | 采样策略、OpenTelemetry |
| 性能分析 | "哪里最慢？" | Cloud Profiler | 自动收集、无需配置 |

### 排查流程速查

```
1. 查看指标：确认问题范围和严重程度
2. 查看日志：了解具体错误信息
3. 查看追踪：定位延迟瓶颈
4. 查看性能分析：分析代码级性能问题
5. 综合判断：确定根因并修复
```

### 每周可观测性检查清单

- [ ] 所有核心服务的指标都在正常范围内？
- [ ] 日志中没有异常的错误模式？
- [ ] P99 延迟是否在 SLO 范围内？
- [ ] 是否有新的服务没有接入可观测性？
- [ ] 告警规则是否需要更新？

---

> **下一章预告：** 有了可观测性的理论基础，接下来我们进入实战——第 13 章将深入介绍 Cloud Monitoring 的仪表盘设计和告警策略配置，包括如何避免告警风暴和使用 MQL 编写查询。