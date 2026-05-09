# 第6章 建造者模式（Builder）

**建造者模式**将一个复杂对象的构建与它的表示分离，使得同样的构建过程可以创建不同的表示。

## 6.1 解决的问题与应用场景

### 6.1.1 问题分析

在软件系统中，某些对象的构建非常复杂：构造方法参数过多、参数之间有依赖关系、需要逐步构建对象的不同部分。

传统方式的问题：
```java
// 方式1： telescoping constructor（重叠构造器）
public class User {
    private String name;          // 必填
    private int age;              // 选填，默认0
    private String email;         // 选填
    private String phone;         // 选填
    private String address;       // 选填
    private String city;          // 选填
    private String country;       // 选填
    // ... 更多可选字段

    public User(String name) { this.name = name; }
    public User(String name, int age) { this.name = name; this.age = age; }
    public User(String name, int age, String email) { ... }
    public User(String name, int age, String email, String phone) { ... }
    // 构造器数量爆炸！
}
```

```java
// 方式2：JavaBeans模式
User user = new User();
user.setName("John");
user.setAge(30);
user.setEmail("john@example.com");
// 问题：对象状态在构建过程中不一致
// 问题：无法保证必填字段
```

### 6.1.2 典型应用场景

**1. 复杂对象构建**
```java
// 创建一台电脑
Computer computer = Computer.builder()
    .cpu("Intel i7")
    .ram("16GB")
    .storage("512GB SSD")
    .graphicsCard("NVIDIA RTX 3060")
    .build();
```

**2. SQL语句构建**
```java
String sql = new SQLQueryBuilder()
    .select("id", "name", "email")
    .from("users")
    .where("age > 18")
    .orderBy("name")
    .build();
```

**3. 文档生成**
```java
Document doc = Document.builder()
    .title("My Document")
    .author("John")
    .addSection("Introduction")
    .addSection("Content")
    .footer("Page 1")
    .build();
```

**4. HTTP请求构建**
```java
HttpRequest request = HttpRequest.builder()
    .url("https://api.example.com/users")
    .method("POST")
    .header("Content-Type", "application/json")
    .body(jsonBody)
    .timeout(5000)
    .build();
```

## 6.2 实现原理与UML

### 6.2.1 核心思想

建造者模式的核心是**将对象的构建过程分解为多个步骤**，通过链式调用逐步构建对象，最终调用build()方法生成完整对象。

### 6.2.2 UML类图

```
┌─────────────────────┐         ┌─────────────────────┐
│      Director       │         │      Builder        │
│  (指挥者)           │         │     (抽象建造者)     │
├─────────────────────┤         ├─────────────────────┤
│ - builder: Builder  │────────►│ + buildPartA()      │
├─────────────────────┤         │ + buildPartB()      │
│ + construct()       │         │ + getResult()       │
└─────────────────────┘         └─────────────────────┘
                                  ▲          ▲
                                  │          │
                    ┌─────────────┴───┐  ┌──┴─────────────┐
                    │ ConcreteBuilder1│  │ConcreteBuilder2│
                    │  (具体建造者)    │  │ (具体建造者)    │
                    ├─────────────────┤  ├────────────────┤
                    │ + buildPartA() │  │+ buildPartA()  │
                    │ + buildPartB() │  │+ buildPartB()  │
                    │ + getResult()  │  │+ getResult()   │
                    └────────────────┘  └────────────────┘
                                            │
                                            ▼
                                    ┌─────────────────┐
                                    │    Product      │
                                    │    (产品)       │
                                    └─────────────────┘
```

### 6.2.3 角色分析

- **Product（产品）**：要创建的复杂对象
- **Builder（抽象建造者）**：定义创建Product各个部件的接口
- **ConcreteBuilder（具体建造者）**：实现Builder接口，构造和装配产品的各个部件
- **Director（指挥者）**：构建一个使用Builder接口的对象，负责控制构建顺序

### 6.2.4 时序图

```
Client              Director          Builder          Product
   │                   │                 │                 │
   │                   │                 │                 │
   │  construct()      │                 │                 │
   │ ───────────────►  │                 │                 │
   │                   │                 │                 │
   │  builder.buildPartA()               │                 │
   │ ──────────────────────────────────► │                 │
   │                   │                 │                 │
   │                   │   buildPartA()  │                 │
   │                   │ ───────────────►│                 │
   │                   │                 │                 │
   │  builder.buildPartB()               │                 │
   │ ──────────────────────────────────► │                 │
   │                   │                 │                 │
   │                   │   buildPartB()  │                 │
   │                   │ ───────────────►│                 │
   │                   │                 │                 │
   │  builder.getResult()                │                 │
   │ ──────────────────────────────────► │                 │
   │                   │        product  │                 │
   │ ◄───────────────────────────────────│                 │
   │                   │                 │                 │
   │      product      │                 │                 │
   │ ◄──────────────── │                 │                 │
   │                   │                 │                 │
```

