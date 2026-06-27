# 第10章 NebulaGraph：大规模分布式图数据库实践

## 10.1 架构总览：存储-计算分离设计

### 10.1.1 解决的问题

传统图数据库（如 Neo4j）采用存储-计算耦合架构，扩展时需同时扩容计算和存储节点，资源利用率低。当图数据达到百亿边、千亿点级别时，单机或主从架构面临以下瓶颈：

- **计算资源浪费**：OLAP 类分析查询需要大量 CPU，但存储节点被迫跟随扩容，造成成本浪费。
- **弹性不足**：业务高峰需要更多查询并发，但存储无法独立扩展。
- **故障域过大**：单节点故障影响面大，恢复时间长。

NebulaGraph 采用**存储-计算分离架构**，将系统拆分为 Meta Service、Storage Service、Graph Service 三个独立模块，各自独立扩缩容。

### 10.1.2 核心原理

NebulaGraph 的三层架构如下：

```
+------------------------------------------------------------+
|                     Graph Service (无状态)                    |
|  Query Engine | Parser | Optimizer | Executor | Scheduler  |
+------------------------------------------------------------+
                            |
                    Meta Service (有状态)
              +-------------------------------+
              | Schema Manager | Part Manager |
              | Load Balancer  | 权限/鉴权     |
              +-------------------------------+
                            |
                    Storage Service (有状态)
              +-------------------------------+
              |  RocksDB KV  | Raft Group    |
              |  Partition   | Multi-Replica |
              +-------------------------------+
```

- **Meta Service**：管理元数据（Schema、Partition 分布、Leader 信息），所有 Graph Service 和 Storage Service 启动时从 Meta Service 拉取元数据缓存。Meta Service 自身通过 Raft 保证高可用，通常部署 3 个节点。
- **Storage Service**：负责数据存储，每个 Partition 对应一个 Raft 组，数据存储在 RocksDB 中。Storage 节点无状态逻辑，只提供 KV 读写接口。
- **Graph Service**：无状态计算层，接收客户端 nGQL 请求，解析、优化、执行查询计划，从 Storage Service 拉取数据并完成计算。可水平扩展以提升查询并发能力。

### 10.1.3 代码/配置实现

以下为 NebulaGraph 集群的典型部署配置（Docker Compose 片段）：

```yaml
version: "3.4"
services:
  metad0:
    image: vesoft/nebula-metad:v3.8.0
    environment:
      NEBULA_POD_NAME: metad0
    command:
      - --meta_server_addrs=metad0:9559,metad1:9559,metad2:9559
      - --local_ip=metad0
      - --port=9559

  storaged0:
    image: vesoft/nebula-storaged:v3.8.0
    environment:
      NEBULA_POD_NAME: storaged0
    command:
      - --meta_server_addrs=metad0:9559,metad1:9559,metad2:9559
      - --local_ip=storaged0
      - --port=9779

  graphd0:
    image: vesoft/nebula-graphd:v3.8.0
    environment:
      NEBULA_POD_NAME: graphd0
    command:
      - --meta_server_addrs=metad0:9559,metad1:9559,metad2:9559
      - --local_ip=graphd0
      - --port=9669
```

### 10.1.4 使用场景

- **超大规模社交网络**：数十亿用户节点、千亿好友关系边。
- **实时推荐系统**：需要高并发查询图路径和邻居特征。
- **金融风控**：复杂环路检测、多层担保链分析，计算密集且数据量大。
- **知识图谱**：实体和关系的持续增长需要存储和计算独立扩展。

### 10.1.5 潜在风险与注意事项

- 存储-计算分离引入网络开销，Graph Service 和 Storage Service 之间的 RPC 延迟可能成为瓶颈，建议部署在同一机房或使用低延迟网络。
- Meta Service 是整个集群的"大脑"，必须保证高可用，建议至少 3 副本。
- Graph Service 无状态意味着查询上下文不缓存，连续相同查询仍需重新解析和计划生成，可考虑应用层查询结果缓存。

### 10.1.6 本章小结

NebulaGraph 的存储-计算分离架构是其支撑万亿边规模的核心设计。Meta Service 统一管理元数据，Storage Service 专注数据持久化与副本一致性，Graph Service 无状态水平扩展。三层解耦使得每一层可以独立优化和扩缩容，兼顾了 OLTP 和 OLAP 场景。

---

## 10.2 Meta Service：元数据管理中心

### 10.2.1 解决的问题

在分布式图数据库中，以下元数据需要全局一致管理：

- **命名空间**：多个图空间（Space）的隔离。
- **Schema 信息**：Tag（点类型）、Edge Type（边类型）、属性定义。
- **Partition 分布**：数据分片在 Storage 节点上的分布情况。
- **Leader 分布**：每个 Partition 的 Raft Leader 所在节点。
- **权限与鉴权**：用户、角色、权限控制。

如果每个 Graph Service 独立管理元数据，必然出现不一致。Meta Service 作为全局权威源，所有组件通过 Raft 达成共识。

### 10.2.2 核心原理

Meta Service 内部维护以下核心数据结构：

- **Space 表**：Space ID、名称、分区数、副本数、存活时间（TTL）等。
- **Tag 表**：Tag ID、所属 Space、属性列定义（名称、类型、默认值）。
- **Edge Type 表**：Edge Type ID、所属 Space、属性列定义。
- **Partition 表**：Partition ID、所在 Storage 节点列表、当前 Leader。
- **Index 表**：索引定义、索引列、状态（Building/Finished）。

Meta Service 使用 Raft 协议保证强一致性，写操作（如 CREATE SPACE、ALTER TAG）必须经过 Raft 提交。读操作可通过 Leader 或 Follower 进行。

