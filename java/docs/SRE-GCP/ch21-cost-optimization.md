# 第 21 章 FinOps 成本优化

## 21.1 为什么成本优化是 SRE 的职责？

### 一个故事：无人关心的云账单

某公司每个月的 GCP 账单约 5 万美元。CTO 每个月看一眼账单，觉得"有点贵"，但不知道贵在哪里。

一年后，公司对账单进行了详细分析，发现：
- 30% 的费用来自未使用的资源（僵尸磁盘、闲置 IP、空转实例）
- 20% 的费用来自规格过大的实例（CPU 平均利用率不到 20%）
- 15% 的费用来自没有使用承诺折扣的长期运行实例

**如果早期就进行成本优化，每年可以节省约 20 万美元。**

### FinOps 的核心思想

FinOps 是"Finance"和"DevOps"的结合。它的核心思想是：**在云上，成本管理不是财务部门独自承担的责任，而是工程团队和财务团队共同的责任。**

FinOps 的三个阶段：

```
洞察 (Inform) → 优化 (Optimize) → 运营 (Operate)
     │                 │                 │
     ▼                 ▼                 ▼
  知道钱花在哪      找到节省空间      融入日常工作
```

---

## 21.2 GCP 成本分析工具

### Cloud Billing 报告

```bash
# 查看当前月的费用
gcloud billing accounts list
gcloud billing projects list --billing-account=ACCOUNT_ID

# 按项目查看费用
gcloud billing accounts get-iam-policy ACCOUNT_ID
```

### Billing 数据导出到 BigQuery

```bash
# 配置 Billing 导出到 BigQuery
# 1. 在 GCP 控制台 → Billing → 导出
# 2. 选择导出到 BigQuery
# 3. 选择数据集

# 创建导出配置
gcloud billing exports create bigquery \
    --billing-account=ACCOUNT_ID \
    --bigquery-project=my-project \
    --bigquery-dataset=billing_data \
    --file-type=usage
```

### BigQuery 账单分析查询

**月度成本总览：**

```sql
-- 月度成本总览
SELECT
  invoice.month AS billing_month,
  SUM(cost) AS total_cost,
  SUM(IF(grand_type = 'CREDIT', cost, 0)) AS total_credits,
  SUM(IF(grand_type = 'USAGE', cost, 0)) AS total_usage
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month = '202501'
GROUP BY billing_month;
```

**按服务分析成本：**

```sql
-- 按服务分析成本 Top 10
SELECT
  service.description AS service_name,
  ROUND(SUM(cost), 2) AS total_cost,
  ROUND(SUM(IF(grand_type = 'CREDIT', cost, 0)), 2) AS credits,
  ROUND(SUM(IF(grand_type = 'USAGE', cost, 0)), 2) AS usage_cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month = '202501'
GROUP BY service_name
ORDER BY total_cost DESC
LIMIT 10;
```

**按团队标签分摊成本：**

```sql
-- 按 team 标签分析成本
SELECT
  labels.value AS team_name,
  ROUND(SUM(cost), 2) AS total_cost,
  ROUND(SUM(IF(grand_type = 'USAGE', cost, 0)), 2) AS usage_cost
FROM `my-project.billing_data.gcp_billing_export_v1`,
UNNEST(labels) AS labels
WHERE 
  invoice.month = '202501'
  AND labels.key = 'team'
  AND cost > 0
GROUP BY team_name
ORDER BY total_cost DESC;
```

**成本趋势分析：**

```sql
-- 按月成本趋势
SELECT
  invoice.month AS billing_month,
  ROUND(SUM(cost), 2) AS total_cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE
  invoice.month >= '202407'
  AND invoice.month <= '202501'
GROUP BY billing_month
ORDER BY billing_month;
```

**识别僵尸资源：**

