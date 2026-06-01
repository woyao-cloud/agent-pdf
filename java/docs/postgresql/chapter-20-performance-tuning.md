# 第20章 性能优化

## 20.1 查询计划解读

### EXPLAIN ANALYZE详解

理解查询计划是性能优化的第一步。PostgreSQL的查询计划以树形结构展示，从最内层到最外层：

```sql
-- 执行查询计划
EXPLAIN (ANALYZE, BUFFERS, TIMING) 
SELECT o.user_id, count(*) as order_count, sum(o.amount) as total_amount
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.created_at >= '2024-01-01'
GROUP BY o.user_id
ORDER BY total_amount DESC
LIMIT 10;
```

输出示例：
```
Limit  (cost=184.32..184.34 rows=10 width=44)
  (actual time=12.345..12.348 rows=10 loops=1)
  Buffers: shared hit=342 read=25
  ->  Sort  (cost=184.32..184.57 rows=100 width=44)
        (actual time=12.344..12.346 rows=10 loops=1)
        Sort Key: (sum(o.amount)) DESC
        Sort Method: top-N heapsort  Memory: 25kB
        ->  HashAggregate  (cost=180.50..181.50 rows=100 width=44)
              (actual time=12.100..12.200 rows=5000 loops=1)
              Group Key: o.user_id
              ->  Hash Join  (cost=45.00..155.00 rows=5000 width=10)
                    (actual time=2.000..8.000 rows=50000 loops=1)
                    Hash Cond: (o.user_id = u.id)
                    Buffers: shared hit=300 read=25
                    ->  Seq Scan on orders o  (cost=0.00..100.00 rows=50000 width=10)
                          (actual time=0.010..3.000 rows=50000 loops=1)
                          Filter: (created_at >= '2024-01-01')
                          Buffers: shared hit=200 read=25
                    ->  Hash  (cost=25.00..25.00 rows=1000 width=4)
                          (actual time=1.000..1.000 rows=1000 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 40kB
                          ->  Seq Scan on users u  (cost=0.00..25.00 rows=1000 width=4)
                                (actual time=0.010..0.500 rows=1000 loops=1)
```

关键解读：

| 指标 | 含义 | 正常范围 |
|------|------|---------|
| actual time | 实际执行时间（起始..结束） | 毫秒级 |
| rows | 实际返回行数 vs 估算行数 | 两者应接近 |
| loops | 该节点执行次数 | 大部分应为1 |
| Buffers: shared hit | 从共享缓冲区读取的页数 | 越高说明缓存命中好 |
| Buffers: shared read | 从磁盘读取的页数 | 越低越好 |
| Sort Method | 排序方法 | quicksort或top-N heapsort |
| Memory | 排序/哈希使用的内存 | 不应超过work_mem |

**核心关注点**：
1. **actual time差异大的操作**：找出耗时最长的节点
2. **rows估算偏差大的操作**：统计信息可能过时，需要ANALYZE
3. **Seq Scan on large table**：大表全表扫描通常需要索引
4. **Buffers: shared read偏高**：缓存命中率低，需要增大shared_buffers

### 常见查询计划节点

| 节点类型 | 说明 | 出现场景 |
|---------|------|---------|
| Seq Scan | 全表顺序扫描 | 大表无合适索引 |
| Index Scan | 索引扫描+回表 | 返回行数少 |
| Index Only Scan | 仅索引扫描（不回表） | 查询字段都在索引中 |
| Bitmap Scan | 位图扫描 | 返回行数中等 |
| Nested Loop | 嵌套循环连接 | 小表连接大表 |
| Hash Join | 哈希连接 | 中等表连接 |
| Merge Join | 归并连接 | 有序数据 |
| Sort | 排序操作 | ORDER BY / 窗口函数 |
| Aggregate | 聚合操作 | GROUP BY |
| HashAggregate | 哈希聚合 | 分组数较少 |

---

## 20.2 核心参数调优

### 内存参数

```ini
# postgresql.conf 配置

# shared_buffers: 共享缓冲区大小
# 通常设置为系统内存的25%
# 32GB内存 → 8GB
shared_buffers = 8GB

# effective_cache_size: 操作系统页缓存估计值
# 告诉优化器"OS能缓存多少数据"
# 设置为系统内存的50-75%
effective_cache_size = 24GB

# work_mem: 每个排序/哈希操作的内存
# 排序、哈希连接、位图扫描
# 注意不是全局限制，而是"每个操作"
# 太多并发时小心内存溢出！
work_mem = 16MB

# maintenance_work_mem: 维护操作内存
# VACUUM、CREATE INDEX、ADD FOREIGN KEY
maintenance_work_mem = 1GB

# wal_buffers: WAL缓冲区大小
wal_buffers = 64MB
```

