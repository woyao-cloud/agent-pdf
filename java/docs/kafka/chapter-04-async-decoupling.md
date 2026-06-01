# 第4章 异步消息解耦

## 场景描述

异步消息解耦是Kafka最经典的应用场景。当服务A的操作需要触发服务B和服务C的执行，但不需要立即等待它们的执行结果时，可以通过Kafka将服务A与服务B/C解耦。

### 解决的问题

**同步调用的痛点**：
```
用户下单 → 订单服务 → 通知库存服务 → 通知物流服务 → 通知积分服务
                        ↓
                  等待所有响应 → 响应变慢 → 依赖链故障级联
```

**Kafka解耦后**：
```
用户下单 → 订单服务 → [订单事件Topic] → 库存服务（异步消费）
                                       → 物流服务（异步消费）
                                       → 积分服务（异步消费）
```

### 实现原理

**核心模式**：事件驱动、异步处理、最终一致性。

```
生产者（订单服务）
  ↓ 发布 order_created 事件
[Topic: orders]
  ↓ 订阅
消费者组 A（库存服务）→ 扣减库存
消费者组 B（物流服务）→ 创建物流单
消费者组 C（积分服务）→ 增加积分
```

### Docker Compose

```yaml
# docker/scenario-04-async/docker-compose.yml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  # 使用Kafka UI（可选）
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
```

### Java示例代码

```java
// ============ 1. 引入依赖 ============
// pom.xml
// <dependency>
//     <groupId>org.springframework.kafka</groupId>
//     <artifactId>spring-kafka</artifactId>
//     <version>3.0.0</version>
// </dependency>

// ============ 2. 生产者配置 ============
@Configuration
public class KafkaProducerConfig {
    
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.RETRIES_CONFIG, 3);
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        return new DefaultKafkaProducerFactory<>(props);
    }
    
    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}

// ============ 3. 事件发布 ============
@Service
public class OrderEventPublisher {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    public void publishOrderCreated(OrderCreatedEvent event) {
        kafkaTemplate.send("order-events", event.getOrderId(), event)
            .whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("订单事件发送成功: {}, offset={}", 
                        event.getOrderId(), result.getRecordMetadata().offset());
                } else {
                    log.error("订单事件发送失败: {}", event.getOrderId(), ex);
                }
            });
    }
}

// ============ 4. 消费者（库存服务） ============
@Service
public class InventoryConsumer {
    
    @KafkaListener(topics = "order-events", groupId = "inventory-service")
    public void consumeOrderEvent(OrderCreatedEvent event, 
                                   @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                                   @Header(KafkaHeaders.OFFSET) long offset) {
        try {
            log.info("库存服务处理订单: {}, partition={}, offset={}", 
                event.getOrderId(), partition, offset);
            inventoryService.deductStock(event.getOrderId(), event.getItems());
            // 手动确认（如果enable.auto.commit=false）
        } catch (Exception e) {
            log.error("库存扣减失败", e);
            // 发送到死信队列
            kafkaTemplate.send("order-events-dlq", event);
        }
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **消息丢失** | 生产者未确认就返回 | acks=all + 幂等性 |
| **重复消费** | 消费者处理成功但提交offset失败 | 消费接口幂等性设计 |
| **消息积压** | 消费速度跟不上生产速度 | 增加分区和消费者 |
| **顺序问题** | 同一订单的事件乱序 | 相同key路由到同一分区 |

**幂等性设计示例**：
```java
// 使用订单状态机保证幂等
public void processOrder(String orderId, OrderEvent event) {
    Order order = orderRepository.findById(orderId);
    // 基于当前状态的幂等判断
    if (event.getType() == OrderEventType.PAID 
        && order.getStatus() == OrderStatus.UNPAID) {
        order.setStatus(OrderStatus.PAID);
        orderRepository.save(order);
    }
    // 如果已经PAID，直接跳过
}
```

### 典型问题处理

**问题：消息积压如何快速处理？**

```
1. 临时增加消费者（前提是有足够的分区）
2. 或者创建一个新Topic（更多分区），重新转发消息
3. 使用Kafka Consumer Group重置offset到最新
4. 定位消费慢的原因（DB慢？外部调用慢？）
```

### 关键技能

- 理解acks、retries、enable.idempotence的配合
- 掌握幂等消费的实现策略
- 熟悉Consumer Rebalance的触发条件和影响
