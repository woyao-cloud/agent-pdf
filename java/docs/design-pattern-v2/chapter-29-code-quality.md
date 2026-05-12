# 第29章 设计模式与代码质量

设计模式对代码质量的影响是双面的。正确使用时，它们是提升可维护性、可读性的利器；滥用时，它们反而引入不必要的复杂度。本章从可维护性、性能、设计原则、学习路径四个维度分析设计模式与代码质量的关系。

## 29.1 设计模式对可维护性的影响

### 29.1.1 正面影响：可预测的结构

设计模式提供了通用的"模式词汇"，使代码结构可预测，降低认知负担。

**Case 1：策略模式使新增算法可预测**

```java
// 没有策略模式：新增算法需要修改核心逻辑
public class PriceCalculator {
    // 每新增一种价格计算方式，都要在这里加 else if
    public double calculate(String type, double basePrice) {
        if ("normal".equals(type)) return basePrice;
        else if ("vip".equals(type)) return basePrice * 0.9;
        else if ("promotion".equals(type)) return basePrice * 0.8;
        else if ("clearance".equals(type)) return basePrice * 0.5;
        // ...
    }
}

// 使用策略模式：新增算法只需添加新类
// 开发者看到新的定价需求时，知道该做什么：
// "哦，这是策略模式，我需要创建一个新的 PricingStrategy 实现类"
// 不需要修改任何现有代码
public class NewYearPromotionStrategy implements PricingStrategy {
    @Override
    public double calculate(double basePrice) {
        return basePrice * 0.7;
    }
}
```

**Case 2：观察者模式使事件处理松耦合**

```java
// 观察者模式解耦了事件发布者和事件处理者
// 新增事件处理逻辑不需要修改发布者
eventBus.register(UserRegisteredEvent.class, event -> {
    smsService.sendWelcomeSms(event.getPhone());
});
eventBus.register(UserRegisteredEvent.class, event -> {
    emailService.sendWelcomeEmail(event.getEmail());
});
eventBus.register(UserRegisteredEvent.class, event -> {
    loyaltyService.initializePoints(event.getUserId());
});
```

### 29.1.2 正面影响：关注点分离

设计模式强制分离不同职责：

```
模式         → 什么职责被分离了
Strategy     → 算法选择与算法实现
Observer     → 事件发布与事件处理
Decorator    → 核心功能与增强功能
Factory      → 对象创建与对象使用
Composite    → 单个对象与组合对象的处理
Command      → 请求的发送者与执行者
Mediator     → 对象之间的交互逻辑
```

### 29.1.3 负面影响：过度工程

```java
// 一个简单的配置读取，模式狂热症的"杰作"
// 20 行能解决的问题，用了 5 个设计模式：

// 1. 策略模式——"万一有多种读取方式呢？"
public interface ConfigReader {
    Properties read(String path);
}

// 2. 工厂模式——"需要创建不同的 ConfigReader"
public class ConfigReaderFactory {
    public static ConfigReader create(String type) {
        if ("file".equals(type)) return new FileConfigReader();
        throw new IllegalArgumentException("未知类型: " + type);
    }
}

// 3. 装饰器模式——"需要添加缓存功能"
public class CachedConfigReader implements ConfigReader {
    private final ConfigReader wrapped;
    private final Map<String, Properties> cache = new HashMap<>();

    public CachedConfigReader(ConfigReader wrapped) { this.wrapped = wrapped; }
    @Override
    public Properties read(String path) {
        return cache.computeIfAbsent(path, wrapped::read);
    }
}

// 4. 单例模式——"配置只需要读取一次"
public class ConfigManager {
    private static final ConfigManager INSTANCE = new ConfigManager();
    private final Properties props = new Properties();

    private ConfigManager() {
        ConfigReader reader = new CachedConfigReader(
            ConfigReaderFactory.create("file"));
        this.props.putAll(reader.read("config.properties"));
    }

    public static ConfigManager getInstance() { return INSTANCE; }
    public String get(String key) { return props.getProperty(key); }
}

// 5. 模板方法——"虚拟机的配置读取过程"
public abstract class AbstractConfigInitializer {
    public final void init() {
        validate();
        load();
        register();
    }
    protected abstract void load();
    protected void validate() { /* 默认空实现 */ }
    protected void register() { /* 默认空实现 */ }
}

// 而实际上，只需要一行：
Properties props = new Properties();
props.load(Files.newInputStream(Paths.get("config.properties")));
```

