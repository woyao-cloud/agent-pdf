# 附录 E：从 Prometheus 到 OpenTelemetry 迁移指南

> OpenTelemetry（OTel）已成为云原生可观测性的事实标准。本附录指导您如何将基于 Prometheus 客户端库的监控体系逐步迁移到 OpenTelemetry，并实现 Metrics + Logs + Traces 三支柱的统一。

## E.1 为什么要迁移到 OTel？

### Prometheus 客户端库的局限

| 局限 | 说明 |
|------|------|
| 仅指标（Metrics） | Prometheus 客户端只负责指标采集，日志和追踪需要额外的 SDK |
| 协议绑定 | 指标格式强绑定 Prometheus 文本协议，难以直接输出到其他后端 |
| 无上下文传播 | 无法自动关联 Trace 上下文，Exemplar 需要手动编码 |
| 生态碎片 | 每种语言需要维护独立的客户端库，API 风格不统一 |

### OTel 的核心优势

1. **三支柱统一**：一套 SDK 同时输出 Metrics、Logs、Traces
2. **厂商中立**：通过 OTLP 协议输出到 Prometheus、Datadog、Grafana Cloud、AWS X-Ray 等任意后端
3. **上下文自动传播**：Trace 上下文自动在服务间传递，Exemplar 自动关联
4. **自动埋点**：通过 Instrumentation 库自动采集主流框架和数据库的指标

### 迁移收益对比

| 维度 | Prometheus 客户端 | OTel SDK |
|------|------------------|----------|
| 代码侵入 | 需手动定义指标 | 自动 Instrumentation 可零代码埋点 |
| 输出后端 | Prometheus 格式 | OTLP → 任意后端 |
| Trace 关联 | 手动 Exemplar | 自动 Context 传播 |
| 社区趋势 | 维护模式 | 活跃发展（CNCF 毕业项目） |

## E.2 迁移策略：渐进式 vs 全量替换

### 方案一：渐进式迁移（推荐）

保持现有 Prometheus 客户端不变，在旁添加 OTel SDK，逐步替换：

```
阶段 1：OTel Collector 作为代理
  [Prometheus 客户端] ──(/metrics)──→ [OTel Collector] ──(OTLP)──→ 后端

阶段 2：新服务使用 OTel SDK
  [新服务 OTel SDK] ──(OTLP)──→ [OTel Collector] ──(Prometheus)──→ 现有 Prometheus

阶段 3：旧服务逐个迁移
  [旧服务迁移到 OTel SDK] ──(OTLP)──→ [OTel Collector]
```

### 方案二：全量替换（适用于新项目）

新项目直接从 OTel SDK 开始，通过 OTel Collector 的 `prometheusexporter` 暴露 `/metrics` 端点兼容现有 Prometheus。

```
[服务 OTel SDK] ──(OTLP)──→ [OTel Collector]
                                   │
                          prometheusexporter
                                   │
                            ┌──────┴──────┐
                            ▼             ▼
                      Prometheus     Grafana
                      (兼容现有)     (直接OTLP)
```

## E.3 代码迁移对照

### E.3.1 Java（Spring Boot）

**迁移前：Micrometer + Prometheus**

```java
// build.gradle
implementation 'io.micrometer:micrometer-registry-prometheus'
implementation 'org.springframework.boot:spring-boot-starter-actuator'
```

```java
// 自定义指标
@RestController
public class OrderController {
    private final Counter orderCounter = Metrics.counter("orders_created_total",
        "status", "success");

    @PostMapping("/orders")
    public Order createOrder(@RequestBody Order order) {
        orderCounter.increment();
        return orderService.create(order);
    }
}
```

**迁移后：Spring Boot 3.x + OTel**

```java
// build.gradle
implementation 'io.opentelemetry:opentelemetry-api:1.35.0'
implementation 'io.opentelemetry:opentelemetry-exporter-otlp:1.35.0'
implementation 'io.opentelemetry:opentelemetry-sdk-extension-autoconfigure:1.35.0'
// Spring Boot 3.x 自动配置（无需手动创建 SDK）
implementation 'io.opentelemetry.instrumentation:opentelemetry-spring-boot-starter:2.4.0'
```

