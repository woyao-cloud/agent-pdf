# 第12章 可观测性三大支柱联动（Metrics + Logs + Traces）

## 12.1 Exemplars：将 TraceID 嵌入指标

### 什么是 Exemplar？

Exemplar 是 Prometheus 在 TSDB 中引入的一个概念：它为 Histogram 的每个 bucket 附加一个"样本数据点"，包含一个具体的 TraceID 和 SpanID。

它的作用是在指标图上看到突刺时，**一键跳转到对应的链路追踪详情**，而不用靠"猜"哪条 Trace 导致了这次延迟突刺。

```promql
# 查询 P99 延迟时，Exemplar 会显示具体的 TraceID
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
# 在 Grafana 中点击数据点 → 自动跳转到 Tempo/Jaeger 查看 Trace 详情
```

### 配置方式

Prometheus 需要在启动时启用 Exemplar 存储：

```bash
--enable-feature=exemplar-storage
```

Grafana 侧需要配置 Trace 数据源关联：
1. 添加 Tempo/Jaeger 数据源
2. 在 Prometheus 数据源中配置 Exemplars 关联

### 应用端生成 Exemplar

**Go 版本：**
```go
import "github.com/prometheus/client_golang/prometheus"

histogram.With(prometheus.Labels{"service": "api"}).
    ObserveWithExemplar(duration, prometheus.Labels{"traceID": traceID})
```

**Python 版本：**
```python
from prometheus_client import Histogram

h = Histogram('request_duration_seconds', 'Request duration', ['service'])
h.labels(service='api').observe(duration, exemplar={'TraceID': trace_id})
```

## 12.2 Loki 集成：Metrics → Logs 联动

### 为什么需要联动？

光看指标只能知道"有什么问题"，看日志才知道"为什么有问题"。Grafana 提供了从指标图表直接跳转到相关日志的能力。

### 配置方式

在 Grafana 的 Prometheus 数据源中配置 Derived Fields（衍生字段）：

1. 在 Prometheus 数据源 → Derived Fields 中添加：
   - Field name: `traceID`
   - URL: `${__value.raw} → ${dataSource.loki}`
2. 在 Loki 数据源中，日志也应该包含 `traceID` 字段
3. 点击指标图上的数据点 → 自动跳转到对应时间段的 Loki 日志

### 效果

```
Grafana Dashboard
│
├── 面板 1：错误率趋势（Prometheus）
│   │  点击 15:30 的突刺点
│   │  │
│   │  ├── 跳转到 Tempo：查看该时间点的 Trace 详情
│   │  └── 跳转到 Loki：查看该时间点的 Error 日志
│   │
├── 面板 2：P99 延迟（Prometheus）
│   │  点击 15:30 的突刺点
│   │  │
│   │  └── 跳转到 Loki：查看慢请求的日志
│
└── 面板 3：Loki 日志流
    实时展示 Error 级别日志
```

### 实战：Grafana 配置步骤

**Step 1：添加 Prometheus 数据源**

```yaml
# grafana/datasources/datasources.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
    # 配置 Exemplars 关联
    exemplar: true
    # 配置 Derived Fields（Metrics → Logs 跳转）
    derivedFields:
      - name: traceID
        type: field
        datasourceUid: tempo
        matcherRegex: "traceID=(\\w+)"
        url: "$${__value.raw}"
      - name: TraceID
        type: field
        datasourceUid: loki
        matcherRegex: "traceID=(\\w+)"
        url: "$${__value.raw}"
```

**Step 2：添加 Tempo 数据源**

```yaml
  - name: Tempo
    type: tempo
    uid: tempo
    url: http://tempo:3200
    access: proxy
```

**Step 3：添加 Loki 数据源**

```yaml
  - name: Loki
    type: loki
    uid: loki
    url: http://loki:3100
    access: proxy
    jsonData:
      derivedFields:
        - name: traceID
          datasourceUid: tempo
          matcherRegex: "traceID=(\\w+)"
          url: "$${__value.raw}"
```

### 实战：Docker Compose 一键启动 O11y 栈

```yaml
# docker-compose.yml
version: '3.8'
services:
  # Metrics
  prometheus:
    image: prom/prometheus:v2.48.0
    command:
      - --enable-feature=exemplar-storage   # 必须启用 Exemplar
      - --config.file=/etc/prometheus/prometheus.yml
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  # Traces
  tempo:
    image: grafana/tempo:2.3.0
    command: [-config.file=/etc/tempo.yaml]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml

  # Logs
  loki:
    image: grafana/loki:2.9.0
    command: [-config.file=/etc/loki/config.yaml]
    volumes:
      - ./loki:/etc/loki

  # 日志采集器
  promtail:
    image: grafana/promtail:2.9.0
    command: [-config.file=/etc/promtail/config.yml]
    volumes:
      - ./logs:/var/log
      - ./promtail.yml:/etc/promtail/config.yml

  # 可视化
  grafana:
    image: grafana/grafana:10.2.0
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/datasources:/etc/grafana/provisioning/datasources

  # 示例应用（自动生成 Trace、Metrics、Logs）
  app:
    image: grafana/otel-app:latest
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
    ports:
      - "8080:8080"
```

```bash
# 一键启动
docker compose up -d

# 访问 Grafana
open http://localhost:3000

# 访问示例应用（产生遥测数据）
curl http://localhost:8080/hello
curl http://localhost:8080/error
```

### 实战：从指标突刺到根因定位

以下是一个完整的排障工作流：

