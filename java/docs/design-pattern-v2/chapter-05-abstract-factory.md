# 第5章 抽象工厂模式（Abstract Factory）

**抽象工厂模式**是工厂方法模式的"升级版"，专门用于创建一系列相关或相互依赖的对象。它通过一个统一的抽象工厂接口，让客户端无需指定具体类就能创建属于同一产品族的多个产品对象，从而天然保证了产品之间的兼容性。

## 5.1 解决的问题与应用场景

### 5.1.1 问题分析 -- 从工厂方法的局限说起

工厂方法模式一次只能创建一种产品。但在实际系统中，经常需要同时创建多个相互关联的产品：

**场景举例：构建一套UI界面**

一套完整的UI界面由多种组件构成：按钮、文本框、下拉菜单、表格等。这些组件必须出自同一"风格"（如Windows风格或Mac风格），否则界面会非常违和。

如果只用工厂方法模式：

```java
// 每种组件都有独立的工厂
ButtonFactory buttonFactory = new WindowsButtonFactory();
TextFieldFactory textFieldFactory = new WindowsTextFieldFactory();
ComboBoxFactory comboBoxFactory = new WindowsComboBoxFactory();

Button button = buttonFactory.createButton();
TextField textField = textFieldFactory.createTextField();
ComboBox comboBox = comboBoxFactory.createComboBox();
```

问题暴露无遗：

1. **客户端需要知道所有工厂类**：必须记住4个不同工厂类的名字和用途
2. **产品一致性无法保证**：如果某个工厂被错误地替换为Mac风格，就会出现风格混搭（Windows按钮 + Mac文本框）
3. **切换产品族代价巨大**：从Windows切换到Mac风格，需要修改4处工厂创建代码
4. **新增组件类型困难**：新增组件（如进度条）需要修改所有相关的创建代码

**抽象工厂的解决思路**：

```java
// 一个工厂创建整个产品族的所有产品
UIFactory factory = new WindowsUIFactory();

Button button = factory.createButton();       // 自动是Windows风格
TextField textField = factory.createTextField(); // 自动是Windows风格
ComboBox comboBox = factory.createComboBox(); // 自动是Windows风格

// 切换为Mac风格只需换一行
factory = new MacUIFactory();  // 所有组件自动变为Mac风格
```

### 5.1.2 典型应用场景

| 场景 | 产品族 | 产品等级 | 说明 |
|------|--------|----------|------|
| 跨平台UI | Windows/Mac/Linux | 按钮、输入框、下拉菜单等 | 一次切换整个风格 |
| 多数据库 | MySQL/PostgreSQL/Oracle | Connection、Statement、ResultSet | JDBC的设计基础 |
| 主题系统 | Light/Dark/Blue | 按钮皮肤、面板皮肤、文字颜色 | 网站换肤 |
| 汽车制造 | 经济型/豪华型/运动型 | 发动机、轮胎、座椅、车架 | 零配件必须配套 |
| 游戏装备 | 战士/法师/猎手 | 武器、铠甲、头盔、饰品 | 装备成套发放 |
| 文档处理 | PDF/Word/HTML | 解析器、渲染器、导出器 | 同一格式的处理链 |
| 国际化 | 中文/英文/日文 | 日期格式化、数字格式化、消息模板 | 同一语言的格式配套 |

### 5.1.3 关键概念解析

**产品族（Product Family）**：由同一个工厂生产的、属于不同产品等级结构的一组相关产品。

例如：WindowsUIFactory 生产的 WindowsButton、WindowsTextField 属于同一产品族。

**产品等级（Product Hierarchy）**：同一类产品在不同产品族中的表现形态。

例如：WindowsButton、MacButton、LinuxButton 都属于 Button 产品等级。

## 5.2 实现原理与UML

### 5.2.1 核心思想

抽象工厂模式的核心是声明一个**创建一系列抽象产品对象的接口**。每个具体工厂实现这个接口，负责创建属于同一产品族的具体产品。

五个关键角色：

1. **AbstractFactory（抽象工厂）**：声明一组创建抽象产品的方法
2. **ConcreteFactory（具体工厂）**：实现创建具体产品的方法
3. **AbstractProduct（抽象产品）**：为每种产品声明接口（可能有多个）
4. **ConcreteProduct（具体产品）**：实现抽象产品接口
5. **Client（客户端）**：只与抽象工厂和抽象产品交互

### 5.2.2 UML类图

```
┌─────────────────────────────────────────┐
│          <<interface>>                   │
│        AbstractFactory                  │  ← 抽象工厂接口
├─────────────────────────────────────────┤
│ + createProductA(): AbstractProductA    │  ← 创建产品A的工厂方法
│ + createProductB(): AbstractProductB    │  ← 创建产品B的工厂方法
└─────────────────────────────────────────┘
                    ▲
                    │ implements
       ┌────────────┴────────────┐
       │                         │
┌──────────────────────┐  ┌──────────────────────┐
│  ConcreteFactory1    │  │  ConcreteFactory2    │  ← 具体工厂
├──────────────────────┤  ├──────────────────────┤
│ + createProductA()   │  │ + createProductA()   │
│   -> ProductA1       │  │   -> ProductA2       │
│ + createProductB()   │  │ + createProductB()   │
│   -> ProductB1       │  │   -> ProductB2       │
└──────────────────────┘  └──────────────────────┘

┌─────────────────────────┐     ┌─────────────────────────┐
│    AbstractProductA     │     │    AbstractProductB     │  ← 抽象产品
├─────────────────────────┤     ├─────────────────────────┤
│ + operation(): void     │     │ + action(): void        │
└─────────────────────────┘     └─────────────────────────┘
           ▲                               ▲
           │                               │
    ┌──────┴──────┐                 ┌──────┴──────┐
    │             │                 │             │
┌────────┐  ┌────────┐       ┌────────┐  ┌────────┐
│ProductA1│ │ProductA2│      │ProductB1│ │ProductB2│ ← 具体产品
└────────┘  └────────┘       └────────┘  └────────┘

          ┌─────────────────────────┐
          │        Client           │  ← 客户端
          ├─────────────────────────┤
          │ - factory: AbstractFactory│ ← 持有抽象工厂引用
          │ - productA: AbstractProductA│
          │ - productB: AbstractProductB│
          └─────────────────────────┘
```

