# 第27章 设计模式应用最佳实践

设计模式的最佳实践不仅是"知道 23 种模式的定义"，更是在合适的场景选择合适的模式，避免过度设计与错误应用。

## 27.1 何时使用设计模式

### 27.1.1 痛苦信号（应该使用模式的时机）

代码中出现以下"痛苦信号"时，考虑用设计模式解决：

**信号 1：不断增长的 if-else 链**

```java
// 痛苦信号：每次新增支付方式，都要修改这个方法
public PaymentResult processPayment(String type, Payment payment) {
    if ("alipay".equals(type)) {
        // 支付宝逻辑
    } else if ("wechat".equals(type)) {
        // 微信逻辑
    } else if ("creditCard".equals(type)) {
        // 信用卡逻辑
    } else if ("unionPay".equals(type)) {
        // 银联逻辑
    } else if ("paypal".equals(type)) {
        // PayPal 逻辑
    }
    // 每加一个支付方式就多一个 else if
    // 这是使用策略模式的信号
}
```

**信号 2：新增功能需要修改已有类**

```java
// 痛苦信号：为支持报表，需要在所有订单类中添加方法
public class Order {
    // ... 订单核心逻辑

    // 新增：生成 HTML 报表
    public String toHtmlReport() { /* HTML 格式 */ }

    // 新增：生成 PDF 报表
    public byte[] toPdfReport() { /* PDF 格式 */ }

    // 新增：生成 Excel 报表
    public Workbook toExcelReport() { /* Excel 格式 */ }

    // 订单类持续膨胀
    // 这是使用访问者模式的信号
}
```

**信号 3：相同类型的 Bug 反复出现**

```java
// 痛苦信号：每次涉及状态切换都出现 bug
public void processOrder(Order order, String action) {
    switch (action) {
        case "pay":
            if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
                throw new IllegalStateException("当前状态不允许支付");
            }
            // 支付逻辑
            order.setStatus(OrderStatus.PAID);
            break;
        case "ship":
            if (order.getStatus() != OrderStatus.PAID) {
                throw new IllegalStateException("当前状态不允许发货");
            }
            // 发货逻辑
            order.setStatus(OrderStatus.SHIPPED);
            break;
        case "confirm":
            if (order.getStatus() != OrderStatus.SHIPPED) {
                throw new IllegalStateException("当前状态不允许确认");
            }
            // 确认逻辑
            order.setStatus(OrderStatus.COMPLETED);
            break;
    }
    // 状态判断散落在各个方法中，容易遗漏或写错
    // 这是使用状态模式的信号
}
```

### 27.1.2 虚假信号（不足以使用模式的理由）

以下"理由"不足以成为使用设计模式的依据：

```java
// 虚假信号 1："以后可能会需要"
// 错误：现在就加接口，即使只有一个实现
public interface UserRepository { /* 只有一个实现 */ }
public class UserRepositoryImpl implements UserRepository { /* ... */ }
// 实际上：当真的需要第二个实现时，用 IDE 提取接口只需几秒钟

// 虚假信号 2："书上说这里应该用 XX 模式"
// 错误：没有根据实际情况判断
// 一个只有 3 个字段的表单验证，不需要"策略模式"

// 虚假信号 3："这样做更灵活"
// 错误：灵活性不是免费的——每个抽象层都有维护成本
// "灵活"意味着代码的"不确定性"增加
```

### 27.1.3 决策框架

```
问题: 需要处理多种支付方式

步骤1: 定义问题
  → "根据不同的支付方式执行不同的支付逻辑"
  → "新增支付方式时不需要修改已有代码"

步骤2: 列出候选模式
  → 策略模式（最常见）
  → 工厂方法模式（如果创建过程复杂）
  → 命令模式（如果需要排队/撤销）

步骤3: 检查"简单代码"能否解决
  → if-else 只有 2 种？→ 保持简单
  → if-else 超过 3 种且不断增长？→ 使用策略模式

步骤4: 实施
  → 提取策略接口
  → 每个支付方式一个实现类
  → 客户端注入策略
```

### 27.1.4 三击法则（Rule of Three）

**核心思想**：不要在第一、第二次遇到相似代码时引入抽象。等到第三次出现时，模式已经清晰可见。

