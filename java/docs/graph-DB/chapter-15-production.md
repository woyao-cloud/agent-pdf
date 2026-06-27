# 第15章 图数据库生产环境最佳实践

## 15.1 图数据库选型决策树

### 15.1.1 解决的问题

企业在选型图数据库时面临的核心困境：市场上存在多种图数据库（Neo4j、JanusGraph、NebulaGraph、Amazon Neptune、Dgraph、ArangoDB），各自有不同的架构假设、一致性模型和部署模式。选型错误会导致后期架构重构成本极高，甚至项目失败。本节提供一套可量化的决策框架。

### 15.1.2 核心原理

图数据库选型需从六个维度进行加权评估：

| 维度 | 权重 | 说明 |
|------|------|------|
| 数据规模 | 高 | 顶点/边数量级，单机 vs 分布式 |
| 查询模式 | 高 | OLTP 深度遍历 vs OLAP 全图扫描 |
| 一致性需求 | 中 | 强一致 vs 最终一致 |
| 团队能力 | 中 | Java/Go 栈，图数据库运维经验 |
| 预算 | 中 | 商业许可 vs 开源自建 |
| 部署环境 | 低 | 云原生 vs 自建机房 |

### 15.1.3 选型决策矩阵

```
数据规模 < 1亿节点 + 单机可满足 → Neo4j（社区版免费，企业版付费）
  ├─ 需要 ACID 事务 → Neo4j
  └─ 需要多模型（文档+图）→ ArangoDB

数据规模 > 1亿节点 + 需要分布式 →
  ├─ 强一致性 + Java 技术栈 → JanusGraph（后端 HBase/Cassandra）
  ├─ 强一致性 + AWS 生态 → Amazon Neptune
  ├─ 高性能写入 + 最终一致 → NebulaGraph
  └─ 低延迟 OLTP + Go 技术栈 → Dgraph

特殊场景 →
  ├─ 知识图谱 + RDF/SPARQL → Neptune 或 Neo4j
  ├─ 实时推荐 + 毫秒级延迟 → NebulaGraph
  └─ 图分析 + OLAP（PageRank, LPA）→ Neo4j + GraphX 混合
```

### 15.1.4 代码/配置实现

**选型评分表示例（Python 脚本）：**

```python
# selection_scorer.py
def score_database(db_config, requirements):
    scores = {}
    for dim, weight in requirements['weights'].items():
        match = db_config[dim] & requirements[dim]
        scores[dim] = len(match) / len(requirements[dim]) * 100 * weight
    return sum(scores.values())

requirements = {
    'data_size': {'>1亿', '分布式'},
    'consistency': {'强一致'},
    'query_pattern': {'OLTP', '深度遍历'},
    'team_skill': {'Java'},
    'weights': {'data_size': 0.3, 'consistency': 0.2, 'query_pattern': 0.3, 'team_skill': 0.2}
}

databases = {
    'JanusGraph': {'data_size': {'>1亿', '分布式'}, 'consistency': {'强一致'},
                   'query_pattern': {'OLTP', '深度遍历'}, 'team_skill': {'Java'}},
    'NebulaGraph': {'data_size': {'>1亿', '分布式'}, 'consistency': {'最终一致'},
                    'query_pattern': {'OLTP'}, 'team_skill': {'C++'}},
}

for name, config in databases.items():
    print(f"{name}: {score_database(config, requirements):.1f}")
```

### 15.1.5 使用场景

- **社交网络**（Facebook/微博类）：NebulaGraph 或 JanusGraph，高并发写入、水平扩展
- **金融风控**（反欺诈、反洗钱）：Neo4j 企业版，ACID 事务、安全合规
- **知识图谱**（搜索引擎、问答系统）：Neptune（RDF 原生）或 Neo4j
- **实时推荐**（电商、内容平台）：Dgraph，低延迟图遍历
- **IT 运维拓扑**（CMDB、网络监控）：ArangoDB，多模型灵活

### 15.1.6 潜在风险与注意事项

- **Neo4j 社区版**：单机架构，无集群模式，故障时 RTO 不可控
- **JanusGraph**：依赖外部存储（HBase/Cassandra）和索引（Elasticsearch），运维复杂度高
- **NebulaGraph**：社区相对年轻，生态工具（ETL、可视化）不如 Neo4j 成熟
- **Neptune**：厂商锁定，无法自建机房，成本随规模线性增长
- **Dgraph**：Alpha/Zero 架构独特，学习曲线陡峭，大版本升级可能不兼容
- **ArangoDB**：图遍历性能不如原生图数据库，深度 5+ 跳查询退化明显

### 15.1.7 本章小结

选型没有银弹。核心原则：**数据规模决定架构，一致性决定存储，团队决定运维成本**。建议先以最小可行图（MVP）运行 3 个月，验证查询延迟和写入吞吐量后再做最终决定。

