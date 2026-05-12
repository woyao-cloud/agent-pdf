# 第11章 装饰器模式（Decorator）

**装饰器模式**（Decorator Pattern）是一种结构型设计模式，它允许在不改变现有对象结构的情况下，动态地向对象添加新的职责和行为。装饰器模式通过**包装**（Wrapper）的方式，将功能附加到对象上，提供了比继承更灵活的扩展方案。

## 11.1 解决的问题与应用场景

### 11.1.1 问题分析：继承的局限

假设我们有一个咖啡店系统，需要为不同种类的咖啡添加各种配料（牛奶、糖、摩卡等）。如果使用继承来实现，会面临**类爆炸**的问题：

```java
// 使用继承：每种组合都需要一个类
class Beverage { /* 基础饮料 */ }
class Espresso extends Beverage { /* 浓缩咖啡 */ }
class HouseBlend extends Beverage { /* 混合咖啡 */ }

// 加牛奶的变体
class EspressoWithMilk extends Espresso { /* 浓缩加奶 */ }
class HouseBlendWithMilk extends HouseBlend { /* 混合加奶 */ }

// 加糖的变体
class EspressoWithSugar extends Espresso { /* 浓缩加糖 */ }
class HouseBlendWithSugar extends HouseBlend { /* 混合加糖 */ }

// 加摩卡的变体
class EspressoWithMocha extends Espresso { /* 浓缩加摩卡 */ }
class HouseBlendWithMocha extends HouseBlend { /* 混合加摩卡 */ }

// 加牛奶和糖的变体
class EspressoWithMilkAndSugar extends EspressoWithMilk { /* 浓缩加奶加糖 */ }
// ... 类的数量呈指数级增长！
```

如果饮料种类有 N 种，配料种类有 M 种，继承方式需要 N x 2^M 个类。当 N=5, M=5 时需要 5 x 32 = 160 个类！

**装饰器模式的思路**：将配料定义为装饰器类，它们包装（wrap）核心饮料对象，在原有价格/描述基础上增加新的价格/描述。

### 11.1.2 装饰器模式的核心思想

装饰器模式的核心是**组合优于继承**：

1. **Component**：定义对象的接口（被装饰者的类型）
2. **ConcreteComponent**：具体组件，可以被装饰
3. **Decorator**：装饰器抽象类，继承 Component，并持有 Component 的引用
4. **ConcreteDecorator**：具体装饰器，实现具体的增强行为

装饰器模式的关键特征：**装饰器和被装饰者类型相同**（`is-a` 关系），**装饰器持有被装饰者的引用**（`has-a` 关系）。

### 11.1.3 典型应用场景

| 场景 | 基础组件 | 装饰器 |
|------|---------|--------|
| 咖啡店定价 | 咖啡（Espresso/HouseBlend） | 配料（Milk/Sugar/Mocha） |
| IO 流处理 | FileInputStream | BufferedInputStream, DataInputStream |
| Web 过滤器 | HttpServletRequest | 安全过滤、日志过滤、压缩过滤 |
| 数据管道 | 数据处理器 | 日志、加密、压缩装饰器 |
| 权限系统 | 基础用户服务 | 角色验证、权限校验、操作审计 |
| 缓存系统 | 数据访问对象 | 缓存装饰器、日志装饰器 |

## 11.2 实现原理与UML

### 11.2.1 角色分析

| 角色 | 名称 | 职责 |
|------|------|------|
| **Component（组件接口）** | 被装饰对象和装饰器的共同接口 | 定义业务方法 |
| **ConcreteComponent（具体组件）** | 可以被装饰的核心对象 | 实现基础业务逻辑 |
| **Decorator（装饰器抽象类）** | 维护 Component 引用 | 实现 Component 接口，将请求转发给 Component |
| **ConcreteDecorator（具体装饰器）** | 具体的增强行为 | 在转发前后添加额外的处理逻辑 |

### 11.2.2 UML类图

```
                     ┌──────────────────────────────────────┐
                     │        <<interface>>                  │
                     │         Component                     │
                     ├──────────────────────────────────────┤
                     │ + operation(): void                   │
                     └──────────────┬──────────────────┬────┘
                                    │                  │
                        implements │                  │ implements
                                    │                  │
               ┌────────────────────┴────┐   ┌───────┴────────────────────────┐
               │   ConcreteComponent     │   │         Decorator              │
               │     (具体组件)            │   │      (装饰器抽象类)             │
               ├─────────────────────────┤   ├────────────────────────────────┤
               │ + operation(): void     │   │ - component: Component         │
               └─────────────────────────┘   ├────────────────────────────────┤
                                             │ + Decorator(Component)         │
                                             │ + operation(): void           │
                                             │   → component.operation()      │
                                             └──────────────┬─────────────────┘
                                                            │ 继承
                                             ┌──────────────┴──────────────────┐
                                             │     ConcreteDecoratorA          │
                                             │      (具体装饰器)                │
                                             ├────────────────────────────────┤
                                             │ + operation(): void            │
                                             │   → 前处理                     │
                                             │   → component.operation()      │
                                             │   → 后处理                     │
                                             └────────────────────────────────┘
```

### 11.2.3 装饰器链

装饰器可以多层嵌套，形成装饰器链：

```
Client → DecoratorC → DecoratorB → DecoratorA → ConcreteComponent
          (最外层)                              (最内层/核心)
```

调用路径：`client.operation()` → `DecoratorC.operation()` → `DecoratorB.operation()` → `DecoratorA.operation()` → `ConcreteComponent.operation()`

### 11.2.4 装饰器模式 vs 继承

| 对比维度 | 继承 | 装饰器模式 |
|----------|------|-----------|
| 扩展方式 | 编译期静态绑定 | 运行期动态绑定 |
| 组合方式 | 所有组合需要预先定义 | 运行时自由组合 |
| 类数量 | N x 2^M（类爆炸） | N + M（线性增长） |
| 透明性 | 客户端需要知道具体子类 | 客户端通过统一接口操作 |
| 开闭原则 | 扩展需要创建新子类 | 通过新装饰器扩展，无需修改现有代码 |
| 灵活性 | 低（固定层次结构） | 高（任意顺序组合） |

## 11.3 代码实现

### 11.3.1 咖啡店定价系统

