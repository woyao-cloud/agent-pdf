# 第13章 工程化规范：让监控成为可维护的系统

---

## 场景故事：命名混乱之殇

某创业公司的监控系统经历了三个工程师的维护：

- **第一位工程师**（2022 年）：用 Python 写了一些脚本，指标命名风格是 `get_requests`
- **第二位工程师**（2023 年）：从 Java 背景来，习惯用 `getRequests`
- **第三位工程师**（2024 年）：前端出身，指标名用 `get-requests`

于是，Prometheus 中出现了这样的景象：

```
# 同一个业务含义，三种不同的命名！
get_requests_total{service="auth"} 1000
getRequests_total{service="auth"} 500
get-requests_total{service="auth"} 200
```

当新来的 SRE 小李想要写一个"统计所有认证服务请求量"的告警规则时，他崩溃了——**他不得不 sum 三个不同的指标**，而且每次新增服务都要问"该用哪种命名风格"。

更糟糕的是：
- 有人把单位写在名字里（`request_duration_ms`），有人写在标签里（`request_duration_seconds{unit="ms"}`）
- 有人用 `service` 标签，有人用 `app`，有人用 `application`
- 有人用 `http_status`，有人用 `status_code`，有人用 `code`

**监控系统从"帮助工具"变成了"混乱之源"。**

### 原理比喻：公司文件命名规范

想象一下你在一家没有文件命名规范的公司工作：

```
项目方案-v1-final-真的最终版.pptx
项目方案-v2-最终版-改.pptx
项目方案-2023-最终版.pptx
项目方案-真的不改了.pptx
```

找文件时你会疯掉。这和没有监控命名规范是一个道理——**短期内每个人都很自由，长期来看整个系统无法维护**。

这就是本章要解决的问题：**建立工程化规范，让监控系统可维护、可扩展、可理解**。

---

## 13.1 指标命名规范

### Prometheus 官方规范

```
namespace_subsystem_unit_suffix
  ────────  ────────  ────  ─────
    │          │       │      └── 类型后缀（_total, _count, _sum, _bucket）
    │          │       └── 单位（_seconds, _bytes, _ratio）
    │          └── 子系统（http, db, cache, queue）
    └── 命名空间（prometheus, node, mysql, app）
```

### 代码旁白：命名规范的逐行解释

```yaml
# 指标命名规范示例

# 正确命名
# ──────────
# 格式：app_http_requests_total
# 解释：app=命名空间，http=子系统，requests=指标名，_total=Counter 后缀
app_http_requests_total{method="GET", path="/api/users", status="200"} 1024

# 格式：app_db_query_duration_seconds
# 解释：_seconds 表示单位是秒
app_db_query_duration_seconds{db="users", query="select_by_id"} 0.025

# 格式：app_cache_hit_ratio
# 解释：_ratio 表示这是一个比率（0-1）
app_cache_hit_ratio{cache="user_session"} 0.95

# 格式：app_queue_size_bytes
# 解释：_bytes 表示单位是字节
app_queue_size_bytes{queue="order_processing"} 20480

# 错误命名
# ──────────
# 错误 1：命名空间缺失
http_requests_total{...}                     # 谁的 http？
# 错误 2：单位不一致
request_duration_ms{...}                     # 有人用 ms，有人用 seconds
request_duration_seconds{...}
# 错误 3：类型后缀错误
app_http_request_count{...}                  # Counter 应该用 _total
app_http_errors{...}                         # 缺少 _total
# 错误 4：命名风格混乱
app.http.requests.total{...}                 # 使用了点号
appHttpRequestsTotal{...}                    # 使用了驼峰
```

### 标签命名规范

```yaml
# 标签命名规范

# 正确标签
# ──────────
method: "GET"              # 小写 + 下划线
status: "200"              # 小写 + 下划线
service: "auth"            # 小写 + 下划线
db_name: "users"           # 小写 + 下划线

# 错误标签
# ──────────
Method: "GET"              # 大写开头（大小写敏感）
statusCode: "200"          # 驼峰命名
service-name: "auth"       # 连字符
DB Name: "users"           # 包含空格
```

