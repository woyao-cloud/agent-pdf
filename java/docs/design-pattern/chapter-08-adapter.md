# 第8章 适配器模式（Adapter）

**适配器模式**将一个类的接口转换成客户期望的另一个接口，使得原本不兼容的类可以合作。

## 8.1 解决的问题与应用场景

### 8.1.1 问题分析

在软件开发中，经常需要整合已有的代码或第三方库。这些代码可能已经实现了我们需要的功能，但接口与当前系统不兼容：

```java
// 现有系统使用的接口
public interface PaymentGateway {
    void pay( String orderId, BigDecimal amount);
    RefundResult refund(String orderId, BigDecimal amount);
}

// 第三方支付SDK的接口
public class ThirdPartyPayment {
    public void makePayment(String transactionId, double money) { ... }
    public void refundTransaction(String transId, double money) { ... }
}
```

问题：
- 第三方SDK的方法签名与现有系统不匹配
- 不能直接替换现有实现
- 需要兼容已有的调用代码

### 8.1.2 典型应用场景

**1. 集成第三方库**
```java
// 适配第三方登录
ThirdPartyLogin thirdPartyLogin = new QQLogin();
LoginAdapter adapter = new QQLoginAdapter(thirdPartyLogin);
adapter.login("user");  // 统一接口
```

**2. 兼容旧系统**
```java
// 新系统使用新接口，旧系统使用旧接口
LegacySystem legacy = new OldDatabaseImpl();
DataSourceAdapter adapter = new LegacyToNewAdapter(legacy);
adapter.save(entity);  // 统一接口
```

**3. 统一不同数据源**
```java
// 从不同来源读取数据，统一接口
DataSource mysqlSource = new MySQLAdapter();
DataSource elasticSearchSource = new ESAdapter();
List<Data> data1 = mysqlSource.query(query);
List<Data> data2 = elasticSearchSource.query(query);
```

## 8.2 实现原理与UML

### 8.2.1 核心思想

适配器模式通过创建一个**适配器类**，将原有接口转换为目标接口，使不兼容的类能够协同工作。

### 8.2.2 类适配器（通过继承）

```java
// Client期望的接口（目标接口）
public interface Target {
    void request();
}

// 被适配者（Adaptee）
public class Adaptee {
    public void specificRequest() {
        System.out.println("Adaptee's specific request");
    }
}

// 适配器
public class ClassAdapter extends Adaptee implements Target {
    @Override
    public void request() {
        specificRequest();  // 调用父类的方法
    }
}
```

**UML类图（类适配器）**
```
┌─────────────┐        ┌─────────────┐
│   Client    │        │   Target    │
├─────────────┤        ├─────────────┤
│             │        │ + request() │
└─────────────┘        └──────┬──────┘
                             │ uses
                             ▼
                    ┌─────────────────┐
                    │     Adapter     │
                    ├─────────────────┤
                    │ + request()     │
                    └────────┬────────┘
                             │ extends
                             ▼
                    ┌─────────────────┐
                    │    Adaptee      │
                    ├─────────────────┤
                    │ + specificReq() │
                    └─────────────────┘
```

### 8.2.3 对象适配器（通过组合）

```java
// 目标接口
public interface Target {
    void request();
}

// 被适配者
public class Adaptee {
    public void specificRequest() {
        System.out.println("Adaptee's specific request");
    }
}

// 适配器（组合方式）
public class ObjectAdapter implements Target {
    private Adaptee adaptee;

    public ObjectAdapter(Adaptee adaptee) {
        this.adaptee = adaptee;
    }

    @Override
    public void request() {
        adaptee.specificRequest();
    }
}
```

**UML类图（对象适配器）**
```
┌─────────────┐        ┌─────────────┐
│   Client    │        │   Target    │
├─────────────┤        ├─────────────┤
│             │        │ + request() │
└─────────────┘        └──────┬──────┘
                             │ uses
                             ▼
                    ┌─────────────────┐
                    │     Adapter     │
                    ├─────────────────┤
                    │ - adaptee       │──────┐
                    │ + request()     │      │
                    └─────────────────┘      │ has
                                             ▼
                    ┌─────────────────┐
                    │    Adaptee      │
                    ├─────────────────┤
                    │ + specificReq() │
                    └─────────────────┘
```

### 8.2.4 角色分析

- **Target（目标接口）**：Client期望的接口
- **Adaptee（被适配者）**：已经存在的接口，但不兼容Target
- **Adapter（适配器）**：将Adaptee的接口转换为Target接口

## 8.3 代码实现（类适配器/对象适配器）

### 8.3.1 完整的对象适配器示例

**目标接口 - 支付网关**
```java
public interface PaymentGateway {
    PayResult pay(String orderId, BigDecimal amount);
    RefundResult refund(String orderId, BigDecimal amount);
}
```

