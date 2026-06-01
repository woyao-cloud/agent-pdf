# 第4章 分布式锁（Distributed Lock）场景

## 4.1 实现原理：SETNX + Lua 脚本

### 从单机锁到分布式锁

在单机应用中，我们使用 `synchronized` 或 `ReentrantLock` 来保证互斥。但在微服务架构中，多个服务实例运行在不同的 JVM 进程甚至不同的物理机上，Java 的内存锁无法跨进程生效——这就是分布式锁的需求来源。

```
为什么需要分布式锁？
  单体应用:                         微服务架构:
  ┌─────────────────┐              ┌──────────┐  ┌──────────┐  ┌──────────┐
  │   JVM 进程       │              │ instance1 │  │ instance2 │  │ instance3│
  │  ┌───────────┐   │              │  (北京)   │  │  (上海)   │  │  (广州)   │
  │  │ Thread A  │── │── ── 竞争    │      │        │      │        │      │
  │  │ Thread B  │── │── synchronized│      │        │      │        │      │
  │  └───────────┘   │              │      ▼        │      ▼        │      ▼
  │  Java 锁即可     │              │   ┌──────────────┐            │
  └─────────────────┘              │   │    Redis      │            │
                                   │   │  SETNX lock   │            │
                                   │   └──────────────┘            │
                                   │  3 个 JVM，同一把 Redis 锁    │
                                   │  → 分布式锁                    │
```

### 最简实现：SET NX + PEXPIRE

```bash
# Redis 分布式锁的最简命令
SET lock:order:1001 "uuid-xxx" NX PX 30000
# NX: 只有当 key 不存在时才设置（互斥）
# PX: 设置过期时间（防止死锁）
# 30 秒后自动释放，避免持有锁的实例宕机导致死锁
```

**为什么必须是原子操作？** 如果分两步执行：

```bash
# ❌ 错误示范：分两步
SETNX lock:order:1001 "uuid-xxx"   # 设置锁
EXPIRE lock:order:1001 30          # 设置过期时间

# 如果 SETNX 成功后在执行 EXPIRE 之前，应用宕机了
# → 锁没有过期时间，变成死锁！
# 其他实例永远拿不到锁
```

### Lua 脚本实现安全释放锁

释放锁时，必须验证锁的持有者是自己——否则可能删除别人的锁：

```java
@Service
public class RedisDistributedLock {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // 获取锁（SET NX + 原子过期）
    public boolean tryLock(String lockKey, String requestId, long expireMs) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue()
                .setIfAbsent(lockKey, requestId, expireMs, TimeUnit.MILLISECONDS)
        );
    }

    // 释放锁（Lua 脚本保证原子性）
    public boolean releaseLock(String lockKey, String requestId) {
        String script =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "    return redis.call('del', KEYS[1]) " +
            "else " +
            "    return 0 " +
            "end";

        Long result = redisTemplate.execute(
            new DefaultRedisScript<>(script, Long.class),
            Collections.singletonList(lockKey),
            requestId
        );
        return Long.valueOf(1).equals(result);
    }

    // 使用示例
    public void doSomethingWithLock(String orderId) {
        String lockKey = "lock:order:" + orderId;
        String requestId = UUID.randomUUID().toString();

        boolean locked = tryLock(lockKey, requestId, 30_000);
        if (!locked) {
            throw new RuntimeException("获取锁失败，订单 " + orderId + " 正在被处理");
        }

        try {
            // 业务逻辑
            processOrder(orderId);
        } finally {
            releaseLock(lockKey, requestId); // 必须释放
        }
    }

    // 自旋重试（带间隔）
    public boolean tryLockWithRetry(String lockKey, String requestId,
                                    long expireMs, int retryTimes, long retryIntervalMs) {
        for (int i = 0; i < retryTimes; i++) {
            if (tryLock(lockKey, requestId, expireMs)) {
                return true;
            }
            if (i < retryTimes - 1) {
                try {
                    Thread.sleep(retryIntervalMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return false;
    }
}
```

---

## 4.2 三大潜在风险

### 风险一：锁过期但业务未执行完

这是分布式锁最常遇到的坑：业务执行时间超过了锁的过期时间，锁自动释放后，另一个实例拿到锁，导致并发安全问题。

