# 第8章 Neo4j 深度剖析：从存储引擎到生产部署

## 8.1 架构全景

### 8.1.1 解决的问题

传统关系型数据库在处理多对多关系、可变深度路径查询（如社交网络的好友推荐、知识图谱的推理链路）时，需要大量 JOIN 操作，性能随关联深度指数级下降。Neo4j 采用 **免索引邻接（index-free adjacency）** 架构，每个节点直接持有指向其关系的物理指针，遍历复杂度仅为 O(1) 跳，与数据规模无关。

### 8.1.2 核心原理

Neo4j 内核分为五个层次：

```
┌─────────────────────────────────────┐
│        Cluster Management           │  ← Raft / Causal Clustering
├─────────────────────────────────────┤
│        Cypher Engine                │  ← 解析器、优化器、执行器
├─────────────────────────────────────┤
│        Transaction Manager          │  ← 读锁/写锁、死锁检测
├─────────────────────────────────────┤
│        Graph Kernel                 │  ← 节点、关系、属性、路径
├─────────────────────────────────────┤
│        Storage Layer                │  ← 固定大小记录、Page Cache
└─────────────────────────────────────┘
```

- **Graph Kernel**：核心数据结构，维护节点（Node）、关系（Relationship）、属性（Property）、标签（Label）和路径（Path）的内存表示。
- **Cypher Engine**：声明式图查询语言引擎，包含解析器、语义分析器、逻辑计划生成器、基于成本的物理计划优化器、管道化执行器。
- **Transaction Manager**：实现 ACID 事务，支持可重复读隔离级别，管理锁的获取与释放，检测并处理死锁。
- **Storage Layer**：将图数据持久化到磁盘，使用固定大小记录（fixed-size records）实现 O(1) 随机访问，通过 Page Cache 减少磁盘 I/O。
- **Cluster Management**：多实例部署，Raft 共识协议保证数据一致性，读写分离支持水平扩展。

### 8.1.3 架构设计图

```
Client (Bolt) ──→  Routing Driver ──→ ┌──────────────┐
                                       │  Core Server  │ ← Raft
                                       │  (Leader)     │
                                       └──────┬───────┘
                                              │ 复制
                                 ┌────────────┼────────────┐
                                 ▼            ▼            ▼
                          ┌──────────┐ ┌──────────┐ ┌──────────┐
                          │ Core     │ │ Core     │ │ Read     │
                          │ Follower │ │ Follower │ │ Replica  │
                          └──────────┘ └──────────┘ └──────────┘
```

### 8.1.4 使用场景

- 社交网络（好友关系、推荐路径）
- 知识图谱（实体链接、推理）
- 实时推荐引擎（用户-商品-标签关联）
- 身份与访问管理（角色继承、权限传播）
- 网络与 IT 运维（拓扑发现、根因分析）

### 8.1.5 潜在风险与注意事项

- 全图扫描（无索引的 label scan）在数十亿节点规模下性能急剧下降，必须为高频查询字段建索引
- 深度可变路径查询（`[*1..]`）可能产生指数级中间结果，需用 `LIMIT` 和剪枝条件约束
- 单机实例受限于物理内存，Page Cache 命中率决定整体性能

### 8.1.6 本章小结

Neo4j 的架构核心是"存储即遍历"——物理存储布局直接映射为图遍历路径，消除了关系型数据库 JOIN 的开销。理解这五个层次及其交互，是进行性能调优和故障排查的前提。

---

## 8.2 原生图存储

### 8.2.1 解决的问题

图数据库的核心挑战是：如何在磁盘上布局节点、关系、属性，使得遍历操作只需最少的随机 I/O。Neo4j 的答案是 **固定大小记录 + 物理指针**，每个记录在文件中的偏移量即为其 ID，实现 O(1) 寻址。

### 8.2.2 核心原理

Neo4j 使用三个核心存储文件，每个文件由固定大小的记录（record）组成：

#### 节点存储（Node Store）— `neostore.nodestore.db`

每条记录固定 **15 字节**：

```
┌─ 1 byte ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 2 bytes ─┐
│  inUse(1) │ firstRel  │ firstProp │  label     │  reserved  │
│  flag     │  ID       │  ID       │  slot      │            │
└───────────┴───────────┴───────────┴───────────┴────────────┘
```

- `inUse` (1 byte)：标记记录是否被使用（0x01 = 使用中，0x00 = 已删除）
- `firstRel` (4 bytes)：指向第一条关系的 ID（int，无符号）
- `firstProp` (4 bytes)：指向第一个属性的 ID
- `label slot` (4 bytes)：标签存储区，存储内联标签或指向动态标签记录的指针
- `reserved` (2 bytes)：对齐填充

节点 ID 即记录在文件中的偏移量除以 15。例如 ID 为 42 的节点，其记录位于文件偏移 `42 × 15 = 630` 处。

#### 关系存储（Relationship Store）— `neostore.relationshipstore.db`

每条记录固定 **34 字节**：

```
┌─ 1 byte ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 1 byte ─┐
│  inUse(1) │ firstNode  │ secondNode │ relType   │ firstProp │  prevRel  │  nextRel  │  prevRel  │  extra  │
│  flag     │  ID        │  ID        │  ID       │  ID       │  (first)  │  (first)  │  (second) │         │
└───────────┴────────────┴────────────┴───────────┴───────────┴───────────┴───────────┴───────────┴─────────┘
```

关键设计：**双向链表**。每个关系记录同时存储两个方向的 prev/next 指针，使得从任一节点出发都能双向遍历关系链。这意味着：

- 从节点 A 出发，通过 `firstRel` 找到第一条关系，再通过 `nextRel (first)` 遍历所有以 A 为起始节点的关系
- 关系链的维护是 O(1) 操作——插入新关系只需修改前后邻居的指针

#### 属性存储（Property Store）— `neostore.propertystore.db`

属性记录是 **动态大小** 的，因为属性值类型和长度各异：

```
┌─ 1 byte ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┬─ 4 bytes ─┐
│  inUse(1) │  propKey   │  prevProp  │  nextProp  │  payload   │  payload   │  payload   │
│  flag     │  ID        │  ID        │  ID        │  (type+len)│  (value)   │  (value)   │
└───────────┴────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
```

属性值存储策略：
- **内联存储**：小值（数字、短字符串 ≤ 8 字节）直接嵌入记录
- **动态存储**：大值（长字符串、数组）存储在 `neostore.propertystore.db.strings` 或 `neostore.propertystore.db.arrays`，属性记录中仅存指针

#### 模式存储（Schema Store）— `neostore.schemastore.db`

存储索引定义、约束（唯一性、存在性）、以及索引到标签+属性集的映射。索引数据本身存储在 Lucene 索引文件中。

### 8.2.3 存储文件布局

```
${NEO4J_HOME}/data/databases/graph.db/
├── neostore                          # 元数据
├── neostore.nodestore.db             # 节点存储
├── neostore.relationshipstore.db     # 关系存储
├── neostore.propertystore.db         # 属性存储
├── neostore.propertystore.db.strings # 大字符串
├── neostore.propertystore.db.arrays  # 大数组
├── neostore.labeltokenstore.db       # 标签字典
├── neostore.relationshiptypestore.db # 关系类型字典
├── neostore.schemastore.db           # 模式存储
└── schema/index/                     # Lucene 索引
```

### 8.2.4 使用场景

