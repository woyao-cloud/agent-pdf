# 第8章 适配器模式（Adapter）

**适配器模式**（Adapter Pattern）是一种结构型设计模式，它将一个类的接口转换成客户端期望的另一个接口，使原本因为接口不兼容而无法一起工作的类可以协同工作。适配器模式也被称为**包装器**（Wrapper）模式。

## 8.1 解决的问题与应用场景

### 8.1.1 问题分析

在软件开发中，我们经常会遇到接口不兼容的情况。例如，系统预期调用某个接口，但现有的类却提供了完全不同的方法签名。如果不做任何处理，客户端必须直接修改代码来适应新的接口，这违反了开闭原则。

```java
// 系统期望的目标接口
public interface Logger {
    void info(String message);
    void error(String message);
    void debug(String message);
}

// 但现有的旧日志库接口完全不同
public class OldLoggingSystem {
    public void writeLog(int level, String msg) {
        // level: 1=INFO, 2=ERROR, 3=DEBUG
        System.out.println("[旧日志] 级别=" + level + ", 消息=" + msg);
    }
}

// 客户端代码无法直接使用 OldLoggingSystem
// Logger logger = new OldLoggingSystem(); // 编译错误！类型不兼容
```

上述问题暴露了接口不兼容带来的困扰：

- **无法直接替换**：新的系统接口与现有类的接口不匹配，无法直接替换。
- **代码侵入性强**：如果修改现有类来匹配新接口，可能会破坏现有的调用方。
- **第三方库不可修改**：当不兼容的类是第三方库中的类时，无法修改其源码。
- **重复适配**：同样的适配逻辑散落在各个客户端代码中。

### 8.1.2 适配器模式的解决思路

适配器模式引入一个**适配器类**（Adapter），它位于客户端和目标接口之间，负责将一个接口转换为另一个接口。适配器包装了不兼容的类（Adaptee），并实现了客户端期望的目标接口（Target）。

适配器有两种实现方式：

1. **类适配器**（Class Adapter）：基于**继承**实现，Adapter 同时继承 Target 和 Adaptee。
2. **对象适配器**（Object Adapter）：基于**组合**实现，Adapter 实现 Target 接口，并持有 Adaptee 的引用。

### 8.1.3 典型应用场景

| 场景 | 描述 | 示例 |
|------|------|------|
| 遗留系统集成 | 将旧系统接口适配为新系统接口 | 旧 SOAP 服务适配为新 REST API |
| 第三方库封装 | 统一不同第三方库的调用方式 | 适配不同支付 SDK、短信 SDK |
| 数据格式转换 | 将一种数据格式转换为另一种 | XML 转 JSON、CSV 转对象 |
| 多数据源适配 | 统一不同数据库/存储的访问接口 | MySQL、MongoDB、Redis 统一 DAO |
| 版本升级过渡 | 新接口替换旧接口时保持向后兼容 | 在旧接口上提供新接口适配器 |

## 8.2 实现原理与UML

### 8.2.1 核心思想

适配器模式的核心思想是**在现有接口和目标接口之间建立一个中间层**，这个中间层负责进行接口转换。适配器模式不改变原有类的功能，而是改变其接口表现形式。

四个核心角色：

| 角色 | 名称 | 职责 |
|------|------|------|
| **Target（目标接口）** | 客户端期望的接口 | 定义客户端所使用的特定领域接口 |
| **Adaptee（被适配者）** | 需要被适配的现有类 | 已有功能的实现者，但接口不兼容 |
| **Adapter（适配器）** | 核心转换类 | 在 Target 和 Adaptee 之间架起桥梁 |
| **Client（客户端）** | 调用者 | 通过 Target 接口与业务交互 |

### 8.2.2 类适配器 UML

类适配器使用**多重继承**（在 Java 中通过实现接口 + 继承具体类）来实现适配。

```
                    ┌─────────────────────────────────┐
                    │      <<interface>>               │
                    │         Target                    │
                    ├─────────────────────────────────┤
                    │ + request(): void                │
                    └───────────────────┬─────────────┘
                                        │  实现
                    ┌───────────────────┴─────────────┐
                    │           Adapter                 │
                    │  (类适配器：继承 + 实现)            │
                    ├─────────────────────────────────┤
                    │         (继承 Adaptee)             │
                    │         (实现 Target)              │
                    ├─────────────────────────────────┤
                    │ + request(): void                │
                    └───────────────────┬─────────────┘
                                        │ 继承
                    ┌───────────────────┴─────────────┐
                    │          Adaptee                  │
                    ├─────────────────────────────────┤
                    │ + specificRequest(): void        │
                    └─────────────────────────────────┘
```

适配过程：`client.request()` -> `Adapter.request()` -> `this.specificRequest()`（继承自 Adaptee）

### 8.2.3 对象适配器 UML

对象适配器使用**组合**来实现适配，Adapter 持有 Adaptee 的引用。

```
                    ┌─────────────────────────────────┐
                    │      <<interface>>               │
                    │         Target                    │
                    ├─────────────────────────────────┤
                    │ + request(): void                │
                    └───────────────────┬─────────────┘
                                        │  实现
                    ┌───────────────────┴─────────────┐
                    │           Adapter                 │
                    │  (对象适配器：组合)                 │
                    ├─────────────────────────────────┤
                    │ - adaptee: Adaptee               │
                    ├─────────────────────────────────┤
                    │ + Adapter(Adaptee)               │
                    │ + request(): void                │
                    └───────────────────┬─────────────┘
                                        │ 持有引用
                    ┌───────────────────┴─────────────┐
                    │          Adaptee                  │
                    ├─────────────────────────────────┤
                    │ + specificRequest(): void        │
                    └─────────────────────────────────┘
```

适配过程：`client.request()` -> `Adapter.request()` -> `adaptee.specificRequest()`

### 8.2.4 类适配器 vs 对象适配器对比

| 对比维度 | 类适配器 | 对象适配器 |
|----------|----------|------------|
| 实现方式 | 继承（extends Adaptee + implements Target） | 组合（持有 Adaptee 引用） |
| Java 支持 | 受限于单继承（Adaptee 必须是类） | 任何 Adaptee 都可适配 |
| 灵活性 | 低（编译期绑定，无法适配子类） | 高（运行期绑定，可适配 Adaptee 子类） |
| 透明性 | 可重写 Adaptee 的方法 | 不能轻易重写 Adaptee 的方法 |
| 代码量 | 较少 | 稍多（需要构造注入） |
| 推荐程度 | **不推荐**（受限于单继承） | **强烈推荐** |

### 8.2.5 时序图

```
Client                  Adapter                 Adaptee
   │                       │                       │
   │  request()            │                       │
   │ ────────────────────► │                       │
   │                       │                       │
   │                       │   specificRequest()   │
   │                       │ ───────────────────►  │
   │                       │                       │
   │                       │   result              │
   │                       │ ◄───────────────────  │
   │                       │                       │
   │   result              │                       │
   │ ◄──────────────────── │                       │
   │                       │                       │
```

## 8.3 代码实现

### 8.3.1 类适配器实现（基于继承）

类适配器通过继承 Adaptee 并实现 Target 接口来完成适配。注意：在 Java 中，由于不支持多重继承，Adaptee 必须是一个类（而非接口）才能使用继承方式实现。