**目标接口 - 结果类**
```java
public class PayResult {
    private boolean success;
    private String message;
    private String transactionId;

    public PayResult(boolean success, String message, String transactionId) {
        this.success = success;
        this.message = message;
        this.transactionId = transactionId;
    }
    // getters
}

public class RefundResult {
    private boolean success;
    private String message;
    private String refundId;

    public RefundResult(boolean success, String message, String refundId) {
        this.success = success;
        this.message = message;
        this.refundId = refundId;
    }
    // getters
}
```

**被适配者 - 第三方支付SDK**
```java
public class ThirdPartyPayment {
    // 第三方SDK的方法签名不同
    public boolean makePayment(String transactionId, double amount) {
        // 模拟支付
        System.out.println("Processing payment: " + transactionId + ", amount: " + amount);
        return true;
    }

    public boolean refundPayment(String transactionId, double amount) {
        // 模拟退款
        System.out.println("Processing refund: " + transactionId + ", amount: " + amount);
        return true;
    }
}
```

**适配器实现**
```java
public class PaymentAdapter implements PaymentGateway {
    private ThirdPartyPayment thirdPartyPayment;
    private Map<String, String> transactionIdMapping = new HashMap<>();

    public PaymentAdapter(ThirdPartyPayment thirdPartyPayment) {
        this.thirdPartyPayment = thirdPartyPayment;
    }

    @Override
    public PayResult pay(String orderId, BigDecimal amount) {
        String thirdPartyTransactionId = generateTransactionId(orderId);

        boolean success = thirdPartyPayment.makePayment(
            thirdPartyTransactionId,
            amount.doubleValue()
        );

        if (success) {
            transactionIdMapping.put(orderId, thirdPartyTransactionId);
            return new PayResult(true, "Payment successful", thirdPartyTransactionId);
        } else {
            return new PayResult(false, "Payment failed", null);
        }
    }

    @Override
    public RefundResult refund(String orderId, BigDecimal amount) {
        String transactionId = transactionIdMapping.get(orderId);
        if (transactionId == null) {
            return new RefundResult(false, "Transaction not found", null);
        }

        boolean success = thirdPartyPayment.refundPayment(transactionId, amount.doubleValue());

        if (success) {
            String refundId = "REFUND-" + System.currentTimeMillis();
            return new RefundResult(true, "Refund successful", refundId);
        } else {
            return new RefundResult(false, "Refund failed", null);
        }
    }

    private String generateTransactionId(String orderId) {
        return "TXN-" + orderId + "-" + System.currentTimeMillis();
    }
}
```

**客户端使用**
```java
public class Main {
    public static void main(String[] args) {
        // 创建被适配者
        ThirdPartyPayment thirdParty = new ThirdPartyPayment();

        // 创建适配器
        PaymentGateway gateway = new PaymentAdapter(thirdParty);

        // 使用统一的接口
        PayResult result = gateway.pay("ORDER-123", new BigDecimal("99.99"));
        System.out.println(result.getMessage());
    }
}
```

### 8.3.2 类适配器实现

```java
// 目标接口
public interface Target {
    void request();
}

// 被适配者
public class Adaptee {
    public void specificRequest() {
        System.out.println("Adaptee: specific request");
    }
}

// 类适配器（继承方式）
public class ClassAdapter extends Adaptee implements Target {
    @Override
    public void request() {
        specificRequest();  // 委托给父类的方法
        System.out.println("Adapter: transformed request");
    }
}
```

### 8.3.3 双向适配器

```java
// 两个不同的接口
public interface A {
    void methodA();
}

public interface B {
    void methodB();
}

// 双向适配器
public class Adapter implements A, B {
    private A a;
    private B b;

    public Adapter(A a) { this.a = a; }
    public Adapter(B b) { this.b = b; }

    @Override
    public void methodA() {
        // 如果b不为空，调用b
        if (b != null) b.methodB();
    }

    @Override
    public void methodB() {
        // 如果a不为空，调用a
        if (a != null) a.methodA();
    }
}
```

## 8.4 JDK/框架源码解析

### 8.4.1 Arrays.asList()

Arrays类将数组适配为List：
```java
String[] array = {"a", "b", "c"};
List<String> list = Arrays.asList(array);  // 数组→List

// 适配器原理：
// Arrays.asList() 返回一个 Arrays.ArrayList
// 这个类实现了 List 接口，但内部持有原数组的引用
```

### 8.4.2 InputStreamReader

字符流适配器：
```java
// InputStreamReader 将 InputStream 适配为 Reader
FileInputStream fis = new FileInputStream("file.txt");
Reader reader = new InputStreamReader(fis, "UTF-8");

// BufferedReader 进一步包装
BufferedReader br = new BufferedReader(reader);
```

