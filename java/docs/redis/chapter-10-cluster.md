# 第10章 高可用集群架构演进

## 10.1 主从复制（Replication）

### 全量同步与增量同步

主从复制是 Redis 高可用的基础。一个主节点可以有多个从节点，从节点实时同步主节点的数据：

```
主从复制架构：
  ┌──────────────┐
  │   主节点       │  ← 处理写入请求
  │   Master      │
  └──────┬───────┘
         │ 复制数据流
    ┌────┼────────────────┐
    │    │                 │
    ▼    ▼                  ▼
  ┌──────┐ ┌──────┐      ┌──────┐
  │ 从1   │ │ 从2   │ ...  │ 从N   │  ← 处理读取请求（可选）
  │ Slave │ │ Slave │      │ Slave │
  └──────┘ └──────┘      └──────┘
```

**全量同步（Full Sync）——从节点第一次连接或断连太久**：

```
全量同步流程（简化版）：

  从节点                          主节点
    │                               │
    │ SLAVEOF master_ip 6379        │
    │ ──────────────────────────►   │
    │                               │
    │  ◄── PSYNC ? -1               │ ← 从节点告诉主节点：我没有历史数据
    │                               │
    │  ◄── +FULLRESYNC replid 1     │ ← 主节点决定全量同步
    │                               │
    │  ◄── RDB 数据流                │ ← 主节点 BGSave 生成 RDB，发送过来
    │      （可能几 GB）              │    （期间主节点继续处理写请求，
    │                               │      增量命令缓存到 repl_backlog）
    │  清空旧数据，加载 RDB          │
    │                               │
    │  ◄── 缓冲的增量命令            │ ← RDB 发送完毕后，发送累积的写命令
    │      （repl_backlog 中的数据）   │
    │                               │
    │  应用增量命令                  │
    │  （追上主节点的最新状态）        │
    │                               │
    │  进入增量同步模式              │
    │  ◄── 持续传播写命令             │ ← 后续写命令实时同步
```

**增量同步（Partial Sync）——从节点短时间断开重连**：

```
增量同步流程（从节点断开又重连）：

  从节点                          主节点
    │                               │
    │  断开了 30 秒                  │
    │  ...                           │
    │                               │
    │  重新连接                       │
    │  PSYNC replid 123 offset 50000 │ ← 告诉主节点：我断在 50000 这个偏移量
    │ ──────────────────────────►   │
    │                               │
    │  ◄── +CONTINUE                │ ← 主节点检查 repl_backlog 中是否还有
    │  ◄── 偏移量 50000 之后的命令    │    50000 之后的命令
    │      （只在 repl_backlog 中）    │    有 → 增量同步，快！
    │                               │
    │  应用增量命令                  │
    │  恢复同步状态                  │
    │                               │

    如果从节点的偏移量不在 repl_backlog 中（断连太久）：
    → 回退到全量同步（再次传输 RDB...）
    → repl_backlog 的大小决定了"断连多久可以增量同步"
```

```bash
# redis.conf 主从复制配置
# 主节点配置
repl-backlog-size 64mb          # repl_backlog 大小（越大，可容忍的断连时间越长）
repl-backlog-ttl 3600           # 没有从节点时，保留 backlog 多少秒
repl-diskless-sync no           # 是否无盘同步（直接 socket 发送 RDB，不经过磁盘）

# 从节点配置
replicaof 192.168.1.100 6379    # 指定主节点地址
replica-read-only yes           # 从节点只读（默认，禁止写入）
replica-priority 100            # 哨兵选举时的优先级（越小优先级越高）
```

### 读写分离的"坑"

主从复制是异步的——主节点写入后立即返回，不等待从节点同步完成。这意味着从节点可能读到旧数据：

