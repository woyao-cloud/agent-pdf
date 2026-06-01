# 第3章 分布式缓存（Cache）场景

## 3.1 实现原理：旁路缓存模式

### Cache Aside 模式

Redis 作为分布式缓存最经典的用法是 **Cache Aside（旁路缓存）** 模式。这个模式下，应用程序同时持有缓存（Redis）和数据库（如 MySQL），读写流程如下：

```
读流程（Cache Aside）：
  客户端                       应用服务                     Redis                      MySQL
    │                          │                          │                         │
    │   GET user:1001          │                          │                         │
    │ ──────────────────────►  │                          │                         │
    │                          │  GET user:1001            │                         │
    │                          │ ──────────────────────►   │                         │
    │                          │                          │                         │
    │                          │  ◄── miss (不存在)       │                         │
    │                          │                          │                         │
    │                          │  SELECT * FROM users WHERE id=1001                  │
    │                          │ ─────────────────────────────────────────────►      │
    │                          │                                                      │
    │                          │  ◄────── user data                                   │
    │                          │                                                      │
    │                          │  SET user:1001 "{data}" (写入缓存，设过期时间)         │
    │                          │ ──────────────────────►                              │
    │                          │                          │                         │
    │  ◄── {user data}        │                          │                         │
    │ ◄────────────────────── │                          │                         │
```

```
写流程（Cache Aside）：
  客户端                       应用服务                     Redis                      MySQL
    │                          │                          │                         │
    │  更新用户信息             │                          │                         │
    │ ──────────────────────►  │                          │                         │
    │                          │  UPDATE users SET ... WHERE id=1001                  │
    │                          │ ─────────────────────────────────────────────►      │
    │                          │                          │                         │
    │                          │  DEL user:1001 (删除缓存，不是更新缓存！)              │
    │                          │ ──────────────────────►  │                         │
    │                          │                          │                         │
    │  ◄── OK                 │                          │                         │
```

**为什么更新数据库后是删除缓存，而不是更新缓存？** 这是 Cache Aside 模式最反直觉但最关键的设计。原因有两个：

1. **并发写冲突**：两个线程同时更新同一条数据，如果先更新缓存，后写数据库，缓存里就是错误的值
2. **写操作频率低**：缓存可能被读 1000 次才写 1 次。如果每次写都更新缓存，大部分更新操作其实是被浪费的（缓存可能很快就被淘汰了）

### Java 实现：Cache Aside 标准代码

```java
@Service
public class UserCacheService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private UserMapper userMapper;

    private static final long CACHE_TTL = 3600; // 1 小时

    // 读：先查缓存，miss 则查 DB 并回写
    public User getUser(Long id) {
        String cacheKey = "user:" + id;

        // 1. 先查缓存
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            // 缓存命中，直接返回
            return JSON.parseObject(cached, User.class);
        }

        // 2. 缓存 miss，查数据库
        User user = userMapper.selectById(id);
        if (user == null) {
            return null;
        }

        // 3. 回写缓存，设过期时间
        redisTemplate.opsForValue().set(
            cacheKey,
            JSON.toJSONString(user),
            CACHE_TTL,
            TimeUnit.SECONDS
        );
        return user;
    }

    // 写：先更新 DB，再删除缓存
    @Transactional
    public void updateUser(User user) {
        // 1. 先更新数据库
        userMapper.updateById(user);

        // 2. 再删除缓存（不是更新缓存）
        redisTemplate.delete("user:" + user.getId());
    }
}
```

### Cache Aside 的极端并发不一致场景

虽然 "先更新 DB 再删除缓存" 在大多数情况下是正确的，但在极端并发下仍然存在缓存不一致的窗口：

```
并发不一致的时间线：
  时间 │ 线程 A（读）                   │ 线程 B（写）
  ─────┼────────────────────────────────┼─────────────────────
   T1  │ 缓存 miss，读 DB → 得到 old    │
   T2  │                                │ 更新 DB (new)
   T3  │                                │ 删除缓存
   T4  │ 将 old 数据写入缓存            │
       │ ❌ 缓存中永久是脏数据了！       │
```

这个问题的根因是：**读操作的"回写缓存"发生在写操作的"删除缓存"之后**。解决方案有两种：

