# 第9章 桥接模式（Bridge）

**桥接模式**（Bridge Pattern）是一种结构型设计模式，它将抽象部分与实现部分分离，使它们都可以独立地变化。桥接模式通过组合关系替代继承关系，从而避免了类爆炸的问题。

## 9.1 解决的问题与应用场景

### 9.1.1 问题分析：N x M 类爆炸

考虑一个消息通知系统。系统需要发送不同类型的消息（普通消息、紧急消息、加急消息），且需要通过不同的渠道发送（邮件、短信、微信）。如果使用继承来实现：

```java
// 使用继承导致的类爆炸
class NormalEmailMessage    { /* 普通邮件消息 */ }
class UrgentEmailMessage    { /* 紧急邮件消息 */ }
class NormalSmsMessage      { /* 普通短信消息 */ }
class UrgentSmsMessage      { /* 紧急短信消息 */ }
class NormalWechatMessage   { /* 普通微信消息 */ }
class UrgentWechatMessage   { /* 紧急微信消息 */ }
// ... 如果再增加一种消息类型或渠道，类的数量会成倍增长
```

如果消息类型有 M 种，发送渠道有 N 种，继承方式需要 M x N 个类。当 M=3, N=3 时需要 9 个类；当 M=5, N=5 时需要 25 个类。这就是**类爆炸**（Cartesian Product Problem）。

**桥接模式的思路**：将"消息类型"作为抽象层（Abstraction），"发送渠道"作为实现层（Implementor），通过组合的方式连接两者。这样 M + N 个类就足够了（M=5, N=5 时只需要 10 个类，而非 25 个）。

### 9.1.2 桥接模式的核心思想

桥接模式的核心是**将两个独立的维度分离**，让它们通过组合的方式建立联系，而不是通过高耦合的继承关系。

```java
// 桥接模式：M + N 个类，而非 M x N
// 抽象维度：消息类型（3种）
abstract class Message { /* 持有 MessageSender 引用 */ }
class NormalMessage extends Message { /* ... */ }
class UrgentMessage extends Message { /* ... */ }

// 实现维度：发送渠道（3种）
interface MessageSender { void send(String message); }
class EmailSender implements MessageSender { /* ... */ }
class SmsSender implements MessageSender { /* ... */ }
class WechatSender implements MessageSender { /* ... */ }
// 总共 1(抽象类) + 2(具体抽象) + 1(接口) + 3(具体实现) = 7 个类
```

### 9.1.3 典型应用场景

| 场景 | 抽象维度（Abstraction） | 实现维度（Implementor） |
|------|------------------------|------------------------|
| 消息通知 | 消息类型（普通/紧急/加急） | 发送渠道（邮件/短信/微信） |
| 图形绘制 | 形状（圆形/方形/三角形） | 颜色（红/蓝/绿） |
| 数据库驱动 | 数据库操作（CRUD） | 数据库类型（MySQL/Oracle/PostgreSQL） |
| 支付系统 | 支付类型（扫码/网银/刷脸） | 支付通道（银行A/银行B） |
| 文件存储 | 存储操作（上传/下载/删除） | 存储后端（本地/S3/OSS） |
| 跨平台UI | UI控件（按钮/输入框/对话框） | 平台渲染（Windows/Mac/Linux） |

## 9.2 实现原理与UML

### 9.2.1 角色分析

桥接模式包含以下四个角色：

| 角色 | 名称 | 职责 |
|------|------|------|
| **Abstraction（抽象）** | 定义抽象类的接口 | 维护一个对 Implementor 的引用 |
| **RefinedAbstraction（扩充抽象）** | 扩展 Abstraction | 可以增加新的抽象方法 |
| **Implementor（实现类接口）** | 定义实现类的接口 | 提供基本操作，Abstraction 通过它执行 |
| **ConcreteImplementor（具体实现）** | 实现 Implementor 接口 | 具体实现基本操作 |

### 9.2.2 UML类图

```
                   ┌─────────────────────────────────────┐
                   │          Abstraction                  │
                   │           (抽象类)                     │
                   ├─────────────────────────────────────┤
                   │ # implementor: Implementor           │
                   ├─────────────────────────────────────┤
                   │ + operation(): void                  │
                   └──────────┬──────────────────┬────────┘
                              │                  │
                   继承       │                  │ 持有引用
                   ┌──────────┴──────┐          │
                   │                 │          │
        ┌──────────────────┐  ┌──────────────────┐   │
        │ RefinedAbstraction│  │ RefinedAbstraction│   │
        │       A           │  │       B           │   │
        └──────────────────┘  └──────────────────┘   │
                                                     │
                                                     ▼
                              ┌─────────────────────────────────────┐
                              │       <<interface>>                  │
                              │       Implementor                    │
                              ├─────────────────────────────────────┤
                              │ + operationImpl(): void              │
                              └──────────────────┬──────────────────┘
                                                  │ 实现
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                    ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐
                    │ ConcreteImplementor│  │ ConcreteImplementor│  │   ...    │
                    │        A          │  │        B          │  │          │
                    └──────────────────┘  └──────────────────┘  └──────────┘
```

### 9.2.3 桥接 vs 继承的对比

| 对比维度 | 继承方式 | 桥接模式 |
|----------|---------|---------|
| 类数量 | M x N | M + N |
| 耦合度 | 高（编译期绑定） | 低（运行期绑定） |
| 扩展性 | 差（新增维度需要大量新类） | 好（新增维度只需增加新类） |
| 变化方向 | 单一维度 | 两个独立维度 |
| 代码复用 | 低 | 高（实现可被多个抽象复用） |
| 运行时切换 | 不支持 | 支持动态切换实现 |

## 9.3 代码实现

### 9.3.1 示例一：消息通知系统（Message + Sender）

**完整实现：消息类型（抽象维度）x 发送渠道（实现维度）**

