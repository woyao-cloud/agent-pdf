# 第7章 原型模式（Prototype）

**原型模式**（Prototype Pattern）通过复制（克隆）现有对象来创建新对象，而不是通过 `new` 关键字实例化。这种模式使得创建对象的过程与具体的产品类解耦，并且可以显著降低对象创建的代价。

## 7.1 解决的问题与应用场景

### 7.1.1 问题分析

在某些场景下，创建一个对象的过程代价高昂，具体表现为：

1. **昂贵的初始化过程**：对象需要从数据库加载大量数据、进行复杂的网络请求、执行耗时的计算
2. **复杂的依赖注入**：对象依赖多个子对象，直接实例化需要复杂的组装流程
3. **重复的相似对象**：需要创建大量"大部分相同、只有少量差异"的对象
4. **动态类型创建**：在运行时才能确定要创建的具体类型，无法在编译期硬编码 `new`

如果每次都从头创建，会导致：

- **性能问题**：重复的数据库查询、网络请求、复杂计算
- **资源浪费**：重复加载相同的数据到内存
- **代码耦合**：客户端需要知道具体类的创建细节

**传统创建 vs 原型克隆：**

```java
// 传统方式：每次从数据库加载
public User loadUser(Long id) {
    // 步骤1：数据库查询（耗时 50ms）
    ResultSet rs = db.execute("SELECT * FROM users WHERE id = ?", id);
    // 步骤2：映射结果集（需遍历所有字段）
    User user = mapResultSetToUser(rs);
    // 步骤3：加载关联数据（额外查询）
    user.setPermissions(loadPermissions(user.getId()));
    return user;
}

// 原型模式：克隆已有对象
User template = userCache.get("template");
User newUser = template.clone();
newUser.setId(generateId());       // 只需修改差异字段
newUser.setName("新用户");
// 避免了数据库查询和关联数据加载
```

### 7.1.2 典型应用场景

**1. 复杂对象缓存与复用**

```java
// 从数据库加载一份"默认配置"作为原型
AppConfig prototype = configRepository.findDefault();
// 为不同租户克隆配置并微调
AppConfig tenant1Config = prototype.clone();
tenant1Config.setTenantId("T001");
tenant1Config.setMaxUsers(500);

AppConfig tenant2Config = prototype.clone();
tenant2Config.setTenantId("T002");
tenant2Config.setMaxUsers(1000);
```

**2. 文档模板系统**

```java
// 创建一份简历模板
Resume template = Resume.createDefaultTemplate();
// 为每个求职者克隆模板并填上个人信息
Resume resume1 = template.clone();
resume1.setPersonalInfo("张三", "zhangsan@example.com");
Resume resume2 = template.clone();
resume2.setPersonalInfo("李四", "lisi@example.com");
```

**3. 游戏实体批量生成**

```java
// 创建一个"哥布林"原型
Monster goblinProto = Monster.createGoblin();
// 批量生成哥布林军团（每个都从原型克隆，避免重复初始化）
List<Monster> goblinArmy = new ArrayList<>();
for (int i = 0; i < 50; i++) {
    Monster goblin = goblinProto.clone();
    goblin.setPosition(randomX(), randomY());
    goblinArmy.add(goblin);
}
```

**4. 图形编辑器中的复制粘贴**

```java
// 画了一个复杂图形，Ctrl+C / Ctrl+V 就是原型模式
Shape selectedShape = editor.getSelectedShape();
Shape duplicated = selectedShape.clone();
duplicated.move(offsetX, offsetY);
editor.addShape(duplicated);
```

## 7.2 实现原理与UML

### 7.2.1 核心思想

原型模式的核心是**通过复制现有对象来创建新对象**。它不依赖类构造器，而是使用**原型实例指定创建对象的种类**，然后通过复制这个原型来创建新的对象。

Java 中实现原型模式的基础机制：
- `java.lang.Object.clone()` 是 Java 内置的克隆方法
- `java.lang.Cloneable` 是一个标记接口，用于声明该类支持克隆
- `Object.clone()` 默认为**浅拷贝**（shallow copy）

### 7.2.2 UML 类图

```
┌─────────────────────────────┐
│          Client             │
│        （客户端）            │
├─────────────────────────────┤
│ + operation(): void         │
└──────────────┬──────────────┘
               │ 使用
               ▼
┌─────────────────────────────────────┐
│        Prototype                    │
│      （抽象原型）                    │
├─────────────────────────────────────┤
│ + clone(): Prototype                │
└─────────────────────────────────────┘
               ▲
               │ 实现
    ┌──────────┼──────────┐
    │          │          │
┌───┴──────────┴───┐  ┌──┴──────────────┐
│ConcretePrototypeA│  │ConcretePrototypeB│
│   （具体原型A）    │  │   （具体原型B）    │
├──────────────────┤  ├──────────────────┤
│ - fieldA: String │  │ - fieldX: int    │
│ - fieldB: int    │  │ - fieldY: String │
├──────────────────┤  ├──────────────────┤
│ + clone(): Prototype│ + clone(): Prototype│
│ + operation(): void │ + operation(): void│
└──────────────────┘  └──────────────────┘
```

### 7.2.3 角色分析

| 角色 | 说明 | 职责 |
|------|------|------|
| **Prototype**（抽象原型） | 声明克隆方法的接口或抽象类 | 定义 `clone()` 方法的契约，通常为一个返回自身类型的接口 |
| **ConcretePrototype**（具体原型） | 实现克隆操作的具体类 | 实现 `clone()` 方法，负责正确复制自身的所有字段 |
| **Client**（客户端） | 使用原型的代码 | 通过调用原型的 `clone()` 方法获取新对象，无需知道具体类的构造过程 |

### 7.2.4 浅拷贝与深拷贝的本质区别

在深入代码之前，先理解浅拷贝和深拷贝的区别至关重要：

```
浅拷贝 (Shallow Copy)
  original ────────► [name: "John"]
                     [address: 0x1000] ──────► [city: "Beijing"]
                         |
  clone    ────────► [name: "John"]    (String 不可变，安全)
                     [address: 0x1000] ──────► 与 original 共享同一个 Address 对象！
                         |
                         修改 clone 的 address 会影响 original！

深拷贝 (Deep Copy)
  original ────────► [name: "John"]
                     [address: 0x1000] ──────► [city: "Beijing"]

  clone    ────────► [name: "John"]
                     [address: 0x2000] ──────► [city: "Beijing"]  (独立的副本)
                         |
                         clone 拥有完全独立的 Address，互不影响
```

**关键判断标准**：
- 浅拷贝：`original.internalObj == clone.internalObj` 为 `true`
- 深拷贝：`original.internalObj == clone.internalObj` 为 `false`，且两者的内容相同

### 7.2.5 时序图

