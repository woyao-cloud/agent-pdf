# 第7章 内存管理与OOM排查

> 上一章我们讨论了JVM的类加载机制——这是Java动态性的基石。而在理解了类如何被加载到JVM之后，一个更实际的问题随之而来：这些类创建的实例和元数据如何被管理？当内存耗尽时，又如何定位和解决问题？
>
> 内存溢出（OutOfMemoryError，简称OOM）是生产环境中最严峻的故障类型之一。与普通的业务异常不同，OOM往往意味着整个JVM进程的健康受到威胁——GC频繁、响应变慢、最终进程退出。更棘手的是，OOM的根因往往不在发生的那一刻，而是在几个小时甚至几天前就已经埋下。本章将从JVM运行时数据区入手，深入分析每种内存区域的溢出场景，并结合真实案例展示完整的排查过程。

## 7.1 核心原理

### 7.1.1 运行时数据区概览

JVM在执行Java程序时会将管理的内存划分为若干个不同的数据区域。这些区域各司其职，有着各自的创建时间、销毁时间和内存回收策略。了解这些区域是理解OOM的基础。

根据《Java虚拟机规范》（Java SE 21版），运行时数据区包括以下几个部分：

**程序计数器（Program Counter Register）** 是一块较小的内存空间，可以看作是当前线程所执行的字节码的行号指示器。字节码解释器工作时，通过改变计数器的值来选取下一条需要执行的字节码指令。它是线程私有的，生命周期与线程相同。程序计数器是唯一一个在《Java虚拟机规范》中没有规定任何OutOfMemoryError情况的区域——它的内存需求是固定的，不会随着程序运行而增长。

**Java虚拟机栈（Java Virtual Machine Stack）** 也是线程私有的，生命周期与线程相同。每个方法被执行时，JVM都会同步创建一个栈帧（Stack Frame）用于存储局部变量表、操作数栈、动态连接、方法出口等信息。每一个方法被调用直至执行完毕的过程，就对应着一个栈帧在虚拟机栈中从入栈到出栈的过程。

局部变量表存放了编译期可知的各种基本数据类型（boolean、byte、char、short、int、float、long、double）、对象引用（reference类型）和returnAddress类型。其中64位长度的long和double占用两个局部变量空间（Slot），其余数据类型占用一个。局部变量表所需的内存空间在编译期完成分配——方法运行期间不会改变局部变量表的大小。

这个区域规定了两种异常状况：如果线程请求的栈深度大于虚拟机所允许的深度，抛出StackOverflowError；如果虚拟机栈可以动态扩展（大多数Java虚拟机都支持动态扩展，但允许固定长度的虚拟机栈），但扩展时无法申请到足够的内存，抛出OutOfMemoryError。

**本地方法栈（Native Method Stack）** 与虚拟机栈作用相似，区别在于虚拟机栈服务的是Java方法（即字节码），而本地方法栈服务的是JVM使用到的本地（Native）方法。HotSpot虚拟机将虚拟机栈和本地方法栈合二为一。这个区域同样会抛出StackOverflowError和OutOfMemoryError。

**Java堆（Java Heap）** 是JVM所管理的内存中最大的一块，被所有线程共享，在虚拟机启动时创建。此区域的唯一目的就是存放对象实例——"几乎"所有的对象实例都在这里分配内存（随着JIT编译器和逃逸分析技术的逐渐成熟，栈上分配和标量替换优化使得"所有对象都在堆上分配"变得不那么绝对了）。

Java堆是垃圾收集器管理的内存区域，因此也被称为"GC堆"。从内存回收的角度看，由于现在收集器大多采用分代收集理论，Java堆可以细分为新生代（Young Generation）和老年代（Old Generation）。从内存分配的角度看，线程共享的Java堆中可能划分出多个线程私有的分配缓冲区（TLAB，Thread Local Allocation Buffer）。无论怎么划分，都与存放的内容无关——所有区域存储的仍然是对象实例，进一步划分的目的是为了更好地回收内存或更快地分配内存。

Java堆可以在物理上不连续的内存空间中，只要逻辑上是连续的即可。当前主流的JVM实现都是按照可扩展来实现的（通过`-Xmx`和`-Xms`控制）。如果堆中没有足够内存完成实例分配且堆也无法再扩展时，抛出OutOfMemoryError。

**方法区（Method Area）** 是各个线程共享的内存区域，用于存储已被虚拟机加载的类型信息、常量、静态变量、即时编译器编译后的代码缓存等数据。在JDK 8之前，HotSpot使用永久代（PermGen）来实现方法区；JDK 8之后，永久代被移除，取而代之的是元空间（Metaspace），它使用本地内存而非JVM堆内存。

方法区同样规定了OutOfMemoryError：当它无法满足新的内存分配需求时抛出。

**运行时常量池（Runtime Constant Pool）** 是方法区的一部分。Class文件中除了有类的版本、字段、方法、接口等描述信息外，还有一项信息是常量池（Constant Pool Table），用于存放编译期生成的各种字面量和符号引用，这部分内容将在类加载后存放到方法区的运行时常量池中。

**直接内存（Direct Memory）** 并不是JVM运行时数据区的一部分，但也被频繁使用。JDK 1.4引入了NIO（New Input/Output）类，引入了一种基于通道（Channel）和缓冲区（Buffer）的I/O方式，它可以使用Native函数库直接分配堆外内存，然后通过一个存储在Java堆中的DirectByteBuffer对象作为这块内存的引用进行操作。这样可以在一些场景中显著提高性能，因为避免了在Java堆和Native堆中来回复制数据。直接内存的分配不受Java堆大小的限制，但受本机总内存（包括物理内存、SWAP分区或者分页文件）大小以及处理器寻址空间的限制。如果各个内存区域总和大于物理内存限制，也会导致OutOfMemoryError。

### 7.1.2 对象分配流程

理解对象在JVM中的分配流程，对于排查OOM至关重要。一个Java对象的分配并非简单地在堆中划出一块内存，而是一系列判断和选择的过程。

