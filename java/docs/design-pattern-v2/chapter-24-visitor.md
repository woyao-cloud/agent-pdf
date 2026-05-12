# 第24章 访问者模式（Visitor）

**访问者模式**表示一个作用于某对象结构中的各元素的操作。它使你可以在不改变各元素的类的前提下定义作用于这些元素的新操作。

## 24.1 解决的问题与应用场景

### 24.1.1 问题分析

在面向对象系统中，对象结构（如集合、树）通常包含多种类型的元素。当需要对这些元素执行新操作时，传统做法是在每个元素类中添加新方法。但这样做有两个问题：

**问题一：元素类不断膨胀**

```java
// 购物车中的元素接口，每加一种操作就要修改接口及其所有实现类
public interface Item {
    double getPrice();
    String getDescription();
    // 新需求：每种新操作都要加方法
    double calculateDiscount();       // 折扣计算
    double calculateSalesTax();       // 销售税
    double calculateShipping();       // 运费
    String generateReport();          // 报表生成
    String toJson();                  // JSON序列化
    String toXml();                   // XML序列化
}
```

每次添加新操作，都要修改 Item 接口和所有实现类，违反开闭原则。

**问题二：操作与类型绑死**

传统方法调用是单分派（Single Dispatch）——方法的选择只取决于接收者的运行时类型。当操作也因类型而变化时，需要编写大量 `instanceof` 判断：

```java
// 不使用访问者模式的尴尬代码
public double calculate(Item item) {
    if (item instanceof Book) {
        return ((Book) item).getPrice() * 0.9;  // 图书9折
    } else if (item instanceof Electronics) {
        return ((Electronics) item).getPrice() * 0.95;  // 电子产品95折
    } else if (item instanceof Fruit) {
        return ((Fruit) item).getPrice() * 0.85;  // 水果85折
    }
    throw new IllegalArgumentException("未知类型");
}
```

新增类型时，所有 `instanceof` 判断都需要修改，遗漏一个就会引入 Bug。

### 24.1.2 典型应用场景

**1. 编译器与AST处理**：对抽象语法树（AST）执行类型检查、代码生成、优化等操作，每种操作是一个访问者。

**2. 文件系统遍历**：File/Directory 结构，执行文件搜索、大小计算、备份等操作。

**3. 报表引擎**：相同的数据结构生成 HTML、PDF、Excel 等不同格式的报表。

**4. 序列化框架**：对不同数据类型的节点执行不同的序列化逻辑。

## 24.2 实现原理与UML

### 24.2.1 双分派机制（Double Dispatch）

访问者模式的核心是**双分派**——方法调用不仅取决于元素类型，还取决于访问者类型。这是通过两次方法分派实现的：

```
第一次分派（由语言运行时决定）：
    element.accept(visitor)
    → 根据 element 的实际类型，调用对应的 accept() 方法
    比如：Book.accept(visitor)、Electronics.accept(visitor)

第二次分派（由accept方法内部触发）：
    Book.accept(visitor) 内部调用 visitor.visit(this)
    this 的类型是 Book，所以调用的是 Visitor.visit(Book book)
    这就是编译期重载解析
```

