# 第7章 Neo4j 集群、备份与高可用架构

## 7.1 概述

随着图数据库在生产环境中的广泛应用，单一节点的 Neo4j 实例已无法满足企业对高可用性（High Availability, HA）、水平扩展（Horizontal Scaling）和灾难恢复（Disaster Recovery, DR）的需求。Neo4j 从 3.5 版本开始引入了**因果集群（Causal Clustering）**架构，并在 4.x/5.x 版本中持续演进，取代了旧版的主从复制（Master-Slave）架构，成为官方推荐的生产级部署方案。

本章将深入探讨 Neo4j 集群的核心架构、Raft 共识协议的工作原理、集群部署配置、备份与恢复策略、监控告警体系以及灾难恢复规划，帮助读者构建一个健壮、可扩展且高可用的图数据库生产环境。

---

## 7.2 因果集群架构

### 7.2.1 架构概览

Neo4j 因果集群采用**角色分离**的设计理念，将集群节点分为两类：

- **核心服务器（Core Server）**：负责处理写事务并参与 Raft 共识，是集群的"大脑"。通常部署奇数个（3、5、7）以形成法定人数（Quorum）。
- **只读副本（Read Replica）**：从核心服务器异步复制数据，仅处理读请求，用于扩展读吞吐量和降低核心服务器的负载。

这种架构的核心思想是**读写分离**：写操作必须经过 Raft 共识写入核心服务器，读操作可以路由到任意核心服务器或只读副本。客户端通过 Neo4j 驱动内置的路由机制（Routing Driver）自动选择合适的端点。

```
                    ┌─────────────────────┐
                    │   客户端应用         │
                    │  (Routing Driver)    │
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────┘      └────────────┐
              ▼                                ▼
     ┌──────────────────┐          ┌──────────────────┐
     │  Core Server 1   │◄────────►│  Core Server 2   │
     │  (Leader/Follower)│  Raft   │  (Leader/Follower)│
     └────────┬─────────┘          └────────┬─────────┘
              │                             │
     ┌────────┴─────────┐          ┌────────┴─────────┐
     │  Core Server 3   │          │  Core Server 4   │
     │  (Leader/Follower)│          │  (Leader/Follower)│
     └──────────────────┘          └──────────────────┘
              │                             │
              ▼                             ▼
     ┌──────────────────┐          ┌──────────────────┐
     │  Read Replica 1  │          │  Read Replica 2  │
     └──────────────────┘          └──────────────────┘
```

### 7.2.2 核心服务器（Core Server）

核心服务器是集群中唯一能够处理写操作的节点。它们通过 Raft 共识协议保持状态一致，确保在任何时刻最多只有一个 Leader 节点接受写请求。

核心服务器的关键职责：

1. **Raft 共识参与**：所有核心服务器组成 Raft 组，共同维护事务日志（Transaction Log）的强一致性。
2. **写事务处理**：只有 Raft Leader 可以接受写事务。Leader 将事务日志复制到 Follower 节点，在多数节点确认后提交。
3. **读事务处理**：任何核心服务器都可以处理读请求，但因果一致性要求客户端必须连接到足够新的节点。
4. **集群成员管理**：核心服务器共同决定集群成员的加入和离开，包括新核心服务器的引导和故障节点的剔除。

### 7.2.3 只读副本（Read Replica）

只读副本是集群中的"扩展单元"，它们不参与 Raft 共识，也不处理写操作。只读副本通过事务日志拉取（Transaction Log Pull）机制从核心服务器异步获取数据更新。

只读副本的典型使用场景：

- **扩展读吞吐量**：在查询密集的场景下，通过增加只读副本分散读负载。
- **地理分布**：在不同地域部署只读副本，降低跨区域访问延迟。
- **离线分析**：将只读副本用于 BI 报表、数据导出等不影响在线服务的操作。

> **重要**：只读副本的数据是最终一致（Eventually Consistent）的，可能存在数秒到数分钟的复制延迟。对于需要强一致性的读操作，应直接路由到核心服务器。

### 7.2.4 因果一致性（Causal Consistency）

Neo4j 因果集群提供**因果一致性**保证，这是比最终一致性更强的一致性模型。因果一致性确保：

1. 如果操作 B 因果依赖于操作 A（例如 B 读取了 A 写入的数据），那么所有观察者都会先看到 A 的结果，再看到 B 的结果。
2. 没有因果关系的操作可以以任意顺序被观察到。

Neo4j 通过**书签（Bookmark）**机制实现因果一致性。客户端在写操作完成后获得一个书签，后续的读操作携带此书签，驱动会确保目标节点至少应用了该书签对应的事务后才处理读请求。

```java
// Java 示例：使用书签实现因果一致性
try (Transaction tx = session.beginTransaction()) {
    tx.run("CREATE (n:User {name: $name})", parameters("name", "Alice"));
    tx.commit();
    Bookmark bookmark = session.lastBookmark();
    
    // 后续读操作携带书签，确保读到刚才写入的数据
    Session readSession = driver.session(
        SessionConfig.forDatabase("neo4j")
            .withBookmarks(bookmark)
            .build()
    );
    Result result = readSession.run("MATCH (n:User {name: 'Alice'}) RETURN n");
}
```

---

## 7.3 Raft 共识协议

### 7.3.1 协议概述

Raft 是一种用于管理复制日志的共识算法，由 Diego Ongaro 和 John Ousterhout 于 2014 年提出。相比 Paxos，Raft 更易于理解且实现更简洁。Neo4j 因果集群使用 Raft 协议在核心服务器之间达成共识。

Raft 将共识问题分解为三个相对独立的子问题：

