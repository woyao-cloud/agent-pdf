# 第9章 JIT编译优化

> 前面三章分别讨论了类加载、内存管理和GC——这些问题都是在运行时由JVM自动处理的，用户代码本身只需遵循JVM规范即可。然而，对于追求极致性能的Java应用来说，还有一个至关重要的"隐形引擎"决定了应用的最终执行效率：**即时编译（Just-In-Time Compilation, JIT）**。
>
> JIT编译器在程序运行时将热点代码（Hot Methods）编译为本地机器码，其优化质量直接影响应用的吞吐量和延迟。然而，JIT的优化行为对大多数开发者来说是一个"黑盒"——你无法直接控制它，但你的代码结构深刻影响着它的决策。方法是否被内联？对象是否逃逸？锁是否被消除？循环是否被展开？这些问题的答案往往决定了你的应用是跑在"调优后的代码"上，还是跑在"未经优化的字节码"上。
>
> 本章将从JIT的核心原理出发，深入解释执行与编译执行的区别、分层编译架构、热点检测机制以及主要的优化技术。随后通过两个实战案例——方法内联失效的诊断和逃逸分析关闭后的性能回退——展示如何分析和解决JIT相关的性能问题。

## 9.1 核心原理

### 9.1.1 解释执行 vs 编译执行：为什么需要JIT

Java最初的设计理念是"一次编写，到处运行"（Write Once, Run Anywhere）。这一理念的实现依赖于字节码（Bytecode）和Java虚拟机（JVM）。传统上，JVM通过**解释执行**（Interpreted Execution）来运行字节码：逐条读取字节码指令，将其翻译为对应的平台机器码并执行。

解释执行的优点是启动速度快、无需编译等待、内存占用低。但它的致命弱点是执行效率低——同样的代码每次执行都需要重新解释，没有缓存和优化的机会。解释执行的速度通常只有原生编译代码的十分之一到二十分之一。

为了解决这个问题，早期的JVM引入了**模板解释器**（Template Interpreter），将常用的字节码指令预先编译为机器码模板，执行时直接调用这些模板，而不是逐条解释。模板解释器将解释执行的速度提升了数倍，但距离原生编译仍有显著差距。

真正的突破来自**即时编译（JIT Compilation）**。JIT编译器在程序运行时监控代码的执行频率，当一段代码被判定为"热点代码"（Hot Code）时，JIT将其编译为当前平台的原生机器码。编译后的代码直接缓存在内存中（Code Cache），后续执行直接使用原生机器码，不再需要解释执行。

JIT编译的独特优势在于：

**第一，它拥有解释执行的启动速度和编译执行的运行速度。** 程序启动时，所有代码都通过解释器快速运行，无需等待编译。对于只执行一次的冷门代码，解释执行的代价很小。而对于反复执行的热点代码，JIT在后台将其编译为高度优化的机器码，后续执行速度接近甚至超越C/C++的静态编译。

**第二，它拥有静态编译无法媲美的优化信息。** JIT编译器在运行时可以收集到精确的执行信息：哪些分支被执行了？哪些对象的类型是确定的？哪些锁是单线程访问的？这些信息在静态编译时是无法获取的（或获取成本极高）。基于运行时Profile信息的优化，是JIT超越静态编译的核心竞争力。

**第三，它可以自适应地调整优化策略。** 当程序的执行特征发生变化时（例如，一个原本单态的方法调用站点突然出现了新的实现类），JIT可以撤销之前的优化（Deoptimization），重新编译生成更合适的机器码。这种"运行时自适应"能力是静态编译完全不具有的。

以JDK 21的HotSpot虚拟机为例，一个Java方法从开始执行到最终被高度优化，经历以下阶段：

```
解释执行 ──>[方法调用计数达标]──> C1编译（Client Compiler）──>[热点持续]──> C2编译（Server Compiler）
                                   │                           │
                                   └── 有限优化，快速编译 ───────┘   └── 深度优化，编译速度慢
```

在大多数情况下，一个热点方法会在C1层先被编译（获得中等程度的优化），如果该方法持续被调用，再被C2层更深入地编译（获得极端优化）。这种分层策略兼顾了响应速度和优化质量。

### 9.1.2 分层编译：C1、C2与C1+C2

JIT编译器的架构经历了从单一编译器到分层编译的演进过程。

**Client Compiler（C1）** 是JDK 6引入的轻量级JIT编译器。C1的设计目标是快速编译——它牺牲了一部分优化深度来换取编译速度。C1在编译时只做有限的优化（如简单的死代码消除、常量折叠），适合对启动速度敏感的客户端应用。在JDK 8及之前版本中，可以通过`-client`参数启用C1模式。

**Server Compiler（C2）** 是与C1同时存在的重量级JIT编译器。C2的设计目标是深度优化——它不惜花费更多的编译时间来生成尽可能高效的机器码。C2采用了大量世界级的优化技术，包括全局值编号（Global Value Numbering）、循环变换（Loop Transformations）、指针分析（Pointer Analysis）、逃逸分析（Escape Analysis）、自动向量化（Auto-Vectorization）等。在JDK 8及之前版本中，可以通过`-server`参数启用C2模式。

**分层编译（Tiered Compilation）** 自JDK 7起成为默认模式（JDK 8中`-server`已隐含分层编译），JDK 8中`-XX:+TieredCompilation`默认开启。分层编译将编译过程分为五个层级（Tier），每层的优化深度递增：

| 层级 | 名称 | 编译器 | 优化程度 | 编译速度 |
|------|------|--------|----------|----------|
| 0 | 解释执行 | 无 | 无 | N/A |
| 1 | 简单C1 | C1（完全优化） | 低 | 快 |
| 2 | 受限C1 | C1（带调用/回边计数） | 中 | 快 |
| 3 | 完整C1 | C1（带全部Profile） | 中高 | 中 |
| 4 | C2 | C2 | 极高 | 慢 |

**Tier 0（解释执行）**：所有方法开始执行时的状态。解释器逐条处理字节码指令，同时为方法调用计数器和回边计数器积累数据。

