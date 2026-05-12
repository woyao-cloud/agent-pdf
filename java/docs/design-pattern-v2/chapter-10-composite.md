# 第10章 组合模式（Composite）

**组合模式**（Composite Pattern）是一种结构型设计模式，它将对象组合成树形结构来表示"部分-整体"的层次结构。组合模式让客户端可以统一地对待单个对象（Leaf）和组合对象（Composite），使客户端在处理树形结构时无需区分叶子节点和容器节点。

## 10.1 解决的问题与应用场景

### 10.1.1 问题分析

在开发中，我们经常需要处理树形结构的数据。例如文件系统（文件和目录）、组织架构（员工和部门）、UI 组件树（按钮和容器）、菜单系统（菜单项和子菜单）等。

对于树形结构，叶子节点（如文件）和容器节点（如目录）在客户端看来应该使用统一的接口。如果不使用组合模式，客户端代码需要不断地通过 `instanceof` 判断节点类型：

```java
// 没有组合模式：客户端代码需要区分叶子节点和容器节点
public class ClientWithoutComposite {
    public void printTree(Object node) {
        if (node instanceof File) {
            System.out.println("文件: " + ((File) node).getName());
        } else if (node instanceof Directory) {
            System.out.println("目录: " + ((Directory) node).getName());
            for (Object child : ((Directory) node).getChildren()) {
                printTree(child); // 递归，但类型转换繁琐
            }
        }
    }
}
```

上述代码存在以下问题：

- **类型判断繁琐**：客户端代码需要不断地使用 `instanceof` 判断节点类型。
- **违反开闭原则**：新增节点类型需要修改所有的客户端代码。
- **递归处理困难**：递归调用时类型转换让代码难以维护。
- **接口不统一**：没有统一的接口，每种节点类型的调用方式都不一样。

### 10.1.2 组合模式的解决思路

组合模式通过定义一个统一的 **Component** 接口，让叶子节点（Leaf）和容器节点（Composite）实现相同的接口。容器节点内部维护一个子节点的集合，并通过递归调用实现对子节点的统一操作。

```
Client 只依赖 Component 接口：
  - 对 Leaf 调用 operation() → 叶子节点自己处理
  - 对 Composite 调用 operation() → 递归调用所有子节点的 operation()
```

### 10.1.3 典型应用场景

| 场景 | 叶子节点（Leaf） | 容器节点（Composite） |
|------|-----------------|---------------------|
| 文件系统 | 文件（File） | 目录（Directory） |
| 组织架构 | 员工（Employee） | 部门（Department） |
| UI 组件 | 按钮、文本框（Leaf Widget） | 面板（Panel） |
| 菜单系统 | 菜单项（MenuItem） | 菜单（Menu） |
| XML/HTML DOM | 文本节点 | 元素节点（Element） |
| 数学表达式 | 数字 | 运算符（+, -, ×, ÷） |
| 订单系统 | 单品（SingleItem） | 捆绑包（Bundle） |

## 10.2 实现原理与UML

### 10.2.1 角色分析

| 角色 | 名称 | 职责 |
|------|------|------|
| **Component（组件）** | 抽象接口 | 声明叶子节点和容器节点的公共接口，定义默认行为 |
| **Leaf（叶子节点）** | 叶子对象 | 无子节点，实现 Component 接口的基本行为 |
| **Composite（容器节点）** | 存储子节点的容器 | 维护子节点集合，实现子节点管理方法和业务方法 |
| **Client（客户端）** | 调用者 | 通过 Component 接口操作对象，不区分 Leaf 和 Composite |

### 10.2.2 UML类图

```
                      ┌─────────────────────────────────────┐
                      │        <<interface>>                 │
                      │         Component                    │
                      ├─────────────────────────────────────┤
                      │ + operation(): void                  │
                      │ + add(Component): void               │  ← 可选的
                      │ + remove(Component): void            │  ← 可选的
                      │ + getChild(int): Component           │  ← 可选的
                      └──────────────┬──────────────────┬───┘
                                     │                  │
                          implements │                  │ implements
                                     │                  │
               ┌─────────────────────┴──────┐   ┌──────┴─────────────────────────┐
               │           Leaf             │   │          Composite              │
               │        (叶子节点)            │   │        (容器节点)               │
               ├────────────────────────────┤   ├────────────────────────────────┤
               │                           │   │ - children: List<Component>     │
               │ + operation(): void        │   ├────────────────────────────────┤
               └────────────────────────────┘   │ + operation(): void             │
                                                 │ + add(Component): void          │
                                                 │ + remove(Component): void       │
                                                 │ + getChild(int): Component      │
                                                 └────────────────────────────────┘
```

### 10.2.3 Transparent vs Safe 设计

组合模式有两种设计风格，它们的区别在于子节点管理方法（`add`、`remove`、`getChild`）的放置位置：

| 对比维度 | Transparent（透明方式） | Safe（安全方式） |
|----------|------------------------|-----------------|
| 子节点方法位置 | 定义在 Component 接口中 | 只定义在 Composite 类中 |
| 叶子节点是否有子节点方法 | 有（但通常为空实现或抛异常） | 没有 |
| 客户端代码 | 统一（不需要类型判断） | 需要类型判断（instanceof） |
| 类型安全性 | 低（在叶子节点上调用 add 会出错） | 高（叶子节点没有 add 方法） |
| 推荐程度 | **推荐**（客户端更简单） | 仅在安全性要求极高时使用 |

**透明方式（Transparent）**：所有方法都在 Component 接口中，Leaf 和 Composite 接口完全一致。客户端不需要任何类型判断，但调用 Leaf.add() 会在运行时失败。

**安全方式（Safe）**：Component 只包含业务方法（operation），子节点管理方法只在 Composite 中。类型安全，但客户端需要使用 instanceof 来判断类型。

## 10.3 代码实现

### 10.3.1 透明方式的完整实现（推荐）

透明方式是更常见的组合模式实现。所有的子节点管理方法都放在 Component 接口中。

