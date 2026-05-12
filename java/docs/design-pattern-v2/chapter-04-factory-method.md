# 第4章 工厂方法模式（Factory Method）

**工厂方法模式**是创建型模式中最核心的模式之一。它通过定义一个用于创建对象的接口，让子类决定实例化哪个类，使类的实例化延迟到子类中进行。这个模式完美体现了"依赖抽象而非具体"的设计原则。

## 4.1 解决的问题与应用场景

### 4.1.1 问题分析

在面向对象编程中，对象的创建和使用往往是紧密耦合的。考虑以下常见代码：

```java
// 客户端代码和具体产品类紧耦合
public class ReportGenerator {
    public void generateReport(String type) {
        if ("PDF".equals(type)) {
            PdfExporter exporter = new PdfExporter();  // 直接依赖具体类
            exporter.export(data);
        } else if ("Excel".equals(type)) {
            ExcelExporter exporter = new ExcelExporter();  // 又是具体类
            exporter.export(data);
        }
    }
}
```

这种写法带来的问题：

1. **违反开闭原则**：每新增一种导出格式（如Word），都必须修改 `ReportGenerator` 类的代码。修改现有代码意味着引入风险。

2. **客户端与具体产品紧耦合**：`ReportGenerator` 需要知道 `PdfExporter` 和 `ExcelExporter` 这两个具体类的存在。

3. **对象创建逻辑分散**：创建逻辑散布在各处，当创建过程变得复杂时（如需要配置、初始化），重复代码会急剧膨胀。

4. **难以测试**：无法将实际的产品替换为Mock对象进行单元测试。

**工厂方法模式的核心动机**：将对象的**创建**与**使用**分离，让客户端面向抽象编程，具体创建过程交给子类或专门的工厂类处理。

### 4.1.2 典型应用场景

| 场景 | 说明 | 典型示例 |
|------|------|----------|
| 日志框架 | 不同日志输出方式 | FileLogger, ConsoleLogger, DatabaseLogger |
| 支付系统 | 多种支付渠道 | Alipay, WeChat Pay, UnionPay |
| 数据库驱动 | 多数据库支持 | MySQL Driver, PostgreSQL Driver, Oracle Driver |
| 文档导出 | 多格式导出 | PDF导出, Excel导出, Word导出 |
| 消息通知 | 多通道通知 | Email通知, SMS通知, Push推送 |
| UI组件 | 不同平台组件 | Windows按钮, Mac按钮, Linux按钮 |

## 4.2 实现原理与UML

### 4.2.1 核心思想

工厂方法模式的四个核心角色：

1. **Product（抽象产品）**：定义产品对象的接口，所有具体产品都必须实现此接口。
2. **ConcreteProduct（具体产品）**：实现抽象产品接口的具体类。
3. **Creator（抽象创建者）**：声明工厂方法，返回抽象产品类型。
4. **ConcreteCreator（具体创建者）**：重写工厂方法，创建并返回具体产品实例。

**与简单工厂的区别**：
- 简单工厂：一个工厂类负责创建所有产品，通过参数区分（违反开闭原则）
- 工厂方法：一个工厂创建一种产品，新增产品只需新增工厂（符合开闭原则）

### 4.2.2 UML类图

```
                    ┌──────────────────────────┐
                    │      <<interface>>        │
                    │        Product            │  ← 抽象产品接口
                    ├──────────────────────────┤
                    │ + execute(): void         │
                    └──────────────────────────┘
                                ▲
                                │ implements
              ┌─────────────────┼─────────────────┐
              │                                    │
┌──────────────────────────┐      ┌──────────────────────────┐
│   ConcreteProductA       │      │   ConcreteProductB       │  ← 具体产品
├──────────────────────────┤      ├──────────────────────────┤
│ + execute(): void        │      │ + execute(): void        │
└──────────────────────────┘      └──────────────────────────┘

                    ┌──────────────────────────┐
                    │      <<abstract>>         │
                    │        Creator            │  ← 抽象创建者
                    ├──────────────────────────┤
                    │ + factoryMethod(): Product│  ← 工厂方法（返回抽象类型）
                    │ + someOperation(): void   │  ← 使用产品的业务方法
                    └──────────────────────────┘
                                ▲
                                │ extends
              ┌─────────────────┼─────────────────┐
              │                                    │
┌──────────────────────────┐      ┌──────────────────────────┐
│   ConcreteCreatorA       │      │   ConcreteCreatorB       │  ← 具体创建者
├──────────────────────────┤      ├──────────────────────────┤
│ + factoryMethod(): Product│     │ + factoryMethod(): Product│
└──────────────────────────┘      └──────────────────────────┘
```