1. **Leader 选举（Leader Election）**：当现有 Leader 失效时，触发新的选举。
2. **日志复制（Log Replication）**：Leader 将事务日志复制到所有 Follower。
3. **安全性（Safety）**：确保所有节点最终执行相同的事务序列。

### 7.3.2 节点状态与任期

Raft 中的每个节点处于以下三种状态之一：

- **Leader**：处理所有客户端请求，管理日志复制。一个集群中最多只有一个 Leader。
- **Follower**：被动接收来自 Leader 的日志复制，响应候选人的投票请求。
- **Candidate**：在选举期间临时状态，向其他节点请求投票。

Raft 将时间划分为**任期（Term）**，每个任期以一次选举开始。任期是单调递增的连续整数，作为逻辑时钟使用。

```
Term 1          Term 2           Term 3
┌──────┐       ┌───────┐        ┌───────┐
│选举   │       │选举    │        │选举    │
└──────┘       └───────┘        └───────┘
   │               │                │
   ▼               ▼                ▼
Leader ─────► Follower ─────► Leader ────► ...
```

### 7.3.3 Leader 选举

当 Follower 在**选举超时（Election Timeout）**内未收到 Leader 的心跳消息时，它会转换为 Candidate 并发起选举：

1. Candidate 增加自己的任期号（Term）。
2. Candidate 投票给自己，并向其他节点发送 RequestVote RPC。
3. 如果 Candidate 获得多数节点（N/2 + 1）的投票，则成为 Leader。
4. 新 Leader 立即发送心跳消息（AppendEntries RPC，不含日志条目）以确立权威。

选举超时是随机化的（通常 150-300ms），以避免多个节点同时发起选举导致选票分裂。

### 7.3.4 日志复制

Leader 处理写事务的流程如下：

1. 客户端将写请求发送到 Leader。
2. Leader 将事务追加到自己的日志中。
3. Leader 并行向所有 Follower 发送 AppendEntries RPC，包含新日志条目。
4. 当日志条目被多数节点（Quorum）复制后，Leader 提交该条目并应用到状态机。
5. Leader 将结果返回给客户端。
6. Leader 在后续的心跳中通知 Follower 该条目已提交，Follower 随后应用该条目。

```
Client ──► Leader ──► Follower 1
              │          │
              │          │
              ├─────────► Follower 2
              │          │
              └─────────► Follower 3
                         │
             多数确认后提交 ◄──┘
```

### 7.3.5 法定人数与容错

Raft 的容错能力取决于核心服务器的数量。法定人数（Quorum）定义为 `⌊N/2⌋ + 1`，其中 N 为核心服务器总数。

| 核心节点数 | 法定人数 | 最大容忍故障数 |
|-----------|---------|--------------|
| 1         | 1       | 0            |
| 3         | 2       | 1            |
| 5         | 3       | 2            |
| 7         | 4       | 3            |

**关键原则**：集群必须始终有法定人数的核心服务器在线才能处理写操作。读操作在任意核心服务器上均可处理，但可能读到过期数据。

### 7.3.6 Neo4j 中的 Raft 配置

Neo4j 的 Raft 相关配置项位于 `neo4j.conf` 中：

```properties
# 核心服务器发现地址列表（所有核心节点必须配置相同）
causal_clustering.initial_discovery_members=core1.example.com:5000,core2.example.com:5000,core3.example.com:5000

# Raft 相关超时配置（单位：毫秒）
causal_clustering.leader_election_timeout=2000ms
causal_clustering.heartbeat_interval=500ms
causal_clustering.heartbeat_timeout=2000ms

# 事务复制配置
causal_clustering.transaction_push_factor=1
causal_clustering.transaction_retry_timeout=30000ms

# 日志配置
causal_clustering.raft_log_pruning_frequency=10m
causal_clustering.raft_log_pruning_threshold=256
causal_clustering.raft_log_reader_grace_period=45m
```

---

## 7.4 集群部署配置

### 7.4.1 网络拓扑要求

部署 Neo4j 因果集群前，需要规划好网络拓扑。每个核心服务器需要开放以下端口：

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 5000 | TCP | 集群发现 | 初始成员发现和成员管理 |
| 6000 | TCP | Raft 通信 | 事务日志复制和共识 |
| 7000 | TCP | 备份/抓取 | 事务日志拉取（供只读副本和备份工具使用） |
| 7687 | TCP | Bolt | 客户端连接（二进制协议） |
| 7474 | TCP | HTTP | HTTP API 和浏览器界面 |

### 7.4.2 核心服务器配置

以下是一个三节点核心集群的配置示例。每个节点的配置基本相同，仅 `dbms.default_listen_address` 和 `dbms.default_advertised_address` 不同。

**节点 1（core1）的 `neo4j.conf`：**

```properties
# 数据库模式
dbms.mode=CORE

# 网络配置
dbms.default_listen_address=0.0.0.0
dbms.default_advertised_address=core1.example.com

# Bolt 连接器
dbms.connector.bolt.listen_address=:7687
dbms.connector.bolt.advertised_address=core1.example.com:7687

# HTTP 连接器
dbms.connector.http.listen_address=:7474
dbms.connector.http.advertised_address=core1.example.com:7474

# 集群发现
causal_clustering.initial_discovery_members=core1.example.com:5000,core2.example.com:5000,core3.example.com:5000

# 集群监听地址
causal_clustering.discovery_listen_address=:5000
causal_clustering.discovery_advertised_address=core1.example.com:5000
causal_clustering.transaction_listen_address=:6000
causal_clustering.transaction_advertised_address=core1.example.com:6000
causal_clustering.raft_listen_address=:7000
causal_clustering.raft_advertised_address=core1.example.com:7000

# 内存配置
dbms.memory.heap.initial_size=4g
dbms.memory.heap.max_size=4g
dbms.memory.pagecache.size=8g

# 事务配置
dbms.tx_log.rotation.retention_policy=7 days
dbms.tx_log.preallocate=true
```

