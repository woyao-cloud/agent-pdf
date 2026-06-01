# 第5章 事件驱动架构

## 5.1 场景故事：微服务间的事件联动

### 从服务调用到事件通知

假设我们正在设计一个典型的电商微服务系统。用户完成支付后，系统需要执行一系列操作：更新订单状态、增加用户积分、发送物流通知、更新商品评分、触发用户推荐算法重新计算……如果用同步RPC实现，代码耦合严重、故障级联风险高。但如果改用事件驱动架构，一切变得优雅。

**同步调用（紧耦合）的方式**：
```
支付服务 → 订单服务(REST) → 积分服务(REST) → 物流服务(REST) → ...
               ↓
          故障级联：物流服务宕机 → 积分更新也失败 → 订单也被回滚
```

**事件驱动（松耦合）的方式**：
```
支付服务 → 发布 PaymentCompleted 事件到 Kafka
            ↓
        [Event Bus: Kafka]
            ↓
        订单服务（订阅者1）→ 更新订单状态（独立事务）
        积分服务（订阅者2）→ 增加积分（独立事务）
        物流服务（订阅者3）→ 创建物流单（独立事务）
        推荐服务（订阅者4）→ 刷新推荐算法（独立事务）
```

### 事件驱动的核心价值

事件驱动架构的价值不仅仅是"异步"。它带来的架构层面的改变包括：

**微服务的自主性**：每个服务可以独立发布、独立消费、独立部署。积分服务可以今天升级、明天增加新版本、后天回滚，不影响其他服务。

**新增功能的低成本**：假设业务要求增加一个"订单完成后发送优惠券"的功能。在事件驱动架构中，只需要新创建一个"优惠券服务"，订阅 `order-completed` 事件Topic，实现自己的业务逻辑即可。现有的订单服务、支付服务不需要做任何修改。

**审计友好**：所有业务事件都被持久化在Kafka的Topic中，可以完整地回溯整个系统的运行历史。对于金融、医疗等需要严格审计的行业，这是一个巨大的优势。

## 5.2 实现原理：事件溯源与最终一致性

### 事件驱动的基本模式

事件驱动的核心模式可以分解为三个基本角色：

**事件发布者**：负责在业务状态变更时发布事件。事件的粒度需要精心设计——太细会导致事件风暴（一个下单操作发出几十个小事件），太粗则失去了事件的可组合性。通常的实践是发布"业务有意义的事件"：`OrderCreated`、`PaymentCompleted`、`OrderShipped`，而不是 `FieldAChanged`、`FieldBUpdated` 这样的技术事件。

**事件总线（Kafka）**：负责存储和路由事件。Kafka的设计特别适合事件驱动架构——它的Topic天然就是事件流，Partition机制保证了事件顺序，持久化特性支持回溯消费。

**事件消费者**：订阅感兴趣的事件并做出响应。消费者只关心事件的类型和内容，不关心事件是哪个服务发布的。消费者可以自由选择从什么时间点开始消费——新服务可以订阅历史事件来初始化自己的状态。

### 事件的结构设计

一个良好设计的事件应该包含以下部分：

```json
{
  "eventId": "evt_20241001_abc123",        // 事件唯一ID（幂等消费的依据）
  "eventType": "OrderCreated",              // 事件类型
  "eventVersion": 2,                        // 事件Schema版本
  "occurredOn": 1727740800000,              // 事件发生时间
  "source": "order-service",                // 事件来源
  "aggregateId": "order-001",               // 聚合ID（保证同一聚合顺序）
  "aggregateType": "order",                 // 聚合类型
  "data": {                                 // 事件数据
    "orderId": "order-001",
    "userId": "user-123",
    "amount": 299.00,
    "items": ["sku-001", "sku-002"]
  }
}
```

`aggregateId` 是关键字段——它决定了事件的顺序性。同一个聚合的所有事件必须按发生顺序处理。在Kafka中，使用 `aggregateId` 作为消息Key，确保同一聚合的事件进入同一个Partition，从而保证顺序。

### 消费者独立组的机制

在事件驱动架构中，每个服务使用独立消费者组（Consumer Group）是非常重要的设计约束：

```java
// 订单服务
@KafkaListener(topics = "payment-events", groupId = "order-service")
public void handlePayment(PaymentCompleted event) { ... }

// 积分服务
@KafkaListener(topics = "payment-events", groupId = "points-service")
public void handlePayment(PaymentCompleted event) { ... }

// 物流服务
@KafkaListener(topics = "payment-events", groupId = "shipping-service")
public void handlePayment(PaymentCompleted event) { ... }
```

每个服务的 `groupId` 不同，这意味着：
- 同一个Topic的消息会被广播到所有服务（每个服务都能收到全量事件）
- 每个服务的Offset是独立管理的（一个服务消费到Offset 500不会影响其他服务的Offset）
- 每个服务的消费速度互不影响（订单服务处理慢不会拖慢积分服务）

## 5.3 完整代码实现

```java
// ============ 事件发布 ============
@Service
@Slf4j
public class EventPublisher {
    
    private final KafkaTemplate<String, EventMessage> kafkaTemplate;
    private final ObjectMapper objectMapper;
    
    public void publish(String topic, DomainEvent event) {
        // 构建标准事件信封
        EventMessage message = EventMessage.builder()
            .eventId(UUID.randomUUID().toString())
            .eventType(event.getEventType())
            .eventVersion(event.getVersion())
            .occurredOn(System.currentTimeMillis())
            .source(event.getSource())
            .aggregateId(event.getAggregateId())
            .aggregateType(event.getAggregateType())
            .data(event.toJson())
            .build();
        
        kafkaTemplate.send(topic, message.getAggregateId(), message)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("事件发布失败: eventType={}, aggregateId={}",
                        message.getEventType(), message.getAggregateId(), ex);
                }
            });
    }
}
```

### 架构设计原则

**最终一致性而非强一致性**：
事件驱动架构下，系统从下单到发货之间是一个"逐渐趋于一致"的过程。用户下单后看到的是"处理中"状态，几秒到几分钟后变为"已发货"。这个短暂的不一致窗口对于大多数业务场景是可接受的。

**事件版本管理**：
事件数据结构会随时间演进。推荐使用Avro Schema Registry统一管理Schema，并在事件中添加 `eventVersion` 字段，让消费者可以根据版本选择不同的反序列化逻辑。

**避免事件循环**：
如果服务A发布的事件触发服务B发布了另一个事件，服务B的事件又触发了服务A的更新……这就是事件循环。需要在每个事件中添加"追踪ID"，并在消费前检查是否已处理过来防止循环。

## 5.4 典型问题处理

**问题：如何保证事件处理的幂等性？**

```
方案：基于 eventId 的去重

1. 消费者收到事件后，先查询 event_store 表是否已存在该 eventId
2. 如果存在，跳过处理
3. 如果不存在，执行处理逻辑，并将 eventId 插入 event_store 表
   （在同一个数据库事务中）
```

## 5.5 关键技能

- 掌握Avro/Protobuf Schema管理
- 理解最终一致性和Saga模式
- 掌握事件版本兼容策略
- 熟悉死信队列和重试机制