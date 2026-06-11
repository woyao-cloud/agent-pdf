# 第 1 章：监控哲学的重塑——Push 与 Pull 模型之争

## 1.1 Push vs Pull 的历史演进

### 监控系统的四十年变迁

监控系统的演进是一部从"被动接收"到"主动发现"的哲学史。理解这段历史，才能真正理解 Prometheus 的设计取舍。

```
Nagios (1999) ──→ Zabbix (2001) ──→ Borgmon (2003) ──→ Prometheus (2012)
   Push              Push                Pull                Pull
 Agent 上报      Agent 上报          Server 拉取         Server 拉取
```

- **Nagios 时代**：监控系统以"检查脚本"为核心，Agent 在主机上周期性执行脚本，将结果推送到中央 Server。这是 Push 模型的原型。
- **Zabbix 时代**：引入了更完善的 Agent 架构，支持主动上报（Active Agent）和被动轮询（Passive Agent）两种模式，但本质上仍是 Push 为主。
- **Borgmon 时代**：Google 内部为解决大规模集群监控问题设计了 Borgmon，首次引入了 Pull 模型。Prometheus 的核心设计者 Matt T. Proud 和 Juliusz Chroboczek 正是受 Borgmon 论文启发。
- **Prometheus 时代**：将 Borgmon 的设计理念开源化，Pull 模型成为云原生监控的事实标准。

### 传统 Push 模型的架构特征

Push 模型的核心流程：

```
Agent ──上报──→ Server ──存储──→ 数据库
  │                 │
  │  定时/事件触发    │   接收 → 处理 → 存储
  │                 │
  └── 每个 Agent 独立决定上报时机
```

在 Push 模型中，Agent 主动将指标发送到中央收集器。这个模式看似直观，但在大规模场景下暴露出三个根本性问题。

### Push 的三大痛点

**痛点 1：状态管理复杂**

Push 模式下，Server 收到的数据是 Agent 主动上报的。当 Server 没有收到某个 Agent 的数据时，它无法区分两种情况：

- Agent 挂了，无法上报 → 这是真正的故障
- Agent 正常运行，只是指标值为 0 或没有新数据 → 这是正常状态

这种"沉默 ≠ 死亡"的模糊性导致需要额外的心跳机制来区分两者，增加了系统的复杂性。

**痛点 2：雪崩效应**

想象一个场景：电商平台大促期间，所有应用实例同时启动，在同一时刻向 Push Server 发送指标数据。此时 Server 的请求量是 `N × 并发上报数`，Server 瞬间过载：

```text
正常时段： Server 负载 = 20%
大促开始： Server 负载 = 100% → 队列积压 → 处理延迟 → Agent 重试 → 恶性循环
```

更糟糕的是，当 Server 过载时，它无法通过"降低抓取频率"来控制负载——Agent 根本不受 Server 控制。

**痛点 3：服务发现困难**

新增一个需要监控的应用，需要：

1. 在新应用的机器上安装 Agent
2. 在 Push Server 的配置中添加新 Agent 的地址
3. 重启 Push Server（或触发配置重载）

每次扩容、缩容、迁移都需要手动维护配置，在大规模动态环境中几乎不可行。

### Pull 模型的革命性思路

Pull 模型翻转了 Push 的控制方向：

```
Prometheus ──拉取──→ Target
    │                    │
    │  /metrics 端点      │  暴露当前指标
    │  定时抓取           │  HTTP 响应
    │                    │
    └── Server 完全控制抓取节奏
```

Target（目标应用）只需要暴露一个 `/metrics` HTTP 端点，Prometheus Server 按照配置的时间间隔主动拉取。控制权从 Agent 转移到了 Server。

---

## 1.2 Pull 模型的三大优势

### 优势一：健康自证明

Pull 模型最优雅的设计之一是"健康自证明"：

- **目标响应了 `/metrics`** → 服务正常运行，指标已采集
- **目标不响应 `/metrics`** → 服务宕机，自动标记为 DOWN

不需要额外的心跳机制。Prometheus 的 Target 状态天然就是健康检查：

```text
Target 状态机：
  UP   ← 成功抓取 → 标记为 UP
  UP   ← 抓取失败 → 标记为 DOWN（Prometheus 继续尝试）
  DOWN ← 成功抓取 → 标记为 UP（自动恢复）
```

这在实践中意味着：如果一个应用的内存泄漏导致 OOM，Prometheus 发现目标不响应了，它不需要"等心跳超时"，在下一个 `scrape_interval` 周期就能感知。

