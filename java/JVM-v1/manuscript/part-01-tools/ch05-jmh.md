# 第5章 JMH：Java 微基准测试框架

> 前三章我们介绍了 JFR、async-profiler 和 Arthas 等诊断工具，它们擅长回答"系统正在做什么"。但还有一个更基础的问题需要回答："这段代码到底有多快？" 直觉和猜测在性能领域往往不可靠，而普通的 `System.currentTimeMillis()` 测试又充满了陷阱。JMH（Java Microbenchmark Harness）正是解决这个问题的科学工具。

## 5.1 为什么需要 JMH

### 5.1.1 朴素基准测试的问题

假设你想比较 `ArrayList` 和 `LinkedList` 的随机访问性能，最直观的写法是这样的：

```java
long start = System.nanoTime();
list.get(size / 2);
long end = System.nanoTime();
System.out.println("耗时: " + (end - start) + " ns");
```

这段代码的问题在于——**它测量的几乎不是你想测量的东西**。原因包括：

1. **JIT 编译**：Java 是混合执行语言，代码先解释执行，达到阈值后触发 JIT 编译。第一次运行和第十万次运行的速度可能相差数十倍
2. **死代码消除**：编译器发现 `list.get()` 的返回值没有被使用，可能直接将整段代码优化掉
3. **循环优化**：如果把单个操作放在 `for` 循环中测量，JIT 可能会对循环进行展开、向量化等优化
4. **GC 停顿**：测试过程中发生 GC 会引入数十毫秒的延迟，污染结果
5. **系统噪声**：操作系统线程调度、CPU 频率缩放、缺页中断等都会引入随机误差

### 5.1.2 JMH 的定位

JMH（Java Microbenchmark Harness）是 OpenJDK 官方推出的微基准测试框架，由 JIT 专家 Aleksey Shipilev 领导开发。它的设计目标是**让 Java 微基准测试变得科学**：

- 自动处理 JIT 预热和编译
- 防止编译器优化掉被测代码
- 提供 Fork 隔离机制，消除不同测试间的干扰
- 自动收集统计结果，计算误差区间
- 支持多种测量模式：吞吐量、平均时间、采样时间等

JMH 是 JDK 源码级别的工具，在 `openjdk/jdk` 仓库的 `test/micro` 目录中，JDK 自身的性能回归测试就是用 JMH 编写的。这意味着 JDK 的每一个版本都在用 JMH 验证其性能。

### 5.1.3 JMH 与前三章工具的对比

| 特性 | JMH | JFR | async-profiler | Arthas |
|------|-----|-----|----------------|--------|
| 测量目标 | 代码段的极限吞吐/延迟 | 全系统运行时数据 | CPU/内存热点 | 在线诊断 |
| 使用阶段 | 开发/测试 | 生产 | 生产 | 生产 |
| 对被测试代码的影响 | 可忽略 | <1% | <1% | <1% |
| 结果精度 | 纳秒级（受控环境） | 微秒级 | 微秒级 | 毫秒级 |
| 能否防编译器优化 | 能（Blackhole） | 不适用 | 不适用 | 不适用 |

---

## 5.2 JMH 环境搭建

### 5.2.1 依赖配置

JMH 的官方推荐集成方式是通过 Maven 或 Gradle。在本书配套的案例项目中，通过在父 POM 中统一声明 JMH 版本来管理依赖：

```xml
<properties>
    <jmh.version>1.37</jmh.version>
</properties>
```

子模块的 `pom.xml` 中引入 JMH。本章的 `ch05-jmh` 模块是一个独立可执行的 JMH 基准测试项目：

