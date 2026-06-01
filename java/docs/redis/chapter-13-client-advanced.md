# 第13章 客户端进阶与高级特性

## 13.1 Pipeline（管道）与 MGET 批量优化

### 为什么 Pipeline 快？

Pipeline 将多条命令在客户端**打包发送**，Redis 处理后**批量返回结果**。核心收益是**节省了 N-1 次网络往返时间（RTT）**。

```
单条命令（100 条命令 = 100 次网络往返）：
  客户端                          Redis
    │                              │
    │── GET key1 ────────────────►│
    │◄── "value1" ───────────────│  RTT ≈ 1ms
    │                              │
    │── GET key2 ────────────────►│
    │◄── "value2" ───────────────│  RTT ≈ 1ms
    │                              │
    │  ... 100 次 ...              │
    │── GET key100 ──────────────►│
    │◄── "value100" ─────────────│
    │                              │
  总耗时 ≈ 100ms

Pipeline（100 条命令 = 1 次网络往返）：
  客户端                          Redis
    │                              │
    │── GET key1                   │
    │   GET key2                   │
    │   ...                        │
    │   GET key100 ──────────────►│
    │                              │  (打包发送)
    │◄── "value1"                  │
    │   "value2"                   │
    │   ...                        │
    │   "value100" ───────────────│
    │                              │
  总耗时 ≈ 5ms（1 次 RTT + 处理时间）
```

```java
@Service
public class PipelineService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // ❌ 错误做法：逐个查询
    public List<String> batchGetBad(List<String> keys) {
        List<String> result = new ArrayList<>();
        for (String key : keys) {
            result.add(redisTemplate.opsForValue().get(key));
            // 100 个 key = 100 次网络往返
        }
        return result;
    }

    // ✅ 正确做法：Pipeline 批量查询
    public List<String> batchGetGood(List<String> keys) {
        // executePipelined 会将所有命令打包发送
        List<Object> results = redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                for (String key : keys) {
                    connection.stringCommands()
                        .get(key.getBytes(StandardCharsets.UTF_8));
                }
                return null;
            });

        return results.stream()
            .map(r -> (String) r)
            .collect(Collectors.toList());
    }

    // Pipeline 批量写入
    public void batchSet(Map<String, String> kvMap) {
        redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                kvMap.forEach((key, value) -> {
                    connection.stringCommands()
                        .set(key.getBytes(StandardCharsets.UTF_8),
                             value.getBytes(StandardCharsets.UTF_8));
                });
                return null;
            });
        // 1000 次 SET → 1 次网络往返
        // 耗时从 ~1000ms 降低到 ~10ms
    }

    // Pipeline 批量操作（混合命令）
    public void mixedPipeline() {
        redisTemplate.executePipelined(
            (RedisCallback<Void>) connection -> {
                byte[] key1 = "user:1".getBytes();
                byte[] key2 = "user:2".getBytes();

                connection.stringCommands().set(key1, "value1".getBytes());
                connection.stringCommands().get(key2);
                connection.setCommands().sAdd(
                    "tag:users".getBytes(), key1, key2);
                connection.hashCommands().hSet(
                    "user:1".getBytes(),
                    "name".getBytes(), "John".getBytes());

                return null;
            });
    }

    /**
     * Pipeline 的注意事项：
     *
     * 1. Pipeline 不是事务
     *    - Pipeline 中的命令可能部分失败（如 SET 成功但 GET 超时）
     *    - 需要事务用 MULTI/EXEC
     *
     * 2. Pipeline 的命令数不是越多越好
     *    - 一次 Pipeline 建议 ≤ 5000 条命令
     *    - 过多会导致客户端缓冲区膨胀
     *    - 也占用 Redis 服务器内存（输出缓冲区）
     *
     * 3. Pipeline 只在需要批量操作时使用
     *    - 不要把所有命令都 Pipeline
     *    - 一次 Pipeline 增加一次 RTT 延迟
     */
}
```

### MGET vs Pipeline GET

```java
// MGET 是专门为批量 GET 设计的命令
// 比 Pipeline GET 更简洁

// MGET 方式
public List<String> mgetBatch(List<String> keys) {
    return redisTemplate.opsForValue().multiGet(keys);
}

// Pipeline GET 方式
public List<String> pipelineGetBatch(List<String> keys) {
    List<Object> results = redisTemplate.executePipelined(
        (RedisCallback<Void>) connection -> {
            keys.forEach(key -> {
                try {
                    connection.stringCommands()
                        .get(key.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            return null;
        });
    return results.stream()
        .map(r -> (String) r)
        .collect(Collectors.toList());
}

// 性能对比：
// 10 个 key：MGET ≈ Pipeline GET（都只要 1 次 RTT）
// 100 个 key：MGET 略快（内部更优化）
// 混合命令：只能用 Pipeline（MGET 只能查 String 类型）
```

---

## 13.2 Lua 脚本开发规范

### Lua 脚本的核心价值：原子性

Lua 脚本在 Redis 中是**原子执行**的——脚本执行期间，其他客户端的命令不会插入。这比 Pipeline 更强（Pipeline 不保证原子性）：

