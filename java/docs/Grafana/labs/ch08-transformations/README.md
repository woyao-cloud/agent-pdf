# 第8章实验：数据转换（Transformations）

## 实验目标
- 使用 Join by field 合并多数据源
- 使用 Add field from calculation 计算字段
- 使用 Reduce 降维

## 前置条件
需要第3章（Prometheus）和第6章（MySQL）实验环境。

## 实验步骤

```bash
# 1. 启动 Prometheus 和 MySQL 环境
cd ../ch03-prometheus && docker compose up -d
cd ../ch06-sql && docker compose up -d

# 2. 在 Grafana 中创建面板
# 查询 A (Prometheus):
#   avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100
# 查询 B (MySQL):
#   SELECT $__timeGroupAlias(created_at, 1h), count(*) FROM orders GROUP BY 1

# 3. 添加 Transformation: Join by field
# 按 Time 字段合并两个查询结果

# 4. 添加 Transformation: Add field from calculation
# 名称: cpu_per_order
# 公式: $cpu / $orders

# 5. 添加 Transformation: Reduce
# 计算方式: Max

# 6. 观察合并后的数据

# 7. 清理
docker compose down
```
