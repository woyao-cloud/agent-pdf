# 第13章 服务通信模式

服务拆分的下一步是定义它们之间如何通信。在微服务架构中，通信模式的选择直接决定了系统的延迟特征、可靠性模型和故障传播模式。

---

## 13.1 同步通信

### 13.1.1 REST——最广泛的选择

```java
// 请求-响应：最直观的模式，也是默认选择

@RestController
public class OrderController {
    private final PaymentClient paymentClient;

    @PostMapping("/orders")
    public OrderResult createOrder(@RequestBody OrderRequest request) {
        // 同步调用支付——订单处理被阻塞直到支付返回
        PaymentResult payment = paymentClient.charge(request.getAmount());
        if (!payment.isSuccess()) {
            throw new PaymentFailedException();
        }
        return orderService.confirm(request, payment);
    }
}

// 适用：需要即时响应才能继续的流程（支付、认证、校验）
// 不适用：可以异步完成的操作（发邮件、写审计日志、发积分）
```

### 13.1.2 gRPC——高性能场景

```java
// 微服务间的同步调用中，gRPC 是 REST 的直接替代
// 优势：Protocol Buffers 更小更快，HTTP/2 多路复用，强类型代码生成
// 劣势：浏览器不原生支持，调试不如 JSON 直观

// 适用：内部微服务间高频、低延迟的同步调用
// 不适用：需要浏览器直接调用的 API
```

---

## 13.2 异步通信

### 13.2.1 消息队列——解耦生产者和消费者

```java
// 异步通信的核心价值：时间解耦（不需要同时在线）+ 空间解耦（不知道对方在哪）

// 发布端——订单服务
@Service
public class OrderEventPublisher {
    private final KafkaTemplate<String, Object> kafka;

    @Transactional
    public void publishOrderCreated(Order order) {
        // 发送消息后立即返回——不等待消费者处理
        OrderCreatedEvent event = new OrderCreatedEvent(
            order.getId(), order.getUserId(), order.getAmount());

        kafka.send("order-events", order.getId().toString(), event);
        // 订单服务不关心：谁在消费？有没有消费成功？什么时候消费？
        // 这就是"解耦"
    }
}

// 消费端——积分服务（和订单服务完全解耦）
@Component
public class PointsEventConsumer {

    @KafkaListener(topics = "order-events")
    public void handleOrderCreated(OrderCreatedEvent event) {
        // 积分服务独立处理——失败不影响订单服务的正常运行
        pointsService.awardPoints(event.getUserId(), event.getAmount());
    }
}

// 消费端——通知服务（又一个独立消费者）
@Component
public class NotificationEventConsumer {

    @KafkaListener(topics = "order-events")
    public void handleOrderCreated(OrderCreatedEvent event) {
        notificationService.sendOrderConfirmation(event.getUserId());
    }
}
```

### 13.2.2 发布-订阅 vs 点对点

| 模式 | 机制 | 应用场景 |
|------|------|----------|
| **点对点 (Queue)** | 消息被一个消费者消费后即被移除 | 任务分派（一个订单只由一个 worker 处理） |
| **发布-订阅 (Topic)** | 消息被所有订阅者消费，各自保留偏移量 | 事件广播（订单创建事件被积分、通知、审计等所有服务消费） |

---

## 13.3 服务发现

### 13.3.1 为什么需要服务发现

```java
// 问题：订单服务怎么知道支付服务的地址？
// 硬编码：paymentClient = new RestTemplate("http://10.0.1.15:8080")
//   → 支付服务扩容到 3 个实例 → 谁更新这个地址？
//   → 支付服务迁移到另一个机房 → IP 变了

// 答案：服务发现
// 1. 支付服务启动时向注册中心登记："我是 payment-service，我的地址是 10.0.1.15:8080"
// 2. 订单服务调用前向注册中心查询："请给我一个 payment-service 的可用地址"
// 3. 注册中心维护着"哪些服务活着、地址是什么"
```

### 13.3.2 Spring Cloud 服务发现

