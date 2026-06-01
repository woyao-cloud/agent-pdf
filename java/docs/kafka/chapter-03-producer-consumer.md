# 第3章 生产与消费

## 3.1 生产者核心原理

### 生产者的工作流程

Kafka Producer并不是将消息直接发往Broker就完事了。在"调用send方法"和"消息真正到达Broker"之间，经历了序列化、分区选择、批量打包、发送确认等多个步骤。理解这个流程，才能正确地配置生产者参数。

```
Producer.send(record)
       ↓
1. 拦截器链 (Interceptor) → 可以在发送前修改消息或记录日志
       ↓
2. 序列化器 (Serializer) → 将Key和Value转为字节数组
       ↓
3. 分区器 (Partitioner) → 决定消息发往哪个Partition
       ↓
4. 累加器 (RecordAccumulator) → 消息放入缓冲区，等待批量发送
       ↓
5. Sender线程 → 从缓冲区取出批量消息，发送到Broker
       ↓
6. 确认回调 → Broker返回响应，触发用户回调函数
```

**拦截器链**是消息进入Kafka客户端后的第一站。拦截器可以在消息发送前对消息进行修改或记录。例如：在生产环境中，可以在拦截器中自动为每条消息注入消息ID和时间戳，这样即使消息体本身不包含这些信息，也可以追踪消息的完整路径。

**序列化器**负责将Java对象转换为字节数组。Kafka提供了内置的字符串、整数、字节数组序列化器，也支持用户自定义序列化器。需要注意的是，在生产环境中**强烈推荐使用Avro、Protobuf或JSON这类具有Schema演进能力的序列化方案**，而不是Java原生的序列化。因为Java的序列化是语言绑定的，无法与非Java系统交互，而且缺乏Schema版本管理。

**分区器**根据消息的Key计算目标Partition。默认分区器使用murmur2哈希算法对Key进行哈希，然后对分区数取模。这保证了相同Key的消息总是进入同一个Partition（从而保证顺序），同时Key不同的消息大致均匀分布到各个Partition。

**累加器**是生产者高性能的关键。Kafka不会为每一条消息单独发起网络请求，而是将消息暂存到缓冲区中，当缓冲区达到`batch.size`或等待时间达到`linger.ms`时，再一次性发送。这个设计将多次网络请求合并为一次，大幅降低了网络开销。

### 三种发送模式深度对比

Kafka生产者提供了三种发送模式，每种模式在可靠性、延迟和吞吐量之间做了不同的权衡：

**发后即忘（Fire-and-Forget）**

```java
// 只管发送，不关心结果
producer.send(new ProducerRecord<>("orders", key, value));
```

这是最简单的发送方式，也是**最危险**的。调用`send`方法后，生产者将消息放入缓冲区，然后立即返回。如果发送过程中出现网络故障、序列化错误、Broker不可用等问题，调用方完全不知道。

它的使用场景非常有限：只有在可以容忍少量消息丢失的非关键日志场景（如用户行为追踪、非关键指标的收集）中才能使用。任何涉及业务处理的场景（订单、支付、库存变更）都应避免使用这种模式。

**同步发送**

```java
// 等待Broker确认后继续
try {
    RecordMetadata metadata = producer.send(
        new ProducerRecord<>("orders", key, value)
    ).get();  // 阻塞，等待Broker响应
    System.out.println("发送成功，offset=" + metadata.offset());
} catch (ExecutionException e) {
    System.err.println("发送失败: " + e.getCause().getMessage());
    // 处理失败逻辑：记录异常或重试
}
```

同步发送在调用`get()`时阻塞当前线程，直到Broker返回确认或抛出异常。它的优点是可靠性最高——每一条消息的发送结果都明确可知。但代价是性能最差：串行化处理下，一次网络往返的时间（RTT）就是一条消息的延迟。在毫秒级的RTT下，同步发送每秒只能处理几百到几千条消息。

同步发送的使用场景通常是事务性的关键消息，例如金融交易的确认消息、库存扣减消息等，这些消息不容丢失，且发送频率不高。

