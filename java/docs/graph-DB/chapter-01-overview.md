# 第1章 图数据库概述

## 1.1 为什么需要图数据库

### 1.1.1 解决的问题

传统关系型数据库（RDBMS）统治软件工程四十余年，但在处理**高度关联数据**时暴露出三个根本性缺陷。

**N+1 查询问题**：在关系型数据库中，查询一个实体的关联关系需要多次往返。例如查询"用户的好友最近发布的文章"，在 SQL 中需要先查用户、再查好友列表、再查每人的文章：

```sql
-- 第1步：查用户
SELECT id FROM users WHERE name = '张三';
-- 第2步：查好友
SELECT friend_id FROM friendships WHERE user_id = 1;
-- 第3步：对每个好友查文章（N次查询）
SELECT * FROM posts WHERE author_id IN (2, 3, 5, 7, 11);
```

当关联深度增加时（如"好友的好友推荐的商品"），SQL 查询的 JOIN 层数呈指数增长，性能急剧下降。

**JOIN 爆炸**：多对多关系在关系型数据库中必须通过中间表实现。一个社交网络中的"用户-群组-标签-帖子-评论"五层关系，需要 4 张中间表和 5 次 JOIN。当数据量达到千万级时，JOIN 操作的代价使实时查询变得不可行。

**Schema 刚性**：关系型数据库要求预先定义表结构。在知识图谱或推荐系统场景中，实体类型和关系类型频繁变化，ALTER TABLE 操作在大表上代价极高，且会导致应用停机。

### 1.1.2 核心原理

图数据库的核心思想是**将关联作为一等公民**。在关系型数据库中，关系通过外键和 JOIN 隐式表达；在图数据库中，关系（边）与实体（顶点）同等存储，每个边可以携带属性，查询时通过指针遍历而非计算匹配。

这种"免索引邻接"（index-free adjacency）架构使得图遍历的复杂度仅与**子图大小**相关，而非**全图大小**。对于深度为 k 的遍历，关系型数据库的代价为 O(n^k)（笛卡尔积），而图数据库为 O(d^k)（d 为平均度数），当 n >> d 时差距巨大。

### 1.1.3 代码/配置实现

以下 Java 代码演示了使用 JDBC 在关系型数据库中查询"好友的好友"的典型实现，以及与 Neo4j Cypher 的对比：

```java
// 关系型数据库实现 —— N+1 问题
public List<User> getFriendsOfFriends(Connection conn, long userId) throws SQLException {
    // 1. 查直接好友
    String sql = "SELECT friend_id FROM friendships WHERE user_id = ?";
    PreparedStatement ps = conn.prepareStatement(sql);
    ps.setLong(1, userId);
    ResultSet rs = ps.executeQuery();
    
    List<Long> friendIds = new ArrayList<>();
    while (rs.next()) {
        friendIds.add(rs.getLong("friend_id"));
    }
    
    // 2. 对每个好友查其好友 —— N 次查询
    Set<Long> resultIds = new HashSet<>();
    for (Long friendId : friendIds) {
        ps = conn.prepareStatement(sql);
        ps.setLong(1, friendId);
        rs = ps.executeQuery();
        while (rs.next()) {
            long fofId = rs.getLong("friend_id");
            if (fofId != userId) {
                resultIds.add(fofId);
            }
        }
    }
    
    // 3. 批量查用户信息
    if (resultIds.isEmpty()) return Collections.emptyList();
    String placeholders = resultIds.stream()
        .map(id -> "?")
        .collect(Collectors.joining(","));
    ps = conn.prepareStatement(
        "SELECT id, name FROM users WHERE id IN (" + placeholders + ")");
    int i = 0;
    for (Long id : resultIds) {
        ps.setLong(++i, id);
    }
    rs = ps.executeQuery();
    
    List<User> result = new ArrayList<>();
    while (rs.next()) {
        result.add(new User(rs.getLong("id"), rs.getString("name")));
    }
    return result;
}
```

```java
// Neo4j 图数据库实现 —— 一次查询
// 使用 Neo4j Java Driver
public List<User> getFriendsOfFriends(Session session, String userName) {
    String cypher = """
        MATCH (u:User {name: $name})-[:FRIENDS_WITH]->(f:User)-[:FRIENDS_WITH]->(fof:User)
        WHERE fof <> u
        RETURN DISTINCT fof.id AS id, fof.name AS name
        """;
    
    Result result = session.run(cypher, Values.parameters("name", userName));
    List<User> users = new ArrayList<>();
    while (result.hasNext()) {
        Record record = result.next();
        users.add(new User(
            record.get("id").asLong(),
            record.get("name").asString()
        ));
    }
    return users;
}
```

### 1.1.4 使用场景

- **社交网络**：好友关系、关注链、影响力传播路径
- **推荐引擎**：用户-物品-标签的关联路径挖掘
- **欺诈检测**：异常环检测、团伙识别、资金链路追踪
- **知识图谱**：实体间多跳推理、语义搜索
- **网络与 IT 运维**：拓扑发现、故障根因分析、依赖关系图

### 1.1.5 潜在风险与注意事项

- 图数据库并非银弹。对于**纯事务型**场景（如订单系统、账户余额更新），关系型数据库的 ACID 保证和成熟度远优于图数据库。
- 图数据库的**批量分析**能力弱于专门的大数据引擎（如 Spark GraphX）。OLAP 风格的全局图分析应使用专用引擎。
- 图数据库的**生态系统**（监控、备份、迁移工具）远不如关系型数据库成熟，选型时需评估运维成本。

### 1.1.6 本章小结

图数据库解决了关系型数据库在关联数据查询中的 N+1 问题和 JOIN 爆炸，核心优势在于免索引邻接架构。但它不是万能的，适用于关联密集型场景，不适用于简单 CRUD 和批量分析。

---

## 1.2 图数据库 vs 关系型数据库 vs NoSQL

### 1.2.1 解决的问题

工程师在技术选型时经常面临"该用哪种数据库"的困惑。每种数据库都有其设计哲学和最优场景，理解它们的本质差异是做出正确选择的前提。

### 1.2.2 核心原理对比