- 需要极低延迟的图遍历（社交推荐、欺诈检测）
- 数据模型稳定、节点/关系类型可预定义的场景
- 高频读写混合负载

### 8.2.5 潜在风险与注意事项

- 固定大小记录意味着每个节点无论有多少属性都占用 15 字节，但属性链过长会导致多次随机 I/O
- 关系链的双向链表在并发写入时，链尾插入需要 CAS 操作更新前一条关系的 next 指针，可能成为锁竞争热点
- 删除节点时，必须显式删除其所有关系，否则关系链中出现悬挂指针（Neo4j 强制要求：删除节点前必须先删除其关系）

### 8.2.6 本章小结

Neo4j 的原生图存储是其性能基石。固定大小记录 + 物理指针的设计使得"遍历"等价于"指针跳转"，无论图规模多大，单跳延迟恒定。理解存储布局对诊断 I/O 瓶颈、优化数据模型至关重要。

---

## 8.3 Cypher 查询引擎与优化器

### 8.3.1 解决的问题

声明式查询语言需要将用户意图（"找到所有买了 A 也买了 B 的用户"）自动转化为高效的执行计划。Cypher 引擎需要处理：谓词下推、连接顺序选择、索引选择、中间结果剪枝等优化问题。

### 8.3.2 核心原理

Cypher 查询的生命周期分为五个阶段：

```
Cypher Query
    │
    ▼
┌──────────────┐
│   Parsing     │ → 词法分析、语法分析，生成 AST
└──────┬───────┘
       ▼
┌──────────────┐
│  Semantic     │ → 验证标签、属性、类型，解析变量作用域
│  Analysis     │
└──────┬───────┘
       ▼
┌──────────────┐
│  Logical      │ → 生成逻辑计划（关系代数表达式树）
│  Plan         │
└──────┬───────┘
       ▼
┌──────────────┐
│  Physical     │ → 基于成本的优化，选择物理算子
│  Plan         │    (索引扫描 vs 全表扫描、连接算法)
└──────┬───────┘
       ▼
┌──────────────┐
│  Execution    │ → 管道化执行，流式返回结果
└──────────────┘
```

#### 逻辑计划

逻辑计划由一系列 **算子（Operator）** 组成，每个算子对应一个关系代数操作：

| 算子 | 含义 | 示例 |
|------|------|------|
| `NodeByLabelScan` | 按标签扫描 | `MATCH (n:Person)` |
| `NodeByIdSeek` | 按 ID 查找 | `WHERE id(n) = 42` |
| `ExpandAll` | 展开所有关系 | `(n)-->(m)` |
| `Filter` | 过滤谓词 | `WHERE n.age > 18` |
| `Projection` | 投影列 | `RETURN n.name` |
| `Sort` | 排序 | `ORDER BY n.score` |
| `EagerAggregation` | 聚合 | `count(n)` |

#### 基于成本的优化（CBO）

优化器使用以下统计信息估算成本：

- **基数估计**：每个标签的节点数、每个关系类型的边数
- **选择性估计**：谓词过滤后的行数比例（基于直方图）
- **索引信息**：是否存在索引、索引类型（BTREE vs TEXT vs POINT）

成本模型公式（简化）：

```
Cost(op) = 基数(op) × 单行处理成本(op)
Cost(plan) = Σ Cost(op_i)  for op_i in plan
```

优化器枚举多个等价物理计划，选择总成本最低者。例如：

```cypher
// 查询：找到 30 岁以上朋友的朋友
MATCH (p:Person)-[:FRIEND]->(f:Person)-[:FRIEND]->(ff:Person)
WHERE p.age > 30
RETURN ff.name
```

优化器可能生成两种计划：

- **Plan A**：先按 `:Person` 标签扫描 → 过滤 `age > 30` → 展开 `FRIEND` → 再展开 `FRIEND`（如果 Person 基数大但 age > 30 选择性高，此计划优）
- **Plan B**：先按 `:Person` 标签扫描 → 展开 `FRIEND` → 展开 `FRIEND` → 最后过滤（如果 age 无索引且选择性低，此计划优）

#### 索引选择

Neo4j 支持多种索引类型：

| 索引类型 | 适用场景 | 底层实现 |
|---------|---------|---------|
| BTREE | 精确匹配、范围查询、排序 | Lucene B+ 树 |
| TEXT | 全文搜索 | Lucene 倒排索引 |
| POINT | 空间查询 | Lucene B+ 树 + 空间编码 |
| LOOKUP | 按标签或关系类型查找 | 内置位图 |

### 8.3.3 查询分析实践

使用 `EXPLAIN` 查看逻辑计划（不执行）：

```cypher
EXPLAIN MATCH (p:Person)-[:FRIEND]->(f:Person)
WHERE p.age > 30
RETURN f.name, count(*) AS friends
ORDER BY friends DESC
LIMIT 10
```

输出示例：

```
+--------------------------------------------+
| Operator              | Estimated Rows | Cost |
+--------------------------------------------+
| Top                   | 10             | 105  |
| Sort                  | 50             | 100  |
| EagerAggregation      | 50             | 80   |
| Expand(All)           | 200            | 60   |
| Filter(p.age > 30)    | 200            | 40   |
| NodeByLabelScan(p:Person) | 1000       | 20   |
+--------------------------------------------+
```

使用 `PROFILE` 查看实际执行计划（会执行查询）：

```cypher
PROFILE MATCH (p:Person)-[:FRIEND]->(f:Person)
WHERE p.age > 30
RETURN f.name, count(*) AS friends
ORDER BY friends DESC
LIMIT 10
```

输出包含实际行数、内存使用、时间等指标。

### 8.3.4 使用场景

- 复杂路径查询（`[*1..5]` 可变长度路径）需要优化器选择最优展开策略
- 混合查询（图遍历 + 属性过滤）需要索引选择
- 聚合排序查询需要成本估算

### 8.3.5 潜在风险与注意事项

- 统计信息过时会导致优化器选择次优计划，定期执行 `CALL db.stats.retrieve('GRAPH')` 刷新统计
- 可变长度路径查询（`[*]`）可能触发笛卡尔积爆炸，始终指定最大深度 `[*1..5]`
- 优化器不会跨 `WITH` 子句进行全局优化，每个 `WITH` 片段独立优化
- 使用 `USING INDEX` 提示可强制优化器选择特定索引

### 8.3.6 本章小结

Cypher 优化器是声明式查询性能的关键。理解逻辑计划、成本模型和索引选择机制，能帮助开发者写出可预测的高效查询。生产环境中应养成对慢查询执行 `PROFILE` 的习惯。

---

## 8.4 事务处理与锁机制

### 8.4.1 解决的问题

图数据库的事务比关系型数据库更复杂：一次图遍历可能涉及数十个节点和关系的读写，锁的粒度和范围直接影响并发吞吐量。Neo4j 需要在保证 ACID 的同时，最大化并发度。

### 8.4.2 核心原理

#### 锁类型

| 锁类型 | 符号 | 语义 | 兼容性 |
|--------|------|------|--------|
| 读锁（共享） | S | 读取节点/关系/属性 | 多个读锁可共存 |
| 写锁（排他） | X | 修改节点/关系/属性 | 与任何其他锁互斥 |
| 意向锁 | I | 标记事务将修改子资源 | 用于层级锁定 |

#### 锁粒度

Neo4j 的锁粒度是 **记录级（record-level）**，即锁在单个节点或关系上，而非页级或表级。这意味着：

