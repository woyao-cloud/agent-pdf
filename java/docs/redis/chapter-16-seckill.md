# 第16章 电商秒杀系统：Redis 高并发与防超卖实战

## 16.1 秒杀系统的核心挑战

### 秒杀场景的技术特征

秒杀是电商系统中最极端的并发场景——**短时间内涌入百万级请求，但只有极少数人能成功下单**：

```
秒杀的"三高"特征：

  1. 高并发读
     商品详情页被瞬间大量访问，QPS 可达数十万到百万级
     读多写少，99% 的用户只是"看看"

  2. 高并发写
     开抢瞬间，大量用户同时点击"立即购买"
     写请求集中在同一个商品 ID 上

  3. 高一致性要求
     库存不能超卖（多卖一单就亏钱）
     一个用户只能买 N 件

  典型数据：
   ┌────────────────────────────────────┐
   │ 秒杀商品: iPhone 15 Pro            │
   │ 库存: 1000 台                       │
   │ 预约人数: 500,000                   │
   │ 开抢瞬间并发: 200,000 QPS           │
   │ 成功下单: 1000 人                   │
   │ 成功率: 0.2%                        │
   └────────────────────────────────────┘
```

### 传统架构的瓶颈

```
传统"从 DB 到 DB"的秒杀架构——必死无疑：

  200,000 QPS                               MySQL
  ───────────────────►  应用服务器            ──► 行锁等待！
                        ┌─────────┐               │
                        │ Tomcat  │               │ UPDATE stock SET
                        │ 线程池   │               │ count = count - 1
                        │ 200 线程 │               │ WHERE id = 1
                        └─────────┘               │ AND count > 0
                           │                      │
                           │                      ▼
                           │              行锁排队！同一时刻
                           │              只能执行一个 UPDATE
                           │              200 QPS 都扛不住！
```

**核心矛盾**：MySQL 的行锁机制决定了单行库存的更新吞吐量最多几百 QPS（4-8 核服务器的极限）。200,000 QPS 的请求如果全部打到 MySQL 上，DB 必然崩溃。

### Redis 在秒杀中的定位

```
Redis 在秒杀系统中的三层作用：

  请求入口                               Redis                            MySQL
    │                                      │                              │
    │ 200,000 QPS                          │                              │
    │                                      │                              │
    │ 第一层过滤：本地限流 + 限流            │                              │
    │ 阻挡 99% 无效请求                     │                              │
    │  → 5,000 QPS 到达 Redis              │                              │
    │                                      │                              │
    │                  第二层过滤：Redis 库存扣减                          │
    │                  Lua 脚本 + 原子操作                                │
    │                  → 1,000 QPS 进入下单                              │
    │                                      │                              │
    │                               Redis 库存扣减成功                    │
    │                               ───────────────────► 异步下单         │
    │                                                      │             │
    │                                                      ▼             │
    │                                                最终写入 MySQL      │
    │                                                只有 1000 条插入    │
    │                                                MySQL 完全扛得住     │
```

**核心思路**：Redis 作为**流量漏斗**，层层过滤请求。最终只有成功扣减库存的少数请求能到达 MySQL。

---

## 16.2 秒杀系统架构设计

### 整体架构

```
秒杀系统分层架构：

  ┌──────────────────────────────────────────────────────────────┐
  │  CDN / Nginx / 浏览器端限流                                   │
  │  静态资源缓存、按钮置灰、秒级限流                               │
  └────────────────────┬─────────────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────────────┐
  │  接入层：Spring Cloud Gateway / Nginx + Lua                   │
  │  第一层限流：全局限流 + 用户维度限流                             │
  │  QPS 从 200,000 → 20,000                                      │
  └────────────────────┬─────────────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────────────┐
  │  应用层：秒杀业务服务                                          │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ 1. 本地令牌桶（Guava RateLimiter）                     │  │
  │  │    每实例限流，挡住瞬时突刺，QPS 20,000 → 5,000        │  │
  │  │                                                       │  │
  │  │ 2. Redis 库存预加载 + 库存扣减（Lua 脚本）              │  │
  │  │    原子扣减，返回扣减结果                              │  │
  │  │                                                       │  │
  │  │ 3. 扣减成功 → 发送 MQ 消息，异步创建订单               │  │
  │  └────────────────────────────────────────────────────────┘  │
  └────────────────────┬─────────────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────────────┐
  │  消息队列：RocketMQ / RabbitMQ                                │
  │  削峰填谷，保证最终一致性                                      │
  └────────────────────┬─────────────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────────────┐
  │  数据层：MySQL                                                │
  │  只处理 1000 条实实在在的订单插入                               │
  │  完全不感知并发压力                                            │
  └──────────────────────────────────────────────────────────────┘
```

