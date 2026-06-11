# 第13章 监控体系工程化规范

## 13.1 命名规范

### 指标命名

Prometheus 社区推荐的命名格式：

```
namespace_subsystem_name_unit
```

| 部分 | 说明 | 示例 |
|------|------|------|
| namespace | 命名空间/应用名 | `http`, `jvm`, `mysql` |
| subsystem | 子系统名 | `server`, `pool`, `cache` |
| name | 指标名 | `requests`, `connections` |
| unit | 单位（可选） | `seconds`, `bytes`, `total` |

**正确示例：**
- `http_requests_total` — HTTP 请求总数
- `node_cpu_seconds_total` — CPU 累计秒数
- `jvm_memory_used_bytes` — JVM 已用内存字节数
- `container_memory_usage_bytes` — 容器内存使用字节数

**错误示例：**
- `myapp.metric.1` — 不应使用点分隔符
- `GetRequests` — 不应使用驼峰命名
- `total_http_requests_count_of_app` — 不应过长

### Label 命名

| 推荐 | 不推荐 |
|------|--------|
| `method`, `endpoint`, `status` | `Method`, `Endpoint`（驼峰）|
| `region`, `zone` | `RegionName`（过长）|
| `service`, `version` | `service_name`（下划线过多）|

### 单位约定

| 单位 | 后缀 | 示例 |
|------|------|------|
| 秒 | `_seconds` | `http_request_duration_seconds` |
| 字节 | `_bytes` | `memory_usage_bytes` |
| 总数 | `_total` | `http_requests_total` |
| 比率 | `_ratio` | `cpu_usage_ratio` |
| 百分比 | `_percent` | `disk_usage_percent` |

## 13.2 告警分级与响应 SLA

### 告警级别定义

| 级别 | 名称 | 响应时间 | 通知渠道 | 示例场景 |
|------|------|---------|---------|---------|
| P0 | 核心链路中断 | 5 分钟 | 电话 + 钉钉 | 支付接口不可用、数据库宕机 |
| P1 | 严重问题 | 15 分钟 | 钉钉 + 邮件 | 错误率 > 5%、P99 延迟 > 1s |
| P2 | 警告 | 1 小时 | 邮件 | 磁盘使用率 > 80%、证书 30 天内过期 |
| P3 | 通知 | 24 小时 | 邮件周报 | 版本发布后的性能变化 |

### 告警规则示例

```yaml
# P0：核心链路中断 — 5 分钟无数据直接电话
- alert: PaymentServiceDown
  expr: absent(up{job="payment-service"} == 1)
  for: 5m
  labels: { severity: critical, pager: p0 }
  annotations:
    summary: "Payment service is DOWN (P0)"

# P1：错误率飙升
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
  for: 3m
  labels: { severity: warning, pager: p1 }
  annotations:
    summary: "Error rate > 5% on {{ $labels.instance }}"

# P2：磁盘即将满
- alert: DiskSpaceLow
  expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.2
  for: 10m
  labels: { severity: warning, pager: p2 }
  annotations:
    summary: "Disk space < 20% on {{ $labels.instance }}"
```

## 13.3 RED 与 USE 方法论

### RED 方法（微服务）

RED 是微服务监控的黄金方法论，由 Tom Wilkie 提出：

| 维度 | 含义 | 指标示例 |
|------|------|---------|
| **R**ate | 请求率 | `rate(http_requests_total[5m])` |
| **E**rrors | 错误率 | `rate(http_requests_total{status=~"5.."}[5m])` |
| **D**uration | 耗时 | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` |

**每个微服务都至少需要这三个维度。** 无论服务是什么语言、什么框架，RED 都是必须覆盖的基础指标。

### USE 方法（基础设施）

USE 由 Brendan Gregg 提出，适用于基础设施（服务器、数据库、网络设备）：

| 维度 | 含义 | 指标示例 |
|------|------|---------|
| **U**tilization | 利用率 | `avg by(instance)(rate(node_cpu_seconds_total[5m]))` |
| **S**aturation | 饱和度 | `node_load1 / count by(instance)(node_cpu_seconds_total)` |
| **E**rrors | 错误数 | `rate(node_network_receive_errors_total[5m])` |

### 方法论对照

| 场景 | 方法 | 覆盖范围 |
|------|------|---------|
| 微服务 | RED | Rate / Errors / Duration |
| 基础设施 | USE | Utilization / Saturation / Errors |
| 批处理 | 4 Golden Signals | Latency / Traffic / Errors / Saturation |

## 本章小结

- 命名规范遵循 `namespace_subsystem_name_unit` 格式
- 告警分级 P0-P3 对应不同的响应 SLA 和通知渠道
- RED 方法适用于微服务，USE 方法适用于基础设施
- 无论哪种方法论，核心都是"用最少的指标覆盖最关键的信息"