# 第2章 面向对象设计原则

设计模式不是凭空产生的，它们背后有一套系统的指导原则。如果把设计模式比作武术中的招式，那么设计原则就是内功心法。招式可以千变万化，但心法是根本。

本章介绍的七大设计原则是理解和使用设计模式的基石。在深入学习每种具体的设计模式之前，请务必先把这些原则内化。

## 2.1 单一职责原则（SRP）

### 2.1.1 核心定义

**单一职责原则**（Single Responsibility Principle，SRP）是 SOLID 原则中第一个，也是最基础的一个。它的定义非常简洁：

> 一个类应该有且只有一个引起它变化的原因（There should never be more than one reason for a class to change）。

通俗的理解：**一个类只做一件事，并且做好它。**

Robert C. Martin（Uncle Bob）进一步将"职责"定义为"变化的原因"。如果你能想到多于一个动机去改变一个类，那么这个类就具有多于一个的职责。

### 2.1.2 为什么需要SRP

在真实项目中，违反 SRP 的类会表现出以下症状：

- **修改一个功能时影响了另一个功能**：改动用户验证逻辑，结果注册功能出了Bug
- **类的体积失控**：一个类动辄上千行，包含了各种不相关的逻辑
- **难以测试**：想单独测试数据持久化逻辑，却必须初始化电子邮件服务
- **合并冲突频繁**：多人修改同一个类的不同功能导致Git冲突
- **代码晦涩难懂**：新成员看了一天也理不清这个类到底做了什么

### 2.1.3 违规案例分析

下面是一个典型违反 SRP 的场景——"万能用户管理类"：

```java
// 违反 SRP 的典型案例 —— 一个类承担了过多职责
public class UserManager {
    private Connection connection;

    // 职责1：数据库连接管理
    public void openConnection() {
        // 获取数据库连接
    }

    public void closeConnection() {
        // 关闭数据库连接
    }

    // 职责2：用户输入验证
    public boolean validateEmail(String email) {
        // 邮箱格式验证
        return email != null && email.contains("@");
    }

    public boolean validatePassword(String password) {
        // 密码强度验证
        return password != null && password.length() >= 8;
    }

    // 职责3：业务逻辑
    public void register(String username, String email, String password) {
        if (!validateEmail(email)) {
            throw new IllegalArgumentException("邮箱格式不正确");
        }
        if (!validatePassword(password)) {
            throw new IllegalArgumentException("密码强度不足");
        }
        // 检查用户名是否重复...
        // 加密密码...
        // 保存到数据库...
        // 发送欢迎邮件...
        // 记录注册日志...
    }

    public void login(String username, String password) {
        // 验证用户名密码
        // 更新最后登录时间
        // 记录登录日志
    }

    // 职责4：数据持久化
    public void saveUser(User user) {
        // INSERT 语句
    }

    public User findUserById(Long id) {
        // SELECT 语句
    }

    public void updateUser(User user) {
        // UPDATE 语句
    }

    // 职责5：邮件通知
    public void sendWelcomeEmail(String email) {
        // SMTP 发送邮件
    }

    public void sendPasswordResetEmail(String email) {
        // SMTP 发送邮件
    }

    // 职责6：日志记录
    public void logUserAction(String username, String action) {
        // 写日志文件或数据库
    }
}
```

这个类的问题非常明显：
- 当验证规则变化时 → 修改 UserManager
- 当数据库切换时 → 修改 UserManager
- 当邮件服务切换时 → 修改 UserManager
- 当日志格式变化时 → 修改 UserManager

任何一个职责的变化都会触发对这个类的修改，每次修改都可能引入新的Bug。

### 2.1.4 解决方案：职责分离

将各个职责拆分到独立的类中，每个类专注于一件事：

```java
// 1. 用户实体 —— 纯粹的领域对象
public class User {
    private Long id;
    private String username;
    private String email;
    private String passwordHash;

    // 构造方法、Getter（不提供 Setter，保持不可变性）
    public User(String username, String email, String passwordHash) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
}

// 2. 输入验证 —— 专注于验证规则
public class UserValidator {
    private static final String EMAIL_PATTERN =
            "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$";
    private static final int MIN_PASSWORD_LENGTH = 8;

    public void validate(UserRegistrationRequest request) {
        List<String> errors = new ArrayList<>();

        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            errors.add("用户名不能为空");
        }
        if (!isValidEmail(request.getEmail())) {
            errors.add("邮箱格式不正确");
        }
        if (!isValidPassword(request.getPassword())) {
            errors.add("密码长度至少" + MIN_PASSWORD_LENGTH + "位");
        }

        if (!errors.isEmpty()) {
            throw new ValidationException(String.join(", ", errors));
        }
    }

    private boolean isValidEmail(String email) {
        return email != null && email.matches(EMAIL_PATTERN);
    }

    private boolean isValidPassword(String password) {
        return password != null && password.length() >= MIN_PASSWORD_LENGTH;
    }
}

// 3. 密码加密 —— 专注于密码安全
public class PasswordEncoder {
    public String encode(String rawPassword) {
        // 使用 BCrypt 或 Argon2 加密
        return BCrypt.hashpw(rawPassword, BCrypt.gensalt());
    }

    public boolean matches(String rawPassword, String encodedPassword) {
        return BCrypt.checkpw(rawPassword, encodedPassword);
    }
}

// 4. 数据持久化 —— 专注于数据库操作
public class UserRepository {
    private final DataSource dataSource;

    public UserRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public User save(User user) {
        String sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
        // 执行插入操作，返回带ID的User对象
        // ...
        return user;
    }

    public Optional<User> findByEmail(String email) {
        String sql = "SELECT * FROM users WHERE email = ?";
        // 执行查询操作
        // ...
        return Optional.empty();
    }

    public Optional<User> findById(Long id) {
        String sql = "SELECT * FROM users WHERE id = ?";
        // 执行查询操作
        // ...
        return Optional.empty();
    }
}

// 5. 邮件服务 —— 专注于邮件发送
public class EmailService {
    private final String smtpHost;
    private final int smtpPort;

    public EmailService(String smtpHost, int smtpPort) {
        this.smtpHost = smtpHost;
        this.smtpPort = smtpPort;
    }

    public void sendWelcomeEmail(String toEmail, String username) {
        String subject = "欢迎注册 " + username;
        String body = "感谢您注册我们的平台...";
        send(toEmail, subject, body);
    }

    private void send(String to, String subject, String body) {
        // SMTP 发送逻辑
        System.out.println("发送邮件到 " + to + ": " + subject);
    }
}

// 6. 用户注册服务 —— 协调各组件完成注册流程（符合迪米特法则）
public class UserRegistrationService {
    private final UserValidator validator;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;
    private final EmailService emailService;

    public UserRegistrationService(UserValidator validator,
                                   PasswordEncoder passwordEncoder,
                                   UserRepository userRepository,
                                   EmailService emailService) {
        this.validator = validator;
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
        this.emailService = emailService;
    }

    public User register(UserRegistrationRequest request) {
        // 1. 验证输入
        validator.validate(request);

        // 2. 加密密码
        String passwordHash = passwordEncoder.encode(request.getPassword());

        // 3. 创建用户对象
        User user = new User(request.getUsername(), request.getEmail(), passwordHash);

        // 4. 持久化到数据库
        User savedUser = userRepository.save(user);

        // 5. 发送欢迎邮件
        emailService.sendWelcomeEmail(savedUser.getEmail(), savedUser.getUsername());

        return savedUser;
    }
}
```

### 2.1.5 如何判断职责边界

判断一个类是否违反了 SRP，可以问自己三个问题：

1. **"如果这个类的某个行为需要改变，是否会影响其他不相关的行为？"**
   - 是 → 可能违反 SRP

2. **"你能用一句话描述这个类的职责吗？"**
   - 如果句子中出现了"和"、"或"等词汇 → 可能违反 SRP
   - 如果句子本身就很拗口 → 可能违反 SRP

3. **"这个类的测试用例是否可以自然地划分为几组互不相关的测试？"**
   - 是 → 可能违反 SRP

### 2.1.6 SRP 的实践注意事项

- **粒度问题**：不要过度拆分。如果一个类的所有行为都服务于同一个业务概念，即使方法多一点也可能符合SRP
- **以业务定义职责**："职责"应由业务概念定义，而非技术概念。一个UserService可以同时调用UserRepository和EmailService，因为它的职责是"完成用户注册流程"
- **渐进式重构**：不需要一开始就完美分离。当类开始膨胀时再重构，此时你对职责边界的理解也更深

