# 第1章 软件架构概述

## 1.1 什么是软件架构

### 1.1.1 导言：为什么需要架构

想象你接手了一个运行了三年的订单系统。这个系统的代码仓库有 80 万行代码，没有模块边界，Service 类之间互相调用形成了一个网状依赖。你接到一个新需求"订单金额超过 1000 元需要人工审核"，却发现改一个 `OrderService.java` 导致优惠券模块报错、积分模块异常、甚至连登录都出了问题。

这不是虚构的场景。没有架构约束的系统，最终都会走向这个结局。

```java
// 一个"没有架构"的典型代码——所有逻辑堆在一个类中
@Service
public class OrderService {

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private HttpClient httpClient;
    // ... 还有 20 个依赖注入

    public void createOrder(OrderRequest request) {
        // 参数校验写在这里
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("金额不合法");
        }
        // 库存扣减直接写 SQL
        jdbcTemplate.update("UPDATE inventory SET stock = stock - ? WHERE sku_id = ?",
            request.getQuantity(), request.getSkuId());
        // 直接调用外部支付接口
        String response = httpClient.post("https://payment-gateway/api/pay", buildPayRequest(request));
        // 积分计算也在这里
        int points = request.getAmount().intValue() / 10;
        jdbcTemplate.update("UPDATE user SET points = points + ? WHERE id = ?", points, request.getUserId());
        // 发送短信也在这里
        sendSms(request.getPhone(), "订单已创建");
        // ... 300 行之后还在这个方法里
    }
}
```

这段代码的问题不是"写错了"，而是它把库存、支付、积分、通知四个完全不同领域的逻辑强行塞进了一个方法。当这四个领域的任何一个发生变化，你都必须修改这个类，而每次修改都有可能影响其他三个领域。

**架构的本质**，就是阻止这样的事情发生。它通过定义明确的边界、规则和约束，确保系统的复杂度被管理在可控范围内。

软件架构不是"把系统设计得漂亮"，而是**在复杂度和变化面前保持系统的可持续交付能力**。

### 1.1.2 软件架构的严格定义

#### IEEE 1471 / ISO 42010 标准定义

国际标准化组织对软件架构给出了最权威的定义：

> **软件架构**是一个系统的基本组织，它体现为系统的组件、组件之间的关系、组件与环境的关系，以及指导系统设计和演进的原则。

这个定义虽然严谨，但对工程实践来说过于抽象。让我们把它转化为工程语言：

| 标准术语 | 工程映射 | 含义 |
|----------|----------|------|
| 基本组织 | 系统的模块/服务划分 | 哪些代码放在一起，哪些必须分开 |
| 组件 | 服务、模块、包、类 | 执行具体功能的独立单元 |
| 组件之间的关系 | 依赖、调用、消息传递 | 组件之间如何协作和约束 |
| 组件与环境的关系 | 部署拓扑、基础设施依赖 | 系统运行在哪里、依赖什么外部设施 |
| 设计与演进的原则 | 编码规范、技术选型、ADR | 所有人必须遵守的规则和决策记录 |

#### 架构与设计的严格区分

这是业界长期混淆的概念。它们的本质区别在于**决策的粒度和反向成本**：

| 维度 | 软件架构 | 软件设计 |
|------|----------|----------|
| **决策范围** | 系统级：模块划分、技术栈、通信协议 | 局部级：类结构、接口签名、算法选择 |
| **决策者** | 架构师 / 技术负责人 | 开发工程师 |
| **变更成本** | 极高——往往需要重写多个模块或服务 | 较低——通常局限在少数几个类内部 |
| **失误后果** | 系统性风险：性能瓶颈、不可部署、无法扩展 | 局部缺陷：单个功能异常、代码可读性差 |
| **典型决策示例** | "订单和支付分为两个服务还是放在一起？" | "OrderService 用策略模式还是工厂模式？" |
| **文档形式** | ADR、架构设计文档、技术方案评审 | 接口文档、类图、Javadoc |

一个简单的判断标准：**如果改一个决定需要动 3 个以上的模块/服务，那就是架构决策。**

```java
// 这是一个设计决策：选择什么数据结构
// 影响范围：仅在 OrderService 内部
public class OrderService {
    // 用 HashMap 还是 TreeMap？这是设计问题。
    // TreeMap 提供排序，HashMap 性能更高。
    // 选错了，换掉就行，外部调用者无感知。
    private Map<String, Order> orderCache = new ConcurrentHashMap<>();
}

// 这是一个架构决策：订单和支付是否拆分
// 影响范围：至少涉及 3 个模块 + 部署方式 + 数据库选择
// 选错了，需要重写通信层、重新设计数据库、调整部署拓扑。
// 这是架构决策。
```

```java
// 架构层面：决定"订单"和"支付"是两个独立服务
@Service
public class OrderService {
    // 订单服务通过 HTTP/gRPC 调用支付服务，而非直接访问其数据库
    private final PaymentClient paymentClient;

    // PaymentClient 是一个接口——订单服务不关心支付的实现细节
    public OrderResult processOrder(Order order) {
        // 架构约束：订单服务绝不能直接操作支付数据库
        PaymentResult payment = paymentClient.charge(order.getAmount());
        return completeOrder(order, payment);
    }
}
```

### 1.1.3 架构的构成要素

软件架构由四个核心要素构成。理解这四个要素，是理解一切架构模式的基础。

#### 要素一：结构（Structure）

结构定义了系统的静态组织——有哪些组件，它们如何分组，层级关系是什么。

```
┌─────────────────────────────────────────────────────┐
│                    电商系统                           │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   用户模块    │  │   订单模块    │  │   商品模块   │ │
│  │              │  │              │  │             │ │
│  │ UserController│  │OrderController│  │GoodsController│
│  │ UserService  │  │ OrderService │  │ GoodsService│ │
│  │ UserRepository│  │OrderRepository│ │GoodsRepository│
│  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   支付模块    │  │   通知模块    │  │   配置模块   │ │
│  │              │  │              │  │             │ │
│  │ PayController│  │NotifyController│  │ConfigController│
│  │ PayService  │  │ NotifyService│  │ ConfigService│ │
│  │ PayRepository│  │NotifyRepository│ │ConfigRepository│
│  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

```java
// 结构在代码中的体现：Package by Feature（按功能域组织）
// 每个模块内部有自己的分层

com.example.ecommerce/
├── user/                        // 用户模块：独立的功能域
│   ├── controller/
│   │   └── UserController.java  // 对外暴露的 HTTP 接口
│   ├── service/
│   │   └── UserService.java     // 业务逻辑
│   ├── repository/
│   │   └── UserRepository.java  // 数据持久化
│   ├── model/
│   │   ├── User.java            // 领域实体
│   │   └── UserDTO.java         // 数据传输对象
│   └── config/
│       └── UserModuleConfig.java
│
├── order/                       // 订单模块：完全独立于用户模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── model/
│
└── payment/                     // 支付模块
    ├── controller/
    ├── service/
    ├── repository/
    └── model/
