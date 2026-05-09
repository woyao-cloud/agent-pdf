# 第5章 抽象工厂模式（Abstract Factory）

**抽象工厂模式**是工厂方法模式的升级版本，它提供了一种创建一系列相关或相互依赖对象的接口，而无需指定它们具体的类。

## 5.1 解决的问题与应用场景

### 5.1.1 问题分析

工厂方法模式每次只能创建一种产品，但在实际开发中，经常需要创建一系列相关的产品：

- 制造一台电脑需要CPU、主板、内存等多个组件
- 不同品牌的组件需要相互兼容
- 切换品牌时需要一起切换所有组件

如果使用工厂方法模式：
```java
// 需要分别创建每种产品
CPU cpu = CPUFactory.createCPU("Intel");
Motherboard motherboard = MotherboardFactory.createMotherboard("ASUS");
Memory memory = MemoryFactory.createMemory("Kingston");
```

问题：
- 客户端需要知道所有的工厂类
- 组件之间可能不兼容
- 切换品牌时需要修改多处代码

### 5.1.2 典型应用场景

**1. 跨平台UI组件**
```java
// Windows风格按钮和文本框
Button button = UIFactory.createButton();  // WindowsButton
TextField textField = UIFactory.createTextField();  // WindowsTextField

// macOS风格
Button button = UIFactory.createButton();  // MacButton
TextField textField = UIFactory.createTextField();  // MacTextField
```

**2. 游戏角色装备**
```java
// 战士装备
Equipment equipment = EquipmentFactory.createEquipment("warrior");
// 返回： warriorSword, warriorArmor, warriorShield

// 法师装备
Equipment equipment = EquipmentFactory.createEquipment("mage");
// 返回： mageStaff, mageRobe, mageAmulet
```

**3. 数据库访问**
```java
// MySQL数据库连接
Connection conn = DBFactory.createConnection();  // MySQLConnection
Statement stmt = DBFactory.createStatement();    // MySQLStatement

// Oracle数据库连接
Connection conn = DBFactory.createConnection();  // OracleConnection
Statement stmt = DBFactory.createStatement();    // OracleStatement
```

**4. 国际化**
```java
// 中文资源
MessageFormatter formatter = MessageFactory.createFormatter("zh");
// 返回中文日期、数字、货币格式

// 英文资源
MessageFormatter formatter = MessageFactory.createFormatter("en");
// 返回英文日期、数字、货币格式
```

## 5.2 实现原理与UML

### 5.2.1 核心思想

抽象工厂模式提供一个**抽象工厂接口**，用于创建一系列相关的产品对象。客户端只需要与抽象工厂交互，无需关心具体的产品实现。

### 5.2.2 UML类图

```
┌─────────────────────┐
│  AbstractFactory    │  ← 抽象工厂接口
├─────────────────────┤
│ + createProductA()  │
│ + createProductB()  │
└─────────────────────┘
          ▲
          │
┌─────────┴─────────┐
│                   │
┌─────────────────────┐  ┌─────────────────────┐
│ ConcreteFactory1   │  │ ConcreteFactory2   │
├─────────────────────┤  ├─────────────────────┤
│ + createProductA() │  │ + createProductA() │
│ + createProductB() │  │ + createProductB() │
└─────────────────────┘  └─────────────────────┘
          │                      │
          │                      │
┌─────────┴───────┐      ┌───────┴─────────┐
│                 │      │                 │
│   ProductA1     │      │   ProductA2     │
│   ProductB1     │      │   ProductB2     │
└─────────────────┘      └─────────────────┘


┌─────────────────────┐
│    AbstractProductA │
├─────────────────────┤
│ + operation()       │
└─────────────────────┘
          ▲
          │
┌─────────┴─────────┐
│                   │
│  ProductA1        │  ProductA2
│  (具体产品A1)      │  (具体产品A2)
└───────────────────┘
```

### 5.2.3 角色分析