```java
import java.util.ArrayList;
import java.util.List;

/**
 * Component：组件接口
 * 包含业务操作和子节点管理操作的默认实现
 */
abstract class FileSystemComponent {
    protected String name;

    public FileSystemComponent(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    /**
     * 业务操作：显示文件/目录信息
     */
    public abstract void display(String indent);

    /**
     * 计算大小（字节）
     */
    public abstract long getSize();

    // ===== 子节点管理方法（透明方式：Leaf 也有这些方法） =====

    /**
     * 添加子节点
     * 默认实现：抛出不支持操作异常
     */
    public void add(FileSystemComponent component) {
        throw new UnsupportedOperationException("叶子节点不支持添加操作");
    }

    /**
     * 删除子节点
     */
    public void remove(FileSystemComponent component) {
        throw new UnsupportedOperationException("叶子节点不支持删除操作");
    }

    /**
     * 获取子节点
     */
    public FileSystemComponent getChild(int index) {
        throw new UnsupportedOperationException("叶子节点没有子节点");
    }

    /**
     * 获取子节点数量
     */
    public int getChildCount() {
        return 0;
    }
}

/**
 * Leaf：叶子节点（文件）
 * 没有子节点，实现具体的业务方法
 */
class FileLeaf extends FileSystemComponent {
    private long size; // 文件大小（字节）

    public FileLeaf(String name, long size) {
        super(name);
        this.size = size;
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📄 " + name + " (" + formatSize(size) + ")");
    }

    @Override
    public long getSize() {
        return size;
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        }
        return String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }
}

/**
 * Composite：容器节点（目录）
 * 维护子节点列表，实现子节点管理和业务操作
 */
class DirectoryComposite extends FileSystemComponent {
    private List<FileSystemComponent> children = new ArrayList<>();

    public DirectoryComposite(String name) {
        super(name);
    }

    @Override
    public void add(FileSystemComponent component) {
        children.add(component);
    }

    @Override
    public void remove(FileSystemComponent component) {
        children.remove(component);
    }

    @Override
    public FileSystemComponent getChild(int index) {
        if (index >= 0 && index < children.size()) {
            return children.get(index);
        }
        return null;
    }

    @Override
    public int getChildCount() {
        return children.size();
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📁 " + name + "/ (" + formatSize(getSize()) + ")");
        for (FileSystemComponent child : children) {
            child.display(indent + "    ");
        }
    }

    @Override
    public long getSize() {
        // 递归计算：目录大小 = 所有子节点大小之和
        long totalSize = 0;
        for (FileSystemComponent child : children) {
            totalSize += child.getSize();
        }
        return totalSize;
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        }
        return String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }
}

/**
 * 客户端测试
 */
public class FileSystemCompositeExample {
    public static void main(String[] args) {
        System.out.println("========== 组合模式：文件系统 ==========\n");

        // 构建文件系统树
        // root/
        // ├── docs/
        // │   ├── resume.pdf (2MB)
        // │   ├── notes.txt (5KB)
        // │   └── images/
        // │       ├── photo1.jpg (3MB)
        // │       └── photo2.jpg (4MB)
        // ├── src/
        // │   ├── Main.java (1KB)
        // │   └── Utils.java (2KB)
        // └── README.md (1KB)

        // 创建叶子节点（文件）
        FileLeaf resumePdf = new FileLeaf("resume.pdf", 2 * 1024 * 1024);
        FileLeaf notesTxt = new FileLeaf("notes.txt", 5 * 1024);
        FileLeaf photo1 = new FileLeaf("photo1.jpg", 3 * 1024 * 1024);
        FileLeaf photo2 = new FileLeaf("photo2.jpg", 4 * 1024 * 1024);
        FileLeaf mainJava = new FileLeaf("Main.java", 1024);
        FileLeaf utilsJava = new FileLeaf("Utils.java", 2 * 1024);
        FileLeaf readmeMd = new FileLeaf("README.md", 1024);

        // 创建容器节点（目录）
        DirectoryComposite imagesDir = new DirectoryComposite("images");
        imagesDir.add(photo1);
        imagesDir.add(photo2);

        DirectoryComposite docsDir = new DirectoryComposite("docs");
        docsDir.add(resumePdf);
        docsDir.add(notesTxt);
        docsDir.add(imagesDir);

        DirectoryComposite srcDir = new DirectoryComposite("src");
        srcDir.add(mainJava);
        srcDir.add(utilsJava);

        DirectoryComposite rootDir = new DirectoryComposite("root");
        rootDir.add(docsDir);
        rootDir.add(srcDir);
        rootDir.add(readmeMd);

        // 客户端统一调用：不区分 Leaf 和 Composite
        System.out.println("文件系统结构：");
        rootDir.display("");

        System.out.println("\n=== 统计信息 ===");
        System.out.println("根目录总大小: " + rootDir.getSize() + " bytes");
        System.out.println("文档目录大小: " + docsDir.getSize() + " bytes");
        System.out.println("图片目录大小: " + imagesDir.getSize() + " bytes");

        // 递归搜索：查找所有文件
        System.out.println("\n=== 查找所有 .java 文件 ===");
        searchJavaFiles(rootDir);

        System.out.println("\n=== 验证: 客户端通过 Component 接口统一操作 ===");
        System.out.println("display() 和 getSize() 对 Leaf 和 Composite 完全透明");
        System.out.println("无需 instanceof 判断，无需类型转换");
    }

    /**
     * 递归搜索 Java 文件
     * 客户端代码完全通过 Component 接口操作
     */
    private static void searchJavaFiles(FileSystemComponent component) {
        if (component instanceof DirectoryComposite) {
            for (int i = 0; i < component.getChildCount(); i++) {
                searchJavaFiles(component.getChild(i));
            }
        } else if (component.getName().endsWith(".java")) {
            System.out.println("  " + component.getName());
        }
    }
}
```

### 10.3.2 安全方式的实现

安全方式只在 Composite 类中提供子节点管理方法，Component 接口只包含业务方法。

