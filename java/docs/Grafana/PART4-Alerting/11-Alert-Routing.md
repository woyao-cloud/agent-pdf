# 第11章 告警路由、模板与降噪

## 11.1 告警元数据设计

### 故事：P0 告警打给张三，P2 告警发邮件——自动分流的故事

**一个真实的故事：**

2020年，我参与了一个电商大促的压测。那天晚上，告警系统突然像疯了一样——短信、电话、钉钉、邮件全渠道同时轰炸。

运维老李的手机在 10 分钟内响了 47 次。每次接起来都是不同的问题：有的是数据库连接池满了（P0，需要立刻处理），有的是磁盘使用率超过 80%（P3，下周一再看就行）。

老李后来吐槽说："我接了一个 P3 告警的电话，以为天塌了，结果是磁盘快满了。我当时想，就这？你发个邮件不行吗？"

这就是**告警路由**要解决的问题：**不同严重程度的告警，应该用不同的渠道、通知不同的人、用不同的频率。** 就像医院的分诊台——急诊病人直接送抢救室，普通感冒去门诊排队，体检报告邮寄到家。

### Labels 与 Annotations

告警规则中的 Labels 和 Annotations 是告警路由和通知模板的基础。

```yaml
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
  for: 5m
  labels:
    severity: critical        # 告警级别（用于路由）——决定这条告警走"电话通道"还是"邮件通道"
    team: backend              # 负责团队（用于路由）——决定通知发给谁
    env: production            # 环境——生产环境的告警比测试环境紧急 100 倍
    pager: p0                  # 响应级别——P0 必须 5 分钟内响应
  annotations:
    summary: "Error rate > 5% on {{ $labels.instance }}"
    description: |
      Service {{ $labels.job }} on instance {{ $labels.instance }}
      has error rate of {{ $value | humanizePercentage }}.
      Threshold: 5%
    runbook: "https://wiki.example.com/runbooks/high-error-rate"
    dashboard: "https://grafana.example.com/d/abc123"
```

**Labels vs Annotations 的区别（一个关键理解）：**

```
Labels    = 告警的"身份证"——用于路由、分组、去重、静默
            比如：severity=critical 决定走电话通道
            Labels 会影响告警的"身份"——不同 Label 的告警被视为不同的告警

Annotations = 告警的"说明书"——用于通知模板中展示详细信息
            比如：summary、description、runbook 链接
            Annotations 不会影响告警的身份标识
```

### Label 设计规范

| Label | 用途 | 取值示例 | 用于路由 |
|-------|------|---------|:--------:|
| `severity` | 告警严重程度 | `critical`, `warning`, `info` | ✅ |
| `team` | 负责团队 | `backend`, `sre`, `dba` | ✅ |
| `env` | 环境 | `production`, `staging`, `dev` | ✅ |
| `pager` | 响应级别 | `p0`, `p1`, `p2`, `p3` | ✅ |
| `alertname` | 告警名称 | `HighErrorRate` | ✅ |

## 11.2 通知策略（Notification Policies）

### 原理比喻：告警路由树 = 公司的"告警快递分拣中心"

想象一家快递分拣中心：

```
快递到达（告警触发）
    │
    ▼
┌─────────────────────────────────────┐
│         传送带入口                    │
│    （Default Policy — 默认策略）      │
│    所有快递先到这里                   │
└────────────┬────────────────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
┌──────────┐   ┌──────────┐
│ 扫描仪 1  │   │ 扫描仪 2  │
│ severity= │   │ severity= │
│ critical  │   │ warning   │
└─────┬────┘   └─────┬────┘
      │              │
      ▼              ▼
┌──────────┐   ┌──────────┐
│ 分拣口 A  │   │ 分拣口 B  │
│  →电话    │   │  →邮件    │
│  →立即    │   │  →每小时  │
│  →SRE团队  │   │  →开发团队 │
└──────────┘   └──────────┘
```

**比喻对照表：**

| 告警概念 | 快递分拣中心比喻 |
|---------|----------------|
| 告警触发 | 快递到达传送带 |
| Default Policy | 总传送带入口 |
| Matcher（severity=critical） | 扫描仪读取快递标签 |
| 子策略（Sub-policy） | 不同分拣口 |
| Receiver（接收器） | 不同运输车（电话车、邮件车） |
| group_by | 同一个收件人的快递打包在一起送 |
| group_wait | 等 30 秒，看看还有没有同一收件人的快递 |
| repeat_interval | 同一包裹不重复配送，至少 4 小时后再提醒 |

