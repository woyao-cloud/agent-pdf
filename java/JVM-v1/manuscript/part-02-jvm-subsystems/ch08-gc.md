# 第8章 GC算法选型与调优

> 上一章我们讨论了JVM的内存布局与OOM排查——当内存溢出发生时，如何定位问题、分析根因并修复。而本章将从另一个视角切入：在内存尚未溢出之前，垃圾收集器（GC）是如何工作的？如何为不同的业务场景选择最合适的GC算法？又如何通过参数调优来满足严苛的延迟和吞吐量要求？
>
> GC调优是JVM性能优化中最具挑战性的领域之一。随着硬件的发展（数百GB堆、数百个CPU核心）和业务需求的演进（微秒级延迟要求），GC算法的选择与配置直接决定了Java应用的性能天花板。本章将从GC算法的演化历史出发，深入分析各代GC的核心原理与适用场景，并通过三个完整的案例展示调优的实战过程。

## 8.1 核心原理

### 8.1.1 GC算法演进路线

Java虚拟机问世二十余年来，垃圾收集技术经历了从简单到复杂、从暂停到并发、从单代到分代的持续演进。理解这条演进路线，是做好GC选型的前提。

**Serial收集器（JDK 1.3及以前）** 是最早的商用GC。它是一个单线程工作的收集器，在进行垃圾收集时，必须暂停所有工作线程（"Stop The World"，简称STW），直到收集结束。Serial收集器适用于单CPU、小堆（~100MB）的客户端模式应用。虽然简单粗暴，但在特定场景下效率很高——因为单线程没有线程切换开销，且内存小时停顿时间也可接受。

**Parallel收集器（JDK 1.4.2引入）** 是Serial的多线程版本，使用多个线程并行执行垃圾收集。Parallel的核心关注点是**吞吐量**（Throughput），即CPU用于运行用户代码的时间与CPU总消耗时间的比值。Parallel收集器提供了`-XX:ParallelGCThreads`控制并行线程数，`-XX:MaxGCPauseMillis`和`-XX:GCTimeRatio`来调节吞吐量目标。Parallel是JDK 8及之前版本的默认服务器模式GC，适合批处理、科学计算等对延迟不敏感但对吞吐量有较高要求的场景。

**CMS收集器（Concurrent Mark Sweep，JDK 1.5引入）** 是第一款真正意义上的并发收集器，目标是**最短回收停顿时间**。CMS实现了垃圾收集线程与用户线程的并发执行，将停顿时间降到较低水平。CMS使用标记-清除算法，分为初始标记（STW）、并发标记、重新标记（STW）和并发清除四个阶段。然而CMS存在三个显著的缺陷：对CPU资源敏感（并发阶段会占用CPU导致吞吐量下降）、无法处理浮动垃圾（Floating Garbage）、以及标记-清除算法导致的内存碎片问题。CMS在JDK 9中被标记为已弃用（Deprecated），JDK 14中被正式移除。

**G1收集器（Garbage First，JDK 7引入，JDK 9设为默认）** 是HotSpot里程碑式的GC实现。G1将整个Java堆划分为多个大小相等的Region（1MB-32MB），每个Region可以独立地扮演Eden、Survivor或Old角色。G1的核心思想是"优先回收收益最大的Region"——通过维护每个Region的垃圾比例列表，优先回收垃圾最多的Region，从而在有限的时间内获得最大的回收收益。G1使用SATB（Snapshot At The Beginning）算法实现并发标记，使用复制算法（而非标记-清除）来避免内存碎片。自JDK 9起，G1成为HotSpot的默认GC，并在后续版本中持续获得改进。

**ZGC收集器（Z Garbage Collector，JDK 11引入，JDK 15生产就绪）** 是低延迟GC的里程碑。ZGC追求的目标是：无论堆多大（最大支持16TB），停顿时间都不超过10ms。ZGC通过染色指针（Colored Pointers）技术、读屏障（Load Barrier）和并发重定位（Concurrent Relocation）等创新设计，将几乎所有GC阶段都做到并发执行。ZGC不采用分代设计（直到JDK 21引入分代ZGC预览），而是使用单一代来处理所有对象。ZGC的代价是吞吐量略低于G1，且内存占用稍高（染色指针需要额外元数据空间）。

**Shenandoah收集器（JDK 12引入，JDK 15生产就绪）** 是Red Hat开发的低延迟GC，与ZGC目标相似但实现思路不同。Shenandoah通过Brooks Pointer实现并发移动，通过"连接矩阵"（Connection Matrix）实现跨Region引用跟踪。Shenandoah与ZGC的核心区别在于：Shenandoah使用写屏障而非读屏障，且支持指针压缩（Compressed OOPs）。Shenandoah在JDK 21中已经相当成熟，但在国内生产环境的使用率远低于G1和ZGC。

**总结来看**，GC的演化史就是一部"尽可能减少STW时间"的历史。从Serial的单线程全停顿，到Parallel的多线程并行全停顿，到G1的Region分治、部分并发，再到ZGC/Shenandoah的几乎完全并发，每一次演进都在降低GC对应用延迟的影响。

### 8.1.2 分代收集理论

分代收集（Generational Collection）是当前绝大多数GC算法的理论基础。它的核心假设是**弱分代假说**（Weak Generational Hypothesis）：绝大多数对象都是朝生夕死的，存活时间极短。

基于这个假说，JVM将堆划分为不同的代（Generation）：
- **新生代（Young Generation）**：存放新创建的对象。新生代进一步划分为Eden区和两个Survivor区（From和To）。大多数对象在Eden区被分配，在Minor GC中被回收。新生代的GC非常频繁，但由于存活对象少，速度很快。
- **老年代（Old Generation）**：存放经过多次GC后仍然存活的对象。老年代的GC频率低得多，但一次GC的代价远高于新生代GC。