- 事务 A 锁住节点 42，事务 B 仍可同时修改节点 99
- 同一节点上的属性修改锁住整个节点记录

#### 关系链锁定协议

这是图数据库特有的锁问题。当修改关系链时（如插入新关系），需要同时锁住：

1. 新关系记录本身（写锁）
2. 前一个关系的 `nextRel` 指针（写锁）
3. 起始节点的 `firstRel` 指针（如果插入到链头）

锁定顺序必须一致以避免死锁。Neo4j 采用 **按 ID 升序获取锁** 的策略：

```java
// 伪代码：关系链插入的锁定顺序
void insertRelationship(Relationship newRel, Node startNode, Relationship prevRel) {
    // 按 ID 升序排序所有需要锁定的记录
    List<Long> lockIds = sortAscending(
        newRel.getId(),
        prevRel != null ? prevRel.getId() : -1,
        startNode.getId()
    );

    // 按顺序获取锁
    for (long id : lockIds) {
        acquireLock(id, LOCK_MODE_EXCLUSIVE);
    }

    // 执行插入
    // ...
}
```

#### 死锁检测

Neo4j 使用 **等待图（Wait-for Graph）** 算法检测死锁：

- 每个事务是一个节点
- 如果事务 T1 等待 T2 释放锁，则添加边 T1 → T2
- 定期检测图中是否存在环
- 发现死锁时，选择一个事务作为牺牲者回滚（通常选择占用资源最少或启动时间最晚的事务）

死锁检测周期可通过配置调整：

```properties
# neo4j.conf
dbms.lock.acquisition.timeout=10s        # 锁等待超时
dbms.lock.deadlock_detection.interval=100ms  # 死锁检测间隔
```

#### 事务生命周期

```
begin() → acquireLocks() → read/write → commit/rollback
              │                              │
              ▼                              ▼
        锁获取阶段                     锁释放 + 日志刷盘
```

事务在 `commit()` 时执行以下步骤：

1. **预提交（Pre-commit）**：验证约束（唯一性、存在性）
2. **写入事务日志**：将变更写入 `neostore.transaction.db`（WAL）
3. **应用变更到存储**：更新节点/关系/属性记录
4. **释放锁**：按获取的逆序释放所有锁
5. **返回成功**：通知客户端事务完成

### 8.4.3 代码实现

```java
// 事务中的锁行为演示
try (Transaction tx = graphDb.beginTx()) {
    Node alice = tx.findNode(Label.label("Person"), "name", "Alice");
    Node bob = tx.findNode(Label.label("Person"), "name", "Bob");

    // 读操作：获取读锁（共享）
    String aliceName = (String) alice.getProperty("name");

    // 写操作：升级为写锁（排他）
    alice.setProperty("lastLogin", System.currentTimeMillis());

    // 创建关系：需要获取 alice、bob、新关系的写锁
    Relationship rel = alice.createRelationshipTo(bob, RelationshipType.withName("KNOWS"));
    rel.setProperty("since", 2024);

    // 提交时释放所有锁
    tx.commit();
}
```

### 8.4.4 使用场景

- 高并发写入场景（社交网络发帖、点赞）
- 批量数据导入（需要合理控制事务大小，避免锁范围过大）
- 长事务（需要关注锁持有时间，避免阻塞其他事务）

### 8.4.5 潜在风险与注意事项

- **事务应短小精悍**：长事务持有锁的时间长，降低并发度。单个事务建议处理不超过 10 万条记录
- **写锁升级**：读操作不获取写锁，但写操作会隐式升级。如果先读后写，读锁不会自动升级为写锁，可能导致死锁
- **死锁牺牲者**：被选为牺牲者的事务会收到 `DeadlockDetectedException`，应用层应实现重试逻辑
- **锁 escalation**：Neo4j 不会将多个记录锁升级为页锁，因此大量小事务比少量大事务更优

### 8.4.6 本章小结

Neo4j 的记录级锁和按 ID 升序锁定策略在保证 ACID 的同时最大化并发度。理解锁协议和死锁检测机制，是构建高并发图应用的基础。关键原则：事务短小、按固定顺序访问资源、实现重试逻辑。

---

## 8.5 集群架构与高可用

### 8.5.1 解决的问题

单机 Neo4j 受限于物理资源（内存、磁盘、CPU），无法满足大规模生产环境的可用性和扩展性需求。集群需要解决：数据一致性、故障转移、读写分离、跨数据中心部署。

### 8.5.2 核心原理

Neo4j 4.x+ 采用 **Causal Clustering** 架构，分为两种角色：

#### 核心服务器（Core Server）

- 运行 Raft 共识协议，参与投票
- 建议部署奇数个（3 或 5 个）以容忍少数派故障
- 处理写请求和读请求
- 每个写事务必须经过 Raft 多数派确认

#### 只读副本（Read Replica）

- 不参与 Raft 投票
- 从核心服务器异步复制数据
- 只处理读请求
- 可水平扩展至数十个

#### Raft 共识协议

写事务在集群中的流程：

```
Client → Leader Core → Follower Cores → Leader确认 → Client确认
  1. 客户端发送写请求到任意核心服务器
  2. 接收请求的核心服务器将请求转发给 Leader
  3. Leader 将事务日志追加到本地，并并行发送给 Followers
  4. 当多数派（N/2 + 1）确认写入后，Leader 提交事务
  5. Leader 回复客户端成功
```

Raft 保证：
- **Leader 选举**：Leader 故障时，Followers 在超时后发起选举，获得多数票者成为新 Leader
- **日志复制**：所有已提交的日志在 Leader 切换后不会丢失
- **安全性**：只有拥有最新日志的节点才能成为 Leader

#### 书签（Bookmarks）与因果一致性

Neo4j 的 Causal Clustering 不提供强一致性，而是提供 **因果一致性（Causal Consistency）**。书签机制确保：

```java
// 客户端使用书签确保读取到自己的写入
try (Session session = driver.session(SessionConfig.forDatabase("neo4j"))) {
    // 写事务
    Result result = session.run(
        "CREATE (p:Person {name: $name}) RETURN id(p)",
        parameters("name", "Alice")
    );
    long nodeId = result.single().get(0).asLong();

    // 获取书签
    Bookmark bookmark = session.lastBookmark();

    // 使用书签开启新会话，确保读取到刚才写入的数据
    try (Session readSession = driver.session(
            SessionConfig.forDatabase("neo4j")
                         .withDefaultAccessMode(AccessMode.READ)
                         .withBookmarks(bookmark))) {
        Result readResult = readSession.run(
            "MATCH (p:Person) WHERE id(p) = $id RETURN p.name",
            parameters("id", nodeId)
        );
        // 保证能读到 "Alice"
    }
}
```

#### 故障转移

```
正常状态:  Leader = Core-1, Followers = Core-2, Core-3
          ReadReplicas = RR-1, RR-2

Core-1 宕机:
  1. Core-2 和 Core-3 检测到 Leader 心跳超时（默认 2s）
  2. Core-2 发起选举，Core-3 投票
  3. Core-2 成为新 Leader
  4. 客户端通过路由驱动自动发现新 Leader
  5. 读副本从新 Leader 继续同步

恢复后:
  Core-1 重新加入集群，作为 Follower 追赶丢失的日志
```

### 8.5.3 配置实现