**栈上分配与逃逸分析**：当JVM通过逃逸分析（Escape Analysis）确定一个对象不会逃逸出方法之外，即该对象不会被外部方法访问，也不会被其他线程访问时，可以将这个对象分配在栈上而不是堆上。栈上分配的对象会随栈帧的出栈而自动销毁，减少了GC压力。JDK 21中默认开启了逃逸分析（通过`-XX:+DoEscapeAnalysis`控制）。

**TLAB分配**：如果对象不能在栈上分配，JVM会尝试在TLAB（Thread Local Allocation Buffer）上分配。TLAB是每个线程在Java堆中预先分配的一小块内存，使用TLAB可以避免多线程竞争同一块内存区域时的同步开销。JDK 21默认启用TLAB（`-XX:+UseTLAB`），TLAB大小通过`-XX:TLABSize`设置，默认为`-XX:+ResizeTLAB`启用的自适应调整。

**Eden区分配**：如果TLAB空间不足，对象会在新生代的Eden区分配。Eden区是大多数新生对象诞生的地方。当Eden区空间不足时，JVM会触发一次Minor GC（也称为Young GC）。

**进入Survivor区**：经过Minor GC后，存活的对象会被移动到Survivor区。HotSpot将Survivor区分为From和To两个区域，每次GC后存活的对象会从一个Survivor区复制到另一个。每个对象有一个年龄计数器（Age），每次在Survivor区中存活一次Minor GC，年龄就增加1岁。

**晋升到老年代**：当对象年龄达到一定阈值（默认15，通过`-XX:MaxTenuringThreshold`设置），就会晋升到老年代。如果Survivor区中相同年龄的所有对象大小总和大于Survivor空间的一半，年龄大于或等于该年龄的对象也可以直接进入老年代（动态年龄判定）。

**大对象直接进入老年代**：如果一个对象的大小超过`-XX:PretenureSizeThreshold`参数设置的值（默认为0，即不启用），这个对象会直接在老年代分配。这样做是为了避免在Eden区和两个Survivor区之间发生大量的内存复制。

**分配担保**：在进行Minor GC之前，JVM会检查老年代最大可用的连续空间是否大于新生代所有对象总空间。如果大于，这次Minor GC是安全的；如果小于，JVM会查看`-XX:HandlePromotionFailure`参数的值，看是否允许担保失败。如果允许，则继续检查老年代最大可用的连续空间是否大于历次晋升到老年代对象的平均大小，如果大于则尝试Minor GC，否则进行Full GC。

这个复杂的分配流程可以用以下简化的流程图表示：

```
新对象创建
    |
    v
逃逸分析 --> 不逃逸 --> 栈上分配（随栈帧销毁）
    |
    逃逸
    |
    v
TLAB分配 --> 成功 --> 对象创建完成
    |
    失败
    |
    v
Eden区分配 --> 成功 --> 对象创建完成
    |
    Eden区空间不足
    |
    v
触发 Minor GC --> 存活对象移入 Survivor
    |
    v
年龄达到阈值 --> 晋升到老年代
    |
    年龄未达阈值
    |
    v
留在 Survivor 区
```

### 7.1.3 对象存活性判定

JVM需要判定哪些对象是"存活"的，哪些是"可回收"的。这是垃圾回收的前提。目前主流的商用JVM采用可达性分析（Reachability Analysis）算法。

**可达性分析算法**：通过一系列称为"GC Roots"的根对象作为起始节点集，从这些节点开始，根据引用关系向下搜索，搜索过程所走过的路径称为"引用链"（Reference Chain），当一个对象到GC Roots没有任何引用链相连（即从GC Roots到这个对象不可达）时，证明此对象是不可用的。

在Java中，可以作为GC Roots的对象包括：
- 虚拟机栈（栈帧中的本地变量表）中引用的对象
- 方法区中类静态属性引用的对象
- 方法区中常量引用的对象
- 本地方法栈中JNI（即一般说的Native方法）引用的对象
- Java虚拟机内部的引用（基本数据类型对应的Class对象、常驻的异常对象如NullPointerException、系统类加载器）
- 所有被同步锁（synchronized关键字）持有的对象
- 反映Java虚拟机内部情况的JMXBean、JVMTI回调、本地代码缓存等

**引用类型**：在JDK 1.2之后，Java对引用的概念进行了扩充，将引用分为强引用（Strong Reference）、软引用（Soft Reference）、弱引用（Weak Reference）和虚引用（Phantom Reference）四种，这四种引用类型依次递减。

**强引用**是最传统的引用定义，指在程序代码中普遍存在的引用赋值，如`Object obj = new Object()`。只要强引用关系还存在，垃圾收集器就永远不会回收掉被引用的对象。

**软引用**用来描述一些还有用但非必需的对象。被软引用关联的对象，在系统将要发生内存溢出异常之前，会把这些对象列入回收范围之中进行第二次回收，如果这次回收还没有足够的内存，才会抛出内存溢出异常。JDK提供了`SoftReference`类来实现软引用。软引用非常适合实现内存敏感的高速缓存——比如网页缓存、图片缓存等。

**弱引用**也用来描述非必需对象，但它的强度比软引用更弱一些：被弱引用关联的对象只能生存到下一次垃圾收集发生为止。当垃圾收集器开始工作，无论当前内存是否足够，都会回收只被弱引用关联的对象。JDK提供了`WeakReference`类来实现弱引用。弱引用最常见的用途是在`ThreadLocal`实现中——ThreadLocalMap的Entry继承了`WeakReference`，key为ThreadLocal实例的弱引用，这样可以防止ThreadLocal无法被GC回收导致的内存泄漏。

**虚引用**是最弱的一种引用关系。一个对象是否有虚引用的存在，完全不会对其生存时间构成影响，也无法通过虚引用来取得一个对象实例。为一个对象设置虚引用关联的唯一目的就是能在这个对象被收集器回收时收到一个系统通知。JDK提供了`PhantomReference`类来实现虚引用。虚引用在DirectByteBuffer的堆外内存回收中扮演关键角色——当DirectByteBuffer对象被回收时，它的虚引用Cleaner会触发`clean()`方法释放堆外内存。

