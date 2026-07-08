# 第3章：索引优化实战

> 索引是SQL优化最核心的手段。但"加索引"不是万能的——加错了索引不仅不能加速，还会拖慢写入。这章教你什么场景用什么索引、联合索引的最左前缀原则、覆盖索引、以及如何避免索引失效。

---

## 📖 本章导读

### 一个真实的故事

小王是一家电商公司的后端开发。用户表有100万条数据，产品经理要求做一个"按城市和年龄筛选用户"的功能。他写了这条查询：

```sql
SELECT * FROM users WHERE city = 'Beijing' AND age > 25;
```

查询需要3秒。小王的第一反应是"加索引"——他在`city`上建了一个索引，又在`age`上建了一个索引。但查询还是需要2秒，几乎没有改善。

他不理解：明明两个字段都有索引，为什么还是慢？

后来一位DBA告诉他：MySQL在执行这条查询时，只能选择一个索引。它选择了`city`索引，找到了所有北京的用户（假设有20万人），然后回表读取这20万行的完整数据，再逐行检查`age > 25`。如果北京用户中只有5万人的年龄大于25岁，那15万行的回表都是浪费的。

DBA建议他建一个联合索引`(city, age)`。这个索引同时包含了city和age两个字段，MySQL可以直接在索引中找到"北京且年龄大于25"的用户，不需要回表后再过滤。查询从3秒降到了0.01秒。

**索引优化的核心不是"加索引"，而是"加对索引"。** 一个精心设计的联合索引，效果远超多个单列索引的简单叠加。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解B+Tree索引原理** — 知道为什么索引能加速查询，以及为什么有些查询即使有索引也慢。你会理解"回表"是什么，以及如何避免它。
2. **设计联合索引** — 掌握最左前缀原则，知道`(city, age)`和`(age, city)`是完全不同的索引，知道什么时候该把哪个列放在前面。
3. **使用覆盖索引** — 让查询的所有列都在索引中，避免回表。这是性能提升最大的优化手段之一，通常能带来10倍以上的性能提升。
4. **识别索引失效场景** — 函数操作、隐式类型转换、OR条件、LIKE前置通配符——这些场景下，即使有索引也不会被使用。

---

## 🧠 核心概念详解

### B+Tree索引原理

要理解索引为什么能加速查询，你需要先理解B+Tree的数据结构。

想象你有一本1000页的字典，你要查"MySQL"这个词。如果没有目录（索引），你只能从第1页开始一页一页翻，直到找到为止——这就是"全表扫描"。在最坏的情况下，你可能需要翻1000次。

但字典有拼音索引：你先翻到"M"开头的部分，再找"MY"，最后定位到"MySQL"。整个过程只需要翻3-4次，而不是1000次。这就是B+Tree索引的核心思想。

B+Tree的结构就像一棵倒立的树：
- **根节点**在最顶层，存储了数据的范围划分。比如"字母A-M在左边子树，字母N-Z在右边子树"。
- **分支节点**在中间层，进一步缩小范围。比如"A-M中，A-F在左边，G-M在右边"。
- **叶子节点**在最底层，存储了实际的数据（或指向数据的指针）。叶子节点之间通过指针相连，形成一个有序链表——这就是为什么范围查询（`BETWEEN`、`>`、`<`）也能利用索引。

```
         [根节点: A-Z]
         /            \
    [分支: A-M]      [分支: N-Z]
    /        \        /        \
[叶子:A-F] [G-M] [叶子:N-S] [T-Z]
    ↓        ↓       ↓        ↓
  实际数据  实际数据 实际数据  实际数据
```

对于100万行数据，B+Tree的深度通常只有3层。这意味着，通过索引查找任意一行数据，只需要3次磁盘IO。而全表扫描需要扫描100万行——即使每次IO能读取100行，也需要1万次IO。

**这就是为什么加了索引之后，查询从3秒变成了0.01秒——不是魔法，而是数据结构的力量。**

### 回表是什么？为什么覆盖索引能避免回表？

