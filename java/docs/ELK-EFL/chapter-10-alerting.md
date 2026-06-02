# 第10章 智能告警与自动化运维

## 本章导读

凌晨 3 点，你在睡梦中被手机震动吵醒。打开一看：告警群里已经刷了 200 条消息。

"ERROR 率超过阈值！"——第 1 条
"ERROR 率超过阈值！"——第 2 条（过了 1 分钟又发了一次）
"ERROR 率超过阈值！"——第 3 条（又过 1 分钟）
"ERROR 率超过阈值！"——第 50 条
"..."
"ERROR 率超过阈值！"——第 200 条

你盯着手机屏幕，完全不知道发生了什么——因为 200 条一样的消息让你的大脑直接"宕机"了。你花了 10 分钟才翻到最上面，发现凌晨 2:30 有个版本发布，之后错误率就飙升了。

这就是**告警风暴**——没有降噪的告警系统比没有告警更可怕。它让你的大脑对告警产生"免疫"，真正出大事的时候反而不在意了。

一个好的告警系统应该做到：**不多发、不漏发、发了就能定位问题**。本章从告警规则配置、通知渠道集成、告警降噪三个维度讲解如何实现这个目标。

---

## 10.1 Kibana Alerting 机制

### 告警引擎的工作流程

Kibana 的告警引擎以固定的频率执行一个 ES 查询，当查询结果满足条件时触发告警：

```
Kibana Alerting 的工作流程：

  ┌──────────────────────────────────────────────────────────┐
  │  每 1 分钟执行一次                                        │
  │                                                          │
  │  1. 查询：                                              │
  │  POST app-logs-*/_search                                  │
  │  {                                                       │
  │    "query": {                                            │
  │      "range": { "@timestamp": { "gte": "now-5m" } }     │
  │    }                                                     │
  │  }                                                       │
  │  → 结果：count = 1000（5 分钟内总日志数）                │
  │  → 其中 level:ERROR = 50                                │
  │  → 错误率 = 5%                                          │
  │                                                          │
  │  2. 判断：                                              │
  │  条件：错误率 > 1%                                       │
  │  5% > 1% → 条件满足 → 触发告警                          │
  │                                                          │
  │  3. 动作：                                              │
  │  → 发送 Webhook 到钉钉/企微                              │
  │  → 创建告警索引中的记录                                   │
  │  → （可选）执行自定义 Webhook                            │
  │                                                          │
  │  4. 静默：                                              │
  │  同一个规则 30 分钟内不再重复通知                         │
  └──────────────────────────────────────────────────────────┘
```

### 创建告警规则

```json
// 告警规则配置（在 Kibana → Stack Management → Rules → Create Rule）
// 规则类型：ES Query
// 名称：核心服务错误率告警

// ===== 第 1 步：配置查询条件 =====
// 索引：app-logs-*
// 时间范围：最近 5 分钟
// KQL 查询：level: "ERROR" AND serviceName: ("order-service" OR "payment-service")

// ===== 第 2 步：配置检查频率 =====
// 每隔：1 分钟
// 检查窗口：5 分钟（每 1 分钟检查最近 5 分钟的数据）

// ===== 第 3 步：配置触发条件 =====
// 条件类型：聚合
// 聚合类型：count（计数）
// 条件：count > 10
// 解释：5 分钟内 ERROR 日志超过 10 条就告警

// ===== 第 4 步：配置动作（Action） =====
// 动作类型：Webhook
// URL：你的钉钉/企微机器人 Webhook
// 请求体（JSON）：

{
  "msgtype": "markdown",
  "markdown": {
    "title": "🔴 服务错误告警",
    "text": "### 🔴 服务错误告警\n\n" +
            "**告警名称**: {{context.alertName}}\n" +
            "**触发时间**: {{context.timestamp}}\n" +
            "**错误数**: {{context.value}}\n" +
            "**服务**: {{context.condition.serviceName}}\n\n" +
            "**🔗 [在 Kibana 中查看详情]({{context.kibanaUrl}})**"
  }
}
```

### 高级告警规则示例

```json
// 场景 1：5 分钟内错误率 > 1%
// 在 Kibana 中通过 "Threshold" 规则类型实现

// 查询 A：总日志数
// 索引：app-logs-*
// 查询：serviceName: "order-service"
// 统计：count

// 查询 B：错误日志数
// 索引：app-logs-*
// 查询：serviceName: "order-service" AND level: "ERROR"
// 统计：count

// 条件：当 B / A > 0.01 时触发（错误率超过 1%）

// 场景 2：某接口连续 5 次调用超过 5 秒
// 创建基于 "document" 的规则
// 查询：serviceName: "order-service" AND duration > 5000
// 条件：当匹配文档数 > 5 时触发

// 场景 3：日志中出现特定关键词
// 查询：message: "NullPointerException" OR message: "ConnectionTimeout"
// 条件：匹配文档数 > 0 时触发（立即告警）
```

---

## 10.2 集成企业微信/钉钉/飞书 Webhook

### 钉钉机器人配置

```bash
# 1. 在钉钉群中添加自定义机器人
# 群设置 → 智能群助手 → 添加机器人 → 自定义
# 获取 Webhook URL：
# https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxx

# 2. 在 Kibana 中创建 Connector
# Stack Management → Connectors → Create Connector
# 类型：Webhook
# 名称：DingTalk-Notify
# URL：https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxx
# Method：POST
# Headers：Content-Type: application/json
```