**节点 2（core2）的差异配置：**

```properties
dbms.default_advertised_address=core2.example.com
dbms.connector.bolt.advertised_address=core2.example.com:7687
dbms.connector.http.advertised_address=core2.example.com:7474
causal_clustering.discovery_advertised_address=core2.example.com:5000
causal_clustering.transaction_advertised_address=core2.example.com:6000
causal_clustering.raft_advertised_address=core2.example.com:7000
```

**节点 3（core3）的差异配置：**

```properties
dbms.default_advertised_address=core3.example.com
dbms.connector.bolt.advertised_address=core3.example.com:7687
dbms.connector.http.advertised_address=core3.example.com:7474
causal_clustering.discovery_advertised_address=core3.example.com:5000
causal_clustering.transaction_advertised_address=core3.example.com:6000
causal_clustering.raft_advertised_address=core3.example.com:7000
```

### 7.4.3 只读副本配置

只读副本的配置与核心服务器类似，但 `dbms.mode` 不同：

```properties
# 数据库模式
dbms.mode=READ_REPLICA

# 网络配置
dbms.default_listen_address=0.0.0.0
dbms.default_advertised_address=replica1.example.com

# Bolt 连接器
dbms.connector.bolt.listen_address=:7687
dbms.connector.bolt.advertised_address=replica1.example.com:7687

# HTTP 连接器
dbms.connector.http.listen_address=:7474
dbms.connector.http.advertised_address=replica1.example.com:7474

# 集群发现（与核心服务器相同）
causal_clustering.initial_discovery_members=core1.example.com:5000,core2.example.com:5000,core3.example.com:5000

# 只读副本不需要配置 transaction_listen_address 和 raft_listen_address
causal_clustering.discovery_listen_address=:5000
causal_clustering.discovery_advertised_address=replica1.example.com:5000

# 内存配置
dbms.memory.heap.initial_size=4g
dbms.memory.heap.max_size=4g
dbms.memory.pagecache.size=16g

# 只读副本通常配置更大的页缓存以优化读性能
```

### 7.4.4 客户端驱动配置

客户端需要使用 Neo4j 的**路由驱动（Routing Driver）**来连接集群。路由驱动会自动发现集群拓扑并将请求路由到正确的节点。

**Java 驱动配置示例：**

```java
import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Config;
import org.neo4j.driver.GraphDatabase;
import org.neo4j.driver.Driver;

Config config = Config.builder()
    .withConnectionTimeout(10, TimeUnit.SECONDS)
    .withMaxConnectionPoolSize(50)
    .withConnectionAcquisitionTimeout(30, TimeUnit.SECONDS)
    .withRoutingTableTTL(5, TimeUnit.MINUTES)
    .build();

Driver driver = GraphDatabase.driver(
    "neo4j://core1.example.com:7687",  // 使用 neo4j:// 协议
    AuthTokens.basic("username", "password"),
    config
);
```

**Python 驱动配置示例：**

```python
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    "neo4j://core1.example.com:7687",  # 路由协议
    auth=("username", "password"),
    max_connection_pool_size=50,
    connection_timeout=10,
    routing_table_ttl=300
)

# 使用会话
with driver.session(database="neo4j") as session:
    result = session.run("MATCH (n:User) RETURN count(n)")
    print(result.single()[0])
```

**JavaScript 驱动配置示例：**

```javascript
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
    'neo4j://core1.example.com:7687',  // 路由协议
    neo4j.auth.basic('username', 'password'),
    {
        maxConnectionPoolSize: 50,
        connectionTimeout: 10000,
        routingTableTTL: 300000
    }
);

const session = driver.session({ database: 'neo4j' });
session.run('MATCH (n:User) RETURN count(n)')
    .then(result => {
        console.log(result.records[0].get(0));
        session.close();
    });
```

> **注意**：连接 URI 使用 `neo4j://` 协议而非 `bolt://`。`neo4j://` 协议启用路由功能，驱动会自动发现集群拓扑；`bolt://` 协议仅直连单个节点，不提供路由。

### 7.4.5 集群启动顺序

启动 Neo4j 因果集群时，建议遵循以下顺序：

1. 启动所有核心服务器。核心服务器之间会自动进行 Leader 选举并建立 Raft 组。
2. 验证核心集群状态：`CALL dbms.cluster.overview()`。
3. 启动只读副本。只读副本会自动发现核心服务器并开始同步数据。
4. 启动客户端应用，确认读写操作正常。

### 7.4.6 集群状态验证

部署完成后，可以通过以下 Cypher 查询验证集群状态：

```cypher
// 查看集群概览
CALL dbms.cluster.overview();

// 查看当前节点角色
CALL dbms.cluster.role();

// 查看 Raft 状态
CALL dbms.cluster.raft.status();

// 查看集群路由表
CALL dbms.routing.getRoutingTable({database: "neo4j"});
```

典型输出示例：