```java
/**
 * 实现层接口：消息发送器
 * 定义所有发送渠道必须实现的基本操作
 */
interface MessageSender {
    /**
     * 发送消息
     *
     * @param message 消息内容
     * @param recipient 接收者
     */
    void send(String message, String recipient);
}

// ===================== 具体实现 =====================

/**
 * 邮件发送器
 */
class EmailSender implements MessageSender {
    @Override
    public void send(String message, String recipient) {
        System.out.println("[邮件] 发送邮件到 " + recipient + "：内容 = " + message);
        // 实际的邮件发送逻辑
    }
}

/**
 * 短信发送器
 */
class SmsSender implements MessageSender {
    @Override
    public void send(String message, String recipient) {
        System.out.println("[短信] 发送短信到 " + recipient + "：内容 = " + message);
        // 实际的短信发送逻辑
    }
}

/**
 * 微信发送器
 */
class WechatSender implements MessageSender {
    @Override
    public void send(String message, String recipient) {
        System.out.println("[微信] 发送微信消息到 " + recipient + "：内容 = " + message);
        // 实际的微信消息发送逻辑
    }
}

/**
 * 钉钉发送器
 */
class DingTalkSender implements MessageSender {
    @Override
    public void send(String message, String recipient) {
        System.out.println("[钉钉] 发送钉钉消息到 " + recipient + "：内容 = " + message);
    }
}

// ===================== 抽象层 =====================

/**
 * 抽象层：消息
 * 持有 MessageSender 的引用，通过它来发送消息
 */
abstract class Message {
    protected MessageSender sender;

    /**
     * 通过构造函数注入发送器（桥接的关键）
     */
    public Message(MessageSender sender) {
        this.sender = sender;
    }

    /**
     * 发送消息（抽象方法，由子类定义消息格式）
     */
    public abstract void send(String content, String recipient);

    /**
     * 运行时切换发送器
     */
    public void setSender(MessageSender sender) {
        this.sender = sender;
    }
}

/**
 * 普通消息
 */
class NormalMessage extends Message {
    public NormalMessage(MessageSender sender) {
        super(sender);
    }

    @Override
    public void send(String content, String recipient) {
        // 普通消息：直接发送，没有特殊格式
        sender.send("[普通]" + content, recipient);
    }
}

/**
 * 紧急消息
 */
class UrgentMessage extends Message {
    public UrgentMessage(MessageSender sender) {
        super(sender);
    }

    @Override
    public void send(String content, String recipient) {
        // 紧急消息：添加紧急标识和催促语
        String urgentContent = "⚠️ 紧急：" + content + "（请立即处理！）";
        sender.send(urgentContent, recipient);

        // 紧急消息可以发送多次以确保送达
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        sender.send(urgentContent, recipient); // 二次发送
    }
}

/**
 * 加急消息
 */
class ExpeditedMessage extends Message {
    public ExpeditedMessage(MessageSender sender) {
        super(sender);
    }

    @Override
    public void send(String content, String recipient) {
        // 加急消息：添加强烈提醒
        String expeditedContent = "🚨 加急：" + content;
        sender.send(expeditedContent, recipient);
    }
}

// ===================== 客户端测试 =====================

/**
 * 桥接模式客户端
 * 可以自由组合消息类型和发送渠道
 */
public class MessageBridgeExample {
    public static void main(String[] args) {
        System.out.println("========== 桥接模式：消息通知系统 ==========\n");

        // 创建不同的发送器（实现层）
        MessageSender emailSender = new EmailSender();
        MessageSender smsSender = new SmsSender();
        MessageSender wechatSender = new WechatSender();
        MessageSender dingtalkSender = new DingTalkSender();

        // === 组合1：普通消息 + 邮件 ===
        System.out.println("--- 组合1：普通消息 + 邮件 ---");
        Message normalEmail = new NormalMessage(emailSender);
        normalEmail.send("您好，您的订单已发货。", "user@example.com");

        // === 组合2：紧急消息 + 短信 ===
        System.out.println("\n--- 组合2：紧急消息 + 短信 ---");
        Message urgentSms = new UrgentMessage(smsSender);
        urgentSms.send("您的账户出现异常登录！", "13800138000");

        // === 组合3：紧急消息 + 微信 + 邮件（多渠道通知） ===
        System.out.println("\n--- 组合3：紧急消息 + 多渠道通知 ---");
        Message urgentWechat = new UrgentMessage(wechatSender);
        urgentWechat.send("系统将在10分钟后维护", "张三");
        // 切换发送渠道
        urgentWechat.setSender(emailSender);
        urgentWechat.send("系统将在10分钟后维护", "admin@company.com");

        // === 组合4：加急消息 + 钉钉（内部系统通知） ===
        System.out.println("\n--- 组合4：加急消息 + 钉钉 ---");
        Message expeditedDingtalk = new ExpeditedMessage(dingtalkSender);
        expeditedDingtalk.send("线上服务出现故障，请立即响应！", "oncall-group");

        // === 运行时可动态切换 ===
        System.out.println("\n--- 运行时动态切换发送渠道 ---");
        Message message = new NormalMessage(smsSender);
        message.send("您的验证码是: 123456", "13800138000");
        message.setSender(emailSender);
        message.send("您的验证码是: 123456", "user@example.com");
        message.setSender(wechatSender);
        message.send("您的验证码是: 123456", "wechat_user");

        System.out.println("\n========== 总结 ==========");
        System.out.println("消息类型（抽象维度）: NormalMessage, UrgentMessage, ExpeditedMessage");
        System.out.println("发送渠道（实现维度）: EmailSender, SmsSender, WechatSender, DingTalkSender");
        System.out.println("组合数量: 3 x 4 = 12 种组合，只需要 1+3+1+4 = 9 个类");
        System.out.println("若用继承: 需要 3 x 4 = 12 个具体类，且无法运行时切换");
    }
}
```

### 9.3.2 示例二：图形与颜色

