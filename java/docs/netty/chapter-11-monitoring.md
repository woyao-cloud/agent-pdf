# 第11章 监控指标与可观测性

## 11.1 核心监控指标体系

Netty 应用在生产环境中必须具备**可观测性**——你知道它在干什么、干得怎么样、有没有出问题。

```
Netty 必须监控的核心指标：

  连接层：
  ├── activeConnections（当前活跃连接数）
  ├── connectionRate（连接速率，每秒新建连接数）
  └── connectionCloseRate（关闭速率）

  吞吐量：
  ├── bytesReadPerSec（每秒读取字节数）
  ├── bytesWrittenPerSec（每秒写入字节数）
  └── messagesPerSec（每秒处理消息数）

  线程层：
  ├── pendingTasks（EventLoop 积压任务数）
  ├── ioRatio（I/O 事件占比）
  └── selectCount（select 调用次数）

  内存层：
  ├── directMemoryUsage（直接内存使用量）
  ├── heapMemoryUsage（堆内存使用量）
  └── byteBufAllocations（ByteBuf 分配数 / 回收数）

  异常层：
  ├── exceptionsPerSec（每秒异常数）
  ├── channelInactive（连接断开事件）
  └── failedWrites（写入失败次数）
```

### 通过 Micrometer 暴露 Netty 指标

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
 * 收集 Netty 内部的各种指标，通过 Micrometer 暴露给 Prometheus
 */
@Component
public class NettyMetricsCollector {

    private final MeterRegistry meterRegistry;

    // 全局连接数计数器
    private final AtomicInteger activeConnections = new AtomicInteger(0);
    private final Counter totalBytesRead;
    private final Counter totalBytesWritten;
    private final Counter totalExceptions;

    public NettyMetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;

        // 注册 Prometheus 指标
        this.totalBytesRead = Counter.builder("netty.bytes.read")
            .description("Total bytes read")
            .register(meterRegistry);

        this.totalBytesWritten = Counter.builder("netty.bytes.written")
            .description("Total bytes written")
            .register(meterRegistry);

        this.totalExceptions = Counter.builder("netty.exceptions.total")
            .description("Total exceptions")
            .register(meterRegistry);

