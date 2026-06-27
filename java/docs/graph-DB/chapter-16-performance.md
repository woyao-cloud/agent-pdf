# 第16章 图数据库性能调优与基准测试

## 16.1 图数据库性能模型

### 16.1.1 解决的问题

图数据库的性能模型与传统关系型数据库有本质区别。关系型数据库的查询性能主要取决于表连接（JOIN）的效率和索引使用，而图数据库的核心操作是**图遍历**——从一个或多个起始节点出发，沿着边逐层探索相邻节点。这种操作模式决定了图数据库的性能瓶颈和优化方向完全不同。

在实际生产环境中，以下问题频繁出现：
- 一个看似简单的六度人脉查询，为什么在数据量增长10倍后延迟从50ms飙升到50s？
- 为什么同样的Cypher查询，在A业务线延迟20ms，在B业务线却超时？
- 为什么增加了服务器内存，写入性能反而下降？
- 为什么LDBC基准测试中表现优异的系统，在真实业务场景中表现平平？

本章将从性能模型、查询优化、存储调优、JVM调优、基准测试方法论和真实案例六个维度，系统性地回答这些问题。

### 16.1.2 核心原理

图查询的性能由以下四个核心因素决定：

**1. 索引使用**

图数据库的索引主要用于快速定位遍历的起点。一旦起点确定，后续的遍历操作主要依赖图结构本身（邻接表）而非索引。

```
查询: MATCH (u:User {email: 'alice@example.com'})-[:FRIEND]->(f) RETURN f
性能关键: 索引快速定位 User.email → 找到起点节点 → 沿 FRIEND 边遍历
```

索引类型对性能的影响：
- **原生标签+属性索引**：O(log n) 定位起点
- **全文索引**：适合文本搜索，但延迟通常比B+树索引高2-5倍
- **复合索引**：多条件过滤时避免回表，可减少50%-90%的扫描量

**2. 遍历深度与扇出因子**

这是图数据库最核心的性能模型。遍历的复杂度可以用公式表示：

```
遍历节点数 ≈ 扇出因子^深度
```

| 扇出因子 | 深度1 | 深度2 | 深度3 | 深度4 | 深度5 |
|---------|-------|-------|-------|-------|-------|
| 10      | 10    | 100   | 1,000 | 10,000 | 100,000 |
| 100     | 100   | 10,000 | 1,000,000 | 100M | 10B |
| 1000    | 1,000 | 1M    | 1B    | 不可行 | 不可行 |

这就是"超级节点"问题的数学本质——当一个节点有百万级的关系时，即使深度为2的遍历也可能产生万亿级的中间结果。

**3. 数据局部性**

图数据库的存储布局对性能有决定性影响：
- **邻接表存储**：将节点的所有关系连续存储，遍历时只需一次I/O即可读取所有邻接边
- **节点-边聚集存储**：将节点和其边存储在同一个页中，减少随机I/O
- **属性分离存储**：将频繁访问的属性与冷属性分离存储

Neo4j采用**原生图存储**（节点记录、关系记录连续存储），JanusGraph依赖底层存储引擎（HBase/Cassandra），NebulaGraph采用**计算与存储分离**架构。不同的存储模型导致数据局部性差异可达10-100倍。

**4. 查询执行模型**

- **管道化执行**（Neo4j Cypher）：操作符之间通过流水线传递数据，减少物化中间结果
- **向量化执行**（NebulaGraph）：批量处理数据，利用CPU缓存和SIMD指令
- **分布式并行执行**（JanusGraph + Spark）：将查询分解为子任务并行执行

### 16.1.3 性能瓶颈分析

**随机I/O**

图遍历的本质是"指针追逐"——从一个节点跳到另一个节点，访问模式高度随机。即使使用SSD，每次随机I/O的延迟也在50-100μs量级。深度为5的遍历如果每步都需要随机I/O，仅I/O延迟就达到250-500μs，加上CPU处理和网络开销，很容易达到10ms以上。

**解决方案**：
- 使用NVMe SSD（随机I/O延迟降至10-20μs）
- 增大page cache，将热数据驻留内存
- 使用预读（read-ahead）和批量获取减少I/O次数

**网络延迟**

在分布式图数据库中，一次跨节点的边遍历需要：
1. 当前节点向存储节点发送请求（0.1-1ms）
2. 存储节点查找邻接边（0.1-5ms）
3. 返回结果（0.1-1ms）

单次跨节点遍历延迟约0.3-7ms。深度为5的遍历在最坏情况下需要5次跨节点跳转，仅网络延迟就达1.5-35ms。

**解决方案**：
- 使用RDMA（远程直接内存访问）减少网络延迟
- 图分区优化：将频繁交互的节点分配到同一分区
- 缓存热点节点的邻接信息

**GC（垃圾回收）**

图数据库是典型的"创建大量短生命周期对象"的应用。每次查询执行都会创建大量中间结果对象（路径、节点包装器、属性映射），给JVM GC带来巨大压力。

典型GC问题：
- Young GC频繁：每秒数十次，导致查询延迟抖动
- Full GC：可能持续数秒到数分钟，导致服务不可用
- GC暂停时间与堆大小呈超线性关系

**解决方案**：
- 使用ZGC（暂停时间<1ms，与堆大小无关）
- 对象池复用：减少中间对象创建
- 堆外存储：将大量数据移出JVM堆

**锁竞争**

写操作和读操作之间的锁竞争是图数据库的常见瓶颈：
- Neo4j的写锁：事务修改节点/关系时加锁，高并发写入时锁竞争严重
- 分布式锁：JanusGraph使用HBase的行锁，分布式事务开销大

**解决方案**：
- 减少长事务：将大事务拆分为小事务
- 使用乐观锁：减少锁持有时间
- 读写分离：读操作不阻塞写操作

### 16.1.4 使用场景

性能模型分析适用于以下场景：
- **容量规划**：根据数据量和查询模式预估所需硬件资源
- **架构选型**：根据遍历深度和扇出因子选择单机还是分布式方案
- **性能问题诊断**：通过分析遍历路径定位性能瓶颈

### 16.1.5 潜在风险与注意事项

- 性能模型是理论估算，实际性能受数据分布、硬件配置、并发负载等多因素影响
- 扇出因子是平均值，实际图中可能存在"超级节点"导致局部性能急剧恶化
- 不要仅依赖单节点性能测试结果评估分布式图数据库

### 16.1.6 本章小结