```properties
# core-server-1/neo4j.conf
dbms.mode=CORE
causal_clustering.initial_discovery_members=core-1:5000,core-2:5000,core-3:5000
causal_clustering.discovery_advertised_address=core-1:5000
causal_clustering.transaction_advertised_address=core-1:6000
causal_clustering.raft_advertised_address=core-1:7000

# read-replica-1/neo4j.conf
dbms.mode=READ_REPLICA
causal_clustering.initial_discovery_members=core-1:5000,core-2:5000,core-3:5000
```

### 8.5.4 使用场景

- 生产环境需要 99.99% 可用性
- 读写分离：写少读多的应用（社交网络、推荐系统）
- 跨地域部署：核心集群在一个数据中心，读副本在边缘节点
- 灾难恢复：跨 AZ 或跨 Region 部署核心集群

### 8.5.5 潜在风险与注意事项

- **写性能瓶颈**：所有写事务必须经过 Leader，且需要 Raft 多数派确认，写入延迟至少为一次网络 RTT
- **读副本数据滞后**：异步复制意味着读副本可能读到旧数据，书签只能保证因果一致性，不能保证实时一致性
- **脑裂防护**：网络分区时，少数派核心无法提交写事务（无法形成多数派），但不会出现脑裂
- **核心服务器数量**：3 个核心容忍 1 个故障，5 个核心容忍 2 个故障。超过 7 个核心通常不推荐，因为 Raft 通信复杂度 O(n²)
- **路由驱动**：客户端必须使用 Bolt 路由驱动（`bolt+routing://` 协议），而非直连驱动

### 8.5.6 本章小结

Causal Clustering 通过 Raft 共识协议在一致性和可用性之间取得平衡。核心服务器提供强一致写入，读副本提供水平扩展的读取能力。书签机制是客户端实现因果一致性的关键工具。生产部署建议：3 或 5 个核心 + 按需扩展的读副本。

---

## 8.6 Java API 实战

### 8.6.1 解决的问题

Java 生态中集成 Neo4j 有两种主流方式：**嵌入式模式**（Embedded，JVM 进程内直接操作存储引擎）和 **Bolt 驱动模式**（远程连接，适用于微服务架构）。两种模式各有适用场景。

### 8.6.2 核心原理

#### 嵌入式 Neo4j

嵌入式模式将 Neo4j 数据库引擎直接运行在应用 JVM 进程中，应用代码与存储引擎之间没有网络开销。适用于：

- 单机部署的桌面应用或工具
- 对延迟极度敏感的场景
- 需要直接操作底层 API 的场景

核心接口：

| 接口 | 职责 |
|------|------|
| `GraphDatabaseService` | 数据库实例入口，创建/管理事务 |
| `Transaction` | 事务上下文，提交/回滚 |
| `Node` | 节点表示，读写属性、创建关系 |
| `Relationship` | 关系表示，读写属性、获取起止节点 |
| `ResourceIterator` | 查询结果迭代器 |

#### Bolt 驱动

Bolt 是 Neo4j 的二进制协议，通过 TCP 连接通信。适用于：

- 微服务架构中的远程连接
- 需要连接池和负载均衡的场景
- 跨语言调用

核心接口：

| 接口 | 职责 |
|------|------|
| `Driver` | 驱动实例，管理连接池 |
| `Session` | 会话上下文，执行语句 |
| `Transaction` | 事务（支持自动提交和显式事务） |
| `Result` | 查询结果 |
| `Record` | 单行结果 |

### 8.6.3 代码实现

#### 嵌入式 Neo4j

```java
import org.neo4j.graphdb.*;
import org.neo4j.dbms.api.DatabaseManagementService;
import org.neo4j.dbms.api.DatabaseManagementServiceBuilder;

import java.nio.file.Path;

public class EmbeddedNeo4jExample {

    private static final Path DB_PATH = Path.of("data/embedded-graph.db");
    private DatabaseManagementService managementService;
    private GraphDatabaseService graphDb;

    public void start() {
        managementService = new DatabaseManagementServiceBuilder(DB_PATH)
            .setConfig(GraphDatabaseSettings.pagecache_memory, "512M")
            .setConfig(GraphDatabaseSettings.transaction_timeout, Duration.ofSeconds(60))
            .build();
        graphDb = managementService.database("neo4j");
        registerShutdownHook();
    }

    public void createData() {
        Label personLabel = Label.label("Person");
        Label movieLabel = Label.label("Movie");
        RelationshipType actedIn = RelationshipType.withName("ACTED_IN");

        // try-with-resources 自动管理事务生命周期
        try (Transaction tx = graphDb.beginTx()) {
            // 创建节点
            Node alice = tx.createNode(personLabel);
            alice.setProperty("name", "Alice");
            alice.setProperty("age", 32);
            alice.setProperty("born", 1992);

            Node bob = tx.createNode(personLabel);
            bob.setProperty("name", "Bob");
            bob.setProperty("age", 28);

            Node movie = tx.createNode(movieLabel);
            movie.setProperty("title", "The Matrix");
            movie.setProperty("released", 1999);

            // 创建关系
            Relationship rel1 = alice.createRelationshipTo(movie, actedIn);
            rel1.setProperty("role", "Trinity");

            Relationship rel2 = bob.createRelationshipTo(movie, actedIn);
            rel2.setProperty("role", "Neo");

            // 创建索引
            tx.schema().indexFor(personLabel).on("name").create();
            tx.schema().indexFor(movieLabel).on("title").create();

            tx.commit();
        }
    }

    public void queryData() {
        Label personLabel = Label.label("Person");

        try (Transaction tx = graphDb.beginTx()) {
            // 使用索引查找
            Node alice = tx.findNode(personLabel, "name", "Alice");
            if (alice != null) {
                System.out.printf("Found: %s, age: %d%n",
                    alice.getProperty("name"),
                    alice.getProperty("age"));

                // 遍历关系
                for (Relationship rel : alice.getRelationships(
                        Direction.OUTGOING,
                        RelationshipType.withName("ACTED_IN"))) {
                    Node movie = rel.getEndNode();
                    System.out.printf("  Acted in: %s as %s%n",
                        movie.getProperty("title"),
                        rel.getProperty("role"));
                }
            }
            tx.commit();
        }
    }

    public void cypherQuery() {
        try (Transaction tx = graphDb.beginTx()) {
            Result result = tx.execute(
                "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie {title: $title}) " +
                "RETURN p.name AS name, r.role AS role " +
                "ORDER BY p.born",
                Map.of("title", "The Matrix")
            );

            while (result.hasNext()) {
                Map<String, Object> row = result.next();
                System.out.printf("%s played %s%n",
                    row.get("name"), row.get("role"));
            }
            tx.commit();
        }
    }

    public void shutdown() {
        managementService.shutdown();
    }

    private void registerShutdownHook() {
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown));
    }

    public static void main(String[] args) {
        EmbeddedNeo4jExample example = new EmbeddedNeo4jExample();
        example.start();
        example.createData();
        example.queryData();
        example.cypherQuery();
        example.shutdown();
    }
}
```

#### Bolt 驱动