### 优势二：服务发现无缝集成

Pull 模型配合服务发现机制，让新增/移除目标完全自动化：

```yaml
# 基于文件的服务发现
scrape_configs:
  - job_name: 'my-app'
    file_sd_configs:
      - files:
          - 'targets/*.json'  # 新目标只需添加 JSON 文件

# 基于 Kubernetes 的服务发现
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod  # 新 Pod 自动加入抓取
```

支持的服务发现方式：
| 方式 | 适用场景 | 动态性 |
|------|---------|--------|
| `static_configs` | 测试环境、固定目标 | 低 |
| `file_sd_configs` | 基于文件管理的环境 | 中 |
| `dns_sd_configs` | DNS SRV 记录 | 中 |
| `consul_sd_configs` | Consul 服务注册 | 高 |
| `kubernetes_sd_configs` | K8s Pod/Service/Node | 最高 |

当新 Pod 在 K8s 中启动时，Prometheus 自动发现并开始抓取，无需人工介入。

### 优势三：开发者本地调试友好

作为开发者，调试 Prometheus 指标采集只需要一个 curl 命令：

```bash
# 启动应用后，直接查看指标
curl localhost:8080/metrics

# 输出示例
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/api/users"} 1024
http_requests_total{method="POST",endpoint="/api/orders"} 512
# HELP jvm_memory_used_bytes JVM memory usage
# TYPE jvm_memory_used_bytes gauge
jvm_memory_used_bytes{area="heap"} 2.147483648e+09
```

这种"开箱即看"的体验降低了调试门槛。而在 Push 模型中，开发者需要确保 Agent 正确安装并连接到 Server 才能验证指标是否正确上报。

---

## 1.3 多维数据模型

### 时间序列的本质

Prometheus 的数据模型是一个**带标签的时间序列集合**。每条时间序列由三部分组成：

```text
{__name__="http_requests_total", method="GET", status="200"}
                                     ↓
                                  1024 @ 2026-06-12T10:00:00Z
                                  1032 @ 2026-06-12T10:00:15Z
                                  1045 @ 2026-06-12T10:00:30Z
```

- `__name__`：指标名称（特殊标签）
- `method="GET"`, `status="200"`：标签（Label），用于维度标记
- `1024 @ timestamp`：值和时间戳对

### 对比关系型数据库

如果使用关系型数据库存储监控数据，表结构可能如下：

```sql
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    metric_name VARCHAR(100),
    method VARCHAR(10),
    status VARCHAR(3),
    value DOUBLE,
    PRIMARY KEY (timestamp, metric_name, method, status)
);

-- 查询 GET 请求的总数
SELECT SUM(value) FROM metrics
WHERE metric_name = 'http_requests_total'
  AND method = 'GET';
```

这种方法在少量维度时可行，但当维度增多时，查询性能急剧下降：

```sql
-- 多维度组合查询 → 笛卡尔积灾难
SELECT * FROM metrics
WHERE metric_name = 'http_requests_total'
  AND (method = 'GET' OR method = 'POST')
  AND (status = '200' OR status = '500')
  AND endpoint IN ('/api/users', '/api/orders');
```

Prometheus 的标签模型天生支持多维查询。标签的交叉组合在查询时通过倒排索引高效匹配，不需要预定义维度组合。

### Cardinality（基数）的核心概念

**基数**是指一个标签的取值数量：

```text
method 标签 → 取值: GET, POST, PUT, DELETE → 基数 = 4
status 标签 → 取值: 200, 201, 400, 500     → 基数 = 4
endpoint 标签 → 取值: /api/users, /api/orders, ... → 基数 = 10

总时间序列数（不考虑 __name__）= 4 × 4 × 10 = 160
```

基数的**乘法效应**是 Prometheus 中最核心的性能概念：

> 总序列数 = 指标数 × 标签1基数 × 标签2基数 × ... × 标签N基数

当某个标签的基数过高时（例如 `user_id` 有 10 万个取值），总序列数会指数级增长，这就是**高基数问题**。

---

## 1.4 四种指标类型

Prometheus 客户端库定义了四种核心指标类型。理解它们的语义差异是正确使用 Prometheus 的基础。

### Counter（计数器）

**特征**：单调递增，只能增加或归零（重启）。

```text
http_requests_total{method="GET"} 100 → 105 → 112 → ...
```

**典型用法**：
- 请求总数：`http_requests_total`
- 错误总数：`errors_total`
- 处理完成数：`jobs_completed_total`