```java
/**
 * Component：饮料接口
 */
interface Beverage {
    /**
     * 获取饮料描述
     */
    String getDescription();

    /**
     * 计算价格
     */
    double cost();
}

// ===================== 具体组件（核心饮料） =====================

/**
 * 浓缩咖啡
 */
class Espresso implements Beverage {
    @Override
    public String getDescription() {
        return "浓缩咖啡";
    }

    @Override
    public double cost() {
        return 25.0; // 基础价格 25 元
    }
}

/**
 * 混合咖啡
 */
class HouseBlend implements Beverage {
    @Override
    public String getDescription() {
        return "混合咖啡";
    }

    @Override
    public double cost() {
        return 20.0;
    }
}

/**
 * 美式咖啡
 */
class Americano implements Beverage {
    @Override
    public String getDescription() {
        return "美式咖啡";
    }

    @Override
    public double cost() {
        return 22.0;
    }
}

// ===================== 装饰器抽象类 =====================

/**
 * 装饰器抽象类
 * 1. 实现 Beverage 接口（is-a 关系）
 * 2. 持有 Beverage 引用（has-a 关系）
 */
abstract class BeverageDecorator implements Beverage {
    protected Beverage beverage;

    public BeverageDecorator(Beverage beverage) {
        this.beverage = beverage;
    }

    @Override
    public String getDescription() {
        return beverage.getDescription();
    }

    @Override
    public double cost() {
        return beverage.cost();
    }
}

// ===================== 具体装饰器（配料） =====================

/**
 * 牛奶配料
 */
class MilkDecorator extends BeverageDecorator {
    public MilkDecorator(Beverage beverage) {
        super(beverage);
    }

    @Override
    public String getDescription() {
        return beverage.getDescription() + " + 牛奶";
    }

    @Override
    public double cost() {
        return beverage.cost() + 5.0; // 加牛奶加 5 元
    }
}

/**
 * 糖浆配料
 */
class SugarDecorator extends BeverageDecorator {
    public SugarDecorator(Beverage beverage) {
        super(beverage);
    }

    @Override
    public String getDescription() {
        return beverage.getDescription() + " + 糖浆";
    }

    @Override
    public double cost() {
        return beverage.cost() + 3.0; // 加糖加 3 元
    }
}

/**
 * 摩卡配料
 */
class MochaDecorator extends BeverageDecorator {
    public MochaDecorator(Beverage beverage) {
        super(beverage);
    }

    @Override
    public String getDescription() {
        return beverage.getDescription() + " + 摩卡";
    }

    @Override
    public double cost() {
        return beverage.cost() + 8.0; // 加摩卡加 8 元
    }
}

/**
 * 奶油配料
 */
class WhipDecorator extends BeverageDecorator {
    public WhipDecorator(Beverage beverage) {
        super(beverage);
    }

    @Override
    public String getDescription() {
        return beverage.getDescription() + " + 奶油";
    }

    @Override
    public double cost() {
        return beverage.cost() + 4.0;
    }
}

/**
 * 大杯（加量）
 */
class LargeSizeDecorator extends BeverageDecorator {
    public LargeSizeDecorator(Beverage beverage) {
        super(beverage);
    }

    @Override
    public String getDescription() {
        return "大杯 " + beverage.getDescription();
    }

    @Override
    public double cost() {
        return beverage.cost() * 1.3; // 大杯加价 30%
    }
}

// ===================== 客户端测试 =====================

public class CoffeeShopExample {
    public static void main(String[] args) {
        System.out.println("========== 装饰器模式：咖啡店定价系统 ==========\n");

        // === 1. 基础浓缩咖啡 ===
        Beverage espresso = new Espresso();
        System.out.println("基础: " + espresso.getDescription()
                + " = ¥" + String.format("%.1f", espresso.cost()));

        // === 2. 浓缩咖啡 + 牛奶 ===
        Beverage espressoWithMilk = new MilkDecorator(new Espresso());
        System.out.println("加牛奶: " + espressoWithMilk.getDescription()
                + " = ¥" + String.format("%.1f", espressoWithMilk.cost()));

        // === 3. 浓缩咖啡 + 牛奶 + 糖 ===
        Beverage espressoWithMilkAndSugar = new SugarDecorator(
                new MilkDecorator(new Espresso())
        );
        System.out.println("加牛奶+糖: " + espressoWithMilkAndSugar.getDescription()
                + " = ¥" + String.format("%.1f", espressoWithMilkAndSugar.cost()));

        // === 4. 混合咖啡 + 摩卡 + 奶油 ===
        Beverage houseBlendDeluxe = new WhipDecorator(
                new MochaDecorator(new HouseBlend())
        );
        System.out.println("混合豪华: " + houseBlendDeluxe.getDescription()
                + " = ¥" + String.format("%.1f", houseBlendDeluxe.cost()));

        // === 5. 大杯浓缩 + 牛奶 + 摩卡 + 奶油 ===
        Beverage largeEspressoSpecial = new LargeSizeDecorator(
                new WhipDecorator(
                        new MochaDecorator(
                                new MilkDecorator(new Espresso())
                        )
                )
        );
        System.out.println("大杯特制: " + largeEspressoSpecial.getDescription()
                + " = ¥" + String.format("%.1f", largeEspressoSpecial.cost()));

        // === 6. 美式 + 糖 + 牛奶（任意顺序） ===
        Beverade americanoWithSugarMilk =
                new MilkDecorator(new SugarDecorator(new Americano()));
        System.out.println("甜美式: " + americanoWithSugarMilk.getDescription()
                + " = ¥" + String.format("%.1f", americanoWithSugarMilk.cost()));

        // === 装饰器可以任意组合和重复 ===
        Beverage doubleMocha = new MochaDecorator(
                new MochaDecorator(new Espresso())
        );
        System.out.println("双倍摩卡: " + doubleMocha.getDescription()
                + " = ¥" + String.format("%.1f", doubleMocha.cost()));

        // 统计
        System.out.println("\n========== 统计 ==========");
        System.out.println("饮料种类: Espresso, HouseBlend, Americano (3种)");
        System.out.println("配料种类: Milk, Sugar, Mocha, Whip, Large (5种)");
        System.out.println("装饰器模式需要的类: 3 + 5 + 2(接口+抽象类) = 10");
        System.out.println("继承模式需要的类(3种饮料5种配料): 3 x 2^5 = 96");
        System.out.println("装饰器模式减少了 " + (96 - 10) + " 个类！");
    }
}
```

### 11.3.2 数据处理管道

装饰器模式非常适合构建数据处理管道（Pipeline），每个装饰器负责一个独立的数据处理步骤。