```

**结构设计的核心问题是**：什么应该放在一起，什么必须分开。判断标准是高内聚（同一个功能域的东西放一起）、低耦合（不同功能域之间通过接口通信）。

#### 要素二：行为（Behavior）

行为定义了系统的动态特性——组件在运行时如何交互，数据如何流转，事件如何传播。

```java
// 行为在代码中的体现：组件之间的交互协议

// 订单模块通过接口定义它对支付模块的期望
public interface PaymentService {
    /**
     * 扣款接口——订单模块不需要知道是支付宝还是微信
     * 这是两个模块之间的"行为契约"
     */
    PaymentResult charge(PaymentRequest request);

    PaymentStatus queryStatus(String paymentId);

    void refund(String paymentId, BigDecimal amount);
}

// 支付模块实现这个契约
@Service
public class AlipayPaymentService implements PaymentService {
    @Override
    public PaymentResult charge(PaymentRequest request) {
        // 调用支付宝 API
    }
    // ...
}

// 订单模块使用契约，不关心实现
@Service
public class OrderService {
    private final PaymentService paymentService;  // 依赖抽象

    public OrderResult submitOrder(Order order) {
        // 行为：订单 → 支付 → 结果
        PaymentResult payment = paymentService.charge(
            new PaymentRequest(order.getTotalAmount(), order.getId())
        );
        if (payment.isSuccess()) {
            return confirmOrder(order, payment);
        }
        return failOrder(order, payment.getErrorMessage());
    }
}
```

行为设计回答的问题是：**当事情发生时，什么组件做响应？数据如何从一个组件流到另一个组件？**

常见的行为模式：

| 行为模式 | 描述 | Java 生态示例 |
|----------|------|--------------|
| 同步调用 | A 调用 B，等待 B 返回结果 | REST (Spring MVC)、gRPC |
| 异步消息 | A 发送消息，B 稍后处理 | RabbitMQ、Kafka、Spring Cloud Stream |
| 事件通知 | A 发布事件，多个 B 订阅 | Spring ApplicationEvent、EventBus |
| 回调 | A 注册回调，B 在完成时调用 | CompletableFuture、Spring WebClient |
| 轮询 | A 定时查询 B 的状态 | @Scheduled + REST 调用 |

#### 要素三：约束（Constraints）

约束是架构中"不可以做什么"的定义。如果说结构定义了"是什么"，行为定义了"做什么"，那么约束定义了"不能怎么做"。

```java
// 约束在代码中的体现：ArchUnit 测试强制架构规则

@AnalyzeClasses(packages = "com.example.ecommerce")
public class ArchitectureConstraintTest {

    @ArchTest
    static final ArchRule services_should_not_access_controllers =
        // 约束：Service 层不能依赖 Controller 层
        classes()
            .that().resideInAPackage("..service..")
            .should().onlyAccessClassesThat()
            .resideOutsideOfPackage("..controller..");

    @ArchTest
    static final ArchRule order_should_not_access_user_database =
        // 约束：订单模块不能直接访问用户的数据库表
        classes()
            .that().resideInAPackage("..order..")
            .should().onlyAccessClassesThat()
            .resideOutsideOfPackage("..user.repository..");

    @ArchTest
    static final ArchRule no_cycle_dependencies =
        // 约束：模块之间禁止循环依赖
        slices()
            .matching("com.example.ecommerce.(*)..")
            .should().beFreeOfCycles();
}
```

常见的架构约束类型：

| 约束类型 | 说明 | 强制执行方式 |
|----------|------|--------------|
| 分层约束 | 上层可调下层，下层不可调上层 | ArchUnit、Checkstyle、Maven enforcer |
| 模块边界 | 模块A不能访问模块B的内部实现 | Java Module System (JPMS)、ArchUnit |
| 依赖方向 | 核心域 ← 支撑域 ← 通用域 | 包结构约定 + CI 检查 |
| 技术约束 | 必须使用 JPA 而非 JDBC Template | Code Review + 模板工程 |
| 部署约束 | 生产环境必须至少两个实例 | K8s ReplicaSet、运维审计 |

**约束是架构中最容易被忽视但最重要的要素。** 没有强制力的架构只是一份建议书。好的架构团队会通过自动化测试（如 ArchUnit）和 CI 流水线将约束固化。

#### 要素四：质量属性（Quality Attributes）

质量属性定义了系统必须达到的"非功能性"标准。如果说前三要素回答了"系统长什么样"，质量属性回答了"系统运行得怎么样"。

```java
// 质量属性在代码中的体现：监控、限流、熔断

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    // 性能：通过 Micrometer 记录响应时间
    private final Timer orderCreationTimer;

    public OrderController(MeterRegistry registry) {
        this.orderCreationTimer = Timer.builder("order.create.duration")
            .description("订单创建耗时")
            .publishPercentiles(0.5, 0.95, 0.99)  // P50, P95, P99
            .register(registry);
    }

    @PostMapping
    // 可用性：通过 Resilience4j 实现熔断
    @CircuitBreaker(name = "orderService", fallbackMethod = "createOrderFallback")
    // 可扩展性：通过 RateLimiter 控制并发
    @RateLimiter(name = "orderApiLimiter")
    public ResponseEntity<OrderResult> createOrder(@Valid @RequestBody OrderRequest request) {
        return timer.record(() -> {
            // 安全性：认证和授权
            SecurityContext context = SecurityContextHolder.getContext();
            if (!context.hasRole("USER")) {
                throw new AccessDeniedException("需要用户权限");
            }
            OrderResult result = orderService.createOrder(request);
            // 可观测性：结构化日志
            log.info("order_created userId={} amount={} orderId={}",
                context.getUserId(), request.getAmount(), result.getOrderId());
            return ResponseEntity.ok(result);
        });
    }

    // 降级逻辑：当系统压力过大时的后备方案
    public ResponseEntity<OrderResult> createOrderFallback(OrderRequest request, Throwable t) {
        // 可用性降级：接受订单但不立即处理，放入队列异步处理
        orderQueue.add(request);
        return ResponseEntity.accepted()
            .body(new OrderResult("PENDING", "订单已接受，稍后处理"));
    }
}
```

六大核心质量属性：

| 质量属性 | 核心问题 | 关键指标 | Java 生态工具 |
|----------|----------|----------|--------------|
| **性能** | 系统有多快？ | 响应时间(P50/P95/P99)、吞吐量(TPS/QPS) | Micrometer、JFR、JMH |
| **可用性** | 系统能一直用吗？ | 正常运行时间百分比(99.9%/99.99%)、MTTR、MTBF | Resilience4j、Hystrix、Sentinel |
| **可扩展性** | 系统能应对增长吗？ | 线性扩展比、瓶颈资源利用率 | Spring Cloud LoadBalancer、K8s HPA |
| **安全性** | 系统够安全吗？ | 漏洞数量、攻击面、合规性 | Spring Security、OAuth2、Keycloak |
| **可修改性** | 改代码容易吗？ | 修改涉及的文件数、测试通过率、部署频率 | DDD、ArchUnit、模块化 |
| **可测试性** | 能证明它是对的吗？ | 测试覆盖率、F.I.R.S.T 原则符合度 | JUnit5、Mockito、Testcontainers |

### 1.1.4 架构的层次

架构不是单一层面的概念。一个完整的企业 IT 系统，从战略规划到代码落地，跨越四个层次。

```
                        企业级架构
                     ┌───────────────┐
                     │  业务战略      │
                     │  IT 战略       │
                     │  应用组合      │
                     └───────┬───────┘
                             │ 指导
                     ┌───────▼───────┐
                     │ 解决方案架构   │
                     │  跨系统集成    │
                     │  端到端流程    │
                     │  数据流设计   │
                     └───────┬───────┘
                             │ 指导
                     ┌───────▼───────┐
                     │   应用架构     │ ← 本书重点
                     │  模块划分      │
                     │  技术选型      │
                     │  部署方案      │
                     └───────┬───────┘
                             │ 指导
                     ┌───────▼───────┐
                     │   技术架构     │
                     │  基础设施      │
                     │  中间件        │
                     │  网络拓扑      │
                     └───────────────┘
