# 第11章 事务消息

## 场景描述

在分布式系统中，确保"发送消息"和"更新数据库"这两个操作的原子性是一个经典难题。Kafka事务消息通过两阶段提交协议解决了这个问题。

### 解决的问题

```
// ❌ 非事务：数据不一致
1. 更新数据库（成功）
2. 发送Kafka消息（失败）→ 数据库已更新，但消息未发出 → 不一致

// ❌ 非事务：顺序颠倒
1. 发送Kafka消息（成功）
2. 更新数据库（失败）→ 消息已发出，但数据库未更新 → 不一致

// ✅ 事务消息：原子性
1. 开始事务
2. 更新数据库
3. 发送Kafka消息
4. 提交事务 → 要么都成功，要么都失败
```

### 实现原理

**Kafka事务的两阶段提交**：

```
第一阶段：原子写入（Atomic Write）
- Producer发送PREPARE消息
- Broker记录事务状态到__transaction_state topic

第二阶段：提交或中止（Commit or Abort）
- Producer发送COMMIT消息 → 消费者可见
- Producer发送ABORT消息 → 消费者不可见
```

**事务控制标志**：

```
消息中的control.batch标志：
- 0：普通消息
- 1：事务控制消息（COMMIT/ABORT）

消费者通过isolation.level配置：
- read_committed：只读取已提交的消息
- read_uncommitted：读取所有消息（包括未提交的）
```

**Exactly-Once语义**：

```
幂等性（Idempotence）：enable.idempotence=true
  → 防止重试导致的消息重复
事务（Transaction）：加上transactional.id
  → 保证跨分区的原子写入
Exactly-Once：幂等性 + 事务 = 精确一次
```

### Docker Compose

```yaml
# docker/scenario-11-transaction/docker-compose.yml
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
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_TIMEOUT_MS: 60000
```

### Java示例代码

```java
// ============ 1. 事务生产者配置 ============
@Configuration
public class TransactionalProducerConfig {
    
    @Bean
    public ProducerFactory<String, Object> transactionalProducerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        // 事务相关配置
        props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-tx-${random.uuid}");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        DefaultKafkaProducerFactory<String, Object> factory = 
            new DefaultKafkaProducerFactory<>(props);
        // 初始化事务
        factory.setTransactionIdPrefix("tx-");
        return factory;
    }
    
    @Bean
    public KafkaTemplate<String, Object> transactionalKafkaTemplate(
            ProducerFactory<String, Object> factory) {
        KafkaTemplate<String, Object> template = new KafkaTemplate<>(factory);
        template.setDefaultTopic("orders");
        return template;
    }
}

// ============ 2. 事务性服务（数据库+Kafka原子操作） ============
@Service
public class OrderTransactionalService {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    
    // 方式一：使用@Transactional注解 + KafkaTransactionManager
    @Transactional
    @KafkaTransactional
    public void createOrder(Order order) {
        // 1. 写入数据库
        jdbcTemplate.update(
            "INSERT INTO orders(id, user_id, amount, status) VALUES (?, ?, ?, ?)",
            order.getId(), order.getUserId(), order.getAmount(), "CREATED");
        
        // 2. 发送Kafka消息（和DB在同一个事务中）
        kafkaTemplate.send("order-events", order.getId(), order);
        
        // 如果任一步失败，都会回滚
        // 数据库回滚 + Kafka事务中止
    }
    
    // 方式二：手动控制事务
    public void createOrderManual(KafkaTemplate<String, Object> template, Order order) {
        // 开始Kafka事务
        template.executeInTransaction(operations -> {
            // 1. 写入数据库
            jdbcTemplate.update(
                "INSERT INTO orders(id, user_id, amount, status) VALUES (?, ?, ?, ?)",
                order.getId(), order.getUserId(), order.getAmount(), "PROCESSING");
            
            // 2. 发送消息（如果DB失败，Kafka也会回滚）
            operations.send("order-events", order.getId(), order);
            operations.send("payment-events", order.getId(), new PaymentEvent(order));
            
            return true;
        });
    }
}

// ============ 3. 事务消费者 ============
@Component
public class TransactionalConsumer {
    
    @Bean
    public ConsumerFactory<String, Object> transactionalConsumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "order-processor");
        props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
        // 只读取已提交的事务消息！
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        return new DefaultKafkaConsumerFactory<>(props);
    }
    
    // consume-transform-produce (C-T-P) 模式
    @KafkaListener(topics = "order-events", groupId = "order-processor")
    @Transactional
    public void processOrder(ConsumerRecord<String, Order> record) {
        Order order = record.value();
        
        // 处理订单（可能抛异常）
        if (order.getAmount() > 10000) {
            throw new IllegalArgumentException("金额超过限制");
        }
        
        // 处理成功的，发送到下一个Topic（和当前消费在同一个事务中）
        kafkaTemplate.send("processed-orders", order.getId(), order);
        // 提交offset（事务性）
        ackCurrentOffset();
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **事务超时** | 长时间未提交导致事务超时 | 合理设置transaction.timeout.ms |
| **事务ID冲突** | 多个实例使用相同的transactional.id | 确保每个实例的ID唯一 |
| **性能下降** | 事务引入额外延迟和开销 | 只在需要精确一次的场景使用 |
| **僵尸Producer** | 旧实例持有事务ID | 设置合理的transactional.id过期时间 |

**性能影响**：
```
非事务发送：延迟 ~5ms，吞吐 100万 msg/s
事务发送：  延迟 ~20ms，吞吐 50万 msg/s

事务大约引入4倍延迟开销，吞吐降低约50%
```

### 典型问题处理

**问题：如何结合数据库事务和Kafka事务实现强一致性？**

```
方案1：Spring @Transactional + KafkaTransactionManager（推荐）
- 使用ChainedKafkaTransactionManager
- 确保DB和Kafka在同一个事务中
- 但要注意：这是"尽力而为"的XA，没有真正的2PC

方案2：本地消息表
- 先写入本地消息表（DB事务）
- 异步任务从消息表读取并发送到Kafka
- 发送成功后删除消息表记录

方案3：Outbox模式
- 使用CDC监听数据库的outbox表
- Debezium将outbox变更推送到Kafka
- 天然保证数据库和消息的原子性
```

### 关键技能

- 理解Kafka事务的两阶段提交流程
- 掌握幂等性和事务的配合使用
- 理解read_committed和read_uncommitted的区别
- 掌握C-T-P（Consume-Transform-Produce）模式
- 理解Kafka事务的局限性和替代方案（Outbox模式）