```java
/**
 * 目标接口：客户端期望使用的 5V 充电接口
 */
interface UsbCharger {
    /**
     * 通过 USB 输出 5V 电压
     */
    int output5V();
}

/**
 * 被适配者：已经存在的 220V 家用交流电源
 */
class AC220V {
    /**
     * 输出 220V 电压
     */
    public int output220V() {
        return 220;
    }
}

/**
 * 类适配器：将 220V 交流电适配为 5V USB 充电输出
 * 通过继承 Adaptee（AC220V）并实现 Target（UsbCharger）
 */
class ClassAdapter extends AC220V implements UsbCharger {
    @Override
    public int output5V() {
        // 获取 220V 电压并进行降压转换
        int voltage220 = output220V();
        // 模拟电压转换过程（220V -> 5V）
        int voltage5 = voltage220 / 44;
        System.out.println("[类适配器] 输入: " + voltage220 + "V -> 输出: " + voltage5 + "V");
        return voltage5;
    }
}

/**
 * 客户端测试
 */
public class ClassAdapterExample {
    public static void main(String[] args) {
        // 创建类适配器
        UsbCharger charger = new ClassAdapter();

        // 通过 USB 接口给手机充电
        int voltage = charger.output5V();
        System.out.println("手机正在充电，电压: " + voltage + "V\n");

        // 验证结果
        assert voltage == 5 : "电压必须是 5V";
    }
}
```

**运行结果**

```
[类适配器] 输入: 220V -> 输出: 5V
手机正在充电，电压: 5V
```

### 8.3.2 对象适配器实现（基于组合 - 推荐）

对象适配器通过组合方式持有 Adaptee 的引用，并实现 Target 接口。这是**推荐的做法**，因为它更加灵活。

```java
/**
 * 目标接口：客户端期望使用的 5V 充电接口
 */
interface UsbCharger {
    int output5V();
}

/**
 * 被适配者：220V 交流电源
 */
class AC220V {
    public int output220V() {
        return 220;
    }
}

/**
 * 对象适配器：通过组合方式适配
 * 持有 Adaptee 引用，实现 Target 接口
 */
class ObjectAdapter implements UsbCharger {
    private final AC220V ac220V;

    /**
     * 通过构造函数注入被适配对象
     */
    public ObjectAdapter(AC220V ac220V) {
        this.ac220V = ac220V;
    }

    @Override
    public int output5V() {
        int voltage220 = ac220V.output220V();
        int voltage5 = voltage220 / 44;
        System.out.println("[对象适配器] 输入: " + voltage220 + "V -> 输出: " + voltage5 + "V");
        return voltage5;
    }
}

/**
 * 客户端测试
 */
public class ObjectAdapterExample {
    public static void main(String[] args) {
        // 创建被适配对象
        AC220V ac220V = new AC220V();

        // 创建对象适配器，注入被适配对象
        UsbCharger charger = new ObjectAdapter(ac220V);

        // 充电
        int voltage = charger.output5V();
        System.out.println("手机正在充电，电压: " + voltage + "V");
    }
}
```

### 8.3.3 实际案例一：旧日志系统适配为 SLF4J 风格

在真实项目中，经常会遇到将旧的日志框架适配为新的 SLF4J 风格接口的场景。

```java
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 旧日志系统的日志级别常量
 */
class OldLogLevel {
    public static final int INFO = 1;
    public static final int ERROR = 2;
    public static final int DEBUG = 3;
    public static final int WARN = 4;
}

/**
 * 被适配者：旧日志系统
 * 方法签名完全不同于主流日志框架
 */
class OldLoggerSystem {
    /**
     * 写入日志记录
     *
     * @param level   日志级别（1=INFO, 2=ERROR, 3=DEBUG, 4=WARN）
     * @param message 日志消息
     * @param tag     日志标签/模块名
     */
    public void writeLog(int level, String message, String tag) {
        String levelName;
        switch (level) {
            case OldLogLevel.INFO:  levelName = "INFO";  break;
            case OldLogLevel.ERROR: levelName = "ERROR"; break;
            case OldLogLevel.DEBUG: levelName = "DEBUG"; break;
            case OldLogLevel.WARN:  levelName = "WARN";  break;
            default:                levelName = "UNKNOWN";
        }

        String timestamp = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"));
        System.out.println("[" + timestamp + "] [" + levelName + "] [" + tag + "] " + message);
    }

    /**
     * 写入异常日志
     */
    public void writeException(String message, Throwable throwable, String tag) {
        String timestamp = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"));
        System.out.println("[" + timestamp + "] [ERROR] [" + tag + "] " + message);
        throwable.printStackTrace(System.out);
    }
}

/**
 * 目标接口：SLF4J 风格的日志接口
 * 这是客户端期望使用的新式日志接口
 */
interface ModernLogger {
    void info(String message);
    void info(String format, Object... args);
    void error(String message);
    void error(String message, Throwable throwable);
    void debug(String message);
    void warn(String message);
    String getName();
}

/**
 * 适配器：将 OldLoggerSystem 适配为 ModernLogger
 * 使用对象适配器模式（组合方式）
 */
class LoggerAdapter implements ModernLogger {
    private final OldLoggerSystem oldLogger;
    private final String name;

    public LoggerAdapter(OldLoggerSystem oldLogger, String name) {
        this.oldLogger = oldLogger;
        this.name = name;
    }

    @Override
    public void info(String message) {
        oldLogger.writeLog(OldLogLevel.INFO, message, name);
    }

    @Override
    public void info(String format, Object... args) {
        String message = String.format(format, args);
        oldLogger.writeLog(OldLogLevel.INFO, message, name);
    }

    @Override
    public void error(String message) {
        oldLogger.writeLog(OldLogLevel.ERROR, message, name);
    }

    @Override
    public void error(String message, Throwable throwable) {
        oldLogger.writeException(message, throwable, name);
    }

    @Override
    public void debug(String message) {
        oldLogger.writeLog(OldLogLevel.DEBUG, message, name);
    }

    @Override
    public void warn(String message) {
        oldLogger.writeLog(OldLogLevel.WARN, message, name);
    }

    @Override
    public String getName() {
        return name;
    }
}

/**
 * 测试客户端
 */
public class LoggerAdapterExample {
    public static void main(String[] args) {
        // 被适配的旧日志系统
        OldLoggerSystem oldLogger = new OldLoggerSystem();

        // 通过适配器使用 ModernLogger 接口
        ModernLogger logger = new LoggerAdapter(oldLogger, "UserService");

        // 客户端代码完全使用 ModernLogger 接口
        logger.info("用户 {} 登录成功", "张三");
        logger.info("用户登录 IP: {}", "192.168.1.100");
        logger.debug("开始验证用户权限...");
        logger.warn("用户密码即将过期");

        try {
            // 模拟异常
            throw new RuntimeException("数据库连接超时");
        } catch (RuntimeException e) {
            logger.error("用户查询失败", e);
        }

        System.out.println("\n=== 验证: 所有日志调用均通过 ModernLogger 接口输出 ===");
        System.out.println("旧日志系统已完全适配为 SLF4J 风格，无需修改旧代码");
    }
}
```

### 8.3.4 实际案例二：统一第三方支付 SDK

在电商系统中，常常需要集成多个支付渠道（支付宝、微信支付、银联），每个 SDK 的接口各不相同，适配器模式可以统一它们的调用方式。