### 5.2.3 角色职责分析

| 角色 | 职责 | 示例（UI场景） |
|------|------|---------------|
| AbstractFactory | 声明创建所有抽象产品的方法 | UIFactory |
| ConcreteFactory | 实现创建具体产品的方法（同一产品族） | WindowsUIFactory, MacUIFactory |
| AbstractProductA/B | 各类产品的抽象接口 | Button, TextField |
| ConcreteProductA/B | 各类产品的具体实现 | WindowsButton, MacTextField |
| Client | 使用抽象工厂和抽象产品，不关心具体类型 | Application |

### 5.2.4 时序图

```
Client               AbstractFactory        ConcreteFactory1       ProductA1      ProductB1
  │                        │                       │                    │             │
  │                        │                       │                    │             │
  │--依赖注入工厂引用------►│                       │                    │             │
  │ (ConcreteFactory1)    │                       │                    │             │
  │                        │                       │                    │             │
  │  createProductA()     │                       │                    │             │
  │ ──────────────────────│──────────────────────►│                    │             │
  │                        │                       │──new ProductA1()──►│             │
  │                        │                       │                    │             │
  │        productA        │        productA       │                    │             │
  │ ◄──────────────────────│◄──────────────────────│                    │             │
  │                        │                       │                    │             │
  │  createProductB()     │                       │                    │             │
  │ ──────────────────────│──────────────────────►│                    │             │
  │                        │                       │──new ProductB1()─────────────►│
  │                        │                       │                    │          │
  │        productB        │        productB       │                    │          │
  │ ◄──────────────────────│◄──────────────────────│                    │          │
  │                        │                       │                    │          │
  │  productA.operation() │                       │                    │          │
  │ ──────────────────────────────────────────────────────────────────►          │
  │                        │                       │                    │          │
```

## 5.3 代码实现

### 5.3.1 经典实现 -- 跨平台UI工具包

以跨平台UI组件为例，完整演示抽象工厂模式的各个环节。

**第一步：定义抽象产品接口**

```java
/**
 * 抽象产品A：按钮
 */
public interface Button {
    /**
     * 渲染按钮
     */
    void render();

    /**
     * 设置点击事件处理器
     * @param handler 点击时执行的回调
     */
    void onClick(Runnable handler);
}

/**
 * 抽象产品B：输入框
 */
public interface TextField {
    /**
     * 渲染输入框
     */
    void render();

    /**
     * 获取输入框文本
     */
    String getText();

    /**
     * 设置输入框文本
     */
    void setText(String text);

    /**
     * 设置占位提示文字
     */
    void setPlaceholder(String placeholder);
}

/**
 * 抽象产品C：复选框
 */
public interface CheckBox {
    /**
     * 渲染复选框
     */
    void render();

    /**
     * 是否勾选
     */
    boolean isChecked();

    /**
     * 设置为勾选/取消勾选
     */
    void setChecked(boolean checked);
}
```

**第二步：实现Windows风格的具体产品**

```java
/**
 * 具体产品：Windows风格按钮
 */
public class WindowsButton implements Button {
    private Runnable clickHandler;

    @Override
    public void render() {
        System.out.println("[Windows] Rendering a gray button with square corners");
        // 实际绘制：使用Windows GDI绘制按钮
    }

    @Override
    public void onClick(Runnable handler) {
        this.clickHandler = handler;
        System.out.println("[Windows] Button: click event registered");
    }
}

/**
 * 具体产品：Windows风格输入框
 */
public class WindowsTextField implements TextField {
    private String text = "";
    private String placeholder = "";

    @Override
    public void render() {
        System.out.println("[Windows] Rendering text field with 3D border");
    }

    @Override
    public String getText() {
        return text;
    }

    @Override
    public void setText(String text) {
        this.text = text;
        System.out.println("[Windows] Text set: " + text);
    }

    @Override
    public void setPlaceholder(String placeholder) {
        this.placeholder = placeholder;
    }
}

/**
 * 具体产品：Windows风格复选框
 */
public class WindowsCheckBox implements CheckBox {
    private boolean checked = false;

    @Override
    public void render() {
        System.out.println("[Windows] Rendering square checkbox, checked=" + checked);
    }

    @Override
    public boolean isChecked() {
        return checked;
    }

    @Override
    public void setChecked(boolean checked) {
        this.checked = checked;
    }
}
```

**第三步：实现Mac风格的具体产品**

