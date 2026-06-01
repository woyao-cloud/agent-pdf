# 第12章 场景二：安全审计与合规日志（防篡改）

## 本章导读

金融、医疗等行业的审计日志有特殊要求：**一旦写入，不能被修改或删除**。普通日志存在 ES 中，如果 ES 被攻破或者有权限的运维人员可以删除数据。审计日志需要通过独立索引 + 只读策略来保证"不可篡改"。

---

## 12.1 审计日志独立通道

```java
// 审计日志——通过 Kafka 独立 Topic 发送
@Component
public class AuditLogger {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    public void log(String userId, String action, String resource, String result) {
        AuditEvent event = AuditEvent.builder()
            .timestamp(Instant.now())
            .userId(userId)
            .action(action)           // CREATE / UPDATE / DELETE / LOGIN
            .resource(resource)       // 操作对象
            .result(result)          // SUCCESS / FAILURE
            .sourceIp(getClientIp())
            .build();

        // 发送到独立的审计 Topic
        kafkaTemplate.send("audit-logs", JSON.toJSONString(event));
    }
}
```

---

## 12.2 Logstash 路由到审计索引

```conf
# Logstash 配置——从审计 Topic 消费
input {
  kafka {
    topics => ["audit-logs"]
    group_id => "logstash-audit"
  }
}

output {
  elasticsearch {
    hosts => ["es-node:9200"]
    index => "audit-logs-%{+YYYY.MM.dd}"
  }
}
```

---

## 12.3 ES 端只读配置

```json
// 审计索引一旦写入，就设为只读
// ILM 策略：Warm 阶段自动设为只读

PUT _ilm/policy/audit-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_size": "50gb", "max_age": "1d" }
        }
      },
      "warm": {
        "min_age": "1d",
        "actions": {
          "readonly": {},              // ← 设为只读，不可修改
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "delete": {
        "min_age": "365d",            // 审计日志保留 1 年
        "actions": { "delete": {} }
      }
    }
  }
}
```

---

## 本章总结

审计日志的核心是"不可篡改性"——通过独立 Topic、独立索引、写入后立即只读的策略来实现。