```java
/**
 * Component：数据处理接口
 */
interface DataProcessor {
    /**
     * 处理数据
     * @param data 输入数据
     * @return 处理后的数据
     */
    String process(String data);
}

/**
 * 具体组件：基础处理器，不进行任何处理，原样返回
 */
class BaseProcessor implements DataProcessor {
    @Override
    public String process(String data) {
        return data;
    }
}

/**
 * 装饰器抽象类
 */
abstract class DataProcessorDecorator implements DataProcessor {
    protected DataProcessor processor;

    public DataProcessorDecorator(DataProcessor processor) {
        this.processor = processor;
    }

    @Override
    public String process(String data) {
        return processor.process(data);
    }
}

/**
 * 具体装饰器：日志记录
 */
class LoggingDecorator extends DataProcessorDecorator {
    public LoggingDecorator(DataProcessor processor) {
        super(processor);
    }

    @Override
    public String process(String data) {
        System.out.println("[日志] 开始处理数据，长度: " + data.length() + " 字符");
        long startTime = System.currentTimeMillis();

        String result = processor.process(data);

        long elapsed = System.currentTimeMillis() - startTime;
        System.out.println("[日志] 处理完成，耗时: " + elapsed + "ms，"
                + "输入: " + data.length() + " -> 输出: " + result.length());
        return result;
    }
}

/**
 * 具体装饰器：加密处理（Base64 编码）
 */
class EncryptionDecorator extends DataProcessorDecorator {
    public EncryptionDecorator(DataProcessor processor) {
        super(processor);
    }

    @Override
    public String process(String data) {
        System.out.println("[加密] 执行加密...");
        String processed = processor.process(data);
        // 模拟加密：Base64 编码
        String encoded = java.util.Base64.getEncoder().encodeToString(
                processed.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        System.out.println("[加密] 加密完成");
        return encoded;
    }
}

/**
 * 具体装饰器：压缩处理（字符串缩减模拟）
 */
class CompressionDecorator extends DataProcessorDecorator {
    public CompressionDecorator(DataProcessor processor) {
        super(processor);
    }

    @Override
    public String process(String data) {
        System.out.println("[压缩] 执行压缩...");
        String processed = processor.process(data);

        // 模拟压缩：移除连续重复字符
        StringBuilder compressed = new StringBuilder();
        for (int i = 0; i < processed.length(); i++) {
            char c = processed.charAt(i);
            if (i == 0 || c != processed.charAt(i - 1)) {
                compressed.append(c);
            }
        }

        System.out.println("[压缩] 压缩率: "
                + String.format("%.1f%%", (1 - (double) compressed.length() / processed.length()) * 100));
        return compressed.toString();
    }
}

/**
 * 具体装饰器：数据验证
 */
class ValidationDecorator extends DataProcessorDecorator {
    public ValidationDecorator(DataProcessor processor) {
        super(processor);
    }

    @Override
    public String process(String data) {
        System.out.println("[验证] 验证输入数据...");
        if (data == null || data.trim().isEmpty()) {
            throw new IllegalArgumentException("数据不能为空");
        }
        if (data.length() > 10000) {
            throw new IllegalArgumentException("数据过长（超过10000字符）");
        }
        System.out.println("[验证] 验证通过");
        return processor.process(data);
    }
}

/**
 * 具体装饰器：字符过滤（移除特殊字符）
 */
class FilteringDecorator extends DataProcessorDecorator {
    public FilteringDecorator(DataProcessor processor) {
        super(processor);
    }

    @Override
    public String process(String data) {
        System.out.println("[过滤] 过滤特殊字符...");
        String processed = processor.process(data);
        // 移除非字母数字和空格以外的字符
        String filtered = processed.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5\\s]", "");
        System.out.println("[过滤] 移除了 " + (processed.length() - filtered.length()) + " 个特殊字符");
        return filtered;
    }
}

/**
 * 客户端：构建数据处理管道
 */
public class DataPipelineExample {
    public static void main(String[] args) {
        System.out.println("========== 装饰器模式：数据处理管道 ==========\n");

        // 原始数据
        String originalData = "Hello, 世界! 这是一个测试数据!!! "
                + "包含特殊字符@#$%和重复复复字字。"

                + "数据长度约为100个字符。";

        // === 管道1：验证 + 日志（最简单的管道） ===
        System.out.println("--- 管道1：验证 + 日志 ---");
        DataProcessor pipeline1 = new LoggingDecorator(
                new ValidationDecorator(new BaseProcessor())
        );
        String result1 = pipeline1.process(originalData);
        System.out.println("结果: " + result1 + "\n");

        // === 管道2：验证 + 过滤 + 加密 ===
        System.out.println("--- 管道2：验证 + 过滤 + 加密 ---");
        DataProcessor pipeline2 = new EncryptionDecorator(
                new FilteringDecorator(
                        new ValidationDecorator(new BaseProcessor())
                )
        );
        String result2 = pipeline2.process(originalData);
        System.out.println("结果长度: " + result2 + "\n");

        // === 管道3：验证 + 过滤 + 压缩 + 加密 + 日志（完整管道） ===
        System.out.println("--- 管道3：完整处理管道 ---");
        DataProcessor fullPipeline = new LoggingDecorator(
                new EncryptionDecorator(
                        new CompressionDecorator(
                                new FilteringDecorator(
                                        new ValidationDecorator(new BaseProcessor())
                                )
                        )
                )
        );
        String result3 = fullPipeline.process(originalData);
        System.out.println("最终输出: " + result3 + "\n");

        // === 管道可以任意重组 ===
        System.out.println("--- 管道4：压缩后再加密（顺序不同） ---");
        DataProcessor pipeline4 = new EncryptionDecorator(
                new CompressionDecorator(
                        new BaseProcessor()
                )
        );
        String result4a = pipeline4.process("AAABBBCCC");
        System.out.println("先压缩再加密: " + result4a);

        System.out.println("\n--- 管道5：加密后再压缩（相同装饰器不同顺序） ---");
        DataProcessor pipeline5 = new CompressionDecorator(
                new EncryptionDecorator(
                        new BaseProcessor()
                )
        );
        String result5a = pipeline5.process("AAABBBCCC");
        System.out.println("先加密再压缩: " + result5a);

        System.out.println("\n注意：装饰器顺序不同，结果也不同！");
        System.out.println("这验证了装饰器模式的核心特征：运行时动态组合");
    }
}
```

### 11.3.3 简化版本：使用 Java 8 Function 接口

对于简单的装饰场景，Java 8 的 `Function` 接口可以替代完整的装饰器类结构，实现更简洁的链式处理。

```java
import java.util.function.Function;
import java.util.ArrayList;
import java.util.List;

/**
 * 使用 Function 接口实现简单装饰器
 * 适合：装饰逻辑简单，不需要状态维护的场景
 */
public class FunctionDecoratorExample {
    public static void main(String[] args) {
        System.out.println("========== Java 8 Function 装饰器 ==========\n");

        // 定义装饰器（Function 链）
        Function<String, String> baseProcessor = Function.identity();

        Function<String, String> validation = data -> {
            System.out.println("[验证] 数据长度: " + data.length());
            if (data == null || data.trim().isEmpty()) {
                throw new IllegalArgumentException("数据不能为空");
            }
            return data;
        };

        Function<String, String> encryption = data -> {
            System.out.println("[加密] 执行 Base64 编码");
            return java.util.Base64.getEncoder().encodeToString(
                    data.getBytes(java.nio.charset.StandardCharsets.UTF_8)
            );
        };

        Function<String, String> logging = data -> {
            System.out.println("[日志] 处理数据: " + data);
            return data;
        };

        // 组合装饰器：使用 andThen 链式调用
        // 验证 -> 加密 -> 日志
        Function<String, String> pipeline = validation
                .andThen(encryption)
                .andThen(logging);

        // 执行
        String result = pipeline.apply("Hello, Decorator Pattern!");
        System.out.println("\n处理结果: " + result);

        // 另一种组合方式：使用 compose（反向顺序）
        // 日志 -> 验证 -> 加密
        Function<String, String> pipeline2 = logging
                .compose(validation)
                .compose(encryption);

        // 装饰器列表：运行时动态添加/移除
        System.out.println("\n--- 动态装饰器列表 ---");
        List<Function<String, String>> decorators = new ArrayList<>();
        decorators.add(validation);
        decorators.add(encryption);
        decorators.add(logging);

        // 合并所有装饰器
        Function<String, String> dynamicPipeline = decorators.stream()
                .reduce(Function.identity(), Function::andThen);

        String dynamicResult = dynamicPipeline.apply("动态装饰器链");
        System.out.println("动态结果: " + dynamicResult);
    }
}
```

