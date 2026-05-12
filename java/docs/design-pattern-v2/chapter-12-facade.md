# 第12章 外观模式（Facade）

**外观模式**（Facade Pattern）是一种结构型设计模式，它为复杂的子系统提供统一的、高层次的接口，使子系统更容易使用。外观模式通过封装子系统的复杂性，对外暴露简单的调用入口，从而降低客户端与子系统的耦合度。

## 12.1 解决的问题与应用场景

### 12.1.1 问题分析

在实际开发中，一个业务操作往往涉及多个子系统的协同工作。例如用户注册功能，可能需要依次调用：验证服务、用户仓储、密码加密、邮件服务、日志记录等多个组件。如果不做任何封装，客户端代码会变得非常复杂。

```java
// 没有外观模式：客户端需要了解并直接操作所有子系统
public class ClientWithoutFacade {
    public void register(String username, String password, String email) {
        // 步骤1：验证输入
        UserValidator validator = new UserValidator();
        if (!validator.validate(username, password, email)) {
            throw new RuntimeException("输入验证失败");
        }

        // 步骤2：检查用户名是否已存在
        UserRepository repo = new UserRepository();
        if (repo.existsByUsername(username)) {
            throw new RuntimeException("用户名已存在");
        }

        // 步骤3：加密密码
        PasswordEncoder encoder = new BCryptPasswordEncoder();
        String encodedPassword = encoder.encode(password);

        // 步骤4：保存用户到数据库
        User user = new User(username, encodedPassword, email);
        repo.save(user);

        // 步骤5：发送验证邮件
        EmailService emailService = new EmailService();
        emailService.sendVerificationEmail(email);

        // 步骤6：记录操作日志
        AuditLogger logger = new AuditLogger();
        logger.log("USER_REGISTER", username);

        // 步骤7：初始化用户配置
        UserConfigService configService = new UserConfigService();
        configService.initDefaultConfig(user.getId());
    }
}
```

上述代码存在以下问题：

- **耦合度高**：客户端直接依赖了 7 个子系统类，任何一个子系统变更都可能影响客户端代码。
- **代码冗余**：每个需要用户注册的地方都要重复这些步骤。
- **学习成本高**：新加入的开发者需要理解所有子系统的调用顺序和 API。
- **可测试性差**：测试客户端代码时需要模拟所有子系统。

### 12.1.2 外观模式的解决思路

外观模式引入一个**外观类**（Facade），将复杂的子系统调用封装到外观类的方法中，客户端只需要与外观类交互即可完成业务操作。

```java
// 使用外观模式：客户端只需要一行代码
public class ClientWithFacade {
    public void register(String username, String password, String email) {
        UserRegisterFacade facade = new UserRegisterFacade();
        RegisterResult result = facade.register(username, password, email);
        System.out.println(result.getMessage());
    }
}
```

### 12.1.3 典型应用场景

外观模式适用于以下场景：

| 场景 | 描述 | 示例 |
|------|------|------|
| 复杂系统集成 | 需要将多个系统的功能组合成一个完整业务流程 | 订单处理（库存+支付+物流+通知） |
| 提供统一入口 | 对外暴露简化接口，隔离内部复杂性 | API 网关、微服务聚合层 |
| 分层架构 | 在层次之间建立外观，减少跨层直接依赖 | Controller 调用 Service Facade |
| 第三方库封装 | 简化第三方库的使用方式 | 封装 Apache POI 读写 Excel |
| 遗留系统改造 | 为老旧系统提供现代化的、简洁的调用接口 | 用新 API 包装旧系统的复杂调用 |

## 12.2 实现原理与UML

### 12.2.1 核心思想

外观模式的核心思想是**为复杂子系统提供简单统一的接口**。外观类本身不实现业务逻辑，它只是将子系统的调用序列组织起来，对外暴露高层次的、易于使用的方法。

外观模式的三个关键设计决策：

1. **外观类应该薄**：外观类只做委托和编排，不包含业务逻辑。
2. **子系统仍然可独立访问**：外观类不应限制高级用户直接访问子系统。
3. **可以有多个外观**：为不同类型的客户端提供不同的外观。

### 12.2.2 UML类图

```
┌───────────────────────────────────────────────────────────────┐
│                          Client                               │
│                   (只依赖 Facade 接口)                          │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                         Facade                                │
│                      (外观类 / 门面类)                          │
├───────────────────────────────────────────────────────────────┤
│ - subsystemA: SubsystemA                                      │
│ - subsystemB: SubsystemB                                      │
│ - subsystemC: SubsystemC                                      │
├───────────────────────────────────────────────────────────────┤
│ + simplifiedOperationA(): void                                │
│ + simplifiedOperationB(): Result                              │
│ + orchestrateComplexWorkflow(): void                          │
└───────┬───────────────────┬───────────────────┬───────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  SubsystemA   │   │  SubsystemB   │   │  SubsystemC   │
│  (子系统A)     │   │  (子系统B)     │   │  (子系统C)     │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ + operation1()│   │ + operation2()│   │ + operation3()│
│ + operation4()│   │ + operation5()│   │ + operation6()│
└───────────────┘   └───────────────┘   └───────────────┘
```

### 12.2.3 角色分析

| 角色 | 职责 | 特征 |
|------|------|------|
| **Facade（外观类）** | 封装子系统调用序列，提供高层次统一接口 | 知道哪些子系统类负责处理请求；将客户端请求代理给合适的子系统对象 |
| **Subsystem Classes（子系统类）** | 实现具体的子系统功能 | 处理 Facade 指派的任务；不知道 Facade 的存在 |
| **Client（客户端）** | 通过 Facade 间接调用子系统功能 | 不直接访问子系统类 |

### 12.2.4 时序图