### 29.1.4 可维护性度量

研究数据显示，模式使用与维护成本呈 U 型曲线：

```
维护成本
   ^
   |    过度使用（模式狂热）
   |       \
   |        \
   |         适度使用（最佳区域）
   |            \
   |             \
   |              不使用模式
   +---------------------------------> 模式使用程度

结论：
  - 完全不使用模式：系统随着规模增长迅速退化
  - 适度使用模式（关键位置）：维护成本最低
  - 过度使用模式：维护成本反而上升（理解成本 + 间接层数）
```

具体度量指标对比：

```
指标                   不使用模式          适度使用模式        过度使用模式
──────────────────────────────────────────────────────────────
平均类行数              1500+              300-500            80-120
圈复杂度（每个方法）     10-15              3-5                2-3
耦合度                 高（直接依赖）      中（接口依赖）      低（但太多类）
新增功能修改文件数      3-5 个              1-2 个              1 个
新人上手时间            2 天               1 天                3 天（理解抽象链）
测试编写难度            难（耦合度高）      易（可依赖接口）     中（需要 mock 多）
```

## 29.2 设计模式对性能的影响

### 29.2.1 间接层开销

设计模式通过增加间接层来解耦，每层间接调用都有性能开销：

```java
// 直接调用（无模式）：零开销
public class Service {
    public void execute() {
        // 核心逻辑
    }
}
Service service = new Service();
service.execute();

// 装饰器模式：3 层间接调用
// 增加 3 层方法调用 + 3 次动态分派
Service service = new LoggingDecorator(
    new TimingDecorator(
        new Service()
    )
);
service.execute();
// 调用链：LoggingDecorator.execute()
//        → TimingDecorator.execute()
//          → Service.execute()
//            → 核心逻辑
//          ← 返回
//        ← 返回
//      ← 返回
// 每层约 5-10ns，3 层约 15-30ns
```

### 29.2.2 各模式性能基准

以下为粗略基准（JVM warm-up 后，纳秒级）：

```
模式           主要性能开销                    大致范围        优化建议
─────────────────────────────────────────────────────────────────
Proxy          动态代理反射调用                50-200ns      使用字节码增强（如CGLIB）
Decorator      嵌套方法调用                    5-10ns/层     控制嵌套层数 ≤ 3
Observer       遍历观察者列表                  5ns/观察者    异步批处理
Command        对象分配 + GC 压力              20-50ns/对象  对象池复用
Flyweight      共享池 HashMap 查找            50-100ns      使用数组索引代替 HashMap
Singleton      synchronized                  50ns(无竞争)   使用 CAS（如 Holder 模式）
Prototype      clone() vs new()               视情况决定    复杂对象用 clone，简单用 new
Strategy       接口方法调用                    5ns/次       比 if-else 差约 2-5ns
Template       抽象方法调用                    5ns/次       几乎无差别
Visitor        双分派                         10-15ns/次    比 instanceof 快
```

### 22.2.3 性能测量示例

```java
// 策略模式 vs if-else 性能对比
public class PerformanceBenchmark {
    private static final int ITERATIONS = 10_000_000;

    // 策略模式版本
    public interface DiscountStrategy {
        double apply(double price);
    }

    static class VipDiscount implements DiscountStrategy {
        public double apply(double price) { return price * 0.9; }
    }

    // if-else 版本
    public static double calculateWithIfElse(String type, double price) {
        if ("vip".equals(type)) return price * 0.9;
        else if ("normal".equals(type)) return price;
        return price;
    }

    public static void main(String[] args) {
        // 预热 JVM
        for (int i = 0; i < 100000; i++) {
            calculateWithIfElse("vip", 100);
        }

        DiscountStrategy strategy = new VipDiscount();

        long start = System.nanoTime();
        for (int i = 0; i < ITERATIONS; i++) {
            strategy.apply(100);
        }
        long strategyTime = System.nanoTime() - start;

        start = System.nanoTime();
        for (int i = 0; i < ITERATIONS; i++) {
            calculateWithIfElse("vip", 100);
        }
        long ifElseTime = System.nanoTime() - start;

        System.out.printf("策略模式: %d ns%n", strategyTime / ITERATIONS);
        System.out.printf("if-else:  %d ns%n", ifElseTime / ITERATIONS);
        // 通常差距在 2-5ns 以内
        // 在大多数业务系统中可以忽略不计
    }
}
```

