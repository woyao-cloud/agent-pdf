# 第13章 触发器与事件

## 13.1 场景故事：数据变更自动同步到Redis

### 业务需求

用户修改了个人资料后，修改后的数据需要立即更新Redis缓存，否则其他服务读到的是脏数据。传统的双写方案（业务代码同时更新DB和Redis）既增加了代码复杂度，又容易出现不一致。

PostgreSQL的触发器（Trigger） + LISTEN/NOTIFY 提供了一种零代码侵入的解决方案：**数据库层面监听数据变更，通过异步通知触发缓存更新**。

---

## 13.2 实现原理

### 触发器类型

```sql
-- 触发时机：
-- BEFORE：在操作执行前触发（可修改即将插入/更新的数据）
-- AFTER：在操作执行后触发（通常用于日志、同步）
-- INSTEAD OF：替代操作（用于视图）

-- 触发级别：
-- FOR EACH ROW：每行触发（最常用）
-- FOR EACH STATEMENT：每条SQL触发一次（适合批量操作后通知）

-- 触发器函数（返回TRIGGER的特殊函数）
CREATE OR REPLACE FUNCTION notify_user_update()
RETURNS trigger AS $$
BEGIN
    -- NEW: 新行（INSERT/UPDATE时可用）
    -- OLD: 旧行（UPDATE/DELETE时可用）
    -- TG_OP: 当前操作类型（INSERT/UPDATE/DELETE）
    
    PERFORM pg_notify('user_changes', json_build_object(
        'action', TG_OP,
        'user_id', NEW.id,
        'changed_at', extract(epoch from now()) * 1000
    )::text);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 行级触发器

```sql
-- 创建触发器
CREATE TRIGGER user_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION notify_user_update();
```

### LISTEN/NOTIFY

```sql
-- 监听通道（在JDBC客户端中）
LISTEN user_changes;

-- 当触发器执行时，会发送通知：
-- NOTIFY user_changes, '{"action": "UPDATE", "user_id": 123, ...}'

-- Java端通过pgjdbc-ng监听
```

### 事件触发器（DDL触发器）

```sql
-- 监听DDL变更（CREATE TABLE、ALTER TABLE等）
CREATE OR REPLACE FUNCTION log_ddl()
RETURNS event_trigger AS $$
BEGIN
    INSERT INTO ddl_log(event_type, object_type, object_identity, command_tag)
    VALUES (
        current_query(),
        tg_event,
        tg_tag,
        session_user || '@' || inet_client_addr()::text
    );
END;
$$ LANGUAGE plpgsql;

CREATE EVENT TRIGGER log_ddl_trigger
    ON ddl_command_start
    EXECUTE FUNCTION log_ddl();
```

---

## 13.3 Java端监听示例

```java
// 使用 pgjdbc-ng 的异步通知监听
// 依赖：com.impossibl.pgjdbc-ng:pgjdbc-ng:0.8.9

@Service
public class DatabaseEventListener {
    
    private final String DATABASE_URL = "jdbc:pgsql://localhost:5432/mydb";
    
    @PostConstruct
    public void startListening() {
        Executors.newSingleThreadExecutor().submit(() -> {
            try (PGConnection connection = (PGConnection) 
                    DriverManager.getConnection(DATABASE_URL, "user", "password")) {
                
                // 注册监听通道
                connection.exec("LISTEN user_changes");
                
                while (true) {
                    PGNotification[] notifications = connection.notifications();
                    for (PGNotification notification : notifications) {
                        // 收到通知 → 更新Redis缓存
                        String payload = notification.getParameter();
                        JsonNode event = new ObjectMapper().readTree(payload);
                        String action = event.get("action").asText();
                        Long userId = event.get("user_id").asLong();
                        
                        if ("UPDATE".equals(action) || "INSERT".equals(action)) {
                            // 从数据库读取最新数据，更新Redis
                            User user = userRepository.findById(userId);
                            redisTemplate.opsForValue().set("user:" + userId, user);
                        } else if ("DELETE".equals(action)) {
                            redisTemplate.delete("user:" + userId);
                        }
                    }
                    Thread.sleep(100);
                }
            } catch (Exception e) {
                log.error("数据库监听异常", e);
            }
        });
    }
}
```

---

## 13.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 触发器逻辑复杂 | 触发器中包含大量业务逻辑 | 触发器只做通知，不做复杂处理 |
| 隐式行为 | 触发器是在"暗中"执行的 | 明确文档化触发器的存在 |
| 性能影响 | 每行触发增加写入延迟 | 只对关键时刻使用 |
| 递归触发 | 触发器内的UPDATE再次触发自己 | 设置session_replication_role |
| 调试困难 | 很难追踪触发器的执行链路 | 日志记录触发器的执行过程 |

---

## 13.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: event_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-trigger.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-trigger.sql
CREATE TABLE users (
    id serial PRIMARY KEY,
    name varchar(100),
    email varchar(200),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE user_audit_log (
    id bigserial PRIMARY KEY,
    user_id int,
    old_data jsonb,
    new_data jsonb,
    action varchar(10),
    changed_by text,
    changed_at timestamptz DEFAULT now()
);

-- 审计日志触发器
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS trigger AS $$
BEGIN
    INSERT INTO user_audit_log(user_id, old_data, new_data, action, changed_by)
    VALUES (
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END,
        TG_OP,
        current_user
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_user_changes();

-- 测试
INSERT INTO users (name, email) VALUES ('张三', 'zhangsan@test.com');
UPDATE users SET name = '张三（更新）' WHERE id = 1;
DELETE FROM users WHERE id = 1;
SELECT * FROM user_audit_log;
```