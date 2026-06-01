# 第8章 缓存与数据库双写一致性（终极解决方案）

## 8.1 经典一致性模型剖析

### 为什么"先更新 DB 再删除缓存"仍有问题？

Cache Aside 模式的惯用做法是"先更新 DB，再删除缓存"。在第 3 章我们展示了一个极端并发场景，这里深入分析其本质原因：

```
不一致的根因——读写操作的"交错窗口"：

  时间线：
  线程 A（写）                 线程 B（读）
    │                           │
    │ UPDATE DB (set name="v2") │
    │                           │  SELECT DB (read "v1")
    │                           │  返回 "v1"
    │ DEL cache (删除缓存)      │
    │                           │  SET cache "v1" ← 缓存中写入旧数据！
    │                           │
    │           结果：缓存中是 "v1"，DB 中是 "v2"
```

**本质原因**：读操作的"回写缓存"发生在写操作的"删除缓存"之后。这不是锁的问题，是**时序交错**的问题——DB 的执行时间不确定性导致读写顺序无法严格保证。

**这个问题发生的概率**：在低并发下几乎不会发生（写操作远快于读操作的回写）。但在以下情况更容易触发：
- 读写并发度高（秒杀、热点数据）
- DB 响应慢（复杂查询、慢 SQL）
- 网络延迟大（跨机房部署）

### 延迟双删策略

延迟双删的核心思路：在第一次删除缓存后，等待一段时间（确保并发读操作已回写完成），再删一次。

```java
@Service
public class ConsistencyService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private UserMapper userMapper;

    private static final int DELAY_MS = 500;

    @Transactional
    public void updateUser(User user) {
        String cacheKey = "user:" + user.getId();

        // 1. 第一次删除缓存
        redisTemplate.delete(cacheKey);

        // 2. 更新数据库
        userMapper.updateById(user);

        // 3. 延迟后再删一次
        //    为什么是 500ms？需要考虑：
        //    - 读 DB 的平均耗时（通常 5-50ms）
        //    - 写缓存耗时（<5ms）
        //    - 网络延迟
        //    500ms 是一个保守的"安全阈值"
        executorService.schedule(() -> {
            redisTemplate.delete(cacheKey);
        }, DELAY_MS, TimeUnit.MILLISECONDS);
    }
}
```

**延迟双删的核心问题——"延迟多久"？**

| 场景 | 建议延迟 | 理由 |
|------|---------|------|
| 同机房部署，DB 响应 <10ms | 100-200ms | 读操作极快，短时间等即可 |
| 跨机房部署，延迟 20-50ms | 500-1000ms | 需要覆盖网络往返时间 |
| DB 有慢查询（>100ms） | 1000-2000ms | 慢查询导致读操作的窗口更长 |

> **实战建议**：延迟双删是一个"防御性设计"，不是终极方案。它无法 100% 保证一致——如果并发读的 DB 查询耗时超过了你的延迟时间，脏数据仍然会写入。**更可靠的方案是第 8.2 节的 Binlog 订阅方案**。

---

## 8.2 异步最终一致性架构（生产推荐）

### 架构总览

```
异步最终一致性架构：

  应用服务                      MySQL                   Canal                    MQ                  Redis
    │                           │                       │                       │                   │
    │ 写入 DB                   │                       │                       │                   │
    │ ──────────────────────►   │                       │                       │                   │
    │                           │                       │                       │                   │
    │                           │ Binlog 变更            │                       │                   │
    │                           │ ───────────────────►  │                       │                   │
    │                           │                       │                       │                   │
    │                           │                       │ 解析为 RowChange      │                   │
    │                           │                       │ ──────────────►       │                   │
    │                           │                       │                       │                   │
    │                           │                       │                       │ 消费者监听         │
    │                           │                       │                       │ ────────────────► │
    │                           │                       │                       │                   │
    │                           │                       │                       │ DEL user:1001     │
    │                           │                       │                       │ ────────────────► │
    │                           │                       │                       │                   │

  优点：
    1. 与业务代码解耦——应用层不需要写任何缓存删除逻辑
    2. Binlog 记录了所有数据变更——不会漏掉任何一次更新
    3. MQ 重试保障——删除失败可以重试，直到成功
```

