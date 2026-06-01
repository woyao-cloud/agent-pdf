# 第12章 性能监控、诊断与调优

## 12.1 核心监控指标体系

### 必须监控的 6 个指标

```
生产环境 Redis 必须监控的指标：

  ┌────────────────────────────────────────────────────────┐
  │                       Redis 监控仪表盘                   │
  ├────────────────────────────────────────────────────────┤
  │ 1. 缓存命中率 (keyspace_hits / keyspace_misses)        │
  │    正常: > 90%  |  警告: < 80%  |  严重: < 50%        │
  │                                                        │
  │ 2. 内存碎片率 (mem_fragmentation_ratio)                 │
  │    正常: 1.0-1.5  |  警告: > 1.5  |  严重: > 2.0      │
  │                                                        │
  │ 3. Evicted Keys / Expired Keys                          │
  │    Evicted > 0 → 内存不足，触发淘汰                     │
  │    Expired 过高 → TTL 设置不合理                        │
  │                                                        │
  │ 4. 连接数 (connected_clients)                           │
  │    正常: < maxclients 的 80%                            │
  │                                                        │
  │ 5. 延迟 (latency)                                       │
  │    正常: < 1ms  |  警告: > 10ms  |  严重: > 100ms       │
  │                                                        │
  │ 6. 网络吞吐 (instantaneous_input_kbps / output_kbps)   │
  │    接近网卡上限 → 需要扩容                              │
  └────────────────────────────────────────────────────────┘
```

```bash
# 一次性获取所有关键指标
redis-cli INFO stats memory clients server
```

### Spring Boot Actuator + Prometheus + Grafana 集成

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,redis
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: ${spring.application.name}
```

```java
// 自定义 Redis 指标收集
@Component
public class RedisMetricsCollector {

    private final StringRedisTemplate redisTemplate;
    private final MeterRegistry meterRegistry;

    public RedisMetricsCollector(
            StringRedisTemplate redisTemplate,
            MeterRegistry meterRegistry) {
        this.redisTemplate = redisTemplate;
        this.meterRegistry = meterRegistry;

        // 定时刷新指标
        new ScheduledThreadPoolExecutor(1).scheduleAtFixedRate(
            this::collectMetrics, 0, 10, TimeUnit.SECONDS);
    }

    private void collectMetrics() {
        try {
            Properties info = redisTemplate.execute(
                (RedisCallback<Properties>) conn ->
                    conn.serverCommands().info("stats"));

            if (info == null) return;

            // 缓存命中率
            long hits = Long.parseLong(
                info.getProperty("keyspace_hits", "0"));
            long misses = Long.parseLong(
                info.getProperty("keyspace_misses", "0"));
            meterRegistry.gauge("redis.cache.hit.rate",
                hits + misses > 0 ?
                    (double) hits / (hits + misses) : 0);

            // 淘汰 Key 数
            long evictedKeys = Long.parseLong(
                info.getProperty("evicted_keys", "0"));
            meterRegistry.gauge("redis.keys.evicted", evictedKeys);

        } catch (Exception e) {
            log.error("收集 Redis 指标失败", e);
        }
    }
}
```

## 12.2 慢查询日志（Slowlog）分析

### 配置和查看慢查询

```bash
# redis.conf
slowlog-log-slower-than 10000    # 记录执行时间超过 10ms 的命令（微秒单位）
slowlog-max-len 128              # 最多保留 128 条慢查询

# 在线查看慢查询
redis-cli SLOWLOG GET 10         # 获取最近 10 条慢查询
redis-cli SLOWLOG LEN            # 获取慢查询总数
redis-cli SLOWLOG RESET          # 清空慢查询
```

```bash
# 慢查询输出示例
1) 1) (integer) 13              # 唯一 ID
   2) (integer) 1700000000      # 时间戳
   3) (integer) 45230           # 执行耗时（微秒）= 45.23ms
   4) 1) "LRANGE"               # 命令
      2) "log:queue:errors"     # Key
      3) "0"
      4) "-1"
   5) "127.0.0.1:54321"         # 客户端地址
   6) "worker-1"                # 客户端名称
```

### 慢查询常见原因

| 耗时操作 | 典型原因 | 解决方案 |
|---------|---------|---------|
| `KEYS *` | 扫描千万级 key | 用 `SCAN` 替代 |
| `LRANGE list 0 -1` | 大 List 全量查询 | 分页查，或拆分 List |
| `HGETALL bighash` | 大 Hash 全量查询 | 只用需要的字段 |
| `ZRANGE zset 0 -1` | 大 ZSet 全量查询 | 限制范围 |
| `SORT` | 复杂的排序操作 | 在应用层排序 |
| Lua 脚本 | 脚本执行时间过长 | 优化脚本逻辑 |
| `DEL bigkey` | 删除大 Key | 用 `UNLINK` 替代 |

```java
// Java 端记录慢查询
@Component
public class SlowLogMonitor {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Scheduled(fixedRate = 60_000)
    public void checkSlowLog() {
        List<Object> slowLogs = redisTemplate.execute(
            (RedisCallback<List<Object>>) conn ->
                conn.serverCommands().slowLogGet(10));

        if (slowLogs != null && !slowLogs.isEmpty()) {
            for (Object log : slowLogs) {
                log.warn("慢查询: {}", log);
            }
        }
    }
}
```

## 12.3 核心参数调优指南

### Linux 内核参数

```bash
# /etc/sysctl.conf Redis 部署优化