```bash
# Lua 脚本 vs Pipeline 的核心区别：

# Pipeline：命令之间可能被其他客户端的命令插入
# CLIENT A: SET key1 "a"   （Pipeline）
# CLIENT B: SET key1 "b"   ← 可能插入在中间！
# CLIENT A: GET key1        （Pipeline）

# Lua 脚本：整个脚本原子执行
# CLIENT A: EVAL "redis.call('set', ...); redis.call('get', ...)" 0
# CLIENT B: 任何命令 → 在脚本执行完后才能执行
```

### Lua 脚本模板

```java
@Service
public class LuaScriptService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    // Lua 脚本：原子化的读取并删除
    private static final String GET_AND_DEL_SCRIPT =
        "local val = redis.call('get', KEYS[1]) " +
        "if val then " +
        "    redis.call('del', KEYS[1]) " +
        "end " +
        "return val";

    public String getAndDelete(String key) {
        DefaultRedisScript<String> script =
            new DefaultRedisScript<>(GET_AND_DEL_SCRIPT, String.class);
        return redisTemplate.execute(script,
            Collections.singletonList(key));
    }

    // Lua 脚本：原子化的比较并更新（类似 CAS）
    private static final String COMPARE_AND_SET_SCRIPT =
        "local old = redis.call('get', KEYS[1]) " +
        "if old == ARGV[1] then " +
        "    redis.call('set', KEYS[1], ARGV[2]) " +
        "    return 1 " +
        "else " +
        "    return 0 " +
        "end";

    public boolean compareAndSet(String key,
            String expected, String newValue) {
        DefaultRedisScript<Long> script =
            new DefaultRedisScript<>(COMPARE_AND_SET_SCRIPT, Long.class);
        Long result = redisTemplate.execute(script,
            Collections.singletonList(key),
            expected, newValue);
        return Long.valueOf(1).equals(result);
    }

    // Lua 脚本：限流（固定窗口）
    private static final String RATE_LIMIT_SCRIPT =
        "local key = KEYS[1] " +
        "local limit = tonumber(ARGV[1]) " +
        "local expireMs = tonumber(ARGV[2]) " +
        "local current = redis.call('incr', key) " +
        "if current == 1 then " +
        "    redis.call('pexpire', key, expireMs) " +
        "end " +
        "return current <= limit and 1 or 0";

    public boolean rateLimit(String key, int limit, long expireMs) {
        DefaultRedisScript<Long> script =
            new DefaultRedisScript<>(RATE_LIMIT_SCRIPT, Long.class);
        Long result = redisTemplate.execute(script,
            Collections.singletonList(key),
            String.valueOf(limit),
            String.valueOf(expireMs));
        return Long.valueOf(1).equals(result);
    }
}
```

### Lua 脚本使用规范

```
Lua 脚本开发规范：

  1. ✅ 使用 EVALSHA（脚本缓存，避免每次传脚本）
     脚本第一次执行后会在 Redis 中缓存，返回 SHA 值
     后续用 EVALSHA <SHA> 执行，节省带宽

  2. ✅ 参数化输入
     KEYS: 传入 key 名称
     ARGV: 传入其他参数
     KEYS 和 ARGV 从 1 开始索引

  3. ❌ 避免长耗时脚本
     Redis 单线程执行 Lua → 脚本执行期间其他命令阻塞
     max-execution-time（默认 5000ms）超时后自动终止
     建议：每个 Lua 脚本控制在 10ms 以内

  4. ❌ 不要用 Lua 做复杂计算
     Redis 的 CPU 很宝贵，复杂计算应该在应用层做
     Lua 脚本只做"原子性操作"和"条件判断"

  5. ✅ 调试技巧
     redis-cli --eval script.lua key1 key2 , arg1 arg2
     redis.log(redis.LOG_WARNING, "debug message")
```

---

## 13.3 事务（Transaction）

### WATCH + MULTI + EXEC 的乐观锁

Redis 事务通过 `WATCH` + `MULTI` + `EXEC` 实现**乐观锁**（CAS, Compare and Set）：

```
乐观锁事务流程：

  WATCH balance:1001          ← 监控 balance:1001
  → OK

  MULTI                       ← 开始事务
  → OK

  DECR balance:1001 100       ← 扣减 100（不立即执行，放入队列）
  → QUEUED

  INCR balance:1001:log       ← 记录日志（放入队列）
  → QUEUED

  EXEC                        ← 执行事务
  → 1) 980                    ← DECR 结果
    2) 1                      ← INCR 结果

  如果 WATCH 的 key 在 EXEC 之前被其他客户端修改：
  → EXEC 返回 nil（事务不执行）
  → 应用程序需要重试
```

