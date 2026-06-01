# 第15章 外部数据包装器（FDW）

## 15.1 场景故事：跨库查询MySQL+PG+CSV

### 业务需求

报表系统需要查询来自多个数据源的数据：订单在PostgreSQL中，用户信息在MySQL中，历史归档在CSV文件中。传统做法是写ETL脚本先同步数据到数据仓库，再查询。FDW允许你在PostgreSQL中直接查询这些外部数据源，就像查询本地表一样。

---

## 15.2 实现原理

### postgres_fdw

```sql
-- 1. 创建FDW扩展
CREATE EXTENSION postgres_fdw;

-- 2. 创建外部服务器连接（定义远程数据库）
CREATE SERVER remote_pg
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (host 'remote-host', port '5432', dbname 'orders_db');

-- 3. 创建用户映射（定义远程登录用户）
CREATE USER MAPPING FOR local_user
SERVER remote_pg
OPTIONS (user 'remote_user', password 'remote_password');

-- 4. 创建外部表
CREATE FOREIGN TABLE remote_orders (
    id bigint,
    user_id int,
    amount numeric(10,2),
    created_at timestamptz
)
SERVER remote_pg
OPTIONS (schema_name 'public', table_name 'orders');

-- 5. 现在可以像查本地表一样查询远程表
SELECT * FROM remote_orders WHERE user_id = 123;
```

### mysql_fdw

```sql
-- 需要先安装mysql_fdw扩展
CREATE EXTENSION mysql_fdw;

CREATE SERVER mysql_server
FOREIGN DATA WRAPPER mysql_fdw
OPTIONS (host 'mysql-host', port '3306');

CREATE USER MAPPING FOR local_user
SERVER mysql_server
OPTIONS (username 'mysql_user', password 'mysql_pass');

CREATE FOREIGN TABLE ft_users (
    id int,
    name varchar(100),
    email varchar(200)
)
SERVER mysql_server
OPTIONS (dbname 'user_db', table_name 'users');
```

### file_fdw（查询CSV文件）

```sql
CREATE EXTENSION file_fdw;

CREATE SERVER file_server
FOREIGN DATA WRAPPER file_fdw;

CREATE FOREIGN TABLE ft_archive (
    id int,
    product_name text,
    sales_amount numeric(10,2),
    sale_date date
)
SERVER file_server
OPTIONS (filename '/data/archive_2023.csv', format 'csv', header 'true');
```

### 跨库JOIN

```sql
-- 一条SQL查询三个数据源
SELECT o.id, u.name, o.amount, o.created_at
FROM remote_orders o
JOIN ft_users u ON o.user_id = u.id
WHERE o.created_at >= '2024-01-01'
ORDER BY o.amount DESC
LIMIT 10;
```

---

## 15.3 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 查询性能 | 跨库查询受远程网络延迟影响 | 开启fetch_size调优，增加并行度 |
| 数据类型映射 | MySQL和PG的数据类型不一一对应 | 测试并确认类型映射 |
| 不支持下推 | 某些操作无法下推到远程执行 | 检查EXPLAIN是否显示Remote SQL |
| 连接管理 | 每个查询都会创建远程连接 | 使用连接池或限制FDW查询频率 |

---

## 15.4 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: fdw_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-fdw.sql:/docker-entrypoint-initdb.d/init.sql

  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: user_db
    volumes:
      - ./init-mysql.sql:/docker-entrypoint-initdb.d/init.sql
```