# 第8章：ILM 索引生命周期管理

## 目标

演示 ES 索引模板和 ILM 策略的配置，自动管理日志索引的创建、滚动和删除。

## 前置依赖

- ES 集群已启动（`docker compose up -d`）

## 启动步骤

```bash
# 1. 直接执行设置脚本
bash ch08-ilm/setup.sh
```

## 验证方法

```bash
# 2. 查看 ILM 策略
curl "http://localhost:9200/_ilm/policy/app-logs-policy?pretty"

# 3. 查看索引模板
curl "http://localhost:9200/_index_template/app-logs-template?pretty"

# 4. 查看已创建的索引
curl "http://localhost:9200/_cat/indices/app-logs-*?v"

# 5. 写入一条测试数据（验证模板生效）
curl -X POST "http://localhost:9200/app-logs/_doc" -H 'Content-Type: application/json' -d '{
  "@timestamp": "2024-01-15T10:00:00Z",
  "level": "INFO",
  "message": "测试日志",
  "serviceName": "test",
  "traceId": "test-123"
}'

# 6. 尝试写入未定义字段（验证 dynamic: strict）
curl -X POST "http://localhost:9200/app-logs/_doc" -H 'Content-Type: application/json' -d '{
  "@timestamp": "2024-01-15T10:00:00Z",
  "unknown_field": "这个会报错"
}'
# 预期：返回 illegal_argument_exception
```

## 清理

```bash
# 删除模板和策略
curl -X DELETE "http://localhost:9200/_index_template/app-logs-template"
curl -X DELETE "http://localhost:9200/_ilm/policy/app-logs-policy"
```