# 第4章 单层架构（Monolithic Architecture）

单层架构——通常称为"单体架构"——是最简单、最古老，也是最容易被误解的架构模式。它把整个应用作为一个单一的部署单元来构建，所有功能运行在同一个进程中。

"单体"在现代架构讨论中常被贬义地使用（"我们正在从单体迁移到微服务"），但单体架构有它不可替代的适用场景。选择单体不是"退而求其次"，而是"在正确的场景下做出务实的决定"。

---

## 4.1 解决的问题与应用场景

### 4.1.1 核心问题

单体架构解决的最根本问题是：**如何在团队小、业务简单、需求不稳定的条件下，以最小的架构成本交付软件。**

架构不是免费的。分层、拆分、服务化都需要付出代码量、部署复杂度、调试难度和认知负载的成本。当这些成本超过它们带来的收益时，你不需要架构——你需要一个单体。

### 4.1.2 典型应用场景

| 场景 | 为什么适合单体 |
|------|---------------|
| **创业公司 MVP** | 业务模式在变，过早的架构投入可能全部浪费 |
| **3-5 人团队** | 康威定律——小团队天然产出一体化系统 |
| **内部管理系统** | 用户数少（<1000），性能要求低，开发效率 > 运行效率 |
| **原型/概念验证** | 需要快速验证想法，架构债在验证后可以偿还可以扔掉 |
| **批次处理工具** | 无用户交互，无实时性要求，单一职责明确 |
| **学生/个人项目** | 架构的复杂度不匹配问题的复杂度 |

```java
// 判断是否适合单体的简单度量
public class MonolithFitness {

    public static FitnessResult evaluate(ProjectProfile profile) {
        int score = 0;

        // 加分项（适合单体）
        if (profile.getTeamSize() <= 5) score += 2;
        if (profile.isMvpPhase()) score += 3;
        if (profile.getDailyActiveUsers() < 1000) score += 1;
        if (!profile.requiresIndependentDeployment()) score += 2;
        if (profile.getDomainComplexity() <= 3) score += 1;
        if (profile.getExpectedLifetime_months() < 12) score += 1;

        // 减分项（不适合单体）
        if (profile.getTeamSize() > 20) score -= 3;
        if (profile.requires99_99Availability()) score -= 2;
        if (profile.hasDiverseTechStack()) score -= 2;

        if (score >= 5) return FitnessResult.STRONGLY_RECOMMENDED;
        if (score >= 2) return FitnessResult.SUITABLE;
        return FitnessResult.NOT_RECOMMENDED;
    }
}
```

### 4.1.3 适用条件

```
单体架构的"最佳状态"出现在以下条件同时满足时：

□ 团队 < 8 人  —— 再多就会在同一代码库中频繁冲突
□ 业务复杂度低  —— 没有太多不相关的子域需要独立演进
□ 不需要独立部署—— 所有功能以同一节奏发布
□ 不需要异构技术栈—— Java 一把就够了
□ 单数据库够用   —— 没有极端的读写分离或分库需求
□ 故障隔离不强需求—— 接受"一个模块的bug可能影响整个系统"

当任何一个条件不满足时，单体架构就开始产生摩擦
摩擦积累到临界点 → 考虑演进到分层/微服务
```

---

## 4.2 实现原理与结构

### 4.2.1 核心结构

```
┌─────────────────────────────────────────┐
│          单体应用 (single.war/jar)        │
│                                           │
│  ┌─────────────────────────────────┐     │
│  │        Web 层 (Spring MVC)       │     │
│  │   UserController, OrderController│     │
│  └──────────────┬──────────────────┘     │
│                 │                         │
│  ┌──────────────▼──────────────────┐     │
│  │      业务层 (Spring Service)      │     │
│  │   UserService, OrderService,     │     │
│    │   PaymentService, ...           │     │
│  └──────────────┬──────────────────┘     │
│                 │                         │
│  ┌──────────────▼──────────────────┐     │
│  │      数据层 (Spring Data JPA)     │     │
│  │   UserRepo, OrderRepo, PaymentRepo│    │
│  └──────────────┬──────────────────┘     │
│                 │                         │
│           ┌─────▼─────┐                  │
│           │  MySQL DB  │                  │
│           └───────────┘                  │
└─────────────────────────────────────────┘
```

### 4.2.2 Spring Boot 单体应用示例