## 11.4 JDK/框架源码解析（IO流）

### 11.4.1 java.io.InputStream 体系 —— 最经典的装饰器应用

Java I/O 流是装饰器模式最经典、最完整的应用。整个 `InputStream` 层次结构就是一个装饰器模式的教育范本。

```
┌────────────────────────────────────────────────────────────────┐
│                    InputStream (抽象组件)                        │
│                    java.io.InputStream                          │
├────────────────────────────────────────────────────────────────┤
│  + read(): int                                                  │
│  + read(byte[] b, int off, int len): int                        │
│  + skip(long n): long                                           │
│  + available(): int                                             │
│  + close(): void                                                │
└────────────────────────────────────────────────────────────────┘
        ▲                               ▲
        │                               │
        │ 继承                           │ 继承
┌───────┴───────────────┐   ┌───────────┴───────────────────────┐
│  FileInputStream      │   │  FilterInputStream (装饰器抽象类)   │
│  (ConcreteComponent)  │   │  (Decorator)                       │
│  从文件读取字节         │   ├───────────────────────────────────┤
└───────────────────────┘   │  protected InputStream in;         │
                            └───────────┬───────────────────────┘
                                        │ 继承
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
       ┌────────┴──────┐      ┌────────┴──────┐      ┌────────┴──────┐
       │ BufferedInput │      │ DataInput     │      │ GZIPInput     │
       │ Stream        │      │ Stream        │      │ Stream        │
       │ (添加缓冲)     │      │ (添加基本类型  │      │ (添加解压)     │
       └───────────────┘      │  读取能力)     │      └───────────────┘
                              └───────────────┘
```

```java
import java.io.*;
import java.util.zip.GZIPInputStream;

/**
 * Java I/O 装饰器模式分析
 */
public class IoDecoratorAnalysis {
    public static void main(String[] args) throws Exception {
        System.out.println("========== Java I/O 装饰器模式分析 ==========\n");

        // === 基础组件：FileInputStream（ConcreteComponent） ===
        // 从文件读取原始字节
        InputStream fileIn = new FileInputStream("test.dat");
        System.out.println("1. FileInputStream: 从文件读取原始字节");

        // === 装饰器1：BufferedInputStream（ConcreteDecorator） ===
        // 添加缓冲功能，提升读取性能
        InputStream bufferedIn = new BufferedInputStream(fileIn);
        System.out.println("2. + BufferedInputStream: 添加缓冲");

        // === 装饰器2：DataInputStream（ConcreteDecorator） ===
        // 添加读取基本类型（int、double、UTF字符串等）的能力
        DataInputStream dataIn = new DataInputStream(bufferedIn);
        System.out.println("3. + DataInputStream: 添加基本类型读取能力");

        // 客户端通过 DataInputStream 读取数据
        // 实际底层是：DataInputStream -> BufferedInputStream -> FileInputStream
        int intValue = dataIn.readInt();
        double doubleValue = dataIn.readDouble();
        String strValue = dataIn.readUTF();
        System.out.println("   读取结果: int=" + intValue
                + ", double=" + doubleValue + ", str=" + strValue);

        dataIn.close();

        // === 更复杂的装饰器链 ===
        System.out.println("\n--- 高级装饰器链 ---");

        // 从 GZIP 压缩文件中读取加密数据
        InputStream complexIn = new DataInputStream(
                new BufferedInputStream(
                        new GZIPInputStream(
                                new FileInputStream("data.gz")
                        )
                )
        );
        System.out.println("装饰器链: DataInputStream -> BufferedInputStream -> GZIPInputStream -> FileInputStream");
        System.out.println("每个装饰器添加一个能力：解压 + 缓冲 + 基本类型读取");

        // 装饰器的灵活性：不同顺序产生不同的链
        InputStream chain1 = new BufferedInputStream(
                new DataInputStream(
                        new FileInputStream("test.dat")
                )
        );
        // 与上面不同：先 DataInputStream 再缓冲
        // DataInputStream 的 readInt() 等是逐字节读取的，BufferedInputStream 放在外面会减少 I/O 次数

        complexIn.close();
    }
}
```

### 11.4.2 Writer/Reader 装饰器链

```java
import java.io.*;

public class WriterDecoratorExample {
    public static void main(String[] args) throws Exception {
        System.out.println("========== Writer 装饰器链 ==========\n");

        // 构建最经典的 Writer 装饰器链
        // PrintWriter -> BufferedWriter -> OutputStreamWriter -> FileOutputStream

        // 1. FileOutputStream: 底层字节输出（ConcreteComponent）
        FileOutputStream fos = new FileOutputStream("output.txt");

        // 2. OutputStreamWriter: 字节->字符的桥梁适配器
        OutputStreamWriter osw = new OutputStreamWriter(fos, "UTF-8");

        // 3. BufferedWriter: 添加缓冲（装饰器）
        BufferedWriter bw = new BufferedWriter(osw);

        // 4. PrintWriter: 添加方便的打印方法（装饰器）
        PrintWriter pw = new PrintWriter(bw);

        // 客户端通过最外层的 PrintWriter 操作
        pw.println("Hello, 装饰器模式!");
        pw.println("这是通过多层装饰器写入的内容");
        pw.printf("格式化输出: %s = %d%n", "数量", 100);

        pw.close();

        // 读取验证
        BufferedReader br = new BufferedReader(
                new InputStreamReader(
                        new FileInputStream("output.txt"), "UTF-8"
                )
        );
        String line;
        while ((line = br.readLine()) != null) {
            System.out.println("读取: " + line);
        }
        br.close();

        System.out.println("\n=== 装饰器链分析 ===");
        System.out.println("PrintWriter: 提供便捷的 print/println/printf 方法");
        System.out.println("BufferedWriter: 提供缓冲，减少 I/O 次数");
        System.out.println("OutputStreamWriter: 将字节流适配为字符流（适配器+装饰器）");
        System.out.println("FileOutputStream: 最终写入文件的字节流");
    }
}
```

### 11.4.3 javax.servlet.http.HttpServletRequestWrapper

Servlet API 中的 `HttpServletRequestWrapper` 是装饰器模式在 Web 开发中的应用。

