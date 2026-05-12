# 第26章 常见设计反模式（Anti-Patterns）

**反模式**是对一个反复出现的问题的常见但无效的解决方案。它表面上"解决了"问题，实际上引入了更大的问题。

## 26.1 什么是反模式

### 26.1.1 反模式的定义

反模式（Anti-Pattern）的概念由 Andrew Koenig 在 1995 年提出，与设计模式相对。设计模式是"经过验证的优秀解决方案"，而反模式是"看似有效但实际有害的解决方案"。

反模式不等于 Bug。Bug 是明显的错误——编译错误、空指针、死循环。反模式在短期内"工作"，但在长期维护中暴露出严重问题。

### 26.1.2 反模式的生命周期

```
反模式的演化路径：

1. 解决方案 →  有人遇到问题A，使用了方案B"解决"
2. 采纳     →  其他人看到方案B"有效"，纷纷效仿
3. 问题显露 →  项目规模增长，方案B的弊端开始显现
4. 命名     →  社区识别出这个有害模式，给它起名
5. 纠正     →  提出已知的、有效的替代方案
```

### 26.1.3 为什么要学习反模式

**识别警告信号**：反模式在早期都有特征信号。学会识别这些信号，可以在问题恶化前纠正。

**避免重复错误**：学习反模式就是学习行业前辈用高昂代价换来的教训。在自己的项目中避免这些常见错误，比亲自试错更高效。

**形成批判思维**：了解反模式后，开发者会对"万能方案"保持警惕。每当有人说"这个问题用 XXX 模式就能解决"，会思考：它真的适合这里吗？

## 26.2 常见反模式分类

### 26.2.1 创建型反模式

#### 1. Singleton 滥用（Singleton Abuse）

**问题**：将 Singleton 用做全局变量容器，所有地方都可以读取和修改。

```java
// 反模式：GodConfigSingleton — 一个容纳所有配置的单例
public class AppConfig {
    private static final AppConfig INSTANCE = new AppConfig();
    private final Map<String, Object> configs = new HashMap<>();

    private AppConfig() {
        configs.put("db.url", "jdbc:mysql://localhost:3306/mydb");
        configs.put("db.user", "root");
        configs.put("db.password", "secret");
        configs.put("cache.ttl", 3000);
        configs.put("smtp.host", "smtp.example.com");
        configs.put("smtp.port", 587);
        configs.put("payment.api.key", "pk_test_xxx");
        configs.put("payment.api.secret", "sk_test_xxx");
        configs.put("rate.limit.max", 100);
        configs.put("rate.limit.window", 60000);
        // ... 50 多个完全不相关的配置项挤在一起
    }

    public static AppConfig getInstance() { return INSTANCE; }
    public Object get(String key) { return configs.get(key); }
    public void set(String key, Object value) { configs.put(key, value); }
}

// 任何代码都可以修改配置
AppConfig.getInstance().set("db.password", "hacked");
// 全局状态导致的问题：测试 A 修改了配置，影响测试 B
```

**危害**：
- 全局可变状态，任何代码都能修改
- 隐式依赖难以追踪——类依赖 AppConfig 但没有在构造函数中声明
- 单元测试困难——需要重置状态，测试之间互相干扰
- 隐藏依赖关系——方法签名不反映依赖，阅读代码需要全局搜索

**解决方案**：通过构造函数注入配置对象，每个类只接收自己需要的配置：

```java
// 改进：每个模块只接收自己需要的配置
public class DatabaseConfig {
    private final String url;
    private final String user;
    private final String password;

    public DatabaseConfig(String url, String user, String password) {
        this.url = url;
        this.user = user;
        this.password = password;
    }
    // getter 方法...
}

public class DatabaseConnection {
    private final DatabaseConfig config;

    public DatabaseConnection(DatabaseConfig config) {  // 显式依赖
        this.config = config;
    }
}
```

#### 2. 伸缩构造函数地狱（Telescoping Constructor）

