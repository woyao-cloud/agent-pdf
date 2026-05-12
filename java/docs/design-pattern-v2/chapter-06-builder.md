# 第6章 建造者模式（Builder）

**建造者模式**（Builder Pattern）将一个复杂对象的构建与它的表示分离，使得同样的构建过程可以创建不同的表示。它是创建型模式中最实用的模式之一，尤其适用于那些拥有大量可选参数的对象创建场景。

## 6.1 解决的问题与应用场景

### 6.1.1 问题分析

在软件开发中，我们经常面临这样的困境：一个对象拥有大量属性，其中部分属性是必填的，部分是可选的。如果直接使用构造函数来创建对象，通常会陷入以下两种反模式。

**反模式一：重叠构造器（Telescoping Constructor）**

当参数排列组合增多时，构造器数量呈爆炸式增长。

```java
// 重叠构造器：每增加一个可选参数，就需要一个新的构造器重载
public class Computer {
    private String cpu;          // 必填
    private String ram;          // 必填
    private String storage;      // 必填
    private String gpu;          // 选填
    private String monitor;      // 选填
    private String keyboard;     // 选填
    private String mouse;        // 选填
    private String speaker;      // 选填
    private String os;           // 选填
    private Integer warranty;    // 选填

    public Computer(String cpu, String ram, String storage) {
        this(cpu, ram, storage, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu) {
        this(cpu, ram, storage, gpu, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu, String monitor) {
        this(cpu, ram, storage, gpu, monitor, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu,
                    String monitor, String keyboard) {
        this(cpu, ram, storage, gpu, monitor, keyboard, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu,
                    String monitor, String keyboard, String mouse) {
        this(cpu, ram, storage, gpu, monitor, keyboard, mouse, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu,
                    String monitor, String keyboard, String mouse, String speaker) {
        this(cpu, ram, storage, gpu, monitor, keyboard, mouse, speaker, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu,
                    String monitor, String keyboard, String mouse, String speaker,
                    String os) {
        this(cpu, ram, storage, gpu, monitor, keyboard, mouse, speaker, os, null);
    }

    public Computer(String cpu, String ram, String storage, String gpu,
                    String monitor, String keyboard, String mouse, String speaker,
                    String os, Integer warranty) {
        this.cpu = cpu;
        this.ram = ram;
        this.storage = storage;
        this.gpu = gpu;
        this.monitor = monitor;
        this.keyboard = keyboard;
        this.mouse = mouse;
        this.speaker = speaker;
        this.os = os;
        this.warranty = warranty;
    }
}
// 调用时难以理解：new Computer("i7", "16GB", "512GB", null, null, "Cherry", null, null, "Windows", 3)
// 每个null代表什么参数？极易出错！
```

**反模式二：JavaBeans模式（空构造器 + Setter）**

```java
// JavaBeans模式：对象状态在构造过程中不一致
Computer computer = new Computer();
computer.setCpu("Intel i7");
computer.setRam("16GB");
computer.setStorage("512GB SSD");
// 此时对象处于不完整状态，如果其他线程访问了该对象就会出问题
computer.setGpu("NVIDIA RTX 4060");
computer.setOs("Windows 11");

// 问题一：对象可能在构造过程中被使用（非线程安全）
// 问题二：无法保证必填字段被设置（无编译期检查）
// 问题三：对象不是不可变的（setter 可在任何时候被调用）
```

**建造者模式要解决的核心问题：**

1. **参数爆炸**：避免因参数过多导致构造器数量指数增长
2. **状态一致性**：对象在创建完毕之前不可用，避免中间状态暴露
3. **不可变性**：构造完成后的对象可以是不可变的（所有字段为 final）
4. **可读性**：通过链式调用，代码意图一目了然
5. **约束验证**：可以在 `build()` 方法中集中校验参数合法性

### 6.1.2 典型应用场景

**1. 复杂对象构建（含必填和大量可选字段）**

```java
// 使用建造者模式，必填与可选一目了然
Computer computer = Computer.builder("Intel i7", "16GB", "1TB SSD")
    .gpu("NVIDIA RTX 4060")
    .monitor("Dell 27\" 4K")
    .os("Windows 11")
    .warranty(36)
    .build();
```

**2. 步骤化构建（每一步可能依赖前一步的结果）**

```java
// 先创建基本配置，再逐步添加组件
Pizza pizza = Pizza.builder("Medium")
    .crust(Crust.THIN)
    .sauce(Sauce.TOMATO)
    .addTopping(Topping.PEPPERONI)
    .addTopping(Topping.MUSHROOM)
    .extraCheese(true)
    .build();
```

**3. 同一构建过程，不同表示**

```java
// 同一个构建过程，可以产出 JSON、XML、CSV 等多种格式的请求体
HttpRequestBuilder builder = new HttpRequestBuilder()
    .method(Method.POST)
    .url("https://api.example.com/data")
    .addParam("name", "张三")
    .addParam("age", "30");

// 同一个 builder，不同的终端构建
String jsonBody = builder.buildJson();
String xmlBody = builder.buildXml();
String formBody = builder.buildForm();
```

**4. 配置对象的声明式构建**

```java
DataSourceConfig config = DataSourceConfig.builder()
    .url("jdbc:mysql://localhost:3306/mydb")
    .username("root")
    .password("secret")
    .minPoolSize(5)
    .maxPoolSize(20)
    .connectionTimeout(Duration.ofSeconds(30))
    .idleTimeout(Duration.ofMinutes(10))
    .build();
```

## 6.2 实现原理与UML

### 6.2.1 核心思想

建造者模式将一个复杂对象的**构建过程**（how to build）与**表示**（what is built）分离。核心思路是：

1. 将对象的构造过程分解为一系列**细粒度的步骤**
2. 每个步骤可以独立调用，按需组合
3. 最终通过 `build()` 方法一次性完成对象的实例化和校验

### 6.2.2 UML 类图

```
┌─────────────────────────────────────┐
│              Director               │
│            （指挥者）                │
├─────────────────────────────────────┤
│ - builder: Builder                  │
├─────────────────────────────────────┤
│ + construct(): Product              │
│ + constructMinimal(): Product       │
│ + constructFull(): Product          │
└──────────────┬──────────────────────┘
               │ 使用
               ▼
┌─────────────────────────────────────┐
│            Builder                  │
│         （抽象建造者）               │
├─────────────────────────────────────┤
│ + buildPartA(): void                │
│ + buildPartB(): void                │
│ + buildPartC(): void                │
│ + getResult(): Product              │
└─────────────────────────────────────┘
               ▲
               │ 实现
    ┌──────────┴──────────┐
    │                     │
┌───┴───────────────┐  ┌──┴─────────────────┐
│ ConcreteBuilderA  │  │ ConcreteBuilderB    │
│  （具体建造者A）   │  │  （具体建造者B）     │
├───────────────────┤  ├─────────────────────┤
│ + buildPartA()    │  │ + buildPartA()      │
│ + buildPartB()    │  │ + buildPartB()      │
│ + getResult()     │  │ + getResult()       │
└───────────────────┘  └─────────────────────┘
    │ 构建                    │ 构建
    ▼                         ▼
┌─────────────────────────────────────────┐
│               Product                   │
│              （产品）                    │
├─────────────────────────────────────────┤
│ - partA: String                         │
│ - partB: String                         │
│ - partC: String                         │
├─────────────────────────────────────────┤
│ + getPartA(): String                    │
│ + getPartB(): String                    │
│ + getPartC(): String                    │
└─────────────────────────────────────────┘
```