**新生代回收——复制算法**。新生代GC使用复制算法（Copying Algorithm）。该算法将内存分为两块（Eden和两个Survivor区本质上是将可用内存分为两块，只有Eden和一个Survivor可用，另一个Survivor作为复制目标）。GC时，将存活对象从Eden和正在使用的Survivor复制到另一个空的Survivor区，然后一次性清理掉Eden和原Survivor。复制算法的优点是实现简单、运行高效、不会产生内存碎片；缺点是需要额外的内存作为复制目标。

复制算法的效率高度依赖于存活对象比例。在新生代中，存活率通常很低（一般在10%以下），因此复制算法极为高效——只需要复制少量存活对象，大部分内存可以快速回收。这也解释了为什么新生代GC（Minor GC）通常很快（几毫秒到几十毫秒）。

**老年代回收——标记-整理算法**。老年代的GC不能使用复制算法，因为老年代的对象存活率高，复制成本太高。老年代常用的算法是标记-整理（Mark-Compact）算法，分为标记和整理两个阶段：标记阶段找出所有存活对象，整理阶段将所有存活对象向内存空间的一端移动，然后清理掉边界以外的内存。标记-整理算法没有内存碎片，但整理阶段的移动操作需要STW，且移动的开销与存活对象数量成正比。

G1收集器采用了更精细化的方法：它在Region级别使用复制算法（将存活对象从垃圾多的Region复制到空闲Region），实现了类似标记-整理的效果，但只复制部分Region中的存活对象，而不是整个老年代。

JDK 21中还有一个重要的分代优化：**分代ZGC**（Generational ZGC）。传统的不分代ZGC将所有对象一视同仁——GC时必须扫描整个堆中的所有存活对象。分代ZGC引入了年轻代和老年代的概念，使得ZGC可以更频繁地回收年轻代（对象死亡率高），从而降低GC开销。JDK 21中分代ZGC作为预览特性可用（通过`-XX:+ZGenerational`启用），JDK 22中转为正式特性。

### 8.1.3 STW与并发：安全点、三色标记与SATB

**安全点（Safepoint）** 是实现STW的基础机制。当JVM需要执行GC时，并非可以随时暂停线程——线程必须在到达安全点后才可以暂停。安全点是线程执行过程中的一些特定位置，在这些位置上，线程的状态是确定且一致的，JVM可以安全地检查和管理线程的状态。

安全点的选取准则：选择"是否让程序长时间运行"的特征作为标准。典型的SafePoint包括：方法返回前、循环的末尾、抛出异常的位置等。安全点不能太少（否则线程等很久才能暂停），也不能太多（否则增加运行时开销）。

当JVM需要触发GC时，会设置一个标志位，每个线程在运行时主动轮询这个标志。当发现标志被设置时，线程在到达最近的安全点后挂起。这个过程称为"主动式"（Voluntarily）暂停——线程自己检查、自己暂停，而非被外部强制中断。

**三色标记（Tri-color Marking）** 是并发标记阶段的核心算法。它将所有对象分为三种颜色：
- **白色**：尚未被标记的对象。在标记阶段结束时，白色对象被认为是不可达的，将被回收。
- **灰色**：已经被标记，但其引用的对象尚未被完全扫描。灰色对象是标记工作的"任务队列"。
- **黑色**：已经被标记，且其所有引用对象也已经被标记。黑色对象被认为是完全可达的。

标记过程从GC Roots开始，初始时所有对象为白色，GC Roots直接引用的对象标记为灰色并加入队列。然后从灰色队列中取出对象，将其引用的所有白色对象标记为灰色，当前对象变为黑色。重复这个过程直到灰色队列为空。最终所有白色对象被判定为不可达。

三色标记的最大问题是**并发导致的漏标**（Missing Mark）问题。当GC线程和用户线程并发运行时，用户线程可能：
1. 将黑色对象对白色对象的引用删除（黑色对象不再引用白色对象）
2. 将灰色对象对白色对象的引用删除，同时将另一个黑色对象对该白色对象的引用插入

这两个条件同时满足时，白色对象会被错误地当作垃圾回收（实际上它仍被引用），导致程序崩溃。为了解决这个问题，不同GC采用了不同的策略：

**CMS的增量更新（Incremental Update）**：当黑色对象插入新的指向白色对象的引用时，将黑色对象重新标记为灰色。这样在重新标记阶段，CMS会重新扫描这些灰色对象，确保不会漏标。增量更新的问题是需要在重新标记阶段扫描大量对象，导致STW时间较长。

**G1的SATB（Snapshot At The Beginning）**：在并发标记开始时，对当前的对象关系图拍一张快照。在并发标记期间，所有新分配的对象的引用关系变化都被记录在SATB缓冲区中。标记完成后，SATB缓冲区中的变化会被处理（最终标记阶段，STW）。SATB的核心思想是"标记开始时的快照"——即使后续引用关系发生变化，也按照快照来决定哪些对象存活。这样做的代价是可能产生浮动垃圾（Floating Garbage），即标记时存活、但标记过程中变为垃圾的对象不会被回收，需要等到下一次GC。浮动垃圾的代价远低于漏标的代价，所以SATB是一种"宁可多留一些垃圾，也不误杀一个存活对象"的策略。

**ZGC的读屏障（Load Barrier）**：ZGC使用读屏障而非写屏障。当用户线程从堆中加载一个对象引用时，读屏障检查引用的地址是否已经被重定位。如果已重定位，则通过"自愈"（Self-healing）机制更新引用指向新的地址。读屏障允许ZGC并发执行对象重定位，而无需STW。

### 8.1.4 不可能三角：吞吐量、延迟与内存占用