### 4.2.3 时序图

```
Client                  Creator              ConcreteCreator        ConcreteProduct
  │                        │                       │                      │
  │   someOperation()      │                       │                      │
  │ ──────────────────────►│                       │                      │
  │                        │   factoryMethod()     │                      │
  │                        │ ─────────────────────►│                      │
  │                        │                       │                      │
  │                        │                       │  new ConcreteProduct │
  │                        │                       │ ────────────────────►│
  │                        │                       │                      │
  │                        │       product         │                      │
  │                        │ ◄─────────────────────│                      │
  │                        │                       │                      │
  │                        │   product.execute()   │                      │
  │                        │ ────────────────────────────────────────────►
  │                        │                       │                      │
```

### 4.2.4 角色职责分析

| 角色 | 职责 | 关注点 |
|------|------|--------|
| Product | 定义产品对象接口 | 抽象：定义"能做什么" |
| ConcreteProduct | 实现具体产品行为 | 具体：实现"怎么做" |
| Creator | 声明工厂方法 | 抽象：定义"创建什么" |
| ConcreteCreator | 返回具体产品实例 | 具体：决定"创建哪个" |

## 4.3 代码实现

### 4.3.1 经典实现 -- 日志记录器工厂

**第一步：定义抽象产品接口**

```java
/**
 * 抽象产品：日志记录器接口
 * 所有具体的日志记录器都必须实现此接口
 */
public interface Logger {
    /**
     * 记录日志
     * @param level 日志级别
     * @param message 日志消息
     */
    void log(LogLevel level, String message);

    /**
     * 获取日志记录器的名称
     */
    String getName();
}

/**
 * 日志级别枚举
 */
public enum LogLevel {
    DEBUG, INFO, WARN, ERROR, FATAL
}
```

**第二步：实现具体产品**

```java
/**
 * 具体产品：控制台日志记录器
 * 将日志输出到标准输出流
 */
public class ConsoleLogger implements Logger {
    private final String name;

    public ConsoleLogger(String name) {
        this.name = name;
    }

    @Override
    public void log(LogLevel level, String message) {
        String formattedMsg = String.format("[%s] [%s] %s - %s",
                java.time.LocalDateTime.now(), level, name, message);
        System.out.println(formattedMsg);
    }

    @Override
    public String getName() {
        return name;
    }
}

/**
 * 具体产品：文件日志记录器
 * 将日志输出到指定文件中
 */
public class FileLogger implements Logger {
    private final String name;
    private final String filePath;
    private final Object lock = new Object();

    public FileLogger(String name, String filePath) {
        this.name = name;
        this.filePath = filePath;
    }

    @Override
    public void log(LogLevel level, String message) {
        // 同步写入，确保多线程安全
        synchronized (lock) {
            try (FileWriter fw = new FileWriter(filePath, true);
                 BufferedWriter bw = new BufferedWriter(fw);
                 PrintWriter out = new PrintWriter(bw)) {

                String formattedMsg = String.format("[%s] [%s] %s - %s",
                        java.time.LocalDateTime.now(), level, name, message);
                out.println(formattedMsg);

            } catch (IOException e) {
                System.err.println("Failed to write to log file: " + e.getMessage());
            }
        }
    }

    @Override
    public String getName() {
        return name;
    }
}

/**
 * 具体产品：数据库日志记录器
 * 将日志持久化到数据库（演示用，不包含真实JDBC）
 */
public class DatabaseLogger implements Logger {
    private final String name;

    public DatabaseLogger(String name) {
        this.name = name;
    }

    @Override
    public void log(LogLevel level, String message) {
        // 实际项目中，这里会执行JDBC插入操作
        String insertSql = "INSERT INTO app_logs (level, name, message, created_at) "
                + "VALUES (?, ?, ?, ?)";
        System.out.println("[DBLog] " + insertSql + " ← (" + level + ", " + name + ", " + message + ")");
    }

    @Override
    public String getName() {
        return name;
    }
}
```

**第三步：定义抽象创建者和具体创建者**

