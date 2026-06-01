# 第3章 生产与消费

## 3.1 生产者原理

### 解决的问题

生产者是数据的入口。理解生产者的工作流程和配置调优，是保证数据可靠性和吞吐量的关键。

> **核心价值**：掌握生产者核心参数和发送模式，确保消息不丢失、不重复。

### 发送流程

```
Producer创建 → 序列化 → 分区选择 → 批量打包 → 发送到Broker
                                         ↓
                                    acks确认
```

### 三种发送模式

```java
// 1. 发后即忘（Fire-and-Forget）—— 吞吐最高，可能丢消息
producer.send(new ProducerRecord<>("topic", "key", "value"));

// 2. 同步发送 —— 可靠，吞吐最低
RecordMetadata metadata = producer.send(
    new ProducerRecord<>("topic", "key", "value")).get();

// 3. 异步回调 —— 可靠与吞吐的平衡
producer.send(new ProducerRecord<>("topic", "key", "value"),
    (metadata, exception) -> {
        if (exception != null) {
            log.error("发送失败", exception);
        }
    });
```

### 核心参数调优

```java
Properties props = new Properties();
// 可靠性
props.put("acks", "all");                    // 等待所有副本确认
props.put("retries", 3);                     // 重试次数
props.put("enable.idempotence", true);       // 幂等性（精确一次）
props.put("max.in.flight.requests.per.connection", 5);

// 吞吐量
props.put("batch.size", 32 * 1024);          // 32KB批量
props.put("linger.ms", 10);                  // 等待10ms
props.put("compression.type", "snappy");     // 压缩
props.put("buffer.memory", 64 * 1024 * 1024L); // 64MB缓冲区
```

## 3.2 消费者原理

### 消费模式

Kafka使用**pull模式**，消费者主动从Broker拉取数据。这与RabbitMQ的push模式不同。

```
// pull模式的优点：
// 1. 消费者自己控制消费速度（不会背压）
// 2. 可以批量拉取，提高效率
// 3. 消费者可以自主选择从哪个offset开始消费
```

### 提交策略

```java
// 1. 自动提交（可能重复消费）
props.put("enable.auto.commit", "true");
props.put("auto.commit.interval.ms", "5000");

// 2. 手动同步提交（推荐）
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    process(records);
    consumer.commitSync();  // 处理完再提交
}

// 3. 手动异步提交
consumer.commitAsync((offsets, exception) -> {
    if (exception != null) {
        log.error("提交失败", exception);
    }
});
```

### 再均衡监听器

```java
consumer.subscribe(Arrays.asList("topic"), new ConsumerRebalanceListener() {
    @Override
    public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
        // 在再均衡前提交当前offset
        consumer.commitSync(currentOffsets);
    }
    
    @Override
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
        // 分配新分区后的处理
    }
});
```

### 潜在风险

| 风险 | 原因 | 解决方案 |
|------|------|---------|
| 消息丢失 | 自动提交offset | 改为手动提交 |
| 重复消费 | 提交offset失败 | 消费幂等性设计 |
| 消费积压 | 消费速度<生产速度 | 增加分区/消费者，优化处理逻辑 |
| 再均衡风暴 | 频繁Rebalance | 调整session.timeout.ms和heartbeat.interval.ms |

## 3.3 序列化与反序列化

```java
// 自定义序列化器
public class UserSerializer implements Serializer<User> {
    @Override
    public byte[] serialize(String topic, User data) {
        byte[] bytes = new byte[4 + data.getName().getBytes().length];
        // ... 序列化逻辑
        return bytes;
    }
}
```

**推荐使用Avro/Protobuf/JSON**替代Java原生序列化：

```properties
# 使用Avro序列化
value.serializer=io.confluent.kafka.serializers.KafkaAvroSerializer
schema.registry.url=http://schema-registry:8081
```
