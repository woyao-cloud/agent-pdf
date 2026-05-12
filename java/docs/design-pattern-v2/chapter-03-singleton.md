# 第3章 单例模式（Singleton）

**单例模式**是创建型模式中最基础、最常用的模式。它确保一个类只有一个实例，并提供一个全局访问点。虽然实现看似简单，但在多线程、序列化、反射等场景下存在诸多陷阱，需要深入理解其底层原理。

## 3.1 解决的问题与应用场景

### 3.1.1 问题分析

在软件系统中，某些类在整个应用生命周期中只需要一个实例。如果创建多个实例，会导致一系列严重问题：

**资源浪费**：每个实例都占用内存和系统资源。例如，数据库连接池如果创建多个实例，每个池都维护自己的连接集合，造成连接数膨胀。

**数据不一致**：多个实例各自维护内部状态，状态之间无法同步。例如，两个配置管理器实例加载了不同版本的配置文件，导致应用行为不可预测。

**业务逻辑混乱**：某些对象天然具有"全局唯一"的语义。例如，全局ID生成器如果存在多个实例，会产生重复的ID，破坏数据的唯一性约束。

**典型的只需一个实例的类**：

| 类别 | 示例 | 原因 |
|------|------|------|
| 配置管理 | AppConfig, SystemProperties | 全局配置需要统一来源 |
| 资源池 | ConnectionPool, ThreadPool | 池本身就是资源的集中管理者 |
| 日志记录 | Logger, LogManager | 统一的日志输出通道 |
| 缓存 | CacheManager, LocalCache | 全局唯一的缓存视图 |
| 硬件访问 | Printer, SoundCard | 物理设备只有一个 |
| 全局状态 | IdGenerator, Counter | 全局唯一的状态维护 |
| 上下文管理 | ApplicationContext, SecurityContext | 贯穿整个请求的上下文 |

### 3.1.2 典型应用场景

**场景一：应用配置管理**

```java
// 整个应用只需加载一次配置，所有模块共享
AppConfig config = AppConfig.getInstance();
String dbUrl = config.get("database.url");
int maxPoolSize = config.getInt("db.pool.max-size", 20);
String logLevel = config.get("log.level", "INFO");
```

**场景二：数据库连接池**

```java
// 应用启动时创建唯一的连接池，所有DAO层共享
ConnectionPool pool = ConnectionPool.getInstance();
pool.initialize("jdbc:mysql://localhost:3306/mydb", 10);

// 在DAO中使用
try (Connection conn = pool.borrowConnection()) {
    // 执行数据库操作
}
```

**场景三：全局日志管理器**

```java
// 统一日志输出，确保日志格式和输出目标一致
LogManager logManager = LogManager.getInstance();
logManager.setLevel(LogLevel.DEBUG);
logManager.addAppender(new FileAppender("app.log"));
logManager.info("Application started successfully");
```

**场景四：全局缓存管理器**

```java
// 统一缓存入口，避免多处维护缓存导致数据不一致
CacheManager cache = CacheManager.getInstance();
cache.put("user:1001", userObject);
User user = (User) cache.get("user:1001");
```

## 3.2 实现原理与UML

### 3.2.1 核心思想

单例模式的实现围绕三个关键要素：

1. **私有构造函数（Private Constructor）**：阻止外部代码通过 `new` 关键字直接创建实例。这是单例模式的第一道防线。

2. **私有静态实例变量（Private Static Instance）**：在类内部持有唯一的实例引用。静态变量属于类级别而非实例级别，确保全局唯一。

3. **公共静态访问方法（Public Static Accessor）**：提供全局访问点，通常命名为 `getInstance()`。该方法是外部获取单例实例的唯一入口。

### 3.2.2 UML类图

```
┌───────────────────────────────────┐
│         Singleton                 │
├───────────────────────────────────┤
│ - static instance: Singleton      │  ← 私有静态实例，存储唯一对象
├───────────────────────────────────┤
│ - Singleton()                     │  ← 私有构造函数，阻止外部new
│ + static getInstance(): Singleton │  ← 全局访问点，返回唯一实例
│ + doSomething(): void             │  ← 业务方法
└───────────────────────────────────┘
```

类图解读：
- 属性区有一个私有的静态成员 `instance`，类型为 `Singleton` 自身
- 构造函数是私有的（`-` 前缀表示私有可见性）
- 外部只能通过公共方法 `getInstance()` 获取实例

### 3.2.3 时序图

```
Client                          Singleton                          SingletonHolder
  │                                 │                                    │
  │  getInstance()                  │                                    │
  │ ──────────────────────────────► │                                    │
  │                                 │  (检查 instance 是否为 null)        │
  │                                 │ ──────────────────────────────────►│
  │                                 │                                    │
  │                                 │         (如为null，创建实例)         │
  │                                 │                                    │
  │                                 │        instance                    │
  │                                 │ ◄───────────────────────────────── │
  │                                 │                                    │
  │      返回 instance 引用          │                                    │
  │ ◄───────────────────────────────│                                    │
  │                                 │                                    │
```

