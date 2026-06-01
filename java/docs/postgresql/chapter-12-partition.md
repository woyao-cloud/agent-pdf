# 第12章 分区表

## 12.1 场景故事：日增100万订单的分区管理

### 业务需求

某电商平台的订单表日增100万条，半年后表数据量超过1.8亿行。此时：
- 按时间范围查询最近订单的SQL变慢（即使有索引，索引本身也极大）
- 删除历史数据的 `DELETE FROM orders WHERE created_at < 6 months ago` 会锁表
- `VACUUM` 无法及时清理死元组，导致表膨胀

分区表解决了这些问题。将订单按**月**分区，每个分区对应一个月的数据：

```sql
-- 按月分区
CREATE TABLE orders (
    id bigserial,
    user_id int NOT NULL,
    amount numeric(10,2),
    status varchar(20),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (id, created_at)  -- 分区键必须在主键中
) PARTITION BY RANGE (created_at);

-- 创建每个月的数据分区
CREATE TABLE orders_202401 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE orders_202402 PARTITION OF orders
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE orders_202403 PARTITION OF orders
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
```

---

## 12.2 实现原理

### 声明式分区

PostgreSQL 10引入的声明式分区（Declarative Partitioning）是目前推荐的分区方式。分区键决定一条数据应该放入哪个分区：

```sql
-- 范围分区（最常用）
CREATE TABLE orders PARTITION BY RANGE (created_at);

-- 列表分区（适合枚举值）
CREATE TABLE logs PARTITION BY LIST (log_level);
CREATE TABLE logs_errors PARTITION OF logs FOR VALUES IN ('ERROR', 'FATAL');
CREATE TABLE logs_info PARTITION OF logs FOR VALUES IN ('INFO', 'WARN', 'DEBUG');

-- 哈希分区（适合均匀分布）
CREATE TABLE sessions PARTITION BY HASH (session_id);
CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE sessions_2 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE sessions_3 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

### 分区裁剪（Partition Pruning）

当查询条件包含分区键时，PostgreSQL会自动跳过不匹配的分区：

```sql
-- 查询2024年1月的数据，只扫描orders_202401分区
EXPLAIN SELECT count(*) FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';

-- 查询计划中可以看到：
-- Append
--   -> Seq Scan on orders_202401
-- 其他分区被Pruned（裁剪掉）
```

**分区裁剪的前提条件**：查询条件中必须包含分区键，且必须是可索引的比较操作（=、>、<、BETWEEN）。如果查询中没有分区键条件，PostgreSQL会扫描所有分区。

### 分区管理操作

```sql
-- 附加新分区（不锁旧分区）
CREATE TABLE orders_202405 PARTITION OF orders
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

-- 分离分区（将分区从表中分离，但不删除数据）
ALTER TABLE orders DETACH PARTITION orders_202401;
-- 此时orders_202401变成独立表，可以单独备份/迁移

-- 附加已有表作为分区
ALTER TABLE orders ATTACH PARTITION orders_202401
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## 12.3 使用场景

| 场景 | 分区方式 | 原因 |
|------|---------|------|
| 订单/交易记录 | 按月范围分区 | 时间范围查询为主 |
| 日志数据 | 按天范围分区 | 定期删除旧数据 |
| 多租户数据 | 按tenant_id哈希分区 | 数据均匀分布 |
| 区域数据 | 按region列表分区 | 区域隔离 |
| 混合 | 复合分区（先范围再哈希） | 超大表 |

---

## 12.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 分区过多 | 数千个分区导致查询计划变慢 | 按月而非按天，合并小分区 |
| 跨分区更新 | UPDATE可能将数据移到其他分区 | 避免更新分区键 |
| 索引维护 | 每个分区需要单独建索引 | 使用模板自动创建索引 |
| 主键约束 | 分区键必须在主键中 | 复合主键 (id, created_at) |

## 12.5 典型问题处理

**问题：分区的数量有没有上限？**

PostgreSQL 16支持最多约65000个分区。但建议控制在1000以内——分区过多会导致查询计划时间变长。如果每天一个分区且需要保留5年，就是1825个分区。建议按月分区（60个分区）或使用子分区策略。对于时序场景，更推荐使用TimescaleDB的Hypertable。

**问题：如何自动创建和删除分区？**

使用pg_partman扩展自动管理分区生命周期。

---

## 12.6 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: partition_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-partition.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-partition.sql
-- 按月分区订单表
CREATE TABLE orders (
    id bigserial,
    user_id int NOT NULL,
    amount numeric(10,2) NOT NULL,
    status varchar(20) DEFAULT 'pending',
    created_at timestamptz NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建2024年各月分区
SELECT format('
    CREATE TABLE orders_%s PARTITION OF orders
    FOR VALUES FROM (%L) TO (%L)',
    to_char(d, 'YYYYMM'), d, d + interval '1 month')
FROM generate_series('2024-01-01'::date, '2024-12-01'::date, '1 month') AS d;
\gexec

-- 在每个分区上创建索引
SELECT format('CREATE INDEX idx_%s_user ON %s(user_id)',
    tablename, tablename)
FROM pg_tables WHERE tablename LIKE 'orders_%';
\gexec

-- 插入测试数据
INSERT INTO orders (user_id, amount, status, created_at)
SELECT
    (random() * 10000)::int,
    (random() * 1000)::numeric(10,2),
    CASE WHEN random() < 0.8 THEN 'completed' ELSE 'pending' END,
    timestamp '2024-03-15' + random() * (timestamp '2024-05-15' - timestamp '2024-03-15')
FROM generate_series(1, 50000);

-- 验证分区裁剪
EXPLAIN SELECT count(*) FROM orders
WHERE created_at >= '2024-03-01' AND created_at < '2024-04-01';
```