**异步回调**

```java
// 发送并注册回调，不阻塞当前线程
producer.send(new ProducerRecord<>("orders", key, value),
    new Callback() {
        @Override
        public void onCompletion(RecordMetadata metadata, Exception exception) {
            if (exception != null) {
                // 发送失败的处理逻辑
                log.error("消息发送失败: key={}, error={}", key, exception.getMessage());
                // 将失败消息写入本地文件或数据库，等待补偿
                failedMessageStore.save(key, value);
            } else {
                // 发送成功的处理逻辑
                log.debug("消息发送成功: topic={}, partition={}, offset={}",
                    metadata.topic(), metadata.partition(), metadata.offset());
            }
        }
    });
// send方法立即返回，不阻塞
```

这是生产环境中最推荐的发送方式。`send`方法立即返回，不阻塞业务线程——业务线程可以继续处理其他逻辑。当Broker确认消息后，回调函数在生产者内部的I/O线程中被异步调用。

异步回调在保证可靠性的同时，维持了高吞吐。因为它只占用了非常少的业务线程时间（创建回调对象的时间），实际的I/O等待完全在后台线程中进行。

### 核心参数调优

**acks参数详解**

`acks`参数控制生产者需要收到多少个副本的确认才算发送成功。这是影响消息可靠性的最重要参数：

- **acks=0**：生产者发送消息后不等待任何确认就认为发送成功。这是最快的模式，但也是最不可靠的——如果Broker接收失败，生产者不知道，消息将永久丢失。吞吐可达最高，但风险也最高。
- **acks=1**：生产者等待Leader副本写入日志（但不等待Follower确认）后即认为发送成功。这是速度与可靠性之间的默认平衡点。如果Leader在Follower同步之前宕机，消息可能丢失。
- **acks=all（或acks=-1）**：生产者等待所有ISR副本都确认写入后才认为发送成功。这是最可靠的模式，理论上不会因Broker宕机而丢失消息（前提是至少有一个ISR存活）。代价是延迟略高（等待多个副本确认需要额外时间）。

```java
// 最强可靠性配置（不会因Broker宕机而丢失消息）
properties.put(ProducerConfig.ACKS_CONFIG, "all");
properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
properties.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
```

**配置参数速查表**

| 参数 | 默认值 | 推荐值 | 作用说明 |
|------|--------|--------|---------|
| `acks` | 1 | all | 副本确认数 |
| `retries` | Integer.MAX | 3 | 发送重试次数 |
| `batch.size` | 16KB | 32-64KB | 批量缓冲区大小 |
| `linger.ms` | 0 | 5-50 | 批量等待时间(ms) |
| `buffer.memory` | 32MB | 64-128MB | 发送缓冲区总大小 |
| `compression.type` | none | snappy | 压缩算法 |
| `max.in.flight` | 5 | 5或1 | 未确认请求数 |
| `request.timeout.ms` | 30000 | 30000 | 请求超时时间 |

`batch.size`和`linger.ms`是一对需要配合调优的参数。增大它们可以提高吞吐（消息更可能凑成更大的批次），但会增加延迟。对于日志收集场景，可以设置较大的batch（64KB）和较长的linger（50ms），因为日志对延迟不敏感；对于实时通知场景，需要较小的batch（16KB）和较短的linger（5ms），以降低消息延迟。

## 3.2 消费者核心原理

### Pull模式的设计哲学

Kafka消费者使用Pull（拉取）模式从Broker获取数据，这与RabbitMQ的Push（推送）模式有本质区别。

在Push模式下，Broker负责决定什么时候发送数据给消费者。当消费者的处理速度跟不上Broker的推送速度时，要么消费者的缓冲区被填满导致内存溢出，要么Broker需要实现复杂的背压（Backpressure）机制来减慢推送速度。

Kafka的Pull模式将消费速率控制权完全交给消费者。消费者根据自己的处理能力决定每次拉取多少数据（`max.poll.records`）和拉取间隔（通过`poll(Duration)`控制）。即使Broker上有百万条待消费的消息，消费者也可以选择每次只拉取100条，处理完后再拉取下一批。