**关键规则**：Counter 的绝对值通常没有意义，必须通过 `rate()` 或 `increase()` 函数计算速率后才可解读：

```promql
# 每秒请求数（QPS）
rate(http_requests_total[1m])

# 过去 1 小时的增量
increase(http_requests_total[1h])
```

**常见误区**：直接用 Counter 的原始值做告警阈值。

```promql
# 错误做法：总请求数超过 1000 告警 → 这个阈值没有时间窗口含义
http_requests_total > 1000

# 正确做法：错误率超过 5% 告警
rate(errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
```

### Gauge（仪表盘）

**特征**：可增可减，反映当前状态的瞬时值。

```text
memory_usage_bytes{component="heap"} 2.1G → 2.3G → 2.0G → ...
```

**典型用法**：
- 内存使用量：`memory_usage_bytes`
- CPU 温度：`cpu_temperature_celsius`
- 并发连接数：`concurrent_connections`
- 队列深度：`queue_depth`

**无需 rate()**：Gauge 的原始值本身就是有意义的：

```promql
# 内存使用率
memory_usage_bytes / memory_total_bytes * 100

# 超过阈值的告警
memory_usage_bytes > 10 * 1024 * 1024 * 1024  # > 10GB
```

### Histogram（直方图）

**特征**：预定义 Bucket 的分桶统计，提供三个指标系列：

```text
# 每个 Bucket 的累积计数
http_request_duration_seconds_bucket{le="0.1"}   100
http_request_duration_seconds_bucket{le="0.5"}   300
http_request_duration_seconds_bucket{le="1.0"}   350
http_request_duration_seconds_bucket{le="+Inf"}  400

# 总和与总数
http_request_duration_seconds_sum    120.5
http_request_duration_seconds_count  400
```

**核心用途**：

1. **计算分位数**：通过 `histogram_quantile()` 函数计算：

```promql
# P99 延迟
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# 按 method 拆分的 P95
histogram_quantile(0.95, 
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, method))
```

2. **计算平均值**：

```promql
# 平均响应时间
rate(http_request_duration_seconds_sum[5m]) 
  / 
rate(http_request_duration_seconds_count[5m])
```

**Bucket 设计原则**：Bucket 边界应覆盖业务预期的延迟范围，在关键区域（如 SLO 边界）加密：

```text
差的 Bucket 设计：  [0.1, 1.0, 10.0]     → P99 精度极差
好的 Bucket 设计：  [0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0]
```

### Summary（摘要）

**特征**：在客户端计算分位数，直接暴露预计算的分位数值：

```text
http_request_duration_seconds{quantile="0.5"}   0.05
http_request_duration_seconds{quantile="0.95"}  0.35
http_request_duration_seconds{quantile="0.99"}  0.85
http_request_duration_seconds_sum               120.5
http_request_duration_seconds_count             400
```

**与 Histogram 的关键区别**：

| 特性 | Histogram | Summary |
|------|-----------|---------|
| 分位数计算位置 | Server 端（PromQL） | Client 端 |
| 可跨实例聚合 | ✅ 可以 | ❌ 不可以 |
| 可自定义分位数 | ✅ PromQL 中任意指定 | ❌ 客户端预定义 |
| 对 CPU 影响 | 低 | 中（客户端计算分位数） |
| 存储开销 | 较高（多个 Bucket） | 较低 |

**何时用 Summary**：当需要精确的分位数且不需要跨实例聚合时。典型场景是单个实例的延迟监控。

**何时用 Histogram**：当需要跨实例聚合分位数，或需要灵活调整分位数时。这是 Prometheus 官方推荐的方式。

---

## 1.5 本章小结

1. **Pull 模型**通过将控制权从 Agent 转移到 Server，解决了 Push 模型的三大痛点：状态模糊、雪崩效应、服务发现困难
2. **多维数据模型**基于标签实现灵活的维度标记，但需要警惕基数的乘法效应
3. **四种指标类型**各有适用场景：Counter 用 rate()、Gauge 看绝对值、Histogram 做聚合分位数、Summary 做精确单机分位数
4. Pull 模型的"健康自证明"特性是 Prometheus 最优雅的设计之一——不需要额外的心跳机制

---

## 参考

- [第 1 章实验：Pull 模型对比](../labs/ch01-pull-model/README.md)
- [Prometheus 官方文档 - Metric Types](https://prometheus.io/docs/concepts/metric_types/)
- [Prometheus 官方文档 - Data Model](https://prometheus.io/docs/concepts/data_model/)
- [Google Borgmon 论文](https://research.google/pubs/pub43409/)