图数据库的性能模型以图遍历为核心，受索引效率、遍历深度、扇出因子和数据局部性四个因素共同决定。理解这些因素及其数学关系，是进行性能调优的基础。性能瓶颈主要集中在随机I/O、网络延迟、GC暂停和锁竞争四个方面，针对不同瓶颈需要采取不同的优化策略。

---

## 16.2 查询性能调优

### 16.2.1 解决的问题

同样的查询语句，不同的写法可能导致性能差异达100倍以上。查询性能调优的目标是在不改变业务语义的前提下，通过优化查询结构、利用索引、减少中间结果等方式，将查询延迟降低到可接受范围。

### 16.2.2 核心原理

查询优化的核心原则：
1. **尽早过滤**：将过滤条件下推到遍历的最早阶段
2. **减少中间结果**：每一步遍历都尽可能减少传递到下一步的数据量
3. **利用索引**：快速定位起点，避免全表扫描
4. **减少属性访问**：只在必要时访问节点/边的属性

### 16.2.3 代码/配置实现

#### 索引优化

**复合索引（Neo4j）**

```cypher
// 创建复合索引
CREATE INDEX composite_index FOR (n:Person) ON (n.country, n.age, n.gender)

// 使用复合索引的查询（索引可以匹配前缀子集）
MATCH (p:Person)
WHERE p.country = 'China' AND p.age > 30
RETURN p.name, p.email
// 上述查询可以使用 composite_index 的前两个字段

// 不适用索引的查询（跳过了前缀字段）
MATCH (p:Person)
WHERE p.age > 30 AND p.gender = 'F'
// 不会使用 composite_index，需要单独创建索引
```

**Vertex-Centric 索引（JanusGraph）**

```groovy
// 创建以顶点为中心的边索引
mgmt = graph.openManagement()
// 在 knows 关系上按 weight 属性建索引
knows = mgmt.getEdgeLabel('knows')
mgmt.buildEdgeIndex(knows, 'knowsByWeight', Direction.BOTH, Order.desc, 'weight')
mgmt.commit()

// 查询时自动使用边索引
g.V().has('person', 'name', 'Alice')
 .outE('knows').has('weight', gt(0.5))
 .inV().values('name')
// JanusGraph 会使用 knowsByWeight 索引快速定位满足条件的边
```

**覆盖索引（NebulaGraph）**

```ngql
// 创建覆盖索引
CREATE TAG INDEX person_index ON person(name, age, email);

// 覆盖索引查询（不需要回查存储层）
LOOKUP ON person WHERE person.name == 'Alice' YIELD person.name, person.age;
// 如果查询的字段都在索引中，不需要访问原始数据
```

#### 查询重写

**模式顺序优化**

```cypher
// 低效写法：先遍历大扇出边，再过滤
MATCH (u:User)-[:FRIEND]->(f:User)-[:POSTED]->(p:Post)
WHERE u.country = 'China' AND p.created_at > datetime('2024-01-01')
RETURN p.title

// 高效写法：先过滤起点，再遍历
MATCH (u:User {country: 'China'})-[:FRIEND]->(f:User)-[:POSTED]->(p:Post)
WHERE p.created_at > datetime('2024-01-01')
RETURN p.title

// 更高效写法：利用复合索引同时过滤起点和关系
MATCH (u:User {country: 'China', status: 'active'})
      -[:FRIEND]->(f:User)
      -[:POSTED {year: 2024}]->(p:Post)
RETURN p.title
```

**过滤条件下推**

```cypher
// 低效：先展开所有路径再过滤
MATCH (u:User)-[:FRIEND]->(f:User)-[:PURCHASED]->(p:Product)
WHERE u.city = 'Beijing' AND p.price > 1000
RETURN f.name, p.name

// 高效：过滤条件下推到起点
MATCH (u:User {city: 'Beijing'})-[:FRIEND]->(f:User)
MATCH (f)-[:PURCHASED]->(p:Product)
WHERE p.price > 1000
RETURN f.name, p.name
// 使用两个 MATCH 子句让优化器分别优化每个模式
```

**投影减少**

```cypher
// 低效：返回完整节点对象
MATCH (u:User {id: '123'})-[:FRIEND]->(f:User)
RETURN f

// 高效：只返回需要的属性
MATCH (u:User {id: '123'})-[:FRIEND]->(f:User)
RETURN f.id, f.name, f.avatar_url
// 减少网络传输量和序列化开销 50%-80%
```

#### 查询计划分析

**Neo4j EXPLAIN / PROFILE**

```cypher
// 查看查询计划（不执行）
EXPLAIN MATCH (u:User {email: 'alice@example.com'})-[:FRIEND]->(f:User)
WHERE f.age > 25
RETURN f.name, f.age

// 执行并分析（实际执行）
PROFILE MATCH (u:User {email: 'alice@example.com'})-[:FRIEND]->(f:User)
WHERE f.age > 25
RETURN f.name, f.age
```

输出解读关键指标：

| 指标 | 含义 | 优化目标 |
|------|------|---------|
| `dbhits` | 数据库访问次数 | 越小越好 |
| `rows` | 每步产生的行数 | 应逐层递减 |
| `estimatedRows` | 优化器估算的行数 | 与实际行数偏差应<10x |
| `memory` | 操作符内存使用 | 避免高内存操作符 |
| `time` | 操作符执行时间 | 定位瓶颈操作符 |

**JanusGraph 查询分析**

```groovy
// 开启查询日志
graph.traversal().withStrategies(ProfileStrategy)

// 分析查询
g.V().has('person', 'name', 'Alice')
 .out('knows')
 .values('name')
 .profile()
```

**NebulaGraph 查询分析**

```ngql
// 查看执行计划
EXPLAIN FORMAT="row" 
GO FROM "person_100" OVER follow 
WHERE follow.degree > 80 
YIELD follow._dst;

// 分析性能
PROFILE 
GO FROM "person_100" OVER follow 
WHERE follow.degree > 80 
YIELD follow._dst;
```

#### 参数化查询

```cypher
// 非参数化查询（每次都需要解析和编译）
MATCH (u:User {id: 'user_001'})-[:FRIEND]->(f) RETURN f
MATCH (u:User {id: 'user_002'})-[:FRIEND]->(f) RETURN f

// 参数化查询（一次编译，多次执行）
MATCH (u:User {id: $userId})-[:FRIEND]->(f) RETURN f

// Java 驱动示例
Map<String, Object> params = new HashMap<>();
params.put("userId", "user_001");
Result result = session.run("MATCH (u:User {id: $userId})-[:FRIEND]->(f) RETURN f", params);
```

