# 第10章 统一告警架构与评估机制

## 10.1 架构演进

### 故事：从"告警风暴导致没人看告警"到"精准告警"

**一个真实的故事：**

2019年，我入职一家中型互联网公司担任 SRE。第一天，值班负责人把我拉进了一个名为"告警轰炸群"的钉钉群——光听名字就让人不安。

"这个群每天发多少条消息？"我问。

他苦笑了一下，打开群聊记录给我看。过去24小时：**12,847 条告警**。几乎每秒都有人在@所有人。"你知道吗？上周三凌晨3点，真正的 P0 故障——数据库主库宕机——发生时，告警消息淹没在几千条 HighCPU 毛刺告警里。值班同学直接关了群通知，睡到早上才发现。"

这听起来荒唐，但这就是**没有统一告警管理**的代价。当时，每个团队各自在 Dashboard 上画告警，没有统一的评估标准，没有 `for` 持续时间过滤毛刺，没有告警分级。结果就是：告警越多，越没人看。

Unified Alerting 的出现，就是为了终结这种"告警的悲剧"——通过统一的评估引擎、标准的告警状态机、精细的路由策略，让每一条告警都值得被认真对待。

### 从 Dashboard 内嵌告警到 Unified Alerting

| 版本 | 告警方式 | 局限 |
|:----:|---------|------|
| v5-v7 | Dashboard 内嵌告警 | 告警绑定面板，无法跨数据源，删除面板告警消失 |
| v8+ | Unified Alerting | 独立评估，支持多条件表达式，不依赖 Dashboard |

**Unified Alerting 的核心改进：**
1. **告警规则独立于 Dashboard**：删除面板不会删除告警（告别"手滑删面板导致告警消失"）
2. **跨数据源告警**：一个规则可以同时查询 Prometheus + MySQL
3. **多条件表达式**：支持 `Reduce`、`Math` 等表达式组合
4. **与 Alertmanager 兼容**：支持原有通知渠道

### 使用场景

**场景 1：跨数据源联合告警**
```yaml
# 同时检查 Prometheus（CPU > 80%）和 MySQL（订单积压 > 1000）
条件 A: Prometheus CPU > 80%
条件 B: MySQL pending_orders > 1000
触发条件: A AND B
```

**场景 2：多条件组合**
```
# 只有在"错误率 > 5%"且"持续时间 > 5分钟"时才触发
条件 A: 错误率 > 5%
条件 B: 5分钟滑动窗口平均 > 5%
触发条件: A AND B
```

**场景 3：基于比率的告警**
```
# 过去 1 小时错误率比上一小时增长超过 100%
当前错误率 / 1小时前错误率 > 2
```

## 10.2 评估周期（Evaluation Groups）

### 原理比喻：告警评估 = 保安巡逻

想象你是一家大型工厂的安保负责人。你需要安排保安巡逻来监控工厂安全。

- **评估引擎** = 保安队长。他不会自己巡逻，但他负责安排和调度。
- **Evaluation Group** = 巡逻路线。一条路线包含多个巡逻点（告警规则）。
- **评估间隔** = 巡逻频率。关键区域每10分钟巡逻一次，普通区域每小时一次。
- **`for` 持续时间** = 保安发现异常后，不会立刻拉警报——他会先观察一段时间，确认是真的有问题而不是临时现象。

```
工厂安保比喻对照表：

┌──────────────────┬──────────────────────────────┐
│ 告警概念          │ 工厂安保比喻                   │
├──────────────────┼──────────────────────────────┤
│ 评估引擎          │ 保安队长                      │
│ Evaluation Group  │ 巡逻路线                      │
│ 评估间隔 (10s)    │ 核心机房每10分钟巡逻一次        │
│ 评估间隔 (5m)     │ 仓库每5小时巡逻一次            │
│ for: 1m           │ 发现异常后观察1分钟再拉警报     │
│ Pending 状态      │ "好像有问题，再确认一下"        │
│ Firing 状态       │ "确认有问题，立刻拉警报！"      │
└──────────────────┴──────────────────────────────┘

保安不会因为一个人打了个喷嚏就拉火灾警报——同样，`for` 持续时间确保告警不会因为瞬时的毛刺而误报。
```

### 评估原理

