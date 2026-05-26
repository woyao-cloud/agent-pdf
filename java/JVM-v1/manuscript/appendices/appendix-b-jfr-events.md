# 附录B JFR 事件类型参考手册

> JDK Flight Recorder（JFR）是 HotSpot VM 内置的低开销事件记录框架。本附录按分类整理了 JFR 的核心事件类型，包括事件名称、描述、关键字段和使用场景。

---

## B.1 GC 事件

GC 事件是 JFR 中最常用的类别，用于分析和诊断垃圾收集器的行为。

### B.1.1 GC Phase Pause

**事件名称**：`jdk.GCPhasePause`

**描述**：记录 GC 中 STW（Stop-The-World）暂停阶段的详细信息。每个暂停阶段独立记录，包括 Parallel GC 的各个子阶段、G1 的 Young/Mixed/Humongous 等暂停，以及 ZGC 的 STW 阶段。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `gcId` | long | GC 的唯一标识 ID |
| `phase` | String | 暂停阶段名称（如 "GC Pause", "Young Pause", "Mixed Pause"）|
| `pauseTarget` | long | 预期的 GC 暂停目标（纳秒）|
| `duration` | long | 实际暂停时间（纳秒）|
| `startTime` | long | 阶段开始时间戳 |

**使用场景**：评估 GC 暂停时间是否达到预期目标，定位耗时最长的 GC 子阶段，排查异常长暂停。

---

### B.1.2 GC Heap Summary

**事件名称**：`jdk.GCHeapSummary`

**描述**：GC 暂停前后的堆内存使用情况快照。包含各个分代（新生代、老年代、元空间）的容量和使用量。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `gcId` | long | GC ID |
| `when` | String | 快照时机："Before GC" 或 "After GC" |
| `heapUsed` | long | 堆已使用量（字节）|
| `heapCommitted` | long | 堆已提交量（字节）|
| `heapMax` | long | 堆最大容量（字节）|
| `youngUsed` | long | 新生代已使用量 |
| `oldUsed` | long | 老年代已使用量 |
| `metaspaceUsed` | long | 元空间已使用量 |

**使用场景**：观察 GC 的内存回收效率，判断是否存在内存泄漏，分析各分代的使用趋势。

---

### B.1.3 GC Configuration

**事件名称**：`jdk.GCConfiguration`

**描述**：JVM 启动时记录的 GC 配置信息，通常在 JFR 记录开始时触发一次。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `youngCollector` | String | 新生代收集器名称 |
| `oldCollector` | String | 老年代收集器名称 |
| `parallelGCThreads` | int | 并行 GC 线程数 |
| `concurrentGCThreads` | int | 并发 GC 线程数 |
| `heapSize` | long | 堆大小 |
| `minHeapSize` | long | 最小堆大小 |
| `maxHeapSize` | long | 最大堆大小 |

**使用场景**：验证实际运行的 JVM 配置是否与预期一致，排查配置未生效的问题。

---

### B.1.4 GC Statistics

**事件名称**：`jdk.GCStatistics`

**描述**：聚合的 GC 统计信息，包含累积的 GC 次数、总暂停时间等。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `gcCount` | long | GC 总次数 |
| `gcTimeMillis` | long | GC 总暂停时间（毫秒）|
| `gcTimePercentage` | float | GC 时间占总运行时间的百分比 |
| `allocRate` | long | 分配速率（字节/秒）|
| `promotionRate` | long | 晋升速率（字节/秒）|

**使用场景**：宏观评估 GC 开销，判断是否需要调优。

---

### B.1.5 Evacuation Information

**事件名称**：`jdk.EvacuationInformation`

**描述**：G1 收集器在 Young GC 或 Mixed GC 中，Region 间对象拷贝（Evacuation）的详细信息。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `gcId` | long | GC ID |
| `evacuationFailed` | boolean | 是否发生拷贝失败 |
| `regionsFreed` | int | 释放的 Region 数量 |
| `totalRegions` | int | 总 Region 数量 |

