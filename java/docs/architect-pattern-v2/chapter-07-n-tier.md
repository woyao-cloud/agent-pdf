# 第7章 多层架构（N-Tier Architecture）

多层架构（N-Tier）是三层架构的泛化——当三层不足以表达系统的复杂度时，你在水平或垂直方向增加更多的层。N-Tier 不是一个固定的"几层"方案，而是一种"按需分层"的设计哲学。

---

## 7.1 解决的问题与应用场景

### 7.1.1 核心问题

三层架构在以下场景开始出现摩擦：

- 多种客户端需要不同的展示格式（HTML、JSON、XML for 第三方）
- 一个核心业务逻辑需要服务多个应用
- 不同类型的数据存储需要不同的访问策略（关系数据库 + 搜索引擎 + 文件存储）
- 与外部系统的集成需要独立的适配层

多层架构的答案是：**不要把不同的关注点硬塞进三个桶里——为每个独立的关注点创建独立的层。**

### 7.1.2 适用场景

| 场景 | 需要的额外层 |
|------|-------------|
| **多客户端接入** | 表现层之上再加 API 网关 / BFF 层 |
| **多外部系统集成** | 数据层之下再加集成/适配层 |
| **核心业务复用** | 业务层拆成应用层 + 领域层 + 基础设施层 |
| **微服务架构的基础** | 每个微服务内部采用多层架构 |

---

## 7.2 实现原理与结构

### 7.2.1 经典五层模型

```
┌───────────────────────────────────────────┐
│            接入层 (Gateway/BFF)              │
│    API 网关、负载均衡、认证、协议转换          │
│    为每种客户端提供专属的 Backend for Frontend│
└──────────────────┬────────────────────────┘
                   │
┌──────────────────▼────────────────────────┐
│            表现层 (Presentation)             │
│    Controller、DTO 转换、输入验证             │
└──────────────────┬────────────────────────┘
                   │
┌──────────────────▼────────────────────────┐
│            应用层 (Application)              │
│    流程编排、事务管理、权限检查                │
│    不包含业务规则——只有"步骤"                 │
└──────────────────┬────────────────────────┘
                   │
┌──────────────────▼────────────────────────┐
│            领域层 (Domain)                   │
│    实体、值对象、领域服务、业务规则            │
│    这是系统的心脏——不依赖任何框架               │
└──────────────────┬────────────────────────┘
                   │
┌──────────────────▼────────────────────────┐
│            基础设施层 (Infrastructure)       │
│    Repository 实现、消息队列、外部 API 客户端  │
│    缓存、监控、日志                           │
└───────────────────────────────────────────┘
```

### 7.2.2 Java 实现示例