```
Client                  PrototypeManager          ConcretePrototype
  │                            │                          │
  │  get("key")                │                          │
  │ ─────────────────────────►│                          │
  │                            │                          │
  │   返回原型引用              │                          │
  │ ◄─────────────────────────│                          │
  │                            │                          │
  │  clone()                   │                          │
  │ ────────────────────────────────────────────────────►│
  │                            │                          │
  │                            │  1. super.clone()        │
  │                            │     (创建新对象+复制基础类型)
  │                            │                          │
  │                            │  2. 深拷贝可变子对象       │
  │                            │     (创建独立副本)         │
  │                            │                          │
  │      克隆后的对象           │                          │
  │ ◄────────────────────────────────────────────────────│
  │                            │                          │
```

## 7.3 代码实现（浅拷贝 / 深拷贝）

### 7.3.1 浅拷贝 -- 基于 Cloneable 接口

```java
/**
 * 浅拷贝示例：只复制基本类型和不可变对象，可变对象共享引用
 */
public class ShallowUser implements Cloneable {
    private String name;             // String 是不可变对象，浅拷贝安全
    private int age;                 // 基本类型，浅拷贝安全
    private List<String> hobbies;    // List 是可变对象，浅拷贝不安全！
    private Address address;         // 自定义对象，浅拷贝不安全！

    public ShallowUser(String name, int age) {
        this.name = name;
        this.age = age;
        this.hobbies = new ArrayList<>();
        this.address = new Address("未设置", "未设置");
    }

    public void addHobby(String hobby) {
        this.hobbies.add(hobby);
    }

    public void setAddress(Address address) {
        this.address = address;
    }

    public List<String> getHobbies() {
        return hobbies;
    }

    public Address getAddress() {
        return address;
    }

    @Override
    public ShallowUser clone() {
        try {
            // super.clone() 只做逐字段的浅复制
            // 基本类型和引用地址被原样复制
            return (ShallowUser) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new AssertionError("Cloneable 实现不可能抛出此异常", e);
        }
    }

    // 演示浅拷贝的问题
    public static void main(String[] args) {
        ShallowUser original = new ShallowUser("张三", 30);
        original.addHobby("读书");
        original.addHobby("游泳");
        original.setAddress(new Address("北京", "朝阳区"));

        ShallowUser cloned = original.clone();

        // === 修改克隆对象的可变字段 ===
        cloned.addHobby("编程");                         // 修改 List
        cloned.getAddress().setCity("上海");             // 修改 Address 内部字段

        // === 问题出现了！===
        System.out.println("Original hobbies: " + original.getHobbies());
        // 输出: [读书, 游泳, 编程]  -- 原始对象的 hobbies 也被污染了！
        System.out.println("Cloned hobbies:   " + cloned.getHobbies());
        // 输出: [读书, 游泳, 编程]

        System.out.println("Original address: " + original.getAddress().getCity());
        // 输出: 上海  -- 原始对象的地址也被改了！
        System.out.println("Cloned address:   " + cloned.getAddress().getCity());
        // 输出: 上海

        // 关键验证：两者引用同一个对象
        System.out.println("hobbies 是否同一个引用? " + (original.getHobbies() == cloned.getHobbies()));
        // true -- 浅拷贝的陷阱
        System.out.println("address 是否同一个引用? " + (original.getAddress() == cloned.getAddress()));
        // true -- 浅拷贝的陷阱
    }
}
```

### 7.3.2 深拷贝 -- 手动重写 clone() 方法

```java
/**
 * 深拷贝示例：手动递归克隆每个可变子对象
 */
public class DeepUser implements Cloneable {
    private String name;
    private int age;
    private List<String> hobbies;
    private Address address;

    public DeepUser(String name, int age) {
        this.name = name;
        this.age = age;
        this.hobbies = new ArrayList<>();
        this.address = new Address("未设置", "未设置");
    }

    public void addHobby(String hobby) {
        this.hobbies.add(hobby);
    }

    public void setAddress(Address address) {
        this.address = address;
    }

    public List<String> getHobbies() {
        return hobbies;
    }

    public Address getAddress() {
        return address;
    }

    @Override
    public DeepUser clone() {
        try {
            // 步骤1：执行浅拷贝（复制基本类型和 String）
            DeepUser cloned = (DeepUser) super.clone();

            // 步骤2：深拷贝可变对象
            // List 需要创建新的 ArrayList 实例
            cloned.hobbies = new ArrayList<>(this.hobbies);

            // Address 需要递归克隆
            cloned.address = this.address.clone();

            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError("Cloneable 实现不可能抛出此异常", e);
        }
    }

    public static void main(String[] args) {
        DeepUser original = new DeepUser("张三", 30);
        original.addHobby("读书");
        original.addHobby("游泳");
        original.setAddress(new Address("北京", "朝阳区"));

        DeepUser cloned = original.clone();

        // === 修改克隆对象的可变字段 ===
        cloned.addHobby("编程");
        cloned.getAddress().setCity("上海");

        // === 两个对象完全独立 ===
        System.out.println("Original hobbies: " + original.getHobbies());
        // 输出: [读书, 游泳]  -- 未被污染！
        System.out.println("Cloned hobbies:   " + cloned.getHobbies());
        // 输出: [读书, 游泳, 编程]

        System.out.println("Original address: " + original.getAddress().getCity());
        // 输出: 北京  -- 未被修改！
        System.out.println("Cloned address:   " + cloned.getAddress().getCity());
        // 输出: 上海

        // 关键验证：两个引用指向不同对象
        System.out.println("hobbies 是否同一个引用? " + (original.getHobbies() == cloned.getHobbies()));
        // false -- 深拷贝成功
        System.out.println("address 是否同一个引用? " + (original.getAddress() == cloned.getAddress()));
        // false -- 深拷贝成功
    }
}
```

```java
/**
 * 可克隆的 Address 类
 */
public class Address implements Cloneable {
    private String city;
    private String district;
    private String street;

    public Address(String city, String district) {
        this.city = city;
        this.district = district;
    }

    // getters / setters
    public String getCity()      { return city; }
    public void setCity(String city)        { this.city = city; }
    public String getDistrict()  { return district; }
    public void setDistrict(String district) { this.district = district; }

    @Override
    public Address clone() {
        try {
            // Address 的字段都是 String（不可变），直接浅拷贝即可
            return (Address) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }
}
```

### 7.3.3 深拷贝 -- Java 序列化（通用方案）

序列化方案是**最通用**的深拷贝实现，适用于任何实现了 `Serializable` 接口的对象图，无需为每个类手动编写克隆代码。

```java
import java.io.*;
import java.util.Date;

/**
 * 基于 Java 原生序列化的通用深拷贝工具
 */
public class SerializationUtils {

    /**
     * 通过序列化 + 反序列化实现深拷贝
     * 优点：完全通用，无需修改目标类的代码
     * 缺点：性能较低（序列化开销大）；所有类必须实现 Serializable
     */
    @SuppressWarnings("unchecked")
    public static <T extends Serializable> T deepClone(T object) {
        try {
            // 序列化：将对象写入字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ObjectOutputStream oos = new ObjectOutputStream(baos)) {
                oos.writeObject(object);
                oos.flush();
            }

            // 反序列化：从字节数组还原对象
            ByteArrayInputStream bais = new ByteArrayInputStream(baos.toByteArray());
            try (ObjectInputStream ois = new ObjectInputStream(bais)) {
                return (T) ois.readObject();
            }
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException("深拷贝失败", e);
        }
    }
}
```

