# 第11章 监控指标与可观测性

## 本章导读

想象一个场景：凌晨 2 点，你在熟睡中被电话吵醒——"Netty 服务挂了，客户端全部无法连接"。你登录服务器发现进程还在，但没有任何反应。你开始排查：先看 CPU——正常。看内存——正常。看 GC 日志——正常。看日志——也没有任何异常信息。然后你想起来看看 EventLoop 的积压任务数——`NioEventLoop.pendingTasks()` 返回了 5 万。5 万个任务堆积在 EventLoop 的事件队列里，但 EventLoop 线程处理的速度赶不上入队的速度，导致所有的 I/O 事件都被延后了——新连接无法 accept，已有连接的数据无法读取。

如果提前配置了监控——EventLoop 积压任务数超过 1000 就触发告警——你在 1000 的时候就能收到通知，而不是等到 5 万（服务完全不可用）的时候才能发现。

这就是监控的价值：**在用户投诉之前发现问题**。Netty 应用的监控相比普通 Web 应用有更特殊的维度——连接数、EventLoop 积压、Direct Memory 使用量——这些指标在普通 Spring Boot 应用中并不常见，但在 Netty 应用中直接决定了服务的生死。

---

## 11.1 核心监控指标体系

### 六个必须监控的维度

```
Netty 服务的六个核心监控维度：

  维度 1：连接层
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  activeConnections         当前在线连接数                │
  │  connectionRate            每秒新建连接数                │
  │  closeRate                 每秒关闭连接数                │
  │  connectionsPeak           历史峰值连接数                │
  │                                                            │
  │  异常信号：连接数突然下降 50% → 可能是网络故障               │
  │           连接数接近上限（如 maxclients）→ 需要扩容          │
  └────────────────────────────────────────────────────────┘

  维度 2：吞吐量
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  bytesReadPerSec           每秒读取字节数                │
  │  bytesWrittenPerSec        每秒写入字节数                │
  │  messagesPerSec            每秒处理消息数                │
  │                                                            │
  │  异常信号：吞吐量突然下降 → 后端变慢或网络瓶颈                │
  │           吞吐量接近网卡上限 → 需要扩容                    │
  └────────────────────────────────────────────────────────┘

  维度 3：线程层（Netty 特有的核心指标）
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  eventLoopPendingTasks      EventLoop 积压任务数         │
  │  eventLoopIoRatio           I/O 事件处理占比             │
  │  eventLoopSelectCount       select 调用次数             │
  │                                                            │
  │  异常信号：pendingTasks > 1000 → EventLoop 处理不过来      │
  │           pendingTasks 持续增长 → Handler 中有阻塞操作    │
  └────────────────────────────────────────────────────────┘

  维度 4：内存层
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  directMemoryUsage          直接内存使用量                │
  │  heapMemoryUsage            堆内存使用量                  │
  │  fragmentationRatio         内存碎片率（Pooled 模式下）   │
  │                                                            │
  │  异常信号：directMemory 持续增长 → ByteBuf 泄漏            │
  │           heapMemory 持续增长 → 业务代码内存泄漏           │
  └────────────────────────────────────────────────────────┘

  维度 5：异常层
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  exceptionsPerSec           每秒异常数                    │
  │  failedWrites               写入失败次数                  │
  │  clientConnectionFailures   客户端连接失败次数            │
  │                                                            │
  │  异常信号：exceptions > 0 → 有异常需要关注                 │
  │           failedWrites 增长 → 客户端可能假死               │
  └────────────────────────────────────────────────────────┘

  维度 6：GC 层
  ┌────────────────────────────────────────────────────────┐
  │  指标                       意义                        │
  │  youngGcFrequency           Young GC 频率                 │
  │  fullGcFrequency            Full GC 频率                 │
  │  gcPauseMs                  GC 暂停时间                   │
  │                                                            │
  │  异常信号：Full GC > 1 次/小时 → 堆内存出现问题            │
  │           GC 暂停 > 200ms → Netty 响应时间会受影响         │
  └────────────────────────────────────────────────────────┘
```