```java
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;

/**
 * HttpServletRequestWrapper 是装饰器
 * 它实现了 HttpServletRequest 接口，并持有被包装的请求对象
 */

/**
 * 自定义装饰器：添加 XSS 过滤功能
 */
class XssFilterRequestWrapper extends HttpServletRequestWrapper {
    public XssFilterRequestWrapper(HttpServletRequest request) {
        super(request);
    }

    @Override
    public String getParameter(String name) {
        String value = super.getParameter(name);
        // 对参数值进行 XSS 过滤
        return filterXss(value);
    }

    @Override
    public String[] getParameterValues(String name) {
        String[] values = super.getParameterValues(name);
        if (values == null) {
            return null;
        }
        // 对所有参数值进行 XSS 过滤
        String[] filtered = new String[values.length];
        for (int i = 0; i < values.length; i++) {
            filtered[i] = filterXss(values[i]);
        }
        return filtered;
    }

    @Override
    public String getHeader(String name) {
        String value = super.getHeader(name);
        return filterXss(value);
    }

    /**
     * 简单的 XSS 过滤
     */
    private String filterXss(String value) {
        if (value == null) return null;
        // 移除脚本标签
        value = value.replaceAll("<script[^>]*>.*?</script>", "");
        // 转义 HTML 特殊字符
        value = value.replace("&", "&amp;")
                     .replace("<", "&lt;")
                     .replace(">", "&gt;")
                     .replace("\"", "&quot;")
                     .replace("'", "&#x27;");
        return value;
    }
}

/**
 * 自定义装饰器：添加请求日志功能
 */
class LoggingRequestWrapper extends HttpServletRequestWrapper {
    public LoggingRequestWrapper(HttpServletRequest request) {
        super(request);
    }

    @Override
    public String getParameter(String name) {
        String value = super.getParameter(name);
        System.out.println("[请求日志] 参数: " + name + " = " + value);
        return value;
    }
}

/**
 * 在 Filter 中使用装饰器（Servlet 3.0+）
 */
// @WebFilter("/*")
// public class RequestDecoratorFilter implements Filter {
//     @Override
//     public void doFilter(ServletRequest request, ServletResponse response,
//                          FilterChain chain) throws IOException, ServletException {
//         HttpServletRequest httpRequest = (HttpServletRequest) request;
//
//         // 使用装饰器包装原始请求
//         HttpServletRequest decorated = new XssFilterRequestWrapper(
//                 new LoggingRequestWrapper(httpRequest)
//         );
//
//         // 将装饰后的请求传给后续 filter 和 servlet
//         chain.doFilter(decorated, response);
//     }
// }

public class RequestWrapperAnalysis {
    public static void main(String[] args) {
        System.out.println("========== HttpServletRequestWrapper 分析 ==========\n");
        System.out.println("HttpServletRequestWrapper 是装饰器模式的应用：");
        System.out.println("- 实现 HttpServletRequest 接口（is-a）");
        System.out.println("- 持有被包装的 HttpServletRequest 对象（has-a）");
        System.out.println("- 可以任意叠加多个 Wrapper 实现不同功能");
        System.out.println("- 典型应用：XSS过滤、日志记录、参数改写、压缩");
    }
}
```

### 11.4.4 Spring TransactionAwareCacheDecorator

Spring 框架中的 `TransactionAwareCacheDecorator` 为缓存操作添加了事务感知能力。

```java
import org.springframework.cache.Cache;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;

/**
 * TransactionAwareCacheDecorator 分析
 *
 * 这是一个装饰器：在 Cache 操作上添加事务同步
 */
public class CacheDecoratorAnalysis {
    public static void main(String[] args) {
        System.out.println("========== TransactionAwareCacheDecorator 分析 ==========\n");

        // 假设有一个基础缓存
        // Cache underlyingCache = new ConcurrentMapCache("users");

        // 通过装饰器添加事务感知能力
        // Cache txAwareCache = new TransactionAwareCacheDecorator(underlyingCache);

        // 使用方式不变
        // txAwareCache.put("user_1", userData);
        // txAwareCache.get("user_1", User.class);

        System.out.println("TransactionAwareCacheDecorator 在 Cache.put() 前后：");
        System.out.println("1. 检查当前是否存在事务");
        System.out.println("2. 如果有事务，延迟缓存操作直到事务提交");
        System.out.println("3. 如果事务回滚，自动撤销缓存操作");
        System.out.println("这完全符合装饰器模式：不修改 Cache 接口，动态添加新行为");
    }
}
```

### 11.4.5 Collections.synchronizedXxx / unmodifiableXxx

`java.util.Collections` 类中的 `synchronizedList`、`unmodifiableList` 等方法返回的其实是装饰器。

```java
import java.util.*;

public class CollectionsDecoratorExample {
    public static void main(String[] args) {
        System.out.println("========== Collections.synchronizedXxx / unmodifiableXxx ==========\n");

        // 基础列表（ConcreteComponent）
        List<String> baseList = new ArrayList<>(Arrays.asList("A", "B", "C"));

        // 装饰器1：添加同步能力（线程安全）
        List<String> syncList = Collections.synchronizedList(baseList);

        // 装饰器2：添加不可修改能力（只读）
        List<String> unmodifiableList = Collections.unmodifiableList(syncList);

        // 或者组合使用：
        // List<String> safeList = Collections.unmodifiableList(
        //         Collections.synchronizedList(new ArrayList<>())
        // );

        System.out.println("原始列表: " + baseList);
        System.out.println("同步装饰器: 所有方法都加了 synchronized");
        System.out.println("不可修改装饰器: add/remove/set 抛出 UnsupportedOperationException");

        try {
            unmodifiableList.add("D"); // 抛出异常
        } catch (UnsupportedOperationException e) {
            System.out.println("尝试修改不可修改列表: " + e.getMessage());
        }

        // 修改原始列表会影响装饰器？
        baseList.add("D");
        System.out.println("修改原始列表后的同步列表: " + syncList);
        System.out.println("修改原始列表后的不可修改列表: " + unmodifiableList);

        System.out.println("\n注意: synchronizedList 和 unmodifiableList 返回的是视图（View）");
        System.out.println("它们不复制数据，而是包装原始列表，这是典型的装饰器模式");
    }
}
```

## 11.5 使用场景与案例

### 11.5.1 动态折扣引擎