        // Gauge 类型指标
        meterRegistry.gauge("netty.connections.active",
            activeConnections, AtomicInteger::doubleValue);
    }

    public void recordBytesRead(long bytes) {
        totalBytesRead.increment(bytes);
    }

    public void recordBytesWritten(long bytes) {
        totalBytesWritten.increment(bytes);
    }

    public void recordException() {
        totalExceptions.increment();
    }

    public int incrementConnections() {
        return activeConnections.incrementAndGet();
    }

    public int decrementConnections() {
        return activeConnections.decrementAndGet();
    }

    // 连接速率统计（每 5 秒内的新建连接数）
    private final AtomicInteger newConnectionsSinceLastReport = new AtomicInteger(0);

    public void recordNewConnection() {
        newConnectionsSinceLastReport.incrementAndGet();
    }

    @Scheduled(fixedRate = 5000)
    public void reportConnectionRate() {
        int rate = newConnectionsSinceLastReport.getAndSet(0);
        meterRegistry.gauge("netty.connections.rate",
            rate / 5.0); // 每秒连接数
    }
}
```

### Pipeline 中添加指标收集 Handler

```java
/**
 * 指标收集 Handler——嵌入 Pipeline 收集网络 I/O 数据
 *
 * 这个 Handler 会拦截所有读写操作，记录字节数
 */
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
            metricsCollector.recordBytesRead(((ByteBuf) msg).readableBytes());
        } else if (msg instanceof ByteBufHolder) {
            metricsCollector.recordBytesRead(
                ((ByteBufHolder) msg).content().readableBytes());
        }
        ctx.fireChannelRead(msg);
    }

    @Override
    public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) {
        if (msg instanceof ByteBuf) {
            metricsCollector.recordBytesWritten(((ByteBuf) msg).readableBytes());
        } else if (msg instanceof ByteBufHolder) {
            metricsCollector.recordBytesWritten(
                ((ByteBufHolder) msg).content().readableBytes());
        }
        ctx.write(msg, promise);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        metricsCollector.recordException();
        ctx.fireExceptionCaught(cause);
    }
}
```

### EventLoop 线程监控

```java
/**
 * EventLoop 线程健康监控
 *
 * 核心关注指标：
 *   1. pendingTasks：EventLoop 的积压任务数（超过 1000 说明处理不过来）
 *   2. ioRatio：I/O 事件和 task 的执行比例
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

        // 定时检查 EventLoop 健康状态
        new ScheduledThreadPoolExecutor(1).scheduleAtFixedRate(
            this::checkEventLoopHealth, 0, 10, TimeUnit.SECONDS);
    }

    private void checkEventLoopHealth() {
        for (EventExecutor executor : workerGroup) {
            if (executor instanceof NioEventLoop) {
                NioEventLoop loop = (NioEventLoop) executor;
                int pendingTasks = loop.pendingTasks();

                // 上报积压任务数
                meterRegistry.gauge("netty.eventloop.pending.tasks",
                    Tags.of("name", loop.threadProperties().name()),
                    pendingTasks);

                // 积压任务过多 → 告警
                if (pendingTasks > 1000) {
                    log.error("EventLoop {} 积压 {} 个任务，可能处理不过来了！",
                        loop.threadProperties().name(), pendingTasks);
                }

                // 检查线程状态
                if (loop.threadProperties().state() == Thread.State.BLOCKED) {
                    log.warn("EventLoop 线程处于 BLOCKED 状态: {}",
                        loop.threadProperties().name());
                }
            }
        }
    }
}
```

## 11.2 集成 Prometheus + Grafana

### Prometheus 抓取配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'netty-server'
    scrape_interval: 5s
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['localhost:8080']
```

### Grafana 面板设计

```
建议的 Grafana 监控面板布局：

  Row 1：连接概览
  ┌─────────────────┬─────────────────┬─────────────────┐
  │ 活跃连接数       │ 连接速率/s       │ 关闭速率/s       │
  │ (Gauge)         │ (Gauge)         │ (Gauge)         │
  └─────────────────┴─────────────────┴─────────────────┘

  Row 2：吞吐量
  ┌─────────────────────────────────────────────────────┐
  │ 网络吞吐量                                            │
  │ (Bytes Read/s + Bytes Written/s, 堆叠面积图)         │
  └─────────────────────────────────────────────────────┘

  Row 3：线程健康
  ┌─────────────────────────────────────────────────────┐
  │ EventLoop 积压任务数（每个 EventLoop 一条线）          │
  └─────────────────────────────────────────────────────┘

  Row 4：异常与错误
  ┌─────────────────┬───────────────────────────────────┐
  │ 异常数/s         │ 写入失败数/s                        │
  │ (Counter)        │ (Counter)                         │
  └─────────────────┴───────────────────────────────────┘

  Row 5：内存
  ┌─────────────────────────────────────────────────────┐
  │ JVM 堆内存 + Direct Memory 使用量                    │
  │ (堆叠面积图)                                         │
  └─────────────────────────────────────────────────────┘
```

### 告警规则

```yaml
# prometheus-alerts.yml
groups:
  - name: netty-alerts
    rules:
      # 连接数异常
      - alert: ConnectionsSurge
        expr: rate(netty_connections_active[1m]) > 5000
        for: 30s
        annotations:
          summary: "连接数激增"

      # EventLoop 积压
      - alert: EventLoopBacklog
        expr: netty_eventloop_pending_tasks > 5000
        for: 1m
        annotations:
          summary: "EventLoop 任务积压"

      # Direct Memory 泄漏
      - alert: DirectMemoryLeak
        expr: jvm_memory_used_bytes{area="nonheap",id="Direct"} > 1e9
        for: 5m
        annotations:
          summary: "Direct Memory 可能泄漏"

      # 异常率飙升
      - alert: ExceptionRateHigh
        expr: rate(netty_exceptions_total[1m]) > 100
        for: 1m
        annotations:
          summary: "异常率过高 > 100/s"
```

---

## 本章总结

| 监控维度 | 关键指标 | 告警阈值 |
|---------|---------|---------|
| **连接** | 活跃连接数、连接速率 | 超过预期的 80% |
| **吞吐** | 字节读写速率 | 接近网卡上限 |
| **线程** | EventLoop 积压任务数 | 超过 1000 |
| **内存** | Direct Memory 使用量 | 超过 1GB |
| **异常** | 异常率 | 超过 100/s |

**核心原则**：
1. **没有监控的生产系统等于裸奔**——线上出现问题你都不知道，直到用户投诉
2. **EventLoop 积压任务是 Netty 最重要的预警指标**——一旦积压超过 1000，说明已经处理不过来了
3. **Direct Memory 泄漏是 Netty 特有的"无声杀手"**——在 OOM 之前，GC 不会给你任何提示