# 第7章 Alertmanager 深度剖析与告警降噪

## 7.1 三大核心机制

### 分组（Grouping）

分组是 Alertmanager 最强大的降噪手段。它的核心思想是：**将同一时间段内同类型的告警合并为一条通知，而不是每条告警单独发送**。

关键参数：
- `group_wait`：同类告警的等待时间（默认 30s）。在此期间到达的同类告警被合并
- `group_interval`：已分组的告警的评估间隔（默认 5m）
- `repeat_interval`：同一组告警的重复通知间隔（默认 4h）

假设一个生产环境中，30 个 Pod 同时因为节点故障而 NotReady：
- **不分组**：30 条告警通知 → 告警风暴
- **分组后**：1 条告警通知 "[30] Pods are NotReady in cluster X" → 降噪

```yaml
route:
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  group_by: ['alertname', 'cluster']  # 按告警名+集群分组
```

### 抑制（Inhibition）

抑制是 Alertmanager 防止"级联告警灾难"的机制。当高优先级的告警触发时，自动抑制与其相关的低优先级告警。

最经典的场景：**机房断网时，抑制该机房所有主机的离线告警**。

```yaml
inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'cluster']
```

在上述配置中，如果 `DatacenterDown` 告警触发（critical 级别），所有 `HostDown` 告警（warning 级别）将被自动抑制。这意味着运维人员只收到一条"XX 机房断网"的告警，而不是成百上千条"主机宕机"的告警。

### 静默（Silences）

静默是一种手动机制，用于在指定时间窗口内屏蔽特定告警。典型场景：

- "正在发布新版本，已知会有短暂不可用" → 静默 30 分钟
- "数据库维护窗口" → 静默 2 小时
- "已知告警阈值过低，已排期修复" → 静默到修复完成

## 7.2 路由树设计

### 多级路由分发

Alertmanager 的路由树基于 Label 匹配，支持无限嵌套。以下是一个典型的生产级路由树：

```yaml
route:
  receiver: 'default'
  routes:
    # P0 级告警 → 电话/PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true  # 继续匹配子路由

    # 与 K8s 集群相关的 P0 告警
    - match:
        severity: critical
        kubernetes: 'production'
      receiver: 'pagerduty-prod'

    # P1 级告警 → 钉钉/飞书
    - match:
        severity: warning
      receiver: 'webhook-warning'

    # P2 级告警 → 邮件周报
    - match:
        severity: info
      receiver: 'email-info'
```

### 匹配优先级

路由树的匹配从上到下进行。`continue: true` 表示匹配后继续检查下一级路由。这允许一条告警匹配多个路由（如同时发送 PagerDuty 和钉钉）。

## 7.3 告警风暴治理

### 为什么会有告警风暴？

1. **阈值设置不合理**：例如内存使用率超过 10% 就告警，正常波动都会触发
2. **缺乏持续时间判定**：没有 `for` 字段，瞬时的毛刺也会触发告警
3. **级联效应**：一个根因故障导致上下游组件同时告警
4. **缺乏分组**：每个实例独立告警，没有聚合

### 解决方案 1：使用 for 持续时间

```yaml
# 错误：瞬时毛刺就告警
- alert: HighMemory
  expr: memory_usage_percent > 90

# 正确：持续 5 分钟才告警
- alert: HighMemory
  expr: memory_usage_percent > 90
  for: 5m  # ← 关键！
```

### 解决方案 2：合理设置阈值

```yaml
# 合理的分级别阈值
- alert: HighMemoryWarning
  expr: memory_usage_percent > 80
  for: 10m
  labels: { severity: warning }

- alert: HighMemoryCritical
  expr: memory_usage_percent > 95
  for: 5m
  labels: { severity: critical }
```

### 解决方案 3：Inhibition 消除级联告警

```yaml
# 如果 DatacenterDown 已触发，抑制该机房所有 HostDown
inhibit_rules:
  - source_match:
      alertname: DatacenterDown
    target_match:
      alertname: HostDown
    equal: ['datacenter']  # 同一个 datacenter 标签才抑制
```

## 7.4 实战配置

### Webhook 集成

Alertmanager 支持通用的 Webhook 集成，可以将告警推送到任意 HTTP 端点：

```yaml
receivers:
  - name: 'webhook-critical'
    webhook_configs:
      - url: 'http://webhook-receiver:5000/alert'
        send_resolved: true
        http_config:
          timeout: 5s
```

### 告警恢复通知

`send_resolved: true` 配置会在告警恢复时发送恢复通知。恢复通知中包含：
- 告警持续时间
- 恢复时的指标值
- 告警的 labels 和 annotations

### Prometheus 侧配置

Prometheus 需要配置 alertmanagers 地址：

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

## 7.5 PromQL 告警速查

```promql
# CPU 使用率 > 80% 持续 5 分钟
avg by(instance)(rate(node_cpu_seconds_total{mode!="idle"}[5m])) > 0.8

# 内存使用率 > 90%
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90

# 错误率 > 5%
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05

# 5 分钟内无数据（目标宕机）
absent(up{job="api-server"} == 1)

# 证书 30 天内过期
(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
```

## 本章小结

- 分组（Grouping）解决告警数量爆炸：同类告警合并为一条通知
- 抑制（Inhibition）解决级联告警：根因告警抑制衍生告警
- 静默（Silences）解决已知问题：手动屏蔽窗口内告警
- 路由树实现告警分级分发：P0→电话、P1→IM、P2→邮件
- `for` 持续时间判定是避免告警抖动的最简单有效的手段
- 实践：[Alertmanager 实验](../labs/ch07-alertmanager/README.md)