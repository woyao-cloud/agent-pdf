# 第12章 场景二：安全审计与合规日志（防篡改）

## 本章导读

金融行业（如支付、证券）和医疗行业对审计日志有严格的要求——**一旦写入，不能被修改或删除**。这被称为"不可篡改性"。

听起来简单——"不删就行了"。但实际生产环境中，有很多你可能没意识到的"修改"场景：

```
审计日志被"修改"的几种方式：

  方式 1：运维人员直接操作
  ┌────────────────────────────────────────────┐
  │  curl -X DELETE "http://es:9200/audit-*"  │
  │  一条命令删除了所有审计索引                   │
  │  不需要权限—因为 ES 可能没有开启认证          │
  └────────────────────────────────────────────┘

  方式 2：索引被覆盖
  ┌────────────────────────────────────────────┐
  │  Logstash 配置错了，写入了一个错误的索引     │
  │  运维用 Reindex 修复                        │
  │  修复过程中覆盖了原始数据                    │
  └────────────────────────────────────────────┘

  方式 3：磁盘满了，自动删除旧索引
  ┌────────────────────────────────────────────┐
  │  磁盘水位线超过 95%                         │
  │  ES 自动设置了索引只读，运维腾空间时          │
  │  误删了审计索引                             │
  └────────────────────────────────────────────┘

  方式 4：应用 Bug 覆盖了审计日志
  ┌────────────────────────────────────────────┐
  │  应用程序 Bug 导致重复发送审计事件           │
  │  开发人员说"我删一下重复的"                   │
  │  结果删多了                                 │
  └────────────────────────────────────────────┘
```

解决这些问题的方案是：**审计日志走独立通道 + 特殊权限管理 + 索引只读策略**。本章完整展示这套方案。

---

## 12.1 独立审计通道

审计日志不应该和普通日志混在一起。需要独立的 Topic、独立的 Logstash Pipeline、独立的 ES 索引。

### 应用端：发送审计事件到 Kafka

```java
/**
 * 审计日志器
 *
 * 功能：将审计事件发送到独立的 Kafka Topic
 *      不与普通日志混在一起
 *
 * 使用场景：
 *   操作审计：谁在什么时间做了什么操作
 *   登录审计：用户登录/登出记录
 *   数据变更审计：谁修改了关键数据
 */
@Component
public class AuditLogger {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    private static final String AUDIT_TOPIC = "audit-logs";

    /**
     * 记录审计事件
     */
    public void log(AuditEvent event) {
        // 序列化为 JSON
        String json = JSON.toJSONString(event);
        // 发送到独立的审计 Topic
        kafkaTemplate.send(AUDIT_TOPIC, json);

        // 同时打印一条普通日志（方便开发排查）
        // 但这条日志不会被 Logstash 解析为审计事件
        log.info("审计事件: type={}, userId={}, action={}, result={}",
            event.getType(), event.getUserId(),
            event.getAction(), event.getResult());
    }

    /**
     * 快捷方法：记录操作审计
     */
    public void audit(String userId, String action,
                      String resource, String detail, boolean success) {
        AuditEvent event = AuditEvent.builder()
            .timestamp(Instant.now())
            .userId(userId)
            .userIp(getClientIp())
            .action(action)           // LOGIN / CREATE / UPDATE / DELETE
            .resource(resource)       // 操作对象：用户 / 订单 / 配置
            .resourceId(getResourceId())
            .detail(detail)           // 操作详情
            .result(success ? "SUCCESS" : "FAILURE")
            .build();

        log(event);
    }

    private String getClientIp() {
        // 从 RequestContext 中获取客户端 IP
        return ServletRequestAttributesHolder.getRequestAttributes()
            .map(attr -> ((HttpServletRequest) attr.getRequest())
                .getRemoteAddr())
            .orElse("unknown");
    }
}
```

```java
/**
 * 审计事件实体
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditEvent {
    private Instant timestamp;    // 事件时间
    private String userId;        // 操作用户
    private String userIp;        // 用户 IP
    private String action;        // 操作类型（LOGIN / CREATE / UPDATE / DELETE）
    private String resource;      // 操作对象类型（用户 / 订单 / 配置）
    private String resourceId;    // 操作对象 ID
    private String detail;        // 操作详情（JSON 字符串）
    private String result;        // 结果（SUCCESS / FAILURE）
}
```

### 使用示例

```java
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private AuditLogger auditLogger;

    @PostMapping("/users/{userId}/disable")
    public ResponseEntity<Void> disableUser(
            @PathVariable String userId,
            @RequestParam String reason) {

        // 1. 执行业务操作
        userService.disableUser(userId, reason);

        // 2. 记录审计日志（独立通道）
        auditLogger.audit(
            getCurrentUserId(),           // 谁
            "DISABLE_USER",               // 做了什么
            "USER",                        // 操作对象类型
            "userId=" + userId + ", reason=" + reason,  // 详情
            true                          // 成功
        );

        return ResponseEntity.ok().build();
    }
}
```

---

## 12.2 Logstash 独立路由