### 8.4.3 Spring中的适配器模式

**HandlerAdapter** - 适配不同的处理器
```java
public interface HandlerAdapter {
    boolean supports(Object handler);
    ModelAndView handle(HttpServletRequest request,
                        HttpServletResponse response, Object handler);
}

// 不同的实现适配不同的Controller类型
// - RequestMappingHandlerAdapter
// - SimpleControllerHandlerAdapter
// - HttpRequestHandlerAdapter
```

**DataSourceAdapter** - 数据源适配
```java
// Spring Boot 自动配置数据源时使用适配器
DataSource dataSource = DataSourceBuilder.create()
    .url("jdbc:mysql://localhost:3306/test")
    .build();
```

### 8.4.4 Spring MVC中的适配器

```java
// HandlerMapping 适配不同的URL映射方式
// HandlerAdapter 适配不同的Controller类型
// ViewResolver 适配不同的视图技术
```

### 8.4.5 JDBC中的适配器

JDBC是适配器模式的典型应用：
```java
// JDBC 将各种数据库驱动适配为统一的 JDBC 接口
Connection conn = DriverManager.getConnection(url, user, pwd);
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(sql);

// 底层：MySQL驱动、PostgreSQL驱动等都被适配为JDBC标准接口
```

## 8.5 使用场景与案例

### 8.5.1 第三方登录适配

```java
// 统一登录接口
public interface LoginService {
    LoginResult login(LoginRequest request);
}

// 登录请求
public class LoginRequest {
    private String username;
    private String password;
    private LoginType type;
    // getters, setters
}

public enum LoginType {
    USERNAME, WECHAT, QQ, WECHAT_WORK
}

// 登录结果
public class LoginResult {
    private boolean success;
    private String token;
    private String message;
    // getters, setters
}

// 第三方登录SDK
public class WechatLoginSDK {
    public String loginByWechat(String code) {
        // 微信登录逻辑
        return "wechat_token_" + code;
    }
}

public class QQLoginSDK {
    public String loginByQQ(String accessToken) {
        return "qq_token_" + accessToken;
    }
}

// 适配器
public class ThirdPartyLoginAdapter implements LoginService {
    private WechatLoginSDK wechatLogin;
    private QQLoginSDK qqLogin;

    public ThirdPartyLoginAdapter(WechatLoginSDK wechatLogin, QQLoginSDK qqLogin) {
        this.wechatLogin = wechatLogin;
        this.qqLogin = qqLogin;
    }

    @Override
    public LoginResult login(LoginRequest request) {
        switch (request.getType()) {
            case WECHAT:
                return loginByWechat(request);
            case QQ:
                return loginByQQ(request);
            default:
                return new LoginResult(false, "Unsupported login type");
        }
    }

    private LoginResult loginByWechat(LoginRequest request) {
        try {
            String token = wechatLogin.loginByWechat(request.getPassword());
            return new LoginResult(true, token, "Wechat login success");
        } catch (Exception e) {
            return new LoginResult(false, null, e.getMessage());
        }
    }

    private LoginResult loginByQQ(LoginRequest request) {
        try {
            String token = qqLogin.loginByQQ(request.getPassword());
            return new LoginResult(true, token, "QQ login success");
        } catch (Exception e) {
            return new LoginResult(false, null, e.getMessage());
        }
    }
}
```

### 8.5.2 旧系统数据适配

```java
// 新系统接口
public interface UserRepository {
    User findById(Long id);
    void save(User user);
    void delete(Long id);
}

// 旧系统遗留类
public class LegacyUserSystem {
    public LegacyUser getUserByNumber(int userNumber) {
        // 旧系统的查询方法
        return new LegacyUser();
    }

    public void insertUser(LegacyUser user) {
        // 旧系统的插入方法
    }

    public void deleteUser(int userNumber) {
        // 旧系统的删除方法
    }
}

// 旧系统数据模型
public class LegacyUser {
    private int userNumber;
    private String fullName;
    private String emailAddress;
    private boolean active;
    // getters, setters
}

// 新系统数据模型
public class User {
    private Long id;
    private String name;
    private String email;
    private boolean active;
    // getters, setters
}

// 适配器
public class LegacyUserAdapter implements UserRepository {
    private LegacyUserSystem legacySystem;

    public LegacyUserAdapter(LegacyUserSystem legacySystem) {
        this.legacySystem = legacySystem;
    }

    @Override
    public User findById(Long id) {
        LegacyUser legacyUser = legacySystem.getUserByNumber(id.intValue());
        return convertToUser(legacyUser);
    }

    @Override
    public void save(User user) {
        LegacyUser legacyUser = convertToLegacyUser(user);
        legacySystem.insertUser(legacyUser);
    }

    @Override
    public void delete(Long id) {
        legacySystem.deleteUser(id.intValue());
    }

    private User convertToUser(LegacyUser legacy) {
        User user = new User();
        user.setId((long) legacy.getUserNumber());
        user.setName(legacy.getFullName());
        user.setEmail(legacy.getEmailAddress());
        user.setActive(legacy.isActive());
        return user;
    }

    private LegacyUser convertToLegacyUser(User user) {
        LegacyUser legacy = new LegacyUser();
        legacy.setUserNumber(user.getId().intValue());
        legacy.setFullName(user.getName());
        legacy.setEmailAddress(user.getEmail());
        legacy.setActive(user.isActive());
        return legacy;
    }
}
```

