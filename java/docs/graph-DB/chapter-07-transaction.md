# 第7章 图数据库事务与一致性

## 7.1 概述

关系数据库领域的事务理论已经非常成熟，ACID 属性被广泛理解和实现。然而，图数据库由于其数据模型的特殊性——顶点和边形成高度关联的网状结构，一个事务可能跨越数十万个节点和边——对事务和一致性提出了独特的挑战。

图数据库的事务核心矛盾在于：**图遍历的局部性**与**分布式系统的全局一致性**之间的张力。在单机上，一个深度遍历可能触及整个图；在分布式环境中，这个遍历可能跨越多个分区，使得传统的事务协议（如两阶段提交）代价高昂。

本章从工程实践出发，深入探讨图数据库事务的各个层面：从单机 ACID 实现到分布式一致性模型，从锁机制到 MVCC，从 CAP 权衡到实际编码模式。目标是为读者提供一套可操作的决策框架，帮助你在不同的图数据库产品和架构方案中做出合理选择。

---

## 7.2 ACID 事务在图数据库中的实现

### 7.2.1 解决的问题

ACID（Atomicity、Consistency、Isolation、Durability）是数据库事务的基石。在图数据库中，ACID 需要解决以下具体问题：

- **原子性**：批量插入 10 万个节点和 50 万条关系时，中间失败如何回滚？
- **一致性**：如何保证唯一性约束（如用户 ID 唯一）、属性类型约束、以及业务规则（如"经理不能管理自己的上级"）？
- **隔离性**：两个并发事务同时读取和修改同一子图时，如何避免脏读、不可重复读、幻读？
- **持久性**：事务提交后，如何保证即使系统崩溃也不会丢失数据？

### 7.2.2 核心原理

#### 原子性（Atomicity）

图数据库的原子性实现通常基于 **Write-Ahead Log（WAL）** 和 **事务日志**。

以 Neo4j 为例，其原子性保证机制如下：

1. 事务开始时，分配一个全局唯一的事务 ID
2. 所有修改先写入 **事务日志（transaction log）**，再应用到内存中的页缓存（page cache）
3. 提交时，先写 WAL（确保持久化），再标记事务为已提交
4. 如果事务中途崩溃，恢复时回放 WAL 中已提交的事务，回滚未提交的事务

```
事务执行流程：
  begin tx → 写事务日志 → 修改页缓存 → commit → 写 WAL → 标记完成
                                                      ↓ 崩溃恢复
                                              回放已提交事务 + 回滚未提交事务
```

#### 一致性（Consistency）

图数据库的一致性约束比关系数据库更丰富：

- **唯一性约束**：确保特定标签+属性组合唯一（如 `:User(id)`）
- **存在性约束**：确保关系两端节点存在（外键约束的图等价物）
- **属性类型约束**：确保属性值类型正确
- **节点/关系完整性**：不允许悬挂边（dangling edge）

Neo4j 在事务提交时进行约束检查，如果违反约束则整个事务回滚。

#### 隔离性（Isolation）

Neo4j 默认使用 **READ_COMMITTED** 隔离级别，并通过底层存储引擎的锁机制防止脏写。对于需要更高隔离级别的场景，可以使用显式锁（`FOR UPDATE` 语义）。

#### 持久性（Durability）

持久性依赖两个机制：

1. **WAL（Write-Ahead Log）**：所有修改在应用到数据文件之前必须先写入日志
2. **Checkpointing**：定期将内存中的脏页刷新到磁盘数据文件，并截断 WAL

### 7.2.3 代码/配置实现

#### Neo4j Java 事务示例

```java
import org.neo4j.driver.*;
import org.neo4j.driver.Transaction;

public class Neo4jTransactionExample {

    private final Driver driver;

    public Neo4jTransactionExample(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * 原子性转账操作：从一个账户扣款并给另一个账户加款
     * 两个操作必须在同一个事务中，要么全部成功，要么全部失败
     */
    public void transferFunds(String fromAccountId, String toAccountId, BigDecimal amount) {
        try (Session session = driver.session(SessionConfig.forDatabase("neo4j"))) {
            session.writeTransaction(tx -> {
                // 第一步：检查源账户余额
                Result checkResult = tx.run(
                    "MATCH (a:Account {id: $fromId}) RETURN a.balance AS balance",
                    Parameters.with("fromId", fromAccountId)
                );
                if (!checkResult.hasNext()) {
                    throw new RuntimeException("源账户不存在: " + fromAccountId);
                }
                double currentBalance = checkResult.single().get("balance").asDouble();
                if (currentBalance < amount.doubleValue()) {
                    throw new RuntimeException("余额不足: 当前 " + currentBalance
                        + ", 需要 " + amount);
                }

                // 第二步：扣款
                tx.run(
                    "MATCH (a:Account {id: $fromId}) " +
                    "SET a.balance = a.balance - $amount",
                    Parameters.with("fromId", fromAccountId).with("amount", amount.doubleValue())
                );

                // 第三步：加款
                tx.run(
                    "MATCH (a:Account {id: $toId}) " +
                    "SET a.balance = a.balance + $amount",
                    Parameters.with("toId", toAccountId).with("amount", amount.doubleValue())
                );

                // 第四步：记录转账日志（图审计轨迹）
                tx.run(
                    "MATCH (from:Account {id: $fromId}), (to:Account {id: $toId}) " +
                    "CREATE (from)-[:TRANSFERRED {amount: $amount, timestamp: datetime()}]->(to)",
                    Parameters.with("fromId", fromAccountId)
                        .with("toId", toAccountId)
                        .with("amount", amount.doubleValue())
                );

                return null; // 事务自动提交
            });
        } catch (Exception e) {
            System.err.println("转账失败，事务已回滚: " + e.getMessage());
            throw e;
        }
    }

    /**
     * 使用显式事务控制（手动提交/回滚）
     */
    public void explicitTransactionExample() {
        try (Session session = driver.session()) {
            Transaction tx = session.beginTransaction();
            try {
                tx.run("CREATE (n:TestNode {id: $id})", Parameters.with("id", "test-1"));
                // 模拟业务检查
                if (someBusinessCheckFails()) {
                    tx.rollback();
                    return;
                }
                tx.commit();
            } catch (Exception e) {
                tx.rollback();
                throw e;
            }
        }
    }

    private boolean someBusinessCheckFails() {
        return false;
    }

    public void close() {
        driver.close();
    }
}
```

#### Neo4j 约束配置

```cypher
// 创建唯一性约束
CREATE CONSTRAINT unique_user_email IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE;

// 创建属性存在约束
CREATE CONSTRAINT user_name_exists IF NOT EXISTS
FOR (u:User) REQUIRE u.name IS NOT NULL;

// 创建节点键约束（复合唯一）
CREATE CONSTRAINT user_identity IF NOT EXISTS
FOR (u:User) REQUIRE (u.id, u.source) IS NODE KEY;

// 创建关系唯一性约束
CREATE CONSTRAINT unique_friendship IF NOT EXISTS
FOR ()-[r:FRIENDS_WITH]-() REQUIRE r.since IS NOT NULL;
```

#### JanusGraph 事务配置

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.core.JanusGraphTransaction;
import org.janusgraph.core.JanusGraphVertex;
import org.janusgraph.graphdb.database.StandardJanusGraph;

public class JanusGraphTransactionExample {

    private final JanusGraph graph;

    public JanusGraphTransactionExample(String configFile) {
        this.graph = JanusGraphFactory.open(configFile);
    }

    /**
     * JanusGraph 显式事务控制
     * JanusGraph 默认使用自动事务（每个操作自动提交），
     * 但建议显式控制事务边界
     */
    public void createUserWithFriends() {
        JanusGraphTransaction tx = graph.newTransaction();
        try {
            JanusGraphVertex user1 = tx.addVertex("User");
            user1.property("id", "u-001");
            user1.property("name", "张三");
            user1.property("email", "zhangsan@example.com");

            JanusGraphVertex user2 = tx.addVertex("User");
            user2.property("id", "u-002");
            user2.property("name", "李四");
            user2.property("email", "lisi@example.com");

            // 创建关系
            user1.addEdge("knows", user2);

            tx.commit();
        } catch (Exception e) {
            tx.rollback();
            throw new RuntimeException("创建用户失败", e);
        }
    }

    /**
     * JanusGraph 事务隔离级别设置
     */
    public void configureIsolation() {
        // 在 properties 文件中配置
        // storage.lock.wait-time=10000    -- 锁等待超时（毫秒）
        // storage.lock.retries=3          -- 锁重试次数
        // ids.block-size=10000            -- ID 块大小
        // cache.db-cache=true             -- 启用数据库缓存
        // cache.db-cache-clean-wait=20    -- 缓存清理等待时间
    }

