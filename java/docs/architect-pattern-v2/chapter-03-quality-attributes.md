# 第3章 架构质量属性

第2章讨论了"怎么做设计"——架构设计的八个核心原则。本章讨论"怎么评估设计"——你设计了一个架构方案，怎么知道它是否足够好？

质量属性（Quality Attributes）是架构的"非功能性需求"——它不描述系统"做什么"，而是描述系统"做得怎么样"。在架构评审中，90% 的争论实际上都围绕着质量属性，而非功能需求。

一个重要的观察：**功能需求驱动模块划分，质量属性驱动架构模式选择。** 如果你说"我需要一个订单系统"，你得到一组模块。如果你说"我需要一个能支撑每秒 10000 笔订单的系统"，你得到微服务+事件驱动+缓存。

---

## 3.1 性能（Performance）

### 3.1.1 定义与关键指标

性能衡量系统在给定资源下处理请求的速度。

| 指标 | 含义 | 典型阈值 |
|------|------|----------|
| **响应时间（Response Time）** | 单个请求从发出到收到完整响应的时间 | Web API: <200ms (P95), 内部服务: <50ms |
| **吞吐量（Throughput）** | 单位时间内处理的请求数 | TPS (Transaction Per Second), QPS (Query Per Second) |
| **延迟（Latency）** | 请求从发出到被处理之间的等待时间 | 网络 RTT: <1ms (同机房), 消息队列排队: <10ms |
| **容量（Capacity）** | 系统的最大处理能力 | 单实例 TPS, 集群 TPS |

**关键区别**：响应时间 != 延迟。一个请求的总耗时 = 网络延迟 + 排队延迟 + 处理时间 + 网络返回延迟。

```java
// 性能度量的正确姿势：不用平均值，用百分位
// 平均值掩盖了长尾问题

@Component
public class PerformanceMetrics {
    private final MeterRegistry registry;
    private final Timer apiTimer;

    public PerformanceMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.apiTimer = Timer.builder("api.response.time")
            .publishPercentiles(0.5, 0.90, 0.95, 0.99)  // P50, P90, P95, P99
            .publishPercentileHistogram()
            .register(registry);
    }

    public <T> T measure(Supplier<T> operation) {
        return apiTimer.record(operation);
    }
}

// 解读：
// P50 = 50ms → 一半的请求在 50ms 内完成
// P99 = 2000ms → 但有 1% 的用户等了 2 秒
// 结论：平均值可能很好看（60ms），但长尾是真正的用户体验问题
// 优化的重点不是降低 P50，而是消除 P99 的长尾
```

### 3.1.2 性能与架构模式的关系

不同的架构模式对性能的影响不同：

| 架构模式 | 性能特征 | 瓶颈位置 |
|----------|----------|----------|
| 单体架构 | 进程内调用，无网络开销，性能最佳 | 单进程资源上限 |
| 分层架构 | 层间数据转换有 CPU 开销，整体可控 | 各层间的转换层 |
| 微服务 | 每次跨服务调用 = 网络 RTT + 序列化 + 反序列化 | 服务间网络、序列化框架 |
| 事件驱动 | 异步解耦消除同步等待，但引入消息队列排队延迟 | 消息队列吞吐量、消费者处理能力 |
| CQRS | 读写分离后可各自独立优化性能 | 数据同步延迟（读库滞后于写库） |

```java
// 性能优化的架构权衡：以 API 网关为例

// 方案A：无网关，客户端直连微服务
// 性能：客户端→服务仅一跳，延迟最低
// 代价：每个客户端都要实现服务发现、负载均衡、认证

// 方案B：引入 API 网关
// 性能：客户端→网关→服务，多一跳（+2-5ms）
// 收益：统一认证/限流/路由/协议转换
// 判断：2-5ms的额外延迟是否值得换取统一的治理能力？

// 优化方案B：将网关部署在同机房的同一 K8s 集群内
// 网关→服务的 RTT 降低到 <1ms
// 额外的延迟几乎可忽略
```

### 3.1.3 性能优化的架构杠杆

