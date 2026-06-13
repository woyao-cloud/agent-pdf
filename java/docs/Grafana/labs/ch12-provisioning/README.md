# 第12章实验：配置即代码（Provisioning）

## 实验目标
- 使用 Provisioning 自动配置数据源
- 自动加载 Dashboard JSON
- 实现 GitOps 工作流

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
# 1. 查看 provisioning 配置
cat provisioning/datasources/datasources.yml
cat provisioning/dashboards/dashboards.yml

# 2. 启动（Grafana 启动时自动加载配置）
docker compose up -d

# 3. 验证数据源已自动配置
# Configuration → Data Sources → 查看是否自动创建

# 4. 验证 Dashboard 已自动导入
# Dashboards → 查看是否自动加载

# 5. 修改 provisioning 配置后重启
vim provisioning/datasources/datasources.yml
docker compose restart grafana

# 6. 验证修改已生效

# 7. 清理
docker compose down
```