```java
/**
 * 实现层接口：颜色
 */
interface Color {
    String getColorName();
    String getHexCode();
}

/**
 * 红色实现
 */
class Red implements Color {
    @Override
    public String getColorName() {
        return "红色";
    }

    @Override
    public String getHexCode() {
        return "#FF0000";
    }
}

/**
 * 蓝色实现
 */
class Blue implements Color {
    @Override
    public String getColorName() {
        return "蓝色";
    }

    @Override
    public String getHexCode() {
        return "#0000FF";
    }
}

/**
 * 绿色实现
 */
class Green implements Color {
    @Override
    public String getColorName() {
        return "绿色";
    }

    @Override
    public String getHexCode() {
        return "#00FF00";
    }
}

/**
 * 抽象层：形状
 */
abstract class Shape {
    protected Color color;

    public Shape(Color color) {
        this.color = color;
    }

    /**
     * 绘制形状（桥接到颜色实现）
     */
    public abstract void draw();

    /**
     * 运行时切换颜色
     */
    public void setColor(Color color) {
        this.color = color;
    }
}

/**
 * 圆形
 */
class Circle extends Shape {
    private double radius;

    public Circle(Color color, double radius) {
        super(color);
        this.radius = radius;
    }

    @Override
    public void draw() {
        System.out.println("绘制一个" + color.getColorName()
                + "圆形【半径=" + radius + "，色值=" + color.getHexCode() + "】");
    }
}

/**
 * 方形
 */
class Square extends Shape {
    private double side;

    public Square(Color color, double side) {
        super(color);
        this.side = side;
    }

    @Override
    public void draw() {
        System.out.println("绘制一个" + color.getColorName()
                + "方形【边长=" + side + "，色值=" + color.getHexCode() + "】");
    }
}

/**
 * 三角形
 */
class Triangle extends Shape {
    private double base;
    private double height;

    public Triangle(Color color, double base, double height) {
        super(color);
        this.base = base;
        this.height = height;
    }

    @Override
    public void draw() {
        System.out.println("绘制一个" + color.getColorName()
                + "三角形【底=" + base + "，高=" + height + "，色值=" + color.getHexCode() + "】");
    }
}

/**
 * 客户端：形状与颜色的自由组合
 */
public class ShapeColorBridgeExample {
    public static void main(String[] args) {
        System.out.println("========== 桥接模式：图形 + 颜色 ==========\n");

        // 创建颜色
        Color red = new Red();
        Color blue = new Blue();
        Color green = new Green();

        // 组合不同形状和颜色
        Shape redCircle = new Circle(red, 5.0);
        Shape blueSquare = new Square(blue, 10.0);
        Shape greenTriangle = new Triangle(green, 6.0, 4.0);

        redCircle.draw();
        blueSquare.draw();
        greenTriangle.draw();

        // 运行时动态切换颜色
        System.out.println("\n--- 动态切换颜色 ---");
        redCircle.setColor(green);
        redCircle.draw(); // 圆形从红色变为绿色

        // 统计组合数量
        System.out.println("\n--- 组合统计 ---");
        System.out.println("形状种类: Circle, Square, Triangle = 3");
        System.out.println("颜色种类: Red, Blue, Green = 3");
        System.out.println("桥接模式需要的类: 3 + 3 + 2(抽象类+接口) = 8");
        System.out.println("继承模式需要的类: 3 x 3 = 9（且无法运行时切换颜色）");
    }
}
```

### 9.3.3 示例三：JDBC 数据库驱动抽象

JDBC（Java Database Connectivity）本身就是桥接模式的经典实现。`java.sql.DriverManager` 作为抽象层，不同的数据库驱动（`java.sql.Driver`）作为实现层。