```xml
<dependencies>
    <dependency>
        <groupId>org.openjdk.jmh</groupId>
        <artifactId>jmh-core</artifactId>
        <version>${jmh.version}</version>
    </dependency>
    <dependency>
        <groupId>org.openjdk.jmh</groupId>
        <artifactId>jmh-generator-annprocess</artifactId>
        <version>${jmh.version}</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

`jmh-core` 是框架核心，`jmh-generator-annprocess` 是注解处理器——它在编译时读取 `@Benchmark` 等注解，自动生成基准测试的桩代码（BenchmarkStub），这样就不需要手写样板代码。注意它的 `scope` 是 `provided`，意味着它只在编译期使用，打包时可排除。

### 5.2.2 Shade 插件配置

JMH 通常以可执行的 JAR 包形式运行，通过 `maven-shade-plugin` 将 JMH 框架和被测代码打包为一个 fat JAR：

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.5.1</version>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals><goal>shade</goal></goals>
                    <configuration>
                        <transformers>
                            <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                <mainClass>org.openjdk.jmh.Main</mainClass>
                            </transformer>
                        </transformers>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

这里的 `mainClass` 设置为 `org.openjdk.jmh.Main`，这是 JMH 框架的入口类。执行 `mvn clean package` 后，会生成一个包含所有依赖的可执行 JAR。

### 5.2.3 编译与运行

```bash
cd jvm-lab/cases/ch05-jmh
mvn clean package              # 编译并打包 fat JAR
java -jar target/ch05-jmh.jar  # 运行所有基准测试
```

如果要运行特定的 Benchmark 类，可以在命令行指定：

```bash
java -jar target/ch05-jmh.jar .*ListBenchmark.*
```

JMH 支持通配符匹配，`.` 匹配任何字符，`*` 匹配任意数量。上面的命令只会运行 `ListBenchmark` 中的测试方法，而不运行模块中的其他 Benchmark 类（如果有的话）。

---

## 5.3 核心注解

### 5.3.1 @Benchmark

`@Benchmark` 是最基础的注解，标注在方法上，告诉 JMH 该方法是一个基准测试方法：

```java
@Benchmark
public String arrayListGet() {
    return arrayList.get(size / 2);
}
```

被 `@Benchmark` 标注的方法必须满足以下约束：

- 方法必须是 `public` 的
- 方法不能是 `static` 的（除非你明确知道自己在做什么）
- 方法可以有参数（如 `Blackhole`、`State` 对象），但不能有普通 Java 参数
- 返回类型任意，但如果返回值没有被 JMH 消费（如返回一个 `int` 但不使用），可能触发死代码消除

一个类中可以有多个 `@Benchmark` 方法，JMH 会自动发现并运行它们。

### 5.3.2 @BenchmarkMode

`@BenchmarkMode` 指定测量模式，它决定 JMH 收集什么类型的指标：

```java
@BenchmarkMode(Mode.Throughput) // 测量吞吐量
```

JMH 支持以下几种模式：

| 模式 | 含义 | 适用场景 |
|------|------|----------|
| `Mode.Throughput` | 吞吐量：单位时间内完成的操作次数 | 批处理、数据处理 |
| `Mode.AverageTime` | 平均耗时：每次操作的平均时间 | API 延迟、RPC 调用 |
| `Mode.SampleTime` | 采样时间：统计每次操作的耗时分布 | 需要了解延迟分布（p50/p90/p99） |
| `Mode.SingleShotTime` | 单次执行时间：每次执行一次操作 | 冷启动、类加载 |
| `Mode.All` | 同时运行以上所有模式 | 全面评估 |

`Throughput` 和 `AverageTime` 是互补关系——前者是"多快"（ops/s），后者是"多久"（ns/op）。对于一个批处理系统，你更关心吞吐量；对于一个用户请求处理，你更关心平均耗时。

### 5.3.3 @OutputTimeUnit

`@OutputTimeUnit` 指定结果输出的时间单位：

```java
@OutputTimeUnit(TimeUnit.SECONDS) // 吞吐量输出为 ops/s
@OutputTimeUnit(TimeUnit.NANOSECONDS) // 平均耗时输出为 ns/op
```

对于 `Mode.Throughput`，建议使用 `TimeUnit.SECONDS`（输出为 ops/s）。对于 `Mode.AverageTime`，建议使用 `TimeUnit.NANOSECONDS` 或 `TimeUnit.MICROSECONDS`。

### 5.3.4 @State

`@State` 定义基准测试中使用的共享或隔离状态。JMH 根据 `Scope` 决定状态的创建和共享范围：

```java
@State(Scope.Thread) // 每个工作线程拥有独立的状态副本
```

JMH 定义了三种作用域：

| 作用域 | 语义 | 适用场景 |
|--------|------|----------|
| `Scope.Thread` | 每个线程独享一个实例 | 线程安全的数据结构、无需同步的测试数据 |
| `Scope.Benchmark` | 所有线程共享同一个实例 | 需要模拟多线程并发访问的数据结构 |
| `Scope.Group` | 同一组内的线程共享一个实例 | 读多写少的场景 |

**使用场景分析：**

`Scope.Thread` 是最常用的模式。在 `ListBenchmark` 中，每个工作线程都有自己的 `arrayList` 和 `linkedList` 副本，因此不需要同步。这确保了测量结果反映的是 `List` 操作的性能，而不是锁竞争的开销。

`Scope.Benchmark` 用于测量并发数据结构在多线程下的行为。例如，你想测试 `ConcurrentHashMap` 在 8 个线程并发 put 时的吞吐量，就需要让所有线程共享同一个 `ConcurrentHashMap` 实例。

被 `@State` 标注的类可以包含 `@Setup` 和 `@TearDown` 方法，它们将分别在基准测试开始前和结束后执行：

```java
@State(Scope.Thread)
public class ListBenchmark {

    private List<String> arrayList;
    private List<String> linkedList;

