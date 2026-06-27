# 第6章 安全、备份与高可用

## 6.1 网络安全

### 解决的问题

Neptune 作为托管数据库服务，必须在安全的网络环境中运行。网络安全配置不当可能导致数据泄露或未授权访问。

### 核心原理

Neptune 必须在 Amazon VPC 内部署，无法直接从公网访问。网络安全通过以下层次实现：

1. **VPC 隔离**：Neptune 部署在私有子网中
2. **安全组**：控制入站和出站流量
3. **VPC Endpoint**：通过 PrivateLink 访问 Neptune
4. **TLS 加密**：所有客户端连接使用 TLS 1.2+

### 代码/配置实现

**安全组配置：**

```json
{
    "SecurityGroupRules": [
        {
            "Description": "允许应用服务器访问 Neptune",
            "Type": "inbound",
            "IpProtocol": "tcp",
            "FromPort": 8182,
            "ToPort": 8182,
            "SourceSecurityGroupId": "sg-app-server"
        },
        {
            "Description": "允许 Lambda 访问 Neptune",
            "Type": "inbound",
            "IpProtocol": "tcp",
            "FromPort": 8182,
            "ToPort": 8182,
            "SourceSecurityGroupId": "sg-lambda"
        }
    ]
}
```

**Terraform VPC 配置：**

```hcl
resource "aws_neptune_cluster" "main" {
  cluster_identifier = "my-neptune"
  engine            = "neptune"
  storage_encrypted = true
  vpc_security_group_ids = [aws_security_group.neptune.id]
  db_subnet_group_name   = aws_neptune_subnet_group.main.name
}

resource "aws_security_group" "neptune" {
  name        = "neptune-sg"
  description = "Neptune security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 8182
    to_port         = 8182
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}
```

### 使用场景

- 生产环境部署：VPC 隔离 + 安全组
- 跨 VPC 访问：VPC Peering 或 Transit Gateway
- 混合云访问：VPN 或 Direct Connect

### 潜在风险与注意事项

- 安全组规则过于宽松（如 0.0.0.0/0）
- 未启用 TLS 加密
- VPC 子网 IP 不足导致无法创建 ENI

### 本章小结

- Neptune 必须在 VPC 内部署
- 安全组控制访问来源
- TLS 加密所有连接

---

## 6.2 身份认证与授权

### 解决的问题

控制谁可以访问 Neptune 以及可以执行哪些操作。Neptune 支持 IAM 认证和密码认证两种方式。

### 核心原理

**IAM 认证：**
- 使用 IAM 角色/用户签名请求
- 支持细粒度权限控制
- 无需管理数据库密码

**密码认证：**
- 创建集群时设置用户名密码
- 适合简单场景

**权限模型：**
- `neptune-db:ReadDataViaQuery`：读取数据
- `neptune-db:WriteDataViaQuery`：写入数据
- `neptune-db:GetMetricStatistics`：获取指标

### 代码/配置实现

**IAM 策略示例：**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "neptune-db:ReadDataViaQuery",
                "neptune-db:WriteDataViaQuery"
            ],
            "Resource": "arn:aws:neptune-db:us-east-1:123456789012:cluster-abc123/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "neptune-db:GetMetricStatistics",
                "neptune-db:ListTagsForResource"
            ],
            "Resource": "arn:aws:neptune-db:us-east-1:123456789012:cluster-abc123"
        }
    ]
}
```

**使用 IAM 认证连接：**

```python
from gremlin_python.driver import client, serializer
from neptune_python_utils.gremlin_utils import GremlinUtils

# 使用 IAM 角色认证
GremlinUtils.init_statics()
utils = GremlinUtils(
    'wss://your-neptune-endpoint:8182/gremlin',
    region='us-east-1'
)
conn = utils.get_remote_connection()
g = conn.traversal()