| 维度 | 关系型数据库 (RDBMS) | 文档型 NoSQL (MongoDB) | 键值型 NoSQL (Redis) | 列族型 NoSQL (HBase) | 图数据库 (Neo4j) |
|---|---|---|---|---|---|
| **数据模型** | 表 + 行 + 列，外键关联 | JSON/BSON 文档，嵌套 | 键值对 | 列族 + 行键 | 顶点 + 边 + 属性 |
| **关系表达** | 外键 + JOIN | 引用/嵌入，$lookup | 无原生关系 | 无原生关系 | 边是一等公民 |
| **查询语言** | SQL | MQL (聚合管道) | 命令式 API | HBase Shell / Java API | Cypher / Gremlin / SPARQL |
| **查询模式** | 投影 + 过滤 + JOIN | 投影 + 过滤 + 聚合 | 点查 + 范围查 | 点查 + 扫描 | 图遍历 + 模式匹配 |
| **深度关联查询** | 性能差（多 JOIN） | 差（$lookup 嵌套） | 不支持 | 不支持 | 原生高效 |
| **Schema** | 严格 Schema | 灵活 Schema | 无 Schema | 宽表 Schema | 灵活 Schema（属性图） |
| **ACID** | 强 ACID | 单文档 ACID | 部分 | 行级 | 完全 ACID（Neo4j） |
| **水平扩展** | 难（主从/分片复杂） | 易（原生分片） | 易（集群模式） | 易（HBase 设计） | 中等（企业版支持集群） |
| **一致性** | 强一致 | 最终一致（可调） | 强一致（单机） | 最终一致 | 强一致（因果一致） |
| **典型场景** | ERP、财务、订单 | 内容管理、日志 | 缓存、会话、计数 | 时序、大数据 | 社交、推荐、风控、知识图谱 |

### 1.2.3 代码/配置实现

同一查询"查找购买了商品 A 的用户中，哪些也购买了商品 B"在三种数据库中的实现对比：

```java
// ===== 关系型数据库：3 表 JOIN =====
String sql = """
    SELECT DISTINCT u.id, u.name
    FROM users u
    JOIN orders o1 ON u.id = o1.user_id
    JOIN order_items oi1 ON o1.id = oi1.order_id AND oi1.product_id = 'A'
    JOIN orders o2 ON u.id = o2.user_id
    JOIN order_items oi2 ON o2.id = oi2.order_id AND oi2.product_id = 'B'
    """;
// 5 表 JOIN，百万级数据时性能急剧下降

// ===== MongoDB：两次查询 + 应用层聚合 =====
// 第1步：查买了 A 的用户
db.orders.aggregate([
    { $match: { "items.product_id": "A" } },
    { $group: { _id: "$user_id" } }
]);
// 第2步：查这些用户中买了 B 的
db.orders.aggregate([
    { $match: { "items.product_id": "B", user_id: { $in: userIds } } },
    { $group: { _id: "$user_id" } }
]);
// 应用层做交集 —— 数据量大时内存爆炸

// ===== 图数据库：一次遍历 =====
String cypher = """
    MATCH (u:User)-[:PURCHASED]->(p1:Product {id: 'A'})
    WHERE (u)-[:PURCHASED]->(:Product {id: 'B'})
    RETURN u.id, u.name
    """;
// 一次查询，毫秒级返回
```

### 1.2.4 使用场景

| 场景 | 推荐数据库 | 原因 |
|---|---|---|
| 电商订单 + 库存 | PostgreSQL / MySQL | 强 ACID，复杂事务 |
| 用户行为日志 | MongoDB / Elasticsearch | 写吞吐高，Schema 灵活 |
| 社交 Feed 流 | Redis / Cassandra | 低延迟，高并发 |
| 好友推荐 / 风控 | Neo4j / NebulaGraph | 深度关联查询 |
| 全局图分析 | Spark GraphX / Flink Gelly | 分布式批处理 |

### 1.2.5 潜在风险与注意事项

- **混合架构是常态**：生产系统中很少只用一种数据库。典型模式是 RDBMS 做主存储 + 图数据库做关联查询 + Redis 做缓存。数据一致性需要在应用层保证。
- **图数据库不适合做源系统**：图数据库通常作为查询层而非记录系统（System of Record）。核心业务数据仍应存储在 RDBMS 中，通过 CDC 或事件驱动同步到图数据库。
- **NoSQL 不等于图数据库**：很多 NoSQL 数据库（MongoDB、Cassandra）不支持原生图遍历，用它们模拟图查询会导致性能灾难。

### 1.2.6 本章小结

关系型数据库适合结构化事务，NoSQL 适合高吞吐键值/文档场景，图数据库专精关联查询。三者不是替代关系，而是互补关系。成熟的架构通常采用多数据库混合策略。

---

## 1.3 图数据库的历史与演进

### 1.3.1 解决的问题

理解图数据库的发展历程，有助于判断其技术成熟度和未来方向，避免在选型时被营销话术误导。

### 1.3.2 核心原理

图数据库的发展经历了四个阶段：

**第一阶段：学术起源（1960s-1990s）**
- 1968 年：IBM 的 IMS 层次数据库，本质上是树形图
- 1976 年：CODASYL 网络模型，支持有向图，但查询复杂
- 1980s：关系模型兴起，图模型被边缘化
- 关键洞察：CODASYL 的指针遍历思想是"免索引邻接"的前身

**第二阶段：图理论应用（2000s）**
- Google 的 PageRank 算法（1998）证明了图计算在搜索中的价值
- 社交网络（Facebook 2004、Twitter 2006）催生了大规模图数据需求
- 2000 年：Neo4j 项目启动（最初是创业公司的内部项目）
- 2007 年：Neo4j 第一个开源版本发布，成为最早的通用图数据库

**第三阶段：商业化与标准化（2010s）**
- 2010 年：Neo4j 推出 Cypher 查询语言
- 2011 年：Apache TinkerPop / Gremlin 图遍历语言发布
- 2012 年：Amazon Neptune 开始内部开发
- 2015 年：ArangoDB 发布多模型支持（文档 + 图 + 键值）
- 2016 年：JanusGraph 从 TitanDB 分叉
- 2017 年：Dgraph 发布，基于 Badger 存储引擎
- 2018 年：NebulaGraph 项目启动，定位大规模分布式图数据库

**第四阶段：云原生与标准化（2020s）**
- 2020 年：Neo4j AuraDB 云服务发布
- 2021 年：GQL（Graph Query Language）成为 ISO 标准项目
- 2022 年：NebulaGraph v3.0 发布，支持存储计算分离
- 2023 年：GQL 标准草案进入最终投票阶段
- 2024 年：图数据库 + AI/大模型的结合成为热点（GraphRAG）

### 1.3.3 代码/配置实现

图查询语言的演进：

