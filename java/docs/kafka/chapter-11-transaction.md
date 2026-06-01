# 第11章 事务消息

## 11.1 场景故事：转账的原子性问题

### 业务场景

用户发起了一笔转账：从账户A扣款100元，向账户B存入100元。在单库单表时代，这个操作被一个数据库事务完美解决。但在微服务架构中，账户A和账户B的余额可能分别由不同的服务管理，甚至存储在独立的数据库中。

这时，Kafka事务消息可以解决"扣款消息"和"存款消息"的原子性发布问题。但更重要的是，它解决了"更新数据库"和"发送消息"这两个操作之间的原子性问题。

```java
// ❌ 错误方式：先更新DB再发消息（中间可能崩溃）
jdbcTemplate.update("UPDATE account SET balance = balance - 100 WHERE id = ?", accountA);
// 如果这行代码执行完后、Kafka消息发送前，服务崩溃了：
kafkaTemplate.send("transfer-events", transferEvent);  // 这条消息永远不会发出
// 结果是：A扣了100，但B不知道这件事，B永远不会收到100

// ❌ 错误方式：先发消息再更新DB（中间可能崩溃）
kafkaTemplate.send("transfer-events", transferEvent);
// 如果这行代码执行完后、DB更新前，服务崩溃了：
jdbcTemplate.update("UPDATE account SET balance = balance - 100 WHERE id = ?", accountA);
// 结果是：B收到了100到账的消息（消费者已经处理了），但A根本没扣款
```

Kafka事务保证了"DB更新"和"消息发送"要么都成功，要么都失败。这称为"原子写入"。

## 11.2 实现原理

### 事务的两阶段提交

Kafka的事务实现借鉴了分布式事务中的两阶段提交思想，但针对Kafka的日志模型做了专门优化：

**第一阶段：原子写入**
Producer开启事务后，发送的所有消息都不会对消费者可见。这些消息被标记为"未提交"状态。

**第二阶段：提交或中止**
Producer发送Commit请求后，Broker将事务ID标记为已提交。此时，这些消息才对 `read_committed` 隔离级别的消费者可见。

**关键机制**：
- **Transaction Coordinator**：每个Producer的 `transactional.id` 对应一个Transaction Coordinator（是一个Broker）。Coordinator负责管理事务的状态。
- **__transaction_state**：存储所有事务状态信息的内部Topic。Coordinator将事务的PREPARE、COMMIT、ABORT状态写入这个Topic，用于故障恢复。
- **Control Message**：事务提交或中止时，Broker在日志中写入一条Control Message（控制消息），标记事务的边界。消费者通过识别Control Message来决定是否将消息暴露给上层应用。

### Exactly-Once语义

幂等性（`enable.idempotence=true`）和事务是两个不同层面但互补的机制：

- **幂等性**：防止Producer重试导致的消息重复。确保相同的(PID, Sequence Number)只能写入一次。
- **事务**：保证跨分区的原子写入。要么所有分区的消息都写入成功并对外可见，要么全部不可见。

两者结合，加上 `read_committed` 隔离级别，构成了端到端的Exactly-Once语义。

## 11.3 完整代码实现

### 事务生产者

```java
@Configuration
public class TransactionalConfig {
    
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // 事务配置
        props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "transfer-tx");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        
        DefaultKafkaProducerFactory<String, Object> factory = 
            new DefaultKafkaProducerFactory<>(props);
        factory.setTransactionIdPrefix("tx-");
        return factory;
    }
    
    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}

@Service
public class TransferService {
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    
    // 通过Kafka事务保证"DB更新"和"消息发送"的原子性
    @Transactional
    public void transfer(String fromAccount, String toAccount, BigDecimal amount) {
        // 1. 扣减源账户（数据库操作）
        jdbcTemplate.update(
            "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?",
            amount, fromAccount, amount);
        
        // 2. 增加目标账户（数据库操作）
        jdbcTemplate.update(
            "UPDATE accounts SET balance = balance + ? WHERE id = ?",
            amount, toAccount);
        
        // 3. 发送转账完成事件（Kafka操作，和DB在同一事务中）
        kafkaTemplate.send("transfer-events", 
            new TransferEvent(fromAccount, toAccount, amount, "SUCCESS"));
        
        // 如果第1步或第2步失败，第3步也会回滚（Kafka事务中止）
        // 如果第3步失败，第1步和第2步也会回滚（数据库事务回滚）
    }
}
```

### 事务消费者

```java
@Bean
public ConsumerFactory<String, Object> consumerFactory() {
    Map<String, Object> props = new HashMap<>();
    props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
    props.put(ConsumerConfig.GROUP_ID_CONFIG, "transfer-processor");
    props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
    props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
    return new DefaultKafkaConsumerFactory<>(props);
}

@KafkaListener(topics = "transfer-events", groupId = "notify-service")
public void handleTransfer(TransferEvent event) {
    // 只有在read_committed隔离级别下，这里收到的一定是已提交的事务消息
    // 如果事务被中止，消费者不会看到这些消息
    notificationService.sendTransferNotification(event);
}
```

## 11.4 潜在风险

| 风险 | 说明 | 解决方案 |
|------|------|---------|
| 事务超时 | 事务超过transaction.timeout.ms | 合理设置超时时间 |
| 性能下降 | 事务引入额外延迟 | 只在关键场景使用 |
| 僵尸Producer | 旧实例持有事务ID | 设置合理的transactional.id过期时间 |

事务大约比非事务发送多4倍延迟，吞吐降低约50%。建议只在需要精确一次语义的场景使用事务，大多数场景使用幂等性（`enable.idempotence=true`）就够了。

## 11.5 典型问题

**问题：如何结合数据库事务和Kafka事务实现强一致性？**

推荐Outbox模式：先写入本地消息表（DB事务），异步任务从消息表读取并发送到Kafka，发送成功后删除消息表记录。或者使用CDC监听数据库的outbox表，Debezium将outbox变更推送到Kafka，天然保证数据库和消息的原子性。