**问题**：为支持各种参数组合，构造函数不断"增长"。

```java
// 反模式：构造函数参数越来越多
public class User {
    private String name;
    private int age;
    private String email;
    private String phone;
    private String address;
    private String city;
    private String province;
    private String country;
    private String zipCode;
    private String avatar;
    private String bio;
    private String website;
    private boolean verified;
    private boolean active;
    private Date createdAt;

    // 开始时只有 3 个参数
    public User(String name, int age, String email) { /* ... */ }

    // 后来加了 phone
    public User(String name, int age, String email, String phone) { /* ... */ }

    // 后来加了 address
    public User(String name, int age, String email, String phone,
                String address) { /* ... */ }

    // 不断增长...
    public User(String name, int age, String email, String phone,
                String address, String city, String province,
                String country, String zipCode, String avatar,
                String bio, String website, boolean verified,
                boolean active, Date createdAt) {
        // 15 个参数，调用时根本分不清每个参数的含义
        this.name = name;
        this.age = age;
        // ... 极易传错参数
    }
}

// 调用时痛苦不堪
User user = new User("张三", 28, "zhangsan@example.com",
    null, null, "北京", "北京", "中国",
    "100000", null, null, null, false, true, new Date());
// 第4、5个参数是 null，它们是做什么的？
```

**危害**：
- 参数数量超过 5 个时极难阅读
- 容易传错参数（相同类型的参数互换位置，编译期不报错）
- 添加可选参数需要添加新的构造函数重载
- 调用方代码冗长、易错

**解决方案**：使用 Builder 模式：

```java
// 改进：Builder 模式
User user = User.builder()
    .name("张三")
    .age(28)
    .email("zhangsan@example.com")
    .city("北京")
    .province("北京")
    .country("中国")
    .zipCode("100000")
    .active(true)
    .createdAt(new Date())
    .build();
```

#### 3. God Factory

**问题**：一个工厂类创建完全不相关的对象。

```java
// 反模式：支付工厂还负责创建邮件服务和报表生成器
public class EverythingFactory {
    // 支付相关
    public PaymentService createAlipay() { /* ... */ }
    public PaymentService createWechatPay() { /* ... */ }

    // 邮件相关 — 跟支付有什么关系？
    public EmailService createEmailService() { /* ... */ }
    public EmailTemplate createEmailTemplate() { /* ... */ }

    // 报表相关 — 跟支付、邮件都没关系
    public ReportGenerator createPdfReport() { /* ... */ }
    public ReportGenerator createExcelReport() { /* ... */ }

    // 缓存相关
    public Cache createRedisCache() { /* ... */ }
    public Cache createLocalCache() { /* ... */ }
}

// 修改一个模块需要理解整个 God Factory
// 新增一个"创建对象"的需求就要往这个类里加方法
```

**解决方案**：按领域拆分工厂：

```java
public class PaymentFactory { /* 只负责支付相关 */ }
public class EmailFactory { /* 只负责邮件相关 */ }
public class ReportFactory { /* 只负责报表相关 */ }
```

#### 4. 不必要的原型模式

**问题**：使用 `clone()` 只是因为"理论上 clone 比 new 快"，而不考虑实际成本。

```java
public class User implements Cloneable {
    private List<String> permissions;  // 引用类型！

    @Override
    public User clone() {
        try {
            User cloned = (User) super.clone();  // 浅拷贝！
            cloned.permissions = new ArrayList<>(this.permissions);  // 需要深拷贝
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);  // 为什么 Cloneable 不返回 CloneNotSupportedException？
        }
    }
}

// 实际上：
// 1. clone() 需要实现 Cloneable（奇怪的空接口）
// 2. clone() 返回 Object，需要强转
// 3. 浅拷贝陷阱：引用类型需要手动深拷贝
// 4. final 字段无法在 clone 中赋值
// 更简单的方式：拷贝构造函数
public User(User other) {
    this.name = other.name;
    this.age = other.age;
    this.permissions = new ArrayList<>(other.permissions);
}
```