```java
@Service
public class RedisTransactionService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 乐观锁扣减库存（WATCH + 重试）
     *
     * 适用场景：
     *   - 并发冲突不激烈（如库存不多时）
     *   - 相比分布式锁，乐观锁在没冲突时性能更好
     */
    public boolean deductStockWithRetry(String productId,
            int quantity, int maxRetries) {

        for (int i = 0; i < maxRetries; i++) {
            if (deductStock(productId, quantity)) {
                return true;
            }
            // 被其他事务修改了，等一会儿重试
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private boolean deductStock(String productId, int quantity) {
        String stockKey = "stock:" + productId;

        return Boolean.TRUE.equals(
            redisTemplate.execute(new SessionCallback<Boolean>() {
                @Override
                @SuppressWarnings("unchecked")
                public Boolean execute(RedisOperations ops) {
                    // 1. WATCH：监控库存 key
                    ops.watch(stockKey);

                    // 2. 读取当前库存
                    String stockStr = (String)
                        ops.opsForValue().get(stockKey);
                    int stock = stockStr != null ?
                        Integer.parseInt(stockStr) : 0;

                    // 3. 检查库存是否充足
                    if (stock < quantity) {
                        ops.unwatch(); // 取消监控
                        return false;
                    }

                    // 4. 开始事务
                    ops.multi();
                    ops.opsForValue()
                        .decrement(stockKey, quantity);

                    // 5. 执行事务
                    List<Object> results = ops.exec();
                    return results != null && !results.isEmpty();
                }
            })
        );
    }

    /**
     * 事务的实用限制：
     *
     * 1. 事务中不能回滚
     *    如果事务中一条命令失败（如类型错误），其他命令继续执行
     *    不像 SQL 事务，没有 ROLLBACK
     *
     * 2. 事务中不能依赖中间结果
     *    MULTI 之后的命令只是入队，不执行
     *    后面命令的输入不能依赖前面命令的输出
     *
     * 3. WATCH 的乐观锁在竞争激烈时效率低
     *    如果冲突率高，应该用分布式锁
     *    乐观锁适合"读多写少"的场景
     */
}
```

---

## 13.4 主流客户端对比

| 特性 | Jedis | Lettuce | Redisson |
|------|-------|---------|---------|
| **线程安全** | ❌ 非线程安全（需连接池） | ✅ 线程安全（基于 Netty） | ✅ 线程安全 |
| **连接方式** | 同步阻塞 | 异步 + 同步（响应式） | 同步 + 异步 |
| **性能** | 一般（阻塞 I/O） | **高**（非阻塞 I/O，连接复用） | 高 |
| **Spring Boot 默认** | ❌（已弃用） | ✅（默认） | ✅（可选） |
| **集群支持** | ✅ | ✅ | ✅ |
| **高级功能** | 基础操作 | 基础操作 + 响应式 | **分布式锁、限流、布隆过滤器** |
| **学习曲线** | 低 | 中 | 高（API 丰富） |

### 如何选择？

```
选择建议：

  你是新项目？
  → 用 Lettuce（Spring Boot 默认，性能好）

  你需要分布式锁、布隆过滤器、限流器？
  → 用 Redisson（内置支持）

  你维护老项目？
  → 用 Jedis（迁移成本高，不建议新用）

  你需要高性能异步？
  → 用 Lettuce（基于 Netty，响应式 API）
```

```java
// 以 Redisson 为例：一行代码实现分布式锁、限流器
@Service
public class RedissonFeatures {

    @Autowired
    private RedissonClient redisson;

    // 分布式锁
    public void lockExample() {
        RLock lock = redisson.getLock("myLock");
        lock.lock(10, TimeUnit.SECONDS);
        try {
            // 临界区
        } finally {
            lock.unlock();
        }
    }

    // 限流器
    public boolean tryAcquire() {
        RRateLimiter limiter = redisson.getRateLimiter("myLimiter");
        // 每秒 10 个令牌
        limiter.trySetRate(RateType.OVERALL, 10, 1, RateIntervalUnit.SECONDS);
        return limiter.tryAcquire();
    }

    // 布隆过滤器
    public boolean mightContain(String value) {
        RBloomFilter<String> bloomFilter =
            redisson.getBloomFilter("myBloom");
        bloomFilter.tryInit(10000, 0.01);
        return bloomFilter.contains(value);
    }

    // 原子累加器
    public long incrementAndGet() {
        RAtomicLong atomicLong = redisson.getAtomicLong("myCounter");
        return atomicLong.incrementAndGet();
    }
}
```

---

## 本章总结

| 特性 | 原子性 | 性能提升 | 适用场景 |
|------|-------|---------|---------|
| **Pipeline** | ❌ 不保证 | 提升 N-1 次 RTT | 批量读/写（不需要原子性） |
| **Lua 脚本** | ✅ 保证 | 提升 + 原子保障 | 需要原子性的复杂操作 |
| **事务（WATCH）** | ✅ 乐观锁 | 无（退化为同步） | 低冲突 CAS 场景 |
| **MSET/MGET** | ❌ 不保证 | 批量操作 | String 类型的批量读写 |

**核心原则**：
1. **Pipeline 是最简单有效的性能优化**——每条命令省 1ms RTT，100 条就省 100ms
2. **Lua 脚本替代"读-改-写"的 RMW 模式**——任何需要"先读再判断再写"的操作都该用 Lua
3. **Redisson 封装了 90% 你需要的高级功能**——锁、限流、布隆过滤器都可以一行代码实现
4. **不要混用客户端**——一个项目用一个客户端就够了