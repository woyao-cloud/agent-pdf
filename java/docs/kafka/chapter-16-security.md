# 第16章 安全机制

## 16.1 安全威胁模型

在一个典型的Kafka部署中，可能面临以下安全威胁：

**未授权访问**：任何知道Broker地址和端口的客户端都可以连接并读写数据。如果Kafka直接暴露在公网（应该避免但确实有这种情况），任何人都可以向Topic发送消息或消费数据。

**数据泄露**：消息在网络传输中未加密，第三方可以窃听网络流量获取敏感数据（订单信息、用户数据、支付记录等）。

**数据篡改**：攻击者截获并篡改传输中的消息内容。

**权限失控**：内部某个业务线恶意读取其他业务线的Topic数据。

Kafka的安全机制从三个层面应对这些威胁：**认证**（你是谁？）、**授权**（你能做什么？）、**加密**（数据安全吗？）。

## 16.2 认证机制

### SASL/SCRAM（推荐）

SCRAM（Salted Challenge Response Authentication Mechanism）是目前推荐的认证方式，它通过挑战-响应机制验证客户端身份，密码不会在网络上明文传输：

```properties
# Broker配置
sasl.enabled.mechanisms=SCRAM-SHA-512
sasl.mechanism.inter.broker.protocol=SCRAM-SHA-512

# 创建用户
kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --add-config 'SCRAM-SHA-512=[password=admin-secret]' \
  --entity-type users --entity-name admin
```

### mTLS（最高安全级别）

双向TLS是最安全的认证方式，客户端和服务端都需要持有并交换证书。mTLS不仅验证了客户端身份，还加密了所有通信：

```properties
# Broker配置
ssl.client.auth=required
ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
```

认证方式的选择：
- 开发环境：不需要认证（PLAINTEXT监听器）
- 生产环境：SASL/SCRAM（推荐）或 mTLS（最高安全）
- 公网环境：必须使用SSL加密 + SASL认证

## 16.3 授权机制

ACL（Access Control Lists）控制哪个用户可以执行哪些操作。ACL的配置遵循"白名单"原则：未明确授权的操作默认被拒绝：

```bash
# 授权Producer写入特定Topic
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --allow-principal User:producer \
  --operation Write --operation Describe \
  --topic orders

# 授权Consumer读取Topic
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --allow-principal User:consumer \
  --operation Read --operation Describe \
  --topic orders

# 授权Consumer使用指定的消费者组
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --allow-principal User:consumer \
  --operation Read \
  --group order-group

# 拒绝某个用户的所有操作
kafka-acls.sh --authorizer-properties zookeeper.connect=localhost:2181 \
  --add --deny-principal User:malicious \
  --operation All --topic orders
```

## 16.4 安全最佳实践

| 威胁 | 措施 | 配置要点 |
|------|------|---------|
| 未授权访问 | 启用SASL认证 | sasl.enabled.mechanisms |
| 数据泄露 | 启用SSL加密 | listeners=SSL:// |
| 内部越权 | 配置ACL | authorizer.class.name |
| 恶意操作 | 开启审计日志 | 监控JMX指标 |

建议的安全配置等级：
- **开发环境**：PLAINTEXT（无安全）
- **测试环境**：SASL/PLAIN + ACL（有认证有授权）
- **生产环境**：SASL/SCRAM + SSL + ACL（全量安全配置）