```java
// ============ 接入层：BFF (Backend for Frontend) ============

@RestController
@RequestMapping("/bff/mobile/orders")
public class MobileOrderBffController {
    // 为移动端定制的 API——聚合多个后端服务的响应

    private final OrderService orderService;
    private final UserService userService;
    private final PointsService pointsService;

    @GetMapping("/{orderId}")
    public MobileOrderDetail getOrderDetail(@PathVariable Long orderId) {
        // 移动端的订单详情 = 订单 + 用户昵称 + 当前积分
        // BFF 层做数据聚合——客户端只需要一次请求
        CompletableFuture<Order> orderFuture =
            CompletableFuture.supplyAsync(() -> orderService.getById(orderId));

        CompletableFuture<UserProfile> userFuture =
            orderFuture.thenCompose(order ->
                CompletableFuture.supplyAsync(() ->
                    userService.getProfile(order.getUserId())));

        CompletableFuture<Integer> pointsFuture =
            orderFuture.thenCompose(order ->
                CompletableFuture.supplyAsync(() ->
                    pointsService.getBalance(order.getUserId())));

        // 等待所有数据就绪后组装
        return CompletableFuture.allOf(orderFuture, userFuture, pointsFuture)
            .thenApply(v -> new MobileOrderDetail(
                orderFuture.join(), userFuture.join(), pointsFuture.join()))
            .join();
    }
}

// Web 端的 BFF——和移动端的 BFF 不同，聚合的数据也不同
@RestController
@RequestMapping("/bff/web/orders")
public class WebOrderBffController {
    @GetMapping("/{orderId}")
    public WebOrderDetail getOrderDetail(@PathVariable Long orderId) {
        // Web 端需要：订单 + 完整用户信息 + 物流跟踪
        // 和移动端的需求不同 → 不同的 BFF
    }
}

// ============ 应用层 ============

@Service
@Transactional
public class OrderApplicationService {
    private final OrderDomainService orderDomainService;
    private final InventoryFacade inventoryFacade;
    private final PaymentFacade paymentFacade;

    public OrderResult createOrder(CreateOrderCommand command) {
        // 应用层的唯一职责：步骤编排
        // 步骤1：预留库存
        InventoryResult inventory = inventoryFacade.reserve(command.getItems());
        if (!inventory.successful()) {
            return OrderResult.fail("INSUFFICIENT_INVENTORY");
        }

        // 步骤2：处理支付
        PaymentResult payment = paymentFacade.charge(command.getAmount());
        if (!payment.successful()) {
            inventoryFacade.release(inventory.reservationId());  // 回滚
            return OrderResult.fail("PAYMENT_FAILED");
        }

        // 步骤3：创建订单
        Order order = orderDomainService.create(command, inventory, payment);
        return OrderResult.success(order);
    }
}

// ============ 领域层 ============

// 领域层不依赖 Spring、JPA、HTTP——纯 Java
public class OrderDomainService {

    public Order create(CreateOrderCommand command,
                        InventoryResult inventory,
                        PaymentResult payment) {

        // 纯业务规则——不涉及技术框架
        if (command.getAmount().compareTo(new BigDecimal("50000")) > 0) {
            throw new BusinessException("单笔订单不能超过 50000 元");
        }

        Order order = new Order(command.getUserId());
        order.addPaymentRecord(payment.getTransactionId(), payment.getAmount());
        order.reserveInventory(inventory.getReservationId());

        return order;
    }
}

// 领域实体——行为丰富
public class Order {
    private Long id;
    private OrderStatus status;
    private List<OrderItem> items;
    private PaymentRecord paymentRecord;
    private String inventoryReservationId;

    // 行为方法而非 getter/setter 堆
    public void markAsPaid(String transactionId) {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("只有待支付订单可以标记为已支付");
        }
        this.status = OrderStatus.PAID;
        this.paymentRecord = new PaymentRecord(transactionId);
    }

    public boolean isCancellable() {
        return this.status == OrderStatus.PENDING
            || this.status == OrderStatus.CONFIRMED;
    }
}

// ============ 基础设施层 ============

@Repository
public class JpaOrderRepository implements OrderRepository {
    // 实现领域层定义的接口
    // 领域层不依赖 JPA——基础设施层把 JPA Entity 转换为领域对象
    public Order findById(Long id) {
        OrderEntity entity = springDataRepo.findById(id)
            .orElseThrow(() -> new OrderNotFoundException(id));
        return toDomain(entity);  // Entity → 领域对象
    }

    public void save(Order order) {
        OrderEntity entity = toEntity(order);  // 领域对象 → Entity
        springDataRepo.save(entity);
    }
}

// 外部 API 客户端——也在基础设施层
@Service
public class AlipayClient implements PaymentGateway {
    @Override
    public PaymentResult charge(PaymentRequest request) {
        // 调用支付宝 OpenAPI
        // 领域层完全不知道这个类的存在
    }
}
```

---

## 7.3 潜在风险与问题

### 7.3.1 过度分层

```java
// N-Tier 最大的风险：为每一层都建一个接口/DTO/转换器

// 反面教材：过度分层
public class OverLayeredSystem {
    // 一个简单的"获取用户邮箱"操作跨越了 5 层：

    // Layer 1: BFF → MobileUserDTO
    // Layer 2: Controller → UserResponse
    // Layer 3: ApplicationService → UserProfileDTO
    // Layer 4: DomainService → User domain object
    // Layer 5: Infrastructure → UserEntity

    // 每一层都有 Getter/Setter + Converter
    // 5 个类 + 5 个转换方法 + 5 组测试
    // 为了一个 "String email" 字段！这是疯了
}

// 务实原则：
// 简单的 CRUD 操作可以跨两层（Controller 直接调 Repository）
// 只要操作不包含业务规则——不需要"强制性"穿过所有层
```

### 7.3.2 层间穿透

```java
// 多层架构的经典反模式：上层跳过中层直接访问下层

@RestController
public class OrderController {
    // 这是违反分层规则的：
    // Controller（Layer 2）直接调用了 Repository（Layer 5）
    // 跳过了 Application 层和 Domain 层
    private final OrderRepository orderRepository;

    @GetMapping("/orders/{id}")
    public OrderDTO getOrder(@PathVariable Long id) {
        OrderEntity entity = orderRepository.findById(id);
        // ← 没有业务逻辑时这样看似"简洁"
        // ← 但开了这个口子后，开发者会越来越多地"抄近道"
        // ← 一个月后有 30% 的 Controller 直接调 Repository
        // ← 分层架构名存实亡
        return OrderDTO.from(entity);
    }
}

// 规则：严格的分层（Strict Layering）vs 宽松的分层（Relaxed Layering）
// 严格：Layer N 只能调 Layer N+1
// 宽松：Layer N 可以调 Layer N+1 及以下所有层（但不往上调）
// 选择：新团队/项目用严格分层；成熟团队可以用宽松分层但必须遵守"不能往上调"
```

### 7.3.3 层间序列化开销