### 7.1.4 JDK 21中的内存优化

JDK 21作为最新的LTS版本（紧随JDK 17之后），引入了一些值得关注的内存管理优化。

**String Deduplication（字符串去重）**：默认开启（`-XX:+UseStringDeduplication`），此功能在GC时识别出内容相同的String对象，让它们共享同一个char[]数组。这对缓存在内存中的大量重复字符串（如JSON key、XML标签、数据库查询结果中的重复列值）有显著的降低内存消耗效果。根据Oracle的官方数据，String Deduplication通常可以节省10%-30%的堆内存。需要注意的是，String Deduplication只在G1垃圾收集器下生效，且仅在Full GC和并发标记阶段执行。

**G1垃圾收集器的改进**：JDK 21中G1已成为默认GC（自JDK 9起），并且持续得到优化。JDK 21进一步改进了G1的并发标记和混合回收阶段，减少了停顿时间。G1将堆划分为多个大小相等的Region（1MB-32MB，取决于堆大小），通过维护每个Region的优先级列表来优先回收收益最高的Region。JDK 21中，G1的`-XX:G1HeapRegionSize`参数可以更灵活地设置Region大小，并且引入了`-XX:G1MixedGCLiveThresholdPercent`参数的动态调整。

**ZGC的持续增强**：ZGC（Z Garbage Collector）在JDK 21中已经是生产就绪的稳定GC（自JDK 15起），支持最大16TB的堆，且停顿时间不超过10ms。JDK 21中ZGC的改进包括：更短的标记阶段停顿、分代ZGC的预览（Generational ZGC），以及更好的NUMA（Non-Uniform Memory Access）亲和性。

**紧凑指针（Compressed OOPs）优化**：JDK 21继续优化了Compressed OOPs（Ordinary Object Pointers）的实现。当堆大小小于32GB时，JVM默认启用压缩指针（`-XX:+UseCompressedOops`），将64位指针压缩为32位，减少内存占用。JDK 21中，压缩指针在更多场景下生效，并且在某些CPU架构上有更好的性能。

**并行GC的现代化**：虽然G1和ZGC是更先进的GC，但并行GC（Parallel GC）仍然是很多批处理应用的默认选择。JDK 21中对并行GC做了若干优化，包括更智能的自适应大小调整和更高效的全量GC。

### 7.1.5 内存泄漏与内存溢出的区别

这是排查OOM时最重要的概念区分。**内存溢出（Memory Overflow）** 是指程序在申请内存时，没有足够的内存供申请者使用。**内存泄漏（Memory Leak）** 是指程序在申请内存后，无法释放已申请的内存空间——泄漏的内存积累到一定程度，最终导致内存溢出。

用生活中的例子来类比：内存溢出就像你去银行取钱，但账户里余额不够了；内存泄漏就像你每次取钱后都往家里扔一张钞票，但再也不去捡起来——家里钞票越积越多，但你手头的现金越来越少，最终导致取不出钱了。

**内存泄漏的特征**：
- 泄漏是渐进的——内存占用随时间线性或指数级增长
- GC无法释放泄漏的内存——因为存在到GC Roots的引用链
- 内存占用图呈现"锯齿状上升"模式（每次GC回收一部分，但又增长更多）
- 最终在某个时间点触发OOM

**内存溢出的特征**：
- 可能是瞬间发生的（如加载超大文件）
- 也可能是内存泄漏的最终结果
- GC可能已经尽力，但释放速度跟不上分配速度
- 堆转储中通常有明显的"罪魁祸首"对象

在实际排查中，**大多数OOM的根因是内存泄漏而非单纯的内存不足**。理解这一点至关重要——调大`-Xmx`通常只是延缓OOM的到来，而不是解决问题的根本。

---

## 7.2 案例7-1：堆内存泄漏排查

### 7.2.1 问题现象

假设有一个订单处理微服务，运行在4核8GB的容器中，JVM堆配置为`-Xms2g -Xmx2g`。服务运行一段时间后（大约8-12小时），开始出现以下症状：

1. 接口响应时间逐渐变长，从平均50ms逐渐攀升到500ms以上
2. 监控面板显示GC频率从每分钟几次增加到每分钟数十次
3. 最终抛出`java.lang.OutOfMemoryError: Java heap space`
4. 服务自动重启，但重启后的8-12小时又会再次OOM

这种"周期性OOM"的模式是内存泄漏的典型特征——每次重启后"重置"泄漏状态，然后泄漏重新开始积累。

### 7.2.2 排查工具链

对于堆内存泄漏的排查，我们一般遵循以下工具使用顺序：

**第一步：JFR（Java Flight Recorder）GC事件**

JFR是Oracle JDK内置的低开销性能事件框架。即使在生产环境也可以持续开启（开销通常低于1%）。通过JFR的GC事件，可以快速了解堆内存的使用趋势。

```bash
# 启动时启用JFR记录（持续60分钟）
java -XX:StartFlightRecording=filename=recording.jfr,duration=60m,settings=profile \
     -jar order-service.jar
```

或者在运行时动态开启：

```bash
jcmd <pid> JFR.start name=oom-recording duration=60m filename=recording.jfr
```

在JMC（JDK Mission Control）中打开recording.jfr后，关注以下事件：
- **GC Heap History**：堆使用量的时间序列图。如果呈现"逐步上升-回落-再上升但峰值变高"的模式，说明内存未被完全回收
- **GC Pause Time**：GC停顿时间。随着堆中存活对象增多，GC停顿时间会越来越长
- **Allocation Pressure**：分配压力。如果分配速率持续高于GC回收速率，意味着存在泄漏

**第二步：jcmd实时诊断**

在OOM发生之前或之后，jcmd提供了多种诊断能力：

