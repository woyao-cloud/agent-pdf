# 第 22 章 账单分析与成本分摊

## 22.1 为什么账单分析很重要？

### 一个故事：40 万美元的"意外账单"

某团队在月初创建了一个高性能的 Compute Engine 实例用于压力测试，测试结束后忘记关闭。一个月后，团队收到了一张 $4,000 的账单——而这个实例仅仅用了 3 天就完成了测试，后面的 27 天都在空转。

如果团队配置了预算告警，在费用超过阈值时及时通知，这笔浪费完全可以避免。

### 账单分析的价值

| 场景 | 没有账单分析 | 有账单分析 |
|------|------------|-----------|
| 成本异常 | 月底才看到账单 | 实时发现异常 |
| 成本归属 | 只知道总花费 | 知道每个团队花了多少 |
| 优化方向 | 不知道从何优化 | 数据驱动决策 |

---

## 22.2 配置 Billing 导出到 BigQuery

```bash
# 1. 创建 BigQuery 数据集
bq mk --location=US --dataset billing_data

# 2. 配置 Billing 导出
# 通过 GCP 控制台：Billing → 成本管理 → 导出
# 选择导出到 BigQuery，指定上一步创建的数据集

# 3. 验证数据是否到达
bq query --use_legacy_sql=false '
SELECT COUNT(*) as row_count
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month = "202501"
'
```

---

## 22.3 核心分析查询

### 仪表盘查询

```sql
-- 1. 月度成本趋势（过去 12 个月）
SELECT
  invoice.month AS month,
  ROUND(SUM(cost), 2) AS cost,
  ROUND(SUM(IF(cost > 0 AND credits > 0, credits, 0)), 2) AS credits,
  ROUND(SUM(cost) - SUM(IF(cost > 0 AND credits > 0, credits, 0)), 2) AS net_cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month >= '202402'
GROUP BY month
ORDER BY month;

-- 2. 每日成本（本月）
SELECT
  DATE(usage_start_time) AS day,
  ROUND(SUM(cost), 2) AS daily_cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month = '202501'
GROUP BY day
ORDER BY day;

-- 3. 按项目和服务的成本明细
SELECT
  project.name AS project_name,
  service.description AS service_name,
  ROUND(SUM(cost), 2) AS cost
FROM `my-project.billing_data.gcp_billing_export_v1`
WHERE invoice.month = '202501'
GROUP BY project_name, service_name
ORDER BY project_name, cost DESC;
```

### 成本分摊查询

```sql
-- 按 team 标签分摊成本
WITH labeled_cost AS (
  SELECT
    project.name AS project_name,
    (SELECT value FROM UNNEST(labels) WHERE key = 'team') AS team,
    (SELECT value FROM UNNEST(labels) WHERE key = 'environment') AS environment,
    service.description AS service_name,
    cost,
    usage.amount AS usage_amount,
    usage.unit AS usage_unit
  FROM `my-project.billing_data.gcp_billing_export_v1`
  WHERE invoice.month = '202501'
)
SELECT
  COALESCE(team, '未标注') AS team,
  COALESCE(environment, '未标注') AS environment,
  ROUND(SUM(cost), 2) AS total_cost,
  ROUND(SUM(cost) / SUM(SUM(cost)) OVER () * 100, 2) AS cost_percentage
FROM labeled_cost
WHERE cost > 0
GROUP BY team, environment
ORDER BY total_cost DESC;
```

### 异常检测查询

```sql
-- 对比本月和上月的费用变化
WITH this_month AS (
  SELECT
    service.description AS service_name,
    ROUND(SUM(cost), 2) AS cost
  FROM `my-project.billing_data.gcp_billing_export_v1`
  WHERE invoice.month = '202501'
  GROUP BY service_name
),
last_month AS (
  SELECT
    service.description AS service_name,
    ROUND(SUM(cost), 2) AS cost
  FROM `my-project.billing_data.gcp_billing_export_v1`
  WHERE invoice.month = '202412'
  GROUP BY service_name
)
SELECT
  COALESCE(t.service_name, l.service_name) AS service_name,
  l.cost AS last_month_cost,
  t.cost AS this_month_cost,
  ROUND(IFNULL((t.cost - l.cost) / l.cost * 100, 0), 2) AS change_percentage
FROM this_month t
FULL OUTER JOIN last_month l ON t.service_name = l.service_name
ORDER BY ABS(change_percentage) DESC
LIMIT 20;
```

---

## 22.4 预算告警配置

```bash
# 创建预算
gcloud billing budgets create \
    --billing-account=ACCOUNT_ID \
    --display-name="月度预算" \
    --budget-amount=50000 \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.8 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0 \
    --notification-channels="projects/my-project/notificationChannels/123"

# 按项目设置预算
gcloud billing budgets create \
    --billing-account=ACCOUNT_ID \
    --display-name="生产环境预算" \
    --budget-amount=30000 \
    --filter-projects="my-project-prod" \
    --threshold-rule=percent=0.8 \
    --threshold-rule=percent=0.9
```

---

## 22.5 成本分摊机制

### 建立标签规范

```hcl
# 在 Terraform 中强制标签
locals {
  required_labels = {
    environment = "production"
    team        = "payment"
    cost-center = "cc-1234"
    project     = "ecommerce"
    managed_by  = "terraform"
  }
}

resource "google_compute_instance" "app" {
  labels = local.required_labels
}
```

### 成本分摊报表模板

```sql
-- 月度成本分摊报表
WITH cost_data AS (
  SELECT
    (SELECT value FROM UNNEST(labels) WHERE key = 'cost-center') AS cost_center,
    (SELECT value FROM UNNEST(labels) WHERE key = 'team') AS team,
    service.description AS service_name,
    sku.description AS resource_type,
    cost,
    usage.amount AS usage_amount
  FROM `my-project.billing_data.gcp_billing_export_v1`
  WHERE invoice.month = '202501'
)
SELECT
  COALESCE(cost_center, '未分配') AS cost_center,
  COALESCE(team, '未标注') AS team,
  ROUND(SUM(cost), 2) AS total_cost,
  COUNT(DISTINCT service_name) AS service_count
FROM cost_data
WHERE cost > 0
GROUP BY cost_center, team
ORDER BY cost_center, total_cost DESC;
```

---

## 22.6 每周成本检查清单

- [ ] 本周费用是否在预算范围内？
- [ ] 是否有费用突增的服务？
- [ ] Recommender 是否有新的优化建议？
- [ ] 标签覆盖率是否达标？
- [ ] 是否有僵尸资源需要清理？

---

> **下一章预告：** 成本优化很重要，但没有什么比服务宕机更需要立即处理的。第 23 章开始进入事件响应部分——从告警到恢复的标准化流程。