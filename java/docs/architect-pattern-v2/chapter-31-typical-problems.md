# 第31章 架构模式典型问题处理

无论选择哪种架构模式，某些类型的问题会反复出现。本章将这些典型问题按类型归类，提供诊断方法和处理策略。

---

## 31.1 性能问题处理

### 31.1.1 系统化诊断方法

```
性能问题不要猜——要用数据驱动：

常见误区：
  "系统慢了，肯定是数据库的问题" → 加缓存 → 还是慢
  "是网络的问题" → 升级带宽 → 还是慢
  "是代码写得不好" → 优化代码 → 还是慢

正确的诊断流程：
  Step 1: 定义问题 —— 哪个API慢？慢到什么程度？什么时候开始的？
  Step 2: 建立基线 —— P50/P95/P99 分别是多少？QPS是多少？
  Step 3: 逐层排查 —— 从用户侧一路向下排查到基础设施
  Step 4: 定位瓶颈 —— 是CPU密集、IO密集还是等待锁？
  Step 5: 验证修复 —— 不是"改了之后觉得快了"，而是"P99从 500ms 降到了 120ms"
```

### 31.1.2 常见性能瓶颈与处理

```java
// 瓶颈 1：数据库慢查询

// 症状：
// - 应用 CPU 低，但响应时间高
// - 数据库 CPU 持续 > 70%
// - 同样的接口，数据量少的时候快，多的时候慢

// 诊断工具：
// - 慢查询日志（MySQL slow_query_log）
// - Spring Data JPA 的 SQL 日志：logging.level.org.hibernate.SQL=DEBUG
// - APM 工具（SkyWalking/Pinpoint）追踪具体 SQL 的耗时

// 处理策略：
// 1. 加索引（最优先——成本最低、收益最大）
CREATE INDEX idx_order_user_id_created ON orders(user_id, created_at);

// 2. SQL 优化（避免 N+1）
// 错误：
@Entity
public class Order {
    @OneToMany(fetch = FetchType.LAZY)
    private List<OrderItem> items;  // 每个 Order 都会触发一次 items 查询
}
// 修复：
@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.userId = :userId")
List<Order> findByUserIdWithItems(@Param("userId") Long userId);

// 3. 读写分离
// 写 → 主库，读 → 从库
// Spring 的 AbstractRoutingDataSource 或 ShardingSphere-JDBC

// 4. 缓存（按"数据变更频率"和"一致性要求"选择策略）
//   高频访问 + 低频变更 + 可接受短暂不一致 → 缓存最佳
//   低频访问 + 高频变更 → 缓存可能得不偿失

// 瓶颈 2：串行化瓶颈 —— 同步锁和排队

// 症状：增加线程/实例数后吞吐量不升反降

// 典型场景：
@Service
public class InventoryService {
    // 错误：synchronized 在分布式环境下无效，在单机下也有竞争
    public synchronized void deductStock(Long skuId, int qty) {
        // 所有请求排队执行这个方法
    }
}

// 处理策略：
// 1. 缩小锁粒度 —— 锁 SKU 级别而不是整个方法
ConcurrentHashMap<Long, Object> skuLocks = new ConcurrentHashMap<>();
Object lock = skuLocks.computeIfAbsent(skuId, k -> new Object());
synchronized (lock) {
    // 只锁这一个 SKU
}

// 2. 数据库层面用乐观锁
@Modifying
@Query("UPDATE Inventory i SET i.stock = i.stock - :qty " +
       "WHERE i.skuId = :skuId AND i.stock >= :qty AND i.version = :version")
int deduct(@Param("skuId") Long skuId, @Param("qty") int qty,
           @Param("version") Long version);
// 返回值 = 0 表示版本号已变 → 重试

// 3. 使用 Redis 原子操作
Long stock = redisTemplate.opsForValue().decrement("stock:" + skuId, qty);
if (stock < 0) {
    // 恢复并拒绝
    redisTemplate.opsForValue().increment("stock:" + skuId, qty);
    throw new InsufficientStockException();
}

// 瓶颈 3：内存泄漏和 GC 压力

// 症状：
// - Full GC 频繁（> 1次/分钟）
// - GC 暂停时间 > 1s
// - 内存使用持续增长，不释放

// 诊断：
// - JVM 参数：-Xlog:gc*:file=gc.log
// - jstat -gc <pid> 1s
// - 堆转储：jmap -dump:live,file=heap.hprof <pid>
// - 分析工具：Eclipse MAT / JProfiler

// 常见原因和修复：
// 1. ThreadLocal 未清理 → 在 finally 块中 remove()
// 2. 静态集合无限增长 → 用 LRU/LFU 缓存（Caffeine）替代 HashMap
Cache<Long, User> userCache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(30))
    .build();
// 3. 数据库连接未归还连接池 → 检查 try-with-resources / @Transactional
```