GC调优中存在一个著名的"不可能三角"（Impossible Triangle）：**吞吐量（Throughput）、延迟（Latency）和内存占用（Memory Footprint）** 三者不可兼得，最多只能优化其中两个。

- **吞吐量**：CPU用于执行用户代码的时间占总CPU时间的比例。高吞吐量意味着更少的CPU时间花在GC上。
- **延迟**：GC导致的STW时间，或者从请求发起到响应完成的时间。低延迟意味着GC停顿时间短，应用响应更稳定。
- **内存占用**：JVM堆的大小。较小的堆意味着更高的内存利用率，但GC会更频繁。

这三个维度之间存在着直接的权衡关系：

**吞吐量与延迟的权衡**。要获得高吞吐量，GC应该尽可能少运行、运行时间长一点但每次处理更多垃圾。Parallel收集器选择的就是这条路——它让GC线程以最大能力运行，STW时间可能较长（数百毫秒甚至数秒），但GC总时间占比低。要获得低延迟，GC应该频繁运行但每次时间短——G1和ZGC选择的就是这条路。它们通过并发执行大部分GC工作来降低单次停顿时间，但并发本身会占用CPU资源，降低吞吐量。

**内存占用与延迟的权衡**。更大的堆意味着GC可以更少地运行，但每次GC需要扫描和处理的区域更大，单次停顿时间可能更长。更小的堆意味着GC更频繁地运行，但单次停顿时间更短。然而这并非绝对——对于并发收集器（如ZGC），更大的堆可能不会显著增加停顿时间，但会增加内存开销（例如ZGC需要额外的染色指针元数据）。

**吞吐量与内存占用的权衡**。更大的堆允许GC以更低的频率运行，吞吐量更高；更小的堆需要GC更频繁地运行，吞吐量降低。这在Parallel收集器上表现得最为明显。

在实际调优中，不存在"最好的GC"——只有"最适合业务场景的GC"。调优的本质是在不可能三角中找到最符合业务需求的平衡点。一个常用的方法是：**先确定延迟要求（SLA），再在满足延迟的前提下最大化吞吐量**。对于大多数互联网服务（延迟敏感），应优先选择G1或ZGC；对于批处理任务（吞吐量敏感），Parallel可能是更好的选择。

### 8.1.5 JDK 21的默认GC：G1

自JDK 9起，G1就是HotSpot的默认垃圾收集器。JDK 21延续了这一默认选择，同时进一步优化了G1的并发标记和混合回收效率。

G1的核心设计理念包括：

**Region化堆布局**。G1将堆划分为多个大小相等的Region，每个Region的大小由`-XX:G1HeapRegionSize`控制（范围为1MB到32MB，必须是2的幂，默认根据堆大小自动计算）。Region是G1一切操作的基本单位——GC的标记、复制、回收都在Region级别进行。

**分代Region**。每个Region扮演特定的代角色：新生代（Eden或Survivor）或老年代（Old）。新生代Region的数量会动态调整——G1会根据实际的GC统计信息（对象分配速率、晋升速率）自动调整新生代大小，以适应不同的负载模式。

**停顿时间预测模型**。G1维护了一个基于历史数据的停顿时间预测模型。每次GC前，G1会根据预测模型估算在不同数量的Region上执行GC所需的停顿时间，然后选择在`-XX:MaxGCPauseMillis`（默认200ms）内能完成的最大Region集合。这个预测模型基于指数加权移动平均（EWMA），会不断根据实际GC数据调整。

**并发标记周期**。G1的并发标记周期（Concurrent Marking Cycle）包括以下阶段：
1. 初始标记（Initial Mark，STW）：标记GC Roots直接引用的对象。
2. 并发标记（Concurrent Marking）：从GC Roots出发，遍历所有可达对象。此阶段与用户线程并发执行。
3. 最终标记（Final Mark，STW）：处理SATB缓冲区中的引用变化，完成标记。
4. 筛选回收（Live Data Counting，并发）：计算每个Region中存活对象的数据量，排序生成回收收益列表。
5. 混合回收（Mixed GC，STW）：从收益最高的Region开始执行复制回收。可能有多次Mixed GC才能完成一轮回收。

值得注意的是，**Mixed GC是G1的关键创新**。在传统的分代收集中，新生代GC只回收新生代，Full GC回收整个堆。而G1的Mixed GC可以同时回收新生代Region和部分老年代Region（选择了那些垃圾比例高、回收收益大的Region）。这使得G1可以在不触发Full GC的情况下，逐步回收老年代的垃圾。

### 8.1.6 GC日志配置

GC日志是GC调优最重要的信息来源。JDK 9及之后版本使用统一的日志系统（`-Xlog`），取代了JDK 8及之前的多个独立日志参数。

`-Xlog`的基本语法：`-Xlog:[tag1[+tag2...]][*][=level][:output][:options]`

常用配置示例：

```
# 记录所有GC信息到文件gc.log，包含时间戳和进程ID
-Xlog:gc*=info:file=gc.log:time,uptime,pid,tid

# 记录G1详细GC信息到文件
-Xlog:gc+g1*=debug:file=gc-g1.log:time,uptime

# 记录GC停顿时间（STW）到文件
-Xlog:safepoint=info:file=safepoint.log:time,uptime

# 记录GC + 堆信息 + 元空间信息到文件
-Xlog:gc*=info,heap*=debug,metaspace*=debug:file=gc-detail.log:time,uptime

# 记录GC基本信息到stdout
-Xlog:gc*=info

# JDK 21中启用分代ZGC日志
-XX:+UseZGC -XX:+ZGenerational -Xlog:gc+z*=info:file=gc-z.log:time,uptime
```

