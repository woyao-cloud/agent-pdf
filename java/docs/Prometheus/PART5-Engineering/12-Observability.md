# 第12章 可观测性联动：指标、追踪、日志的三位一体

---

## 场景故事：一次诡异的 P99 突刺排查

周五下午 4 点，某电商平台正在准备周末大促。突然，监控大屏上的 P99 延迟曲线像被针扎了一样——从平稳的 200ms 飙升到 2s，又迅速回落。

值班工程师小王看到了 Grafana 上的告警：

```
http_request_duration_seconds{p99="2.0"} > 1.0
```

但问题来了——**告警只告诉他"P99 变高了"，却没有告诉他"为什么"**。

小王开始了一场艰难的排障之旅：

1. **看指标**：CPU、内存、网络都正常，没有明显的资源瓶颈
2. **看日志**：业务日志没有 ERROR 级别输出，只有一些 INFO 级别的慢请求日志
3. **看追踪**：公司虽然有链路追踪（Tracing），但指标和追踪是两套系统，没有打通

小王花了 **3 个小时**，最后通过手动比对时间戳，才找到根因——一个数据库慢查询。

**"如果指标能直接告诉我对应哪个 Trace，我 5 分钟就能定位问题！"** 小王感叹道。

这正是本章要解决的问题：**Exemplar（样本）**——在指标中嵌入追踪 ID，让指标和追踪可以互相跳转，实现真正的可观测性联动。

---

## 12.1 可观测性的三大支柱

### 原理比喻：侦探破案

想象你是侦探，要调查一起案件：

| 可观测性支柱 | 比喻 | 回答的问题 |
|-------------|------|-----------|
| **Metrics（指标）** | 犯罪统计报告 | "案发频率是多少？集中在哪个区域？" |
| **Logging（日志）** | 目击者口供 | "每个案件的具体细节是什么？" |
| **Tracing（追踪）** | 监控录像回放 | "一个请求从入口到出口经过了哪些地方？" |

### 三者的关系

```
                    ┌──────────────────┐
                    │    Metrics       │
                    │  (统计报表)       │
                    └────────┬─────────┘
                             │ Exemplar 关联
                             ▼
┌──────────────────┐    ┌──────────────────┐
│    Logging       │◄──►│    Tracing       │
│  (目击者口供)     │    │  (监控录像回放)   │
└──────────────────┘    └──────────────────┘
```

在过去，这三者是割裂的：
- 指标告诉你"P99 延迟突刺了"
- 追踪告诉你"请求 A 在数据库阶段花了 1.5 秒"
- 日志告诉你"数据库连接池满了"

你需要**手动**将这三者关联起来。

**Exemplar** 的出现改变了这一切——它在指标中嵌入一个"样本"（包含 Trace ID），让你可以从指标的突刺直接跳转到对应的追踪。

---

## 12.2 Exemplar 是什么？

### 定义

Exemplar 是 Prometheus 的一个特性，允许在指标的时间序列数据中附加一个**样本值**——通常是某个高延迟请求的 Trace ID。

```
http_request_duration_seconds_bucket{le="0.1"} 100
http_request_duration_seconds_bucket{le="0.5"} 200
http_request_duration_seconds_bucket{le="1.0"} 250
http_request_duration_seconds_bucket{le="+Inf"} 300
http_request_duration_seconds_count 300
http_request_duration_seconds_sum 45.0

# Exemplar 嵌入在直方图桶中：
http_request_duration_seconds_bucket{le="1.0"} 250
  # {trace_id="abc123", span_id="def456"} 0.95  ← 这个请求耗时 0.95s
```

### 原理比喻：在统计报表上贴便利贴

想象你是一家超市的经理，每周查看销售统计报表：

- **指标** = 报表上的数字："本周销售额 10 万元，客单价 50 元"
- **Exemplar** = 在报表上贴一张便利贴："这笔 9999 元的订单——顾客是 VIP，买了高端家电"

便利贴让你能从统计数字**追溯到具体的交易详情**。

### Exemplar 的数据模型

