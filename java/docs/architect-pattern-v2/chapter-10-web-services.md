# 第10章 Web服务模式

Web服务模式是 SOA 和微服务在通信层面的具体实现。REST、SOAP、GraphQL 和 gRPC 是四种主流的 Web 服务架构风格，它们各自解决"客户端和服务器之间怎么通信"这个基本问题，但用截然不同的设计哲学。

---

## 10.1 RESTful架构

### 10.1.1 核心原则

REST (Representational State Transfer) 由 Roy Fielding 在 2000 年的博士论文中提出。它不是协议——它是**架构风格**。它的六个核心约束：

| 约束 | 含义 | Spring 实现 |
|------|------|------------|
| **客户端-服务器** | UI 和数据分离，各自独立演进 | 前端 SPA + Spring Boot API |
| **无状态** | 每个请求包含所有必要信息，服务器不保存客户端会话 | JWT Token、OAuth2 |
| **缓存** | 响应必须显式标记是否可缓存 | `Cache-Control` 头 |
| **统一接口** | 用标准 HTTP 方法操作资源 | GET/POST/PUT/DELETE 语义 |
| **分层系统** | 客户端不知道是直连还是经过了代理/网关 | Nginx → Tomcat → DB |
| **按需代码（可选）** | 服务器可以发送可执行代码给客户端 | JavaScript 下载 |

### 10.1.2 Spring Boot REST 实践

```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    // GET /api/v1/orders —— 获取订单列表（分页）
    @GetMapping
    public PagedResponse<OrderSummary> listOrders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {

        Page<Order> orders = orderService.findOrders(
            PageRequest.of(page, size), status);
        return PagedResponse.from(orders);
    }

    // GET /api/v1/orders/{id} —— 获取单个订单
    @GetMapping("/{id}")
    public OrderDetail getOrder(@PathVariable Long id) {
        return orderService.getOrderDetail(id);
    }

    // POST /api/v1/orders —— 创建订单
    @PostMapping
    public ResponseEntity<OrderDetail> createOrder(
            @Valid @RequestBody CreateOrderRequest request) {

        OrderDetail order = orderService.create(request);
        URI location = ServletUriComponentsBuilder
            .fromCurrentRequest()
            .path("/{id}")
            .buildAndExpand(order.getId())
            .toUri();

        return ResponseEntity.created(location).body(order);
    }

    // PUT /api/v1/orders/{id} —— 全量更新
    @PutMapping("/{id}")
    public OrderDetail updateOrder(
            @PathVariable Long id,
            @Valid @RequestBody UpdateOrderRequest request) {
        return orderService.update(id, request);
    }

    // PATCH /api/v1/orders/{id}/status —— 部分更新（状态变更）
    @PatchMapping("/{id}/status")
    public OrderDetail updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateStatusRequest request) {
        return orderService.updateStatus(id, request.getStatus());
    }

    // DELETE /api/v1/orders/{id} —— 取消订单
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancelOrder(@PathVariable Long id) {
        orderService.cancel(id);
        return ResponseEntity.noContent().build();
    }
}
```

### 10.1.3 REST API 的成熟度模型（Richardson Maturity Model）

```
Level 0: 单一 URI，单 HTTP 方法（RPC over HTTP）
  POST /api/endpoint  { "action": "getOrder", "id": 123 }

Level 1: 多个 URI，资源化
  GET /orders/123

Level 2: 使用正确的 HTTP 方法
  GET /orders/123    查询
  POST /orders       创建
  DELETE /orders/123  删除

Level 3: HATEOAS (超媒体驱动)
  响应中包含相关操作的链接，客户端可以根据链接"发现"下一步操作

{
  "id": 123,
  "status": "PENDING",
  "_links": {
    "self": { "href": "/orders/123" },
    "cancel": { "href": "/orders/123/cancel", "method": "POST" },
    "payment": { "href": "/orders/123/pay", "method": "POST" }
  }
}
```

---

## 10.2 SOAP协议