### 26.2.2 结构型反模式

#### 1. 适配器重载（Adapter Overload）

**问题**：为解决兼容性问题，层层叠加适配器。

```java
// 反模式：5 层适配器层层包装
public class LegacyPaymentSystem { /* 老系统，使用 XML 格式 */ }

// 第1层：XML → JSON
public class XmlToJsonAdapter { /* ... */ }

// 第2层：JSON → 新 JSON 格式
public class JsonToNewJsonAdapter { /* ... */ }

// 第3层：新 JSON → REST 调用
public class NewJsonToRestAdapter { /* ... */ }

// 第4层：REST → 异步消息
public class RestToAsyncAdapter { /* ... */ }

// 第5层：异步消息 → 事件驱动
public class AsyncToEventAdapter { /* ... */ }

// 调用链
new AsyncToEventAdapter(
    new RestToAsyncAdapter(
        new NewJsonToRestAdapter(
            new JsonToNewJsonAdapter(
                new XmlToJsonAdapter(legacySystem)
            )
        )
    )
).process(order);
// 调试时堆栈深不见底，性能损失严重
```

**解决方案**：修复根接口，而非每层加适配器。如果必须分层转换，使用 Pipeline 模式明确每个阶段。

#### 2. 装饰器意大利面（Decorator Spaghetti）

**问题**：多层装饰器嵌套，调试时无法分辨在哪个装饰器中出错。

```java
// 反模式：8 层嵌套装饰器
InputStream is = new BufferedInputStream(
    new GzipInputStream(
        new CipherInputStream(
            new ProgressMonitorInputStream(
                new ChecksumInputStream(
                    new BoundedInputStream(
                        new LineNumberInputStream(
                            new FileInputStream("data.dat")
                        )
                    )
                )
            )
        )
    )
);

// 真实堆栈示例（调试时需逐层穿越）：
// at LineNumberInputStream.read()
// at BoundedInputStream.read()
// at ChecksumInputStream.read()
// at ProgressMonitorInputStream.read()
// at CipherInputStream.read()
// at GzipInputStream.read()
// at BufferedInputStream.read()
// 哪一层出了问题？需要层层排查
```

**解决方案**：
- 限制装饰器嵌套层数（超过 3 层考虑合并）
- 每个装饰器只做一件事
- 使用统一的装饰器栈管理，方便开启/关闭特定装饰器

#### 3. God Facade

**问题**：Facade 本应简化接口，结果变成了包含数百个方法的"万能门面"。

```java
// 反模式：购物系统 Facade 涵盖所有功能
public class ShoppingSystemFacade {
    // 用户管理
    public User registerUser(String name, String email, String password) { /* ... */ }
    public User login(String email, String password) { /* ... */ }
    public User resetPassword(String email) { /* ... */ }
    public User updateProfile(String userId, Profile profile) { /* ... */ }

    // 商品管理
    public Product addProduct(Product product) { /* ... */ }
    public Product updateProduct(Product product) { /* ... */ }
    public void deleteProduct(String productId) { /* ... */ }
    public Product getProduct(String productId) { /* ... */ }
    public List<Product> searchProducts(String keyword) { /* ... */ }
    public List<Product> getProductsByCategory(String category) { /* ... */ }

    // 库存管理
    public void addStock(String productId, int quantity) { /* ... */ }
    public void reduceStock(String productId, int quantity) { /* ... */ }
    public int getStock(String productId) { /* ... */ }

    // 购物车
    public void addToCart(String userId, String productId, int quantity) { /* ... */ }
    public void removeFromCart(String userId, String productId) { /* ... */ }

    // 订单管理
    public Order createOrder(String userId, List<CartItem> items) { /* ... */ }
    public Order cancelOrder(String orderId) { /* ... */ }

    // 支付
    public PaymentResult pay(String orderId, String paymentMethod) { /* ... */ }

    // 退款
    public RefundResult refund(String orderId, String reason) { /* ... */ }

    // 物流
    public LogisticsInfo trackOrder(String orderId) { /* ... */ }

    // 评价
    public Review addReview(String userId, String productId, Review review) { /* ... */ }

    // ... 持续增长到 100+ 个方法
}
```

