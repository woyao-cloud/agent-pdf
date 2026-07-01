# 第2章 Neo4j 数据模型与 Cypher 查询语言

## 2.1 属性图模型

Neo4j 的核心数据模型是**属性图（Property Graph）**。与关系型数据库的表-行-列模型不同，属性图将数据表示为**节点（Node）**、**关系（Relationship）**、**属性（Property）**和**标签（Label）**四个基本要素。这种模型天然适合表达高度关联的数据，如社交网络、推荐系统、知识图谱和基础设施拓扑。

### 2.1.1 节点（Node）

节点是图中的实体，相当于关系型数据库中的"行"或面向对象中的"对象实例"。每个节点可以拥有零个或多个标签，以及零个或多个键值对属性。

```
(:Person {name: "张三", age: 30, city: "北京"})
```

上述表示一个带有 `Person` 标签的节点，包含三个属性。

### 2.1.2 关系（Relationship）

关系是图中连接两个节点的有向边，是属性图模型中最强大的概念。关系必须：
- 有**方向**（从源节点指向目标节点）
- 有**类型**（Type），如 `KNOWS`、`WORKS_AT`
- 可以有**属性**（与节点一样，关系也可以携带属性）

```
(:Person {name: "张三"})-[:KNOWS {since: 2020}]->(:Person {name: "李四"})
```

关系总是有向的，但查询时可以忽略方向进行双向匹配。

### 2.1.3 属性（Property）

属性和键值对，键是字符串，值可以是以下类型：

| 类型 | 示例 |
|------|------|
| 数值 | `42`, `3.14` |
| 字符串 | `"Hello"` |
| 布尔 | `true`, `false` |
| 字节数组 | `byte[4]` |
| 日期时间 | `datetime("2024-01-01")` |
| 列表 | `[1, 2, 3]` |
| 映射 | `{key: "value"}` |

### 2.1.4 标签（Label）

标签用于对节点进行分类和分组。一个节点可以有多个标签，标签没有属性。

```
(:Person:Employee:Manager)
```

上述节点同时拥有三个标签，表示它既是一个人、一名员工，也是一位经理。标签在查询中充当"表名"的角色，是 Cypher 模式匹配的入口。

### 2.1.5 属性图 vs 关系型模型

| 维度 | 属性图 (Neo4j) | 关系型 (MySQL/PostgreSQL) |
|------|----------------|--------------------------|
| 数据单元 | 节点、关系 | 表、行 |
| 关联方式 | 指针式关系（直接连接） | 外键 + JOIN |
| 模式 | 灵活（Schema-less） | 固定（Schema） |
| 深度查询 | 高效（常数时间遍历） | 昂贵（递归 JOIN） |
| 扩展方向 | 关联扩展 | 数据量扩展 |

## 2.2 Cypher 查询语言概述

Cypher 是 Neo4j 的声明式图查询语言，其设计灵感来源于 SQL，但针对图结构做了专门优化。Cypher 的核心思想是**模式匹配（Pattern Matching）**——你描述你想找的图结构，数据库负责找到它。

Cypher 的语法使用 ASCII 艺术风格来表示图结构：
- `()` 表示节点
- `[]` 表示关系
- `-->` 表示有向边
- `--` 表示无向边

### 2.2.1 基本语法元素

```cypher
// 节点模式
(n)                    // 匿名节点
(p:Person)             // 带标签的节点
(p:Person:Employee)    // 多标签节点
(p:Person {name: "张三"})  // 带属性和标签的节点

// 关系模式
-[r:KNOWS]->          // 有向关系
-[r:KNOWS*1..3]->     // 变长路径（1到3跳）
-[r]->                 // 匿名关系类型
--                     // 无向连接（忽略方向）

// 完整路径模式
(p:Person)-[r:KNOWS]->(q:Person)
```

## 2.3 数据定义与操作

### 2.3.1 CREATE — 创建数据

`CREATE` 语句用于创建节点和关系。

**创建单个节点：**

```cypher
CREATE (n:Person {name: "张三", age: 30, city: "北京"})
```

**创建多个节点和关系：**