### 6.2.3 角色分析

| 角色 | 说明 | 职责 |
|------|------|------|
| **Product**（产品） | 待构建的复杂对象 | 定义对象的属性和行为，通常使用私有构造函数确保只能通过 Builder 创建 |
| **Builder**（抽象建造者） | 构建步骤的接口/抽象类 | 声明构建产品各部件的抽象方法，以及获取最终产品的方法 |
| **ConcreteBuilder**（具体建造者） | Builder 的具体实现 | 实现各个构建步骤，持有产品的内部表示，提供产品检索接口 |
| **Director**（指挥者，可选） | 协调建造过程 | 封装特定的构建流程/顺序，将一套固定的构建步骤封装为可复用的方法 |

### 6.2.4 两种变体

现代 Java 开发中，Builder 模式演化为两种主要变体：

**变体一：经典模式（含 Director）**

适用于"同一套构建步骤，不同的具体实现"的场景。例如：不同类型的电脑（办公电脑、游戏电脑、服务器）都按 CPU -> RAM -> 存储 -> GPU 的顺序组装，但每个部件的具体型号不同。

**变体二：Fluent Builder（流式建造者，无 Director）**

适用于"同一个产品类，不同的配置组合"的场景。Director 被省略，客户端直接调用 Builder 的链式方法。这是目前最主流的使用方式，OkHttp、Spring 等框架均采用此方式。

### 6.2.5 时序图

```
Client              Director              ConcreteBuilder        Product
  │                     │                       │                    │
  │  new ConcreteBuilder()                       │                    │
  │ ────────────────────────────────────────────▶│                    │
  │                     │                       │                    │
  │  new Director(builder)                       │                    │
  │ ───────────────────▶│                       │                    │
  │                     │                       │                    │
  │  construct()        │                       │                    │
  │ ───────────────────▶│                       │                    │
  │                     │                       │                    │
  │                     │  buildPartA()          │                    │
  │                     │ ─────────────────────▶│                    │
  │                     │                       │   setPartA()      │
  │                     │                       │ ─────────────────▶│
  │                     │                       │                    │
  │                     │  buildPartB()          │                    │
  │                     │ ─────────────────────▶│                    │
  │                     │                       │   setPartB()      │
  │                     │                       │ ─────────────────▶│
  │                     │                       │                    │
  │                     │  getResult()           │                    │
  │                     │ ─────────────────────▶│                    │
  │                     │                       │                    │
  │                     │       Product         │                    │
  │                     │ ◄─────────────────────│                    │
  │                     │                       │                    │
  │      Product        │                       │                    │
  │ ◄───────────────────│                       │                    │
  │                     │                       │                    │
```

## 6.3 代码实现

### 6.3.1 经典 Builder 模式（含 Director）

首先定义产品类 `Computer`，使用私有构造函数确保只能通过 Builder 创建，并将所有字段设为 `final` 以保证不可变性。

```java
/**
 * 产品类：Computer（不可变对象）
 */
public class Computer {
    // 所有字段均为 final，确保不可变性
    private final String cpu;
    private final String ram;
    private final String storage;
    private final String gpu;
    private final String monitor;
    private final String keyboard;
    private final String mouse;
    private final String os;

    // 构造方法设为 private，只能通过 Builder 创建
    private Computer(Builder builder) {
        this.cpu = builder.cpu;
        this.ram = builder.ram;
        this.storage = builder.storage;
        this.gpu = builder.gpu;
        this.monitor = builder.monitor;
        this.keyboard = builder.keyboard;
        this.mouse = builder.mouse;
        this.os = builder.os;
    }

    // 仅提供 getter，不提供 setter
    public String getCpu()        { return cpu; }
    public String getRam()        { return ram; }
    public String getStorage()    { return storage; }
    public String getGpu()        { return gpu; }
    public String getMonitor()    { return monitor; }
    public String getKeyboard()   { return keyboard; }
    public String getMouse()      { return mouse; }
    public String getOs()         { return os; }

    @Override
    public String toString() {
        return "Computer{cpu='" + cpu + "', ram='" + ram
            + "', storage='" + storage + "', gpu='" + gpu
            + "', monitor='" + monitor + "', keyboard='" + keyboard
            + "', mouse='" + mouse + "', os='" + os + "'}";
    }

    /**
     * 静态内部类：Builder
     * 每个字段提供 Fluent API 风格的 setter
     */
    public static class Builder {
        // 必填字段
        private final String cpu;
        private final String ram;
        private final String storage;

        // 可选字段（提供默认值或保持 null）
        private String gpu = "集成显卡";
        private String monitor = "标准显示器";
        private String keyboard = "标准键盘";
        private String mouse = "标准鼠标";
        private String os = "无操作系统";

        // 必填字段通过 Builder 构造函数强制传入
        public Builder(String cpu, String ram, String storage) {
            this.cpu = cpu;
            this.ram = ram;
            this.storage = storage;
        }

        // 每个可选字段的 fluent setter，返回 Builder 自身实现链式调用
        public Builder gpu(String gpu) {
            this.gpu = gpu;
            return this;
        }

        public Builder monitor(String monitor) {
            this.monitor = monitor;
            return this;
        }

        public Builder keyboard(String keyboard) {
            this.keyboard = keyboard;
            return this;
        }

        public Builder mouse(String mouse) {
            this.mouse = mouse;
            return this;
        }

        public Builder os(String os) {
            this.os = os;
            return this;
        }

        // build() 方法：集中验证 + 创建产品
        public Computer build() {
            // 参数校验
            if (cpu == null || cpu.isEmpty()) {
                throw new IllegalStateException("CPU 为必填项");
            }
            if (ram == null || ram.isEmpty()) {
                throw new IllegalStateException("内存为必填项");
            }
            if (storage == null || storage.isEmpty()) {
                throw new IllegalStateException("存储为必填项");
            }
            return new Computer(this);
        }
    }

    // 便捷的静态工厂方法入口
    public static Builder builder(String cpu, String ram, String storage) {
        return new Builder(cpu, ram, storage);
    }
}
```

接下来是抽象建造者接口和具体建造者实现，配合 Director 完成固定流程的构建。

```java
/**
 * 抽象建造者接口
 */
public interface ComputerBuilder {
    ComputerBuilder buildCpu();
    ComputerBuilder buildRam();
    ComputerBuilder buildStorage();
    ComputerBuilder buildGpu();
    ComputerBuilder buildPeripherals();
    Computer getResult();
}
```

