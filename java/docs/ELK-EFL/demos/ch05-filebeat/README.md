# 第5章：Filebeat 直连 ES

## 目标

演示 Filebeat 采集 Spring Boot 的 JSON 日志文件，直接发送到 Elasticsearch。

## 前置依赖

- 共享基础设施已启动（`docker compose up -d` 根目录）
- 第3章的 Spring Boot 应用已启动（产生日志文件）

## 启动步骤

```bash
# 1. 确保 Spring Boot 应用正在运行（产生日志文件）
# 在另一个终端：
cd ../ch03-json-logging && mvn spring-boot:run

# 2. 启动 Filebeat
# 回到 demos 目录
cd ..
docker compose -f ch05-filebeat/docker-compose.yml up -d

# 3. 在 Spring Boot 应用中产生一些日志
curl -X POST http://localhost:8081/api/order/create \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_1001","productId":"PROD-001","amount":999}'
```

## 验证方法

```bash
# 4. 在 ES 中搜索日志
curl "http://localhost:9200/app-logs-*/_search?pretty&q=level:INFO"

# 5. 在 Kibana 中查看
# 打开 http://localhost:5601
# Management → Data Views → Create Data View
# Name: app-logs, Index pattern: app-logs-*
# Discover 中搜索 serviceName: "order-service"
```

## 预期效果

- ES 中出现 `app-logs-2024.01.15` 索引
- 索引中包含 `level`, `message`, `traceId`, `serviceName` 等字段
- 日志内容与第 3 章输出的 JSON 一致

## 清理

```bash
docker compose -f ch05-filebeat/docker-compose.yml down -v
```

## 对比

| 方案 | 延迟 | 可靠性 | 复杂度 |
|------|------|--------|--------|
| Filebeat → ES（本章） | 低 | 中 | 低 |
| Filebeat → Kafka → Logstash → ES（第6章） | 中 | 高 | 高 |