**Leader 分布策略**：Meta Service 定期检查各 Storage 节点上 Partition Leader 的数量，通过 Balance Leader 命令将 Leader 从过载节点迁移到轻载节点，实现负载均衡。

### 10.2.3 代码/配置实现

**创建图空间与 Schema（nGQL）：**

```sql
-- 创建图空间，100 个分区，3 副本
CREATE SPACE social_net(partition_num=100, replica_factor=3, vid_type=FIXED_STRING(32));

-- 使用图空间
USE social_net;

-- 创建 Tag：用户
CREATE TAG person(
    name        string,
    age         int,
    gender      string,
    city        string,
    created_at  datetime
);

-- 创建 Tag：公司
CREATE TAG company(
    name       string,
    industry   string,
    founded    int
);

-- 创建 Edge Type：好友关系
CREATE EDGE friend(
    since    datetime,
    weight   double DEFAULT 1.0
);

-- 创建 Edge Type：工作经历
CREATE EDGE work_at(
    position    string,
    start_date  datetime,
    end_date    datetime
);

-- 查看 Schema
DESCRIBE TAG person;
DESCRIBE EDGE friend;
SHOW SPACES;
```

**查看 Partition 分布：**

```sql
-- 查看当前 Space 的 Partition 分布
SHOW PARTS;

-- 查看 Storage 节点状态
SHOW HOSTS;
```

### 10.2.4 使用场景

- **多租户隔离**：不同业务线使用不同 Space，数据完全隔离。
- **Schema 演进**：业务迭代中新增属性或修改类型，通过 ALTER TAG/EDGE 在线变更。
- **集群扩缩容**：新增 Storage 节点后，通过 BALANCE 命令重新分布 Partition。

### 10.2.5 潜在风险与注意事项

- Meta Service 不可用会导致整个集群不可用，必须部署 3 节点并配置独立 Raft 端口。
- Schema 变更（ALTER TAG）是异步操作，变更后需要等待一段时间才能保证所有节点生效。
- Partition 数在创建 Space 后不可修改，需提前根据数据规模合理规划。

### 10.2.6 本章小结

Meta Service 是 NebulaGraph 的元数据中枢，管理 Space、Schema、Partition 分布和权限等全局信息。通过 Raft 协议保证强一致性，所有组件启动时从 Meta Service 拉取缓存。合理的 Schema 设计和 Partition 规划是 NebulaGraph 性能优化的第一步。

---

## 10.3 Storage Service：分布式 KV 存储引擎

### 10.3.1 解决的问题

图数据最终以 KV 形式持久化。NebulaGraph 的 Storage Service 需要解决：

- **大规模数据存储**：单机 RocksDB 无法容纳千亿边，需要分片。
- **高可用与一致性**：节点故障不丢数据，读写一致性保证。
- **低延迟读写**：图查询通常涉及大量随机 KV 读取，延迟敏感。

### 10.3.2 核心原理

**数据模型**：NebulaGraph 将图数据编码为 KV 对存储在 RocksDB 中。Key 的编码规则为：

```
PartitionID + TagID/EdgeTypeID + VertexID + 属性列
```

这种设计使得同一顶点的所有属性在 RocksDB 中物理相邻，Scan 效率高。

**数据分片（Partition）**：

- 每个 Space 被划分为固定数量的 Partition（创建时指定）。
- Partition 通过 `hash(VertexID) % partition_num` 确定归属。
- 每个 Partition 是一个独立的 Raft 组，拥有自己的 WAL 和状态机。

**Raft 共识**：

- 每个 Partition 有 3 副本（replica_factor=3），分布在不同的 Storage 节点上。
- 写操作需要多数派（quorum）确认：3 副本需要 2 节点确认。
- 读操作默认从 Leader 读取，保证强一致性。
- 支持 Follower Read 以降低 Leader 压力（允许一定程度的脏读）。

**RocksDB 优化**：

- Block Cache：缓存热数据块，默认 4MB，建议调整为内存的 20%-30%。
- Bloom Filter：减少不存在的 Key 的磁盘 I/O。
- Compaction：Leveled Compaction 策略，减少写放大。

### 10.3.3 代码/配置实现

**Storage 节点配置（nebula-storaged.conf）：**

```ini
# RocksDB block cache 大小（每个 Storage 节点）
--rocksdb_block_cache=10240  # 单位 MB，建议为内存的 20-30%

# RocksDB compaction 相关
--rocksdb_compression_type=lz4
--rocksdb_bottommost_compression_type=zstd

# Raft 相关
--raft_heartbeat_interval_secs=5
--raft_election_timeout_secs=10
--wal_ttl=14400  # WAL 保留时间（秒）

# 读写超时
--storage_read_worker_threads=16
--storage_write_worker_threads=16
```

**查看 Partition Leader 分布：**

```sql
-- 查看各节点 Leader 分布
SHOW HOSTS;

-- 手动平衡 Leader
BALANCE LEADER;
```

### 10.3.4 使用场景

- **高吞吐写入**：社交网络中的边实时创建，Raft 批量提交保证吞吐。
- **大规模邻接查询**：同一顶点的出入边在 RocksDB 中连续存储，Scan 效率高。
- **跨机房部署**：Raft 副本分布在不同机房，容忍机房级故障。

### 10.3.5 潜在风险与注意事项

- RocksDB Block Cache 过小会导致频繁磁盘 I/O，过大则挤占系统内存引发 OOM，建议监控 `rocksdb_block_cache_hit_ratio`。
- Raft 选举超时配置需根据网络延迟调整，跨机房部署时适当增大 `raft_election_timeout_secs`。
- Partition 数不可动态修改，创建 Space 时需根据未来 2-3 年数据量估算。

### 10.3.6 本章小结