## 6.3 代码实现

### 6.3.1 经典实现（带Director）

**产品 - Computer**
```java
public class Computer {
    private String cpu;
    private String ram;
    private String storage;
    private String graphicsCard;
    private String monitor;
    private String keyboard;
    private String mouse;

    // 私有构造函数
    private Computer(Builder builder) {
        this.cpu = builder.cpu;
        this.ram = builder.ram;
        this.storage = builder.storage;
        this.graphicsCard = builder.graphicsCard;
        this.monitor = builder.monitor;
        this.keyboard = builder.keyboard;
        this.mouse = builder.mouse;
    }

    // getters
    public String getCpu() { return cpu; }
    public String getRam() { return ram; }
    public String getStorage() { return storage; }
    public String getGraphicsCard() { return graphicsCard; }
    public String getMonitor() { return monitor; }
    public String getKeyboard() { return keyboard; }
    public String getMouse() { return mouse; }

    @Override
    public String toString() {
        return "Computer{" +
            "cpu='" + cpu + '\'' +
            ", ram='" + ram + '\'' +
            ", storage='" + storage + '\'' +
            ", graphicsCard='" + graphicsCard + '\'' +
            ", monitor='" + monitor + '\'' +
            ", keyboard='" + keyboard + '\'' +
            ", mouse='" + mouse + '\'' +
            '}';
    }

    // 静态内部类 Builder
    public static class Builder {
        private String cpu;
        private String ram;
        private String storage;
        private String graphicsCard;
        private String monitor;
        private String keyboard;
        private String mouse;

        public Builder cpu(String cpu) {
            this.cpu = cpu;
            return this;
        }

        public Builder ram(String ram) {
            this.ram = ram;
            return this;
        }

        public Builder storage(String storage) {
            this.storage = storage;
            return this;
        }

        public Builder graphicsCard(String graphicsCard) {
            this.graphicsCard = graphicsCard;
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

        public Computer build() {
            return new Computer(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }
}
```

**抽象建造者**
```java
public interface ComputerBuilder {
    void buildCPU();
    void buildRAM();
    void buildStorage();
    void buildGraphicsCard();

    Computer getComputer();
}
```

**具体建造者**
```java
public class GamingComputerBuilder implements ComputerBuilder {
    private Computer computer;

    public GamingComputerBuilder() {
        computer = new Computer.Builder().build();
    }

    @Override
    public void buildCPU() {
        computer = Computer.builder()
            .cpu("Intel i9")
            .ram("64GB")
            .storage("2TB SSD")
            .graphicsCard("NVIDIA RTX 4090")
            .build();
    }

    @Override
    public void buildRAM() {
        // 已在buildCPU中完成
    }

    @Override
    public void buildStorage() {
        // 已在buildCPU中完成
    }

    @Override
    public void buildGraphicsCard() {
        // 已在buildCPU中完成
    }

    @Override
    public Computer getComputer() {
        return computer;
    }
}
```

**Director（指挥者）**
```java
public class ComputerDirector {
    public Computer construct(ComputerBuilder builder) {
        builder.buildCPU();
        builder.buildRAM();
        builder.buildStorage();
        builder.buildGraphicsCard();
        return builder.getComputer();
    }
}
```

**使用**
```java
public class Main {
    public static void main(String[] args) {
        // 方式1：直接使用Builder
        Computer computer = Computer.builder()
            .cpu("Intel i7")
            .ram("16GB")
            .storage("512GB SSD")
            .graphicsCard("NVIDIA RTX 3060")
            .build();

        System.out.println(computer);

        // 方式2：使用Director
        ComputerBuilder builder = new GamingComputerBuilder();
        ComputerDirector director = new ComputerDirector();
        Computer gamingPC = director.construct(builder);
        System.out.println(gamingPC);
    }
}
```

### 6.3.2 简化实现（静态内部类Builder）

这是最常用的方式，不需要Director：


