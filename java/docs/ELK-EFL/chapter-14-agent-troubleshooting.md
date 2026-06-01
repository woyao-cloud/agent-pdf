# 第14章 采集端与缓冲层典型问题

## 14.1 Filebeat Registry 损坏

```yaml
# 症状：日志重复采集或漏采
# 根因：Registry 文件损坏或丢失
# 解决：

# 1. 查看 Registry 状态
filebeat export registry

# 2. 清理损坏的 Registry
filebeat -e -strict.perms=false \
  -c /usr/share/filebeat/filebeat.yml \
  -configtest

# 3. 备份 Registry 并重启
docker restart filebeat

# 预防：Registry 文件所在数据卷必须持久化
```

---

## 14.2 Kafka 消费 Lag 持续飙升

```bash
# 查看 Kafka 消费者 Lag
docker exec kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group logstash-elk \
  --describe

# 输出：
# TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# app-logs   0          15000           18000           3000
# app-logs   1          15000           18000           3000
# app-logs   2          15000           18000           3000

# Lag > 0 说明 Logstash 消费速度 < Kafka 写入速度
# 解决方案：
# 1. 增加 Logstash pipeline.workers
# 2. 增大 batch.size
# 3. 检查 Grok 正则性能（正则回溯灾难）
```

---

## 14.3 单条日志过大导致 OOM

```yaml
# 症状：Filebeat 或 Logstash OOM
# 根因：超长 SQL、大型 JSON 或异常栈
# 解决方案：配置 max_bytes 截断

# Filebeat 配置——单条日志最大 10KB
filebeat.inputs:
  - type: log
    # 限制单行最大长度（超过的截断）
    line_number: false
    # 在 processors 中截断
processors:
  - truncate_fields:
      fields: message
      max_length: 10000
```

---

## 本章总结

采集端的问题通常表现为"日志少了"或"日志慢了"。Registry 持久化、Lag 监控、单行大小限制是三个最关键的预防措施。