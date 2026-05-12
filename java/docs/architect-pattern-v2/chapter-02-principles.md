# 第2章 架构设计原则

架构设计原则是指导架构决策的底层思维模型。它们不是需要死记硬背的教条，而是在面对"这样做还是那样做"的模糊决策时帮你找到方向的判断工具。

本章涵盖八个核心原则，按从基础到进阶的逻辑展开：前四个原则（SRP、OCP、LSP、ISP）来自 SOLID 经典体系，后四个原则（DIP、LoD、CRP、决策权衡）拓展到架构层面特有的考量。

---

## 2.1 单一职责原则（SRP）

### 2.1.1 原则定义与起源

**经典定义（Robert C. Martin）**：

> A class should have only one reason to change.
> 一个类应该有且仅有一个变化的原因。

**架构层面的延伸定义**：

> 一个模块、包或服务应该有且仅有一个业务域作为其变化的驱动力。当两个不同的业务域因不同的原因而在不同的时间发生变化时，它们应该被分开。

**常见误解纠正**：

| 误解 | 正解 |
|------|------|
| "SRP 就是一个类只做一件事" | SRP 不是关于"做多少事"，而是关于"变化的原因来自哪里"。一个类可以做多件事，只要这些事都因同一个原因而变化。 |
| "SRP 意味着每个类只能有一个方法" | 荒谬。SRP 的粒度是"变化的原因"，不是"功能的数量"。 |
| "违反 SRP 就是代码写得烂" | SRP 是需要成本的投资——有时候在当前条件下合并是合理的（见 2.1.4）。 |

```java
// 这看起来"只做了一件事"（处理订单），但实际上违反了 SRP
// 因为它的变化原因来自三个不同的业务域
@Service
public class OrderService {

    public void createOrder(OrderRequest request) {
        // 变化原因1：订单业务规则变了（比如新增订单类型）
        validateOrderRules(request);

        // 变化原因2：支付策略变了（比如新增分期付款）
        processPayment(request.getPaymentInfo());

        // 变化原因3：积分规则变了（比如比例从10:1改成5:1）
        calculateAndAwardPoints(request.getUserId(), request.getAmount());
    }
}

// 这三个职责分别属于订单域、支付域、积分域
// 任何一个域的策略变化，都要修改 OrderService
// OrderService 有三个"变化的原因"——违反了SRP
```

### 2.1.2 识别职责边界

判定"职责是否单一"是 SRP 实践中最困难的部分。两种可操作的方法：

**方法一：变化原因分析法（Reason-for-Change Analysis）**

```java
// 分析步骤：列出所有可能迫使这个类/模块发生变化的业务事件
// 如果这些事件来自不同的业务角色/领域，则职责不单一

// 以 OrderService 为例进行变化原因分析：
public class SRPAnalysis {

    public void analyzeOrderService() {
        List<ChangeReason> reasons = Arrays.asList(
            new ChangeReason("订单业务规则变更", "业务分析师", "订单域"),
            new ChangeReason("新增支付渠道", "支付团队", "支付域"),          // ← 不同角色
            new ChangeReason("修改积分计算规则", "营销团队", "积分域"),       // ← 不同角色
            new ChangeReason("调整订单状态机", "业务分析师", "订单域"),
            new ChangeReason("支付风控策略调整", "风控团队", "支付域")        // ← 不同角色
        );

        // 分析结论：OrderService 的变化原因来自 3 个不同业务域
        // → 违反 SRP，应按域拆分
        long uniqueDomains = reasons.stream()
            .map(ChangeReason::getDomain)
            .distinct()
            .count();

        if (uniqueDomains > 1) {
            System.out.println("违反 SRP：该类有 " + uniqueDomains + " 个领域的变化原因");
        }
    }
}
```

**方法二：业务术语测试（Business Terminology Test）**

用自然语言描述模块的职责，如果在描述中需要用"和"、"以及"连接不同业务领域的概念，它就违反了 SRP。

```
描述：
  "UserService 负责用户注册、用户登录，和积分计算"
                                      ↑
                                这个"和"就是红线
  → 用户管理和积分计算是两个不同的业务域
  → UserService 应该只保留用户管理
  → 积分计算应提取到 PointsService

描述：
  "UserService 负责用户注册、用户登录、用户信息管理"
  → 所有职责都在"用户管理"这个域内
  → 符合 SRP
```

```java
// 业务术语测试的代码化：

// 违反 SRP 的模块描述
@Module(description = "用户管理模块")
public class UserModule {
    // 突然出现积分相关代码
    public void calculatePoints(Long userId, BigDecimal amount) {
        // 你在"用户管理"模块里看到了"积分"——这就是认知失调
        // 这个模块的描述需要用"和"连接两个概念
    }
}

// 符合 SRP 的模块描述
@Module(description = "积分管理模块")
public class PointsModule {
    public void calculatePoints(Long userId, BigDecimal amount) {
        // 职责和模块描述一致，没有认知失调
    }
}
```

### 2.1.3 SRP 在架构各层的实践

SRP 是多尺度的原则——它适用于服务层面、包层面、类层面、方法层面。

**服务层面：微服务按业务能力拆分**

```java
// SRP 在服务层面：每个微服务只负责一个业务能力（Business Capability）

// 违反 SRP：一个服务混合了订单和物流两个业务能力
@SpringBootApplication
public class OrderAndLogisticsService {
    // 同时处理订单和物流——两个不同的变化原因
}

// 符合 SRP：订单和物流是两个独立的服务
@SpringBootApplication
@BusinessCapability("订单管理")
public class OrderService {
    // 只处理订单——变化原因唯一：订单业务规则变更
}

@SpringBootApplication
@BusinessCapability("物流管理")
public class LogisticsService {
    // 只处理物流——变化原因唯一：物流策略变更
}
```

**包层面：Package by Feature（按功能域组织）**

```java
// 违反 SRP 的包结构：按技术层组织（Package by Layer）
// 每个包混合了所有业务域，一个包有 N 个变化原因
com.example/
├── controller/
│   ├── UserController.java      // 用户域
│   ├── OrderController.java     // 订单域
│   └── PaymentController.java   // 支付域   → 3个域混在一起
├── service/
│   ├── UserService.java
│   ├── OrderService.java
│   └── PaymentService.java
└── repository/
    ├── UserRepository.java
    ├── OrderRepository.java
    └── PaymentRepository.java

// 符合 SRP 的包结构：按功能域组织（Package by Feature）
// 每个包只包含一个业务域，变化原因唯一
com.example/
├── user/                         // 用户域 → 唯一变化原因
│   ├── UserController.java
│   ├── UserService.java
│   └── UserRepository.java
├── order/                        // 订单域 → 唯一变化原因
│   ├── OrderController.java
│   ├── OrderService.java
│   └── OrderRepository.java
└── payment/                      // 支付域 → 唯一变化原因
    ├── PaymentController.java
    ├── PaymentService.java
    └── PaymentRepository.java
```

**类层面：经典的 Controller / Service / Repository 分离**

