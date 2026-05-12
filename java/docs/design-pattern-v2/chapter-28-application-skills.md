# 第28章 设计模式应用能力

掌握设计模式不仅仅是了解 23 种模式的定义，更是在面对具体问题时，能够快速判断哪种模式适合、如何重构代码到模式、以及在实际框架中识别模式的应用。

## 28.1 如何分析问题选择合适的模式

### 28.1.1 问题分析框架

面对一个设计问题时，可以通过以下四个问题来分析：

**问题 1：什么在变化？（变化的轴）**

识别系统中哪些部分可能发生变化，这些变化方向决定了应该使用什么模式。

```
示例——支付系统：

变化轴 1: 支付方式（支付宝、微信、信用卡、PayPal...）
  → 对应模式: 策略模式（每个支付方式是一个策略）

变化轴 2: 支付创建过程（普通支付、分期支付、代扣支付...）
  → 对应模式: 工厂方法（每个创建方式是一个工厂）

变化轴 3: 支付状态流转（待支付→已支付→已退款...）
  → 对应模式: 状态模式（每个状态是一个状态对象）
```

**问题 2：什么保持不变？（稳定的核心）**

识别系统中不变的部分，这部分通常是抽象层或接口。

```
示例——文件系统：

稳定的元素类型: File 和 Directory（很少改变）
  → 对应模式: 访问者模式（元素类型稳定，操作频繁增加）
  → 元素接口: accept(Visitor) 接受访问者

稳定的算法骨架: 数据导出（读取→格式化→写入）
  → 对应模式: 模板方法模式（骨架固定，步骤可变）
  → 骨架方法: export() 是 final 的
```

**问题 3：哪些关系需要解耦？**

识别需要解耦的对象间关系，不同的解耦方向对应不同的模式。

```
关系类型 → 解耦方式 → 对应模式

一对多通知          → 发布-订阅       → 观察者模式
多对多交互          → 集中调度         → 中介者模式
客户端与子系统       → 统一入口         → 外观模式
请求发送者与接收者    → 排队转发         → 命令模式
抽象与实现           → 分离接口与实现    → 桥接模式
算法与客户端         → 可替换算法       → 策略模式
```

**问题 4：运行时还是编译时灵活性？**

灵活性需要的时机决定了模式的选择。

```
编译时灵活性（类加载时确定）:
  → 模板方法模式：子类在编译时确定
  → 工厂方法模式：子类工厂在编译时确定

运行时灵活性（运行时动态切换）:
  → 策略模式：可以在运行时更换策略对象
  → 状态模式：状态可以运行时切换
  → 装饰器模式：装饰器可以运行时组装

两者兼顾:
  → 桥接模式：抽象部分编译时确定，实现部分运行时选择
  → 抽象工厂：产品族编译时确定，具体工厂运行时选择
```

### 28.1.2 决策树

以下决策树帮助从问题出发选择模式：

```
问题: 对象的创建逻辑复杂吗？
  ├── 是 → 创建型模式
  │   ├── 只需要一个实例？→ Singleton
  │   ├── 创建一组相关的对象？→ Abstract Factory
  │   ├── 创建过程有很多步骤？→ Builder
  │   ├── 单个产品有多个变体？→ Factory Method
  │   └── 对象创建成本高？→ Prototype
  └── 否 → 接口/行为问题

问题: 接口不兼容或结构复杂？
  ├── 接口不兼容 → Adapter
  ├── 子系统太复杂 → Facade
  ├── 需要动态添加功能 → Decorator
  ├── 需要控制访问 → Proxy
  ├── 对象数量爆炸 → Flyweight
  ├── 树形结构 → Composite
  └── 两个维度都变化 → Bridge

问题: 算法/行为需要灵活处理？
  ├── 多种可替换算法 → Strategy
  ├── 算法骨架固定，步骤可变 → Template Method
  ├── 行为随状态变化 → State
  ├── 一对多通知 → Observer
  ├── 请求处理链 → Chain of Responsibility
  ├── 请求封装为对象 → Command
  ├── 复杂对象交互 → Mediator
  ├── 需要撤销/恢复 → Memento
  ├── 元素稳定，操作变化 → Visitor
  └── 解释语言/DSL → Interpreter
```

### 28.1.3 模式选择案例分析

**案例 1：电商促销引擎**