Pull模式的劣势是当Topic中没有新消息时，消费者需要不断地轮询（或使用长轮询）。Kafka通过`fetch.min.bytes`和`fetch.max.wait.ms`优化了这个问题：如果Broker上没有足够的字节，请求会一直等待直到积累了足够的数据或超时，而不是立即返回空响应浪费网络资源。

```properties
# 长轮询配置：最多等待500ms或积累1KB数据后再返回
fetch.min.bytes=1024
fetch.max.wait.ms=500
```

### Offset管理机制

Offset是消费者在Partition中的读取位置标记。Kafka消费者的核心工作就是：正确管理Offset，确保每条消息都被处理且不重复处理。

消费者通过`commitSync()`或`commitAsync()`方法向Kafka的内部Topic `__consumer_offsets` 提交当前消费到的Offset。这个Topic也是用Partition存储的，Kafka根据消费者组的Group ID计算其Offset保存到哪个Partition。

```java
// 手动提交Offset（推荐）
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    
    for (ConsumerRecord<String, String> record : records) {
        try {
            process(record);  // 处理消息
        } catch (Exception e) {
            log.error("处理消息失败，跳过: offset={}", record.offset(), e);
            // 根据业务需要：继续处理下一条或暂停消费
        }
    }
    
    try {
        consumer.commitSync();  // 处理完本批后提交Offset
    } catch (CommitFailedException e) {
        log.error("Offset提交失败", e);
        // 重试提交
    }
}
```

关于Offset的提交时机，有几种策略需要认真选择：

**自动提交（不推荐）**：设置`enable.auto.commit=true`（默认就是true），每隔`auto.commit.interval.ms`（默认5000ms）自动提交当前最大Offset。这个策略的问题在于：如果在自动提交间隔内，消费者处理完消息后程序崩溃，则恢复后将从上次自动提交的Offset开始消费，导致中间处理过的消息被重复消费。如果消息处理时间超过5秒，重复的范围可能相当大。

**手动同步提交（推荐）**：设置`enable.auto.commit=false`，在处理完一批消息后显式调用`commitSync()`。`commitSync()`会阻塞直到提交成功或失败。这是最安全的方式——"先处理，后提交"确保消息至少被处理一次再更新Offset。

**手动异步提交**：调用`commitAsync()`立即返回，不在主线程中阻塞。当回调被调用时再检查提交是否成功。异步提交的性能更好，但需要额外处理提交失败后的重试逻辑。

重要经验：**永远不要先提交Offset再处理消息**。如果在"提交Offset → 处理消息"的过程中消费者崩溃，恢复后会从已提交的Offset之后开始消费，导致"提交了Offset但尚未处理的消息"永久丢失。

### 消费者组与分区分配

消费者组是Kafka实现消费负载均衡的核心机制。一个消费者组由多个消费者实例组成，它们共享一个`group.id`，协同消费一个或多个Topic中的所有Partition。

```
Topic "orders" (6个Partition)

消费者组 "order-group"

场景1：组内有6个消费者
  Consumer-A: Partition-0, Partition-1
  Consumer-B: Partition-2, Partition-3
  Consumer-C: Partition-4, Partition-5
  Consumer-D: 空闲（没有分区可分配）
  Consumer-E: 空闲
  Consumer-F: 空闲

场景2：组内有3个消费者
  Consumer-A: Partition-0, Partition-1
  Consumer-B: Partition-2, Partition-3
  Consumer-C: Partition-4, Partition-5

场景3：组内有8个消费者
  Consumer-A: Partition-0
  Consumer-B: Partition-1
  ...
  2个消费者空闲
```

分区分配的核心原则：**一个Partition在同一时刻只能被同一个Consumer Group内的一个消费者消费**。这个约束保证了同一个Partition内的消息不会被同一个组的多个消费者重复消费。