```java
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 使用序列化深拷贝的用户类
 * 必须实现 Serializable 接口
 */
public class SerializableUser implements Serializable {
    private static final long serialVersionUID = 1L;

    private String name;
    private int age;
    private List<String> hobbies;
    private SerializableAddress address;

    public SerializableUser(String name, int age) {
        this.name = name;
        this.age = age;
        this.hobbies = new ArrayList<>();
        this.address = new SerializableAddress("未设置");
    }

    public void addHobby(String hobby) { this.hobbies.add(hobby); }
    public void setAddress(SerializableAddress address) { this.address = address; }
    public List<String> getHobbies()   { return hobbies; }
    public SerializableAddress getAddress() { return address; }

    // 无需手动编写 clone() 方法！
}

public class SerializableAddress implements Serializable {
    private static final long serialVersionUID = 1L;
    private String city;
    public SerializableAddress(String city) { this.city = city; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
}

// 使用示例：
// SerializableUser original = new SerializableUser("张三", 30);
// original.addHobby("读书");
//
// SerializableUser cloned = SerializationUtils.deepClone(original);
// cloned.addHobby("编程");
//
// System.out.println(original.getHobbies());  // [读书] -- 未被污染
// System.out.println(cloned.getHobbies());    // [读书, 编程]
```

### 7.3.4 深拷贝 -- 拷贝构造函数

拷贝构造函数是一种不依赖于 `Cloneable` 接口的替代方案，代码更直观，类型更安全。

```java
/**
 * 使用拷贝构造函数的深拷贝实现
 * 优点：不依赖 Cloneable 接口，类型安全（返回具体类型而非 Object）
 * 缺点：需要为每个类手动编写拷贝构造函数
 */
public class CopyConstructorUser {
    private String name;
    private int age;
    private List<String> hobbies;
    private CopyConstructorAddress address;

    // 普通构造函数
    public CopyConstructorUser(String name, int age) {
        this.name = name;
        this.age = age;
        this.hobbies = new ArrayList<>();
        this.address = new CopyConstructorAddress("未设置");
    }

    // 拷贝构造函数：以另一个对象为参数，创建其副本
    public CopyConstructorUser(CopyConstructorUser other) {
        this.name = other.name;                              // String 不可变，直接赋值
        this.age = other.age;                                // 基本类型，直接赋值
        this.hobbies = new ArrayList<>(other.hobbies);       // 创建新的 List
        this.address = new CopyConstructorAddress(other.address); // 递归拷贝
    }

    public void addHobby(String hobby) { hobbies.add(hobby); }
    public void setAddress(CopyConstructorAddress address) { this.address = address; }
    public List<String> getHobbies() { return hobbies; }
    public CopyConstructorAddress getAddress() { return address; }
}

public class CopyConstructorAddress {
    private String city;

    public CopyConstructorAddress(String city) {
        this.city = city;
    }

    // 拷贝构造函数
    public CopyConstructorAddress(CopyConstructorAddress other) {
        this.city = other.city;
    }

    public String getCity()       { return city; }
    public void setCity(String city) { this.city = city; }
}

// 使用示例：
// CopyConstructorUser original = new CopyConstructorUser("张三", 30);
// original.addHobby("读书");
//
// CopyConstructorUser cloned = new CopyConstructorUser(original);  // 类型安全！
// cloned.addHobby("编程");
//
// System.out.println(original.getHobbies());  // [读书]
```

### 7.3.5 深拷贝 -- JSON 序列化（Jackson / Gson）

使用 JSON 库进行深拷贝比 Java 原生序列化更灵活：不要求类实现 `Serializable`，且序列化结果是可读的 JSON 文本。

**使用 Jackson：**

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * 基于 Jackson 的深拷贝工具
 */
public class JacksonDeepClone {
    private static final ObjectMapper MAPPER = new ObjectMapper()
        .registerModule(new JavaTimeModule());   // 支持 Java 8 时间类型

    /**
     * 通过 Jackson 的序列化 + 反序列化实现深拷贝
     * 优点：不需要 Serializable，支持泛型，可处理循环引用（需配置）
     * 缺点：依赖第三方库；需要默认构造函数和 getter/setter
     */
    public static <T> T deepClone(T object, Class<T> clazz) {
        try {
            String json = MAPPER.writeValueAsString(object);
            return MAPPER.readValue(json, clazz);
        } catch (Exception e) {
            throw new RuntimeException("Jackson 深拷贝失败", e);
        }
    }
}

// 使用示例：
// UserPojo original = new UserPojo("张三", 30);
// UserPojo cloned = JacksonDeepClone.deepClone(original, UserPojo.class);
```

**使用 Gson：**

```java
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

/**
 * 基于 Gson 的深拷贝工具
 */
public class GsonDeepClone {
    private static final Gson GSON = new GsonBuilder()
        .serializeNulls()    // 保留 null 字段
        .create();

    public static <T> T deepClone(T object, Class<T> clazz) {
        String json = GSON.toJson(object);
        return GSON.fromJson(json, clazz);
    }
}
```

### 7.3.6 四种深拷贝方式性能对比

以下是针对不同规模对象的深拷贝性能基准测试（伪基准，展示相对量级）：

```java
/**
 * 深拷贝方式性能对比（示意）
 * 测试环境：10万次深拷贝，单线程
 */
public class DeepCloneBenchmark {

    // 小型对象（5个字段，无嵌套）：10万次
    // ┌────────────────────┬──────────┐
    // │      方式           │ 耗时(ms) │
    // ├────────────────────┼──────────┤
    // │ 手动 clone()       │    15    │  ← 最快
    // │ 拷贝构造函数        │    12    │  ← 最快（无 Object.clone 开销）
    // │ Java 序列化         │   450    │  ← 慢（原生序列化开销大）
    // │ Jackson JSON       │   380    │  ← 中等
    // │ Gson JSON          │   320    │  ← 中等
    // └────────────────────┴──────────┘

    // 大型对象（50+字段，5层嵌套）：10万次
    // ┌────────────────────┬──────────┐
    // │      方式           │ 耗时(ms) │
    // ├────────────────────┼──────────┤
    // │ 手动 clone()       │   120    │  ← 最快，但代码量极大
    // │ Java 序列化         │  1800    │  ← 慢
    // │ Jackson JSON       │  1500    │  ← 中等
    // │ Gson JSON          │  1300    │  ← 中等
    // └────────────────────┴──────────┘