```java
// 自动 Instrumentation 自动采集：
// - HTTP 请求指标（类似 http_server_requests_seconds）
// - JVM 指标
// - 数据库连接池指标
// - 日志与 Trace 上下文关联

// 自定义指标（推荐使用 GlobalMeterProvider）
import io.opentelemetry.api.metrics.*;

public class OrderMetrics {
    private static final Meter meter = GlobalMeterProvider.get()
        .meterBuilder("com.example.order")
        .setInstrumentationVersion("1.0.0")
        .build();

    private final LongCounter orderCounter = meter
        .counterBuilder("orders.created")
        .setDescription("Total number of orders created")
        .setUnit("{orders}")
        .build();

    public void recordOrder(String status) {
        orderCounter.add(1, Attributes.of(
            AttributeKey.stringKey("status"), status
        ));
    }
}
```

**指标名映射对照：**

| Prometheus | OTel | 说明 |
|-----------|------|------|
| `orders_created_total` | `orders.created` | 点分隔替代下划线 |
| `http_server_requests_seconds_count` | `http.server.request.duration` | 符合 Semantic Conventions |
| `jvm_memory_used_bytes` | `jvm.memory.used` | 单位由后缀变为属性 |

### E.3.2 Go

**迁移前：Prometheus Go 客户端**

```go
import "github.com/prometheus/client_golang/prometheus"

var (
    httpRequests = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total HTTP requests",
        },
        []string{"method", "status"},
    )
)

func init() {
    prometheus.MustRegister(httpRequests)
}

func handler(w http.ResponseWriter, r *http.Request) {
    httpRequests.WithLabelValues(r.Method, "200").Inc()
}
```

**迁移后：OTel Go SDK**

```go
import (
    "go.opentelemetry.io/otel/metric"
    "go.opentelemetry.io/otel/sdk/metric/instrument"
)

var meter = global.Meter("com.example.http")

var httpRequests, _ = meter.Int64Counter(
    "http.requests",
    instrument.WithDescription("Total HTTP requests"),
    instrument.WithUnit("{requests}"),
)

func handler(w http.ResponseWriter, r *http.Request) {
    httpRequests.Add(r.Context(), 1,
        metric.WithAttributes(
            attribute.String("http.method", r.Method),
            attribute.String("http.status_code", "200"),
        ),
    )
}
```

### E.3.3 Python

**迁移前：prometheus_client**

```python
from prometheus_client import Counter, start_http_server

REQUESTS = Counter('http_requests_total', 'Total HTTP requests',
                   ['method', 'status'])

def handler(request):
    REQUESTS.labels(method=request.method, status=200).inc()
```

**迁移后：opentelemetry-python**

```python
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter

meter = metrics.get_meter_provider().get_meter("com.example.http")

requests_counter = meter.create_counter(
    "http.requests",
    description="Total HTTP requests",
    unit="{requests}",
)

def handler(request):
    requests_counter.add(
        1,
        {"http.method": request.method, "http.status_code": 200},
    )
```

## E.4 OTel Collector 配置

OTel Collector 是迁移的核心枢纽，负责接收 OTLP 协议并转发到 Prometheus 或其他后端。

### 基础配置

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  # 输出到 Prometheus（兼容现有体系）
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: "otel"
    add_metric_suffixes: false

  # 同时输出到 OTLP 后端（如 Grafana Cloud）
  otlp:
    endpoint: otlp.grafana.com:4317
    headers:
      Authorization: "Basic ${GRAFANA_API_KEY}"

  # 日志输出（调试用）
  debug:
    verbosity: detailed

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, otlp, debug]
```

### 从 Prometheus 抓取迁移到 OTel

如果暂时不能修改应用代码，可以用 OTel Collector 代替 Prometheus 抓取：

```yaml
receivers:
  # 从现有 Prometheus 端点抓取
  prometheus:
    config:
      scrape_configs:
        - job_name: 'existing-app'
          scrape_interval: 15s
          static_configs:
            - targets: ['app:8080']

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    metrics:
      receivers: [prometheus]
      exporters: [prometheus]  # 转换为 OTel 格式再暴露