**方案一：延迟双删**
```java
@Transactional
public void updateUserWithDelayDelete(User user) {
    // 1. 先删除缓存（第一次删除）
    redisTemplate.delete("user:" + user.getId());

    // 2. 更新数据库
    userMapper.updateById(user);

    // 3. 延迟一段时间后再次删除缓存
    //    确保在回写竞争窗口内被 Set 的脏数据被清理
    executorService.schedule(() -> {
        redisTemplate.delete("user:" + user.getId());
    }, 500, TimeUnit.MILLISECONDS);
}
```

**方案二：异步 Binlog 订阅（推荐）** → 详见第 8 章

> **实战建议**：对于绝大多数业务场景，Cache Aside + 过期时间就足够了。延迟双删属于"防御性设计"。如果对一致性要求极高，应该使用第 8 章的 Canal + MQ 方案，而不是在业务代码里堆砌延迟删除逻辑。

---

## 3.2 潜在风险与应对（三大缓存问题）

### 缓存穿透（Cache Penetration）

**问题**：查询一个**肯定不存在**的数据。缓存 miss → DB 也没有 → 不写缓存（因为值为空）。每次查询都打到数据库。

```
缓存穿透：
  攻击者         Redis              MySQL
    │              │                  │
    │ GET user:-1  │                  │
    │ ──────────►  │                  │
    │  ◄── miss    │                  │
    │              │ SELECT id=-1     │
    │              │ ──────────────►  │
    │              │    ◄── 空结果    │
    │              │                  │
    │ GET user:-2  │                  │
    │ ──────────►  │                  │
    │  ◄── miss    │                  │
    │              │ SELECT id=-2     │
    │              │ ──────────────►  │
    │              │    ◄── 空结果    │
    │              │                  │
    │              │      ... 持续恶意查询 ...  DB 被打挂 │
```

**解决方案一：空值缓存**
```java
public User getUserWithNullCache(Long id) {
    String cacheKey = "user:" + id;

    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        // 即使是空值标记，也说明查过了，直接返回
        if ("NULL_VALUE".equals(cached)) {
            return null;
        }
        return JSON.parseObject(cached, User.class);
    }

    User user = userMapper.selectById(id);
    if (user == null) {
        // 缓存空值，设置较短的过期时间（防止 DB 有数据后缓存还空着）
        redisTemplate.opsForValue().set(
            cacheKey, "NULL_VALUE", 60, TimeUnit.SECONDS);
        return null;
    }

    redisTemplate.opsForValue().set(
        cacheKey, JSON.toJSONString(user), 3600, TimeUnit.SECONDS);
    return user;
}
```

**解决方案二：布隆过滤器（Bloom Filter）** — 在缓存前面再加一道防线：

```
布隆过滤器工作原理：
             hash1    hash2    hash3
               │        │        │
  user:1001 ──►├──┬─────┼──┬─────┼──┬────►
               │  │     │  │     │  │
               ▼  │     ▼  │     ▼  │
  bit array:  [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, ...]
                  │     │     │
                  └─────┴─────┘
                三个位都置为 1

  查询 user:-1：
             hash1    hash2    hash3
               │        │        │
  user:-1 ────►├──┬─────┼──┬─────┼──┬────►
               │  │     │  │     │  │
               ▼  │     ▼  │     ▼  │
  bit array:  [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, ...]
                  │     │     │
               位 0!  位 0!  位 1!
               └──────────────┘
              有一个位为 0 → 一定不存在！

  特点：
    ✅ 说"不存在" → 一定不存在
    ❌ 说"存在" → 可能不存在（误判率，可配置）
    空间效率：1000 万个 key，1% 误判率 ≈ 11.5 MB
```

```java
// Redisson 内置布隆过滤器
@Configuration
public class BloomFilterConfig {

    @Autowired
    private RedissonClient redisson;

    @Bean
    public RBloomFilter<Long> userIdBloomFilter() {
        RBloomFilter<Long> bloomFilter = redisson
            .getBloomFilter("bloom:user:id");

        // 初始化：预计 1000 万用户，误判率 1%
        bloomFilter.tryInit(10_000_000L, 0.01);

        // 启动时加载所有用户 ID 到布隆过滤器
        List<Long> allUserIds = userMapper.selectAllIds();
        allUserIds.forEach(bloomFilter::add);

        return bloomFilter;
    }
}

@Service
public class UserServiceWithBloomFilter {

    @Autowired
    private RBloomFilter<Long> bloomFilter;

    public User getUser(Long id) {
        // 第一道防线：布隆过滤器
        if (!bloomFilter.contains(id)) {
            // 一定不存在，直接返回，不查缓存也不查 DB
            return null;
        }

        // 第二道防线：缓存
        // 第三道防线：DB
        return getUserFromCacheOrDb(id);
    }
}
```