    @Setup
    public void setup() {
        arrayList = new ArrayList<>();
        linkedList = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            arrayList.add("item-" + i);
            linkedList.add("item-" + i);
        }
    }

    @TearDown
    public void tearDown() {
        arrayList = null;
        linkedList = null;
    }
}
```

`@Setup` 和 `@TearDown` 还支持指定执行级别：

- `Level.Trial`：在整个基准测试运行前后执行一次
- `Level.Iteration`：在每次迭代前后执行（每个 iteration 包含多轮 invocation）
- `Level.Invocation`：在每次方法调用前后执行（性能开销较大，谨慎使用）

### 5.3.5 @Param

`@Param` 允许在 Benchmark 中声明参数，JMH 会自动为每个参数值生成独立的测试：

```java
@Param({"1000", "10000"})
private int size;
```

当 `size` 取 `1000` 和 `10000` 两个值时，JMH 会分别运行两轮完整的 Warmup + Measurement 流程。`@Param` 注解的字段必须是 `String` 类型（JMH 会自动转换为字段的实际类型），且字段必须是 `@State` 类中的非 `final` 字段。

`@Param` 的威力在于——你可以在构建时声明参数组合，JMH 自动进行全组合测试。例如，同时声明 `@Param({"1000", "10000"}) int size` 和 `@Param({"ArrayList", "LinkedList"}) String listType`，JMH 会产生 `2 x 2 = 4` 种组合，每个组合独立运行。

### 5.3.6 @Warmup 与 @Measurement

这两个注解控制基准测试的执行阶段：

```java
@Warmup(iterations = 3, time = 2)   // 3 轮预热，每轮 2 秒
@Measurement(iterations = 5, time = 3) // 5 轮测量，每轮 3 秒
```

**Warmup（预热阶段）：**

预热的核心目的是让 JVM 达到稳定状态。在预热过程中，JIT 编译器会逐步将热点代码编译为机器码，缓存系统也会填满。预热阶段的数据不会被记录到最终结果中。

预热轮数（iterations）和时间（time）的选择取决于代码的复杂度和 JIT 编译策略。对于简单的微操作（如 `list.get()`），3 轮预热通常足够。对于方法体较大或涉及多层调用的代码，可能需要 5-10 轮预热。

**Measurement（测量阶段）：**

预热结束后进入测量阶段，此阶段的数据会被汇总计算。测量轮数和时间的乘积决定了总采样量。5 轮 x 3 秒 = 15 秒的总测量时间通常能提供足够的样本。

**如何判断预热是否充分：**

JMH 支持在运行结果中查看预热进度。如果测量阶段的性能数据仍然在趋势性变化（持续上升或下降），说明预热轮数不足，需要增加。一个更好的做法是通过 `-wi`（warmup iterations）和 `-i`（measurement iterations）命令行参数临时调整，找到合适的值后再修改注解。

---

## 5.4 防止编译器优化

这是 JMH 最核心的价值之一。Java 编译器和 JIT 编译器非常"聪明"，它们会在不改变程序语义的前提下，尽可能消除"无效"代码。但恰好是这种"聪明"会毁掉微基准测试的正确性。

### 5.4.1 死代码消除（Dead Code Elimination）

考虑下面的代码：

```java
@Benchmark
public void arrayListGet() {
    arrayList.get(size / 2); // 返回值被丢弃！
}
```

JIT 编译器发现 `arrayList.get()` 的返回值没有被任何代码使用，于是它可能直接**删除整条语句**——因为从语义上看，没有副作用的未使用结果就是死代码。删除之后，基准测试变成了"测量一个空方法的速度"，结果毫无意义。

### 5.4.2 Blackhole 消费

JMH 提供了 `Blackhole` 类来"消费"方法的返回值，让编译器无法消除它：

```java
@Benchmark
public void arrayListGet(Blackhole bh) {
    bh.consume(arrayList.get(size / 2));
}
```

`Blackhole.consume()` 的内部实现通过一些巧妙的技巧（比如将值写入一个不会被优化的内部字段），告诉 JIT 编译器"这个值是有用的"，从而阻止死代码消除。但它本身的开消极小（纳秒级），不会显著污染测量结果。

**使用建议：**

- 如果 Benchmark 方法有返回值，JMH 默认会通过 Blackhole 消费它
- 但如果返回多个值，或者方法返回 `void` 但产生了有意义的副作用，需要显式使用 `Blackhole`
- 一个 `Blackhole` 可以多次调用 `consume()`，用于消化多个结果

### 5.4.3 常量折叠与循环优化

常量折叠（Constant Folding）是编译器将编译期可确定的表达式提前计算好的优化。例如：

```java
@Benchmark
public int constantFold() {
    return Math.pow(2, 10); // 编译器可能直接替换为 1024
}
```

JMH 通过在 `@State` 中声明字段，确保所有输入值对编译器来说都不是常量：

```java
@State(Scope.Thread)
public class MyBenchmark {
    private int a = 2;
    private int b = 10;