    // 建议：
    // 1. 字段少、性能敏感：手动重写 clone() 或使用拷贝构造函数
    // 2. 字段多、维护成本高：使用 JSON 序列化方案（Jackson/Gson）
    // 3. 必须兼容遗留代码：使用 Java 序列化方案
    // 4. 跨语言/跨系统：使用 JSON 序列化（可读性好，易于调试）
}
```

## 7.4 JDK/框架源码解析

### 7.4.1 java.lang.Object.clone() 和 Cloneable 接口

这是 Java 原型模式的基础实现，但设计上存在几个广为人知的缺陷。

```java
// Object.clone() 源码声明（简化）：
// protected native Object clone() throws CloneNotSupportedException;

// Cloneable 接口源码：
// public interface Cloneable {
//     // 空接口！没有任何方法声明
//     // 仅仅作为一个"标记"，告诉 JVM 该类支持克隆
// }
```

**Cloneable 接口的设计缺陷：**

1. **Cloneable 不包含 clone() 方法** -- 这是最大的设计失误。clone() 定义在 Object 中，Cloneable 只是一个标记接口
2. **clone() 是 protected** -- 导致子类必须重写并提升为 public 才能被外部调用
3. **clone() 返回 Object** -- 每次调用都需要强制类型转换
4. **默认是浅拷贝** -- 对初学者具有欺骗性：看起来是完整的复制，实际是引用共享
5. **无法克隆 final 字段** -- `super.clone()` 后无法修改 final 成员变量

```java
// Cloneable 的设计问题演示
public class CloneableIssuesDemo {
    private final String id = "fixed";    // final 字段

    @Override
    public CloneableIssuesDemo clone() {
        try {
            CloneableIssuesDemo cloned = (CloneableIssuesDemo) super.clone();
            // cloned.id = "changed";  // 编译错误：无法修改 final 字段！
            // 这意味着如果某个字段需要在克隆时被替换（如深拷贝），就不能设为 final
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }
}
```

**Effective Java 的建议**（Joshua Bloch）：不要使用 Cloneable 接口。优先使用拷贝构造函数或静态工厂方法。

### 7.4.2 ArrayList.clone()

`ArrayList` 的 `clone()` 方法创建了一个**浅拷贝**：它复制了内部数组，但数组中的元素引用仍然指向原对象。

```java
// ArrayList.clone() 源码（简化）：
// public Object clone() {
//     try {
//         ArrayList<?> v = (ArrayList<?>) super.clone();
//         v.elementData = Arrays.copyOf(elementData, size);
//         v.modCount = 0;
//         return v;
//     } catch (CloneNotSupportedException e) {
//         throw new InternalError(e);
//     }
// }

// 验证 ArrayList.clone() 的浅拷贝特性
public static void main(String[] args) {
    ArrayList<StringBuilder> original = new ArrayList<>();
    original.add(new StringBuilder("Hello"));

    @SuppressWarnings("unchecked")
    ArrayList<StringBuilder> cloned = (ArrayList<StringBuilder>) original.clone();

    cloned.get(0).append(" World");

    System.out.println(original.get(0));  // "Hello World" -- 被修改了！
    // 因为虽然 elementData 是新数组，但 elementData[i] 指向的还是同一个 StringBuilder
}
```

### 7.4.3 HashMap.clone()

`HashMap` 的 `clone()` 也创建浅拷贝：复制了桶数组和 Entry 结构，但 key 和 value 的引用是共享的。

```java
// HashMap.clone() 源码（简化）：
// public Object clone() {
//     HashMap<K,V> result;
//     try {
//         result = (HashMap<K,V>) super.clone();
//     } catch (CloneNotSupportedException e) {
//         throw new InternalError(e);
//     }
//     result.reinitialize();   // 重置内部状态
//     result.putMapEntries(this, false);  // 重新插入所有键值对
//     return result;
// }

// 验证 HashMap.clone() 的浅拷贝特性
public static void main(String[] args) {
    HashMap<String, StringBuilder> original = new HashMap<>();
    original.put("key", new StringBuilder("Value"));

    @SuppressWarnings("unchecked")
    HashMap<String, StringBuilder> cloned = (HashMap<String, StringBuilder>) original.clone();

    cloned.get("key").append("-Modified");

    System.out.println(original.get("key"));  // "Value-Modified" -- key/value 本身是浅拷贝
}
```

### 7.4.4 Spring @Scope("prototype") -- Prototype Bean 作用域

Spring 框架中的"prototype"作用域本质上应用了原型模式。每次向 Spring 容器请求原型 Bean 时，Spring 都会创建一个新的实例。

```java
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Component;

@Component
@Scope("prototype")
public class ReportGenerator {
    private String reportId;
    private String data;

    public ReportGenerator() {
        this.reportId = UUID.randomUUID().toString();
        System.out.println("创建新的 ReportGenerator: " + reportId);
    }

    public void setData(String data) {
        this.data = data;
    }

    public String getReportId() {
        return reportId;
    }
}

// 使用：
// @Autowired
// private ApplicationContext context;
//
// ReportGenerator r1 = context.getBean(ReportGenerator.class);
// ReportGenerator r2 = context.getBean(ReportGenerator.class);
// System.out.println(r1.getReportId() == r2.getReportId());  // false -- 两个不同的实例
```

与单例 Bean 的对比：

| 特性 | Singleton（单例） | Prototype（原型） |
|------|-------------------|-------------------|
| 实例数量 | 整个容器共享一个 | 每次请求创建新实例 |
| 创建时机 | 容器启动时（默认） | 每次 getBean() 时 |
| 生命周期管理 | 容器负责完整生命周期 | 容器只负责创建，不管理销毁 |
| 适用场景 | 无状态服务（DAO, Service, Controller） | 有状态对象、每次使用需要独立副本 |

### 7.4.5 Spring Bean 定义中的原型模式本质

Spring Bean 的 prototype scope 本质上就是原型模式的**注册表变体**：Spring 容器充当了原型管理器，在初始化时将 Bean 定义（相当于原型实例）注册到容器中。每次 `getBean()` 操作就是一次克隆 -- 根据原始定义创建新的 Bean 实例。

**Spring 原型 Bean 的注册与获取流程：**

```
1. 注册阶段：容器启动时解析 @Component/@Bean 注解，存储 BeanDefinition（元数据）
2. 获取阶段（prototype scope）：
   a. 找到 BeanDefinition
   b. 推断构造函数
   c. 实例化新对象（相当于"克隆"）
   d. 注入依赖（@Autowired 字段）
   e. 执行 @PostConstruct 回调
   f. 返回新实例（容器不再持有引用）
```

对于 prototype scope 的 Bean，Spring 不执行 `@PreDestroy` 销毁回调，因为容器不跟踪 prototype Bean 的生命周期。这是原型模式应用中的一个真实权衡。

## 7.5 使用场景与案例

### 7.5.1 简历模板系统

```java
/**
 * 简历生成系统：使用原型模式实现"模板克隆 + 个性化修改"
 */
public class Resume implements Cloneable {
    private String name;
    private String email;
    private String phone;
    private String objective;         // 求职意向
    private List<WorkExperience> experiences;
    private List<Education> educations;
    private List<String> skills;