```java
// 第1次：某个地方需要排序
Collections.sort(list, (a, b) -> a.getName().compareTo(b.getName()));

// 第2次：另一个地方也需要排序，但算法不同
Collections.sort(list, (a, b) -> a.getAge() - b.getAge());

// 此时复制粘贴即可。两次相似可能是巧合。

// 第3次：第三种排序需求出现
Collections.sort(list, (a, b) -> a.getSalary().compareTo(b.getSalary()));

// 三次重复 → 确认是模式 → 提取策略接口
public interface SortStrategy<T> {
    int compare(T a, T b);
}
// 然后实现 NameSortStrategy, AgeSortStrategy, SalarySortStrategy
```

## 27.2 设计模式组合应用

实际系统中，设计模式很少单独使用。多种模式的组合才能构建出优雅的系统。

### 27.2.1 Composite + Iterator

**场景**：树形结构遍历，通过统一的迭代器访问所有节点。

```java
public interface TreeNode {
    String getName();
    Iterator<TreeNode> iterator();  // 返回自身迭代器
}

public class FileNode implements TreeNode {
    private final String name;

    public FileNode(String name) { this.name = name; }

    @Override
    public String getName() { return name; }

    @Override
    public Iterator<TreeNode> iterator() {
        return Collections.emptyIterator(); // 文件节点没有子节点
    }
}

public class DirectoryNode implements TreeNode {
    private final String name;
    private final List<TreeNode> children = new ArrayList<>();

    public DirectoryNode(String name) { this.name = name; }

    public void add(TreeNode node) { children.add(node); }

    @Override
    public String getName() { return name; }

    @Override
    public Iterator<TreeNode> iterator() {
        return new CompositeIterator(children.iterator());
    }

    // 深度优先遍历迭代器
    private static class CompositeIterator implements Iterator<TreeNode> {
        private final Iterator<TreeNode> childrenIterator;
        private Iterator<TreeNode> currentChildIterator = null;

        CompositeIterator(Iterator<TreeNode> childrenIterator) {
            this.childrenIterator = childrenIterator;
        }

        @Override
        public boolean hasNext() {
            if (currentChildIterator != null && currentChildIterator.hasNext()) {
                return true;
            }
            return childrenIterator.hasNext();
        }

        @Override
        public TreeNode next() {
            if (currentChildIterator != null && currentChildIterator.hasNext()) {
                return currentChildIterator.next();
            }
            TreeNode child = childrenIterator.next();
            currentChildIterator = child.iterator();
            return child;
        }
    }
}

// 使用：树形结构和迭代器模式组合，透明地遍历整个树
TreeNode root = new DirectoryNode("root");
TreeNode docs = new DirectoryNode("docs");
docs.add(new FileNode("readme.md"));
docs.add(new FileNode("guide.md"));
root.add(docs);

Iterator<TreeNode> it = root.iterator();
while (it.hasNext()) {
    TreeNode node = it.next();
    System.out.println(node.getName());
}
```

### 27.2.2 Factory Method + Template Method

**场景**：模板方法定义算法骨架，工厂方法让子类定制对象创建。

```java
public abstract class DataExporter {
    // 模板方法：定义导出数据的骨架
    public final void export(String data) {
        DataSource source = createDataSource();  // 工厂方法
        DataFormatter formatter = createFormatter(); // 工厂方法

        String rawData = source.read(data);
        String formatted = formatter.format(rawData);
        write(formatted);
    }

    // 工厂方法：子类决定创建什么
    protected abstract DataSource createDataSource();
    protected abstract DataFormatter createFormatter();
    protected abstract void write(String data);
}

public class CsvDatabaseExporter extends DataExporter {
    @Override
    protected DataSource createDataSource() {
        return new DatabaseSource();  // 从数据库读取
    }

    @Override
    protected DataFormatter createFormatter() {
        return new CsvFormatter();    // 格式化为 CSV
    }

    @Override
    protected void write(String data) {
        Files.write(Paths.get("output.csv"), data.getBytes());
    }
}

public class JsonApiExporter extends DataExporter {
    @Override
    protected DataSource createDataSource() {
        return new ApiSource();       // 从 API 读取
    }

    @Override
    protected DataFormatter createFormatter() {
        return new JsonFormatter();   // 格式化为 JSON
    }

    @Override
    protected void write(String data) {
        Files.write(Paths.get("output.json"), data.getBytes());
    }
}
```

