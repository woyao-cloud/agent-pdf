# 附录A 常用 JVM 参数速查表

> 本附录整理了 Java 虚拟机最常用的参数配置，按功能场景分类，便于日常开发和线上排查时快速查阅。

---

## A.1 内存配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-Xms` | 由操作系统决定 | 初始堆大小，通常设为与 `-Xmx` 相同以避免运行时动态调整 |
| `-Xmx` | 由操作系统决定 | 最大堆大小，物理内存充足时建议不超过系统内存的 70%~80% |
| `-Xmn` | 堆的 1/3 | 新生代大小，影响 GC 频率和停顿时间 |
| `-Xss` | 1MB（Linux x64） | 线程栈大小，减少该值可在相同内存下创建更多线程 |
| `-XX:MaxMetaspaceSize` | 无限制 | 元空间最大大小，受物理内存限制 |
| `-XX:MetaspaceSize` | ~21MB | 元空间初始大小，达到此值会触发 Full GC 进行类卸载 |
| `-XX:MaxDirectMemorySize` | 与 `-Xmx` 相同 | 最大直接内存（Direct Buffer），NIO 编程时需关注 |
| `-XX:InitialHeapSize` | 与 `-Xms` 相同 | 初始堆大小，通常不单独设置 |
| `-XX:NewRatio` | 2 | 老年代与新生代的比例，`-XX:NewRatio=2` 表示老年代占堆的 2/3 |
| `-XX:SurvivorRatio` | 8 | Eden 区与单个 Survivor 区的比例，`-XX:SurvivorRatio=8` 表示 Eden:Survivor=8:1:1 |
| `-XX:MaxTenuringThreshold` | 15 | 对象晋升老年代前经历的最大 GC 次数 |
| `-XX:PretenureSizeThreshold` | 0 | 大于此值的对象直接在老年代分配，避免在 Eden 和 Survivor 间复制 |
| `-XX:+UseCompressedOops` | 堆 < 32GB 时 true | 启用压缩指针，将 64 位指针压缩为 32 位，减少内存占用 |
| `-XX:StringDeduplication` | false | 启用字符串去重，对 G1 收集器有效，可减少重复 String 对象的内存占用 |

**关键说明：**

- **`-Xms` 与 `-Xmx` 建议设为相同值**。这有两个好处：一是避免运行期堆大小动态调整带来的性能损耗；二是在系统启动时就申请好全部内存，降低因内存不足导致 OOM 的概率。
- **`-Xmn` 的大小直接影响 GC 行为**。新生代越大，Minor GC 频率越低，但单次停顿时间变长；新生代越小则反之。建议先设为堆的 1/3，再通过 GC 日志调优。
- **`-Xss` 在容器环境中尤其重要**。默认 1MB 在创建大量线程时容易耗尽容器内存。对于线程密集的应用（如网关），可设为 256KB~512KB。
- **`-XX:MetaspaceSize` 不是硬上限**，它是一个触发 Full GC 的阈值。当元空间使用量达到该值时，JVM 会尝试进行类卸载。合理设置可避免元空间增长过快导致频繁 Full GC。

---