```
需求：
  1. 多种促销类型（满减、折扣、赠品、包邮）
  2. 促销规则经常新增
  3. 同一种促销类型可能有不同的计算方式

分析：
  变化轴：促销类型 → 策略模式
  不变的点：促销计算流程（验证→计算→应用）→ 模板方法模式
  创建过程：根据规则创建不同促销策略 → 工厂模式

方案：
  ┌─────────────────────────────────────────┐
  │  PromotionStrategy (接口)                │
  │    FullReductionPromotion (满减策略)      │
  │    DiscountPromotion (折扣策略)            │
  │    GiftPromotion (赠品策略)               │
  │    FreeShippingPromotion (包邮策略)       │
  ├─────────────────────────────────────────┤
  │  PromotionCalculator (模板方法)           │
  │    calculate(Order, PromotionStrategy)   │
  │    1. validate() → 模板步骤              │
  │    2. calculate() → 委托给策略           │
  │    3. apply() → 模板步骤                 │
  ├─────────────────────────────────────────┤
  │  PromotionFactory (创建策略)              │
  │    createPromotion(type, config)         │
  └─────────────────────────────────────────┘
```

**案例 2：报表生成系统**

```
需求：
  1. 多种数据源（数据库、API、文件）
  2. 多种输出格式（PDF、Excel、HTML）
  3. 多种报表模板（汇总、明细、图表）

分析：
  数据源变化 → 策略模式
  输出格式变化 → 策略模式
  模板与格式的关系 → 桥接模式

方案：
  ┌──────────────────────────────────────────┐
  │        ReportGenerator                   │
  │  ┌──────────────────┐ ┌───────────────┐  │
  │  │ DataSource(策略)  │ │ ReportFormat  │  │
  │  │  ├ DatabaseSource │ │  (桥接)       │  │
  │  │  ├ ApiSource      │ │  ├ PdfFormat  │  │
  │  │  └ FileSource     │ │  ├ ExcelFormat│  │
  │  │                   │ │  └ HtmlFormat │  │
  │  └──────────────────┘ └───────────────┘  │
  │  Template (模板方法):                     │
  │    1. loadData()                         │
  │    2. transform()                        │
  │    3. render()                           │
  └──────────────────────────────────────────┘
```

## 28.2 代码重构与设计模式

### 28.2.1 模式导引的重构步骤

将现有代码重构为设计模式的七个步骤：

```
第1步：编写/运行测试，锁定行为
  → 确保重构前后行为一致

第2步：识别适用的模式
  → 根据代码中的"痛苦信号"识别模式

第3步：提取接口/抽象类
  → 定义模式的参与者接口

第4步：实现模式的参与者
  → 创建具体的参与者类

第5步：逐个迁移客户端
  → 每次迁移一个客户端，运行测试验证

第6步：删除旧代码
  → 确认所有客户端迁移完成后删除

第7步：运行全部测试
  → 确保重构没有引入回归
```

### 28.2.2 完整重构案例：订单处理系统

**重构前**：if-else 满天飞的订单处理（200 行）

```java
public class OrderProcessor {
    public double process(Order order) {
        // 1. 验证订单
        if (order == null) {
            throw new IllegalArgumentException("订单不能为空");
        }
        if (order.getItems() == null || order.getItems().isEmpty()) {
            throw new IllegalArgumentException("订单项不能为空");
        }

        // 2. 计算价格（各种促销策略混杂在 if-else 中）
        double total = 0;
        for (Item item : order.getItems()) {
            double price = item.getPrice() * item.getQuantity();

            // 促销逻辑混合在价格计算中
            String promotion = item.getPromotion();
            if ("BUY_ONE_GET_ONE".equals(promotion)) {
                // 买一送一：数量减半
                price = item.getPrice() * Math.ceil(item.getQuantity() / 2.0);
            } else if ("DISCOUNT_10".equals(promotion)) {
                price = price * 0.9;
            } else if ("DISCOUNT_20".equals(promotion)) {
                price = price * 0.8;
            } else if ("FULL_100_MINUS_20".equals(promotion)) {
                if (price >= 100) {
                    price -= 20;
                }
            }
            // 每加一种促销都要在这里加 else if

            total += price;
        }

        // 3. 计算运费（各种配送方式混杂）
        String shipping = order.getShippingMethod();
        double shippingCost;
        if ("standard".equals(shipping)) {
            shippingCost = total > 100 ? 0 : 10;
        } else if ("express".equals(shipping)) {
            shippingCost = 20;
        } else if ("overnight".equals(shipping)) {
            shippingCost = 50;
        } else {
            shippingCost = 15;
        }

        // 4. 会员折扣
        String memberLevel = order.getMemberLevel();
        if ("GOLD".equals(memberLevel)) {
            total = total * 0.9;
        } else if ("SILVER".equals(memberLevel)) {
            total = total * 0.95;
        }

        total += shippingCost;

        // 5. 更新库存（混合在订单处理中）
        for (Item item : order.getItems()) {
            // 更新数据库库存
            System.out.println("更新库存: " + item.getProductId());
        }

        // 6. 发送通知
        System.out.println("发送订单确认邮件");

        return total;
    }
}
```