    public void close() {
        graph.close();
    }
}
```

### 7.2.4 使用场景

| 场景 | 推荐事务策略 | 原因 |
|------|-------------|------|
| 金融转账 | 显式事务 + 约束检查 | 需要强 ACID 保证 |
| 社交关系批量导入 | 分批事务（每批 1K-10K 操作） | 避免大事务导致内存溢出 |
| 知识图谱构建 | 自动事务 + 定期 checkpoint | 读多写少，可接受弱一致性 |
| 实时推荐更新 | 短事务 + 乐观锁 | 高并发，低延迟要求 |

### 7.2.5 潜在风险与注意事项

1. **大事务风险**：一个事务修改超过 10 万个实体时，Neo4j 的事务日志会急剧膨胀，导致：
   - 内存压力增大（事务状态需要保持在内存中）
   - 恢复时间变长（崩溃后需要回放大量日志）
   - 锁竞争加剧（长时间持有锁）

2. **事务超时**：Neo4j 默认事务超时为 60 秒，超过此时间的事务会被强制回滚。可通过 `dbms.transaction.timeout` 配置。

3. **JanusGraph 自动事务陷阱**：JanusGraph 默认每个操作自动提交，这会导致：
   - 部分更新：如果创建节点和创建关系分属两个自动事务，中间崩溃会导致悬挂边
   - 性能下降：每个操作都触发提交和网络往返

4. **约束检查性能**：唯一性约束在提交时检查，对于大规模插入，约束检查可能成为瓶颈。建议在批量导入时先删除约束，导入完成后再重建。

### 7.2.6 本章小结

ACID 是图数据库事务的基石，但实现方式因存储引擎而异。Neo4j 作为原生图数据库，提供了完整的 ACID 支持，适合金融、供应链等需要强一致性的场景。JanusGraph 等基于宽表存储的图数据库在 ACID 方面有所取舍，通常只保证行级原子性而非跨分区事务原子性。理解每个产品的 ACID 实现边界，是做出正确技术选型的前提。

---

## 7.3 分布式图数据库一致性模型

### 7.3.1 解决的问题

当图数据库从单机扩展到集群时，一致性模型的选择直接决定了系统的行为特征：

- 读请求能否立即看到刚写入的数据？
- 不同节点上的并发读写是否会产生冲突？
- 网络分区发生时，系统应该优先保证可用性还是一致性？
- 如何在一致性、可用性和性能之间取得平衡？

### 7.3.2 核心原理

#### 强一致性（Strong Consistency）

**Neo4j Causal Clustering** 实现了因果一致性（Causal Consistency），这是强一致性的一种变体：

- **核心机制**：基于 Raft 共识算法，所有写操作必须通过领导者（Leader）节点
- **书签（Bookmark）**：客户端通过书签机制确保读取到至少与上次写入一样新的数据
- **读取偏好**：可以配置为从领导者读取（强一致）或从跟随者读取（最终一致）

```
Neo4j Causal Clustering 架构：

  客户端 A（写入）          客户端 B（读取）
      │                        │
      ▼                        ▼
   ┌──────┐              ┌──────────┐
   │Leader│──Raft复制──→│Follower 1│
   └──────┘              ├──────────┤
      │                  │Follower 2│
      │                  └──────────┘
      │
  写入确认（多数派写入成功）
```

#### 最终一致性（Eventual Consistency）

**JanusGraph + Cassandra** 组合是最终一致性的典型代表：

- Cassandra 使用 **Dynamo-style** 复制，默认使用最终一致性
- JanusGraph 在 Cassandra 之上实现图语义，但底层存储的一致性由 Cassandra 决定
- 写入时，数据异步复制到所有副本；读取时，可能读到旧版本数据
- 通过 **CL（Consistency Level）** 调节：`ONE`、`QUORUM`、`ALL`

#### 可调一致性（Tunable Consistency）

**NebulaGraph** 提供了可调一致性模型：

- 写操作：通过 Raft 组实现强一致写入
- 读操作：支持从领导者读取（强一致）或从跟随者读取（最终一致）
- 空间级别（Space）的隔离：不同图空间可以配置不同的一致性策略

### 7.3.3 代码/配置实现

#### Neo4j Causal Clustering 书签使用

```java
import org.neo4j.driver.*;
import org.neo4j.driver.TransactionConfig;
import java.time.Duration;

public class Neo4jCausalConsistencyExample {

    private final Driver driver;

    public Neo4jCausalConsistencyExample(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * 使用书签（Bookmark）实现因果一致性
     * 确保后续读取至少能看到当前写入的数据
     */
    public void causalConsistencyExample() {
        // 第一次会话：写入数据
        Bookmark bookmark;
        try (Session session = driver.session(
            SessionConfig.builder()
                .withDefaultAccessMode(AccessMode.WRITE)
                .build()
        )) {
            session.executeWrite(tx -> {
                tx.run("CREATE (u:User {id: 'u-100', name: '王五'})");
                return null;
            });
            // 获取当前会话的最后书签
            bookmark = session.lastBookmark();
            System.out.println("写入完成，书签: " + bookmark);
        }

        // 第二次会话：使用书签确保读取到最新数据
        try (Session session = driver.session(
            SessionConfig.builder()
                .withBookmarks(bookmark)  // 关键：传递书签
                .withDefaultAccessMode(AccessMode.READ)
                .build()
        )) {
            session.executeRead(tx -> {
                Result result = tx.run(
                    "MATCH (u:User {id: 'u-100'}) RETURN u.name AS name"
                );
                if (result.hasNext()) {
                    String name = result.single().get("name").asString();
                    System.out.println("读取到用户: " + name);
                }
                return null;
            });
        }
    }

    /**
     * 配置读取偏好
     */
    public void configureReadPreference() {
        // 从领导者读取（强一致）
        try (Session session = driver.session(
            SessionConfig.builder()
                .withDefaultAccessMode(AccessMode.READ)
                .withDatabase("neo4j")
                .build()
        )) {
            // 默认路由策略会优先从领导者读取
            // 可通过连接 URI 控制: neo4j://leader-host:7687
        }

        // 从跟随者读取（最终一致，降低领导者负载）
        // 使用 neo4j+s:// 或 neo4j+ssc:// 路由上下文
        // 在连接 URI 中指定: neo4j://cluster:7687?routing_context=reader
    }
}
```

#### JanusGraph + Cassandra 一致性配置

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.diskstorage.configuration.ModifiableConfiguration;
import org.janusgraph.diskstorage.configuration.WriteConfiguration;
import org.janusgraph.graphdb.configuration.GraphDatabaseConfiguration;
import static org.janusgraph.diskstorage.cassandra.AbstractCassandraStoreManager.*;

public class JanusGraphConsistencyConfig {

    /**
     * 通过配置文件控制一致性级别
     * 以下为 janusgraph-cassandra.properties 配置示例
     */
    public static String getCassandraConfig() {
        return """
            # 存储后端
            storage.backend=cassandra
            storage.hostname=192.168.1.10,192.168.1.11,192.168.1.12

            # Cassandra 一致性级别
            # ONE: 写入一个节点即返回（最终一致性，性能最好）
            # QUORUM: 写入多数派节点（强一致性，性能折中）
            # ALL: 写入所有节点（最强一致性，性能最差）
            storage.cassandra.write-consistency-level=QUORUM
            storage.cassandra.read-consistency-level=QUORUM

            # 缓存配置（降低对 Cassandra 的读压力）
            cache.db-cache=true
            cache.db-cache-clean-wait=20
            cache.db-cache-time=1800000  # 30 分钟缓存过期

            # 事务配置
            storage.lock.wait-time=10000
            storage.lock.retries=3
            """;
    }

    /**
     * 编程方式配置 JanusGraph
     */
    public JanusGraph createConfiguredGraph() {
        ModifiableConfiguration config = GraphDatabaseConfiguration.buildGraphConfiguration();
        config.set(GraphDatabaseConfiguration.STORAGE_BACKEND, "cassandra");
        config.set(GraphDatabaseConfiguration.STORAGE_HOSTS,
            new String[]{"192.168.1.10", "192.168.1.11", "192.168.1.12"});

        // 设置 Cassandra 读写一致性级别
        // 注意：这些配置项需要根据实际 JanusGraph 版本调整
        System.setProperty("storage.cassandra.write-consistency-level", "QUORUM");
        System.setProperty("storage.cassandra.read-consistency-level", "QUORUM");

        return JanusGraphFactory.open(config);
    }
}
```

#### NebulaGraph 一致性配置

```sql
-- NebulaGraph 创建图空间时配置副本数和分片数
CREATE SPACE IF NOT EXISTS social_network(
    partition_num = 10,
    replica_factor = 3
);

-- 使用图空间
USE social_network;

-- 创建标签
CREATE TAG IF NOT EXISTS person(name string, age int);
CREATE EDGE IF NOT EXISTS friend(start int, end int);

-- 读取偏好设置（在客户端连接时配置）
-- nebula-java 客户端连接示例：
-- SessionPool pool = new SessionPool(
--     "social_network",
--     true,  // enableSSL
--     List.of(new HostAddress("192.168.1.10", 9669))
-- );
-- 
-- 读取策略：
-- 1. 默认：从领导者读取（强一致）
-- 2. 设置 read_from_follower=true 从跟随者读取（最终一致，降低领导者压力）
```

### 7.3.4 使用场景

| 一致性模型 | 适用场景 | 代表产品 |
|-----------|---------|---------|
| 强一致 | 金融交易、权限控制、库存管理 | Neo4j Causal Clustering |
| 因果一致 | 社交网络、内容管理、用户会话 | Neo4j（书签模式） |
| 最终一致 | 推荐系统、知识图谱、日志分析 | JanusGraph + Cassandra |
| 可调一致 | 混合负载、多租户系统 | NebulaGraph |

### 7.3.5 潜在风险与注意事项

1. **书签泄漏**：在 Neo4j 中，书签对象会随着时间增长而增大，长期持有书签可能导致内存泄漏。建议在会话结束时丢弃书签。

2. **Cassandra 的轻量级事务（LWT）**：JanusGraph 使用 Cassandra 的 LWT 实现唯一性约束，但 LWT 性能较差（4-5 倍于普通写入），高并发下容易超时。

3. **读修复（Read Repair）**：在最终一致性模型中，读操作可能触发读修复，导致读取延迟抖动。对于延迟敏感的场景，建议使用 QUORUM 级别。

4. **时钟偏差**：最终一致性系统依赖时间戳进行冲突解决，节点间时钟偏差会导致数据版本混乱。建议部署 NTP 服务并监控时钟偏差。

### 7.3.6 本章小结

一致性模型的选择本质上是**业务需求**和**系统能力**之间的权衡。Neo4j 的因果一致性通过书签机制提供了灵活的一致性边界——在同一个用户会话内保证强一致，跨会话则允许最终一致。JanusGraph 的最终一致性模型适合大规模、高吞吐的场景，但需要应用层处理数据冲突。NebulaGraph 的可调一致性提供了最大的灵活性，但也要求开发者深入理解一致性模型的行为。

---

## 7.4 CAP 定理在图数据库中的实践

### 7.4.1 解决的问题

CAP 定理指出，分布式系统在一致性（Consistency）、可用性（Availability）和分区容错性（Partition Tolerance）三者中最多只能同时满足两个。图数据库作为分布式系统，必须面对这个根本性权衡：

- 当网络分区发生时，是拒绝写入以保持一致性（CP），还是接受写入但可能产生冲突（AP）？
- 图遍历操作在跨分区时如何保证一致性？
- 如何在图查询的语义完整性和系统可用性之间做出选择？

### 7.4.2 核心原理

#### 图数据库的 CAP 分类

| 产品 | CAP 倾向 | 策略 |
|------|---------|------|
| Neo4j Causal Clustering | CP（强一致优先） | Raft 共识，多数派写入，分区时少数派节点拒绝写入 |
| JanusGraph + Cassandra | AP（可用性优先） | Dynamo 复制， hinted handoff，最终一致 |
| NebulaGraph | CP（可调） | Raft 组，支持 follower 读取 |
| Amazon Neptune | CP | 多 AZ 部署，强一致存储后端 |
| ArangoDB | CP/AP 可切换 | 支持不同集群的配置策略 |

#### 分区容忍性的图数据库挑战

图遍历天然具有跨分区特性。一个简单的 `MATCH (a)-[*1..5]->(b)` 查询可能跨越 5 个分区。在 CP 系统中，如果某个分区不可用，整个查询会失败；在 AP 系统中，查询可能返回不完整的结果。

```
跨分区图遍历的 CAP 困境：

分区 A（用户节点）         分区 B（订单节点）         分区 C（商品节点）
  ┌─────────┐            ┌──────────┐            ┌──────────┐
  │ 用户:张三 │──下单──→│ 订单:O001 │──包含──→│ 商品:P001 │
  └─────────┘            └──────────┘            └──────────┘
        │                     │                       │
        │←──网络分区──→│                       │
        │                     │                       │
  可用但可能过时          不可用（CP 策略）        不可用（CP 策略）
```

### 7.4.3 代码/配置实现

#### Neo4j CP 模式配置

```java
import org.neo4j.driver.*;
import org.neo4j.driver.exceptions.ServiceUnavailableException;

public class Neo4jCAPExample {

    private final Driver driver;

    public Neo4jCAPExample(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * CP 模式下的写入：必须通过领导者，多数派确认后才返回
     * 如果领导者不可用，自动选举新领导者（但选举期间不可写）
     */
    public void cpModeWrite(String userId, String property, Object value) {
        try (Session session = driver.session(
            SessionConfig.builder()
                .withDefaultAccessMode(AccessMode.WRITE)
                .build()
        )) {
            session.executeWrite(tx -> {
                tx.run(
                    "MATCH (u:User {id: $id}) SET u.$prop = $val",
                    Parameters.with("id", userId)
                        .with("prop", property)
                        .with("val", value)
                );
                return null;
            });
            System.out.println("CP 写入成功（多数派已确认）");
        } catch (ServiceUnavailableException e) {
            // 网络分区或领导者不可用
            System.err.println("CP 写入失败：集群不可用，请稍后重试");
            throw e;
        }
    }

    /**
     * AP 模式下的读取：允许从跟随者读取过时数据
     * 即使领导者不可用，只要有一个跟随者可用就能读取
     */
    public void apModeRead(String userId) {
        try (Session session = driver.session(
            SessionConfig.builder()
                .withDefaultAccessMode(AccessMode.READ)
                .build()
        )) {
            session.executeRead(tx -> {
                Result result = tx.run(
                    "MATCH (u:User {id: $id}) RETURN u.name AS name, u.balance AS balance",
                    Parameters.with("id", userId)
                );
                if (result.hasNext()) {
                    Record record = result.single();
                    System.out.println("AP 读取结果（可能过时）: "
                        + record.get("name") + ", 余额: " + record.get("balance"));
                }
                return null;
            });
        }
    }
}
```

#### JanusGraph AP 模式配置

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.core.JanusGraphTransaction;
import org.janusgraph.core.JanusGraphVertex;

public class JanusGraphAPExample {