    public Resume() {
        this.experiences = new ArrayList<>();
        this.educations = new ArrayList<>();
        this.skills = new ArrayList<>();
    }

    // ------ 深拷贝 clone ------
    @Override
    public Resume clone() {
        try {
            Resume cloned = (Resume) super.clone();
            // 深拷贝可变字段
            cloned.experiences = new ArrayList<>();
            for (WorkExperience exp : this.experiences) {
                cloned.experiences.add(exp.clone());
            }
            cloned.educations = new ArrayList<>();
            for (Education edu : this.educations) {
                cloned.educations.add(edu.clone());
            }
            cloned.skills = new ArrayList<>(this.skills);
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }

    // ------ 静态工厂：创建默认模板 ------
    public static Resume createDefaultTemplate() {
        Resume template = new Resume();
        template.objective = "求职意向: Java后端开发工程师";
        template.skills.addAll(Arrays.asList("Java", "Spring Boot", "MyBatis", "MySQL", "Redis"));
        // 添加一段示例经历
        template.experiences.add(new WorkExperience("XX公司", "Java开发", "2020-2023"));
        template.educations.add(new Education("XX大学", "计算机科学", "学士", "2016-2020"));
        return template;
    }

    // ------ 渲染简历 ------
    public String render() {
        StringBuilder sb = new StringBuilder();
        sb.append("========================\n");
        sb.append("      个人简历\n");
        sb.append("========================\n");
        sb.append("姓名: ").append(name != null ? name : "[待填写]").append("\n");
        sb.append("邮箱: ").append(email != null ? email : "[待填写]").append("\n");
        sb.append("电话: ").append(phone != null ? phone : "[待填写]").append("\n");
        sb.append("\n求职意向: ").append(objective).append("\n");
        sb.append("\n--- 技能 ---\n");
        for (String skill : skills) {
            sb.append("  - ").append(skill).append("\n");
        }
        sb.append("\n--- 工作经历 ---\n");
        for (WorkExperience exp : experiences) {
            sb.append("  ").append(exp).append("\n");
        }
        sb.append("\n--- 教育背景 ---\n");
        for (Education edu : educations) {
            sb.append("  ").append(edu).append("\n");
        }
        return sb.toString();
    }

    // ------ setter ------
    public void setName(String name)   { this.name = name; }
    public void setEmail(String email) { this.email = email; }
    public void setPhone(String phone) { this.phone = phone; }

    // ------ 内部类 ------
    public static class WorkExperience implements Cloneable {
        private String company;
        private String position;
        private String duration;

        public WorkExperience(String company, String position, String duration) {
            this.company = company;
            this.position = position;
            this.duration = duration;
        }

        @Override
        protected WorkExperience clone() {
            try {
                return (WorkExperience) super.clone();  // 字段都是 String，浅拷贝安全
            } catch (CloneNotSupportedException e) {
                throw new AssertionError(e);
            }
        }

        @Override
        public String toString() {
            return company + " | " + position + " | " + duration;
        }
    }

    public static class Education implements Cloneable {
        private String school;
        private String major;
        private String degree;
        private String duration;

        public Education(String school, String major, String degree, String duration) {
            this.school = school;
            this.major = major;
            this.degree = degree;
            this.duration = duration;
        }

        @Override
        protected Education clone() {
            try {
                return (Education) super.clone();
            } catch (CloneNotSupportedException e) {
                throw new AssertionError(e);
            }
        }

        @Override
        public String toString() {
            return school + " | " + major + " | " + degree + " | " + duration;
        }
    }
}

// 客户端使用：
// Resume template = Resume.createDefaultTemplate();
//
// Resume resume1 = template.clone();
// resume1.setName("张三");
// resume1.setEmail("zhangsan@example.com");
//
// Resume resume2 = template.clone();
// resume2.setName("李四");
// resume2.setEmail("lisi@example.com");
//
// System.out.println(resume1.render());
```

### 7.5.2 游戏实体孵化系统

```java
/**
 * 游戏怪物孵化器：使用原型模式批量生成怪物
 */
public class Monster implements Cloneable {
    private String name;
    private int baseHealth;
    private int baseAttack;
    private int baseDefense;
    private double moveSpeed;
    private List<String> abilities;       // 技能列表
    private AIType aiType;               // AI 行为类型

    public enum AIType {
        PATROL, AGGRESSIVE, DEFENSIVE, BOSS
    }

    private Monster() {
        this.abilities = new ArrayList<>();
    }

    @Override
    public Monster clone() {
        try {
            Monster cloned = (Monster) super.clone();
            // 深拷贝 abilities（List<String>），String 是不可变的，浅拷贝安全
            cloned.abilities = new ArrayList<>(this.abilities);
            // aiType 是枚举，天然单例，浅拷贝安全
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }

    // ------ 预定义的怪物原型工厂方法 ------

    public static Monster createGoblin() {
        Monster goblin = new Monster();
        goblin.name = "哥布林";
        goblin.baseHealth = 50;
        goblin.baseAttack = 8;
        goblin.baseDefense = 3;
        goblin.moveSpeed = 2.5;
        goblin.abilities.addAll(Arrays.asList("挥砍", "扔石头"));
        goblin.aiType = AIType.PATROL;
        return goblin;
    }

    public static Monster createOrc() {
        Monster orc = new Monster();
        orc.name = "兽人";
        orc.baseHealth = 120;
        orc.baseAttack = 18;
        orc.baseDefense = 10;
        orc.moveSpeed = 1.8;
        orc.abilities.addAll(Arrays.asList("重击", "战吼", "冲锋"));
        orc.aiType = AIType.AGGRESSIVE;
        return orc;
    }

    public static Monster createDragonBoss() {
        Monster dragon = new Monster();
        dragon.name = "远古巨龙";
        dragon.baseHealth = 5000;
        dragon.baseAttack = 150;
        dragon.baseDefense = 80;
        dragon.moveSpeed = 4.0;
        dragon.abilities.addAll(Arrays.asList("龙息", "扫尾", "飞行", "召唤小龙", "陨石"));
        dragon.aiType = AIType.BOSS;
        return dragon;
    }

    // ------ 批量生成方法 ------

    /**
     * 从原型克隆 N 个怪物实例（可为每个实例设置不同的位置、等级等）
     */
    public static List<Monster> spawnWave(Monster prototype, int count, int levelMultiplier) {
        List<Monster> wave = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            Monster spawned = prototype.clone();
            spawned.name = prototype.name + " #" + (i + 1);
            spawned.baseHealth *= (1 + levelMultiplier * 0.1);
            spawned.baseAttack *= (1 + levelMultiplier * 0.1);
            wave.add(spawned);
        }
        return wave;
    }