Storage Service 基于 RocksDB 和 Raft 协议构建，通过 Partition 分片实现水平扩展。每个 Partition 独立 Raft 组保证强一致性，Key 编码设计优化了图遍历的局部性。合理的 RocksDB 参数调优对性能至关重要。

---

## 10.4 Graph Service：查询引擎

### 10.4.1 解决的问题

Graph Service 作为无状态计算层，需要将 nGQL 查询转化为高效的分布式执行计划。核心挑战包括：

- **复杂图遍历优化**：多步遍历可能产生中间结果爆炸。
- **分布式执行**：数据分布在多个 Storage 节点上，需最小化网络传输。
- **混合查询**：图遍历与属性过滤、聚合、排序的组合。

### 10.4.2 核心原理

Graph Service 的查询执行流程分为四个阶段：

```
nGQL Query
    |
    v
Parser (词法/语法分析) → AST (抽象语法树)
    |
    v
Semantic Analyzer (语义分析) → 绑定 Schema、类型检查
    |
    v
Optimizer (查询优化)
    ├── Rule-Based Optimizer (RBO): 谓词下推、投影下推
    └── Cost-Based Optimizer (CBO): 选择 Join 顺序、索引选择
    |
    v
Executor (执行器) → 物理计划 → 分布式调度 → Storage RPC
```

**Parser**：使用 Flex/Bison 生成的 nGQL 解析器，将查询文本解析为 AST。

**Semantic Analyzer**：遍历 AST，将标识符绑定到 Meta Service 中的 Schema 定义，进行类型检查和权限验证。

**Optimizer**：

- **RBO（Rule-Based Optimizer）**：应用启发式规则，如将 Filter 下推到 Storage 层以减少数据传输，将 Projection 下推以减少列扫描。
- **CBO（Cost-Based Optimizer）**：基于统计信息（基数估计、索引选择性）选择最优执行计划，如决定是否使用索引、Join 顺序。

**Executor**：采用**流水线执行（Pipelined Execution）**模型，上游算子产出数据后立即传递给下游算子，避免物化中间结果。每个算子对应一个物理操作（如 IndexScan、GetNeighbors、Project）。

### 10.4.3 代码/配置实现

**Graph Service 配置（nebula-graphd.conf）：**

```ini
# 查询超时（秒）
--session_timeout=600

# 最大并发查询数
--max_concurrent_queries=100

# 每个查询最大返回行数
--max_rows_returned=1000000

# 查询引擎线程数
--num_io_threads=16
--num_worker_threads=16

# 慢查询阈值（微秒）
--slow_query_threshold_us=500000
```

**查看查询执行计划：**

```sql
-- 使用 EXPLAIN 查看执行计划
EXPLAIN FORMAT="row" 
MATCH (v:person)-[:friend]->(f:person) 
WHERE v.name == "Alice" 
RETURN f.name, f.age;

-- 使用 PROFILE 查看实际执行耗时
PROFILE 
MATCH (v:person)-[:friend]->(f:person) 
WHERE v.name == "Alice" 
RETURN f.name, f.age;
```

### 10.4.4 使用场景

- **高并发 OLTP 查询**：短路径查询、点查、邻居查询，Graph Service 水平扩展以支持数千 QPS。
- **复杂分析查询**：多步遍历、最短路径、全图扫描，需要优化器选择高效执行计划。
- **混合负载**：同一集群同时服务在线查询和离线分析，通过 Graph Service 的独立扩缩容实现资源隔离。

### 10.4.5 潜在风险与注意事项

- 复杂 MATCH 查询可能导致中间结果爆炸，建议使用 `LIMIT` 和 `WHERE` 尽早过滤。
- EXPLAIN 输出的执行计划是理解查询性能的关键，慢查询应首先通过 EXPLAIN 分析。
- Graph Service 无状态，重启后缓存清空，首次查询可能较慢（需重新拉取元数据）。

### 10.4.6 本章小结

Graph Service 是 NebulaGraph 的计算引擎，通过 Parser → Semantic Analyzer → Optimizer → Executor 四阶段处理 nGQL 查询。RBO 和 CBO 优化器确保复杂查询的高效执行，流水线执行模型减少中间结果物化开销。合理使用 EXPLAIN/PROFILE 是查询调优的基本手段。

---

## 10.5 nGQL 查询语言实战

### 10.5.1 解决的问题

nGQL（NebulaGraph Query Language）是 NebulaGraph 的声明式图查询语言，兼容 OpenCypher 标准的同时扩展了图遍历原语。需要掌握 nGQL 的核心语法以完成日常图查询开发。

### 10.5.2 核心原理

nGQL 支持以下核心查询模式：

| 模式 | 语法 | 说明 |
|------|------|------|
| 点查 | `FETCH PROP ON tag vid` | 按 VID 获取点属性 |
| 邻居遍历 | `GO FROM vid OVER edge` | 从起点沿边遍历 |
| 路径查询 | `FIND SHORTEST PATH` | 最短/全路径 |
| 索引查询 | `LOOKUP ON tag WHERE` | 按属性条件查找点 |
| 模式匹配 | `MATCH (v)-[e]->(t)` | Cypher 风格模式匹配 |
| 管道 | `$-.field` | 上一步结果作为输入 |

### 10.5.3 代码/配置实现

#### 数据定义（DDL）

```sql
-- 创建图空间
CREATE SPACE IF NOT EXISTS social_net(
    partition_num = 100,
    replica_factor = 3,
    vid_type = FIXED_STRING(32)
);

USE social_net;

-- 创建 Tag
CREATE TAG IF NOT EXISTS person(
    name        string,
    age         int,
    gender      string,
    city        string,
    interests   string,
    created_at  datetime
);

CREATE TAG IF NOT EXISTS company(
    name       string,
    industry   string,
    founded    int
);

-- 创建 Edge Type
CREATE EDGE IF NOT EXISTS friend(
    since    datetime,
    weight   double DEFAULT 1.0
);

CREATE EDGE IF NOT EXISTS follow(
    weight double DEFAULT 1.0
);

CREATE EDGE IF NOT EXISTS work_at(
    position    string,
    start_date  datetime,
    end_date    datetime
);

-- 创建索引（LOOKUP 和 MATCH 需要）
CREATE TAG INDEX person_name_index ON person(name);
CREATE TAG INDEX person_city_index ON person(city);
CREATE EDGE INDEX friend_since_index ON friend(since);
```

