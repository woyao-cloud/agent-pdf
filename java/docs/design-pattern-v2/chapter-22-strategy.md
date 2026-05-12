# 第22章 策略模式（Strategy）

**策略模式**定义一系列算法，将每个算法封装起来，并使它们可以相互替换。策略模式让算法的变化独立于使用算法的客户端。策略模式的核心思想是：分离变化的部分（算法）和不变的部分（使用算法的上下文），将算法选择从硬编码的if-else转换为运行时的多态委托。

## 22.1 解决的问题与应用场景

### 22.1.1 核心问题

在实际开发中，经常遇到同一操作有多种实现方式的需求。最直接的做法是用if-else或switch根据条件选择不同的执行路径：

```java
// 不使用策略模式的问题代码 —— 支付处理
public class PaymentService {

    public void pay(String method, BigDecimal amount) {
        if ("ALIPAY".equals(method)) {
            System.out.println("支付宝支付: " + amount);
            // 30行支付宝支付逻辑...
        } else if ("WECHAT".equals(method)) {
            System.out.println("微信支付: " + amount);
            // 30行微信支付逻辑...
        } else if ("BANK_CARD".equals(method)) {
            System.out.println("银行卡支付: " + amount);
            // 30行银行卡支付逻辑...
        } else if ("UNION_PAY".equals(method)) {
            System.out.println("云闪付支付: " + amount);
            // 30行云闪付逻辑...
        } else {
            throw new IllegalArgumentException("不支持的支付方式: " + method);
        }
        // 问题：
        // 1. 每增加一种支付方式，就要修改这个方法 —— 违反开闭原则
        // 2. 所有支付逻辑堆在一个方法里，可读性差
        // 3. 修改一种支付方式可能引入bug影响其他支付方式
        // 4. 单元测试需要覆盖所有分支，测试代码庞杂
    }
}
```

策略模式通过将每种算法封装到独立的类中，让客户端在运行时选择使用哪个策略，从根本上解决了上述问题。

### 22.1.2 核心特征

| 特征 | 说明 |
|------|------|
| **算法族** | 定义一组可互相替换的算法 |
| **独立封装** | 每个算法封装在独立的类中 |
| **可互换** | 策略之间可以无缝切换而不影响客户端 |
| **开闭原则** | 新增算法无需修改上下文代码 |
| **组合优于继承** | 通过组合（持有策略引用）而非继承来复用行为 |

### 22.1.3 典型应用场景

- **支付系统**：支付宝、微信、银行卡、云闪付等多种支付方式
- **排序算法**：冒泡排序、快速排序、归并排序等可动态选择
- **压缩工具**：ZIP、RAR、GZIP、7Z等不同压缩算法
- **定价/折扣引擎**：无折扣、满减、百分比折扣、买一赠一等
- **文件导出**：导出为PDF、Excel、CSV、JSON等不同格式
- **认证方式**：LDAP、OAuth2、SAML、JWT等多种认证策略
- **缓存淘汰策略**：LRU、LFU、FIFO、TTL等
- **物流计费**：按重量、按体积、按距离、固定费率等

## 22.2 实现原理与UML

### 22.2.1 核心角色

| 角色 | 职责 | 关键方法 |
|------|------|----------|
| **Strategy（策略接口）** | 定义所有策略必须实现的方法签名 | `execute()` |
| **ConcreteStrategy（具体策略）** | 实现特定算法 | `execute()` |
| **Context（上下文）** | 持有策略引用，对外暴露执行方法，内部委托给策略对象 | `setStrategy()`, `doSomething()` |
| **Client（客户端）** | 选择并设置策略，触发Context执行 | -- |

### 22.2.2 UML类图

```
┌───────────────────────────┐          ┌───────────────────────┐
│         Context           │          │       Strategy        │
│         (上下文)          │          │      (策略接口)       │
├───────────────────────────┤          ├───────────────────────┤
│ - strategy: Strategy     │<>──────>│ + execute(data)       │
│ + setStrategy(Strategy)  │          └───────────┬───────────┘
│ + doSomething()           │                      │
└───────────────────────────┘          ┌───────────┴───────────┐
                                       │                       │
                             ┌─────────┴──────────┐  ┌─────────┴──────────┐
                             │ ConcreteStrategyA │  │ ConcreteStrategyB │
                             │   (具体策略A)      │  │   (具体策略B)      │
                             ├────────────────────┤  ├────────────────────┤
                             │ + execute(data)   │  │ + execute(data)   │
                             └────────────────────┘  └────────────────────┘
```

### 22.2.3 策略模式 vs 状态模式（结构对比）

虽然策略模式和状态模式的UML结构几乎相同，但语义差异巨大：

| 维度 | 策略模式 | 状态模式 |
|------|----------|----------|
| **变化原因** | 客户端/外部选择 | 对象内部状态变化 |
| **谁决定变化** | Client主动设置 | Context自身或状态类决定 |
| **Context感知** | Context不知道策略的具体行为 | Context知道当前处于什么状态 |
| **关系稳定性** | 策略可以随时任意切换 | 状态转换有固定规则和路径 |
| **典型示例** | 支付方式由用户选择 | 订单状态自动流转 |

### 22.2.4 时序图

