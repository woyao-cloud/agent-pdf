# 第4章：高级查询

> 基本的 CRUD 只能解决简单问题。当你要分析"两个用户之间最短的社交路径"、"找出社交网络中的意见领袖"、"分页查询大量结果"时，就需要高级查询技巧了。

---

## 📖 本章导读

### 一个真实的故事

小赵在开发一个社交平台，产品经理提出了几个"简单"的需求：

1. "帮我找出 Alice 可能认识的人——她朋友的朋友"
2. "找出 Alice 和 Grace 之间最短的社交路径"
3. "统计每个城市用户的平均关注数"
4. "找出那些相互关注的人（三角关系）"

在 MySQL 中，这些需求每一个都需要复杂的递归查询或多表 JOIN。特别是"最短路径"——在关系型数据库中几乎无法高效实现。

在 Neo4j 中，这些需求变得异常简单：

```cypher
-- 1. 朋友的朋友
MATCH (a:User {name: "Alice"})-[:FOLLOWS*2]->(fof)
RETURN DISTINCT fof.name

-- 2. 最短路径
MATCH p = shortestPath((a:User {name: "Alice"})-[:FOLLOWS*]-(g:User {name: "Grace"}))
RETURN p

-- 3. 按城市统计
MATCH (u:User)<-[:FOLLOWS]-(f)
RETURN u.city, count(f) AS avg_followers

-- 4. 三角关系
MATCH (a)-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)-[:FOLLOWS]->(a)
RETURN a.name, b.name, c.name
```

**这就是高级查询的威力——用简洁的语法解决复杂的关系分析问题。**

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **使用变长路径查询任意深度的关系** — 朋友的朋友、权限继承链
2. **计算两点之间的最短路径** — 社交距离、物流路线
3. **用聚合和管道处理复杂的数据分析** — 分组统计、链式处理
4. **使用子查询和条件逻辑** — 处理复杂的业务逻辑
5. **实现分页查询** — 处理大量结果

---

## 🧠 核心概念详解

### 1. 路径查询

路径查询是 Cypher 最强大的特性之一。它允许你查询**任意深度**的关系链。

#### 固定深度

```cypher
-- 查询 Alice 的朋友（1度关系）
MATCH (a:User {name: "Alice"})-[:FOLLOWS]->(friend:User)
RETURN friend.name
```

#### 变长深度

```cypher
-- 查询 Alice 的朋友的朋友（2度关系）
MATCH (a:User {name: "Alice"})-[:FOLLOWS*2]->(fof:User)
RETURN DISTINCT fof.name
```

**🔍 解读**：`[:FOLLOWS*2]` 表示"经过 2 次 FOLLOWS 关系"。`DISTINCT` 去重，因为同一个节点可能通过不同路径到达。

#### 深度范围

```cypher
-- 查询 1 到 3 度关系
MATCH (a:User {name: "Alice"})-[:FOLLOWS*1..3]->(connected:User)
WHERE connected <> a
RETURN connected.name, length(connected) AS degree
```

**🔍 解读**：`[:FOLLOWS*1..3]` 表示"1 到 3 次 FOLLOWS 关系"。`length(connected)` 返回路径长度。

#### 最短路径

```cypher
-- 查询 Alice 到 Grace 的最短路径
MATCH p = shortestPath((a:User {name: "Alice"})-[:FOLLOWS*]-(g:User {name: "Grace"}))
RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps
```

**预期结果**：
```
╔══════════════════════════════════╤═══════╗
║ path                            │ steps ║
╠══════════════════════════════════╪═══════╣
║ ["Alice", "Bob", "Diana", "Grace"]│ 3     ║
╚══════════════════════════════════╧═══════╝
```

**🔍 解读**：`shortestPath()` 找到两个节点之间最短的路径。`[n IN nodes(p) | n.name]` 是一个列表推导式，将路径中的节点名提取为列表。

**💡 类比**：`shortestPath` 就像地图 App 的"最短路线"功能——它找到两个地点之间经过最少道路的路线。

### 2. 聚合与分组

聚合函数用于统计数据，和 SQL 的 GROUP BY 类似。