---

## 15.2 数据建模最佳实践

### 15.2.1 解决的问题

图数据库建模与关系型数据库范式化设计完全不同。错误的建模（过度使用属性、粒度不当、忽略时间维度）会导致查询性能差、数据膨胀、schema 迁移困难。

### 15.2.2 核心原理

图建模三原则：

1. **实体优先**：每个业务实体对应一个顶点，不要将多个实体塞入一个顶点
2. **关系显式化**：业务动作对应边，不要用属性表示关系
3. **时间维度内置**：边和顶点都应携带时间戳，支持时间旅行查询

### 15.2.3 代码/配置实现

**反模式：用属性表示关系**

```cypher
// ❌ 错误：用户的好友列表存在属性中
CREATE (u:User {name: "Alice", friends: "Bob,Charlie,David"})
// 问题：无法查询共同好友、无法按关系属性过滤

// ✅ 正确：好友关系建模为边
CREATE (a:User {name: "Alice"})
CREATE (b:User {name: "Bob"})
CREATE (a)-[:FRIENDS_WITH {since: 2020}]->(b)
```

**时间感知建模**

```cypher
// 方式一：边携带时间窗口
CREATE (a:User {id: "u1"})-[:EMPLOYED_AT {
  from: date("2020-01-01"),
  to: date("2023-06-30"),
  role: "Senior Engineer"
}]->(c:Company {name: "Acme Corp"})

// 方式二：时间事件链（适用于高频变化）
CREATE (u:User {id: "u1"})
CREATE (e:Event {type: "POSITION_CHANGE", timestamp: datetime(), role: "Staff"})
CREATE (u)-[:HAS_EVENT]->(e)
CREATE (e)-[:AT_COMPANY]->(c:Company {name: "Acme Corp"})
```

**属性 vs 关系决策规则**

| 场景 | 用属性 | 用关系 |
|------|--------|--------|
| 不会单独查询 | 用户年龄 | — |
| 需要过滤/排序 | — | 用户评分 |
| 一对多且有序 | — | 链表关系 |
| 多对多 | — | 中间节点 |
| 元数据（不会变） | 创建时间 | — |

**Schema 演化策略（Neo4j）**

```cypher
// 1. 添加新标签
CREATE CONSTRAINT FOR (n:NewLabel) REQUIRE n.id IS UNIQUE

// 2. 添加新属性（无 schema 约束，直接 SET）
MATCH (n:OldLabel) SET n.newProperty = defaultValue

// 3. 属性迁移（分批执行）
CALL {
  MATCH (n:OldLabel) WHERE n.oldProp IS NOT NULL AND n.newProp IS NULL
  SET n.newProp = n.oldProp
  REMOVE n.oldProp
  RETURN count(*) AS updated
} IN TRANSACTIONS OF 1000 ROWS
RETURN sum(updated) AS total

// 4. 删除废弃标签
MATCH (n:DeprecatedLabel) REMOVE n:DeprecatedLabel
```

### 15.2.4 使用场景

- **社交图谱**：User 顶点 + FOLLOW/LIKE/BLOCK 边，边带时间戳
- **供应链**：Order/Product/Warehouse 顶点 + CONTAINS/SHIPPED_FROM 边
- **权限系统**：User/Role/Permission 顶点 + HAS_ROLE/HAS_PERMISSION 边
- **知识图谱**：Entity 顶点 + RELATION 边，属性存置信度、来源

### 15.2.5 潜在风险与注意事项

- **过度建模**：不要为每个属性创建边，会导致"边爆炸"（super node 问题）
- **超节点**：一个顶点关联百万级边，遍历时性能灾难。解决方案：分片、跳过、限制深度
- **Schema 迁移**：生产环境迁移需灰度执行，先加新属性再删旧属性
- **ID 设计**：尽量使用业务 ID（UUID）而非内部 ID，便于跨系统关联

### 15.2.6 本章小结

好的图建模 = 实体显式 + 关系显式 + 时间内置。**一个建模是否正确的检验标准：能否用一条 Cypher/Gremlin 查询回答一个业务问题。** 如果答案需要多条查询或应用层拼接，说明建模有问题。

---

## 15.3 容量规划与集群部署

### 15.3.1 解决的问题

图数据库集群部署缺乏容量规划会导致：节点过载（OOM/CPU 100%）、磁盘写满、网络瓶颈、扩缩容频繁。本节提供可量化的容量估算方法和部署配置模板。

### 15.3.2 核心原理

**存储估算公式：**