### 27.2.3 Builder + Strategy

**场景**：不同策略生成不同的 Builder 配置。

```java
// Builder 构建复杂对象
public class Report {
    private final String title;
    private final List<String> headers;
    private final List<List<String>> rows;
    private final boolean showPageNumbers;
    private final boolean showTimestamp;
    private final String footer;

    private Report(Builder builder) { /* 从 builder 复制 */ }

    public static class Builder {
        private String title;
        private List<String> headers = new ArrayList<>();
        private List<List<String>> rows = new ArrayList<>();
        private boolean showPageNumbers = true;
        private boolean showTimestamp = true;
        private String footer = "";

        public Builder title(String title) { this.title = title; return this; }
        public Builder addHeader(String header) { this.headers.add(header); return this; }
        public Builder addRow(List<String> row) { this.rows.add(row); return this; }
        public Builder showPageNumbers(boolean show) { this.showPageNumbers = show; return this; }
        public Builder showTimestamp(boolean show) { this.showTimestamp = show; return this; }
        public Builder footer(String footer) { this.footer = footer; return this; }
        public Report build() { return new Report(this); }
    }
}

// 策略：生成不同的报表样式
public interface ReportStylingStrategy {
    void apply(Report.Builder builder);
}

public class SummaryReportStrategy implements ReportStylingStrategy {
    @Override
    public void apply(Report.Builder builder) {
        builder.title("汇总报表")
               .addHeader("项目").addHeader("金额").addHeader("占比")
               .showPageNumbers(false)
               .footer("--- 内部资料 ---");
    }
}

public class DetailedReportStrategy implements ReportStylingStrategy {
    @Override
    public void apply(Report.Builder builder) {
        builder.title("详细报表")
               .addHeader("编号").addHeader("名称").addHeader("数量")
               .addHeader("单价").addHeader("小计").addHeader("备注")
               .showPageNumbers(true)
               .showTimestamp(true);
    }
}

// 使用：策略决定 Builder 的配置
public Report createReport(ReportStylingStrategy strategy, List<Data> data) {
    Report.Builder builder = new Report.Builder();
    strategy.apply(builder);  // 策略设置报表结构
    // 填充数据
    for (Data d : data) {
        builder.addRow(Arrays.asList(d.getId(), d.getName(), ...));
    }
    return builder.build();
}
```

### 27.2.4 Decorator + Chain of Responsibility

**场景**：每个处理器既是装饰器（增强功能），也是责任链的一环。

```java
// 处理器接口
public interface HttpHandler {
    void handle(HttpRequest request, HttpResponse response);
}

// 装饰器基类：同时也是责任链节点
public abstract class HttpHandlerDecorator implements HttpHandler {
    protected final HttpHandler next;

    public HttpHandlerDecorator(HttpHandler next) {
        this.next = next;
    }
}

// 具体处理器
public class LoggingHandler extends HttpHandlerDecorator {
    public LoggingHandler(HttpHandler next) { super(next); }

    @Override
    public void handle(HttpRequest request, HttpResponse response) {
        System.out.println("[日志] " + request.getMethod() + " " + request.getUri());
        long start = System.nanoTime();

        next.handle(request, response);

        long elapsed = (System.nanoTime() - start) / 1_000_000;
        System.out.println("[日志] 耗时: " + elapsed + "ms, 状态: " + response.getStatus());
    }
}

public class AuthHandler extends HttpHandlerDecorator {
    public AuthHandler(HttpHandler next) { super(next); }

    @Override
    public void handle(HttpRequest request, HttpResponse response) {
        String token = request.getHeader("Authorization");
        if (token == null || !isValid(token)) {
            response.setStatus(401);
            response.setBody("Unauthorized");
            return; // 不调用 next，终止链
        }
        next.handle(request, response);
    }

    private boolean isValid(String token) { /* 验证 token */ return true; }
}

public class RateLimitHandler extends HttpHandlerDecorator {
    public RateLimitHandler(HttpHandler next) { super(next); }

    @Override
    public void handle(HttpRequest request, HttpResponse response) {
        if (isRateLimited(request.getRemoteAddr())) {
            response.setStatus(429);
            response.setBody("Too Many Requests");
            return;
        }
        next.handle(request, response);
    }
}

// 核心业务处理器（链的末端）
public class BusinessHandler implements HttpHandler {
    @Override
    public void handle(HttpRequest request, HttpResponse response) {
        // 处理核心业务逻辑
        response.setBody("OK");
    }
}

// 构建处理器链：日志 → 认证 → 限流 → 业务
HttpHandler handler = new LoggingHandler(
    new AuthHandler(
        new RateLimitHandler(
            new BusinessHandler()
        )
    )
);

handler.handle(request, response);
```