```

| 层次 | 关注点 | 决策者 | 典型产出 | 变更周期 |
|------|--------|--------|----------|----------|
| **企业级架构** | 业务战略与 IT 能力的匹配，应用组合的合理性与健康度 | CTO、企业架构师 | 企业架构蓝图、技术路线图、应用组合目录 | 3-5 年 |
| **解决方案架构** | 多个系统如何协作完成一个端到端业务流程 | 解决方案架构师 | 系统集成方案、接口规范、数据流设计 | 1-2 年 |
| **应用架构** | 单个应用内部的结构、模式、技术选型 | 应用架构师 / 技术负责人 | 架构设计文档、ADR、模块拆分方案 | 6-12 个月 |
| **技术架构** | 基础设施、中间件、CI/CD、网络安全 | 技术架构师 / DevOps | 基础设施即代码、部署拓扑、容量规划 | 持续演进 |

**本书聚焦于应用架构层面**——当你说"我要设计一个订单系统的架构"时，你站在这个层面。但你需要理解上下层的关系：解决方案架构告诉你"订单系统需要和支付系统、物流系统通信"，技术架构告诉你"你们用的是 K8s 集群、MySQL 8.0、Kafka 3.x"。

### 1.1.5 好的架构 vs 坏的架构

架构的好坏不是审美问题，而是能否支撑业务在可接受成本下持续交付的问题。

#### 案例对比

**坏的架构**：一个将所有功能塞进一个 Spring Boot 应用、所有模块直接访问同一张数据库表的电商系统：

```java
// 坏架构的典型症状
@RestController
public class EverythingController {

    @Autowired
    private JdbcTemplate jdbc;

    @PostMapping("/order/create")
    public Map createOrder(@RequestBody Map body) {
        // 症状1：跨层访问——Controller 直接操作数据库
        jdbc.update("INSERT INTO orders ...");
        // 症状2：无边界——同时修改订单、用户、库存表
        jdbc.update("UPDATE user SET balance = balance - ?", body.get("amount"));
        // 症状3：无错误处理——异常直接抛给调用方
        // 症状4：无事务管理——一旦中间失败，数据不一致
        return Map.of("status", "ok");
    }
}
```

这种架构在业务简单时看不出问题，但在以下场景会直接崩溃：
- 业务逻辑增加到 200+ 个接口时，Controller 类变成 2000 行的"上帝类"
- 数据库表被 15 个模块同时直接访问，加一个字段需要协调 5 个团队
- 一个模块的 OOM 异常导致整个应用不可用

**好的架构**：同样的电商系统，按功能域拆分模块，每个模块有自己的数据访问层，模块间通过接口通信：

```java
// 好架构：清晰的模块边界和依赖方向
@RestController
@RequestMapping("/orders")
public class OrderController {
    private final OrderApplicationService orderApplicationService;

    @PostMapping
    public ResponseEntity<OrderResult> createOrder(
            @Valid @RequestBody CreateOrderRequest request) {
        // 表现层只做数据转换和路由
        OrderResult result = orderApplicationService.createOrder(request.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }
}

@Service
public class OrderApplicationService {
    private final OrderDomainService orderDomainService;
    private final InventoryClient inventoryClient;    // 接口，非直接 DB 访问
    private final PaymentClient paymentClient;         // 接口，非直接 DB 访问

    @Transactional
    public OrderResult createOrder(CreateOrderCommand command) {
        // 每一步都通过明确定义的接口
        InventoryResult reserved = inventoryClient.reserve(command.getItems());
        if (!reserved.isSuccess()) {
            throw new InsufficientInventoryException(command.getItems());
        }
        PaymentResult paid = paymentClient.charge(command.getAmount());
        return orderDomainService.confirm(command, reserved, paid);
    }
}
```

#### 判断标准

从三个维度判断架构的好坏：

| 维度 | 好架构的特征 | 坏架构的警告信号 |
|------|-------------|-----------------|
| **可维护性** | 新增一个功能只需要修改一个模块；修改现有功能不影响其他模块 | 改一个小功能需要动 5 个以上的文件；每次修改都胆战心惊 |
| **可测试性** | 每个模块可以独立启动和测试；测试在秒级完成 | 必须启动整个应用才能测试；集成测试需要 30 分钟以上 |
| **可扩展性** | 瓶颈模块可以独立扩容；技术栈可以逐步升级 | 只能整个应用一起扩容；技术栈升级需要重写整个系统 |

#### 架构债（Architecture Debt）

```java
// 架构债实例：这是今天能工作的代码，但架构有问题
public class OrderService {
    public void processOrder(Order order) {
        // 直接调用支付模块的具体类（而非接口）
        AlipayService alipay = new AlipayService();
        alipay.pay(order.getAmount());

        // 直接访问用户表（而非通过 UserService）
        userRepository.findByOrderId(order.getId());
    }
}

// 重构后的版本：消除架构债
public class OrderService {
    private final PaymentGateway paymentGateway;     // 抽象接口
    private final UserFacade userFacade;              // 门面模式

