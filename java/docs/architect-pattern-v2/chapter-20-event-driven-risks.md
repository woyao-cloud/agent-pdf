# 第20章 事件驱动架构的潜在风险与问题

事件驱动架构的松耦合带来了灵活性，但也引入了特有的风险模式。这些风险不是"能不能用 EDA"的理由——而是"用好 EDA 必须解决什么问题"的清单。

---

## 20.1 消息顺序性

```java
// 问题：如果事件的处理顺序错了，系统状态就错了

// 场景：用户先创建订单，然后立即取消
// OrderCreatedEvent → OrderCancelledEvent
// 但如果消费者先收到 OrderCancelledEvent → 查不到订单 → 忽略
// 然后收到 OrderCreatedEvent → 创建订单 → 订单创建了但没有被取消！
// → 系统状态和真实情况不一致

// 解决1：Kafka 中同一 key 的消息发到同一 partition → 顺序保证
kafkaTemplate.send("order-events", orderId, event);  // key = orderId

// 解决2：在消费者端检测乱序——通过版本号或时间戳
public class OrderEventHandler {
    private final Map<Long, Instant> lastEventTime = new ConcurrentHashMap<>();

    public void handle(OrderEvent event) {
        Instant lastTime = lastEventTime.get(event.getOrderId());
        if (lastTime != null && event.getOccurredAt().isBefore(lastTime)) {
            // 这个事件是"旧"的——忽略或放入乱序处理队列
            log.warn("检测到乱序事件: orderId={}", event.getOrderId());
            return;
        }
        lastEventTime.put(event.getOrderId(), event.getOccurredAt());
        processEvent(event);
    }
}
```

---

## 20.2 消息重复

```java
// "至少一次"投递保证 = 消息可能被投递多次
// 必须设计幂等性

// 幂等方案1：唯一事件 ID
@Component
public class IdempotentEventHandler {
    private final Set<String> processedEventIds = ConcurrentHashMap.newKeySet();

    @KafkaListener(topics = "order-events", groupId = "points-service")
    public void handle(OrderCreatedEvent event) {
        // 如果这个事件已经处理过，直接跳过
        if (!processedEventIds.add(event.getEventId())) {
            log.info("事件 {} 已处理，跳过", event.getEventId());
            return;
        }
        pointsService.award(event.getUserId(), event.getAmount());
    }
    // 问题：重启后 processedEventIds 丢失
}

// 幂等方案2：数据库去重表（持久化的幂等保证）
public class PointsEventHandler {
    private final JdbcTemplate jdbc;

    public void handle(OrderCreatedEvent event) {
        try {
            // INSERT 去重——如果 event_id 已存在，唯一约束报错
            jdbc.update(
                "INSERT INTO processed_events (event_id, event_type, processed_at) " +
                "VALUES (?, ?, NOW())",
                event.getEventId(), event.getEventType());
        } catch (DuplicateKeyException e) {
            return;  // 已处理过，跳过
        }

        pointsService.award(event.getUserId(), event.getAmount());
    }
}
```

---

## 20.3 消息丢失

```java
// 生产者侧：消息发出去了吗？
// 解决：生产者确认 (acks)
// Kafka 配置：
// spring.kafka.producer.acks=all  # 所有副本确认后才认为发送成功

// Broker 侧：消息落地了吗？
// 解决：持久化 + 副本
// Kafka 配置：replication.factor=3, min.insync.replicas=2

// 消费者侧：消息被正确处理了吗？
// 解决：手动确认 (manual acknowledgment)
@KafkaListener(topics = "order-events", groupId = "payment-service")
public void handle(OrderCreatedEvent event, Acknowledgment ack) {
    try {
        paymentService.process(event);
        // 只有处理成功才确认——如果 crash，消息会被重新投递
        ack.acknowledge();
    } catch (Exception e) {
        // 不 ack → 消息重新排队 → 再次消费
        // 必须配合幂等性——重复消费可能发生
    }
}
```

---

## 20.4 事务一致性

```java
// 经典问题：数据库更新成功，但消息没发出去（或反过来）
// 这是 EDA 中最难的问题之一

// 解决：Outbox Pattern（发件箱模式）
// 不直接发 Kafka，而是把消息写入数据库的 outbox 表
// 一个独立的进程从 outbox 表读取消息并发送到 Kafka

@Service
@Transactional
public class OrderServiceWithOutbox {

    private final OrderRepository orderRepository;
    private final OutboxRepository outboxRepository;

    public void createOrder(OrderRequest request) {
        // 这两步在同一个数据库事务中——要么都成功，要么都失败
        Order order = orderRepository.save(Order.create(request));
        outboxRepository.save(OutboxMessage.create(
            "order-events", order.getId().toString(),
            new OrderCreatedEvent(order).toJson()
        ));
        // 事务提交后 →
        // OutboxPoller 定时读取 outbox 表 → 发送 Kafka → 删除已发送的记录
    }
}

// Outbox Poller（或使用 Debezium CDC 替代轮询）
@Component
public class OutboxPoller {
    @Scheduled(fixedDelay = 100)
    public void pollAndPublish() {
        List<OutboxMessage> messages = outboxRepository.findUnpublished(100);
        for (OutboxMessage msg : messages) {
            kafkaTemplate.send(msg.getTopic(), msg.getKey(), msg.getPayload());
            outboxRepository.markPublished(msg.getId());
        }
    }
}
```

---

## 20.5 调试复杂度

```java
// EDA 的调试地狱：问题出现在 A，但根因在 E（5 步之前的异步事件链中）

// 必需工具：
// 1. 事件版本化：每个事件包含一个 schema version——知道是哪版代码产生的
// 2. 关联 ID：同一个业务流程的所有事件共享一个 correlationId
// 3. 死信队列（DLQ）：处理失败的事件不丢弃——进入 DLQ 等待人工处理
// 4. 事件重放能力：从某个时间点开始回放事件，复现 bug

// 死信队列配置：
@Bean
public DeadLetterPublishingRecoverer recoverer(KafkaTemplate<String, Object> template) {
    return new DeadLetterPublishingRecoverer(template);
}
```

---

## 20.6 本章小结

事件驱动架构的五个核心风险形成了一条链：顺序丢了 → 重复投递 → 可能丢失 → 事务不一致 → 难以调试。每个风险都有成熟的工程对策，但它们**必须**在架构设计阶段就被纳入考量——在生产环境发现"消息不幂等"是一场灾难。

EDA 的核心工程标准：**每个事件必须可以被安全地重放（幂等）**。这是所有其他保证（可靠性、一致性、可恢复性）的基础。
