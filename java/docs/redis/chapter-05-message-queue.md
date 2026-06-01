# 第5章 消息队列与延迟任务（MQ & Delay Queue）

## 5.1 实现原理

Redis 提供了 4 种不同的消息队列实现方式，从简单到复杂，覆盖从轻量级到企业级的需求。

### 基于 List 的阻塞队列（BRPOP）

最原始的队列形式——利用 List 的 `LPUSH` + `BRPOP` 实现 FIFO：

```
List 队列模型：
  生产者                            消费者
    │                                │
    │ LPUSH queue:task "msg1"        │
    │ ──────────────────────────────►│
    │                    queue:task   │
    │               ┌──┬──┬──┬──┬──┐ │
    │               │m3│m2│m1│  │  │ │  ← LPUSH 从左侧插入
    │               └──┴──┴──┴──┴──┘ │
    │                                │
    │                         BRPOP queue:task 0
    │                         ← m1（从右侧取出）
    │                         ← m2
    │                         ← m3
```

```java
@Service
public class ListQueueService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String QUEUE_KEY = "queue:task";

    // 生产者
    public void produce(String message) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, message);
    }

    // 消费者（阻塞——类似于 Kafka 的 poll）
    @Scheduled(fixedRate = 100) // 每 100ms 拉取一次
    public void consume() {
        // BRPOP：阻塞直到有消息，最多等 5 秒
        List<String> messages = redisTemplate.opsForList()
            .rightPop(QUEUE_KEY, 5, TimeUnit.SECONDS);

        if (messages != null) {
            // messages = [QUEUE_KEY, actual_message]
            String message = messages.get(1);
            processMessage(message);
        }
    }

    // 批量消费
    public List<String> batchConsume(int batchSize) {
        List<String> batch = new ArrayList<>();
        // Pipeline 批量 RPOP（非阻塞版本）
        redisTemplate.executePipelined((RedisCallback<Void>) connection -> {
            for (int i = 0; i < batchSize; i++) {
                connection.listCommands().rPop(QUEUE_KEY.getBytes());
            }
            return null;
        });
        return batch;
    }

    private void processMessage(String message) {
        System.out.println("处理消息: " + message);
    }
}
```

**List 队列的局限**：
- ❌ 不支持多消费者组（一个消息被一个消费者消费后就不存在了）
- ❌ 确认机制缺失（消费者拿到消息后挂了，消息丢失）
- ✅ 简单、高性能、适合"最多一次"的消息场景

### 基于 Pub/Sub 的发布订阅

广播模式——发布者发送消息，所有订阅者都能收到：

```
Pub/Sub 模型：
            ┌──────────────────────┐
            │    Publisher          │
            │  PUBLISH news:sports  │
            └─────────┬────────────┘
                      │
                      ▼
            ┌──────────────────────┐
            │    Redis Channel      │
            │    news:sports        │
            └──────┬──────────┬────┘
                   │          │
                   ▼          ▼
            ┌─────────┐ ┌─────────┐
            │Sub A    │ │Sub B    │
            │SUBSCRIBE│ │SUBSCRIBE│
            │news:sp.│ │news:sp.│
            └─────────┘ └─────────┘
            同时收到消息
```

```java
@Service
public class PubSubService {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    // 发布消息
    public void publish(String channel, String message) {
        redisTemplate.convertAndSend(channel, message);
        log.info("发布消息到 [{}]: {}", channel, message);
    }

    // 配置订阅者
    @Bean
    public MessageListenerAdapter sportsListener() {
        return new MessageListenerAdapter((MessageDelegate) (message, pattern) -> {
            String body = new String(message.getBody(), StandardCharsets.UTF_8);
            String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
            log.info("[体育频道] 收到消息: channel={}, body={}", channel, body);
        });
    }

    @Bean
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory,
            MessageListenerAdapter sportsListener) {

        RedisMessageListenerContainer container =
            new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        // 订阅 sports 频道（支持模式匹配如 news:*）
        container.addMessageListener(sportsListener,
            new PatternTopic("news:sports"));
        return container;
    }
}
```

