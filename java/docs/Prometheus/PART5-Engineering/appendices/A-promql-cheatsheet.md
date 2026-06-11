# 附录 A：PromQL 常用函数与"菜谱"速查表

## 基础聚合

```promql
# 求和
sum(metric) by (label)

# 取最大值
max(metric) by (label)

# 取最小值
min(metric) by (label)

# 取平均值
avg(metric) by (label)

# 取 Top 3
topk(3, metric)

# 取 Bottom 3
bottomk(3, metric)

# 分位数
quantile(0.95, metric) by (label)

# 计数
count(metric) by (label)

# 标准差
stddev(metric) by (label)

# 方差
stdvar(metric) by (label)
```

## 速率计算

```promql
# 每秒速率（推荐）
rate(counter[5m])

# 窗口内增量
increase(counter[1h])

# 瞬时速率（最后两样本）
irate(counter[5m])

# 差值
delta(gauge[1h])

# 环比变化率
rate(counter[5m]) / rate(counter[5m] offset 1w) - 1
```

## 时间窗口

```promql
# 平均值
avg_over_time(gauge[1h])

# 最大值
max_over_time(gauge[1h])

# 最小值
min_over_time(gauge[1h])

# 求和
sum_over_time(counter[1h])

# 计数
count_over_time(metric[1h])

# 分位数
quantile_over_time(0.95, gauge[1h])

# 标准差
stddev_over_time(gauge[1h])
```

## 预测与趋势

```promql
# 简单线性预测（未来 4 小时）
predict_linear(gauge[1h], 4 * 3600)

# 导数的速率
deriv(gauge[1h])

# 时间序列预测（holt winters）
holt_winters(gauge[1h], 0.3, 0.1)
```

## 标量操作

```promql
# 阈值比较
metric > 0.9

# 范围限制
metric > 0 and metric < 1

# 布尔结果转为 0/1
metric > bool 0.9

# 缺失值处理
metric or on() vector(0)
```

## 同环比

```promql
# 同比（上周同期）
rate(counter[1h] offset 1w)

# 环比（前一小时）
rate(counter[5m]) - rate(counter[5m] offset 1h)

# 周同比变化率
(rate(counter[5m]) - rate(counter[5m] offset 1w)) / rate(counter[5m] offset 1w) * 100
```

## 常用场景"菜谱"

### CPU 使用率
```promql
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### 内存使用率
```promql
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100
```

### 磁盘使用率
```promql
(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100
```

### 网络吞吐
```promql
rate(node_network_receive_bytes_total[5m])
rate(node_network_transmit_bytes_total[5m])
```

### 请求 QPS
```promql
sum by(instance)(rate(http_requests_total[5m]))
```

### P99 延迟
```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, instance))
```

### 错误率
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

### 证书过期天数
```promql
(probe_ssl_earliest_cert_expiry - time()) / 86400
```