```
╒════════════╤══════════╤══════════════╤══════════════╤══════════╕
│id          │addresses │databases     │groups        │status    │
╞════════════╪══════════╪══════════════╪══════════════╪══════════╡
│core1       │[addr...] │[neo4j, system]│[CORE, RAFT]  │AVAILABLE │
├────────────┼──────────┼──────────────┼──────────────┼──────────┤
│core2       │[addr...] │[neo4j, system]│[CORE, RAFT]  │AVAILABLE │
├────────────┼──────────┼──────────────┼──────────────┼──────────┤
│core3       │[addr...] │[neo4j, system]│[CORE, RAFT]  │AVAILABLE │
├────────────┼──────────┼──────────────┼──────────────┼──────────┤
│replica1    │[addr...] │[neo4j]       │[READ_REPLICA]│AVAILABLE │
└────────────┴──────────┴──────────────┴──────────────┴──────────┘
```

---

## 7.5 备份与恢复

### 7.5.1 备份策略概述

Neo4j 提供多种备份方式，适用于不同的场景和需求：

| 备份方式 | 适用场景 | 优点 | 缺点 |
|---------|---------|------|------|
| 在线备份（Online Backup） | 生产环境持续备份 | 无需停机，支持增量 | 需要额外存储空间 |
| 事务日志备份 | 细粒度时间点恢复 | 恢复粒度精确 | 管理复杂 |
| 冷备份（离线备份） | 维护窗口期 | 简单可靠 | 需要停机 |
| Dump/Load | 数据迁移、版本升级 | 跨版本兼容 | 数据量大时较慢 |

### 7.5.2 在线备份（Online Backup）

Neo4j 的在线备份工具 `neo4j-admin backup` 可以从运行中的集群创建一致性备份，无需停机。

**备份命令语法：**

```bash
# 完整备份
neo4j-admin backup --database=neo4j \
    --backup-dir=/data/backups/neo4j \
    --from=core1.example.com:7000

# 增量备份（基于已有完整备份）
neo4j-admin backup --database=neo4j \
    --backup-dir=/data/backups/neo4j \
    --from=core1.example.com:7000 \
    --incremental
```

**备份脚本示例：**

```bash
#!/bin/bash
# /usr/local/bin/neo4j-backup.sh

BACKUP_BASE="/data/backups/neo4j"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE}/${DATE}"
LATEST_LINK="${BACKUP_BASE}/latest"
RETENTION_DAYS=30

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

# 执行备份
if [ -d "${LATEST_LINK}" ]; then
    # 增量备份
    neo4j-admin backup \
        --database=neo4j \
        --backup-dir="${BACKUP_DIR}" \
        --from=core1.example.com:7000 \
        --incremental \
        --from-previous="${LATEST_LINK}"
else
    # 完整备份
    neo4j-admin backup \
        --database=neo4j \
        --backup-dir="${BACKUP_DIR}" \
        --from=core1.example.com:7000
fi

# 更新 latest 软链接
rm -f "${LATEST_LINK}"
ln -s "${BACKUP_DIR}" "${LATEST_LINK}"

# 清理过期备份
find "${BACKUP_BASE}" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

# 验证备份完整性
neo4j-admin check-consistency \
    --database=neo4j \
    --from="${BACKUP_DIR}"
```

**备份配置（`neo4j.conf`）：**

```properties
# 启用在线备份（默认启用）
dbms.backup.enabled=true

# 备份监听地址
dbms.backup.listen_address=:7000

# 备份传输压缩
dbms.backup.compression=true
```

### 7.5.3 备份恢复

从在线备份恢复数据库：

```bash
# 停止 Neo4j 服务
systemctl stop neo4j

# 使用备份恢复数据库
neo4j-admin restore \
    --database=neo4j \
    --from=/data/backups/neo4j/latest

# 启动 Neo4j 服务
systemctl start neo4j
```

### 7.5.4 Dump/Load 方式

`neo4j-admin dump` 和 `neo4j-admin load` 用于跨版本迁移或数据导出。

**导出数据：**

```bash
# 导出数据库为 dump 文件
neo4j-admin dump --database=neo4j --to=/data/exports/neo4j-export.dump

# 导出时压缩
neo4j-admin dump --database=neo4j --to=/data/exports/neo4j-export.dump.gz
```

**导入数据：**

```bash
# 停止目标数据库
systemctl stop neo4j

# 导入 dump 文件
neo4j-admin load --database=neo4j --from=/data/exports/neo4j-export.dump

# 启动数据库
systemctl start neo4j
```

> **注意**：`dump/load` 操作需要目标数据库为空或不存在。`load` 会覆盖目标数据库的所有数据。

### 7.5.5 事务日志备份与时间点恢复

Neo4j 的事务日志（Transaction Log）记录了所有数据变更。通过保留事务日志，可以实现时间点恢复（Point-in-Time Recovery, PITR）。

**事务日志配置：**

```properties
# 事务日志保留策略
dbms.tx_log.rotation.retention_policy=7 days

# 事务日志文件大小
dbms.tx_log.rotation.size=256M

# 预分配事务日志文件
dbms.tx_log.preallocate=true
```

**时间点恢复步骤：**

```bash
# 1. 从基础备份恢复
neo4j-admin restore \
    --database=neo4j \
    --from=/data/backups/neo4j/base-backup

# 2. 应用事务日志到指定时间点
neo4j-admin recover \
    --database=neo4j \
    --from=/data/backups/neo4j/tx-logs \
    --recovery-time="2024-12-01 14:30:00"
```

### 7.5.6 备份最佳实践

1. **3-2-1 备份原则**：至少保留 3 份数据副本，存储在 2 种不同介质上，其中 1 份存储在异地。
2. **定期验证备份**：定期从备份恢复到一个测试环境并验证数据完整性。
3. **自动化备份**：使用 cron 或 systemd timer 自动执行备份脚本。
4. **监控备份状态**：将备份成功/失败状态集成到监控系统。
5. **加密备份**：对包含敏感数据的备份文件进行加密。
6. **备份元数据**：记录每次备份的时间戳、数据库版本、备份类型等信息。

