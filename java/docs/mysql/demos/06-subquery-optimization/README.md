# 第6章：子查询优化

> 子查询看似简洁，但MySQL对子查询的优化能力有限。很多子查询可以被重写为JOIN，性能提升10倍以上。这章教你识别"低效子查询"并重写它们。

---

## 📖 本章导读

### 一个真实的故事

小周写了一条查询，用于找出"有订单的用户"：

```sql
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders);
```

数据量小时没问题。但当订单表增长到50万行后，这个查询需要3秒。他用EXPLAIN一看，发现MySQL将子查询的结果物化（materialize）为一个临时表，然后用这个临时表去外层查询。

他把IN子查询重写为JOIN：

```sql
SELECT DISTINCT u.* FROM users u JOIN orders o ON u.id = o.user_id;
```

查询从3秒降到了0.05秒。因为JOIN让优化器可以选择更优的执行计划——比如以users为驱动表，用orders的索引快速查找。

**子查询优化的核心：能用JOIN就不用子查询，能用EXISTS就不用IN。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **识别低效子查询** — IN子查询、NOT IN子查询、标量子查询各有各的性能陷阱
2. **掌握重写策略** — JOIN替代IN、LEFT JOIN替代NOT IN、GROUP BY替代标量子查询
3. **理解半连接优化** — MySQL 8.0对IN子查询的自动优化机制

---

## 🧠 核心概念详解

### 子查询的类型与问题

**IN子查询**：`WHERE id IN (SELECT ...)`

IN子查询的问题是：MySQL可能将子查询结果物化为临时表，然后对外层表的每一行检查是否在临时表中。如果子查询结果集很大，物化过程本身就耗时。

**NOT IN子查询**：`WHERE id NOT IN (SELECT ...)`

NOT IN子查询比IN更危险。如果子查询结果中包含NULL，整个NOT IN条件会返回空——因为`id NOT IN (1, 2, NULL)`等价于`id != 1 AND id != 2 AND id != NULL`，而任何值与NULL比较都返回NULL。

**标量子查询**：`SELECT (SELECT MAX(...))`

标量子查询在SELECT列表中，对于外层查询的每一行都会执行一次。如果外层有1000行，标量子查询就执行1000次。

### 子查询重写策略

| 子查询类型 | 低效写法 | 高效重写 | 原理 |
|-----------|---------|---------|------|
| IN子查询 | `WHERE id IN (SELECT ...)` | `JOIN ... ON ...` | JOIN给优化器更多选择 |
| NOT IN子查询 | `WHERE id NOT IN (SELECT ...)` | `LEFT JOIN ... WHERE ... IS NULL` | 避免NULL陷阱 |
| 标量子查询 | `SELECT (SELECT MAX(...))` | `JOIN + GROUP BY` | 避免逐行执行 |
| EXISTS子查询 | — | 本身较高效，无需重写 | EXISTS找到就停止 |

---

## 🛠️ 动手实践

```bash
cd demos/06-subquery-optimization
docker compose up -d
docker exec -it mysql-subquery mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行以下对比查询：

```sql
-- 对比1：IN子查询 vs JOIN
EXPLAIN SELECT * FROM users WHERE id IN (SELECT user_id FROM orders);
EXPLAIN SELECT DISTINCT u.* FROM users u JOIN orders o ON u.id = o.user_id;

-- 对比2：NOT IN vs LEFT JOIN
EXPLAIN SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);
EXPLAIN SELECT u.* FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL;

-- 对比3：标量子查询 vs JOIN+GROUP BY
EXPLAIN SELECT u.name, (SELECT MAX(amount) FROM orders WHERE user_id = u.id) AS max_amount FROM users u;
EXPLAIN SELECT u.name, MAX(o.amount) AS max_amount FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id;
```

---

## ⚠️ 常见误区

### 误区1：NOT IN + NULL的陷阱

```sql
-- ❌ 如果子查询结果包含NULL，整个查询返回空
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);
-- 如果orders.user_id中有NULL，这个查询永远返回空！

-- ✅ 使用LEFT JOIN避免NULL陷阱
SELECT u.* FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL;
```

### 误区2：认为所有子查询都需要重写

EXISTS子查询本身效率较高，不需要重写。MySQL 8.0对IN子查询也有"半连接优化"，可以自动将IN子查询转为JOIN。关键是用EXPLAIN查看实际执行计划，而不是盲目重写。

---

## 💭 思考题

1. 为什么`NOT IN`遇到NULL会返回空？`NOT EXISTS`会有同样的问题吗？
2. MySQL 8.0的"半连接优化"是什么？它如何优化IN子查询？
3. 什么情况下子查询比JOIN更快？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-subquery mysql -uroot -proot123 optimization_db
docker compose down -v
```
