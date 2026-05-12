# 第13章 代理模式（Proxy）

**代理模式**（Proxy Pattern）是一种结构型设计模式，它为另一个对象提供一个替身或占位符，以控制对该对象的访问。代理对象在客户端和目标对象之间起到中介作用，可以在不修改目标对象的前提下，增加访问控制、延迟加载、日志记录、性能监控等横切关注点。

代理模式是所有 AOP（面向切面编程）框架的基础技术。

## 13.1 解决的问题与应用场景

### 13.1.1 问题分析

在面向对象编程中，有时我们需要对某个对象的访问进行控制或增强，但又不想修改目标对象本身的代码。典型的场景包括：

**场景一：延迟加载**。一个大对象（如高清图片、视频文件）的创建成本很高，我们希望只有在真正需要使用时才创建它。

**场景二：访问控制**。某些敏感操作（如删除数据、修改配置）需要根据用户的权限进行拦截。

**场景三：远程调用**。对象位于另一台服务器上，客户端需要像调用本地对象一样调用远程服务的方法。

**场景四：日志与监控**。需要记录每次方法调用的参数、返回值和执行时间，但又不想在每个方法中添加日志代码。

**场景五：缓存**。对于频繁调用的查询操作，希望将结果缓存起来，避免重复计算或数据库查询。

如果直接在目标对象中实现这些功能，会导致代码职责混乱，违反单一职责原则。代理模式通过引入代理对象来解决这个问题。

### 13.1.2 代理模式的分类

代理模式根据用途的不同，可分为以下几种类型：

| 代理类型 | 用途 | 典型场景 |
|----------|------|----------|
| **虚拟代理** (Virtual Proxy) | 延迟加载大对象 | 图片懒加载、大文件加载 |
| **保护代理** (Protection Proxy) | 控制访问权限 | 权限校验、操作审计 |
| **远程代理** (Remote Proxy) | 访问远程服务 | RMI、gRPC stub、RPC 客户端 |
| **缓存代理** (Cache Proxy) | 缓存重复计算结果 | 查询缓存、计算结果缓存 |
| **日志代理** (Logging Proxy) | 记录方法调用日志 | 请求日志、操作审计 |
| **智能引用** (Smart Reference) | 管理对象的引用计数 | 连接池代理、引用计数 |

### 13.1.3 典型问题示例

```java
// 没有代理模式：在业务方法中直接添加横切关注点
// 问题：日志、缓存、权限等代码与业务逻辑混合在一起
public class UserServiceWithoutProxy {
    private final Map<Long, User> cache = new HashMap<>();
    private final Logger logger = Logger.getLogger("UserService");

    public User findById(Long id) {
        logger.info("开始查询用户: " + id);  // 日志逻辑

        // 权限检查逻辑
        if (!SecurityContext.hasPermission("USER_READ")) {
            throw new SecurityException("无权限");
        }

        // 缓存逻辑
        if (cache.containsKey(id)) {
            logger.info("从缓存获取用户: " + id);
            return cache.get(id);
        }

        // 核心业务逻辑
        User user = queryFromDatabase(id);

        // 缓存逻辑
        cache.put(id, user);

        // 日志逻辑
        logger.info("从数据库查询用户: " + id);
        return user;
    }

    private User queryFromDatabase(Long id) {
        // 模拟数据库查询
        return new User(id, "User" + id);
    }
}
```

## 13.2 实现原理与UML

### 13.2.1 核心思想

代理模式的核心是：**代理对象与目标对象实现相同的接口**，客户端通过代理对象间接访问目标对象，代理对象在调用目标对象的前后可以插入额外的逻辑。

关键设计原则：
- 代理对象与目标对象遵循相同的接口契约。
- 客户端无需知道正在使用目标对象还是代理对象。
- 代理对象持有目标对象的引用，负责委托调用。

### 13.2.2 UML类图

```
┌──────────────────────┐
│       Client         │                ┌──────────────────────┐
│                      │                │      <<interface>>   │
│ 使用 Subject 接口     │                │       Subject        │
└──────────┬───────────┘                │     (抽象主题)        │
           │                            ├──────────────────────┤
           │                            │ + request(): void    │
           │                            └──────────┬───────────┘
           │                                       │
           │                       ┌───────────────┴───────────────┐
           ▼                       │                               │
┌──────────────────────┐  ┌───────┴────────┐              ┌───────┴────────┐
│                      │  │                │              │                │
│    RealSubject       │  │    Proxy       │              │    Proxy       │
│   (真实主题)          │  │   (代理对象)    │              │   (不同变体)    │
│                      │  │                │              │                │
├──────────────────────┤  ├────────────────┤              ├────────────────┤
│ + request(): void    │◄─│ - realSubject  │              │ - realSubject  │
│                      │  │ + request()    │              │ + request()    │
│  实际执行业务逻辑      │  │                │              │                │
│                      │  │ 在调用前后添加    │              │ 虚拟/保护/缓存   │
│                      │  │ 额外的控制逻辑    │              │ 等不同职责       │
└──────────────────────┘  └────────────────┘              └────────────────┘
```

### 13.2.3 角色分析

| 角色 | 职责 | 说明 |
|------|------|------|
| **Subject（抽象主题）** | 定义 RealSubject 和 Proxy 的共同接口 | 通常是一个接口或抽象类 |
| **RealSubject（真实主题）** | 真正执行业务逻辑的对象 | 代理所代表的真实对象 |
| **Proxy（代理）** | 持有 RealSubject 的引用，实现 Subject 接口 | 控制对 RealSubject 的访问 |

### 13.2.4 时序图

```
Client                      Proxy                       RealSubject
   │                          │                              │
   │      request()           │                              │
   │ ───────────────────────► │                              │
   │                          │                              │
   │                          │  (前置处理：权限检查/日志/缓存)   │
   │                          │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
   │                          │                              │
   │                          │        request()             │
   │                          │ ────────────────────────────►│
   │                          │                              │
   │                          │                              │── 执行业务逻辑
   │                          │                              │
   │                          │        result                │
   │                          │ ◄──────────────────────────── │
   │                          │                              │
   │                          │  (后置处理：日志/缓存存储/监控)  │
   │                          │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
   │                          │                              │
   │        result            │                              │
   │ ◄─────────────────────── │                              │
   │                          │                              │
```

### 13.2.5 代理模式 vs 装饰器模式对比

这是一个常见的混淆点。两者都使用"包装"的方式，但目的不同：

| 对比维度 | 代理模式 | 装饰器模式 |
|----------|----------|------------|
| 关注点 | 控制访问（访问控制、延迟加载） | 增强功能（添加新职责） |
| 实例关系 | 代理与目标是一对一 | 装饰器可以多层嵌套 |
| 构造方式 | 代理通常自行创建或管理目标对象 | 装饰器通过构造函数传入被装饰对象 |
| 关注透明性 | 对客户端透明 | 客户端知道在使用装饰器 |
| 典型场景 | AOP、远程调用、权限控制 | Java I/O 流嵌套增强 |