#### 数据操作（DML）

```sql
-- 插入点
INSERT VERTEX person(name, age, gender, city, interests, created_at)
VALUES
    "p001": ("Alice", 28, "F", "Beijing", "reading,swimming", datetime("2024-01-01T00:00:00")),
    "p002": ("Bob", 32, "M", "Shanghai", "coding,hiking", datetime("2024-01-02T00:00:00")),
    "p003": ("Charlie", 25, "M", "Beijing", "gaming,music", datetime("2024-01-03T00:00:00")),
    "p004": ("Diana", 30, "F", "Shenzhen", "photography,yoga", datetime("2024-01-04T00:00:00")),
    "p005": ("Eve", 27, "F", "Beijing", "reading,cooking", datetime("2024-01-05T00:00:00")),
    "p006": ("Frank", 35, "M", "Hangzhou", "swimming,running", datetime("2024-01-06T00:00:00"));

-- 插入边
INSERT EDGE friend(since, weight) VALUES
    "p001" -> "p002": (datetime("2020-03-15"), 0.9),
    "p001" -> "p003": (datetime("2021-07-01"), 0.8),
    "p001" -> "p005": (datetime("2022-01-10"), 0.7),
    "p002" -> "p004": (datetime("2019-11-20"), 0.6),
    "p002" -> "p006": (datetime("2020-06-05"), 0.85),
    "p003" -> "p005": (datetime("2023-02-14"), 0.75),
    "p004" -> "p006": (datetime("2021-09-30"), 0.65);

INSERT EDGE follow(weight) VALUES
    "p001" -> "p004": (0.5),
    "p003" -> "p001": (0.4),
    "p005" -> "p002": (0.6);
```

#### 数据查询（DQL）

**FETCH 点查：**

```sql
-- 按 VID 获取点属性
FETCH PROP ON person "p001";

-- 获取多个点
FETCH PROP ON person "p001", "p002", "p003";

-- 获取指定属性
FETCH PROP ON person "p001" YIELD name, age;
```

**GO 邻居遍历：**

```sql
-- 查询 Alice 的一度好友
GO FROM "p001" OVER friend 
YIELD friend._dst AS friend_id, friend.since AS since;

-- 二度好友遍历
GO 2 STEPS FROM "p001" OVER friend 
YIELD DISTINCT friend._dst AS friend_id;

-- 带过滤条件
GO FROM "p001" OVER friend 
WHERE friend.weight > 0.7
YIELD friend._dst AS friend_id, friend.weight AS weight;
```

**FIND PATH 路径查询：**

```sql
-- 最短路径
FIND SHORTEST PATH FROM "p001" TO "p006" OVER friend 
YIELD path AS p;

-- 所有路径（最大深度 5）
FIND ALL PATH FROM "p001" TO "p006" OVER friend 
UPTO 5 STEPS 
YIELD path AS p;
```

**LOOKUP 索引查询：**

```sql
-- 按姓名查找
LOOKUP ON person WHERE person.name == "Alice" 
YIELD person.name, person.age;

-- 按城市查找并排序
LOOKUP ON person WHERE person.city == "Beijing" 
YIELD person.name, person.age, person.city
| ORDER BY $-.age DESC;

-- 范围查询
LOOKUP ON person WHERE person.age >= 30 
YIELD person.name, person.age;
```

**MATCH 模式匹配：**

```sql
-- 查找 Alice 的好友
MATCH (v:person {name: "Alice"})-[:friend]->(f:person)
RETURN f.name, f.age, f.city;

-- 查找共同好友
MATCH (v:person {name: "Alice"})-[:friend]->(common:person)<-[:friend]-(other:person {name: "Bob"})
RETURN common.name, common.age;

-- 查找好友的好友（排除直接好友）
MATCH (v:person {name: "Alice"})-[:friend*2]->(fof:person)
WHERE NOT (v)-[:friend]->(fof)
RETURN DISTINCT fof.name, fof.age
LIMIT 10;
```

**管道操作符：**

```sql
-- 管道：上一步结果作为下一步输入
GO FROM "p001" OVER friend 
YIELD friend._dst AS id
| GO FROM $-.id OVER friend 
YIELD friend._dst AS fof_id;

-- 管道 + 聚合
LOOKUP ON person WHERE person.city == "Beijing" 
YIELD person.name AS name, person.age AS age
| ORDER BY $-.age DESC
| LIMIT 5;
```

**复合查询：**

```sql
-- UNION 合并结果
(GO FROM "p001" OVER friend YIELD friend._dst AS id)
UNION
(GO FROM "p002" OVER friend YIELD friend._dst AS id);

-- 子查询
GO FROM "p001" OVER friend 
WHERE friend._dst IN (
    GO FROM "p003" OVER friend YIELD friend._dst AS id
)
YIELD friend._dst AS common_friend;
```

### 10.5.4 使用场景

- **社交关系查询**：好友列表、共同好友、好友推荐。
- **知识图谱问答**：实体属性查询、关系路径发现。
- **风控规则引擎**：多层担保链检测、交易环路识别。

### 10.5.5 潜在风险与注意事项

