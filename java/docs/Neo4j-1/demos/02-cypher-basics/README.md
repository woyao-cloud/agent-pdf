# 第2章：Cypher查询语言基础

> 如果你会 SQL，学 Cypher 会非常快——它们有很多相似之处。但 Cypher 在处理关系数据时，比 SQL 直观得多。如果把 SQL 比作"在表格中查找数据"，Cypher 就是"在图中画路径"。

---

## 📖 本章导读

### 一个真实的故事

小张是后端开发，刚接触 Neo4j。产品经理让他做一个"电影演员关系图"的功能——用户点击一个演员，就能看到这个演员演过哪些电影，以及这些电影的其他演员。

在 MySQL 中，小张需要设计 3 张表（`actors`、`movies`、`actor_movie`），然后写一个 3 表 JOIN：

```sql
SELECT a.name, m.title, a2.name AS co_actor
FROM actors a
JOIN actor_movie am ON a.id = am.actor_id
JOIN movies m ON am.movie_id = m.id
JOIN actor_movie am2 ON m.id = am2.movie_id
JOIN actors a2 ON am2.actor_id = a2.id
WHERE a.name = 'Keanu Reeves' AND a2.name != 'Keanu Reeves';
```

这个查询虽然能工作，但 SQL 语句已经变得难以阅读和维护了。如果需求变成"查询导演和演员之间的合作网络"，SQL 会变得极其复杂。

在 Neo4j 中，同样的查询只需要：

```cypher
MATCH (a:Actor {name: "Keanu Reeves"})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(co:Actor)
RETURN m.title, co.name
```

**这就是 Cypher 的魅力——用画图的方式写查询，直观、简洁、易读。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **用 Cypher 完成 80% 的日常操作** — 创建、查询、更新、删除数据
2. **理解 Cypher 和 SQL 的对应关系** — 把已有的 SQL 知识迁移过来
3. **写出正确的模式匹配查询** — 这是 Cypher 最核心、最强大的能力
4. **使用 MERGE 避免重复数据** — 幂等操作的最佳实践

---

## 🧠 核心概念详解

### Cypher 是什么？

Cypher 是 Neo4j 的查询语言，就像 SQL 是 MySQL 的查询语言。它的设计理念是**让查询看起来像你在图上画路径**。

**💡 类比**：SQL 是"告诉我你要什么数据"，Cypher 是"告诉我你要什么模式"。

### SQL vs Cypher 对照表

如果你熟悉 SQL，下面的对照表能帮你快速上手：

| 操作 | SQL | Cypher |
|------|-----|--------|
| 创建数据 | `INSERT INTO users VALUES (...) ` | `CREATE (:User {name: "张三"})` |
| 查询所有 | `SELECT * FROM users` | `MATCH (u:User) RETURN u` |
| 条件过滤 | `WHERE age > 30` | `WHERE u.age > 30` |
| 排序 | `ORDER BY age DESC` | `ORDER BY u.age DESC` |
| 分页 | `LIMIT 10 OFFSET 20` | `LIMIT 10 SKIP 20` |
| 聚合 | `COUNT(*) GROUP BY city` | `count(u) ORDER BY u.city` |
| 关联查询 | `JOIN ... ON ...` | `(a)-[:RELATION]->(b)` |

### Cypher 的核心语法

Cypher 的语法可以概括为几个"动词"：

| 动词 | 用途 | 类比 SQL |
|------|------|---------|
| `CREATE` | 创建节点和关系 | `INSERT` |
| `MATCH` | 匹配模式（查询） | `SELECT ... FROM ... JOIN` |
| `RETURN` | 返回结果 | `SELECT` |
| `WHERE` | 条件过滤 | `WHERE` |
| `SET` | 更新属性 | `UPDATE SET` |
| `DELETE` | 删除节点/关系 | `DELETE` |
| `REMOVE` | 删除属性 | `UPDATE SET ... = NULL` |
| `MERGE` | 存在则匹配，不存在则创建 | `INSERT ... ON DUPLICATE KEY UPDATE` |

### 模式匹配语法详解

Cypher 最核心的概念是**模式匹配**——你用 ASCII 艺术画出一个图模式，Cypher 在数据库中找匹配的数据。

