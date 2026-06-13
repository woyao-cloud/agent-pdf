# 第5章 链路追踪与性能分析集成（Tempo / Jaeger / Pyroscope）

## 5.1 场景故事：从"指标看到异常"到"定位到代码行"

2024 年双 11 当天，某电商公司的 SRE 小林盯着监控大屏。

**第一阶段：指标发现异常**

"P99 延迟从 200ms 飙升到了 2s！" 小林看到 Prometheus 面板上的红线突然飙高。

他马上检查了 CPU、内存、网络——都正常。问题在哪？

**第二阶段：Exemplar 跳转到 Trace**

他点击了 P99 曲线上的异常数据点，弹出一个窗口：
```
TraceID: 8a3f7b2c-1d4e-5f6a
Duration: 2.1s
[View Trace]
```

点击 "View Trace"，跳转到 Tempo。

**第三阶段：火焰图定位慢 Span**

火焰图清晰地显示：

```
█ HTTP POST /api/order/create (2.1s)                     █ 100%
  █ order-service.createOrder (1.9s)                      █ 90%
    █ payment-service.charge (1.5s)                       █ 71%
      █ Redis GET (1.4s)                                  █ 67%
```

"Redis GET 花了 1.4 秒？这不可能！" 小林立即联系 DBA。

DBA 检查后发现：Redis 集群中的一个节点因为内存满了触发了 SWAP，导致读取延迟飙升。

**最终结果**：从发现异常到定位到"Redis 内存满了"，只用了 3 分钟。如果没有分布式追踪，这个过程可能需要数小时。

---

## 5.2 核心原理：Trace 的树状结构

### 比喻：Trace = 快递物流追踪

想象你在淘宝买了一个手机，快递的流转过程：

| 快递物流 | 分布式追踪 |
|---------|-----------|
| 整个快递过程 | **Trace**（一次完整的请求）|
| 每个中转站的处理 | **Span**（一个服务节点的处理）|
| 中转站的处理时间 | **Span Duration**（处理耗时）|
| 发货 → 到达的全程时间 | **Trace Duration**（请求总耗时）|
| 快递单号 | **TraceID**（全局唯一标识）|
| 中转站内部操作编号 | **SpanID**（节点内唯一）|
| 上一个中转站的编号 | **Parent SpanID**（父节点）|

```
Trace: 快递单号 SF1234567890
├── Span: 深圳仓库打包（5分钟）
│   └── Span: 深圳→广州运输（30分钟）
├── Span: 广州分拣中心分拣（10分钟）
│   ├── Span: 广州→武汉运输（2小时）
│   └── Span: 广州→长沙运输（1.5小时）
└── Span: 长沙配送站派送（20分钟）
    └── Span: 快递员上门（5分钟）
```

如果快递慢了，你会问："哪个环节最慢？"

同样，在分布式系统中，如果请求慢了，你要问："哪个 Span 最慢？"

### Tempo 中的 Trace 数据结构

```
Root Span: HTTP POST /api/order (2.1s)
├── Span: auth-service.verifyToken (2ms)
│   └── Span: Redis GET token:abc (1ms)
├── Span: order-service.createOrder (1.9s)
│   ├── Span: MySQL INSERT orders (10ms)
│   └── Span: payment-service.charge (1.5s)
│       ├── Span: Redis GET rate:limit (1.4s)   ← 瓶颈在这里！
│       └── Span: HTTP POST /payment/gateway (80ms)
│           └── Span: payment-gateway.charge (75ms)
└── Span: notification-service.sendEmail (5ms)
    └── Span: Kafka PUSH notify (3ms)
```

**关键**：从根到叶子的路径上，耗时最长的那个 Span 就是瓶颈。

---

## 5.3 Tempo 数据源配置（手把手）

### 步骤 1：配置 Tempo 数据源

1. 打开浏览器，访问 Grafana（http://localhost:3000）
2. 左侧菜单 → **Configuration（齿轮图标）** → **Data Sources**
3. 点击 **Add data source**
4. 搜索 "Tempo"，点击 **Tempo**
5. 填写以下信息：

```
Name: Tempo
URL: http://tempo:3200
```

6. 展开 **Service Graph** 配置：
   - 开启 **Node Graph**
   - 在 **Data source** 中选择已配置的 Prometheus（Service Graph 需要 Prometheus 指标）