```
总存储 = 顶点数 × 顶点平均大小 + 边数 × 边平均大小 + 索引开销 + 写入缓冲 + 冗余副本

顶点平均大小 ≈ 100-300 bytes（含标签、属性、内部指针）
边平均大小   ≈ 50-150 bytes（含类型、起止点指针、属性）
索引开销     ≈ 原始数据的 20-50%
写入缓冲     ≈ 总存储的 10-20%（WAL、LSM-Tree 合并空间）
冗余副本      = 总存储 × (副本数 - 1)
```

**示例：1亿顶点 + 5亿边，3副本**

```
顶点: 100M × 200B = 20GB
边:   500M × 100B = 50GB
索引: 70GB × 0.3  = 21GB
缓冲: 91GB × 0.15 = 13.6GB
小计: 104.6GB
3副本: 104.6GB × 3 = 313.8GB
预留 20% 余量: 376GB
```

### 15.3.3 代码/配置实现

**Neo4j 集群部署配置（docker-compose）**

```yaml
# docker-compose-neo4j-cluster.yml
version: '3.8'
services:
  neo4j-core-1:
    image: neo4j:enterprise-5
    environment:
      NEO4J_AUTH: neo4j/strongPassword
      NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
      NEO4J_dbms_mode: CORE
      NEO4J_causalClustering_expectedCoreClusterSize: "3"
      NEO4J_causalClustering_initialDiscoveryMembers: "neo4j-core-1:5000,neo4j-core-2:5000,neo4j-core-3:5000"
      NEO4J_dbms_memory_heap_max__size: "8G"
      NEO4J_dbms_memory_pagecache_size: "4G"
      NEO4J_dbms_memory_heap_initial__size: "8G"
    volumes:
      - neo4j-core-1-data:/data
      - neo4j-core-1-logs:/logs
    ports:
      - "7687:7687"
      - "7474:7474"
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 16G

  neo4j-core-2:
    <<: *neo4j-core
    hostname: neo4j-core-2

  neo4j-core-3:
    <<: *neo4j-core
    hostname: neo4j-core-3

  neo4j-read-replica-1:
    image: neo4j:enterprise-5
    environment:
      NEO4J_AUTH: neo4j/strongPassword
      NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
      NEO4J_dbms_mode: READ_REPLICA
      NEO4J_causalClustering_initialDiscoveryMembers: "neo4j-core-1:5000,neo4j-core-2:5000,neo4j-core-3:5000"
    volumes:
      - neo4j-replica-1-data:/data
    ports:
      - "7688:7687"
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 16G

volumes:
  neo4j-core-1-data:
  neo4j-core-2-data:
  neo4j-core-3-data:
  neo4j-replica-1-data:
```

**NebulaGraph 集群部署（Linux 生产环境）**

```bash
# /etc/nebula/nebula-graphd.conf
--meta_server_addrs=192.168.1.10:9559,192.168.1.11:9559,192.168.1.12:9559
--port=9669
--num_io_threads=16
--num_worker_threads=32
--system_memory_high_watermark=0.8
--session_reclaim_interval_secs=10
--max_allowed_query_concurrency=100

# /etc/nebula/nebula-storaged.conf
--meta_server_addrs=192.168.1.10:9559,192.168.1.11:9559,192.168.1.12:9559
--port=9779
--num_io_threads=16
--raft_heartbeat_interval_secs=5
--rocksdb_block_cache=4294967296  # 4GB
```

**节点规格推荐**

| 数据规模 | 顶点数 | 推荐规格 | 集群拓扑 |
|----------|--------|----------|----------|
| 小型 | < 1000万 | 4C/16G/200G SSD | 单机或 3 节点 |
| 中型 | 1000万-1亿 | 8C/32G/500G SSD | 3 Core + N Read Replica |
| 大型 | 1亿-10亿 | 16C/64G/2T NVMe | 5-7 Core + 3+ Read Replica |
| 超大型 | > 10亿 | 32C/128G/4T+ NVMe | 7+ Core + 分片 |

### 15.3.4 使用场景

- **业务增长预测**：按年增长率 2-3x 预留容量
- **读写分离**：Core 节点处理写入，Read Replica 处理查询
- **跨 AZ 部署**：Core 节点分布在 3 个可用区，容忍 1 个 AZ 故障

### 15.3.5 潜在风险与注意事项

- **JVM 堆内存**：Neo4j 堆内存不要超过 32G（超过后 JVM 压缩指针失效）
- **PageCache**：设置为可用内存的 50-70%，不要超过总内存减去堆内存
- **磁盘 IOPS**：图数据库是 IO 密集型，NVMe SSD 是必须的，HDD 不可用于生产
- **网络延迟**：Core 节点间延迟 < 1ms（同机房），跨 AZ 延迟 < 5ms
- **不要超卖**：K8s 环境下为图数据库节点设置 CPU/memory limits 和 requests 相等

