# 第 10 章 存储与数据库的高可用设计

## 10.1 为什么数据层高可用很重要？

### 一个故事：单点数据库的教训

某 SaaS 公司的所有业务数据都存储在一个 Cloud SQL 实例中，没有配置高可用，也没有配置只读副本。

一天凌晨，该 Cloud SQL 实例所在的 Zone 发生硬件故障，实例宕机。由于没有高可用配置，GCP 无法自动故障转移到其他 Zone。团队花了 2 小时从备份中恢复数据，又花了 1 小时验证数据完整性。

**影响：** 3 小时的服务中断 + 部分数据丢失（最近 15 分钟的数据） + 客户信任度下降。

**教训：** 数据层是整个系统中最不能出问题的部分——数据丢失的后果远比服务中断严重。

### 数据服务的分类

GCP 提供了多种数据服务，按类型可以分为：

| 类型 | 服务 | 适用场景 |
|------|------|---------|
| 对象存储 | Cloud Storage | 文件、备份、静态内容 |
| 关系型数据库 | Cloud SQL、Spanner | 结构化数据、事务处理 |
| NoSQL 数据库 | Firestore、Bigtable | 实时数据、大规模数据 |
| 数据仓库 | BigQuery | 分析型查询、BI |

---

## 10.2 Cloud Storage：对象存储的高可用

### 存储类别与冗余级别

Cloud Storage 提供了多种存储类别和冗余选项：

**存储类别：**

| 类别 | 适用场景 | 月存储成本（每 GB） | 检索费用 |
|------|---------|-------------------|---------|
| Standard | 频繁访问的数据 | ~$0.020 | 无 |
| Nearline | 每月访问 1 次 | ~$0.010 | 有 |
| Coldline | 每季度访问 1 次 | ~$0.004 | 有 |
| Archive | 每年访问 1 次 | ~$0.0012 | 有 |

**冗余级别：**

| 冗余级别 | 可用性 | 说明 |
|---------|-------|------|
| regional | 99.99% | 数据复制到同一 Region 的多个 Zone |
| dual-region | 99.999% | 数据复制到两个指定的 Region |
| multi-region | 99.999% | 数据复制到多个 Region |

### 创建高可用的存储桶

```bash
# 创建多区域存储桶（最高可用性）
gcloud storage buckets create gs://my-prod-data \
    --location=us \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access

# 创建双区域存储桶
gcloud storage buckets create gs://my-prod-data-dual \
    --location=us-central1 \
    --additional-locations=us-east1 \
    --default-storage-class=STANDARD
```

### 版本控制与生命周期管理

```bash
# 启用版本控制
gcloud storage buckets update gs://my-prod-data \
    --versioning

# 配置生命周期规则
cat > lifecycle-config.json << EOF
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 30, "matchesStorageClass": ["STANDARD"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 90, "matchesStorageClass": ["NEARLINE"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365}
    }
  ]
}
EOF

gcloud storage buckets update gs://my-prod-data \
    --lifecycle-file=lifecycle-config.json
```

**生命周期策略说明：**

```
创建 → 30 天 → Nearline → 90 天 → Coldline → 365 天 → 删除
```

### 跨区域复制

```bash
# 配置跨区域复制（将数据从 us-central1 复制到 europe-west1）
gcloud storage buckets update gs://my-prod-data \
    --replication-bucket=gs://my-prod-data-backup-eu
```

---

## 10.3 Cloud SQL：关系型数据库的高可用

### 区域级高可用配置

Cloud SQL 支持区域级高可用配置——主实例和备用实例分布在同一个 Region 的不同 Zone 中。

```bash
# 创建高可用的 Cloud SQL 实例
gcloud sql instances create prod-db \
    --database-version=POSTGRES_15 \
    --region=us-central1 \
    --availability-type=REGIONAL \
    --cpu=4 \
    --memory=16GiB \
    --storage-size=100GB \
    --storage-auto-increase \
    --backup-start-time=02:00 \
    --enable-point-in-time-recovery \
    --retained-backups-count=30
```

**高可用配置的关键参数：**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `--availability-type` | 可用性类型 | `REGIONAL`（区域级高可用） |
| `--storage-auto-increase` | 自动增加存储 | 启用 |
| `--backup-start-time` | 自动备份时间 | 业务低峰期 |
| `--enable-point-in-time-recovery` | 时间点恢复 | 启用 |
| `--retained-backups-count` | 保留的备份数 | 30 天 |

### 故障转移过程

```
正常状态：
主实例（us-central1-a）← 同步复制 → 备用实例（us-central1-b）
应用连接到主实例

Zone a 故障时：
1. GCP 检测到主实例不可用
2. 备用实例自动提升为新的主实例
3. DNS 记录自动更新（IP 地址不变）
4. 应用无需修改配置
5. 整个过程通常在 1-2 分钟内完成

恢复后：
新的主实例（us-central1-b）
GCP 自动在另一个 Zone 创建新的备用实例
```

### 只读副本与跨区域灾备

