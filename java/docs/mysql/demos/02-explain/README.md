# 第2章：执行计划解读(EXPLAIN)

> EXPLAIN是MySQL优化的"显微镜"——它能告诉你查询是怎么执行的、用了哪个索引、扫描了多少行。不会读EXPLAIN，优化就是"盲人摸象"。

---

## 📖 本章导读

### 一个真实的故事

小李是一家社交平台的后端开发。他写了一条查询：

```sql
SELECT * FROM employees WHERE department = 'Engineering' AND salary > 15000;
```

他在`department`和`salary`上分别建了索引，但查询还是需要0.5秒。他不理解——明明两个字段都有索引，为什么还是慢？

他用EXPLAIN一看，发现MySQL只用了`idx_department`索引，`salary > 15000`这个条件是在回表之后逐行过滤的。也就是说，MySQL先用`department`索引找到了所有Engineering部门的员工（假设有1000人），然后回表读取这1000行的完整数据，再逐行检查`salary > 15000`。如果Engineering部门只有10个人的工资超过15000，那990行的回表都是浪费的。

后来他建了一个联合索引`(department, salary)`，查询降到了0.01秒。因为联合索引可以同时过滤`department`和`salary`，MySQL直接在索引中就找到了符合条件的行，不需要回表后再过滤。

**EXPLAIN告诉你MySQL"怎么想的"——它选择了哪个索引、扫描了多少行、是否需要额外排序。** 读懂EXPLAIN，你就能精准定位性能瓶颈，而不是靠猜。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **读懂EXPLAIN的每个字段** — type、key、rows、Extra。每个字段都告诉你一个关于查询执行的"故事"。
2. **判断查询是否高效** — type从const到ALL，越靠前越好。看到`type=ALL`就知道是全表扫描，需要优化。
3. **识别索引失效场景** — 函数操作、隐式类型转换、LIKE前置通配符。这些场景下，即使有索引也不会被使用。
4. **理解联合索引的最左前缀原则** — 为什么`WHERE age > 25`无法使用`(city, age)`联合索引？因为跳过了最左边的`city`列。

---

## 🧠 核心概念详解

### EXPLAIN是什么？

EXPLAIN是MySQL提供的一个命令，放在SELECT语句前面，用来查看MySQL**打算怎么执行**这条查询。它不会真正执行查询（除非使用EXPLAIN ANALYZE），只是告诉你优化器的执行计划。

**💡 类比**：EXPLAIN就像医生开的化验单。化验单上有各种指标（白细胞、红细胞、血小板），每个指标告诉你身体的一个方面。EXPLAIN的输出也有各种字段（type、key、rows、Extra），每个字段告诉你查询执行的一个方面。医生通过化验单诊断疾病，你通过EXPLAIN诊断慢查询。

### EXPLAIN字段详解

当你执行`EXPLAIN SELECT ...`时，MySQL会返回一张表，每行代表查询中的一个"步骤"。以下是每个字段的含义：

| 字段 | 含义 | 如何解读 |
|------|------|---------|
| **id** | 查询序号 | 数字越大越先执行。如果id相同，从上到下执行。这告诉你MySQL以什么顺序处理查询中的各个部分。 |
| **select_type** | 查询类型 | SIMPLE（简单查询）、PRIMARY（最外层查询）、SUBQUERY（子查询）、DERIVED（派生表，即FROM子句中的子查询）。这告诉你查询的"结构"。 |
| **table** | 访问的表 | 可能是实际表名，也可能是`<derived2>`这样的派生表别名。 |
| **type** | 访问类型 | **这是最重要的字段！** 从优到差：system > const > eq_ref > ref > range > index > ALL。它告诉你MySQL以什么方式访问数据。 |
| **possible_keys** | 可能使用的索引 | 优化器"考虑过"的索引列表。注意：这不代表最终使用了这些索引。 |
| **key** | 实际使用的索引 | 优化器最终选择的索引。如果为NULL，说明没有使用索引（全表扫描）。 |
| **key_len** | 索引使用长度 | 越大说明用了越多索引列。比如联合索引`(city, age)`，如果key_len只够覆盖city，说明只用了第一列。 |
| **rows** | 预估扫描行数 | **这是估算值，不是精确值。** 越小越好。如果rows远大于实际返回的行数，说明有很多行被扫描后丢弃了。 |
| **Extra** | 额外信息 | Using index（覆盖索引，好）、Using where（需要回表过滤）、Using filesort（需要额外排序，差）、Using temporary（需要临时表，差）。 |

### type字段详解（从优到差）

type字段是EXPLAIN输出中最重要的一列。它告诉你MySQL以什么方式访问数据。以下是各种type的含义：

**const**：通过主键或唯一索引等值查询，最多返回一行。这是最快的访问方式。
- 示例：`WHERE id = 1`（id是主键）
- 原理：MySQL通过主键直接定位到那一行，就像你知道一本书的页码，直接翻到那一页。

**eq_ref**：在JOIN查询中，被驱动表使用主键或唯一索引关联。对于驱动表的每一行，被驱动表最多匹配一行。
- 示例：`JOIN orders ON users.id = orders.user_id`（orders.user_id有唯一索引）
- 原理：对于每个用户，MySQL通过唯一索引直接找到对应的订单，不需要扫描。

**ref**：通过非唯一索引等值查询。可能返回多行。
- 示例：`WHERE department = 'Engineering'`（department有普通索引）
- 原理：MySQL通过索引找到所有Engineering部门的行，可能有多个。

**range**：索引范围扫描。通常出现在`>`、`<`、`BETWEEN`、`IN`等操作中。
- 示例：`WHERE salary BETWEEN 10000 AND 15000`
- 原理：MySQL通过索引找到范围的起点，然后沿着索引顺序扫描到终点。