### 数据流

```
秒杀请求的完整生命周期：

  用户请求
    │
    ├── 第一关：Nginx 限流（每秒最多 10000 请求/IP）
    │    失败 → "请求过于频繁"
    │
    ├── 第二关：Gateway 限流（全局限流，总 QPS 上限）
    │    失败 → "排队人数过多，请稍后再试"
    │
    ├── 第三关：本地限流（Guava RateLimiter，每实例 2000 QPS）
    │    失败 → "系统繁忙"
    │
    ├── 第四关：验证秒杀资格（Redis String GET）
    │    - 活动是否已开始？ Redis GET seckill:activity:1001:start
    │    - 用户是否已购买？ Redis SISMEMBER seckill:1001:users uid
    │    - 用户购买次数限制？ Redis GET seckill:1001:user:uid:count
    │    失败 → "您已参与过该活动" / "活动还未开始"
    │
    ├── 第五关：Redis Lua 库存扣减（终极防线）
    │    脚本原子操作：
    │    1. GET seckill:stock:1001 → 剩余库存
    │    2. 如果库存 > 0 → DECR
    │    3. 记录用户已购买（SADD seckill:1001:users uid）
    │    4. 返回成功/失败
    │    失败 → "已售罄"
    │
    └── 成功 → 发送 MQ 消息 → 异步创建订单
```

---

## 16.3 库存预热

秒杀开始前，将数据库中的库存数据加载到 Redis 中。这是整个秒杀系统能够承受高并发的基础。

```java
@Service
public class SeckillStockPreheat {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private SeckillActivityMapper activityMapper;

    /**
     * 预热秒杀商品库存到 Redis
     *
     * 在秒杀活动开始前 5-10 分钟调用
     */
    @Transactional
    public void preheatStock(Long activityId) {
        // 1. 从数据库加载活动信息
        SeckillActivity activity = activityMapper.selectById(activityId);
        if (activity == null) {
            throw new IllegalArgumentException("活动不存在");
        }

        String stockKey = "seckill:stock:" + activityId;
        String userSetKey = "seckill:" + activityId + ":users";
        String infoKey = "seckill:info:" + activityId;

        // 2. 预热库存到 Redis
        //    使用 SETNX 防止重复预热（幂等）
        Boolean success = redisTemplate.opsForValue()
            .setIfAbsent(stockKey, String.valueOf(activity.getStock()));

        if (Boolean.TRUE.equals(success)) {
            log.info("库存预热成功: activityId={}, stock={}",
                activityId, activity.getStock());
        } else {
            log.warn("库存已预热，跳过: activityId={}", activityId);
            return;
        }

        // 3. 存储活动基本信息（预热 Redis）
        Map<String, String> info = new HashMap<>();
        info.put("title", activity.getTitle());
        info.put("startTime",
            String.valueOf(activity.getStartTime().getTime()));
        info.put("endTime",
            String.valueOf(activity.getEndTime().getTime()));
        info.put("totalStock", String.valueOf(activity.getStock()));
        info.put("limitPerUser",
            String.valueOf(activity.getLimitPerUser()));

        redisTemplate.opsForHash().putAll(infoKey, info);

        // 4. 设置库存 key 和活动信息的过期时间（活动结束后自动清理）
        long ttl = activity.getEndTime().getTime()
            - System.currentTimeMillis() + 86400_000L; // 额外加 1 天
        redisTemplate.expire(stockKey, ttl, TimeUnit.MILLISECONDS);
        redisTemplate.expire(infoKey, ttl, TimeUnit.MILLISECONDS);
        redisTemplate.expire(userSetKey, ttl, TimeUnit.MILLISECONDS);

        log.info("预热完成: activityId={}, 库存={}, TTL={}ms",
            activityId, activity.getStock(), ttl);
    }

    /**
     * 批量预热（多个活动同时开始）
     */
    public void batchPreheat(List<Long> activityIds) {
        activityIds.forEach(this::preheatStock);
    }

    /**
     * 回滚库存预热（活动取消时使用）
     */
    public void rollbackPreheat(Long activityId) {
        String stockKey = "seckill:stock:" + activityId;
        String userSetKey = "seckill:" + activityId + ":users";
        String infoKey = "seckill:info:" + activityId;

        redisTemplate.delete(stockKey, userSetKey, infoKey);
        log.info("已回滚预热: activityId={}", activityId);
    }
}
```

