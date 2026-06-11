# 第1章 监控哲学的重塑：Pull 模型与多维数据模型

## 1.1 Push vs Pull：为什么 Prometheus 选择了"拉"？

### 传统 Push 模型的架构

在 Prometheus 出现之前，Zabbix、Nagios 等传统监控系统普遍采用 Push 模型。在这种架构中，每台被监控的机器上运行一个 Agent，Agent 负责采集系统指标（CPU、内存、磁盘等），然后定期上报（Push）给中央监控服务器。

这种架构在运维界统治了十几年，但其内在缺陷随着集群规模的增长而逐渐暴露。

### Push 模型的三大痛点

| 痛点 | 描述 | 后果 |
|------|------|------|
| 状态管理复杂 | Server 无法区分"目标已宕机"和"指标正常为 0" | 误告警频发，需要额外的心跳机制 |
| 雪崩效应 | 大量 Agent 同时上报导致 Server 过载 | 监控系统自身崩溃，反而成为故障的放大器 |
| 服务发现困难 | 新增目标需修改 Server 配置并重启 | 运维成本高，无法弹性伸缩 |

**状态管理复杂**是 Push 模型最根本的缺陷。当 Server 没有收到某个 Agent 的数据时，原因可能是：(a) Agent 进程崩溃，(b) 网络中断，(c) 指标值确实为 0。Push 模型无法区分这三种情况，必须依赖额外的心跳机制。

**雪崩效应**在实际生产中极为常见。当业务流量高峰时，所有 Agent 同时上报数据，Server 端的压力急剧上升。Server 处理不过来时，请求积压、超时、重试——最终 Server 自身崩溃。这时不仅是"监控失效"的问题，Server 崩溃还可能引发连锁故障。

**服务发现困难**在容器化时代尤为致命。Kubernetes 中的 Pod 随时在创建和销毁，传统的 Push Agent 无法自动感知新目标，每次扩缩容都需要手动更新监控配置。

### Pull 模型的诞生

Google 在 Borg 集群管理系统中设计了 Borgmon，这是史上第一个采用 Pull 模型的监控系统。Pull 模型的理念是：**每个被监控的目标主动暴露一个 HTTP 端点（如 /metrics），监控服务器定期从这个端点"拉取"数据。**

Prometheus 由前 Google 工程师在 SoundCloud 创建，继承了 Borgmon 的 Pull 设计哲学，并将其发扬光大。

### Pull 模型的核心优势

Pull 模型从根本上解决了 Push 的三大痛点：

1. **目标健康自证明**：如果 Prometheus 尝试 scrape 一个目标但连接超时，那么结论很明确——目标宕机了。不需要额外的心跳机制。
2. **流量控制权在 Server 端**：Prometheus 控制 scrape 的节奏（scrape_interval），不会出现所有目标同时涌向 Server 导致过载的情况。
3. **服务发现天然支持**：Prometheus 可以在每个 scrape 周期前重新解析服务发现配置，自动发现新加入的目标。

## 1.2 Pull 模型的三大优势

### 健康自证明

Pull 模型最优雅的设计之一是：**抓取操作的超时本身就是健康检查**。

```bash
# Prometheus scrape 目标：超时 = 宕机
# 当目标无响应时，Prometheus 的 target 状态变为 DOWN
# 目标恢复后，下一个 scrape 周期自动变为 UP
```

这意味着 Prometheus 不需要额外的健康检查组件。每个被监控的目标要么能响应 scrape（存活），要么不能响应（宕机）。没有歧义的空间。

### 服务发现无缝集成

Prometheus 支持多种服务发现方式，从简单到复杂一应俱全：

```yaml
# 1. 静态配置——适用于固定目标
scrape_configs:
  - job_name: 'static-targets'
    static_configs:
      - targets: ['localhost:8080', '10.0.0.1:8080']

# 2. 文件发现——文件变更时自动重载
  - job_name: 'file-sd'
    file_sd_configs:
      - files: ['targets/*.json']

# 3. Kubernetes 服务发现——自动感知 Pod 变化
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
```

服务发现机制的演进路径：`static_configs → file_sd_configs → consul_sd_configs → kubernetes_sd_configs`，随着基础设施的演进，Prometheus 的服务发现方式也越来越自动化。

### 本地调试友好

对于开发者来说，Pull 模型最大的好处是调试极度方便：

```bash
# 开发时直接查看应用的指标输出
curl http://localhost:8080/metrics

# 输出类似：
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# http_requests_total{method="GET"} 1024
# http_requests_total{method="POST"} 512
```

不需要额外的 Agent 配置，不需要重启监控服务器，一条 curl 命令就能看到所有指标。这种"开箱即用"的体验大大降低了开发者的接入成本。

## 1.3 核心数据模型：Metric + Labels

### 时间序列的本质

Prometheus 中每条时间序列由四个部分组成：

```
metric_name{label1="val1", label2="val2"} value timestamp
```

例如：
```
http_requests_total{method="GET", endpoint="/api/users", status="200"} 1024 @2024-01-01T10:00:00Z
```

- **metric_name**：指标名称，如 `http_requests_total`
- **labels**：标签对，用于多维度的数据分类，如 `method="GET"`
- **value**：浮点数数值
- **timestamp**：毫秒级 Unix 时间戳

### 为什么不用关系型数据库？

有人可能会问：在关系型数据库中建一张表，用 WHERE 条件查询，不是也能达到同样的效果吗？

让我们做一个定量分析。假设监控数据有三个维度：

