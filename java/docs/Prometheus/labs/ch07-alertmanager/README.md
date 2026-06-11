# 第7章 实验：Alertmanager 告警路由与降噪

## 实验目的

1. 理解 Alertmanager 的分组、抑制、静默机制
2. 配置路由树实现告警分级分发
3. 模拟告警风暴并通过分组+抑制治理
4. 验证告警恢复通知

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| alert-generator | :8088 | 模拟指标数据，触发告警 |
| Prometheus | :9097 | 含告警规则 |
| Alertmanager | :9093 | 路由树 + 分组 + 抑制 |
| webhook-receiver | :5002 | 接收并展示告警 Webhook |
| MailHog | :8025 | 捕获邮件告警 |
| Grafana | :3007 | 可视化 |

## 实验步骤

### 实验 1：路由树与分级分发

```bash
# 1. 启动环境
docker compose up -d

# 2. 查看 Webhook Receiver 终端
# 正常状态下无告警

# 3. 查看 Alertmanager 状态
curl http://localhost:9093/api/v2/status

# 4. 触发高 CPU 告警（severity=critical）
# alert-generator 自动切换模式
# 观察 webhook-receiver 收到 P0 级告警

# 5. 查看 MailHog 中的邮件告警
# 浏览器打开 http://localhost:8025
```

### 实验 2：分组与告警降噪

1. 启动环境后等待 alert-generator 自动切换模式
2. 观察多个实例同时触发 `HighCPULoad` 时，Alertmanager 如何合并通知
3. 对比 Webhook Receiver 中收到的是分组后的聚合告警还是独立告警

### 实验 3：Inhibition 抑制

alert-generator 会自动模拟"机房断网"场景：
1. `DatacenterDown`（dc-east）→ critical 级别告警
2. `HostDown`（dc-east 所有主机）→ 被抑制
3. `HostDown`（dc-west 主机）→ 正常发送

验证：
```bash
# 查看 Alertmanager 当前的告警
curl http://localhost:9093/api/v2/alerts | python -m json.tool

# 查看 Webhook Receiver 收到的告警
curl http://localhost:5002/status
```

### 实验 4：告警恢复通知

1. 等待 alert-generator 从 `dc_down` 切换回 `normal` 模式
2. 观察 Webhook Receiver 收到 ✅ RESOLVED 告警恢复通知

## Prometheus 告警规则

| 规则 | 表达式 | 级别 | for |
|------|--------|------|-----|
| HighCPULoad | demo_cpu_percent > 80 | critical | 30s |
| HighMemoryLoad | demo_memory_percent > 85 | warning | 30s |
| DatacenterDown | demo_datacenter_down > 0 | critical | 10s |
| HostDown | demo_host_down > 0 | critical | 10s |
| RequestErrorRate | error_rate > 5% | warning | 1m |

## 清理

```bash
docker compose down -v
```