```java
/**
 * 桥接模式模拟 JDBC 架构
 *
 * 这是 JDBC 架构的简化模拟，展示桥接模式的核心思想
 */

/**
 * 实现层接口：数据库驱动（类比 java.sql.Driver）
 */
interface DatabaseDriver {
    void connect(String url, String username, String password);
    void executeQuery(String sql);
    void executeUpdate(String sql);
    void close();
    String getDatabaseType();
}

/**
 * MySQL 驱动实现
 */
class MySqlDriver implements DatabaseDriver {
    @Override
    public void connect(String url, String username, String password) {
        System.out.println("[MySQL驱动] 连接: " + url
                + ", 用户: " + username);
    }

    @Override
    public void executeQuery(String sql) {
        System.out.println("[MySQL驱动] 执行查询: " + sql);
    }

    @Override
    public void executeUpdate(String sql) {
        System.out.println("[MySQL驱动] 执行更新: " + sql);
    }

    @Override
    public void close() {
        System.out.println("[MySQL驱动] 关闭连接");
    }

    @Override
    public String getDatabaseType() {
        return "MySQL";
    }
}

/**
 * Oracle 驱动实现
 */
class OracleDriver implements DatabaseDriver {
    @Override
    public void connect(String url, String username, String password) {
        System.out.println("[Oracle驱动] 连接: " + url
                + ", 用户: " + username);
    }

    @Override
    public void executeQuery(String sql) {
        System.out.println("[Oracle驱动] 执行查询: " + sql);
    }

    @Override
    public void executeUpdate(String sql) {
        System.out.println("[Oracle驱动] 执行更新: " + sql);
    }

    @Override
    public void close() {
        System.out.println("[Oracle驱动] 关闭会话");
    }

    @Override
    public String getDatabaseType() {
        return "Oracle";
    }
}

/**
 * PostgreSQL 驱动实现
 */
class PostgreSqlDriver implements DatabaseDriver {
    @Override
    public void connect(String url, String username, String password) {
        System.out.println("[PostgreSQL驱动] 连接: " + url
                + ", 用户: " + username);
    }

    @Override
    public void executeQuery(String sql) {
        System.out.println("[PostgreSQL驱动] 执行查询: " + sql);
    }

    @Override
    public void executeUpdate(String sql) {
        System.out.println("[PostgreSQL驱动] 执行更新: " + sql);
    }

    @Override
    public void close() {
        System.out.println("[PostgreSQL驱动] 关闭连接");
    }

    @Override
    public String getDatabaseType() {
        return "PostgreSQL";
    }
}

/**
 * 抽象层：连接管理器（类比 java.sql.Connection / DriverManager）
 * 持有 DatabaseDriver 引用，所有数据库操作通过驱动完成
 */
abstract class DatabaseConnection {
    protected DatabaseDriver driver;
    protected boolean connected = false;

    public DatabaseConnection(DatabaseDriver driver) {
        this.driver = driver;
    }

    /**
     * 打开连接
     */
    public void open(String url, String username, String password) {
        driver.connect(url, username, password);
        connected = true;
    }

    /**
     * 查询数据
     */
    public abstract void query(String sql);

    /**
     * 更新数据
     */
    public abstract void update(String sql);

    /**
     * 关闭连接
     */
    public void disconnect() {
        if (connected) {
            driver.close();
            connected = false;
        }
    }

    /**
     * 运行时切换数据库驱动
     */
    public void switchDriver(DatabaseDriver newDriver) {
        if (connected) {
            disconnect();
        }
        this.driver = newDriver;
        System.out.println("数据库驱动已切换为: " + newDriver.getDatabaseType());
    }
}

/**
 * 基础连接（不带连接池）
 */
class SimpleConnection extends DatabaseConnection {
    public SimpleConnection(DatabaseDriver driver) {
        super(driver);
    }

    @Override
    public void query(String sql) {
        if (!connected) {
            System.out.println("[SimpleConnection] 未连接，无法执行查询");
            return;
        }
        System.out.println("[SimpleConnection] 准备查询...");
        driver.executeQuery(sql);
    }

    @Override
    public void update(String sql) {
        if (!connected) {
            System.out.println("[SimpleConnection] 未连接，无法执行更新");
            return;
        }
        System.out.println("[SimpleConnection] 准备更新...");
        driver.executeUpdate(sql);
    }
}

/**
 * 带连接池的连接
 */
class PooledConnection extends DatabaseConnection {
    private final int poolSize;

    public PooledConnection(DatabaseDriver driver, int poolSize) {
        super(driver);
        this.poolSize = poolSize;
        System.out.println("[PooledConnection] 创建连接池，大小=" + poolSize);
    }

    @Override
    public void query(String sql) {
        if (!connected) {
            System.out.println("[PooledConnection] 未连接");
            return;
        }
        System.out.println("[PooledConnection] 从连接池获取连接...");
        driver.executeQuery(sql);
        System.out.println("[PooledConnection] 归还连接到连接池");
    }

    @Override
    public void update(String sql) {
        if (!connected) {
            System.out.println("[PooledConnection] 未连接");
            return;
        }
        System.out.println("[PooledConnection] 从连接池获取连接...");
        driver.executeUpdate(sql);
        System.out.println("[PooledConnection] 归还连接到连接池");
    }
}

/**
 * 客户端：统一的操作方式，底层可以是任意数据库
 */
public class JdbcBridgeExample {
    public static void main(String[] args) {
        System.out.println("========== 桥接模式：JDBC 数据库抽象 ==========\n");

        // 创建不同的数据库驱动
        DatabaseDriver mysql = new MySqlDriver();
        DatabaseDriver oracle = new OracleDriver();
        DatabaseDriver postgres = new PostgreSqlDriver();

        // === 组合1：MySQL + 简单连接 ===
        System.out.println("--- 组合1：MySQL + 简单连接 ---");
        DatabaseConnection conn1 = new SimpleConnection(mysql);
        conn1.open("jdbc:mysql://localhost:3306/shop", "root", "password");
        conn1.query("SELECT * FROM users");
        conn1.update("UPDATE users SET status=1 WHERE id=1");
        conn1.disconnect();

        // === 组合2：Oracle + 连接池 ===
        System.out.println("\n--- 组合2：Oracle + 连接池 ---");
        DatabaseConnection conn2 = new PooledConnection(oracle, 10);
        conn2.open("jdbc:oracle:thin:@localhost:1521:xe", "scott", "tiger");
        conn2.query("SELECT * FROM employees");
        conn2.disconnect();

        // === 运行时切换数据库 ===
        System.out.println("\n--- 运行时切换数据库 ---");
        DatabaseConnection conn3 = new SimpleConnection(mysql);
        conn3.open("jdbc:mysql://localhost:3306/shop", "root", "password");
        conn3.query("SELECT * FROM products");

        // 运行时切换到 PostgreSQL
        conn3.switchDriver(postgres);
        conn3.open("jdbc:postgresql://localhost:5432/shop", "admin", "admin");
        conn3.query("SELECT * FROM products");
        conn3.disconnect();
    }
}
```

### 9.3.4 不使用桥接模式 vs 使用桥接模式对比

```java
/**
 * 不使用桥接模式：类爆炸演示
 *
 * 如果有 3 种消息类型 + 3 种发送渠道，需要 9 个具体类
 * 如果添加 1 种新渠道，需要额外增加 3 个类
 * 如果添加 1 种新消息类型，需要额外增加 3 个类
 */
class InheritanceApproach {
    // 不展示完整实现，只展示类定义和新增成本

    // 最初：普通消息 + 3种渠道 => 3个类
    class NormalEmailMessage {}
    class NormalSmsMessage {}
    class NormalWechatMessage {}

    // 新增紧急消息：需要增加 3 个类
    class UrgentEmailMessage {}
    class UrgentSmsMessage {}
    class UrgentWechatMessage {}

    // 新增加急消息：又需要增加 3 个类
    class ExpeditedEmailMessage {}
    class ExpeditedSmsMessage {}
    class ExpeditedWechatMessage {}

    // 如果新增「钉钉」渠道：需要增加 3 个类
    class NormalDingTalkMessage {}
    class UrgentDingTalkMessage {}
    class ExpeditedDingTalkMessage {}

    // 总结：M x N 模式，类数量 = (消息类型数) x (渠道数)
    // 3 x 4 = 12 个具体类
}

/**
 * 使用桥接模式：避免类爆炸
 *
 * 如果有 3 种消息类型 + 3 种发送渠道，只需要 3+3 = 6 个具体类
 * 如果添加 1 种新渠道，只需增加 1 个类
 * 如果添加 1 种新消息类型，只需增加 1 个类
 */
class BridgeApproach {
    // 抽象维度：消息类型 — 只增加 1 个类
    abstract class Message { protected MessageSender sender; }
    class NormalMessage extends Message {}
    class UrgentMessage extends Message {}
    class ExpeditedMessage extends Message {}

    // 实现维度：发送渠道 — 每次只增加 1 个类
    interface MessageSender { void send(String msg, String recipient); }
    class EmailSender implements MessageSender {}
    class SmsSender implements MessageSender {}
    class WechatSender implements MessageSender {}
    class DingTalkSender implements MessageSender {}

    // 总结：M + N 模式，类数量 = (消息类型数) + (渠道数)
    // 3 + 4 = 7 个类（含 1 个抽象类和 1 个接口）
    // 比继承方式少了 5 个类！
}
```

## 9.4 JDK/框架源码解析

### 9.4.1 JDBC 驱动架构

