# 第20章 面试进阶指南

## 20.1 基础概念

### 高频问题

**Q: Kafka为什么快？**

```
1. 顺序写磁盘：顺序写比随机写快6000倍
2. 零拷贝：数据从磁盘→页缓存→网卡，不经应用内存
3. 批量处理：批量发送、批量压缩、批量拉取
4. 分区并行：Topic分区并行读写
5. O(1)的读写：不管数据量多大，读写性能恒定
```

**Q: Kafka如何保证消息不丢失？**

```
三个层面保证：
1. Producer → Broker：acks=all + retries + 幂等性
2. Broker存储：多副本( replication.factor≥3) + ISR同步
3. Broker → Consumer：手动提交offset + 消费成功再提交

注意：无法保证绝对不丢（磁盘坏道、断电等情况）
但以上配置可以保证99.99%不丢失
```

**Q: Kafka的ISR是什么？**

```
ISR (In-Sync Replicas) = 与Leader保持同步的副本集合
- 只有ISR中的副本有资格成为新Leader
- replica.lag.timeout.ms 决定副本是否被踢出ISR
- min.insync.replicas 决定最小ISR数量
```

**Q: Consumer发生了Rebalance会怎样？**

```
触发条件：消费者加入/退出、分区数变化、订阅Topic变化
影响：
1. 所有消费者停止消费
2. 重新分配分区
3. 可能导致重复消费（需要处理offset提交）
4. 建议使用静态消费组（Static Membership）减少Rebalance
```

## 20.2 中高级问题

**Q: 如何实现Exactly-Once语义？**

```
生产端：enable.idempotence=true（去重）
消费端：幂等性设计 + 事务性offset提交
端到端：Kafka Transaction（read_committed隔离级别）

但Exactly-Once是有成本的：
- 性能下降约50%
- 需要额外的存储记录处理状态
```

**Q: 为什么Kafka不支持消息TTL？**

```
Kafka的设计哲学：消息是日志，不是队列
- 日志需要持久化，TTL不符合日志语义
- 通过日志保留策略(log.retention.ms)代替TTL
- 不同Topic可以设置不同的保留策略
- 通过compact策略保留每个key的最新值
```

**Q: Kafka性能调优的主要参数？**

```
Producer: batch.size, linger.ms, compression.type, buffer.memory
Broker: num.network.threads, num.io.threads, log.flush.*
Consumer: fetch.min.bytes, max.poll.records, enable.auto.commit
Topic: partitions, replication.factor, log.retention.ms
```

**Q: 什么是脑裂问题？Kafka如何避免？**

```
脑裂：集群中出现多个Controller
Kafka解决：基于ZooKeeper的临时节点（Ephemeral Node）
- Controller在ZK上创建临时节点
- 旧Controller的临时节点过期后，新Controller才能创建
- ZK的强一致性保证同时只有一个Controller
- KRaft模式下使用Raft协议解决
```

## 20.3 架构设计题

**Q: 设计一个订单消息系统，要求：高吞吐、不丢消息、支持回溯消费**

```
1. Topic设计
   Topic: order-events (12分区, 3副本)
   Key: orderId (保证同一订单的顺序)
   
2. 生产端
   acks=all, enable.idempotence=true
   异步发送+回调重试
   
3. 消费端
   手动提交offset
   幂等消费（订单状态机）
   失败发送到DLQ
   
4. 回溯消费
   offset重置功能
   日志保留7天
```

**Q: 设计一个实时排行榜，要求秒级更新TOP 100**

```
方案1：Kafka Streams + Redis
1. Kafka流式处理实时聚合分数
2. Redis Sorted Set存储排行榜
3. 每个窗口输出TOP 100到Redis

方案2：Kafka + Flink
1. Kafka接入原始数据
2. Flink窗口聚合
3. 输出结果到Redis/MySQL
```

## 20.4 避坑指南

| 常见错误 | 后果 | 正确做法 |
|---------|------|---------|
| 同步发送.get() | 吞吐急剧下降 | 使用异步+回调 |
| 自动提交offset | 重复消费/丢消息 | 手动提交 |
| 单消费者处理耗时 | 触发Rebalance | 异步处理或调大超时 |
| 分区数过少 | 扩展性不足 | 根据吞吐估算 |
| 副本数=1 | 单点故障 | 至少3副本 |
| 无监控 | 问题发现滞后 | 部署Prometheus+Grafana |