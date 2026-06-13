# 第15章实验：生产问题排查

## 实验目标
- 模拟查询超时问题并排查
- 模拟渲染服务崩溃并修复
- 使用浏览器 DevTools 分析性能

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
      GF_DATAPROXY_TIMEOUT: "5"  # 故意设小，模拟超时
```

## 实验步骤

```bash
# 1. 启动环境
docker compose up -d

# 2. 模拟查询超时
# 在 Grafana 中查询大时间范围（如 30 天）
# 观察面板显示 "Query timeout" 或 "502 Bad Gateway"

# 3. 排查超时问题
docker logs grafana 2>&1 | grep -E "proxy|timeout|502"
# 观察日志中的 context deadline exceeded 错误

# 4. 修复：增大 timeout
# 在 docker-compose.yml 中移除 GF_DATAPROXY_TIMEOUT=5
# 或设为 GF_DATAPROXY_TIMEOUT=30
docker compose up -d

# 5. 验证修复
# 重新查询 → 不再超时

# 6. 使用浏览器 DevTools 分析性能
# 打开 Chrome DevTools → Network
# 刷新 Dashboard
# 找出最慢的查询请求

# 7. 清理
docker compose down
```
