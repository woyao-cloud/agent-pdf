# 第14章 生产环境安全与规范

## 14.1 Key 命名规范

### 推荐命名规范

```
通用格式：业务名:模块名:具体ID[:子模块]

  示例：
  user:1001:profile        ← 用户信息
  user:1001:orders         ← 用户的订单列表
  order:2001:detail        ← 订单详情
  product:3001:stock       ← 商品库存
  article:4001:content     ← 文章内容

  搜索类：
  search:hot:keywords      ← 热搜词
  search:suggestion:prefix ← 搜索建议前缀

  限流类：
  ratelimit:api:user:1001  ← API 用户限流
  ratelimit:ip:192.168.1.1 ← IP 限流

  锁类：
  lock:order:2001          ← 订单锁
  lock:stock:3001          ← 库存锁
```

### 必须避免的反模式

```bash
# ❌ 错误命名（应该禁止）：
KEYS *                     # 线上禁止！
keys user*                 # 扫描千万级 key，阻塞主线程

# ❌ 无意义命名：
a, b, c, data              # 过几天就不知道是什么了

# ❌ 没有分隔符：
user1001order2001          # 难以识别

# ❌ 特殊字符：
user:1001:name::extra      # 双冒号混淆
user:1001:name/extra       # 斜杠在某些客户端有问题
```

---

## 14.2 权限与安全控制

### ACL（访问控制列表）

Redis 6.0+ 支持 ACL 细粒度权限控制：

```bash
# 创建只读用户
ACL SETUSER readonly-user on >password123 ~* +@read

# 创建只能访问特定 key 的用户
ACL SETUSER order-service on >order-pwd ~order:* +@read +@write

# 禁用危险命令
ACL SETUSER default -FLUSHALL -FLUSHDB -CONFIG -KEYS -SHUTDOWN

# 查看所有用户
ACL LIST

# 查看当前用户权限
ACL WHOAMI
```

### 危险命令管理

```bash
# redis.conf 禁用的命令（强烈推荐）
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG "ADMIN_CONFIG"
rename-command KEYS "ADMIN_KEYS"
rename-command SHUTDOWN ""
rename-command SAVE "ADMIN_SAVE"
rename-command DEBUG ""
rename-command SLAVEOF ""
rename-command REPLCAEOF ""
rename-command CLIENT ""

# 安全建议：
# 1. FLUSHALL / FLUSHDB 彻底禁用（误操作=删库）
# 2. KEYS 重命名为管理员命令（SCAN 替代）
# 3. CONFIG 重命名为管理员命令（防止泄露配置）
```

### Java 端安全连接

```yaml
# application.yml
spring:
  data:
    redis:
      password: ${REDIS_PASSWORD}  # 从环境变量读取，不硬编码
      ssl: true                     # 开启 SSL 加密传输
```

---

## 14.3 容量规划

### 内存估算公式

```
容量规划的核心公式：
  Redis 总内存 = 内存数据量 + 复制积压缓冲区 + AOF 缓冲区 + 客户端输出缓冲区

  内存数据量估算：
  Key 类型       = 预估条目数 × 平均条目内存（参考值）

  Key 元数据开销 ~ 40 字节（redisObject + dictEntry）
  String value   = 40 + 字符串字节数
  Hash overhead  = 每个 field 约 60 字节（ziplist 编码更少）
  List overhead  = 每个元素约 50 字节（quicklist 节点分摊）
  Set overhead   = 每个元素约 60 字节
  ZSet overhead  = 每个元素约 130 字节（skip list 指针开销大）
```

```java
/**
 * 容量规划计算器
 */
public class CapacityPlanner {

    public static void main(String[] args) {
        // 场景：缓存 1000 万用户信息
        long userCount = 10_000_000;
        int averageValueSize = 500; // 平均 500 字节（JSON）

        // String 方式（每个用户一个 key）
        long stringMemory = userCount * (80 + averageValueSize);
        System.out.printf("String 方式：%d GB%n",
            stringMemory / 1024 / 1024 / 1024);
        // ≈ (80 + 500) × 1000万 = 5.8GB

        // Hash 方式（每个用户一个 Hash，用 ziplist 编码）
        long hashFieldCount = 10; // 10 个 field
        long ziplistMemoryPerEntry = 200; // ziplist 编码下约 200 字节
        long hashMemory = userCount * (ziplistMemoryPerEntry
            + averageValueSize / hashFieldCount);
        System.out.printf("Hash 方式（ziplist）：%d GB%n",
            hashMemory / 1024 / 1024 / 1024);
        // ≈ (200 + 50) × 1000万 = 2.5GB

        // 考虑复制 + 缓冲区 = 额外 20%
        System.out.printf("实际建议（+20%%）：%d GB%n",
            (long) (hashMemory * 1.2 / 1024 / 1024 / 1024));

        // QPS 估算
        double totalQps = 50000;
        System.out.printf("QPS 能力：%.0f/s（单节点通常 5-10 万 QPS）%n",
            totalQps);

        // 如果单节点 QPS 不够 → 预估 Cluster 节点数
        int nodesNeeded = (int) Math.ceil(totalQps / 80000);
        System.out.printf("建议 Cluster 节点数：%d%n",
            Math.max(nodesNeeded, 1));
    }
}
```

## 本章总结

| 类别 | 必须做 | 推荐做 | 锦上添花 |
|------|-------|-------|---------|
| **命名** | 统一格式、禁止 KEYS | 禁用特殊字符 | 自动校验工具 |
| **安全** | 设置密码、禁用危险命令 | ACL 权限控制 | SSL 加密传输 |
| **容量** | 估算内存、设置 maxmemory | 压测验证 | 自动扩容策略 |