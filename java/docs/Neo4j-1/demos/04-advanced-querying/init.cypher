// ============================================================
// 第4章：高级查询 — 社交网络深度分析
// 展示路径查询、聚合、子查询、条件逻辑等高级特性
//
// 业务场景：一个社交平台需要分析用户之间的关系网络。
// 产品经理想知道：谁和谁认识？最短通过几个人认识？
// 谁最受欢迎？用户之间形成了哪些小圈子？
//
// 运行方式：
//   docker exec -it neo4j-advanced-query cypher-shell -u neo4j -p password123 -f /init.cypher
// 然后打开 http://localhost:7477 在 Browser 中执行查询
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建社交网络数据
//
// 数据说明：8 个用户分布在 3 个城市，通过 FOLLOWS 关系连接。
// weight 表示亲密度（1-10），since 表示关注起始年份。
// ============================================================

// 创建用户
// 业务场景：用户注册时填写个人信息和兴趣标签
// interests 是列表类型，一个用户可以有多项兴趣
CREATE (u1:User {name: "Alice", age: 30, city: "Beijing", interests: ["coding", "music", "hiking"]});
CREATE (u2:User {name: "Bob", age: 28, city: "Shanghai", interests: ["music", "gaming"]});
CREATE (u3:User {name: "Charlie", age: 35, city: "Beijing", interests: ["coding", "reading"]});
CREATE (u4:User {name: "Diana", age: 27, city: "Shenzhen", interests: ["hiking", "photography"]});
CREATE (u5:User {name: "Eve", age: 32, city: "Beijing", interests: ["coding", "gaming", "music"]});
CREATE (u6:User {name: "Frank", age: 29, city: "Shanghai", interests: ["reading", "photography"]});
CREATE (u7:User {name: "Grace", age: 31, city: "Shenzhen", interests: ["hiking", "music"]});
CREATE (u8:User {name: "Henry", age: 33, city: "Beijing", interests: ["coding", "reading", "hiking"]});

// 创建社交关系（带权重表示亲密度）
// 业务场景：用户关注另一个用户，weight 表示互动频率
// 权重越高表示关系越紧密（如经常互动、私信等）
CREATE (u1)-[:FOLLOWS {weight: 5, since: 2020}]->(u2);
CREATE (u1)-[:FOLLOWS {weight: 8, since: 2019}]->(u3);
CREATE (u1)-[:FOLLOWS {weight: 3, since: 2021}]->(u5);
CREATE (u2)-[:FOLLOWS {weight: 6, since: 2020}]->(u4);
CREATE (u2)-[:FOLLOWS {weight: 4, since: 2022}]->(u6);
CREATE (u3)-[:FOLLOWS {weight: 9, since: 2018}]->(u1);
CREATE (u3)-[:FOLLOWS {weight: 7, since: 2020}]->(u5);
CREATE (u3)-[:FOLLOWS {weight: 6, since: 2021}]->(u8);
CREATE (u4)-[:FOLLOWS {weight: 5, since: 2021}]->(u7);
CREATE (u5)-[:FOLLOWS {weight: 8, since: 2020}]->(u3);
CREATE (u5)-[:FOLLOWS {weight: 4, since: 2022}]->(u8);
CREATE (u6)-[:FOLLOWS {weight: 3, since: 2021}]->(u2);
CREATE (u7)-[:FOLLOWS {weight: 6, since: 2022}]->(u4);
CREATE (u8)-[:FOLLOWS {weight: 5, since: 2020}]->(u1);
CREATE (u8)-[:FOLLOWS {weight: 7, since: 2021}]->(u3);

// ============================================================
// 2. 路径查询
// ============================================================

// 2.1 变长路径：Alice的2度好友
// MATCH (alice:User {name: "Alice"})-[:FOLLOWS*2]->(fof:User)
// RETURN DISTINCT fof.name AS friend_of_friend;

// 2.2 变长路径（范围）：1到3度
// MATCH (alice:User {name: "Alice"})-[:FOLLOWS*1..3]->(connected:User)
// WHERE connected <> alice
// RETURN connected.name, length(connected) AS degree
// ORDER BY degree;