### 缓存击穿（Cache Breakdown / Hotkey Invalid）

**问题**：一个**热点 Key** 在过期瞬间，大量并发请求同时打到数据库。

```
缓存击穿：
  ┌─────────────────────────────────────────────────┐
  │  热点 Key "秒杀商品:1001" 在 TTL 到期瞬间        │
  │                                                  │
  │  时间线:                                          │
  │  T0: 缓存过期                                    │
  │  T1: 请求1 查缓存 miss → 查 DB                   │
  │  T2: 请求2 查缓存 miss → 查 DB ← 同时！          │
  │  T3: 请求3 查缓存 miss → 查 DB ← 同时！          │
  │  T4: 请求N 查缓存 miss → 查 DB ← 同时！          │
  │                                                  │
  │  结果：N 个请求同时打到 DB，DB 连接池打满         │
  │  一般 N 在 100-10000 之间，取决于并发量          │
  └─────────────────────────────────────────────────┘
```

**解决方案一：互斥锁（Mutex Lock）**

```java
public String getHotDataWithMutex(String key) {
    String cacheKey = "hot:" + key;

    // 1. 先查缓存
    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        return cached;
    }

    // 2. 缓存 miss，加分布式锁，只让一个线程去查 DB
    String lockKey = "lock:" + key;
    String lockValue = UUID.randomUUID().toString();
    Boolean locked = redisTemplate.opsForValue()
        .setIfAbsent(lockKey, lockValue, 3, TimeUnit.SECONDS);

    if (Boolean.TRUE.equals(locked)) {
        try {
            // 再次检查缓存（double check，防止等待锁期间缓存已被其他线程重建）
            cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return cached;
            }

            // 查数据库
            String value = queryDatabase(key);

            // 回写缓存
            redisTemplate.opsForValue().set(
                cacheKey, value, 3600, TimeUnit.SECONDS);
            return value;
        } finally {
            // Lua 脚本原子释放锁
            String script =
                "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                "return redis.call('del', KEYS[1]) else return 0 end";
            redisTemplate.execute(
                new DefaultRedisScript<>(script, Long.class),
                Collections.singletonList(lockKey),
                lockValue
            );
        }
    } else {
        // 3. 没拿到锁，说明其他线程正在重建缓存
        //    等待 50ms 后重试
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return getHotDataWithMutex(key); // 递归重试
    }
}
```

**解决方案二：逻辑过期（永不过期 + 异步刷新）**—— 不设置 TTL，而是存一个过期时间在 Value 里：

```java
// Value 结构：实际数据 + 逻辑过期时间
@Data
public class CacheWrapper<T> {
    private T data;
    private long expireTime; // 逻辑过期时间戳（毫秒）

    public boolean isExpired() {
        return System.currentTimeMillis() > expireTime;
    }
}

@Service
public class HotDataService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long CACHE_TTL = 3600_000L; // 逻辑 1 小时
    private static final ExecutorService refreshPool =
        Executors.newFixedThreadPool(5);

    public String getHotData(String key) {
        String cacheKey = "hot:" + key;
        String cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached == null) {
            // 缓存没有 → 同步加载（首次加载不算击穿）
            return loadDataSync(key, cacheKey);
        }

        CacheWrapper<String> wrapper = JSON.parseObject(cached,
            new TypeReference<CacheWrapper<String>>() {});

        if (!wrapper.isExpired()) {
            // 逻辑未过期，直接返回
            return wrapper.getData();
        }

        // 逻辑过期 → 异步刷新，旧数据继续使用
        // 这样在缓存刷新期间，请求不会打到 DB
        refreshPool.submit(() -> {
            String freshData = queryDatabase(key);
            CacheWrapper<String> freshWrapper = new CacheWrapper<>();
            freshWrapper.setData(freshData);
            freshWrapper.setExpireTime(
                System.currentTimeMillis() + CACHE_TTL);
            redisTemplate.opsForValue().set(
                cacheKey, JSON.toJSONString(freshWrapper));
        });

        // 返回旧数据（允许短暂的不一致）
        return wrapper.getData();
    }

    private String loadDataSync(String key, String cacheKey) {
        String data = queryDatabase(key);
        CacheWrapper<String> wrapper = new CacheWrapper<>();
        wrapper.setData(data);
        wrapper.setExpireTime(System.currentTimeMillis() + CACHE_TTL);
        redisTemplate.opsForValue().set(
            cacheKey, JSON.toJSONString(wrapper));
        return data;
    }
}
```