```java
import org.neo4j.driver.*;
import org.neo4j.driver.Record;
import org.neo4j.driver.exceptions.TransientException;

import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;

public class BoltDriverExample implements AutoCloseable {

    private final Driver driver;

    public BoltDriverExample(String uri, String user, String password) {
        driver = GraphDatabase.driver(
            uri,
            AuthTokens.basic(user, password),
            Config.builder()
                .withMaxConnectionPoolSize(50)
                .withConnectionAcquisitionTimeout(30, TimeUnit.SECONDS)
                .withConnectionTimeout(10, TimeUnit.SECONDS)
                .withFetchSize(1000)
                .withLogging(Logging.slf4j())
                .build()
        );
    }

    // 自动提交事务
    public void createPerson(String name, int age) {
        try (Session session = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.WRITE))) {
            session.run(
                "CREATE (p:Person {name: $name, age: $age})",
                Map.of("name", name, "age", age)
            );
        }
    }

    // 显式事务（可控制提交/回滚）
    public void createMovieWithRetry(String title, int year) {
        try (Session session = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.WRITE))) {
            session.executeWrite(tx -> {
                // 检查是否已存在
                Result existing = tx.run(
                    "MATCH (m:Movie {title: $title}) RETURN m",
                    Map.of("title", title)
                );
                if (existing.hasNext()) {
                    throw new RuntimeException("Movie already exists: " + title);
                }

                tx.run(
                    "CREATE (m:Movie {title: $title, released: $year})",
                    Map.of("title", title, "year", year)
                );
                return null;
            });
        }
    }

    // 带重试的事务（处理死锁和瞬态错误）
    public void createWithRetryLogic(String name, int age) {
        int maxRetries = 3;
        int attempt = 0;

        while (attempt < maxRetries) {
            try (Session session = driver.session()) {
                session.executeWrite(tx -> {
                    tx.run(
                        "CREATE (p:Person {name: $name, age: $age})",
                        Map.of("name", name, "age", age)
                    );
                    return null;
                });
                break; // 成功则退出循环
            } catch (TransientException e) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw new RuntimeException("Transaction failed after retries", e);
                }
                try {
                    Thread.sleep((long) Math.pow(2, attempt) * 100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException(ie);
                }
            }
        }
    }

    // 批量插入（使用 UNWIND）
    public void batchCreate(List<Map<String, Object>> persons) {
        try (Session session = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.WRITE))) {
            session.executeWrite(tx -> {
                tx.run(
                    "UNWIND $persons AS person " +
                    "CREATE (p:Person {name: person.name, age: person.age})",
                    Map.of("persons", persons)
                );
                return null;
            });
        }
    }

    // 异步查询
    public CompletionStage<List<String>> findActorsAsync(String movieTitle) {
        try (Session session = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.READ))) {
            return session.executeReadAsync(tx ->
                tx.runAsync(
                    "MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title: $title}) " +
                    "RETURN p.name AS name ORDER BY p.name",
                    Map.of("title", movieTitle)
                ).thenCompose(cursor ->
                    cursor.listAsync(record -> record.get("name").asString())
                )
            );
        }
    }

    // 使用书签保证因果一致性
    public void causalConsistencyDemo() {
        Bookmark bookmark;
        try (Session session = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.WRITE))) {
            session.run("CREATE (p:Person {name: 'Charlie'})");
            bookmark = session.lastBookmark();
        }

        // 确保后续读取能看到刚写入的数据
        try (Session readSession = driver.session(
                SessionConfig.forDatabase("neo4j")
                    .withDefaultAccessMode(AccessMode.READ)
                    .withBookmarks(bookmark))) {
            Result result = readSession.run(
                "MATCH (p:Person {name: 'Charlie'}) RETURN p"
            );
            System.out.println("Found: " + result.hasNext());
        }
    }

    @Override
    public void close() {
        driver.close();
    }

    public static void main(String[] args) {
        try (BoltDriverExample example = new BoltDriverExample(
                "bolt://localhost:7687", "neo4j", "password")) {
            example.createPerson("Alice", 32);
            example.createWithRetryLogic("Bob", 28);
            example.batchCreate(List.of(
                Map.of("name", "Charlie", "age", 25),
                Map.of("name", "Diana", "age", 30)
            ));
            example.causalConsistencyDemo();
        }
    }
}
```

### 8.6.4 使用场景

| 模式 | 适用场景 | 不适用场景 |
|------|---------|-----------|
| 嵌入式 | 桌面工具、ETL 管道、单机服务 | 微服务、多进程访问 |
| Bolt 驱动 | 微服务、Web 应用、跨语言 | 对延迟有极致要求（<1ms） |

### 8.6.5 潜在风险与注意事项

- **嵌入式模式**：多个 JVM 进程不能同时挂载同一个数据库目录，否则存储文件损坏
- **Bolt 连接池**：默认连接池大小受 `dbms.connector.bolt.max_connections` 限制，客户端连接池不应超过服务端上限
- **事务管理**：`try-with-resources` 中的事务在退出块时自动回滚（如果未调用 `commit()`），务必在成功路径上调用 `commit()`
- **异步 API**：`executeWriteAsync` 返回的 `CompletionStage` 必须被消费，否则异常被吞没

### 8.6.6 本章小结

嵌入式模式适合对延迟敏感的单机应用，Bolt 驱动适合分布式微服务架构。无论哪种模式，核心原则一致：短事务、显式提交、实现重试逻辑处理瞬态错误。

---

## 8.7 Spring Data Neo4j 集成

### 8.7.1 解决的问题

在 Spring 生态中，开发者希望以声明式的方式操作图数据库，避免编写样板代码。Spring Data Neo4j（SDN）提供与 Spring Data JPA 类似的编程模型：注解驱动的实体映射、派生查询方法、模板 API。

### 8.7.2 核心原理

#### 实体映射

SDN 使用注解将 Java 对象映射为图实体：

| 注解 | 作用 | 对应图概念 |
|------|------|-----------|
| `@Node` | 标记实体类 | 节点标签 |
| `@Relationship` | 标记关联字段 | 关系 |
| `@Id` | 标记主键 | 节点 ID 或业务主键 |
| `@GeneratedValue` | 自动生成 ID | 内部 ID 或 UUID |
| `@Property` | 标记属性字段 | 节点/关系属性 |

#### Neo4jTemplate

`Neo4jTemplate` 是 SDN 的核心模板类，提供：

- `save(entity)`：保存实体（创建或更新）
- `findById(id, class)`：按 ID 查找
- `findAll(class)`：查找所有
- `delete(entity)`：删除实体及其关系
- `findAll(query, class)`：使用 Cypher 查询

#### 派生查询

SDN 支持从方法名派生 Cypher 查询：

```java
interface PersonRepository extends Neo4jRepository<Person, String> {
    List<Person> findByName(String name);
    List<Person> findByNameAndAgeGreaterThan(String name, int age);
    List<Person> findByFriendsName(String friendName);
}
```

### 8.7.3 代码实现

#### Maven 依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-neo4j</artifactId>
</dependency>
```

#### 实体定义

```java
import org.springframework.data.neo4j.core.schema.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;

import java.util.*;

@Node("Person")
public class Person {

    @Id
    @GeneratedValue
    private Long id;

    @Property("name")
    private String name;

    @Property("age")
    private Integer age;

    @Property("born")
    private Integer birthYear;

    @Relationship(type = "ACTED_IN", direction = Relationship.Direction.OUTGOING)
    private List<Movie> actedIn = new ArrayList<>();

    @Relationship(type = "FRIEND", direction = Relationship.Direction.OUTGOING)
    private List<Person> friends = new ArrayList<>();