```java
// 2000s：Neo4j 早期 Java API —— 命令式遍历
Node alice = graphDb.createNode(Label.label("User"));
alice.setProperty("name", "Alice");
Node bob = graphDb.createNode(Label.label("User"));
bob.setProperty("name", "Bob");
Relationship rel = alice.createRelationshipTo(bob, 
    RelationshipType.withName("FRIENDS_WITH"));

// 遍历 API
for (Path path : Traversal.description()
        .depthFirst()
        .relationships(RelationshipType.withName("FRIENDS_WITH"))
        .traverse(alice)) {
    System.out.println(path.endNode().getProperty("name"));
}

// 2010s：Cypher 声明式查询
String cypher = "MATCH (a:User {name: 'Alice'})-[:FRIENDS_WITH*1..3]->(f) RETURN f";

// 2020s：GQL 标准（语法接近 Cypher）
String gql = "MATCH (a:User WHERE a.name = 'Alice')-[f:IS_FRIEND]->(b:User) RETURN b";
```

### 1.3.4 使用场景

- **技术选型参考**：了解各数据库的诞生背景，判断其设计取舍
- **迁移规划**：从老一代图数据库（如 TitanDB）迁移到活跃维护的替代品
- **标准合规**：关注 GQL 标准进展，选择支持标准查询语言的数据库

### 1.3.5 潜在风险与注意事项

- **开源项目的存活风险**：TitanDB（2014 年停止维护）、OrientDB（2022 年公司被收购）等案例表明，图数据库领域的项目更替风险高于 RDBMS。选型时应评估社区活跃度和商业支持。
- **标准尚未统一**：虽然 GQL 正在标准化，但主流图数据库仍使用不同的查询语言（Cypher、Gremlin、nGQL、DgraphQL），迁移成本高。
- **云厂商锁定**：Amazon Neptune、Azure Cosmos DB（图 API）等云服务使用专有实现，迁移到自建方案时可能遇到兼容性问题。

### 1.3.6 本章小结

图数据库从学术概念到商业化经历了 50 年。Neo4j 开创了现代图数据库品类，2010s 涌现了多种分布式方案，2020s 进入云原生和标准化阶段。选型时需关注项目活跃度、查询语言兼容性和云锁定风险。

---

## 1.4 主流图数据库对比

### 1.4.1 解决的问题

市场上图数据库种类繁多，架构差异巨大。工程师需要从架构设计、查询语言、扩展能力、许可证等维度进行系统对比，才能做出合理的技术选型。

### 1.4.2 核心原理

| 特性 | Neo4j | JanusGraph | NebulaGraph | Dgraph | ArangoDB | Amazon Neptune |
|---|---|---|---|---|---|---|
| **架构** | 原生图存储 | 后端存储插件化 | 存储计算分离 | 原生 Go 实现 | 多模型引擎 | 云托管 |
| **存储引擎** | 自研 Native Store | HBase / Cassandra / BerkeleyDB | 自研 kvstore | Badger（自研 LSM-Tree） | 自研 RocksDB 封装 | 自研（AWS 内部） |
| **查询语言** | Cypher | Gremlin | nGQL（类 Cypher） | DgraphQL（GraphQL ±） | AQL | SPARQL / Gremlin |
| **事务支持** | ACID（完全） | 取决于后端 | 单分区 ACID | ACID（可序列化快照隔离） | ACID（单集合） | ACID |
| **水平扩展** | 企业版集群（读扩展） | 原生支持（后端决定） | 原生支持（一致性 Hash） | 原生支持（Raft 分片） | 支持（分片 + 复制） | 托管自动扩展 |
| **高可用** | 企业版 Causal Cluster | 后端决定 | Raft 共识 | Raft 共识 | 主从复制 | 多 AZ 部署 |
| **许可证** | GPL v3 / 企业版商业 | Apache 2.0 | Apache 2.0（核心开源） | Apache 2.0 / Dgraph Cloud | Apache 2.0 | 商业（AWS） |
| **部署方式** | 自建 / AuraDB 云 | 自建 | 自建 / Nebula Cloud | 自建 / Dgraph Cloud | 自建 / ArangoDB Cloud | AWS 云 |
| **社区活跃度** | 极高 | 中 | 高（中国社区活跃） | 中 | 中高 | N/A（闭源） |
| **OLTP vs OLAP** | OLTP 优先 | OLTP | OLTP | OLTP | OLTP | OLTP |
| **最大规模** | 百亿节点（企业版） | 千亿（HBase 后端） | 千亿节点 | 百亿 | 百亿 | 百亿 |

### 1.4.3 代码/配置实现

各数据库的 Java 客户端连接示例：

```java
// ===== Neo4j Java Driver =====
// Maven: org.neo4j.driver:neo4j-java-driver:5.x
Driver neo4jDriver = GraphDatabase.driver(
    "bolt://localhost:7687", 
    AuthTokens.basic("neo4j", "password"));
try (Session session = neo4jDriver.session()) {
    Result result = session.run("MATCH (n) RETURN count(n) AS cnt");
    System.out.println(result.single().get("cnt").asLong());
}

// ===== JanusGraph Java Client =====
// Maven: org.janusgraph:janusgraph-core:1.x
JanusGraph janusGraph = JanusGraphFactory.build()
    .set("storage.backend", "cassandra")
    .set("storage.hostname", "127.0.0.1")
    .open();
GraphTraversalSource g = janusGraph.traversal();
long count = g.V().count().next();
System.out.println(count);

// ===== NebulaGraph Java Client =====
// Maven: com.vesoft:nebula-client:3.x
MetaClient metaClient = new MetaClient("127.0.0.1", 9559);
metaClient.connect();
StorageClient storageClient = new StorageClient(metaClient);
// 使用 nGQL 查询
String ngql = "MATCH (n) RETURN count(*) AS cnt";
ResultSet rs = storageClient.execute(ngql);
System.out.println(rs.getRows().size());

// ===== Dgraph Java Client =====
// Maven: io.dgraph:dgraph4j:21.x
DgraphClient dgraphClient = new DgraphClient(
    DgraphClient.newCloudClient("https://xxx.grpc.dgraph.io", 
        "api-key"));
String query = "{ count(func: has(name)) { totalCount } }";
Response res = dgraphClient.newTransaction().query(query);
System.out.println(res.getJson());

// ===== ArangoDB Java Driver =====
// Maven: com.arangodb:arangodb-java-driver:7.x
ArangoDB arangoDB = new ArangoDB.Builder()
    .host("127.0.0.1", 8529)
    .user("root")
    .password("password")
    .build();
ArangoDatabase db = arangoDB.db("mydb");
String aql = "FOR v IN 1..3 OUTBOUND 'users/alice' GRAPH 'social' RETURN v";
ArangoCursor<BaseDocument> cursor = db.query(aql, BaseDocument.class);
cursor.forEach(doc -> System.out.println(doc.getKey()));
```

