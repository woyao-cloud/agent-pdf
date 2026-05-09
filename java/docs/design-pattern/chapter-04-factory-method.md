# 第4章 工厂方法模式（Factory Method）
+
**工厂方法模式**是创建型模式中最核心的模式，它定义了创建对象的接口，但由子类决定具体创建哪个类的实例。
+
## 4.1 解决的问题与应用场景
+
### 4.1.1 问题分析
+
在软件系统中，对象的创建往往是一个复杂的过程：可能需要处理配置信息、依赖关系、初始化逻辑等。如果将对象创建逻辑直接放在客户端代码中，会造成：- **客户端代码与具体产品类耦合**- **对象创建逻辑难以复用**
- **违反开闭原则**：新增产品需要修改客户端代码
+
### 4.1.2 典型应用场景
+
**1. 数据库连接创建**```java
// 不同数据库使用不同的连接方式Connection conn = DatabaseFactory.getConnection("mysql");
```**2. 支付方式选择**```java
Payment payment = PaymentFactory.createPayment("alipay");
payment.pay(100.0);```**3. 日志记录器**```java
Logger logger = LoggerFactory.createLogger("file");logger.info("message");
```**4. 文档导出**```java
Exporter exporter = ExporterFactory.createExporter("pdf");exporter.export(data);
```**5. 图形绘制**```java
Shape shape = ShapeFactory.createShape("circle");
shape.draw();
```
+
## 4.2 实现原理与UML
+
### 4.2.1 核心思想
+
工厂方法模式的核心是**将对象的创建委托给子类**，客户端只需要知道抽象类型，不需要关心具体实现细节。
+
### 4.2.2 UML类图
+
```┌─────────────────┐         ┌─────────────────┐
│  Product        │         │  Creator        │
│  (抽象产品)      │         │  (抽象工厂)      │
├─────────────────┤         ├─────────────────┤
│ +operation()    │         │ +factoryMethod()│
└─────────────────┘         │ +anOperation()   │
       ▲                    └─────────────────┘
       │                           ▲
       │                           │
┌──────┴───────┐         ┌────────┴────────┐
│ ConcreteProduct│        │ ConcreteCreator│
│ (具体产品)    │         │ (具体工厂)      │
├──────────────┤         ├─────────────────┤
│ +operation() │         │ +factoryMethod()│
└──────────────┘         └─────────────────┘
```+
### 4.2.3 角色分析
+
- **Product（抽象产品）**：定义产品的接口
- **ConcreteProduct（具体产品）**：实现抽象产品接口
- **Creator（抽象工厂）**：声明工厂方法，返回Product类型
- **ConcreteCreator（具体工厂）**：重写工厂方法，返回ConcreteProduct实例
+
### 4.2.4 时序图
+
```
Client              Creator            ConcreteCreator       ConcreteProduct
   │                   │                      │                    │
   │                   │                      │                    │
   │  anOperation()    │                      │                    │
   │ ───────────────►  │                      │                    │
   │                   │                      │                    │
   │  factoryMethod()  │                      │                    │
   │ ───────────────────────────────────────► │                    │
   │                   │                   (创建实例)               │
   │                   │                      │                    │
   │                   │      product         │                    │
   │ ◄─────────────────────────────────────── │                    │
   │                   │                      │                    │
   │  product.operation()                     │                    │
   │ ────────────────────────────────────────────────────────────►  │
   │                   │                      │                    │
```+
## 4.3 代码实现
+
### 4.3.1 基础实现
+
**抽象产品**```java
public interface Product {    void operation();
}```**具体产品A**```java
public class ConcreteProductA implements Product {    @Override
    public void operation() {        System.out.println("Product A operation");    }}```**具体产品B**```java
public class ConcreteProductB implements Product {    @Override    public void operation() {        System.out.println("Product B operation");    }}```**抽象工厂**```java
public abstract class Creator {    // 工厂方法    public abstract Product createProduct();        // 使用产品的方法    public void operation() {        Product product = createProduct();        product.operation();    }}```**具体工厂A**```java
public class ConcreteCreatorA extends Creator {    @Override    public Product createProduct() {        return new ConcreteProductA();    }}```**具体工厂B**```java
public class ConcreteCreatorB extends Creator {    @Override    public Product createProduct() {        return new ConcreteProductB();    }}```**客户端使用**```java
public class Client {    public static void main(String[] args) {        Creator creatorA = new ConcreteCreatorA();        creatorA.operation();        Creator creatorB = new ConcreteCreatorB();        creatorB.operation();    }}```+
### 4.3.2 简化实现（静态工厂方法）
+
在Java中，更常见的实现是使用静态工厂方法：```java
public interface Payment {    void pay(double amount);}public class Alipay implements Payment {    @Override    public void pay(double amount) {        System.out.println("Alipay: " + amount);    }}public class WechatPay implements Payment {    @Override    public void pay(double amount) {        System.out.println("Wechat: " + amount);    }}public class PaymentFactory {    public static Payment createPayment(String type) {        switch (type) {            case "alipay":                return new Alipay();            case "wechat":                return new WechatPay();            default:                throw new IllegalArgumentException("Unknown payment type: " + type);        }    }}```**使用**```java
Payment payment = PaymentFactory.createPayment("alipay");payment.pay(100.0);```+
### 4.3.3 泛型工厂
+
使用泛型创建更灵活的工厂：```java
public class GenericFactory<T> {    private final Supplier<T> creator;        public GenericFactory(Supplier<T> creator) {        this.creator = creator;    }        public T create() {        return creator.get();    }}// 使用GenericFactory<Payment> alipayFactory = new GenericFactory<>(Alipay::new);Payment alipay = alipayFactory.create();
```
+
### 4.3.4 反射工厂
+
利用反射减少工厂与产品的耦合：```java
public class ReflectiveFactory {    private static final Map<String, Class<?>> PRODUCT_TYPES =            new HashMap<>();        static {        PRODUCT_TYPES.put("alipay", Alipay.class);        PRODUCT_TYPES.put("wechat", WechatPay.class);    }        @SuppressWarnings("unchecked")    public static <T> T createProduct(Class<T> clazz) {        try {            return clazz.getDeclaredConstructor().newInstance();        } catch (Exception e) {            throw new RuntimeException("Failed to create product: " + clazz.getName(), e);        }    }        public static <T> T createProduct(String type, Class<T> baseType) {        Class<?> clazz = PRODUCT_TYPES.get(type.toLowerCase());        if (clazz == null) {            throw new IllegalArgumentException("Unknown product type: " + type);        }        if (!baseType.isAssignableFrom(clazz)) {            throw new IllegalArgumentException("Type mismatch");        }        return (T) createProduct(clazz);    }}```+
### 4.3.5 使用容器（Spring风格）
+
使用Map容器管理工厂：```java
public class PaymentFactory {    private static final Map<String, Payment> PAYMENTS = new HashMap<>();        static {        PAYMENTS.put("alipay", new Alipay());        PAYMENTS.put("wechat", new WechatPay());        PAYMENTS.put("bankcard", new BankCardPayment());    }        public static Payment getPayment(String type) {        Payment payment = PAYMENTS.get(type.toLowerCase());        if (payment == null) {            throw new IllegalArgumentException("Unknown payment type: " + type);        }        return payment;    }        // 支持注册新支付方式    public static void register(String type, Payment payment) {        PAYMENTS.put(type.toLowerCase(), payment);    }}```+
## 4.4 JDK/框架源码解析
+
### 4.4.1 JDK中的工厂方法
+
**1. Calendar类**```java
public abstract class Calendar implements Serializable, Cloneable {    // 工厂方法    public static Calendar getInstance() {        return createCalendar(TimeZone.getDefault(), Locale.getDefault());    }        private static Calendar createCalendar(TimeZone zone, Locale aLocale) {        // 根据地区返回不同的日历实现        if (aLocale.getLanguage().equals("zh")) {            return new BuddhistCalendar(zone, aLocale);        }        // ...其他实现        return new GregorianCalendar(zone, aLocale);    }}```**2. NumberFormat类**```java
public abstract class NumberFormat extends Format {    // 工厂方法    public static NumberFormat getInstance() {        return getInstance(Locale.getDefault(), NUMBERSTYLE);    }        public static NumberFormat getCurrencyInstance() {        return getInstance(Locale.getDefault(), CURRENCYSTYLE);    }}```**3. Colections类**```java
public class Collections {    // 工厂方法    public static <T> List<T> emptyList() {        return (List<T>) EMPTY_LIST;    }        public static <K, V> Map<K, V> emptyMap() {        return (Map<K, V>) EMPTY_MAP;    }}```**4. Stream API**```java
List<String> list = Arrays.asList("a", "b", "c");Stream<String> stream = list.stream();  // 工厂方法```
+
### 4.4.2 Spring框架中的应用
+
**1. BeanFactory**```java
public interface BeanFactory {    Object getBean(String name) throws BeansException;    // 泛型工厂方法    <T> T getBean(Class<T> requiredType) throws BeansException;}```**2. FactoryBean接口**```java
public interface FactoryBean<T> {    T getObject() throws Exception;    Class<?> getObjectType();    boolean isSingleton();}```**3. SqlSessionFactory**```java
public interface SqlSessionFactory {    SqlSession openSession();    SqlSession openSession(boolean autoCommit);}```
+
### 4.4.3 MyBatis中的工厂模式
+
**SqlSessionFactory创建SqlSession**```java
public class DefaultSqlSessionFactory implements SqlSessionFactory {    @Override    public SqlSession openSession() {        return openSessionFromDataSource(            configuration.getDefaultExecutorType(),             null, false);    }        private SqlSession openSessionFromDataSource(        ExecutorType execType, TransactionIsolationLevel level, boolean autoCommit) {        Transaction tx = null;        try {            final Environment environment = configuration.getEnvironment();            TransactionFactory transactionFactory =                getTransactionFactoryFromEnvironment(environment);            tx = transactionFactory.newTransaction(                dataSource, level, autoCommit);            final Executor executor = configuration.newExecutor(tx, execType);            return new DefaultSqlSession(                configuration, executor, autoCommit);        } catch (Exception e) {            closeTransaction(tx);            throw ExceptionFactory.wrapException("Error opening session.  Cause: " + e, e);        } finally {            ErrorContext.instance().reset();        }    }}```
+
### 4.4.4 日志框架中的应用
+
**Logback**```javapublic class LoggerFactory {    public static Logger getLogger(String name) {        return getILoggerFactory().getLogger(name);    }}```
+
## 4.5 使用场景与案例
+
### 4.5.1 数据库连接工厂
+
```java
// 抽象产品public interface Connection {    void connect();    void disconnect();    void execute(String sql);}// 具体产品public class MySQLConnection implements Connection {    @Override    public void connect() { System.out.println("Connected to MySQL"); }    @Override    public void disconnect() { System.out.println("Disconnected from MySQL"); }    @Override    public void execute(String sql) { System.out.println("Executing: " + sql); }}public class PostgreSQLConnection implements Connection {    @Override    public void connect() { System.out.println("Connected to PostgreSQL"); }    @Override    public void disconnect() { System.out.println("Disconnected from PostgreSQL"); }    @Override    public void execute(String sql) { System.out.println("Executing: " + sql); }}// 抽象工厂public interface ConnectionFactory {    Connection createConnection();}// 具体工厂public class MySQLConnectionFactory implements ConnectionFactory {    @Override    public Connection createConnection() {        return new MySQLConnection();    }}public class PostgreSQLConnectionFactory implements ConnectionFactory {    @Override    public Connection createConnection() {        return new PostgreSQLConnection();    }}// 客户端代码public class DatabaseManager {    private ConnectionFactory factory;    private Connection connection;        public DatabaseManager(ConnectionFactory factory) {        this.factory = factory;    }        public void connect() {        connection = factory.createConnection();        connection.connect();    }}```
+
### 4.5.2 图形编辑器
+
```java
// 抽象产品public interface Shape {    void draw();    void erase();}// 具体产品public class Circle implements Shape {    @Override    public void draw() { System.out.println("Drawing Circle"); }    @Override    public void erase() { System.out.println("Erasing Circle"); }}public class Rectangle implements Shape {    @Override    public void draw() { System.out.println("Drawing Rectangle"); }    @Override    public void erase() { System.out.println("Erasing Rectangle"); }}public class Triangle implements Shape {    @Override    public void draw() { System.out.println("Drawing Triangle"); }    @Override    public void erase() { System.out.println("Erasing Triangle"); }}// 抽象工厂public interface ShapeFactory {    Shape createShape();}// 具体工厂public class CircleFactory implements ShapeFactory {    @Override    public Shape createShape() {        return new Circle();    }}public class RectangleFactory implements ShapeFactory {    @Override    public Shape createShape() {        return new Rectangle();    }}// 画布public class Canvas {    private List<Shape> shapes = new ArrayList<>();        public void addShape(ShapeFactory factory) {        shapes.add(factory.createShape());    }        public void drawAll() {        for (Shape shape : shapes) {            shape.draw();        }    }}```+
### 4.5.3 消息发送系统
+
```java
// 抽象产品public interface MessageSender {    void send(String to, String content);}// 具体产品public class EmailSender implements MessageSender {    @Override    public void send(String to, String content) {        System.out.println("Sending email to " + to + ": " + content);    }}public class SmsSender implements MessageSender {    @Override    public void send(String to, String content) {        System.out.println("Sending SMS to " + to + ": " + content);    }}public class WechatMessageSender implements MessageSender {    @Override    public void send(String to, String content) {        System.out.println("Sending Wechat message to " + to + ": " + content);    }}// 简单工厂（静态方法）public class MessageSenderFactory {    public static MessageSender createSender(String type) {        switch (type) {            case "email": return new EmailSender();            case "sms": return new SmsSender();            case "wechat": return new WechatMessageSender();            default: throw new IllegalArgumentException("Unknown sender type: " + type);        }    }}// 使用public class NotificationService {    public void notifyUser(String userId, String message) {        String type = getUserPreferredChannel(userId);        MessageSender sender = MessageSenderFactory.createSender(type);        sender.send(userId, message);    }        private String getUserPreferredChannel(String userId) {        // 从用户配置获取        return "email";    }}```+
## 4.6 潜在风险与问题
+
### 4.6.1 类的数量膨胀
+
每增加一种产品，需要增加：- 具体产品类- 具体工厂类（如果是工厂方法模式）
+
**解决方案**：使用简单工厂 + 配置文件
+
### 4.6.2 工厂与产品的耦合
+
简单工厂模式违反开闭原则，每添加新产品需要修改工厂类。
+
**解决方案**：- 使用工厂方法模式- 使用反射 + 配置文件- 使用容器管理
+
### 4.6.3 静态工厂方法的问题
+
静态工厂方法有一些限制：- 不能被子类继承- 不能有多个带有相同参数签名的静态工厂方法- 静态工厂方法与普通静态方法难以区分
+
**解决方案**：- 遵循命名规范（valueOf、of、create、instance等）- 配合文档说明
+
### 4.6.4 线程安全问题
+
如果使用容器缓存产品实例，需要注意线程安全：```java// 错误的实现public class UnsafeFactory {    private static Map<String, Product> cache = new HashMap<>();        public static Product getProduct(String type) {        Product product = cache.get(type);        if (product == null) {            product = createProduct(type);            cache.put(type, product);        }        return product;    }}```**解决方案**：使用ConcurrentHashMap```java
private static final Map<String, Product> cache = new ConcurrentHashMap<>();```+
### 4.6.5 过度使用
+
不应该为了使用工厂模式而使用：- 产品种类固定，不会变化- 对象的创建非常简单- 不需要解耦
+
## 4.7 优化策略
+
### 4.7.1 使用反射 + 配置文件
+
结合反射和配置文件，彻底解耦：```java// config.properties
# 产品映射product.alipay=com.example.AlipayProduct wechat=com.example.WechatPayProduct bankcard=com.example.BankCardPayment// ProductFactorypublic class ProductFactory {    private static final Map<String, Product> PRODUCTS = new ConcurrentHashMap<>();    private static final Properties config = new Properties();        static {        try (InputStream is = ProductFactory.class.getClassLoader()            .getResourceAsStream("config.properties")) {            config.load(is);        } catch (IOException e) {            throw new RuntimeException("Failed to load config", e);        }    }        @SuppressWarnings("unchecked")    public static <T extends Product> T createProduct(String type, Class<T> clazz) {        return (T) PRODUCTS.computeIfAbsent(type, t -> {            try {                String className = config.getProperty("product." + type);                return (Product) Class.forName(className).getDeclaredConstructor().newInstance();            } catch (Exception e) {                throw new RuntimeException("Failed to create product: " + type, e);            }        });    }}```+
### 4.7.2 使用Lambda表达式
+
Java 8引入Lambda表达式后，工厂更加简洁：```java
public class LambdaFactory {    private static final Map<String, Supplier<Product>> FACTORIES =            new HashMap<>();        static {        FACTORIES.put("productA", ProductA::new);        FACTORIES.put("productB", ProductB::new);    }        public static Product createProduct(String type) {        Supplier<Product> factory = FACTORIES.get(type);        if (factory == null) {            throw new IllegalArgumentException("Unknown type: " + type);        }        return factory.get();    }}```
+
### 4.7.3 链式工厂
+
构建复杂的对象时使用链式调用：```java
public class User {    private String name;    private int age;    private String email;        private User(Builder builder) {        this.name = builder.name;        this.age = builder.age;        this.email = builder.email;    }        public static Builder builder() {        return new Builder();    }        public static class Builder {        private String name;        private int age;        private String email;                public Builder name(String name) {            this.name = name;            return this;        }                public Builder age(int age) {            this.age = age;            return this;        }                public Builder email(String email) {            this.email = email;            return this;        }                public User build() {            return new User(this);        }    }}// 使用User user = User.builder()    .name("John")    .age(30)    .email("john@example.com")    .build();```
+
### 4.7.4 最佳实践总结
+
| 场景 | 推荐方式 | 原因 | |------|----------|------| | 产品种类少且固定 | 简单静态工厂 | 简单直接 | | 产品种类多且经常变化 | 反射 + 配置文件 | 解耦，易扩展 | | 需要延迟加载 | 工厂方法模式 | 子类控制创建 | | 复杂对象构建 | Builder模式 | 链式调用 | | 需要依赖注入 | 容器管理(Spring) | 统一管理 |
+
## 本章小结
+
本章详细介绍了工厂方法模式：
+
1. **解决的问题**：将对象的创建与使用解耦，避免客户端与具体产品耦合
2. **UML结构**：抽象产品、具体产品、抽象工厂、具体工厂
3. **实现方式**：基础工厂方法、静态工厂、反射工厂、容器管理
4. **框架应用**：JDK Calendar、Spring BeanFactory、MyBatis SqlSessionFactory
5. **潜在问题**：类数量膨胀、违反开闭原则、过度使用
6. **优化策略**：反射+配置文件、Lambda表达式、链式工厂
+
**工厂模式是最常用的创建型模式**，在实际开发中应根据产品复杂度和变化频率选择合适的实现方式。
+
---+
在下一章中，我们将学习抽象工厂模式，它是对工厂方法模式的扩展，可以创建一系列相关的产品。