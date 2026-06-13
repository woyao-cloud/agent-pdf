# 第4章 日志系统集成（Loki）

## 4.1 场景故事：从"日志太多查不到"到"LogQL 秒级定位"

凌晨 2:17，某电商公司的值班 SRE 小王的手机疯狂震动——PagerDuty 告警："订单服务错误率飙升 500%！"

小王睡眼惺忪地爬起来，打开 Loki，想看看订单服务的日志。

"等等，我该搜什么？"

他先试了 `grep -r "ERROR" /var/log/order/*.log`——返回了 10 万行，根本看不完。

他又试了 `{job="order-service"} |= "error"`——还是太多。

最后他想起可以按链路追踪 ID 来查：
```
{job="order-service"} |= "traceID=abc123"
```

3 条日志，瞬间定位到问题：数据库连接池耗尽。

**这就是 Loki 的威力**——不是帮你看所有日志，而是帮你**在海量日志中精确命中你要的那几行**。

---

## 4.2 核心原理：Label 索引 vs 内容索引

### 比喻：Loki 是图书馆，Elasticsearch 是搜索引擎

| 概念 | Loki | 类比 |
|------|------|------|
| **Label（标签）** | 只索引这几个字段 | 图书分类号（文学类 I247.5、计算机类 TP3） |
| **日志内容** | 不索引，只存储原始文本 | 书的全部内容 |
| **搜索方式** | 先按分类号找到书架，再逐本翻看内容 | 先精确筛选分类，再在少量书里全文搜索 |
| **类比总结** | **图书分类法**：先缩小范围，再逐行扫描 | **搜索引擎**：全文建索引，任何词都能秒查 |

**为什么 Loki 这么做？**

假设你的日志中有这个字段：`traceID: 8a3f7b2c-1d4e-5f6a-9b8c-0d1e2f3a4b5c`

- **Elasticsearch 的做法**：为每个 traceID 建倒排索引 → 索引大小是日志内容的 2-3 倍 → 存储成本翻倍
- **Loki 的做法**：traceID 只存在日志内容里，不建索引 → 搜索时需要逐行扫描 → 但存储成本只有 Elasticsearch 的 1/3

**Loki 的哲学**：用计算换存储。你不经常搜 traceID，所以没必要为它建索引。

---

## 4.3 LogQL 语法详解（带旁白）

### 日志流选择器：先找到"书架"

```logql
# ============================================================
# LogQL 查询示例 —— 逐句讲解
# ============================================================

# 最简单的查询：选择 job=api 的所有日志
# 这就像去图书馆说"我要计算机类（TP3）的所有书"
# 结果可能还是很多，但至少比全馆搜索好
{job="api"}

# 多条件筛选：job=api AND env=production
# 这就像"计算机类 AND 中文书"——更精确了
{job="api", env="production"}

# 正则匹配：job 以 "api-" 开头的所有服务
# 适合有多个 API 服务的场景（api-v1、api-v2、api-auth）
{job=~"api-.*"}

# 配合模板变量：$namespace 由用户在 Dashboard 下拉框选择
# 一个 Dashboard 可以通用开发、测试、生产环境
{job="api", namespace=~"$namespace"}
```

### 日志管道表达式：在找到的"书"里翻内容

```logql
# ============================================================
# 管道表达式 —— 从找到的日志中进一步筛选
# ============================================================

# │= "error" —— 行内包含 "error"（区分大小写）
# 注意：这是最快的过滤方式，因为 Loki 做了优化
# 但搜 "error" 也会匹配到 "no_error"——考虑清楚
{job="api"} |= "error"

# 排除：不包含 "timeout" 的行
# 场景：想看所有错误，但排除已知的 timeout 问题
{job="api"} |= "error" != "timeout"

# 正则匹配：更精确的模式
# 比如只匹配 status code 500-599
{job="api"} |~ "status=[5][0-9][0-9]"

# 正则排除：排除健康检查日志
# 健康检查通常是 GET /health，不是真正的业务请求
{job="api"} !~ "GET /health"
```

### 解析器：把非结构化的日志变成结构化数据

```logql
# ============================================================
# 解析器 —— 从日志行中提取字段
# ============================================================

# JSON 解析：当日志是 JSON 格式时
# 原始日志：{"level":"error","message":"timeout","duration":2500}
# 解析后可以引用 level、message、duration 字段
{job="api"} | json

# logfmt 解析：当日志是 key=value 格式时
# 原始日志：level=error msg="timeout" duration=2500
{job="api"} | logfmt

# 正则解析：自定义提取规则
# 从 "2024-01-01 10:00:00 ERROR GET /api/orders 500" 中提取
{job="api"} | regexp "(?P<method>\\S+) (?P<path>\\S+) (?P<status>\\d+)"

# ⚠️ 性能提示：json 和 logfmt 比 regexp 快 10 倍以上
# 优先使用 json/logfmt，不得已再用 regexp
```