```java
import java.util.ArrayList;
import java.util.List;

/**
 * Component：订单价格计算接口
 */
interface PriceCalculator {
    double calculate(double originalPrice);
    String getDescription();
}

/**
 * 具体组件：原始价格
 */
class OriginalPrice implements PriceCalculator {
    @Override
    public double calculate(double originalPrice) {
        return originalPrice;
    }

    @Override
    public String getDescription() {
        return "原价";
    }
}

/**
 * 装饰器抽象类
 */
abstract class DiscountDecorator implements PriceCalculator {
    protected PriceCalculator calculator;

    public DiscountDecorator(PriceCalculator calculator) {
        this.calculator = calculator;
    }

    @Override
    public double calculate(double originalPrice) {
        return calculator.calculate(originalPrice);
    }
}

/**
 * 会员折扣
 */
class MemberDiscountDecorator extends DiscountDecorator {
    private String memberLevel;

    public MemberDiscountDecorator(PriceCalculator calculator, String memberLevel) {
        super(calculator);
        this.memberLevel = memberLevel;
    }

    @Override
    public double calculate(double originalPrice) {
        double priceAfterPrevious = calculator.calculate(originalPrice);
        double discountRate = getMemberDiscountRate();
        double discounted = priceAfterPrevious * discountRate;
        System.out.println("[会员折扣] " + memberLevel + " 会员: "
                + priceAfterPrevious + " x " + discountRate + " = " + discounted);
        return discounted;
    }

    @Override
    public String getDescription() {
        return calculator.getDescription() + " -> 会员折扣";
    }

    private double getMemberDiscountRate() {
        switch (memberLevel) {
            case "钻石": return 0.7;  // 7折
            case "黄金": return 0.8;  // 8折
            case "白银": return 0.9;  // 9折
            default: return 0.95;     // 普通会员95折
        }
    }
}

/**
 * 优惠券折扣
 */
class CouponDiscountDecorator extends DiscountDecorator {
    private String couponCode;
    private double discountAmount;

    public CouponDiscountDecorator(PriceCalculator calculator,
                                    String couponCode, double discountAmount) {
        super(calculator);
        this.couponCode = couponCode;
        this.discountAmount = discountAmount;
    }

    @Override
    public double calculate(double originalPrice) {
        double priceAfterPrevious = calculator.calculate(originalPrice);
        double discounted = Math.max(0, priceAfterPrevious - discountAmount);
        System.out.println("[优惠券] " + couponCode + " 减免 ¥" + discountAmount
                + ": " + priceAfterPrevious + " -> " + discounted);
        return discounted;
    }

    @Override
    public String getDescription() {
        return calculator.getDescription() + " -> 优惠券";
    }
}

/**
 * 季节性促销
 */
class SeasonalPromoDecorator extends DiscountDecorator {
    private double discountRate;

    public SeasonalPromoDecorator(PriceCalculator calculator, double discountRate) {
        super(calculator);
        this.discountRate = discountRate;
    }

    @Override
    public double calculate(double originalPrice) {
        double priceAfterPrevious = calculator.calculate(originalPrice);
        double discounted = priceAfterPrevious * discountRate;
        System.out.println("[季节促销] " + (int)(discountRate * 100) + "折: "
                + priceAfterPrevious + " -> " + discounted);
        return discounted;
    }

    @Override
    public String getDescription() {
        return calculator.getDescription() + " -> 季节促销";
    }
}

/**
 * 满减活动
 */
class FullReductionDecorator extends DiscountDecorator {
    private double threshold;
    private double reduction;

    public FullReductionDecorator(PriceCalculator calculator,
                                   double threshold, double reduction) {
        super(calculator);
        this.threshold = threshold;
        this.reduction = reduction;
    }

    @Override
    public double calculate(double originalPrice) {
        double priceAfterPrevious = calculator.calculate(originalPrice);
        if (priceAfterPrevious >= threshold) {
            double discounted = priceAfterPrevious - reduction;
            System.out.println("[满减] 满 ¥" + threshold + " 减 ¥" + reduction
                    + ": " + priceAfterPrevious + " -> " + discounted);
            return discounted;
        }
        return priceAfterPrevious;
    }

    @Override
    public String getDescription() {
        return calculator.getDescription() + " -> 满减";
    }
}

public class DiscountEngineExample {
    public static void main(String[] args) {
        System.out.println("========== 装饰器模式：动态折扣引擎 ==========\n");

        double originalPrice = 1000.0; // 商品原价 1000 元

        // === 场景1：普通用户，无任何优惠 ===
        PriceCalculator noDiscount = new OriginalPrice();
        System.out.println("原价: ¥" + noDiscount.calculate(originalPrice));

        // === 场景2：白银会员 + 满200减50 ===
        System.out.println("\n--- 场景2：白银会员 + 满200减50 ---");
        PriceCalculator scenario2 = new FullReductionDecorator(
                new MemberDiscountDecorator(new OriginalPrice(), "白银"),
                200, 50
        );
        double finalPrice2 = scenario2.calculate(originalPrice);
        System.out.println("最终价格: ¥" + String.format("%.2f", finalPrice2));

        // === 场景3：黄金会员 + 优惠券100元 ===
        System.out.println("\n--- 场景3：黄金会员 + 优惠券100元 ---");
        PriceCalculator scenario3 = new CouponDiscountDecorator(
                new MemberDiscountDecorator(new OriginalPrice(), "黄金"),
                "COUPON_100", 100
        );
        double finalPrice3 = scenario3.calculate(originalPrice);
        System.out.println("最终价格: ¥" + String.format("%.2f", finalPrice3));

        // === 场景4：钻石会员 + 优惠券200 + 季节促销8折（最优惠组合） ===
        System.out.println("\n--- 场景4：钻石会员 + 优惠券200 + 季节促销8折 ---");
        PriceCalculator scenario4 = new SeasonalPromoDecorator(
                new CouponDiscountDecorator(
                        new MemberDiscountDecorator(new OriginalPrice(), "钻石"),
                        "VIP_200", 200
                ),
                0.8
        );
        double finalPrice4 = scenario4.calculate(originalPrice);
        System.out.println("最终价格: ¥" + String.format("%.2f", finalPrice4));

        // === 场景5：不同顺序会导致不同结果！ ===
        System.out.println("\n--- 重要：装饰器顺序影响结果 ---");
        // 先会员折扣，再满减
        PriceCalculator order1 = new FullReductionDecorator(
                new MemberDiscountDecorator(new OriginalPrice(), "黄金"),
                200, 50
        );
        System.out.println("先会员(8折)再满减(200-50): ¥"
                + String.format("%.2f", order1.calculate(1000)));

        // 先满减，再会员折扣
        PriceCalculator order2 = new MemberDiscountDecorator(
                new FullReductionDecorator(new OriginalPrice(), "黄金"),
                200, 50
        );
        System.out.println("先满减(200-50)再会员(8折): ¥"
                + String.format("%.2f", order2.calculate(1000)));
    }
}
```

### 11.5.2 缓存装饰器

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Component：数据访问接口
 */
interface DataAccessor<T> {
    T get(String key);
    void put(String key, T value);
    void delete(String key);
}

/**
 * 具体组件：数据库访问
 */
class DatabaseAccessor implements DataAccessor<String> {
    @Override
    public String get(String key) {
        System.out.println("[数据库] 查询: " + key);
        // 模拟数据库查询
        return "data_for_" + key;
    }

    @Override
    public void put(String key, String value) {
        System.out.println("[数据库] 写入: " + key + " = " + value);
    }

    @Override
    public void delete(String key) {
        System.out.println("[数据库] 删除: " + key);
    }
}

/**
 * 缓存装饰器
 */
class CachingDecorator implements DataAccessor<String> {
    private final DataAccessor<String> delegate;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public CachingDecorator(DataAccessor<String> delegate) {
        this.delegate = delegate;
    }

    @Override
    public String get(String key) {
        // 先查缓存
        String cached = cache.get(key);
        if (cached != null) {
            System.out.println("[缓存] 命中: " + key);
            return cached;
        }
        // 缓存未命中，查询数据库
        System.out.println("[缓存] 未命中: " + key + "，查询数据源");
        String value = delegate.get(key);
        cache.put(key, value);
        return value;
    }