**解决方案**：按领域拆分为多个 Facade：

```java
public class UserFacade { /* 用户相关 */ }
public class ProductFacade { /* 商品相关 */ }
public class OrderFacade { /* 订单相关 */ }
public class PaymentFacade { /* 支付相关 */ }
```

#### 4. 代理滥用（Proxy Abuse）

**问题**：为每个操作都添加多层代理。

```java
// 反模式：代理套代理
public class BusinessService {
    public Result execute() { /* 核心业务逻辑 */ }
}

// 第1层：日志代理
new LoggingProxy(
    // 第2层：性能监控代理
    new TimingProxy(
        // 第3层：重试代理
        new RetryProxy(
            // 第4层：缓存代理
            new CacheProxy(
                new BusinessService()
            )
        )
    )
).execute();

// 问题：
// 1. 调试困难：跟踪一次业务请求需要穿透 4 层代理
// 2. 性能损耗：每层代理都增加方法调用开销
// 3. 代理间可能相互干扰：缓存代理和重试代理的组合可能导致重试了但缓存已更新
```

**解决方案**：
- 合并密切相关的代理职责（如日志+监控合并为一个）
- 使用 AOP（面向切面编程）统一管理横切关注点
- 评估每个代理的实际价值，去掉不必要的

### 26.2.3 行为型反模式

#### 1. 观察者地狱（Observer Hell）

**问题**：观察者链形成循环依赖，导致无限循环或级联更新风暴。

```java
// 反模式：A → B → C → A 的观察者循环
public class A {
    private List<B> observers = new ArrayList<>();
    private int value;

    public void setValue(int value) {
        this.value = value;
        observers.forEach(B::onAChanged);  // 通知 B
    }
}

public class B {
    private List<C> observers = new ArrayList<>();
    private int value;

    public void onAChanged() {
        this.value = newValue();
        observers.forEach(C::onBChanged);  // 通知 C
    }
}

public class C {
    private List<A> observers = new ArrayList<>();
    private int value;

    public void onBChanged() {
        this.value = newValue();
        observers.forEach(A::onCChanged);  // 通知 A
        // ↑↑ 循环！A → B → C → A → B → C → A ...
    }
}

// 结果：StackOverflowError
```

**解决方案**：
- 使用中介者（Mediator）统一管理事件分发
- 使用事件溯源（Event Sourcing）：事件不可变，通过事件日志追踪
- 引入事件总线（Event Bus），支持异步、去重

#### 2. 无尽的责任链（Endless Chain）

**问题**：责任链中没有确保最终处理的终端处理器。

```java
// 反模式：没有默认处理器的责任链
public class ValidationHandler {
    private ValidationHandler next;

    public void handle(Request request) {
        if (canHandle(request)) {
            process(request);
        } else if (next != null) {
            next.handle(request);
        }
        // 没有 else！请求可能不被任何处理器处理
    }
}

// 使用链：
new AuthenticationHandler()        // 验证身份
    .setNext(new RateLimitHandler())     // 限流
    .setNext(new PermissionHandler())    // 权限
    .setNext(new InputValidationHandler()) // 输入验证
    .setNext(new BusinessLogicHandler()) // 业务逻辑
    .setNext(new LoggingHandler());      // 日志

// 如果 RateLimitHandler 的 canHandle 实现有 Bug，
// 请求会直接跳过限流、权限、验证直接到业务逻辑
// 更糟的是：如果所有 canHandle 都返回 false，
// 请求静静地"消失"了
```