    public void processOrder(Order order) {
        PaymentResult result = paymentGateway.charge(
            new PaymentCommand(order.getAmount(), "CNY"));
        UserProfile user = userFacade.getUserProfile(order.getUserId());
        // 清晰的边界，可插拔的实现
    }
}
```

**架构债和技术债的区别**：技术债是"代码写得烂，但功能对的"，可以通过局部重构偿还。架构债是"代码可能写得不错，但放错了地方"，偿还需要调整系统结构和模块划分。架构债的利息远高于技术债，因为它的影响范围是整个系统而非单个模块。

---

## 1.2 架构与设计的区别

在 1.1.2 中我们从定义层面区分了架构和设计。本节从**决策实践**的角度进一步展开——当你在代码评审中说"这是一个架构问题"时，你到底在说什么？它的判断标准是什么？

### 1.2.1 决策的"不可逆性"尺度

Amazon 创始人 Jeff Bezos 提出过一个经典的决策分类框架：

| 决策类型 | 特征 | 决策方式 | 技术映射 |
|----------|------|----------|----------|
| **Type 1 (单向门)** | 一旦做出很难回退，后果不可逆 | 审慎、多方论证、寻求共识 | **架构决策** |
| **Type 2 (双向门)** | 走错了可以退回来，成本可控 | 快速、授权一线、允许试错 | **设计决策** |

这个框架完美映射到架构与设计的区分：

```
决策的不可逆性光谱

设计决策                              架构决策
←────────────────────────────────────────────→
  低                回滚成本                高
  快                回滚周期                慢
  局部              影响范围              全局

示例：
  变量命名            接口签名            模块拆分
  算法选择            数据结构            通信协议
  设计模式            持久化方案           部署拓扑
  Logger选型          序列化框架           技术栈选型
```

```java
// Type 2 决策（设计层面）：选择 List 还是 Set
// 回滚成本：改一行代码，IDE 自动重构，1 分钟完成
// 影响范围：仅此方法内部
public class OrderService {
    // 从 List 改成 Set 去重，错了改回来就行
    private Set<String> processedOrderIds = new HashSet<>();
}

// Type 1 决策（架构层面）：订单和库存是否分库
// 回滚成本：数据迁移 + 双写 + 切流 + 验证，至少 2 个迭代
// 影响范围：所有涉及订单和库存的模块
// 这就是架构决策——一旦做出，反向成本极高
```

**实践准则**：做任何技术决策前，先问自己——"如果这个决策被证明是错的，我需要花多大的代价来纠正它？"如果代价超过一个迭代的工作量，那就是架构决策，必须走正式的评审流程。

### 1.2.2 架构决策如何向下传导

一个架构决策一旦做出，会像多米诺骨牌一样向下引发一系列连锁决策。理解这种传导关系，是区分架构与设计的关键。

**案例**：架构决策"将订单和支付拆分为两个独立服务"引发的决策链：

```
架构决策层
├── 决策A1: 订单和支付拆分为两个独立服务
│
├→ 架构子决策层
│   ├── A2: 服务间通信协议 (REST vs gRPC vs 消息队列)
│   ├── A3: 数据一致性策略 (Saga vs 2PC vs 最终一致性)
│   └── A4: 服务发现机制 (Nacos vs Consul vs K8s Service)
│
├→ 设计决策层
│   ├── D1: REST 接口的 URL 设计和状态码约定
│   ├── D2: 请求/响应的 DTO 结构设计
│   ├── D3: 超时时间的具体数值 (200ms? 500ms?)
│   ├── D4: 重试策略的参数 (3次? 指数退避?)
│   ├── D5: 序列化框架选型 (Jackson vs Protobuf)
│   └── D6: 熔断阈值的具体配置 (50%? 80%?)
│
└→ 实现层
    ├── I1: RestTemplate vs WebClient vs Feign
    ├── I2: 异常处理的具体代码写法
    └── I3: 单元测试的 Mock 策略
```

```java
// 架构决策 A1 的代码体现：
// 订单服务不再直接访问支付数据库，改为远程调用

@Service
public class OrderService {

    // 架构决策 A2 (通信协议) 的设计实现：
    // 选择了 REST 同步通信
    private final PaymentClient paymentClient;

