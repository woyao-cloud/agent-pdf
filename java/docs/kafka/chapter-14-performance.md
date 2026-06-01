# 第14章 性能优化

## 14.1 性能优化的方法论

### 先测量，后优化

性能优化的第一条原则是：**永远不要凭感觉优化**。在没有数据支撑的情况下，"觉得某个参数应该调大"往往是一种浪费时间的猜测。正确的流程是：

1. **建立性能基线**：在当前的配置下，用JMH或Kafka自带的性能测试工具测量吞吐量、延迟、CPU使用率等指标
2. **确定瓶颈**：通过Profiler（Async Profiler、JFR）定位瓶颈——是Producer发送慢？Broker磁盘IO高？还是Consumer处理慢？
3. **针对性调优**：只优化瓶颈环节，不要盲目调整所有参数
4. **验证效果**：再次测量，确认优化确实带来了提升，且没有引入副作用
5. **迭代**：瓶颈可能转移到其他环节，继续从步骤2开始

### 常用性能测试工具

```bash
# Kafka自带的生产者性能测试
kafka-producer-perf-test.sh \
  --topic perf-test \
  --num-records 1000000 \
  --record-size 1024 \
  --throughput -1 \
  --producer-props bootstrap.servers=localhost:9092 acks=1

# Kafka自带的消费者性能测试
kafka-consumer-perf-test.sh \
  --topic perf-test \
  --messages 1000000 \
  --broker-list localhost:9092
```

## 14.2 生产者端优化

### 批量发送参数调优

生产者的优化核心是**增大批量**——让每次网络请求携带更多的消息，均摊网络开销。

```properties
# 批量大小：从16KB增大到64KB
batch.size=65536

# 等待时间：从0增大到10ms（让消息有更多时间凑成更大的批次）
linger.ms=10

# 压缩：从none改为snappy
compression.type=snappy
```

这三个参数配合使用的效果：

| 配置组合 | 延迟 | 吞吐 | 说明 |
|---------|------|------|------|
| batch=16KB, linger=0, 无压缩 | 5ms | 2万/s | 默认配置 |
| batch=64KB, linger=10, 无压缩 | 15ms | 8万/s | 延迟增加10ms，吞吐提升4倍 |
| batch=64KB, linger=10, snappy | 15ms | 15万/s | 压缩进一步降低网络IO |
| batch=128KB, linger=50, snappy | 55ms | 25万/s | 延迟更高，但吞吐再翻倍 |

### 异步发送

```java
// ❌ 错误：同步发送（性能杀手）
producer.send(record).get();  // 每次send都等待

// ✅ 正确：异步发送（高性能）
producer.send(record, (metadata, exception) -> {
    if (exception != null) {
        // 处理失败
    }
});
```

同步发送将串行的RTT（往返时间）叠加到了每次发送上，在网络延迟为5ms时，每秒只能发送200条消息。异步发送将网络等待放在后台线程，主线程可以持续发送消息，吞吐量提升百倍以上。

## 14.3 Broker端优化

### 操作系统优化

Kafka重度依赖操作系统的页缓存（Page Cache）和磁盘I/O。操作系统层面的优化对Kafka性能有显著影响：

```bash
# 1. 尽量使用SSD：随机I/O性能比HDD好100倍以上
# 2. 挂载参数：减少文件访问时间更新
mount -o noatime,nodiratime /dev/sdb /data/kafka

# 3. 内核参数
vm.swappiness=1                   # 尽量不使用swap
vm.dirty_ratio=80                 # 允许脏页占内存80%（Kafka使用页缓存）
vm.dirty_background_ratio=5       # 后台开始刷脏页的比例

# 4. 预留足够内存给页缓存
# 如果服务器有32GB内存，建议分配给Kafka JVM 8GB
# 剩余24GB留给操作系统页缓存
export KAFKA_HEAP_OPTS="-Xmx8g -Xms8g"
```

### JVM和Kafka配置