```java
/**
 * 抽象创建者：日志记录器工厂
 * 声明工厂方法，子类决定具体创建哪种Logger
 */
public abstract class LoggerFactory {

    /**
     * 工厂方法（Factory Method）
     * 子类重写此方法以创建具体的Logger实例
     */
    public abstract Logger createLogger(String name);

    /**
     * 使用工厂方法创建Logger并记录日志
     * 此方法展示了模板方法模式和工厂方法模式的结合
     */
    public void logMessage(String name, LogLevel level, String message) {
        Logger logger = createLogger(name);  // 委托子类创建
        logger.log(level, message);          // 使用产品
    }
}

/**
 * 具体创建者：控制台日志工厂
 */
public class ConsoleLoggerFactory extends LoggerFactory {

    @Override
    public Logger createLogger(String name) {
        return new ConsoleLogger(name);
    }
}

/**
 * 具体创建者：文件日志工厂
 */
public class FileLoggerFactory extends LoggerFactory {
    private final String filePath;

    public FileLoggerFactory(String filePath) {
        this.filePath = filePath;
    }

    @Override
    public Logger createLogger(String name) {
        return new FileLogger(name, filePath);
    }
}

/**
 * 具体创建者：数据库日志工厂
 */
public class DatabaseLoggerFactory extends LoggerFactory {

    @Override
    public Logger createLogger(String name) {
        return new DatabaseLogger(name);
    }
}
```

**第四步：客户端使用**

```java
/**
 * 客户端演示 -- 使用工厂方法模式
 * 客户端只依赖抽象接口（Logger 和 LoggerFactory），
 * 完全不关心具体实现类
 */
public class Client {
    public static void main(String[] args) {
        // 通过不同的具体工厂创建不同的日志记录器
        LoggerFactory consoleFactory = new ConsoleLoggerFactory();
        LoggerFactory fileFactory = new FileLoggerFactory("application.log");
        LoggerFactory dbFactory = new DatabaseLoggerFactory();

        // 客户端代码完全一致，仅工厂不同
        consoleFactory.logMessage("UserService", LogLevel.INFO, "User logged in");
        fileFactory.logMessage("OrderService", LogLevel.WARN, "Order timeout");
        dbFactory.logMessage("PaymentService", LogLevel.ERROR, "Payment failed");

        // 新增日志类型时，仅需新增一个产品和工厂，客户端代码无需修改
        // 例如：新增 CloudLogger + CloudLoggerFactory
    }
}
```

**关键设计要点**：

- 客户端只依赖 `LoggerFactory` 和 `Logger` 两个抽象类型
- 新增日志类型（如 `CloudLogger`）只需新增类和工厂，客户端代码零修改
- 创建逻辑集中在工厂类中，便于统一管理和配置

### 4.3.2 简化实现：静态工厂方法

在企业开发中，经常使用静态工厂方法简化实现，适合产品种类较少且相对固定的场景。

```java
/**
 * 静态工厂方式实现 -- 支付通道工厂
 * 适用于产品类型相对固定的场景
 */
// 抽象产品：支付接口
public interface Payment {
    /**
     * 执行支付
     * @param amount 支付金额
     * @return 支付结果
     */
    PaymentResult pay(BigDecimal amount);

    /**
     * 查询支付状态
     */
    PaymentStatus queryStatus(String transactionId);
}

// 支付结果
public class PaymentResult {
    private final boolean success;
    private final String transactionId;
    private final String message;

    public PaymentResult(boolean success, String transactionId, String message) {
        this.success = success;
        this.transactionId = transactionId;
        this.message = message;
    }

    // getters
    public boolean isSuccess() { return success; }
    public String getTransactionId() { return transactionId; }
    public String getMessage() { return message; }
}

// 支付状态枚举
public enum PaymentStatus {
    PENDING, SUCCESS, FAILED, REFUNDED
}

// 具体产品：支付宝
public class Alipay implements Payment {
    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[Alipay] Processing payment: ¥" + amount);
        // 调用支付宝API...
        return new PaymentResult(true, "ALI" + System.currentTimeMillis(), "Payment successful");
    }

    @Override
    public PaymentStatus queryStatus(String transactionId) {
        System.out.println("[Alipay] Querying status: " + transactionId);
        return PaymentStatus.SUCCESS;
    }
}

// 具体产品：微信支付
public class WechatPay implements Payment {
    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[WechatPay] Processing payment: ¥" + amount);
        return new PaymentResult(true, "WX" + System.currentTimeMillis(), "Payment successful");
    }

    @Override
    public PaymentStatus queryStatus(String transactionId) {
        System.out.println("[WechatPay] Querying status: " + transactionId);
        return PaymentStatus.SUCCESS;
    }
}

// 具体产品：银联支付
public class UnionPay implements Payment {
    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[UnionPay] Processing payment: ¥" + amount);
        return new PaymentResult(true, "UP" + System.currentTimeMillis(), "Payment successful");
    }

    @Override
    public PaymentStatus queryStatus(String transactionId) {
        System.out.println("[UnionPay] Querying status: " + transactionId);
        return PaymentStatus.SUCCESS;
    }
}
```

**静态工厂类**：