```bash
# 查看堆概览
jcmd <pid> GC.heap_info

# 查看类加载统计（关注是否有类加载器泄漏）
jcmd <pid> GC.class_stats

# 生成堆转储（OOM发生时自动生成或手动触发）
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

此外，可以在JVM启动参数中添加`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/`，让JVM在OOM发生时自动生成堆转储文件，避免错过故障现场。

**第三步：MAT（Memory Analyzer Tool）堆转储分析**

将堆转储文件（.hprof）导入Eclipse MAT进行分析。MAT的核心分析报告包括：

**泄漏嫌疑报告（Leak Suspects Report）**：
MAT会自动分析堆转储，生成最可能的内存泄漏嫌疑列表。每个嫌疑包含：
- 嫌疑对象的大小和占堆百分比
- 到GC Roots的最短引用链
- 对象的典型大小（normal size）和保留大小（retained size）

**Dominator Tree（支配树）**：
支配树展示了堆中对象的"支配"关系——如果对象A支配对象B，那么所有到B的路径都必须经过A。这意味着如果A被回收，B也一定被回收。因此，支配树中排在前面的对象就是最大的"内存消费者"。

**Top Consumers**：
按类、类加载器和包分组展示内存消耗最大的对象。如果发现某个内部类（如`ThreadLocalMap$Entry`）或缓存类占用了大量内存，就找到了排查方向。

### 7.2.3 根因分析

通过MAT分析堆转储，以下是两种最常见的堆内存泄漏模式：

**模式一：ThreadLocal未清理导致类加载器泄漏**

这是最容易在生产环境中遇到的泄漏模式。分析堆转储时，发现大量`java.lang.ref.Finalizer`对象引用了框架类（如Spring的某个类），每个Finalizer对象都通过`FinalizerThread`持有。进一步分析发现，这些类的类加载器（通常是一个自定义ClassLoader，如Tomcat的WebappClassLoader）无法被GC回收——因为ThreadLocalMap中的Entry（继承了WeakReference）的value通过强引用链指向了类加载器。

具体来说，当Web应用停止时，如果ThreadLocal中的value持有对类加载器的引用，而Thread（线程池中的线程）又没有被销毁，那么整个类加载器加载的所有类都无法被卸载。这导致每次重新部署Web应用，上一次的类加载器泄漏都产生大量无法回收的类元数据。

**模式二：静态Collection积累（本案例演示）**

本项目的`HeapLeakDemo`模拟了这种泄漏模式：

```java
private static final List<byte[]> LEAK = new ArrayList<>();
// 每隔50ms添加512KB的数据
while (true) {
    LEAK.add(new byte[512 * 1024]);
    Thread.sleep(50);
}
```

`LEAK`是`static final`的List，它的引用存在于方法区（静态属性）。由于方法区中的静态属性本身就是GC Roots的一部分，因此`LEAK`引用的所有byte数组永远是可到达的——GC永远无法回收它们。

在真实业务中，类似的场景包括：
- 将用户请求日志累加到静态List中等待批量写入，但写入失败后没有清空列表
- 将数据库查询结果缓存到一个静态Map中，但没有设置过期策略
- 使用ThreadLocal缓存用户信息，但请求结束后没有调用`remove()`

### 7.2.4 诊断步骤详解

以下是在HeapLeakDemo中触发OOM后的完整诊断流程：

**步骤一：运行程序触发OOM**

```bash
# 编译并运行，限制堆大小为128MB以加速演示
javac -d target src/main/java/com/jvmbook/ch07/HeapLeakDemo.java
java -Xmx128m -cp target com.jvmbook.ch07.HeapLeakDemo
```

输出：
```
=== Heap Leak Simulation ===
PID: 12345
Allocating 512KB every 50ms...
Heap size: ~128MB
Allocated 100 chunks (~50MB)
Allocated 200 chunks (~100MB)
=== OutOfMemoryError caught after 256 allocations ===
Total allocated: ~128MB
```

**步骤二：获取堆转储**

```bash
# 在OOM发生后立即获取堆转储
jcmd 12345 GC.heap_dump /tmp/heap-leak.hprof
```

java -Xmx128m -cp target com.jvmbook.ch07.HeapLeakDemo -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath="D:\tmp\"
也可以在启动参数中添加`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/`，JVM在OOM时会自动生成堆转储。

**步骤三：使用MAT分析堆转储**

1. 打开MAT，选择`File > Open Heap Dump`，加载`/tmp/heap-leak.hprof`
2. 在弹出的报告中点击"Leak Suspects"
3. MAT会显示："One instance of `java.util.ArrayList` loaded by `<system class loader>` occupies 127.9 MB (99.9%) of the heap."
4. 点击"Details"，查看ArrayList的内部对象：
   - `elementData` 是一个 `Object[]`，长度256，每个元素是一个`byte[524288]`
   - 每个`byte[524288]`的大小恰好是512KB
5. 点击"Path to GC Roots"（选择"exclude all phantom/weak/soft references"）：
   ```
   com.jvmbook.ch07.HeapLeakDemo.LEAK (static field)
   -> java.util.ArrayList.elementData (field)
   -> Object[] (array)
   -> byte[524288] (array elements)
   ```

这个路径清晰地揭示了泄漏链：从GC Roots（静态属性）到ArrayList的Object[]数组，到每个512KB的byte数组。这些byte数组都有引用，因此永远不会被GC回收。

### 7.2.5 解决方案

**根本解决方案**：使用合适的数据结构替代静态Collection。对于需要缓存数据的场景，推荐以下方案：

**方案一：使用WeakHashMap**

```java
// 代替 static final Map<Key, Value> CACHE = new HashMap<>();
private static final Map<Key, Value> CACHE = new WeakHashMap<>();
```

WeakHashMap的Entry继承了WeakReference，当Key不再被强引用时，Entry会自动被回收。但注意：WeakHashMap不适合缓存键值都是强引用的场景——因为如果Key还在使用，Entry也不会被回收。

**方案二：使用Guava Cache或Caffeine**

```java
// Caffeine缓存（现代推荐，性能优于Guava Cache）
Cache<Key, Value> cache = Caffeine.newBuilder()
    .maximumSize(1000)
    .expireAfterWrite(10, TimeUnit.MINUTES)
    .softValues()
    .build();
