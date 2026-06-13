# 第10章实验：统一告警

## 实验目标
- 创建告警规则
- 配置通知渠道
- 测试告警触发和恢复

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.48.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    volumes:
      - ./provisioning:/etc/grafana/provisioning
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 创建告警规则
# Alerting → Alert rules → New rule
# 条件: avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100 > 80
# for: 1m
# Labels: severity=warning

# 3. 创建通知渠道
# Alerting → Contact points → New contact point
# Type: Webhook
# URL: https://webhook.site/xxx

# 4. 触发告警
# 通过降低阈值或增大负载触发

# 5. 查看告警历史
# Alerting → History

# 6. 清理
docker compose down
```