**解决方案**：始终在链末端添加终端处理器：

```java
public class TerminalHandler extends ValidationHandler {
    @Override
    public void handle(Request request) {
        throw new IllegalStateException(
            "请求未被任何处理器处理: " + request);
    }
}

// 使用：
new AuthenticationHandler()
    .setNext(new RateLimitHandler())
    .setNext(new TerminalHandler());  // 默认抛出异常
```

#### 3. 命令过度设计（Command Overkill）

**问题**：将本应简单执行的原子操作封装为命令对象。

```java
// 反模式：每个按键操作都是一个命令
public interface Command {
    void execute();
    void undo();
}

public class InsertCharCommand implements Command {
    private final TextEditor editor;
    private final char c;

    public InsertCharCommand(TextEditor editor, char c) {
        this.editor = editor;
        this.c = c;
    }

    @Override
    public void execute() {
        editor.insertChar(c);
    }

    @Override
    public void undo() {
        editor.deleteLastChar();
    }
}

public class DeleteCharCommand implements Command {
    private final TextEditor editor;

    public DeleteCharCommand(TextEditor editor) {
        this.editor = editor;
    }

    @Override
    public void execute() {
        editor.deleteLastChar();
    }

    @Override
    public void undo() {
        editor.undoDelete();
    }
}

// 用户输入 "hello" → 创建 5 个 InsertCharCommand
// 用户按退格键 → 创建 DeleteCharCommand
// 记录 50 个命令对象 → 内存压力
// 撤销时逐个执行 undo → 缓慢且无意义
```

**解决方案**：在更高粒度使用命令模式——批量处理操作：

```java
// 改进：以"操作"为粒度，而非"字符"
public class TextChangeCommand implements Command {
    private final String oldText;
    private final String newText;

    public TextChangeCommand(String oldText, String newText) {
        this.oldText = oldText;
        this.newText = newText;
    }

    @Override
    public void execute() {
        // 使用新文本替换旧文本
    }

    @Override
    public void undo() {
        // 恢复旧文本
    }
}

// 或者使用 Memento 模式每 N 秒保存一次快照
```

#### 4. 策略过度设计（Strategy Overdesign）

**问题**：创建大量策略类，但大部分从未被使用。

```java
// 反模式：15 种折扣策略
public interface DiscountStrategy {
    double calculate(double amount);
}

class NoDiscountStrategy implements DiscountStrategy { /* 0% */ }
class Percent10DiscountStrategy implements DiscountStrategy { /* 10% */ }
class Percent15DiscountStrategy implements DiscountStrategy { /* 15% */ }
class Percent20DiscountStrategy implements DiscountStrategy { /* 20% */ }
class Percent25DiscountStrategy implements DiscountStrategy { /* 25% */ }
class Percent30DiscountStrategy implements DiscountStrategy { /* 30% */ }
class FixedAmount5DiscountStrategy implements DiscountStrategy { /* 5元 */ }
class FixedAmount10DiscountStrategy implements DiscountStrategy { /* 10元 */ }
class FixedAmount20DiscountStrategy implements DiscountStrategy { /* 20元 */ }
class FixedAmount50DiscountStrategy implements DiscountStrategy { /* 50元 */ }
class BuyOneGetOneStrategy implements DiscountStrategy { /* 买一送一 */ }
class BuyTwoGetOneStrategy implements DiscountStrategy { /* 买二送一 */ }
class SeasonDiscountStrategy implements DiscountStrategy { /* 换季 */ }
class VIPDiscountStrategy implements DiscountStrategy { /* VIP */ }
class MemberDiscountStrategy implements DiscountStrategy { /* 会员 */ }

// 实际上只用了 3 种：0%、10%、20%
```

**解决方案**：遵循 YAGNI 原则——只实现当前需要的策略。在第 3 次需要新策略时再考虑抽象。

### 26.2.4 通用反模式

#### 1. 模式狂热症（Pattern Mania）

