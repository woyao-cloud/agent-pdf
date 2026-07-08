# 第8章：分页优化

> "深分页"是MySQL的经典性能杀手——`LIMIT 100000, 20`需要扫描100020行然后丢弃前100000行。这章教你如何用延迟关联、游标分页、子查询分页等技术解决深分页问题。

---

## 📖 本章导读

### 一个真实的故事

小郑负责一个内容管理系统的后端。文章表有100万条数据，前端需要分页展示。他写了一个简单的分页查询：

```sql
SELECT * FROM articles ORDER BY id LIMIT 100000, 20;
```

用户翻到第5000页时，查询需要10秒。小郑不理解——只是取20条数据，为什么这么慢？

原因在于MySQL的LIMIT实现方式：`LIMIT 100000, 20`的意思是"跳过前100000行，返回接下来的20行"。但MySQL不知道如何"跳过"——它只能从第一行开始，逐行扫描，数到第100000行，然后开始返回。也就是说，为了返回20行，MySQL扫描了100020行。

小郑后来用"延迟关联"优化：先查ID（覆盖索引，只扫描索引不读取完整行），再关联取完整数据。查询从10秒降到了0.5秒。再后来改用"游标分页"，查询降到了0.01秒。

**分页优化的核心：避免扫描大量不需要的行。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解深分页问题** — 为什么大OFFSET很慢。`LIMIT 100000, 20`不是"跳过10万行取20行"，而是"扫描100020行，丢弃前10万行"。
2. **掌握延迟关联** — 先查ID（覆盖索引），再关联取完整数据。子查询只扫描索引，不读取完整行，IO量大幅减少。
3. **使用游标分页** — 用`WHERE id > last_id`替代`OFFSET`。始终只扫描需要的那几行，性能最优。
4. **了解子查询分页** — 用覆盖索引的子查询定位起始位置。

---

## 🧠 核心概念详解

### 为什么深分页很慢？

`LIMIT offset, count`的执行过程是：
1. 从第一行开始扫描
2. 逐行计数，跳过前offset行
3. 返回接下来的count行

这意味着，offset越大，需要扫描和丢弃的行数越多。`LIMIT 100000, 20`需要扫描100020行，但只返回20行——99.98%的扫描都是浪费的。

**💡 类比**：深分页就像翻书。你要看第5000页的内容，但书没有页码——你只能从第1页开始，一页一页翻，翻到第5000页。翻过的4999页都是浪费的。

### 四种分页方案对比

**方案1：原始分页（最差）**

```sql
SELECT * FROM articles ORDER BY id LIMIT 100000, 20;
```

扫描100020行，返回20行。性能随offset线性下降。

**方案2：延迟关联（推荐）**

```sql
SELECT a.* FROM articles a
JOIN (SELECT id FROM articles ORDER BY id LIMIT 100000, 20) t
ON a.id = t.id;
```

子查询`SELECT id FROM articles ORDER BY id LIMIT 100000, 20`只扫描索引（覆盖索引），不读取完整行。扫描100000行索引比扫描100000行数据快得多。然后外层查询通过主键关联，只读取20行完整数据。

**方案3：游标分页（最优，但有限制）**

```sql
SELECT * FROM articles WHERE id > 100000 ORDER BY id LIMIT 20;
```

用上一页最后一条的ID作为起点，始终只扫描20行。性能与offset无关。

**限制**：只能顺序翻页，不能跳页。需要前端配合——记录上一页最后一条的ID。

**方案4：子查询分页**

```sql
SELECT * FROM articles WHERE id >= (
    SELECT id FROM articles ORDER BY id LIMIT 100000, 1
) ORDER BY id LIMIT 20;
```

用子查询定位起始ID，然后从该ID开始取20行。效果类似延迟关联。

| 方案 | 扫描行数 | 性能 | 能否跳页 |
|------|---------|------|---------|
| 原始分页 | 100020 | 慢 | ✅ |
| 延迟关联 | 100000(索引)+20 | 快10x | ✅ |
| 游标分页 | 20 | 快100x | ❌ |
| 子查询分页 | 100000(索引)+20 | 快10x | ✅ |

---

## 🛠️ 动手实践

```bash
cd demos/08-pagination-optimization
docker compose up -d
# 等待数据生成（10万条，约30秒）
docker exec -it mysql-pagination mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行：

```sql
-- 方案1：原始分页（最慢）
-- 执行预期：rows=100020
EXPLAIN SELECT * FROM articles ORDER BY id LIMIT 99980, 20;

-- 方案2：延迟关联（快10倍）
-- 执行预期：子查询rows=100000（只扫描索引），外层rows=20
EXPLAIN SELECT a.* FROM articles a
JOIN (SELECT id FROM articles ORDER BY id LIMIT 99980, 20) t
ON a.id = t.id;

-- 方案3：游标分页（最快）
-- 执行预期：rows=20
EXPLAIN SELECT * FROM articles WHERE id > 99980 ORDER BY id LIMIT 20;

-- 方案4：子查询分页
EXPLAIN SELECT * FROM articles WHERE id >= (
    SELECT id FROM articles ORDER BY id LIMIT 99980, 1
) ORDER BY id LIMIT 20;
```

---

## ⚠️ 常见误区

### 误区1：游标分页适用于所有场景

游标分页要求ID连续且递增。如果ID不连续（比如有删除），`WHERE id > last_id LIMIT 20`可能返回少于20条。而且游标分页不能跳页——用户不能直接跳到第5000页。

### 误区2：延迟关联的ORDER BY必须和分页一致

延迟关联的子查询中，ORDER BY的列必须有索引，否则子查询本身就需要filesort。而且子查询的ORDER BY必须和外层查询一致。

### 误区3：忘记COUNT的优化

分页通常需要先COUNT总数。`SELECT COUNT(*) FROM articles`在InnoDB中需要全表扫描。如果不需要精确总数，可以用`EXPLAIN SELECT ...`的rows估算值，或者用Redis维护一个计数器。

---

## 💭 思考题

1. 游标分页不能跳页，但产品经理要求"可以跳到第5000页"。你会怎么设计？
2. 如果分页的ORDER BY列不是主键（比如按创建时间排序），延迟关联还能用吗？
3. 为什么`SELECT COUNT(*)`在InnoDB中很慢？有什么优化方案？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-pagination mysql -uroot -proot123 optimization_db
docker compose down -v
```