```java
// 杠杆1：缓存——减少计算和数据传输

@Service
public class ProductService {
    private final RedisTemplate<String, Product> redis;

    public Product getProduct(Long id) {
        String cacheKey = "product:" + id;

        // 先查缓存（Redis RTT ~0.5ms）
        Product cached = redis.opsForValue().get(cacheKey);
        if (cached != null) return cached;

        // 缓存miss，查数据库（DB query ~5-50ms）
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new ProductNotFoundException(id));

        // 写入缓存，TTL 10分钟
        redis.opsForValue().set(cacheKey, product, Duration.ofMinutes(10));
        return product;
    }
    // 缓存命中率 90% → P95 响应时间从 50ms 降到 0.5ms
}

// 杠杆2：异步化——消除不必要的同步等待

@PostMapping("/orders")
public CompletableFuture<ResponseEntity<OrderResult>> createOrder(
        @Valid @RequestBody OrderRequest request) {

    return CompletableFuture
        .supplyAsync(() -> orderService.createOrder(request))   // 线程1：创建订单
        .thenCombineAsync(
            CompletableFuture.supplyAsync(() -> paymentService.charge(request)),  // 线程2：支付
            (order, payment) -> new OrderResult(order, payment)   // 合并结果
        );
    // 两个操作并行执行，总耗时 = max(订单创建时间, 支付时间)
    // 而非订单创建时间 + 支付时间
}

// 杠杆3：连接池——复用昂贵的连接资源

@Configuration
public class DatabaseConfig {
    @Bean
    public HikariDataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://...");
        config.setMaximumPoolSize(20);      // 最大连接数——根据数据库容量设置
        config.setMinimumIdle(5);           // 维持的最小空闲连接
        config.setConnectionTimeout(30000); // 获取连接的超时时间
        config.setIdleTimeout(600000);      // 空闲连接的最大存活时间
        return new HikariDataSource(config);
    }
    // 错误配置的信号：
    // maximumPoolSize 设置过大 → 数据库连接被打满 → 所有服务都连不上
    // connectionTimeout 设置过短 → 正常排队被误判为超时
}
```

---

## 3.2 可用性（Availability）

### 3.2.1 定义与度量

可用性是系统在需要时能够正常工作的概率。

```
可用性 = 正常运行时间 / (正常运行时间 + 故障时间)

几个9的含义：
  99.9%   ("三个九")：年停机 8.76 小时       ← 企业内部系统
  99.99%  ("四个九")：年停机 52.56 分钟      ← 面向消费者的 SaaS
  99.999% ("五个九")：年停机 5.26 分钟        ← 金融交易/电话网络
  99.9999%("六个九")：年停机 31.5 秒          ← 航空管制/核电站
```

**关键指标**：

| 指标 | 含义 | 如何计算 |
|------|------|----------|
| MTBF (Mean Time Between Failures) | 两次故障之间的平均时间 | 总运行时间 ÷ 故障次数 |
| MTTR (Mean Time To Recover) | 故障后恢复所需的平均时间 | 总修复时间 ÷ 故障次数 |
| RTO (Recovery Time Objective) | 业务允许的最长恢复时间 | 由业务需求定义 |
| RPO (Recovery Point Objective) | 可容忍的数据丢失量 | 由业务需求定义 |

```
关键洞察：
  可用性 = MTBF / (MTBF + MTTR)

  提高可用性只有两条路：
  1. 增大 MTBF —— 减少故障频率（更难，需要更高代码质量/更好的基础设施）
  2. 减小 MTTR —— 加快恢复速度（更容易，自动化是最大的杠杆）

  追求"无故障"是不现实的——追求"快速恢复"更经济
```

### 3.2.2 可用性架构模式

**模式一：冗余部署（Redundancy）**

```java
// 消除单点故障的最基本手段
// 任何"只有一个"的组件都是潜在的可用性炸弹

// Kubernetes 中的多副本部署
@Configuration
public class DeploymentConfig {
    // deployment.yaml 对应的概念：
    // replicas: 3  ← 至少3个副本
    // 原因：1个=单点故障，2个=一个坏掉还有一个但无冗余，3个=坏掉一个还有两个
}

// 反例：关键业务只有一台数据库
// → 这台机器挂了=整个业务停摆
// → 解决：主从复制 + 自动故障转移
```

**模式二：熔断器（Circuit Breaker）**