```cypher
CREATE
  (a:Person {name: "张三", age: 30}),
  (b:Person {name: "李四", age: 25}),
  (c:Person {name: "王五", age: 35}),
  (a)-[:KNOWS {since: 2020}]->(b),
  (a)-[:KNOWS {since: 2021}]->(c),
  (b)-[:FRIENDS_WITH {since: 2019}]->(c)
```

**创建带复杂属性的节点：**

```cypher
CREATE (m:Movie {
  title: "流浪地球",
  year: 2019,
  genres: ["科幻", "冒险"],
  rating: 8.5,
  releaseDate: date("2019-02-05")
})
```

### 2.3.2 MATCH — 查询数据

`MATCH` 是 Cypher 中最核心的查询子句，用于匹配图模式。

**查询所有节点：**

```cypher
MATCH (n) RETURN n
```

**按标签查询：**

```cypher
MATCH (p:Person) RETURN p
```

**按属性查询：**

```cypher
MATCH (p:Person {name: "张三"}) RETURN p
```

**使用 WHERE 子句进行复杂过滤：**

```cypher
MATCH (p:Person)
WHERE p.age > 25 AND p.city = "北京"
RETURN p.name, p.age
```

### 2.3.3 RETURN — 返回结果

`RETURN` 指定查询返回的内容，可以返回节点、关系、属性或计算结果。

```cypher
// 返回节点和关系
MATCH (a:Person)-[r:KNOWS]->(b:Person)
RETURN a, r, b

// 返回特定属性
MATCH (a:Person)-[:KNOWS]->(b:Person)
RETURN a.name AS 姓名, b.name AS 朋友姓名

// 返回计算结果
MATCH (p:Person)
RETURN count(p) AS 总人数, avg(p.age) AS 平均年龄

// DISTINCT 去重
MATCH (p:Person)-[:KNOWS]->(friend:Person)
RETURN DISTINCT p.name
```

### 2.3.4 WHERE — 过滤条件

`WHERE` 子句支持丰富的条件表达式。

**比较运算符：**

```cypher
MATCH (p:Person)
WHERE p.age >= 18
  AND p.age <= 60
  AND p.city <> "上海"
RETURN p.name
```

**字符串匹配：**

```cypher
MATCH (p:Person)
WHERE p.name STARTS WITH "张"
  AND p.name CONTAINS "三"
  AND p.name ENDS WITH "三"
RETURN p
```

**列表和 IN 操作：**

```cypher
MATCH (p:Person)
WHERE p.city IN ["北京", "上海", "深圳"]
  AND p.age IN range(20, 40)
RETURN p
```

**存在性检查：**

```cypher
MATCH (p:Person)
WHERE p.email IS NOT NULL
RETURN p
```

**模式匹配作为过滤条件：**

```cypher
// 找到有朋友的人
MATCH (p:Person)
WHERE (p)-[:KNOWS]->(:Person)
RETURN p

// 找到没有朋友的人（NOT EXISTS 模式）
MATCH (p:Person)
WHERE NOT (p)-[:KNOWS]->(:Person)
RETURN p
```

### 2.3.5 DELETE — 删除数据

```cypher
// 删除节点（必须先删除其所有关系）
MATCH (p:Person {name: "张三"})
DETACH DELETE p

// 删除所有节点和关系（清空数据库）
MATCH (n) DETACH DELETE n

// 只删除关系
MATCH (a:Person {name: "张三"})-[r:KNOWS]->()
DELETE r

// 删除特定属性
MATCH (p:Person {name: "张三"})
REMOVE p.age
```

### 2.3.6 SET — 更新属性

```cypher
// 设置单个属性
MATCH (p:Person {name: "张三"})
SET p.age = 31

// 设置多个属性
MATCH (p:Person {name: "张三"})
SET p = {age: 31, city: "上海", email: "zhangsan@example.com"}

// 合并属性（保留已有属性）
MATCH (p:Person {name: "张三"})
SET p += {age: 31, title: "工程师"}

// 添加标签
MATCH (p:Person {name: "张三"})
SET p:Employee:Manager
```

### 2.3.7 MERGE — 创建或匹配

