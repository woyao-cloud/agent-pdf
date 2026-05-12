# 第6章 三层架构（Three-Tier Architecture）

三层架构是分层架构模式中最经典、应用最广泛的形态。它在两层架构的基础上，将"业务逻辑"从客户端和数据库之间独立出来，形成独立的中间层——应用服务器。

三层架构是理解所有分层架构的基础。即使你最终选择了微服务或事件驱动，三层架构的思维模型——关注点分离、单向依赖、层间接口——仍然适用。

---

## 6.1 解决的问题与应用场景

### 6.1.1 核心问题

三层架构解决两层架构的核心矛盾：**业务逻辑不应被锁定在客户端或数据库中，而应作为一个独立的、可管理的、可复用的层次存在。**

```
两层架构的问题          三层架构的答案

客户端有业务逻辑         → 业务逻辑统一在中间层（应用服务器）
   ↓                           ↓
升级 = 更新所有客户端       升级 = 只更新应用服务器
重复 = N个客户端各写一遍    重复 = 0，逻辑集中
安全 = 客户端暴露逻辑       安全 = 客户端只知道 API

数据库有业务逻辑           → 存储过程/触发器的逻辑移到应用层
   ↓                           ↓
DB升级 = 重写存储过程      升级 = 改 Java 代码，和DB无关
调试 = 存储过程调试地狱     调试 = IDE 断点直达
```

### 6.1.2 典型应用场景

| 场景 | 描述 |
|------|------|
| **企业 Web 应用** | Spring Boot + REST API + 关系数据库 |
| **内部管理系统** | 中等复杂性，用户 100-5000 |
| **B2B 平台** | 多客户端（Web + 移动 + 第三方API）共享同一业务逻辑 |
| **电商平台（中等规模）** | 日均订单 < 10万，三层足够 |

### 6.1.3 三层架构的"边界判断"

```java
// 三层架构的最佳适用区间：
public class ThreeTierFitness {
    public static boolean isOptimal(ProjectProfile p) {
        return p.getConcurrentUsers() >= 500
            && p.getConcurrentUsers() <= 50000
            && p.getBusinessComplexity() >= 4
            && p.getBusinessComplexity() <= 7
            && p.getTeamSize() >= 5
            && p.getTeamSize() <= 20
            && !p.requiresExtremeScalability()
            && !p.requiresPolyglotPersistence();
    }
    // 并发太少 → 两层架构够用
    // 并发太多 → 需要更高级的架构（微服务、事件驱动）
    // 团队太大 → 三层架构的代码边界不足以防止冲突
}
```

---

## 6.2 实现原理与结构

### 6.2.1 三层模型

```
┌────────────────────────────────────────────────┐
│              表现层 (Presentation Layer)         │
│              - HTTP/Controller                   │
│              - DTO/数据格式转换                   │
│              - 用户输入验证                       │
│              - 认证/授权入口                      │
│    职责：将外部请求翻译为业务层能理解的调用         │
└────────────────────┬───────────────────────────┘
                     │ 依赖
┌────────────────────▼───────────────────────────┐
│              业务层 (Business Layer)             │
│              - Service/UseCase                   │
│              - 业务规则/业务流程                  │
│              - 领域模型/领域服务                  │
│              - 事务边界                           │
│    职责：实现业务逻辑，不依赖任何特定的外部协议     │
└────────────────────┬───────────────────────────┘
                     │ 依赖
┌────────────────────▼───────────────────────────┐
│              数据层 (Data Layer)                 │
│              - Repository/DAO                   │
│              - ORM/数据映射                      │
│              - 数据持久化/查询                    │
│              - 外部存储集成                       │
│    职责：封装数据访问，隐藏具体的存储技术           │
└────────────────────────────────────────────────┘

依赖方向：自上而下，不可逆
表现层 → 业务层 → 数据层
（业务层绝不 import 表现层的代码）
```

### 6.2.2 Spring Boot 三层实现示范