```bash
# 创建同 Region 只读副本（用于读写分离）
gcloud sql instances create prod-db-read-replica \
    --master-instance-name=prod-db \
    --region=us-central1 \
    --cpu=2 \
    --memory=8GiB

# 创建跨 Region 只读副本（用于灾备）
gcloud sql instances create prod-db-dr-replica \
    --master-instance-name=prod-db \
    --region=europe-west1 \
    --cpu=2 \
    --memory=8GiB
```

**只读副本的使用场景：**

| 场景 | 配置 | 说明 |
|------|------|------|
| 读写分离 | 同 Region 只读副本 | 将只读查询路由到副本，减轻主库压力 |
| 灾备 | 跨 Region 只读副本 | 主 Region 故障时，提升副本为主库 |
| 数据迁移 | 临时只读副本 | 在不影响主库的情况下导出数据 |

### 跨区域灾备的故障切换

```bash
# 当主 Region 发生灾难性故障时，手动提升跨 Region 副本为主库
gcloud sql instances promote-replica prod-db-dr-replica

# 提升后，更新应用连接字符串指向新的主库
# 注意：提升操作不可逆，原主库恢复后不能自动同步
```

---

## 10.4 Spanner：全球级分布式数据库

### 什么是 Spanner？

Cloud Spanner 是 GCP 上最强的数据库产品——一个具备**强一致性**和**全球级水平扩展能力**的分布式关系型数据库。

**Spanner 的独特之处：**

- 支持 SQL 查询（兼容 PostgreSQL 和 GoogleSQL）
- 具备强一致性（ACID 事务）
- 可以在全球多个 Region 之间自动复制数据
- 故障切换自动完成，无需手动干预

### 创建 Spanner 实例

```bash
# 创建单区域 Spanner 实例
gcloud spanner instances create prod-spanner \
    --config=regional-us-central1 \
    --description="Production Spanner instance" \
    --processing-units=100

# 创建多区域 Spanner 实例（最高可用性）
gcloud spanner instances create prod-spanner-global \
    --config=nam3 \  # 美国多区域配置
    --description="Global Spanner instance" \
    --nodes=3
```

### Spanner 的适用场景

| 场景 | 推荐使用 Spanner？ | 原因 |
|------|-------------------|------|
| 全球级金融交易系统 | ✅ 强烈推荐 | 强一致性 + 全球复制 |
| 全球库存管理系统 | ✅ 推荐 | 跨 Region 数据一致性 |
| 单 Region 的关系型数据库 | ❌ 不推荐 | Cloud SQL 更经济 |
| 简单的键值存储 | ❌ 不推荐 | Firestore 或 Bigtable 更合适 |

---

## 10.5 Firestore：实时应用的文档数据库

### Firestore 的高可用特性

Firestore 是一个 NoSQL 文档数据库，以其实时同步功能而闻名。

**高可用特性：**

- 数据自动分布在多个 Region，不需要额外配置高可用
- 支持强一致性模式和最终一致性模式
- 自动扩缩容，无需管理容量

### 创建 Firestore 数据库

```bash
# 创建 Firestore 数据库（原生模式）
gcloud firestore databases create \
    --location=nam5 \  # 多区域
    --type=firestore-native

# 创建 Firestore 数据库（Datastore 模式）
gcloud firestore databases create \
    --location=us-central1 \
    --type=datastore-mode
```

### Firestore 的适用场景

| 场景 | 推荐使用 Firestore？ | 原因 |
|------|--------------------|------|
| 移动应用后端 | ✅ 强烈推荐 | 实时同步、离线支持 |
| 实时协作应用 | ✅ 推荐 | 实时更新 |
| 用户状态和偏好 | ✅ 推荐 | 文档模型适合 |
| 复杂的事务处理 | ❌ 不推荐 | 不支持复杂事务 |

---

## 10.6 一个场景：数据库高可用架构设计

### 需求

某电商平台需要设计数据库架构，要求：
- 可用性 ≥ 99.99%
- RPO < 5 分钟（最多丢失 5 分钟的数据）
- RTO < 15 分钟（15 分钟内恢复服务）
- 读写分离，减轻主库压力

### 架构设计

```
                    ┌──────────────────┐
                    │  应用服务          │
                    └──────┬───────────┘
                           │
            ┌──────────────┼──────────────┐
            │ 读           │ 写           │
    ┌───────┴───────┐     │     ┌────────┴────────┐
    │ 只读副本       │     │     │ 主实例          │
    │ us-central1-b │     │     │ us-central1-a   │
    │ 2 vCPU, 8GB   │     │     │ 4 vCPU, 16GB    │
    └───────────────┘     │     └────────┬────────┘
                           │             │ 同步复制
                           │     ┌───────┴────────┐
                           │     │ 备用实例        │
                           │     │ us-central1-c   │
                           │     │ 4 vCPU, 16GB    │
                           │     └────────────────┘
                           │
                    ┌──────┴───────┐
                    │ 灾备只读副本   │
                    │ europe-west1  │
                    │ 2 vCPU, 8GB   │
                    └──────────────┘
```

### 配置步骤