```
Client                  Facade                  SubsystemA          SubsystemB
   │                       │                         │                   │
   │  simpleOperation()    │                         │                   │
   │ ────────────────────► │                         │                   │
   │                       │                         │                   │
   │                       │  预处理（参数校验等）      │                   │
   │                       │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │                   │
   │                       │                         │                   │
   │                       │     doWork()            │                   │
   │                       │ ──────────────────────► │                   │
   │                       │                         │                   │
   │                       │     resultA             │                   │
   │                       │ ◄────────────────────── │                   │
   │                       │                         │                   │
   │                       │                doMoreWork()                │
   │                       │ ──────────────────────────────────────────►│
   │                       │                         │                   │
   │                       │                resultB                     │
   │                       │ ◄──────────────────────────────────────────│
   │                       │                         │                   │
   │                       │  后处理（组装结果）       │                   │
   │                       │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │                   │
   │                       │                         │                   │
   │     finalResult       │                         │                   │
   │ ◄──────────────────── │                         │                   │
   │                       │                         │                   │
```

### 12.2.5 与相关模式的对比

| 对比维度 | 外观模式 | 适配器模式 | 中介者模式 |
|----------|----------|------------|------------|
| 目的 | 简化接口 | 转换接口 | 解耦对象间交互 |
| 关注点 | 封装复杂性 | 接口兼容性 | 集中式协调 |
| 对原系统的改变 | 不改变原有接口 | 不改变原有接口 | 改变对象间的交互方式 |
| 子系统感知 | 子系统不知道外观 | 子系统不知道适配器 | 子系统知道中介者 |

## 12.3 代码实现

### 12.3.1 示例一：家庭影院外观

家庭影院系统包含多个设备：DVD 播放器、投影仪、音响系统、灯光系统、幕布。看电影时需要依次操作这些设备，外观模式可以将这一系列操作封装为一个 `watchMovie()` 方法。

**子系统类定义**

```java
/**
 * DVD播放器子系统
 */
public class DvdPlayer {
    private String movie;

    public void on() {
        System.out.println("[DVD播放器] 已开机");
    }

    public void off() {
        System.out.println("[DVD播放器] 已关机");
    }

    public void play(String movie) {
        this.movie = movie;
        System.out.println("[DVD播放器] 正在播放: " + movie);
    }

    public void stop() {
        System.out.println("[DVD播放器] 已停止播放: " + movie);
    }

    public void eject() {
        System.out.println("[DVD播放器] 已弹出光盘");
    }
}

/**
 * 投影仪子系统
 */
public class Projector {
    public void on() {
        System.out.println("[投影仪] 已开启，正在预热...");
    }

    public void off() {
        System.out.println("[投影仪] 已关闭");
    }

    public void setInput(String input) {
        System.out.println("[投影仪] 输入源切换为: " + input);
    }

    public void setWideScreenMode() {
        System.out.println("[投影仪] 已切换为宽屏模式 (16:9)");
    }
}

/**
 * 音响系统子系统
 */
public class SoundSystem {
    private int volume;

    public void on() {
        System.out.println("[音响] 已开机");
    }

    public void off() {
        System.out.println("[音响] 已关机");
    }

    public void setVolume(int volume) {
        this.volume = volume;
        System.out.println("[音响] 音量设置为: " + volume);
    }

    public void setSurroundSound() {
        System.out.println("[音响] 已切换为环绕声模式");
    }

    public void setStereo() {
        System.out.println("[音响] 已切换为立体声模式");
    }
}

/**
 * 灯光系统子系统
 */
public class TheaterLights {
    private int brightness;

    public void on() {
        brightness = 100;
        System.out.println("[灯光] 已全部开启");
    }

    public void off() {
        brightness = 0;
        System.out.println("[灯光] 已全部关闭");
    }

    public void dim(int level) {
        this.brightness = level;
        System.out.println("[灯光] 亮度调整为: " + level + "%");
    }

    public int getBrightness() {
        return brightness;
    }
}

/**
 * 幕布子系统
 */
public class Screen {
    public void down() {
        System.out.println("[幕布] 已放下");
    }

    public void up() {
        System.out.println("[幕布] 已收起");
    }
}

/**
 * 爆米花机子系统（锦上添花）
 */
public class PopcornPopper {
    public void on() {
        System.out.println("[爆米花机] 已启动");
    }

    public void off() {
        System.out.println("[爆米花机] 已关闭");
    }

    public void pop() {
        System.out.println("[爆米花机] 正在制作爆米花...");
    }
}
```

**外观类 - 家庭影院门面**

```java
/**
 * 家庭影院外观（门面）
 * 将复杂的多设备操作封装为简单的几个方法
 */
public class HomeTheaterFacade {
    private final DvdPlayer dvdPlayer;
    private final Projector projector;
    private final SoundSystem soundSystem;
    private final TheaterLights lights;
    private final Screen screen;
    private final PopcornPopper popper;

    public HomeTheaterFacade(DvdPlayer dvdPlayer,
                             Projector projector,
                             SoundSystem soundSystem,
                             TheaterLights lights,
                             Screen screen,
                             PopcornPopper popper) {
        this.dvdPlayer = dvdPlayer;
        this.projector = projector;
        this.soundSystem = soundSystem;
        this.lights = lights;
        this.screen = screen;
        this.popper = popper;
    }

    /**
     * 一键观影：自动完成所有准备工作并开始播放
     */
    public void watchMovie(String movie) {
        System.out.println("\n======= 准备观影 =======");
        popper.on();
        popper.pop();
        lights.dim(10);
        screen.down();
        projector.on();
        projector.setWideScreenMode();
        projector.setInput("DVD");
        soundSystem.on();
        soundSystem.setSurroundSound();
        soundSystem.setVolume(50);
        dvdPlayer.on();
        dvdPlayer.play(movie);
        System.out.println("======= 准备就绪，开始享受电影 =======\n");
    }

    /**
     * 一键结束观影：关闭所有设备
     */
    public void endMovie() {
        System.out.println("\n======= 结束观影 =======");
        popper.off();
        lights.on();
        screen.up();
        projector.off();
        soundSystem.off();
        dvdPlayer.stop();
        dvdPlayer.eject();
        dvdPlayer.off();
        System.out.println("======= 所有设备已关闭 =======\n");
    }

    /**
     * 听音乐模式
     */
    public void listenToMusic() {
        System.out.println("\n======= 准备听音乐 =======");
        lights.dim(30);
        soundSystem.on();
        soundSystem.setStereo();
        soundSystem.setVolume(30);
        dvdPlayer.on();
        dvdPlayer.play("音乐 CD");
        System.out.println("======= 音乐模式已就绪 =======\n");
    }
}
```

