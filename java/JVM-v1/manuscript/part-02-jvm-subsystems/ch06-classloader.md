# 第6章 类加载机制与调优

> 前五章聚焦于 JVM 诊断与基准测试工具，从本章开始我们将深入 JVM 内部子系统。类加载（Class Loading）是 JVM 的入口——任何 Java 类在被使用之前都必须经过加载、连接和初始化三个阶段。理解类加载机制，不仅有助于解决 NoSuchMethodError、ClassCastException 等运行时疑难杂症，更是掌握 OSGi、Tomcat、Spring Boot 等框架 classloader 体系的基础。

## 6.1 核心原理

### 6.1.1 类加载生命周期

一个 Java 类从被加载到 JVM 内存中，到最终被卸载，经历五个阶段：

```
加载 -> 验证 -> 准备 -> 解析 -> 初始化 -> 使用 -> 卸载
     \_____ 连接（Linking）_____/
```

**加载（Loading）** 是类加载的第一个阶段。JVM 通过类的全限定名获取该类的二进制字节流，将这个字节流转化为方法区的运行时数据结构，并在堆中生成一个 `java.lang.Class` 对象作为对该类访问的入口。加载阶段可由 JVM 内置的启动类加载器完成，也可由用户自定义的类加载器完成。

**验证（Verification）** 确保字节流符合 JVM 规范且不会危害 JVM 自身安全。验证阶段包括四个步骤：文件格式验证（是否以魔数 `0xCAFEBABE` 开头、主次版本号是否在当前 JVM 支持范围内）、元数据验证（语义分析，如是否继承了 `final` 类）、字节码验证（通过数据流和控制流分析确定语义合法）和符号引用验证（在解析阶段发生，检查符号引用是否能找到对应的全限定名）。

**准备（Preparation）** 为类变量（`static` 修饰的变量）分配内存并设置初始零值。例如 `public static int value = 123`，在准备阶段之后 `value` 的值是 `0` 而非 `123`——真正的赋值动作在初始化阶段执行。注意这里是类变量而非实例变量，实例变量将在对象实例化时随对象一起分配在堆中。

**解析（Resolution）** 将常量池中的符号引用替换为直接引用。符号引用以字面量的形式（如 `com/jvmbook/ch06/DemoService`）存在于常量池中，解析后 JVM 将获得目标的内存地址或句柄，后续指令可直接访问目标。解析动作可以延迟到指令执行之前（即仅在首次使用某条指令时解析），这是 JVM 规范允许的"延迟解析"优化。

**初始化（Initialization）** 执行类构造器 `<clinit>()` 方法的过程。`<clinit>()` 由编译器自动收集类中的所有类变量赋值动作和静态语句块合并生成，顺序与源码顺序一致。JVM 会保证在子类的 `<clinit>()` 执行之前，父类的 `<clinit>()` 已经执行完毕。虚拟机会保证一个类的 `<clinit>()` 在多线程环境中被正确地加锁同步——如果多个线程同时初始化一个类，只有一个线程会执行 `<clinit>()`，其他线程必须等待。

初始化的触发条件（即主动引用）包括：
- 遇到 `new`、`getstatic`、`putstatic`、`invokestatic` 字节码指令
- 使用 `java.lang.reflect` 包方法进行反射调用
- 初始化子类时发现父类尚未初始化
- 虚拟机启动时指定的主类（包含 `main()` 方法的类）
- `java.lang.invoke.MethodHandle` 的解析结果对应的类

被动引用不会触发初始化：
- 通过子类引用父类的静态字段（只会触发父类初始化）
- 定义类数组的引用（不会触发该类初始化）
- 引用类的 `final` 常量（编译时已存入常量池）

### 6.1.2 双亲委派模型

JVM 自带的类加载器按照层次结构组织为三层的双亲委派模型：

```
                 Bootstrap ClassLoader
                        |
                Extension ClassLoader (JDK 8)
             /  Platform ClassLoader (JDK 9+)
                        |
                Application ClassLoader
```

