# 第 2 章实验：TSDB 存储引擎揭秘

## 实验目的

1. 理解 TSDB 内部结构（Block、WAL、索引）
2. 体验高基数灾难现场和诊断方法
3. 观察 WAL 崩溃恢复过程
4. 跟踪 Compaction 合并过程

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| data-generator | :8081 | 正常时序数据生成（3 种指标，少量 Label） |
| high-card-gen | :8082 | 高基数场景生成器（可配置 Label 种类和基数） |
| Prometheus | :9091 | 启用 Admin API（可操作 TSDB） |
| Grafana | :3001 | 可视化面板 |

## 核心实验

### 实验 1：正常数据流观察

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证数据生成器
curl http://localhost:8081/metrics | head -20

# 3. 观察 TSDB 内部结构
docker exec ch02-tsdb-prometheus-1 ls -la /prometheus/
docker exec ch02-tsdb-prometheus-1 ls -la /prometheus/wal/
docker exec ch02-tsdb-prometheus-1 cat /prometheus/01*/meta.json

# 4. 用 promtool 分析
docker exec ch02-tsdb-prometheus-1 promtool tsdb analyze /prometheus
```

### 实验 2：高基数灾难现场

**步骤 1：低基数配置**

```bash
# 停止并清理
docker compose down -v

# 设置低基数
CARD_USER=10 docker compose up -d
sleep 30

# 分析序列数
bash scripts/tsdb-analyze.sh
```

**步骤 2：逐步增加基数**

```bash
docker compose down -v

# 中等基数（1,500 条序列）
CARD_USER=100 docker compose up -d
sleep 30
bash scripts/tsdb-analyze.sh

# 高基数（15,000 条序列）
docker compose down -v
CARD_USER=1000 docker compose up -d
sleep 30
bash scripts/tsdb-analyze.sh
```

观察：随着基数增加，序列数、内存占用、scrape 耗时的变化。

### 实验 3：WAL 崩溃恢复

```bash
# 1. 生成数据
docker compose up -d
sleep 60

# 2. 模拟崩溃
bash scripts/simulate-crash.sh
```

观察重启日志中的 WAL 重放信息。

**模拟 WAL 损坏**：

```bash
# 停止 Prometheus
docker compose stop prometheus

# 删除最新的 WAL 段
docker exec ch02-tsdb-prometheus-1 rm /prometheus/wal/$(ls -t /prometheus/wal/ | tail -1)

# 重启
docker compose start prometheus

# 观察日志中的错误
docker logs ch02-tsdb-prometheus-1 | grep -iE "wal|corrupt|error"
```

### 实验 4：Compaction 过程

```bash
# 启动（使用短 retention 加速观察）
docker compose up -d

# 观察 Block 变化
bash scripts/watch-compaction.sh
```

## PromQL 查询

```promql
# 查看高基数指标的序列数
count(app_request_duration_ms)

# 按 endpoint 聚合
count(app_request_duration_ms) by (endpoint)

# 按 user_id 聚合（高基数！）
count(app_request_duration_ms) by (user_id)
```

## 清理

```bash
docker compose down -v
```
