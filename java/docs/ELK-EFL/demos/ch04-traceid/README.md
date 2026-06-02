# 第4章：全链路追踪 TraceId

## 目标

演示 3 个微服务（订单、支付、库存）之间 TraceId 的自动透传和日志关联。

## 架构

```
客户端 → order-service:8081 → payment-service:8082 → stock-service:8083
  │                              │                        │
  └── X-Trace-Id 从请求头透传      │                        │
                                  └── X-Trace-Id 自动透传   │
                                                           └── X-Trace-Id 自动透传
```

## 前置依赖

- JDK 17+
- Maven 3.8+

## 启动步骤

```bash
# 1. 先编译所有模块
cd ch04-traceid
mvn clean package -DskipTests

# 2. 启动库存服务（8083 端口）
mvn -pl stock-service spring-boot:run

# 3. 新终端，启动支付服务（8082 端口）
mvn -pl payment-service spring-boot:run

# 4. 新终端，启动订单服务（8081 端口）
mvn -pl order-service spring-boot:run
```

## 验证方法

```bash
# 5. 发送下单请求
curl -X POST http://localhost:8081/api/order/create \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_1001","amount":999}'

# 预期响应：包含 traceId
# {"status":"SUCCESS","payment":"支付成功, traceId=xxx","traceId":"xxx"}

# 6. 查看各服务的 JSON 日志
cat order-service/logs/order-service.json.log
cat payment-service/logs/payment-service.json.log
cat stock-service/logs/stock-service.json.log

# 三个日志文件中的 traceId 应该相同！
```

## 预期日志输出

```
order-service.json.log 中的记录（包含 traceId）：
{
  "@timestamp": "...",
  "level": "INFO",
  "message": "订单服务: 收到下单请求, userId=user_1001, amount=999",
  "serviceName": "order-service",
  "traceId": "a1b2c3d4e5f6"
}

payment-service.json.log 中的记录（traceId 相同！）：
{
  "@timestamp": "...",
  "level": "INFO",
  "message": "支付服务: 收到支付请求, orderId=ORD-XXXX, amount=999",
  "serviceName": "payment-service",
  "traceId": "a1b2c3d4e5f6"     ← 与订单服务相同！
}

stock-service.json.log 中的记录（traceId 相同！）：
{
  "@timestamp": "...",
  "level": "INFO",
  "message": "库存服务: 扣减库存, productId=unknown",
  "serviceName": "stock-service",
  "traceId": "a1b2c3d4e5f6"     ← 三个服务的 traceId 全部一致！
}
```

## TraceId 透传流程

```
1. 客户端 → order-service 的 TraceIdFilter 生成 traceId
2. order-service 的 FeignConfig 将 traceId 写入请求头 X-Trace-Id
3. payment-service 的 TraceIdFilter 从请求头读取 traceId → 注入 MDC
4. 如果 payment-service 也通过 Feign 调用 stock-service（当前未实现）
5. stock-service 的 TraceIdFilter 同样从请求头读取

在 ELK 中搜索 traceId → 跨 3 个服务的 6+ 条日志全部返回
```

## 停止

```bash
# Ctrl+C 分别停止每个终端
# 清理日志
rm -rf */logs/
```