`MERGE` 是 Cypher 中最强大的幂等操作：如果模式存在则匹配，不存在则创建。它解决了"先查后建"的常见需求。

**基本用法：**

```cypher
// 如果存在则匹配，不存在则创建
MERGE (p:Person {name: "张三"})
ON CREATE SET p.createdAt = datetime()
ON MATCH SET p.updatedAt = datetime()
RETURN p
```

**MERGE 关系：**

```cypher
MATCH (a:Person {name: "张三"})
MATCH (b:Person {name: "李四"})
MERGE (a)-[r:KNOWS]->(b)
ON CREATE SET r.since = 2024
RETURN r
```

**MERGE 的注意事项：**

`MERGE` 会尝试匹配整个模式。如果只想匹配节点的一部分属性，需要分步操作：

```cypher
// 正确做法：先 MERGE 节点，再 SET 其他属性
MERGE (p:Person {id: "user-001"})
SET p.name = "张三", p.age = 30
```

```cypher
// 错误做法：MERGE 会尝试匹配所有属性
// 如果 name 或 age 不同，会创建重复节点
MERGE (p:Person {id: "user-001", name: "张三", age: 30})
```

## 2.4 模式匹配与路径查询

### 2.4.1 基础模式匹配

```cypher
// 查找朋友的朋友
MATCH (a:Person {name: "张三"})-[:KNOWS]->(b:Person)-[:KNOWS]->(c:Person)
RETURN c.name
```

### 2.4.2 变长路径查询

变长路径是图数据库的核心优势之一，可以查询任意深度的关系链。

```cypher
// 查询 1 到 3 跳的朋友关系
MATCH (a:Person {name: "张三"})-[r:KNOWS*1..3]->(b:Person)
RETURN b.name, length(r) AS 路径长度
```

**路径变量：**

```cypher
// 将整个路径赋值给变量
MATCH path = (a:Person {name: "张三"})-[:KNOWS*1..3]->(b:Person)
RETURN path, length(path) AS depth
```

**命名路径中的关系：**

```cypher
MATCH (a:Person {name: "张三"})-[r:KNOWS*]->(b:Person)
RETURN b.name, [rel IN r | rel.since] AS 认识年份列表
```

### 2.4.3 最短路径

```cypher
// 查找最短路径
MATCH
  (a:Person {name: "张三"}),
  (b:Person {name: "王五"}),
  path = shortestPath((a)-[:KNOWS*]-(b))
RETURN path
```

```cypher
// 查找所有最短路径
MATCH
  (a:Person {name: "张三"}),
  (b:Person {name: "王五"}),
  path = allShortestPaths((a)-[:KNOWS*]-(b))
RETURN path
```

### 2.4.4 可选匹配

`OPTIONAL MATCH` 类似于 SQL 中的 `LEFT JOIN`，当模式不匹配时返回 `null`。

```cypher
MATCH (p:Person)
OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
RETURN p.name, c.name AS 公司
```

### 2.4.5 多跳模式的高级用法

```cypher
// 查找推荐好友（朋友的朋友，排除直接朋友和自己）
MATCH (me:Person {name: "张三"})-[:KNOWS]->(friend:Person)-[:KNOWS]->(foaf:Person)
WHERE NOT (me)-[:KNOWS]->(foaf)
  AND me <> foaf
RETURN DISTINCT foaf.name AS 推荐好友
```

```cypher
// 查找共同好友
MATCH (a:Person {name: "张三"})-[:KNOWS]->(common:Person)<-[:KNOWS]-(b:Person {name: "李四"})
RETURN common.name AS 共同好友
```

## 2.5 聚合与分组

Cypher 的聚合函数与 SQL 类似，但与 `RETURN` 中的非聚合字段配合时自动产生分组行为。

### 2.5.1 常用聚合函数