- **AbstractFactory（抽象工厂）**：声明创建一系列抽象产品的方法
- **ConcreteFactory（具体工厂）**：实现创建具体产品对象的操作
- **AbstractProduct（抽象产品）**：为每种产品声明接口
- **ConcreteProduct（具体产品）**：定义具体工厂创建的产品对象
- **Client（客户端）**：使用抽象工厂和抽象产品接口

### 5.2.4 时序图

```
Client              AbstractFactory         ConcreteFactory          ProductA
   │                      │                        │                     │
   │  createProductA()    │                        │                     │
   │ ──────────────────── │ ─────────────────────►│                     │
   │                      │                        │                     │
   │                      │        (创建ProductA1)│                     │
   │                      │                        │───────────────────► │
   │                      │                        │                     │
   │                      │        productA        │                     │
   │ ◄────────────────────│◄───────────────────────│                     │
   │                      │                        │                     │
   │  productA.operation()│                        │                     │
   │ ─────────────────────────────────────────────────────────────────► │
   │                      │                        │                     │
```

## 5.3 代码实现

### 5.3.1 基础实现

**抽象产品A - 按钮**
```java
public interface Button {
    void render();
    void onClick(Runnable handler);
}
```

**抽象产品B - 输入框**
```java
public interface TextField {
    void render();
    String getText();
    void setText(String text);
}
```

**具体产品 - Windows风格**
```java
public class WindowsButton implements Button {
    @Override
    public void render() {
        System..out.println("Rendering Windows button");
    }

    @Override
    public void onClick(Runnable handler) {
        System.out.println("Windows button clicked");
        handler.run();
    }
}

public class WindowsTextField implements TextField {
    private String text;

    @Override
    public void render() {
        System.out.println("Rendering Windows text field");
    }

    @Override
    public String getText() {
        return text;
    }

    @Override
    public void setText(String text) {
        this.text = text;
    }
}
```

**具体产品 - macOS风格**
```java
public class MacButton implements Button {
    @Override
    public void render() {
        System.out.println("Rendering Mac button");
    }

    @Override
    public void onClick(Runnable handler) {
        System.out.println("Mac button clicked");
        handler.run();
    }
}

public class MacTextField implements TextField {
    private String text;

    @Override
    public void render() {
        System.out.println("Rendering Mac text field");
    }

    @Override
    public String getText() {
        return text;
    }

    @Override
    public void setText(String text) {
        this.text = text;
    }
}
```

**抽象工厂**
```java
public interface UIFactory {
    Button createButton();
    TextField createTextField();
}
```

**具体工厂 - Windows**
```java
public class WindowsUIFactory implements UIFactory {
    @Override
    public Button createButton() {
        return new WindowsButton();
    }

    @Override
    public TextField createTextField() {
        return new WindowsTextField();
    }
}
```

**具体工厂 - macOS**
```java
public class MacUIFactory implements UIFactory {
    @Override
    public Button createButton() {
        return new MacButton();
    }

    @Override
    public TextField createTextField() {
        return new MacTextField();
    }
}
```

**客户端代码**
```java
public class Application {
    private Button button;
    private TextField textField;

    public Application(UIFactory factory) {
        this.button = factory.createButton();
        this.textField = factory.createTextField();
    }

    public void render() {
        button.render();
        textField.render();
    }
}

// 使用
public class Main {
    public static void main(String[] args) {
        // 根据配置创建工厂
        String os = System.getProperty("os.name");
        UIFactory factory;
        if (os.contains("Mac")) {
            factory = new MacUIFactory();
        } else {
            factory = new WindowsUIFactory();
        }

        Application app = new Application(factory);
        app.render();
    }
}
```

### 5.3.2 扩展：产品族

假设我们需要支持更多UI组件，可以扩展抽象工厂：

```java
// 新增抽象产品 - 下拉框
public interface ComboBox {
    void render();
    void addItem(String item);
    String getSelectedItem();
}

// 新增抽象产品 - 菜单
public interface Menu {
    void render();
    void addMenuItem(String item);
}

// 扩展抽象工厂
public interface UIFactory extends ComponentFactory {
    Button createButton();
    TextField createTextField();
    ComboBox createComboBox();
    Menu createMenu();
}
```

