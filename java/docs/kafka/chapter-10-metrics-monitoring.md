# 第10章 指标监控

## 场景描述

Kafka作为分布式系统的数据中枢，承载着所有业务的消息流转。实时监控Kafka的生产消费速率、积压情况、集群健康状态，是保障系统稳定性的前提。

### 解决的问题

```
无监控的Kafka：
- 消息积压无人发现 → 消费者延迟越来越大
- Broker宕机无人感知 → 分区不可用
- 生产者发送失败无人告警 → 数据丢失

有监控的Kafka：
- 实时查看生产/消费速率
- 自动告警消息积压
- 集群健康状态一目了然
```

### 实现原理

**监控架构**：
```
Kafka Broker JMX Metrics → Prometheus → Grafana
Kafka Consumer Lag → Burrow/Kafka Lag Exporter → Prometheus → Grafana
应用自定义Metrics → Micrometer → Prometheus → Grafana
```

**关键监控指标**：

| 维度 | 指标 | 告警阈值 |
|------|------|---------|
| 集群健康 | UnderReplicatedPartitions | > 0 |
| 集群健康 | OfflinePartitions | > 0 |
| 集群健康 | ActiveControllerCount | != 1 |
| 生产者 | RequestsPerSec | 对比历史基线 |
| 消费者 | ConsumerLag | > 10000 |
| Broker | NetworkProcessorAvgIdlePercent | < 30% |
| Broker | LogFlushRateAndTimeMs | 异常升高 |
| 系统 | CpuUsage | > 80% |

### Docker Compose（Prometheus+Grafana+Burrow）

```yaml
# docker/scenario-10-monitoring/docker-compose.yml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    ports: ["9092:9092", "9999:9999"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      # 开启JMX Exporter
      KAFKA_JMX_OPTS: "-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999 -Dcom.sun.management.jmxremote.rmi.port=9999 -Djava.rmi.server.hostname=localhost"

  # Prometheus + JMX Exporter
  jmx-exporter:
    image: sscaling/jmx-prometheus-exporter:0.20.0
    ports: ["5556:5556"]
    volumes:
      - ./jmx-exporter-config.yml:/opt/jmx_exporter/config.yml
    command: ["5556", "/opt/jmx_exporter/config.yml"]

  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./grafana-dashboards:/etc/grafana/provisioning/dashboards

  # 消费者Lag监控（Burrow）
  burrow:
    image: linkedin/burrow:latest
    ports: ["8000:8000"]
    volumes:
      - ./burrow-config:/etc/burrow
```

**prometheus.yml**：
```yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['localhost:5556']
  - job_name: 'burrow'
    static_configs:
      - targets: ['burrow:8000']
```

### Java代码：Micrometer监控

```java
// ============ 1. 添加Micrometer依赖 ============
// <dependency>
//     <groupId>io.micrometer</groupId>
//     <artifactId>micrometer-registry-prometheus</artifactId>
// </dependency>
// <dependency>
//     <groupId>io.micrometer</groupId>
//     <artifactId>micrometer-core</artifactId>
// </dependency>

// ============ 2. 自定义指标 ============
@Component
public class KafkaMetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // 消息发送速率
    private final Counter messageSentCounter;
    // 发送失败次数
    private final Counter messageFailedCounter;
    // 发送延迟
    private final Timer sendLatencyTimer;
    
    public KafkaMetricsCollector(MeterRegistry meterRegistry,
                                  KafkaTemplate<String, Object> kafkaTemplate) {
        this.meterRegistry = meterRegistry;
        this.kafkaTemplate = kafkaTemplate;
        
        this.messageSentCounter = Counter.builder("kafka.message.sent")
            .description("消息发送总数")
            .register(meterRegistry);
        
        this.messageFailedCounter = Counter.builder("kafka.message.failed")
            .description("消息发送失败总数")
            .register(meterRegistry);
        
        this.sendLatencyTimer = Timer.builder("kafka.send.latency")
            .description("消息发送延迟")
            .register(meterRegistry);
    }
    
    public void recordSend(String topic, boolean success, long latencyMs) {
        if (success) {
            messageSentCounter.increment();
        } else {
            messageFailedCounter.increment();
        }
        sendLatencyTimer.record(Duration.ofMillis(latencyMs));
        
        // 按Topic分类的指标
        meterRegistry.counter("kafka.message.sent", "topic", topic).increment();
    }
}

// ============ 3. 消费者Lag监控 ============
@Component
public class LagMonitor {
    
    private final KafkaAdmin kafkaAdmin;
    private final MeterRegistry meterRegistry;
    
    @Scheduled(fixedRate = 30000)
    public void reportConsumerLag() {
        try (AdminClient admin = AdminClient.create(kafkaAdmin.getConfigurationProperties())) {
            // 获取所有消费者组
            ListConsumerGroupsResult groups = admin.listConsumerGroups();
            
            for (ConsumerGroupListing group : groups.valid().get()) {
                String groupId = group.groupId();
                
                // 获取组内各分区的offset
                ListConsumerGroupOffsetsResult offsets = 
                    admin.listConsumerGroupOffsets(groupId);
                Map<TopicPartition, OffsetAndMetadata> committed = 
                    offsets.partitionsToOffsetAndMetadata().get();
                
                // 获取分区的当前最新offset
                Map<TopicPartition, Long> endOffsets = 
                    admin.listOffsets(committed.keySet().stream()
                        .collect(Collectors.toMap(
                            tp -> tp,
                            tp -> OffsetSpec.latest()
                        ))).all().get()
                        .entrySet().stream()
                        .collect(Collectors.toMap(
                            Map.Entry::getKey,
                            e -> e.getValue().offset()
                        ));
                
                // 计算Lag
                for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : committed.entrySet()) {
                    TopicPartition tp = entry.getKey();
                    long committedOffset = entry.getValue().offset();
                    long latestOffset = endOffsets.get(tp);
                    long lag = latestOffset - committedOffset;
                    
                    // 上报到Prometheus
                    Gauge.builder("kafka.consumer.lag", lag)
                        .tag("group", groupId)
                        .tag("topic", tp.topic())
                        .tag("partition", String.valueOf(tp.partition()))
                        .register(meterRegistry);
                }
            }
        } catch (Exception e) {
            log.error("监控消费者Lag失败", e);
        }
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **告警风暴** | 大量指标同时触发告警 | 设置告警聚合和静默时间 |
| **指标数据量大** | 高分区数产生大量监控指标 | 聚合指标、只监控关键分区 |
| **监控本身延迟** | 拉取间隔太长看不到实时数据 | 缩短scrape_interval |
| **Prometheus内存** | 指标过多导致OOM | 设置retention和sample限制 |

### 典型问题处理

**问题：如何设置合理的Consumer Lag告警阈值？**

```
方案1：绝对阈值
- Lag > 10000 告警（适用于低吞吐场景）

方案2：时间阈值
- Lag估算处理时间 > 5分钟 告警
- 预计处理时间 = Lag / 消费速率

方案3：趋势告警
- Lag持续增长（消费速率 < 生产速率）
- 而非Lag的绝对值
```

### 关键技能

- 掌握Kafka JMX监控指标含义
- 熟练使用Prometheus+Grafana
- 理解Consumer Lag的计算和监控
- 掌握基于Micrometer的自定义指标收集
- 了解Burrow/Lag Exporter等消费者Lag监控工具