```java
/**
 * 具体产品：Mac风格按钮
 */
public class MacButton implements Button {
    private Runnable clickHandler;

    @Override
    public void render() {
        System.out.println("[Mac] Rendering a rounded blue button with gradient");
    }

    @Override
    public void onClick(Runnable handler) {
        this.clickHandler = handler;
        System.out.println("[Mac] Button: click event bound to trackpad/click");
    }
}

/**
 * 具体产品：Mac风格输入框
 */
public class MacTextField implements TextField {
    private String text = "";
    private String placeholder = "";

    @Override
    public void render() {
        System.out.println("[Mac] Rendering flat text field with rounded corners");
    }

    @Override
    public String getText() {
        return text;
    }

    @Override
    public void setText(String text) {
        this.text = text;
        System.out.println("[Mac] Text set: " + text);
    }

    @Override
    public void setPlaceholder(String placeholder) {
        this.placeholder = placeholder;
    }
}

/**
 * 具体产品：Mac风格复选框
 */
public class MacCheckBox implements CheckBox {
    private boolean checked = false;

    @Override
    public void render() {
        System.out.println("[Mac] Rendering round checkbox with animation, checked=" + checked);
    }

    @Override
    public boolean isChecked() {
        return checked;
    }

    @Override
    public void setChecked(boolean checked) {
        this.checked = checked;
    }
}
```

**第四步：定义抽象工厂接口**

```java
/**
 * 抽象工厂接口：UI工厂
 * 定义创建所有UI组件的方法
 *
 * 所有方法返回的都是抽象产品类型，而非具体实现
 */
public interface UIFactory {

    /**
     * 创建按钮
     */
    Button createButton();

    /**
     * 创建输入框
     */
    TextField createTextField();

    /**
     * 创建复选框
     */
    CheckBox createCheckBox();
}
```

**第五步：实现具体工厂**

```java
/**
 * 具体工厂：Windows UI工厂
 * 创建的所有组件都是Windows风格的
 */
public class WindowsUIFactory implements UIFactory {

    @Override
    public Button createButton() {
        return new WindowsButton();
    }

    @Override
    public TextField createTextField() {
        return new WindowsTextField();
    }

    @Override
    public CheckBox createCheckBox() {
        return new WindowsCheckBox();
    }
}

/**
 * 具体工厂：Mac UI工厂
 * 创建的所有组件都是Mac风格的
 */
public class MacUIFactory implements UIFactory {

    @Override
    public Button createButton() {
        return new MacButton();
    }

    @Override
    public TextField createTextField() {
        return new MacTextField();
    }

    @Override
    public CheckBox createCheckBox() {
        return new MacCheckBox();
    }
}
```

**第六步：构建客户端（UI应用）**

```java
/**
 * 客户端：UI应用程序
 * 只依赖抽象工厂(UIFactory)和抽象产品(Button, TextField, CheckBox)
 * 完全不关心具体是Windows还是Mac实现
 */
public class Application {
    private final Button loginButton;
    private final TextField usernameField;
    private final TextField passwordField;
    private final CheckBox rememberMeCheckBox;

    /**
     * 构造函数通过依赖注入接收抽象工厂
     * 工厂决定了整个应用UI的风格
     */
    public Application(UIFactory factory) {
        this.loginButton = factory.createButton();
        this.usernameField = factory.createTextField();
        this.passwordField = factory.createTextField();
        this.rememberMeCheckBox = factory.createCheckBox();
    }

    /**
     * 渲染整个UI界面
     * 注意：这里完全不涉及具体类名
     */
    public void render() {
        System.out.println("=== Rendering Login UI ===");
        usernameField.setPlaceholder("Username");
        usernameField.render();

        passwordField.setPlaceholder("Password");
        passwordField.render();

        rememberMeCheckBox.setChecked(false);
        rememberMeCheckBox.render();

        loginButton.render();
        loginButton.onClick(() -> System.out.println("Login button clicked!"));
        System.out.println("=== UI Rendered ===");
    }
}
```

**第七步：启动应用程序**

```java
/**
 * 入口类：根据操作系统选择工厂
 */
public class Main {
    public static void main(String[] args) {
        // 根据操作系统选择对应的UI工厂
        UIFactory factory = createFactory();
        System.out.println("Using factory: " + factory.getClass().getSimpleName());

        // 创建应用（风格由工厂注入决定）
        Application app = new Application(factory);
        app.render();

        System.out.println("\n--- Switching to different platform ---\n");

        // 演示切换工厂（比如用户手动切换主题）
        Application macApp = new Application(new MacUIFactory());
        macApp.render();
    }

    /**
     * 工厂选择策略：根据操作系统自动选择
     */
    private static UIFactory createFactory() {
        String osName = System.getProperty("os.name").toLowerCase();
        if (osName.contains("mac")) {
            return new MacUIFactory();
        } else {
            return new WindowsUIFactory();
        }
    }
}
```

**运行输出示例**：

```
Using factory: WindowsUIFactory
=== Rendering Login UI ===
[Windows] Rendering text field with 3D border
[Windows] Text set: Username
[Windows] Rendering text field with 3D border
[Windows] Text set: Password
[Windows] Rendering square checkbox, checked=false
[Windows] Rendering a gray button with square corners
[Windows] Button: click event registered
=== UI Rendered ===

--- Switching to different platform ---

=== Rendering Login UI ===
[Mac] Rendering flat text field with rounded corners
[Mac] Text set: Username
[Mac] Rendering flat text field with rounded corners
[Mac] Text set: Password
[Mac] Rendering round checkbox with animation, checked=false
[Mac] Rendering a rounded blue button with gradient
[Mac] Button: click event bound to trackpad/click
=== UI Rendered ===
```

### 5.3.2 关键设计要点

