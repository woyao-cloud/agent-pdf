# 第3章 Prometheus 集成

## 3.1 场景故事：SRE 小林的双11大促监控

2024年11月10日晚8点，某电商公司的 SRE 小林盯着屏幕，手心微微冒汗——明天就是双11大促。

"老板，现在大盘能看到 QPS 和延迟吗？" 产品经理在群里@他。

小林打开 Grafana，发现 Dashboard 上全是空面板。"完了，数据源根本没配好。"

他需要的是一个能回答三个问题的监控大盘——这就是 RED 方法（Rate、Errors、Duration）：

- **Rate**：每秒有多少请求进来？（QPS）
- **Errors**：失败的请求占比多少？（错误率）
- **Duration**：请求响应有多慢？（延迟分布）

而这一切的起点，就是正确配置 **Prometheus 数据源**。

---

## 3.2 什么是 Prometheus 数据源？

> **比喻：Prometheus 数据源 = "翻译官"**

想象你是一位中国老板（Grafana），你的日本供应商（Prometheus）用日语（PromQL）发来了一份报告。你听不懂日语，但你的翻译官（Prometheus 数据源）知道如何把日语的"売上高"翻译成中文的"销售额"。

在 Grafana 的世界里，这个翻译过程叫做 **将 PromQL 转换为 Data Frame**——Grafana 内部通用的表格数据格式。没有这个翻译官，Grafana 就听不懂 Prometheus 在说什么。

---

## 3.3 配置 Prometheus 数据源（手把手）

### 步骤 1：进入数据源管理

1. 打开浏览器，访问你的 Grafana 地址（例如 `http://localhost:3000`）
2. 在左侧菜单栏找到 **齿轮图标（Configuration）**，点击
3. 选择 **Data Sources**
4. 点击蓝色按钮 **Add data source**
5. 在搜索框中输入 "Prometheus"，点击搜索结果中的 **Prometheus**

### 步骤 2：填写基本信息

```yaml
# ============================================================
# Grafana Prometheus 数据源配置（YAML 格式）
# 适用于 provisioning 自动配置方式
# ============================================================

apiVersion: 1

datasources:
  - name: Prometheus
    # ↑ 数据源名称，在 Dashboard 面板中会看到这个名字
    type: prometheus
    # ↑ 告诉 Grafana 这是一个 Prometheus 类型的数据源
    #   Grafana 会加载对应的"翻译官"（查询编辑器、响应解析器）
    
    access: proxy
    # ↑ 访问模式：proxy 表示 Grafana 服务器代理请求
    #   好处：浏览器不用直接访问 Prometheus，跨域问题由 Grafana 统一处理
    #   坏处：Grafana 需要能访问到 Prometheus 地址
    #   另一种模式是 direct（浏览器直接访问），但很少用
    
    url: http://prometheus:9090
    # ↑ Prometheus 服务的地址
    #   如果是 Docker Compose 环境，用服务名 prometheus
    #   如果是本地安装，用 http://localhost:9090
    #   如果是远程服务器，用 http://your-server:9090
    
    jsonData:
      # ↓ 查询超时：超过 60 秒的查询会被强制终止
      #   防止"慢查询拖死 Grafana"（真实事故：某公司一个聚合查询跑了 5 分钟，导致所有人打不开页面）
      httpMethod: "POST"
      
      # ↓ 管理 Prometheus 中的 Alerting 规则（Grafana 9+）
      #   开启后，可以直接在 Grafana 中编辑 Prometheus 告警规则
      manageAlerts: true
      
      # ↓ Prometheus 类型（可选值：Prometheus、Thanos、Cortex）
      #   如果是 Thanos 或 Cortex，需要额外配置
      prometheusType: "Prometheus"
      
      # ↓ 默认查询时间范围（单位：小时）
      #   影响 Instant 查询的行为——它只查这个窗口内的最后一个值
      timeInterval: "15s"
      
      # ↓ 查询时的默认步长（步长越小，曲线越精细，但查询越慢）
      #   公式自动计算：时间范围 / 最大数据点数
      queryTimeout: "60s"
```

### 步骤 3：通过 UI 验证连接

