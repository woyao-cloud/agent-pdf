# 第8章 数据管道ETL

## 场景描述

Kafka Connect是Kafka的ETL工具，用于在Kafka和外部系统（数据库、文件系统、云服务）之间可靠地传输数据。不用写一行代码即可完成数据导入导出。

### 解决的问题

**传统ETL的痛点**：
```
手写脚本读取数据库 → 转换 → 写入目标 → 维护困难
数据格式耦合 → 修改schema需要改代码
无容错机制 → 失败后恢复困难
```

**Kafka Connect**：
```
Source Connector → Kafka Topic → Sink Connector
     ↓                               ↓
  数据库/文件                       ES/S3/HDFS
```

### 实现原理

**Kafka Connect架构**：
```
Kafka Connect Cluster
├── Worker 1
│   ├── Source Connector: MySQL→Kafka
│   └── Sink Connector: Kafka→Elasticsearch
├── Worker 2
│   ├── Source Connector: PostgreSQL→Kafka
│   └── Sink Connector: Kafka→S3
└── Worker 3
    ├── Source Connector: MongoDB→Kafka
    └── Sink Connector: Kafka→HDFS
```

**Connector类型**：

| 类型 | 方向 | 示例 |
|------|------|------|
| Source | 外部系统→Kafka | JDBC Source、Debezium Source |
| Sink | Kafka→外部系统 | Elasticsearch Sink、S3 Sink |
| 单机模式 | 单进程 | 开发和测试 |
| 分布式模式 | 集群 | 生产环境 |

### Docker Compose

```yaml
# docker/scenario-08-etl/docker-compose.yml
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

  # Kafka Connect
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
      CONNECT_KEY_CONVERTER_SCHEMAS_ENABLE: "false"
      CONNECT_VALUE_CONVERTER_SCHEMAS_ENABLE: "false"
      CONNECT_PLUGIN_PATH: "/usr/share/java,/etc/kafka-connect/jars"
    volumes:
      - ./mysql-connector-java.jar:/etc/kafka-connect/jars/mysql-connector-java.jar
```

### JDBC Source Connector配置

```json
// 注册JDBC Source Connector
// POST http://localhost:8083/connectors
{
  "name": "mysql-orders-source",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
    "connection.url": "jdbc:mysql://mysql:3306/mydb",
    "connection.user": "root",
    "connection.password": "root",
    "table.whitelist": "orders",
    "mode": "incrementing",
    "incrementing.column.name": "id",
    "topic.prefix": "mysql-",
    "poll.interval.ms": 1000,
    "batch.max.rows": 100,
    "errors.tolerance": "all",
    "errors.deadletterqueue.topic.name": "connect-dlq"
  }
}
```

### Sink Connector配置

```json
// 注册Elasticsearch Sink Connector
// POST http://localhost:8083/connectors
{
  "name": "es-orders-sink",
  "config": {
    "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
    "connection.url": "http://elasticsearch:9200",
    "topics": "mysql-orders",
    "key.ignore": true,
    "type.name": "_doc",
    "batch.size": 100,
    "linger.ms": 1000,
    "transforms": "removePrefix",
    "transforms.removePrefix.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.removePrefix.regex": "mysql-(.*)",
    "transforms.removePrefix.replacement": "$1"
  }
}
```

### 单表获取所有数据（快照+增量）

Kafka Connect JDBC Source支持多种模式：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| bulk | 全量导入 | 一次性加载 |
| incrementing | 自增ID增量 | 新增数据 |
| timestamp | 时间戳增量 | 数据更新 |
| timestamp+incrementing | 时间戳+自增ID | 新增+更新 |

```json
{
  "mode": "timestamp+incrementing",
  "incrementing.column.name": "id",
  "timestamp.column.name": "updated_at",
  "validate.non.null": false
}
```

### 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| **数据重复** | 重启后可能重复拉取 | 确保sink端幂等 |
| **Schema变更** | 源表增减字段 | 使用Avro + Schema Registry |
| **连接器宕机** | Connect节点故障 | 分布式模式 + 多Worker |
| **性能瓶颈** | 单Connector吞吐不足 | 增加Task数量 |

**Task并行度**：
```json
{
  "config": {
    "tasks.max": 4
  }
}
// Connect会将数据范围拆分为4个task并行拉取
// 如：id 1-1000 task1, 1001-2000 task2, ...
```

### 典型问题处理

**问题：如何保证MySQL到ES的数据一致性？**

```
方案1：使用CDC（下一章详解）
- Debezium监听binlog
- 精确捕获每行变更

方案2：双写 + 对账
- 写入MySQL同时写入Kafka
- 定时对账检查一致性

方案3：全量+增量
- 首次bulk全量加载
- 后续timestamp+incrementing增量
```

### 关键技能

- 熟练掌握Kafka Connect REST API
- 理解Single Message Transform (SMT)转换
- 掌握Connector的并行度配置
- 熟悉JDBC、ES、S3等常用Connector
- 理解Schema管理策略