# 第18章 开发者核心技能

## 18.1 Spring Kafka

### 核心注解

```java
@KafkaListener        // 声明消费者方法
@KafkaHandler         // 类级别的@KafkaListener中区分方法
@RetryableTopic       // 声明重试Topic
@DltHandler           // 死信队列处理器
@Header               // 获取消息头
@Payload              // 获取消息体
@SendTo               // 将结果发送到指定Topic
```

### 自动配置

```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
    consumer:
      group-id: my-group
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "*"
    listener:
      ack-mode: MANUAL_IMMEDIATE
      concurrency: 3
```

## 18.2 命令行工具

```bash
# Topic管理
kafka-topics.sh --bootstrap-server localhost:9092 --list
kafka-topics.sh --create --topic test --partitions 3 --replication-factor 1
kafka-topics.sh --alter --topic test --partitions 6
kafka-topics.sh --describe --topic test

# 生产者/消费者
kafka-console-producer.sh --bootstrap-server localhost:9092 --topic test
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic test --from-beginning

# 消费者组管理
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list
kafka-consumer-groups.sh --describe --group my-group
kafka-consumer-groups.sh --reset-offsets --group my-group --topic test --to-earliest --execute

# 配置管理
kafka-configs.sh --bootstrap-server localhost:9092 --entity-type topics --entity-name test --describe
```

## 18.3 Kafka Streams API要点

```java
// 掌握以下核心操作
KStream: filter, map, flatMap, groupByKey, join
KTable: aggregate, reduce, count, toStream
Window: tumblingWindow, slidingWindow, sessionWindow
StateStore: KeyValueStore, WindowStore
Processor: process, transform, suppress
```

## 18.4 核心配置速查

| 配置 | 推荐值 | 说明 |
|------|--------|------|
| acks | all | 最强可靠性 |
| retries | 3 | 重试次数 |
| enable.idempotence | true | 幂等性 |
| compression.type | snappy | 压缩 |
| max.request.size | 1MB (default) | 消息大小限制 |
| group.id | 业务含义命名 | 消费者组 |
| auto.offset.reset | earliest/latest | 起始位置 |
| enable.auto.commit | false | 手动提交 |
| max.poll.records | 500 | 批处理 |

## 18.5 异常处理指南

```java
// RetryableException（临时故障）
// - 网络超时 TimeoutException
// - 服务不可用 ServiceUnavailableException  
// - Broker不可用 NotLeaderOrFollowerException
// 处理：指数退避重试

// NonRetryableException（不可重试）
// - 序列化异常 SerializationException
// - 认证异常 AuthenticationException
// - 消息过大 RecordTooLargeException
// 处理：直接DLQ

// KafkaException（通用异常包装）
// 处理：检查cause判断是否可重试
```

## 18.6 学习路径

```
Level 1: 能发送和消费消息
  - 掌握Producer/Consumer API
  - 理解Topic/Partition/Offset概念

Level 2: 能处理异常场景
  - 掌握重试和死信队列
  - 理解offset提交策略
  - 掌握幂等消费

Level 3: 能设计消息架构
  - 掌握Kafka Streams
  - 掌握Kafka Connect
  - 理解事务和Exactly-Once

Level 4: 能运维和调优
  - 掌握集群监控
  - 理解性能调优
  - 掌握故障恢复
```