| 维度 | 取值数量 | 取值示例 |
|------|---------|---------|
| method | 4 | GET, POST, PUT, DELETE |
| endpoint | 10 | /api/users, /api/orders, ... |
| status | 5 | 200, 201, 400, 404, 500 |

**关系型数据库方案：**
- 1 张表，每次查询执行 `SELECT * FROM metrics WHERE method='GET' AND endpoint='/api/users'`
- 当数据量达到 1 亿行时，即使有索引查询也需要扫描大量数据
- 增加新维度（如 region）需要 DDL 操作，ALTER TABLE 可能锁表

**Prometheus 方案：**
- 4 × 10 × 5 = 200 条独立的时间序列
- 每条序列按名称 + Label 组合唯一标识
- 通过倒排索引直接定位，查询复杂度 O(1)

**本质区别**：关系型数据库的行数随数据量增长，Prometheus 的序列数只随 Label 组合数增长。只要基数控制得当，无论数据量多大，查询都只需要定位到少数几条序列。

### Cardinality（基数）的概念

Cardinality（基数）指的是一个 Label 可能的取值数量。例如：
- `method` 的基数是 4（GET/POST/PUT/DELETE）—— 低基数
- `user_id` 的基数是 100 万（每个用户一个 ID）—— 高基数

**高基数是 Prometheus 最需要警惕的问题。** 如果一个 Label 有 100 万个取值，再乘以其他 Label 的基数，总时间序列数会呈指数级增长，直接导致内存 OOM。

## 1.4 四种核心指标类型

### Counter（计数器）

Counter 是 Prometheus 中最常用的指标类型，它代表一个**单调递增**的累计值。

**关键规则：只看 Counter 的绝对值没有意义。**

```promql
# 正确用法——计算速率
rate(http_requests_total[5m])        # 每秒请求速率
increase(http_requests_total[1h])    # 1 小时内的增量

# 错误用法——直接看原始值
http_requests_total                   # 只是一个不断增长的数字，没有信息量
```

Counter 的设计哲学是：**它只增不减**。即使应用重启，Counter 的值也应该从上次的数值继续递增（Prometheus 客户端库会处理这个问题）。

常见 Counter 示例：
- `http_requests_total`：HTTP 请求总数
- `cpu_seconds_total`：CPU 累计使用时间
- `mysql_queries_total`：数据库查询总数

### Gauge（仪表盘）

Gauge 代表一个**可增可减**的瞬时值，直接读取当前 snapshot 即可，不需要 rate()。

```promql
# Gauge 的典型用法——直接看原始值
memory_usage_bytes{component="heap"}

# 或者看变化趋势
delta(memory_usage_bytes[5m])         # 5 分钟内的变化量
```

常见 Gauge 示例：
- `memory_usage_bytes`：当前内存使用量
- `cpu_usage_percent`：CPU 使用百分比
- `queue_length`：队列当前长度
- `temperature_celsius`：温度传感器读数

### Histogram（直方图）

Histogram 用于统计**数值的分布情况**，常见场景是请求延迟的统计。

Histogram 会生成三组时间序列：

| 序列 | 含义 |
|------|------|
| `_bucket{le="0.1"}` | 耗时 ≤ 0.1s 的请求累计数 |
| `_sum` | 所有请求的总耗时 |
| `_count` | 总请求数 |

```promql
# 计算 P99 延迟
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# 计算平均延迟
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])
```

**Histogram 的关键优势**：它的分位数计算是在服务端（Prometheus 自身）完成的，这意味着**可以跨多个实例聚合**。这是它与 Summary 最重要的区别。

### Summary（摘要）

Summary 也用于统计数值分布，但**分位数在客户端计算**：

```promql
# Summary 直接暴露预计算的分位数
http_request_duration_seconds{quantile="0.5"}   # 中位数
http_request_duration_seconds{quantile="0.95"}  # P95
http_request_duration_seconds{quantile="0.99"}  # P99
```

**Summary 的关键局限：无法跨实例聚合。**

假设有 3 个应用实例，每个实例的 P99 都是 100ms：
- 直接平均 3 个 P99 → 100ms ❌ （这是错误答案！）
- 正确的做法是将 3 个实例的 _bucket 合并后重新计算分位数
- Summary 不暴露 _bucket，所以无法合并

**使用建议**：
- 大多数场景用 **Histogram**（可聚合，更灵活）
- 只有当你**确定不需要聚合**，且客户端计算分位数对你有特殊意义时用 Summary

## 1.5 理解 PromQL 基础的快速上手

在进入下一章之前，快速了解几个最基础的 PromQL 查询模式：

```promql
# 查询原始指标
http_requests_total

# 带 Label 过滤
http_requests_total{method="GET"}

# 计算速率（Counter 专用）
rate(http_requests_total[5m])

# 聚合求和
sum(rate(http_requests_total[5m])) by (method)

# 直方图分位数
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

## 本章小结

1. **Pull 模型** 从根本上解决了 Push 模型的三大痛点：状态管理、雪崩效应、服务发现
2. **多维数据模型** 是 Prometheus 灵活性的基石，通过 Label 实现多维度查询
3. **Cardinality（基数）** 是需要时刻关注的核心概念——高基数是 Prometheus 的头号杀手
4. **四种指标类型** 各有适用场景：Counter 用于累计值、Gauge 用于瞬时值、Histogram 和 Summary 用于分布统计
5. Histogram 和 Summary 的关键区别在于**是否支持跨实例聚合**

下一步，前往 [Pull vs Push 对比实验](../labs/ch01-pull-model/README.md) 动手验证本章的核心概念。