```
时间线（锁超时导致的并发问题）：
  实例 A                                 实例 B
   │                                      │
   │ SETNX lock "A-uuid" NX PX 30000      │
   │ → 拿到锁                             │
   │                                      │
   │ [执行业务逻辑...]                      │
   │                                      │
   │ 30 秒后...                            │
   │                                      │
   │ [还没执行完]                           │
   │                                      │
   │ 锁自动过期                             │
   │                                      │
   │                                       SETNX lock "B-uuid" NX PX 30000
   │                                      │ → 拿到锁！
   │                                      │
   │ [终于执行完了]                          │
   │ DEL lock                              │
   │ → 删除了 B 的锁！                      │
   │                                      │
   │                             实例 A 和 B 同时执行业务！❌
```

### 风险二：主从复制导致锁丢失

Redis 主从架构是异步复制的。如果客户端在主节点写入了锁 key，但主节点在同步给从节点之前宕机了，哨兵选举了新主节点后，新主节点没有这条锁数据——锁丢失了。

```
主从复制导致锁丢失：
  客户端           主节点           从节点（新主）
    │                │                │
    │ SETNX lock NX  │                │
    │ ──────────────►│                │
    │  OK!           │                │
    │ ◄──────────────│                │
    │                │                │
    │           主节点宕机             │
    │                │                │
    │                │    Sentinel    │
    │                │ 选举从节点为主 │
    │                │──────────────►│ (成为新主)
    │                │                │
    │ SETNX lock NX  │                │
    │ ───────────────────────────────►│
    │  OK! ← 两个客户端都认为有锁     │
    │                                 │
    │  ❌ 两个客户端同时执行临界区代码  │
```

### 风险三：客户端 GC 停顿导致锁误删

```
GC 停顿导致的锁释放：
  客户端 A                              Redis
    │                                    │
    │ SETNX lock "A-uuid" NX PX 30000    │
    │ ───────────────────────────────►   │
    │ ◄── OK                             │
    │                                    │
    │ [GC STW 停顿 40 秒！]              │
    │   JVM Full GC 或 CMS remark        │
    │   A 线程被 Stop-The-World 暂停      │
    │                                    │
    │         30 秒后锁过期               │
    │                                    │
    │ 客户端 B                            │
    │  SETNX lock "B-uuid" NX PX 30000   │
    │  ───────────────────────────────►  │
    │  ◄── OK（B 拿到锁）                  │
    │                                    │
    │ [客户端 A GC 恢复]                   │
    │  DEL lock (A 以为还有锁)             │
    │ ───────────────────────────────►   │
    │  删除了 B 的锁！❌                   │
```

---

## 4.3 优化与应对方案

### 方案一：看门狗（Watch Dog）自动续期

核心思路：在锁过期时间到达前，如果业务还没执行完，自动延长锁的过期时间。

```
看门狗机制：
  持有锁后，启动一个守护线程：

  时间线：
  T0: 获取锁，TTL = 30s
  T10: 看门狗检查：锁还在，续期到 30s 后
  T20: 看门狗检查：锁还在，续期到 30s 后
  T30: 看门狗检查：锁还在，续期到 30s 后
  ...
  T5+N: 业务执行完，手动释放锁，看门狗停止

  如果持有锁的实例宕机：
  看门狗线程随着 JVM 一起消失
  锁不再续期 → 30 秒后自动过期 → 其他实例可以拿到锁
```