    @Relationship(type = "REVIEWED", direction = Relationship.Direction.OUTGOING)
    private List<Review> reviews = new ArrayList<>();

    @Version
    private Long version;

    public Person() {}

    public Person(String name, Integer age) {
        this.name = name;
        this.age = age;
    }

    // getters / setters
    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }
    public List<Movie> getActedIn() { return actedIn; }
    public void setActedIn(List<Movie> actedIn) { this.actedIn = actedIn; }
    public List<Person> getFriends() { return friends; }
    public void setFriends(List<Person> friends) { this.friends = friends; }
    public List<Review> getReviews() { return reviews; }
    public void setReviews(List<Review> reviews) { this.reviews = reviews; }
}

@Node("Movie")
public class Movie {

    @Id
    @GeneratedValue
    private Long id;

    @Property("title")
    private String title;

    @Property("released")
    private Integer released;

    @Property("tagline")
    private String tagline;

    @Relationship(type = "ACTED_IN", direction = Relationship.Direction.INCOMING)
    private List<Person> actors = new ArrayList<>();

    public Movie() {}

    public Movie(String title, Integer released) {
        this.title = title;
        this.released = released;
    }

    // getters / setters
    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public Integer getReleased() { return released; }
    public void setReleased(Integer released) { this.released = released; }
    public List<Person> getActors() { return actors; }
    public void setActors(List<Person> actors) { this.actors = actors; }
}

@RelationshipProperties
public class Review {

    @Id
    @GeneratedValue
    private Long id;

    @Property("rating")
    private Integer rating;

    @Property("summary")
    private String summary;

    @TargetNode
    private Movie movie;

    public Review() {}

    public Review(Integer rating, String summary, Movie movie) {
        this.rating = rating;
        this.summary = summary;
        this.movie = movie;
    }

    // getters / setters
    public Long getId() { return id; }
    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public Movie getMovie() { return movie; }
    public void setMovie(Movie movie) { this.movie = movie; }
}
```

#### Repository 层

```java
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PersonRepository extends Neo4jRepository<Person, Long> {

    // 派生查询
    Optional<Person> findByName(String name);

    List<Person> findByAgeGreaterThan(int age);

    List<Person> findByNameContainingIgnoreCase(String namePart);

    // 自定义 Cypher 查询
    @Query("MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title: $title}) RETURN p")
    List<Person> findActorsInMovie(String title);

    @Query("MATCH (p:Person)-[:FRIEND]->(f:Person) " +
           "WHERE p.name = $name " +
           "RETURN f ORDER BY f.age DESC LIMIT $limit")
    List<Person> findFriendsOf(String name, int limit);

    @Query("MATCH (p:Person {name: $name})-[:FRIEND*1..3]->(fof:Person) " +
           "WHERE NOT (p)-[:FRIEND]->(fof) AND p <> fof " +
           "RETURN DISTINCT fof")
    List<Person> findFriendOfFriend(String name);

    @Query("MATCH (p:Person)-[:ACTED_IN]->(m:Movie) " +
           "WITH p, count(m) AS movieCount " +
           "WHERE movieCount >= $minMovies " +
           "RETURN p ORDER BY movieCount DESC")
    List<Person> findFrequentActors(int minMovies);
}

@Repository
public interface MovieRepository extends Neo4jRepository<Movie, Long> {

    Optional<Movie> findByTitle(String title);

    @Query("MATCH (m:Movie) WHERE m.released >= $year RETURN m ORDER BY m.released")
    List<Movie> findMoviesReleasedAfter(int year);

    @Query("MATCH (p:Person)-[:ACTED_IN]->(m:Movie) " +
           "WHERE p.name = $actorName " +
           "RETURN m, p " +
           "ORDER BY m.released DESC")
    List<Movie> findMoviesByActor(String actorName);
}
```

#### Service 层

```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MovieGraphService {

    private final PersonRepository personRepo;
    private final MovieRepository movieRepo;
    private final Neo4jTemplate neo4jTemplate;

    public MovieGraphService(PersonRepository personRepo,
                             MovieRepository movieRepo,
                             Neo4jTemplate neo4jTemplate) {
        this.personRepo = personRepo;
        this.movieRepo = movieRepo;
        this.neo4jTemplate = neo4jTemplate;
    }

    @Transactional
    public Person createActorWithMovie(String actorName, int age,
                                        String movieTitle, int year) {
        Person actor = new Person(actorName, age);
        Movie movie = new Movie(movieTitle, year);
        actor.getActedIn().add(movie);
        return personRepo.save(actor);
    }

    @Transactional
    public void addFriendship(String person1, String person2) {
        Person p1 = personRepo.findByName(person1)
            .orElseThrow(() -> new RuntimeException("Person not found: " + person1));
        Person p2 = personRepo.findByName(person2)
            .orElseThrow(() -> new RuntimeException("Person not found: " + person2));
        p1.getFriends().add(p2);
        p2.getFriends().add(p1);
        personRepo.save(p1);
        personRepo.save(p2);
    }

    @Transactional(readOnly = true)
    public List<Person> getFriendRecommendations(String name) {
        return personRepo.findFriendOfFriend(name);
    }

    // 使用 Neo4jTemplate 执行自定义操作
    @Transactional
    public void updateActorAge(String name, int newAge) {
        neo4jTemplate.findOne("MATCH (p:Person {name: $0}) RETURN p",
                              Map.of("0", name), Person.class)
            .ifPresent(person -> {
                person.setAge(newAge);
                personRepo.save(person);
            });
    }
}
```

#### 配置

```yaml
# application.yml
spring:
  neo4j:
    uri: bolt://localhost:7687
    authentication:
      username: neo4j
      password: password
    pool:
      max-connection-pool-size: 50
      connection-acquisition-timeout: 30s
      connection-timeout: 10s
      max-transaction-retry-time: 30s

  data:
    neo4j:
      database: neo4j
```

#### 响应式支持

```java
import org.springframework.data.neo4j.repository.ReactiveNeo4jRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Repository
public interface ReactivePersonRepository
        extends ReactiveNeo4jRepository<Person, Long> {

    Mono<Person> findByName(String name);

    Flux<Person> findByAgeGreaterThan(int age);

    @Query("MATCH (p:Person)-[:FRIEND]->(f:Person) " +
           "WHERE p.name = $name RETURN f")
    Flux<Person> findFriendsReactive(String name);
}

// 响应式 Service
@Service
public class ReactiveMovieService {

    private final ReactivePersonRepository personRepo;
    private final ReactiveNeo4jTemplate neo4jTemplate;

    public ReactiveMovieService(ReactivePersonRepository personRepo,
                                ReactiveNeo4jTemplate neo4jTemplate) {
        this.personRepo = personRepo;
        this.neo4jTemplate = neo4jTemplate;
    }