- MATCH 查询在无索引时退化为全表扫描，性能极差，务必为过滤条件创建索引。
- GO 语句的步数过大（如 `GO 10 STEPS`）可能导致中间结果爆炸，建议限制步数并使用 LIMIT。
- 管道操作中每一步的结果集大小影响后续性能，尽量在管道前过滤。

### 10.5.6 本章小结

nGQL 融合了 SQL 风格和 Cypher 风格，提供了 FETCH、GO、LOOKUP、MATCH、FIND PATH 等丰富的查询原语。管道操作符和复合查询支持构建复杂的图分析逻辑。掌握 nGQL 是高效使用 NebulaGraph 的基础。

---

## 10.6 数据分片与负载均衡

### 10.6.1 解决的问题

在分布式图数据库中，数据需要均匀分布在多个存储节点上，避免"热点"节点拖累整体性能。同时，节点扩缩容时需要在线迁移数据而不影响服务。

### 10.6.2 核心原理

**Partition 数量计算**：

Partition 是数据分片的最小单位，每个 Partition 对应一个 Raft 组。Partition 数量在创建 Space 时确定，不可修改。

推荐公式：

```
Partition 数 = Storage 节点数 × 副本数 × 2~3
```

例如 10 个 Storage 节点、3 副本，建议 Partition 数为 `10 × 3 × 2 = 60` 到 `10 × 3 × 3 = 90`。

**Partition 分布策略**：

创建 Space 时，Meta Service 将 Partition 及其副本均匀分配到所有 Storage 节点上。分配算法考虑：

- 每个节点上的 Leader 数量均衡。
- 每个 Partition 的副本分布在不同的节点上（故障域隔离）。
- 支持指定 Zone（可用区），副本分布在不同 Zone 实现跨机房容灾。

**Leader 重平衡**：

`BALANCE LEADER` 命令将 Partition Leader 从过载节点迁移到轻载节点。Leader 负责处理读写请求，Leader 分布不均会导致节点负载不均。

**存储扩容**：

新增 Storage 节点后，执行 `BALANCE DATA` 将部分 Partition 迁移到新节点。迁移过程在线进行，不影响已有查询。

### 10.6.3 代码/配置实现

```sql
-- 查看当前 Partition 分布
SHOW PARTS;

-- 查看节点状态
SHOW HOSTS;

-- 平衡 Leader 分布
BALANCE LEADER;

-- 查看 Balance 状态
BALANCE DATA;

-- 存储扩容：新节点加入后执行
BALANCE DATA;
```

**Balance 状态监控：**

```sql
-- 查看 Balance 任务状态
SHOW JOBS;
```

### 10.6.4 使用场景

- **集群初始化**：新集群创建 Space 时合理规划 Partition 数。
- **业务增长扩容**：数据量增长后新增 Storage 节点。
- **负载不均调整**：部分节点 Leader 过多导致热点，执行 Leader 重平衡。

### 10.6.5 潜在风险与注意事项

- Partition 数不可修改，创建 Space 时需预留足够余量。过少则单 Partition 数据量过大，扩容后无法拆分；过多则 Raft 组过多，增加管理开销。
- BALANCE DATA 期间会触发数据迁移，可能影响写入性能，建议在低峰期执行。
- 跨机房部署时，需配置 Zone 确保副本分布在不同的故障域。

### 10.6.6 本章小结

NebulaGraph 通过 Hash 分片将数据均匀分布到多个 Partition 中，每个 Partition 的 Raft 副本分布在不同的 Storage 节点上。合理的 Partition 规划、Leader 重平衡和在线扩容机制保证了集群的扩展性和负载均衡。

---

## 10.7 多副本与容灾恢复

### 10.7.1 解决的问题

分布式系统中节点故障是常态。NebulaGraph 需要保证：

- 节点宕机不丢数据。
- 故障后自动恢复，服务不中断。
- 支持跨机房容灾。

### 10.7.2 核心原理

**Raft 共识协议**：

每个 Partition 是一个独立的 Raft 组，包含 Leader、Follower 两种角色：

- **Leader**：处理所有读写请求，定期向 Follower 发送心跳和日志复制。
- **Follower**：接收 Leader 的日志复制，参与选举投票。

写操作流程：

```
Client → Leader（写入 WAL）→ 并行复制到 Follower
    → 多数派确认（quorum）→ 应用到状态机 → 返回 Client
```

对于 3 副本，quorum = 2，容忍 1 节点故障。

**Follower Read**：

默认读请求由 Leader 处理。开启 Follower Read 后，读请求可以发送到 Follower，降低 Leader 压力。代价是可能读到稍旧的数据（最终一致性）。

```sql
-- 开启 Session 级别的 Follower Read
SET VARIABLE read_from_follower = true;
```

**Snapshot**：

Raft 定期生成 Snapshot 压缩 WAL。新节点加入或落后过多的 Follower 通过安装 Snapshot 快速追赶。

**增量备份**：

NebulaGraph 支持全量备份和增量备份。增量备份基于 WAL 实现，记录从上一次备份以来的所有变更。

### 10.7.3 代码/配置实现

**全量备份：**

```bash
# 使用 BACKUP 命令
BACKUP SPACE social_net TO "hdfs://backup-host:9000/nebula-backup/";
```

**增量备份：**

```bash
# 增量备份（需要先有全量备份）
BACKUP SPACE social_net TO "hdfs://backup-host:9000/nebula-backup/" INCREMENTAL;
```

**恢复：**

```bash
# 从备份恢复
RESTORE SPACE social_net FROM "hdfs://backup-host:9000/nebula-backup/";
```

**Raft 配置参数：**

```ini
# Raft 心跳间隔（秒）
--raft_heartbeat_interval_secs=5

# 选举超时（秒）
--raft_election_timeout_secs=10

# WAL 保留时间（秒）
--wal_ttl=14400

# Snapshot 间隔（秒）
--snapshot_interval_secs=3600
```

