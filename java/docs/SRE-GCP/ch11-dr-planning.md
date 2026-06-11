# 第 11 章 容灾（DR）规划

## 11.1 为什么容灾规划很重要？

### 一个故事：没有容灾规划的代价

某公司的所有服务都部署在 GCP 的 `us-central1` 区域。一天，该区域发生了一次罕见的全网故障——不是因为某个 Zone 的问题，而是整个区域的网络控制面出现了问题。

服务全部不可用。团队尝试在另一个 Region 部署服务，但发现：
- 没有跨 Region 的数据库副本，数据无法同步
- 没有预先配置的 Terraform 模板，需要手动创建资源
- 没有测试过跨 Region 部署，操作不熟练

**结果：** 服务中断了 8 小时才恢复。公司损失了数十万美元的收入。

**教训：** 容灾规划不是"如果"的问题，而是"什么时候"的问题。灾难一定会发生，区别只在于你准备好了没有。

### 容灾规划的核心问题

容灾规划回答三个核心问题：

1. **你能容忍丢失多少数据？** → RPO（Recovery Point Objective）
2. **你能容忍服务中断多久？** → RTO（Recovery Time Objective）
3. **你愿意为容灾投入多少成本？** → 容灾策略的选择

---

## 11.2 RPO 与 RTO

### RPO：恢复点目标

RPO（Recovery Point Objective）定义的是：**你可以容忍丢失多长时间的数据。**

```
RPO = 1 小时 → 最多丢失 1 小时内的数据变更
RPO = 5 分钟 → 最多丢失 5 分钟内的数据变更
RPO = 0 → 不能丢失任何数据
```

**RPO 的影响因素：**

| RPO | 数据保护方式 | 成本 |
|-----|------------|------|
| 24 小时 | 每日备份 | 低 |
| 1 小时 | 每小时备份 | 中 |
| 5 分钟 | 同步复制 | 高 |
| 0 | 同步复制 + 多活 | 最高 |

### RTO：恢复时间目标

RTO（Recovery Time Objective）定义的是：**你可以容忍服务中断多长时间。**

```
RTO = 4 小时 → 从灾难发生到服务恢复，必须在 4 小时内完成
RTO = 15 分钟 → 必须在 15 分钟内恢复
RTO = 0 → 不能有服务中断
```

**RTO 的影响因素：**

| RTO | 恢复方式 | 成本 |
|-----|---------|------|
| 24 小时 | 从备份恢复 | 低 |
| 4 小时 | 暖备 + 手动切换 | 中 |
| 15 分钟 | 暖备 + 自动切换 | 高 |
| 0 | 多活部署 | 最高 |

### RPO 和 RTO 是业务决策

**重要认知：** RPO 和 RTO 是业务决策，不是技术决策。你需要和业务方讨论：

- "如果丢失 5 分钟的交易数据，会造成多大的损失？"
- "如果服务中断 1 小时，会损失多少收入？"
- "用户能容忍多长时间的不可用？"

**RPO/RTO 决策矩阵：**

```
                    RTO 要求
              短（< 15min）  长（> 4h）
      ┌─────────────────────────────────
RPO  │
要求 │ 短（< 5min）  多活部署        暖备方案
     │ 长（> 4h）    暖备方案        备份恢复
```

---

## 11.3 GCP 上的常见容灾策略

### 策略一：备份-恢复

**RPO：** 小时级（取决于备份频率）
**RTO：** 小时级（取决于恢复速度）
**成本：** 低

**适用场景：** 非关键业务、开发测试环境、RPO/RTO 要求不高的场景。

**GCP 实现：**

```bash
# 1. 配置 Cloud SQL 自动备份
gcloud sql instances create prod-db \
    --backup-start-time=02:00 \
    --retained-backups-count=30 \
    --enable-point-in-time-recovery

# 2. 备份到 Cloud Storage
gcloud sql export sql prod-db gs://my-backups/db-backup-$(date +%Y%m%d).sql \
    --database=myapp

# 3. 从备份恢复
gcloud sql import sql prod-db gs://my-backups/db-backup-20250101.sql \
    --database=myapp
```

