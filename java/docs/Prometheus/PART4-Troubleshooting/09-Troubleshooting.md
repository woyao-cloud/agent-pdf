# 第9章 生产环境"三大杀手"排查与解决

## 9.1 杀手一：内存 OOM 与高基数

### 现象

Prometheus 进程突然被 OOM Killer 杀掉，或者内存持续增长直到触发容器 OOM。此时 prometheus.yml 中的 scrape 配置明明没变，但内存就是一直在涨。

### 根因

**高基数（High Cardinality）是 Prometheus OOM 的头号杀手。** 当某个 Label 的取值数量过大时，时间序列数量呈指数级增长，TSDB 的倒排索引和 Posting List 占满内存。

### 排查手段

**手段 1：promtool tsdb analyze**

```bash
docker exec prom-ch02 promtool tsdb analyze /prometheus --limit=10
```

输出示例：
```
Highest cardinality metric names:
35640  app_requests_total{endpoint, user_id, region, version}
28400  app_request_duration_ms{endpoint, user_id, region, version}
12     http_requests_total{method, endpoint, status}
```

如果某个指标的序列数在几万甚至几十万，这就是疑凶。

**手段 2：/api/v1/status/tsdb API**

```bash
curl -s http://localhost:9092/api/v1/status/tsdb | python -m json.tool
```

关注字段：
- `totalSeries`：总序列数（正常几千，危险几十万）
- `seriesCountByMetricName`：每个指标的序列数
- `labelValueCountByLabelName`：每个 Label 的基数

**手段 3：查看标签取值数量**

```bash
curl -s http://localhost:9092/api/v1/status/tsdb | \
  python -c "
import sys,json
d=json.load(sys.stdin)['data']
print('Top 5 labels by value count:')
for l in sorted(d['labelValueCountByLabelName'], key=lambda x:-x['valueCount'])[:5]:
    print(f'  {l[\"name\"]}: {l[\"valueCount\"]} values')
"
```

### 紧急止血方案

**方案 1：Relabel 规则临时 Drop 高危 Label**

```yaml
# 紧急操作：丢弃 user_id 标签
scrape_configs:
  - job_name: 'high-card-app'
    metric_relabel_configs:
      - regex: 'user_id|version|trace_id'
        action: labeldrop
```

添加到 prometheus.yml 后重启 Prometheus，内存会快速回落。

**方案 2：直接 Drop 整个指标**

如果某个指标已经完全失控，直接丢弃：

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    regex: 'problematic_metric_total'
    action: drop
```

### 长效方案

1. **Label 基数预算**：每个 Label 的取值数量不超过 100（method、status 等天然低基数的除外）
2. **Review 机制**：任何新指标上线前，Review Label 设计
3. **业务侧规范**：不要在 Label 中放用户 ID、订单 ID、Trace ID 等动态值
4. **自动告警**：设置 Prometheus 自身告警规则，当序列数超过阈值时告警

```yaml
# 当总序列数超过 10 万时告警
- alert: HighCardinalityDetected
  expr: prometheus_tsdb_head_series > 100000
  for: 5m
  annotations:
    summary: "Total series count > 100000, possible high cardinality"
```

## 9.2 杀手二：抓取失败与数据断点

### 现象

Grafana 图表中出现断断续续的"空洞"，或者报警规则经常出现数据不足的误报。

### 根因分析树

```
scrape 失败
├── 目标响应超时
│   ├── 应用 GC 停顿（Full GC → STW → 无法响应 HTTP）
│   ├── 应用自身处理慢（数据库慢查询、依赖超时）
│   └── 指标 Body 过大（单个 /metrics 响应 > 100MB）
├── 网络问题
│   ├── 目标主机网络抖动
│   └── DNS 解析失败
└── Prometheus 自身问题
    ├── 并发抓取上限打满
    └── TSDB 写入积压
```

### 排查流程

**Step 1：查看 Targets 页面**
```bash
# http://prometheus:9090/targets
# 观察哪些 target 的状态为 DOWN 或 Unknown
```

**Step 2：检查 Prometheus 日志**
```bash
docker logs prom-ch01 2>&1 | grep -E "scrape|error|timeout" | tail -20
```

典型日志：
```
ts=2024-01-01T10:00:00Z caller=scrape.go:491 level=warn msg="Error scraping target"
  err="context deadline exceeded"
  target="http://target:8080/metrics"