---

## 13.2 指标类型选择规范

### 代码旁白：类型选择指南

```yaml
# 指标类型选择规范

# Counter：只增不减的累积值
# 适用场景：请求总数、错误总数、任务完成数
# 为什么：Counter 的值永远不会减少，适合"统计发生了多少次"
app_http_requests_total        # 正确：请求总数只增不减
app_errors_total               # 正确：错误总数只增不减
app_active_users               # 错误：活跃用户数会减少，应该用 Gauge

# Gauge：可增可减的当前值
# 适用场景：内存使用量、并发连接数、队列大小、温度
# 为什么：Gauge 的值可以上升也可以下降，适合"当前状态"
app_memory_usage_bytes         # 正确：内存使用量可增可减
app_concurrent_requests        # 正确：并发连接数可增可减
app_total_requests             # 错误：总请求数只增不减，应该用 Counter

# Histogram：对观测值进行分桶统计
# 适用场景：请求延迟、响应大小
# 为什么：Histogram 可以计算 P50/P90/P99 分位数
app_request_duration_seconds   # 正确：需要计算 P99 延迟
app_request_size_bytes         # 正确：需要分析请求体大小分布
app_response_status            # 错误：状态码是枚举值，应该用 GaugeVec 或 Info

# Summary：预计算的分位数
# 适用场景：已知分位数需求、无法汇总的指标
# 为什么：Summary 在客户端计算分位数，无法从多个实例汇总
app_request_latency_seconds    # 正确：需要精确的 P99（但不能汇总）
app_queue_size                 # 错误：不需要分位数，应该用 Gauge
```

### Before/After：类型选择对比

**场景：监控数据库连接池**

| 维度 | Before（错误） | After（正确） | 原因 |
|------|---------------|--------------|------|
| 连接总数 | Counter | **Gauge** | 连接数可增可减 |
| 获取连接次数 | Gauge | **Counter** | 累积事件，只增不减 |
| 等待时间 | Gauge | **Histogram** | 需要分析 P50/P99 |
| 活跃连接数 | Histogram | **Gauge** | 当前状态值 |

---

## 13.3 告警规则规范

### 代码旁白：告警规则 YAML 逐行解释

