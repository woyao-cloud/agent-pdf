# 第17章 监控与运维

## 17.1 日常运维操作

### Topic管理

```bash
# 创建Topic（推荐指定分区数和副本数）
kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic orders --partitions 6 --replication-factor 3

# 查看Topic详情
kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic orders

# 输出示例：
# Topic: orders  PartitionCount: 6  ReplicationFactor: 3
#   Topic: orders  Partition: 0  Leader: 1  Replicas: 1,2,3  Isr: 1,2,3
#   Topic: orders  Partition: 1  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1

# 修改Topic配置（在线动态调整）
kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --entity-type topics --entity-name orders \
  --add-config retention.ms=604800000
```

### 消费者组管理

```bash
# 查看所有消费者组
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 查看组的Lag情况
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group order-processor

# 重置消费者组offset（需要组内无活动消费者）
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-processor \
  --reset-offsets --to-earliest --topic orders --execute

# 将offset移到最新（跳过积压消息）
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-processor \
  --reset-offsets --to-latest --topic orders --execute
```

### 分区重分配

当新增Broker或需要重新平衡分区分布时，使用分区重分配工具：

```bash
# 1. 生成迁移计划
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --generate --topics-to-move-json-file topics.json \
  --broker-list "1,2,3,4"

# 2. 执行迁移
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --execute --reassignment-json-file reassign.json

# 3. 验证迁移进度
kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --verify --reassignment-json-file reassign.json
```

分区重分配是异步的，Kafka会逐步将数据从旧Broker复制到新Broker。期间不会影响正常的消息读写。

## 17.2 故障恢复

### 常见故障处理步骤

**场景1：Broker宕机**
```
现象：OfflinePartitions > 0
处理步骤：
1. 检查宕机Broker的日志（server.log）
2. 尝试重启Broker服务
3. 如果短时间内无法恢复，触发Leader选举
   kafka-leader-election.sh --bootstrap-server localhost:9092 \
     --topic orders --partition 0 --election-type PREFERRED
4. 监控ISR是否恢复
```

**场景2：磁盘空间不足**
```
现象：写入失败，日志报错"disk out of space"
处理步骤：
1. 立即：调整保留策略，删除历史数据
   kafka-configs.sh --alter --entity-type topics --entity-name orders \
     --add-config retention.ms=3600000  # 临时改为1小时
2. 中期：清理不再需要的数据
   kafka-configs.sh --alter --entity-type topics --entity-name orders \
     --add-config cleanup.policy=delete
3. 长期：扩容磁盘或增加节点
```

**场景3：消费者Lag持续增长**
```
现象：消费速度跟不上生产速度
排查：
1. 检查消费者日志：是否有异常或慢查询？
2. 检查下游系统（DB、外部API）的响应时间
3. 检查消费者数量是否足够（分区数是否够）
处理：
1. 临时：增加消费者数量（确保分区数足够）
2. 优化：批量处理、异步处理、增加缓存
3. 扩容：增加Topic分区数和消费者数
```

## 17.3 容量规划

### 磁盘容量估算

```bash
# 磁盘空间计算公式
# 单分区每日数据量 = 消息速率(msg/s) × 平均消息大小(byte) × 86400秒
# 总存储需求 = 单分区数据量 × 分区数 × 保留天数 × 副本数

# 示例：10万msg/s, 1KB/msg, 12分区, 7天, 3副本
日增量 = 100000 × 1024 × 86400 = 8.6GB（非压缩，单分区）
总需求 = 8.6GB × 12 × 7 × 3 = 2.2TB
```

### 集群规模建议

| 集群规模 | Broker | 磁盘 | 内存 |
|---------|--------|------|------|
| 开发/测试 | 3 | 500GB × 3 | 8GB |
| 中等规模 | 3-6 | 2TB × N | 16GB |
| 大规模 | 6-12 | 4TB+ × N | 32GB+ |

## 17.4 关键技能

- 掌握kafka-topics、kafka-consumer-groups等命令行工具
- 理解分区重分配的流程和原理
- 掌握消费者group的Lag监控和offset重置
- 熟悉磁盘容量估算和集群扩容方案
- 掌握Broker宕机、磁盘满等常见故障的恢复步骤