```
Client              Context              Strategy          ConcreteStrategyA
  │                    │                    │                    │
  │ new ConcreteStrategyA()               │                    │
  │───────────────────────────────────────────────────────────>│
  │                    │                    │                    │
  │ setStrategy(strategyA)                │                    │
  │───────────────────>│                    │                    │
  │                    │                    │                    │
  │ doSomething()      │                    │                    │
  │───────────────────>│                    │                    │
  │                    │  execute(data)     │                    │
  │                    │───────────────────>│                    │
  │                    │                    │  具体算法A的逻辑   │
  │                    │                    │  ............     │
  │                    │                    │                    │
```

## 22.3 代码实现

### 22.3.1 经典策略模式：支付系统完整实现

```java
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

// ==================== 策略接口 ====================
public interface PaymentStrategy {

    /**
     * 执行支付
     * @param amount 支付金额
     * @return 支付结果
     */
    PaymentResult pay(BigDecimal amount);

    /** 支付方式名称 */
    String getMethodName();

    /** 是否支持该支付场景 */
    default boolean supports(String scenario) {
        return true;
    }
}

// ==================== 支付结果 ====================
public class PaymentResult {
    private final boolean success;
    private final String transactionId;
    private final String message;

    public PaymentResult(boolean success, String transactionId, String message) {
        this.success = success;
        this.transactionId = transactionId;
        this.message = message;
    }

    public boolean isSuccess() { return success; }
    public String getTransactionId() { return transactionId; }
    public String getMessage() { return message; }
}

// ==================== 具体策略：支付宝支付 ====================
public class AlipayStrategy implements PaymentStrategy {

    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[支付宝] 发起支付请求，金额: ¥" + amount);
        // 实际项目：调用支付宝SDK
        // AlipayClient client = new DefaultAlipayClient(...);
        // AlipayTradePayRequest request = new AlipayTradePayRequest();
        // ...

        String transactionId = "ALI" + System.currentTimeMillis();
        System.out.println("[支付宝] 支付成功，交易号: " + transactionId);
        return new PaymentResult(true, transactionId,
                "支付宝支付成功，金额: ¥" + amount);
    }

    @Override
    public String getMethodName() {
        return "支付宝";
    }
}

// ==================== 具体策略：微信支付 ====================
public class WechatPayStrategy implements PaymentStrategy {

    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[微信] 发起支付请求，金额: ¥" + amount);
        // 实际项目：调用微信支付SDK
        // WXPay wxpay = new WXPay(config);
        // Map<String, String> data = new HashMap<>();
        // ...

        String transactionId = "WX" + System.currentTimeMillis();
        System.out.println("[微信] 支付成功，交易号: " + transactionId);
        return new PaymentResult(true, transactionId,
                "微信支付成功，金额: ¥" + amount);
    }

    @Override
    public String getMethodName() {
        return "微信支付";
    }
}

// ==================== 具体策略：银行卡支付 ====================
public class BankCardStrategy implements PaymentStrategy {

    @Override
    public PaymentResult pay(BigDecimal amount) {
        System.out.println("[银行卡] 发起支付请求，金额: ¥" + amount);
        // 实际项目：调用银行支付网关

        String transactionId = "BC" + System.currentTimeMillis();
        System.out.println("[银行卡] 支付成功，交易号: " + transactionId);
        return new PaymentResult(true, transactionId,
                "银行卡支付成功，金额: ¥" + amount);
    }

    @Override
    public String getMethodName() {
        return "银行卡支付";
    }
}

// ==================== 具体策略：积分支付 ====================
public class PointsStrategy implements PaymentStrategy {
    private static final BigDecimal POINTS_EXCHANGE_RATE = new BigDecimal("100"); // 100积分=1元

    @Override
    public PaymentResult pay(BigDecimal amount) {
        BigDecimal pointsNeeded = amount.multiply(POINTS_EXCHANGE_RATE);
        System.out.println("[积分] 使用 " + pointsNeeded + " 积分支付，抵 " + amount + " 元");

        String transactionId = "PT" + System.currentTimeMillis();
        return new PaymentResult(true, transactionId,
                "积分支付成功，消耗 " + pointsNeeded + " 积分");
    }

    @Override
    public String getMethodName() {
        return "积分支付";
    }

    @Override
    public boolean supports(String scenario) {
        // 积分支付只支持小额订单
        return "SMALL_ORDER".equals(scenario);
    }
}

// ==================== 上下文：订单支付 ====================
public class OrderPaymentContext {
    private final String orderId;
    private final BigDecimal amount;
    private PaymentStrategy strategy;

    public OrderPaymentContext(String orderId, BigDecimal amount) {
        this.orderId = orderId;
        this.amount = amount;
    }

    public void setPaymentStrategy(PaymentStrategy strategy) {
        this.strategy = strategy;
    }

    public PaymentResult executePayment() {
        if (strategy == null) {
            throw new IllegalStateException("未设置支付策略");
        }
        System.out.println("====================================");
        System.out.println("订单 [" + orderId + "] 使用 " + strategy.getMethodName()
                + " 支付 " + amount + " 元");
        PaymentResult result = strategy.pay(amount);
        System.out.println("====================================");
        return result;
    }

    public String getOrderId() { return orderId; }
    public BigDecimal getAmount() { return amount; }
}

// ==================== 策略工厂 ====================
public class PaymentStrategyFactory {
    private static final Map<String, PaymentStrategy> STRATEGIES = new HashMap<>();

    static {
        register("ALIPAY", new AlipayStrategy());
        register("WECHAT", new WechatPayStrategy());
        register("BANK_CARD", new BankCardStrategy());
        register("POINTS", new PointsStrategy());
    }

    public static void register(String code, PaymentStrategy strategy) {
        STRATEGIES.put(code.toUpperCase(), strategy);
    }

    public static PaymentStrategy getStrategy(String code) {
        PaymentStrategy strategy = STRATEGIES.get(code.toUpperCase());
        if (strategy == null) {
            throw new IllegalArgumentException("不支持的支付方式: " + code);
        }
        return strategy;
    }
}

// ==================== 客户端测试 ====================
public class PaymentSystemTest {
    public static void main(String[] args) {
        OrderPaymentContext order = new OrderPaymentContext(
                "ORD-20240101", new BigDecimal("299.00"));

        // 支付宝支付
        order.setPaymentStrategy(PaymentStrategyFactory.getStrategy("ALIPAY"));
        order.executePayment();

        System.out.println();

        // 微信支付
        order.setPaymentStrategy(PaymentStrategyFactory.getStrategy("WECHAT"));
        order.executePayment();

        System.out.println();

        // 银行卡支付
        order.setPaymentStrategy(PaymentStrategyFactory.getStrategy("BANK_CARD"));
        order.executePayment();
    }
}
```