### 活动信息查询接口

```java
@RestController
@RequestMapping("/api/seckill")
public class SeckillActivityController {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 查询秒杀活动信息（直接从 Redis 读取，不查 DB）
    @GetMapping("/info/{activityId}")
    public ResponseEntity<Map<String, Object>> getActivityInfo(
            @PathVariable Long activityId) {

        String infoKey = "seckill:info:" + activityId;
        Map<Object, Object> info = redisTemplate.opsForHash()
            .entries(infoKey);

        if (info.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        // 查询当前可见库存（用于前台展示）
        String stockKey = "seckill:stock:" + activityId;
        String remainStock = redisTemplate.opsForValue().get(stockKey);

        Map<String, Object> result = new HashMap<>();
        result.put("activityId", activityId);
        result.put("title", info.get("title"));
        result.put("startTime", info.get("startTime"));
        result.put("endTime", info.get("endTime"));
        result.put("totalStock", info.get("totalStock"));
        result.put("remainStock",
            remainStock != null ? Integer.parseInt(remainStock) : 0);
        result.put("sold",
            Integer.parseInt((String) info.get("totalStock"))
            - (remainStock != null ? Integer.parseInt(remainStock) : 0));

        return ResponseEntity.ok(result);
    }
}
```

---

## 16.4 多层限流——保护 Redis 不被突发流量打垮

Redis 虽然快，但也扛不住 20 万 QPS 的集中写入。必须在到达 Redis 之前做多层限流。

### 网关层限流

```yaml
# application.yml —— 网关层限流配置
spring:
  cloud:
    gateway:
      routes:
        - id: seckill-route
          uri: lb://seckill-service
          predicates:
            - Path=/api/seckill/buy/**
          filters:
            - name: RequestRateLimiter
              args:
                # 全局令牌桶：每秒最多 5000 个请求
                redis-rate-limiter.replenishRate: 5000
                redis-rate-limiter.burstCapacity: 10000
                redis-rate-limiter.requestedTokens: 1
                key-resolver: "#{@seckillKeyResolver}"
```

```java
@Configuration
public class SeckillGatewayConfig {

    @Bean
    public KeyResolver seckillKeyResolver() {
        // 秒杀接口全局限流（所有用户共享一个桶）
        return exchange -> Mono.just("seckill:global");
    }
}
```

### 应用层限流（Guava）

```java
@Component
public class SeckillRateLimiter {

    // 每台实例：每秒最多 1000 次秒杀请求
    private final RateLimiter instanceLimiter =
        RateLimiter.create(1000);

    // 每用户：每秒最多 1 次秒杀请求（本地版）
    private final Cache<String, RateLimiter> userLimiters =
        Caffeine.newBuilder()
            .maximumSize(100000)
            .expireAfterWrite(1, TimeUnit.MINUTES)
            .build();

    /**
     * 实例级限流（保护本机不被突发流量打满）
     */
    public boolean tryAcquireInstance() {
        return instanceLimiter.tryAcquire();
    }

    /**
     * 用户级限流（防止脚本刷单）
     * 每个用户每秒最多 1 次秒杀请求
     */
    public boolean tryAcquireUser(Long userId) {
        RateLimiter userLimiter = userLimiters.get(
            "user:" + userId, k -> RateLimiter.create(1));
        return userLimiter.tryAcquire();
    }

    /**
     * 完整的两级限流检查
     */
    public boolean checkRateLimit(Long userId) {
        if (!tryAcquireInstance()) {
            log.warn("实例限流触发: 当前 QPS 超过阈值");
            return false;
        }
        if (!tryAcquireUser(userId)) {
            log.warn("用户限流触发: userId={}", userId);
            return false;
        }
        return true;
    }
}
```

---

## 16.5 核心：Redis Lua 库存扣减（防超卖终极方案）

这是秒杀系统最关键的代码——**用 Lua 脚本保证库存扣减的原子性**，同时验证所有业务规则。