### 29.2.4 性能优先时的策略

某些场景下，性能比模式更重要：

```java
// 场景 1：热点循环中避免装饰器/代理链
// 不良：循环内多次通过装饰器链
double total = 0;
for (Order order : orders) {
    // 每次循环都经过多层装饰器
    total += decoratedProcessor.process(order);
}

// 改进：批量处理后单次装饰
List<Double> results = decoratedProcessor.processBatch(orders);
double total = results.stream().mapToDouble(Double::doubleValue).sum();

// 场景 2：实时系统最小化对象分配
// 命令模式会产生大量命令对象
// 使用对象池或 Flyweight 复用命令对象
public class CommandPool {
    private final Queue<Command> pool = new ConcurrentLinkedQueue<>();

    public Command acquire() {
        Command cmd = pool.poll();
        return cmd != null ? cmd : new Command();
    }

    public void release(Command cmd) {
        cmd.reset();
        pool.offer(cmd);
    }
}

// 场景 3：高并发避免 synchronized Singleton
// 用 Holder 模式替代方法级别 synchronized
public class Config {
    private Config() {}

    // 利用类加载机制保证线程安全
    private static class Holder {
        static final Config INSTANCE = new Config();
    }

    public static Config getInstance() {
        return Holder.INSTANCE;  // 无锁！
    }
}
```

## 29.3 设计原则与设计模式的权衡

### 29.3.1 原则冲突

设计模式试图同时遵循多个设计原则，但在实践中原则之间常有冲突：

**SRP（单一职责）vs 类数量**

```java
// 严格遵循 SRP：每个类一个职责
// OrderService 只负责"处理订单"
// 但需要依赖 10 个其他类来完成
public class OrderService {
    private final OrderValidator validator;
    private final PriceCalculator priceCalc;
    private final InventoryManager inventory;
    private final PaymentGateway payment;
    private final ShippingService shipping;
    private final NotificationService notification;
    // ...

    public void processOrder(Order order) {
        validator.validate(order);
        double price = priceCalc.calculate(order);
        inventory.reserve(order.getItems());
        payment.charge(order.getUserId(), price);
        shipping.arrange(order);
        notification.send(order);
    }
}

// 原则冲突点：
// SRP 通过 → OrderService 只"协调处理流程"
// SRP 不通过 → 但依赖太多，对 OrderService 的修改会因任一依赖变更而受影响
// 类数量膨胀 → 每多一个职责就多一个类
```

**OCP（开闭）vs YAGNI（你不会需要它）**

```java
// OCP 要求：对扩展开放，对修改关闭
// 实现方式：提前定义接口，为未来扩展预留

// 但是 YAGNI 要求：不要为可能不需要的功能提前设计

// 冲突点：
// 遵循 OCP：支付方式加接口（即使目前只有支付宝）
// 遵循 YAGNI：先用具体类（等需要第二种支付方式时再提取接口）

// 平衡方案：
// 1. 用"三击法则"——第三次重复时提取
// 2. 如果接口是公开 API，尽早提取（因为修改公开 API 成本高）
// 3. 如果是内部实现，先写具体类
```

**DIP（依赖倒置）vs 简单性**

```java
// DIP 要求：依赖抽象而非具体实现
// 但每个抽象层都增加理解成本

// 遵循 DIP（单一实现时）：
public interface UserRepository {
    User findById(Long id);
}

public class JpaUserRepository implements UserRepository {
    @Override
    public User findById(Long id) { /* JPA 实现 */ }
}

// 简单性（单一实现时）：
public class JpaUserRepository {
    public User findById(Long id) { /* JPA 实现 */ }
}

// 哪个更好？
// 如果是微服务内的内部代码 → 简单性优先
// 如果是公共库/框架代码 → DIP 优先
```

