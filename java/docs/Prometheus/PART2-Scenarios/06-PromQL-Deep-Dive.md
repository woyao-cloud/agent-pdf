# 第6章 PromQL 深度解析与性能调优

## 6.1 向量类型与匹配机制

### Instant Vector vs Range Vector

PromQL 中有两种核心向量类型：

| 类型 | 含义 | 示例 |
|------|------|------|
| Instant Vector | 查询时间点的最新值 | `http_requests_total` |
| Range Vector | 一段时间内的所有值 | `http_requests_total[5m]` |

理解两者的区别至关重要：`rate()`、`increase()`、`avg_over_time()` 等函数只接受 Range Vector。如果你传入 Instant Vector，Prometheus 会报错。

### 向量匹配：on() 与 ignoring()

当两个向量通过算术运算符进行计算时，Prometheus 需要确定哪些序列是"配对"的。默认按所有相同的 Label 进行匹配：

```promql
# 自动按所有相同 Label 匹配
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

但有时两个指标有不同数量的 Label：

```promql
# http_requests_total 有 method/endpoint/status 三个标签
# sum by(method) 只保留 method 标签

# 使用 on() 指定匹配的 Label
http_requests_total / on(method) group_left sum(http_requests_total) by (method)
```

**关键规则：**
- `on()`：指定用于匹配的 Label
- `ignoring()`：指定忽略的 Label（其余全部参与匹配）
- `group_left`：左侧多对一 → 右侧
- `group_right`：左侧一对多 → 右侧

## 6.2 rate() vs irate()

### rate()：窗口平均速率

`rate(v range-vector)` 计算窗口内的**平均每秒增量**。它的计算方式是：(窗口结束值 - 窗口开始值) / 窗口时间。

**优点：** 平滑，噪声低，适合宏观趋势呈现
**缺点：** 对突刺的响应有延迟（取决于窗口大小）

### irate()：瞬时速率

`irate(v range-vector)` 只取窗口内**最后两个样本**来计算瞬时速率。它的计算方式是：(最后两个值的差) / (两个值的时间差)。

**优点：** 对突刺响应极快，适合高频变化
**缺点：** 噪声大，曲线锯齿明显

### 对比表

| 维度 | rate | irate |
|------|------|-------|
| 计算方式 | 窗口内所有样本的平均 | 最后两个样本的瞬时值 |
| 平滑度 | 平滑 | 锯齿 |
| 突刺响应 | 滞后 1/2 窗口时间 | 几乎即时 |
| CPU 占用 | 较高（需遍历窗口内样本） | 较低（只需 2 个样本） |
| 推荐场景 | QPS、请求数趋势 | CPU 使用率、高频突刺检测 |

```promql
# CPU 突刺检测 → 使用 irate
irate(node_cpu_seconds_total{mode="user"}[5m]) > 0.8

# 请求量趋势 → 使用 rate
rate(http_requests_total[5m])
```

## 6.3 性能杀手排查

### 1. 未加限制的通配符

```promql
# 危险：扫描所有指标
sum(metric{})

# 正确：限制范围
sum(metric{job="api"}) by (method)
```

### 2. Range Vector 时间窗口过大

Range Vector 需要在内存中保存窗口内的所有样本。窗口越长，内存消耗越大：

```promql
# 需要大量内存
avg_over_time(metric[7d])

# 优化：缩小窗口或使用 Recording Rule
avg_over_time(metric[1h])
```

### 3. Subquery（子查询）

Subquery 在 Grafana 渲染时性能开销极大，因为 Prometheus 需要先执行内层查询，再对外层结果做二次计算：

```promql
# 高开销：嵌套 subquery
avg(rate(metric[5m])[30m:1m])

# 优化：拆分为 Recording Rule
# Step 1: 记录 rate
record: job:metric:rate5m = rate(metric[5m])
# Step 2: 查询即可用
avg_over_time(job:metric:rate5m[30m])
```

### 4. 查询结果基数爆炸

一些聚合操作可能在结果中产生大量序列：

```promql
# 如果 instance 有 1000 个取值，结果有 1000 行
avg by(instance) (metric)

# 优化：先聚合再取 Top N
topk(10, avg by(instance) (metric))
```

## 6.4 Recording Rules

### 为什么需要 Recording Rules？

1. **降低查询耗时**：复杂聚合在 scrape 时就计算好，查询时直接读取结果
2. **降低 Grafana 渲染开销**：Grafana 每个面板都要执行查询，Recording Rule 让查询变成 O(1)
3. **确保一致性**：所有 Dashboard 和告警使用同一份预计算结果

### 命名规范

```
level:metric:operation
```

| 层级 | 示例 |
|------|------|
| `method:` | `method:http_requests:rate5m` — 按 method 聚合 |
| `job:` | `job:http_requests:rate5m` — 按 job 聚合 |
| `instance:` | `instance:cpu:usage` — 按实例拆分 |

### 配置示例

```yaml
groups:
  - name: promql-demo
    rules:
      - record: method:demo_http_requests:rate5m
        expr: sum(rate(demo_http_requests_total[5m])) by (method)

      - record: method:demo_request_duration:p99
        expr: histogram_quantile(0.99,
          sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))
```

## 6.5 PromQL 性能调优 Checklist

- [ ] 避免使用 `sum(metric{})` 扫描全量序列，始终指定 Label 过滤
- [ ] Range Vector 窗口超过 1h 时应考虑 Recording Rule
- [ ] 避免在 Dashboard 中使用 Subquery
- [ ] 复杂聚合（histogram_quantile 等）应该预计算
- [ ] 使用 `topk()` 限制结果集大小
- [ ] 查询语句中对 Label 匹配使用正则 `=~` 比多条件 `or` 更高效率

## 本章小结

- Instant Vector vs Range Vector 是 PromQL 最基础也最重要的概念
- `rate()` 适合平滑趋势，`irate()` 适合突刺检测
- 未加限制的通配符扫描、大窗口 Range Vector、Subquery 是三大性能杀手
- Recording Rule 是生产环境中 PromQL 性能优化的核心手段
- 实践：[PromQL 深度实验](../labs/ch06-promql/README.md)