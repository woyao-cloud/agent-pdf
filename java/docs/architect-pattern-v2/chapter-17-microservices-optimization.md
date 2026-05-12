# 第17章 微服务优化策略

第16章讨论了微服务的风险——本章讨论如何系统地优化微服务架构，让它在长期运行中保持健康和可持续性。

---

## 17.1 服务网格（Service Mesh）

```java
// 服务网格是"将通信治理从应用代码中提取到基础设施层"
// 应用不再需要自行处理熔断/重试/限流——Sidecar 代理替它做

// 在没有 Service Mesh 时：
// 每个服务都要集成 Resilience4j、Spring Cloud LoadBalancer、
// 日志、追踪 SDK
// → 代码重复、版本碎片化、语言绑定（只支持 Java）

// 有了 Istio + Envoy：
// 应用只需要写业务代码——Sidecar(Envoy proxy) 处理通信
// 熔断、重试、限流、负载均衡、TLS —— 配置在 Istio 层
// 对 Java/Go/Python/Node.js 一视同仁
```

```yaml
# Istio VirtualService —— 声明式流量管理
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts:
    - payment-service
  http:
    - route:
        - destination:
            host: payment-service
            subset: v1
          weight: 90       # 90% 流量到 v1
        - destination:
            host: payment-service
            subset: v2
          weight: 10       # 10% 流量到 v2（金丝雀发布）
      retries:
        attempts: 3        # 自动重试（不需要应用代码！）
        perTryTimeout: 2s
      timeout: 10s         # 请求超时
```

---

## 17.2 容器化与编排

### 17.2.1 Docker 最佳实践

```dockerfile
# 多阶段构建：构建和运行分离
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src/ src/
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080

# 非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 17.2.2 Kubernetes 部署策略

```yaml
# 滚动更新 —— 零停机部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 更新过程中最多额外 1 个 Pod
      maxUnavailable: 0    # 更新过程中不能有不可用的 Pod
  template:
    spec:
      containers:
        - name: order-service
          image: order-service:1.2.0
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
```

---

## 17.3 CI/CD 优化

```java
// 微服务的 CI/CD 必须解决的核心问题：
// 15 个服务的构建和部署不能都靠手工

// CI/CD Pipeline 的关键优化：
// 1. 增量构建：只有变更的服务才重新构建和部署
// 2. 并行构建：不相关的服务同时构建
// 3. 环境晋升：dev → staging → canary → production
// 4. 自动化回滚：健康检查失败 → 自动回到上一版本
```

```yaml
# GitHub Actions 示例：微服务的增量构建
name: Build and Deploy
on:
  push:
    branches: [main]
    paths:
      - 'order-service/**'   # 只有 order-service 路径变更时才触发

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: cd order-service && mvn package
      - name: Build Docker Image
        run: docker build -t order-service:${{ github.sha }} order-service/
      - name: Deploy to K8s
        run: |
          kubectl set image deployment/order-service \
            order-service=order-service:${{ github.sha }}
          kubectl rollout status deployment/order-service
```

---

## 17.4 监控与追踪

```java
// 微服务的监控三支柱：

// 1. Metrics（指标）—— Micrometer + Prometheus + Grafana
//    关键指标：TPS、响应时间(P50/P95/P99)、错误率、CPU、内存、GC

// 2. Logging（日志）—— ELK (Elasticsearch + Logstash + Kibana) / Loki
//    所有服务的日志进入中央存储——按 Trace ID 关联
//    日志格式一致：timestamp, level, service, traceId, message

// 3. Tracing（追踪）—— Jaeger / Zipkin / SkyWalking
//    一个用户请求在多个服务之间追踪完整的调用链

@RestController
public class OrderController {

    // Micrometer 自动记录 HTTP 请求指标
    @PostMapping("/orders")
    public OrderResult createOrder(@RequestBody OrderRequest request) {

        // 结构化日志 + Trace ID
        // Spring Cloud Sleuth 自动向日志中注入 traceId 和 spanId
        log.info("Creating order for user {}", request.getUserId());

        OrderResult result = orderService.create(request);

        // 自定义业务指标
        meterRegistry.counter("orders.created",
            "status", result.getStatus().name()).increment();

        return result;
    }
}
// 日志输出：2026-05-12 10:23:45.123 INFO [order-service,abc123,def456]
//           Creating order for user 42
//                     ↑ 服务名  ↑ traceId ↑ spanId
// Jaeger 中：用 traceId=abc123 搜索 → 看到完整的调用链
//   网关(5ms) → 订单服务(30ms) → 支付服务(50ms) → 库存服务(15ms)
```

**分布式追踪配置**：

```yaml
spring:
  application:
    name: order-service
management:
  tracing:
    sampling:
      probability: 1.0    # 开发环境 100% 采样，生产环境 10%
  zipkin:
    tracing:
      endpoint: http://zipkin:9411/api/v2/spans
```

---

## 17.5 性能优化

### 17.5.1 减少服务间调用链

```java
// 问题：一个页面展示需要调用 5 个服务
// GET /api/mobile/order-detail/123 → BFF 聚合：
//   1. 订单服务 (获取订单信息)
//   2. 支付服务 (获取支付状态)
//   3. 用户服务 (获取用户详情)
//   4. 物流服务 (获取物流跟踪)
//   5. 积分服务 (获取积分信息)
// → 5 次网络调用，总耗时 = max(各服务耗时) + 5 × RTT

// 优化：BFF 并行调用
@GetMapping("/mobile/order-detail/{orderId}")
public MobileOrderDetail getOrderDetail(@PathVariable Long orderId) {
    CompletableFuture<Order> orderFuture =
        CompletableFuture.supplyAsync(() -> orderClient.getById(orderId));

    CompletableFuture<PaymentInfo> paymentFuture =
        CompletableFuture.supplyAsync(() -> paymentClient.getByOrderId(orderId));

    CompletableFuture<UserProfile> userFuture =
        orderFuture.thenCompose(order ->
            CompletableFuture.supplyAsync(() ->
                userClient.getProfile(order.getUserId())));

    CompletableFuture<LogisticsInfo> logisticsFuture =
        CompletableFuture.supplyAsync(() ->
            logisticsClient.getByOrderId(orderId));

    return CompletableFuture
        .allOf(orderFuture, paymentFuture, userFuture, logisticsFuture)
        .thenApply(v -> new MobileOrderDetail(
            orderFuture.join(), paymentFuture.join(),
            userFuture.join(), logisticsFuture.join()))
        .join();  // 总耗时 = max(各服务耗时) + 1 × RTT（而非5个串行RTT）
}
```

### 17.5.2 数据预热与缓存

```java
// 缓存策略——减少不必要的服务间调用
// L1: 本地缓存(Caffeine) → L2: 分布式缓存(Redis) → L3: 源服务

@Cacheable(value = "user-profile", key = "#userId")
public UserProfile getUserProfile(Long userId) {
    // 第一次调用：查询用户服务（耗时 20ms）
    // 后续调用：从 Redis 返回（耗时 0.5ms）
    return userClient.getProfile(userId);
}
```

---

## 17.6 本章小结

微服务的优化不是"修修补补"——它是从架构之初就应该纳入设计的持续工程实践。五个优化方向：

1. **服务网格**：将通信治理从应用代码提升到基础设施
2. **容器编排**：自动化的部署、扩展和自我修复
3. **CI/CD**：增量构建 + 自动化部署 = 持续交付能力
4. **监控与追踪**：Metrics + Logging + Tracing 三支柱
5. **性能优化**：并行调用 + 多级缓存 = 克服分布式通信的成本

微服务篇（第11-17章）至此结束。