```bash
# 备份元数据记录示例
cat > /data/backups/neo4j/${DATE}/backup_metadata.json << EOF
{
    "timestamp": "${DATE}",
    "neo4j_version": "$(neo4j --version)",
    "database": "neo4j",
    "backup_type": "${BACKUP_TYPE}",
    "node_count": "$(cypher-shell 'MATCH (n) RETURN count(n)')",
    "relationship_count": "$(cypher-shell 'MATCH ()-[r]->() RETURN count(r)')",
    "store_size": "$(du -sh /var/lib/neo4j/data/databases/neo4j)"
}
EOF
```

---

## 7.6 监控与告警

### 7.6.1 关键监控指标

生产环境中的 Neo4j 集群需要监控以下关键指标：

**集群健康指标：**

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 核心节点状态 | 每个核心节点是否可用 | 任何节点不可用即告警 |
| Raft Leader 是否存在 | 集群是否有 Leader | 无 Leader 超过 10s |
| 法定人数状态 | 核心节点是否达到法定人数 | 低于法定人数 |
| 复制延迟 | 只读副本与核心的同步延迟 | 超过 60s |
| 集群成员变更 | 节点加入或离开 | 任何变更需通知 |

**性能指标：**

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 堆内存使用率 | JVM 堆内存使用百分比 | > 80% |
| 页缓存命中率 | 页缓存命中率 | < 90% |
| 事务吞吐量 | 每秒提交的事务数 | 根据基线设定 |
| 事务延迟 | 事务提交的 P99 延迟 | > 1000ms |
| 连接池使用率 | Bolt 连接使用率 | > 80% |
| 磁盘使用率 | 数据目录磁盘使用率 | > 85% |

### 7.6.2 使用 Prometheus + Grafana 监控

Neo4j 支持通过 Prometheus 暴露指标。需要安装 `neo4j-metrics-plugin` 或使用 Neo4j 5.x 内置的 Prometheus 端点。

**配置 Prometheus 端点（Neo4j 5.x）：**

```properties
# 启用 Prometheus 指标
dbms.metrics.prometheus.enabled=true
dbms.metrics.prometheus.endpoint=:2004
```

**Prometheus 配置（`prometheus.yml`）：**

```yaml
scrape_configs:
  - job_name: 'neo4j'
    scrape_interval: 15s
    scrape_timeout: 10s
    static_configs:
      - targets:
        - 'core1.example.com:2004'
        - 'core2.example.com:2004'
        - 'core3.example.com:2004'
        - 'replica1.example.com:2004'
    relabel_configs:
      - source_labels: ['__address__']
        regex: '([^:]+)(:\d+)?'
        target_label: 'instance'
        replacement: '${1}'
```

**Grafana 告警规则示例：**

```json
{
  "alerts": [
    {
      "alert": "Neo4jCoreNodeDown",
      "expr": "neo4j_cluster_core_status == 0",
      "for": "30s",
      "labels": { "severity": "critical" },
      "annotations": {
        "summary": "Neo4j 核心节点 {{ $labels.instance }} 不可用"
      }
    },
    {
      "alert": "Neo4jNoRaftLeader",
      "expr": "neo4j_cluster_raft_leader == 0",
      "for": "10s",
      "labels": { "severity": "critical" },
      "annotations": {
        "summary": "Neo4j 集群无 Raft Leader"
      }
    },
    {
      "alert": "Neo4jReplicationLagHigh",
      "expr": "neo4j_cluster_replication_lag_seconds > 60",
      "for": "5m",
      "labels": { "severity": "warning" },
      "annotations": {
        "summary": "只读副本 {{ $labels.instance }} 复制延迟超过 60 秒"
      }
    },
    {
      "alert": "Neo4jHeapUsageHigh",
      "expr": "neo4j_memory_heap_usage_percent > 80",
      "for": "5m",
      "labels": { "severity": "warning" },
      "annotations": {
        "summary": "节点 {{ $labels.instance }} 堆内存使用率超过 80%"
      }
    }
  ]
}
```

### 7.6.3 使用 JMX 监控

Neo4j 通过 JMX（Java Management Extensions）暴露丰富的运行时指标。

**启用 JMX 远程监控：**

```properties
# neo4j.conf
dbms.jvm.additional=-Dcom.sun.management.jmxremote
dbms.jvm.additional=-Dcom.sun.management.jmxremote.port=9010
dbms.jvm.additional=-Dcom.sun.management.jmxremote.rmi.port=9010
dbms.jvm.additional=-Dcom.sun.management.jmxremote.local.only=false
dbms.jvm.additional=-Dcom.sun.management.jmxremote.authenticate=true
dbms.jvm.additional=-Dcom.sun.management.jmxremote.ssl=false
dbms.jvm.additional=-Dcom.sun.management.jmxremote.password.file=/etc/neo4j/jmx.password
dbms.jvm.additional=-Dcom.sun.management.jmxremote.access.file=/etc/neo4j/jmx.access
dbms.jvm.additional=-Djava.rmi.server.hostname=core1.example.com
```

**关键 JMX MBeans：**

| MBean | 指标 | 说明 |
|-------|------|------|
| `org.neo4j:type=Cluster` | `CoreStatus`, `Leader`, `Members` | 集群状态 |
| `org.neo4j:type=Raft` | `Term`, `CommitIndex`, `LastApplied` | Raft 共识状态 |
| `org.neo4j:type=Transactions` | `CommittedTxCount`, `RollbackedTxCount` | 事务统计 |
| `org.neo4j:type=PageCache` | `PageFaults`, `HitRatio` | 页缓存性能 |
| `org.neo4j:type=MemoryPool` | `HeapMemoryUsage`, `NonHeapMemoryUsage` | 内存使用 |