```
读写分离的数据延迟问题：

  客户端                        主节点                       从节点
    │                            │                           │
    │ SET user:1001 "new_data"    │                           │
    │ ─────────────────────────► │                           │
    │ ◄── OK                    │                           │
    │                            │                           │
    │ GET user:1001               │                           │
    │ ─────────────────────────► │                           │
    │ ◄── "new_data"            │                           │ ← 主节点：最新
    │                            │                           │
    │                            │ [异步复制中...]            │
    │                            │ ───────────────────────► │
    │                            │                           │
    │ GET user:1001               │                           │
    │ ──────────────────────────────────────────────────►  │
    │ ◄── "old_data"            │ ← 从节点：还没同步到！←  │
    │                            │                           │
    │                            │ 10ms 后...                │
    │                            │ ───────────────────────► │
    │                            │                           │
    │ OK，现在一致了              │                           │
```

**读写分离的建议**：
- 读**最终一致性**可以接受的场景（商品浏览、文章阅读）→ 读写分离有用
- 读**需要强一致性**的场景（刚写入就读取，如订单状态）→ 必须从主节点读
- **延迟敏感业务**：在应用层标记"写入后 100ms 内强制读主库"

```java
@Component
public class ReadWriteSeparationService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    @Qualifier("redisTemplateReadonly")
    private StringRedisTemplate readOnlyTemplate;

    // 写入：始终通过主库
    public void write(String key, String value) {
        redisTemplate.opsForValue().set(key, value);
    }

    // 读取：普通读走从库（如果允许最终一致性）
    public String read(String key) {
        return readOnlyTemplate.opsForValue().get(key);
    }

    // 写入后立即读取 → 走主库，避免延迟
    public String writeAndRead(String key, String value) {
        redisTemplate.opsForValue().set(key, value);

        // 写入后立即读取：强制从主库读
        return redisTemplate.opsForValue().get(key);
    }

    private static final Set<String> STRONG_CONSISTENCY_KEYS =
        Set.of("order:status:", "payment:");

    // 智能路由：根据 Key 前缀决定读哪个库
    public String smartRead(String key) {
        boolean requireStrongConsistency = STRONG_CONSISTENCY_KEYS
            .stream().anyMatch(key::startsWith);

        if (requireStrongConsistency) {
            return redisTemplate.opsForValue().get(key);
        }
        return readOnlyTemplate.opsForValue().get(key);
    }
}
```

---

## 10.2 哨兵模式（Sentinel）

### 主观下线与客观下线

Sentinel 是 Redis 的高可用解决方案——监控主从状态，在主节点故障时自动进行故障转移：

```
Sentinel 架构：
  ┌─────────────────────────────────────────────────┐
  │  Sentinel 集群（至少 3 个节点，保证多数投票）     │
  │  ┌───────┐    ┌───────┐    ┌───────┐          │
  │  │ Sen1  │◄──►│ Sen2  │◄──►│ Sen3  │          │
  │  └───┬───┘    └───┬───┘    └───┬───┘          │
  │      │            │            │               │
  └──────┼────────────┼────────────┼───────────────┘
         │            │            │
         ▼            ▼            ▼
  ┌─────────────────────────────────────────────┐
  │  Redis 主从                                    │
  │  ┌─────────────┐                              │
  │  │  Master     │◄──── 复制 ──── Slave1,Slave2 │
  │  │  (当前主)    │                              │
  │  └─────────────┘                              │
  └─────────────────────────────────────────────┘
```

**主观下线（Subjective Down，SDOWN）**：

Sentinel 实例 ping 主节点，如果在 `down-after-milliseconds` 内没有收到响应，该 Sentinel **主观认为**主节点下线：

```
Sentinel A → 心跳 PING → Master（超时）
Sentinel A: master 主观下线 (sdown)
```

**客观下线（Objective Down，ODOWN）**：

多个 Sentinel 都认为主节点下线，达到**法定人数（quorum）**后，确认主节点客观下线：

```
Sentinel A: 我 ping 不通 master
Sentinel B: 我也 ping 不通 master
Sentinel C: 我也 ping 不通 master
→ 节点数 >= quorum (2) → 客观下线 (odown)
→ 开始故障转移

如果只有 Sentinel A 认为 master 挂了：
→ 不触发转移（可能是 Sentinel A 自身的网络问题）
```