### 31.1.3 性能问题处理速查表

| 症状 | 可能原因 | 首选诊断工具 | 常用解决方案 |
|------|---------|-------------|-------------|
| 响应慢，CPU低 | 等待 I/O（DB/网络/磁盘） | APM 追踪 | 异步化、连接池优化、加缓存 |
| 响应慢，CPU高 | 计算密集 / 死循环 | async-profiler | 算法优化、并行化、限流 |
| GC 频繁 | 内存泄漏 / 堆太小 | jstat + MAT | 调大堆、修泄漏、改 GC 策略 |
| 吞吐量不随实例数增长 | 串行瓶颈（锁/DB/队列） | 线程 dump | 去锁/乐观锁/分片 |
| 间歇性超时 | 网络抖动 / 长 GC / 连接池耗尽 | 监控面板 | 超时重试、熔断、连接池预热 |

---

## 31.2 可用性问题处理

### 31.2.1 故障模式与应对

```java
// 故障模式 1：级联故障（Cascading Failure）

// 场景：
// 服务 A → 服务 B → 服务 C
// 服务 C 变慢 → 服务 B 的线程池被占满 → 服务 A 调用 B 也超时
// → 整个调用链崩溃

// 防护层：
// 1. 每个服务独立配置超时时间
@Bean
public RestClient restClient() {
    return RestClient.builder()
        .connectTimeout(Duration.ofSeconds(1))
        .readTimeout(Duration.ofSeconds(3))
        .build();
}

// 2. 熔断器（Resilience4j CircuitBreaker）
@CircuitBreaker(name = "payment", fallbackMethod = "paymentFallback")
public PaymentResult processPayment(PaymentRequest request) {
    return paymentClient.pay(request);
}
public PaymentResult paymentFallback(PaymentRequest request, Exception e) {
    // 返回降级结果而不是让调用方无限等待
    return PaymentResult.pending(request.getOrderId());
}

// 3. 舱壁隔离（Bulkhead）—— 限制每个下游服务的并发调用数
@Bulkhead(name = "payment", type = Bulkhead.Type.THREADPOOL,
          maxThreadPoolSize = 20, maxWaitDuration = "500ms")
public PaymentResult processPayment(PaymentRequest request) { ... }

// 故障模式 2：资源耗尽

// 场景：数据库连接池被一个慢接口耗尽 → 其他接口也拿不到连接
// 症状：HikariCP Connection is not available, request timed out after 30000ms

// 处理：
// 1. 监控连接池指标
// HikariCP 自动暴露 Metrics：
//   hikaricp_connections_active
//   hikaricp_connections_pending
//   hikaricp_connections_timeout_total

// 2. 为不同业务配置独立的连接池
// 核心交易用一个连接池，报表查询用另一个
@Configuration
public class DataSourceConfig {
    @Primary @Bean
    @ConfigurationProperties("spring.datasource.core")
    public DataSource coreDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("spring.datasource.report")
    public DataSource reportDataSource() {
        return DataSourceBuilder.create().build();
    }
}

// 3. 限流保护
// 限制每个 API 的最大并发请求数
@Component
public class ConcurrencyLimiter {
    private final Semaphore semaphore = new Semaphore(100); // 最多 100 并发

    public <T> T execute(Supplier<T> task) {
        if (!semaphore.tryAcquire(500, TimeUnit.MILLISECONDS)) {
            throw new TooManyRequestsException("系统繁忙，请稍后重试");
        }
        try {
            return task.get();
        } finally {
            semaphore.release();
        }
    }
}

// 故障模式 3：分布式系统的大脑分裂（Split-Brain）

// 场景：网络分区导致集群分裂为两个独立分区
// 每个分区都认为自己是"主"，各自独立处理请求
// 恢复后数据冲突

// 处理策略：
// 1. 法定人数（Quorum）—— 需要多数节点投票才能成为主
//    Kafka: min.insync.replicas = N/2 + 1
//    Redis Sentinel: quorum = N/2 + 1

// 2. Fencing Token —— 每次主切换生成递增的 token
//    老主发现 token 过期后自动停止写入
//    防止"Zombie Master"问题

// 3. 幂等设计 —— 即使操作被重复执行，结果也正确
//    见 31.3.2
```