```java
import java.math.BigDecimal;
import java.util.UUID;

// ===================== 第三方支付 SDK（不可修改） =====================

/**
 * 支付宝 SDK（第三方库，不可修改）
 */
class AlipaySDK {
    /**
     * 支付宝支付接口
     *
     * @param tradeNo    商户订单号
     * @param totalAmount 支付金额（元）
     * @param subject    订单标题
     * @param body       订单描述
     * @return 支付结果 JSON 字符串
     */
    public String pay(String tradeNo, String totalAmount, String subject, String body) {
        System.out.println("[支付宝 SDK] 发起支付: tradeNo=" + tradeNo
                + ", amount=" + totalAmount + ", subject=" + subject);
        // 模拟调用支付宝网关
        return "{\"code\":\"10000\",\"tradeNo\":\"" + tradeNo
                + "\",\"status\":\"SUCCESS\"}";
    }

    /**
     * 支付宝退款接口
     */
    public String refund(String tradeNo, String refundAmount, String refundReason) {
        System.out.println("[支付宝 SDK] 发起退款: tradeNo=" + tradeNo
                + ", refundAmount=" + refundAmount);
        return "{\"code\":\"10000\",\"status\":\"SUCCESS\"}";
    }

    /**
     * 支付宝查询接口
     */
    public String query(String tradeNo) {
        System.out.println("[支付宝 SDK] 查询订单: tradeNo=" + tradeNo);
        return "{\"code\":\"10000\",\"tradeNo\":\"" + tradeNo
                + "\",\"status\":\"TRADE_SUCCESS\"}";
    }
}

/**
 * 微信支付 SDK（第三方库，不可修改）
 */
class WechatPaySDK {
    /**
     * 微信支付接口 —— 与支付宝的参数完全不同！
     *
     * @param outTradeNo 商户订单号
     * @param totalFee   支付金额（分，注意单位是分而不是元）
     * @param description 商品描述
     * @param spbillCreateIp 终端IP
     * @return 预支付 ID
     */
    public String unifiedOrder(String outTradeNo, int totalFee,
                                String description, String spbillCreateIp) {
        System.out.println("[微信 SDK] 统一下单: outTradeNo=" + outTradeNo
                + ", totalFee(分)=" + totalFee + ", desc=" + description);
        // 模拟调用微信支付
        return "prepay_id=" + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 微信退款接口
     */
    public String refund(String outTradeNo, int totalFee, int refundFee) {
        System.out.println("[微信 SDK] 申请退款: outTradeNo=" + outTradeNo
                + ", totalFee=" + totalFee + ", refundFee=" + refundFee);
        return "refund_id=" + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 微信查询接口
     */
    public String orderQuery(String outTradeNo) {
        System.out.println("[微信 SDK] 查询订单: outTradeNo=" + outTradeNo);
        return "{\"trade_state\":\"SUCCESS\",\"out_trade_no\":\"" + outTradeNo + "\"}";
    }
}

// ===================== 统一支付接口 =====================

/**
 * 支付结果
 */
class PaymentResult {
    private final boolean success;
    private final String transactionId;
    private final String message;

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

    public boolean isSuccess() { return success; }
    public String getTransactionId() { return transactionId; }
    public String getMessage() { return message; }
}

/**
 * 支付请求参数
 */
class PaymentRequest {
    private final String orderId;
    private final BigDecimal amount;
    private final String description;
    private final String clientIp;

    public PaymentRequest(String orderId, BigDecimal amount,
                          String description, String clientIp) {
        this.orderId = orderId;
        this.amount = amount;
        this.description = description;
        this.clientIp = clientIp;
    }

    public String getOrderId() { return orderId; }
    public BigDecimal getAmount() { return amount; }
    public String getDescription() { return description; }
    public String getClientIp() { return clientIp; }
}

/**
 * 目标接口：统一支付服务
 * 客户端只依赖这个接口，不依赖任何具体 SDK
 */
interface PaymentService {
    /**
     * 发起支付
     */
    PaymentResult pay(PaymentRequest request);

    /**
     * 退款
     */
    PaymentResult refund(String orderId, BigDecimal amount);

    /**
     * 查询订单状态
     */
    String queryOrder(String orderId);
}

// ===================== 适配器实现 =====================

/**
 * 支付宝适配器：将 AlipaySDK 适配为 PaymentService
 */
class AlipayAdapter implements PaymentService {
    private final AlipaySDK alipaySDK;

    public AlipayAdapter(AlipaySDK alipaySDK) {
        this.alipaySDK = alipaySDK;
    }

    @Override
    public PaymentResult pay(PaymentRequest request) {
        // 将统一请求参数转换为支付宝 SDK 需要的格式
        String amountStr = request.getAmount().setScale(2, BigDecimal.ROUND_HALF_UP).toString();
        String response = alipaySDK.pay(
                request.getOrderId(),
                amountStr,
                request.getDescription(),
                request.getDescription()
        );

        // 解析支付宝响应
        if (response.contains("\"code\":\"10000\"")) {
            return PaymentResult.success(request.getOrderId());
        }
        return PaymentResult.failure("支付宝支付失败: " + response);
    }

    @Override
    public PaymentResult refund(String orderId, BigDecimal amount) {
        String amountStr = amount.setScale(2, BigDecimal.ROUND_HALF_UP).toString();
        String response = alipaySDK.refund(orderId, amountStr, "用户申请退款");
        if (response.contains("\"code\":\"10000\"")) {
            return PaymentResult.success(orderId);
        }
        return PaymentResult.failure("支付宝退款失败: " + response);
    }

    @Override
    public String queryOrder(String orderId) {
        return alipaySDK.query(orderId);
    }
}

/**
 * 微信支付适配器：将 WechatPaySDK 适配为 PaymentService
 */
class WechatPayAdapter implements PaymentService {
    private final WechatPaySDK wechatPaySDK;

    public WechatPayAdapter(WechatPaySDK wechatPaySDK) {
        this.wechatPaySDK = wechatPaySDK;
    }

    @Override
    public PaymentResult pay(PaymentRequest request) {
        // 关键转换：微信支付使用「分」为单位，需要将元转换为分
        int totalFee = request.getAmount()
                .multiply(new BigDecimal(100))
                .intValue();

        String prepayId = wechatPaySDK.unifiedOrder(
                request.getOrderId(),
                totalFee,
                request.getDescription(),
                request.getClientIp()
        );

        if (prepayId != null && prepayId.startsWith("prepay_id=")) {
            return PaymentResult.success(prepayId);
        }
        return PaymentResult.failure("微信支付失败: " + prepayId);
    }

    @Override
    public PaymentResult refund(String orderId, BigDecimal amount) {
        int totalFee = amount.multiply(new BigDecimal(100)).intValue();
        String refundId = wechatPaySDK.refund(orderId, totalFee, totalFee);
        if (refundId != null && refundId.startsWith("refund_id=")) {
            return PaymentResult.success(refundId);
        }
        return PaymentResult.failure("微信退款失败: " + refundId);
    }

    @Override
    public String queryOrder(String orderId) {
        return wechatPaySDK.orderQuery(orderId);
    }
}

// ===================== 工厂 + 客户端 =====================

/**
 * 支付渠道类型
 */
enum PayChannel {
    ALIPAY, WECHAT
}

/**
 * 支付适配器工厂
 */
class PaymentAdapterFactory {
    public static PaymentService createAdapter(PayChannel channel) {
        switch (channel) {
            case ALIPAY:
                return new AlipayAdapter(new AlipaySDK());
            case WECHAT:
                return new WechatPayAdapter(new WechatPaySDK());
            default:
                throw new IllegalArgumentException("不支持的支付渠道: " + channel);
        }
    }
}

/**
 * 客户端测试
 * 注意：客户端代码完全不依赖具体的 SDK 类！
 */
public class PaymentAdapterExample {
    public static void main(String[] args) {
        // 创建订单请求
        PaymentRequest request = new PaymentRequest(
                "ORDER_" + System.currentTimeMillis(),
                new BigDecimal("299.00"),
                "华为Mate60 Pro 手机",
                "192.168.1.100"
        );

        // 使用支付宝支付 - 客户端只依赖 PaymentService 接口
        System.out.println("========== 支付宝支付 ==========");
        PaymentService alipay = PaymentAdapterFactory.createAdapter(PayChannel.ALIPAY);
        PaymentResult result1 = alipay.pay(request);
        System.out.println("支付结果: " + (result1.isSuccess() ? "成功" : "失败")
                + ", 交易号: " + result1.getTransactionId());

        // 使用微信支付 - 同样的调用方式！
        System.out.println("\n========== 微信支付 ==========");
        PaymentService wechatPay = PaymentAdapterFactory.createAdapter(PayChannel.WECHAT);
        PaymentResult result2 = wechatPay.pay(request);
        System.out.println("支付结果: " + (result2.isSuccess() ? "成功" : "失败")
                + ", 交易号: " + result2.getTransactionId());

        // 退款
        System.out.println("\n========== 退款 ==========");
        PaymentResult refundResult = alipay.refund(request.getOrderId(), request.getAmount());
        System.out.println("退款结果: " + (refundResult.isSuccess() ? "成功" : "失败"));

        // 订单查询
        System.out.println("\n========== 订单查询 ==========");
        String queryResult = wechatPay.queryOrder(request.getOrderId());
        System.out.println("微信订单状态: " + queryResult);
    }
}
```