```lua
-- seckill_stock.lua —— 秒杀库存扣减脚本
-- KEYS[1]: 库存 key (seckill:stock:activityId)
-- KEYS[2]: 用户集合 key (seckill:activityId:users)
-- KEYS[3]: 用户购买次数 key (seckill:activityId:user:userId:count)
-- ARGV[1]: 用户 ID
-- ARGV[2]: 每人限购数量
-- ARGV[3]: 当前时间戳
-- ARGV[4]: 活动开始时间戳
-- ARGV[5]: 活动结束时间戳

-- 1. 检查活动时间
if tonumber(ARGV[3]) < tonumber(ARGV[4]) then
    return {0, "活动尚未开始"}
end
if tonumber(ARGV[3]) > tonumber(ARGV[5]) then
    return {0, "活动已结束"}
end

-- 2. 检查用户是否已购买过（防重复购买）
local isMember = redis.call('sismember', KEYS[2], ARGV[1])
if isMember == 1 then
    return {0, "您已参与过该活动"}
end

-- 3. 检查用户购买次数（同一活动多件商品场景）
local buyCount = redis.call('get', KEYS[3])
if buyCount and tonumber(buyCount) >= tonumber(ARGV[2]) then
    return {0, "已达到购买上限"}
end

-- 4. 扣减库存（DECR 是原子操作）
local remain = redis.call('decr', KEYS[1])
if remain < 0 then
    -- 库存不足！回滚 DECR（INCR 回去）
    redis.call('incr', KEYS[1])
    return {0, "已售罄"}
end

-- 5. 记录用户已购买
redis.call('sadd', KEYS[2], ARGV[1])

-- 6. 记录用户购买次数
if buyCount then
    redis.call('incr', KEYS[3])
else
    redis.call('set', KEYS[3], 1)
    redis.call('expire', KEYS[3], 86400) -- 24小时后过期
end

-- 7. 返回成功（剩余库存）
return {1, remain}
```

```java
@Service
public class SeckillService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private SeckillRateLimiter rateLimiter;

    @Autowired
    private RocketMQTemplate rocketMQTemplate;

    // 加载 Lua 脚本（应用启动时加载一次，后续用 EVALSHA）
    private final DefaultRedisScript<List> stockScript;

    public SeckillService() {
        stockScript = new DefaultRedisScript<>();
        stockScript.setScriptSource(new ResourceScriptSource(
            new ClassPathResource("lua/seckill_stock.lua")));
        stockScript.setResultType(List.class);
    }

    /**
     * 秒杀入口
     *
     * @param activityId 活动 ID
     * @param userId     用户 ID
     * @return 秒杀结果
     */
    public SeckillResult buy(Long activityId, Long userId) {
        // 第一关：限流
        if (!rateLimiter.checkRateLimit(userId)) {
            return SeckillResult.fail(SeckillCode.TOO_MANY_REQUEST,
                "请求过于频繁");
        }

        // 第二关：获取活动信息（从 Redis，不查 DB）
        String infoKey = "seckill:info:" + activityId;
        Map<Object, Object> info = redisTemplate.opsForHash()
            .entries(infoKey);

        if (info.isEmpty()) {
            return SeckillResult.fail(SeckillCode.ACTIVITY_NOT_FOUND,
                "活动不存在");
        }

        long startTime = Long.parseLong(
            (String) info.get("startTime"));
        long endTime = Long.parseLong(
            (String) info.get("endTime"));
        int limitPerUser = Integer.parseInt(
            (String) info.get("limitPerUser"));

        // 第三关：Redis Lua 库存扣减（终极防线）
        List<Object> result = redisTemplate.execute(stockScript,
            Arrays.asList(
                "seckill:stock:" + activityId,           // KEYS[1]
                "seckill:" + activityId + ":users",      // KEYS[2]
                "seckill:" + activityId + ":user:" + userId  // KEYS[3]
            ),
            String.valueOf(userId),                     // ARGV[1]
            String.valueOf(limitPerUser),               // ARGV[2]
            String.valueOf(System.currentTimeMillis()), // ARGV[3]
            String.valueOf(startTime),                  // ARGV[4]
            String.valueOf(endTime)                      // ARGV[5]
        );

        boolean success = false;
        String message = "未知错误";

        if (result != null && result.size() >= 2) {
            success = Integer.valueOf(1)
                .equals(result.get(0));
            message = (String) result.get(1);
        }

        if (!success) {
            return SeckillResult.fail(SeckillCode.STOCK_INSUFFICIENT,
                message);
        }

        // 第四关：扣减成功 → 发送 MQ 消息异步创建订单
        SeckillOrderMessage msg = new SeckillOrderMessage();
        msg.setActivityId(activityId);
        msg.setUserId(userId);
        msg.setTimestamp(System.currentTimeMillis());
        msg.setRemainStock(Integer.parseInt(
            (String) result.get(1)));

        rocketMQTemplate.convertAndSend(
            "seckill-order-topic", msg);

        log.info("秒杀成功: activityId={}, userId={}, remainStock={}",
            activityId, userId, result.get(1));

        return SeckillResult.success("秒杀成功，正在为您创建订单");
    }

    /**
     * 秒杀结果 DTO
     */
    @Data
    @AllArgsConstructor
    public static class SeckillResult {
        private boolean success;
        private int code;
        private String message;

        public static SeckillResult success(String message) {
            return new SeckillResult(true, 200, message);
        }

        public static SeckillResult fail(SeckillCode code,
                String message) {
            return new SeckillResult(false, code.getCode(), message);
        }
    }

    public enum SeckillCode {
        TOO_MANY_REQUEST(429, "请求过于频繁"),
        ACTIVITY_NOT_FOUND(404, "活动不存在"),
        STOCK_INSUFFICIENT(400, "库存不足");

        private final int code;
        private final String desc;
        SeckillCode(int code, String desc) {
            this.code = code;
            this.desc = desc;
        }
        public int getCode() { return code; }
    }
}
```