### 31.2.2 可用性改进清单

```
可用性提升的渐进式路径（从最低成本开始）：

□ 1. 健康检查：所有服务暴露 /health 端点，K8s 自动重启不健康实例
□ 2. 超时配置：所有远程调用都有超时（连接超时 + 读取超时）
□ 3. 重试策略：仅对幂等操作重试，配合退避算法（Exponential Backoff）
□ 4. 熔断器：当错误率 > 阈值时自动熔断
□ 5. 多副本部署：每个服务至少 2 个副本，跨可用区
□ 6. 优雅关闭：收到 SIGTERM 后停止接收新请求，处理完现有请求再退出
□ 7. 蓝绿/金丝雀部署：减少部署导致的中断
□ 8. 混沌工程：主动注入故障验证系统韧性（Chaos Monkey）
```

---

## 31.3 一致性问题处理

### 31.3.1 分布式一致性的分层处理

```
不一致的三种严重程度：

Level 1: 可以自动修正的不一致（如缓存与数据库不一致）
  → 设置合理的 TTL + 主动失效 → 短暂不一致后自动恢复

Level 2: 需要异步补偿的不一致（如订单已创建但支付状态未更新）
  → 定时对账任务 + 差异自动修复

Level 3: 无法接受任何不一致（如账户余额、库存扣减）
  → 分布式事务（两阶段提交 / TCC / Saga）+ 严格的幂等保证
```

### 31.3.2 幂等性设计

```java
// 幂等性是分布式系统最基础的防御机制
// 定义：同一个操作执行一次和执行 N 次，结果相同

// 实现方式 1：唯一键 —— 最可靠的幂等方案
@Service
public class OrderService {

    public OrderResult createOrder(OrderRequest request) {
        // 客户端生成唯一的请求 ID（requestId）
        // 如果同一个 requestId 已经处理过 → 直接返回已有结果
        String requestId = request.getRequestId();

        Optional<Order> existing = orderRepository.findByRequestId(requestId);
        if (existing.isPresent()) {
            return OrderResult.from(existing.get());  // 幂等返回
        }

        // 唯一索引保证：即使并发插入，也只有一个成功
        // CREATE UNIQUE INDEX idx_request_id ON orders(request_id);
        Order order = orderRepository.save(Order.create(requestId, request));
        return OrderResult.from(order);
    }
}

// 实现方式 2：状态机 —— 防止非法状态转换
public enum OrderState {
    CREATED, PAID, SHIPPED, COMPLETED, CANCELLED
}

public void payOrder(Long orderId) {
    // UPDATE orders SET state = 'PAID'
    // WHERE id = ? AND state = 'CREATED'  ← 条件更新
    int updated = orderRepository.updateState(
        orderId, OrderState.CREATED, OrderState.PAID);

    if (updated == 0) {
        // 已经是 PAID 或其他状态 —— 幂等
        log.info("Order {} already processed, skipping", orderId);
    }
}

// 实现方式 3：Redis + SETNX —— 轻量级分布式锁 + 幂等
public boolean processOnce(String operationId, Runnable task) {
    Boolean acquired = redisTemplate.opsForValue()
        .setIfAbsent("idempotent:" + operationId, "1", Duration.ofHours(24));
    if (Boolean.TRUE.equals(acquired)) {
        task.run();
        return true;
    }
    return false;  // 已经处理过
}
```

### 31.3.3 最终一致性处理