JDBC（Java Database Connectivity）是桥接模式最经典的应用。`java.sql.DriverManager` 是 Abstraction，具体的数据库驱动（如 `com.mysql.cj.jdbc.Driver`）是 Implementor。

```
┌───────────────────────────────────────────────┐
│           Client Application                   │
│  (使用 JDBC 接口编程，不依赖具体数据库)           │
└───────────────────┬───────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────┐
│          java.sql.DriverManager                │
│                (Abstraction)                    │
├───────────────────────────────────────────────┤
│ DriverManager.getConnection(url, user, pass)   │
└───────┬───────────────────────────┬───────────┘
        │                           │
        ▼                           ▼
┌──────────────┐          ┌──────────────────┐
│ MySQL Driver  │          │ PostgreSQL Driver │
│ (ConcreteImpl)│          │  (ConcreteImpl)   │
├──────────────┤          ├──────────────────┤
│ connect()     │          │ connect()         │
│ executeQuery()│          │ executeQuery()    │
└──────────────┘          └──────────────────┘
```

```java
import java.sql.*;

public class JdbcBridgeSourceExample {
    public static void main(String[] args) throws Exception {
        // 客户端完全通过 JDBC 标准接口编程
        // 不依赖任何特定数据库的实现类

        // 注册 MySQL 驱动
        Class.forName("com.mysql.cj.jdbc.Driver");

        // 这一行代码就是桥接模式的关键：
        // DriverManager 是 Abstraction
        // 底层实际使用的是 MySQL Driver（Implementor）
        String url = "jdbc:mysql://localhost:3306/mydb";
        String user = "root";
        String password = "password";

        // 获取连接（桥接到具体驱动）
        // 如果换成 Oracle，只需修改 url、user、password
        // 不需要改变任何客户端代码！
        Connection conn = DriverManager.getConnection(url, user, password);

        // 以下代码在 MySQL、Oracle、PostgreSQL 上完全一致
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery("SELECT * FROM users");

        while (rs.next()) {
            System.out.println(rs.getString("username"));
        }

        rs.close();
        stmt.close();
        conn.close();
    }
}
```

### 9.4.2 SLF4J（日志门面）

SLF4J 是桥接模式在日志领域的完美应用。SLF4J 提供统一的日志抽象（Abstraction），Logback、Log4j2、java.util.logging 等作为具体实现（Implementor）。

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Slf4jBridgeExample {
    // SLF4J Logger 是抽象层（Abstraction）
    // 底层实现可以是 Logback、Log4j2、JUL 等
    private static final Logger logger = LoggerFactory.getLogger(Slf4jBridgeExample.class);

    public void businessMethod() {
        // 应用代码只依赖 SLF4J 抽象接口
        // 不依赖任何具体日志框架
        logger.info("用户 {} 登录成功", "张三");
        logger.error("数据库连接失败", new RuntimeException("timeout"));

        // 切换日志实现只需要更换 classpath 中的 jar 包
        // 不需要修改任何代码！
    }
}
```

**SLF4J 桥接结构**：

```
┌──────────────────────────────────────────────────┐
│        Application Code（应用代码）                 │
│   只依赖 org.slf4j.Logger / LoggerFactory         │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│              SLF4J API（抽象层）                    │
│      org.slf4j.Logger + LoggerFactory             │
└───────┬───────────────────────────┬──────────────┘
        │                           │
        ▼                           ▼
┌──────────────┐          ┌──────────────────┐
│   Logback     │          │    Log4j2        │
│ (具体实现)     │          │  (具体实现)       │
├──────────────┤          ├──────────────────┤
│ ch.qos.logback│          │ org.apache.logging│
│ .classic.Logger│          │ .log4j.Logger    │
└──────────────┘          └──────────────────┘
```

### 9.4.3 Spring AbstractRoutingDataSource

Spring 的 `AbstractRoutingDataSource` 允许在运行时根据上下文（如当前数据库事务的类型）切换到不同的 `DataSource` 实现。这是桥接模式的动态变体。

```java
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import javax.sql.DataSource;

/**
 * 动态路由数据源 — 桥接模式的应用
 * Abstraction: AbstractRoutingDataSource
 * Implementor: DataSource（多个具体实现）
 */
public class DynamicDataSource extends AbstractRoutingDataSource {
    // 通过 ThreadLocal 保存当前数据源标识
    private static final ThreadLocal<String> CONTEXT_HOLDER =
            new ThreadLocal<>();

    public static void setDatabase(String dbType) {
        CONTEXT_HOLDER.set(dbType);
    }

    public static void clear() {
        CONTEXT_HOLDER.remove();
    }

    @Override
    protected Object determineCurrentLookupKey() {
        // 运行时决定使用哪个 DataSource
        return CONTEXT_HOLDER.get();
    }

    /**
     * 配置示例：
     *
     * <pre>
     * DynamicDataSource dataSource = new DynamicDataSource();
     *
     * Map<Object, Object> targetDataSources = new HashMap<>();
     * targetDataSources.put("master", masterDataSource);  // 主库
     * targetDataSources.put("slave1", slave1DataSource);  // 从库1
     * targetDataSources.put("slave2", slave2DataSource);  // 从库2
     *
     * dataSource.setTargetDataSources(targetDataSources);
     * dataSource.setDefaultTargetDataSource(masterDataSource);
     * </pre>
     */
}

// 使用示例
class DynamicDataSourceExample {
    public static void main(String[] args) {
        // 写操作使用主库
        DynamicDataSource.setDatabase("master");
        // dataSource.getConnection() -> 获取主库连接

        // 读操作使用从库
        DynamicDataSource.setDatabase("slave1");
        // dataSource.getConnection() -> 获取从库1连接

        DynamicDataSource.clear();
    }
}
```

### 9.4.4 AWT 组件渲染

Java AWT 中的 `java.awt.Container`、`java.awt.Component` 和 `java.awt.peer.ComponentPeer` 形成了桥接模式结构。

```
┌──────────────────────────────────────┐
│       java.awt.Component             │
│   (Abstraction — UI 组件)            │
├──────────────────────────────────────┤
│   - peer: ComponentPeer              │
│   + paint(Graphics): void            │
└──────────┬──────────────────┬────────┘
           │                  │ 持有引用
           ▼                  ▼