```

Caffeine支持基于大小、时间和引用的多种过期策略，且具有高性能的并发访问控制。

**方案三：try-finally确保ThreadLocal清理**

```java
private static final ThreadLocal<UserContext> USER_CONTEXT = ThreadLocal.withInitial(UserContext::new);

public void handleRequest(Request request) {
    try {
        UserContext ctx = USER_CONTEXT.get();
        ctx.setUserId(request.getUserId());
        // 处理业务逻辑...
    } finally {
        USER_CONTEXT.remove(); // 必须清理！
    }
}
```

如果使用`finally`块中不调用`remove()`，在Tomcat等线程池环境中，线程复用时上一个请求的ThreadLocal数据仍然存在——这不仅导致内存泄漏，还会导致"脏数据"问题（新请求可能读取到上一个请求的用户信息）。

**方案四：使用`-Xmx`限制堆大小并监控**

即使是最好的代码，也需要运行时监控配合。推荐以下监控配置：

```bash
# JVM参数配置
-Xmx2g -Xms2g                     # 固定堆大小，避免动态调整带来的性能抖动
-XX:+HeapDumpOnOutOfMemoryError   # OOM时自动堆转储
-XX:HeapDumpPath=/var/log/heap/   # 指定堆转储目录
-XX:+PrintGCDetails               # GC详细日志
-XX:+PrintGCDateStamps            # GC时间戳
-Xlog:gc*:file=/var/log/gc.log    # JDK 9+的统一日志格式
```

---

## 7.3 案例7-2：栈溢出排查

### 7.3.1 问题现象

栈溢出（StackOverflowError）通常发生在一个线程的调用栈深度超过JVM允许的最大深度时。与前两节讨论的堆OOM不同，栈溢出的特点是：

1. **发生在单个线程中**——其他线程不受影响
2. **不涉及GC**——栈帧不是GC管理的对象
3. **错误信息明确**——`java.lang.StackOverflowError`，通常伴随调用栈

一个典型的场景是：某个数据处理模块在处理深层嵌套的JSON或XML结构时，使用递归方式遍历树形结构。当树的深度超过几千层时，抛出StackOverflowError。

### 7.3.2 根因分析

栈溢出的根因可以归纳为以下几类：

**无意识递归（Unintentional Recursion）**：这是最常见的栈溢出原因。开发者在实现方法时，不小心调用了自身（或形成了循环调用链），且没有正确的终止条件。例如：

```java
// 错误：getClass()方法中调用了自身
public String getClassName() {
    return getClass().getSimpleName(); // 这里调用了this.getClass()
    // 实际应该使用 SomeHelper.class.getSimpleName()
}

// 错误：toString()中循环引用
public String toString() {
    return "Entity{parent=" + parent.toString() + "}"; // 如果parent的toString()又调回来...
}
```

本案例的`StackOverflowDemo`模拟了这种无意识递归：

```java
private static void recurse() {
    depth++;
    if (depth % 10000 == 0) {
        System.out.println("Recursion depth: " + depth);
    }
    recurse(); // 无终止条件的递归
}
```

运行后可以看到每10000步的输出，直到到达栈深度上限。在默认的-Xss（通常为1MB）下，大约在几万到十几万步时抛出StackOverflowError。

**深层方法调用链**：不是递归，但方法调用链非常深。例如：

- XML DOM树使用递归方式遍历
- 计算斐波那契数列的朴素递归实现
- 深度优先搜索（DFS）算法在极端深度的树/图上的实现
- Java的Stream API在大型数据集上的链式操作

**栈帧过大**：每个栈帧中的局部变量表太大，导致即使调用深度不高也超出栈容量。例如，一个方法声明了数百个局部变量，或者使用了过大的数组作为局部变量。

### 7.3.3 诊断步骤

**步骤一：观察错误输出**

运行StackOverflowDemo（建议使用`-Xss256k`缩小栈容量以加速演示）：

```bash
javac -d target src/main/java/com/jvmbook/ch07/StackOverflowDemo.java
java -Xss256k -cp target com.jvmbook.ch07.StackOverflowDemo
```

输出示例：
```
=== StackOverflow Simulation ===
PID: 12346
JVM flag: -Xss256k
Starting infinite recursion...

Recursion depth: 10000
Recursion depth: 20000
Recursion depth: 30000

=== StackOverflowError caught at depth: 32041 ===
java.lang.StackOverflowError: null

Analysis:
  - Stack depth: 32041
  - Each stack frame consumes ~8 bytes per frame (overestimate, includes JVM internal overhead)
  - Hint: Increase -Xss or convert recursion to iteration
```

可以看到，在`-Xss256k`的限制下，栈深度约为32041层就溢出。这提供了一个重要的估算：在默认的`-Xss1m`下，理论深度可以达到约128000层。

**步骤二：jstack查看线程栈**

当StackOverflowError发生时，使用jstack可以查看目标线程的当前调用栈：

```bash
jstack <pid>
```

输出中会包含类似于以下内容的栈信息：

```
"main" #1 prio=5 os_prio=0 cpu=31.25ms elapsed=3.24s
  [Stack overflow, stack size 256k]
  at com.jvmbook.ch07.StackOverflowDemo.recurse(StackOverflowDemo.java:52)
  at com.jvmbook.ch07.StackOverflowDemo.recurse(StackOverflowDemo.java:52)
  at com.jvmbook.ch07.StackOverflowDemo.recurse(StackOverflowDemo.java:52)
  ... (repeated 32038 times)
```

看到同一个方法重复出现32038次，基本可以确定是无意识递归或需要转换为迭代的方法。

**步骤三：确定-Xss的合理值**

`-Xss`参数指定了每个线程的栈大小。合理设置这个值需要权衡：

- **过小**：容易StackOverflowError（特别是深度递归场景）
- **过大**：浪费内存。如果设置-Xss2m，启动100个线程就会占用200MB内存

推荐的设置策略：

```bash
# 对于不需要深递归的普通应用（默认即可）
java -jar app.jar    # 默认-Xss1m（大多数JDK）