```java
// 一个典型的 Spring Boot 单体应用入口
@SpringBootApplication
@EnableCaching
@EnableScheduling
public class EcommerceApplication {

    public static void main(String[] args) {
        SpringApplication.run(EcommerceApplication.class, args);
    }

    // 所有组件在一个 ApplicationContext 中
    // 依赖注入、AOP、事务管理全部由 Spring 统一管理
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }
}

// 所有的 Service 在一个进程中，共享同一个 JVM 堆
@Service
public class OrderService {
    private final UserService userService;        // 直接注入，进程内调用
    private final InventoryService inventoryService;
    private final PaymentService paymentService;

    // 因为是同一个 JVM，调用是普通方法调用——纳秒级
    // 不需要序列化/反序列化
    // 不需要网络包
    // 不需要熔断/重试
    // 事务可以直接跨所有 Service 传播（@Transactional 开箱即用）

    @Transactional
    public OrderResult createOrder(OrderRequest request) {
        // 1. 扣库存——进程内调用
        inventoryService.deduct(request.getItems());

        // 2. 扣款——进程内调用
        paymentService.charge(request.getAmount());

        // 3. 记录——同一个数据库事务
        Order order = orderRepository.save(Order.create(request));

        // 4. 发积分——进程内调用
        userService.addPoints(request.getUserId(), calculatePoints(request));

        // 以上四步在同一个数据库事务中——要么全部成功，要么全部回滚
        // 这是单体架构最大的便利之一：ACID 事务开箱即用
        return OrderResult.from(order);
    }
}
```

### 4.2.3 单体 ≠ 无结构

```java
// "单体架构"不等于"把所有代码倒进一个 Main.java"
// 即使在单体中，良好的包结构也是必须的

// 推荐：Package by Feature + 内部模块化
com.example.ecommerce/
├── user/
│   ├── controller/
│   │   └── UserController.java
│   ├── service/
│   │   └── UserService.java
│   ├── repository/
│   │   └── UserRepository.java
│   ├── model/
│   │   ├── User.java
│   │   └── UserDTO.java
│   └── config/
│       └── UserModuleConfig.java
│
├── order/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── model/
│
├── payment/
│   └── ...
│
├── shared/                       // 共享代码（尽量少）
│   ├── exception/
│   │   └── BusinessException.java
│   ├── util/
│   │   └── IdGenerator.java
│   └── constant/
│       └── Constants.java
│
└── config/                       // 全局配置
    ├── SecurityConfig.java
    ├── CacheConfig.java
    └── SwaggerConfig.java
```

**单体内部模块化的三个原则**：
1. shared 包应该尽量小——它越大，说明模块边界越模糊
2. 模块间通过 Service 接口通信，而非直接 import 对方的内部类
3. 用 ArchUnit 测试强制执行这些规则——为将来的拆分做好准备

---

## 4.3 优点与缺点

### 4.3.1 优点

| 优点 | 详细说明 |
|------|----------|
| **开发体验简单** | 一个 IDE 项目，一键启动，所有代码触手可及 |
| **调试容易** | 所有代码在一个 JVM 中，堆栈完整，断点直达 |
| **事务简单** | ACID 事务开箱即用，跨模块操作就是跨方法调用 |
| **部署简单** | 一个 jar/war 文件，一个部署脚本 |
| **性能好** | 无网络开销，无序列化成本，所有调用是普通方法调用 |
| **测试快速** | 集成测试不需要启动多个服务 |
| **新成员友好** | 克隆→导入→运行，三个步骤开始开发 |

### 4.3.2 缺点

| 缺点 | 详细说明 |
|------|----------|
| **扩展粒度粗** | 只能整体扩展，不能针对热点模块单独加实例 |
| **技术栈锁定** | 整个应用必须使用同一个语言、同一个框架版本 |
| **部署风险高** | 小功能的变更需要重新部署整个应用 |
| **故障隔离差** | 一个模块的内存泄漏/死循环影响整个系统 |
| **团队协作瓶颈** | 多团队在同一代码库工作，merge 冲突频繁 |
| **认知负载高** | 新开发者面对整个应用 1000+ 个类，不知从何下手 |
| **代码复用难** | 其他系统想复用"支付模块"——但它嵌在单体里无法独立使用 |

```java
// 缺点1的代码体现：扩展粒度粗
// 你的订单模块每秒 1000 笔，用户模块每秒 10 个访问
// 但你只能把整个应用部署成 3 个实例——用户模块也被"强制"扩展了
// 浪费了资源，用户模块根本不需要这么多实例

// 缺点4的代码体现：故障隔离差
@Service
public class ReportService {
    // 如果这个方法有内存泄漏
    public byte[] generateReport(String format) {
        byte[] report = new byte[Integer.MAX_VALUE];  // OOM
        // 这行代码会让整个单体应用 crash
        // → 登录功能不可用了
        // → 下单功能不可用了
        // → 所有功能都不可用了
        return report;
    }
}
```

