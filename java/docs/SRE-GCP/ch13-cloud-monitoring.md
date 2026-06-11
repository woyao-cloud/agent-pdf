# 第 13 章 Cloud Monitoring 的实战配置

## 13.1 为什么监控配置很重要？

### 一个故事：告警风暴的噩梦

某团队配置了 200 多条告警规则——每个指标都设置了告警。一天，底层数据库发生故障，触发了 50 多条关联告警——所有依赖该数据库的服务都同时告警。

On-call 工程师的手机被消息轰炸，但真正的根因（数据库故障）被淹没在大量"次生告警"中。工程师花了 20 分钟才从告警风暴中找到根因。

**教训：** 告警不是越多越好。好的告警策略应该让你在 10 秒内知道"问题是什么"、"影响有多大"、"该找谁"。

### Cloud Monitoring 的核心功能

Cloud Monitoring 是 GCP 的监控服务平台，提供三个核心功能：

1. **指标收集**：自动收集 GCP 服务和自定义应用的指标
2. **仪表盘**：可视化展示指标数据
3. **告警**：在指标异常时通知相关人员

---

## 13.2 仪表盘：为不同受众设计

### 仪表盘设计原则

好的仪表盘应该让你的团队在 10 秒内判断出系统是否健康。

**设计原则：**

1. **从上到下，从概括到具体**：顶部是最关键的信息，底部的详细信息
2. **红色表示有问题**：异常的指标用红色高亮
3. **趋势比绝对值重要**：一张趋势图比一个数字更有价值
4. **保持一致**：所有服务的 Dashboard 使用相同的布局和配色

### SRE 团队仪表盘

```json
{
  "displayName": "SRE - 核心服务健康度",
  "dashboardFilters": [],
  "widgets": [
    {
      "title": "错误预算剩余",
      "xyChart": {
        "dataSets": [{
          "timeSeriesQuery": {
            "timeSeriesFilter": {
              "filter": "metric.type=\"monitoring.googleapis.com/error_budget/budget\" AND resource.labels.service_name=\"payment-service\""
            }
          }
        }]
      }
    },
    {
      "title": "P99 延迟趋势",
      "xyChart": {
        "dataSets": [{
          "timeSeriesQuery": {
            "timeSeriesFilter": {
              "filter": "metric.type=\"monitoring.googleapis.com/error_budget/budget\""
            }
          }
        }]
      }
    }
  ]
}
```

### 使用 MQL 编写查询

MQL（Monitoring Query Language）是 Cloud Monitoring 的强大查询语言，可以编写复杂的指标查询。

```mql
# 查询 P99 延迟
fetch http_lb_rule
| metric 'loadbalancing.googleapis.com/https/request_count'
| align rate(1m)
| filter
    [metric.response_code_class]
    | every 1m
    | group_by [resource.backend_name],
        [value_request_count_percentage: percentage(value_request_count)]

# 查询错误预算消耗速度
fetch generic_service
| metric 'monitoring.googleapis.com/error_budget/budget'
| filter
    resource.service_name == 'payment-service'
| align delta(1h)
| every 1h
```

### 不同角色的仪表盘设计

| 角色 | 关注点 | 建议包含的内容 |
|------|--------|--------------|
| SRE 工程师 | SLI、错误预算 | 可用性趋势、P50/P90/P99 延迟、错误率、错误预算剩余 |
| 开发团队 | 应用性能 | 部署频率、新功能错误率、API 响应时间、数据库查询时间 |
| 管理层 | 业务概况 | 整体系统可用性、SLA 达成情况、On-call 响应时间、MTTR |

---

## 13.3 告警策略的设计

### 告警的四个原则

**原则一：每个告警都必须可操作。** 收到告警后必须有事可做。如果收到告警后只能"看看，然后等它自动恢复"，那这个告警不应该作为 P0/P1 告警发出。

**原则二：区分告警的严重级别。**

| 级别 | 含义 | 响应时间 | 通知方式 |
|------|------|---------|---------|
| P0 | 服务不可用 | 立即 | 电话/PagerDuty |
| P1 | 服务部分受损 | 15 分钟 | Slack/即时消息 |
| P2 | 非紧急问题 | 工作时间 | 邮件/工单 |
| P3 | 轻微问题 | 本周内 | 工单系统 |

**原则三：告警要有足够的上下文。**

一个好的告警消息应该包含：
- **什么问题**：CPU 使用率超过 90%
- **影响范围**：影响 3 个后端实例
- **资源信息**：实例名称 web-server-001、web-server-002、web-server-003
- **可能的排查方向**：查看近期代码变更、检查数据库连接数

**原则四：避免告警聚合不足。**

当同一个根因导致多个告警时，应该聚合到一条告警中。比如数据库连接池满会导致所有依赖该数据库的服务同时出现延迟告警——这些应该聚合为一条，而不是变成几十条独立的告警。

### 创建告警策略