# 对于需要深递归的应用（如XML解析、JSON树遍历）
java -Xss512k -jar app.jar   # 减少到512k以节省内存
java -Xss2m -jar app.jar     # 增大到2m以支持更深递归

# 精确评估：根据测试结果设置
java -Xss256k -cp target com.jvmbook.ch07.StackOverflowDemo
# 观察depth值，估算所需栈大小：
# 需要深度 D，当前测试深度为 T，当前栈大小为 S
# 所需栈大小 ≈ S * D / T
```

### 7.3.4 解决方案

**方案一：递归转迭代（推荐）**

绝大多数的递归算法都可以转换为使用循环+显式栈的迭代方式。以深度优先遍历为例：

```java
// 递归版本（容易栈溢出）
void dfs(TreeNode node) {
    if (node == null) return;
    System.out.println(node.val);
    dfs(node.left);
    dfs(node.right);
}

// 迭代版本（使用显式栈，不会栈溢出）
void dfsIterative(TreeNode root) {
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        if (node == null) continue;
        System.out.println(node.val);
        stack.push(node.right);
        stack.push(node.left);
    }
}
```

迭代版本将递归调用栈转移到了堆上的Deque对象中，不受-Xss限制，只受堆大小限制。

**方案二：尾递归优化**

某些递归可以被编译器优化为迭代。Java标准编译器（javac）目前不进行尾递归优化，但一些JVM实现（如GraalVM）支持。在标准JDK中，可以手动将递归改为尾递归形式，再转换为迭代。

**方案三：增加-Xss值**

如果确实需要深度递归（如某些算法实现），可以通过增加-Xss值来解决问题：

```bash
java -Xss2m -cp target com.example.DeepRecursiveApp
```

在容器化环境中，需要同时调整容器的内存限制和JVM的栈大小：

```bash
docker run -m 512m -e JAVA_OPTS="-Xss512k -Xmx256m" my-app
```

**方案四：代码审查工具预防**

使用静态分析工具（如SpotBugs、Checkstyle）配置规则，检测可能导致栈溢出的递归：

```xml
<!-- SpotBugs filter: detect-infinite-recursion.xml -->
<FindBugsFilter>
    <Match>
        <Bug pattern="IL_INFINITE_RECURSIVE_LOOP" />
    </Match>
</FindBugsFilter>
```

在代码审查中，所有涉及递归的代码都应该标注终止条件，并评估最大递归深度。

---

## 7.4 案例7-3：元空间OOM

### 7.4.1 问题现象

与堆OOM不同，元空间OOM的症状更为隐蔽。典型的表现包括：

1. 应用日志中出现`java.lang.OutOfMemoryError: Metaspace`
2. GC日志显示频繁的Full GC（元空间不足会触发Full GC）
3. `jstat -gc <pid>` 显示M（Metaspace）和MU（Metaspace Used）持续增长
4. 应用中的动态代理、脚本引擎（如Groovy）、AOP切面等频繁使用的场景
5. 如果使用了自定义ClassLoader，每次重新部署或热加载后Metaspace使用量不会下降

元空间OOM特别容易出现在以下场景中：
- 使用CGLIB或Javassist动态生成大量代理类（如Spring AOP中的切面类）
- 使用脚本引擎（如Groovy、Nashorn）动态编译和执行脚本
- 支持热部署的应用服务器（如Tomcat、Jetty），每次重新部署产生新的ClassLoader
- 大量使用Lambda表达式（每个Lambda表达式在运行时生成一个匿名内部类）

元空间OOM与堆OOM的一个关键区别是：**JVM默认不对元空间大小做上限限制**（`-XX:MaxMetaspaceSize`默认无上限），它只受本地内存大小限制。这意味着元空间OOM不会在"正常"使用中出现——一旦发生，几乎必然是由类加载泄漏或不受控的动态类生成造成的。

### 7.4.2 根因分析

本案例的`MetaspaceOomDemo`模拟了不受控的动态类生成：

```java
int count = 0;
try {
    while (true) {
        Enhancer enhancer = new Enhancer();
        enhancer.setSuperclass(ProxyTarget.class);
        enhancer.setUseCache(false);        // 关键：禁用缓存
        enhancer.setCallback(NoOp.INSTANCE);
        Object proxy = enhancer.create();
        count++;
        if (count % 1000 == 0) {
            System.out.println("Created " + count + " proxy classes...");
        }
    }
} catch (Error e) {
    System.out.println(e.getClass().getName() + " caught after creating "
            + count + " proxy classes");
}
```

当`enhancer.setUseCache(false)`时，每次调用`enhancer.create()`都会在元空间中生成一个全新的类定义。在`-XX:MaxMetaspaceSize=64m`的限制下，通常在生成数万个代理类后会触发Metaspace OOM。

CGLIB生成代理类的内部机制是：通过ASM字节码框架动态生成一个继承自目标类的新类，在生成的类中重写非final的公有方法，每个重写的方法中包含对`MethodInterceptor`的回调。每个生成的代理类都有自己的元数据、常量池、方法表等——这些数据全部存储在元空间中。

真实业务中类似的情况包括：

**Spring AOP代理**：在使用`@Transactional`或`@Cacheable`等注解时，Spring会为目标Bean创建CGLIB代理。如果Spring扫描了大量的Bean，每个Bean都创建了代理类，且Spring上下文没有被正确清理，可能导致元空间OOM。

**MyBatis Mapper代理**：MyBatis使用JDK动态代理或CGLIB为Mapper接口创建代理实例。在极端情况下（如大量动态SQL模板），每个SQL方法都可能对应一个代理类。

**Groovy脚本引擎**：在运行时编译和执行Groovy脚本会导致在元空间中生成大量的类。如果脚本内容每次不同（如用户自定义模板），类生成就不可控。

### 7.4.3 排查工具

**jcmd GC.class_stats**

这是排查元空间OOM最强大的命令：

```bash
jcmd <pid> GC.class_stats
```

输出示例：
```
Index  ClassLoader           ClassName                                          Bytes
1      net.sf.cglib.proxy.Enhancer@1234    com.jvmbook.ch07.ProxyTarget$$EnhancerByCGLIB$$1    2048
2      net.sf.cglib.proxy.Enhancer@1234    com.jvmbook.ch07.ProxyTarget$$EnhancerByCGLIB$$2    2048
3      net.sf.cglib.proxy.Enhancer@1234    com.jvmbook.ch07.ProxyTarget$$EnhancerByCGLIB$$3    2048
...    ...                                  ...                                                 ...
N      net.sf.cglib.proxy.Enhancer@1234    com.jvmbook.ch07.ProxyTarget$$EnhancerByCGLIB$$N    2048
```

如果看到同一个ClassLoader下有成百上千个命名连续的代理类（`$$EnhancerByCGLIB$$1`, `$$EnhancerByCGLIB$$2`...），就确认了元空间OOM的根因是不受控的动态类生成。

也可以按类加载器分组统计：

```bash
jcmd <pid> GC.class_stats | awk '{print $2}' | sort | uniq -c | sort -nr
```

这样可以快速发现哪个ClassLoader加载了最多的类。

**JFR Metaspace事件**

在JFR记录中，以下事件对排查元空间OOM特别有用：

- **Metaspace Summary**：显示元空间和压缩类空间的使用情况
- **Metaspace Allocation Failure**：每次元空间分配失败（触发GC）的记录
- **Class Loading Statistics**：已经加载的类数量、卸载的类数量、当前活跃的类数量

如果"已加载的类数量"不断增长而"卸载的类数量"几乎为零，就确认了类加载泄漏。

### 7.4.4 诊断步骤

**步骤一：运行程序触发OOM**

```bash
# 编译并运行，限制元空间大小为64MB以加速演示
javac -cp cglib-3.3.0.jar -d target src/main/java/com/jvmbook/ch07/MetaspaceOomDemo.java
java -XX:MaxMetaspaceSize=64m -cp "target;cglib-3.3.0.jar" com.jvmbook.ch07.MetaspaceOomDemo
```

注意Windows上classpath分隔符是分号，Linux上是冒号。

输出示例：
```
=== Metaspace OOM Simulation ===
PID: 12347
Generating CGLIB proxy classes in infinite loop...
MaxMetaspaceSize: 64m