在InnoDB中，索引分为两种：
- **聚簇索引（主键索引）**：叶子节点存储了**完整的行数据**。
- **二级索引（普通索引）**：叶子节点只存储了**索引列和主键值**。

当你通过二级索引查询时，MySQL先通过二级索引找到主键值，然后再通过主键索引找到完整的行数据。这个过程叫做**回表**。

回表是很多查询慢的根本原因。比如你有一个`(city)`索引，查询`SELECT * FROM users WHERE city = 'Beijing'`。MySQL先通过city索引找到所有北京用户的主键ID，然后逐个回表读取完整行。如果北京有20万用户，就需要20万次回表——每次回表都是一次随机IO，非常耗时。

**覆盖索引**就是解决回表问题的方案。如果查询的所有列都在索引中，MySQL就不需要回表——直接从索引中返回数据。比如你有一个`(city, age)`联合索引，查询`SELECT city, age FROM users WHERE city = 'Beijing'`。因为city和age都在索引中，MySQL直接返回索引中的数据，不需要回表。

这就是为什么`SELECT city, age`比`SELECT *`快很多——前者可能只需要扫描索引，后者必须回表。

### 联合索引的最左前缀原则

联合索引有一个重要的规则：**最左前缀原则**。意思是，联合索引只能从最左边的列开始匹配，不能跳过左边的列直接使用右边的列。

联合索引`(city, age)`的内部结构是这样的：

```
索引中的排序顺序：
(Beijing, 18) → (Beijing, 20) → (Beijing, 25) → (Beijing, 30) → ...
(Shanghai, 18) → (Shanghai, 20) → (Shanghai, 25) → ...
```

数据先按city排序，city相同的再按age排序。这意味着：
- ✅ `WHERE city = 'Beijing'` — 可以使用索引。因为city是联合索引的第一列，数据按city排序，可以直接定位到Beijing的部分。
- ✅ `WHERE city = 'Beijing' AND age > 25` — 可以使用索引的全部两列。先定位到Beijing，然后在Beijing内部按age范围扫描。
- ❌ `WHERE age > 25` — 无法使用索引。因为数据是先按city排序的，不同city的age混在一起，无法直接定位。

**💡 类比**：联合索引就像电话簿——先按姓排序，同姓的再按名排序。你可以快速找到所有"姓张"的人（匹配第一列），也可以快速找到"姓张且名三"的人（匹配全部列）。但你无法快速找到所有"名三"的人（跳过了第一列），因为"名三"的人分散在不同的姓下面。

### 索引失效的常见场景

即使你建了索引，以下场景也会导致索引失效：

**1. 对索引列使用函数**

```sql
-- ❌ 索引失效：YEAR()函数包裹了索引列
SELECT * FROM orders WHERE YEAR(created_at) = 2024;

-- ✅ 索引生效：使用范围查询
SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

**为什么？** 索引中存储的是`created_at`的原始值（如'2024-03-15'），而不是`YEAR(created_at)`的结果（2024）。MySQL无法将`YEAR(created_at) = 2024`转换为索引查找。

**2. 隐式类型转换**

```sql
-- ❌ 索引失效：phone是VARCHAR，但比较值是数字
SELECT * FROM users WHERE phone = 13800138000;

-- ✅ 索引生效：保持类型一致
SELECT * FROM users WHERE phone = '13800138000';
```

**为什么？** 当字符串列与数字比较时，MySQL会将字符串转换为数字再比较。这个转换操作作用在索引列上，导致索引失效。

**3. LIKE前置通配符**

```sql
-- ❌ 索引失效：通配符在开头
SELECT * FROM users WHERE name LIKE '%张三';

-- ✅ 索引生效：通配符在末尾
SELECT * FROM users WHERE name LIKE '张三%';
```

**为什么？** B+Tree索引按值的顺序排列。`LIKE '张三%'`可以定位到"张三"开头的位置，然后向后扫描。但`LIKE '%张三'`无法定位——因为以"张三"结尾的值分散在整个索引中。

**4. OR条件连接不同索引列**

```sql
-- ❌ 可能索引失效：OR连接了两个不同索引列
SELECT * FROM users WHERE city = 'Beijing' OR age = 30;