**产品族一致性保证**：

```java
// 抽象工厂天然保证产品族的一致性
// 因为所有产品都来自同一个工厂

public class LoginForm {
    private final Button loginButton;
    private final TextField usernameField;
    // ...
    public LoginForm(UIFactory factory) {
        // factory.createButton() 和 factory.createTextField()
        // 返回的是同一产品族的产品，不可能出现混搭
        this.loginButton = factory.createButton();
        this.usernameField = factory.createTextField();
    }
}

// 下面这种情况在抽象工厂模式下不可能发生：
// loginButton 是 WindowsButton, usernameField 是 MacTextField
// 因为它们都来自同一个工厂！
```

### 5.3.3 使用配置文件驱动工厂选择

```java
/**
 * 工厂加载器：通过配置文件动态选择工厂实现
 * 彻底解耦平台判断逻辑
 */
public class UIFactoryLoader {

    // 配置文件中的key
    private static final String FACTORY_KEY = "ui.factory.class";

    // 已加载的工程实例（单例模式 + 抽象工厂模式的组合）
    private static volatile UIFactory factory;

    /**
     * 获取UI工厂实例
     * 优先从配置文件读取，配置文件不存在时自动检测操作系统
     */
    public static UIFactory getFactory() {
        if (factory == null) {
            synchronized (UIFactoryLoader.class) {
                if (factory == null) {
                    factory = loadFactory();
                }
            }
        }
        return factory;
    }

    private static UIFactory loadFactory() {
        // 1. 尝试从配置文件读取
        String factoryClass = loadFromProperties();

        // 2. 配置文件不存在时，根据操作系统自动选择
        if (factoryClass == null) {
            return detectByOS();
        }

        // 3. 反射加载配置文件指定的工厂类
        try {
            Class<?> clazz = Class.forName(factoryClass);
            return (UIFactory) clazz.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException(
                "Failed to load UIFactory: " + factoryClass, e);
        }
    }

    private static String loadFromProperties() {
        try (InputStream input = UIFactoryLoader.class.getClassLoader()
                .getResourceAsStream("ui-config.properties")) {
            if (input == null) {
                System.out.println("No ui-config.properties found, using OS detection");
                return null;
            }
            Properties props = new Properties();
            props.load(input);
            return props.getProperty(FACTORY_KEY);
        } catch (IOException e) {
            System.out.println("Failed to load ui-config.properties: " + e.getMessage());
            return null;
        }
    }

    private static UIFactory detectByOS() {
        String osName = System.getProperty("os.name", "").toLowerCase();
        if (osName.contains("mac")) {
            System.out.println("Detected macOS, using MacUIFactory");
            return new MacUIFactory();
        } else {
            System.out.println("Detected Windows/Linux, using WindowsUIFactory");
            return new WindowsUIFactory();
        }
    }
}
```

**配置文件 `ui-config.properties`**：

```properties
# UI工厂实现类
ui.factory.class=com.example.ui.MacUIFactory
```

### 5.3.4 扩展：使用枚举和抽象工厂结合

对于简单场景，可以用枚举简化工厂选择：

```java
/**
 * 使用枚举简化工厂选择
 */
public enum UIFactoryType {
    WINDOWS(new WindowsUIFactory()),
    MAC(new MacUIFactory());

    private final UIFactory factory;

    UIFactoryType(UIFactory factory) {
        this.factory = factory;
    }

    public UIFactory getFactory() {
        return factory;
    }

    /**
     * 根据配置名获取工厂
     */
    public static UIFactory from(String name) {
        return valueOf(name.toUpperCase()).getFactory();
    }
}

// 使用
// UIFactory factory = UIFactoryType.from("mac").getFactory();
// Application app = new Application(factory);
```

## 5.4 JDK/框架源码解析

### 5.4.1 javax.xml.parsers.DocumentBuilderFactory -- 经典抽象工厂

JDK中的XML解析器工厂是抽象工厂模式的标准实践。

```java
// 抽象工厂类
public abstract class DocumentBuilderFactory {

    // 静态工厂方法获取具体工厂实例
    public static DocumentBuilderFactory newInstance() {
        // 通过JAXP查找机制决定具体实现类
        return FactoryFinder.find(
            DocumentBuilderFactory.class,
            "com.sun.org.apache.xerces.internal.jaxp.DocumentBuilderFactoryImpl"
        );
    }

    // 抽象产品创建方法
    public abstract DocumentBuilder newDocumentBuilder()
        throws ParserConfigurationException;

    // 配置方法
    public abstract void setNamespaceAware(boolean awareness);
    public abstract void setValidating(boolean validating);
    // ...
}

// 使用方式
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
factory.setNamespaceAware(true);
DocumentBuilder builder = factory.newDocumentBuilder();
Document doc = builder.parse(new File("config.xml"));
```

类似的工厂模式还有：
- `SAXParserFactory.newInstance()`
- `TransformerFactory.newInstance()`
- `XPathFactory.newInstance()`
- `XMLInputFactory.newFactory()`

### 5.4.2 JDBC -- 数据库连接作为抽象工厂

JDBC的 `java.sql.Connection` 接口本质上是一个抽象工厂角色。