**使用 gcloud 创建告警：**

```bash
# 创建 CPU 使用率告警
gcloud alpha monitoring policies create \
    --display-name="GKE 节点 CPU 使用率 > 80%" \
    --condition-filter='resource.type="k8s_node" AND metric.type="kubernetes.io/node/cpu/utilization"' \
    --condition-threshold-value=0.8 \
    --condition-threshold-duration=300s \
    --notification-channels="projects/my-project/notificationChannels/123"

# 创建 SLO 燃烧率告警
gcloud alpha monitoring policies create \
    --display-name="错误预算快速燃烧告警" \
    --condition-slo-sli="projects/my-project/services/payment-service/slos/123" \
    --condition-slo-burn-rate-threshold=10 \
    --condition-slo-burn-rate-lookback-duration=1800s \
    --condition-slo-burn-rate-number-of-violations=1
```

**使用 Terraform 创建告警：**

```hcl
# 告警策略配置
resource "google_monitoring_alert_policy" "cpu_alert" {
  display_name = "GKE 节点 CPU 使用率 > 80%"
  combiner     = "OR"
  
  conditions {
    display_name = "CPU > 80% for 5 minutes"
    
    condition_threshold {
      filter     = "resource.type = \"k8s_node\" AND metric.type = \"kubernetes.io/node/cpu/utilization\""
      duration   = "300s"
      comparison = "COMPARISON_GT"
      threshold_value = 0.8
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = ["projects/my-project/notificationChannels/123"]
  
  alert_strategy {
    auto_close = "1800s"  # 30 分钟后自动关闭
  }
}
```

### 燃烧率告警的配置

```mql
# 快速燃烧告警：1 小时内消耗 5% 的错误预算
fetch generic_service
| metric 'monitoring.googleapis.com/error_budget/budget'
| filter
    resource.service_name == 'payment-service'
| within 1h
| every 30s
| condition burn_rate() > 1.2  # 消耗速度超过预期 20%
```

---

## 13.4 告警风暴的预防

### 告警风暴的成因

告警风暴通常由以下原因引起：

1. **级联告警**：底层组件故障导致上游所有服务同时告警
2. **告警规则太多**：每个细粒度指标都有告警规则
3. **告警阈值过低**：正常波动也会触发告警
4. **缺少聚合**：同一个问题触发了多条告警

### 预防方法

**方法一：依赖告警分层**

当检测到底层服务出问题时，先阻止上游服务的告警触发。

```mql
# 底层告警（数据库不可用）
fetch cloudsql_database
| metric 'cloudsql.googleapis.com/database/up'
| filter metric.state == 'down'

# 上层告警（自动抑制 - 如果数据库不可用，不触发应用层告警）
# 通过 Cloud Monitoring 的告警抑制规则实现
```

**方法二：使用静默规则**

```bash
# 在已知的维护窗口静默告警
gcloud alpha monitoring silence-policies create \
    --display-name="维护窗口静默" \
    --filter="resource.type = \"k8s_cluster\"" \
    --start-time="2025-01-15T02:00:00Z" \
    --end-time="2025-01-15T06:00:00Z"
```

**方法三：告警疲劳检测**

定期检查告警统计，识别需要优化的告警规则：

```sql
-- 在 BigQuery 中分析告警历史
SELECT
  alert_policy_name,
  COUNT(*) as alert_count,
  COUNT(DISTINCT condition_name) as condition_count,
  AVG(TIMESTAMP_DIFF(closed_time, opened_time, MINUTE)) as avg_duration_minutes
FROM `my-project.monitoring_data.alert_history`
WHERE opened_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY alert_policy_name
ORDER BY alert_count DESC
```

**方法四：使用燃烧率告警**

燃烧率告警关注的是"错误预算消耗的速度"，而不是"当前指标是否超过阈值"。这可以有效减少告警数量。

---

## 13.5 一个场景：构建完整的监控体系

### 需求

为"支付服务"构建完整的监控体系。

### 第一步：确定关键指标

| 类别 | 指标 | 来源 | 告警阈值 |
|------|------|------|---------|
| 可用性 | 支付 API 成功率 | Cloud Monitoring | < 99.99% |
| 延迟 | P99 延迟 | Cloud Monitoring | > 2s |
| 饱和度 | CPU 使用率 | Compute Engine | > 80% |
| 饱和度 | 数据库连接数 | Cloud SQL | > 80% 上限 |
| 业务 | 支付成功率 | 自定义指标 | < 99% |

### 第二步：创建仪表盘

```bash
# 使用 gcloud 创建 Dashboard
gcloud monitoring dashboards create \
    --display-name="支付服务监控" \
    --dashboard-json=payment-dashboard.json
```

### 第三步：配置告警

