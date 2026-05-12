# 第14章 服务治理模式

服务治理（Service Governance）是微服务架构的"免疫系统"——它在不可靠的网络和不可控的流量面前保护服务的稳定性。治理的五种核心机制——限流、熔断、降级、隔离、超时——构成了微服务可靠性的基础防线。

---

## 14.1 限流 (Rate Limiting)

### 14.1.1 为什么需要限流

```java
// 没有限流的系统：流量突发 → 所有资源耗尽 → 系统崩溃
// 有限流的系统：流量超限 → 拒绝多余请求 → 系统继续服务（至少部分用户得到服务）

// 限流保护的对象：
// - 数据库（连接数有限，查询能力有限）
// - 下游服务（下游的容量也是有限的）
// - 自身（CPU、内存、线程都有上限）
```

### 14.1.2 Resilience4j 限流实现

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PostMapping
    @RateLimiter(name = "createOrder", fallbackMethod = "rateLimitFallback")
    public ResponseEntity<OrderResult> createOrder(
            @Valid @RequestBody CreateOrderRequest request) {
        return ResponseEntity.ok(orderService.create(request));
    }

    public ResponseEntity<OrderResult> rateLimitFallback(
            CreateOrderRequest request, RequestNotPermitted e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .body(OrderResult.error("请求过于频繁，请稍后重试"));
    }
}
```

```yaml
# application.yml —— 限流配置
resilience4j:
  ratelimiter:
    instances:
      createOrder:
        limit-for-period: 1000        # 每秒 1000 个请求
        limit-refresh-period: 1s      # 令牌补充周期
        timeout-duration: 500ms       # 等待获取令牌的最长时间（超时快速失败）
```

---

## 14.2 熔断 (Circuit Breaker)

### 14.2.1 熔断器状态机

```
熔断器防止级联故障——当一个下游服务出问题时，不继续向它发请求

        ┌──────────┐
        │  CLOSED  │ 正常状态——请求畅通
        │ (闭合)    │
        └────┬─────┘
             │ 失败次数达到阈值
             ▼
        ┌──────────┐
        │  OPEN    │ 熔断状态——直接拒绝所有请求
        │ (断开)    │  返回 fallback 结果
        └────┬─────┘
             │ 经过一段冷却时间(wait-duration)
             ▼
        ┌──────────┐
        │HALF_OPEN │ 半开状态——试探性放行少量请求
        │ (半开)    │
        └────┬─────┘
       成功  │ 失败
     ┌──────┴──────┐
     ▼             ▼
  CLOSED         OPEN
 (恢复正常)      (重新熔断)
```

### 14.2.2 实现

```java
@Service
public class PaymentServiceClient {

    @CircuitBreaker(
        name = "paymentService",
        fallbackMethod = "paymentFallback"
    )
    public PaymentResult charge(PaymentRequest request) {
        return restTemplate.postForObject(
            "http://payment-service/api/charge", request, PaymentResult.class);
    }

    public PaymentResult paymentFallback(PaymentRequest request, Throwable t) {
        log.error("支付服务熔断: {}", t.getMessage());
        // 降级：返回"处理中"——用户不会看到错误页面
        return PaymentResult.pending("支付正在处理，请稍后查询");
    }
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        sliding-window-size: 100       # 滑动窗口大小（最近100次请求）
        failure-rate-threshold: 50     # 失败率 > 50% → 熔断
        wait-duration-in-open-state: 10s  # 熔断后冷却 10 秒
        permitted-number-of-calls-in-half-open-state: 5  # 半开时允许 5 次试探
```

---

## 14.3 降级 (Fallback / Degradation)

### 14.3.1 降级策略分类

| 策略 | 描述 | 示例 |
|------|------|------|
| **返回默认值** | 无法获取真实数据时返回合理默认值 | 推荐列表为空 → 返回热门商品 |
| **返回缓存数据** | 用陈旧但可用的缓存数据 | 价格查询失败 → 返回上一次查询到的价格 |
| **降级功能** | 关闭非关键功能保核心功能 | 大促期间关闭"订单历史查询"保"下单" |
| **静默处理** | 非关键功能故障后静默忽略 | 推荐系统挂了 → 正常返回订单结果，只是没有推荐 |

```java
// 多级降级链
@Service
public class ProductRecommendationService {