**重构过程**：

**步骤 1-2**：写测试，识别模式

订单处理中至少可以提取三个模式：
- 促销计算 → 策略模式
- 运费计算 → 策略模式
- 库存更新/通知 → 观察者模式或责任链

**步骤 3-4**：提取接口并实现

```java
// ============ 促销策略 ============
public interface PromotionStrategy {
    double calculate(Item item);
    boolean supports(String promotionType);
}

public class BuyOneGetOnePromotion implements PromotionStrategy {
    @Override
    public boolean supports(String type) {
        return "BUY_ONE_GET_ONE".equals(type);
    }

    @Override
    public double calculate(Item item) {
        int effectiveQuantity = (int) Math.ceil(item.getQuantity() / 2.0);
        return item.getPrice() * effectiveQuantity;
    }
}

public class DiscountPromotion implements PromotionStrategy {
    private final double discountRate;
    private final String type;

    public DiscountPromotion(double discountRate, String type) {
        this.discountRate = discountRate;
        this.type = type;
    }

    @Override
    public boolean supports(String type) {
        return this.type.equals(type);
    }

    @Override
    public double calculate(Item item) {
        return item.getPrice() * item.getQuantity() * discountRate;
    }
}

public class FullReductionPromotion implements PromotionStrategy {
    @Override
    public boolean supports(String type) {
        return "FULL_100_MINUS_20".equals(type);
    }

    @Override
    public double calculate(Item item) {
        double price = item.getPrice() * item.getQuantity();
        if (price >= 100) {
            price -= 20;
        }
        return price;
    }
}

// ============ 运费策略 ============
public interface ShippingCostStrategy {
    double calculate(double orderTotal);
    String getMethod();
}

public class StandardShipping implements ShippingCostStrategy {
    @Override
    public String getMethod() { return "standard"; }

    @Override
    public double calculate(double orderTotal) {
        return orderTotal > 100 ? 0 : 10;
    }
}

public class ExpressShipping implements ShippingCostStrategy {
    @Override
    public String getMethod() { return "express"; }

    @Override
    public double calculate(double orderTotal) {
        return 20;
    }
}

// ============ 会员折扣策略 ============
public interface MemberDiscountStrategy {
    double apply(double total, String memberLevel);
    boolean supports(String memberLevel);
}

public class GoldMemberDiscount implements MemberDiscountStrategy {
    @Override
    public boolean supports(String level) { return "GOLD".equals(level); }

    @Override
    public double apply(double total, String memberLevel) {
        return total * 0.9;
    }
}

public class SilverMemberDiscount implements MemberDiscountStrategy {
    @Override
    public boolean supports(String level) { return "SILVER".equals(level); }

    @Override
    public double apply(double total, String memberLevel) {
        return total * 0.95;
    }
}

// ============ 订单事件监听（观察者模式） ============
public interface OrderEventListener {
    void onOrderProcessed(Order order);
}

public class InventoryUpdater implements OrderEventListener {
    @Override
    public void onOrderProcessed(Order order) {
        for (Item item : order.getItems()) {
            System.out.println("更新库存: " + item.getProductId());
        }
    }
}

public class NotificationService implements OrderEventListener {
    @Override
    public void onOrderProcessed(Order order) {
        System.out.println("发送订单确认邮件");
    }
}
```

**步骤 5-7**：迁移客户端