```java
// 防止级联故障：一个下游服务故障不应该拖垮上游

@Service
public class PaymentServiceClient {

    // Resilience4j 熔断器配置
    @CircuitBreaker(
        name = "paymentService",
        fallbackMethod = "paymentFallback"
    )
    public PaymentResult charge(PaymentRequest request) {
        // 调用支付服务
        return restTemplate.postForObject(
            "http://payment-service/api/charge", request, PaymentResult.class);
    }

    public PaymentResult paymentFallback(PaymentRequest request, Throwable t) {
        log.error("支付服务调用失败，进入降级模式: orderId={}", request.getOrderId(), t);

        // 降级策略取决于业务上下文：
        // - 如果是非关键功能：返回一个默认值，系统继续运行
        // - 如果是支付（关键功能）：将请求放入队列，异步重试
        return new PaymentResult("PENDING", "支付处理中，请稍后查询");
    }
}

// 熔断器状态机：
// CLOSED → OPEN (失败次数 > 阈值) → HALF_OPEN (试探性调用) → CLOSED (恢复) 或 OPEN (再次失败)
// 关键配置：失败阈值、熔断持续时间、半开状态允许的试探请求数
```

**模式三：限流（Rate Limiting）**

```java
// 保护系统不被突发流量打垮

@RestController
public class OrderController {

    @PostMapping("/orders")
    @RateLimiter(name = "createOrderRateLimiter")
    public ResponseEntity<?> createOrder(@Valid @RequestBody OrderRequest request) {
        return ResponseEntity.ok(orderService.createOrder(request));
    }
}

// application.yml 中的限流配置：
// resilience4j.ratelimiter.instances.createOrderRateLimiter:
//   limitForPeriod: 1000        # 每秒最多1000个请求
//   limitRefreshPeriod: 1s
//   timeoutDuration: 500ms      # 等待槽位的超时时间

// 限流策略选择：
// - 令牌桶 (Token Bucket)：允许突发(burst)，适合 API 网关
// - 漏桶 (Leaky Bucket)：强制平滑输出，适合保护下游数据库
// - 固定窗口：简单但边界有尖峰风险
// - 滑动窗口：更精确但计算成本稍高
```

**模式四：健康检查与自动恢复**

```java
// K8s 的健康检查 + Spring Boot Actuator

@Component
public class PaymentServiceHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        try {
            // 检查支付服务的关键依赖
            boolean dbReachable = checkDatabaseConnectivity();
            boolean mqConnected = checkMessageQueue();

            if (dbReachable && mqConnected) {
                return Health.up()
                    .withDetail("database", "OK")
                    .withDetail("messageQueue", "OK")
                    .build();
            }
            return Health.down()
                .withDetail("database", dbReachable ? "OK" : "FAIL")
                .withDetail("messageQueue", mqConnected ? "OK" : "FAIL")
                .build();

        } catch (Exception e) {
            return Health.down(e).build();
            // K8s 收到此 DOWN 状态 → 停止向此 Pod 路由流量
            // 如果 liveness probe 也失败 → 重启 Pod
        }
    }
}

// K8s 两个 Probe 的区别：
// Liveness Probe 失败 → K8s 重启 Pod（"这个 Pod 已经死了，需要换一个"）
// Readiness Probe 失败 → K8s 停止向 Pod 发流量（"这个 Pod 还活着但暂时不能工作"）
// 错误配置：Liveness 检查数据库——DB 短暂故障导致 K8s 重启所有 Pod，雪上加霜
```

---

## 3.3 可修改性（Modifiability）

### 3.3.1 定义与度量

可修改性衡量系统对变化的容纳能力——改变一个功能需要改多少代码、承担多大的风险。

```
可修改性的三个维度：

1. 局部性 (Locality)：一个变更影响的文件和模块有多少？
   理想：一个业务变更 = 修改一个模块
   现实：一个业务变更 = 修改 5 个模块的 20 个文件

2. 涟漪效应 (Ripple Effect)：变更的影响传播多远？
   理想：修改 A 模块不影响 B 模块
   现实：修改 A 模块 → B 编译失败 → C 运行时报错 → D 数据不一致

3. 耦合度 (Coupling)：模块之间有多少连接？
   理想：每个模块只通过明确接口与 1-2 个其他模块通信
   现实：模块间的网状依赖图
```

### 3.3.2 可修改性的架构考量

