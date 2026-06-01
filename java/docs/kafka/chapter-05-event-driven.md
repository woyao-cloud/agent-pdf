# 第5章 事件驱动架构

## 场景描述

事件驱动架构（EDA）是微服务架构的核心模式之一。服务之间不直接调用，而是通过事件进行通信，实现松耦合和最终一致性。

### 解决的问题

**传统微服务调用的痛点**：
```
订单服务 → 用户服务（HTTP）→ 积分服务（HTTP）→ 通知服务（HTTP）
                ↓
           同步阻塞 → 延迟叠加 → 故障级联 → 紧耦合
```

**事件驱动架构**：
```
订单服务发布 OrderCreated 事件
         ↓
    [Event Bus: Kafka]
         ↓
    积分服务（独立消费）→ 最终一致性
    通知服务（独立消费）→ 最终一致性
    分析服务（独立消费）→ 最终一致性
```

### 实现原理

**事件溯源（Event Sourcing）**：
```
不是存储当前状态，而是存储所有状态变更事件
当前状态 = 对事件序列的fold/reduce

订单状态变更事件流：
OrderCreated → OrderPaid → OrderShipped → OrderDelivered
                        ↓
当前状态通过重放所有事件得到
```

**CQRS（命令查询职责分离）**：
```
命令端（Command）：写入事件到Kafka
查询端（Query）：从物化视图读取数据（异步更新）
```

### Docker Compose

```yaml
# docker/scenario-05-event-driven/docker-compose.yml
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

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    depends_on: [kafka]
    ports: ["8081:8081"]
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka:9092
```

### Java示例代码

```java
// ============ 1. 领域事件定义 ============
// 使用Avro定义事件（推荐）
{
  "namespace": "com.example.events",
  "type": "record",
  "name": "OrderCreatedEvent",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "userId", "type": "string"},
    {"name": "amount", "type": "double"},
    {"name": "items", "type": {"type": "array", "items": "string"}},
    {"name": "timestamp", "type": "long"}
  ]
}

// ============ 2. 事件发布（Maven依赖spring-kafka） ============
@Component
public class EventPublisher {
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    
    public void publish(DomainEvent event) {
        event.setEventId(UUID.randomUUID().toString());
        event.setOccurredOn(Instant.now().toEpochMilli());
        
        kafkaTemplate.send(event.getTopic(), 
                          event.getAggregateId(), 
                          objectMapper.writeValueAsString(event));
    }
}

// ============ 3. 事件处理（使用重试和死信） ============
@KafkaListener(topics = "domain-events", groupId = "user-service")
public void handleEvent(String message, 
                        @Header(KafkaHeaders.RECEIVED_KEY) String key) {
    DomainEvent event = objectMapper.readValue(message, DomainEvent.class);
    
    Retry.decorateCheckeredSupplier(() -> {
        switch (event.getType()) {
            case "OrderCreated":
                userService.incrementOrderCount(event.getUserId());
                break;
            case "PaymentCompleted":
                userService.updateCreditScore(event.getUserId(), event.getAmount());
                break;
        }
        return null;
    }, retryPolicy).get();
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **事件顺序** | 同一聚合的事件乱序 | 相同aggregateId路由到同一分区 |
| **最终一致性延迟** | 用户看到旧数据 | 显示处理中状态 + WebSocket推送 |
| **事件版本兼容** | Schema演进兼容 | 使用Avro + Schema Registry |
| **死循环事件** | 事件处理中又产生同类事件 | 事件溯源标识 + 环形检测 |

**事件版本管理**：
```java
// 向后兼容的Schema演化
// 允许添加可选字段（default值）
{
  "name": "userName",
  "type": ["null", "string"],
  "default": null
}
```

### 典型问题处理

**问题：如何处理事件模式演进？**

```
方案1：Avro Schema Registry（推荐）
- 写入时使用writer schema
- 读取时使用reader schema
- 支持向前/向后兼容

方案2：JSON + 版本号
- 消息体中包含version字段
- 消费者根据version反序列化
- 升级版本时兼容旧版

方案3：Protobuf
- .proto文件管理
- 字段编号（不可变）
- 支持默认值
```

### 关键技能

- 掌握Avro/Protobuf Schema管理
- 理解最终一致性和Saga模式
- 掌握事件版本兼容策略
- 熟悉死信队列和重试机制