### Leader 选举与故障转移

```
故障转移流程：

  ┌────────────┐         ┌────────────┐         ┌────────────┐
  │  Master    │  宕机    │  Sentinel  │         │  Slave 1   │
  │  192.168.1.1│ ──────► │  集群       │         │  192.168.1.2│
  └────────────┘         │            │ ──────►  └────────────┘
                          │ 1. 选举新主  │            ↑
                          │ 2. SLAVEOF  │ ────────────┘
                          │    no one   │         成为新主节点
                          │ 3. 其他从   │
                          │    SLAVEOF  │ ──────► Slave 2, Slave 3
                          │    新主     │         指向新主
                          └────────────┘

  选主规则（按优先级）：
    1. replica-priority 最小的从节点（越小优先级越高）
    2. 复制偏移量最大的（数据最新）
    3. runid 最小的（字典序）
```

### 脑裂问题（Split-Brain）

脑裂是分布式系统中最棘手的问题之一——网络分区后，两个节点都认为自己是主节点：

```
脑裂场景：
                                  网络分区 X                   网络分区 Y
  ┌──────────────────────────────────┐  ┌──────────────────────────────┐
  │  客户端 A：写主节点 192.168.1.1   │  │  客户端 B：写主节点 192.168.1.2│
  │  (原主节点，分区分在 X 侧)        │  │  (从节点被 Sentinel 提升为主)  │
  │                                  │  │                              │
  │  SET key1 "value1"               │  │  SET key2 "value2"           │
  │  SET key3 "value3"               │  │  SET key1 "value_from_B"     │
  │                                  │  │                              │
  │  ↑ 这些数据在分区恢复后会丢失      │  │  ↑ 这些数据是"合法"的        │
  └──────────────────────────────────┘  └──────────────────────────────┘

  网络恢复后：
  旧主节点（192.168.1.1）以从节点身份重新加入集群
  → 它会清空自己的数据，从新主节点全量同步
  → 分区 X 期间写入的数据全部丢失！
```

**Redis 对脑裂的防御**：

```bash
# redis.conf 脑裂保护
min-replicas-to-write 1    # 至少有 1 个从节点连接时才能写入
min-replicas-max-lag 10    # 从节点延迟超过 10 秒也禁止写入

# 当节点成为"孤主"（没有从节点连接或从节点延迟过大）：
# → 禁止写入 → 保护数据不分裂
# → 代价是牺牲可用性（但好过数据不一致）
```

### Sentinel 配置与部署

```bash
# sentinel.conf（每个 Sentinel 实例一份）
port 26379
sentinel monitor mymaster 192.168.1.100 6379 2  # 2 = quorum
sentinel down-after-milliseconds mymaster 5000    # 5 秒无响应认为故障
sentinel failover-timeout mymaster 60000          # 故障转移超时 60 秒
sentinel parallel-syncs mymaster 1               # 同时同步的从节点数

# 哨兵连接密码（如果 Redis 配置了密码）
sentinel auth-pass mymaster yourpassword
```

```yaml
# Docker Compose 部署 Sentinel（3 节点）
version: '3.8'
services:
  redis-master:
    image: redis:7.2
    command: redis-server --appendonly yes --requirepass pass123
    ports: ["6379:6379"]

  redis-slave-1:
    image: redis:7.2
    command: redis-server --appendonly yes --requirepass pass123
      --replicaof redis-master 6379 --masterauth pass123

  redis-slave-2:
    image: redis:7.2
    command: redis-server --appendonly yes --requirepass pass123
      --replicaof redis-master 6379 --masterauth pass123

  sentinel-1:
    image: redis:7.2
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/sentinel.conf

  sentinel-2:
    image: redis:7.2
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel-2.conf:/etc/sentinel.conf

  sentinel-3:
    image: redis:7.2
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel-3.conf:/etc/sentinel.conf
```

