# 第4章：查询重写优化

> 有时候，换一种写法就能让查询快100倍。同样的需求，不同的SQL写法，性能天差地别。这章教你如何识别低效SQL并重写它们。

---

## 📖 本章导读

### 一个真实的故事

小赵是一家电商公司的后端开发。运营经理提了一个需求："帮我找出手机类目下所有商品，以及价格超过5000元的商品"。

小赵写了这条SQL：

```sql
SELECT * FROM products WHERE category = '手机' OR price > 5000;
```

数据量小时没问题。但当商品表增长到100万行后，这个查询需要5秒。他用EXPLAIN一看，发现MySQL选择了全表扫描——因为OR条件连接了两个不同索引列，优化器无法有效利用索引。

后来一位同事建议他把OR拆成UNION ALL：

```sql
SELECT * FROM products WHERE category = '手机'
UNION ALL
SELECT * FROM products WHERE price > 5000 AND category != '手机';
```

每个子查询都能独立使用索引，整体性能提升了50倍——从5秒降到了0.1秒。

**同样的需求，不同的写法，性能天差地别。** 查询重写是SQL优化中最"低成本高回报"的手段——不需要改表结构，不需要加索引，只需要换一种写法。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **避免SELECT \*** — 只查需要的列，利用覆盖索引减少IO。`SELECT *`不仅浪费网络带宽，更重要的是它阻止了覆盖索引的使用。
2. **用UNION ALL代替OR** — 让每个条件都能独立使用索引。OR条件经常导致优化器选择全表扫描。
3. **用JOIN代替子查询** — 给优化器更多的选择空间。子查询的执行计划通常不如JOIN灵活。
4. **避免函数操作** — 防止索引失效。`WHERE YEAR(created_at) = 2024`会让索引完全失效。
5. **用LIMIT限制结果集** — 减少扫描行数。如果你只需要前100行，就不要让MySQL扫描100万行。

---

## 🧠 核心概念详解

### 技巧1：避免SELECT *

`SELECT *`是最常见的"性能杀手"之一。它有两个问题：

**问题1：无法使用覆盖索引。** 覆盖索引要求查询的所有列都在索引中。`SELECT *`意味着你需要所有列，而索引通常只包含部分列，所以必须回表。

**问题2：浪费网络带宽和内存。** 如果你只需要`name`和`price`两列，但`SELECT *`返回了20列（包括TEXT类型的产品描述），你浪费了90%的带宽。

```sql
-- ❌ 无法使用覆盖索引，必须回表
SELECT * FROM products WHERE category = '手机';

-- ✅ 如果idx_category_price包含category和price，可以使用覆盖索引
SELECT name, price FROM products WHERE category = '手机';
```

### 技巧2：用UNION ALL代替OR

OR条件的问题在于：当OR连接的两个条件使用不同的索引时，MySQL可能无法有效利用任何一个索引，最终选择全表扫描。

```sql
-- ❌ OR条件可能导致全表扫描
SELECT * FROM products WHERE category = '手机' OR price > 5000;

-- ✅ 拆成UNION ALL，每个子查询独立使用索引
SELECT * FROM products WHERE category = '手机'
UNION ALL
SELECT * FROM products WHERE price > 5000 AND category != '手机';
```

**为什么UNION ALL比OR快？** 因为UNION ALL的每个子查询是独立执行的，优化器可以为每个子查询选择最优的索引。而OR条件是一个整体，优化器需要找到一个能同时满足两个条件的执行计划——这通常很难。

**注意**：这里用UNION ALL而不是UNION。UNION会自动去重（需要额外排序），而UNION ALL不去重。如果你确定两个子查询的结果不会重复（或者重复也没关系），用UNION ALL性能更好。

### 技巧3：用JOIN代替子查询

MySQL对子查询的优化能力有限。很多子查询可以被重写为JOIN，给优化器更多的选择空间。

```sql
-- ❌ 子查询写法：MySQL可能将子查询物化为临时表
SELECT * FROM products WHERE id IN (
    SELECT product_id FROM orders WHERE user_id = 1
);

-- ✅ JOIN写法：优化器可以自由选择驱动表和JOIN顺序
SELECT DISTINCT p.* FROM products p
JOIN orders o ON p.id = o.product_id
WHERE o.user_id = 1;
```

**什么时候子查询比JOIN快？** 当子查询的结果集非常小（比如只有几行），而外层表非常大时，子查询可能更快。因为MySQL可以先执行子查询得到一个小结果集，然后用这个小结果集去外层表中查找。但这种情况比较少见，大多数情况下JOIN更优。

### 技巧4：避免对索引列使用函数

这是最常见的索引失效原因之一。任何对索引列的函数操作都会导致索引失效。