```java
import java.util.ArrayList;
import java.util.List;

/**
 * Component：组件接口（安全方式）
 * 只包含业务方法，不包含子节点管理方法
 */
interface SafeFileSystemComponent {
    String getName();
    void display(String indent);
    long getSize();
}

/**
 * Leaf：叶子节点（文件）
 */
class SafeFileLeaf implements SafeFileSystemComponent {
    private String name;
    private long size;

    public SafeFileLeaf(String name, long size) {
        this.name = name;
        this.size = size;
    }

    @Override
    public String getName() { return name; }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📄 " + name + " (" + size + " bytes)");
    }

    @Override
    public long getSize() { return size; }
}

/**
 * Composite：容器节点（目录）
 * 子节点管理方法只在这里定义
 */
class SafeDirectoryComposite implements SafeFileSystemComponent {
    private String name;
    private List<SafeFileSystemComponent> children = new ArrayList<>();

    public SafeDirectoryComposite(String name) {
        this.name = name;
    }

    @Override
    public String getName() { return name; }

    // ===== 子节点管理方法（只在 Composite 中） =====

    public void add(SafeFileSystemComponent component) {
        children.add(component);
    }

    public void remove(SafeFileSystemComponent component) {
        children.remove(component);
    }

    public SafeFileSystemComponent getChild(int index) {
        return children.get(index);
    }

    public int getChildCount() {
        return children.size();
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📁 " + name + "/ (" + getSize() + " bytes)");
        for (SafeFileSystemComponent child : children) {
            child.display(indent + "    ");
        }
    }

    @Override
    public long getSize() {
        long total = 0;
        for (SafeFileSystemComponent child : children) {
            total += child.getSize();
        }
        return total;
    }
}

/**
 * 安全方式客户端
 * 注意：客户端需要使用 instanceof 来访问子节点管理方法
 */
class SafeCompositeClient {
    public static void main(String[] args) {
        SafeFileLeaf file1 = new SafeFileLeaf("a.txt", 100);
        SafeFileLeaf file2 = new SafeFileLeaf("b.txt", 200);

        SafeDirectoryComposite dir = new SafeDirectoryComposite("mydir");
        dir.add(file1);
        dir.add(file2);

        // 安全方式的问题：如果需要遍历子节点
        // 客户端必须使用 instanceof
        printAllFiles(dir);
    }

    private static void printAllFiles(SafeFileSystemComponent component) {
        component.display("");

        // 必须使用 instanceof 来判断是否可以遍历子节点
        if (component instanceof SafeDirectoryComposite) {
            SafeDirectoryComposite dir = (SafeDirectoryComposite) component;
            for (int i = 0; i < dir.getChildCount(); i++) {
                printAllFiles(dir.getChild(i));
            }
        }
    }
}
```

### 10.3.3 递归操作：树遍历、筛选、过滤

组合模式的核心优势在于递归操作。以下展示如何在树结构上进行各种递归操作。

```java
import java.util.ArrayList;
import java.util.List;

/**
 * 在组合模式树上的各种递归操作
 */
class TreeOperations {
    /**
     * 递归计算总大小
     */
    public static long calculateTotalSize(FileSystemComponent component) {
        return component.getSize(); // 已经通过递归实现
    }

    /**
     * 递归搜索：按名称查找文件/目录
     */
    public static FileSystemComponent findByName(FileSystemComponent component,
                                                   String targetName) {
        if (component.getName().equals(targetName)) {
            return component;
        }

        // 如果是容器节点，递归搜索子节点
        for (int i = 0; i < component.getChildCount(); i++) {
            FileSystemComponent found = findByName(component.getChild(i), targetName);
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    /**
     * 递归筛选：找出所有大于指定大小的文件
     */
    public static List<FileLeaf> findFilesLargerThan(
            FileSystemComponent component, long minSize) {
        List<FileLeaf> result = new ArrayList<>();

        if (component instanceof FileLeaf) {
            FileLeaf file = (FileLeaf) component;
            if (file.getSize() > minSize) {
                result.add(file);
            }
        }

        // 如果是容器节点，递归处理子节点
        for (int i = 0; i < component.getChildCount(); i++) {
            result.addAll(findFilesLargerThan(component.getChild(i), minSize));
        }

        return result;
    }

    /**
     * 递归统计：按扩展名分组统计文件数量
     */
    public static void countByExtension(FileSystemComponent component,
                                         java.util.Map<String, Integer> counter) {
        if (component instanceof FileLeaf) {
            String name = component.getName();
            int dotIndex = name.lastIndexOf('.');
            if (dotIndex > 0) {
                String ext = name.substring(dotIndex).toLowerCase();
                counter.merge(ext, 1, Integer::sum);
            }
        }

        for (int i = 0; i < component.getChildCount(); i++) {
            countByExtension(component.getChild(i), counter);
        }
    }

    /**
     * 递归打印目录树（带层级前缀）
     */
    public static void printTree(FileSystemComponent component, String prefix,
                                  boolean isLast) {
        System.out.print(prefix);
        System.out.print(isLast ? "└── " : "├── ");
        System.out.println(component.getName());

        for (int i = 0; i < component.getChildCount(); i++) {
            printTree(
                    component.getChild(i),
                    prefix + (isLast ? "    " : "│   "),
                    i == component.getChildCount() - 1
            );
        }
    }

    public static void main(String[] args) {
        // 构建测试树
        DirectoryComposite root = new DirectoryComposite("project");
        DirectoryComposite src = new DirectoryComposite("src");
        DirectoryComposite test = new DirectoryComposite("test");

        root.add(src);
        root.add(test);
        root.add(new FileLeaf("pom.xml", 2048));
        root.add(new FileLeaf("README.md", 512));

        src.add(new FileLeaf("Main.java", 4096));
        src.add(new FileLeaf("Utils.java", 8192));
        src.add(new FileLeaf("Config.java", 1536));

        test.add(new FileLeaf("MainTest.java", 2048));

        // 使用各种递归操作
        System.out.println("=== 目录树 ===");
        printTree(root, "", true);

        System.out.println("\n=== 总大小 ===");
        System.out.println("Total: " + calculateTotalSize(root) + " bytes");

        System.out.println("\n=== 查找大于 2KB 的文件 ===");
        findFilesLargerThan(root, 2048).forEach(
                f -> System.out.println("  " + f.getName() + " (" + f.getSize() + " bytes)")
        );

        System.out.println("\n=== 按扩展名统计 ===");
        java.util.Map<String, Integer> counter = new java.util.HashMap<>();
        countByExtension(root, counter);
        counter.forEach((ext, count) -> System.out.println("  " + ext + ": " + count + " 个文件"));
    }
}
```

### 10.3.4 组织架构树

