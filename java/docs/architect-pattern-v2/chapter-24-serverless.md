# 第24章 无服务器架构（Serverless）

Serverless 是云原生光谱的极端——你不再管理服务器、VM 甚至容器实例。你只写函数，平台负责执行、扩展、计费。

---

## 24.1 FaaS (函数即服务)

### 24.1.1 核心理念

```
传统部署：        容器化：          Serverless：
  管理服务器        管理容器           只管函数
  ↓                  ↓                  ↓
  买/租机器         写 Dockerfile      写 handleRequest()
  装 OS             push 到 Registry   deploy 函数
  装 JRE            kubectl apply      平台自动扩展/缩容到零
  部署应用                               按调用次数计费
  配置负载均衡
  配置监控
```

### 24.1.2 Java FaaS 实现

```java
// AWS Lambda (Java)
public class OrderHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final OrderService orderService = new OrderService();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(
            APIGatewayProxyRequestEvent input, Context context) {

        // Lambda 自动：负载均衡、扩展、监控、日志聚合
        CreateOrderRequest request = parseRequest(input.getBody());

        OrderResult result = orderService.create(request);

        return buildResponse(200, toJson(result));
    }
}

// Spring Cloud Function —— 写普通 Spring 代码，部署到各种 FaaS 平台
@SpringBootApplication
public class ServerlessOrderApplication {

    @Bean
    public Function<CreateOrderRequest, OrderResult> createOrder() {
        return request -> {
            return orderService.create(request);
        };
    }
    // 同一个 Function Bean 可以部署在 AWS Lambda、Azure Functions 或 Knative
}
```

---

## 24.2 BaaS (后端即服务)

BaaS 将常见的后端能力作为托管服务提供——你不需要自己实现：

- **认证**：Auth0 / Firebase Auth / AWS Cognito
- **数据库**：DynamoDB / Firestore / Supabase
- **存储**：S3 / Cloud Storage
- **消息队列**：SQS / PubSub

Serverless 应用通常是 **FaaS (计算) + BaaS (能力) = 完整的应用**。

---

## 24.3 冷启动问题

```java
// Serverless 最大的工程挑战：当函数长时间没有调用，平台会回收实例
// 下一个请求来临时，需要"冷启动"——初始化容器+JVM+Spring Context

// 冷启动时间线（Java + Spring Boot on Lambda）：
// 0s: 请求到达 → 分配容器
// 0.5s: 容器就绪 → JVM 启动
// 2s: JVM 就绪 → Spring Context 初始化（扫描 Bean、建立连接池）
// 8s: Context 就绪 → 开始处理请求
// → 总冷启动时间：~10 秒——对 Web API 来说不可接受

// 优化策略：
// 1. GraalVM Native Image —— AOT 编译，消除 JVM 启动和类加载时间
//    冷启动: ~2s（快了 5x）
// 2. 预留并发（Provisioned Concurrency）—— 始终保持 N 个"热"实例
//    冷启动: 0s（代价：为闲置实例付费）
// 3. Spring AOT + Spring Boot 3.x 优化——减少运行时反射

// 适用性判断：
// 低延迟要求(API < 200ms P95) → 不适合 Serverless 或需要预留并发
// 后台任务、异步处理 → Serverless 的理想场景
```

---

## 24.4 适用场景

| 适合 Serverless | 不适合 Serverless |
|-----------------|------------------|
| 定时任务 / Cron Job | 低延迟 Web API（< 100ms P95） |
| 事件驱动的数据处理（S3上传→处理） | 长连接应用（WebSocket 聊天） |
| 流量波动大（偶尔用，大部分时候零） | 稳定的高流量（Serverless 按次计费不划算） |
| 无状态的 API Endpoint | 有状态的长流程（需要维持会话） |
| 快速原型 / MVP | 需要精细的 JVM 调优 |

---

## 24.5 本章小结

Serverless 的价值主张是**"你不需要关心基础设施"**——但这把双刃剑的另一面是**"你对基础设施失去控制"**。冷启动、供应商锁定、调试困难是三个核心代价。

Serverless 的最佳战场是**事件驱动的工作负载**和**不可预测的间歇性流量**。如果你的流量曲线从 0 到 10000 TPS 在 10 分钟内波动——Serverless 几乎是最优解。