┌──────────────────────┐  ┌──────────────────────────┐
│  java.awt.Button     │  │  java.awt.peer.ComponentPeer │
│  (RefinedAbstraction)│  │  (Implementor — 平台实现)   │
└──────────────────────┘  └──────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ WindowsPeer   │  │  MacPeer     │  │  LinuxPeer   │
          │ (Win实现)      │  │ (Mac实现)    │  │ (Linux实现)   │
          └──────────────┘  └──────────────┘  └──────────────┘
```

## 9.5 使用场景与案例

### 9.5.1 跨平台 UI 渲染

在一个需要同时支持 Windows、macOS 和 Linux 的桌面应用中，UI 控件（按钮、输入框、对话框）是抽象维度，平台渲染是实现维度。

```java
/**
 * 实现层：操作系统渲染引擎
 */
interface Renderer {
    void renderButton(String text);
    void renderTextField(String placeholder);
    void renderDialog(String title, String content);
    String getPlatformName();
}

class WindowsRenderer implements Renderer {
    @Override
    public void renderButton(String text) {
        System.out.println("[Windows] 渲染按钮: " + text + "（Win32 API）");
    }
    @Override
    public void renderTextField(String placeholder) {
        System.out.println("[Windows] 渲染输入框: " + placeholder);
    }
    @Override
    public void renderDialog(String title, String content) {
        System.out.println("[Windows] 渲染对话框: " + title + " - " + content);
    }
    @Override
    public String getPlatformName() { return "Windows 11"; }
}

class MacRenderer implements Renderer {
    @Override
    public void renderButton(String text) {
        System.out.println("[macOS] 渲染按钮: " + text + "（Cocoa API）");
    }
    @Override
    public void renderTextField(String placeholder) {
        System.out.println("[macOS] 渲染输入框: " + placeholder);
    }
    @Override
    public void renderDialog(String title, String content) {
        System.out.println("[macOS] 渲染对话框: " + title + " - " + content);
    }
    @Override
    public String getPlatformName() { return "macOS Sonoma"; }
}

class LinuxRenderer implements Renderer {
    @Override
    public void renderButton(String text) {
        System.out.println("[Linux] 渲染按钮: " + text + "（GTK3 API）");
    }
    @Override
    public void renderTextField(String placeholder) {
        System.out.println("[Linux] 渲染输入框: " + placeholder);
    }
    @Override
    public void renderDialog(String title, String content) {
        System.out.println("[Linux] 渲染对话框: " + title + " - " + content);
    }
    @Override
    public String getPlatformName() { return "Ubuntu 22.04"; }
}

/**
 * 抽象层：UI 组件
 */
abstract class UIComponent {
    protected Renderer renderer;

    public UIComponent(Renderer renderer) {
        this.renderer = renderer;
    }

    public abstract void display();
}

class Button extends UIComponent {
    private final String text;

    public Button(Renderer renderer, String text) {
        super(renderer);
        this.text = text;
    }

    @Override
    public void display() {
        renderer.renderButton(text);
    }
}

class TextField extends UIComponent {
    private final String placeholder;

    public TextField(Renderer renderer, String placeholder) {
        super(renderer);
        this.placeholder = placeholder;
    }

    @Override
    public void display() {
        renderer.renderTextField(placeholder);
    }
}

class Dialog extends UIComponent {
    private final String title;
    private final String content;

    public Dialog(Renderer renderer, String title, String content) {
        super(renderer);
        this.title = title;
        this.content = content;
    }

    @Override
    public void display() {
        renderer.renderDialog(title, content);
    }
}

public class CrossPlatformUiExample {
    public static void main(String[] args) {
        Renderer windows = new WindowsRenderer();
        Renderer mac = new MacRenderer();
        Renderer linux = new LinuxRenderer();

        System.out.println("========== Windows 平台 ==========");
        UIComponent winButton = new Button(windows, "确定");
        UIComponent winField = new TextField(windows, "请输入用户名");
        UIComponent winDialog = new Dialog(windows, "提示", "操作成功");
        winButton.display();
        winField.display();
        winDialog.display();

        System.out.println("\n========== macOS 平台 ==========");
        UIComponent macButton = new Button(mac, "Submit");
        macButton.display();

        System.out.println("\n========== Linux 平台 ==========");
        UIComponent linuxDialog = new Dialog(linux, "Error", "File not found");
        linuxDialog.display();
    }
}
```

### 9.5.2 支付网关

支付网关中，抽象维度是支付类型（扫码支付、网银支付、刷脸支付），实现维度是银行通道（工行、建行、招行）。

```java
/**
 * 实现层接口：银行通道
 */
interface BankChannel {
    boolean processPayment(String accountNo, double amount);
    String getChannelName();
}

class ICBCChannel implements BankChannel {
    @Override
    public boolean processPayment(String accountNo, double amount) {
        System.out.println("【工商银行】处理支付: 账户=" + accountNo + ", 金额=" + amount);
        return true;
    }
    @Override
    public String getChannelName() { return "工商银行"; }
}

class CCBChannel implements BankChannel {
    @Override
    public boolean processPayment(String accountNo, double amount) {
        System.out.println("【建设银行】处理支付: 账户=" + accountNo + ", 金额=" + amount);
        return true;
    }
    @Override
    public String getChannelName() { return "建设银行"; }
}

class CMBChannel implements BankChannel {
    @Override
    public boolean processPayment(String accountNo, double amount) {
        System.out.println("【招商银行】处理支付: 账户=" + accountNo + ", 金额=" + amount);
        return true;
    }
    @Override
    public String getChannelName() { return "招商银行"; }
}

/**
 * 抽象层：支付类型
 */
abstract class Payment {
    protected BankChannel channel;

    public Payment(BankChannel channel) {
        this.channel = channel;
    }

    public abstract void pay(String accountNo, double amount);
}

class QrCodePayment extends Payment {
    public QrCodePayment(BankChannel channel) { super(channel); }

    @Override
    public void pay(String accountNo, double amount) {
        System.out.print("[扫码支付] 生成二维码...");
        channel.processPayment(accountNo, amount);
    }
}

class OnlineBankingPayment extends Payment {
    public OnlineBankingPayment(BankChannel channel) { super(channel); }