从这个原则可以推导出两个重要结论：
- 如果消费者的数量超过Topic的Partition数，多余的消费者将处于空闲状态——它们不会分配到任何分区。
- 增加消费者的数量不会提高消费吞吐，除非对应的Topic有足够的Partition。如果要提高吞吐，需要同时增加Partition数和消费者数。

Kafka提供了三种分区分配策略：

**Range策略（默认）**：按Topic范围连续分配。假设Topic有6个Partition，2个消费者，则消费者A获得Partition 0-2，消费者B获得Partition 3-5。这种策略的问题在于：如果有多个Topic，每个Topic下的分区分配结果累积可能导致严重的负载不均（一个消费者可能在每个Topic上都分到更多的Partition）。

**RoundRobin策略**：将Topic的所有Partition轮询分配给消费者。这种策略在所有消费者订阅相同Topic时效果最好，分区能均匀分布。

**Sticky策略**：尽量让分配结果"稳定"，在Rebalance发生时，尽量保持现有的分配方案不变，只将被撤销的分区重新分配。这样可以减少Rebalance带来的分区迁移开销。

### 再均衡（Rebalance）机制

再均衡是消费者组的核心机制，也是Kafka使用中最容易引发问题的环节。

当消费者组发生以下变化时，会触发再均衡：
1. 新的消费者加入组
2. 已有消费者离开组（主动退出或会话超时）
3. Topic的分区数发生变化
4. 订阅的Topic发生变化

再均衡的过程分为三个阶段：

**第一阶段：Find Coordinator**：每个消费者通过Group ID的哈希值确定自己应该找哪个Broker作为Group Coordinator。Coordinator是负责管理消费者组元数据的Broker。

**第二阶段：Join Group**：消费者向Coordinator发送JoinGroup请求。Coordinator收到所有消费者请求后（或等待`rebalance.timeout.ms`超时后），选择一个消费者作为Leader（通常是第一个加入的），并将组成员列表发送给Leader。

**第三阶段：Sync Group**：Leader消费者根据分配策略计算分区分配方案，并将分配结果通过SyncGroup请求发送给Coordinator。Coordinator将分配方案广播给所有组员。至此，每个消费者知道自己应该消费哪些Partition了。

这个过程对开发者的重要影响是：**再均衡期间，组内所有消费者都会暂停消费**。如果业务对消息的实时处理有严格要求，就需要尽可能地减少再均衡的发生和缩短再均衡的时间。

### 再均衡监听器的实际应用

在再均衡发生时，Kafka允许开发者注册监听器来执行自定义操作。最常见的需求是在分区被撤销前提交当前Offset，避免Rebalance后重复消费：

```java
consumer.subscribe(Arrays.asList("orders"), new ConsumerRebalanceListener() {
    
    @Override
    public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
        // 在分区被回收之前，提交当前Offset
        log.info("分区即将被回收: {}", partitions);
        consumer.commitSync(currentOffsets);
        // 可以在这里关闭数据库连接、释放资源等
    }
    
    @Override
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
        // 分配了新的分区后，可以在这里初始化
        log.info("新分配的分区: {}", partitions);
        // 例如：从数据库读取上次处理的位置
        for (TopicPartition partition : partitions) {
            long lastProcessedOffset = offsetStore.getLastOffset(partition);
            if (lastProcessedOffset > 0) {
                consumer.seek(partition, lastProcessedOffset + 1);
            }
        }
    }
});
```

### 消费者关键配置

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| `group.id` | null | 必填 | 消费者组ID |
| `enable.auto.commit` | true | false | 关闭自动提交 |
| `auto.commit.interval.ms` | 5000 | — | 自动提交间隔 |
| `auto.offset.reset` | latest | earliest | 无初始Offset时从哪开始 |
| `max.poll.records` | 500 | 100-500 | 每次poll的最大记录数 |
| `max.poll.interval.ms` | 300000 | 自定义 | 两次poll最大间隔 |
| `session.timeout.ms` | 45000 | 10000-30000 | 会话超时时间 |
| `heartbeat.interval.ms` | 3000 | session/3 | 心跳间隔 |
| `fetch.min.bytes` | 1 | 1024 | 拉取最小字节 |
| `fetch.max.wait.ms` | 500 | 500 | 拉取最大等待(ms) |
| `isolation.level` | read_uncommitted | 按需 | 事务隔离级别 |