## 2.2 开闭原则（OCP）

### 2.2.1 核心定义

**开闭原则**（Open-Closed Principle，OCP）是面向对象设计中最核心的原则之一。Bertrand Meyer 在1988年提出：

> 软件实体（类、模块、函数等）应该对扩展开放，对修改关闭。

换句话说：**当需求变化时，应该通过扩展现有代码来满足新需求，而不是修改现有代码。**

### 2.2.2 违规案例分析

一个典型的违反 OCP 的场景 ——"充满if-else的支付处理"：

```java
// 违反 OCP —— 每次新增支付方式都要修改该类
public class PaymentProcessor {
    public PaymentResult process(PaymentRequest request) {
        switch (request.getPaymentType()) {
            case "ALIPAY":
                return processAlipay(request);
            case "WECHAT":
                return processWechat(request);
            case "UNIONPAY":
                return processUnionpay(request);
            case "CREDIT_CARD":
                return processCreditCard(request);
            default:
                throw new UnsupportedOperationException(
                        "不支持的支付方式: " + request.getPaymentType());
        }
    }

    private PaymentResult processAlipay(PaymentRequest request) {
        // 支付宝支付逻辑 (50行代码...)
        return new PaymentResult();
    }

    private PaymentResult processWechat(PaymentRequest request) {
        // 微信支付逻辑 (50行代码...)
        return new PaymentResult();
    }

    private PaymentResult processUnionpay(PaymentRequest request) {
        // 银联支付逻辑 (50行代码...)
        return new PaymentResult();
    }

    private PaymentResult processCreditCard(PaymentRequest request) {
        // 信用卡支付逻辑 (50行代码...)
        return new PaymentResult();
    }

    // 问题：
    // 1. 每增加一种支付方式，就要修改此类（增加case分支和新方法）
    // 2. 这个类会越来越臃肿
    // 3. 修改可能影响已有的支付方式
    // 4. 无法在不修改此类的情况下由第三方扩展新的支付方式
}
```

### 2.2.3 解决方案：抽象 + 多态

使用抽象和多态将**变化的部分**隔离：

```java
// 1. 定义支付策略接口 —— 稳定的抽象
public interface PaymentStrategy {
    /**
     * 执行支付
     * @param request 支付请求
     * @return 支付结果
     * @throws PaymentException 支付失败时抛出
     */
    PaymentResult pay(PaymentRequest request) throws PaymentException;

    /** 支付方式名称 */
    String getName();

    /** 是否支持该支付请求 */
    boolean supports(PaymentRequest request);
}

// 2. 具体支付策略实现 —— 可扩展的多个实现
public class AlipayPaymentStrategy implements PaymentStrategy {
    @Override
    public PaymentResult pay(PaymentRequest request) throws PaymentException {
        // 参数校验
        validateRequest(request);

        // 调用支付宝API
        AlipayClient client = new AlipayClient(getConfig());
        AlipayResponse response = client.execute(buildOrder(request));

        // 结果处理
        if (response.isSuccess()) {
            return PaymentResult.success(response.getTradeNo());
        } else {
            throw new PaymentException("支付宝支付失败: " + response.getMsg());
        }
    }

    @Override
    public String getName() { return "支付宝"; }

    @Override
    public boolean supports(PaymentRequest request) {
        return "ALIPAY".equalsIgnoreCase(request.getPaymentType());
    }

    private void validateRequest(PaymentRequest request) {
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("支付金额必须大于0");
        }
    }

    private AlipayConfig getConfig() { /* 获取配置 */ return new AlipayConfig(); }
    private AlipayOrder buildOrder(PaymentRequest request) { /* 构建订单 */ return new AlipayOrder(); }
}

public class WechatPaymentStrategy implements PaymentStrategy {
    @Override
    public PaymentResult pay(PaymentRequest request) throws PaymentException {
        // 微信支付特有逻辑
        System.out.println("调用微信支付API: " + request.getOrderNo());
        return PaymentResult.success("WX" + System.currentTimeMillis());
    }

    @Override
    public String getName() { return "微信支付"; }

    @Override
    public boolean supports(PaymentRequest request) {
        return "WECHAT".equalsIgnoreCase(request.getPaymentType());
    }
}

public class UnionpayPaymentStrategy implements PaymentStrategy {
    @Override
    public PaymentResult pay(PaymentRequest request) throws PaymentException {
        System.out.println("调用银联支付API: " + request.getOrderNo());
        return PaymentResult.success("UP" + System.currentTimeMillis());
    }

    @Override
    public String getName() { return "银联支付"; }

    @Override
    public boolean supports(PaymentRequest request) {
        return "UNIONPAY".equalsIgnoreCase(request.getPaymentType());
    }
}

// 3. 支付处理器 —— 对修改关闭
public class PaymentProcessor {
    private final List<PaymentStrategy> strategies;

    // 构造函数注入所有策略实现
    public PaymentProcessor(List<PaymentStrategy> strategies) {
        this.strategies = new ArrayList<>(strategies);
    }

    /**
     * 处理支付，自动选择合适的策略
     * 这个方法的代码永远不需要修改！
     */
    public PaymentResult process(PaymentRequest request) throws PaymentException {
        // 找到支持该请求的策略
        PaymentStrategy strategy = strategies.stream()
                .filter(s -> s.supports(request))
                .findFirst()
                .orElseThrow(() -> new UnsupportedOperationException(
                        "不支持的支付方式: " + request.getPaymentType()));

        System.out.println("使用 " + strategy.getName() + " 处理订单: " + request.getOrderNo());

        // 执行支付
        return strategy.pay(request);
    }

    /** 运行时注册新策略 —— 完全符合OCP */
    public void registerStrategy(PaymentStrategy strategy) {
        strategies.add(strategy);
        System.out.println("注册新支付策略: " + strategy.getName());
    }
}

// 4. 辅助类
public class PaymentRequest {
    private String orderNo;
    private String paymentType;
    private BigDecimal amount;

    public PaymentRequest(String orderNo, String paymentType, BigDecimal amount) {
        this.orderNo = orderNo;
        this.paymentType = paymentType;
        this.amount = amount;
    }

    public String getOrderNo() { return orderNo; }
    public String getPaymentType() { return paymentType; }
    public BigDecimal getAmount() { return amount; }
}

public class PaymentResult {
    private boolean success;
    private String transactionId;
    private String message;

    private PaymentResult(boolean success, String transactionId, String message) {
        this.success = success;
        this.transactionId = transactionId;
        this.message = message;
    }

    public static PaymentResult success(String transactionId) {
        return new PaymentResult(true, transactionId, "支付成功");
    }

    public static PaymentResult failure(String message) {
        return new PaymentResult(false, null, message);
    }

    @Override
    public String toString() {
        return "PaymentResult{success=" + success +
                ", transactionId='" + transactionId + "'" +
                ", message='" + message + "'}";
    }
}

public class PaymentException extends Exception {
    public PaymentException(String message) { super(message); }
    public PaymentException(String message, Throwable cause) { super(message, cause); }
}

// 5. 客户端使用示例
public class PaymentDemo {
    public static void main(String[] args) {
        // 初始化策略列表 —— 这一步可以通过Spring自动注入
        List<PaymentStrategy> strategies = Arrays.asList(
                new AlipayPaymentStrategy(),
                new WechatPaymentStrategy(),
                new UnionpayPaymentStrategy()
        );

        PaymentProcessor processor = new PaymentProcessor(strategies);

        // 处理不同支付方式
        try {
            PaymentResult result1 = processor.process(
                    new PaymentRequest("ORD001", "WECHAT", new BigDecimal("99.00")));
            System.out.println(result1);

            PaymentResult result2 = processor.process(
                    new PaymentRequest("ORD002", "ALIPAY", new BigDecimal("199.00")));
            System.out.println(result2);
        } catch (PaymentException e) {
            e.printStackTrace();
        }

        // 新增支付方式 —— 不需要修改 PaymentProcessor！
        processor.registerStrategy(new PaymentStrategy() {
            @Override
            public PaymentResult pay(PaymentRequest req) {
                return PaymentResult.success("JDPAY" + System.currentTimeMillis());
            }
            @Override
            public String getName() { return "京东支付"; }
            @Override
            public boolean supports(PaymentRequest req) {
                return "JDPAY".equalsIgnoreCase(req.getPaymentType());
            }
        });
    }
}
```

### 2.2.4 OCP 的实现方式

OCP 不是说要永远不修改代码（这不可能），而是通过设计让核心逻辑稳定，变化隔离在扩展点中：

