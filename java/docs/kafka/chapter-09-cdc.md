# 第9章 变更数据捕获CDC

## 场景描述

变更数据捕获（Change Data Capture, CDC）通过读取数据库的binlog（MySQL）或WAL（PostgreSQL），实时捕获数据变更并推送到Kafka。这是实现数据库到其他系统的实时同步标准方案。

### 解决的问题

```
传统方案：定时批量同步（每小时/每天）→ 延迟大、数据不一致
JDBC轮询方案：每隔几秒查询updated_at → 无法捕获删除、性能开销大
CDC方案：监听binlog → 实时、零侵入、无性能影响
```

### 实现原理

**Debezium架构**：
```
MySQL Binlog → Debezium Connector → Kafka Topic
                    ↓
            每条变更=一条消息
            数据格式：before/after镜像
            包含：op(操作类型)、ts_ms(时间戳)
```

**CDC消息结构**：
```json
{
  "schema": { ... },
  "payload": {
    "before": null,
    "after": {
      "id": 1001,
      "name": "张三",
      "email": "zhangsan@example.com"
    },
    "source": {
      "version": "1.9.7.Final",
      "connector": "mysql",
      "name": "mysql-connector",
      "ts_ms": 1695000000000,
      "snapshot": "false",
      "db": "mydb",
      "table": "users"
    },
    "op": "c",    // c=create, u=update, d=delete, r=read(snapshot)
    "ts_ms": 1695000001000,
    "transaction": null
  }
}
```

### Docker Compose（Debezium + MySQL + Kafka）

```yaml
# docker/scenario-09-cdc/docker-compose.yml
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

  # MySQL（开启binlog）
  mysql:
    image: debezium/example-mysql:2.3
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: debezium
      MYSQL_USER: mysqluser
      MYSQL_PASSWORD: mysqlpw

  # Debezium Connect
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
      KEY_CONVERTER: "org.apache.kafka.connect.json.JsonConverter"
      VALUE_CONVERTER: "org.apache.kafka.connect.json.JsonConverter"
      CONNECT_KEY_CONVERTER_SCHEMAS_ENABLE: "true"
      CONNECT_VALUE_CONVERTER_SCHEMAS_ENABLE: "true"
```

### Debezium Connector配置

```bash
# 注册MySQL CDC Connector
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
      "table.include.list": "inventory.orders,inventory.customers",
      "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
      "schema.history.internal.kafka.topic": "schemahistory.cdc",
      "decimal.handling.mode": "double",
      "tombstones.on.delete": "false"
    }
  }'
```

### Java消费CDC事件

```java
// ============ 消费CDC事件 ============
@KafkaListener(topics = "cdc.inventory.orders", groupId = "cdc-consumer")
public void handleCdcEvent(String message) {
    JsonNode event = objectMapper.readTree(message);
    
    String op = event.get("payload").get("op").asText();
    JsonNode after = event.get("payload").get("after");
    
    switch (op) {
        case "c":
            log.info("新增订单: id={}", after.get("id"));
            processCreate(after);
            break;
        case "u":
            log.info("更新订单: id={}", after.get("id"));
            processUpdate(event.get("payload").get("before"), after);
            break;
        case "d":
            log.info("删除订单: id={}", event.get("payload").get("before").get("id"));
            processDelete(event.get("payload").get("before"));
            break;
    }
}

// ============ 缓存同步场景 ============
// CDC + Redis缓存同步：数据库变更后自动更新Redis
// 业务代码不需要关心缓存一致性！
@Service
public class CacheSyncService {
    
    @KafkaListener(topics = "cdc.inventory.products", groupId = "cache-sync")
    public void syncCache(JsonNode event) {
        String op = event.get("payload").get("op").asText();
        JsonNode after = event.get("payload").get("after");
        
        String productId = after.get("id").asText();
        
        switch (op) {
            case "c": case "u":
                // 更新缓存
                stringRedisTemplate.opsForValue().set(
                    "product:" + productId,
                    objectMapper.writeValueAsString(after));
                break;
            case "d":
                // 删除缓存
                stringRedisTemplate.delete("product:" + productId);
                break;
        }
    }
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **binlog膨胀** | 大事务产生大量binlog | 拆分大事务、监控binlog大小 |
| **Schema变更兼容** | 增减字段导致消费失败 | 使用Avro + Schema Registry |
| **延迟增大** | 数据量暴增导致延迟 | 增加分区、并行消费 |
| **全量快照** | 首次启动需要快照大量数据 | 只snapshot需要的表 |

**Debezium性能调优**：
```json
{
  "max.batch.size": 2048,
  "max.queue.size": 8192,
  "poll.interval.ms": 300,
  "snapshot.fetch.size": 10000,
  "snapshot.mode": "when_needed"
}
```

### 典型问题处理

**问题：如何在CDC场景下处理DDL变更？**

```
方案1：Schema Registry（推荐）
- 使用Avro序列化
- Schema Registry管理版本
- 消费者自动兼容新旧Schema

方案2：DDL通知Topic
- 配置schema.history.internal.kafka.topic
- 记录所有Schema变更历史
- 消费者监听Schema变更

方案3：宽松消费
- 使用JSON序列化
- 消费者处理未知字段时跳过
- 不处理删除字段
```

### 关键技能

- 理解MySQL binlog格式和Debezium工作原理
- 掌握CDC的SnapShot和Streaming模式
- 熟悉Schema变更的兼容处理
- 掌握CDC在缓存同步、数据同步、审计日志中的应用
- 理解基于CDC的微服务架构（避免双写不一致）