### 1.4.4 使用场景

| 场景 | 推荐方案 | 理由 |
|---|---|---|
| 企业级知识图谱 | Neo4j | 生态最成熟，Cypher 易用，ACID 保证 |
| 超大规模社交网络 | NebulaGraph / JanusGraph | 原生分布式，千亿级扩展 |
| 多模型需求（文档+图） | ArangoDB | 一套系统两种模型，降低运维复杂度 |
| AWS 云原生 | Amazon Neptune | 托管免运维，与 AWS 服务集成 |
| 实时推荐 + 低延迟 | Dgraph | GraphQL ± 查询，Go 实现性能好 |
| 开源合规优先 | JanusGraph / NebulaGraph | Apache 2.0 许可证，无商业限制 |

### 1.4.5 潜在风险与注意事项

- **Neo4j 企业版成本**：Neo4j 企业版按 CPU 核数收费，大规模部署时许可证成本可能超过硬件成本。社区版只有单机模式，无法水平扩展。
- **JanusGraph 运维复杂度**：JanusGraph 依赖外部存储后端（HBase/Cassandra）和索引后端（Elasticsearch），部署和运维复杂度远高于一体化的 Neo4j。
- **NebulaGraph 社区生态**：虽然性能优秀，但周边工具（监控、备份、数据迁移）不如 Neo4j 成熟，中文文档质量高于英文。
- **Dgraph 的 GraphQL ± 学习成本**：DgraphQL 不是标准 GraphQL，团队需要额外学习。且 Dgraph 的 ACID 隔离级别是可序列化快照隔离，与可序列化不同。
- **ArangoDB 图性能**：作为多模型数据库，ArangoDB 的图遍历性能在深度查询（5+ 跳）时不如原生图数据库。
- **Neptune 厂商锁定**：Neptune 是 AWS 专有服务，不支持自建部署。迁移到其他平台需要重写数据导入和查询逻辑。

### 1.4.6 本章小结

选型时需权衡：Neo4j 生态最成熟但扩展受限，NebulaGraph/JanusGraph 适合超大规模但运维复杂，Dgraph 性能优秀但查询语言非标准，ArangoDB 多模型灵活但图性能有折中，Neptune 托管省心但厂商锁定。没有"最好"的图数据库，只有"最适合"的。

---

## 1.5 核心应用场景

### 1.5.1 解决的问题

图数据库的价值体现在具体业务场景中。理解各场景的图模型设计模式和查询模式，是落地图数据库的关键。

### 1.5.2 核心原理

#### 社交网络

社交网络是图数据库最经典的应用。用户、内容、互动构成天然的多部图。

```java
// 社交网络图模型 —— 好友推荐（共同好友数）
String cypher = """
    MATCH (me:User {id: $userId})-[:FRIENDS_WITH]->(friend:User)-[:FRIENDS_WITH]->(fof:User)
    WHERE NOT (me)-[:FRIENDS_WITH]->(fof) AND me <> fof
    RETURN fof.id AS recommendedId, fof.name AS name, count(*) AS commonFriends
    ORDER BY commonFriends DESC
    LIMIT 20
    """;

// 社交网络图模型 —— 影响力传播路径
String cypher = """
    MATCH path = shortestPath(
        (a:User {id: $sourceId})-[:FRIENDS_WITH|FOLLOWS*..6]-(b:User {id: $targetId})
    )
    RETURN [node IN nodes(path) | node.name] AS path
    """;
```

#### 推荐引擎

基于图结构的协同过滤比传统矩阵分解更直观，且天然支持冷启动。

```java
// 基于图结构的"买了 A 的人也买了 B"推荐
String cypher = """
    MATCH (target:Product {id: $productId})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(other:Product)
    WHERE other.id <> $productId
    RETURN other.id AS productId, other.name AS name, count(DISTINCT u) AS buyerCount
    ORDER BY buyerCount DESC
    LIMIT 10
    """;

// 基于标签的个性化推荐
String cypher = """
    MATCH (u:User {id: $userId})-[:INTERESTED_IN]->(tag:Tag)
    MATCH (p:Product)-[:HAS_TAG]->(tag)
    WHERE NOT (u)-[:PURCHASED|VIEWED]->(p)
    RETURN p.id AS productId, p.name AS name, count(tag) AS relevanceScore
    ORDER BY relevanceScore DESC
    LIMIT 20
    """;
```

#### 欺诈检测

欺诈检测是图数据库 ROI 最高的场景之一。欺诈团伙通常形成特定的图结构模式（环、星型、密集子图）。

```java
// 检测资金循环（洗钱模式）
String cypher = """
    MATCH (a:Account)-[:TRANSFER_TO]->(b:Account)-[:TRANSFER_TO]->(c:Account)-[:TRANSFER_TO]->(a)
    WHERE a.id <> b.id AND b.id <> c.id
    AND a.amount > 10000 AND b.amount > 10000 AND c.amount > 10000
    RETURN a.id AS accountA, b.id AS accountB, c.id AS accountC,
           a.amount + b.amount + c.amount AS totalAmount
    """;

// 检测团伙欺诈（共享设备/IP 的多个账户）
String cypher = """
    MATCH (device:Device {fingerprint: $deviceFp})<-[:USED_BY]-(a:Account)
    MATCH (a)-[:APPLIED_FOR]->(loan:Loan)
    WHERE loan.status = 'APPROVED'
    WITH a, count(loan) AS loanCount
    WHERE loanCount > 3
    RETURN a.id AS accountId, loanCount
    """;
```

#### 知识图谱

知识图谱将异构数据整合为统一的语义网络，支持多跳推理。

```java
// 知识图谱查询：查找"与某药物有相同靶点的其他药物"
String cypher = """
    MATCH (drug:Drug {name: $drugName})-[:TARGETS]->(gene:Gene)
    MATCH (other:Drug)-[:TARGETS]->(gene)
    WHERE other.name <> $drugName
    RETURN other.name AS similarDrug, 
           collect(gene.name) AS sharedTargets,
           count(gene) AS overlapCount
    ORDER BY overlapCount DESC
    """;

// 知识图谱推理：查找"某疾病的潜在药物靶点"
String cypher = """
    MATCH (d:Disease {name: $diseaseName})-[:ASSOCIATED_WITH]->(gene:Gene)
    MATCH (gene)-[:PART_OF_PATHWAY]->(pathway:Pathway)
    MATCH (drug:Drug)-[:MODULATES]->(pathway)
    WHERE NOT (drug)-[:INDICATED_FOR]->(d)
    RETURN drug.name AS candidateDrug, pathway.name AS pathway,
           collect(gene.name) AS genes
    """;
```