**客户端测试**

```java
/**
 * 家庭影院系统测试客户端
 */
public class HomeTheaterTest {
    public static void main(String[] args) {
        // 创建子系统实例
        DvdPlayer dvdPlayer = new DvdPlayer();
        Projector projector = new Projector();
        SoundSystem soundSystem = new SoundSystem();
        TheaterLights lights = new TheaterLights();
        Screen screen = new Screen();
        PopcornPopper popper = new PopcornPopper();

        // 创建外观
        HomeTheaterFacade homeTheater = new HomeTheaterFacade(
                dvdPlayer, projector, soundSystem, lights, screen, popper);

        // 客户端只需一行代码即可完成观影准备
        homeTheater.watchMovie("星际穿越");

        // 看完电影，一键关闭所有设备
        homeTheater.endMovie();

        // 切换到听音乐模式
        homeTheater.listenToMusic();
    }
}
```

**运行结果**

```
======= 准备观影 =======
[爆米花机] 已启动
[爆米花机] 正在制作爆米花...
[灯光] 亮度调整为: 10%
[幕布] 已放下
[投影仪] 已开启，正在预热...
[投影仪] 已切换为宽屏模式 (16:9)
[投影仪] 输入源切换为: DVD
[音响] 已开机
[音响] 已切换为环绕声模式
[音响] 音量设置为: 50
[DVD播放器] 已开机
[DVD播放器] 正在播放: 星际穿越
======= 准备就绪，开始享受电影 =======

======= 结束观影 =======
[爆米花机] 已关闭
[灯光] 已全部开启
[幕布] 已收起
[投影仪] 已关闭
[音响] 已关机
[DVD播放器] 已停止播放: 星际穿越
[DVD播放器] 已弹出光盘
[DVD播放器] 已关机
======= 所有设备已关闭 =======
```

### 12.3.2 示例二：订单服务门面

电商下单流程涉及库存检查、支付处理、物流发货、通知推送等多个子系统。外观模式将这些子系统封装为 `placeOrder()` 和 `cancelOrder()` 两个统一接口。

```java
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 库存服务子系统
 */
public class InventoryService {
    public boolean checkStock(String productId, int quantity) {
        System.out.println("[库存服务] 检查库存: productId=" + productId + ", quantity=" + quantity);
        // 模拟：库存充足
        return true;
    }

    public void deductStock(String productId, int quantity) {
        System.out.println("[库存服务] 扣减库存: productId=" + productId + ", quantity=" + quantity);
    }

    public void restoreStock(String productId, int quantity) {
        System.out.println("[库存服务] 恢复库存: productId=" + productId + ", quantity=" + quantity);
    }
}

/**
 * 支付服务子系统
 */
public class PaymentService {
    public PaymentResult processPayment(String userId, BigDecimal amount) {
        System.out.println("[支付服务] 处理支付: userId=" + userId + ", amount=" + amount);
        // 模拟：支付成功
        String transactionId = "TXN-" + UUID.randomUUID().toString().substring(0, 8);
        return new PaymentResult(true, transactionId);
    }

    public void refund(String transactionId, BigDecimal amount) {
        System.out.println("[支付服务] 退款: transactionId=" + transactionId + ", amount=" + amount);
    }
}

/**
 * 物流服务子系统
 */
public class ShippingService {
    public ShippingResult createShipment(String orderId, String address) {
        System.out.println("[物流服务] 创建发货单: orderId=" + orderId + ", address=" + address);
        String trackingNumber = "SF" + System.currentTimeMillis() % 10000000000L;
        return new ShippingResult(true, trackingNumber);
    }

    public void cancelShipment(String trackingNumber) {
        System.out.println("[物流服务] 取消发货: trackingNumber=" + trackingNumber);
    }
}

/**
 * 通知服务子系统
 */
public class NotificationService {
    public void sendOrderConfirmation(String userId, String orderId) {
        System.out.println("[通知服务] 发送订单确认通知: userId=" + userId + ", orderId=" + orderId);
    }

    public void sendShipmentNotification(String userId, String trackingNumber) {
        System.out.println("[通知服务] 发送发货通知: userId=" + userId + ", tracking=" + trackingNumber);
    }

    public void sendCancellationNotification(String userId, String orderId) {
        System.out.println("[通知服务] 发送取消通知: userId=" + userId + ", orderId=" + orderId);
    }
}

/**
 * 订单仓储子系统
 */
public class OrderRepository {
    public Order save(Order order) {
        System.out.println("[订单仓储] 保存订单: orderId=" + order.getOrderId());
        return order;
    }

    public Order findById(String orderId) {
        System.out.println("[订单仓储] 查询订单: orderId=" + orderId);
        // 模拟找到订单
        return new Order(orderId, "user-001", "PROD-001", 2, "PAID");
    }

    public void updateStatus(String orderId, String status) {
        System.out.println("[订单仓储] 更新订单状态: orderId=" + orderId + ", status=" + status);
    }
}

// ===== 数据传输对象 =====

/**
 * 支付结果
 */
class PaymentResult {
    private final boolean success;
    private final String transactionId;

    public PaymentResult(boolean success, String transactionId) {
        this.success = success;
        this.transactionId = transactionId;
    }

    public boolean isSuccess() { return success; }
    public String getTransactionId() { return transactionId; }
}

/**
 * 发货结果
 */
class ShippingResult {
    private final boolean success;
    private final String trackingNumber;

    public ShippingResult(boolean success, String trackingNumber) {
        this.success = success;
        this.trackingNumber = trackingNumber;
    }

    public boolean isSuccess() { return success; }
    public String getTrackingNumber() { return trackingNumber; }
}

/**
 * 订单实体
 */
class Order {
    private String orderId;
    private String userId;
    private String productId;
    private int quantity;
    private String status;

    public Order(String orderId, String userId, String productId,
                 int quantity, String status) {
        this.orderId = orderId;
        this.userId = userId;
        this.productId = productId;
        this.quantity = quantity;
        this.status = status;
    }

    public String getOrderId() { return orderId; }
    public String getUserId() { return userId; }
    public String getProductId() { return productId; }
    public int getQuantity() { return quantity; }
    public String getStatus() { return status; }
}
```