```
┌────────────────────────────────────────┐
│            Metric                       │
│  Name: http_request_duration_seconds   │
│  Labels: {service="api", method="POST"}│
│  Value: 0.95                           │
│  Timestamp: 2024-01-15T10:30:00Z       │
│  ┌─────────────────────────────────┐   │
│  │ Exemplar                        │   │
│  │   TraceID: "abc123def456"       │   │ ← 关键：追踪 ID
│  │   SpanID:  "789012"             │   │
│  │   Value: 0.95                   │   │ ← 这个请求的实际耗时
│  │   Timestamp: 2024-01-15T10:30:00│   │
│  └─────────────────────────────────┘   │
└────────────────────────────────────────┘
```

---

## 12.3 手把手：配置 Prometheus Exemplar + Grafana 关联 Tempo

### 架构概览

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ 应用服务   │───►│Prometheus │───►│  Grafana  │
│ (埋点)    │    │ (存储)    │    │ (展示)    │
└────┬─────┘    └──────────┘    └──────────┘
     │ Exemplar (trace_id)
     │
     ▼
┌──────────┐    ┌──────────┐
│  Tempo    │    │  Jaeger  │
│ (追踪存储) │    │ (追踪存储) │
└──────────┘    └──────────┘
```

### 第一步：应用代码埋点（Go 示例）

在应用中注入 Exemplar 信息：

```go
package main

import (
    "net/http"
    "time"
    "math/rand"
    
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
)

var (
    // 定义一个直方图，记录 HTTP 请求耗时
    httpDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP 请求耗时（秒）",
            Buckets: prometheus.DefBuckets, // 默认桶：[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        },
        []string{"method", "path", "status"},
    )
)

func init() {
    prometheus.MustRegister(httpDuration)
}

// middleware 是一个 HTTP 中间件，自动记录请求耗时
// 为什么这样写：中间件模式可以自动捕获所有请求，无需每个 handler 单独埋点
func middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // 包装 ResponseWriter 以获取状态码
        sw := &statusWriter{ResponseWriter: w}
        next.ServeHTTP(sw, r)
        
        duration := time.Since(start).Seconds()
        
        // 从请求上下文中获取 Trace ID
        // 为什么这样写：OpenTelemetry 会自动传播 Trace 上下文
        // 如果请求包含 W3C Trace-Context 头，span 会自动关联
        span := trace.SpanFromContext(r.Context())
        spanContext := span.SpanContext()
        
        // 创建观测值，并附加 Exemplar
        // Exemplar 包含 Trace ID，Grafana 可以用它跳转到 Tempo
        //
        // 为什么这样写：只对慢请求附加 Exemplar
        // 避免每个请求都生成 Exemplar，减少存储开销
        if duration > 0.5 {  // 只对耗时 > 500ms 的请求记录 Exemplar
            // 创建带 Exemplar 的观测值
            httpDuration.WithLabelValues(
                r.Method, r.URL.Path, strconv.Itoa(sw.status),
            ).(prometheus.ExemplarObserver).ObserveWithExemplar(
                duration,
                prometheus.Labels{
                    "trace_id": spanContext.TraceID().String(),
                    "span_id":  spanContext.SpanID().String(),
                },
            )
        } else {
            // 普通请求不记录 Exemplar
            httpDuration.WithLabelValues(
                r.Method, r.URL.Path, strconv.Itoa(sw.status),
            ).Observe(duration)
        }
    })
}

type statusWriter struct {
    http.ResponseWriter
    status int
}

func (w *statusWriter) WriteHeader(status int) {
    w.status = status
    w.ResponseWriter.WriteHeader(status)
}
```

### 第二步：配置 Prometheus 启用 Exemplar 存储

```yaml
# prometheus.yml
# 为什么这样写：Exemplar 需要显式启用，默认不存储

global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Exemplar 存储配置
# 为什么这样写：Exemplar 使用独立的存储配置
# 可以单独控制保留时间和存储大小
storage:
  exemplar:
    # 每个序列最多保留 3 个 Exemplar
    # 为什么是 3：太多会增加存储和查询开销
    # 太少可能导致 Exemplar 被快速覆盖
    max_exemplars: 3

scrape_configs:
  - job_name: 'my-app'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8080']
```

### 第三步：配置 Grafana 数据源关联

1. **添加 Prometheus 数据源**
   - URL: `http://prometheus:9090`
   - 开启 Exemplar 支持（在数据源设置中）

2. **添加 Tempo 数据源**
   - URL: `http://tempo:3200`
   - 配置 Trace to Logs（可选）

3. **配置 Exemplar 跳转**

在 Grafana 的 Prometheus 数据源配置中：