### 3.2.4 实现约束与注意事项

1. **必须避免继承**：如果单例类允许子类化，子类可能绕过父类的单例控制。通常将单例类声明为 `final`。
2. **必须处理多线程**：在多线程环境下，必须保证只有一个线程能够执行实例化逻辑。
3. **必须考虑序列化**：如果单例类实现了 `Serializable` 接口，反序列化会创建新实例，破坏单例约束。
4. **必须防止反射**：通过反射可以访问私有构造函数，必须添加防御机制。

## 3.3 代码实现（多种方式）

### 3.3.1 饿汉式（Eager Initialization）-- 静态常量

这是最简单、最直接的单例实现。实例在类加载时就创建，由JVM保证线程安全。

```java
/**
 * 饿汉式单例（静态常量）
 * 优点：实现简单，线程安全（JVM保证类加载过程线程安全）
 * 缺点：类加载时就实例化，可能造成资源浪费（如果从未使用）
 */
public class EagerSingleton {

    // 1. 私有构造函数，防止外部new实例
    private EagerSingleton() {
        System.out.println("EagerSingleton instance created");
    }

    // 2. 类加载时立即创建唯一实例（final保证引用不可变）
    private static final EagerSingleton INSTANCE = new EagerSingleton();

    // 3. 提供全局访问点
    public static EagerSingleton getInstance() {
        return INSTANCE;
    }

    // 业务方法
    public void doWork() {
        System.out.println("EagerSingleton is working");
    }
}
```

**原理说明**：JVM在类加载阶段（Loading -> Linking -> Initialization）会初始化静态变量。这一过程由 `<clinit>` 方法执行，JVM规范保证 `<clinit>` 方法的执行是线程安全的。即使多个线程同时触发类加载，也只有一个线程执行初始化。

**适用场景**：单例对象轻量、必然会被使用、或应用启动速度要求不高的场景。

### 3.3.2 饿汉式 -- 静态代码块

与静态常量方式等价，只是将实例化逻辑放在静态代码块中。适合需要在实例化前做一些额外初始化的场景。

```java
/**
 * 饿汉式单例（静态代码块）
 * 与静态常量方式原理相同，但可以在静态代码块中做额外初始化
 */
public class EagerSingletonBlock {

    private static final EagerSingletonBlock INSTANCE;

    static {
        // 可以在创建实例前做一些准备工作
        System.out.println("Initializing EagerSingletonBlock...");
        try {
            // 例如：加载配置文件、初始化资源等
            INSTANCE = new EagerSingletonBlock();
        } catch (Exception e) {
            throw new RuntimeException("Failed to create singleton instance", e);
        }
    }

    private EagerSingletonBlock() {
        System.out.println("EagerSingletonBlock instance created");
    }

    public static EagerSingletonBlock getInstance() {
        return INSTANCE;
    }
}
```

### 3.3.3 懒汉式（线程不安全）

这是最基本的延迟加载实现，但 **绝对不能在生产环境的多线程场景中使用**。

```java
/**
 * 懒汉式（线程不安全）
 * 警告：此实现仅用于理解原理，不可用于生产环境
 *
 * 问题：多线程同时访问 getInstance() 时，可能创建多个实例
 */
public class UnsafeLazySingleton {

    private static UnsafeLazySingleton instance;

    private UnsafeLazySingleton() {
        System.out.println("UnsafeLazySingleton instance created");
    }

    public static UnsafeLazySingleton getInstance() {
        if (instance == null) {           // ← 线程1和线程2都可能通过这个检查
            instance = new UnsafeLazySingleton();  // ← 导致多次实例化
        }
        return instance;
    }
}
```

**多线程问题演示**：

```
时间线：
T0: instance == null
T1: 线程A 检查 instance == null → true，准备进入创建逻辑
T2: 线程B 检查 instance == null → true（线程A还未完成赋值），也准备创建
T3: 线程A 执行 new UnsafeLazySingleton()，创建实例1
T4: 线程B 执行 new UnsafeLazySingleton()，创建实例2
T5: 线程A 将 instance 赋值为实例1
T6: 线程B 将 instance 赋值为实例2（覆盖了实例1）

结果：创建了两个实例，instance 最终指向实例2，实例1被垃圾回收
```

### 3.3.4 懒汉式（同步方法）

通过在 `getInstance()` 方法上添加 `synchronized` 关键字保证线程安全。

```java
/**
 * 懒汉式（同步方法）
 * 优点：线程安全，实现简单
 * 缺点：每次调用 getInstance() 都需要获取锁，高并发下性能差
 */
public class SynchronizedLazySingleton {

    private static SynchronizedLazySingleton instance;

    private SynchronizedLazySingleton() {
        System.out.println("SynchronizedLazySingleton instance created");
    }

    // synchronized 修饰整个方法，保证同一时刻只有一个线程能执行
    public static synchronized SynchronizedLazySingleton getInstance() {
        if (instance == null) {
            instance = new SynchronizedLazySingleton();
        }
        return instance;
    }
}
```