**使用场景**：诊断 G1 晋升失败（Promotion Failure）问题，评估 Mixed GC 区域选择效果。

---

### B.1.6 ZGC Allocations

**事件名称**：`jdk.ZAllocation`

**描述**：ZGC 收集器的分配事件，记录大对象分配等特殊情况。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `allocationSize` | long | 分配大小（字节）|
| `startTime` | long | 分配开始时间 |
| `tlabSize` | long | TLAB 大小（如果通过 TLAB 分配）|
| `gcId` | long | 关联的 GC ID |

**使用场景**：分析 ZGC 下的大对象分配行为，配合 ZGC Stages 事件评估分配压力。

---

### B.1.7 ZGC Stages

**事件名称**：`jdk.ZGCStage`

**描述**：ZGC 各并发阶段的详细耗时，包括 Pause Mark Start、Concurrent Mark、Pause Mark End、Concurrent Process Non-Strong References、Concurrent Reset Relocation Set、Concurrent Relocate 等。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `stage` | String | 阶段名称 |
| `duration` | long | 阶段耗时（纳秒）|
| `workers` | int | 参与线程数 |
| `gcId` | long | GC ID |

**使用场景**：分析 ZGC 各阶段耗时分布，定位瓶颈阶段，评估并发线程数是否充足。

---

## B.2 JIT 事件

JIT 编译器的事件用于分析代码编译行为、方法内联决策以及编译器性能。

### B.2.1 Compilation

**事件名称**：`jdk.Compilation`

**描述**：记录每个方法的编译事件，包括编译层级、代码大小和耗时。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | String | 编译的方法全限定名 |
| `compileLevel` | int | 编译层级（0=解释执行, 1~3=C1, 4=C2）|
| `codeSize` | long | 生成的本地代码大小（字节）|
| `allocatedBytes` | long | 编译过程中分配的字节数 |
| `duration` | long | 编译耗时（纳秒）|
| `isOsr` | boolean | 是否为栈上替换（OSR）编译 |

**使用场景**：分析应用的编译热点，识别未编译的热点方法，评估编译开销。

---

### B.2.2 Compiler Phase

**事件名称**：`jdk.CompilerPhase`

**描述**：编译器内部的各个优化阶段，如内联解析、循环优化、逃逸分析等。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `compiler` | String | 编译器名称（C1 或 C2）|
| `phase` | String | 阶段名称 |
| `duration` | long | 阶段耗时（纳秒）|
| `compileId` | int | 编译任务 ID |

**使用场景**：深入分析编译器热点，识别哪个优化阶段耗时最长，辅助编译器调优。

---

### B.2.3 Compilation Failure

**事件名称**：`jdk.CompilationFailure`

**描述**：方法编译失败的事件，记录失败原因。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | String | 编译失败的方法 |
| `cause` | String | 失败原因（如 "code cache full", "too big" 等）|
| `compileId` | int | 编译任务 ID |
| `message` | String | 详细错误消息 |

**使用场景**：诊断方法编译失败的原因，排查 CodeCache 不足、方法过大导致无法内联等问题。

---

### B.2.4 Inlining

**事件名称**：`jdk.Inlining`

**描述**：方法内联决策事件，记录每个内联尝试的决策结果。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | String | 被调用方法 |
| `caller` | String | 调用者方法 |
| `inliningSucceeded` | boolean | 内联是否成功 |
| `reason` | String | 内联决策原因 |
| `bci` | int | 字节码索引 |
| `inlineDepth` | int | 当前内联深度 |

**使用场景**：方法内联是 JIT 最重要的优化之一，使用此事件可验证内联决策是否符合预期，排查内联失败原因。

---

## B.3 线程事件

线程事件用于分析线程生命周期、线程状态、以及线程间的竞争情况。

### B.3.1 Thread Start / End

**事件名称**：`jdk.ThreadStart` / `jdk.ThreadEnd`

**描述**：记录线程的创建和销毁事件。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `threadId` | long | Java 线程 ID |
| `osThreadId` | long | 操作系统线程 ID |
| `parentThread` | String | 父线程名称（仅 Start）|

