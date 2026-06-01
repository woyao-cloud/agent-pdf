# 第7章 流式处理

## 7.1 场景故事：实时订单统计

### 业务需求

电商运营团队提出了一个需求：在双11大促期间，我们需要在**秒级延迟**内看到全站的实时交易数据——当前总交易额、各品类销售额排行榜、各地区的订单量趋势。传统做法是每隔10分钟跑一次SQL汇总查询，但在大促的峰值流量下，10分钟的延迟意味着运营团队无法及时发现异常。

这就是流式处理擅长的领域。Kafka Streams可以让我们在接收到订单消息的几秒内完成聚合计算，持续输出最新结果。

## 7.2 实现原理

### Kafka Streams的核心抽象

Kafka Streams将流处理抽象为两个核心概念：

**KStream（数据流）**：代表一个无界的、持续到达的数据记录流。每条记录都是一条独立的事件。类比：河流中的每滴水——每滴水都是独立的。

**KTable（状态表）**：代表一个不断更新的状态视图。每条记录是对某个Key的当前值的一次更新（UPSERT）。类比：水库的水位——新流入的水更新了当前水位。

**Stream-Table对偶性**：KStream可以通过聚合（count/reduce/aggregate）变成KTable；KTable的每个更新事件可以被捕获为KStream。这个对偶性是Kafka Streams强大表达能力的基础。

### 窗口操作

流处理中的"窗口"将无界的流切分为有界的片段，在每个片段内进行聚合：

- **Tumbling Window（滚动窗口）**：固定大小、不重叠。如：每5分钟统计一次。
- **Hopping Window（滑动窗口）**：固定大小、有重叠。如：每1分钟统计过去5分钟的数据。
- **Session Window（会话窗口）**：基于活动间隔的动态窗口。如：用户连续操作，超过30分钟空闲视为会话结束。

## 7.3 完整代码实现

```java
// ============ 实时交易统计 ============
public class OrderStatisticsStream {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "order-statistics");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.STATE_DIR_CONFIG, "/tmp/kafka-streams");
        // 开启exactly-once
        props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);
        
        StreamsBuilder builder = new StreamsBuilder();
        KStream<String, String> orders = builder.stream("raw-orders");
        
        // 1. 按品类统计每分钟销售额
        KTable<Windowed<String>, Double> categorySales = orders
            .mapValues(this::parseOrder)
            .groupBy((key, order) -> order.getCategory(),
                     Grouped.with(Serdes.String(), orderSerde))
            .windowedBy(TimeWindows.of(Duration.ofMinutes(1)))
            .aggregate(
                () -> 0.0,
                (category, order, total) -> total + order.getAmount(),
                Materialized.with(Serdes.String(), Serdes.Double())
            );
        
        // 2. 检测大额交易（>5000元）实时告警
        orders
            .filter((key, value) -> {
                Order order = parseOrder(value);
                return order.getAmount() > 5000;
            })
            .to("payment-alerts");
        
        KafkaStreams streams = new KafkaStreams(builder.build(), props);
        streams.start();
        
        Runtime.getRuntime().addShutdownHook(new Thread(streams::close));
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 状态存储膨胀 | RocksDB占用磁盘过大 | 设置state store清理策略、TTL |
| Rebalance导致重复 | 分区重分配时重复处理 | 开启exactly-once semantics |
| 反压问题 | 上游处理慢导致积压 | 增加stream线程数 |

典型问题：迟到数据处理。使用 `grace(Duration.ofMinutes(2))` 允许2分钟内的迟到数据仍然被纳入窗口聚合。

## 7.4 关键技能

- 掌握KStream/KTable/GlobalKTable的区别
- 理解Windowed操作（Tumbling/Sliding/Session Window）
- 掌握状态存储（RocksDB）优化
- 熟悉Stream-Table Join和Stream-Stream Join