**性能分析**：`synchronized` 关键字会带来锁竞争开销。在高并发场景下，所有获取实例的线程都必须排队等待，即使实例早已创建完成，依然需要获取锁。这成为系统瓶颈。

### 3.3.5 双重检查锁定（Double-Checked Locking）

双重检查锁定是懒加载单例模式中性能最优的实现方式。它只在使用之初发生一次同步，实例创建后不再需要获取锁。

```java
/**
 * 双重检查锁定（DCL / Double-Checked Locking）
 *
 * 关键点：
 * 1. 两次 null 检查：减少不必要的同步
 * 2. volatile 关键字：防止指令重排序导致的"半初始化"对象问题
 * 3. synchronized 块：只保护实例化代码段
 */
public class DclSingleton {

    // volatile 的作用：
    // 1. 保证可见性：一个线程修改后，其他线程立即可见
    // 2. 禁止指令重排序：防止返回未完全初始化的对象
    private static volatile DclSingleton instance;

    private DclSingleton() {
        System.out.println("DclSingleton instance created");
    }

    public static DclSingleton getInstance() {
        // 第一次检查：实例已存在则无需进入同步块
        // 这是性能优化的关键所在
        if (instance == null) {
            // 同步块：只允许一个线程进入实例化代码
            synchronized (DclSingleton.class) {
                // 第二次检查：确保在等待锁期间没有其他线程已创建实例
                // 这是正确性的关键所在
                if (instance == null) {
                    instance = new DclSingleton();
                }
            }
        }
        return instance;
    }

    public void doWork() {
        System.out.println("DclSingleton is working");
    }
}
```

**为什么需要 volatile？**

`new DclSingleton()` 这个看似原子性的操作，在JVM层面实际分为三步：

```
Step 1: memory = allocate()        // 分配内存空间
Step 2: constructor(memory)        // 调用构造函数初始化对象
Step 3: instance = memory          // instance 指向内存地址
```

JIT编译器可能对指令进行重排序，Step 2 和 Step 3 可能互换：

```
Step 1: memory = allocate()        // 分配内存
Step 3: instance = memory          // 先指向内存（此时对象未初始化！）
Step 2: constructor(memory)        // 再初始化
```

如果线程A执行完 Steps 1 和 3，线程B进行第一次检查时发现 `instance != null`（因为Step 3已完成），直接返回这个未初始化完成的对象，导致使用出错。`volatile` 关键字禁止这种指令重排序，确保对象完全初始化后才对 `instance` 赋值。

### 3.3.6 静态内部类（Holder Pattern）

利用JVM类加载机制实现延迟加载和线程安全，是Java中被广泛推荐的实现方式。

```java
/**
 * 静态内部类方式（Initialization-on-Demand Holder）
 *
 * 原理：
 * 1. 外部类加载时，内部类不会被加载（实现延迟加载）
 * 2. 首次调用 getInstance() 时，触发 SingletonHolder 类加载
 * 3. JVM保证类加载过程线程安全（实现线程安全）
 *
 * 优点：
 * - 延迟加载（用的时候才创建）
 * - 线程安全（JVM保证）
 * - 高性能（无锁）
 * - 实现简洁
 */
public class HolderSingleton {

    private HolderSingleton() {
        System.out.println("HolderSingleton instance created");
    }

    /**
     * 静态内部类
     * - 在外部类加载时不会被加载
     * - 只有在首次被引用时才会加载
     * - 加载过程由JVM保证线程安全
     */
    private static class SingletonHolder {
        private static final HolderSingleton INSTANCE = new HolderSingleton();
    }

    public static HolderSingleton getInstance() {
        // 首次调用时，触发 SingletonHolder 类加载，创建 INSTANCE
        return SingletonHolder.INSTANCE;
    }

    public void doWork() {
        System.out.println("HolderSingleton is working");
    }
}
```

**加载时机详解**：

- `HolderSingleton` 类被加载时，`SingletonHolder` 内部类 **不会** 被加载
- 仅当 `getInstance()` 被首次调用时，JVM才加载 `SingletonHolder`
- `SingletonHolder` 的 `<clinit>` 方法创建 `INSTANCE`，由JVM保证线程安全
- 后续调用直接返回已创建的 `INSTANCE`，无需任何同步开销

### 3.3.7 枚举方式（Enum Singleton）-- 最佳实践

枚举单例是《Effective Java》作者Joshua Bloch推荐的最佳实现方式，能天然防御反射攻击和序列化破坏。