    public Flux<Person> findActorsInMovieReactive(String movieTitle) {
        return neo4jTemplate.findAll(
            "MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title: $0}) RETURN p",
            Map.of("0", movieTitle), Person.class
        );
    }
}
```

### 8.7.4 使用场景

- Spring Boot 微服务中集成图数据库
- 需要声明式事务管理的企业应用
- 需要响应式编程支持的高并发场景
- 已有 Spring Data JPA 经验的团队迁移

### 8.7.5 潜在风险与注意事项

- **N+1 查询问题**：`@Relationship` 默认懒加载，遍历关联集合时可能触发多次查询。使用 `@Query` 自定义查询或 `@EntityGraph` 预加载
- **深度保存**：`save()` 默认级联保存所有关联实体，可能导致意外创建重复节点。使用 `@DynamicLabels` 和 `@Relationship(type = "...", cascade = {CascadeType.PERSIST})` 控制级联行为
- **乐观锁**：`@Version` 注解使用整数版本号，每次更新递增。并发冲突时抛出 `OptimisticLockingFailureException`
- **映射性能**：大量实体的映射（>1000 条）可能成为瓶颈，考虑使用 `Neo4jClient` 直接操作 Map 结果
- **关系属性**：使用 `@RelationshipProperties` 注解的类来建模带属性的关系，而非简单关联

### 8.7.6 本章小结

Spring Data Neo4j 将图数据库的操作抽象为熟悉的 Repository 模式，大幅降低学习成本。关键最佳实践：合理控制级联保存范围、使用自定义 `@Query` 避免 N+1、为高频查询字段建索引、利用 `@Version` 实现乐观并发控制。

---

## 8.8 性能调优

### 8.8.1 解决的问题

Neo4j 的性能瓶颈通常不在 CPU，而在 I/O 和内存。调优的核心目标是：最大化 Page Cache 命中率、最小化随机 I/O、合理配置 JVM 堆内存。

### 8.8.2 核心原理

#### Page Cache

Neo4j 使用 **内存映射文件（Memory-Mapped Files, MMAP）** 技术管理磁盘数据。Page Cache 是操作系统级别的缓存，Neo4j 通过 `pagecache.memory` 配置其大小。

```
┌─────────────────────────────────────────┐
│            JVM Heap                      │
│  (对象实例、查询执行、事务状态)            │
├─────────────────────────────────────────┤
│         Page Cache (MMAP)                │
│  (节点/关系/属性记录的缓存)               │
├─────────────────────────────────────────┤
│            Disk                          │
│  (neostore.*.db 文件)                    │
└─────────────────────────────────────────┘
```

Page Cache 命中率公式：

```
命中率 = 缓存中的页 / 总访问页
```

当 Page Cache 足够容纳整个图数据库时，所有读操作都是内存操作，无磁盘 I/O。

#### 内存配置黄金法则

```
总内存 = Page Cache + Heap + OS 预留

推荐分配：
  Page Cache = min(总内存 × 70%, 数据库文件总大小)
  Heap       = 总内存 × 20% (通常 4-16 GB)
  OS 预留    = 总内存 × 10%
```

#### 索引配置

索引类型选择：

| 查询模式 | 推荐索引类型 | 说明 |
|---------|-------------|------|
| `WHERE n.name = 'Alice'` | BTREE | 精确匹配 |
| `WHERE n.age > 30` | BTREE | 范围查询 |
| `WHERE n.name CONTAINS 'Ali'` | TEXT | 全文搜索 |
| `WHERE distance(p.location, $point) < 1000` | POINT | 空间查询 |

### 8.8.3 配置实现

```properties
# neo4j.conf — 性能调优配置

# Page Cache：建议为数据库文件总大小的 70-80%
# 如果数据库 10GB，设置 8GB
dbms.memory.pagecache.size=8G

# 堆内存：建议 4-16GB，不超过 32GB（避免 JVM 压缩指针失效）
dbms.memory.heap.initial_size=4G
dbms.memory.heap.max_size=8G

# 事务配置
dbms.tx_state.memory_allocation=ON_HEAP  # 事务状态放在堆内
dbms.tx_state.max_off_heap_memory=2G     # 离堆事务内存上限

# 连接器
dbms.connector.bolt.enabled=true
dbms.connector.bolt.listen_address=:7687
dbms.connector.bolt.max_connections=500

# 索引
dbms.index.default_schema_provider=range-1.0  # 默认索引类型

# 查询超时
dbms.transaction.timeout=60s
dbms.statement.timeout=30s
```

#### 索引创建

```cypher
// 创建单属性索引
CREATE INDEX person_name_index FOR (p:Person) ON (p.name);

// 创建复合索引
CREATE INDEX person_name_age_index FOR (p:Person) ON (p.name, p.age);

// 创建全文索引
CREATE TEXT INDEX person_bio_index FOR (p:Person) ON (p.bio);

// 创建空间索引
CREATE POINT INDEX location_index FOR (p:Person) ON (p.location);

// 创建唯一约束（自动创建索引）
CREATE CONSTRAINT unique_person_name FOR (p:Person) REQUIRE p.name IS UNIQUE;

// 创建存在约束
CREATE CONSTRAINT person_age_exists FOR (p:Person) REQUIRE p.age IS NOT NULL;
```

#### 查询调优

```cypher
// 使用 PROFILE 分析查询
PROFILE MATCH (p:Person)-[:FRIEND]->(f:Person)
WHERE p.name = 'Alice'
RETURN f.name, f.age
ORDER BY f.age DESC
LIMIT 10;

// 使用索引提示强制优化器选择索引
MATCH (p:Person)
USING INDEX p:Person(name)
WHERE p.name = 'Alice'
RETURN p;

// 避免全标签扫描
// 差：无索引时触发 NodeByLabelScan
MATCH (p:Person) WHERE p.email = 'alice@example.com' RETURN p;

// 好：为 email 建索引后触发 NodeIndexSeek
CREATE INDEX person_email_index FOR (p:Person) ON (p.email);
```

#### 批量导入优化

```java
// 使用 UNWIND 批量操作（比逐条 CREATE 快 10-100 倍）
try (Session session = driver.session()) {
    session.executeWrite(tx -> {
        tx.run(
            "UNWIND $batch AS row " +
            "MERGE (p:Person {name: row.name}) " +
            "SET p.age = row.age, p.born = row.born",
            Map.of("batch", List.of(
                Map.of("name", "Alice", "age", 32, "born", 1992),
                Map.of("name", "Bob", "age", 28, "born", 1996)
            ))
        );
        return null;
    });
}

// 使用 PERIODIC COMMIT 分批提交（大数据量导入）
:auto USING PERIODIC COMMIT 1000
LOAD CSV FROM 'file:///users.csv' AS row
MERGE (p:Person {id: row[0]})
SET p.name = row[1], p.age = toInteger(row[2]);
```

### 8.8.4 使用场景

| 场景 | 调优重点 |
|------|---------|
| OLTP（在线事务处理） | Page Cache 命中率、事务大小、索引 |
| OLAP（分析查询） | 堆内存、查询超时、结果集限制 |
| 批量导入 | 事务大小、PERIODIC COMMIT、禁用索引后重建 |
| 高并发读写 | 连接池、锁超时、死锁检测 |

### 8.8.5 潜在风险与注意事项

- **Page Cache 过大**：超过物理内存会导致操作系统交换（swapping），性能断崖式下降
- **堆内存过大**：超过 32GB 时 JVM 压缩指针失效，GC 暂停时间增加。建议不超过 31GB
- **索引维护成本**：每次写入都需要更新索引，过多索引降低写入性能。建议只为高频查询字段建索引
- **PROFILE 的代价**：`PROFILE` 会实际执行查询并收集统计信息，对生产数据库有性能影响。使用 `EXPLAIN` 做计划分析，`PROFILE` 在测试环境执行
- **事务大小**：单个事务处理超过 10 万条记录可能导致堆内存溢出和锁超时

### 8.8.6 本章小结

Neo4j 性能调优的核心是内存管理：Page Cache 决定读性能，堆内存决定事务处理能力，索引决定查询路径。调优的起点是监控——使用 `dbms.listQueries()`、`CALL db.indexes()`、`CALL db.stats.retrieve('GRAPH')` 等内置工具持续观察系统状态，基于数据驱动调优而非猜测。

---

## 8.9 综合实战：构建电影推荐系统

### 8.9.1 系统设计

本节综合运用前述知识，构建一个完整的电影推荐系统，涵盖数据模型设计、Spring Data Neo4j 集成、推荐算法实现、性能优化。

#### 数据模型

```
(Person)-[:ACTED_IN {role}]→(Movie)
(Person)-[:DIRECTED]→(Movie)
(Person)-[:FRIEND]→(Person)
(Person)-[:REVIEWED {rating, summary}]→(Movie)
(Movie)-[:HAS_GENRE]→(Genre)
```

### 8.9.2 代码实现

```java
// 推荐引擎核心
@Service
public class RecommendationEngine {