**恢复步骤：**

```
1. 在另一个 Region 创建新的 Cloud SQL 实例
2. 从 Cloud Storage 导入最新的备份
3. 更新应用连接字符串指向新实例
4. 验证数据完整性
5. 切换 DNS 记录
```

### 策略二：暖备（Pilot Light）

**RPO：** 分钟级
**RTO：** 分钟级
**成本：** 中

**适用场景：** 关键业务、需要较快恢复的场景。

**GCP 实现：**

```bash
# 1. 在另一个 Region 创建最小规模的副本
gcloud sql instances create prod-db-dr \
    --master-instance-name=prod-db \
    --region=europe-west1 \
    --cpu=2 \
    --memory=8GiB

# 2. 在另一个 Region 创建最小规模的 GKE 集群
gcloud container clusters create dr-cluster \
    --region=europe-west1 \
    --num-nodes=1 \
    --machine-type=e2-standard-2

# 3. 保持最小规模的实例运行
# 正常时：1 个节点，2 个 Pod
# 灾难时：扩容到生产规模
```

**暖备的 Terraform 配置：**

```hcl
# 主 Region 的生产环境
resource "google_sql_database_instance" "prod" {
  name             = "prod-db"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  
  settings {
    tier              = "db-custom-4-16384"
    availability_type = "REGIONAL"
    
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }
  }
}

# 灾备 Region 的暖备
resource "google_sql_database_instance" "dr" {
  name             = "prod-db-dr"
  database_version = "POSTGRES_15"
  region           = "europe-west1"
  
  settings {
    tier              = "db-custom-2-8192"  # 较小规格
    availability_type = "ZONAL"
  }
  
  # 配置为只读副本
  master_instance_name = google_sql_database_instance.prod.name
}
```

**恢复步骤：**

```
1. 提升只读副本为主库
2. 扩容 GKE 集群到生产规模
3. 部署应用服务
4. 更新 DNS 记录指向灾备 Region
5. 验证服务正常运行
```

### 策略三：多活（Multi-Region Active-Active）

**RPO：** 接近零
**RTO：** 接近零
**成本：** 高

**适用场景：** 关键业务、RPO/RTO 要求极高的场景。

**GCP 实现：**

```bash
# 1. 使用 Spanner 实现全球数据一致性
gcloud spanner instances create prod-spanner \
    --config=nam3 \
    --description="Global Spanner" \
    --nodes=3

# 2. 在多个 Region 部署 GKE 集群
gcloud container clusters create prod-cluster-us \
    --region=us-central1 \
    --num-nodes=3

gcloud container clusters create prod-cluster-eu \
    --region=europe-west1 \
    --num-nodes=3

# 3. 配置全局负载均衡器
gcloud compute backend-services create global-backend \
    --protocol=HTTP \
    --health-checks=prod-health-check \
    --global

gcloud compute backend-services add-backend global-backend \
    --instance-group=prod-mig-us \
    --instance-group-region=us-central1 \
    --global

gcloud compute backend-services add-backend global-backend \
    --instance-group=prod-mig-eu \
    --instance-group-region=europe-west1 \
    --global
```

**多活架构的关键要求：**

| 要求 | 说明 | GCP 方案 |
|------|------|---------|
| 数据一致性 | 所有 Region 的数据必须一致 | Spanner 或应用层冲突处理 |
| 会话管理 | 用户请求可能被路由到不同 Region | 全局会话存储（如 Redis） |
| 部署同步 | 所有 Region 的代码版本一致 | CI/CD 流水线同时部署到所有 Region |
| 监控统一 | 所有 Region 的监控数据汇总 | Cloud Monitoring 多项目视图 |

---

## 11.4 容灾策略的选择框架

### 决策流程

