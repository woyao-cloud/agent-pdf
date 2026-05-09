# 第3章 单例模式（Singleton）

**单例模式**是最简单也是最常用的设计模式之一。它确保一个类只有一个实例，并提供一个全局访问点。

## 3.1 解决的问题与应用场景

### 3.1.1 问题分析

在软件系统中，有些类只需要一个实例：
- 配置文件管理器
- 数据库连接池
- 日志管理器
- 线程池
- 缓存管理器
- 全局计数器

如果创建多个实例，可能导致：
- 资源浪费（重复分配内存）
- 数据不一致（多个实例状态不同步）
- 业务逻辑混乱（无法保证全局唯一性）

### 3.1.2 典型应用场景

**1. 配置管理**
```java
// 整个应用只需要一个配置对象
ConfigManager config = ConfigManager.getInstance();
String dbUrl = config.get("database.url");
```

**2. 数据库连接池**
```java
// 整个应用共享一个连接池
ConnectionPool pool = ConnectionPool.getInstance();
Connection conn = pool.getConnection();
```

**3. 日志记录**
```java
// 统一的日志输出
Logger logger = Logger.getInstance();
logger.info("Application started");
```

**4. 计数器/ID生成器**
```java
// 全局唯一的ID生成器
IdGenerator idGen = IdGenerator.getInstance();
long id = idGen.nextId();
```

## 3.2 实现原理与UML

### 3.2.1 核心思想

单例模式的核心是：
1. **私有构造函数**：防止外部通过new创建实例
2. **私有静态实例**：保存类的唯一实例
3. **公共静态方法**：提供全局访问点

### 3.2.2 UML类图

```
┌─────────────────────────┐
│     Singleton           │
├─────────────────────────┤
│ - instance: Singleton   │  ← 私有静态实例
├─────────────────────────┤
│ - Singleton()           │  ← 私有构造函数
│ + getInstance(): Singleton │ ← 公共静态方法
└─────────────────────────┘
```

### 3.2.3 时序图

```
Client                    Singleton
   │                         │
   │   getInstance()         │
   │ ──────────────────────► │
   │                         │
   │        (创建实例)        │
   │                         │
   │      instance           │
   │ ◄────────────────────── │
   │                         │
```

## 3.3 代码实现（多种方式）

### 3.3.1 饿汉式（静态常量）

```java
public class Singleton {
    // 1. 私有构造函数
    private Singleton() {
    }

    // 2. 私有静态实例（类加载时就创建）
    private static final Singleton INSTANCE = new Singleton();

    // 3. 公共静态方法
    public static Singleton getInstance() {
        return INSTANCE;
    }
}
```

**特点**：
- 线程安全（JVM保证类加载的线程安全性）
- 缺点：类加载时就创建，可能造成资源浪费

### 3.3.2 饿汉式（静态代码块）

```java
public class Singleton {
    private static Singleton INSTANCE;

    static {
        INSTANCE = new Singleton();
    }

    private Singleton() {
    }

    public static Singleton getInstance() {
        return INSTANCE;
    }
}
```

### 3.3.3 懒汉式（线程不安全）

```java
public class Singleton {
    private static Singleton INSTANCE;

    private Singleton() {
    }

    public static Singleton getInstance() {
        if (INSTANCE == null) {
            INSTANCE = new Singleton();
        }
        return INSTANCE;
    }
}
```

**问题**：多线程环境下可能导致创建多个实例

### 3.3.4 懒汉式（同步方法）

```java
public class Singleton {
    private static Singleton INSTANCE;

    private Singleton() {
    }

    // 使用synchronized保证线程安全
    public static synchronized Singleton getInstance() {
        if (INSTANCE == null) {
            INSTANCE = new Singleton();
        }
        return INSTANCE;
    }
}
```

**特点**：
- 线程安全
- 缺点：每次调用都需要同步，影响性能