    // 设计决策 D4 (重试策略) 的代码体现：
    // 3次重试，指数退避
    @Retryable(
        value = {PaymentTimeoutException.class},
        maxAttempts = 3,           // D4: 重试次数
        backoff = @Backoff(
            delay = 200,           // D3: 初始超时
            multiplier = 2.0       // D4: 指数退避因子
        )
    )
    public OrderResult submitOrder(Order order) {
        PaymentRequest request = buildPaymentRequest(order);
        return paymentClient.charge(request);
    }
}
```

**关键洞察**：架构决策定了"框架"，设计决策填了"参数"。架构说"要有通信"，设计说"怎么通信"。两者之间的边界不是黑白分明的，而是一个连续光谱。

### 1.2.3 "架构意义"的判断标准

并非所有技术决策都有"架构意义"。当一个工程师说"我们应该把 User 类从包 A 移到包 B"，这是一个重构建议还是一个架构问题？

三条可操作的判断准则：

**准则一：跨团队影响测试**

> 这个决定会影响其他团队的代码或交付计划吗？如果需要通知或协调其他团队，它就是架构决策。

```
示例：
  重命名 UserService 内部变量 → 不影响任何人 → 设计决策
  修改 UserService 公开 API 签名 → 影响所有调用方 → 架构决策
  改变服务间消息格式 → 影响所有消费者 → 架构决策
```

**准则二：不可局部回滚测试**

> 如果这个决定被证明是错的，能不能在不修改其他模块的情况下回滚？

```
示例：
  更换缓存库 (Ehcache → Caffeine) → 改 pom.xml + 改注入配置 → 可局部回滚 → 设计决策
  将同步调用改为异步消息 → 需同时改动调用方和被调用方 → 不可局部回滚 → 架构决策
```

**准则三：质量属性影响测试**

> 这个决定是否显著影响系统的性能/可用性/安全性/可扩展性？

```
示例：
  接口返回 JSON 还是 XML → 对性能影响 <5% → 设计决策
  引入 Redis 做缓存层 → 性能可能提升 10x，但引入了一致性问题 → 架构决策
```

```java
// 实践工具：ArchUnit 将架构意义的规则固化为自动化检查

@ArchTest
static final ArchRule cross_team_boundary_check =
    // 准则一的代码化：被 @PublicApi 标记的类，其公开方法签名不可随意修改
    classes()
        .that().areAnnotatedWith(PublicApi.class)   // 跨团队影响的接口
        .should().resideInAPackage("..api..")       // 必须放在 api 包中
        .andShould().onlyBeAccessed()
        .byClassesThat().resideOutsideOfPackage("..api.."); // 只允许通过 api 暴露
```

### 1.2.4 常见混淆场景

以下是三个日常工作中最容易把架构问题和设计问题搞混的场景：

**场景一：看起来像设计问题的架构问题**

> "数据库连接池从 HikariCP 换成 Druid，这个你决定就行了。"

判断：这是**架构决策**。连接池的选择直接影响系统的可用性（连接泄漏时 Druid 的检测机制更强）、可观测性（Druid 有 SQL 监控墙）、部署配置（两套参数体系完全不同）。一旦换错了，生产环境连接池满了才发现，回滚已经来不及。

**场景二：看起来像架构问题的设计问题**

> "我们要不要把所有 Controller 的返回值统一封装成 `Result<T>`？这个需要架构评审。"

判断：这是**设计决策**。统一的响应格式只在当前应用内部生效，不影响外部系统，不改变部署方式，不涉及跨团队协调。选错了换回来也就是改 Controller 的返回类型，成本可控。

**场景三：灰色地带**

> "我们应该用 Spring Cloud Gateway 还是自研网关？"

判断：取决于上下文。如果团队有 3 个微服务，技术栈统一是 Spring Cloud，这是一个设计决策（生态内选型，切换成本低）。如果团队有 50 个微服务，日均 10 亿次调用，这就是一个架构决策（涉及全链路性能、团队技能、运维体系，替换成本极高）。

**判断清单**：

| 场景 | 正确分类 | 关键判据 |
|------|----------|----------|
| 连接池选型 | 架构 | 影响可用性和监控体系，不可局部回滚 |
| 响应体格式 | 设计 | 影响范围局限，可局部回滚 |
| 网关选型 | 看上下文 | 小团队是设计，大团队是架构 |
| 日志框架选择 | 设计 | SLF4J 门面下实现可互换，回滚成本低 |
| 消息中间件选型 | 架构 | 影响通信模型和运维体系，跨团队影响 |
| 包结构重组 | 设计 | 纯内部重构，IDE 一键重命名 |

---

## 1.3 架构模式的重要性

### 1.3.1 什么是架构模式

**架构模式**是针对特定上下文中反复出现的架构级问题，经过验证的通用可复用解决方案。

这个定义有三个关键词：

| 关键词 | 含义 | 反例 |
|--------|------|------|
| **特定上下文** | 模式不是银弹，每个模式有其适用场景和边界条件 | 在 3 人团队的小项目上强行推行微服务 |
| **反复出现** | 模式来自实战经验的归纳，不是象牙塔里的推导 | 为一个只出现一次的问题发明"通用模式" |
| **经过验证** | 模式已经被大量项目证明有效，风险可控 | 把博客上看到的一个想法直接用到核心系统 |

架构模式与设计模式的层级区分：

| 维度 | 架构模式 | 设计模式 |
|------|----------|----------|
| **解决层级** | 系统级：模块划分、组件通信、部署拓扑 | 代码级：类关系、对象创建、行为封装 |
| **经典示例** | 分层架构、微服务、事件驱动、CQRS | 单例、工厂、策略、观察者 |
| **粒度** | 影响整个系统或子系统 | 影响少数几个类或包 |
| **标准化程度** | 概念和原则层面，实现因语言和框架而异 | 结构高度标准化，Gang of Four 23 种模式可跨语言直接套用 |
| **决策者** | 架构师、技术负责人 | 全体开发者 |

```java
// 设计模式（策略模式）：封装算法，影响几个类
public interface PricingStrategy {
    BigDecimal calculate(Order order);
}

public class VipPricing implements PricingStrategy { /* VIP价格 */ }
public class NormalPricing implements PricingStrategy { /* 普通价格 */ }

// 架构模式（分层架构）：组织整个应用的结构
// Controller → Service → Repository  每一层都有明确的职责边界
@RestController  // 表现层：只负责 HTTP 请求/响应
public class OrderController { }

@Service  // 业务层：只包含业务逻辑
public class OrderService { }

@Repository  // 数据层：只包含持久化逻辑
public interface OrderRepository extends JpaRepository<Order, Long> { }
```

一个完整的架构模式包含四个要素（借鉴 Christopher Alexander 的模式语言理论）：

```
┌──────────────────────────────────────────────────┐
│  模式名称: 分层架构 (Layered Architecture)         │
├──────────────────────────────────────────────────┤
│  语境 (Context):                                  │
│    系统复杂度中等，功能可按抽象层级分类，          │
│    团队按技术能力分层组织                          │
├──────────────────────────────────────────────────┤
│  问题 (Problem):                                  │
│    如何将系统分解为可独立开发和测试的模块，        │
│    同时保持清晰的依赖方向？                        │
├──────────────────────────────────────────────────┤
│  解 (Solution):                                   │
│    将系统分为表现层、业务层、数据层，              │
│    上层依赖下层，下层不依赖上层                    │
├──────────────────────────────────────────────────┤
│  后果 (Consequences):                             │
│    优点: 职责清晰、每层可独立测试、支持替换实现    │
│    代价: 层间转换有性能开销、可能过度抽象、        │
│          跨层需求的修改成本高                       │
└──────────────────────────────────────────────────┘
```

### 1.3.2 为什么需要架构模式：四个核心价值

**价值一：经验复用——站在巨人的肩膀上**

软件行业 70 年的历史积累了大量的血泪教训。架构模式将这些教训提炼为可复用的知识单元。

```java
// 没有模式指导：自己发明"分布式事务"方案
// 你大概率会重演 XA 两阶段提交的坑——性能差、单点故障、锁超时
@Service
public class OrderService {
    @Transactional
    public void createOrder(Order order) {
        // 你以为这样可以保证一致性，实际上：
        // 1. 分布式事务协调器成为单点
        // 2. 锁超时导致整个流程回滚
        // 3. 高并发下性能急剧下降
        orderRepository.save(order);
        inventoryService.deduct(order.getItems());  // 远程调用在事务中
    }
}

// 有了模式指导：Saga 模式
// Saga 通过本地事务 + 补偿操作实现最终一致性
// 这是无数项目踩坑后总结出来的方案
@Service
public class OrderSagaOrchestrator {
    public void createOrder(Order order) {
        // Step 1: 创建订单（本地事务）
        orderRepository.save(order);
        // Step 2: 发送事件，由库存服务异步扣减
        eventPublisher.publish(new OrderCreatedEvent(order));
        // 如果库存扣减失败，库存服务发 InventoryDeductionFailedEvent
        // Saga 协调器收到后执行补偿：将订单标记为"已取消"
    }
}
```

**价值二：团队共同语言——降低沟通摩擦**

| 没有共同语言 | 有共同语言 |
|-------------|-----------|
| "我们把系统分成几块，每块只管自己的事，它们之间通过接口通信，不能直接访问对方的数据……" (30 秒还没说完) | "我们用微服务架构，Database per Service，服务间通过 REST 同步通信。" (3 秒) |
| "数据像流水线一样经过一个个处理环节，每个环节只做一件事……" | "管道-过滤器模式，输入 → 解析 → 验证 → 转换 → 输出。" |

这种效率差异在架构评审、技术方案讨论中会被放大——评审通常只有 60 分钟，没有共同语言意味着三分之一的时间花在"解释我在说什么"上。

**价值三：降低认知负载**

人的工作记忆是有限的（经典认知心理学结论是 7±2 个信息块）。架构模式将复杂的系统设计问题"分块"——当你理解了"分层架构"，你就同时理解了所有三层架构项目的顶层结构，不需要每次从零开始推导。

```java
// 认知负载对比：接手一个新项目时

// 没有模式指导：你需要从代码中反向推导架构意图
// "这个 Service 为什么有时直接调 Repository，有时又通过另一个 Service？"
// "这个包叫 'manager'，和 'service' 包有什么区别？"
// ——你需要完全理解所有代码才能明白意图

// 有模式指导：目录结构本身就在表达架构
com.example.order/
├── controller/     // 我知道这是表现层，处理 HTTP
├── service/        // 我知道这是业务层，核心逻辑在这里
├── repository/     // 我知道这是数据层，封装了持久化
├── model/          // 我知道这是领域实体
└── dto/            // 我知道这是对外传输对象
// 你不需要读一行代码，就已经理解了这个模块的结构和约束
```

**价值四：约束决策空间**

设计一个系统时，你的选择几乎是无限的——什么通信协议？什么部署方式？什么数据管理策略？没有模式指导时，你需要在无限空间里搜索最优解，这不仅是时间问题，更可能导致"分析瘫痪"。

架构模式的作用是把**无限选择收敛为有限方案**：

```
没有模式：无限选择空间
[协议] × [部署] × [数据管理] × [拆分策略] × [通信模式] × ...
= ∞ 种组合

有了模式：
"我们在云原生环境下做微服务"
→ 通信: gRPC 或 REST
→ 部署: K8s + Docker
→ 数据: Database per Service
→ 拆分: 按业务能力
→ 治理: 服务网格 (Istio)
= 几个具体问题，每个只有 2-3 个选项
```

### 1.3.3 没有模式的代价

反事实推演：如果你不使用任何已知的架构模式，从头设计一个中等复杂度的系统，会发生什么？

**代价一：设计瘫痪**

```java
// 面对空白画布，最常见的反应是拖延或过度设计
// 典型对话：
//   "我们先想想这个系统到底应该怎么组织……"
//   （三天后）
//   "我想了一个方案，但觉得不够好……"
//   （一周后）
//   "要不我们先写代码，架构边做边调整？"
//   （三个月后）
//   "这个系统已经没法改了。"

// 而有了分层架构模式，你在 30 分钟内就能画出第一版架构图
// 因为它提供了一个经过验证的起点，你只需要填入具体内容
```

**代价二：不可预测的质量**

每个架构师自己发明的方案，质量完全取决于那个人的经验。而经过验证的模式，其优缺点和风险边界已经被清晰地描述过了——你不需要去猜测"这个结构在高并发下会怎样"，模式文档已经告诉了你答案。

**代价三：知识无法传递**

```java
// 自定义架构：知识存在于人脑
// "这个系统为什么这样分模块？"
// "哦，那是老张当时决定的，他已经离职了。"

// 标准架构模式：知识存在于文档和行业共识
// "这个系统为什么用 CQRS？"
// "因为读写负载不对等，CQRS 模式就是为这个场景设计的——你可以读《企业应用架构模式》第 14 章。"
```

### 1.3.4 本书涵盖的模式全景

本书按从简单到复杂、从通用到专用的逻辑，覆盖 11 篇共 35 章：

| 篇 | 核心模式 | 解决的核心问题 | 章节 |
|----|----------|---------------|------|
| **基础篇** | 架构思维、设计原则、质量属性 | 建立架构师的思考框架和评估标准 | 1-3 |
| **分层架构** | 单层/两层/三层/多层 | 如何通过分层管理复杂度和依赖方向 | 4-7 |
| **客户端-服务器** | C/S 模式、胖瘦客户端 | 如何分配客户端和服务器之间的职责 | 8 |
| **SOA** | SOA、ESB、Web 服务 | 如何以服务为单位构建企业级系统 | 9-10 |
| **微服务** | 服务拆分/通信/治理/数据管理 | 如何在分布式环境下实现独立交付 | 11-17 |
| **事件驱动** | EDA、消息队列 | 如何通过事件解耦生产者和消费者 | 18-21 |
| **云原生** | 容器化、Serverless、服务网格 | 如何利用云平台能力构建弹性系统 | 22-27 |
| **空间架构** | 处理单元、虚拟化中间件 | 如何应对高并发和线性扩展需求 | 28 |
| **管道与过滤器** | 管道/过滤器链 | 如何处理流式数据和多步骤转换 | 29 |
| **最佳实践** | 模式选择、问题处理、架构重构 | 如何在实践中做出正确的模式决策 | 30-32 |
| **技能篇** | 架构师技能、文档沟通、治理 | 架构师需要哪些非编码能力 | 33-35 |

阅读建议：基础篇（1-3）是后续所有章节的概念基石，建议完整阅读。后续各篇相对独立，可以根据你当前的业务场景按需跳读。如果你正在做微服务相关的工作，可以直接跳到第 5 篇（11-17 章）；如果你在构建数据处理管线，跳到第 9 篇（第 29 章）。

---

## 1.4 如何选择合适的架构模式

架构模式的选择是架构师工作中最重要也最困难的决策之一。本节提供一个系统化的决策框架。

### 1.4.1 多维决策模型

架构选择不是单变量问题——你不能只看"业务复杂度"就做出决定。它是一个多维度加权决策。

**维度一：业务需求**

| 因素 | 影响 | 偏向 |
|------|------|------|
| 业务复杂度 | 业务逻辑越复杂，越需要清晰的模块边界 | 高复杂度 → 微服务/分层架构 |
| 变化频率 | 需求变化越快，越需要独立部署能力 | 高变化 → 微服务 |
| 上市时间(TTM) | 越快越好，简化架构以加速交付 | 紧迫 → 单体/Serverless |
| 一致性要求 | 强一致性需要同步通信，最终一致性可用异步 | 强一致 → 单体/分层，最终 → 事件驱动 |
| 领域成熟度 | 新领域探索期不宜过度拆分(边界会变) | 探索期 → 单体/模块化单体 |

**维度二：技术因素**

| 因素 | 影响 | 偏向 |
|------|------|------|
| 团队技术能力 | 分布式系统的运维难度远高于单体 | 初级团队 → 单体/三层 |
| 现有技术栈 | 在已有投资上叠加比从零搭建的风险低 | 优先匹配现有栈 |
| 基础设施 | 有没有 K8s？有没有消息队列？有没有服务网格？ | 基础设施决定了可实现的上限 |
| 技术债务 | 遗留系统的架构债会影响可选模式 | 高债务 → 先偿还再演进的策略 |

**维度三：组织因素**

| 因素 | 影响 | 偏向 |
|------|------|------|
| 团队规模 | 康威定律——系统结构会镜像组织结构 | 大团队 → 微服务 |
| 团队分布 | 跨地域团队需要更强的模块独立性 | 分布式团队 → 微服务/服务化 |
| 组织文化 | 自治文化支持微服务，集中控制支持单体 | 自治 → 微服务，控制 → 分层 |
| 交付节奏 | 不同模块需要不同的发布频率吗？ | 各异 → 微服务，同步 → 单体 |

**维度四：运营因素**

| 因素 | 影响 | 偏向 |
|------|------|------|
| 可用性SLA | 99.9% vs 99.99%，架构复杂度天差地别 | 高 SLA → 微服务+冗余 |
| 预算约束 | 微服务的运维成本(K8s、监控、治理)不容忽视 | 紧预算 → 单体/Serverless |
| 合规要求 | 金融/医疗行业有额外的安全和审计要求 | 高合规 → 分层架构(清晰审计边界) |
| 预期寿命 | 3 个月的原型 vs 10 年的核心系统 | 短命 → 简单，长寿 → 可维护性优先 |

```java
// 决策模型的代码化工具：一个简单的决策辅助类
public class ArchitectureDecisionMatrix {

