# 第13章 代理模式（Proxy）
+
+**代理模式**为另一个对象提供一个替身或占位符，以控制对它的访问。代理对象可以在客户端和目标对象之间起到中介作用。
+
+## 13.1 解决的问题与应用场景
+
+### 13.1.1 问题分析
+
+在某些场景下，我们不能直接访问某个对象，或者直接访问的代价较高：
+
+- **远程访问**：对象在另一台机器上，直接访问需要网络通信
+- **访问控制**：需要控制对敏感对象的访问权限
+- **延迟加载**：对象创建成本高，需要时才创建
+- **日志记录**：需要在访问前后记录日志
+- **缓存**：需要缓存频繁访问的数据
+- **验证**：需要在访问前进行参数验证
+
+### 13.1.2 典型应用场景
+
+**1. 远程代理**
+```java
+// 访问远程服务
+Service proxy = serviceProxy.getService("http://remote-server/api");
+proxy.doSomething();  // 实际上是在远程执行
+```
+
+**2. 虚拟代理**
+```java
+// 图片加载
+Image image = imageProxy.loadImage("large-photo.jpg");
+image.display();  // 首次调用时才加载图片
+```
+
+**3. 保护代理**
+```java
+// 权限控制
+Document doc = accessControlProxy.getDocument("secret.txt");
+doc.read();  // 检查权限后才允许读取
+```
+
+**4. 缓存代理**
+```java
+// 查询缓存
+Result result = cacheProxy.query(sql);
+result = cacheProxy.query(sql);  // 第二次从缓存返回
+```
+
+**5. 智能引用**
+```java
+// 对象使用统计
+HeavyObject obj = smartProxy.getObject();
+obj.doWork();  // 自动记录使用次数
+```
+
+## 13.2 实现原理与UML
+
+### 13.2.1 核心思想
+
+代理模式的核心是**创建一个代理对象来控制对真实对象的访问**，代理对象与真实对象实现相同的接口，客户端无感知。
+
+### 13.2.2 UML类图
+
+```
+┌─────────────────────┐        ┌─────────────────────┐
+│       Client       │        │    Subject         │
+│                     │        │   (抽象主题)        │
+└─────────────────────┘        ├─────────────────────┤
+                               │ + request()        │
+                               └─────────┬───────────┘
+                                         │
+              ┌──────────────────────────┼──────────────────────────┐
+              │                          │                          │
+              ▼                          ▼                          ▼
+┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
+│  RealSubject       │      │      Proxy          │      │   Proxy            │
+│  (真实主题)        │      │     (代理)           │      │   (不同类型)        │
+├─────────────────────┤      ├─────────────────────┤      ├─────────────────────┤
+│ + request()        │◄─────│ - realSubject       │      │ - realSubject       │
+└─────────────────────┘      │ + request()        │      │ + request()        │
+                             └─────────────────────┘      └─────────────────────┘
+```
+
+### 13.2.3 角色分析
+
+- **Subject（抽象主题）**：定义真实主题和代理的公共接口
+- **RealSubject（真实主题）**：真正执行业务逻辑的对象
+- **Proxy（代理）**：持有真实主题的引用，提供与真实主题相同的接口
+
+### 13.2.4 时序图
+
+```
+Client              Proxy              RealSubject
+   │                   │                    │
+   │   request()       │                    │
+   │ ────────────────► │                    │
+   │                   │                    │
+   │                   │  (访问控制/延迟加载) │
+   │                   │                    │
+   │                   │  request()         │
+   │                   │ ────────────────►  │
+   │                   │                    │
+   │                   │      result        │
+   │                   │ ◄──────────────────│
+   │                   │                    │
+   │      result       │                    │
+   │ ◄──────────────── │                    │
+   │                   │                    │
+```
+
+## 13.3 代码实现（静态/动态/JDK/CGLib）
+
+### 13.3.1 静态代理
+
+**抽象主题**
+```java
+public interface Image {
+    void display();
+    void load();
+}
+```
+
+**真实主题**
+```java
+public class RealImage implements Image {
+    private String filename;
+
+    public RealImage(String filename) {
+        this.filename = filename;
+        load();  // 构造时加载
+    }
+
+    @Override
+    public void load() {
+        System.out.println("加载图片: " + filename);
+        // 模拟加载耗时
+        try { Thread.sleep(1000); } catch (InterruptedException e) { }
+    }
+
+    @Override
+    public void display() {
+        System.out.println("显示图片: " + filename);
+    }
+}
+```
+
+**静态代理**
+```java
+public class ImageProxy implements Image {
+    private RealImage realImage;
+    private String filename;
+
+    public ImageProxy(String filename) {
+        this.filename = filename;
+    }
+
+    @Override
+    public void load() {
+        if (realImage == null) {
+            realImage = new RealImage(filename);
+        }
+    }
+
+    @Override
+    public void display() {
+        if (realImage == null) {
+            load();
+        }
+        realImage.display();
+    }
+}
+```
+
+**使用**
+```java
+public class Main {
+    public static void main(String[] args) {
+        Image image = new ImageProxy("photo.jpg");
+
+        // 第一次调用 - 延迟加载
+        image.display();
+        // 输出: 加载图片: photo.jpg
+        //      显示图片: photo.jpg
+
+        // 第二次调用 - 不再加载
+        image.display();
+        // 输出: 显示图片: photo.jpg
+    }
+}
+```
+
+### 13.3.2 动态代理（使用JDK）
+
+```java
+public class JdkDynamicProxy implements InvocationHandler {
+    private Object target;
+
+    public JdkDynamicProxy(Object target) {
+        this.target = target;
+    }
+
+    public static Object createProxy(Object target) {
+        return Proxy.newProxyInstance(
+            target.getClass().getClassLoader(),
+            target.getClass().getInterfaces(),
+            new JdkDynamicProxy(target)
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        System.out.println("执行方法前: " + method.getName());
+        Object result = method.invoke(target, args);
+        System.out.println("执行方法后: " + method.getName());
+        return result;
+    }
+}
+```
+
+### 13.3.3 完整示例：日志和缓存代理
+
+**服务接口**
+```java
+public interface UserService {
+    User getUserById(Long id);
+    List<User> getAllUsers();
+    void saveUser(User user);
+}
+```
+
+**真实服务**
+```java
+public class UserServiceImpl implements UserService {
+    @Override
+    public User getUserById(Long id) {
+        System.out.println("从数据库查询用户: " + id);
+        return new User(id, "User" + id);
+    }
+
+    @Override
+    public List<User> getAllUsers() {
+        System.out.println("查询所有用户");
+        return Arrays.asList(new User(1L, "A"), new User(2L, "B"));
+    }
+
+    @Override
+    public void saveUser(User user) {
+        System.out.println("保存用户: " + user.getName());
+    }
+}
+```
+
+**缓存代理**
+```java
+public class CacheProxy implements InvocationHandler {
+    private Object target;
+    private Map<String, Object> cache = new ConcurrentHashMap<>();
+
+    public CacheProxy(Object target) {
+        this.target = target;
+    }
+
+    public static Object createProxy(Object target) {
+        return Proxy.newProxyInstance(
+            target.getClass().getClassLoader(),
+            target.getClass().getInterfaces(),
+            new CacheProxy(target)
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        String cacheKey = method.getName() + ":" + Arrays.toString(args);
+
+        // 只对getter方法使用缓存
+        if (method.getName().startsWith("get") && cache.containsKey(cacheKey)) {
+            System.out.println("从缓存获取: " + cacheKey);
+            return cache.get(cacheKey);
+        }
+
+        Object result = method.invoke(target, args);
+
+        // 缓存结果
+        if (method.getName().startsWith("get")) {
+            cache.put(cacheKey, result);
+            System.out.println("缓存结果: " + cacheKey);
+        }
+
+        return result;
+    }
+}
+```
+
+**日志代理**
+```java
+public class LogProxy implements InvocationHandler {
+    private Object target;
+
+    public LogProxy(Object target) {
+        this.target = target;
+    }
+
+    public static Object createProxy(Object target) {
+        return Proxy.newProxyInstance(
+            target.getClass().getClassLoader(),
+            target.getClass().getInterfaces(),
+            new LogProxy(target)
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        long start = System.currentTimeMillis();
+        String methodName = method.getName();
+        String argsStr = Arrays.toString(args);
+
+        System.out.println(">>> 调用方法: " + methodName + ", 参数: " + argsStr);
+
+        Object result = method.invoke(target, args);
+
+        long end = System.currentTimeMillis();
+        System.out.println("<<< 方法完成: " + methodName + ", 耗时: " + (end - start) + "ms");
+
+        return result;
+    }
+}
+```
+
+**使用**
+```java
+public class Main {
+    public static void main(String[] args) {
+        UserService realService = new UserServiceImpl();
+
+        // 链式代理：先日志代理，再缓存代理
+        UserService proxyService = (UserService) CacheProxy.createProxy(
+            LogProxy.createProxy(realService)
+        );
+
+        // 测试
+        User user = proxyService.getUserById(1L);  // 首次查询
+        user = proxyService.getUserById(1L);       // 从缓存
+    }
+}
+```
+
+### 13.3.4 CGLib动态代理
+
+```xml
+<!-- 引入CGLib依赖 -->
+<dependency>
+    <groupId>cglib</groupId>
+    <artifactId>cglib</artifactId>
+    <version>3.3.0</version>
+</dependency>
+```
+
+```java
+import net.sf.cglib.proxy.Enhancer;
+import net.sf.cglib.proxy.MethodInterceptor;
+import net.sf.cglib.proxy.MethodProxy;
+
+public class CglibProxy implements MethodInterceptor {
+    private Object target;
+
+    public CglibProxy(Object target) {
+        this.target = target;
+    }
+
+    public static Object createProxy(Object target) {
+        Enhancer enhancer = new Enhancer();
+        enhancer.setSuperclass(target.getClass());
+        enhancer.setCallback(new CglibProxy(target));
+        return enhancer.create();
+    }
+
+    @Override
+    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
+        System.out.println("CGLib代理前: " + method.getName());
+        Object result = proxy.invokeSuper(obj, args);
+        System.out.println("CGLib代理后: " + method.getName());
+        return result;
+    }
+}
+```
+
+### 13.3.5 JDK代理 vs CGLib代理
+
+| 特性 | JDK动态代理 | CGLib代理 |
+|------|------------|-----------|
+| 实现方式 | 实现接口 | 继承类 |
+| 代理类 | 动态生成 | 动态生成子类 |
+| 性能 | 较高 | 较高（但创建慢） |
+| 限制 | 需要接口 | 不能代理final类/method |
+| 适用场景 | 有接口的情况 | 无接口或需要代理类 |
+
+## 13.4 JDK/框架源码解析
+
+### 13.4.1 Spring AOP
+
+Spring AOP使用代理模式实现AOP：
+
+```java
+// 切面
+@Aspect
+@Component
+public class LoggingAspect {
+    @Before("execution(* com.example.*.*(..))")
+    public void before(JoinPoint joinPoint) {
+        System.out.println("方法执行前: " + joinPoint.getSignature());
+    }
+
+    @After("execution(* com.example.*.*(..))")
+    public void after(JoinPoint joinPoint) {
+        System.out.println("方法执行后: " + joinPoint.getSignature());
+    }
+}
+```
+
+Spring选择代理方式的逻辑：
+- 如果目标类实现了接口，默认使用JDK代理
+- 可以配置使用CGLib代理
+
+### 13.4.2 MyBatis懒加载
+
+```java
+// MyBatis的懒加载使用代理
+User user = userMapper.selectById(1L);
// 此时只查询了User基本信息
List<Order> orders = user.getOrders();  // 触发懒加载查询
+```
+
+### 13.4.3 RMI远程代理
+
+```java
+// Java RMI使用代理模式实现远程调用
+// Stub是客户端代理
+// Skeleton是服务端代理
+HelloService service = (HelloService) Naming.lookup("rmi://localhost:1099/HelloService");
+String result = service.sayHello("World");  // 实际在远程执行
+```
+
+### 13.4.4 分布式框架中的代理
+
+Dubbo、Feign等RPC框架都使用代理模式：
+
+```java
+// Feign - 声明式HTTP客户端
+@FeignClient(name = "user-service")
+public interface UserClient {
+    @GetMapping("/user/{id}")
+    User getUser(@PathVariable("id") Long id);
+}
+```
+
+## 13.5 使用场景与案例
+
+### 13.5.1 权限控制代理
+
+```java
+public interface Document {
+    void read();
+    void write();
+    void delete();
+}
+
+public class RealDocument implements Document {
+    private String content;
+
+    @Override
+    public void read() { System.out.println("读取文档: " + content); }
+
+    @Override
+    public void write() { System.out.println("写入文档"); }
+
+    @Override
+    public void delete() { System.out.println("删除文档"); }
+}
+
+public class AccessControlProxy implements Document {
+    private Document document;
+    private String userRole;
+
+    public AccessControlProxy(Document document, String userRole) {
+        this.document = document;
+        this.userRole = userRole;
+    }
+
+    @Override
+    public void read() {
+        document.read();
+    }
+
+    @Override
+    public void write() {
+        if ("admin".equals(userRole)) {
+            document.write();
+        } else {
+            System.out.println("权限不足，无法写入");
+        }
+    }
+
+    @Override
    public void delete() {
+        if ("admin".equals(userRole)) {
+            document.delete();
+        } else {
+            System.out.println("权限不足，无法删除");
+        }
+    }
+}
+```
+
+### 13.5.2 延迟加载代理
+
+```java
+public class LazyLoadProxy implements InvocationHandler {
+    private Object target;
+    private boolean loaded = false;
+
+    public static Object createProxy(Object target) {
+        return Proxy.newProxyInstance(
+            target.getClass().getClassLoader(),
+            target.getClass().getInterfaces(),
+            new LazyLoadProxy(target)
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        if (!loaded && method.getName().startsWith("get")) {
+            System.out.println("懒加载: 初始化数据...");
+            loaded = true;
+        }
+        return method.invoke(target, args);
+    }
+}
+```
+
+### 13.5.3 连接池代理
+
+```java
+public class ConnectionPoolProxy implements InvocationHandler {
+    private Connection realConnection;
+    private static final int MAX_USE_COUNT = 100;
+    private int useCount = 0;
+
+    public Connection createProxy(Connection realConnection) {
+        this.realConnection = realConnection;
+        return (Connection) Proxy.newProxyConnection(
+            Connection.class.getClassLoader(),
+            new Class[]{ Connection.class },
+            this
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        if (method.getName().equals("close")) {
+            useCount++;
+            if (useCount < MAX_USE_COUNT) {
+                // 归还连接池
+                System.out.println("归还连接到池中，使用次数: " + useCount);
+            } else {
+                // 关闭连接
+                realConnection.close();
+            }
+            return null;
+        }
+        return method.invoke(realConnection, args);
+    }
+}
+```
+
+### 13.5.4 监控代理
+
+```java
+public class MonitoringProxy implements InvocationHandler {
+    private Object target;
+    private Map<String, AtomicLong> stats = new ConcurrentHashMap<>();
+
+    public MonitoringProxy(Object target) {
+        this.target = target;
+    }
+
+    public static Object createProxy(Object target) {
+        return Proxy.newProxyInstance(
+            target.getClass().getClassLoader(),
+            target.getClass().getInterfaces(),
+            new MonitoringProxy(target)
+        );
+    }
+
+    @Override
+    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
+        String methodName = method.getName();
+        long start = System.nanoTime();
+
+        Object result = method.invoke(target, args);
+
+        long duration = System.nanoTime() - start;
+
+        // 统计
+        stats.computeIfAbsent(methodName, k -> new AtomicLong(0))
+            .addAndGet(duration);
+
+        return result;
+    }
+
+    public void printStats() {
+        stats.forEach((method, time) ->
+            System.out.println(method + ": " + time.get() + "ns")
+        );
+    }
+}
+```
+
+## 13.6 潜在风险与问题
+
+### 13.6.1 代理类的性能开销
+
+动态代理会在运行时生成字节码，有一定的性能开销。
+
+**解决方案**：
+- 缓存生成的代理类
+- 使用CGLib（某些场景更快）
+- 考虑预编译
+
+### 13.6.2 代理链的管理
+
+多个代理层层嵌套时，调试困难。
+
+**解决方案**：
+- 避免过长的代理链
+- 添加清晰的日志
+- 考虑使用责任链模式
+
+### 13.6.3 目标对象的引用问题
+
+```java
+// 错误的代理可能导致内存泄漏
+public class BadProxy implements InvocationHandler {
+    private Object target;
+
+    // 强引用target，可能导致无法GC
+}
+```
+
+**解决方案**：
+- 使用弱引用
+- 及时清理引用
+
+### 13.6.4 静态代理 vs 动态代理
+
+| 特性 | 静态代理 | 动态代理 |
+|------|----------|----------|
+| 代码量 | 多（每个方法都要写） | 少（统一处理） |
+| 灵活性 | 低 | 高 |
+| 性能 | 稍好 | 有开销 |
+| 适用 | 特定场景 | 通用场景 |
+
+## 13.7 优化策略
+
+### 13.7.1 使用函数式接口简化
+
+```java
+public class FunctionalProxy<T> {
+    public static <T> T create(Class<T> interfaceClass, T target,
+                                java.util.function.Function<Runnable, Runnable> decorator) {
+        // 使用函数式接口简化代理
+    }
+}
+```
+
+### 13.7.2 使用Spring的代理工厂
+
+```java
+@Autowired
+private ProxyFactory proxyFactory;
+
+public void addProxy() {
+    proxyFactory.addAdvice(0, new MethodInterceptor() {
+        @Override
+        public Object invoke(MethodInvocation invocation) throws Throwable {
+            // 拦截逻辑
+            return invocation.proceed();
+        }
+    });
+}
+```
+
+### 13.7.3 最佳实践
+
+| 场景 | 推荐方式 |
+|------|----------|
+| 有接口 + 需要AOP | JDK动态代理 |
+| 无接口 + 需要AOP | CGLib |
+| 远程调用 | RMI/Dubbo/Feign |
+| 权限控制 | 自定义代理 |
+| 延迟加载 | 虚拟代理 |
+| 缓存 | 缓存代理 |
+
+## 本章小结
+
+本章详细介绍了代理模式：
+
+1. **解决的问题**：控制对对象的访问，在访问前后添加额外逻辑
+2. **UML结构**：抽象主题、真实主题、代理
+3. **实现方式**：静态代理、JDK动态代理、CGLib动态代理
+4. **框架应用**：Spring AOP、MyBatis懒加载、RMI、Feign
+5. **潜在问题**：性能开销、代理链管理
+6. **优化策略**：合理选择代理方式、使用框架提供的代理
+
+**代理模式是实现AOP、权限控制、远程调用等技术的基础**，在实际开发中应用广泛。
+
+---
+在下一章中，我们将学习享元模式，共享大量细粒度对象。