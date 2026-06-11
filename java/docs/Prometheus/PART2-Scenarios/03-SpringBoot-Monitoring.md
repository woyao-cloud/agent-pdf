# 第3章 场景一：微服务应用级监控（以 Spring Boot 为例）

## 3.1 Micrometer 门面模式

### Micrometer 是什么？

Micrometer 是 Java 生态中最流行的指标采集门面（Facade）库，其定位类似于 SLF4J 在日志领域的角色。它定义了一套统一的 API，开发者通过这套 API 采集指标，而具体的"后端"（Prometheus、Datadog、InfluxDB 等）由运行时绑定的依赖决定。

这种门面模式带来的好处是显而易见的：**你的业务代码只需要依赖 Micrometer 的抽象 API，更换监控后端时无需修改一行业务代码。**

### 核心概念

| 概念 | 说明 | 类比 |
|------|------|------|
| MeterRegistry | 指标注册中心，管理所有 Meter | LoggerFactory |
| Meter | 所有指标的父接口 | Logger |
| Counter | 单调递增计数器 | 计数器 |
| Timer | 耗时统计 | 秒表 |
| Gauge | 瞬时值快照 | 仪表盘指针 |
| DistributionSummary | 分布统计（不含时间） | 无需时间维度的 Histogram |

### Spring Boot 自动装配

Spring Boot 3.x 通过 `io.micrometer:micrometer-registry-prometheus` 依赖自动完成以下配置：

1. 创建 `PrometheusMeterRegistry` 实例并将其注册为 `MeterRegistry` Bean
2. 自动绑定 JVM、Tomcat、数据源等内置指标的 Meter
3. 在 `/actuator/prometheus` 端点暴露 Prometheus 格式的指标

有了这些自动配置，一个最简单的 Spring Boot + Prometheus 监控只需要三步：

1. 引入 `spring-boot-starter-actuator` 和 `micrometer-registry-prometheus`
2. 在 `application.yml` 中暴露 prometheus 端点
3. 在 Prometheus 中配置 scrape 目标

## 3.2 Spring Boot 内置指标详解

### JVM 指标

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `jvm_memory_used_bytes{area="heap"}` | Gauge | 堆内存已用量 |
| `jvm_memory_used_bytes{area="nonheap"}` | Gauge | 非堆内存已用量 |
| `jvm_memory_max_bytes` | Gauge | JVM 最大内存 |
| `jvm_gc_pause_seconds` | Timer | GC 暂停时间（含 _count / _sum / _max） |
| `jvm_threads_live_threads` | Gauge | 活跃线程数 |
| `jvm_classes_loaded_classes` | Gauge | 已加载类数量 |

```bash
# 在 Spring Boot 应用启动后查看 JVM 指标
curl http://localhost:8085/actuator/prometheus | grep jvm_
```

### Tomcat 指标

| 指标名 | 说明 |
|--------|------|
| `tomcat_sessions_active_current_sessions` | 当前活跃 Session 数 |
| `tomcat_sessions_created_sessions_total` | 累计创建的 Session 数 |
| `tomcat_sessions_expired_sessions_total` | 累计过期的 Session 数 |

### 数据源指标（HikariCP）

| 指标名 | 说明 |
|--------|------|
| `hikaricp_connections_active` | 活跃连接数 |
| `hikaricp_connections_idle` | 空闲连接数 |
| `hikaricp_connections_pending` | 等待获取连接的线程数 |
| `hikaricp_connections_timeout_total` | 连接超时次数 |

### HTTP 请求指标

Spring Boot Actuator 自动记录所有 HTTP 请求的指标，这是最常用也最需要关注的指标组：

```
http_server_requests_seconds_count{method="GET", uri="/api/users", status="200"}
http_server_requests_seconds_sum{method="GET", uri="/api/users", status="200"}
http_server_requests_seconds_max{method="GET", uri="/api/users", status="200"}
```

**高基数风险就在这里**：`uri` 标签捕获了请求的完整路径。如果应用有 `/api/user/12345/profile` 这种动态路径，每个用户 ID 都会产生一条新的时间序列。当用户量达到 10 万时，仅仅这一个指标就能产生 10 万条序列。

## 3.3 自定义业务指标

### 使用 @Timed 注解

Spring Boot 应用中，在方法上标注 `@Timed` 是最简单的自定义指标方式：

```java
@Timed(value = "order_create_seconds", percentiles = {0.5, 0.95, 0.99})
@PostMapping("/create")
public String createOrder(@RequestParam Long userId) {
    // 业务逻辑
    return "ok";
}
```

这会自动生成：
- `order_create_seconds_count` — 调用次数
- `order_create_seconds_sum` — 总耗时
- `order_create_seconds_max` — 最大耗时
- `order_create_seconds_bucket{le="..."}` — 直方图