```yaml
# alerting-rules.yml
# 告警规则规范
# 每一条规则都应该能回答 5W1H：
# - What（什么问题）
# - Who（谁负责）
# - Where（哪个系统）
# - When（何时触发）
# - Why（为什么）
# - How（如何解决）

groups:
  - name: application_alerts
    # 为什么这样写：按团队或子系统分组
    # 便于管理，不同团队负责不同告警组
    
    rules:
      # ──────────────────────────────────────────────
      # 规则 1：高错误率告警
      # ──────────────────────────────────────────────
      - alert: HighErrorRate
        # 为什么这样写：使用 PromQL 计算 5 分钟内的错误率
        # rate() 函数计算每秒增长率，然后除以总请求率
        expr: |
          rate(app_http_requests_total{status=~"5.."}[5m])
          /
          rate(app_http_requests_total[5m])
          > 0.05
        # 解释：错误率 > 5% 触发告警
        # 选择 5% 作为阈值的原因：
        # - 对于核心交易系统，SLA 要求 99.9% 可用性 = 错误率 < 0.1%
        # - 对于一般 Web 服务，5% 错误率已经是严重问题
        # - 建议根据业务 SLA 调整
        
        for: 5m
        # 解释：持续 5 分钟才触发，避免偶发抖动误告警
        # 为什么是 5 分钟：大多数网络抖动在 1-2 分钟内恢复
        
        labels:
          severity: critical
          # 解释：严重级别用于告警路由
          # critical -> 立即电话通知值班人员
          # warning -> 工作时间处理
          # info -> 可忽略
          team: "backend"
          # 解释：负责人团队，便于告警自动分配给正确的 On-Call 人员
        
        annotations:
          summary: "{{ $labels.service }} 服务错误率超过 5%"
          # 解释：告警摘要，显示在告警通知的第一行
          # 使用模板变量动态填充服务名
          
          description: |
            服务 {{ $labels.service }} 在 {{ $labels.instance }} 实例上的
            HTTP 5xx 错误率达到了 {{ printf "%.2f" $value }}%，
            已持续 5 分钟。
          # 解释：详细描述，包含实例信息、具体数值
          # 让值班人员不看 Grafana 也能了解基本情况
          
          runbook_url: "https://wiki.company.com/runbooks/high-error-rate"
          # 解释：故障处理手册链接
          # 值班人员点击即可查看标准处理流程
          # 包括：排查步骤、回滚方案、相关联系人
          
          dashboard: "https://grafana.company.com/d/app-overview"
          # 解释：相关 Grafana 面板链接
          # 方便值班人员快速查看上下文

      # ──────────────────────────────────────────────
      # 规则 2：P99 延迟告警
      # ──────────────────────────────────────────────
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99,
            rate(app_request_duration_seconds_bucket[5m])
          ) > 2.0
        # 解释：P99 延迟超过 2 秒
        # histogram_quantile(0.99, ...) 计算 P99 分位数
        # 为什么关注 P99：P99 代表最慢的 1% 请求
        # 用户体验的"长尾"问题往往在 P99 中暴露
        
        for: 10m
        # 解释：延迟告警需要持续更长时间
        # 因为延迟偶尔突刺可能是 GC 或网络抖动
        
        labels:
          severity: warning
          team: "backend"
        
        annotations:
          summary: "{{ $labels.service }} P99 延迟超过 2 秒"
          description: |
            {{ $labels.service }} 的 P99 延迟达到 {{ printf "%.2f" $value }}秒，
            超过阈值 2 秒。
            当前 P50={{ $labels.p50 }}，P90={{ $labels.p90 }}
          # 解释：同时提供 P50 和 P90 作为上下文
          # 帮助判断是整体变慢还是只有长尾变慢

      # ──────────────────────────────────────────────
      # 规则 3：实例宕机告警
      # ──────────────────────────────────────────────
      - alert: InstanceDown
        expr: up{job="app-backend"} == 0
        # 解释：up 指标是 Prometheus 自动生成的
        # up == 0 表示 scrape 失败，实例可能宕机
        
        for: 1m
        # 解释：宕机告警要快速响应
        # 1 分钟确认时间，避免短暂重启造成误告
        
        labels:
          severity: critical
          team: "infra"
        
        annotations:
          summary: "实例 {{ $labels.instance }} 宕机"
          description: |
            {{ $labels.job }} 任务的实例 {{ $labels.instance }} 
            已经宕机超过 1 分钟。
            请立即检查服务状态。
          runbook_url: "https://wiki.company.com/runbooks/instance-down"
```

### 告警规则编写原则

| 原则 | 说明 | 错误示例 | 正确示例 |
|------|------|---------|---------|
| **可操作性** | 收到告警后能采取行动 | `cpu_usage > 0`（永远触发） | `cpu_usage > 0.9 for 10m` |
| **避免抖动** | 使用 for 语句确认持续时长 | `error_rate > 0.05` | `error_rate > 0.05 for 5m` |
| **有文档** | 提供 runbook 链接 | 无 annotations | `runbook_url: "..."` |
| **有上下文** | 告警信息包含关键数据 | "错误率过高" | "错误率 15.3%，持续 5 分钟" |
| **分级明确** | 按严重程度分级 | 全部 critical | critical / warning / info |

---

## 13.4 真实案例：RED 方法论落地

### 从 200 个指标到 9 个关键指标

某公司在推行 RED 方法论前，每个微服务暴露了 30-50 个指标。一个 5 个服务的系统就有 200+ 个指标。问题是：

1. **没人知道哪些指标真正重要**
2. **告警规则写了 100 多条，每天都在响**
3. **值班人员告警疲劳，开始忽略告警**

