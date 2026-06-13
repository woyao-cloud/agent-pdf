# 第3章实验：Prometheus 数据源集成

## 实验目标
- 配置 Prometheus 数据源
- 使用模板变量实现动态 Dashboard
- 构建 RED 方法大盘

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.48.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  demo-app:
    image: grafana/demo-app:latest
    ports:
      - "8080:8080"

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    volumes:
      - ./provisioning:/etc/grafana/provisioning
    depends_on:
      - prometheus
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 访问 Grafana
open http://localhost:3000

# 3. 验证数据源自动注入（Provisioning）
# 进入 Configuration → Data Sources → Prometheus

# 4. 导入 RED 大盘
# 在 provisioning/dashboards 中提供 RED 大盘 JSON

# 5. 实验模板变量
# 创建一个新 Dashboard
# 添加变量 job: label_values(up, job)
# 在面板查询中使用 $job 变量

# 6. 清理
docker compose down
```