```java
public class User {
    private final String name;      // 必填
    private final int age;          // 选填，默认0
    private final String email;     // 选填
    private final String phone;     // 选填
    private final String address;   // 选填

    private User(Builder builder) {
        this.name = builder.name;
        this.age = builder.age;
        this.email = builder.email;
        this.phone = builder.phone;
        this.address = builder.address;
    }

    // getters

    public static class Builder {
        private String name;
        private int age = 0;
        private String email;
        private String phone;
        private String address;

        public Builder(String name) {
            this.name = name;
        }

        public Builder age(int age) {
            this.age = age;
            return this;
        }

        public Builder email(String email) {
            this.email = email;
            return this;
        }

        public Builder phone(String phone) {
            this.phone = phone;
            return this;
        }

        public Builder address(String address) {
            this.address = address;
            return this;
        }

        public User build() {
            return new User(this);
        }
    }
}

// 使用
User user = new User.Builder("John")
    .age(30)
    .email("john@example.com")
    .build();
```

### 6.3.3 验证逻辑

可以在build()方法中添加验证：


```java
public User build() {
    if (name == null || name.isEmpty()) {
        throw new IllegalStateException("Name is required");
    }
    if (age < 0 || age > 150) {
        throw new IllegalStateException("Invalid age");
    }
    if (email != null && !email.contains("@")) {
        throw new IllegalStateException("Invalid email");
    }
    return new User(this);
}
```

### 6.3.4 多参数Builder（使用Lombok）

使用Lombok可以简化Builder的实现：


```java
@Builder
public class User {
    private String name;
    private int age;
    private String email;
    private String phone;
}

// Lombok自动生成：
// User.builder().name("John").age(30).build();
```

### 6.3.5 复杂验证场景

```java
public class Order {
    private final String orderId;
    private final List<OrderItem> items;
    private final BigDecimal totalAmount;
    private final String shippingAddress;
    private final PaymentMethod paymentMethod;

    private Order(Builder builder) {
        this.orderId = builder.orderId;
        this.items = builder.items;
        this.totalAmount = builder.totalAmount;
        this.shippingAddress = builder.shippingAddress;
        this.paymentMethod = builder.paymentMethod;
    }

    public static class Builder {
        private String orderId;
        private List<OrderItem> items = new ArrayList<>();
        private BigDecimal totalAmount;
        private String shippingAddress;
        private PaymentMethod paymentMethod;

        public Builder orderId(String orderId) {
            this.orderId = orderId;
            return this;
        }

        public Builder addItem(OrderItem item) {
            this.items.add(item);
            return this;
        }

        public Builder items(List<OrderItem> items) {
            this.items = items;
            return this;
        }

        public Builder shippingAddress(String address) {
            this.shippingAddress = address;
            return this;
        }

        public Builder paymentMethod(PaymentMethod method) {
            this.paymentMethod = method;
            return this;
        }

        public Order build() {
            // 验证逻辑
            if (items.isEmpty()) {
                throw new IllegalStateException("Order must have at least one item");
            }

            // 计算总金额
            this.totalAmount = items.stream()
                .map(OrderItem::getPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            if (shippingAddress == null || shippingAddress.isEmpty()) {
                throw new IllegalStateException("Shipping address is required");
            }

            if (paymentMethod == null) {
                throw new IllegalStateException("Payment method is required");
            }

            return new Order(this);
        }
    }
}
```

## 6.4 JDK/框架源码解析

### 6.4.1 StringBuilder

StringBuilder是建造者模式的典型应用：


```java
// StringBuilder 充当 Builder
StringBuilder sb = new StringBuilder();
sb.append("Hello")
  .append(" ")
  .append("World")
  .append("!");

String result = sb.toString();

// 实际上 StringBuilder 的 append() 方法返回 this
// 这就是链式调用的实现
```

### 6.4.2 StringBuffer

```java
// StringBuffer 是线程安全的 StringBuilder
StringBuffer sb = new StringBuffer();
sb.append("Hello")
  .append(" World");
```

### 6.4.3 Stream API中的Builder

```java
// Stream.Builder
Stream.Builder<String> builder = Stream.builder();
builder.add("a").add("b").add("c");
Stream<String> stream = builder.build();

// 使用 of 工厂方法
Stream<String> stream = Stream.of("a", "b", "c");
```

### 6.4.4 Spring中的Builder

**UriComponentsBuilder**
```java
UriComponents uri = UriComponentsBuilder.newInstance()
    .scheme("https")
    .host("api.example.com")
    .path("/users")
    .queryParam("page", 1)
    .queryParam("size", 10)
    .build()
    .toUriString();
```

**MockHttpServletRequestBuilder (Spring MVC Test)**
```java
MockHttpServletRequestBuilder request = MockMvcRequestBuilders
    .post("/api/users")
    .contentType(MediaType.APPLICATION_JSON)
    .content(jsonBody)
    .header("Authorization", "Bearer token");
```

