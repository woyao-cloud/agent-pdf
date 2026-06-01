# 第10章 智能告警与自动化运维

## 本章导读

日志系统的最高价值不是"存起来"，而是"发现问题并通知人"。Kibana 内置了 Alerting 引擎，可以定期执行查询，当结果满足条件时触发告警通知。本章配置一个实战告警规则。

---

## 10.1 告警规则配置

```json
// 告警规则：核心接口 5 分钟内错误率 > 1%
// 在 Kibana → Stack Management → Rules → Create Rule 中配置

// 规则配置：
// 名称：核心接口错误率告警
// 检查频率：每 1 分钟
// 查询条件：
POST .alerts-stack-*/_search
{
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-5m" }}},
        { "term": { "level": "ERROR" }},
        { "term": { "serviceName": "order-service" }}
      ]
    }
  }
}
```

---

## 10.2 企业微信/钉钉 Webhook 集成

```python
# Webhook 通知——Kibana 触发告警时调用

# 钉钉示例
# 需要在钉钉群中添加自定义机器人，获取 Webhook URL

# Kibana → Stack Management → Connectors → Create Connector
# Type: Webhook
# URL: https://oapi.dingtalk.com/robot/send?access_token=xxx
# Method: POST
# Headers: Content-Type: application/json

# 告警通知模板（钉钉 Markdown 格式）
{
  "msgtype": "markdown",
  "markdown": {
    "title": "🔴 服务告警：{{context.alertName}}",
    "text": "### 🔴 服务告警\n\n**告警名称**: {{context.alertName}}\n\n**严重级别**: {{context.severity}}\n\n**服务**: {{context.serviceName}}\n\n**错误率**: {{context.errorRate}}%\n\n**时间**: {{context.timestamp}}\n\n**详情**: [查看 Kibana]({{context.kibanaUrl}})"
  }
}
```

---

## 10.3 告警降噪

```
告警风暴的应对策略：

  策略 1：抑制（Muting Rules）
  ┌────────────────────────────────────────────┐
  │  如果同一个服务在 5 分钟内连续触发告警       │
  │  只发送第一条通知，后续的自动静默            │
  └────────────────────────────────────────────┘

  策略 2：静默期（Throttling）
  ┌────────────────────────────────────────────┐
  │  每次告警触发后，设置 30 分钟的静默期         │
  │  期间即使条件满足，也不重复通知              │
  └────────────────────────────────────────────┘

  策略 3：分级告警
  ┌────────────────────────────────────────────┐
  │  P0：ERROR 率 > 5% → 立即电话/短信通知值班   │
  │  P1：ERROR 率 > 1% → 钉钉/企微通知          │
  │  P2：ERROR 率 > 0.1% → 邮件日报              │
  └────────────────────────────────────────────┘
```

---

## 本章总结

告警配置完成后，日志系统从"被动查询"变成了"主动通知"。关键是要配置好告警降噪策略——否则告警风暴会导致"狼来了"效应，真正出问题时反而没人关注。