### 7.6.4 日志监控

Neo4j 的日志文件是排查问题的重要依据。关键日志文件包括：

| 日志文件 | 路径 | 内容 |
|---------|------|------|
| 服务日志 | `logs/neo4j.log` | 一般运行信息、错误和警告 |
| 安全日志 | `logs/security.log` | 认证和授权事件 |
| HTTP 日志 | `logs/http.log` | HTTP API 请求日志 |
| 查询日志 | `logs/query.log` | 慢查询和所有查询日志 |
| 调试日志 | `logs/debug.log` | 详细的调试信息 |

**配置查询日志：**

```properties
# 启用慢查询日志
dbms.logs.query.enabled=true
dbms.logs.query.threshold=1000ms  # 记录超过 1 秒的查询

# 启用所有查询日志（生产环境慎用，可能产生大量日志）
dbms.logs.query.all.enabled=false

# 查询日志文件配置
dbms.logs.query.rotation.size=20M
dbms.logs.query.rotation.keep_number=7
```

**使用 ELK 或 Loki 集中管理日志：**

```yaml
# Filebeat 配置示例（filebeat.yml）
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/neo4j/neo4j.log
      - /var/log/neo4j/security.log
      - /var/log/neo4j/query.log
    multiline:
      pattern: '^\d{4}-\d{2}-\d{2}'
      negate: true
      match: after

output.elasticsearch:
  hosts: ["elasticsearch.example.com:9200"]
  index: "neo4j-logs-%{+yyyy.MM.dd}"
```

### 7.6.5 健康检查端点

Neo4j 提供内置的健康检查端点，可用于负载均衡器和容器编排平台：

```bash
# HTTP 健康检查
curl -s http://core1.example.com:7474/ | jq '.'

# 集群健康检查
curl -s http://core1.example.com:7474/db/neo4j/cluster | jq '.'

# 自定义健康检查脚本
#!/bin/bash
# /usr/local/bin/neo4j-healthcheck.sh

NEO4J_HOST="${1:-localhost}"
NEO4J_PORT="${2:-7474}"

response=$(curl -s -o /dev/null -w "%{http_code}" \
    http://${NEO4J_HOST}:${NEO4J_PORT}/)

if [ "$response" = "200" ]; then
    exit 0  # 健康
else
    exit 1  # 不健康
fi
```

---

## 7.7 灾难恢复规划

### 7.7.1 灾难恢复策略

灾难恢复（Disaster Recovery, DR）规划的目标是在发生重大故障时，能够在可接受的时间窗口内恢复服务。Neo4j 集群的灾难恢复策略包括：

**1. 同城双活（Active-Active in Same Region）**

在同一个数据中心或同城数据中心部署两个集群，通过异步复制保持数据同步。

```
数据中心 A（主）             数据中心 B（备）
┌─────────────────┐         ┌─────────────────┐
│ Core1  Core2    │         │ Core4  Core5    │
│ Core3  Replica1 │  ────►  │ Core6  Replica2 │
│ (Leader)        │  异步    │ (Follower)      │
└─────────────────┘         └─────────────────┘
```

**2. 异地灾备（Geo-Disaster Recovery）**

在不同地理区域部署灾备集群，通过定期备份和事务日志传输实现数据保护。

```
主数据中心（北京）             灾备数据中心（上海）
┌─────────────────┐         ┌─────────────────┐
│ 生产集群        │  ────►  │ 灾备集群        │
│ 3 Core + N RR   │  备份    │ 3 Core + N RR   │
└─────────────────┘         └─────────────────┘
     │                              │
     ▼                              ▼
┌─────────────────┐         ┌─────────────────┐
│ 本地备份存储     │         │ 异地备份存储     │
└─────────────────┘         └─────────────────┘
```

### 7.7.2 故障场景与应对措施

| 故障场景 | 影响 | 应对措施 | RTO | RPO |
|---------|------|---------|-----|-----|
| 单个核心节点故障 | 写操作不受影响（法定人数仍在） | 自动故障转移，修复或替换故障节点 | < 30s | 0 |
| 两个核心节点故障（3节点集群） | 写操作不可用，读操作可能受影响 | 紧急恢复故障节点，或从备份重建 | 5-30min | 0-5min |
| 整个数据中心故障 | 服务完全不可用 | 切换到灾备集群 | 15-60min | 5-30min |
| 数据损坏/误操作 | 数据不一致或丢失 | 从备份恢复，应用事务日志到误操作前 | 1-4h | 取决于备份频率 |
| 网络分区 | 部分节点无法通信 | Raft 自动处理，少数派节点停止接受写请求 | 自动 | 0 |

### 7.7.3 灾备切换流程

**计划内切换（Planned Failover）：**

