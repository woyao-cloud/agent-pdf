# 第16章 安全机制

## 16.1 认证（Authentication）

### 解决的问题

Kafka集群可能在公网或跨部门网络中部署，需要防止未经授权的客户端接入。

### SASL/PLAIN

```properties
# Broker配置（server.properties）
listeners=SASL_PLAINTEXT://:9093
security.inter.broker.protocol=SASL_PLAINTEXT
sasl.mechanism.inter.broker.protocol=PLAIN
sasl.enabled.mechanisms=PLAIN

# JAAS配置（kafka_server_jaas.conf）
KafkaServer {
    org.apache.kafka.common.security.plain.PlainLoginModule required
    username="admin"
    password="admin-secret"
    user_admin="admin-secret"
    user_producer="producer-secret"
    user_consumer="consumer-secret";
};
```

### SASL/SCRAM（推荐）

```bash
# Broker配置
sasl.enabled.mechanisms=SCRAM-SHA-256,SCRAM-SHA-512

# 创建用户
kafka-configs.sh --zookeeper localhost:2181 \
  --alter --add-config 'SCRAM-SHA-512=[password=admin-secret]' \
  --entity-type users --entity-name admin
```

### mTLS（最安全）

```properties
# Broker配置
listeners=SSL://:9093
ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
ssl.keystore.password=test1234
ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
ssl.truststore.password=test1234
ssl.client.auth=required
```

## 16.2 授权（Authorization）

### ACL配置

```bash
# 授予用户生产者权限
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --allow-principal User:producer \
  --operation Write --operation Describe \
  --topic orders

# 授予消费者组权限
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --allow-principal User:consumer \
  --operation Read --operation Describe \
  --group order-group

# 拒绝特定用户
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --deny-principal User:evil \
  --operation All --topic orders
```

### 授权模型

```
Super User: 管理员（集群操作）
├── Producer: 特定Topic的Write权限
├── Consumer: 特定Topic的Read权限 + Group权限
├── Connect: 内部Topic的Read/Write权限
└── Streams: 内部Topic的Read/Write权限
```

## 16.3 加密（Encryption）

### SSL传输加密

```properties
# Producer配置
security.protocol=SSL
ssl.truststore.location=/var/private/ssl/client.truststore.jks
ssl.truststore.password=test1234
```

## 16.4 最佳实践

| 安全层级 | 措施 | 适用场景 |
|---------|------|---------|
| 网络 | 防火墙、VPC隔离 | 所有环境 |
| 传输 | SASL + SSL | 公网环境 |
| 认证 | SCRAM/mTLS | 多租户场景 |
| 授权 | ACL | 精细权限控制 |
| 审计 | 日志记录 | 合规要求 |