```java
// 场景：订单创建成功后，需要通知库存服务、积分服务和物流服务

// 方案 1：本地消息表（Outbox Pattern）—— 推荐
@Service
public class OrderCreationService {

    @Transactional
    public void createOrder(OrderRequest request) {
        // 1. 保存订单
        Order order = orderRepository.save(Order.create(request));

        // 2. 在同一个事务中写入 Outbox 表
        OutboxMessage message = OutboxMessage.builder()
            .aggregateType("Order")
            .aggregateId(order.getId().toString())
            .eventType("OrderCreated")
            .payload(toJson(order))
            .status(MessageStatus.PENDING)
            .build();
        outboxRepository.save(message);
        // 事务提交 → 订单和消息同时持久化
    }
}

// 3. 独立的 Outbox 轮询器，将消息发送到 Kafka
@Component
public class OutboxPoller {
    @Scheduled(fixedDelay = 100) // 每 100ms 轮询
    public void pollAndPublish() {
        List<OutboxMessage> messages = outboxRepository
            .findByStatusOrderByCreatedAt(MessageStatus.PENDING, PageRequest.of(0, 100));

        for (OutboxMessage msg : messages) {
            try {
                kafkaTemplate.send(msg.getEventType(), msg.getPayload()).get();
                msg.setStatus(MessageStatus.SENT);
                outboxRepository.save(msg);
            } catch (Exception e) {
                // 失败了也没关系——下次轮询会重试
                // 消费者端需要处理重复消息（幂等性保证）
            }
        }
    }
}

// 方案 2：对账（Reconciliation）—— 兜底防线
// 即使 Outbox 机制失败了，对账也能发现并修复不一致
@Component
public class OrderReconciliationJob {

    @Scheduled(cron = "0 */10 * * * *")  // 每 10 分钟
    public void reconcile() {
        // 找出"订单创建超过 5 分钟但库存未扣减"的记录
        List<Order> orders = orderRepository
            .findCreatedBeforeAndInventoryStatus(
                Instant.now().minus(Duration.ofMinutes(5)),
                InventoryDeductionStatus.PENDING);

        for (Order order : orders) {
            // 触发库存扣减（可能重复执行，依赖幂等性）
            kafkaTemplate.send("InventoryDeduction",
                new InventoryDeductionCommand(order.getId(), order.getItems()));
        }
    }
}
```

---

## 31.4 安全性问题处理

### 31.4.1 常见架构安全漏洞

```java
// 漏洞 1：敏感数据在日志中泄露

// 错误：
log.info("用户登录成功: {}", user);  // 可能包含密码、手机号等敏感字段

// 修复：对敏感对象自定义 toString() 或使用脱敏
@Data
public class User {
    private String username;
    @JsonIgnore @ToString.Exclude private String password;
    @Sensitive private String phone;  // 自定义脱敏注解
}

// 全局日志脱敏
@Configuration
public class LogMaskingConfig {
    @Bean
    public Layout customLayout() {
        return LogstashLayout.newBuilder()
            .addMask("password", "****")
            .addMask("phone", value -> value.replaceAll("(\\d{3})\\d{4}(\\d{4})", "$1****$2"))
            .build();
    }
}

// 漏洞 2：内部接口暴露在公网

// 错误：所有接口通过同一个 API Gateway 暴露，包括内部管理接口
// 修复：
// 1. API Gateway 层面的路由隔离
@Configuration
public class GatewayConfig {
    @Bean
    public RouteLocator routes(RouteLocatorBuilder builder) {
        return builder.routes()
            .route("public-api", r -> r
                .path("/api/**")
                .filters(f -> f.requestHeaderToHeader("X-Source", "external"))
                .uri("lb://public-services"))
            .route("internal-api", r -> r
                .path("/internal/**")
                .filters(f -> f.requestHeaderToHeader("X-Source", "internal"))
                .uri("lb://internal-services"))
            .build();
    }
}

// 2. NetworkPolicy 层面：internal-services 只允许来自 Gateway 的内网流量
// 见第 27.4 节

// 漏洞 3：JWT Token 的硬编码密钥
// 错误: String SECRET = "mySecretKey123"; // 在代码中 !!!
// 修复：从环境变量或 Vault 获取
@Value("${jwt.secret}")
private String jwtSecret;
// K8s: 通过 External Secrets Operator 注入 Vault 中的密钥
```

### 31.4.2 安全加固清单