### 3.3.5 懒汉式（双重检查锁定）

```java
public class Singleton {
    // volatile防止指令重排序
    private static volatile Singleton INSTANCE;

    private Singleton() {
    }

    public static Singleton getInstance() {
        if (INSTANCE == null) {  // 第一次检查
            synchronized (Singleton.class) {
                if (INSTANCE == null) {  // 第二次检查
                    INSTANCE = new Singleton();
                }
            }
        }
        return INSTANCE;
    }
}
```

**关键点**：
- 第一次检查：避免不必要的同步
- 第二次检查：确保只创建一个实例
- volatile：防止指令重排序导致的对象未完全初始化

### 3.3.6 静态内部类

```java
public class Singleton {
    private Singleton() {
    }

    // 静态内部类
    private static class SingletonHolder {
        private static final Singleton INSTANCE = new Singleton();
    }

    public static Singleton getInstance() {
        return SingletonHolder.INSTANCE;
    }
}
```

**原理**：
- JVM保证类的加载是线程安全的
- 只有调用getInstance()时才会加载内部类
- 实现了延迟加载

### 3.3.7 枚举方式（推荐）

```java
public enum Singleton {
    INSTANCE;

    public void doSomething() {
        // 业务方法
    }
}
```

**优点**：
- 线程安全（JVM保证）
- 防止反射攻击
- 防止反序列化创建新实例
- 简洁优雅

### 3.3.8 实现方式对比

| 方式 | 线程安全 | 延迟加载 | 性能 | 反序列化安全 |
|------|----------|----------|------|--------------|
| 饿汉式-静态常量 | 是 | 否 | 高 | 否 |
| 懒汉式-同步方法 | 是 | 是 | 低 | 否 |
| 懒汉式-双重检查 | 是 | 是 | 中 | 否 |
| 静态内部类 | 是 | 是 | 高 | 否 |
| 枚举 | 是 | 否 | 高 | 是 |
| 使用容器 | 是 | 是 | 中 | - |

## 3.4 JDK/框架源码解析

### 3.4.1 JDK中的单例模式

**1. Runtime类**
```java
public class Runtime {
    private static Runtime currentRuntime = new Runtime();

    public static Runtime getRuntime() {
        return currentRuntime;
    }

    private Runtime() {
    }
    // ...
}
```
使用了典型的饿汉式实现。

**2. Desktop类（管理桌面资源）**
```java
public class Desktop {
    // 单例模式
    private static Desktop desktop;
    
    private Desktop() {}
    
    public static Desktop getDesktop() {
        synchronized(Desktop.class) {
            if (desktop == null) {
                desktop = new Desktop();
            }
        }
        return desktop;
    }
}
```

**3. LookAndFeel类**
```java
public class UIManager {
    private static LookAndFeel lookAndFeel;
    // ...
}
```

### 3.4.2 Spring框架中的单例

Spring框架默认使用单例模式管理Bean：
```java
// Spring默认Scope为singleton
@Component
public class UserService {
    // 整个应用只有一个实例
}
```

Spring的单例实现：
```java
// AbstractBeanFactory中
if (mbd.isSingleton()) {
    sharedInstance = getSingleton(beanName, () -> {
        return createBean(beanName, mbd, args);
    });
}
```

### 3.4.3 其他框架应用

**MyBatis**
```java
// DefaultSqlSessionFactory
public class DefaultSqlSessionFactory implements SqlSessionFactory {
    private final Configuration configuration;
    // 单例SqlSessionFactory
}
```

**日志框架Log4j**
```java
// Logger类
public class LogManager {
    // 多种单例管理方式
}
```

## 3.5 使用场景与案例

### 3.5.1 配置管理