    public List<ArchitectureStyle> evaluate(ProjectProfile profile) {
        Map<ArchitectureStyle, Double> scores = new EnumMap<>(ArchitectureStyle.class);

        for (ArchitectureStyle style : ArchitectureStyle.values()) {
            double score = 0.0;

            // 业务维度加权 (权重 0.35)
            score += 0.35 * (
                fitScore(profile.getDomainComplexity(), style.getComplexityFit()) +
                fitScore(profile.getChangeFrequency(), style.getAgilityFit()) +
                fitScore(profile.getTtmRequirement(), style.getSpeedFit())
            );

            // 技术维度加权 (权重 0.25)
            score += 0.25 * (
                fitScore(profile.getTeamCapability(), style.getCapabilityRequirement()) +
                fitScore(profile.getInfrastructureMaturity(), style.getInfraRequirement())
            );

            // 组织维度加权 (权重 0.25)
            score += 0.25 * (
                teamSizeFit(profile.getTeamSize(), style.getOptimalTeamSize()) +
                distributionFit(profile.getTeamDistribution(), style.getDistributionSupport())
            );

            // 运营维度加权 (权重 0.15)
            score += 0.15 * (
                fitScore(profile.getAvailabilitySLA(), style.getAvailabilitySupport()) +
                fitScore(profile.getBudgetLevel(), style.getCostLevel())
            );

            scores.put(style, score);
        }

        return scores.entrySet().stream()
            .sorted(Map.Entry.<ArchitectureStyle, Double>comparingByValue().reversed())
            .limit(3)
            .map(Map.Entry::getKey)
            .collect(Collectors.toList());
    }
}
```

### 1.4.2 决策流程

架构选型应当遵循一个系统化的流程，而非"我觉得微服务很好"的直觉决策。

**第七步闭环流程：**

```
Step 1: 分析需求     → Step 2: 评估约束     → Step 3: 列出候选模式
                                                    ↓
Step 7: 记录决策(ADR) ← Step 6: 选择模式     ← Step 5: 原型验证
                                                    ↓
                                              Step 4: 可行性分析
```

**Step 1 — 分析需求**

区分功能需求和非功能需求。一个常见错误是只围绕功能需求设计架构，忽略了质量属性才是架构的真正驱动力。列出系统必须满足的 Top 5 质量属性优先级。

**Step 2 — 评估约束**

不可变更的硬约束决定了解的上限。典型硬约束：
- 基础设施：只支持 HTTP 协议，不支持 gRPC 需要的 HTTP/2
- 合规：数据必须存储在境内
- 团队：只有 Java 开发能力
- 时间：6 周必须上线 MVP

**Step 3 — 列出候选模式**

基于 Step 1 和 Step 2 的结果，初步筛选 2-3 个候选模式。排除明显不匹配的。

```java
// 候选模式筛选示例
public Set<ArchitectureStyle> filterCandidates(Requirements req, Constraints constraints) {
    Set<ArchitectureStyle> candidates = EnumSet.allOf(ArchitectureStyle.class);

    // 硬约束排除
    if (constraints.getTeamSize() < 5) {
        candidates.remove(ArchitectureStyle.MICROSERVICES);  // 小团队排除微服务
    }
    if (constraints.getTeamSize() > 50) {
        candidates.remove(ArchitectureStyle.MONOLITHIC);     // 大团队排除单体
    }
    if (!constraints.hasKubernetes()) {
        candidates.remove(ArchitectureStyle.CLOUD_NATIVE);   // 无 K8s 排除云原生
    }
    if (req.getConsistencyLevel() == ConsistencyLevel.STRONG) {
        candidates.remove(ArchitectureStyle.EVENT_DRIVEN);   // 强一致性排除事件驱动
    }

    return candidates;
}
```

**Step 4 — 可行性分析**

对每个候选模式评估：
- 是否满足 Top 5 质量属性？(逐个打勾)
- 团队是否有能力实施？（技能差距在哪？能不能培训？）
- 主要风险是什么？（用风险矩阵标出高概率+高影响的项）

**Step 5 — 原型验证 (Spike)**

不要相信纸面分析。用 1-2 天做一个最小原型来验证最高风险的假设。

```java
// 原型验证的核心：测试那个"如果它行不通，整个方案就作废"的假设
// 例如：如果担心微服务间的网络延迟不可接受，
// 就只搭建两个服务测延迟，不用实现完整业务逻辑

@SpringBootTest
public class ServiceLatencySpike {
    @Test
    public void p99LatencyUnder100ms() {
        // 在目标网络环境下（同机房/K8s集群内）测量实际 RTT
        List<Long> latencies = new ArrayList<>();

        for (int i = 0; i < 10000; i++) {
            long start = System.nanoTime();
            restTemplate.getForObject(
                "http://payment-service/api/health", String.class);
            latencies.add((System.nanoTime() - start) / 1_000_000); // ms
        }

        long p99 = latencies.stream()
            .sorted()
            .skip((long)(latencies.size() * 0.99))
            .findFirst().orElse(0L);

        assertTrue(p99 < 100,
            "P99 延迟应小于 100ms，实际: " + p99 + "ms");
    }
}
```

**Step 6 — 选择模式**

基于可行性分析和原型验证结果做出最终选择。这个选择必须明确包括：
- 选了哪个模式
- 为什么不选其他候选
- 关键风险和缓解方案
- 预计演进路径

**Step 7 — 记录 ADR（架构决策记录）**

```java
/**
 * ADR-001: 选择分层架构作为订单系统基础架构
 *
 * 状态: 已接受
 * 日期: 2026-05-12
 *
 * 上下文:
 *   - 订单系统复杂度中等，业务逻辑稳定
 *   - 团队规模 8 人，按技术能力分层（前端/后端/DBA）
 *   - 部署在内部数据中心，无容器编排平台
 *
 * 决策:
 *   采用三层架构（表现层/业务层/数据层）
 *
 * 备选方案:
 *   1. 单体架构: 被否决——8人团队在一个代码库工作会导致频繁冲突
 *   2. 微服务架构: 被否决——团队缺乏分布式系统经验，基础设施不支持
 *
 * 后果:
 *   - 正面: 职责清晰，每层独立测试，技术栈可逐层升级
 *   - 负面: 层间数据转换有性能开销，跨层需求需协调
 *   - 风险: 业务层容易膨胀，需定期监控并提取独立模块
 *
 * 演进路径:
 *   如果业务复杂度到50+接口，考虑从三层架构中提取独立模块
 *   如果团队扩张到20+人，重新评估微服务架构
 */
public class ADR001_LayeredArchitecture {
    // ADR 可以以代码注释形式存在于架构相关配置类中
    // 也可以单独维护在 docs/adr/ 目录下
}
```

### 1.4.3 场景化速查表

以下是将决策模型应用到 10 个典型场景的结果：

| 场景 | 推荐模式 | 备选方案 | 关键考量 |
|------|----------|----------|----------|
| **创业公司 MVP** | 模块化单体 | Serverless (FaaS) | 最大化开发速度，架构债可在验证模式后偿还 |
| **中小企业内部系统** | 三层架构 | 模块化单体 | 需求相对稳定，按技术能力分层最自然 |
| **大型企业核心系统** | SOA / 微服务 | 分层+模块化 | 多团队协作是最大挑战，独立交付是硬需求 |
| **电商平台(高并发)** | 微服务 + 事件驱动 | 空间架构 | 流量波峰波谷明显(秒杀)，需要弹性扩展 |
| **数据密集型(BI/报表)** | 管道-过滤器 + CQRS | Lambda 架构 | 数据流经过多个处理阶段，读写负载不对称 |
| **IoT 平台(百万设备)** | 事件驱动 + 云原生 | 微服务 + MQTT | 设备消息天然是事件流，需水平扩展 |
| **金融交易系统** | 分层架构 + 事件溯源 | 微服务 + Saga | 审计和一致性是硬需求，不可妥协 |
| **SaaS 多租户平台** | 微服务 + 云原生 | 模块化单体 | 租户隔离是关键，需独立的扩展和可用性保障 |
| **内容管理系统(CMS)** | 单体/三层 | Headless + 微服务 | 如果只有内部用户，单体足够；对外 API 需 Headless |
| **实时协作工具** | 事件驱动 + WebSocket | 微服务 + gRPC Stream | 低延迟实时同步是核心体验，传统请求-响应不够 |

**速查表使用说明**：这不是机械的映射表。每个场景下都有额外的约束条件可能改变推荐方向。用这张表作为起点（Step 3 的候选模式），然后走完完整的决策流程。

### 1.4.4 模式不是终点：演进式架构

```java
// 核心论点
// 选定架构不是"结束"，而是"开始"

// 你在项目第一天选择的架构，是基于你对业务的最小认知做出的
// 随着对领域理解的加深，架构也应该调整
// "选定了就别再改"的心态，是架构腐化的开始
```

**演进式架构（Evolutionary Architecture）** 的核心理念由 Neal Ford、Rebecca Parsons 和 Patrick Kua 提出：

> 演进式架构支持跨多个维度的引导式、增量式变更。

关键概念一：**适应度函数（Fitness Function）**

适应度函数是衡量架构是否满足特定质量属性的可量化标准。它不是"觉得快"——它是"P99 响应时间 < 200ms"、"测试覆盖率 > 80%"、"从提交到部署 < 30 分钟"。

```java
// 适应度函数不是一劳永逸的——它应该在 CI 中持续运行
@Component
public class ArchitectureFitnessFunctions {