### 过滤条件前置：性能优化的关键

```logql
# ❌ 不推荐：先解析全部日志，再过滤
# 这意味着 Loki 要对所有日志做 JSON 解析，再丢弃大部分
{job="api"} | json | level="error" | message="timeout"

# ✅ 推荐：先缩小范围，再解析
# 先过滤包含 error 的行（Loki 做了优化），再解析
{job="api"} |= "error" | json | message="timeout"

# ✅ 更推荐：再加一个条件缩小范围
# 先用字符串过滤减少到 1%，再解析剩下的
{job="api"} |= "error" |= "timeout" | json
```

**为什么？** 字符串包含（`|= "error"`）是 Loki 最擅长的操作——它只需要扫描原始字节。而 `| json` 需要解析每一行。先过滤掉 99% 的行，只解析剩下的 1%，性能提升非常明显。

---

## 4.4 实战：Loki 数据源配置（手把手）

### 步骤 1：安装 Loki + Promtail

```yaml
# ============================================================
# Docker Compose 中的 Loki 和 Promtail 配置
# ============================================================
version: '3.8'
services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
  
  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - /var/log:/var/log          # 挂载宿主机日志目录
      - ./promtail-config.yaml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
```

### 步骤 2：在 Grafana UI 中配置 Loki 数据源

1. 打开浏览器，访问 Grafana（http://localhost:3000）
2. 左侧菜单 → **Configuration（齿轮图标）** → **Data Sources**
3. 点击 **Add data source**
4. 搜索 "Loki"，点击 **Loki**
5. 在 **URL** 字段输入：`http://loki:3100`
6. 点击页面底部的 **Save & Test**

**预期结果**：
- ✅ `Data source connected and labels found.` —— 连接成功
- ❌ `Error: 404 page not found` —— 地址不对
- ❌ `Error: connection refused` —— Loki 没启动

### 步骤 3：配置 Derived Fields（手把手，每步截图级说明）

Derived Fields 是 Grafana 中连接 Metrics、Logs、Traces 的核心机制。它从日志行中提取 TraceID，然后自动生成跳转到 Tempo 的链接。

**在 UI 中配置：**

1. 在 Loki 数据源配置页面，向下滚动到 **Derived Fields** 部分
2. 点击 **+ Add**
3. 填写以下字段：

```
Name: TraceID
     ↑ 这个名称会显示在日志行旁边的按钮上
     建议用简短的名字，例如 "Trace" 或 "Tempo"

Type: Field (or "Extract regexp")
     ↑ "Field" 表示从已经 |json 解析的字段中提取
     "Extract regexp" 表示从原始日志行中用正则提取

Regex: trace_id":"(\w+)"   (JSON 格式)
   或者 traceID=(\w+)        (logfmt 格式)
     ↑ 正则表达式的捕获组 (\w+) 就是要提取的 TraceID
     注意：双引号需要转义

Data source: Tempo (下拉选择)
     ↑ 点击后跳转到哪个数据源
     需要提前配置好 Tempo 数据源

URL: $${__value.raw}
     ↑ 跳转 URL，${__value.raw} 就是刚才提取的 TraceID
     $ 符号要写两次（$$）是因为 YAML 转义
```

4. 点击 **Save & Test**

**YAML 配置方式（Provisioning）：**

```yaml
# provisioning/datasources/loki.yml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    
    jsonData:
      timeout: 60
      maxLines: 1000
      
      # Derived Fields：从日志中提取 TraceID → 跳转到 Tempo
      derivedFields:
        - name: TraceID
          # ↑ 显示名称，会出现在日志行的操作按钮上
          type: field
          # ↑ 提取方式：field = 从解析后的 JSON 字段中提取
          #   regex = 从原始日志行中用正则提取
          
          datasourceUid: tempo
          # ↑ 目标数据源的 UID，必须是已经配置好的 Tempo
          #   如何获取 UID？在 Tempo 数据源配置页面的 URL 中可以看到
          
          matcherRegex: "trace_id\":\"(\\w+)\""
          # ↑ 正则表达式，捕获组 (\w+) 就是要提取的值
          #   注意 YAML 中反斜杠需要转义
          #   实际正则：trace_id":"(\w+)"（匹配 JSON 格式）
          
          url: "$${__value.raw}"
          # ↑ 跳转 URL 模板
          #   $${__value.raw} 会被替换为实际提取的值
          #   $$ 是因为 YAML 中 $ 需要转义
```