**使用场景**：监控应用中线程的创建和销毁情况，排查线程泄漏或线程池滥用问题。

---

### B.3.2 Thread Park

**事件名称**：`jdk.ThreadPark`

**描述**：线程因等待某个条件而 park（暂停）的事件，通常对应 `LockSupport.park()` 调用。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `parkedClass` | Class | park 的阻塞对象 |
| `timeout` | long | 超时时间（纳秒），-1 表示无限等待 |
| `duration` | long | 实际 park 持续时间 |

**使用场景**：分析线程的等待行为，评估线程池空闲比例。

---

### B.3.3 Thread Sleep

**事件名称**：`jdk.ThreadSleep`

**描述**：线程调用 `Thread.sleep()` 的事件。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `sleepTime` | long | 请求的睡眠时间（毫秒）|
| `actualTime` | long | 实际的睡眠时间 |

**使用场景**：检查代码中是否存在不合理的 Thread.sleep() 调用，确认线程唤醒延迟。

---

### B.3.4 Thread CPU Load

**事件名称**：`jdk.ThreadCPULoad`

**描述**：各线程的 CPU 使用率，周期性采样记录。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `threadId` | long | 线程 ID |
| `userMode` | double | 用户态 CPU 使用率（0.0~1.0）|
| `systemMode` | double | 内核态 CPU 使用率（0.0~1.0）|

**使用场景**：定位 CPU 热点线程，区分用户态和内核态开销。

---

### B.3.5 Java Monitor Enter / Blocked / Wait

**事件名称**：`jdk.JavaMonitorEnter` / `jdk.JavaMonitorBlocked` / `jdk.JavaMonitorWait`

**描述**：Java 对象监视器（synchronized）相关事件，记录线程进入、阻塞和等待监视器的过程。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `monitorClass` | Class | 监视器关联的 Java 类 |
| `previousOwner` | String | 前一个持有者线程名称 |
| `duration` | long | 阻塞/等待持续时间 |
| `address` | long | 监视器的内存地址 |

**使用场景**：分析 synchronized 锁竞争情况，定位锁竞争热点，优化锁粒度。

---

## B.4 IO 事件

IO 事件用于分析网络和文件 I/O 行为，识别 IO 瓶颈。

### B.4.1 Socket Read / Write

**事件名称**：`jdk.SocketRead` / `jdk.SocketWrite`

**描述**：Socket 的读写事件，包括本地和远程地址信息。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `host` | String | 远程主机名或 IP |
| `port` | int | 远程端口 |
| `address` | String | 远程地址 |
| `bytesRead` / `bytesWritten` | long | 读/写的字节数 |
| `duration` | long | 操作耗时（纳秒）|
| `timeout` | long | 超时时间（毫秒）|

**使用场景**：分析网络延迟，排查慢请求的 IO 耗时，识别跨网络调用瓶颈。

---

### B.4.2 File Read / Write

**事件名称**：`jdk.FileRead` / `jdk.FileWrite`

**描述**：文件的读写事件，记录操作的文件路径和数据量。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | String | 文件路径 |
| `bytesRead` / `bytesWritten` | long | 读/写的字节数 |
| `duration` | long | 操作耗时（纳秒）|
| `force` | boolean | 是否为强制刷盘操作 |

**使用场景**：分析磁盘 IO 负载，定位高 IO 的文件操作，排查刷盘频率过高的问题。

---

### B.4.3 Network Utilization

**事件名称**：`jdk.NetworkUtilization`

**描述**：网络接口利用率的周期性采样数据。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `networkInterface` | String | 网络接口名称 |
| `readRate` | long | 读取速率（字节/秒）|
| `writeRate` | long | 写入速率（字节/秒）|
| `maximumRate` | long | 最大可用速率 |

**使用场景**：评估网络带宽利用率，判断网络是否是系统瓶颈。

---

## B.5 内存事件

内存事件用于分析对象分配、TLAB 使用和堆内存趋势。

### B.5.1 Allocation Requiring GC

**事件名称**：`jdk.AllocationRequiringGC`