```java
/**
 * 具体建造者：游戏电脑
 */
public class GamingComputerBuilder implements ComputerBuilder {
    private String cpu;
    private String ram;
    private String storage;
    private String gpu;
    private String monitor;
    private String keyboard;
    private String mouse;

    @Override
    public ComputerBuilder buildCpu() {
        this.cpu = "Intel Core i9-14900K";
        return this;
    }

    @Override
    public ComputerBuilder buildRam() {
        this.ram = "64GB DDR5 6000MHz";
        return this;
    }

    @Override
    public ComputerBuilder buildStorage() {
        this.storage = "2TB NVMe SSD";
        return this;
    }

    @Override
    public ComputerBuilder buildGpu() {
        this.gpu = "NVIDIA RTX 4090 24GB";
        return this;
    }

    @Override
    public ComputerBuilder buildPeripherals() {
        this.monitor = "ROG 32\" 4K 144Hz";
        this.keyboard = "Cherry MX 机械键盘";
        this.mouse = "Logitech G502";
        return this;
    }

    @Override
    public Computer getResult() {
        return new Computer.Builder(cpu, ram, storage)
            .gpu(gpu)
            .monitor(monitor)
            .keyboard(keyboard)
            .mouse(mouse)
            .os("Windows 11 Pro")
            .build();
    }
}
```

```java
/**
 * 具体建造者：办公电脑
 */
public class OfficeComputerBuilder implements ComputerBuilder {
    private String cpu;
    private String ram;
    private String storage;
    private String gpu;
    private String monitor;
    private String keyboard;
    private String mouse;

    @Override
    public ComputerBuilder buildCpu() {
        this.cpu = "Intel Core i5-13400";
        return this;
    }

    @Override
    public ComputerBuilder buildRam() {
        this.ram = "16GB DDR4 3200MHz";
        return this;
    }

    @Override
    public ComputerBuilder buildStorage() {
        this.storage = "512GB NVMe SSD";
        return this;
    }

    @Override
    public ComputerBuilder buildGpu() {
        this.gpu = "集成显卡 UHD 730";
        return this;
    }

    @Override
    public ComputerBuilder buildPeripherals() {
        this.monitor = "Dell 24\" 1080p";
        this.keyboard = "Dell 标准键盘";
        this.mouse = "Dell 标准鼠标";
        return this;
    }

    @Override
    public Computer getResult() {
        return new Computer.Builder(cpu, ram, storage)
            .gpu(gpu)
            .monitor(monitor)
            .keyboard(keyboard)
            .mouse(mouse)
            .os("Windows 11 Home")
            .build();
    }
}
```

```java
/**
 * Director：封装固定的构建流程
 */
public class ComputerDirector {

    /**
     * 标准构建流程：按 CPU -> 内存 -> 存储 -> GPU -> 外设顺序构建
     */
    public Computer constructStandard(ComputerBuilder builder) {
        return builder
            .buildCpu()
            .buildRam()
            .buildStorage()
            .buildGpu()
            .buildPeripherals()
            .getResult();
    }

    /**
     * 精简构建：只组装核心部件，不含外设
     */
    public Computer constructCore(ComputerBuilder builder) {
        return builder
            .buildCpu()
            .buildRam()
            .buildStorage()
            .getResult();
    }
}
```

```java
/**
 * 客户端使用示例
 */
public class BuilderDemo {
    public static void main(String[] args) {
        // === 方式一：直接使用 Fluent Builder（无 Director）===
        Computer myPc = Computer.builder("Intel i7-14700K", "32GB DDR5", "1TB SSD")
            .gpu("NVIDIA RTX 4070")
            .monitor("LG 27\" 2K")
            .os("Windows 11 Pro")
            .build();
        System.out.println(myPc);

        // === 方式二：使用 Director + ConcreteBuilder ===
        ComputerDirector director = new ComputerDirector();

        Computer gamingPc = director.constructStandard(new GamingComputerBuilder());
        System.out.println("游戏电脑: " + gamingPc);

        Computer officePc = director.constructStandard(new OfficeComputerBuilder());
        System.out.println("办公电脑: " + officePc);
    }
}
```

### 6.3.2 不可变产品与可变产品的对比

**不可变产品（推荐）**

```java
public class ImmutableServerConfig {
    private final String host;
    private final int port;
    private final int maxConnections;
    private final Duration timeout;

    private ImmutableServerConfig(Builder builder) {
        this.host = builder.host;
        this.port = builder.port;
        this.maxConnections = builder.maxConnections;
        this.timeout = builder.timeout;
    }

    public static class Builder {
        private String host;
        private int port = 8080;
        private int maxConnections = 100;
        private Duration timeout = Duration.ofSeconds(30);

        public Builder host(String host) {
            this.host = host;
            return this;
        }

        public Builder port(int port) {
            this.port = port;
            return this;
        }

        public Builder maxConnections(int maxConnections) {
            this.maxConnections = maxConnections;
            return this;
        }

        public Builder timeout(Duration timeout) {
            this.timeout = timeout;
            return this;
        }

        public ImmutableServerConfig build() {
            if (host == null || host.isEmpty()) {
                throw new IllegalStateException("host 为必填项");
            }
            return new ImmutableServerConfig(this);
        }
    }
}
```

**可变产品（灵活但需要谨慎使用）**

```java
public class MutableServerConfig {
    private String host;
    private int port;
    private int maxConnections;
    private Duration timeout;

    public MutableServerConfig() {
        this.port = 8080;
        this.maxConnections = 100;
        this.timeout = Duration.ofSeconds(30);
    }

    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }

    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }

    public int getMaxConnections() { return maxConnections; }
    public void setMaxConnections(int maxConnections) { this.maxConnections = maxConnections; }

    public Duration getTimeout() { return timeout; }
    public void setTimeout(Duration timeout) { this.timeout = timeout; }

    // Builder 用于一次性填充可变产品
    public static class Builder {
        private final MutableServerConfig config = new MutableServerConfig();

        public Builder host(String host) {
            config.setHost(host);
            return this;
        }

        public Builder port(int port) {
            config.setPort(port);
            return this;
        }

        public Builder maxConnections(int maxConnections) {
            config.setMaxConnections(maxConnections);
            return this;
        }

        public Builder timeout(Duration timeout) {
            config.setTimeout(timeout);
            return this;
        }

        public MutableServerConfig build() {
            if (config.getHost() == null) {
                throw new IllegalStateException("host 为必填项");
            }
            return config;
        }
    }
}
```

### 6.3.3 Lombok @Builder 风格

使用 Lombok 可以大幅减少模板代码。以下是等价实现：

```java
import lombok.Builder;
import lombok.Getter;
import lombok.ToString;

@Getter
@ToString
@Builder
public class ComputerLombok {
    @lombok.NonNull  // Lombok 生成的 Builder 会自动进行非空校验
    private final String cpu;

    @lombok.NonNull
    private final String ram;

    @lombok.NonNull
    private final String storage;

    @Builder.Default   // 默认值
    private final String gpu = "集成显卡";

    private final String monitor;
    private final String keyboard;
    private final String mouse;

    @Builder.Default
    private final String os = "无操作系统";
}

// Lombok 自动生成的使用方式：
// ComputerLombok pc = ComputerLombok.builder()
//     .cpu("i7")
//     .ram("16GB")
//     .storage("512GB")
//     .gpu("RTX 4060")
//     .build();
```