### Spring Boot + Canal + RocketMQ 实现

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.alibaba.otter</groupId>
    <artifactId>canal.client</artifactId>
    <version>1.1.7</version>
</dependency>
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.2.3</version>
</dependency>
```

#### 第一步：Canal 客户端——监听 Binlog 变更

```java
/**
 * Canal 客户端：监听 MySQL Binlog 变更
 *
 * 工作原理：
 *   1. Canal 伪装成 MySQL 从节点，拉取 Binlog
 *   2. 解析 Binlog 为 RowChange 对象
 *   3. 发送到 MQ 供消费者处理
 */
@Component
public class CanalBinlogListener {

    @Autowired
    private RocketMQTemplate rocketMQTemplate;

    private static final String DESTINATION = "example"; // Canal instance
    private static final String TOPIC = "cache-sync";

    @PostConstruct
    public void startCanalClient() {
        Executors.newSingleThreadExecutor().submit(() -> {
            // Canal 连接配置
            CanalConnector connector = CanalConnectors.newSingleConnector(
                new InetSocketAddress("127.0.0.1", 11111),
                DESTINATION, "", ""
            );

            int batchSize = 1000;
            try {
                connector.connect();
                connector.subscribe(".*\\..*"); // 监听所有表
                connector.rollback();

                while (true) {
                    Message message = connector.getWithoutAck(batchSize);
                    long batchId = message.getId();
                    if (batchId == -1 || message.getEntries().isEmpty()) {
                        Thread.sleep(100);
                        continue;
                    }

                    for (CanalEntry.Entry entry : message.getEntries()) {
                        if (entry.getEntryType() == CanalEntry.EntryType.ROWDATA) {
                            // 解析 Binlog 行变更
                            CanalEntry.RowChange rowChange = CanalEntry.RowChange
                                .parseFrom(entry.getStoreValue());

                            String tableName = entry.getHeader().getTableName();
                            String schemaName = entry.getHeader().getSchemaName();

                            for (CanalEntry.RowData rowData : rowChange.getRowDatasList()) {
                                // 构建缓存失效消息
                                CacheInvalidateMessage msg = buildInvalidateMessage(
                                    schemaName, tableName,
                                    rowChange.getEventType(), rowData
                                );
                                if (msg != null) {
                                    rocketMQTemplate.convertAndSend(
                                        TOPIC, msg);
                                }
                            }
                        }
                    }

                    connector.ack(batchId); // ACK，确认已处理
                }
            } catch (Exception e) {
                log.error("Canal 客户端异常", e);
            } finally {
                connector.disconnect();
            }
        });
    }

    private CacheInvalidateMessage buildInvalidateMessage(
            String schema, String table,
            CanalEntry.EventType eventType,
            CanalEntry.RowData rowData) {

        // 解析主键 ID（约定所有表的主键名为 id）
        String id = null;
        for (CanalEntry.Column column : rowData.getAfterColumnsList()) {
            if ("id".equals(column.getName())) {
                id = column.getValue();
                break;
            }
        }

        if (id == null) return null;

        // 表名 → 缓存 Key 前缀的映射
        String cacheKeyPrefix = tableToCachePrefix(table);
        if (cacheKeyPrefix == null) return null;

        return new CacheInvalidateMessage(
            cacheKeyPrefix + ":" + id,
            eventType.name(),
            schema, table, id
        );
    }

    private String tableToCachePrefix(String table) {
        Map<String, String> mapping = Map.of(
            "user", "user",
            "order", "order",
            "product", "product"
        );
        return mapping.get(table);
    }

    @Data
    @AllArgsConstructor
    public static class CacheInvalidateMessage {
        private String cacheKey;
        private String eventType;
        private String schema;
        private String table;
        private String recordId;
    }
}
```

#### 第二步：MQ 消费者——删除缓存

```java
/**
 * 缓存失效消费者
 *
 * 从 MQ 消费 Binlog 变更消息，删除对应的缓存
 * 如果删除失败，MQ 的重试机制保障最终一致性
 */