7. 点击 **Save & Test**

**YAML 配置方式：**

```yaml
# provisioning/datasources/tempo.yml
apiVersion: 1

datasources:
  - name: Tempo
    type: tempo
    uid: tempo
    access: proxy
    url: http://tempo:3200
    # ↑ Tempo 的 HTTP API 地址
    #   默认端口是 3200（注意：OTLP gRPC 是 4317，不是这个）
    
    jsonData:
      httpMethod: GET
      
      # Service Graph 配置
      serviceMap:
        datasourceUid: prometheus
        # ↑ Service Graph 依赖 Prometheus 的指标数据
        #   需要指向已经配置好的 Prometheus 数据源
      
      nodeGraph:
        enabled: true
        # ↑ 开启节点图（在 Trace 详情页显示服务拓扑）
```

### 步骤 2：配置 Prometheus Exemplar 实现一键跳转

Exemplar 是 Prometheus 的一个特性，它在指标数据点中嵌入 TraceID。

**原理**：

```
Prometheus 时间序列中的每个数据点：

时间戳: 1704067200
值: 0.99
Exemplar:
  - TraceID: 8a3f7b2c-1d4e-5f6a
  - SpanID: abc123
```

这样，当你在 Grafana 中点击一个数据点时，就能找到对应的 Trace。

**配置步骤**：

1. **确保 Prometheus 启用了 Exemplar 存储**：
```bash
# 在 Prometheus 启动参数中添加
--enable-feature=exemplar-storage
```

2. **配置 Grafana Prometheus 数据源**：
```yaml
jsonData:
  exemplar: true  # 启用 Exemplar 支持
```

3. **应用端注入 Exemplar**（以 Go 为例）：
```go
// 在 Prometheus Histogram 中注入 Exemplar
httpRequestDuration.With(prometheus.Labels{
    "service": "order-service",
}).(prometheus.ExemplarObserver).ObserveWithExemplar(
    0.5, // 请求耗时
    prometheus.Labels{
        "TraceID": "8a3f7b2c-1d4e-5f6a",
    },
)
```

### 步骤 3：验证 Exemplar 跳转

1. 打开一个 Time Series 面板，查询 P99 延迟
2. 鼠标悬停在某个数据点上
3. 如果该数据点有 Exemplar，会看到一个 **View Trace** 链接
4. 点击后跳转到 Tempo 的 Trace 详情页

---

## 5.4 TraceQL：检索 Trace 的语言

TraceQL 是 Tempo 的查询语言，类似于 PromQL 对于 Prometheus、LogQL 对于 Loki。

```traceql
# ============================================================
# TraceQL 查询示例
# ============================================================

# 最简单的查询：按服务名找 Trace
{ .service.name = "order-service" }

# 按耗时过滤：只找耗时超过 1 秒的慢 Trace
# 场景：排查 P99 延迟问题
{ .service.name = "order-service" && .duration > 1s }

# 按状态码过滤：只找 500 错误的 Trace
# 场景：排查错误率飙升
{ .http.status_code >= 500 }

# 嵌套查询：找包含错误 Span 的 Trace
# 即使根 Span 成功，但子 Span 有错误的也要找出来
{ .service.name = "api-gateway" && { .status = error } }

# 按资源属性过滤
# 场景：特定集群、特定命名空间的问题
{ .cluster = "prod" && .namespace = "default" }
```

**TraceQL 的关键特点**：
- 基于**属性**（Attribute）查询，不是基于文本
- 支持**嵌套条件**（花括号内再写花括号）
- 支持**时间范围**（在 Grafana 顶部选择时间范围）

---

## 5.5 Service Graph：自动生成服务拓扑图

### 工作原理

Service Graph 通过分析 Trace 数据中的 `client` 和 `server` 标签，自动构建微服务调用关系图。

```
                ┌─────────────┐
                │ API Gateway  │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  Auth    │ │  Order   │ │  Payment │
    │  Service │ │  Service │ │  Service │
    └──────────┘ └────┬─────┘ └──────────┘
                      │            │
                      ▼            ▼
                 ┌─────────┐ ┌──────────┐
                 │  MySQL  │ │  Redis   │
                 └─────────┘ └──────────┘
```

**图中每个元素的意义**：

