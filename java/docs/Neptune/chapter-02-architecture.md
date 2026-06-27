# 第2章 Neptune 架构与实现原理

## 2.1 整体架构

### 解决的问题

理解 Neptune 的内部架构对于正确使用、性能优化和问题排查至关重要。本章深入 Neptune 的存储计算分离架构、查询引擎、事务机制和集群管理，帮助开发者在架构层面做出正确决策。

### 核心原理

Neptune 采用**存储与计算分离**架构，这是其高性能和高可用的基础：

```
┌─────────────────────────────────────────────────────┐
│                  查询引擎层                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Gremlin  │  │  SPARQL  │  │openCypher│          │
│  │  引擎    │  │   引擎   │  │   引擎   │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       └──────────────┼──────────────┘                │
│                      ▼                               │
│              ┌──────────────┐                        │
│              │  查询优化器  │                        │
│              └──────┬───────┘                        │
│                     ▼                                │
│              ┌──────────────┐                        │
│              │  事务管理器  │                        │
│              └──────┬───────┘                        │
├─────────────────────┼───────────────────────────────┤
│                     ▼                                │
│              ┌──────────────┐                        │
│              │  存储引擎    │                        │
│              │  (缓冲区缓存)│                        │
│              └──────┬───────┘                        │
├─────────────────────┼───────────────────────────────┤
│                     ▼                                │
│              ┌──────────────┐                        │
│              │  分布式存储  │                        │
│              │  6副本/3AZ  │                        │
│              └──────────────┘                        │
└─────────────────────────────────────────────────────┘
```

**关键设计决策：**
- 存储与计算分离：计算节点无状态，存储节点自动复制
- 共享存储卷：所有实例（主+只读）共享同一存储
- 6 副本跨 3 个可用区：保证数据持久性和可用性

### 代码/配置实现

**通过 CloudFormation 部署 Neptune：**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  NeptuneCluster:
    Type: AWS::Neptune::DBCluster
    Properties:
      DBClusterIdentifier: my-neptune-cluster
      Engine: neptune
      StorageEncrypted: true
      KmsKeyId: alias/neptune-key
      BackupRetentionPeriod: 7
      PreferredBackupWindow: '03:00-04:00'
      VpcSecurityGroupIds:
        - !Ref NeptuneSecurityGroup
      DBSubnetGroupName: !Ref NeptuneSubnetGroup

  NeptuneInstance:
    Type: AWS::Neptune::DBInstance
    Properties:
      DBInstanceIdentifier: my-neptune-instance
      DBInstanceClass: db.r6g.large
      Engine: neptune
      DBClusterIdentifier: !Ref NeptuneCluster
      AutoMinorVersionUpgrade: true
```

### 使用场景

- 生产环境部署：通过 IaC 管理 Neptune 集群
- 多环境管理：开发/测试/生产使用不同规格
- 自动化运维：与 CI/CD 流水线集成

### 潜在风险与注意事项

- 存储计算分离架构下，只读副本的查询延迟取决于主实例的写入负载
- 共享存储意味着所有实例共享 IOPS 配额

### 本章小结

- Neptune 采用存储计算分离架构
- 共享存储卷支持 6 副本跨 3 AZ
- 查询引擎支持 Gremlin/SPARQL/openCypher

---

## 2.2 存储引擎原理

### 解决的问题

图数据库的存储引擎需要高效支持随机访问（指针追逐）和顺序扫描两种访问模式。Neptune 的存储引擎针对图数据的特点进行了专门优化。

### 核心原理

Neptune 存储引擎的关键特性：

1. **SSD 持久化存储**：所有数据存储在 SSD 上，优化随机 I/O 性能
2. **分布式存储集群**：数据自动分片到多个存储节点
3. **自动故障转移**：存储节点故障时自动切换到副本
4. **写前日志（WAL）**：所有写入先记录 WAL，保证崩溃恢复
5. **多版本并发控制（MVCC）**：读操作不阻塞写操作

**写入路径：**
```
应用 → Gremlin/SPARQL → 事务管理器 → WAL → 存储节点 → SSD
```

**读取路径：**
```
应用 → Gremlin/SPARQL → 缓冲区缓存（命中）→ 返回
应用 → Gremlin/SPARQL → 缓冲区缓存（未命中）→ 存储节点 → SSD → 缓存 → 返回
```

### 代码/配置实现

**监控存储性能的 CloudWatch 指标：**

```bash
# 查看存储空间使用
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name VolumeBytesUsed \
    --dimensions Name=DBClusterIdentifier,Value=my-neptune \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-02T00:00:00Z \
    --period 3600 \
    --statistics Average