**Bootstrap ClassLoader（启动类加载器）** 负责加载 `JAVA_HOME/lib` 目录中或被 `-Xbootclasspath` 指定路径中的核心类库。它是 C++ 实现的，在 Java 代码中为 `null`——因此 `Object.class.getClassLoader()` 返回 `null`。

**Extension ClassLoader / Platform ClassLoader（扩展/平台类加载器）** JDK 8 及之前为 Extension ClassLoader，负责加载 `JAVA_HOME/lib/ext` 目录中的类。JDK 9 引入模块化系统后更名为 Platform ClassLoader，负责加载 Java SE 平台模块（`java.base`、`java.xml` 等）中的类。

**Application ClassLoader（应用类加载器）** 负责加载用户类路径（classpath）上的所有类。在 Spring Boot 等框架中，它会加载 `BOOT-INF/lib` 中的三方依赖和 `BOOT-INF/classes` 中的用户代码。

双亲委派模型的工作逻辑是：当一个类加载器收到类加载请求时，它首先将请求委派给父类加载器处理，只有父类加载器无法完成加载时，子类加载器才尝试自行加载。

```java
// ClassLoader.loadClass() 的核心逻辑（简化）
protected Class<?> loadClass(String name, boolean resolve)
        throws ClassNotFoundException {
    synchronized (getClassLoadingLock(name)) {
        // 检查类是否已经被加载
        Class<?> c = findLoadedClass(name);
        if (c == null) {
            try {
                if (parent != null) {
                    c = parent.loadClass(name, false);
                } else {
                    c = findBootstrapClassOrNull(name);
                }
            } catch (ClassNotFoundException e) {
                // 父类加载器无法加载
            }
            if (c == null) {
                // 父类加载器加载失败，自己尝试加载
                c = findClass(name);
            }
        }
        if (resolve) {
            resolveClass(c);
        }
        return c;
    }
}
```

这段代码清晰地展示了双亲委派的完整链路：先检查是否已加载，未加载则委派给父加载器，父加载器失败再调用 `findClass()` 自行搜索。

**双亲委派的必要性**在于保证核心类库的安全性。以 `java.lang.Object` 为例，如果没有双亲委派，用户自定义的类加载器可能加载一个恶意的 `Object.class` 替换掉核心实现。双亲委派保证任何情况下 `Object.class` 都由 Bootstrap ClassLoader 加载，确保核心类在全 VM 范围内的唯一性——这也是"全盘负责"原则的体现：一个类加载器在加载某个类时，该类所依赖和引用的其他类也由该加载器（或其祖先）加载。

### 6.1.3 打破双亲委派

双亲委派模型并非是 JVM 规范强制要求的——它是推荐的默认实现，但许多场景不得不打破它。

**SPI（Service Provider Interface）** 是最典型的例子。JDK 内置的 `ServiceLoader` API 允许第三方提供服务实现。以 JDBC 为例，`java.sql.DriverManager` 在 `java.base` 模块中启动类加载器加载，但它需要加载 MySQL、PostgreSQL 等厂商驱动的实现类——这些类在应用类路径上，启动类加载器根本无法访问。

解决方案是"线程上下文类加载器（Thread Context ClassLoader）"模式：

```java
// DriverManager 获取连接时的核心逻辑
ClassLoader cl = Thread.currentThread().getContextClassLoader();
if (cl == null) {
    cl = ClassLoader.getSystemClassLoader();
}
ServiceLoader<Driver> loadedDrivers = ServiceLoader.load(Driver.class, cl);
```

`DriverManager` 主动获取调用线程的上下文类加载器（通常为 Application ClassLoader），通过它加载 SPI 实现类。这本质上是"父加载器请求子加载器完成加载"，打破了双亲委派的单向性。

**Tomcat** 的类加载体系是另一个典型的破坏案例。Tomcat 为每个 Web 应用创建独立的 WebAppClassLoader，打破双亲委派的原因非常明确：

