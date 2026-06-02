# 第7章：Fluent Bit 日志采集

## 目标

演示 Fluent Bit 作为边缘日志采集器，读取容器日志文件后写入 ES。

## 前置依赖

- 共享基础设施已启动
- 第3章的 Spring Boot 应用已启动（产生日志文件）

## 启动步骤

```bash
# 1. 停止 Filebeat（如果有）
docker compose -f ../ch05-filebeat/docker-compose.yml down

# 2. 启动 Fluent Bit
docker compose -f ch07-fluentbit/docker-compose.yml up -d

# 3. 查看 Fluent Bit 日志
docker logs fluent-bit --tail 20
```

## 验证方法

```bash
# 4. 验证 Fluent Bit 监控接口
curl http://localhost:2020/metrics

# 5. 在 ES 中搜索日志
curl "http://localhost:9200/app-logs-*/_search?pretty&q=serviceName:order-service"

# 6. 在 Kibana 中查看
# Data View: app-logs-*
```

## Fluent Bit vs Filebeat

| 对比 | Fluent Bit | Filebeat |
|------|-----------|----------|
| 内存 | 5-20MB | 30-50MB |
| K8s 元数据 | 原生支持 | 需插件 |
| 数据处理 | Lua 扩展 | 有限 |
| 输出插件 | 丰富 | 丰富 |

## 清理

```bash
docker compose -f ch07-fluentbit/docker-compose.yml down -v
```