```java
/**
 * 枚举单例 -- 最安全、最简洁的方式
 *
 * 优点：
 * 1. 线程安全：JVM保证枚举实例的创建是线程安全的（与静态常量方式类似）
 * 2. 防止反射攻击：JDK内部禁止通过反射创建枚举实例
 * 3. 防止序列化破坏：枚举的序列化机制由JVM特殊处理，反序列化不创建新实例
 * 4. 代码简洁：不需要编写任何防御性代码
 *
 * 局限：
 * 1. 类加载时就创建实例（无法延迟加载）
 * 2. 无法继承其他类（因为枚举默认继承 java.lang.Enum）
 */
public enum EnumSingleton {
    INSTANCE;  // 唯一的实例

    // 可以拥有属性
    private String configPath;

    // 可以拥有实例方法
    public void doWork() {
        System.out.println("EnumSingleton is working");
    }

    public void setConfigPath(String path) {
        this.configPath = path;
    }

    public String getConfigPath() {
        return configPath;
    }

    // 可以有更复杂的业务方法
    public int calculate(int a, int b) {
        return a + b;
    }
}

// 使用方式
// EnumSingleton singleton = EnumSingleton.INSTANCE;
// singleton.doWork();
```

**原理说明**：

在字节码层面，`EnumSingleton` 经过编译后实际上类似于：

```java
// 编译后大致等价于（简化表示）
public final class EnumSingleton extends java.lang.Enum<EnumSingleton> {
    public static final EnumSingleton INSTANCE = new EnumSingleton("INSTANCE", 0);

    private EnumSingleton(String name, int ordinal) {
        super(name, ordinal);
    }
    // ...
}
```

反射无法调用枚举的构造函数（`Constructor.newInstance()` 中会检查，如果是枚举类型则抛出 `IllegalArgumentException`）。反序列化时，调用的是 `Enum.valueOf()` 方法，返回已存在的枚举实例。

### 3.3.8 实现方式全面对比

| 实现方式 | 线程安全 | 延迟加载 | 性能 | 防反射 | 防序列化 | 代码量 | 推荐指数 |
|----------|----------|----------|------|--------|----------|--------|----------|
| 饿汉式-静态常量 | 是 | 否 | 高 | 否 | 否 | 少 | *** |
| 饿汉式-静态块 | 是 | 否 | 高 | 否 | 否 | 少 | *** |
| 懒汉式-线程不安全 | 否 | 是 | 高 | 否 | 否 | 少 | 不可用 |
| 懒汉式-同步方法 | 是 | 是 | 低 | 否 | 否 | 少 | ** |
| 双重检查锁定 | 是 | 是 | 高 | 否 | 否 | 中 | **** |
| 静态内部类 | 是 | 是 | 高 | 否 | 否 | 中 | ***** |
| 枚举方式 | 是 | 否 | 高 | 是 | 是 | 极少 | ***** |

**选择建议**：

- **首选枚举方式**：如果不需要延迟加载和继承其他类，枚举是最安全的选择
- **次选静态内部类**：需要延迟加载时的最佳选择
- **备选双重检查锁定**：需要延迟加载且对 `volatile` 语义有深入理解的前提下
- **避免饿汉式**：除非确定实例一定会被使用且资源消耗非常小
- **绝对不要用**：线程不安全的懒汉式

## 3.4 JDK/框架源码解析

### 3.4.1 java.lang.Runtime -- 饿汉式单例

JDK中的 `Runtime` 类采用标准的饿汉式实现，每个Java应用只有一个 `Runtime` 实例。

```java
// JDK源码（简化版）
public class Runtime {
    // 饿汉式：类加载时创建唯一实例
    private static final Runtime currentRuntime = new Runtime();

    // 全局访问点
    public static Runtime getRuntime() {
        return currentRuntime;
    }

    // 私有构造函数
    private Runtime() {}

    // 获取CPU核心数
    public int availableProcessors() {
        return /* native method */;
    }

    // 获取可用内存
    public long freeMemory() {
        return /* native method */;
    }

    // 执行GC
    public void gc() {
        /* ... */
    }
}
```

`Runtime` 类选择饿汉式的原因：
- 每个Java应用 **必然** 需要与JVM运行时交互
- 实例很轻量（主要是一组native方法的入口）
- 不需要延迟加载

### 3.4.2 java.lang.System -- 工具类的私有构造函数

`System` 类不是严格意义上的单例模式（它的所有方法都是静态的），但采用了相同的防御性设计 -- 私有构造函数防止实例化。

```java
// JDK源码（简化版）
public final class System {
    // 私有构造函数，防止实例化
    private System() {
    }

    // 所有属性和方法都是静态的
    public static final InputStream in = null;  // 由JVM初始化
    public static final PrintStream out = null;  // 由JVM初始化
    public static final PrintStream err = null;  // 由JVM初始化

    public static long currentTimeMillis() { /* ... */ }
    public static void exit(int status) { /* ... */ }
    public static void gc() { Runtime.getRuntime().gc(); }
}
```

### 3.4.3 Spring框架中的单例作用域

Spring框架默认将Bean的作用域设为 `singleton`，这是Spring容器管理的单例模式。与GoF单例不同，Spring的"单例"是**容器级别的单例**（每个容器内唯一，而非JVM级别唯一）。

```java
// 默认作用域为 singleton，无需显式声明
@Component
public class UserService {
    // 同一个Spring容器中，只会创建一个UserService实例
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
}

// 单例Bean的获取
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        ApplicationContext context = SpringApplication.run(Application.class, args);

        // 两次获取返回同一实例
        UserService service1 = context.getBean(UserService.class);
        UserService service2 = context.getBean(UserService.class);
        System.out.println(service1 == service2);  // true
    }
}
```