**ISP（接口隔离）vs 实用性**

```java
// ISP 要求：接口应该小且专一
// 但实践中不要为"未来可能的不同客户端"提前拆分接口

// 过度 ISP（反例）：
public interface Savable { void save(); }
public interface Deletable { void delete(); }
public interface Updatable { void update(); }
public interface Findable { void find(); }

public class UserRepository implements Savable, Deletable, Updatable, Findable {
    // 实现所有方法
}

// 更务实的方式：
public interface UserRepository {
    void save();
    void delete();
    void update();
    User find(Long id);
}
// 当真正有多个客户端需要不同接口时再拆分
```

### 29.3.2 决策框架

在原则冲突时，使用以下框架做出判断：

```
是否使用某个模式的决策框架：

1. 这个模式是否能向同事解释清楚？
   - 如果不能简洁解释 → 可能过度设计了
   - 如果能 → 继续判断

2. 使用这个模式让代码更容易修改还是更难修改？
   - 更难修改（需要了解多层抽象）→ 不要用
   - 更容易修改（新增功能只需添加新类）→ 继续判断

3. 如果现在移除这个模式，会破坏什么？
   - 会破坏大量测试 → 模式有价值
   - 几乎不影响 → 可能是过度设计

4. 这个场景未来 6 个月变化的可能性有多大？
   - 几乎不会变 → 不要使用模式
   - 很可能变 → 值得使用模式
```

### 29.3.3 实用主义原则

```java
// 实用主义原则 1：为变化付费，而不是为先见之明付费
//
// 当变化发生时重构到模式，而不是提前预测变化

// 实用主义原则 2：先在"痛点"区域应用模式
//
// 不必全项目统一使用模式
// 只在"频繁修改"、"经常出 bug"、"if-else 不断增长"的地方使用

// 实用主义原则 3：模式是沟通工具，不是强制规范
//
// 当团队中大部分人不理解某个模式时
// 使用该模式会降低而非提高沟通效率

// 实用主义原则 4：延迟决策
//
// 可以做到的灵活叫"可扩展"
// 没做到但可以轻松做到的叫"可重构"
// 重构到模式通常比开始就使用模式更好
```

## 29.4 持续学习路径

### 29.4.1 模式掌握的四个阶段

每个设计模式的学习都要经历从无知到智慧的四个阶段：

```
阶段 1：无知
  "模式？不需要，直接写代码就行。"
  特征：重复造轮子，代码中充满 if-else
  风险：系统规模增长后难以维护

阶段 2：狂热
  "这个也应该是策略模式，那个也应该是工厂模式..."
  特征：所有地方都用模式，200 行代码用 5 个模式
  风险：过度工程，简单问题复杂化

阶段 3：幻灭
  "模式都是骗人的！用了反而更难维护。"
  特征：被过度设计伤害过，对模式持否定态度
  风险：否定模式的合理价值，回到"阶段 1"

阶段 4：智慧
  "这个问题的变化轴是订单状态流转，用 State 模式比较合适。"
  "那个问题只是两种算法选择，一个 if-else 就够了，不需要模式。"
  特征：把模式当工具包，在合适的地方选择合适的工具
  状态：终于真正掌握了模式
```

### 29.4.2 推荐学习路径

