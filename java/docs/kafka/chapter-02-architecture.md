# 第2章 Kafka核心架构

## 2.1 架构概览

### 解决的问题

理解Kafka的整体架构是掌握Kafka的第一步。Kafka是一个分布式系统，包含多个组件协同工作。

> **核心价值**：理解Broker、Topic、Partition、Consumer Group等核心概念，是使用Kafka的基础。

### 核心组件

```
Producer → [Topic/Partition] → Consumer Group
              ↑
          Broker Cluster
              ↑
          ZooKeeper/KRaft
```

| 组件 | 职责 |
|------|------|
| **Producer** | 发布消息到Topic |
| **Broker** | Kafka服务器，存储消息 |
| **Topic** | 消息的逻辑分类 |
| **Partition** | Topic的分片，并行单位 |
| **Consumer Group** | 消费者组，组内负载均衡 |
| **Offset** | 消息在分区中的位置 |

### 关键概念

**Topic与Partition**：
```
Topic "orders"
├── Partition-0 (Leader: Broker1, Replicas: Broker2, Broker3)
├── Partition-1 (Leader: Broker2, Replicas: Broker1, Broker3)
└── Partition-2 (Leader: Broker3, Replicas: Broker2, Broker1)
```

**Consumer Group负载均衡**：
```
Topic "orders" (3个分区)
Consumer Group "order-processor"
├── Consumer-1 → Partition-0
├── Consumer-2 → Partition-1, Partition-2
```

**关键规则**：
- 一个分区只能被同一个Group内的一个Consumer消费
- 一个Consumer可以消费多个分区
- 分区数决定了Consumer Group内的最大并行度

### 常见配置参数

**Broker配置**：
```properties
# server.properties
broker.id=1
listeners=PLAINTEXT://localhost:9092
log.dirs=/data/kafka/logs
num.partitions=3
default.replication.factor=3
log.retention.hours=168
```

**生产者配置**：
```properties
acks=all                    # 等待所有副本确认
retries=3                   # 重试次数
batch.size=16384           # 批量发送大小
linger.ms=1                # 批量等待时间
compression.type=snappy    # 压缩算法
```

**消费者配置**：
```properties
group.id=my-group
enable.auto.commit=false   # 手动提交offset
auto.offset.reset=earliest # 从头开始消费
max.poll.records=500       # 每次拉取记录数
```

## 2.2 数据存储原理

### 存储结构

```
Topic-partition目录
├── 00000000000000000000.log      # 消息数据文件
├── 00000000000000000000.index    # 偏移量索引
├── 00000000000000000000.timeindex # 时间戳索引
├── 00000000000000000001.log      # 下一个segment
├── 00000000000000000001.index
└── 00000000000000000001.timeindex
```

**顺序写磁盘**：Kafka将消息追加到文件末尾，利用磁盘顺序写的性能优势（与随机写相差6000倍）。

**分段策略**：日志分段（Segment）策略，达到大小或时间阈值后新建文件。

### 零拷贝技术

Kafka利用操作系统的零拷贝（Zero-Copy）技术，从磁盘到网卡的数据传输不需要经过应用内存：

```
传统方式：磁盘 → 内核缓冲区 → 应用缓冲区 → Socket缓冲区 → 网卡
零拷贝：  磁盘 → 内核缓冲区 → 网卡（直接通过sendfile）
```

> Kafka的高吞吐核心：**顺序写 + 零拷贝 + 批量压缩**

## 2.3 副本机制

### Leader-Follower模型

```
Partition-0
├── Leader (Broker 1): 处理所有读写请求
├── Follower (Broker 2): 从Leader同步数据
└── Follower (Broker 3): 从Leader同步数据
```

**ISR（In-Sync Replicas）**：与Leader保持同步的副本集合。只有ISR中的副本才有资格成为新Leader。

**配置参数**：
```properties
min.insync.replicas=2      # ISR最小数量
unclean.leader.election.enable=false  # 不允许非ISR副本成为Leader
```

### 潜在风险

| 风险 | 说明 | 解决方案 |
|------|------|---------|
| Leader故障 | 分区Leader宕机 | 从ISR选举新Leader |
| 磁盘损坏 | Broker磁盘故障 | 多副本+监控告警 |
| ISR收缩 | 副本同步延迟 | 优化网络、调整replica.lag.timeout |