Lombok 的 `@Builder` 注解会在编译期自动生成一个名为 `ComputerLombokBuilder` 的静态内部类，包含与产品字段一一对应的 fluent setter。如果字段使用了 `@Builder.Default` 注解，生成的 Builder 会使用该默认值作为字段初始值。

### 6.3.4 支持继承的 Builder 模式

当产品类存在继承关系时，Builder 也需要支持继承。以下是通过泛型实现的可继承 Builder。

```java
/**
 * 基础产品类：Vehicle
 */
public abstract class Vehicle {
    protected final String brand;
    protected final String model;
    protected final int year;

    protected Vehicle(AbstractBuilder<?, ?> builder) {
        this.brand = builder.brand;
        this.model = builder.model;
        this.year = builder.year;
    }

    /**
     * 泛型 Builder 基类，使用递归泛型边界支持继承
     * T: Builder 的具体子类型（用于链式返回）
     * V: 要构建的产品类型
     */
    abstract static class AbstractBuilder<T extends AbstractBuilder<T, V>, V extends Vehicle> {
        String brand;
        String model;
        int year;

        @SuppressWarnings("unchecked")
        public T brand(String brand) { this.brand = brand; return (T) this; }

        @SuppressWarnings("unchecked")
        public T model(String model) { this.model = model; return (T) this; }

        @SuppressWarnings("unchecked")
        public T year(int year) { this.year = year; return (T) this; }

        public abstract V build();
    }
}
```

```java
/**
 * 子类产品：Car
 */
public class Car extends Vehicle {
    private final int numberOfDoors;
    private final boolean isElectric;

    private Car(CarBuilder builder) {
        super(builder);
        this.numberOfDoors = builder.numberOfDoors;
        this.isElectric = builder.isElectric;
    }

    public static CarBuilder builder() {
        return new CarBuilder();
    }

    public static class CarBuilder extends AbstractBuilder<CarBuilder, Car> {
        private int numberOfDoors = 4;
        private boolean isElectric = false;

        public CarBuilder numberOfDoors(int doors) {
            this.numberOfDoors = doors;
            return this;
        }

        public CarBuilder isElectric(boolean electric) {
            this.isElectric = electric;
            return this;
        }

        @Override
        public Car build() {
            if (brand == null) throw new IllegalStateException("品牌为必填项");
            if (model == null) throw new IllegalStateException("型号为必填项");
            return new Car(this);
        }
    }
}
```

```java
/**
 * 子类产品：Motorcycle
 */
public class Motorcycle extends Vehicle {
    private final boolean hasSidecar;
    private final String engineType;

    private Motorcycle(MotorcycleBuilder builder) {
        super(builder);
        this.hasSidecar = builder.hasSidecar;
        this.engineType = builder.engineType;
    }

    public static MotorcycleBuilder builder() {
        return new MotorcycleBuilder();
    }

    public static class MotorcycleBuilder extends AbstractBuilder<MotorcycleBuilder, Motorcycle> {
        private boolean hasSidecar = false;
        private String engineType = "燃油";

        public MotorcycleBuilder hasSidecar(boolean hasSidecar) {
            this.hasSidecar = hasSidecar;
            return this;
        }

        public MotorcycleBuilder engineType(String engineType) {
            this.engineType = engineType;
            return this;
        }

        @Override
        public Motorcycle build() {
            if (brand == null) throw new IllegalStateException("品牌为必填项");
            return new Motorcycle(this);
        }
    }
}

// 使用示例：
// Car car = Car.builder().brand("Tesla").model("Model 3").isElectric(true).build();
// Motorcycle bike = Motorcycle.builder().brand("Honda").model("CB650R").build();
```

## 6.4 JDK/框架源码解析

### 6.4.1 StringBuilder / StringBuffer

`StringBuilder` 和 `StringBuffer` 是 JDK 中最直观的 Builder 模式简化版。它们的 `append()` 方法都返回 `this`，支持链式调用，最终通过 `toString()` 获得构建结果。

```java
// StringBuilder 的每个 append 方法都返回 this（链式调用核心）
StringBuilder sb = new StringBuilder();
sb.append("SELECT ")
  .append("id, name, email ")
  .append("FROM users ")
  .append("WHERE status = 'ACTIVE' ");
String sql = sb.toString();  // 最终 "构建" 出完整的 SQL 字符串

// StringBuilder 源码中的关键设计（简化）：
// public StringBuilder append(String str) {
//     super.append(str);  // 调用父类 AbstractStringBuilder
//     return this;         // 返回自身，实现链式调用
// }
```

StringBuilder 是 Builder 模式的一个**不完整实现**：它缺少 Director 角色，也没有"组装多个部件"的过程，但它完美展示了链式调用的核心机制 -- 每个构建步骤返回 Builder 自身。

### 6.4.2 java.util.Calendar.Builder

JDK 8 中为 `Calendar` 添加了 `Calendar.Builder`，是一个标准的 Builder 模式实现。

```java
import java.util.Calendar;

// 使用 Calendar.Builder 构建指定日期
Calendar calendar = new Calendar.Builder()
    .set(Calendar.YEAR, 2026)
    .set(Calendar.MONTH, Calendar.MAY)
    .set(Calendar.DAY_OF_MONTH, 12)
    .setTimeOfDay(14, 30, 0)
    .set(Calendar.MILLISECOND, 0)
    .build();

System.out.println(calendar.getTime());  // Mon May 12 14:30:00 CST 2026
```

与直接使用 `Calendar.set()` 方法不同的是，`Calendar.Builder` 允许你在调用 `build()` 之前进行多次设置，设置过程中不会触发任何日期计算，避免了中间状态不一致的问题。

### 6.4.3 Locale.Builder

JDK 7 中的 `java.util.Locale.Builder` 展示了如何为原本不可变的对象提供 Builder 接口。

```java
import java.util.Locale;

// 通过 Builder 组装 Locale
Locale locale = new Locale.Builder()
    .setLanguage("zh")
    .setRegion("CN")
    .setScript("Hans")
    .build();

System.out.println(locale.toLanguageTag());      // zh-Hans-CN
System.out.println(locale.getDisplayCountry());  // 中国
```

### 6.4.4 Spring 的 UriComponentsBuilder

Spring Framework 中的 `UriComponentsBuilder` 使用了 Builder + Fluent API 的组合，用于动态构建 URI。

