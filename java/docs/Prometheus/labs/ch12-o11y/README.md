# 第12章 实验：可观测性三大支柱联动

## 实验 1：Exemplar 演示

展示 Histogram 指标中嵌入 TraceID，在 Grafana 中实现 Metrics -> Traces 跳转。

```bash
cd exemplar-demo
docker compose up -d

# 查看生成的数据（含 Exemplar）
curl http://localhost:8089/metrics | grep demo_request_duration

# 在 Prometheus 中查询
# demo_request_duration_seconds_bucket
# 启用 Exemplar 存储后，可以在 Grafana 中看到 traceID
```

Grafana 配置：
1. 访问 http://localhost:3090
2. 数据源：Prometheus URL=http://prometheus:9090
3. 在 Prometheus 数据源 -> Exemplars 中配置 TraceID 字段

## 实验 2：Loki 集成

展示 Loki 日志收集和查询。

```bash
cd loki-integration
docker compose up -d

# 验证 Loki 运行
curl http://localhost:3100/ready

# 验证日志已发送
curl -s 'http://localhost:3100/loki/api/v1/query_range?query={job="varlogs"}' | python -m json.tool
```

Grafana 配置：
1. 访问 http://localhost:3091
2. 数据源：Loki URL=http://loki:3100
3. Explore 页面：查询 `{job="varlogs"}

## 清理

```bash
# Exemplar
cd exemplar-demo && docker compose down -v

# Loki
cd loki-integration && docker compose down -v
```