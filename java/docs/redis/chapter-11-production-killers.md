# 第11章 生产环境"四大杀手"排查与解决

## 11.1 大 Key（BigKey）问题

### 什么是大 Key？

大 Key 并没有绝对的标准，但通常满足以下条件之一即可认为是大 Key：

```
大 Key 判定标准：
  String 类型：Value > 10KB
  List/Hash/Set/ZSet：元素个数 > 5000 个

  生产环境中的大 Key 典型例子：
  ❌ 用 String 存了一个 5MB 的用户头像（Base64）
  ❌ Hash 中有 10 万个字段（存储商品全量信息）
  ❌ List 中有 100 万条消息（延迟消费导致消息堆积）
  ❌ Set 中有 500 万个元素（用户兴趣标签）
  ❌ ZSet 中有 1000 万个元素（全量用户排行榜）
```

### 大 Key 的三重危害

```
危害一：阻塞主线程

  当 Redis 执行大 Key 相关操作时，命令是**单线程执行**的：
  GET 5MB 的 String → 5MB 数据从内存拷贝到网络缓冲区 → 耗时 ~1ms
  LRANGE list 0 -1（100 万条）→ 遍历整个 List → 耗时 ~500ms！
  
  在这 500ms 内，所有其他命令都在排队等待！
  
  响应延迟：
  ┌────┬────┬────┬────┬────┬────┬────┬────┐
  │cmd1│LRANGE(500ms)               │cmd2│cmd3│
  └────┴────────────────────────────┴────┴────┘
  ↑                    ↑                   ↑
  正常延迟            500ms 延迟          正常延迟
                       尖刺！


危害二：网络拥塞

  一次返回 5MB 数据 → 占用 5MB 带宽
  1000 QPS × 5MB = 5GB/s → 万兆网卡被打满！
  其他业务数据排队等待 → 整体延迟上升
  
  流量：
  ┌────────────────────────────────────────────────┐
  │      5MB 大 Key 流量                     │
  │  ████████████████████████████████████           │
  │             其他小 Key 流量                     │
  │  ██                                            │
  └────────────────────────────────────────────────┘


危害三：数据倾斜（Cluster 场景）

  Redis Cluster 有 3 个节点，每个节点分配约 5461 个槽：
  ┌────────────┐ ┌────────────┐ ┌────────────┐
  │  Node A     │ │  Node B     │ │  Node C     │
  │  占用 2GB    │ │  占用 5GB   │ │  占用 2GB   │
  │  (正常)     │ │  (存储了    │ │  (正常)     │
  │             │ │  一个大 Key)│ │             │
  │  QPS: 5000  │ │  QPS: 500   │ │  QPS: 5000  │
  │             │ │  (被大 Key  │ │             │
  │             │ │  拖慢)     │ │             │
  └────────────┘ └────────────┘ └────────────┘
  
  Node B 的内存和带宽被大 Key 占满 → 成为集群瓶颈！
```

### 大 Key 排查方法

```bash
# 方法一：redis-cli --bigkeys（采样分析，推荐）
redis-cli --bigkeys -h localhost -p 6379

# 输出示例：
# -------- summary -------
# Biggest   String found 'user:avatar:1001' has 5242880 bytes
# Biggest       Hash found 'product:full:2001' has 100000 fields
# Biggest    ZSet found 'leaderboard:all' has 5000000 members
# Biggest       List found 'log:queue:errors' has 1000000 items

# 方法二：MEMORY USAGE（精确分析单个 key）
redis-cli MEMORY USAGE user:avatar:1001
# → 5242880（字节）

# 方法三：RDB 离线分析
# 使用 rdbtools 工具解析 RDB 文件
# pip install rdbtools
rdb -c memory dump.rdb --bytes 10240 -f memory.csv
# 生成 CSV 文件，按内存占用排序
```

```java
// Java 端扫描大 Key
@Component
public class BigKeyScanner {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long BIG_KEY_THRESHOLD = 10240; // 10KB

    @Scheduled(fixedRate = 3600_000) // 每小时扫描一次
    public void scanBigKeys() {
        ScanOptions options = ScanOptions.scanOptions()
            .match("*")
            .count(1000)  // 每次扫描 1000 个
            .build();

        RedisConnection connection = redisTemplate
            .getConnectionFactory().getConnection();

        try {
            Cursor<byte[]> cursor = connection.keyCommands()
                .scan(options);

            while (cursor.hasNext()) {
                byte[] rawKey = cursor.next();
                String key = new String(rawKey,
                    StandardCharsets.UTF_8);

                // 获取类型
                String type = new String(
                    connection.keyCommands().type(rawKey));

                // MEMORY USAGE
                Long bytes = connection.keyCommands()
                    .memoryUsage(rawKey);

                if (bytes != null && bytes > BIG_KEY_THRESHOLD) {
                    log.warn("发现大 Key: key={}, type={}, size={}bytes",
                        key, type, bytes);
                    // TODO: 发送告警
                }
            }
        } finally {
            connection.close();
        }
    }
}
```

