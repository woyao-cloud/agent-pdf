# 第12章 外观模式（Facade）
+
+**外观模式**为复杂的子系统提供一个统一的接口，使得子系统更容易使用。它是一种结构型设计模式，通过创建一个简单的外观接口，封装复杂的子系统逻辑。
+
+## 12.1 解决的问题与应用场景
+
+### 12.1.1 问题分析
+
+在软件系统中，随着功能增加，子系统会变得越来越复杂：
+
+```java
+// 假设用户注册需要以下步骤：
+// 1. 验证输入
+Validator validator = new Validator();
+validator.validate(user);
+
+// 2. 检查用户名是否存在
+UserRepository repo = new UserRepository();
+if (repo.exists(user.getUsername())) {
+    throw new Exception("用户名已存在");
+}
+
+// 3. 加密密码
+PasswordEncoder encoder = new PasswordEncoder();
+user.setPassword(encoder.encode(user.getPassword()));
+
+// 4. 保存用户
+repo.save(user);
+
+// 5. 发送欢迎邮件
+EmailService email = new EmailService();
+email.sendWelcome(user);
+
+// 6. 记录日志
+Logger logger = new Logger();
+logger.log("User registered: " + user.getUsername());
+```
+
+问题：
+- 客户端需要了解多个子系统的API
+- 客户端代码与子系统强耦合
+- 每次调用都需要重复这些步骤
+- 新开发者使用成本高
+
+### 12.1.2 典型应用场景
+
+**1. 复杂系统集成**
+```java
+// 一键下单
+OrderFacade orderFacade = new OrderFacade();
+orderFacade.createOrder(productId, userId, quantity);
+```
+
+**2. 统一服务入口**
+```java
+// 客服系统
+CustomerService service = new CustomerService();
+service.resolve(complaintId);
+// 内部调用：验证->查询->处理->通知->记录
+```
+
+**3. 简化第三方库使用**
+```java
+// 使用外观封装复杂的第三方库
+VideoConverter converter = new VideoConverter();
+converter.convert("input.avi", "output.mp4");
+```
+
+## 12.2 实现原理与UML
+
+### 12.2.1 核心思想
+
+外观模式的核心是**为复杂的子系统提供一个简单的统一接口**，客户端只需要与外观类交互，不需要了解子系统的复杂性。
+
+### 12.2.2 UML类图
+
+```
+┌──────────────────────────────────────────────────────────────┐
+│                           Client                             │
+└──────────────────────────────────────────────────────────────┘
+                              │
+                              ▼
+┌──────────────────────────────────────────────────────────────┐
+│                          Facade                              │
+│                        (外观类)                               │
+├──────────────────────────────────────────────────────────────┤
+│ + simpleOperation()                                          │
+└──────────────────────────────────────────────────────────────┘
+                              │
+            ┌─────────────────┼─────────────────┐
+            ▼                 ▼                 ▼
+    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
+    │  SubsystemA   │  │  SubsystemB   │  │  SubsystemC   │
+    │  (子系统A)     │  │  (子系统B)     │  │  (子系统C)     │
+    ├───────────────┤  ├───────────────┤  ├───────────────┤
+    │ + operationA()│  │ + operationB()│  │ + operationC()│
+    └───────────────┘  └───────────────┘  └───────────────┘
+```
+
+### 12.2.3 角色分析
+
+- **Facade（外观类）**：为客户端提供简单的接口，封装子系统的复杂逻辑
+- **Subsystem（子系统）**：实际执行工作的类，可能有多个
+- **Client（客户端）**：通过外观类与子系统交互
+
+### 12.2.4 时序图
+
+```
+Client              Facade              Subsystem
+   │                   │                    │
+   │                   │                    │
+   │ simpleOperation() │                    │
+   │ ────────────────► │                    │
+   │                   │                    │
+   │                   │ operation1()       │
+   │                   │ ─────────────────► │
+   │                   │                    │
+   │                   │ operation2()       │
+   │                   │ ─────────────────────────────► │
+   │                   │                    │
+   │                   │ result             │
+   │ ◄───────────────── │                    │
+   │                   │                    │
+```
+
+## 12.3 代码实现
+
+### 12.3.1 基础实现（用户注册系统）
+
+**子系统类**
+
+```java
+// 验证器
+public class UserValidator {
+    public boolean validate(User user) {
+        if (user.getUsername() == null || user.getUsername().isEmpty()) {
+            return false;
+        }
+        if (user.getPassword() == null || user.getPassword().length() < 6) {
+            return false;
+        }
+        return true;
+    }
+}
+
+// 用户仓库
+public class UserRepository {
+    public boolean exists(String username) {
+        // 模拟查询数据库
+        return false;
+    }
+
+    public void save(User user) {
+        System.out.println("保存用户到数据库: " + user.getUsername());
+    }
+}
+
+// 密码加密器
+public class PasswordEncoder {
+    public String encode(String password) {
+        // 简化：实际应该使用BCrypt等
+        return "encoded_" + password;
+    }
+}
+
+// 邮件服务
+public class EmailService {
+    public void sendWelcomeEmail(User user) {
+        System.out.println("发送欢迎邮件给: " + user.getEmail());
+    }
+}
+
+// 日志记录
+public class Logger {
+    public void log(String message) {
+        System.out.println("[LOG] " + message);
+    }
+}
+```
+
+**外观类**
+
+```java
+public class UserRegisterFacade {
+    private UserValidator validator;
+    private UserRepository repository;
+    private PasswordEncoder encoder;
+    private EmailService emailService;
+    private Logger logger;
+
+    public UserRegisterFacade() {
+        this.validator = new UserValidator();
+        this.repository = new UserRepository();
+        this.encoder = new PasswordEncoder();
+        this.emailService = new EmailService();
+        this.logger = new Logger();
+    }
+
+    public RegisterResult register(String username, String password, String email) {
+        // 1. 创建用户对象
+        User user = new User();
+        user.setUsername(username);
+        user.setPassword(password);
+        user.setEmail(email);
+
+        // 2. 验证
+        if (!validator.validate(user)) {
+            logger.log("验证失败: " + username);
+            return new RegisterResult(false, "验证失败");
+        }
+
+        // 3. 检查用户名是否存在
+        if (repository.exists(username)) {
+            logger.log("用户名已存在: " + username);
+            return new RegisterResult(false, "用户名已存在");
+        }
+
+        // 4. 加密密码
+        user.setPassword(encoder.encode(password));
+
+        // 5. 保存用户
+        repository.save(user);
+
+        // 6. 发送欢迎邮件
+        emailService.sendWelcomeEmail(user);
+
+        // 7. 记录日志
+        logger.log("用户注册成功: " + username);
+
+        return new RegisterResult(true, "注册成功");
+    }
+}
+
+// 用户类
+public class User {
+    private String username;
+    private String password;
+    private String email;
+    // getters and setters
+}
+
+// 注册结果
+public class RegisterResult {
+    private boolean success;
+    private String message;
+    public RegisterResult(boolean success, String message) {
+        this.success = success;
+        this.message = message;
+    }
+    // getters
+}
+```
+
+**客户端使用**
+
+```java
+public class Main {
+    public static void main(String[] args) {
+        UserRegisterFacade facade = new UserRegisterFacade();
+
+        // 简单的一行代码完成用户注册
+        RegisterResult result = facade.register("john", "123456", "john@example.com");
+
+        System.out.println(result.getMessage());
+    }
+}
+```
+
+### 12.3.2 订单处理系统
+
+```java
+// 订单服务
+public class OrderService {
+    public void createOrder(Order order) { /* 创建订单 */ }
+    public void cancelOrder(String orderId) { /* 取消订单 */ }
+    public Order getOrder(String orderId) { /* 查询订单 */ return null; }
+}
+
+// 库存服务
+public class InventoryService {
+    public boolean checkStock(String productId, int quantity) { return true; }
+    public void deductStock(String productId, int quantity) { /* 扣减库存 */ }
+    public void restoreStock(String productId, int quantity) { /* 恢复库存 */ }
+}
+
+// 支付服务
+public class PaymentService {
+    public boolean pay(String userId, double amount) { return true; }
+    public void refund(String userId, double amount) { /* 退款 */ }
+}
+
+// 物流服务
+public class ShippingService {
+    public void ship(String orderId, String address) { /* 发货 */ }
+    public void cancelShipping(String orderId) { /* 取消发货 */ }
+}
+
+// 通知服务
+public class NotificationService {
+    public void notifyUser(String userId, String message) { /* 发送通知 */ }
+}
+
+// 外观类 - 订单处理
+public class OrderFacade {
+    private OrderService orderService;
+    private InventoryService inventoryService;
+    private PaymentService paymentService;
+    private ShippingService shippingService;
+    private NotificationService notificationService;
+
+    public OrderFacade() {
+        this.orderService = new OrderService();
+        this.inventoryService = new InventoryService();
+        this.paymentService = new PaymentService();
+        this.shippingService = new ShippingService();
+        this.notificationService = new NotificationService();
+    }
+
+    // 一键下单
+    public OrderResult placeOrder(String userId, String productId, int quantity, String address) {
+        // 1. 检查库存
+        if (!inventoryService.checkStock(productId, quantity)) {
+            return new OrderResult(false, "库存不足");
+        }
+
+        // 2. 计算价格（简化）
+        double price = 100.0 * quantity;
+
+        // 3. 支付
+        if (!paymentService.pay(userId, price)) {
+            return new OrderResult(false, "支付失败");
+        }
+
+        // 4. 创建订单
+        Order order = new Order();
+        order.setId("ORDER-" + System.currentTimeMillis());
+        order.setUserId(userId);
+        order.setProductId(productId);
+        order.setQuantity(quantity);
+        order.setStatus("PAID");
+        orderService.createOrder(order);
+
+        // 5. 扣减库存
+        inventoryService.deductStock(productId, quantity);
+
+        // 6. 发货
+        shippingService.ship(order.getId(), address);
+
+        // 7. 通知用户
+        notificationService.notifyUser(userId, "订单已发货");
+
+        return new OrderResult(true, "下单成功", order.getId());
+    }
+
+    // 一键取消订单
+    public CancelResult cancelOrder(String orderId, String userId) {
+        Order order = orderService.getOrder(orderId);
+        if (order == null) {
+            return new CancelResult(false, "订单不存在");
+        }
+
+        // 1. 取消发货
+        shippingService.cancelShipping(orderId);
+
+        // 2. 恢复库存
+        inventoryService.restoreStock(order.getProductId(), order.getQuantity());
+
+        // 3. 退款
+        double price = 100.0 * order.getQuantity();
+        paymentService.refund(userId, price);
+
+        // 4. 更新订单状态
+        orderService.cancelOrder(orderId);
+
+        // 5. 通知用户
+        notificationService.notifyUser(userId, "订单已取消，已退款");
+
+        return new CancelResult(true, "取消成功");
+    }
+}
+```
+
+### 12.3.3 视频转换系统
+
+```java
+// 复杂的视频处理子系统
+public class VideoFile { /* 视频文件 */ }
+
+public class CodecFactory { /* 编解码器 */ }
+public class BitrateConverter { /* 比特率转换 */ }
+public class AudioMixer { /* 音频混合 */ }
+public class VideoMixer { /* 视频混合 */ }
+public class SubtitlesEncoder { /* 字幕编码 */ }
+public class VideoExporter { /* 视频导出 */ }
+
+// 外观类
+public class VideoConverterFacade {
+    public void convert(String filename, String format) {
+        System.out.println("开始转换视频...");
+
+        VideoFile file = new VideoFile();
+
+        // 复杂的多步骤转换
+        CodecFactory.extract(file);
+        BitrateConverter.convert(file);
+        AudioMixer.mix(file);
+        VideoMixer.mix(file);
+
+        if ("mp4".equals(format)) {
+            VideoExporter.toMP4(file);
+        } else if ("avi".equals(format)) {
+            VideoExporter.toAVI(file);
+        }
+
+        System.out.println("转换完成!");
+    }
+}
+```
+
+## 12.4 JDK/框架源码解析
+
+### 12.4.1 JDK中的外观模式
+
+**Math类**
+```java
+// Math类提供了数学运算的统一接口
+// 内部封装了复杂的数学计算
+Math.max(a, b);
+Math.min(a, b);
+Math.abs(a);
+Math.sqrt(a);
+Math.pow(a, b);
+```
+
+**Collections类**
+```java
+// Collections提供了集合操作的统一接口
+Collections.sort(list);
+Collections.reverse(list);
+Collections.shuffle(list);
+Collections.max(collection);
+Collections.min(collection);
+```
+
+### 12.4.2 Spring中的外观模式
+
+**JdbcUtils（Spring JDBC）**
+```java
+// 简化JDBC操作
+JdbcTemplate template = new JdbcTemplate(dataSource);
+List<User> users = template.query("SELECT * FROM users", new UserRowMapper());
+```
+
+**RestTemplate**
+```java
+// 简化HTTP请求
+RestTemplate restTemplate = new RestTemplate();
+User user = restTemplate.getForObject(url, User.class);
+```
+
+### 12.4.3 MyBatis中的外观模式
+
+**SqlSession**
+```java
+// SqlSession封装了底层的JDBC操作
+SqlSession session = sqlSessionFactory.openSession();
+User user = session.selectOne("UserMapper.selectById", id);
+session.commit();
+session.close();
+```
+
+### 12.4.4 SLF4J日志门面
+
+```java
+// SLF4J是日志的门面模式
+// 底层可以对接Log4j、Logback、JUL等
+Logger logger = LoggerFactory.getLogger(Abc.class);
+logger.info("message");
+// 内部封装了具体的日志实现
+```
+
+## 12.5 使用场景与案例
+
+### 12.5.1 银行账户系统
+
+```java
+// 子系统
+public class AccountService { /* 账户服务 */ }
+public class TransactionService { /* 交易服务 */ }
+public class RiskControlService { /* 风控服务 */ }
+public class NotificationService { /* 通知服务 */ }
+public class LogService { /* 日志服务 */ }
+
+// 外观类 - 账户操作
+public class AccountFacade {
+    // 存款
+    public void deposit(String accountId, double amount) {
+        // 1. 验证
+        // 2. 风控检查
+        // 3. 执行存款
+        // 4. 记录交易
+        // 5. 通知
+        // 6. 记录日志
+    }
+
+    // 取款
+    public void withdraw(String accountId, double amount) {
+        // 1. 验证
+        // 2. 余额检查
+        // 3. 风控检查
+        // 4. 执行取款
+        // 5. 记录交易
+        // 6. 通知
+        // 7. 记录日志
+    }
+
+    // 转账
+    public void transfer(String fromAccount, String toAccount, double amount) {
+        // 完整的转账流程
+    }
+}
+```
+
+### 12.5.2 编译器外观
+
+```java
+// 编译器子系统
+public class LexicalAnalyzer { /* 词法分析 */ }
+public class SyntaxAnalyzer { /* 语法分析 */ }
+public class SemanticAnalyzer { /* 语义分析 */ }
+public class CodeOptimizer { /* 代码优化 */ }
+public class CodeGenerator { /* 代码生成 */ }
+
+// 编译器外观
+public class CompilerFacade {
+    public void compile(String sourceCode, String outputFile) {
+        // 词法分析
+        LexicalAnalyzer analyzer = new LexicalAnalyzer();
+        TokenStream tokens = analyzer.analyze(sourceCode);
+
+        // 语法分析
+        SyntaxAnalyzer parser = new SyntaxAnalyzer();
+        AST ast = parser.parse(tokens);
+
+        // 语义分析
+        SemanticAnalyzer semantic = new SemanticAnalyzer();
+        semantic.analyze(ast);
+
+        // 代码优化
+        CodeOptimizer optimizer = new CodeOptimizer();
+        AST optimizedAst = optimizer.optimize(ast);
+
+        // 代码生成
+        CodeGenerator generator = new CodeGenerator();
+        byte[] bytecode = generator.generate(optimizedAst);
+
+        // 输出
+        writeFile(outputFile, bytecode);
+    }
+}
+```
+
+### 12.5.3 报表生成系统
+
+```java
+// 子系统
+public class DataCollector { /* 数据收集 */ }
+public class DataProcessor { /* 数据处理 */ }
+public class ChartGenerator { /* 图表生成 */ }
+public class ReportFormatter { /* 报表格式化 */ }
+public class PDFExporter { /* PDF导出 */ }
+public class ExcelExporter { /* Excel导出 */ }
+public class EmailSender { /* 邮件发送 */ }
+
+// 报表外观
+public class ReportFacade {
+    public void generateAndSendReport(String reportType, String period, String recipient) {
+        // 1. 收集数据
+        DataCollector collector = new DataCollector();
+        RawData rawData = collector.collect(period);
+
+        // 2. 处理数据
+        DataProcessor processor = new DataProcessor();
+        ProcessedData data = processor.process(rawData);
+
+        // 3. 生成图表
+        ChartGenerator chartGen = new ChartGenerator();
+        List<Chart> charts = chartGen.generate(data);
+
+        // 4. 格式化报表
+        ReportFormatter formatter = new ReportFormatter();
+        FormattedReport report = formatter.format(data, charts);
+
+        // 5. 导出PDF
+        PDFExporter pdfExporter = new PDFExporter();
+        byte[] pdf = pdfExporter.export(report);
+
+        // 6. 发送邮件
+        EmailSender sender = new EmailSender();
+        sender.send(recipient, "报表", pdf);
+    }
+}
+```
+
+## 12.6 潜在风险与问题
+
+### 12.6.1 过度封装
+
+外观模式可能过度封装，导致客户端无法访问子系统的细节功能。
+
+**解决方案**：
+- 在外观类中提供细粒度的方法
+- 保留直接访问子系统的能力
+- 使用"门禁"模式，部分功能通过外观，部分直接访问
+
+### 12.6.2 违反开闭原则
+
+当子系统需要添加新功能时，可能需要修改外观类。
+
+**解决方案**：
+- 外观类的职责应该清晰，不常变化
+- 使用依赖注入，子系统变化时修改依赖而非外观
+
+### 12.6.3 与其他模式的关系
+
+| 模式 | 目的 | 关系 |
+|------|------|------|
+| 外观模式 | 简化接口 | 提供统一入口 |
+| 适配器模式 | 转换接口 | 让不兼容变兼容 |
+| 中介者模式 | 解耦对象 | 集中控制 |
+| 装饰器模式 | 动态添加职责 | 增强功能 |
+
+### 12.6.4 单例vs多例
+
+外观类是否应该是单例？
+
+- 如果外观类无状态，可以使用单例
+- 如果需要维护状态，考虑使用原型或工厂
+
+## 12.7 优化策略
+
+### 12.7.1 使用依赖注入
+
+```java
+public class OrderFacade {
+    private final OrderService orderService;
+    private final InventoryService inventoryService;
+    private final PaymentService paymentService;
+    // 通过构造函数注入
+    public OrderFacade(OrderService orderService, InventoryService inventoryService,
+                       PaymentService paymentService) {
+        this.orderService = orderService;
+        this.inventoryService = inventoryService;
+        this.paymentService = paymentService;
+    }
+}
+```
+
+### 12.7.2 提供多种粒度的接口
+
+```java
+public class UserFacade {
+    // 简单操作 - 一键完成
+    public RegisterResult registerSimple(String username, String password) { ... }
+
+    // 细粒度操作 - 可定制
+    public void validateUser(User user) { ... }
+    public void saveUser(User user) { ... }
+    public void sendEmail(User user) { ... }
+}
+```
+
+### 12.7.3 最佳实践
+
+| 场景 | 建议 |
+|------|------|
+| 子系统复杂 | 使用外观模式 |
+| 需要统一入口 | 外观模式 |
+| 需要简单和复杂两套API | 同时提供简单和细粒度接口 |
+| 子系统经常变化 | 考虑其他模式 |
+
+## 本章小结
+
+本章详细介绍了外观模式：
+
+1. **解决的问题**：为复杂子系统提供简单统一的接口，降低使用成本
+2. **UML结构**：外观类、子系统类、客户端
+3. **实现方式**：封装子系统的复杂调用，提供简单入口
+4. **框架应用**：Math类、Collections、JdbcTemplate、RestTemplate、SLF4J
+5. **潜在问题**：过度封装、违反开闭原则
+6. **优化策略**：依赖注入、提供多种粒度接口
+
+**外观模式是系统集成的利器**，通过提供统一的入口，可以大大简化客户端代码，提高系统的可维护性。
+
+---
+在下一章中，，我们将学习代理模式，为对象提供代理以控制访问。