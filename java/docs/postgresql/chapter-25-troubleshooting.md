# 第25章 典型问题诊断

## 25.1 诊断决策树

### 问题1：查询慢

```
查询响应慢
│
├─ 先看是否有锁等待
│  SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';
│  ↓ 有锁 → 定位锁源头，pg_cancel_backend(blocking_pid)
│
├─ 再查查询计划
│  EXPLAIN (ANALYZE, BUFFERS) SELECT ...
│  ↓
├─ 全表扫描（Seq Scan on large table）
│  ├─ 需要创建索引
│  ├─ 统计信息过时 → ANALYZE
│  └─ 索引存在但未被使用 → 检查索引字段类型是否匹配
│
├─ 使用了索引但依然慢
│  ├─ 索引选择性差（如性别字段）
│  ├─ 需要多列索引（复合索引）
│  └─ 索引太大 → REINDEX
│
├─ 排序慢
│  ├─ work_mem太小 → 增大work_mem
│  └─ 排序字段缺少索引
│
└─ 连接慢
   ├─ 连接池耗尽 → 检查max_connections
   └─ DNS解析慢 → 使用IP直连
```

### 问题2：连接数爆满

```
无法建立新连接
│
├─ 检查当前连接数
│  SELECT count(*) FROM pg_stat_activity;
│
├─ 紧急处理：释放空闲连接
│  SELECT pg_terminate_backend(pid)
│  FROM pg_stat_activity
│  WHERE state = 'idle' AND state_change < now() - interval '10 minutes';
│
├─ 紧急处理：保留管理连接
│  // postgresql.conf 设置
│  // superuser_reserved_connections = 10  -- 保留给超级用户的连接
│
└─ 长期解决方案
   ├─ 引入连接池（PgBouncer）
   ├─ 减小应用连接池大小
   └─ 增加max_connections（有限，受内存限制）
```

### 问题3：磁盘空间不足

```
磁盘使用率告警
│
├─ 找出大表和索引
│  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
│  FROM pg_catalog.pg_statio_user_tables
│  ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
│
├─ 检查WAL日志大小
│  SELECT * FROM pg_stat_archiver;
│  ├─ 归档失败 → WAL堆积 → 检查archive_command
│  └─ 复制槽未消费 → 检查pg_replication_slots
│
├─ 临时释放空间
│  VACUUM FULL table_name;  -- 会锁表！
│  TRUNCATE temp_table;     -- 删除临时表
│
└─ 长期解决方案
   ├─ 增加表空间或磁盘
   ├─ 删除不再需要的历史数据（分区表DROP）
   └─ 设置归档清理策略
```

---

## 25.2 常用诊断命令

```sql
-- 1. 查看当前所有活动查询
SELECT pid, usename, application_name, client_addr,
       state, wait_event_type, wait_event,
       now() - query_start AS duration,
       query
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid <> pg_backend_pid()
ORDER BY query_start;

-- 2. 查看锁等待
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_query
FROM pg_locks blocked_locks
JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- 3. 查看表膨胀情况
SELECT
    schemaname || '.' || relname AS table_name,
    n_live_tup,
    n_dead_tup,
    round(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 2) AS dead_pct,
    last_vacuum,
    last_autovacuum,
    vacuum_count,
    autovacuum_count
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- 4. 终止长时间运行的查询
-- 取消一个正在运行的查询（温和）
SELECT pg_cancel_backend(12345);

-- 强制断开一个连接（用于释放连接数）
SELECT pg_terminate_backend(12345);
```

---

## 25.3 常见错误及处理

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `FATAL: sorry, too many clients already` | 连接数超过max_connections | 引入PgBouncer，或释放空闲连接 |
| `ERROR: deadlock detected` | 并发事务产生死锁 | 保持一致的锁获取顺序，或缩短事务 |
| `ERROR: could not serialize access` | 可序列化隔离级别的冲突 | 重试事务 |
| `WARNING: index ... contains 12345 leaf blocks` | 索引膨胀 | REINDEX CONCURRENTLY |
| `ERROR: out of shared memory` | shared_buffers不足 | 增大shared_buffers或减少连接数 |
| `FATAL: remaining connection slots are reserved` | 连接数用尽，包括保留槽 | 保留槽被占用，需要等连接释放 |
| `ERROR: canceling statement due to user request` | 查询被取消 | 检查statement_timeout设置 |
| `PANIC: could not write to file` | 磁盘空间已满 | 清理磁盘或扩容 |

---

## 25.4 典型故障处理步骤

### 案例：慢查询导致系统崩溃

1. **紧急处理：停掉慢查询**
   ```sql
   SELECT pg_cancel_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'active'
     AND now() - query_start > interval '5 minutes'
     AND query NOT LIKE '%pg_stat%';
   ```

2. **分析根因**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS) SELECT ...  -- 找出慢的原因
   ```

3. **创建索引或优化查询**
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
   ```

4. **长期预防**
   ```sql
   -- 启用慢查询日志
   ALTER SYSTEM SET log_min_duration_statement = 1000;  -- 记录超过1秒的查询
   ALTER SYSTEM SET log_checkpoints = on;
   ```