参数化查询可减少30%-50%的查询编译开销，在高并发场景下效果显著。

### 16.2.4 使用场景

- **在线查询优化**：对延迟敏感的API查询，通过PROFILE定位瓶颈
- **批量处理优化**：通过参数化查询和投影减少提升吞吐
- **复杂分析查询**：通过模式重写和过滤下推优化多跳遍历

### 16.2.5 潜在风险与注意事项

- 索引不是越多越好：每个索引都会增加写入延迟和存储开销
- PROFILE会实际执行查询，不要在线上环境直接使用
- 查询计划可能因数据分布变化而改变，需要定期review
- 参数化查询对某些动态过滤条件不适用（如IN子句中的列表长度变化）

### 16.2.6 本章小结

查询性能调优的核心是"尽早过滤、减少中间结果"。通过复合索引、Vertex-Centric索引、查询重写、过滤下推和投影减少等技术，可以将查询延迟降低1-2个数量级。查询计划分析是定位性能瓶颈的关键手段，参数化查询则是高并发场景下的必备优化。

---

## 16.3 存储参数调优

### 16.3.1 解决的问题

图数据库的存储层是性能的基石。不合理的存储配置可能导致：
- 内存充足但磁盘I/O居高不下
- 写入吞吐远低于硬件能力
- 压缩与读取的CPU开销失衡
- 数据损坏或恢复时间过长

### 16.3.2 核心原理

图数据库存储调优的核心是平衡**内存-磁盘-计算**三者之间的关系：
- **Page Cache**：将热数据缓存在内存中，减少磁盘I/O
- **Compaction**：将随机写入合并为顺序写入，提高读取效率
- **WAL**：保证写入的持久性和崩溃恢复能力

### 16.3.3 代码/配置实现

#### Neo4j Page Cache 配置

```properties
# conf/neo4j.conf

# 页面缓存大小（建议设置为可用内存的 50%-70%）
# 公式: 总内存 - 堆内存 - OS预留 - 其他服务
dbms.memory.pagecache.size=8G

# 页面缓存预热（启动时加载热数据到缓存）
dbms.memory.pagecache.warmup.enable=true
dbms.memory.pagecache.warmup.preload-whitelist=*

# 页面缓存驱逐策略
# 可选: LRU (最近最少使用), BELADY (最优算法近似)
dbms.memory.pagecache.evict-strategy=LRU

# 内存映射（用于快速文件访问）
dbms.memory.pagecache.swapper=1
```

**Page Cache 大小估算方法**：

```
所需Page Cache = 节点数 × 节点记录大小 + 关系数 × 关系记录大小 + 属性存储大小 × 热数据比例

Neo4j 节点记录固定大小: 15 字节（加上标签位）
Neo4j 关系记录固定大小: 34 字节

示例: 1亿节点 + 10亿关系
节点存储: 100M × 15B ≈ 1.5GB
关系存储: 1B × 34B ≈ 34GB
属性存储: 假设平均每个节点10个属性，每个属性平均50B ≈ 50GB
热数据比例: 20%（80/20原则）
所需Page Cache ≈ 1.5 + 34 + 50 × 20% ≈ 45.5GB
```

#### RocksDB 配置（JanusGraph / NebulaGraph 底层存储）

```cpp
// RocksDB 配置示例

// Block Cache 大小（建议可用内存的 30%-50%）
rocksdb.block_cache_size = 8GB

// Block 大小（默认 4KB，增大可提高顺序扫描性能）
rocksdb.block_size = 16KB

// 写缓冲区大小
rocksdb.write_buffer_size = 256MB

// 写缓冲区数量
rocksdb.max_write_buffer_number = 4

// 最小写缓冲区数量（触发 compaction 的阈值）
rocksdb.min_write_buffer_number_to_merge = 2

// Level Compaction 配置
rocksdb.level0_file_num_compaction_trigger = 4
rocksdb.level0_slowdown_writes_trigger = 20
rocksdb.level0_stop_writes_trigger = 36

// SST 文件大小
rocksdb.max_bytes_for_level_base = 512MB
rocksdb.target_file_size_base = 64MB

// Bloom Filter（减少不存在 key 的磁盘读取）
rocksdb.bloom_filter_bits_per_key = 10

// 压缩算法（LZ4 速度快，ZSTD 压缩率高）
rocksdb.compression = lz4
rocksdb.bottommost_compression = zstd
```

**Compaction 策略详解**：

```
Level 0: 4个 SST 文件（每个 64MB）→ 触发 compaction
Level 1: 总大小 512MB，最多 8 个 SST 文件
Level 2: 总大小 5GB，最多 80 个 SST 文件
Level 3: 总大小 50GB，最多 800 个 SST 文件
...
每层大小放大 10 倍

写入放大因子 ≈ 10-30（取决于配置和数据特征）
```

**Compaction 调优建议**：

| 场景 | 配置策略 | 效果 |
|------|---------|------|
| 写密集型 | 增大 write_buffer_size，减少 level 数 | 减少写入放大 |
| 读密集型 | 增大 block_cache，启用 Bloom Filter | 提高读命中率 |
| 混合负载 | 平衡配置，使用 LZ4 压缩 | 读写均衡 |

#### WAL 配置

```properties
# Neo4j WAL 配置
dbms.tx_log.rotation.retention_policy=7 days
dbms.tx_log.rotation.size=256M
dbms.tx_log.preallocate=true

# RocksDB WAL 配置
rocksdb.wal_size_limit_mb = 1024
rocksdb.wal_ttl_seconds = 3600
rocksdb.wal_recovery_mode = 2  // 点恢复模式
```

**WAL 调优关键点**：
- WAL 大小：过大导致恢复时间长，过小导致频繁切换
- WAL 同步模式：`sync`（最安全，最慢）vs `async`（性能好，可能丢数据）
- WAL 预分配：减少写入延迟抖动

### 16.3.4 使用场景

- **高吞吐写入**：社交媒体数据导入、日志采集
- **混合负载**：在线查询+离线分析的混合场景
- **内存受限环境**：容器化部署、云实例

### 16.3.5 潜在风险与注意事项

- Page Cache 设置过大可能导致 OOM（操作系统内存不足）
- Compaction 会消耗大量 CPU 和 I/O 资源，需要在业务低峰期执行
- WAL 同步模式的选择需要在性能和数据安全之间权衡
- 存储参数调整后需要重启服务，建议先在测试环境验证

### 16.3.6 本章小结