### 27.2.5 Observer + Mediator

**场景**：中介者模式管理事件分发，观察者注册事件监听。

```java
// 事件总线：中介者模式的变体
public class EventBus {
    private final Map<Class<?>, List<Consumer<?>>> listeners = new ConcurrentHashMap<>();

    public <T> void register(Class<T> eventType, Consumer<T> listener) {
        listeners.computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
                 .add(listener);
    }

    @SuppressWarnings("unchecked")
    public <T> void post(T event) {
        List<Consumer<?>> consumers = listeners.get(event.getClass());
        if (consumers != null) {
            for (Consumer<?> consumer : consumers) {
                ((Consumer<T>) consumer).accept(event);
            }
        }
    }
}

// 事件类型
public class OrderCreatedEvent {
    public final String orderId;
    public final double amount;
    public OrderCreatedEvent(String orderId, double amount) {
        this.orderId = orderId;
        this.amount = amount;
    }
}

public class PaymentCompletedEvent {
    public final String orderId;
    public final String paymentId;
    public PaymentCompletedEvent(String orderId, String paymentId) { /* ... */ }
}

// 使用 EventBus
EventBus eventBus = new EventBus();

// 观察者注册
eventBus.register(OrderCreatedEvent.class, event -> {
    System.out.println("订单创建: " + event.orderId);
    // 发送通知、更新库存等
});

eventBus.register(PaymentCompletedEvent.class, event -> {
    System.out.println("支付完成: " + event.orderId);
    // 通知物流发货
});

// 优点：
// 1. 发布者和订阅者完全解耦
// 2. 通过中介者（EventBus）管理所有事件
// 3. 新增事件类型无需修改现有代码
```

### 27.2.6 State + Flyweight

**场景**：状态对象本身是无状态的（不包含业务上下文），可以共享。

```java
// Flyweight 状态：不包含上下文，只定义行为
public interface OrderState {
    // 每个方法接收上下文作为参数，而非存储在状态对象中
    void pay(OrderContext context);
    void ship(OrderContext context);
    void confirm(OrderContext context);
    void cancel(OrderContext context);
    String getStatusName();
}

// 具体状态（Flyweight，可共享）
public class PendingPaymentState implements OrderState {
    // 单例——状态对象不包含可变状态，可以共享
    public static final PendingPaymentState INSTANCE = new PendingPaymentState();

    private PendingPaymentState() {}

    @Override
    public void pay(OrderContext context) {
        System.out.println("支付成功");
        context.setState(PaidState.INSTANCE);  // 切换到已支付状态
    }

    @Override
    public void ship(OrderContext context) {
        throw new IllegalStateException("未支付不能发货");
    }

    @Override
    public void confirm(OrderContext context) {
        throw new IllegalStateException("未支付不能确认");
    }

    @Override
    public void cancel(OrderContext context) {
        System.out.println("取消订单");
        context.setState(CancelledState.INSTANCE);
    }

    @Override
    public String getStatusName() { return "待支付"; }
}

public class PaidState implements OrderState {
    public static final PaidState INSTANCE = new PaidState();
    private PaidState() {}

    @Override
    public void pay(OrderContext context) {
        throw new IllegalStateException("已支付");
    }

    @Override
    public void ship(OrderContext context) {
        System.out.println("发货");
        context.setState(ShippedState.INSTANCE);
    }

    @Override
    public void confirm(OrderContext context) {
        throw new IllegalStateException("发货后才能确认");
    }

    @Override
    public void cancel(OrderContext context) {
        System.out.println("退款取消");
        context.setState(CancelledState.INSTANCE);
    }

    @Override
    public String getStatusName() { return "已支付"; }
}

// 上下文：持有当前状态
public class OrderContext {
    private OrderState state = PendingPaymentState.INSTANCE; // 初始状态

    public void setState(OrderState state) { this.state = state; }

    public void pay() { state.pay(this); }
    public void ship() { state.ship(this); }
    public void confirm() { state.confirm(this); }
    public void cancel() { state.cancel(this); }

    public String getStatus() { return state.getStatusName(); }
}

// 优势：无论有多少订单，状态对象只有固定的几个实例
```

