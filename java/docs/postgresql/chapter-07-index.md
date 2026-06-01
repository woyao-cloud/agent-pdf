# 第7章 索引策略与优化

## 7.1 场景故事：查询从3秒到3ms

### 一次典型的性能优化

某电商系统的订单查询接口响应时间突然从20ms飙升到3秒。DBA查看后发现，大促期间订单表数据量已超过5000万行，而`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20` 这条SQL走了全表扫描（Seq Scan）。

问题根源：`user_id` 列没有索引。对于50行数据，全表扫描和索引扫描差别不大。但对于5000万行，差异是3秒 vs 3毫秒——1000倍的差距。

```sql
-- 创建一个索引，查询瞬间降到3ms
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

索引的本质就是一种**空间换时间**的策略。它维护了一个额外的数据结构（在PostgreSQL中默认是B-tree），让数据库可以快速跳过无关数据，直接定位到目标行。

## 7.2 PostgreSQL的6种索引类型

### B-tree索引（默认）

B-tree是PostgreSQL的默认索引类型，适合大多数场景。它支持等值查询（=）、范围查询（>、<、BETWEEN）和排序（ORDER BY）：

```sql
-- 创建B-tree索引（默认）
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- 多列索引（用户ID+创建时间）
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- 部分索引（只索引最近7天的订单）
CREATE INDEX idx_recent_orders ON orders(created_at)
WHERE created_at > now() - interval '7 days';
```

### GiST索引

GiST（Generalized Search Tree）是一个可扩展的索引框架，支持非标准数据类型。它用于地理位置、全文搜索、范围类型等：

```sql
-- 空间数据索引
CREATE INDEX idx_locations ON locations USING gist(geom);

-- 范围类型索引（防止预订冲突）
CREATE INDEX idx_reservation ON reservation USING gist(duration);
```

### GIN索引

GIN（Generalized Inverted Index）用于"包含"查询——查找某个值是否出现在复合值中。适用于JSONB、全文搜索、数组：

```sql
-- JSONB索引
CREATE INDEX idx_users_tags ON users USING gin(tags jsonb_path_ops);

-- 全文搜索索引
CREATE INDEX idx_articles_search ON articles USING gin(to_tsvector('english', title || ' ' || body));

-- 数组索引
CREATE INDEX idx_article_tags ON articles USING gin(tags);
```

GIN索引的缺点是**更新较慢**——因为需要维护倒排表，每次插入/更新可能涉及多个索引条目。但查询性能极好。

### BRIN索引

BRIN（Block Range INdex）是PostgreSQL 9.5引入的索引类型。它不索引每一行，而是索引**数据块的范围**。对于按时间顺序插入的数据（如日志、时序数据），BRIN比B-tree小几百倍：

```sql
-- 时序数据的BRIN索引（比B-tree小100倍）
CREATE INDEX idx_orders_created ON orders USING brin(created_at)
WITH (pages_per_range = 32);

-- 查看索引大小对比
SELECT relname, relpages FROM pg_class
WHERE relname LIKE 'idx_orders%';
```

BRIN索引的适用条件：数据在物理上按顺序排列。日志表、订单表（按时间插入）是理想场景。

### SP-GiST索引

SP-GiST（Space-Partitioned GiST）用于数据划分的结构——四叉树（2D点）、k-d树（多维）、前缀树（字符串）：

```sql
-- 地理坐标的SP-GiST索引（适合点查询，非范围查询）
CREATE INDEX idx_geo_points ON geo_data USING spgist(point);
```

### Hash索引

Hash索引只支持等值查询（=），不支持范围查询。PostgreSQL 10之后，Hash索引已被WAL-logged的支持，可以安全使用：

```sql
-- 仅等值查询时使用Hash索引
CREATE INDEX idx_user_email ON users USING hash(email);
```

### 索引类型选择指南

| 场景 | 推荐索引 | 原因 |
|------|---------|------|
| 等值查询、范围查询、排序 | B-tree | 通用选择 |
| JSONB包含查询 | GIN | 倒排索引 |
| 全文搜索 | GIN | 倒排索引 |
| 空间查询（相交/包含） | GiST | R-tree兼容 |
| 时序数据，物理顺序 | BRIN | 极小索引 |
| 高性能等值匹配 | Hash | 比B-tree更小更快 |
| GIS点数据 | SP-GiST | 点查询最优 |

## 7.3 索引扫描类型

理解PostgreSQL的索引扫描类型对于解读查询计划至关重要：

```sql
-- 查看查询计划
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 123;
```

**Index Scan（索引扫描）**：先走索引找到匹配行的物理位置，再回表读取数据。适用于返回少数行的查询：

```
Index Scan using idx_orders_user_id on orders
  Index Cond: (user_id = 123)
  → 先在索引中定位user_id=123的记录位置
  → 再到表数据文件中读取完整记录