```java
// 多层之间的对象转换有实际成本
// 在 TPS > 5000 的系统中，这些转换时间不可忽略

// 测量层间转换的代价
@Benchmark  // JMH (Java Microbenchmark Harness)
public void benchmarkLayerConversion() {
    // 一个包含 30 个字段的订单对象
    // 经历 4 层转换：DTO → Command → Domain → Entity → Response
    // 每次涉及 30 个 get/set 操作
    // 4 * 30 = 120 次 get/set
    // 在高并发下，这消耗的 CPU 时间可能比"真正的业务逻辑"还多

    // 优化：对于只读查询，可以用投影(Projection)直接返回需要的字段
    // 不必完整加载 Entity → Domain → DTO
}

// Spring Data JPA 的投影（减少不必要的转换）
public interface OrderSummaryProjection {
    Long getId();
    BigDecimal getAmount();
    String getStatus();
    // 只有这 3 个字段——不需要加载完整的 Order Entity
}

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<OrderSummaryProjection> findByUserId(Long userId);
    // 这条 SQL 只 SELECT id, amount, status
    // 不加载 items, payment 等不需要的关联数据
}
```

---

## 7.4 优化策略

### 7.4.1 根据变化频率决定分层粒度

```java
// 规则：变化频率不同的代码 → 应该在不同的层
// 变化频率相同的代码 → 在同一层，避免无用分层

public class LayeringByChangeFrequency {
    // 示例：订单系统

    // 变化频繁（每周都可能变）：折扣策略、校验规则 → Domain 层
    // 变化适中（每月可能变）：业务流程、审批流 → Application 层
    // 变化极少（每年可能变）：数据库 schema、第三方 API 封装 → Infrastructure 层
    // 几乎不变：HTTP 协议、通用工具 → 框架本身
}
```

### 7.4.2 模块化 N-Tier：横向分模块 + 纵向分层

```java
// 好的 N-Tier = 横向（功能域） × 纵向（技术层）

// 项目结构示例：
com.example.ecommerce/
├── order/                         // 横向：订单功能域
│   ├── bff/
│   │   └── OrderBffController.java
│   ├── presentation/
│   │   └── OrderController.java
│   ├── application/
│   │   └── OrderApplicationService.java
│   ├── domain/
│   │   ├── Order.java
│   │   ├── OrderDomainService.java
│   │   └── OrderRepository.java    // 接口——定义在领域层
│   └── infrastructure/
│       ├── JpaOrderRepository.java // 实现——在基础设施层
│       └── OrderEventHandler.java
│
├── payment/                       // 横向：支付功能域
│   ├── presentation/
│   ├── application/
│   ├── domain/
│   └── infrastructure/
│
└── shared/                        // 纵向：共享组件（尽量小）
    ├── event/
    └── util/

// 优势：
// 1. 横向：功能域独立——将来可以提取为独立的微服务
// 2. 纵向：技术分层清晰——修改某一层不影响其他层
// 3. 功能域内部的分层可以根据需要调整——订单模块5层，支付模块只需3层
```

### 7.4.3 分层架构的替代方案：六边形架构（Hexagonal Architecture）

```java
// 当 N-Tier 的层数太多、依赖方向变得复杂时
// 六边形架构提供了一个更灵活的替代方案

// 核心理念转变：
// N-Tier: "从上到下的层"
// 六边形: "从内到外的圈"——领域在最核心
//          所有的外部依赖（HTTP、DB、MQ）都是"适配器"（Adapter）
//          领域通过"端口"（Port = 接口）与适配器通信

// 端口（领域层定义的接口）：
public interface OrderRepository {           // 出站端口
    Order save(Order order);
    Optional<Order> findById(Long id);
}

public interface PaymentGateway {           // 出站端口
    PaymentResult charge(BigDecimal amount);
}

public interface OrderEventPublisher {       // 出站端口
    void publish(OrderCreatedEvent event);
}

// 适配器（基础设施层）：
@Repository
public class PostgresOrderRepository implements OrderRepository { }
@Service
public class AlipayPaymentGateway implements PaymentGateway { }
@Service
public class KafkaOrderEventPublisher implements OrderEventPublisher { }

// 与 N-Tier 的关系：
// 六边形是 N-Tier 的进化——它在"依赖方向"上更清晰
// 但在大多数项目中，N-Tier 足够表达结构，六边形在"复杂的多外部系统集成"中更有价值
```

---

## 7.5 本章小结

多层架构（N-Tier）不是"比三层更好"——它是"三层的泛化"。当你的系统需要 5 层时，你建 5 层。当你的系统只需要 2 层时，不要为了"完整"而塞 5 层。

N-Tier 的三个关键原则：
1. **按关注点分层，不是按数量分层**——每个增加的层必须对应一个独立的"变化原因"
2. **依赖方向单向**——永远往下（或往内）。反向依赖=架构腐化
3. **模块化 N-Tier**——横向（功能域）和纵向（技术层）同时分，为未来演进做准备

N-Tier 的最大敌人是"为了分层而分层"。如果你发现自己在为一个简单的 Read 操作写 DTO → Domain → Entity → Response 四层转换——停下来，问自己：这个操作包含业务规则吗？不包含的话，跨层是允许的。分层是手段，不是宗教。

本篇（分层架构篇）至此结束。我们覆盖了单层到多层四种分层模式。下一篇我们将进入客户端-服务器模式，探讨比分层更宏观的系统交互模式。