### 27.2.7 Abstract Factory + Bridge

**场景**：抽象工厂创建不同平台的组件，桥接模式将抽象与实现分离。

```java
// 桥接：图形抽象与绘制实现分离
public interface DrawingApi {
    void drawCircle(int x, int y, int radius);
    void drawRectangle(int x, int y, int width, int height);
}

// 具体实现
public class VectorDrawing implements DrawingApi {
    @Override
    public void drawCircle(int x, int y, int radius) {
        System.out.println("矢量绘制圆形: (" + x + "," + y + ") r=" + radius);
    }

    @Override
    public void drawRectangle(int x, int y, int width, int height) {
        System.out.println("矢量绘制矩形: (" + x + "," + y + ") " + width + "x" + height);
    }
}

public class RasterDrawing implements DrawingApi {
    @Override
    public void drawCircle(int x, int y, int radius) {
        System.out.println("位图绘制圆形: (" + x + "," + y + ") r=" + radius);
    }

    @Override
    public void drawRectangle(int x, int y, int width, int height) {
        System.out.println("位图绘制矩形: (" + x + "," + y + ") " + width + "x" + height);
    }
}

// 抽象工厂：创建不同主题的 UI 组件
public interface UIFactory {
    Button createButton();
    TextField createTextField();
    DrawingApi getDrawingApi();  // 桥接：返回绘制实现
}

public class LightThemeFactory implements UIFactory {
    @Override
    public Button createButton() {
        return new LightButton();
    }

    @Override
    public TextField createTextField() {
        return new LightTextField();
    }

    @Override
    public DrawingApi getDrawingApi() {
        return new VectorDrawing();
    }
}

public class DarkThemeFactory implements UIFactory {
    @Override
    public Button createButton() {
        return new DarkButton();
    }

    @Override
    public TextField createTextField() {
        return new DarkTextField();
    }

    @Override
    public DrawingApi getDrawingApi() {
        return new RasterDrawing();
    }
}
```

## 27.3 重构与设计模式

### 27.3.1 复杂条件逻辑 → 策略/状态模式

**重构前**：多个 if-else 根据类型执行不同逻辑

```java
// 200 行的条件判断
public double calculateShipping(Order order) {
    String method = order.getShippingMethod();
    double weight = order.getTotalWeight();

    if ("standard".equals(method)) {
        if (weight < 1) return 5.0;
        else if (weight < 5) return 8.0;
        else return 12.0;
    } else if ("express".equals(method)) {
        if (weight < 1) return 15.0;
        else if (weight < 5) return 25.0;
        else return 35.0;
    } else if ("overnight".equals(method)) {
        return 50.0 + weight * 2;
    } else if ("international".equals(method)) {
        return weight * 30 + 20;
    }
    throw new IllegalArgumentException("未知配送方式: " + method);
}
```

**重构后**：策略模式替代 if-else