```java
// SOAP (Simple Object Access Protocol) 是 SOA 的通信基础
// 它用 XML 信封封装请求和响应，通过 HTTP/SMTP/JMS 传输

// WSDL 定义服务契约（一个典型的 WSDL 片段）：
// <wsdl:portType name="EmployeeService">
//   <wsdl:operation name="getEmployee">
//     <wsdl:input message="tns:getEmployeeRequest"/>
//     <wsdl:output message="tns:getEmployeeResponse"/>
//   </wsdl:operation>
// </wsdl:portType>

// Java 中使用 JAX-WS 暴露 SOAP 服务：
@WebService
public class EmployeeServiceImpl {

    @WebMethod
    @WebResult(name = "employee")
    public Employee getEmployee(@WebParam(name = "id") String employeeId) {
        return employeeService.findById(employeeId);
    }
}

// SOAP vs REST 对比
// SOAP: 协议（严格、标准化、工具生成代码）→ 适合企业间 B2B 集成
// REST: 风格（简单、灵活、人可读）→ 适合 Web/Mobile API
```

---

## 10.3 GraphQL

### 10.3.1 核心理念

GraphQL 由 Facebook 于 2015 年开源。它的核心思想是：**让客户端决定它需要什么数据，而非服务器决定返回什么数据。**

```
REST 的问题：
  GET /users/123 → 返回 30 个字段（但你只需要 name 和 avatar）
  GET /users/123/orders → 再发一个请求（N+1 问题）
  两个请求、返回了 80% 不需要的数据

GraphQL 的答案：
  一个请求，客户端精确描述需要的数据结构：
  query {
    user(id: 123) {
      name
      avatar
      orders(status: PENDING) {
        id
        amount
      }
    }
  }
  返回：只包含你需要字段的 JSON
```

### 10.3.2 Java GraphQL 实现

```java
// Spring Boot + Netflix DGS (Domain Graph Service) 框架

@DgsComponent
public class OrderDataFetcher {

    private final OrderService orderService;

    @DgsQuery
    public Order order(@InputArgument Long id) {
        return orderService.findById(id);
    }

    @DgsQuery
    public List<Order> orders(@InputArgument Long userId,
                               @InputArgument OrderStatus status) {
        return orderService.findByUserAndStatus(userId, status);
    }

    // Resolver: Order 中的 totalPrice 字段由 PricingService 计算
    @DgsData(parentType = "Order", field = "totalPrice")
    public BigDecimal getTotalPrice(DgsDataFetchingEnvironment dfe) {
        Order order = dfe.getSource();
        return pricingService.calculateTotal(order);
    }
}

// GraphQL Schema (schema.graphqls)：
// type Order {
//   id: ID!
//   status: OrderStatus!
//   items: [OrderItem!]!
//   totalPrice: BigDecimal!
// }
```

### 10.3.3 GraphQL 的风险

| 风险 | 说明 |
|------|------|
| **N+1 查询放大** | 一个 GraphQL 查询可能触发数百条 SQL（DataLoader 是解决方案） |
| **复杂查询攻击** | 客户端可以构造深层嵌套的查询消耗服务器资源 |
| **缓存困难** | 每个查询都可能不同——HTTP 缓存几乎不可用 |
| **版本策略模糊** | @deprecated 是唯一的演进机制 |

---

## 10.4 gRPC

### 10.4.1 核心理念

gRPC 由 Google 开发，基于 HTTP/2 和 Protocol Buffers。它的核心定位是**高性能的服务间通信**——不是给浏览器用的，是给微服务间用的。

```
gRPC 的价值主张：
  - HTTP/2 多路复用：一个 TCP 连接承载多个并发请求
  - Protocol Buffers：二进制序列化，比 JSON 快 5-10x，数据体积小 3-10x
  - 强类型契约：.proto 文件定义接口，自动生成客户端/服务器代码
  - 双向流：支持客户端流、服务器流、双向流（REST 做不到）
```

### 10.4.2 Java gRPC 实现