```java
public class AppConfig {
    private static volatile AppConfig instance;
    private Properties properties;

    private AppConfig() {
        properties = new Properties();
        try {
            properties.load(getClass().getClassLoader()
                .getResourceAsStream("app.properties"));
        } catch (IOException e) {
            throw new RuntimeException("Failed to load config", e);
        }
    }

    public static AppConfig getInstance() {
        if (instance == null) {
            synchronized (AppConfig.class) {
                if (instance == null) {
                    instance = new AppConfig();
                }
            }
        }
        return instance;
    }

    public String get(String key) {
        return properties.getProperty(key);
    }
}
```

### 3.5.2 数据库连接池

```java
public class ConnectionPool {
    private static volatile ConnectionPool instance;
    private final List<Connection> availableConnections;
    private final List<Connection> usedConnections;
    private final int poolSize = 10;

    private ConnectionPool() {
        availableConnections = new ArrayList<>();
        usedConnections = new ArrayList<>();
        // 初始化连接池
        for (int i = 0; i < poolSize; i++) {
            availableConnections.add(createConnection());
        }
    }

    public static ConnectionPool getInstance() {
        if (instance == null) {
            synchronized (ConnectionPool.class) {
                if (instance == null) {
                    instance = new ConnectionPool();
                }
            }
        }
        return instance;
    }

    public synchronized Connection getConnection() {
        if (availableConnections.isEmpty()) {
            throw new RuntimeException("No available connections");
        }
        Connection conn = availableConnections.remove(0);
        usedConnections.add(conn);
        return conn;
    }

    public synchronized void releaseConnection(Connection conn) {
        usedConnections.remove(conn);
        availableConnections.add(conn);
    }

    private Connection createConnection() {
        // 创建数据库连接
        return null;
    }
}
```

### 3.5.3 缓存管理器

```java
public class CacheManager {
    private static final CacheManager INSTANCE = new CacheManager();
    private final Map<String, Object> cache = new ConcurrentHashMap<>();

    private CacheManager() {
    }

    public static CacheManager getInstance() {
        return INSTANCE;
    }

    public void put(String key, Object value) {
        cache.put(key, value);
    }

    public Object get(String key) {
        return cache.get(key);
    }

    public void remove(String key) {
        cache.remove(key);
    }

    public void clear() {
        cache.clear();
    }
}
```

### 3.5.4 全局ID生成器

```java
public class IdGenerator {
    private static final IdGenerator INSTANCE = new IdGenerator();
    private final AtomicLong id = new AtomicLong(0);

    private IdGenerator() {
    }

    public static IdGenerator getInstance() {
        return INSTANCE;
    }

    public long nextId() {
        return id.incrementAndGet();
    }
}
```

## 3.6 潜在风险与问题

### 3.6.1 线程安全问题

**问题场景**：
```java
// 懒汉式（线程不安全）
public class BadSingleton {
    private static BadSingleton INSTANCE;

    private BadSingleton() {
    }

    public static BadSingleton getInstance() {
        if (INSTANCE == null) {  // 多个线程可能同时通过
            INSTANCE = new BadSingleton();
        }
        return INSTANCE;
    }
}
```

多线程下可能创建多个实例：
```
时间线:
T1: 检查INSTANCE为null，进入同步块
T2: 检查INSTANCE为null，进入同步块  
T3: T1创建实例
T4: T2也创建实例（覆盖T1的实例）
```

### 3.6.2 反射攻击

通过反射可以调用私有构造函数：
```java
public class ReflectAttack {
    public static void main(String[] args) throws Exception {
        Singleton s1 = Singleton.getInstance();
        
        // 通过反射创建新实例
        Constructor<Singleton> constructor = Singleton.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        Singleton s2 = constructor.newInstance();
        
        System.out.println(s1 == s2);  // false
    }
}
```

**解决方案**：枚举方式天然防止反射攻击；或添加标志位：
```java
private static boolean flag = false;

private Singleton() {
    synchronized (Singleton.class) {
        if (flag) {
            throw new RuntimeException("Cannot create more instances");
        }
        flag = true;
    }
}
```

