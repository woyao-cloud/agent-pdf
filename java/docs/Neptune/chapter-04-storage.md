# 第4章 存储引擎与数据管理

## 4.1 存储架构详解

### 解决的问题

Neptune 的存储引擎需要支持图数据的随机访问模式（指针追逐），同时保证数据持久性和高可用性。理解存储架构有助于优化查询性能和控制成本。

### 核心原理

Neptune 使用**共享存储卷**架构，所有实例（主和只读副本）共享同一份存储数据：

- **最大 128 TiB**：自动扩展，无需手动扩容
- **6 副本跨 3 AZ**：每个数据块在 3 个可用区各存 2 份
- **自动分片**：数据自动分布到多个存储节点
- **SSD 优化**：针对图数据的随机 I/O 模式优化

**写入流程：**
1. 应用发送写入请求到主实例
2. 事务管理器记录 WAL
3. 数据写入存储节点（3 个 AZ 各 2 副本）
4. 确认写入成功后返回

### 代码/配置实现

**监控存储使用：**

```python
import boto3

def monitor_neptune_storage(cluster_id):
    client = boto3.client('neptune')
    
    # 获取集群信息
    response = client.describe_db_clusters(
        DBClusterIdentifier=cluster_id
    )
    cluster = response['DBClusters'][0]
    
    print(f"集群: {cluster['DBClusterIdentifier']}")
    print(f"存储: {cluster['AllocatedStorage']} GB")
    print(f"引擎版本: {cluster['EngineVersion']}")
    
    # 监控 CloudWatch 指标
    cw = boto3.client('cloudwatch')
    metrics = cw.get_metric_statistics(
        Namespace='AWS/Neptune',
        MetricName='VolumeBytesUsed',
        Dimensions=[{'Name': 'DBClusterIdentifier', 'Value': cluster_id}],
        StartTime='2024-01-01T00:00:00Z',
        EndTime='2024-01-02T00:00:00Z',
        Period=3600,
        Statistics=['Average', 'Maximum']
    )
    
    for point in metrics['Datapoints']:
        print(f"时间: {point['Timestamp']}, 存储: {point['Average'] / 1e9:.2f} GB")
```

### 使用场景

- 容量规划：监控存储增长趋势
- 成本分析：了解存储费用构成
- 性能调优：分析 IOPS 使用模式

### 潜在风险与注意事项

- 存储自动扩展但不会自动收缩
- 删除数据不会减少存储费用
- 高 IOPS 消耗会增加成本

### 本章小结

- 共享存储卷架构，最大 128 TiB
- 6 副本跨 3 AZ 保证持久性
- 自动分片和扩展

---

## 4.2 数据导入与导出

### 解决的问题

将现有数据迁移到 Neptune 或从 Neptune 导出数据是常见的需求。Neptune 提供了多种数据导入导出方式。

### 核心原理

**Bulk Loader（批量加载器）：**
- 从 S3 并行加载数据
- 支持 CSV、JSON、N-Triples 格式
- 自动错误处理和重试
- 支持 Gremlin 和 SPARQL 格式

**Neptune Export：**
- 导出到 S3
- 支持 Gremlin 和 SPARQL 格式
- 支持过滤和分区

### 代码/配置实现

**使用 Bulk Loader 导入数据：**

```python
import boto3
import json

def load_data_to_neptune(neptune_endpoint, s3_bucket, s3_path, role_arn):
    """使用 Bulk Loader 导入数据到 Neptune"""
    client = boto3.client('neptune')
    
    # 启动批量加载
    response = client.start_loader_job(
        source=f's3://{s3_bucket}/{s3_path}',
        format='csv',
        s3BucketRegion='us-east-1',
        iamRoleArn=role_arn,
        mode='RESUME',  # RESUME, NEW, AUTO
        failOnError=False,
        parallelism='HIGH',
        updateSingleCardinalityProperties=True,
        queueRequest=True
    )
    
    load_id = response['loadId']
    print(f"加载任务 ID: {load_id}")
    
    # 监控加载状态
    while True:
        status = client.describe_loader_job(
            loadId=load_id,
            endpoint=f'https://{neptune_endpoint}:8182'
        )
        state = status['status']['overallStatus']['status']
        print(f"加载状态: {state}")
        
        if state in ['LOAD_COMPLETED', 'LOAD_FAILED', 'ROLLBACK_COMPLETED']:
            break
        
        time.sleep(10)
    
    return status
```

**CSV 数据格式示例：**

```csv
# 节点文件 (vertices.csv)
~id,~label,name:String,age:Int,city:String
alice,person,Alice,30,Beijing
bob,person,Bob,25,Shanghai
carol,person,Carol,35,Beijing

# 边文件 (edges.csv)
~id,~from,~to,~label,since:Int
e1,alice,bob,knows,2020
e2,alice,carol,knows,2021
e3,bob,carol,knows,2022
```

### 使用场景