**Tier 1（简单C1）**：当方法调用计数超过Tier 0到Tier 3的阈值时，方法进入Tier 3。但在某些情况下（如方法太小或者编译队列已经过长），C1会使用Tier 1的简单模式快速编译，不收集Profile信息。Tier 1生成的代码质量有限，但编译速度极快。

**Tier 2（受限C1）**：当Tier 3的编译队列拥塞时，C1使用Tier 2模式进行编译。Tier 2会收集基本的调用计数和回边计数，但不做完整的Profile收集。Tier 2是一个"降级"选项，用于在编译压力大时减少C1的编译开销。

**Tier 3（完整C1）**：大多数热点方法从解释执行进入的第一个编译层。Tier 3的C1会收集完整的Profile信息，包括分支跳转概率、类型分布（哪些子类实现了接口方法）、空检查是否必要等。这些Profile信息会通过"编译任务"传递给后续的C2编译器。

**Tier 4（C2编译）**：当Tier 3编译后的方法仍然频繁执行（调用计数或回边计数达到C2阈值），该方法的Profile信息（由C1收集）会被提交给C2编译器。C2利用这些Profile信息进行深度优化，生成最高质量的机器码。

关键参数说明：

- `-XX:Tier0InvokeNotifyFreqLog`：Tier 0时，每多少次调用记录一次Profile。默认值为7（2^7=128）。
- `-XX:Tier3InvokeThresholdFloating`：从Tier 0升级到Tier 3的调用计数阈值浮动量。默认值为100。
- `-XX:Tier3BackEdgeThreshold`：从Tier 0升级到Tier 3的回边计数阈值。默认值为60000。
- `-XX:Tier4InvocationThreshold`：从Tier 3升级到Tier 4的调用计数阈值。默认值为50000。
- `-XX:Tier4MinInvocationThreshold`：从Tier 3升级到Tier 4的最小调用计数阈值。默认值为30000。

分层编译的核心价值在于**平衡启动速度与稳态性能**。在应用启动阶段，C1快速编译关键路径的方法，让应用尽快达到可用的性能水平。在应用运行阶段，C2对持续热点的方法进行深度优化，将稳态吞吐量推向极致。JDK 21对分层编译的调优主要在C2的Profile反馈机制上，通过改进类型Profile的精确度来提升C2的优化质量。

### 9.1.3 热点检测：方法计数器与回边计数器

JIT编译器需要确定"哪些代码是热点"——即值得花费编译时间进行优化的代码。HotSpot VM使用**基于计数器的热点检测**（Counter-Based Hotspot Detection），维护两类计数器：

**方法调用计数器（Method Invocation Counter）**：记录方法被调用的次数。当一个方法的调用计数超过某个阈值时，该方法被提交给JIT编译器进行编译。调用计数器的阈值在不同Tier之间不同：

```
Interpreted (Tier 0):  -XX:CompileThreshold      (默认值因JVM模式而异)
C1 (Tier 3):           -XX:Tier3InvocationThreshold (默认 200)
C2 (Tier 4):           -XX:Tier4InvocationThreshold (默认 50000)
```

**回边计数器（Backedge Counter）**：记录方法中循环（Loop）向后跳转的执行次数。每次循环完成一次迭代到达循环末尾（回边指令），回边计数器加1。回边计数器的目的是检测"虽然调用次数不多，但方法中有非常热的循环"的情况——即使方法只被调用了一次，如果该方法中有一个执行了上万次的循环，也值得被编译。回边计数器在分层编译中的默认阈值为：

```
Interpreted (Tier 0):  -XX:OnStackReplacePercentage × CompileThreshold / 100
C1 (Tier 3):           -XX:Tier3BackEdgeThreshold        (默认 60000)
C2 (Tier 4):           -XX:Tier4BackEdgeThreshold        (默认 80000)
```

当回边计数超过阈值时，JVM会触发**栈上替换（On-Stack Replacement, OSR）**——在循环还在执行的过程中，将当前正在解释执行的栈帧替换为新编译的机器码。OSR使得长时间运行的循环也能享受到JIT编译的优化，无需等待下一次方法调用。

**计数器衰减（Counter Decay）**：JVM还实现了一套计数器衰减机制。当JVM进入GC安全点（Safepoint）时，会检查当前时间距离上次计数器衰减是否超过了一个固定的周期（默认值为`-XX:CounterHalfLifeTime`，单位为秒）。如果超过，则将所有方法的调用计数器值减半。衰减机制非常重要，因为它防止了"冷门但在启动阶段被调用过几次的方法"错误地触发编译。如果一个方法在启动阶段被调用了2000次，但之后再也没有被调用过，衰减机制会在几个周期后将其计数降低到远低于编译阈值——JIT编译器就不会浪费资源去编译它。

**编译队列与编译线程**：当方法被判定为热点后，它被加入编译队列。HotSpot维护了两种编译队列：

- **C1编译队列**：由C1编译线程处理。C1编译线程的数量由`-XX:CICompilerCount`控制（默认为CPU核心数的1/3，最小2，最大16）。
- **C2编译队列**：由C2编译线程处理。C1和C2的编译线程共享`CICompilerCount`，但C2编译线程始终占用其中一部分（通常为总数的2/3）。

编译任务的优先级基于方法的热度。热度越高的方法越先被编译。这也是为什么在应用的启动阶段，关键路径上的方法会优先获得C1编译，然后在运行稳定后逐步被C2接手。

### 9.1.4 主要优化技术

JIT编译器，特别是C2编译器，应用了大量高性能优化技术。本节介绍其中最重要的六种。

#### 方法内联（Method Inlining）

方法内联是JIT优化中最重要、最基础的技术。它的思想很简单：**将被调用方法的代码直接"复制"到调用者的代码中**，消除方法调用的开销（包括参数传递、栈帧创建、跳转等）。