### 10.7.4 使用场景

- **生产环境高可用**：3 副本部署，容忍单节点故障。
- **跨机房容灾**：副本分布在不同机房，容忍机房级故障。
- **数据恢复**：误操作或数据损坏后从备份恢复。

### 10.7.5 潜在风险与注意事项

- 3 副本容忍 1 节点故障，如果 2 节点同时故障则集群不可用，建议监控节点健康状态。
- Follower Read 可能读到过期数据，对一致性要求严格的场景不应开启。
- 备份文件应存储在不同存储系统上，避免与集群同时故障。

### 10.7.6 本章小结

NebulaGraph 通过 Raft 协议实现 Partition 级别的多副本强一致性，支持自动故障恢复、Follower Read、Snapshot 和增量备份。合理的副本策略和备份方案是生产环境高可用的基础保障。

---

## 10.8 性能调优

### 10.8.1 解决的问题

NebulaGraph 在生产环境中可能遇到查询延迟高、写入吞吐低、资源利用率不均等问题，需要系统性地进行性能调优。

### 10.8.2 核心原理

性能调优涉及以下层面：

1. **客户端层面**：连接管理、查询超时、批量操作。
2. **Graph Service 层面**：并发控制、查询超时、缓存。
3. **Storage Service 层面**：RocksDB 参数、Raft 参数、线程模型。
4. **网络层面**：RPC 超时、连接池、序列化。

### 10.8.3 代码/配置实现

#### 客户端连接池（Java）

```xml
<!-- pom.xml 依赖 -->
<dependency>
    <groupId>com.vesoft</groupId>
    <artifactId>nebula-java</artifactId>
    <version>3.8.0</version>
</dependency>
```

```java
import com.vesoft.nebula.client.graph.NebulaPoolConfig;
import com.vesoft.nebula.client.graph.SessionPool;
import com.vesoft.nebula.client.graph.data.HostAddress;
import com.vesoft.nebula.client.graph.data.ResultSet;
import com.vesoft.nebula.client.graph.exception.AuthFailedException;
import com.vesoft.nebula.client.graph.exception.ClientServerIncompatibleException;
import com.vesoft.nebula.client.graph.exception.IOErrorException;
import java.util.Arrays;
import java.util.List;

public class NebulaConnectionPool {

    private SessionPool sessionPool;

    public void init() {
        NebulaPoolConfig config = new NebulaPoolConfig();
        config.setMaxConnSize(50);            // 最大连接数
        config.setMinConnSize(5);             // 最小连接数
        config.setIdleTime(60000);            // 空闲超时（毫秒）
        config.setTimeout(60000);             // 查询超时（毫秒）
        config.setWaitTime(8000);             // 获取连接等待时间（毫秒）

        List<HostAddress> addresses = Arrays.asList(
            new HostAddress("192.168.1.10", 9669),
            new HostAddress("192.168.1.11", 9669),
            new HostAddress("192.168.1.12", 9669)
        );

        sessionPool = new SessionPool(
            "social_net",
            "root",
            "password",
            config,
            addresses
        );
        sessionPool.init();
    }

    public ResultSet executeQuery(String nql) 
            throws IOErrorException, AuthFailedException, 
                   ClientServerIncompatibleException {
        return sessionPool.execute(nql);
    }

    public void close() {
        if (sessionPool != null) {
            sessionPool.close();
        }
    }
}
```

**批量插入示例：**

```java
public void batchInsertEdges(NebulaConnectionPool pool, List<EdgeData> edges) 
        throws Exception {
    int batchSize = 1000;
    StringBuilder sb = new StringBuilder();

    for (int i = 0; i < edges.size(); i++) {
        EdgeData e = edges.get(i);
        if (i % batchSize == 0) {
            if (sb.length() > 0) {
                pool.executeQuery(sb.toString());
            }
            sb.setLength(0);
            sb.append("INSERT EDGE friend(since, weight) VALUES\n");
        } else {
            sb.append(",\n");
        }
        sb.append(String.format(
            "\"%s\" -> \"%s\": (datetime(\"%s\"), %f)",
            e.srcId, e.dstId, e.since, e.weight
        ));
    }
    if (sb.length() > 0) {
        pool.executeQuery(sb.toString());
    }
}
```

#### Storage 参数调优

```ini
# RocksDB Block Cache（MB），建议为物理内存的 20-30%
--rocksdb_block_cache=20480

# Block 大小（默认 4KB，SSD 建议 16KB）
--rocksdb_block_size=16384

# Bloom Filter 精度（10 表示 1% 假阳性率）
--rocksdb_bloom_filter_bits_per_key=10

# 写缓冲区大小（MB）
--rocksdb_write_buffer_size=256

# 最大写缓冲区数
--rocksdb_max_write_buffer_number=6

# 压缩方式
--rocksdb_compression_type=lz4
--rocksdb_bottommost_compression_type=zstd

# Compaction 线程数
--rocksdb_compaction_threads=4

# 后台 Flush 线程数
--rocksdb_flush_threads=4
```

#### 查询超时与并发限制

```ini
# Graph Service 配置
--session_timeout=600
--max_concurrent_queries=200
--max_rows_returned=1000000
--slow_query_threshold_us=200000

# Storage Service 配置
--storage_read_worker_threads=32
--storage_write_worker_threads=32
--max_concurrent_insert_queries=50
```

### 10.8.4 使用场景

- **高并发在线服务**：SessionPool 管理连接，避免频繁创建/销毁连接。
- **批量数据导入**：批量 INSERT 减少 RPC 次数，大幅提升写入吞吐。
- **慢查询优化**：通过 EXPLAIN 分析执行计划，针对性创建索引或改写查询。

### 10.8.5 潜在风险与注意事项