### 22.3.2 Java 8 Lambda/函数式策略模式

Java 8引入的函数式编程让策略模式的实现更加简洁：

```java
import java.math.BigDecimal;
import java.util.function.Function;
import java.util.function.BiFunction;
import java.util.function.UnaryOperator;

// ==================== 策略示例1：使用Function ====================
public class LambdaStrategyExample {

    // 压缩器：输入原始数据，输出压缩后的数据
    private final Map<String, Function<String, String>> compressors = new HashMap<>();

    public LambdaStrategyExample() {
        // ZIP压缩策略
        compressors.put("ZIP", data -> "ZIP压缩: [" + data + "] -> 压缩后体积减少60%");
        // GZIP压缩策略
        compressors.put("GZIP", data -> "GZIP压缩: [" + data + "] -> 压缩后体积减少55%");
        // RAR压缩策略
        compressors.put("RAR", data -> "RAR压缩: [" + data + "] -> 压缩后体积减少65%");
        // 7Z压缩策略
        compressors.put("7Z", data -> "7Z压缩: [" + data + "] -> 压缩后体积减少70%");
    }

    public String compress(String algorithm, String data) {
        Function<String, String> compressor = compressors.get(algorithm.toUpperCase());
        if (compressor == null) {
            throw new IllegalArgumentException("不支持的压缩算法: " + algorithm);
        }
        return compressor.apply(data);
    }

    // ==================== 策略示例2：折扣计算 ====================
    private final Map<String, UnaryOperator<BigDecimal>> discountStrategies = Map.of(
            "NONE", amount -> amount,
            "PERCENT_10", amount -> amount.multiply(new BigDecimal("0.9")),
            "PERCENT_20", amount -> amount.multiply(new BigDecimal("0.8")),
            "HALF_PRICE", amount -> amount.multiply(new BigDecimal("0.5"))
    );

    public BigDecimal calculatePrice(String discountCode, BigDecimal originalPrice) {
        return discountStrategies.getOrDefault(discountCode,
                amount -> amount).apply(originalPrice);
    }

    // ==================== 策略示例3：物流计费（使用BiFunction） ====================
    private final Map<String, BiFunction<Double, Double, Double>> shippingCalculators =
            Map.of(
                    "WEIGHT", (weight, distance) -> weight * 5.0 + distance * 0.5,
                    "VOLUME", (volume, distance) -> volume * 3.0 + distance * 0.3,
                    "FIXED", (weight, distance) -> 15.0
            );

    public double calcShipping(String method, double weightOrVolume, double distance) {
        return shippingCalculators.getOrDefault(method,
                (w, d) -> 20.0).apply(weightOrVolume, distance);
    }

    // ==================== 测试 ====================
    public static void main(String[] args) {
        LambdaStrategyExample app = new LambdaStrategyExample();

        // 压缩测试
        System.out.println("=== 压缩策略 ===");
        System.out.println(app.compress("ZIP", "hello world"));
        System.out.println(app.compress("7Z", "hello world"));

        // 折扣测试
        System.out.println("\n=== 折扣策略 ===");
        BigDecimal original = new BigDecimal("200");
        System.out.println("原价: " + original);
        System.out.println("9折: " + app.calculatePrice("PERCENT_10", original));
        System.out.println("5折: " + app.calculatePrice("HALF_PRICE", original));

        // 物流测试
        System.out.println("\n=== 物流计费策略 ===");
        System.out.println("按重量计费: " +
                app.calcShipping("WEIGHT", 5.0, 100.0));
        System.out.println("按体积计费: " +
                app.calcShipping("VOLUME", 3.0, 100.0));
        System.out.println("固定费率: " +
                app.calcShipping("FIXED", 0.0, 0.0));
    }
}
```