    public List<Product> getRecommendations(Long userId) {
        try {
            // 第1优先级：个性化推荐（AI模型）
            return aiRecommendationClient.recommend(userId);
        } catch (Exception e) {
            log.warn("AI推荐失败，降级到热门商品");
        }

        try {
            // 第2优先级：热门商品（Redis）
            return popularProductsClient.getTop20();
        } catch (Exception e) {
            log.warn("热门商品获取失败，降级到静态列表");
        }

        // 第3优先级：静态默认列表（hardcoded 兜底）
        return DEFAULT_PRODUCT_LIST;  // 至少不是空列表
    }
}
```

---

## 14.4 隔离 (Isolation / Bulkhead)

### 14.4.1 舱壁模式

```java
// 舱壁模式（Bulkhead）：为不同的下游调用分配独立的资源池
// 一个下游的慢调用不应该耗尽所有资源

// 线程池隔离——每个下游服务有独立线程池
@Configuration
public class BulkheadConfig {

    @Bean
    public ThreadPoolTaskExecutor paymentExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);      // 支付服务专用线程池
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("payment-");
        return executor;
    }

    @Bean
    public ThreadPoolTaskExecutor inventoryExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);       // 库存服务专用线程池
        executor.setMaxPoolSize(10);
        executor.setThreadNamePrefix("inventory-");
        return executor;
    }
    // 即使支付服务的 20 个线程全部卡住，
    // 库存服务的 5 个线程仍然可以正常工作
}
```

### 14.4.2 Resilience4j Bulkhead

```java
@Service
public class InventoryServiceClient {

    @Bulkhead(
        name = "inventoryService",
        fallbackMethod = "inventoryFallback",
        type = Bulkhead.Type.SEMAPHORE  // 信号量隔离（轻量级）
    )
    public InventoryResult reserve(List<OrderItem> items) {
        return restTemplate.postForObject(
            "http://inventory-service/api/reserve", items, InventoryResult.class);
    }

    public InventoryResult inventoryFallback(List<OrderItem> items, Throwable t) {
        log.warn("库存服务隔离舱已满: {}", t.getMessage());
        return InventoryResult.unavailable("库存服务繁忙，请稍后重试");
    }
}
```

---

## 14.5 超时控制

```java
// 超时是最简单的治理机制，也是最容易被忽略的
// "没有超时的调用 = 潜在的无限等待"

@Bean
public RestTemplate restTemplate(RestTemplateBuilder builder) {
    return builder
        .connectTimeout(Duration.ofSeconds(2))   // 建立 TCP 连接的超时
        .readTimeout(Duration.ofSeconds(5))       // 等待响应的超时
        .build();
}

// Feign 超时配置
// feign.client.config.payment-service.connectTimeout: 2000
// feign.client.config.payment-service.readTimeout: 5000

// 超时设置的原则：
// 1. 正常 P99 响应时间的 2-3 倍（如果 P99 是 200ms，超时设 500ms）
// 2. 下游 SLA 承诺的响应时间 + 网络抖动余量
// 3. 不要太短——正常的网络抖动不应该触发超时
// 4. 不要太长——超时的意义在于快速失败，不是无限等待
```

---

## 14.6 本章小结

五种服务治理机制形成了微服务的防护层次：

| 机制 | 作用 | 触发条件 |
|------|------|----------|
| **超时** | 防止无限等待 | 响应时间超过阈值 |
| **限流** | 保护自身不被过载 | 请求速率超过容量 |
| **熔断** | 保护下游不继续受损 | 下游失败率超过阈值 |
| **降级** | 提供有损但可用的服务 | 依赖不可用 |
| **隔离** | 防止故障传播 | 资源池满 |

它们的组合使用形成了微服务稳定性的基本保障。单独使用任何一种都不足以应对生产环境的复杂性——这五种机制是互相配合的一个体系，而非五个独立的"开关"。
