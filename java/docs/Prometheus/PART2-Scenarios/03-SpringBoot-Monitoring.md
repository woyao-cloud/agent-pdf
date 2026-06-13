# 第3章 Spring Boot 监控：从应用到生产

## 3.1 故事：URI 包含动态用户 ID，序列数从 100 涨到 10 万

某医疗健康公司使用 Spring Boot 开发了患者管理系统。API 设计如下：

```java
@RestController
public class PatientController {

    @GetMapping("/api/patients/{patientId}/records")
    public List<Record> getRecords(@PathVariable String patientId) {
        // 返回患者的病历记录
    }
}
```

运维团队配置了 Micrometer 监控，一切看起来正常。然而上线一周后，Prometheus 开始 OOM。

**排查过程**：

1. 查看 Prometheus 序列数：从 100 涨到 10 万
2. 使用 `promtool tsdb analyze` 分析高基数标签
3. 发现 `uri` 标签的基数高达 8 万
4. 进一步分析发现：`/api/patients/{patientId}/records` 中的 `patientId` 被当成了 URI 的一部分

```promql
# 实际产生的指标（每个患者一个序列！）
http_server_requests_seconds_count{uri="/api/patients/1001/records"}
http_server_requests_seconds_count{uri="/api/patients/1002/records"}
http_server_requests_seconds_count{uri="/api/patients/1003/records"}
# ... 每个患者都产生一个新序列
```

**根因**：Micrometer 默认将完整 URI 路径作为标签值。动态路径参数导致每个患者 ID 都成为一个新的时间序列。

**解决方案**：配置 Spring Boot 将 URI 模板化，只保留路径模式而非具体值。

### 解决方案：配置 URI 标签为模板模式

```yaml
# application.yml
server:
  tomcat:
    mbeanregistry:
      enabled: true

management:
  metrics:
    web:
      server:
        # 关键配置：使用 URI 模板而非完整路径
        # 这样 /api/patients/1001/records 会变成 /api/patients/{patientId}/records
        auto-time-requests: true
    tags:
      # 全局标签：所有指标自动带上这些标签
      application: ${spring.application.name}
      environment: ${env:production}
```

**效果**：序列数从 10 万降回 100，Prometheus 内存使用恢复正常。

---

## 3.2 原理比喻：Micrometer = SLF4J 的指标版

如果你熟悉 SLF4J（Java 日志门面），那么理解 Micrometer 就很容易。

```
SLF4J（日志）                      Micrometer（指标）
─────────────────────────────────────────────────
Logger logger                      MeterRegistry registry
  ↓                                  ↓
LoggerFactory.getLogger()           Metrics.globalRegistry
  ↓                                  ↓
logger.info("msg")                  Counter.counter("name")
  ↓                                  ↓
Logback / Log4j（实现）             Micrometer（注册表）
  ↓                                  ↓
文件 / 控制台                       Prometheus / Datadog（后端）
```

### 核心概念对应

| SLF4J | Micrometer |
|-------|-----------|
| Logger（日志记录器） | Meter（度量器） |
| LoggerFactory | Metrics（全局注册表） |
| log.info("msg") | counter.increment() |
| MDC（诊断上下文） | Tags（标签） |
| Appender（输出端） | Registry（注册表） |
| 日志级别 | 指标类型（Counter/Gauge/...） |

### Micrometer 的四种核心指标类型

```java
// 1. Counter（计数器）—— 只增不减，适合计数
// 就像里程表：只会增加，不会减少
Counter requestCount = Counter.builder("http.requests.total")
    .tag("method", "GET")
    .register(registry);
requestCount.increment();

// 2. Gauge（仪表盘）—— 可增可减，适合瞬时值
// 就像汽车油表：随时变化，反映当前状态
Gauge activeUsers = Gauge.builder("users.active", userService,
    UserService::getActiveCount)
    .register(registry);

// 3. Timer（计时器）—— 测量耗时和频率
// 就像秒表：记录每次操作的耗时
Timer timer = Timer.builder("api.response.time")
    .tag("endpoint", "/login")
    .register(registry);
timer.record(() -> {
    // 需要计时的代码
    loginService.login(request);
});

// 4. DistributionSummary（分布摘要）—— 测量数据分布
// 就像统计全班考试成绩：有平均分、中位数、P99
DistributionSummary summary = DistributionSummary.builder("payment.amount")
    .tag("currency", "CNY")
    .register(registry);
```

---

## 3.3 代码旁白：application.yml 逐行解释