```java
// 违反 SRP：一个类同时处理 HTTP、业务逻辑、数据持久化
@RestController
public class OrderController {

    @Autowired
    private JdbcTemplate jdbc;

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(@RequestBody OrderRequest request) {
        // 1. HTTP 参数处理（Controller 职责）
        // 2. 业务规则验证（Service 职责）
        // 3. 直接写 SQL（Repository 职责）
        // → 三个变化原因：API 规范变更、业务规则变更、数据库结构变更
        jdbc.update("INSERT INTO orders ...");
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}

// 符合 SRP：三个类各司其职
@RestController  // 变化原因：API 规范变更
public class OrderController {
    private final OrderService orderService;

    @PostMapping("/orders")
    public ResponseEntity<OrderResult> createOrder(@Valid @RequestBody OrderRequest request) {
        return ResponseEntity.ok(orderService.createOrder(request));
    }
}

@Service  // 变化原因：业务规则变更
public class OrderService {
    private final OrderRepository orderRepository;

    @Transactional
    public OrderResult createOrder(OrderRequest request) {
        Order order = Order.create(request);
        return OrderResult.from(orderRepository.save(order));
    }
}

@Repository  // 变化原因：数据库结构或持久化框架变更
public interface OrderRepository extends JpaRepository<Order, Long> {
    // 数据访问逻辑
}
```

**方法层面：每个方法只做抽象层级一致的事**

```java
// 违反 SRP 的方法：混合了高层的业务流程和底层的实现细节
public void processOrder(Order order) {
    // 高层次：业务流程
    validateOrder(order);
    calculateTotal(order);

    // 突然跳到低层次：HTTP 请求细节
    RestTemplate restTemplate = new RestTemplate();
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    HttpEntity<PaymentRequest> entity = new HttpEntity<>(paymentRequest, headers);
    ResponseEntity<PaymentResponse> response = restTemplate.postForEntity(
        "http://payment-service/api/pay", entity, PaymentResponse.class);

    // 又回到高层次
    updateOrderStatus(order, response.getBody());
}

// 符合 SRP：不同抽象层级的方法被分离
public void processOrder(Order order) {
    validateOrder(order);
    calculateTotal(order);
    PaymentResult payment = paymentClient.charge(order);  // 抽象调用，隐藏 HTTP 细节
    updateOrderStatus(order, payment);
}
```

### 2.1.4 SRP 的代价与过度使用

SRP 不是免费的午餐。每一次职责拆分都带来真实的成本：

```java
// 拆分前（单体职责）：
// OrderService 直接处理一切
// 成本：无调用开销，无数据转换，单次部署
public class OrderService {
    public void createOrder(Order order) {
        validateInventory(order.getItems());    // 本地方法调用，几纳秒
        chargePayment(order.getAmount());       // 本地方法调用，几纳秒
    }
}

// 拆分后（SRP 到位）：
// OrderService → InventoryService → PaymentService → PointsService
// 成本：每次跨模块调用 = 网络延迟 + 序列化 + 错误处理 + 部署协调
public class OrderService {
    public void createOrder(Order order) {
        // 远程调用：网络 RTT 0.5ms + JSON 序列化 0.1ms + 熔断/重试逻辑
        InventoryResult inventory = inventoryClient.reserve(order.getItems());
        // 又一个远程调用
        PaymentResult payment = paymentClient.charge(order.getAmount());
        // 又一个远程调用
        pointsClient.award(order.getUserId(), order.getAmount());
        // 总成本：本地方法调用的几千倍，加上故障传播风险
    }
}
```

**过度 SRP 的警告信号**：

| 信号 | 描述 |
|------|------|
| **一个业务流程跨越 5+ 个服务** | 用户"下单"需要调用 6 个微服务，延迟和故障概率显著增加 |
| **频繁一起修改的两个模块** | 如果每次改 A 都必须同时改 B——它们实际上共享同一个变化原因，应该合并 |
| **为了一个字段的传递定义三个 DTO** | 过度分层：ControllerDTO → ServiceDTO → RepositoryDTO → Entity，它们 80% 的字段相同 |
| **团队疲于维护模块间契约** | 花在接口协调上的时间超过了花在业务逻辑上的时间 |

```java
// 何时"违反"SRP 是合理的：实用主义的判断框架

// 场景：一个 5 人团队的早期 MVP
// 结论：暂不将订单、支付、积分拆分为独立服务

// 判断逻辑：
public SRPVerdict evaluateSRPForMVP(ProjectProfile profile) {
    if (profile.isMvpPhase()           // MVP 阶段
        && profile.getTeamSize() <= 5  // 小团队
        && !profile.hasKuberntes()     // 无容器平台
        && profile.getPivotedRisk() == RiskLevel.HIGH) { // 高概率会 pivot

        return SRPVerdict.ACCEPT_VIOLATION(
            "当前阶段合并这些职责是合理的。" +
            "理由1: MVP 验证的是产品方向，不是架构完美度。" +
            "理由2: 拆分服务的运维成本（K8s、CI/CD、监控）对于5人团队过高。" +
            "理由3: 领域边界很可能会变——在方向不确定时过早拆分比稍晚拆分危害更大。" +
            "条件: 在代码层面保持模块边界（Package by Feature），" +
            "这样当需要拆分时，只需要改为远程调用，不需要重写业务逻辑。"
        );
    }
}
```

### 2.1.5 SRP 与其他原则的关系

SRP 不是孤立的原则——它和其他原则存在协同和张力。

| 关系 | 说明 | 代码示例 |
|------|------|----------|
| **SRP → OCP** | SRP 是 OCP 的前提：只有职责单一，才能通过"扩展"而非"修改"来应对变化。一个混合职责的类，任何新需求都不得不修改它。 | 当一个类只有"支付"这个职责时，新增支付方式就是扩展接口而非修改类 |
| **SRP ↔ ISP** | SRP 指导"模块/类的拆分"，ISP 指导"接口的拆分"。它们是同一哲学在不同层面的表达：SRP 说你该拆什么，ISP 说你怎么暴露。 | `OrderService`(按 SRP 拆) 暴露 `OrderCommandService` 和 `OrderQueryService`(按 ISP 拆) |
| **SRP ↔ DIP** | SRP 和 DIP 共同定义了模块边界。SRP 决定"边界划在哪里"，DIP 决定"边界两侧怎么通信"（通过抽象接口）。 | SRP 把支付从订单中拆出，DIP 让订单通过 `PaymentGateway` 接口而非 `AlipayService` 来使用支付 |
| **SRP vs KISS** | 在小型项目中，KISS（保持简单）的优先级高于 SRP。过度拆分小项目的模块是一种"过早架构优化"。 | 3 人团队的单体应用，不必按 SRP 拆分 10 个模块 |

```java
// SRP + OCP + DIP 的协同示例
// SRP: 支付职责独立于订单职责
// OCP: 新增支付方式无需修改现有代码
// DIP: 订单依赖 PaymentGateway 接口，不依赖具体实现

// SRP 的结果：PaymentGateway 只关注"支付"这一个职责
public interface PaymentGateway {
    PaymentResult charge(PaymentRequest request);
}

// OCP 的结果：新增实现即扩展
@Service
public class AlipayGateway implements PaymentGateway {
    public PaymentResult charge(PaymentRequest request) { /* 支付宝 */ }
}

@Service
public class WechatPayGateway implements PaymentGateway {
    public PaymentResult charge(PaymentRequest request) { /* 微信 */ }
}

// DIP 的结果：订单模块依赖抽象
@Service
public class OrderService {
    private final PaymentGateway paymentGateway;  // 依赖接口，非具体类

    public void createOrder(Order order) {
        paymentGateway.charge(new PaymentRequest(order.getAmount()));
    }
}
```

---

## 2.2 开闭原则（OCP）

### 2.2.1 原则定义与架构映射

**经典定义（Bertrand Meyer, 1988）**：

> Software entities should be open for extension, but closed for modification.
> 软件实体应当对扩展开放，对修改关闭。