### RED 方法论

RED 是 Google SRE 提出的监控方法论，每个服务只需要关注三个维度：

```
R - Rate（速率）：每秒请求数
E - Errors（错误）：失败的请求数
D - Duration（持续时间）：请求耗时
```

对于每个维度，再细分：

```yaml
# 每个服务只需要 3 个核心指标
# ────────────────────────────────

# R - Rate：每秒请求数
app_http_requests_total{service="auth"}      # Counter -> rate() 计算 QPS

# E - Errors：错误数
app_http_requests_total{service="auth", status=~"5.."}  # Counter -> 错误率

# D - Duration：请求耗时
app_request_duration_seconds{service="auth"}  # Histogram -> P50/P90/P99
```

### 落地效果

| 指标 | 方法论前 | 方法论后 |
|------|---------|---------|
| 每个服务的指标数 | 30-50 | **3** |
| 总指标数 | 200+ | **9**（5 个服务 x 3 - 部分共享） |
| 告警规则数 | 100+ | **15** |
| 误告警率 | 80% | **5%** |
| MTTR（平均修复时间） | 60 分钟 | **15 分钟** |
| 新成员上手时间 | 2 周 | **2 天** |

### Before/After：告警规则

**Before**：100 条告警规则，互相重叠，值班人员每天收到 50+ 告警

```yaml
# Before：混乱的告警规则
- alert: CPULoadHigh
  expr: cpu_load > 0.7
- alert: CPULoadCritical
  expr: cpu_load > 0.9
- alert: MemoryUsage
  expr: memory_usage > 0.8
- alert: DiskUsage
  expr: disk_usage > 0.85
- alert: ErrorCount
  expr: error_count > 100
# ... 还有 95 条类似的规则
```

**After**：15 条规则，每个服务 3 条核心规则

```yaml
# After：基于 RED 的告警规则
# 每个服务只需要 3 条核心告警规则
# 再加上基础设施层的通用规则

groups:
  - name: service_auth
    rules:
      - alert: AuthHighErrorRate
        expr: rate(app_http_requests_total{service="auth", status=~"5.."}[5m]) 
             / rate(app_http_requests_total{service="auth"}[5m]) > 0.05
        for: 5m
        
      - alert: AuthHighLatency
        expr: histogram_quantile(0.99, 
             rate(app_request_duration_seconds_bucket{service="auth"}[5m])) > 2.0
        for: 10m
        
      - alert: AuthZeroTraffic
        expr: rate(app_http_requests_total{service="auth"}[5m]) == 0
        for: 5m
```

---

## 13.5 完整的工程化规范清单

### 13.5.1 指标命名规范

```yaml
# 必须遵守的规范

# 1. 命名格式
# ──────────
# 正确：app_http_requests_total
# 错误：app.http.requests.total, appHttpRequestsTotal
pattern: "^[a-z]+(_[a-z]+)*$"

# 2. 标签命名
# ──────────
# 正确：method, status_code, db_name
# 错误：Method, statusCode, DB Name
pattern: "^[a-z][a-z0-9_]*$"

# 3. 标签值
# ──────────
# 正确：enum 值用小写（get, post, put）
# 正确：UUID/TraceID 用原始值
# 错误：避免高基数标签（user_id, email, ip）
cardinality_limit: 100  # 每个标签值数量不超过 100

# 4. 单位后缀
# ──────────
# 时间：_seconds（统一用秒，不要用 ms）
# 字节：_bytes
# 比率：_ratio（0-1 之间）
# 百分比：_percent（0-100 之间）
```

### 13.5.2 采集配置规范