```java
/**
 * 带看门狗的分布式锁（简化版，与 Redisson 原理一致）
 */
@Component
public class WatchDogDistributedLock {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final long DEFAULT_EXPIRE_MS = 30_000;
    private static final long WATCHDOG_INTERVAL_MS = 10_000; // 每 10 秒续期一次

    private final ConcurrentHashMap<String, ScheduledFuture<?>> watchDogTasks =
        new ConcurrentHashMap<>();

    private final ScheduledExecutorService scheduler =
        Executors.newScheduledThreadPool(4);

    // 获取锁（自动启动看门狗）
    public boolean lock(String lockKey, String requestId) {
        return lock(lockKey, requestId, DEFAULT_EXPIRE_MS);
    }

    public boolean lock(String lockKey, String requestId, long expireMs) {
        boolean acquired = Boolean.TRUE.equals(
            redisTemplate.opsForValue()
                .setIfAbsent(lockKey, requestId, expireMs, TimeUnit.MILLISECONDS)
        );

        if (acquired) {
            // 启动看门狗
            startWatchDog(lockKey, requestId, expireMs);
        }
        return acquired;
    }

    // 释放锁（同时停止看门狗）
    public boolean unlock(String lockKey, String requestId) {
        stopWatchDog(lockKey);

        String script =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "    return redis.call('del', KEYS[1]) " +
            "else " +
            "    return 0 " +
            "end";

        Long result = redisTemplate.execute(
            new DefaultRedisScript<>(script, Long.class),
            Collections.singletonList(lockKey),
            requestId
        );
        return Long.valueOf(1).equals(result);
    }

    private void startWatchDog(String lockKey, String requestId, long expireMs) {
        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(() -> {
            // 每隔 expireMs/3 续期一次
            String script =
                "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                "    return redis.call('pexpire', KEYS[1], ARGV[2]) " +
                "else " +
                "    return 0 " +
                "end";

            redisTemplate.execute(
                new DefaultRedisScript<>(script, Long.class),
                Collections.singletonList(lockKey),
                requestId,
                String.valueOf(expireMs)
            );
        }, WATCHDOG_INTERVAL_MS, WATCHDOG_INTERVAL_MS, TimeUnit.MILLISECONDS);

        watchDogTasks.put(lockKey, future);
    }

    private void stopWatchDog(String lockKey) {
        ScheduledFuture<?> future = watchDogTasks.remove(lockKey);
        if (future != null) {
            future.cancel(false);
        }
    }

    // 使用示例
    public void businessWithWatchDog(String orderId) {
        String lockKey = "lock:order:" + orderId;
        String requestId = UUID.randomUUID().toString();

        try {
            if (!lock(lockKey, requestId)) {
                throw new RuntimeException("获取锁失败");
            }
            // 即使业务执行 5 分钟，看门狗也会持续续期
            slowBusinessLogic(orderId);
        } finally {
            unlock(lockKey, requestId);
        }
    }
}
```

### 使用 Redisson（生产推荐）

自己实现看门狗容易踩坑（线程泄漏、续期时机不准），生产环境应该直接使用 **Redisson**，它的 `RLock` 已经内置了看门狗机制：

```java
@Service
public class RedissonLockService {

    @Autowired
    private RedissonClient redissonClient;

    // 最基本的使用
    public void basicLock(String orderId) {
        RLock lock = redissonClient.getLock("lock:order:" + orderId);

        lock.lock(); // 默认 30 秒，看门狗自动续期 10 秒

        try {
            processOrder(orderId);
        } finally {
            lock.unlock();
        }
    }

    // 带超时的尝试（推荐）
    public boolean tryLockWithTimeout(String orderId) {
        RLock lock = redissonClient.getLock("lock:order:" + orderId);

        try {
            // waitTime: 最多等 3 秒
            // leaseTime: -1 表示用看门狗自动续期（30 秒基础，每 10 秒续期）
            return lock.tryLock(3, -1, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    // 可重入锁（同一个线程可以重复获取）
    public void reentrantLock(String orderId) {
        RLock lock = redissonClient.getLock("lock:order:" + orderId);

        lock.lock();
        try {
            // 同一线程内可以再次获取
            lock.lock();
            try {
                processOrder(orderId);
            } finally {
                lock.unlock(); // 释放第二次获取
            }
        } finally {
            lock.unlock(); // 释放第一次获取
        }
        // Redisson 内部通过 Redis Hash + 计数器实现可重入
    }

    // 公平锁（按请求顺序排队）
    public void fairLock(String orderId) {
        RLock lock = redissonClient.getFairLock("lock:order:" + orderId);
        // 底层使用 ZSet + list 维护等待队列
        // 适合对顺序有严格要求的场景（如抢购、排队）
        lock.lock();
        try {
            processOrder(orderId);
        } finally {
            lock.unlock();
        }
    }
}
```

**Redisson 看门狗源码原理**：