```bash
#!/bin/bash
# 计划内灾备切换脚本

PRIMARY_CLUSTER="core1.example.com:7474"
DR_CLUSTER="dr-core1.example.com:7474"

# 1. 停止主集群的写操作
echo "=== 步骤 1: 停止主集群写操作 ==="
cypher-shell -a "bolt://${PRIMARY_CLUSTER}" \
    "CALL dbms.cluster.setWriteMode(false)"

# 2. 等待主集群事务排空
echo "=== 步骤 2: 等待事务排空 ==="
sleep 30

# 3. 执行最后一次增量备份
echo "=== 步骤 3: 执行最终备份 ==="
neo4j-admin backup \
    --database=neo4j \
    --backup-dir=/data/backups/final \
    --from=core1.example.com:7000

# 4. 将备份传输到灾备集群
echo "=== 步骤 4: 传输备份到灾备集群 ==="
rsync -avz /data/backups/final/ \
    dr-admin@dr-core1.example.com:/data/backups/final/

# 5. 在灾备集群恢复
echo "=== 步骤 5: 在灾备集群恢复 ==="
ssh dr-admin@dr-core1.example.com \
    "neo4j-admin restore \
        --database=neo4j \
        --from=/data/backups/final"

# 6. 启动灾备集群
echo "=== 步骤 6: 启动灾备集群 ==="
ssh dr-admin@dr-core1.example.com "systemctl start neo4j"

# 7. 验证灾备集群
echo "=== 步骤 7: 验证灾备集群 ==="
sleep 30
cypher-shell -a "bolt://${DR_CLUSTER}" \
    "CALL dbms.cluster.overview()"

# 8. 更新 DNS 或负载均衡器指向灾备集群
echo "=== 步骤 8: 更新 DNS 指向灾备集群 ==="
# 此处调用 DNS 管理 API 或更新负载均衡器配置

echo "=== 灾备切换完成 ==="
```

**紧急切换（Emergency Failover）：**

```bash
#!/bin/bash
# 紧急灾备切换脚本

DR_CLUSTER="dr-core1.example.com:7474"

# 1. 检查主集群状态
echo "=== 检查主集群状态 ==="
if ! curl -s -f "http://core1.example.com:7474/" > /dev/null 2>&1; then
    echo "主集群不可用，启动紧急切换"
else
    echo "主集群仍可用，请确认是否需要切换"
    exit 1
fi

# 2. 从最近的备份恢复灾备集群
echo "=== 步骤 1: 从最近备份恢复 ==="
LATEST_BACKUP=$(ls -td /data/backups/neo4j/*/ | head -1)
neo4j-admin restore \
    --database=neo4j \
    --from="${LATEST_BACKUP}"

# 3. 启动灾备集群
echo "=== 步骤 2: 启动灾备集群 ==="
systemctl start neo4j

# 4. 验证灾备集群
echo "=== 步骤 3: 验证灾备集群 ==="
sleep 30
cypher-shell -a "bolt://${DR_CLUSTER}" \
    "CALL dbms.cluster.overview()"

# 5. 更新 DNS
echo "=== 步骤 4: 更新 DNS ==="
# 调用 DNS 管理 API

echo "=== 紧急切换完成 ==="
```

### 7.7.4 数据一致性验证

灾备切换后，必须验证数据一致性：

```cypher
// 验证节点和关系数量
MATCH (n) RETURN count(n) AS node_count;
MATCH ()-[r]->() RETURN count(r) AS rel_count;

// 验证数据库元数据
CALL db.info();

// 验证特定业务数据完整性
MATCH (a:Account)
WHERE a.balance IS NOT NULL
RETURN count(a) AS account_count,
       sum(a.balance) AS total_balance;

// 验证索引状态
SHOW INDEXES;

// 验证约束
SHOW CONSTRAINTS;
```

### 7.7.5 恢复演练

定期进行灾难恢复演练是确保 DR 计划有效性的关键：

```bash
#!/bin/bash
# 季度灾难恢复演练脚本

echo "=== 开始季度 DR 演练 ==="
DATE=$(date +%Y%m%d)

# 1. 创建演练报告
REPORT_FILE="/var/log/neo4j/dr-drill-${DATE}.log"
exec > >(tee -a "${REPORT_FILE}") 2>&1

# 2. 记录演练开始时间
echo "演练开始时间: $(date)"

# 3. 从生产备份恢复
echo "--- 步骤 1: 从生产备份恢复 ---"
LATEST_BACKUP=$(ls -td /data/backups/neo4j/*/ | head -1)
echo "使用备份: ${LATEST_BACKUP}"

time neo4j-admin restore \
    --database=neo4j \
    --from="${LATEST_BACKUP}"

if [ $? -ne 0 ]; then
    echo "恢复失败！"
    exit 1
fi

# 4. 启动数据库
echo "--- 步骤 2: 启动数据库 ---"
systemctl start neo4j
sleep 30

# 5. 验证数据
echo "--- 步骤 3: 验证数据 ---"
NODE_COUNT=$(cypher-shell "MATCH (n) RETURN count(n)" -o csv | tail -1)
REL_COUNT=$(cypher-shell "MATCH ()-[r]->() RETURN count(r)" -o csv | tail -1)
echo "节点数: ${NODE_COUNT}"
echo "关系数: ${REL_COUNT}"

# 6. 执行读写测试
echo "--- 步骤 4: 读写测试 ---"
cypher-shell "CREATE (n:DRTest {id: '${DATE}', timestamp: datetime()}) RETURN n"
cypher-shell "MATCH (n:DRTest {id: '${DATE}'}) RETURN n"
cypher-shell "MATCH (n:DRTest {id: '${DATE}'}) DELETE n"

# 7. 记录演练结果
echo "--- 步骤 5: 记录结果 ---"
echo "演练完成时间: $(date)"
echo "恢复时间: ${RESTORE_TIME} 秒"
echo "数据验证: 通过"
echo "读写测试: 通过"

# 8. 停止演练数据库
systemctl stop neo4j

echo "=== DR 演练完成 ==="
echo "报告已保存至: ${REPORT_FILE}"
```

---

## 7.8 性能调优

### 7.8.1 集群性能调优

**核心服务器调优：**