@Component
@RocketMQMessageListener(
    topic = "cache-sync",
    consumerGroup = "cache-sync-consumer",
    consumeMode = ConsumeMode.ORDERLY // 按 Key 顺序消费，避免并发问题
)
public class CacheInvalidateConsumer
        implements RocketMQListener<CacheInvalidateMessage> {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Override
    public void onMessage(CacheInvalidateMessage message) {
        try {
            String cacheKey = message.getCacheKey();

            // 删除缓存
            redisTemplate.delete(cacheKey);

            // 如果是更新操作，可能还需要删除关联的列表缓存
            if ("UPDATE".equals(message.getEventType())) {
                // 删除列表缓存（如 user:list, user:page:*）
                String pattern = message.getTable() + ":list*";
                Set<String> keys = redisTemplate.keys(pattern);
                if (keys != null && !keys.isEmpty()) {
                    redisTemplate.delete(keys);
                }
            }

            log.info("缓存失效成功: key={}, table={}, id={}",
                cacheKey, message.getTable(), message.getRecordId());

        } catch (Exception e) {
            log.error("缓存失效失败: {}", message, e);
            // 抛出异常 → RocketMQ 将自动重试
            // 默认重试 16 次，间隔递增（5s → 10s → 30s → 1m → 2m...）
            throw new RuntimeException("缓存删除失败，需要重试", e);
        }
    }
}
```

#### 第三步：Docker Compose 部署 Canal

```yaml
# docker/canal/docker-compose.yml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: mydb
    volumes:
      - ./my.cnf:/etc/mysql/conf.d/my.cnf
    ports:
      - "3306:3306"

  canal:
    image: canal/canal-server:v1.1.7
    environment:
      canal.instance.mysql.slaveId: 1234
      canal.instance.master.address: mysql:3306
      canal.instance.dbUsername: canal
      canal.instance.dbPassword: canal
      canal.instance.connectionCharset: UTF-8
      canal.mq.topic: cache-sync
    ports:
      - "11111:11111"
    depends_on:
      - mysql
```

### 消息队列重试机制

```
MQ 重试阶梯（RocketMQ 默认）：
  第 1 次重试：5 秒后
  第 2 次重试：10 秒后
  第 3 次重试：30 秒后
  第 4 次重试：1 分钟后
  第 5 次重试：2 分钟后
  ...递增...
  第 16 次重试：2 小时后
  第 17 次：进入死信队列（人工介入）

  对于缓存删除操作，通常 3-5 次重试内就能成功（Redis 宕机恢复时间）