内联的好处远超表面：它不仅仅是省去了方法调用的开销。更重要的是，**内联之后，被内联方法的代码与调用者的代码处于同一个编译单元中，C2可以对合并后的代码应用更多的优化**——包括常量传播、死代码消除、逃逸分析等。许多优化只有在内联之后才能生效。

C2的内联决策基于以下因素：

1. **方法大小**。小方法（通常小于`-XX:MaxInlineSize`，默认35字节）总是被内联。中等方法（35-325字节）基于调用频率和热度决定是否内联。大方法（超过`-XX:FreqInlineSize`，默认325字节）只有在其被频繁调用时才会内联。

2. **调用深度**。内联可以嵌套进行——`A()`调用`B()`，`B()`调用`C()`，如果三者都是热点，C2理论上可以将`C()`内联到`B()`，再将`B()`（已包含`C()`的代码）内联到`A()`。但深度不能超过`-XX:MaxInlineLevel`（默认9层）。

3. **调用站点类型分布**。如果调用目标在运行时是确定的（单态分发，即只有一个实现类），C2几乎总是会内联。如果有两个实现类（双态分发），C2会尝试"乐观内联"——将两个实现同时内联，通过类型检查分支来选择正确的目标。如果有三个或以上的实现类（多态分发），C2通常不会内联，因为内联后的代码膨胀太严重——这种情况称为**内联失效**。

4. **接口引用**。对于接口方法调用（invokeinterface），编译器需要通过类型Profile来判断实际的目标类。如果Profile信息显示只有一个实现类，C2会内联该实现的方法，并在内联前插入类型检查（如果类型不符合，则退回到解释执行）。这种机制称为**守护内联（Guarded Inlining）**。

#### 逃逸分析（Escape Analysis）

逃逸分析是C2编译器中最强大也是最具代表性的优化技术之一。它通过分析对象的动态作用域，判断一个对象是否"逃逸"出方法或线程的边界：

- **方法逃逸**：对象作为方法的返回值，或者被传递给其他方法（作为参数传入）。这意味着该对象可能被其他方法中的代码访问。
- **线程逃逸**：对象被赋值给实例字段或静态字段，可以被其他线程访问。这比方法逃逸更"严重"。

基于逃逸分析的结果，C2可以应用以下优化：

- **栈上分配（Stack Allocation）**：如果对象没有逃逸出方法（即只在方法内部使用），C2可以将其分配在栈帧中，而不是堆上。栈上分配的对象随方法返回自动销毁，无需GC介入。

- **标量替换（Scalar Replacement）**：如果对象没有逃逸出方法，C2甚至可以"拆解"该对象——将对象的每个字段（标量）直接作为局部变量处理。对象本身在生成的机器码中完全不存在，只存在几个局部变量（可能在栈上，也可能在寄存器中）。这是逃逸分析的最高境界。

- **锁消除（Lock Elision）**：如果对象没有逃逸出线程（即只在当前线程中访问），那么对该对象的同步操作（synchronized）是多余的——因为其他线程无法访问该对象。C2可以消除这些锁操作，大幅减少同步开销。

例如，对于以下代码：

```java
int sum(int a, int b) {
    Point p = new Point(a, b);
    return p.x() + p.y();
}
```

开启逃逸分析后，C2会检测到`Point`对象没有逃逸出`sum`方法，于是进行标量替换，生成的机器码等效于：

```java
int sum(int a, int b) {
    return a + b;  // 直接使用参数，无需创建对象
}
```

对象分配、构造器调用、对象头的初始化——所有这些开销都被消除了。这也是为什么在热点代码中创建临时对象并不一定会导致GC压力的原因——只要这些对象不逃逸，C2会"魔法般地"消除它们。

逃逸分析通过`-XX:+DoEscapeAnalysis`开启（默认开启），通过`-XX:-DoEscapeAnalysis`关闭。

#### 标量替换（Scalar Replacement）

标量替换是逃逸分析的一个具体应用。在C2的编译流程中，逃逸分析先判断哪些对象没有逃逸，然后对每个符合条件的对象执行以下操作：

1. 将对象的每个字段"提升"（Promote）为独立的局部变量。
2. 将对对象字段的读写替换为对这些局部变量的读写。
3. 消除对象的new指令（不再分配对象）。

标量替换的成功与否直接取决于逃逸分析的精确度。如果一个对象"部分逃逸"——例如，仅在某些代码路径中逃逸——C2仍然可能对没有逃逸的路径应用标量替换，同时保留逃逸路径上的对象分配。这种"部分逃逸分析"（Partial Escape Analysis）是JDK 21中C2编译器的一个重要改进方向。

标量替换的效果非常显著。JMH基准测试显示，对于创建大量临时对象的代码（如数据处理管道中的DTO层），标量替换可以将性能提升数倍——因为对象创建和GC回收的开销被完全消除了。

#### 锁消除与锁粗化（Lock Elision & Lock Coarsening）

Java的synchronized关键字提供了便捷的同步机制，但同步操作的成本很高——涉及内存屏障（Memory Barrier）、缓存一致性协议交互等。JIT编译器通过两种技术来优化锁操作：

**锁消除（Lock Elision）**：基于逃逸分析的结果，如果一个对象没有线程逃逸（即只在当前线程中可访问），那么对该对象的所有同步操作都可以被消除。因为其他线程不可能访问该对象，同步是多余的。

```java
// JIT通过逃逸分析可以消除此处的同步
StringBuilder sb = new StringBuilder();
sb.append("hello");
sb.append("world");
return sb.toString();
```

StringBuilder的方法（如`append`）在JDK中被声明为synchronized了吗？实际上，`StringBuilder`是非同步的，它的线程不安全版本`StringBuffer`是同步的。但即使对于`StringBuffer`，如果JIT分析出`StringBuffer`对象没有线程逃逸，也可以消除所有同步操作——实际上，在HotSpot中，`StringBuffer`的同步开销在开启逃逸分析后几乎可以完全消除。

**锁粗化（Lock Coarsening）**：当JIT检测到一连串连续的锁操作（如循环中的反复加锁/解锁）时，可以将这些锁操作合并为一个更大的锁范围，减少加锁/解锁的次数。