### 15.3.6 本章小结

容量规划 = 数据量 × (1 + 索引率) × (1 + 缓冲率) × 副本数 × 余量系数。**部署时宁可多配 30% 资源，也不要频繁扩缩容。** 图数据库的扩缩容成本远高于关系型数据库。

---

## 15.4 监控与告警

### 15.4.1 解决的问题

图数据库在生产环境中运行是一个"黑盒"：查询变慢不知道原因、内存泄漏无法提前发现、磁盘写满导致集群只读。缺乏监控体系意味着故障发现滞后，MTTR 不可控。

### 15.4.2 核心原理

监控四层模型：

1. **基础设施层**：CPU、内存、磁盘、网络
2. **数据库引擎层**：查询延迟、吞吐量、缓存命中率
3. **集群层**：复制延迟、Leader 切换、节点状态
4. **业务层**：P99 查询延迟、错误率、慢查询数

### 15.4.3 代码/配置实现

**Prometheus 指标暴露（Neo4j）**

```yaml
# neo4j.conf 启用 Prometheus 端点
dbms.metrics.prometheus.enabled=true
dbms.metrics.prometheus.endpoint=0.0.0.0:2004
```

**关键指标采集规则（prometheus.yml）**

```yaml
scrape_configs:
  - job_name: 'neo4j'
    scrape_interval: 15s
    scrape_timeout: 10s
    static_configs:
      - targets:
        - 'neo4j-core-1:2004'
        - 'neo4j-core-2:2004'
        - 'neo4j-core-3:2004'
    metrics_path: '/metrics'
```

**Grafana 告警规则（JSON 模型）**

```json
{
  "alert": {
    "conditions": [
      {
        "evaluator": {"params": [1000], "type": "gt"},
        "query": {"params": ["A", "5m", "avg"]},
        "reducer": {"params": [], "type": "avg"},
        "type": "query"
      }
    ],
    "frequency": "60s",
    "handler": 1,
    "name": "P99 Query Latency > 1s",
    "noDataState": "ok",
    "notifications": [{"uid": "pagerduty"}]
  },
  "title": "High Query Latency"
}
```

**关键指标与告警阈值**

| 指标 | PromQL | 告警阈值 | 严重级别 |
|------|--------|----------|----------|
| 查询 P99 延迟 | `histogram_quantile(0.99, rate(neo4j_query_duration_ms_bucket[5m]))` | > 1000ms | Critical |
| 缓存命中率 | `neo4j_page_cache_hits / (neo4j_page_cache_hits + neo4j_page_cache_faults)` | < 90% | Warning |
| 连接数 | `neo4j_bolt_connections` | > 80% max | Warning |
| 磁盘使用率 | `(node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100` | < 10% | Critical |
| 堆内存使用 | `neo4j_memory_pool_usage_bytes / neo4j_memory_pool_max_bytes` | > 85% | Warning |
| 复制延迟 | `neo4j_cluster_replication_lag_ms` | > 5000ms | Critical |
| 慢查询数 | `rate(neo4j_query_slow_count[5m])` | > 10/min | Warning |

**自定义监控脚本（查询延迟分布）**

```python
# monitor_query_latency.py
from neo4j import GraphDatabase
import time

def check_latency(uri, user, password):
    driver = GraphDatabase.driver(uri, auth=(user, password))
    queries = [
        "MATCH (n:User)-[:FRIENDS_WITH]->(f) RETURN n.id, count(f) AS friends LIMIT 100",
        "MATCH path = (a:User)-[:FRIENDS_WITH*1..3]-(b:User) WHERE a.id = $id RETURN length(path) LIMIT 50",
    ]
    for q in queries:
        start = time.time()
        with driver.session() as session:
            session.run(q, id="user_001").data()
        elapsed = (time.time() - start) * 1000
        print(f"LATENCY_CHECK|query={q[:50]}|duration_ms={elapsed:.1f}")
    driver.close()

if __name__ == "__main__":
    check_latency("bolt://localhost:7687", "neo4j", "password")
```

### 15.4.4 使用场景

- **容量预警**：磁盘使用率趋势预测，提前 7 天告警
- **性能退化**：P99 延迟环比增长 > 20% 触发审查
- **故障自愈**：Core 节点宕机自动触发 Read Replica 提升

### 15.4.5 潜在风险与注意事项

- **告警风暴**：设置告警聚合，同一故障源 30 分钟内只发一次通知
- **指标基数**：避免按用户 ID 或订单 ID 打标签，会导致 Prometheus 内存爆炸
- **监控本身的高可用**：Prometheus 应独立部署，不要和图数据库混部
- **慢查询日志**：开启慢查询日志但设置合理的阈值（默认 1s），避免日志打满磁盘

### 15.4.6 本章小结