### 为什么 Lua 脚本能保证不超卖？

```
Lua 脚本的原子性确保了"查库存 → 判断 → 扣减"三步是原子的

  ❌ 错误做法：三段式代码（不原子）

    库存 = GET seckill:stock:1001     -- 读到 1
    IF 库存 > 0:                       -- 真
        请求 A 和请求 B 同时读到了库存=1！
        DECR seckill:stock:1001        -- 都扣成了 -1！超卖！
    END IF


  ✅ 正确做法：Lua 脚本（原子操作）

    脚本执行期间，所有其他客户端的命令都被阻塞
    相当于在一个事务中完成了 GET → IF → DECR 三步
    Redis 单线程特性保证同一时刻只有一个脚本在执行

    脚本内部：
    local remain = redis.call('get', stockKey)  -- 读到 1
    if remain > 0 then
        redis.call('decr', stockKey)             -- 扣成 0
        return 1                                  -- 成功
    else
        return 0                                  -- 已售罄
    end
    -- 不可能有两个请求同时读到 1，因为脚本是原子的！
```

### 为什么用 `DECR` + 回滚，而不是 `SETNX` 或 `WATCH`？

| 方案 | 问题 |
|------|------|
| `WATCH` + `MULTI` + 乐观锁 | 并发高时冲突率极高，大量重试浪费性能 |
| `SETNX` 锁库存 | 需要额外维护锁，复杂度高 |
| **`DECR` + 负数回滚** | **最简单，不超卖，无锁竞争** |

**`DECR` 精髓**：即使 100 万并发同时 `DECR`，Redis 单线程保证每个 `DECR` 都是原子执行的。返回负数说明超扣了，`INCR` 回去即可——**永远不会超卖**。

---

## 16.6 异步下单——MQ 削峰填谷

扣减库存成功 ≠ 订单创建成功。如果扣减成功后直接写 MySQL，MySQL 可能仍会被瞬间涌入的 1000 个请求打满。因此必须**异步下单**。

### MQ 消费者

```java
@Component
@RocketMQMessageListener(
    topic = "seckill-order-topic",
    consumerGroup = "seckill-order-consumer",
    consumeMode = ConsumeMode.ORDERLY, // 顺序消费，保证同一活动的订单有序
    maxReconsumeTimes = 3
)
public class SeckillOrderConsumer
        implements RocketMQListener<SeckillOrderMessage> {

    @Autowired
    private OrderService orderService;

    @Autowired
    private SeckillStockFallback stockFallback;

    @Override
    public void onMessage(SeckillOrderMessage message) {
        log.info("收到秒杀订单消息: activityId={}, userId={}",
            message.getActivityId(), message.getUserId());

        try {
            // 1. 查数据库，确认库存是否真实存在（防重复消息）
            if (orderService.existsOrder(
                    message.getActivityId(), message.getUserId())) {
                log.warn("订单已存在，跳过: activityId={}, userId={}",
                    message.getActivityId(), message.getUserId());
                return;
            }

            // 2. 创建订单（插入 MySQL）
            Order order = orderService.createSeckillOrder(
                message.getActivityId(),
                message.getUserId());

            log.info("订单创建成功: orderId={}", order.getId());

        } catch (Exception e) {
            log.error("订单创建失败: activityId={}, userId={}",
                message.getActivityId(), message.getUserId(), e);

            // 3. 创建失败 -> 回滚 Redis 库存
            //    注意：重试时不会重复回滚（幂等设计）
            stockFallback.rollbackStock(
                message.getActivityId(),
                message.getUserId());

            // 抛出异常 -> MQ 重试
            throw new RuntimeException("订单创建失败", e);
        }
    }
}
```