```java
// 锁粗化前：每次都加锁/解锁
for (int i = 0; i < n; i++) {
    synchronized (list) {
        list.add(data[i]);
    }
}

// 锁粗化后：一次加锁，全部添加，一次解锁（等效行为）
synchronized (list) {
    for (int i = 0; i < n; i++) {
        list.add(data[i]);
    }
}
```

锁粗化不仅减少了锁操作本身的代价，更重要的是减少了内存屏障的刷入频率，提升了缓存效率。

#### 循环展开（Loop Unrolling）

循环展开将循环的多次迭代合并为一次迭代，减少循环控制指令（如计数器增减、条件判断、跳转）的执行次数。例如：

```java
// 展开前：每次迭代处理1个元素
for (int i = 0; i < 1000; i++) {
    sum += array[i];
}

// 展开后（4路展开）：每次迭代处理4个元素
for (int i = 0; i < 1000; i += 4) {
    sum += array[i];
    sum += array[i + 1];
    sum += array[i + 2];
    sum += array[i + 3];
}
```

展开后，循环控制指令的执行次数从1000次降低到250次。对于简单的循环体，这可以带来20%-30%的性能提升。

C2自动进行循环展开的决策基于循环的大小、迭代次数和循环体的复杂性。关键参数包括：

- `-XX:LoopUnrollMin`：最小展开因子（默认4）。
- `-XX:LoopUnrollLimit`：最大展开因子（默认60，基于编译后的代码大小）。
- `-XX:UnrollLimitCheck`：是否使用"展开限制检查"模式（默认启用）。

需要注意的是，过度展开可能导致代码膨胀（Code Bloat），占用过多的Code Cache空间，反而降低性能。C2的展开决策会综合考虑这些因素。

#### JDK 21的Profile优化演进

JDK 21在JIT编译方面引入了多项改进，主要集中在Profile信息的精确度和利用效率上：

**改进的类型Profile（Type Profile）**：C1编译器在Tier 3编译时收集的类型Profile信息，会被传递给C2编译器用于优化决策。JDK 21改进了Profile的编码方式，使其能够更精确地记录方法调用站点的类型分布。特别是在接口方法调用（invokeinterface）场景下，新的Profile格式可以记录更多的实现类信息，帮助C2做出更准确的内联决策。

**更智能的部分逃逸分析**：JDK 21进一步改进了部分逃逸分析（Partial Escape Analysis）的实现。部分逃逸分析的核心思想是：一个对象在不同代码路径上的逃逸状态可能不同。例如：

```java
Object obj = new Object();
if (condition) {
    return obj;  // 这条路径上，对象逃逸了
} else {
    localMethod(obj);  // 这条路径上，对象可能没有逃逸
    // ...
}
```

JDK 21的改进使得C2能够对非逃逸路径上的对象分配进行优化（即使其他路径上对象逃逸了），从而在不影响正确性的前提下，最大化标量替换的应用范围。

**更精确的空检查优化（Null Check Optimization）**：C2编译器在编译过程中会插入大量的空检查（Null Check）指令。JDK 21改进了空检查的优化算法，能够更准确地消除那些"实际上不可能触发"的空检查。这在处理大量链式调用（如`a.b().c().d()`）时效果尤为明显。

**Code Cache分区优化**：Code Cache是存放编译后的机器码的内存区域。JDK 21对Code Cache的分区策略进行了调整，将非方法代码（如编译器生成的适配器、运行时Stub等）与编译后的方法代码分离存放，减少了Code Cache碎片化，提高了Code Cache的利用率。`-XX:ReservedCodeCacheSize`的默认值在JDK 21中也有所调整（通常为240MB，具体取决于JVM模式）。

**编译线程调度优化**：JDK 21改进了编译线程（Compiler Thread）的调度策略，在C1和C2之间的任务分配更加智能。在高负载场景下，C1编译任务不会被C2任务完全阻塞，保证了热点方法能够及时获得C1编译而受益。

---

## 9.2 案例实践

### Case 9-1: 方法内联失效

#### 场景与问题

在某互联网公司的交易系统中，核心链路有一个**接口分发**模式：多个实现类实现了同一个接口，在运行时根据不同的业务类型选择不同的实现类进行处理。

```java
interface OrderProcessor {
    boolean process(Order order);
}

class NormalOrderProcessor implements OrderProcessor { ... }
class FlashSaleProcessor implements OrderProcessor { ... }
class GroupBuyProcessor implements OrderProcessor { ... }
// ... 更多实现
```

在性能压测中，团队发现即使使用了JDK 21的最新特性，核心链路的吞吐量仍然远低于预期。通过async-profiler火焰图分析，发现`OrderProcessor.process()`方法的CPU消耗异常高——方法调用本身占用了大量的CPU时间片。

问题排查的直觉是：**这个接口方法应该在JIT编译时被内联才对，为什么没有？** 进一步分析发现，在压测场景中，`process()`方法被3个以上的实现类交替调用——这触发了C2的内联失效条件：多态分发。

#### 工具与准备

本次诊断使用以下工具和参数：
- `InlineFailureDemo`程序（本章提供的演示程序），模拟不同分发模式的内联行为
- `-XX:+PrintInlining`：打印内联决策日志
- `-Xlog:jit+compilation*=debug`：打印编译详情日志
- `-XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation`：打印编译事件
- async-profiler火焰图（可选）

运行InlineFailureDemo程序的命令：

```bash
# 默认参数运行
java -XX:+PrintInlining \
     -Xlog:jit+compilation*=debug:file=compilation.log:time,uptime \
     -cp ch09-jit.jar com.jvmbook.ch09.InlineFailureDemo

# 调优内联参数
java -XX:+PrintInlining \
     -XX:InlineSmallCode=5000 \
     -XX:MaxInlineLevel=15 \
     -XX:MaxInlineSize=500 \
     -XX:MaxRecursiveInlineLevel=2 \
     -Xlog:jit+compilation*=debug:file=compilation-tuned.log:time,uptime \
     -cp ch09-jit.jar com.jvmbook.ch09.InlineFailureDemo
```