**Spring单例Bean的底层实现**：

```java
// AbstractBeanFactory 中的核心逻辑（简化版）
public Object getSingleton(String beanName, ObjectFactory<?> singletonFactory) {
    synchronized (this.singletonObjects) {
        // 从缓存中获取
        Object singletonObject = this.singletonObjects.get(beanName);
        if (singletonObject == null) {
            // 创建新实例
            singletonObject = singletonFactory.getObject();
            // 缓存到容器中
            this.singletonObjects.put(beanName, singletonObject);
        }
        return singletonObject;
    }
}
```

Spring使用了 `ConcurrentHashMap` 作为单例缓存（`singletonObjects`），结合 `synchronized` 块保证线程安全，实现了容器级别的单例管理。

### 3.4.4 日志框架中的单例 -- Logback/Log4j

**Logback 的 LoggerFactory**：

Logback的 `LoggerFactory.getLogger()` 内部通过 `LoggerContext` 管理所有Logger实例，每个Logger名称只对应一个实例。

```java
// Logback 内部实现原理（简化版）
public class LoggerContext {
    // Logger 缓存，key为logger名称，value为Logger实例
    private final ConcurrentMap<String, Logger> loggerCache = new ConcurrentHashMap<>();

    public Logger getLogger(String name) {
        // 如果不存在则创建，存在则直接返回
        return loggerCache.computeIfAbsent(name, n -> new Logger(n, this));
    }
}
```

这本质上是"单例注册表"模式：每个name对应唯一的Logger实例，但不同name对应不同实例。

**SLF4J 的 ILoggerFactory**：

```java
// SLF4J 的绑定机制
public final class LoggerFactory {
    // 绑定并缓存唯一的 ILoggerFactory 实例
    private static volatile ILoggerFactory iLoggerFactory;

    public static Logger getLogger(String name) {
        ILoggerFactory factory = getILoggerFactory();
        return factory.getLogger(name);
    }

    private static ILoggerFactory getILoggerFactory() {
        if (iLoggerFactory == null) {
            synchronized (LoggerFactory.class) {
                if (iLoggerFactory == null) {
                    iLoggerFactory = bind();  // 通过SPI绑定具体实现
                }
            }
        }
        return iLoggerFactory;
    }
}
```

## 3.5 使用场景与案例

### 3.5.1 数据库连接池管理器

连接池需要全局唯一，确保所有数据库操作共享同一组连接，避免连接数失控。

```java
/**
 * 数据库连接池单例管理器
 */
public class ConnectionPoolManager {
    // 使用静态内部类实现延迟加载
    private static class PoolHolder {
        static final ConnectionPoolManager INSTANCE = new ConnectionPoolManager();
    }

    private final BlockingQueue<Connection> availableConnections;
    private final Set<Connection> usedConnections;
    private final int poolSize;
    private volatile boolean initialized = false;

    private ConnectionPoolManager() {
        this.poolSize = 10;
        this.availableConnections = new LinkedBlockingQueue<>(poolSize);
        this.usedConnections = ConcurrentHashMap.newKeySet();
    }

    public static ConnectionPoolManager getInstance() {
        return PoolHolder.INSTANCE;
    }

    public synchronized void initialize(String url, String user, String password) {
        if (initialized) {
            throw new IllegalStateException("ConnectionPool already initialized");
        }

        try {
            for (int i = 0; i < poolSize; i++) {
                Connection conn = DriverManager.getConnection(url, user, password);
                availableConnections.offer(conn);
            }
            initialized = true;
            System.out.println("Connection pool initialized with " + poolSize + " connections");
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize connection pool", e);
        }
    }

    public Connection borrowConnection() throws SQLException {
        if (!initialized) {
            throw new IllegalStateException("ConnectionPool not initialized");
        }

        try {
            Connection conn = availableConnections.poll(5, TimeUnit.SECONDS);
            if (conn == null) {
                throw new SQLException("No available connections in the pool");
            }
            usedConnections.add(conn);
            return conn;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SQLException("Interrupted while waiting for connection", e);
        }
    }

    public void releaseConnection(Connection conn) {
        usedConnections.remove(conn);
        availableConnections.offer(conn);
    }

    public int getAvailableCount() {
        return availableConnections.size();
    }

    public int getUsedCount() {
        return usedConnections.size();
    }
}
```

### 3.5.2 应用配置管理器