**订单门面**

```java
/**
 * 订单门面 - 封装下单和取消订单的完整流程
 */
public class OrderFacade {
    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    private final ShippingService shippingService;
    private final NotificationService notificationService;
    private final OrderRepository orderRepository;

    public OrderFacade() {
        this.inventoryService = new InventoryService();
        this.paymentService = new PaymentService();
        this.shippingService = new ShippingService();
        this.notificationService = new NotificationService();
        this.orderRepository = new OrderRepository();
    }

    /**
     * 一键下单：库存检查 -> 支付 -> 保存订单 -> 扣库存 -> 发货 -> 通知
     */
    public OrderResult placeOrder(String userId, String productId,
                                   int quantity, String address,
                                   BigDecimal unitPrice) {
        // 1. 库存检查
        if (!inventoryService.checkStock(productId, quantity)) {
            return OrderResult.failure("库存不足");
        }

        // 2. 计算总价并处理支付
        BigDecimal totalAmount = unitPrice.multiply(BigDecimal.valueOf(quantity));
        PaymentResult paymentResult = paymentService.processPayment(userId, totalAmount);
        if (!paymentResult.isSuccess()) {
            return OrderResult.failure("支付失败");
        }

        // 3. 创建并保存订单
        String orderId = "ORD-" + UUID.randomUUID().toString().substring(0, 8);
        Order order = new Order(orderId, userId, productId, quantity, "PAID");
        orderRepository.save(order);

        // 4. 扣减库存
        inventoryService.deductStock(productId, quantity);

        // 5. 创建发货单
        ShippingResult shippingResult = shippingService.createShipment(orderId, address);

        // 6. 发送通知
        notificationService.sendOrderConfirmation(userId, orderId);
        if (shippingResult.isSuccess()) {
            notificationService.sendShipmentNotification(
                    userId, shippingResult.getTrackingNumber());
        }

        return OrderResult.success(orderId, paymentResult.getTransactionId(),
                                   shippingResult.getTrackingNumber());
    }

    /**
     * 一键取消订单：取消发货 -> 恢复库存 -> 退款 -> 更新状态 -> 通知
     */
    public CancelResult cancelOrder(String orderId, String userId, String trackingNumber) {
        // 1. 查询订单
        Order order = orderRepository.findById(orderId);
        if (order == null) {
            return CancelResult.failure("订单不存在");
        }

        // 2. 取消发货
        shippingService.cancelShipment(trackingNumber);

        // 3. 恢复库存
        inventoryService.restoreStock(order.getProductId(), order.getQuantity());

        // 4. 退款（简化处理）
        paymentService.refund("TXN-DUMMY", BigDecimal.valueOf(100));

        // 5. 更新订单状态
        orderRepository.updateStatus(orderId, "CANCELLED");

        // 6. 通知用户
        notificationService.sendCancellationNotification(userId, orderId);

        return CancelResult.success(orderId);
    }
}
```

**客户端测试**

```java
import java.math.BigDecimal;

/**
 * 订单门面测试
 */
public class OrderFacadeTest {
    public static void main(String[] args) {
        OrderFacade orderFacade = new OrderFacade();

        // 一键下单
        OrderResult result = orderFacade.placeOrder(
                "user-001",           // 用户ID
                "PROD-001",           // 商品ID
                2,                    // 数量
                "北京市朝阳区XX路100号",  // 地址
                new BigDecimal("299.00")  // 单价
        );

        if (result.isSuccess()) {
            System.out.println("\n下单成功！");
            System.out.println("   订单编号: " + result.getOrderId());
            System.out.println("   交易流水: " + result.getTransactionId());
            System.out.println("   快递单号: " + result.getTrackingNumber());
        } else {
            System.out.println("下单失败: " + result.getErrorMessage());
        }

        // 一键取消订单
        CancelResult cancelResult = orderFacade.cancelOrder(
                result.getOrderId(),
                "user-001",
                result.getTrackingNumber()
        );

        System.out.println("取消结果: " + (cancelResult.isSuccess() ? "成功" : "失败"));
    }
}
```

### 12.3.3 示例三：计算机启动外观

计算机启动涉及 CPU 初始化、内存自检、磁盘加载、操作系统引导等多个硬件子系统的顺序操作。