#### 网络与 IT 运维

拓扑发现和故障根因分析是图数据库在运维领域的典型应用。

```java
// 故障根因分析：查找所有受某交换机故障影响的服务
String cypher = """
    MATCH (switch:NetworkDevice {id: $switchId, status: 'DOWN'})
    MATCH (switch)-[:CONNECTS_TO]->(server:Server)
    MATCH (server)-[:HOSTS]->(service:Service)
    MATCH (service)-[:DEPENDS_ON]->(dependent:Service)
    RETURN switch.id AS rootCause,
           collect(DISTINCT server.name) AS affectedServers,
           collect(DISTINCT dependent.name) AS affectedServices
    """;
```

### 1.5.3 代码/配置实现

```java
// 生产级欺诈检测系统 —— 实时图查询 + 批处理图分析
@Component
public class FraudDetectionService {
    
    private final Driver neo4jDriver;
    private final SparkSession spark;
    
    public FraudDetectionService(Driver neo4jDriver, SparkSession spark) {
        this.neo4jDriver = neo4jDriver;
        this.spark = spark;
    }
    
    // 实时检测：单笔交易风险评分
    public FraudScore evaluateTransaction(Transaction tx) {
        try (Session session = neo4jDriver.session()) {
            String cypher = """
                MATCH (sender:Account {id: $senderId})
                OPTIONAL MATCH (sender)-[:TRANSFER_TO*1..3]->(cycle:Account)
                WHERE (cycle)-[:TRANSFER_TO]->(sender)
                WITH sender, count(DISTINCT cycle) AS cycleCount
                OPTIONAL MATCH (sender)-[:TRANSFER_TO]->(receiver:Account {id: $receiverId})
                OPTIONAL MATCH (sender)-[:SHARED_DEVICE_WITH]->(fraud:Account)
                    WHERE fraud.riskLevel > 0.8
                RETURN sender.balance AS balance,
                       cycleCount,
                       CASE WHEN receiver IS NOT NULL THEN 1 ELSE 0 END AS isRepeatRecipient,
                       count(DISTINCT fraud) AS highRiskAssociates
                """;
            
            Result result = session.run(cypher, Values.parameters(
                "senderId", tx.getSenderId(),
                "receiverId", tx.getReceiverId()
            ));
            
            Record record = result.single();
            double score = calculateRiskScore(
                record.get("balance").asDouble(),
                record.get("cycleCount").asInt(),
                record.get("isRepeatRecipient").asInt(),
                record.get("highRiskAssociates").asInt()
            );
            return new FraudScore(tx.getId(), score, score > 0.7);
        }
    }
    
    // 批处理：全图异常检测（PageRank + 社区发现）
    public Dataset<Row> detectFraudCommunities() {
        Dataset<Row> edges = spark.read()
            .format("org.neo4j.spark.DataSource")
            .option("url", "bolt://localhost:7687")
            .option("query", "MATCH (a:Account)-[t:TRANSFER_TO]->(b:Account) RETURN a.id AS src, b.id AS dst, t.amount AS weight")
            .load();
        
        GraphFrame graph = GraphFrame.fromEdges(edges);
        
        // PageRank 识别重要节点
        Dataset<Row> pageRank = graph.pageRank().resetProbability(0.15).run();
        
        // 标签传播发现社区
        Dataset<Row> communities = graph.labelPropagation().maxIter(10).run();
        
        return communities.join(pageRank, "id")
            .filter("pagerank > 1.0")
            .orderBy(col("pagerank").desc());
    }
    
    private double calculateRiskScore(double balance, int cycles, 
                                       int repeatRecipient, int fraudAssociates) {
        double score = 0.0;
        if (cycles > 0) score += 0.4;          // 资金循环嫌疑
        if (fraudAssociates > 2) score += 0.3; // 高风险关联
        if (repeatRecipient == 0) score += 0.1; // 新收款方
        if (balance < 1000) score += 0.2;       // 余额异常
        return Math.min(score, 1.0);
    }
}
```

### 1.5.4 使用场景

| 场景 | 图模型关键元素 | 典型查询模式 | 业务价值 |
|---|---|---|---|
| 社交网络 | User, Post, Group, FRIENDS_WITH, LIKES | 好友推荐、路径发现、影响力传播 | 用户增长、留存提升 |
| 推荐引擎 | User, Product, Tag, PURCHASED, VIEWED | 协同过滤、标签传播 | 转化率提升 10-30% |
| 欺诈检测 | Account, Device, IP, TRANSFER_TO, USED_BY | 环检测、社区发现、异常子图 | 减少欺诈损失 50%+ |
| 知识图谱 | Entity, Relation, Concept, IS_A, RELATED_TO | 多跳推理、语义搜索 | 数据价值挖掘 |
| IT 运维 | Server, Service, Switch, HOSTS, DEPENDS_ON | 根因分析、拓扑发现 | MTTR 缩短 60% |
| 生命科学 | Gene, Drug, Disease, TARGETS, ASSOCIATED_WITH | 药物重定位、靶点发现 | 研发效率提升 |

### 1.5.5 潜在风险与注意事项

- **社交网络的写放大**：社交关系变更（加好友/取关）需要更新图索引，写入放大系数可达 3-5 倍。高频写入场景需评估图数据库的写入吞吐。
- **推荐系统的实时性**：图遍历在 3 跳以内性能极好，超过 5 跳时延迟显著增加。实时推荐应限制遍历深度，或使用预计算。
- **欺诈检测的误报率**：图特征（如环检测）可能产生大量误报。需要结合规则引擎和机器学习模型做二次过滤。
- **知识图谱的数据质量**：实体对齐和关系抽取的准确率直接影响查询结果。Garbage in, garbage out。
- **IT 运维的图规模**：大型企业的 IT 拓扑可能包含百万级节点和千万级边，需要评估图数据库的存储和查询性能。

### 1.5.6 本章小结

图数据库在社交网络、推荐、风控、知识图谱、IT 运维和生命科学六大场景中展现了显著价值。核心模式是利用图遍历和社区发现算法挖掘关联关系。但每个场景都有其特定的工程挑战，需要结合业务特点做针对性优化。

---

## 1.6 图数据库中的 ACID vs BASE

### 1.6.1 解决的问题

图数据库横跨 OLTP 和 OLAP 两个世界。用户需要理解不同图数据库在一致性和可用性之间的取舍，才能做出符合业务需求的选型。

### 1.6.2 核心原理