```java
/**
 * 静态工厂方法：支付通道工厂
 * 使用静态方法提供支付实例
 */
public class PaymentFactory {

    /**
     * 创建支付通道
     * @param channel 支付通道标识 (alipay, wechat, unionpay)
     * @return 对应支付通道实例
     * @throws IllegalArgumentException 如果通道标识无效
     */
    public static Payment createPayment(String channel) {
        if (channel == null || channel.isBlank()) {
            throw new IllegalArgumentException("Payment channel must not be null or empty");
        }

        return switch (channel.toLowerCase()) {
            case "alipay"   -> new Alipay();
            case "wechat"   -> new WechatPay();
            case "unionpay" -> new UnionPay();
            default -> throw new IllegalArgumentException(
                    "Unsupported payment channel: " + channel);
        };
    }

    /**
     * 创建默认支付通道（支付宝）
     */
    public static Payment createDefaultPayment() {
        return new Alipay();
    }
}

// 客户端使用
public class OrderService {
    public void checkout(Order order, String paymentChannel) {
        // 获取支付通道（客户端只依赖Payment接口，不依赖具体实现）
        Payment payment = PaymentFactory.createPayment(paymentChannel);
        PaymentResult result = payment.pay(order.getTotalAmount());

        if (result.isSuccess()) {
            System.out.println("Payment successful, transaction: " + result.getTransactionId());
        } else {
            System.out.println("Payment failed: " + result.getMessage());
        }
    }
}
```

**注意**：静态工厂方法的缺点是新增支付通道时需要修改工厂类，违反了开闭原则。在产品种类频繁变化时，应使用经典的工厂方法模式。

### 4.3.3 使用反射实现可扩展工厂

利用反射和配置文件实现完全解耦的工厂，新增产品时无需修改任何代码。

```java
/**
 * 反射工厂 -- 通过配置文件动态加载产品类
 * 实现完全的开闭原则：新增产品无需修改工厂代码
 */
public class ReflectivePaymentFactory {

    /**
     * 配置文件路径
     */
    private static final String CONFIG_FILE = "payment-mappings.properties";

    /**
     * 产品类型映射：通道标识 -> 实现类全限定名
     */
    private static final Map<String, Class<? extends Payment>> PAYMENT_TYPES = new ConcurrentHashMap<>();

    /**
     * 产品实例缓存（避免重复反射创建）
     */
    private static final Map<String, Payment> INSTANCE_CACHE = new ConcurrentHashMap<>();

    // 静态初始化块：加载配置文件
    static {
        loadConfiguration();
    }

    private static void loadConfiguration() {
        Properties props = new Properties();
        try (InputStream input = ReflectivePaymentFactory.class.getClassLoader()
                .getResourceAsStream(CONFIG_FILE)) {
            if (input != null) {
                props.load(input);
                for (String key : props.stringPropertyNames()) {
                    String className = props.getProperty(key);
                    @SuppressWarnings("unchecked")
                    Class<? extends Payment> clazz = (Class<? extends Payment>) Class.forName(className);
                    PAYMENT_TYPES.put(key, clazz);
                    System.out.println("Registered payment: " + key + " -> " + className);
                }
            }
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException("Failed to load payment configuration", e);
        }
    }

    /**
     * 创建支付通道实例（带缓存）
     */
    public static Payment createPayment(String channel) {
        if (channel == null || channel.isBlank()) {
            throw new IllegalArgumentException("Payment channel must not be null");
        }

        return INSTANCE_CACHE.computeIfAbsent(channel.toLowerCase(), ch -> {
            Class<? extends Payment> clazz = PAYMENT_TYPES.get(ch);
            if (clazz == null) {
                throw new IllegalArgumentException("Unknown payment channel: " + ch);
            }
            try {
                return clazz.getDeclaredConstructor().newInstance();
            } catch (Exception e) {
                throw new RuntimeException("Failed to instantiate payment: " + clazz.getName(), e);
            }
        });
    }

    /**
     * 动态注册新的支付通道（运行时扩展）
     */
    public static void registerChannel(String channel, Class<? extends Payment> clazz) {
        PAYMENT_TYPES.put(channel.toLowerCase(), clazz);
        System.out.println("Dynamically registered: " + channel + " -> " + clazz.getName());
    }
}
```

**配置文件 `payment-mappings.properties`**：

```properties
# 支付通道映射配置
# 格式：channel=fully.qualified.ClassName
alipay=com.example.payment.Alipay
wechat=com.example.payment.WechatPay
unionpay=com.example.payment.UnionPay
```

### 4.3.4 使用Lambda/Supplier简化工厂

Java 8 引入的函数式接口让工厂实现更加简洁。