### 22.3.3 策略模式实现文件导出系统

```java
import java.time.LocalDateTime;
import java.util.List;

// ==================== 数据模型 ====================
public record OrderExportData(String orderId, String customer,
                               BigDecimal amount, LocalDateTime createTime) {}

// ==================== 策略接口 ====================
public interface ExportStrategy {
    byte[] export(List<OrderExportData> orders);
    String getFormatType();
    String getContentType();
}

// ==================== CSV导出策略 ====================
public class CsvExportStrategy implements ExportStrategy {

    @Override
    public byte[] export(List<OrderExportData> orders) {
        StringBuilder sb = new StringBuilder();
        sb.append("订单号,客户,金额,创建时间\n");
        for (OrderExportData order : orders) {
            sb.append(String.format("%s,%s,%.2f,%s\n",
                    order.orderId(), order.customer(),
                    order.amount(), order.createTime()));
        }
        return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Override public String getFormatType() { return "CSV"; }
    @Override public String getContentType() { return "text/csv"; }
}

// ==================== JSON导出策略 ====================
public class JsonExportStrategy implements ExportStrategy {
    // 实际项目使用 Jackson 或 Gson
    @Override
    public byte[] export(List<OrderExportData> orders) {
        StringBuilder sb = new StringBuilder();
        sb.append("[\n");
        for (int i = 0; i < orders.size(); i++) {
            OrderExportData o = orders.get(i);
            sb.append(String.format(
                    "  {\"orderId\":\"%s\",\"customer\":\"%s\",\"amount\":%.2f}",
                    o.orderId(), o.customer(), o.amount()));
            if (i < orders.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("]");
        return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Override public String getFormatType() { return "JSON"; }
    @Override public String getContentType() { return "application/json"; }
}

// ==================== Excel导出策略 ====================
public class ExcelExportStrategy implements ExportStrategy {
    @Override
    public byte[] export(List<OrderExportData> orders) {
        // 实际项目使用 Apache POI
        StringBuilder sb = new StringBuilder();
        sb.append("[模拟Excel文件]\n");
        sb.append("订单号\t客户\t金额\t创建时间\n");
        for (OrderExportData order : orders) {
            sb.append(String.format("%s\t%s\t%.2f\t%s\n",
                    order.orderId(), order.customer(),
                    order.amount(), order.createTime()));
        }
        return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Override public String getFormatType() { return "EXCEL"; }
    @Override public String getContentType() {
        return "application/vnd.ms-excel";
    }
}

// ==================== 导出上下文 ====================
public class ExportContext {
    private ExportStrategy strategy;

    public void setStrategy(ExportStrategy strategy) {
        this.strategy = strategy;
    }

    public ExportResult export(List<OrderExportData> orders) {
        if (strategy == null) {
            throw new IllegalStateException("未设置导出策略");
        }
        byte[] data = strategy.export(orders);
        return new ExportResult(data, strategy.getFormatType(),
                strategy.getContentType());
    }
}

public record ExportResult(byte[] data, String format, String contentType) {}

// ==================== 测试 ====================
public class ExportTest {
    public static void main(String[] args) {
        List<OrderExportData> orders = List.of(
                new OrderExportData("O001", "张三",
                        new BigDecimal("299.00"), LocalDateTime.now()),
                new OrderExportData("O002", "李四",
                        new BigDecimal("159.00"), LocalDateTime.now()),
                new OrderExportData("O003", "王五",
                        new BigDecimal("499.00"), LocalDateTime.now())
        );

        ExportContext context = new ExportContext();

        // CSV导出
        context.setStrategy(new CsvExportStrategy());
        ExportResult csvResult = context.export(orders);
        System.out.println("=== CSV导出 ===");
        System.out.println(new String(csvResult.data()));

        // JSON导出
        context.setStrategy(new JsonExportStrategy());
        ExportResult jsonResult = context.export(orders);
        System.out.println("\n=== JSON导出 ===");
        System.out.println(new String(jsonResult.data()));

        // Excel导出
        context.setStrategy(new ExcelExportStrategy());
        ExportResult excelResult = context.export(orders);
        System.out.println("=== Excel导出 ===");
        System.out.println(new String(excelResult.data()));
    }
}
```

## 22.4 JDK/框架源码解析

### 22.4.1 java.util.Comparator（最经典的策略模式）

`Comparator`是JDK中最标准、最常用的策略模式实现：

```java
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class ComparatorStrategyExample {

    // Comparator 就是策略接口
    // 不同的Comparator实现就是不同的策略

    public static void main(String[] args) {
        List<Person> people = Arrays.asList(
                new Person("张三", 28, 5000),
                new Person("李四", 35, 8000),
                new Person("王五", 22, 4000),
                new Person("赵六", 30, 6000)
        );

        // 策略1：按年龄升序
        Comparator<Person> byAgeAsc = Comparator.comparingInt(Person::age);
        people.sort(byAgeAsc);
        System.out.println("按年龄升序: " + people);

        // 策略2：按薪水降序
        Comparator<Person> bySalaryDesc =
                Comparator.comparingDouble(Person::salary).reversed();
        people.sort(bySalaryDesc);
        System.out.println("按薪水降序: " + people);

        // 策略3：先按年龄、再按姓名
        Comparator<Person> byAgeThenName =
                Comparator.comparingInt(Person::age)
                        .thenComparing(Person::name);
        people.sort(byAgeThenName);
        System.out.println("按年龄+姓名: " + people);

        // 策略4：在调用时直接传入Lambda
        people.sort((a, b) -> a.name().compareTo(b.name()));
        System.out.println("按姓名: " + people);
    }
}

record Person(String name, int age, double salary) {}
```