    @Override
    public String toString() {
        return String.format("%s [HP:%d ATK:%d DEF:%d AI:%s]",
            name, baseHealth, baseAttack, baseDefense, aiType);
    }
}

// 使用示例：
// // 第一波：10只哥布林
// List<Monster> wave1 = Monster.spawnWave(Monster.createGoblin(), 10, 1);
// // 第二波：5只兽人
// List<Monster> wave2 = Monster.spawnWave(Monster.createOrc(), 5, 2);
// // Boss
// Monster boss = Monster.createDragonBoss().clone();
```

### 7.5.3 报表生成（预构建图表的模板克隆）

```java
/**
 * 报表生成器：使用原型模式克隆带预构建数据的报表模板
 */
public class Report implements Cloneable {
    private String title;
    private String author;
    private Date generatedDate;
    private List<Chart> charts;         // 预构建的图表（耗时的数据聚合操作已完成）
    private Table summaryTable;         // 预构建的汇总表
    private Map<String, String> metadata;

    public Report() {
        this.charts = new ArrayList<>();
        this.metadata = new LinkedHashMap<>();
    }

    @Override
    public Report clone() {
        try {
            Report cloned = (Report) super.clone();
            // 深拷贝图表列表（图表本身也应该支持克隆）
            cloned.charts = new ArrayList<>();
            for (Chart chart : this.charts) {
                cloned.charts.add(chart.clone());
            }
            // 深拷贝汇总表
            cloned.summaryTable = this.summaryTable != null ? this.summaryTable.clone() : null;
            // 深拷贝元数据
            cloned.metadata = new LinkedHashMap<>(this.metadata);
            // Date 虽然是可变对象，但 clone() 通常会重新设置，这里直接复制亦可
            cloned.generatedDate = new Date();
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }

    /**
     * 从数据库/数据源构建一个"年度汇总"报表模板
     * 这个过程涉及大量数据库聚合查询，非常耗时
     */
    public static Report buildAnnualTemplate(int year) {
        Report template = new Report();
        template.title = year + "年度业绩汇总报告";
        template.author = "系统自动生成";

        // 模拟耗时的数据聚合操作
        template.charts.add(Chart.loadFromDB("revenue_trend", year));      // 营收趋势图（50ms）
        template.charts.add(Chart.loadFromDB("product_distribution", year));// 产品分布图（40ms）
        template.charts.add(Chart.loadFromDB("region_heatmap", year));      // 区域热力图（80ms）
        template.summaryTable = Table.aggregateFromDB(year);                // 汇总表（120ms）

        template.metadata.put("year", String.valueOf(year));
        template.metadata.put("template_version", "2.1");

        return template;
    }

    // setter 方法（克隆后微调）
    public void setTitle(String title) { this.title = title; }
    public void setAuthor(String author) { this.author = author; }
    public void addMetadata(String key, String value) { this.metadata.put(key, value); }

    // 内部类（简化）
    public static class Chart implements Cloneable {
        private String name;
        private byte[] renderedImage;  // 预渲染的图表图片

        public static Chart loadFromDB(String name, int year) {
            Chart chart = new Chart();
            chart.name = name;
            chart.renderedImage = new byte[]{/* 模拟图片数据 */};
            return chart;
        }

        @Override
        public Chart clone() {
            try {
                Chart cloned = (Chart) super.clone();
                cloned.renderedImage = this.renderedImage.clone();  // byte[] clone
                return cloned;
            } catch (CloneNotSupportedException e) {
                throw new AssertionError(e);
            }
        }
    }

    public static class Table implements Cloneable {
        private List<String[]> rows;

        public static Table aggregateFromDB(int year) {
            Table table = new Table();
            table.rows = new ArrayList<>();
            table.rows.add(new String[]{"总营收", "12.5亿"});
            table.rows.add(new String[]{"总成本", "8.1亿"});
            return table;
        }

        @Override
        public Table clone() {
            try {
                Table cloned = (Table) super.clone();
                cloned.rows = new ArrayList<>(this.rows);
                return cloned;
            } catch (CloneNotSupportedException e) {
                throw new AssertionError(e);
            }
        }
    }
}

// 使用示例：
// // 一次性加载年度模板（耗时 ~300ms）
// Report annualTemplate = Report.buildAnnualTemplate(2025);
//
// // 为各部门快速克隆报表（每个仅需微秒级）
// Report salesReport = annualTemplate.clone();
// salesReport.setTitle("销售部2025年度业绩报告");
// salesReport.setAuthor("销售总监");
//
// Report productReport = annualTemplate.clone();
// productReport.setTitle("产品部2025年度业绩报告");
// productReport.setAuthor("产品总监");
```

### 7.5.4 环境差异化配置

```java
/**
 * 使用原型模式管理多环境配置
 */
public class EnvironmentConfig implements Cloneable {
    private String envName;
    private String dbHost;
    private int dbPort;
    private String dbName;
    private String dbUsername;
    private String dbPassword;
    private String redisHost;
    private int redisPort;
    private String logLevel;
    private int maxConnections;
    private Duration timeout;

    // 私有构造
    private EnvironmentConfig() {}