### 5.3.3 使用反射实现抽象工厂

为了减少具体工厂类的数量，可以使用反射：

```java
public class ReflectiveUIFactory implements UIFactory {
    private static final String PACKAGE = "com.example.ui.";

    @Override
    public Button createButton() {
        return createComponent("Button");
    }

    @Override
    public TextField createTextField() {
        return createComponent("TextField");
    }

    @SuppressWarnings("unchecked")
    private <T> T createComponent(String suffix) {
        String os = System.getProperty("os.name", "");
        String className;
        if (os.contains("Mac")) {
            className = PACKAGE + "mac" + suffix;
        } else {
            className = PACKAGE + "windows" + suffix;
        }

        try {
            return (T) Class.forName(className).getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException("Failed to create component: " + className, e);
        }
    }
}
```

### 5.3.4 使用配置文件

```java
// config.properties
ui.factory=com.example.MacUIFactory

// 工厂加载器
public class FactoryLoader {
    private static UIFactory factory;

    public static UIFactory loadFactory() {
        if (factory == null) {
            Properties config = new Properties();
            try (InputStream is = FactoryLoader.class.getClassLoader()
                    .getResourceAsStream("config.properties")) {
                config.load(is);
                String className = config.getProperty("ui.factory");
                factory = (UIFactory) Class.forName(className)
                    .getDeclaredConstructor().newInstance();
            } catch (Exception e) {
                throw new RuntimeException("Failed to load factory", e);
            }
        }
        return factory;
    }
}
```

## 5.4 JDK/框架源码解析

### 5.4.1 JDBC中的抽象工厂

JDBC是抽象工厂模式的经典应用：

**抽象工厂接口**
```java
public interface Connection {
    Statement createStatement();
    PreparedStatement prepareStatement(String sql);
    CallableStatement prepareCall(String sql);
    // ...
}
```

**具体工厂**
- MySQL实现：`com.mysql.cj.jdbc.ConnectionImpl`
- PostgreSQL实现：`org.postgresql.jdbc1.Jdbc1Connection`
- Oracle实现：`oracle.jdbc.OracleConnection`

**抽象产品**
```java
public interface Statement {
    ResultSet executeQuery(String sql);
    int executeUpdate(String sql);
    // ...
}
```

客户端代码：
```java
// 加载驱动
Class.forName("com.mysql.cj.jdbc.Driver");

// 通过抽象工厂创建连接
Connection conn = DriverManager.getConnection(url, user, password);

// 使用抽象产品
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT * FROM users");
```

### 5.4.2 XML解析器工厂

```java
// 抽象工厂
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();

// 具体工厂实现（由系统属性或配置文件决定）
// com.sun.org.apache.xerces.internal.jaxp.DocumentBuilderFactoryImpl

DocumentBuilder builder = factory.newDocumentBuilder();
Document doc = builder.parse(new File("config.xml"));
```

类似的：
- `SAXParserFactory`
- `TransformerFactory`
- `XMLInputFactory`

### 5.4.3 Spring中的抽象工厂

**BeanDefinitionRegistry**
```java
// 抽象工厂接口
public interface BeanDefinitionRegistry extends AliasRegistry {
    void registerBeanDefinition(String beanName, BeanDefinition beanDefinition);
    // ...
}

// 具体工厂
// DefaultListableBeanFactory 实现了 BeanDefinitionRegistry
```

**PropertyEditorRegistry**
```java
// 用于注册属性编辑器
public interface PropertyEditorRegistry {
    void registerCustomEditor(Class<?> requiredType, PropertyEditor propertyEditor);
}
```

### 5.4.4 SLF4J日志工厂

```java
// 抽象工厂
public static LoggerFactory getILoggerFactory() {
    // 根据配置返回不同的LoggerFactory实现
    // - NOPLoggerFactory
    // - SimpleLoggerFactory
    // - Log4jLoggerFactory
    // - LogbackLoggerFactory
}
```