| 函数 | 用途 | 类比 SQL |
|------|------|---------|
| `count()` | 计数 | `COUNT()` |
| `sum()` | 求和 | `SUM()` |
| `avg()` | 平均值 | `AVG()` |
| `min()` / `max()` | 最小值/最大值 | `MIN()` / `MAX()` |
| `collect()` | 收集为列表 | `GROUP_CONCAT()` |

```cypher
-- 统计每个城市的用户数
MATCH (u:User)
RETURN u.city AS city, count(*) AS user_count
ORDER BY user_count DESC
```

**预期结果**：
```
╔═══════════╤═════════════╗
║ city      │ user_count  ║
╠═══════════╪═════════════╣
║ "Beijing" │ 4           ║
║ "Shanghai"│ 2           ║
║ "Shenzhen"│ 2           ║
╚═══════════╧═════════════╝
```

### 3. WITH 管道

`WITH` 是 Cypher 的管道操作符，它将前一步的结果传递给下一步。类似于 SQL 的 `HAVING` 或子查询。

```cypher
-- 找出关注数 >= 3 的用户
MATCH (u:User)-[:FOLLOWS]->(followed:User)
WITH u, count(followed) AS follow_count
WHERE follow_count >= 3
RETURN u.name, follow_count
```

**🔍 解读**：`WITH` 先计算每个用户的关注数，然后 `WHERE` 过滤出关注数 >= 3 的用户。这相当于 SQL 的 `HAVING`。

### 4. 子查询 (CALL { ... })

子查询允许你在一个查询中嵌套另一个查询。

```cypher
-- 找到每个城市中关注数最多的人
CALL {
    MATCH (u:User)<-[:FOLLOWS]-(follower)
    RETURN u, count(follower) AS followers
}
WITH u, followers
MATCH (u)-[:FOLLOWS]->(followed)
RETURN u.name, followers, count(followed) AS following
ORDER BY followers DESC
```

**🔍 解读**：`CALL { ... }` 定义了一个子查询，先计算粉丝数，然后在外层查询中计算关注数。

### 5. 条件逻辑 (CASE)

```cypher
-- 按年龄分组
MATCH (u:User)
RETURN u.name,
       CASE
           WHEN u.age < 28 THEN "青年"
           WHEN u.age < 32 THEN "中青年"
           ELSE "中年"
       END AS age_group
```

**预期结果**：
```
╔═════════╤════════════╗
║ u.name  │ age_group  ║
╠═════════╪════════════╣
║ "Alice" │ "中青年"   ║
║ "Bob"   │ "青年"     ║
║ "Charlie"│ "中年"     ║
╚═════════╧════════════╝
```

### 6. 分页查询

```cypher
-- 第2页，每页3条（按年龄降序）
MATCH (u:User)
RETURN u.name, u.age
ORDER BY u.age DESC
SKIP 3 LIMIT 3
```

**🔍 解读**：`SKIP` 跳过前 N 条，`LIMIT` 限制返回条数。`SKIP 3 LIMIT 3` 表示"跳过前 3 条，返回接下来的 3 条"（即第 2 页）。

---

## 🛠️ 动手实践

### 第一步：启动并初始化

```bash
cd demos/04-advanced-querying
docker compose up -d
docker exec -it neo4j-advanced-query cypher-shell -u neo4j -p password123 -f /init.cypher
```

### 第二步：路径查询练习

打开 http://localhost:7477，执行以下查询。

#### 练习1：变长路径

```cypher
-- 查询 Alice 的 2 度好友
MATCH (alice:User {name: "Alice"})-[:FOLLOWS*2]->(fof:User)
RETURN DISTINCT fof.name AS friend_of_friend
```

**预期结果**：Diana、Eve、Henry（Alice → Bob → Diana，Alice → Charlie → Eve/Henry）

#### 练习2：最短路径

```cypher
-- 查询 Alice 到 Grace 的最短路径
MATCH p = shortestPath((a:User {name: "Alice"})-[:FOLLOWS*]-(g:User {name: "Grace"}))
RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps
```

**预期结果**：路径为 Alice → Bob → Diana → Grace，共 3 步。

#### 练习3：聚合统计

```cypher
-- 统计每个用户的粉丝数
MATCH (u:User)<-[:FOLLOWS]-(follower:User)
RETURN u.name AS user, count(follower) AS followers
ORDER BY followers DESC
```