## 8.4 JDK/框架源码解析

### 8.4.1 java.util.Arrays.asList() —— 数组到 List 的适配

`Arrays.asList()` 是 JDK 中最经典的适配器模式应用。它将数组适配为 `List` 接口，使得数组可以像 List 一样被操作。

```java
import java.util.Arrays;
import java.util.List;

public class ArraysAsListAdapterExample {
    public static void main(String[] args) {
        // 数组（Adaptee）
        String[] array = {"Java", "Python", "Go", "Rust"};

        // Arrays.asList() 是适配器：将数组适配为 List 接口
        // 返回的是一个适配器类（java.util.Arrays.ArrayList），不是 java.util.ArrayList
        List<String> list = Arrays.asList(array);

        // 客户端可以通过 List 接口操作数组
        System.out.println("通过 List 接口访问: " + list.get(0));
        System.out.println("List 大小: " + list.size());
        System.out.println("是否包含 Go: " + list.contains("Go"));

        // 修改 List 会影响原数组（因为是适配器，操作的是同一个底层数组）
        list.set(0, "JavaScript");
        System.out.println("修改后的数组: " + Arrays.toString(array));

        // 注意：Arrays.asList() 返回的 List 不支持结构性修改
        try {
            list.add("C#"); // 抛出 UnsupportedOperationException
        } catch (UnsupportedOperationException e) {
            System.out.println("不支持 add 操作（适配器限制）");
        }
    }
}
```

**源码分析**：`Arrays.asList()` 返回的是 `Arrays` 的内部类 `ArrayList`（注意这不是 `java.util.ArrayList`），这个内部类将数组包装起来，实现了 `List` 接口的 `get()`、`set()`、`size()` 等方法，但 `add()` 和 `remove()` 会抛出异常——这正是适配器模式的典型特征：适配后的接口可能不完全等同于原生实现。

### 8.4.2 java.io.InputStreamReader/OutputStreamWriter —— 字节流到字符流的适配

`InputStreamReader` 将字节输入流（`InputStream`）适配为字符输入流（`Reader`），`OutputStreamWriter` 将字节输出流（`OutputStream`）适配为字符输出流（`Writer`）。这是 Java I/O 体系中最核心的适配器应用。

```java
import java.io.*;

public class StreamAdapterExample {
    public static void main(String[] args) throws Exception {
        // ===== InputStreamReader =====
        // Target: Reader (字符流)
        // Adaptee: InputStream (字节流)
        // Adapter: InputStreamReader

        // 原始字节流（Adaptee）
        InputStream fileInputStream = new FileInputStream("test.txt");
        // 或者从字符串获取字节流
        InputStream byteStream = new ByteArrayInputStream(
                "Hello, 适配器模式!".getBytes("UTF-8"));

        // InputStreamReader 是适配器：将 InputStream -> Reader
        Reader reader = new InputStreamReader(byteStream, "UTF-8");

        // 客户端通过 Reader 接口操作
        BufferedReader bufferedReader = new BufferedReader(reader);
        String line = bufferedReader.readLine();
        System.out.println("读取内容: " + line);

        bufferedReader.close();

        // ===== OutputStreamWriter =====
        // Target: Writer (字符流)
        // Adaptee: OutputStream (字节流)
        // Adapter: OutputStreamWriter

        OutputStream outputStream = new ByteArrayOutputStream();
        Writer writer = new OutputStreamWriter(outputStream, "UTF-8");
        writer.write("通过 Writer 写入的内容");
        writer.close();

        System.out.println("字节流内容: " + outputStream.toString());
    }
}
```

**适配链分析**：

```
字节流 (InputStream)  --[InputStreamReader 适配]--> 字符流 (Reader)  --[BufferedReader 装饰]--> 带缓冲的字符流
```

`InputStreamReader` 和 `OutputStreamWriter` 是纯粹的适配器：它们不增加新的功能，只是将字节流的 API 转换为字符流的 API。它们负责在读取/写入时进行字节到字符的编解码转换。

### 8.4.3 Spring MVC HandlerAdapter

Spring MVC 中的 `HandlerAdapter` 是适配器模式的经典应用。Spring MVC 支持多种处理器类型（`@Controller` 方法、`HttpRequestHandler`、`SimpleServletHandler` 等），每种处理器的调用方式都不同。`HandlerAdapter` 将这些不同的调用方式统一起来。

```java
// HandlerAdapter 接口（Spring MVC 源码简化版）
public interface HandlerAdapter {
    /**
     * 判断是否支持该处理器
     */
    boolean supports(Object handler);

    /**
     * 执行处理器并返回 ModelAndView
     */
    ModelAndView handle(HttpServletRequest request,
                        HttpServletResponse response,
                        Object handler) throws Exception;
}

// 适配器1：处理 @Controller 注解的处理器
public class RequestMappingHandlerAdapter implements HandlerAdapter {
    @Override
    public boolean supports(Object handler) {
        return handler instanceof HandlerMethod;
    }

    @Override
    public ModelAndView handle(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler) throws Exception {
        // 将请求参数绑定到方法参数
        // 调用 @Controller 的对应方法
        // 处理返回值（ModelAndView / String / ResponseEntity 等）
        HandlerMethod handlerMethod = (HandlerMethod) handler;
        // ... 复杂的参数解析和方法调用逻辑
        return new ModelAndView();
    }
}

// 适配器2：处理实现了 HttpRequestHandler 接口的处理器
public class HttpRequestHandlerAdapter implements HandlerAdapter {
    @Override
    public boolean supports(Object handler) {
        return handler instanceof HttpRequestHandler;
    }

    @Override
    public ModelAndView handle(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler) throws Exception {
        // 直接调用 HttpRequestHandler.handleRequest()
        HttpRequestHandler requestHandler = (HttpRequestHandler) handler;
        requestHandler.handleRequest(request, response);
        return null; // 不返回视图
    }
}

// 适配器3：处理实现了 Controller 接口（旧版）的处理器
public class SimpleControllerHandlerAdapter implements HandlerAdapter {
    @Override
    public boolean supports(Object handler) {
        return handler instanceof Controller;
    }

    @Override
    public ModelAndView handle(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler) throws Exception {
        Controller controller = (Controller) handler;
        return controller.handleRequest(request, response);
    }
}
```