```properties
# JVM配置
KAFKA_HEAP_OPTS="-Xmx6g -Xms6g"
KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC -XX:MaxGCPauseMillis=20"

# Kafka关键配置
num.network.threads=4              # CPU核心数
num.io.threads=16                  # 2-4倍CPU核心数  
log.flush.interval.messages=Long.MAX_VALUE  # 依赖副本机制而非频繁刷盘
log.segment.bytes=1073741824       # 1GB
```

`log.flush.interval.messages` 这个参数容易被误解。很多开发者认为频繁调用fsync将数据刷入磁盘可以提高可靠性。实际上，Kafka不需要频繁刷盘——因为副本机制已经提供了数据持久性保证（即使一个Broker宕机，其他副本还有数据）。频繁刷盘反而会严重降低性能。

## 14.4 消费者端优化

```properties
# 增加每次拉取的数据量
fetch.min.bytes=65536              # 每次至少拉取64KB
fetch.max.wait.ms=500              # 最多等待500ms

# 增大每次拉取的记录数
max.poll.records=1000              # 每次处理1000条

# 注意：增大这些参数会增加延迟，但会显著提高吞吐
```

### 并行消费

消费者的并行度受限于Topic的分区数。如果Topic只有3个分区，即使启动10个消费者实例，也只能3个同时消费，剩余7个处于空闲状态。

提高消费者吞吐的正确方式是：
1. 确保Topic有足够的分区数（至少等于消费者的期望并发数）
2. 为每个分区分配一个处理线程（或使用ConcurrentKafkaListenerContainerFactory的concurrency参数）
3. 使用批量处理而非逐条处理

## 14.5 架构优化

### 确定合适的分区数

分区数直接影响并行度和吞吐量。以下是经验法则：

```
分区数 = max(预期消费者数, 预期吞吐 / 单分区吞吐)
```

| 场景 | 建议分区数 | 考量因素 |
|------|-----------|---------|
| 日志收集（50个数据源） | 12-24 | 数据源数量×0.5 |
| 事件驱动（10个微服务） | 6-12 | 消费者数×2 |
| 流处理聚合 | 12-24 | Stream线程数×2 |
| 核心业务Topic | 6-12 | 保守起步，按需增加 |

**经验法则：从6或12开始，监控Lag，按需增加。**

### 大消息处理

Kafka的消息大小默认限制为1MB。如果业务需要发送更大的消息（如包含图片或长文本），需要调整相关参数：

```properties
# Broker端
message.max.bytes=10485760         # 10MB
replica.fetch.max.bytes=10485760

# Producer端
max.request.size=10485760

# Consumer端
max.partition.fetch.bytes=11534336 # 比message.max.bytes稍大
```

但更好的方案是不在Kafka中传输大消息体，而是传输对象的引用：

```java
// 推荐方案：消息体只包含引用ID，大内容存外部存储
public class LargeMessageStrategy {
    
    public void sendAttachment(byte[] fileContent) {
        String fileId = UUID.randomUUID().toString();
        // 1. 文件存到对象存储（S3/MinIO）
        objectStorage.put(fileId, fileContent);
        // 2. 发送引用消息（只包含ID）
        kafkaTemplate.send("attachment-events", 
            new AttachmentEvent(fileId, fileContent.length));
    }
    
    @KafkaListener(topics = "attachment-events")
    public void consumeAttachment(AttachmentEvent event) {
        // 消费者按需取回文件内容
        byte[] content = objectStorage.get(event.getFileId());
    }
}
```

## 14.6 典型优化效果

| 优化操作 | 期望效果 | 适用场景 |
|---------|---------|---------|
| batch.size=64KB | 吞吐提升3-5倍 | 高吞吐场景 |
| compression=snappy | 吞吐提升2倍 | 文本消息 |
| 异步发送 | 吞吐提升100倍+ | 所有场景 |
| 增加分区数 | 吞吐线性提升 | 消费者能力不足 |
| 使用SSD | I/O延迟降低90% | Broker磁盘瓶颈 |