监控不是事后诸葛亮，而是事前预防。**核心指标不超过 15 个，告警规则不超过 10 条。** 过多的指标和告警只会导致"告警疲劳"——真正出问题时反而没人看。

---

## 15.5 备份、恢复与灾难恢复

### 15.5.1 解决的问题

图数据库的数据关联性强，数据损坏或丢失的影响面远大于关系型数据库。缺乏完善的备份恢复策略会导致：误操作无法回滚、硬件故障数据丢失、跨区域容灾能力缺失。

### 15.5.2 核心原理

备份策略三要素：

- **RPO（Recovery Point Objective）**：可接受的数据丢失时间窗口，通常 < 1 小时
- **RTO（Recovery Time Objective）**：可接受的恢复时间，通常 < 4 小时
- **备份类型**：全量备份（每周）+ 增量备份（每小时）+ WAL 归档（实时）

### 15.5.3 代码/配置实现

**Neo4j 全量备份**

```bash
#!/bin/bash
# backup-neo4j-full.sh

BACKUP_DIR="/backup/neo4j/$(date +%Y%m%d_%H%M%S)"
NEO4J_HOME="/var/lib/neo4j"
RETENTION_DAYS=30

# 全量备份（在线，不影响读写）
neo4j-admin database dump neo4j --to-path="$BACKUP_DIR" --compress

# 验证备份完整性
neo4j-admin database check --from-path="$BACKUP_DIR/neo4j"

# 上传到 S3（跨区域容灾）
aws s3 sync "$BACKUP_DIR" "s3://my-backup-bucket/neo4j/$(date +%Y%m%d)/" --storage-class STANDARD_IA

# 清理过期备份
find /backup/neo4j/ -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "BACKUP_COMPLETE|path=$BACKUP_DIR|size=$(du -sh $BACKUP_DIR | cut -f1)"
```

**Neo4j 增量备份**

```bash
#!/bin/bash
# backup-neo4j-incremental.sh

BASE_BACKUP=$(ls -td /backup/neo4j/*/ | head -1)
INCREMENTAL_DIR="/backup/neo4j/incr/$(date +%Y%m%d_%H%M%S)"

neo4j-admin database incremental-backup \
  --from-path="$BASE_BACKUP" \
  --to-path="$INCREMENTAL_DIR" \
  --database=neo4j

# 保留最近 24 小时增量
find /backup/neo4j/incr/ -type d -mtime +1 -exec rm -rf {} \;
```

**恢复演练脚本**

```bash
#!/bin/bash
# restore-drill.sh
# 每月执行一次，验证备份可恢复

BACKUP_PATH=$1
RESTORE_TEST_DIR="/tmp/neo4j_restore_test"

# 清理上次测试
rm -rf "$RESTORE_TEST_DIR"

# 从备份恢复
neo4j-admin database load neo4j --from-path="$BACKUP_PATH" --to-path="$RESTORE_TEST_DIR"

# 启动测试实例
docker run -d --name neo4j-restore-test \
  -v "$RESTORE_TEST_DIR:/data" \
  -e NEO4J_AUTH=neo4j/testPassword \
  -p 7688:7687 \
  neo4j:enterprise-5

# 等待就绪
sleep 30

# 验证数据完整性
docker exec neo4j-restore-test cypher-shell \
  -u neo4j -p testPassword \
  "MATCH (n) RETURN count(n) AS vertex_count"

docker exec neo4j-restore-test cypher-shell \
  -u neo4j -p testPassword \
  "MATCH ()-[r]->() RETURN count(r) AS edge_count"

# 清理
docker stop neo4j-restore-test
docker rm neo4j-restore-test
rm -rf "$RESTORE_TEST_DIR"

echo "RESTORE_DRILL_COMPLETE|backup=$BACKUP_PATH|status=verified"
```

**跨区域复制（Neptune Global Database）**

```bash
# AWS CLI 创建 Neptune 全局数据库
aws neptune create-global-cluster \
  --global-cluster-identifier my-graph-global \
  --engine neptune \
  --deletion-protection

# 主区域写入集群
aws neptune create-db-cluster \
  --db-cluster-identifier my-graph-primary \
  --engine neptune \
  --global-cluster-identifier my-graph-global \
  --master-username admin \
  --master-user-password strongPassword \
  --region us-east-1

# 从区域只读集群
aws neptune create-db-cluster \
  --db-cluster-identifier my-graph-secondary \
  --engine neptune \
  --global-cluster-identifier my-graph-global \
  --region ap-northeast-1
```

### 15.5.4 使用场景

- **日常备份**：凌晨 2:00 全量 + 每小时增量
- **版本升级前**：手动全量备份，升级失败可回滚
- **跨区域容灾**：主区域故障，30 分钟内切换到从区域
- **数据迁移**：备份恢复到测试环境，验证后再迁移