```java
import org.springframework.web.util.UriComponentsBuilder;

// 基本用法
String uri1 = UriComponentsBuilder.newInstance()
    .scheme("https")
    .host("api.example.com")
    .path("/v1/users")
    .queryParam("page", 1)
    .queryParam("size", 20)
    .queryParam("sort", "name")
    .build()
    .toUriString();
System.out.println(uri1);
// https://api.example.com/v1/users?page=1&size=20&sort=name

// 支持路径变量
String uri2 = UriComponentsBuilder.fromUriString("https://api.example.com")
    .pathSegment("v1", "users", "{userId}")       // 自动追加 /
    .pathSegment("orders")
    .buildAndExpand("12345")                       // 填充路径变量
    .toUriString();
System.out.println(uri2);
// https://api.example.com/v1/users/12345/orders

// 支持编码
String uri3 = UriComponentsBuilder.newInstance()
    .scheme("https")
    .host("example.com")
    .path("/搜索")
    .build(true)              // true = 已编码，无需再次编码
    .toUriString();
System.out.println(uri3);
// https://example.com/%E6%90%9C%E7%B4%A2
```

### 6.4.5 Spring 的 MockMvcRequestBuilders

Spring MVC Test 中的 `MockMvcRequestBuilders` 同样使用了 Builder 模式构建 HTTP 测试请求。

```java
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.http.MediaType;

// 构建 POST 请求
var request = MockMvcRequestBuilders
    .post("/api/users")
    .contentType(MediaType.APPLICATION_JSON)
    .accept(MediaType.APPLICATION_JSON)
    .content("{\"name\":\"张三\",\"email\":\"zhangsan@example.com\"}")
    .header("X-Request-Id", "uuid-12345");
```

### 6.4.6 OkHttp 的 Request.Builder

OkHttp 是 Builder 模式的典范，它的 `Request.Builder` 展示了如何为一个不可变的 HTTP 请求对象提供优雅的构建接口。

```java
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

// 构建 GET 请求
Request getRequest = new Request.Builder()
    .url("https://api.github.com/users/octocat")
    .header("Accept", "application/vnd.github.v3+json")
    .get()                                    // 显式标记为 GET
    .build();

// 构建 POST 请求
RequestBody body = RequestBody.create(
    "{\"title\":\"foo\",\"body\":\"bar\"}",
    MediaType.parse("application/json; charset=utf-8")
);

Request postRequest = new Request.Builder()
    .url("https://jsonplaceholder.typicode.com/posts")
    .post(body)
    .addHeader("Content-Type", "application/json")
    .build();

// 发送请求
OkHttpClient client = new OkHttpClient();
// Response response = client.newCall(postRequest).execute();
```

OkHttp 中 `Request` 是不可变的（所有字段 final），而 `Request.Builder` 是可变的 -- 这是 Builder 模式中"不可变产品 + 可变 Builder"的典型实践。

### 6.4.7 MyBatis 的 SqlSessionFactoryBuilder

MyBatis 中的 `SqlSessionFactoryBuilder` 使用 Builder 模式来构建 `SqlSessionFactory`，将繁重的 XML 解析和配置加载工作封装在构建过程中。

```java
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;

// 从 XML 配置文件构建 SqlSessionFactory
String resource = "mybatis-config.xml";
InputStream inputStream = Resources.getResourceAsStream(resource);
SqlSessionFactory sqlSessionFactory =
    new SqlSessionFactoryBuilder().build(inputStream);

// SqlSessionFactoryBuilder 的 build() 方法内部完成：
// 1. 读取并解析 XML 配置文件
// 2. 加载所有 mapper 映射
// 3. 初始化数据库连接池配置
// 4. 创建并返回 SqlSessionFactory 实例
// 这就是"将复杂构建过程封装在 Builder 中"的典型实践
```

MyBatis 的 `SqlSessionFactoryBuilder` 设计为"一次性使用"：创建完 `SqlSessionFactory` 之后就可以丢弃，因为 `SqlSessionFactory` 本身已经是完备的、不可变的对象。

## 6.5 使用场景与案例

### 6.5.1 HTTP 请求构建器（REST API 客户端）

在企业级 REST API 客户端中，Builder 模式可以用来构建复杂且可复用的 HTTP 请求。

```java
/**
 * 面向业务语义的 HTTP 请求构建器
 */
public class HttpRequest {
    private final String method;
    private final String url;
    private final Map<String, String> headers;
    private final Map<String, String> queryParams;
    private final String body;
    private final int connectTimeout;
    private final int readTimeout;
    private final int maxRetries;

    private HttpRequest(Builder builder) {
        this.method = builder.method;
        this.url = builder.url;
        this.headers = Collections.unmodifiableMap(new HashMap<>(builder.headers));
        this.queryParams = Collections.unmodifiableMap(new HashMap<>(builder.queryParams));
        this.body = builder.body;
        this.connectTimeout = builder.connectTimeout;
        this.readTimeout = builder.readTimeout;
        this.maxRetries = builder.maxRetries;
    }

    public String getMethod()        { return method; }
    public String getUrl()           { return url; }
    public Map<String, String> getHeaders()     { return headers; }
    public Map<String, String> getQueryParams() { return queryParams; }
    public String getBody()          { return body; }
    public int getConnectTimeout()   { return connectTimeout; }
    public int getReadTimeout()      { return readTimeout; }
    public int getMaxRetries()       { return maxRetries; }

    /**
     * 构建最终的 HTTP URL（含查询参数）
     */
    public String buildFullUrl() {
        if (queryParams.isEmpty()) {
            return url;
        }
        StringBuilder sb = new StringBuilder(url);
        if (!url.contains("?")) {
            sb.append("?");
        } else if (!url.endsWith("&") && !url.endsWith("?")) {
            sb.append("&");
        }
        queryParams.forEach((k, v) -> sb.append(encode(k)).append("=").append(encode(v)).append("&"));
        sb.setLength(sb.length() - 1);  // 去掉最后的 &
        return sb.toString();
    }

    private String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (Exception e) {
            return value;
        }
    }

    public static class Builder {
        private String method = "GET";
        private String url;
        private Map<String, String> headers = new LinkedHashMap<>();
        private Map<String, String> queryParams = new LinkedHashMap<>();
        private String body;
        private int connectTimeout = 10_000;
        private int readTimeout = 30_000;
        private int maxRetries = 0;

        public Builder method(String method) { this.method = method.toUpperCase(); return this; }
        public Builder url(String url)       { this.url = url; return this; }
        public Builder get()                 { this.method = "GET"; return this; }
        public Builder post()                { this.method = "POST"; return this; }
        public Builder put()                 { this.method = "PUT"; return this; }
        public Builder delete()              { this.method = "DELETE"; return this; }

        public Builder header(String key, String value) {
            this.headers.put(key, value);
            return this;
        }

        public Builder bearerAuth(String token) {
            this.headers.put("Authorization", "Bearer " + token);
            return this;
        }

        public Builder queryParam(String key, String value) {
            this.queryParams.put(key, value);
            return this;
        }

        public Builder jsonBody(String json) {
            this.body = json;
            this.headers.putIfAbsent("Content-Type", "application/json");
            return this;
        }

        public Builder connectTimeout(int millis) { this.connectTimeout = millis; return this; }
        public Builder readTimeout(int millis)    { this.readTimeout = millis; return this; }
        public Builder maxRetries(int retries)    { this.maxRetries = retries; return this; }

        public HttpRequest build() {
            if (url == null || url.isEmpty()) {
                throw new IllegalStateException("URL 为必填项");
            }
            return new HttpRequest(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }
}

// 使用示例：
// HttpRequest request = HttpRequest.builder()
//     .post()
//     .url("https://api.example.com/v1/users")
//     .bearerAuth("my-token")
//     .jsonBody("{\"name\":\"张三\"}")
//     .queryParam("version", "2")
//     .maxRetries(3)
//     .build();
```

