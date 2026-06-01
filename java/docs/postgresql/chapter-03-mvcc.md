# 第3章 事务与MVCC

## 3.1 什么是MVCC

### MVCC的核心思想

MVCC（Multi-Version Concurrency Control，多版本并发控制）是现代关系型数据库实现高并发读写的核心机制。它的基本思想是：**读不阻塞写，写不阻塞读**。

在MVCC出现之前，数据库的并发控制主要依靠锁——读需要加读锁，写需要加写锁，读和写互斥。这意味着，如果有人正在更新一行数据（加上写锁），其他人必须等待这个更新提交后才能读取这行数据。在高并发场景下，这会导致严重的阻塞。

MVCC通过为每一行数据维护多个版本（快照）解决了这个问题：

```
时间线：

T1: 用户A开始事务，读取id=1的记录 → 看到 "name='张三'"
T2: 用户B开始事务，更新id=1的记录 → 将"张三"改为"李四"（创建新版本）
T3: 用户A再次读取id=1的记录 → 还是看到 "name='张三'"（读的是旧版本）
T4: 用户B提交事务
T5: 用户A再次读取id=1的记录 → 仍然看到 "name='张三'"（可重复读隔离级别下）
```

关键点：**事务A读取数据时，不需要等待事务B提交。事务B写入数据时，也不需要等待事务A读取完成。** 每个事务看到的是数据在自己启动时（或查询开始时）的一个一致性快照。

### PostgreSQL的MVCC vs InnoDB的MVCC

虽然MySQL的InnoDB和PostgreSQL都实现了MVCC，但实现方式有本质差异。理解这个差异是理解PostgreSQL独特运维行为（如VACUUM）的关键：

| 维度 | PostgreSQL | MySQL InnoDB |
|------|-----------|-------------|
| **旧版本存储** | 旧版本留在数据文件中（死元组） | 旧版本存储在UNDO表空间 |
| **清理机制** | VACUUM（需要手动/自动清理） | purge（自动异步回收） |
| **回滚** | PG的旧版本仍在数据文件，回滚只需丢弃新版本 | 需要UNDO日志重建旧版本 |
| **事务ID** | 32位，有回卷问题（XID回卷） | 事务ID在UNDO中管理 |
| **可见性** | 通过元组头信息（xmin/xmax）判断 | 通过UNDO + Read View判断 |

PostgreSQL的设计意味着：死元组（旧版本的行数据）会留在数据文件中，直到VACUUM回收。这是PostgreSQL需要关注表膨胀的根本原因，但也是它回滚速度极快的原因——回滚只需要将新版本的标记改为"无效"，而不需要像InnoDB那样从UNDO中重建数据。

## 3.2 事务ID与元组结构

### 事务ID（xid）

PostgreSQL中的每个事务都有一个唯一的事务ID（xid），类型为32位无符号整数。xid从3开始递增，0/1/2为保留值：

- 0：InvalidXid（无效事务）
- 1：BootstrapXid（系统初始化事务）
- 2：FrozenXid（冻结事务，用于处理回卷）

```sql
-- 查看当前事务ID
SELECT txid_current();
-- 输出：1024

-- 查看当前事务的快照信息
SELECT txid_current_snapshot();
-- 输出：1024:1024:
-- 格式：xmin:xmax:xip_list
-- xmin: 最早活跃事务ID
-- xmax: 最新已分配事务ID+1
-- xip_list: 活跃事务ID列表
```

### 元组头上的隐藏字段

PostgreSQL的每行数据（元组）包含几个隐藏的系统字段：

```sql
-- 查看元组头信息（需要扩展）
CREATE EXTENSION pageinspect;

-- 查看数据页中每个元组的头信息
SELECT lp, t_xmin, t_xmax, t_ctid
FROM heap_page_items(get_raw_page('users', 0));
```

每个元组的头信息包含：

- **xmin**：创建该元组的事务ID。如果xmin对应的事务已提交，这个元组对可见性事务是可见的。
- **xmax**：删除/锁定该元组的事务ID。如果xmax对应的事务已提交，这个元组对可见性事务是不可见的。
- **t_ctid**：指向该元组的新版本（如果本行被更新过）。PostgreSQL的更新操作不直接修改原数据，而是创建一个新版本，并用t_ctid将新旧版本链接起来。
- **t_infomask**：位掩码，标记事务的提交状态（比查询事务状态表更快）。

### 可见性规则

当PostgreSQL判断一条元组对当前事务是否可见时，遵循以下规则：

```
给定一条元组（xmin, xmax）和当前事务的快照（xmin, xmax, xip_list）：

1. 如果 xmin 是已提交的事务且 xmax 无效：
   → 可见（正常数据）

2. 如果 xmin 是当前事务本身且 xmax 无效：
   → 可见（自己插入的数据）

3. 如果 xmax 是已提交的事务：
   → 不可见（已被其他事务删除/更新）

4. 如果 xmin 在快照的活跃事务列表中：
   → 不可见（创建该元组的事务尚未提交）

5. 如果 xmax 在快照的活跃事务列表中：
   → 可见（删除该元组的事务尚未提交，所以还没被删）
```