# 查看 IOPS 使用
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name ReadIOPS \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-02T00:00:00Z \
    --period 300 \
    --statistics Average
```

### 使用场景

- 理解存储引擎有助于选择正确的实例规格
- 监控 IOPS 和存储空间用于容量规划
- 故障排查时分析存储层面的问题

### 潜在风险与注意事项

- 存储自动扩展但不会自动收缩，删除数据不会减少存储费用
- 高 IOPS 消耗会导致额外费用
- 存储延迟受共享存储集群负载影响

### 本章小结

- SSD 存储 + 分布式集群保证高性能和持久性
- WAL + MVCC 保证事务一致性和并发读取
- 缓冲区缓存减少存储 I/O

---

## 2.3 查询处理引擎

### 解决的问题

Neptune 需要同时支持三种查询语言（Gremlin、SPARQL、openCypher），每种语言有不同的语法和语义。查询引擎需要将不同语言的查询统一优化和执行。

### 核心原理

Neptune 的查询处理分为三个阶段：

1. **解析（Parsing）**：将查询文本解析为抽象语法树（AST）
2. **优化（Optimization）**：基于统计信息和规则优化执行计划
3. **执行（Execution）**：按照优化后的计划执行，返回结果

**Gremlin 引擎特点：**
- 基于遍历（Traversal）的查询模型
- 惰性求值（Lazy Evaluation）
- 步骤链（Step Chain）执行

**SPARQL 引擎特点：**
- 基于模式匹配（Pattern Matching）的查询模型
- 支持 RDFS/OWL 推理
- 支持联邦查询

**openCypher 引擎特点：**
- 基于模式匹配（Pattern Matching）
- 类似 SQL 的语法
- 支持路径查询

### 代码/配置实现

**查看查询执行计划：**

```groovy
// Gremlin 查询分析
g.V().has('person', 'name', 'Alice').
  out('knows').
  values('name').
  explain()

// 使用查询超时
g.with('evaluationTimeout', 5000).
  V().has('person', 'name', 'Alice').
  repeat(out('knows')).times(5).
  values('name')
```

### 使用场景

- 复杂查询需要分析执行计划
- 慢查询优化
- 查询语言迁移

### 潜在风险与注意事项

- 不同查询语言的性能特征不同，Gremlin 通常比 SPARQL 快
- openCypher 在 Neptune 上的功能集不如 Neo4j 完整

### 本章小结

- 查询引擎分解析、优化、执行三个阶段
- Gremlin 适合遍历型查询，SPARQL 适合 RDF 推理
- 使用 explain/profile 分析查询性能

---

## 2.4 事务处理机制

### 解决的问题

图数据库的事务需要保证在并发读写场景下的数据一致性，同时不牺牲查询性能。

### 核心原理

Neptune 的事务机制：

1. **ACID 事务**：支持原子性、一致性、隔离性、持久性
2. **乐观并发控制（OCC）**：写入时检测冲突，冲突则回滚
3. **快照隔离（Snapshot Isolation）**：读操作看到事务开始时的快照
4. **自动重试**：可序列化隔离级别下的冲突自动重试

### 代码/配置实现

**Java 事务示例：**

```java
import org.apache.tinkerpop.gremlin.driver.Client;
import org.apache.tinkerpop.gremlin.driver.Cluster;