    @Benchmark
    public int noFold() {
        return (int) Math.pow(a, b); // 编译器无法确定 a 和 b 的值
    }
}
```

但需要小心——如果 `a` 和 `b` 在 `@Setup` 中被赋值，且赋值逻辑简单（如 `a = 2; b = 10;`），JIT 仍然可能通过内联和常量传播推导出它们的值。一个更保险的做法是从外部不可预知的数据源初始化状态，比如 `System.nanoTime()` 的末几位：

```java
@Setup
public void setup() {
    a = 2 + ((int) System.nanoTime() % 1); // 编译器无法内联 nanoTime()
    b = 10 + ((int) System.nanoTime() % 1);
}
```

对于循环优化，JMH 的 Fork 机制是最有效的对抗手段（见 5.5.3 节），因为每个 Fork 的 JVM 实例都是全新的，编译器无法跨 Fork 做 profile-guided 优化。

---

## 5.5 常见陷阱

### 5.5.1 在循环中写 Benchmark

**错误做法：**

```java
@Benchmark
public void wrongLoop() {
    for (int i = 0; i < 1000; i++) {
        list.get(i);
    }
}
```

这段代码的问题在于，它测量的是"循环 + 1000 次 get 操作"的总性能，而不是单次 `get` 的性能。更严重的是，JIT 可能对循环进行展开（loop unrolling）和向量化（vectorization），导致单次迭代的实际行为与独立调用完全不同。

**正确做法：**

让 Benchmark 方法体只包含单个被测操作，通过 JMH 的 `@Measurement(time = N)` 让框架来控制调用次数。框架会在测量时间内反复调用 Benchmark 方法，然后统计总调用次数：

```java
@Benchmark
public String correctGet() {
    return list.get(size / 2); // 只做一次操作
}
```

### 5.5.2 在 @Setup 中引入预热偏差

如果 `@Setup` 方法执行了复杂的初始化逻辑（如加载文件、建立网络连接），这些操作的耗时可能会影响 JVM 的编译策略：

```java
@Setup
public void setup() {
    // 错误：在预热前执行了耗时的操作
    arrayList = loadLargeDatasetFromFile("/data/million.csv");
}
```

**解决方案：** 将初始化操作放在 `@Setup(Level.Trial)` 中，使其在所有预热和测量之前只执行一次；或者直接在类构造器中完成。更稳妥的做法是预先生成测试数据，在 Benchmark 启动之前就准备好。

### 5.5.3 Fork 隔离

Fork 是 JMH 最重要的隔离机制。当设置 `@Fork(1)` 时，JMH 会为每个 Benchmark 方法启动一个全新的 JVM 进程：

```java
@Fork(1) // 每个 Benchmark 方法在一个独立的 JVM 中运行
```

**Fork 解决了哪些问题：**

1. **Profile pollution**：前一个 Benchmark 的执行会影响 JIT 的 profiling 数据，使得后一个 Benchmark 的编译决策被"污染"
2. **代码缓存空间**：JIT 编译器的 Code Cache 是有限的，前一个 Benchmark 的编译代码可能挤占后一个的空间
3. **类加载状态**：某些类加载时会有额外的初始化开销，Fork 确保每个 Benchmark 从"干净"状态开始

**Fork 数量选择：**

- `@Fork(1)`：每个方法运行一次，适合快速验证
- `@Fork(3)`：每个方法运行 3 次，取结果的平均值和误差，适合发布级别的结果
- `@Fork(0)`：不 Fork，在当前 JVM 中运行，仅用于调试（结果不可信）

Fork 的开销是每次启动一个新 JVM 需要几百毫秒到几秒。对于 `@Fork(3)` + 多个 Benchmark 方法的情况，总运行时间可能达到数分钟。

### 5.5.4 忽略 GC 影响

如果在 Benchmark 执行过程中发生了 GC STW（Stop-The-World）暂停，测量结果会被严重扭曲。JMH 提供了一些机制来处理 GC：

```java
@Fork(jvmArgsAppend = {
    "-Xms2g", "-Xmx2g",      // 固定堆大小，避免扩容
    "-XX:+UseG1GC",           // 指定 GC 算法
    "-XX:ConcGCThreads=4"     // 控制 GC 线程数
})
```

**推荐的 GC 控制策略：**

1. **固定堆大小**：`-Xms` 和 `-Xmx` 设为相同值，避免堆自动扩容导致的额外开销
2. **增加堆空间**：更大的堆意味着更少的 GC 频率
3. **控制分配速率**：如果 Benchmark 方法创建了大量临时对象，考虑让每个 invocation 的对象分配量小于 Eden 区大小

需要注意的是，JMH 提供了 `-gc` 命令行选项，可以在每次迭代之间强制调用 `System.gc()`。但 **不推荐** 在生产测试中使用此选项，因为强制 GC 并不能真实反映生产环境的 GC 行为。

---

## 5.6 结果解读

### 5.6.1 典型输出格式

运行 `ListBenchmark` 后，JMH 输出类似如下的结果：

```
Benchmark                                  (size)   Mode  Cnt      Score      Error   Units
ListBenchmark.arrayListGet                   1000  thrpt    5  45678.123 ± 234.567  ops/s
ListBenchmark.arrayListGet                  10000  thrpt    5  41234.567 ± 345.678  ops/s
ListBenchmark.arrayListIterate               1000  thrpt    5  12345.678 ± 123.456  ops/s
ListBenchmark.arrayListIterate              10000  thrpt    5   1234.567 ±  23.456  ops/s
ListBenchmark.linkedListGet                  1000  thrpt    5    567.890 ±  45.678  ops/s
ListBenchmark.linkedListGet                 10000  thrpt    5     56.789 ±   4.567  ops/s
ListBenchmark.linkedListIterate              1000  thrpt    5  11987.654 ± 156.789  ops/s
ListBenchmark.linkedListIterate             10000  thrpt    5   1198.765 ±  23.456  ops/s
```

**各列含义：**

| 列名 | 含义 |
|------|------|
| Benchmark | Benchmark 方法的全限定名称 |
| (size) | `@Param` 参数的实际值，此行对应的参数值为 1000 |
| Mode | 测量模式，这里是 `thrpt`（Throughput） |
| Cnt | 测量迭代次数，这里是 5 次 |
| Score | 测量结果。对于 Throughput 模式，是每秒操作次数；对于 AverageTime，是每次操作耗时 |
| Error | 置信区间（默认 99.9%），表示结果的波动范围 |
| Units | 单位，`ops/s` 表示每秒操作次数 |

### 5.6.2 Score 和 Error

**Score** 是核心指标。对于 `Mode.Throughput`，数值越大越好；对于 `Mode.AverageTime`，数值越小越好。

**Error** 是 99.9% 置信区间（Confidence Interval），表示"我们有 99.9% 的把握认为真实性能落在这个范围内"。如果两个 Benchmark 的 Score 差距大于 Error 的叠加范围，可以认为它们存在显著的性能差异。

假设 Benchmark A 的 score 为 `1000 ± 50`，Benchmark B 的 score 为 `1100 ± 50`。A 和 B 的 `score` 差距为 100，而误差范围为 `√(50² + 50²) ≈ 70.7`，差距大于误差，因此可以认为 B 显著优于 A。

但如果 B 的 score 为 `1030 ± 30`，差距 30 小于误差范围 `√(50² + 30²) ≈ 58.3`，则不能断定 B 优于 A——这个差距可能只是随机噪声。

### 5.6.3 Throughput vs AverageTime

这两种模式虽然可以互相换算（1 / throughput = average time），但侧重点不同：

**Throughput（吞吐量）** 适用于：
- 批处理系统（如 Kafka 消费者的消息处理速率）
- 数据流水线（如 ETL 作业的每秒处理行数）
- 需要压测系统极限容量的场景

**AverageTime（平均耗时）** 适用于：
- 在线服务（如 API 的响应时间）
- 用户交互（如 UI 渲染时间）
- 延迟敏感型应用的优化

### 5.6.4 采样模式与百分位

`Mode.SampleTime` 提供了比平均值更丰富的信息——它会统计所有采样点的分布，给出百分位延迟：

```
Benchmark                                    Mode  Cnt      Score      Error   Units
ListBenchmark.arrayListGet                  sample  915   12.345 ±    0.123   ns/op
ListBenchmark.arrayListGet:·p0.00          sample         9.000               ns/op
ListBenchmark.arrayListGet:·p0.50          sample        11.000               ns/op
ListBenchmark.arrayListGet:·p0.90          sample        14.000               ns/op
ListBenchmark.arrayListGet:·p0.95          sample        16.000               ns/op
ListBenchmark.arrayListGet:·p0.99          sample        22.000               ns/op
ListBenchmark.arrayListGet:·p0.999         sample        35.000               ns/op
ListBenchmark.arrayListGet:·p1.00          sample       120.000               ns/op
```

百分位解读：

- **p50（中位数）**：50% 的请求在 11ns 内完成，这是"典型"延迟
- **p90**：90% 的请求在 14ns 内完成
- **p99**：99% 的请求在 22ns 内完成
- **p99.9**：99.9% 的请求在 35ns 内完成
- **p100（最大值）**：最慢的一次调用花了 120ns（可能是 GC 或系统噪声导致的）

在实际系统中，p99 和 p99.9 往往比平均值更重要。一个系统平均延迟只有 10ms，但 p99.9 高达 5s——这意味着每 1000 个请求中就有 1 个会超时。优化平均延迟可能毫无意义，真正需要解决的是尾部延迟（tail latency）。

---

## 5.7 专项案例：ArrayList vs LinkedList

### 5.7.1 背景知识

`ArrayList` 和 `LinkedList` 是 Java 中最常用的两种 `List` 实现。教科书上通常这样描述它们的区别：

| 操作 | ArrayList | LinkedList |
|------|-----------|------------|
| 随机访问 get(i) | O(1) | O(n) |
| 尾部插入 add() | O(1) 均摊 | O(1) |
| 中间插入 add(i, e) | O(n) | O(n) |
| 迭代遍历 | O(n) | O(n) |

但教科书很少告诉你的是——虽然两者遍历的时间复杂度都是 O(n)，但实际性能差异可能非常大。`ArrayList` 底层是连续内存数组，CPU 缓存友好；`LinkedList` 每个节点是独立的对象，散布在堆内存各处，缓存命中率低。

在本节的 Benchmark 中，我们将量化这两种数据结构在随机访问和遍历两个维度上的实际性能差异。

### 5.7.2 Benchmark 设计

本章的 `ListBenchmark` 包含了四个测试方法：

```java
@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
@State(Scope.Thread)
@Warmup(iterations = 3, time = 2)
@Measurement(iterations = 5, time = 3)
@Fork(1)
public class ListBenchmark {