#### 问题分析

InlineFailureDemo包含了三种分发模式的对比：

1. **单态分发（Monomorphic Dispatch）**：只使用一个实现类——`InlineProcessor`。C2可以确定性地知道调用目标，总是内联。
2. **双态分发（Bimorphic Dispatch）**：交替使用两个实现——`BiProcessorA`和`BiProcessorB`。C2会尝试乐观内联，通过类型检查选择正确的目标。
3. **多态分发（Megamorphic Dispatch）**：轮流使用三个以上的实现——`MegaProcessorA`、`MegaProcessorB`、`MegaProcessorC`。C2通常不会内联，通过vtable进行虚方法分派。

运行`InlineFailureDemo`的典型输出（默认参数）：

```
=== JIT Inline Failure Demo ===
PID: 12345

Use JVM flags to observe inlining decisions:
  -XX:+PrintInlining

=== Warmup phase ===
=== Warmup complete. ===
=== Timing phase ===
Monomorphic dispatch (likely inlined):   187 ms
Bimorphic dispatch (maybe not inlined):  342 ms
Megamorphic dispatch (unlikely inlined): 523 ms
```

从输出可以看到，单态分发最快（187ms），双态分发慢了约83%（342ms），多态分发最慢（523ms，比单态慢180%）。这清晰地展示了内联对性能的巨大影响。

查看`-XX:+PrintInlining`的输出（简化）：

```
@ 36   com.jvmbook.ch09.InlineFailureDemo::main (120 bytes)
  @ 48   com.jvmbook.ch09.InlineFailureDemo$InlineProcessor::process (6 bytes)   inline (hot)
  @ 58   com.jvmbook.ch09.InlineFailureDemo::processBimorphic (8 bytes)
    @ 2   com.jvmbook.ch09.InlineFailureDemo$BiProcessorA::process (9 bytes)   inline (hot)
    @ 2   com.jvmbook.ch09.InlineFailureDemo$BiProcessorB::process (9 bytes)   inline (hot)
  @ 69   com.jvmbook.ch09.InlineFailureDemo$MegaProcessorA::process (8 bytes)   not inline (megamorphic)
  @ 69   com.jvmbook.ch09.InlineFailureDemo$MegaProcessorB::process (8 bytes)   not inline (megamorphic)
  @ 69   com.jvmbook.ch09.InlineFailureDemo$MegaProcessorC::process (8 bytes)   not inline (megamorphic)
```

观察输出中的关键信息：

- **单态（`InlineProcessor.process`）**：被标记为`inline (hot)`，成功内联。这是最理想的情况。
- **双态（`BiProcessorA.process` / `BiProcessorB.process`）**：两个实现都被标记为`inline (hot)`。C2在这里应用了"乐观内联"——它同时内联了两个实现，并在运行时通过类型检查来选择。但这也意味着内联后的代码更大，且每次调用都有额外的类型检查开销。
- **多态（`MegaProcessorA/B/C.process`）**：被标记为`not inline (megamorphic)`，内联失败。C2选择不内联，通过vtable分发。这是性能最差的情况。

为什么多态分发会导致内联失败？根本原因在于C2的**内联决策基于类型Profile**。在编译时，C2需要知道调用点可能出现的类型。如果类型Profile显示只有1-2个类型，C2可以安全地内联（或者乐观内联）。但如果类型Profile显示有3个或更多的类型，内联的代价就太高了——内联后的代码需要包含所有可能的分支，代码膨胀严重，而且分支预测的准确率下降。

更深层次的原因在于**InlineSmallCode和MaxInlineLevel的限制**：

- `InlineSmallCode`（默认值约2000字节）控制内联后代码的最大字节数。如果被内联的方法本身已经较大，或者嵌套内联导致总代码超过此阈值，C2会放弃内联。
- `MaxInlineLevel`（默认9层）控制嵌套内联的最大深度。超过此深度的方法不会被内联。

在演示代码中，`expensiveOp`方法包含一个100次迭代的循环，其编译后的机器码较大，达到了InlineSmallCode的上限，因此在某些场景下被排除在内联决策之外。

#### 调优方案

针对内联失效，有以下几种解决方案：

**方案1：扩大内联阈值**

```bash
-XX:InlineSmallCode=5000
-XX:MaxInlineLevel=15
-XX:MaxInlineSize=500
-XX:MaxRecursiveInlineLevel=2
```

- `InlineSmallCode`从默认的2000扩大到5000，使较大方法也有机会内联。
- `MaxInlineLevel`从9扩大到15，允许更多层的嵌套内联。
- `MaxInlineSize`从35扩大到500，使中等方法也能被内联。

扩大内联阈值的风险是Code Cache占用增加——如果太多方法被内联，Code Cache可能被撑爆。`-XX:ReservedCodeCacheSize`需要相应调整。

**方案2：代码层面优化**

修改代码结构，减少接口分发的多态性：

- 将接口方法声明为`final`（如果允许）：在JDK 17+中，接口的`default`方法可以被声明为`final`，明确禁止重写。这告诉C2该方法是单态的。
- 使用抽象类代替接口：抽象类的方法调用使用invokevirtual而非invokeinterface，类型Profile的收集效率更高。
- 使用`sealed`接口（JDK 17+）：`sealed`接口限制了实现类的数量，C2可以利用这一信息做出更准确的内联决策。

```java
// 使用sealed接口限制实现类
sealed interface OrderProcessor permits NormalProcessor, FlashProcessor {
    boolean process(Order order);
}
```

- 在热点路径上使用模板方法模式或策略模式的"扁平化"版本，减少方法调用层次。

**方案3：使用`-XX:+TrustFinalNonStaticFields`**

JDK 21中新增（或进一步优化）的参数，使C2信任final字段的值不会变化。当一个接口引用的实际类型在构造后就固定时（即接口引用被存储在final字段中），C2可以更准确地推断类型，从而做出内联决策。