存储参数调优是图数据库性能优化的基础。Page Cache 大小决定了热数据的命中率，Compaction 策略影响写入放大和读取性能，WAL 配置关系到数据安全与写入延迟。调优的核心是在内存、磁盘I/O和CPU之间找到平衡点，根据业务负载特征（读/写比例、数据热分布）选择最优配置。

---

## 16.4 JVM 调优

### 16.4.1 解决的问题

Neo4j 等基于 JVM 的图数据库，其性能受 JVM 参数配置的显著影响。不合理的 JVM 配置会导致：
- GC 暂停时间长达数秒，导致查询超时
- 堆内存利用率低，浪费硬件资源
- 频繁的 Full GC 导致服务抖动
- 堆外内存使用不当导致 OOM

### 16.4.2 核心原理

JVM 调优的核心目标：
1. **减少 GC 暂停时间**：特别是 STW（Stop-The-World）暂停
2. **提高内存利用率**：合理分配堆内和堆外内存
3. **避免 OOM**：确保内存边界安全

### 16.4.3 代码/配置实现

#### 堆内存配置

```bash
# Neo4j JVM 配置 (conf/neo4j.conf)

# 堆内存大小（建议不超过总内存的 50%）
# 剩余内存分配给 Page Cache 和 OS
dbms.memory.heap.initial_size=8G
dbms.memory.heap.max_size=8G

# 直接内存（用于网络 I/O 和文件映射）
dbms.memory.off_heap.max_size=2G

# 完整 JVM 参数示例
dbms.jvm.additional=-XX:+UseZGC
dbms.jvm.additional=-XX:ConcGCThreads=4
dbms.jvm.additional=-XX:ParallelGCThreads=8
dbms.jvm.additional=-Xlog:gc*:file=/var/log/neo4j/gc.log:time,level,tags:filecount=10,filesize=100M
dbms.jvm.additional=-XX:MaxDirectMemorySize=2G
dbms.jvm.additional=-XX:+AlwaysPreTouch
dbms.jvm.additional=-XX:+UseTransparentHugePages
```

**堆大小估算公式**：

```
堆内存 = 查询工作集 + 事务状态 + 缓存元数据 + 安全余量

查询工作集 = 并发查询数 × 每个查询的中间结果大小
事务状态 = 并发事务数 × 事务上下文大小

示例: 50 并发查询，每个查询中间结果平均 50MB
查询工作集 = 50 × 50MB = 2.5GB
事务状态 = 20 × 10MB = 200MB
缓存元数据 = 500MB
安全余量 = 20%
堆内存 ≈ (2.5 + 0.2 + 0.5) × 1.2 ≈ 3.8GB
```

#### GC 选择：G1GC vs ZGC

**G1GC 配置**

```bash
# G1GC 适用于 < 32GB 堆，暂停时间目标 100-200ms
dbms.jvm.additional=-XX:+UseG1GC
dbms.jvm.additional=-XX:MaxGCPauseMillis=100
dbms.jvm.additional=-XX:G1HeapRegionSize=16M
dbms.jvm.additional=-XX:G1NewSizePercent=10
dbms.jvm.additional=-XX:G1MaxNewSizePercent=50
dbms.jvm.additional=-XX:InitiatingHeapOccupancyPercent=45
dbms.jvm.additional=-XX:ConcG1Threads=4
dbms.jvm.additional=-XX:ParallelGCThreads=8
```

**ZGC 配置（推荐）**

```bash
# ZGC 适用于 > 32GB 堆，暂停时间 < 1ms
dbms.jvm.additional=-XX:+UseZGC
dbms.jvm.additional=-XX:ZCollectionInterval=120
dbms.jvm.additional=-XX:ZAllocationSpikeTolerance=2.0
dbms.jvm.additional=-XX:ConcGCThreads=4
dbms.jvm.additional=-XX:ParallelGCThreads=8
dbms.jvm.additional=-Xlog:gc*:file=/var/log/neo4j/gc.log:time,level,tags:filecount=10,filesize=100M
```

**GC 对比数据**（64GB 堆，混合负载场景）：

| GC 算法 | 平均暂停时间 | P99 暂停时间 | 吞吐量损失 | 适用堆大小 |
|---------|------------|-------------|-----------|-----------|
| G1GC    | 50-200ms   | 500-1000ms  | 5-10%     | < 32GB    |
| ZGC     | < 1ms      | < 2ms       | 10-15%    | 8GB-1TB   |
| Shenandoah | < 10ms   | < 50ms      | 8-12%     | 8GB-128GB |

#### GC 日志分析

```bash
# GC 日志分析命令

# 使用 GCeasy 分析（推荐在线工具）
# 上传 gc.log 到 https://gceasy.io

# 使用命令行分析
# 统计 GC 暂停时间分布
grep "Pause Full" gc.log | awk '{print $NF}' | sort -n | \
awk '{count++; sum+=$1} END {print "Count:", count, "Avg:", sum/count, "Max:", $1}'

# 分析 ZGC 暂停
grep "ZGC Pause" gc.log | awk '{print $NF}' | sort -n | \
awk '{count++; sum+=$1} END {print "Count:", count, "Avg:", sum/count, "P99:", $1*0.99}'

# 查看 GC 原因分布
grep -oP 'Pause\s+\w+' gc.log | sort | uniq -c | sort -rn
```

**GC 问题诊断清单**：

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| Young GC 频繁（>10次/秒） | 新生代太小 | 增大 G1NewSizePercent |
| Full GC 频繁 | 对象晋升过快 | 增大堆，检查内存泄漏 |
| GC 暂停时间突增 | 并发标记周期冲突 | 调整 ConcGCThreads |
| ZGC 分配停滞 | 分配速率超过回收速率 | 增大堆，减少分配速率 |

#### 直接内存与堆外存储

```bash
# 直接内存配置
dbms.jvm.additional=-XX:MaxDirectMemorySize=4G

# Neo4j 堆外存储配置
dbms.memory.off_heap.max_size=4G
dbms.memory.off_heap.allocation=mmap  # 使用内存映射文件

# 监控直接内存使用
# 使用 NMT (Native Memory Tracking)
dbms.jvm.additional=-XX:NativeMemoryTracking=summary
dbms.jvm.additional=-XX:+UnlockDiagnosticVMOptions
dbms.jvm.additional=-XX:+PrintNMTStatistics
```

**堆外内存使用建议**：
- 直接内存主要用于网络 I/O 缓冲区，建议设置为 1-4GB
- 堆外存储适合存储大量只读数据（如字典、配置）
- 监控直接内存使用，避免 `OutOfMemoryError: Direct buffer memory`

