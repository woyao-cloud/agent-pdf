# 第9章 Kibana 数据探索与大屏实战

## 本章导读

想象一个场景：运营总监在早会上问："昨天上线的新功能，用户使用情况怎么样？" 没有 Kibana 大屏，你需要——写 SQL 查数据库、导出 CSV、用 Excel 画图表——至少 30 分钟。有 Kibana 大屏，你打开投影仪，直接展示昨晚的实时数据图表——30 秒。

Kibana 的核心价值是：**让非技术人员也能自己探索数据**。运营人员可以在 Kibana 中直接搜索、过滤、聚合日志数据，不需要每次都找开发写 SQL。

本章从 Kibana 的基础操作开始，逐步构建一个完整的微服务实时监控大屏。

---

## 9.1 创建 Data View

在 Kibana 中搜索数据之前，需要先创建一个 Data View（数据视图），告诉 Kibana 你有哪些索引、索引中的时间戳字段是什么。

```kibana
# 创建 Data View 步骤：
# Kibana → Management → Stack Management → Data Views → Create Data View

# 配置：
# Name: app-logs
# Index pattern: app-logs-*
#   → 匹配所有 app-logs-2024.01.15, app-logs-error-2024.01.15 等索引
# Timestamp field: @timestamp
#   → Kibana 使用这个字段做时间范围过滤和排序

# 保存后，Kibana 会自动识别 Mapping 中的字段类型：
# level          → keyword（可以用于精确搜索和聚合）
# message        → text（用于全文搜索）
# traceId        → keyword
# userId         → keyword
# duration       → long（可以用 range 查询和统计）
# stack_trace    → text（不建索引，节省空间）
```

### 字段格式化

```kibana
# 在 Data View 中可以设置字段的显示格式
# Data View → app-logs → 找到字段 → 设置格式

# duration 字段 → 格式：Duration → Milliseconds
# 效果：Kibana 中显示 "1534ms" 而不是 "1534"

# status_code 字段 → 格式：Number → Color
# 效果：200 显示为绿色，401 显示为黄色，500 显示为红色
```

---

## 9.2 KQL 高级查询语法

KQL（Kibana Query Language）是 Kibana 中最常用的查询语言。它的设计目标就是"**容易写、容易读**"——比 Lucene 语法更适合非技术人员使用。

### 基础查询

```kql
// 精确匹配
level: "ERROR"

// 通配符
serviceName: order-*

// 模糊匹配（contains）
message: "NullPointer"

// 范围查询（数值/时间）
duration > 1000
duration >= 100 and duration <= 500
@timestamp > now-1h

// 逻辑运算
// AND（可以省略，因为 KQL 默认是 AND）
level: "ERROR" AND serviceName: "order-service"

// OR
level: "ERROR" OR level: "WARN"

// NOT
NOT level: "INFO"

// 取反单个字段
level: "ERROR" AND NOT serviceName: "order-service"
```

### 常用查询模板

```kibana
// 场景 1：查最近的错误
@timestamp > now-1h AND level: "ERROR"

// 场景 2：查某个服务的错误（最常用的排障查询）
@timestamp > now-1h AND level: "ERROR" AND serviceName: "order-service"

// 场景 3：查慢请求（响应时间 > 3 秒的请求）
@timestamp > now-1h AND duration > 3000 AND serviceName: "payment-service"

// 场景 4：查特定订单的日志
orderId: "order_2001"

// 场景 5：查特定用户的跨服务日志（通过 traceId）
traceId: "abc-def-ghi-123"

// 场景 6：查异常栈中出现了特定关键词
@timestamp > now-24h AND level: "ERROR" AND stack_trace: "NullPointerException"

// 场景 7：查某个接口的调用量
requestPath: "/api/order/create"

// 场景 8：组合查询——最近 1 小时订单服务的所有 WARN 以上日志
@timestamp > now-1h AND serviceName: "order-service" AND (level: "ERROR" OR level: "WARN")
```

---

## 9.3 微服务健康度实时监控大屏

以下是一个可以直接配置到 Kibana 的生产级大屏模板。它包含 5 行共 8 个面板，覆盖了微服务监控的核心指标。

### 大屏布局

