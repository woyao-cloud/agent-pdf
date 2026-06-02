# 第15章：ES 写入与查询灾难排查

## 排查命令速查

```bash
# 1. 配置了执行权限
chmod +x ch15-troubleshoot-es/check-es-health.sh

# 2. 检查集群健康
bash ch15-troubleshoot-es/check-es-health.sh

# 3. 查看未分配分片
curl "http://localhost:9200/_cluster/allocation/explain?pretty"

# 4. 紧急调整磁盘水位线
curl -X PUT "http://localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d '{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%"
  }
}'

# 5. 查看线程池状态
curl "http://localhost:9200/_cat/thread_pool/write?v"
```

## 常见问题

| 问题 | 原因 | 紧急措施 |
|------|------|---------|
| 写入拒绝 | 线程池队列满 | 调大 queue_size + 增大 refresh_interval |
| Yellow/Red | 磁盘水位线/节点掉线 | 调整水位线/重启节点 |
| 查询超时 | 深度分页/跨索引过多 | 改用 search_after/加时间过滤 |