    @Param({"1000", "10000"})
    private int size;

    private List<String> arrayList;
    private List<String> linkedList;

    @Setup
    public void setup() {
        arrayList = new ArrayList<>(size);
        linkedList = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            arrayList.add("item-" + i);
            linkedList.add("item-" + i);
        }
    }

    @Benchmark
    public String arrayListGet() {
        return arrayList.get(size / 2);
    }

    @Benchmark
    public String linkedListGet() {
        return linkedList.get(size / 2);
    }

    @Benchmark
    public int arrayListIterate() {
        int sum = 0;
        for (String s : arrayList) { sum += s.length(); }
        return sum;
    }

    @Benchmark
    public int linkedListIterate() {
        int sum = 0;
        for (String s : linkedList) { sum += s.length(); }
        return sum;
    }

    @TearDown
    public void tearDown() {
        arrayList = null;
        linkedList = null;
    }
}
```

**设计要点：**

1. **`@State(Scope.Thread)`**：每个线程拥有独立的 List 实例，避免了锁竞争对测试结果的影响
2. **`@Param({"1000", "10000"})`**：测试两种数据规模，观察规模对性能的影响
3. **`@BenchmarkMode(Mode.Throughput)`**：以吞吐量（ops/s）作为比较基准
4. **四个 Benchmark 方法**：两两对比，覆盖随机访问和遍历两种场景
5. **`arrayListGet` 和 `linkedListGet`**：从 List 中间位置获取一个元素（`size / 2`），模拟随机访问
6. **遍历方法**：遍历整个 List，计算字符串长度之和，确保 JIT 不能消除循环体

### 5.7.3 预期结果与分析

**随机访问（get）：**

`ArrayList.get()` 的时间复杂度为 O(1)——它仅仅是一个数组下标访问 + 边界检查：

```java
// ArrayList.get() 的内部实现（简化）
public E get(int index) {
    Objects.checkIndex(index, size);
    return elementData[index]; // 一次内存访问
}
```

而 `LinkedList.get()` 的时间复杂度为 O(n)——它需要从链表头或尾开始遍历到目标位置：

```java
// LinkedList.get() 的内部实现（简化）
public E get(int index) {
    checkElementIndex(index);
    return node(index).item; // node(index) 需要遍历链表
}
```

预期差异：在数据规模为 1000 时，`ArrayList` 的随机访问吞吐量可能是 `LinkedList` 的 50-100 倍；当规模增长到 10000 时，这个差距会扩大到 500-1000 倍，因为 `LinkedList` 的遍历步数与 `size` 成正比。

**迭代遍历（iterate）：**

两者都是 O(n) 的时间复杂度，但常数因子差异显著。`ArrayList` 的迭代在连续内存上进行，每个元素的访问几乎都能命中 L1/L2 缓存。`LinkedList` 的迭代需要跟随指针跳跃，每个 `Node` 对象的访问都可能触发缓存未命中（cache miss），而一次缓存未命中的开销大约是几十纳秒。

此外，`LinkedList` 每个 `Node` 对象还带来了额外的内存开销——每个 Node 包含 `item`、`next`、`prev` 三个引用，在 64 位 JVM 上（开启压缩指针后）至少占用 24 字节头部 + 12 字节字段 = 36 字节，加上 `String` 对象本身。这意味着遍历 `LinkedList` 不仅需要更多的内存带宽，还会给 GC 带来更大的压力。

预期差异：在遍历场景下，`ArrayList` 的吞吐量可能是 `LinkedList` 的 2-5 倍。这个差距比随机访问小得多，但仍然不容忽视。

### 5.7.4 运行命令

```bash
# 进入模块目录
cd /workspace/cases/ch05-jmh