```java
// ============ 重构后的订单处理器 ============
public class OrderProcessor {
    private final List<PromotionStrategy> promotions;
    private final List<ShippingCostStrategy> shippingCosts;
    private final List<MemberDiscountStrategy> memberDiscounts;
    private final List<OrderEventListener> listeners;

    public OrderProcessor(
            List<PromotionStrategy> promotions,
            List<ShippingCostStrategy> shippingCosts,
            List<MemberDiscountStrategy> memberDiscounts,
            List<OrderEventListener> listeners) {
        this.promotions = promotions;
        this.shippingCosts = shippingCosts;
        this.memberDiscounts = memberDiscounts;
        this.listeners = listeners;
    }

    public double process(Order order) {
        // 1. 验证
        validate(order);

        // 2. 计算商品价格（策略模式）
        double total = calculateItemTotal(order);

        // 3. 计算运费（策略模式）
        double shippingCost = calculateShipping(order, total);

        // 4. 会员折扣（策略模式）
        total = applyMemberDiscount(total, order.getMemberLevel());

        // 5. 最终价格
        double finalTotal = total + shippingCost;

        // 6. 通知监听者（观察者模式）
        notifyListeners(order);

        return finalTotal;
    }

    private void validate(Order order) {
        if (order == null) {
            throw new IllegalArgumentException("订单不能为空");
        }
        if (order.getItems() == null || order.getItems().isEmpty()) {
            throw new IllegalArgumentException("订单项不能为空");
        }
    }

    private double calculateItemTotal(Order order) {
        double total = 0;
        for (Item item : order.getItems()) {
            double price = item.getPrice() * item.getQuantity();
            // 查找匹配的促销策略
            for (PromotionStrategy promo : promotions) {
                if (promo.supports(item.getPromotion())) {
                    price = promo.calculate(item);
                    break;
                }
            }
            total += price;
        }
        return total;
    }

    private double calculateShipping(Order order, double total) {
        for (ShippingCostStrategy shipping : shippingCosts) {
            if (shipping.getMethod().equals(order.getShippingMethod())) {
                return shipping.calculate(total);
            }
        }
        throw new IllegalArgumentException("未知配送方式: " + order.getShippingMethod());
    }

    private double applyMemberDiscount(double total, String memberLevel) {
        for (MemberDiscountStrategy discount : memberDiscounts) {
            if (discount.supports(memberLevel)) {
                return discount.apply(total, memberLevel);
            }
        }
        return total; // 无折扣
    }

    private void notifyListeners(Order order) {
        for (OrderEventListener listener : listeners) {
            listener.onOrderProcessed(order);
        }
    }
}

// ============ 客户端 ============
public class OrderProcessorDemo {
    public static void main(String[] args) {
        OrderProcessor processor = new OrderProcessor(
            List.of(
                new BuyOneGetOnePromotion(),
                new DiscountPromotion(0.9, "DISCOUNT_10"),
                new DiscountPromotion(0.8, "DISCOUNT_20"),
                new FullReductionPromotion()
            ),
            List.of(
                new StandardShipping(),
                new ExpressShipping()
            ),
            List.of(
                new GoldMemberDiscount(),
                new SilverMemberDiscount()
            ),
            List.of(
                new InventoryUpdater(),
                new NotificationService()
            )
        );

        double result = processor.process(order);
        System.out.println("订单总金额: " + result);
    }
}
```

## 28.3 开源框架中的设计模式解析

### 28.3.1 Spring 框架模式地图