Created 1000 proxy classes...
Created 2000 proxy classes...
Created 3000 proxy classes...
...
Created 28000 proxy classes...

=== java.lang.OutOfMemoryError: Metaspace caught after creating 28642 proxy classes ===

Analysis:
  - Total proxy classes generated: 28642
```

**步骤二：使用jcmd检查类加载情况**

在程序运行过程中（或OOM发生后，只要JVM进程还未退出），执行：

```bash
# 查看加载的类总数
jcmd <pid> VM.metaspace

# 查看类统计
jcmd <pid> GC.class_stats | head -50
```

观察结果中CGLIB代理类的数量和命名模式。

**步骤三：添加JVM参数验证类卸载**

在启动参数中添加类加载跟踪，可以看到哪些类被加载、哪些被卸载：

```bash
java -XX:MaxMetaspaceSize=64m \
     -XX:+TraceClassLoading \
     -XX:+TraceClassUnloading \
     -Xlog:class+load=info:file=class-load.log \
     -Xlog:class+unload=info:file=class-unload.log \
     -cp "target;cglib-3.3.0.jar" \
     com.jvmbook.ch07.MetaspaceOomDemo
```

由于`setUseCache(false)`且一直持有Enhancer引用，这些代理类永远不会被卸载——class-unload.log中应该没有任何记录。

### 7.4.5 解决方案

**方案一：启用CGLIB缓存（最直接）**

CGLIB的Enhancer默认是启用缓存的（`setUseCache(true)`），但某些框架为了防止缓存冲突而禁用了缓存。如果不需要每次都生成新类，确保不调用`setUseCache(false)`：

```java
Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(ProxyTarget.class);
// 不要调用 enhancer.setUseCache(false);
// 默认 useCache=true，相同签名的代理类会被复用
enhancer.setCallback(NoOp.INSTANCE);
```

CGLIB的缓存基于`KeyFactory`生成的缓存键——相同的超类和回调类型组合会被映射到同一个代理类。缓存键的hashCode和equals决定了缓存的命中逻辑。

**方案二：设置MaxMetaspaceSize上限**

即使有泄漏风险，设置上限可以避免OOM拖垮整个进程：

```bash
java -XX:MaxMetaspaceSize=256m -jar app.jar
```

这样元空间最多使用256MB，超过会抛出OOM。但这个值是"安全网"而不是"解决方案"——它只是让OOM来得更早、更可控，而不是阻止OOM。

**方案三：避免每次生成新代理类**

在框架层面，可以复用Class对象：

```java
// 使用ConcurrentHashMap缓存已生成的Class
private static final ConcurrentHashMap<String, Class<?>> PROXY_CLASS_CACHE = new ConcurrentHashMap<>();