```java
// 考量1：高内聚低耦合——最古老的架构原则，也是最重要的

// 高耦合的系统（脆弱）：
// 改了 UserService → OrderService 编译报错 → 改了 OrderService → PaymentService 行为异常

// 低耦合的系统（强健）：
// 改了 UserService → 其他服务不受影响（它们只依赖 UserService 的公开API）

// 度量耦合的方法：
// 1. 传入耦合 (Afferent Coupling, Ca): 有多少其他模块依赖我？
//    Ca 高 → 我是"被广泛使用的核心模块"→ 修改我的成本极高 → 需要最严格的保护
// 2. 传出耦合 (Efferent Coupling, Ce): 我依赖了多少其他模块？
//    Ce 高 → 我是"集成者"→ 我受许多模块变更的影响 → 不稳定
// 3. 不稳定性 = Ce / (Ca + Ce)
//    0 = 最稳定（没人依赖我，或我依赖很多别人），1 = 最不稳定
```

```java
// 考量2：接口 vs 实现的分离

// 好的可修改性：你可以换掉整个实现而不修改调用方
public interface TaxCalculator {
    TaxResult calculate(Order order);
}

// 实现1：中国税法
@Service
@ConditionalOnProperty(name = "tax.region", havingValue = "CN")
public class ChinaTaxCalculator implements TaxCalculator {
    public TaxResult calculate(Order order) { /* 增值税 13% */ }
}

// 实现2：欧盟税法
@Service
@ConditionalOnProperty(name = "tax.region", havingValue = "EU")
public class EUTaxCalculator implements TaxCalculator {
    public TaxResult calculate(Order order) { /* VAT 20% */ }
}

// 切换税法 = 改一行配置（spring.profiles.active=eu），代码零修改
```

```java
// 考量3：可修改性与架构模式的匹配

// 单体架构的可修改性特征：
// 优势：重命名、移动代码在 IDE 内瞬间全局生效
// 劣势：修改影响面难以控制——没有物理边界阻止涟漪效应
// 对策：通过 ArchUnit 测试强制执行模块边界

// 微服务架构的可修改性特征：
// 优势：物理边界强制隔离——A 服务的代码改不了 B 服务的对象
// 劣势：跨服务修改需要协调多个代码库和部署
// 对策：在服务契约(API)上做向上兼容，避免"改一个业务需求要改3个服务"

// 关键判断：
// 如果 80% 的变更只需要改一个模块 → 当前架构的可修改性良好
// 如果 80% 的变更需要碰 3+ 个模块 → 模块边界需要重新划分
```

---

## 3.4 安全性（Security）

### 3.4.1 定义与核心概念

安全性是系统保护数据和功能免受未经授权访问和操作的能力。

**CIA 三元组**：

| 属性 | 含义 | 典型措施 | 违反示例 |
|------|------|----------|----------|
| **机密性 (Confidentiality)** | 数据只对授权方可见 | 加密、访问控制、脱敏 | 用户手机号在日志中明文打印 |
| **完整性 (Integrity)** | 数据不被未授权篡改 | 签名、校验和、审计日志 | 数据库被 SQL 注入修改了价格 |
| **可用性 (Availability)** | 授权用户能正常访问 | DDoS防护、冗余、容灾 | 攻击者打满连接池导致服务不可用 |

### 3.4.2 架构层面的安全模式

**模式一：纵深防御（Defense in Depth）**

```
安全不是一道墙，而是一组同心圆：

  外网
  ├── WAF (Web应用防火墙，防SQL注入/XSS/CSRF)
  │   └── API 网关 (认证/限流/HTTPS终结)
  │       └── 应用层 (Spring Security/输入验证/授权)
  │           └── 数据层 (加密存储/审计日志/最小权限)
  │               └── 基础设施层 (网络隔离/镜像签名/密钥轮换)

每层独立运作——外层的失守不应该让内层暴露
```