```java
/**
 * CPU子系统
 */
public class Cpu {
    public void freeze() {
        System.out.println("[CPU] 暂停所有进程");
    }

    public void jump(long position) {
        System.out.println("[CPU] 跳转到引导位置: 0x" + Long.toHexString(position));
    }

    public void execute() {
        System.out.println("[CPU] 开始执行指令");
    }
}

/**
 * 内存子系统
 */
public class Memory {
    public void load(long position, byte[] data) {
        System.out.println("[内存] 加载数据到地址: 0x"
                + Long.toHexString(position) + ", 大小: " + data.length + " bytes");
    }

    public void selfTest() {
        System.out.println("[内存] 执行自检...通过");
    }
}

/**
 * 磁盘子系统
 */
public class HardDrive {
    public byte[] read(long lba, int size) {
        System.out.println("[磁盘] 读取扇区: LBA=" + lba + ", size=" + size);
        // 模拟读取引导扇区数据（MBR）
        return new byte[size];
    }
}

/**
 * 操作系统引导子系统
 */
public class OperatingSystem {
    public void bootstrap() {
        System.out.println("[操作系统] 引导加载器已加载");
    }

    public void loadKernel() {
        System.out.println("[操作系统] 加载内核...");
    }

    public void initServices() {
        System.out.println("[操作系统] 初始化系统服务...");
    }

    public void startUserInterface() {
        System.out.println("[操作系统] 启动用户界面");
    }
}

/**
 * BIOS/UEFI 固件子系统
 */
public class Firmware {
    public void post() {
        System.out.println("[固件] 上电自检 (POST)...通过");
    }

    public void initDevices() {
        System.out.println("[固件] 初始化硬件设备...");
    }

    public void loadBootloader() {
        System.out.println("[固件] 加载引导加载器到内存");
    }
}

/**
 * 计算机启动门面
 */
public class ComputerStartupFacade {
    private static final long BOOT_ADDRESS = 0x7C00L; // BIOS 引导地址
    private static final long KERNEL_ADDRESS = 0x100000L; // 内核加载地址

    private final Firmware firmware;
    private final Cpu cpu;
    private final Memory memory;
    private final HardDrive hardDrive;
    private final OperatingSystem os;

    public ComputerStartupFacade() {
        this.firmware = new Firmware();
        this.cpu = new Cpu();
        this.memory = new Memory();
        this.hardDrive = new HardDrive();
        this.os = new OperatingSystem();
    }

    /**
     * 一键启动计算机
     */
    public void start() {
        System.out.println("========== 计算机启动流程 ==========\n");

        // 阶段1：固件上电自检
        firmware.post();
        firmware.initDevices();

        // 阶段2：CPU准备
        cpu.freeze();

        // 阶段3：内存自检
        memory.selfTest();

        // 阶段4：读取引导扇区
        firmware.loadBootloader();
        byte[] bootSector = hardDrive.read(0, 512);
        memory.load(BOOT_ADDRESS, bootSector);

        // 阶段5：加载操作系统
        os.bootstrap();

        // 阶段6：CPU跳转到引导地址
        cpu.jump(BOOT_ADDRESS);
        cpu.execute();

        // 阶段7：加载内核
        byte[] kernel = hardDrive.read(2048, 8192);
        memory.load(KERNEL_ADDRESS, kernel);
        os.loadKernel();

        // 阶段8：初始化服务并启动UI
        os.initServices();
        os.startUserInterface();

        System.out.println("\n========== 启动完成 ==========");
    }
}

/**
 * 测试客户端
 */
public class ComputerStartupTest {
    public static void main(String[] args) {
        ComputerStartupFacade computer = new ComputerStartupFacade();
        computer.start();
    }
}
```

## 12.4 JDK/框架源码解析

### 12.4.1 SLF4J：日志门面模式的经典实现

SLF4J（Simple Logging Facade for Java）是外观模式在日志领域的典型应用。它为 Log4j、Logback、java.util.logging 等具体日志框架提供了统一的调用接口。

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Slf4jExample {
    // SLF4J 是日志门面，底层实现可以是 Logback、Log4j2 等
    private static final Logger logger = LoggerFactory.getLogger(Slf4jExample.class);

    public void doSomething() {
        logger.info("程序开始执行");
        logger.debug("调试信息: 参数值={}", "test");
        // 客户端代码只依赖 SLF4J，不需要关心底层日志实现
    }
}
```

**SLF4J 的工作原理**：
- `LoggerFactory.getLogger()` 会通过类路径查找具体的日志实现（如 logback-classic.jar）
- 找到后创建适配的日志实例
- 所有 `logger.info()` 调用会被委托给底层的具体日志实现

### 12.4.2 Spring JdbcTemplate：对 JDBC 的门面封装

JDBC 原生 API 非常繁琐：需要管理 Connection、Statement、ResultSet 的生命周期，处理 SQLException。JdbcTemplate 将这套复杂的流程封装为一个简洁的门面。

```java
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

public class JdbcTemplateFacadeExample {

    // JdbcTemplate 封装了：
    // 1. 连接获取与释放
    // 2. PreparedStatement 创建与参数设置
    // 3. ResultSet 遍历与关闭
    // 4. 异常转换（SQLException -> DataAccessException）
    private JdbcTemplate jdbcTemplate;

    public List<User> findAllUsers() {
        return jdbcTemplate.query(
                "SELECT id, username, email FROM users WHERE active = ?",
                new RowMapper<User>() {
                    @Override
                    public User mapRow(ResultSet rs, int rowNum) throws SQLException {
                        User user = new User();
                        user.setId(rs.getLong("id"));
                        user.setUsername(rs.getString("username"));
                        user.setEmail(rs.getString("email"));
                        return user;
                    }
                },
                true  // active = true
        );
    }
}

class User {
    private Long id;
    private String username;
    private String email;
    // setters and getters
    public void setId(Long id) { this.id = id; }
    public void setUsername(String username) { this.username = username; }
    public void setEmail(String email) { this.email = email; }
}
```

### 12.4.3 javax.faces.context.FacesContext：JSF 的外观

JavaServer Faces（JSF）使用 `FacesContext` 作为整个框架的门面入口，封装了对请求、响应、会话、应用配置等子系统的访问。

```java
import javax.faces.context.FacesContext;
import javax.faces.context.ExternalContext;
import javax.servlet.http.HttpServletRequest;

// FacesContext 是 JSF 框架的外观类
// 它封装了对以下子系统的访问：
// - ExternalContext (Servlet 容器)
// - Application (应用配置)
// - ViewRoot (视图组件树)
// - RenderKit (渲染器)
public class FacesContextExample {
    public void processRequest() {
        FacesContext facesContext = FacesContext.getCurrentInstance();

        // 通过外观获取子系统的信息
        ExternalContext externalContext = facesContext.getExternalContext();
        HttpServletRequest request =
                (HttpServletRequest) externalContext.getRequest();

        String param = request.getParameter("userId");
        System.out.println("请求参数 userId = " + param);
    }
}
```

### 12.4.4 java.net.URL：网络协议的统一门面

`java.net.URL` 类为不同网络协议（HTTP、HTTPS、FTP、File）提供了统一的访问接口，底层通过 `URLStreamHandler` 处理协议细节。

```java
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URL;
import java.net.URLConnection;