**问题**：为非常简单的逻辑应用大量设计模式，"万物皆模式"。

```java
// 反模式：200 行 HelloWorld，使用了 Factory + Strategy + Observer
public class HelloWorldApp {
    public static void main(String[] args) {
        GreetingStrategy strategy = GreetingStrategyFactory.create("EN");
        GreetingEventBus eventBus = new GreetingEventBus();

        eventBus.register(new LoggingObserver());
        eventBus.register(new MetricsObserver());

        String message = strategy.generateGreeting();
        eventBus.publish(new GreetingEvent(message));

        System.out.println(message);
    }
}

interface GreetingStrategy {
    String generateGreeting();
}

class EnglishGreetingStrategy implements GreetingStrategy {
    public String generateGreeting() { return "Hello, World!"; }
}

class ChineseGreetingStrategy implements GreetingStrategy {
    public String generateGreeting() { return "你好，世界！"; }
}

class GreetingStrategyFactory {
    private static final Map<String, GreetingStrategy> strategies = new HashMap<>();
    static {
        strategies.put("EN", new EnglishGreetingStrategy());
        strategies.put("CN", new ChineseGreetingStrategy());
    }
    public static GreetingStrategy create(String lang) {
        return strategies.getOrDefault(lang, new EnglishGreetingStrategy());
    }
}

// 而实际上只需要一行：
System.out.println("Hello, World!");
```

**危害**：
- 将简单问题复杂化
- 新人理解代码需要了解所有使用到的模式
- 维护成本远超预期收益
- 性能损失——每个抽象层都有开销

#### 2. 过早抽象（Premature Abstraction）

**问题**：为"未来可能需要的灵活性"提前添加抽象层。

```java
// 反模式：目前只有一个实现，却加了接口
public interface PaymentProcessor {
    PaymentResult process(Payment payment);
}

public class AlipayProcessor implements PaymentProcessor {
    @Override
    public PaymentResult process(Payment payment) {
        // 唯一的实现
        // 调用支付宝 API
        return alipayApi.charge(payment.getAmount());
    }
}

// 系统中只创建和使用 AlipayProcessor
// 接口和方法之间的间接调用增加了不必要的复杂度
// "万一以后需要微信支付呢"——这个"万一"从未出现

// 实际上应该先使用具体类：
public class AlipayProcessor {
    public PaymentResult process(Payment payment) {
        return alipayApi.charge(payment.getAmount());
    }
}

// 当真正需要第二个实现时，再提取接口
// IDE 可以一键完成接口提取
```

#### 3. 复制粘贴模式（Copy-Paste Pattern）

**问题**：从示例复制设计模式的结构，但放错了上下文。

```java
// 反模式：复制工厂模式，但工厂不做"创建"的事
public class StringFactory {
    public static String createHello() {
        return "Hello";
    }
    public static String createWorld() {
        return "World";
    }
}
// 这里"工厂"只是包装了字符串常量
// 应该直接使用 String 字面量

// 反模式：复制观察者模式，但是一对一的直接调用
public interface Observer {
    void update(String data);
}

public class DataStore {
    private Observer observer;

    public void setObserver(Observer observer) {
        this.observer = observer;
    }

    public void save(String data) {
        // 保存数据
        this.observer.update(data);  // 直接调用一个观察者
        // 这不是观察者模式，这是回调！
    }
}
// 观察者模式的本质是"一对多"的发布-订阅
// 如果只有一个订阅者，直接使用方法调用或回调即可
```

## 26.3 解决方案

### 26.3.1 YAGNI 原则

**You Aren't Gonna Need It**——你实际上不需要它。

只在"确实需要"时才添加抽象、模式、灵活性。不要为想象中的未来做准备：