```java
import java.util.ArrayList;
import java.util.List;

/**
 * Component：组织节点
 */
abstract class OrganizationComponent {
    protected String name;

    public OrganizationComponent(String name) {
        this.name = name;
    }

    public abstract void display(int depth);
    public abstract int getEmployeeCount();
    public abstract double getTotalSalary();

    // 子节点管理（透明方式）
    public void add(OrganizationComponent component) {
        throw new UnsupportedOperationException("不支持添加操作");
    }

    public void remove(OrganizationComponent component) {
        throw new UnsupportedOperationException("不支持删除操作");
    }

    public OrganizationComponent getChild(int index) {
        throw new UnsupportedOperationException("没有子节点");
    }

    public String getName() { return name; }
}

/**
 * Leaf：员工
 */
class Employee extends OrganizationComponent {
    private String position;
    private double salary;

    public Employee(String name, String position, double salary) {
        super(name);
        this.position = position;
        this.salary = salary;
    }

    @Override
    public void display(int depth) {
        String indent = "  ".repeat(depth);
        System.out.println(indent + "👤 " + name + " | " + position + " | 薪资: ¥" + salary);
    }

    @Override
    public int getEmployeeCount() {
        return 1;
    }

    @Override
    public double getTotalSalary() {
        return salary;
    }
}

/**
 * Composite：部门
 */
class Department extends OrganizationComponent {
    private List<OrganizationComponent> members = new ArrayList<>();

    public Department(String name) {
        super(name);
    }

    @Override
    public void add(OrganizationComponent component) {
        members.add(component);
    }

    @Override
    public void remove(OrganizationComponent component) {
        members.remove(component);
    }

    @Override
    public OrganizationComponent getChild(int index) {
        return members.get(index);
    }

    @Override
    public void display(int depth) {
        String indent = "  ".repeat(depth);
        System.out.println(indent + "🏢 " + name + " (人数: " + getEmployeeCount()
                + ", 总薪资: ¥" + getTotalSalary() + ")");
        for (OrganizationComponent member : members) {
            member.display(depth + 1);
        }
    }

    @Override
    public int getEmployeeCount() {
        return members.stream().mapToInt(OrganizationComponent::getEmployeeCount).sum();
    }

    @Override
    public double getTotalSalary() {
        return members.stream().mapToDouble(OrganizationComponent::getTotalSalary).sum();
    }
}

/**
 * 组织架构测试
 */
public class OrganizationCompositeExample {
    public static void main(String[] args) {
        System.out.println("========== 组合模式：组织架构 ==========\n");

        // 构建组织架构树
        Department company = new Department("星辰科技有限公司");

        Department techDept = new Department("技术部");
        Department hrDept = new Department("人力资源部");
        Department financeDept = new Department("财务部");

        company.add(techDept);
        company.add(hrDept);
        company.add(financeDept);

        // 技术部下设小组
        Department backendTeam = new Department("后端组");
        Department frontendTeam = new Department("前端组");
        Department qaTeam = new Department("测试组");

        techDept.add(backendTeam);
        techDept.add(frontendTeam);
        techDept.add(qaTeam);

        // 添加员工
        backendTeam.add(new Employee("张三", "高级工程师", 35000));
        backendTeam.add(new Employee("李四", "工程师", 25000));
        backendTeam.add(new Employee("王五", "实习生", 8000));

        frontendTeam.add(new Employee("赵六", "前端工程师", 28000));
        frontendTeam.add(new Employee("孙七", "前端工程师", 22000));

        qaTeam.add(new Employee("周八", "测试主管", 30000));

        hrDept.add(new Employee("吴九", "HR经理", 28000));
        hrDept.add(new Employee("郑十", "招聘专员", 15000));

        financeDept.add(new Employee("钱十一", "财务主管", 32000));

        // 显示组织架构
        company.display(0);

        System.out.println("\n=== 统计信息 ===");
        System.out.println("公司总人数: " + company.getEmployeeCount() + " 人");
        System.out.println("公司月薪总额: ¥" + company.getTotalSalary());
        System.out.println("技术部人数: " + techDept.getEmployeeCount() + " 人");
        System.out.println("技术部月薪: ¥" + techDept.getTotalSalary());

        // 统一操作验证
        System.out.println("\n=== 验证: 统一接口操作 ===");
        OrganizationComponent emp = new Employee("独立顾问", "顾问", 50000);
        System.out.println("独立顾问: display() → getEmployeeCount() = " + emp.getEmployeeCount());

        OrganizationComponent dept = new Department("新事业部");
        dept.add(new Employee("新人A", "专员", 12000));
        dept.add(new Employee("新人B", "专员", 12000));
        System.out.println("新事业部: display() → getEmployeeCount() = " + dept.getEmployeeCount());
        System.out.println("两个操作通过相同的 Component 接口调用，客户端无需区分");
    }
}
```

## 10.4 JDK/框架源码解析

### 10.4.1 java.awt.Container —— 原生 GUI 组件树

`java.awt.Container` 和 `java.awt.Component` 是 JDK 中最经典的组合模式实现。

```java
import java.awt.*;

/**
 * java.awt.Component 是抽象组件（Component 角色）
 * java.awt.Container 是容器组件，可以包含其他 Component（Composite 角色）
 * java.awt.Button、TextField 等是不能包含子组件的叶子节点（Leaf 角色）
 */
public class AwtCompositeExample {
    public static void main(String[] args) {
        // Container 是 Composite（容器）
        // 可以包含 Component 或其子类
        Frame frame = new Frame("组合模式示例");

        // Button 是 Leaf（叶子节点，不能包含其他组件）
        Button okButton = new Button("确定");
        Button cancelButton = new Button("取消");

        // Panel 是 Composite（容器）
        Panel buttonPanel = new Panel(new FlowLayout());
        buttonPanel.add(okButton); // 向容器添加子组件
        buttonPanel.add(cancelButton);

        // Container 可以嵌套 Container
        Panel mainPanel = new Panel(new BorderLayout());
        mainPanel.add(buttonPanel, BorderLayout.SOUTH);

        // TextField 是 Leaf
        TextField textField = new TextField("请输入文本");
        mainPanel.add(textField, BorderLayout.NORTH);

        // frame 也是一个 Container
        frame.add(mainPanel);
        frame.setSize(400, 300);
        frame.setVisible(true);

        // 递归操作：获取所有组件
        System.out.println("=== 组件树遍历 ===");
        printComponents(frame, "");

        // 验证统一接口
        System.out.println("\n=== 验证 ===");
        System.out.println("Button 和 Panel 都继承自 Component");
        System.out.println("Container.add(Component) 可以接受任何 Component 子类");
        System.out.println("这体现了组合模式：不区分 Leaf 和 Composite");
    }

    /**
     * 递归遍历组件树（组合模式的典型递归操作）
     */
    private static void printComponents(Component comp, String indent) {
        System.out.println(indent + comp.getClass().getSimpleName()
                + " [" + comp.getName() + "]");

        if (comp instanceof Container) {
            Container container = (Container) comp;
            for (Component child : container.getComponents()) {
                printComponents(child, indent + "    ");
            }
        }
    }
}
```

**JDK 源码分析**：