```
各层的安全加固：

传输层：
  □ 全站 HTTPS / HSTS（HTTP Strict Transport Security）
  □ 服务间 mTLS（Istio 或 Spring Cloud Gateway）
  □ DNS over HTTPS

认证层：
  □ OAuth2 / OIDC 标准协议
  □ JWT 短期有效（Access Token 15 分钟）+ 轮换（Refresh Token）
  □ API Key 用于服务间认证（不是用户认证）

授权层：
  □ RBAC 或 ABAC（基于属性）
  □ 每个 API 检查权限——不在 Gateway 全局放过
  □ 行级权限（多租户：WHERE tenant_id = current_tenant）

数据层：
  □ 数据库中敏感列加密（AES-256）
  □ 传输中的数据加密（TLS 1.3）
  □ 备份数据也加密

代码与依赖：
  □ CI 中集成 SCA（Software Composition Analysis）—— OWASP Dependency-Check
  □ 私有镜像仓库 + Trivy 镜像扫描
  □ 禁止直接使用 ObjectInputStream（反序列化攻击）
```

---

## 31.5 可扩展性问题处理

### 31.5.1 扩展性瓶颈诊断

```java
// 瓶颈识别：什么是扩展性问题的信号？

// 信号 1：加机器后吞吐量不增长
// 原因：存在串行化瓶颈 —— 共享的资源（DB、锁、队列）跟不上

// 信号 2：数据库 CPU 随流量线性增长
// 原因：每个请求都经过数据库，数据库成了瓶颈

// 信号 3：部署窗口越来越长
// 原因：应用太大，启动从 5 秒变成了 2 分钟

// 应对策略：
// 1. 无状态设计 —— 扩展性的前提
//    如果服务是有状态的 → 引入 Redis 作为状态存储 → 服务变无状态

// 2. 数据库水平分片（Sharding）
//    按用户 ID 哈希到不同的数据库
//    问题：跨分片的查询和事务变得困难
//    → 在真正需要之前不要分片（单库 500GB 以内通常可以靠优化解决）

// 3. CQRS（见第 15 章）
//    读写分离模型 → 读模型可以独立扩展
//    写模型用单主，读模型用多个从库或 Elasticsearch

// 4. 异步化 —— 不是所有处理都需要在请求线程中完成
//    请求路径上只做必须同步的事
//    非关键路径（发通知、更新统计、写日志）全部异步化
```

### 31.5.2 容量规划

```java
// 容量规划不是猜，是基于数据的估算

public class CapacityPlanner {

    // 估算公式
    public CapacityEstimate estimate(SystemMetrics metrics) {
        // 单实例容量
        double maxTpsPerInstance = metrics.getP99LatencyMs() > 0
            ? 1000.0 / metrics.getP99LatencyMs() * metrics.getConcurrencyPerInstance()
            : 0;

        // 需要多少实例
        int requiredInstances = (int) Math.ceil(
            metrics.getPeakTps() / maxTpsPerInstance * 1.3  // 30% 余量
        );

        // 数据库容量
        long estimatedDbQps = metrics.getPeakTps()
            * metrics.getAvgDbQueriesPerRequest();
        // 如果 DB QPS > 数据库最大连接的 80% → 需要读写分离或缓存

        return new CapacityEstimate(
            requiredInstances,
            maxTpsPerInstance,
            estimatedDbQps
        );
    }
}

// 容量规划的经验法则：
// - 永远留有 30% 余量（应对突发流量）
// - 基于 P99 延迟计算容量（不是平均延迟）
// - 用压测验证计算结果（不是凭信心上线）
```

---

## 31.6 本章小结

典型架构问题的处理原则：

1. **性能问题**——先用 APM 定位瓶颈，再看 CPU/内存/IO 哪个是短板，针对性地优化
2. **可用性问题**——从超时/重试/熔断开始，逐步引入多副本/优雅关闭/混沌工程
3. **一致性问题**——区分可接受短暂不一致和必须强一致的场景，用幂等 + Outbox + 对账三层防护
4. **安全性问题**——传输加密 + 认证授权 + 输入校验 + 依赖扫描，四道防线
5. **可扩展性问题**——无状态设计是前提，异步化是杠杆，分片是最后的选择

通用原则：**80% 的问题来自 20% 的组件。先找到瓶颈，再决定方案。不要还没诊断清楚就开始优化。**