```java
/**
 * 应用配置管理器 -- 确保所有模块读取一致的配置
 */
public class AppConfigManager {
    private static volatile AppConfigManager instance;
    private final Properties properties = new Properties();

    private AppConfigManager() {
        // 加载配置文件
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("application.properties")) {
            if (input != null) {
                properties.load(input);
                System.out.println("Configuration loaded successfully");
            } else {
                System.out.println("No configuration file found, using defaults");
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to load application configuration", e);
        }
    }

    public static AppConfigManager getInstance() {
        if (instance == null) {
            synchronized (AppConfigManager.class) {
                if (instance == null) {
                    instance = new AppConfigManager();
                }
            }
        }
        return instance;
    }

    public String getProperty(String key) {
        return properties.getProperty(key);
    }

    public String getProperty(String key, String defaultValue) {
        return properties.getProperty(key, defaultValue);
    }

    public int getIntProperty(String key, int defaultValue) {
        String value = properties.getProperty(key);
        if (value == null) {
            return defaultValue;
        }
        return Integer.parseInt(value);
    }

    public boolean getBoolProperty(String key, boolean defaultValue) {
        String value = properties.getProperty(key);
        if (value == null) {
            return defaultValue;
        }
        return Boolean.parseBoolean(value);
    }

    public Set<String> getAllKeys() {
        return properties.stringPropertyNames();
    }
}

// 使用示例
// String dbUrl = AppConfigManager.getInstance().getProperty("db.url");
// int timeout = AppConfigManager.getInstance().getIntProperty("timeout", 30);
```

### 3.5.3 全局缓存管理器

```java
/**
 * 全局缓存管理器 -- 使用枚举实现
 */
public enum CacheManager {
    INSTANCE;

    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final long defaultTtlMillis = 300000; // 5分钟

    /**
     * 带过期时间的缓存条目
     */
    private static class CacheEntry {
        final Object value;
        final long expireTime;

        CacheEntry(Object value, long ttlMillis) {
            this.value = value;
            this.expireTime = System.currentTimeMillis() + ttlMillis;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireTime;
        }
    }

    public void put(String key, Object value) {
        cache.put(key, new CacheEntry(value, defaultTtlMillis));
    }

    public void put(String key, Object value, long ttlMillis) {
        cache.put(key, new CacheEntry(value, ttlMillis));
    }

    public Object get(String key) {
        CacheEntry entry = cache.get(key);
        if (entry == null) {
            return null;
        }
        if (entry.isExpired()) {
            cache.remove(key);
            return null;
        }
        return entry.value;
    }

    @SuppressWarnings("unchecked")
    public <T> T get(String key, Class<T> type) {
        Object value = get(key);
        if (value == null) {
            return null;
        }
        return (T) value;
    }

    public void remove(String key) {
        cache.remove(key);
    }

    public void clear() {
        cache.clear();
    }

    public int size() {
        return cache.size();
    }

    public void cleanExpired() {
        cache.entrySet().removeIf(entry -> entry.getValue().isExpired());
    }
}
```

## 3.6 潜在风险与问题

### 3.6.1 多线程环境下的线程安全问题

即使使用了正确的实现方式，如果单例类中包含**可变状态**，依然可能出现线程安全问题。

```java
/**
 * 有线程安全风险的单例
 * 虽然获取实例是线程安全的，但实例内部的可变操作却不安全
 */
public class CounterSingleton {
    private static final CounterSingleton INSTANCE = new CounterSingleton();
    private int count = 0;  // 可变状态，存在并发安全问题

    private CounterSingleton() {}

    public static CounterSingleton getInstance() {
        return INSTANCE;
    }

    // 此方法在并发环境下存在竞态条件（race condition）
    public int increment() {  // 线程不安全！
        return ++count;  // 三步操作：读取、自增、写入
    }
}

// 修复方案：使用 AtomicInteger
public class SafeCounterSingleton {
    private static final SafeCounterSingleton INSTANCE = new SafeCounterSingleton();
    private final AtomicInteger count = new AtomicInteger(0);

    private SafeCounterSingleton() {}

    public static SafeCounterSingleton getInstance() {
        return INSTANCE;
    }

    public int increment() {  // 线程安全
        return count.incrementAndGet();
    }
}
```

### 3.6.2 反射攻击

即使构造函数是私有的，反射API（`setAccessible(true)`）仍然可以调用它。

```java
/**
 * 演示反射攻击
 */
public class ReflectionAttackDemo {
    public static void main(String[] args) throws Exception {
        // 正常获取单例
        EagerSingleton s1 = EagerSingleton.getInstance();

        // 通过反射创建第二个"实例"
        Constructor<EagerSingleton> constructor = EagerSingleton.class.getDeclaredConstructor();
        constructor.setAccessible(true);  // 绕过私有限制
        EagerSingleton s2 = constructor.newInstance();

        System.out.println("s1 == s2: " + (s1 == s2));  // false！单例被破坏
        System.out.println("s1 hash: " + System.identityHashCode(s1));
        System.out.println("s2 hash: " + System.identityHashCode(s2));
    }
}
```

**防御方案一：在构造函数中添加标志位检测**：

```java
public class ReflectionSafeSingleton {
    private static final ReflectionSafeSingleton INSTANCE = new ReflectionSafeSingleton();

    // 标志位，记录是否已经创建过实例
    private static volatile boolean created = false;

    private ReflectionSafeSingleton() {
        // 双重检查，防止并发调用构造函数
        if (created) {
            throw new RuntimeException("Singleton instance already exists. "
                + "Use getInstance() to access it.");
        }
        created = true;
        System.out.println("ReflectionSafeSingleton created");
    }

    public static ReflectionSafeSingleton getInstance() {
        return INSTANCE;
    }
}
```

