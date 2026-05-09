# 第2章 面向对象设计原则

面向对象设计原则是设计模式的基础和指导方针。这七大原则帮助我们创建更加灵活、可维护和可扩展的代码。在学习具体的设计模式之前，理解这些原则至关重要。

## 2.1 单一职责原则（SRP）

### 2.1.1 定义

**单一职责原则**（Single Responsibility Principle，SRP）规定一个类应该只有一个引起它变化的原因。这意味着每个类只负责一项职责。

### 2.1.2 问题分析

假设有一个用户管理类同时处理用户注册、验证和数据库操作：

```java
// 违反SRP的类
public class UserManager {
    // 处理用户注册
    public void register(User user) {
        validate(user);
        saveToDatabase(user);
        sendWelcomeEmail(user);
    }

    // 处理验证
    private void validate(User user) {
        // 验证逻辑
    }

    // 处理数据库操作
    private void saveToDatabase(User user) {
        // 数据库操作
    }

    // 处理邮件发送
    private void sendWelcomeEmail(User user) {
        // 邮件发送逻辑
    }
}
```

问题：
- 用户注册逻辑变化时需要修改此类
- 验证规则变化时需要修改此类
- 数据库结构变化时需要修改此类
- 邮件服务变化时需要修改此类

### 2.1.3 解决方案

将职责分离到不同的类：

```java
// 职责1：用户注册
public class UserService {
    private UserValidator validator;
    private UserRepository repository;
    private EmailService emailService;

    public void register(User user) {
        validator.validate(user);
        repository.save(user);
        emailService.sendWelcome(user);
    }
}

// 职责2：验证
public class UserValidator {
    public void validate(User user) {
        // 验证逻辑
    }
}

// 职责3：数据持久化
public class UserRepository {
    public void save(User user) {
        // 数据库操作
    }
}

// 职责4：邮件服务
public class EmailService {
    public void sendWelcome(User user) {
        // 邮件发送
    }
}
```

### 2.1.4 优点

- 类的复杂性降低，每个类职责单一
- 可读性和可维护性提高
- 变更引起的风险降低
- 便于测试和维护

### 2.1.5 实践建议

- "职责"的界定需要根据业务场景来判断
- 不要过度拆分，保持合理的类数量
- 当一个类有多个变化的因素时，考虑拆分

## 2.2 开闭原则（OCP）

### 2.2.1 定义

**开闭原则**（Open-Closed Principle，OCP）规定软件实体应该对扩展开放，对修改关闭。即在不修改原有代码的情况下扩展功能。

### 2.2.2 问题分析

```java
// 违反OCP：每次添加新的支付方式都需要修改这个类
public class PaymentService {
    public void pay(String type, double amount) {
        if ("alipay".equals(type)) {
            // 支付宝支付
        } else if ("wechat".equals(type)) {
            // 微信支付
        } else if ("bankcard".equals(type)) {
            // 银行卡支付
        }
        // 每添加一种支付方式，都需要修改这个方法
    }
}
```

### 2.2.3 解决方案

使用多态和抽象：

```java
// 抽象支付接口
public interface Payment {
    void pay(double amount);
}

// 具体支付实现
public class AlipayPayment implements Payment {
    @Override
    public void pay(double amount) {
        // 支付宝支付逻辑
    }
}

public class WechatPayment implements Payment {
    @Override
    public void pay(double amount) {
        // 微信支付逻辑
    }
}

public class BankCardPayment implements Payment {
    @Override
    public void pay(double amount) {
        // 银行卡支付逻辑
    }
}

// 支付服务
public class PaymentService {
    private Map<String, Payment> payments = new HashMap<>();

    public void registerPayment(String type, Payment payment) {
        payments.put(type, payment);
    }

    public void pay(String type, double amount) {
        Payment payment = payments.get(type);
        if (payment != null) {
            payment.pay(amount);
        }
    }
}
```

现在添加新的支付方式只需要：
1. 创建新的Payment实现类
2. 注册到PaymentService中
3. 无需修改现有代码

### 2.2.4 实现手段