```java
// 纵深防御在 Spring Boot 中的实现

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            // 层1：HTTPS 强制（机密性）
            .requiresChannel(channel -> channel.anyRequest().requiresSecure())

            // 层2：CSRF 防护
            .csrf(CsrfConfigurer::disable)  // API 前后端分离一般关闭，用 Token 代替

            // 层3：CORS 策略
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))

            // 层4：认证——你是谁
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(Customizer.withDefaults()))

            // 层5：授权——你能做什么
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/orders/**").hasAnyRole("USER", "ADMIN")
                .requestMatchers("/api/health").permitAll()
                .anyRequest().authenticated())

            // 层6：安全响应头
            .headers(headers -> headers
                .contentSecurityPolicy(csp ->
                    csp.policyDirectives("default-src 'self'"))
                .xssProtection(Customizer.withDefaults()))

            .build();
    }
}
```

**模式二：最小权限原则（Least Privilege）**

```java
// 每个组件只拥有完成其任务所需的最小权限
// 这是一个"约束"（见第1章架构构成要素）的经典应用

// 数据库权限的最小权限模型：
// - application_user（应用的数据库账号）：
//   SELECT, INSERT, UPDATE, DELETE on orders, users → 有需要才给
//   SELECT on products → 只读——因为订单服务不修改商品数据
//   NO CREATE TABLE, NO DROP, NO GRANT → 这些应用永远不需要
//
// - report_user（报表数据库账号）：
//   SELECT on orders, users → 只读——报表不需要写数据
//
// - migration_user（数据库迁移账号）：
//   CREATE TABLE, ALTER TABLE → 只有 Flyway 用这个账号

// Java 代码中的最小权限：
@Service
public class OrderService {
    // 支付服务只通过这个接口暴露"charge"方法
    // 订单服务没有 refund 的能力——这是刻意的约束
    private final PaymentOperations paymentOps;  // 接口只有 charge()，没有 refund()

    // 如果订单服务需要退款能力，它不是直接获取退款接口
    // 而是通过一个独立的 RefundService，走独立的审批流程
}
```

**模式三：输入验证——架构的安全防线**

```java
// 输入验证不是锦上添花——它是安全的第一道防线
// OWASP Top 10 中排名靠前的漏洞都与输入验证不足有关

@RestController
public class OrderController {

    @PostMapping("/orders")
    public ResponseEntity<OrderResult> createOrder(
            @Valid @RequestBody CreateOrderRequest request) {  // ← @Valid 是第一道防线

        // javax.validation 约束在 DTO 上：
        return ResponseEntity.ok(orderService.createOrder(request));
    }
}

// DTO：在系统边界上做白名单验证
public class CreateOrderRequest {

    @NotNull(message = "用户ID不能为空")
    @Positive(message = "用户ID必须为正数")
    private Long userId;

    @NotBlank(message = "收货地址不能为空")
    @Size(max = 500, message = "地址不能超过500字符")
    @Pattern(regexp = "^[\\u4e00-\\u9fa5a-zA-Z0-9\\s，,。-]+$",
             message = "地址包含非法字符")  // 白名单——只允许已知安全字符
    private String address;

    @NotEmpty(message = "订单项不能为空")
    @Size(max = 100, message = "单笔订单最多100件商品")
    private List<OrderItemRequest> items;
}

// 关键原则：白名单 > 黑名单
// 黑名单：过滤"已知危险"的字符 → 攻击者总能找到你没预料到的
// 白名单：只允许"已知安全"的字符 → 所有不在列表内的都拒绝
```

---

## 3.5 可测试性（Testability）

### 3.5.1 定义与核心价值

可测试性是验证系统正确性的容易程度。它的重要性不在"测试"本身——而在于 **"你如何知道你的代码是对的？"**

```
可测试性好：
  改了代码 → 运行测试 → 60秒后知道有没有破坏东西 → 有信心上线

可测试性差：
  改了代码 → 必须手动启动整个系统 → 点击20个页面 → 祈祷没有隐藏bug → 忐忑上线
```

### 3.5.2 可测试性与架构的关系

**反比关系**：架构的耦合度与可测试性成反比。耦合越紧的架构，越难测试。