    @Override
    public void put(String key, String value) {
        delegate.put(key, value);
        cache.put(key, value); // 更新缓存
        System.out.println("[缓存] 更新: " + key);
    }

    @Override
    public void delete(String key) {
        delegate.delete(key);
        cache.remove(key); // 清除缓存
        System.out.println("[缓存] 清除: " + key);
    }
}

/**
 * 日志装饰器
 */
class LoggingAccessorDecorator implements DataAccessor<String> {
    private final DataAccessor<String> delegate;

    public LoggingAccessorDecorator(DataAccessor<String> delegate) {
        this.delegate = delegate;
    }

    @Override
    public String get(String key) {
        long start = System.currentTimeMillis();
        String result = delegate.get(key);
        System.out.println("[访问日志] get(" + key + ") 耗时: "
                + (System.currentTimeMillis() - start) + "ms");
        return result;
    }

    @Override
    public void put(String key, String value) {
        delegate.put(key, value);
        System.out.println("[访问日志] put(" + key + ", " + value + ")");
    }

    @Override
    public void delete(String key) {
        delegate.delete(key);
        System.out.println("[访问日志] delete(" + key + ")");
    }
}

public class CacheDecoratorExample {
    public static void main(String[] args) {
        System.out.println("========== 缓存 + 日志 装饰器 ==========\n");

        // 构建装饰器链：日志 -> 缓存 -> 数据库
        DataAccessor<String> dataAccessor = new LoggingAccessorDecorator(
                new CachingDecorator(
                        new DatabaseAccessor()
                )
        );

        // 客户端使用完全相同的接口
        System.out.println("--- 第一次查询 (缓存未命中) ---");
        String data1 = dataAccessor.get("user_1");
        System.out.println("结果: " + data1);

        System.out.println("\n--- 第二次查询 (缓存命中) ---");
        String data2 = dataAccessor.get("user_1");
        System.out.println("结果: " + data2);

        System.out.println("\n--- 写入操作 ---");
        dataAccessor.put("user_2", "new_data");

        System.out.println("\n--- 删除操作 ---");
        dataAccessor.delete("user_1");

        System.out.println("\n=== 结论 ===");
        System.out.println("通过装饰器，我们在不修改 DatabaseAccessor 的情况下");
        System.out.println("透明地添加了缓存和日志功能，客户端代码完全不变。");
    }
}
```

## 11.6 潜在风险与问题

### 11.6.1 很多小类

装饰器模式将每个增强行为封装为独立的类。如果装饰器数量很多，会导致大量的小类，增加项目文件数量和代码理解难度。

```java
// 如果有 20 种增强行为，就需要 20 个装饰器类
class LoggingDecorator { /* ... */ }
class CachingDecorator { /* ... */ }
class ValidationDecorator { /* ... */ }
class EncryptionDecorator { /* ... */ }
class CompressionDecorator { /* ... */ }
class RateLimitingDecorator { /* ... */ }
class RetryDecorator { /* ... */ }
class TimeoutDecorator { /* ... */ }
// ... 20 个类
```

**优化方案**：
- 将逻辑相似的装饰器合并（例如，将日志相关的多个装饰器合并为一个）
- 使用 Java 8 Function 接口简化简单装饰器
- 考虑是否可以将装饰器行为合并到被装饰对象中

### 11.6.2 装饰器顺序依赖

装饰器之间的顺序可能影响最终结果，这在某些场景下是严重的问题。

```java
public class DecorationOrderDependency {
    public static void main(String[] args) {
        // 问题：加密后再压缩 与 压缩后再加密 结果完全不同
        // 顺序1：加密 -> 压缩
        // 结果：数据先变成密文，再压缩（压缩效果差，因为密文随机性高）
        DataProcessor order1 = new CompressionDecorator(
                new EncryptionDecorator(new BaseProcessor())
        );
        String r1 = order1.process("AAAAABBBBBCCCCC");
        System.out.println("加密->压缩: " + r1); // 压缩效果差

        // 顺序2：压缩 -> 加密
        // 结果：数据先压缩，再加密（压缩效果好）
        DataProcessor order2 = new EncryptionDecorator(
                new CompressionDecorator(new BaseProcessor())
        );
        String r2 = order2.process("AAAAABBBBBCCCCC");
        System.out.println("压缩->加密: " + r2); // 压缩效果好

        // 关键问题：某些组合是无意义的或错误的
        // 先加密后压缩 -> Web 安全传输（常见）
        // 先压缩后加密 -> 存储优化（常见）
        // 但两者不可互换！
    }
}
```

**解决方案**：
- 明确文档化装饰器的预期顺序
- 在装饰器构造时验证顺序合法性
- 提供 Builder 模式来强制正确的顺序

### 11.6.3 深度嵌套的调试困难

多层装饰器嵌套会导致调用栈很深，调试和错误追踪变得困难。

```
装饰器链调用栈（7层装饰器）：
at LoggingDecorator.process()
at EncryptionDecorator.process()
at CompressionDecorator.process()
at ValidationDecorator.process()
at FilteringDecorator.process()
at CachingDecorator.process()
at RetryDecorator.process()
at BaseProcessor.process()
// 7 层嵌套，发生异常时难以定位是哪一层
```

**优化方案**：
- 每层装饰器添加唯一的标识
- 在日志中包含装饰器名称
- 限制装饰器嵌套深度（建议不超过 5 层）

### 11.6.4 类型标识丢失

`decoratedObject.getClass()` 返回的是装饰器的类，而不是原始组件的类。这可能导致依赖具体类型的代码出现问题。

```java
public class TypeIdentityLoss {
    public static void main(String[] args) {
        Beverage espresso = new Espresso();

        // 装饰后
        Beverage decorated = new MilkDecorator(
                new SugarDecorator(espresso)
        );

        // 类型信息丢失
        System.out.println("原始类型: " + espresso.getClass().getSimpleName());
        System.out.println("装饰后类型: " + decorated.getClass().getSimpleName());

        // instanceof 检查也会受影响
        System.out.println("装饰后 instanceof Espresso: "
                + (decorated instanceof Espresso)); // false

        // equals() 也需要考虑装饰器影响
        Beverage order1 = new MilkDecorator(new Espresso());
        Beverage order2 = new MilkDecorator(new Espresso());
        System.out.println("相同装饰的 equals: " + order1.equals(order2));
        // 需要正确实现 equals() 来比较装饰器链的内容
    }
}
```

**解决方案**：
- 不依赖具体类型的 `getClass()` 和 `instanceof`
- 在 Component 接口中定义 `equals()` 和 `hashCode()`，基于内容而非类型
- 如果必须获取原始组件，可以提供 `getWrapped()` 方法

### 11.6.5 equals/hashCode 问题

```java
/**
 * 装饰器中的 equals/hashCode 处理
 */
