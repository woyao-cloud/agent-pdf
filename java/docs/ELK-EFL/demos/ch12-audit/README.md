# 第12章：安全审计日志

## 目标

演示审计日志的独立通道设计：应用通过 Kafka 发送审计事件，Logstash 路由到独立的审计索引。
审计索引在写入 1 天后自动设为只读，保证不可篡改。

## 前置依赖

- 共享基础设施已启动（含 Kafka 和 ES）
- `sysctl -w vm.max_map_count=262144`（如果之前没配过）

## 启动步骤

```bash
# 1. 先确保基础设施已启动（ES + Kibana + Kafka + Logstash）
# 在 demos 目录下：
docker compose up -d

# 2. 创建审计日志专用的 ILM 策略和索引模板（与第8章的 app-logs 不同）
bash ch12-audit/setup/setup.sh

# 3. 启动审计服务
cd ch12-audit
mvn spring-boot:run
# 监听 8085 端口
```

## 验证方法

```bash
# 4. 模拟审计事件：登录
curl -X POST http://localhost:8085/api/audit/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"admin_001","ip":"192.168.1.100"}'

# 5. 模拟审计事件：管理员操作
curl -X POST http://localhost:8085/api/audit/admin-action \
  -H 'Content-Type: application/json' \
  -d '{"adminId":"admin_001","orderId":"ORD-20240115-001","newStatus":"REFUNDED"}'

# 6. 在 ES 中查看审计索引
curl "http://localhost:9200/audit-logs-*/_search?pretty"

# 7. 在 Kibana 中查看
# Data View 名称: audit-logs, Index pattern: audit-logs-*
```

## 审计索引特点

```
audit-logs-* 索引（与 app-logs-* 的区别）：

  字段：timestamp, userId, userIp, action, resource, resourceId, detail, result
  ILM：Hot(1d) → Warm(readonly) → Delete(365d)
  安全：写入后 1 天自动设为只读
  Mapping：dynamic: strict（防止未知字段混入）
```

## 架构说明

```
AuditLogger → Kafka (topic: audit-logs) → Logstash → ES (索引: audit-logs-*)
```

## 清理

```bash
# Ctrl+C 停止服务
rm -rf logs/

# 删除审计索引（如需要）
# curl -X DELETE "http://localhost:9200/audit-logs-*"
```


curl -X POST http://localhost:9200/audit-logs-*/_search?pretty \
-H "Content-Type: application/json" \
-d '{
  "size": 20,
  "sort": [{"@timestamp": "desc"}]
}'

curl -X POST http://localhost:9200/app-logs-*/_search?pretty \
-H "Content-Type: application/json" \
-d '{
  "query": {
    "match": {
      "message": "994"
    }
  }
}'