# 第8章 微服务架构模式
微服务架构将应用拆分为一组小型、 自治的服务， 每个服务围绕业务能力构建， 可以独立部署和扩展。
## 8.1 解决的问题与应用场景
### 8.1.1 解决的问题
- 单体应用过于庞大
- 团队协作困难
- 部署周期长
- 技术栈僵化
### 8.1.2 适用场景
- 大型复杂应用
- 需要快速迭代
- 多团队并行开发
- 高并发系统
## 8.2 实现原理
### 8.2.1 架构图
```
┌─────────────────────────────────────────────────────┐
│                    API Gateway                       │
└─────────────────────┬───────────────────────────────┘
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ User     │ │ Order    │ │ Payment  │
    │ Service  │ │ Service  │ │ Service  │
    └────┬─────┘ └────┬─────┘ └────┬─────┘
         │            │            │
         ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │User DB   │ │Order DB  │ │Payment DB│
    └──────────┘ └──────────┘ └──────────┘
```### 8.2.2 服务拆分模式
```java
// 按业务能力拆分
public class ServiceDefinition {
    // 用户服务
    @Service("user-service")
    public class UserService { }
    
    // 订单服务  
    @Service("order-service")
    public class OrderService { }
    
    // 支付服务
    @Service("payment-service")  
    public class PaymentService { }
}
```## 8.3 服务通信
### 8.3.1 同步通信（REST）
```java
// 服务提供者
@RestController
public class UserController {
    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
}

// 服务消费者
@FeignClient("user-service")
public interface UserClient {
    @GetMapping("/users/{id}")
    User getUser(@PathVariable("id") Long id);
}
```### 8.3.2 异步通信（消息队列）
```java
// 生产者
@Service
public class OrderService {
    @Autowired
    private MessageProducer producer;
    
    public void createOrder(Order order) {
        orderRepository.save(order);
        producer.send("order.created", order);
    }
}

// 消费者  
@Component
public class OrderConsumer {
    @RabbitListener(queues = "order.created")
    public void handleOrderCreated(Order order) {
        // 处理订单创建事件
    }
}
```
## 8.4 服务治理
### 8.4.1 限流
```java
// 令牌桶限流
@Component
public class RateLimiter {
    private final RateLimiter limiter = RateLimiter.create(100); // 100 QPS
    
    public boolean tryAcquire() {
        return limiter.tryAcquire();
    }
}@Service
public class ApiService {    @Autowired    private RateLimiter rateLimiter;        public void call() {        if (!rateLimiter.tryAcquire()) {            throw new RateLimitException();        }        // 业务逻辑    }}
```### 8.4.2 熔断
```java
@Component
public class CircuitBreakerConfig {
    @Bean
    public CircuitBreakerFactory cbFactory() {
        return new CircuitBreakerFactory() {
            @Override
            public CircuitBreaker create(String name) {
                return CircuitBreaker.of(name, 
                    CircuitBreakerConfig.custom()
                        .failureRateThreshold(50)
                        .waitDurationInOpenState(30s)
                        .build());
            }
        };
    }
}@Service
public class ExternalService {
    @Autowired
    private CircuitBreakerFactory cbFactory;        public String callExternal() {        CircuitBreaker cb = cbFactory.create("external");        return cb.run(() -> httpClient.get(url),                 throwable -> fallback());    }    
    private String fallback() { return "default"; }}
```## 8.5 潜在风险与问题
### 8.5.1 分布式系统复杂性
- 服务发现
- 负载均衡
- 故障转移
### 8.5.2 数据一致性问题
```java
// 分布式事务问题
// 场景：下单流程需要：扣库存 + 创建订单 + 扣余额// 问题：任何一个步骤失败，其他步骤可能已执行
// 解决方案：Saga模式
public class SagaOrchestrator {    public void execute(OrderSagaRequest request) {        try {            inventoryService.deduct(request.getItems());        } catch (Exception e) {            compensate(request);            throw e;        }                try {            orderService.create(request);        } catch (Exception e) {            inventoryService.compensate(request.getItems());            throw e;        }                
        try {            paymentService.deduct(request.getAmount());        } catch (Exception e) {            inventoryService.compensate(request.getItems());            orderService.cancel(request.getOrderId());            throw e;        }    }}
```### 8.5.3 网络延迟与故障
- 延迟累加
- 链路追踪困难
- 调试复杂度高
### 8.5.4 测试复杂度
- 集成测试复杂
- 需要容器环境
- 依赖外部服务
## 8.6 优化策略
### 8.6.1 服务网格
```yaml
# Istio配置示例
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: my-service
spec:
  hosts:
  - my-service
  http:
  - route:
    - destination:
        host: my-service
        subset: v1
      weight: 80
    - destination:
        host: my-service  
        subset: v2
      weight: 20
```### 8.6.2 链路追踪
```java
// Sleuth + Zipkin
@Configuration
public class TracingConfig {
    @Bean
    public Sampler defaultSampler() {
        return Sampler.alwaysSample();
    }
}// 使用MDC传递traceId
MDC.put("traceId", Span.current().getTraceId());```### 8.6.3 容器化与编排
```yaml
# docker-compose.yml
version: '3.8'
services:
  user-service:
    build: ./user-service
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
    depends_on:
      - redis
      - mysql
```## 8.7 本章小结### 优势- 独立部署- 技术多样性- 弹性伸缩- 快速迭代### 缺点- 复杂度高- 运维成本高- 数据一致性挑战- 分布式系统复杂性### 适用场景- 大型复杂系统- 快速迭代需求- 多团队开发- 高并发高可用---在下一章中， 我们将继续学习事件驱动架构模式。