`session.timeout.ms` 和 `heartbeat.interval.ms` 的配合需要特别注意。消费者定期向Broker发送心跳以维持会话。如果在`session.timeout.ms`时间内Broker没有收到心跳，Broker认为消费者已死，触发Rebalance。为了避免因为暂时的GC停顿或网络抖动触发不必要的Rebalance，`session.timeout.ms`应该设置为足够大（典型的30秒），而心跳间隔设为 `session.timeout.ms / 3`。

`max.poll.interval.ms` 是另一个重要的超时配置。它限制了消费者处理一批消息的最大时间。如果消费者调用`poll()`的频率低于这个阈值（即处理消息花费了太长时间），Coordinator会认为消费者已停止工作，将其踢出组，触发Rebalance。如果每条消息的处理时间较长（例如需要调用外部API），需要将这个值相应调大。

## 3.3 序列化与Schema管理

### 为什么需要Schema管理

很多Kafka初学者会在消息体中直接使用JSON字符串，然后在生产者和消费者之间通过约定来保证消息格式的一致性：

```java
// 生产者发送JSON字符串
String message = "{\"orderId\":\"123\", \"amount\":99.9}";
producer.send(new ProducerRecord<>("orders", message));

// 消费者解析JSON字符串
JsonNode node = objectMapper.readTree(message);
String orderId = node.get("orderId").asText();
```

这种方式在开发阶段工作良好，一旦进入生产环境，问题就暴露了：

- **Schema演进困难**：如果要给订单消息增加一个`couponAmount`字段，已发送的旧消息中没有这个字段，消费者读取旧消息时会得到null，需要处理这个兼容性问题。
- **跨团队协作困难**：生产者由A团队维护，消费者由B团队维护。A团队改了消息格式，B团队不知道，消费时出错。
- **缺乏类型校验**：JSON本身不提供类型保障，字符串、数字、布尔值在解析时容易出错。

这就是Schema Registry出场的时机。Schema Registry是一个独立于Kafka Broker的服务，它存储和管理消息的Schema（数据结构定义），为每个Schema版本分配一个全局唯一的ID。生产者在发送消息时，将Schema ID和消息数据一起发送；消费者在消费时，通过Schema ID从Schema Registry获取Schema进行反序列化。

### Avro Schema实战

Avro是Kafka生态中最常用的序列化方案，它与Schema Registry无缝集成：

```avro
// 定义订单事件的Avro Schema
{
  "namespace": "com.example.avro",
  "type": "record",
  "name": "OrderEvent",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "userId", "type": "string"},
    {"name": "amount", "type": "double"},
    {"name": "status", "type": {"type": "enum", "name": "OrderStatus",
      "symbols": ["CREATED", "PAID", "SHIPPED", "DELIVERED"]}},
    {"name": "items", "type": {"type": "array", "items": "string"}},
    {"name": "couponAmount", "type": ["null", "double"], "default": null}
  ]
}
```

注意`couponAmount`字段的定义：`"type": ["null", "double"]` 表示这个字段可以为null，`"default": null` 表示当旧版本的消息中没有这个字段时，用null作为默认值。这就是Avro的Schema兼容性机制——**向后兼容**：新版消费者可以读取旧版生产者产生的数据。

### 选择序列化方案

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| JSON | 简单、可读性强、通用 | Schema不强制、体积大 | 快速原型、跨语言简单场景 |
| Avro | Schema强制、体积小、兼容性强 | 需要Schema Registry | Kafka核心场景、多语言 |
| Protobuf | Schema强制、体积小、性能好 | 工具链稍微复杂 | 微服务间通信 |
| Java序列化 | 最简单 | 语言绑定、体积大 | 仅限内部测试 |