```

**Step 3：手动 curl 测试**
```bash
# 模拟 Prometheus 的 scrape 请求
curl -v --max-time 5 http://target:8080/metrics

# 检查响应状态码和耗时
curl -s -o /dev/null -w "HTTP %{http_code}, Time: %{time_total}s, Size: %{size_download}bytes\n" \
  http://target:8080/metrics
```

### 解决方案

| 问题 | 方案 |
|------|------|
| scrape 超时 | 调大 scrape_timeout（默认 10s → 30s） |
| 指标体过大 | 应用端启用 GZIP 压缩，或拆分成多个端口 |
| 应用 GC 停顿 | 调优 JVM/Go GC 参数，减少 STW 时间 |
| 并发上限打满 | 增大 --query.max-concurrency |

```yaml
# 调优后的 scrape 配置
global:
  scrape_interval: 30s    # 从 15s 放宽到 30s
  scrape_timeout: 30s     # 从 10s 放宽到 30s

scrape_configs:
  - job_name: 'large-metrics-app'
    scrape_interval: 60s  # 体量大的目标降低抓取频率
    scrape_timeout: 30s
```

## 9.3 杀手三：TSDB 损坏与 WAL 修复

### 现象

Prometheus 启动失败，日志中报错：

```
ts=2024-01-01T10:00:00Z caller=wal.go:301 level=error msg="WAL truncation failed"
  err="cut segment: read corrupted segment ..."
ts=2024-01-01T10:00:00Z caller=main.go:527 level=fatal msg="TSDB initialization failed"
```

### 修复命令速查表

| 场景 | 命令 | 数据丢失 |
|------|------|---------|
| 正常修复 | `promtool tsdb clean-tombstones /prometheus` | 无 |
| Block 损坏 | `promtool tsdb check-meta /prometheus` | 无（仅检查） |
| WAL 段损坏 | 删除损坏的 WAL 段文件 | 最多 2h 数据 |
| 全盘清理 | 删除 WAL 目录 | 最多 2h 数据 |

### 修复流程

**Step 1：尝试无损修复**

```bash
# 停止 Prometheus
docker compose stop prometheus

# 执行 clean-tombstones
docker run --rm -v prometheus_data:/prometheus prom/prometheus:v2.48.0 \
  promtool tsdb clean-tombstones /prometheus

# 重新启动
docker compose start prometheus
```

**Step 2：如果仍有问题，定位损坏的 WAL 段**

```bash
# 查看 WAL 目录
ls -la /prometheus/wal/
# 输出示例：
# 00000123  00000124  00000125  checkpoint.00000122
```

**Step 3：删除损坏的 WAL 段**

```bash
# 删除最后一个 WAL 段（最可能是损坏的那个）
docker compose stop prometheus
docker exec ... rm /prometheus/wal/00000125
docker compose start prometheus
# 观察日志中是否显示 WAL replay 成功
```

### 预防措施

1. 启用 WAL 压缩：`--storage.tsdb.wal-compression`
2. 使用健康存储（SSD，避免 NFS 等网络存储）
3. 定期备份：备份整个 TSDB 目录
4. 使用 Thanos/VM 作为长期存储，Prometheus 本地只做短期缓存

## PromQL 排障速查

```promql
# 查看当前内存中的序列数
prometheus_tsdb_head_series

# 查看已加载的 Block 数
prometheus_tsdb_blocks_loaded

# 查看 scrape 耗时
scrape_duration_seconds

# 查看 scrape 是否失败
scrape_samples_scraped == 0

# 查看 WAL 写入速度
rate(prometheus_tsdb_wal_writes_total[5m])

# 查看查询延迟
prometheus_engine_query_duration_seconds
```

## 本章小结

- 高基数诊断三步法：promtool tsdb analyze → /api/v1/status/tsdb → relabeling 止血
- 抓取失败排查链：Targets 页面 → 日志 → curl 调试 → 调优参数
- TSDB 修复原则：优先无损方案，接受的最高代价是丢失 2h 数据
- 预防比修复更重要：基数预算、存储告警、定期备份
- 实践：[排障实验](../labs/ch09-troubleshooting/README.md)