```
1. 发现异常
   Grafana 错误率面板显示 15:30 有突刺
   
2. Metrics → Traces（通过 Exemplar）
   点击突刺点 → 自动跳转到 Tempo
   查看该时间点最慢的 Trace
   
3. Trace → Logs（通过 traceID）
   在 Trace 详情中点击 span → 跳转到 Loki
   查看该 Trace 对应的应用日志
   
4. 定位根因
   日志显示 "database connection timeout"
   结论：数据库连接池耗尽导致请求超时
```

## 12.3 实战：完整的 O11y 栈

### 推荐的技术选型

| 支柱 | 推荐方案 | 备选 |
|------|---------|------|
| Metrics | Prometheus + Grafana | VictoriaMetrics |
| Logs | Loki + Promtail | Elasticsearch + Filebeat |
| Traces | Tempo | Jaeger, Zipkin |
| 统一协议 | OpenTelemetry Collector | — |

### 集成配置要点

1. 所有组件共享同一个 `traceID`
2. 日志中始终包含 `traceID` 字段
3. 指标中通过 Exemplar 携带 `traceID`
4. Grafana 中配置好各数据源之间的关联关系

## 12.4 实战：应用端集成 OpenTelemetry

### Go 应用示例

```go
package main

import (
    "context"
    "log"
    "net/http"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
    "go.opentelemetry.io/otel/trace"
)

// 初始化 OTel SDK
func initOTel() {
    exporter, _ := otlptracegrpc.New(context.Background(),
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("order-service"),
            semconv.ServiceVersionKey.String("1.0.0"),
        )),
    )
    otel.SetTracerProvider(tp)
}

func orderHandler(w http.ResponseWriter, r *http.Request) {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(r.Context(), "create-order")
    defer span.End()

    // 模拟业务逻辑
    time.Sleep(50 * time.Millisecond)

    // 记录 Span 属性
    span.SetAttributes(
        attribute.String("order.id", "12345"),
        attribute.Float64("order.amount", 99.9),
    )

    // 记录日志（traceID 自动传播）
    log.Printf("[traceID=%s] order created successfully",
        trace.SpanContextFromContext(ctx).TraceID().String())

    w.Write([]byte("ok"))
}
```

### Python 应用示例

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.instrumentation.flask import FlaskInstrumentor
import logging
import flask

# 初始化 OTel
resource = Resource(attributes={
    SERVICE_NAME: "order-service-python"
})
provider = TracerProvider(resource=resource)
exporter = OTLPSpanExporter(endpoint="otel-collector:4317", insecure=True)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

app = flask.Flask(__name__)
FlaskInstrumentor().instrument_app(app)  # 自动埋点

# 配置日志（traceID 自动注入）
logging.basicConfig(
    format='%(asctime)s [traceID=%(otelTraceID)s] %(message)s',
    level=logging.INFO
)

@app.route('/order')
def create_order():
    current_span = trace.get_current_span()
    current_span.set_attribute("order.id", "12345")
    logging.info("order created")
    return "ok"
```

## 12.5 最佳实践与注意事项

### 1. 采样策略

Trace 全量采集会产生巨大的存储开销。推荐按以下策略采样：

| 策略 | 适用场景 | 配置方式 |
|------|---------|---------|
| 概率采样 | 高流量服务 | 10% 采样率，保留 100% 错误 Trace |
| 速率限制 | 稳定流量的服务 | 每秒最多采集 100 条 Trace |
| 头部采样 | 需要完整 Trace 的场景 | 在入口处决定是否采样 |

```yaml
# OTel Collector 采样配置
processors:
  tail_sampling:
    policies:
      # 错误 Trace 100% 保留
      - name: errors-policy
        type: status_code
        config:
          status_code: ERROR
      # 慢请求 Trace 100% 保留
      - name: slow-policy
        type: latency
        config:
          threshold_ms: 500
      # 其他 Trace 10% 采样
      - name: probabilistic-policy
        type: probabilistic
        config:
          sampling_percentage: 10
```

### 2. 避免指标基数爆炸

OTel 自动埋点会采集丰富的属性（如 HTTP Headers），可能导致基数爆炸：

```yaml
# OTel Collector 丢弃高基数属性
processors:
  attributes:
    actions:
      - key: http.request.header.user_agent
        action: delete
      - key: http.request.header.cookie
        action: delete
      - key: net.peer.name
        action: delete
```

### 3. Exemplar 的注意事项

- Exemplar 只在 Histogram 指标中生效（Counter/Gauge 不支持）
- 每个 bucket 最多保留 20 个 Exemplar
- Exemplar 会占用额外的磁盘空间（约 10% 开销）
- 需要在 Prometheus 启动时开启 `--enable-feature=exemplar-storage`

### 4. 成本控制

| 组件 | 存储成本 | 优化建议 |
|------|---------|---------|
| Prometheus | 指标数量决定 | 控制 Label 基数，设置 Retention |
| Loki | 日志压缩比高 | 设置保留期，使用结构化元数据 |
| Tempo | Trace 存储量大 | 启用采样，设置 Retention |

## 本章小结

- Exemplars 将 TraceID 嵌入 Histogram 指标，实现 Metrics → Traces 跳转
- Loki 集成实现 Metrics → Logs 跳转
- 完整 O11y 栈需要 Metrics + Logs + Traces 三者互通
- 关键是统一 traceID 贯穿所有数据
- OTel SDK 自动管理 trace 上下文传播和 Exemplar 注入
- 采样策略需要在"数据完整性"和"存储成本"之间权衡
- 实践：[O11y 实验](../labs/ch12-o11y/README.md)