```java
// ============ IoC 容器 = 工厂模式 + 单例模式 ============
// BeanFactory 是工厂模式
// 默认 Scope "singleton" 是单例模式
BeanFactory factory = new ClassPathXmlApplicationContext("beans.xml");
MyService service = factory.getBean(MyService.class);
// factory.getBean() 根据配置创建或查找 Bean，典型的工厂方法

// ============ AOP = 代理模式 + 装饰器模式 + 责任链模式 ============
@Aspect
public class LoggingAspect {
    @Around("execution(* com.example.*.*(..))")
    public Object log(ProceedingJoinPoint pjp) throws Throwable {
        System.out.println("方法调用前: " + pjp.getSignature());
        Object result = pjp.proceed();  // 调用下一个拦截器或目标方法
        System.out.println("方法调用后: " + result);
        return result;
    }
}
// AOP 拦截器链是责任链模式
// 动态代理是代理模式
// 可追加多个 Aspect 是装饰器模式

// ============ DispatcherServlet = 前端控制器模式 + 中介者模式 ============
// DispatcherServlet 接收所有请求，分发给合适的 Controller
// 类似于中介者——统一管理 Servlet 和 Controller 之间的交互
@Controller
public class UserController {
    @GetMapping("/users/{id}")
    public String getUser(@PathVariable Long id) {
        return "user";
    }
}

// ============ ApplicationListener = 观察者模式 ============
@Component
public class MyEventListener {
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        System.out.println("订单创建事件: " + event.getOrderId());
    }
}
// 发布事件：applicationEventPublisher.publishEvent(event)

// ============ JdbcTemplate = 模板方法模式 ============
// JdbcTemplate 固定了数据库操作的骨架
// 回调（RowMapper、PreparedStatementCallback）是模板方法中的"钩子"
jdbcTemplate.query(
    "SELECT * FROM users WHERE age > ?",
    new Object[]{18},
    (rs, rowNum) -> new User(
        rs.getLong("id"),
        rs.getString("name"),
        rs.getInt("age")
    )
);

// ============ HandlerInterceptor = 责任链模式 ============
public class AuthInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {
        String token = request.getHeader("Authorization");
        if (token == null) {
            response.setStatus(401);
            return false;  // 终止链
        }
        return true;  // 继续链
    }
}

// ============ BeanPostProcessor = 观察者模式/装饰器模式 ============
@Component
public class MyBeanPostProcessor implements BeanPostProcessor {
    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) {
        if (bean instanceof MyService) {
            System.out.println("Bean初始化前: " + beanName);
        }
        return bean;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // 可以返回装饰后的对象
        if (bean instanceof MyService) {
            return new MyServiceDecorator((MyService) bean);
        }
        return bean;
    }
}
```

### 28.3.2 MyBatis 模式地图

```java
// ============ SqlSessionFactory = 工厂方法模式 ============
// SqlSessionFactory 创建 SqlSession
// 每个 SqlSession 代表一次数据库会话
SqlSessionFactory factory = new SqlSessionFactoryBuilder()
    .build(inputStream);
SqlSession session = factory.openSession();

// ============ MapperProxy = 动态代理模式 ============
// MyBatis 为 Mapper 接口生成动态代理对象
// 代理拦截接口方法调用，执行对应的 SQL
UserMapper mapper = session.getMapper(UserMapper.class);
// mapper 是 JDK 动态代理生成的代理对象
// MapperProxy.invoke() 拦截方法调用

// ============ Executor = 模板方法模式 ============
// BaseExecutor 定义了执行骨架：
// 1. 检查一级缓存
// 2. 从数据库查询
// 3. 填充缓存
// 子类（SimpleExecutor、BatchExecutor）实现具体细节

// ============ CachingExecutor = 装饰器模式 ============
// CachingExecutor 装饰 BaseExecutor
// 添加二级缓存功能，不改变原执行器的逻辑
Executor executor = new CachingExecutor(new SimpleExecutor());

// ============ Plugin 插件 = 责任链模式 ============
@Intercepts({
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
public class MyPlugin implements Interceptor {
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        System.out.println("拦截 Executor.update()");
        return invocation.proceed();  // 继续责任链
    }
}
```

### 28.3.3 Netty 模式地图

```java
// ============ ChannelPipeline = 责任链模式 ============
// ChannelHandler 按顺序组成链
// 每个 Handler 处理或转发事件
ChannelPipeline pipeline = channel.pipeline();
pipeline.addLast("decoder", new StringDecoder());
pipeline.addLast("encoder", new StringEncoder());
pipeline.addLast("handler", new MyBusinessHandler());

// ============ CompositeByteBuf = 组合模式 ============
// 将多个 ByteBuf 组合成一个逻辑上的 ByteBuf
// 对使用者透明——像操作一个 ByteBuf 一样操作多个
CompositeByteBuf composite = Unpooled.compositeBuffer();
composite.addComponent(true, buffer1);
composite.addComponent(true, buffer2);
// 读取时自动在多个 buffer 之间切换

// ============ ChannelFuture = 观察者模式/Promise 模式 ============
// ChannelFuture 添加监听器，在操作完成时回调
channel.writeAndFlush(data).addListener(future -> {
    if (future.isSuccess()) {
        System.out.println("发送成功");
    } else {
        System.out.println("发送失败: " + future.cause());
    }
});
```

## 28.4 设计模式在系统架构中的应用

### 28.4.1 API 网关 = 外观模式（Facade）

