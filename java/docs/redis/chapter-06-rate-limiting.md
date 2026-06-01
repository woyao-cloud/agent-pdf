# 第6章 高并发限流与计数器（Rate Limiting）

## 6.1 实现原理

### 计数器（Counter）基础

Redis 的 `INCR` / `INCRBY` 命令是实现计数器的原子操作，所有限流方案都建立在此基础上：

```bash
# 最简单的计数器
INCR counter:page:about       # 页面访问计数
GET counter:page:about        # 查看计数

# 带过期时间的计数器
INCR counter:api:user:1001
EXPIRE counter:api:user:1001 60  # 60 秒后自动重置
```

```java
// Java 基础计数器
@RestController
public class VisitCounterController {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 页面访问计数（原子操作）
    @GetMapping("/page/{id}")
    public String viewPage(@PathVariable String id) {
        String key = "counter:page:" + id;
        Long count = redisTemplate.opsForValue().increment(key);
        // 首次访问设置过期时间（一天后重置）
        if (count != null && count == 1) {
            redisTemplate.expire(key, 1, TimeUnit.DAYS);
        }
        return "第 " + count + " 次访问";
    }

    // 获取计数
    @GetMapping("/page/{id}/stats")
    public Map<String, Object> getStats(@PathVariable String id) {
        String key = "counter:page:" + id;
        String count = redisTemplate.opsForValue().get(key);
        Map<String, Object> stats = new HashMap<>();
        stats.put("pageId", id);
        stats.put("views", count != null ? Long.parseLong(count) : 0);
        return stats;
    }
}
```

### 固定窗口限流（Fixed Window）

最简单的限流算法——在特定的时间窗口内限制请求次数：

```
固定窗口限流：
  限制规则：每分钟最多 100 次

           窗口: 10:00:00 - 10:01:00         窗口: 10:01:00 - 10:02:00
  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐
  │  INCR 1 → 2 → ... → 100         │  │  INCR 1 → 2 → ... → 100         │
  │  第 101 次：拒绝                  │  │  第 101 次：拒绝                  │
  └──────────────────────────────────┘  └──────────────────────────────────┘
  ▲                                  ▲                                  ▲
  10:00                              10:01                              10:02

  边界突刺问题：
           窗口: 10:00:00 - 10:01:00    窗口: 10:01:00 - 10:02:00
  ┌────────────────────────────────┐  ┌────────────────────────────────┐
  │ 9:59 无请求                    │  │ 10:00 100 次请求（瞬间打满）   │
  │ ...                            │  │ 10:01 100 次请求（瞬间打满）   │
  └────────────────────────────────┘  └────────────────────────────────┘
  ▲                                ▲  ▲                              ▲
  9:59                            10:0010:01                          10:02

  ❌ 问题：10:00:55 到 10:01:05 之间实际发生了 200 次请求！
     因为跨越了两个窗口的"边界"
```

```java
// 固定窗口限流实现
@Component
public class FixedWindowRateLimiter {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String KEY_PREFIX = "ratelimit:fixed:";

    /**
     * @param key      限流标识（如用户 ID、IP、接口路径）
     * @param maxCount 窗口内最大请求数
     * @param windowMs 窗口大小（毫秒）
     * @return 是否允许通过
     */
    public boolean tryAcquire(String key, int maxCount, long windowMs) {
        String redisKey = KEY_PREFIX + key;
        Long count = redisTemplate.opsForValue().increment(redisKey);

        if (count != null && count == 1) {
            // 第一次访问，设置过期时间（窗口大小）
            redisTemplate.expire(redisKey, windowMs, TimeUnit.MILLISECONDS);
        }

        return count != null && count <= maxCount;
    }

    // 使用示例
    public boolean isAllowed(String userId) {
        return tryAcquire("user:" + userId, 10, 60_000); // 每分钟 10 次
    }
}
```

### 滑动窗口限流（Sliding Window）

滑动窗口解决了固定窗口的"边界突刺"问题——将窗口划分为更小的格子（如 10 秒一个格子），统计整个窗口内的历史数据：

```
滑动窗口 vs 固定窗口：
  固定窗口：
  ┌───────┐ ┌───────┐
  │       │ │       │ ← 窗口边界处可突发 2 倍流量
  └───────┘ └───────┘
  ───────────────────────────────► 时间

  滑动窗口（6 × 10秒格子）：
  ┌─┬─┬─┬─┬─┬─┐
  │ │ │ │ │ │ │ ← 每次请求只统计过去 60 秒内的数据
  └─┴─┴─┴─┴─┴─┘
    ↑     ↑
  当前时间 60 秒前
  ───────────────────────────────► 时间
```