```sql
-- ❌ YEAR()函数导致索引失效
SELECT * FROM orders WHERE YEAR(created_at) = 2024;

-- ✅ 使用范围查询，索引可以正常使用
SELECT * FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

**为什么函数操作会导致索引失效？** 因为索引中存储的是`created_at`的原始值（如'2024-03-15 10:30:00'），而不是`YEAR(created_at)`的结果（2024）。MySQL无法将`YEAR(created_at) = 2024`这个条件"翻译"成索引查找——它不知道哪些原始值对应YEAR=2024。

### 技巧5：用LIMIT限制结果集

如果你只需要前100行，就不要让MySQL扫描100万行。LIMIT可以让MySQL在找到足够行数后停止扫描。

```sql
-- ❌ 无LIMIT：扫描所有匹配行
SELECT * FROM products WHERE category = '手机';

-- ✅ 有LIMIT：找到20行就停止扫描
SELECT * FROM products WHERE category = '手机' LIMIT 20;
```

**注意**：LIMIT对性能的提升取决于查询类型。对于`ORDER BY`查询，如果排序可以用索引，LIMIT的效果特别好——MySQL沿着索引顺序读取，读到LIMIT行数就停止。但如果排序不能用索引（需要filesort），MySQL仍然需要扫描所有行并排序，然后取前N行。

### 技巧6：用UNION ALL代替UNION

UNION和UNION ALL的区别在于：UNION会自动去重，而去重需要额外的排序或哈希操作。

```sql
-- ❌ UNION：自动去重，需要额外排序
SELECT category FROM products WHERE price > 5000
UNION
SELECT category FROM products WHERE stock > 50;

-- ✅ UNION ALL：不去重，性能更好
SELECT category FROM products WHERE price > 5000
UNION ALL
SELECT category FROM products WHERE stock > 50;
```

**什么时候该用UNION？** 只有当你确实需要去重时才用UNION。大多数情况下，两个子查询的结果不会重复（或者重复也没关系），用UNION ALL即可。

### 技巧7：用EXISTS代替IN（子查询结果集大时）

当IN子查询的结果集很大时，EXISTS通常更高效。因为EXISTS是"逐行检查"——对于外层表的每一行，检查子查询是否返回结果，一旦找到就停止。

```sql
-- IN写法：子查询先执行，结果集大时效率低
SELECT * FROM products WHERE id IN (
    SELECT product_id FROM orders WHERE status = 'completed'
);

-- EXISTS写法：逐行检查，子查询结果集大时更高效
SELECT * FROM products p WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.product_id = p.id AND o.status = 'completed'
);
```

---

## 🛠️ 动手实践

### 第一步：启动MySQL

```bash
cd demos/04-query-rewrite
docker compose up -d
docker exec -it mysql-rewrite mysql -uroot -proot123 optimization_db
```

### 第二步：对比优化前后的查询

```sql
-- 对比1：SELECT * vs SELECT指定列
EXPLAIN SELECT * FROM products WHERE category = '手机';
EXPLAIN SELECT name, price FROM products WHERE category = '手机';

-- 对比2：OR vs UNION ALL
EXPLAIN SELECT * FROM products WHERE category = '手机' OR price > 5000;
EXPLAIN SELECT * FROM products WHERE category = '手机'
UNION ALL
SELECT * FROM products WHERE price > 5000 AND category != '手机';

-- 对比3：子查询 vs JOIN
EXPLAIN SELECT * FROM products WHERE id IN (SELECT product_id FROM orders WHERE user_id = 1);
EXPLAIN SELECT DISTINCT p.* FROM products p JOIN orders o ON p.id = o.product_id WHERE o.user_id = 1;

-- 对比4：函数操作 vs 范围查询
EXPLAIN SELECT * FROM orders WHERE YEAR(created_at) = 2024;
EXPLAIN SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

---

## ⚠️ 常见误区

### 误区1：认为子查询总是比JOIN慢

子查询和JOIN各有优劣。当子查询的结果集非常小（几行），而外层表非常大时，子查询可能更快。关键是要用EXPLAIN对比两种写法的执行计划。

### 误区2：滥用SELECT *

很多开发人员习惯写`SELECT *`，因为"方便"。但在生产环境中，`SELECT *`可能导致严重的性能问题——特别是当表中有TEXT/BLOB大字段时。每次查询都返回这些大字段，不仅浪费带宽，还阻止了覆盖索引的使用。

### 误区3：忘记UNION和UNION ALL的区别

UNION会自动去重，而去重需要额外的排序或哈希操作。如果你不需要去重，一定要用UNION ALL。

---

## 💭 思考题

1. 为什么`WHERE a = 1 OR b = 2`可能导致全表扫描，而`UNION ALL`可以避免？
2. 什么情况下子查询比JOIN更快？举一个具体的例子。
3. `SELECT COUNT(*)`和`SELECT COUNT(id)`有什么区别？哪个更快？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-rewrite mysql -uroot -proot123 optimization_db
docker compose down -v
```