```bash
-XX:+TrustFinalNonStaticFields
```

#### 调优验证

使用调优参数再次运行InlineFailureDemo：

```bash
java -XX:+PrintInlining \
     -XX:InlineSmallCode=5000 \
     -XX:MaxInlineLevel=15 \
     -XX:MaxInlineSize=500 \
     -cp ch09-jit.jar com.jvmbook.ch09.InlineFailureDemo
```

预期输出（调优后）：

```
Monomorphic dispatch (likely inlined):   182 ms
Bimorphic dispatch (maybe not inlined):  215 ms
Megamorphic dispatch (unlikely inlined): 310 ms
```

调优后的对比：

| 分发模式 | 默认参数 | 调优参数 | 改善 |
|----------|----------|----------|------|
| 单态 | 187 ms | 182 ms | ~3% |
| 双态 | 342 ms | 215 ms | ~37% |
| 多态 | 523 ms | 310 ms | ~41% |

调优后，双态和多态分发的性能得到显著改善。但需要注意的是，单态分发仍然是最高效的——因为即使内联成功，乐观内联和多态内联的代码膨胀仍然存在，分支预测的开销也无法完全消除。

#### 小结

方法内联是JIT优化中最基础也最重要的技术。内联失效的根本原因通常是**多态分发导致的内联决策保守**。调优内联的最佳实践是：

1. **先诊断**：使用`-XX:+PrintInlining`确认哪些方法没有被内联以及原因。
2. **再调整**：根据诊断结果，调整`InlineSmallCode`、`MaxInlineLevel`等参数。
3. **后优化**：在代码层面减少多态分发——使用`final`、`sealed`、减少接口实现类数量。
4. **最后验证**：对比优化前后的性能指标，确保Code Cache没有过度占用。

需要注意的是，盲目扩大内联阈值可能适得其反——过度的内联会导致Code Cache溢出，JVM需要频繁地进行Code Cache回收（Code Cache Sweeping），反而降低性能。内联调优的核心是**"在关键的调用点上做精确的内联，在非关键调用点上避免内联"**。

### Case 9-2: 逃逸分析关闭后的性能回退

#### 场景与问题

某大数据处理平台的数据管道服务在升级JDK版本后，运维团队发现内存占用量显著上升，GC频率增加了一倍，吞吐量下降了30%。经过排查，发现新部署的JVM配置中无意中包含了`-XX:-DoEscapeAnalysis`参数（注意是减号，即关闭逃逸分析）。

这个配置错误的"威力"超出了大多数开发者的预期。逃逸分析关闭后，所有在热点方法中创建的临时对象都会在堆上分配，不再享受栈上分配和标量替换的优化。对于大量创建临时对象的数据处理代码（如将数据库记录转换为DTO，然后进行数据清洗和转换），逃逸分析关闭意味着每次数据处理都在堆上创建了一大批临时对象，这些对象很快变成垃圾，触发频繁的Minor GC。

#### 工具与准备

本次诊断使用以下工具：
- `EscapeAnalysisDemo`程序（本章提供的演示程序），对比逃逸分析开启/关闭的性能差异
- JMH基准测试（可选，用于更精确的性能对比）
- `-XX:+PrintEscapeAnalysis`：打印逃逸分析详情（需要UnlockDiagnosticVMOptions）
- `-Xlog:gc*=info`：观察GC频率变化

运行EscapeAnalysisDemo程序的命令：

```bash
# 开启逃逸分析（默认）
java -XX:+DoEscapeAnalysis \
     -cp ch09-jit.jar com.jvmbook.ch09.EscapeAnalysisDemo

# 关闭逃逸分析
java -XX:-DoEscapeAnalysis \
     -cp ch09-jit.jar com.jvmbook.ch09.EscapeAnalysisDemo

# 查看逃逸分析详情
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintEscapeAnalysis \
     -cp ch09-jit.jar com.jvmbook.ch09.EscapeAnalysisDemo
```

#### 问题分析

EscapeAnalysisDemo的核心逻辑是对比两种对象分配方式：

- **逃逸分配（allocateEscaping）**：创建的`Point`对象的引用被赋值给静态字段`escapedPoint`，强制逃逸出方法。C2无法进行标量替换，必须在堆上分配。
- **非逃逸分配（allocateNonEscaping）**：创建的`Point`对象的引用没有逃逸出方法，仅在方法内部使用。C2可以进行标量替换，消除对象分配。

表面上，两种方法的代码非常相似——都是创建`Point`然后计算`x + y`。但C2对它们的优化天差地别。

运行EscapeAnalysisDemo（开启逃逸分析，默认）的典型输出：

```
=== Escape Analysis Demo ===
PID: 12346

=== Benchmark ===
Warmup complete: 200000 iterations each method.

Escaping allocation (50000000 iters):    4823 ms
Non-escaping allocation (50000000 iters): 1256 ms
Conditional non-escape (50000000 iters):  1398 ms
```

输出显示，非逃逸分配的速度是逃逸分配的3.8倍（1256ms vs 4823ms）。差距如此之大的原因：

1. **逃逸分配**：每次迭代创建`Point`对象 -> 分配在堆上 -> 返回时对象头初始化完整 -> 后续GC需要处理这些临时对象。
2. **非逃逸分配**：C2执行标量替换 -> `Point`对象完全消失 -> 只保留两个局部变量（`x`和`y`）-> 直接在寄存器或栈上操作 -> 无堆分配 -> 无GC压力。

这就是逃逸分析的"魔法"。

现在关闭逃逸分析（`-XX:-DoEscapeAnalysis`），再次运行：

```
=== Escape Analysis Demo ===
PID: 12347

=== Benchmark ===
Warmup complete: 200000 iterations each method.

Escaping allocation (50000000 iters):    4956 ms
Non-escaping allocation (50000000 iters): 4789 ms
Conditional non-escape (50000000 iters):  4867 ms
```

