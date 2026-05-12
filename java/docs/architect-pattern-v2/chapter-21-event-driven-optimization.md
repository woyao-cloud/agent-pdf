# 第21章 事件驱动架构优化策略

第 20 章讨论了 EDA 的风险——本章讨论优化策略，将事件驱动系统从"能工作"提升到"生产级可靠性"。

---

## 21.1 消息可靠性保证

```java
// 构建一个"不会丢消息"的事件系统需要三层保证：

// 层1：生产者确认 —— 消息真的发出去了
// spring.kafka.producer.acks=all
// spring.kafka.producer.retries=10

// 层2：Broker 持久化 —— 消息在 Broker 中不会丢失
// topic 配置: replication.factor=3, min.insync.replicas=2
// → 至少两个副本写入了，Broker 才 ACK 给生产者

// 层3：消费者确认 —— 消息真的被处理了
@KafkaListener(topics = "critical-events", groupId = "payment-service")
public void handle(CriticalEvent event, Acknowledgment ack) {
    try {
        processSafely(event);
        ack.acknowledge();  // 明确的"我处理完了"
    } catch (NonRecoverableException e) {
        // 不可恢复的错误——不重试，进入 DLQ
        ack.acknowledge();  // 确认（防止无限重试）
        dlq.send(event);    // 进入死信队列等待人工处理
    } catch (RecoverableException e) {
        // 可恢复——不 ack，让 Kafka 重新投递
    }
}
```

---

## 21.2 幂等性设计

```java
// 幂等性 = 同一操作执行一次和执行多次的效果完全相同
// 这是 EDA 中最重要的设计原则——因为"至少一次"投递意味着消息一定会重复

// 幂等设计模式：

// 模式1：乐观锁
public class InventoryService {
    public void deduct(String productId, int quantity, int expectedVersion) {
        int updated = jdbc.update(
            "UPDATE inventory SET stock = stock - ?, version = version + 1 " +
            "WHERE product_id = ? AND version = ?",
            quantity, productId, expectedVersion);
        if (updated == 0) {
            // 版本不匹配 → 已经被处理过了 → 跳过
            log.info("事件已处理(version check): productId={}, version={}",
                productId, expectedVersion);
        }
    }
}

// 模式2：业务状态检查
public void confirmOrder(Long orderId) {
    Order order = orderRepository.findById(orderId);
    if (order.getStatus() == OrderStatus.CONFIRMED) {
        return;  // 已经确认过了——幂等
    }
    order.confirm();
    orderRepository.save(order);
}

// 模式3：事件 ID 去重表（见第20章 20.2）
```

---

## 21.3 顺序消息处理

```java
// 当业务逻辑要求顺序时（如订单状态流转 PENDING → PAID → SHIPPED）：

// 策略1：按业务 key 分区
// 同一订单的所有事件发到同一 Kafka partition → 全局有序
kafkaTemplate.send("order-events", orderId.toString(), event);

// 策略2：FIFO Queue（RabbitMQ: 单 Queue 单 Consumer）
// 一个 Queue 只被一个 Consumer 消费 → 严格有序
// 代价：并行度 = 1

// 策略3：消费者侧乱序容忍
// 通过版本号或时间戳检测乱序，在应用层"重新排序"
public class OrderingEventHandler {
    private final Map<Long, PriorityQueue<OrderEvent>> buffers = new ConcurrentHashMap<>();

    public void handle(OrderEvent event) {
        PriorityQueue<OrderEvent> buffer = buffers.computeIfAbsent(
            event.getOrderId(), k -> new PriorityQueue<>(Comparator.comparing(OrderEvent::getVersion)));

        buffer.add(event);

        // 尝试按顺序消费
        while (!buffer.isEmpty() && buffer.peek().getVersion() == nextExpectedVersion(event.getOrderId())) {
            OrderEvent next = buffer.poll();
            processInOrder(next);
        }
    }
}
```

---

## 21.4 性能调优

```java
// 调优维度1：批量发送（减少网络往返）
// spring.kafka.producer.batch-size=16384  (16KB 一批)
// spring.kafka.producer.linger-ms=5       (等 5ms 凑一批)

// 调优维度2：压缩（减少网络带宽和存储）
// spring.kafka.producer.compression-type=lz4

// 调优维度3：合理分区（并行度 = 分区数，但不是越多越好）
// 一个 partition 的吞吐 ~10MB/s 写入，~100MB/s 读取
// 3 个 partition → ~30MB/s 写入，3 个并行消费者

// 调优维度4：消费者并发度
@KafkaListener(
    topics = "high-traffic-events",
    groupId = "fast-processor",
    concurrency = "3"  // 3 个消费者线程（分区数应该 ≥ 3）
)

// 监控消费延迟（Lag）——最重要的性能指标
// consumer_lag = 生产者最新 offset - 消费者当前 offset
// Lag 持续增长 → 消费者跟不上生产者 → 需要增加消费者或优化处理逻辑
```

---

## 21.5 事件版本化

```java
// 事件 schema 会演化——新增字段、删除字段、修改类型
// 没有版本化的事件系统是脆弱的

public class OrderCreatedEvent {
    private final String eventId;
    private final String eventType = "OrderCreated";
    private final int schemaVersion = 1;   // schema 版本号——关键字段！
    private final Instant occurredAt;

    // V1 字段
    private Long orderId;
    private Long userId;
    private BigDecimal amount;

    // V2 新增（向后兼容——老消费者忽略这个字段）
    private String currency;  // v2 新增——老消费者反序列化时忽略
}

// schema 演化原则：
// 1. 向前兼容：老消费者能消费新事件（忽略不认识的新字段）
// 2. 向后兼容：新消费者能消费老事件（新字段有默认值 null/default）
// 3. 用 Avro/Protobuf Schema Registry（Confluent Schema Registry）管理版本
```

---

## 21.6 本章小结

事件驱动架构的优化核心是四个词：**可靠、幂等、有序、高性能。**

- 可靠性 = 生产确认 + Broker 持久化 + 消费确认
- 幂等性 = 所有消费者都必须假设消息会重复到达
- 顺序 = 分区策略 + 消费者端乱序容忍
- 高性能 = 批量 + 压缩 + 合理并发度 + 持续监控 Lag

事件驱动架构篇（第18-21章）到此结束。