```json
// 3. 告警通知的钉钉消息模板
// 在告警规则的 Actions 中选择 DingTalk-Notify
// 使用以下 JSON 模板：

{
  "msgtype": "markdown",
  "markdown": {
    "title": "{{#if context.condition.severity}}🔴{{else}}🟡{{/if}} {{context.alertName}}",
    "text": "### {{#if context.condition.severity}}🔴{{else}}🟡{{/if}} {{context.alertName}}\n\n" +
            "- **触发时间**: {{#date context.timestamp}}{{/date}}\n" +
            "- **服务**: {{context.condition.serviceName}}\n" +
            "- **错误数**: {{context.value}}\n" +
            "- **环境**: production\n\n" +
            "**👉 [查看 Kibana 详情]({{context.kibanaUrl}})**\n\n" +
            "---\n" +
            "⏰ 告警每 1 分钟检查一次\n" +
            "🔇 同一规则 30 分钟内不会重复通知"
  }
}
```

### 告警通知分级

```yaml
# 告警分级策略

# P0 级（严重故障）
# 条件：核心服务错误率 > 5% 或 服务完全不可用
# 通知方式：电话 + 短信 + 群消息
# 响应时间：立即响应
# 示例："订单服务 5 分钟内错误率 15%，交易链路阻断"

# P1 级（一般故障）
# 条件：错误率 > 1% 或 特定接口超时
# 通知方式：群消息（@相关人员）
# 响应时间：15 分钟内
# 示例："订单服务错误率 3%，超过 1% 阈值"

# P2 级（告警通知）
# 条件：错误率 > 0.1% 或 非核心功能异常
# 通知方式：邮件
# 响应时间：当天内处理
# 示例："库存服务夜间有少量超时，错误率 0.3%"
```

---

## 10.3 告警降噪

### 为什么会产生告警风暴？

```yaml
# 告警风暴的典型场景

# 场景 1：一台服务器网络抖动，导致 10 个微服务都触发告警
# 你收到了 10 条不同的告警，但其实根因是一个

# 场景 2：一个 Bug 导致每 1 分钟触发一次告警
# 1 小时收到了 60 条一模一样的告警

# 场景 3：半夜做了版本发布，有轻微错误率上升
# 但团队没人看，告警发了 500 条，大家都屏蔽了群消息
```

### 静默期配置

```json
// 在 Kibana 中配置告警静默期

// 方式 1：在规则中配置静默期
// 每条规则可以设置：
// - 最小间隔：30 分钟
// - 也就是说：即使条件一直满足，至少隔 30 分钟才发一次通知

// 方式 2：创建静默规则
// Stack Management → Rules → Muting Rules → Create Muting Rule
// 规则：在每天 22:00 - 08:00 之间
// 对所有 P2 级别的告警静默（晚上只处理 P0/P1）

// 方式 3：维护窗口
// 适用：计划内的发布、维护
// 提前创建维护窗口，此期间的告警不通知
POST .kibana-event-log-*/_update_by_query
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "rule.id": "your-rule-id" }},
        { "range": { "@timestamp": { "gte": "now-1h", "lte": "now" }}}
      ]
    }
  }
}
```

### 告警聚合

```
告警聚合的原理（Kibana 8.x+ 支持）：

  未聚合：500 条独立告警
  10:00:01  订单服务 ERROR - 连接超时
  10:00:02  订单服务 ERROR - 连接超时
  10:00:03  订单服务 ERROR - 连接超时
  ...（500 条）
  → 运维人员的手机直接被打爆

  聚合后：1 条聚合告警
  10:00:00 - 10:05:00  订单服务 发生 500 次 "连接超时"
  → 看得清楚，处理得了
```

---

## 10.4 告警自愈

当告警触发时，如果能自动执行修复操作，可以减少人工介入：

```yaml
# 告警自动化的几个常见场景

# 场景 1：ES 磁盘水位超过 85%
# 自动执行：清理 7 天前的日志索引
# 脚本：curl -X DELETE "http://localhost:9200/app-logs-$(date -d '-7 days' +%Y.%m.%d)"

# 场景 2：ES 写入拒绝增加
# 自动执行：增大 refresh_interval
# 脚本：curl -X PUT "http://localhost:9200/app-logs-*/_settings" -H 'Content-Type: application/json' -d '{"index.refresh_interval": "30s"}'

# 场景 3：Kafka 消费 Lag 持续增加
# 自动执行：重启 Logstash 或增加 consumer
# 脚本：docker-compose restart logstash
```

---

## 本章总结

| 配置项 | 作用 | 推荐值 |
|-------|------|--------|
| **检查频率** | 多久检查一次 | 1 分钟 |
| **检查窗口** | 检查多大的时间范围 | 5 分钟 |
| **错误率阈值** | 超过多少告警 | 1%（P1）/ 5%（P0）|
| **静默期** | 相同告警的间隔 | 30 分钟 |
| **通知渠道** | 告警发到哪里 | 钉钉/企微（P0 同时短信）|

**核心原则**：
1. **告警必须有降噪**——没有静默期的告警系统是"狼来了"的重演。配置静默期，让每个告警都有实际意义
2. **告警必须有详情链接**——一条好的告警消息应该包含「查看详情」的链接，点进去直接到 Kibana 的搜索页面。不要让人去猜"这个告警是什么意思"
3. **先告警后降噪，比先降噪后告警好**——刚开始配置告警时，宁愿多发也不要漏发。运行一段时间后，根据"误报率"逐步完善静默规则
4. **告警不是终点，自愈是下一步**——对于已知的、可以自动恢复的问题（如磁盘满删最旧的索引），配置自动化脚本比等人来处理更可靠