```
你的业务对可用性的要求是什么？
│
├─ RTO < 15 分钟 且 RPO < 5 分钟？
│  ├─ 是 → 多活策略（成本最高）
│  └─ 否 → 继续
│
├─ RTO < 4 小时 且 RPO < 1 小时？
│  ├─ 是 → 暖备策略（成本中等）
│  └─ 否 → 继续
│
├─ RTO < 24 小时 且 RPO < 24 小时？
│  ├─ 是 → 备份-恢复策略（成本最低）
│  └─ 否 → 继续
│
└─ 没有容灾要求？
   └─ 不需要容灾（但建议至少做备份）
```

### 成本对比

| 策略 | 月成本倍数 | 说明 |
|------|-----------|------|
| 备份-恢复 | 1.2x - 1.5x | 主要是备份存储费用 |
| 暖备 | 1.5x - 2.5x | 灾备 Region 运行最小规模资源 |
| 多活 | 2.5x - 4x | 所有 Region 运行完整生产环境 |

### 容灾策略选择矩阵

| 业务类型 | 推荐策略 | RPO | RTO | 月成本 |
|---------|---------|-----|-----|--------|
| 内部工具 | 备份-恢复 | 24h | 24h | 低 |
| 一般 Web 应用 | 暖备 | 1h | 4h | 中 |
| 电商平台 | 暖备 | 5min | 15min | 中高 |
| 金融交易 | 多活 | 0 | < 1min | 高 |
| 实时通信 | 多活 | 0 | 0 | 最高 |

---

## 11.5 一个完整场景：容灾规划实战

### 需求

某电商平台需要制定容灾方案。业务方给出的要求：
- RPO：不超过 5 分钟
- RTO：不超过 30 分钟
- 预算：不超过当前月成本的 2 倍

### 方案设计

**选择：暖备策略**

因为 RPO 5 分钟 + RTO 30 分钟的要求，备份-恢复策略无法满足（RTO 太长）。多活策略成本太高（超过 2 倍预算）。暖备策略是最合适的选择。

**架构：**

```
主 Region: us-central1
├─ Cloud SQL 主实例（4 vCPU, 16GB, 高可用）
├─ GKE 集群（3 节点）
├─ 应用服务（6 个 Pod）
└─ Redis 缓存

灾备 Region: us-west1
├─ Cloud SQL 只读副本（2 vCPU, 8GB）
├─ GKE 集群（1 节点，最小规模）
├─ 应用服务（2 个 Pod，最小规模）
└─ 数据持续同步
```

### 实施步骤

**第一步：配置数据同步**

```bash
# 创建跨 Region 的 Cloud SQL 只读副本
gcloud sql instances create prod-db-dr \
    --master-instance-name=prod-db \
    --region=us-west1 \
    --cpu=2 \
    --memory=8GiB
```

**第二步：部署灾备环境**

```bash
# 创建灾备 GKE 集群
gcloud container clusters create dr-cluster \
    --region=us-west1 \
    --num-nodes=1 \
    --machine-type=e2-standard-2 \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=10
```

**第三步：编写恢复 Runbook**

```markdown
# 容灾恢复 Runbook

## 触发条件
- us-central1 区域级故障，预计恢复时间 > 30 分钟
- 由事件指挥官决定是否启动容灾切换

## 恢复步骤

### 步骤 1：提升数据库（5 分钟）
1. 登录 GCP 控制台
2. 进入 Cloud SQL → prod-db-dr
3. 点击 "Promote Replica"
4. 确认提升操作
5. 记录新的连接字符串

### 步骤 2：扩容 GKE 集群（5 分钟）
1. 更新节点池大小：从 1 节点扩容到 5 节点
2. 确认所有节点 Ready
3. 扩容应用 Pod：从 2 个扩容到 10 个

### 步骤 3：切换流量（5 分钟）
1. 更新 DNS 记录指向 us-west1 的负载均衡器
2. 等待 DNS 传播（TTL 60 秒）
3. 验证服务可用性

### 步骤 4：验证（5 分钟）
1. 确认所有 API 端点正常
2. 确认数据库连接正常
3. 确认数据完整性
4. 通知相关方恢复完成

### 预计总恢复时间：20 分钟
```

**第四步：定期演练**