1. **隔离性**：一个 Web 应用中的类（如 Spring、Log4j 的特定版本）对其他应用不可见
2. **热替换**：重新部署 Web 应用时，丢弃旧的 WebAppClassLoader 并创建新的，类重新加载
3. **优先加载 Web 应用类**：Web 应用的 `WEB-INF/lib` 和 `WEB-INF/classes` 中的类优先于服务器公共类

Tomcat 的类加载顺序是：Bootstrap -> System -> WEB-INF/classes -> WEB-INF/lib -> Common（服务器公共）。这与双亲委派的"先委派后加载"正好相反——它先尝试自行加载，失败才委派给父加载器。

**OSGi** 的类加载模型更为复杂。每个 Bundle（模块）拥有自己的类加载器，类加载不再遵循树形结构，而是基于包的导入导出声明形成网状的依赖关系。一个 Bundle 可以显式声明它"导出"某些包（对其他 Bundle 可见）和"导入"某些包（使用其他 Bundle 导出的包）。OSGi 类加载器在加载一个类时，会根据该类的包名查找声明导出该包的 Bundle，然后委托给该 Bundle 的类加载器加载。这种模型实现了严格的模块化和版本控制——不同 Bundle 可以使用同一包的不同版本。

### 6.1.4 JDK 9+ 模块化类加载

JDK 9 引入的 Project Jigsaw（Java 平台模块系统）对类加载机制进行了重大改造。

最直观的变化是 Extension ClassLoader 被移除，取而代之的是 Platform ClassLoader。但这只是表象，更深层的变革在于：

**模块边界检查**：在 JDK 8 及之前，只要类路径上能找到的类都可以被访问。JDK 9 之后，即使类在运行时可见，如果它所在的模块没有导出该包，反射也无法访问。`java.lang.reflect.AccessibleObject.setAccessible()` 会抛出 `InaccessibleObjectException`——这是大量旧版框架在 JDK 9+ 上运行时遇到的第一道坎。

**类加载器不再是唯一隔离边界**：模块系统引入了一层新的访问控制。两个类加载器可以加载同一个类的不同版本（如果它们来自不同模块），但在模块系统层面被严格约束。`ModuleDescriptor` 和 `ModuleLayer` 提供了模块化的运行时视图。

**启动类加载器的扩展**：JDK 9 中，启动类加载器不仅负责核心类，还负责加载所有平台模块。这意味着以前由 Extension ClassLoader 加载的类现在由启动类加载器处理。使用 `--add-exports` 和 `--add-opens` 命令行参数可以在启动时打破模块封装——虽然不推荐在生产环境使用。

```bash
# JDK 9+ 中打开 java.base 模块中 sun.security 包的反射访问
java --add-opens java.base/sun.security=ALL-UNNAMED -jar app.jar
```

---

## 6.2 案例 6-1：NoSuchMethodError 排查与解决

### 6.2.1 问题现象

NoSuchMethodError 是生产环境中最常见的运行时错误之一。它的典型表现是：代码编译通过，但运行时抛出 `java.lang.NoSuchMethodError`，伴随明确的缺失方法签名。

```
Exception in thread "main" java.lang.NoSuchMethodError: 'void com.example.Service.process(java.lang.String)'
```

这个错误信息意味着 JVM 在方法区中找到了目标类 `com.example.Service`，但尝试调用 `process(String)` 方法时，发现该类的定义中不包含这个方法。

### 6.2.2 根因分析

NoSuchMethodError 的本质是**编译期与运行期的类定义不一致**。编译时依赖的 A 版本包含某个方法，运行时实际加载的 A 版本可能不包含该方法。具体来说：

1. **依赖冲突**：项目直接依赖 `guava-30.0.jar`（包含 `Preconditions.checkNotNull(Object, Supplier)`），但传递依赖引入了 `guava-20.0.jar`，运行期类路径上的版本不包含该重载方法
2. **API 迁移**：某个类从包 A 移到包 B，旧的引用仍在使用旧包名
3. **二进制兼容性破坏**：将一个已有的方法签名从 `process(String)` 改为 `process(String, int)`——这在语义上是"增强"，但对已编译的调用方而言是二进制不兼容的
4. **多 ClassLoader 加载同一类**：自定义类加载器从不同位置加载了同一类的不同版本

