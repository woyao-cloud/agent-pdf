# 第9章 Kibana 数据探索与大屏实战

## 本章导读

数据进入 ES 后，Kibana 是查看和分析这些数据的窗口。本章从创建 Data View 开始，到搭建一个完整的"微服务健康度实时监控大屏"。

---

## 9.1 创建 Data View

```bash
# 1. 打开 Kibana → Management → Stack Management → Data Views
# 2. 点击 "Create Data View"

# 配置：
# Name: app-logs
# Index pattern: app-logs-*
# Timestamp field: @timestamp

# 完成后，Kibana 会自动识别 Mapping 中的字段类型
# 可以在 Data View 中设置字段格式：
# duration → 格式为 Duration (milliseconds)
# status_code → 格式为 Number
```

---

## 9.2 KQL 高级查询语法

```kql
# KQL（Kibana Query Language）速查

# 精确匹配
level: "ERROR"

# 通配符
serviceName: order-*

# 范围查询
duration > 1000
duration >= 100 and duration <= 500

# 多条件 AND
level: "ERROR" AND serviceName: "order-service"

# 多条件 OR
level: "ERROR" OR level: "WARN"

# 取反
NOT level: "INFO"

# 字段存在
traceId: *

# 嵌套字段
user.name: "张三"

# 搜索时间范围
@timestamp >= "2024-01-01T00:00:00Z" and @timestamp <= "2024-01-02T00:00:00Z"

# 组合示例（最常见的排障查询）
level: "ERROR" and serviceName: "order-service" and traceId: "abc*"
```

---

## 9.3 微服务健康度实时监控大屏

```
大屏布局建议（4 行）：

  第 1 行：全局概览
  ┌────────────┬────────────┬────────────┬────────────┐
  │  总日志量   │  ERROR 数  │ 平均响应时间 │ 服务在线数  │
  │  (Metric)  │  (Metric)  │  (Metric)  │  (Metric)  │
  └────────────┴────────────┴────────────┴────────────┘

  第 2 行：错误趋势
  ┌──────────────────────────────────────────────┐
  │  各服务 ERROR 趋势图                          │
  │  按 serviceName 分组，每 5 分钟一个 bucket    │
  │  使用 Line 图                                 │
  └──────────────────────────────────────────────┘

  第 3 行：接口性能
  ┌────────────────────┬─────────────────────────┐
  │  Top 10 耗时接口    │  响应时间分布            │
  │  按 request_path   │  duration 的百分位分布    │
  │  聚合最大值         │  P50/P95/P99            │
  └────────────────────┴─────────────────────────┘

  第 4 行：最新错误
  ┌──────────────────────────────────────────────┐
  │  最近 10 条 ERROR 日志实时流                  │
  │  自动刷新（5 秒）                             │
  └──────────────────────────────────────────────┘
```

### 核心指标配置

```kibana
# 1. ERROR 趋势图（Lens 可视化）
# 指标：Count of records
# 筛选：level: ERROR
# 水平轴：@timestamp（每 5 分钟一个区间）
# 垂直轴：按 serviceName 拆分为多条线

# 2. Top 10 耗时接口（聚合）
# 指标：Max(duration)
# 分组：Top 10 request_path
# 排序：按 duration 降序

# 3. 响应时间分布（Percentile Ranks）
# 字段：duration
# 百分位：50.0, 95.0, 99.0
```

---

## 本章总结

Kibana 大屏的核心在于**选择合适的聚合方式**：Lens 适合快速图表、TSVB 适合时序分析、Aggregation Based 适合精确控制。从日志监控大屏开始，逐步熟悉这些可视化工具。