**ACID 模型**（Neo4j、Amazon Neptune）：
- **原子性**：事务中的所有操作要么全部成功，要么全部回滚
- **一致性**：事务前后数据满足所有约束
- **隔离性**：并发事务互不干扰
- **持久性**：提交的事务永久保存

**BASE 模型**（分布式图数据库）：
- **Basically Available**：系统保证基本可用
- **Soft State**：状态可能随时间变化
- **Eventual Consistency**：最终达到一致

图数据库的一致性模型分布：

```
强一致 (Strong)         因果一致 (Causal)        最终一致 (Eventual)
    │                        │                        │
    │                        │                        │
Neo4j (单机)            Neo4j Causal Cluster     JanusGraph (HBase)
Neptune (单区域)        Dgraph (Raft)            JanusGraph (Cassandra)
                        NebulaGraph (Raft)       ArangoDB (异步复制)
```

**CAP 定理在图数据库中的体现**：

| 数据库 | 分区容忍 (P) | 一致性 (C) | 可用性 (A) | 说明 |
|---|---|---|---|---|
| Neo4j 单机 | 否 | 是 | 是 | 非分布式，不涉及 P |
| Neo4j 集群 | 是 | 是（因果） | 是（写主读从） | 写主节点故障时不可写 |
| NebulaGraph | 是 | 是（Raft） | 是 | Raft 多数派可用 |
| Dgraph | 是 | 是（可序列化快照） | 是 | Raft 多数派可用 |
| JanusGraph + HBase | 是 | 是 | 是 | HBase 强一致 |
| JanusGraph + Cassandra | 是 | 否（最终一致） | 是 | Cassandra 最终一致 |

### 1.6.3 代码/配置实现

```java
// Neo4j ACID 事务 —— 显式事务管理
public void transferMoney(Driver driver, String fromId, String toId, BigDecimal amount) {
    try (Session session = driver.session()) {
        // 默认自动提交事务
        session.executeWrite(tx -> {
            // 检查余额
            Result check = tx.run(
                "MATCH (a:Account {id: $id}) RETURN a.balance AS balance",
                Values.parameters("id", fromId)
            );
            double balance = check.single().get("balance").asDouble();
            if (balance < amount.doubleValue()) {
                throw new RuntimeException("余额不足");
            }
            
            // 扣款 + 入账（原子操作）
            tx.run("""
                MATCH (from:Account {id: $fromId})
                MATCH (to:Account {id: $toId})
                SET from.balance = from.balance - $amount
                SET to.balance = to.balance + $amount
                CREATE (from)-[:TRANSFER {amount: $amount, time: timestamp()}]->(to)
                """, 
                Values.parameters("fromId", fromId, "toId", toId, "amount", amount.doubleValue())
            );
            return null;
        });
    }
    // 事务自动提交或回滚
}

// NebulaGraph —— 单分区内 ACID
public void updateVertex(Session session, String vertexId, Map<String, Object> props) {
    // NebulaGraph 的单分区操作是原子的
    String ngql = "UPDATE VERTEX ON player " + vertexId + " SET age = 35";
    ExecuteResponse resp = session.execute(ngql);
    if (!resp.isSucceeded()) {
        throw new RuntimeException("更新失败: " + resp.getErrorMsg());
    }
}

// Dgraph —— 可序列化快照隔离
public void upsertWithConflictCheck(DgraphClient client, String uid, String name) {
    Txn txn = client.newTransaction();
    try {
        String query = String.format(
            "{ user(func: uid(%s)) { uid name } }", uid);
        Response res = txn.query(query);
        // 修改并提交 —— 如果并发冲突，Dgraph 自动重试
        Mutation mu = Mutation.newBuilder()
            .setSetNquads(
                String.format("<%s> <name> \"%s\" .", uid, name))
            .build();
        txn.mutate(mu);
        txn.commit();
    } catch (TxnConflictException e) {
        txn.discard();
        // 业务层重试
        throw new RetryableException("事务冲突，请重试", e);
    } finally {
        txn.discard();
    }
}
```

### 1.6.4 使用场景

| 一致性需求 | 推荐方案 | 原因 |
|---|---|---|
| 金融交易、账户余额 | Neo4j / Neptune | 强 ACID，无妥协 |
| 社交关系、好友推荐 | NebulaGraph / Dgraph | 因果一致性足够，可扩展 |
| 知识图谱构建 | JanusGraph + HBase | 强一致，支持大规模 |
| 日志分析、图谱探索 | JanusGraph + Cassandra | 最终一致，写入吞吐高 |
| 实时风控 | Dgraph | 低延迟 + 可序列化隔离 |

### 1.6.5 潜在风险与注意事项

- **分布式图数据库的"伪 ACID"**：很多分布式图数据库声称支持 ACID，但实际是"单分区 ACID"。跨分区事务要么不支持，要么使用二阶段提交（2PC），性能急剧下降。
- **Neo4j 集群的写可用性**：Neo4j Causal Cluster 的写操作只能在主节点执行，主节点故障时存在不可写窗口。对于写密集型场景需要评估。
- **Raft 的多数派开销**：NebulaGraph 和 Dgraph 使用 Raft 共识，每次写入需要多数派节点确认。3 副本时容忍 1 节点故障，5 副本时容忍 2 节点故障，但写入延迟随副本数增加。
- **最终一致的读异常**：JanusGraph + Cassandra 后端在节点故障恢复后可能读到过期数据。需要业务层容忍或使用一致性级别设置。

### 1.6.6 本章小结

ACID vs BASE 的选择取决于业务对一致性的容忍度。金融级场景必须 ACID，推荐/社交场景因果一致性足够。分布式图数据库的 ACID 通常限于单分区，跨分区事务需要谨慎评估。选型时需明确业务的一致性需求，避免过度设计或设计不足。

---

## 1.7 何时不应该使用图数据库

### 1.7.1 解决的问题

图数据库的营销宣传容易让工程师产生"万物皆可图"的错觉。明确图数据库的局限性，避免错误选型，是资深工程师的基本素养。

### 1.7.2 核心原理

以下场景**不适合**使用图数据库：

**1. 简单 CRUD + 批量操作**

图数据库的查询优化器针对图遍历优化，对简单的点查和范围扫描不如关系型数据库高效。

```java
// 不推荐：用图数据库做简单的用户信息查询
// 图数据库需要遍历索引树找到节点，再读取属性
String cypher = "MATCH (u:User {email: 'alice@example.com'}) RETURN u.name, u.age";

// 推荐：关系型数据库直接通过 B+ 树索引定位
String sql = "SELECT name, age FROM users WHERE email = 'alice@example.com'";
// RDBMS 的 B+ 树索引 + 聚簇表扫描比图数据库的节点+属性分离存储更高效
```