## 13.3 代码实现（静态/动态/JDK/CGLib）

### 13.3.1 静态代理

静态代理在编译期就已确定代理类。每个代理类只服务于特定的接口和目标类。

**抽象主题接口**

```java
/**
 * 文档接口 - Subject
 */
public interface Document {
    String readContent();
    void writeContent(String content);
    void delete();
}
```

**真实主题**

```java
/**
 * 真实的文档实现 - RealSubject
 */
public class RealDocument implements Document {
    private final String docId;
    private String content;

    public RealDocument(String docId, String content) {
        this.docId = docId;
        this.content = content;
    }

    @Override
    public String readContent() {
        System.out.println("[RealDocument] 读取文档: " + docId);
        return content;
    }

    @Override
    public void writeContent(String content) {
        this.content = content;
        System.out.println("[RealDocument] 写入文档: " + docId);
    }

    @Override
    public void delete() {
        System.out.println("[RealDocument] 删除文档: " + docId);
    }

    public String getDocId() {
        return docId;
    }
}
```

**保护代理（静态代理）**

```java
/**
 * 文档保护代理（静态代理） - Protection Proxy
 * 根据用户角色控制对文档的访问权限
 */
public class DocumentProtectionProxy implements Document {
    private final RealDocument target;
    private final String userRole;

    public DocumentProtectionProxy(RealDocument target, String userRole) {
        this.target = target;
        this.userRole = userRole;
    }

    @Override
    public String readContent() {
        // 读操作允许所有角色
        logAccess("READ");
        return target.readContent();
    }

    @Override
    public void writeContent(String content) {
        // 写操作仅允许 ADMIN 和 EDITOR
        if (!hasRole("ADMIN", "EDITOR")) {
            throw new SecurityException(
                    "角色 [" + userRole + "] 没有写入权限");
        }
        logAccess("WRITE");
        target.writeContent(content);
    }

    @Override
    public void delete() {
        // 删除操作仅允许 ADMIN
        if (!hasRole("ADMIN")) {
            throw new SecurityException(
                    "角色 [" + userRole + "] 没有删除权限");
        }
        logAccess("DELETE");
        target.delete();
    }

    private boolean hasRole(String... allowedRoles) {
        for (String role : allowedRoles) {
            if (role.equalsIgnoreCase(userRole)) {
                return true;
            }
        }
        return false;
    }

    private void logAccess(String operation) {
        System.out.println("[审计日志] 用户角色=" + userRole
                + ", 操作=" + operation + ", 文档=" + target.getDocId());
    }
}
```

**虚拟代理（静态代理）**

```java
/**
 * 图片虚拟代理 - Virtual Proxy
 * 延迟加载高分辨率图片，首次访问时才真正加载
 */
public class ImageVirtualProxy implements Image {

    private final String fileName;
    private HighResolutionImage realImage; // 延迟初始化

    public ImageVirtualProxy(String fileName) {
        this.fileName = fileName;
    }

    @Override
    public void display() {
        if (realImage == null) {
            System.out.println("[虚拟代理] 首次访问，开始加载高分辨率图片: " + fileName);
            realImage = new HighResolutionImage(fileName);
        }
        realImage.display();
    }

    @Override
    public String getFileName() {
        return fileName;
    }

    @Override
    public long getFileSize() {
        // 元数据可以立即返回，不需要加载真实图片
        return getEstimatedSize();
    }

    private long getEstimatedSize() {
        // 模拟从文件头读取图片元数据
        return 1024 * 1024 * 5; // 5MB
    }
}

/**
 * 图片接口
 */
interface Image {
    void display();
    String getFileName();
    long getFileSize();
}

/**
 * 高分辨率图片 - 构造代价高昂
 */
class HighResolutionImage implements Image {
    private final String fileName;

    public HighResolutionImage(String fileName) {
        this.fileName = fileName;
        // 模拟加载高分辨率图片的耗时操作
        System.out.println("    [真实图片] 正在从磁盘加载图片（耗时操作）...");
        try {
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("    [真实图片] 加载完成: " + fileName);
    }

    @Override
    public void display() {
        System.out.println("    [真实图片] 显示: " + fileName);
    }

    @Override
    public String getFileName() {
        return fileName;
    }

    @Override
    public long getFileSize() {
        return 1024 * 1024 * 5;
    }
}
```

**静态代理测试**

```java
public class StaticProxyTest {
    public static void main(String[] args) {
        // === 测试保护代理 ===
        System.out.println("======= 保护代理测试 =======");
        RealDocument document = new RealDocument("DOC-001", "机密文件内容");

        // Admin角色：拥有全部权限
        Document adminProxy = new DocumentProtectionProxy(document, "ADMIN");
        System.out.println("--- ADMIN 用户操作 ---");
        adminProxy.readContent();
        adminProxy.writeContent("更新内容");
        adminProxy.delete();

        // Viewer角色：只有读权限
        Document viewerProxy = new DocumentProtectionProxy(document, "VIEWER");
        System.out.println("\n--- VIEWER 用户操作 ---");
        viewerProxy.readContent();
        try {
            viewerProxy.writeContent("尝试修改");
        } catch (SecurityException e) {
            System.out.println("操作被拦截: " + e.getMessage());
        }

        // === 测试虚拟代理 ===
        System.out.println("\n======= 虚拟代理测试 =======");
        ImageVirtualProxy imageProxy = new ImageVirtualProxy("vacation.jpg");
        System.out.println("代理已创建，但真实图片尚未加载");

        // 获取元数据（不需要加载真实图片）
        System.out.println("文件名: " + imageProxy.getFileName());
        System.out.println("文件大小: " + imageProxy.getFileSize() / 1024 / 1024 + "MB");

        // 首次调用 display() 触发加载
        imageProxy.display();

        // 再次调用 display() 复用已加载的图片
        imageProxy.display();
    }
}
```

### 13.3.2 JDK 动态代理

JDK 动态代理利用 `java.lang.reflect.Proxy` 和 `InvocationHandler` 在运行时动态生成代理类。所有方法调用都会进入 `invoke()` 方法进行统一处理。

**核心组件**

| 类/接口 | 作用 |
|---------|------|
| `java.lang.reflect.Proxy` | 创建动态代理类的工厂方法 |
| `java.lang.reflect.InvocationHandler` | 代理方法的调用处理接口 |
| `java.lang.reflect.Method` | 被调用的方法反射对象 |

**服务接口与实现**