| 实现方式 | 说明 | 典型应用 |
|----------|------|----------|
| **策略模式** | 定义一系列算法，各自封装，可互换 | 支付策略、计算引擎 |
| **模板方法模式** | 父类定义骨架，子类填充细节 | 批处理框架、数据处理 |
| **装饰器模式** | 动态包装对象增强功能 | Java I/O流、中间件管道 |
| **插件架构** | 通过接口定义扩展点，动态加载实现 | IDE插件、SPI机制 |
| **事件驱动** | 通过事件机制解耦触发和处理 | Spring Event、消息队列 |

### 2.2.5 Java SPI 机制 —— OCP 的完美体现

Java 的 **SPI**（Service Provider Interface）机制是 OCP 在产品级的实践：

```java
// 1. 定义SPI接口 —— 稳定的抽象
// 文件: java.sql.Driver（JDK内置）
public interface Driver {
    Connection connect(String url, Properties info) throws SQLException;
    boolean acceptsURL(String url) throws SQLException;
}

// 2. 服务加载器 —— 对修改关闭的核心代码
ServiceLoader<Driver> loadedDrivers = ServiceLoader.load(Driver.class);
for (Driver driver : loadedDrivers) {
    if (driver.acceptsURL(url)) {
        return driver.connect(url, info);
    }
}

// 3. MySQL驱动实现 —— 通过META-INF/services扩展
// 文件: META-INF/services/java.sql.Driver
// 内容: com.mysql.cj.jdbc.Driver
public class com.mysql.cj.jdbc.Driver implements java.sql.Driver {
    // MySQL驱动实现
}

// 新增PostgreSQL支持 → 只需引入Jar包，完全不需要修改JDK代码！
```

### 2.2.6 OCP 实践指南

- **不是100%封闭**：OCP 的目标是将修改范围控制在最小，而非完全消除修改
- **识别变化点**：关注需求中最容易变化的部分，优先对它们应用OCP
- **遵循"Rule of Three"**：第一次写简单的，第二次复制粘贴，第三次才抽象
- **避免过度抽象**：每增加一层抽象都带来复杂度。只在确实需要时才引入抽象

## 2.3 里氏替换原则（LSP）

### 2.3.1 核心定义

**里氏替换原则**（Liskov Substitution Principle，LSP）由计算机科学家 Barbara Liskov 在1987年提出：

> 如果对每一个类型为 S 的对象 o1，都有类型为 T 的对象 o2，使得以 T 定义的所有程序 P 在所有的对象 o1 都代换成 o2 时，程序 P 的行为没有发生变化，那么类型 S 是类型 T 的子类型。

通俗的解读：**子类对象必须能够替换父类对象，而程序的行为保持不变。**

这是对继承机制的强约束。如果子类不能无缝替换父类，那么继承关系本身就是错误的。

### 2.3.2 经典反例：矩形与正方形

这是讲解 LSP 最著名的例子：

```java
// 矩形类 —— 基类
public class Rectangle {
    protected double width;
    protected double height;

    public void setWidth(double width) {
        this.width = width;
    }

    public void setHeight(double height) {
        this.height = height;
    }

    public double getWidth() { return width; }
    public double getHeight() { return height; }

    public double calculateArea() {
        return width * height;
    }
}

// 正方形类 —— 子类（继承矩形）
// 直觉上正方形是矩形，所以用继承似乎很自然
// 但这是 LSP 的经典反例！
public class Square extends Rectangle {
    @Override
    public void setWidth(double width) {
        this.width = width;
        this.height = width;  // 强制width=height，破坏了父类的行为约定
    }

    @Override
    public void setHeight(double height) {
        this.width = height;
        this.height = height;  // 强制width=height，破坏了父类的行为约定
    }
}

// 测试类 —— 展示 LSP 违规
public class RectangleTest {
    /**
     * 这个方法在Rectangle下工作正常
     * 但传入Square会产生意想不到的结果
     */
    public static void testRectangle(Rectangle rectangle) {
        rectangle.setWidth(5);
        rectangle.setHeight(4);

        // 程序员的预期：area = 5 * 4 = 20
        double area = rectangle.calculateArea();
        System.out.println("预期面积: 20");
        System.out.println("实际面积: " + area);

        if (Math.abs(area - 20.0) > 0.01) {
            System.out.println("❌ LSP违规！子类打破了父类的行为契约");
        }
    }

    public static void main(String[] args) {
        System.out.println("=== 测试 Rectangle ===");
        testRectangle(new Rectangle());

        System.out.println("\n=== 测试 Square（作为Rectangle使用）===");
        testRectangle(new Square());  // 输出25而非20
    }
}
```

### 2.3.3 解决方案一：打破继承关系

承认正方形和矩形在行为上不兼容，使用独立的类：

```java
// 方案一：分离为独立类，不继承
public class Rectangle {
    private final double width;
    private final double height;

    // 构造函数初始化，不可变设计
    public Rectangle(double width, double height) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("边长必须为正数");
        }
        this.width = width;
        this.height = height;
    }

    public double getWidth() { return width; }
    public double getHeight() { return height; }

    public double calculateArea() {
        return width * height;
    }

    /** 改变宽度 —— 返回新的 Rectangle 对象（不可变） */
    public Rectangle withWidth(double newWidth) {
        return new Rectangle(newWidth, this.height);
    }

    /** 改变高度 —— 返回新的 Rectangle 对象（不可变） */
    public Rectangle withHeight(double newHeight) {
        return new Rectangle(this.width, newHeight);
    }
}

public class Square {
    private final double side;

    public Square(double side) {
        if (side <= 0) {
            throw new IllegalArgumentException("边长必须为正数");
        }
        this.side = side;
    }

    public double getSide() { return side; }

    public double calculateArea() {
        return side * side;
    }

    public Square withSide(double newSide) {
        return new Square(newSide);
    }
}
```

### 2.3.4 解决方案二：使用接口抽象

当需要统一处理矩形和正方形时，使用接口而非继承：

```java
// 方案二：使用接口替代继承
public interface Shape {
    double calculateArea();
    double calculatePerimeter();
}

// 矩形实现
public class Rectangle implements Shape {
    private final double width;
    private final double height;

    public Rectangle(double width, double height) {
        this.width = width;
        this.height = height;
    }

    @Override
    public double calculateArea() {
        return width * height;
    }

    @Override
    public double calculatePerimeter() {
        return 2 * (width + height);
    }

    public double getWidth() { return width; }
    public double getHeight() { return height; }
}

// 正方形实现
public class Square implements Shape {
    private final double side;

    public Square(double side) {
        this.side = side;
    }

    @Override
    public double calculateArea() {
        return side * side;
    }

    @Override
    public double calculatePerimeter() {
        return 4 * side;
    }

    public double getSide() { return side; }
}

// 统一处理
public class ShapeProcessor {
    public void printInfo(Shape shape) {
        System.out.println("面积: " + shape.calculateArea());
        System.out.println("周长: " + shape.calculatePerimeter());
    }

    public static void main(String[] args) {
        ShapeProcessor processor = new ShapeProcessor();

        processor.printInfo(new Rectangle(5, 4));
        processor.printInfo(new Square(5));
        // 两个调用都正确工作，没有 LSP 违规
    }
}
```

### 2.3.5 Java 标准库中违反 LSP 的例子

有趣的是，连 JDK 中也存在一些 LSP 违规的情况。了解这些能帮助我们更深刻地理解 LSP：

```java
// java.util.Properties 继承自 Hashtable<Object, Object>
// 但 Properties 的设计者设定了"key和value都是String"的约束
// 这违反了 LSP！

Properties props = new Properties();
props.setProperty("name", "Alice");  // 正确的使用方式

// 但是作为 Hashtable<Object, Object> 的子类，以下操作是合法的：
Hashtable<Object, Object> table = props;
table.put("age", 42);  // 存入整数 —— 完全合法！
table.put(123, "value");  // 存入非字符串key —— 也完全合法！

// 当后续用 Properties 的方式访问时，就会出问题：
String name = props.getProperty("name");  // "Alice" —— 正常
String age = props.getProperty("age");    // null! —— 因为getProperty要求String类型
// getProperty 内部调用 get() 并期望返回 String，但42是Integer
```

这也是为什么 Effective Java 建议："**在 Properties 中不要使用 Hashtable 的方法，只用 Properties 自己的方法**"。

### 2.3.6 另一个日常例子：员工管理系统