```java
// Java 通过 Sentinel 连接 Redis（自动感知主从切换）
@Configuration
public class SentinelConfig {

    @Bean
    public RedisConnectionFactory sentinelConnectionFactory() {
        RedisSentinelConfiguration sentinelConfig =
            new RedisSentinelConfiguration()
                .master("mymaster")
                .sentinel("192.168.1.10", 26379)
                .sentinel("192.168.1.11", 26379)
                .sentinel("192.168.1.12", 26379);

        // 设置密码
        sentinelConfig.setPassword("pass123");

        return new LettuceConnectionFactory(sentinelConfig);
    }
}
```

---

## 10.3 切片集群（Redis Cluster）

### Gossip 协议与去中心化架构

Redis Cluster 是**去中心化**的——没有中心节点，每个节点都保存了完整的集群拓扑信息：

```
Redis Cluster 架构（3 主 3 从）：

  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Master A │◄──►│ Master B │◄──►│ Master C │
  │ (0-5460) │    │(5461-10922)│   │(10923-16383)│
  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │               │               │
       ▼               ▼               ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Slave A  │    │ Slave B  │    │ Slave C  │
  │          │    │          │    │          │
  └──────────┘    └──────────┘    └──────────┘

  节点间通过 Gossip 协议交换信息：
  - 每个节点每秒随机选 5 个节点发送 PING
  - PONG 携带节点的状态、槽位信息
  - 最终所有节点的信息趋于一致（最终一致性）
  - 不需要中心节点协调
```

```
哈希槽分配：
  16384 个哈希槽均匀分布在 3 个主节点上：
  Master A: [0, 1, 2, ..., 5460]   = 5461 个槽
  Master B: [5461, 5462, ..., 10922] = 5462 个槽
  Master C: [10923, 10924, ..., 16383] = 5461 个槽

  每个 key 的归属：
  slot = CRC16(key) % 16384
  → 根据 slot 找到对应的主节点
```

### 数据迁移与 MOVE/ASK 重定向

```
MOVED 重定向（客户端直连正确节点）：

  客户端（未缓存槽位信息）              Master A                     Master B
    │                                   │                          │
    │ GET user:1001                      │                          │
    │ ──────────────────────────────►   │                          │
    │                                   │ ← CRC16("user:1001") % 16384
    │                                   │    = 12000，归属 Master B
    │  ◄── MOVED 12000 192.168.1.2:6379 │                          │
    │                                   │                          │
    │ （缓存：user:1001 在 192.168.1.2）  │                          │
    │                                   │                          │
    │ GET user:1001                      │                          │
    │ ──────────────────────────────────────────────────────────►  │
    │                                   │         ◄── "value"      │
```

```
ASK 重定向（数据迁移中——部分数据已迁移）：

  ┌─────────────────────────────────────────────────┐
  │  数据迁移中                                      │
  │  Master A 槽 12000 → 正在迁移到 Master B         │
  │                                                  │
  │  当一个 key 在 A 已不存在（已被迁移到 B）         │
  │  → A 返回 ASK 12000 192.168.1.2:6379            │
  │  → 客户端先发送 ASKING 命令到 B                  │
  │  → 再发送原命令到 B                              │
  │                                                  │
  │  MOVED vs ASK 的区别：                            │
  │  MOVED：槽位已经永久迁移了                        │
  │  ASK：槽位正在迁移中，只是这个 key 暂时在那边      │
  └─────────────────────────────────────────────────┘
```

### 扩容与缩容

```bash
# 假设已有 3 主 3 从，现在增加 1 个主节点

# 1. 添加节点
redis-cli --cluster add-node 192.168.1.7:6379 192.168.1.1:6379

# 2. 从已有节点迁移部分槽位到新节点
redis-cli --cluster reshard 192.168.1.7:6379

# 交互式：
# How many slots do you want to move? 4096  ← 16384/4 ≈ 4096
# What is the receiving node ID? <新节点ID>
# Source node #1: all  ← 从所有现有节点平均抽取
```

**多 Key 操作的局限**：