```bash
# P0 告警：支付服务不可用
gcloud alpha monitoring policies create \
    --display-name="[P0] 支付服务可用性 < 99.99%" \
    --condition-filter='metric.type="monitoring.googleapis.com/error_budget/budget" AND resource.labels.service_name="payment-service"' \
    --condition-threshold-value=0.9999 \
    --condition-threshold-duration=60s \
    --notification-channels="pagerduty-payment"

# P1 告警：P99 延迟 > 2s
gcloud alpha monitoring policies create \
    --display-name="[P1] 支付服务 P99 延迟 > 2s" \
    --condition-filter='metric.type="monitoring.googleapis.com/error_budget/budget"' \
    --condition-threshold-value=2000 \
    --condition-threshold-duration=300s \
    --notification-channels="slack-payment"

# P2 告警：CPU > 80%
gcloud alpha monitoring policies create \
    --display-name="[P2] 支付服务 CPU > 80%" \
    --condition-filter='resource.type="k8s_node"' \
    --condition-threshold-value=0.8 \
    --condition-threshold-duration=600s \
    --notification-channels="email-payment"
```

### 第四步：设置通知渠道

```bash
# 配置 PagerDuty 通知
gcloud alpha monitoring channels create \
    --display-name="PagerDuty - 支付团队" \
    --type=pagerduty \
    --channel-labels=service_key=YOUR_PAGERDUTY_KEY

# 配置 Slack 通知
gcloud alpha monitoring channels create \
    --display-name="Slack - 支付团队" \
    --type=slack \
    --channel-labels=auth_token=YOUR_SLACK_TOKEN,channel_name=#payment-alerts
```

### 第五步：配置 On-call 轮值

```bash
# 在 PagerDuty 中配置 On-call 轮值
# 1. 创建支付团队的 Escalation Policy
# 2. 配置轮值规则：主 On-call → 备 On-call → 值班经理
# 3. 将 P0 告警关联到该 Escalation Policy
```

---

## 13.6 反模式：监控配置中的常见错误

### 反模式一：告警阈值设置过高或过低

**表现**：阈值设置过高（CPU > 95% 才告警）或过低（CPU > 50% 就告警）。

**后果**：过高导致漏报，过低导致误报。

**正确的做法**：根据历史数据设置合理的阈值。从宽松开始，逐步收紧。

### 反模式二：所有告警都用相同的通知方式

**表现**：无论什么级别的告警，都发送到同一个 Slack 频道。

**后果**：P0 告警被淹没在 P3 告警中。

**正确的做法**：根据严重级别使用不同的通知方式——P0 电话、P1 Slack、P2 邮件。

### 反模式三：从不在周末调整告警

**表现**：周末和上班时间使用相同的告警规则。

**后果**：周末的低负载下，一些"正常"的告警变成了"异常"——比如请求量下降导致某些指标偏离了正常工作范围。

**正确的做法**：配置时间维度的告警规则——工作时间和非工作时间使用不同的阈值。

### 反模式四：没有告警摘要邮件

**表现**：团队只有实时告警，没有每日/每周的告警摘要。

**后果**：无法从宏观上了解告警趋势——告警是在增加还是减少？哪些服务告警最多？

**正确的做法**：配置每日告警摘要邮件，包含告警数量、Top 告警源、MTTR 趋势等信息。

---

## 13.7 速查总结

### 告警级别定义速查

| 级别 | 定义 | 响应时间 | 通知方式 | 示例 |
|------|------|---------|---------|------|
| P0 | 核心服务不可用 | 立即 | 电话 | 支付服务宕机 |
| P1 | 功能部分受损 | 15 分钟 | Slack | P99 延迟 > SLO |
| P2 | 非紧急问题 | 工作时间 | 邮件 | CPU > 80% |
| P3 | 轻微问题 | 本周内 | 工单 | 证书即将过期 |

### 常见指标的告警阈值参考

| 指标 | 告警阈值 | 检查周期 | 级别 |
|------|---------|---------|------|
| CPU 使用率 | > 80% | 5 分钟 | P2 |
| 内存使用率 | > 85% | 5 分钟 | P2 |
| 磁盘使用率 | > 80% | 10 分钟 | P2 |
| P99 延迟 | > SLO 值 | 5 分钟 | P1 |
| 错误率 | > 0.1% | 5 分钟 | P1 |
| 错误预算消耗速度 | 燃烧率 > 10 | 2 小时 | P1 |
| 证书过期 | < 30 天 | 每天 | P3 |

### 每周告警检查清单

- [ ] 本周有多少告警被触发？
- [ ] 有多少告警是误报？是否需要调整规则？
- [ ] 告警的 MTTA（平均确认时间）和 MTTR（平均修复时间）是多少？
- [ ] 是否有告警规则需要新增或废弃？
- [ ] 通知渠道是否正常工作？

---

> **下一章预告：** 指标和告警告诉我们"什么时候出问题了"，而日志告诉我们"具体发生了什么"。第 14 章将深入介绍 Cloud Logging 的使用——从高效的日志搜索到日志导出策略，以及团队日志规范的制定。