```java
// 基于 ZSet 的滑动窗口限流
@Component
public class SlidingWindowRateLimiter {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String KEY_PREFIX = "ratelimit:sliding:";

    /**
     * 滑动窗口限流
     * 使用 ZSet 存储每个请求的时间戳，score = timestamp
     * 每次请求时，移除窗口外的旧数据，统计窗口内的请求数
     */
    public boolean tryAcquire(String key, int maxCount, long windowMs) {
        String redisKey = KEY_PREFIX + key;
        long now = System.currentTimeMillis();
        long windowStart = now - windowMs;

        // Lua 脚本：原子化的滑动窗口操作
        String script =
            // 1. 移除窗口外的旧记录
            "redis.call('zremrangebyscore', KEYS[1], 0, ARGV[1]) " +
            // 2. 统计当前窗口内的请求数
            "local current = redis.call('zcard', KEYS[1]) " +
            // 3. 如果小于限制，加入当前请求
            "if tonumber(current) < tonumber(ARGV[2]) then " +
            "    redis.call('zadd', KEYS[1], ARGV[3], ARGV[3]) " +
            "    redis.call('expire', KEYS[1], math.ceil(tonumber(ARGV[4]) / 1000)) " +
            "    return 1 " +
            "else " +
            "    return 0 " +
            "end";

        // 参数：[窗口起始时间戳, 最大请求数, 当前时间戳, 窗口大小(毫秒)]
        Long result = redisTemplate.execute(
            new DefaultRedisScript<>(script, Long.class),
            Collections.singletonList(redisKey),
            String.valueOf(windowStart),
            String.valueOf(maxCount),
            String.valueOf(now),
            String.valueOf(windowMs)
        );

        return Long.valueOf(1).equals(result);
    }
}
```

### 令牌桶算法（Token Bucket）

令牌桶是更平滑的限流算法——它以固定速率向桶中添加令牌，请求需要获取令牌才能通过：

```
令牌桶模型：
                ┌──────────────┐
   填充速率     │   令牌桶       │
   fillRate     │              │
   ──────────►  │ ┌──┐ ┌──┐   │   请求消耗令牌
                │ │T1│ │T2│   │ ──────────► 允许
                │ ├──┤ ├──┤   │
                │ │T3│ │T4│   │   桶空时拒绝
                │ └──┘ └──┘   │ ──────────► 拒绝
                │              │
                │ maxToken     │ ← 桶容量（防止一直不用的请求积压）
                └──────────────┘
```

```java
/**
 * 令牌桶限流（基于 Lua 脚本）
 *
 * 核心思想：
 *   - 不需要定时器填充令牌
 *   - 每次请求时根据时间差计算应填充的令牌数
 *   - 公式：当前令牌 = min(容量, 上次令牌 + (now - lastTime) × 速率)
 */
@Component
public class TokenBucketRateLimiter {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String KEY_PREFIX = "ratelimit:token:";

    /**
     * 令牌桶限流
     *
     * @param key        限流标识
     * @param capacity   桶容量（最大突发量）
     * @param rate       令牌填充速率（每秒多少个）
     * @return 是否获取到令牌
     */
    public boolean tryAcquire(String key, int capacity, double rate) {
        String redisKey = KEY_PREFIX + key;
        long now = System.nanoTime();

        // Lua 脚本：原子化的令牌桶操作
        String script =
            "local key = KEYS[1] " +
            "local capacity = tonumber(ARGV[1]) " +
            "local rate = tonumber(ARGV[2]) " +
            "local now = tonumber(ARGV[3]) " +

            // 读取当前桶状态：[上次剩余令牌数, 上次更新时间]
            "local tokens = redis.call('hget', key, 'tokens') " +
            "local lastRefill = redis.call('hget', key, 'last_refill') " +
            "if tokens == false then tokens = capacity end " +
            "if lastRefill == false then lastRefill = now end " +

            // 计算时间差和应填充的令牌数
            "local delta = (now - tonumber(lastRefill)) / 1000000000 " +
            "local newTokens = math.min(capacity, tonumber(tokens) + delta * rate) " +

            // 判断是否允许请求通过
            "if newTokens >= 1 then " +
            "    redis.call('hset', key, 'tokens', newTokens - 1) " +
            "    redis.call('hset', key, 'last_refill', now) " +
            "    redis.call('expire', key, 10) " +
            "    return 1 " +
            "else " +
            "    return 0 " +
            "end";

        Long result = redisTemplate.execute(
            new DefaultRedisScript<>(script, Long.class),
            Collections.singletonList(redisKey),
            String.valueOf(capacity),
            String.valueOf(rate),
            String.valueOf(now)
        );

        return Long.valueOf(1).equals(result);
    }

    // 工厂方法：创建常用限流器
    public static RateLimitConfig apiRateLimit() {
        // 每 API Key 每秒 20 个请求，最大突发 50
        return new RateLimitConfig(50, 20.0);
    }

    public static RateLimitConfig loginRateLimit() {
        // 每 IP 每分钟 5 次登录尝试
        return new RateLimitConfig(5, 5.0 / 60);
    }

    @Data
    @AllArgsConstructor
    public static class RateLimitConfig {
        private int capacity;
        private double rate;
    }
}
```