- 数据迁移：从其他数据库迁移到 Neptune
- 数据备份：定期导出数据
- 数据交换：与其他系统交换数据

### 潜在风险与注意事项

- Bulk Loader 不支持事务性加载（失败需要手动清理）
- 大文件需要先分区
- S3 和 Neptune 需要在同一区域

### 本章小结

- Bulk Loader 从 S3 并行加载数据
- 支持 CSV/JSON/N-Triples 格式
- Neptune Export 导出到 S3

---

## 4.3 数据建模最佳实践

### 解决的问题

图数据库的数据模型设计直接影响查询性能和可维护性。不合理的建模会导致查询缓慢、数据冗余和难以维护。

### 核心原理

**节点设计原则：**
- 使用有意义的标签（Label）名称
- 避免过度使用属性，考虑将复杂属性建模为独立节点
- 为查询频繁的属性创建索引

**边设计原则：**
- 边类型（Edge Type）应该描述关系语义
- 避免双向边（使用方向查询）
- 为边添加时间戳等属性支持时间查询

**索引策略：**
- 谓词范围索引（Predicate Range Index）：加速属性过滤
- 顶点属性索引（Vertex Property Index）：加速顶点属性查询

### 代码/配置实现

**数据建模示例：**

```groovy
// 社交网络数据模型
// 节点：User, Post, Comment, Group
// 边：FOLLOWS, POSTED, LIKES, COMMENTED_ON, MEMBER_OF

// 创建用户
g.addV('User').
  property('name', 'Alice').
  property('age', 30).
  property('city', 'Beijing')

// 创建帖子
g.addV('Post').
  property('title', 'Graph DB Guide').
  property('content', '...').
  property('createdAt', '2024-01-15')

// 创建关系
g.V().has('User', 'name', 'Alice').as('u').
  V().has('Post', 'title', 'Graph DB Guide').as('p').
  addE('POSTED').from('u').to('p').
  property('timestamp', '2024-01-15T10:00:00Z')

// 创建索引
// Neptune 自动为属性创建索引，无需手动创建
// 但可以通过查询提示优化
g.with('index', 'predicateRange').
  V().has('User', 'age', gt(25))
```

### 使用场景

- 新项目的数据模型设计
- 现有模型的优化重构
- 性能调优

### 潜在风险与注意事项

- 过度使用属性会导致查询性能下降
- 缺少索引会导致全表扫描
- 不合理的边方向会增加查询复杂度

### 本章小结

- 节点标签和边类型应该语义清晰
- 合理使用索引加速查询
- 避免过度使用属性和双向边

---

## 4.4 数据生命周期管理

### 解决的问题

图数据库中的数据需要管理其整个生命周期：创建、使用、归档、删除。Neptune 提供了快照、克隆、PITR 等能力。

### 核心原理

**快照（Snapshot）：**
- 自动快照：每天一次，保留 1-35 天
- 手动快照：用户触发，长期保留
- 快照存储：存储在 S3，按存储量计费

**克隆（Clone）：**
- 从快照创建新集群
- 用于测试、开发、数据分析
- 创建速度快，不占用额外存储

**时间点恢复（PITR）：**
- 恢复到过去 35 天内的任意时间点
- 基于 WAL 日志实现
- 创建新集群

### 代码/配置实现

**管理快照：**

```python
import boto3

def manage_neptune_snapshots(cluster_id):
    client = boto3.client('neptune')
    
    # 创建手动快照
    response = client.create_db_cluster_snapshot(
        DBClusterSnapshotIdentifier=f'{cluster_id}-manual-20240101',
        DBClusterIdentifier=cluster_id
    )
    print(f"快照创建中: {response['DBClusterSnapshot']['DBClusterSnapshotIdentifier']}")
    
    # 列出所有快照
    snapshots = client.describe_db_cluster_snapshots(
        DBClusterIdentifier=cluster_id
    )
    for snap in snapshots['DBClusterSnapshots']:
        print(f"快照: {snap['DBClusterSnapshotIdentifier']}, "
              f"创建时间: {snap['SnapshotCreateTime']}, "
              f"类型: {snap['SnapshotType']}")
    
    # 从快照恢复
    response = client.restore_db_cluster_from_snapshot(
        DBClusterIdentifier=f'{cluster_id}-restored',
        SnapshotIdentifier=f'{cluster_id}-manual-20240101',
        Engine='neptune'
    )
    print(f"恢复集群: {response['DBCluster']['DBClusterIdentifier']}")
```

### 使用场景

- 定期备份：满足合规要求
- 测试环境：从生产快照克隆测试集群
- 数据恢复：误操作后 PITR 恢复

### 潜在风险与注意事项

- 快照存储会产生额外费用
- 恢复操作需要创建新集群
- PITR 恢复时间取决于数据量

### 本章小结

- 自动快照每天一次，手动快照长期保留
- 克隆快速创建测试环境
- PITR 恢复到任意时间点