---

## 4.4 潜在风险与问题

### 4.4.1 代码腐化——"大泥球"（Big Ball of Mud）

```
单体架构最容易出现的退化模式：

阶段1: 结构清晰的小单体（3-6个月）
  user/ order/ payment/ 模块各自独立，通过 Service 接口通信

阶段2: 共享包膨胀（6-12个月）
  开发者为方便在 shared/util/ 里创建了各种"通用工具类"
  模块间的边界被 shared 包"渗透"

阶段3: 循环依赖出现（12-18个月）
  OrderService → UserService → PaymentService → OrderService
  环形依赖让任何修改都变得不可预测

阶段4: 大泥球（18+个月）
  所有模块的 Service 互相 import
  没有开发者能说清"这个代码为什么在这里"
  每个需求变更都是"赌命"
```

```java
// 对抗代码腐化的三个武器：

// 武器1: ArchUnit —— 在 CI 中强制执行模块边界
@ArchTest
static final ArchRule no_shared_package_growth =
    classes()
        .that().resideInAPackage("..shared..")
        .should().haveSimpleNameNotContaining("")  // 监控 shared 包的大小
        .andShould().onlyBeAccessed()
        .byClassesThat().resideInAnyPackage("..shared..", "..config..");
// 当 shared 包中新增了被业务模块引用的类时，CI 报警

// 武器2: 依赖分析 —— 定期检查依赖图
// 用 jdeps + jQAssistant 可视化模块依赖关系
// 在 Code Review 中讨论"为什么这个模块多了三个依赖"

// 武器3: 命名约定 —— 让边界可见
// 好：user.UserService, order.OrderValidator —— 前缀=模块，一看就知边界
// 坏：service.UserHelper, util.OrderUtils —— 隐藏了边界，"util"是万能垃圾桶
```

### 4.4.2 数据库瓶颈

```java
// 单体通常有一个共享数据库——这是扩展的最大瓶颈

// 问题1: 全表被所有模块引用
// user 表被 order 模块 join，被 payment 模块 join，被 report 模块 join
// 加一个字段 = 可能影响 10+ 个模块的查询
// 改一个索引 = 不知道哪个模块的性能会突变

// 问题2: 数据库连接竞争
// 20 个模块共享 20 个数据库连接
// 一个慢查询（报表模块）打满连接池 → 所有模块都连不上数据库

// 缓解措施（不拆库）：
@Configuration
public class DatabaseIsolationConfig {

    // 为不同模块分配不同的连接池
    @Bean
    @ConfigurationProperties("app.datasource.orders")
    public DataSource orderDataSource() {
        // 订单模块专用连接池: max 10 connections
        return HikariDataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("app.datasource.reports")
    public DataSource reportDataSource() {
        // 报表模块专用连接池: max 5 connections
        // 报表慢查询不会耗尽订单的连接
        return HikariDataSourceBuilder.create().build();
    }
    // 这是"逻辑分库"——在同一个数据库实例上，用连接池隔离不同模块
    // 它不能解决所有问题，但它防止了慢查询的连锁反应
}
```

### 4.4.3 部署恐惧症

```
症状：
- 项目从"每天部署"退化到"每月部署"
- 每次部署前团队花三天做回归测试——因为不知道哪个部分可能被破坏
- 周五部署是禁区——"万一要回滚整个应用代价太大"
- 部署在凌晨做——因为用户影响最小，但开发者最疲劳

根源：
- 任何变更 = 全量部署 → 每个变更的风险被放大
- 一次部署包含 50 个 commit → 出了问题不知该回滚哪个
- 部署失败 = 所有功能回滚 → 好的功能被坏的功能拖累
```

**缓解措施**：蓝绿部署（Blue-Green Deployment）

```yaml
# Kubernetes 中的蓝绿部署
# 蓝环境（当前生产）+ 绿环境（新版本）
# 切换 = 改 Service 的 selector

apiVersion: v1
kind: Service
metadata:
  name: ecommerce-production
spec:
  selector:
    app: ecommerce
    version: blue   # ← 改这行为 green 就完成切换
  ports:
    - port: 80
      targetPort: 8080
# 回滚 = 把 selector 改回 blue（1秒内完成）
# 代价：需要两倍的运行资源
```

---

## 4.5 优化策略

### 4.5.1 模块化单体（Modular Monolith）

这是单体架构最重要的优化方向——**保持单体部署的简洁性，同时获得模块化带来的边界清晰性。**

