# 第9章 事件驱动架构（Event-Driven Architecture）
事件驱动架构基于事件的发布和订阅机制，实现系统间的松耦合通信。
## 9.1 解决的问题与应用场景
### 9.1.1 解决的问题
- 系统间紧耦合
- 同步调用性能差
- 难以扩展
- 业务流程复杂
### 9.1.2 典型场景
- 实时消息系统
- 金融交易系统
- 物联网数据处理
- 电商下单流程
## 9.2 实现原理
### 9.2.1 核心组件
```          ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
Producer ─►│ Message    │────►│   Event     │────►│  Consumer  │
          │   Queue    │     │   Broker    │     │            │
          └─────────────┘     └─────────────┘     └─────────────┘
```
### 9.2.2 消息模式
```java
// 1. 点对点模式
@RabbitListener(queues = "order.queue")
public class OrderConsumer {
    public void handle(Order order) {
        // 一个消息只能被一个消费者消费
    }
}

// 2. 发布订阅模式
@RabbitListener(queues = "notification.all")
public class NotificationConsumer {
    public void handle(Event event) {
        // 所有订阅者都能收到消息
    }
}
```
## 9.3 消息队列选型
### 9.3.1 RabbitMQ
```java
// 适合：低延迟、复杂路由
@Configuration
public class RabbitConfig {
    @Bean
    public Queue orderQueue() {
        return new Queue("order.queue", true);
    }
    
    @Bean
    public TopicExchange exchange() {
        return new TopicExchange("order.exchange");
    }
}
```
### 9.3.2 Kafka
```java
// 适合：高吞吐量、日志处理
@KafkaListener(topics = "user.events", groupId = "user-service")
public void handleUserEvent(ConsumerRecord<String, User> record) {
    log.info("Received: {}", record.value());
}
```
## 9.4 潜在风险与问题
### 9.4.1 消息顺序性
```java
// 问题：消息可能乱序
// 解决方案：分区、序列号、重试机制
@KafkaListener(topics = "order", partitionAssignmentStrategy = "roundRobin")
public class OrderedConsumer {
    private final Map<String, AtomicInteger> counters = new ConcurrentHashMap<>();
    
    public void handle(Message msg) {
        String orderId = msg.getOrderId();
        int expectedSeq = counters.computeIfAbsent(orderId, k -> new AtomicInteger(0)).getAndIncrement();
        if (expectedSeq != msg.getSeq()) {
            // 消息乱序，延迟处理
            delayQueue.offer(msg);
            return;
        }
        process(msg);
    }
}
```
### 9.4.2 消息重复
```java
// 幂等性设计
@Service
public class IdempotentConsumer {
    private final RedisTemplate<String, String> redis;
    
    public void handle(Message msg) {
        String key = "msg:" + msg.getId();
        Boolean success = redis.opsForValue().setIfAbsent(key, "1", 30, TimeUnit.MINUTES);
        if (Boolean.TRUE.equals(success)) {
            process(msg);
        } else {
            log.info("Duplicate message, skipped: {}", msg.getId());
        }
    }
}
```
### 9.4.3 消息丢失
```java
// 确保消息不丢失
@Configuration
public class ReliableProducer {
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) {
                // 消息发送失败，重试
                log.error("Message send failed: {}", cause);
            }
        });
        template.setReturnsCallback(returned -> {
            // 消息被退回
            log.error("Message returned: {}", returned.getMessage());
        });
        return template;
    }
}
```
### 9.4.4 事务一致性
```java
// 分布式事务解决方案：TCC模式
@Service
public class OrderSagaService {
    @Transactional
    public void createOrder(Order order) {
        // 1. Try: 预留资源
        inventoryService.reserve(order.getItems());
        paymentService.reserve(order.getAmount());
        
        // 2. Confirm: 确认执行
        try {
            orderRepository.save(order);
            inventoryService.confirm(order.getItems());
            paymentService.confirm(order.getAmount());
        } catch (Exception e) {
            // 3. Cancel: 取消预留
            inventoryService.cancel(order.getItems());
            paymentService.cancel(order.getAmount());
            throw e;
        }
    }
}
```
## 9.5 优化策略
### 9.5.1 消息可靠投递
- 生产者确认
- 消费者确认
- 消息持久化
- 死信队列
### 9.5.2 性能优化
```java
// 批量消费
@RabbitListener(queues = "batch.queue")
public void handleBatch(List<Message> messages) {
    List<Order> orders = messages.stream()
        .map(this::convert)
        .collect(Collectors.toList());
    orderService.batchSave(orders);
}
```
## 9.6 本章小结
事件驱动架构实现系统间松耦合， 适合高并发、 实时处理场景。 需注意消息可靠性、 顺序性、 幂等性等挑战。
---