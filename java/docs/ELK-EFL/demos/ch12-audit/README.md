# 第12章：安全审计日志

## 目标

演示审计日志的独立通道设计：应用通过 Kafka 发送审计事件，Logstash 路由到独立的审计索引。

## 前置依赖

- 共享基础设施已启动（含 Kafka）
- 已运行 `bash ch08-ilm/setup.sh` 创建审计索引模板（可选）

## 启动步骤

```bash
# 1. 启动审计服务
cd ch12-audit
mvn spring-boot:run
# 监听 8085 端口
```

## 验证方法

```bash
# 2. 模拟审计事件：登录
curl -X POST http://localhost:8085/api/audit/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"admin_001","ip":"192.168.1.100"}'

# 3. 模拟审计事件：管理员操作
curl -X POST http://localhost:8085/api/audit/admin-action \
  -H 'Content-Type: application/json' \
  -d '{"adminId":"admin_001","orderId":"ORD-20240115-001","newStatus":"REFUNDED"}'

# 4. 查看日志
cat logs/audit-service.json.log

# 5. 验证 Kafka 中是否存在审计消息
docker exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic audit-logs \
  --from-beginning --max-messages 5
```

## 架构说明

```
AuditLogger → Kafka (topic: audit-logs) → Logstash → ES (索引: audit-logs-*)
```

## 清理

```bash
# Ctrl+C 停止服务
rm -rf logs/
```