    private final JanusGraph graph;

    public JanusGraphAPExample(String configFile) {
        this.graph = JanusGraphFactory.open(configFile);
    }

    /**
     * AP 模式下的写入：即使部分节点不可用，写入仍然成功
     * 数据最终会通过 hinted handoff 同步到所有节点
     */
    public void apModeWrite() {
        JanusGraphTransaction tx = graph.newTransaction();
        try {
            JanusGraphVertex v = tx.addVertex("Event");
            v.property("id", "evt-" + System.currentTimeMillis());
            v.property("type", "page_view");
            v.property("timestamp", System.currentTimeMillis());
            tx.commit();
            System.out.println("AP 写入成功（即使部分副本不可用）");
        } catch (Exception e) {
            tx.rollback();
            // AP 模式下，写入失败通常意味着所有节点都不可用
            System.err.println("AP 写入失败：所有存储节点不可用");
            throw new RuntimeException(e);
        }
    }

    /**
     * AP 模式下的冲突处理：最后写入者获胜（LWW）
     */
    public void handleConflict() {
        // JanusGraph + Cassandra 使用时间戳解决冲突
        // 同一行数据的多个版本中，时间戳最大的版本胜出
        // 应用层可以通过以下方式控制冲突解决：
        // 1. 使用向量时钟（Vector Clock）
        // 2. 使用 CRDT（Conflict-free Replicated Data Types）
        // 3. 自定义冲突解决逻辑
    }

    public void close() {
        graph.close();
    }
}
```

### 7.4.4 使用场景

| CAP 选择 | 场景 | 理由 |
|---------|------|------|
| CP | 银行转账、库存扣减、权限校验 | 一致性不可妥协，宁可拒绝服务 |
| AP | 推荐系统、日志收集、社交动态 | 可用性优先，短暂不一致可接受 |
| CP + AP 混合 | 电商平台（商品浏览 AP + 下单 CP） | 不同操作不同策略 |

### 7.4.5 潜在风险与注意事项

1. **CP 系统的可用性窗口**：Neo4j 领导者选举期间（通常 7-15 秒），集群不可写入。对于需要 99.99% 可用性的系统，这个窗口需要纳入 SLA 计算。

2. **AP 系统的数据冲突**：最终一致性系统在分区恢复后可能产生数据冲突。JanusGraph + Cassandra 使用 LWW（Last Writer Wins）策略，但这可能导致数据丢失。对于关键数据，建议使用 CRDT 或自定义冲突解决。

3. **混合架构的复杂性**：一些团队采用 CP + AP 混合架构（如 CP 存储核心数据，AP 存储辅助数据），但跨系统的事务一致性需要应用层保证，增加了系统复杂度。

4. **图遍历的语义完整性**：在 AP 系统中，一个跨多分区的图遍历可能返回部分结果（某些分区不可用导致数据缺失），应用层需要处理这种"不完整图"的情况。

### 7.4.6 本章小结

CAP 定理不是非此即彼的选择题，而是**不同操作、不同数据、不同场景**下的策略组合。在实际工程中，很少有系统在所有操作上都采用统一的 CAP 策略。关键是要识别出哪些数据需要强一致性（如账户余额、权限关系），哪些数据可以接受最终一致性（如用户动态、推荐分数），然后分别采用不同的策略。

---

## 7.5 乐观锁与悲观锁

### 7.5.1 解决的问题

图数据库中的锁机制需要解决以下问题：

- 两个并发事务同时修改同一个节点或关系时，如何避免更新丢失？
- 图遍历过程中，如何防止其他事务修改正在遍历的路径？
- 如何处理死锁——特别是当两个事务以不同顺序锁定多个节点时？
- 锁的粒度如何选择——锁定单个节点、整条路径、还是整个图？

### 7.5.2 核心原理

#### 悲观锁（Pessimistic Locking）

Neo4j 使用记录级锁（record-level locks）实现悲观锁：

- **锁粒度**：节点级和关系级，不提供表锁或库锁
- **锁模式**：共享锁（S锁，用于读）和排他锁（X锁，用于写）
- **锁升级**：Neo4j 不支持锁升级（从行锁升级到表锁），但支持锁的**覆盖范围扩展**——当遍历关系链时，锁会沿着遍历路径逐步获取

```
Neo4j 关系链锁定示例：

事务 A：MATCH (a)-[*1..3]->(b) SET b.visited = true
         ↓
   锁定 a → 遍历到 a 的邻居 → 锁定邻居 → 继续遍历 → 锁定 b

事务 B：MATCH (b)-[*1..3]->(c) SET c.visited = true
         ↓
   锁定 b → 遍历到 b 的邻居 → 锁定邻居 → 继续遍历 → 锁定 c

如果事务 A 和 B 同时执行且遍历路径重叠，可能产生死锁。
```

#### 乐观锁（Optimistic Locking）

乐观锁假设冲突很少发生，在提交时检查冲突：

- **实现方式**：通过版本号或时间戳检测
- **提交验证**：读取数据时记录版本号，写入时检查版本号是否变化
- **冲突处理**：如果版本号变化，事务回滚并重试

Neo4j 的 `MERGE` 语句本质上是乐观锁的一种实现——它先尝试匹配，如果匹配不到则创建，这个"检查再写入"的过程在事务中保证了原子性。

#### 死锁检测与预防

Neo4j 的死锁处理策略：

1. **死锁检测**：使用等待图（Wait-For Graph）检测循环等待
2. **受害者选择**：选择代价最小的事务作为受害者（通常是最新开始的事务）
3. **自动回滚**：受害者事务被自动回滚，抛出 `DeadlockDetectedException`
4. **重试机制**：应用层捕获异常后重试

### 7.5.3 代码/配置实现

#### Neo4j 悲观锁示例

```java
import org.neo4j.driver.*;
import org.neo4j.driver.exceptions.TransientException;

public class Neo4jLockingExample {