关键日志Tag包括：`gc`（GC基础信息）、`gc+g1`（G1详细信息）、`gc+z`（ZGC详细信息）、`gc+region`（Region信息）、`gc+heap`（堆变化）、`safepoint`（安全点信息）、`gc+phases`（GC各阶段耗时）。

GC日志的分析工具：对于小型日志可以直接用文本编辑器查看；对于长时间运行的生产环境日志（可能达到数GB），应使用专门的GC日志分析工具，如GCeasy、GCViewer、JITWatch等。本章的Case 8-3将详细展示如何使用Java程序解析和分析GC日志。

---

## 8.2 案例实践

### Case 8-1: G1停顿时间调优

#### 场景与问题

某互联网公司的核心交易服务运行在16核心、32GB堆的JVM上，使用G1作为GC。业务要求P99延迟小于50ms。在高峰期，运维团队发现GC停顿时间频繁超过200ms，部分场景甚至达到500ms以上，直接导致P99延迟飙升到200ms以上，触发业务告警。

G1的停顿时间目标（`-XX:MaxGCPauseMillis`）默认是200ms。从表面看，200ms的GC目标不应该导致500ms的停顿——问题出在哪里？

#### 工具与准备

本次调优使用以下工具：
- `G1TuningDemo`程序（本章提供的演示程序），用于模拟高分配率服务的GC行为
- `-Xlog:gc*=info:file=gc.log:time,uptime` 记录GC日志
- `GcLogAnalyzer`程序（本章提供的分析工具），用于解析和统计GC停顿时间
- JDK 21自带的JFR（Java Flight Recorder），通过 `jfr` 命令分析GC事件

#### 问题分析

首先，让我们运行G1TuningDemo程序，使用默认的G1参数：

```bash
# 运行演示程序（默认G1参数）
java -Xmx2g -Xms2g -XX:+UseG1GC \
     -Xlog:gc*=info:file=gc.log:time,uptime,pid,tid \
     -cp jvm-cases.jar com.jvmbook.ch08.G1TuningDemo

# 在另一个终端，观察GC日志
tail -f gc.log
```

G1TuningDemo程序模拟了一个高分配率服务：它维持约500MB的存活数据（预热阶段先填充到500MB），然后进入稳态循环。每个循环分配5MB的变长大对象（随机16KB-100KB），其中约60%会保留（替换已有对象），其余在GC时被回收。每两次分配之间休眠200ms，模拟真实服务的"处理-分配-等待"模式。

通过GcLogAnalyzer分析默认参数下的GC日志：

```bash
java -cp jvm-cases.jar com.jvmbook.ch08.GcLogAnalyzer gc.log
```

输出示例：
```
=== GC Log Analysis Report ===
Log file: gc.log
Total GC pauses: 847
Total pause time: 32457.23 ms
Average pause time: 38.32 ms
Max pause time: 482.15 ms
===============================
```

从报告中可以看到关键问题：**最大停顿时间482ms，远超200ms的目标值**。这意味着G1的停顿预测模型未能有效约束实际停顿时间。

为什么会这样？深入分析GC日志（查看gc.log中的具体停顿事件）：

```
[2026-05-26T10:15:23.456+0800][0.847s] GC pause (G1 Evacuation Pause) (young) 483.21ms
[2026-05-26T10:15:23.789+0800][1.179s] GC pause (G1 Evacuation Pause) (mixed) 421.58ms
```

注意看`(young)`和`(mixed)`的区别：
- **Young GC**：只回收新生代Region，通常较快。
- **Mixed GC**：回收新生代Region + 部分老年代Region，耗时更长。

发现最大停顿发生在大对象分配（Humongous Allocation）触发的GC上。G1中大对象是指大小超过半个Region的对象。由于我们的代码分配了16KB-100KB的变长块，大部分是普通对象，但当对象大小超过Region的一半时，G1会将其分配在连续的Humongous Region中。Humongous区域的分配和回收比普通对象更复杂，容易导致较长的停顿。

进一步分析发现几个关键问题：

1. **Region大小不合理**。默认2GB堆的Region大小为2MB（G1默认目标最少2048个Region）。2MB的Region意味着超过1MB的对象被视为大对象。我们的代码分配了最大100KB的对象，所以没有触发大对象问题。但Region太小会导致需要管理的Region数量过多，增加了GC的扫描开销。

2. **IHOP（InitiatingHeapOccupancyPercent）阈值过高**。默认IHOP为45%，即当老年代占用达到堆的45%时触发并发标记。如果分配速率过高，在并发标记完成前老年代可能被快速填满，导致G1退化为Full GC（使用单线程的Serial GC进行全堆整理，停顿极长）。

3. **Mixed GC阶段回收不充分**。Mixed GC默认回收收益（Garbage百分比）低于一定阈值的老年代Region不会被选中。如果阈值设置不合适，可能导致每次Mixed GC回收的老年代垃圾不足，需要多轮Mixed GC才能完成一轮回收，增加了总停顿时间。

#### 调优方案

基于以上分析，制定以下调优方案：

**1. 调整Region大小**

```bash
-XX:G1HeapRegionSize=4m
```

将Region从默认的2MB增大到4MB。较大的Region可以减少Region总数，降低扫描开销。同时，大对象的阈值变为2MB，我们的100KB对象不会被视为大对象，避免了Humongous分配的特殊处理。

**2. 调整停顿时间目标**

```bash
-XX:MaxGCPauseMillis=100
```

将停顿时间目标从200ms降低到100ms。这告诉G1的停顿预测模型：我需要更短的停顿。G1会通过调整新生代大小来适应这个目标——新生代越小，每次GC需要处理的对象越少，停顿时间越短，但GC频率会升高。这是一个在停顿时间和GC频率之间的权衡。

**3. 调整IHOP阈值**

