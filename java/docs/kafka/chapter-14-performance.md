# 第14章 性能优化

## 14.1 生产者性能优化

### 核心优化参数

```properties
# ========== 批量发送优化 ==========
batch.size=65536                  # 64KB批次（默认16KB）
linger.ms=50                      # 等待50ms（默认0，立即发送）
compression.type=snappy           # 压缩（减少网络IO）
buffer.memory=134217728           # 128MB缓冲区（默认32MB）

# ========== 并发优化 ==========
max.in.flight.requests.per.connection=5  # 未确认请求数
# 启用幂等性时此值必须≤5

# ========== 异步优化 ==========
# 使用异步回调而非同步.get()
producer.send(record, (metadata, exception) -> {
    if (exception != null) handleError(record, exception);
});
```

**调优效果**：
```
批处理关闭：  吞吐 2万 msg/s
batch=64KB：  吞吐 15万 msg/s
batch+压缩：  吞吐 30万 msg/s
```

### 分区策略优化

```java
// 自定义分区器：根据业务特征分布数据
public class BusinessPartitioner implements Partitioner {
    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {
        // 高优消息分配到特定分区
        String msgType = extractMsgType(value);
        if ("HIGH_PRIORITY".equals(msgType)) {
            return 0;  // 固定分区，保证顺序
        }
        // 普通消息均匀分布
        return Math.abs(key.hashCode()) % cluster.partitionCountForTopic(topic);
    }
}
```

## 14.2 Broker性能优化

### 操作系统优化

```properties
# 文件系统优化
# 挂载参数：noatime,nodiratime（减少文件访问时间更新）

# 内核参数
vm.swappiness=1                   # 尽量不使用swap
vm.dirty_ratio=80                 # 脏页比例
vm.dirty_background_ratio=5       # 后台脏页清理

# 网络优化
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.ipv4.tcp_window_scaling=1
```

### JVM优化

```properties
# Kafka Broker JVM配置
KAFKA_HEAP_OPTS="-Xmx6g -Xms6g"   # 堆大小（不超过30GB）
KAFKA_JVM_PERFORMANCE_OPTS="
  -server
  -XX:+UseG1GC
  -XX:MaxGCPauseMillis=20
  -XX:InitiatingHeapOccupancyPercent=35
  -XX:+DisableExplicitGC
  -Djava.awt.headless=true"
```

### Kafka配置优化

```properties
# ========== 日志刷盘 ==========
log.flush.interval.messages=10000     # 消息数触发刷盘
log.flush.interval.ms=1000            # 时间触发刷盘
# 使用副本机制保证持久化，而非频繁刷盘

# ========== 网络和IO ==========
num.network.threads=3                 # 网络线程数（CPU核心数）
num.io.threads=8                      # IO线程数（2×CPU核心数）
num.replica.fetchers=2                # 副本拉取线程

# ========== 日志分段 ==========
log.segment.bytes=1073741824          # 1GB每段
log.roll.hours=168                    # 7天滚动

# ========== 文件描述符 ==========
# ulimit -n 100000（至少10万）
```

## 14.3 消费者性能优化

### 消费调优参数

```properties
# ========== 拉取优化 ==========
fetch.min.bytes=1024               # 最小拉取字节（减少请求次数）
fetch.max.wait.ms=500              # 最大等待时间
max.partition.fetch.bytes=1048576  # 每分区最大拉取1MB

# ========== 处理优化 ==========
max.poll.records=500               # 每次poll记录数
max.poll.interval.ms=300000        # 两次poll最大间隔（处理超时时间）

# ========== 并发处理 ==========
# 增加分区数 = 增加并发消费能力
# 增加消费者实例 = 并行度（受分区数限制）
```

### 并行消费模型

```java
// 并行消费（每个分区一个处理线程）
@Configuration
public class ParallelConsumerConfig {
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String>
            parallelContainerFactory(ConsumerFactory<String, String> factory) {
        
        ConcurrentKafkaListenerContainerFactory<String, String> containerFactory =
            new ConcurrentKafkaListenerContainerFactory<>();
        containerFactory.setConsumerFactory(factory);
        containerFactory.setConcurrency(3);  // 3个消费者线程
        // 注意：concurrency <= partition count
        
        containerFactory.getContainerProperties()
            .setIdleBetweenPolls(100);  // poll间隔100ms
        
        return containerFactory;
    }
}
```

## 14.4 架构优化

### 分区数确定

```properties
# 分区数计算方法
# 目标吞吐 / 单分区吞吐 = 所需分区数
# 保守策略：预计峰值吞吐的2倍

# 经验值：
# 日志收集：分区数 ≈ 日志源数量
# 消息队列：分区数 ≈ 预计消费者数
# 流处理：  分区数 ≈ stream线程数

# 注意：分区数过多会增加Leader选举和文件管理开销
```

### 大消息处理

```java
// 方案1：消息体引用（推荐）
// 发送小消息体，大内容存外部存储
public class LargeMessageHandler {
    
    public void sendLargeMessage(byte[] content) {
        String contentId = UUID.randomUUID().toString();
        // 1. 大内容存到对象存储
        storageService.put(contentId, content);
        // 2. 发送引用消息到Kafka
        MessageRef ref = new MessageRef(contentId, content.length);
        kafkaTemplate.send("topic", ref);
    }
    
    @KafkaListener(topics = "topic")
    public void consumeMessage(MessageRef ref) {
        // 消费者根据引用取回内容
        byte[] content = storageService.get(ref.getContentId());
        processContent(content);
    }
}
```

**Kafka消息大小限制**：
```properties
# Broker端
message.max.bytes=10485760          # 最大10MB（默认1MB）
replica.fetch.max.bytes=10485760    # 副本拉取也同步调整

# Producer端
max.request.size=10485760           # 最大请求大小

# Consumer端
max.partition.fetch.bytes=11534336  # 比message.max.bytes稍大
```

## 14.5 性能基准对比

| 优化 | 吞吐（msg/s） | 延迟（ms） | 说明 |
|------|--------------|-----------|------|
| 无优化 | 20,000 | 5 | 默认配置 |
| +批量(batch=64KB) | 150,000 | 10 | 吞吐提升7.5x |
| +压缩(snappy) | 300,000 | 15 | 吞吐再提升2x |
| +异步回调 | 500,000 | 20 | 消除发送阻塞 |
| +多分区(12) | 1,200,000 | 25 | 并行度提升 |

> **优化原则**：先定位瓶颈（Producer/Broker/Consumer/网络），再有针对性地优化