### 15.5.5 潜在风险与注意事项

- **备份窗口**：全量备份期间 IO 压力大，建议在低峰期执行
- **备份验证**：**没有验证的备份等于没有备份**——每月至少一次恢复演练
- **WAL 归档**：确保 WAL 归档目录和数据库不在同一磁盘
- **加密备份**：备份文件包含敏感数据，必须加密存储
- **RPO/RTO 测试**：每季度实测一次，确保满足 SLA

### 15.5.6 本章小结

备份策略 = 全量（周）+ 增量（小时）+ WAL（实时）+ 跨区域（异步复制）。**恢复演练比备份本身更重要**——一个从未验证过的备份，在真正需要时大概率不可用。

---

## 15.6 安全与访问控制

### 15.6.1 解决的问题

图数据库存储的是关联数据，一个漏洞可能暴露整个关系网络。常见安全问题：未授权访问、SQL/Cypher 注入、传输层明文、审计缺失、权限过度开放。

### 15.6.2 核心原理

纵深防御四层模型：

1. **网络层**：VPC 隔离、安全组、TLS
2. **认证层**：LDAP/Kerberos 集成、多因素认证
3. **授权层**：RBAC + 属性级权限
4. **审计层**：操作日志、异常检测

### 15.6.3 代码/配置实现

**Neo4j 安全配置**

```properties
# $NEO4J_HOME/conf/neo4j.conf

# TLS 配置
dbms.ssl.policy.bolt.enabled=true
dbms.ssl.policy.bolt.private_key=/etc/neo4j/certs/neo4j.key
dbms.ssl.policy.bolt.public_certificate=/etc/neo4j/certs/neo4j.crt
dbms.ssl.policy.bolt.client_auth=REQUIRE
dbms.ssl.policy.bolt.trust_all_certificates=false

# 认证配置
dbms.security.auth_enabled=true
dbms.security.ldap.authentication_enabled=true
dbms.security.ldap.authorization_enabled=true
dbms.security.ldap.host=ldap.company.com
dbms.security.ldap.port=636
dbms.security.ldap.use_ssl=true
dbms.security.ldap.user_dn_template=uid={0},ou=users,dc=company,dc=com
dbms.security.ldap.group_base_dn=ou=groups,dc=company,dc=com
dbms.security.ldap.group_search_filter=(member={0})

# 审计日志
dbms.security.audit_log.enabled=true
dbms.security.audit_log.destination_path=/var/log/neo4j/audit.log
dbms.security.audit_log.rotation_size=100M
dbms.security.audit_log.rotation_keep_number=10
```

**RBAC 权限配置**

```cypher
// 创建角色
CREATE ROLE graph_reader AS COPY OF reader;
CREATE ROLE graph_writer AS COPY OF editor;
CREATE ROLE graph_admin AS COPY OF admin;

// 细粒度权限（Neo4j 5.x）
GRANT TRAVERSE ON GRAPH * TO graph_reader;
GRANT READ {name, email} ON GRAPH * NODES User TO graph_reader;
GRANT MATCH {*} ON GRAPH * TO graph_writer;
GRANT WRITE ON GRAPH * TO graph_writer;
DENY READ {salary, ssn} ON GRAPH * NODES Employee TO graph_reader;

// 用户绑定
CREATE USER alice SET PASSWORD $password CHANGE NOT REQUIRED;
CREATE USER bob SET PASSWORD $password CHANGE NOT REQUIRED;
GRANT ROLE graph_reader TO alice;
GRANT ROLE graph_writer TO bob;

// 查看权限
SHOW USER alice;
SHOW ROLE graph_reader;
```

**网络层安全（AWS VPC + Security Group）**