**Spring MVC 的适配器工作流程**：

```
DispatcherServlet  --持有--> HandlerMapping (找到处理器)
DispatcherServlet  --持有--> HandlerAdapter (适配调用)
                                  |
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
      RequestMappingHandler  HttpRequestHandler  Controller
      Adapter (@Controller)  Adapter (REST)      Adapter (旧版)
```

`DispatcherServlet` 是客户端，它通过 `HandlerAdapter` 接口统一调用不同类型的处理器，而不需要关心每个处理器的具体调用细节。当需要新增一种处理器类型时，只需增加一个新的 `HandlerAdapter` 实现即可。

### 8.4.4 Spring AdvisorAdapter

Spring AOP 中的 `AdvisorAdapter` 将不同类型的通知（Advice）适配为统一的 `MethodInterceptor` 接口。

```java
// Spring AOP 源码简化
public interface AdvisorAdapter {
    /**
     * 判断是否支持该通知类型
     */
    boolean supportsAdvice(Advice advice);

    /**
     * 将 Advice 适配为 MethodInterceptor
     */
    MethodInterceptor getInterceptor(Advisor advisor);
}

// 前置通知适配器
class MethodBeforeAdviceAdapter implements AdvisorAdapter {
    @Override
    public boolean supportsAdvice(Advice advice) {
        return advice instanceof MethodBeforeAdvice;
    }

    @Override
    public MethodInterceptor getInterceptor(Advisor advisor) {
        MethodBeforeAdvice advice = (MethodBeforeAdvice) advisor.getAdvice();
        return new MethodBeforeAdviceInterceptor(advice);
    }
}

// 后置通知适配器
class AfterReturningAdviceAdapter implements AdvisorAdapter {
    @Override
    public boolean supportsAdvice(Advice advice) {
        return advice instanceof AfterReturningAdvice;
    }

    @Override
    public MethodInterceptor getInterceptor(Advisor advisor) {
        AfterReturningAdvice advice = (AfterReturningAdvice) advisor.getAdvice();
        return new AfterReturningAdviceInterceptor(advice);
    }
}

// 异常通知适配器
class ThrowsAdviceAdapter implements AdvisorAdapter {
    @Override
    public boolean supportsAdvice(Advice advice) {
        return advice instanceof ThrowsAdvice;
    }

    @Override
    public MethodInterceptor getInterceptor(Advisor advisor) {
        ThrowsAdvice advice = (ThrowsAdvice) advisor.getAdvice();
        return new ThrowsAdviceInterceptor(advice);
    }
}
```

## 8.5 使用场景与案例

### 8.5.1 遗留系统集成（SOAP -> REST）

将旧的 SOAP 服务适配为 RESTful API 接口，是遗留系统现代化改造中的常见场景。

```java
import java.util.HashMap;
import java.util.Map;

/**
 * 旧的 SOAP Web 服务客户端（遗留系统）
 */
class OldSoapServiceClient {
    /**
     * 通过 SOAP 协议调用远程服务
     */
    public String callSoapService(String soapEnvelopeXml, String endpoint) {
        System.out.println("[SOAP] 调用端点: " + endpoint);
        System.out.println("[SOAP] 请求XML: " + soapEnvelopeXml);
        // 模拟 SOAP 调用
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">"
                + "<soap:Body><getUserResponse><userId>123</userId>"
                + "<userName>张三</userName></getUserResponse></soap:Body></soap:Envelope>";
    }
}

/**
 * 目标接口：现代 REST 风格的用户服务
 */
interface RestUserService {
    UserDto getUserById(String userId);
    UserDto createUser(String name, String email);
    void deleteUser(String userId);
}

/**
 * 用户 DTO
 */
class UserDto {
    private String id;
    private String name;
    private String email;

    public UserDto() {}

    public UserDto(String id, String name, String email) {
        this.id = id;
        this.name = name;
        this.email = email;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    @Override
    public String toString() {
        return "UserDto{id='" + id + "', name='" + name + "', email='" + email + "'}";
    }
}

/**
 * SOAP 到 REST 的适配器
 * 将旧 SOAP 服务适配为 REST 风格的接口
 */
class SoapToRestAdapter implements RestUserService {
    private final OldSoapServiceClient soapClient;
    private static final String SOAP_ENDPOINT = "http://legacy-server:8080/soap/UserService";

    public SoapToRestAdapter(OldSoapServiceClient soapClient) {
        this.soapClient = soapClient;
    }

    @Override
    public UserDto getUserById(String userId) {
        // 构建 SOAP 请求
        String soapRequest = "<?xml version=\"1.0\"?>"
                + "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">"
                + "<soap:Body><getUser><userId>" + userId + "</userId></getUser></soap:Body>"
                + "</soap:Envelope>";

        // 调用旧的 SOAP 服务
        String soapResponse = soapClient.callSoapService(soapRequest, SOAP_ENDPOINT);

        // 解析 SOAP 响应（简化处理）
        UserDto user = new UserDto();
        user.setId(extractXmlValue(soapResponse, "userId"));
        user.setName(extractXmlValue(soapResponse, "userName"));
        user.setEmail(user.getId() + "@example.com"); // 模拟
        return user;
    }

    @Override
    public UserDto createUser(String name, String email) {
        String soapRequest = "<?xml version=\"1.0\"?>"
                + "<soap:Envelope...><soap:Body><createUser>"
                + "<name>" + name + "</name><email>" + email + "</email>"
                + "</createUser></soap:Body></soap:Envelope>";
        String soapResponse = soapClient.callSoapService(soapRequest, SOAP_ENDPOINT);
        String id = extractXmlValue(soapResponse, "userId");
        return new UserDto(id, name, email);
    }

    @Override
    public void deleteUser(String userId) {
        String soapRequest = "<?xml version=\"1.0\"?>"
                + "<soap:Envelope...><soap:Body><deleteUser>"
                + "<userId>" + userId + "</userId>"
                + "</deleteUser></soap:Body></soap:Envelope>";
        soapClient.callSoapService(soapRequest, SOAP_ENDPOINT);
    }

    /**
     * 简单的 XML 值提取（生产环境应使用 XPath）
     */
    private String extractXmlValue(String xml, String tag) {
        String openTag = "<" + tag + ">";
        String closeTag = "</" + tag + ">";
        int start = xml.indexOf(openTag);
        int end = xml.indexOf(closeTag);
        if (start != -1 && end != -1) {
            return xml.substring(start + openTag.length(), end);
        }
        return "";
    }
}

/**
 * 客户端：现代 REST 代码，底层调用的却是 SOAP
 */
public class LegacySystemIntegrationExample {
    public static void main(String[] args) {
        // 旧系统的 SOAP 客户端
        OldSoapServiceClient soapClient = new OldSoapServiceClient();

        // 通过适配器暴露 REST 接口
        RestUserService userService = new SoapToRestAdapter(soapClient);

        // 客户端代码完全感知不到 SOAP 的存在
        UserDto user = userService.getUserById("123");
        System.out.println("获取用户: " + user);

        UserDto newUser = userService.createUser("李四", "lisi@example.com");
        System.out.println("创建用户: " + newUser);

        userService.deleteUser("123");
        System.out.println("用户已删除");
    }
}
```

