# 第16章 逻辑复制

## 16.1 场景故事：数据实时同步到另一个PG集群

### 业务需求

某公司需要将生产环境的订单数据实时同步到独立的报表数据库集群，报表查询不会影响生产数据库性能。同时，同步过程需要支持只同步部分表（而不是整个实例），并在目标端可以做数据结构转换。

逻辑复制（Logical Replication）解决这个问题——它按行级别复制数据变更，支持按表粒度选择同步范围，发布端和订阅端可以运行在不同版本的PostgreSQL上。

---

## 16.2 实现原理

### 发布/订阅模型

```
发布端（Publisher）                    订阅端（Subscriber）
┌─────────────────────┐            ┌─────────────────────┐
│  orders表           │   WAL变更   │  orders表           │
│  users表            │ ──────────→│  （自动从发布端同步） │
│  products表         │            │                     │
│                     │            │  order_stats表      │
│  发布名称: order_pub│            │  （自定义结构）      │
└─────────────────────┘            │  订阅名称: order_sub │
                                   └─────────────────────┘
```

### 配置步骤

```sql
-- 1. 发布端配置：wal_level必须为logical
-- postgresql.conf:
-- wal_level = logical

-- 2. 发布端创建发布
CREATE PUBLICATION order_pub
FOR TABLE orders, users;  -- 只发布这两个表

-- 3. 订阅端创建订阅
CREATE SUBSCRIPTION order_sub
CONNECTION 'host=publisher-host port=5432 dbname=proddb user=repl password=secret'
PUBLICATION order_pub;

-- 订阅创建后立即开始同步已有数据 + 实时增量
```

### 冲突处理

当订阅端和发布端都允许写入时，可能发生冲突：

```sql
-- 创建订阅时指定冲突处理方式
CREATE SUBSCRIPTION order_sub
CONNECTION '...'
PUBLICATION order_pub
WITH (
    copy_data = true,          -- 是否复制已有数据
    create_slot = true,        -- 自动创建复制槽
    enabled = true,            -- 立即启用
    origin = none,             -- 冲突处理
    binary = false             -- 使用文本协议
);
```

### 逻辑复制 vs 流复制

| 特性 | 逻辑复制 | 流复制 |
|------|---------|--------|
| 复制粒度 | 表级别 | 整个实例 |
| 目标端可写 | 是 | 否（只读） |
| 版本兼容 | 不同大版本可互连 | 必须同版本 |
| DDL复制 | 不支持 | 不支持 |
| 数据类型转换 | 支持 | 不支持 |
| 延迟 | 略高于流复制 | 低 |
| 适用场景 | 数据分发、升级迁移 | 高可用、读写分离 |

---

## 16.3 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| DDL不同步 | 发布端修改表结构，订阅端不同步 | 手动在订阅端执行相同DDL |
| 大事务延迟 | 长时间未提交的事务导致复制延迟累积 | 拆分大事务 |
| 序列不一致 | 自增ID在两端可能不同步 | 使用UUID或确定序列起始值 |
| 冲突未处理 | 双向写入时可能发生主键冲突 | 定义冲突处理策略 |

---

## 16.4 Docker Compose

```yaml
version: '3.8'
services:
  publisher:
    image: postgres:16
    ports: ["5433:5432"]
    environment:
      POSTGRES_DB: proddb
      POSTGRES_PASSWORD: secret
    command: >
      -c wal_level=logical
      -c max_replication_slots=10
      -c max_wal_senders=10
    volumes:
      - ./init-pub.sql:/docker-entrypoint-initdb.d/init.sql

  subscriber:
    image: postgres:16
    ports: ["5434:5432"]
    environment:
      POSTGRES_DB: reportdb
      POSTGRES_PASSWORD: secret
    volumes:
      - ./init-sub.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-pub.sql
CREATE TABLE orders (
    id bigserial PRIMARY KEY,
    user_id int,
    amount numeric(10,2),
    created_at timestamptz DEFAULT now()
);
INSERT INTO orders (user_id, amount) VALUES (1, 100.00), (2, 200.00);

CREATE PUBLICATION order_pub FOR TABLE orders;
```

```sql
-- init-sub.sql
CREATE TABLE orders (
    id bigint PRIMARY KEY,
    user_id int,
    amount numeric(10,2),
    created_at timestamptz DEFAULT now()
);

CREATE SUBSCRIPTION order_sub
CONNECTION 'host=publisher port=5432 dbname=proddb user=postgres password=secret'
PUBLICATION order_pub;
```