**防御方案二：使用枚举（最彻底）**：

枚举类型的构造函数在 `java.lang.reflect.Constructor.newInstance()` 中被显式阻止：

```java
// JDK Constructor.newInstance() 源码节选
if ((clazz.getModifiers() & Modifier.ENUM) != 0) {
    throw new IllegalArgumentException("Cannot reflectively create enum objects");
}
```

### 3.6.3 序列化与反序列化破坏单例

如果单例类实现了 `Serializable` 接口，反序列化时会创建一个全新的实例。

```java
/**
 * 演示序列化破坏单例
 */
public class SerializationDemo {
    public static void main(String[] args) throws Exception {
        // 获取单例并序列化
        EagerSingleton s1 = EagerSingleton.getInstance();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(baos);
        oos.writeObject(s1);
        oos.close();

        // 反序列化
        ByteArrayInputStream bais = new ByteArrayInputStream(baos.toByteArray());
        ObjectInputStream ois = new ObjectInputStream(bais);
        EagerSingleton s2 = (EagerSingleton) ois.readObject();

        System.out.println("s1 == s2: " + (s1 == s2));  // false！单例被破坏
    }
}
```

**解决方案：添加 `readResolve()` 方法**：

Java的序列化机制规定，如果被反序列化的类定义了 `readResolve()` 方法，反序列化完成后会用该方法的返回值替换反序列化生成的对象。

```java
public class SerializationSafeSingleton implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final SerializationSafeSingleton INSTANCE = new SerializationSafeSingleton();

    private SerializationSafeSingleton() {
        System.out.println("SerializationSafeSingleton created");
    }

    public static SerializationSafeSingleton getInstance() {
        return INSTANCE;
    }

    /**
     * readResolve 方法会在反序列化时被调用
     * 返回已存在的单例实例，丢弃反序列化创建的新对象
     *
     * 方法签名必须精确如下：
     * - 返回类型为 Object
     * - 方法名为 readResolve
     * - 无参数
     */
    private Object readResolve() {
        return INSTANCE;  // 始终返回已存在的单例实例
    }
}
```

### 3.6.4 多个ClassLoader环境下的问题

在存在多个ClassLoader的环境（如某些Web容器、OSGi、插件系统等）中，同一个类可能被加载多次，每个ClassLoader空间内都会创建自己的单例实例。

```java
/**
 * 演示ClassLoader问题（伪代码，实际场景更复杂）
 */
public class ClassLoaderIssue {
    public static void main(String[] args) throws Exception {
        // 使用不同的ClassLoader加载同一个类
        URL[] classpath = { /* 类路径 */ };

        ClassLoader loader1 = new URLClassLoader(classpath, null);
        ClassLoader loader2 = new URLClassLoader(classpath, null);

        Class<?> clazz1 = loader1.loadClass("com.example.Singleton");
        Class<?> clazz2 = loader2.loadClass("com.example.Singleton");

        Object s1 = clazz1.getMethod("getInstance").invoke(null);
        Object s2 = clazz2.getMethod("getInstance").invoke(null);

        System.out.println("Same class? " + (clazz1 == clazz2));  // false
        System.out.println("Same instance? " + (s1 == s2));       // false
    }
}
```

**解决方案**：
- 将单例类的加载交由父类加载器或公共的类加载器处理
- 使用容器（如Spring）统一管理单例Bean
- 对于Web应用，在 `web.xml` 中将相关jar放在共享的 `lib` 目录

### 3.6.5 测试困难

单例模式给单元测试带来显著挑战：

```java
/**
 * 演示单例给测试带来的问题
 */
public class OrderService {
    // 直接依赖单例，无法在测试中替换
    private final AppConfigManager config = AppConfigManager.getInstance();

    public void processOrder(Order order) {
        String currency = config.getProperty("currency", "CNY");
        // 使用配置...
    }
}

// 测试时的问题：
// 1. 无法为测试配置特定的环境值
// 2. 测试之间可能存在状态污染
// 3. 无法并行运行依赖同一点单例的测试
```

**缓解措施**：
- 使用依赖注入替代直接调用 `getInstance()`
- 为单例类提供可测试的接口（添加 `reset()` 方法仅在测试中使用）
- 使用 Mock 框架（如 PowerMock）模拟单例，但通常不推荐

## 3.7 优化策略

### 3.7.1 正确处理序列化

对于必须支持序列化的单例类，确保实现 `readResolve()` 方法：

```java
public class ProperSingleton implements Serializable {
    private static final long serialVersionUID = 42L;
    private static final ProperSingleton INSTANCE = new ProperSingleton();
    private final String name;
    private transient final Set<String> blacklist;  // transient字段需单独处理

    private ProperSingleton() {
        this.name = "default";
        this.blacklist = ConcurrentHashMap.newKeySet();
    }

    public static ProperSingleton getInstance() {
        return INSTANCE;
    }

    private Object readResolve() {
        return INSTANCE;  // 防止序列化破坏
    }

    private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
        ois.defaultReadObject();
        // 重建 transient 字段（ConcurrentHashMap的KeySet不能直接序列化）
        // 此处需从实例中获取引用
    }
}
```