## A.2 GC 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:+UseG1GC` | JDK 9+ 默认 | 使用 G1 垃圾收集器，适合大堆内存和低延迟场景 |
| `-XX:+UseZGC` | false | 使用 ZGC 收集器，JDK 11+，亚毫秒级停顿 |
| `-XX:+UseParallelGC` | 取决于硬件和 JDK 版本 | 使用并行收集器，吞吐量优先 |
| `-XX:+UseSerialGC` | false | 使用串行收集器，单线程，适合小堆和客户端模式 |
| `-XX:+UseShenandoahGC` | false | 使用 Shenandoah 收集器，JDK 12+，与 ZGC 类似的低停顿收集器 |
| `-XX:MaxGCPauseMillis` | 200ms（G1）| 最大 GC 停顿时间目标，G1 会以此为优化目标调整分代大小 |
| `-XX:G1HeapRegionSize` | 1~32MB（自动）| G1 Region 大小，堆被划分为等大小的 Region |
| `-XX:InitiatingHeapOccupancyPercent` | 45 | G1 触发并发标记周期的堆占用百分比（IHOP）|
| `-XX:G1MixedGCLiveThresholdPercent` | 85 | Mixed GC 中 Region 存活对象的百分比阈值 |
| `-XX:G1MixedGCCountTarget` | 8 | Mixed GC 的目标次数，控制单次 Mixed GC 处理多少 Region |
| `-XX:G1ReservePercent` | 10 | G1 为晋升预留的空间百分比 |
| `-XX:ConcGCThreads` | 取决于 CPU 核心数 | 并发 GC 线程数 |
| `-XX:ParallelGCThreads` | 取决于 CPU 核心数 | 并行 GC 线程数，STW 阶段使用 |
| `-XX:+ZGenerational` | JDK 21+ 后默认 true | 启用分代 ZGC，显著降低 ZGC 的内存占用和 CPU 开销 |
| `-XX:ZAllocationSpikeTolerance` | 2.0 | ZGC 分配尖峰容忍度，值越大预留空间越多 |
| `-XX:SoftMaxHeapSize` | 无限制 | ZGC 的软最大堆，ZGC 会尽量将堆控制在此值以下 |

**关键说明：**

- **GC 收集器的选择原则**：延迟敏感场景优先考虑 G1 或 ZGC；吞吐量优先场景（如批处理）优先考虑 Parallel GC；堆小于 4GB 时 Serial GC 也有用武之地。
- **`-XX:MaxGCPauseMillis` 不是硬保证**，它只是一个优化目标。G1 会在每次 GC 后评估是否达到目标，并动态调整新生代大小。
- **分代 ZGC（`-XX:+ZGenerational`）在 JDK 21+ 后成为默认**。相比不分代 ZGC，分代 ZGC 大幅减少了 CPU 开销，同时降低了内存占用。建议新项目直接使用 JDK 21+。
- **`-XX:InitiatingHeapOccupancyPercent`（IHOP）的设置**：值过小会导致过早启动并发标记，增加 CPU 开销；值过大会增加 Full GC 风险。可通过 JFR 的 GC Heap Summary 事件观察实际使用情况后调整。

---

## A.3 JIT 编译参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:CompileThreshold` | 10000（C1）| 方法调用/循环回边次数达到此值时触发编译 |
| `-XX:MaxInlineLevel` | 9 | 方法内联的最大嵌套层级 |
| `-XX:InlineSmallCode` | 2000（C2）| 小于此大小的字节码将被考虑内联 |
| `-XX:+DoEscapeAnalysis` | true | 启用逃逸分析，允许栈上分配和锁消除 |
| `-XX:+PrintCompilation` | false | 打印编译日志，排查 JIT 行为问题时非常有用 |
| `-XX:+PrintInlining` | false | 打印内联决策，需配合 `-XX:+UnlockDiagnosticVMOptions` 使用 |
| `-XX:ReservedCodeCacheSize` | 240MB | 代码缓存的最大大小，存放编译后的本地代码 |
| `-XX:NonNMethodCodeHeapSize` | 5MB + 约 6MB 元数据 | 非方法代码缓存（如编译器和适配器代码）|
| `-XX:+TieredCompilation` | true | 启用分层编译，先用 C1 快速编译，再用 C2 深度优化 |
| `-XX:+BackgroundCompilation` | true | 后台编译，编译任务在后台线程异步进行 |
| `-XX:CICompilerCount` | 取决于 CPU | 编译器线程数 |
| `-XX:+UseJVMCICompiler` | false | 使用 Graal JIT 编译器替代 C2 |
| `-XX:FrequencyInvocations` | L1: 200 | 分层编译中，各层触发的调用计数值 |
| `-XX:FrequencyInlines` | JVM 默认 | 分层编译中，各层触发的内联计数值 |