public class UrlFacadeExample {
    public static void main(String[] args) throws Exception {
        // URL 类是访问网络资源的门面
        // 无论底层是 HTTP、HTTPS、FTP 还是本地文件，调用方式完全一致

        // 1. HTTP 协议
        URL httpUrl = new URL("http://www.example.com/api/data");
        readContent(httpUrl);

        // 2. 本地文件协议
        URL fileUrl = new URL("file:///etc/hosts");
        readContent(fileUrl);

        // 3. HTTPS 协议
        URL httpsUrl = new URL("https://api.github.com");
        readContent(httpsUrl);
    }

    private static void readContent(URL url) throws Exception {
        URLConnection connection = url.openConnection();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println(line);
            }
        }
    }
}
```

### 12.4.5 Spring 的 RestTemplate

RestTemplate 是 Spring 提供的 HTTP 客户端门面，封装了底层 HTTP 连接、序列化/反序列化等复杂性。

```java
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

// RestTemplate = HTTP 调用的外观模式
// 封装了：
// - URL 构建
// - HTTP 连接管理
// - 请求体序列化（对象 -> JSON/XML）
// - 响应体反序列化（JSON/XML -> 对象）
// - 错误处理
public class RestTemplateFacadeExample {
    private final RestTemplate restTemplate = new RestTemplate();

    public UserDTO getUserById(Long id) {
        String url = "https://jsonplaceholder.typicode.com/users/" + id;
        ResponseEntity<UserDTO> response =
                restTemplate.getForEntity(url, UserDTO.class);
        return response.getBody();
    }
}

class UserDTO {
    private Long id;
    private String name;
    private String email;
    // getters and setters
}
```

## 12.5 使用场景与案例

### 12.5.1 API 网关模式（微服务外观）

在微服务架构中，API 网关作为整个系统对外的统一入口，是外观模式在架构层面的应用。客户端只需与网关交互，网关负责将请求路由到合适的后端服务。

```
┌──────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  Mobile  │────►│              │────►│    用户服务 (User Service)  │
└──────────┘     │              │     └──────────────────────────┘
                 │              │
┌──────────┐     │   API 网关    │     ┌──────────────────────────┐
│  Web UI  │────►│  (Facade)    │────►│    订单服务 (Order Service) │
└──────────┘     │              │     └──────────────────────────┘
                 │              │
┌──────────┐     │              │     ┌──────────────────────────┐
│  第三方    │────►│              │────►│    支付服务 (Pay Service)   │
└──────────┘     └──────────────┘     └──────────────────────────┘
```

```java
import java.util.HashMap;
import java.util.Map;

/**
 * API 网关门面 - 聚合多个微服务的调用
 */
public class ApiGatewayFacade {
    private final Map<String, Object> serviceRegistry = new HashMap<>();

    /**
     * 获取商品详情页面数据（需要聚合多个服务）
     */
    public ProductDetailDTO getProductDetail(String productId) {
        // 并行调用多个后端服务，聚合结果
        // 1. 调用商品服务获取基本信息
        // 2. 调用库存服务获取库存状态
        // 3. 调用评价服务获取用户评价
        // 4. 调用推荐服务获取相关推荐

        ProductDetailDTO dto = new ProductDetailDTO();
        dto.setProductId(productId);
        // ... 聚合逻辑
        return dto;
    }

    /**
     * 用户下单（编排多个微服务）
     */
    public OrderResultDTO createOrder(OrderRequestDTO request) {
        // 1. 验证商品可用性 -> 调用商品服务
        // 2. 创建订单 -> 调用订单服务
        // 3. 处理支付 -> 调用支付服务
        // 4. 触发物流 -> 调用物流服务
        return new OrderResultDTO();
    }
}

class ProductDetailDTO {
    private String productId;
    private String name;
    // getters and setters
    public void setProductId(String productId) { this.productId = productId; }
    public void setName(String name) { this.name = name; }
}

class OrderRequestDTO {}
class OrderResultDTO {}
```

### 12.5.2 第三方支付集成外观

集成多种支付渠道（支付宝、微信支付、银联）时，外观模式可以为上层业务提供统一的支付接口。

```java
import java.math.BigDecimal;

/**
 * 统一支付接口协议
 */
interface ThirdPartyPaymentGateway {
    void pay(String orderId, BigDecimal amount);
}

/**
 * 支付宝通道（子系统A）
 */
class AlipayGateway implements ThirdPartyPaymentGateway {
    @Override
    public void pay(String orderId, BigDecimal amount) {
        System.out.println("[支付宝] 发起支付: orderId=" + orderId + ", amount=" + amount);
    }
}

/**
 * 微信支付通道（子系统B）
 */
class WechatPayGateway implements ThirdPartyPaymentGateway {
    @Override
    public void pay(String orderId, BigDecimal amount) {
        System.out.println("[微信支付] 发起支付: orderId=" + orderId + ", amount=" + amount);
    }
}

/**
 * 银联支付通道（子系统C）
 */
class UnionPayGateway implements ThirdPartyPaymentGateway {
    @Override
    public void pay(String orderId, BigDecimal amount) {
        System.out.println("[银联支付] 发起支付: orderId=" + orderId + ", amount=" + amount);
    }
}

/**
 * 支付门面 - 根据支付方式自动路由到对应通道
 */
public class PaymentFacade {
    private final AlipayGateway alipayGateway;
    private final WechatPayGateway wechatPayGateway;
    private final UnionPayGateway unionPayGateway;

    public PaymentFacade() {
        this.alipayGateway = new AlipayGateway();
        this.wechatPayGateway = new WechatPayGateway();
        this.unionPayGateway = new UnionPayGateway();
    }

    /**
     * 统一支付入口
     */
    public PaymentResult pay(String orderId, BigDecimal amount, PaymentMethod method) {
        System.out.println("[支付门面] 选择支付方式: " + method);

        switch (method) {
            case ALIPAY:
                alipayGateway.pay(orderId, amount);
                break;
            case WECHAT:
                wechatPayGateway.pay(orderId, amount);
                break;
            case UNIONPAY:
                unionPayGateway.pay(orderId, amount);
                break;
            default:
                return PaymentResult.failure("不支持的支付方式");
        }

        return PaymentResult.success();
    }
}

enum PaymentMethod {
    ALIPAY, WECHAT, UNIONPAY
}