Bertrand Meyer 最早在《面向对象软件构造》中提出这个原则时，核心思想是：一旦一个模块被测试、发布并投入使用，就不应该再修改它的源代码，而是通过继承和多态来扩展它。

Robert C. Martin 后来将其纳入 SOLID 体系时做了更务实的解读：

**架构层面的延伸定义**：

> 系统的核心抽象（高层的业务规则和流程）应该对修改封闭——一旦稳定就保护起来。系统的可变部分应该通过扩展点接入——新增功能不需要重写已有的核心代码。

**OCP 的本质不是"不修改代码"，而是"选择性地保护核心，同时留出扩展空间"。**

```java
// 违反 OCP：每新增一个支付方式，都要修改 OrderService
@Service
public class OrderService {

    public void processPayment(Order order, String paymentType) {
        // 每增加一种支付方式，这里就要加一个 else-if 分支
        // 这修改了经过测试并投入使用的 OrderService
        if ("ALIPAY".equals(paymentType)) {
            alipayService.pay(order.getAmount());
        } else if ("WECHAT".equals(paymentType)) {
            wechatPayService.pay(order.getAmount());
        } else if ("UNIONPAY".equals(paymentType)) {  // 新增：必须修改此处
            unionPayService.pay(order.getAmount());
        }
        // 每次修改都是风险——你可能破坏之前工作良好的逻辑
    }
}

// 符合 OCP：新增支付方式 = 新增一个类，不碰 OrderService
@Service
public class OrderService {
    private final List<PaymentGateway> paymentGateways;  // 注入所有实现

    public void processPayment(Order order) {
        // OrderService 对修改封闭——支付逻辑被隔离到各自的 Gateway 中
        PaymentGateway gateway = paymentGateways.stream()
            .filter(g -> g.supports(order.getPaymentType()))
            .findFirst()
            .orElseThrow(() -> new UnsupportedPaymentException(order.getPaymentType()));
        gateway.charge(order.getAmount());
    }
}

// 新增支付方式：写一个新类，OrderService 的代码零修改
@Service
public class UnionPayGateway implements PaymentGateway {
    @Override
    public boolean supports(PaymentType type) { return PaymentType.UNIONPAY.equals(type); }

    @Override
    public PaymentResult charge(BigDecimal amount) { /* 银联支付 */ }
}
```

### 2.2.2 架构层面的 OCP 实现机制

OCP 在 Java 生态中有四种主要的实现机制。

**机制一：接口 + 多态（策略模式）**

```java
// 最经典的 OCP 实现方式
// 核心抽象（接口）对修改封闭，具体策略对扩展开放

// 抽象：计算运费——对修改封闭
public interface ShippingCalculator {
    ShippingCost calculate(Order order);
    boolean supports(ShippingMethod method);
}

// 扩展点：新增快递方式 = 新增实现类
@Component
public class StandardShipping implements ShippingCalculator {
    public ShippingCost calculate(Order order) {
        return new ShippingCost(new BigDecimal("10.00"), "标准快递");
    }
    public boolean supports(ShippingMethod method) { return ShippingMethod.STANDARD.equals(method); }
}

@Component
public class ExpressShipping implements ShippingCalculator {
    public ShippingCost calculate(Order order) {
        return new ShippingCost(new BigDecimal("25.00"), "特快专递");
    }
    public boolean supports(ShippingMethod method) { return ShippingMethod.EXPRESS.equals(method); }
}

// 使用方——对修改封闭
@Service
public class CheckoutService {
    private final List<ShippingCalculator> calculators;

    public ShippingCost getShippingCost(Order order) {
        return calculators.stream()
            .filter(calc -> calc.supports(order.getShippingMethod()))
            .findFirst()
            .map(calc -> calc.calculate(order))
            .orElseThrow(() -> new UnsupportedShippingMethodException(order.getShippingMethod()));
    }
}
```

**机制二：插件架构（Java SPI）**

```java
// Java SPI (Service Provider Interface) 是 JDK 内置的 OCP 实现
// 允许在运行时发现和加载实现类，核心代码完全不知道有哪些具体实现

// 定义扩展点（通常在 core 模块中）
public interface DocumentParser {
    String getFormat();
    Document parse(InputStream input);
}

// 扩展点加载器——对修改封闭
public class DocumentParserLoader {
    private static final List<DocumentParser> parsers;

    static {
        // ServiceLoader 是 JDK 内置的 SPI 机制
        parsers = ServiceLoader.load(DocumentParser.class)
            .stream()
            .map(ServiceLoader.Provider::get)
            .collect(Collectors.toList());
    }

    public static Document parse(InputStream input, String format) {
        return parsers.stream()
            .filter(p -> p.getFormat().equalsIgnoreCase(format))
            .findFirst()
            .orElseThrow(() -> new UnsupportedFormatException(format))
            .parse(input);
    }
}

// 新增格式支持：只需在 META-INF/services/com.example.DocumentParser 文件中添加一行
// pdf-parser 模块中的实现（独立 jar，核心代码零修改）
public class PdfParser implements DocumentParser {
    public String getFormat() { return "PDF"; }
    public Document parse(InputStream input) { /* PDF 解析 */ }
}

// markdown-parser 模块中的实现（又一个独立 jar）
public class MarkdownParser implements DocumentParser {
    public String getFormat() { return "MARKDOWN"; }
    public Document parse(InputStream input) { /* Markdown 解析 */ }
}
```

**机制三：事件系统（观察者模式）**

```java
// 通过事件机制实现 OCP
// 核心流程发布事件，扩展点订阅事件

// 核心流程：订单创建——对修改封闭
@Service
public class OrderService {
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public OrderResult createOrder(OrderRequest request) {
        Order order = orderRepository.save(Order.create(request));

        // 发布事件，不关心有哪些订阅者
        eventPublisher.publishEvent(new OrderCreatedEvent(this, order));

        return OrderResult.from(order);
    }
    // 注意：这里完全没有提及积分、通知、审计、数据分析等扩展功能
    // 这些功能通过订阅事件来实现，对核心流程零侵入
}

// 扩展点 1：积分服务——独立模块
@Component
public class PointsOnOrderCreated {
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        pointsService.award(event.getOrder().getUserId(),
            event.getOrder().getAmount());
    }
}

// 扩展点 2：通知服务——独立模块
@Component
public class NotificationOnOrderCreated {
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        notificationService.send(event.getOrder().getUserId(),
            "订单 " + event.getOrder().getId() + " 已创建");
    }
}

// 扩展点 3：数据分析——独立模块
@Component
public class AnalyticsOnOrderCreated {
    @EventListener
    @Async  // 异步处理，不阻塞核心流程
    public void handleOrderCreated(OrderCreatedEvent event) {
        analyticsService.track("order_created",
            Map.of("amount", event.getOrder().getAmount()));
    }
}
```

**机制四：配置驱动**