## 5.5 使用场景与案例

### 5.5.1 跨平台数据库访问

```java
// 抽象产品
public interface Connection {
    void connect();
    Statement createStatement();
}

public interface Statement {
    ResultSet executeQuery(String sql);
    void execute(String sql);
}

// 抽象工厂
public interface DatabaseFactory {
    Connection createConnection();
    Statement createStatement();
}

// MySQL工厂
public class MySQLFactory implements DatabaseFactory {
    @Override
    public Connection createConnection() {
        return new MySQLConnection();
    }

    @Override
    public Statement createStatement() {
        return new MySQLStatement();
    }
}

// Oracle工厂
public class OracleFactory implements DatabaseFactory {
    @Override
    public Connection createConnection() {
        return new OracleConnection();
    }

    @Override
    public Statement createStatement() {
        return new OracleStatement();
    }
}

// 客户端
public class DatabaseClient {
    private Connection connection;
    private Statement statement;

    public DatabaseClient(DatabaseFactory factory) {
        this.connection = factory.createConnection();
        this.statement = factory.createStatement();
    }

    public void query(String sql) {
        connection.connect();
        ResultSet rs = statement.executeQuery(sql);
        // 处理结果
    }
}
```

### 5.5.2 游戏皮肤系统

```java
// 抽象产品
public interface ButtonSkin {
    void render(Button button);
}

public interface PanelSkin {
    void render(Panel panel);
}

public interface TextSkin {
    void render(Text text);
}

// 抽象工厂
public interface SkinFactory {
    ButtonSkin createButtonSkin();
    PanelSkin createPanelSkin();
    TextSkin createTextSkin();
}

// 红色主题工厂
public class RedSkinFactory implements SkinFactory {
    @Override
    public ButtonSkin createButtonSkin() {
        return new RedButtonSkin();
    }

    @Override
    public PanelSkin createPanelSkin() {
        return new RedPanelSkin();
    }

    @Override
    public TextSkin createTextSkin() {
        return new RedTextSkin();
    }
}

// 蓝色主题工厂
public class BlueSkinFactory implements SkinFactory {
    @Override
    public ButtonSkin createButtonSkin() {
        return new BlueButtonSkin();
    }

    @Override
    public PanelSkin createPanelSkin() {
        return new BluePanelSkin();
    }

    @Override
    public TextSkin createTextSkin() {
        return new BlueTextSkin();
    }
}

// UI组件
public class Button {
    private ButtonSkin skin;

    public void setSkin(ButtonSkin skin) {
        this.skin = skin;
    }

    public void render() {
        skin.render(this);
    }
}
```

### 5.5.3 国际化消息格式化

```java
// 抽象产品
public interface DateFormatter {
    String formatDate(Date date);
}

public interface NumberFormatter {
    String formatNumber(double number);
}

public interface CurrencyFormatter {
    String formatCurrency(double amount);
}

// 抽象工厂
public interface MessageFormatterFactory {
    DateFormatter createDateFormatter();
    NumberFormatter createNumberFormatter();
    CurrencyFormatter createCurrencyFormatter();
}

// 中文工厂
public class ChineseFormatterFactory implements MessageFormatterFactory {
    @Override
    public DateFormatter createDateFormatter() {
        return new ChineseDateFormatter();  // yyyy年MM月dd日
    }

    @Override
    public NumberFormatter createNumberFormatter() {
        return new ChineseNumberFormatter();  // 中文数字
    }

    @Override
    public CurrencyFormatter createCurrencyFormatter() {
        return new ChineseCurrencyFormatter();  // ¥符号
    }
}

// 英文工厂
public class EnglishFormatterFactory implements MessageFormatterFactory {
    @Override
    public DateFormatter createDateFormatter() {
        return new EnglishDateFormatter();  // MM/dd/yyyy
    }

    @Override
    public NumberFormatter createNumberFormatter() {
        return new EnglishNumberFormatter();  // 1,234.56
    }

    @Override
    public CurrencyFormatter createCurrencyFormatter() {
        return new EnglishCurrencyFormatter();  // $符号
    }
}
```

