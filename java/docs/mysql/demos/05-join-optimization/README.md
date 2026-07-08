# 第5章：JOIN优化

> JOIN是SQL中最常用也最容易出问题的操作。理解驱动表概念和JOIN算法，是优化多表查询的关键。一条三表JOIN的查询，优化前后性能可能差50倍。

---

## 📖 本章导读

### 一个真实的故事

小陈是一家电商公司的后端开发。他写了一条三表JOIN查询，用于展示用户的订单详情：

```sql
SELECT u.name, o.amount, oi.product_name
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
WHERE u.city = 'Beijing';
```

系统刚上线时，用户只有几千人，订单只有几万条，这个查询瞬间返回。半年后，订单量增长到500万条，同样的查询需要5秒。

小陈用EXPLAIN一看，发现MySQL选择了`orders`表作为驱动表——因为orders表最大（500万行），导致Nested-Loop Join的外层循环次数过多。他用`STRAIGHT_JOIN`强制`users`作为驱动表（北京用户只有几千人），查询从5秒降到了0.1秒。

**JOIN优化的核心：小表驱动大表，为JOIN列建索引。** 驱动表越小，外层循环次数越少；被驱动表有索引，内层查找越快。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解三种JOIN算法** — Nested-Loop Join、Block Nested-Loop Join、Hash Join。知道每种算法的工作原理和适用场景。
2. **掌握驱动表选择原则** — 小表驱动大表、有索引的表作为被驱动表、过滤后行数少的表作为驱动表。
3. **优化多表JOIN** — 减少JOIN表数量、为JOIN列建索引、用STRAIGHT_JOIN强制驱动表顺序。

---

## 🧠 核心概念详解

### JOIN算法详解

MySQL有三种JOIN算法，不同版本支持不同：

**Nested-Loop Join（嵌套循环连接）**

这是最基础的JOIN算法。它的工作方式是：外层循环逐行扫描驱动表，对于驱动表的每一行，内层循环在被驱动表中查找匹配的行。

想象你要合并两个班级的名单。你拿着A班的花名册（驱动表），对于A班的每个学生，你去B班的花名册（被驱动表）中查找同名的学生。如果A班有50人，B班有50人，你最多需要查找50×50=2500次。

但如果B班的花名册按姓名排序（有索引），你可以用二分查找，每次只需要log(50)≈6次比较。总查找次数从2500次降到50×6=300次。这就是"被驱动表有索引"的重要性。

**Block Nested-Loop Join（块嵌套循环连接）**

当被驱动表没有索引时，Nested-Loop Join的每次内层查找都需要全表扫描，性能极差。Block Nested-Loop Join的改进是：将驱动表的数据分块读入Join Buffer（内存缓冲区），然后批量与被驱动表比较。

这就像你不再一个一个查，而是先把A班的所有学生名字抄在一张纸上，然后拿着这张纸去B班的花名册中一次性比对。虽然还是需要全表扫描B班，但至少减少了读取A班的次数。

**Hash Join（哈希连接，MySQL 8.0.18+）**

Hash Join是最高效的JOIN算法。它的工作方式是：先为驱动表构建一个哈希表（以JOIN列为键），然后扫描被驱动表，对于被驱动表的每一行，用哈希表O(1)查找匹配。

这就像你先把A班的学生名字做成一个哈希表（名字→学生信息），然后对于B班的每个学生，用O(1)的时间就能判断是否在A班中。总时间复杂度从O(n×m)降到了O(n+m)。

| 算法 | MySQL版本 | 原理 | 适用场景 |
|------|----------|------|---------|
| Nested-Loop Join | 所有版本 | 外层逐行扫描驱动表，内层用索引查找 | 驱动表小 + 被驱动表有索引 |
| Block Nested-Loop | 5.5+ | 将驱动表分块读入Join Buffer | 被驱动表无索引 |
| Hash Join | 8.0.18+ | 构建哈希表，O(1)查找 | 大表JOIN，无索引 |

### 驱动表选择原则

驱动表是JOIN查询中"外层循环"的表。驱动表的选择直接影响性能：

**原则1：小表驱动大表。** 行数少的表作为驱动表，行数多的表作为被驱动表。因为外层循环次数=驱动表的行数，驱动表越小，循环次数越少。

**原则2：有索引的表作为被驱动表。** 内层循环需要在被驱动表中查找匹配行。如果被驱动表的JOIN列有索引，内层查找是O(log n)的；如果没有索引，内层查找是O(n)的。

**原则3：过滤后行数少的表作为驱动表。** 不是看表的原始行数，而是看WHERE条件过滤后剩余的行数。比如`users`表有100万行，但`WHERE city = 'Beijing'`过滤后只剩1万行——这1万行才是驱动表的实际行数。

---

## 🛠️ 动手实践

### 第一步：启动MySQL

```bash
cd demos/05-join-optimization
docker compose up -d
docker exec -it mysql-join mysql -uroot -proot123 optimization_db
```

### 第二步：对比JOIN算法

```sql
-- Nested-Loop Join：被驱动表有索引
-- 执行预期：orders表type=ref, key=idx_user_id
EXPLAIN SELECT u.name, o.amount FROM users u JOIN orders o ON u.id = o.user_id;

-- 强制驱动表顺序（当优化器选错时）
-- 执行预期：users为驱动表，orders使用索引
EXPLAIN SELECT STRAIGHT_JOIN u.name, o.amount FROM orders o JOIN users u ON u.id = o.user_id;

-- 三表JOIN
-- 执行预期：观察驱动表是谁，被驱动表是否使用索引
EXPLAIN SELECT u.name, o.amount, oi.product_name
FROM users u JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
WHERE u.city = 'Beijing';
```

---

## ⚠️ 常见误区

### 误区1：认为JOIN表越多越好

每增加一个JOIN表，查询复杂度呈指数增长。如果你需要JOIN 5个以上的表，考虑重新设计表结构——可能是范式过度了。

### 误区2：忘记为JOIN列建索引

JOIN列没有索引是JOIN查询慢的最常见原因。对于`ON a.id = b.user_id`，`b.user_id`上必须有索引，否则每次内层查找都是全表扫描。

### 误区3：LEFT JOIN时WHERE条件位置错误

```sql
-- ❌ WHERE条件在LEFT JOIN后过滤，会把没有订单的用户也过滤掉
SELECT u.name, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.status = 'completed';

-- ✅ 条件放在ON中，保留没有订单的用户
SELECT u.name, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed';
```

---

## 💭 思考题

1. 为什么Hash Join比Nested-Loop Join快？什么情况下Hash Join无法使用？
2. 如果`orders`表有100万行，`users`表有1万行，`SELECT * FROM users JOIN orders ON users.id = orders.user_id`中谁是驱动表？为什么？
3. STRAIGHT_JOIN有什么风险？什么时候该用它？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-join mysql -uroot -proot123 optimization_db
docker compose down -v
```
