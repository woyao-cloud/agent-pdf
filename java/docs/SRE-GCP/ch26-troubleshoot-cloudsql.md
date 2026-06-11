# 第 26 章 故障排查实战：Cloud SQL 问题

## 26.1 连接数耗尽

### 症状

应用无法连接到数据库，日志中显示 "too many connections" 或类似的连接池满错误。

### 排查路径

```bash
# 第一步：查看 Cloud SQL 的监控指标
# 当前活跃连接数、最大连接数、连接创建速率
gcloud sql instances describe prod-db --format="table(name,region,state)"

# 查看数据库的连接数指标
gcloud logging read "
    resource.type=cloudsql_database AND
    metric.type=cloudsql.googleapis.com/database/postgresql/num_backends
" --limit 10

# 第二步：在 Cloud Monitoring 中查看连接数趋势
# 确认连接数是否已经达到上限
```

### 临时缓解措施

```bash
# 1. 临时增加最大连接数（紧急情况）
gcloud sql instances patch prod-db \
    --database-flags=max_connections=500

# 2. 重启部分不需要实时数据库连接的服务
# 3. 如果连接泄露是问题根源，重启相关应用实例来释放连接
```

### 长期修复

| 措施 | 说明 | 优先级 |
|------|------|--------|
| 优化连接池配置 | 限制最大连接数、设置合理超时 | 高 |
| 修复连接泄露代码 | 确保每次使用后释放连接 | 高 |
| 添加熔断机制 | 连接池使用率达 80% 时拒绝新请求 | 中 |
| 增加只读副本 | 读写分离减轻主库连接压力 | 中 |

---

## 26.2 CPU 突增

### 症状

Cloud SQL 的 CPU 使用率突然飙升到 90% 以上，查询响应时间明显变慢。

### 排查路径

```bash
# 使用 Query Insights 查看当前运行的查询
# Cloud SQL → Query Insights → Top Queries

# 找出消耗最多 CPU 的查询
# 查看是否是慢查询、全表扫描或缺少索引
```

### 临时缓解

```bash
# 1. 终止消耗最大的查询
# 在 Cloud SQL 控制台的 Query Insights 中终止

# 2. 提升实例规格（临时）
gcloud sql instances patch prod-db \
    --cpu=8 --memory=32768MiB

# 3. 如果是因为突发流量，考虑添加应用层缓存
```

### 长期修复

| 原因 | 修复方案 |
|------|---------|
| 缺少索引 | 为慢查询添加合适索引 |
| 全表扫描 | 优化查询语句 |
| 突发流量 | 添加 Redis/Memcached 缓存层 |
| 读压力大 | 配置只读副本，读写分离 |

---

> **下一章预告：** 第 27 章将介绍网络与负载均衡的故障排查——502/503 错误和区域级网络中断。