- **抽象**：使用抽象类或接口定义稳定的行为
- **封装**：将变化的部分封装起来
- **继承**：通过子类扩展实现新功能
- **多态**：利用多态机制支持不同的实现

### 2.2.5 实践建议

- 识别系统中可能变化的部分，将其抽象出来
- 不要为了扩展而过度设计
- 关注频繁变化的部分，优先对它们进行抽象

## 2.3 里氏替换原则（LSP）

### 2.3.1 定义

**里氏替换原则**（Liskov Substitution Principle，LSP）规定子类型必须能够替换其基类型。也就是所有引用基类的地方，必须能够透明地使用其子类对象。

### 2.3.2 问题分析

```java
// 违反LSP的例子
public class Rectangle {
    protected double width;
    protected double height;

    public void setWidth(double width) {
        this.width = width;
    }

    public void setHeight(double height) {
        this.height = height;
    }

    public double area() {
        return width * height;
    }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(double width) {
        this.width = width;
        this.height = width;  // 正方形保持宽高一致
    }

    @Override
    public void setHeight(double height) {
        this.width = height;
        this.height = height;
    }
}

// 使用方
public class Geometry {
    public void calculateArea(Rectangle rectangle) {
        rectangle.setWidth(5);
        rectangle.setHeight(4);
        System.out.println(rectangle.area()); // 期望20
    }
}
```

问题：当传入Square时，setWidth(5)会同时设置height为5，导致面积为25而不是20。

### 2.3.3 解决方案

重新设计继承层次：

```java
// 使用更抽象的形状概念
public interface Shape {
    double area();
}

public class Rectangle implements Shape {
    private double width;
    private double height;

    public Rectangle(double width, double height) {
        this.width = width;
        this.height = height;
    }

    @Override
    public double area() {
        return width * height;
    }
}

public class Square implements Shape {
    private double side;

    public Square(double side) {
        this.side = side;
    }

    @Override
    public double area() {
        return side * side;
    }
}
```

### 2.3.4 LSP检查清单

子类方法应该满足：
- 前置条件不能比父类更严格
- 后置条件不能比父类更宽松
- 子类必须保持父类的不变性
- 子类方法签名应该与父类兼容

### 2.3.5 实践建议

- 继承关系应该符合"is-a"关系
- 谨慎使用继承，优先考虑组合
- 设计继承层次时考虑行为而非属性

## 2.4 依赖倒置原则（DIP）

### 2.4.1 定义

**依赖倒置原则**（Dependency Inversion Principle，DIP）包含两层含义：
1. 高层模块不应该依赖低层模块，两者都应该依赖抽象
2. 抽象不应该依赖细节，细节应该依赖抽象

### 2.4.2 问题分析

```java
// 违反DIP：高层模块直接依赖低层模块
public class OrderService {
    private MySQLDatabase database = new MySQLDatabase();

    public void saveOrder(Order order) {
        database.save(order);
    }
}

public class MySQLDatabase {
    public void save(Order order) {
        // MySQL保存逻辑
    }
}
```

问题：OrderService直接依赖MySQLDatabase，如果要换成其他数据库，需要修改OrderService。

### 2.4.3 解决方案

依赖抽象接口：

```java
// 定义抽象接口
public interface OrderRepository {
    void save(Order order);
    Order findById(String id);
}

// 低层模块实现接口
public class MySQLOrderRepository implements OrderRepository {
    @Override
    public void save(Order order) {
        // MySQL实现
    }

    @Override
    public Order findById(String id) {
        // MySQL查询
        return null;
    }
}

public class MongoDBOrderRepository implements OrderRepository {
    @Override
    public void save(Order order) {
        // MongoDB实现
    }

    @Override
    public Order findById(String id) {
        // MongoDB查询
        return null;
    }
}

// 高层模块依赖抽象
public class OrderService {
    private OrderRepository repository;

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    public void saveOrder(Order order) {
        repository.save(order);
    }
}
```

通过依赖注入，高层模块不再依赖具体的低层实现，而是依赖抽象接口。

### 2.4.4 依赖注入的三种方式

1. **构造函数注入**
```java
public class OrderService {
    private OrderRepository repository;

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }
}
```

