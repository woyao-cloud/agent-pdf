# 第19章 典型问题诊断

## 19.1 诊断决策树

### 问题：消息发送失败

```
Producer.send() 返回异常
│
├─ 网络超时（TimeoutException）
│  ├─ 检查 Kafka Broker 是否存活: telnet broker 9092
│  └─ 检查防火墙是否拦截端口
│
├─ Leader 不可用（NotLeaderOrFollowerException）
│  ├─ 检查分区Leader是否存在: --describe --topic
│  └─ 触发电竞选举
│
├─ 消息过大（RecordTooLargeException）
│  ├─ 增大 message.max.bytes（Broker端）
│  └─ 增大 max.request.size（Producer端）
│
└─ 认证失败（AuthenticationException）
   ├─ 检查SASL/SSL配置
   └─ 检查用户名密码
```

### 问题：消费者不消费或Lag高

```
Lag持续增长
│
├─ 消费者处理慢
│  ├─ 检查下游API响应时间
│  ├─ 检查数据库连接池状态
│  ├─ 优化处理逻辑（批处理/异步）
│  └─ 增加消费者（需同时增加分区数）
│
├─ 频繁Rebalance
│  ├─ 增大 session.timeout.ms
│  ├─ 减少 max.poll.records
│  └─ 优化消息处理时间
│
└─ Offset提交失败
   ├─ 改为手动提交
   └─ 确保先处理再提交
```

## 19.2 常用诊断命令

```bash
# 1. 检查消费者组状态（第一件事）
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group my-group --members --verbose

# 2. 查看Broker日志（第二件事）
grep -E "ERROR|WARN|FATAL" /data/kafka/logs/server.log | tail -50

# 3. 检查操作系统状态
top -b -n 1 | head -20           # CPU和内存
iostat -x 1 3                     # 磁盘I/O（重点看await和%util）
sar -n DEV 1 3                    # 网络流量
netstat -an | grep 9092 | wc -l  # Kafka连接数

# 4. 查看JVM状态
jstat -gcutil <kafka_pid> 1000 5  # GC情况
jstack <kafka_pid> | grep -A 20 "BLOCKED"  # 线程阻塞

# 5. 确认一条消息是否存在（排查数据丢失）
kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders --partition 0 --offset 12345 --max-messages 1
```

## 19.3 常见错误与解决方案

| 错误 | 现象 | 解决方案 |
|------|------|---------|
| NOT_ENOUGH_REPLICAS | 写入失败 | 检查min.insync.replicas配置，增加副本或降低要求 |
| LEADER_NOT_AVAILABLE | 分区不可用 | 触发Leader选举或等待自动恢复 |
| REBALANCE_IN_PROGRESS | 消费者频繁断开重连 | 调整session.timeout.ms和heartbeat.interval.ms |
| CONCURRENT_TRANSACTIONS | 事务冲突 | 检查transactional.id是否唯一 |
| UNKNOWN_TOPIC_OR_PARTITION | Topic不存在 | 确认Topic名称或自动创建(auto.create.topics.enable) |

## 19.4 数据完整性校验

```bash
# 1. 查看Topic消息总数
kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 --topic orders --time -1

# 2. 对比生产端和消费端的消息计数
# 如果两者不一致：存在丢失或重复

# 3. 导出Segment日志检查
kafka-run-class.sh kafka.tools.DumpLogSegments \
  --files /data/kafka/logs/orders-0/00000000000000000000.log | head -50
```

## 19.5 关键技能

- 掌握消费者组Lag的查看和解读
- 熟悉连接Broker排查的基本命令
- 理解Rebalance的触发条件和影响
- 掌握数据完整性校验的方法