### 6.4.5 OkHttp中的Request.Builder

```java
Request request = new Request.Builder()
    .url("https://api.example.com/users")
    .get()
    .addHeader("Authorization", "Bearer token")
    .build();
```

### 6.4.6 Lombok @Builder

```java
@Builder
public class User {
    private Long id;
    private String name;
    private String email;
    private int age;
}

// Lombok自动生成：
// User.builder().name("John").email("john@example.com").build();
```

### 6.4.7 Apache Commons Chain

```java
Command command = new Command.Builder()
    .add(new ValidateCommand())
    .add(new ProcessCommand())
    .add(new LogCommand())
    .build();
```

## 6.5 使用场景与案例

### 6.5.1 SQL查询构建器

```java
public class SQLQuery {
    private List<String> selectColumns = new ArrayList<>();
    private String tableName;
    private List<String> whereConditions = new ArrayList<>();
    private List<String> orderByColumns = new ArrayList<>();
    private Integer limit;
    private Integer offset;

    private SQLQuery(Builder builder) {
        this.selectColumns = builder.selectColumns;
        this.tableName = builder.tableName;
        this.whereConditions = builder.whereConditions;
        this.orderByColumns = builder.orderByColumns;
        this.limit = builder.limit;
        this.offset = builder.offset;
    }

    public String build() {
        StringBuilder sql = new StringBuilder("SELECT ");

        if (selectColumns.isEmpty()) {
            sql.append("*");
        } else {
            sql.append(String.join(", ", selectColumns));
        }

        sql.append(" FROM ").append(tableName);

        if (!whereConditions.isEmpty()) {
            sql.append(" WHERE ").append(String.join(" AND ", whereConditions));
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

    public static class Builder {
        private List<String> selectColumns = new ArrayList<>();
        private String tableName;
        private List<String> whereConditions = new ArrayList<>();
        private List<String> orderByColumns = new ArrayList<>();
        private Integer limit;
        private Integer offset;

        public Builder select(String... columns) {
            this.selectColumns.addAll(Arrays.asList(columns));
            return this;
        }

        public Builder from(String tableName) {
            this.tableName = tableName;
            return this;
        }

        public Builder where(String condition) {
            this.whereConditions.add(condition);
            return this;
        }

        public Builder orderBy(String... columns) {
            this.orderByColumns.addAll(Arrays.asList(columns));
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

        public SQLQuery build() {
            if (tableName == null || tableName.isEmpty()) {
                throw new IllegalStateException("Table name is required");
            }
            return new SQLQuery(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }
}

// 使用
String sql = SQLQuery.builder()
    .select("id", "name", "email")
    .from("users")
    .where("age > 18")
    .where("status = 'active'")
    .orderBy("name")
    .limit(10)
    .build()
    .build();

System.out.println(sql);
// SELECT id, name, email FROM users WHERE age > 18 AND status = 'active' ORDER BY name LIMIT 10
```

### 6.5.2 HTTP请求构建

```java
public class HttpRequest {
    private final String url;
    private final String method;
    private final Map<String, String> headers;
    private final String body;
    private final int timeout;

    private HttpRequest(Builder builder) {
        this.url = builder.url;
        this.method = builder.method;
        this.headers = builder.headers;
        this.body = builder.body;
        this.timeout = builder.timeout;
    }

    public static class Builder {
        private String url;
        private String method = "GET";
        private Map<String, String> headers = new HashMap<>();
        private String body;
        private int timeout = 30000;

        public Builder url(String url) {
            this.url = url;
            return this;
        }

        public Builder method(String method) {
            this.method = method;
            return this;
        }

        public Builder header(String key, String value) {
            this.headers.put(key, value);
            return this;
        }

        public Builder headers(Map<String, String> headers) {
            this.headers.putAll(headers);
            return this;
        }

        public Builder body(String body) {
            this.body = body;
            return this;
        }

        public Builder timeout(int timeout) {
            this.timeout = timeout;
            return this;
        }

        public HttpRequest build() {
            if (url == null || url.isEmpty()) {
                throw new IllegalStateException("URL is required");
            }
            return new HttpRequest(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }

    // getters
}

// 使用
HttpRequest request = HttpRequest.builder()
    .url("https://api.example.com/users")
    .method("POST")
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer token")
    .body("{\"name\":\"John\"}")
    .timeout(5000)
    .build();
```

### 6.5.3 文档构建

