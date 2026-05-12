# 第1章 设计模式概述

软件设计是一门平衡的艺术。面对不断变化的业务需求、日益复杂的系统架构、多人协作的开发模式，开发者需要的不仅是编码技巧，更是一套能够应对变化的思维方式。**设计模式**正是这样一种经过千锤百炼的思维工具。

## 1.1 设计模式定义与价值

### 1.1.1 设计模式的起源

设计模式的概念最早并非来自软件工程，而是来自建筑学。

20世纪70年代，建筑学家 **Christopher Alexander** 在其著作《A Pattern Language》和《The Timeless Way of Building》中首次提出了"模式"的概念。Alexander 认为，建筑中的许多问题反复出现，每个问题都对应一种经过验证的解决方案。他将这些解决方案抽象为"模式"，形成了一套描述建筑设计的通用语言。

Alexander 对模式的定义是：

> "每个模式描述了一个在我们环境中反复出现的问题，然后描述了该问题解决方案的核心。通过这种方式，你可以无数次地使用这个解决方案，而不必以相同的方式做两次。"

1994年，**Erich Gamma、Richard Helm、Ralph Johnson 和 John Vlissides**（被业界尊称为 **GoF**，Gang of Four，四人帮）将 Alexander 的模式思想引入软件工程，出版了里程碑式的著作《Design Patterns: Elements of Reusable Object-Oriented Software》。这本书收录了23种经典的面向对象设计模式，从此彻底改变了软件开发的思维方式。

### 1.1.2 什么是设计模式

**设计模式**（Design Pattern）是一套被反复使用、经过分类编目的、代码设计经验的总结。它并不是可以直接转化为代码的"模板"，而是一种在特定场景下解决特定问题的**通用思路**。

一个完整的设计模式通常包含以下四个要素：

| 要素 | 说明 | 示例（以观察者模式为例） |
|------|------|--------------------------|
| **模式名称** | 简洁描述模式本质的称谓 | Observer（观察者） |
| **问题描述** | 该模式所解决的特定场景和问题 | 一个对象状态变化时，需要通知多个依赖对象 |
| **解决方案** | 描述设计的组成成分、它们之间的相互关系及各自的职责 | Subject维护Observer列表，状态变化时逐一通知 |
| **效果** | 使用该模式带来的收益和付出的代价 | 解耦了发布者和订阅者，但可能引起循环依赖 |

设计模式具有以下核心特征：

- **系统性**：设计模式不是零散的技巧，而是一套完整的设计方案，包含了角色、职责和协作关系
- **可复用性**：设计模式提炼了可复用的设计经验，可以在不同的项目中灵活应用
- **经过验证**：每种设计模式都经过了大量实际项目的检验，是工业级的实践经验
- **上下文相关**：每种设计模式都有其适用场景和限制条件，不存在万能模式
- **语言无关**：设计模式的核心思想不依赖于特定编程语言，虽然GoF模式基于面向对象语言提出

### 1.1.3 设计模式的构成要素：以观察者模式为例

为了更好地理解设计模式的构成，我们通过一个具体的例子来说明。假设我们正在开发一个天气监测应用，当气象站获取到新的温度数据时，需要同时更新多个显示屏。

```java
// 观察者接口 —— 所有显示屏都实现这个接口
public interface Observer {
    void update(float temperature, float humidity, float pressure);
}

// 主题接口 —— 气象站实现这个接口
public interface Subject {
    void registerObserver(Observer o);
    void removeObserver(Observer o);
    void notifyObservers();
}

// 具体主题 —— 气象站
public class WeatherStation implements Subject {
    private List<Observer> observers = new ArrayList<>();
    private float temperature;
    private float humidity;
    private float pressure;

    @Override
    public void registerObserver(Observer o) {
        observers.add(o);
    }

    @Override
    public void removeObserver(Observer o) {
        observers.remove(o);
    }

    @Override
    public void notifyObservers() {
        for (Observer observer : observers) {
            observer.update(temperature, humidity, pressure);
        }
    }

    // 当气象数据更新时，自动通知所有观察者
    public void setMeasurements(float temperature, float humidity, float pressure) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.pressure = pressure;
        notifyObservers();  // 关键：状态变化时通知所有观察者
    }
}

// 具体观察者 —— 当前天气显示屏
public class CurrentConditionsDisplay implements Observer {
    @Override
    public void update(float temperature, float humidity, float pressure) {
        System.out.println("当前天气：温度=" + temperature +
                "°C, 湿度=" + humidity + "%, 气压=" + pressure + "hPa");
    }
}

// 具体观察者 —— 天气预报显示屏
public class ForecastDisplay implements Observer {
    private float lastTemperature;

    @Override
    public void update(float temperature, float humidity, float pressure) {
        if (temperature > lastTemperature) {
            System.out.println("天气预报：天气将变暖");
        } else if (temperature < lastTemperature) {
            System.out.println("天气预报：天气将变冷");
        } else {
            System.out.println("天气预报：天气不变");
        }
        lastTemperature = temperature;
    }
}

// 客户端使用
public class WeatherApp {
    public static void main(String[] args) {
        WeatherStation station = new WeatherStation();

        CurrentConditionsDisplay currentDisplay = new CurrentConditionsDisplay();
        ForecastDisplay forecastDisplay = new ForecastDisplay();

        // 注册观察者
        station.registerObserver(currentDisplay);
        station.registerObserver(forecastDisplay);

        // 气象数据更新，所有显示屏自动刷新
        station.setMeasurements(25.5f, 65.0f, 1013.0f);
        station.setMeasurements(26.0f, 63.0f, 1012.0f);
    }
}
```