```java
// ============ 表现层 ============

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderApplicationService orderApplicationService;

    public OrderController(OrderApplicationService orderApplicationService) {
        this.orderApplicationService = orderApplicationService;
    }

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @Valid @RequestBody CreateOrderRequest request) {

        // 表现层职责：
        // 1. 将 HTTP 请求转换为业务命令对象
        CreateOrderCommand command = CreateOrderCommand.from(request);

        // 2. 调用业务层
        OrderResult result = orderApplicationService.createOrder(command);

        // 3. 将业务结果转换为 HTTP 响应
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(OrderResponse.from(result));
    }
}

// 表现层的 DTO——与业务模型分离
public class CreateOrderRequest {
    @NotNull @Positive
    private Long userId;

    @NotEmpty
    @Valid
    private List<OrderItemRequest> items;

    @NotBlank
    private String shippingAddress;

    // 这是一个 DTO——它的生命周期在 HTTP 层
    // 它不应该泄漏到业务层
}

// ============ 业务层 ============

@Service
@Transactional
public class OrderApplicationService {

    private final OrderDomainService orderDomainService;
    private final InventoryService inventoryService;
    private final PricingService pricingService;

    public OrderResult createOrder(CreateOrderCommand command) {
        // 业务层职责：
        // 1. 编排业务流程
        // 2. 管理事务边界
        // 3. 不依赖 HTTP 或数据库 API

        // 步骤1: 计算价格
        Price price = pricingService.calculate(command.getItems());

        // 步骤2: 预留库存
        InventoryReservation reservation = inventoryService.reserve(
            command.getItems());

        // 步骤3: 创建订单
        Order order = orderDomainService.create(
            command.getUserId(), command.getItems(), price, reservation);

        return new OrderResult(order.getId(), order.getStatus(), order.getTotalAmount());
    }
    // 注意：这个方法里没有 JDBC、没有 HTTP API 的概念
    // 它是"纯业务逻辑"——如果将来换通信协议或数据库，这段代码不变
}

// ============ 数据层 ============

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.userId = :userId")
    List<Order> findByUserIdWithItems(@Param("userId") Long userId);

    @Modifying
    @Query("UPDATE Order o SET o.status = :status WHERE o.id = :id")
    int updateStatus(@Param("id") Long id, @Param("status") OrderStatus status);
}

// 数据层实现（如果需要自定义逻辑）
@Repository
public class OrderRepositoryImpl implements OrderRepositoryCustom {

    private final JdbcTemplate jdbcTemplate;  // 可以直接用 JDBC（性能优先）

    @Override
    public List<OrderSummary> findSummaryByDateRange(LocalDate from, LocalDate to) {
        // 数据层可以混合使用 JPA 和 JDBC
        // 只要不暴露给业务层——业务层只看到接口
        return jdbcTemplate.query("""
            SELECT date(created_at) as day, count(*) as cnt, sum(amount) as total
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            GROUP BY date(created_at)
            ORDER BY day
            """, new OrderSummaryRowMapper(), from, to);
    }
}
```

### 6.2.3 三层之间的数据传递

```java
// 重要：三层之间使用不同的数据对象

// 表现层 → 业务层：使用 Command/Query 对象
public class CreateOrderCommand {
    private Long userId;
    private List<OrderItemCommand> items;
    private String shippingAddress;
    // 这是一个"意图"对象
}

// 业务层内部：使用领域模型
public class Order {
    private Long id;
    private Long userId;
    private List<OrderItem> items;   // 领域对象——有行为
    private OrderStatus status;
    private BigDecimal totalAmount;

    // 领域逻辑在模型内部
    public void addItem(Product product, int quantity) {
        if (quantity <= 0) throw new IllegalArgumentException("数量必须大于0");
        if (!product.isAvailable()) throw new ProductUnavailableException(product.getId());
        this.items.add(new OrderItem(product, quantity));
        recalculateTotal();
    }

    public void confirm() {
        if (status != OrderStatus.PENDING) {
            throw new IllegalOrderStateTransition("只有待确认的订单才能确认");
        }
        this.status = OrderStatus.CONFIRMED;
    }
}

// 业务层 → 数据层：使用 Entity
@Entity
@Table(name = "orders")
public class OrderEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItemEntity> items;
    // Entity 的结构不一定和领域模型一致——它反映的是数据库结构
}

// 关键原则：每一层使用自己最自然的数据结构
// 不要为了"DRY"把 DTO 一路传到数据库
// 层间转换的"成本"远低于层间耦合的"代价"
```

