# 第7章 流式处理

## 场景描述

流式处理是Kafka最强大的能力之一。使用Kafka Streams或Kafka Consumer对实时数据进行处理（过滤、转换、聚合、关联），实现秒级延迟的数据处理管道。

### 解决的问题

**批处理的局限性**：
```
批处理（如Spark Batch）：每小时/每天跑一次 → 延迟高
流式处理（Kafka Streams） ：消息到达立即处理 → 秒级延迟
```

### 实现原理

**Kafka Streams架构**：

```
输入Topic → Stream Processor → 输出Topic
                ↓
           状态存储（RocksDB）
                ↓
           exactly-once语义
```

**核心概念**：
```
Stream：无界的数据序列
Table：有状态的数据视图（来自Stream的聚合）
KStream：每条记录都是独立事件
KTable：每条记录是key的当前状态（UPSERT语义）
GlobalKTable：所有分区的完整副本
```

**流-表对偶性**：
```
Stream = changelog（变更日志）
Table = snapshot（快照）
Stream → Table：聚合操作（count/reduce/aggregate）
Table → Stream：输出变更日志
```

### Docker Compose

```yaml
# docker/scenario-07-streaming/docker-compose.yml
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
      KAFKA_STREAMS_NUM_STREAM_THREADS: 2

  # 生成模拟数据
  data-generator:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [kafka]
    entrypoint: ["/bin/bash", "-c", "
      kafka-topics --create --topic raw-orders --bootstrap-server kafka:9092 --partitions 3 --if-not-exists;
      kafka-topics --create --topic user-orders-count --bootstrap-server kafka:9092 --partitions 3 --if-not-exists;
      kafka-topics --create --topic payment-alerts --bootstrap-server kafka:9092 --partitions 3 --if-not-exists;
      while true; do
        echo '{ \"userId\":\"u$RANDOM\", \"amount\":$((RANDOM % 10000 + 100)), \"timestamp\":'$(date +%s)' }' | \
        kafka-console-producer --topic raw-orders --bootstrap-server kafka:9092;
        sleep 0.1;
      done
    "]
```

### Java示例代码（Kafka Streams）

```java
// ============ pom.xml依赖 ============
// <dependency>
//     <groupId>org.apache.kafka</groupId>
//     <artifactId>kafka-streams</artifactId>
//     <version>3.5.0</version>
// </dependency>

// ============ 场景1：实时订单统计（窗口聚合） ============
public class OrderStatisticsStream {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "order-statistics");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.STATE_DIR_CONFIG, "/tmp/kafka-streams");
        
        StreamsBuilder builder = new StreamsBuilder();
        
        // 读取原始订单流
        KStream<String, String> orders = builder.stream("raw-orders");
        
        // 解析JSON并提取userId和amount
        KStream<String, Order> parsedOrders = orders.mapValues(value -> {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(value, Order.class);
        });
        
        // 按userId分组，1分钟窗口内统计订单金额
        KTable<Windowed<String>, Double> amountStats = parsedOrders
            .groupBy((key, order) -> order.getUserId(), 
                     Grouped.with(Serdes.String(), orderSerde))
            .windowedBy(TimeWindows.of(Duration.ofMinutes(1)))
            .aggregate(
                () -> 0.0,
                (userId, order, total) -> total + order.getAmount(),
                Materialized.with(Serdes.String(), Serdes.Double())
            );
        
        // 输出每分钟的消费统计
        amountStats.toStream().foreach((windowedKey, total) -> {
            log.info("用户{} 在窗口[{}-{}] 消费总额: {}",
                windowedKey.key(),
                windowedKey.window().startTime(),
                windowedKey.window().endTime(),
                total);
        });
        
        // 场景2：大额交易告警（金额>5000）
        parsedOrders
            .filter((key, order) -> order.getAmount() > 5000)
            .mapValues(order -> {
                Alert alert = new Alert();
                alert.setUserId(order.getUserId());
                alert.setAmount(order.getAmount());
                alert.setLevel("HIGH");
                alert.setMessage("大额交易告警");
                return alert;
            })
            .to("payment-alerts");
        
        KafkaStreams streams = new KafkaStreams(builder.build(), props);
        streams.start();
        
        Runtime.getRuntime().addShutdownHook(new Thread(streams::close));
    }
}
```

```java
// ============ 场景3：流表Join（实时订单与用户信息关联） ============
public class StreamTableJoin {
    
    public static void main(String[] args) {
        StreamsBuilder builder = new StreamsBuilder();
        
        // 订单流（KStream）
        KStream<String, Order> orderStream = builder
            .stream("orders", Consumed.with(Serdes.String(), orderSerde));
        
        // 用户信息表（KTable——来自changelog topic）
        KTable<String, UserInfo> userTable = builder
            .table("user-info", Consumed.with(Serdes.String(), userInfoSerde));
        
        // Stream-Table Join：实时关联用户信息
        KStream<String, EnrichedOrder> enriched = orderStream
            .join(userTable,
                (order, user) -> {
                    EnrichedOrder enrichedOrder = new EnrichedOrder();
                    enrichedOrder.setOrderId(order.getOrderId());
                    enrichedOrder.setUserId(order.getUserId());
                    enrichedOrder.setUserName(user.getUserName());
                    enrichedOrder.setVipLevel(user.getVipLevel());
                    enrichedOrder.setAmount(order.getAmount());
                    return enrichedOrder;
                },
                Joined.with(Serdes.String(), orderSerde, userInfoSerde)
            );
        
        enriched.to("enriched-orders");
        
        // 注意：Stream-Table Join必须使用相同的key
        // 即order和user的key必须都是userId
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **状态存储膨胀** | RocksDB占用磁盘过大 | 设置state store清理策略、使用RocksDB TTL |
| **Rebalance导致重复** | 分区重分配时重复处理 | enable exactly-once semantics |
| **反压问题** | 上游处理慢导致积压 | 增加stream线程数(num.stream.threads) |
| **窗口边界延迟** | 迟到数据被丢弃 | 使用grace period和allowedLateness |

**优化配置**：
```properties
# 流处理配置
num.stream.threads=4                      # 并行线程数
commit.interval.ms=100                    # 提交间隔
cache.max.bytes.buffering=10485760        # 缓冲区大小
rocksdb.config.setter=...                 # RocksDB调优

# 迟到数据处理
windowed.by(TimeWindows.of(Duration.ofMinutes(5))
    .grace(Duration.ofMinutes(2)))         # 允许2分钟迟到
```

### 典型问题处理

**问题：Kafka Streams的状态存储越来越大怎么办？**

```
方案1：减少窗口大小
- 缩小TimeWindows.duration

方案2：使用有状态的聚合但要设TTL
- 使用Materialized.withRetention

方案3：使用KTable的compact策略
- 日志清理策略设为compact
- 只保留每个key的最新值

方案4：分层存储
- 热数据在内存/RocksDB
- 冷数据在外部存储
```

### 关键技能

- 掌握KStream/KTable/GlobalKTable的区别
- 理解Windowed操作（Tumbling/Sliding/Session Window）
- 掌握状态存储（RocksDB）优化
- 熟悉Stream-Table Join和Stream-Stream Join
- 理解Exactly-Once语义在流处理中的应用