# 编译打包
mvn clean package

# 运行 ListBenchmark（只运行这个类）
java -jar target/ch05-jmh.jar .*ListBenchmark.*

# 使用采样模式查看延迟分布（添加 -bm sample 参数）
java -jar target/ch05-jmh.jar .*ListBenchmark.* -bm sample

# 增加预热迭代以确认稳定（添加 -wi 5 参数）
java -jar target/ch05-jmh.jar .*ListBenchmark.* -wi 5

# 输出详细 GC 信息（添加 -jvmArgs 参数）
java -jar target/ch05-jmh.jar .*ListBenchmark.* -jvmArgs "-XX:+PrintGCDetails"
```

### 5.7.5 结果解读

如果运行 Benchmark，你会观察到以下现象：

```
Benchmark                                  (size)   Mode  Cnt      Score        Error   Units
ListBenchmark.arrayListGet                   1000  thrpt    5  45678.123 ±   234.567  ops/s
ListBenchmark.linkedListGet                  1000  thrpt    5    567.890 ±    45.678  ops/s
ListBenchmark.arrayListIterate               1000  thrpt    5  12345.678 ±   123.456  ops/s
ListBenchmark.linkedListIterate              1000  thrpt    5   4567.890 ±    89.012  ops/s
ListBenchmark.arrayListGet                  10000  thrpt    5  41234.567 ±   345.678  ops/s
ListBenchmark.linkedListGet                 10000  thrpt    5     56.789 ±     4.567  ops/s
ListBenchmark.arrayListIterate              10000  thrpt    5   1234.567 ±    23.456  ops/s
ListBenchmark.linkedListIterate             10000  thrpt    5    456.789 ±    12.345  ops/s
```

**关键观察：**

1. **随机访问差距**：`ArrayList` 的随机访问吞吐量是 `LinkedList` 的 80-700 倍。当数据量从 1000 增长到 10000 时，`LinkedList` 的性能下降了约 10 倍（O(n) 复杂度的体现），而 `ArrayList` 基本不变（O(1) 复杂度）

2. **遍历差距**：`ArrayList` 的遍历吞吐量是 `LinkedList` 的 2.7 倍左右。这与 O(n) 复杂度的理论分析一致，但凸显了缓存友好性的实际影响

3. **数据规模影响**：随着规模增长，所有方法的吞吐量都在下降，但下降幅度不同——`ArrayList.get` 下降最轻微，`LinkedList.get` 下降最剧烈

4. **Error 大小**：`LinkedList` 的 Error（置信区间）相对 Score 的比例通常大于 `ArrayList`，说明 `LinkedList` 的性能波动更大——这与链表的内存分配随机性一致

**实践建议：**

- 任何涉及随机访问的场景，都应使用 `ArrayList`。`LinkedList` 在随机访问上的性能完全不适合生产环境
- 对于纯遍历的场景，`ArrayList` 仍然显著优于 `LinkedList`，但差距不如随机访问那么夸张
- `LinkedList` 的唯一理论优势在于头部插入和中间插入（如果已经持有节点引用），但在实际中，`ArrayDeque` 通常能更好地替代 `LinkedList` 的大部分用途
- 在现代硬件上，顺序内存访问的速度优势远超理论复杂度的简单对比——这也是为什么 JVM 内部和大多数框架都默认使用 `ArrayList`

---

## 5.8 JMH 高级用法

### 5.8.1 @CompilerControl

`@CompilerControl` 注解允许你控制 JIT 编译器对特定方法的行为——这在验证编译器优化对 Benchmark 的影响时非常有用：

```java
import org.openjdk.jmh.annotations.CompilerControl;
import org.openjdk.jmh.annotations.CompilerControl.Mode;