---

## 6.3 潜在风险与问题

### 6.3.1 中间层膨胀（Fat Service Layer）

```
症状：
- 业务层的 OrderService.java 超过 2000 行
- 同一个 Service 方法被 20 个不同的业务场景使用（通过 if-else 分支参数化）
- 业务层包含了"应该在哪一层"都不清楚的逻辑

原因：
三层架构只有三个桶——不是所有代码都能干净地放进"表现/业务/数据"的分类中
→ 当逻辑不适合某层时，开发者默认往中间层扔 → 业务层成为垃圾场

解决：
在业务层内部进一步分层——DDD 的分层（应用服务/领域服务/领域模型）
```

```java
// 业务层内部的进一步组织（DDD 风格）：

// 应用服务层——编排业务流程
@Service
@Transactional
public class OrderApplicationService {
    // 流程编排，不包含业务规则本身
    public OrderResult createOrder(CreateOrderCommand cmd) {
        // 1. 加载数据
        User user = userRepository.findById(cmd.getUserId());

        // 2. 调用领域服务
        Order order = orderDomainService.create(user, cmd.getItems());

        // 3. 发布事件
        eventPublisher.publish(new OrderCreatedEvent(order));

        return OrderResult.from(order);
    }
}

// 领域服务——封装跨聚合的业务规则
@Service  // 或 @Component，不是 @Transactional（事务由应用层管理）
public class OrderDomainService {
    public Order create(User user, List<OrderItemCommand> items) {
        // 业务规则：VIP 用户享受折扣、最小起订量检查、等等
    }
}

// 领域模型——实体的自身行为
@Entity
public class Order {
    // 行为在模型内部
    public BigDecimal getTotalAmount() { /* 计算总价 */ }
    public boolean exceedsAmountLimit() { /* 是否超过限额 */ }
}
```

### 6.3.2 性能瓶颈

```java
// 三层架构的性能热点通常在"跨层转换"

// 问题：层间数据转换消耗 CPU
// 每个请求：Request → Command → Domain → Entity → Response
// 5 次对象转换，每次涉及 20 字段的 get/set
// 在 1000 TPS 下这些转换的 CPU 成本不可忽略

// 优化1：用 MapStruct 替代手写 get/set
@Mapper(componentModel = "spring")
public interface OrderConverter {
    OrderConverter INSTANCE = Mappers.getMapper(OrderConverter.class);

    OrderResponse toResponse(Order order);  // 编译期生成代码，零手写
    CreateOrderCommand toCommand(CreateOrderRequest request);
}

// 优化2：在不是必需的层减少转换
// 内部方法调用可以传领域对象——只有"跨层的公开 API"才做转换
```

### 6.3.3 部署挑战

```
三层架构部署时的问题：

  Web 层 (2 instances) → 业务层 (3 instances) → 数据层 (1 DB)
  
  - 数据库是单点：无法水平扩展（不像 Web 层和业务层）
  - 层间网络延迟：Web → 业务 → 数据（如果分层部署在不同的机器上），每次"穿透"增加 1-2ms
  - 版本兼容：Web 层 v2.0 能否调用业务层 v1.0？业务层 v2.0 操作的数据模型 v1.0 的数据库能接受吗？

缓解措施：
  1. 同机房部署，减少网络延迟
  2. API 向上兼容——新版本能处理老版本的请求格式
  3. 数据库迁移是独立的——Flyway/Liquibase 管理版本
```