    private final Driver driver;

    public Neo4jLockingExample(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * 使用悲观锁：通过 FOR UPDATE 语义锁定节点
     * 在 Cypher 中，写操作（SET、CREATE、DELETE）会自动获取排他锁
     * 读操作可以通过后续写操作隐式获取锁
     */
    public void pessimisticLockUpdate(String userId, String newEmail) {
        try (Session session = driver.session()) {
            session.writeTransaction(tx -> {
                // 先读取（获取共享锁），然后写入（升级为排他锁）
                // 其他事务在此时无法修改该节点
                Result result = tx.run(
                    "MATCH (u:User {id: $id}) " +
                    "SET u.email = $email " +  // 自动获取排他锁
                    "RETURN u.name AS name, u.email AS oldEmail",
                    Parameters.with("id", userId).with("email", newEmail)
                );

                if (result.hasNext()) {
                    Record record = result.single();
                    System.out.println("用户 " + record.get("name")
                        + " 邮箱从 " + record.get("oldEmail") + " 更新为 " + newEmail);
                }
                return null;
            });
        }
    }

    /**
     * 显式锁定：先读取再写入，确保原子性
     * 适用于"读取-检查-写入"模式
     */
    public void explicitLockReadThenWrite(String fromId, String toId, double amount) {
        try (Session session = driver.session()) {
            session.writeTransaction(tx -> {
                // 通过写入操作隐式锁定两个账户
                // 注意：锁定顺序很重要！按 ID 排序可避免死锁
                String lock1 = fromId.compareTo(toId) < 0 ? fromId : toId;
                String lock2 = fromId.compareTo(toId) < 0 ? toId : fromId;

                // 先锁定第一个账户
                tx.run(
                    "MATCH (a:Account {id: $id}) SET a._lock = timestamp()",
                    Parameters.with("id", lock1)
                );
                // 再锁定第二个账户（确保锁定顺序一致）
                tx.run(
                    "MATCH (a:Account {id: $id}) SET a._lock = timestamp()",
                    Parameters.with("id", lock2)
                );

                // 执行实际业务逻辑
                tx.run(
                    "MATCH (from:Account {id: $fromId}), (to:Account {id: $toId}) " +
                    "SET from.balance = from.balance - $amount, " +
                    "    to.balance = to.balance + $amount",
                    Parameters.with("fromId", fromId)
                        .with("toId", toId)
                        .with("amount", amount)
                );
                return null;
            });
        }
    }

    /**
     * 死锁重试机制
     */
    public void safeUpdateWithRetry(String userId, String newEmail, int maxRetries) {
        for (int i = 0; i < maxRetries; i++) {
            try {
                pessimisticLockUpdate(userId, newEmail);
                return; // 成功
            } catch (TransientException e) {
                if (e.code().equals("Neo.TransientError.Transaction.DeadlockDetected")) {
                    System.err.println("检测到死锁，第 " + (i + 1) + " 次重试...");
                    try {
                        Thread.sleep((long) Math.pow(2, i) * 100); // 指数退避
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(ie);
                    }
                } else {
                    throw e; // 非死锁异常，直接抛出
                }
            }
        }
        throw new RuntimeException("重试 " + maxRetries + " 次后仍然失败");
    }

    /**
     * 乐观锁：使用版本号检测冲突
     */
    public void optimisticLockUpdate(String userId, String newEmail) {
        try (Session session = driver.session()) {
            session.writeTransaction(tx -> {
                // 读取当前版本
                Result readResult = tx.run(
                    "MATCH (u:User {id: $id}) " +
                    "RETURN u.email AS email, u.version AS version",
                    Parameters.with("id", userId)
                );

                if (!readResult.hasNext()) {
                    throw new RuntimeException("用户不存在");
                }

                Record record = readResult.single();
                long currentVersion = record.get("version").asLong();

                // 条件更新：只有版本号匹配时才更新
                // 如果其他事务已经修改了该节点，版本号不匹配，更新不会生效
                Result updateResult = tx.run(
                    "MATCH (u:User {id: $id}) " +
                    "WHERE u.version = $expectedVersion " +
                    "SET u.email = $email, " +
                    "    u.version = u.version + 1 " +
                    "RETURN u.version AS newVersion",
                    Parameters.with("id", userId)
                        .with("email", newEmail)
                        .with("expectedVersion", currentVersion)
                );

                if (!updateResult.hasNext()) {
                    throw new RuntimeException("乐观锁冲突：数据已被其他事务修改");
                }

                long newVersion = updateResult.single().get("newVersion").asLong();
                System.out.println("乐观锁更新成功，版本: " + currentVersion + " → " + newVersion);
                return null;
            });
        }
    }

    public void close() {
        driver.close();
    }
}
```

#### 锁配置

```properties
# Neo4j 锁相关配置（neo4j.conf）
# 事务超时时间（毫秒），默认 60000
dbms.transaction.timeout=30s

# 事务内存限制（字节），默认 256M
dbms.memory.transaction.max_size=256M

# 锁获取超时时间（毫秒）
# 在 dbms.lock.acquisition.timeout 中配置
# 默认值取决于具体版本，通常为 20 秒
```

### 7.5.4 使用场景

| 锁策略 | 适用场景 | 原因 |
|--------|---------|------|
| 悲观锁 | 高冲突场景（如热门商品库存扣减） | 避免频繁重试 |
| 乐观锁 | 低冲突场景（如用户资料更新） | 减少锁开销，提高吞吐 |
| 显式排序锁 | 转账等涉及多个实体的操作 | 避免死锁 |
| 关系链锁 | 图遍历中的路径更新 | 保证遍历一致性 |

### 7.5.5 潜在风险与注意事项

1. **死锁不可避免**：即使使用排序锁，在复杂图遍历中仍然可能发生死锁。必须实现重试机制。

2. **锁等待时间**：Neo4j 默认锁等待超时可能导致用户体验差。对于长时间运行的事务，考虑拆分为多个短事务。

3. **乐观锁的 ABA 问题**：版本号机制无法检测到"修改后又改回原值"的情况。如果业务上需要检测这种场景，需要额外的校验机制。

4. **关系链锁的放大效应**：遍历深度为 5 的关系链时，可能锁定数百个节点，严重影响并发性能。建议限制遍历深度或使用快照读取。

### 7.5.6 本章小结

锁机制是图数据库事务隔离的基石。Neo4j 的记录级锁提供了细粒度的并发控制，但关系链遍历时的锁放大效应需要特别注意。乐观锁适合低冲突场景，悲观锁适合高冲突场景。无论选择哪种策略，死锁重试机制都是必须的。关键实践是：**保持事务短小、按固定顺序获取锁、实现指数退避重试**。

---

## 7.6 多版本并发控制（MVCC）

### 7.6.1 解决的问题

MVCC 的核心目标是实现**读操作不阻塞写操作，写操作不阻塞读操作**。在图数据库中，MVCC 需要解决：

- 一个长事务正在遍历图时，其他事务的修改如何不影响这个遍历的一致性？
- 如何在不加锁的情况下提供可重复读（Repeatable Read）级别的隔离？
- 如何处理写偏序（Write Skew）——两个事务分别读取不同但相关的数据，然后各自修改，导致整体约束被违反？

### 7.6.2 核心原理

#### Neo4j 的 MVCC 实现

Neo4j 的 MVCC 基于**版本链**和**快照隔离**：

1. **版本链**：每个节点/关系维护一个版本链表，每个版本包含：
   - 创建该版本的事务 ID
   - 删除该版本的事务 ID（如果已删除）
   - 属性数据的指针

2. **快照隔离**：每个事务在开始时获取一个全局的**事务快照**，只能看到在它开始之前已提交的事务的修改。

3. **写冲突检测**：在提交时，检查是否有其他并发事务修改了相同的数据。如果检测到冲突，后提交的事务回滚。

```
Neo4j MVCC 版本链：

节点:User{id: "u-001"}
  │
  ├── Version 3 (tx-105, committed)
  │   └── name="王五", email="wangwu@new.com"
  │
  ├── Version 2 (tx-102, committed, deleted-by: tx-105)
  │   └── name="王五", email="wangwu@old.com"
  │
  └── Version 1 (tx-100, committed, deleted-by: tx-102)
      └── name="张三", email="zhangsan@example.com"

事务 tx-106 开始于 tx-105 提交之后，可以看到所有版本
事务 tx-103 开始于 tx-102 提交之后、tx-105 提交之前，只能看到 Version 1 和 Version 2
```

#### 写偏序（Write Skew）

写偏序是快照隔离下的经典问题：

```
场景：两个医生不能同时值班，但可以各自请假

事务 A：检查值班医生数量 → 发现 2 人值班 → 自己请假
事务 B：检查值班医生数量 → 发现 2 人值班 → 自己请假

结果：两个医生都请假了，值班人数为 0，违反约束

原因：每个事务读取的是快照（看到对方修改前的状态），
      各自修改不冲突的数据，提交时不会触发写冲突检测。
```

### 7.6.3 代码/配置实现

#### Neo4j MVCC 行为演示

```java
import org.neo4j.driver.*;
import java.util.concurrent.*;

public class Neo4jMVCCExample {

