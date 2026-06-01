# 第19章 典型问题诊断

## 19.1 消息发送失败

### 诊断步骤

```
1. 检查网络连通性
   telnet kafka-broker 9092

2. 检查Broker日志
   grep ERROR /data/kafka/logs/server.log

3. 检查Producer端错误日志
   看回调中的异常类型

4. 确认配置正确
   bootstrap.servers, acks, retries
```

### 常见错误

| 错误 | 可能原因 | 解决方案 |
|------|---------|---------|
| LEADER_NOT_AVAILABLE | 分区Leader选举中 | 等待选举完成或触发新选举 |
| NOT_ENOUGH_REPLICAS | ISR数量不足 | 检查副本同步状态 |
| RECORD_TOO_LARGE | 消息超过max.request.size | 增大限制或拆分消息 |
| NETWORK_EXCEPTION | 网络超时/断开 | 检查网络和防火墙 |
| TOPIC_AUTHORIZATION_FAILED | ACL权限不足 | 检查ACL配置 |

## 19.2 消费者不消费

### 诊断步骤

```
1. 检查消费者组状态
   kafka-consumer-groups.sh --describe --group my-group

2. 检查offset情况
   是否有Lag？offset是否在范围内？

3. 检查Rebalance
   consumer日志中是否频繁触发Rebalance？

4. 检查消费超时
   处理时间是否超过max.poll.interval.ms？
```

### 解决方案

```java
// 频繁Rebalance的解决方案
// 1. 增大session.timeout.ms
// 2. 增大heartbeat.interval.ms  
// 3. 减小max.poll.records
// 4. 优化消费逻辑（减少每条消息的处理时间）
// 5. 使用异步处理

@KafkaListener(topics = "slow-topic")
public void consumeSlow(String msg) {
    CompletableFuture.runAsync(() -> {
        // 异步处理，不阻塞poll
        process(msg);
    });
    // 立即返回，快速poll
}
```

## 19.3 消息积压

### 诊断

```bash
# 查看各分区Lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group my-group --members --verbose

# 输出包含每个消费者的分配分区和Lag
```

### 处理

```java
// 1. 增加消费者（最多和分区数相等）
@KafkaListener(topics = "orders", concurrency = "6")
// 如果原来有6个分区，可以启动6个消费者线程

// 2. 优化消费逻辑
// 使用批量处理
@KafkaListener(topics = "orders")
public void consumeBatch(List<ConsumerRecord<String, String>> records) {
    // 批量写入数据库
    jdbcTemplate.batchUpdate(sql, batchArgs);
}

// 3. 临时扩容
// 创建更多分区的Topic，重新投递消息
// 或者增加Kafka集群的消费能力
```

## 19.4 数据不一致

### 诊断

```bash
# 1. 校验Topic内的消息数
kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 \
  --topic orders --time -1

# 2. 对比数据库记录数
# 如果两者不一致，说明存在数据丢失或重复

# 3. 使用DumpLogSegments检查日志
kafka-run-class.sh kafka.tools.DumpLogSegments \
  --files /data/kafka/logs/orders-0/00000000000000000000.log
```

### 修复

```java
// 数据对账修复
@Component
public class DataReconciliation {
    
    @Scheduled(fixedRate = 3600000)  // 每小时
    public void reconcile() {
        // 1. 从Kafka读取最近1小时的消息
        // 2. 从数据库读取对应的记录
        // 3. 逐条比对
        // 4. 发现不一致的处理方案：
        //    - 缺失数据：重新投递
        //    - 多余数据：补偿或忽略
        //    - 状态不一致：根据事件时间戳重新计算
    }
}
```

## 19.5 性能问题诊断

### 常用诊断命令

```bash
# 1. 查看Broker线程状态
jstack <kafka_pid> | grep -E "io|network|replica" | head -20

# 2. 查看磁盘I/O
iostat -x 1
# 重点关注：await（IO等待时间）和 %util（磁盘利用率）

# 3. 查看网络流量
sar -n DEV 1
# 检查网络吞吐是否达到上限

# 4. 查看GC情况
jstat -gcutil <kafka_pid> 1000
# 检查GC频率和暂停时间

# 5. JMX监控
# 使用JMX工具连接Kafka
# 查看关键指标：请求速率、延迟、错误率
```

### 性能问题速查

| 现象 | 可能原因 | 解决方案 |
|------|---------|---------|
| 生产者延迟高 | 批次太小、未压缩 | 增大batch.size、启用压缩 |
| 消费者Lag高 | 处理逻辑慢、分区少 | 优化处理、增加分区 |
| Broker响应慢 | 磁盘IO瓶颈 | 使用SSD、增加磁盘 |
| 网络吞吐低 | 带宽不足 | 启用压缩、升级网络 |
| GC暂停长 | 堆内存不足 | 增大堆、使用G1GC |