    @Override
    public EnvironmentConfig clone() {
        try {
            return (EnvironmentConfig) super.clone();
            // 所有字段为基本类型或 String，默认浅拷贝足够
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }

    // setter（克隆后修改）
    public void setEnvName(String envName) { this.envName = envName; }
    public void setDbHost(String dbHost)   { this.dbHost = dbHost; }
    public void setDbPort(int dbPort)      { this.dbPort = dbPort; }
    public void setDbName(String dbName)   { this.dbName = dbName; }
    public void setDbPassword(String dbPassword) { this.dbPassword = dbPassword; }
    public void setRedisHost(String redisHost)   { this.redisHost = redisHost; }
    public void setLogLevel(String logLevel)     { this.logLevel = logLevel; }

    /**
     * 创建开发环境默认配置原型
     */
    public static EnvironmentConfig createDevBase() {
        EnvironmentConfig config = new EnvironmentConfig();
        config.envName = "dev";
        config.dbPort = 3306;
        config.dbName = "myapp_dev";
        config.dbUsername = "dev_user";
        config.dbPassword = "dev_pass";
        config.redisHost = "redis-dev.internal";
        config.redisPort = 6379;
        config.logLevel = "DEBUG";
        config.maxConnections = 10;
        config.timeout = Duration.ofSeconds(60);
        return config;
    }

    @Override
    public String toString() {
        return String.format("[%s] DB: %s:%d/%s  Redis: %s:%d  Log: %s",
            envName, dbHost, dbPort, dbName, redisHost, redisPort, logLevel);
    }
}

// 使用示例：
// EnvironmentConfig devBase = EnvironmentConfig.createDevBase();
//
// EnvironmentConfig dev1 = devBase.clone();
// dev1.setEnvName("dev-张三");
// dev1.setDbHost("10.0.1.101");
//
// EnvironmentConfig dev2 = devBase.clone();
// dev2.setEnvName("dev-李四");
// dev2.setDbHost("10.0.1.102");
// dev2.setRedishost("redis-dev-2.internal");
```

## 7.6 潜在风险与问题

### 7.6.1 Cloneable 接口设计缺陷

这是 Java 原型模式最著名的问题。Cloneable 接口不包含任何方法声明，`clone()` 方法定义在 `java.lang.Object` 中且为 `protected`。

```java
// Cloneable 接口：一个空壳
public interface Cloneable {
    // 完全没有方法！
    // 其唯一作用是改变 Object.clone() 的行为：
    // - 实现了 Cloneable：super.clone() 返回字段拷贝
    // - 未实现 Cloneable：super.clone() 抛出 CloneNotSupportedException
}

// 如果没有重写 clone() 就直接调用：
public class BrokenPrototype implements Cloneable {
    private String data;
}

// BrokenPrototype bp = new BrokenPrototype();
// bp.clone();  // 编译错误：clone() 在 Object 中是 protected 的
```

**规避建议：**
- 总是重写 `clone()` 并将其可见性提升为 `public`
- 返回具体类型（协变返回类型）而不是 `Object`
- 优先使用拷贝构造函数代替 Cloneable

### 7.6.2 clone() 返回 Object 导致的类型问题

```java
// 每次调用 clone() 都需要强制转型
ArrayList<String> list = new ArrayList<>();
@SuppressWarnings("unchecked")
ArrayList<String> cloned = (ArrayList<String>) list.clone();  // 丑陋的强制转型

// 对比：拷贝构造函数无需转型
ArrayList<String> cloned2 = new ArrayList<>(list);  // 类型安全，无警告
```

从 Java 5 开始可以使用协变返回类型（covariant return type）：

```java
@Override
public MyClass clone() {    // 返回具体类型而不是 Object
    try {
        return (MyClass) super.clone();
    } catch (CloneNotSupportedException e) {
        throw new AssertionError(e);
    }
}
```

### 7.6.3 循环引用问题

当对象图中存在循环引用时，深拷贝会陷入无限递归。

```java
/**
 * 循环引用导致深拷贝的困难
 */
class Parent implements Cloneable {
    private String name;
    private List<Child> children = new ArrayList<>();

    @Override
    public Parent clone() {
        try {
            Parent cloned = (Parent) super.clone();
            cloned.children = new ArrayList<>();
            for (Child child : this.children) {
                Child clonedChild = child.clone();
                clonedChild.setParent(cloned);   // 需要重新绑定父引用
                cloned.children.add(clonedChild);
            }
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }
}

class Child implements Cloneable {
    private String name;
    private Parent parent;  // 反向引用！

    @Override
    public Child clone() {
        try {
            Child cloned = (Child) super.clone();
            // parent 字段不能在这里设置 -- 否则形成无限递归
            cloned.parent = null;  // 先置空，由 Parent.clone() 来设置
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }

    public void setParent(Parent parent) { this.parent = parent; }
}
```

**解决方案：**
- 使用序列化方案（自动处理循环引用，通过 `ObjectOutputStream` 的引用追踪机制）
- 手动设计克隆流程，在顶层统一管理反向引用的赋值
- 使用 Jackson 的 `@JsonIdentityInfo` 或 `@JsonManagedReference/@JsonBackReference` 处理循环引用

### 7.6.4 final 字段的克隆限制

由于 `super.clone()` 是 JVM 层面的字节复制，之后无法修改 `final` 字段。

```java
public class FinalFieldProblem implements Cloneable {
    private final String id;               // final 字段
    private final List<String> dataList;   // final 字段

    public FinalFieldProblem(String id) {
        this.id = id;
        this.dataList = new ArrayList<>();  // 一旦赋值就不能再改
    }

    @Override
    public FinalFieldProblem clone() {
        try {
            FinalFieldProblem cloned = (FinalFieldProblem) super.clone();
            // cloned.dataList = new ArrayList<>();  // 编译错误！不能赋值给 final 字段
            // 这意味着克隆后的对象与原对象共享 dataList（浅拷贝）
            // 违反了深拷贝的意图，但没有编译期的替代方案
            return cloned;
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }
}
```

**结论**：如果你需要对包含可变引用且需要深拷贝的字段使用 Prototype 模式，**不要将这些字段声明为 final**。这也是 Effective Java 建议避免使用 clone() 并改用拷贝构造函数的理由之一。

### 7.6.5 深拷贝的性能权衡

深拷贝的代价随对象图的规模线性或超线性增长。以下是一个粗略的性能参考：

```java
/**
 * 深拷贝性能参考（数量级对比）
 */
public class DeepClonePerformanceGuide {
    // ┌──────────────────────┬────────────────────────┐
    // │      对象规模          │   深拷贝耗时 (相对值)    │
    // ├──────────────────────┼────────────────────────┤
    // │ 10个简单字段           │       1x (基准)        │
    // │ 50个字段 + 3层嵌套     │       15x              │
    // │ 500+ 字段 + 10层嵌套   │      100x+             │
    // │ 10000个元素的列表      │      200x+             │
    // │ 含数据库连接的对象      │    不可深拷贝！         │
    // └──────────────────────┴────────────────────────┘

    // 建议：
    // 1. 原型对象应该是"重量级"的（创建代价高），这样克隆的性价比才高
    // 2. 如果克隆比 new 还慢，原型模式就失去了意义
    // 3. 考虑对象池（Object Pool）作为替代方案
}
```

## 7.7 优化策略

### 7.7.1 原型管理器（Prototype Registry / Manager）

原型管理器维护一个原型注册表，客户端通过 key 获取对应的原型并进行克隆。

```java
/**
 * 原型管理器：集中管理所有原型实例
 */
public class PrototypeManager {
    private final Map<String, Cloneable> prototypes = new ConcurrentHashMap<>();

    /**
     * 注册原型
     */
    public void register(String key, Cloneable prototype) {
        prototypes.put(key, prototype);
    }

    /**
     * 注销原型
     */
    public void unregister(String key) {
        prototypes.remove(key);
    }

    /**
     * 通过 key 获取原型并克隆
     * 注意：由于 Cloneable 不包含 clone() 方法，这里使用反射调用
     */
    public Object getClone(String key) {
        Cloneable prototype = prototypes.get(key);
        if (prototype == null) {
            throw new IllegalArgumentException("未找到原型: " + key);
        }
        try {
            // 使用反射调用 clone() 方法（解决 Cloneable 接口无 clone() 的问题）
            java.lang.reflect.Method cloneMethod = prototype.getClass().getMethod("clone");
            return cloneMethod.invoke(prototype);
        } catch (Exception e) {
            throw new RuntimeException("克隆失败", e);
        }
    }

    /**
     * 更优雅的方案：使用自定义的 Prototype 泛型接口
     */
    public interface Prototype<T> {
        T clone();
    }