    private final Driver driver;

    public Neo4jMVCCExample(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * 演示 MVCC 快照隔离：读操作不阻塞写操作
     */
    public void mvccReadDoesNotBlockWrite() throws Exception {
        // 准备数据
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run("CREATE (u:User {id: 'mvcc-demo', name: '原始名称', version: 1})");
                return null;
            });
        }

        CountDownLatch latch1 = new CountDownLatch(1);
        CountDownLatch latch2 = new CountDownLatch(1);

        // 事务 A：长时间读取
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<String> readFuture = executor.submit(() -> {
            try (Session session = driver.session()) {
                return session.executeRead(tx -> {
                    Result result = tx.run(
                        "MATCH (u:User {id: 'mvcc-demo'}) RETURN u.name AS name"
                    );
                    latch1.countDown(); // 通知事务 B 可以开始写入
                    latch2.await();     // 等待事务 B 提交

                    // 再次读取——MVCC 保证两次读取结果一致（可重复读）
                    Result result2 = tx.run(
                        "MATCH (u:User {id: 'mvcc-demo'}) RETURN u.name AS name"
                    );
                    return "第一次读取: " + result.single().get("name").asString()
                        + ", 第二次读取: " + result2.single().get("name").asString();
                });
            }
        });

        // 事务 B：在事务 A 读取过程中写入
        Future<Void> writeFuture = executor.submit(() -> {
            latch1.await(); // 等待事务 A 开始读取
            try (Session session = driver.session()) {
                session.executeWrite(tx -> {
                    tx.run(
                        "MATCH (u:User {id: 'mvcc-demo'}) SET u.name = '修改后的名称'"
                    );
                    return null;
                });
            }
            latch2.countDown(); // 通知事务 A 可以再次读取
            return null;
        });

        // 输出结果：两次读取应该相同（MVCC 快照隔离）
        System.out.println(readFuture.get());
        writeFuture.get();
        executor.shutdown();
    }

    /**
     * 写偏序（Write Skew）演示
     * 场景：两个管理员不能同时离线
     */
    public void writeSkewDemo() throws Exception {
        // 准备数据：两个管理员
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run("CREATE (a:Admin {id: 'admin-1', online: true})");
                tx.run("CREATE (a:Admin {id: 'admin-2', online: true})");
                return null;
            });
        }

        CountDownLatch latch = new CountDownLatch(1);

        // 两个并发事务都试图让自己离线
        ExecutorService executor = Executors.newFixedThreadPool(2);

        Callable<Boolean> goOffline = () -> {
            try (Session session = driver.session()) {
                return session.writeTransaction(tx -> {
                    // 检查是否至少还有一个管理员在线
                    Result check = tx.run(
                        "MATCH (a:Admin) WHERE a.online = true " +
                        "RETURN count(a) AS onlineCount"
                    );
                    long onlineCount = check.single().get("onlineCount").asLong();

                    if (onlineCount <= 1) {
                        System.out.println(Thread.currentThread().getName()
                            + ": 不能离线，至少需要一名管理员在线");
                        return false;
                    }

                    // 让自己离线
                    // 注意：这里没有指定具体的管理员，实际业务中需要指定
                    // 这里简化演示
                    tx.run(
                        "MATCH (a:Admin {id: 'admin-1'}) SET a.online = false"
                    );
                    return true;
                });
            }
        };

        // 启动两个事务
        Future<Boolean> result1 = executor.submit(goOffline);
        Future<Boolean> result2 = executor.submit(goOffline);

        System.out.println("事务1 结果: " + result1.get());
        System.out.println("事务2 结果: " + result2.get());
        executor.shutdown();
    }

    /**
     * 解决写偏序：使用显式锁
     */
    public void preventWriteSkewWithExplicitLock() {
        try (Session session = driver.session()) {
            session.writeTransaction(tx -> {
                // 锁定所有管理员记录（通过写入一个临时属性）
                tx.run(
                    "MATCH (a:Admin) " +
                    "SET a._lock = timestamp() " +  // 获取所有管理员的排他锁
                    "RETURN count(a) AS locked"
                );

                // 现在可以安全地检查并修改
                Result check = tx.run(
                    "MATCH (a:Admin) WHERE a.online = true " +
                    "RETURN count(a) AS onlineCount"
                );
                long onlineCount = check.single().get("onlineCount").asLong();

                if (onlineCount <= 1) {
                    throw new RuntimeException("不能离线，至少需要一名管理员在线");
                }

                tx.run(
                    "MATCH (a:Admin {id: 'admin-1'}) SET a.online = false"
                );
                return null;
            });
        }
    }

    public void close() {
        driver.close();
    }
}
```

#### JanusGraph MVCC 配置

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.core.JanusGraphTransaction;
import org.janusgraph.core.JanusGraphVertex;

public class JanusGraphMVCCExample {

    private final JanusGraph graph;

    public JanusGraphMVCCExample(String configFile) {
        this.graph = JanusGraphFactory.open(configFile);
    }

    /**
     * JanusGraph 事务快照隔离
     * 每个事务在开始时获取存储状态的快照
     */
    public void snapshotIsolationDemo() {
        // 事务 A：读取快照
        JanusGraphTransaction txA = graph.newTransaction();
        JanusGraphVertex vA = txA.traversal().V().has("id", "snapshot-test").next();
        String nameA = vA.property("name").value().toString();
        System.out.println("事务 A 读取: " + nameA);

        // 事务 B：修改并提交
        JanusGraphTransaction txB = graph.newTransaction();
        JanusGraphVertex vB = txB.traversal().V().has("id", "snapshot-test").next();
        vB.property("name", "新名称");
        txB.commit();

        // 事务 A 再次读取——MVCC 保证看到的是快照版本
        String nameA2 = vA.property("name").value().toString();
        System.out.println("事务 A 再次读取（快照）: " + nameA2);

        txA.commit(); // 事务 A 提交时会检测写冲突
    }

    /**
     * JanusGraph 事务配置
     */
    public void configureJanusGraphMVCC() {
        // JanusGraph 的 MVCC 行为由以下配置控制：
        // storage.lock.backend=true    -- 启用后端锁
        // storage.lock.wait-time=10000 -- 锁等待时间
        // cache.db-cache=true         -- 启用缓存（影响快照可见性）
        // tx.max-commit-time=10000    -- 最大提交时间
    }

    public void close() {
        graph.close();
    }
}
```

### 7.6.4 使用场景

| MVCC 特性 | 适用场景 |
|-----------|---------|
| 快照隔离 | 报表查询、图分析、长事务读取 |
| 写偏序预防 | 资源配额管理、权限约束、值班调度 |
| 版本链 | 审计追踪、数据回滚、历史查询 |
| 读不阻塞写 | 高并发读写混合场景（社交网络、实时推荐） |

### 7.6.5 潜在风险与注意事项

1. **写偏序难以检测**：写偏序在快照隔离下不会触发写冲突检测，因为两个事务修改的是不同的数据。检测写偏序需要**谓词锁**或**显式锁**，但谓词锁在图数据库中实现成本很高。

2. **版本链膨胀**：频繁更新的节点会产生很长的版本链，导致读取性能下降。Neo4j 通过定期清理（GC）来回收旧版本，但清理本身也有开销。

3. **快照过旧**：长时间运行的事务持有旧快照，阻止版本清理，可能导致存储空间膨胀。建议设置事务超时时间，避免长事务。

4. **JanusGraph 的 MVCC 限制**：JanusGraph 的 MVCC 实现依赖于后端存储（如 Cassandra 的时间戳机制），跨分区事务的 MVCC 保证较弱。

### 7.6.6 本章小结

MVCC 是现代图数据库实现高并发读写的核心技术。Neo4j 的 MVCC 实现提供了快照隔离级别的读一致性，读操作从不阻塞写操作，写操作也几乎不阻塞读操作。但快照隔离下的写偏序问题需要开发者注意——当业务规则涉及多个相关数据的约束时，需要使用显式锁来保证一致性。理解 MVCC 的工作原理，对于设计高并发图应用的事务策略至关重要。

---

## 7.7 分布式事务

### 7.7.1 解决的问题

当图数据库部署在分布式环境中，一个事务可能涉及多个分区上的数据。分布式事务需要解决：

- 如何保证跨多个物理节点的图修改的原子性？
- 部分节点失败时，如何回滚已经执行的操作？
- 长时间运行的图事务（如知识图谱的批量更新）如何保证一致性？
- 微服务架构中，图数据库操作与其他服务操作如何协调？

### 7.7.2 核心原理

#### 两阶段提交（2PC）

两阶段提交是分布式事务的经典协议，分为两个阶段：

1. **准备阶段（Prepare Phase）**：协调者向所有参与者发送准备请求，参与者执行事务但不提交，返回"就绪"或"中止"
2. **提交阶段（Commit Phase）**：如果所有参与者都返回"就绪"，协调者发送提交请求；否则发送回滚请求

```
2PC 流程：

协调者                    参与者1                    参与者2
  │                         │                         │
  │──── prepare ──────────→│──── prepare ──────────→│
  │                         │                         │
  │←──── ready ───────────│←──── ready ────────────│
  │                         │                         │
  │──── commit ───────────→│──── commit ────────────→│
  │                         │                         │
  │←──── ack ─────────────│←──── ack ──────────────│
  │                         │                         │
  └──── 事务完成 ──────────┘                         ┘
```