### 6.5.2 SQL 查询构建器

动态 SQL 拼接是一个容易出错且存在安全风险的任务，Builder 模式可以提供类型安全的解决方案。

```java
/**
 * 类型安全的 SQL 查询构建器
 */
public class SqlQuery {
    private final List<String> columns;
    private final String table;
    private final List<String> conditions;
    private final List<String> orderByColumns;
    private final boolean distinct;
    private final Integer limit;
    private final Integer offset;

    private SqlQuery(Builder builder) {
        this.columns = new ArrayList<>(builder.columns);
        this.table = builder.table;
        this.conditions = new ArrayList<>(builder.conditions);
        this.orderByColumns = new ArrayList<>(builder.orderByColumns);
        this.distinct = builder.distinct;
        this.limit = builder.limit;
        this.offset = builder.offset;
    }

    /**
     * 构建最终的 SQL 语句字符串
     */
    public String toSql() {
        StringBuilder sql = new StringBuilder("SELECT ");
        if (distinct) {
            sql.append("DISTINCT ");
        }
        sql.append(columns.isEmpty() ? "*" : String.join(", ", columns));
        sql.append(" FROM ").append(table);

        if (!conditions.isEmpty()) {
            sql.append(" WHERE ").append(String.join(" AND ", conditions));
        }

        if (!orderByColumns.isEmpty()) {
            sql.append(" ORDER BY ").append(String.join(", ", orderByColumns));
        }

        if (limit != null) {
            sql.append(" LIMIT ").append(limit);
        }

        if (offset != null) {
            sql.append(" OFFSET ").append(offset);
        }

        return sql.toString();
    }

    @Override
    public String toString() {
        return toSql();
    }

    public static class Builder {
        private List<String> columns = new ArrayList<>();
        private String table;
        private List<String> conditions = new ArrayList<>();
        private List<String> orderByColumns = new ArrayList<>();
        private boolean distinct = false;
        private Integer limit;
        private Integer offset;

        public Builder select(String... columns) {
            this.columns.addAll(Arrays.asList(columns));
            return this;
        }

        public Builder selectAll() {
            this.columns.clear();
            return this;
        }

        public Builder distinct() {
            this.distinct = true;
            return this;
        }

        public Builder from(String table) {
            this.table = table;
            return this;
        }

        public Builder where(String condition) {
            this.conditions.add(condition);
            return this;
        }

        public Builder whereEquals(String column, Object value) {
            if (value instanceof String) {
                this.conditions.add(column + " = '" + value + "'");
            } else {
                this.conditions.add(column + " = " + value);
            }
            return this;
        }

        public Builder orderBy(String... columns) {
            this.orderByColumns.addAll(Arrays.asList(columns));
            return this;
        }

        public Builder orderByDesc(String column) {
            this.orderByColumns.add(column + " DESC");
            return this;
        }

        public Builder limit(int limit) {
            this.limit = limit;
            return this;
        }

        public Builder offset(int offset) {
            this.offset = offset;
            return this;
        }

        public Builder paginate(int page, int pageSize) {
            this.limit = pageSize;
            this.offset = (page - 1) * pageSize;
            return this;
        }

        public SqlQuery build() {
            if (table == null || table.isEmpty()) {
                throw new IllegalStateException("表名为必填项");
            }
            return new SqlQuery(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }
}

// 使用示例：
// SqlQuery query = SqlQuery.builder()
//     .select("id", "name", "email", "created_at")
//     .from("users")
//     .where("status = 'ACTIVE'")
//     .where("age >= 18")
//     .distinct()
//     .orderByDesc("created_at")
//     .limit(20)
//     .build();
//
// System.out.println(query.toSql());
// SELECT DISTINCT id, name, email, created_at FROM users
// WHERE status = 'ACTIVE' AND age >= 18 ORDER BY created_at DESC LIMIT 20
```

### 6.5.3 披萨订购系统

这是一个经典的 Builder 模式案例，展示了如何为一个拥有大量组合选项的产品提供优雅的构建接口。

```java
/**
 * 披萨订购系统中的 Builder 模式
 */
public class Pizza {
    // 枚举类型定义各种选项
    public enum Size       { SMALL, MEDIUM, LARGE, EXTRA_LARGE }
    public enum Crust      { THIN, THICK, STUFFED, GLUTEN_FREE }
    public enum Sauce      { TOMATO, BBQ, PESTO, ALFREDO }
    public enum Topping    { PEPPERONI, MUSHROOM, ONION, OLIVE, PEPPER, BACON, SAUSAGE, PINEAPPLE }
    public enum Cheese     { MOZZARELLA, CHEDDAR, PARMESAN, FETA }

    private final Size size;
    private final Crust crust;
    private final Sauce sauce;
    private final List<Topping> toppings;
    private final Cheese cheese;
    private final boolean extraCheese;
    private final boolean doubleDecker;

    private Pizza(Builder builder) {
        this.size = builder.size;
        this.crust = builder.crust;
        this.sauce = builder.sauce;
        this.toppings = Collections.unmodifiableList(new ArrayList<>(builder.toppings));
        this.cheese = builder.cheese;
        this.extraCheese = builder.extraCheese;
        this.doubleDecker = builder.doubleDecker;
    }

    public String describe() {
        return "披萨规格: " + size + " | " + crust + "饼底 | " + sauce + "酱"
            + " | " + toppings.size() + "种配料" + " | " + cheese + "芝士"
            + (extraCheese ? " | 加量芝士" : "")
            + (doubleDecker ? " | 双层饼底" : "");
    }

    public static class Builder {
        private Size size;
        private Crust crust = Crust.THIN;
        private Sauce sauce = Sauce.TOMATO;
        private List<Topping> toppings = new ArrayList<>();
        private Cheese cheese = Cheese.MOZZARELLA;
        private boolean extraCheese = false;
        private boolean doubleDecker = false;

        // 构造函数中指定必填项
        public Builder(Size size) {
            this.size = size;
        }

        public Builder crust(Crust crust)  { this.crust = crust; return this; }
        public Builder sauce(Sauce sauce)  { this.sauce = sauce; return this; }
        public Builder cheese(Cheese cheese) { this.cheese = cheese; return this; }

        public Builder addTopping(Topping topping) {
            this.toppings.add(topping);
            return this;
        }

        public Builder extraCheese(boolean extra) {
            this.extraCheese = extra;
            return this;
        }

        public Builder doubleDecker(boolean doubleDecker) {
            this.doubleDecker = doubleDecker;
            return this;
        }

        public Pizza build() {
            if (size == null) {
                throw new IllegalStateException("尺寸为必填项");
            }
            return new Pizza(this);
        }
    }

    public static Builder builder(Size size) {
        return new Builder(size);
    }
}

// 使用示例：
// Pizza hawaiian = Pizza.builder(Pizza.Size.LARGE)
//     .crust(Pizza.Crust.THIN)
//     .sauce(Pizza.Sauce.TOMATO)
//     .addTopping(Pizza.Topping.HAM)
//     .addTopping(Pizza.Topping.PINEAPPLE)
//     .extraCheese(true)
//     .build();
// System.out.println(hawaiian.describe());
```

