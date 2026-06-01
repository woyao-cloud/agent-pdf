# 第24章 开发者核心技能

## 24.1 psql高级技巧

psql是PostgreSQL的命令行工具，掌握以下技巧可以大幅提高效率：

```bash
# 连接到数据库
psql -h localhost -p 5432 -U postgres -d mydb

# 常用内部命令
\l                    # 列出所有数据库
\dt                   # 列出当前数据库的所有表
\di                   # 列出所有索引
\d+ table_name        # 查看表结构（含存储参数和注释）
\df                   # 列出所有函数
\dv                   # 列出所有视图
\x                    # 扩展显示（行转列，适合字段多的表）
\timing               # 显示SQL执行时间
\! command            # 执行操作系统命令
\i file.sql           # 执行SQL文件
\o output.txt         # 将查询结果输出到文件
\e                    # 在编辑器中编辑查询
\watch 5              # 每5秒重复执行上一条SQL
\gexec                # 将查询结果再次作为SQL执行
\pset border 2        # 设置边框样式
\timing on            # 显示执行时间
```

高级技巧：

```sql
-- 1. 生成SQL的SQL（\gexec的妙用）
-- 生成所有表的VACUUM命令
SELECT format('VACUUM %I;', tablename) 
FROM pg_tables 
WHERE schemaname = 'public';
-- 输出后输入 \gexec 就会执行这些VACUUM

-- 2. 通过psql直接查看索引使用情况
SELECT schemaname, tablename, indexrelname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan;

-- 3. 查看当前正在运行的查询（含执行计划）
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state = 'active'
  AND pid <> pg_backend_pid();
```

---

## 24.2 Spring Boot集成配置

```yaml
# application.yml — PostgreSQL完整配置
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: app_user
    password: secret
    driver-class-name: org.postgresql.Driver
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 5000
      idle-timeout: 300000
      max-lifetime: 600000
      # PostgreSQL专用参数
      data-source-properties:
        socketTimeout: 30
        tcpKeepAlive: true
        # 禁用prepared statement缓存（配合PgBouncer时）
        prepareThreshold: 0
        # 使用游标模式
        # defaultRowFetchSize: 1000
  jpa:
    hibernate:
      ddl-auto: validate  # 生产环境使用validate，不自动建表
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        jdbc:
          batch_size: 50  # 批量操作
          batch_versioned_data: true  # 批量操作时合并版本检查
        order_inserts: true
        order_updates: true
        generate_statistics: false  # 生产环境关闭
```

### Flyway版本管理

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    # 使用PostgreSQL特有的语法（如JSONB）
    sql-migration-suffixes: sql
```

```sql
-- V1__init_orders.sql
CREATE TABLE orders (
    id bigserial PRIMARY KEY,
    user_id int NOT NULL,
    amount numeric(10,2) NOT NULL,
    status varchar(20) DEFAULT 'pending',
    attributes jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_orders_user ON orders(user_id);
```

---

## 24.3 Extension管理

```sql
-- 常用扩展清单
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- UUID生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- 加密函数
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- 查询统计
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- 模糊搜索
CREATE EXTENSION IF NOT EXISTS "hstore";            -- 键值存储
CREATE EXTENSION IF NOT EXISTS "unaccent";          -- 去除重音
CREATE EXTENSION IF NOT EXISTS "postgis";            -- 地理空间
CREATE EXTENSION IF NOT EXISTS "pg_repack";          -- 在线表重建
CREATE EXTENSION IF NOT EXISTS "pg_partman";         -- 分区管理

-- 查看已安装的扩展
SELECT * FROM pg_extension;
```

---

## 24.4 PG类型系统

```sql
-- 数组类型
CREATE TABLE articles (
    id serial PRIMARY KEY,
    title text,
    tags text[]  -- 字符串数组
);
INSERT INTO articles (title, tags) VALUES
    ('PostgreSQL教程', ARRAY['数据库', 'PostgreSQL', '教程']);
SELECT * FROM articles WHERE tags @> ARRAY['PostgreSQL'];

-- 枚举类型
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
CREATE TABLE orders (
    id serial PRIMARY KEY,
    status order_status DEFAULT 'pending'
);

-- 区间类型
-- tsrange: 时间戳区间
CREATE TABLE reservations (
    room_id int,
    during tsrange,
    EXCLUDE USING gist (room_id WITH =, during WITH &&)  -- 防止重叠
);
INSERT INTO reservations VALUES (101, '[2024-10-01 14:00, 2024-10-01 16:00)');

-- 范围类型操作符
SELECT daterange('2024-01-01', '2024-01-10') @> '2024-01-05'::date;  -- true
SELECT daterange('2024-01-01', '2024-01-10') && daterange('2024-01-05', '2024-01-20');  -- true（重叠）

-- 自定义类型
CREATE TYPE address AS (
    street text,
    city text,
    province text,
    zipcode varchar(10)
);
CREATE TABLE companies (
    id serial PRIMARY KEY,
    name text,
    location address  -- 复合类型字段
);
INSERT INTO companies VALUES (1, 'XX科技', ROW('中关村大街1号', '北京', '北京', '100000'));
SELECT (location).city FROM companies WHERE id = 1;
```

---

## 24.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: dev_skills
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-types.sql:/docker-entrypoint-initdb.d/init.sql
```