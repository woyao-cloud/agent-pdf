# 第7章：Fluent Bit 日志采集

## 目标

演示 Fluent Bit 作为边缘日志采集器，读取容器日志文件后写入 ES。

## 前置依赖

- 宿主机已配置 `sysctl -w vm.max_map_count=262144`
- 第3章的 Spring Boot 应用已启动（产生日志文件）

## 启动步骤

```bash
# 注意：ch07-fluentbit/docker-compose.yml 只包含 Fluent Bit
# 需要先启动基础设施（ES + Kibana）

# 0. 先启动根目录的基础设施（包含 ES + Kibana + Kafka）
cd ../../demos
docker compose up -d

# 1. 等待 ES 就绪
curl http://localhost:9200/_cluster/health

# 2. 创建索引模板（必须！）
bash ch08-ilm/setup.sh

# 3. 回到 ch07 目录
cd ch07-fluentbit

# 4. 停止 Filebeat（如果已启动）
docker compose -f ../ch05-filebeat/docker-compose.yml down 2>/dev/null

# 5. 启动 Fluent Bit
docker compose -f docker-compose.yml up -d

# 6. 查看 Fluent Bit 日志
docker logs fluent-bit --tail 20
```

## 验证方法

```bash
# 7. 验证 Fluent Bit 监控接口
curl http://localhost:2020/metrics

# 8. 在 ES 中搜索日志
curl "http://localhost:9200/app-logs-*/_search?pretty&q=serviceName:order-service"

# 9. 打开 Kibana 创建 Data View
open http://localhost:5601
# Management → Data Views → Create Data View
# Name: app-logs, Index pattern: app-logs-*, Timestamp: @timestamp
```

## Fluent Bit vs Filebeat

| 对比 | Fluent Bit | Filebeat |
|------|-----------|----------|
| 内存 | 5-20MB | 30-50MB |
| K8s 元数据 | 原生支持 | 需插件 |
| 数据处理 | Lua 扩展 | 有限 |

## 清理

```bash
docker compose -f ch07-fluentbit/docker-compose.yml down -v
```