从这个例子中，我们可以清晰地看到设计模式的四个要素：

- **模式名称**：观察者模式（Observer Pattern）
- **问题描述**：一个对象（气象站）的状态变化需要自动通知多个依赖对象（各个显示屏），而且这些依赖对象的数量和类型可能动态变化
- **解决方案**：引入 Subject（主题）和 Observer（观察者）两个角色，Subject 维护观察者列表，状态变化时逐一通知
- **效果**：主题和观察者之间松耦合，可以独立复用；新增显示屏无需修改气象站代码；但可能引起更新顺序问题

### 1.1.4 设计模式的价值

设计模式为软件开发带来多层面的价值，远不止"代码更优雅"这么简单。

**1. 提供经过验证的解决方案**

每个设计模式都是对大量真实项目中反复出现的问题的抽象总结。使用设计模式，意味着你在借助前人积累的集体智慧，而不是从零开始摸索。一个经验丰富的架构师说"这里用策略模式"，背后是无数项目验证过的方案。

**2. 建立团队的通用设计语言**

设计模式为开发者提供了一套共享的**设计词汇表**（Design Vocabulary）。当团队成员说"这里用工厂方法"或"通过观察者解耦"，所有人立刻能理解设计意图，不需要长篇大论地解释代码结构。这种沟通效率的提升在大型团队中尤为显著。

```java
// 不用设计模式交流：
// "我们创建一个接口，然后让具体类实现这个接口，
//  在运行时通过配置文件决定使用哪个实现类..."

// 用设计模式交流：
// "这里使用策略模式即可。"
```

**3. 提高代码的可维护性和可扩展性**

设计模式的核心目标之一是**应对变化**。通过合理应用设计模式，可以将系统中容易变化的部分隔离出来，使得修改局部代码不会引发连锁反应。

**4. 促进面向对象原则的落地**

设计模式是面向对象设计原则（SOLID等）的具体体现。学习设计模式的过程，本质上是在学习如何在实际编码中应用面向对象原则。

**5. 帮助理解优秀框架的设计**

Spring、MyBatis、Netty 等主流 Java 框架大量使用了设计模式。掌握了设计模式，阅读框架源码就不再是一头雾水，而是能迅速识别出作者的架构意图。

### 1.1.5 设计模式的局限性

设计模式不是万能药。理解其局限性同样重要：

| 局限 | 说明 |
|------|------|
| **增加代码复杂度** | 引入额外的类和接口，对于简单场景可能是过度设计 |
| **学习成本** | 团队需要统一理解和掌握模式，否则反而增加沟通成本 |
| **不是银弹** | 模式解决的是特定问题，不能解决所有问题 |
| **语言的限制** | 某些模式在特定语言中可能有更简洁的实现方式（如函数式语言） |
| **模式迷信** | 为了使用模式而使用模式，反而导致设计质量下降 |

> **核心原则**：模式是工具，不是目标。好的设计来自对问题的深刻理解，而非模式的堆砌。

## 1.2 设计模式分类（GoF）

GoF在《设计模式》一书中将23种设计模式按照**目的**（Purpose）分为三大类：创建型、结构型和行为型。这种分类方法至今仍是最主流的设计模式分类方式。

### 1.2.1 创建型模式（Creational Patterns）—— 5种

创建型模式**抽象了对象的实例化过程**，帮助系统独立于如何创建、组合和表示它的对象。

它们的核心思想是：**将对象的创建和使用分离**，使得系统不再依赖于具体的类。

| 模式 | 核心思想 | 关键场景 |
|------|----------|----------|
| **单例模式**（Singleton） | 确保一个类只有一个实例，并提供全局访问点 | 配置管理、线程池、日志器 |
| **工厂方法模式**（Factory Method） | 定义创建对象的接口，让子类决定实例化哪个类 | 框架中的可扩展组件创建 |
| **抽象工厂模式**（Abstract Factory） | 创建一系列相关或相互依赖的对象，无需指定具体类 | 跨平台UI组件、多数据库支持 |
| **建造者模式**（Builder） | 将复杂对象的构建与表示分离，同样的构建过程可以创建不同表示 | 复杂对象创建（如HTTP请求、SQL构建器） |
| **原型模式**（Prototype） | 通过复制（克隆）现有对象来创建新对象，而非通过实例化 | 对象创建成本高、需要保留对象状态快照 |

创建型模式要解决的典型问题：

