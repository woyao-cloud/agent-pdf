# 第7章：排序与分组优化

> ORDER BY和GROUP BY是SQL中最耗资源的操作之一。当数据量很大时，排序和分组可能触发"Using filesort"和"Using temporary"，导致查询极慢。这章教你如何利用索引避免排序、优化分组查询。

---

## 📖 本章导读

### 一个真实的故事

小吴负责一个日志分析系统，日志表有1000万条数据。运营经理想看"每个类别的操作次数"：

```sql
SELECT category, COUNT(*) AS cnt FROM logs GROUP BY category ORDER BY cnt DESC;
```

这个查询需要10秒。EXPLAIN显示`Using temporary; Using filesort`——MySQL需要创建临时表来分组，然后再对分组结果排序。

小吴在`category`上建了索引，分组不再需要临时表。但排序仍然需要filesort，因为`ORDER BY cnt`（聚合结果）无法使用索引。他改为在应用层排序，查询降到了0.5秒。

**排序分组优化的核心：让索引帮你排序和分组，避免filesort和temporary。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **利用索引排序** — 避免Using filesort。索引本身就是有序的，如果ORDER BY的列有索引，MySQL可以直接按索引顺序返回。
2. **利用索引分组** — 避免Using temporary。如果GROUP BY的列有索引，MySQL可以利用索引的有序性来分组。
3. **理解filesort的内部机制** — 单路排序 vs 双路排序，sort_buffer_size如何影响性能。

---

## 🧠 核心概念详解

### 排序优化

当MySQL需要对结果排序时，有两种方式：

**方式1：利用索引排序（最优）。** 如果ORDER BY的列有索引，MySQL可以直接按索引顺序读取数据，不需要额外排序。EXPLAIN的Extra中不会出现"Using filesort"。

**方式2：filesort（需要优化）。** 如果ORDER BY的列没有索引，MySQL需要将结果加载到sort_buffer中排序。如果结果集太大，sort_buffer放不下，MySQL会使用磁盘临时文件——这就是"filesort"名字的由来。

**💡 类比**：索引排序就像书已经按章节排好了，你直接按顺序读就行。filesort就像把书的所有页拆下来，重新按你想要的顺序排列——费时费力。

### 分组优化

GROUP BY的优化和ORDER BY类似。如果GROUP BY的列有索引，MySQL可以利用索引的有序性来分组——相同的值在索引中是连续的，MySQL只需要在值变化时开始新的分组。

如果GROUP BY的列没有索引，MySQL需要创建临时表来分组。临时表可能在内存中（tmp_table_size限制），也可能在磁盘上——磁盘临时表非常慢。

### 排序分组优化策略

| 场景 | 是否filesort/temporary | 优化方法 |
|------|----------------------|---------|
| `ORDER BY 索引列` | ❌ 无 | 索引本身有序 |
| `ORDER BY 非索引列` | ✅ filesort | 建索引或减少排序数据量 |
| `WHERE a=1 ORDER BY b` | 取决于索引 | 建(a,b)联合索引 |
| `GROUP BY 索引列` | ❌ 无 | 利用索引有序性 |
| `GROUP BY a ORDER BY b` | ✅ temporary+filesort | 建(a,b)联合索引 |

---

## 🛠️ 动手实践

```bash
cd demos/07-sort-group-optimization
docker compose up -d
docker exec -it mysql-sort mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行：

```sql
-- 利用索引排序（无filesort）
-- 执行预期：Extra中无Using filesort
EXPLAIN SELECT * FROM logs ORDER BY created_at DESC LIMIT 10;

-- 无法利用索引排序（有filesort）
-- 执行预期：Extra=Using filesort
EXPLAIN SELECT * FROM logs WHERE category = 'auth' ORDER BY user_id;

-- 利用联合索引避免filesort
-- 执行预期：使用idx_category_created，无filesort
EXPLAIN SELECT * FROM logs WHERE category = 'auth' ORDER BY created_at DESC;

-- 利用索引分组（无temporary）
-- 执行预期：使用idx_category，无Using temporary
EXPLAIN SELECT category, COUNT(*) FROM logs GROUP BY category;

-- GROUP BY + ORDER BY不同列（有temporary+filesort）
-- 执行预期：Using temporary; Using filesort
EXPLAIN SELECT category, COUNT(*) AS cnt FROM logs GROUP BY category ORDER BY cnt DESC;
```

---

## ⚠️ 常见误区

### 误区1：sort_buffer_size越大越好

sort_buffer_size是每个需要排序的会话分配的。如果设为256MB，10个并发排序就会占用2.5GB内存。对于大多数查询，256KB-512KB就足够了。

### 误区2：所有filesort都需要优化

如果排序的结果集很小（比如几十行），filesort的开销可以忽略。只有当排序的结果集很大（几万行以上）时，filesort才成为性能瓶颈。

---

## 💭 思考题

1. 为什么`WHERE a=1 ORDER BY b`可以用`(a,b)`联合索引避免filesort？
2. `GROUP BY a ORDER BY COUNT(*)`为什么一定会产生temporary+filesort？
3. 单路排序和双路排序有什么区别？MySQL如何选择？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-sort mysql -uroot -proot123 optimization_db
docker compose down -v
```
