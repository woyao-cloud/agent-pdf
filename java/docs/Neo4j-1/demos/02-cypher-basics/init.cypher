// ============================================================
// 第2章：Cypher查询语言基础
// 使用电影-演员-导演图，展示Cypher核心语法
//
// 业务场景：一个电影信息平台需要存储电影、演员、导演信息，
// 以及它们之间的关系（谁演了什么电影、谁导演了什么电影）。
// 用户需要能查询"某演员演过哪些电影"、"某导演和哪些演员合作过"。
//
// 运行方式：
//   docker exec -it neo4j-cypher-basics cypher-shell -u neo4j -p password123 -f /init.cypher
// 然后打开 http://localhost:7475 在 Browser 中执行查询
// ============================================================

// 清除已有数据
MATCH (n) DETACH DELETE n;

// ============================================================
// 1. CREATE — 创建节点与关系
//
// 💡 类比：CREATE 就像 SQL 的 INSERT INTO
// 区别：Cypher 可以同时创建节点和关系，SQL 需要分开 INSERT
// ============================================================

// 1.1 创建带标签和属性的节点
// 业务场景：添加新的电影到数据库
// 每个 Movie 节点代表一部电影，包含标题、年份、评分等属性
CREATE (m1:Movie {title: "The Matrix", year: 1999, rating: 8.7});
CREATE (m2:Movie {title: "Inception", year: 2010, rating: 8.8});
CREATE (m3:Movie {title: "Interstellar", year: 2014, rating: 8.6});
CREATE (m4:Movie {title: "The Dark Knight", year: 2008, rating: 9.0});

// 创建演员节点
// 业务场景：添加演员信息，包含姓名和出生年份
CREATE (a1:Actor {name: "Keanu Reeves", born: 1964});
CREATE (a2:Actor {name: "Leonardo DiCaprio", born: 1974});
CREATE (a3:Actor {name: "Matthew McConaughey", born: 1969});
CREATE (a4:Actor {name: "Christian Bale", born: 1974});

// 创建导演节点
CREATE (d1:Director {name: "Lana Wachowski", born: 1965});
CREATE (d2:Director {name: "Christopher Nolan", born: 1970});

// 1.2 创建关系（方式一：先创建节点再关联）
// 业务场景：记录"某演员在某电影中扮演了某个角色"
// 关系属性 role 记录了角色名，salary 记录了片酬
// 执行预期：Keanu Reeves 通过 ACTED_IN 关系连接到 The Matrix
MATCH (a:Actor {name: "Keanu Reeves"}), (m:Movie {title: "The Matrix"})
CREATE (a)-[:ACTED_IN {role: "Neo", salary: 10}]->(m);

MATCH (a:Actor {name: "Leonardo DiCaprio"}), (m:Movie {title: "Inception"})
CREATE (a)-[:ACTED_IN {role: "Dom Cobb", salary: 15}]->(m);

MATCH (a:Actor {name: "Matthew McConaughey"}), (m:Movie {title: "Interstellar"})
CREATE (a)-[:ACTED_IN {role: "Cooper", salary: 12}]->(m);

MATCH (a:Actor {name: "Christian Bale"}), (m:Movie {title: "The Dark Knight"})
CREATE (a)-[:ACTED_IN {role: "Batman", salary: 20}]->(m);

// 1.3 创建导演关系
MATCH (d:Director {name: "Lana Wachowski"}), (m:Movie {title: "The Matrix"})
CREATE (d)-[:DIRECTED]->(m);

MATCH (d:Director {name: "Christopher Nolan"}), (m:Movie {title: "Inception"})
CREATE (d)-[:DIRECTED]->(m);

MATCH (d:Director {name: "Christopher Nolan"}), (m:Movie {title: "Interstellar"})
CREATE (d)-[:DIRECTED]->(m);

MATCH (d:Director {name: "Christopher Nolan"}), (m:Movie {title: "The Dark Knight"})
CREATE (d)-[:DIRECTED]->(m);

// ============================================================
// 2. MATCH + RETURN — 查询数据
// ============================================================