2. **Setter注入**
```java
public class OrderService {
    private OrderRepository repository;

    public void setRepository(OrderRepository repository) {
        this.repository = repository;
    }
}
```

3. **接口注入**
```java
public interface RepositoryAware {
    void setRepository(Object repository);
}
```

### 2.4.5 实践建议

- 面向接口编程，而非面向实现编程
- 变量类型尽量使用抽象类型
- 避免在代码中直接实例化具体类
- 使用依赖注入框架（Spring等）管理依赖

## 2.5 接口隔离原则（ISP）

### 2.5.1 定义

**接口隔离原则**（Interface Segregation Principle，ISP）规定客户端不应该被迫依赖它不需要的方法。换句话说，应该使用多个专门的接口，而不是一个臃肿的接口。

### 2.5.2 问题分析

```java
// 违反ISP：臃肿的接口
public interface Worker {
    void work();
    void eat();
    void sleep();
}

public class Robot implements Worker {
    @Override
    public void work() {
        // 机器人工作
    }

    @Override
    public void eat() {
        // 机器人不需要吃饭，但必须实现
        throw new UnsupportedOperationException("Robot doesn't eat");
    }

    @Override
    public void sleep() {
        // 机器人不需要睡觉，但必须实现
        throw new UnsupportedOperationException("Robot doesn't sleep");
    }
}
```

问题：Robot被迫实现了它不需要的方法。

### 2.5.3 解决方案

拆分接口：

```java
// 分解为更小的接口
public interface Workable {
    void work();
}

public interface Eatable {
    void eat();
}

public interface Sleepable {
    void sleep();
}

// 按需实现接口
public class Robot implements Workable {
    @Override
    public void work() {
        // 机器人工作
    }
}

public class Human implements Workable, Eatable, Sleepable {
    @Override
    public void work() { }

    @Override
    public void eat() { }

    @Override
    public void sleep() { }
}
```

### 2.5.4 实践建议

- 接口应该保持精简，一个接口只负责一项职责
- 优先使用小接口而非大接口
- 根据业务需求合理拆分接口
- 避免"接口污染"

## 2.6 迪米特法则（LoD）

### 2.6.1 定义

**迪米特法则**（Law of Demeter，LoD）也称为最少知识原则，规定一个对象应该对其他对象有最少的了解。或者说，一个类应该对自己需要耦合或调用的类知道得最少。

### 2.6.2 问题分析

```java
// 违反LoD的例子
public class Teacher {
    public void command(GroupLeader leader) {
        // Teacher直接访问Student
        for (Student student : leader.getStudents()) {
            System.out.println(student.getName());
        }
    }
}

public class GroupLeader {
    private List<Student> students = new ArrayList<>();

    public List<Student> getStudents() {
        return students;
    }
}

public class Student {
    private String name;

    public String getName() {
        return name;
    }
}
```

问题：Teacher需要了解GroupLeader的内部结构（getStudents()返回List），并进一步访问Student。

### 2.6.3 解决方案

使用中间类封装操作：

```java
public class Teacher {
    public void command(GroupLeader leader) {
        // 委托GroupLeader完成，不需要知道内部细节
        leader.countStudents();
    }
}

public class GroupLeader {
    private List<Student> students = new ArrayList<>();

    public void countStudents() {
        System.out.println("学生数量：" + students.size());
        for (Student student : students) {
            System.out.println(student.getName());
        }
    }
}
```

### 2.6.4 LoD实现建议

- 只与直接的朋友通信
- 不暴露内部实现细节
- 使用封装来减少直接的依赖关系
- 谨慎使用链式调用（如a.getB().getC()）

### 2.6.5 实践建议

- 降低类之间的耦合度
- 类的公共方法应该是必要的
- 减少对其他类的直接引用
- 使用设计良好的API进行交互

## 2.7 合成复用原则（CRP）

### 2.7.1 定义

**合成复用原则**（Composite Reuse Principle，CRP）也称为组合/聚合复用原则，规定尽量使用对象组合/聚合，而不是继承来达到复用的目的。

### 2.7.2 问题分析