public Class<?> getProxyClass(Class<?> targetClass) {
    return PROXY_CLASS_CACHE.computeIfAbsent(
        targetClass.getName(),
        key -> {
            Enhancer enhancer = new Enhancer();
            enhancer.setSuperclass(targetClass);
            enhancer.setUseCache(true); // 利用CGLIB内置缓存
            enhancer.setCallback(NoOp.INSTANCE);
            return enhancer.createClass(); // 只生成Class对象，不创建实例
        }
    );
}
```

**方案四：监控类加载指标**

在生产环境中，监控以下指标可以提前预警元空间OOM：

- `jvm.classes.loaded` (当前已加载类数)
- `jvm.classes.unloaded` (已卸载类数)
- `jvm.memory.metaspace.used` (元空间使用量)
- `jvm.memory.metaspace.max` (元空间最大容量)

在Prometheus + Grafana监控体系中，可以设置以下告警规则：
- 如果`rate(jvm.classes.loaded[5m])`持续大于0且`jvm.classes.unloaded`无增长，触发"疑似类加载泄漏"告警
- 如果`jvm.memory.metaspace.used / jvm.memory.metaspace.max > 0.8`，触发"元空间即将耗尽"告警

---

## 7.5 小结

### 7.5.1 核心要点回顾

本章从JVM运行时数据区入手，覆盖了以下核心知识点：

**运行时数据区**：程序计数器（无OOM风险）、Java虚拟机栈（StackOverflowError + OOM）、本地方法栈（StackOverflowError + OOM）、Java堆（最常见的OOM区域）、方法区/元空间（类元数据OOM）、直接内存（NIO OOM）。每个区域都有其特定的OOM模式和排查思路。

**对象分配流程**：逃逸分析 -> 栈上分配 -> TLAB -> Eden区 -> Survivor区 -> 老年代。理解这个流程有助于推测OOM发生在哪个阶段——例如，如果Survivor区不断溢出但老年代使用率不高，可能是Survivor空间过小或对象年龄配置不当。

**对象存活性判定**：GC Roots可达性分析是OOM排查的核心思维——"这个对象为什么还没被回收？"等价于"这个对象到哪个GC Roots还有引用链？"四类引用（强、软、弱、虚）理解了这个问题的不同解决方式。

**三种OOM案例的总结对比**：

| 维度 | 堆OOM（案例7-1） | 栈溢出（案例7-2） | 元空间OOM（案例7-3） |
|------|-------------------|-------------------|---------------------|
| 错误类型 | OutOfMemoryError: Java heap space | StackOverflowError | OutOfMemoryError: Metaspace |
| 根因 | 对象无法回收/泄漏 | 递归过深/调用链过长 | 动态类生成不受控 |
| 主要工具 | MAT、JFR、jcmd | jstack、-Xss参数 | jcmd GC.class_stats、JFR |
| 核心参数 | -Xmx、-Xms | -Xss | -XX:MaxMetaspaceSize |
| 关键策略 | 定位泄漏点并修复 | 递归转迭代 | 启用类缓存+限制大小 |

### 7.5.2 调优Checklist

以下是在生产环境中排查OOM时的标准化检查清单：

**通用检查**：
- [ ] 确认OOM的错误信息（Heap space、Metaspace、Direct buffer、GC overhead limit exceeded？）
- [ ] 确认进程是否还存活（jps或ps）
- [ ] 确认是否有堆转储文件（配置-XX:+HeapDumpOnOutOfMemoryError后自动生成）
- [ ] 确认GC日志是否开启（-Xlog:gc*或-XX:+PrintGCDetails）
- [ ] 确认JFR记录是否可用

**堆OOM专项检查**：
- [ ] MAT分析堆转储，检查Leak Suspects
- [ ] 检查Dominator Tree中最大的对象类型
- [ ] 检查ThreadLocal Map中是否有未清理的Entry
- [ ] 检查静态Collection的积累情况
- [ ] 检查是否有软引用/弱引用被过度使用
- [ ] 检查是否有大数组或集合未分页

**栈溢出专项检查**：
- [ ] 检查递归调用是否有终止条件
- [ ] 检查是否形成了循环调用（A->B->C->A）
- [ ] 评估算法是否可以转换为迭代
- [ ] 评估当前-Xss值是否合理

**元空间OOM专项检查**：
- [ ] jcmd GC.class_stats检查重复的代理类
- [ ] 检查CGLIB/Javassist是否禁用了缓存
- [ ] 检查热部署场景下ClassLoader能否被回收
- [ ] 检查Groovy/Nashorn脚本编译是否受控

### 7.5.3 参数速查

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-Xms` | 物理内存1/64 | 初始堆大小 |
| `-Xmx` | 物理内存1/4 | 最大堆大小 |
| `-Xmn` | 堆的1/3~1/4 | 新生代大小 |
| `-Xss` | 1MB（平台相关） | 线程栈大小 |
| `-XX:MaxMetaspaceSize` | 无上限 | 元空间最大大小 |
| `-XX:MetaspaceSize` | 约20MB | 元空间触发GC的阈值 |
| `-XX:+UseCompressedOops` | 启用（堆<32GB） | 压缩对象指针 |
| `-XX:+HeapDumpOnOutOfMemoryError` | 关闭 | OOM时自动堆转储 |
| `-XX:HeapDumpPath` | 工作目录 | 堆转储输出路径 |
| `-XX:+PrintGCDetails` | 关闭（JDK 8） | GC详细日志 |
| `-XX:+UseG1GC` | 启用（JDK 9+） | G1垃圾收集器 |
| `-XX:+UseStringDeduplication` | 关闭 | 字符串去重（G1） |
| `-XX:MaxTenuringThreshold` | 15 | 对象晋升老年代年龄阈值 |
| `-XX:PretenureSizeThreshold` | 0 | 大对象直接进入老年代的阈值 |
| `-XX:+DoEscapeAnalysis` | 启用（JDK 7u4+） | 逃逸分析 |
| `-XX:+UseTLAB` | 启用 | 线程本地分配缓冲区 |
| `-XX:+ResizeTLAB` | 启用 | 自适应调整TLAB大小 |
| `-XX:+TraceClassLoading` | 关闭 | 跟踪类加载 |
| `-XX:+TraceClassUnloading` | 关闭 | 跟踪类卸载 |
| `-XX:MaxMetaspaceFreeRatio` | 70 | 元空间空闲比例上限，触发类卸载 |

在下一章中，我们将基于本章的内存管理知识和GC原理，深入探讨JVM垃圾收集器的选型与调优——包括G1、ZGC、Parallel等主流收集器的参数配置和性能优化实践。

> 本章所讨论的所有代码示例均可在项目 jvm-lab/cases/ch07-oom 中找到。建议读者在本地运行这些Demo，亲身体验OOM的产生和排查过程。运行前请确保已设置合适的JVM参数限制，避免影响同一台机器上的其他进程。