1. 在页面底部找到 **Save & Test** 按钮
2. 点击后，Grafana 会尝试连接 Prometheus，并返回类似消息：
   - ✅ `Successfully queried the Prometheus API.` —— 连接成功
   - ❌ `Error: dial tcp: lookup prometheus: no such host` —— 地址不对
   - ❌ `Error: 401 Unauthorized` —— 需要认证

> **小技巧**：如果连接失败，先在命令行里试一下：
> ```bash
> curl http://prometheus:9090/api/v1/status/runtimeinfo
> ```

---

## 3.4 三种查询模式的正确使用

这是新手最容易犯错的地方。Grafana 的 Prometheus 查询编辑器提供了三种模式：

### 3.4.1 Instant（瞬时查询）

```promql
# 查询此时此刻的 CPU 使用率
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[1m]))) * 100
```

**适合的场景**：
- Stat 面板（展示一个当前值）
- Gauge 面板（仪表盘，展示当前水位）
- 告警条件判断

### 3.4.2 Range（范围查询）

```promql
# 查询过去 5 分钟的 CPU 使用率（每秒一个采样点）
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[$__range]))) * 100
```

**适合的场景**：
- Time Series 面板（折线图、面积图）
- 趋势分析
- 对比不同时间段的指标

### 3.4.3 Both（混合模式）

某些面板可以同时使用 Instant + Range：

- **Stat 面板**：用 Instant 显示当前值，用 Range 显示最近的变化趋势（Sparkline）
- **Table 面板**：用 Instant 显示最新状态，用 Range 计算变化率

---

### ❌ Before：错误使用 Instant 查询 Time Series 面板

```yaml
# 错误配置：用 Instant 查询画折线图
# 结果：面板上只有一个点！
targets:
  - refId: A
    expr: 'node_cpu_seconds_total{mode="idle"}'  # 没有用 rate 函数，没有时间范围
    instant: true  # ❌ Time Series 面板用 Instant 模式
    legendFormat: "{{mode}}"
```

**现象**：面板上只显示一个孤零零的数据点，没有折线。

**原因**：Instant 查询只返回**当前时刻的一个值**，而 Time Series 面板需要**一系列时间点的值**来画线。

### ✅ After：正确使用 Range 查询 Time Series 面板

```yaml
# 正确配置：用 Range 查询画折线图
# 结果：漂亮的 CPU 使用率曲线
targets:
  - refId: A
    expr: 'rate(node_cpu_seconds_total{mode="idle"}[5m])'  # ✅ rate 函数自动处理时间范围
    instant: false  # ✅ Time Series 面板用 Range 模式
    legendFormat: "{{mode}}"
```

**现象**：平滑的折线图，展示过去一段时间 CPU 使用率的变化。

---

## 3.5 模板变量：让 Dashboard 活起来

### 真实案例：某公司的惨痛教训

某创业公司的 SRE 小李为每个微服务都创建了一个独立的 Dashboard：

```
dashboard-order.yaml    # 订单服务监控
dashboard-user.yaml     # 用户服务监控  
dashboard-payment.yaml  # 支付服务监控
dashboard-cart.yaml     # 购物车服务监控
```

每个 Dashboard 的内容几乎一模一样，只是查询中的 `service` 标签不同。

有一天，CTO 说："帮我在所有 Dashboard 上加一个内存使用率面板。"

小李改了一个下午，改了 20 个 YAML 文件——因为每个文件都要手动修改。

**如果用了模板变量**，只需要改一个 Dashboard，选择不同的服务即可。

### 什么是模板变量？

> **比喻：模板变量 = "填空答题卡"**

想象一张统一的答题卡，上面写着：
```
QPS of ______
```
模板变量 `$service` 就是那个下划线。你可以在 Dashboard 顶部下拉框中选择要填的值，比如 "order"、"user"、"payment"。

### 配置模板变量

