// ==========================================
// Cypher 查询语言示例
// 运行方式: 在 Neo4j Browser 或 Cypher Shell 中执行
// ==========================================

// --- 1. 创建数据 ---
// 创建用户
CREATE (alice:User {name: 'Alice', age: 30, city: 'Beijing'})
CREATE (bob:User {name: 'Bob', age: 25, city: 'Shanghai'})
CREATE (carol:User {name: 'Carol', age: 35, city: 'Beijing'})
CREATE (dave:User {name: 'Dave', age: 28, city: 'Shenzhen'})

// 创建电影
CREATE (inception:Movie {title: 'Inception', year: 2010, rating: 8.8})
CREATE (interstellar:Movie {title: 'Interstellar', year: 2014, rating: 9.3})
CREATE (matrix:Movie {title: 'The Matrix', year: 1999, rating: 8.7})

// 创建关系
MATCH (a:User {name: 'Alice'}), (b:User {name: 'Bob'})
CREATE (a)-[:KNOWS {since: 2020}]->(b)

MATCH (a:User {name: 'Alice'}), (c:User {name: 'Carol'})
CREATE (a)-[:KNOWS {since: 2021}]->(c)

MATCH (b:User {name: 'Bob'}), (c:User {name: 'Carol'})
CREATE (b)-[:KNOWS {since: 2022}]->(c)

MATCH (a:User {name: 'Alice'}), (m:Movie {title: 'Inception'})
CREATE (a)-[:RATED {rating: 9}]->(m)

MATCH (a:User {name: 'Alice'}), (m:Movie {title: 'Interstellar'})
CREATE (a)-[:RATED {rating: 10}]->(m)

MATCH (b:User {name: 'Bob'}), (m:Movie {title: 'Inception'})
CREATE (b)-[:RATED {rating: 8}]->(m)

// --- 2. 基本查询 ---
// 查询所有用户
MATCH (u:User) RETURN u.name, u.age, u.city

// 按条件过滤
MATCH (u:User) WHERE u.city = 'Beijing' RETURN u.name

// --- 3. 关系查询 ---
// 查询 Alice 认识的人
MATCH (a:User {name: 'Alice'})-[:KNOWS]->(friend)
RETURN friend.name

// 查询 Alice 评分的电影
MATCH (a:User {name: 'Alice'})-[r:RATED]->(m:Movie)
RETURN m.title, r.rating

// --- 4. 多步遍历 ---
// 朋友的朋友（2度关系）
MATCH (a:User {name: 'Alice'})-[:KNOWS*2]->(fof)
WHERE NOT (a)-[:KNOWS]->(fof) AND a <> fof
RETURN DISTINCT fof.name

// --- 5. 路径查询 ---
// 查找 Alice 到 Carol 的最短路径
MATCH p = shortestPath(
  (a:User {name: 'Alice'})-[:KNOWS*]-(c:User {name: 'Carol'})
)
RETURN p

// --- 6. 聚合查询 ---
// 每部电影的平均评分
MATCH (u:User)-[r:RATED]->(m:Movie)
RETURN m.title, AVG(r.rating) AS avg_rating, COUNT(u) AS ratings
ORDER BY avg_rating DESC

// --- 7. 创建索引 ---
CREATE INDEX user_name_index FOR (u:User) ON (u.name)
CREATE INDEX movie_title_index FOR (m:Movie) ON (m.title)

// --- 8. 查询分析 ---
PROFILE MATCH (a:User {name: 'Alice'})-[:KNOWS]->(friend)
RETURN friend.name