**Collections.sort()与策略模式的配合**：

```java
// Collections.sort() 是 Context
// 传入的 Comparator 是 Strategy
List<String> names = Arrays.asList("Charlie", "Alice", "Bob");

Collections.sort(names);                        // 使用自然顺序（默认策略）
Collections.sort(names, Comparator.reverseOrder()); // 使用逆序策略
Collections.sort(names, String::compareToIgnoreCase); // 使用忽略大小写策略
```

### 22.4.2 ThreadPoolExecutor.RejectedExecutionHandler

线程池的拒绝策略是策略模式的另一个经典JDK示例：

```java
import java.util.concurrent.*;

public class RejectedExecutionHandlerExample {

    public static void main(String[] args) {
        int corePoolSize = 1;
        int maxPoolSize = 1;
        long keepAliveTime = 0L;
        BlockingQueue<Runnable> workQueue = new ArrayBlockingQueue<>(1);

        // 策略1：AbortPolicy —— 抛出异常（默认策略）
        ThreadPoolExecutor executor1 = new ThreadPoolExecutor(
                corePoolSize, maxPoolSize, keepAliveTime,
                TimeUnit.SECONDS, workQueue,
                new ThreadPoolExecutor.AbortPolicy()
        );

        // 策略2：CallerRunsPolicy —— 由调用者线程执行
        ThreadPoolExecutor executor2 = new ThreadPoolExecutor(
                corePoolSize, maxPoolSize, keepAliveTime,
                TimeUnit.SECONDS, workQueue,
                new ThreadPoolExecutor.CallerRunsPolicy()
        );

        // 策略3：DiscardPolicy —— 直接丢弃
        ThreadPoolExecutor executor3 = new ThreadPoolExecutor(
                corePoolSize, maxPoolSize, keepAliveTime,
                TimeUnit.SECONDS, workQueue,
                new ThreadPoolExecutor.DiscardPolicy()
        );

        // 策略4：DiscardOldestPolicy —— 丢弃最旧的任务
        ThreadPoolExecutor executor4 = new ThreadPoolExecutor(
                corePoolSize, maxPoolSize, keepAliveTime,
                TimeUnit.SECONDS, workQueue,
                new ThreadPoolExecutor.DiscardOldestPolicy()
        );

        // 策略5：自定义策略 —— 记录日志后丢弃
        ThreadPoolExecutor executor5 = new ThreadPoolExecutor(
                corePoolSize, maxPoolSize, keepAliveTime,
                TimeUnit.SECONDS, workQueue,
                (r, e) -> System.out.println("[自定义策略] 任务被拒绝，记录日志")
        );

        System.out.println("RejectedExecutionHandler 就是 Strategy 接口");
        System.out.println("不同的实现类就是不同的 ConcreteStrategy");
    }
}
```

**四种内置拒绝策略对比**：

| 策略类 | 行为 | 适用场景 |
|--------|------|----------|
| `AbortPolicy` | 抛出`RejectedExecutionException` | 需要感知任务被拒绝的场景 |
| `CallerRunsPolicy` | 由调用者线程执行任务 | 不能丢失任务，可承受调用者阻塞 |
| `DiscardPolicy` | 静默丢弃被拒绝的任务 | 任务可丢失的非关键场景 |
| `DiscardOldestPolicy` | 丢弃队列中等待最久的任务 | 优先处理最新任务 |

### 22.4.3 Spring Resource 策略

Spring的`Resource`接口体系是策略模式在资源加载中的体现：

```java
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.UrlResource;
import org.springframework.core.io.Resource;

public class SpringResourceStrategyExample {

    public void loadConfig(String resourcePath) {
        Resource resource;

        if (resourcePath.startsWith("classpath:")) {
            // 策略A：ClassPathResource
            resource = new ClassPathResource(
                    resourcePath.substring("classpath:".length()));
        } else if (resourcePath.startsWith("http")) {
            // 策略B：UrlResource
            resource = new UrlResource(resourcePath);
        } else {
            // 策略C：FileSystemResource（默认策略）
            resource = new FileSystemResource(resourcePath);
        }

        // Resource接口屏蔽了不同资源加载策略的差异
        // 上层代码不需要关心资源来自classpath、文件系统还是网络
        System.out.println("资源存在: " + resource.exists());
    }
}
```

### 22.4.4 javax.servlet.http.HttpServlet

Servlet API中`HttpServlet`的`service`方法按HTTP方法分发，本质上也是一种策略选择：

```java
// HttpServlet.service() 内部：
// if (method.equals("GET"))       doGet(req, resp);
// else if (method.equals("POST"))    doPost(req, resp);
// else if (method.equals("PUT"))     doPut(req, resp);
// else if (method.equals("DELETE"))  doDelete(req, resp);
//
// 不同的HTTP方法对应不同的处理策略
```