## 5.6 潜在风险与问题

### 5.6.1 产品族扩展困难

增加新的产品等级（如增加单选按钮）需要：
1. 修改抽象工厂接口
2. 修改所有具体工厂类

这违反了开闭原则。

**解决方案**：
- 使用接口分解（每个产品单独接口）
- 使用工厂方法模式代替

### 5.6.2 具体产品的一致性

抽象工厂确保同一工厂创建的产品是配套的，但客户端可能绕过工厂直接创建：

```java
// 错误：绕过了工厂
UIFactory factory = new WindowsUIFactory();
Button button = factory.createButton();
TextField textField = new MacTextField();  // 不一致！
```

**解决方案**：
- 将具体产品类设为包级私有
- 使用依赖注入

### 5.6.3 类数量爆炸

每增加一个产品等级，需要增加一个具体工厂。多个产品等级会导致类数量快速增加。

**解决方案**：
- 使用反射 + 配置文件
- 使用简单工厂代替

### 5.6.4 过度抽象

对于简单场景，使用抽象工厂会引入不必要的复杂性。

**解决方案**：
- 评估产品等级是否经常变化
- 简单场景使用工厂方法或直接new

### 5.6.5 运行时切换产品族

运行时切换可能需要重新创建对象：

```java
// 运行时切换工厂
public void changeTheme(String theme) {
    if ("dark".equals(theme)) {
        factory = new DarkThemeFactory();
    } else {
        factory = new LightThemeFactory();
    }
    // 需要重新创建所有已存在的组件
    button = factory.createButton();
}
```

## 5.7 优化策略

### 5.7.1 使用接口分解

将工厂方法分解为更小的接口：

```java
// 每个产品独立接口
public interface ButtonFactory {
    Button createButton();
}

public interface TextFieldFactory {
    TextField createTextField();
}

// 组合工厂
public interface UIFactory extends ButtonFactory, TextFieldFactory {
}
```

这样可以独立使用单个工厂。

### 5.7.2 使用抽象方法 vs 接口

在Java 8之前，使用抽象类作为抽象工厂：

```java
public abstract class AbstractFactory {
    public abstract Button createButton();
    public abstract TextField createTextField();
}
```

Java 8后，可以使用接口（支持默认方法）：

```java
public interface UIFactory {
    default void init() {
        // 初始化逻辑
    }

    Button createButton();
    TextField createTextField();
}
```

### 5.7.3 使用依赖注入

将工厂交给容器管理：

```java
@Configuration
public class AppConfig {
    @Bean
    public UIFactory uiFactory() {
        // 根据环境决定
        if (isMac()) {
            return new MacUIFactory();
        }
        return new WindowsUIFactory();
    }

    @Bean
    public Application application(UIFactory uiFactory) {
        return new Application(uiFactory);
    }
}
```

### 5.7.4 最佳实践总结

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 产品族少且固定 | 抽象工厂模式 | 结构清晰 |
| 产品等级经常变化 | 工厂方法模式 | 扩展容易 |
| 需要动态配置 | 反射 + 配置 | 解耦 |
| 简单场景 | 简单工厂 | 减少类数量 |

## 本章小结

本章详细介绍了抽象工厂模式：

1. **解决的问题**：创建一系列相关产品，确保产品兼容性
2. **UML结构**：抽象工厂、具体工厂、抽象产品、具体产品
3. **实现方式**：基础实现、反射实现、配置文件
4. **框架应用**：JDBC、XML解析器工厂、Spring、SLF4J
5. **潜在问题**：扩展困难、一致性难以保证、类数量爆炸
6. **优化策略**：接口分解、依赖注入、反射配置

**抽象工厂适用于产品族概念明确的场景**，需要确保同一工厂创建的产品相互兼容。

---
在下一章中，我们将学习建造者模式，它用于构建复杂对象。