```java
// 场景：不同员工类型的工资计算
// 违反LSP的做法
public abstract class Employee {
    protected String name;
    protected double baseSalary;

    public Employee(String name, double baseSalary) {
        this.name = name;
        this.baseSalary = baseSalary;
    }

    // 抽象方法：计算工资
    public abstract double calculateSalary();
}

// 全职员工 —— 正常
public class FullTimeEmployee extends Employee {
    public FullTimeEmployee(String name, double baseSalary) {
        super(name, baseSalary);
    }

    @Override
    public double calculateSalary() {
        return baseSalary;  // 固定工资
    }
}

// 时薪员工 —— 但calculateSalary不接受参数！
// 为了计算工资，只能通过构造函数或Setter传入工时
public class HourlyEmployee extends Employee {
    private double hoursWorked;

    public HourlyEmployee(String name, double hourlyRate) {
        super(name, hourlyRate);  // baseSalary存的是时薪
    }

    public void setHoursWorked(double hours) {
        this.hoursWorked = hours;
    }

    @Override
    public double calculateSalary() {
        return baseSalary * hoursWorked;  // 时薪 * 工时
        // 问题：如果忘记调用setHoursWorked就直接calculateSalary，结果为0！
    }
}

// 符合LSP的改进
public abstract class Employee {
    protected String name;

    public Employee(String name) {
        this.name = name;
    }

    public String getName() { return name; }
}

// 固定工资员工
public class SalariedEmployee extends Employee {
    private final double monthlySalary;

    public SalariedEmployee(String name, double monthlySalary) {
        super(name);
        this.monthlySalary = monthlySalary;
    }

    public double calculateSalary() {
        return monthlySalary;
    }
}

// 时薪员工 —— 方法签名不同，这是正确的设计
public class HourlyPaidEmployee extends Employee {
    private final double hourlyRate;

    public HourlyPaidEmployee(String name, double hourlyRate) {
        super(name);
        this.hourlyRate = hourlyRate;
    }

    /** 需要工时参数来计算工资 —— 不覆盖calculateSalary() */
    public double calculateSalary(double hoursWorked) {
        return hourlyRate * hoursWorked;
    }

    public double getHourlyRate() { return hourlyRate; }
}
```

### 2.3.7 LSP 检查清单

判断是否满足 LSP，可以用以下清单：

- [ ] 子类不强化父类的前置条件（不能要求更多）
- [ ] 子类不弱化父类的后置条件（不能承诺更少）
- [ ] 子类保持父类的不变量（状态约束一致）
- [ ] 子类抛出的异常类型是父类异常的子类型
- [ ] 子类的返回值类型是父类返回值的子类型（协变）
- [ ] "is-a"关系从行为角度成立，而非仅从概念角度

## 2.4 依赖倒置原则（DIP）

### 2.4.1 核心定义

**依赖倒置原则**（Dependency Inversion Principle，DIP）是 SOLID 原则中最强大的一个，也是 Spring 框架的核心哲学。

Robert C. Martin 给出了 DIP 的两个关键陈述：

> 1. 高层模块不应该依赖低层模块，两者都应该依赖抽象。
> 2. 抽象不应该依赖细节，细节应该依赖抽象。

"倒置"的含义：传统的程序设计中，高层模块直接依赖低层模块（自顶向下依赖）。DIP 将这种依赖关系**倒置**过来，让高层和低层都依赖抽象。

```
传统依赖（自上而下）              依赖倒置（都依赖抽象）
┌──────────┐                    ┌──────────┐
│ 高层模块  │                    │ 高层模块  │
│(OrderSvc)│                    │(OrderSvc)│
└─────┬────┘                    └─────┬────┘
      │ 直接依赖                      │ 依赖
      ▼                               ▼
┌──────────┐                    ┌──────────┐
│ 低层模块  │                    │ 抽象接口  │ ◄──── ┐
│(MySQLDB) │                    │(Repo接口) │      │
└──────────┘                    └──────────┘      │
                                        ▲         │
                                        │ 实现    │ 依赖
                                        │         │
                                   ┌──────────┐   │
                                   │ 低层模块  │───┘
                                   │(MySQLImpl)│
                                   └──────────┘
```

### 2.4.2 违规案例分析

```java
// 违反 DIP —— 高层模块直接依赖低层模块
// 场景：订单服务需要持久化订单数据

// 高层模块
public class OrderService {
    // 直接依赖具体的数据库实现
    private MySQLOrderDao orderDao = new MySQLOrderDao();
    private OracleLogDao logDao = new OracleLogDao();
    private AliyunSmsSender smsSender = new AliyunSmsSender();

    public void createOrder(Order order) {
        // 1. 保存订单到 MySQL
        orderDao.save(order);

        // 2. 记录日志到 Oracle
        logDao.log("订单创建: " + order.getId());

        // 3. 发送短信通知
        smsSender.send(order.getPhone(), "您的订单已创建");

        // 问题：
        // - OrderService 与三个具体实现紧密耦合
        // - 想换成 MongoDB？需要修改 OrderService
        // - 想换成 Elasticsearch 记日志？需要修改 OrderService
        // - 想换成腾讯云短信？需要修改 OrderService
        // - 想单元测试 OrderService？必须先启动 MySQL、Oracle、短信服务
    }
}

// 低层模块
public class MySQLOrderDao {
    public void save(Order order) {
        // MySQL INSERT 实现
    }
}

public class OracleLogDao {
    public void log(String message) {
        // Oracle INSERT 实现
    }
}

public class AliyunSmsSender {
    public void send(String phone, String content) {
        // 阿里云短信API调用
    }
}
```

### 2.4.3 解决方案：依赖抽象

```java
// 第1步：定义抽象接口（高层模块定义，而非低层模块）

// 数据存储抽象
public interface OrderRepository {
    void save(Order order);
    Optional<Order> findById(String orderId);
    List<Order> findByUserId(String userId);
}

// 日志抽象
public interface Logger {
    void info(String message);
    void error(String message, Throwable e);
}

// 消息通知抽象
public interface NotificationService {
    void sendOrderConfirmation(String phone, String orderId);
}

// 第2步：低层模块实现抽象

// MySQL 实现
public class MySQLOrderRepository implements OrderRepository {
    private final DataSource dataSource;

    public MySQLOrderRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void save(Order order) {
        // MySQL 实现
        System.out.println("[MySQL] 保存订单: " + order.getId());
    }

    @Override
    public Optional<Order> findById(String orderId) {
        // MySQL 查询
        return Optional.empty();
    }

    @Override
    public List<Order> findByUserId(String userId) {
        // MySQL 查询
        return Collections.emptyList();
    }
}

// MongoDB 实现（新增 —— 完全不需修改高层模块）
public class MongoDBOrderRepository implements OrderRepository {
    private final MongoClient mongoClient;

    public MongoDBOrderRepository(MongoClient mongoClient) {
        this.mongoClient = mongoClient;
    }

    @Override
    public void save(Order order) {
        System.out.println("[MongoDB] 保存订单: " + order.getId());
    }

    @Override
    public Optional<Order> findById(String orderId) {
        return Optional.empty();
    }

    @Override
    public List<Order> findByUserId(String userId) {
        return Collections.emptyList();
    }
}

// 控制台日志实现
public class ConsoleLogger implements Logger {
    @Override
    public void info(String message) {
        System.out.println("[INFO] " + message);
    }

    @Override
    public void error(String message, Throwable e) {
        System.err.println("[ERROR] " + message);
        if (e != null) e.printStackTrace();
    }
}

// 短信通知实现
public class SmsNotificationService implements NotificationService {
    @Override
    public void sendOrderConfirmation(String phone, String orderId) {
        System.out.println("[短信] 发送到 " + phone + ": 订单 " + orderId + " 已确认");
    }
}

// 第3步：高层模块只依赖抽象

public class OrderService {
    private final OrderRepository orderRepository;     // 依赖抽象
    private final Logger logger;                       // 依赖抽象
    private final NotificationService notificationService; // 依赖抽象

    // 构造函数注入 —— 依赖由外部提供
    public OrderService(OrderRepository orderRepository,
                        Logger logger,
                        NotificationService notificationService) {
        this.orderRepository = orderRepository;
        this.logger = logger;
        this.notificationService = notificationService;
    }

    public Order createOrder(OrderCreationRequest request) {
        logger.info("开始创建订单: userId=" + request.getUserId());

        // 创建订单对象
        Order order = new Order(request);

        // 保存 —— 不需要知道用的是 MySQL 还是 MongoDB
        orderRepository.save(order);

        // 发送通知 —— 不需要知道是短信还是企业微信
        notificationService.sendOrderConfirmation(
                request.getPhone(), order.getId());

        logger.info("订单创建完成: orderId=" + order.getId());

        return order;
    }
}

// 第4步：组装（通常由 DI 容器完成）
public class Application {
    public static void main(String[] args) {
        // 依赖组装 —— 在实际项目中这块由 Spring 完成
        OrderRepository repository = new MySQLOrderRepository(getDataSource());
        Logger logger = new ConsoleLogger();
        NotificationService notification = new SmsNotificationService();

        // 注入到 OrderService
        OrderService orderService = new OrderService(repository, logger, notification);

        // 使用
        OrderCreationRequest request = new OrderCreationRequest();
        orderService.createOrder(request);

        // 如果要切换为 MongoDB，只需修改组装代码：
        // OrderRepository repository = new MongoDBOrderRepository(getMongoClient());
        // OrderService 代码完全不需要修改！
    }

    private static DataSource getDataSource() {
        // 从配置获取 DataSource
        return null;  // 简化示例
    }
}
```