```java
import java.util.List;

/**
 * 用户服务接口 - Subject
 */
public interface UserService {
    UserDTO findById(Long id);
    List<UserDTO> findAll();
    void save(UserDTO user);
    void delete(Long id);
}

/**
 * 用户数据传输对象
 */
class UserDTO {
    private Long id;
    private String username;
    private String email;

    public UserDTO(Long id, String username, String email) {
        this.id = id;
        this.username = username;
        this.email = email;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }

    @Override
    public String toString() {
        return "UserDTO{id=" + id + ", username='" + username + "'}";
    }
}

/**
 * 用户服务实现 - RealSubject
 */
public class UserServiceImpl implements UserService {

    @Override
    public UserDTO findById(Long id) {
        // 模拟数据库查询
        System.out.println("  [数据库] SELECT * FROM users WHERE id = " + id);
        simulateDelay(300);
        return new UserDTO(id, "用户" + id, "user" + id + "@example.com");
    }

    @Override
    public List<UserDTO> findAll() {
        System.out.println("  [数据库] SELECT * FROM users");
        simulateDelay(500);
        return List.of(
                new UserDTO(1L, "张三", "zhangsan@example.com"),
                new UserDTO(2L, "李四", "lisi@example.com")
        );
    }

    @Override
    public void save(UserDTO user) {
        System.out.println("  [数据库] INSERT INTO users ...");
        System.out.println("  [数据库] 保存用户: " + user.getUsername());
    }

    @Override
    public void delete(Long id) {
        System.out.println("  [数据库] DELETE FROM users WHERE id = " + id);
    }

    private void simulateDelay(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

**日志代理（JDK动态代理）**

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;

/**
 * 日志代理 - JDK动态代理实现
 * 统一拦截所有方法调用，记录日志和执行时间
 */
public class LoggingProxy implements InvocationHandler {
    private final Object target;

    public LoggingProxy(Object target) {
        this.target = target;
    }

    /**
     * 创建代理对象的工厂方法
     */
    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target) {
        return (T) Proxy.newProxyInstance(
                target.getClass().getClassLoader(),
                target.getClass().getInterfaces(),
                new LoggingProxy(target)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        String methodName = method.getName();
        String argsStr = args != null ? Arrays.toString(args) : "[]";

        System.out.println("[日志代理] >>> 调用开始: " + methodName + argsStr);
        long startTime = System.currentTimeMillis();

        // 调用真实目标方法
        Object result = method.invoke(target, args);

        long elapsed = System.currentTimeMillis() - startTime;
        System.out.println("[日志代理] <<< 调用完成: " + methodName
                + ", 耗时: " + elapsed + "ms");

        return result;
    }
}
```

**缓存代理（JDK动态代理）**

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 缓存代理 - JDK动态代理实现
 * 对查询方法的结果进行缓存
 */
public class CacheProxy implements InvocationHandler {
    private final Object target;
    private final Map<String, Object> cache = new ConcurrentHashMap<>();

    public CacheProxy(Object target) {
        this.target = target;
    }

    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target) {
        return (T) Proxy.newProxyInstance(
                target.getClass().getClassLoader(),
                target.getClass().getInterfaces(),
                new CacheProxy(target)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 只对查询方法使用缓存
        if (!isQueryMethod(method.getName())) {
            return method.invoke(target, args);
        }

        String cacheKey = buildCacheKey(method, args);

        if (cache.containsKey(cacheKey)) {
            System.out.println("[缓存代理] 缓存命中: " + cacheKey);
            return cache.get(cacheKey);
        }

        System.out.println("[缓存代理] 缓存未命中，执行查询: " + cacheKey);
        Object result = method.invoke(target, args);
        cache.put(cacheKey, result);
        return result;
    }

    private boolean isQueryMethod(String methodName) {
        return methodName.startsWith("find") || methodName.startsWith("get");
    }

    private String buildCacheKey(Method method, Object[] args) {
        return method.getDeclaringClass().getSimpleName()
                + "." + method.getName()
                + ":" + Arrays.toString(args);
    }
}
```

**权限代理（JDK动态代理）**

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * 权限控制代理 - JDK动态代理实现
 * 基于注解的声明式权限控制
 */
public class SecurityProxy implements InvocationHandler {
    private final Object target;
    private final String currentUserRole;

    public SecurityProxy(Object target, String currentUserRole) {
        this.target = target;
        this.currentUserRole = currentUserRole;
    }

    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target, String userRole) {
        return (T) Proxy.newProxyInstance(
                target.getClass().getClassLoader(),
                target.getClass().getInterfaces(),
                new SecurityProxy(target, userRole)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 检查方法上的权限注解
        RequiresRole requiresRole = method.getAnnotation(RequiresRole.class);

        if (requiresRole != null) {
            String requiredRole = requiresRole.value();
            if (!requiredRole.equalsIgnoreCase(currentUserRole)) {
                throw new SecurityException(
                        "方法 [" + method.getName() + "] 需要角色 ["
                                + requiredRole + "], 当前角色 [" + currentUserRole + "]");
            }
            System.out.println("[权限代理] 权限验证通过: " + method.getName());
        }

        return method.invoke(target, args);
    }
}

/**
 * 权限要求注解
 */
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
@interface RequiresRole {
    String value();
}
```

**JDK动态代理链式组合测试**

```java
public class JdkDynamicProxyTest {
    public static void main(String[] args) {
        // 创建真实服务实现
        UserService realService = new UserServiceImpl();

        // 代理链组装：日志代理 (外层) -> 缓存代理 -> 权限代理 -> 真实服务
        // 注意：创建顺序是从内到外
        UserService securedService =
                SecurityProxy.createProxy(realService, "ADMIN");
        UserService cachedService =
                CacheProxy.createProxy(securedService);
        UserService loggedService =
                LoggingProxy.createProxy(cachedService);

        System.out.println("======= 代理链测试 =======\n");

        // 第一次查询：经过完整代理链，最终查数据库
        System.out.println("--- 第 1 次查询用户 ID=1 ---");
        UserDTO user1 = loggedService.findById(1L);
        System.out.println("结果: " + user1 + "\n");

        // 第二次查询：缓存命中，不查数据库
        System.out.println("--- 第 2 次查询用户 ID=1 ---");
        UserDTO user2 = loggedService.findById(1L);
        System.out.println("结果: " + user2 + "\n");

        // 保存操作：经过日志 + 权限，不经过缓存
        System.out.println("--- 保存新用户 ---");
        loggedService.save(new UserDTO(3L, "王五", "wangwu@example.com"));
    }
}
```

### 13.3.3 CGLIB 动态代理

CGLIB（Code Generation Library）通过生成目标类的**子类**来实现代理，不要求目标类实现接口。

**适用场景**：
- 目标类没有实现接口
- 需要代理 `final` 修饰的方法（无法代理）
- Spring AOP 在对没有接口的类进行代理时默认使用 CGLIB