**关键理解**：告警从 Default Policy 进入，从上到下逐层匹配。匹配到第一个符合条件的子策略后，**不会继续往下匹配**——这和防火墙规则很像，先匹配先服务。

### 树状路由

Grafana Unified Alerting 的通知策略基于 Label 匹配的树状结构：

```
Default policy（默认：所有告警先到这里）
├── 匹配: severity=critical
│   ├── team=sre → 电话通知（P0，5 分钟响应）
│   └── team=backend → 钉钉通知（P1，15 分钟响应）
│
├── 匹配: severity=warning
│   └── 邮件通知（P2，1 小时内响应即可）
│
└── 匹配: severity=info
    └── 邮件周报（P3，下周一再看）
```

### 配置示例

```yaml
# provisioning/alerting/policies.yml
apiVersion: 1
policies:
  # 默认策略
  # 作用：所有不符合子策略条件的告警，都会走这里
  - receiver: default-receiver
    group_by: ["alertname", "severity"]  # 按告警名+级别分组，相同告警合并为一条通知
    group_wait: 30s                      # 等 30 秒收集同类告警，减少通知数量
    group_interval: 5m                   # 分组后每 5 分钟重新评估一次
    repeat_interval: 4h                  # 同一组告警至少 4 小时后才重复通知，防止轰炸
    
    # 子策略
    policies:
      # P0：critical 级别 → 电话
      # 为什么这里 group_wait 只有 10s？因为 critical 告警需要立刻响应
      - matchers:
          - severity = critical
        receiver: pagerduty-critical
        group_by: ["alertname", "cluster"]
        group_wait: 10s       # 只等 10 秒就发送，不浪费时间
        repeat_interval: 1h   # 1 小时重复一次，因为这是紧急问题，需要持续提醒
      
      # P1：warning 级别 → 钉钉
      - matchers:
          - severity = warning
        receiver: webhook-dingtalk
        group_wait: 30s
        repeat_interval: 2h
      
      # 按团队分流
      # 匹配 team="dba" 的告警直接发给 DBA 团队邮件
      - matchers:
          - team = "dba"
        receiver: dba-email
        group_wait: 1m
        repeat_interval: 4h
```

### 分组参数

| 参数 | 默认值 | 说明 | 比喻 |
|------|:------:|------|------|
| `group_wait` | 30s | 同类告警的等待时间，期间合并 | 快递员在楼下等 30 秒，看看还有没有同一栋楼的包裹 |
| `group_interval` | 5m | 已分组告警的重新评估间隔 | 每 5 分钟检查一下，这栋楼还有没有新包裹 |
| `repeat_interval` | 4h | 同一组告警的重复通知间隔 | 同一批包裹只送一次，至少 4 小时后才再次提醒 |

**分组效果示例：**
```
10:00:00 告警 1: HighCPU (web-1) 触发
10:00:05 告警 2: HighCPU (web-2) 触发
10:00:12 告警 3: HighCPU (web-3) 触发

30s 后（10:00:30）发送通知：
  "[3] HighCPU alerts: web-1, web-2, web-3 (since 10:00:00)"
  
→ 而不是 3 条独立的通知
```

### 真实案例：告警风暴导致值班电话被打爆

**背景**：某金融科技公司在一次核心数据库迁移后，由于 DNS 缓存未刷新，导致 200 台应用服务器同时报错。这 200 台服务器每台都触发了相同的告警规则：`HighErrorRate`。

**没有分组（Before）：**

```
10:00:00  告警 1: HighErrorRate (app-001)  → 电话通知 → 值班手机响了
10:00:01  告警 2: HighErrorRate (app-002)  → 电话通知 → 值班手机又响了
10:00:02  告警 3: HighErrorRate (app-003)  → 电话通知 → 值班手机又双响了
...
10:00:30  告警 30: HighErrorRate (app-030) → 电话通知 → 值班手机已经响麻了
...
10:02:00  告警 200: HighErrorRate (app-200) → 电话通知 → 手机没电了

结果：值班同学在 2 分钟内接了 200 个电话。
      他根本没机会思考"这是 DNS 的问题"——他一直在挂电话、接电话、挂电话、接电话。
      更可怕的是，真正需要手动处理的步骤（重启数据库连接池），因为手机一直在响，他根本没时间去操作。
```

**有分组（After）：**

```
10:00:00  告警 1: HighErrorRate (app-001) 触发
10:00:01  告警 2: HighErrorRate (app-002) 触发
...
10:00:30  等待结束，200 条同类告警合并为 1 条通知：
          "[200] HighErrorRate alerts across 200 instances (since 10:00:00)"

值班同学收到 1 条通知："200 台服务器同时报错，这肯定是全局性问题，不是单台服务器的问题。"
→ 立刻判断出是 DNS 问题，10 分钟解决。

结果对比：
  Before: 200 个电话 × 30 秒 = 100 分钟被浪费在接电话上
  After:  1 条通知 × 10 秒阅读 = 10 秒，直接进入排查模式
```

