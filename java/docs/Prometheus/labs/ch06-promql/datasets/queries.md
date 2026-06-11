# PromQL 练习集

## 基础查询

```promql
# 查询所有 demo_http_requests_total 序列
demo_http_requests_total

# 带 Label 过滤
demo_http_requests_total{method="GET"}
demo_http_requests_total{method=~"GET|POST"}
demo_http_requests_total{instance="web-1", region="us-east"}
```

## 速率计算
```promql
rate(demo_http_requests_total[1m])
increase(demo_http_requests_total[1h])
```

## 聚合查询
```promql
sum(demo_http_requests_total) by (method)
sum(demo_http_requests_total) by (method, region)
sum(demo_http_requests_total) without (instance)
topk(3, sum(demo_http_requests_total) by (endpoint))
```

## 进阶查询
```promql
# 每个 method 的请求数占比
demo_http_requests_total / on() group_left sum(demo_http_requests_total) by (method)

# P95 延迟
histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le))

# 按 method 拆分的 P99
histogram_quantile(0.99, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))

# rate vs irate 对比
rate(demo_cpu_spike_percent[1m])
irate(demo_cpu_spike_percent[5m])

# offset
rate(demo_http_requests_total[5m]) - rate(demo_http_requests_total[5m] offset 1h)
```

## Recording Rules
```promql
method:demo_http_requests:rate5m
method:demo_request_duration:p99
job:demo_http_requests:rate5m
```