```xml
<!-- Maven 依赖 -->
<dependency>
    <groupId>cglib</groupId>
    <artifactId>cglib</artifactId>
    <version>3.3.0</version>
</dependency>
```

```java
import net.sf.cglib.proxy.Enhancer;
import net.sf.cglib.proxy.MethodInterceptor;
import net.sf.cglib.proxy.MethodProxy;

import java.lang.reflect.Method;
import java.util.Arrays;

/**
 * 没有实现接口的目标类
 */
public class ProductRepository {

    public Product findById(Long id) {
        System.out.println("  [数据库] 查询商品: id=" + id);
        return new Product(id, "商品" + id, 99.0);
    }

    public void save(Product product) {
        System.out.println("  [数据库] 保存商品: " + product.getName());
    }

    public void delete(Long id) {
        System.out.println("  [数据库] 删除商品: id=" + id);
    }

    // final 方法无法被 CGLIB 代理
    public final String getVersion() {
        return "1.0.0";
    }
}

/**
 * 商品实体
 */
class Product {
    private Long id;
    private String name;
    private double price;

    public Product(Long id, String name, double price) {
        this.id = id;
        this.name = name;
        this.price = price;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public double getPrice() { return price; }
}

/**
 * CGLIB 性能监控代理
 */
public class CglibPerformanceProxy implements MethodInterceptor {
    private final Object target;

    public CglibPerformanceProxy(Object target) {
        this.target = target;
    }

    /**
     * 创建 CGLIB 代理
     */
    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target) {
        Enhancer enhancer = new Enhancer();
        enhancer.setSuperclass(target.getClass());  // 设置父类为目标类
        enhancer.setCallback(new CglibPerformanceProxy(target));
        return (T) enhancer.create();
    }

    @Override
    public Object intercept(Object obj, Method method, Object[] args,
                            MethodProxy proxy) throws Throwable {
        String methodName = method.getName();
        String argsStr = Arrays.toString(args);

        long start = System.nanoTime();

        // 调用父类（目标对象）的方法
        // 使用 proxy.invokeSuper 比 method.invoke 效率更高
        Object result = proxy.invokeSuper(obj, args);

        long elapsed = System.nanoTime() - start;
        System.out.println("[CGLIB性能代理] " + methodName + argsStr
                + " 耗时: " + (elapsed / 1000) + "μs");

        return result;
    }
}

/**
 * CGLIB 代理测试
 */
public class CglibProxyTest {
    public static void main(String[] args) {
        // 创建真实对象和代理
        ProductRepository realRepo = new ProductRepository();
        ProductRepository proxyRepo = CglibPerformanceProxy.createProxy(realRepo);

        System.out.println("======= CGLIB 代理测试 =======\n");

        // 通过代理调用
        Product product = proxyRepo.findById(1L);
        proxyRepo.save(product);
        proxyRepo.delete(1L);

        // final 方法无法被代理，直接调用原始方法
        System.out.println("\n注意：final 方法不被代理");
        System.out.println("版本: " + proxyRepo.getVersion());

        // 验证代理类型
        System.out.println("\n代理对象类型: " + proxyRepo.getClass().getName());
        // 输出类似: ProductRepository$$EnhancerByCGLIB$$xxxx
    }
}
```

### 13.3.4 JDK 动态代理 vs CGLIB 动态代理详细对比

| 对比维度 | JDK 动态代理 | CGLIB 动态代理 |
|----------|-------------|----------------|
| **实现机制** | 运行时生成实现接口的代理类 | 运行时生成目标类的子类 |
| **前置条件** | 目标类必须实现至少一个接口 | 目标类不能是 final 的 |
| **方法拦截** | 所有接口方法通过 `InvocationHandler.invoke()` | 非 final 方法通过 `MethodInterceptor.intercept()` |
| **代理对象类型** | `com.sun.proxy.$ProxyN` | `TargetClass$$EnhancerByCGLIB$$xxxx` |
| **创建开销** | 较快 | 较慢（需要生成字节码） |
| **调用开销** | 使用反射 `Method.invoke()` | 使用 `MethodProxy.invokeSuper()`（更快） |
| **final方法** | N/A（基于接口） | 无法代理 |
| **Spring 策略** | 目标有接口时默认使用 | 目标无接口时默认使用 |
| **适用场景** | 面向接口编程 | 需要代理无接口的类 |

### 13.3.5 性能对比基准测试

```java
/**
 * 代理类型性能对比（简化版基准测试）
 */
public class ProxyBenchmark {

    private static final int WARMUP_ITERATIONS = 10000;
    private static final int TEST_ITERATIONS = 100000;

    public static void main(String[] args) {
        UserService realService = new UserServiceImpl();

        // 预热 JVM
        System.out.println("预热中...");
        warmup(realService);

        // JDK 动态代理性能测试
        UserService jdkProxy = LoggingProxy.createProxy(realService);
        long jdkTime = benchmark(jdkProxy, "JDK动态代理");

        // CGLIB 代理性能测试
        // 注意：UserServiceImpl 需要去掉 final 修饰
        long cglibTime = benchmarkCglib(realService);

        // 直接调用（无代理）性能测试
        long directTime = benchmark(realService, "直接调用");

        System.out.println("\n========== 性能对比 (操作次数: " + TEST_ITERATIONS + ") ==========");
        System.out.printf("直接调用:  %6d ms (基准)%n", directTime);
        System.out.printf("JDK代理:   %6d ms (%.1f 倍慢)%n",
                jdkTime, (double) jdkTime / directTime);
        System.out.printf("CGLIB代理: %6d ms (%.1f 倍慢)%n",
                cglibTime, (double) cglibTime / directTime);
    }

    private static void warmup(UserService service) {
        for (int i = 0; i < WARMUP_ITERATIONS; i++) {
            service.findById((long) (i % 100));
        }
    }

    private static long benchmark(UserService service, String label) {
        long start = System.currentTimeMillis();
        for (int i = 0; i < TEST_ITERATIONS; i++) {
            service.findById((long) (i % 100));
        }
        long elapsed = System.currentTimeMillis() - start;
        System.out.println(label + " 耗时: " + elapsed + "ms");
        return elapsed;
    }

    private static long benchmarkCglib(UserService realService) {
        // 需要将 UserServiceImpl 类传入 CGLIB
        Object cglibProxy = CglibPerformanceProxy.createProxy(
                new UserServiceImpl() // 匿名实例用于基准测试
        );
        UserService cglibService = (UserService) cglibProxy;

        long start = System.currentTimeMillis();
        for (int i = 0; i < TEST_ITERATIONS; i++) {
            cglibService.findById((long) (i % 100));
        }
        long elapsed = System.currentTimeMillis() - start;
        System.out.println("CGLIB代理 耗时: " + elapsed + "ms");
        return elapsed;
    }
}
```