```java
// 通过配置将变化隔离到外部，核心代码不感知
// 这是 OCP 的"极致版"——连新增类都不需要，只改变配置

// 核心规则引擎——对修改封闭
@Service
public class RiskRuleEngine {
    private final List<RiskRule> rules;

    // 规则从配置中加载，而非硬编码
    public RiskRuleEngine(RuleConfigLoader configLoader) {
        this.rules = configLoader.loadRules();
    }

    public RiskResult evaluate(Transaction transaction) {
        return rules.stream()
            .filter(rule -> rule.matches(transaction))
            .map(rule -> rule.evaluate(transaction))
            .filter(result -> result.getLevel() != RiskLevel.NONE)
            .max(Comparator.comparing(RiskResult::getLevel))
            .orElse(RiskResult.SAFE);
    }
}

// 新增风控规则：只需在配置文件中添加一条规则
// risk-rules.yml
rules:
  - name: "大额交易"
    condition: "amount > 50000"
    action: "MANUAL_REVIEW"
    level: "HIGH"
  - name: "深夜交易"         # 新增规则：零代码变更
    condition: "hour >= 23 || hour <= 5"
    action: "SMS_VERIFY"
    level: "MEDIUM"
  - name: "异地登录"         # 再新增：仍零代码变更
    condition: "ip_province != usual_province"
    action: "FORCE_LOGOUT"
    level: "HIGH"
```

### 2.2.3 预判变化 vs 过度设计

OCP 实践中最难的问题是：**你怎么知道什么东西将来会变？**

如果为所有东西都预留扩展点，你会得到一个过度抽象的、没人能理解的、性能低下的系统。如果不留扩展点，第一个需求变更就得大动干戈。

**决策框架：变化概率 × 变化成本的 2×2 矩阵**

```
                  变化概率
              低              高
        ┌───────────┬───────────┐
   低   │ 不值得抽象 │ 酌情抽象   │
变      │           │ (轻量级)   │
化  ───│───────────│───────────│
成      │           │           │
本  高  │ 不抽象     │ 必须抽象   │
    │   │ (YAGNI)    │ (投入OCP)  │
        └───────────┴───────────┘
```

| 象限 | 策略 | 示例 |
|------|------|------|
| 低概率 × 低成本 | 不值得抽象——即使变了改动也不大 | 日志级别调整 |
| 低概率 × 高成本 | 不抽象——YAGNI，不要为可能不会发生的事做架构投入 | "未来可能要支持多语言"——现在只有中文用户 |
| 高概率 × 低成本 | 酌情抽象——可以做个轻量级的抽象点 | 支付方式一定会增加，但增加一个新实现成本极低 |
| **高概率 × 高成本** | **必须抽象——OCP 的黄金象限** | 核心业务流程的审计要求——法规一定会变更，改错代价是合规事故 |

```java
// 判断指南：什么值得做抽象？

// 值得 OCP 的：
// 1. 第三方集成（一定会换，换了就是大事）
// 2. 业务规则（一定会变，每条新规则都必须审计）
// 3. 数据持久化（数据库版本升级是确定性的未来事件）
// 4. 接口协议（一旦发布给外部消费者，不可随意变更）

// 不值得 OCP 的：
// 1. "以后可能要支持多种排序"——YAGNI
// 2. "如果数据量大了就换存储引擎"——等到那一天再说
// 3. "这个 if-else 将来可能有更多分支"——等真的出现第三分支时再重构
// 4. 领域逻辑本身——过度抽象的业务层比重复几行代码更可怕

// 反面教材：为每个 if-else 设计一个策略模式
// 这是一个只有两种状态的订单——不需要策略模式
public enum OrderStatus { PENDING, COMPLETED }

// 过度设计（不要这样做）：
public interface OrderStatusProcessor {  // 2个实现的"策略模式"
    void process(Order order);
}
// 直接用 if-else：
if (order.getStatus() == PENDING) {
    // 处理待处理订单
} else {
    // 处理已完成订单
}
// 当出现第 3、第 4 种状态，并且每种状态的逻辑超过 20 行时，再引入策略模式
```

### 2.2.4 OCP 在分层架构和微服务中的应用

**分层架构中的 OCP**：每一层通过接口暴露能力，上层依赖接口而非实现。

```java
// 分层架构中的 OCP：每层定义了"扩展点"
// 换掉一层的实现不影响其他层

// 数据层接口——OCP 的扩展点
public interface OrderRepository {
    Optional<Order> findById(Long id);
    Order save(Order order);
}

// 实现 1：JPA（当前使用）
@Repository
public class JpaOrderRepository implements OrderRepository {
    private final SpringDataOrderRepository springDataRepo;
    // 委派给 Spring Data JPA
}

// 实现 2：纯 JDBC（如果将来需要更高性能）
@Repository
// @Primary  // 切换实现只需加一行注解
public class JdbcOrderRepository implements OrderRepository {
    private final JdbcTemplate jdbcTemplate;
    // 手写 SQL，性能更优
}

// 业务层——完全不受影响，依赖的是接口
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    // OrderRepository 是接口——实现从 JPA 换成 JDBC 对这里透明
}
```

**微服务中的 OCP**：API 版本化和服务发现。

```java
// 微服务中的 OCP：
// API 版本化允许在不破坏消费者的前提下演进接口

@RestController
@RequestMapping("/api/v1/orders")     // v1：稳定版本，对修改封闭
public class OrderControllerV1 {
    @PostMapping
    public OrderResultV1 createOrder(@RequestBody OrderRequestV1 request) {
        // v1 逻辑，保持不变
    }
}

@RestController
@RequestMapping("/api/v2/orders")     // v2：通过新增路径实现扩展
public class OrderControllerV2 {
    @PostMapping
    public OrderResultV2 createOrder(@RequestBody OrderRequestV2 request) {
        // v2 新增字段，支持批量订单——不修改 v1
    }
}

// 消费者可以平滑迁移：
// 老消费者继续用 /api/v1/orders，行为不变
// 新消费者使用 /api/v2/orders，享受新能力
```

---

## 2.3 里氏替换原则（LSP）

### 2.3.1 原则定义与架构映射

**经典定义（Barbara Liskov, 1987）**：

> Subtypes must be substitutable for their base types.
> 子类型必须能够替换其基类型。

更正式的表达（Liskov & Wing, 1994）：

> 如果对每个类型 S 的对象 o1，都存在类型 T 的对象 o2，使得对所有针对 T 定义的程序 P 而言，当 o1 替换 o2 时，P 的行为不变，那么 S 是 T 的子类型。

这听起来非常学术，但在日常工程中的含义是清晰的：**如果你写了一个子类，把它传给一个期望父类的代码，那代码不应该发现问题。**

```java
// 经典反例：矩形和正方形
// 数学上正方形象是矩形——但用继承来表达它们的关系违反了 LSP

public class Rectangle {
    protected int width;
    protected int height;

    public void setWidth(int width) { this.width = width; }
    public void setHeight(int height) { this.height = height; }
    public int getArea() { return width * height; }
}

public class Square extends Rectangle {
    // 正方形强制宽=高——但这是通过改写父类行为实现的
    @Override
    public void setWidth(int width) {
        this.width = width;
        this.height = width;  // 副作用！setWidth 悄悄改了 height
    }

    @Override
    public void setHeight(int height) {
        this.width = height;  // 副作用！setHeight 悄悄改了 width
        this.height = height;
    }
}

// 使用父类的代码出 bug 了：
public class AreaCalculator {
    public void resizeRectangle(Rectangle rect) {
        rect.setWidth(5);
        rect.setHeight(10);
        // 期望: area = 5 × 10 = 50
        assert rect.getArea() == 50;
    }
}

// passer 测试：
new AreaCalculator().resizeRectangle(new Rectangle());  // 通过
new AreaCalculator().resizeRectangle(new Square());     // 失败！area = 100
// Square 不能替换 Rectangle——违反了 LSP
```

**架构层面的延伸**：