### 缓存雪崩（Cache Avalanche）

**问题**：大量 Key 在同一时间过期，或 Redis 实例宕机，导致所有请求全部打到数据库。

```
缓存雪崩的两种场景：

  场景一：大量 Key 同时过期
  ┌──────────────────────────────────────────┐
  │  T0: key:1001 过期                        │
  │  T0: key:1002 过期                        │
  │  T0: key:1003 过期                        │
  │  ...（同时设置的 TTL）                      │
  │  T0+1ms: 所有读请求全部 miss → 全部打到 DB │
  │  → DB 连接池被打满，响应变慢 → 连锁故障    │
  └──────────────────────────────────────────┘

  场景二：Redis 宕机
  ┌──────────────────────────────────────────┐
  │  T0: Redis 实例宕机                       │
  │  T0+1ms: 所有请求缓存不可用               │
  │  → 全部打到 DB                           │
  │  → DB 扛不住也挂了                       │
  │  → 服务整体不可用                        │
  └──────────────────────────────────────────┘
```

**解决方案一：随机过期时间**
```java
// 设置缓存时，在基础 TTL 上增加随机值
public void setWithRandomTtl(String key, String value, long baseTtl) {
    long random = ThreadLocalRandom.current()
        .nextLong(baseTtl / 2); // 随机增加 0 ~ baseTtl/2
    redisTemplate.opsForValue().set(
        key, value, baseTtl + random, TimeUnit.SECONDS);
}

// 批量初始化缓存
public void batchInitCache() {
    List<User> users = userMapper.selectAll();
    users.forEach(user -> {
        String key = "user:" + user.getId();
        // 基础 1 小时，随机增加 0-30 分钟
        // 1000 个用户均匀分布在 60-90 分钟内过期
        setWithRandomTtl(key, JSON.toJSONString(user), 3600);
    });
}
```

**解决方案二：多级缓存架构**

```
多级缓存请求链路：
  客户端 → Nginx/LVS → 应用服务
                         │
                         ├── 第一级：本地缓存（Caffeine）
                         │    响应时间 < 1ms，无网络开销
                         │    容量：~100MB，存储最热门的 1% 数据
                         │    命中率：~30-40%
                         │
                         ├── 第二级：Redis 分布式缓存
                         │    响应时间 1-5ms
                         │    容量：~10GB，存储 80% 热点数据
                         │    命中率：~50-60% （含第一级未命中的）
                         │
                         └── 第三级：MySQL 数据库
                              最终保底，扛 5-10% 的流量
```

```xml
<!-- pom.xml 依赖 -->
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
    <version>3.1.8</version>
</dependency>
```

```java
@Configuration
public class MultiLevelCacheConfig {

    // 一级缓存：Caffeine 本地缓存
    @Bean
    public Cache<String, String> localCache() {
        return Caffeine.newBuilder()
            .maximumSize(10_000)              // 最多 10000 个条目
            .expireAfterWrite(30, TimeUnit.SECONDS) // 写后 30 秒过期
            .recordStats()                     // 开启命中率统计
            .build();
    }

    // 二级缓存：Redis
    @Bean
    public StringRedisTemplate redisTemplate(
            RedisConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }
}

@Service
public class MultiLevelCacheService {

    @Autowired
    private Cache<String, String> localCache;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private UserMapper userMapper;

    public User getUser(Long id) {
        String key = "user:" + id;

        // 1. 一级缓存（本地）
        String localVal = localCache.getIfPresent(key);
        if (localVal != null) {
            return JSON.parseObject(localVal, User.class);
        }

        // 2. 二级缓存（Redis）
        String redisVal = redisTemplate.opsForValue().get(key);
        if (redisVal != null) {
            // 回填一级缓存
            localCache.put(key, redisVal);
            return JSON.parseObject(redisVal, User.class);
        }

        // 3. 三级保底（DB）
        User user = userMapper.selectById(id);
        if (user != null) {
            String json = JSON.toJSONString(user);
            // 回填两级缓存
            redisTemplate.opsForValue().set(
                key, json, 3600, TimeUnit.SECONDS);
            localCache.put(key, json);
        }
        return user;
    }
}
```

**解决方案三：Redis 高可用（哨兵/集群）**
如果 Redis 本身宕机，再好的过期策略也白费。生产环境必须部署高可用架构（详见第 10 章）：
- 主从 + Sentinel：自动故障转移，几分钟内恢复
- Redis Cluster：数据分片 + 去中心化，单点故障不影响整体