```java
/**
 * Lambda 工厂 -- 使用 Supplier 简化对象创建
 */
public class LambdaPaymentFactory {

    // 工厂映射表：通道 -> 构造器引用
    private static final Map<String, Supplier<Payment>> FACTORIES = new HashMap<>();

    static {
        // 使用方法引用（构造器引用）注册各种支付通道的工厂
        FACTORIES.put("alipay", Alipay::new);
        FACTORIES.put("wechat", WechatPay::new);
        FACTORIES.put("unionpay", UnionPay::new);
    }

    public static Payment createPayment(String channel) {
        Supplier<Payment> factory = FACTORIES.get(channel.toLowerCase());
        if (factory == null) {
            throw new IllegalArgumentException("Unsupported payment channel: " + channel);
        }
        return factory.get();  // 通过 Supplier 创建实例
    }

    /**
     * 注册新的支付通道（一行代码搞定）
     */
    public static void registerChannel(String channel, Supplier<Payment> supplier) {
        FACTORIES.put(channel.toLowerCase(), supplier);
    }
}

// 动态注册新通道
// LambdaPaymentFactory.registerChannel("applepay", ApplePay::new);
```

### 4.3.5 使用容器管理（Spring风格）

```java
/**
 * 使用Map容器集中管理所有产品实例
 * 类似Spring的依赖注入理念
 */
public class PaymentServiceRegistry {

    // 所有支付服务实例的注册表
    private final Map<String, Payment> paymentServices = new ConcurrentHashMap<>();

    /**
     * 注册支付服务
     */
    public void register(String channel, Payment payment) {
        paymentServices.put(channel.toLowerCase(), payment);
        System.out.println("Registered payment service: " + channel);
    }

    /**
     * 获取支付服务
     */
    public Payment getService(String channel) {
        Payment service = paymentServices.get(channel.toLowerCase());
        if (service == null) {
            throw new IllegalArgumentException("No payment service registered for: " + channel);
        }
        return service;
    }

    /**
     * 批量注册
     */
    public void registerAll(Map<String, Payment> services) {
        services.forEach(this::register);
    }

    /**
     * 获取所有已注册的通道
     */
    public Set<String> getAvailableChannels() {
        return Collections.unmodifiableSet(paymentServices.keySet());
    }
}

// 初始化注册表
// PaymentServiceRegistry registry = new PaymentServiceRegistry();
// registry.register("alipay", new Alipay());
// registry.register("wechat", new WechatPay());
// registry.register("unionpay", new UnionPay());
```

## 4.4 JDK/框架源码解析

### 4.4.1 java.util.Calendar -- 经典工厂方法

`Calendar` 类通过静态工厂方法 `getInstance()` 根据地区返回不同的日历实现。

```java
public abstract class Calendar implements Serializable, Cloneable, Comparable<Calendar> {

    // 工厂方法：根据时区和地区返回具体日历实例
    public static Calendar getInstance() {
        return createCalendar(TimeZone.getDefault(), Locale.getDefault(Locale.Category.FORMAT));
    }

    public static Calendar getInstance(TimeZone zone) {
        return createCalendar(zone, Locale.getDefault(Locale.Category.FORMAT));
    }

    public static Calendar getInstance(Locale aLocale) {
        return createCalendar(TimeZone.getDefault(), aLocale);
    }

    private static Calendar createCalendar(TimeZone zone, Locale aLocale) {
        // 根据地区和国家选择不同的日历实现
        String calType = aLocale.getUnicodeLocaleType("ca");
        if (calType != null) {
            return switch (calType) {
                case "buddhist" -> new BuddhistCalendar(zone, aLocale);
                case "japanese" -> new JapaneseImperialCalendar(zone, aLocale);
                case "gregory"  -> new GregorianCalendar(zone, aLocale);
                default         -> new GregorianCalendar(zone, aLocale);
            };
        }

        // 默认返回公历
        return new GregorianCalendar(zone, aLocale);
    }
}
```

### 4.4.2 java.text.NumberFormat -- 多产品族的工厂方法

```java
public abstract class NumberFormat extends Format {

    // 通用数字格式化工厂方法
    public static NumberFormat getNumberInstance() {
        return getInstance(Locale.getDefault(Locale.Category.FORMAT), NUMBERSTYLE);
    }

    // 货币格式化工厂方法
    public static NumberFormat getCurrencyInstance() {
        return getInstance(Locale.getDefault(Locale.Category.FORMAT), CURRENCYSTYLE);
    }

    // 百分比格式化工厂方法
    public static NumberFormat getPercentInstance() {
        return getInstance(Locale.getDefault(Locale.Category.FORMAT), PERCENTSTYLE);
    }

    // 整数格式化工厂方法
    public static NumberFormat getIntegerInstance() {
        return getInstance(Locale.getDefault(Locale.Category.FORMAT), INTEGERSTYLE);
    }
}
```

