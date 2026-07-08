# 第9章：事务与锁优化

> "数据库卡住了"、"死锁了"、"数据不一致了"——这些问题往往和事务、锁有关。这章教你理解InnoDB的行锁、间隙锁、MVCC机制，以及如何避免死锁和锁等待。

---

## 📖 本章导读

### 一个真实的故事

小陈负责一个支付系统。某天高峰期，系统突然出现大量"Deadlock found"错误，订单创建失败。他紧急重启了数据库，问题暂时消失，但第二天又出现了。

他用`SHOW ENGINE INNODB STATUS`查看了死锁日志，发现两个事务在互相等待对方释放锁：

- 事务A：先锁了Alice的账户（`UPDATE accounts SET balance = balance - 100 WHERE name = 'Alice'`），然后试图锁Bob的账户
- 事务B：先锁了Bob的账户，然后试图锁Alice的账户

两个事务的加锁顺序相反，形成了死锁。他修改代码，让所有转账操作都"按ID升序加锁"，死锁从此消失。

**锁优化的核心：按固定顺序访问资源、缩短事务时间、合理使用索引。** 死锁不是bug，而是并发控制的必然结果——你需要做的是设计好加锁策略，避免死锁的发生。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解事务隔离级别** — READ COMMITTED vs REPEATABLE READ。知道每个级别解决了什么问题，引入了什么问题。
2. **理解MVCC原理** — 快照读 vs 当前读、undo log、Read View。MVCC是InnoDB实现高并发的核心机制。
3. **诊断死锁** — 用`SHOW ENGINE INNODB STATUS`找到死锁日志，分析死锁原因。
4. **避免死锁** — 固定加锁顺序、缩短事务时间、合理使用索引避免间隙锁范围过大。

---

## 🧠 核心概念详解

### 事务隔离级别

事务隔离级别是"一致性"和"并发性"之间的权衡。隔离级别越高，一致性越好，但并发性越差。

**READ UNCOMMITTED（读未提交）**：一个事务可以读到另一个事务未提交的修改。这是最低的隔离级别，几乎不使用——因为"脏读"会导致严重的数据不一致。

**READ COMMITTED（读已提交）**：一个事务只能读到另一个事务已提交的修改。这是Oracle的默认级别。它解决了脏读，但存在"不可重复读"——同一个事务内两次读取同一条数据，结果可能不同。

**REPEATABLE READ（可重复读）**：同一个事务内多次读取同一条数据，结果始终相同。这是MySQL InnoDB的默认级别。它通过MVCC解决了不可重复读，也解决了大部分幻读。

**SERIALIZABLE（串行化）**：所有事务串行执行。这是最高的隔离级别，但并发性最差，几乎不使用。

| 级别 | 脏读 | 不可重复读 | 幻读 | 并发性 |
|------|------|-----------|------|--------|
| READ UNCOMMITTED | ✅ | ✅ | ✅ | 最高 |
| READ COMMITTED | ❌ | ✅ | ✅ | 高 |
| REPEATABLE READ(默认) | ❌ | ❌ | ❌(MVCC) | 中 |
| SERIALIZABLE | ❌ | ❌ | ❌ | 最低 |

### MVCC原理

MVCC（Multi-Version Concurrency Control，多版本并发控制）是InnoDB实现高并发的核心机制。它的核心思想是：**读不阻塞写，写不阻塞读。**

在MVCC中，每行数据有多个版本。当一个事务修改数据时，InnoDB会创建一个新版本，而不是覆盖旧版本。旧版本保留在undo log中，供其他事务读取。

**快照读 vs 当前读**：
- **快照读**（普通的SELECT）：读取事务开始时的数据快照，不阻塞也不被阻塞。这是MVCC的核心优势。
- **当前读**（SELECT ... FOR UPDATE、UPDATE、DELETE）：读取数据的最新版本，并对读取的行加锁。

### 死锁的四个必要条件

死锁的发生需要同时满足四个条件：
1. **互斥**：资源不能被共享，一次只能被一个事务使用
2. **持有并等待**：事务已经持有一个资源，又在等待另一个资源
3. **不可剥夺**：资源不能被强制释放，只能由持有者主动释放
4. **循环等待**：事务之间形成一个循环等待链

**预防死锁**：破坏以上任意一个条件即可。最常用的方法是破坏"循环等待"——让所有事务按相同的顺序获取锁。

---

## 🛠️ 动手实践

```bash
cd demos/09-transaction-lock
docker compose up -d
docker exec -it mysql-lock mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行：

```sql
-- 查看当前隔离级别
SELECT @@transaction_isolation;

-- 查看当前事务
SELECT * FROM information_schema.INNODB_TRX\G

-- 查看最近死锁
SHOW ENGINE INNODB STATUS\G
```

**死锁模拟**（需要两个会话同时执行）：

会话1：
```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE name = 'Alice';
-- 等待几秒
UPDATE accounts SET balance = balance + 100 WHERE name = 'Bob';
COMMIT;
```

会话2（与会话1顺序相反）：
```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE name = 'Bob';
-- 等待几秒
UPDATE accounts SET balance = balance + 100 WHERE name = 'Alice';
COMMIT;
```

---

## ⚠️ 常见误区

### 误区1：认为READ COMMITTED比REPEATABLE READ更好

READ COMMITTED的锁粒度更小（没有间隙锁），死锁概率更低。但它存在不可重复读和幻读问题。如果你的业务逻辑依赖"同一个事务内多次读取结果一致"，必须用REPEATABLE READ。

### 误区2：在事务中做耗时操作

```sql
-- ❌ 事务中调用外部API
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- 调用支付网关API（可能需要几秒）
CALL payment_gateway();
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

事务持有锁的时间越长，并发冲突的概率越大。耗时操作（如调用外部API）应该在事务外完成。

### 误区3：忘记SELECT ... FOR UPDATE的加锁范围

`SELECT ... FOR UPDATE`不仅锁住匹配的行，在REPEATABLE READ级别下还会锁住行之间的间隙（间隙锁）。如果查询条件没有命中索引，会锁住整个表。

---

## 💭 思考题

1. 为什么REPEATABLE READ级别下，`SELECT ... FOR UPDATE`会加间隙锁？间隙锁解决什么问题？
2. 如果两个事务都执行`UPDATE accounts SET balance = balance - 100 WHERE id = 1`，会发生死锁吗？为什么？
3. MVCC的"快照读"和"当前读"有什么区别？分别在什么场景下使用？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-lock mysql -uroot -proot123 optimization_db
docker compose down -v
```
