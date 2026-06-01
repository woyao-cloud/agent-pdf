# 第20章 面试进阶指南

## 20.1 基础面试题

### Q1：Kafka为什么快？请从四个层面回答

```
1. 顺序写磁盘
   机械硬盘的顺序写性能（200MB/s）比随机写（0.1MB/s）快2000倍
   SSD的顺序写和随机写差距缩小，但顺序写仍然有明显优势
   Kafka追加消息到文件末尾，不做随机写入

2. 零拷贝（Zero-Copy）
   传统：磁盘→页缓存→应用内存→Socket缓存→网卡（4次拷贝）
   零拷贝：磁盘→页缓存→网卡（2次拷贝，sendfile系统调用）
   消费者读消息时，数据从磁盘到网卡不经过JVM堆

3. 批量处理
   生产者批量发送（batch.size + linger.ms）
   消费者批量拉取（fetch.min.bytes）
   Broker批量存储（磁盘顺序写更大批次）
   批量意味着单条消息的开销被均摊到一批中

4. 分区并行
   Topic分多个Partition，分布在多台Broker上
   多个Partition并行读写，总吞吐 = 单Partition吞吐 × 分区数
   线性扩展能力
```

### Q2：如何保证消息不丢失？

```
从三个层面回答，缺一不可：

生产者→Broker：
- acks=all：等待所有ISR副本确认
- enable.idempotence=true：防止重试导致的数据错乱
- retries=3：网络抖动时自动重试

Broker存储：
- replication.factor≥3：3副本，允许1-2个Broker宕机
- min.insync.replicas=2：至少2个ISR确认才算写入成功
- unclean.leader.election.enable=false：不允许非ISR副本成为Leader

Broker→消费者：
- enable.auto.commit=false：手动提交offset
- 先处理消息，后提交offset
- 处理失败不提交offset
```

### Q3：什么情况下消息会丢失？

```
1. acks=0或acks=1，且Leader宕机（最常见的丢失原因）
2. Producer端未配置retries，网络闪断后不重试
3. 副本数=1，磁盘损坏（单点故障）
4. 消费者自动提交offset，且在处理前崩溃（消费端丢失）
5. 消息超过了max.request.size且未处理（Producer直接抛出异常）
```

## 20.2 中高级面试题

### Q4：Kafka的ISR机制如何工作？

```
ISR（In-Sync Replicas）是Kafka保证数据一致性的核心机制：

1. ISR中的副本是与Leader保持同步的副本集合
2. Follower定期从Leader拉取消息（replica.fetch.max.bytes控制批量）
3. 如果Follower超过 replica.lag.timeout.ms（默认30秒）未同步，被踢出ISR
4. 生产者写数据时，min.insync.replicas决定了最少需要多少个ISR确认
5. Leader宕机时，只在ISR中选举新Leader

ISR的设计目标：在一致性和可用性之间取得平衡
- 不要求所有Follower同步（否则任何Follower的慢速都会阻塞写入）
- 不允许过于落后的Follower成为Leader（否则丢失的数据太多）
```

### Q5：Kafka的事务是如何实现的？

```
1. Producer启动时向Transaction Coordinator注册transactional.id
2. Producer发送数据时，Coordinator记录事务状态到__transaction_state
3. Producer发送COMMIT或ABORT标记
4. Broker在日志中写入Control Message（事务边界标记）
5. 消费者设置isolation.level=read_committed，跳过未提交的消息

关键限制：
- 事务只能在单个application.id内（跨实例事务不支持）
- 事务引入了额外延迟（约4倍性能下降）
- 事务ID必须唯一，否则会发生事务冲突
```

### Q6：如何设计消费者的重试机制？

```
推荐方案：@RetryableTopic（Spring Kafka自带）

1. 区分可重试和不可重试异常
   - 可重试：网络超时、服务不可用
   - 不可重试：数据校验失败、空指针

2. 指数退避重试策略
   - 第1次失败：等待1秒
   - 第2次失败：等待2秒
   - 第3次失败：等待4秒

3. 重试耗尽后进入死信队列（DLQ）

4. DLQ监控告警，人工介入或自动补偿
```

## 20.3 架构设计题

### Q7：设计一个订单系统的事件驱动架构

```
Topic设计：
- order-events: 订单领域事件（12分区，3副本）
- payment-events: 支付领域事件（6分区，3副本）
- inventory-events: 库存领域事件（6分区，3副本）

生产者：
- 订单服务：发布OrderCreated、OrderPaid事件
- 支付服务：发布PaymentCompleted事件
- 库存服务：发布InventoryDeducted事件

消费者：
- 通知服务（独立group）：消费所有事件，发送通知
- 分析服务（独立group）：消费所有事件，实时统计
- 物流服务（独立group）：消费OrderPaid事件，触发配送

关键设计决策：
- 每个事件使用aggregateId作为Key，保证同一订单的顺序
- 每个服务使用独立消费者组，实现广播
- 关键事件使用幂等消费（订单状态机）
- 失败消息进入DLQ，配合重试机制
```

## 20.4 避坑总结

| 错误做法 | 后果 | 正确做法 |
|---------|------|---------|
| 同步发送.get() | 吞吐从百万降到几千 | 使用异步+回调 |
| 自动提交offset | 重复消费或丢消息 | 手动提交，先处理再提交 |
| 副本数设为1 | 单点故障，磁盘坏=数据丢 | 至少3副本 |
| 分区数设太少 | 无法水平扩展消费者 | 从6-12开始，按需增加 |
| max.poll.interval.ms偏小 | 频繁Rebalance | 根据处理时间合理设置 |
| 不设置压缩 | 网络和磁盘浪费 | 启用snappy压缩 |