```cypher
// 计数
MATCH (p:Person)
RETURN count(p) AS 总人数, count(DISTINCT p.city) AS 城市数

// 求和与平均值
MATCH (p:Person)
RETURN sum(p.age) AS 年龄总和, avg(p.age) AS 平均年龄

// 最大值与最小值
MATCH (p:Person)
RETURN max(p.age) AS 最大年龄, min(p.age) AS 最小年龄

// 收集为列表
MATCH (p:Person)
RETURN p.city, collect(p.name) AS 该城市人员列表

// 列表去重
MATCH (p:Person)
RETURN p.city, collect(DISTINCT p.name) AS 人员列表
```

### 2.5.2 分组聚合

```cypher
// 按城市分组
MATCH (p:Person)
RETURN p.city AS 城市, count(*) AS 人数, avg(p.age) AS 平均年龄
ORDER BY 人数 DESC
```

```cypher
// 按关系类型分组统计
MATCH (p:Person {name: "张三"})-[r]->()
RETURN type(r) AS 关系类型, count(r) AS 数量
```

### 2.5.3 WITH 子句与管道

`WITH` 子句用于将前一段查询的结果传递给下一段，类似于 SQL 的 CTE 或 Unix 管道。

```cypher
// 先聚合，再过滤
MATCH (p:Person)
WITH p.city AS 城市, count(*) AS 人数
WHERE 人数 > 5
RETURN 城市, 人数
ORDER BY 人数 DESC
```

```cypher
// 先找到关键节点，再扩展查询
MATCH (p:Person)
WITH p ORDER BY p.age DESC LIMIT 3
MATCH (p)-[:KNOWS]->(friend:Person)
RETURN p.name, collect(friend.name) AS 朋友们
```

## 2.6 子查询与 CALL

### 2.6.1 CALL 子查询

从 Neo4j 4.1 开始，Cypher 支持使用 `CALL` 执行子查询。子查询可以有自己的 `WITH`、`RETURN` 和作用域。

**独立子查询：**

```cypher
CALL {
  MATCH (p:Person)
  RETURN p
}
RETURN count(p) AS 总人数
```

**带聚合的子查询：**

```cypher
MATCH (city:City)
CALL {
  WITH city
  MATCH (p:Person)-[:LIVES_IN]->(city)
  RETURN count(p) AS population
}
RETURN city.name, population
ORDER BY population DESC
```

**UNION 子查询：**

```cypher
CALL {
  MATCH (p:Person)
  RETURN p.name AS name, "Person" AS type
  UNION
  MATCH (c:Company)
  RETURN c.name AS name, "Company" AS type
}
RETURN name, type
ORDER BY name
```

### 2.6.2 EXISTS 子查询

```cypher
MATCH (p:Person)
WHERE EXISTS {
  MATCH (p)-[:KNOWS]->(:Person)
  WHERE p.age > 30
}
RETURN p.name
```

### 2.6.3 COUNT 子查询

```cypher
MATCH (p:Person)
RETURN p.name, COUNT {
  MATCH (p)-[:KNOWS]->(friend:Person)
} AS 朋友数
ORDER BY 朋友数 DESC
```

## 2.7 APOC 实用工具库

APOC（Awesome Procedures on Cypher）是 Neo4j 最强大的扩展库，提供了数百个实用函数和存储过程。

### 2.7.1 安装与启用

```cypher
// 查看已安装的 APOC 版本
RETURN apoc.version()
```

### 2.7.2 数据转换

```cypher
// JSON 操作
WITH '{"name":"张三","age":30}' AS json
RETURN apoc.convert.fromJson(json) AS data

// 对象转 JSON
MATCH (p:Person)
RETURN p.name, apoc.convert.toJson(p) AS json

// 扁平化列表
WITH [[1, 2], [3, 4], [5]] AS nested
RETURN apoc.coll.flatten(nested) AS flat
```

### 2.7.3 图算法与路径

```cypher
// 查找所有路径（不同于 shortestPath，可以找到所有路径）
MATCH (a:Person {name: "张三"}), (b:Person {name: "王五"})
CALL apoc.algo.allPaths(a, b, "KNOWS", 5)
YIELD path
RETURN path

// Dijkstra 最短加权路径
MATCH (a:City {name: "北京"}), (b:City {name: "上海"})
CALL apoc.algo.dijkstra(a, b, "ROAD>", "distance")
YIELD path, weight
RETURN path, weight
```