### 16.4.4 使用场景

- **高并发在线服务**：需要低延迟、低抖动的查询响应
- **大内存服务器**：64GB+ 内存的服务器需要 ZGC 避免长暂停
- **混合负载**：同时处理 OLTP 和 OLAP 查询

### 16.4.5 潜在风险与注意事项

- ZGC 虽然暂停时间短，但 CPU 开销比 G1GC 高 5-10%
- 堆内存不是越大越好：超过 64GB 后，GC 管理效率下降
- AlwaysPreTouch 会延长启动时间，但减少运行时的性能抖动
- JVM 参数调整后务必进行压力测试验证

### 16.4.6 本章小结

JVM 调优是 Neo4j 等基于 JVM 的图数据库性能优化的关键环节。核心策略是：堆内存不超过总内存的 50%（剩余给 Page Cache），优先使用 ZGC 减少暂停时间，合理配置直接内存和堆外存储。GC 日志分析是诊断内存问题的基本手段，建议在生产环境中始终开启 GC 日志。

---

## 16.5 基准测试方法论

### 16.5.1 解决的问题

图数据库的基准测试面临以下挑战：
- 缺乏统一的测试标准，不同厂商的测试结果难以比较
- 测试数据与真实业务数据差异大，测试结果缺乏参考价值
- 测试方法不科学，结果不可复现
- 只关注吞吐量而忽略延迟分布

### 16.5.2 核心原理

科学的基准测试需要满足三个条件：
1. **代表性**：测试数据和工作负载能代表真实业务场景
2. **可复现**：相同的测试条件能得到相同的结果
3. **可比性**：不同系统在相同条件下进行对比

LDBC（Linked Data Benchmark Council）SNB（Social Network Benchmark）是目前图数据库领域最权威的基准测试标准。

### 16.5.3 代码/配置实现

#### LDBC SNB 环境搭建

```bash
# 1. 下载 LDBC SNB 数据生成器
git clone https://github.com/ldbc/ldbc_snb_datagen.git
cd ldbc_snb_datagen

# 2. 配置数据规模
# 修改 params.ini
cat > params.ini << 'EOF'
ldbc.snb.datagen.generator.scaleFactor:100
ldbc.snb.datagen.generator.numPersons:100000000
ldbc.snb.datagen.serializer.numUpdateStreams:1
ldbc.snb.datagen.serializer.socialNetworkSerializer:true
ldbc.snb.datagen.serializer.dynamicActivitySerializer:true
EOF

# 3. 生成数据
mvn clean package
hadoop jar target/ldbc_snb_datagen-0.4.0-jar-with-dependencies.jar params.ini

# 4. 数据导入脚本（Neo4j 示例）
cat > import.cypher << 'CYPHER'
// 创建约束
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT post_id IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT forum_id IF NOT EXISTS FOR (f:Forum) REQUIRE p.id IS UNIQUE;

// 批量导入（使用 PERIODIC COMMIT）
:auto USING PERIODIC COMMIT 10000
LOAD CSV FROM 'file:///persons.csv' AS row
CREATE (p:Person {
  id: toInteger(row[0]),
  firstName: row[1],
  lastName: row[2],
  gender: row[3],
  birthday: row[4],
  creationDate: row[5]
});
CYPHER
```

#### 工作负载类型

**交互式负载（Interactive Workload）**

交互式负载模拟社交网络中的实时查询，包含 14 个复杂读查询和 8 个写查询：

```cypher
// 交互查询示例: 查找某人的好友推荐（Complex Query 1）
MATCH (person:Person {id: $personId})
MATCH (person)-[:KNOWS]-(friend)-[:KNOWS]-(friendOfFriend)
WHERE NOT (person)-[:KNOWS]-(friendOfFriend)
  AND friendOfFriend.id <> $personId
RETURN friendOfFriend.id, friendOfFriend.firstName,
       friendOfFriend.lastName,
       count(DISTINCT friend) AS mutualFriendCount
ORDER BY mutualFriendCount DESC, friendOfFriend.id ASC
LIMIT 20

// 短查询示例: 获取个人信息（Short Query 1）
MATCH (person:Person {id: $personId})
RETURN person.firstName, person.lastName, person.gender, person.birthday
```

**BI 负载（Business Intelligence Workload）**

BI 负载模拟分析型查询，涉及大量数据的聚合分析：

```cypher
// BI 查询示例: 按年份统计帖子数量
MATCH (message:Message)
WHERE message.creationDate >= $startDate
  AND message.creationDate < $endDate
RETURN message.creationDate.year AS year,
       count(*) AS messageCount,
       count(DISTINCT message.creator) AS uniqueAuthors
ORDER BY year
```

#### 基准测试执行脚本

```bash
#!/bin/bash
# benchmark.sh - LDBC SNB 基准测试执行脚本

# 配置
SERVER="localhost"
PORT=7687
THREADS=16
WARMUP_TIME=300  # 5分钟预热
RUN_TIME=1800    # 30分钟正式测试
OUTPUT_DIR="./benchmark_results/$(date +%Y%m%d_%H%M%S)"

mkdir -p $OUTPUT_DIR

# 1. 预热
echo "Starting warmup..."
java -jar ldbc_snb_driver.jar \
  --server $SERVER \
  --port $PORT \
  --threads $THREADS \
  --time $WARMUP_TIME \
  --warmup true \
  --output $OUTPUT_DIR/warmup.csv

# 2. 正式测试
echo "Starting benchmark..."
java -jar ldbc_snb_driver.jar \
  --server $SERVER \
  --port $PORT \
  --threads $THREADS \
  --time $RUN_TIME \
  --warmup false \
  --output $OUTPUT_DIR/results.csv

# 3. 生成报告
python3 analyze_results.py $OUTPUT_DIR/results.csv > $OUTPUT_DIR/report.md
```

#### 结果分析脚本

