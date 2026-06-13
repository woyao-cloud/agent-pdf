# 第6章实验：SQL 数据源集成

## 实验目标
- 配置 MySQL 数据源
- 使用 SQL 宏编写时间序列查询
- 创建业务大盘

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: shop
      MYSQL_USER: grafana
      MYSQL_PASSWORD: grafana
    ports:
      - "3306:3306"
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    volumes:
      - ./provisioning:/etc/grafana/provisioning
```

```sql
-- init.sql
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10,2),
    status VARCHAR(20)
);

INSERT INTO orders (created_at, total_amount, status) VALUES
(NOW() - INTERVAL 1 HOUR, 99.9, 'completed'),
(NOW() - INTERVAL 30 MINUTE, 199.0, 'completed'),
(NOW() - INTERVAL 10 MINUTE, 49.9, 'pending');
```

## 实验步骤

```bash
# 1. 启动
docker compose up -d

# 2. 添加 MySQL 数据源
# Host: mysql:3306
# Database: shop
# User: grafana

# 3. 测试查询
# SELECT $__timeGroupAlias(created_at, 1h), count(*) FROM orders GROUP BY 1

# 4. 清理
docker compose down
```