### 6.2.3 排查工具

**`-XX:+TraceClassLoading`**

启动 JVM 时加上 `-XX:+TraceClassLoading` 标志，JVM 会将每个类的加载信息输出到标准输出。这是最直接的方法，可以精确地看到每个类是从哪个 jar 中加载的：

```
[Loaded com.example.Service from file:/app/libs/old-service-1.0.jar]
```

如果发现 Service 是从旧版本的 jar 加载的，问题就明确了。

**Arthas `sc -d`**

使用 Arthas 的 `sc`（Search Class）命令可以查看类的详细信息，包括它来自哪个 ClassLoader 和哪个 jar 包：

```bash
# 搜索指定类并显示详细信息
sc -d com.example.Service

# 输出示例
 class-info        com.example.Service
 code-source       /app/libs/guava-20.0.jar
 classLoader       sun.misc.Launcher$AppClassLoader
```

`code-source` 直接指出了类的来源。结合 `sc` 查看类的方法列表，可以确认当前加载的版本是否包含目标方法。

**Maven Dependency Plugin**

```bash
# 查看完整的依赖树，定位冲突
mvn dependency:tree

# 查找特定 artifact 的版本
mvn dependency:tree -Dincludes=com.google.guava:guava
```

输出示例：

```
[INFO] com.example:my-app:jar:1.0
[INFO] +- com.google.guava:guava:jar:30.0 (compile)
[INFO] \- org.apache.hadoop:hadoop-common:jar:3.3.0
[INFO]    \- com.google.guava:guava:jar:20.0 (compile)
```

可以看出 `guava 30.0` 被直接依赖，但 `hadoop-common` 传递依赖引入了 `guava 20.0`。Maven 默认的"就近依赖"策略会选择 `30.0`，但如果 POM 声明顺序或依赖路径深度导致选择了旧版本，就可能在运行时产生 NoSuchMethodError。

### 6.2.4 解决方案

**方案一：maven-enforcer-plugin 强制依赖收敛**

在项目 POM 中配置依赖收敛规则，构建阶段即发现冲突：

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-enforcer-plugin</artifactId>
    <version>3.4.1</version>
    <executions>
        <execution>
            <id>enforce-dependency-convergence</id>
            <goals><goal>enforce</goal></goals>
            <configuration>
                <rules>
                    <dependencyConvergence/>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

当存在依赖冲突时，构建会直接失败并列出冲突的版本链路。这是最彻底的解决方案——将问题暴露在构建阶段而非运行时。

**方案二：显式声明版本**

使用 `<dependencyManagement>` 显式锁定版本，覆盖传递依赖：

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.google.guava</groupId>
            <artifactId>guava</artifactId>
            <version>30.0-jre</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

**方案三：排除传递依赖**