### 库存回滚（幂等设计）

```java
@Component
public class SeckillStockFallback {

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 回滚库存（订单创建失败时调用）
     *
     * 幂等性保证：
     *   如果用户已从"已购买集合"中移除，说明已回滚过
     *   不会重复回滚
     */
    public void rollbackStock(Long activityId, Long userId) {
        String userSetKey = "seckill:" + activityId + ":users";
        String stockKey = "seckill:stock:" + activityId;
        String countKey = "seckill:" + activityId + ":user:" + userId;

        // Lua 脚本：原子化的回滚操作
        String script =
            "local removed = redis.call('srem', KEYS[1], ARGV[1]) " +
            "if removed == 1 then " +
            "    redis.call('incr', KEYS[2]) " +
            "    redis.call('del', KEYS[3]) " +
            "    return 1 " +
            "end " +
            "return 0";

        DefaultRedisScript<Long> rollbackScript =
            new DefaultRedisScript<>(script, Long.class);

        Long result = redisTemplate.execute(rollbackScript,
            Arrays.asList(userSetKey, stockKey, countKey),
            String.valueOf(userId));

        if (Long.valueOf(1).equals(result)) {
            log.info("库存已回滚: activityId={}, userId={}",
                activityId, userId);
        }
    }
}
```

---

## 16.7 秒杀结果查询——轮询 vs 推送

用户秒杀成功后，不能立即返回订单 ID（订单是异步创建的）。用户需要等待几秒才能看到订单。这里需要设计合理的"等待"机制。

```java
@RestController
@RequestMapping("/api/seckill/result")
public class SeckillResultController {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private OrderService orderService;

    /**
     * 查询秒杀结果
     *
     * 设计思路：
     *   - 用 Redis 做"状态缓存"，避免用户轮询打到 DB
     *   - 秒杀成功时写入 Redis：seckill:result:activityId:userId
     *   - 值：0=处理中, 1=成功(orderId), -1=失败
     *   - 异步下单完成后更新状态
     */
    @GetMapping("/{activityId}/{userId}")
    public ResponseEntity<Map<String, Object>> getResult(
            @PathVariable Long activityId,
            @PathVariable Long userId) {

        String resultKey = "seckill:result:" + activityId + ":" + userId;

        // 从 Redis 获取秒杀结果状态
        String status = redisTemplate.opsForValue().get(resultKey);

        Map<String, Object> response = new HashMap<>();

        if (status == null) {
            // 没有状态记录 -> 说明没有参与秒杀
            response.put("status", -1);
            response.put("message", "未参与该活动");
            return ResponseEntity.ok(response);
        }

        int code = Integer.parseInt(status);
        response.put("status", code);

        switch (code) {
            case 0:
                response.put("message", "订单处理中，请稍候...");
                response.put("retryAfter", 2); // 建议 2 秒后重试
                break;
            case 1:
                // 从 Redis 获取订单号（MQ 消费者写入）
                String orderId = redisTemplate.opsForValue()
                    .get(resultKey + ":order");
                response.put("message", "秒杀成功");
                response.put("orderId", orderId);
                break;
            case -1:
                response.put("message", "订单创建失败，库存已退回");
                break;
        }

        return ResponseEntity.ok(response);
    }
}
```

### 订单创建完成后更新状态

在 MQ 消费者（`SeckillOrderConsumer`）的 `onMessage` 方法中补充：

```java
// 订单创建成功后，更新 Redis 状态
String resultKey = "seckill:result:" + activityId + ":" + userId;
redisTemplate.opsForValue().set(resultKey, "1", 1, TimeUnit.DAYS);
redisTemplate.opsForValue().set(
    resultKey + ":order", String.valueOf(order.getId()),
    1, TimeUnit.DAYS);
log.info("秒杀结果已更新: userId={}, orderId={}", userId, order.getId());
```