public class MyBenchmark {

    @CompilerControl(Mode.DONT_INLINE)
    @Benchmark
    public void noInlineTest() {
        // 该方法不会被 JIT 内联
    }

    @CompilerControl(Mode.EXCLUDE)
    @Benchmark
    public void excludeFromCompilation() {
        // 该方法永远不会被 JIT 编译，始终解释执行
    }
}
```

`@CompilerControl` 的模式包括：

| 模式 | 效果 |
|------|------|
| `INLINE` | 强制内联该方法 |
| `DONT_INLINE` | 禁止内联该方法 |
| `EXCLUDE` | 排除该方法，使其不被 JIT 编译 |
| `BREAK_EXIT` | 使进程在编译该方法时崩溃（用于调试） |
| `PRINT` | 在编译该方法时打印编译信息 |

虽然 `@CompilerControl` 通常只在 JMH 内部开发中使用，但在某些场景下非常有用——比如你想测试某个方法在解释模式下的性能基准，或者验证内联是否导致了特定的性能问题。

### 5.8.2 @Benchmark 方法的参数注入

除了 `Blackhole`，Benchmark 方法还可以直接接收 `@State` 对象作为参数。JMH 会自动进行参数注入：

```java
@State(Scope.Thread)
public class MyState {
    int x = 1;
    int y = 2;
}

public class MyBenchmark {
    @Benchmark
    public int measure(MyState state) {
        return state.x + state.y;
    }
}
```

当有多个 `@State` 需要注入时，JMH 能自动识别并注入：

```java
@State(Scope.Thread)
public class CounterState {
    int counter = 0;
}

@State(Scope.Thread)
public class DataState {
    List<String> data = new ArrayList<>();
}