**2. 高吞吐写入 + 低关联查询**

图数据库的写入需要维护邻接索引，写入放大系数高。如果数据写入后很少做关联查询，图数据库的维护成本是浪费的。

| 场景 | 写入吞吐 | 关联查询 | 推荐 |
|---|---|---|---|
| 时序数据（IoT 传感器） | 百万/秒 | 极少 | InfluxDB / TimescaleDB |
| 用户行为日志 | 十万/秒 | 偶尔 | Elasticsearch / ClickHouse |
| 社交关系变更 | 千/秒 | 频繁 | 图数据库 |

**3. 全局图分析（OLAP）**

图数据库擅长 OLTP 风格的图遍历（从特定起点出发的局部查询），不擅长全图扫描的 OLAP 分析。

```java
// 不推荐：用图数据库做全图 PageRank
// Neo4j 的 PageRank 过程式实现（内存受限）
String cypher = "CALL gds.pageRank.stream('myGraph') YIELD nodeId, score RETURN nodeId, score";
// 当图规模超过可用内存时，性能崩溃

// 推荐：用 Spark GraphX 做分布式图计算
Dataset<Row> edges = spark.read().parquet("hdfs://graph/edges");
GraphFrame graph = GraphFrame.fromEdges(edges);
Dataset<Row> ranks = graph.pageRank()
    .resetProbability(0.15)
    .tol(0.01)
    .run();
// Spark 可以扩展到 1000+ 节点集群
```

**4. 多级聚合报表**

图数据库的 GROUP BY / ORDER BY / 聚合操作不是其设计重点。

```java
// 不推荐：用图数据库做月度销售报表
String cypher = """
    MATCH (o:Order)-[:CONTAINS]->(p:Product)
    WHERE o.date >= '2024-01-01' AND o.date < '2024-02-01'
    RETURN p.category, sum(o.amount), count(o)
    """;
// 图数据库需要遍历所有订单节点，效率低于列式存储

// 推荐：用 ClickHouse 做分析报表
String sql = """
    SELECT category, sum(amount), count(*)
    FROM orders
    WHERE date >= '2024-01-01' AND date < '2024-02-01'
    GROUP BY category
    """;
// ClickHouse 的列式存储 + 向量化执行比图数据库快 10-100 倍
```

**5. 全文搜索**

图数据库的字符串匹配能力远不如专门的搜索引擎。

```java
// 不推荐：用图数据库做全文搜索
String cypher = "MATCH (d:Document) WHERE d.content CONTAINS '图数据库' RETURN d";
// 全表扫描，性能灾难

// 推荐：用 Elasticsearch
SearchRequest request = new SearchRequest("documents");
request.source(new SearchSourceBuilder()
    .query(QueryBuilders.matchQuery("content", "图数据库")));
// ES 的倒排索引 + TF-IDF 评分，毫秒级返回
```

**6. 需要复杂事务的 OLTP 系统**

如果业务需要跨多个实体的复杂事务（如电商下单：扣库存 + 扣款 + 生成订单 + 更新物流），关系型数据库的 ACID 和成熟度远优于图数据库。

### 1.7.3 代码/配置实现

```java
// 错误选型示例：用图数据库做电商订单系统
public class OrderService {
    private final Driver neo4jDriver;
    
    public Order createOrder(String userId, List<OrderItem> items) {
        try (Session session = neo4jDriver.session()) {
            return session.executeWrite(tx -> {
                // 扣库存（需要行级锁）
                for (OrderItem item : items) {
                    Result r = tx.run(
                        "MATCH (p:Product {id: $pid}) WHERE p.stock >= $qty " +
                        "SET p.stock = p.stock - $qty RETURN p.stock",
                        Values.parameters("pid", item.getProductId(), "qty", item.getQuantity())
                    );
                    if (r.single().get("p.stock").asInt() < 0) {
                        throw new RuntimeException("库存不足");
                    }
                }
                // 创建订单
                tx.run("CREATE (o:Order {id: $oid, userId: $uid, total: $total, status: 'CREATED'})",
                    Values.parameters("oid", UUID.randomUUID().toString(), 
                        "uid", userId, "total", calculateTotal(items)));
                return new Order(/* ... */);
            });
        }
    }
}
// 问题：Neo4j 的锁机制是节点级锁，高并发扣库存时死锁风险高
// 问题：图数据库没有原生二级索引，按 userId 查订单需要全图扫描
// 问题：运维工具（备份、监控、慢查询日志）不如 RDBMS 成熟

// 正确做法：用 PostgreSQL 做订单系统，用图数据库做关联分析
// PostgreSQL 负责事务性操作
// 通过 Debezium CDC 同步到 Neo4j 做关联查询
```

### 1.7.4 使用场景

| 不适合的场景 | 原因 | 替代方案 |
|---|---|---|
| 订单/支付系统 | 需要强 ACID + 复杂事务 | PostgreSQL / MySQL |
| 时序数据 | 写入吞吐要求高，关联少 | InfluxDB / TimescaleDB |
| 全文搜索 | 需要倒排索引 + 相关性排序 | Elasticsearch / Meilisearch |
| 数据仓库/BI 报表 | 需要列式存储 + 向量化执行 | ClickHouse / Snowflake |
| 简单 CRUD API | 图数据库的查询开销 > 收益 | PostgreSQL / MongoDB |
| 全局图分析 | 需要分布式批处理 | Spark GraphX / Flink Gelly |
| 缓存 | 需要微秒级延迟 | Redis / Memcached |

### 1.7.5 潜在风险与注意事项

- **"万物皆可图"的陷阱**：虽然任何数据都可以建模为图，但并不意味着应该用图数据库存储。建模的便利性不等于查询的高效性。
- **图数据库不是 RDBMS 的替代品**：它们是互补工具。成熟的架构通常同时使用 RDBMS（源系统）和图数据库（查询层）。
- **迁移成本**：从 RDBMS 迁移到图数据库需要重写数据模型、查询逻辑和应用代码，成本可能远超预期。建议从增量场景开始，而非全量迁移。
- **团队技能**：图数据库的运维和调优需要专门技能。如果团队没有图数据库经验，建议从托管服务（Neptune、AuraDB）开始。

### 1.7.6 本章小结

图数据库是解决关联查询问题的利器，但不是通用数据库。简单 CRUD、高吞吐写入、全局图分析、聚合报表、全文搜索等场景应使用专用引擎。正确的策略是"混合持久化"：用最合适的工具做最合适的事，通过 CDC 或事件驱动在系统间同步数据。