```
# 在 Prometheus 数据源的 "Exemplars" 配置中：
Internal link: Tempo
Data source: Tempo
Trace ID field: trace_id  # 与代码中的 Exemplar label 名称一致
```

### 第四步：验证配置

```bash
# 查询验证 Exemplar 是否已存储
curl -g 'http://localhost:9090/api/v1/query?query=http_request_duration_seconds_bucket&exemplar=1'

# 返回结果示例
{
  "data": {
    "result": [
      {
        "metric": { "__name__": "http_request_duration_seconds_bucket", "le": "1.0" },
        "value": [1705310400, "250"],
        "exemplars": [
          {
            "labels": {
              "trace_id": "abc123def456",
              "span_id": "789012"
            },
            "value": 0.95,
            "timestamp": 1705310400
          }
        ]
      }
    ]
  }
}
```

---

## 12.4 真实案例：Exemplar 定位慢 SQL，P99 从 2s 降到 200ms

### 事故背景

某金融科技公司的核心交易系统，每天处理 500 万笔交易。某次上线后，P99 延迟从 200ms 飙升至 2s，但常规手段无法定位根因。

### 传统排障流程（无 Exemplar）

```
1. 看到 P99 突刺告警                   耗时：0 秒（立即发现）
2. 检查 CPU、内存、网络指标            耗时：5 分钟（都正常）
3. 查看业务日志                        耗时：15 分钟（只有 INFO 级别慢请求，无 ERROR）
4. 随机抽样几个慢请求的 Trace ID       耗时：10 分钟（手工提取）
5. 在 Jaeger 中查询这些 Trace          耗时：5 分钟（找到几个慢 Trace）
6. 分析慢 Trace 中的 Span              耗时：10 分钟（发现数据库 Span 耗时高）
7. 手动复现慢 SQL                      耗时：20 分钟（找到慢查询）
总耗时：约 65 分钟
```

### Exemplar 排障流程

```
1. 看到 P99 突刺告警                   耗时：0 秒
2. 在 Grafana 面板上点击突刺点          耗时：10 秒
   → 自动跳转到 Tempo，查看对应 Trace
3. 在 Trace 中发现数据库 Span 耗时 1.5s 耗时：30 秒
4. 直接查看慢 SQL 语句                  耗时：10 秒
5. 优化 SQL（加索引）                   耗时：10 分钟
总耗时：约 11 分钟
```

### 根因分析

```sql
-- Before: 没有索引的全表扫描
SELECT * FROM orders 
WHERE status = 'PENDING' 
  AND created_at > NOW() - INTERVAL 7 DAY
ORDER BY amount DESC;

-- 执行计划显示：Type=ALL（全表扫描），rows=5000000
-- 耗时：1.5秒

-- After: 添加联合索引
ALTER TABLE orders ADD INDEX idx_status_created (status, created_at);

-- 执行计划显示：Type=ref（索引查找），rows=1000
-- 耗时：50毫秒
```

### Before/After 对比

| 指标 | Before | After |
|------|--------|-------|
| P99 延迟 | 2.0 秒 | 200 毫秒 |
| 慢查询占比 | 15% | 0.1% |
| 排障时间 | 65 分钟 | 11 分钟 |
| 数据库 CPU | 85% | 30% |

---

## 12.5 进阶：日志与追踪的联动

除了指标与追踪的联动，日志与追踪的关联同样重要。

### 在日志中注入 Trace ID

```go
import (
    "go.uber.org/zap"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
)

func handler(w http.ResponseWriter, r *http.Request) {
    // 从请求上下文中提取 Trace ID
    span := trace.SpanFromContext(r.Context())
    traceID := span.SpanContext().TraceID().String()
    
    // 在日志中注入 Trace ID
    // 为什么这样写：将 Trace ID 注入日志后，
    // 在 Grafana 中可以从日志直接跳转到 Tempo
    logger.Info("处理用户请求",
        zap.String("trace_id", traceID),
        zap.String("user_id", r.Header.Get("X-User-ID")),
        zap.String("path", r.URL.Path),
    )
    
    // 处理业务逻辑...
}
```

### Grafana 配置：日志 → 追踪跳转

在 Loki 数据源中配置：

```
Derived fields:
  Name: Trace ID
  Regex: trace_id=(\w+)
  URL: ${Tempo_URL}/trace/${value}
```