**教训**：告警分组的本质是**把信号从噪音中提取出来**——200 台服务器同时报错，这个"同时"本身就是最重要的信息，而不是 200 个独立的告警。

## 11.3 消息模板化（Go Template）

### 模板语法基础

Grafana 的通知模板使用 Go Template 语法：

```gotemplate
{{/* 告警基本信息 */}}
{{/* 为什么用 .Alerts.Firing | len？因为一次通知可能包含多个告警 */}}
告警名称: {{ .Alerts.Firing | len }} 个告警触发
告警级别: {{ .CommonLabels.severity }}

{{/* 遍历触发中的告警 */}}
{{/* range 是 Go Template 的循环语法 */}}
{{ range .Alerts.Firing }}
  - {{ .Labels.alertname }}: {{ .Annotations.summary }}
    实例: {{ .Labels.instance }}
    {{/* Values.A 中的 A 是告警规则的 refId */}}
    当前值: {{ .Values.A }}
    开始时间: {{ .StartsAt.Format "2006-01-02 15:04:05" }}
    {{/* 注意：Go 的 Format 使用固定时间 2006-01-02 作为参考时间 */}}
    {{/* 2006 = 年, 01 = 月, 02 = 日, 15 = 时, 04 = 分, 05 = 秒 */}}
{{ end }}

{{/* 遍历已恢复的告警 */}}
{{/* 用 if 判断避免没有恢复告警时显示空的"已恢复"标题 */}}
{{ if .Alerts.Resolved }}
已恢复:
{{ range .Alerts.Resolved }}
  - {{ .Labels.alertname }}: {{ .Annotations.summary }}
    恢复时间: {{ .EndsAt.Format "2006-01-02 15:04:05" }}
{{ end }}
{{ end }}
```

### 模板变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `{{ .Alerts }}` | 告警列表 | 所有告警 |
| `{{ .Alerts.Firing }}` | 告警列表 | 触发中的告警 |
| `{{ .Alerts.Resolved }}` | 告警列表 | 已恢复的告警 |
| `{{ .CommonLabels }}` | 标签 Map | 所有告警共有的 Label |
| `{{ .CommonAnnotations }}` | 标签 Map | 所有告警共有的 Annotation |
| `{{ .ExternalURL }}` | 字符串 | Grafana 外部 URL |

### 模板函数

| 函数 | 用途 | 示例 |
|------|------|------|
| `humanizePercentage` | 格式化百分比 | `{{ $value | humanizePercentage }}` |
| `humanizeDuration` | 格式化时间 | `{{ $value | humanizeDuration }}` |
| `humanize1024` | 二进制单位 | `{{ $value | humanize1024 }}` |
| `match` | 正则匹配 | `{{ if match "error" .Labels.alertname }}` |
| `title` | 首字母大写 | `{{ .Labels.alertname | title }}` |
| `toUpper` | 转大写 | `{{ .Labels.severity | toUpper }}` |

### 实战：钉钉机器人模板

```gotemplate
{{/* ============================================================
     钉钉 Markdown 消息模板
     
     为什么用 Markdown 而不是 Text？
     因为钉钉的 Markdown 消息支持标题、列表、链接等富文本格式，
     让告警信息一目了然。
     
     为什么用 \ 续行？
     JSON 不支持真正的多行字符串，所以用 \n\ 来实现换行。
     ============================================================ */}}
{
  "msgtype": "markdown",
  "markdown": {
    "title": "{{ .CommonLabels.severity | toUpper }}: {{ .Alerts.Firing | len }} alerts firing",
    "text": "## 🚨 Grafana 告警通知\n\n\
**告警级别**: {{ .CommonLabels.severity | toUpper }}\n\
**环境**: {{ .CommonLabels.env }}\n\
**时间**: {{ now.Format \"2006-01-02 15:04:05\" }}\n\n\
{{ range .Alerts.Firing }}\
### 🔴 {{ .Labels.alertname }}\n\
- **实例**: {{ .Labels.instance }}\n\
- **当前值**: {{ .Values.A }}\n\
- **持续时间**: {{ .StartsAt.Format \"15:04:05\" }} 开始\n\
- **摘要**: {{ .Annotations.summary }}\n\
- **处理手册**: [{{ .Annotations.runbook }}]({{ .Annotations.runbook }})\n\n\
{{ end }}\
{{ if .Alerts.Resolved }}\
### ✅ 已恢复\n\
{{ range .Alerts.Resolved }}\
- {{ .Labels.alertname }}: 已于 {{ .EndsAt.Format \"15:04:05\" }} 恢复\n\
{{ end }}\
{{ end }}\
"
  }
}
```