---

## 1.8 综合案例：社交推荐系统架构

### 1.8.1 解决的问题

将本章所有概念整合为一个真实架构，展示图数据库在混合架构中的定位和协作方式。

### 1.8.2 核心原理

```
┌─────────────────────────────────────────────────────────────────┐
│                       客户端 (App / Web)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  API Gateway │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │ 用户服务   │   │ 推荐服务  │   │ 分析服务   │
    │ (RDBMS)   │   │ (图数据库) │   │ (Spark)   │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │PostgreSQL │   │  Neo4j    │   │  HDFS     │
    │ (源系统)  │   │ (查询层)  │   │ (批处理)  │
    └─────┬─────┘   └─────┬─────┘   └───────────┘
          │                │
          └───────┬────────┘
                  │
          ┌───────▼────────┐
          │  Debezium CDC  │
          │  (Kafka Connect)│
          └────────────────┘
```

**数据流**：
1. 用户数据写入 PostgreSQL（源系统）
2. Debezium 捕获变更事件，发送到 Kafka
3. Kafka Consumer 将数据同步到 Neo4j
4. 推荐服务从 Neo4j 查询关联关系
5. Spark 定期从 HDFS 读取全量数据，运行 PageRank/社区发现
6. 分析结果写回 Neo4j 作为预计算属性

### 1.8.3 代码/配置实现

```java
// CDC 同步组件 —— 将 PostgreSQL 数据同步到 Neo4j
@Component
public class GraphSyncConsumer {
    
    private final Driver neo4jDriver;
    
    @KafkaListener(topics = "dbserver.public.friendships")
    public void onFriendshipChange(ChangeEvent event) {
        try (Session session = neo4jDriver.session()) {
            session.executeWrite(tx -> {
                switch (event.getOp()) {
                    case "c":  // 创建
                        tx.run("""
                            MATCH (u1:User {id: $sourceId})
                            MATCH (u2:User {id: $targetId})
                            MERGE (u1)-[f:FRIENDS_WITH]->(u2)
                            SET f.createdAt = $ts
                            """, 
                            Values.parameters(
                                "sourceId", event.getAfter("user_id"),
                                "targetId", event.getAfter("friend_id"),
                                "ts", event.getTimestamp()
                            ));
                        break;
                    case "d":  // 删除
                        tx.run("""
                            MATCH (u1:User {id: $sourceId})-[f:FRIENDS_WITH]->(u2:User {id: $targetId})
                            DELETE f
                            """,
                            Values.parameters(
                                "sourceId", event.getBefore("user_id"),
                                "targetId", event.getBefore("friend_id")
                            ));
                        break;
                }
                return null;
            });
        }
    }
}

// 推荐服务 —— 混合查询
@Service
public class RecommendationService {
    
    private final Driver neo4jDriver;
    private final RedisTemplate<String, List<Long>> redisTemplate;
    
    // 实时推荐：图数据库查询 + Redis 缓存
    public List<Long> recommendFriends(Long userId) {
        // 1. 查缓存
        String cacheKey = "rec:friends:" + userId;
        List<Long> cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) return cached;
        
        // 2. 图数据库查询
        try (Session session = neo4jDriver.session()) {
            String cypher = """
                MATCH (me:User {id: $uid})-[:FRIENDS_WITH]->(f:User)-[:FRIENDS_WITH]->(fof:User)
                WHERE NOT (me)-[:FRIENDS_WITH]->(fof) AND me <> fof
                WITH fof, count(*) AS commonFriends
                OPTIONAL MATCH (fof)-[:LIKES]->(tag:Tag)<-[:LIKES]-(me)
                WITH fof, commonFriends, count(tag) AS sharedInterests
                RETURN fof.id AS id
                ORDER BY commonFriends * 0.6 + sharedInterests * 0.4 DESC
                LIMIT 20
                """;
            
            Result result = session.run(cypher, 
                Values.parameters("uid", userId));
            
            List<Long> recommendations = new ArrayList<>();
            while (result.hasNext()) {
                recommendations.add(
                    result.next().get("id").asLong());
            }
            
            // 3. 写入缓存（TTL 1 小时）
            redisTemplate.opsForValue().set(cacheKey, 
                recommendations, Duration.ofHours(1));
            
            return recommendations;
        }
    }
}
```

### 1.8.4 使用场景

该架构适用于：
- 社交平台的好友推荐和 Feed 流
- 电商平台的商品推荐
- 内容平台的个性化分发
- 企业级知识图谱应用

### 1.8.5 潜在风险与注意事项

- **CDC 延迟**：Kafka 同步存在秒级延迟，对实时性要求极高的场景需要评估
- **数据一致性**：CDC 是最终一致，短时间窗口内图数据库和 RDBMS 可能不一致
- **运维复杂度**：多系统架构的运维成本高于单系统，需要自动化部署和监控

### 1.8.6 本章小结

混合架构是图数据库落地的成熟模式。RDBMS 做源系统保证数据可靠，图数据库做查询层提供关联查询能力，Redis 做缓存层降低延迟，Spark 做批处理层支持全局分析。通过 CDC 实现数据同步，各系统各司其职。

---

## 附录：术语对照表

| 英文 | 中文 | 说明 |
|---|---|---|
| Vertex / Node | 顶点 / 节点 | 图中的实体 |
| Edge / Relationship | 边 / 关系 | 实体之间的关联 |
| Property | 属性 | 顶点或边的键值对属性 |
| Label | 标签 | 顶点的类型标记 |
| Index-free Adjacency | 免索引邻接 | 节点直接持有指向邻接节点的指针 |
| Graph Traversal | 图遍历 | 从起点沿边访问相邻节点的过程 |
| Cypher | Cypher | Neo4j 的声明式图查询语言 |
| Gremlin | Gremlin | Apache TinkerPop 的图遍历语言 |
| GQL | GQL | ISO 标准图查询语言 |
| Property Graph Model | 属性图模型 | 顶点和边均可携带属性的图模型 |
| RDF | 资源描述框架 | W3C 标准的语义网数据模型 |
| SPARQL | SPARQL | RDF 数据的查询语言 |
| ACID | ACID | 原子性、一致性、隔离性、持久性 |
| BASE | BASE | 基本可用、软状态、最终一致 |
| Raft | Raft | 分布式共识算法 |
| CDC | 变更数据捕获 | 捕获数据库变更并同步到其他系统 |
| GraphRAG | 图增强检索生成 | 结合知识图谱和大语言模型的检索增强生成 |