### 步骤 4：验证 Derived Fields 是否生效

1. 进入 Grafana 左侧菜单的 **Explore**（指南针图标）
2. 在数据源下拉框中选择 **Loki**
3. 输入查询：`{job="api"} |= "trace_id" | json`
4. 点击 **Run query**
5. 在日志行中，如果看到 trace_id 字段旁边有一个蓝色链接图标，点击它 → 应该跳转到 Tempo 查看 Trace

---

## 4.5 将日志转换为指标

Loki 的一个杀手级功能：日志可以当指标用。

```logql
# ============================================================
# Metrics from Logs —— 把日志变成时间序列
# ============================================================

# 统计每分钟的错误日志数
# 场景：当应用没有暴露 error_count 指标时
sum by (level) (
  rate(
    {job="api"} | json [1m]
  )
)
# 这相当于 Prometheus 的 rate() 函数
# 但数据来自日志，而不是指标

# HTTP 请求耗时 P99（从日志中提取 duration 字段）
# 场景：没有 Histogram 指标，但日志里有请求耗时
quantile_over_time(0.99,
  {job="api"} | json | unwrap duration [5m]
)
# unwrap 从日志中提取数值字段 duration
# quantile_over_time 计算这 5 分钟内所有 duration 的 P99

# 按状态码统计请求分布
# 场景：快速了解当前各状态码占比
sum by (status) (
  rate(
    {job="api"} | json [1m]
  )
)
```

**什么时候该用 Metrics from Logs？**
- 应用没有暴露某个指标，但日志里有
- 需要临时排查问题，不想加代码重新部署
- 验证新指标是否准确（对比日志指标和 Prometheus 指标）

**什么时候不该用？**
- 长期稳定的监控指标（直接用 Prometheus，性能更好）
- 高 QPS 服务的全量日志（计算成本太高）

---

## 4.6 真实案例：trace_id 设为 Label 导致索引爆炸

### 事故经过

某创业公司的 SRE 小张在配置 Promtail 时，将 `trace_id` 设为了 Loki Label：

```yaml
# ❌ 错误配置：将高基数字段设为 Label
scrape_configs:
  - job_name: api-logs
    pipeline_stages:
      - json:
          expressions:
            trace_id: trace_id
      - labels:
          trace_id:      # ❌ trace_id 是高基数！每个请求都不同！
```

**后果：**

| 指标 | 数值 |
|------|------|
| 日请求量 | 1000 万 |
| 每天新增 Label 数量 | 1000 万（每个请求一个 trace_id） |
| Loki 索引膨胀速度 | 每小时 50 GB |
| 查询响应时间 | 从 200ms 飙升到 30s+ |
| 最终结果 | Loki OOM，服务完全不可用 |

### 正确做法

```yaml
# ✅ 正确配置：trace_id 放在日志内容中，不作为 Label
scrape_configs:
  - job_name: api-logs
    pipeline_stages:
      - json:
          expressions:
            trace_id: trace_id
            # ↑ 只在日志内容中保留 trace_id
            # 查询时用 {job="api"} | json | trace_id="abc123"
            # 而不是用 label 过滤
      
      # 只将低基数字段设为 Label
      - labels:
          level:          # ✅ 只有几种值：debug/info/warn/error
          # ↑ level 的基数 ≈ 4，设为 Label 完全没问题
```

**黄金法则**：如果一个字段的可能取值超过 100 种，就不要设为 Loki Label。

| 适合做 Label | 不适合做 Label |
|-------------|---------------|
| `job`（api/db/cache）| `trace_id`（每个请求不同）|
| `env`（dev/staging/prod）| `user_id`（每个用户不同）|
| `level`（debug/info/warn/error）| `request_id`（每个请求不同）|
| `service`（order/user/payment）| `ip_address`（每个客户端不同）|

---

## 4.7 日志面板与指标面板联动

### 配置方法（手把手）

1. **创建 Dashboard**
   - 左侧菜单 → **+** → **Dashboard**
   - 点击 **Add visualization**
   - 选择数据源 **Prometheus**
   - 输入查询：`rate(http_requests_total{status=~"5.."}[5m])`
   - 保存为 "错误率趋势"

2. **添加日志面板**
   - 点击 Dashboard 顶部的 **Add** → **Visualization**
   - 选择数据源 **Loki**
   - 输入查询：`{job="api"} |= "error" | json`
   - 保存为 "错误日志"

3. **启用联动**
   - 点击 Dashboard 右上角的 **Dashboard settings（齿轮图标）**
   - 选择 **General**
   - 找到 **Crosshair** 选项，选择 **Crosshair** 或 **Crosshair + Tooltip**
   - 保存