```java
// java.awt.Component（抽象组件）
public abstract class Component {
    // 所有组件的基本操作
    public void paint(Graphics g) { /* ... */ }
    public void setBounds(int x, int y, int width, int height) { /* ... */ }
    // ...
}

// java.awt.Container（容器组件 = Composite）
public class Container extends Component {
    // 子组件列表
    private java.util.List<Component> component = new java.util.ArrayList<>();

    // 子节点管理方法
    public Component add(Component comp) {
        addImpl(comp, null, -1);
        return comp;
    }

    public void remove(Component comp) {
        // 从子组件列表中移除
    }

    public Component getComponent(int n) {
        return component.get(n);
    }

    public int getComponentCount() {
        return component.size();
    }

    // 递归操作：绘制所有子组件
    @Override
    public void paint(Graphics g) {
        for (Component child : component) {
            child.paint(g); // 递归调用子组件的 paint
        }
    }
}

// java.awt.Button（叶子节点）
public class Button extends Component {
    // 没有 add/remove 方法（在 Component 级别也没有定义）
    // 这是安全方式（Safe）的设计
}
```

AWT 使用的是**安全方式**的组合模式：`add()`、`remove()` 等方法只在 `Container` 类中定义，`Button` 等叶子节点没有这些方法。客户端在遍历时需要使用 `instanceof Container` 来判断。

### 10.4.2 java.util.Map.putAll() —— Map 的复合操作

```java
import java.util.*;

public class MapPutAllCompositeExample {
    public static void main(String[] args) {
        System.out.println("=== Map.putAll() 是组合模式 ===");
        System.out.println("Map 是 Component 接口");
        System.out.println("HashMap 是 Leaf（单个 Map）");
        System.out.println("putAll() 操作将一个 Map 合并到另一个 Map\n");

        // 单个 Map 是 Leaf
        Map<String, Integer> sales2023 = new HashMap<>();
        sales2023.put("Q1", 100);
        sales2023.put("Q2", 150);

        // 另一个 Map
        Map<String, Integer> sales2024 = new HashMap<>();
        sales2024.put("Q1", 200);
        sales2024.put("Q2", 250);

        // putAll 是复合操作：将一个 Map 的所有元素添加到另一个
        Map<String, Integer> total = new HashMap<>();
        total.putAll(sales2023); // 复合：total 现在包含 sales2023 的所有键值
        total.putAll(sales2024); // 复合：再加 sales2024

        System.out.println("合并后的销售数据: " + total);

        // Java 9+ Map.of() 创建的不可变 Map
        Map<String, Integer> q3 = Map.of("Q3", 300);
        total.putAll(q3);
        System.out.println("添加 Q3 后: " + total);
    }
}
```

### 10.4.3 Spring CompositeCacheManager

Spring 的 `CompositeCacheManager` 将多个 `CacheManager` 实例组合成一个统一的 `CacheManager`，是组合模式的经典应用。

```java
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.support.CompositeCacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

/**
 * Spring CompositeCacheManager 分析
 *
 * CacheManager 是 Component 接口
 * ConcurrentMapCacheManager 是 Leaf（单个缓存管理器）
 * CompositeCacheManager 是 Composite（组合多个 CacheManager）
 */
public class CompositeCacheManagerExample {
    public static void main(String[] args) {
        // Leaf：独立的缓存管理器
        CacheManager localCache = new ConcurrentMapCacheManager("users", "orders");
        CacheManager remoteCache = new ConcurrentMapCacheManager("products");

        // Composite：组合多个缓存管理器
        CompositeCacheManager composite = new CompositeCacheManager();
        composite.setCacheManagers(java.util.List.of(localCache, remoteCache));
        composite.afterPropertiesSet();

        // 客户端通过统一的 CacheManager 接口操作
        // 实际上 composite 会依次查询每个内部的 CacheManager
        Cache usersCache = composite.getCache("users");
        Cache productsCache = composite.getCache("products");

        System.out.println("=== Spring CompositeCacheManager ===");
        System.out.println("CompositeCacheManager 将多个 CacheManager 组合为一个");
        System.out.println("客户端通过统一的 CacheManager 接口操作");
        System.out.println("无需关心是单个缓存还是复合缓存");
    }
}
```

### 10.4.4 MyBatis MixedSqlNode

MyBatis 中的 `MixedSqlNode` 是组合模式在 SQL 解析中的应用。它包含多个 `SqlNode` 子节点，执行时递归调用所有子节点的 `apply()` 方法。

```java
/**
 * MyBatis 源码简化分析
 *
 * SqlNode 是 Component 接口
 * TextSqlNode、IfSqlNode、WhereSqlNode 等是 Leaf
 * MixedSqlNode 是 Composite（包含多个 SqlNode）
 */
interface SqlNode {
    boolean apply(DynamicContext context);
}

// Leaf：纯文本 SQL 节点
class TextSqlNode implements SqlNode {
    private String text;

    public TextSqlNode(String text) {
        this.text = text;
    }

    @Override
    public boolean apply(DynamicContext context) {
        context.appendSql(text);
        return true;
    }
}

// Leaf：IF 条件节点
class IfSqlNode implements SqlNode {
    private String test;
    private SqlNode contents;

    public IfSqlNode(String test, SqlNode contents) {
        this.test = test;
        this.contents = contents;
    }

    @Override
    public boolean apply(DynamicContext context) {
        if (evaluateBoolean(test)) {
            contents.apply(context); // 条件满足时执行子节点
            return true;
        }
        return false;
    }

    private boolean evaluateBoolean(String test) {
        // 模拟 OGNL 表达式求值
        return true;
    }
}

// Composite：混合 SQL 节点
class MixedSqlNode implements SqlNode {
    private List<SqlNode> contents;

    public MixedSqlNode(List<SqlNode> contents) {
        this.contents = contents;
    }

    @Override
    public boolean apply(DynamicContext context) {
        // 递归调用所有子节点的 apply()
        for (SqlNode node : contents) {
            node.apply(context);
        }
        return true;
    }
}

// 使用方式
class MixedSqlNodeExample {
    public static void main(String[] args) {
        // 构建 SQL 节点树
        List<SqlNode> nodes = new ArrayList<>();
        nodes.add(new TextSqlNode("SELECT * FROM users WHERE 1=1"));
        nodes.add(new IfSqlNode("name != null",
                new TextSqlNode(" AND name = #{name}")));
        nodes.add(new IfSqlNode("age != null",
                new TextSqlNode(" AND age = #{age}")));

        // MixedSqlNode 是 Composite
        SqlNode sqlNode = new MixedSqlNode(nodes);

        // 客户端调用 apply()，不需要知道内部有多少子节点
        DynamicContext context = new DynamicContext();
        sqlNode.apply(context);
    }
}

class DynamicContext {
    private StringBuilder sql = new StringBuilder();

    public void appendSql(String sql) {
        this.sql.append(sql);
    }

    public String getSql() {
        return sql.toString();
    }
}
```

### 10.4.5 javax.faces.component.UIComponent

JavaServer Faces（JSF）中的 `UIComponent` 体系是组合模式在 Web 框架中的应用。