---

## 6.2 潜在风险

### 边界并发突刺（固定窗口缺陷）

已在 6.1 节详述。解决方案是改用滑动窗口或令牌桶。

### 分布式环境下的时钟漂移

问题：多个应用服务器的时钟不同步，导致限流统计偏差。

```
时钟漂移场景（应用服务器不在同一台物理机上）：
  服务器 A（北京）：时钟快 10ms
  服务器 B（上海）：时钟正常
  服务器 C（广州）：时钟慢 20ms

  如果限流窗口基于客户端时间戳（如 System.currentTimeMillis()），
  同一个请求在不同服务器计算的时间戳不同，
  导致 Redis 中的限流计数器出现"时间错位"。
```

**解决方案**：始终使用 **Redis 服务器的时间**，而不是客户端时间：

```lua
-- Lua 脚本中使用 Redis 的 TIME 命令获取服务器时间
local time = redis.call('time')  -- 返回 [seconds, microseconds]
local now_millis = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
```

```java
// Java 端统一时间来源
public long getRedisTime() {
    // 从 Redis 获取服务器时间（避免客户端时钟漂移）
    List<String> time = redisTemplate.execute(
        (RedisCallback<List<String>>) conn -> {
            List<byte[]> rawTime = conn.serverCommands().time();
            return rawTime.stream()
                .map(b -> new String(b, StandardCharsets.UTF_8))
                .collect(Collectors.toList());
        });
    if (time != null && time.size() >= 2) {
        long seconds = Long.parseLong(time.get(0));
        long micros = Long.parseLong(time.get(1));
        return seconds * 1000 + micros / 1000;
    }
    // 降级到本地时间
    return System.currentTimeMillis();
}
```

### 高频限流导致 Redis 网络 I/O 成为瓶颈

当每秒数百万次限流检查时，Redis 本身可能成为瓶颈——虽然每条命令只有微秒级延迟，但网络往返时间（RTT）会放大延迟。

```
高频限流场景：
  应用实例 100 台，每台平均 1000 QPS
  每 10 次请求需要做 1 次限流检查
  → 每秒 10000 次 Redis INCR 操作
  → 每个操作 ~1ms（含网络 RTT）
  → 总共每台 ~10ms/秒 用于限流，完全可以接受

  但如果：
  应用实例 1000 台，每台平均 10000 QPS
  每次请求都需要做限流
  → 每秒 10000000（千万）次 Redis 操作
  → Redis 单机不可能处理
  → 必须使用客户端本地限流
```

---

## 6.3 优化与应对方案

### Lua 脚本实现原子化操作

**所有限流操作必须原子化**。拆分为多个 Redis 命令会引入竞态条件——两个请求同时读到 count=99，都认为自己还没超限，都通过了检查。

```lua
-- ❌ 错误：非原子操作
count = INCR key    -- 步骤 1
if count <= 100     -- 步骤 2 → 步骤 1 和 2 之间可能有并发请求
    allow()
else
    reject()

-- ✅ 正确：Lua 脚本原子操作
-- 在 Redis 中，Lua 脚本整个执行期间不会有其他命令插入
EVAL "
    local key = KEYS[1]
    local max = tonumber(ARGV[1])
    local count = redis.call('INCR', key)
    if count == 1 then
        redis.call('EXPIRE', key, 60)
    end
    return count <= max and 1 or 0
" 1 rate:limit:user:1001 100
```