# 网络层
net.core.somaxconn = 1024              # TCP 全连接队列大小（Redis tcp-backlog 配合）
net.ipv4.tcp_max_syn_backlog = 1024    # 半连接队列大小
net.ipv4.tcp_slow_start_after_idle = 0 # 禁用空闲后的慢启动
net.ipv4.tcp_tw_reuse = 1              # 复用 TIME_WAIT 连接
net.ipv4.tcp_fin_timeout = 15          # 减小 TIME_WAIT 超时（默认 60s）
net.core.netdev_max_backlog = 10000    # 网卡队列长度

# 虚拟内存
vm.overcommit_memory = 1               # 允许内存超分配（fork() 需要）
vm.swappiness = 1                      # 尽量不使用 Swap（Redis 用 Swap 会严重降级）

# 文件描述符
fs.file-max = 100000                   # 系统级 FD 限制

# 禁用 Transparent Huge Pages（THP）
# THP 会导致 fork() 后的 COW 复制粒度从 4KB 变为 2MB，内存大幅膨胀
# echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

### Redis 关键参数最佳实践

```bash
# redis.conf 生产推荐配置

# ===== 基础 =====
daemonize no                     # 前台运行（Docker/Systemd 管理）
bind 0.0.0.0                    # 监听地址（防火墙控制访问）
port 6379
loglevel notice                  # 日志级别
logfile /var/log/redis/redis.log
databases 16                     # 数据库数量（通常只用 0）

# ===== 网络 =====
tcp-backlog 511                  # 与 somaxconn 配合
timeout 0                        # 不超时断开（连接池管理）
tcp-keepalive 300                # TCP 保活检测，5 分钟

# ===== 内存 =====
maxmemory 0                      # 0 = 不限制（**必须显式设置！**）
# maxmemory 2gb                  # 建议：系统内存的 50-70%
maxmemory-policy allkeys-lru     # 缓存场景推荐
maxmemory-samples 5              # LRU 采样数（越大越精确，越消耗 CPU）

# ===== 持久化 =====
# 混合持久化（推荐）
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes

# ===== 连接 =====
maxclients 10000                 # 最大连接数
timeout 0

# ===== 慢查询 =====
slowlog-log-slower-than 10000   # >10ms 的操作记录
slowlog-max-len 128

# ===== 高级 =====
activerehashing yes              # 开启渐进式 rehash
hz 10                            # 后台任务频率（10Hz，过期 key 清理等）
dynamic-hz yes                   # 动态调整 hz
```

### Java 客户端（Lettuce）连接池调优

```yaml
# application.yml
spring:
  data:
    redis:
      lettuce:
        pool:
          max-active: 32          # 最大连接数（不是越大越好）
          max-idle: 16            # 最大空闲连接
          min-idle: 8             # 最小空闲连接
          max-wait: 200ms         # 获取连接超时
          time-between-eviction-runs: 100ms
```

```java
// 连接池调优验证
public class ConnectionPoolTuner {

    public void verifyPoolConfig(StringRedisTemplate template) {
        // 用 JMeter/Gatling 加压测试
        // 监控指标：
        // 1. 获取连接耗时（如果 > 1ms，说明池不够大）
        // 2. 活跃连接数（如果持续达到 max-active，说明池不够大）
        // 3. 空闲连接数（如果经常为 0，说明池不够大）
        //
        // 调优经验：
        // max-active = 业务并发数 × 每次请求的 Redis 操作数
        // 通常 16-64 就够了，不要到几百
        // 100 个连接已经相当于 100 个 Redis 客户端
    }
}
```

## 本章总结

监控和调优是持续的过程，而不是一次性的工作：

**监控四步法**：
1. **指标采集**：Prometheus 每 10 秒拉取 INFO 指标
2. **可视化**：Grafana 仪表盘实时显示 6 个核心指标
3. **告警**：命中率 < 70%、延迟 > 10ms、内存 > 80% 时触发告警
4. **自动响应**：告警触发 → 自动执行预定义脚本（如触发碎片整理、扩容）

> **最重要的调优建议**：先加**监控**，再谈**调优**。没有数据支撑的"优化"往往是瞎猜。