### 6.5.4 文档生成系统

文档通常由标题、作者、段落、图片、页脚、水印等部分组成。Builder 模式可以将这些组件的组装过程封装起来。

```java
/**
 * 文档生成器 - Builder 模式
 */
public class Document {
    private final String title;
    private final String author;
    private final List<Section> sections;
    private final String header;
    private final String footer;
    private final String watermark;
    private final PageOrientation orientation;
    private final PaperSize paperSize;

    public enum PageOrientation { PORTRAIT, LANDSCAPE }
    public enum PaperSize { A4, A3, LETTER }

    private Document(Builder builder) {
        this.title = builder.title;
        this.author = builder.author;
        this.sections = Collections.unmodifiableList(new ArrayList<>(builder.sections));
        this.header = builder.header;
        this.footer = builder.footer;
        this.watermark = builder.watermark;
        this.orientation = builder.orientation;
        this.paperSize = builder.paperSize;
    }

    public String render() {
        StringBuilder doc = new StringBuilder();
        doc.append("=== ").append(title).append(" ===\n");
        doc.append("作者: ").append(author).append("\n");
        doc.append("纸张: ").append(paperSize).append(" | 方向: ").append(orientation).append("\n");
        if (watermark != null) {
            doc.append("水印: ").append(watermark).append("\n");
        }
        doc.append("---\n");
        for (int i = 0; i < sections.size(); i++) {
            Section s = sections.get(i);
            doc.append("[").append(s.level).append("] ").append(s.heading).append("\n");
            doc.append(s.content).append("\n\n");
        }
        if (footer != null) {
            doc.append("---\n").append(footer).append("\n");
        }
        return doc.toString();
    }

    public static class Section {
        final String heading;
        final String level;
        final String content;

        public Section(String heading, String level, String content) {
            this.heading = heading;
            this.level = level;
            this.content = content;
        }
    }

    public static class Builder {
        private String title;
        private String author = "未署名";
        private List<Section> sections = new ArrayList<>();
        private String header;
        private String footer;
        private String watermark;
        private PageOrientation orientation = PageOrientation.PORTRAIT;
        private PaperSize paperSize = PaperSize.A4;

        public Builder title(String title) { this.title = title; return this; }
        public Builder author(String author) { this.author = author; return this; }

        public Builder addSection(String heading, String content) {
            this.sections.add(new Section(heading, "H2", content));
            return this;
        }

        public Builder header(String header) { this.header = header; return this; }
        public Builder footer(String footer) { this.footer = footer; return this; }
        public Builder watermark(String watermark) { this.watermark = watermark; return this; }
        public Builder orientation(PageOrientation orientation) { this.orientation = orientation; return this; }
        public Builder paperSize(PaperSize paperSize) { this.paperSize = paperSize; return this; }

        public Document build() {
            if (title == null) throw new IllegalStateException("标题为必填项");
            return new Document(this);
        }
    }

    public static Builder builder() { return new Builder(); }
}

// 使用示例：
// Document doc = Document.builder()
//     .title("2025年度总结报告")
//     .author("张三")
//     .paperSize(Document.PaperSize.A4)
//     .addSection("前言", "本报告总结了2025年度...")
//     .addSection("业绩回顾", "全年营收达XX亿元...")
//     .addSection("展望", "2026年我们将继续...")
//     .watermark("机密")
//     .footer("第1页 / 共3页")
//     .build();
// System.out.println(doc.render());
```

## 6.6 潜在风险与问题

### 6.6.1 字段重复：产品类与 Builder 类的属性镜像

Builder 模式最明显的缺点是代码冗余 -- 产品类中的每个字段都必须在 Builder 类中重复声明一次。当字段数量较多时，维护成本显著增加。

```java
// 产品类中 10 个字段
public class Config {
    private final String host;
    private final int port;
    private final String username;
    private final String password;
    // ... 另外 6 个字段

    // Builder 类中还需要再声明一遍同样的 10 个字段
    public static class Builder {
        private String host;
        private int port;
        private String username;
        private String password;
        // ... 另外 6 个字段的镜像
    }
}
```

**缓解策略：**
- 使用 Lombok `@Builder` 自动生成 Builder 代码
- 当字段数小于 4 时，优先使用普通构造函数
- 考虑 Java 17+ 的 `record` 类型（但仍需 Builder 处理大量可选参数的情况）

### 6.6.2 Builder 不是线程安全的

默认情况下，Builder 实例是有状态的且可变的，因此它**不是线程安全的**。多个线程共享同一个 Builder 实例会导致竞态条件。

```java
// 危险示例：多线程共享 Builder
final Computer.Builder sharedBuilder = Computer.builder("i7", "16GB", "512GB");

// 线程A
new Thread(() -> {
    Computer pcA = sharedBuilder.gpu("RTX 4070").os("Windows").build();
}).start();

// 线程B
new Thread(() -> {
    // 可能与线程A交叉执行，造成不确定的中间状态
    Computer pcB = sharedBuilder.gpu("RTX 4090").os("Linux").build();
}).start();

// 解决方案：每个线程创建自己的 Builder 实例
// Computer.builder("i7", "16GB", "512GB") 应该在每个线程内部调用
```

### 6.6.3 必填参数与可选参数的区分不直观

使用 Fluent Builder 时，编译期无法区分必填和可选参数 -- 只有到了运行时 `build()` 方法才进行检查。

```java
// 编译期可以通过，运行时才报错
Computer pc = Computer.builder("i7", "16GB", "512GB")
    .gpu("RTX 4060")
    .build();  // OK

Computer pc2 = Computer.builder(null, null, null)  // 编译期不报错！
    .gpu("RTX 4060")
    .build();  // 运行时抛出 IllegalStateException
```

**增强方案：分步 Builder（Step Builder）**

通过接口链强制按步骤调用，将必填参数提升到编译期检查。

```java
// Step Builder：通过接口链强制构建顺序
public interface CpuStep     { RamStep cpu(String cpu); }
public interface RamStep     { StorageStep ram(String ram); }
public interface StorageStep { OptionalStep storage(String storage); }
public interface OptionalStep {
    OptionalStep gpu(String gpu);
    OptionalStep os(String os);
    Computer build();
}

// 具体实现省略...
// 使用时，编译器强制按 Cpu -> Ram -> Storage -> Optional -> build 顺序调用
// Computer pc = new StepComputerBuilder().cpu("i7").ram("16GB").storage("512GB").build();
// 如果不调用 cpu() 就无法调用 ram()，编译器会报错
```