## 13.4 JDK/框架源码解析

### 13.4.1 Spring AOP：代理模式的集大成者

Spring AOP 是代理模式最重要的应用实践。它综合使用 JDK 动态代理和 CGLIB，提供声明式的事务管理、安全控制、日志记录等功能。

```java
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;

/**
 * Spring AOP 自动代理选择逻辑（简化版）
 *
 * Spring 的 DefaultAopProxyFactory 决策逻辑：
 * 1. 如果目标类实现了接口 → 使用 JdkDynamicAopProxy (JDK动态代理)
 * 2. 如果目标类未实现接口 → 使用 CglibAopProxy (CGLIB代理)
 * 3. 可通过 proxyTargetClass=true 强制使用 CGLIB
 */
@Configuration
@EnableAspectJAutoProxy
// @EnableAspectJAutoProxy(proxyTargetClass = true) // 强制使用 CGLIB
public class AopConfig {
}
```

**Spring AOP 切面示例**

```java
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

/**
 * 性能监控切面
 * 底层通过 JDK 动态代理或 CGLIB 实现
 */
@Aspect
@Component
public class PerformanceMonitoringAspect {

    @Pointcut("execution(* com.example.service.*.*(..))")
    public void serviceLayer() {
    }

    @Around("serviceLayer()")
    public Object monitor(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        long start = System.currentTimeMillis();

        try {
            return joinPoint.proceed();  // 执行目标方法
        } finally {
            long elapsed = System.currentTimeMillis() - start;
            System.out.println("[AOP监控] " + methodName + " 耗时: " + elapsed + "ms");
        }
    }
}
```

### 13.4.2 MyBatis Mapper 代理

MyBatis 使用 JDK 动态代理为 Mapper 接口生成实现类。开发者只需要定义接口和 SQL 映射，MyBatis 在运行时会动态创建 Mapper 接口的代理实现。

```java
import org.apache.ibatis.binding.MapperProxy;
import org.apache.ibatis.session.SqlSession;

import java.lang.reflect.Method;

/**
 * MyBatis MapperProxy 原理简化版
 * 原始实现位于 org.apache.ibatis.binding.MapperProxy
 */
public class MyBatisMapperProxySimplified<T> implements java.lang.reflect.InvocationHandler {
    private final SqlSession sqlSession;
    private final Class<T> mapperInterface;

    public MyBatisMapperProxySimplified(SqlSession sqlSession, Class<T> mapperInterface) {
        this.sqlSession = sqlSession;
        this.mapperInterface = mapperInterface;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // Object 类的方法（toString, hashCode 等）直接调用
        if (Object.class.equals(method.getDeclaringClass())) {
            return method.invoke(this, args);
        }

        // 构建 Mapper 方法标识符
        String statementId = mapperInterface.getName() + "." + method.getName();

        // 根据方法类型执行不同的 SQL 操作
        Class<?> returnType = method.getReturnType();

        // 简化：直接调用 sqlSession 的方法
        // 实际 MyBatis 会根据 XML 或注解中定义的 SQL 来执行
        if (returnType == Void.TYPE) {
            // INSERT/UPDATE/DELETE
            return sqlSession.selectOne(statementId, args[0]);
        } else {
            // SELECT
            return sqlSession.selectOne(statementId, args[0]);
        }
    }
}

/*
 * 使用者角度：
 *
 * @Mapper
 * public interface UserMapper {
 *     User findById(Long id);
 *     void save(User user);
 * }
 *
 * // MyBatis 在运行时为 UserMapper 创建动态代理
 * UserMapper mapper = sqlSession.getMapper(UserMapper.class);
 * // 实际上返回的是 Proxy.newProxyInstance 创建的代理对象
 * User user = mapper.findById(1L);  // 通过代理执行 SQL
 */
```

### 13.4.3 Hibernate 懒加载代理

Hibernate 使用 CGLIB（或 ByteBuddy）创建代理对象实现懒加载。当查询一个实体时，其关联的集合对象（如 `@OneToMany`）不会立即加载，而是返回一个代理对象，真正访问时才触发查询。

```java
// Hibernate 懒加载代理的工作机制（简化说明）：

// 1. 查询 User 实体
// User user = entityManager.find(User.class, 1L);
// → 此时 user.getOrders() 返回的是 PersistentBag (CGLIB 代理对象)
// → SQL 只执行了: SELECT * FROM users WHERE id = 1

// 2. 首次访问 orders 属性时触发懒加载
// List<Order> orders = user.getOrders();  // 此处触发代理
// → Hibernate 执行: SELECT * FROM orders WHERE user_id = 1
// → 代理拦截了 getOrders() 调用，在返回前完成数据加载

// 3. 再次访问直接从代理中返回已加载的数据
// orders = user.getOrders();  // 不再执行 SQL

/**
 * Hibernate 懒加载代理的简化模拟
 */
public class HibernateLazyLoadingExample {

    // Hibernate 5.x 默认使用 ByteBuddy
    // Hibernate 4.x 默认使用 CGLIB
    // 也可以通过配置切换代理库: hibernate.bytecode.provider

    /**
     * 实体定义
     */
    // @Entity
    // public class User {
    //     @Id private Long id;
    //
    //     @OneToMany(mappedBy = "user", fetch = FetchType.LAZY)
    //     private List<Order> orders;  // 这个字段会被代理
    // }
}
```

### 13.4.4 Spring 声明式事务的底层代理

```java
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;

/**
 * Spring 的 @Transactional 注解
 * 底层通过代理模式实现事务管理
 */
@Service
public class TransactionalServiceExample {

    /**
     * Spring 处理 @Transactional 的流程：
     *
     * 1. 容器启动时扫描带有 @Transactional 的方法
     * 2. 为目标 Bean 创建代理对象（JDK/CGLIB）
     * 3. 代理拦截方法调用：
     *    a. 方法前：开启事务
     *    b. 调用目标方法
     *    c. 方法正常返回：提交事务
     *    d. 方法抛出异常：回滚事务
     * 4. 客户端拿到的是代理对象，对代理透明
     */
    @Transactional
    public void saveUser(UserDTO user) {
        // 实际执行的业务逻辑
        // 事务管理由代理对象完成
        System.out.println("保存用户: " + user.getUsername());
    }
}
```

### 13.4.5 Dubbo 远程代理

Dubbo 的服务消费者通过 JDK 动态代理生成远程服务的本地代理，隐藏了网络通信、序列化、负载均衡等复杂性。