```java
// 不使用创建型模式 —— 代码与具体类紧密耦合
public class DocumentEditor {
    public void createDocument(String type) {
        if ("word".equals(type)) {
            WordDocument doc = new WordDocument();  // 直接依赖具体类
            doc.open();
        } else if ("pdf".equals(type)) {
            PdfDocument doc = new PdfDocument();    // 每新增一种文档类型，都要修改这里
            doc.open();
        }
        // 问题：DocumentEditor 直接依赖具体的文档类，违背了开闭原则
    }
}
```

通过工厂方法模式改进：

```java
// 使用工厂方法模式 —— 将创建逻辑抽象出来
public interface Document {
    void open();
    void save();
}

public class WordDocument implements Document {
    @Override
    public void open() { System.out.println("打开Word文档"); }
    @Override
    public void save() { System.out.println("保存Word文档"); }
}

public class PdfDocument implements Document {
    @Override
    public void open() { System.out.println("打开PDF文档"); }
    @Override
    public void save() { System.out.println("保存PDF文档"); }
}

// 工厂接口
public abstract class DocumentEditor {
    // 框架方法，定义流程
    public void newDocument() {
        Document doc = createDocument();  // 工厂方法
        doc.open();
    }

    // 工厂方法 —— 由子类实现
    protected abstract Document createDocument();
}

// 具体编辑器
public class WordEditor extends DocumentEditor {
    @Override
    protected Document createDocument() {
        return new WordDocument();
    }
}

public class PdfEditor extends DocumentEditor {
    @Override
    protected Document createDocument() {
        return new PdfDocument();
    }
}

// 拓展新类型变得简单 —— 只需新增子类，无需修改现有代码
public class MarkdownEditor extends DocumentEditor {
    @Override
    protected Document createDocument() {
        return new MarkdownDocument();
    }
}
```

### 1.2.2 结构型模式（Structural Patterns）—— 7种

结构型模式关注**类和对象的组合**，通过继承和组合来形成更大的结构。

它们的核心思想是：**在不破坏现有类结构的前提下，通过组合来扩展功能或适配接口**。

| 模式 | 核心思想 | 关键场景 |
|------|----------|----------|
| **适配器模式**（Adapter） | 将一个接口转换为客户端期望的另一个接口 | 集成遗留系统、第三方库适配 |
| **桥接模式**（Bridge） | 将抽象部分与实现部分分离，使它们可以独立变化 | 多维度变化的系统（如不同平台+不同格式） |
| **组合模式**（Composite） | 将对象组合成树形结构以表示"部分-整体"层次 | 文件系统、组织结构、UI组件树 |
| **装饰器模式**（Decorator） | 动态地给对象添加额外的职责 | Java I/O流、功能增强 |
| **外观模式**（Facade） | 为子系统中的一组接口提供统一的入口 | 简化复杂系统的使用 |
| **代理模式**（Proxy） | 为对象提供代理以控制对该对象的访问 | 延迟加载、访问控制、AOP |
| **享元模式**（Flyweight） | 共享大量细粒度对象以节省内存 | 文本编辑器字符对象、连接池 |

结构型模式的典型应用 —— Java I/O 流体系中的装饰器模式：

```java
// Java I/O 流是装饰器模式的经典实现
// 基础组件
InputStream fileInput = new FileInputStream("data.txt");

// 层层装饰，动态添加功能
InputStream bufferedInput = new BufferedInputStream(fileInput);    // 添加缓冲
InputStream dataInput = new DataInputStream(bufferedInput);        // 添加基本数据类型读取
// 还可以继续添加：压缩、加密、校验等

// 如果不使用装饰器模式，每种功能组合都需要创建一个新类：
// BufferedFileInputStream、DataBufferedFileInputStream、
// EncryptedBufferedFileInputStream... 类爆炸！

// 自定义一个装饰器示例 —— 添加日志功能
public class LoggingInputStream extends FilterInputStream {
    public LoggingInputStream(InputStream in) {
        super(in);
    }

    @Override
    public int read() throws IOException {
        int data = super.read();
        System.out.println("读取字节: " + data);
        return data;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int bytesRead = super.read(b, off, len);
        System.out.println("读取了 " + bytesRead + " 字节");
        return bytesRead;
    }
}

// 使用自定义装饰器
InputStream loggedInput = new LoggingInputStream(
        new BufferedInputStream(
                new FileInputStream("data.txt")
        )
);
```

### 1.2.3 行为型模式（Behavioral Patterns）—— 11种

行为型模式关注**对象之间的通信和职责分配**，描述对象或类之间如何交互和分配职责。

它们的核心思想是：**不只是描述对象或类的模式，更是描述它们之间通信的模式**。