```java
/**
 * Connection 接口 -- 抽象工厂
 * 一个连接对象可以创建多种数据库操作对象（同一产品族）
 */
public interface Connection extends Wrapper, AutoCloseable {

    // 工厂方法1：创建普通Statement
    Statement createStatement() throws SQLException;

    // 工厂方法2：创建预编译Statement
    PreparedStatement prepareStatement(String sql) throws SQLException;

    // 工厂方法3：创建存储过程Statement
    CallableStatement prepareCall(String sql) throws SQLException;

    // 工厂方法4：创建数据库元数据对象
    DatabaseMetaData getMetaData() throws SQLException;

    // 创建SAVEPOINT...
}

// 具体工厂：MySQL的Connection实现
// com.mysql.cj.jdbc.ConnectionImpl 实现了上述所有方法
// 返回的 Statement, PreparedStatement 都是MySQL配套的产品

// 客户端使用 -- 只依赖JDBC接口，不依赖具体数据库实现
Connection conn = DriverManager.getConnection(url, username, password);

// 创建的所有对象都是同一产品族的（如全是MySQL产品族）
Statement stmt = conn.createStatement();
PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
DatabaseMetaData meta = conn.getMetaData();
```

### 5.4.3 Spring BeanFactory 体系

Spring的容器体系是抽象工厂模式在框架层面的宏大应用。

```java
/**
 * Spring BeanFactory -- 抽象工厂（顶层接口）
 */
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
    <T> T getBean(String name, Class<T> requiredType) throws BeansException;
    boolean containsBean(String name);
    boolean isSingleton(String name) throws NoSuchBeanDefinitionException;
    // ...
}

/**
 * ApplicationContext -- 扩展的抽象工厂
 * 继承了多个工厂接口
 */
public interface ApplicationContext extends
        EnvironmentCapable,
        ListableBeanFactory,        // 列出Bean的能力
        HierarchicalBeanFactory,    // 层级关系
        MessageSource,              // 国际化消息（又一个产品族）
        ApplicationEventPublisher,  // 事件发布
        ResourcePatternResolver {   // 资源加载
    // ...
}

// 具体工厂：
// - ClassPathXmlApplicationContext（XML配置驱动的工厂）
// - AnnotationConfigApplicationContext（注解配置驱动的工厂）
// - GenericWebApplicationContext（Web环境的工厂）

// 无论使用哪个具体工厂，客户端操作完全一致
ApplicationContext context = new AnnotationConfigApplicationContext(AppConfig.class);
UserService userService = context.getBean(UserService.class);
```

### 5.4.4 SLF4J 日志工厂体系

```java
// SLF4J 的抽象工厂设计
// ILoggerFactory -- 抽象工厂接口
public interface ILoggerFactory {
    Logger getLogger(String name);  // 工厂方法
}

// 具体工厂：
// - NOPLoggerFactory：返回空操作Logger
// - SimpleLoggerFactory：简单控制台Logger
// - Log4jLoggerFactory：桥接Log4j
// - LogbackLoggerFactory：桥接Logback（默认绑定）
// - JULRecordingLoggerFactory：桥接Java Util Logging

// 获取Logger（客户端不关心具体实现）
Logger logger = LoggerFactory.getLogger(MyClass.class);
logger.info("Hello, SLF4J!");
```

## 5.5 使用场景与案例

### 5.5.1 多数据库DAO层抽象

```java
/**
 * 场景：支持 MySQL、PostgreSQL、Oracle 三种数据库
 * 每个数据库对应一个产品族：Connection、Statement、ResultSet...
 */

// -- 抽象产品 --
public interface UserDao {
    User findById(Long id);
    List<User> findAll();
    void save(User user);
    void update(User user);
    void delete(Long id);
}

// -- 具体产品 --
public class MySQLUserDao implements UserDao {
    @Override
    public User findById(Long id) {
        System.out.println("[MySQL] SELECT * FROM users WHERE id=" + id);
        return new User(id, "MySQL User");
    }
    // ...其他方法类似
}

public class PostgreSQLUserDao implements UserDao {
    @Override
    public User findById(Long id) {
        System.out.println("[PostgreSQL] SELECT * FROM users WHERE id=" + id);
        return new User(id, "PostgreSQL User");
    }
    // ...其他方法类似
}

public class OracleUserDao implements UserDao {
    @Override
    public User findById(Long id) {
        System.out.println("[Oracle] SELECT * FROM users WHERE id=" + id);
        return new User(id, "Oracle User");
    }
    // ...其他方法类似
}

// -- 抽象工厂 --
public interface DaoFactory {
    UserDao createUserDao();
    OrderDao createOrderDao();
    ProductDao createProductDao();
}

// -- 具体工厂 --
public class MySQLDaoFactory implements DaoFactory {
    @Override
    public UserDao createUserDao() {
        return new MySQLUserDao();
    }

    @Override
    public OrderDao createOrderDao() {
        return new MySQLOrderDao();
    }

    @Override
    public ProductDao createProductDao() {
        return new MySQLProductDao();
    }
}

public class PostgreSQLDaoFactory implements DaoFactory {
    @Override
    public UserDao createUserDao() {
        return new PostgreSQLUserDao();
    }

    @Override
    public OrderDao createOrderDao() {
        return new PostgreSQLOrderDao();
    }

    @Override
    public ProductDao createProductDao() {
        return new PostgreSQLProductDao();
    }
}

// -- 客户端代码 --
public class UserServiceImpl implements UserService {
    private final UserDao userDao;
    private final OrderDao orderDao;

    // 通过构造函数注入抽象工厂，所有DAO自动配套
    public UserServiceImpl(DaoFactory factory) {
        this.userDao = factory.createUserDao();
        this.orderDao = factory.createOrderDao();
        // 不可能出现 MySQLUserDao + PostgreSQLOrderDao 的混搭！
    }

    @Override
    public User getUser(Long id) {
        return userDao.findById(id);
    }

    @Override
    public void placeOrder(Order order) {
        orderDao.save(order);
    }
}
```