### 22.4.5 Spring InstantiationStrategy

Spring Bean的实例化策略：

```java
// Spring中有两种实例化策略：
// 1. SimpleInstantiationStrategy —— 简单的反射实例化
// 2. CglibSubclassingInstantiationStrategy —— 使用CGLIB生成子类
//
// 通过策略模式，Spring可以在不同场景下无缝切换Bean创建方式
// 这是策略模式在IoC容器内部的精彩应用
```

## 22.5 使用场景与案例

### 22.5.1 电商定价引擎

```java
// ==================== 定价策略接口 ====================
public interface PricingStrategy {
    BigDecimal calculatePrice(Product product, int quantity);
}

// ==================== 具体定价策略 ====================
public class NormalPricing implements PricingStrategy {
    @Override
    public BigDecimal calculatePrice(Product product, int quantity) {
        return product.getBasePrice().multiply(BigDecimal.valueOf(quantity));
    }
}

public class VipPricing implements PricingStrategy {
    @Override
    public BigDecimal calculatePrice(Product product, int quantity) {
        return product.getBasePrice()
                .multiply(new BigDecimal("0.85"))
                .multiply(BigDecimal.valueOf(quantity));
    }
}

public class SeasonPromotionPricing implements PricingStrategy {
    @Override
    public BigDecimal calculatePrice(Product product, int quantity) {
        BigDecimal unitPrice = product.getBasePrice();
        if (quantity >= 3) {
            unitPrice = unitPrice.multiply(new BigDecimal("0.7")); // 满3件7折
        }
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}

// ==================== 定价上下文 ====================
public class PricingContext {
    private PricingStrategy strategy;

    public void setStrategy(PricingStrategy strategy) {
        this.strategy = strategy;
    }

    public BigDecimal getPrice(Product product, int quantity) {
        return strategy.calculatePrice(product, quantity);
    }
}
```

### 22.5.2 认证策略系统

```java
// ==================== 认证策略 ====================
public interface AuthenticationStrategy {
    AuthResult authenticate(Map<String, String> credentials);
    String getMethod();
}

public class PasswordAuthStrategy implements AuthenticationStrategy {
    @Override
    public AuthResult authenticate(Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");
        System.out.println("[密码认证] 验证 " + username);
        // 验证用户名密码的正确性
        return "admin".equals(username) && "123456".equals(password)
                ? AuthResult.success(username)
                : AuthResult.failure("密码错误");
    }

    @Override public String getMethod() { return "PASSWORD"; }
}

public class OAuth2Strategy implements AuthenticationStrategy {
    @Override
    public AuthResult authenticate(Map<String, String> credentials) {
        String token = credentials.get("token");
        System.out.println("[OAuth2] 验证令牌");
        // 验证OAuth2令牌的有效性
        return token != null && token.length() > 10
                ? AuthResult.success("OAuth2User")
                : AuthResult.failure("令牌无效");
    }

    @Override public String getMethod() { return "OAUTH2"; }
}

public class SmsCodeAuthStrategy implements AuthenticationStrategy {
    @Override
    public AuthResult authenticate(Map<String, String> credentials) {
        String phone = credentials.get("phone");
        String code = credentials.get("code");
        System.out.println("[短信验证] 验证 " + phone);
        // 验证短信验证码
        return code != null && "123456".equals(code)
                ? AuthResult.success(phone)
                : AuthResult.failure("验证码错误");
    }

    @Override public String getMethod() { return "SMS"; }
}

// ==================== 认证上下文 ====================
public class AuthenticationContext {
    private final Map<String, AuthenticationStrategy> strategies = new HashMap<>();

    public AuthenticationContext() {
        registerStrategy(new PasswordAuthStrategy());
        registerStrategy(new OAuth2Strategy());
        registerStrategy(new SmsCodeAuthStrategy());
    }

    public void registerStrategy(AuthenticationStrategy strategy) {
        strategies.put(strategy.getMethod(), strategy);
    }

    public AuthResult authenticate(String method, Map<String, String> credentials) {
        AuthenticationStrategy strategy = strategies.get(method.toUpperCase());
        if (strategy == null) {
            return AuthResult.failure("不支持的认证方式: " + method);
        }
        return strategy.authenticate(credentials);
    }
}
```

### 22.5.3 缓存淘汰策略