```java
public interface ShippingStrategy {
    double calculate(double weight);
}

public class StandardShipping implements ShippingStrategy {
    @Override
    public double calculate(double weight) {
        if (weight < 1) return 5.0;
        else if (weight < 5) return 8.0;
        else return 12.0;
    }
}

public class ExpressShipping implements ShippingStrategy {
    @Override
    public double calculate(double weight) {
        if (weight < 1) return 15.0;
        else if (weight < 5) return 25.0;
        else return 35.0;
    }
}

public class OvernightShipping implements ShippingStrategy {
    @Override
    public double calculate(double weight) {
        return 50.0 + weight * 2;
    }
}

public class InternationalShipping implements ShippingStrategy {
    @Override
    public double calculate(double weight) {
        return weight * 30 + 20;
    }
}

public class ShippingCalculator {
    private final Map<String, ShippingStrategy> strategies = new HashMap<>();

    public ShippingCalculator() {
        strategies.put("standard", new StandardShipping());
        strategies.put("express", new ExpressShipping());
        strategies.put("overnight", new OvernightShipping());
        strategies.put("international", new InternationalShipping());
    }

    public double calculate(String method, double weight) {
        ShippingStrategy strategy = strategies.get(method);
        if (strategy == null) {
            throw new IllegalArgumentException("未知配送方式: " + method);
        }
        return strategy.calculate(weight);
    }
}
```

### 27.3.2 大构造函数 → Builder 模式

**重构前**：8 个以上参数的构造函数

```java
// 重构前
new Product("MacBook Pro", "笔记本电脑", 12999.00, "电子产品",
    "Apple", "MPHE2CH/A", 2, "Space Gray", 256, 16,
    5, true, true, 2.1, "中国");
```

**重构后**：Builder 模式

```java
Product.builder()
    .name("MacBook Pro")
    .category("电子产品")
    .price(12999.00)
    .brand("Apple")
    .model("MPHE2CH/A")
    .color("Space Gray")
    .storage(256)
    .ram(16)
    .stock(5)
    .active(true)
    .weight(2.1)
    .origin("中国")
    .build();
```

### 27.3.3 直接类耦合 → 观察者/中介者

**重构前**：订单完成后需要通知多个模块

```java
public class OrderService {
    private EmailService emailService;
    private InventoryService inventoryService;
    private LogisticsService logisticsService;
    private NotificationService notificationService;
    private SmsService smsService;

    public void completeOrder(Order order) {
        order.complete();
        emailService.sendOrderConfirmation(order);      // 发邮件
        inventoryService.reduceStock(order);              // 减库存
        logisticsService.createShipment(order);           // 创建物流
        notificationService.pushNotification(order);     // 推送通知
        smsService.sendSms(order.getUserId(), "订单完成"); // 发短信
        // 新增模块时，OrderService 也需要修改
    }
}
```

**重构后**：事件驱动

```java
public class OrderService {
    private EventBus eventBus;

    public void completeOrder(Order order) {
        order.complete();
        eventBus.post(new OrderCompletedEvent(order));
        // OrderService 不再知道谁在监听这个事件
    }
}

// 各模块自行注册监听
eventBus.register(OrderCompletedEvent.class, e -> {
    emailService.sendOrderConfirmation(e.getOrder());
});
eventBus.register(OrderCompletedEvent.class, e -> {
    inventoryService.reduceStock(e.getOrder());
});
eventBus.register(OrderCompletedEvent.class, e -> {
    logisticsService.createShipment(e.getOrder());
});
```

### 27.3.4 继承复用 → 组合复用

**重构前**：使用继承复用代码

```java
public abstract class Duck {
    public void quack() { System.out.println("嘎嘎"); }
    public void swim() { System.out.println("游泳"); }
    public abstract void display();
    public void fly() { System.out.println("飞行"); } // 所有鸭子都会飞？
}

public class MallardDuck extends Duck { /* 绿头鸭 */ }
public class RubberDuck extends Duck { /* 橡皮鸭，但也会"飞" */ }
// RubberDuck 不应该会飞！
```

**重构后**：组合 + 策略

```java
public class Duck {
    private final FlyBehavior flyBehavior;      // 策略对象
    private final QuackBehavior quackBehavior;  // 策略对象

    public Duck(FlyBehavior fly, QuackBehavior quack) {
        this.flyBehavior = fly;
        this.quackBehavior = quack;
    }

    public void performFly() { flyBehavior.fly(); }
    public void performQuack() { quackBehavior.quack(); }
}

// 行为接口
public interface FlyBehavior { void fly(); }
public class FlyWithWings implements FlyBehavior { public void fly() { System.out.println("飞行"); } }
public class FlyNoWay implements FlyBehavior { public void fly() { System.out.println("不会飞"); } }

// 使用
Duck mallard = new Duck(new FlyWithWings(), new Quack());
Duck rubber = new Duck(new FlyNoWay(), new Squeak());
```