    @Override
    public void pay(String accountNo, double amount) {
        System.out.print("[网银支付] 跳转网关...");
        channel.processPayment(accountNo, amount);
    }
}

class FacePayment extends Payment {
    public FacePayment(BankChannel channel) { super(channel); }

    @Override
    public void pay(String accountNo, double amount) {
        System.out.print("[刷脸支付] 人脸识别中...");
        channel.processPayment(accountNo, amount);
    }
}
```

### 9.5.3 文件存储

```java
interface FileStore {
    void upload(String path, byte[] data);
    byte[] download(String path);
    void delete(String path);
    long getFileSize(String path);
}

class LocalFileStore implements FileStore {
    @Override
    public void upload(String path, byte[] data) {
        System.out.println("[本地存储] 上传文件: " + path + " (" + data.length + " bytes)");
    }
    @Override
    public byte[] download(String path) {
        System.out.println("[本地存储] 下载文件: " + path);
        return new byte[0];
    }
    @Override
    public void delete(String path) {
        System.out.println("[本地存储] 删除文件: " + path);
    }
    @Override
    public long getFileSize(String path) {
        return 1024L;
    }
}

class S3FileStore implements FileStore {
    @Override
    public void upload(String path, byte[] data) {
        System.out.println("[AWS S3] 上传文件: " + path + " (bucket=my-bucket)");
    }
    @Override
    public byte[] download(String path) {
        System.out.println("[AWS S3] 下载文件: " + path);
        return new byte[0];
    }
    @Override
    public void delete(String path) {
        System.out.println("[AWS S3] 删除文件: " + path);
    }
    @Override
    public long getFileSize(String path) {
        return 2048L;
    }
}

abstract class FileManager {
    protected FileStore store;
    public FileManager(FileStore store) { this.store = store; }
    public abstract void saveFile(String name, byte[] data);
    public abstract byte[] loadFile(String name);
    public abstract void removeFile(String name);
}

class ImageFileManager extends FileManager {
    public ImageFileManager(FileStore store) { super(store); }
    @Override
    public void saveFile(String name, byte[] data) {
        System.out.println("[图片管理] 校验图片格式...");
        store.upload("images/" + name, data);
    }
    @Override
    public byte[] loadFile(String name) {
        return store.download("images/" + name);
    }
    @Override
    public void removeFile(String name) {
        store.delete("images/" + name);
    }
}

class DocumentFileManager extends FileManager {
    public DocumentFileManager(FileStore store) { super(store); }
    @Override
    public void saveFile(String name, byte[] data) {
        System.out.println("[文档管理] 校验文档格式...");
        store.upload("docs/" + name, data);
    }
    @Override
    public byte[] loadFile(String name) {
        return store.download("docs/" + name);
    }
    @Override
    public void removeFile(String name) {
        store.delete("docs/" + name);
    }
}
```

## 9.6 潜在风险与问题

### 9.6.1 为简单场景增加不必要的复杂度

如果系统仅在一个维度上变化，使用桥接模式就过度设计了。过多的抽象层会降低代码的可读性。

```java
// 过度设计：只有一个维度变化，不需要桥接模式
// 问题：引入不必要的抽象层
interface LoggerImpl { void log(String msg); }
class ConsoleLoggerImpl implements LoggerImpl { /* ... */ }

abstract class Logger {
    protected LoggerImpl impl;
    public Logger(LoggerImpl impl) { this.impl = impl; }
    public abstract void info(String msg);
}

class SimpleLogger extends Logger {
    public SimpleLogger(LoggerImpl impl) { super(impl); }
    @Override
    public void info(String msg) { impl.log(msg); }
}

// 更简单的方案：直接使用接口 + 实现类，不需要桥接层
interface SimpleLogger2 { void info(String msg); }
class ConsoleLogger2 implements SimpleLogger2 { /* ... */ }
```

**判断标准**：只有当系统在两个（或以上）维度上独立变化时，才考虑使用桥接模式。

### 9.6.2 调试复杂度增加

桥接模式增加了一层间接调用，调用链变为：`Client -> Abstraction -> Implementor`。在调试时，需要穿过抽象层找到具体实现。

```
调试栈（桥接模式）:
  Client.method()
  -> Abstraction.operation()
  -> Implementor.operationImpl()   // 需要找到这里的具体实现
  -> ConcreteImplementorA.operationImpl()

调试栈（直接实现）:
  Client.method()
  -> ConcreteImplementor.operationImpl()  // 一步到位
```

**解决方案**：使用 IDE 的调试功能（如"Step Into"）来穿透抽象层，或者配置更好的日志输出。

### 9.6.3 正确识别独立维度

桥接模式成败的关键在于**正确识别两个独立的变化维度**。如果维度划分错误，桥接模式不仅无法解决问题，还会让系统更加混乱。

```java
// 错误的维度划分：两个维度本质上不是独立的
// "消息类型"和"消息优先级"有强关联
// 紧急消息通常需要特殊格式，普通消息不需要
abstract class Message {
    protected MessageFormatter formatter; // 格式器
    // ...
}

class UrgentMessage extends Message {
    // 紧急消息的格式是固定的，不应该让格式器可变
    // 这里 MessageFormatter 维度并不真正独立
}
```

**判断方法**：如果维度 A 的变化会影响维度 B 的实现方式，或者两者之间存在固定的对应关系，它们就不是真正独立的维度。

### 9.6.4 与策略模式（Strategy）的区别

桥接模式和策略模式在结构上非常相似（都使用组合），但意图完全不同：

| 对比维度 | 桥接模式 | 策略模式 |
|----------|---------|---------|
| **目的** | 分离抽象与实现，使两者独立变化 | 提供算法的可替换家族 |
| **关注点** | 结构（解耦两个维度） | 行为（动态选择算法） |
| **变化方向** | 两个维度同时变化 | 一个维度的算法变化 |
| **使用方式** | Abstraction 持有 Implementor 引用 | Context 持有 Strategy 引用 |
| **典型例子** | 消息类型 x 发送渠道 | 排序算法选择 |

简单总结：**桥接模式关注的是**"是什么"和"怎么做"的解耦；**策略模式关注的是**"怎么做"的多种方式。

## 9.7 优化策略

### 9.7.1 如何识别真正的独立维度

判断两个维度是否真正独立，可以通过以下问题来检验：

1. **新增测试**：在一个维度上新增一个变体，另一个维度的代码是否需要修改？
2. **正交测试**：两个维度的变体是否可以任意组合？
3. **变化频率测试**：两个维度的变化频率和原因是否不同？

```java
/**
 * 维度独立性判断模板
 */