```yaml
# ============================================================
# Dashboard 中的模板变量配置
# ============================================================
templating:
  list:
    - name: service
      # ↑ 变量名称，在查询中用 $service 引用
      #   好的变量名：简短、语义清晰
      type: query
      # ↑ 变量类型：query 表示从 Prometheus 查询获取可选项
      #   其他类型：interval（时间间隔）、datasource（数据源切换）、custom（手动列表）
      
      datasource:
        type: prometheus
        uid: PBFA97CFB590B2093
      
      definition: label_values(service)
      # ↑ 查询语句：获取所有 service 标签的值
      #   label_values() 是 Grafana 的模板函数，不是 PromQL
      
      refresh: 1
      # ↑ 刷新行为：1 表示 Dashboard 加载时刷新
      #   如果不刷新，新添加的服务不会出现在下拉框中
      
      sort: 1
      # ↑ 排序：1 = 字母升序，0 = 禁用排序
      #   排序让运维人员更快找到目标服务
      
      includeAll: true
      # ↑ 是否添加 "All" 选项，选中后查询所有服务
      #   用于全局大盘视图
      
      multi: true
      # ↑ 是否支持多选
      #   多选时 PromQL 会自动转为 (value1|value2|value3)
```

### 在查询中使用模板变量

```promql
# 不推荐：硬编码服务名
# 如果要监控另一个服务，必须复制粘贴修改
rate(http_requests_total{service="order"}[5m])

# 推荐：使用模板变量
# 下拉框选什么服务，就查什么服务
rate(http_requests_total{service="$service"}[5m])
```

---

## 3.6 高级技巧：混合数据源与 Prometheus 告警

### 混合数据源

Grafana 允许在一个面板中同时查询多个数据源。

```yaml
# 同时查询 Prometheus 和 MySQL
# 场景：将 Prometheus 的 QPS 指标和 MySQL 的订单量放在一个面板
targets:
  - refId: A
    datasource:
      type: prometheus
      uid: prometheus
    expr: 'rate(http_requests_total[5m])'
  
  - refId: B
    datasource:
      type: mysql
      uid: mysql
    rawSql: 'SELECT COUNT(*) as orders FROM orders WHERE created_at > NOW() - INTERVAL 5 MINUTE'
```

### Prometheus 告警管理

在 Grafana 9+ 中，你可以直接在 Grafana 中管理 Prometheus 的告警规则：

1. 在数据源配置中开启 `manageAlerts: true`
2. 进入 **Alerting** → **Alert rules**
3. 点击 **+ Create alert rule**
4. 选择数据源为 Prometheus
5. 编写 PromQL 告警表达式

```promql
# 告警：QPS 突然下降 50%
# 场景：可能服务挂了或上游限流
(
  rate(http_requests_total[5m])
  /
  rate(http_requests_total[5m] offset 1h)
) < 0.5
```

---

## 3.7 风险与最佳实践

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 面板显示 "No data" | 查询条件太严格 | 检查 label 匹配是否正确 |
| 查询超时 | 数据量太大或查询太复杂 | 缩短时间范围，使用 recording rules |
| 面板加载慢 | step 太小 | 增大步长，或使用 `$__interval` 变量 |
| 浏览器内存溢出 | 返回的数据点太多 | 限制 maxDataPoints |

### 生产最佳实践

1. **使用 Recording Rules 预聚合**：不要在 Grafana 中做高基数聚合查询
2. **设置合理的 Step**：时间范围 7 天时，step 设 5m 就足够
3. **避免通配符查询**：`{__name__=~".+"}` 会查询所有指标，极度消耗性能
4. **使用 Provisioning**：用 YAML 文件管理数据源配置，避免手动操作
5. **为数据源添加标签**：方便在 Dashboard 中按标签过滤

---

## 3.8 本章小结

| 概念 | 关键点 |
|------|--------|
| 数据源本质 | PromQL → Data Frame 的翻译器 |
| Instant vs Range | Stat 用 Instant，Time Series 用 Range |
| 模板变量 | 一个 Dashboard 通用所有服务 |
| 混合查询 | 一个面板同时查 Prometheus + 其他数据源 |
| 性能 | 预聚合 + 合理步长 + 避免高基数 |

**核心心法**：Prometheus 数据源配置好了，只是万里长征第一步。真正的功力在 PromQL 的编写——那是运维人员的"第二语言"。

---

## 附录：快速诊断 Checklist

当 Dashboard 显示异常时，按这个顺序排查：

```
□ 数据源连接正常吗？  → Save & Test
□ 查询语法正确吗？    → 在 Prometheus UI 中试一下
□ Instant/Range 模式选对了吗？  → Time Series 必须用 Range
□ 时间范围够大吗？    → 确认选中的时间范围内有数据
□ Label 匹配正确吗？  → 确认 label 名称和值正确
□ 模板变量有值吗？    → 确认下拉框选中了某个值
```