```yaml
# 服务注册配置（application.yml）
spring:
  application:
    name: order-service   # 服务名——这是服务发现的唯一标识
  cloud:
    nacos:
      discovery:
        server-addr: nacos-server:8848  # 注册中心地址
    loadbalancer:
      nacos:
        enabled: true
```

```java
// 利用服务发现的负载均衡调用
@Service
public class PaymentServiceClient {

    private final RestTemplate restTemplate;
    private final DiscoveryClient discoveryClient;

    public PaymentResult charge(PaymentRequest request) {
        // 方式1：Spring Cloud LoadBalancer 自动处理
        return restTemplate.postForObject(
            "http://payment-service/api/charge",   // 服务名替代 IP
            request, PaymentResult.class);
        // LoadBalancer 自动：查询 Nacos → 选择实例 → 包装请求 → 发送

        // 方式2：手动服务发现（通常不需要）
        // List<ServiceInstance> instances =
        //     discoveryClient.getInstances("payment-service");
        // ServiceInstance instance = loadBalancer.choose(instances);
        // restTemplate.postForObject(instance.getUri() + "/api/charge", ...);
    }
}
```

---

## 13.4 负载均衡

### 13.4.1 服务端 vs 客户端负载均衡

```
服务端负载均衡：
  客户端 → LB (Nginx/K8s Service) → 服务实例
  优势：客户端简单，不需要知道有多个实例
  劣势：多一跳，LB 成为单点和瓶颈

客户端负载均衡（微服务推荐）：
  客户端 → (查注册中心) → 直接连接到选中的服务实例
  优势：无中间跳，扩展性好
  劣势：客户端需要负载均衡逻辑（Spring Cloud LoadBalancer 封装了）
```

### 13.4.2 负载均衡策略

```java
// Spring Cloud LoadBalancer 支持的策略：
// - 轮询 (Round Robin)：依次分发给每个实例
// - 随机 (Random)
// - 加权响应时间：更快响应的实例获得更多请求
// - 一致性哈希：同一个用户总是路由到同一个实例

// 自定义负载均衡策略：
@Configuration
public class LoadBalancerConfig {

    @Bean
    public ReactorLoadBalancer<ServiceInstance> customLoadBalancer(
            Environment environment,
            LoadBalancerClientFactory factory) {
        // 在特定场景（如金丝雀发布）中可能需要自定义策略
        // 例如：10% 流量到新版本，90% 到旧版本
        return new RoundRobinLoadBalancer(environment);
    }
}
```

---

## 13.5 通信模式的决策框架

```java
// 为每个服务间交互选择正确的通信模式：

public class CommunicationDecision {

    public CommunicationPattern decide(ServiceInteraction interaction) {
        // 问题1：调用方需要即时结果才能继续吗？
        if (interaction.requiresImmediateResult()) {
            // → 同步通信
            if (interaction.requiresHighPerformance()) {
                return CommunicationPattern.GRPC;
            }
            return CommunicationPattern.REST;
        }

        // 问题2：事件有多个消费者吗？
        if (interaction.hasMultipleConsumers()) {
            return CommunicationPattern.PUBLISH_SUBSCRIBE;
        }

        // 问题3：需要保证至少被处理一次吗？
        if (interaction.requiresAtLeastOnceDelivery()) {
            return CommunicationPattern.POINT_TO_POINT_QUEUE;
        }

        return CommunicationPattern.ASYNC_EVENT;
    }
}

// 黄金规则：能用异步的时候用异步——它不阻塞调用方
//          但不要为了异步而异步——如果调用方确实需要结果，同步是对的
```

---

## 13.6 本章小结

服务通信模式的选择框架：先问"调用方需要即时结果吗"，再问"有几个消费者"，最后问"性能要求多高"。

- **同步通信（REST/gRPC）**：请求-响应流程的骨架。调用方等着结果才能继续。
- **异步通信（消息队列）**：事件驱动的基础设施。发布方发完即忘，消费方独立处理。
- **服务发现**：让服务在运行时找到彼此，而非在编码时写死地址。
- **负载均衡**：将流量合理分配到多个实例，客户端负载均衡是现代微服务的标准选择。