```java
/**
 * Dubbo 消费者代理原理（简化版）
 *
 * @Reference  // Dubbo 注解，标记为远程服务引用
 * private HelloService helloService;
 *
 * // Dubbo 在运行时为 HelloService 接口创建动态代理，流程：
 * // 1. 服务消费者启动时连接注册中心，获取服务提供者列表
 * // 2. 为 @Reference 标注的接口创建 JDK 动态代理
 * // 3. 代理对象的方法调用被拦截，转换为 RPC 请求：
 * //    a. 序列化请求参数
 * //    b. 通过网络发送到远程服务提供者
 * //    c. 接收响应并反序列化
 * //    d. 返回结果给调用方
 * // 4. 整个过程中，调用方完全不知道正在调用远程服务
 */
```

## 13.5 使用场景与案例

### 13.5.1 微服务远程调用代理

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

/**
 * 远程服务调用代理（RPC 框架的简化实现）
 * 将本地接口调用转换为 HTTP 远程调用
 */
public class RpcClientProxy implements InvocationHandler {

    private final String serviceName;
    private final String baseUrl;

    public RpcClientProxy(String serviceName, String baseUrl) {
        this.serviceName = serviceName;
        this.baseUrl = baseUrl;
    }

    @SuppressWarnings("unchecked")
    public static <T> T create(Class<T> interfaceClass,
                                String serviceName, String baseUrl) {
        return (T) Proxy.newProxyInstance(
                interfaceClass.getClassLoader(),
                new Class[]{interfaceClass},
                new RpcClientProxy(serviceName, baseUrl)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 1. 构建远程调用请求
        String url = baseUrl + "/" + serviceName + "/" + method.getName();
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("method", method.getName());
        requestBody.put("params", args);

        System.out.println("[RPC代理] 发起远程调用: POST " + url);
        System.out.println("[RPC代理] 请求体: " + requestBody);

        // 2. 模拟 HTTP 请求（实际应使用 HttpClient 或 OkHttp）
        Thread.sleep(100); // 模拟网络延迟

        // 3. 模拟返回响应
        String jsonResponse = "{\"id\": 1, \"username\": \"远程用户\"}";
        System.out.println("[RPC代理] 收到响应: " + jsonResponse);

        // 4. 反序列化并返回结果
        return new UserDTO(1L, "远程用户", "remote@service.com");
    }
}

/**
 * RPC 代理测试
 */
public class RpcProxyTest {
    public static void main(String[] args) {
        // 创建远程服务的本地代理
        UserService remoteUserService = RpcClientProxy.create(
                UserService.class,
                "user-service",
                "http://localhost:8080/api"
        );

        // 像调用本地方法一样调用远程服务
        UserDTO user = remoteUserService.findById(100L);
        System.out.println("获取到远程用户: " + user.getUsername());
    }
}
```

### 13.5.2 重试与熔断代理

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 重试与熔断代理
 * 当目标服务调用失败时自动重试，连续失败达到阈值后熔断
 */
public class RetryCircuitBreakerProxy implements InvocationHandler {
    private final Object target;
    private final int maxRetries;
    private final long retryDelayMs;
    private final int circuitBreakerThreshold;

    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private volatile long circuitOpenUntil = 0;

    public RetryCircuitBreakerProxy(Object target, int maxRetries,
                                     long retryDelayMs, int circuitBreakerThreshold) {
        this.target = target;
        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
        this.circuitBreakerThreshold = circuitBreakerThreshold;
    }

    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target) {
        return (T) Proxy.newProxyInstance(
                target.getClass().getClassLoader(),
                target.getClass().getInterfaces(),
                new RetryCircuitBreakerProxy(target, 3, 500, 5)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 检查熔断状态
        if (isCircuitOpen()) {
            throw new RuntimeException("服务已熔断，请稍后重试"
                    + " (恢复时间: " + (circuitOpenUntil - System.currentTimeMillis()) / 1000 + "s)");
        }

        Exception lastException = null;

        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                System.out.println("[重试代理] 第 " + attempt + " 次尝试调用: "
                        + method.getName());

                Object result = method.invoke(target, args);

                // 成功，重置失败计数和熔断器
                consecutiveFailures.set(0);
                circuitOpenUntil = 0;
                System.out.println("[重试代理] 调用成功");

                return result;

            } catch (Exception e) {
                lastException = e;
                System.out.println("[重试代理] 第 " + attempt + " 次调用失败: "
                        + e.getMessage());

                if (attempt < maxRetries) {
                    System.out.println("[重试代理] 等待 " + retryDelayMs + "ms 后重试...");
                    Thread.sleep(retryDelayMs);
                }
            }
        }

        // 所有重试都失败
        int failures = consecutiveFailures.incrementAndGet();
        System.out.println("[重试代理] 全部重试失败，连续失败次数: " + failures);

        // 达到熔断阈值
        if (failures >= circuitBreakerThreshold) {
            circuitOpenUntil = System.currentTimeMillis() + 30000; // 30秒熔断
            System.out.println("[熔断器] 已开启，将持续 30 秒");
        }

        throw new RuntimeException("调用 " + method.getName() + " 失败", lastException);
    }

    private boolean isCircuitOpen() {
        return circuitOpenUntil > System.currentTimeMillis();
    }
}
```

### 13.5.3 智能引用代理（连接池代理）

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Queue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * 简易连接池代理实现
 * 重用数据库连接对象，通过代理控制 close() 方法的行为
 */
public class ConnectionPoolProxy {

    /**
     * 模拟的数据库连接接口
     */
    public interface DatabaseConnection {
        void execute(String sql);
        void close();
    }

    /**
     * 真实的数据库连接
     */
    static class RealDatabaseConnection implements DatabaseConnection {
        private final int id;
        private boolean closed = false;

        RealDatabaseConnection(int id) {
            this.id = id;
            System.out.println("[连接池] 创建新连接: Conn-" + id);
        }

        @Override
        public void execute(String sql) {
            if (closed) {
                throw new RuntimeException("连接已关闭");
            }
            System.out.println("  [Conn-" + id + "] 执行: " + sql);
        }

        @Override
        public void close() {
            closed = true;
            System.out.println("  [Conn-" + id + "] 真实关闭");
        }
    }

    /**
     * 连接池代理
     * 拦截 close() 方法，将连接归还到池中而非真正关闭
     */
    static class PooledConnectionHandler implements InvocationHandler {
        private final RealDatabaseConnection target;
        private final Queue<DatabaseConnection> pool;
        private boolean returned = false;

        PooledConnectionHandler(RealDatabaseConnection target,
                                Queue<DatabaseConnection> pool) {
            this.target = target;
            this.pool = pool;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if ("close".equals(method.getName())) {
                if (!returned) {
                    returned = true;
                    pool.offer((DatabaseConnection) proxy);
                    System.out.println("[连接池代理] 连接归还池中，池大小: " + pool.size());
                }
                return null;
            }
            return method.invoke(target, args);
        }
    }