- SessionPool 的最大连接数不应超过 Graph Service 的 `max_concurrent_queries`，否则查询被拒绝。
- RocksDB Block Cache 设置过大可能导致操作系统 OOM Killer 触发，建议预留 20% 内存给 OS。
- 批量 INSERT 的 batch size 建议 500-2000，过大会导致单次请求内存占用过高。

### 10.8.6 本章小结

NebulaGraph 性能调优需要从客户端连接管理、Graph Service 并发控制、Storage Service RocksDB 参数三个层面综合考虑。SessionPool 管理连接、批量写入减少 RPC、合理的 RocksDB 参数配置是提升性能的三大关键手段。

---

## 10.9 实战：社交关系图谱

### 10.9.1 解决的问题

构建一个完整的社交关系图谱系统，涵盖从 Schema 设计、数据导入到典型查询分析的全流程。以社交网络中的用户、好友关系、关注关系、工作经历为数据模型，实现好友推荐、最短路径、社区发现等典型场景。

### 10.9.2 核心原理

**数据模型设计**：

```
(person) ──[friend]──→ (person)    双向好友关系
(person) ──[follow]──→ (person)    单向关注关系
(person) ──[work_at]──→ (company)  工作经历
```

**Schema 设计原则**：

- Tag 用于表示实体类型，Edge Type 用于表示关系类型。
- 属性尽量使用定长类型（FIXED_STRING、INT）以提高 RocksDB Scan 效率。
- 为频繁过滤的字段创建索引。

### 10.9.3 代码/配置实现

#### Schema 设计

```sql
-- 创建图空间
CREATE SPACE social_graph(
    partition_num = 100,
    replica_factor = 3,
    vid_type = FIXED_STRING(32)
);

USE social_graph;

-- 用户 Tag
CREATE TAG person(
    name        string,
    age         int,
    gender      string,
    city        string,
    interests   string,
    level       int DEFAULT 1,
    created_at  datetime
);

-- 公司 Tag
CREATE TAG company(
    name       string,
    industry   string,
    scale      int,
    founded    int
);

-- 好友关系（无向）
CREATE EDGE friend(
    since    datetime,
    weight   double DEFAULT 1.0
);

-- 关注关系（有向）
CREATE EDGE follow(
    created_at datetime,
    weight    double DEFAULT 1.0
);

-- 工作经历
CREATE EDGE work_at(
    position    string,
    start_date  datetime,
    end_date    datetime
);

-- 创建索引
CREATE TAG INDEX person_name_idx ON person(name);
CREATE TAG INDEX person_city_idx ON person(city);
CREATE TAG INDEX person_interests_idx ON person(interests);
CREATE EDGE INDEX friend_since_idx ON friend(since);
```

#### 数据导入（Spark Exchange）

**Exchange 配置文件（exchange.conf）：**

```yaml
version: v3

nebula:
  address:
    - graphd: 192.168.1.10:9669
  user: root
  pswd: password
  space: social_graph

processing:
  concurrency: 10
  batch: 2000

sources:
  - name: person_import
    type: csv
    path: "hdfs://data-cluster/person_data.csv"
    schema:
      delimiter: ","
      header: true
    mapping:
      - column: vid
        target: _vertexId
      - column: name
        target: person.name
      - column: age
        target: person.age
      - column: gender
        target: person.gender
      - column: city
        target: person.city
      - column: interests
        target: person.interests
    vertex:
      tag: person

  - name: friend_import
    type: csv
    path: "hdfs://data-cluster/friend_data.csv"
    schema:
      delimiter: ","
      header: true
    mapping:
      - column: src
        target: _srcId
      - column: dst
        target: _dstId
      - column: since
        target: friend.since
      - column: weight
        target: friend.weight
    edge:
      type: friend
```

**Spark 提交命令：**

```bash
spark-submit --class com.vesoft.nebula.exchange.Exchange \
    --master yarn \
    --executor-memory 8g \
    --num-executors 20 \
    nebula-exchange-3.8.0.jar \
    -c exchange.conf
```

#### 典型查询

**好友推荐（共同好友数）：**

```sql
-- 基于共同好友数推荐
MATCH (v:person {name: "Alice"})-[:friend]->(common:person)<-[:friend]-(recommend:person)
WHERE v != recommend
  AND NOT (v)-[:friend]->(recommend)
RETURN recommend.name AS recommend_name,
       count(common) AS common_friends,
       recommend.city AS city
ORDER BY common_friends DESC
LIMIT 10;
```

**好友推荐（基于兴趣相似度）：**

```sql
-- 查找同城且兴趣相似的用户
LOOKUP ON person WHERE person.city == "Beijing"
YIELD person.name AS name, person.interests AS interests
| WHERE $-.name != "Alice"
| LIMIT 50;

-- 结合好友的好友
GO 2 STEPS FROM "p001" OVER friend
YIELD DISTINCT friend._dst AS candidate_id
| GO FROM $-.candidate_id OVER work_at
YIELD work_at._dst AS company_id;
```

**最短路径：**

```sql
-- 两人之间的最短社交路径
FIND SHORTEST PATH FROM "p001" TO "p006" OVER friend
YIELD path AS path;

-- 带权最短路径（基于 weight）
FIND SHORTEST PATH FROM "p001" TO "p006" OVER friend
WITH WEIGHT
YIELD path AS path, weight AS total_weight;
```

**社区检测（基于标签传播思想）：**

```sql
-- 查找紧密连接的子图（三角计数）
MATCH (a:person)-[:friend]->(b:person)-[:friend]->(c:person)
WHERE (a)-[:friend]->(c)
RETURN a.name AS person_a,
       b.name AS person_b,
       c.name AS person_c
LIMIT 20;

-- 按城市统计社区大小
LOOKUP ON person YIELD person.name AS name, person.city AS city
| GROUP BY $-.city
YIELD $-.city AS city, count(*) AS population
ORDER BY population DESC;
```