### 2.7.4 数据导入导出

```cypher
// 从 CSV 加载数据
CALL apoc.load.csv("people.csv")
YIELD lineNo, list, map
MERGE (p:Person {id: map.id})
SET p.name = map.name, p.age = toInteger(map.age)

// 从 JSON 加载
CALL apoc.load.json("https://api.example.com/users")
YIELD value
MERGE (p:Person {id: value.id})
SET p.name = value.name
```

### 2.7.5 虚拟节点与关系

```cypher
// 创建虚拟节点（不持久化，仅用于展示）
MATCH (p:Person)
WITH collect(p) AS people
CALL apoc.create.vNode(["Group"], {name: "所有人"})
YIELD node AS group
UNWIND people AS person
CALL apoc.create.vRelationship(group, "CONTAINS", {}, person)
YIELD rel
RETURN group, rel, person
```

### 2.7.6 批量操作

```cypher
// 批量更新
MATCH (p:Person)
WITH p LIMIT 1000
CALL apoc.periodic.commit("
  MATCH (p:Person) WHERE p.status IS NULL
  WITH p LIMIT $limit
  SET p.status = 'active'
  RETURN count(*)
", {limit: 1000})
```

### 2.7.7 触发器与钩子

```cypher
// 创建触发器：当创建 Person 时自动设置时间戳
CALL apoc.trigger.add(
  'set_timestamps',
  'UNWIND $createdNodes AS n
   SET n.createdAt = datetime()',
  {phase: 'before'}
)
```

## 2.8 Cypher 与 SQL 对比

### 2.8.1 概念映射

| SQL 概念 | Cypher 概念 |
|----------|-------------|
| 表 (Table) | 标签 (Label) |
| 行 (Row) | 节点 (Node) |
| 列 (Column) | 属性 (Property) |
| 外键 (Foreign Key) | 关系 (Relationship) |
| JOIN | 模式匹配 (Pattern Matching) |
| SELECT | MATCH ... RETURN |
| WHERE | WHERE |
| GROUP BY | 隐式分组（非聚合字段自动分组） |
| ORDER BY | ORDER BY |
| LIMIT/OFFSET | SKIP/LIMIT |
| INSERT | CREATE / MERGE |
| UPDATE | SET |
| DELETE | DELETE / DETACH DELETE |
| LEFT JOIN | OPTIONAL MATCH |
| UNION | UNION / CALL { ... UNION } |
| 子查询 | CALL { ... } / 子查询 |
| CTE (WITH) | WITH |

### 2.8.2 等价查询对比

**场景：查找张三的朋友**

SQL:
```sql
SELECT p2.name
FROM persons p1
JOIN knows k ON p1.id = k.person1_id
JOIN persons p2 ON k.person2_id = p2.id
WHERE p1.name = '张三';
```

Cypher:
```cypher
MATCH (p1:Person {name: "张三"})-[:KNOWS]->(p2:Person)
RETURN p2.name
```

### 2.8.3 深度查询对比

**场景：查找张三的朋友的朋友（2 跳）**

SQL:
```sql
SELECT DISTINCT p3.name
FROM persons p1
JOIN knows k1 ON p1.id = k1.person1_id
JOIN persons p2 ON k1.person2_id = p2.id
JOIN knows k2 ON p2.id = k2.person1_id
JOIN persons p3 ON k2.person2_id = p3.id
WHERE p1.name = '张三'
  AND p3.id NOT IN (
    SELECT k3.person2_id FROM knows k3 WHERE k3.person1_id = p1.id
  );
```

Cypher:
```cypher
MATCH (p1:Person {name: "张三"})-[:KNOWS*2]->(p3:Person)
WHERE NOT (p1)-[:KNOWS]->(p3)
RETURN DISTINCT p3.name
```

### 2.8.4 变长路径对比

**场景：查找 1 到 5 跳内的所有关联**