Unified Alerting 使用独立的评估引擎，不依赖 Dashboard 的刷新周期。

```
Evaluation Group（评估组）
├── 评估间隔: 1m（每 60s 执行一次）
├── 规则 1: CPU > 80% for 5m
├── 规则 2: Memory > 90% for 5m
└── 规则 3: Error Rate > 5% for 3m

执行流程:
  第 0s:  评估规则 1 → 状态: Normal
  第 60s: 评估规则 1 → 状态: Pending（已持续 1m）
  第 120s: 评估规则 1 → 状态: Pending（已持续 2m）
  ...
  第 300s: 评估规则 1 → 状态: Firing（已持续 5m ≥ for: 5m）
```

**关键理解**：`Pending` 状态是一个"冷静期"——它让系统先"思考"再"行动"，而不是一看到异常就大喊大叫。

### 评估间隔配置

```yaml
# provisioning/alerting/rule-group.yml
apiVersion: 1
groups:
  # 高频评估组（关键指标，15s 评估一次）
  # 适用场景：P0 核心链路（如登录、支付、订单创建）
  - name: critical-alerts
    interval: 15s
    rules:
      - alert: ServiceDown
        condition: A
        for: 1m
        # ...

  # 低频评估组（非关键指标，5m 评估一次）
  # 适用场景：P3 通知类（如磁盘使用率超过 80% 警告）
  - name: info-alerts
    interval: 5m
    rules:
      - alert: DiskUsageWarning
        condition: A
        for: 10m
        # ...
```

### 评估间隔选择建议

| 评估间隔 | 适用场景 | 资源消耗 | 比喻 |
|:-------:|---------|:--------:|------|
| 10s | P0 核心链路 | 高 | 核心机房每10秒看一眼 |
| 30s | P1 严重问题 | 中 | 生产线每30秒巡逻一次 |
| 1m | P2 警告 | 低 | 普通办公区每分钟路过一次 |
| 5m | P3 通知 | 极低 | 仓库每5小时看一眼就够 |

### 真实案例：没有 `for` 的代价

**背景**：某电商公司配置了一条告警规则，监控订单处理延迟。规则很简单：`订单处理时间 > 5秒`。

**问题**：他们没有设置 `for` 持续时间。结果，每次数据库连接池短暂抖动（持续 1-2 秒），告警就触发一次。一个下午触发了 **247 次告警**。

**后果**：
- 值班同学开始无视这条告警（"又是毛刺，不管了"）
- 一周后，真正的订单处理故障持续了 15 分钟，但同样被值班同学忽略了——因为"这条告警总是误报"
- 最终导致用户投诉量暴增，业务部门紧急介入

**教训**：如果设置了 `for: 5m`，这 247 次毛刺中 **99% 不会触发告警**，而真正的 15 分钟故障会准确触发。

## 10.3 多条件表达式（Expressions）

### 表达式类型

Unified Alerting 支持 4 种表达式类型：

| 类型 | 用途 | 说明 | 生活类比 |
|------|------|------|---------|
| **Query** | 从数据源获取数据 | 执行 PromQL/SQL 查询 | 派侦察兵出去收集情报 |
| **Reduce** | 降维聚合 | 将时间序列转为单值 | 把一堆温度计读数取一个最大值 |
| **Math** | 数学计算 | 对多个条件做运算 | 用计算器判断"温度>30且湿度>80" |
| **Resample** | 重采样 | 对齐不同数据源的时间轴 | 把分钟级数据和秒级数据对齐到同一时间尺度 |

### 实战：跨数据源告警（手把手完整步骤）

**场景**：当 Prometheus CPU > 80% **且** MySQL 订单积压 > 1000 时触发告警。

这是 Unified Alerting 最强大的场景——一个告警规则同时查询两个完全不同的数据源，组合判断后才触发。

**Step 1：打开 Grafana → Alerting → Alert rules → New alert rule**

这一步的入口在 Grafana 左侧菜单的"铃铛图标"（Alerting）下。选择"Alert rules"页签，点击右上角的"New alert rule"按钮。

**Step 2：配置查询条件（Query）**