```

```java
// 死信队列处理——人工介入 + 自动补偿
@Component
@RocketMQMessageListener(
    topic = "%DLQ%cache-sync-consumer",
    consumerGroup = "cache-sync-dlq-consumer"
)
public class DeadLetterHandler
        implements RocketMQListener<CacheInvalidateMessage> {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Override
    public void onMessage(CacheInvalidateMessage message) {
        log.warn("处理死信消息: {}", message);

        try {
            // 最后一次尝试删除
            redisTemplate.delete(message.getCacheKey());
            log.info("死信消息处理成功: key={}", message.getCacheKey());
        } catch (Exception e) {
            // 写入数据库告警表，通知人工介入
            log.error("缓存删除彻底失败，需要人工处理: {}", message);
            // TODO: insert into alert_table
        }
    }
}
```

### 为什么需要 Binlog + MQ？

对比几种方案：

| 方案 | 一致性保障 | 代码侵入性 | 复杂度 | 推荐场景 |
|------|-----------|-----------|--------|---------|
| 先更新 DB，再删除 Cache | 弱（并发窗口） | 低 | ⭐ | 低并发、非关键数据 |
| 延迟双删 | 中（时间窗口不可控） | 低 | ⭐⭐ | 中等并发 |
| Canal + MQ | 强（最终一致） | **无侵入** | ⭐⭐⭐⭐⭐ | 核心业务、高并发 |

> **实战建议**：
> - 80% 的场景，Cache Aside + 过期时间就够了——毕竟缓存本来就有 TTL，短暂的不一致会自动恢复
> - Canal + MQ 适用于"缓存绝不能读到旧数据"的核心场景（如库存、价格、配置）
> - 不要为了"完美一致性"在应用层加分布式锁来同步写缓存——那样性能还不如直接读 DB

---

## 8.3 强一致性场景的取舍

### Redis 事务的局限

Redis 提供了 `MULTI`、`EXEC`、`DISCARD` 等事务命令，但它的"事务"和数据库的 ACID 事务有本质区别：

```bash
# Redis 事务示例
MULTI
SET user:1001:name "new_name"
SET user:1001:version 2
EXEC
```

**Redis 事务的特点**：
- ✅ 原子性（要不全部执行，要不全部不执行）
- ❌ 不支持回滚（如果第二条命令语法错误，第一条已经执行了）
- ❌ 没有隔离性（其他客户端可以在 MULTI/EXEC 之间读取到数据）
- ❌ 不支持持久性（取决于持久化配置）

```java
// Java 端 Redis 事务
public void redisTransactionExample(Long userId, String newName) {
    redisTemplate.execute(new SessionCallback<Object>() {
        @Override
        public Object execute(RedisOperations operations) {
            operations.multi();

            operations.opsForValue()
                .set("user:" + userId + ":name", newName);
            operations.opsForValue()
                .set("user:" + userId + ":version", "2");

            return operations.exec(); // 提交事务
        }
    });
}
```

### 为什么不建议用 Redis 做强一致性？

**2PC（两阶段提交）的代价**：

```
2PC 在分布式缓存场景中的问题：
  协调者（应用）          Redis 1               Redis 2
    │                     │                     │
    │ 准备阶段            │                     │
    │ SET key NX PX 1000  │                     │
    │ ──────────────────► │                     │
    │  OK                 │                     │
    │ ◄───────────────────│                     │
    │                     │                     │
    │ SET key NX PX 1000  │                     │
    │ ────────────────────────────────────────► │
    │                     │           OK        │
    │                     │ ◄──────────────────│
    │                     │                     │
    │ 提交阶段            │                     │
    │ 如果任何节点失败 → 需要协调回滚           │
    │ 如果协调者宕机 → 两个 Redis 都锁住       │
    │ （要等锁过期，这段时间无法提供服务）       │
```

**CAP 定理的约束**：Redis 本质上是 AP 系统（可用性 + 分区容忍性），强一致性需要 CP 系统（如 Zookeeper、Etcd）。如果你需要强一致的分布式锁或配置存储，应该用 ZK/Etcd，而不是 Redis。

### 缓存一致性的最终建议

```
决策树：

  需要缓存吗？
   ├── 否 → 直接读 DB（最简单）
   └── 是
        ├── 数据一致性要求极高（价格、库存、配置）
        │    └── Canal + MQ 异步失效
        │
        ├── 一致性要求一般（用户信息、商品详情）
        │    └── Cache Aside + 过期时间（DB 总有最终正确数据）
        │
        └── 对实时性有要求，不一致窗口越小越好
             └── Cache Aside + 延迟双删（额外兜底）
```

---

## 本章总结

| 层次 | 方案 | 不一致窗口 | 复杂度 |
|------|------|-----------|--------|
| **基础** | Cache Aside + TTL | < TTL 时间 | ⭐ |
| **进阶** | Cache Aside + 延迟双删 | < 几百毫秒 | ⭐⭐ |
| **高级** | Canal + MQ 异步失效 | < 秒级（取决于 MQ 延迟） | ⭐⭐⭐⭐⭐ |
| **不推荐** | 分布式锁 + 双写 | 极小（但性能极差） | ⭐⭐⭐⭐ |

**核心原则**：
1. **缓存一致性没有银弹**——你必须在"一致性"和"性能"之间做取舍
2. **TTL 是最好的兜底**——即使出现了不一致，TTL 到期后缓存自动失效，系统自我修复
3. **Canal + MQ 是生产环境的最优解**——与业务代码解耦，重试保障，适合核心数据
4. **不要做"完美"的方案**——如果业务可以接受 1 秒的不一致，就不要上 Canal。复杂性是有代价的