---

## 6.4 优化策略

### 6.4.1 层间接口契约化

```java
// 每一层之间通过接口定义契约
// 这不是过度设计——它是可测试性和可替换性的基础

// 业务层定义"我需要什么"（接口），而非"怎么获取"（实现）
public interface InventoryService {
    InventoryReservation reserve(List<OrderItem> items);
    void release(InventoryReservation reservation);
}

// 数据层可以有多种实现
@Repository
@ConditionalOnProperty(name = "app.repository.impl", havingValue = "jpa")
public class JpaOrderRepository implements OrderRepository { /* JPA 实现 */ }

@Repository
@ConditionalOnProperty(name = "app.repository.impl", havingValue = "jdbc")
public class JdbcOrderRepository implements OrderRepository { /* JDBC 实现（更快）*/ }

// 业务层只依赖接口 OrderRepository
// 切换到不同的数据层实现 = 改一行配置
```

### 6.4.2 横切关注点（Cross-Cutting Concerns）

```java
// 三层架构中，有些功能跨越所有层
// 不应该在每层重复实现

// 横切关注点用 AOP 统一处理
@Aspect
@Component
public class CrossCuttingConcerns {

    // 所有 Service 方法统一日志
    @Around("execution(* com.example..service..*(..))")
    public Object logServiceCall(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            log.info("{}.{} took {}ms",
                joinPoint.getSignature().getDeclaringType().getSimpleName(),
                joinPoint.getSignature().getName(),
                System.currentTimeMillis() - start);
            return result;
        } catch (Exception e) {
            log.error("{}.{} failed: {}",
                joinPoint.getSignature().getDeclaringType().getSimpleName(),
                joinPoint.getSignature().getName(), e.getMessage());
            throw e;
        }
    }

    // 所有 Repository 方法统一度量
    @Around("execution(* com.example..repository..*(..))")
    public Object measureDbCall(ProceedingJoinPoint joinPoint) throws Throwable {
        // Micrometer Timer 记录每次 DB 调用的耗时
    }
}
```

### 6.4.3 从三层到微服务的演进路径

```
三层架构 → 微服务的自然演进路径：

阶段1：三层架构（当前）
  [Web层] → [业务层] → [数据层]

阶段2：从业务层中识别"独立业务能力"
  业务层中：OrderService（订单）、PaymentService（支付）、UserService（用户）
  这些 Service 的调用频率、变化速度、资源需求各不相同

阶段3：提取高变化/高负载的服务
  把 PaymentService 从业务层中独立出来
  [Web层] → [业务层(Order,User)] → [数据层]
     ↘ [支付服务(Payment)] → [支付DB]

阶段4：逐步提取更多服务
  每个阶段只提取一个服务——绞杀者模式
  不是"大爆炸拆分"，是渐进式独立
```

---

## 6.5 本章小结

三层架构是软件行业最成熟、文档最丰富的架构模式。它的核心价值不是复杂性——它是一个简单的"三合一"：**把变化原因不同的代码放进不同的物理层。**

三层架构的三个核心规则：
1. **单向依赖**：表现层 → 业务层 → 数据层。绝不可逆。
2. **层间数据转换**：每层用自己最自然的数据结构。跨层通信时转换，不共享同一个 DTO 穿透三层。
3. **业务层是核心**：它不依赖 HTTP、不依赖 SQL——它是"纯业务逻辑"。其他两层是可替换的壳。

三层架构的最大风险不是技术性的——是"业务层膨胀"。当业务逻辑的复杂度超过三层分类法的表达能力时，你需要的不是更多的层，而是**从"层级思维"切换到"领域思维"**——DDD、模块化、乃至微服务。

在下一章中，我们将探讨多层架构（N-Tier）——当三层不够时，如何在水平方向进一步分层。