```markdown
# 容灾演练计划

## 频率：每季度一次

## 演练内容：
1. 在测试项目中模拟容灾切换
2. 按照 Runbook 执行恢复步骤
3. 记录实际恢复时间
4. 对比目标 RTO（30 分钟）
5. 更新 Runbook 中的不足

## 上次演练结果：
- 日期：2025-03-15
- 实际 RTO：22 分钟（在目标范围内）
- 发现问题：DNS 传播时间比预期长
- 改进措施：将 DNS TTL 从 300 秒降低到 60 秒
```

---

## 11.6 反模式：容灾规划中的常见错误

### 反模式一：有备份但从未验证

**表现**：配置了自动备份，但从未尝试从备份恢复过。

**后果**：当真正需要恢复时，发现备份文件已损坏或恢复流程不工作。

**正确的做法**：定期（至少每季度一次）从备份恢复到测试环境，验证备份的可用性。

### 反模式二：容灾方案没有文档化

**表现**：团队知道"应该怎么做容灾"，但没有写成文档。

**后果**：灾难发生时，关键人员不在岗，其他人不知道如何操作。

**正确的做法**：编写详细的容灾恢复 Runbook，包含每一步的具体操作命令和预期结果。

### 反模式三：从不演练

**表现**：容灾方案设计好了，但从未实际演练过。

**后果**：真正需要切换时，发现方案中的某些步骤不可行，或者操作时间远超预期。

**正确的做法**：每季度至少演练一次，记录实际恢复时间，持续改进。

### 反模式四：只考虑技术方案，不考虑业务影响

**表现**：团队只关注"怎么恢复"，没有考虑"恢复后业务是否正常"。

**后果**：技术层面恢复了，但业务数据不一致、用户会话丢失、第三方集成中断。

**正确的做法**：容灾方案不仅要考虑技术恢复，还要考虑业务恢复——数据一致性验证、第三方集成重新连接、用户通知等。

---

## 11.7 速查总结

### 容灾策略速查

| 策略 | RPO | RTO | 成本 | 复杂度 | 适用场景 |
|------|-----|-----|------|--------|---------|
| 备份-恢复 | 小时级 | 小时级 | 低 | 低 | 非关键业务 |
| 暖备 | 分钟级 | 分钟级 | 中 | 中 | 关键业务 |
| 多活 | 接近零 | 接近零 | 高 | 高 | 核心业务 |

### 容灾规划检查清单

- [ ] 是否已经确定 RPO 和 RTO？
- [ ] 是否选择了合适的容灾策略？
- [ ] 是否配置了跨 Region 的数据复制？
- [ ] 是否在灾备 Region 部署了最小规模的计算资源？
- [ ] 是否编写了容灾恢复 Runbook？
- [ ] 是否每季度进行容灾演练？
- [ ] 演练结果是否在目标 RTO 范围内？
- [ ] 容灾方案是否需要更新？

### 容灾恢复 Runbook 模板

```markdown
# 容灾恢复 Runbook - [服务名称]

## 基本信息
- 服务名称：
- 主部署 Region：
- 灾备 Region：
- 目标 RPO：
- 目标 RTO：
- 最后更新日期：
- 负责人：

## 触发条件
[什么情况下启动容灾切换]

## 恢复步骤
### 步骤 1：[操作名称]（预计 X 分钟）
[具体操作命令]

### 步骤 2：[操作名称]（预计 X 分钟）
[具体操作命令]

### 步骤 3：[操作名称]（预计 X 分钟）
[具体操作命令]

## 验证步骤
[如何确认恢复成功]

## 回滚步骤
[如果切换失败，如何回滚]

## 演练记录
| 日期 | 实际 RTO | 发现问题 | 改进措施 |
|------|---------|---------|---------|
|      |         |         |         |
```

---

> **下一章预告：** 至此，我们完成了 GCP 核心架构与高可用设计部分的全部内容。从第 12 章开始，我们将进入可观测性体系构建——如何通过指标、日志、追踪和性能分析，让你的系统的内部状态变得可见和可理解。