### 2.4.4 依赖注入的三种方式

```java
// 1. 构造函数注入（推荐 —— 强制依赖）
public class OrderService {
    private final OrderRepository repository;
    private final Logger logger;

    public OrderService(OrderRepository repository, Logger logger) {
        this.repository = Objects.requireNonNull(repository, "repository不能为null");
        this.logger = Objects.requireNonNull(logger, "logger不能为null");
    }
}

// 2. Setter注入（可选依赖 —— 有默认实现）
public class OrderService {
    private OrderRepository repository;
    private Logger logger = new ConsoleLogger();  // 默认实现

    public void setRepository(OrderRepository repository) {
        this.repository = repository;
    }

    public void setLogger(Logger logger) {
        this.logger = logger;
    }
}

// 3. 接口注入（不常用，Angular的风格）
public interface RepositoryAware {
    void setRepository(OrderRepository repository);
}

public class OrderService implements RepositoryAware {
    private OrderRepository repository;

    @Override
    public void setRepository(OrderRepository repository) {
        this.repository = repository;
    }
}
```

### 2.4.5 DIP 在 Spring 中的体现

```java
// Spring 的依赖注入完美诠释了 DIP

// 1. 定义接口（抽象）
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}

// 2. 接口的实现由 Spring Data JPA 自动生成 —— 运行时提供具体实现

// 3. Service 只依赖抽象
@Service
public class UserService {
    private final UserRepository userRepository;  // 依赖接口，而非实现

    // 构造器注入（Spring 从容器中获取 UserRepository 的实现）
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException(email));
    }
}

// 4. 想要切换数据源？
// 只需修改配置 + 引入对应的Starter，UserService的代码完全不动！
```

### 2.4.6 DIP 实践指南

- **"面向接口编程"不是口号**：定义变量、参数、返回值时尽量使用抽象类型
- **避免直接 new 具体类**：在业务代码中避免 `new ArrayList()`，使用 `List<String> list = new ArrayList<>()` 至少依赖了接口
- **高层模块定义接口**：接口应该服务于高层模块的需求，而不是低层模块的方便
- **依赖注入容器**：在大型项目中，DI 容器（Spring、Guice、Dagger）是应用 DIP 的最佳实践

## 2.5 接口隔离原则（ISP）

### 2.5.1 核心定义

**接口隔离原则**（Interface Segregation Principle，ISP）规定：

> 客户端不应该被迫依赖它不使用的方法。

或者更直白地说：**多个专门的接口比一个臃肿的接口更好。**

ISP 和 SRP 有相似之处，但关注点不同：
- **SRP** 关注类的职责单一
- **ISP** 关注接口的粒度合理

### 2.5.2 违规案例分析

```java
// 违反 ISP —— 臃肿的"万能"接口
public interface CloudService {
    // 计算相关
    void createInstance(String instanceType);
    void terminateInstance(String instanceId);
    void scaleInstance(String instanceId, int newSize);

    // 存储相关
    void createBucket(String bucketName);
    void uploadFile(String bucketName, File file);
    byte[] downloadFile(String bucketName, String fileKey);

    // 网络相关
    void createVpc(String cidr);
    void createLoadBalancer(String name);
    void configureFirewall(String rule);

    // 监控相关
    void createAlarm(String metric, double threshold);
    List<Alert> getAlerts(String instanceId);

    // 计费相关
    Bill queryMonthlyBill(String month);
    List<BillItem> getBillDetails(String billId);
}

// 问题：一个只使用存储功能的客户端被迫依赖了计算、网络、监控、计费等所有方法
public class SimpleFileStorage {
    private CloudService cloudService;  // 只需要存储功能

    public void backupFile(File file) {
        // 只用到了 createBucket 和 uploadFile
        // 但被迫知道了 createInstance、createAlarm 等方法的存在
        cloudService.createBucket("my-backup");
        cloudService.uploadFile("my-backup", file);
    }
}
```

### 2.5.3 解决方案：接口拆分

```java
// 按功能领域拆分为专门的接口
public interface ComputeService {
    void createInstance(String instanceType);
    void terminateInstance(String instanceId);
    void scaleInstance(String instanceId, int newSize);
}

public interface StorageService {
    void createBucket(String bucketName);
    void uploadFile(String bucketName, File file);
    byte[] downloadFile(String bucketName, String fileKey);
}

public interface NetworkService {
    void createVpc(String cidr);
    void createLoadBalancer(String name);
    void configureFirewall(String rule);
}

public interface MonitoringService {
    void createAlarm(String metric, double threshold);
    List<Alert> getAlerts(String instanceId);
}

public interface BillingService {
    Bill queryMonthlyBill(String month);
    List<BillItem> getBillDetails(String billId);
}

// 客户端按需依赖 —— 只依赖自己使用的接口
public class SimpleFileStorage {
    private final StorageService storageService;  // 只需要这一个

    public SimpleFileStorage(StorageService storageService) {
        this.storageService = storageService;
    }

    public void backupFile(File file) {
        storageService.createBucket("my-backup");
        storageService.uploadFile("my-backup", file);
    }
}

// 一个综合的云服务类可以通过实现多个接口来提供完整功能
public class AWSCloudProvider implements ComputeService, StorageService,
        NetworkService, MonitoringService, BillingService {

    @Override
    public void createInstance(String instanceType) {
        // AWS EC2 相关实现
    }

    @Override
    public void terminateInstance(String instanceId) {
        // AWS EC2 相关实现
    }

    @Override
    public void createBucket(String bucketName) {
        // AWS S3 相关实现
    }

    @Override
    public void uploadFile(String bucketName, File file) {
        // AWS S3 相关实现
    }

    // ... 其他方法实现
}

// 客户端仍然可以只使用需要的接口
public class Application {
    public static void main(String[] args) {
        AWSCloudProvider awsProvider = new AWSCloudProvider();

        // 只暴露存储功能给 SimpleFileStorage
        SimpleFileStorage storage = new SimpleFileStorage(awsProvider);
        storage.backupFile(new File("/tmp/test.txt"));

        // 只暴露计算功能给另一个客户端
        ComputeService compute = awsProvider;
        compute.createInstance("t2.micro");
    }
}
```

### 2.5.4 ISP 在真实业务中的体现

```java
// 场景：用户权限体系
// 违反 ISP 的设计
public interface UserOperations {
    void viewProfile();
    void editProfile();
    void deleteAccount();
    void manageUsers();       // 只有管理员需要
    void viewReports();       // 只有管理员需要
    void approveRequests();   // 只有管理员需要
    void configureSystem();   // 只有超级管理员需要
}

// 符合 ISP 的设计
public interface BasicUserOperations {
    void viewProfile();
    void editProfile();
    void deleteAccount();
}

public interface AdminOperations {
    void manageUsers();
    void viewReports();
    void approveRequests();
}

public interface SuperAdminOperations {
    void configureSystem();
}

// 用户角色按需实现
public class NormalUser implements BasicUserOperations {
    @Override
    public void viewProfile() { /* 查看个人信息 */ }
    @Override
    public void editProfile() { /* 编辑个人信息 */ }
    @Override
    public void deleteAccount() { /* 注销账户 */ }
}

public class Admin implements BasicUserOperations, AdminOperations {
    @Override
    public void viewProfile() { /* ... */ }
    @Override
    public void editProfile() { /* ... */ }
    @Override
    public void deleteAccount() { /* ... */ }
    @Override
    public void manageUsers() { /* 管理用户 */ }
    @Override
    public void viewReports() { /* 查看报表 */ }
    @Override
    public void approveRequests() { /* 审核请求 */ }
}

public class SuperAdmin implements BasicUserOperations, AdminOperations, SuperAdminOperations {
    @Override
    public void viewProfile() { /* ... */ }
    @Override
    public void editProfile() { /* ... */ }
    @Override
    public void deleteAccount() { /* ... */ }
    @Override
    public void manageUsers() { /* ... */ }
    @Override
    public void viewReports() { /* ... */ }
    @Override
    public void approveRequests() { /* ... */ }
    @Override
    public void configureSystem() { /* 配置系统 */ }
}

// 使用方 —— 最小化依赖
public class UserController {
    private final BasicUserOperations userOps;  // 只需要基础操作

    public UserController(BasicUserOperations userOps) {
        this.userOps = userOps;
    }
}

public class AdminController {
    private final AdminOperations adminOps;  // 只需要管理操作

    public AdminController(AdminOperations adminOps) {
        this.adminOps = adminOps;
    }
}
```