```sql
-- 找出未打标签的资源
SELECT
  project.name AS project_name,
  service.description AS service_name,
  sku.description AS resource_type,
  ROUND(SUM(cost), 2) AS total_cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE
  invoice.month = '202501'
  AND cost > 0
  AND (SELECT COUNT(1) FROM UNNEST(labels) AS l) = 0  -- 没有标签
GROUP BY project_name, service_name, resource_type
ORDER BY total_cost DESC
LIMIT 20;
```

---

## 21.3 成本优化策略

### 策略一：合适的机器类型

```bash
# 查看 Recommender 建议
gcloud recommender recommendations list \
    --project=my-project \
    --location=us-central1 \
    --recommender=google.compute.instance.MachineTypeRecommender \
    --format="table(name,primaryImpact.category,priority)"
```

**示例：**

| 当前规格 | 推荐规格 | 月节省 |
|---------|---------|--------|
| n2-standard-8 (8 vCPU, 32GB) | n2-standard-4 (4 vCPU, 16GB) | ~$100 |
| n2-standard-16 (16 vCPU, 64GB) | n2-standard-8 (8 vCPU, 32GB) | ~$200 |
| n1-standard-4 (4 vCPU, 15GB) | e2-standard-4 (4 vCPU, 16GB) | ~$30 |

### 策略二：承诺使用折扣（CUD）

```bash
# 查看 CUD 建议
gcloud recommender recommendations list \
    --project=my-project \
    --recommender=google.compute.commitment.CommitmentRecommender
```

**CUD 节省对比：**

| 承诺类型 | 期限 | 节省幅度 | 适用场景 |
|---------|------|---------|---------|
| Compute Engine CUD | 1 年 | ~20% | 长期运行的 VM |
| Compute Engine CUD | 3 年 | ~50% | 稳定的生产环境 |
| Cloud SQL CUD | 1 年 | ~20% | 长期运行的数据库 |

### 策略三：Spot 实例

```yaml
# spot-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-processor
spec:
  replicas: 5
  template:
    spec:
      nodeSelector:
        cloud.google.com/gke-spot: "true"  # 调度到 Spot 节点池
      containers:
      - name: processor
        image: gcr.io/my-project/batch-processor:latest
```

**Spot 实例适用场景：**

| 场景 | 推荐使用 Spot？ | 原因 |
|------|---------------|------|
| 批处理任务 | ✅ 强烈推荐 | 可中断，重新调度即可 |
| CI/CD 构建 | ✅ 推荐 | 构建失败可重新开始 |
| 无状态 Web 服务 | ⚠️ 谨慎 | 需配置 Pod 分布策略 |
| 数据库 | ❌ 不推荐 | 数据丢失风险 |

### 策略四：清理僵尸资源

```bash
# 查找未使用的静态 IP
gcloud compute addresses list \
    --filter="status=RESERVED AND region:*" \
    --format="table(name,region,address)"
```

**常见僵尸资源：**

| 资源类型 | 月成本（每个） | 检查方式 |
|---------|-------------|---------|
| 未挂载的磁盘 | $10-50 | `gcloud compute disks list --filter="-users:*"` |
| 未使用的静态 IP | $3-5 | `gcloud compute addresses list --filter="status=RESERVED"` |
| 空转的 VM 实例 | $30-200 | 检查 CPU 利用率 < 5% 的实例 |
| 未使用的 LB | $20-30 | 检查没有后端实例的 LB |

---

## 21.4 成本分摊（Chargeback/Showback）

### 标签规范

```hcl
# 在 Terraform 中强制标注标签
resource "google_compute_instance" "app" {
  name = "prod-app-001"
  
  labels = {
    environment = "production"
    team        = "payment"
    project     = "ecommerce"
    cost-center = "cc-1234"
    owner       = "sre-team"
  }
}
```

### 成本分摊报表