```
(节点:标签 {属性: 值}) -[:关系类型 {属性: 值}]-> (节点:标签 {属性: 值})
```

**分解来看**：

```
(  a  : Actor  {name: "Keanu Reeves"} )
 ↑    ↑         ↑
括号  变量名    标签        属性
```

```
-[ :ACTED_IN  {role: "Neo"} ]->
  ↑             ↑
  关系类型      关系属性
```

**完整示例**：
```cypher
MATCH (a:Actor {name: "Keanu Reeves"})-[r:ACTED_IN {role: "Neo"}]->(m:Movie)
RETURN a.name, r.role, m.title
```

这个查询的意思是："找到名为 Keanu Reeves 的演员节点，通过 ACTED_IN 关系（角色为 Neo）连接到电影节点，返回演员名、角色和电影名。"

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/02-cypher-basics
docker compose up -d
docker exec -it neo4j-cypher-basics cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：基础查询练习

打开 http://localhost:7475，在编辑器中逐个执行以下查询。

#### 练习1：查询所有电影

```cypher
MATCH (m:Movie)
RETURN m.title, m.year, m.rating
ORDER BY m.year DESC
```

**预期结果**：
```
╔══════════════════╤══════╤════════╗
║ m.title         │ m.year │ m.rating ║
╠══════════════════╪══════╪════════╣
║ "Interstellar"  │ 2014  │ 8.6    ║
║ "Inception"     │ 2010  │ 8.8    ║
║ "The Dark Knight"│ 2008  │ 9.0    ║
║ "The Matrix"    │ 1999  │ 8.7    ║
╚══════════════════╧══════╧════════╝
```

**🔍 解读**：`MATCH (m:Movie)` 找到所有 Movie 标签的节点，`RETURN` 指定要返回的属性，`ORDER BY m.year DESC` 按年份降序排列。

#### 练习2：查询演员及其角色

```cypher
MATCH (a:Actor)-[r:ACTED_IN]->(m:Movie)
RETURN a.name, r.role, m.title
```

**预期结果**：
```
╔══════════════════════╤══════════╤══════════════════╗
║ a.name              │ r.role   │ m.title          ║
╠══════════════════════╪══════════╪══════════════════╣
║ "Keanu Reeves"      │ "Neo"    │ "The Matrix"     ║
║ "Leonardo DiCaprio" │ "Dom Cobb"│ "Inception"      ║
║ "Matthew McConaughey"│ "Cooper" │ "Interstellar"   ║
║ "Christian Bale"    │ "Batman" │ "The Dark Knight" ║
╚══════════════════════╧══════════╧══════════════════╝
```

**🔍 解读**：`(a:Actor)-[r:ACTED_IN]->(m:Movie)` 是一个模式——找到演员通过 ACTED_IN 关系连接到的电影。`r.role` 访问关系的属性。

#### 练习3：条件过滤

```cypher
-- 查询 2010 年之后的电影
MATCH (m:Movie)
WHERE m.year >= 2010
RETURN m.title, m.year
```

**预期结果**：Inception（2010）、Interstellar（2014）

```cypher
-- 查询评分高于 8.7 的电影
MATCH (m:Movie)
WHERE m.rating > 8.7
RETURN m.title, m.rating
ORDER BY m.rating DESC
```

**预期结果**：The Dark Knight（9.0）、Inception（8.8）

#### 练习4：聚合查询

```cypher
-- 统计每位导演的电影数量
MATCH (d:Director)-[:DIRECTED]->(m:Movie)
RETURN d.name AS director, count(m) AS movie_count
ORDER BY movie_count DESC
```

**预期结果**：
```
╔═══════════════════╤═════════════╗
║ director         │ movie_count ║
╠═══════════════════╪═════════════╣
║ "Christopher Nolan"│ 3          ║
║ "Lana Wachowski" │ 1          ║
╚═══════════════════╧═════════════╝
```

**🔍 解读**：`count(m)` 是聚合函数，统计每个导演匹配到的电影数量。`AS` 给返回的列起别名。

#### 练习5：MERGE 幂等操作