// 2.1 查询所有电影（按年份排序）
// MATCH (m:Movie) RETURN m.title, m.year, m.rating ORDER BY m.year DESC;

// 2.2 查询特定电影
// MATCH (m:Movie {title: "Inception"}) RETURN m;

// 2.3 查询演员及其出演的电影
// MATCH (a:Actor)-[:ACTED_IN]->(m:Movie) RETURN a.name, m.title;

// 2.4 查询导演及其导演的电影
// MATCH (d:Director)-[:DIRECTED]->(m:Movie) RETURN d.name, collect(m.title) AS movies;

// ============================================================
// 3. WHERE — 条件过滤
// ============================================================

// 3.1 比较运算符
// MATCH (m:Movie) WHERE m.year >= 2010 RETURN m.title, m.year;

// 3.2 字符串匹配
// MATCH (m:Movie) WHERE m.title STARTS WITH "The" RETURN m.title;

// 3.3 IN 列表
// MATCH (m:Movie) WHERE m.year IN [1999, 2008] RETURN m.title, m.year;

// 3.4 复合条件
// MATCH (m:Movie) WHERE m.rating >= 8.7 AND m.year > 2000 RETURN m.title, m.rating;

// 3.5 EXISTS 属性存在检查
// MATCH (m:Movie) WHERE exists(m.rating) RETURN m.title;

// ============================================================
// 4. SET — 更新属性
// ============================================================

// 4.1 更新单个属性
// MATCH (m:Movie {title: "The Matrix"}) SET m.rating = 8.8 RETURN m.title, m.rating;

// 4.2 添加新属性
// MATCH (m:Movie {title: "Inception"}) SET m.genre = "Sci-Fi" RETURN m.title, m.genre;

// 4.3 使用 += 合并属性
// MATCH (m:Movie {title: "Interstellar"}) SET m += {genre: "Sci-Fi", duration: 169} RETURN m;

// ============================================================
// 5. DELETE + REMOVE — 删除
// ============================================================

// 5.1 删除属性
// MATCH (m:Movie {title: "The Matrix"}) REMOVE m.rating RETURN m;

// 5.2 删除关系
// MATCH (a:Actor {name: "Keanu Reeves"})-[r:ACTED_IN]->(m:Movie {title: "The Matrix"})
// DELETE r;

// 5.3 删除节点及其所有关系（DETACH DELETE）
// MATCH (m:Movie {title: "The Dark Knight"}) DETACH DELETE m;

// ============================================================
// 6. MERGE — 创建或匹配（幂等操作）
// ============================================================

// 6.1 MERGE 节点（存在则匹配，不存在则创建）
// MERGE (p:Person {name: "Tom Hanks"})
// ON CREATE SET p.born = 1956
// ON MATCH SET p.lastSeen = datetime()
// RETURN p;

// 6.2 MERGE 关系
// MATCH (a:Actor {name: "Keanu Reeves"}), (m:Movie {title: "The Matrix"})
// MERGE (a)-[r:ACTED_IN]->(m)
// ON CREATE SET r.role = "Neo"
// RETURN a.name, type(r), m.title;

// ============================================================
// 7. 综合查询示例
// ============================================================

// 7.1 查询Christopher Nolan导演的所有电影及演员
// MATCH (d:Director {name: "Christopher Nolan"})-[:DIRECTED]->(m:Movie)<-[:ACTED_IN]-(a:Actor)
// RETURN m.title, collect(a.name) AS actors;

// 7.2 查询评分最高的电影
// MATCH (m:Movie) RETURN m.title, m.rating ORDER BY m.rating DESC LIMIT 3;

// 7.3 查询演员的合作导演
// MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)<-[:DIRECTED]-(d:Director)
// RETURN a.name, collect(DISTINCT d.name) AS directors;

// 7.4 统计每位导演的电影数量
// MATCH (d:Director)-[:DIRECTED]->(m:Movie)
// RETURN d.name AS director, count(m) AS movie_count ORDER BY movie_count DESC;