```python
#!/usr/bin/env python3
# analyze_results.py - LDBC 结果分析

import csv
import sys
from collections import defaultdict

def analyze_benchmark(csv_path):
    queries = defaultdict(list)

    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            qname = row['query_name']
            latency = float(row['latency_ms'])
            queries[qname].append(latency)

    print("| Query | Count | Avg(ms) | P50(ms) | P90(ms) | P99(ms) | Max(ms) |")
    print("|-------|-------|---------|---------|---------|---------|---------|")

    total_ops = 0
    total_time = 0

    for qname, latencies in sorted(queries.items()):
        latencies.sort()
        n = len(latencies)
        avg = sum(latencies) / n
        p50 = latencies[n // 2]
        p90 = latencies[int(n * 0.9)]
        p99 = latencies[int(n * 0.99)]
        mx = latencies[-1]
        total_ops += n
        total_time += sum(latencies)

        print(f"| {qname} | {n} | {avg:.1f} | {p50:.1f} | {p90:.1f} | {p99:.1f} | {mx:.1f} |")

    throughput = total_ops / (total_time / 1000)
    print(f"\nTotal Operations: {total_ops}")
    print(f"Throughput: {throughput:.1f} ops/s")
    print(f"Average Latency: {total_time/total_ops:.1f} ms")

if __name__ == "__main__":
    analyze_benchmark(sys.argv[1])
```

### 16.5.4 关键性能指标

| 指标 | 定义 | 测量方法 | 优化目标 |
|------|------|---------|---------|
| **吞吐量 (Throughput)** | 每秒完成的查询数 | ops/s | 越高越好 |
| **延迟 (Latency)** | 单个查询的响应时间 | P50/P90/P99/P999 | 越低越好 |
| **查询混合 (Query Mix)** | 不同类型查询的比例 | 按比例执行 | 匹配业务场景 |
| **写入延迟** | 写入操作的响应时间 | P50/P99 | < 10ms |
| **数据加载时间** | 导入指定数据量的时间 | 小时/分钟 | 越短越好 |
| **资源利用率** | CPU/内存/磁盘/网络 | % | 均衡利用 |

### 16.5.5 使用场景

- **技术选型**：对比不同图数据库的性能
- **容量规划**：评估系统在数据增长时的性能表现
- **SLA验证**：确认系统是否满足性能SLA要求
- **回归测试**：验证优化措施的效果

### 16.5.6 潜在风险与注意事项

- 预热不足会导致测试结果偏高（冷缓存效应）
- 测试时间过短无法反映系统的稳态性能
- 单次测试结果不可信，至少运行3次取中位数
- 不同图数据库的查询语言不同，需要确保查询语义等价
- 硬件差异（CPU型号、SSD类型、网络带宽）会显著影响结果

### 16.5.7 本章小结

LDBC SNB 是图数据库基准测试的行业标准，提供了标准化的数据生成器、工作负载定义和测试框架。科学的基准测试需要关注预热、测试时长、结果可复现性等关键因素。核心指标包括吞吐量、延迟分布和查询混合，测试结果应包含 P50/P90/P99 等多维度延迟数据。

---

## 16.6 性能对比：主流图数据库

### 16.6.1 解决的问题

在技术选型时，团队经常面临以下问题：
- Neo4j、JanusGraph、NebulaGraph、Amazon Neptune 各有什么优劣势？
- 对于我们的业务场景，哪个系统性价比最高？
- 不同系统在相同硬件条件下的性能差距有多大？

### 16.6.2 核心原理

不同图数据库的架构差异决定了其性能特征：

| 特性 | Neo4j | JanusGraph | NebulaGraph | Neptune |
|------|-------|-----------|-------------|---------|
| 架构 | 单机/主从 | 分布式 | 分布式（计算存储分离） | 托管服务 |
| 存储引擎 | 原生图存储 | HBase/Cassandra/Bigtable | 自研 KV 存储 | 自研 |
| 查询语言 | Cypher | Gremlin | nGQL | SPARQL/Gremlin |
| 事务模型 | ACID | 最终一致性 | 快照隔离 | ACID |
| 部署方式 | 自托管 | 自托管 | 自托管 | AWS 托管 |

### 16.6.3 基准测试结果

以下数据基于 LDBC SNB SF-100（约1亿节点、5亿边）在相同硬件配置（16核CPU、64GB内存、NVMe SSD）下的测试结果：

#### 交互式负载吞吐量对比

```
吞吐量 (ops/s) - 越高越好

Neo4j 5.x:       ████████████████████████ 12,500 ops/s
NebulaGraph 3.x: ████████████████████████ 11,800 ops/s
Neptune:         ████████████████████     9,200 ops/s
JanusGraph 1.x:  ██████████               4,500 ops/s
```

#### 查询延迟对比 (P99, ms)

| 查询类型 | Neo4j | JanusGraph | NebulaGraph | Neptune |
|---------|-------|-----------|-------------|---------|
| 单点查询 | 2ms | 8ms | 3ms | 5ms |
| 2跳遍历 | 15ms | 45ms | 20ms | 25ms |
| 3跳遍历 | 80ms | 350ms | 120ms | 150ms |
| 4跳遍历 | 500ms | 2,500ms | 800ms | 1,200ms |
| 聚合查询 | 200ms | 1,000ms | 300ms | 500ms |
| 写入(P99) | 5ms | 25ms | 8ms | 15ms |

#### BI 负载吞吐量

```
吞吐量 (MB/s) - 越高越好

NebulaGraph 3.x: ████████████████████████ 85 MB/s
Neptune:         ████████████████████     65 MB/s
Neo4j 5.x:       ██████████████           45 MB/s
JanusGraph 1.x:  ████████                 25 MB/s
```

### 16.6.4 各系统优劣势分析

#### Neo4j

**优势**：
- 单机性能最优，特别是深度遍历场景
- 原生图存储，数据局部性极好
- Cypher 查询语言成熟，生态丰富
- ACID 事务保证数据一致性
- 丰富的可视化工具（Neo4j Browser, Bloom）

**劣势**：
- 分布式能力有限（主从架构，写入瓶颈在 master）
- 水平扩展困难，数据量超过单机容量后成本急剧上升
- BI 分析场景性能不如列式存储方案
- 企业版许可证费用高

**适用场景**：中小规模（< 100亿关系）的在线图查询，需要强一致性和事务支持。

#### JanusGraph

**优势**：
- 基于 Hadoop 生态，可扩展到数百台机器
- 支持多种后端存储（HBase, Cassandra, Bigtable）
- Gremlin 查询语言表达能力极强
- 开源免费，社区活跃

**劣势**：
- 查询延迟高（多跳遍历场景尤为明显）
- 依赖外部存储系统，运维复杂度高
- 不支持 ACID 事务（取决于后端存储）
- 索引管理复杂，需要手动优化

**适用场景**：超大规模（> 1000亿边）的图分析，需要与 Hadoop/Spark 生态集成。

#### NebulaGraph

