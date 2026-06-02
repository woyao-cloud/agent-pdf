# 第10章：智能告警

## 目标

演示 Kibana 告警规则的配置和钉钉/企微 Webhook 集成。

## 前置依赖

- 共享基础设施已启动
- 有日志写入 ES（可运行 ch03 产生日志）

## 使用步骤

### 导入告警规则

```bash
# Kibana 不支持直接通过 REST API 创建告警规则
# 需要在 Kibana UI 中手动配置
```

### 手动配置指南

```
1. 打开 Kibana → Stack Management → Rules → Create Rule
2. 名称：核心服务错误率告警
3. 规则类型：ES Query
4. 索引：app-logs-*
5. KQL 查询：level: "ERROR" AND serviceName: ("order-service" OR "payment-service")
6. 检查频率：每 1 分钟
7. 触发条件：count > 10（5 分钟内超过 10 条 ERROR）

8. 配置 Action → Webhook
   类型：Webhook
   URL：你的钉钉/企微机器人 URL
   模板：见 alert-rule-error-rate.json
```

### 验证告警

```bash
# 触发告警：批量产生 ERROR 日志
for i in $(seq 1 20); do
  curl -X POST http://localhost:8081/api/order/error-demo
done

# 等待 1-2 分钟后，检查钉钉群是否收到告警
```

## 清理

在 Kibana UI 中删除告警规则和 Connector。