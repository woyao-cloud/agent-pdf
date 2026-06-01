# 第17章 监控与运维

## 17.1 集群监控

### 核心指标监控

```yaml
# Prometheus告警规则
groups:
  - name: kafka_alerts
    rules:
      # 离线分区告警
      - alert: OfflinePartitions
        expr: kafka_server_ReplicaManager_OfflinePartitionsCount > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Kafka有离线分区"
      
      # 副本同步延迟
      - alert: UnderReplicatedPartitions
        expr: kafka_server_ReplicaManager_UnderReplicatedPartitions > 0
        for: 5m
        labels:
          severity: warning
      
      # 消费者Lag过高
      - alert: HighConsumerLag
        expr: kafka_consumer_lag > 10000
        for: 5m
        labels:
          severity: warning
      
      # Broker宕机
      - alert: BrokerDown
        expr: up{job="kafka"} < 3
        for: 1m
        labels:
          severity: critical
```

### 消费者Lag监控

```bash
# 查看消费者组Lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group my-group --describe

# 输出：
# GROUP           TOPIC          PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# my-group        orders         0          1000            1500            500
# my-group        orders         1          2000            2500            500
# my-group        orders         2          3000            3500            500
```

## 17.2 运维操作

### 分区重分配

```bash
# 1. 生成迁移计划
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --generate --topics-to-move-json-file topics.json \
  --broker-list "1,2,3"

# 2. 执行迁移
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --execute --reassignment-json-file reassign.json

# 3. 验证迁移
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --verify --reassignment-json-file reassign.json
```

### 扩容操作

```bash
# 1. 启动新Broker
# 2. 将部分分区迁移到新Broker
# 3. 调整Topic分区数（如果需要）
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic orders --partitions 6

# 注意：分区只能增加不能减少！
```

### 数据迁移

```bash
# MirrorMaker 2.0 跨集群同步
mm2.properties:
clusters=A,B
A.bootstrap.servers=kafka-a:9092
B.bootstrap.servers=kafka-b:9092
A->B.enabled=true
A->B.topics=orders,payments
```

## 17.3 故障恢复

### 常见故障处理

| 故障 | 现象 | 处理步骤 |
|------|------|---------|
| Broker宕机 | 分区Leader不可用 | 1. 检查日志 2. 重启Broker 3. 检查ISR |
| 磁盘满 | 写入失败 | 1. 清理日志 2. 扩容磁盘 3. 调整保留策略 |
| 分区不可用 | UnderReplicated | 1. 检查副本同步 2. 手动Leader选举 |
| 消息积压 | Lag持续增长 | 1. 增加消费者 2. 优化消费逻辑 3. 扩容Topic |

### 数据恢复

```bash
# 查看未消费的消息（调试用）
kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders \
  --partition 0 \
  --offset 1000 \
  --max-messages 10
```

## 17.4 容量规划

### 容量评估公式

```bash
# 磁盘容量
单分区每日数据量 = 生产速率(msg/s) × 平均消息大小(byte) × 86400 / 1024^3(GB)
总数据量 = 单分区数据量 × 分区数 × 保留天数 × 副本数 × 2(压缩比)

# 示例：10万msg/s, 1KB/msg, 12分区, 7天, 3副本
# = 100000 × 1024 × 86400 × 12 × 7 × 3 × 2 ≈ 4.3TB

# 内存
# 每个连接约100KB
# 操作系统页缓存：建议分配系统内存的50%
```

### 配置建议

| 集群规模 | 节点 | 磁盘 | 内存 | CPU |
|---------|------|------|------|-----|
| 开发/测试 | 3 | 500GB × 3 | 8GB | 4核 |
| 中等规模 | 3-6 | 2TB × N | 16GB | 8核 |
| 大规模 | 6-12 | 4TB × N | 32GB+ | 16核+ |