```java
// LSP 在架构层面不限于"继承"——它适用于任何"契约替换"场景

// 如果一个微服务 v2 版本替换了 v1 版本，
// 所有调用 v1 的消费者必须仍能正常工作——这就是 LSP 在服务层面的体现

// 如果一个模块提供了接口，另一个模块提供了实现，
// 这个实现对所有调用该接口的代码来说必须是透明的
```

### 2.3.2 架构层面 LSP 的三种违规模式

**模式一：抛出父类没有的异常**

```java
// 父类契约："这个方法可能抛出 IllegalArgumentException"
public interface PaymentGateway {
    /**
     * @throws IllegalArgumentException 如果金额≤0
     */
    PaymentResult charge(BigDecimal amount);
}

// 子类：增加了父类契约中没有的异常
@Service
public class AlipayGateway implements PaymentGateway {
    @Override
    public PaymentResult charge(BigDecimal amount) {
        if (amount.compareTo(new BigDecimal("50000")) > 0) {
            // 父类没有声明这个异常！
            // 调用方不知道要处理 AlipayLimitExceededException
            throw new AlipayLimitExceededException("单笔不能超过50000");
        }
        // ...
    }
}

// 调用方代码崩了：
public void processPayment(PaymentGateway gateway, BigDecimal amount) {
    try {
        gateway.charge(amount);
    } catch (IllegalArgumentException e) {
        // 调用方只知道处理这个异常
        handleInvalidAmount(e);
    }
    // AlipayLimitExceededException 没有被捕获 → 直接崩到最外层 → 500 错误
}
```

**模式二：强化了父类的输入约束**

```java
// 父类：接受任意正整数
public interface DiscountCalculator {
    BigDecimal calculate(BigDecimal originalPrice, BigDecimal discountRate);
    // discountRate 的范围: 0.0 ~ 1.0
}

// 子类：收紧了输入范围——违规！
@Service
public class VipDiscountCalculator implements DiscountCalculator {
    @Override
    public BigDecimal calculate(BigDecimal originalPrice, BigDecimal discountRate) {
        if (discountRate.compareTo(new BigDecimal("0.5")) < 0) {
            // 子类拒绝处理折扣率 < 50% 的情况
            // 但父类契约说可以接受任何 0.0~1.0 的值
            throw new IllegalArgumentException("VIP折扣率不能低于50%");
        }
        return originalPrice.multiply(BigDecimal.ONE.subtract(discountRate));
    }
}
```

**模式三：弱化了父类的输出保证**

```java
// 父类：保证返回非 null 的支付结果
public interface PaymentGateway {
    PaymentResult charge(BigDecimal amount);  // 契约: 永不返回 null
}

// 子类：在某些情况下返回 null
@Service
public class MockPaymentGateway implements PaymentGateway {
    @Override
    public PaymentResult charge(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;  // 父类契约说永不 null —— NPE 在等着调用方
        }
        return new PaymentResult("MOCK_OK");
    }
}
```

### 2.3.3 LSP 在设计 API 契约时的实践准则

```java
// 设计可替换的接口时的三个约束：

// 约束1：输入参数——子类只能接受更宽松的范围，不能收紧
// 约束2：输出结果——子类只能返回更严格的保证，不能放松
// 约束3：异常——子类只能抛出父类声明了的异常（或它们的子类）

// 好的契约设计：用前置条件/后置条件/不变量明确说明
public interface OrderRepository {

    /**
     * 前置条件 (Precondition): id > 0
     * 后置条件 (Postcondition): 找到时返回包含 Order 的 Optional，未找到返回 empty
     * 不变量 (Invariant): 不返回 null
     */
    Optional<Order> findById(Long id);

    /**
     * 前置条件: order 不能为 null, order.getItems() 不能为空
     * 后置条件: 返回的 Order 有生成的 ID
     * 不变量: 始终返回非 null 的 Order
     */
    Order save(Order order);
}

// 实现类只要满足以上三组约束，就可以安全替换
// 如果在实现中发现需要违反约束，说明应该使用不同的接口（ISP）
```

---

## 2.4 依赖倒置原则（DIP）

### 2.4.1 原则定义

**经典定义（Robert C. Martin）**：

> 1. 高层模块不应该依赖低层模块。两者都应该依赖抽象。
> 2. 抽象不应该依赖细节。细节应该依赖抽象。

这是 SOLID 体系中对架构影响最深远的原则。它直接推翻了传统的分层依赖方向——传统分层中，高层调用低层，高层依赖低层。DIP 说：**不，让它们都依赖抽象**。

```java
// 传统依赖方向（违反 DIP）：
// 高层 OrderService → 低层 UserRepository（具体类）
// 依赖方向与调用方向一致，高层"知道"低层的存在

@Service
public class OrderService {
    // 直接依赖具体类
    private final UserJdbcRepository userRepository;

    public OrderService() {
        this.userRepository = new UserJdbcRepository();  // 硬编码依赖
    }
}

// DIP 的依赖方向：
// 高层 OrderService → IUserRepository（接口） ← UserJdbcRepository（低层）
// 依赖方向反转——低层也依赖抽象，高层不再"知道"低层的存在

@Service
public class OrderService {
    // 依赖抽象接口
    private final IUserRepository userRepository;

    public OrderService(IUserRepository userRepository) {  // 注入抽象
        this.userRepository = userRepository;
    }
}
```

**DIP 与传统分层的关系**：

```
传统分层         DIP + 分层
高层            高层
  ↓ 依赖             ↓ 依赖
低层            抽象(接口)
                   ↑ 实现
                 低层

DIP 的核心是将"抽象"从高层"拥有"变为双方共享
```

### 2.4.2 架构层面的 DIP 实践

**实践一：依赖注入容器**

```java
// Spring 的 IoC 容器是 DIP 的最典型实现

// 定义抽象（通常放在一个独立的 api 模块中）
public interface NotificationService {
    void send(String userId, String message);
}

// 低层模块实现抽象
@Service
public class EmailNotificationService implements NotificationService {
    @Override
    public void send(String userId, String message) {
        // SMTP 邮件发送
    }
}

@Service
public class SmsNotificationService implements NotificationService {
    @Override
    public void send(String userId, String message) {
        // 短信网关发送
    }
}

// 高层模块只依赖抽象
@Service
public class OrderNotificationHandler {
    private final NotificationService notificationService;

    // Spring 自动注入具体实现——高层代码不知道也不关心是哪一种
    public OrderNotificationHandler(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    public void notifyOrderCreated(Order order) {
        notificationService.send(order.getUserId(), "订单" + order.getId() + "已创建");
    }
}
```

**实践二：领域层不依赖基础设施层**

```java
// 这是 DDD（领域驱动设计）中的关键架构规则
// 领域层（核心业务逻辑）不应该依赖基础设施层（数据库、消息队列、HTTP）

// 领域层：只定义接口和业务逻辑
// 放在 domain 模块，不导入 javax.persistence、org.springframework 等

public class OrderDomainService {
    private final OrderRepository orderRepository;  // 领域层定义的接口

    @Transactional  // ← 等等，为什么领域层有事务注解？
    public Order createOrder(OrderCreationCommand command) {
        // ...
    }
}

// 问题：领域层不应该知道 @Transactional
// 解决：在应用层编排事务，领域层保持纯净

// 领域层——对基础设施零依赖
public class OrderDomainService {
    private final OrderRepository orderRepository;  // 接口在领域层内部定义

    public Order createOrder(OrderCreationCommand command) {
        // 纯业务逻辑，不涉及任何基础设施概念
        Order order = Order.create(command);
        orderRepository.save(order);
        return order;
    }
}

// 应用层——处理事务等基础设施关注点
@Service
public class OrderApplicationService {
    private final OrderDomainService orderDomainService;

    @Transactional  // 事务在应用层管理
    public OrderResult createOrder(OrderCreationCommand command) {
        Order order = orderDomainService.createOrder(command);
        return OrderResult.from(order);
    }
}
```