**描述**：当对象分配因内存不足而需要触发 GC 时记录。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `size` | long | 分配大小（字节）|
| `objectClass` | Class | 正在分配的对象类 |
| `allocationStackTrace` | StackTrace | 分配调用栈 |

**使用场景**：定位频繁触发 GC 的分配热点，通过调用栈找到需要优化的代码路径。

---

### B.5.2 TLAB Allocation

**事件名称**：`jdk.TLABAllocation`

**描述**：线程本地分配缓冲区（TLAB）内的对象分配事件。TLAB 分配不需要同步，是最高效的分配路径。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `objectClass` | Class | 分配的类 |
| `tlabSize` | long | TLAB 大小 |
| `allocatedSize` | long | 分配对象的实际大小 |
| `startTime` | long | 分配时间 |

**使用场景**：分析线程分配速率，识别分配热点类。

---

### B.5.3 Object Alloc in New TLAB

**事件名称**：`jdk.ObjectAllocationInNewTLAB`

**描述**：在新的 TLAB 中分配对象的采样事件。当 TLAB 用尽并申请新的 TLAB 时触发。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadName` | String | 线程名称 |
| `objectClass` | Class | 分配的类 |
| `allocationSize` | long | 分配大小 |
| `tlabSize` | long | 新 TLAB 总大小 |

**使用场景**：分析 TLAB 使用频率，评估 TLAB 大小是否合适。

---

### B.5.4 Old Object Sample

**事件名称**：`jdk.OldObjectSample`

**描述**：老年代对象采样事件，用于内存泄漏检测。这是 JFR 的"泄漏检测"功能的基础。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `object` | Object | 采样的对象 |
| `objectClass` | Class | 对象类 |
| `age` | long | 对象存活时间 |
| `allocationTime` | long | 分配时间 |
| `stackTrace` | StackTrace | 分配调用栈 |

**使用场景**：使用 JDK Mission Control 的"内存泄漏检测"功能时，此事件是核心数据源。通过分析老年代对象的分配调用栈定位泄漏点。

---

### B.5.5 Heap Summary

**事件名称**：`jdk.HeapSummary`

**描述**：定期（非 GC 相关）的堆使用情况快照，与 GC Pause 事件独立。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `heapUsed` | long | 堆已使用量 |
| `heapCommitted` | long | 堆已提交量 |
| `heapMax` | long | 堆最大容量 |
| `nonHeapUsed` | long | 非堆内存使用量 |
| `objectPendingFinalizationCount` | int | 等待 finalization 的对象数 |

**使用场景**：观察堆内存的长期趋势，不与 GC 事件绑定的独立快照。

---

## B.6 锁事件

锁事件专注于 Java 锁（synchronized 和 `java.util.concurrent` 包中的锁）的竞争和等待行为。

### B.6.1 Java Monitor Blocked

**事件名称**：`jdk.JavaMonitorBlocked`

**描述**：线程在尝试获取监视器时被阻塞（无法立即进入）的事件。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `monitorClass` | Class | 监视器关联的类 |
| `previousOwner` | String | 当前持有者线程名 |
| `duration` | long | 阻塞持续时间 |
| `address` | long | 监视器地址 |

**使用场景**：定位锁竞争最激烈的监视器，为锁优化（如缩小 synchronized 块、改用 ReadWriteLock）提供依据。

---

### B.6.2 Java Monitor Wait

**事件名称**：`jdk.JavaMonitorWait`

**描述**：线程调用 `wait()` 进入等待队列的事件。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `monitorClass` | Class | 监视器关联的类 |
| `notifier` | String | 唤醒线程名称（如已知）|
| `timeout` | long | wait 超时时间 |
| `duration` | long | 等待持续时间 |

**使用场景**：分析 wait/notify 模式的效率，验证通知延迟是否异常。

---

### B.6.3 Java Monitor Enter

**事件名称**：`jdk.JavaMonitorEnter`

**描述**：线程成功进入监视器的事件。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `monitorClass` | Class | 监视器关联的类 |
| `previousOwner` | String | 前一个持有者（如果有竞争）|
| `duration` | long | 进入耗时 |
| `address` | long | 监视器地址 |

**使用场景**：综合 Monitor Blocked 和 Monitor Enter 事件，全面分析 synchronized 的使用情况。

---

## B.7 诊断事件

诊断事件提供了 JVM 进程和宿主系统的健康指标。

### B.7.1 CPU Load

**事件名称**：`jdk.CPULoad`

**描述**：JVM 进程和整个系统的 CPU 使用率。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `jvmUser` | double | JVM 用户态 CPU (0.0~1.0) |
| `jvmSystem` | double | JVM 内核态 CPU (0.0~1.0) |
| `machineTotal` | double | 系统总 CPU 使用率 |
| `jvmTotal` | double | JVM 总 CPU 使用率 |

**使用场景**：评估 JVM 对 CPU 的消耗，判断 CPU 瓶颈在用户态还是内核态。

---

### B.7.2 System Process

**事件名称**：`jdk.SystemProcess`

**描述**：JVM 进程本身的资源使用信息，包括内存、CPU 和文件描述符等。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `residentSetSize` | long | 常驻内存大小（RSS）|
| `virtualSize` | long | 虚拟内存大小 |
| `openFileDescriptorCount` | int | 打开的文件描述符数 |
| `cpuLoad` | double | 进程 CPU 使用率 |
| `processId` | long | 进程 ID |

**使用场景**：监控 JVM 进程的资源使用趋势，排查文件描述符泄漏和内存泄漏。

---

### B.7.3 Native Memory Usage

**事件名称**：`jdk.NativeMemoryUsage`

**描述**：使用 Native Memory Tracking（NMT）功能记录的本机内存使用情况。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `memoryType` | String | 内存类型（Java Heap, Class, Thread, Code, GC, Compiler, etc.）|
| `reserved` | long | 已保留内存（字节）|
| `committed` | long | 已提交内存（字节）|
| `peakReserved` | long | 峰值保留内存 |
| `peakCommitted` | long | 峰值已提交内存 |

**使用场景**：分析 JVM 进程的完整内存画像，区分 Java 堆和非堆内存使用量，排查非堆内存泄漏问题。需要在启动参数中添加 `-XX:NativeMemoryTracking=summary` 或 `detail`。

---

### B.7.4 Class Loading Statistics

**事件名称**：`jdk.ClassLoadingStatistics`

**描述**：类加载和卸载的统计数据。

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `loadedClassCount` | long | 已加载的类总数 |
| `unloadedClassCount` | long | 已卸载的类总数 |
| `totalLoadedClassCount` | long | 累积加载的类总数 |
| `totalUnloadedClassCount` | long | 累积卸载的类总数 |

**使用场景**：监控类加载行为，排查元空间泄漏问题（类加载后无法卸载导致元空间持续增长）。

---

## B.8 事件配置建议

以下是基于不同使用场景的事件配置建议：

| 场景 | 推荐事件 | 采集频率/配置 |
|------|---------|--------------|
| GC 性能分析 | GC Phase Pause, GC Heap Summary, GC Statistics | 每次 GC 触发 |
| 内存泄漏检测 | Old Object Sample, GC Heap Summary, Native Memory Usage | Old Object Sample: 每 100ms |
| CPU 热点分析 | Compilation, CPU Load, Thread CPU Load, Inlining | CPU Load: 每秒 |
| 锁竞争分析 | Java Monitor Blocked, Java Monitor Enter, Java Monitor Wait | 每次阻塞/等待 |
| IO 瓶颈分析 | Socket Read/Write, File Read/Write, Network Utilization | 每次 IO 操作 |
| 全量性能评估 | 按需在 JDK Mission Control 中选择 "Continuous" 或 "Profile" 模板 | 默认配置即可 |

---

> **说明**：JFR 的事件类型和字段在不同 JDK 版本间可能有细微差异。JDK 21+ 新增了分代 ZGC 相关事件，JDK 17 中部分事件字段有所变更。请以对应 JDK 版本的官方文档为准。