```java
import java.util.LinkedHashMap;
import java.util.Map;

// ==================== 淘汰策略接口 ====================
public interface EvictionStrategy<K, V> {
    /** 当需要淘汰时，选择一个key */
    K selectEvictionKey(Map<K, CacheEntry<V>> cache);
    /** 记录访问（供LFU等策略使用） */
    void recordAccess(K key);
}

// LRU策略（最近最少使用）—— 利用LinkedHashMap的有序特性
public class LRUEvictionStrategy<K, V> implements EvictionStrategy<K, V> {
    @Override
    public K selectEvictionKey(Map<K, CacheEntry<V>> cache) {
        // LinkedHashMap按插入/访问顺序排列，第一个元素是最久未使用的
        return cache.keySet().iterator().next();
    }

    @Override public void recordAccess(K key) { /* LRU不需要额外记录 */ }
}

// LFU策略（最不经常使用）
public class LFUEvictionStrategy<K, V> implements EvictionStrategy<K, V> {
    private final Map<K, Integer> accessCount = new HashMap<>();

    @Override
    public K selectEvictionKey(Map<K, CacheEntry<V>> cache) {
        // 选择访问次数最少的key
        return accessCount.entrySet().stream()
                .min(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElseThrow();
    }

    @Override
    public void recordAccess(K key) {
        accessCount.merge(key, 1, Integer::sum);
    }
}

// FIFO策略（先进先出）
public class FIFOEvictionStrategy<K, V> implements EvictionStrategy<K, V> {
    @Override
    public K selectEvictionKey(Map<K, CacheEntry<V>> cache) {
        // 选择最早放入的key
        return cache.entrySet().stream()
                .min((a, b) -> Long.compare(
                        a.getValue().putTime, b.getValue().putTime))
                .map(Map.Entry::getKey)
                .orElseThrow();
    }

    @Override public void recordAccess(K key) { /* FIFO不关心访问频率 */ }
}

class CacheEntry<V> {
    final V value;
    final long putTime;
    CacheEntry(V value) {
        this.value = value;
        this.putTime = System.currentTimeMillis();
    }
}
```

## 22.6 潜在风险与问题

### 22.6.1 客户端需要了解不同策略

客户端需要知道有哪些策略可用，以及何时使用哪个策略：

```java
// 客户端必须了解：
// 1. 有哪些支付策略
// 2. 每种策略的适用条件
// 3. 如何正确选择策略
//
// 解决方案：结合工厂模式自动选择策略
public class SmartPaymentRouter {
    public PaymentStrategy selectStrategy(Order order, User user) {
        if (order.getAmount().compareTo(new BigDecimal("1000")) > 0) {
            return new BankCardStrategy();  // 大额推荐银行卡
        }
        if (user.isVip()) {
            return new PointsStrategy();  // VIP可用积分支付
        }
        return new AlipayStrategy();  // 默认支付宝
    }
}
```

### 22.6.2 策略接口变更影响所有实现

策略接口发生变化时，所有具体策略类都需要同步修改：

```java
// 如果PaymentStrategy接口增加方法，所有策略实现类都要修改
// 解决方案：使用接口默认方法（default method）
public interface PaymentStrategy {
    PaymentResult pay(BigDecimal amount);

    // 新增方法使用default实现，不影响已有策略
    default void prePayValidation(Order order) {
        // 默认什么都不做
    }

    default void postPayCallback(PaymentResult result) {
        // 默认什么都不做
    }
}
```

### 22.6.3 大量策略类的管理

当策略数量非常多时（如数百种定价规则），策略类的管理和查找变得困难：

```java
// 解决方案：
// 1. 使用策略注册表 + 注解扫描
// 2. 使用枚举简化简单策略
// 3. 使用规则引擎（Drools等）处理复杂业务规则
```

### 22.6.4 有状态策略 vs 无状态策略

策略对象可能需要在多次调用之间保持状态，这会带来线程安全问题：

```java
// 有状态策略 —— 每次调用会修改内部状态，不是线程安全的
public class RateLimitPaymentStrategy implements PaymentStrategy {
    private int callCount = 0;
    private long lastCallTime = 0;

    @Override
    public PaymentResult pay(BigDecimal amount) {
        // 有状态——不适合作为共享单例使用
        callCount++;
        // ...
    }
}

// 解决方案：将状态从策略中移到Context中，保持策略无状态
```

### 22.6.5 策略对象创建的额外开销

每次都创建新的策略对象可能带来不必要的GC压力：

```java
// 不推荐：每次都new
context.setStrategy(new AlipayStrategy());
context.setStrategy(new WechatPayStrategy());

// 推荐：复用无状态策略单例
context.setStrategy(PaymentStrategies.ALIPAY);
context.setStrategy(PaymentStrategies.WECHAT);
```

## 22.7 优化策略

### 22.7.1 函数式编程简化策略模式

Java 8+的Lambda和方法引用可以大幅简化策略模式的实现（已在22.3.2节详细展示）：

```java
// 传统方式：需要定义接口和实现类
// Lambda方式：一行代码定义策略
Map<String, Comparator<Person>> sortStrategies = Map.of(
    "byAge", Comparator.comparingInt(Person::age),
    "byName", Comparator.comparing(Person::name),
    "bySalary", Comparator.comparingDouble(Person::salary).reversed()
);
```

### 22.7.2 策略 + 工厂模式组合

策略工厂集中管理策略实例的创建和选择逻辑：

```java
public class OptimizedPaymentFactory {
    private static final Map<String, PaymentStrategy> cache = new ConcurrentHashMap<>();

    public static PaymentStrategy getStrategy(String method) {
        // 缓存 + 懒加载
        return cache.computeIfAbsent(method, OptimizedPaymentFactory::create);
    }

    private static PaymentStrategy create(String method) {
        return switch (method.toUpperCase()) {
            case "ALIPAY" -> new AlipayStrategy();
            case "WECHAT" -> new WechatPayStrategy();
            case "BANK_CARD" -> new BankCardStrategy();
            default -> throw new IllegalArgumentException("未知支付方式: " + method);
        };
    }
}
```