# 执行查询
result = g.V().has('person', 'name', 'Alice').values('name').next()
print(result)
```

### 使用场景

- 生产环境：IAM 认证 + 最小权限
- 开发环境：密码认证简化配置
- 跨账户访问：IAM 跨账户角色

### 潜在风险与注意事项

- IAM 策略过于宽泛（如 neptune-db:*）
- 密码泄露风险
- 未轮换长期凭证

### 本章小结

- IAM 认证提供细粒度权限控制
- 密码认证适合简单场景
- 遵循最小权限原则

---

## 6.3 加密与合规

### 解决的问题

保护 Neptune 中的数据在存储和传输过程中的安全，满足合规要求。

### 核心原理

**静态加密：**
- 使用 AWS KMS 加密存储数据
- 支持客户管理密钥（CMK）
- 加密自动应用于所有存储

**传输加密：**
- TLS 1.2+ 加密客户端连接
- 证书验证确保连接安全

**合规认证：**
- HIPAA：医疗健康数据
- GDPR：欧洲用户数据
- PCI DSS：支付卡数据
- SOC 1/2/3：服务组织控制

### 代码/配置实现

**启用 KMS 加密：**

```bash
# 创建 KMS 密钥
aws kms create-key --description "Neptune encryption key"

# 创建加密的 Neptune 集群
aws neptune create-db-cluster \
    --db-cluster-identifier my-neptune \
    --engine neptune \
    --storage-encrypted \
    --kms-key-id alias/neptune-key
```

**审计日志配置：**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudtrail:LookupEvents"
            ],
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "cloudtrail:EventSource": "neptune.amazonaws.com"
                }
            }
        }
    ]
}
```

### 使用场景

- 金融行业：PCI DSS 合规
- 医疗行业：HIPAA 合规
- 欧洲业务：GDPR 合规

### 潜在风险与注意事项

- KMS 密钥被删除会导致数据无法访问
- 加密会增加轻微的性能开销
- 合规认证需要额外的配置和审计

### 本章小结

- KMS 加密保护静态数据
- TLS 加密保护传输数据
- 支持 HIPAA/GDPR/PCI DSS 合规

---

## 6.4 备份与恢复

### 解决的问题

数据备份是数据库管理的基本要求。Neptune 提供自动和手动备份，支持时间点恢复。

### 核心原理

**自动备份：**
- 每天自动创建快照
- 保留 1-35 天（可配置）
- 存储在 S3

**手动备份：**
- 用户触发创建
- 长期保留
- 可跨区域复制

**时间点恢复（PITR）：**
- 恢复到过去 35 天内的任意时间点
- 精度到秒级
- 创建新集群

### 代码/配置实现

**配置备份策略：**

```python
import boto3

def configure_backup(cluster_id, retention_days):
    client = boto3.client('neptune')
    
    # 修改备份保留期
    response = client.modify_db_cluster(
        DBClusterIdentifier=cluster_id,
        BackupRetentionPeriod=retention_days,
        PreferredBackupWindow='02:00-03:00'
    )
    print(f"备份保留期设置为 {retention_days} 天")
    
    # 创建手动快照
    snapshot_id = f"{cluster_id}-backup-20240101"
    response = client.create_db_cluster_snapshot(
        DBClusterSnapshotIdentifier=snapshot_id,
        DBClusterIdentifier=cluster_id
    )
    print(f"手动快照创建中: {snapshot_id}")
    
    # 时间点恢复
    response = client.restore_db_cluster_to_point_in_time(
        DBClusterIdentifier=f"{cluster_id}-pitr",
        SourceDBClusterIdentifier=cluster_id,
        RestoreToTime='2024-01-01T12:00:00Z',
        UseLatestRestorableTime=False
    )
    print(f"PITR 恢复集群创建中")
```

### 使用场景

- 日常备份：自动备份满足基本需求
- 重大变更前：手动快照作为回滚点
- 误操作恢复：PITR 恢复到误操作前

### 潜在风险与注意事项