### 二级限流架构（客户端本地令牌桶 + Redis 全局桶）

对于超大规模限流场景，采用两级限流：

```
二级限流架构：

  应用实例                         应用实例                         应用实例
  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
  │  本地令牌桶            │  │  本地令牌桶            │  │  本地令牌桶            │
  │  Guava RateLimiter    │  │  Guava RateLimiter    │  │  Guava RateLimiter    │
  │  (突发 20/s，精确)     │  │  (突发 20/s，精确)     │  │  (突发 20/s，精确)     │
  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
             │                          │                          │
             │       ┌──────────────────────────────────────┐     │
             │       │        Redis 全局令牌桶              │     │
             │       │        (总限流 10000/s，共享)          │     │
             │       └──────────────────────────────────────┘     │
             │                          │                          │
              ────────── DB/RPC ────────────────────────────────
```

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.google.guava</groupId>
    <artifactId>guava</artifactId>
    <version>33.0.0-jre</version>
</dependency>
```

```java
@Component
public class TwoTierRateLimiter {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 本地令牌桶（Guava）
    private final RateLimiter localLimiter = RateLimiter.create(500); // 每秒 500
    // Redis 全局令牌桶
    private final TokenBucketRateLimiter globalLimiter = new TokenBucketRateLimiter();

    private static final double GLOBAL_LIMIT = 10000; // 全局每秒 10000

    public boolean tryAcquire(String globalKey) {
        // 第一级：本地令牌桶（毫秒级，无网络开销）
        if (!localLimiter.tryAcquire()) {
            return false; // 本地限流直接拒绝
        }

        // 第二级：Redis 全局限流（周期性检查，减少 Redis 调用频率）
        // 每 10 次请求才检查一次 Redis，其余直接放行
        if (ThreadLocalRandom.current().nextInt(10) == 0) {
            return globalLimiter.tryAcquire(globalKey, 12000, GLOBAL_LIMIT);
        }

        return true;
    }

    // 严格模式：每次请求都检查 Redis
    public boolean tryAcquireStrict(String globalKey) {
        if (!localLimiter.tryAcquire()) {
            return false;
        }
        return globalLimiter.tryAcquire(globalKey, 12000, GLOBAL_LIMIT);
    }
}
```

---

## 6.4 示例代码与配置

### 滑动窗口限流（完整生产版本）

```java
/**
 * 滑动窗口限流（基于 Sorted Set + Lua 脚本）
 *
 * 相比固定窗口，滑动窗口的优点是：
 * 1. 没有边界突刺问题
 * 2. 精度可配置（通过窗口格子大小）
 * 3. 适合需要精确控制的场景（如 API 限流、登录限流）
 */
@Component
public class PreciseSlidingWindowRateLimiter {

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 限流检查
     *
     * @param key        唯一标识（用户 ID / IP / API Key）
     * @param maxCount   窗口内最大请求数
     * @param windowMs   窗口大小（毫秒）
     * @param precisionMs 精度（毫秒），= 窗口划分为多少个小格
     *                    例如：60 秒窗口，精度 1 秒 = 60 个格子
     * @return 剩余配额（-1 表示被限流）
     */
    public int tryAcquire(String key, int maxCount, long windowMs, long precisionMs) {
        String redisKey = "sliding:" + key;
        long now = System.currentTimeMillis();
        long windowStart = now - windowMs;

        String script =
            // 1. 清理过期数据（窗口外的旧请求）
            "redis.call('zremrangebyscore', KEYS[1], 0, ARGV[1]) " +

            // 2. 统计当前窗口内的请求数
            "local current = redis.call('zcard', KEYS[1]) " +

            // 3. 返回当前窗口内的请求数
            "return current";

        Integer current = redisTemplate.execute(
            new DefaultRedisScript<>(script, Integer.class),
            Collections.singletonList(redisKey),
            String.valueOf(windowStart)
        );

        int count = current != null ? current : 0;

        if (count >= maxCount) {
            return -1; // 被限流
        }

        // 4. 记录本次请求（使用时间戳降采样，避免精度浪费）
        long slot = (now / precisionMs) * precisionMs;
        redisTemplate.opsForZSet().add(redisKey, String.valueOf(slot), slot);

        // 5. 设置过期时间（等于窗口大小+精度）
        redisTemplate.expire(redisKey, windowMs + precisionMs,
            TimeUnit.MILLISECONDS);

        return maxCount - count - 1;
    }