### 8.5.3 日志框架适配

```java
// 统一日志接口
public interface Logger {
    void debug(String message);
    void info(String message);
    void warn(String message);
    void error(String message);
}

// 第三方日志实现
public class Log4jLogger {
    public void logDebug(String msg) { /* Log4j debug */ }
    public void logInfo(String msg) { /* Log4j info */ }
    public void logWarning(String msg) { /* Log4j warn */ }
    public void logError(String msg) { /* Log4j error */ }
}

// 适配器
public class Log4jAdapter implements Logger {
    private Log4jLogger log4j;

    public Log4jAdapter(Log4jLogger log4j) {
        this.log4j = log4j;
    }

    @Override
    public void debug(String message) { log4j.logDebug(message); }

    @Override
    public void info(String message) { log4j.logInfo(message); }

    @Override
    public void warn(String message) { log4j.logWarning(message); }

    @Override
    public void error(String message) { log4j.logError(message); }
}
```

## 8.6 潜在风险与问题

### 8.6.1 适配器成为"垃圾箱"

过度使用适配器可能导致：
- 所有不兼容的代码都通过适配器解决
- 适配器类变得臃肿
- 失去使用标准接口的机会

**解决方案**：
- 优先考虑重构而非适配
- 适配器应该是一个过渡方案

### 8.6.2 适配器与原系统的耦合

适配器需要了解原系统的实现细节，如果原系统变化，适配器也需要修改。

**解决方案**：
- 使用接口隔离
- 适配器不应该暴露原系统的内部细节

### 8.6.3 对象适配器 vs 类适配器

| 特征 | 对象适配器 | 类适配器 |
|------|-----------|----------|
| 方式 | 组合 | 继承 |
| 灵活性 | 高（可适配多个Adaptee） | 低（单一继承） |
| Java支持 | 支持 | 支持 |
| 多重继承 | 不需要 | 需要 |
| 覆盖 | 困难 | 容易 |

### 8.6.4 过度封装

适配器可能隐藏太多细节，导致调试困难。

**解决方案**：
- 在适配器中添加日志
- 保持适配器的简洁性

## 8.7 优化策略

### 8.7.1 双向适配器的使用

```java
// 当需要同时支持两个方向时
public class BidirectionalAdapter implements A, B {
    // 可以根据上下文决定行为
}
```

### 8.7.2 缺省适配器

```java
// 为接口提供默认实现
public abstract class AbstractAdapter implements Target {
    @Override
    public void request() {
        // 默认空实现
    }
}
```

### 8.7.3 适配器工厂

```java
public class AdapterFactory {
    private static final Map<Class<?>, Supplier<Target>> ADAPTERS = new HashMap<>();

    static {
        ADAPTERS.put(AdapteeA.class, () -> new AdapterA());
        ADAPTERS.put(AdapteeB.class, () -> new AdapterB());
    }

    public static <T extends Target> T createAdapter(Class<?> adapteeClass) {
        Supplier<T> factory = (Supplier<T>) ADAPTERS.get(adapteeClass);
        if (factory == null) {
            throw new IllegalArgumentException("No adapter found for: " + adapteeClass);
        }
        return factory.get();
    }
}
```

### 8.7.4 最佳实践

| 场景 | 推荐方式 |
|------|----------|
| 适配单一对象 | 对象适配器 |
| 需要覆盖方法 | 类适配器 |
| 多个Adaptee | 对象适配器 |
| 临时兼容 | 适配器 |
| 长期集成 | 考虑重构接口 |

## 本章小结

本章详细介绍了适配器模式：

1. **解决的问题**：接口不兼容，使不相关的类可以协同工作
2. **UML结构**：目标接口、被适配者、适配器
3. **实现方式**：类适配器（继承）、对象适配器（组合）
4. **框架应用**：Arrays.asList()、InputStreamReader、Spring HandlerAdapter、JDBC
5. **潜在问题**：适配器膨胀、与原系统耦合
6. **优化策略**：双向适配器、缺省适配器、适配器工厂

**适配器模式是系统集成的利器**，合理使用可以让不兼容的组件协同工作。