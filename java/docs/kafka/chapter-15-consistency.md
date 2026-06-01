# 第15章 数据一致性与可靠性

## 15.1 消息丢失场景分析

### 生产者→Broker丢失

| 场景 | 原因 | 解决方案 |
|------|------|---------|
| 生产者发送失败 | 网络超时 | acks=all + retries |
| Leader切换 | 未同步副本丢失数据 | min.insync.replicas=2 |
| 磁盘故障 | 单副本永久丢失 | replication.factor≥3 |

**可靠发送配置组合**：
```properties
# 最强可靠性配置（不会丢消息）
acks=all
retries=Integer.MAX_VALUE     # 无限重试
enable.idempotence=true
max.in.flight.requests.per.connection=1  # 防止乱序
```
但注意：此配置吞吐最低。

### Broker→消费者丢失

| 场景 | 原因 | 解决方案 |
|------|------|---------|
| 自动提交offset | 处理成功前提交offset | enable.auto.commit=false |
| 处理异常 | 消费逻辑抛异常 | 手动提交 + 异常处理 |
| 再均衡 | 未提交的offset丢失 | RebalanceListener中提交 |

## 15.2 消息重复场景分析

### 生产者重复

**原因**：Produce发送后Broker已接收但ACK超时，Producer重试导致重复。

**解决方案**：
```properties
# 幂等性（Exactly-Once Producer）
enable.idempotence=true
# 原理：每个Producer有唯一的Producer ID (PID)
# 每个消息的序列号 (sequence number)
# Broker去重：相同(PID, sequence)的消息只保留一次
```

### 消费者重复

**原因**：处理成功但提交offset失败。

**解决方案**：
```java
// 方式1：幂等消费（推荐）
@KafkaListener(topics = "orders")
public void processOrder(Order order) {
    // 使用业务键保证幂等
    String dedupKey = "order:" + order.getId();
    
    // SET NX（不存在才插入）
    Boolean success = redisTemplate.opsForValue()
        .setIfAbsent(dedupKey, "processed", Duration.ofHours(24));
    
    if (Boolean.TRUE.equals(success)) {
        // 第一次处理
        orderService.process(order);
    } else {
        // 已经处理过，跳过
        log.info("跳过重复消息: {}", order.getId());
    }
}

// 方式2：数据库唯一约束
@Transactional
public void processOrder(Order order) {
    // 利用数据库的唯一约束防止重复
    jdbcTemplate.update(
        "INSERT INTO processed_orders(order_id) VALUES(?) ON DUPLICATE KEY UPDATE processed_at=NOW()",
        order.getId());
}
```

## 15.3 Exactly-Once语义

| 语义 | 描述 | 配置 |
|------|------|------|
| At Most Once | 最多一次（可能丢） | acks=0，自动提交 |
| At Least Once | 至少一次（可能重复） | acks=all，手动提交 |
| Exactly Once | 精确一次（不丢不重） | 幂等+事务+read_committed |

**Exactly-Once完整配置**：
```properties
# Producer
enable.idempotence=true
transactional.id=unique-tx-id
acks=all

# Consumer
isolation.level=read_committed
enable.auto.commit=false
```

## 15.4 数据一致性方案

### 最终一致性架构

```
服务A（DB写入）→ Outbox表（同DB事务）→ CDC(Debezium) → Kafka → 服务B
```

**Outbox模式**：
```java
@Transactional
public void createOrder(Order order) {
    // 1. 写入业务表
    orderRepository.save(order);
    
    // 2. 写入Outbox表（同事务）
    OutboxMessage msg = new OutboxMessage();
    msg.setAggregateId(order.getId());
    msg.setAggregateType("order");
    msg.setEventType("OrderCreated");
    msg.setPayload(objectMapper.writeValueAsString(order));
    outboxRepository.save(msg);
}

// Outbox消息由Debezium捕获并推送到Kafka
// 消费者从Kafka消费 → 处理 → 标记Outbox为已发送
```

### 数据对账

```java
// 定时对账：发现不一致后自动修复
@Scheduled(fixedRate = 60000)  // 每分钟
public void reconcileOrders() {
    // 从Kafka获取offset范围内的消息
    // 从数据库获取对应记录
    // 逐条比对
    // 不一致的修复或告警
}
```

## 15.5 典型问题处理

**问题：如何保证支付场景下Kafka消息的最终一致性？**

```
方案：异步确保型（Saga模式）

1. 订单服务：创建订单（状态=PENDING）
2. 订单服务：发送"支付确认"消息到Kafka
3. 支付服务：消费消息，执行扣款
4. 支付服务：发送"扣款成功/失败"消息
5. 订单服务：消费消息，更新订单状态
   - 扣款成功 → 订单完成
   - 扣款失败 → 订单取消（补偿）
```

> **核心原则**：幂等消费 + 最终补偿 + 定时对账