### 5.5.2 云服务提供商抽象层

```java
/**
 * 场景：应用需要支持多个云服务商（AWS、Azure、阿里云）
 * 同一云服务商的产品需要配套使用
 */

// -- 抽象产品 --
public interface CloudStorage {
    void upload(String bucket, String key, byte[] data);
    byte[] download(String bucket, String key);
}

public interface CloudCompute {
    String launchInstance(String imageId, String instanceType);
    void terminateInstance(String instanceId);
}

public interface CloudDatabase {
    void createDatabase(String name);
    void deleteDatabase(String name);
    Connection getConnection(String name);
}

// -- 抽象工厂 --
public interface CloudProvider {
    CloudStorage createStorage();
    CloudCompute createCompute();
    CloudDatabase createDatabase();
    String getProviderName();
}

// -- 具体工厂：AWS --
public class AwsCloudProvider implements CloudProvider {
    @Override
    public CloudStorage createStorage() {
        return new S3Storage();
    }

    @Override
    public CloudCompute createCompute() {
        return new EC2Compute();
    }

    @Override
    public CloudDatabase createDatabase() {
        return new RdsDatabase();
    }

    @Override
    public String getProviderName() {
        return "AWS";
    }
}

// -- 具体工厂：阿里云 --
public class AliyunCloudProvider implements CloudProvider {
    @Override
    public CloudStorage createStorage() {
        return new OssStorage();
    }

    @Override
    public CloudCompute createCompute() {
        return new ECSCompute();
    }

    @Override
    public CloudDatabase createDatabase() {
        return new RdsDatabase();
    }

    @Override
    public String getProviderName() {
        return "Aliyun";
    }
}

// -- 客户端（云资源管理器）--
public class CloudResourceManager {
    private final CloudStorage storage;
    private final CloudCompute compute;
    private final CloudDatabase database;

    public CloudResourceManager(CloudProvider provider) {
        System.out.println("Initializing with: " + provider.getProviderName());
        this.storage = provider.createStorage();
        this.compute = provider.createCompute();
        this.database = provider.createDatabase();
    }

    public void deployApplication(byte[] appPackage) {
        storage.upload("apps", "myapp.jar", appPackage);
        String instanceId = compute.launchInstance("ami-12345", "t2.micro");
        database.createDatabase("myapp_db");
        System.out.println("Application deployed on instance: " + instanceId);
    }
}
```

### 5.5.3 游戏角色装备工厂

```java
/**
 * 场景：RPG游戏中，不同职业拥有不同装备套装
 * 同一职业的装备必须成套发放
 */

// -- 抽象产品 --
public interface Weapon {
    String getName();
    int getAttack();
    String getDescription();
}

public interface Armor {
    String getName();
    int getDefense();
    String getDescription();
}

public interface Accessory {
    String getName();
    String getEffect();
}

// -- 抽象工厂 --
public interface EquipmentFactory {
    Weapon createWeapon();
    Armor createArmor();
    Accessory createAccessory();
}

// -- 战士装备工厂 --
public class WarriorEquipmentFactory implements EquipmentFactory {
    @Override
    public Weapon createWeapon() {
        return new Weapon() {
            public String getName() { return "屠龙刀"; }
            public int getAttack() { return 120; }
            public String getDescription() { return "传说中能斩龙的神兵"; }
        };
    }

    @Override
    public Armor createArmor() {
        return new Armor() {
            public String getName() { return "玄铁重甲"; }
            public int getDefense() { return 200; }
            public String getDescription() { return "由天外陨铁铸造的铠甲"; }
        };
    }

    @Override
    public Accessory createAccessory() {
        return new Accessory() {
            public String getName() { return "狂暴护符"; }
            public String getEffect() { return "生命值低于30%时攻击力翻倍"; }
        };
    }
}

// -- 法师装备工厂 --
public class MageEquipmentFactory implements EquipmentFactory {
    @Override
    public Weapon createWeapon() {
        return new Weapon() {
            public String getName() { return "暗影法杖"; }
            public int getAttack() { return 180; }
            public String getDescription() { return "蕴含黑暗魔力的法杖"; }
        };
    }

    @Override
    public Armor createArmor() {
        return new Armor() {
            public String getName() { return "魔法长袍"; }
            public int getDefense() { return 60; }
            public String getDescription() { return "轻便的法师袍，附带魔法护盾"; }
        };
    }

    @Override
    public Accessory createAccessory() {
        return new Accessory() {
            public String getName() { return "魔力水晶"; }
            public String getEffect() { return "每秒恢复2%法力值"; }
        };
    }
}

// -- 角色类 --
public class GameCharacter {
    private final String name;
    private final Weapon weapon;
    private final Armor armor;
    private final Accessory accessory;

    public GameCharacter(String name, EquipmentFactory factory) {
        this.name = name;
        this.weapon = factory.createWeapon();
        this.armor = factory.createArmor();
        this.accessory = factory.createAccessory();
    }

    public void showEquipment() {
        System.out.println("=== " + name + " 的装备 ===");
        System.out.println("武器: " + weapon.getName() + " (攻击+" + weapon.getAttack() + ")");
        System.out.println("护甲: " + armor.getName() + " (防御+" + armor.getDefense() + ")");
        System.out.println("饰品: " + accessory.getName() + " - " + accessory.getEffect());
    }
}

// 使用
// GameCharacter warrior = new GameCharacter("亚瑟", new WarriorEquipmentFactory());
// warrior.showEquipment();
// GameCharacter mage = new GameCharacter("梅林", new MageEquipmentFactory());
// mage.showEquipment();
```