| 模式 | 核心思想 | 关键场景 |
|------|----------|----------|
| **责任链模式**（Chain of Responsibility） | 将请求沿着处理者链传递，直到有对象处理 | 过滤器链、审批流程、中间件 |
| **命令模式**（Command） | 将请求封装为对象，支持参数化、队列化、日志化 | 任务队列、撤销/重做、宏命令 |
| **迭代器模式**（Iterator） | 顺序访问聚合对象的元素，不暴露内部表示 | 集合遍历 |
| **中介者模式**（Mediator） | 用中介对象封装一组对象的交互 | 聊天室、航空管制系统、GUI组件交互 |
| **备忘录模式**（Memento） | 捕获对象内部状态，并在之后恢复 | 撤销操作、游戏存档 |
| **观察者模式**（Observer） | 定义对象间一对多依赖，状态变化时自动通知 | 事件驱动系统、发布-订阅 |
| **状态模式**（State） | 对象内部状态改变时改变其行为 | 订单状态机、游戏角色状态 |
| **策略模式**（Strategy） | 定义一系列算法，将每个算法封装起来并可以互换 | 支付方式、排序算法、定价策略 |
| **模板方法模式**（Template Method） | 定义算法骨架，将某些步骤延迟到子类 | 框架扩展点、批处理流程 |
| **访问者模式**（Visitor） | 在不修改对象结构的前提下，定义作用于元素的新操作 | 编译器语法树、报表生成 |
| **解释器模式**（Interpreter） | 定义语言的文法表示，并构建解释器 | SQL解析、正则表达式、规则引擎 |

行为型模式的典型应用 —— 策略模式实现支付：

```java
// 策略接口
public interface PaymentStrategy {
    void pay(BigDecimal amount);
    String getName();
}

// 具体策略实现
public class AlipayStrategy implements PaymentStrategy {
    @Override
    public void pay(BigDecimal amount) {
        System.out.println("使用支付宝支付: ¥" + amount);
        // 调用支付宝API
    }

    @Override
    public String getName() {
        return "支付宝";
    }
}

public class WechatPayStrategy implements PaymentStrategy {
    @Override
    public void pay(BigDecimal amount) {
        System.out.println("使用微信支付: ¥" + amount);
        // 调用微信支付API
    }

    @Override
    public String getName() {
        return "微信支付";
    }
}

public class BankCardStrategy implements PaymentStrategy {
    @Override
    public void pay(BigDecimal amount) {
        System.out.println("使用银行卡支付: ¥" + amount);
        // 调用银行接口
    }

    @Override
    public String getName() {
        return "银行卡支付";
    }
}

// 上下文 —— 订单支付
public class Order {
    private String orderId;
    private BigDecimal amount;

    public Order(String orderId, BigDecimal amount) {
        this.orderId = orderId;
        this.amount = amount;
    }

    // 核心：支付方式由调用方决定，Order 不关心具体支付逻辑
    public void processPayment(PaymentStrategy strategy) {
        System.out.println("订单[" + orderId + "] 使用" + strategy.getName() + "，金额: ¥" + amount);
        strategy.pay(amount);
    }
}

// 客户端 —— 支付方式由用户选择
public class ShoppingApp {
    private static final Map<String, PaymentStrategy> PAYMENT_STRATEGIES = new HashMap<>();

    static {
        PAYMENT_STRATEGIES.put("alipay", new AlipayStrategy());
        PAYMENT_STRATEGIES.put("wechat", new WechatPayStrategy());
        PAYMENT_STRATEGIES.put("bankcard", new BankCardStrategy());
    }

    public static void main(String[] args) {
        Order order = new Order("ORD-20240101", new BigDecimal("299.00"));

        // 用户选择支付方式（实际项目中通常从前端传入）
        String userChoice = "wechat";
        PaymentStrategy strategy = PAYMENT_STRATEGIES.get(userChoice);

        if (strategy != null) {
            order.processPayment(strategy);
        } else {
            System.out.println("不支持的支付方式: " + userChoice);
        }
    }
}
```

### 1.2.4 GoF 23种模式全景图

```
GoF 设计模式 (23种)
│
├── 创建型模式 (Creational Patterns) —— 5种
│   ├── Singleton（单例模式）
│   │   确保一个类只有一个实例
│   │
│   ├── Factory Method（工厂方法模式）
│   │   子类决定实例化哪个类
│   │
│   ├── Abstract Factory（抽象工厂模式）
│   │   创建一系列相关对象
│   │
│   ├── Builder（建造者模式）
│   │   分步骤构建复杂对象
│   │
│   └── Prototype（原型模式）
│       克隆对象而非新建
│
├── 结构型模式 (Structural Patterns) —— 7种
│   ├── Adapter（适配器模式）
│   │   接口转换，兼容不兼容的接口
│   │
│   ├── Bridge（桥接模式）
│   │   分离抽象与实现
│   │
│   ├── Composite（组合模式）
│   │   树形结构，部分-整体层次
│   │
│   ├── Decorator（装饰器模式）
│   │   动态添加职责
│   │
│   ├── Facade（外观模式）
│   │   提供统一接口
│   │
│   ├── Proxy（代理模式）
│   │   控制对象访问
│   │
│   └── Flyweight（享元模式）
│       共享细粒度对象
│
└── 行为型模式 (Behavioral Patterns) —— 11种
    ├── Chain of Responsibility（责任链模式）
    │   请求沿链传递
    │
    ├── Command（命令模式）
    │   请求封装为对象
    │
    ├── Iterator（迭代器模式）
    │   顺序访问集合元素
    │
    ├── Mediator（中介者模式）
    │   中介封装对象交互
    │
    ├── Memento（备忘录模式）
    │   捕获和恢复状态
    │
    ├── Observer（观察者模式）
    │   一对多依赖通知
    │
    ├── State（状态模式）
    │   状态决定行为
    │
    ├── Strategy（策略模式）
    │   算法族可互换
    │
    ├── Template Method（模板方法模式）
    │   定义算法骨架
    │
    ├── Visitor（访问者模式）
    │   不修改结构添加操作
    │
    └── Interpreter（解释器模式）
        定义文法并解释
```