    private final Neo4jTemplate neo4jTemplate;

    public RecommendationEngine(Neo4jTemplate neo4jTemplate) {
        this.neo4jTemplate = neo4jTemplate;
    }

    // 基于朋友的推荐：朋友看过且评分高的电影
    public List<Movie> recommendByFriends(String personName, int limit) {
        return neo4jTemplate.findAll(
            """
            MATCH (p:Person {name: $0})-[:FRIEND]->(friend:Person)
            MATCH (friend)-[r:REVIEWED]->(m:Movie)
            WHERE r.rating >= 4
            AND NOT EXISTS {
                MATCH (p)-[:REVIEWED|ACTED_IN]->(m)
            }
            RETURN m, collect(friend.name) AS recommenders,
                   avg(r.rating) AS avgRating
            ORDER BY avgRating DESC
            LIMIT $1
            """,
            Map.of("0", personName, "1", limit),
            Movie.class
        );
    }

    // 基于协同过滤的推荐：相似用户喜欢的电影
    public List<Movie> recommendBySimilarUsers(String personName, int limit) {
        return neo4jTemplate.findAll(
            """
            MATCH (p:Person {name: $0})
            MATCH (p)-[:REVIEWED]->(m:Movie)
            WITH p, collect(m) AS myMovies

            MATCH (other:Person)-[:REVIEWED]->(m:Movie)
            WHERE other <> p AND m IN myMovies
            WITH p, other, count(m) AS commonMovies
            WHERE commonMovies >= 2

            MATCH (other)-[r:REVIEWED]->(rec:Movie)
            WHERE NOT EXISTS {
                MATCH (p)-[:REVIEWED|ACTED_IN]->(rec)
            }
            RETURN rec, avg(r.rating) AS score,
                   count(other) AS userCount
            ORDER BY score DESC, userCount DESC
            LIMIT $1
            """,
            Map.of("0", personName, "1", limit),
            Movie.class
        );
    }

    // 基于内容的推荐：同类型电影
    public List<Movie> recommendByGenre(String personName, int limit) {
        return neo4jTemplate.findAll(
            """
            MATCH (p:Person {name: $0})-[:REVIEWED]->(m:Movie)
            MATCH (m)-[:HAS_GENRE]->(g:Genre)
            WITH p, collect(DISTINCT g) AS preferredGenres

            MATCH (rec:Movie)-[:HAS_GENRE]->(g:Genre)
            WHERE g IN preferredGenres
            AND NOT EXISTS {
                MATCH (p)-[:REVIEWED|ACTED_IN]->(rec)
            }
            RETURN rec, count(g) AS genreMatch
            ORDER BY genreMatch DESC, rec.released DESC
            LIMIT $1
            """,
            Map.of("0", personName, "1", limit),
            Movie.class
        );
    }

    // 混合推荐（加权融合）
    public List<Map<String, Object>> hybridRecommend(String personName, int limit) {
        return neo4jTemplate.findAll(
            """
            CALL {
                MATCH (p:Person {name: $0})-[:FRIEND]->(f:Person)
                MATCH (f)-[r:REVIEWED]->(m:Movie)
                WHERE r.rating >= 4
                RETURN m, 0.5 AS weight
            }
            UNION
            CALL {
                MATCH (p:Person {name: $0})-[:REVIEWED]->(m:Movie)
                MATCH (m)-[:HAS_GENRE]->(g:Genre)
                MATCH (rec:Movie)-[:HAS_GENRE]->(g:Genre)
                WHERE NOT EXISTS {
                    MATCH (p)-[:REVIEWED|ACTED_IN]->(rec)
                }
                RETURN rec AS m, 0.3 AS weight
            }
            UNION
            CALL {
                MATCH (p:Person {name: $0})
                MATCH (p)-[:REVIEWED]->(m:Movie)
                WITH p, collect(m) AS myMovies
                MATCH (other:Person)-[:REVIEWED]->(m:Movie)
                WHERE other <> p AND m IN myMovies
                WITH p, other, count(m) AS commonMovies
                WHERE commonMovies >= 2
                MATCH (other)-[r:REVIEWED]->(rec:Movie)
                WHERE NOT EXISTS {
                    MATCH (p)-[:REVIEWED|ACTED_IN]->(rec)
                }
                RETURN rec AS m, 0.2 AS weight
            }
            RETURN m.title AS title, sum(weight) AS score
            ORDER BY score DESC
            LIMIT $1
            """,
            Map.of("0", personName, "1", limit),
            "Map"
        );
    }
}
```

### 8.9.3 性能优化

```cypher
// 为推荐查询创建复合索引
CREATE INDEX person_name_index FOR (p:Person) ON (p.name);
CREATE INDEX movie_title_index FOR (m:Movie) ON (m.title);
CREATE INDEX review_rating_index FOR ()-[r:REVIEWED]-() ON (r.rating);

// 使用 PROFILE 验证索引命中
PROFILE MATCH (p:Person {name: 'Alice'})
       -[:FRIEND]->(friend:Person)
       -[r:REVIEWED]->(m:Movie)
WHERE r.rating >= 4
RETURN m.title;
```

### 8.9.4 本章小结

综合实战展示了 Neo4j 在推荐系统中的典型应用模式。核心要点：利用图遍历天然表达关联关系、使用 Cypher 的复杂模式匹配实现推荐算法、通过索引和查询优化保证性能、利用 Spring Data Neo4j 简化集成。

---

## 8.10 本章总结

Neo4j 作为原生图数据库的标杆产品，其核心竞争力在于：

1. **存储即遍历**：固定大小记录 + 物理指针的设计，使图遍历操作与数据规模解耦
2. **声明式查询**：Cypher 优化器将高级查询转化为高效执行计划
3. **ACID 事务**：记录级锁 + 按 ID 升序锁定协议，在保证一致性的同时最大化并发
4. **弹性集群**：Raft 共识 + 因果一致性，支持跨地域部署
5. **生态完善**：Java API、Spring Data Neo4j、Bolt 协议覆盖从嵌入式到微服务的全场景

生产部署的关键原则：
- **内存为王**：Page Cache 是性能的基石，确保其足够容纳热数据
- **索引精准**：为高频查询字段建索引，但避免过度索引拖慢写入
- **事务短小**：单事务处理记录数控制在万级，避免锁竞争和内存溢出
- **监控先行**：使用 `PROFILE`、`dbms.listQueries()`、JMX 指标持续观察系统状态