abstract class ProperDecorator implements Beverage {
    protected Beverage beverage;

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        ProperDecorator that = (ProperDecorator) obj;
        // 比较装饰器链的内容
        return beverage.equals(that.beverage);
    }

    @Override
    public int hashCode() {
        // 基于被装饰对象计算 hashCode
        return getClass().hashCode() ^ beverage.hashCode();
    }
}
```

## 11.7 优化策略

### 11.7.1 使用 Java 8 Function 简化

对于简单的单方法装饰器，Java 8 的 `Function` 接口可以大幅简化代码。

```java
import java.util.function.Function;

/**
 * Java 8 Function 装饰器链
 */
class SimpleFunctionDecorator {
    public static void main(String[] args) {
        // 定义基础功能
        Function<String, String> base = Function.identity();

        // 定义装饰器（每个装饰器就是一个 Function）
        Function<String, String> encrypt = s -> {
            System.out.println("[加密] " + s);
            return java.util.Base64.getEncoder().encodeToString(
                    s.getBytes(java.nio.charset.StandardCharsets.UTF_8)
            );
        };

        Function<String, String> compress = s -> {
            System.out.println("[压缩] " + s);
            return s.replaceAll("(.)\\1+", "$1"); // 去重
        };

        Function<String, String> log = s -> {
            System.out.println("[日志] 处理: " + s);
            return s;
        };

        // 组合装饰器链
        Function<String, String> pipeline = log
                .andThen(encrypt)
                .andThen(compress);

        // 执行
        String result = pipeline.apply("Hello World!!!");
        System.out.println("结果: " + result);
    }
}
```

### 11.7.2 Builder 模式构建装饰器链

对于复杂的装饰器组合，使用 Builder 模式来确保正确的装饰顺序。

```java
/**
 * 装饰器链 Builder
 */
class DataProcessorBuilder {
    private DataProcessor processor = new BaseProcessor();
    private List<String> appliedDecorators = new ArrayList<>();

    private DataProcessorBuilder() {}

    public static DataProcessorBuilder start() {
        return new DataProcessorBuilder();
    }

    public DataProcessorBuilder withValidation() {
        processor = new ValidationDecorator(processor);
        appliedDecorators.add("Validation");
        return this;
    }

    public DataProcessorBuilder withLogging() {
        processor = new LoggingDecorator(processor);
        appliedDecorators.add("Logging");
        return this;
    }

    public DataProcessorBuilder withEncryption() {
        processor = new EncryptionDecorator(processor);
        appliedDecorators.add("Encryption");
        return this;
    }

    public DataProcessorBuilder withCompression() {
        processor = new CompressionDecorator(processor);
        appliedDecorators.add("Compression");
        return this;
    }

    public DataProcessorBuilder withFiltering() {
        processor = new FilteringDecorator(processor);
        appliedDecorators.add("Filtering");
        return this;
    }

    public DataProcessor build() {
        System.out.println("[Builder] 装饰器链: " + String.join(" -> ", appliedDecorators));
        return processor;
    }
}

// 使用 Builder
class BuilderUsage {
    public static void main(String[] args) {
        DataProcessor pipeline = DataProcessorBuilder.start()
                .withValidation()
                .withFiltering()
                .withCompression()
                .withEncryption()
                .withLogging()
                .build();

        String result = pipeline.process("Hello Builder Pattern!!!");
        System.out.println("结果: " + result);
    }
}
```

### 11.7.3 限制装饰器嵌套深度

```java
/**
 * 带深度限制的装饰器
 */
class DepthLimitedDecorator extends DataProcessorDecorator {
    private static final int MAX_DEPTH = 5;
    private final int depth;

    public DepthLimitedDecorator(DataProcessor processor) {
        super(processor);
        this.depth = calculateDepth(processor) + 1;
        if (this.depth > MAX_DEPTH) {
            throw new IllegalArgumentException(
                    "装饰器嵌套深度不能超过 " + MAX_DEPTH
                    + " 层（当前: " + this.depth + " 层）");
        }
    }

    private int calculateDepth(DataProcessor processor) {
        if (processor instanceof DepthLimitedDecorator) {
            return ((DepthLimitedDecorator) processor).depth;
        }
        return 0;
    }

    @Override
    public String process(String data) {
        System.out.println("[深度 " + depth + "] 处理中...");
        return processor.process(data);
    }
}
```

### 11.7.4 equals 基于 Component 接口

```java
/**
 * 基于组件内容的 equals/hashCode
 */
abstract class ContentBasedDecorator implements Beverage {
    protected Beverage beverage;

    // 基于描述内容比较而非类型
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Beverage)) return false;
        Beverage that = (Beverage) o;
        return Objects.equals(this.getDescription(), that.getDescription())
                && Double.compare(this.cost(), that.cost()) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(getDescription(), cost());
    }

    // 提供获取最内层组件的方法
    public Beverage getCoreComponent() {
        if (beverage instanceof ContentBasedDecorator) {
            return ((ContentBasedDecorator) beverage).getCoreComponent();
        }
        return beverage;
    }
}
```

### 11.7.5 装饰器使用决策表

| 条件 | 推荐方案 |
|------|---------|
| 装饰逻辑简单（单方法） | Java 8 Function 接口 |
| 装饰逻辑复杂（多方法、有状态） | 完整装饰器类 |
| 需要保证装饰顺序 | Builder 模式 |
| 装饰器数量多（>10） | 考虑合并或使用替代方案 |
| 动态增减装饰器 | Function 列表 |
| 框架设计（如 I/O 流） | 完整装饰器层次结构 |
| 性能敏感 | 限制嵌套深度（<=3层） |
| 装饰器和被装饰者必须保持同一类型 | 装饰器实现相同接口 |

## 本章小结

本章详细介绍了装饰器模式（Decorator Pattern）：

1. **核心问题**：继承导致类爆炸，在运行时无法动态添加新职责。
2. **解决思路**：通过组合方式，用装饰器包装核心对象，在转发调用的前后添加新行为。
3. **核心特征**：装饰器"既是 Component（is-a），又持有 Component（has-a）"。
4. **UML结构**：Component、ConcreteComponent、Decorator、ConcreteDecorator 四个角色。
5. **代码实现**：提供了咖啡店定价、数据处理管道、Java 8 Function 三种实现方式。
6. **框架应用**：java.io.InputStream 体系、HttpServletRequestWrapper、Spring TransactionAwareCacheDecorator、Collections.synchronizedXxx。
7. **使用场景**：动态折扣引擎、缓存装饰器、日志装饰器、数据管道。
8. **主要风险**：大量小类、顺序依赖问题、深度嵌套调试困难、类型标识丢失、equals/hashCode 问题。
9. **优化策略**：Java 8 Function 简化、Builder 模式构建链、限制嵌套深度、基于内容的 equals。

**装饰器模式是"组合优于继承"原则的最佳诠释**。它让你能够在不修改现有代码的情况下，以极灵活的方式组合各种功能。Java I/O 流的设计充分证明了装饰器模式在实际工程中的价值——通过简单的装饰器组合，即可实现任意复杂度的数据流处理能力。

---

在下一章中，我们将学习外观模式（Facade Pattern），了解如何为复杂子系统提供统一的简化接口。