SQL 需要递归 CTE：
```sql
WITH RECURSIVE path_cte AS (
  SELECT person1_id, person2_id, 1 AS depth
  FROM knows
  WHERE person1_id = (SELECT id FROM persons WHERE name = '张三')
  UNION ALL
  SELECT c.person1_id, k.person2_id, c.depth + 1
  FROM path_cte c
  JOIN knows k ON c.person2_id = k.person1_id
  WHERE c.depth < 5
)
SELECT DISTINCT p.name
FROM path_cte c
JOIN persons p ON c.person2_id = p.id;
```

Cypher:
```cypher
MATCH (p1:Person {name: "张三"})-[:KNOWS*1..5]->(p:Person)
RETURN DISTINCT p.name
```

### 2.8.5 聚合查询对比

**场景：统计每个城市的人数及平均年龄**

SQL:
```sql
SELECT city, COUNT(*) AS count, AVG(age) AS avg_age
FROM persons
GROUP BY city
HAVING COUNT(*) > 3
ORDER BY count DESC;
```

Cypher:
```cypher
MATCH (p:Person)
RETURN p.city AS city, count(*) AS count, avg(p.age) AS avg_age
ORDER BY count DESC
```

Cypher 中 `HAVING` 的等价写法（使用 `WITH`）：
```cypher
MATCH (p:Person)
WITH p.city AS city, count(*) AS count, avg(p.age) AS avg_age
WHERE count > 3
RETURN city, count, avg_age
ORDER BY count DESC
```

## 2.9 高级 Cypher 模式

### 2.9.1 FOREACH — 批量更新

`FOREACH` 用于对列表中的每个元素执行更新操作，常用于路径中的关系更新。

```cypher
// 为路径上的每个关系设置属性
MATCH path = (a:Person {name: "张三"})-[:KNOWS*]->(b:Person)
FOREACH (rel IN relationships(path) |
  SET rel.visited = true
)
```

### 2.9.2 CASE — 条件表达式

```cypher
MATCH (p:Person)
RETURN p.name,
  CASE
    WHEN p.age < 18 THEN "未成年"
    WHEN p.age < 60 THEN "成年"
    ELSE "老年"
  END AS 年龄段
```

### 2.9.3 UNWIND — 列表展开

```cypher
// 将列表展开为多行
WITH ["北京", "上海", "深圳"] AS cities
UNWIND cities AS city
MERGE (c:City {name: city})
RETURN c
```

```cypher
// 批量创建
WITH [
  {name: "张三", age: 30},
  {name: "李四", age: 25},
  {name: "王五", age: 35}
] AS people
UNWIND people AS person
MERGE (p:Person {name: person.name})
SET p.age = person.age
```

### 2.9.4 列表推导式

```cypher
// 过滤列表
MATCH (p:Person)
RETURN [friend IN (p)-[:KNOWS]->() | friend.name] AS 朋友列表

// 带条件的列表推导
MATCH (p:Person)
RETURN [friend IN (p)-[:KNOWS]->() WHERE friend.age > 30 | friend.name] AS 年长朋友
```

### 2.9.5 模式推导式

```cypher
// 直接在 RETURN 中使用模式
MATCH (p:Person {name: "张三"})
RETURN p.name, [(p)-[:KNOWS]->(friend) | friend.name] AS 朋友列表
```

```cypher
// 模式推导式 + 聚合
MATCH (p:Person)
RETURN p.name,
  size([(p)-[:KNOWS]->() | 1]) AS 朋友数,
  [(p)-[:WORKS_AT]->(c) | c.name] AS 公司
```

## 2.10 索引与约束

### 2.10.1 创建索引

```cypher
// 单属性索引
CREATE INDEX person_name_index FOR (p:Person) ON (p.name)

// 复合索引
CREATE INDEX person_city_age_index FOR (p:Person) ON (p.city, p.age)

// 全文索引（需要 APOC）
CALL db.index.fulltext.createNodeIndex("person_fulltext", ["Person"], ["name", "bio"])
```

### 2.10.2 使用全文索引查询

```cypher
CALL db.index.fulltext.queryNodes("person_fulltext", "张三")
YIELD node, score
RETURN node.name, score
ORDER BY score DESC
```

### 2.10.3 约束

