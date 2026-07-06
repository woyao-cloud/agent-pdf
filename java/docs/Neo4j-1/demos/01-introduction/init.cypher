// ============================================================
// 第1章：图数据库与Neo4j概述 — 初始化示例
// 创建一个简单的社交网络图，展示图数据库的核心概念
//
// 业务场景：一个社交平台需要存储用户信息、用户之间的好友关系、
// 用户的工作信息、以及用户掌握的技能。这些数据之间天然是"图"结构。
//
// 运行方式：
//   docker exec -it neo4j-intro cypher-shell -u neo4j -p password123 -f /init.cypher
// 然后打开 http://localhost:7474 在 Browser 中执行查询
// ============================================================

// 清除已有数据（首次运行不需要）
MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建节点（Nodes）— 表示实体
// 每个节点可以有标签（Label）和属性（Properties）
//
// 💡 类比：节点 ≈ Excel 表中的"一行记录"
// 区别：节点可以同时属于多个类别（标签），而行只能属于一个表
// ============================================================

// 创建人物节点
// 业务场景：用户注册时，系统需要存储用户的基本信息
// 每个 Person 节点代表一个用户，包含姓名、年龄、城市等属性
CREATE (alice:Person {name: "Alice", age: 30, city: "Beijing"});
CREATE (bob:Person {name: "Bob", age: 28, city: "Shanghai"});
CREATE (charlie:Person {name: "Charlie", age: 35, city: "Beijing"});
CREATE (diana:Person {name: "Diana", age: 27, city: "Shenzhen"});

// 创建公司节点
// 业务场景：公司信息作为独立实体存储，可以被多个用户关联
// 这样当公司信息变更时，只需要修改一个节点
CREATE (acme:Company {name: "Acme Corp", founded: 2010, industry: "Technology"});
CREATE (beta:Company {name: "Beta Inc", founded: 2015, industry: "Finance"});

// 创建技能节点
// 业务场景：技能作为独立节点，可以被多个用户"掌握"
// 这样查询"谁掌握了Python"就非常高效
CREATE (py:Skill {name: "Python"});
CREATE (js:Skill {name: "JavaScript"});
CREATE (ml:Skill {name: "Machine Learning"});

// ============================================================
// 2. 创建关系（Relationships）— 表示连接
// 关系有类型（Type）和方向（Direction），也可以有属性
// ============================================================

// 人物之间的社交关系
CREATE (alice)-[:FRIENDS_WITH {since: 2020}]->(bob);
CREATE (alice)-[:FRIENDS_WITH {since: 2019}]->(charlie);
CREATE (bob)-[:FRIENDS_WITH {since: 2021}]->(diana);

// 人物与公司的雇佣关系
CREATE (alice)-[:WORKS_AT {role: "Engineer", since: 2021}]->(acme);
CREATE (bob)-[:WORKS_AT {role: "Manager", since: 2020}]->(beta);
CREATE (charlie)-[:WORKS_AT {role: "CTO", since: 2018}]->(acme);
CREATE (diana)-[:WORKS_AT {role: "Analyst", since: 2022}]->(beta);

// 人物掌握的技能
CREATE (alice)-[:KNOWS {level: "expert"}]->(py);
CREATE (alice)-[:KNOWS {level: "intermediate"}]->(ml);
CREATE (bob)-[:KNOWS {level: "expert"}]->(js);
CREATE (charlie)-[:KNOWS {level: "expert"}]->(py);
CREATE (charlie)-[:KNOWS {level: "expert"}]->(ml);
CREATE (diana)-[:KNOWS {level: "intermediate"}]->(js);

// ============================================================
// 3. 查询示例 — 展示图数据库的核心查询能力
//
// 以下查询展示了图数据库相比关系型数据库的核心优势：
// - 关系遍历（朋友的朋友）在 SQL 中需要递归 JOIN
// - 路径查询在 SQL 中几乎无法高效实现
// - 多跳关系在 Cypher 中只需要 [*N] 语法
// ============================================================

// 3.1 查询所有节点
// 业务场景：查看数据库中有什么数据
// 执行预期：显示所有节点和关系，Browser 会以图形方式展示
// MATCH (n) RETURN n;

// 3.2 查询所有人物
// 业务场景：用户列表页面
// 执行预期：显示 4 行结果，按姓名排序
// MATCH (p:Person) RETURN p.name, p.city ORDER BY p.name;

// 3.3 查询Alice的朋友
// 业务场景：社交平台的"好友列表"功能
// 执行预期：显示 Alice 的两个朋友——Bob（上海）和 Charlie（北京）
// 类比 SQL：SELECT friend.* FROM friends WHERE user_id = 'Alice'
// MATCH (alice:Person {name: "Alice"})-[:FRIENDS_WITH]->(friend)
// RETURN alice.name, friend.name, friend.city;

// 3.4 查询Alice的朋友中在Acme Corp工作的
// 业务场景：招聘场景——"帮我找出我朋友中在目标公司工作的人"
// 执行预期：显示 Charlie（北京），因为他是 Alice 的朋友且在 Acme Corp 工作
// 这个查询在 SQL 中需要 3 表 JOIN，在 Cypher 中只需要链式模式匹配
// MATCH (alice:Person {name: "Alice"})-[:FRIENDS_WITH]->(friend)-[:WORKS_AT]->(company:Company {name: "Acme Corp"})
// RETURN friend.name, friend.city;

// 3.5 查询Alice的间接朋友（朋友的朋友）
// 业务场景：社交平台的"可能认识的人"推荐
// 执行预期：显示 Diana（Alice → Bob → Diana）
// 注意：这里排除了 Alice 的直接朋友和 Alice 自己
// 类比 SQL：需要递归 JOIN 或自连接，非常复杂
// MATCH (alice:Person {name: "Alice"})-[:FRIENDS_WITH*2]->(fof)
// WHERE NOT (alice)-[:FRIENDS_WITH]->(fof) AND alice <> fof
// RETURN DISTINCT fof.name AS indirect_friend;

// 3.6 统计每个城市的人数
// 业务场景：运营看板——"我们的用户分布在哪些城市？"
// 执行预期：Beijing 2人，Shanghai 1人，Shenzhen 1人
// 类比 SQL：SELECT city, COUNT(*) FROM persons GROUP BY city
// MATCH (p:Person) RETURN p.city AS city, count(*) AS count ORDER BY count DESC;

// 3.7 查询掌握Python且是专家级别的人
// 业务场景：项目组找人——"我们需要一个 Python 专家"
// 执行预期：显示 Alice 和 Charlie（两人都是 Python 专家级别）
// 注意：这里同时过滤了关系属性（level: "expert"）和节点属性（name: "Python"）
// MATCH (p:Person)-[:KNOWS {level: "expert"}]->(s:Skill {name: "Python"})
// RETURN p.name, p.city;

// 3.8 查询Alice的完整社交网络（节点+关系）
// 业务场景：用户画像——"看看 Alice 的社交圈"
// 执行预期：Browser 以图形方式展示 Alice 的所有连接
// 注意：这里使用了无方向关系 (connected)，所以会显示 Alice 的所有关系
// MATCH (alice:Person {name: "Alice"})-[r:FRIENDS_WITH]-(connected)
// RETURN alice, r, connected;