```bash
# Redis Cluster 的一个限制：
# MGET、MSET、事务、Lua 脚本中的多个 key 必须在同一个槽上

# ❌ 跨槽操作会报错
MGET user:1001 order:2001    # 可能在两个不同节点上
# → CROSSSLOT Keys in request don't hash to the same slot

# ✅ 解决方案：Hash Tag —— { }内的部分用于计算 CRC16
# 让相关的 key 强制落在同一个槽上
MGET user:{1001}:profile user:{1001}:orders
# CRC16("1001") → 两个 key 的槽位相同，可以在同一节点上操作
```

```java
// Java 中连接 Redis Cluster
@Configuration
public class ClusterConfig {

    @Bean
    public RedisConnectionFactory clusterConnectionFactory() {
        RedisClusterConfiguration clusterConfig =
            new RedisClusterConfiguration()
                .clusterNode("192.168.1.1", 6379)
                .clusterNode("192.168.1.2", 6379)
                .clusterNode("192.168.1.3", 6379)
                .setMaxRedirects(3); // MOVED 重定向的最大次数

        return new LettuceConnectionFactory(clusterConfig);
    }
}

// 使用 Hash Tag 保证相关 key 在同一个槽
@Component
public class ClusterKeyService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 使用 Hash Tag 让用户相关的数据在同一节点
    public void setUserData(Long userId, String field, String value) {
        // {1001} 作为 Hash Tag —— 所有 {userId} 开头的 key 在同一槽
        String key = "user:{" + userId + "}:" + field;
        redisTemplate.opsForValue().set(key, value);
    }

    // 批量操作用户数据（因为 Hash Tag 保证在同一槽，MGET 可用）
    public List<String> batchGetUserData(Long userId, List<String> fields) {
        String[] keys = fields.stream()
            .map(f -> "user:{" + userId + "}:" + f)
            .toArray(String[]::new);

        return redisTemplate.opsForValue().multiGet(Arrays.asList(keys));
    }
}
```

### 三种架构的对比与选型

| 维度 | 主从 + Sentinel | Redis Cluster |
|------|---------------|-------------|
| **数据容量** | 单机内存上限（通常 16-64GB） | **可水平扩展**（多节点总和） |
| **写入能力** | 单节点写入（主节点瓶颈） | **多节点写入**（线性扩展） |
| **自动分片** | ❌ 不分片 | ✅ 16384 个哈希槽 |
| **故障转移** | Sentinel 自动切换（秒级） | 集群自动切换（秒级） |
| **多 Key 操作** | ✅ 完全支持 | ❌ 限制（需 Hash Tag） |
| **事务** | ✅ 支持 | ❌ 跨槽事务不支持 |
| **部署复杂度** | 低 | 高 |
| **客户端支持** | 所有客户端 | 需支持 Cluster 协议 |

**选型建议**：

```
数据量 < 64GB     ──→  主从 + Sentinel（简单可靠）
数据量 64-512GB   ──→  Redis Cluster（水平扩展）
追求极致简单       ──→  主从 + Sentinel
需要多 Key 事务    ──→  主从 + Sentinel（或自己分片）
```

---

## 本章总结

| 架构 | 核心能力 | 关键风险 | 适用规模 |
|------|---------|---------|---------|
| **主从复制** | 读写分离、数据备份 | 主从延迟、无自动故障转移 | 小规模 |
| **Sentinel** | 自动故障转移、高可用 | 脑裂、丢失写入 | 中规模 |
| **Redis Cluster** | 水平扩展、自动分片、高可用 | 多 Key 限制、运维复杂 | 大规模 |

**核心原则**：
1. **从简单开始**——不要一上来就用 Cluster。大多数场景下 Sentinel 足够
2. **监控主从延迟**——`INFO replication` 中的 `master_repl_offset` 和 `slave_repl_offset` 差值是核心指标
3. **脑裂保护必配**——`min-replicas-to-write` 和 `min-replicas-max-lag` 是最后一道防线
4. **Cluster 的 Hash Tag 要提前设计**——上线后才发现需要跨槽操作就晚了