-- ✅ 使用UNION ALL替代
SELECT * FROM users WHERE city = 'Beijing'
UNION ALL
SELECT * FROM users WHERE age = 30 AND city != 'Beijing';
```

**为什么？** MySQL对OR条件的优化能力有限。当OR连接的两个条件使用不同的索引时，MySQL可能选择全表扫描。

---

## 🛠️ 动手实践

### 第一步：启动MySQL并生成测试数据

```bash
cd demos/03-index-optimization
docker compose up -d
# 等待数据生成完成（10万条数据，约30秒）
docker exec -it mysql-index mysql -uroot -proot123 optimization_db
```

### 第二步：对比有索引和无索引的查询

```sql
-- 无索引表的查询（全表扫描）
-- 执行预期：扫描10万行，耗时较长
SELECT COUNT(*) FROM users_no_index WHERE city = 'Beijing';

-- 有索引表的查询（索引查找）
-- 执行预期：扫描约2万行（Beijing的用户数），耗时明显更短
SELECT COUNT(*) FROM users_with_index WHERE city = 'Beijing';
```

### 第三步：观察联合索引的最左前缀原则

```sql
-- 使用联合索引的全部列
-- 执行预期：key=idx_city_age, key_len较大
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing' AND age > 25;

-- 只使用联合索引的第一列
-- 执行预期：key=idx_city_age, key_len较小
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing';

-- 跳过第一列，无法使用联合索引
-- 执行预期：key=idx_age（使用单列索引）或 type=ALL
EXPLAIN SELECT * FROM users_with_index WHERE age > 25;
```

### 第四步：观察覆盖索引的效果

```sql
-- 覆盖索引：查询列都在索引中
-- 执行预期：Extra=Using index
EXPLAIN SELECT city, age FROM users_with_index WHERE city = 'Beijing';

-- 非覆盖索引：需要回表
-- 执行预期：Extra=Using where
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing';
```

### 第五步：测试索引失效场景

```sql
-- 函数操作导致索引失效
EXPLAIN SELECT * FROM users_with_index WHERE YEAR(created_at) = 2024;

-- 隐式类型转换导致索引失效
EXPLAIN SELECT * FROM users_with_index WHERE city = 123;

-- OR条件导致索引失效
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing' OR age = 30;
```

---

## ⚠️ 常见误区

### 误区1：索引越多越好

很多开发人员以为"每个查询字段都建一个索引"就能解决所有性能问题。但实际上，每个索引都会增加写入成本——每次INSERT、UPDATE、DELETE时，所有索引都需要更新。如果你有10个索引，每次写入就要更新10个索引结构。

**正确做法**：只为高频查询建索引，定期用`sys.schema_unused_indexes`找出从未使用的索引并删除。

### 误区2：联合索引顺序无所谓

`(city, age)`和`(age, city)`是完全不同的索引。前者可以用于`WHERE city = 'Beijing'`，后者不能。前者可以用于`WHERE city = 'Beijing' AND age > 25`，后者用于这个查询效率较低。

**正确做法**：把等值查询的列放在前面，范围查询的列放在后面。把选择性高的列放在前面。

### 误区3：COUNT(*)不能用索引

实际上，`SELECT COUNT(*) FROM users WHERE city = 'Beijing'`可以使用`city`索引。因为二级索引比聚簇索引小，扫描二级索引比扫描全表更快。MySQL优化器会自动选择最小的索引来执行COUNT(*)。

---

## 💭 思考题

1. 为什么`SELECT * FROM users WHERE age > 25 ORDER BY city`无法使用`(city, age)`联合索引来避免filesort？
2. 如果有一个查询`WHERE a = 1 AND b > 10 AND c = 5`，联合索引`(a, b, c)`和`(a, c, b)`哪个更好？为什么？
3. 覆盖索引能避免回表，但为什么不是所有查询都使用覆盖索引？覆盖索引有什么代价？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-index mysql -uroot -proot123 optimization_db
docker compose down -v
```