**问题**：协调者是单点故障，准备阶段后协调者崩溃会导致参与者阻塞。

#### Saga 模式

Saga 模式将长事务拆分为一系列本地事务，每个本地事务都有对应的补偿操作：

```
Saga 流程（创建订单 + 扣库存 + 创建物流）：

  创建订单 ──→ 扣减库存 ──→ 创建物流
     │              │              │
     ▼              ▼              ▼
  取消订单       恢复库存       取消物流
  （补偿）      （补偿）        （补偿）

如果"创建物流"失败，依次执行补偿操作：
  创建物流失败 → 恢复库存 → 取消订单
```

#### 补偿事务

补偿事务是 Saga 模式的核心，用于回滚已提交的本地事务。补偿事务必须是**幂等**的，因为可能被多次执行。

### 7.7.3 代码/配置实现

#### Neo4j 2PC 模拟（使用 Java Transaction API）

```java
import org.neo4j.driver.*;
import javax.transaction.xa.XAResource;
import javax.transaction.xa.Xid;
import java.util.*;

public class DistributedTransactionExample {

    private final Driver driver1; // 分区 1
    private final Driver driver2; // 分区 2

    public DistributedTransactionExample(
            String uri1, String uri2,
            String user, String password) {
        this.driver1 = GraphDatabase.driver(uri1, AuthTokens.basic(user, password));
        this.driver2 = GraphDatabase.driver(uri2, AuthTokens.basic(user, password));
    }

    /**
     * 模拟两阶段提交
     * 注意：Neo4j 社区版不支持 XA 事务，以下为模拟实现
     * 企业版支持通过 HA/集群实现分布式事务
     */
    public void twoPhaseCommitExample(String fromId, String toId, double amount) {
        // 第一阶段：准备
        boolean phase1Success = preparePhase(fromId, toId, amount);
        if (!phase1Success) {
            System.err.println("准备阶段失败，回滚所有操作");
            rollbackPhase(fromId, toId);
            return;
        }

        // 第二阶段：提交
        boolean phase2Success = commitPhase(fromId, toId);
        if (!phase2Success) {
            System.err.println("提交阶段失败，需要人工干预或自动恢复");
            // 实际生产环境中，这里应该启动恢复流程
            initiateRecovery(fromId, toId, amount);
        }
    }

    private boolean preparePhase(String fromId, String toId, double amount) {
        try {
            // 在分区 1 上准备
            try (Session s1 = driver1.session()) {
                s1.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a._pending_debit = $amount, a._tx_state = 'PREPARED'",
                        Parameters.with("id", fromId).with("amount", amount)
                    );
                    return null;
                });
            }

            // 在分区 2 上准备
            try (Session s2 = driver2.session()) {
                s2.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a._pending_credit = $amount, a._tx_state = 'PREPARED'",
                        Parameters.with("id", toId).with("amount", amount)
                    );
                    return null;
                });
            }

            return true;
        } catch (Exception e) {
            System.err.println("准备阶段异常: " + e.getMessage());
            return false;
        }
    }

    private boolean commitPhase(String fromId, String toId) {
        try {
            // 在分区 1 上提交
            try (Session s1 = driver1.session()) {
                s1.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a.balance = a.balance - a._pending_debit, " +
                        "    a._pending_debit = null, " +
                        "    a._tx_state = 'COMMITTED'",
                        Parameters.with("id", fromId)
                    );
                    return null;
                });
            }

            // 在分区 2 上提交
            try (Session s2 = driver2.session()) {
                s2.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a.balance = a.balance + a._pending_credit, " +
                        "    a._pending_credit = null, " +
                        "    a._tx_state = 'COMMITTED'",
                        Parameters.with("id", toId)
                    );
                    return null;
                });
            }

            return true;
        } catch (Exception e) {
            System.err.println("提交阶段异常: " + e.getMessage());
            return false;
        }
    }

    private void rollbackPhase(String fromId, String toId) {
        try {
            try (Session s1 = driver1.session()) {
                s1.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a._pending_debit = null, a._tx_state = 'ROLLED_BACK'",
                        Parameters.with("id", fromId)
                    );
                    return null;
                });
            }
            try (Session s2 = driver2.session()) {
                s2.writeTransaction(tx -> {
                    tx.run(
                        "MATCH (a:Account {id: $id}) " +
                        "SET a._pending_credit = null, a._tx_state = 'ROLLED_BACK'",
                        Parameters.with("id", toId)
                    );
                    return null;
                });
            }
        } catch (Exception e) {
            System.err.println("回滚异常: " + e.getMessage());
        }
    }

    private void initiateRecovery(String fromId, String toId, double amount) {
        // 实际恢复流程：
        // 1. 检查两个分区的事务状态
        // 2. 如果都处于 PREPARED 状态，执行提交
        // 3. 如果只有一个处于 PREPARED 状态，执行回滚
        // 4. 记录到事务日志表，供人工审核
        System.err.println("启动恢复流程，事务涉及: " + fromId + ", " + toId);
    }

    /**
     * Saga 模式实现
     */
    public void sagaTransactionExample(String orderId, String userId, String productId, int quantity) {
        List<String> executedSteps = new ArrayList<>();

        try {
            // Step 1: 创建订单
            createOrder(orderId, userId, productId, quantity);
            executedSteps.add("CREATE_ORDER");

            // Step 2: 扣减库存
            deductStock(productId, quantity);
            executedSteps.add("DEDUCT_STOCK");

            // Step 3: 创建物流
            createShipment(orderId, userId);
            executedSteps.add("CREATE_SHIPMENT");

            System.out.println("Saga 事务完成");

        } catch (Exception e) {
            System.err.println("Saga 事务失败，执行补偿: " + e.getMessage());
            // 逆序执行补偿操作
            compensate(executedSteps, orderId, userId, productId, quantity);
        }
    }

    private void createOrder(String orderId, String userId, String productId, int quantity) {
        try (Session session = driver1.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "CREATE (o:Order {id: $id, userId: $uid, " +
                    "productId: $pid, quantity: $qty, status: 'PENDING'})",
                    Parameters.with("id", orderId)
                        .with("uid", userId)
                        .with("pid", productId)
                        .with("qty", quantity)
                );
                return null;
            });
        }
    }

    private void deductStock(String productId, int quantity) {
        try (Session session = driver1.session()) {
            session.writeTransaction(tx -> {
                Result result = tx.run(
                    "MATCH (p:Product {id: $id}) " +
                    "WHERE p.stock >= $qty " +
                    "SET p.stock = p.stock - $qty " +
                    "RETURN p.stock AS remaining",
                    Parameters.with("id", productId).with("qty", quantity)
                );
                if (!result.hasNext()) {
                    throw new RuntimeException("库存不足");
                }
                return null;
            });
        }
    }

    private void createShipment(String orderId, String userId) {
        try (Session session = driver2.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "CREATE (s:Shipment {orderId: $oid, userId: $uid, status: 'CREATED'})",
                    Parameters.with("oid", orderId).with("uid", userId)
                );
                return null;
            });
        }
    }

    /**
     * 补偿操作：逆序执行
     */
    private void compensate(List<String> executedSteps, String orderId,
                            String userId, String productId, int quantity) {
        Collections.reverse(executedSteps);

        for (String step : executedSteps) {
            try {
                switch (step) {
                    case "CREATE_SHIPMENT":
                        cancelShipment(orderId);
                        break;
                    case "DEDUCT_STOCK":
                        restoreStock(productId, quantity);
                        break;
                    case "CREATE_ORDER":
                        cancelOrder(orderId);
                        break;
                }
                System.out.println("补偿成功: " + step);
            } catch (Exception e) {
                // 补偿失败需要记录并人工介入
                System.err.println("补偿失败，需要人工介入: " + step);
                logCompensationFailure(step, orderId, e);
            }
        }
    }

    private void cancelShipment(String orderId) {
        try (Session session = driver2.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "MATCH (s:Shipment {orderId: $oid}) " +
                    "SET s.status = 'CANCELLED'",
                    Parameters.with("oid", orderId)
                );
                return null;
            });
        }
    }

    private void restoreStock(String productId, int quantity) {
        try (Session session = driver1.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "MATCH (p:Product {id: $id}) " +
                    "SET p.stock = p.stock + $qty",
                    Parameters.with("id", productId).with("qty", quantity)
                );
                return null;
            });
        }
    }

    private void cancelOrder(String orderId) {
        try (Session session = driver1.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "MATCH (o:Order {id: $id}) " +
                    "SET o.status = 'CANCELLED'",
                    Parameters.with("id", orderId)
                );
                return null;
            });
        }
    }

    private void logCompensationFailure(String step, String orderId, Exception e) {
        // 记录到专门的失败日志表
        try (Session session = driver1.session()) {
            session.writeTransaction(tx -> {
                tx.run(
                    "CREATE (f:CompensationFailure {step: $step, " +
                    "orderId: $oid, error: $err, timestamp: datetime()})",
                    Parameters.with("step", step)
                        .with("oid", orderId)
                        .with("err", e.getMessage())
                );
                return null;
            });
        }
    }

    public void close() {
        driver1.close();
        driver2.close();
    }
}
```

#### JanusGraph 分布式事务配置

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.core.JanusGraphTransaction;
import org.janusgraph.diskstorage.BackendException;

public class JanusGraphDistributedTxExample {

    private final JanusGraph graph;

    public JanusGraphDistributedTxExample(String configFile) {
        this.graph = JanusGraphFactory.open(configFile);
    }