```java
// 违反CRP：使用继承
public class Car {
    public void run() {
        System.out.println("Car is running");
    }
}

public class ElectricCar extends Car {
    @Override
    public void run() {
        System.out.println("Electric car is running");
    }
}

public class HybridCar extends Car {
    // 问题：如果需要同时拥有电动车和汽油车的特性怎么办？
}
```

问题：继承关系是静态的，无法在运行时改变；继承会破坏封装性。

### 2.7.3 解决方案

使用组合：

```java
// 抽象动力源
public interface Engine {
    void start();
}

// 具体实现
public class ElectricEngine implements Engine {
    @Override
    public void start() {
        System.out.println("Electric engine started");
    }
}

public class GasEngine implements Engine {
    @Override
    public void start() {
        System.out.println("Gas engine started");
    }
}

// 使用组合
public class Car {
    private Engine engine;

    public Car(Engine engine) {
        this.engine = engine;
    }

    public void run() {
        engine.start();
        System.out.println("Car is running");
    }
}

// 运行时决定使用哪种引擎
public class Main {
    public static void main(String[] args) {
        Car electricCar = new Car(new ElectricEngine());
        electricCar.run();

        Car gasCar = new Car(new GasEngine());
        gasCar.run();
    }
}
```

### 2.7.4 组合vs继承

| 特性 | 继承 | 组合 |
|------|------|------|
| 耦合度 | 高 | 低 |
| 灵活性 | 低（静态） | 高（动态） |
| 封装性 | 破坏 | 保持 |
| 代码复用 | 白盒复用 | 黑盒复用 |
| 层次关系 | is-a | has-a |

### 2.7.5 实践建议

- 优先使用组合/聚合而不是继承
- 使用继承时确保是真正的"is-a"关系
- 利用组合提高类的灵活性和可复用性
- 在复用时优先考虑组合，必要时才使用继承

## 2.8 原则间的权衡与决策

### 2.8.1 原则之间的关系

七大设计原则并非孤立存在，它们相互关联：

```
┌─────────────────────────────────────────────────────────┐
│                    开闭原则（OCP）                       │
│                      核心目标                            │
└─────────────────────────────────────────────────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌───────────┐     ┌───────────────┐    ┌───────────┐
│  单一职责  │     │   里氏替换    │    │  依赖倒置  │
│   (SRP)   │     │    (LSP)     │    │   (DIP)   │
└───────────┘     └───────────────┘    └───────────┘
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
              ┌───────────────────────┐
              │   接口隔离（ISP）      │
              │   迪米特法则（LoD）    │
              │   合成复用（CRP）      │
              └───────────────────────┘
```

### 2.8.2 冲突与权衡

在实际开发中，原则之间可能会产生冲突：

1. **SRP vs ISP**：过度拆分会导致接口过多，需要平衡
2. **OCP vs DIP**：过度抽象可能导致系统复杂，需要适度
3. **继承 vs 组合**：虽然CRP推荐组合，但继承并非完全禁止

### 2.8.3 实践指导

- **不要教条**：原则是指导而非教条
- **根据场景选择**：不同的业务场景可能需要不同的权衡
- **渐进式重构**：不要为了遵守原则而过度重构现有代码
- **关注代码可读性**：最终目标是写出可维护的代码
- **团队共识**：团队需要对原则的理解和运用达成共识

### 2.8.4 何时打破原则

在以下情况下可以考虑打破原则：
- 明确的性能问题需要优化
- 极简单的场景不需要过度设计
- 遗留代码维护需要兼容性
- 时间紧迫的原型开发

## 本章小结

本章介绍了面向对象的七大设计原则：

1. **单一职责原则（SRP）**：一个类只负责一项职责
2. **开闭原则（OCP）**：对扩展开放，对修改关闭
3. **里氏替换原则（LSP）**：子类可以替换父类
4. **依赖倒置原则（DIP）**：依赖抽象而非具体
5. **接口隔离原则（ISP）**：使用专门的接口
6. **迪米特法则（LoD）**：只与直接朋友通信
7. **合成复用原则（CRP）**：优先使用组合而非继承

这些原则是设计模式的基础，理解并灵活运用这些原则，才能真正掌握设计模式。

---

在下一章中，我们将学习第一个创建型设计模式——单例模式。