### 8.5.2 多数据源适配

当系统需要支持多种数据源（MySQL、MongoDB、Redis）时，可以使用适配器模式为每种数据源提供统一的 DAO 接口。

```java
import java.util.*;

// ===== 统一数据访问接口 =====

/**
 * 统一数据访问接口
 */
interface DataAccess<T> {
    T findById(String id);
    List<T> findAll();
    void save(T entity);
    void update(T entity);
    void delete(String id);
}

// ===== 实体类 =====

class Product {
    private String id;
    private String name;
    private double price;

    public Product() {}

    public Product(String id, String name, double price) {
        this.id = id;
        this.name = name;
        this.price = price;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public double getPrice() { return price; }
    public void setPrice(double price) { this.price = price; }

    @Override
    public String toString() {
        return "Product{id='" + id + "', name='" + name + "', price=" + price + "}";
    }
}

// ===== MySQL 数据源（使用 JDBC） =====

/**
 * MySQL 数据访问适配器
 */
class MySqlProductDao implements DataAccess<Product> {
    // 模拟 MySQL 连接
    private final Map<String, Product> database = new HashMap<>();

    public MySqlProductDao() {
        // 初始化模拟数据
        database.put("P001", new Product("P001", "MySQL商品A", 99.0));
    }

    @Override
    public Product findById(String id) {
        System.out.println("[MySQL] SELECT * FROM products WHERE id = '" + id + "'");
        return database.get(id);
    }

    @Override
    public List<Product> findAll() {
        System.out.println("[MySQL] SELECT * FROM products");
        return new ArrayList<>(database.values());
    }

    @Override
    public void save(Product product) {
        System.out.println("[MySQL] INSERT INTO products VALUES ('"
                + product.getId() + "', '" + product.getName() + "', " + product.getPrice() + ")");
        database.put(product.getId(), product);
    }

    @Override
    public void update(Product product) {
        System.out.println("[MySQL] UPDATE products SET name='"
                + product.getName() + "', price=" + product.getPrice()
                + " WHERE id='" + product.getId() + "'");
        database.put(product.getId(), product);
    }

    @Override
    public void delete(String id) {
        System.out.println("[MySQL] DELETE FROM products WHERE id = '" + id + "'");
        database.remove(id);
    }
}

// ===== MongoDB 数据源 =====

/**
 * MongoDB 数据访问适配器
 */
class MongoDbProductDao implements DataAccess<Product> {
    // 模拟 MongoDB 集合
    private final Map<String, Product> collection = new HashMap<>();

    public MongoDbProductDao() {
        collection.put("P001", new Product("P001", "MongoDB商品A", 88.0));
    }

    @Override
    public Product findById(String id) {
        System.out.println("[MongoDB] db.products.findOne({_id: '" + id + "'})");
        return collection.get(id);
    }

    @Override
    public List<Product> findAll() {
        System.out.println("[MongoDB] db.products.find({})");
        return new ArrayList<>(collection.values());
    }

    @Override
    public void save(Product product) {
        System.out.println("[MongoDB] db.products.insert({_id: '"
                + product.getId() + "', name: '" + product.getName() + "', price: "
                + product.getPrice() + "})");
        collection.put(product.getId(), product);
    }

    @Override
    public void update(Product product) {
        System.out.println("[MongoDB] db.products.update({_id: '"
                + product.getId() + "'}, {$set: {name: '" + product.getName()
                + "', price: " + product.getPrice() + "}})");
        collection.put(product.getId(), product);
    }

    @Override
    public void delete(String id) {
        System.out.println("[MongoDB] db.products.remove({_id: '" + id + "'})");
        collection.remove(id);
    }
}

// ===== Redis 数据源 =====

/**
 * Redis 数据访问适配器
 */
class RedisProductDao implements DataAccess<Product> {
    // 模拟 Redis
    private final Map<String, Product> cache = new HashMap<>();

    public RedisProductDao() {
        cache.put("P001", new Product("P001", "Redis商品A", 77.0));
    }

    @Override
    public Product findById(String id) {
        System.out.println("[Redis] GET product:" + id);
        return cache.get(id);
    }

    @Override
    public List<Product> findAll() {
        System.out.println("[Redis] KEYS product:* -> 逐个GET");
        return new ArrayList<>(cache.values());
    }

    @Override
    public void save(Product product) {
        System.out.println("[Redis] SET product:" + product.getId()
                + " '" + product.getName() + "' | " + product.getPrice());
        cache.put(product.getId(), product);
    }

    @Override
    public void update(Product product) {
        System.out.println("[Redis] SET product:" + product.getId()
                + " '" + product.getName() + "' | " + product.getPrice());
        cache.put(product.getId(), product);
    }

    @Override
    public void delete(String id) {
        System.out.println("[Redis] DEL product:" + id);
        cache.remove(id);
    }
}

/**
 * 客户端：统一的数据访问方式
 */
public class MultiDataSourceExample {
    public static void main(String[] args) {
        // 创建不同数据源的适配器
        DataAccess<Product> mysql = new MySqlProductDao();
        DataAccess<Product> mongodb = new MongoDbProductDao();
        DataAccess<Product> redis = new RedisProductDao();

        // 完全相同的客户端代码，底层使用不同的数据源
        System.out.println("========== MySQL 查询 ==========");
        Product p1 = mysql.findById("P001");
        System.out.println("结果: " + p1);

        System.out.println("\n========== MongoDB 查询 ==========");
        Product p2 = mongodb.findById("P001");
        System.out.println("结果: " + p2);

        System.out.println("\n========== Redis 查询 ==========");
        Product p3 = redis.findById("P001");
        System.out.println("结果: " + p3);

        // 所有数据源都通过 DataAccess 接口操作
        System.out.println("\n========== 统一新增商品 ==========");
        Product newProduct = new Product("P999", "通用商品", 199.0);
        mysql.save(newProduct);
        mongodb.save(newProduct);
        redis.save(newProduct);
    }
}
```

### 8.5.3 消息队列抽象

在微服务架构中，消息队列的实现可能从 Kafka 切换到 RabbitMQ 或 RocketMQ。适配器模式可以将不同 MQ 的客户端适配为统一接口。

