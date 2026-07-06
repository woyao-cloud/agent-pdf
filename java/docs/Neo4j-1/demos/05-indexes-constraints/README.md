# 第5章：索引与约束

> 没有索引的数据库就像没有目录的书——你能找到内容，但很慢。当数据量从几百条增长到几百万条时，没有索引的查询会从"秒级"变成"分钟级"。

---

## 📖 本章导读

### 一个真实的故事

小周负责一个用户管理系统，用户量从最初的 1000 人增长到了 10 万人。一天，运营人员抱怨："查询用户详情页面要等 5 秒钟！"

小周检查了查询：

```cypher
MATCH (u:User {userId: "U500"}) RETURN u
```

用 `PROFILE` 分析后发现，这个查询做了**全表扫描**——Neo4j 遍历了所有 10 万个用户节点来找到 userId 为 "U500" 的那个。

```
计划: NodeByLabelScan → Filter
DB Hits: 100,001 次  ← 遍历了所有节点！
```

解决方案很简单——在 userId 上创建一个唯一性约束（约束会自动创建索引）：

```cypher
CREATE CONSTRAINT FOR (u:User) REQUIRE u.userId IS UNIQUE;
```

再次执行查询，DB Hits 从 100,001 降到了 **2 次**——一次索引查找，一次返回结果。查询时间从 5 秒降到了 5 毫秒。

**这就是索引的威力——1000 倍的性能提升，只需要一行代码。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **理解不同索引类型的适用场景** — 知道什么时候该用 B-tree、文本索引、范围索引
2. **使用约束保证数据质量** — 防止重复数据、空值
3. **读懂执行计划** — 用 `EXPLAIN` 和 `PROFILE` 诊断查询性能
4. **避免常见的索引陷阱** — 知道为什么有些查询没有命中索引

---

## 🧠 核心概念详解

### 索引是什么？

**💡 类比**：索引就像书的目录。没有目录时，你要一页一页翻（全表扫描）。有目录时，你直接翻到对应页码（索引查找）。

在 Neo4j 中，索引的作用是**避免全表扫描**。当你在查询中使用了索引字段，Neo4j 会直接定位到匹配的节点，而不是遍历所有节点。

### 索引类型

| 索引类型 | 语法 | 适用场景 | 类比 |
|---------|------|---------|------|
| **B-tree 索引** | `CREATE INDEX ... ON (...)` | 精确匹配、范围查询 | 书的目录 |
| **文本索引** | `CREATE TEXT INDEX ... ON (...)` | 文本搜索（CONTAINS、STARTS WITH） | 全文搜索引擎 |
| **范围索引** | `CREATE RANGE INDEX ... ON (...)` | 数值/日期范围查询 | 数字索引 |
| **点索引** | `CREATE POINT INDEX ... ON (...)` | 地理空间查询 | 地图坐标索引 |
| **全文索引** | `CREATE FULLTEXT INDEX ... ON EACH [...]` | 全文搜索（Lucene） | Google 搜索 |

### 约束类型

约束不仅保证数据质量，还会**自动创建对应的索引**。

| 约束类型 | 语法 | 作用 | 自动创建索引 |
|---------|------|------|------------|
| **唯一约束** | `REQUIRE ... IS UNIQUE` | 防止重复值 | ✅ B-tree 索引 |
| **存在约束** | `REQUIRE ... IS NOT NULL` | 防止空值 | ❌ 不创建索引 |
| **节点键约束** | `REQUIRE (...) IS NODE KEY` | 复合唯一键 | ✅ 复合索引 |

### 执行计划解读

`EXPLAIN` 和 `PROFILE` 是诊断查询性能的两个工具：

| 工具 | 作用 | 用法 |
|------|------|------|
| `EXPLAIN` | 显示执行计划（不实际执行） | `EXPLAIN MATCH ...` |
| `PROFILE` | 执行并显示实际成本 | `PROFILE MATCH ...` |

**关键指标**：
- **DB Hits**：数据库访问次数，越低越好
- **Rows**：处理的行数
- **Estimated Rows**：预估行数

**好的执行计划**：看到 `NodeIndexSeek` 或 `NodeUniqueIndexSeek`
**差的执行计划**：看到 `NodeByLabelScan`（全表扫描）

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/05-indexes-constraints
docker compose up -d
docker exec -it neo4j-indexes cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：查看索引和约束

打开 http://localhost:7478，执行：

```cypher
-- 查看所有约束
SHOW CONSTRAINTS;

-- 查看所有索引
SHOW INDEXES;
```

**预期结果**：你会看到 4 个约束和 4 个索引，包括唯一约束、存在约束、节点键约束、B-tree 索引、文本索引、范围索引。

### 第三步：对比有索引和无索引的查询

```cypher
-- 有索引的查询（userId 有唯一约束）
EXPLAIN MATCH (u:User {userId: "U500"}) RETURN u.name, u.email
```

**预期结果**：执行计划显示 `NodeUniqueIndexSeek`，DB Hits 约 2 次。

```cypher
-- 无索引的查询（score 字段没有索引）
EXPLAIN MATCH (u:User) WHERE u.score > 50 RETURN count(u)
```

**预期结果**：执行计划显示 `NodeByLabelScan` → `Filter`，DB Hits 约 1000 次（全表扫描）。

### 第四步：验证约束

```cypher
-- 尝试插入重复 userId（会失败）
CREATE (u:User {userId: "U500", name: "Duplicate", email: "dup@email.com"});
```

**预期结果**：报错 `Node(0) already exists with label User and property userId = 'U500'`

```cypher
-- 尝试插入空 name（会失败）
CREATE (u:User {userId: "U9999", email: "test@email.com"});
```

**预期结果**：报错 `Property existence constraint on User.name requires a value`

---

## ⚠️ 常见误区

### 误区1：认为索引越多越好

**问题**：每个索引都会增加写入成本（创建/更新节点时需要更新索引）。索引太多会拖慢写入性能。

**正确做法**：只为**查询频繁**的字段创建索引。用 `EXPLAIN` 验证查询是否命中索引，没命中的索引就是浪费。

### 误区2：认为 CONTAINS 会使用 B-tree 索引

```cypher
-- B-tree 索引不支持 CONTAINS
MATCH (u:User) WHERE u.name CONTAINS "50" RETURN u  -- ❌ 不会使用 B-tree 索引
```

**正确做法**：使用文本索引（TEXT INDEX）或全文索引（FULLTEXT INDEX）。

### 误区3：忘记约束会自动创建索引

```cypher
-- 创建唯一约束
CREATE CONSTRAINT FOR (u:User) REQUIRE u.userId IS UNIQUE;
-- 约束会自动创建索引，不需要再手动创建
```

---

## 💭 思考题

1. 如果一个查询同时使用了两个字段（如 `WHERE u.city = "Beijing" AND u.age > 30`），应该创建什么索引？
2. 全文索引和文本索引有什么区别？分别在什么场景下使用？
3. 为什么存在约束（`IS NOT NULL`）不会自动创建索引？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it neo4j-indexes cypher-shell -u neo4j -p password123 -f /init.cypher
docker compose down -v
```