---

## 3.3 生产级缓存实战模板

### Spring Cache 注解使用

```java
@Service
@CacheConfig(cacheNames = "user")
public class UserCacheFacade {

    @Autowired
    private UserMapper userMapper;

    // 读缓存（自动实现 Cache Aside）
    @Cacheable(key = "#id", unless = "#result == null")
    public User getUser(Long id) {
        return userMapper.selectById(id);
    }

    // 更新后清除缓存
    @CacheEvict(key = "#user.id")
    @Transactional
    public void updateUser(User user) {
        userMapper.updateById(user);
    }

    // 删除后清除缓存
    @CacheEvict(key = "#id")
    @Transactional
    public void deleteUser(Long id) {
        userMapper.deleteById(id);
    }

    // 批量查询（逐个查询，拼装结果）
    @Cacheable(key = "#ids")
    public List<User> getUsersBatch(List<Long> ids) {
        return userMapper.selectBatchIds(ids);
    }
}
```

```yaml
# application.yml 中配置 TTL（全局默认）
spring:
  cache:
    type: redis
    redis:
      time-to-live: 3600s       # 默认 1 小时
      cache-null-values: false  # 不缓存 null
      key-prefix: "cache:"
      use-key-prefix: true
```

### 缓存监控指标

```java
@Component
public class CacheMonitor {

    @Autowired
    private Cache<String, String> localCache; // Caffeine

    @Scheduled(fixedRate = 60_000) // 每分钟
    public void reportCacheStats() {
        // Caffeine 本地缓存统计
        CacheStats stats = localCache.stats();
        double hitRate = stats.hitRate();
        System.out.printf("本地缓存 命中率: %.2f%%, 加载耗时: %.2fμs%n",
            hitRate * 100, stats.averageLoadPenalty() / 1000);

        // Redis 缓存统计
        Properties info = redisTemplate.execute(
            (RedisCallback<Properties>) conn ->
                conn.serverCommands().info("stats"));
        if (info != null) {
            System.out.printf("Redis 命中率: %s%n",
                info.getProperty("keyspace_hits"));
        }

        // 监控报警（命中率过低）
        if (hitRate < 0.3) {
            log.warn("本地缓存命中率低于 30%！当前: {}", hitRate);
            // TODO: 发送告警
        }
    }
}
```

### 热点 Key 自动发现与本地缓存降级

```java
@Component
public class HotKeyDetector {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private Cache<String, String> localCache; // Caffeine

    private static final int HOT_THRESHOLD = 100; // 每分钟超过 100 次算热 Key

    private final ConcurrentHashMap<String, AtomicInteger> accessCount =
        new ConcurrentHashMap<>();

    // 每次访问 Key 时调用此方法记录
    public void recordAccess(String key) {
        accessCount.computeIfAbsent(key, k -> new AtomicInteger())
            .incrementAndGet();
    }

    @Scheduled(fixedRate = 60_000) // 每分钟检查一次
    public void detectHotKeys() {
        accessCount.forEach((key, count) -> {
            int accesses = count.getAndSet(0);
            if (accesses > HOT_THRESHOLD) {
                log.warn("检测到热 Key: {}, 每分钟访问 {} 次，降级到本地缓存", key, accesses);
                // 将该 Key 的数据提前加载到本地缓存
                String value = redisTemplate.opsForValue().get(key);
                if (value != null) {
                    localCache.put(key, value);
                }
            }
        });
    }
}
```

---

## 本章总结

| 风险 | 原因 | 解决方案 | 实现难度 |
|------|-----|---------|---------|
| **缓存穿透** | 查询不存在的数据 | 布隆过滤器 / 空值缓存 | 中 |
| **缓存击穿** | 热点 Key 过期瞬间 | 互斥锁 / 逻辑过期 + 异步刷新 | 中 |
| **缓存雪崩** | 大量 Key 同时过期 / Redis 宕机 | 随机过期 / 多级缓存 / 高可用 | 低-高 |

**核心原则**：
1. **缓存不是万能的**——缓存只能扛读流量，写流量和强一致性场景并不适合
2. **缓存穿透防不住恶意攻击**——布隆过滤器是 O(1) 的防御，值得在生产环境部署
3. **多级缓存是终极方案**——本地缓存扛极热数据，Redis 扛次热数据，DB 保底
4. **监控比优化更重要**——不知道命中率就不知道缓存有没有用，不知道热 Key 就无法针对性优化