### 1.2.5 另一种分类视角：类模式 vs 对象模式

除了按目的分类，GoF还按**范围**（Scope）对模式进行了划分：

| 分类 | 关注点 | 实现机制 | 关系确定时机 | 示例 |
|------|--------|----------|--------------|------|
| **类模式** | 类和子类之间的关系 | 继承 | 编译时静态确定 | 模板方法、工厂方法、适配器（类适配器） |
| **对象模式** | 对象之间的关系 | 组合/聚合 | 运行时动态确定 | 策略、装饰器、代理、观察者等大部分模式 |

> 绝大多数 GoF 模式属于对象模式，这也是"优先使用组合而非继承"原则的体现。

## 1.3 设计模式与软件架构

### 1.3.1 设计模式与架构的关系

很多人会混淆"设计模式"和"软件架构"。正确理解二者的关系，有助于在实践中更好地使用它们。

| 维度 | 软件架构 | 设计模式 |
|------|----------|----------|
| **关注层次** | 系统级别的结构和组织 | 类/对象级别的设计 |
| **决策范围** | 全局性，影响整个系统 | 局部性，影响特定模块 |
| **典型元素** | 模块、组件、服务、数据流 | 类、接口、对象、方法 |
| **变更成本** | 极高（修改架构代价大） | 相对较低 |
| **决策时机** | 项目早期确定大方向 | 开发过程中持续应用 |
| **示例** | 分层架构、微服务架构、事件驱动架构 | 工厂模式、观察者模式、策略模式 |

二者的关系可以理解为：

- **架构为设计模式提供上下文**：什么架构决定了需要什么设计模式。例如，分层架构中需要工厂模式来创建 DAO，而管道-过滤器架构中更适合责任链模式
- **设计模式是架构的建材**：一个优秀的架构是由多个恰当的设计模式组合而成的。它们是具体设计层面的解决方案
- **架构决策影响模式选择**：架构风格（如微服务 vs 单体）会直接影响哪些模式适用，哪些不适用

### 1.3.2 设计模式在分层架构中的应用

分层架构是 Java 企业应用中最常见的架构风格。下面展示设计模式在各层中的典型应用：

```
┌─────────────────────────────────────────────────────────────┐
│                    表现层 (Presentation Layer)              │
│                                                             │
│  模式: MVC, Front Controller, View Helper                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Controller   │─▶│   Service    │  │  View/Model  │     │
│  │ (策略模式)    │  │   (门面模式)  │  │  (观察者模式)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                    业务层 (Business Layer)                   │
│                                                             │
│  模式: Facade, Strategy, Template Method, State            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ OrderService │  │PricingStrategy│  │ OrderState   │     │
│  │ (门面模式)    │  │ (策略模式)    │  │ (状态模式)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                    持久层 (Persistence Layer)                │
│                                                             │
│  模式: Repository, DAO, Adapter, Proxy                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ UserRepository│  │  JdbcAdapter │  │ CacheProxy   │     │
│  │ (仓库模式)    │  │ (适配器模式)  │  │ (代理模式)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                    领域层 (Domain Layer)                     │
│                                                             │
│  模式: Entity, Value Object, Aggregate, Factory            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  User Entity │  │Address(VO)   │  │ UserFactory  │     │
│  │  (实体)      │  │ (值对象)      │  │ (工厂模式)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

下面是一个具体代码示例，展示策略模式+工厂模式在业务层中的组合使用：

```java
// 场景：电商系统中的优惠计算
// 需求：支持多种优惠策略（满减、折扣、赠品），且未来可能增加更多类型

// 优惠策略接口
public interface DiscountStrategy {
    BigDecimal calculateDiscount(Order order);
    String getDescription();
}

// 满减策略
public class FullReductionStrategy implements DiscountStrategy {
    private final BigDecimal threshold;
    private final BigDecimal reduction;

    public FullReductionStrategy(BigDecimal threshold, BigDecimal reduction) {
        this.threshold = threshold;
        this.reduction = reduction;
    }

    @Override
    public BigDecimal calculateDiscount(Order order) {
        if (order.getTotalAmount().compareTo(threshold) >= 0) {
            return reduction;
        }
        return BigDecimal.ZERO;
    }

    @Override
    public String getDescription() {
        return "满" + threshold + "减" + reduction;
    }
}