```
UIComponent (抽象组件)
  ├── UIOutput (Leaf：输出文本)
  ├── UIInput (Leaf：输入框)
  ├── UICommand (Leaf：按钮)
  ├── UIPanel (Composite：容器)
  │     ├── HtmlPanelGrid
  │     └── HtmlPanelGroup
  └── UIData (Composite：数据表格)
        └── 包含多个 UIColumn
```

```java
// JSF UIComponent 简化的组合结构
abstract class UIComponent {
    // 子节点管理
    public List<UIComponent> getChildren() { /* ... */ }
    public void getChildren().add(UIComponent child) { /* ... */ }

    // 递归渲染
    public void encodeAll(FacesContext context) {
        encodeBegin(context);     // 渲染开始标签
        for (UIComponent child : getChildren()) {
            child.encodeAll(context); // 递归渲染子组件
        }
        encodeEnd(context);       // 渲染结束标签
    }

    protected abstract void encodeBegin(FacesContext context);
    protected abstract void encodeEnd(FacesContext context);
}

class HtmlPanelGrid extends UIComponent {
    @Override
    protected void encodeBegin(FacesContext context) {
        System.out.println("<table>");
    }
    @Override
    protected void encodeEnd(FacesContext context) {
        System.out.println("</table>");
    }
}

class HtmlOutputText extends UIComponent {
    private String value;

    @Override
    protected void encodeBegin(FacesContext context) {
        System.out.println("<span>" + value + "</span>");
    }
    @Override
    protected void encodeEnd(FacesContext context) {
        // 没有结束标签
    }
}
```

## 10.5 使用场景与案例

### 10.5.1 多级菜单系统

```java
import java.util.ArrayList;
import java.util.List;

/**
 * 菜单组件接口
 */
abstract class MenuComponent {
    protected String name;
    protected String url;

    public MenuComponent(String name, String url) {
        this.name = name;
        this.url = url;
    }

    public abstract void display(String indent);
    public abstract boolean hasChildren();
    public abstract int getItemCount();

    // 子节点管理
    public void add(MenuComponent component) {
        throw new UnsupportedOperationException("菜单项不支持添加");
    }

    public void remove(MenuComponent component) {
        throw new UnsupportedOperationException("菜单项不支持删除");
    }

    public MenuComponent getChild(int index) {
        throw new UnsupportedOperationException("菜单项没有子节点");
    }

    public String getName() { return name; }
    public String getUrl() { return url; }
}

/**
 * 叶子：菜单项
 */
class MenuItem extends MenuComponent {
    public MenuItem(String name, String url) {
        super(name, url);
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "🔗 " + name + " (" + url + ")");
    }

    @Override
    public boolean hasChildren() { return false; }

    @Override
    public int getItemCount() { return 1; }
}

/**
 * 容器：菜单（可包含子菜单或菜单项）
 */
class Menu extends MenuComponent {
    private List<MenuComponent> items = new ArrayList<>();

    public Menu(String name, String url) {
        super(name, url);
    }

    @Override
    public void add(MenuComponent component) {
        items.add(component);
    }

    @Override
    public void remove(MenuComponent component) {
        items.remove(component);
    }

    @Override
    public MenuComponent getChild(int index) {
        return items.get(index);
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📂 " + name + " (" + items.size() + " 项)");
        for (MenuComponent item : items) {
            item.display(indent + "    ");
        }
    }

    @Override
    public boolean hasChildren() { return !items.isEmpty(); }

    @Override
    public int getItemCount() {
        return items.stream().mapToInt(MenuComponent::getItemCount).sum();
    }
}

public class MenuCompositeExample {
    public static void main(String[] args) {
        System.out.println("========== 组合模式：菜单系统 ==========\n");

        // 构建多层菜单
        Menu root = new Menu("首页", "/");

        Menu productMenu = new Menu("产品", "/products");
        productMenu.add(new MenuItem("手机", "/products/phone"));
        productMenu.add(new MenuItem("电脑", "/products/computer"));
        productMenu.add(new MenuItem("平板", "/products/tablet"));

        Menu serviceMenu = new Menu("服务", "/services");
        serviceMenu.add(new MenuItem("售后服务", "/services/after-sale"));
        serviceMenu.add(new MenuItem("技术支持", "/services/support"));

        Menu aboutMenu = new Menu("关于我们", "/about");
        aboutMenu.add(new MenuItem("公司简介", "/about/company"));
        aboutMenu.add(new MenuItem("联系我们", "/about/contact"));

        root.add(productMenu);
        root.add(serviceMenu);
        root.add(aboutMenu);
        root.add(new MenuItem("购物车", "/cart"));

        // 显示
        root.display("");
        System.out.println("\n总菜单项数: " + root.getItemCount());
    }
}
```

### 10.5.2 数学表达式树

数学表达式可以表示为树形结构：操作符是容器节点，数字是叶子节点。

```java
import java.util.ArrayList;
import java.util.List;

/**
 * 数学表达式组件
 */
abstract class Expression {
    public abstract double evaluate();
    public abstract String format();

    public void add(Expression expr) {
        throw new UnsupportedOperationException();
    }
}

/**
 * 叶子：数字
 */
class NumberExpression extends Expression {
    private double value;

    public NumberExpression(double value) {
        this.value = value;
    }

    @Override
    public double evaluate() {
        return value;
    }

    @Override
    public String format() {
        if (value == (long) value) {
            return String.valueOf((long) value);
        }
        return String.valueOf(value);
    }
}

/**
 * 容器：加法
 */
class AddExpression extends Expression {
    private List<Expression> operands = new ArrayList<>();

    public AddExpression(Expression left, Expression right) {
        operands.add(left);
        operands.add(right);
    }

    @Override
    public void add(Expression expr) {
        operands.add(expr);
    }

    @Override
    public double evaluate() {
        return operands.stream().mapToDouble(Expression::evaluate).sum();
    }

    @Override
    public String format() {
        StringBuilder sb = new StringBuilder("(");
        for (int i = 0; i < operands.size(); i++) {
            if (i > 0) sb.append(" + ");
            sb.append(operands.get(i).format());
        }
        sb.append(")");
        return sb.toString();
    }
}

/**
 * 容器：乘法
 */
class MultiplyExpression extends Expression {
    private Expression left;
    private Expression right;

    public MultiplyExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public double evaluate() {
        return left.evaluate() * right.evaluate();
    }

    @Override
    public String format() {
        return "(" + left.format() + " * " + right.format() + ")";
    }
}

public class ExpressionTreeExample {
    public static void main(String[] args) {
        System.out.println("========== 组合模式：表达式树 ==========\n");

        // 构建表达式: (3 + 4) * (5 + 6) + 7
        // 表达式树:
        //        (+)
        //       /   \
        //     (*)    7
        //    /   \
        //  (+)   (+)
        //  / \   / \
        // 3   4 5   6

        Expression expr = new AddExpression(
            new MultiplyExpression(
                new AddExpression(new NumberExpression(3), new NumberExpression(4)),
                new AddExpression(new NumberExpression(5), new NumberExpression(6))
            ),
            new NumberExpression(7)
        );

        System.out.println("表达式: " + expr.format());
        System.out.println("结果: " + expr.evaluate());

        // 验证统一接口
        System.out.println("\n=== 验证: 统一接口 ===");
        Expression num = new NumberExpression(42);
        System.out.println("数字 evaluate() = " + num.evaluate());
        System.out.println("数字 format() = " + num.format());

        Expression add = new AddExpression(new NumberExpression(1), new NumberExpression(2));
        System.out.println("加法 evaluate() = " + add.evaluate());
        System.out.println("加法 format() = " + add.format());
    }
}
```