class PaymentResult {
    private final boolean success;
    private final String message;

    private PaymentResult(boolean success, String message) {
        this.success = success;
        this.message = message;
    }

    public static PaymentResult success() {
        return new PaymentResult(true, "支付成功");
    }

    public static PaymentResult failure(String message) {
        return new PaymentResult(false, message);
    }
}
```

### 12.5.3 报表生成系统

报表生成通常涉及数据采集、数据清洗、数据分析、图表渲染、格式导出等复杂流程，外观模式可以将这些步骤封装为 `generateReport()` 一个方法。

```java
import java.util.List;

/**
 * 报表生成门面
 */
public class ReportGenerationFacade {
    private final DataCollector dataCollector;
    private final DataCleaner dataCleaner;
    private final DataAnalyzer dataAnalyzer;
    private final ChartRenderer chartRenderer;
    private final ReportFormatter reportFormatter;
    private final ReportExporter reportExporter;

    public ReportGenerationFacade() {
        this.dataCollector = new DataCollector();
        this.dataCleaner = new DataCleaner();
        this.dataAnalyzer = new DataAnalyzer();
        this.chartRenderer = new ChartRenderer();
        this.reportFormatter = new ReportFormatter();
        this.reportExporter = new ReportExporter();
    }

    /**
     * 一键生成报表
     * @param reportConfig 报表配置（时间范围、指标等）
     * @param format 输出格式（PDF/EXCEL/HTML）
     * @return 报表文件字节数组
     */
    public byte[] generateReport(ReportConfig reportConfig, ExportFormat format) {
        // 步骤1：从各数据源采集原始数据
        RawData rawData = dataCollector.collect(reportConfig);

        // 步骤2：数据清洗（去重、补全、标准化）
        CleanData cleanData = dataCleaner.clean(rawData);

        // 步骤3：数据分析（聚合、统计、趋势计算）
        AnalysisResult analysisResult = dataAnalyzer.analyze(cleanData);

        // 步骤4：图表渲染（柱状图、折线图、饼图）
        List<Chart> charts = chartRenderer.render(analysisResult);

        // 步骤5：报表格式化（排版、样式）
        FormattedReport report = reportFormatter.format(analysisResult, charts);

        // 步骤6：导出为指定格式
        return reportExporter.export(report, format);
    }
}

// 子系统类（简化定义）
class DataCollector {
    RawData collect(ReportConfig config) {
        System.out.println("[数据采集] 开始采集数据...");
        return new RawData();
    }
}
class DataCleaner {
    CleanData clean(RawData data) {
        System.out.println("[数据清洗] 开始清洗数据...");
        return new CleanData();
    }
}
class DataAnalyzer {
    AnalysisResult analyze(CleanData data) {
        System.out.println("[数据分析] 开始分析数据...");
        return new AnalysisResult();
    }
}
class ChartRenderer {
    List<Chart> render(AnalysisResult result) {
        System.out.println("[图表渲染] 开始渲染图表...");
        return List.of();
    }
}
class ReportFormatter {
    FormattedReport format(AnalysisResult result, List<Chart> charts) {
        System.out.println("[报表格式化] 开始格式化...");
        return new FormattedReport();
    }
}
class ReportExporter {
    byte[] export(FormattedReport report, ExportFormat format) {
        System.out.println("[报表导出] 导出为 " + format + " 格式");
        return new byte[0];
    }
}

// 数据对象
class ReportConfig {}
class RawData {}
class CleanData {}
class AnalysisResult {}
class Chart {}
class FormattedReport {}
enum ExportFormat { PDF, EXCEL, HTML }
```

## 12.6 潜在风险与问题

### 12.6.1 外观类成为"上帝对象"

当开发者为所有子系统功能都在外观类中提供方法时，外观类会迅速膨胀成为庞大的"上帝对象"（God Object），它什么都管，什么都做，难以维护和测试。

```java
// 反面教材：臃肿的上帝外观
public class GodFacade {
    // 这个外观类包含了 50+ 个方法
    // 涵盖用户管理、订单管理、支付、物流、通知、报表...
    // 任何子系统修改都需要修改这个类
    // 违反了单一职责原则

    public void registerUser(...) { /* ... */ }
    public void loginUser(...) { /* ... */ }
    public void updateProfile(...) { /* ... */ }
    public void createOrder(...) { /* ... */ }
    public void cancelOrder(...) { /* ... */ }
    public void processRefund(...) { /* ... */ }
    // ... 40+ more methods
}
```

**解决方案**：按照功能域拆分多个门面。

```java
// 正确的做法：多个专注的门面
public class UserFacade {        // 负责用户相关操作
    public void register(...) { }
    public void login(...) { }
}

public class OrderFacade {       // 负责订单相关操作
    public void placeOrder(...) { }
    public void cancelOrder(...) { }
}

public class PaymentFacade {     // 负责支付相关操作
    public void pay(...) { }
    public void refund(...) { }
}
```

### 12.6.2 隐藏过多功能

外观可能导致客户端无法访问子系统的某些高级功能。对于一些高级用户而言，外观模式可能是一种限制。

**解决方案**：
- 外观类只封装最常见的 80% 用例。
- 提供 `getSubsystem()` 方法允许高级用户直接访问子系统。
- 提供多层次的接口粒度。

```java
public class FlexibleFacade {
    private final ComplexService service;

    // 简单接口 - 满足 80% 需求
    public void simpleOperation() {
        service.prepare();
        service.execute();
        service.cleanup();
    }

    // 提供对子系统的访问 - 满足高级用户需求
    public ComplexService getSubsystem() {
        return service;
    }