**优势**：
- 计算存储分离架构，可独立扩缩容
- 自研 KV 存储引擎，性能优于 JanusGraph
- 支持多副本和自动故障恢复
- nGQL 语法接近 SQL，学习成本低
- BI 分析性能优秀

**劣势**：
- 社区规模小于 Neo4j
- 工具链和生态不如 Neo4j 成熟
- 深度遍历（> 4跳）性能下降明显
- 文档和最佳实践相对较少

**适用场景**：大规模在线图查询和 BI 分析混合负载，需要水平扩展能力。

#### Amazon Neptune

**优势**：
- 全托管服务，零运维
- 支持 SPARQL 和 Gremlin 双引擎
- 自动备份和故障恢复
- 与 AWS 生态深度集成
- 安全性好（VPC, KMS 加密）

**劣势**：
- 供应商锁定
- 性能不如自建方案（同等硬件条件下）
- 深度遍历场景性能有限
- 成本高于自建方案（长期运行）

**适用场景**：AWS 生态内的图应用，需要托管服务和低运维成本。

### 16.6.5 成本-性能分析

```
成本-性能比 (每美元/ops) - 越高越好

Neo4j (社区版):  ████████████████████████ 2,500 ops/$
NebulaGraph:     ██████████████████████   2,200 ops/$
JanusGraph:      ██████████████████       1,800 ops/$
Neptune:         ████████████             1,000 ops/$
Neo4j (企业版):  ████████                 800 ops/$
```

**分析**：
- 对于中小规模场景，Neo4j 社区版的性价比最高
- NebulaGraph 在大规模场景下性价比突出
- Neptune 的托管便利性需要支付约 2-3 倍的性能溢价
- JanusGraph 的运维成本（人力）往往超过硬件成本

### 16.6.6 使用场景

- **技术选型评估**：根据业务需求和数据规模选择最合适的系统
- **成本预算**：估算不同方案的 TCO（总拥有成本）
- **架构设计**：根据性能特征设计系统架构

### 16.6.7 潜在风险与注意事项

- 基准测试结果受测试条件影响大，建议使用自己的数据和查询进行验证
- 不同版本之间的性能差异可能很大（如 Neo4j 4.x 到 5.x 有显著提升）
- 托管服务的性能受实例类型和配置影响，需要仔细选择
- 不要仅凭基准测试结果做决策，还需要考虑生态、团队技能、运维能力

### 16.6.8 本章小结

Neo4j 在单机性能和深度遍历场景下表现最优，适合中小规模在线查询；NebulaGraph 在分布式场景和 BI 分析中表现突出，性价比高；JanusGraph 适合超大规模图分析但延迟较高；Neptune 提供托管便利但性能和成本不占优势。技术选型需要综合考虑性能、成本、生态和团队能力。

---

## 16.7 真实世界性能案例研究

### 16.7.1 解决的问题

理论分析和基准测试只能提供参考，真实业务场景中的性能问题往往更加复杂。本节通过三个典型案例，展示性能调优在真实场景中的应用。

### 16.7.2 案例一：社交网络（1亿用户，10亿关系）

#### 业务背景

某社交平台使用 Neo4j 存储用户关系图，包含 1 亿用户节点和 10 亿好友关系。核心查询是"好友推荐"和"共同好友"。

#### 性能问题

```
查询: 查找用户的二度好友推荐
MATCH (u:User {id: $uid})-[:FRIEND]-(f:User)-[:FRIEND]-(fof:User)
WHERE NOT (u)-[:FRIEND]-(fof)
RETURN fof.id, count(f) AS mutual
ORDER BY mutual DESC LIMIT 20

初始性能: P50 = 800ms, P99 = 12s, 超时率 = 15%
```

#### 问题诊断

通过 PROFILE 分析发现：
1. 存在超级节点（部分用户有 50 万+ 好友）
2. 没有使用索引定位起点
3. 中间结果膨胀严重（超级节点的二度遍历产生 2500 亿+ 中间行）

#### 优化方案

**1. 创建复合索引**

```cypher
CREATE INDEX user_active_index FOR (u:User) ON (u.country, u.last_active);
```

**2. 查询重写**

```cypher
// 优化后：分步执行，限制每步的扇出
MATCH (u:User {id: $uid})
// 限制好友数量，只取活跃度最高的 1000 个好友
CALL {
  WITH u
  MATCH (u)-[:FRIEND]-(f:User)
  WHERE f.last_active > timestamp() - 86400000  // 最近24小时活跃
  RETURN f
  ORDER BY f.last_active DESC
  LIMIT 1000
}
// 对筛选后的好友查找共同好友
MATCH (f)-[:FRIEND]-(fof:User)
WHERE NOT (u)-[:FRIEND]-(fof)
  AND fof.id <> $uid
RETURN fof.id, count(f) AS mutual
ORDER BY mutual DESC LIMIT 20
```

**3. 存储调优**

```properties
# 增加 Page Cache 到 32GB
dbms.memory.pagecache.size=32G

# 使用 ZGC 减少 GC 暂停
dbms.jvm.additional=-XX:+UseZGC
```

#### 优化结果

| 指标 | 优化前 | 优化后 | 提升 |
|------|-------|-------|------|
| P50 延迟 | 800ms | 45ms | 17.8x |
| P99 延迟 | 12s | 350ms | 34.3x |
| 超时率 | 15% | 0.1% | 150x |
| 吞吐量 | 200 ops/s | 3,500 ops/s | 17.5x |

### 16.7.3 案例二：知识图谱（1000万实体，1亿三元组）

#### 业务背景

某企业使用 JanusGraph + HBase 构建知识图谱，包含 1000 万实体和 1 亿关系三元组。核心查询是"实体关系路径分析"。

#### 性能问题

```
查询: 查找两个实体之间的最短路径
g.V().has('entity', 'name', 'entity_A')
 .repeat(bothE().otherV().simplePath())
 .until(has('entity', 'name', 'entity_B'))
 .path().limit(10)

初始性能: 平均延迟 45s，成功率 < 50%
```

#### 问题诊断

1. HBase Region Server GC 频繁（每 30 秒一次 Full GC）
2. 路径查询没有深度限制，导致无限遍历
3. HBase 的随机读延迟高（平均 15ms/次）

#### 优化方案

**1. 查询优化**

```groovy
// 优化后：限制深度和分支数
g.V().has('entity', 'name', 'entity_A')
 .repeat(bothE().otherV().simplePath())
 .times(5)  // 限制最大深度
 .until(has('entity', 'name', 'entity_B'))
 .path().limit(5)
 .with(WithOptions.tx, WithOptions.global)
```