### 实战：飞书机器人模板

```gotemplate
{{/* ============================================================
     飞书消息卡片模板
     
     飞书使用 interactive 消息类型，支持卡片式布局。
     template 字段可以根据 severity 动态切换颜色：
     critical → 红色卡片，warning → 黄色卡片
     ============================================================ */}}
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": {
        "tag": "plain_text",
        "content": "{{ .CommonLabels.severity | toUpper }}: {{ .Alerts.Firing | len }} alerts"
      },
      "template": "{{ if eq .CommonLabels.severity \"critical\" }}red{{ else }}yellow{{ end }}"
    },
    "elements": [
      {{ range .Alerts.Firing }}
      {
        "tag": "markdown",
        "content": "**{{ .Labels.alertname }}**\n实例: {{ .Labels.instance }}\n当前值: {{ .Values.A }}\n摘要: {{ .Annotations.summary }}"
      },
      {{ end }}
      {
        "tag": "note",
        "elements": [{
          "tag": "plain_text",
          "content": "Grafana: {{ .ExternalURL }}"
        }]
      }
    ]
  }
}
```

## 11.4 接收器配置

### 通知渠道类型

| 类型 | 配置方式 | 适用场景 | 比喻 |
|------|---------|---------|------|
| Webhook | HTTP POST | 钉钉/飞书/企业微信 | 快递员送到代收点 |
| Email | SMTP | 邮件通知 | 快递员塞进邮箱 |
| PagerDuty | API Key | P0 电话告警 | 快递员当面签收（必须确认） |
| Slack | Webhook URL | IM 通知 | 送到工作群前台 |
| Telegram | Bot Token | IM 通知 | 送到个人信箱 |
| DingDing | Webhook URL | 钉钉通知 | 送到钉钉群 |
| WeCom | Webhook URL | 企业微信 | 送到企业微信群 |

### 接收器配置示例

```yaml
# provisioning/alerting/receivers.yml
apiVersion: 1
receivers:
  # P0 电话通知：使用 PagerDuty，配置 routingKey
  # 为什么用 PagerDuty？因为它支持自动电话呼叫、值班排班、升级策略
  - name: pagerduty-critical
    pagerduty:
      routingKey: ${PAGERDUTY_KEY}
      severity: critical
  
  # P1/P2 钉钉通知：使用 Webhook 接入钉钉机器人
  - name: webhook-dingtalk
    webhook:
      url: https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}
      httpMethod: POST
      httpHeaders:
        Content-Type: application/json
      # 引用自定义模板
      template: dingtalk-template
  
  # DBA 团队邮件通知
  - name: dba-email
    email:
      addresses: dba@example.com
      singleEmail: true  # 多条告警合并为一封邮件，而不是每人一封
  
  # 默认接收器：发送到内部 webhook 服务
  - name: default-receiver
    webhook:
      url: http://webhook-receiver:5000/alert
      sendResolved: true  # 也发送恢复通知
```

## 11.5 告警静默

### 临时静默

在维护窗口期间屏蔽特定告警：

```bash
# 通过 API 创建静默
# 为什么用 API 而不是 UI？可以集成到 CI/CD 流水线中自动创建
curl -X POST "http://grafana:3000/api/alertmanager/grafana/api/v2/silences" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      { "name": "alertname", "value": "HighCPU", "isRegex": false },
      { "name": "env", "value": "production", "isRegex": false }
    ],
    "startsAt": "2024-01-01T10:00:00Z",
    "endsAt": "2024-01-01T12:00:00Z",
    "createdBy": "admin",
    "comment": "Scheduled maintenance: database migration"
  }'
```

### 静默场景

| 场景 | 静默时间 | 说明 | 代码集成建议 |
|------|---------|------|-------------|
| 版本发布 | 30m | 已知会有短暂不可用 | CI/CD 流水线自动创建，发布完成后自动删除 |
| 数据库维护 | 2h | 维护窗口 | 运维工单系统自动触发静默 |
| 已知问题 | 直到修复 | 已排期的已知问题 | 需要手动删除，配合工单状态 |

## 11.6 潜在风险与优化

### 风险 1：告警风暴

**问题**：根因故障导致大量衍生告警同时触发。