**Pub/Sub 的局限**：
- ❌ 消息不持久化——订阅者不在线就永远收不到
- ❌ 没有 ACK 机制——消费者挂了消息丢失
- ❌ 数据积压——消费者慢时消息直接丢弃（缓冲区固定）
- ✅ 适合实时广播通知（如 WebSocket 推送、配置变更通知）

### 基于 ZSet 的延迟队列

将 ZSet 的 score 存为执行时间戳，定期轮询 score 范围内的任务：

```
ZSet 延迟队列原理：
  ZADD delay:queue 1700000000 "task:1"   ← score = 执行时间戳
  ZADD delay:queue 1700000060 "task:2"   ← 60 秒后执行
  ZADD delay:queue 1700000120 "task:3"   ← 120 秒后执行

  消费者轮询：ZRANGEBYSCORE delay:queue 0 now
                  ↑ 只取已到期的任务
  取出后：ZREM delay:queue "task:1"      ← 从队列中删除
```

```java
@Service
public class DelayQueueService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String DELAY_QUEUE_KEY = "delay:queue:tasks";

    // 添加延迟任务
    public void addTask(String taskId, long delayMs) {
        // score = 当前时间 + 延迟时间
        double score = System.currentTimeMillis() + delayMs;
        redisTemplate.opsForZSet()
            .add(DELAY_QUEUE_KEY, taskId, score);
    }

    // 轮询已到期的任务（定时调度）
    @Scheduled(fixedRate = 1000) // 每秒轮询一次
    public void pollExpiredTasks() {
        long now = System.currentTimeMillis();

        // 获取所有已到期的任务（score <= 当前时间）
        Set<String> expiredTasks = redisTemplate.opsForZSet()
            .rangeByScore(DELAY_QUEUE_KEY, 0, now);

        if (expiredTasks == null || expiredTasks.isEmpty()) {
            return;
        }

        for (String taskId : expiredTasks) {
            // 原子删除：只删除成功（即自己是唯一消费者）的才执行
            Long removed = redisTemplate.opsForZSet()
                .remove(DELAY_QUEUE_KEY, taskId);

            if (removed != null && removed > 0) {
                // 删除成功，执行任务
                executeTask(taskId);
            } else {
                // 删除失败 → 被其他消费者抢走了
                log.debug("任务 {} 已被其他实例处理", taskId);
            }
        }
    }

    /**
     * 优化版：使用 Lua 脚本实现原子化的"获取并删除"
     * 避免并发问题
     */
    @Scheduled(fixedRate = 1000)
    public void pollExpiredTasksAtomic() {
        String script =
            "local tasks = redis.call('zrangebyscore', KEYS[1], 0, ARGV[1], 'limit', 0, 10) " +
            "if #tasks > 0 then " +
            "    redis.call('zrem', KEYS[1], unpack(tasks)) " +
            "end " +
            "return tasks";

        List<String> tasks = redisTemplate.execute(
            new DefaultRedisScript<>(script, List.class),
            Collections.singletonList(DELAY_QUEUE_KEY),
            String.valueOf(System.currentTimeMillis())
        );

        if (tasks != null && !tasks.isEmpty()) {
            tasks.forEach(this::executeTask);
        }
    }

    private void executeTask(String taskId) {
        log.info("执行延迟任务: {}", taskId);
    }
}
```

**ZSet 延迟队列的局限**：
- ❌ 轮询造成 CPU 空转（即使没有任务，每秒也要执行一次 ZRANGEBYSCORE）
- ❌ 精度受限于轮询间隔（每秒一次 = 最多 1 秒精度）
- ✅ 实现简单，不需要额外组件
- ✅ 适合小时/分钟级别的延迟（如订单 30 分钟未支付取消）

### 基于 Stream 的企业级消息队列

Redis 5.0 引入的 **Stream** 是 Redis 最完善的消息队列实现，它支持：