```conf
# logstash/pipeline/audit.conf —— 独立的审计日志 Pipeline

input {
  kafka {
    topics => ["audit-logs"]
    group_id => "logstash-audit"
    codec => json
    consumer_threads => 2
  }
}

filter {
  # 审计日志的 JSON 已经是结构化的了，不需要复杂处理
  # 只需要做简单的字段校验

  # 确保 @timestamp 使用事件时间
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }

  # 校验必填字段
  if ![userId] or ![action] {
    # 缺少关键字段，丢弃并记录
    drop {}
  }
}

output {
  elasticsearch {
    hosts => ["es-node:9200"]
    index => "audit-logs-%{+YYYY.MM.dd}"

    # 独立的用户认证（审计索引的写入用户只有只写权限）
    user => "logstash-audit-writer"
    password => "${AUDIT_WRITER_PASSWORD}"

    # 批量写入配置
    bulk_max_size => 1000
    flush_size => 1000
    idle_flush_time => 3
  }
}
```

---

## 12.3 ES 索引只读与冷归档

### ILM 策略：写入当天后可搜索但不可修改

```json
// 审计索引的 ILM 策略
// 关键：Hot 阶段过后立即进入 Warm 阶段的只读状态

PUT _ilm/policy/audit-logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "1d",           // 1 天后进入 Warm 阶段
        "actions": {
          "readonly": {},           // ← 核心！设为只读，不可修改
          "forcemerge": {
            "max_num_segments": 1  // 合并为 1 个 Segment
          },
          "shrink": {
            "number_of_shards": 1  // 收缩分片
          },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "90d",          // 3 个月后进入 Cold 阶段
        "actions": {
          "readonly": {},
          "allocate": {
            "require": {
              "data_type": "cold"  // 迁移到冷节点
            }
          }
        }
      },
      "delete": {
        "min_age": "365d",         // ⚠️ 审计日志通常保留 1-7 年
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

```json
// 创建审计索引模板 + ILM
PUT _index_template/audit-logs-template
{
  "priority": 200,              // 比普通日志模板优先级高
  "index_patterns": ["audit-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 2,  // 审计日志 2 个副本（比普通日志多一份）
      "refresh_interval": "10s",
      "index.lifecycle.name": "audit-logs-policy",
      "index.lifecycle.rollover_alias": "audit-logs"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":   { "type": "date" },
        "userId":       { "type": "keyword" },
        "userIp":       { "type": "ip" },
        "action":       { "type": "keyword" },
        "resource":     { "type": "keyword" },
        "resourceId":   { "type": "keyword" },
        "detail":       { "type": "text", "index": false },
        "result":       { "type": "keyword" }
      }
    }
  }
}
```

### 权限隔离

```json
// 审计索引的权限控制

// 1. 审计写入用户（只有审计索引的写入权限）
POST _security/role/audit_writer
{
  "indices": [
    {
      "names": ["audit-logs-*"],
      "privileges": ["create_index", "create", "write"]
    }
  ]
}

POST _security/user/logstash-audit-writer
{
  "password": "ComplexPass123!",
  "roles": ["audit_writer"]
}

// 2. 审计查询用户（只读，且只能查审计索引）
POST _security/role/audit_reader
{
  "indices": [
    {
      "names": ["audit-logs-*"],
      "privileges": ["read"]
    }
  ]
}

// 3. 普通日志用户不能查审计索引
// 不在角色中配置 audit-logs-* 即可
```

### 冷归档到 S3/MinIO

```yaml
# 对于需要长期保留（1 年以上）的审计日志
# 可以将索引快照到对象存储（S3 / MinIO）

# ES → Snapshot → S3/MinIO

# 1. 注册 S3 仓库
PUT _snapshot/audit-archive
{
  "type": "s3",
  "settings": {
    "bucket": "company-audit-logs",
    "region": "cn-north-1",
    "base_path": "elasticsearch/audit/"
  }
}

# 2. 手动创建快照（或配置 SLM 自动快照）
PUT _snapshot/audit-archive/snapshot-2024-01-15
{
  "indices": "audit-logs-2024.01.15",
  "ignore_unavailable": true
}

# 3. 快照完成后，可以删除本地索引释放空间
DELETE audit-logs-2024.01.15

# 4. 需要查询时，从快照恢复
# POST _snapshot/audit-archive/snapshot-2024-01-15/_restore
```

---

## 本章总结

| 层面 | 技术手段 | 解决什么问题 |
|------|---------|------------|
| **采集** | 独立 Kafka Topic | 审计日志不跟普通日志混在一起 |
| **路由** | 独立 Logstash Pipeline | 审计日志有独立的处理逻辑和权限 |
| **存储** | 独立索引 + ILM readonly | 写入后 1 天自动设为只读 |
| **权限** | ES RBAC 角色隔离 | 只有审计管理员有写入权限 |
| **归档** | Snapshot 到 S3/MinIO | 长期保存且释放本地空间 |

**核心原则**：
1. **审计日志的核心要求是"不可篡改"**——不是"方便查询"，不是"节省空间"。所有设计都应该围绕"写入后不能改"这个目标
2. **独立通道是审计的基石**——审计日志和普通日志走同一套通道，意味着普通日志出问题时（如 Logstash 配置错误），审计日志也可能出问题。独立通道保证了审计日志的可用性
3. **只读策略越早越好**——审计索引创建后 1 天就设为只读，这通常是合理的。如果需要审计"当天"的数据（还没设为只读），应该通过特殊权限 + 审批流程来操作
4. **需要长期保留（1 年+）**——审计日志通常需要保留 1-7 年（取决于行业法规）。本地磁盘不可能存这么多，必须用 Snapshot API 将数据归档到低成本的对象存储