```java
// API 网关为微服务集群提供统一入口
// 隐藏了后端服务的复杂性
// 类似于外观模式——简化客户端与子系统的交互

// 网关的职责：
// 1. 统一入口：所有 API 请求先到网关
// 2. 请求路由：将请求转发到对应的微服务
// 3. 认证鉴权：统一认证
// 4. 限流熔断：防止流量冲击

// Facade 模式在网关中的体现：
// 客户端 → API网关(Facade) → 多个微服务(子系统)
```

### 28.4.2 服务发现 = 观察者模式 + 注册表

```java
// 服务注册中心维护可用服务列表
// 服务提供者注册/注销时通知消费者

// 观察者模式：
// 服务提供者（Subject）：register(), unregister()
// 服务消费者（Observer）：onServiceChange()
// 注册中心（Mediator）：维护服务列表，通知变更

// 实际案例：Consul, Zookeeper, Eureka
```

### 28.4.3 熔断器 = 代理模式 + 状态模式

```java
// 熔断器封装对远程服务的调用
// 内部维护状态机：关闭→打开→半开

// 代理模式：熔断器代理远程调用，控制访问
// CircuitBreaker proxy = new CircuitBreaker(realService);

// 状态模式：三种状态决定行为
// CLOSED（关闭）→ 正常调用
// OPEN（打开）→ 快速失败
// HALF_OPEN（半开）→ 尝试恢复

// 状态转换：
// CLOSED → (失败次数超阈值) → OPEN
// OPEN → (等待超时) → HALF_OPEN
// HALF_OPEN → (调用成功) → CLOSED
// HALF_OPEN → (调用失败) → OPEN

// 实际案例：Hystrix, Resilience4j
```

### 28.4.4 事件溯源 = 备忘录模式 + 命令模式

```java
// 事件溯源将状态变化记录为事件序列
// 当前状态 = 所有历史事件的累加结果

// 备忘录模式：每个事件都是系统状态的一个快照
// 命令模式：每个事件封装了一次操作

// 优势：
// 1. 完整审计日志——知道每一步发生了什么
// 2. 时间旅行——可以重建任意时刻的状态
// 3. 事件重放——可以回放事件来测试

// 实际案例：EventStore, Axon Framework
```

### 28.4.5 特性开关 = 策略模式

```java
// 特性开关根据不同条件选择不同策略

// 本质：if/else 的"可配置"版本
// 将条件判断从代码移到配置中心

public interface FeatureToggleStrategy {
    boolean isEnabled(String featureName, User user);
}

public class PercentageRolloutStrategy implements FeatureToggleStrategy {
    private final int percentage;  // 0-100

    @Override
    public boolean isEnabled(String featureName, User user) {
        // 根据用户ID哈希决定是否开启
        return Math.abs(user.getId().hashCode()) % 100 < percentage;
    }
}

public class WhitelistStrategy implements FeatureToggleStrategy {
    private final Set<String> whitelist;

    @Override
    public boolean isEnabled(String featureName, User user) {
        return whitelist.contains(user.getId());
    }
}

// 实际案例：LaunchDarkly, Togglz
```

### 28.4.6 架构模式总结

| 架构组件 | 核心设计模式 | 解决的核心问题 |
|---------|------------|--------------|
| API 网关 | Facade | 简化客户端调用 |
| 服务发现 | Observer | 动态感知服务变化 |
| 熔断器 | State + Proxy | 防止级联故障 |
| 事件溯源 | Memento + Command | 完整审计与状态重建 |
| 特性开关 | Strategy | 灰度发布与A/B测试 |
| 配置中心 | Observer | 动态配置推送 |
| 消息队列 | Mediator | 异步解耦服务间通信 |
| 缓存 | Proxy | 加速数据访问 |

## 28.5 本章小结

设计模式的应用能力不是一蹴而就的，需要经过"理论→实践→反思→再实践"的循环。

**选择模式**的关键不是记忆 23 种模式的定义，而是学会**分析问题**——识别变化轴和稳定核心，判断解耦方向，理解灵活性的时机。

**重构到模式**的核心是**测试保障**——在没有测试的代码上应用模式是危险的。先写测试，锁定行为，然后逐步提取接口和实现。

**识别框架模式**是提升架构理解力的捷径——当你发现 Spring AOP 是代理+责任链的组合，MyBatis Mapper 是动态代理时，对框架的理解就从"黑盒"变成了"白盒"。