    private final MeterRegistry registry;

    /**
     * 适应度函数 1: API 响应时间
     * 阈值: P99 < 200ms
     * 如果超过阈值，CI 发出警告——架构的"性能"维度需要关注
     */
    @Scheduled(fixedRate = 60000)
    public void checkResponseTimeFitness() {
        double p99 = registry.get("http.server.requests")
            .timer().takeSnapshot().percentileValue(0.99);

        if (p99 > 200_000_000) { // 200ms in nanoseconds
            log.warn("FITNESS_WARNING: P99响应时间 {}ms 超过阈值 200ms，" +
                "性能适应度函数不达标", p99 / 1_000_000);
        }
    }

    /**
     * 适应度函数 2: 循环依赖检查
     * 阈值: 0 个循环依赖
     * 如果出现循环依赖，CI 直接失败——不允许合并
     */
    @Test
    public void noCircularDependencies() {
        // 使用 jdeps 或 ArchUnit 自动检测
        JavaClasses classes = new ClassFileImporter()
            .importPackages("com.example");

        ArchRule rule = slices()
            .matching("com.example.(*)..")
            .should().beFreeOfCycles();

        rule.check(classes);  // 不达标 → 测试失败 → CI 拦截
    }
}
```

关键概念二：**增量式演进而非大爆炸重写**

```java
// 反面案例：大爆炸重写
// "这个单体架构不行了，我们要重写成微服务"
// → 6 个月重写，期间原系统还在变化
// → 上线时发现行为不一致，回滚，信心崩溃

// 正面案例：绞杀者模式 (Strangler Fig Pattern)
// 一次迁移一个功能，而非一次迁移整个系统

public class StranglerMigration {
    // 阶段1: 新功能在新架构中开发（第1-3个月）
    // 阶段2: 旧功能逐个迁移到新架构（第4-9个月）
    // 阶段3: 旧架构只剩路由，最终下线（第10-12个月）