    /**
     * 简易连接池实现
     */
    static class SimpleConnectionPool {
        private final Queue<DatabaseConnection> pool = new LinkedBlockingQueue<>();
        private final int maxSize;
        private int nextId = 1;

        SimpleConnectionPool(int maxSize) {
            this.maxSize = maxSize;
        }

        public DatabaseConnection getConnection() {
            // 先尝试从池中获取
            DatabaseConnection conn = pool.poll();
            if (conn != null) {
                System.out.println("[连接池] 从池中获取连接");
                return conn;
            }

            // 池中无可用连接，创建新的
            if (nextId <= maxSize) {
                RealDatabaseConnection realConn = new RealDatabaseConnection(nextId++);
                return (DatabaseConnection) Proxy.newProxyInstance(
                        DatabaseConnection.class.getClassLoader(),
                        new Class[]{DatabaseConnection.class},
                        new PooledConnectionHandler(realConn, pool)
                );
            }

            throw new RuntimeException("连接池已满，无法创建新连接");
        }

        public int getPoolSize() {
            return pool.size();
        }
    }

    // 测试
    public static void main(String[] args) {
        SimpleConnectionPool connectionPool = new SimpleConnectionPool(3);

        // 获取两个连接
        DatabaseConnection conn1 = connectionPool.getConnection();
        DatabaseConnection conn2 = connectionPool.getConnection();

        // 使用连接
        conn1.execute("SELECT * FROM users");
        conn2.execute("INSERT INTO logs ...");

        // 归还连接（通过代理，close 不会真正关闭连接）
        conn1.close();
        conn2.close();

        // 再次获取，将复用池中的连接
        DatabaseConnection conn3 = connectionPool.getConnection();
        conn3.execute("UPDATE products SET ...");
        conn3.close();
    }
}
```

## 13.6 潜在风险与问题

### 13.6.1 代理的开销

每一次通过代理的方法调用都比直接调用多了一层间接调用。对于性能敏感的场景（如高频循环中的方法调用），需要评估代理的开销。

```java
/**
 * 代理开销的直观说明
 *
 * 调用链路比较：
 *
 * 直接调用：
 *   Client -> UserService.findById()
 *
 * JDK 动态代理调用：
 *   Client -> $ProxyN.findById()
 *          -> InvocationHandler.invoke()
 *          -> Method.invoke(target, args)     // 反射调用
 *          -> UserServiceImpl.findById()
 *
 * CGLIB 代理调用：
 *   Client -> UserServiceImpl$$EnhancerByCGLIB.findById()
 *          -> MethodInterceptor.intercept()
 *          -> MethodProxy.invokeSuper(obj, args)  // FastClass 调用
 *          -> UserServiceImpl.findById()
 *
 * 代理链嵌套调用：
 *   Client -> LoggingProxy -> CacheProxy -> SecurityProxy -> RealService
 *   （每层代理增加一次方法拦截开销）
 */
```

### 13.6.2 代理导致调试困难

代理会在调用堆栈中增加额外的帧，且代理类是在运行时动态生成的，在 IDE 中无法断点调试代理类内部逻辑。

**缓解措施**：
- 在 `InvocationHandler.invoke()` 或 `MethodInterceptor.intercept()` 中添加清晰的日志。
- 使用 Spring 的 `AopUtils.isAopProxy()` 判断是否为代理对象。
- 使用 `AopUtils.getTargetSource()` 获取真实目标对象。

```java
// 调试时获取代理背后的真实对象（仅用于调试）
import org.springframework.aop.framework.AopProxyUtils;

public class DebugHelper {
    public static void inspectProxy(Object possiblyProxy) {
        System.out.println("对象类: " + possiblyProxy.getClass().getName());
        System.out.println("是否为CGLIB: " +
                possiblyProxy.getClass().getName().contains("CGLIB"));

        // 尝试获取真实目标（仅用于开发/调试）
        try {
            Object target = AopProxyUtils.getSingletonTarget(possiblyProxy);
            if (target != null) {
                System.out.println("真实目标类: " + target.getClass().getName());
            }
        } catch (Exception e) {
            System.out.println("无法获取真实目标: " + e.getMessage());
        }
    }
}
```

### 13.6.3 JDK 动态代理的接口限制

JDK 动态代理只能代理接口方法。如果目标类有不在接口中定义的方法，代理对象上无法直接调用这些方法。

```java
// 问题场景
public interface UserService {
    UserDTO findById(Long id);
}

public class UserServiceImpl implements UserService {
    @Override
    public UserDTO findById(Long id) { /* ... */ }

    // 这个方法不在 UserService 接口中！
    public void internalCleanup() { /* 清理缓存 */ }
}

// 问题：通过代理无法调用 internalCleanup()
UserService proxy = LoggingProxy.createProxy(new UserServiceImpl());
// proxy.internalCleanup(); // 编译错误！接口中没有这个方法

// 解决：需要转型回具体实现类或使用 CGLIB 代理
```

### 13.6.4 CGLIB 代理的限制

CGLIB 代理有以下限制：

| 限制 | 说明 | 解决方案 |
|------|------|----------|
| **无法代理 final 方法** | CGLIB 通过子类覆写方法实现代理，final 方法无法覆写 | 移除 final 修饰或改用组合 |
| **无法代理 final 类** | 无法为 final 类创建子类 | 为类实现接口，改用 JDK 代理 |
| **构造函数行为** | CGLIB 创建代理时会调用父类构造函数两次（默认） | 使用 `Enhancer.setInterceptDuringConstruction(false)` |
| **包装器类型** | 对 `equals()`、`hashCode()` 等方法的代理需特殊处理 | 配置 callbackFilter |

```java
// CGLIB 构造函数行为演示
public class CglibConstructorIssue {
    static class ServiceWithSideEffect {
        private static int instanceCount = 0;

        public ServiceWithSideEffect() {
            instanceCount++;
            System.out.println("构造函数被调用，当前实例数: " + instanceCount);
            // 如果构造函数中有副作用（如发送网络请求），这里会被调用两次！
        }
    }

    public static void main(String[] args) {
        Enhancer enhancer = new Enhancer();
        enhancer.setSuperclass(ServiceWithSideEffect.class);
        enhancer.setCallback((MethodInterceptor) (obj, method, args, proxy) -> {
            System.out.println("代理拦截: " + method.getName());
            return proxy.invokeSuper(obj, args);
        });

        ServiceWithSideEffect proxy = (ServiceWithSideEffect) enhancer.create();
        // 输出:
        // 构造函数被调用，当前实例数: 1  ← CGLIB 内部调用
        // 构造函数被调用，当前实例数: 2  ← enhancer.create() 调用
        System.out.println("代理创建完成，实例数: "
                + ServiceWithSideEffect.instanceCount);
    }
}
```

### 13.6.5 线程安全问题

如果代理对象自身维护了状态（如计数器、缓存），必须确保线程安全。

```java
// 不安全的代理状态
public class UnsafeCounterProxy implements InvocationHandler {
    private final Object target;
    private int callCount = 0;  // 非线程安全！

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        callCount++;  // 竞态条件
        return method.invoke(target, args);
    }
}