这条规则由 `HeapTupleSatisfiesMVCC` 函数实现，是PostgreSQL MVCC的核心代码。

## 3.3 事务隔离级别

PostgreSQL支持SQL标准定义的四种隔离级别，但与其他数据库有一些重要差异：

```sql
-- 设置隔离级别
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- 或
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- 查看当前隔离级别
SHOW transaction_isolation;
```

**读已提交（READ COMMITTED）** — PostgreSQL默认级别

每个语句执行时都会获取一个新的快照。这意味着在同一事务中，连续的SELECT语句可能看到不同的数据（如果其他事务在中间提交了修改）：

```sql
-- 事务A：
BEGIN;
SELECT amount FROM accounts WHERE id = 1;  -- 返回 100

-- 此时事务B：UPDATE accounts SET amount = 0 WHERE id = 1; COMMIT;

SELECT amount FROM accounts WHERE id = 1;  -- 返回 0（看到了事务B的提交）
COMMIT;
```

**可重复读（REPEATABLE READ）**

整个事务使用同一个快照（在第一个语句执行时获取）。无论其他事务如何修改提交，这个快照内的数据保持不变：

```sql
-- 事务A：
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT amount FROM accounts WHERE id = 1;  -- 返回 100

-- 此时事务B：UPDATE accounts SET amount = 0 WHERE id = 1; COMMIT;

SELECT amount FROM accounts WHERE id = 1;  -- 仍然返回 100！
COMMIT;
```

可重复读级别下，如果事务A尝试UPDATE一条已被事务B修改的行，事务A会收到 **"could not serialize access due to concurrent update"** 错误。PostgreSQL认为：既然你读到的快照中这条数据是旧的，你基于这个旧数据做的修改可能是不正确的，所以直接让你的事务失败。

**可序列化（SERIALIZABLE）**

PostgreSQL使用SSI（Serializable Snapshot Isolation）实现可序列化隔离级别，而不是传统的2PL（两阶段锁定）。SSI通过检测"读写冲突"模式来发现可能导致序列化异常的情况，如果一个分布式冲突被检测到，其中一个事务会被中止：

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- 如果系统检测到与其他事务的序列化冲突，可能收到：
-- ERROR:  could not serialize access due to read/write dependencies among transactions
```

## 3.4 事务ID回卷与冻结机制

### 回卷问题

事务ID是32位无符号整数，取值范围0到42亿。当PostgreSQL运行了足够长时间（或产生了足够多的事务），xid会达到最大值然后回卷到3（0、1、2为保留值）：

```
事务ID演进：
... → 4294967295 → 3 → 4 → 5 ...

问题：当xid=5时，之前的xid=4294967295 → 4294967290之间的事务
被误认为是"未来的事务"（因为5 < 4294967295？）
```

这就是事务ID回卷的致命问题。如果不处理，回卷后新事务会"看不到"实际上已经提交的旧数据。

### 冻结（FREEZE）机制

PostgreSQL的解决方案是**冻结**：当VACUUM发现某个元组的xmin或xmax对应的事务ID"太老"时，将其标记为冻结：

```sql
-- 手动冻结（通常由autovacuum自动处理）
VACUUM FREEZE accounts;

-- 查看冻结年龄
SELECT relname, age(relfrozenxid) as freeze_age
FROM pg_class
WHERE relname = 'accounts';
```

冻结后的元组，无论当前事务ID是多少，这个元组都对所有事务可见。PostgreSQL会定期（通过autovacuum_freeze_max_age参数控制，默认2亿事务）触发autovacuum来冻结老的元组。

## 3.5 Docker Compose：隔离级别测试

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: iso_test
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-mvcc.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-mvcc.sql
CREATE TABLE accounts (
    id int PRIMARY KEY,
    name text,
    amount numeric(10,2)
);

INSERT INTO accounts VALUES
    (1, '张三', 1000.00),
    (2, '李四', 500.00),
    (3, '王五', 2000.00);
```

测试可重复读与读已提交的差异：
```bash
# 终端1（事务A）
docker exec -it postgres psql -U postgres -d iso_test
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT amount FROM accounts WHERE id = 1;  -- 1000

# 终端2（事务B）
docker exec -it postgres psql -U postgres -d iso_test
UPDATE accounts SET amount = 0 WHERE id = 1; COMMIT;

# 回到终端1
SELECT amount FROM accounts WHERE id = 1;  -- 可重复读：仍然1000
COMMIT;
SELECT amount FROM accounts WHERE id = 1;  -- 提交后再读：0
```