    /**
     * JanusGraph 跨分区事务
     * JanusGraph 本身不提供跨分区分布式事务，
     * 但可以通过后端存储（如 Cassandra）的轻量级事务实现部分功能
     */
    public void crossPartitionOperation() {
        JanusGraphTransaction tx = graph.newTransaction();
        try {
            // 这些操作可能分布在不同的 Cassandra 分区上
            // JanusGraph 不保证跨分区的原子性
            tx.traversal().V().has("id", "v1").next().property("x", 1);
            tx.traversal().V().has("id", "v2").next().property("y", 2);

            tx.commit();
            // 注意：如果 v1 和 v2 在不同分区，commit 可能部分成功
        } catch (Exception e) {
            tx.rollback();
            throw new RuntimeException(e);
        }
    }

    /**
     * 使用 Cassandra 的 LWT 实现原子性检查
     */
    public void atomicCheckAndSet(String vertexId, String property, Object expected, Object newValue) {
        JanusGraphTransaction tx = graph.newTransaction();
        try {
            // 读取当前值
            var vertex = tx.traversal().V().has("id", vertexId).next();
            Object current = vertex.property(property).value();

            if (!current.equals(expected)) {
                tx.rollback();
                throw new RuntimeException("CAS 失败: 期望 " + expected + "，实际 " + current);
            }

            // 更新值
            vertex.property(property, newValue);
            tx.commit();
        } catch (Exception e) {
            tx.rollback();
            throw new RuntimeException(e);
        }
    }

    public void close() {
        graph.close();
    }
}
```

### 7.7.4 使用场景

| 分布式事务模式 | 适用场景 | 原因 |
|--------------|---------|------|
| 2PC | 短事务、低延迟、强一致要求 | 保证原子性，但阻塞时间长 |
| Saga | 长事务、微服务编排 | 避免长时间锁定，适合异步流程 |
| 补偿事务 | 跨系统操作、最终一致 | 幂等设计，适合不可回滚的操作 |
| 最终一致 + 对账 | 高吞吐、可接受短暂不一致 | 性能最好，但需要补偿机制 |

### 7.7.5 潜在风险与注意事项

1. **2PC 的阻塞问题**：协调者崩溃时，参与者可能无限期等待。生产环境中需要部署协调者 HA 和超时机制。

2. **Saga 的补偿幂等性**：补偿操作可能被执行多次（网络超时重试），必须保证幂等。建议在补偿操作中使用唯一请求 ID 去重。

3. **隔离性缺失**：Saga 模式不提供隔离性——其他事务可能看到中间状态。对于需要隔离性的场景，可以使用**语义锁**（在业务层面加锁）或**重读值**（提交前重新读取验证）。

4. **脏读**：在 Saga 模式中，一个步骤提交后，其他服务就能看到修改。如果后续步骤失败，已经暴露的数据需要通过补偿操作修正。对于不能暴露中间状态的场景，考虑使用 2PC 或设计"预留"模式。

### 7.7.6 本章小结

分布式事务是图数据库在分布式部署中面临的最大挑战。2PC 提供了强一致性但牺牲了可用性和性能；Saga 模式提供了高可用性和性能但牺牲了隔离性。在实际工程中，建议遵循以下原则：

- **能不分布式就不分布式**：优先考虑数据分区策略，尽量将相关数据放在同一分区
- **短事务优先**：分布式事务越短，失败概率越低
- **补偿优于回滚**：在微服务架构中，补偿事务比分布式回滚更可靠
- **监控和告警**：分布式事务失败后，必须有自动恢复或人工介入的机制

---

## 7.8 实用事务模式

### 7.8.1 解决的问题

在实际开发中，开发者经常遇到以下事务相关的工程问题：

- 如何高效地实现"存在则更新，不存在则创建"（UPSERT）？
- 批量操作时，事务应该多大才能平衡性能和安全性？
- 读取-检查-写入模式如何保证原子性？
- 如何避免事务过大导致的性能问题？

### 7.8.2 核心原理

#### MERGE 语义

`MERGE` 是 Cypher 中的 UPSERT 操作，其行为如下：

1. 尝试匹配模式
2. 如果匹配到，更新属性（ON MATCH）
3. 如果没匹配到，创建模式（ON CREATE）

`MERGE` 的原子性保证：匹配和创建在同一个事务中完成，不会出现竞态条件。

#### 批量操作策略

批量操作的核心权衡：

- **事务太大**：内存压力大、锁竞争激烈、恢复时间长
- **事务太小**：网络往返多、事务开销占比高、吞吐量低

经验法则：每个事务处理 1,000-10,000 条记录，或总数据量不超过 10MB。

#### 读-写模式

常见的读-写模式包括：

1. **读-检查-写**：读取数据，检查业务规则，写入修改
2. **读-计算-写**：读取数据，计算结果，写入结果
3. **读-验证-写**：读取数据，验证约束，写入数据

这些模式的关键是保证"读"和"写"在同一个事务中，否则会出现竞态条件。

### 7.8.3 代码/配置实现

#### MERGE 操作示例

```java
import org.neo4j.driver.*;
import java.util.List;

public class Neo4jTransactionPatterns {

    private final Driver driver;

    public Neo4jTransactionPatterns(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }

    /**
     * MERGE 操作：存在则更新，不存在则创建
     */
    public void upsertUser(String userId, String name, String email) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run(
                    "MERGE (u:User {id: $id}) " +
                    "ON CREATE SET " +
                    "  u.name = $name, " +
                    "  u.email = $email, " +
                    "  u.created_at = datetime(), " +
                    "  u.version = 1 " +
                    "ON MATCH SET " +
                    "  u.name = $name, " +
                    "  u.email = $email, " +
                    "  u.updated_at = datetime(), " +
                    "  u.version = u.version + 1",
                    Parameters.with("id", userId)
                        .with("name", name)
                        .with("email", email)
                );
                return null;
            });
        }
    }

    /**
     * MERGE 关系：确保不会创建重复关系
     */
    public void upsertRelationship(String fromId, String toId, String relType, String since) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run(
                    "MATCH (a:User {id: $fromId}), (b:User {id: $toId}) " +
                    "MERGE (a)-[r:" + relType + "]->(b) " +
                    "ON CREATE SET r.since = $since, r.created_at = datetime() " +
                    "ON MATCH SET r.since = $since, r.updated_at = datetime()",
                    Parameters.with("fromId", fromId)
                        .with("toId", toId)
                        .with("since", since)
                );
                return null;
            });
        }
    }

    /**
     * 批量操作：分批处理大量数据
     */
    public void batchUpsertUsers(List<UserRecord> users, int batchSize) {
        int total = users.size();
        int processed = 0;

        while (processed < total) {
            int end = Math.min(processed + batchSize, total);
            List<UserRecord> batch = users.subList(processed, end);

            try (Session session = driver.session()) {
                session.executeWrite(tx -> {
                    for (UserRecord user : batch) {
                        tx.run(
                            "MERGE (u:User {id: $id}) " +
                            "ON CREATE SET u.name = $name, u.email = $email, " +
                            "  u.created_at = datetime(), u.version = 1 " +
                            "ON MATCH SET u.name = $name, u.email = $email, " +
                            "  u.updated_at = datetime(), u.version = u.version + 1",
                            Parameters.with("id", user.id())
                                .with("name", user.name())
                                .with("email", user.email())
                        );
                    }
                    return null;
                });
            }

            processed = end;
            System.out.println("批量处理进度: " + processed + "/" + total);
        }
    }

    /**
     * 使用 UNWIND 进行批量操作（性能更优）
     */
    public void batchUpsertWithUnwind(List<UserRecord> users) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run(
                    "UNWIND $users AS user " +
                    "MERGE (u:User {id: user.id}) " +
                    "ON CREATE SET " +
                    "  u.name = user.name, " +
                    "  u.email = user.email, " +
                    "  u.created_at = datetime(), " +
                    "  u.version = 1 " +
                    "ON MATCH SET " +
                    "  u.name = user.name, " +
                    "  u.email = user.email, " +
                    "  u.updated_at = datetime(), " +
                    "  u.version = u.version + 1",
                    Parameters.with("users", users.stream()
                        .map(u -> Map.of(
                            "id", u.id(),
                            "name", u.name(),
                            "email", u.email()
                        ))
                        .toList())
                );
                return null;
            });
        }
    }

    /**
     * 读-检查-写模式：安全地更新计数器
     */
    public void safeCounterIncrement(String counterId) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                // 读取当前值
                Result result = tx.run(
                    "MATCH (c:Counter {id: $id}) RETURN c.value AS value",
                    Parameters.with("id", counterId)
                );

                long currentValue = 0;
                if (result.hasNext()) {
                    currentValue = result.single().get("value").asLong();
                }

                // 检查业务规则（例如：不超过上限）
                if (currentValue >= 1000000) {
                    throw new RuntimeException("计数器已达上限: " + currentValue);
                }

                // 写入新值
                tx.run(
                    "MERGE (c:Counter {id: $id}) " +
                    "SET c.value = $newValue",
                    Parameters.with("id", counterId)
                        .with("newValue", currentValue + 1)
                );
                return null;
            });
        }
    }

    /**
     * 事务大小管理：自动调整批量大小
     */
    public void adaptiveBatchInsert(List<Map<String, Object>> records) {
        int batchSize = 1000; // 初始批量大小
        int position = 0;

        while (position < records.size()) {
            int currentBatchSize = Math.min(batchSize, records.size() - position);
            List<Map<String, Object>> batch = records.subList(position, position + currentBatchSize);

            try {
                try (Session session = driver.session()) {
                    session.executeWrite(tx -> {
                        tx.run(
                            "UNWIND $records AS record " +
                            "CREATE (n:Node {id: record.id, type: record.type, " +
                            "  properties: record.properties})",
                            Parameters.with("records", batch)
                        );
                        return null;
                    });
                }
                // 成功：尝试增大批量
                batchSize = Math.min(batchSize * 2, 10000);
                position += currentBatchSize;

            } catch (Exception e) {
                // 失败：减小批量并重试
                System.err.println("批量插入失败，减小批量大小: " + e.getMessage());
                batchSize = Math.max(batchSize / 2, 100);
                if (currentBatchSize <= batchSize) {
                    // 如果当前批量已经很小，说明是其他问题
                    throw new RuntimeException("批量插入失败，无法恢复", e);
                }
            }
        }
    }

    /**
     * 使用 CALL IN TRANSACTIONS 进行分批提交（Neo4j 4.4+）
     */
    public void batchWithPeriodicCommit(List<UserRecord> users) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                // 注意：CALL IN TRANSACTIONS 需要在 Cypher Shell 或 apoc.periodic.iterate 中使用
                // 这里展示 APOC 方式
                tx.run(
                    "CALL apoc.periodic.iterate(" +
                    "  'UNWIND $users AS user RETURN user', " +
                    "  'MERGE (u:User {id: user.id}) " +
                    "   ON CREATE SET u.name = user.name, u.email = user.email " +
                    "   ON MATCH SET u.name = user.name, u.email = user.email', " +
                    "  {batchSize: 1000, parallel: false, params: {users: $users}}" +
                    ")",
                    Parameters.with("users", users.stream()
                        .map(u -> Map.of(
                            "id", u.id(),
                            "name", u.name(),
                            "email", u.email()
                        ))
                        .toList())
                );
                return null;
            });
        }
    }

    /**
     * 事务超时和重试模式
     */
    public <T> T withRetry(Supplier<T> operation, int maxRetries) {
        Exception lastException = null;

        for (int i = 0; i < maxRetries; i++) {
            try {
                return operation.get();
            } catch (TransientException e) {
                lastException = e;
                long waitMs = (long) Math.pow(2, i) * 100 + (long) (Math.random() * 100);
                System.err.println("事务重试 " + (i + 1) + "/" + maxRetries
                    + ", 等待 " + waitMs + "ms, 原因: " + e.getMessage());
                try {
                    Thread.sleep(waitMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("重试被中断", ie);
                }
            } catch (Exception e) {
                throw new RuntimeException("非可重试异常", e);
            }
        }

        throw new RuntimeException("重试 " + maxRetries + " 次后仍然失败", lastException);
    }

    @FunctionalInterface
    public interface Supplier<T> {
        T get();
    }

    public record UserRecord(String id, String name, String email) {}

    public void close() {
        driver.close();
    }
}
```

#### JanusGraph 批量操作示例

```java
import org.janusgraph.core.JanusGraph;
import org.janusgraph.core.JanusGraphFactory;
import org.janusgraph.core.JanusGraphTransaction;
import org.janusgraph.core.JanusGraphVertex;
import org.janusgraph.core.VertexLabel;
import org.janusgraph.core.schema.JanusGraphManagement;

