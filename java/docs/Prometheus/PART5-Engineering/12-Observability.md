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

## 12.3 实战：完整的 O11y 栈

### 推荐的技术选型

| 支柱 | 推荐方案 | 备选 |
|------|---------|------|
| Metrics | Prometheus + Grafana | VictoriaMetrics |
| Logs | Loki + Promtail | Elasticsearch + Filebeat |
| Traces | Tempo | Jaeger, Zipkin |

### 集成配置要点

1. 所有组件共享同一个 `traceID`
2. 日志中始终包含 `traceID` 字段
3. 指标中通过 Exemplar 携带 `traceID`
4. Grafana 中配置好各数据源之间的关联关系

## 本章小结

- Exemplars 将 TraceID 嵌入 Histogram 指标，实现 Metrics → Traces 跳转
- Loki 集成实现 Metrics → Logs 跳转
- 完整 O11y 栈需要 Metrics + Logs + Traces 三者互通
- 关键是统一 traceID 贯穿所有数据
- 实践：[O11y 实验](../labs/ch12-o11y/README.md)