---

## 16.8 超卖防御体系总结

### 四道防线

```
秒杀系统的超卖防御体系：

  第 1 道：正向库存校验（Redis DECR）
    ┌────────────────────────────────────────┐
    │  Lua 脚本原子扣减                       │
    │  DECR 后判断负数 → INCR 回滚            │
    │  保证：任何时候库存 >= 0                │
    └────────────────────────────────────────┘

  第 2 道：用户限购校验（Redis SADD + SET）
    ┌────────────────────────────────────────┐
    │  Lua 脚本检查用户是否已购买              │
    │  SISMEMBER 用户集合                     │
    │  保证：一个用户不能重复购买               │
    └────────────────────────────────────────┘

  第 3 道：订单幂等检查（MySQL）
    ┌────────────────────────────────────────┐
    │  MQ 消费者先查订单是否存在               │
    │  SELECT EXISTS order WHERE...          │
    │  保证：MQ 重复消息不创建重复订单          │
    └────────────────────────────────────────┘

  第 4 道：库存回滚机制（Redis + Lua）
    ┌────────────────────────────────────────┐
    │  订单创建失败 → 回滚 Redis 库存          │
    │  幂等设计：SREM 成功才算回滚             │
    │  保证：失败的订单释放库存给其他人          │
    └────────────────────────────────────────┘
```

### 为什么这套方案不会超卖？

```
一个极端的例子：

  库存：1 件
  并发：100 万请求同时来

  流程：
  1. 100 万请求经过限流 → 约 5000 到达 Redis
  2. 5000 个请求同时执行 Lua 脚本
  3. Redis 单线程执行 DECR：
     第 1 个请求：DECR → 0，返回成功
     第 2 个请求：DECR → -1，INCR 回滚到 0，返回失败
     第 3 个请求：DECR → -1，INCR 回滚到 0，返回失败
     ... 4999 个请求全部返回失败
     第 5000 个请求：DECR → -1，回滚
  4. 最终：卖了 1 件，库存 0
  5. 绝不超卖！

  关键：DECR 是原子的，Redis 单线程执行。即使 100 万请求同时来，
        DECR 也是一次减 1，不会出现"两个请求同时读到 1"的情况。
```

### 性能数据参考

```
单台 Redis（主节点）的秒杀处理能力：

  纯 Lua 扣减（无其他逻辑）：
    DECR + 条件判断 + SADD
    → 每个请求 ~0.05ms
    → 单节点理论吞吐 ~20,000 QPS

  完整 Lua 脚本（含活动时间、用户检查、限购检查）：
    → 每个请求 ~0.2ms
    → 单节点理论吞吐 ~5,000 QPS

  Redis Cluster（3 主 3 从）：
    → 多节点同时处理不同活动的秒杀
    → 每个活动独立库存 key，天然隔离
    → 总吞吐 ≈ 3 × 单节点吞吐
```

---

## 本章总结

| 层次 | 技术 | 作用 | 性能 |
|------|------|------|------|
| **第一层** | Nginx + Gateway 限流 | 挡住 90% 无效流量 | 百万 QPS |
| **第二层** | Guava 本地限流 | 防止实例过载 | 1000 QPS/实例 |
| **第三层** | Redis 库存预热 + Lua 原子扣减 | 防超卖核心 | 5000 QPS |
| **第四层** | MQ 异步下单 | 削峰填谷 | 按需扩展 |
| **第五层** | MySQL 订单写入 | 最终持久化 | 1000 TPS |

**核心原则**：
1. **Redis 是秒杀系统的核心**——用 Redis 的原子操作扛住 99% 的并发压力，MySQL 只处理最终成功的少数请求
2. **Lua 脚本是防超卖的唯一正确方式**——三次网络往返（GET→IF→DECR）在并发下一定会出问题，必须用脚本原子化
3. **DECR + 回滚是最简单可靠的扣减方案**——不需要分布式锁、不需要乐观锁重试，一个 DECR 搞定
4. **异步下单是必须的**——即使只有 1000 个成功请求，同步写 MySQL 也可能出现性能抖动
5. **幂等设计是最后一道防线**——MQ 重复消息、回滚多次调用、用户重复点击，都要保证不会造成数据错误