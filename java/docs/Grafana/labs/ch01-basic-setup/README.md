# 第1章实验：基础搭建

## 实验目标
- 使用 Docker Compose 启动 Grafana + Prometheus 基础环境
- 验证 Grafana 与 Prometheus 数据源连通性

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.48.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:10.2.0
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    ports:
      - "3000:3000"
    depends_on:
      - prometheus
```

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

## 实验步骤

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证 Prometheus
curl http://localhost:9090/api/v1/query?query=up

# 3. 访问 Grafana
open http://localhost:3000

# 4. 在 Grafana 中添加 Prometheus 数据源
# URL: http://prometheus:9090
# 点击 Save & Test 验证

# 5. 创建一个简单的 Dashboard
# 添加面板 → PromQL: rate(prometheus_http_requests_total[5m])

# 6. 清理
docker compose down
```
