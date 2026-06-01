# 第13章 死信队列与重试

## 场景描述

在消息处理中，某些消息可能因为各种原因（依赖服务不可用、数据格式错误、业务校验失败）处理失败。死信队列（DLQ）和重试机制是处理这些失败消息的标准方案。

### 解决的问题

```
无重试机制：
消息消费失败 → 消息丢失 → 数据不一致

有重试机制：
消息消费失败 → 重试3次 → 仍失败 → 进入死信队列 → 人工介入/补偿

死信队列的价值：
1. 故障隔离：失败消息不影响正常消息处理
2. 问题追踪：保留失败消息的完整信息
3. 自动恢复：修复问题后重新入队
4. 延迟处理：使用重试Topic实现延迟重试
```

### 实现原理

**重试和死信队列架构**：

```
主Topic → 消费者处理
           ↓ 失败
        重试Topic（延迟消费）→ 再次处理
           ↓ 重试耗尽
        死信Topic（DLQ）→ 人工介入或自动补偿
```

**重试策略**：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| 立即重试 | 失败后立即重试3次 | 临时性故障 |
| 延迟重试 | 指数退避（1s, 2s, 4s...） | 下游服务限流 |
| 阶梯重试 | 固定间隔（5s, 30s, 5min） | 网络抖动 |
| 分区重试 | 将失败消息发送到重试分区 | 可控制重试顺序 |

### Docker Compose

```yaml
# docker/scenario-13-dlq/docker-compose.yml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  # 创建DLQ相关Topic
  kafka-setup:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [kafka]
    entrypoint: ["/bin/bash", "-c", "
      kafka-topics --create --topic orders --bootstrap-server kafka:9092 --partitions 3 --if-not-exists;
      kafka-topics --create --topic orders-retry --bootstrap-server kafka:9092 --partitions 3 --config cleanup.policy=compact --if-not-exists;
      kafka-topics --create --topic orders-dlq --bootstrap-server kafka:9092 --partitions 3 --if-not-exists;
      echo 'Topics created successfully'
    "]
```

### Java示例代码

