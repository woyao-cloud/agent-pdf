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

## 13.4 指标上线 Review 流程

新指标的上线应该有规范的审批流程，防止高基数指标流入生产环境：

```
申请 → Review → 测试 → 上线 → 观察
```

### 指标 Review 检查清单

- [ ] 指标命名是否符合 `namespace_subsystem_name_unit` 规范？
- [ ] 所有 Label 的预期基数是否 < 100？
- [ ] 是否使用了动态值（user_id、order_id、trace_id）作为 Label？
- [ ] 指标类型选择是否正确（Counter vs Gauge vs Histogram）？
- [ ] Histogram 的 Bucket 边界是否符合业务特征？
- [ ] 指标是否已有对应的 Grafana Dashboard 面板？
- [ ] 是否需要配置 Recording Rule 预计算？
- [ ] 是否需要配置告警规则？

```yaml
# 指标注册模板
metric_name: http_request_duration_seconds
type: histogram
description: "HTTP request duration in seconds"
labels:
  - name: method
    cardinality: 5        # GET/POST/PUT/DELETE/PATCH
  - name: endpoint
    cardinality: 20       # 最多 20 个端点
  - name: status
    cardinality: 10       # 2xx/3xx/4xx/5xx
total_cardinality: 1000   # 5 × 20 × 10 = 1000 ✅ < 10000
histogram_buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

## 13.5 Grafana Dashboard 规范

### 面板布局规范

```
Row 1: 全局概览（QPS、错误率、P99 延迟）→ 时间序列图
Row 2: 按维度拆分（按 method、endpoint、status）→ 堆叠图
Row 3: 详细指标（GC、内存、线程）→ 时间序列图
Row 4: 事件标记（发布、扩缩容）→ 注释标记
```

### 最佳实践

1. **模板化变量**：使用 Grafana 的模板变量（$job、$instance、$method）让面板可复用
2. **一致的色系**：错误用红色、正常用绿色、警告用黄色
3. **单位标注**：延迟用 ms、内存用 GB、QPS 用 req/s
4. **阈值线**：在图上标注 SLA 阈值（红色虚线），一眼看出是否超标
5. **链接面板**：配置面板间的跳转链接，从概览到详情

```json
// Grafana 模板变量配置示例
{
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "query": "label_values(up, job)",
        "refresh": 1,
        "includeAll": true
      },
      {
        "name": "instance",
        "type": "query",
        "query": "label_values(up{job=\"$service\"}, instance)",
        "refresh": 1
      }
    ]
  }
}
```

### Dashboard 命名规范

```
[层级] [组件] [指标类型] - [团队]
示例：
K8s Node CPU Usage - Platform
App Order P99 Latency - OrderTeam
Infra MySQL Connections - DBA
```

## 13.6 On-Call 轮值规范

### 告警响应流程

```
告警触发
  │
  ├── P0: 立即响应（5 分钟内确认）
  │     ├── 确认告警（Acknowledge）
  │     ├── 排查根因
  │     ├── 执行恢复操作（回滚/扩容/切流）
  │     └── 通知升级（15 分钟未解决 → 联系 TL）
  │
  ├── P1: 快速响应（15 分钟内确认）
  │     ├── 确认告警
  │     ├── 评估影响范围
  │     └── 决定是否需要紧急修复
  │
  ├── P2: 工作时间内处理（1 小时内）
  │     └── 创建 Jira Ticket，排期修复
  │
  └── P3: 周报汇总（24 小时内）
        └── 记录到周报，持续跟进
```

### 轮值制度要点

1. **主备机制**：每班次 1 主 1 备，主负责处理，备负责兜底
2. **交接清单**：交班时确认未关闭告警、进行中的变更、已知问题
3. **事后复盘**：P0/P1 事件需要在 48 小时内完成 5W1H 复盘（What/When/Where/Who/Why/How）
4. **免打扰时段**：非 P0 告警在夜间自动静默，次日早晨通知

### 告警疲劳防范

```yaml
# 告警疲劳信号
# 如果某个告警在一周内触发了 10 次以上但从未被确认 → 阈值不合理
# 如果某个告警被持续静默超过 7 天 → 应该修复而不是静默
# 如果某个告警恢复通知无人关注 → 降低级别或删除
```

## 13.7 监控成熟度模型

| 级别 | 名称 | 特征 | 评估标准 |
|:----:|------|------|---------|
| L0 | 无监控 | 系统崩溃了才知道 | 无指标采集、无告警 |
| L1 | 基础监控 | 有 CPU/内存/磁盘告警 | 只有基础设施指标，无业务指标 |
| L2 | 应用监控 | 有 QPS/错误率/延迟 | RED 方法覆盖，有自定义指标 |
| L3 | 可观测性 | Metrics + Logs + Traces 联动 | Exemplar、Loki、Tempo 集成 |
| L4 | 智能化 | 自动根因分析、容量预测 | 基于 ML 的异常检测、自动扩缩容 |

**当前大多数团队处于 L1-L2 之间。** 本书的目标是帮助读者达到 L3 水平。 |

## 本章小结

- 命名规范遵循 `namespace_subsystem_name_unit` 格式
- 告警分级 P0-P3 对应不同的响应 SLA 和通知渠道
- RED 方法适用于微服务，USE 方法适用于基础设施
- 指标上线应有 Review 流程，从源头控制基数
- Grafana Dashboard 应遵循一致的布局和命名规范
- On-Call 轮值制度保障告警有人响应、有流程可循
- 监控成熟度从 L0 到 L4，本书目标是帮助读者达到 L3（可观测性）
- 无论哪种方法论，核心都是"用最少的指标覆盖最关键的信息"