```
Redisson 看门狗（简化自 RLock 源码）：

  lock.lock() → 内部调用 scheduleExpirationRenewal(threadId)

  scheduleExpirationRenewal:
    1. 每 10 秒执行一次 renewalTask
    2. renewalTask 执行 Lua 脚本：
       if redis.call('hexists', KEYS[1], ARGV[2]) then   // 检查锁是否还是自己的
           redis.call('pexpire', KEYS[1], ARGV[1])       // 续期到 30 秒
           return 1
       end
       return 0
    3. 如果返回 0（锁已释放或被别人获取），停止续期任务
    4. unlock() 时主动停止续期任务

  看门狗线程使用 Netty 的 EventLoop，不占用业务线程
```

### 方案二：唯一标识 + Lua 原子删除（已在上文实现）

使用 UUID 作为锁的值，释放时用 Lua 验证后删除——这是最低要求，**每个使用 Redis 分布式锁的项目都必须实现这个机制**。

### 方案三：Redlock 算法（自动争议）

**Redlock 解决的问题**：在 Redis 主从架构下，主节点宕机可能导致锁丢失。Redlock 的思路是——向 **多个独立的 Redis 节点**（通常是 5 个）同时申请锁，只要大多数（N/2 + 1）节点返回成功，就认为锁获取成功。

```
Redlock 算法流程（5 个独立 Redis 节点）：

  客户端 A：
  1. 获取当前时间戳 T1
  2. 依次向 5 个节点发送 SETNX lock NX PX 100ms
     ──► Node1: OK
     ──► Node2: OK
     ──► Node3: TIMEOUT（超时）← 直接跳过
     ──► Node4: OK
     ──► Node5: TIMEOUT（超时）
  3. 获取当前时间戳 T2
  4. 计算耗时 = T2 - T1
  5. 如果成功数 >= 3 (N/2 + 1 = 3) 且 耗时 < 锁过期时间 → 获取成功
  6. 否则，向所有 5 个节点发送 DEL 释放锁

  关键点：每个节点的锁过期时间应该很短（如 100ms），
          因为要向多个节点发请求，耗时可能累积
```

**Redlock 的争议**：

| 立场 | 观点 | 代表人物 |
|------|------|---------|
| **反对** | Redlock 本质上是 AP 系统（可用性优先），无法保证真正的强一致性。时钟漂移、GC 停顿、网络延迟等现实问题 Redlock 都无法彻底解决 | Martin Kleppmann（《DDIA》作者） |
| **支持** | Redlock 在工程实践中已经足够好，时钟漂移可以通过 NTP 监控解决。如果你不需要强一致性，Redlock 比 Zookeeper 简单得多 | Antirez（Redis 作者） |

```java
// Redisson 对 Redlock 的实现（生产可用）
@Service
public class RedlockService {

    @Autowired
    private RedissonClient redissonClient1; // 集群 1
    @Autowired
    private RedissonClient redissonClient2; // 集群 2
    @Autowired
    private RedissonClient redissonClient3; // 集群 3

    public void redlockExample(String orderId) {
        // 3 个独立的 Redisson 客户端（每个连一个 Redis 集群或单节点）
        RLock lock1 = redissonClient1.getLock("lock:" + orderId);
        RLock lock2 = redissonClient2.getLock("lock:" + orderId);
        RLock lock3 = redissonClient3.getLock("lock:" + orderId);

        // 创建 RedissonRedLock（注意：这是联锁，不是红锁）
        // RedissonRedLock 已弃用，Redisson 推荐使用联锁
        RedissonMultiLock multiLock = new RedissonMultiLock(lock1, lock2, lock3);

        try {
            // 向所有节点申请锁，大多数成功即成功
            // waitTime: 等待 3 秒
            // leaseTime: 30 秒，看门狗自动续期
            boolean locked = multiLock.tryLock(3, 30, TimeUnit.SECONDS);

            if (locked) {
                try {
                    processOrder(orderId);
                } finally {
                    multiLock.unlock();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

### Zookeeper vs Redis 分布式锁对比

| 特性 | Redis (SETNX + Redisson) | Zookeeper (临时顺序节点) |
|------|------------------------|------------------------|
| **一致性模型** | AP（最终一致） | CP（强一致） |
| **性能** | 高（纯内存，5 万+ TPS） | 低（磁盘写，约 1 万 TPS） |
| **锁丢失风险** | 主从切换时可能丢失 | ZK 的 Zab 协议保证不丢失 |
| **自动续期** | 看门狗（Redisson 内置） | 会话过期机制（Session Timeout） |
| **羊群效应** | 无 | 有（watch 通知可能惊群） |
| **部署复杂度** | 低 | 高 |
| **适用场景** | 高并发、允许短暂不一致 | 强一致性要求（如配置中心） |

> **实战选择**：
> - 绝大多数业务场景（秒杀、订单防重、任务调度）→ **Redis 分布式锁** 足够
> - 对一致性极其敏感的场景（分布式事务协调、主节点选举、配置变更）→ **Zookeeper/Etcd**
> - 不要为了"完美"而过度设计——思考一下你的业务是否能容忍 1ms 的锁失效窗口

---

## 4.4 生产级配置与监控

### 锁参数模板

```yaml
# application.yml 锁配置
redis:
  lock:
    default-expire-ms: 30000      # 默认锁过期时间 30 秒
    watch-dog-interval-ms: 10000  # 看门狗续期间隔 10 秒
    retry-times: 3                # 获取锁重试次数
    retry-interval-ms: 100        # 重试间隔 100ms