### 3.6.3 反序列化问题

对象序列化后再反序列化会创建新实例：
```java
// 序列化
Singleton s1 = Singleton.getInstance();
ObjectOutputStream oos = new ObjectOutputStream(
    new FileOutputStream("singleton.ser"));
oos.writeObject(s1);
oos.close();

// 反序列化
ObjectInputStream ois = new ObjectInputStream(
    new FileInputStream("singleton.ser"));
Singleton s2 = (Singleton) ois.readObject();

System.out.println(s1 == s2);  // false
```

**解决方案**：添加readResolve方法：
```java
protected Object readResolve() {
    return getInstance();
}
```

或使用枚举方式（自动防止此问题）

### 3.6.4 内存泄漏风险

单例持有长生命周期对象可能导致内存泄漏：
```java
public class BadSingleton {
    private static BadSingleton INSTANCE;
    private Context context;  // 持有Activity Context

    public void setContext(Context context) {
        this.context = context;  // Activity销毁后无法GC
    }
}
```

**解决方案**：使用Application Context而非Activity Context

### 3.6.5 测试困难

- 单例难以mock
- 测试用例之间可能有状态污染
- 无法为每个测试创建独立实例

**解决方案**：
- 使用依赖注入框架
- 设计可测试的API
- 使用测试替身

## 3.7 优化策略

### 3.7.1 延迟初始化

对于重量级资源，使用延迟加载：
```java
public class LazySingleton {
    private static class Holder {
        static final LazySingleton INSTANCE = new LazySingleton();
    }

    public static LazySingleton getInstance() {
        return Holder.INSTANCE;
    }
}
```

### 3.7.2 泛型单例

创建可复用的单例工厂：
```java
public class SingletonFactory<T> {
    private static final Map<Class<?>, Object> INSTANCES = 
        new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    public static <T> T getInstance(Class<T> clazz) {
        return (T) INSTANCES.computeIfAbsent(clazz, c -> {
            try {
                return c.getDeclaredConstructor().newInstance();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
}
```

### 3.7.3 扩展：多例模式

有时需要限制实例数量为N个：
```java
public class MultiInstance {
    private static final int MAX_COUNT = 3;
    private static final List<MultiInstance> instances = new ArrayList<>();
    private static int count = 0;

    private MultiInstance() {
    }

    public static synchronized MultiInstance getInstance() {
        if (instances.size() < MAX_COUNT) {
            instances.add(new MultiInstance());
        }
        return instances.get(count++ % MAX_COUNT);
    }
}
```

### 3.7.4 容器单例

使用容器管理多种单例：
```java
public class SingletonContainer {
    private static final Map<String, Object> SINGLETONS = 
        new ConcurrentHashMap<>();

    public static void register(String name, Object instance) {
        SINGLETONS.put(name, instance);
    }

    public static <T> T get(String name, Class<T> clazz) {
        return clazz.cast(SINGLETONS.get(name));
    }
}
```

### 3.7.5 最佳实践总结

| 场景 | 推荐方式 |
|------|----------|
| 简单场景 | 枚举方式 |
| 延迟加载 | 静态内部类 |
| 需要序列化安全 | 枚举方式 |
| 需要防止反射 | 枚举方式 |
| 一般场景 | 双重检查锁定 |
| 复杂单例管理 | 容器方式 |

## 本章小结

本章详细介绍了单例模式：

1. **解决的问题**：确保类只有一个实例，避免资源浪费和数据不一致
2. **实现方式**：饿汉式、懒汉式、双重检查、静态内部类、枚举
3. **框架应用**：JDK Runtime、Spring、MyBatis等
4. **潜在问题**：线程安全、反射攻击、反序列化、内存泄漏
5. **优化策略**：延迟加载、泛型单例、容器管理

**推荐使用枚举方式**，它简洁、线程安全、防止反射和反序列化。

---
在下一章中，我们将学习工厂方法模式。