```
条件 A (Query - Prometheus):
  # 查询过去5分钟的CPU使用率平均值
  # 为什么用 rate？因为 node_cpu_seconds_total 是累加计数器
  # rate() 将其转换为每秒速率，再取非空闲时间的占比
  avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100 > 80

条件 B (Query - MySQL):
  # 查询当前积压订单数
  SELECT count(*) FROM orders WHERE status = 'pending'
```

**Step 3：配置 Reduce 表达式**

选择"Add expression" → "Reduce"：
- 选择 A 作为输入，函数选择 `Max`（取 CPU 查询结果的最大值，避免平均值掩盖峰值）
- 选择 B 作为输入，函数选择 `Max`（MySQL 返回的本身就是单值）

**Step 4：配置 Math 表达式**

选择"Add expression" → "Math"：

```
# 为什么用 $A 而不是 A？因为 Grafana 用 refId 引用
# && 表示 AND：两个条件必须同时满足
# 只有 CPU 超限 AND 订单积压，才说明真的有问题
$A > 80 && $B > 1000
```

**Step 5：设置告警评估行为**

- `for: 5m`——两个条件同时满足并持续 5 分钟才触发
- 配置 Labels：`severity: critical`、`team: backend`
- 配置 Annotations：添加 summary 和 description

**Step 6：保存并验证**

保存后在"Alert rules"页面确认规则状态为"Active"。等待评估周期后检查状态变化。

**Step 7：完整告警规则 YAML**

```yaml
# provisioning/alerting/rules.yml
apiVersion: 1
groups:
  - name: cross-datasource-alerts
    interval: 30s
    rules:
      - uid: cpu_and_orders
        title: "CPU High AND Orders Backlog"
        condition: "C"    # 最终条件引用 Math 表达式的 ID
        data:
          # 条件 A: Prometheus CPU 查询
          - refId: A
            queryType: ""
            relativeTimeRange:
              from: 300  # 过去 5 分钟
              to: 0
            datasourceUid: prometheus
            model:
              expr: 'avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100'
              intervalMs: 15000
              maxDataPoints: 100
          
          # 条件 B: MySQL 订单积压查询
          - refId: B
            queryType: ""
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: mysql
            model:
              rawSql: 'SELECT count(*) AS pending FROM orders WHERE status = "pending"'
              format: "table"
          
          # Reduce A: CPU 取最大值
          - refId: C
            queryType: ""
            source: A
            expression: "$A > 80"
            type: math
          
          # Reduce B: MySQL 取最大值
          - refId: D
            queryType: ""
            source: B
            expression: "$B > 1000"
            type: math
          
          # Math: 组合条件
          - refId: E
            queryType: ""
            source: C
            expression: "$C && $D"
            type: math
        
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "CPU > 80% AND Orders backlog > 1000"
```

### 表达式图解

```
┌──────────────┐    ┌──────────────┐
│  Query A     │    │  Query B     │
│  Prometheus  │    │  MySQL       │
│  CPU > 80%   │    │  Orders>1000 │
└──────┬───────┘    └──────┬───────┘
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│  Reduce A    │    │  Reduce B    │
│  Max(CPU)    │    │  Max(Orders) │
└──────┬───────┘    └──────┬───────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│          Math C                  │
│     $A > 80 && $B > 1000        │
│                                  │
│  输出: true/false                │
└──────────────┬───────────────────┘
               │
               ▼
        告警触发/恢复
```

## 10.4 告警状态机

### 状态流转

```
          ┌──────────┐
          │  Normal  │
          └────┬─────┘
               │ 条件满足
               ▼
          ┌──────────┐
          │  Pending │ ◄── 条件持续满足
          └────┬─────┘
               │ for 时间到达
               ▼
          ┌──────────┐
          │  Firing  │ ◄── 发送告警通知
          └────┬─────┘
               │ 条件恢复
               ▼
          ┌──────────┐
          │  Normal  │ ◄── 发送恢复通知
          └──────────┘
```

- **Normal**：条件不满足，一切正常
- **Pending**：条件满足但未达到 `for` 持续时间——系统在"观察确认期"
- **Firing**：条件持续满足超过 `for` 时间，触发告警

### 状态机的生活比喻：煮开水

```
Normal  → 水温低于 100°C，一切正常
Pending → 水温达到 100°C，但只持续了 10 秒（毛刺），水还没真的烧开
Firing  → 水温持续 100°C 超过 5 分钟（for: 5m），水真的烧开了，关火！
```