**最终效果**：

```
┌──────────────────────────────────────────────────┐
│  错误率趋势（Time Series）                          │
│                                                   │
│  ╱╲    ╱╲                                         │
│ ╱  ╲  ╱  ╲    ← 鼠标悬停在 15:30 的突刺点          │
│╱    ╲╱    ╲                                        │
│                                                   │
│  ──────── 竖线会同步出现在下方日志面板              │
└──────────────────────────────────────────────────┘
          │ 自动过滤到 15:30 附近
          ▼
┌──────────────────────────────────────────────────┐
│  错误日志（Logs）                                  │
│                                                   │
│  15:30:12 ERROR timeout traceID=abc               │
│  15:30:15 ERROR db_conn_failed traceID=def        │
│  15:30:18 ERROR timeout traceID=ghi               │
│                                                   │
│  每条日志行旁边有 TraceID 链接 → 跳转 Tempo        │
└──────────────────────────────────────────────────┘
```

---

## 4.8 风险与最佳实践

### 风险 1：日志量过大导致浏览器卡顿

```yaml
# 在 Loki 数据源配置中限制
jsonData:
  maxLines: 500            # 一次最多返回 500 行
  timeout: 60              # 查询超时 60 秒
```

**现象**：Logs 面板一次性返回 5000 行日志，浏览器渲染卡顿。

**解决**：设置 `maxLines` 限制，如果确实需要看更多，使用 Explore 的分页功能。

### 风险 2：正则提取性能

```logql
# ❌ 慢：复杂的正则，且过滤条件在后
{job="api"} | regexp "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)" |= "error"

# ✅ 快：先过滤再解析
{job="api"} |= "error" | regexp "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)"

# ✅ 更快：优先用 json/logfmt
{job="api"} |= "error" | json
```

### 风险 3：Derived Fields 正则不匹配

**排查步骤**：
1. 在 Explore 中复制一条实际的日志行
2. 用在线正则测试工具（如 regex101.com）验证你的正则
3. 注意转义：JSON 格式的日志中双引号需要转义

---

## 4.9 典型问题处理

### 问题 1："Data source connected but no logs received"

**排查步骤**：
```
□ Promtail 是否正常运行？   → docker ps | grep promtail
□ 日志文件路径是否正确？     → 检查 promtail 的 __path__ 配置
□ Loki API 是否可达？       → curl http://loki:3100/ready
□ 标签是否匹配？            → 在 Explore 中试 {job=~".+"}
□ 日志文件中确实有内容？     → tail /var/log/api/*.log
```

### 问题 2：日志中的 JSON 字段无法展开

**原因**：日志内容不是合法 JSON。

**示例**：
```
# 这不是合法 JSON（单引号）
{'level': 'error', 'msg': 'timeout'}

# 这是合法 JSON（双引号）
{"level": "error", "msg": "timeout"}
```

**解决**：如果日志格式不标准，使用 `| logfmt` 或自定义 `| regexp`。

### 问题 3：Derived Fields 链接不生效

**原因**：`matcherRegex` 不匹配。

**验证方法**：
1. 在 Explore 中执行 `{job="api"} | json`
2. 复制一条日志中的 trace_id 原始值
3. 用 regex101.com 测试你的正则

---

## 4.10 开发者必须掌握的技能

| 技能 | 掌握程度 |
|------|---------|
| LogQL 日志流选择器 | 必须熟练 |
| LogQL 管道表达式 | 必须熟练 |
| 解析器（json/logfmt/regexp）| 必须熟练 |
| Metrics from Logs | 常用 |
| Derived Fields 配置 | 常用 |
| Promtail Pipeline 配置 | 了解 |
| Label 基数设计 | 必须理解（防止踩坑）|

---

## 本章小结

- **Loki 的设计哲学**：只索引 Label，不索引内容 → 存储成本是 ES 的 1/3
- **Label 如分类号，内容如书本**：先按分类号找到书架，再翻书找内容
- **查询原则**：过滤条件前置，先缩小范围再解析
- **高基数字段**（trace_id、user_id）不要设为 Label
- **Derived Fields** 从日志中提取 TraceID，实现 Logs → Traces 跳转
- **Metrics from Logs** 可以把日志当指标用，但不要替代 Prometheus
- **性能口诀**：`|=` 比 `|~` 快，`|json` 比 `|regexp` 快，先过滤后解析

> **核心心法**：Loki 不是帮你"看"日志的，是帮你"找到"日志的。配置好了，你的故障排查时间可以从小时级缩短到分钟级。
