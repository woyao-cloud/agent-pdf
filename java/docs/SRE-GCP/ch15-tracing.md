# 第 15 章 分布式追踪的实战价值

## 15.1 为什么分布式追踪很重要？

### 一个故事：微服务中的"破案"

某微服务系统有 15 个服务。用户反映"下单很慢"，具体表现是：有时 1 秒就完成，有时要等 8 秒。

团队查看了所有服务的指标——CPU 正常、内存正常、请求量正常。查看了所有服务的日志——没有 ERROR，没有超时日志。**指标和日志都看不出问题。**

后来通过分布式追踪发现：在慢请求中，支付服务的某个调用链路上有一个 5 秒的空闲期——服务在等待一个外部 API 的响应，但没有超时。进一步分析发现，该外部 API 偶尔会进入"慢模式"——响应时间从 200ms 变成 4 秒。

**指示告你"支付服务延迟升高了"，日志告诉"支付服务在等什么"，追踪告诉你"等待的根因是外部 API 慢"。**

### 微服务架构中的挑战

在单体应用中，排查性能问题相对简单——一个请求的处理路径在同一进程中。但在微服务架构中：

```
用户 → API Gateway → 用户服务 → 订单服务 → 支付服务 → 数据库
                                        ↓
                                    库存服务 → 数据库
                                        ↓
                                    通知服务 → 第三方 API
```

一个请求可能会经过 5-10 个服务和多个数据库/API。当这个请求变慢时，你需要回答：
- 哪个服务最慢？
- 慢在那个环节？
- 是数据库、外部 API 还是应用逻辑？

**这就是分布式追踪的价值所在。**

---

## 15.2 分布式追踪的核心概念

### Trace 和 Span

**Trace（追踪）：** 一个请求在系统中的完整路径。

**Span（跨度）：** Trace 中的一个步骤，代表一个操作单元。

```
Trace: "创建订单"
├── Span: "API Gateway" (10ms)
│   ├── Span: "用户服务" (50ms)
│   │   └── Span: "查询数据库" (30ms)
│   ├── Span: "订单服务" (500ms)
│   │   ├── Span: "创建订单记录" (50ms)
│   │   ├── Span: "扣减库存" (100ms)
│   │   └── Span: "处理支付" (300ms)
│   │       └── Span: "调用支付网关" (250ms)
└── Span: "返回结果" (10ms)
```

### Span 的属性

每个 Span 包含以下信息：

| 属性 | 说明 | 示例 |
|------|------|------|
| Span ID | 唯一标识 | `abc123` |
| Trace ID | 所属 Trace | `trace-001` |
| Parent Span ID | 父 Span | `root-span` |
| Operation Name | 操作名称 | `process_payment` |
| Start Time | 开始时间 | `2025-01-15T10:00:00Z` |
| End Time | 结束时间 | `2025-01-15T10:00:00.300Z` |
| Duration | 持续时间 | `300ms` |
| Status | 状态 | `OK` 或 `ERROR` |
| Attributes | 属性标签 | `payment_id`, `amount` |

---

## 15.3 Cloud Trace 的实战使用

### 启用 Cloud Trace

```bash
# Cloud Trace 默认启用，不需要额外配置
# 只需要在应用中集成 OpenTelemetry 或 GCP Trace SDK

# 查看 Trace 数据
gcloud trace traces list \
    --limit 10

# 查看特定 Trace 的详情
gcloud trace traces describe trace-001
```

### 在应用中集成 OpenTelemetry

```python
# app.py - 使用 OpenTelemetry 集成 Cloud Trace
from opentelemetry import trace
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from flask import Flask

# 配置 Trace Provider
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

# 配置 Cloud Trace 导出器
exporter = CloudTraceSpanExporter()
span_processor = BatchSpanProcessor(exporter)
trace.get_tracer_provider().add_span_processor(span_processor)

# 自动集成 Flask
app = Flask(__name__)
FlaskInstrumentor().instrument_app(app)

# 自动集成 HTTP 请求
RequestsInstrumentor().instrument()

# 手动创建追踪 Span
@app.route('/api/order')
def create_order():
    with tracer.start_as_current_span("create_order") as span:
        span.set_attribute("order_id", order_id)
        span.set_attribute("user_id", user_id)
        
        # 调用支付服务
        with tracer.start_as_current_span("process_payment") as payment_span:
            result = call_payment_service(amount)
            payment_span.set_attribute("payment_status", result.status)
            payment_span.set_attribute("payment_amount", amount)
        
        return {"order_id": order_id, "status": "success"}
```

### Go 集成示例

```go
// main.go
package main

import (
    "context"
    "log"
    "time"
    
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
    "google.golang.org/api/option"
)

func initTracer() {
    ctx := context.Background()
    
    exporter, err := otlptrace.New(ctx,
        otlptrace.WithGRPCConn(grpcConn),
    )
    if err != nil {
        log.Fatal(err)
    }
    
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("payment-service"),
            semconv.ServiceVersionKey.String("1.0.0"),
        )),
    )
    otel.SetTracerProvider(tp)
}

func processPayment(ctx context.Context, amount float64) error {
    tracer := otel.Tracer("payment-service")
    ctx, span := tracer.Start(ctx, "process_payment")
    defer span.End()
    
    span.SetAttributes(
        attribute.Float64("amount", amount),
        attribute.String("currency", "USD"),
    )
    
    // 调用外部支付网关
    result, err := callPaymentGateway(ctx, amount)
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }
    
    return nil
}
```