```cypher
// 唯一约束
CREATE CONSTRAINT person_id_unique FOR (p:Person) REQUIRE p.id IS UNIQUE

// 存在性约束
CREATE CONSTRAINT person_name_exists FOR (p:Person) REQUIRE p.name IS NOT NULL

// 节点键约束（唯一 + 存在）
CREATE CONSTRAINT person_key FOR (p:Person) REQUIRE (p.id, p.name) IS NODE KEY
```

## 2.11 完整示例：社交网络查询

假设我们有一个社交网络图，包含人员、公司、城市和各类关系。

### 2.11.1 数据创建

```cypher
// 创建城市
CREATE (bj:City {name: "北京"});
CREATE (sh:City {name: "上海"});
CREATE (sz:City {name: "深圳"});

// 创建公司
CREATE (alibaba:Company {name: "阿里巴巴", industry: "电商"});
CREATE (tencent:Company {name: "腾讯", industry: "互联网"});
CREATE (huawei:Company {name: "华为", industry: "通信"});

// 创建人员及关系
CREATE
  (zs:Person {name: "张三", age: 30, gender: "男"}),
  (ls:Person {name: "李四", age: 28, gender: "女"}),
  (ww:Person {name: "王五", age: 35, gender: "男"}),
  (zl:Person {name: "赵六", age: 22, gender: "女"}),
  (sq:Person {name: "孙七", age: 40, gender: "男"}),
  (zs)-[:LIVES_IN]->(bj),
  (ls)-[:LIVES_IN]->(sh),
  (ww)-[:LIVES_IN]->(bj),
  (zl)-[:LIVES_IN]->(sz),
  (sq)-[:LIVES_IN]->(sh),
  (zs)-[:WORKS_AT {since: 2018, position: "工程师"}]->(alibaba),
  (ls)-[:WORKS_AT {since: 2020, position: "产品经理"}]->(tencent),
  (ww)-[:WORKS_AT {since: 2015, position: "架构师"}]->(alibaba),
  (zl)-[:WORKS_AT {since: 2022, position: "开发工程师"}]->(huawei),
  (sq)-[:WORKS_AT {since: 2010, position: "技术总监"}]->(tencent),
  (zs)-[:KNOWS {since: 2019}]->(ls),
  (zs)-[:KNOWS {since: 2020}]->(ww),
  (ls)-[:KNOWS {since: 2021}]->(zl),
  (ww)-[:KNOWS {since: 2018}]->(sq),
  (ls)-[:KNOWS {since: 2019}]->(sq),
  (ww)-[:KNOWS {since: 2017}]->(ls);
```

### 2.11.2 查询示例

**查询 1：查找张三的同事**

```cypher
MATCH (zs:Person {name: "张三"})-[:WORKS_AT]->(company:Company)<-[:WORKS_AT]-(colleague:Person)
RETURN company.name AS 公司, colleague.name AS 同事, colleague.position AS 职位
```

**查询 2：查找同一城市的朋友**

```cypher
MATCH (p:Person)-[:LIVES_IN]->(city:City)<-[:LIVES_IN]-(friend:Person),
      (p)-[:KNOWS]-(friend)
RETURN city.name AS 城市, p.name AS 人员, friend.name AS 朋友
```

**查询 3：查找推荐工作（朋友所在公司）**

```cypher
MATCH (me:Person {name: "张三"})-[:KNOWS]->(friend:Person)-[:WORKS_AT]->(company:Company)
WHERE NOT (me)-[:WORKS_AT]->(company)
RETURN company.name AS 推荐公司, collect(DISTINCT friend.name) AS 在该公司的朋友,
       count(DISTINCT friend) AS 推荐人数
ORDER BY 推荐人数 DESC
```

**查询 4：社交网络影响力分析**

```cypher
// 计算每个人的社交网络影响力（直接朋友数 + 间接朋友数）
MATCH (p:Person)
RETURN p.name AS 姓名,
  size([(p)-[:KNOWS]->() | 1]) AS 直接朋友数,
  size([(p)-[:KNOWS*2]->(indirect) WHERE NOT (p)-[:KNOWS]->(indirect) AND p <> indirect | 1]) AS 间接朋友数,
  size([(p)-[:KNOWS*1..2]->(all) WHERE p <> all | 1]) AS 总关联人数
ORDER BY 总关联人数 DESC
```