```yaml
spring:
  application:
    # 应用名称，会作为 Prometheus 的 job 标签
    name: user-service

server:
  port: 8080
  tomcat:
    mbeanregistry:
      # 启用 Tomcat MBean 注册
      # 这样 Micrometer 可以采集 Tomcat 线程池、连接数等指标
      enabled: true

management:
  endpoints:
    web:
      exposure:
        # 暴露所有 Actuator 端点（生产环境建议按需开放）
        # 为什么？Prometheus 只需要 /actuator/prometheus
        # 其他端点可能泄露敏感信息
        include: health,info,prometheus

  metrics:
    web:
      server:
        # 自动为所有 Web 请求计时
        auto-time-requests: true

        # 请求指标的白名单
        # 只统计这些路径，其他路径忽略
        # 可以避免健康检查等高频路径污染指标
        # request-match-patterns:
        #   - "/api/**"

    distribution:
      # 百分位数的精确度配置
      # 为什么配置？默认不计算 P99/P95，需要显式开启
      percentiles-histogram:
        http.server.requests: true
      # SLA 边界值（毫秒）
      # 为什么？计算小于 10ms/100ms/1000ms 的请求占比
      sla:
        http.server.requests: 10ms, 100ms, 1000ms

    tags:
      # 全局标签：附加到所有指标上
      application: ${spring.application.name}
      environment: ${env:production}
```

### 对应的 Java 配置

```java
@Configuration
public class MetricsConfig {

    @Bean
    public MeterRegistryCustomizer<MeterRegistry> metricsCommonTags() {
        // 为所有指标添加全局标签
        // 相当于 application.yml 中的 management.metrics.tags
        return registry -> registry.config()
            .commonTags("application", "user-service",
                       "environment", "production");
    }

    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        // 启用 @Timed 注解
        // 这样可以在方法级别控制哪些方法需要计时
        return new TimedAspect(registry);
    }
}
```

---

## 3.4 手把手：从创建 Spring Boot 项目到 Grafana 展示指标

### 步骤 1：创建 Spring Boot 项目

使用 Spring Initializr（https://start.spring.io/）创建项目，添加以下依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

### 步骤 2：编写一个简单的 REST 控制器

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        log.info("Fetching user: {}", id);
        // 模拟数据库查询延迟
        try {
            Thread.sleep((long) (Math.random() * 100));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return new User(id, "user" + id);
    }

    @PostMapping
    public User createUser(@RequestBody User user) {
        log.info("Creating user: {}", user);
        // 模拟创建操作
        return user;
    }
}
```

### 步骤 3：验证指标端点

启动应用后，访问以下 URL 验证指标是否正常工作：

```bash
# 1. 健康检查
curl http://localhost:8080/actuator/health
# 返回: {"status":"UP"}

# 2. 查看所有暴露的端点
curl http://localhost:8080/actuator

# 3. 查看 Prometheus 指标（最重要的！）
curl http://localhost:8080/actuator/prometheus

# 你应该会看到类似下面的输出：
# HELP jvm_memory_used_bytes The amount of used memory
# TYPE jvm_memory_used_bytes gauge
# jvm_memory_used_bytes{area="heap",id="G1 Eden Space",} 2.3456789E7
```

### 步骤 4：配置 Prometheus 抓取

在 Prometheus 的 `prometheus.yml` 中添加：

```yaml
scrape_configs:
  - job_name: 'user-service'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['localhost:8080']
```

重启 Prometheus，访问 `http://localhost:9090/targets` 确认状态为 `UP`。

### 步骤 5：生成一些测试数据

```bash
# 循环发送请求，产生指标数据
for ($i = 0; $i -lt 100; $i++) {
    curl -s http://localhost:8080/api/users/1 > $null
    Start-Sleep -Milliseconds 200
}
```

### 步骤 6：在 Prometheus 中查询指标

访问 `http://localhost:9090/graph`，输入以下查询：

```promql
# 查看 JVM 内存使用
jvm_memory_used_bytes{area="heap"}

# 查看 HTTP 请求速率
rate(http_server_requests_seconds_count[1m])

# 查看请求延迟（P99）
histogram_quantile(0.99,
  rate(http_server_requests_seconds_bucket[5m])
)
```

### 步骤 7：导入 Grafana Dashboard

1. 打开 Grafana（默认 http://localhost:3000）
2. 添加 Prometheus 数据源
3. 导入 Dashboard ID: `4701`（JVM Micrometer Dashboard）
4. 你会看到 JVM 内存、GC 次数、线程数、HTTP 请求等指标面板

### 完整架构图

```
[Spring Boot App] ── /actuator/prometheus ──> [Prometheus]
      ↑                                            │
      │ 自动采集                                    │ 存储
      │                                            ▼
  [Micrometer]                               [TSDB Blocks]
      │                                            │
      │ 四种指标类型                                │ 查询
      │ Counter / Gauge / Timer / Summary           │
      │                                            ▼
      │                                       [Grafana]
      └──────────────────────────────────────────────┘
                          Dashboard 4701
```