**预期结果**：Alice 和 Charlie 粉丝最多（各 3 个），因为他们被更多人关注。

#### 练习4：三角关系检测

```cypher
-- 找出相互关注的三角关系
MATCH (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(c:User)
WHERE (c)-[:FOLLOWS]->(a)
RETURN a.name, b.name, c.name
```

**预期结果**：显示 Alice → Charlie → Eve → Alice 的三角关系。

#### 练习5：子查询

```cypher
-- 找出关注数最多的用户，同时显示他们的关注数
CALL {
    MATCH (u:User)<-[:FOLLOWS]-(follower)
    RETURN u, count(follower) AS followers
}
RETURN u.name, followers
ORDER BY followers DESC
LIMIT 3
```

**预期结果**：Alice（3）、Charlie（3）、Bob（2）。

---

## ⚠️ 常见误区

### 误区1：变长路径深度过大

**错误做法**：
```cypher
MATCH (a:User)-[:FOLLOWS*1..10]->(b:User)  -- ❌ 10 度遍历，可能产生数百万条路径
```

**问题**：路径数量随深度指数增长，可能导致 OOM。

**正确做法**：
```cypher
-- 先限制深度，确认数据量
MATCH (a:User)-[:FOLLOWS*1..3]->(b:User)  -- ✅ 从 3 度开始
RETURN count(DISTINCT b)

-- 需要深度遍历时使用 shortestPath
MATCH p = shortestPath((a:User)-[:FOLLOWS*]-(b:User))  -- ✅ 只找最短路径
RETURN p
```

### 误区2：忘记 DISTINCT 导致重复

**错误做法**：
```cypher
MATCH (a:User {name: "Alice"})-[:FOLLOWS*2]->(fof:User)
RETURN fof.name  -- ❌ 可能返回重复值
```

**正确做法**：
```cypher
MATCH (a:User {name: "Alice"})-[:FOLLOWS*2]->(fof:User)
RETURN DISTINCT fof.name  -- ✅ 去重
```

### 误区3：在 WHERE 中使用聚合函数

**错误做法**：
```cypher
MATCH (u:User)-[:FOLLOWS]->(f)
WHERE count(f) > 3  -- ❌ WHERE 中不能直接使用聚合函数
RETURN u.name
```

**正确做法**：
```cypher
MATCH (u:User)-[:FOLLOWS]->(f)
WITH u, count(f) AS follow_count
WHERE follow_count > 3  -- ✅ 先用 WITH 聚合，再过滤
RETURN u.name
```

### 误区4：忽略 OPTIONAL MATCH 和 MATCH 的区别

```cypher
-- MATCH：如果匹配不到，整行不返回
MATCH (u:User)
MATCH (u)-[:FOLLOWS]->(f)  -- 没有关注的人会被排除
RETURN u.name, collect(f.name)

-- OPTIONAL MATCH：匹配不到也返回，f 为 null
MATCH (u:User)
OPTIONAL MATCH (u)-[:FOLLOWS]->(f)  -- 没有关注的人也返回
RETURN u.name, collect(f.name)
```

---

## 💭 思考题

1. 如果要查询"Alice 和 Charlie 的共同关注者"，Cypher 应该怎么写？
2. `MATCH (a)-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)` 和 `MATCH (a)-[:FOLLOWS*2]->(c)` 有什么区别？结果可能不同吗？
3. 如果要实现"分页查询用户列表，每页 5 条，按年龄降序"，Cypher 怎么写第 3 页的查询？

---

## 📚 扩展阅读

- [Cypher 路径查询](https://neo4j.com/docs/cypher-manual/current/patterns/variable-length/) — 变长路径详解
- [Cypher 聚合函数](https://neo4j.com/docs/cypher-manual/current/functions/aggregating/) — 所有聚合函数参考
- [Cypher 子查询](https://neo4j.com/docs/cypher-manual/current/subqueries/) — 子查询高级用法

---

## 🏃 运行命令速查

```bash
# 启动
docker compose up -d

# 初始化数据
docker exec -it neo4j-advanced-query cypher-shell -u neo4j -p password123 -f /init.cypher

# 停止并清理
docker compose down -v
```
