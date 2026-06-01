# 第4章 全链路追踪：MDC 与 TraceId 注入

## 本章导读

想象这样一个场景：客户投诉在 App 中下单失败了，你的系统有 3 个服务参与了这个请求——订单服务、支付服务、库存服务。每个服务都有自己的日志。

```
排查的困境：

  Order Service 的日志：
  10:00:00.123 [http-nio-8080-exec-3] INFO  收到下单请求 - userId=1001
  10:00:00.456 [http-nio-8080-exec-3] INFO  调用支付服务
  10:00:01.234 [http-nio-8080-exec-3] ERROR 支付失败！

  Payment Service 的日志：
  10:00:00.789 [http-nio-8081-exec-1] INFO  收到支付请求
  10:00:01.000 [http-nio-8081-exec-1] ERROR 库存扣减失败！

  Stock Service 的日志：
  10:00:00.900 [http-nio-8082-exec-2] ERROR 库存不足 - productId=2001

  关键问题：你怎么知道 Order Service 的"http-nio-8080-exec-3"对应
  Payment Service 的"http-nio-8081-exec-1"？——你不知道！
  因为你没有 TraceId！你只能靠时间戳猜测，但并发请求下时间戳会重叠
```

**TraceId（链路追踪 ID）** 就是在所有服务间传递的唯一标识，贯穿一次请求的完整生命周期。有了 TraceId，你可以在 Kibana 中搜索 `traceId: "abc-def-ghi"`，然后一键拉出跨 3 个服务的所有日志。

---

## 4.1 跨微服务排障的噩梦

```
没有 TraceId 时的排障流程：

  1. 在订单服务日志中搜 userId="1001" → 找到 10:00:00 有一条记录
  2. 日志显示"调用支付服务"，但不知道支付服务的线程名
  3. 去支付服务搜 10:00:00 附近的日志 → 有 20 条记录
     → 哪一条是 userId=1001 的请求？
     → 不知道，因为支付服务的日志不记录 userId
  4. 尝试用耗时、接口名来匹配 → 猜错了
  5. 耗时：20 分钟，结论：不确定

  有 TraceId 时的排障流程：

  1. 在 Kibana 搜索 traceId:"abc-def-ghi"
  2. 1 秒返回 15 条日志，按时间排序
  3. 直接看到订单服务→支付服务→库存服务的完整调用链
  4. 在库存服务日志中看到"库存不足 - productId=2001"
  5. 耗时：30 秒，结论：库存服务的问题
```

---

## 4.2 基于 Spring Boot 3 + Micrometer Tracing

Spring Boot 3.0+ 内置了 **Micrometer Tracing**，它会自动为每个 HTTP 请求生成 traceId 和 spanId，并在 Feign Client / RestTemplate 调用时透传到下游服务。

```xml
<!-- pom.xml -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>

<!-- 自动将 traceId 注入 MDC -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-integration-test</artifactId>
    <scope>test</scope>
</dependency>
```

```yaml
# application.yml
spring:
  application:
    name: order-service

  # Micrometer Tracing 配置
  sleuth:  # Spring Boot 3.x 中 sleuth 已废弃，用 micrometer
    enabled: false

# Spring Boot 3.x 使用 Micrometer Tracing
logging:
  pattern:
    level: "%5p [%X{traceId:-},%X{spanId:-}]"
  # 控制台日志级别中显示 traceId
```

```java
// 自动将 traceId 注入到日志 MDC
// 只要引入了 micrometer-tracing-bridge-brave，Spring Boot 自动配置以下行为：

// 1. 收到 HTTP 请求时
//    → 如果请求头中有 X-B3-TraceId，使用它
//    → 如果没有，自动生成

// 2. 通过 Feign Client / RestTemplate 调用下游时
//    → 自动将 traceId 写入请求头 X-B3-TraceId

// 3. 将 traceId 和 spanId 写入 MDC
//    → logback-spring.xml 中的 %X{traceId} 能取到

// 所有这些都不需要写任何代码！
```

### 手动验证 TraceId 透传

```java
@RestController
@RequestMapping("/api/order")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    @Autowired
    private PaymentClient paymentClient;

    @PostMapping("/create")
    public ResponseEntity<String> createOrder(@RequestBody OrderRequest request) {
        // 日志中自动包含 traceId（由 Micrometer Tracing 注入 MDC）
        log.info("收到下单请求: userId={}, productId={}, amount={}",
            request.getUserId(), request.getProductId(), request.getAmount());

        // Feign 调用下游——traceId 自动透传
        String paymentResult = paymentClient.pay(request.getOrderId(), request.getAmount());

        log.info("支付结果: {}", paymentResult);
        return ResponseEntity.ok(paymentResult);
    }
}

// Feign Client 定义
@FeignClient(name = "payment-service", url = "${payment.service.url}")
public interface PaymentClient {

    @PostMapping("/api/payment/pay")
    String pay(@RequestParam("orderId") String orderId, @RequestParam("amount") int amount);
}
```

---

## 4.3 自定义 TraceId Filter

在某些场景下（比如老项目升级、或者需要兼容自定义的 traceId 头），你可能需要手动管理 TraceId。以下是标准的 Servlet Filter 实现：