```
第一阶段：建立理论基础（1-2 个月）

  书籍推荐：
    1. 《Head First 设计模式》—— 以直观的方式介绍模式，适合入门
    2. 《大话设计模式》—— 中文通俗读物，故事性强
    3. 《设计模式：可复用面向对象软件的基础》（GoF 原版）
       —— 理论经典，适合作为参考书，不适合通读

  学习方法：
    - 每次学习 2-3 个模式
    - 编写简单的控制台程序实践
    - 不要试图一次学完 23 个模式

第二阶段：在实践中验证（3-6 个月）

  实践方法：
    1. 在项目中识别模式——代码中有没有可以用模式改进的地方？
    2. 重构一小块代码到模式——从"三击"开始
    3. 写博客或笔记记录心得——输出是最好的学习

  注意：
    - 不要大规模重构现有项目
    - 从非核心模块开始尝试
    - 确保有完整的测试覆盖

第三阶段：阅读框架源码（6-12 个月）

  阅读顺序：
    1. JDK 源码（java.util.Collections、java.io、java.nio）
    2. Spring Framework（IoC、AOP、MVC 模块）
    3. MyBatis（SQL 映射框架）
    4. Netty（网络编程框架）
    5. JUnit（测试框架）

  方法：
    - 带着"这个类扮演什么模式角色"的问题去读
    - 画出类图理解结构
    - 在调试器中跟踪执行流程

第四阶段：教导他人（12 个月以上）

  为什么教导是最有效的学习方式：
    - 你需要把模糊的理解转化为清晰的表述
    - 你需要回答学生提出的各种"为什么"——这促使你思考
    - 你会发现自己理解的盲点

  教导方式：
    - 团队内部分享
    - 写技术博客
    - 贡献开源项目，在 PR 中讨论设计决策
    - Code Review 中讨论模式的合理使用
```

### 29.4.3 开源贡献中的模式讨论

贡献开源项目时，设计师通常会讨论模式的使用：

```
PR 审查对话示例：

审查者: "这里为什么要用 Visitor 模式？我们只有 3 种元素类型，
        每种只有 2 种操作，switch 就够了。"

提交者: "因为近期计划增加第 4 和第 5 种操作，
        用 Visitor 可以在不修改元素类的前提下新增操作。"

审查者: "有道理，但建议加上 AbstractVisitor 默认实现，
        这样新增元素类型时不会破坏现有访问者。"

提交者: "好主意，我加一个 DefaultVisitor。"
```

在实际的开源项目讨论中学习模式的最佳用法，是提升模式应用能力的最佳途径。

### 29.4.4 持续学习建议

```
日常学习习惯：

1. 每日：在现有代码中识别模式
   看到 new XXX() → 是不是工厂模式？
   看到 implements → 是不是策略模式？
   看到 List<Handler> → 是不是责任链模式？

2. 每周：重构 1 处代码到模式
   选择一处"if-else 增长"的地方
   用策略模式或状态模式重构
   感受重构前后的区别

3. 每月：分析 1 个开源类的模式使用
   选择 Spring/MyBatis 中的一个类
   画出它的类图
   标注每个类的模式角色

4. 每季：回顾之前的使用
   翻看 3 个月前写的代码
   那些"觉得用得好的模式"是否真的有用？
   那些"当时觉得过度设计"的是否合理？
```

### 29.4.5 模式学习的最终目标

| 技能层次 | 表现 | 所需时间 |
|---------|------|---------|
| 认识模式 | 能说出 23 种模式的名称和定义 | 1-2 个月 |
| 使用模式 | 能在项目中正确实现具体模式 | 3-6 个月 |
| 组合模式 | 能组合多个模式解决复杂问题 | 6-12 个月 |
| 识别模式 | 能在框架源码中快速识别模式角色 | 12-18 个月 |
| 反思模式 | 能判断何时不该使用模式 | 18-24 个月 |
| 超越模式 | 理解模式背后的设计原则，创造自己的模式 | 24 个月以上 |

## 29.5 本章小结

设计模式与代码质量的关系不是线性的。适度使用模式能显著提升可维护性，但过度使用会引入不必要的复杂度。

**关键结论**：

1. 模式是工具，不是目标。为目标服务，而非为目标本身。
2. 模式带来间接层，间接层带来性能开销。在性能关键的代码中谨慎使用。
3. 设计原则之间常有冲突，实用主义比教条主义更重要。
4. 模式学习是分阶段的，每个阶段都有自己的盲点。唯一走出盲点的方法是实践和反思。

最终，最好的"模式"是**知道什么时候不需要模式**。能写简单、直接的代码解决复杂问题，比应用一堆模式更考验真功夫。
