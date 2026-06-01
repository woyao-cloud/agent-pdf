# 第12章 大规模消息广播

## 场景描述

消息广播是指一条消息被多个独立的消费者组消费的场景。Kafka的发布-订阅模型天然支持广播：不同的消费者组都可以独立消费同一个Topic。

### 解决的问题

```
传统点对点：
生产者 → 队列 → 消费者A（消费后消息被删除）
                 消费者B看不到这条消息

Kafka广播：
生产者 → Topic（消息持久化）
          ↓        ↓        ↓
        消费者组A  消费者组B  消费者组C
        （全量消费）（全量消费）（全量消费）
```

**典型广播场景**：
```
配置下发：一次配置变更 → 所有服务实例收到
状态同步：一次状态变更 → 所有节点更新本地缓存
全局通知：一次系统公告 → 所有用户收到推送
缓存刷新：一次缓存失效 → 所有节点清除本地缓存
```

### 实现原理

**广播的实现方式**：

```
方式一：每个消费者一个独立Group（真正的广播）
- Producer → Topic → ConsumerGroup1（服务A）
                    → ConsumerGroup2（服务B）
                    → ConsumerGroup3（服务C）

方式二：一个Group内的所有实例（负载均衡，不是广播）
- Producer → Topic → ConsumerGroup（只有一个实例能消费）
```

**广播消费要点**：
```
1. 每个实例使用独立的group.id
2. 或者不使用groupId（assign手动分配分区）
3. 每条消息被每个消费者组独立消费一次
```

### Docker Compose

```yaml
# docker/scenario-12-broadcast/docker-compose.yml
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

  # 模拟多个广播消费者
  app-instance-1:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [kafka]
    entrypoint: ["kafka-console-consumer", 
      "--bootstrap-server", "kafka:9092",
      "--topic", "broadcast-config",
      "--group", "instance-1",      # 每个实例独立group
      "--from-beginning"]

  app-instance-2:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [kafka]
    entrypoint: ["kafka-console-consumer",
      "--bootstrap-server", "kafka:9092",
      "--topic", "broadcast-config",
      "--group", "instance-2",      # 独立group
      "--from-beginning"]
```

### Java示例代码

```java
// ============ 1. 配置广播场景 ============
@Service
public class ConfigBroadcastService {
    
    // 每个实例使用不同的groupId实现广播
    @KafkaListener(
        topics = "app-config",
        groupId = "#{T(java.util.UUID).randomUUID().toString()}"  // 每个实例随机ID
    )
    public void onConfigChange(ConsumerRecord<String, String> record) {
        log.info("实例{}收到配置更新: key={}, value={}, offset={}",
            instanceId, record.key(), record.value(), record.offset());
        
        String configKey = record.key();
        String configValue = record.value();
        
        // 更新本地缓存
        localCache.put(configKey, configValue);
        
        // 根据配置执行操作
        switch (configKey) {
            case "feature.switch":
                featureToggleManager.setEnabled(configValue);
                break;
            case "rate.limit":
                rateLimiter.updateLimit(Integer.parseInt(configValue));
                break;
            case "blacklist":
                updateBlacklist(configValue);
                break;
        }
    }
}

// ============ 2. 本地缓存刷新广播 ============
@Component
public class CacheSyncBroadcast {
    
    private final CacheManager cacheManager;
    
    // 所有实例都收到缓存刷新通知
    @KafkaListener(
        topics = "cache-refresh",
        groupId = "cache-syncer-${spring.cloud.client.hostname}"
        // 每个实例ID不同，实现广播
    )
    public void onCacheRefresh(String cacheName) {
        log.info("收到缓存刷新通知: {}", cacheName);
        cacheManager.getCache(cacheName).clear();
    }
    
    // 发布缓存刷新事件
    public void broadcastCacheRefresh(String cacheName) {
        kafkaTemplate.send("cache-refresh", cacheName);
    }
}

// ============ 3. 广播的生产者 ============
@Service
public class BroadcastPublisher {
    
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // 发布全局广播消息
    public void broadcast(String topic, String key, Object message) {
        // 广播消息通常不需要key，但可以用key做分区路由
        kafkaTemplate.send(topic, key, message);
    }
    
    // 配置变更广播（所有实例立即生效）
    public void publishConfigChange(String key, String value) {
        kafkaTemplate.send("app-config", key, value);
    }
    
    // 全局通知（所有用户在线推送）
    public void publishGlobalNotification(Notification notification) {
        kafkaTemplate.send("global-notification", notification);
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **实例数膨胀** | 广播场景下消费者组过多 | 监控消费者组数量，设置上限 |
| **重复处理** | 所有实例都处理全量消息 | 只增量更新、幂等处理 |
| **消息风暴** | 广播消息数量庞大 | 合并消息、设置速率限制 |
| **重启重放** | 实例重启后重新消费所有消息 | 使用最新offset(auto.offset.reset=latest) |

**广播的配置建议**：
```properties
# 广播消费者配置
auto.offset.reset=latest          # 只消费新消息
enable.auto.commit=true           # 自动提交
auto.commit.interval.ms=5000
max.poll.records=100

# Topic配置
log.cleanup.policy=delete         # 定期清理
log.retention.ms=3600000          # 保留1小时（广播消息通常不需要长时间保留）
```

### 典型问题处理

**问题：广播场景下如何避免消费者组数量爆炸？**

```
方案1：使用通配符Group
- service-A-${hostname} 统一前缀
- 便于监控和管理

方案2：使用固定Group + 手动分配分区
- 不订阅，使用assign手动分配
- 每个实例独立管理offset

方案3：限制广播范围
- 按环境分Topic：app-config-dev, app-config-prod
- 按业务域分Topic：config-order, config-payment
```

### 关键技能

- 理解Kafka广播和点对点的区别
- 掌握独立Group实现广播的原理
- 熟悉广播场景下的Offset管理
- 了解广播消息的幂等处理和去重
- 掌握配置中心和本地缓存的实时同步方案