```

## E.5 Semantic Conventions（语义约定）

OTel 定义了标准化的指标和属性命名规范，迁移时需要注意命名变化。

### 常用指标映射

| Prometheus 命名 | OTel Semantic Convention |
|----------------|-------------------------|
| `http_requests_total` | `http.server.request.count` |
| `http_request_duration_seconds` | `http.server.request.duration` |
| `process_cpu_seconds_total` | `process.cpu.time` |
| `process_resident_memory_bytes` | `process.memory.usage` |
| `jvm_gc_pause_seconds` | `jvm.gc.duration` |

### 常用属性映射

| Prometheus Label | OTel Attribute |
|-----------------|---------------|
| `method` | `http.request.method` |
| `status` / `status_code` | `http.response.status_code` |
| `uri` / `endpoint` | `url.path` |
| `instance` | `service.instance.id` |
| `job` | `service.name` |

> **注意**：OTel 的属性名使用点分隔（如 `http.request.method`），而非 Prometheus 的下划线风格。OTel Collector 的 `transform` 处理器可以自动重命名。

```yaml
processors:
  transform:
    metric_statements:
      - context: metric
        statements:
          - set(name) = ReplaceAllPattern(name, "_", ".")
```

## E.6 迁移注意事项

### 1. 指标命名冲突

迁移期间新旧指标可能同时存在，导致 Grafana 面板出现重复数据。解决方案：

```yaml
# OTel Collector 添加命名空间前缀
exporters:
  prometheus:
    namespace: "otel"
    # 新指标：otel_http_requests_total
    # 旧指标：http_requests_total
```

在 Grafana 中使用正则匹配同时覆盖新旧指标：
```promql
# 同时匹配新旧指标
rate({__name__=~"otel_http_requests_total|http_requests_total"}[5m])
```

### 2. 标签（属性）数量差异

Prometheus 鼓励尽量少的 Label，OTel 则携带更丰富的属性。过多的属性会增加基数：

```yaml
processors:
  # 在 Collector 侧丢弃高基数属性
  attributes:
    actions:
      - key: user.id
        action: delete
      - key: trace_id
        action: delete
```

### 3. Histogram 兼容性

OTel 的 Histogram 默认使用指数分桶（Exponential Bucket），与 Prometheus 的显式分桶不兼容：

```yaml
# 使用 OTel Collector 的 metrics-transform 处理器转换
processors:
  metrics_transform:
    histogram:
      to_explicit:
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

或者在 SDK 端指定显式分桶：
```java
// OTel Java SDK 显式指定分桶
meter.histogramBuilder("http.request.duration")
    .setExplicitBucketBoundariesAdvice(List.of(
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
    ))
    .build();
```

### 4. Exemplar 自动关联

OTel 自动将 Trace 上下文注入到 Exemplar 中，无需手动编码：

```java
// OTel 自动完成——无需手动传 TraceID
// 只需要确保 Trace 上下文存在
try (Scope scope = span.makeCurrent()) {
    httpRequestDuration.record(duration);  // Exemplar 自动包含 TraceID
}
```

### 5. 运行时迁移（零停机）

```
1. 部署 OTel Collector（代理模式）
2. 逐个服务添加 OTel SDK（功能开关控制）
   - 旧路径：Prometheus 客户端 → /metrics
   - 新路径：OTel SDK → OTLP → Collector → Prometheus exporter
3. 验证指标一致性
4. 逐步下线 Prometheus 客户端
5. 切换 Grafana 数据源指向 Collector
```

## E.7 回滚方案

迁移过程中如遇到问题，可随时回滚：

```yaml
# 保留旧 Prometheus 端点的同时添加 OTel
management:
  endpoints:
    web:
      exposure:
        include: health, prometheus  # 保留旧端点
```

```bash
# 切换 Grafana 数据源：只需改 URL
# 从 OTel Collector 切回 Prometheus
# Grafana Data Source URL: http://prometheus:9090 （旧）
# Grafana Data Source URL: http://otel-collector:8889 （新）
```

## 本章小结

- OTel 提供 Metrics + Logs + Traces 三支柱统一 SDK，是 Prometheus 客户端库的演进方向
- **渐进式迁移**是最安全的策略：先加 Collector 做代理，再逐个迁移服务
- 指标命名从下划线风格转向点分隔（遵循 Semantic Conventions）
- OTel Collector 是迁移枢纽，负责协议转换和指标路由
- Histogram 分桶策略和基数控制是迁移中的关键注意事项
- 保留旧端点可随时回滚，降低迁移风险