### 24.2.2 UML类图

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client                                     │
│                                                                   │
│  ┌──────────────────────────────────┐                            │
│  │      ObjectStructure             │                            │
│  │  ┌────────────────────────────┐  │    ┌────────────────────┐  │
│  │  │  elements: List<Element>   │  │    │     Visitor        │  │
│  │  │  + acceptAll(Visitor)      │──┼───►│  (抽象访问者)      │  │
│  │  └────────────────────────────┘  │    ├────────────────────┤  │
│  └──────────────────────────────────┘    │+ visit(Book)       │  │
│                                          │+ visit(Electronics)│  │
│  ┌────────────────────┐                 │+ visit(Fruit)      │  │
│  │    Element          │                 └────────┬───────────┘  │
│  │    (抽象元素)       │                          │              │
│  ├────────────────────┤                          │              │
│  │ + accept(Visitor)  │                          │              │
│  └────────┬───────────┘              ┌───────────┴──────────┐   │
│           │                          │                       │   │
│           │             ┌────────────┴────┐     ┌───────────┴─┐  │
│           │             │DiscountVisitor   │     │TaxVisitor   │  │
│           │             │  (具体访问者A)    │     │(具体访问者B) │  │
│           │             ├─────────────────┤     ├─────────────┤  │
│           │             │+ visit(Book)    │     │+ visit(Book)│  │
│           │             │+ visit(Elec)    │     │+ visit(Elec)│  │
│           │             │+ visit(Fruit)   │     │+ visit(Fruit)│ │
│           │             └─────────────────┘     └─────────────┘  │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────┐                │
│  │     ConcreteElements                         │                │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────┐ │                │
│  │  │   Book   │  │ Electronics  │  │  Fruit │ │                │
│  │  ├──────────┤  ├──────────────┤  ├────────┤ │                │
│  │  │+accept() │  │+accept()     │  │+accept│ │                │
│  │  │ =visitor │  │ =visitor     │  │ =visito│ │                │
│  │  │ .visit() │  │ .visit(this) │  │ .visit(│ │                │
│  │  └──────────┘  └──────────────┘  └────────┘ │                │
│  └──────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 24.2.3 双分派流程详解

```
调用: discountVisitor 访问 book 元素

step 1: 调用 book.accept(discountVisitor)
        运行时根据 book 类型 → 进入 Book.accept()

step 2: Book.accept() 内部:
        public void accept(Visitor visitor) {
            visitor.visit(this);  // 编译时 this 是 Book 类型
        }
        编译期重载解析 → Visitor.visit(Book book)
        运行时根据 visitor 类型 → 进入 DiscountVisitor.visit(Book book)

result: DiscountVisitor.visit(Book book) 被执行
        同时知道了访问者是 DiscountVisitor，元素是 Book
        双分派完成！
```

## 24.3 代码实现

### 24.3.1 购物车折扣计算器

```java
// ============ 访问者接口 ============
public interface Visitor {
    double visit(Book book);
    double visit(Electronics electronics);
    double visit(Fruit fruit);
}

// ============ 元素接口 ============
public interface Item {
    double getPrice();
    String accept(Visitor visitor);
}

// ============ 具体元素 ============
public class Book implements Item {
    private final String isbn;
    private final String title;
    private final double price;
    private final String category;

    public Book(String isbn, String title, double price, String category) {
        this.isbn = isbn;
        this.title = title;
        this.price = price;
        this.category = category;
    }

    @Override
    public double getPrice() { return price; }

    public String getIsbn() { return isbn; }
    public String getTitle() { return title; }
    public String getCategory() { return category; }

    @Override
    public String accept(Visitor visitor) {
        // 双分派关键：第二次分派由此触发
        // 编译期重载决议调用 visit(Book)
        // 运行时多态决定调用哪个 Visitor 的 visit(Book)
        return String.valueOf(visitor.visit(this));
    }
}

public class Electronics implements Item {
    private final String brand;
    private final String model;
    private final double price;
    private final double weight;

    public Electronics(String brand, String model, double price, double weight) {
        this.brand = brand;
        this.model = model;
        this.price = price;
        this.weight = weight;
    }

    @Override
    public double getPrice() { return price; }

    public String getBrand() { return brand; }
    public String getModel() { return model; }
    public double getWeight() { return weight; }

    @Override
    public String accept(Visitor visitor) {
        return String.valueOf(visitor.visit(this));
    }
}

public class Fruit implements Item {
    private final String name;
    private final double pricePerKg;
    private final double weightKg;

    public Fruit(String name, double pricePerKg, double weightKg) {
        this.name = name;
        this.pricePerKg = pricePerKg;
        this.weightKg = weightKg;
    }

    @Override
    public double getPrice() { return pricePerKg * weightKg; }

    public String getName() { return name; }
    public double getPricePerKg() { return pricePerKg; }
    public double getWeightKg() { return weightKg; }

    @Override
    public String accept(Visitor visitor) {
        return String.valueOf(visitor.visit(this));
    }
}

// ============ 具体访问者：折扣计算 ============
public class DiscountVisitor implements Visitor {
    @Override
    public double visit(Book book) {
        // 计算机类图书8折，其他9折
        double discount = "computer".equalsIgnoreCase(book.getCategory()) ? 0.8 : 0.9;
        double result = book.getPrice() * discount;
        System.out.printf("[折扣] %s 原价%.2f，%.0f折后 %.2f%n",
                book.getTitle(), book.getPrice(), discount * 10, result);
        return result;
    }

    @Override
    public double visit(Electronics electronics) {
        // 电子产品满100减10
        double price = electronics.getPrice();
        double discount = price > 100 ? 10 : 0;
        double result = price - discount;
        System.out.printf("[折扣] %s %s 原价%.2f，优惠%.0f后 %.2f%n",
                electronics.getBrand(), electronics.getModel(),
                price, discount, result);
        return result;
    }

    @Override
    public double visit(Fruit fruit) {
        // 水果8.5折
        double result = fruit.getPrice() * 0.85;
        System.out.printf("[折扣] %s 原价%.2f，85折后 %.2f%n",
                fruit.getName(), fruit.getPrice(), result);
        return result;
    }
}

// ============ 具体访问者：销售税计算 ============
public class SalesTaxVisitor implements Visitor {
    @Override
    public double visit(Book book) {
        // 图书免税
        System.out.printf("[税] %s 免税%n", book.getTitle());
        return 0;
    }

    @Override
    public double visit(Electronics electronics) {
        // 电子产品15%增值税
        double tax = electronics.getPrice() * 0.15;
        System.out.printf("[税] %s %s 税率15%%，税额 %.2f%n",
                electronics.getBrand(), electronics.getModel(), tax);
        return tax;
    }

    @Override
    public double visit(Fruit fruit) {
        // 水果5%增值税
        double tax = fruit.getPrice() * 0.05;
        System.out.printf("[税] %s 税率5%%，税额 %.2f%n", fruit.getName(), tax);
        return tax;
    }
}

// ============ 具体访问者：运费计算 ============
public class ShippingVisitor implements Visitor {
    @Override
    public double visit(Book book) {
        // 图书每本运费5元
        double cost = 5.0;
        System.out.printf("[运费] %s 运费 %.2f%n", book.getTitle(), cost);
        return cost;
    }

    @Override
    public double visit(Electronics electronics) {
        // 电子产品按重量计费，每公斤10元
        double cost = electronics.getWeight() * 10;
        System.out.printf("[运费] %s %s (%.1fkg) 运费 %.2f%n",
                electronics.getBrand(), electronics.getModel(),
                electronics.getWeight(), cost);
        return cost;
    }

    @Override
    public double visit(Fruit fruit) {
        // 水果按重量计费，每公斤8元
        double cost = fruit.getWeightKg() * 8;
        System.out.printf("[运费] %s (%.1fkg) 运费 %.2f%n",
                fruit.getName(), fruit.getWeightKg(), cost);
        return cost;
    }
}

// ============ 购物车（对象结构） ============
public class ShoppingCart {
    private final List<Item> items = new ArrayList<>();

    public void addItem(Item item) {
        items.add(item);
    }

    // 接受访问者，遍历所有元素
    public double accept(Visitor visitor) {
        double total = 0;
        for (Item item : items) {
            // 每个元素调用accept方法，
            // 触发双分派：元素类型 + 访问者类型共同决定行为
            total += Double.parseDouble(item.accept(visitor));
        }
        return total;
    }
}

// ============ 客户端 ============
public class ShoppingCartDemo {
    public static void main(String[] args) {
        ShoppingCart cart = new ShoppingCart();
        cart.addItem(new Book("978-7-111-10000-1", "Java核心技术", 99.0, "computer"));
        cart.addItem(new Book("978-7-111-10000-2", "设计模式", 79.0, "tech"));
        cart.addItem(new Electronics("Apple", "MacBook Pro", 12999.0, 2.1));
        cart.addItem(new Fruit("苹果", 8.0, 3.0));

        // 第一种访问者：计算折扣
        System.out.println("=== 折扣计算 ===");
        double discountTotal = cart.accept(new DiscountVisitor());
        System.out.printf("折扣后总价: %.2f%n%n", discountTotal);

        // 第二种访问者：计算税费
        System.out.println("=== 税费计算 ===");
        double taxTotal = cart.accept(new SalesTaxVisitor());
        System.out.printf("税费总计: %.2f%n%n", taxTotal);

        // 第三种访问者：计算运费
        System.out.println("=== 运费计算 ===");
        double shippingTotal = cart.accept(new ShippingVisitor());
        System.out.printf("运费总计: %.2f%n%n", shippingTotal);

        // 最终账单
        double finalTotal = discountTotal + taxTotal + shippingTotal;
        System.out.printf("最终应付: %.2f (折扣价 + 税费 + 运费)%n", finalTotal);
    }
}
```

### 24.3.2 文件系统操作

```java
// ============ 文件系统元素 ============
public interface FileSystemNode {
    String getName();
    String accept(FileSystemVisitor visitor);
}

public class File implements FileSystemNode {
    private final String name;
    private final long sizeBytes;     // 文件大小（字节）
    private final String extension;   // 扩展名

    public File(String name, long sizeBytes, String extension) {
        this.name = name;
        this.sizeBytes = sizeBytes;
        this.extension = extension;
    }

    public long getSizeBytes() { return sizeBytes; }
    public String getExtension() { return extension; }

    @Override
    public String getName() { return name; }

    @Override
    public String accept(FileSystemVisitor visitor) {
        return visitor.visit(this);
    }
}

public class Directory implements FileSystemNode {
    private final String name;
    private final List<FileSystemNode> children = new ArrayList<>();

    public Directory(String name) {
        this.name = name;
    }

    public void add(FileSystemNode node) {
        children.add(node);
    }

    public List<FileSystemNode> getChildren() {
        return Collections.unmodifiableList(children);
    }

    @Override
    public String getName() { return name; }

    @Override
    public String accept(FileSystemVisitor visitor) {
        return visitor.visit(this);
    }
}

// ============ 访问者接口 ============
public interface FileSystemVisitor {
    String visit(File file);
    String visit(Directory directory);
}

// ============ 访问者：大小计算 ============
public class SizeCalculatorVisitor implements FileSystemVisitor {
    private long totalSize = 0;

    @Override
    public String visit(File file) {
        totalSize += file.getSizeBytes();
        return String.format("%s (%d bytes)", file.getName(), file.getSizeBytes());
    }

    @Override
    public String visit(Directory directory) {
        long dirSizeBefore = totalSize;
        StringBuilder sb = new StringBuilder();
        sb.append(directory.getName()).append("/\n");
        for (FileSystemNode child : directory.getChildren()) {
            String result = child.accept(this);
            // 缩进显示
            for (String line : result.split("\n")) {
                sb.append("  ").append(line).append("\n");
            }
        }
        long dirSize = totalSize - dirSizeBefore;
        sb.append("目录总大小: ").append(formatSize(dirSize));
        return sb.toString();
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024)
            return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }
}

// ============ 访问者：文件搜索 ============
public class SearchVisitor implements FileSystemVisitor {
    private final String searchTerm;
    private final List<String> results = new ArrayList<>();

    public SearchVisitor(String searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
    }

    @Override
    public String visit(File file) {
        if (file.getName().toLowerCase().contains(searchTerm)) {
            results.add("[文件] " + file.getName());
        }
        return "";
    }

    @Override
    public String visit(Directory directory) {
        if (directory.getName().toLowerCase().contains(searchTerm)) {
            results.add("[目录] " + directory.getName() + "/");
        }
        for (FileSystemNode child : directory.getChildren()) {
            child.accept(this);
        }
        return "";
    }

    public List<String> getResults() {
        return results;
    }
}

// ============ 访问者：文件计数 ============
public class FileCountVisitor implements FileSystemVisitor {
    private int fileCount = 0;
    private int dirCount = 0;

    @Override
    public String visit(File file) {
        fileCount++;
        return "";
    }

    @Override
    public String visit(Directory directory) {
        dirCount++;
        for (FileSystemNode child : directory.getChildren()) {
            child.accept(this);
        }
        return "";
    }

    @Override
    public String toString() {
        return String.format("文件: %d, 目录: %d, 总计: %d",
                fileCount, dirCount, fileCount + dirCount);
    }
}
```

### 24.3.3 HR系统

```java
// ============ 员工元素 ============
public interface Employee {
    String getName();
    double getSalary();
    String accept(HrVisitor visitor);
}

public class Manager implements Employee {
    private final String name;
    private final double salary;
    private final double bonus;          // 年终奖金
    private final int teamSize;          // 团队人数

    public Manager(String name, double salary, double bonus, int teamSize) {
        this.name = name;
        this.salary = salary;
        this.bonus = bonus;
        this.teamSize = teamSize;
    }

    public double getBonus() { return bonus; }
    public int getTeamSize() { return teamSize; }

    @Override
    public String getName() { return name; }
    @Override
    public double getSalary() { return salary; }

    @Override
    public String accept(HrVisitor visitor) {
        return visitor.visit(this);
    }
}

public class Engineer implements Employee {
    private final String name;
    private final double salary;
    private final String skill;         // 技能专长
    private final int projectCount;     // 参与项目数

    public Engineer(String name, double salary, String skill, int projectCount) {
        this.name = name;
        this.salary = salary;
        this.skill = skill;
        this.projectCount = projectCount;
    }

    public String getSkill() { return skill; }
    public int getProjectCount() { return projectCount; }

    @Override
    public String getName() { return name; }
    @Override
    public double getSalary() { return salary; }

    @Override
    public String accept(HrVisitor visitor) {
        return visitor.visit(this);
    }
}

// ============ HR访问者接口 ============
public interface HrVisitor {
    String visit(Manager manager);
    String visit(Engineer engineer);
}

// ============ 薪资计算访问者 ============
public class SalaryCalculatorVisitor implements HrVisitor {
    private double totalPayroll = 0;

    @Override
    public String visit(Manager manager) {
        // 经理：工资 + 奖金
        double annualTotal = manager.getSalary() * 12 + manager.getBonus();
        totalPayroll += annualTotal;
        return String.format("经理 %s: 月薪%.0f x 12 + 奖金%.0f = 年薪%.0f",
                manager.getName(), manager.getSalary(),
                manager.getBonus(), annualTotal);
    }

    @Override
    public String visit(Engineer engineer) {
        // 工程师：工资 + 项目奖金（每个项目加2000）
        double projectBonus = engineer.getProjectCount() * 2000;
        double annualTotal = engineer.getSalary() * 12 + projectBonus;
        totalPayroll += annualTotal;
        return String.format("工程师 %s: 月薪%.0f x 12 + 项目奖金%d x 2000 = 年薪%.0f",
                engineer.getName(), engineer.getSalary(),
                engineer.getProjectCount(), annualTotal);
    }

    public double getTotalPayroll() { return totalPayroll; }
}

// ============ 报表生成访问者 ============
public class ReportGeneratorVisitor implements HrVisitor {
    private final StringBuilder report = new StringBuilder();

    @Override
    public String visit(Manager manager) {
        String line = String.format("| %-10s | 经理  | 团队:%2d人 | 年薪:%8.0f |",
                manager.getName(), manager.getTeamSize(),
                manager.getSalary() * 12 + manager.getBonus());
        report.append(line).append("\n");
        return line;
    }

    @Override
    public String visit(Engineer engineer) {
        String line = String.format("| %-10s | 工程师 | 技能:%-8s | 年薪:%8.0f |",
                engineer.getName(), engineer.getSkill(),
                engineer.getSalary() * 12 + engineer.getProjectCount() * 2000);
        report.append(line).append("\n");
        return line;
    }

    public String getReport() {
        return "+------------+--------+--------------+-------------+\n"
             + "| 姓名       | 职位   | 其他信息     | 年薪        |\n"
             + "+------------+--------+--------------+-------------+\n"
             + report.toString()
             + "+------------+--------+--------------+-------------+";
    }
}

// ============ 期权计算访问者 ============
public class StockOptionVisitor implements HrVisitor {
    @Override
    public String visit(Manager manager) {
        // 经理：期权 = 年薪 * 30%
        double options = (manager.getSalary() * 12 + manager.getBonus()) * 0.3;
        return String.format("经理 %s 期权价值: %.0f (年薪的30%%)", manager.getName(), options);
    }

    @Override
    public String visit(Engineer engineer) {
        // 工程师：期权 = 月薪 * 项目数 * 100
        double options = engineer.getSalary() * engineer.getProjectCount() * 100;
        return String.format("工程师 %s 期权价值: %.0f (月薪 * 项目数 * 100)",
                engineer.getName(), options);
    }
}
```

## 24.4 JDK/框架源码解析

### 24.4.1 java.nio.file.FileVisitor

Java NIO 的 `FileVisitor` 接口定义了文件树遍历访问者：

```java
// 访问者接口
public interface FileVisitor<T> {
    FileVisitResult preVisitDirectory(T dir, BasicFileAttributes attrs);
    FileVisitResult visitFile(T file, BasicFileAttributes attrs);
    FileVisitResult visitFileFailed(T file, IOException exc);
    FileVisitResult postVisitDirectory(T dir, IOException exc);
}

// 使用：遍历整个目录树，对每个文件/目录执行操作
Files.walkFileTree(Paths.get("/home"), new SimpleFileVisitor<Path>() {
    @Override
    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
        System.out.println("访问文件: " + file);
        return FileVisitResult.CONTINUE;
    }
});
```

`SimpleFileVisitor` 是 `FileVisitor` 的默认实现，使用者只需覆盖关心的方法。这正是访问者模式中的"默认访问者"模式。

### 24.4.2 javax.lang.model.element.ElementVisitor

Java 注解处理 API（APT）中的 `ElementVisitor` 用于编译时处理源代码元素：

```java
// 访问源代码元素的不同类型
public interface ElementVisitor<R, P> {
    R visit(Element e, P p);
    R visitPackage(PackageElement e, P p);     // 访问包
    R visitType(TypeElement e, P p);           // 访问类型（类、接口）
    R visitVariable(VariableElement e, P p);   // 访问变量
    R visitExecutable(ExecutableElement e, P p); // 访问方法
    R visitUnknown(Element e, P p);
}
```

编译时注解处理器利用此接口遍历源代码结构：

```java
public class MyAnnotationProcessor extends AbstractProcessor {
    @Override
    public boolean process(Set<? extends TypeElement> annotations,
                           RoundEnvironment roundEnv) {
        for (Element element : roundEnv.getRootElements()) {
            // ElementVisitor 处理不同类型的源代码元素
            element.accept(new ElementScannerV8<Void, Void>() {
                @Override
                public Void visitExecutable(ExecutableElement e, Void p) {
                    // 处理方法
                    System.out.println("方法: " + e.getSimpleName());
                    return super.visitExecutable(e, p);
                }
            }, null);
        }
        return true;
    }
}
```

### 24.4.3 ASM 字节码框架

ASM 库是访问者模式的经典应用。它用访问者遍历 Java 类的字节码：

```java
// ClassReader 读取字节码 → 调用 ClassVisitor 的方法
ClassReader reader = new ClassReader(inputStream);
ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES);

// 自定义访问者，可以包装其他访问者形成链
ClassVisitor myVisitor = new ClassVisitor(Opcodes.ASM9, writer) {
    @Override
    public MethodVisitor visitMethod(int access, String name,
                                     String desc, String signature,
                                     String[] exceptions) {
        MethodVisitor mv = super.visitMethod(access, name, desc, signature, exceptions);
        // 为每个方法返回一个 MethodVisitor（也是访问者模式）
        return new MethodVisitor(Opcodes.ASM9, mv) {
            @Override
            public void visitMethodInsn(int opcode, String owner,
                                        String name, String desc, boolean itf) {
                // 方法调用插桩
                System.out.println("调用: " + owner + "." + name);
                super.visitMethodInsn(opcode, owner, name, desc, itf);
            }
        };
    }
};

reader.accept(myVisitor, 0);
```

ASM 的 `ClassReader.accept(ClassVisitor)` 与访问者模式的 `element.accept(visitor)` 完全对应。整个字节码分析/转换框架都建立在访问者模式之上。

### 24.4.4 Spring BeanDefinitionVisitor

Spring 内部使用 `BeanDefinitionVisitor` 来遍历和替换 Bean 定义中的占位符：

```java
// Spring 3.x+ 内部实现
public class BeanDefinitionVisitor {
    private StringValueResolver valueResolver;

    // 访问 BeanDefinition 的各个部分
    public void visitBeanDefinition(BeanDefinition beanDefinition) {
        visitParentName(beanDefinition);
        visitBeanClassName(beanDefinition);
        visitFactoryBeanName(beanDefinition);
        visitFactoryMethodName(beanDefinition);
        visitScope(beanDefinition);
        if (beanDefinition.hasPropertyValues()) {
            visitPropertyValues(beanDefinition.getPropertyValues());
        }
        if (beanDefinition.hasConstructorArgumentValues()) {
            visitConstructorArgumentValues(
                beanDefinition.getConstructorArgumentValues());
        }
    }
}
```

## 24.5 使用场景与案例

### 24.5.1 保险定价引擎

保险系统对不同险种执行不同的定价规则：

```java
// 保单元素
public interface InsurancePolicy {
    String getPolicyNumber();
    String accept(PricingVisitor visitor);
}

public class CarInsurance implements InsurancePolicy { /* ... */ }
public class HealthInsurance implements InsurancePolicy { /* ... */ }
public class LifeInsurance implements InsurancePolicy { /* ... */ }
public class PropertyInsurance implements InsurancePolicy { /* ... */ }

// 各种定价访问者
public class StandardPricingVisitor implements PricingVisitor { /* ... */ }
public class PromotionalPricingVisitor implements PricingVisitor { /* ... */ }
public class RenewalPricingVisitor implements PricingVisitor { /* ... */ }
```

添加新险种时只需新增一个元素类和一个 `visit()` 方法；添加新定价策略时只需新增一个访问者类。

### 24.5.2 JSON/XML 序列化

```java
// JSON 序列化访问者
public class JsonSerializationVisitor implements AstVisitor {
    @Override
    public String visit(JsonObject object) {
        StringBuilder sb = new StringBuilder("{");
        // 遍历对象的所有属性
        return sb.toString();
    }

    @Override
    public String visit(JsonArray array) {
        StringBuilder sb = new StringBuilder("[");
        // 遍历数组的所有元素
        return sb.toString();
    }

    @Override
    public String visit(JsonString str) {
        return "\"" + str.getValue() + "\"";
    }

    @Override
    public String visit(JsonNumber number) {
        return String.valueOf(number.getValue());
    }
}

// XML 序列化访问者只需新增一个实现
public class XmlSerializationVisitor implements AstVisitor { /* ... */ }
```

### 24.5.3 静态代码分析

```java
// 代码度量访问者
public class CodeMetricsVisitor implements AstVisitor {
    private int totalLines = 0;
    private int codeLines = 0;
    private int commentLines = 0;
    private int cyclomaticComplexity = 0;

    @Override
    public void visit(IfStatement stmt) {
        cyclomaticComplexity++;  // if 分支增加圈复杂度
        // ... 递归访问子节点
    }

    @Override
    public void visit(WhileStatement stmt) {
        cyclomaticComplexity++;  // 循环也增加复杂度
        // ...
    }

    // 其他语句类型
}

// 复杂度报告
System.out.printf("代码行数: %d, 注释行数: %d, 圈复杂度: %d%n",
    codeLines, commentLines, cyclomaticComplexity);
```

## 24.6 潜在风险与问题

### 24.6.1 添加新元素类型的困难

访问者模式最大的缺陷：添加新的元素类型需要修改所有访问者接口及其实现。

```java
// 当新增 GiftCard 元素时
public class GiftCard implements Item {
    // ... 必须修改 Item 接口？已经不需要了
    // 但是 Visitor 接口需要新增方法
}

// 所有已有的访问者都必须添加 visit(GiftCard) 方法
public interface Visitor {
    double visit(Book book);
    double visit(Electronics electronics);
    double visit(Fruit fruit);
    double visit(GiftCard giftCard);  // 新增！所有实现类都要改
}
```

这就是"可添加操作的灵活性"与"添加新类型的灵活性"之间的对称性——访问者模式选择了前者。

### 24.6.2 破坏封装

访问者需要访问元素内部的私有数据才能工作：

```java
public class VisitBookVisitor implements Visitor {
    @Override
    public double visit(Book book) {
        // 需要访问 Book 的内部细节：
        // getPrice()、getCategory()、getTitle() 等
        // 如果 Book 不想暴露这些细节，访问者就无法工作
        // 要么添加 public getter（破坏封装），
        // 要么使用反射（更糟）
        if ("computer".equals(book.getCategory())) {
            return book.getPrice() * 0.8;
        }
        return book.getPrice() * 0.9;
    }
}
```

### 24.6.3 双分派的调试复杂性

双分派的调用链较难追踪：

```
购物车对象调用 accept(discountVisitor)
  → 遍历 items
    → book.accept(discountVisitor)    // 第一次分派：元素类型
      → discountVisitor.visit(this)   // 第二次分派：访问者类型
        → DiscountVisitor.visit(Book) // 最终执行
```

调试时，开发者需要在"元素->访问者->元素"之间来回跳转，调用栈比普通方法调用深一层。

### 24.6.4 跨元素状态累积

访问者通常需要维护遍历过程中的状态：

```java
public class SizeCalculatorVisitor implements FileSystemVisitor {
    private long totalSize = 0;  // 跨元素累积的状态

    @Override
    public String visit(File file) {
        totalSize += file.getSizeBytes();  // 修改状态
        // 如果忘记重置状态，多次遍历会得到错误结果
        return String.valueOf(file.getSizeBytes());
    }
}
```

在多线程环境下使用带状态的访问者需要格外小心。

### 24.6.5 访问者模式与策略模式的混淆

| 维度 | 访问者模式 | 策略模式 |
|------|-----------|---------|
| 核心问题 | 在不改元素类的前提下添加新操作 | 在多种算法之间切换 |
| 关注点 | 操作的类型分派 | 算法的选择 |
| 数据结构 | 元素结构通常是固定的 | 上下文结构固定 |
| 变化方向 | 操作（访问者）变化 | 算法（策略）变化 |
| 元素参与 | 元素类必须配合（accept方法） | 上下文不关心策略内部 |

## 24.7 优化策略

### 24.7.1 默认访问者模式

使用抽象基类提供默认实现，子类只覆盖需要的方法：

```java
// 默认访问者：所有 visit 方法提供空实现
public abstract class DefaultFileVisitor implements FileSystemVisitor {
    @Override
    public String visit(File file) { return ""; }

    @Override
    public String visit(Directory directory) {
        for (FileSystemNode child : directory.getChildren()) {
            child.accept(this);
        }
        return "";
    }
}

// 具体访问者只关注自己关心的操作
public class SearchByNameVisitor extends DefaultFileVisitor {
    private final String name;

    @Override
    public String visit(File file) {
        if (file.getName().equals(name)) {
            System.out.println("找到文件: " + file.getName());
        }
        return "";
    }
}
```

这样，当新增元素类型时，DefaultVisitor 可以提供默认实现，已有访问者无需修改。

### 24.7.2 适用条件判断

访问者模式在以下条件满足时最合适：

```java
// 适合使用访问者模式的场景特征：
// 1. 元素层次结构稳定（很少添加新类型）
// 2. 操作频繁增加（经常需要新功能）
// 3. 元素类型数量可控（通常不超过10-20种）

// 不适合的场景特征：
// 1. 元素类型经常变化（每季度新增产品类型）
// 2. 操作固定不变（CRUD 操作就够了）
// 3. 元素类型超过30种（访问者接口过于庞大）
```

### 24.7.3 Java 17 密封类 + 模式匹配

Java 17 的密封类和模式匹配提供了访问者模式的现代替代方案：

```java
// 密封类：明确指定所有子类型，编译器知道完整集合
public sealed interface Item permits Book, Electronics, Fruit {
    double getPrice();
}

// Java 17 模式匹配 switch（预览特性）
public double calculateDiscount(Item item) {
    // 编译器可以检查所有分支是否覆盖完整
    // 新增类型时（在 permits 中添加），编译器会提示这里需要修改
    return switch (item) {
        case Book b -> b.getPrice() * 0.9;
        case Electronics e -> e.getPrice() * 0.95;
        case Fruit f -> f.getPrice() * 0.85;
    };
}
```

这种方式不需要访问者模式的双分派机制，直接通过模式匹配简化了代码。但它的缺点是无法扩展——操作必须写在 switch 表达式中，无法独立扩展。

### 24.7.4 构建器模式累积结果

当访问者需要累积复杂结果时，使用 Builder 模式：

```java
public class ReportBuilderVisitor implements HrVisitor {
    private final Report.ReportBuilder builder = Report.builder();

    @Override
    public String visit(Manager manager) {
        builder.addEmployee(
            EmployeeDto.builder()
                .name(manager.getName())
                .role("经理")
                .annualIncome(manager.getSalary() * 12 + manager.getBonus())
                .build()
        );
        return "";
    }

    @Override
    public String visit(Engineer engineer) {
        builder.addEmployee(
            EmployeeDto.builder()
                .name(engineer.getName())
                .role("工程师")
                .skill(engineer.getSkill())
                .annualIncome(engineer.getSalary() * 12 +
                    engineer.getProjectCount() * 2000)
                .build()
        );
        return "";
    }

    public Report build() {
        return builder.build();
    }
}
```

## 24.8 本章小结

访问者模式的核心价值在于**将操作与对象结构分离**，使得在不修改已有类的前提下增加新操作成为可能。其实现依赖于**双分派机制**——通过两次方法调用（元素->访问者，访问者->元素），同时解析调用者的实际类型和参数的实际类型。

选择访问者模式时需牢记：**元素层次结构稳定、操作频繁增加**时使用访问者模式；反之，如果元素类型频繁变化，访问者模式会带来巨大维护成本。Java 17 的密封类和模式匹配提供了更简洁的替代方案，适用于操作不需要独立扩展的场景。