**查询 5：最短同事关系链**

```cypher
MATCH (a:Person {name: "张三"}), (b:Person {name: "赵六"})
MATCH path = shortestPath((a)-[:KNOWS*]-(b))
RETURN [node IN nodes(path) | node.name] AS 路径, length(path) AS 跳数
```

**查询 6：公司人员分布统计**

```cypher
MATCH (p:Person)-[:WORKS_AT]->(c:Company)
WITH c, collect(p.name) AS 员工列表, count(p) AS 员工数
WHERE 员工数 > 1
RETURN c.name AS 公司, c.industry AS 行业, 员工数, 员工列表
ORDER BY 员工数 DESC
```

**查询 7：城市间的人员流动关系**

```cypher
MATCH (p:Person)-[:LIVES_IN]->(c1:City),
      (p)-[:WORKS_AT]->(comp:Company)-[:LOCATED_IN]->(c2:City)
WHERE c1 <> c2
RETURN p.name AS 姓名, c1.name AS 居住城市, c2.name AS 工作城市, comp.name AS 公司
```

**查询 8：查找关键中间人（桥接者）**

```cypher
// 找到那些删除后会导致社交网络断裂的人
MATCH (p:Person)
WHERE size([(p)-[:KNOWS]->() | 1]) >= 2
  AND NOT EXISTS {
    MATCH (a:Person)-[:KNOWS]->(p)-[:KNOWS]->(b:Person)
    WHERE (a)-[:KNOWS]-(b)
  }
RETURN p.name AS 桥接者, [(p)-[:KNOWS]->(f) | f.name] AS 连接的朋友
```

## 2.12 性能优化建议

### 2.12.1 查询优化原则

1. **尽量使用标签**：始终为节点指定标签，避免无标签扫描
2. **利用索引**：为频繁查询的属性创建索引
3. **限制路径深度**：变长路径查询指定合理的上下界
4. **使用 `PROFILE` 分析查询**：

```cypher
PROFILE
MATCH (p:Person {name: "张三"})-[:KNOWS]->(friend)
RETURN friend
```

5. **使用 `EXPLAIN` 查看执行计划**：

```cypher
EXPLAIN
MATCH (p:Person)-[:KNOWS]->(friend)
WHERE p.name = "张三"
RETURN friend
```

### 2.12.2 避免常见陷阱

```cypher
// 低效：无标签扫描
MATCH (n {name: "张三"}) RETURN n

// 高效：带标签的查询
MATCH (p:Person {name: "张三"}) RETURN p
```

```cypher
// 低效：在 WHERE 中对属性做函数运算（无法使用索引）
MATCH (p:Person)
WHERE toUpper(p.name) = "张三"
RETURN p

// 高效：直接匹配
MATCH (p:Person {name: "张三"}) RETURN p
```

```cypher
// 低效：大范围笛卡尔积
MATCH (a:Person), (b:Person)
WHERE a.age > b.age
RETURN a, b

// 高效：使用关系限制
MATCH (a:Person)-[:KNOWS]->(b:Person)
WHERE a.age > b.age
RETURN a, b
```

## 2.13 本章小结

本章详细介绍了 Neo4j 的属性图数据模型和 Cypher 查询语言。属性图模型以节点、关系、属性和标签为核心要素，天然适合表达高度关联的数据。Cypher 作为声明式图查询语言，通过模式匹配机制让复杂关联查询变得简洁直观。

与 SQL 相比，Cypher 在处理多对多关系、变长路径和深度关联查询时具有显著优势。一个在 SQL 中需要递归 CTE 的深度查询，在 Cypher 中只需一行模式匹配即可完成。APOC 扩展库进一步增强了 Cypher 的能力，提供了数据转换、图算法、批量操作等实用功能。

在实际应用中，合理使用索引、约束和查询优化技术，可以充分发挥 Neo4j 的性能优势。下一章将深入介绍 Spring Data Neo4j 的集成开发实践。