```java
public class Document {
    private final String title;
    private final String author;
    private final List<String> paragraphs;
    private final List<String> images;
    private final String footer;
    private final PageConfig pageConfig;

    private Document(Builder builder) {
        this.title = builder.title;
        this.author = builder.author;
        this.paragraphs = builder.paragraphs;
        this.images = builder.images;
        this.footer = builder.footer;
        this.pageConfig = builder.pageConfig;
    }

    public static class Builder {
        private String title;
        private String author;
        private List<String> paragraphs = new ArrayList<>();
        private List<String> images = new ArrayList<>();
        private String footer;
        private PageConfig pageConfig;

        public Builder title(String title) {
            this.title = title;
            return this;
        }

        public Builder author(String author) {
            this.author = author;
            return this;
        }

        public Builder addParagraph(String paragraph) {
            this.paragraphs.add(paragraph);
            return this;
        }

        public Builder addImage(String imagePath) {
            this.images.add(imagePath);
            return this;
        }

        public Builder footer(String footer) {
            this.footer = footer;
            return this;
        }

        public Builder pageConfig(PageConfig config) {
            this.pageConfig = config;
            return this;
        }

        public Document build() {
            if (title == null || title.isEmpty()) {
                throw new IllegalStateException("Title is required");
            }
            return new Document(this);
        }
    }

    public static Builder builder() {
        return new Builder();
    }
}

// 使用
Document doc = Document.builder()
    .title("My Report")
    .author("John Doe")
    .addParagraph("Introduction paragraph...")
    .addParagraph("Main content...")
    .addImage("/images/chart1.png")
    .footer("Page 1 of 10")
    .build();
```

## 6.6 潜在风险与问题

### 6.6.1 代码膨胀

每个产品类都需要一个对应的Builder，代码量会增加。

**解决方案**：
- 使用Lombok自动生成
- 共用Builder（泛型）

### 6.6.2 不适合变化频繁的产品

如果产品的属性经常变化，Builder也需要频繁修改。

**解决方案**：
- 考虑使用其他模式（Prototype等）
- 使用Map或其他动态结构

### 6.6.3 无法保证对象不变性

Builder创建的产品对象本身可能是可变的。

**解决方案**：
- 产品类的setter方法设为private或删除
- 使用final字段
- 在build()时创建新的不可变对象

### 6.6.4 与工厂模式的区别

| 特征 | 工厂模式 | 建造者模式 |
|------|----------|------------|
| 目的 | 创建不同类的对象 | 构建复杂对象 |
| 参数 | 通常无或少量参数 | 大量可选参数 |
| 构建过程 | 一步完成 | 多步构建 |
| 产品复杂度 | 相对简单 | 复杂对象 |

## 6.7 优化策略

### 6.7.1 使用泛型Builder

```java
public class GenericBuilder<T> {
    private final Supplier<T> constructor;

    private GenericBuilder(Supplier<T> constructor) {
        this.constructor = constructor;
    }

    public static <T> GenericBuilder<T> of(Supplier<T> constructor) {
        return new GenericBuilder<>(constructor);
    }

    // 使用反射或其他方式设置属性
    public <V> GenericBuilder<T> with(Field field, V value) {
        // 设置属性
    }
}
```

### 6.7.2 链式验证

```java
public class Builder {
    private String name;

    public Builder name(String name) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("Name cannot be empty");
        }
        this.name = name;
        return this;
    }
}
```

### 6.7.3 默认值与可选

```java
public class Builder {
    private int age = 0;
    private String country = "US";

    public Builder age(int age) {
        this.age = age;
        return this;
    }

    // 不调用则使用默认值
}
```

### 6.7.4 最佳实践总结

| 场景 | 建议 |
|------|------|
| 3个以上可选参数 | 使用Builder |
| 参数有依赖或验证 | 使用Builder |
| 需要不可变对象 | 使用Builder |
| 简单对象 | 直接构造函数 |
| 参数少且固定 | 构造函数 |

## 本章小结

本章详细介绍了建造者模式：

1. **解决的问题**：复杂对象的构建过程复杂、参数过多、需要验证
2. **UML结构**：产品、抽象建造者、具体建造者、指挥者
3. **实现方式**：经典模式、静态内部类Builder、Lombok
4. **框架应用**：StringBuilder、Spring UriComponentsBuilder、OkHttp Request.Builder
5. **潜在问题**：代码膨胀、变化频繁时维护困难
6. **优化策略**：链式验证、泛型Builder、Lombok

**建造者模式特别适合需要构建复杂对象且对象属性需要验证的场景**，链式调用使代码更清晰易读。

---
在下一章中，我们将学习原型模式，它通过复制现有对象来创建新对象。