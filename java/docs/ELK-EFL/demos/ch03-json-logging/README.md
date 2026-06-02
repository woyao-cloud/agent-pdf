# 第3章：JSON 结构化日志

## 目标

演示 Spring Boot 应用如何输出 JSON 格式的日志，以及日志中包含 TraceId、异常栈等结构化字段。

## 前置依赖

- JDK 17+
- Maven 3.8+

## 启动步骤

```bash
# 1. 启动应用
cd ch03-json-logging
mvn spring-boot:run
# 启动后监听 8081 端口
```

## 验证方法

### 验证 JSON 日志输出

```bash
# 2. 发送正常请求
curl -X POST http://localhost:8081/api/order/create \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_1001","productId":"PROD-001","amount":999}'

# 3. 查看 JSON 日志文件
cat logs/order-service.json.log
```

### 预期日志内容

```json
{
  "@timestamp": "2024-01-15T10:00:00.123Z",
  "level": "INFO",
  "logger": "com.example.order.controller.OrderController",
  "message": "收到下单请求, productId=PROD-001, amount=999",
  "serviceName": "order-service",
  "traceId": "a1b2c3d4e5f6",
  "userId": "user_1001"
}
```

### 验证异常日志

```bash
# 4. 触发异常
curl http://localhost:8081/api/order/error-demo

# 5. 查看日志中的 stack_trace 字段
cat logs/order-service.json.log | grep ERROR
```

### 验证 Filebeat 采集（如果已启动基础设施）

```bash
# 6. 启动 Filebeat
docker compose -f ../ch05-filebeat/docker-compose.yml up -d

# 7. 在 Kibana 中搜索
# 打开 http://localhost:5601 → Discover → 创建 Data View: app-logs-*
# 应该能看到刚刚写入的日志
```

## 相关章节

- 第3章：JSON 日志配置详解
- 第5章：Filebeat 采集 JSON 日志
- 第8章：ILM 索引模板

## 停止

```bash
# Ctrl+C 停止 Spring Boot
# 清理日志
rm -rf logs/
```