### 大 Key 解决方案

**方案一：Hash 分片（拆分大 Key）**

```java
// ❌ 错误做法：一个 Hash 存 10 万个字段
// HSET product:full:2001 field1 val1
// HSET product:full:2001 field2 val2
// ... 99999 个字段

// ✅ 正确做法：按字段类型拆分为多个小 Hash
// product:info:2001       ← 基本信息（少量字段）
// product:spec:2001       ← 规格参数（中等数量字段）
// product:desc:2001       ← 描述信息（String 类型，大文本）
```

**方案二：大 List → 分桶 List**

```java
// 大消息队列拆分为多个分片
// 消息的生产者按消息 ID 的哈希值写入不同的分片
String queueKey = "queue:task:" + (messageId % 10); // 10 个分片
redisTemplate.opsForList().leftPush(queueKey, message);
```

**方案三：异步删除（UNLINK）**

```bash
# 删除大 Key 时，不要用 DEL（阻塞主线程）
redis-cli DEL leaderboard:all
# → 删除时间 = O(N)，可能阻塞主线程数秒！

# 使用 UNLINK（Redis 4.0+）
redis-cli UNLINK leaderboard:all
# → 后台线程删除，主线程立即返回 O(1)
```

```java
// Java 端异步删除
public void safeDeleteLargeKey(String key) {
    // UNLINK 命令（非阻塞删除）
    redisTemplate.unlink(key);
}
```

**方案四：压缩存储**

```java
// 大文本压缩后存入 Redis
public void setCompressed(String key, String rawValue) {
    try {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        GZIPOutputStream gzip = new GZIPOutputStream(bos);
        gzip.write(rawValue.getBytes(StandardCharsets.UTF_8));
        gzip.close();
        byte[] compressed = bos.toByteArray();

        // 压缩比通常 5-10 倍（文本数据）
        redisTemplate.opsForValue().set(key, compressed);
        log.info("压缩比: {} → {} ({}x)",
            rawValue.length(), compressed.length(),
            rawValue.length() / compressed.length());
    } catch (IOException e) {
        throw new RuntimeException("压缩失败", e);
    }
}
```

---

## 11.2 热 Key（HotKey）问题

### 什么是热 Key？

```
热 Key 的特征：
  某个 key 的访问频率远超其他 key
  
  正常情况：1000 万个 key，均匀分布，QPS 500
  热 Key 情况：
  ┌────────────────────────────────────────────────┐
  │ Key               QPS    占比                   │
  │ ──────────────────────────────────              │
  │ user:1001         50000   50%     █████████████ │
  │ product:2001      20000   20%     █████         │
  │ seckill:3001      10000   10%     ██            │
  │ 其他 1000 万个 key   20000   20%     ██         │
  └────────────────────────────────────────────────┘

  一个热 Key → 打满单节点的 CPU 和带宽！
```

### 热 Key 排查方法

```bash
# 方法一：redis-cli --hotkeys（需开启 LFU 淘汰策略）
redis-cli --hotkeys -h localhost -p 6379
# 输出示例：
# [00.00%] Hot key found: 'user:1001' with counter: 999999
# [00.00%] Hot key found: 'product:2001' with counter: 500000

# 方法二：MONITOR 命令（临时采样，生产慎用）
redis-cli MONITOR | head -10000 | awk '{print $4}' | sort | uniq -c | sort -rn | head -10
```

```java
// 客户端埋点监控热 Key
@Component
public class HotKeyDetector {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    private final ConcurrentHashMap<String, AtomicLong> accessCount
        = new ConcurrentHashMap<>();

    // 代理所有 GET 操作（通过 AOP 或 Decorator 模式）
    public String get(String key) {
        // 记录访问次数
        accessCount.computeIfAbsent(key,
            k -> new AtomicLong()).incrementAndGet();
        return redisTemplate.opsForValue().get(key);
    }

    // 每分钟计算热 Key
    @Scheduled(fixedRate = 60_000)
    public void reportHotKeys() {
        long now = System.currentTimeMillis();

        accessCount.forEach((key, count) -> {
            long access = count.getAndSet(0);
            if (access > 1000) { // 每分钟超过 1000 次 = 热 Key
                log.warn("检测到热 Key: key={}, QPS≈{}",
                    key, access / 60);
                // TODO: 发送告警 + 自动降级本地缓存
            }
        });
    }
}
```