## 5.6 潜在风险与问题

### 5.6.1 新增产品等级困难 -- 最大的缺点

**核心问题**：在抽象工厂模式中，新增产品等级（如新增一个"单选框"组件）需要修改**所有**工厂。

```
当前状态：
  UIFactory (createButton, createTextField, createCheckBox)

新增需求：支持 RadioButton

需要修改：
  1. 新增 RadioButton 接口（抽象产品）
  2. 新增 WindowsRadioButton, MacRadioButton（具体产品）
  3. 修改 UIFactory 接口 -- 新增 createRadioButton()  ⚠ 接口修改！
  4. 修改 WindowsUIFactory -- 实现 createRadioButton()  ⚠
  5. 修改 MacUIFactory -- 实现 createRadioButton()      ⚠
  6. 如果还有其他工厂（LinuxUIFactory），也要修改    ⚠
```

这严重违反了开闭原则。抽象工厂的横轴（产品族）容易扩展，纵轴（产品等级）难以扩展。

**缓解策略**：

```java
/**
 * 策略1：使用参数化工厂方法
 * 减少接口中方法的数量，但牺牲类型安全
 */
public interface FlexibleUIFactory {
    /**
     * 通用的组件创建方法
     * @param componentType 组件类型
     * @return 创建的组件
     */
    UIComponent createComponent(String componentType);
}

// 工厂实现
public class WindowsFlexibleUIFactory implements FlexibleUIFactory {
    @Override
    public UIComponent createComponent(String componentType) {
        return switch (componentType) {
            case "button" -> new WindowsButton();
            case "textfield" -> new WindowsTextField();
            case "checkbox" -> new WindowsCheckBox();
            // 新增组件只添加分支，不修改接口
            case "radiobutton" -> new WindowsRadioButton();
            default -> throw new IllegalArgumentException(
                "Unknown component: " + componentType);
        };
    }
}
```

```java
/**
 * 策略2：使用接口隔离原则
 * 将大工厂拆分为多个小接口
 */
public interface ButtonFactory {
    Button createButton();
}

public interface TextFieldFactory {
    TextField createTextField();
}

public interface CheckBoxFactory {
    CheckBox createCheckBox();
}

public interface RadioButtonFactory {
    RadioButton createRadioButton();
}

// 组合工厂
public interface UIFactory extends ButtonFactory, TextFieldFactory, CheckBoxFactory {
}

// 扩展支持 RadioButton 的组合工厂
public interface ExtendedUIFactory extends UIFactory, RadioButtonFactory {
}
```

### 5.6.2 类层次结构复杂

随着产品等级和产品族的增加，类的数量呈指数增长：

```
产品族数量：M
产品等级数量：N

需要的类数量：
- 抽象产品接口：N 个
- 具体产品类：M × N 个
- 抽象工厂接口：1 个
- 具体工厂类：M 个

总计：1 + N + M + (M × N) 个类

举例：
M=3 (Windows, Mac, Linux)
N=5 (Button, TextField, CheckBox, RadioButton, ComboBox)

总类数 = 1 + 5 + 3 + 15 = 24 个类
```

**应对策略**：
- 评估实际需要的产品等级数量，避免过度抽象
- 仅在产品族的概念明确且相对稳定时使用
- 对于变化频繁的产品等级，用工厂方法模式替代

### 5.6.3 运行时无法动态切换产品等级

```java
// 抽象工厂不适合运行时动态添加产品类型
// 如果需要这种能力，考虑使用原型模式或Builder模式
```

### 5.6.4 过度抽象的陷阱

并非所有"看起来相关"的产品都需要抽象工厂：

```java
// 反面案例：为三个简单的类创建了8个类
// 过度抽象带来的维护成本远超收益

// 原始的需求只需要三个简单的类
class PdfReport { /* ... */ }
class ExcelReport { /* ... */ }
class HtmlReport { /* ... */ }
```

**判断是否应该使用抽象工厂**：
- 产品族是否会变化？（是 → 可以考虑）
- 产品等级是否会扩展？（频繁 → 不适合）
- 产品之间是否有强制的一致性要求？（有 → 适合）
- 系统规模是否够大？（大 → 适合；小 → 过度设计）

### 5.6.5 一致性被绕过的风险

```java
// 风险：客户端可能绕过工厂直接创建不一致的产品
UIFactory factory = new WindowsUIFactory();
Button button = factory.createButton();     // Windows按钮
TextField textField = new MacTextField();    // 直接创建了Mac输入框 -- 风格不一致！

// 防御措施：将具体产品类设为包级私有（package-private）
// 强制客户端必须通过工厂创建
class WindowsButton implements Button {  // 默认访问级别，外部包不可见
    // ...
}
```

## 5.7 优化策略

### 5.7.1 使用接口隔离原则分解工厂