```java
// ============ 1. Spring Kafka重试配置 ============
@Configuration
public class KafkaRetryConfig {
    
    // 非阻塞重试（发送到重试Topic）
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> 
            retryContainerFactory(ConsumerFactory<String, Object> factory) {
        ConcurrentKafkaListenerContainerFactory<String, Object> containerFactory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        containerFactory.setConsumerFactory(factory);
        
        // 配置重试
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
            new FixedBackOff(1000L, 3)  // 1秒后重试，最多3次
        );
        
        // 配置死信Topic
        errorHandler.addNotRetryableExceptions(NullPointerException.class);
        errorHandler.setRetryListeners((record, ex, deliveryAttempt) -> {
            log.warn("重试第{}次: topic={}, key={}, offset={}", 
                deliveryAttempt, record.topic(), record.key(), record.offset());
        });
        
        containerFactory.setCommonErrorHandler(errorHandler);
        return containerFactory;
    }
}

// ============ 2. 消费者重试处理 ============
@Service
public class OrderProcessor {
    
    private static final int MAX_RETRIES = 3;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // 方式一：使用Spring @RetryableTopic（自动重试+DLQ）
    @RetryableTopic(
        attempts = "4",  // 1次正常 + 3次重试
        backoff = @Backoff(delay = 1000, multiplier = 2.0),  // 1s, 2s, 4s
        autoCreateTopics = "true",
        dltTopicSuffix = "-dlq"
    )
    @KafkaListener(topics = "orders", groupId = "order-processor")
    public void processOrder(Order order) {
        processOrderInternal(order);
    }
    
    // 最终进入DLQ的处理
    @DltHandler
    public void handleDlt(Order order, @Header(KafkaHeaders.RECEIVED_TOPIC) String topic) {
        log.error("消息进入死信队列: topic={}, orderId={}", topic, order.getId());
        // 告警通知
        alertService.sendAlert("Order processing failed after retries", order);
    }
    
    // 方式二：手动实现重试机制
    @KafkaListener(topics = "orders", groupId = "order-manual")
    public void processOrderManual(ConsumerRecord<String, Order> record) {
        Order order = record.value();
        
        try {
            processOrderInternal(order);
        } catch (RetryableException e) {
            // 可重试异常
            int retryCount = getRetryCount(record.headers());
            
            if (retryCount < MAX_RETRIES) {
                // 发送到重试Topic（带重试次数）
                ProducerRecord<String, Order> retryRecord = 
                    new ProducerRecord<>("orders-retry", order.getId(), order);
                retryRecord.headers().add("retry-count", 
                    String.valueOf(retryCount + 1).getBytes());
                retryRecord.headers().add("original-topic", 
                    record.topic().getBytes());
                kafkaTemplate.send(retryRecord);
            } else {
                // 超过最大重试次数，发送到DLQ
                kafkaTemplate.send("orders-dlq", order.getId(), 
                    new DeadLetterRecord(order, e, retryCount));
            }
        } catch (NonRetryableException e) {
            // 不可重试异常，直接发送到DLQ
            kafkaTemplate.send("orders-dlq", order.getId(), 
                new DeadLetterRecord(order, e, 0));
        }
    }
    
    private int getRetryCount(Headers headers) {
        Header header = headers.lastHeader("retry-count");
        if (header == null) return 0;
        return Integer.parseInt(new String(header.value()));
    }
    
    private void processOrderInternal(Order order) {
        // 区分可重试和不可重试异常
        try {
            paymentService.processPayment(order.getPayment());
            inventoryService.deductStock(order.getItems());
        } catch (TimeoutException | ServiceUnavailableException e) {
            throw new RetryableException("临时故障", e);
        } catch (InvalidOrderException e) {
            throw new NonRetryableException("订单数据错误", e);
        }
    }
}

// ============ 3. 自定义重试策略 ============
@Component
public class CustomRetryTemplate {
    
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    /**
     * 指数退避重试
     * 第1次失败：1秒后重试
     * 第2次失败：2秒后重试
     * 第3次失败：4秒后重试
     * 第4次失败：8秒后重试
     */
    public <T> void sendWithRetry(String topic, String key, T value) {
        kafkaTemplate.send(topic, key, value)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("发送失败，开始重试: topic={}, key={}", topic, key);
                    scheduleRetry(topic, key, value, 1);
                }
            });
    }
    
    private <T> void scheduleRetry(String topic, String key, T value, int attempt) {
        if (attempt > 5) {
            log.error("超过最大重试次数，发送到DLQ: topic={}, key={}", topic, key);
            kafkaTemplate.send(topic + "-dlq", key, value);
            return;
        }
        
        // 计算延迟时间：指数退避
        long delay = (long) Math.pow(2, attempt) * 1000;
        
        CompletableFuture.delayedExecutor(delay, TimeUnit.MILLISECONDS)
            .execute(() -> {
                sendWithRetry(topic, key, value);
            });
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **重试风暴** | 大规模失败导致重试放大 | 分级重试、熔断机制 |
| **消息顺序** | 重试消息可能带来顺序问题 | 同key路由同分区、记录顺序号 |
| **死信堆积** | DLQ消息无人处理 | 设置DLQ监控告警、定期巡检 |
| **循环重试** | 重试永不停止 | 设置重试上限、断路器 |

**重试隔离配置**：
```yaml
spring:
  kafka:
    consumer:
      # 为每个重试级别创建独立的Listener
      group-id: order-processor-${retry.level:0}
    
    # 重试Topic配置
    retry:
      topic:
        attempts: 4
        backoff:
          delay: 1000
          multiplier: 2
        # 重试Topic命名规则
        suffix: -retry
```

### 典型问题处理

**问题：如何区分可重试和不可重试异常？**

```
可重试异常（临时故障）：
- TimeoutException：下游服务超时
- ServiceUnavailableException：服务暂时不可用
- NetworkException：网络闪断

不可重试异常（业务错误）：
- InvalidOrderException：订单数据校验失败
- DuplicateKeyException：主键冲突（重复消息）
- ValidationException：业务规则违反

处理原则：
- 可重试：指数退避重试3-5次
- 不可重试：直接进入DLQ
- 不确定：重试1次后进入DLQ
```

### 关键技能

- 掌握Spring Kafka的@RetryableTopic和DLQ机制
- 理解指数退避和熔断策略
- 掌握可重试/不可重试异常的区分
- 熟悉死信队列的监控和补偿处理
- 理解重试场景下的消息顺序保证