关闭逃逸分析后：
- **逃逸分配**：4956ms（与开启时相差不大，因为堆分配的开销一直在）
- **非逃逸分配**：4789ms（从1256ms暴涨到4789ms，性能回退281%）
- **所有分配行为回归一致**：三种模式的速度基本相同——因为逃逸分析关闭后，C2对所有对象一视同仁，都在堆上分配。

对比表格：

| 场景 | 开启逃逸分析 | 关闭逃逸分析 | 性能回退 |
|------|-------------|-------------|----------|
| 逃逸分配 | 4823 ms | 4956 ms | ~3% |
| 非逃逸分配 | 1256 ms | 4789 ms | **~281%** |
| 条件非逃逸 | 1398 ms | 4867 ms | **~248%** |

**非逃逸分配的性能回退高达281%**——这就是那行`-XX:-DoEscapeAnalysis`配置错误带来的代价。在实际的业务场景中，这种程度的回退直接导致CPU使用率翻倍、GC频率激增、吞吐量腰斩。

查看GC日志（开启逃逸分析）：

```
[0.456s][gc] GC pause (G1 Evacuation Pause) (young) 12.3M->0.2M(100M) 2.1ms
[2.345s][gc] GC pause (G1 Evacuation Pause) (young) 15.7M->0.3M(100M) 2.5ms
```

关闭逃逸分析后：

```
[0.234s][gc] GC pause (G1 Evacuation Pause) (young) 48.2M->0.8M(100M) 8.7ms
[1.012s][gc] GC pause (G1 Evacuation Pause) (young) 52.1M->1.2M(100M) 9.8ms
[1.845s][gc] GC pause (G1 Evacuation Pause) (young) 55.3M->0.9M(100M) 9.2ms
```

开启逃逸分析时，因为大量临时对象被标量替换，堆上分配的临时对象大幅减少，GC频率低、单次GC回收量小。关闭逃逸分析后，所有临时对象都在堆上分配，新生代迅速填满，GC频率提高了一倍，单次GC的回收量和停顿时间也显著增加。

#### 调优方案

**方案1：确保生产环境中逃逸分析开启**

最简单的方案就是确保`-XX:+DoEscapeAnalysis`没有被错误地关闭。这是默认行为（JDK 7+默认开启），但在以下情况可能被意外关闭：

- 拷贝JVM参数模板时误将加号写为减号（`-XX:-DoEscapeAnalysis`）。
- 某些"性能优化指南"错误地建议关闭逃逸分析（认为逃逸分析增加了编译时间，得不偿失）。
- 使用某些第三方框架或工具时，它们可能在配置中意外覆写了JVM参数。

**检查方案**：在生产环境的JVM启动参数中搜索`DoEscapeAnalysis`关键字，确认是`+DoEscapeAnalysis`（或未指定）而非`-DoEscapeAnalysis`。

**方案2：代码层面辅助逃逸分析**

即使逃逸分析开启，某些代码模式也会阻止逃逸分析生效。以下实践可以帮助逃逸分析更好地工作：

**避免不必要的返回值**：如果方法创建的临时对象只用于内部计算，不要将其返回。将计算结果直接作为标量值返回：

```java
// 不好的实践：返回对象引用，阻止逃逸分析
Point compute(int a, int b) {
    return new Point(a, b);
}

// 好的实践：直接返回标量值，逃逸分析友好
int compute(int a, int b) {
    Point p = new Point(a, b);
    return p.x() + p.y();
}
```

**避免将临时对象存入集合**：将临时对象存入`ArrayList`、`HashMap`等集合中，会导致对象逃逸——因为集合本身可能在方法外部。

```java
// 不好的实践：临时对象存入集合
List<Integer> process(List<Integer> input) {
    List<Integer> result = new ArrayList<>();
    for (int x : input) {
        Wrapper w = new Wrapper(x * 2);
        result.add(w.value());  // w 逃逸到了 result 中
    }
    return result;
}

// 好的实践：直接存储标量值
List<Integer> process(List<Integer> input) {
    List<Integer> result = new ArrayList<>();
    for (int x : input) {
        result.add(x * 2);  // 没有临时对象，直接存储标量
    }
    return result;
}
```

**使用Java record和不可变对象**：Java record（JDK 16+正式特性）的语义清晰，C2编译器可以从record的不可变性推断出更多优化信息。record字段的不可变性使得C2可以更安全地进行标量替换。

**分配合并（Allocation Merging）**：在同一个循环中，尝试复用临时对象，而不是每次都创建新的：

```java
// 不太好的实践：循环内创建大量临时对象
for (int i = 0; i < n; i++) {
    Point p = new Point(i, i * 2);
    result += p.x() + p.y();
}

// C2标量替换后，两者性能相同——如果逃逸分析开启。
// 但如果逃逸分析关闭，上述代码性能会显著下降。
// 因此，在编码阶段养成良好的习惯仍然很重要。
```

**方案3：利用JMH验证逃逸分析效果**

在生产环境中变更JIT相关参数之前，建议使用JMH（Java Microbenchmark Harness）进行基准测试，验证变更对性能的影响。JMH可以精确测量微小的性能差异，且其自带的`-prof gc`和`-prof perf`分析器可以输出对象分配率和GC信息：

```bash
java -jar jmh-benchmark.jar -prof gc -jvmArgs "-XX:-DoEscapeAnalysis"
```

通过对比开启和关闭逃逸分析的JMH结果，可以量化逃逸分析对特定业务代码的性能贡献。

#### 调优验证

验证逃逸分析效果的最直接方式是对比开启/关闭的性能差异。在生产环境中，推荐以下验证步骤：

1. **在压测环境中运行基准测试**：使用`EscapeAnalysisDemo`或JMH基准测试，分别用开启和关闭逃逸分析的参数运行。
2. **观察三个核心指标**：吞吐量（Ops/s）、GC频率（Young GC/min）、CPU使用率（%）。
3. **分析差异**：如果关闭逃逸分析后性能下降超过20%，说明应用大量依赖于对象标量替换优化。
4. **生产验证**：在生产环境的小规模节点上先进行灰度验证，观察业务指标（P99延迟、吞吐量、GC频率）的变化。