```java
// 模块化单体：使用 Spring Modulith 或自定义模块结构

// 每个模块有自己的内部 API (公开接口)
// 和 internal 包（隐藏实现）
com.example.order/
├── api/                              // 对外暴露的接口
│   ├── OrderService.java
│   ├── OrderDTO.java
│   └── OrderCreatedEvent.java
└── internal/                         // 内部实现（外部不可访问）
    ├── OrderServiceImpl.java
    ├── OrderValidator.java
    └── OrderStateMachine.java

// Spring Modulith 提供的模块验证
@SpringBootApplication
public class ModularMonolithApplication {

    @Bean
    ApplicationModuleDetectionStrategy moduleDetection() {
        // 自动检测模块：每个顶级子包是一个模块
        return ApplicationModuleDetectionStrategy.ofExplicitAnnotatedModules();
    }
}

// 模块测试：验证模块边界没有被违反
@SpringBootTest
class ModularityTests {

    @Test
    void verifyModules(@Autowired ApplicationModules modules) {
        // Spring Modulith 自动验证：
        // 1. 没有循环依赖
        // 2. 没有跨模块的内部类引用
        // 3. API 包之间的依赖关系合理
        modules.verify();
    }
}
```

### 4.5.2 从单体到微服务的准备

```java
// 如果你预计未来需要拆分，在单体阶段就做好准备
// 准备工作本身不需要服务化——它是"好的模块化"

// 准备1：数据库表按模块隔离
// 现在：所有表在一个数据库
// 未来：每个服务的表在独立的数据库
// 准备：给每个模块的表加前缀（order_*, payment_*, user_*）
//      模块 A 的代码绝不访问模块 B 的表
//      用 ArchUnit 测试验证这一点

// 准备2：服务间通信先用接口代替
// 现在：PaymentService 是一个 Java 接口 + 实现类
// 未来：PaymentService 的实现改为 HTTP/gRPC 调用
// 准备：让 OrderService 只依赖 PaymentService 接口
//      拆分时，把实现从 "implements PaymentService" 改为远程调用

@Service
public class OrderService {
    // 依赖接口——拆分时不用改这行
    private final PaymentService paymentService;

    public OrderResult createOrder(OrderRequest request) {
        PaymentResult payment = paymentService.charge(request);
        // 拆分前：paymentService 是本地的 PaymentServiceImpl
        // 拆分后：paymentService 是 REST client 的代理实现
        // 这行代码不用改！
    }
}

// 准备3：事件用本地实现替代消息队列
// 现在：Spring ApplicationEvent（进程内）
// 未来：Kafka/RabbitMQ
// 准备：用一个 EventPublisher 接口包装
//      拆分时，把它从 ApplicationEventPublisher 实现换成 KafkaTemplate 实现
```

### 4.5.3 性能优化

```java
// 单体架构的性能瓶颈通常在数据库——而非应用层
// 应用层是纳秒级方法调用，数据库是毫秒级 I/O

// 优化1：二级缓存（减少数据库压力）
@Cacheable(value = "products", key = "#id", unless = "#result == null")
public Product getProduct(Long id) {
    return productRepository.findById(id)
        .orElseThrow(() -> new ProductNotFoundException(id));
}

@CacheEvict(value = "products", key = "#product.id")
public Product updateProduct(Product product) {
    return productRepository.save(product);
}

// 优化2：数据库查询优化
// 避免 N+1 查询
@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")
Optional<Order> findByIdWithItems(@Param("id") Long id);

// 优化3：异步化非关键路径
// 发邮件、发短信、写审计日志不需要在请求线程中做
@Async
public void sendOrderConfirmationEmail(Order order) {
    emailService.send(order.getUserEmail(), buildEmailContent(order));
}
```

---

## 4.6 本章小结

单体架构是软件架构的"零级基础"——它不是被淘汰的遗留物，而是在正确场景下最经济的选择。

**三种你绝对应该选单体的场景**：
1. 创业验证期——你更可能在两个月后 pivot，而非在两年后 scale
2. 3-5 人的小团队——康威定律会让大架构反噬效率
3. 内部工具和管理系统——用户少，变化慢，可用性要求低

**单体架构的核心矛盾**：
单体不是"不好"——它是在特定条件下最好的选择。问题出现在当条件不再成立时，你没有及时演进。单体的最大风险不是技术风险，而是**组织惯性**——"既然它是单体，就一直用单体"的心态。

**模块化单体是单体的最优形态**：
保持单体部署的全部优点（简单调试、开箱即用的事务、纳秒级调用），同时获得模块化带来的边界清晰和为未来拆分做好的准备。

在下一章中，我们将探讨两层架构（Client-Server）——当你的系统需要服务外部消费者时，单体如何自然地演进为客户端-服务器架构。