// 百分比折扣策略
public class PercentageDiscountStrategy implements DiscountStrategy {
    private final BigDecimal percentage;

    public PercentageDiscountStrategy(BigDecimal percentage) {
        this.percentage = percentage;
    }

    @Override
    public BigDecimal calculateDiscount(Order order) {
        return order.getTotalAmount().multiply(percentage)
                .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
    }

    @Override
    public String getDescription() {
        return "折扣率 " + percentage + "%";
    }
}

// 策略工厂 —— 将策略的选择与创建封装在一起
public class DiscountStrategyFactory {
    private static final Map<String, DiscountStrategy> STRATEGIES = new HashMap<>();

    static {
        STRATEGIES.put("FULL_100_20", new FullReductionStrategy(
                new BigDecimal("100"), new BigDecimal("20")));
        STRATEGIES.put("FULL_200_50", new FullReductionStrategy(
                new BigDecimal("200"), new BigDecimal("50")));
        STRATEGIES.put("PERCENT_10", new PercentageDiscountStrategy(
                new BigDecimal("10")));
        STRATEGIES.put("PERCENT_20", new PercentageDiscountStrategy(
                new BigDecimal("20")));
    }

    public static DiscountStrategy getStrategy(String code) {
        DiscountStrategy strategy = STRATEGIES.get(code);
        if (strategy == null) {
            throw new IllegalArgumentException("未知的优惠策略: " + code);
        }
        return strategy;
    }

    // 支持运行时动态注册新策略（符合开闭原则）
    public static void registerStrategy(String code, DiscountStrategy strategy) {
        STRATEGIES.put(code, strategy);
    }
}

// 订单服务 —— 组合使用策略模式和工厂模式
public class OrderService {
    public BigDecimal calculateFinalAmount(Order order, String discountCode) {
        // 通过工厂获取策略（策略的选择逻辑在工厂中，遵循 SRP）
        DiscountStrategy strategy = DiscountStrategyFactory.getStrategy(discountCode);
        BigDecimal discount = strategy.calculateDiscount(order);

        System.out.println("订单金额: ¥" + order.getTotalAmount());
        System.out.println("优惠策略: " + strategy.getDescription());
        System.out.println("优惠金额: ¥" + discount);

        return order.getTotalAmount().subtract(discount);
    }
}
```

### 1.3.3 设计模式与架构模式

设计模式不应与**架构模式**（Architectural Patterns）混淆。架构模式是比设计模式更高层次的抽象，二者服务于不同层级的设计问题。

| 架构模式 | 典型用到的设计模式 | 关系说明 |
|----------|-------------------|----------|
| **MVC** | 观察者模式（Model-View）、策略模式（View-Controller）、组合模式（View层级） | MVC是一种架构模式，内部使用多种设计模式实现 |
| **分层架构** | 门面模式（层间通信）、依赖注入（跨层依赖）、工厂模式（对象创建） | 分层架构定义系统组织，设计模式实现各层内部细节 |
| **微服务架构** | 代理模式（服务网关）、断路器模式（容错）、事件驱动（观察者模式异步变体） | 微服务定义服务边界，设计模式实现服务内部和通信细节 |
| **事件驱动架构** | 观察者模式、命令模式、中介者模式 | 事件驱动是架构风格，设计模式提供了基础的通信机制 |
| **管道-过滤器架构** | 责任链模式、装饰器模式 | 每个过滤器是一个处理节点，管道连接各节点 |

**架构模式决定了"骨架"，设计模式填充了"血肉"。** 一个好的系统设计，必然是架构模式和设计模式的有机结合。

### 1.3.4 框架中的设计模式赏析

学习设计模式的最佳方式之一，是阅读主流框架源码，分析其中设计模式的应用。以下是一些经典例子。

**Spring Framework 中的设计模式**

| 设计模式 | Spring 中的应用 | 说明 |
|----------|----------------|------|
| 工厂方法 | BeanFactory、ApplicationContext | 从配置/注解创建和管理Bean |
| 单例模式 | 默认Bean Scope | 通过IoC容器保证单例 |
| 代理模式 | AOP、事务管理 | 动态代理实现横切关注点 |
| 模板方法 | JdbcTemplate、RestTemplate | 固定流程+可变步骤 |
| 观察者模式 | ApplicationEvent、@EventListener | 事件发布与监听 |
| 策略模式 | Resource接口（ClassPathResource等） | 统一的资源访问不同实现 |
| 适配器模式 | HandlerAdapter | 适配不同的Controller类型 |

**MyBatis 中的设计模式**

| 设计模式 | MyBatis 中的应用 | 说明 |
|----------|-----------------|------|
| 工厂方法 | SqlSessionFactory | 创建SqlSession |
| 建造者模式 | SqlSessionFactoryBuilder | 分步骤构建SqlSessionFactory |
| 代理模式 | MapperProxy | 为Mapper接口生成代理实现 |
| 装饰器模式 | Plugin（拦截器） | 包装Executor等核心对象 |
| 模板方法 | BaseExecutor | 定义查询骨架，子类实现具体逻辑 |

**JDK 核心类库中的设计模式**

```java
// 装饰器模式：InputStream 系列
InputStream in = new BufferedInputStream(          // 装饰：添加缓冲
                    new DataInputStream(            // 装饰：添加数据类型读取
                        new FileInputStream("a.txt") // 被装饰对象
                    )
                 );