### 6.6.4 对简单对象的过度设计

当对象只有 1-3 个字段时，Builder 模式反而增加了代码复杂度。

```java
// 过度设计：一个只有 2 个字段的对象，Builder 比构造函数还冗长
public class Point {
    private final int x, y;

    private Point(Builder b) { this.x = b.x; this.y = b.y; }

    public static class Builder {
        private int x, y;
        public Builder x(int x) { this.x = x; return this; }
        public Builder y(int y) { this.y = y; return this; }
        public Point build()    { return new Point(this); }
    }
}

// 更好的做法：直接用构造函数
// Point p = new Point(10, 20);
```

**经验法则：**
- 参数 <= 3 个：使用普通构造函数
- 参数 4-6 个，且大部分为可选：考虑 Builder
- 参数 >= 7 个，或多层嵌套构建：强烈建议使用 Builder

## 6.7 优化策略

### 6.7.1 Functional Builder（函数式 Builder）

利用 Java 8 的 Lambda 表达式和 `Consumer` 接口，可以实现更灵活的函数式 Builder。

```java
import java.util.function.Consumer;

/**
 * 通用函数式 Builder：无需为每个产品类编写独立的 Builder
 */
public class GenericBuilder<T> {
    private final Supplier<T> instantiator;
    private final List<Consumer<T>> modifiers = new ArrayList<>();

    private GenericBuilder(Supplier<T> instantiator) {
        this.instantiator = instantiator;
    }

    public static <T> GenericBuilder<T> of(Supplier<T> instantiator) {
        return new GenericBuilder<>(instantiator);
    }

    public <V> GenericBuilder<T> with(Consumer<T> modifier) {
        modifiers.add(modifier);
        return this;
    }

    public T build() {
        T instance = instantiator.get();
        modifiers.forEach(modifier -> modifier.accept(instance));
        modifiers.clear();    // 清空以便复用 Builder
        return instance;
    }
}

// 使用示例：
// 无需为 Person 编写专门的 Builder 类
// Person person = GenericBuilder.of(Person::new)
//     .with(p -> p.setName("张三"))
//     .with(p -> p.setAge(30))
//     .build();
```

### 6.7.2 Builder 继承的泛型化设计

在 6.3.4 节中已经展示了一种基于递归泛型边界的 Builder 继承方案。此方案的核心思路是让父类 Builder 的 fluent 方法返回子类的具体类型，从而在继承链中保持链式调用的便利性。

关键的泛型约束是：
```
abstract static class AbstractBuilder<T extends AbstractBuilder<T, V>, V extends Vehicle>
```

这种方式解决了普通 Builder 在继承场景下的"类型丢失"问题 -- 父类的 fluent setter 返回父类类型，子类继承后无法继续调用子类特有的 setter。

### 6.7.3 利用 Lambda 简化构建步骤

对于构建步骤具有明确顺序依赖的场景，可用 Lambda 串联构建步骤，减少 Director 的冗余。

```java
/**
 * Lambda 串联构建步骤
 */
public class LambdaBuilderDemo {

    @FunctionalInterface
    public interface BuildStep {
        void execute();
    }

    public static Computer buildWithSteps(BuildStep... steps) {
        // 创建默认 Builder
        Computer.Builder builder = Computer.builder("默认CPU", "默认内存", "默认存储");
        // 依次执行步骤
        for (BuildStep step : steps) {
            step.execute();
        }
        return builder.build();
    }

    // 使用示例（伪代码思路）：
    // Computer pc = buildWithSteps(
    //     () -> builder.gpu("RTX 4090"),
    //     () -> builder.os("Windows 11"),
    //     () -> builder.monitor("4K Display")
    // );
}
```

### 6.7.4 Prototype + Builder 的混合使用

当需要从已有对象"克隆并修改部分属性"时，可以将 Prototype 和 Builder 结合。

```java
/**
 * 从已有对象创建 Builder（实现"修改式克隆"）
 */
public class Computer {
    // ... 字段和构造函数不变 ...

    /**
     * 从已有 Computer 实例创建 Builder，预填所有字段
     */
    public Builder toBuilder() {
        return new Builder(this.cpu, this.ram, this.storage)
            .gpu(this.gpu)
            .monitor(this.monitor)
            .keyboard(this.keyboard)
            .mouse(this.mouse)
            .os(this.os);
    }
}

// 使用示例：
// Computer original = Computer.builder("i7", "16GB", "512GB").gpu("RTX 3060").build();
// Computer upgraded = original.toBuilder().gpu("RTX 4080").os("Windows 11").build();
// 只修改了 GPU 和 OS，其余字段与 original 相同
```

### 6.7.5 最佳实践总结

| 场景 | 推荐方案 | 备注 |
|------|---------|------|
| 简单对象（<=3个字段） | 普通构造函数 | Builder 是过度设计 |
| 3个以上可选参数 | 静态内部类 Builder | 最常用的方式 |
| 大量字段需要镜像维护 | Lombok `@Builder` | 减少重复代码 |
| 需要严格构建顺序 | Step Builder（接口链） | 编译期强制顺序 |
| 复杂继承关系 | 递归泛型 Builder | 保持链式调用 |
| 从已有对象"修改式克隆" | Builder + `toBuilder()` | 结合 Prototype |
| 需要复用构建逻辑 | Functional Builder | Lambda 组合 |

## 本章小结

本章全面深入地介绍了建造者模式：

1. **核心问题**：解决了复杂对象构建中参数爆炸、状态不一致、可读性差的问题，避免了重叠构造器和 JavaBeans 模式的反模式
2. **UML 结构**：由产品（Product）、抽象建造者（Builder）、具体建造者（ConcreteBuilder）、指挥者（Director，可选）四个角色组成
3. **实现方式**：
   - 经典模式（含 Director）：适用于"同一套步骤、不同实现"的场景
   - 流式 Builder（无 Director）：适用于"同一产品、不同配置"的场景
   - Lombok `@Builder`：编译器自动生成，减少模板代码
   - 递归泛型 Builder：解决 Builder 在继承场景下的类型丢失问题
4. **框架应用**：StringBuilder 展示了链式调用的核心机制；OkHttp Request.Builder 是"不可变产品 + 可变 Builder"的典范；MyBatis SqlSessionFactoryBuilder 封装了复杂的配置解析过程
5. **常见风险**：字段重复导致维护成本增加、Builder 非线程安全、必填/可选参数在编译期不可区分、简单对象过度设计
6. **优化策略**：Functional Builder 减少定制代码、Step Builder 提供编译期安全保证、`toBuilder()` 实现"修改式克隆"

**建造者模式特别适合参数多、约束多、需要不可变性的对象创建场景。** 当一个类的构造器超过 4 个参数时，应该认真考虑是否使用 Builder 模式重构。

---

在下一章中，我们将学习原型模式（Prototype），它通过复制现有对象来创建新对象，避免了高昂的创建成本。
