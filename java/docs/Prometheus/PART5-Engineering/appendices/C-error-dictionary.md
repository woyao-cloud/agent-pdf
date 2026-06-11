# 附录 C：Prometheus 常见报错日志字典与排查 Checklist

## 启动错误

| 错误日志 | 含义 | 解决 |
|---------|------|------|
| `open /prometheus/wal/...: permission denied` | 数据目录权限不足 | `chmod -R 777 /prometheus` 或用正确用户运行 |
| `tsdb: invalid magic number in block` | Block 文件损坏 | 删除损坏的 Block，让 Prometheus 重建 |
| `failed to open config file: ...` | 配置文件路径错误 | 检查 --config.file 参数路径 |
| `error loading config: couldn't parse ...` | YAML 语法错误 | 用 `promtool check config` 验证 |
| `listen tcp :9090: bind: address already in use` | 端口被占用 | `lsof -i :9090` 找出占用进程 |

## 运行时错误

| 错误日志 | 含义 | 解决 |
|---------|------|------|
| `Error scraping target: context deadline exceeded` | scrape 超时 | 增大 scrape_timeout 或优化目标响应速度 |
| `Error reading target: connection refused` | 目标拒绝连接 | 检查目标服务是否运行 |
| `Error on ingesting samples ... sample with same timestamp` | 重复样本（通常在 Remote Write 时出现）| 检查是否多个 Prometheus 写入同一远端 |
| `WAL truncation failed: cut segment` | WAL 段损坏 | 删除损坏的 WAL 段 |
| `TSDB head is out of order` | 时间戳顺序错乱 | 检查是否有系统时间跳变 |

## 配置检查

```bash
# 使用 promtool 验证配置
promtool check config prometheus.yml

# 验证告警规则
promtool check rules rules/alerts.yml

# 测试 PromQL 查询
promtool test rules test.yml
```

## 性能 checklist

- [ ] `prometheus_tsdb_head_series` < 100000
- [ ] `scrape_duration_seconds` < scrape_timeout
- [ ] GC 占 CPU 比例 < 10%
- [ ] Remote Write pending samples 没有持续增长
- [ ] 查询 `prometheus_engine_query_duration_seconds` 的 P99 < 1s
- [ ] 磁盘 I/O 利用率 < 80%