// 适配器模式：Arrays.asList()
String[] array = {"A", "B", "C"};
List<String> list = Arrays.asList(array);  // 数组 → List 的适配

// 策略模式：Comparator
List<String> names = new ArrayList<>();
Collections.sort(names, (a, b) -> a.compareTo(b));  // 不同的Comparator就是不同策略

// 观察者模式：PropertyChangeSupport
PropertyChangeSupport support = new PropertyChangeSupport(this);
support.addPropertyChangeListener(evt ->
    System.out.println("属性变化: " + evt.getPropertyName()));
support.firePropertyChange("name", "oldValue", "newValue");

// 迭代器模式：Iterator / Iterable
for (String item : list) {  // foreach 语法糖基于迭代器模式
    System.out.println(item);
}
```

## 1.4 如何学习设计模式

### 1.4.1 学习路线图

设计模式的学习不是一蹴而就的，建议遵循"理解-模仿-应用-内化"的渐进路径：

```
阶段一：打基础（2-3周）
│
├── 熟练掌握面向对象编程（封装、继承、多态）
├── 理解七大设计原则（SOLID + LoD + CRP）
├── 学习 UML 类图和时序图的基本画法
└── 目标：能够分析代码的设计质量
│
阶段二：学模式（4-6周）
│
├── 按照"问题→原理→UML→代码→源码→场景→风险"七步法学习每种模式
├── 每种模式手写实现代码（不是复制粘贴！）
├── 对比相似模式的区别（如工厂方法 vs 抽象工厂）
├── 寻找JDK和Spring中的模式实现
└── 目标：能够独立实现每种模式并说出适用场景
│
阶段三：练实战（持续进行）
│
├── 在自己的项目中有意识地应用设计模式
├── 阅读开源项目源码，标注模式使用位置
├── 对现有代码进行重构，用设计模式改善设计
├── Code Review 中用设计模式的语言描述设计
└── 目标：遇到设计问题时能自然联想到合适的模式
│
阶段四：融会贯通（长期积累）
│
├── 理解模式之间的联系和组合
├── 建立"问题-模式"映射的直觉
├── 能根据上下文权衡不同模式的取舍
├── 形成个人的设计哲学
└── 目标：忘记具体的模式名称，记住解决问题的方法
```

### 1.4.2 每种模式的七步学习法

本书后续章节对每种模式都遵循以下七步结构，建议读者按此顺序深入：

```
第1步：明确问题
┌─────────────────────────────────────┐
│ 这个模式要解决什么具体问题？        │
│ 不用模式会有什么痛点？              │
│ 问题的本质特征是什么？              │
└─────────────────────────────────────┘
        ▼
第2步：理解原理
┌─────────────────────────────────────┐
│ 模式的核心思想是什么？              │
│ 解决了问题的哪个方面？              │
│ 为什么这种设计是有效的？            │
└─────────────────────────────────────┘
        ▼
第3步：UML分析
┌─────────────────────────────────────┐
│ 模式包含哪些角色？                  │
│ 角色之间的关联关系是什么？          │
│ 能否画出完整的类图和时序图？        │
└─────────────────────────────────────┘
        ▼
第4步：代码实现
┌─────────────────────────────────────┐
│ 用 Java 完整实现模式               │
│ 理解每一行代码的作用                │
│ 思考为什么这么设计                  │
└─────────────────────────────────────┘
        ▼
第5步：源码解析
┌─────────────────────────────────────┐
│ JDK 中哪里使用了该模式？           │
│ Spring/MyBatis中如何使用？          │
│ 开源项目中还有什么经典案例？        │
└─────────────────────────────────────┘
        ▼
第6步：使用场景
┌─────────────────────────────────────┐
│ 什么业务场景适合用该模式？          │
│ 什么情况下不应该用？                │
│ 真实项目案例是怎样的？              │
└─────────────────────────────────────┘
        ▼
第7步：风险与优化
┌─────────────────────────────────────┐
│ 模式有什么缺点和潜在风险？          │
│ 如何规避和优化？                    │
│ 有什么替代方案？                    │
└─────────────────────────────────────┘
```

### 1.4.3 核心学习原则

**原则一：先理解问题，再学习解决方案**

设计模式存在的唯一理由是因为它解决了一个真实存在的问题。如果跳过问题直接看代码，你会看到的是"一段绕来绕去的代码"而非"一个优雅的设计方案"。始终问自己："如果没有这个模式，代码会变成什么样？"

```java
// 如果不理解"策略模式解决的问题"，你会觉得这是过度设计：
// "不就一个if-else的事吗，至于定义这么多接口和类吗？"