### 热 Key 解决方案

**方案一：本地缓存（Caffeine/Guava）**

```java
private final Cache<String, String> localCache = Caffeine.newBuilder()
    .maximumSize(10000)
    .expireAfterWrite(10, TimeUnit.SECONDS)
    .build();

public String getWithLocalCache(String key) {
    // 热 Key 的请求大部分命中本地缓存
    return localCache.get(key, k -> {
        // 只有本地 cache miss 才查 Redis
        return redisTemplate.opsForValue().get(k);
    });
}
```

**方案二：Key 加随机后缀打散**

```java
// 思路：将一个热 Key 复制为 N 个带后缀的 Key
// 客户端读取时随机选择其中一个

// 写入时：复制 N 份
public void setHotKey(String key, String value, int replicaCount) {
    for (int i = 0; i < replicaCount; i++) {
        redisTemplate.opsForValue().set(
            key + ":" + i, value, 60, TimeUnit.SECONDS);
    }
}

// 读取时：随机选一个副本
public String getHotKey(String key, int replicaCount) {
    int index = ThreadLocalRandom.current().nextInt(replicaCount);
    return redisTemplate.opsForValue().get(key + ":" + index);
}
```

**方案三：读写分离（主库写、多个从库分担读）**

```java
// 热 Key 读请求分散到多个从节点
// 每个从节点承受 1/N 的读流量
```

---

## 11.3 缓存雪崩/穿透/击穿的监控与自愈

（第 3 章已详细讲解原理和解决方案，本节聚焦监控和自动化恢复）

```java
@Component
public class CacheAvalancheGuard {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 监控 Redis 连接状态
    @Scheduled(fixedRate = 5000)
    public void checkRedisHealth() {
        try {
            String pong = redisTemplate.getConnectionFactory()
                .getConnection().ping();
            if (!"PONG".equals(pong)) {
                log.error("Redis 连接异常！切换到本地缓存模式");
                enableLocalCacheFallback();
            }
        } catch (Exception e) {
            log.error("Redis 不可用！", e);
            enableLocalCacheFallback();
        }
    }

    // Redis 宕机时自动降级到本地缓存
    @GuardedBy("redisHealth")
    private boolean localModeEnabled = false;

    private void enableLocalCacheFallback() {
        localModeEnabled = true;
        // 启动一个后台线程持续尝试恢复 Redis 连接
        new Thread(() -> {
            while (localModeEnabled) {
                try {
                    Thread.sleep(5000);
                    redisTemplate.getConnectionFactory()
                        .getConnection().ping();
                    localModeEnabled = false;
                    log.info("Redis 恢复，切回正常模式");
                } catch (Exception ignored) {}
            }
        }).start();
    }

    // 监控缓存命中率
    @Scheduled(fixedRate = 60_000)
    public void monitorHitRate() {
        // Redis INFO stats
        Properties info = redisTemplate.execute(
            (RedisCallback<Properties>) conn ->
                conn.serverCommands().info("stats"));

        if (info != null) {
            long hits = Long.parseLong(
                info.getProperty("keyspace_hits", "0"));
            long misses = Long.parseLong(
                info.getProperty("keyspace_misses", "0"));
            long total = hits + misses;
            if (total > 0) {
                double hitRate = (double) hits / total;
                System.out.printf("缓存命中率: %.2f%%%n",
                    hitRate * 100);

                if (hitRate < 0.5) {
                    log.warn("缓存命中率低于 50%！" +
                        "可能发生缓存雪崩或穿透");
                }
            }
        }
    }
}
```

---

## 11.4 内存暴涨与 OOM 排查

### 内存淘汰策略的选择

```bash
# redis.conf
maxmemory 1gb                         # 最大可用内存（必须设置！）
maxmemory-policy allkeys-lru          # 淘汰策略（根据业务选择）

# 各种淘汰策略对比
# ┌─────────────────────┬──────────────────────────┐
# │ 策略                 │ 适用场景                   │
# ├─────────────────────┼──────────────────────────┤
# │ noeviction          │ 写入即报错（默认，导致写入）│
# │                     │ 失败，不推荐）              │
# ├─────────────────────┼──────────────────────────┤
# │ allkeys-lru         │ 通用缓存（大多数场景推荐）   │
# ├─────────────────────┼──────────────────────────┤
# │ volatile-lru        │ 只淘汰带 TTL 的 key       │
# ├─────────────────────┼──────────────────────────┤
# │ allkeys-lfu         │ 冷热数据差异大             │
# ├─────────────────────┼──────────────────────────┤
# │ volatile-ttl        │ 优先淘汰即将过期的 key     │
# ├─────────────────────┼──────────────────────────┤
# │ allkeys-random      │ 访问模式均匀               │
# └─────────────────────┴──────────────────────────┘
```