**关键说明：**

- **分层编译机制**：Client 编译器（C1）编译速度快，但生成的代码优化度低；Server 编译器（C2）编译速度慢，但生成的代码高度优化。分层编译先用 C1 快速编译以提升启动速度，再用 C2 深度优化热点代码。
- **`-XX:+PrintCompilation` 是最实用的 JIT 诊断参数**。它会输出每个编译事件，包括方法名、编译层级、代码大小等。配合 `-XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation` 可输出详细的 XML 编译日志。
- **逃逸分析（Escape Analysis）**：是 JIT 最重要的优化手段之一。它分析对象是否逃逸出方法作用域，如果未逃逸，可以进行栈上分配（消除堆分配）、锁消除和标量替换。
- **内联（Inlining）是 JIT 最基础的优化**。JVM 会尝试将小方法的调用点替换为方法体本身，消除调用开销并为后续优化提供更大的分析范围。`-XX:MaxInlineLevel` 控制内联深度，`-XX:InlineSmallCode` 控制方法体积阈值。

---

## A.4 诊断与日志参数

| 参数 | 说明 |
|------|------|
| `-Xlog:gc*` | JDK 9+ 统一日志框架，打印所有 GC 事件 |
| `-Xlog:gc+heap*` | 打印堆详细信息，包括各分区使用量 |
| `-Xlog:gc*:file=gc.log:time,level,tags` | JSON: GC 日志输出到文件，包含时间戳和级别 |
| `-Xlog:gc+z*` | ZGC 专用日志，含并发阶段详情 |
| `-Xlog:jit+compilation*` | 编译日志，效果同 `-XX:+PrintCompilation` |
| `-Xlog:os+cpu*` | 操作系统 CPU 相关信息 |
| `-Xlog:gc+phases` | GC 各阶段耗时日志 |
| `-Xlog:gc+ergo*` | GC 自适应优化决策日志 |
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时自动生成堆转储文件 |
| `-XX:HeapDumpPath` | 堆转储文件路径，默认 `java_pid<pid>.hprof` |
| `-XX:+PrintClassHistogram` | 按 Ctrl+Break（Windows）或 SIGQUIT（Linux）打印类直方图 |
| `-XX:+FlightRecorder` | JDK 11+ 默认开启，启用 JFR 飞行记录器 |
| `-XX:StartFlightRecording` | 启动时自动开始 JFR 记录，可指定时长、转储路径等 |
| `-XX:FlightRecorderOptions` | JFR 高级选项，如堆栈深度、全局缓冲区大小 |

**关键说明：**

- **JDK 9+ 统一日志框架**：`-Xlog` 取代了旧的 `-XX:+PrintGCDetails`、`-XX:+PrintGCTimeStamps` 等参数。它的格式为 `-Xlog:<tag-set><level>=<output>`。例如 `-Xlog:gc*,gc+heap*=debug:file=gc.log:time,level,tags`。
- **堆转储自动触发**：`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/dumps/` 是生产环境的标配。OOM 时自动生成 hprof 文件，用于事后分析内存泄漏。
- **JFR 是诊断利器**：JDK 11+ 默认内置了 JDK Flight Recorder（JFR），可在不重启 JVM 的情况下通过 `jcmd` 动态启停。JFR 对性能的影响通常低于 1%，生产环境可常开。

---