```bash
-XX:InitiatingHeapOccupancyPercent=60
```

将IHOP从45%提高到60%。较高的IHOP意味着G1会更晚地触发并发标记周期。在高分配速率场景中，如果IHOP太低，G1会频繁触发并发标记，而并发标记本身会占用CPU资源。提高IHOP可以减少并发标记的频率，降低CPU开销。但需要注意：IHOP过高可能导致在并发标记完成前老年代被填满，触发Full GC。需要根据实际分配速率和晋升速率来调整。

**4. 调整Mixed GC参数**

```bash
-XX:G1MixedGCLiveThresholdPercent=85
-XX:G1MixedGCCountTarget=8
```

`G1MixedGCLiveThresholdPercent`（默认85%）控制哪些老年代Region参与Mixed GC：只有存活对象占比低于此值的Region才会被回收。将其保持在85%意味着只有垃圾占比超过15%的Region才会被回收，这是一个合理的阈值。

`G1MixedGCCountTarget`（默认8）控制一轮混合回收中最多执行多少次Mixed GC。将其设为8意味着G1会将回收工作分散到最多8次Mixed GC中完成，每次停顿更短，但总回收时间更长。如果业务对总停顿时间不太敏感但对单次停顿非常敏感，可以增加这个值。

#### 调优验证

使用优化后的参数运行G1TuningDemo：

```bash
java -Xmx2g -Xms2g -XX:+UseG1GC \
     -XX:G1HeapRegionSize=4m \
     -XX:MaxGCPauseMillis=100 \
     -XX:InitiatingHeapOccupancyPercent=60 \
     -XX:G1MixedGCLiveThresholdPercent=85 \
     -XX:G1MixedGCCountTarget=8 \
     -Xlog:gc*=info:file:gc-tuned.log:time,uptime,pid,tid \
     -cp jvm-cases.jar com.jvmbook.ch08.G1TuningDemo
```

分析优化后的GC日志：

```bash
java -cp jvm-cases.jar com.jvmbook.ch08.GcLogAnalyzer gc-tuned.log
```

输出示例：
```
=== GC Log Analysis Report ===
Log file: gc-tuned.log
Total GC pauses: 1234
Total pause time: 35102.45 ms
Average pause time: 28.45 ms
Max pause time: 112.30 ms
===============================
```

优化前后的对比：

| 指标 | 默认参数 | 调优参数 | 改善 |
|------|----------|----------|------|
| 最大停顿时间 | 482.15 ms | 112.30 ms | 76.7% |
| 平均停顿时间 | 38.32 ms | 28.45 ms | 25.8% |
| 总停顿次数 | 847 | 1234 | +45.7% |
| 总停顿时间 | 32457 ms | 35102 ms | +8.1% |

关键观察：**最大停顿时间从482ms降低到112ms**，但GC次数增加了45.7%，总停顿时间增加了8.1%。这就是吞吐量与延迟之间的直接权衡——G1通过更频繁但更短的GC来满足更严格的停顿时间目标。

对于这个业务场景（P99延迟<50ms），优化后的112ms最大停顿仍然偏大，需要进一步调整。可能的后续优化：
- 进一步降低`MaxGCPauseMillis`到50ms
- 考虑切换到ZGC（如果吞吐量损失可以接受）
- 启用分代ZGC（JDK 21+）
- 调整堆大小（增大堆可以降低GC频率，但可能增加单次停顿时间）

#### 小结

G1停顿时间调优的核心是理解停顿预测模型的行为，以及各参数之间的相互影响。没有"一刀切"的最佳参数组合，每个参数调整都涉及吞吐量、延迟和内存占用之间的权衡。调优的关键步骤是：**先测量（收集GC日志）、再分析（找出瓶颈）、然后调整（针对性修改参数）、最后验证（对比优化前后指标）**。

### Case 8-2: ZGC大堆配置

#### 场景与问题

某大数据平台的内存分析服务使用128GB堆的JVM来处理数TB的日志数据。业务要求：最大GC停顿时间不超过10ms，服务可用性>99.99%。原有的G1在如此大的堆上难以维持低停顿——Mixed GC的停顿经常超过500ms。团队决定切换到ZGC。

#### 工具与准备

- JDK 21+（ZGC已生产就绪）
- JFR配置：`-XX:StartFlightRecording:filename=zgc.jfr`
- ZGC日志：`-Xlog:gc+z*=info:file=gc-z.log:time,uptime`

#### 问题分析

ZGC（Z Garbage Collector）的设计目标就是在大堆场景下实现极低延迟（<10ms）。ZGC通过以下技术实现这一目标：
- **染色指针（Colored Pointers）**：在64位指针的高位存储元数据（标记状态、重定位状态等），无需额外的对象头空间。
- **读屏障（Load Barrier）**：在加载对象引用时检查指针状态，实现并发标记和并发重定位。
- **并发重定位（Concurrent Relocation）**：ZGC可以在不暂停用户线程的情况下移动对象，通过读屏障的"自愈"机制确保引用一致性。

然而，在大堆（128GB）场景下，ZGC也面临一些挑战：

1. **并发标记阶段耗时**。虽然标记是并发的，但在128GB的堆上，即使使用多线程并发标记，完整的标记周期仍可能持续数秒。虽然标记阶段不STW，但长时间的并发标记会占用CPU资源，影响应用吞吐量。

2. **内存开销**。ZGC的染色指针需要额外的元数据。对于128GB的堆，ZGC需要约3-4GB的额外内存用于元数据（包括转发表、标记位图等）。

3. **分配速率与GC频率**。如果对象分配速率很高，ZGC可能无法跟上分配速率，导致"分配压力"（Allocation Pressure）升高，触发更频繁的GC，甚至可能出现"分配失速"（Allocation Stall）——用户线程因为找不到可用内存而被迫等待。