```
Kibana Dashboard 布局（5 行 8 面板）：

  第 1 行：关键数字（快速了解全局状态）
  ┌────────────┬────────────┬────────────┬────────────┐
  │  总日志量    │  ERROR 数  │  服务的数    │ 慢请求数    │
  │  最近 24h   │  最近 1h   │  活跃的     │ >3s 的     │
  │  Metric    │  Metric    │  Metric    │  Metric    │
  └────────────┴────────────┴────────────┴────────────┘

  第 2 行：日志趋势（核心指标）
  ┌──────────────────────────────────────────────┐
  │  各服务的 ERROR 趋势图                        │
  │  Y 轴：Count / X 轴：@timestamp（5 分钟间隔）  │
  │  按 serviceName 拆分为多条线                  │
  │  类型：Line 图                                │
  │  筛选：level: "ERROR"                         │
  └──────────────────────────────────────────────┘

  第 3 行：接口性能
  ┌─────────────────────┬────────────────────────┐
  │  Top 10 慢接口       │  响应时间分布           │
  │  request_path 排行   │  P50 / P95 / P99       │
  │  指标：avg(duration) │  Percentile 计算        │
  │  排序：降序           │  最近 1 小时             │
  └─────────────────────┴────────────────────────┘

  第 4 行：维度统计
  ┌─────────────────────┬────────────────────────┐
  │  ERROR 按服务分布    │  ERROR 按 logger 分布   │
  │  Pie 图              │  Data Table            │
  │  level: "ERROR"     │  按类名分组             │
  └─────────────────────┴────────────────────────┘

  第 5 行：实时日志流
  ┌──────────────────────────────────────────────┐
  │  最近 50 条 ERROR 日志（实时滚动）             │
  │  自动刷新：5 秒                                │
  │  显示：@timestamp、serviceName、message      │
  └──────────────────────────────────────────────┘
```

### 面板详细配置

```kibana
// 面板 1：ERROR 趋势图（最重要的面板）
// 类型：Lens → Line chart
// 指标：Count of records（计数）
// 筛选：level: "ERROR"
// X 轴：@timestamp date histogram（间隔 5 分钟）
// 拆分：Top 5 values of serviceName
// 样式：各服务不同颜色，图例在底部

// 面板 2：Top 10 慢接口
// 类型：Aggregation based → Data Table
// Bucket：Terms，字段 request_path，大小 10
// 指标 1：Average of duration
// 指标 2：Max of duration
// 排序：按 Average 降序
// 筛选：@timestamp > now-1h

// 面板 3：响应时间分布
// 类型：Aggregation based → Percentile Ranks
// 字段：duration
// 值：1000, 3000, 5000（针对 1s/3s/5s 三个阈值）
// 筛选：@timestamp > now-1h AND serviceName: "order-service"

// 面板 4：实时日志流
// 类型：Aggregation based → Top hits
// 大小：50
// 字段：@timestamp, serviceName, level, message
// 排序：@timestamp desc
// 筛选：level: "ERROR"
```

---

## 9.4 大屏的自动刷新与分享

```yaml
# 自动刷新
# Dashboard 右上角 → Refresh Every → 5 seconds
# 效果：大屏每 5 秒自动重新查询 ES

# 分享给团队
# Dashboard → Share → PDF / CSV / Link
# Link：生成一个静态链接，分享给同事
# PDF：导出当前大屏为报表

# 嵌入到其他系统
# Dashboard → Share → Embed code
# 生成 iframe 代码，嵌入到公司内部 Portal
```

---

## 本章总结

| 组件 | 用途 | 适合用户 |
|------|------|---------|
| **Discover** | 原始日志搜索 | 开发者（排障） |
| **Lens** | 快速创建可视化 | 运营（数据分析）|
| **TSVB** | 时间序列分析 | 开发者（性能监控）|
| **Dashboard** | 大屏展示 | 所有人 |
| **Canvas** | 精美大屏设计 | 运营（对外展示）|

**核心原则**：
1. **Kibana 是给团队用的，不只是给开发者用的**——运营、产品、技术支持都应该能用 Kibana 自己查数据。配置好 Data View 和字段格式化，降低非技术人员的使用门槛
2. **大屏的刷新频率不是越快越好**——5 秒刷新已经足够"实时"了。1 秒刷新会给 ES 带来不必要的压力
3. **把 KQL 查询模板贴在团队 Wiki 上**——收集常用的查询场景（查错误、查慢请求、查特定用户），写成 KQL 模板。这样即使不熟悉 Kibana 的人也能快速上手使用