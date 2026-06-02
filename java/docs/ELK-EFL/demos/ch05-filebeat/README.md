# 第5章：Filebeat 直连 ES

## 目标

演示 Filebeat 采集 Spring Boot 的 JSON 日志文件，直接发送到 Elasticsearch。  
`ch05-filebeat/docker-compose.yml` 包含完整基础设施（ES 集群 + Kibana + Kafka + Logstash + Filebeat），无需提前启动其他 compose 文件。

## 启动步骤

```bash
# 0. 确保宿主机已配置（如果之前没做过）
sysctl -w vm.max_map_count=262144

# 1. 启动完整基础设施（ES + Kibana + Kafka + Logstash + Filebeat）
#    在 ch05-filebeat 目录下
docker compose up -d

# 2. 等待 ES 集群就绪（约 30-60 秒）
curl http://localhost:9200/_cluster/health
# 期望：status 为 "green"

# 3. 创建索引模板（必须！否则 Data View 无法创建）
bash ../ch08-ilm/setup.sh
```

### 启动 Spring Boot 应用产生日志

```bash
# 4. 新终端，启动 Spring Boot 应用
cd ../ch03-json-logging
mvn spring-boot:run

# 5. 产生测试日志
curl -X POST http://localhost:8081/api/order/create \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_1001","productId":"PROD-001","amount":999}'

# 6. 查看 JSON 日志文件（确认日志已产生）
cat logs/order-service.json.log
```

## 验证方法

```bash
# 7. 在 ES 中搜索日志（确认日志已写入）
curl "http://localhost:9200/app-logs-*/_search?pretty" | grep -c "_index"

# 8. 查看索引列表
curl "http://localhost:9200/_cat/indices/app-logs-*?v"

# 9. 在大约 2-3 分钟后，打开 Kibana
open http://localhost:5601

# 10. 创建 Data View
# Kibana → Management → Stack Management → Data Views → Create Data View
# Name: app-logs
# Index pattern: app-logs-*
# Timestamp: @timestamp
# → "在 app-logs-* 中找到了 3 个字段"（出现这个提示说明成功）

# 11. 在 Discover 中搜索
# 切换到 Discover 页面
# 搜索：serviceName: "order-service"
# 应该能看到 3-4 条日志记录
```

## 预期效果

```
1. ES 中出现 app-logs-000001 索引
2. 索引中包含 level, message, traceId, serviceName 等字段
3. 日志内容与第 3 章输出的 JSON 一致
4. Kibana Data View 识别出字段
5. Discover 中可搜索日志
```

## 可能的问题

```
问题 1：Kibana 提示 "No data" 或无法创建 Data View
  原因：ES 中没有匹配 app-logs-* 的索引或索引模板
  解决：
    # 检查 ES 中是否有索引
    curl "http://localhost:9200/_cat/indices/app-logs-*?v"
    # 如果没有，检查索引模板
    curl "http://localhost:9200/_index_template/app-logs-template"
    # 如果模板不存在，重新运行 setup.sh
    bash ../ch08-ilm/setup.sh

问题 2：Kibana 中搜索不到日志
  原因：Filebeat 采集的数据有一定延迟
  解决：等待 10-30 秒后刷新页面
    # 或者直接查看 ES 中有没有数据
    curl "http://localhost:9200/app-logs-*/_search?pretty&q=level:INFO"
```

## 清理

```bash
# 停止所有容器并删除数据
docker compose down -v
```