**Java 客户端完整示例：**

```java
import com.vesoft.nebula.client.graph.NebulaPoolConfig;
import com.vesoft.nebula.client.graph.SessionPool;
import com.vesoft.nebula.client.graph.data.HostAddress;
import com.vesoft.nebula.client.graph.data.ResultSet;
import com.vesoft.nebula.client.graph.data.ValueWrapper;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class SocialGraphApp {

    private SessionPool pool;

    public SocialGraphApp() {
        NebulaPoolConfig config = new NebulaPoolConfig();
        config.setMaxConnSize(30);
        config.setTimeout(30000);

        List<HostAddress> addresses = Arrays.asList(
            new HostAddress("192.168.1.10", 9669)
        );

        pool = new SessionPool(
            "social_graph", "root", "password",
            config, addresses
        );
        pool.init();
    }

    // 好友推荐
    public List<String> recommendFriends(String userId, int limit) throws Exception {
        String nql = String.format(
            "MATCH (v:person)-[:friend]->(common:person)<-[:friend]-(recommend:person) " +
            "WHERE id(v) == \"%s\" AND v != recommend " +
            "AND NOT (v)-[:friend]->(recommend) " +
            "RETURN recommend.name AS name, count(common) AS score " +
            "ORDER BY score DESC LIMIT %d",
            userId, limit
        );
        ResultSet rs = pool.execute(nql);
        List<String> result = new ArrayList<>();
        for (int i = 0; i < rs.rowsSize(); i++) {
            result.add(rs.getValue(i, "name").asString());
        }
        return result;
    }

    // 最短路径
    public String shortestPath(String srcId, String dstId) throws Exception {
        String nql = String.format(
            "FIND SHORTEST PATH FROM \"%s\" TO \"%s\" OVER friend YIELD path AS p",
            srcId, dstId
        );
        ResultSet rs = pool.execute(nql);
        if (rs.rowsSize() > 0) {
            return rs.getValue(0, "p").toString();
        }
        return null;
    }

    // 共同好友
    public List<String> commonFriends(String userA, String userB) throws Exception {
        String nql = String.format(
            "MATCH (a:person {name: \"%s\"})-[:friend]->(common:person)<-[:friend]-(b:person {name: \"%s\"}) " +
            "RETURN common.name AS name, common.age AS age, common.city AS city",
            userA, userB
        );
        ResultSet rs = pool.execute(nql);
        List<String> result = new ArrayList<>();
        for (int i = 0; i < rs.rowsSize(); i++) {
            result.add(rs.getValue(i, "name").asString());
        }
        return result;
    }

    public void close() {
        if (pool != null) {
            pool.close();
        }
    }

    public static void main(String[] args) throws Exception {
        SocialGraphApp app = new SocialGraphApp();

        // 好友推荐
        List<String> recommendations = app.recommendFriends("p001", 10);
        System.out.println("Recommended friends: " + recommendations);

        // 最短路径
        String path = app.shortestPath("p001", "p006");
        System.out.println("Shortest path: " + path);

        // 共同好友
        List<String> common = app.commonFriends("Alice", "Bob");
        System.out.println("Common friends: " + common);

        app.close();
    }
}
```

### 10.9.4 使用场景

- **社交平台**：好友推荐、关系链查询、影响力分析。
- **招聘平台**：人脉网络分析、二度人脉推荐。
- **即时通讯**：群组推荐、共同联系人发现。

### 10.9.5 潜在风险与注意事项

- 好友推荐查询在数据量大时可能较慢，建议对共同好友数设置下限（如 `count(common) >= 2`）。
- 最短路径查询在稠密图中可能消耗大量内存，建议限制最大步数。
- Spark Exchange 导入时需注意 CSV 中 VID 的格式与 Space 定义的 `vid_type` 一致。

### 10.9.6 本章小结

本节通过一个完整的社交关系图谱案例，展示了从 Schema 设计、Spark Exchange 数据导入到好友推荐、最短路径、共同好友查询的全流程。nGQL 的 MATCH 和 FIND PATH 语法天然适合社交网络分析，Java 客户端 SessionPool 提供了生产级的连接管理方案。

---

## 10.10 本章总结

NebulaGraph 作为开源的分布式图数据库，以存储-计算分离架构为核心，通过 Meta Service、Storage Service、Graph Service 三层解耦实现了弹性扩展和高可用。其核心设计要点包括：

1. **架构层面**：存储-计算分离使得计算和存储可以独立扩缩容，适应 OLTP 和 OLAP 混合负载。
2. **存储层面**：基于 RocksDB 的 KV 存储引擎，通过 Hash 分片和 Raft 共识实现水平扩展和强一致性。
3. **计算层面**：nGQL 查询语言融合 SQL 和 Cypher 风格，优化器通过 RBO 和 CBO 生成高效执行计划。
4. **运维层面**：Leader 重平衡、在线扩容、增量备份等机制保障生产环境可用性。
5. **生态层面**：Spark Exchange、Java/Python 客户端、Prometheus 监控等工具链完善。

选择 NebulaGraph 的核心考量：

- **数据规模**：百亿边以上时，NebulaGraph 的分布式优势明显。
- **查询模式**：以邻居遍历、路径分析为主的图查询场景。
- **一致性要求**：需要强一致性的金融、风控场景。
- **运维能力**：需要具备分布式系统运维经验的团队。

NebulaGraph 不适合的场景：

- 小规模数据（百万级）使用单机图数据库（如 Neo4j）更简单高效。
- 纯 KV 查询场景应使用 HBase、TiKV 等专用 KV 存储。
- 需要完整 ACID 事务的场景（NebulaGraph 仅支持单 Partition 事务）。
