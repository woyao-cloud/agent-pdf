# 第10章 指标监控

## 10.1 场景故事：没有监控的Kafka集群

想象一下，你负责维护一个Kafka集群，每天处理数十亿条消息。某天下午，你突然收到业务团队的投诉："用户下单后收不到确认消息了！"你登录到集群上，发现Kafka的Broker进程还在运行，没有任何错误日志。花了一个小时排查后，才发现原来某个消费者的处理逻辑中了一个Bug，导致消费速度急剧下降，消息积压已经达到了数百万条。但因为没有监控，这整整一个小时的积压期间，没有任何告警通知你。

**没有监控的Kafka集群就像在黑夜中开车——没有仪表盘、没有车灯、没有GPS**。你完全不知道系统的运行状态，只能在故障发生后才被动地排查。

监控系统就像是Kafka的仪表盘，它告诉你：
- 集群是否健康？UnderReplicatedPartitions是否为0？
- 消费者的Lag是否在安全范围内？
- 生产者的发送速率是否在正常基线内？
- 是否存在性能瓶颈？

## 10.2 核心监控指标体系

### 第一层：集群健康指标

Broker维度最关键的几个指标：

**OfflinePartitions（离线分区数）**：这个指标应该是0，任何大于0的值都表示有分区处于不可用状态，意味着该分区的Leader宕机且没有新的Leader被选举出来。这是最严重的问题，需要立即响应。

**UnderReplicatedPartitions（副本同步滞后分区数）**：这个指标应该是0或保持稳定。如果持续增长，说明某些Follower副本的同步速度跟不上Leader的写入速度。可能的原因包括网络带宽不足、Broker负载过高、Follower所在机器的磁盘性能差。

**ActiveControllerCount**：在ZooKeeper模式下，Controller负责管理集群元数据。这个指标应该是1，因为同时只能有一个Controller。如果出现多个Controller（脑裂），会导致元数据混乱。在KRaft模式下，Controller Count应该是3（如果配置了3个Controller节点）。

### 第二层：性能指标

**RequestHandlerAvgIdlePercent**：请求处理器线程的空闲百分比。如果这个值低于30%，说明Broker的CPU或I/O资源紧张，请求处理线程处于饱和状态。需要考虑扩容或优化。

**NetworkProcessorAvgIdlePercent**：网络线程的空闲百分比。如果低于30%，说明网络I/O成为瓶颈。可以增加 `num.network.threads` 配置。

**TotalTimeMs**：请求的总处理时间。包括队列等待时间、本地处理时间、响应发送时间。如果总处理时间持续升高，说明Broker负载在增加。

### 第三层：消费者Lag监控

Lag是Kafka监控中最重要也最容易出问题的指标。Lag = 分区的最新Offset - 消费者提交的Offset。Lag本身并不可怕——实际上一定程度的Lag是正常的，说明消费者在批量处理消息。真正的问题是Lag**持续增长**——这意味着消费速度小于生产速度。

```bash
# 查看消费者组Lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-processor --describe

# 输出示例：
GROUP            TOPIC          PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
order-processor  orders         0          1500            1600            100
order-processor  orders         1          2000            2500            500
order-processor  orders         2          3000            3500            500
```

在这个例子中，Partition 1和Partition 2的Lag相对较高。这不是问题——只要Lag值保持稳定或下降。但如果过一会儿再运行同样的命令，发现Partition 1的Lag从500变成了1000，说明消费端遇到了瓶颈。

## 10.3 监控架构

```
Kafka Broker (JMX) → Prometheus → Grafana
Kafka Consumer Lag → Lag Exporter → Prometheus → Grafana
应用自定义指标 → Micrometer → Prometheus → Grafana
```

### Docker Compose

```yaml
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
      KAFKA_JMX_OPTS: "-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999"

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
```

### Prometheus告警规则

```yaml
groups:
  - name: kafka_alerts
    rules:
      - alert: UnderReplicatedPartitions
        expr: kafka_server_ReplicaManager_UnderReplicatedPartitions > 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Kafka有副本同步滞后的分区"

      - alert: HighConsumerLag
        expr: kafka_consumer_lag > 10000
        for: 5m
        labels: { severity: warning }
```

Lag告警阈值的设置需要考虑业务容忍度。对实时性要求高的场景（如支付通知），Lag超过1000就应该告警；对实时性要求低的场景（如日志收集），Lag超过10万才需要关注。