**第一步：创建主实例（高可用）**

```bash
gcloud sql instances create ecommerce-db \
    --database-version=POSTGRES_15 \
    --region=us-central1 \
    --availability-type=REGIONAL \
    --cpu=4 \
    --memory=16GiB \
    --storage-size=200GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --enable-point-in-time-recovery \
    --retained-backups-count=30
```

**第二步：创建只读副本**

```bash
# 同 Region 只读副本（读写分离）
gcloud sql instances create ecommerce-db-read \
    --master-instance-name=ecommerce-db \
    --region=us-central1 \
    --cpu=2 \
    --memory=8GiB

# 跨 Region 灾备副本
gcloud sql instances create ecommerce-db-dr \
    --master-instance-name=ecommerce-db \
    --region=europe-west1 \
    --cpu=2 \
    --memory=8GiB
```

**第三步：配置应用连接**

```python
# 应用中的数据库连接配置
import psycopg2

# 写连接（指向主实例）
write_conn = psycopg2.connect(
    host="ecommerce-db.us-central1.cloudsql.xxx",
    database="ecommerce",
    user="app_user",
    password="***"
)

# 读连接（指向只读副本）
read_conn = psycopg2.connect(
    host="ecommerce-db-read.us-central1.cloudsql.xxx",
    database="ecommerce",
    user="readonly_user",
    password="***"
)

# 根据操作类型选择连接
def get_db_connection(read_only=False):
    if read_only:
        return read_conn
    return write_conn
```

**第四步：配置备份和监控**

```bash
# 配置自动备份
gcloud sql instances patch ecommerce-db \
    --backup-start-time=03:00 \
    --enable-point-in-time-recovery

# 配置磁盘使用率告警
gcloud alpha monitoring policies create \
    --display-name="Cloud SQL 磁盘使用率 > 80%" \
    --condition-filter='resource.type="cloudsql_database" AND metric.type="cloudsql.googleapis.com/disk/utilization"' \
    --condition-threshold-value=0.8 \
    --condition-threshold-duration=300s
```

---

## 10.7 反模式：存储与数据库中的常见错误

### 反模式一：没有配置高可用

**表现**：Cloud SQL 实例使用默认配置（`--availability-type=ZONAL`），没有高可用。

**后果**：Zone 故障时，数据库不可用，需要手动从备份恢复。

**正确的做法**：生产环境的数据库必须配置区域级高可用。

### 反模式二：没有配置备份

**表现**：没有配置自动备份，或者配置了但从未验证备份是否可用。

**后果**：数据损坏或误删除时，无法恢复。

**正确的做法**：配置自动备份，并定期验证备份的可用性（尝试从备份恢复到一个测试实例）。

### 反模式三：所有数据存在一个数据库

**表现**：所有业务数据——用户信息、订单、日志、配置——都存储在同一个 Cloud SQL 实例中。

**后果**：数据库负载高、查询慢、故障影响面大。

**正确的做法**：根据数据的访问模式和价值，选择不同的存储方案。日志存 Cloud Storage，配置存 Firestore，核心业务数据存 Cloud SQL。

### 反模式四：没有考虑数据生命周期

**表现**：所有数据都存储在 Standard 存储类别中，从不归档或删除。

**后果**：存储成本持续增长，大量"冷数据"占用昂贵的存储资源。

**正确的做法**：配置生命周期管理策略，将冷数据自动迁移到低成本存储类别，定期清理过期数据。

---

## 10.8 速查总结

### 存储服务选择速查

| 需求 | 推荐服务 | 高可用方式 |
|------|---------|-----------|
| 文件存储、备份 | Cloud Storage | 多区域/双区域冗余 |
| 关系型数据库（单 Region） | Cloud SQL | 区域级高可用 + 只读副本 |
| 关系型数据库（全球） | Spanner | 自动多区域复制 |
| NoSQL 文档数据库 | Firestore | 自动多区域复制 |
| 大规模时序数据 | Bigtable | 自动复制 |

### Cloud SQL 高可用配置清单

- [ ] `--availability-type=REGIONAL`（区域级高可用）
- [ ] `--storage-auto-increase`（自动增加存储）
- [ ] 配置自动备份（业务低峰期）
- [ ] 启用时间点恢复（PITR）
- [ ] 配置只读副本（读写分离）
- [ ] 跨 Region 灾备副本（关键业务）
- [ ] 配置磁盘使用率告警（> 80%）
- [ ] 定期验证备份可用性

### 每周数据库检查清单

- [ ] 数据库连接数是否正常？
- [ ] CPU 使用率是否在合理范围？
- [ ] 磁盘使用率是否超过 80%？
- [ ] 查询延迟是否有异常增长？
- [ ] 备份是否正常完成？
- [ ] 只读副本的同步延迟是否正常？

---

> **下一章预告：** 数据层的高可用设计好了，但还有一个问题——**当灾难真的发生时，你准备好了吗？** 第 11 章将介绍容灾（DR）规划，包括 RPO/RTO 的概念、GCP 上的常见容灾策略，以及如何为你的业务选择合适的方案。