```hcl
# terraform/security-groups.tf
resource "aws_security_group" "neo4j_sg" {
  name        = "neo4j-cluster-sg"
  description = "Neo4j cluster security group"
  vpc_id      = aws_vpc.main.id

  # Bolt 协议（应用层）
  ingress {
    from_port       = 7687
    to_port         = 7687
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
    description     = "Bolt protocol from application tier"
  }

  # 集群内部通信
  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    self            = true
    description     = "Cluster discovery"
  }

  ingress {
    from_port       = 6000
    to_port         = 7000
    protocol        = "tcp"
    self            = true
    description     = "Cluster replication"
  }

  # HTTP API（仅运维跳板机）
  ingress {
    from_port       = 7474
    to_port         = 7474
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion_sg.id]
    description     = "HTTP API from bastion"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

**加密存储（TDE - Transparent Data Encryption）**

```properties
# Neo4j 企业版 TDE
dbms.data.encryption.enabled=true
dbms.data.encryption.key_file=/etc/neo4j/encryption/key
dbms.data.encryption.algorithm=AES-256-GCM
```

### 15.6.4 使用场景

- **金融行业**：TDE + 审计日志 + RBAC，满足 PCI-DSS 合规
- **多租户 SaaS**：属性级权限控制，租户间数据隔离
- **跨部门数据共享**：不同角色看到不同的属性（如 HR 看薪资，其他部门看不到）

### 15.6.5 潜在风险与注意事项

- **TLS 证书管理**：证书过期会导致所有客户端连接中断，提前 30 天告警
- **LDAP 高可用**：LDAP 宕机导致认证失败，配置多个 LDAP Server
- **审计日志磁盘**：审计日志增长快，设置轮转和独立磁盘
- **最小权限原则**：应用账号只给 TRAVERSE + READ 权限，不要用 admin 账号连接

### 15.6.6 本章小结

安全不是功能，是架构的一部分。**图数据库的安全核心是"最小可见"——用户只能看到他们需要看到的顶点和边。** 从网络隔离到属性级权限，每一层都在缩小攻击面。

---

## 15.7 常见问题排查指南

### 15.7.1 解决的问题

图数据库生产环境中的故障类型多样，排查路径不直观。本节提供系统化的故障排查流程和 checklist，帮助工程师快速定位和解决问题。

### 15.7.2 核心原理

故障排查四步法：

1. **现象确认**：什么在变慢/报错？影响范围？持续时间？
2. **指标采集**：CPU/内存/磁盘/网络/查询延迟/缓存命中率
3. **根因分析**：索引缺失？数据倾斜？资源竞争？配置不当？
4. **修复验证**：实施修复后确认指标恢复正常

### 15.7.3 代码/配置实现

**慢查询排查**

```cypher
// 1. 查看当前正在执行的查询
CALL dbms.listQueries() YIELD queryId, username, query, elapsedTimeMillis
WHERE elapsedTimeMillis > 1000
RETURN queryId, username, query, elapsedTimeMillis
ORDER BY elapsedTimeMillis DESC;

// 2. 终止长时间运行的查询
CALL dbms.killQuery('query-id-xxx');

// 3. 使用 PROFILE 分析查询
PROFILE
MATCH (u:User {id: "user_001"})-[:FRIENDS_WITH*1..3]->(f:User)
RETURN f.id, count(*) AS pathCount;

// 4. 查看查询计划中的关键指标
//    - db hits: 数据库页访问次数，越大越慢
//    - estimated rows: 预估行数，偏差大说明统计信息过时
//    - 是否有 NodeByLabelScan（全标签扫描，需要加索引）

// 5. 创建缺失的索引
CREATE INDEX user_id_index FOR (n:User) ON (n.id);
CREATE INDEX friend_since_index FOR ()-[r:FRIENDS_WITH]-() ON (r.since);
CREATE TEXT INDEX user_name_index FOR (n:User) ON (n.name);
```

**连接池问题排查**

```java
// Java 应用连接池配置（HikariCP + Neo4j）
// application.yml
spring:
  neo4j:
    uri: bolt://neo4j-cluster:7687
    authentication:
      username: app_user
      password: ${NEO4J_PASSWORD}
    pool:
      max-connection-pool-size: 50        // 根据并发调整
      connection-acquisition-timeout: 30s // 获取连接超时
      idle-timeout: 60s                   // 空闲连接回收
      max-connection-lifetime: 30m        // 连接最大存活时间
      connection-timeout: 10s             // TCP 连接超时

// 连接池耗尽排查
// 1. 检查应用是否有连接泄漏
// 2. 检查数据库 max_connections 是否够用
// 3. 检查是否有慢查询占用连接不释放
// 4. 临时方案：重启应用释放连接
// 5. 长期方案：添加连接池监控（HikariCP metrics）
```

**OOM 与 GC 压力排查**

```bash
#!/bin/bash
# diagnose-oom.sh

# 1. 检查堆内存使用
curl -s http://localhost:2004/metrics | grep neo4j_memory_pool

# 2. 获取 GC 日志
jstat -gcutil $(pgrep -f neo4j) 5000 10

# 3. 分析堆转储（需要先触发）
jmap -dump:live,format=b,file=/tmp/heap.hprof $(pgrep -f neo4j)

# 4. 检查 PageCache 命中率
# 如果命中率 < 90%，说明内存不足，需要增加 pagecache 或减少数据量

# 5. 常见 OOM 原因
#    - 查询返回结果集过大（未加 LIMIT）
#    - 深度遍历未限制跳数（* 未加上限）
#    - 单顶点关联边过多（super node）
#    - PageCache 和 Heap 争抢内存
```

**数据不一致排查**

```cypher
// 1. 检查集群状态
CALL dbms.cluster.overview();