| 元素 | 含义 |
|------|------|
| 节点（方框）| 一个微服务或外部依赖 |
| 箭头方向 | 调用方向（A → B 表示 A 调用了 B）|
| 边的颜色 | 绿色 = 正常，黄色 = 延迟较高，红色 = 错误率高 |
| 边的粗细 | 越粗 = 请求量越大 |

### 真实案例：Service Graph 发现 Redis 调用异常

**背景**：某公司的 Service Graph 显示 Payment Service → Redis 的边变成了红色。

**排查过程**：
1. 点击红色边 → 查看相关 Trace
2. 发现大量 Trace 中 Redis GET 操作耗时 > 1s
3. 进一步检查发现：Redis 集群中有一个节点被分配了过多的 key，导致该节点负载过高
4. 调整 key 分布策略后，红色边变回绿色

**没有 Service Graph 会怎样？**
- SRE 需要在多个监控面板之间切换
- 可能花数小时才能发现是 Redis 的问题
- Service Graph 让"服务间的依赖关系和健康状态"一目了然

---

## 5.6 火焰图（Flame Graph）解读

### 比喻：火焰图 = 公司年度预算

想象你在看一家公司的年度预算：

| 火焰图 | 公司预算 |
|-------|---------|
| 最底层的横条 | 总预算（100%）|
| 每个矩形 | 一个部门的预算 |
| 矩形的宽度 | 该部门花费的时间/资源占比 |
| 颜色（红/橙/黄）| 该函数是否是热点（是否值得优化）|

```
Flame Graph（CPU 使用分布）
─────────────────────────────────────────────
█ main.main                                    █ 100%
█   █ http.HandleFunc                          █ 80%
█     █ json.Unmarshal                         █ 30%
█     █ database/sql.Query                     █ 25%
█       █ mysql.connect                        █ 15%
█         █ tcp.connect                        █ 10%
█   █ runtime.gc                               █ 10%
█   █ http.ListenAndServe                      █ 10%
```

**如何读火焰图？**
1. 最宽的矩形 = 最耗时的函数（优先优化）
2. 从下往上看 = 调用栈的入口到出口
3. 颜色没有特殊含义，只是为了区分不同的调用栈

**优化优先级**：
1. `json.Unmarshal` 占 30% → 是否可以减少 JSON 解析？使用更高效的序列化库？
2. `tcp.connect` 占 10% → 是否可以启用连接池？

---

## 5.7 持续剖析（Pyroscope）集成

### 什么是持续剖析？

持续剖析以极低的采样开销（通常 < 1% CPU），持续采集应用的 CPU、内存、IO 等资源的使用分布。

**对比：**

| 方法 | 优点 | 缺点 |
|------|------|------|
| 传统 Profiling（pprof）| 详细 | 需要手动触发，只能看瞬间 |
| 持续 Profiling（Pyroscope）| 自动持续采集 | 采样频率较低 |
| APM（Datadog/Dynatrace）| 自动 + 详细 | 费用高昂 |

### 配置 Pyroscope 数据源

```yaml
# provisioning/datasources/pyroscope.yml
datasources:
  - name: Pyroscope
    type: grafana-pyroscope-datasource
    uid: pyroscope
    url: http://pyroscope:4040
    jsonData:
      minStep: "15s"  # 最小采样间隔
```

### 典型查询

```pyroscope
# 查看 CPU 使用分布
cpu:process_cpu_usage{service="order-service"}

# 按函数名过滤（只关注 JSON 相关的函数）
cpu:process_cpu_usage{service="order-service", function_name=~".*json.*"}

# 查看内存分配
memory:alloc_space{service="order-service"}
```

### 使用场景

1. **性能优化**：找到 CPU 热点函数，针对性优化
2. **内存泄漏排查**：对比不同时间点的内存火焰图，找到增长最快的函数
3. **版本回归**：新版本上线后，对比火焰图发现性能退化

---

## 5.8 真实案例：采样策略选择

### 问题

某公司的高流量服务每秒产生 5000 条 Trace，全部存储导致 Tempo 存储成本每月超过 2 万美元。

### 采样策略对比