```java
// YAGNI 正确的思维方式：

// 问题：需要计算订单总额
// YAGNI 思维：先写最简单的方式
public double calculateTotal(Order order) {
    return order.getItems().stream()
        .mapToDouble(Item::getPrice)
        .sum();
}

// 反-YAGNI 思维：
// "万一以后有不同的计算方式呢？先抽象一个 Calculator 接口"
// "万一以后需要汇率转换呢？先加一个 currency 参数"
// "万一以后需要支持多种折扣呢？先实现策略模式"
```

### 26.3.2 三击法则（Three Strikes Rule）

当第三次遇到类似代码时再考虑抽象：

```
第一次遇到重复：直接复制。不要抽象。
第二次遇到重复：复制但心里记着。
第三次遇到重复：现在可以提取公共逻辑了。

理由是：
- 两次重复可能是巧合
- 三次重复基本上确认这是一个模式
- 前两次能让你真正理解"不变的部分"和"变化的部分"
```

### 26.3.3 代码审查清单（反模式检测）

在 Code Review 中检查以下信号：

```
代码审查中的反模式警告信号：

1. 单个类超过 500 行        → God Class / God Facade 嫌疑
2. 方法参数超过 5 个          → 考虑 Builder 或参数对象
3. 嵌套 if-else 超过 3 层    → 考虑多态或策略模式
4. instanceof 判断类型        → 考虑多态或访问者模式
5. 接口只有一个实现类         → 过早抽象嫌疑（除非接口来自外部）
6. 创建了 5 个以上的策略/命令 → 是否过度设计？
7. 工厂方法只创建一种对象     → 不必要的工厂
8. 类名包含"Util""Helper"     → 可能是在把不相关的功能强行塞在一起
9. 全局可变状态（public static）→ 安全隐患
10. 在循环中使用反射         → 性能陷阱
```

### 26.3.4 反模式重构方案

**Singleton 滥用 → 依赖注入**：

```java
// 重构前
public class OrderService {
    public void createOrder(Order order) {
        AppConfig config = AppConfig.getInstance();
        Database db = Database.getInstance();
        EmailService email = EmailService.getInstance();
        // ...
    }
}

// 重构后
public class OrderService {
    private final Database db;
    private final EmailService email;

    public OrderService(Database db, EmailService email) {
        this.db = db;
        this.email = email;
    }

    public void createOrder(Order order) {
        // 使用注入的依赖
    }
}
```

**God Class → 按职责拆分**：

```java
// 重构前（一个类处理订单、支付、物流、评价）
public class OrderManager { /* 3000 行 */ }

// 重构后（按职责拆分为 4 个类）
public class OrderProcessor { /* 处理订单核心流程 */ }
public class PaymentHandler { /* 处理支付 */ }
public class LogisticsTracker { /* 处理物流追踪 */ }
public class ReviewManager { /* 处理评价 */ }
```

**Telescoping Constructor → Builder**：

```java
// 重构前
new User(name, age, email, phone, address, city, province, country, zipCode);

// 重构后
User.builder()
    .name(name).age(age).email(email)
    .phone(phone).address(address)
    .city(city).province(province).country(country)
    .zipCode(zipCode)
    .build();
```

**Observer Hell → Event Bus**：

```java
// 重构前：Observers 互相引用形成循环
// 重构后：
EventBus eventBus = new EventBus();
eventBus.register(AHandler::handle);
eventBus.register(BHandler::handle);
eventBus.register(CHandler::handle);

eventBus.post(new ValueChangedEvent(newValue));
// EventBus 通过异步队列防止循环
```

## 26.4 本章小结

反模式教会我们一个道理：**不是所有"模式"都是好的**。设计模式的误用比不用更糟糕——它增加了复杂度但未解决真正的问题。

避免反模式的核心方法不是"少用模式"，而是**有意识地使用模式**：
- 理解每个模式的适用条件和权衡
- 让问题驱动方案选择，而非让"模式"驱动设计
- 遵循 YAGNI 和"三击法则"
- 在 Code Review 中关注反模式信号

记住：**简单性的价值，往往要到维护时才能真正体会。**
