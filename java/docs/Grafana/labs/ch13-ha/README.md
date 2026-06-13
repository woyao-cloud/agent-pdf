# 第13章实验：高可用部署

## 实验目标
- 部署多节点 Grafana 集群
- 配置 MySQL 共享存储
- 配置 Redis Session 共享

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - grafana-1
      - grafana-2

  grafana-1:
    image: grafana/grafana:10.2.0
    environment:
      GF_DATABASE_TYPE: mysql
      GF_DATABASE_HOST: mysql:3306
      GF_DATABASE_NAME: grafana
      GF_DATABASE_USER: grafana
      GF_DATABASE_PASSWORD: grafana
      GF_SESSION_PROVIDER: redis
      GF_SESSION_PROVIDER_CONFIG: addr=redis:6379,pool_size=100
    volumes:
      - ./provisioning:/etc/grafana/provisioning

  grafana-2:
    image: grafana/grafana:10.2.0
    environment:
      GF_DATABASE_TYPE: mysql
      GF_DATABASE_HOST: mysql:3306
      GF_DATABASE_NAME: grafana
      GF_DATABASE_USER: grafana
      GF_DATABASE_PASSWORD: grafana
      GF_SESSION_PROVIDER: redis
      GF_SESSION_PROVIDER_CONFIG: addr=redis:6379,pool_size=100
    volumes:
      - ./provisioning:/etc/grafana/provisioning

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: grafana
      MYSQL_USER: grafana
      MYSQL_PASSWORD: grafana
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine

volumes:
  mysql_data:
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 验证负载均衡
curl http://localhost/api/health
# 多次请求，观察返回的节点信息

# 3. 验证 Session 共享
# 登录 Grafana（通过 Nginx）
# 停掉 grafana-1
docker compose stop grafana-1
# 页面刷新 → 仍然登录状态（Session 从 grafana-2 读取）

# 4. 验证数据持久化
# 在 grafana-1 上创建 Dashboard
# 停掉 grafana-1
# 启动后 Dashboard 仍然存在（数据存储在 MySQL）

# 5. 清理
docker compose down -v
```