```sql
-- 按团队和项目的成本分摊
SELECT
  project.name AS project_name,
  (SELECT value FROM UNNEST(labels) WHERE key = 'team') AS team,
  (SELECT value FROM UNNEST(labels) WHERE key = 'cost-center') AS cost_center,
  ROUND(SUM(cost), 2) AS monthly_cost,
  ROUND(SUM(cost) / (SELECT SUM(cost) FROM `my-project.billing_data.gcp_billing_export_v1` 
                     WHERE invoice.month = '202501') * 100, 2) AS percentage
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE 
  invoice.month = '202501'
  AND cost > 0
GROUP BY project_name, team, cost_center
ORDER BY monthly_cost DESC;
```

---

## 21.5 一个场景：成本优化实战

### 背景

某团队月 GCP 费用 $45,000，希望在不影响性能的情况下优化成本。

### 第一步：分析现状

通过 BigQuery 分析，发现成本分布：

```
Compute Engine:        $18,000 (40%)
GKE:                   $10,000 (22%)
Cloud SQL:             $7,000  (16%)
Cloud Storage:         $5,000  (11%)
网络:                   $3,000  (7%)
其他:                   $2,000  (4%)
```

### 第二步：识别优化机会

| 优化项 | 预计节省 | 实施难度 |
|--------|---------|---------|
| 降级过大的实例 | $3,000/月 | 低 |
| 购买 CUD | $2,500/月 | 低 |
| 清理僵尸资源 | $1,500/月 | 低 |
| 使用 Spot 实例 | $2,000/月 | 中 |
| 调整存储类别 | $1,000/月 | 低 |

### 第三步：实施

**第 1 周：** 清理僵尸资源，节省 $1,500/月

```bash
# 删除未挂载的磁盘
gcloud compute disks list --filter="-users:*" --format="value(name,zone)" | \
  while read disk zone; do
    gcloud compute disks delete $disk --zone=$zone --quiet
  done
```

**第 2 周：** 降级过大实例，节省 $3,000/月

```bash
# 查看 Recommender 建议
gcloud recommender recommendations list \
    --project=my-project \
    --recommender=google.compute.instance.MachineTypeRecommender
```

**第 3 周：** 购买 CUD，节省 $2,500/月

**第 4 周：** 配置 Spot 节点池，迁移批处理任务

### 第四步：成果

优化后月费用从 $45,000 降到了 $35,000，节省约 22%。

---

## 21.6 反模式：成本优化中的常见错误

### 反模式一：只优化不监控

**表现**：一次性做了大量优化，但没有持续监控。

**后果**：优化效果无法持续，新的浪费很快出现。

**正确的做法**：建立持续的成本监控机制，每月检查优化效果。

### 反模式二：为了省钱牺牲可靠性

**表现**：为了省钱，取消了冗余部署，减少了监控覆盖。

**后果**：系统可靠性下降，故障恢复时间延长。

**正确的做法**：在保证可靠性的前提下优化成本。

### 反模式三：没有标签就做成本分摊

**表现**：资源没有打标签，就开始做成本分摊分析。

**后果**：大量成本无法归属到具体团队。

**正确的做法**：先建立标签规范并执行到位，再开始成本分摊。

---

## 21.7 速查总结

### 成本优化策略速查

| 策略 | 节省幅度 | 实施难度 | 适用场景 |
|------|---------|---------|---------|
| 清理僵尸资源 | 5-10% | 低 | 所有环境 |
| 降级过大实例 | 10-20% | 低 | 长期运行的实例 |
| 购买 CUD | 20-50% | 低 | 长期运行的实例 |
| 使用 Spot | 60-90% | 中 | 批处理、无状态任务 |
| 调整存储类别 | 30-70% | 低 | 冷数据 |

### 每月成本检查清单

- [ ] 月度总费用是否在预算范围内？
- [ ] 是否有费用异常增长的服务？
- [ ] Recommender 是否有新的优化建议？
- [ ] 僵尸资源是否已清理？
- [ ] 标签覆盖率是否达标？

---

> **下一章预告：** FinOps 的基础是"知道钱花在哪里"。第 22 章将深入介绍如何通过 BigQuery 进行账单分析，建立成本分摊机制，让每个团队对自己的成本负责。