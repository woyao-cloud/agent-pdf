# 第13章 死信队列与重试

## 13.1 场景故事：支付通知的可靠性

### 一次失败的支付回调

在支付系统中，银行回调通知的幂等处理是经典难题。假设银行的回调请求每秒到达数十次，每次回调需要调用多个下游接口（更新订单状态、通知用户、触发物流等）。如果某个下游接口因为瞬时故障（数据库连接池满、GC停顿等）返回超时，生产者（业务代码）应该怎么办？

如果直接重试，可能因为下游还没有恢复而导致连环失败。如果不重试，这条支付成功的消息就丢失了，用户付了款但订单状态永远不会更新。

重试机制解决了这个两难问题。**可重试的异常（临时故障）采用指数退避重试；不可重试的异常（业务错误）进入死信队列。**

## 13.2 实现原理

### 重试策略对比

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| 立即重试 | 失败后立即重试3次 | 临时网络抖动 |
| 指数退避 | 1s, 2s, 4s, 8s... | 下游服务负载高 |
| 固定间隔 | 每次等待固定时间 | 已知恢复时间 |
| 阶梯重试 | 5s, 30s, 5min | 不同级别的问题 |

指数退避是生产环境中最常用的策略。它的核心思想是：如果下游服务暂时不可用，给它一些时间恢复。重试间隔逐渐增加，避免在服务刚恢复时又立即被请求淹没。

### 重试Topic机制

Spring Kafka的 `@RetryableTopic` 注解的底层原理是：当消息处理失败时，框架将消息重新发送到一个重试Topic。这个重试Topic与主Topic可以有独立的配置，包括不同的保留策略和分区数。

```
主Topic "orders" → 消费者（处理失败）
                    ↓
               重试Topic "orders-retry" → 延迟消费 → 再次处理
                                                ↓
                                          死信Topic "orders-dlq" → 告警/人工
```

重试Topic的消费者延迟消费的原理：在消息中设置一个"下次执行时间"的时间戳，消费者只在到达这个时间戳后才处理消息。在Kafka原生机制中，这是通过消息头中的时间戳字段实现的，消费者需要自行判断。

## 13.3 完整代码实现

### Spring Kafka重试配置

```java
@Configuration
public class KafkaRetryConfig {
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object>
            retryContainerFactory(ConsumerFactory<String, Object> factory) {
        
        ConcurrentKafkaListenerContainerFactory<String, Object> factory =
            new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        
        // 配置重试：固定等待1秒，最多重试3次
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
            new FixedBackOff(1000L, 3)
        );
        
        // 不可重试的异常：直接跳过重试，进入DLQ
        errorHandler.addNotRetryableExceptions(NullPointerException.class,
            InvalidMessageException.class, ValidationException.class);
        
        // 可重试的异常：默认行为（指数退避重试）
        // TimeoutException、ServiceUnavailableException 等自动重试
        
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}

@Service
public class OrderProcessor {
    
    // 方式一：使用 @RetryableTopic 注解（自动管理重试和DLQ Topic）
    @RetryableTopic(
        attempts = "4",                      // 1次正常 + 3次重试
        backoff = @Backoff(delay = 1000, multiplier = 2.0),
        autoCreateTopics = "true",
        dltTopicSuffix = "-dlq"
    )
    @KafkaListener(topics = "orders", groupId = "order-processor")
    public void processOrder(Order order) {
        // 业务处理
        paymentService.processPayment(order.getPayment());
    }
    
    // 所有重试都失败后，消息最终进入DLQ，此方法处理
    @DltHandler
    public void handleDlt(Order order) {
        log.error("订单处理连续失败，已进入死信队列: orderId={}", order.getId());
        alertService.sendAlert("订单处理失败", order);
    }
    
    // 方式二：手动控制重试（更灵活）
    @KafkaListener(topics = "orders", groupId = "order-processor-manual")
    public void processOrderManual(ConsumerRecord<String, Order> record) {
        try {
            process(record.value());
        } catch (RetryableException e) {
            handleRetryableFailure(record);
        } catch (NonRetryableException e) {
            handleNonRetryableFailure(record);
        }
    }
    
    private void handleRetryableFailure(ConsumerRecord<String, Order> record) {
        int retryCount = getRetryCount(record.headers());
        if (retryCount < 3) {
            // 发送到重试Topic（带重试次数和下次执行时间）
            ProducerRecord<String, Order> retryRecord = 
                new ProducerRecord<>("orders-retry", record.value());
            retryRecord.headers().add("retry-count", 
                String.valueOf(retryCount + 1).getBytes());
            retryRecord.headers().add("next-execute-time",
                String.valueOf(System.currentTimeMillis() + 2000).getBytes());
            kafkaTemplate.send(retryRecord);
        } else {
            kafkaTemplate.send("orders-dlq", record.value());
        }
    }
    
    private void handleNonRetryableFailure(ConsumerRecord<String, Order> record) {
        kafkaTemplate.send("orders-dlq", record.value());
    }
}
```

### 可重试与不可重试异常的区分

```java
// 可重试异常（临时故障）
// - TimeoutException: 下游服务超时
// - ServiceUnavailableException: 服务暂时不可用
// - NetworkException: 网络闪断
// - DatabaseConnectionException: 数据库连接池满

// 不可重试异常（业务错误）
// - InvalidOrderException: 订单数据校验失败
// - DuplicateKeyException: 主键冲突
// - ValidationException: 业务规则违反
// - NullPointerException: 空指针（通常是Bug）

// 不确定的异常：重试1次后进入DLQ
```

## 13.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 重试风暴 | 大规模失败导致重试放大 | 分级重试、熔断机制 |
| 消息顺序 | 重试消息可能带来顺序问题 | 同key路由同分区 |
| 死信堆积 | DLQ消息无人处理 | 设置DLQ监控告警 |

重试风暴是最严重的问题。当某个下游服务大面积故障时，所有消费者同时重试，大量的重试消息涌入Kafka，可能压垮整个集群。解决方案：配合断路器（Circuit Breaker）使用——当下游服务故障率达到阈值时，快速失败（不重试），直到服务恢复。