```properties
# 事务批处理
dbms.cypher.worker.parallelism=8

# 事务超时
dbms.transaction.timeout=60s
dbms.transaction.monitor.check.interval=2s

# 事务日志
dbms.tx_log.rotation.size=512M
dbms.tx_log.preallocate=true

# 页缓存
dbms.memory.pagecache.size=70%  # 或具体值，如 16g

# 堆内存
dbms.memory.heap.initial_size=4g
dbms.memory.heap.max_size=4g

# 直接内存（用于 Bolt 网络）
dbms.memory.off_heap.max_size=2g
```

**只读副本调优：**

```properties
# 只读副本通常需要更大的页缓存
dbms.memory.pagecache.size=80%  # 或具体值，如 32g

# 减少堆内存（不处理写事务）
dbms.memory.heap.initial_size=2g
dbms.memory.heap.max_size=2g

# 复制拉取间隔
causal_clustering.pull_interval=100ms
causal_clustering.pull_batch_size=100
```

### 7.8.2 网络调优

```properties
# 操作系统网络参数（/etc/sysctl.conf）
net.core.somaxconn=1024
net.ipv4.tcp_max_syn_backlog=1024
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_keepalive_intvl=60
net.ipv4.tcp_keepalive_probes=5
net.ipv4.tcp_fin_timeout=30
```

### 7.8.3 磁盘 I/O 调优

```properties
# 数据目录使用 SSD/NVMe
# 事务日志和数据文件分离
dbms.directories.data=/data/neo4j/data
dbms.directories.tx_log=/data/neo4j/tx-log  # 建议使用独立磁盘

# 文件系统挂载选项（/etc/fstab）
# /dev/sdb1 /data/neo4j/data ext4 defaults,noatime,nodiratime,data=writeback 0 0
# /dev/sdc1 /data/neo4j/tx-log ext4 defaults,noatime,nodiratime,data=ordered 0 0
```

---

## 7.9 常见问题与故障排除

### 7.9.1 集群无法形成法定人数

**症状**：核心节点启动后无法形成集群，日志显示 `No leader available`。

**排查步骤**：

```bash
# 1. 检查网络连通性
nc -zv core1.example.com 5000
nc -zv core2.example.com 5000
nc -zv core3.example.com 5000

# 2. 检查防火墙规则
iptables -L -n | grep 5000
iptables -L -n | grep 6000
iptables -L -n | grep 7000

# 3. 检查集群状态
cypher-shell "CALL dbms.cluster.overview()"

# 4. 检查 Raft 日志
cat logs/debug.log | grep -i "raft\|election\|leader"

# 5. 检查发现配置是否一致
grep "initial_discovery_members" /etc/neo4j/neo4j.conf
```

**常见原因**：
- 防火墙阻止了集群端口通信
- `initial_discovery_members` 配置不一致
- 时钟不同步（NTP 未配置）
- 磁盘空间不足

### 7.9.2 复制延迟过高

**症状**：只读副本数据明显落后于核心服务器。

**排查与解决**：

```bash
# 1. 检查复制延迟
cypher-shell "CALL dbms.cluster.overview()"

# 2. 检查只读副本资源使用
top -bn1 | grep java
df -h /data/neo4j

# 3. 检查网络带宽
iperf -c core1.example.com

# 4. 调整复制参数
# 在 neo4j.conf 中减小拉取间隔
causal_clustering.pull_interval=50ms
causal_clustering.pull_batch_size=500
```

### 7.9.3 事务冲突

**症状**：写事务频繁失败，错误信息包含 `Transaction was rolled back` 或 `concurrent modification`。

**解决方案**：

```cypher
// 使用重试逻辑（客户端驱动内置）
// Java 驱动示例
try (Transaction tx = session.beginTransaction()) {
    tx.run("MATCH (a:Account {id: $id}) SET a.balance = a.balance + $amount",
        parameters("id", "123", "amount", 100));
    tx.commit();
} catch (TransientException e) {
    // 驱动会自动重试
}

// 减少事务冲突的策略：
// 1. 缩短事务范围
// 2. 使用乐观锁
MATCH (a:Account {id: $id})
WHERE a.version = $expectedVersion
SET a.balance = a.balance + $amount,
    a.version = a.version + 1
RETURN a.version AS newVersion
```

---

## 7.10 总结

本章详细介绍了 Neo4j 因果集群的架构设计、Raft 共识协议、部署配置、备份恢复策略、监控告警体系以及灾难恢复规划。核心要点总结如下：

1. **因果集群架构**采用核心服务器（写）和只读副本（读）分离的设计，通过 Raft 协议保证强一致性，通过书签机制提供因果一致性。

2. **Raft 共识协议**是集群的基石，通过 Leader 选举、日志复制和安全性保证，在多数节点正常时即可提供服务。3 节点集群可容忍 1 个节点故障，5 节点集群可容忍 2 个节点故障。

3. **部署配置**需要仔细规划网络拓扑、端口分配和内存配置。客户端必须使用 `neo4j://` 路由协议连接集群。

4. **备份策略**应结合在线备份、事务日志备份和 dump/load 方式，遵循 3-2-1 备份原则，并定期验证备份的可恢复性。

5. **监控体系**应覆盖集群健康、性能指标、日志和资源使用，配置合理的告警阈值，确保运维团队能及时发现和处理问题。

6. **灾难恢复规划**需要针对不同故障场景制定应对措施，定期进行恢复演练，验证 RTO 和 RPO 指标是否满足业务要求。

通过合理规划和配置，Neo4j 因果集群能够为企业级图数据库应用提供高可用性、水平扩展能力和数据安全保障。
