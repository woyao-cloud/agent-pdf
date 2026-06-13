# 第4章实验：Loki 日志集成

## 实验目标
- 部署 Loki + Promtail + Grafana
- 使用 LogQL 查询日志
- 配置 Derived Fields 提取 TraceID

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.0
    command: -config.file=/etc/loki/config.yaml
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/config.yaml

  promtail:
    image: grafana/promtail:2.9.0
    command: -config.file=/etc/promtail/config.yml
    volumes:
      - ./logs:/var/log
      - ./promtail.yml:/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    volumes:
      - ./provisioning:/etc/grafana/provisioning

  demo-app:
    image: grafana/demo-app:latest
    environment:
      LOG_FORMAT: json
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 访问 Grafana → 添加 Loki 数据源
# URL: http://loki:3100

# 3. 在 Explore 中查询日志
# {job="demo-app"} |= "error"

# 4. 配置 Derived Fields
# 在 Loki 数据源配置中添加：
# Regex: trace_id\":\"(\w+)\"
# Data source: Tempo

# 5. 日志转指标
# rate({job="demo-app"} |= "error"[5m])

# 6. 清理
docker compose down
```