// 但当你经历过：
// - 每种支付方式有几十行代码
// - 频繁增加新的支付方式
// - 支付逻辑散落在多个地方需要同步修改
// 你就会理解策略模式的价值
```

**原则二：手写代码，而非复制粘贴**

阅读代码和亲手写代码是完全不同的学习体验。手写过程中你会遇到：
- 方法签名该怎么设计？
- 参数类型用什么？
- 访问修饰符是public还是protected？
- 异常该怎么处理？

这些问题在看别人代码时可能会被忽略，但手写时会暴露出来。

**原则三：不要为了模式而模式**

```java
// 反面教材：为了使用设计模式，把简单的事情复杂化
// 需求：输出 "Hello, World!"
public interface MessageStrategy { void execute(); }
public class HelloWorldStrategy implements MessageStrategy { ... }
public class MessageContext { ... }
// 一个 System.out.println 能解决的问题，搞了3个类

// 记住：设计模式是为复杂性服务的，不要为简单问题引入不必要的复杂性
```

**原则四：阅读框架源码**

Spring、MyBatis 等框架是设计模式的"活教材"。当你亲眼看到设计模式在工业级代码中的应用时，理解会更加深刻。建议的阅读顺序：

1. 先学习设计模式的基本概念
2. 然后去框架源码中搜索该模式的应用
3. 分析框架为什么在那个地方使用该模式
4. 思考如果不使用该模式，框架会变成什么样

**原则五：重视相似模式的辨析**

很多设计模式看起来很相似，理解它们的区别是真正掌握的标志：

| 相似的模式对 | 根本区别 |
|-------------|----------|
| 工厂方法 vs 抽象工厂 | 工厂方法是"一个产品等级"，抽象工厂是"多个产品等级" |
| 策略模式 vs 状态模式 | 策略是"客户端选择行为"，状态是"对象自身状态决定行为" |
| 装饰器 vs 代理 | 装饰器"增强功能"，代理"控制访问" |
| 适配器 vs 桥接 | 适配器"事后补救"，桥接"事前设计" |
| 模板方法 vs 策略 | 模板方法用"继承"，策略用"组合" |

### 1.4.4 常见误区与避免方法

| 误区 | 表现 | 正确做法 |
|------|------|----------|
| **模式万能论** | 认为设计模式能解决所有问题，遇到需求先想用什么模式 | 先分析问题本质，再考虑是否需要模式。很多好的设计并不符合已知的任何模式 |
| **模式堆砌** | 在一个类中同时使用4-5种模式 | 模式组合是高级技巧，初学者应专注于单一模式的应用 |
| **教条主义** | 严格遵守模式结构，即使场景不完全匹配 | 模式是蓝图，可以根据实际情况调整。半模式（Pattern-ish）往往比纯模式更实用 |
| **轻视简单设计** | 认为简单的if-else就是不好的代码 | 如果问题本身简单，简单的解决方案就是最好的设计 |
| **过早抽象** | 在第一版代码中就引入大量接口和工厂 | 遵循"Rule of Three"：第一次实现直接用简单方案，第三次出现同样模式时才抽象 |
| **记住模式名称就算学会** | 能背出23种模式名称和定义，但遇到实际问题不会用 | 重点理解每种模式解决的问题和解决问题的思路，而非名称和定义 |

### 1.4.5 学习工具与资源

除了本书，以下资源可以辅助你学习设计模式：

- **经典书籍**：《Design Patterns: Elements of Reusable Object-Oriented Software》（GoF原著，进阶必读）
- **Java源码**：JDK源码（java.io.\*, java.util.\*, java.lang.\*）
- **开源框架**：Spring Framework、MyBatis、Guava 等
- **在线图表工具**：PlantUML（本书UML图使用PlantUML绘制）
- **练习平台**：LeetCode设计题、开源项目PR贡献

## 本章小结

本章从宏观角度介绍了设计模式的整体框架，为后续深入学习每种模式奠定基础：

1. **设计模式的定义**：设计模式源于建筑学界Christopher Alexander的模式思想，由GoF引入软件工程。它是经过验证的、可复用的设计经验总结

2. **设计模式的四要素**：模式名称、问题描述、解决方案、效果。理解这四个要素比记住模式代码更重要

3. **GoF的三种分类**：
   - **创建型模式**（5种）：抽象对象创建过程，使系统与具体类解耦
   - **结构型模式**（7种）：通过组合类和对象形成更大的结构
   - **行为型模式**（11种）：描述对象之间的通信和职责分配

4. **设计模式与架构的关系**：设计模式是微观层面的设计工具，架构是宏观层面的系统组织，二者相辅相成

5. **学习设计模式的方法**：先理解问题，再学习解决方案；手写代码而非复制粘贴；读框架源码；辨析相似模式

6. **核心心态**：设计模式是工具而非目标，好的设计源于对问题的理解，而非模式的堆砌

---

在下一章中，我们将深入学习面向对象设计的七大原则。这些原则是设计模式的理论基础，理解了它们，你会发现设计模式不再是孤立的技巧，而是这些原则在不同场景下的自然延伸。
