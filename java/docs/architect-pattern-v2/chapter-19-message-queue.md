# 第19章 消息队列模式

消息队列是实现事件驱动架构的核心基础设施。RabbitMQ、Kafka 和 RocketMQ 是 Java 生态中最主流的三种消息中间件，各自的设计理念和适用场景有显著差异。

---

## 19.1 RabbitMQ

### 19.1.1 核心特征

RabbitMQ 基于 AMQP 协议，核心设计哲学是"消息的路由和分发"——它把消息从生产者"投递"到消费者。

```
RabbitMQ 的核心概念：

  Producer → Exchange → (binding rules) → Queue → Consumer

  Exchange 类型：
  - Direct: 精确匹配 routing key
  - Topic: 模式匹配 routing key (如 "order.*")
  - Fanout: 广播到所有绑定的 Queue
  - Headers: 基于消息头匹配
```

```java
// Spring Boot + RabbitMQ

@Configuration
public class RabbitConfig {

    @Bean
    public Queue orderQueue() { return new Queue("order.created.queue", true); }

    @Bean
    public TopicExchange orderExchange() { return new TopicExchange("order.exchange"); }

    @Bean
    public Binding binding() {
        return BindingBuilder
            .bind(orderQueue())
            .to(orderExchange())
            .with("order.created");
    }
}

@Service
public class OrderEventPublisher {
    private final RabbitTemplate rabbit;

    public void publish(OrderCreatedEvent event) {
        rabbit.convertAndSend("order.exchange", "order.created", event);
    }
}

@Component
public class OrderEventConsumer {
    @RabbitListener(queues = "order.created.queue")
    public void handle(OrderCreatedEvent event) {
        // 处理逻辑
    }
}
```

### 19.1.2 适用场景

- 任务队列（一个消息只被一个消费者处理）
- 消息量不大（< 数万/秒）
- 需要复杂的路由规则
- 不需要消息回放（消费后消息删除）

---

## 19.2 Kafka

### 19.2.1 核心特征

Kafka 的设计哲学与 RabbitMQ 完全不同——它是"分布式提交日志"（Distributed Commit Log）。消息被持久化到磁盘，消费者通过维护 offset 来按顺序消费，消息可以回放。

```
Kafka 的核心概念：

  Producer → Topic (Partition 0, Partition 1, ...) → Consumer Group

  - 消息不会因消费而删除（按时间/大小策略清理）
  - Consumer Group 内每个 Partition 只被一个 Consumer 消费
  - 不同 Consumer Group 独立消费同一个 Topic（各自 offset）
```

```java
// Spring Boot + Kafka

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic orderTopic() {
        return TopicBuilder.name("order-events")
            .partitions(6)     // 6 个分区 = 6 个并行消费者
            .replicas(3)       // 3 个副本保证可靠性
            .build();
    }
}

@Service
public class OrderEventPublisher {
    private final KafkaTemplate<String, Object> kafka;

    public void publish(Order order) {
        // key = orderId → 同一订单的事件发到同一 partition → 顺序保证
        kafka.send("order-events",
            order.getId().toString(),
            new OrderCreatedEvent(order));
    }
}

@Component
public class PointsConsumer {
    @KafkaListener(topics = "order-events", groupId = "points-service")
    public void handle(OrderCreatedEvent event, Acknowledgment ack) {
        try {
            pointsService.award(event.getUserId(), event.getAmount());
            ack.acknowledge();  // 手动确认——只有处理成功才提交 offset
        } catch (Exception e) {
            // 不 ack → Kafka 会重新投递
            // 要求：业务逻辑必须是幂等的
        }
    }
}
```

### 19.2.2 适用场景

- 高吞吐量（> 10 万/秒）
- 事件溯源（需要消息回放）
- 多个消费者独立消费同一事件流
- 大数据的管道（Kafka Streams / Flink 消费源）

---

## 19.3 RocketMQ

```java
// RocketMQ 是阿里巴巴开源的中间件，在事务消息和顺序消息方面有独特优势

// 事务消息——RocketMQ 的杀手级特性
// "本地事务执行 + 消息发送"在同一个分布式事务中
@Service
public class OrderServiceWithTransactionMessage {
    private final RocketMQTemplate rocketMQ;

    @Transactional
    public void createOrder(Order order) {
        orderRepository.save(order);

        // 发送事务消息——如果本地事务回滚，消息不会发出
        rocketMQ.sendMessageInTransaction(
            "order-topic",
            MessageBuilder.withPayload(new OrderCreatedEvent(order)).build(),
            order.getId()
        );
    }
}

// Kafka 没有原生事务消息——需要额外的事务协调器或 outbox 模式来实现
```

### 19.3.1 选择对比

| 特性 | RabbitMQ | Kafka | RocketMQ |
|------|----------|-------|----------|
| 吞吐量 | 中 (~3万/s) | 极高 (百万/s) | 高 (十万/s) |
| 消息回放 | 不支持 | 支持 | 支持 |
| 事务消息 | 不支持 | 不支持（需外部协调） | 原生支持 |
| 顺序消息 | 单 Queue | 单 Partition（限制并行度） | 原生支持 |
| 学习成本 | 低 | 中 | 中 |
| 典型场景 | 任务队列 | 流式数据/事件溯源 | 电商交易（事务消息） |

---

## 19.4 消息模式：点对点 vs 发布-订阅

```java
// 点对点（Queue）：
//   一个消息被一个消费者消费后删除
//   场景：任务分派——创建订单的后台处理任务只能由一个 worker 执行
@RabbitListener(queues = "order.processing.queue")
public void processOrder(Order order) { /* 只被一个 worker 处理 */ }

// 发布-订阅（Topic）：
//   一个消息被所有订阅的消费者组各自消费
//   场景：订单创建事件——积分系统、通知系统、审计系统都消费
@KafkaListener(topics = "order-events", groupId = "points-service")
public void awardPoints(OrderCreatedEvent event) { }

@KafkaListener(topics = "order-events", groupId = "notification-service")
public void sendAlert(OrderCreatedEvent event) { }

@KafkaListener(topics = "order-events", groupId = "audit-service")
public void auditLog(OrderCreatedEvent event) { }
// 同一个事件，三个消费者各自消费
```

---

## 19.5 本章小结

选择消息队列的核心决策树：

1. **任务队列 + 复杂路由** → RabbitMQ
2. **高吞吐 + 事件流 + 多消费者** → Kafka
3. **事务消息 + 电商交易场景** → RocketMQ

关键原则：消息队列的选择应该在项目早期做出——因为它决定了你的通信模型、一致性语义和运维体系，切换成本很高（这是第1章的"架构决策"）。
