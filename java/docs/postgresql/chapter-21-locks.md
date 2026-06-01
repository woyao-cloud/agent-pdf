# 第21章 数据一致性与锁

## 21.1 锁类型

### 表级锁

PostgreSQL有8种表级锁模式，从最弱到最强：

```sql
-- ACCESS SHARE: 最弱，与SELECT共享
-- 与ACCESS EXCLUSIVE冲突
SELECT * FROM orders;

-- ROW SHARE: SELECT FOR UPDATE使用
SELECT * FROM orders WHERE id = 1 FOR UPDATE;

-- ROW EXCLUSIVE: INSERT/UPDATE/DELETE使用
INSERT INTO orders (user_id, amount) VALUES (1, 100);

-- SHARE UPDATE EXCLUSIVE: VACUUM(非FULL)使用
VACUUM orders;

-- SHARE: CREATE INDEX(非CONCURRENTLY)使用
CREATE INDEX idx_orders_user ON orders(user_id);

-- SHARE ROW EXCLUSIVE: 很少使用

-- EXCLUSIVE: REFRESH MATERIALIZED VIEW CONCURRENTLY使用

-- ACCESS EXCLUSIVE: 最强，与所有锁冲突
-- DROP TABLE/TRUNCATE/VACUUM FULL/ALTER TABLE使用
ALTER TABLE orders ADD COLUMN discount numeric(10,2);
```

**锁冲突矩阵**（精简版）：
```
                  ACCESS  ROW     ROW     ACCESS
                  SHARE   SHARE   EXCL    EXCL
ACCESS SHARE      ✓      ✓      ✓      ✗
ROW SHARE         ✓      ✓      ✓      ✗
ROW EXCLUSIVE     ✓      ✓      ✓      ✗
ACCESS EXCLUSIVE  ✗      ✗      ✗      ✗
```

### 行级锁

```sql
-- FOR UPDATE: 最严格的行锁
-- 其他事务的FOR UPDATE/UPDATE/DELETE会等待
SELECT * FROM orders WHERE id = 1 FOR UPDATE;

-- FOR NO KEY UPDATE: 弱于FOR UPDATE
-- 不阻塞其他事务的SELECT FOR KEY SHARE
SELECT * FROM orders WHERE id = 1 FOR NO KEY UPDATE;

-- FOR SHARE: 共享行锁
-- 其他事务可读不能写
SELECT * FROM orders WHERE id = 1 FOR SHARE;

-- FOR KEY SHARE: 最弱的行锁
-- 只防止行被删除，不阻止更新非键字段
SELECT * FROM orders WHERE id = 1 FOR KEY SHARE;
```

### 咨询锁

咨询锁（Advisory Lock）是PostgreSQL的特色——应用层面的互斥锁：

```sql
-- 获取会话级咨询锁
SELECT pg_advisory_lock(12345);
-- 执行需要互斥的操作
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- 释放锁
SELECT pg_advisory_unlock(12345);

-- 事务级咨询锁（事务结束自动释放）
SELECT pg_advisory_xact_lock(12345);
```

---

## 21.2 死锁检测

```sql
-- 查看当前锁等待情况
SELECT
    a.pid AS blocked_pid,
    a.usename AS blocked_user,
    a.query AS blocked_query,
    b.pid AS blocking_pid,
    b.usename AS blocking_user,
    b.query AS blocking_query
FROM pg_stat_activity a
JOIN pg_stat_activity b ON a.wait_event_type = 'Lock'
    AND a.wait_event IS NOT NULL
    AND a.state = 'active'
    AND b.state = 'active'
    AND a.pid != b.pid;
```

---

## 21.3 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: lock_demo
      POSTGRES_PASSWORD: test
```