**真实案例**：某社交平台的核心消息队列崩溃，导致 50 个微服务全部报错。每个微服务都触发了 3-5 条告警规则（HighCPU、HighMemory、HighErrorRate、HighLatency……），总共产生了 **300+ 条告警**。

值班同学打开告警列表，看到的是：
```
HighCPU (user-service)
HighMemory (user-service)
HighErrorRate (user-service)
HighCPU (payment-service)
HighMemory (payment-service)
HighErrorRate (payment-service)
...
```

他花了 15 分钟一条条翻，才意识到"所有服务都出问题了"——但根源只是一个消息队列。

**解决：**
1. 使用分组（group_by）合并同类告警
2. 合理设置 repeat_interval
3. 使用 Inhibition（Prometheus Alertmanager 支持）——当根因告警触发时，抑制所有衍生告警

### 风险 2：告警疲劳

**问题**：告警太频繁，团队开始忽略通知。

**真实案例**：某公司的"磁盘使用率 > 80%"告警每天触发 20+ 次，因为很多测试服务器磁盘确实长期在 80% 以上。运维团队从一开始的紧张应对，到一个月后的"哦，又是这个"，再到后来的直接关掉通知。

直到有一天，生产环境的主数据库磁盘真的满了（100%），但运维同学以为"又是那个磁盘告警"，继续无视——最终导致数据库写入失败，业务中断 2 小时。

**解决：**
1. 增大 `for` 持续时间
2. 提高告警阈值
3. 定期 Review 告警规则，删除无效告警
4. **区分环境**：测试环境用 info 级别，生产环境用 warning 以上

### 风险 3：模板渲染错误

**问题**：Go Template 语法错误导致通知发送失败。

**真实案例**：某公司在模板中引用了一个告警规则中没有定义的 Annotation：

```gotemplate
{{ .Annotations.runbook_url }}  <!-- 但告警规则中定义的是 runbook，不是 runbook_url -->
```

结果：模板渲染报错，P0 告警的钉钉通知发送失败。值班同学在群里等通知，结果什么都没收到。直到用户投诉了才发现系统已经挂了 40 分钟。

**解决：**
1. 在 Grafana 的 Alerting → Contact points 中测试模板
2. 使用 `{{ if }}` 判断避免空值
3. 所有模板中增加默认值处理

```gotemplate
{{/* ✅ 安全的做法：用 if 判断避免空值 */}}
{{ if .Annotations.runbook }}
- **处理手册**: {{ .Annotations.runbook }}
{{ else }}
- **处理手册**: 未配置（请补充 runbook 链接）
{{ end }}
```

## 11.7 典型问题处理

### 问题 1：收不到告警通知

**排查：**
1. 检查告警状态是否为 Firing（Alerting → Alert rules）
2. 检查通知渠道配置是否正确
3. 检查接收器是否成功发送（Alerting → History）

### 问题 2：告警重复发送

**原因**：group_interval 或 repeat_interval 设置过短。

**Before vs After：**

```
Before（值班同学每天收到 100+ 条重复告警）：
  group_interval: 1m
  repeat_interval: 5m
  结果：同一组告警每 5 分钟重复一次，一天重复 288 次

After（每天收到 6 条合并通知）：
  group_interval: 5m
  repeat_interval: 4h
  结果：同一组告警每 4 小时重复一次，一天重复 6 次
```

**解决**：增大 repeat_interval，默认 4h。

### 问题 3：模板变量为空

**原因**：告警规则中未定义对应的 Annotation。

**解决**：确保告警规则定义了模板中引用的所有 Annotation，或在模板中添加默认值判断。

## 11.8 开发者必须掌握的技能

- **Go Template 语法**：`{{ range }}`、`{{ if }}`、管道函数
- **通知策略树设计**：基于 Label 的多级路由
- **分组参数调优**：group_wait / group_interval / repeat_interval
- **消息模板编写**：钉钉、飞书、企业微信的模板格式
- **静默管理**：API 创建和管理静默

## 本章小结

- Labels 和 Annotations 是告警路由和模板的基础——Labels 是"身份证"，Annotations 是"说明书"
- 通知策略基于 Label 匹配的树状结构实现多级路由——像快递分拣中心一样自动分流
- 分组（Grouping）将同类告警合并为一条通知，是降噪的核心手段——**200 条告警合并为 1 条通知，才是正确的做法**
- Go Template 将告警格式化为钉钉/飞书/企业微信的消息卡片
- 静默用于维护窗口期间屏蔽告警
- 告警风暴和告警疲劳是生产环境最常见的告警问题——**告警的终极目标是越来越少，而不是越来越多**