```
Stream 核心结构：
  ┌────────────────────────────────────────────────────────────┐
  │  Stream: mystream                                           │
  │                                                             │
  │  ┌──────┬──────────┬──────────────┬──────────────────┐     │
  │  │ EntryID  │  Key-Value Pairs  │  ...            │     │
  │  ├──────┼──────────┼──────────────┼──────────────────┤     │
  │  │ 0-1   │ sensorId:123, temp:25.5                  │     │
  │  │ 0-2   │ sensorId:124, temp:26.1                  │     │
  │  │ 0-3   │ order:1001, status:paid                  │     │
  │  └──────┴───────────────────────────────────────────┘     │
  │                                                             │
  │  Consumer Group: group1                                     │
  │  ├─ Consumer: consumer-1  ── PEL: [0-1, 0-2]              │
  │  ├─ Consumer: consumer-2  ── PEL: [0-3]                    │
  │  └─ Last Delivered ID: 0-2                                 │
  └────────────────────────────────────────────────────────────┘

  PEL = Pending Entries List（待确认消息列表）
       消费者读取后但未 XACK 的消息存在这里
```

**Stream vs 其他队列功能对比**：

| 功能 | List | Pub/Sub | ZSet | Stream |
|------|------|---------|------|--------|
| 持久化 | ✅ | ❌ 不持久 | ✅ | ✅ |
| ACK 机制 | ❌ | ❌ | ❌ | ✅ |
| 消费者组 | ❌ | ✅（广播） | ❌ | ✅ |
| 消息回溯 | ❌ | ❌ | ❌ | ✅ |
| 阻塞读取 | ✅ BRPOP | ❌ | ❌ | ✅ XREAD |
| 延迟消息 | ❌ | ❌ | ✅ | ❌（需二次开发） |

---

## 5.2 潜在风险

### 消息丢失

核心风险：消息已从队列中取出（List 的 RPOP / Stream 的 XREAD），但消费者在处理过程中宕机，消息无法找回。

```
消息丢失场景：
  消费者 A                       Redis Queue
    │                               │
    │ BRPOP queue:task              │
    │ ◄── "msg:1001"                │
    │                               │
    │ [处理业务逻辑...]              │
    │ [宕机！]                      │  ← "msg:1001" 已经从 List 中删了
    │                               │    无法找回！
```

### 消息堆积导致 OOM

当生产者速度远大于消费者速度时，Redis 内存中的消息持续增长，最终撑爆内存。

```
消息堆积时序：
  时间     生产者     消费者    队列长度     内存占用
  ──────────────────────────────────────────────
  T0      100/s      50/s       0          1MB
  T1      100/s      50/s      50         2MB    ← 开始积压
  T2      100/s      50/s      100        3MB
  T3      100/s      50/s      200        5MB
  T4      100/s      50/s      500        11MB
  T5      100/s      10/s      2000      41MB
  T6      100/s      10/s      10000    201MB
  T7      100/s      10/s      50000     1GB+   ← OOM!
```

### 轮询延迟队列的性能损耗

每秒做一次 `ZRANGEBYSCORE` 查询，即使没有任务也不断轮询。对于 10 个延迟队列，每秒就是 10 次查询，产生不必要的网络和 CPU 开销。

---

## 5.3 优化与应对方案

### Stream 的 ACK 机制（PEL）