```java
/**
 * 统一消息服务接口
 */
interface MqService {
    void publish(String topic, String message);
    void publish(String topic, String message, MqHeaders headers);
    String consume(String topic);
    void ack(String messageId);
}

/**
 * 消息头
 */
class MqHeaders {
    private final Map<String, String> headers = new HashMap<>();
    public MqHeaders add(String key, String value) {
        headers.put(key, value);
        return this;
    }
    public Map<String, String> toMap() { return headers; }
}

// ===== Kafka 适配器 =====
class KafkaAdapter implements MqService {
    @Override
    public void publish(String topic, String message) {
        System.out.println("[Kafka] 发送消息到 topic=" + topic + ": " + message);
    }

    @Override
    public void publish(String topic, String message, MqHeaders headers) {
        System.out.println("[Kafka] 发送消息到 topic=" + topic
                + ", headers=" + headers.toMap() + ": " + message);
    }

    @Override
    public String consume(String topic) {
        System.out.println("[Kafka] 从 topic=" + topic + " 消费消息");
        return "kafka-message-" + System.currentTimeMillis();
    }

    @Override
    public void ack(String messageId) {
        System.out.println("[Kafka] 提交 offset: " + messageId);
    }
}

// ===== RabbitMQ 适配器 =====
class RabbitMqAdapter implements MqService {
    @Override
    public void publish(String exchange, String message) {
        System.out.println("[RabbitMQ] 发送消息到 exchange=" + exchange + ": " + message);
    }

    @Override
    public void publish(String exchange, String message, MqHeaders headers) {
        System.out.println("[RabbitMQ] 发送消息到 exchange=" + exchange
                + ", headers=" + headers.toMap() + ": " + message);
    }

    @Override
    public String consume(String queue) {
        System.out.println("[RabbitMQ] 从 queue=" + queue + " 消费消息");
        return "rabbit-message-" + System.currentTimeMillis();
    }

    @Override
    public void ack(String deliveryTag) {
        System.out.println("[RabbitMQ] 发送 basic.ack: " + deliveryTag);
    }
}

// ===== RocketMQ 适配器 =====
class RocketMqAdapter implements MqService {
    @Override
    public void publish(String topic, String message) {
        System.out.println("[RocketMQ] 发送消息到 topic=" + topic + ": " + message);
    }

    @Override
    public void publish(String topic, String message, MqHeaders headers) {
        System.out.println("[RocketMQ] 发送消息到 topic=" + topic
                + ", properties=" + headers.toMap() + ": " + message);
    }

    @Override
    public String consume(String topic) {
        System.out.println("[RocketMQ] 从 topic=" + topic + " 拉取消息");
        return "rocket-message-" + System.currentTimeMillis();
    }

    @Override
    public void ack(String messageId) {
        System.out.println("[RocketMQ] 发送 ACK: " + messageId);
    }
}

/**
 * 消息队列适配器工厂
 */
class MqAdapterFactory {
    public static MqService createAdapter(String type) {
        switch (type.toUpperCase()) {
            case "KAFKA":    return new KafkaAdapter();
            case "RABBITMQ": return new RabbitMqAdapter();
            case "ROCKETMQ": return new RocketMqAdapter();
            default: throw new IllegalArgumentException("未知 MQ 类型: " + type);
        }
    }
}

public class MqAdapterExample {
    public static void main(String[] args) {
        // 业务代码只需要 MqService 接口
        MqService mq = MqAdapterFactory.createAdapter("KAFKA");
        mq.publish("order-topic", "{\"orderId\":\"123\"}");
        String msg = mq.consume("order-topic");
        mq.ack(msg);

        // 切换到 RabbitMQ —— 只需要改一行配置
        mq = MqAdapterFactory.createAdapter("RABBITMQ");
        mq.publish("order-exchange", "{\"orderId\":\"456\"}");
    }
}
```

### 8.5.4 短信服务适配

不同的短信提供商（阿里云短信、腾讯云短信、AWS SNS）接口各不相同，适配器模式可以统一它们的调用方式。

```java
interface SmsService {
    boolean sendSms(String phoneNumber, String message);
    boolean sendVerificationCode(String phoneNumber, String code);
    SmsStatus queryStatus(String messageId);
}

class SmsStatus {
    private final boolean delivered;
    private final String detail;
    public SmsStatus(boolean delivered, String detail) {
        this.delivered = delivered;
        this.detail = detail;
    }
    @Override
    public String toString() {
        return "SmsStatus{delivered=" + delivered + ", detail='" + detail + "'}";
    }
}

class AliyunSmsAdapter implements SmsService {
    @Override
    public boolean sendSms(String phoneNumber, String message) {
        System.out.println("[阿里云短信] 发送短信到 " + phoneNumber + ": " + message);
        return true;
    }
    @Override
    public boolean sendVerificationCode(String phoneNumber, String code) {
        System.out.println("[阿里云短信] 发送验证码 " + code + " 到 " + phoneNumber);
        return true;
    }
    @Override
    public SmsStatus queryStatus(String messageId) {
        return new SmsStatus(true, "阿里云短信已送达");
    }
}

class TencentSmsAdapter implements SmsService {
    @Override
    public boolean sendSms(String phoneNumber, String message) {
        System.out.println("[腾讯云短信] 发送短信到 " + phoneNumber + ": " + message);
        return true;
    }
    @Override
    public boolean sendVerificationCode(String phoneNumber, String code) {
        System.out.println("[腾讯云短信] 发送验证码 " + code + " 到 " + phoneNumber);
        return true;
    }
    @Override
    public SmsStatus queryStatus(String messageId) {
        return new SmsStatus(true, "腾讯云短信已送达");
    }
}
```

## 8.6 潜在风险与问题

### 8.6.1 类适配器受限于 Java 单继承

Java 不支持多重继承，因此类适配器只能继承一个 Adaptee 类。如果 Adaptee 是一个接口（Interface），则不存在此问题；但如果 Adaptee 是一个类，类适配器就无法同时继承其他有用的类。

```java
// 类适配器的限制：无法扩展其他类
class MyAdapter extends ExistingClass implements TargetInterface {
    // 编译通过，因为 ExistingClass 是唯一的父类
}

// 如果还需要另一个类的功能，就无法使用类适配器了
// class MyAdapter extends ExistingClass, AnotherClass implements TargetInterface {
//     // 编译错误！Java 不支持多重继承
// }
```

**解决方案**：始终优先使用对象适配器（组合模式），仅在绝对必要时使用类适配器。

### 8.6.2 适配器过多增加系统复杂度

当系统中存在大量适配器时，代码的可读性和可维护性会显著下降。过多的适配器层会让开发者在调试时感到困惑。

```java
// 反例：适配器嵌套适配器
OldA adaptA = new OldA();
AdapterA adapterA = new AdapterA(adaptA);  // 第1层适配
AdapterB adapterB = new AdapterB(adapterA); // 第2层适配
AdapterC adapterC = new AdapterC(adapterB); // 第3层适配
// 客户端需要了解整个适配链...
```

**解决方案**：
- 记录清晰的适配器文档和依赖关系
- 考虑是否可以直接重构 Adaptee，而不是增加新的适配器
- 使用适配器工厂统一管理适配器的创建

### 8.6.3 性能开销（委托代理）

适配器模式引入了额外的委托层次，每次调用都会经过 `Client -> Adapter -> Adaptee` 的路径。在高频调用的场景下，微小的性能开销会被放大。

```java
// 适配器带来的调用开销
public class PerformanceComparison {
    public static void main(String[] args) {
        int iterations = 10_000_000;
        Adaptee adaptee = new Adaptee();
        Target adapter = new ObjectAdapter(adaptee);

        // 直接调用 Adaptee
        long start1 = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            adaptee.specificRequest();
        }
        long end1 = System.nanoTime();

        // 通过适配器调用
        long start2 = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            adapter.request();
        }
        long end2 = System.nanoTime();

        System.out.println("直接调用: " + (end1 - start1) / 1_000_000 + " ms");
        System.out.println("适配器调用: " + (end2 - start2) / 1_000_000 + " ms");
        System.out.println("适配器额外开销: "
                + ((end2 - start2) - (end1 - start1)) / 1_000_000 + " ms");
    }
}

interface Target { void request(); }
class Adaptee {
    public void specificRequest() {
        // 空操作，只测量调用开销
    }
}
class ObjectAdapter implements Target {
    private final Adaptee adaptee;
    ObjectAdapter(Adaptee adaptee) { this.adaptee = adaptee; }
    @Override
    public void request() { adaptee.specificRequest(); }
}
```