```java
/**
 * 将单一的大工厂分解为多个关注点分离的小工厂
 * 每个工厂只负责一类产品的创建
 */

// 分离后的工厂接口
public interface ButtonCreator {
    Button createButton();
}

public interface TextFieldCreator {
    TextField createTextField();
}

public interface CheckBoxCreator {
    CheckBox createCheckBox();
}

// 具体实现同时实现多个小工厂接口
public class WindowsUIComponents implements
        ButtonCreator, TextFieldCreator, CheckBoxCreator {

    @Override
    public Button createButton() {
        return new WindowsButton();
    }

    @Override
    public TextField createTextField() {
        return new WindowsTextField();
    }

    @Override
    public CheckBox createCheckBox() {
        return new WindowsCheckBox();
    }
}

// 客户端可以只依赖自己需要的工厂接口
public class ButtonManager {
    private final ButtonCreator creator;

    public ButtonManager(ButtonCreator creator) {
        this.creator = creator;
    }

    public Button createStyledButton() {
        Button button = creator.createButton();
        // 额外配置...
        return button;
    }
}
```

### 5.7.2 结合工厂方法模式

```java
/**
 * 混合模式：抽象工厂 + 工厂方法
 * 外层用抽象工厂创建产品族，内层用工厂方法处理个别产品的复杂创建
 */
public interface SmartDeviceFactory {
    SmartPhone createPhone(String model);   // 工厂方法（参数化）
    SmartWatch createWatch();
    SmartEarphone createEarphone();
}

public class AppleDeviceFactory implements SmartDeviceFactory {
    @Override
    public SmartPhone createPhone(String model) {
        return switch (model) {
            case "pro" -> new IPhone15Pro();
            case "max" -> new IPhone15ProMax();
            case "se" -> new IPhoneSE();
            default -> throw new IllegalArgumentException("Unknown model: " + model);
        };
    }

    @Override
    public SmartWatch createWatch() {
        return new AppleWatchUltra();
    }

    @Override
    public SmartEarphone createEarphone() {
        return new AirPodsPro();
    }
}
```

### 5.7.3 使用依赖注入选择工厂

```java
/**
 * Spring环境下使用依赖注入管理抽象工厂
 */
@Configuration
public class UIConfiguration {

    /**
     * 根据配置决定使用哪个UI工厂
     */
    @Bean
    @ConditionalOnProperty(name = "ui.platform", havingValue = "windows")
    public UIFactory windowsUIFactory() {
        return new WindowsUIFactory();
    }

    @Bean
    @ConditionalOnProperty(name = "ui.platform", havingValue = "mac")
    public UIFactory macUIFactory() {
        return new MacUIFactory();
    }

    @Bean
    @ConditionalOnMissingBean(UIFactory.class)
    public UIFactory defaultUIFactory() {
        // 默认工厂
        return new WindowsUIFactory();
    }

    /**
     * 注入工厂创建应用
     */
    @Bean
    public Application application(UIFactory factory) {
        return new Application(factory);
    }
}
```

### 5.7.4 何时不应使用抽象工厂

| 信号 | 替代方案 |
|------|----------|
| 产品族永远不会变化 | 直接用具体类，或使用工厂方法 |
| 产品等级频繁增加 | 工厂方法模式 或 原型模式 |
| 只有一个产品等级 | 工厂方法模式（抽象工厂退化为工厂方法） |
| 产品间无强制相关性 | 独立的简单工厂 |
| 系统规模很小 | 直接用 `new`，保持简单 |
| 需要运行时动态创建 | 原型模式（clone） |
| 仅需要配置不同 | Builder模式 |

### 5.7.5 最佳实践总结

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 产品族2-3个，产品等级3-5个 | 经典抽象工厂 | 类数量可控，结构清晰 |
| 产品族多但产品等级稳定 | 经典抽象工厂 | 主要优势是扩展产品族 |
| 产品等级频繁变化 | 工厂方法 + 参数化 | 避免修改工厂接口 |
| 使用DI框架 | 容器管理 + 条件装配 | 利用Spring Profile灵活切换 |
| 插件式架构 | SPI + 抽象工厂 | 运行时动态加载产品族 |
| 需要运行时切换风格 | 抽象工厂 + 观察者模式 | 切换时重新创建所有组件 |

## 本章小结

本章深入剖析了抽象工厂模式：

1. **核心思想**：提供一个创建一系列相关或相互依赖对象的接口，无需指定具体类。产品族一致性由工厂天然保证。

2. **五类角色**：AbstractFactory、ConcreteFactory、AbstractProduct（多个）、ConcreteProduct（多个）、Client。

3. **完整实现**：以跨平台UI工具包为例，展示了Windows和Mac两个产品族下Button、TextField、CheckBox的完整创建过程，配合配置文件驱动和依赖注入实现工厂的动态选择。

4. **框架应用**：
   - JDK：`DocumentBuilderFactory`、`TransformerFactory`（XML解析器工厂系列）
   - JDBC：`Connection` 接口作为抽象工厂，创建 Statement、PreparedStatement 等
   - Spring：`BeanFactory` 体系，层层扩展的抽象工厂家族
   - SLF4J：`ILoggerFactory` 的绑定机制

5. **核心风险**：
   - 新增产品等级困难（最大缺点，违反开闭原则）
   - 类数量指数增长
   - 过度抽象的风险
   - 一致性可能被绕过

6. **优化策略**：接口隔离分解大工厂、混合工厂方法模式、依赖注入管理工厂选择、参数化工厂方法。

**核心认知**：抽象工厂模式擅长的是"横向扩展"（增加产品族），而不是"纵向扩展"（增加产品等级）。使用前务必确认产品等级结构是相对稳定的。如果产品等级频繁变化，应回归工厂方法模式或引入原型模式。

---

在下一章中，我们将学习建造者模式，它用于分步骤构建复杂的对象。