### 2.5.5 ISP 的权衡

- **"接口隔离"和"接口过多"的平衡**：拆分太细会导致类需要实现十几个接口，反而增加复杂度
- **接口的"高内聚"**：一个接口中的方法应该高度相关。如果两个方法总是一起使用，就应该放在同一个接口中
- **优先考虑使用方**：从使用方的视角定义接口，而不是从实现方的视角

## 2.6 迪米特法则（LoD）

### 2.6.1 核心定义

**迪米特法则**（Law of Demeter，LoD），也称为**最少知识原则**（Principle of Least Knowledge），由 Ian Holland 在1987年的迪米特项目中提出：

> 一个对象应该对其他对象有最少的了解。

通俗的说法：**只和直接的朋友说话，不和朋友的朋友说话。**

"直接的朋友"指的是：
- 对象自身（this）
- 作为方法参数传入的对象
- 方法内部创建的对象
- 对象的成员变量

### 2.6.2 违规案例分析

```java
// 违反迪米特法则 —— 典型的"链式调用"
public class PaperBoy {
    public void collectMoney(Customer customer) {
        // 报童需要知道：
        // 1. 顾客有钱包 (getWallet())
        // 2. 钱包里有现金 (getCash())
        // 3. 需要从现金中取出指定金额 (subtract())
        // 报童对顾客的内部结构了解太多了！

        Wallet wallet = customer.getWallet();
        if (wallet != null) {
            Money cash = wallet.getCash();
            if (cash != null && cash.getAmount() >= 5) {
                cash.subtract(5);
                System.out.println("收钱成功");
            }
        }
    }
}

// 相关的类
public class Customer {
    private Wallet wallet;

    public Wallet getWallet() { return wallet; }
}

public class Wallet {
    private Money cash;

    public Money getCash() { return cash; }
}

public class Money {
    private int amount;

    public int getAmount() { return amount; }
    public void subtract(int amount) { this.amount -= amount; }
}
```

问题分析：
- `PaperBoy` 知道了 `Customer` 有 `Wallet`，`Wallet` 有 `Money`
- 如果将来 `Customer` 改用手机支付（MobilePayment），不再有 `Wallet` —— `PaperBoy` 代码要修改
- `PaperBoy` 耦合了3个类的内部结构

### 2.6.3 解决方案

```java
// 符合迪米特法则 —— 封装内部细节

// 报童只知道"向顾客收钱"，不知道顾客怎么付钱
public class PaperBoy {
    public void collectMoney(Customer customer) {
        // 只与直接朋友 Customer 交互，不关心他的支付方式
        try {
            customer.pay(5);
            System.out.println("收钱成功");
        } catch (PaymentFailedException e) {
            System.out.println("收钱失败：" + e.getMessage());
        }
    }
}

// 顾客 —— 封装了支付方式的变化
public class Customer {
    private PaymentMethod paymentMethod;  // 可以是 Wallet，也可以是 MobilePay

    public Customer(PaymentMethod paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public void pay(int amount) throws PaymentFailedException {
        paymentMethod.pay(amount);
    }
}

// 支付方式接口
public interface PaymentMethod {
    void pay(int amount) throws PaymentFailedException;
}

// 钱包支付
public class Wallet implements PaymentMethod {
    private int balance = 100;

    @Override
    public void pay(int amount) throws PaymentFailedException {
        if (balance < amount) {
            throw new PaymentFailedException("余额不足");
        }
        balance -= amount;
    }
}

// 手机支付 —— 未来新增，不影响 PaperBoy
public class MobilePay implements PaymentMethod {
    private String accountId;

    public MobilePay(String accountId) {
        this.accountId = accountId;
    }

    @Override
    public void pay(int amount) throws PaymentFailedException {
        // 调用手机支付API
        System.out.println("使用手机支付 " + accountId + " 支付 " + amount);
    }
}

public class PaymentFailedException extends Exception {
    public PaymentFailedException(String message) { super(message); }
}
```

### 2.6.4 实际开发中的典型违规

```java
// 违反迪米特法则的常见写法：

// 1. 链式调用 —— "火车残骸"代码
String city = order.getCustomer().getAddress().getCity();
// order 知道了 Customer 的结构，Customer 暴露了 Address 的结构

// 2. 将内部对象直接返回给外部
public class Company {
    private List<Employee> employees;

    public List<Employee> getEmployees() {  // 直接暴露了内部对象
        return employees;                   // 外部可以直接修改 employee 列表！
    }
}

// 3. 方法参数过于具体，暴露内部信息
public void printReport(InputStream data, OutputStream out, String encoding) {
    // 调用方需要知道 encoding 这个实现细节
}

// 改进：使用更抽象的包装
public void printReport(ReportRequest request) {
    request.getData();     // 封装了 InputStream 的细节
    request.getOutput();   // 封装了 OutputStream 的细节
    request.getEncoding(); // 封装了 encoding，且有默认值
}
```

### 2.6.5 门面模式 —— 迪米特法则的最佳实践

```java
// 场景：用户注册需要调用多个子系统
// 违反 LoD 的做法 —— 控制器需要了解所有子系统的接口

public class RegistrationController {
    public void register(UserInfo info) {
        // 需要了解：UserValidator, PasswordEncoder, UserRepository,
        //          EmailService, AuditLogger 五个对象的接口
        UserValidator validator = new UserValidator();
        validator.validate(info);

        PasswordEncoder encoder = new PasswordEncoder();
        String hash = encoder.encode(info.getPassword());

        UserRepository repo = new UserRepository();
        User user = new User(info.getUsername(), info.getEmail(), hash);
        repo.save(user);

        EmailService email = new EmailService();
        email.sendWelcome(info.getEmail(), info.getUsername());

        AuditLogger logger = new AuditLogger();
        logger.log("USER_REGISTERED", info.getUsername());
    }
}

// 符合 LoD 的做法 —— 通过门面封装

// 门面
public class UserRegistrationFacade {
    private final UserValidator validator;
    private final PasswordEncoder encoder;
    private final UserRepository repository;
    private final EmailService emailService;
    private final AuditLogger auditLogger;

    public UserRegistrationFacade(UserValidator validator,
                                  PasswordEncoder encoder,
                                  UserRepository repository,
                                  EmailService emailService,
                                  AuditLogger auditLogger) {
        this.validator = validator;
        this.encoder = encoder;
        this.repository = repository;
        this.emailService = emailService;
        this.auditLogger = auditLogger;
    }

    // 对外只暴露一个简单的方法
    public User register(UserInfo info) {
        validator.validate(info);
        String hash = encoder.encode(info.getPassword());
        User user = new User(info.getUsername(), info.getEmail(), hash);
        User savedUser = repository.save(user);
        emailService.sendWelcome(info.getEmail(), info.getUsername());
        auditLogger.log("USER_REGISTERED", info.getUsername());
        return savedUser;
    }
}

// 控制器变得极其简洁 —— 只依赖一个门面
public class RegistrationController {
    private final UserRegistrationFacade registrationFacade;

    public RegistrationController(UserRegistrationFacade registrationFacade) {
        this.registrationFacade = registrationFacade;
    }

    public void register(UserInfo info) {
        User user = registrationFacade.register(info);
        System.out.println("注册成功: " + user.getUsername());
    }
}
```

### 2.6.6 迪米特法则的判断标准

一个方法如果出现以下模式，很可能违反了 LoD：

```java
// 方法链超过2个点
a.getB().getC().doSomething();  // 危险信号

// 方法内部创建了不直接使用的对象
public void doSomething() {
    A a = new A();
    B b = a.getB();      // b 在这里才被创建，不是直接朋友
    b.doSomethingElse();
}

// 改进
public void doSomething() {
    A a = new A();
    a.handleSomething();  // A内部处理，外部不知道B的存在
}
```