### 写入性能参数

```ini
# wal_level: WAL记录级别
# replica: 支持复制和归档（生产环境推荐）
# logical: 支持逻辑复制
wal_level = replica

# fsync: 确保WAL写入磁盘
# 永远不要关闭！关闭=数据损坏风险
fsync = on

# synchronous_commit: 同步提交级别
# on: 默认，WAL写入磁盘后返回
# off: 更快，但崩溃可能丢数据
synchronous_commit = on

# checkpoint_timeout: 检查点间隔
checkpoint_timeout = 15min

# max_wal_size: WAL最大大小
max_wal_size = 4GB

# min_wal_size: WAL最小大小
min_wal_size = 1GB
```

### 并发参数

```ini
# max_connections: 最大连接数
# 使用连接池时设置为50-100即可
max_connections = 100

# max_worker_processes: 后台进程数
max_worker_processes = 16

# max_parallel_workers: 并行查询工作进程
max_parallel_workers = 8

# max_parallel_workers_per_gather: 每个查询的并行度
max_parallel_workers_per_gather = 4

# effective_io_concurrency: 并发IO数
# SSD: 200, 普通HDD: 1-2
effective_io_concurrency = 200
```

---

## 20.3 VACUUM管理

### VACUUM的作用

PostgreSQL的MVCC机制会导致死元组（已删除或已更新的旧版本）积累。VACUUM负责回收这些死元组占用的空间：

```sql
-- 查看表的膨胀情况
SELECT
    relname,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    round(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 2) AS dead_pct,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- 手动VACUUM（单个表）
VACUUM orders;

-- VACUUM并回收磁盘空间
VACUUM FULL orders;
-- 注意：VACUUM FULL会锁表！

-- 查看VACUUM进度（PG 13+）
SELECT * FROM pg_stat_progress_vacuum;
```

### autovacuum调优

```ini
# 是否启用autovacuum
autovacuum = on

# 触发的死元组阈值（按比例）
autovacuum_vacuum_threshold = 50
autovacuum_vacuum_scale_factor = 0.2
# 死元组数 > 50 + 0.2 * 总行数 时触发VACUUM

# 触发的死元组阈值（按数量，适合大表）
# 对于10亿行的表，scale_factor=0.2意味着20亿死元组才触发
# 这太大了！建议对表单独设置：
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE orders SET (autovacuum_vacuum_threshold = 10000);

# autovacuum的休眠间隔
autovacuum_naptime = 1min

# autovacuum工作进程数
autovacuum_max_workers = 3
```

---

## 20.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| work_mem溢出 | 高并发下work_mem累加占用过多内存 | 使用连接池限制并发 |
| 检查点I/O风暴 | 大量脏页一次性刷入磁盘 | 调整checkpoint_completion_target |
| autovacuum跟不上 | 写入量太大导致死元组膨胀 | 单独为高频更新表设置参数 |
| 统计信息过时 | 查询计划使用错误估算 | 降低autovacuum_analyze_scale_factor |
| 索引膨胀 | 索引占用比数据还大 | 定期REINDEX CONCURRENTLY |

---

## 20.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: perf_demo
      POSTGRES_PASSWORD: test
    command: >
      -c shared_buffers=512MB
      -c effective_cache_size=2GB
      -c work_mem=32MB
      -c maintenance_work_mem=256MB
      -c max_parallel_workers=4
      -c max_parallel_workers_per_gather=2
      -c log_min_duration_statement=1000
    volumes:
      - ./init-perf.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-perf.sql
CREATE TABLE orders (id bigserial, user_id int, amount numeric(10,2), created_at timestamptz DEFAULT now());

INSERT INTO orders (user_id, amount, created_at)
SELECT (random() * 10000)::int, (random() * 1000)::numeric(10,2),
       now() - random() * interval '365 days'
FROM generate_series(1, 1000000);

ANALYZE orders;  -- 更新统计信息

-- 使用EXPLAIN查看查询计划
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 123;
```