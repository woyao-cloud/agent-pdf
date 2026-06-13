# 第5章实验：Tempo 链路追踪集成

## 实验目标
- 部署 Tempo + Grafana
- 使用 TraceQL 查询 Trace
- 配置 Service Graph

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  tempo:
    image: grafana/tempo:2.3.0
    command: -config.file=/etc/tempo.yaml
    ports:
      - "3200:3200"
      - "4317:4317"
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml

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
      OTEL_EXPORTER_OTLP_ENDPOINT: http://tempo:4317
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 访问 Grafana → 添加 Tempo 数据源
# URL: http://tempo:3200

# 3. 访问 demo-app 产生 Trace 数据
curl http://localhost:8080/hello
curl http://localhost:8080/error

# 4. 在 Explore 中查询 Trace
# TraceQL: { .service.name = "demo-app" }

# 5. 查看火焰图
# 点击 Trace → Flame Graph 视图

# 6. 清理
docker compose down
```
