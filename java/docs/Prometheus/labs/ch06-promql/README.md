# 第6章 实验：PromQL 深度解析

## 实验目的

1. 掌握 rate vs irate 的区别
2. 理解向量匹配机制（group_left/group_right）
3. 体验 Recording Rules 的性能提升
4. 学会识别 PromQL 性能杀手

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| promql-generator | :8087 | 多模式时序数据生成器 |
| Prometheus | :9096 | 含 recording rules |
| Grafana | :3006 | 可视化面板 |

## 实验步骤

### 实验 1：rate vs irate 对比

在 Grafana Explore 中叠加两条查询线：
```promql
rate(demo_cpu_spike_percent[1m])
irate(demo_cpu_spike_percent[5m])
```

预期：rate 平滑但滞后，irate 快速响应但锯齿明显。

### 实验 2：向量匹配

```bash
bash scripts/explain-vector.sh
```

观察 group_left 如何实现多对一匹配。

### 实验 3：Recording Rules 性能对比

首先禁用 recording-rules.yml，重启 Prometheus 后运行：
```bash
bash scripts/benchmark-query.sh
```

然后启用 recording-rules.yml，重启后查询预计算指标：
```bash
curl -s 'http://localhost:9096/api/v1/query?query=method:demo_http_requests:rate5m'
```

对比两种方式的查询耗时。

## PromQL 练习

参考 `datasets/queries.md` 中的练习。

## 推荐查询

```promql
# QPS 趋势
sum(rate(demo_http_requests_total[1m])) by (method)

# P95 延迟
histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))

# CPU 突刺检测
avg_over_time(demo_cpu_spike_percent[1m]) > 80
```

## 清理

```bash
docker compose down -v
```