```java
@Service
public class StreamQueueService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String STREAM_KEY = "stream:orders";
    private static final String GROUP_NAME = "order-group";
    private static final String CONSUMER_NAME = "consumer-1";

    // 初始化消费者组
    @PostConstruct
    public void initConsumerGroup() {
        // 如果消费者组不存在则创建
        try {
            redisTemplate.opsForStream().createGroup(STREAM_KEY, GROUP_NAME);
        } catch (Exception e) {
            // 组已存在则忽略
            log.info("消费者组已存在: {}", GROUP_NAME);
        }
    }

    // 生产者：发送消息到 Stream
    public void sendOrder(String orderId, String status) {
        Map<String, String> message = new HashMap<>();
        message.put("orderId", orderId);
        message.put("status", status);
        message.put("timestamp", String.valueOf(System.currentTimeMillis()));

        RecordId recordId = redisTemplate.opsForStream()
            .add(STREAM_KEY, message);
        log.info("发送消息成功: id={}, orderId={}", recordId, orderId);
    }

    // 消费者：读取并处理消息，处理完成发送 ACK
    @Scheduled(fixedDelay = 100)
    public void consumeOrders() {
        // XREADGROUP GROUP group-name consumer-name
        // 从未 ACK 的消息开始读取，最多读取 10 条
        List<MapRecord<String, Object, Object>> records = redisTemplate
            .opsForStream()
            .read(Consumer.from(GROUP_NAME, CONSUMER_NAME),
                StreamReadOptions.empty().count(10),
                StreamOffset.create(STREAM_KEY, ReadOffset.lastConsumed()));

        if (records == null || records.isEmpty()) {
            return;
        }

        for (MapRecord<String, Object, Object> record : records) {
            try {
                // 处理消息
                Map<Object, Object> value = record.getValue();
                String orderId = (String) value.get("orderId");
                processOrder(orderId);

                // ACK：告诉 Redis 这个消息已处理完成
                redisTemplate.opsForStream()
                    .acknowledge(STREAM_KEY, GROUP_NAME, record.getId());
                log.debug("消息处理完成并 ACK: id={}", record.getId());

            } catch (Exception e) {
                log.error("消息处理失败: id={}", record.getId(), e);
                // 不 ACK → 消息留在 PEL 中，后续可以重试
            }
        }
    }

    // 处理 PEL 中积压的失败消息（定时重试）
    @Scheduled(fixedDelay = 60_000) // 每分钟重试一次
    public void retryPendingMessages() {
        PendingMessages pendingMessages = redisTemplate
            .opsForStream()
            .pending(STREAM_KEY, GROUP_NAME);

        PendingMessagesSummary summary = pendingMessages.get();
        if (summary == null || summary.getTotalPendingMessages() == 0) {
            return;
        }

        log.warn("发现 {} 条待重试消息", summary.getTotalPendingMessages());

        // 重新读取 PEL 中的消息
        List<MapRecord<String, Object, Object>> pendingRecords = redisTemplate
            .opsForStream()
            .read(Consumer.from(GROUP_NAME, CONSUMER_NAME + "-retry"),
                StreamReadOptions.empty().count(100),
                StreamOffset.create(STREAM_KEY, ReadOffset.unconsumed()));

        if (pendingRecords != null) {
            for (MapRecord<String, Object, Object> record : pendingRecords) {
                try {
                    retryProcess(record);
                    redisTemplate.opsForStream()
                        .acknowledge(STREAM_KEY, GROUP_NAME, record.getId());
                } catch (Exception e) {
                    log.error("重试仍然失败，记录到死信队列: id={}", record.getId());
                    // 超过重试次数 → 转移到死信队列
                    sendToDeadLetter(record);
                }
            }
        }
    }
}
```

### 消息堆积处理策略