### 客户端缓冲区溢出排查

Redis 每个客户端连接都有输出缓冲区。当消费者处理慢时，缓冲区会不断增长：

```bash
# 查看客户端缓冲区状态
redis-cli CLIENT LIST

# 输出示例：
# id=3 addr=127.0.0.1:54321 fd=7 name= age=124 idle=0
#   flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0
#   obl=0 oll=0 omem=0
#   ...
# id=5 addr=127.0.0.1:54322 fd=9 name= age=100 idle=0
#   flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0
#   obl=0 oll=0 omem=0 events=r cmd=GET

# omem：输出缓冲区内存占用（字节）
# 如果某个客户端的 omem 持续 > 10MB，说明消费者太慢
```

```bash
# redis.conf 客户端缓冲区限制
client-output-buffer-limit normal 0 0 0           # 普通客户端：不限制
client-output-buffer-limit replica 256mb 64mb 60  # 从节点：256MB 硬限制
client-output-buffer-limit pubsub 32mb 8mb 60    # Pub/Sub：32MB 硬限制
```

### 内存监控与预警

```java
@Component
public class MemoryMonitor {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long MEMORY_WARN_THRESHOLD = 1024 * 1024 * 1024L; // 1GB
    private static final long MEMORY_CRITICAL_THRESHOLD = 2 * 1024 * 1024 * 1024L; // 2GB

    @Scheduled(fixedRate = 10_000) // 每 10 秒检查一次
    public void checkMemory() {
        Properties info = redisTemplate.execute(
            (RedisCallback<Properties>) conn ->
                conn.serverCommands().info("memory"));

        if (info == null) return;

        long usedMemory = Long.parseLong(
            info.getProperty("used_memory", "0"));
        long usedMemoryRss = Long.parseLong(
            info.getProperty("used_memory_rss", "0"));
        double fragmentationRatio = Double.parseDouble(
            info.getProperty("mem_fragmentation_ratio", "1.0"));

        // 内存使用量预警
        if (usedMemory > MEMORY_CRITICAL_THRESHOLD) {
            log.error("Redis 内存严重不足！used={}MB, rss={}MB",
                usedMemory / 1024 / 1024,
                usedMemoryRss / 1024 / 1024);
            // TODO: 发送告警 + 自动触发淘汰
        }

        // 内存碎片预警
        if (fragmentationRatio > 1.5) {
            log.warn("Redis 内存碎片率过高！ratio={}",
                fragmentationRatio);
            // 触发自动碎片整理
            triggerDefrag();
        }
    }

    private void triggerDefrag() {
        // 动态开启碎片整理
        redisTemplate.execute(
            (RedisCallback<Void>) conn -> {
                conn.serverCommands().setConfig(
                    "activedefrag", "yes");
                return null;
            });
    }
}
```

---

## 本章总结

| 杀手 | 危害 | 排查手段 | 解决方案 |
|------|------|---------|---------|
| **大 Key** | 阻塞主线程、网络拥塞、数据倾斜 | `--bigkeys`, `MEMORY USAGE`, RDB 离线分析 | 分片、拆分、UNLINK、压缩 |
| **热 Key** | 单节点 CPU/带宽打满 | `--hotkeys`, 客户端埋点 | 本地缓存、Key 打散、读写分离 |
| **雪崩/击穿/穿透** | DB 被打挂 | INFO stats 命中率监控 | 随机 TTL、多级缓存、布隆过滤器 |
| **内存 OOM** | Redis 不可用 | INFO memory, CLIENT LIST | maxmemory + 合适淘汰策略 |

**核心原则**：
1. **大 Key 和热 Key 是 Redis 最常见的线上事故**——每次上线前都应该评估数据结构和访问模式
2. **监控指标是防线**——不知道内存使用率、命中率、客户端缓冲区大小的运维是在"裸奔"
3. **自动恢复比手动快**——配置好告警阈值和自动触发脚本，OOM 发生后 30 秒内自动处理
4. **工具扫描不能替代架构设计**——`--bigkeys` 是发现问题的，分库分表是解决问题的