### 22.7.3 枚举实现简单策略

对于简单的策略变体，使用枚举比定义接口和多个类更轻量：

```java
public enum DiscountStrategyEnum {
    NONE("无折扣") {
        @Override
        public BigDecimal apply(BigDecimal price) { return price; }
    },
    MEMBER("会员9折") {
        @Override
        public BigDecimal apply(BigDecimal price) {
            return price.multiply(new BigDecimal("0.9"));
        }
    },
    GOLD_MEMBER("金牌会员8折") {
        @Override
        public BigDecimal apply(BigDecimal price) {
            return price.multiply(new BigDecimal("0.8"));
        }
    },
    CLEARANCE("清仓5折") {
        @Override
        public BigDecimal apply(BigDecimal price) {
            return price.multiply(new BigDecimal("0.5"));
        }
    };

    private final String description;

    DiscountStrategyEnum(String description) {
        this.description = description;
    }

    public abstract BigDecimal apply(BigDecimal price);

    public String getDescription() { return description; }
}
```

### 22.7.4 责任链 + 策略模式（回退策略）

当一种策略执行失败时，自动回退到备选策略：

```java
public class FallbackPaymentStrategy implements PaymentStrategy {
    private final List<PaymentStrategy> chain;

    public FallbackPaymentStrategy(PaymentStrategy... strategies) {
        this.chain = List.of(strategies);
    }

    @Override
    public PaymentResult pay(BigDecimal amount) {
        for (PaymentStrategy strategy : chain) {
            try {
                PaymentResult result = strategy.pay(amount);
                if (result.isSuccess()) {
                    return result;
                }
            } catch (Exception e) {
                System.out.println("策略 " + strategy.getMethodName()
                        + " 失败，尝试下一个...");
            }
        }
        return new PaymentResult(false, null, "所有支付策略均失败");
    }

    @Override
    public String getMethodName() { return "聚合支付"; }
}

// 使用：优先微信支付，失败后回退到支付宝，再失败用银行卡
FallbackPaymentStrategy fallback = new FallbackPaymentStrategy(
        new WechatPayStrategy(),
        new AlipayStrategy(),
        new BankCardStrategy()
);
```

### 22.7.5 SPI / ServiceLoader实现策略注册

利用Java SPI机制实现策略的热插拔：

```java
// META-INF/services/com.example.PaymentStrategy
// 文件内容：
// com.example.AlipayStrategy
// com.example.WechatPayStrategy
// com.example.BankCardStrategy

import java.util.ServiceLoader;

public class SPIPaymentLoader {
    private static final ServiceLoader<PaymentStrategy> loader =
            ServiceLoader.load(PaymentStrategy.class);

    public static PaymentStrategy findStrategy(String name) {
        for (PaymentStrategy strategy : loader) {
            if (strategy.getMethodName().equals(name)) {
                return strategy;
            }
        }
        throw new IllegalArgumentException("找不到策略: " + name);
    }
}
```

## 本章小结

策略模式是行为型模式中使用频率最高的模式之一，也是最能体现"组合优于继承"原则的模式。本章从七个维度系统讲解了策略模式：

1. **核心问题**：解决同一操作有多种实现方式时的代码膨胀和维护困难问题，将算法选择从硬编码转为运行时多态

2. **实现原理**：定义策略接口，将每种算法封装为独立策略类，Context持有策略引用并委托执行。Client负责选择合适的策略

3. **代码实现**：
   - 支付系统完整实现（经典接口+实现类方式）
   - Lambda函数式策略（Java 8+函数式接口简化实现）
   - 文件导出系统（多格式导出策略）

4. **JDK/框架源码**：
   - `java.util.Comparator`：最标准的策略模式应用
   - `ThreadPoolExecutor.RejectedExecutionHandler`：线程池拒绝策略
   - Spring `Resource`：资源加载策略
   - `HttpServlet.service()`：HTTP方法分发

5. **应用场景**：电商定价引擎、认证策略、缓存淘汰策略、物流计费等

6. **风险问题**：客户端了解策略负担、接口变更影响面广、策略类管理、有状态策略的线程安全、对象创建开销

7. **优化策略**：函数式编程简化、策略工厂模式组合、枚举简化简单策略、责任链回退策略、SPI热插拔

**核心启示**：策略模式和状态模式结构相似但意图不同。策略模式的策略切换由外部（Client）驱动，通常是一次性选择；而状态模式的转换由内部状态驱动，沿着固定的路径演化。理解这一点，就不会在实践中混淆两种模式的使用场景。

**与相关模式的对比总结**：

| 对比维度 | 策略模式 | 状态模式 | 命令模式 | 模板方法 |
|----------|----------|----------|----------|----------|
| 核心关注 | 算法可互换 | 行为随状态变 | 请求封装为对象 | 算法骨架固定 |
| 变化方式 | 客户端选择 | 内部状态驱动 | 调用者构造 | 子类覆写 |
| 实现机制 | 组合 | 组合 | 组合 | 继承 |
| 运行时切换 | 是 | 是 | 是 | 否（编译期确定） |