### 4.4.3 Spring FrameworkBean 接口

`FactoryBean` 是Spring中工厂方法模式的典型应用，允许开发者自定义Bean的创建逻辑。

```java
/**
 * Spring FactoryBean 接口
 * 泛型参数 T 指定创建的产品类型
 */
public interface FactoryBean<T> {

    /**
     * 工厂方法：返回创建的Bean实例
     * 由Spring容器调用以获取Bean
     */
    T getObject() throws Exception;

    /**
     * 返回创建对象的类型
     */
    Class<?> getObjectType();

    /**
     * 是否为单例
     */
    default boolean isSingleton() {
        return true;
    }
}

// 自定义FactoryBean示例
@Component
public class DataSourceFactoryBean implements FactoryBean<DataSource> {

    @Value("${db.url}")
    private String url;

    @Value("${db.username}")
    private String username;

    @Value("${db.password}")
    private String password;

    @Override
    public DataSource getObject() throws Exception {
        // 工厂方法：创建并配置数据源
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        dataSource.setMaximumPoolSize(20);
        return dataSource;
    }

    @Override
    public Class<?> getObjectType() {
        return DataSource.class;
    }
}
```

### 4.4.4 MyBatis SqlSessionFactory

```java
// MyBatis的核心工厂接口
public interface SqlSessionFactory {

    /**
     * 工厂方法：创建SqlSession实例
     */
    SqlSession openSession();

    /**
     * 工厂方法：创建自动提交的SqlSession
     */
    SqlSession openSession(boolean autoCommit);

    /**
     * 获取配置
     */
    Configuration getConfiguration();
}

// 使用方式
// String resource = "mybatis-config.xml";
// InputStream inputStream = Resources.getResourceAsStream(resource);
// SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(inputStream);
// SqlSession session = factory.openSession();
```

### 4.4.5 JDBC DriverManager -- 静态工厂

```java
// DriverManager 通过静态工厂方法返回数据库连接
// 内部通过遍历已注册的Driver找到匹配的连接
Connection conn = DriverManager.getConnection(
    "jdbc:mysql://localhost:3306/mydb", "root", "password");
```

## 4.5 使用场景与案例

### 4.5.1 文件导出系统

```java
/**
 * 抽象产品：文档导出器
 */
public interface DocumentExporter {
    void export(Document document, OutputStream outputStream) throws ExportException;
    String getFormatName();
}

class ExportException extends Exception {
    public ExportException(String message, Throwable cause) {
        super(message, cause);
    }
}

/**
 * 具体产品：PDF导出器
 */
public class PdfExporter implements DocumentExporter {
    @Override
    public void export(Document document, OutputStream outputStream) throws ExportException {
        System.out.println("Exporting document to PDF...");
        // 使用 iText 或 Apache PDFBox 生成 PDF
        System.out.println("PDF export completed: " + document.getTitle());
    }

    @Override
    public String getFormatName() {
        return "PDF";
    }
}

/**
 * 具体产品：Excel导出器
 */
public class ExcelExporter implements DocumentExporter {
    @Override
    public void export(Document document, OutputStream outputStream) throws ExportException {
        System.out.println("Exporting document to Excel...");
        // 使用 Apache POI 生成 Excel
        System.out.println("Excel export completed: " + document.getTitle());
    }

    @Override
    public String getFormatName() {
        return "Excel";
    }
}

/**
 * 具体产品：Word导出器
 */
public class WordExporter implements DocumentExporter {
    @Override
    public void export(Document document, OutputStream outputStream) throws ExportException {
        System.out.println("Exporting document to Word...");
        // 使用 Apache POI 生成 Word
        System.out.println("Word export completed: " + document.getTitle());
    }

    @Override
    public String getFormatName() {
        return "Word";
    }
}

/**
 * 导出器工厂
 */
public class ExporterFactory {

    private static final Map<String, Supplier<DocumentExporter>> FACTORIES = Map.of(
            "pdf",   PdfExporter::new,
            "excel", ExcelExporter::new,
            "word",  WordExporter::new
    );

    public static DocumentExporter createExporter(String format) {
        Supplier<DocumentExporter> supplier = FACTORIES.get(format.toLowerCase());
        if (supplier == null) {
            throw new IllegalArgumentException("Unsupported export format: " + format);
        }
        return supplier.get();
    }
}
```

### 4.5.2 消息通知服务