```yaml
# scrape-config.yml
# Prometheus 采集配置规范

global:
  scrape_interval: 15s      # 默认采集间隔
  evaluation_interval: 15s  # 默认规则评估间隔
  scrape_timeout: 10s       # 默认采集超时

scrape_configs:
  # 每个 job 代表一个逻辑服务或组件
  - job_name: 'app-backend'
    # 为什么这样写：使用服务发现而非静态配置
    # 静态配置在微服务环境下无法扩展
    consul_sd_configs:
      - server: 'consul:8500'
        tags: ['backend']
    
    # 采集间隔：根据服务重要性调整
    scrape_interval: 10s     # 核心服务，更频繁采集
    scrape_timeout: 5s       # 超时控制，避免挂起
    
    # 指标 relabel：统一标签规范
    metric_relabel_configs:
      # 删除不符合规范的指标
      - source_labels: [__name__]
        regex: '^[a-z]+(_[a-z]+)*$'
        action: keep
```

### 13.5.3 仪表盘规范

```yaml
# Grafana 仪表盘规范

# 1. 命名
# ──────────
# 格式：[团队] 服务名 - 面板类型
# 示例：[Backend] Auth Service - Overview
# 示例：[Infra] Kubernetes - Cluster Overview

# 2. 布局
# ──────────
# 第一行：RED 核心指标（Rate, Errors, Duration）
# 第二行：资源指标（CPU, Memory, Disk）
# 第三行：依赖指标（DB, Cache, Queue）

# 3. 颜色
# ──────────
# 绿色：正常（0-70%）
# 黄色：警告（70-90%）
# 红色：危险（90-100%）
```

---

## 13.6 规范落地的步骤

### 第一步：制定规范文档

```markdown
# 团队监控规范 v1.0

## 指标命名
- 格式：app_{subsystem}_{metric_name}_{unit}
- 标签：全部小写 + 下划线
- 避免：驼峰、连字符、点号

## 指标类型
- 累积值用 Counter（后缀 _total）
- 当前值用 Gauge
- 延迟用 Histogram（后缀 _seconds）
- 预计算分位数用 Summary

## 标签设计
- 必选标签：service, instance
- 可选标签：method, status, db_name
- 禁止标签：user_id, email, ip（高基数）
```

### 第二步：CI 检查

```yaml
# .github/workflows/metric-lint.yml
# 在 CI 中自动检查指标命名规范

name: Metric Lint
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check metric naming
        run: |
          # 检查 Go 代码中的指标命名
          grep -r 'prometheus\.New' --include='*.go' | \
            grep -E 'Name:\s+"[^"]*"' | \
            while read line; do
              name=$(echo $line | grep -oP 'Name:\s+"\K[^"]+')
              if [[ ! $name =~ ^[a-z]+(_[a-z]+)*$ ]]; then
                echo "ERROR: Invalid metric name: $name"
                exit 1
              fi
            done
```

### 第三步：定期审查

```bash
# 每月审查一次指标使用情况
# 找出不再使用的指标
# 找出基数过高的标签

# 查询 Prometheus 中的指标数量
curl -s 'http://prometheus:9090/api/v1/label/__name__/values' | \
  jq '.data | length'
# > 期望值：根据服务数量，应该在 50-100 之间

# 找出基数最高的标签
curl -s 'http://prometheus:9090/api/v1/status/tsdb' | \
  jq '.data.labelValuesCountByLabelName'
# > 检查是否有异常高基数的标签
```

---

## 本章小结

| 规范领域 | 核心原则 | 落地方法 |
|---------|---------|---------|
| **指标命名** | `命名空间_子系统_指标名_单位` | CI 自动检查 |
| **标签设计** | 小写 + 下划线，控制基数 | 定期审查 |
| **指标类型** | Counter/Gauge/Histogram/Summary 选型指南 | Code Review |
| **告警规则** | 5W1H、可操作、避免抖动 | Runbook 配套 |
| **仪表盘** | RED 方法论，三层布局 | 模板标准化 |
| **RED 方法论** | Rate/Errors/Duration，从 200 到 9 | 核心指标提炼 |

---

## 扩展阅读

- [Prometheus Metric Naming Best Practices](https://prometheus.io/docs/practices/naming/)
- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [RED Method by Tom Wilkie](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/)
- [Prometheus Alerting Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