```java
// Proto 定义 (order.proto)
// service OrderService {
//   rpc CreateOrder(CreateOrderRequest) returns (OrderResponse);
//   rpc GetOrder(GetOrderRequest) returns (OrderResponse);
//   rpc StreamOrders(OrderStreamRequest) returns (stream OrderResponse);
// }

// 服务端实现
@GrpcService
public class OrderGrpcService extends OrderServiceGrpc.OrderServiceImplBase {

    private final OrderApplicationService orderApplicationService;

    @Override
    public void createOrder(CreateOrderRequest request,
                            StreamObserver<OrderResponse> responseObserver) {
        try {
            OrderResult result = orderApplicationService.createOrder(
                toCommand(request));
            responseObserver.onNext(toResponse(result));
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(Status.INVALID_ARGUMENT
                .withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // 服务器流——持续推送订单状态变更
    @Override
    public void streamOrders(OrderStreamRequest request,
                             StreamObserver<OrderResponse> responseObserver) {
        orderService.watchOrders(request.getUserId(), order -> {
            responseObserver.onNext(toResponse(order));
        });
        // 连接保持打开——服务器可以持续推送
    }
}

// 客户端调用
@Service
public class OrderGrpcClient {

    private final OrderServiceGrpc.OrderServiceBlockingStub blockingStub;

    public OrderResponse createOrder(CreateOrderRequest request) {
        // 看起来和本地方法调用一样——实际是 HTTP/2 二进制通信
        return blockingStub.createOrder(request);
    }
}
```

### 10.4.3 gRPC vs REST 选择指南

| 条件 | 倾向 |
|------|------|
| 浏览器直接访问 | REST（浏览器原生支持，gRPC 需要 grpc-web） |
| 微服务间高性能通信 | gRPC |
| 多语言环境（Java + Go + Python） | gRPC（.proto 生成所有语言代码） |
| 需要双向流 | gRPC（REST 的 WebSocket 也可以但不够标准化） |
| 移动端 | REST/GraphQL（移动网络对二进制协议不够友好） |
| 团队刚接触 | REST（学习曲线最低） |

---

## 10.5 潜在风险与问题

### 10.5.1 四种模式的常见坑

```java
// REST 的坑：
// 1. "RESTful"变成"HTTP CRUD"——业务操作（如"审批"）用 POST /approve 就很别扭
// 2. 过少/过多的端点——一个 URI 处理所有操作 vs 每个操作一个 URI

// GraphQL 的坑：
// 1. 把 GraphQL 当成 BFF 的直接暴露——让外部调用方定义任意复杂查询 → DDoS 风险
// 2. "解决了 over-fetching，引入了 over-executing"——一个简单查询触发 50 个 resolver

// gRPC 的坑：
// 1. 负载均衡复杂——HTTP/2 长连接导致传统的 L4 LB 失效，需要 L7 gRPC-aware LB
// 2. 浏览器不原生支持——需要 grpc-web 代理

// SOAP 的坑（历史教训）：
// 1. 不要低估 WSDL 的复杂度
// 2. 不要相信 "WS-*" 系列标准能解决所有分布式问题
```

### 10.6 优化策略

```java
// 策略1：为不同的通信场景选择不同的协议
// 这不是"选一个"，而是"在不同边界用不同的"

// 外部 API（第三方集成）→ REST（广泛兼容，标准化程度高）
// 内部微服务间（低延迟要求）→ gRPC（高性能、类型安全）
// Web/移动前端 → GraphQL（灵活的数据获取）+ REST（文件上传等 GraphQL 不擅长的）
// 事件通信 → 消息队列（Kafka/RabbitMQ）

// 策略2：API 网关统一协议转换
// 内部用 gRPC 高性能通信
// API 网关对外暴露 REST/GraphQL
// gRPC → REST 转换在网关上自动完成（grpc-gateway）
```

---

## 10.7 本章小结

四种 Web 服务模式不是竞争关系——它们在不同的场景下各自最优：

- **REST**：互联网 API 的通用语言。浏览器友好，工具丰富，学习成本低。
- **SOAP**：企业 B2B 集成的遗留标准。理解它更多是为了维护已有系统。
- **GraphQL**：复杂的、多形态客户端（Web + Mobile）的前端驱动 API。解决 over-fetching 和 under-fetching。
- **gRPC**：微服务间高性能通信的首选。强类型契约、HTTP/2 多路复用、二进制序列化。

选择时的核心问题只有两个：(1) 谁在调用？（浏览器选 REST/GraphQL，内部服务选 gRPC）(2) 性能敏感度多高？（不敏感选 REST，敏感选 gRPC）。
