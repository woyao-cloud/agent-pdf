# 第15章 数据一致性与可靠性

## 15.1 消息丢失场景深度分析

### 丢失可能发生的三个环节

消息丢失可能发生在Kafka消息传递的三个环节中的任何一个。理解每个环节的丢失原因，才能针对性地配置：

**生产者→Broker环节的丢失**

当生产者发送消息后，如果Leader Broker在将消息同步给Follower之前宕机，且 `acks` 配置为 `0` 或 `1`，这条消息就会丢失：

```
acks=0: 生产者发送后不管Broker死活——Broker宕机时消息必然丢失
acks=1: 生产者等待Leader确认——但如果Leader在同步给Follower前宕机，消息丢失
acks=all: 生产者等待所有ISR确认——只要至少一个ISR存活，消息不丢失
```

可靠配置：`acks=all` + `replication.factor=3` + `min.insync.replicas=2`。这保证了即使一个Broker宕机，生产者仍然可以正常写入（因为还有2个ISR），且数据不会丢失（因为还有2个副本）。

**Broker自身的数据丢失**

即使配置了3副本，如果Broker配置了不恰当的刷盘策略，仍可能丢失数据：

```properties
# 危险配置（消息停留在操作系统页缓存中，断电即丢失）
log.flush.interval.messages=Long.MAX_VALUE
log.flush.interval.ms=Long.MAX_VALUE

# 安全配置（频繁刷盘，但性能下降明显）
log.flush.interval.messages=1
log.flush.interval.ms=1000
```

但Kafka的推荐做法是**依赖副本机制而非刷盘策略**。3副本 + 不同机器 = 即使一台机器断电，其他机器还有数据。此时即使不频繁刷盘，也不会丢失数据（除非三台机器同时断电）。

**消费者环节的丢失**

```java
// ❌ 丢失配置：在消息处理前提交了offset
while(true) {
    ConsumerRecords<String, String> records = consumer.poll(100);
    consumer.commitSync();  // 提交offset在前！
    process(records);       // 如果这里崩溃，消息已提交但未处理
}
```

正确的做法是"先处理，后提交"：`process(records)` 成功后，再调用 `commitSync()`。

## 15.2 消息重复场景

### 重复产生的三个环节

**生产者重试导致的重复**：Producer发送消息后未收到ACK（实际上Broker已写入成功），重试导致同一条消息被写入两次。解决方案：启用幂等性 `enable.idempotence=true`。

**消费者提交失败导致的重复**：消费者处理成功但提交offset失败，重启后从旧的offset重新消费。解决方案：消费端幂等设计。

**Rebalance导致的重复**：再均衡发生时，未提交的offset导致消息被重新分配给其他消费者。解决方案：在RebalanceListener中提交当前offset。

### 幂等消费的三种实现

```java
// 方案1：数据库唯一约束（抗重复）
@Transactional
public void processOrder(Order order) {
    // 利用UNIQUE约束，重复插入会抛异常
    jdbcTemplate.update(
        "INSERT INTO processed_msg(msg_id, status) VALUES(?, 'DONE') ON CONFLICT(msg_id) DO NOTHING",
        order.getEventId());
    // 业务处理
    orderRepository.updateStatus(order.getOrderId(), "PAID");
}

// 方案2：Redis原子操作（高性能）
public boolean deduplicate(String eventId) {
    // SET NX：不存在才设置成功，返回true
    return redisTemplate.opsForValue()
        .setIfAbsent("dedup:" + eventId, "1", Duration.ofHours(24));
}

// 方案3：业务状态机（不需要额外存储）
public void processPayment(PaymentEvent event) {
    Order order = orderRepository.findById(event.getOrderId());
    // 基于当前状态判断：如果已经是PAID，跳过
    if (order.getStatus() == OrderStatus.PAID) {
        return; // 已经处理过，幂等跳过
    }
    if (order.getStatus() != OrderStatus.PENDING) {
        return; // 当前状态下不允许支付处理
    }
    order.setStatus(OrderStatus.PAID);
    orderRepository.save(order);
}
```

## 15.3 Exactly-Once完整配置

| 语义 | 配置 | 效果 |
|------|------|------|
| At Most Once | acks=0 | 可能丢消息 |
| At Least Once | acks=all + 手动提交 | 不丢但可能重复 |
| Exactly Once | 幂等+事务+read_committed | 不丢不重复 |

```properties
# Exactly-Once配置
producer:
  enable.idempotence: true
  transactional.id: "app-tx-1"
  acks: all
consumer:
  isolation.level: read_committed
  enable.auto.commit: false
```

## 15.4 Outbox模式

Outbox模式是实现数据库与Kafka强一致性的推荐方案。核心思想：将"待发送的消息"与业务数据在同一个数据库事务中写入，再由独立的发送程序从数据库读取并发送到Kafka：

```java
@Transactional
public void createOrder(Order order) {
    // 1. 写入业务表
    jdbcTemplate.update("INSERT INTO orders ...", order);
    
    // 2. 同一个事务中写入outbox表
    jdbcTemplate.update(
        "INSERT INTO outbox(id, topic, key, value, created_at) VALUES(?, ?, ?, ?, NOW())",
        UUID.randomUUID().toString(),
        "order-events",
        order.getId(),
        objectMapper.writeValueAsString(order));
}

// 独立的发送程序（定时任务或CDC）
@Scheduled(fixedDelay = 100)
public void publishOutbox() {
    List<Outbox> messages = jdbcTemplate.query(
        "SELECT * FROM outbox ORDER BY created_at LIMIT 100", mapper);
    for (Outbox msg : messages) {
        kafkaTemplate.send(msg.getTopic(), msg.getKey(), msg.getValue());
        jdbcTemplate.update("DELETE FROM outbox WHERE id = ?", msg.getId());
    }
}
```

Outbox模式的优势：不需要分布式事务，不需要Kafka事务，但它提供了与Kafka事务相同的"数据库操作和消息发送"原子性保证。消息发送可能延迟几毫秒到几百毫秒（取决于轮询间隔），但不会丢失。

## 15.5 关键技能

- 理解acks/replication.factor/min.insync.replicas的配合
- 掌握幂等消费的三种实现方式
- 理解Outbox模式解决分布式事务问题的原理
- 掌握数据对账和修复的方法