public class JanusGraphBatchExample {

    private final JanusGraph graph;

    public JanusGraphBatchExample(String configFile) {
        this.graph = JanusGraphFactory.open(configFile);
    }

    /**
     * JanusGraph 批量导入：使用批量模式提高性能
     */
    public void batchImport(List<Map<String, Object>> vertices) {
        // 批量模式：禁用自动索引和约束检查
        JanusGraphManagement mgmt = graph.openManagement();
        mgmt.set("batch-loading", true);
        mgmt.commit();

        JanusGraphTransaction tx = graph.buildTransaction()
            .consistencyChecks(false)  // 禁用一致性检查
            .start();

        try {
            for (Map<String, Object> props : vertices) {
                JanusGraphVertex v = tx.addVertex("BatchNode");
                for (Map.Entry<String, Object> entry : props.entrySet()) {
                    v.property(entry.getKey(), entry.getValue());
                }
            }
            tx.commit();
        } catch (Exception e) {
            tx.rollback();
            throw new RuntimeException("批量导入失败", e);
        } finally {
            // 恢复批量模式
            JanusGraphManagement mgmt2 = graph.openManagement();
            mgmt2.set("batch-loading", false);
            mgmt2.commit();
        }
    }

    /**
     * JanusGraph 事务大小控制
     */
    public void controlledBatchInsert(List<Map<String, Object>> records, int batchSize) {
        int count = 0;
        JanusGraphTransaction tx = graph.newTransaction();

        try {
            for (Map<String, Object> record : records) {
                JanusGraphVertex v = tx.addVertex("Entity");
                for (Map.Entry<String, Object> entry : record.entrySet()) {
                    v.property(entry.getKey(), entry.getValue());
                }
                count++;

                // 达到批量大小时提交并开启新事务
                if (count % batchSize == 0) {
                    tx.commit();
                    tx = graph.newTransaction();
                    System.out.println("已处理 " + count + " 条记录");
                }
            }
            tx.commit(); // 提交剩余数据
        } catch (Exception e) {
            tx.rollback();
            throw new RuntimeException("批量插入失败", e);
        }
    }

    public void close() {
        graph.close();
    }
}
```

### 7.8.4 使用场景

| 模式 | 适用场景 | 性能建议 |
|------|---------|---------|
| MERGE | 用户注册、配置同步 | 单条操作，延迟 < 10ms |
| UNWIND 批量 | 数据迁移、批量导入 | 每批 1K-10K 条，吞吐 10K+/s |
| CALL IN TRANSACTIONS | 超大批量处理（百万级） | 自动分片，避免 OOM |
| 自适应批量 | 不稳定网络环境 | 动态调整，提高成功率 |
| 读-检查-写 | 库存扣减、余额操作 | 事务内完成，避免竞态 |

### 7.8.5 潜在风险与注意事项

1. **MERGE 的完整匹配**：`MERGE` 匹配的是整个模式，不仅仅是节点。`MERGE (a)-[r:KNOWS]->(b)` 会匹配完整的路径，如果路径不存在则创建整个路径。如果只想匹配节点，应该分开操作。

2. **UNWIND 空数组**：`UNWIND []` 会导致空结果，后续操作不会执行。在批量操作前检查数组是否为空。

3. **事务日志膨胀**：大事务会导致 Neo4j 的事务日志急剧膨胀。对于超过 10 万条记录的批量操作，务必分片提交。

4. **JanusGraph 批量模式副作用**：启用 `batch-loading` 会禁用一致性检查和索引更新，导入后需要手动重建索引。

5. **重试风暴**：大量客户端同时重试可能导致系统负载飙升。使用指数退避 + 随机抖动（jitter）来分散重试时间。

### 7.8.6 本章小结

实用事务模式是图数据库工程实践的核心。`MERGE` 提供了原子性的 UPSERT 语义，是处理"存在则更新"场景的首选。批量操作需要在事务大小和性能之间找到平衡——太小则开销大，太大则风险高。读-检查-写模式必须在一个事务中完成，否则会出现竞态条件。最后，无论使用哪种模式，重试机制和事务超时处理都是必不可少的。

---

## 7.9 总结与最佳实践

### 7.9.1 事务策略选择矩阵

| 需求 | 推荐策略 | 产品选择 |
|------|---------|---------|
| 强一致 + 低延迟 | 悲观锁 + 短事务 | Neo4j 单机/集群 |
| 强一致 + 高吞吐 | 乐观锁 + 批量提交 | Neo4j + 应用层分片 |
| 最终一致 + 高可用 | 无锁 + 补偿机制 | JanusGraph + Cassandra |
| 混合负载 | 可调一致性 + 读写分离 | NebulaGraph |

### 7.9.2 黄金法则

1. **事务越短越好**：长事务是万恶之源——它们持有锁、消耗内存、阻塞恢复
2. **锁定顺序一致**：涉及多个实体的操作，按固定顺序获取锁，避免死锁
3. **总是实现重试**：分布式系统中，事务失败是常态，不是异常
4. **监控事务指标**：事务大小、持续时间、重试次数、死锁频率——这些指标是系统健康的晴雨表
5. **理解产品边界**：每个图数据库产品的事务保证不同，不要假设所有产品都提供相同的 ACID 保证

### 7.9.3 推荐配置

```properties
# Neo4j 生产环境推荐配置
dbms.transaction.timeout=30s
dbms.memory.transaction.max_size=256M
dbms.tx_log.rotation.retention_policy=7 days
dbms.tx_log.rotation.size=1G

# JanusGraph 生产环境推荐配置
storage.lock.wait-time=5000
storage.lock.retries=5
ids.block-size=100000
cache.db-cache=true
cache.db-cache-clean-wait=20
tx.max-commit-time=10000
```

### 7.9.4 未来趋势

1. **混合事务/分析处理（HTAP）**：图数据库正在向 HTAP 方向发展，同一系统同时支持事务性查询和分析性查询
2. **确定性数据库**：通过确定性事务调度消除分布式事务的协调开销
3. **硬件加速**：RDMA、持久内存（PMem）等硬件技术正在改变事务处理的性能边界
4. **Serverless 图数据库**：无服务器架构下的事务管理面临新的挑战，如冷启动时的状态恢复

---

> **本章思考题**
>
> 1. 在 Neo4j 中，如果一个事务修改了 10 万个节点，提交时系统会发生什么？如何优化？
> 2. 设计一个跨多个图数据库分区的社交关系推荐系统，你会选择哪种一致性模型？为什么？
> 3. 在微服务架构中，图数据库操作和消息队列操作如何保证原子性？
> 4. 写偏序在什么场景下会导致严重的数据不一致？如何检测和预防？
> 5. 对比 2PC 和 Saga 模式，在什么场景下应该选择 Saga 而不是 2PC？