    // 如果所有原型都实现 Prototype<T> 接口：
    // private final Map<String, Prototype<?>> protos = new ConcurrentHashMap<>();
    // public <T> T getClone(String key) { ... }
}
```

```java
/**
 * 使用泛型 Prototype 接口的原型管理器（推荐）
 */
public class TypedPrototypeManager {
    private final Map<String, Prototype<?>> prototypes = new ConcurrentHashMap<>();

    public interface Prototype<T> {
        T clone();
    }

    public void register(String key, Prototype<?> prototype) {
        prototypes.put(key, prototype);
    }

    @SuppressWarnings("unchecked")
    public <T> T getClone(String key) {
        Prototype<?> prototype = prototypes.get(key);
        if (prototype == null) {
            throw new IllegalArgumentException("未找到原型: " + key);
        }
        return (T) prototype.clone();
    }

    // 使用示例：
    // TypedPrototypeManager manager = new TypedPrototypeManager();
    // manager.register("goblin", Monster.createGoblin());
    // manager.register("orc", Monster.createOrc());
    //
    // Monster goblin1 = manager.getClone("goblin");
    // Monster orc1 = manager.getClone("orc");
}
```

### 7.7.2 拷贝构造函数模式（规避 Cloneable）

如 7.3.4 节所示，拷贝构造函数是比 `Cloneable` 更安全、更清晰的替代方案。

两者的对比：

| 特性 | Cloneable + clone() | 拷贝构造函数 |
|------|---------------------|-------------|
| 类型安全 | 返回 Object，需强制转型 | 返回具体类型 |
| final 字段支持 | 无法修改 final 字段 | 可以正常赋值（构造阶段） |
| 继承支持 | 需要每个子类重写 clone() | 子类调用 super 拷贝构造函数 |
| 接口约定 | 无编译期保证 | 构造参数体现约定 |
| 异常处理 | 必须处理 CloneNotSupportedException | 无需处理 |
| JDK 设计 | 公认的设计缺陷 | 清晰直观 |

**Effective Java 的建议：**

> 不要使用 Cloneable 接口。如果你需要为一个类提供拷贝功能，请提供一个拷贝构造函数（或静态工厂方法）。

```java
// Effective Java 推荐的正确做法:
public class BetterPrototype {
    private String name;
    private List<String> items;

    // 拷贝构造函数
    public BetterPrototype(BetterPrototype other) {
        this.name = other.name;
        this.items = new ArrayList<>(other.items);
    }

    // 或者：静态工厂方法
    public static BetterPrototype copyOf(BetterPrototype other) {
        return new BetterPrototype(other);
    }
}
```

### 7.7.3 使用第三方库（Apache Commons Lang）

Apache Commons Lang 提供了开箱即用的深拷贝工具类。

```java
import org.apache.commons.lang3.SerializationUtils;

// SerializationUtils.clone() 等效于我们 7.3.3 节的实现
public class ApacheDeepCloneDemo {
    public static void main(String[] args) {
        MyEntity original = new MyEntity("data");
        MyEntity cloned = SerializationUtils.clone(original);
        // 前提：MyEntity 必须实现 java.io.Serializable
    }
}
```

Commons Lang 的 `SerializationUtils.clone()` 与自实现的唯一区别是它提供了更好的异常处理和输入校验。

### 7.7.4 原型模式 vs 工厂方法模式的选择

两者都是创建型模式，但适用的场景不同：

| 维度 | 原型模式 (Prototype) | 工厂方法模式 (Factory Method) |
|------|---------------------|----------------------------|
| 创建方式 | 克隆已有实例 | 调用具体子类的工厂方法 |
| 初始化成本 | 低（只拷贝内存） | 高（需执行完整创建流程） |
| 运行时灵活性 | 极高（可动态注册原型） | 中等（子类化需在编译期确定） |
| 对象状态保留 | 保留原型的所有状态 | 每次创建都是全新初始状态 |
| 对象数量 | 适合大量相似对象 | 无特别优势 |
| 继承复杂度 | 克隆继承链复杂 | 工厂继承链清晰 |
| 典型场景 | 游戏实体、模板系统 | 数据库连接、支付方式 |

**选择决策树：**

```
需要创建对象
    │
    ├── 创建代价高且需要大量相似对象？
    │       │
    │       ├── 是 → 使用原型模式（Prototype）
    │       │
    │       └── 否 → 继续判断
    │
    ├── 需要子类决定具体创建的类型？
    │       │
    │       ├── 是 → 使用工厂方法模式（Factory Method）
    │       │
    │       └── 否 → 普通构造函数即可
```

### 7.7.5 最佳实践总结

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 字段全为基本类型 / 不可变对象 | 浅拷贝 (super.clone()) | 简单高效 |
| 含可变引用需要完全独立 | 手动深拷贝（重写 clone） | 性能最优但代码量大 |
| 复杂对象图、字段繁多 | JSON 序列化深拷贝（Jackson/Gson） | 通用性好，维护成本低 |
| 需要规避 Cloneable 设计缺陷 | 拷贝构造函数 | 类型安全，语义清晰 |
| 需要集中管理多种原型 | 原型管理器（PrototypeManager） | 运行时灵活注册/获取 |
| 遗留系统必须兼容 Serializable | Java 序列化深拷贝 | 保证兼容性 |

## 本章小结

本章全面深入地介绍了原型模式：

1. **核心问题**：解决高成本对象创建问题，通过克隆替代 new，避免重复的数据库查询、网络请求和复杂计算
2. **浅拷贝与深拷贝**：
   - 浅拷贝：`super.clone()` 只复制基本类型字段，可变对象引用被共享
   - 深拷贝：递归克隆所有可变子对象，保证克隆品与原型的完全独立
3. **四种深拷贝实现**：
   - 手动重写 clone() -- 性能最佳，代码量最大
   - Java 序列化 -- 通用性高，性能较低，受 Serializable 限制
   - 拷贝构造函数 -- 类型安全，规避 Cloneable 设计缺陷（推荐）
   - JSON 序列化（Jackson/Gson） -- 灵活通用，不强制 Serializable
4. **JDK / 框架源码**：
   - `ArrayList.clone()` 和 `HashMap.clone()` 都是浅拷贝
   - Spring `@Scope("prototype")` 是原型模式在 DI 容器中的经典应用
   - Cloneable 接口设计被公认为 Java 语言的缺陷之一
5. **常见风险**：Cloneable 无 clone() 方法、返回 Object 类型不安全、循环引用导致无限递归、final 字段限制、深拷贝性能代价
6. **优化方案**：原型管理器统一管理、拷贝构造函数替代 Cloneable、第三方库（Commons Lang）、与工厂模式的理性选择

**原型模式最适用于对象创建成本高、且需要大量相似对象的场景。** 在实现时优先使用拷贝构造函数或静态工厂方法，除非与旧代码兼容必须使用 Cloneable 接口。

---

在下一章中，我们将进入结构型模式，学习适配器模式（Adapter）-- 将不兼容的接口转换为客户端期望的接口。