## 10.5 潜在风险与优化

### 风险 1：告警规则过多导致评估延迟

**问题**：1000+ 条告警规则同时评估，Prometheus 或 Grafana 负载过高。

**真实案例**：某公司将所有 2000+ 条告警规则放在同一个 Evaluation Group，间隔全部设为 10s。结果评估引擎 CPU 打满，告警评估平均延迟从 10s 飙升到 3 分钟——等于所有告警都晚了 3 分钟才触发。

**优化：**
1. 合理分组，不同评估间隔的规则分到不同 Group
2. P0/P1 规则高频评估，P2/P3 规则低频评估
3. 使用 Recording Rule 预计算复杂查询

### 风险 2：Alertmanager 队列积压

**问题**：大量告警同时触发，Alertmanager 处理不过来。

**真实案例**：某公司上线新版本后，500 台服务器同时触发 OOM 告警。Alertmanager 队列瞬间塞满 5000+ 条消息，导致邮件网关被限流，真正的手动运维通知也被堵住了。

**解决**：配置 Alertmanager 的分组和限流。

### 风险 3：缺少 for 持续时间

**Before（错误配置——没有 for）：**

```yaml
# ❌ 错误：没有 for，每次 CPU 抖动都触发告警
- alert: HighCPU
  expr: node_cpu_seconds_total{mode="idle"} < 0.2
  # 没有设置 for！！！
  labels:
    severity: critical
```

效果：数据库连接池 1 秒抖动 → 告警触发 → 值班同学被叫醒 → 3 秒后自动恢复 → 值班同学刚睡着 → 又一个抖动……一晚上循环 50 次。

**After（正确配置——加上 for）：**

```yaml
# ✅ 正确：加了 for: 5m，瞬时毛刺被过滤
- alert: HighCPU
  expr: node_cpu_seconds_total{mode="idle"} < 0.2
  for: 5m  # 持续 5 分钟低于 20% 空闲才告警
  labels:
    severity: critical
```

效果：瞬时的 1-2 秒抖动被忽略；真正的 CPU 满载持续 5 分钟时才会触发告警。值班同学一觉睡到天亮。

**总结**：没有 `for` 的告警规则，等于"一有风吹草动就拉警报"。设置了 `for`，等于"先派人去看看是不是真的着火了"。

## 10.6 典型问题处理

### 问题 1：告警规则不评估

**排查：**
1. 检查告警规则的状态页面（Alerting → Alert rules）
2. 确认规则是否处于 "Active" 状态
3. 检查数据源连接是否正常
4. 检查评估间隔是否配置正确

### 问题 2：告警误报

**原因**：阈值设置不合理，或缺少 `for` 持续时间。

**Before vs After：**

```
Before（误报率 90%）：
  条件：CPU > 80%
  for: 无
  结果：每次短暂突刺都告警，值班同学直接忽略

After（误报率 < 5%）：
  条件：CPU > 80%
  for: 5m
  条件 B：内存 > 90%（增加第二个条件减少误判）
  结果：只有真实负载异常才告警
```

**解决：**
1. 增大 `for` 值
2. 调整阈值
3. 使用多条件组合减少误报

### 问题 3：告警重复通知

**原因**：多个 Alertmanager 实例都发送了通知。

**解决**：配置 Alertmanager 的 gossip 协议实现去重。

## 10.7 开发者必须掌握的技能

- **4 种表达式类型**：Query / Reduce / Math / Resample
- **告警状态机**：Normal → Pending → Firing → Normal
- **评估间隔设计**：不同优先级使用不同评估频率
- **跨数据源告警配置**：多个数据源的组合条件
- **Grafana Provisioning 中的告警规则 YAML**

## 本章小结

- Unified Alerting 是 Grafana v8+ 重构的独立告警引擎
- 告警规则不再绑定 Dashboard，支持跨数据源
- 4 种表达式（Query / Reduce / Math / Resample）实现复杂告警逻辑
- `for` 持续时间是防止告警误报的最简单有效手段——**没有 `for` 的告警规则，等于在狼来了的故事里每天喊三次**
- 评估间隔按优先级设置（P0 高频、P3 低频）
- 实践：[告警实验](../labs/ch10-alerting/README.md)