    public void migrateOrderFeature() {
        // 路由层根据功能是否已迁移来分流请求
        // 调用方无感知——它们始终访问同一个入口
        if (featureFlags.isMigrated("order-creation")) {
            newOrderService.createOrder(request);    // 新架构
        } else {
            legacyOrderService.createOrder(request); // 旧架构（逐步退役）
        }
    }
}
```

**演进式架构的三个指导原则**：

| 原则 | 说明 | 违反的信号 |
|------|------|-----------|
| **最后责任时刻原则** | 在拥有最多信息的时候做决策，而非一开始就决定一切 | 项目启动时就选定了所有中间件版本 |
| **可逆决策优先** | 偏向选择容易回退的方案，为不可逆决策留更多验证时间 | 用定制协议而非标准协议 |
| **适应度函数驱动** | 用可量化的标准持续验证架构健康度，而非依赖人工评审 | 只在项目启动时做一次架构评审 |

---

## 1.5 本章小结

本章建立了软件架构的基础认知框架。以下是你从本章应该带走的五个核心要点：

1. **软件架构不仅是结构设计，而是管理复杂度的系统工程**。它由四个要素构成：结构（静态组织）、行为（运行时交互）、约束（不可以做的事）、质量属性（运行得怎么样）。忽略任何一个要素都是在架构上留隐患。

2. **架构决策和设计决策的本质区别在于不可逆性**。如果回滚一个决定的成本超过一个迭代，它就是架构决策，必须走正式的评审流程。这个判断标准比"它是关于大方向还是小细节"更可操作。

3. **架构模式是经过验证的认知捷径**。它们提供了四个核心价值：复用行业经验、建立团队共同语言、降低认知负载、约束决策空间。不使用模式意味着你需要从零推导所有架构问题——你的项目等不起。

4. **架构选型是多维度加权决策**。你需要同时考量业务需求（复杂度、变化频率）、技术因素（团队能力、基础设施）、组织因素（规模、分布）和运营因素（SLA、预算）。不存在"最好的架构"，只存在"最适合你当前条件的架构"。

5. **架构不是一次性的前端决策——它是持续演进的生命体**。适应度函数和绞杀者模式是你最重要的两个工具：前者帮你检测架构何时在腐化，后者帮你安全地从一个架构演进到另一个架构。

在下一章中，我们将深入探讨架构设计的八个核心原则——它们是做出正确架构决策的底层思维模型。