## 10.6 潜在风险与问题

### 10.6.1 叶子节点的子节点操作问题（透明方式）

在透明方式中，叶子节点也有 `add()`、`remove()` 等方法，但调用时会抛出异常。这违反了"接口隔离原则"——客户端必须处理 `UnsupportedOperationException`。

```java
public class TransparentSafetyIssue {
    public static void main(String[] args) {
        FileSystemComponent file = new FileLeaf("test.txt", 100);

        // 编译没问题，但运行时报错
        try {
            file.add(new FileLeaf("child.txt", 50)); // 抛出异常！
        } catch (UnsupportedOperationException e) {
            System.out.println("运行时异常: " + e.getMessage());
        }

        // 客户端不得不做防御性处理
        if (file instanceof DirectoryComposite) {
            file.add(new FileLeaf("child.txt", 50));
        } else {
            System.out.println("文件无法添加子节点");
        }

        // 如果使用安全方式，编译时就能发现
        // SafeFileLeaf leaf = new SafeFileLeaf("test.txt", 100);
        // leaf.add(new SafeFileLeaf("child.txt", 50)); // 编译错误！
    }
}
```

**选择建议**：
- 如果客户端代码需要大量递归遍历且不想做类型判断 -> 选择透明方式
- 如果类型安全性是首要考虑 -> 选择安全方式

### 10.6.2 子节点类型限制

不是所有组件都能作为任意容器的子节点。例如，一个 `ImageFile` 不应该包含 `SourceCodeFile` 作为子节点。组合模式默认允许任意 Component 作为子节点，这可能导致不合逻辑的树结构。

```java
/**
 * 类型安全的容器：限制子节点类型
 */
class TypedDirectory {
    private List<FileSystemComponent> children = new ArrayList<>();

    /**
     * 类型安全的添加方法
     * 限制只能添加文件，不能添加目录
     */
    public void addFile(FileLeaf file) {
        children.add(file);
    }

    /**
     * 或者添加运行时类型检查
     */
    public void addWithValidation(FileSystemComponent component) {
        // 限制目录嵌套深度或类型
        if (component instanceof FileLeaf) {
            children.add(component);
        } else {
            throw new IllegalArgumentException("该容器只允许添加文件");
        }
    }
}
```

### 10.6.3 深树遍历性能问题

当树的深度很大或节点数量很多时，递归遍历可能导致性能问题甚至栈溢出。

```java
public class DeepTreePerformance {
    // 递归遍历：对深度较大的树可能导致栈溢出
    public static void recursiveTraverse(FileSystemComponent node, int depth) {
        if (depth > 1000) { // 递归深度过大
            // 可能触发 StackOverflowError
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            recursiveTraverse(node.getChild(i), depth + 1);
        }
    }

    // 优化：使用栈替代递归
    public static void iterativeTraverse(FileSystemComponent root) {
        java.util.Stack<FileSystemComponent> stack = new java.util.Stack<>();
        stack.push(root);

        while (!stack.isEmpty()) {
            FileSystemComponent node = stack.pop();
            // 处理节点
            for (int i = node.getChildCount() - 1; i >= 0; i--) {
                stack.push(node.getChild(i));
            }
        }
    }

    // 优化：使用 Stream API（JDK 8+）
    public static void streamTraverse(FileSystemComponent root) {
        java.util.stream.Stream.iterate(
                java.util.Collections.singletonList(root),
                list -> list.stream()
                        .flatMap(node -> {
                            List<FileSystemComponent> children = new ArrayList<>();
                            for (int i = 0; i < node.getChildCount(); i++) {
                                children.add(node.getChild(i));
                            }
                            return children.stream();
                        })
                        .toList(),
                list -> !list.isEmpty()
        ).forEach(list -> list.forEach(node -> {
            // 处理节点
        }));
    }
}
```

### 10.6.4 清理/删除复杂树的困难

删除树中的节点时，可能需要同时清理子节点占用的资源（如文件句柄、数据库连接、内存缓存等）。如果 Leaf 和 Composite 的资源清理方式不同，会增加实现的复杂度。

```java
class ResourceCleaningExample {
    // 安全的删除：递归清理子节点资源
    public static void safeRemove(FileSystemComponent component) {
        if (component instanceof DirectoryComposite) {
            DirectoryComposite dir = (DirectoryComposite) component;
            // 先递归清理子节点
            for (int i = dir.getChildCount() - 1; i >= 0; i--) {
                safeRemove(dir.getChild(i));
            }
        }
        // 清理当前节点
        System.out.println("清理: " + component.getName());
    }
}
```

## 10.7 优化策略

### 10.7.1 选择透明方式还是安全方式

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 大部分代码需要递归遍历树 | 透明方式 | 客户端代码更简洁 |
| 客户端需要频繁添加/移除节点 | 安全方式 | 编译时类型安全 |
| 树的结构在创建后不变 | 透明方式 | 不需要关心 add/remove |
| 框架设计，不确定客户端使用方式 | 透明方式 | 更灵活 |
| 性能敏感场景，避免运行时异常检查 | 安全方式 | 无运行时异常 |

### 10.7.2 使用迭代器模式进行树遍历