## A.5 性能调优参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-XX:+AlwaysPreTouch` | false | 启动时预触所有内存页，避免运行时缺页中断带来的性能抖动 |
| `-XX:+UseNUMA` | false | 启用 NUMA 感知的内存分配，多路服务器上可提升性能 |
| `-XX:+UseTransparentHugePages` | false | 使用透明大页，减少 TLB miss，需操作系统支持 |
| `-XX:LargePageSizeInBytes` | 2MB（x86） | 设置大页大小 |
| `-XX:+UseLargePages` | false | 启用显式大页，需操作系统预先分配大页池 |
| `-XX:+UseContainerSupport` | JDK 10+ 默认 true | 自动识别容器内存和 CPU 限制 |
| `-XX:ActiveProcessorCount` | 检测到的处理器数 | 手动指定 JVM 可见的 CPU 核心数 |
| `-XX:+UnlockExperimentalVMOptions` | false | 解锁实验性 VM 参数 |
| `-XX:+AssumeMP` | false | 假设运行在多处理器环境，影响部分同步优化路径 |

**关键说明：**

- **预触内存（`-XX:+AlwaysPreTouch`）**：在启动时将所有堆内存页提交物理内存。虽然启动变慢，但避免了运行时 GC 等操作触发缺页中断导致的性能抖动。在延迟敏感的生产环境推荐开启。
- **大页（Huge Pages）**：CPU 的 TLB 缓存条目数有限，大页允许更大的内存范围用更少的 TLB 条目覆盖，从而降低 TLB miss 率。有两个实现路径：透明大页（THP）和显式大页。显式大页性能更稳定，但需要手动配置操作系统。
- **容器感知**：JDK 10+ 默认开启了容器内存和 CPU 限制的自动识别。如果使用 `-XX:+UseContainerSupport`，JVM 会读取 cgroup 的限制值。如果遇到 JVM 不识别容器限制的问题，首先检查 JDK 版本是否低于 10。

---

## A.6 最佳实践组合

### 场景一：低延迟微服务（堆 < 4GB，响应时间优先）

```
-Xms2g -Xmx2g -Xmn1g
-XX:+UseG1GC
-XX:MaxGCPauseMillis=100
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/opt/dumps/
-Xlog:gc*:file=/opt/logs/gc.log:time,level,tags
-XX:+FlightRecorder
```

### 场景二：大内存数据平台（堆 > 16GB，低延迟）

```
-Xms16g -Xmx16g
-XX:+UseZGC
-XX:+ZGenerational
-XX:MaxGCPauseMillis=10
-XX:+AlwaysPreTouch
-XX:+UseContainerSupport
-Xlog:gc*:file=/opt/logs/gc.log:time,level,tags
-XX:+HeapDumpOnOutOfMemoryError
```

### 场景三：批处理/离线计算（吞吐量优先）

```
-Xms8g -Xmx8g -Xmn4g
-XX:+UseParallelGC
-XX:ParallelGCThreads=8
-XX:+UseAdaptiveSizePolicy
-XX:+HeapDumpOnOutOfMemoryError
-Xlog:gc*:file=/opt/logs/gc.log:time,level,tags
-XX:+FlightRecorder
```

### 场景四：高线程数网关（线程多，连接多）

```
-Xms4g -Xmx4g -Xmn2g
-Xss256k
-XX:+UseG1GC
-XX:MaxGCPauseMillis=100
-XX:+UseContainerSupport
-XX:+HeapDumpOnOutOfMemoryError
-Xlog:gc*:file=/opt/logs/gc.log:time,level,tags
-XX:+FlightRecorder
```

### 场景五：诊断调试（开发/测试环境）

```
-Xms512m -Xmx512m
-XX:+UseG1GC
-Xlog:gc*,gc+heap*,gc+phases:file=gc.log:time,level,tags
-XX:+PrintCompilation
-XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining
-XX:+HeapDumpOnOutOfMemoryError
-XX:+FlightRecorder
-XX:StartFlightRecording=settings=profile,duration=120s,filename=recording.jfr
```

---

> **参数调优的核心原则**：没有万能的参数配置。每次修改参数后，应通过 GC 日志、JFR、Prometheus + Grafana 等工具链观察效果，量化验证后再决定是否保留变更。