**为什么 EventLoop 积压任务是 Netty 最重要的预警指标？** 因为它反映了**线程处理能力 vs 任务入队速度**的平衡关系。当某个 EventLoop 线程的处理速度跟不上任务入队速度时，积压任务数就会增长。这通常意味着这个 EventLoop 管理的某个 Channel 的 Handler 中有耗时操作阻塞了线程——而这个阻塞会影响这个 EventLoop 管理的所有其他 Channel。

### 通过 Micrometer + Prometheus 暴露指标

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```java
/**
 * Netty 指标收集器
 *
 * 通过 Micrometer 将指标暴露给 Prometheus
 * Prometheus 每 5 秒拉取一次
 */
@Component
public class NettyMetricsCollector {

    private final MeterRegistry meterRegistry;

    // 连接相关
    private final AtomicInteger activeConnections = new AtomicInteger(0);
    private final AtomicInteger newConnectionsSinceReport = new AtomicInteger(0);

    // 吞吐量
    private final Counter totalBytesRead;
    private final Counter totalBytesWritten;

    // 异常
    private final Counter totalExceptions;
    private final Counter totalFailedWrites;

    public NettyMetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;

        // ===== 注册 Counter 指标 =====
        totalBytesRead = Counter.builder("netty.bytes.read.total")
            .description("累计读取字节数")
            .register(meterRegistry);

        totalBytesWritten = Counter.builder("netty.bytes.written.total")
            .description("累计写入字节数")
            .register(meterRegistry);

        totalExceptions = Counter.builder("netty.exceptions.total")
            .description("累计异常数")
            .register(meterRegistry);

        totalFailedWrites = Counter.builder("netty.writes.failed")
            .description("写入失败次数")
            .register(meterRegistry);

        // ===== 注册 Gauge 指标 =====
        // Gauge 适合"当前值"类型（连接数、积压任务数等）
        meterRegistry.gauge("netty.connections.active",
            activeConnections, AtomicInteger::doubleValue);
    }

    // ===== 记录方法 =====
    public void recordBytesRead(long bytes) { totalBytesRead.increment(bytes); }

    public void recordBytesWritten(long bytes) { totalBytesWritten.increment(bytes); }

    public void recordException() { totalExceptions.increment(); }

    public void recordFailedWrite() { totalFailedWrites.increment(); }

    public int incrementConnections() { return activeConnections.incrementAndGet(); }

    public int decrementConnections() { return activeConnections.decrementAndGet(); }

    public void recordNewConnection() { newConnectionsSinceReport.incrementAndGet(); }

    /**
     * 连接速率（每秒新建连接数），每 5 秒计算一次
     */
    @Scheduled(fixedRate = 5000)
    public void reportConnectionRate() {
        int rate = newConnectionsSinceReport.getAndSet(0);
        meterRegistry.gauge("netty.connections.rate",
            (double) rate / 5.0);
    }
}
```

### 在 Pipeline 中嵌入指标收集 Handler

```java
/**
 * 指标收集 Handler
 *
 * 嵌入每一个连接的 Pipeline 中
 * 拦截所有读写操作和连接事件，上报到 MetricsCollector
 *
 * 注意：这个 Handler 必须用 @Sharable 注解，因为是单例
 */
@Sharable
@Component
public class MetricsHandler extends ChannelDuplexHandler {

    @Autowired
    private NettyMetricsCollector metricsCollector;

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        metricsCollector.incrementConnections();
        metricsCollector.recordNewConnection();
        ctx.fireChannelActive();
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        metricsCollector.decrementConnections();
        ctx.fireChannelInactive();
    }

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        if (msg instanceof ByteBuf) {
            metricsCollector.recordBytesRead(
                ((ByteBuf) msg).readableBytes());
        }
        ctx.fireChannelRead(msg);
    }

    @Override
    public void write(ChannelHandlerContext ctx, Object msg,
                      ChannelPromise promise) {
        if (msg instanceof ByteBuf) {
            metricsCollector.recordBytesWritten(
                ((ByteBuf) msg).readableBytes());
        }
        // 监听写入结果
        ctx.write(msg, promise);
        promise.addListener((ChannelFutureListener) f -> {
            if (!f.isSuccess()) {
                metricsCollector.recordFailedWrite();
            }
        });
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx,
                                Throwable cause) {
        metricsCollector.recordException();
        ctx.fireExceptionCaught(cause);
    }
}
```

