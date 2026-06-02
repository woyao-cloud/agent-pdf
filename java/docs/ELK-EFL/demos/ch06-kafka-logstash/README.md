# 第6章：Filebeat → Kafka → Logstash → ES

## 目标

演示企业级高吞吐日志架构：Filebeat 采集日志到 Kafka，Logstash 从 Kafka 消费并清洗数据后写入 ES。

## 前置依赖

- 共享基础设施已启动（包括 Kafka 和 Logstash）
- 第3章的 Spring Boot 应用已启动

## 启动步骤

```bash
# 1. 确保共享基础设施和 Spring Boot 应用已启动

# 2. 基础设施中的 Logstash 已自动加载配置
# 配置路径：ch06-kafka-logstash/logstash/pipeline/logstash.conf

# 3. 发送测试日志（直接向 Kafka 发送模拟数据）
docker exec kafka bash -c '
echo "{\"@timestamp\":\"2024-01-15T10:00:00Z\",\"level\":\"INFO\",\"message\":\"测试日志\",\"serviceName\":\"test-service\"}" | \
kafka-console-producer --broker-list localhost:9092 --topic app-logs
'

# 4. 查看 Logstash 是否在消费
docker logs logstash --tail 20
```

## 验证方法

```bash
# 5. 在 ES 中搜索（ERROR 级别路由到 app-logs-error-* 索引）
curl "http://localhost:9200/app-logs-*/_search?pretty"

# 6. 查看 Kafka 中积压的消息数
docker exec kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group logstash-elk \
  --describe
```

## 架构示意图

```
Filebeat → Kafka (topic: app-logs) → Logstash → ES (索引: app-logs-*)
                                              → ES (索引: app-logs-error-*)
                                              → DLQ (死信队列文件)
```

## 配置说明

| 组件 | 配置项 | 值 | 说明 |
|------|-------|----|----|
| Filebeat | output.kafka.topic | app-logs | 发送到 Kafka |
| Kafka | topic | app-logs | 3 分区 |
| Logstash | input.kafka | group_id: logstash-elk | 消费组 |
| Logstash | filter.mutate | gsub 手机号 | 数据脱敏 |
| Logstash | output | 按 level 路由索引 | ERROR→独立索引 |

## 清理

```bash
# 停止并清理数据
docker compose -f ../../docker-compose.yml down -v
```