---

## 3.5 Before/After：未配 relabeling vs 配了的序列数对比

### 场景：Spring Boot 应用有 10 个动态 URI 参数

**Before（未配置 relabeling）**：

```yaml
# Prometheus 配置：没有 relabeling
scrape_configs:
  - job_name: 'spring-app'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['app:8080']
```

指标产出：

```promql
http_server_requests_seconds_count{uri="/api/patients/1001/records"}
http_server_requests_seconds_count{uri="/api/patients/1002/records"}
http_server_requests_seconds_count{uri="/api/users/1"}
http_server_requests_seconds_count{uri="/api/users/2"}
```

**序列数**：10 万（每个用户/患者一个序列）

**内存**：8GB，持续增长

---

**After（配置了 URI 模板 + relabeling）**：

```yaml
# Spring Boot 配置
management:
  metrics:
    web:
      server:
        auto-time-requests: true
```

```yaml
# Prometheus 配置：添加 relabeling 规范化 URI
scrape_configs:
  - job_name: 'spring-app'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['app:8080']
    # relabeling 规则：将 URI 中的数字 ID 替换为 {id}
    metric_relabel_configs:
      - source_labels: [uri]
        regex: '/api/patients/\d+/records'
        replacement: '/api/patients/{id}/records'
        target_label: uri
      - source_labels: [uri]
        regex: '/api/users/\d+'
        replacement: '/api/users/{id}'
        target_label: uri
```

指标产出：

```promql
http_server_requests_seconds_count{uri="/api/patients/{id}/records"}
http_server_requests_seconds_count{uri="/api/users/{id}"}
```

**序列数**：10（只有 URI 模板）

**内存**：200MB，稳定

---

### 性能对比总结

| 指标 | Before（无 relabeling） | After（有 relabeling） |
|------|------------------------|----------------------|
| 时间序列数 | 100,000+ | 10 |
| Prometheus 内存 | 8GB（持续增长） | 200MB（稳定） |
| 查询速度 | ~500ms | ~5ms |
| OOM 风险 | 极高 | 无 |
| Dashboard 可读性 | 混乱（无数 URI） | 清晰（模板化 URI） |

---

## 3.6 真实案例：未规范化 URI 导致的 Prometheus 宕机

### 案例背景

某在线教育平台使用 Prometheus 监控 Spring Boot 应用。API 设计如下：

```java
// 课程内容 API，courseId 是动态的
@GetMapping("/api/courses/{courseId}/lessons/{lessonId}")
public Lesson getLesson(@PathVariable String courseId,
                       @PathVariable String lessonId) {
    return lessonService.getLesson(courseId, lessonId);
}
```

平台有 5000 门课程，每门课程平均 50 节课，共计 25 万个不同的 URI。

### 事故经过

1. 上线第一天：一切正常，Prometheus 内存 1GB
2. 第三天：内存涨到 4GB
3. 第五天：内存涨到 12GB
4. 第六天：Prometheus 被 OOM Killer 杀死

### 根因分析

使用 `promtool tsdb analyze` 发现：

```
Highest cardinality label: uri (250,000)
```

每个 `uri` 标签值都是一个独立的时间序列。

### 解决方案

```yaml
# 方案一：在 Spring Boot 端配置 URI 模板
management:
  metrics:
    web:
      server:
        auto-time-requests: true
  # Spring Boot 2.x+ 会自动使用 URI 模板
```

```yaml
# 方案二：在 Prometheus 端用 relabeling 聚合
metric_relabel_configs:
  - source_labels: [uri]
    regex: '/api/courses/[^/]+/lessons/[^/]+'
    replacement: '/api/courses/{id}/lessons/{id}'
    target_label: uri
```

### 事后复盘

- 序列数从 25 万降到 10
- Prometheus 内存从 12GB 降到 256MB
- 团队在开发规范中增加了"URI 必须模板化"的检查

---

## 3.7 小结

- **Micrometer** 是 SLF4J 的指标版：门面模式，解耦指标采集和后端输出
- **四种核心指标**：Counter（计数）、Gauge（瞬时值）、Timer（耗时）、DistributionSummary（分布）
- **URI 模板化**是 Spring Boot 监控的第一道防线——不配置就会产生大量高基数标签
- **Relabeling** 是 Prometheus 端的第二道防线——可以在采集时修改标签
- **常见陷阱**：动态 URI 参数、用户 ID、Session ID 等不应作为标签
- 使用 `promtool tsdb analyze` 定期检查标签基数

---

**下一步**：掌握了单体应用的监控，接下来看第 4 章——如何监控 Kubernetes 集群中的动态服务。