```java
@Component
public class BackPressureManager {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String QUEUE_KEY = "stream:orders";
    private static final long BACKPRESSURE_THRESHOLD = 10_000;

    // 监控队列长度，触发背压
    @Scheduled(fixedRate = 5000)
    public void checkBackPressure() {
        Long queueLength = redisTemplate.opsForStream()
            .info(QUEUE_KEY).streamLength();

        if (queueLength == null) return;

        if (queueLength > BACKPRESSURE_THRESHOLD) {
            log.warn("消息队列积压严重！当前长度: {}", queueLength);

            // 1. 自动扩容消费者
            scaleUpConsumers(queueLength);

            // 2. 通知生产者降速
            notifyProducerToSlowDown(queueLength);

            // 如果队列长度接近 OOM 阈值（取决于 maxmemory）
            if (queueLength > 50_000) {
                // 直接丢弃非重要消息
                redisTemplate.opsForStream()
                    .trim(QUEUE_KEY, 40_000); // 截断到 4 万条
                log.error("队列超过安全阈值，已截断: {}", queueLength);
            }
        }
    }

    private void scaleUpConsumers(long queueLength) {
        // K8s HPA 自动扩容，或手动增加消费者线程
        int currentConsumers = getCurrentConsumerCount();
        int targetConsumers = (int) Math.ceil(
            (double) queueLength / BACKPRESSURE_THRESHOLD);
        if (targetConsumers > currentConsumers) {
            log.info("扩容消费者: {} → {}", currentConsumers, targetConsumers);
            // TODO: 调用扩容接口
        }
    }

    private void notifyProducerToSlowDown(long queueLength) {
        // 通过 Redis 发布减压信号
        redisTemplate.convertAndSend("channel:backpressure",
            "queue_length=" + queueLength);
    }
}
```

---

## 5.4 生产级示例代码

### 基于 Stream 的订单处理系统

```java
@Service
public class OrderStreamService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String STREAM_KEY = "stream:order:events";

    @PostConstruct
    public void init() {
        try {
            redisTemplate.opsForStream()
                .createGroup(STREAM_KEY, CreateGroupWriter.group("payment-group"));
        } catch (Exception ignored) {}
        try {
            redisTemplate.opsForStream()
                .createGroup(STREAM_KEY, CreateGroupWriter.group("inventory-group"));
        } catch (Exception ignored) {}
    }

    // 订单创建事件
    public void orderCreated(OrderEvent event) {
        Map<String, String> msg = Map.of(
            "type", "ORDER_CREATED",
            "orderId", event.getOrderId(),
            "userId", String.valueOf(event.getUserId()),
            "amount", String.valueOf(event.getAmount()),
            "timestamp", String.valueOf(System.currentTimeMillis())
        );
        redisTemplate.opsForStream().add(STREAM_KEY, msg);
    }

    // 支付组消费者（处理支付回调、发送通知）
    @Scheduled(fixedDelay = 200)
    public void paymentConsumer() {
        List<MapRecord<String, Object, Object>> records = redisTemplate
            .opsForStream()
            .read(Consumer.from("payment-group", "payment-worker-1"),
                StreamReadOptions.empty().count(5).block(Duration.ofSeconds(2)),
                StreamOffset.create(STREAM_KEY, ReadOffset.lastConsumed()));

        if (records == null) return;

        for (MapRecord<String, Object, Object> record : records) {
            try {
                String type = (String) record.getValue().get("type");
                String orderId = (String) record.getValue().get("orderId");

                switch (type) {
                    case "ORDER_CREATED":
                        handlePayment(orderId);
                        break;
                    case "ORDER_PAID":
                        sendNotification(orderId);
                        break;
                    default:
                        log.warn("未知事件类型: {}", type);
                }

                redisTemplate.opsForStream()
                    .acknowledge(STREAM_KEY, "payment-group", record.getId());
            } catch (Exception e) {
                log.error("处理失败: {}", record.getId(), e);
            }
        }
    }

    // 库存组消费者（独立消费组，并行处理）
    @Scheduled(fixedDelay = 200)
    public void inventoryConsumer() {
        List<MapRecord<String, Object, Object>> records = redisTemplate
            .opsForStream()
            .read(Consumer.from("inventory-group", "inventory-worker-1"),
                StreamReadOptions.empty().count(5).block(Duration.ofSeconds(2)),
                StreamOffset.create(STREAM_KEY, ReadOffset.lastConsumed()));

        if (records == null) return;

        for (MapRecord<String, Object, Object> record : records) {
            try {
                String type = (String) record.getValue().get("type");
                String orderId = (String) record.getValue().get("orderId");

                if ("ORDER_CREATED".equals(type)) {
                    deductInventory(orderId);
                }

                redisTemplate.opsForStream()
                    .acknowledge(STREAM_KEY, "inventory-group", record.getId());
            } catch (Exception e) {
                log.error("库存扣减失败: {}", record.getId(), e);
            }
        }
    }
}
```