### 在 GKE 中自动集成

如果使用 GKE，你可以通过 Anthos Service Mesh 或 Istio 实现**自动**的分布式追踪——不需要修改任何代码。

```yaml
# istio-config.yaml
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata:
  name: mesh-default
  namespace: istio-system
spec:
  tracing:
  - providers:
    - name: "stackdriver"
    randomSamplingPercentage: 10.0
```

启用后，Istio Sidecar 会自动为所有进出 Pod 的流量创建追踪 Span。

---

## 15.4 追踪采样策略

### 为什么需要采样？

在生产环境中，为每个请求都开启全量追踪是不现实的：

- **数据量太大**：每秒数千个请求，每个请求产生数十个 Span
- **存储成本高**：全量追踪数据需要大量存储空间
- **性能开销**：虽然很小，但仍有一定的性能影响

### 采样策略对比

| 策略 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| 概率采样 | 按比例采样（如 10%） | 简单易实现 | 可能漏掉罕见问题 |
| 错误采样 | 对所有错误请求全量采样 | 不漏掉错误 | 健康请求数据少 |
| 端点采样 | 对关键端点全量采样 | 聚焦关键路径 | 非关键端点被忽略 |
| 动态采样 | 根据当前系统状态调整采样率 | 灵活 | 实现复杂 |

### 推荐采样策略

```python
# smart_sampler.py
import random
from opentelemetry.sdk.trace.sampling import Decision, Sampler, SamplingResult

class SmartSampler(Sampler):
    """
    智能采样策略：
    - 错误请求：全量采样（100%）
    - 关键端点：高比例采样（50%）
    - 一般请求：按比例采样（10%）
    """
    
    CRITICAL_ENDPOINTS = ['/api/order', '/api/payment', '/api/login']
    
    def __init__(self, default_sample_rate=0.1):
        self.default_sample_rate = default_sample_rate
    
    def should_sample(self, parent_context, trace_id, name, kind, attributes, links):
        # 获取请求路径
        path = attributes.get("http.target", "") if attributes else ""
        
        # 错误请求全量采样
        status_code = attributes.get("http.status_code", 200) if attributes else 200
        if status_code >= 400:
            return SamplingResult(Decision.RECORD_AND_SAMPLE)
        
        # 关键端点高比例采样
        if any(endpoint in path for endpoint in self.CRITICAL_ENDPOINTS):
            if trace_id % 100 < 50:  # 50% 采样
                return SamplingResult(Decision.RECORD_AND_SAMPLE)
        
        # 一般请求按默认比例采样
        if trace_id % 100 < self.default_sample_rate * 100:
            return SamplingResult(Decision.RECORD_AND_SAMPLE)
        
        return SamplingResult(Decision.DROP)
    
    def get_description(self):
        return f"SmartSampler(default_rate={self.default_sample_rate})"
```

### 在 Cloud Trace 中配置采样

```bash
# Cloud Trace 默认采样率为 1/1000（0.1%）
# 可以通过 OpenTelemetry SDK 覆盖默认采样率

# 如果需要临时提高采样率进行排查
# 在应用中更新采样率配置，排查完成后恢复
```

---

## 15.5 一个场景：使用追踪定位慢请求

### 问题

用户反映"搜索结果加载很慢"，有时候需要 10 秒才能显示结果。

### 第一步：查看 Trace 概览

进入 Cloud Trace → Trace List，按延迟降序排列：

```
Trace ID      | 延迟    | 服务数 | 操作
trace-001     | 8.2s   | 5      | search
trace-002     | 5.1s   | 4      | search
trace-003     | 0.3s   | 5      | search
trace-004     | 7.8s   | 4      | search
```

**发现：** 搜索请求的延迟差异很大——从 300ms 到 8s 不等。

### 第二步：分析慢 Trace

点击 trace-001（8.2s），查看详细的 Span 时间线：

```
search (8.2s)
├── API Gateway → (50ms)
├── search-service (8.1s)
│   ├── 缓存查询 (5ms)
│   ├── Elasticsearch 查询 (7.5s)   ← 这里是瓶颈！
│   │   ├── 连接建立 (20ms)
│   │   ├── 查询执行 (7.4s)
│   │   │   ├── 阶段1: 聚合计算 (6.8s)  ← 具体原因
│   │   │   └── 阶段2: 结果返回 (0.6s)
│   │   └── 连接关闭 (10ms)
│   └── 结果组装 (50ms)
└── 返回结果 → (20ms)
```

**发现：** Elasticsearch 查询耗时 7.5 秒，占总时间的 91%。其中"聚合计算"阶段花了 6.8 秒。

### 第三步：查看属性