## 2.7 合成复用原则（CRP）

### 2.7.1 核心定义

**合成复用原则**（Composite Reuse Principle，CRP），也称为**组合/聚合复用原则**：

> 优先使用对象组合（Composition），而不是类继承（Inheritance）来达到复用的目的。

这个原则是 GoF 在《设计模式》一书中反复强调的核心思想：

> "Favor object composition over class inheritance."

### 2.7.2 为什么继承令人警惕

继承有四个根本性的问题：

1. **白盒复用**：子类能访问父类的实现细节，破坏了封装
2. **编译时绑定**：继承关系在编译时确定，无法在运行时改变
3. **脆弱的基类问题**：父类的修改可能导致所有子类出问题
4. **单继承限制**：Java 只支持单继承，限制了灵活性

### 2.7.3 违规案例：汽车分类的继承噩梦

```java
// 使用继承来实现汽车类型 —— 很快就陷入类爆炸
public class Car {
    public void start() { System.out.println("发动机启动"); }
    public void drive() { System.out.println("行驶中..."); }
}

public class ElectricCar extends Car {
    @Override
    public void start() { System.out.println("电机启动（无声）"); }
}

public class GasCar extends Car {
    @Override
    public void start() { System.out.println("燃油发动机启动（轰鸣）"); }
}

// 现在需要区分自动挡和手动挡
public class ElectricAutomaticCar extends ElectricCar { }   // ?
public class ElectricManualCar extends ElectricCar { }     // ?
public class GasAutomaticCar extends GasCar { }            // ?
public class GasManualCar extends GasCar { }               // ?

// 再加上两驱和四驱？
// 再加上轿车、SUV、跑车？
// 组合爆炸：3(动力) × 2(变速箱) × 2(驱动) × 3(车型) = 36 个类！

// 如果再新增一个"氢能"动力类型，需要添加 2×2×3 = 12 个新类
```

### 2.7.4 解决方案：使用组合

```java
// 将变化的维度抽象为接口，通过组合而不是继承来组装

// 维度1：动力系统
public interface Engine {
    void start();
    String getType();
}

public class ElectricEngine implements Engine {
    @Override
    public void start() {
        System.out.println("电机启动（安静、即时的扭矩输出）");
    }

    @Override
    public String getType() {
        return "电动";
    }
}

public class GasEngine implements Engine {
    @Override
    public void start() {
        System.out.println("燃油发动机启动（轰鸣声、需要预热）");
    }

    @Override
    public String getType() {
        return "燃油";
    }
}

public class HydrogenEngine implements Engine {
    @Override
    public void start() {
        System.out.println("氢燃料电池启动（零排放）");
    }

    @Override
    public String getType() {
        return "氢能";
    }
}

// 维度2：变速箱
public interface Transmission {
    void shiftGear();
    String getType();
}

public class AutomaticTransmission implements Transmission {
    @Override
    public void shiftGear() {
        System.out.println("自动换挡");
    }

    @Override
    public String getType() {
        return "自动挡";
    }
}

public class ManualTransmission implements Transmission {
    @Override
    public void shiftGear() {
        System.out.println("手动换挡");
    }

    @Override
    public String getType() {
        return "手动挡";
    }
}

// 维度3：驱动方式
public interface Drivetrain {
    void distributePower();
    String getType();
}

public class FrontWheelDrive implements Drivetrain {
    @Override
    public void distributePower() {
        System.out.println("前轮驱动");
    }

    @Override
    public String getType() {
        return "前驱";
    }
}

public class AllWheelDrive implements Drivetrain {
    @Override
    public void distributePower() {
        System.out.println("四轮驱动");
    }

    @Override
    public String getType() {
        return "四驱";
    }
}

// 汽车类 —— 通过组合来组装不同的配置
public class Car {
    private final Engine engine;           // has-a
    private final Transmission transmission; // has-a
    private final Drivetrain drivetrain;     // has-a
    private final String model;

    public Car(String model, Engine engine,
               Transmission transmission, Drivetrain drivetrain) {
        this.model = model;
        this.engine = engine;
        this.transmission = transmission;
        this.drivetrain = drivetrain;
    }

    public void start() {
        System.out.println("=== " + model + " ===");
        System.out.println("配置: " + engine.getType() + " + " +
                transmission.getType() + " + " + drivetrain.getType());
        engine.start();
    }

    public void drive() {
        transmission.shiftGear();
        drivetrain.distributePower();
        System.out.println(model + " 行驶中...");
    }

    public String getSpecifications() {
        return String.format("%s [%s, %s, %s]",
                model, engine.getType(),
                transmission.getType(), drivetrain.getType());
    }
}

// 使用组合 —— 可以灵活组装任意配置
public class CarFactory {
    public static void main(String[] args) {
        // 配置1：电动 + 自动挡 + 四驱 SUV
        Car electricSUV = new Car("Model X SUV",
                new ElectricEngine(),
                new AutomaticTransmission(),
                new AllWheelDrive());

        // 配置2：燃油 + 手动挡 + 前驱 轿车
        Car gasSedan = new Car("Civic Sedan",
                new GasEngine(),
                new ManualTransmission(),
                new FrontWheelDrive());

        // 配置3：氢能 + 自动挡 + 前驱
        Car hydrogenCar = new Car("Mirai",
                new HydrogenEngine(),
                new AutomaticTransmission(),
                new FrontWheelDrive());

        // 使用组合可以创建 3×2×2 = 12 种配置，只需要 3+2+2=7 个小组件类
        // 而继承需要 12 个完整的大类！
        electricSUV.start();
        electricSUV.drive();

        System.out.println();
        gasSedan.start();
        gasSedan.drive();

        // 新增动力类型（氢能）只需要新增1个类，就能与所有现有变速箱和驱动方式组合
    }
}
```

### 2.7.5 组合与继承的对比

```java
// 实战对比：记录日志功能

// 方式一：使用继承
public class Service {
    public void doSomething() {
        // 核心业务逻辑
        System.out.println("处理业务...");
    }
}

// 想要加日志功能 —— 通过继承
public class LoggedService extends Service {
    @Override
    public void doSomething() {
        System.out.println("[LOG] 开始执行");
        super.doSomething();
        System.out.println("[LOG] 执行完成");
    }
}

// 问题：如果想同时添加日志+事务+缓存呢？
// LoggedTransactionalCachedService extends LoggedService? 继承链越来越深

// 方式二：使用组合（装饰器模式）
public interface Service {
    void execute();
}

public class CoreService implements Service {
    @Override
    public void execute() {
        System.out.println("处理核心业务...");
    }
}

// 日志装饰器
public class LoggingDecorator implements Service {
    private final Service delegate;

    public LoggingDecorator(Service delegate) {
        this.delegate = delegate;
    }

    @Override
    public void execute() {
        System.out.println("[LOG] 开始执行");
        delegate.execute();
        System.out.println("[LOG] 执行完成");
    }
}

// 事务装饰器
public class TransactionalDecorator implements Service {
    private final Service delegate;

    public TransactionalDecorator(Service delegate) {
        this.delegate = delegate;
    }

    @Override
    public void execute() {
        System.out.println("[TX] 开启事务");
        try {
            delegate.execute();
            System.out.println("[TX] 提交事务");
        } catch (Exception e) {
            System.out.println("[TX] 回滚事务");
            throw e;
        }
    }
}

// 灵活组合 —— 可以任意顺序组装
public class CompositionDemo {
    public static void main(String[] args) {
        // 核心服务
        Service core = new CoreService();

        // 日志 + 核心
        Service withLog = new LoggingDecorator(core);

        // 事务 + 核心
        Service withTx = new TransactionalDecorator(core);

        // 事务 + 日志 + 核心（事务外层，日志内层）
        Service withTxAndLog = new TransactionalDecorator(
                new LoggingDecorator(core));

        // 日志 + 事务 + 核心（日志外层，事务内层）
        Service withLogAndTx = new LoggingDecorator(
                new TransactionalDecorator(core));

        // 通过组合产生2×2 = 4种组合，用继承需要4个子类
    }
}
```

### 2.7.6 何时使用继承

虽然组合优先，但继承并非完全不能用。以下场景适合使用继承：

