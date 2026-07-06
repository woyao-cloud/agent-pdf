// ============================================================
// 第7章：图算法 — 社交网络影响力分析与社区发现
// 使用 GDS (Graph Data Science) 库
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建社交网络数据
// ============================================================

CREATE (alice:Person {name: "Alice", age: 30});
CREATE (bob:Person {name: "Bob", age: 28});
CREATE (charlie:Person {name: "Charlie", age: 35});
CREATE (diana:Person {name: "Diana", age: 27});
CREATE (eve:Person {name: "Eve", age: 32});
CREATE (frank:Person {name: "Frank", age: 29});
CREATE (grace:Person {name: "Grace", age: 31});
CREATE (henry:Person {name: "Henry", age: 33});
CREATE (ivy:Person {name: "Ivy", age: 26});
CREATE (jack:Person {name: "Jack", age: 34});

// 创建关注关系（有向）
CREATE (alice)-[:FOLLOWS]->(bob);
CREATE (alice)-[:FOLLOWS]->(charlie);
CREATE (alice)-[:FOLLOWS]->(eve);
CREATE (bob)-[:FOLLOWS]->(alice);
CREATE (bob)-[:FOLLOWS]->(diana);
CREATE (bob)-[:FOLLOWS]->(frank);
CREATE (charlie)-[:FOLLOWS]->(alice);
CREATE (charlie)-[:FOLLOWS]->(eve);
CREATE (charlie)-[:FOLLOWS]->(henry);
CREATE (diana)-[:FOLLOWS]->(bob);
CREATE (diana)-[:FOLLOWS]->(grace);
CREATE (eve)-[:FOLLOWS]->(charlie);
CREATE (eve)-[:FOLLOWS]->(henry);
CREATE (frank)-[:FOLLOWS]->(bob);
CREATE (frank)-[:FOLLOWS]->(ivy);
CREATE (grace)-[:FOLLOWS]->(diana);
CREATE (grace)-[:FOLLOWS]->(ivy);
CREATE (henry)-[:FOLLOWS]->(alice);
CREATE (henry)-[:FOLLOWS]->(charlie);
CREATE (henry)-[:FOLLOWS]->(eve);
CREATE (ivy)-[:FOLLOWS]->(frank);
CREATE (ivy)-[:FOLLOWS]->(grace);
CREATE (jack)-[:FOLLOWS]->(alice);
CREATE (jack)-[:FOLLOWS]->(charlie);
CREATE (jack)-[:FOLLOWS]->(eve);

// ============================================================
// 2. 路径算法
// ============================================================

// 2.1 最短路径：Alice到Ivy
// MATCH p = shortestPath((a:Person {name: "Alice"})-[:FOLLOWS*]-(i:Person {name: "Ivy"}))
// RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps;

// 2.2 所有最短路径
// MATCH (a:Person {name: "Alice"}), (i:Person {name: "Ivy"})
// MATCH p = allShortestPaths((a)-[:FOLLOWS*]-(i))
// RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps;

// ============================================================
// 3. GDS 图算法（需要 GDS 插件）
// ============================================================

// 3.1 创建投影图
// CALL gds.graph.project(
//     'social-graph',
//     'Person',
//     'FOLLOWS'
// );

// 3.2 PageRank — 节点重要性/影响力
// CALL gds.pageRank.stream('social-graph')
// YIELD nodeId, score
// RETURN gds.util.asNode(nodeId).name AS person, score
// ORDER BY score DESC;

// 3.3 Betweenness Centrality — 中介中心性（桥接者）
// CALL gds.betweenness.stream('social-graph')
// YIELD nodeId, score
// RETURN gds.util.asNode(nodeId).name AS person, score
// ORDER BY score DESC;

// 3.4 Degree Centrality — 度中心性（连接数）
// CALL gds.degree.stream('social-graph')
// YIELD nodeId, score
// RETURN gds.util.asNode(nodeId).name AS person, score AS followers
// ORDER BY followers DESC;

// 3.5 Louvain 社区检测
// CALL gds.louvain.stream('social-graph')
// YIELD nodeId, communityId
// RETURN gds.util.asNode(nodeId).name AS person, communityId
// ORDER BY communityId;

// 3.6 Weakly Connected Components
// CALL gds.wcc.stream('social-graph')
// YIELD nodeId, componentId
// RETURN gds.util.asNode(nodeId).name AS person, componentId
// ORDER BY componentId;

// 3.7 Triangle Count — 三角计数（社交紧密程度）
// CALL gds.triangleCount.stream('social-graph')
// YIELD nodeId, triangleCount
// RETURN gds.util.asNode(nodeId).name AS person, triangleCount
// ORDER BY triangleCount DESC;

// ============================================================
// 4. 清理投影图
// ============================================================

// CALL gds.graph.drop('social-graph');

// ============================================================
// 5. 原生Cypher实现的图分析
// ============================================================

// 5.1 计算每个节点的入度（粉丝数）
// MATCH (p:Person)<-[:FOLLOWS]-(follower)
// RETURN p.name AS person, count(follower) AS followers
// ORDER BY followers DESC;

// 5.2 计算每个节点的出度（关注数）
// MATCH (p:Person)-[:FOLLOWS]->(followed)
// RETURN p.name AS person, count(followed) AS following
// ORDER BY following DESC;

// 5.3 三角关系检测（相互关注）
// MATCH (a:Person)-[:FOLLOWS]->(b:Person)-[:FOLLOWS]->(c:Person)
// WHERE (c)-[:FOLLOWS]->(a)
// RETURN a.name, b.name, c.name;

// 5.4 推荐好友（共同关注者）
// MATCH (target:Person {name: "Alice"})-[:FOLLOWS]->(common)<-[:FOLLOWS]-(candidate:Person)
// WHERE NOT (target)-[:FOLLOWS]->(candidate) AND target <> candidate
// RETURN candidate.name AS recommended, count(common) AS common_follows
// ORDER BY common_follows DESC;