### 延迟任务优化：时间轮算法 + Redis

对于秒级的延迟精度，可以使用时间轮算法优化轮询开销：

```java
/**
 * 分层时间轮 + Redis ZSet 优化（简化版）
 *
 * 思路：
 *   - 秒级精度任务：放在 Redis ZSet 中，每秒只轮询一次
 *   - 毫秒级精度任务：放在本地时间轮中
 *   - 本地时间轮无任务时，不消耗 CPU
 */
@Component
public class OptimizedDelayQueue {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String DELAY_QUEUE_KEY = "delay:queue";

    // 本地时间轮（Netty 的 HashedWheelTimer 或 Java 的 ScheduledExecutor）
    private final HashedWheelTimer timer = new HashedWheelTimer(
        new DefaultThreadFactory("delay-timer"),
        100, TimeUnit.MILLISECONDS, // 100ms 一个 tick
        512 // 512 个槽位
    );

    // 添加高精度延迟任务（毫秒级）
    public void addPreciseTask(String taskId, long delayMs, Runnable task) {
        if (delayMs <= 60_000) {
            // 1 分钟内的任务使用本地时间轮
            timer.newTimeout(timeout -> {
                // 直接执行
                task.run();
            }, delayMs, TimeUnit.MILLISECONDS);
        } else {
            // 超过 1 分钟的任务使用 Redis ZSet
            double score = System.currentTimeMillis() + delayMs;
            redisTemplate.opsForZSet()
                .add(DELAY_QUEUE_KEY, taskId, score);
        }
    }

    // 秒级轮询 Redis 中的长时间延迟任务
    @Scheduled(fixedRate = 1000)
    public void pollLongDelayTasks() {
        long now = System.currentTimeMillis();
        Set<String> tasks = redisTemplate.opsForZSet()
            .rangeByScore(DELAY_QUEUE_KEY, 0, now, 0, 100);

        if (tasks == null || tasks.isEmpty()) return;

        for (String taskId : tasks) {
            Long removed = redisTemplate.opsForZSet()
                .remove(DELAY_QUEUE_KEY, taskId);
            if (removed != null && removed > 0) {
                log.info("执行延迟任务: {}", taskId);
            }
        }
    }
}
```

---

## 本章总结

| 方案 | 适用场景 | 可靠性 | 复杂度 |
|------|---------|-------|--------|
| **List + BRPOP** | 简单异步任务、日志收集 | 低（无 ACK） | ⭐ |
| **Pub/Sub** | 实时广播通知 | 最低（不持久化） | ⭐ |
| **ZSet** | 延迟任务、定时调度 | 中（轮询有间隙） | ⭐⭐ |
| **Stream** | 企业级消息队列、订单处理 | 高（ACK + PEL） | ⭐⭐⭐ |

**实际选型建议**：
1. **绝大多数 Java 项目**应该直接使用 **Stream**——它的消费者组、ACK、重试机制是生产环境必需的
2. **延迟任务**推荐使用 ZSet + Lua 原子化，或直接上 RabbitMQ/RocketMQ 的延迟消息
3. **List 队列只适合"丢了也无所谓"的场景**（如访问日志收集）
4. **避免使用 Pub/Sub 做核心业务**——消息丢失是无声的，你都不知道丢了

> **为什么不直接用 RabbitMQ/RocketMQ？**
> - Redis Stream 的优点是**不需要引入额外的中间件**——如果项目已经在用 Redis，Stream 是一个"零成本"的消息队列
> - 但 Stream 在消息堆积、持久化、死信队列等方面不如专业的 MQ
> - 选择标准：消息量 < 10 万/天、不需要死信/重试/事务 → Redis Stream 够了
> - 消息量大、需要复杂路由、跨团队使用 → 上 RabbitMQ/RocketMQ