```java
// 可测试性差的架构：所有东西耦合在一起
public class OrderService {
    // 直接 new 具体类——无法用 mock 替换
    private final AlipayService alipayService = new AlipayService();
    private final JdbcTemplate jdbcTemplate =
        new JdbcTemplate(DriverManager.getConnection("jdbc:mysql://prod-db:3306/..."));

    public void createOrder(Order order) {
        // 我怎么测试这个方法？
        // - 需要启动一个 MySQL 数据库
        // - 需要连上支付宝沙箱环境
        // - 测试运行时间：30分钟（大部分在等外部系统）
    }
}

// 可测试性好的架构：通过接口隔离依赖
@Service
public class OrderService {
    private final PaymentGateway paymentGateway;  // 接口——测试时注入 mock
    private final OrderRepository orderRepository; // 接口——测试时注入 Fake

    public OrderService(PaymentGateway paymentGateway, OrderRepository orderRepository) {
        this.paymentGateway = paymentGateway;
        this.orderRepository = orderRepository;
    }

    public OrderResult createOrder(Order order) {
        PaymentResult payment = paymentGateway.charge(order.getAmount());
        order.markPaid(payment.getTransactionId());
        return OrderResult.from(orderRepository.save(order));
    }
}

// 测试：不需要任何外部依赖，运行时间 < 1 秒
@Test
void shouldMarkOrderAsPaidAfterPayment() {
    // Arrange: 注入 mock 和 fake
    PaymentGateway mockPayment = mock(PaymentGateway.class);
    when(mockPayment.charge(any())).thenReturn(new PaymentResult("txn_123", true));

    OrderRepository fakeRepo = new InMemoryOrderRepository();

    OrderService service = new OrderService(mockPayment, fakeRepo);

    // Act
    OrderResult result = service.createOrder(new Order(BigDecimal.TEN));

    // Assert
    assertEquals("PAID", result.getStatus());
    assertEquals("txn_123", result.getTransactionId());
}
```

### 3.5.3 测试金字塔与架构

```
         ╱───╲
        ╱ E2E ╲        少量：验证核心业务流能否端到端走通
       ╱───────╲
      ╱ 集成测试 ╲      中量：验证模块间协作、外部依赖集成
     ╱───────────╲
    ╱   单元测试    ╲    大量：验证单个类/方法的行为正确性
   ╱───────────────╲
```

```java
// 架构决定了你能写多少单元测试
// 如果 80% 的代码在"无法独立测试"的类中 → 架构的可测试性差

// 可测试性的架构检查清单：
// □ 是否有 80%+ 的类可以在不启动 Spring 容器的情况下测试？
// □ 是否有 80%+ 的测试在 10 秒内完成？
// □ 是否每个 Service 的"外部依赖"都是接口？（可 mock）
// □ 是否没有测试依赖"特定的数据状态"？（可独立运行）
// □ 是否能并行运行所有测试？（测试间无状态污染）
```

---

## 3.6 可扩展性（Scalability）

### 3.6.1 定义与扩展维度

可扩展性是系统在负载增长时，通过增加资源来维持或提高性能的能力。

```
扩展的两个方向：

┌──────────────────┐     ┌──────────────────┐
│   垂直扩展(Scale Up) │     │   水平扩展(Scale Out)│
│   换更大的机器      │     │   加更多的机器      │
│                      │     │                      │
│   单机4核→16核      │     │   1台→10台服务器    │
│   简单，但有天花板    │     │   复杂，但理论无限    │
└──────────────────┘     └──────────────────┘

架构对扩展的影响：
- 单体架构天然倾向垂直扩展（整个应用必须一起扩）
- 微服务架构天然支持水平扩展（每个服务独立扩缩）
- 无状态服务容易水平扩展（任何实例都可以处理任何请求）
- 有状态服务难以水平扩展（需要分区/分片/shuffle数据）
```

### 3.6.2 架构层面的可扩展性设计

**设计一：无状态化**

```java
// 无状态服务：请求之间不依赖本地内存状态 → 任何实例都可以处理

// 反面：有状态服务
@Service
@Scope("session")  // ← 这个 Bean 是会话级别的——它有状态
public class ShoppingCartService {
    private final Map<Long, List<CartItem>> userCarts = new ConcurrentHashMap<>();
    // 这个 Map 只在当前 JVM 实例中存在
    // 如果负载均衡器把用户的下一个请求发到了另一台机器
    // → 用户的购物车"消失了"

    public void addToCart(Long userId, CartItem item) {
        userCarts.computeIfAbsent(userId, k -> new ArrayList<>()).add(item);
    }
}

// 正面：无状态服务
@Service
public class ShoppingCartService {
    private final RedisTemplate<String, CartItem> redis;
    // 状态移到 Redis（共享存储）
    // 任何实例都可以处理任何用户的请求

    public void addToCart(String userId, CartItem item) {
        String key = "cart:" + userId;
        redis.opsForList().rightPush(key, item);
        redis.expire(key, Duration.ofHours(24));
    }
    // 可以水平扩展到任意多实例
}
```