```java
/**
 * TraceId Filter
 *
 * 功能：
 *   1. 从 HTTP 请求头中获取 traceId
 *   2. 如果没有，自动生成
 *   3. 注入 MDC（使 logback 可以输出）
 *   4. 请求完成后清理 MDC（防止内存泄漏）
 *
 * 兼容性：
 *   从请求头 X-Trace-Id / X-B3-TraceId 读取
 *   输出到响应头 X-Trace-Id（供前端确认追踪 ID）
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter implements Filter {

    private static final String TRACE_ID_HEADER = "X-Trace-Id";
    private static final String B3_TRACE_ID_HEADER = "X-B3-TraceId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        try {
            // 1. 从请求头获取 traceId（优先级：X-Trace-Id > X-B3-TraceId > 自动生成）
            String traceId = httpRequest.getHeader(TRACE_ID_HEADER);
            if (traceId == null || traceId.isEmpty()) {
                traceId = httpRequest.getHeader(B3_TRACE_ID_HEADER);
            }
            if (traceId == null || traceId.isEmpty()) {
                traceId = UUID.randomUUID().toString().replace("-", "");
            }

            // 2. 注入 MDC
            MDC.put("traceId", traceId);
            MDC.put("spanId", generateSpanId());

            // 3. 在响应头中返回 traceId（方便前端或客户端查看）
            httpResponse.setHeader(TRACE_ID_HEADER, traceId);

            // 4. 继续请求处理
            chain.doFilter(request, response);

        } finally {
            // 5. ⚠️ 必须清理 MDC！否则线程复用导致 traceId 错乱
            MDC.clear();
        }
    }

    private String generateSpanId() {
        return Long.toHexString(ThreadLocalRandom.current().nextLong());
    }
}
```

### RestTemplate TraceId 透传

```java
/**
 * RestTemplate 拦截器——自动透传 TraceId
 * 当订单服务通过 RestTemplate 调用支付服务时
 * 自动将 traceId 写入请求头
 */
@Component
public class TraceIdInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(
            HttpRequest request, byte[] body,
            ClientHttpRequestExecution execution) throws IOException {

        // 从当前 MDC 中获取 traceId，写入请求头
        String traceId = MDC.get("traceId");
        if (traceId != null) {
            request.getHeaders().add("X-Trace-Id", traceId);
        }

        return execution.execute(request, body);
    }

    /**
     * 注册拦截器到 RestTemplate
     */
    @Bean
    public RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setInterceptors(List.of(new TraceIdInterceptor()));
        return restTemplate;
    }
}
```

---

## 4.4 业务上下文注入

除了 traceId，我们通常还需要在日志中记录 userId、tenantId 等业务上下文：

```java
/**
 * 业务上下文 Filter
 * 将 userId、tenantId 等业务信息注入 MDC
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)  // 在 TraceIdFilter 之后执行
public class BusinessContextFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;

        try {
            // 从请求头或 Token 中提取用户信息
            String userId = extractUserId(httpRequest);
            String tenantId = extractTenantId(httpRequest);
            String requestPath = httpRequest.getRequestURI();

            // 注入 MDC
            if (userId != null) MDC.put("userId", userId);
            if (tenantId != null) MDC.put("tenantId", tenantId);
            MDC.put("requestPath", requestPath);

            chain.doFilter(request, response);

        } finally {
            // 清理（只清理注入的字段，不要 clear 全部——traceId 可能被后面的 Filter 使用）
            MDC.remove("userId");
            MDC.remove("tenantId");
            MDC.remove("requestPath");
        }
    }

    private String extractUserId(HttpServletRequest request) {
        // 从 JWT Token 或请求头中提取
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            // 解析 Token 获取 userId...
            return "user_1001"; // 示例
        }
        return null;
    }

    private String extractTenantId(HttpServletRequest request) {
        return request.getHeader("X-Tenant-Id");
    }
}
```

### 在业务代码中使用

```java
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order createOrder(OrderRequest request) {
        // 手动设置业务字段到 MDC（覆盖 Filter 中自动提取的值）
        MDC.put("orderId", request.getOrderId());
        MDC.put("productId", request.getProductId());

        try {
            log.info("开始创建订单");

            // 业务逻辑...
            log.info("库存扣减成功");

            return order;

        } finally {
            // 清理，避免影响下一条日志
            MDC.remove("orderId");
            MDC.remove("productId");
        }
    }
}
```

---

## 本章总结

| 组件 | 职责 | 自动 | 手动 |
|------|------|------|------|
| **Micrometer Tracing** | 自动生成 traceId/spanId，Feign 透传 | ✅ | ❌ |
| **TraceIdFilter** | 从请求头获取 traceId，注入 MDC | ❌ | ✅ |
| **TraceIdInterceptor** | RestTemplate 透传 traceId | ❌ | ✅ |
| **BusinessContextFilter** | 注入 userId/tenantId 到 MDC | ❌ | ✅ |

**核心原则**：
1. **TraceId 是全链路排障的基础**——没有 TraceId，跨服务的日志就像散落在地上的拼图碎片，你永远不知道哪些碎片属于同一幅画
2. **Spring Boot 3 + Micrometer Tracing 是最省力的方案**——零代码实现 traceId 的生成和透传。老项目才需要手动实现 TraceIdFilter
3. **MDC 必须在 finally 块中清理**——Web 服务器的线程是复用的，不清除 MDC 会导致下一条日志带上错误的 traceId。这是最常见的新手 Bug
4. **业务字段（userId、orderId）也要注入 MDC**——traceId 能串联一次请求的所有日志。但如果你只知道用户的 ID（客服拿到的），不知道 traceId，你需要通过 userId 来搜索