public class NeptuneTransaction {
    public static void main(String[] args) {
        Cluster cluster = Cluster.build("your-neptune-endpoint")
            .port(8182)
            .enableSsl(true)
            .create();
        
        Client client = cluster.connect();
        
        try {
            // 自动事务（每条语句一个事务）
            client.submit("g.addV('person').property('name', 'Alice')");
            
            // 手动事务（多条语句同一事务）
            // Neptune 的 Gremlin 会话支持事务
            client.submit("g.V().has('person','name','Alice')" +
                         ".addE('knows').to(g.V().has('person','name','Bob'))");
        } finally {
            client.close();
            cluster.close();
        }
    }
}
```

### 使用场景

- 金融交易：需要 ACID 保证
- 数据导入：批量写入需要事务一致性
- 并发读写：多个客户端同时操作

### 潜在风险与注意事项

- 长事务会增加冲突概率
- 大事务（大量写入）可能导致内存压力
- 可序列化隔离级别下冲突率更高

### 本章小结

- Neptune 支持 ACID 事务
- 乐观并发控制 + 快照隔离
- 避免长事务和大事务

---

## 2.5 集群架构

### 解决的问题

生产环境需要高可用和读扩展能力。Neptune 的集群架构通过主实例 + 只读副本实现。

### 核心原理

**集群组件：**
- **主实例（Writer）**：处理写入和强一致性读取
- **只读副本（Reader）**：处理读取，最多 15 个
- **集群端点（Cluster Endpoint）**：指向主实例
- **读取端点（Reader Endpoint）**：负载均衡到只读副本

**故障转移流程：**
1. CloudWatch 检测主实例故障
2. 自动提升一个只读副本为主实例
3. DNS 更新指向新主实例
4. 应用层自动重连（使用重试逻辑）

### 代码/配置实现

**Python 连接集群端点：**

```python
import time
from gremlin_python.driver import client, serializer

class NeptuneCluster:
    def __init__(self, cluster_endpoint, reader_endpoint):
        self.cluster_endpoint = cluster_endpoint
        self.reader_endpoint = reader_endpoint
    
    def get_writer_client(self):
        return client.Client(
            f'wss://{self.cluster_endpoint}:8182/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
    
    def get_reader_client(self):
        return client.Client(
            f'wss://{self.reader_endpoint}:8182/gremlin',
            'g',
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
    
    def execute_write(self, query):
        """写入操作使用集群端点"""
        client = self.get_writer_client()
        try:
            return client.submit(query).all().result()
        finally:
            client.close()
    
    def execute_read(self, query):
        """读取操作使用读取端点"""
        client = self.get_reader_client()
        try:
            return client.submit(query).all().result()
        finally:
            client.close()
```

### 使用场景

- 读写分离：写入走主实例，读取走只读副本
- 多 AZ 部署：跨可用区高可用
- 跨区域容灾：Global Database

### 潜在风险与注意事项

- 只读副本有秒级复制延迟
- 故障转移期间有 30-60 秒不可用
- 只读副本数量受实例规格限制

### 本章小结

- 主实例处理写入，只读副本处理读取
- 自动故障转移保证高可用
- 读写分离提升读吞吐量

---

## 2.6 Neptune Streams

### 解决的问题

实时获取图数据库的变更事件，用于数据同步、缓存更新、事件驱动架构。

### 核心原理

Neptune Streams 将每次写入操作记录为变更事件，通过 HTTP API 或 Lambda 触发器消费。每个事件包含操作类型（ADD/REMOVE）、变更前后的数据、时间戳。

### 代码/配置实现

**启用 Streams 并消费：**

```python
import boto3
import json

def lambda_handler(event, context):
    """Lambda 函数处理 Neptune Streams 事件"""
    for record in event['records']:
        # 解析变更事件
        change = json.loads(record['data'])
        op = change['op']  # ADD, REMOVE
        element_type = change['type']  # vertex, edge
        element_id = change['id']
        
        if op == 'ADD':
            # 新数据
            new_data = change['new']
            print(f"新增 {element_type}: {element_id}")
        elif op == 'REMOVE':
            # 旧数据
            old_data = change['old']
            print(f"删除 {element_type}: {element_id}")
    
    return {'statusCode': 200}
```

### 使用场景

- 实时同步到 Elasticsearch
- 缓存失效（Redis/Memcached）
- 事件驱动架构（触发后续处理）
- 审计日志

### 潜在风险与注意事项

- Streams 事件有秒级延迟
- 大量写入会产生大量事件
- 需要处理重复事件（至少一次语义）

### 本章小结

- Neptune Streams 提供变更数据捕获
- 可集成 Lambda、Kinesis 等
- 适合实时同步和事件驱动场景