// 2. 检查复制延迟
CALL dbms.cluster.replicationInfo();

// 3. 检查各节点数据量是否一致
MATCH (n) RETURN count(*) AS vertexCount;
// 在 Core 和 Read Replica 上分别执行，对比结果

// 4. 修复不一致（Neo4j 5.x）
CALL dbms.cluster.resync();
```

**复制延迟排查**

```bash
#!/bin/bash
# check-replication-lag.sh

NODES=("neo4j-core-1:2004" "neo4j-core-2:2004" "neo4j-core-3:2004")

for node in "${NODES[@]}"; do
    echo "=== $node ==="
    # 获取最新事务 ID
    curl -s "http://$node/metrics" | grep "neo4j_cluster_last_applied_tx"
    # 获取复制延迟
    curl -s "http://$node/metrics" | grep "neo4j_cluster_replication_lag"
done

# 延迟 > 5s 的常见原因：
# - 从节点磁盘 IO 瓶颈
# - 网络带宽不足
# - 从节点 CPU 不足
# - 大事务（批量写入 10 万+ 条）
```

**故障排查 Checklist**

```
□ 确认故障现象和影响范围
□ 检查 Grafana 仪表盘：CPU/内存/磁盘/网络
□ 检查数据库慢查询列表
□ 检查应用日志：连接超时/认证失败/查询异常
□ 检查集群状态：所有节点是否在线
□ 检查缓存命中率：< 90% 说明内存不足
□ 检查磁盘使用率：> 85% 需要扩容
□ 检查连接数：是否达到上限
□ 检查是否有大事务阻塞
□ 检查是否有未优化的全表扫描查询
□ 检查 GC 日志：Full GC 频率
□ 检查网络延迟：节点间 ping 延迟
```

### 15.7.4 使用场景

- **生产事故应急**：按照 checklist 逐项排查，避免遗漏
- **性能优化**：PROFILE 分析 + 索引优化 + 查询重写
- **容量规划**：根据监控趋势预测资源瓶颈

### 15.7.5 潜在风险与注意事项

- **PROFILE 在线上执行**：PROFILE 会实际执行查询，大查询可能影响线上性能，建议用 EXPLAIN 先看计划
- **kill 查询**：kill 长时间运行的查询可能导致事务回滚，确保应用层有重试机制
- **堆转储**：jmap dump 会触发 Full GC，生产环境谨慎使用
- **不要重启解决一切**：重启掩盖问题，不解决根因

### 15.7.6 本章小结

故障排查的核心不是记住所有命令，而是建立系统化的排查流程。**先看指标，再看日志，最后动代码。** 80% 的图数据库生产问题可以归结为三类：索引缺失、内存不足、连接泄漏。

---

## 附录 A：生产环境配置速查表

### Neo4j 生产配置模板

```properties
# neo4j.conf - 生产环境推荐配置

# 内存配置
dbms.memory.heap.initial_size=8G
dbms.memory.heap.max_size=8G
dbms.memory.pagecache.size=4G

# 事务配置
dbms.tx_log.rotation.retention_policy=1h
dbms.tx_log.rotation.size=1G

# 连接配置
dbms.connector.bolt.enabled=true
dbms.connector.bolt.listen_address=0.0.0.0:7687
dbms.connector.bolt.thread_pool_min_size=10
dbms.connector.bolt.thread_pool_max_size=100

# 查询配置
dbms.query_log.enabled=true
dbms.query_log.threshold=1000ms
dbms.query_log.query_parameter_logging_enabled=false

# 备份配置
dbms.backup.enabled=true
dbms.backup.listen_address=0.0.0.0:6362
```

### NebulaGraph 生产配置模板

```bash
# graphd 配置
--session_idle_timeout_secs=600
--max_allowed_query_concurrency=100
--max_allowed_query_size=1048576

# storaged 配置
--raft_heartbeat_interval_secs=5
--raft_election_timeout_secs=100
--rocksdb_block_cache=4294967296
--enable_auto_compaction=true
```

### 常用诊断命令

```bash
# Neo4j
neo4j-admin check --database=neo4j
neo4j-admin report --to=/tmp/report.zip
curl -s http://localhost:7474/db/neo4j/tx/commit -d '{"statements":[{"statement":"CALL dbms.listQueries()"}]}'

# NebulaGraph
curl -s "http://localhost:9669/status"
nebula-console -addr localhost -port 9669 -u root -p password
SHOW HOSTS;
SHOW SPACES;
```

---

> **本章作者注**：图数据库的生产运维仍在快速发展中。建议读者关注各数据库官方的运维博客和 GitHub Issues，获取最新的最佳实践。生产环境的稳定性来自于持续的监控、定期的演练和严谨的变更管理。