### 手动注册 Meter

对于更复杂的场景，可以注入 `MeterRegistry` 并手动注册：

```java
@Component
public class CustomMetricsConfig {
    private final MeterRegistry meterRegistry;

    public CustomMetricsConfig(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @PostConstruct
    public void init() {
        // Counter
        meterRegistry.counter("order_created_total", "currency", "CNY");

        // Gauge（从 AtomicInteger 取值）
        Gauge.builder("app_active_users", activeUsers, AtomicInteger::get)
                .register(meterRegistry);

        // Timer（精细控制 bucket 边界）
        Timer.builder("payment_processing_seconds")
                .sla(Duration.ofMillis(50), Duration.ofMillis(100),
                     Duration.ofMillis(200), Duration.ofMillis(500))
                .publishPercentileHistogram()
                .register(meterRegistry);
    }
}
```

## 3.4 潜在风险与优化

### 高基数灾难

**问题**：Spring Boot 的 `http_server_requests_seconds` 指标会记录请求的完整 URI。如果 URI 中包含动态 ID（如 `/api/user/12345/profile`），则每个用户都产生一条序列。

**后果**：10 万用户 → 10 万条时间序列 → Prometheus 内存爆炸 → OOM。

**解决方案**：在 Prometheus 端通过 `metric_relabel_configs` 对 URI 进行泛化清洗。

```yaml
metric_relabel_configs:
  # 将 /api/user/12345/profile 泛化为 /api/user/{id}/profile
  - source_labels: [__name__, uri]
    regex: 'http_server_requests_seconds.*;/api/user/\d+(/.*)?'
    target_label: uri
    replacement: '/api/user/{id}${1}'

  # 丢弃 trace_id/span_id 等高基数标签
  - regex: 'trace_id|span_id|parent_id'
    action: labeldrop
```

### JVM Full GC 导致抓取超时

**问题**：应用发生 Full GC 时，所有线程（包括 HTTP 请求处理线程）都会暂停。如果 Prometheus 恰好在此时 scrape，会连接超时，标记目标为 DOWN。

**后果**：Prometheus 告警系统可能误报"服务宕机"。

**解决方案**：
1. 增加 JVM 堆内存，减少 Full GC 频率
2. 调优 GC 算法（使用 G1GC 或 ZGC）
3. 适当调整 `scrape_timeout`（默认 10s 通常已足够）
4. 不要仅依赖一个 scrape 周期来判断目标状态

### Histogram Bucket 优化

**问题**：默认的 `http_server_requests_seconds` bucket 边界是 `.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10`。如果应用的典型延迟是 1ms-5ms，这些 bucket 太粗了。

**优化**：根据业务特征自定义 bucket 边界，保证目标延迟（如 200ms）附近有足够的 bucket 密度。

```java
// 对于"必须在 200ms 内响应"的服务
Timer.builder("api_latency_seconds")
    .sla(Duration.ofMillis(50), Duration.ofMillis(100),
         Duration.ofMillis(150), Duration.ofMillis(200),
         Duration.ofMillis(300), Duration.ofMillis(500))
    .register(meterRegistry);
```

### 生产环境检查清单

- [ ] 是否已配置 `metric_relabel_configs` 清洗动态 URI？
- [ ] 是否已丢弃 `trace_id`、`span_id` 等高基数标签？
- [ ] JVM 启动参数是否已配置合理的堆大小和 GC 算法？
- [ ] Prometheus 的 `scrape_timeout` 是否与应用响应时间匹配？
- [ ] Histogram 的 bucket 边界是否符合业务 SLA？

## 3.5 PromQL 速查

```promql
# JVM 堆内存使用率
avg(jvm_memory_used_bytes{area="heap"}) / avg(jvm_memory_max_bytes) * 100

# GC 暂停频率
rate(jvm_gc_pause_seconds_count[5m])

# QPS（按端点拆分）
rate(http_server_requests_seconds_count[1m])

# P99 延迟
histogram_quantile(0.99, rate(http_server_requests_seconds_bucket[1m]))

# 活跃线程数
jvm_threads_live_threads
```

## 本章小结

- Micrometer 是 Java 监控的门面标准，类似 SLF4J
- Spring Boot Actuator 自动暴露丰富的 JVM、Tomcat、数据源指标
- 动态 URI 标签是高基数的头号来源，必须用 Relabeling 防护
- Histogram bucket 应根据业务特征定制，而非使用默认值
- Full GC 可能导致 scrape 超时，需从 JVM 和 Prometheus 两端优化
- 实践：[Spring Boot 监控实验](../labs/ch03-springboot/README.md)