```xml
<dependency>
    <groupId>org.apache.hadoop</groupId>
    <artifactId>hadoop-common</artifactId>
    <exclusions>
        <exclusion>
            <groupId>com.google.guava</groupId>
            <artifactId>guava</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

### 6.2.5 代码示例

项目中 `NoSuchMethodDemo` 类演示了多 ClassLoader 加载同一类的情况：

```java
public class NoSuchMethodDemo {
    public static void main(String[] args) throws Exception {
        ClassLoader parent = NoSuchMethodDemo.class.getClassLoader();
        // 创建一个子 ClassLoader，用同一个 URL 但指定 parent
        ClassLoader child = new java.net.URLClassLoader(
            new java.net.URL[]{((java.net.URLClassLoader)parent).getURLs()[0]},
            parent
        );
        // 使用系统 ClassLoader 加载
        Class<?> clazz1 = Class.forName("com.jvmbook.ch06.DemoService");
        // 使用子 ClassLoader 加载
        Class<?> clazz2 = Class.forName("com.jvmbook.ch06.DemoService", true, child);

        System.out.println("Class 1 loader: " + clazz1.getClassLoader());
        System.out.println("Class 2 loader: " + clazz2.getClassLoader());
    }
}
```

由于双亲委派机制，子 ClassLoader 会将请求委派给父 ClassLoader，因此实际 `clazz2` 的加载器仍然是 Application ClassLoader。但如果子 ClassLoader 覆盖了 `loadClass` 方法（不委派），同一个类将在 JVM 中存在两个不同的 Class 对象，由此可能引发 ClassCastException——当代码持有 `clazz1` 的实例，却试图将其强制转换为 `clazz2` 的 `Class` 对应的类型时，JVM 因类型来源不同而抛出异常。

---

## 6.3 案例 6-2：自定义 ClassLoader 实现热部署

### 6.3.1 场景描述

在开发过程中，每次修改代码都需要重启应用——这在大型项目中可能是漫长等待。热部署（Hot Deploy / Hot Swap）的目标是：**在不重启 JVM 的前提下，替换已加载的类定义，使新代码立即生效**。

Java 虚拟机规范在设计上允许开发者自定义类加载器来实现热部署。其核心思路是：

1. 为每个需要热部署的应用模块创建一个独立的 ClassLoader 实例
2. 当需要更新时，丢弃旧的 ClassLoader，创建新的 ClassLoader 重新加载类
3. 新的 Class 对象与旧的 Class 对象在 JVM 中隔离共存

### 6.3.2 实现方案

项目中 `HotDeployClassLoader` 实现了一个简易的热部署类加载器：

```java
public class HotDeployClassLoader extends ClassLoader {
    private final Path classesDir;

    public HotDeployClassLoader(Path classesDir, ClassLoader parent) {
        super(parent);
        this.classesDir = classesDir;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        String fileName = name.replace('.', '/') + ".class";
        Path classFile = classesDir.resolve(fileName);
        if (Files.exists(classFile)) {
            try {
                byte[] bytes = Files.readAllBytes(classFile);
                return defineClass(name, bytes, 0, bytes.length);
            } catch (IOException e) {
                throw new ClassNotFoundException(name, e);
            }
        }
        throw new ClassNotFoundException(name);
    }
}
```

这个类加载器的关键设计选择是 **只覆盖 `findClass` 而不覆盖 `loadClass`**。这意味着它保留了双亲委派行为：对于核心类库中的类（如 `java.lang.String`），它会委派给父 ClassLoader；只有父 ClassLoader 无法加载的类（即用户自定义的类），才由 `findClass` 从指定的 `classesDir` 目录加载。

但热部署的核心矛盾在于：**当一个类已经被加载到方法区后，JVM 规范不允许卸载或替换它**。因此"热部署"的实际做法是使用新的 ClassLoader 实例重新加载。

```java
// 第一次加载
HotDeployClassLoader loader1 = new HotDeployClassLoader(tmpDir, systemLoader);
Class<?> clazz1 = loader1.loadClass("com.jvmbook.ch06.HotDeployWorker");
Object instance1 = clazz1.getDeclaredConstructor().newInstance();
System.out.println(executeMethod.invoke(instance1));
// 输出: Version 1: Hello from HotDeployWorker