**实践三：模块依赖方向控制**

```java
// 多模块项目中，DIP 体现为模块间的依赖方向

// 典型的 DDD 模块依赖方向（箭头表示"依赖"）：
// interfaces → application → domain ← infrastructure
//   (web)     (编排/事务)   (核心业务)   (数据库/外部API)

// domain 模块处于依赖的"被指向"方向——它不依赖任何人
// 所有其他模块都通过 domain 定义的接口来通信

// domain/src/main/java/com/example/domain/
// ├── model/
// │   └── Order.java           // 领域实体
// ├── repository/
// │   └── OrderRepository.java  // 仓储接口（不是实现！）
// ├── service/
// │   └── OrderDomainService.java
// └── event/
//     └── OrderCreatedEvent.java

// infrastructure/src/main/java/com/example/infrastructure/
// └── repository/
//     └── JpaOrderRepository.java  // 实现 domain 的接口
//         implements OrderRepository { ... }
```

### 2.4.3 DIP 的边界：不是所有依赖都要"倒置"

```java
// DIP 不意味着"所有类都必须有接口"

// 不需要接口的情况：
public class StringUtils {  // 纯工具类，逻辑稳定，不会被替换
    public static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}

public class Money {  // 值对象，用具体类表达更有表现力
    private final BigDecimal amount;
    private final Currency currency;
}

// 需要接口的情况：
// 1. 存在多个可替换的实现（支付渠道、短信供应商、存储引擎）
// 2. 实现依赖外部系统（便于测试时 mock）
// 3. 实现可能被独立替换升级（数据库迁移、中间件更换）

public interface IdGenerator {  // 需要接口：测试用 Fake，生产用雪花算法
    Long nextId();
}
```

---

## 2.5 接口隔离原则（ISP）

### 2.5.1 原则定义

**经典定义（Robert C. Martin）**：

> Clients should not be forced to depend on interfaces they do not use.
> 客户端不应该被迫依赖它们不使用的方法。

ISP 要解决的核心问题是"胖接口"——一个接口包含了太多方法，导致实现类和调用方都被迫处理它们不关心的东西。

```java
// 违反 ISP：一个"万能"仓库接口
public interface UniversalRepository<T> {
    T findById(Long id);
    List<T> findAll();
    T save(T entity);
    void delete(Long id);
    List<T> search(SearchCriteria criteria);      // 全文搜索——只有少数实现需要
    void exportToExcel(OutputStream output);      // Excel导出——完全不相干的职责
    List<T> findByNativeSql(String sql);          // 原生SQL——绕过了一切抽象
}

// 实现方的痛苦：你必须实现所有方法
public class ReadOnlyConfigRepository implements UniversalRepository<Config> {
    // 我必须实现 delete()，尽管配置是只读的
    @Override
    public void delete(Long id) {
        throw new UnsupportedOperationException("配置是只读的");  // 运行时炸弹
    }

    // 我必须实现 exportToExcel()，尽管这完全不是仓储的职责
    @Override
    public void exportToExcel(OutputStream output) {
        throw new UnsupportedOperationException("不适用");
    }
    // 还要实现其他 5 个方法...
}
```

### 2.5.2 架构层面的 ISP 实践

**实践一：拆分胖接口**

```java
// 符合 ISP：按使用方式拆分接口

// 查询操作——大部分消费者只需要这个
public interface OrderQueryRepository {
    Optional<Order> findById(Long id);
    List<Order> findByUserId(Long userId);
    Page<Order> search(OrderSearchCriteria criteria);
}

// 命令操作——只有写操作的消费者需要
public interface OrderCommandRepository {
    Order save(Order order);
    void delete(Long id);
}

// 批量操作——只有特定的批处理消费者需要
public interface OrderBatchRepository {
    List<Order> saveAll(List<Order> orders);
    void deleteAll(List<Long> ids);
}

// 实现类：根据需要实现相应的接口
@Repository
public class JpaOrderRepository implements
    OrderQueryRepository, OrderCommandRepository {

    // 完整实现查询和命令接口
}

// "只读服务"只需要查询接口——干净！
@Service
public class OrderReportService {
    private final OrderQueryRepository orderQueryRepository;  // 只有查询能力

    public OrderReport generateReport(Long userId) {
        List<Order> orders = orderQueryRepository.findByUserId(userId);
        // 不用担心有人调用 delete()
        return new OrderReport(orders);
    }
}
```

**实践二：CQRS——ISP 的终极架构版本**

```java
// CQRS (Command Query Responsibility Segregation) 是 ISP 在服务层面的体现
// 读模型和写模型使用完全不同的接口，甚至不同的数据存储

// 命令端（写操作）——有严格的业务规则
@Service
public class OrderCommandService {
    public OrderResult createOrder(CreateOrderCommand command) {
        // 命令端：验证、聚合、事务
    }
}

// 查询端（读操作）——为展示优化，无业务规则
@Service
public class OrderQueryService {
    public OrderDetailDTO getOrderDetail(Long orderId) { /* 优化过的查询 */ }
    public List<OrderSummaryDTO> getRecentOrders(Long userId) { /* 物化视图 */ }
}
```

**实践三：微服务中的 ISP**

```java
// 微服务的 API 设计天然体现 ISP
// 每个微服务只暴露消费者真正需要的接口

// 订单服务的调用者视角：
// 支付服务只需要：创建订单支付请求
// 物流服务只需要：查询待发货订单
// 报表服务只需要：查询订单历史

// 一个服务对不同的消费者暴露不同的接口（不同的 Controller 或 API 版本）

@RestController
@RequestMapping("/api/orders/for-payment")   // 支付服务的视角
public class OrderForPaymentController {
    @GetMapping("/{orderId}")
    public OrderPaymentView getForPayment(@PathVariable Long orderId) {
        // 只返回支付需要的信息：金额、状态
        // 不返回：物流信息、用户备注、历史操作记录
    }
}

@RestController
@RequestMapping("/api/orders/for-logistics") // 物流服务的视角
public class OrderForLogisticsController {
    @GetMapping("/{orderId}")
    public OrderLogisticsView getForLogistics(@PathVariable Long orderId) {
        // 只返回物流需要的信息：收货地址、商品列表
        // 不返回：支付流水、积分信息
    }
}
```

---

## 2.6 迪米特法则（LoD）

### 2.6.1 原则定义

**经典定义**：

> Each unit should have only limited knowledge about other units: only units "closely" related to the current unit.
> 一个对象应该对其他对象有尽可能少的了解。

通俗说法："只和你的直接朋友说话，不要和陌生人的朋友说话。"

```java
// 违反迪米特法则：链式调用——和陌生人的朋友说话
public class OrderService {
    public String getCustomerCity(Order order) {
        // order 是我的直接朋友
        // order.getCustomer() 的返回值是我的直接朋友
        // 但 .getAddress() 是谁？.getCity() 又是谁？
        // 我穿透了三层对象——我了解太多了
        return order.getCustomer().getAddress().getCity();
    }
}

// 符合迪米特法则：只和最直接的朋友交谈
public class OrderService {
    public String getCustomerCity(Order order) {
        // 只问 order 一个朋友——让 order 自己去处理内部结构
        return order.getCustomerCity();
    }
}

// Order 类内部：把询问委托给正确的对象
public class Order {
    private Customer customer;

    public String getCustomerCity() {
        return customer.getCity();  // 让 Customer 去处理地址细节
    }
}

public class Customer {
    private Address address;

    public String getCity() {
        return address.getCity();  // 让 Address 提供最终答案
    }
}
```