    // 工厂方法
    public static Config perSecondLimit(int maxQps) {
        // QPS 限流：1 秒窗口，精度 100ms
        return new Config(maxQps, 1000, 100);
    }

    public static Config perMinuteLimit(int maxRpm) {
        // 每分钟限流：60 秒窗口，精度 1 秒
        return new Config(maxRpm, 60_000, 1000);
    }

    @Data
    @AllArgsConstructor
    public static class Config {
        private int maxCount;
        private long windowMs;
        private long precisionMs;
    }
}
```

### 网关层集成 Redis 限流（Spring Cloud Gateway）

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis-reactive</artifactId>
</dependency>
```

```yaml
# application.yml
spring:
  cloud:
    gateway:
      routes:
        - id: api-route
          uri: lb://backend-service
          predicates:
            - Path=/api/**
          filters:
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@userKeyResolver}"
                redis-rate-limiter.replenishRate: 100    # 每秒令牌填充数
                redis-rate-limiter.burstCapacity: 200    # 桶容量（最大突发）
                redis-rate-limiter.requestedTokens: 1    # 每次请求消耗令牌数
```

```java
@Configuration
public class GatewayRateLimiterConfig {

    // 限流 Key 解析器：基于用户 ID 或 IP
    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> {
            // 优先取用户 ID（登录用户）
            String userId = exchange.getRequest()
                .getHeaders().getFirst("X-User-Id");
            if (userId != null) {
                return Mono.just("user:" + userId);
            }
            // 匿名用户按 IP 限流
            String ip = exchange.getRequest()
                .getRemoteAddress().getAddress().getHostAddress();
            return Mono.just("ip:" + ip);
        };
    }

    // 自定义限流逻辑
    @Bean
    public RedisRateLimiter redisRateLimiter(
            ReactiveRedisTemplate<String, String> redisTemplate) {
        return new RedisRateLimiter(redisTemplate);
    }
}
```

### 生产级全局限流配置

```yaml
# 不同业务接口的限流策略
rate-limit:
  # API 通用限流
  api:
    default:  "100/s"      # 默认 API 限流
    sensitive: "10/s"       # 敏感接口（如删除）
    high-frequency: "500/s" # 高频接口（如查询、列表）

  # 用户维度的限流
  user:
    login:    "5/1m"        # 登录：每分钟 5 次
    register: "3/1m"        # 注册：每分钟 3 次
    sms-code: "1/1m"        # 短信验证码：每分钟 1 次

  # IP 维度的限流
  ip:
    common:   "1000/1m"     # 每分钟 1000 次
    sensitive: "30/1m"      # 敏感操作每分钟 30 次
```

---

## 本章总结

| 算法 | 特点 | 适用场景 |
|------|------|---------|
| **固定窗口** | 简单，但有边界突刺 | 非关键场景、访问统计 |
| **滑动窗口** | 精确，无突刺，内存占用高 | API 限流、登录限流 |
| **令牌桶** | 平滑，允许突发 | 网关限流、流量整形 |
| **漏桶** | 恒定速率，强制削峰 | 下游系统保护 |

**核心原则**：
1. **限流必然原子化**——所有限流操作必须通过 Lua 脚本，拆分命令必然出问题
2. **选择适合的限流维度**——按用户限流比全局限流更公平，按 IP 限流能防御 DDoS
3. **二级限流是终极方案**——Guava 本地限流扛 90% 的流量，Redis 全局限流做兜底
4. **返回友好的被限流信息**——HTTP 429 + Retry-After 头，让客户端知道什么时候重试

```java
@ExceptionHandler(RateLimitExceededException.class)
public ResponseEntity<Map<String, Object>> handleRateLimit(
        RateLimitExceededException e) {
    return ResponseEntity
        .status(429)
        .header("Retry-After", String.valueOf(e.getRetryAfterSeconds()))
        .body(Map.of(
            "code", 429,
            "message", "请求过于频繁，请 " + e.getRetryAfterSeconds() + " 秒后重试",
            "retryAfter", e.getRetryAfterSeconds()
        ));
}
```