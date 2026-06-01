# 第18章 开发者核心技能

## 18.1 Spring Kafka最佳实践

### 核心注解速查

| 注解 | 用途 | 关键属性 |
|------|------|---------|
| `@KafkaListener` | 声明消费者方法 | topics, groupId, containerFactory |
| `@RetryableTopic` | 声明重试Topic | attempts, backoff, dltTopicSuffix |
| `@DltHandler` | 处理死信消息 | 无额外属性 |
| `@Header` | 获取消息头 | value（如KafkaHeaders.OFFSET） |
| `@Payload` | 获取消息体 | 无额外属性（默认） |

### 配置模板

```yaml
# application.yml 完整配置模板
spring:
  kafka:
    bootstrap-servers: 
      - broker1:9092
      - broker2:9092
      - broker3:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
        compression.type: snappy
        batch.size: 32768
        linger.ms: 10
    consumer:
      group-id: ${spring.application.name}
      auto-offset-reset: earliest
      enable-auto-commit: false
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.example.*"
        isolation.level: read_committed
    listener:
      ack-mode: MANUAL_IMMEDIATE
      concurrency: 3
      missing-topics-fatal: false
```

### 异常处理分类

```java
// RetryableException（临时故障·应重试）
// - TimeoutException: 网络超时，下游服务未响应
// - ServiceUnavailableException: 服务暂时不可用（HTTP 503）
// - NotLeaderOrFollowerException: Broker Leader切换中
// 处理策略：指数退避重试，通常3-5次

// NonRetryableException（不可重试·直接DLQ）
// - SerializationException: 消息序列化/反序列化失败
// - AuthenticationException: 认证失败
// - RecordTooLargeException: 消息超过大小限制
// - NullPointerException: 业务代码Bug
// 处理策略：直接进入DLQ，记录错误信息

// 判断原则：不确定的异常，重试1次后进入DLQ
```

## 18.2 命令行工具速查

```bash
# 查看集群状态
kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# 查看Topic列表和详情
kafka-topics.sh --bootstrap-server localhost:9092 --list
kafka-topics.sh --describe --topic orders

# 查看消费者组和Lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list
kafka-consumer-groups.sh --describe --group my-group

# 生产/消费消息（测试用）
kafka-console-producer.sh --topic test --bootstrap-server localhost:9092
kafka-console-consumer.sh --topic test --from-beginning --bootstrap-server localhost:9092

# 动态修改Topic配置
kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --entity-type topics --entity-name orders \
  --add-config retention.ms=86400000
```

## 18.3 学习路径

```
Level 1: 基础阶段
  - 掌握Producer/Consumer API
  - 理解Topic/Partition/Offset概念
  - 能使用Spring Kafka发送和消费消息

Level 2: 进阶阶段
  - 掌握重试和死信队列
  - 理解offset提交策略（手动/自动）
  - 掌握幂等消费实现
  - 掌握Kafka Streams基础操作

Level 3: 架构阶段
  - 掌握Kafka Connect（Source/Sink Connector）
  - 理解事务和Exactly-Once
  - 掌握CDC方案（Debezium）
  - 能够设计高可用消息架构

Level 4: 专家阶段
  - 掌握集群监控和性能调优
  - 理解操作系统级别优化
  - 掌握故障恢复和容量规划
  - 能设计和运维大规模Kafka集群
```