### 2.6.2 架构层面的迪米特法则

迪米特法则在架构层面不叫"迪米特"——它叫**最小知识原则**、**信息隐藏**、**封装**。它在不同粒度上有不同的称呼，但核心思想一致。

```java
// 微服务中的"迪米特法则"：
// 服务 A 不应该知道服务 B 的内部实现细节

// 违反：订单服务知道支付服务用的是哪个数据库
@Service
public class OrderService {
    // 灾难：订单服务直接访问支付服务的数据库
    private final JdbcTemplate paymentDbJdbcTemplate;

    // 订单服务"知道"支付服务的表结构
    public PaymentStatus checkPayment(Long orderId) {
        return paymentDbJdbcTemplate.queryForObject(
            "SELECT status FROM payment_db.payment_records WHERE order_id = ?",
            PaymentStatus.class, orderId);
    }
}

// 符合：订单服务只知道支付服务暴露的 API
@Service
public class OrderService {
    private final PaymentServiceClient paymentClient;

    public PaymentStatus checkPayment(Long orderId) {
        // 只和支付服务暴露的 API 交谈——不关心它内部用什么数据库
        return paymentClient.getPaymentStatus(orderId);
    }
}
```

```java
// 模块中的"迪米特法则"：
// 只暴露必要的公共 API，隐藏内部实现

// 违反：user 模块把所有内部类都暴露为 public
com.example.user/
├── api/
│   └── UserService.java           // public —— 合理，这是模块的门面
├── internal/
│   ├── UserValidator.java         // 应该是 package-private！
│   ├── PasswordEncoderHelper.java // 应该是 package-private！
│   └── UserCacheManager.java      // 应该是 package-private！
// 外部模块可以直接依赖 internal 包中的类——模块边界形同虚设

// 符合：使用 Java Module System 或 ArchUnit 强制模块边界
module com.example.user {
    exports com.example.user.api;          // 只暴露 api 包
    // internal 包不导出——外部模块无法访问
}
```

### 2.6.3 门面模式：迪米特法则的架构补丁

```java
// 当一个子系统过于复杂，对外暴露了太多"朋友"时，
// 用一个门面将所有复杂性隐藏在单一入口背后

// 没有门面：调用方需要了解子系统的所有组件
@Service
public class OrderService {
    public void createOrder(OrderRequest request) {
        // 我被迫知道库存子系统的三个内部组件
        InventoryReservationResult reservation = inventoryService.reserve(request.getItems());
        WarehouseAssignmentResult assignment = warehouseService.assign(reservation);
        ShippingEstimateResult estimate = shippingService.estimate(assignment);
        // 这三个调用是库存子系统的内部协调逻辑
        // 但我（订单服务）被迫了解整个流程
    }
}

// 有门面：调用方只和门面交谈
@Service
public class OrderService {
    private final InventoryFacade inventoryFacade;

    public void createOrder(OrderRequest request) {
        // 一个调用封装了整个库存检查流程
        InventoryResult result = inventoryFacade.processNewOrder(request.getItems());
        // 订单服务只"认识"门面这一个朋友
    }
}

// 门面内部：封装了所有协调逻辑
@Service
public class InventoryFacade {
    private final InventoryService inventoryService;
    private final WarehouseService warehouseService;
    private final ShippingService shippingService;

    public InventoryResult processNewOrder(List<OrderItem> items) {
        InventoryReservationResult reservation = inventoryService.reserve(items);
        WarehouseAssignmentResult assignment = warehouseService.assign(reservation);
        ShippingEstimateResult estimate = shippingService.estimate(assignment);
        return new InventoryResult(reservation, assignment, estimate);
    }
}
```

---

## 2.7 合成复用原则（CRP）

### 2.7.1 原则定义

> Favor object composition over class inheritance.
> 优先使用对象组合（组合/委托）而不是类继承。

这个原则出自《Design Patterns》（Gang of Four），后被纳入设计原则体系。它的核心理由是：**继承是白盒复用（子类知道父类的实现细节），组合是黑盒复用（只知道接口）。白盒复用导致紧耦合。**

```java
// 继承的问题：编译时绑定，无法在运行时改变行为
public class HashedSet<E> extends HashSet<E> {
    private int addCount = 0;

    @Override
    public boolean add(E e) {
        addCount++;
        return super.add(e);
    }

    // Bug！addAll 内部调用 add()
    // 如果 HashSet 的 addAll 实现改为不调用 add()
    // 这个计数就错了——继承让你依赖了父类的实现细节
    @Override
    public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);
    }
}

// 组合的解决方案：委托而非继承
public class InstrumentedSet<E> implements Set<E> {
    private final Set<E> delegate;  // 组合——持有一个 Set 实例
    private int addCount = 0;

    public InstrumentedSet(Set<E> delegate) {
        this.delegate = delegate;
    }

    @Override
    public boolean add(E e) {
        addCount++;
        return delegate.add(e);  // 委托给内部对象
    }

    // addAll 不需要重写——因为我们知道 add() 会被 call
    // 我们不需要知道 delegate 的内部实现——只依赖 Set 接口
}
```

### 2.7.2 架构层面的 CRP

在架构层面，CRP 的思想映射为"组合式架构"——通过组合独立的服务/模块来构建系统，而不是通过"继承"一个庞大基础框架。

```java
// 框架继承（反例）：所有服务必须继承 BaseService
// 这是继承思想在架构层面的映射——脆弱

public abstract class BaseService<T> {
    @Autowired
    protected JdbcTemplate jdbcTemplate;

    protected T findById(Long id) { /* ... */ }
    protected void save(T entity) { /* ... */ }
    protected void log(String action) { /* ... */ }
    // 所有"子服务"都自动获得了这些能力
    // 但也被绑定到了 JdbcTemplate、特定的日志格式、特定的查询方式
}

// 一个子服务：
@Service
public class OrderService extends BaseService<Order> {
    // 如果我想换成 JPA，我做不到——继承链绑定了 JdbcTemplate
    // 如果我想用不同的日志格式，我得重写所有方法
}

// 组合式架构（正例）：通过依赖注入组合能力
// 这是组合思想在架构层面的映射——灵活

@Service
public class OrderService {
    // 通过组合组装能力，而非通过继承获得能力
    private final OrderRepository orderRepository;   // 可以是 JPA、JDBC 或 MongoDB
    private final EventPublisher eventPublisher;      // 可以是 Kafka、RabbitMQ 或内存
    private final MetricsService metricsService;      // 可以是 Micrometer、自定义或 mock

    // 每一个依赖都可以在运行时根据配置替换
    public OrderService(
        OrderRepository orderRepository,
        EventPublisher eventPublisher,
        MetricsService metricsService) {
        this.orderRepository = orderRepository;
        this.eventPublisher = eventPublisher;
        this.metricsService = metricsService;
    }
}
```

```java
// Spring Boot 的成功本质就是 CRP 在架构层面的胜利
// 你不是"继承 Spring"，你是"组合 Spring 提供的组件"

@SpringBootApplication
public class OrderApplication {
    // 你通过 @Autowired、@Bean 来组合各种能力
    // 而不是 extends SpringApplication
}
```