#### 小结

逃逸分析关闭后的性能回退是一个典型的JIT配置错误案例。它揭示了一个重要的原则：**JIT编译器的默认参数经过了大量验证，在没有充分理由的情况下，不要关闭默认开启的优化**。

逃逸分析在JDK 7及之后版本中默认开启，其价值已经在大规模生产环境中得到了充分验证。对于大多数Java应用，逃逸分析可以将热点代码中的对象分配开销降低数倍，同时减少GC压力。

调优逃逸分析的最佳实践：

1. **保持默认开启**：没有充分证据表明逃逸分析带来了负面影响，不要关闭它。
2. **代码辅助**：在编码时注意对象逃逸路径，避免无谓的对象返回和集合存储。
3. **验证配置**：定期检查生产环境的JVM参数，确保没有误关闭关键优化。
4. **综合评估**：在评估JIT优化效果时，使用Profiler和JMH等工具综合观察，而不是仅凭经验推断。

---

## 本章总结

### JIT诊断工具总结

| 工具/参数 | 用途 | 使用场景 |
|-----------|------|----------|
| `-XX:+PrintInlining` | 打印方法内联决策 | 诊断内联失效，查看哪些方法被内联/未内联 |
| `-Xlog:jit+compilation*=debug` | 打印编译详情（JDK 9+） | 查看编译事件、编译耗时、编译任务队列 |
| `-XX:+PrintCompilation` | 打印编译事件 | 查看每个方法的编译层级和时间 |
| `-XX:+PrintEscapeAnalysis` | 打印逃逸分析结果 | 查看哪些对象被标量替换/栈上分配 |
| `-Xlog:gc*=info` | GC日志 | 间接观察逃逸分析效果（对象分配率变化） |
| async-profiler | CPU采样火焰图 | 直观显示方法调用的CPU消耗占比 |
| JITWatch | JIT编译可视化分析 | 图形化查看内联决策、编译详情、汇编代码 |
| JMH | 微基准测试 | 精确测量JIT优化对微操作的性能影响 |
| `jcmd <pid> Compiler.*` | 运行时查看编译器状态 | 查看编译队列、Code Cache使用情况、已编译方法列表 |

### 优化参数速查

**内联相关参数：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:MaxInlineSize` | 35 | 方法字节码大小低于此值，总是内联 |
| `-XX:FreqInlineSize` | 325 | 热点方法字节码大小低于此值，可能内联 |
| `-XX:InlineSmallCode` | ~2000 | 编译后机器码大小低于此值的方法，可能被内联 |
| `-XX:MaxInlineLevel` | 9 | 嵌套内联的最大深度 |
| `-XX:MaxRecursiveInlineLevel` | 1 | 递归方法内联的最大深度 |
| `-XX:InlineFrequencyRatio` | 2.5 | 内联频率比阈值（用于间接调用内联决策） |

**编译线程与控制参数：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:CICompilerCount` | CPU核心数/3（最小2，最大16） | 编译器线程总数 |
| `-XX:+TieredCompilation` | true | 启用分层编译（JDK 8+默认） |
| `-XX:ReservedCodeCacheSize` | 240MB（JDK 21典型值） | Code Cache的最大大小 |
| `-XX:NonMethodCodeHeapSize` | ~136MB | 非方法代码（适配器、Stub）的Code Cache |
| `-XX:ProfiledCodeHeapSize` | ~212MB | Tier 1-3编译后代码的Code Cache |
| `-XX:NonProfiledCodeHeapSize` | ~184MB | Tier 4编译后代码的Code Cache |
| `-XX:CounterHalfLifeTime` | 30秒（Tiered） | 方法计数器衰减半衰期 |

**逃逸分析相关参数：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:+DoEscapeAnalysis` | true | 启用逃逸分析（JDK 7+默认） |
| `-XX:+EliminateAllocations` | true | 启用标量替换（基于逃逸分析） |
| `-XX:+EliminateLocks` | true | 启用锁消除（基于逃逸分析） |
| `-XX:+UseTLAB` | true | 启用线程本地分配缓冲区（减少线程竞争） |

### 常见JIT反直觉问题

1. **"逃逸分析关闭了为何性能下降了这么多？"**
   因为标量替换将大量临时对象的分配和回收开销完全消除，关闭后这些对象全部回到堆上分配，GC压力剧增。

2. **"为什么我的接口方法调用没有被内联？"**
   检查调用站点的类型Profile：如果有3个或以上的实现类被交替调用，C2会因多态分发而拒绝内联。使用`-XX:+PrintInlining`确认内联决策。

3. **"为什么增大Code Cache反而导致性能下降？"**
   Code Cache过大时，JVM管理Code Cache的开销增加（需要扫描更多的Code Cache区域进行回收）。合理做法是先监视实际使用量，再按需调整。

4. **"为什么分层编译下启动更慢了？"**
   C1在启动阶段消耗CPU进行编译，虽然提高了稳态性能，但可能增加了启动时间。对于启动速度敏感的应用，可以调低`CICompilerCount`或调高C1的编译阈值。

5. **"为什么同样的代码在JDK 11中比JDK 8慢？"**
   可能是由于分层编译策略的变化导致的Profile信息收集开销增加。JDK 9+的日志系统也增加了一定的运行时开销。但通常情况下，JDK 11+的稳态性能（经过充分预热后）优于JDK 8。

6. **"为什么我的synchronized代码没有被锁消除？"**
   检查锁对象是否逃逸出了当前线程。如果锁对象被赋值给一个静态字段或被传入其他线程可见的方法中，锁消除不会生效。使用`-XX:+PrintEliminateLocks`查看锁消除的决策。

7. **"为什么我的循环没有被展开？"**
   C2的循环展开决策基于循环体的大小和迭代次数。如果循环体太大（超过`LoopUnrollLimit`），或C2认为展开后的收益不高，就不会展开。对于小循环（迭代次数低于8），C2甚至可能选择完全展开（Full Unroll）。