```java
// 1. 真正的"is-a"关系 —— 且行为完全兼容
public class Animal { }
public class Dog extends Animal { }  // 狗是动物，行为完全兼容

// 2. 需要使用多态通过父类型操作子类型
public void process(Animal animal) { }  // 依赖的是父类型

// 3. 子类只扩展，不修改父类的行为契约
public class ReadOnlyList<E> extends AbstractList<E> {
    // 只增加新方法，不修改父类的现有行为
    // 父类方法的行为保持不变
}

// 4. 框架定义的扩展点 —— 模板方法模式
public abstract class BatchProcessor {
    public final void process() {       // 模板方法(final)
        beforeProcess();
        doProcess();                     // 扩展点
        afterProcess();
    }
    protected abstract void doProcess();  // 子类必须实现
}
```

### 2.7.7 继承 vs 组合决策表

| 问题 | 是 → 用组合 | 否 → 可以用继承 |
|------|------------|----------------|
| 是否只需要复用部分功能？ | 组合 | 继承 |
| 是否需要在运行时改变行为？ | 组合 | 继承 |
| 父类是否频繁变化？ | 组合 | 继承 |
| 是否有多维度的变化组合？ | 组合 | 继承 |
| 子类和父类是否存在行为上的不兼容？ | 组合 | 继承 |
| 是否有清晰的"is-a"且行为一致？ | 继承 | 组合 |
| 是否为框架定义的扩展点？ | 继承 | 组合 |

## 2.8 原则间的权衡与决策

### 2.8.1 七大原则的关系全景

设计原则不是孤立的规则，而是相互支撑、相互制约的系统。理解它们之间的关系，比孤立的记忆每个原则更重要。

```
                        ┌─────────────────────┐
                        │     开闭原则 (OCP)    │
                        │    "最终目标"         │
                        │ 对扩展开放，对修改关闭 │
                        └──────────┬──────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
   ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
   │ 单一职责 (SRP)  │    │ 里氏替换 (LSP)  │    │ 依赖倒置 (DIP)  │
   │ "基础约束"      │    │ "继承规则"      │    │ "依赖方向"      │
   │ 一个类一个原因  │    │ 子类可替换父类  │    │ 依赖抽象非具体  │
   └───────┬────────┘    └───────┬────────┘    └───────┬────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ 接口隔离 (ISP) │ │迪米特(LoD)│ │ 合成复用 (CRP)│
          │ "接口粒度"     │ │"最少知识" │ │ "组合优先"    │
          │ 小接口优于大   │ │只与朋友聊 │ │ 组合优于继承  │
          └──────────────┘ └──────────┘ └──────────────┘
```

- **OCP 是目标**：所有的设计原则和应用设计模式，最终目的都是让系统符合OCP
- **SRP、LSP、DIP 是基础**：没有这三个原则，OCP 无法实现
- **ISP、LoD、CRP 是保障**：它们从不同角度确保代码的松耦合和高内聚

### 2.8.2 原则之间的冲突

在实践中，原则之间可能会互相冲突。优秀的工程师知道如何权衡：

**冲突一：SRP vs 类的数量**

```java
// 极端SRP —— 每个类只有一个方法，类爆炸
public class EmailValidator { public boolean validate(String email) { } }
public class PasswordValidator { public boolean validate(String pwd) { } }
public class UsernameValidator { public boolean validate(String name) { } }

// 适度平衡 —— 相关验证放在一起更合理
public class UserValidator {
    public ValidationResult validate(UserRegistrationRequest request) {
        // 统一验证邮箱、密码、用户名（都是用户输入验证这一职责）
    }
}
```

**冲突二：OCP vs YAGNI（You Aren't Gonna Need It）**

```java
// 为了"未来可能的扩展"，创建了三层抽象
public interface PaymentProvider { }
public abstract class AbstractPaymentProvider implements PaymentProvider { }
public class AlipayProvider extends AbstractPaymentProvider { }

// 实际上系统可能永远只有一种支付方式
// → Rule of Three：等第三种支付方式出现时再抽象
```

**冲突三：DIP vs 性能**

```java
// 极端的 DIP —— 连基本类型都通过接口访问
public interface IntegerProvider { int getValue(); }
// 这太荒谬了。基本类型和稳定的JDK类不需要被抽象

// 合理的边界：对"会变化的外部依赖"进行抽象（数据库、外部API、文件系统等）
```

### 2.8.3 权衡决策框架

当原则发生冲突时，可以按以下优先级做出决策：

```
决策优先级：
1. 代码能运行（功能正确 > 设计优雅）
2. 代码可测试（可测试 > 不完美但不可测试的设计）
3. 代码可读（新人能在一小时内理解 > 用了高级模式但晦涩难懂）
4. 修改风险（改动一个功能只需要改一处 > 满足了所有原则但修改需要改多处）
5. 原则的纯度（在以上都满足的前提下，尽量符合SOLID）
```

### 2.8.4 真实世界的权衡案例

```java
// 场景：一个简单的CRUD用户管理
// 需求：查询用户、创建用户、删除用户（没有修改需求）

// 方案A：严格遵循所有原则
public interface UserRepository {
    Optional<User> findById(Long id);
    User save(User user);
    void delete(Long id);
}
public interface UserService {
    UserDto getUser(Long id);
    UserDto createUser(CreateUserRequest req);
    void deleteUser(Long id);
}
public class UserServiceImpl implements UserService {
    private final UserRepository repository;
    private final UserValidator validator;
    private final PasswordEncoder encoder;
    // ... 6个类，3个接口
}

// 方案B：务实的设计（简单场景）
public class UserDao {
    private final JdbcTemplate jdbc;

    public User findById(Long id) {
        return jdbc.queryForObject("SELECT * FROM users WHERE id=?", User.class, id);
    }

    public void insert(User user) {
        jdbc.update("INSERT INTO users(name, email) VALUES(?,?)",
                user.getName(), user.getEmail());
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM users WHERE id=?", id);
    }
}

// 选择：
// - 如果项目简单，团队小，变更少 → 选方案B
// - 如果项目复杂，需要单元测试，可能切换数据库 → 选方案A
// 没有绝对的对错，只有是否适合当前上下文
```

### 2.8.5 何时可以（应该）打破原则

| 场景 | 可以打破的原则 | 理由 |
|------|-------------|------|
| 性能热点 | DIP（直接调用而非通过接口） | 接口调用的虚方法分派有开销 |
| 极度简单的工具类 | SRP（一个类有多个小工具方法） | StringUtils 有大量方法但每个都很简单 |
| 原型/验证阶段 | OCP（直接修改代码最快） | 需求未定，过度抽象是浪费 |
| 与遗留系统集成 | ISP（需要实现臃肿的接口） | 只能适应现有接口 |
| 框架要求 | CRP（必须继承框架基类） | 框架设计如此，只能遵守 |

### 2.8.6 总结：原则的口诀

为了方便记忆和日常使用，可以把七大原则归纳为一个简单的口诀：

```
一个类，一种责      —— SRP（单一职责）
扩展开，修改闭      —— OCP（开闭原则）
子替父，无违和      —— LSP（里氏替换）
靠抽象，不靠实      —— DIP（依赖倒置）
接口小，不臃肿      —— ISP（接口隔离）
少依赖，只直连      —— LoD（迪米特法则）
组合作，继承慎      —— CRP（合成复用）
```

## 本章小结

本章详细介绍了面向对象设计的七大原则，它们是理解和应用设计模式的基石：

1. **单一职责原则（SRP）**：一个类只承担一项职责，只有一个引起变化的原因。通过将不同职责分离到不同类中，提高代码的可维护性

2. **开闭原则（OCP）**：对扩展开放，对修改关闭。通过抽象和多态，使得系统新功能可以通过新增代码而非修改已有代码来实现

3. **里氏替换原则（LSP）**：子类必须可以替换父类而不影响程序正确性。继承关系必须是真正的"is-a"，且行为完全兼容

4. **依赖倒置原则（DIP）**：高层和低层都应依赖抽象。通过依赖注入实现控制反转，解耦高层策略和低层实现

5. **接口隔离原则（ISP）**：客户端不应被迫依赖它不使用的方法。使用多个小接口而非一个大接口

6. **迪米特法则（LoD）**：对象只与直接朋友通信。降低类与类之间的耦合度，不暴露内部实现细节

7. **合成复用原则（CRP）**：优先使用对象组合而非类继承。组合提供更大的灵活性和更低的耦合度

7+1. **权衡与决策**：原则不是教条。在实际开发中需要根据具体场景灵活应用，理解原则之间的冲突和平衡，做务实的工程决策

这些原则构成了面向对象设计的**理论基础**。从下一章开始，我们将进入具体的创建型设计模式。你会发现，每一个设计模式本质上都是这些原则在特定场景下的具体实践。

---

下一章将介绍第一个创建型设计模式 —— **单例模式**（Singleton Pattern），它是使用最广泛也是争议最多的设计模式之一。
