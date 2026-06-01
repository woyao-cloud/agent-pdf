# 第12章 大规模消息广播

## 12.1 场景故事：配置秒级生效

### 配置下发的挑战

在微服务架构中，一个常见的需求是向所有服务实例广播一条消息。典型的例子是配置中心下发：当运维人员修改了某个配置项（比如开关切换、限流阈值调整），需要所有服务实例在秒级内收到新配置并生效。

如果每个服务实例都去轮询配置中心，比如每1分钟拉取一次，那么最短的生效延迟是几秒，最长是1分钟。但如果将配置变更事件推送到Kafka，所有服务实例作为独立消费者组监听配置Topic，则配置变更可以在**毫秒级**内推送到所有实例。

```
运维修改配置 → 配置变更事件 → Kafka Topic "app-config"
                               ↓         ↓         ↓
                             服务A实例1  服务A实例2  服务B实例1
                             (独立Group) (独立Group) (独立Group)
```

### 广播的实现方式

Kafka中实现广播有两种方式：

**方式一：每个消费者使用独立Group ID（推荐）**
每个实例的 `group.id` 不同，这样同一个Topic的消息会被投递到每个实例。这是Kafka广播最自然的实现方式。

```java
@KafkaListener(topics = "app-config", 
    groupId = "#{'config-' + T(java.net.InetAddress).getLocalHost().getHostName()}")
public void onConfigChange(String message) {
    // 每个实例都会收到这条消息
}
```

**方式二：使用assign手动分配分区**
不订阅Topic，而是手动将Topic的所有Partition分配给消费者。这种方式更灵活，但Offset管理需要自己实现。

```java
TopicPartition tp = new TopicPartition("app-config", 0);
consumer.assign(Arrays.asList(tp));
consumer.seekToBeginning(Arrays.asList(tp));
```

## 12.2 核心配置

广播场景下，消费者的配置需要注意：

```properties
# 广播消费者配置
auto.offset.reset=latest          # 只消费新消息（避免重启时重放历史消息）
enable.auto.commit=true           # 广播场景下自动提交即可
auto.commit.interval.ms=5000
max.poll.records=100

# Topic配置：广播消息不需要长期保留
log.cleanup.policy=delete
log.retention.ms=3600000          # 保留1小时
```

## 12.3 典型应用

**缓存刷新广播**：当某个数据在数据库中被修改，所有服务实例需要清除本地缓存。通过广播Topic通知所有实例。

**全局开关切换**：灰度发布时，通过广播Topic实时切换某个功能的状态。

**热点数据预热**：当某个数据被判定为热点（比如某个商品突然爆火），通过广播通知所有服务实例提前加载该数据到本地缓存。

## 12.4 潜在风险

广播机制的主要风险是消息风暴——大量实例同时收到消息并执行操作。如果广播消息触发的是数据库操作，可能导致所有实例同时查询数据库，造成"缓存击穿"效应。建议在收到广播消息后添加随机延迟再执行操作：

```java
@KafkaListener(topics = "cache-invalidation")
public void onCacheInvalidation(String key) {
    // 添加随机延迟（0-5秒），避免同时回源
    Thread.sleep(ThreadLocalRandom.current().nextLong(5000));
    localCache.evict(key);
}
```

## 12.5 关键技能

- 理解Kafka广播和点对点的区别
- 掌握独立Group实现广播的原理
- 熟悉广播场景下的Offset管理