#### 调优方案

针对128GB大堆场景，以下参数配置经生产验证有效：

**1. 并发GC线程数**

```bash
-XX:ConcGCThreads=8
```

`ConcGCThreads`控制ZGC并发阶段使用的线程数。默认情况下，ZGC根据CPU核心数自动计算（`ConcGCThreads = (ParallelGCThreads + 2) / 4`）。但是在128GB的大堆场景下，默认的并发线程数可能不足，导致并发标记和并发重定位阶段耗时过长。

将ConcGCThreads设置为8（假设服务器有16-32个CPU核心），可以在不显著影响应用吞吐量的前提下，加速并发GC阶段的执行。

**2. 分配压力容忍度**

```bash
-XX:ZAllocationSpikeTolerance=4.0
```

`ZAllocationSpikeTolerance`控制ZGC对分配速率突增的容忍度。默认值为2.0，意味着ZGC会预留足够的内存空间以应对当前分配速率2倍的增长。对于高分配速率的服务（如日志分析、数据ETL），可以提高此值，减少因分配速率突增导致的GC频率升高。

提高此值的代价是ZGC会预留更多的空闲内存，导致内存利用率降低。在128GB的堆上，这是一个可以接受的权衡。

**3. NUMA亲和性**

```bash
-XX:+UseNUMA
```

对于多路服务器（多个物理CPU，每个CPU有自己的本地内存），启用NUMA感知的内存分配可以显著提升ZGC的性能。ZGC会尽量在请求线程所在的NUMA节点上分配内存，减少跨节点访问的延迟。

在128GB堆的服务器上，启用了`-XX:+UseNUMA`后，ZGC的内存分配吞吐量可以提升15%-30%。

**4. 透明大页（THP）**

```bash
-XX:+ZUncommit
-XX:ZUncommitDelay=300
```

ZGC支持使用透明大页（Transparent Huge Pages）来管理内存。大页可以减少TLB（Translation Lookaside Buffer）未命中，提升内存访问性能。对于128GB的大堆，大页的效果尤为明显。

在操作系统中也需要启用THP：
```bash
echo always > /sys/kernel/mm/transparent_hugepage/enabled
echo advise > /sys/kernel/mm/transparent_hugepage/defrag
```

#### 完整启动命令

```bash
java -Xmx128g -Xms128g \
     -XX:+UseZGC \
     -XX:ConcGCThreads=8 \
     -XX:ZAllocationSpikeTolerance=4.0 \
     -XX:+UseNUMA \
     -XX:+ZUncommit \
     -XX:ZUncommitDelay=300 \
     -XX:StartFlightRecording:filename=zgc.jfr \
     -Xlog:gc+z*=info:file=gc-z.log:time,uptime \
     -jar big-data-service.jar
```

#### 调优验证

使用JFR查看ZGC的GC事件：

```bash
jfr print --events ZGC zgc.jfr
```

输出示例：
```
ZGC Cycle (id=42)
  Start: 2026-05-26T14:30:00.123Z
  End: 2026-05-26T14:30:00.456Z
  Duration: 333 ms (并发总耗时，非STW)
  Pause Mark Start: 0.05 ms (STW)
  Pause Mark End: 0.08 ms (STW)
  Concurrent Mark: 280 ms
  Concurrent Relocate: 45 ms

ZGC Cycle (id=43)
  Pause Mark Start: 0.04 ms
  Pause Mark End: 0.07 ms
```

从JFR输出可以看到，ZGC的STW时间（Pause Mark Start和Pause Mark End）只有几十微秒到几百微秒，完全满足<10ms的延迟要求。并发阶段的总耗时（333ms）虽然较长，但用户线程在此阶段可以正常运行，不会影响服务延迟。

通过GC日志分析ZGC的各阶段耗时：

```bash
jfr print --events ZGC ZGCAllocationStall zgc.jfr
```

如果没有Allocation Stall事件输出，说明ZGC的内存分配压力在可控范围内，没有出现用户线程被迫等待内存的情况。

#### 扩展：分代ZGC vs 不分代ZGC

JDK 21引入了分代ZGC的预览特性（`-XX:+ZGenerational`），JDK 22转为正式特性。分代ZGC将堆分为年轻代和老年代，对年轻代使用更激进的回收策略。

分代ZGC的优势：
- **更低的CPU开销**。通过区分年轻代和老年代，避免了每次GC都扫描全堆（堆中大部分是长期存活的对象）。
- **更快的对象分配**。年轻代回收频率更高，每次回收范围更小，整体GC效率更高。

不分代ZGC的优势：
- **更可预测的停顿时间**。不分代ZGC每次GC都处理所有对象，停顿时间更加稳定。
- **更简单的调优**。不需要调整分代比例，参数更少。

在我们的128GB大堆场景中，如果对象创建速率很高（大量临时对象），分代ZGC通常表现更好。如果对象生命周期很长（缓存、状态数据），不分代ZGC可能是更简单、更稳定的选择。

启动分代ZGC的命令：
```bash
java -Xmx128g -Xms128g \
     -XX:+UseZGC \
     -XX:+ZGenerational \
     -XX:ConcGCThreads=8 \
     ...其他参数...
```

#### 小结

ZGC将大堆场景下的GC停顿时间从数百毫秒降低到微秒级，是低延迟应用的首选GC。但ZGC并非银弹——它的吞吐量通常低于G1，且需要更多的内存用于元数据。在调优ZGC时，应重点关注`ConcGCThreads`（并发线程数）、`ZAllocationSpikeTolerance`（分配容忍度）和NUMA亲和性，并根据对象分配模式决定是否启用分代ZGC。

### Case 8-3: GC日志分析与自动化告警