```java
import java.util.*;

/**
 * 树的迭代器
 */
class TreeIterator implements Iterator<FileSystemComponent> {
    private Queue<FileSystemComponent> queue = new LinkedList<>();

    public TreeIterator(FileSystemComponent root) {
        queue.offer(root);
    }

    @Override
    public boolean hasNext() {
        return !queue.isEmpty();
    }

    @Override
    public FileSystemComponent next() {
        if (!hasNext()) throw new NoSuchElementException();

        FileSystemComponent current = queue.poll();

        // 广度优先：将子节点加入队列
        for (int i = 0; i < current.getChildCount(); i++) {
            queue.offer(current.getChild(i));
        }

        return current;
    }
}

// 使用迭代器遍历树
class TreeIteratorExample {
    public static void main(String[] args) {
        // 构建树
        DirectoryComposite root = new DirectoryComposite("root");
        DirectoryComposite sub1 = new DirectoryComposite("sub1");
        DirectoryComposite sub2 = new DirectoryComposite("sub2");

        root.add(sub1);
        root.add(sub2);
        sub1.add(new FileLeaf("a.txt", 100));
        sub2.add(new FileLeaf("b.txt", 200));

        // 使用迭代器遍历（不需要递归）
        System.out.println("=== 迭代器遍历树（广度优先）===");
        TreeIterator iterator = new TreeIterator(root);
        while (iterator.hasNext()) {
            FileSystemComponent node = iterator.next();
            System.out.println("  " + node.getName());
        }
    }
}
```

### 10.7.3 缓存计算结果

对于频繁访问的计算结果（如目录总大小、文件数量等），可以使用缓存避免重复遍历。

```java
import java.util.HashMap;
import java.util.Map;

/**
 * 带缓存的容器节点
 */
class CachedDirectory extends FileSystemComponent {
    private List<FileSystemComponent> children = new ArrayList<>();
    private Long cachedSize = null; // 缓存计算的大小
    private boolean dirty = false;  // 脏标记

    public CachedDirectory(String name) {
        super(name);
    }

    @Override
    public void add(FileSystemComponent component) {
        children.add(component);
        dirty = true; // 标记缓存失效
    }

    @Override
    public void remove(FileSystemComponent component) {
        children.remove(component);
        dirty = true;
    }

    @Override
    public long getSize() {
        // 缓存命中且未过期时直接返回
        if (cachedSize != null && !dirty) {
            return cachedSize;
        }

        // 重新计算
        cachedSize = children.stream()
                .mapToLong(FileSystemComponent::getSize)
                .sum();
        dirty = false;
        return cachedSize;
    }

    @Override
    public void display(String indent) {
        System.out.println(indent + "📁 " + name + "/ (缓存大小: " + getSize() + " bytes)");
        for (FileSystemComponent child : children) {
            child.display(indent + "    ");
        }
    }

    @Override
    public int getChildCount() {
        return children.size();
    }

    @Override
    public FileSystemComponent getChild(int index) {
        return children.get(index);
    }
}
```

### 10.7.4 使用 Stream API 进行扁平化操作

```java
import java.util.stream.Stream;

/**
 * Stream API 用于树形结构操作
 */
class TreeStreamOperations {

    /**
     * 将树扁平化为 Stream（广度优先）
     */
    public static Stream<FileSystemComponent> flatten(FileSystemComponent root) {
        return Stream.concat(
                Stream.of(root),
                Stream.iterate(
                        java.util.Collections.singletonList(root),
                        list -> list.stream()
                                .flatMap(node -> {
                                    List<FileSystemComponent> children = new ArrayList<>();
                                    for (int i = 0; i < node.getChildCount(); i++) {
                                        children.add(node.getChild(i));
                                    }
                                    return children.stream();
                                })
                                .toList(),
                        list -> !list.isEmpty()
                ).flatMap(List::stream)
        );
    }

    /**
     * 查找所有大于指定大小的文件
     */
    public static List<FileLeaf> findLargeFiles(FileSystemComponent root, long minSize) {
        return flatten(root)
                .filter(node -> node instanceof FileLeaf)
                .map(node -> (FileLeaf) node)
                .filter(file -> file.getSize() >= minSize)
                .toList();
    }

    /**
     * 计算总大小（使用 Stream）
     */
    public static long totalSize(FileSystemComponent root) {
        return flatten(root)
                .filter(node -> node instanceof FileLeaf)
                .mapToLong(FileSystemComponent::getSize)
                .sum();
    }

    /**
     * 按扩展名分组
     */
    public static Map<String, List<FileLeaf>> groupByExtension(
            FileSystemComponent root) {
        return flatten(root)
                .filter(node -> node instanceof FileLeaf)
                .map(node -> (FileLeaf) node)
                .collect(java.util.stream.Collectors.groupingBy(
                        file -> {
                            String name = file.getName();
                            int dot = name.lastIndexOf('.');
                            return dot > 0 ? name.substring(dot) : "(无扩展名)";
                        }
                ));
    }
}
```

### 10.7.5 组合模式设计决策表

| 条件 | 推荐方案 |
|------|---------|
| 树结构稳定，创建后很少修改 | 透明方式 + 缓存 |
| 树结构动态变化 | 安全方式 + 脏标记缓存 |
| 需要频繁遍历 | 迭代器 + Stream API |
| 深度大（>1000层） | 栈替代递归 |
| 类型安全要求高 | 安全方式 + 泛型约束 |
| 需要限制子节点类型 | 类型安全的 add 方法 |

## 本章小结

本章详细介绍了组合模式（Composite Pattern）：

1. **核心问题**：在树形结构中，客户端需要统一处理叶子节点和容器节点，而不需要区分它们的类型。
2. **解决思路**：定义统一的 Component 接口，Leaf 和 Composite 实现相同的接口，Composite 通过递归调用实现树形操作。
3. **两种设计风格**：透明方式（所有方法在 Component 中）和安全方式（子节点管理方法只在 Composite 中）。
4. **UML结构**：Component、Leaf、Composite、Client 四个角色，树形递归结构。
5. **代码实现**：提供了文件系统、组织架构、表达式树等完整 Java 示例。
6. **递归操作**：总大小计算、文件搜索、扩展名统计、树打印等实用操作。
7. **框架应用**：AWT Container/Component、Spring CompositeCacheManager、MyBatis MixedSqlNode、JSF UIComponent。
8. **使用场景**：菜单系统、XML/HTML DOM、数学表达式树、订单捆绑包。
9. **主要风险**：叶子节点子节点操作的类型安全问题、深树遍历性能、删除清理困难。
10. **优化策略**：迭代器遍历、缓存计算结果、Stream API 扁平化操作、类型安全约束。

**组合模式是处理树形结构的标准方案**。它通过递归组合和统一接口，让客户端代码可以像处理单个对象一样处理复杂的树形结构，是"部分-整体"层次结构的天然表达方式。

---

在下一章中，我们将学习装饰器模式（Decorator Pattern），了解如何动态地给对象添加新的职责。