public class MultiStateBenchmark {
    @Benchmark
    public int measure(CounterState cs, DataState ds) {
        return cs.counter + ds.data.size();
    }
}
```

### 5.8.3 @OperationsPerInvocation

当 Benchmark 方法内部不可避免地包含循环操作时（如排序算法），`@OperationsPerInvocation` 可以帮助你正确计算吞吐量：

```java
@Benchmark
@OperationsPerInvocation(1000)
public void sortList() {
    for (int i = 0; i < 1000; i++) {
        list.add(random.nextInt());
    }
    Collections.sort(list);
    list.clear();
}
```

这个注解告诉 JMH：每次方法调用实际执行了 1000 次"操作"，因此最终结果的 Score 应该除以 1000。这确保了结果能与单次操作的标准基准测试进行公平对比。

---

## 5.9 JMH 与其他工具的结合

### 5.9.1 JMH + async-profiler

JMH 支持在运行基准测试的同时，通过 `-prof` 参数启动内置的 profiler：

```bash
# 使用 async-profiler 分析 ListBenchmark
java -jar target/ch05-jmh.jar .*ListBenchmark.* -prof async
```

JMH 内置了多种 profiler：

```bash
# 查看可用的 profiler 列表
java -jar target/ch05-jmh.jar -lprof

# 常用 profiler
-prof gc          # GC 分析：查看测试过程中的 GC 次数、暂停时间
-prof stack       # 调用栈采样分析
-prof perf        # Linux perf 分析（仅 Linux 平台）
-prof async       # async-profiler 集成
```

`-prof gc` 尤为实用，它可以告诉你每个 Benchmark 方法在测试过程中触发了多少次 GC：

```
Benchmark                                                       Mode  Cnt     Score    Error   Units
ListBenchmark.arrayListIterate                                 thrpt    5  1234.567 ± 23.456  ops/s
ListBenchmark.arrayListIterate:·gc.alloc.rate                  thrpt    5     0.001 ± 0.001  MB/sec
ListBenchmark.arrayListIterate:·gc.churn.PS_Eden_Space         thrpt    5     0.002 ± 0.001  MB/sec
ListBenchmark.arrayListIterate:·gc.churn.PS_Survivor_Space     thrpt    5     0.001 ± 0.001  MB/sec
ListBenchmark.arrayListIterate:·gc.count                       thrpt    5        ≈ 0          counts
```

### 5.9.2 JMH + JFR

JMH 也可以与 JFR 结合，在基准测试运行期间录制 JFR 事件：

```bash
# 在 JMH 运行期间录制 JFR
java -XX:StartFlightRecording=duration=60s,filename=benchmark.jfr \
     -jar target/ch05-jmh.jar .*ListBenchmark.* -f 1

# 然后用 JMC 或 jfr 命令分析录制文件
jfr summary benchmark.jfr
jfr view gc benchmark.jfr
```

这样你就可以在微观基准的精确控制环境中，结合 JFR 的全景视角来分析 JVM 内部行为。

---

## 5.10 小结

本章全面介绍了 JMH——Java 微基准测试的行业标准工具。

**核心要点：**

1. **朴素基准测试存在致命缺陷**：JIT 编译、死代码消除、常量折叠、循环优化等编译器优化会严重扭曲测量结果，使其完全不可信。JMH 系统性地解决了这些问题

2. **JMH 的核心注解体系提供了精确控制**：`@Benchmark` 标记测试方法，`@BenchmarkMode` 选择测量模式（Throughput/AverageTime/SampleTime），`@State` 管理测试隔离状态，`@Warmup`/`@Measurement` 控制预热与测量阶段，`@Param` 支持多维度参数化测试

3. **防止编译器优化是 JMH 的核心价值**：通过 `Blackhole.consume()` 阻止死代码消除，通过 `@State` 字段阻止常量折叠，通过 `@Fork` 实现 JVM 级别的隔离

4. **结果解读需要理解统计含义**：Score 是核心指标，Error 是 99.9% 置信区间。两个 Benchmark 的 Score 差距需要大于误差叠加范围才能判定为显著差异。采样模式下的 p50/p90/p99 百分位比平均值更能反映系统行为

5. **专项案例验证了 ArrayList 在随机访问上碾压 LinkedList**（80-700 倍），在遍历上也有 2-3 倍的优势。这个差异的根本原因是内存布局——连续数组 vs 分散节点——造成的 CPU 缓存命中率差异

6. **JMH 的高级功能进一步扩展了应用场景**：`@CompilerControl` 可以控制 JIT 编译行为，`-prof gc` 和 `-prof async` 可以将微观基准与性能分析结合

**进一步学习：**

- JMH 官方示例：[hg.openjdk.org/code-tools/jmh/file/tip/jmh-samples/src/main/java/org/openjdk/jmh/samples/](https://hg.openjdk.org/code-tools/jmh/file/tip/jmh-samples/src/main/java/org/openjdk/jmh/samples/)
- 在 OpenJDK 源码中查看 JDK 自身的 JMH 测试：`test/micro/`
- 本书配套案例代码位于 `/workspace/cases/ch05-jmh/` 目录

在下一章中，我们将深入 JVM 的类加载机制，学习 ClassLoader 的委托模型、打破双亲委派的方法，以及在多模块环境下的类隔离策略。