#### 场景与问题

某金融科技公司的核心支付系统运行在数十台服务器上。运维团队发现，在某些时段（如促销活动期间），部分服务器的GC频率异常升高，偶尔出现长时间的Full GC。需要建立一套自动化的GC监控和告警机制，在GC指标异常时及时通知运维人员。

#### 工具与准备

- GcLogAnalyzer程序（本章提供的分析工具）
- Prometheus + Grafana指标监控体系
- GCeasy（gceasy.io）用于在线GC日志分析
- 自定义GC指标导出器

#### 方案设计

整体方案分为三个层次：

**第一层：GC日志解析层**
- 定时收集各服务器的GC日志
- 使用类似GcLogAnalyzer的工具解析GC事件
- 提取关键指标：GC频率（次/分钟）、平均停顿时间、最大停顿时间、吞吐量损失

**第二层：指标暴露层**
- 将解析后的指标转换为Prometheus格式
- 通过JMX Exporter或自定义Exporter暴露指标
- Prometheus定期抓取各服务器的GC指标

**第三层：告警与可视化层**
- Grafana仪表盘展示GC指标的实时趋势
- Alertmanager配置告警规则
- 当GC指标超过阈值时，通过邮件/钉钉/企业微信通知运维

#### 关键指标与告警阈值

以下是一套经过生产验证的GC告警阈值模板：

| 指标 | 严重级别 | 告警阈值 | 说明 |
|------|----------|----------|------|
| Young GC频率 | Warning | > 10次/分钟 | GC频率异常升高 |
| Young GC频率 | Critical | > 30次/分钟 | GC频率极高，分配压力大 |
| Full GC频率 | Warning | > 1次/小时 | 出现Full GC |
| Full GC频率 | Critical | > 1次/5分钟 | Full GC频率异常 |
| GC吞吐量 | Warning | < 97% | GC消耗CPU超过3% |
| GC吞吐量 | Critical | < 95% | GC消耗CPU超过5% |
| 最大STW时间 | Warning | > 200ms | 单次停顿过长 |
| 最大STW时间 | Critical | > 1000ms | 严重长停顿 |
| GC后堆使用率 | Warning | > 80% | 堆回收效率下降 |
| GC后堆使用率 | Critical | > 90% | 老年代几乎不可回收 |

#### 实施方案

**1. GC日志标准化**

确保各服务器的GC日志配置统一，便于解析：
```bash
-Xlog:gc*=info:file=/var/log/jvm/gc-%t.log:time,uptime,pid:filecount=10,filesize=10m
```

此配置将GC日志写在`/var/log/jvm/`目录下，包含时间戳和进程ID，最多保留10个文件，每个文件最大10MB。

**2. 使用GcLogAnalyzer进行日志分析**

GcLogAnalyzer程序可以直接用于生产环境的GC日志分析：

```bash
java -cp jvm-cases.jar com.jvmbook.ch08.GcLogAnalyzer /var/log/jvm/gc-2026-05-26.log
```

输出包含总GC次数、总/平均/最大停顿时间，这些都是告警系统需要的基础指标。

**3. Prometheus指标暴露**

可以扩展GcLogAnalyzer增加Prometheus格式的输出，或者使用JMX Exporter直接暴露GC相关的JMX指标。G1和ZGC都会通过JMX暴露丰富的GC统计信息，包括：
- `java.lang:type=GarbageCollector,name=G1 Young Generation`
- `java.lang:type=GarbageCollector,name=G1 Old Generation`
- `java.lang:type=MemoryPool,name=G1 Eden Space`
- `java.lang:type=MemoryPool,name=G1 Survivor Space`
- `java.lang:type=MemoryPool,name=G1 Old Gen`

通过JMX Exporter配置：

```yaml
# jmx_exporter_config.yml
rules:
  - pattern: 'java.lang<type=GarbageCollector><>CollectionCount'
    name: jvm_gc_collection_count
    type: COUNTER
  - pattern: 'java.lang<type=GarbageCollector><>CollectionTime'
    name: jvm_gc_collection_time_ms
    type: COUNTER
```

Prometheus告警规则配置：

```yaml
# prometheus-alerts.yml
groups:
  - name: gc-alerts
    rules:
      - alert: HighGCFrequency
        expr: rate(jvm_gc_collection_count{gc="G1 Young Generation"}[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Young GC frequency > 10/min on {{ $labels.instance }}"

      - alert: CriticalGCFrequency
        expr: rate(jvm_gc_collection_count{gc="G1 Young Generation"}[5m]) > 30
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Young GC frequency > 30/min on {{ $labels.instance }}"

      - alert: FullGCOccurred
        expr: increase(jvm_gc_collection_count{gc="G1 Old Generation"}[1h]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Full GC occurred on {{ $labels.instance }}"
          description: "G1 Old Generation GC triggered. Check GC log for details."

      - alert: LowGcThroughput
        expr: (1 - rate(jvm_gc_collection_time_ms[5m]) / (rate(jvm_gc_collection_time_ms[5m]) + 300000)) * 100 < 95
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "GC throughput < 95% on {{ $labels.instance }}"

      - alert: LongGcPause
        expr: rate(jvm_gc_collection_time_ms{gc="G1 Young Generation"}[5m]) / rate(jvm_gc_collection_count{gc="G1 Young Generation"}[5m]) > 200
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Average Young GC pause > 200ms on {{ $labels.instance }}"
```

**4. Grafana仪表盘**

Grafana仪表盘应包含以下面板：
- GC频率趋势图（次/分钟，按GC类型区分）
- GC停顿时间趋势图（平均/最大/99分位，ms）
- GC吞吐量趋势图（百分比）
- GC后各内存池使用率趋势图
- Full GC事件时间表

