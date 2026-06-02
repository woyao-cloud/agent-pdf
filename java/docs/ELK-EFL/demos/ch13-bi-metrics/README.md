# 第13章：实时业务指标监控

## 目标

演示从日志中提取业务指标并在 Kibana 中构建实时 GMV 大屏。

## 前置依赖

- 共享基础设施已启动（ES + Kibana）
- 已运行 `bash ch08-ilm/setup.sh` 创建索引模板

## 启动步骤

```bash
# 1. 启动 BI 指标服务
cd ch13-bi-metrics
mvn spring-boot:run
# 监听 8086 端口
```

## 验证方法

```bash
# 2. 模拟单笔交易
curl -X POST http://localhost:8086/api/metrics/order \
  -H 'Content-Type: application/json' \
  -d '{"city":"北京","category":"手机","amount":6999}'

# 3. 批量模拟交易（生成 200 条指标数据）
curl -X POST "http://localhost:8086/api/metrics/batch?count=200"

# 4. 在 ES 中验证指标数据
curl "http://localhost:9200/app-logs-*/_search?pretty&q=message:ORDER_METRIC&size=5"

# 5. 在 Kibana 中建大屏
# Data View: app-logs-* → 过滤 message: "ORDER_METRIC"
# 指标：SUM(metric_amount) → GMV 翻牌器
# 分组：metric_category → 品类排行
```

## 日志输出

```json
{
  "@timestamp": "...",
  "level": "INFO",
  "message": "ORDER_METRIC: action=create_order, amount=6999.0, city=北京, category=手机, ...",
  "serviceName": "bi-metrics-service"
}
```

## Logstash 解析配置

参见 `ch06-kafka-logstash/logstash/pipeline/logstash.conf` 中解析 ORDER_METRIC 的部分。

## 清理

```bash
# Ctrl+C 停止服务
rm -rf logs/
```