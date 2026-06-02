# 第14章：采集端问题排查

## 排查命令速查

```bash
# Filebeat 状态
docker logs filebeat --tail 50

# Kafka Lag 检查
bash ch14-troubleshoot-agent/check-kafka-lag.sh

# ES 写入线程池
curl "http://localhost:9200/_cat/thread_pool/write?v"

# ES 磁盘使用率
curl "http://localhost:9200/_cat/allocation?v"
```

## 常见问题

| 问题 | 排查 | 解决 |
|------|------|------|
| 日志重复/丢失 | 检查 Registry | 挂载数据卷持久化 |
| Lag 上涨 | check-kafka-lag.sh | 增加 Logstash workers |
| OOM | 查看容器内存 | truncate_fields 截断 |
| 异常栈被拆分 | Kibana 中检查 | 配置 multiline |

## 模拟日志暴涨

```bash
bash ch14-troubleshoot-agent/simulate-log-surge.sh 5000
```