```java
/**
 * 抽象产品：消息发送器
 */
public interface MessageSender {
    void send(String recipient, String title, String content);
    boolean isAvailable();
}

/**
 * 具体产品：邮件发送器
 */
public class EmailSender implements MessageSender {
    @Override
    public void send(String recipient, String title, String content) {
        System.out.println("[Email] To: " + recipient);
        System.out.println("[Email] Subject: " + title);
        System.out.println("[Email] Body: " + content);
    }

    @Override
    public boolean isAvailable() {
        return true; // 检查邮件服务器是否可用
    }
}

/**
 * 具体产品：短信发送器
 */
public class SmsSender implements MessageSender {
    @Override
    public void send(String recipient, String title, String content) {
        System.out.println("[SMS] To: " + recipient);
        System.out.println("[SMS] Content: " + content);
        // 实际调用短信网关API
    }

    @Override
    public boolean isAvailable() {
        return true;
    }
}

/**
 * 具体产品：App推送发送器
 */
public class PushNotificationSender implements MessageSender {
    @Override
    public void send(String recipient, String title, String content) {
        System.out.println("[Push] Device: " + recipient);
        System.out.println("[Push] Title: " + title);
        System.out.println("[Push] Content: " + content);
        // 调用 Firebase Cloud Messaging 或 APNs
    }

    @Override
    public boolean isAvailable() {
        return true;
    }
}

/**
 * 消息工厂
 */
public class MessageSenderFactory {

    private static final Map<String, Supplier<MessageSender>> SENDERS = new ConcurrentHashMap<>();

    static {
        SENDERS.put("email", EmailSender::new);
        SENDERS.put("sms", SmsSender::new);
        SENDERS.put("push", PushNotificationSender::new);
    }

    public static MessageSender getSender(String channel) {
        Supplier<MessageSender> supplier = SENDERS.get(channel.toLowerCase());
        if (supplier == null) {
            throw new IllegalArgumentException("Unknown notification channel: " + channel);
        }
        return supplier.get();
    }

    /**
     * 获取指定用户的首选通知方式
     */
    public static MessageSender getSenderForUser(User user) {
        String preferredChannel = user.getPreferredNotificationChannel();
        return getSender(preferredChannel);
    }
}
```

## 4.6 潜在风险与问题

### 4.6.1 类数量膨胀

**问题**：每增加一个新产品，需要新增至少两个类（一个具体产品类 + 一个具体工厂类）。当产品种类很多时，类的数量会急剧膨胀。

```
场景：10种产品 × 2（产品+工厂） = 20个类
场景：50种产品 → 100个类
```

**解决**：
- 产品种类少且固定时，使用静态工厂方法减少类的数量
- 产品种类多时，使用反射 + 配置文件，完全消除具体工厂类
- 必要时接受类的数量增长（清晰的代码结构 > 文件数量）

### 4.6.2 抽象产品的单一性

**问题**：工厂方法模式假设所有产品实现同一个接口。如果产品差异很大（如按钮和下拉框），单一产品接口就不够用，此时应升级为抽象工厂模式。

### 4.6.3 工厂与产品的耦合

**问题**：在静态工厂方法中，工厂类需要知道所有具体产品类。每新增产品都需修改工厂类，违反开闭原则。

**解决**：使用反射工厂、SPI机制或Lambda表达式注册。

### 4.6.4 静态工厂方法的限制

```java
// 以下问题都是静态工厂方法的局限：

// 1. 不能被子类化
public class ChildFactory extends PaymentFactory {  // 无意义
    // 静态方法不能被子类重写
}

// 2. 难以区分工厂方法和普通静态方法
// 需要遵循命名约定：create*, get*, new*, of*, valueOf*, instance*
public static Payment alipay() { ... }     // 好
public static Payment setupPayment() { .. } // 不好

// 3. 不支持依赖注入
// 静态方法无法通过Spring注入配置值
```

### 4.6.5 线程安全问题

如果工厂使用缓存，需要考虑并发安全：

```java
// 错误的缓存实现（非线程安全）
public class UnsafeCachingFactory {
    private static Map<String, Product> cache = new HashMap<>();

    public static Product getProduct(String type) {
        Product product = cache.get(type);
        if (product == null) {
            product = createProduct(type);
            cache.put(type, product);  // 并发写可能导致数据错乱
        }
        return product;
    }
}

// 正确的实现
public class SafeCachingFactory {
    private static final Map<String, Product> cache = new ConcurrentHashMap<>();

    public static Product getProduct(String type) {
        return cache.computeIfAbsent(type, key -> createProduct(key));
    }
}
```

