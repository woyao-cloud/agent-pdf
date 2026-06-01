# 附录

## 附录A：Spring Boot 日志打印规范

```java
// DO's
log.info("订单创建成功, orderId={}, userId={}", orderId, userId);  // ✅ 参数化
log.error("支付失败, orderId={}", orderId, exception);            // ✅ 传入异常

// DON'Ts
log.info("订单创建成功" + orderId);                               // ❌ 字符串拼接
log.error(e.getMessage());                                        // ❌ 不传异常对象
```

---

## 附录B：Grok 正则速查

```conf
# Logstash Grok 内置模式
%{TIMESTAMP_ISO8601:timestamp}     # 2024-01-01T10:00:00
%{LOGLEVEL:level}                  # INFO/ERROR/WARN
%{IP:client_ip}                    # 192.168.1.1
%{NUMBER:duration:float}           # 123.45
%{GREEDYDATA:message}              # 匹配任意剩余内容
```

---

## 附录C：KQL vs Lucene 语法对照

| 功能 | KQL | Lucene |
|------|-----|--------|
| 精确匹配 | `level: "ERROR"` | `level: "ERROR"` |
| 通配符 | `serviceName: order-*` | `serviceName: order-*` |
| 范围 | `duration > 1000` | `duration:[1000 TO *]` |
| AND | `AND` 或者直接写 | `AND` |
| OR | `OR` | `OR` |
| NOT | `NOT level: "INFO"` | `-level: "INFO"` |

---

## 附录D：一键清理脚本

```bash
#!/bin/bash
# cleanup.sh —— 清理 ELK 环境

echo "清理 ELK 环境..."
docker-compose down -v
rm -rf data/
echo "清理完成"
```

---

## 附录E：面试高频题

```
Q1：ELK 和 EFK 有什么区别？
Q2：为什么要引入 Kafka？
Q3：TraceId 如何透传？
Q4：ES 日志索引的最佳分片数？
Q5：Logstash 和 Filebeat 的职责边界？
Q6：ES 写入拒绝如何解决？
```

这些问题的答案都可以在本书的对应章节中找到。