仪表盘的时间范围建议设置为最近1小时（实时监控）、最近24小时（趋势分析）和最近7天（长期趋势）。

**5. 异常模式识别**

通过长期收集的GC指标数据，可以识别以下异常模式：

**模式1：内存泄漏**。GC频率随时间稳步上升，GC后堆使用率越来越高，最终触发OOM。应对方案：配合堆转储分析（Heap Dump + MAT）定位泄漏对象。

**模式2：分配尖峰**。GC频率在特定时段突然升高，堆使用率在GC后正常回落。应对方案：分析业务流量模型，增加该时段的资源预留，或优化对象分配代码。

**模式3：元空间膨胀**。GC总时间增加但堆使用率正常，Full GC频繁。应对方案：检查`Metaspace`使用率，分析类加载行为，排查类加载器泄漏。

**模式4：晋升失败**。新生代GC时间异常长，老年代使用率在GC后不降反升。应对方案：调整新生代大小或晋升阈值，或增大老年代空间。

#### 告警响应流程

当收到GC告警时，建议按以下步骤响应：

1. **确认告警**：查看Grafana仪表盘，确认GC指标确实异常。
2. **收集现场**：保存当前GC日志、堆转储（如果可用）、JFR记录。
3. **初步诊断**：使用GCeasy分析GC日志，使用GcLogAnalyzer统计指标。
4. **根因定位**：根据异常模式判断根因（内存泄漏？分配尖峰？晋升失败？）。
5. **临时处置**：如果是内存泄漏，可以临时增大堆或重启服务；如果是分配尖峰，可以增加限流或扩容。
6. **修复跟进**：根据根因创建Bug或优化任务，安排修复排期。
7. **复盘验证**：修复上线后，持续监控GC指标，确认问题解决。

#### 小结

GC自动化告警体系的建立，是GC调优从"被动救火"到"主动预防"的关键一步。通过标准化的日志配置、自动化的指标采集、智能化的异常识别和规范化的响应流程，运维团队可以在GC问题影响业务之前及时发现并介入。需要注意的是，告警阈值需要根据业务的具体特征进行调整——不同的业务流量、不同的分配模式、不同的延迟要求，对GC指标的容忍度是不同的。建议在运行初期使用较宽松的阈值，逐步积累数据后再进行优化。

---

## 8.3 本章总结

### GC选型决策树

```
应用需要多低的延迟？
├── 延迟敏感 (<10ms) → 是否大堆(>100GB)?
│   ├── 是 → ZGC 或 Shenandoah
│   └── 否 → G1 (合理配置 MaxGCPauseMillis)
├── 延迟中等 (10-200ms) → G1
└── 延迟不敏感 (>200ms) → 是否吞吐量优先?
    ├── 是 → Parallel GC
    └── 否 → G1
```

### 参数速查表

| 参数 | 默认值 | 适用GC | 说明 |
|------|--------|--------|------|
| `-XX:+UseG1GC` | JDK 9+默认 | G1 | 启用G1 |
| `-XX:+UseZGC` | 否 | ZGC | 启用ZGC |
| `-XX:+UseParallelGC` | JDK 8默认 | Parallel | 启用Parallel |
| `-XX:MaxGCPauseMillis` | 200ms | G1 | 停顿时间目标 |
| `-XX:G1HeapRegionSize` | 自动 | G1 | Region大小(1MB-32MB) |
| `-XX:InitiatingHeapOccupancyPercent` | 45% | G1 | 触发并发标记的老年代占用 |
| `-XX:G1MixedGCLiveThresholdPercent` | 85% | G1 | Mixed GC存活阈值 |
| `-XX:G1MixedGCCountTarget` | 8 | G1 | 一轮Mixed GC的目标次数 |
| `-XX:ConcGCThreads` | 自动 | G1/ZGC | 并发GC线程数 |
| `-XX:ParallelGCThreads` | 自动 | 所有 | 并行GC线程数 |
| `-XX:ZAllocationSpikeTolerance` | 2.0 | ZGC | 分配速率容忍度 |
| `-XX:+UseNUMA` | 否 | G1/ZGC | NUMA感知分配 |
| `-XX:+ZGenerational` | 否(JDK 21) | ZGC | 分代ZGC(JDK 21+) |
| `-XX:+ZUncommit` | 是 | ZGC | 将未用内存归还OS |
| `-XX:+UseStringDeduplication` | 是 | G1 | 字符串去重 |
| `-Xlog:gc*` | - | 所有 | GC日志配置 |

### 调优Checklist

**调优前**：
- [ ] 确认延迟SLA（P99/P999延迟要求）
- [ ] 确认堆大小和Region数量
- [ ] 确认CPU核心数
- [ ] 确认对象分配速率（通过JFR或profiling）
- [ ] 确认对象存活率和晋升速率
- [ ] 启用GC日志（`-Xlog`）
- [ ] 配置JFR记录GC事件

**调优中**：
- [ ] 每个参数调整后单独验证
- [ ] 一次只调整一个参数
- [ ] 记录每次调整前后的GC日志
- [ ] 使用GcLogAnalyzer量化对比
- [ ] 在生产流量复现环境下验证

**调优后**：
- [ ] 对比优化前后GC停顿时间（平均/最大/P99）
- [ ] 对比优化前后GC频率变化
- [ ] 对比优化前后应用吞吐量变化
- [ ] 确认没有引入新的性能问题
- [ ] 配置GC指标告警
- [ ] 建立监控仪表盘

GC调优不是一次性的工作，而是一个持续迭代的过程。随着业务的演进、流量的变化和JVM版本的升级，调优参数需要不断调整和优化。本章提供的工具和方法论，就是帮助读者建立起一套科学的、可量化的GC调优体系。