```

**Index Only Scan（仅索引扫描）**：所有需要的字段都在索引中，不需要回表。这是最理想的方式：

```sql
-- 如果只需要user_id和created_at，创建一个包含它们的多列索引
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- 查询计划变为Index Only Scan
EXPLAIN SELECT user_id, created_at FROM orders WHERE user_id = 123;
```

**Bitmap Scan（位图扫描）**：先通过索引找到所有匹配行的位置，批量回表读取。适用于返回行数较多的查询：

```
Bitmap Heap Scan on orders
  Recheck Cond: (user_id = 123)
  → Bitmap Index Scan on idx_orders_user_id
```

## 7.4 索引失效场景

```sql
-- 1. 对索引列使用函数（函数索引可以解决）
-- ❌ 索引失效
SELECT * FROM users WHERE UPPER(email) = 'USER@EXAMPLE.COM';
-- ✅ 创建函数索引
CREATE INDEX idx_users_email_upper ON users(UPPER(email));

-- 2. 隐式类型转换
-- ❌ 索引失效（如果id是varchar，传入int会触发类型转换）
SELECT * FROM users WHERE id = 123;
-- ✅ 使用正确的类型
SELECT * FROM users WHERE id = '123';

-- 3. LIKE前缀通配符
-- ❌ 索引失效（通配符在开头）
SELECT * FROM products WHERE name LIKE '%手机%';
-- ✅ 索引可用（通配符在末尾）
SELECT * FROM products WHERE name LIKE '手机%';
```

## 7.5 索引管理维护

```sql
-- 查看索引大小
SELECT
    indexrelid::regclass AS index_name,
    relid::regclass AS table_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- 查找未使用索引
SELECT
    schemaname || '.' || tablename AS table,
    indexrelname AS index,
    idx_scan AS index_scans
FROM pg_stat_user_indexes
WHERE idx_scan < 10
ORDER BY idx_scan;

-- 在线重建索引（不锁表）
REINDEX INDEX CONCURRENTLY idx_orders_user_id;
-- 注意：CONCURRENTLY会在后台重建，完成后自动切换
```

## 7.6 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: index_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-index.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-index.sql
CREATE TABLE orders (
    id bigserial,
    user_id int,
    product_id int,
    amount numeric(10,2),
    status varchar(20),
    created_at timestamptz DEFAULT now()
);

-- 插入测试数据（100万行）
INSERT INTO orders (user_id, product_id, amount, status, created_at)
SELECT
    (random() * 100000)::int,
    (random() * 5000)::int,
    (random() * 1000)::numeric(10,2),
    CASE WHEN random() < 0.5 THEN 'paid' ELSE 'pending' END,
    now() - (random() * interval '365 days')
FROM generate_series(1, 1000000);
```

测试索引效果：
```bash
docker exec -it postgres psql -U postgres -d index_demo

-- 无索引时查询
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 12345;

-- 创建索引后
CREATE INDEX idx_orders_user ON orders(user_id);

-- 再次查询
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 12345;
```