### EventLoop 线程健康监控

```java
/**
 * EventLoop 线程健康监控
 *
 * 这是 Netty 应用最重要的监控组件
 * 每个 NioEventLoop 都有一个 pendingTasks 队列
 * 如果这个队列持续增长，说明 EventLoop 处理不过来了
 */
@Component
public class EventLoopHealthMonitor {

    private final NioEventLoopGroup workerGroup;
    private final MeterRegistry meterRegistry;

    public EventLoopHealthMonitor(
            @Qualifier("workerGroup") NioEventLoopGroup workerGroup,
            MeterRegistry meterRegistry) {
        this.workerGroup = workerGroup;
        this.meterRegistry = meterRegistry;

        // 每 10 秒检查一次所有 EventLoop 的健康状态
        new ScheduledThreadPoolExecutor(1)
            .scheduleAtFixedRate(this::checkAllEventLoops,
                0, 10, TimeUnit.SECONDS);
    }

    private void checkAllEventLoops() {
        for (EventExecutor executor : workerGroup) {
            if (!(executor instanceof NioEventLoop)) continue;

            NioEventLoop loop = (NioEventLoop) executor;
            int pendingTasks = loop.pendingTasks();
            String threadName = loop.threadProperties().name();

            // 上报到 Prometheus
            meterRegistry.gauge("netty.eventloop.pending.tasks",
                Tags.of("name", threadName), pendingTasks);

            // 告警逻辑——三个级别
            if (pendingTasks > 5000) {
                // 严重告警：积压超过 5000
                log.error("EventLoop {} 积压 {} 个任务，" +
                    "严重告警！可能有一个阻塞的 Handler", threadName, pendingTasks);
            } else if (pendingTasks > 1000) {
                // 警告：积压超过 1000
                log.warn("EventLoop {} 积压 {} 个任务，" +
                    "需要关注", threadName, pendingTasks);
            }

            // 检查线程状态
            Thread.State state = loop.threadProperties().state();
            if (state == Thread.State.BLOCKED) {
                log.warn("EventLoop {} 线程处于 BLOCKED 状态", threadName);
            } else if (state == Thread.State.WAITING) {
                // WAITING 是正常的（selector.select() 时会等待）
            }
        }
    }
}
```

---

## 11.2 集成 Prometheus + Grafana

### Prometheus 抓取配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'netty-server'
    scrape_interval: 5s            # 每 5 秒拉取一次
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets:
          - 'netty-server-1:8080'
          - 'netty-server-2:8080'
          - 'netty-server-3:8080'
```

### Grafana 面板设计

```
Netty 监控面板（5 行布局）：

  第 1 行：连接概览
  ┌────────────────────┬─────────────────────┬────────────────────┐
  │ 活跃连接数          │ 连接速率 /s          │ 连接关闭速率 /s     │
  │ Gauge: 12,345      │ Graph: 线图         │ Graph: 线图         │
  │ 告警: >50000       │                     │                     │
  ├────────────────────┴─────────────────────┴────────────────────┤
  │ 连接数趋势（24 小时）                                           │
  │ 面基图 + 预测线                                               │
  └───────────────────────────────────────────────────────────────┘

  第 2 行：吞吐量
  ┌──────────────────────────────────────────────────────────────┐
  │ 网络吞吐量                                                    │
  │ 2 条线：Bytes Read/s（蓝）、Bytes Written/s（绿）             │
  │ 堆叠面基图 + 网卡上限红线                                     │
  └──────────────────────────────────────────────────────────────┘

  第 3 行：EventLoop 健康（最重要的面板）
  ┌──────────────────────────────────────────────────────────────┐
  │ EventLoop 积压任务数                                          │
  │ 每个 EventLoop 一条线（用标签区分）                             │
  │ 告警红线: 1000                                                │
  │                                                               │
  │ 正常情况下：所有线都在 0-10 之间                                │
  │ 如果有一条线突然上升：那个 EventLoop 管理的某个 Channel 出问题了  │
  └──────────────────────────────────────────────────────────────┘

  第 4 行：异常与错误
  ┌────────────────────┬────────────────────────────────────────┐
  │ 异常数 /s          │ 写入失败数 /s                           │
  │ Counter: 速率图    │ Counter: 速率图                         │
  │ 告警: >10/s        │ 告警: >5/s                              │
  └────────────────────┴────────────────────────────────────────┘

  第 5 行：内存
  ┌────────────────────┬────────────────────────────────────────┐
  │ JVM 堆内存          │ Direct Memory                          │
  │ 堆叠面基图:       │ 线图                                    │
  │ Eden / Survivor / Old│ 告警: 持续增长 -> 可能泄漏              │
  └────────────────────┴────────────────────────────────────────┘