```cypher
-- 第一次执行：创建节点
MERGE (p:Person {name: "Tom Hanks"})
ON CREATE SET p.born = 1956
RETURN p

-- 第二次执行：匹配已有节点，不会重复创建
MERGE (p:Person {name: "Tom Hanks"})
ON CREATE SET p.born = 1956
ON MATCH SET p.lastSeen = datetime()
RETURN p
```

**🔍 解读**：`MERGE` 先尝试匹配，匹配不到才创建。`ON CREATE` 在创建时执行，`ON MATCH` 在匹配到时执行。这是避免重复数据的标准做法。

### 第三步：综合查询

```cypher
-- 查询 Christopher Nolan 导演的所有电影及演员
MATCH (d:Director {name: "Christopher Nolan"})-[:DIRECTED]->(m:Movie)<-[:ACTED_IN]-(a:Actor)
RETURN m.title, collect(a.name) AS actors
```

**预期结果**：
```
╔══════════════════╤══════════════════════════════════════════╗
║ m.title         │ actors                                  ║
╠══════════════════╪══════════════════════════════════════════╣
║ "Inception"     │ ["Leonardo DiCaprio"]                  ║
║ "Interstellar"  │ ["Matthew McConaughey"]                ║
║ "The Dark Knight"│ ["Christian Bale"]                     ║
╚══════════════════╧══════════════════════════════════════════╝
```

**🔍 解读**：`collect(a.name)` 将演员名收集为一个列表。这个查询展示了 Cypher 最强大的能力——在一个查询中遍历多层关系。

---

## ⚠️ 常见误区

### 误区1：忘记在 DELETE 前先删除关系

**错误做法**：
```cypher
MATCH (m:Movie {title: "The Dark Knight"})
DELETE m  -- ❌ 会报错：节点还有关系
```

**正确做法**：
```cypher
MATCH (m:Movie {title: "The Dark Knight"})
DETACH DELETE m  -- ✅ 先删除所有关系，再删除节点
```

### 误区2：混淆 CREATE 和 MERGE

**错误做法**：
```cypher
-- 每次执行都会创建重复节点
CREATE (p:Person {name: "Tom Hanks"})
```

**正确做法**：
```cypher
-- 幂等操作，不会重复创建
MERGE (p:Person {name: "Tom Hanks"})
ON CREATE SET p.born = 1956
```

### 误区3：忘记关系方向

**错误做法**：
```cypher
MATCH (a:Actor)-[:ACTED_IN]-(m:Movie)  -- ❌ 无方向，可能匹配到错误的关系
```

**正确做法**：
```cypher
MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)  -- ✅ 明确方向：演员→电影
```

### 误区4：在 WHERE 中使用 = 比较 NULL

**错误做法**：
```cypher
MATCH (m:Movie)
WHERE m.rating = NULL  -- ❌ 不会返回任何结果
```

**正确做法**：
```cypher
MATCH (m:Movie)
WHERE m.rating IS NULL  -- ✅ 正确的 NULL 判断
```

---

## 💭 思考题

1. 如果要查询"评分高于 8.5 且 2010 年之后的电影"，WHERE 条件应该怎么写？
2. `MATCH (a)-[:ACTED_IN]->(m)<-[:DIRECTED]-(d)` 这个模式匹配了什么？和 `MATCH (a)-[:ACTED_IN]->(m), (d)-[:DIRECTED]->(m)` 有什么区别？
3. 如果要统计每个演员出演的电影数量，Cypher 应该怎么写？提示：使用 `count()` 和 `GROUP BY`。

---

## 📚 扩展阅读

- [Cypher 官方参考手册](https://neo4j.com/docs/cypher-manual/current/) — 完整的语法参考
- [Cypher 查询计划](https://neo4j.com/docs/cypher-manual/current/execution-plans/) — 理解查询如何执行
- [SQL to Cypher 转换指南](https://neo4j.com/developer/cypher/sql-to-cypher/) — 如果你熟悉 SQL，这个很有用

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 初始化数据
docker exec -it neo4j-cypher-basics cypher-shell -u neo4j -p password123 -f /init.cypher

# 打开交互式 Shell
docker exec -it neo4j-cypher-basics cypher-shell -u neo4j -p password123

# 停止并清理
docker compose down -v
```