这样在 Grafana Explore 的日志中，点击高亮的 Trace ID 就能直接跳转到 Tempo。

---

## 12.6 完整联动链路

```
┌─────────────────────────────────────────────────────────────┐
│                     Grafana                                 │
│  ┌─────────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │  Metrics Panel  │    │  Log Panel   │    │ Trace    │  │
│  │  (P99 延迟)      │◄──►│ (ERROR 日志)  │◄──►│ (Span)   │  │
│  │                 │    │              │    │          │  │
│  │  点击突刺点      │    │ 点击 TraceID │    │ 查看详情 │  │
│  │  → 跳转 Trace   │    │ → 跳转 Trace │    │          │  │
│  └────────┬────────┘    └──────┬───────┘    └────┬─────┘  │
└───────────┼────────────────────┼─────────────────┼────────┘
            │                    │                  │
            ▼                    ▼                  ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │  Prometheus   │    │    Loki      │    │    Tempo     │
    │  (指标存储)    │    │  (日志存储)   │    │  (追踪存储)  │
    │  + Exemplar   │    │  + TraceID   │    │              │
    └──────────────┘    └──────────────┘    └──────────────┘
            ▲                    ▲                  ▲
            │                    │                  │
            └────────────────────┼──────────────────┘
                                 │
                          ┌──────┴──────┐
                          │   应用服务    │
                          │ (埋点 + 日志) │
                          └─────────────┘
```

### 排障场景演练

假设现在 P99 又突刺了，你的排障流程应该是：

```
1. 收到告警：P99 = 2.5s
2. 在 Grafana 面板上点击突刺点
   → 自动跳转到 Tempo，显示对应的慢 Trace
3. 在 Trace 中发现：
   - API Gateway Span: 100ms
   - Auth Service Span: 50ms
   - Order Service Span: 2.3s ← 瓶颈在这里
   - Database Span: 2.0s ← 真正的问题
4. 点击数据库 Span，查看详情：
   - SQL: SELECT * FROM orders WHERE ...
   - 耗时: 2.0s
5. 使用 Trace ID 搜索关联日志：
   - 发现在同一时间段，数据库连接池告警
   - 连接池使用率 100%
6. 定位根因：慢 SQL 占满了连接池
7. 优化：加索引 + 连接池扩容
```

---

## 12.7 最佳实践

### 1. 采样策略

```go
// 只对慢请求记录 Exemplar
// 为什么：Exemplar 有存储成本，对所有请求都记录没有意义
if duration > threshold {
    observeWithExemplar(duration, traceID)
} else {
    observe(duration)
}
```

### 2. Exemplar 保留策略

```
# 根据场景调整 max_exemplars
storage:
  exemplar:
    max_exemplars: 3  # 默认值，适合大多数场景
    # 如果是低流量服务，可以设大一些
    # 如果是高流量服务，3 已经足够
```

### 3. 标签命名一致性

```go
// 确保所有组件使用相同的标签名
// Prometheus Exemplar label: trace_id
// Tempo 查询字段: trace_id
// Loki derived field: trace_id=(\w+)
```

### 4. 避免 Exemplar 过载

```
# 在 Prometheus 中监控 Exemplar 数量
prometheus_storage_exemplars_exemplars_loaded
prometheus_storage_exemplars_series_with_exemplars
```

---

## 本章小结

| 概念 | 要点 |
|------|------|
| **Exemplar** | 在指标中嵌入追踪 ID，实现指标到追踪的跳转 |
| **三大支柱联动** | 指标发现问题，追踪定位问题，日志分析根因 |
| **配置步骤** | 应用埋点 -> Prometheus 启用 Exemplar -> Grafana 配置数据源关联 |
| **排障效率** | Exemplar 可将排障时间从小时级降到分钟级 |
| **采样策略** | 只对慢请求或错误请求记录 Exemplar，控制存储成本 |

---

## 扩展阅读

- [Prometheus Exemplar 文档](https://prometheus.io/docs/prometheus/latest/feature_flags/#exemplars-storage)
- [Grafana Exemplar 配置](https://grafana.com/docs/grafana/latest/fundamentals/exemplars/)
- [OpenTelemetry Go SDK](https://pkg.go.dev/go.opentelemetry.io/otel)
- [Tempo 文档](https://grafana.com/docs/tempo/latest/)