实际上，现代 JVM 的内联优化可以将适配器的委托开销降到极低（纳秒级别），在绝大多数业务场景下无需担心性能问题。

### 8.6.4 掩盖更深层的设计问题

适配器模式是一种"补丁"方案，它解决了接口不兼容的问题，但并没有从根本上消除原因。如果系统中有大量适配器，可能说明系统架构设计本身就存在问题。

| 现象 | 可能的设计问题 |
|------|---------------|
| 多个适配器做类似的转换 | 抽象接口未收敛，需要统一接口规范 |
| 适配器中含有复杂的业务逻辑 | Adaptee 的职责划分不合理 |
| 适配器链过长 | 系统分层不清晰 |
| 新类不断需要适配 | 前期接口设计缺乏前瞻性 |

## 8.7 优化策略

### 8.7.1 优先使用对象适配器

始终优先使用对象适配器（组合方式），因为组合比继承更加灵活：

- Adaptee 可以是任何类的实例（包括其子类）
- 适配器不绑定到具体的 Adaptee 实现
- 适配器可以和 Adaptee 的多个子类协同工作
- 便于单元测试（可以注入 Mock 对象）

```java
// 推荐：对象适配器可以适配任何 Adaptee 子类
class FlexibleAdapter implements Target {
    private final Adaptee adaptee;

    // 构造函数接受 Adaptee 或其任意子类
    public FlexibleAdapter(Adaptee adaptee) {
        this.adaptee = adaptee;
    }

    @Override
    public void request() {
        adaptee.specificRequest();
    }
}

// 使用
Adaptee adaptee = new AdapteeSubclass(); // Adaptee 的子类
Target adapter = new FlexibleAdapter(adaptee); // 完美适配
```

### 8.7.2 考虑重构 Adaptee

如果 Adaptee 是**你自己的代码**，而不是第三方库，考虑直接重构 Adaptee 来匹配 Target 接口，而不是增加一个适配器层。

```java
// 不好的做法：为自己的代码写适配器
class MyOldClass {
    public void doSomethingOld() { /* ... */ }
}

class MyOldClassAdapter implements NewInterface {
    private final MyOldClass old;
    @Override
    public void doSomethingNew() { old.doSomethingOld(); }
}

// 更好的做法：直接重构
class MyOldClass implements NewInterface {
    @Override
    public void doSomethingNew() { /* ... */ }
}
```

**决策原则**：
- 如果是你自己的代码，且改动范围可控 -> **直接重构**
- 如果是第三方库或遗留系统，无法修改 -> **使用适配器**

### 8.7.3 使用依赖注入选择适配器

通过依赖注入（DI）或工厂模式，可以在运行时动态选择合适的适配器实现，使系统更加灵活。

```java
/**
 * 适配器选择器 — 基于运行时配置动态选择
 */
class PaymentServiceSelector {
    private final Map<PayChannel, PaymentService> adapters = new HashMap<>();

    public PaymentServiceSelector() {
        // 可以通过配置文件或注册中心动态注册
        adapters.put(PayChannel.ALIPAY, new AlipayAdapter(new AlipaySDK()));
        adapters.put(PayChannel.WECHAT, new WechatPayAdapter(new WechatPaySDK()));
        // 新增渠道只需添加适配器实现并注册
    }

    public PaymentService getAdapter(PayChannel channel) {
        PaymentService adapter = adapters.get(channel);
        if (adapter == null) {
            throw new IllegalArgumentException("不支持的支付渠道: " + channel);
        }
        return adapter;
    }
}

// Spring 环境下的注入方式
// @Bean
// public PaymentService alipayService() {
//     return new AlipayAdapter(new AlipaySDK());
// }
//
// @Bean
// public PaymentService wechatService() {
//     return new WechatPayAdapter(new WechatPaySDK());
// }
```

### 8.7.4 适配器 + 外观模式组合

对于复杂的遗留系统，可以先使用适配器模式将各个遗留组件的接口转换为统一接口，再使用外观模式将多个适配后的服务组织成一个完整的业务流程。

```java
/**
 * 步骤1：适配器 — 逐个适配遗留组件
 */
class LegacyOrderAdapter implements OrderService {
    private final LegacyOrderSystem legacyOrder;
    // ... 适配逻辑
}

class LegacyPaymentAdapter implements PaymentService {
    private final LegacyPaymentSystem legacyPayment;
    // ... 适配逻辑
}

class LegacyInventoryAdapter implements InventoryService {
    private final LegacyInventorySystem legacyInventory;
    // ... 适配逻辑
}

/**
 * 步骤2：外观 — 编排适配后的服务
 */
class UnifiedCheckoutFacade {
    private final OrderService orderService;
    private final PaymentService paymentService;
    private final InventoryService inventoryService;

    public UnifiedCheckoutFacade(OrderService orderService,
                                  PaymentService paymentService,
                                  InventoryService inventoryService) {
        this.orderService = orderService;
        this.paymentService = paymentService;
        this.inventoryService = inventoryService;
    }

    public CheckoutResult checkout(CheckoutRequest request) {
        // 客户端只需调用这一个方法
        // 底层是适配器 + 外观的组合
        if (!inventoryService.checkStock(request.getProductId(), request.getQuantity())) {
            return CheckoutResult.failure("库存不足");
        }
        String orderId = orderService.createOrder(request);
        PaymentResult payment = paymentService.pay(orderId, request.getAmount());
        return CheckoutResult.success(orderId, payment.getTransactionId());
    }
}
```

### 8.7.5 适配器设计决策表

| 条件 | 推荐方案 |
|------|---------|
| Adaptee 是第三方库，无法修改 | 对象适配器 |
| Adaptee 是你自己的类，但改动成本高 | 对象适配器（暂缓重构） |
| Adaptee 是你自己的类，改动范围小 | 直接重构 Adaptee |
| 需要在子类之间做适配 | 对象适配器（可以传入子类） |
| 需要重写 Adaptee 的部分行为 | 类适配器（通过继承重写） |
| Adaptee 有大量构造参数 | 考虑工厂模式创建适配器 |

## 本章小结

本章详细介绍了适配器模式（Adapter Pattern）：

1. **核心问题**：现有类的接口与客户端期望的接口不兼容，导致无法协同工作。
2. **解决思路**：在 Target 接口和 Adaptee 类之间引入 Adapter，负责接口转换。
3. **两种实现方式**：类适配器（继承）和对象适配器（组合），强烈推荐使用对象适配器。
4. **UML结构**：Target 接口、Adaptee 被适配者、Adapter 适配器、Client 客户端四个角色。
5. **代码实现**：提供了电压转换、日志系统适配、第三方支付 SDK 适配等完整 Java 示例。
6. **JDK源码**：`Arrays.asList()`、`InputStreamReader/OutputStreamWriter`、Spring MVC `HandlerAdapter`、`AdvisorAdapter`。
7. **使用场景**：遗留系统集成、多数据源适配、消息队列抽象、第三方 API 适配。
8. **主要风险**：类适配器受限于单继承、适配器过多增加复杂度、微小性能开销、掩盖设计问题。
9. **优化策略**：优先对象适配器、考虑重构 Adaptee、依赖注入选择适配器、与外观模式组合。

**适配器模式是系统集成的瑞士军刀**。它让新旧系统、不同接口风格的组件能够和谐共处，是遗留系统现代化改造和第三方集成的首选模式。

---

在下一章中，我们将学习桥接模式（Bridge Pattern），了解如何将抽象与实现解耦，使它们可以独立变化。