// 2.3 最短路径：Alice到Grace
// MATCH p = shortestPath((a:User {name: "Alice"})-[:FOLLOWS*]-(g:User {name: "Grace"}))
// RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps;

// 2.4 所有最短路径
// MATCH (a:User {name: "Alice"}), (g:User {name: "Grace"})
// MATCH p = allShortestPaths((a)-[:FOLLOWS*]-(g))
// RETURN [n IN nodes(p) | n.name] AS path, length(p) AS steps;

// ============================================================
// 3. 聚合与分组
// ============================================================

// 3.1 按城市统计用户数
// MATCH (u:User) RETURN u.city AS city, count(*) AS user_count ORDER BY user_count DESC;

// 3.2 统计每个用户的粉丝数
// MATCH (u:User)<-[:FOLLOWS]-(follower:User)
// RETURN u.name AS user, count(follower) AS followers
// ORDER BY followers DESC;

// 3.3 统计每个用户的平均关注权重
// MATCH (u:User)-[r:FOLLOWS]->()
// RETURN u.name AS user, avg(r.weight) AS avg_weight, sum(r.weight) AS total_weight
// ORDER BY avg_weight DESC;

// 3.4 使用 COLLECT 收集列表
// MATCH (u:User)-[:FOLLOWS]->(followed:User)
// RETURN u.name AS user, collect(followed.name) AS follows_list, count(followed) AS follow_count;

// 3.5 使用 WITH 进行管道聚合
// MATCH (u:User)-[:FOLLOWS]->(followed:User)
// WITH u, count(followed) AS follow_count
// WHERE follow_count >= 3
// RETURN u.name, follow_count;

// ============================================================
// 4. 子查询 (CALL { ... })
// ============================================================

// 4.1 子查询：找到每个城市中关注数最多的人
// CALL {
//     MATCH (u:User)<-[:FOLLOWS]-(follower)
//     RETURN u, count(follower) AS followers
// }
// WITH u, followers
// MATCH (u)-[:FOLLOWS]->(followed)
// RETURN u.name, followers, count(followed) AS following
// ORDER BY followers DESC;

// 4.2 子查询：找出共同关注者
// MATCH (a:User {name: "Alice"})-[:FOLLOWS]->(common)<-[:FOLLOWS]-(b:User {name: "Charlie"})
// RETURN common.name AS common_friend;

// ============================================================
// 5. 条件逻辑
// ============================================================

// 5.1 CASE 表达式
// MATCH (u:User)
// RETURN u.name,
//        CASE
//            WHEN u.age < 28 THEN "青年"
//            WHEN u.age < 32 THEN "中青年"
//            ELSE "中年"
//        END AS age_group;

// 5.2 coalesce 空值处理
// MATCH (u:User)
// RETURN u.name, coalesce(u.interests, ["unknown"]) AS interests;

// ============================================================
// 6. 高级模式匹配
// ============================================================

// 6.1 OPTIONAL MATCH：即使没有匹配也返回
// MATCH (u:User)
// OPTIONAL MATCH (u)-[:FOLLOWS]->(followed:User)
// RETURN u.name, collect(followed.name) AS follows;

// 6.2 排除模式：没有关注任何人的用户
// MATCH (u:User)
// WHERE NOT EXISTS { (u)-[:FOLLOWS]->() }
// RETURN u.name AS isolated_user;

// 6.3 三角关系检测（相互关注）
// MATCH (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(c:User)
// WHERE (c)-[:FOLLOWS]->(a)
// RETURN a.name, b.name, c.name;

// ============================================================
// 7. 分页与排序
// ============================================================

// 7.1 分页查询（第2页，每页3条）
// MATCH (u:User)
// RETURN u.name, u.age
// ORDER BY u.age DESC
// SKIP 3 LIMIT 3;

// 7.2 按兴趣标签搜索
// MATCH (u:User)
// WHERE "coding" IN u.interests
// RETURN u.name, u.interests;