# 不同业务的锁过期时间建议：
#   订单防重:    3-5 秒（业务很快）
#   库存扣减:    10 秒（涉及 DB 写入）
#   数据同步:    60 秒（可能涉及大量 DB 操作）
#   定时任务:    5 分钟（可能有长时间的计算）
```

### 锁监控

```java
@Component
public class LockMonitor {

    private final MeterRegistry meterRegistry;
    private final StringRedisTemplate redisTemplate;

    // 监控锁的获取耗时、成功率
    @Around("@annotation(lockMonitor)")
    public Object monitorLock(ProceedingJoinPoint pjp, LockMonitor lockMonitor)
            throws Throwable {
        String lockName = lockMonitor.value();
        StopWatch sw = new StopWatch();
        sw.start();

        boolean success = true;
        try {
            return pjp.proceed();
        } catch (Throwable e) {
            success = false;
            throw e;
        } finally {
            sw.stop();
            // 上报到 Prometheus / Grafana
            meterRegistry.timer("redis.lock.acquire",
                "lock", lockName,
                "success", String.valueOf(success)
            ).record(sw.getTotalTimeMillis(), TimeUnit.MILLISECONDS);

            // 如果获取锁耗时超过 1 秒，记录慢日志
            if (sw.getTotalTimeMillis() > 1000) {
                log.warn("锁获取过慢: lock={}, time={}ms",
                    lockName, sw.getTotalTimeMillis());
            }
        }
    }

    @Scheduled(fixedRate = 60_000)
    public void reportLockCount() {
        // 统计当前存在的锁数量（用于诊断锁泄漏）
        Set<String> keys = redisTemplate.keys("lock:*");
        log.info("当前锁数量: {}", keys.size());

        // 检查是否有长时间未释放的锁
        keys.forEach(key -> {
            Long ttl = redisTemplate.getExpire(key);
            if (ttl != null && ttl > 300) { // 锁 TTL 超过 5 分钟
                log.warn("可能存在锁泄漏: key={}, ttl={}s", key, ttl);
                // TODO: 发送告警
            }
        });
    }
}
```

---

## 本章总结

| 层次 | 必须做 | 推荐做 | 锦上添花 |
|------|-------|-------|---------|
| **基础** | SET NX PX + Lua 原子释放 | UUID 唯一标识 | 可重入性支持 |
| **进阶** | 看门狗自动续期 | 获取锁超时+重试 | 锁监控指标 |
| **高级** | 评估 Redlock 必要性 | 锁粒度细化（行锁→字段锁） | 多级锁降级 |

**核心原则**：
1. **分布式锁不是银弹**——能用乐观锁（版本号/CAS）解决的就不要用分布式锁
2. **锁粒度要细**——锁 `order:1001` 比锁 `order:*` 好一万倍
3. **看门狗是必备的**——没有自动续期的分布式锁在线上迟早出问题
4. **监控锁泄漏**——unlock() 放在 finally 里是最基本的素养，定期巡检锁数量可以兜底