- 备份存储会产生额外费用
- 恢复操作需要创建新集群
- PITR 恢复时间取决于数据量

### 本章小结

- 自动备份每天一次，可配置保留期
- 手动快照长期保留
- PITR 恢复到任意时间点

---

## 6.5 高可用与容灾

### 解决的问题

确保 Neptune 在硬件故障、可用区故障甚至区域故障时仍能提供服务。

### 核心原理

**多 AZ 部署：**
- 主实例和只读副本分布在不同可用区
- 自动故障转移
- RTO < 60 秒

**只读副本：**
- 最多 15 个
- 跨区域部署
- 分担读取负载

**Global Database：**
- 跨区域复制
- 主区域写入，从区域读取
- 区域级容灾

### 代码/配置实现

**创建跨区域只读副本：**

```bash
# 在另一个区域创建只读副本
aws neptune create-db-instance \
    --db-instance-identifier my-neptune-reader \
    --db-instance-class db.r6g.large \
    --engine neptune \
    --db-cluster-identifier my-neptune-cluster \
    --availability-zone us-west-2a
```

**故障转移测试：**

```python
import boto3

def test_failover(cluster_id):
    client = boto3.client('neptune')
    
    # 触发故障转移
    response = client.failover_db_cluster(
        DBClusterIdentifier=cluster_id
    )
    print("故障转移触发")
    
    # 等待故障转移完成
    waiter = client.get_waiter('db_cluster_available')
    waiter.wait(DBClusterIdentifier=cluster_id)
    print("故障转移完成")
    
    # 验证新主实例
    response = client.describe_db_clusters(
        DBClusterIdentifier=cluster_id
    )
    cluster = response['DBClusters'][0]
    print(f"新主实例: {cluster['DBClusterMembers'][0]['DBInstanceIdentifier']}")
```

### 使用场景

- 生产环境：多 AZ 部署保证高可用
- 读密集型应用：只读副本扩展读取能力
- 跨区域业务：Global Database 区域级容灾

### 潜在风险与注意事项

- 只读副本有复制延迟
- 故障转移期间有短暂不可用
- 跨区域部署增加网络延迟和成本

### 本章小结

- 多 AZ 部署自动故障转移
- 只读副本扩展读取能力
- Global Database 跨区域容灾

---

## 6.6 监控与告警

### 解决的问题

实时了解 Neptune 的运行状态，及时发现和响应异常。

### 核心原理

**CloudWatch 指标：**
- CPU 使用率
- 可用内存
- IOPS
- 查询延迟
- 连接数

**告警策略：**
- CPU > 80%：扩容或优化查询
- 可用内存 < 20%：内存压力
- IOPS > 80%：IOPS 瓶颈
- 查询延迟 > 1s：慢查询

### 代码/配置实现

**创建 CloudWatch 告警：**

```bash
# CPU 告警
aws cloudwatch put-metric-alarm \
    --alarm-name neptune-high-cpu \
    --alarm-description "Neptune CPU > 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/Neptune \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune \
    --alarm-actions arn:aws:sns:us-east-1:123456789012:neptune-alerts

# 内存告警
aws cloudwatch put-metric-alarm \
    --alarm-name neptune-low-memory \
    --metric-name FreeableMemory \
    --namespace AWS/Neptune \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 2000000000 \
    --comparison-operator LessThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune \
    --alarm-actions arn:aws:sns:us-east-1:123456789012:neptune-alerts
```

### 使用场景

- 生产监控：实时了解集群状态
- 容量规划：根据趋势预测资源需求
- 故障响应：自动告警通知

### 潜在风险与注意事项

- 告警阈值设置不当导致误报或漏报
- 指标采集频率影响告警响应时间
- 多个告警同时触发导致告警风暴

### 本章小结

- CloudWatch 提供全面的监控指标
- 合理设置告警阈值
- 结合 Performance Insights 分析性能
