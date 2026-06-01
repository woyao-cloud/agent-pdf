# 第8章 数据管道ETL

## 8.1 场景故事：从MySQL到Elasticsearch

### 手写数据同步的痛苦

很多团队在项目初期会采用"手写同步脚本"的方式把MySQL数据同步到Elasticsearch：

```java
@Scheduled(fixedRate = 60000)
public void syncOrdersToES() {
    // 每1分钟查询最近更新的订单
    List<Order> orders = orderRepository.findByUpdatedAtAfter(lastSyncTime);
    for (Order order : orders) {
        // 逐个写入ES
        esClient.index("orders", order.getId(), order);
    }
    lastSyncTime = LocalDateTime.now();
}
```

这个方案在初期工作良好，但随着业务发展，问题逐渐暴露：

- **时延瓶颈**：1分钟的轮询间隔意味着ES中的数据至少比MySQL老1分钟。如果缩短轮询间隔到几秒，数据库压力会大幅上升。
- **无法捕获删除操作**：`updated_at`时间戳只能捕获更新和新增，无法捕获物理删除。需要额外维护一个"软删除"标记。
- **全量同步的尴尬**：如果ES索引需要重建（映射变更、数据恢复），需要停服维护或忍受长时间的不一致窗口。
- **扩展性问题**：每次新增一个需要同步的系统（比如还要同步到Redis、同步到ClickHouse），都需要编写新的同步脚本。

Kafka Connect解决了这些问题。它不需要写同步代码，只需要配置JSON即可。

## 8.2 实现原理

### Kafka Connect的架构

Kafka Connect的核心概念非常清晰：

**Connector（连接器）**：定义数据从哪里来到哪里去的高层配置。例如：一个JDBC Source Connector从MySQL读取数据，一个Elasticsearch Sink Connector将数据写入ES。

**Task（任务）**：Connector的实际执行单元。一个Connector可以拆分为多个Task并行工作。例如：从MySQL读取100万行数据时，可以启动4个Task，每个Task负责处理一部分数据。

**Worker（工作者）**：运行Connector和Task的进程。可以单机运行（Standalone模式）也可以集群运行（Distributed模式）。

**Converters（转换器）**：将Kafka Connect的内部数据格式（Connect Record）与Kafka存储的字节数组之间进行转换。常见的Converters有JsonConverter、AvroConverter、StringConverter。

**Transforms（转换器/SMT）**：在Connector处理数据时对数据记录进行轻量级修改。例如：重命名字段、删除字段、添加静态字段、路由到不同Topic等。

### Source Connector的工作模式

JDBC Source Connector支持多种数据拉取模式，理解这些模式的差异对于正确配置非常重要：

**Bulk模式**：一次性全量拉取。适用于首次加载或数据量小的场景。每次启动Connector或触发重新拉取时，执行完整的SELECT * FROM table语句。

**Incrementing模式**：基于自增ID增量拉取。适用于只有新增数据、没有数据更新的场景。Connector会记录上次拉取到的最大ID，下次拉取时只查询ID大于该值的记录。

**Timestamp模式**：基于时间戳增量拉取。适用于数据会被更新的场景。Connector记录上次拉取的最大时间戳，查询 `WHERE updated_at > last_timestamp`。

**Timestamp+Incrementing组合模式**：同时使用自增ID和时间戳。这是最通用的模式，适用于既有新增又有更新的场景，而且可以处理同一时间戳批次内的大量数据。

## 8.3 完整配置与实战

### Docker Compose环境

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

  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: mydb

  connect:
    image: confluentinc/cp-kafka-connect:7.5.0
    depends_on: [kafka]
    ports: ["8083:8083"]
    environment:
      CONNECT_BOOTSTRAP_SERVERS: kafka:9092
      CONNECT_REST_PORT: 8083
      CONNECT_GROUP_ID: "connect-cluster"
      CONNECT_CONFIG_STORAGE_TOPIC: "connect-configs"
      CONNECT_OFFSET_STORAGE_TOPIC: "connect-offsets"
      CONNECT_STATUS_STORAGE_TOPIC: "connect-status"
      CONNECT_KEY_CONVERTER: "org.apache.kafka.connect.json.JsonConverter"
      CONNECT_VALUE_CONVERTER: "org.apache.kafka.connect.json.JsonConverter"
      CONNECT_PLUGIN_PATH: "/usr/share/java,/etc/kafka-connect/jars"
    volumes:
      - ./mysql-connector-java.jar:/etc/kafka-connect/jars/mysql-connector-java.jar
```

注册JDBC Source Connector将MySQL订单数据实时同步到Kafka：
```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-orders-source",
    "config": {
      "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
      "connection.url": "jdbc:mysql://mysql:3306/mydb",
      "connection.user": "root",
      "connection.password": "root",
      "table.whitelist": "orders",
      "mode": "timestamp+incrementing",
      "incrementing.column.name": "id",
      "timestamp.column.name": "updated_at",
      "topic.prefix": "mysql-",
      "poll.interval.ms": 1000,
      "batch.max.rows": 100,
      "errors.tolerance": "all",
      "errors.deadletterqueue.topic.name": "connect-dlq"
    }
  }'
```

## 8.4 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 数据重复 | 重启后可能重复拉取 | 确保sink端幂等 |
| Schema变更 | 源表增减字段 | 使用Avro + Schema Registry |
| 性能瓶颈 | 单Connector吞吐不足 | 增加Task数量 |

JDBC Source Connector的性能瓶颈通常不在Kafka Connect本身，而在数据库端。如果数据库表有大量数据，要确保 `incrementing.column.name` 和 `timestamp.column.name` 列上有索引，否则全表扫描会拖慢数据库。