**设计二：数据库扩展策略**

```java
// 数据库是大多数系统的瓶颈——因为它是唯一的有状态组件

// 扩展路径1：读写分离 (Read/Write Splitting)
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary  // 写操作走主库
    @ConfigurationProperties("spring.datasource.primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean  // 读操作走从库（可以有多个）
    @ConfigurationProperties("spring.datasource.replica")
    public DataSource replicaDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public DataSource routingDataSource() {
        RoutingDataSource router = new RoutingDataSource();
        router.setDefaultTargetDataSource(primaryDataSource());
        Map<Object, Object> targets = new HashMap<>();
        targets.put("PRIMARY", primaryDataSource());
        targets.put("REPLICA", replicaDataSource());
        router.setTargetDataSources(targets);
        return router;
    }
}

// 使用：@Transactional(readOnly = true) 方法自动路由到从库
// 读流量（通常占 80%）被分散到多个从库 → 写库压力大幅降低
```

```java
// 扩展路径2：分库分表 (Sharding)
// 当单表数据量超过 1 亿行，再多的读写分离也解决不了

// 用 ShardingSphere 做水平分片
@Configuration
public class ShardingConfig {

    @Bean
    public DataSource shardingDataSource() {
        // 按 user_id % 4 将订单表分布在 4 个数据库实例中
        // db0: user_id % 4 == 0 的订单
        // db1: user_id % 4 == 1 的订单
        // ...
        // 每个库的容量是原来的 1/4
        // 写入吞吐量是原来的 4 倍
    }
}

// 分库分表的代价：
// - 跨分片查询（"列出所有订单"）变得困难，需要汇总
// - 跨分片事务几乎不可能——需要分布式事务（Saga 模式）
// - 分片键选择是"一次性决策"——选错了很难改
// 原则：分库分表是最后的扩展手段——先尝试其他所有优化
```

**设计三：容量规划**

```java
// 可扩展性的前提是知道当前的瓶颈在哪

@Component
public class CapacityMonitor {

    // 监控系统的扩展信号
    @Scheduled(fixedRate = 30000)
    public void monitorScalingSignals() {
        // 信号1：CPU 使用率持续 > 70% → 需要更多实例
        double cpuUsage = getCpuUsage();
        if (cpuUsage > 0.70) {
            log.warn("SCALING_SIGNAL: CPU {} > 70%, 建议增加实例", cpuUsage);
        }

        // 信号2：GC 暂停时间 > 1s → 堆内存不足或内存泄漏
        double gcPauseTime = getGcPauseTime();
        if (gcPauseTime > 1000) {
            log.warn("SCALING_SIGNAL: GC暂停 {}ms > 1s", gcPauseTime);
        }

        // 信号3：连接池使用率 > 80% → 数据库连接即将耗尽
        double poolUsage = getConnectionPoolUsage();
        if (poolUsage > 0.80) {
            log.error("SCALING_SIGNAL: 连接池使用率 {} > 80%, " +
                "即将耗尽——需要增加数据库连接或添加从库", poolUsage);
        }
    }
}

// 容量规划的黄金法则：
// 1. 在 60% 负载时就计划扩展——不是 90%
//    原因：扩展需要时间（K8s调度、启动、健康检查、预热），等你到 90% 再扩已经来不及
// 2. 容量单位是"业务指标"不是"技术指标"
//    对业务说："我们当前能支撑 5000 TPS，到 10000 TPS 时只需加 3 台机器。"
//    而不是："我们的 Heap 使用率 60%。"
// 3. 容量测试不是一次性的——每次架构变更后重新做
```

---

## 3.7 质量属性的权衡与优先级

### 3.7.1 属性间的冲突

六个质量属性之间存在着不可调和的张力——你无法同时将所有属性都做到极致。

