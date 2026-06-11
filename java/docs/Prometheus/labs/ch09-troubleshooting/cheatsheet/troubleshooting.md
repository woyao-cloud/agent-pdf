# Prometheus 排障命令速查表

## 高基数诊断

```bash
# 分析 TSDB，查看 Top 10 高基数指标
promtool tsdb analyze /prometheus --limit=10

# 通过 API 获取序列数统计
curl -s http://localhost:9090/api/v1/status/tsdb | python -m json.tool

# 查看当前内存中的序列数
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_series

# 紧急止血：动态修改 scrape 配置（不需要重启）
# 在 prometheus.yml 中添加 metric_relabel_configs，然后 reload
curl -X POST http://localhost:9090/-/reload
```

## 抓取失败排查

```bash
# 查看 scrape 相关日志
docker logs prometheus 2>&1 | grep -E "scrape|error|timeout" | tail -50

# 手动模拟 scrape
curl -s -o /dev/null -w "HTTP %{http_code}, Time: %{time_total}s, Size: %{size_download}B\n" \
  http://target:8080/metrics

# 查看 scrape 持续时间
rate(scrape_duration_seconds[5m])

# 查看抓取失败的 target
scrape_samples_scraped == 0
```

## TSDB 修复

```bash
# 无损修复（清理 tombstones）
promtool tsdb clean-tombstones /prometheus

# 检查 Block 元数据
promtool tsdb check-meta /prometheus

# 列出所有 Block
promtool tsdb list /prometheus

# 强制删除 WAL 段（丢失最多 2h 数据）
rm -rf /prometheus/wal/
```

## 性能监控

```promql
# TSDB 健康指标
prometheus_tsdb_head_series              # 内存序列数
prometheus_tsdb_blocks_loaded            # Block 数
prometheus_tsdb_wal_writes_total         # WAL 写入量
prometheus_engine_query_duration_seconds # 查询延迟
prometheus_tsdb_compactions_total        # Compaction 次数

# Remote Write 健康
prometheus_remote_storage_shards
prometheus_remote_storage_samples_pending
rate(prometheus_remote_storage_failed_samples_total[5m])
```

## 快速恢复流程

```
高基数 OOM  → promtool tsdb analyze 找到问题指标 → relabeling Drop
抓取失败    → Targets 页面检查 → 日志定位原因 → 调优 interval/timeout
TSDB 损坏   → clean-tombstones → 删除损坏 WAL → （极端）删除 WAL 目录
```