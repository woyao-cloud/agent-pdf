# 第7章实验：变量与动态交互

## 实验目标
- 创建 Query 变量实现动态过滤
- 实现链式变量级联
- 使用 Ad Hoc Filters

## 前置条件
需要第3章实验环境（Prometheus）。

## 实验步骤

```bash
# 1. 启动第3章环境
cd ../ch03-prometheus
docker compose up -d

# 2. 在 Grafana 中创建 Dashboard
# 添加变量：
#   Name: job
#   Type: Query
#   Query: label_values(up, job)
#   Include All: true

# 3. 添加链式变量
#   Name: instance
#   Type: Query
#   Query: label_values(up{job="$job"}, instance)

# 4. 使用变量
#   rate(http_requests_total{job="$job", instance="$instance"}[5m])

# 5. 添加 Ad Hoc Filter
#   Name: filters
#   Type: Ad hoc filters
#   Data source: Prometheus

# 6. 观察效果
# 修改变量值 → 面板自动刷新
# 添加 Ad Hoc Filter → 查询条件动态变化

# 7. 清理
docker compose down
```