## 4.7 优化策略

### 4.7.1 使用SPI机制自动发现实现

Java的SPI（Service Provider Interface）机制可以实现运行时的工厂扩展。

```java
// 1. 定义产品接口
public interface PaymentProvider {
    String getName();
    Payment createPayment();
}

// 2. 在 META-INF/services/com.example.PaymentProvider 文件中配置实现类
// com.example.AlipayProvider
// com.example.WechatPayProvider

// 3. SPI加载器自动发现实现
public class SpiPaymentFactory {
    private static final Map<String, PaymentProvider> providers = new ConcurrentHashMap<>();

    static {
        // 通过SPI加载所有 PaymentProvider 实现
        ServiceLoader<PaymentProvider> loader = ServiceLoader.load(PaymentProvider.class);
        for (PaymentProvider provider : loader) {
            providers.put(provider.getName().toLowerCase(), provider);
            System.out.println("SPI discovered: " + provider.getName());
        }
    }

    public static Payment createPayment(String name) {
        PaymentProvider provider = providers.get(name.toLowerCase());
        if (provider == null) {
            throw new IllegalArgumentException("No provider found for: " + name);
        }
        return provider.createPayment();
    }
}
```

### 4.7.2 泛型工厂

```java
/**
 * 泛型工厂 -- 适用于需要类型安全的工厂场景
 */
public class GenericFactory<T> {

    private final Map<String, Supplier<? extends T>> factories = new ConcurrentHashMap<>();

    public void register(String key, Supplier<? extends T> factory) {
        factories.put(key.toLowerCase(), factory);
    }

    public T create(String key) {
        Supplier<? extends T> factory = factories.get(key.toLowerCase());
        if (factory == null) {
            throw new IllegalArgumentException("No factory registered for: " + key);
        }
        return factory.get();
    }
}

// 使用示例
GenericFactory<Payment> paymentFactory = new GenericFactory<>();
paymentFactory.register("alipay", Alipay::new);
paymentFactory.register("wechat", WechatPay::new);

Payment payment = paymentFactory.create("alipay");
```

### 4.7.3 何时升级到抽象工厂

当出现以下信号时，应考虑从工厂方法升级到抽象工厂：

1. **需要创建多个相关的产品**：如UI系统中的按钮、输入框、下拉菜单必须出自同一风格
2. **产品之间存在约束关系**：如特定数据库的连接对象只能和该数据库的Statement搭配使用
3. **需要保证产品族的一致性**：避免客户端混用不同产品族的产品

### 4.7.4 最佳实践总结

| 场景 | 推荐实现 | 优势 |
|------|----------|------|
| 产品少且固定（<5种） | 静态工厂方法 | 简单直接，代码量少 |
| 产品多且频繁变化 | 反射 + 配置文件 | 完全解耦，符合开闭原则 |
| 使用DI框架 | 容器管理（Spring Bean） | 统一管理，AOP支持 |
| 需要类型安全 | 泛型工厂 | 编译期类型检查 |
| 插件式架构 | SPI机制 | 运行时扩展，解耦彻底 |
| 复杂创建逻辑 | 经典工厂方法 | 逻辑封装，子类控制 |

## 本章小结

本章全面剖析了工厂方法模式：

1. **核心思想**：定义创建对象的接口，让子类决定实例化哪个类。将对象创建与使用分离，遵循"依赖抽象"原则。

2. **四种角色**：Product（抽象产品）、ConcreteProduct（具体产品）、Creator（抽象创建者）、ConcreteCreator（具体创建者）。

3. **五种实现方式**：
   - 经典工厂方法（子类决定创建什么，完全符合开闭原则）
   - 静态工厂方法（简洁直接，适合产品固定的场景）
   - 反射工厂（配置文件驱动，完全解耦）
   - Lambda工厂（函数式编程风格，代码最简洁）
   - 容器管理（Spring风格，统一生命周期管理）

4. **框架应用**：JDK的 `Calendar`、`NumberFormat`、Spring的 `FactoryBean`、MyBatis的 `SqlSessionFactory`。

5. **三大风险**：类数量膨胀、开闭原则违反（静态工厂）、线程安全问题。

6. **优化方向**：反射配置、SPI扩展、泛型工厂，以及在需要创建产品族时升级为抽象工厂模式。

**核心认知**：工厂方法的本质是"将变化封装"。哪个维度可能变化（产品类型、创建方式），就在那个维度上抽象化。产品种类变化 → 抽象产品接口；创建逻辑变化 → 抽象工厂类。

---

在下一章中，我们将学习抽象工厂模式，它扩展了工厂方法模式，可以创建一系列相关的产品对象。