**index**：全索引扫描。MySQL扫描整个索引，而不是整个表。比ALL好，但不如range。
- 示例：`SELECT department FROM employees ORDER BY department`（department有索引）
- 原理：因为只需要department列，而索引中已经包含了这个列，所以MySQL扫描索引而不是表。

**ALL**：全表扫描。MySQL扫描整个表的所有行。这是最差的访问方式，需要优化。
- 示例：`SELECT * FROM employees WHERE name = '张三'`（name没有索引）
- 原理：MySQL从第一行开始，逐行检查name是否为'张三'，直到扫描完整个表。

### Extra关键信息

Extra字段提供了关于查询执行的额外信息，有些是"好消息"，有些是"警告信号"：

**Using index（好消息）**：查询使用了覆盖索引，所有需要的列都在索引中，不需要回表读取完整行。这是最优的情况。
- 示例：`SELECT department, salary FROM employees WHERE department = 'Engineering'`（有`(department, salary)`联合索引）
- 原理：索引中已经包含了department和salary两列，MySQL不需要回表。

**Using where（一般）**：MySQL使用WHERE条件来过滤行。这通常意味着索引不能完全覆盖WHERE条件，需要回表后过滤。
- 示例：`SELECT * FROM employees WHERE department = 'Engineering' AND name = '张三'`（只有department索引）
- 原理：MySQL先用department索引找到Engineering部门的行，回表后读取name列，再过滤name='张三'。

**Using filesort（警告信号）**：MySQL需要额外的排序操作。这意味着ORDER BY的列没有合适的索引。
- 示例：`SELECT * FROM employees ORDER BY name`（name没有索引）
- 原理：MySQL需要把结果集加载到内存中，然后排序。如果结果集很大，可能还需要使用磁盘临时文件。

**Using temporary（警告信号）**：MySQL需要创建临时表来处理查询。这通常出现在GROUP BY和ORDER BY的列不同时。
- 示例：`SELECT department, COUNT(*) FROM employees GROUP BY department ORDER BY COUNT(*)`
- 原理：MySQL先按department分组（可能需要临时表），然后对分组结果排序。

---

## 🛠️ 动手实践

### 第一步：启动MySQL

```bash
cd demos/02-explain
docker compose up -d
docker exec -it mysql-explain mysql -uroot -proot123 optimization_db
```

### 第二步：对比不同type的查询

在MySQL客户端中执行以下查询，观察EXPLAIN输出的差异：

```sql
-- type=const：主键等值查询，最快
-- 执行预期：type=const, rows=1
EXPLAIN SELECT * FROM employees WHERE id = 1;

-- type=ref：非唯一索引等值查询
-- 执行预期：type=ref, key=idx_department, rows=约3行
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering';

-- type=range：索引范围扫描
-- 执行预期：type=range, key=idx_salary
EXPLAIN SELECT * FROM employees WHERE salary BETWEEN 10000 AND 15000;

-- type=ALL：全表扫描，最差
-- 执行预期：type=ALL, rows=10（全表行数）
EXPLAIN SELECT * FROM employees WHERE name = '张三';
```

### 第三步：观察索引失效场景

```sql
-- 函数操作导致索引失效
-- 执行预期：type=ALL（YEAR()函数导致索引失效）
EXPLAIN SELECT * FROM employees WHERE YEAR(hire_date) = 2020;

-- 隐式类型转换导致索引失效
-- 执行预期：type=ALL（department是VARCHAR，但比较值是数字）
EXPLAIN SELECT * FROM employees WHERE department = 123;

-- LIKE前置通配符导致索引失效
-- 执行预期：type=ALL
EXPLAIN SELECT * FROM employees WHERE name LIKE '%三';
```

### 第四步：观察联合索引的最左前缀原则

```sql
-- 使用联合索引的全部列（最优）
-- 执行预期：key=idx_dept_salary, key_len较大
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering' AND salary > 15000;

-- 只使用联合索引的第一列（可以使用索引）
-- 执行预期：key=idx_dept_salary, key_len较小
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering';

-- 跳过第一列使用第二列（无法使用索引）
-- 执行预期：type=ALL（全表扫描）
EXPLAIN SELECT * FROM employees WHERE salary > 15000;
```

---

## ⚠️ 常见误区

### 误区1：只看type不看Extra

很多开发人员看到`type=ref`就认为查询没问题了。但实际上，`type=ref`但`Extra=Using filesort`的查询仍然可能很慢——因为MySQL需要额外排序。

**正确做法**：type和Extra都要看。Using filesort和Using temporary是明确的优化信号，即使type很好也需要关注。

### 误区2：rows是精确值

EXPLAIN输出的rows是**估算值**，基于统计信息计算得出。它可能和实际扫描的行数相差很大——特别是当统计信息过期时。

**正确做法**：用`EXPLAIN ANALYZE`（MySQL 8.0.18+）查看实际执行时间和扫描行数。它会真正执行查询并返回实际测量值。

### 误区3：possible_keys越多越好

possible_keys列出的是优化器"考虑过"的索引，不代表这些索引都是有用的。如果possible_keys很多但key为NULL，说明优化器认为全表扫描比用任何索引都更快——这通常意味着你的索引设计有问题。

---

## 💭 思考题

1. 如果EXPLAIN输出中type=ALL但rows=10，而type=ref时rows=1000，哪种情况更值得优化？为什么？
2. 联合索引`(a, b, c)`在哪些WHERE条件下可以使用？哪些条件下不能使用？
3. Extra中出现"Using index"和"Using index condition"有什么区别？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-explain mysql -uroot -proot123 optimization_db
docker compose down -v
```