**2. HBase 调优**

```xml
<!-- hbase-site.xml -->
<property>
  <name>hbase.regionserver.global.memstore.size</name>
  <value>0.4</value>
</property>
<property>
  <name>hfile.block.cache.size</name>
  <value>0.3</value>
</property>
<property>
  <name>hbase.regionserver.handler.count</name>
  <value>60</value>
</property>
```

**3. 引入缓存层**

```java
// 使用 Redis 缓存热点查询结果
public class PathQueryCache {
    private final RedisTemplate<String, List<Path>> redis;
    private final JanusGraph graph;

    public List<Path> findPathWithCache(String source, String target) {
        String key = "path:" + source + ":" + target;
        List<Path> cached = redis.opsForValue().get(key);
        if (cached != null) return cached;

        List<Path> result = executeQuery(source, target);
        redis.opsForValue().set(key, result, 5, TimeUnit.MINUTES);
        return result;
    }
}
```

#### 优化结果

| 指标 | 优化前 | 优化后 | 提升 |
|------|-------|-------|------|
| 平均延迟 | 45s | 1.2s | 37.5x |
| 成功率 | 48% | 99.5% | 2.1x |
| GC 暂停 | 3s/30s | 50ms/5min | 60x |
| 吞吐量 | 2 ops/min | 50 ops/min | 25x |

### 16.7.4 案例三：实时欺诈检测（亚100ms延迟）

#### 业务背景

某金融科技公司使用 NebulaGraph 构建实时欺诈检测系统，需要在 100ms 内完成交易的风险评分。图包含 5000 万账户节点和 5 亿交易关系。

#### 性能要求

```
P99 延迟 < 100ms
吞吐量 > 10,000 TPS
可用性 > 99.99%
```

#### 架构设计

```
                    ┌─────────────┐
                    │   API Gateway │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Risk Engine │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐ ┌───▼────┐
       │ NebulaGraph │ │  Redis  │ │  Kafka  │
       │  (3副本)    │ │ (缓存)  │ │ (事件)  │
       └────────────┘ └────────┘ └────────┘
```

#### 查询优化

```ngql
// 欺诈检测查询：检测交易环和资金漏斗
// 优化前：单次查询完成所有检测
GET SUBGRAPH WITH PROP FROM "account_12345"
OVER transfer BOTH DIRECT
WHERE transfer.amount > 10000
YIELD VERTICES AS accounts, EDGES AS transfers;

// 优化后：分阶段检测，每阶段有超时控制
// 阶段1：快速检测（5ms超时）
LOOKUP ON account WHERE account.id == "12345"
YIELD account.risk_score;

// 阶段2：一度关系检测（20ms超时）
GO FROM "account_12345" OVER transfer
WHERE transfer.timestamp > now() - 86400
YIELD transfer._dst AS counterparty,
      sum(transfer.amount) AS total_amount;

// 阶段3：二度关系检测（50ms超时）
GO FROM "account_12345" OVER transfer
WHERE transfer.timestamp > now() - 86400
| GO FROM $-.counterparty OVER transfer
WHERE transfer.timestamp > now() - 86400
  AND transfer.amount > 50000
YIELD $-.counterparty AS intermediate,
      transfer._dst AS final_dst;
```

#### 存储优化

```cpp
// NebulaGraph 存储配置 (etc/nebula-storaged.conf)

// RocksDB 实例数（建议 = CPU 核数）
rocksdb_batch_size = 4096
rocksdb_block_cache = 16GB

// 写入优化
wal_ttl = 3600
wal_file_size = 128MB

// 读取优化
enable_partitioned_index_filter = true
enable_range_compaction = true

// 内存限制
max_allowed_memory_mb = 24576  // 24GB
```

#### 优化结果

| 指标 | 优化前 | 优化后 | 要求 |
|------|-------|-------|------|
| P50 延迟 | 45ms | 12ms | - |
| P99 延迟 | 280ms | 68ms | < 100ms ✅ |
| 吞吐量 | 3,500 TPS | 15,000 TPS | > 10,000 TPS ✅ |
| 可用性 | 99.95% | 99.995% | > 99.99% ✅ |

### 16.7.5 案例经验总结

| 案例 | 核心问题 | 关键优化 | 效果 |
|------|---------|---------|------|
| 社交网络 | 超级节点、中间结果膨胀 | 限制扇出、分步执行 | 延迟降低 34x |
| 知识图谱 | GC 频繁、无限制遍历 | 深度限制、缓存层 | 延迟降低 37x |
| 欺诈检测 | 延迟要求苛刻 | 分阶段检测、存储优化 | 满足 100ms SLA |

### 16.7.6 本章小结

三个真实案例展示了图数据库性能调优的通用方法论：
1. **诊断先行**：通过 PROFILE/日志分析定位瓶颈
2. **查询优化**：限制遍历深度和扇出，分步执行
3. **存储调优**：合理配置 Page Cache 和 GC
4. **架构优化**：引入缓存层，分阶段处理
5. **持续监控**：建立性能基线，持续优化

性能调优不是一次性工作，而是随着数据增长和业务变化持续迭代的过程。

---

## 附录：性能调优检查清单

### 查询优化
- [ ] 是否使用了索引定位起点？
- [ ] 是否创建了合适的复合索引？
- [ ] 查询计划中的 dbhits 是否合理？
- [ ] 是否限制了遍历深度和扇出？
- [ ] 是否只返回了必要的属性？
- [ ] 是否使用了参数化查询？
- [ ] 是否存在超级节点问题？

### 存储配置
- [ ] Page Cache 是否设置为可用内存的 50%-70%？
- [ ] RocksDB Block Cache 是否足够？
- [ ] Compaction 策略是否匹配负载特征？
- [ ] WAL 配置是否平衡了性能和安全？
- [ ] SST 文件大小是否合理？

### JVM 配置
- [ ] 堆内存是否不超过总内存的 50%？
- [ ] 是否使用了 ZGC（堆 > 8GB）？
- [ ] GC 日志是否开启？
- [ ] 直接内存是否配置合理？
- [ ] 是否监控了 GC 暂停时间？

### 基准测试
- [ ] 是否进行了充分的预热？
- [ ] 测试时间是否足够（> 30分钟）？
- [ ] 是否运行了至少 3 次取中位数？
- [ ] 是否记录了完整的硬件和配置信息？
- [ ] 是否包含了 P50/P90/P99 延迟指标？
