# 第9章 变更数据捕获CDC

## 9.1 场景故事：缓存与数据库的最终一致性

### 经典的双写不一致问题

在大多数Web应用中，为了提高读性能，会在数据库前面加一层Redis缓存。写入数据时，先更新数据库，再删除/更新缓存。这个看似简单的逻辑隐藏着一个经典陷阱：

```java
// 线程A：更新数据
UPDATE user SET name='张三' WHERE id=1;     // 1. 更新数据库
redis.del("user:1");                         // 2. 删除缓存

// 线程B：读取数据
// 恰好在A写完数据库但还没来得及删缓存时读
user = redis.get("user:1");                  // 1. 读到旧缓存（name='李四'）
```

如果并发请求量大，这种"数据库已更新、缓存未更新"的不一致窗口会频繁出现。各种解决方案（延迟双删、读写锁）要么实现复杂，要么影响性能。

CDC提供了一种优雅的解决方案：**业务代码完全不关心缓存更新**。业务代码只操作数据库，Debezium监听数据库的Binlog变化，自动将数据变更同步到Kafka，消费者从Kafka收到变更事件后更新缓存。

```
业务代码：UPDATE user SET name='张三' WHERE id=1;  ← 只需操作数据库
          ↓
MySQL Binlog → Debezium → Kafka Topic → 缓存更新消费者 → Redis
```

这种方案的优势是**零业务侵入**——所有现有业务代码都不需要修改，缓存同步的逻辑完全由CDC在后台自动完成。

## 9.2 实现原理

### Debezium的工作原理

Debezium是一个基于Kafka Connect的CDC工具。它的工作流程如下：

1. **连接数据库Binlog**：Debezium的MySQL Connector模拟为一个MySQL Slave节点，连接到Master的Binlog流。
2. **解析Binlog事件**：MySQL的Binlog中记录了每一行数据的变更，包括INSERT、UPDATE、DELETE操作。Debezium将这些二进制事件解析为结构化的Change Event。
3. **输出到Kafka**：每个变更事件被转换为一条Kafka消息，写入对应Topic。Topic的命名规则为 `topic.prefix.databaseName.tableName`。
4. **发送Schema变更**：当数据库表结构变化时，Debezium会将新的Schema信息发送到Schema Registry，确保消费者端的Schema始终与数据库保持一致。

### CDC消息的构成

一条典型的CDC消息包含了变更的完整信息：

```json
{
  "payload": {
    "before": {                           // 变更前的数据快照
      "id": 1001,
      "name": "旧名字",
      "email": "old@email.com"
    },
    "after": {                            // 变更后的数据快照
      "id": 1001,
      "name": "新名字",
      "email": "new@email.com"
    },
    "source": {                           // 变更来源信息
      "version": "2.3.0.Final",
      "connector": "mysql",
      "ts_ms": 1695000000000,
      "snapshot": "false",
      "db": "user_db",
      "table": "users"
    },
    "op": "u"                             // 操作类型
  }
}
```

`op` 字段的取值：
- `"c"` = Create（INSERT）
- `"u"` = Update（UPDATE）
- `"d"` = Delete（DELETE）
- `"r"` = Read（Snapshot阶段的SELECT结果）

`before` 和 `after` 的完整数据让消费者可以知道：
- 更新操作：旧值和新值是什么
- 删除操作：被删除的数据是什么（`after`为null）
- 新增操作：新增的数据是什么（`before`为null）

### Snapshot与Streaming

Debezium启动时，会先执行Snapshot（快照）阶段，然后再进入Streaming（流式）阶段。

**Snapshot阶段**：Connector首次启动时，读取数据库中所有现有数据。这个阶段对应所有消息的 `op = "r"`。Snapshot完成后，Connector记录当前Binlog位置，然后切换到Streaming模式。

**Streaming阶段**：实时监听Binlog的变更，每条变更对应一条Kafka消息。如果Connector崩溃或重启，它会从上次记录的Binlog位置继续消费，不会丢失数据。

## 9.3 Docker Compose与配置

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
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1

  mysql:
    image: debezium/example-mysql:2.3
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: debezium
      MYSQL_USER: mysqluser
      MYSQL_PASSWORD: mysqlpw

  connect:
    image: debezium/connect:2.3
    depends_on: [kafka, mysql]
    ports: ["8083:8083"]
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: "1"
      CONFIG_STORAGE_TOPIC: "connect-configs"
      OFFSET_STORAGE_TOPIC: "connect-offsets"
      STATUS_STORAGE_TOPIC: "connect-status"
```

注册Debezium MySQL Connector：
```bash
curl -i -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-connector",
    "config": {
      "connector.class": "io.debezium.connector.mysql.MySqlConnector",
      "database.hostname": "mysql",
      "database.port": "3306",
      "database.user": "debezium",
      "database.password": "dbz",
      "database.server.id": "184054",
      "topic.prefix": "cdc",
      "database.include.list": "inventory",
      "table.include.list": "inventory.orders",
      "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
      "schema.history.internal.kafka.topic": "schemahistory.cdc",
      "decimal.handling.mode": "double",
      "tombstones.on.delete": "false"
    }
  }'
```

### 缓存同步消费者

```java
@KafkaListener(topics = "cdc.inventory.orders", groupId = "cache-sync")
public void syncCache(JsonNode event) {
    String op = event.get("payload").get("op").asText();
    JsonNode after = event.get("payload").get("after");
    
    switch (op) {
        case "c": case "u":
            // 新增或更新 -> 更新Redis缓存
            String orderId = after.get("id").asText();
            redisTemplate.opsForValue().set(
                "order:" + orderId, objectMapper.writeValueAsString(after));
            break;
        case "d":
            // 删除 -> 清除Redis缓存
            JsonNode before = event.get("payload").get("before");
            redisTemplate.delete("order:" + before.get("id").asText());
            break;
    }
}
```

## 9.4 典型问题处理

**问题：如何在CDC场景下处理DDL变更？**

Schema变更兼容性处理：使用Avro + Schema Registry，消费者自动兼容新旧Schema。或者使用JSON宽松消费——消费者处理未知字段时跳过，不处理删除字段。

**问题：CDC延迟如何监控？**

通过Heartbeat事件监控延迟。Debezium支持定期发送Heartbeat事件，如果消费者在预期时间内没有收到Heartbeat，说明CDC链路出现了异常。