---

## 2.8 原则的权衡与决策

### 2.8.1 原则之间的张力

软件工程中最有意思也最困难的部分是：原则经常互相冲突。理解原则何时"打架"，以及如何在这种情况下做出判断，是架构师最核心的能力。

```java
// 冲突矩阵：两个原则同时适用时的张力

// 冲突1: SRP vs DRY（Don't Repeat Yourself）
// SRP 说"把它们分开，它们变化的原因不同"
// DRY 说"不要重复，这两个模块有相似的验证逻辑"

// 判断框架：
// 如果共享逻辑在两个模块中的变化频率一致（总是一起改）→ DRY 赢 → 提取公共库
// 如果共享逻辑在两个模块中的变化频率不同 → SRP 赢 → 允许重复

public class DecisionExample {
    // 场景：订单和支付都需要地址验证

    // 如果只在一处复用（DRY 方案）：
    // 公共库：AddressValidator
    // 当支付需要增加"国际地址验证"而订单不需要时，你怎么办？
    // 加个参数 boolean isInternational？→ 污染了所有调用方
    // 分成两个方法？→ 那还叫"复用"吗？

    // 务实选择：允许各自拥有地址验证逻辑
    // com.example.order.validation.OrderAddressValidator
    // com.example.payment.validation.PaymentAddressValidator
    // 它们共享同一套接口，但各自拥有独立的实现和演进路径
}
```

| 冲突对 | 本质张力 | 判断准则 | 偏向哪边 |
|--------|----------|----------|----------|
| SRP vs DRY | 独立演进 vs 消除重复 | 变化原因是否相同？不同则允许重复 | 初期 DRY，发现变化不同步后拆开 |
| OCP vs KISS | 预判变化 vs 保持简单 | 变化的概率和成本是否都高？ | KISS 优先，被证明需要后再加 OCP |
| DIP vs YAGNI | 依赖倒置 vs 不为未来编码 | 今天是否有"测试需要 mock"或"已知多个实现"？ | YAGNI 优先 |
| ISP vs 最小接口数 | 接口精准 vs 管理成本 | 如果一个接口有 6 个方法但 90% 的消费者都用到 5 个 | 不必拆 |
| LoD vs 性能 | 最少知识 vs 减少调用层数 | 链式调用是否跨越了进程/服务边界？ | 进程内可放松，跨服务必须遵守 |

### 2.8.2 决策优先级：什么时候哪个原则说了算

```java
/**
 * 架构原则的优先级框架
 *
 * 优先级排布逻辑：先判断系统类型，再决定原则优先级
 */

public enum SystemPhase {
    PROTOTYPE,      // 原型/MVP（寿命<6个月）
    GROWTH,         // 快速增长期（业务模式已验证，大规模扩展）
    MATURITY,       // 成熟期（稳定迭代，关注维护成本）
    LEGACY          // 遗留系统（维护模式，最小变更）
}

public class PrinciplePriority {

    public static List<DesignPrinciple> getPriorities(SystemPhase phase) {
        return switch (phase) {
            case PROTOTYPE -> List.of(
                // 原型阶段：速度最重要
                DesignPrinciple.KISS,   // 1. 保持简单——别过度设计
                DesignPrinciple.YAGNI,  // 2. 今天需要什么做什么
                DesignPrinciple.DRY     // 3. 基本复用——减少不必要重复
                // SRP/OCP/DIP 不是这个阶段的关注点
            );

            case GROWTH -> List.of(
                // 快速增长期：可扩展性优先
                DesignPrinciple.SRP,    // 1. 拆清职责——避免模块爆炸
                DesignPrinciple.DIP,    // 2. 依赖抽象——支持替换和测试
                DesignPrinciple.OCP     // 3. 定义扩展点——减少修改影响面
            );

            case MATURITY -> List.of(
                // 成熟期：可维护性优先
                DesignPrinciple.OCP,    // 1. 保护核心稳定
                DesignPrinciple.ISP,    // 2. 接口最小化
                DesignPrinciple.LoD,    // 3. 管理模块间耦合
                DesignPrinciple.CRP     // 4. 防范继承耦合扩散
            );

            case LEGACY -> List.of(
                // 遗留系统：变更安全第一
                DesignPrinciple.DIP,    // 1. 通过抽象隔离新旧代码
                DesignPrinciple.LoD     // 2. 最小侵入——只碰必须碰的
            );
        };
    }
}
```

### 2.8.3 原则使用的最终检验

```java
// 原则不是目的——它们是你达到目的的思维工具
// 最终检验标准只有一条：这个设计是否让我更容易应对下一个需求变更？

// 测试你理解程度的问题：

// 场景1：你设计了一个完美符合 SRP/OCP/DIP/ISP 的支付模块
// 但团队新来的开发者花了三周才理解它
// → 你违反了 KISS 和团队的认知负载限制
// → 重新评估：是不是某些抽象层可以简化？

// 场景2：你为了保持 KISS，在一个方法里用 if-else 处理 8 种支付渠道
// 每次加新渠道都要修改这个方法，而且已经在生产环境踩过两次改错的坑
// → KISS 的"简单"正在转化为风险
// → 引入策略模式（OCP），接受"多一个接口"的复杂度成本

// 核心洞察：
// 没有"正确"或"错误"的原则使用——
// 只有"在当前约束条件下，这个权衡是否合理"
```

### 2.8.4 本章小结

本章深入探讨了架构设计的八个核心原则：

1. **单一职责原则 (SRP)**：模块应该只有一个变化的原因。通过"变化原因分析法"和"业务术语测试"来识别职责边界。在多尺度上实践（服务→包→类→方法），但要警惕过度拆分的代价——每次拆分都引入通信成本和协调开销。

2. **开闭原则 (OCP)**：对扩展开放，对修改关闭。实现机制包括接口多态、SPI 插件架构、事件系统和配置驱动。"变化概率 × 变化成本"的矩阵帮你判断哪些值得抽象——只在"高概率 × 高成本"象限做 OCP 投入。

3. **里氏替换原则 (LSP)**：子类型必须能替换基类型。在架构层面体现为 API 契约的向后兼容、微服务版本的平滑升级。三种典型违规：抛父类没有的异常、强化输入约束、弱化输出保证。

4. **依赖倒置原则 (DIP)**：高层和低层都依赖抽象。是实现 SRP 和 OCP 的前提——没有 DIP，模块边界就无法用抽象隔开。通过 DI 容器、DDD 分层架构、模块依赖控制来实现。

5. **接口隔离原则 (ISP)**：消费者不应被迫依赖不用的方法。架构层面体现为 CQRS（读写分离接口）、微服务的消费者视角 API 设计。

6. **迪米特法则 (LoD)**：只和最直接的朋友交谈。在架构中体现为模块封装、服务 API 的黑盒性和门面模式。

7. **合成复用原则 (CRP)**：优先组合而非继承。在架构层面体现为"组合式架构"——用 DI 组装能力，而非通过继承框架获得能力。

8. **原则的权衡与决策**：原则之间常互相冲突（SRP vs DRY，OCP vs KISS，DIP vs YAGNI），没有绝对的优先级。根据系统所处阶段（原型期/增长期/成熟期/遗留期）选择不同的原则优先级。最终检验标准永远是一条：**这个设计是否让你更容易应对下一个需求变更？**

在下一章中，我们将探讨架构质量属性——从"怎么做设计"转向"怎么评估设计的好坏"。原则告诉我们如何选择，质量属性告诉我们选完之后如何验证。