// 安全的代理状态
public class SafeCounterProxy implements InvocationHandler {
    private final Object target;
    private final AtomicInteger callCount = new AtomicInteger(0); // 线程安全

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        callCount.incrementAndGet();
        return method.invoke(target, args);
    }
}
```

## 13.7 优化策略

### 13.7.1 根据场景选择合适的代理方式

```
决策流程：

目标类是否实现了接口？
├── 是 → 推荐 JDK 动态代理
│       优点：JDK 原生支持，无需第三方依赖
│       注意：只能代理接口方法
│
└── 否 → 使用 CGLIB 或 ByteBuddy
        注意：不能是 final 类，不能代理 final 方法
        如 Spring Boot 2.x 默认使用 CGLIB

特殊情况：
- 需要代理 final 方法？  → 考虑组合模式替代继承
- 需要代理 static 方法？  → 代理模式不支持，考虑重构设计
- 性能极度敏感？         → 使用静态代理或预编译字节码增强
- 现代替代方案           → ByteBuddy（比 CGLIB 更现代、文档更好）
```

### 13.7.2 最小化代理链

代理链过长会导致调用栈深、调试困难、性能下降。

```java
// 不推荐：过长的代理链
UserService proxy = LoggingProxy.createProxy(
    CacheProxy.createProxy(
        SecurityProxy.createProxy(
            ValidationProxy.createProxy(
                TransactionProxy.createProxy(
                    realService
                )
            )
        )
    )
);

// 推荐：合并相关代理职责
public class LoggingAndCacheProxy implements InvocationHandler {
    // 将日志和缓存合并到一个 Handler 中
    // 减少代理层数
    private final Object target;
    private final Map<String, Object> cache = new ConcurrentHashMap<>();

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        String cacheKey = buildCacheKey(method, args);

        // 缓存检查
        if (cache.containsKey(cacheKey)) {
            log(method, args, "CACHE_HIT");
            return cache.get(cacheKey);
        }

        // 日志记录
        log(method, args, "START");
        long start = System.currentTimeMillis();

        Object result = method.invoke(target, args);

        // 存储缓存
        cache.put(cacheKey, result);

        long elapsed = System.currentTimeMillis() - start;
        log(method, args, "END", elapsed + "ms");

        return result;
    }

    private void log(Method method, Object[] args, String phase) {
        // ...
    }

    private void log(Method method, Object[] args, String phase, String extra) {
        // ...
    }

    private String buildCacheKey(Method method, Object[] args) {
        return method.getName() + ":" + Arrays.toString(args);
    }
}
```

### 13.7.3 ByteBuddy：CGLIB 的现代替代方案

ByteBuddy 是当前 Java 字节码增强的主流选择，比 CGLIB 功能更强大、API 更友好。

```java
import net.bytebuddy.ByteBuddy;
import net.bytebuddy.implementation.InvocationHandlerAdapter;
import net.bytebuddy.matcher.ElementMatchers;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

/**
 * 使用 ByteBuddy 创建代理
 */
public class ByteBuddyProxyExample {

    @SuppressWarnings("unchecked")
    public static <T> T createProxy(Class<T> superClass, InvocationHandler handler)
            throws Exception {
        return (T) new ByteBuddy()
                .subclass(superClass)
                .method(ElementMatchers.any())
                .intercept(InvocationHandlerAdapter.of(handler))
                .make()
                .load(superClass.getClassLoader())
                .getLoaded()
                .getDeclaredConstructor()
                .newInstance();
    }

    public static void main(String[] args) throws Exception {
        ProductRepository realRepo = new ProductRepository();

        ProductRepository proxy = ByteBuddyProxyExample.createProxy(
                ProductRepository.class,
                (Object proxyObj, Method method, Object[] methodArgs) -> {
                    System.out.println("[ByteBuddy] 调用方法: " + method.getName());
                    return method.invoke(realRepo, methodArgs);
                }
        );

        proxy.findById(1L);
    }
}
```

### 13.7.4 代理模式最佳实践总结

| 场景 | 推荐方案 | 注意事项 |
|------|----------|----------|
| Spring 环境下的 AOP | 优先使用 Spring AOP（注解驱动） | 了解 JDK/CGLIB 自动选择策略 |
| 数据库访问层代理 | MyBatis Mapper（自带 JDK 代理） | 无需手动实现 |
| HTTP 远程调用 | Feign / Retrofit（内置代理） | 声明式接口 + 动态代理 |
| 性能监控 | JDK 动态代理 + 自定义 InvocationHandler | 注意监控自身开销 |
| 权限控制 | 静态代理或 Spring Security | 声明式 > 命令式 |
| 延迟加载 | 虚拟代理 or Hibernate LAZY | 注意 N+1 问题 |
| 缓存加速 | 缓存代理 or Spring Cache | 注意缓存一致性 |
| 无接口的类需要代理 | CGLIB or ByteBuddy | 优先考虑为类提取接口 |

## 本章小结

本章详细介绍了代理模式（Proxy Pattern）：

1. **核心问题**：需要在不修改目标对象的情况下，控制或增强对目标对象的访问。
2. **代理分类**：虚拟代理、保护代理、远程代理、缓存代理、日志代理、智能引用。
3. **UML结构**：抽象主题（Subject）、真实主题（RealSubject）、代理（Proxy）。
4. **实现方式**：
   - **静态代理**：编译期确定代理类，简单但不够灵活。
   - **JDK 动态代理**：运行时生成实现接口的代理类，基于反射调用。
   - **CGLIB 动态代理**：运行时生成目标类的子类，基于字节码增强。
5. **框架应用**：Spring AOP、MyBatis MapperProxy、Hibernate 懒加载、Dubbo 消费者代理。
6. **使用场景**：RPC 远程调用、重试与熔断、连接池代理、权限控制、性能监控。
7. **主要风险**：代理开销、调试困难、接口/final 限制、线程安全。
8. **优化策略**：按场景选型、最小化代理链、合并职责、优先使用框架自带代理。

**代理模式是 AOP 的基石**。在实际开发中，大多数场景下应优先使用 Spring AOP 或框架自带的代理能力，而非手动实现。只有在框架不适用的特定场景下，才需要自定义代理实现。

---

在下一章中，我们将学习享元模式（Flyweight Pattern），通过共享技术高效地支持大量细粒度对象。