## 27.4 设计模式与代码质量

### 27.4.1 可测试性

设计模式对可测试性影响很大：

```java
// 好的：依赖注入 → 可测试
public class OrderService {
    private final PaymentGateway gateway;
    private final InventoryRepo inventory;

    public OrderService(PaymentGateway gateway, InventoryRepo inventory) {
        this.gateway = gateway;
        this.inventory = inventory;
    }

    public OrderResult placeOrder(Order order) {
        PaymentResult payment = gateway.charge(order.getAmount());
        inventory.reserve(order.getItems());
        return new OrderResult(payment.isSuccess());
    }
}

// 测试：可以轻松注入 Mock 对象
PaymentGateway mockGateway = mock(PaymentGateway.class);
InventoryRepo mockInventory = mock(InventoryRepo.class);
when(mockGateway.charge(100.0)).thenReturn(new PaymentResult(true));

OrderService service = new OrderService(mockGateway, mockInventory);
OrderResult result = service.placeOrder(new Order(100.0));

assertTrue(result.isSuccess());

// 不好的：Singleton → 难以测试
public class OrderService {
    public OrderResult placeOrder(Order order) {
        PaymentGateway gateway = PaymentGateway.getInstance(); // 隐式依赖
        InventoryRepo inventory = InventoryRepo.getInstance();
        // 测试时无法替换为 Mock
    }
}
```

### 27.4.2 可读性

设计模式是一套公认的"词汇"：

```java
// 使用模式名称能清楚传达意图
public class OrderService {
    // 看到 "Strategy", 开发者立刻明白策略模式
    private final PriceCalculationStrategy priceStrategy;
    private final DiscountStrategy discountStrategy;
    private final ShippingStrategy shippingStrategy;

    // 看到 "Builder", 开发者知道是构建复杂对象的
    public Order createOrder(CreateOrderRequest request) {
        return Order.builder()
            .userId(request.getUserId())
            .items(request.getItems())
            .build();
    }

    // 看到 "Factory", 开发者知道是创建对象的
    public PaymentService createPaymentService(String type) {
        return PaymentServiceFactory.create(type);
    }
}
```

### 27.4.3 可维护性

模式创建了已知的扩展点：

```java
// 策略模式创建了扩展点：新增支付方式
// 只需新增一个 PaymentStrategy 的实现类即可
// 不需要修改现有任何代码

// 观察者模式创建了扩展点：新增事件监听
// 只需注册一个新的 Listener

// 装饰器模式创建了扩展点：新增功能
// 只需新增一个 Decorator 类包装原有组件

// 工厂方法创建了扩展点：新增产品
// 只需新增一个 Factory 子类
```

### 27.4.4 复杂度指标案例研究

以下是一个电商系统重构前后的实际数据：

```
重构前（不使用模式）:
  订单处理类: 1 个类, 2500 行
  圈复杂度: 85（每个方法平均 8 个分支）
  耦合度: OrderService 直接依赖 15 个其他类
  新增支付方式: 修改 3 个文件

重构后（策略 + 工厂 + 观察者）:
  订单处理: 1 个主类 + 6 个策略 + 1 个工厂 + 3 个监听器 = 11 个类
  圈复杂度: 每个类平均 8（主类 15）
  耦合度: OrderService 依赖接口，不依赖具体类
  新增支付方式: 新增 1 个策略类 + 注册到工厂 = 修改 1 个文件
```

## 27.5 本章小结

设计模式的最佳实践可以总结为三条原则：

**1. 问题驱动，而非模式驱动**：让代码中的"痛苦信号"引导你使用模式，而不是预先决定"这个项目要用 X 模式"。

**2. 组合胜于单用**：实际系统中，模式往往是组合使用的。理解模式间的交互比熟悉单个模式更重要。

**3. 重构是过程**：不要从一开始就追求完美的模式应用。先写简单代码，然后在需求变化时逐步重构为模式。三击法则是最好的指导原则。