// 修改 HotDeployWorker.java 并重新编译后，创建新的 ClassLoader
HotDeployClassLoader loader2 = new HotDeployClassLoader(tmpDir, systemLoader);
Class<?> clazz2 = loader2.loadClass("com.jvmbook.ch06.HotDeployWorker");
Object instance2 = clazz2.getDeclaredConstructor().newInstance();
System.out.println(executeMethod.invoke(instance2));
// 输出: Version 2: Hello from HotDeployWorker (修改后重新编译的版本)
```

`HotDeployClassLoader.main()` 方法演示了这个过程。每次创建新的 ClassLoader 实例都会创建一个新的命名空间，同一个类名 `HotDeployWorker` 在新旧 ClassLoader 中对应两个不同的 Class 对象。

### 6.3.3 ClassLoader 的垃圾回收条件

热部署面临的一个重要问题是：被替换掉的 ClassLoader 和它加载的类何时能被 GC 回收？如果旧 ClassLoader 一直无法回收，每次热部署都会产生一次 Metaspace 泄漏，最终导致 `java.lang.OutOfMemoryError: Metaspace`。

ClassLoader 被回收的充要条件：

1. **该 ClassLoader 的所有实例都不可达**——没有任何变量引用旧的 ClassLoader 对象
2. **该 ClassLoader 加载的所有 Class 对象都不可达**——应用中不再持有任何由该 ClassLoader 加载的类的实例
3. **这些 Class 对象对应的 java.lang.Class 对象也不可达**——不再通过反射等方式引用这些类

简单来说，如果应用中任何一个变量仍持有旧 ClassLoader 加载的对象，该 ClassLoader 的元数据就无法释放。在 Spring 等框架中，Bean 容器持有所有 Bean 的强引用，因此热部署需要确保容器也重新创建——这也是为什么成熟的 Java 热部署方案（如 Spring Boot Devtools、JRebel）都涉及应用上下文的重新创建。

Metaspace 中的类元数据回收由 `-XX:MaxMetaspaceFreeRatio` 参数控制，默认值为 70。当 Metaspace 中空闲比例超过 70% 时，JVM 会触发类元数据的卸载。可以通过 `-XX:+TraceClassUnloading` 开启类卸载日志。

### 6.3.4 生产级方案的局限性

自定义 ClassLoader 实现热部署虽然能解决"替换类定义"的问题，但在生产级应用中存在明显局限：

1. **对象状态丢失**：旧 ClassLoader 创建的实例不会自动迁移到新 ClassLoader 的类定义中。如果应用中存在复杂的状态（如长连接池、缓存），这些状态需要显式迁移或重建
2. **静态字段失效**：新 ClassLoader 加载的类拥有全新的静态字段——之前积累的静态变量值全部丢失
3. **框架兼容性**：Spring 的代理类（CGLIB、JDK 动态代理）内部持有对原始 ClassLoader 的引用，热部署后需要重新创建代理
4. **类加载死锁**：在多线程环境下，自定义 ClassLoader 的 `loadClass` 方法使用了 `synchronized` 加锁，如果多个 ClassLoader 之间存在交叉依赖可能产生死锁

因此，**生产环境更推荐**：
- **JRebel**：字节码层面的热替换，不需要自定义 ClassLoader，支持方法体修改、新增字段等。原理是通过 Java Agent 拦截类加载，在字节码中插入重定向逻辑
- **Spring Boot Devtools**：使用两个 ClassLoader，基础库由 Base ClassLoader 加载，应用代码由 Restart ClassLoader 加载。当检测到文件变化时丢弃 Restart ClassLoader 并创建新的——应用上下文自动重建
- **DCEVM（Dynamic Code Evolution VM）**：修改了 JVM 本身，允许真正的类定义替换，支持添加/删除方法和字段。这是最接近"真正的热部署"的解决方案

---

## 6.4 小结

本章讨论了 JVM 类加载机制的核心原理和两个典型案例。

类加载的五个阶段——加载、验证、准备、解析、初始化——构成了 Java 动态性的基础。双亲委派模型通过层次化的类加载器组织方式保证了核心类库的安全性和唯一性。JDK 9 的模块化系统在此基础上引入了模块边界检查，进一步强化了封装性。

在生产实践中，NoSuchMethodError 是依赖冲突的标志性症状，解决的关键在于构建阶段锁定依赖版本。而自定义 ClassLoader 虽然可以实现基础的热部署，但受限于 JVM 规范中对类卸载的限制，生产环境更建议使用专为热替换设计的商业或开源方案。

理解类加载机制的意义不仅仅在于解决故障——它是理解 JVM 安全模型、模块化体系和框架隔离策略的基石。在下一章中，我们将基于本章的 ClassLoader 知识，深入探讨 OOM（Out Of Memory）问题的排查与调优。