```yaml
# ❌ 不采样：全量存储
# 成本：每月 $20,000+
# 好处：任何 Trace 都能查到
# 坏处：成本过高，大部分 Trace 永远不会被查看

# ✅ 概率采样：10%
# 成本：每月 $2,000
# 好处：能反映整体情况
# 坏处：偶发的慢 Trace 可能被采样丢弃

# ✅ 自适应采样：根据错误率和延迟动态调整
# 成本：每月 $3,000
# 好处：异常 Trace 100% 保留，正常 Trace 采样 10%
# 坏处：配置复杂
```

### 推荐方案

```yaml
# Tempo 配置：自适应采样
distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317

overrides:
  ingestion:
    rate_limit: 1000  # 每秒最多 1000 个 Span
  
  metrics_generator:
    processor:
      service_graphs:
        enabled: true  # 开启 Service Graph 生成
```

**自适应采样的策略**：
- 正常请求：10% 采样
- 错误请求（status >= 500）：100% 采样
- 慢请求（duration > 1s）：100% 采样

这样既控制了存储成本，又确保异常 Trace 不会丢失。

---

## 5.9 风险与最佳实践

### 风险 1：Trace 数据量过大

| 策略 | 配置 | 适用场景 |
|------|------|---------|
| 概率采样 | 10% 采样率 | 高流量服务 |
| 速率限制 | 每秒 100 条 | 稳定流量服务 |
| 头部采样 | 入口处决定 | 需要完整 Trace |

### 风险 2：Service Graph 不显示

**排查步骤**：
```
□ Prometheus 数据源已配置？         → 检查 Data Sources
□ Tempo 数据源的 serviceMap 配置了？ → 检查 datasourceUid
□ Prometheus 采集了 span 指标？      → 查 traces_spanmetrics_latency_*
□ metrics_generator 已开启？        → 检查 Tempo 配置
```

### 风险 3：火焰图渲染性能

**问题**：深度超过 100 层的火焰图在浏览器中渲染缓慢。

**解决**：
1. 限制采样深度（配置 Pyroscope 的 `max-depth`）
2. 使用"自动折叠"功能（合并相同调用栈）
3. 在查询中过滤不需要的函数

---

## 5.10 典型问题处理

### 问题 1：Tempo 查询返回 "Trace not found"

**原因**：Trace 已被过期删除，或采样策略丢弃了该 Trace。

**排查**：
1. 检查 Tempo 的 retention 配置：`storage.trace.retention_period`
2. 确认采样策略：查看 Tempo 的 `overrides` 配置
3. 检查 TraceID 格式：Tempo 接受 32 位十六进制字符串

### 问题 2：Exemplar 不显示

**排查**：
```
□ Prometheus 启用 exemplar-storage？   → --enable-feature=exemplar-storage
□ Grafana 数据源开启 exemplar？         → jsonData.exemplar: true
□ 应用端注入 Exemplar？                 → 检查代码中的 ObserveWithExemplar
```

### 问题 3：Service Graph 不显示

**排查步骤**：
1. 确认 Prometheus 数据源已配置
2. 确认 Tempo 数据源中 `serviceMap.datasourceUid` 指向正确的 Prometheus
3. 确认 Prometheus 采集了 `traces_spanmetrics_latency_*` 指标

---

## 5.11 开发者必须掌握的技能

| 技能 | 掌握程度 |
|------|---------|
| TraceQL 语法 | 必须熟练 |
| 火焰图阅读 | 必须熟练 |
| Exemplar 原理与配置 | 常用 |
| Service Graph 解读 | 常用 |
| 采样策略设计 | 理解 |
| 持续剖析配置 | 了解 |

---

## 本章小结

- **Trace = 快递物流**，每个 Span = 一个中转站，Span 树 = 物流路径
- **Tempo 数据源** + **Prometheus Exemplar** = 从指标到 Trace 的一键跳转
- **TraceQL** 通过属性检索 Trace，类似 PromQL 和 LogQL
- **Service Graph** 自动生成微服务拓扑图，红色边 = 有问题
- **火焰图**：越宽的矩形越值得优化
- **采样策略**：正常 10% 采样，异常 100% 采样，在成本和完整性之间平衡
- **持续剖析**（Pyroscope）自动采集 CPU/内存火焰图，定位代码级瓶颈

> **核心心法**：从"指标看到异常"到"定位到代码行"，Tempo 补全了监控体系中最关键的一环——告诉你"为什么慢"。