```
质量属性冲突图：

  性能 ←→ 安全性       TLS 加密/解密消耗 CPU，降低响应时间
  性能 ←→ 可修改性      抽象层增加间接调用，额外的方法调用有成本
  性能 ←→ 可测试性      为可测试性引入的接口和 DI 增加一点开销
  可用性 ←→ 性能        冗余和健康检查消耗额外资源
  安全性 ←→ 可用性       严格的安全策略可能阻止合法的紧急访问
  安全性 ←→ 可修改性     安全框架集成增加了架构的复杂度
  可修改性 ←→ 可扩展性   过度模块化在扩展时产生大量微服务协调成本
```

### 3.7.2 优先级框架

```java
// 不同的系统，质量属性的优先级不同
// 不存在"完美满足所有质量属性"的架构——只存在"在该系统场景下做了正确权衡"的架构

public class QualityAttributePriorities {

    public static List<QualityAttribute> getPriorities(SystemType type) {
        return switch (type) {
            case FINANCIAL_TRADING -> List.of(
                QualityAttribute.SECURITY,       // 1. 钱的安全性是底线
                QualityAttribute.AVAILABILITY,   // 2. 交易中断 = 损失
                QualityAttribute.PERFORMANCE     // 3. 毫秒级延迟差异就是竞争优势
                // 可修改性在这里排后面——金融系统的业务规则变化慢
            );

            case STARTUP_MVP -> List.of(
                QualityAttribute.MODIFIABILITY,  // 1. 一定会 pivot，能改最重要
                QualityAttribute.TESTABILITY,    // 2. 快速验证假设
                QualityAttribute.PERFORMANCE     // 3. 至少不能太慢
                // 可用性和安全性可以暂时妥协（MVP 不是生产系统）
            );

            case ECOMMERCE_PLATFORM -> List.of(
                QualityAttribute.AVAILABILITY,   // 1. 宕机 = 丢单
                QualityAttribute.SCALABILITY,    // 2. 秒杀/大促期间的流量爆发
                QualityAttribute.PERFORMANCE,    // 3. 每 100ms 延迟 = 1% 转化率下降
                QualityAttribute.SECURITY        // 4. 用户数据和支付安全
            );

            case INTERNAL_TOOL -> List.of(
                QualityAttribute.MODIFIABILITY,  // 1. 需求变化频繁
                QualityAttribute.TESTABILITY     // 2. 数据正确性
                // 可用性、性能要求低——内部用户能接受偶尔的慢和故障
            );

            case IOT_PLATFORM -> List.of(
                QualityAttribute.SCALABILITY,    // 1. 设备数量可能从1万增长到100万
                QualityAttribute.AVAILABILITY,   // 2. 设备一直在发数据，不能断
                QualityAttribute.PERFORMANCE     // 3. 消息处理的实时性
            );
        };
    }
}
```

### 3.7.3 本章小结

本章建立了评估架构好坏的六维度框架：

1. **性能**：系统处理请求的速度。关注百分位（P95/P99）而非平均值——长尾是真正的用户体验问题。缓存、异步化、连接池是三个最重要的性能杠杆。

2. **可用性**：系统在需要时能正常工作的概率。MTTR（恢复速度）比 MTBF（故障间隔）更容易改善——追求快速恢复而非永不故障。熔断器、限流、冗余部署是三个关键模式。

3. **可修改性**：系统容纳变化的能力。高内聚低耦合是核心——变更应该被限制在单个模块内。ArchUnit 等工具可以将可修改性约束固化为 CI 检查。

4. **安全性**：保护数据和功能免受未授权访问。CIA 三元组（机密性、完整性、可用性）是核心框架。纵深防御——不要相信单一道防线。输入验证用白名单，不要用黑名单。

5. **可测试性**：验证系统正确性的容易程度。可测试性与架构耦合度成反比——DI、接口隔离、无状态化直接提升可测试性。如果大部分测试需要启动整个应用，你的架构有问题。

6. **可扩展性**：系统应对负载增长的能力。无状态化是水平扩展的前提——将状态移至共享存储。扩展决策在 60% 负载时就做，不要等到 90%。

**最重要的洞察**：质量属性之间存在不可调和的冲突。不存在"全部满足"的完美架构——只存在"在当前场景下做了正确权衡"的架构。架构师的核心能力不是选择所有最优属性，而是**明确告知团队：在当前优先级下，我们主动牺牲了什么。**