class DimensionIndependenceChecker {
    // 问题：消息系统有两个"疑似"维度
    // 维度A：消息类型（普通、紧急、加急）
    // 维度B：发送渠道（邮件、短信、微信）

    public static boolean areIndependent() {
        // 测试1：新增"钉钉"渠道，已有的3种消息类型是否需要修改？
        // 答案：不需要，只需新增 DingTalkSender
        // => 通过

        // 测试2：新增"系统通知"消息类型，已有的4种渠道是否需要修改？
        // 答案：不需要，只需新增 SystemNotificationMessage
        // => 通过

        // 测试3：紧急消息 + 短信 vs 紧急消息 + 邮件 —— 是否能正常组合？
        // 答案：可以，消息类型定义格式，渠道定义发送方式
        // => 通过

        return true; // 两个维度独立，适合使用桥接模式
    }
}
```

### 9.7.2 与抽象工厂结合：创建完整的"产品族"

当需要创建一组相关联的抽象和实现时，桥接模式可以与抽象工厂模式结合，确保抽象和实现的一致性。

```java
/**
 * 抽象工厂：创建一组配套的 Abstraction 和 Implementor
 */
interface UIFactory {
    // 创建实现层（平台相关）
    Renderer createRenderer();

    // 创建抽象层（平台无关，但使用上面创建的 Renderer）
    default Button createButton(String text) {
        return new Button(createRenderer(), text);
    }
    default Dialog createDialog(String title, String content) {
        return new Dialog(createRenderer(), title, content);
    }
}

class WindowsUIFactory implements UIFactory {
    @Override
    public Renderer createRenderer() {
        return new WindowsRenderer();
    }
}

class MacUIFactory implements UIFactory {
    @Override
    public Renderer createRenderer() {
        return new MacRenderer();
    }
}

// 使用工厂创建完整的 UI 组件族
class Application {
    private final UIFactory factory;

    public Application(UIFactory factory) {
        this.factory = factory;
    }

    public void renderUI() {
        // 这些组件自动使用与工厂一致的 Renderer
        Button okBtn = factory.createButton("确定");
        Dialog dlg = factory.createDialog("提示", "保存成功");

        okBtn.display();
        dlg.display();
    }

    public static void main(String[] args) {
        // 切换整个 UI 主题（平台）
        Application app = new Application(new WindowsUIFactory());
        app.renderUI();

        // 切换到 Mac
        app = new Application(new MacUIFactory());
        app.renderUI();
    }
}
```

### 9.7.3 运行时动态选择实现

桥接模式可以在运行时动态切换 Implementor，这是继承方式无法做到的。

```java
/**
 * 运行时动态选择实现 — 基于负载或配置
 */
class DynamicMessageService {
    private final MessageSender primarySender;
    private final MessageSender fallbackSender;
    private final Message message;

    public DynamicMessageService(MessageSender primary,
                                  MessageSender fallback,
                                  Message message) {
        this.primarySender = primary;
        this.fallbackSender = fallback;
        this.message = message;
    }

    public void sendWithFallback(String content, String recipient) {
        try {
            message.setSender(primarySender);
            message.send(content, recipient);
        } catch (Exception e) {
            System.out.println("主渠道发送失败，切换到备用渠道: "
                    + e.getMessage());
            message.setSender(fallbackSender);
            message.send(content, recipient);
        }
    }

    /**
     * 基于消息优先级选择渠道
     */
    public void sendWithPriorityRouting(String content,
                                         String recipient,
                                         int priority) {
        if (priority >= 9) {
            // 高优先级：多渠道同时发送
            message.setSender(new EmailSender());
            message.send(content, recipient);
            message.setSender(new SmsSender());
            message.send(content, recipient);
            message.setSender(new WechatSender());
            message.send(content, recipient);
        } else if (priority >= 5) {
            // 中等优先级：邮件 + 微信
            message.setSender(new EmailSender());
            message.send(content, recipient);
            message.setSender(new WechatSender());
            message.send(content, recipient);
        } else {
            // 低优先级：只发邮件
            message.setSender(new EmailSender());
            message.send(content, recipient);
        }
    }
}
```

### 9.7.4 桥接模式使用决策表

| 条件 | 是否使用桥接模式 |
|------|-----------------|
| 系统在两个独立维度上变化 | 强烈建议 |
| 需要运行时切换实现 | 建议使用 |
| 类数量呈 M x N 增长 | 强烈建议 |
| 只有一个变化维度 | **不**使用 |
| 维度间存在依赖关系 | 需要重新设计 |
| 变化维度超过两个 | 考虑多层桥接或重新设计 |

## 本章小结

本章详细介绍了桥接模式（Bridge Pattern）：

1. **核心问题**：当系统在两个独立维度上变化时，使用继承会导致 M x N 的类爆炸问题。
2. **解决思路**：将抽象与实现分离，通过组合（持有 Implementor 引用）来连接两个维度，使它们可以独立变化。
3. **UML结构**：Abstraction、RefinedAbstraction、Implementor、ConcreteImplementor 四个角色。
4. **代码实现**：提供了消息通知（Message x Sender）、图形颜色（Shape x Color）、JDBC 模拟三个完整示例。
5. **框架应用**：JDBC DriverManager、SLF4J、Spring AbstractRoutingDataSource、AWT 平台渲染。
6. **使用场景**：跨平台 UI、支付网关、文件存储、通知系统。
7. **主要风险**：场景过于简单时过度设计、调试复杂度增加、维度识别错误、与策略模式混淆。
8. **优化策略**：结合抽象工厂创建产品族、运行时动态选择实现、使用桥接模式决策表。

**桥接模式是替代多继承的优雅方案**。它通过组合替代继承，让代码结构更加清晰、灵活，是面向对象设计中"优先使用组合而非继承"原则的完美体现。

---

在下一章中，我们将学习组合模式（Composite Pattern），了解如何以树形结构处理部分-整体的层次关系。