    // 细粒度接口 - 满足 15% 定制需求
    public void prepareOnly() { service.prepare(); }
    public void executeOnly() { service.execute(); }
}
```

### 12.6.3 违反开闭原则的风险

如果外观类设计不当，每次子系统新增功能时都可能需要修改外观类，这违反了开闭原则。

**解决方案**：外观类应该稳定不变，它是对子系统功能的"编排"而非"实现"。如果子系统频繁变化，外观类可能需要重新审视其职责边界。

### 12.6.4 与外观模式的常见误解

| 误解 | 实际情况 |
|------|----------|
| 外观模式就是封装 | 外观封装的是调用序列，不是功能实现 |
| 外观必须覆盖所有子系统 | 外观只需要覆盖核心业务流程 |
| 外观类应该是单例 | 外观本身无状态时可以是单例，有状态时不是 |
| 外观类应该放在同一个包里 | 外观类应该放在子系统包的外部（上层） |

## 12.7 优化策略

### 12.7.1 保持外观类的"薄"

外观类应该只做**委托**和**编排**，不包含任何业务逻辑。业务逻辑应该保留在各子系统内部。

```java
// 好的外观（薄）：只做编排
public class ThinFacade {
    private final SubsystemA a;
    private final SubsystemB b;

    public void doWorkflow() {
        ResultA ra = a.step1();       // 委托
        ResultB rb = b.step2(ra);     // 委托
        a.step3(rb);                  // 委托
    }
}

// 坏的外观（厚）：包含业务逻辑
public class ThickFacade {
    public void doWorkflow() {
        // 在外观中实现了复杂的业务规则判断、数据转换等
        // 这些逻辑应该属于子系统，不属于外观
        if (condition1 && !condition2) {
            complexBusinessLogic();
        }
    }
}
```

### 12.7.2 使用依赖注入降低耦合

通过依赖注入让外观类可以灵活组合不同的子系统实现，便于测试。

```java
/**
 * 使用依赖注入的外观
 */
public class InjectableFacade {
    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    private final ShippingService shippingService;

    // 通过构造函数注入依赖
    public InjectableFacade(InventoryService inventoryService,
                            PaymentService paymentService,
                            ShippingService shippingService) {
        this.inventoryService = inventoryService;
        this.paymentService = paymentService;
        this.shippingService = shippingService;
    }

    public OrderResult placeOrder(OrderRequest request) {
        // 编排逻辑不变，但子系统实现可以通过依赖注入替换
        if (!inventoryService.checkStock(request.getProductId(),
                                          request.getQuantity())) {
            return OrderResult.failure("库存不足");
        }
        // ... 其余编排逻辑
        return OrderResult.success("ORD-001", "TXN-001", "SF-001");
    }
}

// 在测试中可以注入 Mock 对象
// InjectableFacade testFacade = new InjectableFacade(
//     mockInventoryService, mockPaymentService, mockShippingService
// );
```

### 12.7.3 按客户端类型提供不同的外观

不同的客户端可能有不同的使用需求，可以提供多个外观来分别服务。

```java
/**
 * 为外部客户提供的简化门面
 */
public class PublicApiFacade {
    public ProductInfoDTO getProduct(String id) { /* ... */ }
    public void submitOrder(SimpleOrderDTO order) { /* ... */ }
}

/**
 * 为内部管理系统提供的完整门面
 */
public class AdminFacade {
    public ProductInfoDTO getProduct(String id) { /* ... */ }
    public void updateProduct(ProductDTO product) { /* ... */ }
    public void deleteProduct(String id) { /* ... */ }
    public List<OrderDTO> getOrderHistory(QueryDTO query) { /* ... */ }
    public void processRefund(String orderId) { /* ... */ }
}
```

### 12.7.4 与适配器模式结合处理遗留系统

当子系统中存在遗留代码或第三方库，接口不符合预期时，可以先用适配器模式转换接口，再通过外观模式进行编排。

```java
/**
 * 对遗留支付服务的适配，然后用门面编排
 */
public class LegacyPaymentAdapter implements ModernPaymentGateway {
    private final LegacyPaymentSystem legacy;

    public LegacyPaymentAdapter(LegacyPaymentSystem legacy) {
        this.legacy = legacy;
    }

    @Override
    public PaymentResult pay(PaymentRequest request) {
        // 将新接口调用适配为旧接口调用
        legacy.oldPayMethod(
                request.getUserId(),
                request.getAmount().doubleValue(),
                request.getCurrency()
        );
        return PaymentResult.success();
    }
}

// 在门面中使用适配后的子系统
public class OrderPaymentFacade {
    private final ModernPaymentGateway paymentGateway;

    public OrderPaymentFacade(ModernPaymentGateway paymentGateway) {
        this.paymentGateway = paymentGateway; // 可以是适配器包装的遗留系统
    }

    // ... 编排逻辑
}
```

### 12.7.5 门面模式的适用性决策表

| 条件 | 是否使用门面 |
|------|-------------|
| 子系统非常复杂，类数量多 | 强烈建议 |
| 客户端需要调用多个子系统才能完成一个操作 | 强烈建议 |
| 子系统之间依赖关系复杂 | 建议使用 |
| 子系统接口已经足够简单 | 不需要 |
| 系统经常变化，门面维护成本高 | 谨慎使用 |
| 存在多个不同类型的客户端 | 提供多个门面 |

## 本章小结

本章详细介绍了外观模式（Facade Pattern）：

1. **核心问题**：复杂子系统的使用成本高，客户端与多个子系统直接耦合。
2. **解决思路**：引入外观类封装子系统的调用序列，对外提供统一的高层次接口。
3. **UML结构**：外观类（Facade）、子系统类（SubsystemClasses）、客户端（Client）。
4. **代码实现**：提供了家庭影院、订单处理、计算机启动三个完整的 Java 示例。
5. **框架应用**：SLF4J（日志门面）、JdbcTemplate（JDBC 门面）、FacesContext（JSF 门面）、java.net.URL（协议门面）、RestTemplate（HTTP 门面）。
6. **使用场景**：API 网关、第三方服务集成、报表生成、分层架构中的层间门面。
7. **主要风险**：上帝对象、过度隐藏功能、违反开闭原则。
8. **优化策略**：保持外观薄、依赖注入、多门面分工、与适配器模式组合。

**外观模式是系统集成的利器**。它不改变子系统，也不限制子系统的功能，而是在子系统之上构建了一层简洁的抽象，让最常见的操作变得简单直观。

---

在下一章中，我们将学习代理模式（Proxy Pattern），通过代理对象来控制对真实对象的访问。