```

### 告警规则

```yaml
# prometheus-alerts.yml
groups:
  - name: netty-critical
    rules:
      # 告警 1：连接数异常下降（可能是网络故障）
      - alert: ConnectionsDrop
        expr: rate(netty_connections_active[5m]) < 0.5
          or delta(netty_connections_active[1m]) < -10000
        for: 1m
        annotations:
          summary: "连接数骤降！可能发生网络故障"

      # 告警 2：EventLoop 积压（最重要的告警）
      - alert: EventLoopBacklog
        expr: netty_eventloop_pending_tasks > 5000
        for: 30s
        annotations:
          summary: "EventLoop 任务积压 > 5000，Handler 可能被阻塞"

      # 告警 3：Direct Memory 持续增长（泄漏嫌疑）
      - alert: DirectMemoryLeak
        expr: rate(netty_direct_memory_bytes[30m]) > 0
        for: 10m
        annotations:
          summary: "Direct Memory 持续增长，疑似泄漏"

      # 告警 4：异常率飙升
      - alert: ExceptionRateHigh
        expr: rate(netty_exceptions_total[5m]) > 100
        for: 1m
        annotations:
          summary: "异常率 > 100/s"

      # 告警 5：GC 暂停时间过长
      - alert: LongGcPause
        expr: jvm_gc_pause_seconds_max > 0.5
        for: 1m
        annotations:
          summary: "GC 暂停 > 500ms，Netty 响应时间将受明显影响"
```

---

## 本章总结

| 监控维度 | 关键指标 | 正常范围 | 告警阈值 | 为什么重要 |
|---------|---------|---------|---------|-----------|
| **连接** | 活跃连接数 | 预期的 60-80% | >90% 或 <50% | 容量规划和故障检测 |
| **吞吐** | 字节读写速率 | 网卡上限的 50% | >80% | 扩容信号 |
| **线程** | EventLoop 积压 | <10 | >1000（警告）>5000（严重） | **Netty 最重要的指标** |
| **内存** | Direct Memory | 稳定或缓慢增长 | 持续增长 | ByteBuf 泄漏检测 |
| **异常** | 异常率 | 0 | >10/s | 代码质量 |
| **GC** | Full GC 频率 | <1 次/天 | >1 次/小时 | 堆内存问题 |

**核心原则**：
1. **没有监控的生产系统等于裸奔**——线上出现性能问题你都不知道，直到用户投诉。在 Netty 场景中，很多问题（EventLoop 积压、Direct Memory 泄漏）在监控中比在日志中更容易发现
2. **EventLoop 积压任务是 Netty 最重要的预警指标**——它直接反映了"线程是否健康"。一旦积压超过 1000，说明 EventLoop 线程已经处理不过来了。这时候去看这个 EventLoop 的线程堆栈，大概率能找到阻塞点
3. **Direct Memory 泄漏是 Netty 特有的"无声杀手"**——在 OOM 之前，GC 不会给你任何提示。Heap Memory 正常，但进程 RSS 持续增长。监控 `directMemoryUsage` 的长期趋势是发现泄漏的唯一方式
4. **告警要分级，不要每个指标都配成 P0**——EventLoop 积压超过 5000 是 P0，超过 1000 是 P1。异常率超过 100/s 可能是临时的网络抖动（P1），超过 1000/s 才是 P0。分级告警能减少"狼来了"效应