### 3.7.2 枚举方式防止反射攻击

枚举是防御反射攻击的最佳方式，无需任何额外代码。JDK在底层直接阻止了对枚举构造函数的反射调用。

### 3.7.3 依赖注入作为替代方案

在Spring等依赖注入框架中，通常不需要手动实现单例模式：

```java
/**
 * 使用依赖注入替代手动单例
 * 将实例管理交给框架，业务代码关注接口而非获取方式
 */

// 定义服务接口
public interface ConfigurationService {
    String getProperty(String key);
    String getProperty(String key, String defaultValue);
}

// 实现类（由Spring容器以单例方式管理）
@Component
public class PropertiesConfigurationService implements ConfigurationService {

    private final Properties properties = new Properties();

    @PostConstruct
    public void init() {
        // 初始化配置文件加载
    }

    @Override
    public String getProperty(String key) {
        return properties.getProperty(key);
    }

    @Override
    public String getProperty(String key, String defaultValue) {
        return properties.getProperty(key, defaultValue);
    }
}

// 使用依赖注入的客户端
@Service
public class UserServiceImpl implements UserService {
    private final ConfigurationService config;  // 依赖接口，不依赖具体实现

    public UserServiceImpl(ConfigurationService config) {  // 构造函数注入
        this.config = config;
    }

    @Override
    public List<User> findAll() {
        String timeout = config.getProperty("db.timeout", "30");
        // ...
        return null;
    }
}
```

**依赖注入 vs 手动单例对比**：

| 维度 | 手动单例 | 依赖注入 |
|------|----------|----------|
| 测试难度 | 难以Mock | 易于Mock |
| 代码侵入性 | getInstance()散落各处 | 构造函数/Set注入，无侵入 |
| 灵活性 | 固定实现 | 可随时替换 |
| 生命周期管理 | 自己管理 | 容器管理 |
| 配置能力 | 无 | AOP，懒加载，作用域等 |

### 3.7.4 何时不应使用单例模式

单例模式不是银弹，以下场景应考虑替代方案：

1. **状态频繁变化的对象**：如果一个对象内部状态经常变化且需要不同的"快照"，应考虑普通对象而非单例。

2. **可能扩展为多实例的场景**：如果未来可能需要多实例（如多租户场景、区域化部署），应避免过早锁定为单例。

3. **依赖外部资源且需要隔离的场景**：不同模块可能需要不同的配置、不同的连接池。

4. **对性能要求极高的系统**：静态内部类方式已足够高效，无需过度优化而采用其他不安全的实现。

5. **涉及跨JVM通信的分布式系统**：JVM级别的单例无法解决分布式环境下的唯一性问题。

### 3.7.5 最佳实践总结

| 场景 | 推荐方式 | 理由 |
|------|----------|------|
| 一般场景 | 枚举方式 | 最安全、最简洁、天然防攻击 |
| 需要延迟加载 | 静态内部类 | 延迟加载+高性能+JVM级线程安全 |
| 使用DI框架 | 信任容器单例 | 由Spring/Guice管理，手动单例反成负担 |
| 需要序列化 | 枚举或readResolve | 枚举天生安全，其他方式必须加readResolve |
| 有状态单例 | 考虑线程安全设计 | volatile、AtomicXXX、synchronized保护可变状态 |
| 分布式环境 | 不使用JVM单例 | 使用Redis/Curator等分布式协调方案 |

## 本章小结

本章深入剖析了单例模式，涵盖了以下核心内容：

1. **核心原理**：私有构造函数 + 静态实例 + 全局访问点，三要素缺一不可。

2. **七种实现方式**：从饿汉式到枚举，每种方式的内部机制、优缺点和适用场景。其中**枚举方式**和**静态内部类方式**是首选实现。

3. **框架应用**：JDK的 `Runtime`（饿汉式）、Spring容器的单例Bean（ConcurrentHashMap缓存 + 同步机制）、日志框架的单例注册表模式。

4. **五大风险**：
   - 线程安全（即使获取实例安全，内部状态仍需保护）
   - 反射攻击（枚举天然防御，其他方式需手动检测）
   - 序列化破坏（`readResolve()` 或枚举防御）
   - ClassLoader隔离（容器统一管理）
   - 测试困难（使用依赖注入替代手动单例）

5. **优化策略**：首选依赖注入框架管理实例，减少手动单例的数量；如需手动实现，使用枚举或静态内部类。

**核心认知**：单例模式的难点不在于"怎么用"，而在于"什么时候不该用"。它引入全局状态，增加了代码的耦合度和测试难度。在现代Java开发中，应优先使用依赖注入框架的容器单例，将实例的生命周期管理交给框架。

---

在下一章中，我们将学习工厂方法模式，它解决了对象创建的耦合问题。
