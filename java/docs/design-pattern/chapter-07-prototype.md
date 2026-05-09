# 第7章 原型模式（Prototype）
+**原型模式**通过复制现有对象来创建新对象，而不是通过new关键字实例化。这种模式使得创建对象的过程与具体的产品类解耦。+
## 7.1 解决的问题与应用场景
+### 7.1.1 问题分析
+在某些场景下，创建新对象的成本较高：+- 对象需要从数据库加载- 对象需要复杂的初始化过程
+- 对象的创建涉及多个步骤或资源++如果每次都需要重新创建，会导致：+1. 性能问题：重复的数据库查询、复杂计算2. 资源浪费：重复的网络请求、文件读取3. 复杂性增加：重复的初始化代码+
### 7.1.2 典型应用场景
+**1. 复杂对象创建**```java
// 从数据库加载用户配置
UserConfig config = userConfigRepository.findById(1L);UserConfig newConfig = config.clone();  // 复制配置，修改部分参数```**2. 简历模板**```java
// 使用模板创建多个相似的简历
Resume template = Resume.creatDefaultTemplate();Resume resume1 = template.clone();resume1.setPersonalInfo("张三", 25);Resume resume2 = template.clone();resume2.setPersonalInfo("李四", 30);```**3. 图形编辑器**```java// 复制图形元素Shape circle = new Circle(100, 100, 50);Shape circleCopy = circle.clone();circleCopy.move(50, 50);```**4. 游戏对象**```java// 复制怪物
Monster goblin = createGoblin();Monster goblinArmy = new ArrayList<>();for (int i = 0; i < 10; i++) {    goblinArmy.add(goblin.clone());}```+
## 7.2 实现原理与UML
+### 7.2.1 核心思想
+原型模式的核心是**通过复制现有对象来创建新对象**，而不是通过构造函数。Java中通过Cloneable接口和clone()方法实现。+
### 7.2.2 UML类图
+```┌─────────────────────┐
│     Client          │
├─────────────────────┤
├─────────────────────┤
└─────────────────────┘
        │          │
        │          │
        ▼          ▼
┌───────────────────┐      ┌───────────────────┐
│  Prototype        │      │   Client         │
│  (抽象原型)       │      │                  │
├───────────────────┤      ├───────────────────┤
│ + clone()         │      │                  │
└───────────────────┘      └───────────────────┘
        ▲          ▲
        │          │
        │          │
┌───────┴───────┐  ┌─┴─────────────────┐
│ ConcreteProto1│  │  ConcreteProto2  │
│ (具体原型1)   │  │  (具体原型2)       │
├───────────────┤  ├───────────────────┤
│ + clone()     │  │ + clone()         │
│ + operation() │  │ + operation()     │
└───────────────┘  └───────────────────┘
```++
### 7.2.3 角色分析
+- **Prototype（抽象原型）**：定义克隆自身的接口- **ConcretePrototype（具体原型）**：实现克隆自身的操作- **Client（客户端）**：让一个原型克隆自身，从而创建新的对象
+
### 7.2.4 时序图
+```Client              ConcretePrototype
   │                         │
   │                         │
   │    clone()              │
   │ ──────────────────────► │
   │                         │
   │   (创建新对象，复制数据)  │
   │                         │
   │      prototype          │
   │ ◄────────────────────── │
   │                         │
   │      (返回复制对象)       │
   │                         │
```++
## 7.3 代码实现（浅拷贝/深拷贝）
+### 7.3.1 基础实现
+**抽象原型**```java
public interface Prototype<T> {    T clone();}```**具体原型**```java
public class User implements Cloneable {    private String name;    private int age;    private Address address;        @Override    public User clone() {        try {            return (User) super.clone();        } catch (CloneNotSupportedException e) {            throw new RuntimeException("Clone not supported", e);        }    }    // getters and setters}```+
### 7.3.2 浅拷贝 vs 深拷贝
+**浅拷贝**```java
public class ShallowCopyExample implements Cloneable {    private String name;    private List<String> hobbies;        public ShallowCopyExample(String name) {        this.name = name;        this.hobbies = new ArrayList<>();    }        public void addHobby(String hobby) {        hobbies.add(hobby);    }        @Override    public ShallowCopyExample clone() {        try {            return (ShallowCopyExample) super.clone();        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        public static void main(String[] args) {        ShallowCopyExample original = new ShallowCopyExample("John");        original.addHobby("Reading");        original.addHobby("Gaming");                ShallowCopyExample copy = original.clone();        copy.addHobby("Swimming");                System.ou t.println(original.getHobbies());  // [Reading, Gaming, Swimming]        System.ou t.println(copy.getHobbies());    // [Reading, Gaming, Swimming]                // 问题：原始对象和拷贝对象共享同一个list！        System.ou t.println(original.getHobbies() == copy.getHobbies());  // true    }}```++**深拷贝**```java
public class DeepCopyExample implements Cloneable {    private String name;    private List<String> hobbies;        public DeepCopyExample(String name) {        this.name = name;        this.hobbies = new ArrayList<>();    }        public void addHobby(String hobby) {        hobbies.add(hobby);    }        @Override    public DeepCopyExample clone() {        try {            DeepCopyExample copy = (DeepCopyExample) super.clone();            // 深拷贝：创建新的list            copy.hobbies = new ArrayList<>(this.hobbies);            return copy;        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        public static void main(String[] args) {        DeepCopyExample original = new DeepCopyExample("John");        original.addHobby("Reading");        original.addHobby("Gaming");                DeepCopyExample copy = original.clone();        copy.addHobby("Swimming");                System.ou t.println(original.getHobbies());  // [Reading, Gaming]        System.ou t.println(copy.getHobbies());    // [Reading, Gaming, Swimming]                // 正确：两个对象有不同的list        System.ou t.println(original.getHobbies() == copy.getHobbies());  // false    }}```+
### 7.3.3 完整的深拷贝实现
+```java
public class User implements Cloneable {    private String name;    private int age;    private Address address;    private List<String> hobbies;        public User(String name) {        this.name = name;        this.address = new Address();        this.hobbies = new ArrayList<>();    }        @Override    public User clone() {        try {            User copy = (User) super.clone();            // 深拷贝：递归克隆对象            if (this.address != null) {                copy.address = this.address.clone();            }            // 深拷贝：创建新的list            if (this.hobbies != null) {                copy.hobbies = new ArrayList<>(this.hobbies);            }            return copy;        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        // getters and setters}public class Address implements Cloneable {    private String city;    private String street;    private String zipCode;        @Override    public Address clone() {        try {            return (Address) super.clone();        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        // getters and setters}```+
### 7.3.4 使用拷贝构造函数
+对于复杂对象，也可以使用拷贝构造函数：```javapublic class User {    private String name;    private int age;        // 普通构造函数    public User(String name) {        this.name = name;    }        // 拷贝构造函数    public User(User other) {        this.name = other.name;        this.age = other.age;    }        // getters and setters}```+
### 7.3.5 使用序列化（通用深拷贝）
+```java
public class SerializationUtil {    @SuppressWarnings("unchecked")    public static <T extends Serializable> T deepClone(T object) {        try {            // 序列化            ByteArrayOutputStream bos = new ByteArrayOutputStream();            ObjectOutputStream oos = new ObjectOutputStream(bos);            oos.writeObject(object);            oos.close();                // 反序列化            ByteArrayInputStream bis = new ByteArrayInputStream(bos.toByteArray());            ObjectInputStream ois = new ObjectInputStream(bis);            T clone = (T) ois.readObject();            ois.close();                return clone;        } catch (Exception e) {            throw new RuntimeException("Deep clone failed", e);        }    }}// 使用User original = new User("John");original.setAge(30);User clone = SerializationUtil.deepClone(original);```+
## 7.4 JDK/框架源码解析
+### 7.4.1 Object.clone()方法
+Java中所有对象都继承自Object，Object提供了clone()方法：```java
protected native Object clone() throws CloneNotSupportedException;```+实现Cloneable接口后，可以重写clone()方法。+### 7.4.2 ArrayList的clone()```java
public class ArrayList<E> implements List<E>, RandomAccess, Cloneable {    @Override    public ArrayList<E> clone() {        try {            ArrayList<E> v = (ArrayList<E>) super.clone();            // 数组是浅拷贝            v.elementData = Arrays.copyOf(elementData, size);            v.modCount = 0;            return v;        } catch (CloneNotSupportedException e) {            throw new InternalError(e);        }    }}```+
### 7.4.3 HashMap的clone()```java
public class HashMap<K, V> extends AbstractMap<K, V>    implements Map<K, V>, Cloneable, Serializable {        @Override    @SuppressWarnings("unchecked")    public HashMap<K, V> clone() {        HashMap<K, V> result;        try {            result = (HashMap<K, V>) super.clone();        } catch (CloneNotSupportedException e) {            throw new InternalError(e);        }        result.reinitialize();        // 只复制键值对，不复制 Entry 的链表结构        result.putMapEntries(this, false);        return result;    }}```+
### 7.4.4 Spring中的原型Bean
+```java
// Spring中配置原型作用域的Bean
@Scope("prototype")@Componentpublic class MyPrototypeBean {    // 每次获取都会创建新实例}```+
### 7.4.5 MyBatis中的Prototype模式
+MyBatis使用复制来创建多个相似的对象：```java// DefaultParameterMap 中的克隆protected ParameterMap clone() throws CloneNotSupportedException {    ParameterMap pm = (ParameterMap) super.clone();    // 复制参数    return pm;}```+
## 7.5 使用场景与案例
+### 7.5.1 简历模板系统```java
public class Resume implements Cloneable {    private String name;    private String email;    private String phone;    private String summary;    private List<Experience> experiences;    private List<Education> educations;        public Resume() {        this.experiences = new ArrayList<>();        this.educations = new ArrayList<>();    }        @Override    public Resume clone() {        try {            Resume copy = (Resume) super.clone();            // 深拷贝列表            copy.experiences = new ArrayList<>(this.experiences);            copy.educations = new ArrayList<>(this.educations);            return copy;        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        // static factory method    public static Resume createTemplate() {        Resume template = new Resume();        template.setSummary("Professional with X years of experience...");        template.addExperience(new Experience("Company", "Position", "2020-01", "Present"));        template.addEducation(new Education("University", "Degree", "2016-09", "2020-06"));        return template;    }        // getters and setters    private void addExperience(Experience exp) { experiences.add(exp); }    private void addEducation(Education edu) { educations.add(edu); }        // 静态内部类    public static class Experience {        private String company;        private String position;        private String startDate;        private String endDate;        // constructors and getters    }        public static class Education {        private String school;        private String degree;        private String startDate;        private String endDate;        // constructors and getters    }}// 使用public class Main {    public static void main(String[] args) {        // 创建模板        Resume template = Resume.createTemplate();                // 使用模板创建多个简历        Resume resume1 = template.clone();        resume1.setName("张三");        resume1.setEmail("zhangsan@example.com");                Resume resume2 = template.clone();        resume2.setName("李四");        resume2.setEmail("lisi@example.com");    }}```+
### 7.5.2 图形编辑器```java
public abstract class Shape implements Cloneable {    protected int x;    protected int y;    protected String color;        public abstract void draw();        @Override    public Shape clone() {        try {            return (Shape) super.clone();        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        // getters and setters}public class Circle extends Shape {    private int radius;        @Override    public void draw() {        System.out.println("Drawing Circle at (" + x + "," + y + ") with radius " + radius);    }        @Override    public Circle clone() {        return (Circle) super.clone();    }        // getters and setters}public class Rectangle extends Shape {    private int width;    private int height;        @Override    public void draw() {        System.out.println("Drawing Rectangle at (" + x + "," + y + ") with " + width + "x" + height);    }        @Override    public Rectangle clone() {        return (Rectangle) super.clone();    }        // getters and setters}// 使用public class Main {    public static void main(String[] args) {        Circle circle = new Circle();        circle.setX(10);        circle.setY(20);        circle.setRadius(50);        circle.setColor("red");                // 复制圆形        Circle circleCopy = circle.clone();        circleCopy.setX(100);        circleCopy.setY(200);                circle.draw();      // Drawing Circle at (10,20) with radius 50        circleCopy.draw(); // Drawing Circle at (100,200) with radius 50    }}```+
### 7.5.3 游戏怪物生成```java
public class Monster implements Cloneable {    private String name;    private int health;    private int attack;    private int defense;    private List<String> skills;    private MonsterType type;        public Monster() {        skills = new ArrayList<>();    }        @Override    public Monster clone() {        try {            Monster copy = (Monster) super.clone();            copy.skills = new ArrayList<>(this.skills);            return copy;        } catch (CloneNotSupportedException e) {            throw new RuntimeException(e);        }    }        public static Monster createGoblin() {        Monster goblin = new Monster();        goblin.setName("Goblin");        goblin.setHealth(50);        goblin.setAttack(10);        goblin.setDefense(5);        goblin.setType(MonsterType.ORC);        goblin.addSkill("Slash");        return goblin;    }        public static Monster createOrc() {        Monster orc = new Monster();        orc.setName("Orc");        orc.setHealth(100);        orc.setAttack(20);        orc.setDefense(15);        orc.setType(MonsterType.ORC);        orc.addSkill("Heavy Strike");        orc.addSkill("Battle Cry");        return orc;    }        // getters, setters, addSkill}// 使用public class Main {    public static void main(String[] args) {        // 创建boss        Monster boss = Monster.createOrc();        boss.setHealth(500);        boss.setAttack(50);                // 创建小怪群        List<Monster> monsters = new ArrayList<>();        for (int i = 0; i < 10; i++) {            Monster goblin = Monster.createGoblin();            goblin.setName("Goblin " + (i + 1));            monsters.add(goblin);        }    }}```+
## 7.6 潜在风险与问题
+### 7.6.1 浅拷贝的陷阱
+最常见的问题是浅拷贝导致的引用共享：```java
Monster monster = Monster.createGoblin();Monster clone = monster.clone();// 修改副本的技能也会影响原始对象clone.addSkill("Fireball");System.out.println(monster.getSkills());  // 包含 Fireball！```+
**解决方案**：确保所有可变对象都进行深拷贝。+
### 7.6.2 循环引用问题
+对象之间的循环引用会导致深拷贝困难：```java
class A {    private B b;}class B {    private A a;}```+
**解决方案**：1. 手动处理，停止递归2. 使用序列化方式3. 使用第三方库（如Apache Commons Lang的SerializationUtils）+
### 7.6.3 final字段
+clone()方法无法复制final字段：```java
class Problem {    private final String name = "default";  // 无法被clone修改        @Override    public Problem clone() {        Problem copy = (Problem) super.clone();        // 无法修改final字段        return copy;    }}```+
### 7.6.4 深拷贝的性能问题
+深拷贝需要递归复制所有对象，可能导致性能问题。++**解决方案**：1. 权衡是否真的需要深拷贝2. 使用原型模式的对象应该是"重量级"的3. 考虑使用缓存或对象池+
### 7.6.5 Cloneable接口的问题
+Cloneable是一个"标记接口"，不包含任何方法，只是改变了Object.clone()的行为。++**最佳实践**：1. 使用@Override注解显式声明2. 返回具体类型而非Object3. 在方法文档中说明拷贝行为（深/浅）
+## 7.7 优化策略
+### 7.7.1 工厂方法创建原型+```java
public class PrototypeFactory {    private static final Map<String, Prototype<?>> prototypes = new HashMap<>();        static {        prototypes.put("user", new User("default"));        prototypes.put("monster", Monster.createGoblin());    }        @SuppressWarnings("unchecked")    public static <T extends Prototype<T>> T create(String type) {        Prototype<T> prototype = (Prototype<T>) prototypes.get(type);        if (prototype == null) {            throw new IllegalArgumentException("Unknown prototype type: " + type);        }        return (T) prototype.clone();    }        public static void register(String type, Prototype<?> prototype) {        prototypes.put(type, prototype);    }}```+
### 7.7.2 使用Cloneable接口的正确方式+```java
public class User implements Cloneable {    private String name;    private List<String> hobbies;        @Override    public User clone() {        try {            User copy = (User) super.clone();            // 关键：深拷贝可变对象            copy.hobbies = new ArrayList<>(this.hobbies);            return copy;        } catch (CloneNotSupportedException e) {            throw new AssertionError("Should not happen", e);        }    }}```+
### 7.7.3 原型管理器+```java
public class PrototypeManager {    private final Map<String, Prototype<?>> prototypes = new HashMap<>();        public void register(String name, Prototype<?> prototype) {        prototypes.put(name, prototype);    }        public <T extends Prototype<T>> T get(String name) {        @SuppressWarnings("unchecked")        T prototype = (T) prototypes.get(name);        if (prototype == null) {            throw new IllegalArgumentException("Prototype not found: " + name);        }        return prototype.clone();    }        public void remove(String name) {        prototypes.remove(name);    }}```+
### 7.7.4 最佳实践总结+| 场景 | 推荐方式 | 原因 | |------|----------|------| | 对象简单，无可变引用 | 浅拷贝 | 性能好 | | 对象复杂，有可变引用 | 深拷贝 | 避免共享问题 | | 复杂对象图 | 序列化 | 实现简单 | | 大量相同对象创建 | 原型模式 | 减少创建成本 | | 只需要部分属性 | 拷贝构造函数 | 灵活控制 |
+## 本章小结
+本章详细介绍了原型模式：++1. **解决的问题**：避免重复创建复杂对象，提高性能
2. **UML结构**：抽象原型、具体原型、客户端
3. **实现方式**：浅拷贝、深拷贝、序列化
4. **框架应用**：ArrayList.clone()、HashMap.clone()、Spring原型Bean
5. **潜在问题**：浅拷贝陷阱、循环引用、性能问题
6. **优化策略**：工厂方法创建原型、原型管理器++
**原型模式适用于创建成本较高的对象**，通过复制现有实例来创建新对象，可以显著提高性能。需要注意深拷贝和浅拷贝的选择。+
---+在下一章中，我们将学习结构型模式的第一个模式——适配器模式。