查看 Span 的属性，获取更多信息：

```
Span: "Elasticsearch 查询"
属性:
  - query: "{\"size\": 100, \"aggs\": {...}}"
  - index: "products"
  - shards: 20
  - shard_failures: 5
  - took_ms: 7500
```

**发现：** 查询中包含一个复杂的聚合操作，且 20 个分片中有 5 个失败了。

### 第四步：根因定位

进一步分析发现，新上线的一个"商品推荐"功能使用了复杂的 Elasticsearch 聚合查询，该查询没有充分利用缓存，且在某些分片上执行特别慢。

### 第五步：修复和验证

**修复：** 优化查询语句，添加缓存层，修复分片配置。

**验证：** 修复后，搜索的 P99 延迟从 6s 降到了 500ms。

---

## 15.6 追踪数据与日志的关联

### 通过 trace_id 关联

使用同一个 `trace_id` 将追踪数据和日志数据关联起来：

```python
# 在日志中包含 trace_id
import logging
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

def handle_request(request):
    with tracer.start_as_current_span("handle_request") as span:
        trace_id = format(span.get_span_context().trace_id, '032x')
        
        # 在日志中包含 trace_id
        logger.info("处理请求开始", extra={
            "trace_id": trace_id,
            "request_id": request.id
        })
        
        result = process_request(request)
        
        logger.info("处理请求完成", extra={
            "trace_id": trace_id,
            "duration_ms": result.duration
        })
```

### 在 Logs Explorer 中按 trace_id 查询

```bash
# 搜索特定 trace 的所有日志
gcloud logging read "
    jsonPayload.trace_id=abc123
"

# 在 Logs Explorer 界面中
# 可以直接点击 Trace 中的日志链接跳转到对应日志
```

---

## 15.7 反模式：分布式追踪中的常见错误

### 反模式一：没有采样策略

**表现**：生产环境开启了全量追踪，每个请求都产生完整的追踪数据。

**后果**：追踪数据量巨大，存储成本高，查询速度慢。

**正确的做法**：根据业务需求设置合理的采样策略。从 10% 开始，根据实际情况调整。

### 反模式二：只有自动集成，没有手动 Span

**表现**：只使用了 OpenTelemetry 的自动集成（如 FlaskInstrumentor），没有手动创建业务相关的 Span。

**后果**：Trace 只能看到 HTTP 请求的进出时间，看不到业务逻辑内部的耗时。

**正确的做法**：在关键的业务逻辑处手动创建 Span，记录业务操作的时间。

### 反模式三：Span 名称不统一

**表现**：同一个操作在不同的服务中使用不同的 Span 名称——"process_payment"和"payment_process"混用。

**后果**：在 Trace 列表中搜索和过滤 Span 时，无法通过名称准确找到相关操作。

**正确的做法**：统一 Span 的命名规范。推荐格式：`{服务名}.{操作名}`。

### 反模式四：忽略 Trace 中的错误信息

**表现**：Span 虽然记录了错误，但没有设置 `span.set_status(ERROR)`。

**后果**：在 Trace 列表中无法快速过滤出错误的 Trace。

**正确的做法**：在捕获到异常时，显式设置 Span 的状态为 ERROR，并记录错误信息。

---

## 15.8 速查总结

### 分布式追踪速查表

| 概念 | 说明 | 类比 |
|------|------|------|
| Trace | 请求的完整路径 | 一个完整的"旅程" |
| Span | Trace 中的一个步骤 | 旅程中的"一站" |
| Trace ID | 关联所有 Span | 旅程的"订单号" |
| Span ID | 唯一标识一个 Span | 车站的"站牌" |
| Parent Span ID | 标识父子关系 | "上一站" |

### 采样策略推荐

| 场景 | 推荐采样率 | 说明 |
|------|-----------|------|
| 开发环境 | 100% | 方便排查所有问题 |
| 测试环境 | 50% | 覆盖大多数场景 |
| 生产环境（核心服务） | 10-20% | 平衡数据量和覆盖度 |
| 生产环境（一般服务） | 1-5% | 低成本数据采集 |
| 错误请求 | 100% | 不错过任何问题 |

### 排查流程速查

```
1. 查看延迟是否异常（指标）→
2. 按延迟排序找到最慢的 Trace（追踪）→
3. 分析 Span 时间线，找到瓶颈 Span →
4. 查看瓶颈 Span 的属性和日志 →
5. 确定根因 →
6. 修复并验证
```

### 每周追踪检查清单

- [ ] 所有关键服务都接入了分布式追踪？
- [ ] 追踪数据是否正确导出到 Cloud Trace？
- [ ] 采样策略是否需要调整？
- [ ] 是否有异常的 Trace 模式？
- [ ] 追踪数据是否与日志正确关联？

---

> **下一章预告：** 追踪告诉我们"请求在哪里最慢"，但还有一个更深层次的问题——**"代码的哪些部分消耗了最多的 CPU 和内存？"** 第 16 章将介绍 Cloud Profiler 的性能分析功能，帮助你从代码级别找到性能瓶颈。