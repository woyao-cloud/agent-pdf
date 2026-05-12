# 第2章 架构设计原则

架构设计原则是指导架构决策的基本准则，它们帮助架构师在复杂的决策中找到方向。

## 2.1 单一职责原则（SRP）

### 2.1.1 定义

每个组件应该只有一个导致其变化的原因。

### 2.1.2 在架构中的应用

```java
// 好的设计：职责分离
// 用户服务 - 纯业务逻辑
public class UserService {
    private UserRepository userRepository;

    public User getUserById(Long id) {
        return userRepository.findById(id);
    }
}

// 用户数据访问 - 纯数据操作
public class UserRepository {
    public User findById(Long id) {
        // 数据库查询逻辑
    }
}

// 用户DTO - 纯数据传输
public class UserDTO {
    private Long id;
    private String name;
    private String email;
}
```

### 2.1.3 架构层面的SRP

- **服务拆分**：每个微服务只负责一个业务域
- **数据分离**：每个服务有自己的数据库
- **团队分工**：每个团队负责一个服务

## 2.2 开闭原则（OCP）

### 2.2.1 定义

软件实体应该对扩展开放，对修改关闭。

### 2.2.2 在架构中的应用

```java
// 插件式架构示例
public interface PaymentPlugin {
    void pay(Order order);
    String getPaymentType();
}

// 新增支付方式只需实现接口，无需修改现有代码
public class AlipayPlugin implements PaymentPlugin {
    @Override
    public void pay(Order order) { /* 支付宝支付逻辑 */ }

    @Override
    public String getPaymentType() { return "ALIPAY"; }
}

public class WechatPayPlugin implements PaymentPlugin {
    @Override
    public void pay(Order order) { /* 微信支付逻辑 */ }

    @Override
    public String getPaymentType() { return "WECHAT"; }
}
```

### 2.2.3 实现方式

- **策略模式**：封装算法为独立对象
- **装饰器模式**：动态添加职责
- **模板方法**：定义算法骨架

## 2.3 依赖倒置原则（DIP）

### 2.3.1 定义

- 高层模块不应该依赖低层模块，两者都应该依赖抽象
- 抽象不应该依赖细节，细节应该依赖抽象

### 2.3.2 在架构中的应用

```java
// 依赖抽象接口
public interface IUserRepository {
    User findById(Long id);
    void save(User user);
}

// 低层模块实现接口
public class UserRepository implements IUserRepository {
    @Override
    public User findById(Long id) {
        // 数据库查询逻辑
    }

    @Override
    public void save(User user) { /* ... */ }
}

// 高层模块依赖抽象
public class UserService {
    private final IUserRepository repository;

    public UserService(IUserRepository repository) {
        this.repository = repository;
    }
}
```

### 2.3.3 依赖注入方式

```java
// 构造函数注入
public class OrderService {
    private final IOrderRepository repository;

    public OrderService(IOrderRepository repository) {
        this.repository = repository;
    }
}

// Spring中的依赖注入配置
@Configuration
public class BeanConfiguration {
    @Bean
    public OrderService orderService(OrderRepository repository) {
        return new OrderService(repository);
    }
}
```

## 2.4 接口隔离原则（ISP）

### 2.4.1 定义

不应该强迫客户端依赖于它们不用的接口。

### 2.4.2 在架构中的应用

```java
// 避免臃肿的接口
public interface UserOps {
    void create();
    void read();
    void update();
    void delete();
    void sendEmail();  // 与用户管理无关
}

// 拆分接口
public interface CRUD {
    void create();
    void read();
    void update();
    void delete();
}

public interface Emailable {
    void sendEmail();
}

// 按需实现
public class UserService implements CRUD, Emailable {
    // 只实现需要的接口
}
```

## 2.5 迪米特法则（LoD）

### 2.5.1 定义

一个对象应该对其他对象有最少的了解。

### 2.5.2 在架构中的应用

```java
// 避免链式调用
// 不好：客户端需要了解中间对象
order.getCustomer().getAddress().getCity();

// 好：通过服务门面获取
locationService.getCityByOrder(orderId);
```

## 2.6 里氏替换原则（LSP）

### 2.6.1 定义

子类必须能够完全替换父类。

### 2.6.2 在架构中的应用

```java
// 父类定义规范
public abstract class Payment {
    public abstract void pay(BigDecimal amount);
}

// 子类遵守父类契约
public class Alipay extends Payment {
    @Override
    public void pay(BigDecimal amount) {
        // 支付宝支付实现
    }
}

// 可以用子类替换父类
public void processPayment(Payment payment, BigDecimal amount) {
    payment.pay(amount);  // 不需要知道具体是哪种支付方式
}
```

## 2.7 合成复用原则（CRP）

### 2.7.1 定义

优先使用对象组合/委托，而不是继承。

### 2.7.2 在架构中的应用

```java
// 组合优于继承
class Bird {
    // 继承导致紧耦合
}

class Wing {
    // 可以被组合
}

// 使用组合
class Bird {
    private Wing wing;

    public Bird(Wing wing) {
        this.wing = wing;
    }
}
```

## 2.8 原则的权衡与决策

### 2.8.1 原则冲突

实际开发中，原则之间可能产生冲突：

- **SRP vs ISP**：过度拆分导致接口过多
- **OCP vs KISS**：过度抽象增加复杂度
- **DIP vs YAGNI**：过度抽象是未来需求

### 2.8.2 决策建议

| 场景 | 建议 |
|------|------|
| 简单系统 | 优先KISS（保持简单） |
| 变化频繁 | 考虑OCP |
| 团队协作 | 遵循SRP |
| 性能关键 | 避免过度抽象 |
| 快速交付 | 避免过度设计 |

## 2.9 本章小结

本章介绍了架构设计的六个核心原则：

1. **单一职责原则**：组件只做一件事
2. **开闭原则**：对扩展开放，对修改关闭
3. **依赖倒置原则**：依赖抽象而非具体
4. **接口隔离原则**：使用小而专的接口
5. **迪米特法则**：只与直接朋友通信
6. **里氏替换原则**：子类可以替换父类
7. **合成复用原则**：优先组合优于继承

这些原则是架构模式的基础，帮助我们在设计中做出更好的决策。

---

在下一章中，我们将学习架构质量属性，理解如何评估架构的好坏。