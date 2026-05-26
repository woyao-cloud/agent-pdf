# 第11章 高并发订单系统GC调优实战

## 11.1 案例背景

### 11.1.1 业务场景

本案例来源于一个典型的电商限时抢购（Flash Sale）订单服务。该服务的核心职责是处理用户在下单瞬间提交的海量订单请求，要求在极短的时间内完成订单的创建、验证、持久化等一系列操作。系统上线初期，在低并发时段表现平稳，但每逢大促活动——例如"双十一"或"618"——流量峰值到来时，系统便开始出现明显的性能劣化，具体表现为接口响应时间急剧升高、部分请求超时甚至返回错误。

该服务的架构设计遵循了微服务的主流实践：前端通过 Nginx 反向代理将请求分发到多个 Spring Boot 应用实例，每个实例背后连接着 Redis 缓存和 MySQL 数据库。订单处理的核心链路包括用户身份校验、库存扣减、订单生成、支付调起等步骤。服务实例均部署在 8 核 16 GB 的容器中，JDK 版本为 17，采用 G1 垃圾回收器。

### 11.1.2 性能指标与问题表象

在常规流量下（约 500 订单/秒），服务的 P99 延迟稳定在 30 ms 以内，GC 暂停时间不超过 50 ms，系统健康度良好。然而当流量飙升至 5000 订单/秒以上时，通过 k6 压测工具观察到的指标令人担忧：

- **P99 延迟**：从正常的 30 ms 飙升至 800 ms 以上，部分请求甚至超过 2 秒。
- **错误率**：从接近 0% 上升至 5%-8%，大量的 HTTP 503 和 504 错误开始出现。
- **GC 频率**：Full GC 的触发变得频繁，有时每隔几分钟就会发生一次。
- **CPU 使用率**：虽未达到 100%，但 GC 线程占用的 CPU 时间显著增加。

这些指标表明，垃圾回收器在高并发压力下已经成为了系统的瓶颈。下面我们将遵循完整的诊断流程，从现象发现开始，逐步深入到根因定位，最终给出有效的优化方案。

### 11.1.3 实验环境搭建

为了让读者能够亲身体验完整的调优过程，本章提供了一个可复现的 Spring Boot 3.x 示例项目。项目位于 `jvm-lab/cases/comprehensive/case01-order/` 目录下，主要包含以下组件：

- **OrderApplication**：Spring Boot 入口类，提供 RESTful 接口模拟订单创建。
- **Order**：JDK 16 引入的 `record` 类型，用于表示订单对象。
- **OrderProcessor**：核心业务组件，维护一个 `ConcurrentLinkedDeque<Order>` 作为订单缓冲区，每次请求到来时会创建新订单、执行模拟的 CPU 计算并定期清理过期订单。
- **load-test-order.sh**：基于 k6 的负载测试脚本，用于模拟 50 个并发虚拟用户持续发送订单请求。

启动服务时建议添加以下 JVM 参数以复现问题场景：

```bash
java -Xms4g -Xmx4g -XX:+UseG1GC \
     -Xlog:gc*:file=gc.log:time,uptime,level,tags \
     -XX:+UnlockDiagnosticVMOptions \
     -jar target/case01-order-1.0-SNAPSHOT.jar
```

执行压测命令：

```bash
./jvm-lab/scripts/load-test-order.sh http://localhost:8080 120
```

上述命令会以 50 个并发用户在 120 秒内向订单服务发送连续的 POST 请求，期间我们可以通过 GC 日志、JFR 记录等工具观察系统的运行状态。

## 11.2 现象发现

### 11.2.1 从 k6 输出看性能劣化

当压测运行约 30 秒后，k6 的实时输出开始呈现出明显的性能退化信号。以下是典型的压测输出片段：

```
http_req_duration......: avg=187.3ms  min=4.2ms  med=92.1ms  max=2147.3ms
http_req_duration......: p(90)=412.5ms p(95)=634.8ms p(99)=812.3ms
http_reqs...............: 15234  // 253.9/s
http_req_failed........: 5.23%  ✓ 797   ✗ 14437
```

与基准数据对比可以发现如下关键变化：

1. **P99 延迟从 30 ms 跃升至 812 ms**，增长了约 27 倍。这是用户体验最直观的劣化指标，意味着最慢的 1% 的请求需要等待近 1 秒才能得到响应。
2. **请求成功率下降**，5.23% 的请求返回了非 200 状态码。这些失败请求通常伴随着连接超时或服务端内部错误。
3. **吞吐量受限**，实际处理速率仅为 254 请求/秒，远低于预期的 5000+ 请求/秒。这表明系统已经无法有效利用 CPU 资源来处理业务逻辑。

### 11.2.2 初步观察：CPU 与内存

在问题发生时，首先通过 `top` 和 `htop` 命令观察系统资源的使用情况：

```
top - 14:23:11 up 3 days,  2:15,  1 user,  load average: 7.8, 5.2, 3.1
Tasks:  47 total,   1 running,  46 sleeping,   0 stopped,   0 zombie
%Cpu(s): 45.2 us, 12.8 sy,  0.0 ni, 35.0 id,  0.0 wa,  0.0 hi,  7.0 si,  0.0 st
MiB Mem : 15892.3 total,  2145.7 free,  9873.5 used,  3873.1 buff/cache
```

可见 CPU 的用户态使用率仅为 45%，但系统有 35% 的空闲时间——这暗示 CPU 并没有满载，真正的瓶颈可能在别处。与此同时，内存使用量已接近 10 GB（堆大小为 4 GB），远超正常的 2-3 GB 水平。

进一步通过 `jstat -gcutil <pid> 1000` 观察 GC 状态：

```
 S0     S1     E      O      M     YGC     YGCT   FGC    FGCT   CGC    CGCT   GCT
 0.00  96.32  78.45  89.27  92.11  1247   38.452   12   24.183   89    6.231  68.866
 0.00  96.28  82.13  91.45  92.13  1271   39.015   13   26.471   93    6.542  72.028
 0.00  95.91  85.67  93.18  92.15  1298   39.623   14   28.934   97    6.873  75.430
```

从输出中可以提取几个关键信号：

- **老年代占用率（O）持续上升**：从 89.27% 到 93.18%，说明老年代空间正在快速耗尽。
- **Full GC 次数（FGC）在短时间内从 12 增加到 14**：每分钟超过 1 次 Full GC，这在生产环境中是不可接受的。
- **混合 GC（CGC）次数同步增长**：说明 G1 正在频繁地执行并发标记和混合回收，但效果有限。

这些现象指向了一个核心问题：**垃圾回收器在高并发压力下无法及时回收内存，导致 STW 暂停频繁且持续时间长，进而影响了业务的响应时间。**

## 11.3 工具采集

确定问题存在后，下一步是使用专业的诊断工具采集详细的运行时数据。本节将展示如何利用 JFR、jcmd 和 GC 日志三种工具收集关键信息。

### 11.3.1 JFR 录制

Java Flight Recorder（JFR）是 OpenJDK 内置的低开销事件框架，非常适合在生产环境中持续采集数据。我们通过以下命令启动 JFR 录制：

```bash
jcmd <pid> JFR.start name=order-profile duration=120s filename=order-profile.jfr
```

录制完成后，我们可以使用 `jfr` 命令查看 GC 相关事件的分布：

```bash
jfr print --events GC* order-profile.jfr | head -200
```

输出的关键信息包括 GC 暂停时间的分布：

```
GC Pause (G1 Young)       count=847  avg=18.4ms  max=97.2ms  total=15.6s
GC Pause (G1 Mixed)       count=93   avg=142.7ms max=312.5ms total=13.3s
GC Pause (G1 Full)        count=14   avg=1.89s   max=3.12s   total=26.5s
```

这些数据清晰地揭示了问题所在：

- **Young GC 平均暂停 18.4 ms**，虽然在可接受范围内，但频次很高（847 次）。
- **Mixed GC 平均暂停 142.7 ms**，远超 100 ms 的目标，最大暂停甚至达到 312 ms。
- **Full GC 平均暂停 1.89 秒**，最大达到 3.12 秒，这是导致 P99 延迟飙升的直接原因。

通过 JFR 的 GC 阶段分布，我们还可以看到 G1 在执行并发标记时，标记线程的 CPU 消耗情况以及最终标记（Final Mark）和清理（Cleanup）阶段的 STW 时间。

### 11.3.2 jcmd 查看本地内存

JFR 提供了 GC 事件的概览，但要了解内存分配的细粒度信息，我们需要借助 `jcmd` 的 `VM.native_memory` 功能。使用前需要通过 `-XX:+NativeMemoryTracking=summary` 启动 JVM。

```bash
jcmd <pid> VM.native_memory summary
```

输出示例：

```
Native Memory Tracking:

Total: reserved=9437MB, committed=4872MB
- Java Heap (reserved=4096MB, committed=4096MB)
- Class (reserved=1156MB, committed=128MB)
- Thread (reserved=462MB, committed=462MB)
- Code (reserved=255MB, committed=68MB)
- GC (reserved=347MB, committed=347MB)
- Compiler (reserved=12MB, committed=12MB)
- Internal (reserved=96MB, committed=96MB)
- Other (reserved=3013MB, committed=287MB)
```

此处值得注意的是 **"Other" 类别占用了大量的虚拟内存**。这通常与 Thread Local Allocation Buffers (TLAB) 和直接缓冲区（Direct Buffer）相关，暗示着对象分配极为频繁。

### 11.3.3 GC 日志深度分析

G1 的 GC 日志是诊断问题的宝库。通过 `-Xlog:gc*:file=gc.log:time,uptime,level,tags` 参数生成的日志包含了每个 GC 事件的详细信息。以下是一个典型的 Mixed GC 日志片段：

```
[2025-06-15T14:23:45.123+0800][0.678s][info][gc] GC(23) Pause Mixed (G1 Evacuation Pause) 2048M->1721M(4096M) 112.3ms
[2025-06-15T14:23:45.124+0800][0.679s][info][gc,age] GC(23) Desired survivor size 2097152 bytes, new threshold 1 (max threshold 15)
[2025-06-15T14:23:45.124+0800][0.679s][info][gc,age] GC(23) Age table with threshold 1 (max threshold 15)
[2025-06-15T14:23:45.124+0800][0.679s][info][gc,age]   - age   1:    4194304 bytes,    4194304 total
```

日志中透露了极其重要的信息：

1. `2048M->1721M(4096M)`：堆从 2048MB 下降到 1721MB，仅回收了 327MB，但暂停时间却长达 112.3ms。回收效率不高。
2. `new threshold 1`：GC 年龄阈值被动态调整为 1，意味着对象在一次 Young GC 后如果存活下来，就会直接晋升到老年代。这是 G1 的适应性调整机制在起作用，但也暴露出 Survivor 空间不足的问题。
3. `age 1: 4194304 bytes`：年龄为 1 的对象占据了 4MB 的空间。

更严重的是 Full GC 的日志：

```
[2025-06-15T14:24:01.456+0800][0.834s][info][gc] GC(30) Pause Full (G1 Compaction Pause) 3802M->2103M(4096M) 3120.5ms
[2025-06-15T14:24:01.456+0800][0.834s][info][gc,start] GC(30) Pause Full (G1 Compaction Pause) 3802M->2103M(4096M)
[2025-06-15T14:24:01.456+0800][0.834s][info][gc,phases] GC(30)   Phase 1: Mark live objects      1502.3ms
[2025-06-15T14:24:01.456+0800][0.834s][info][gc,phases] GC(30)   Phase 2: Prepare for compaction  812.1ms
[2025-06-15T14:24:01.456+0800][0.834s][info][gc,phases] GC(30)   Phase 3: Compact heap            806.1ms
```

Full GC 的三个阶段累计耗时超过 3 秒，"Mark live objects" 阶段就占用了 1.5 秒，这是因为老年代中存活对象数量巨大，标记过程需要遍历整个存活集。

## 11.4 数据分析

采集到足够的原始数据后，我们需要对这些信息进行系统的分析。本节将结合 GC 日志分析器（如 GCeasy 或 gceasy.io）和火焰图（Flame Graph），对问题数据进行多角度的解读。

### 11.4.1 GC 日志的关键指标解读

将 GC 日志上传到 GCeasy 等分析工具后，可以得到系统化的指标报告。以下是几个关键指标的分析：

**吞吐量（Throughput）**

分析结果显示，应用的 GC 吞吐量仅为 82.3%，意味着有接近 18% 的 CPU 时间花在了垃圾回收上。对于响应时间敏感的高并发系统来说，这个数字偏高，通常期望值在 95% 以上。

**暂停时间（Pause Time）**

暂停时间的统计显示：
- 平均暂停时间：87.3 ms
- 最大暂停时间：3120.5 ms
- P99 暂停时间：1840.2 ms
- 总暂停时间：68.9 秒（整个压测期间）

暂停时间的分布极不均匀，大部分 GC 暂停都在 100 ms 以内，但少数 Full GC 拖长了整个 P99 指标。

**各代空间使用趋势**

从 GC 日志中提取堆使用趋势数据后，我们可以观察到老年代占用率的变化模式：在压测开始后的前 20 秒，老年代占用率从 30% 缓慢上升到 60%，随后加速攀升，在大约 45 秒时突破 85% 的 IHOP 阈值，触发 Mixed GC。但由于 Mixed GC 的回收速度跟不上对象晋升的速度，老年代占用率持续上升，最终触发 Full GC。

### 11.4.2 火焰图定位热点

为了进一步定位 CPU 和内存分配的热点，我们使用 async-profiler 采集 CPU 和分配（allocation）采样数据：

```bash
# CPU 采样
profiler.sh -d 60 -f cpu-profile.html <pid>

# 内存分配采样
profiler.sh -d 60 -e alloc -f alloc-profile.html <pid>
```

CPU 火焰图的分析结果显示，`OrderProcessor.processOrder()` 方法及其调用的 `simulateCpuWork()` 占据了约 35% 的 CPU 时间。但这属于正常的业务逻辑消耗，并非异常。

更值得关注的是内存分配火焰图。分配采样显示，`Order.create()` 方法及其内部调用的 UUID 生成和 Instant 创建占据了总分配量的约 42%。在 5000 订单/秒的负载下，这意味着每秒创建 5000 个 Order 对象、5000 个 UUID 字符串、5000 个 Instant 和 BigDecimal 对象。这些短生命周期对象的分配速率极高，给 GC 带来了巨大压力。

火焰图中还揭示了一个值得注意的现象：`ConcurrentLinkedDeque.addLast()` 和 `pollFirst()` 的调用路径中涉及大量的节点对象分配。`ConcurrentLinkedDeque` 内部使用链表结构，每次添加元素都会创建一个新的 Node 对象。当队列大小超过 10 万时，频繁的入队和出队操作导致了大量的节点创建和丢弃。

### 11.4.3 Survivor 空间与晋升分析

结合 GC 日志中的年龄表（age table）信息，我们可以分析对象的晋升行为：

```
GC(18) Age table with threshold 2 (max threshold 15)
  - age   1:   12582912 bytes,   12582912 total
  - age   2:    8388608 bytes,   20971520 total

GC(21) Age table with threshold 1 (max threshold 15)
  - age   1:   16777216 bytes,   16777216 total
```

这里的变化非常关键：年龄阈值从 2 降到了 1，意味着年龄为 1 的对象就会直接晋升到老年代。正常情况下，年龄为 1 的对象大小约为 12 MB（GC(18)），但到 GC(21) 时已经增长到 16 MB。

G1 的晋升策略是：当 Survivor 空间不足以容纳存活对象时，会通过 `-XX:SurvivorRatio` 调整或直接提高晋升阈值。但在本案例中，由于对象分配速率过高，Survivor 空间被迅速填满，G1 被迫降低晋升年龄阈值，导致大量应该被回收的短生命周期对象过早地进入了老年代。这正是老年代快速膨胀的根因之一。

## 11.5 根因定位

### 11.5.1 IHOP 阈值过于保守

IHOP（Initiating Heap Occupancy Percent）是 G1 触发并发标记周期的老年代占用率阈值。默认值为 45%，意味着当老年代使用率达到 45% 时，G1 就会启动并发标记。这个默认值在大多数场景下是合理的，但在高并发的闪购场景下却存在问题。

在我们的案例中，老年代从 45% 上升到触发 Full GC 的 95% 只需要大约 20-30 秒。在此期间，G1 虽然启动了并发标记和 Mixed GC，但由于对象的晋升速率远超回收速率，导致标记-回收周期无法跟上。具体来说：

1. **IHOP=45% 过早触发标记**：在老年代还有大量可用空间时就开始并发标记，标记完成后发现可回收的对象比例不高。
2. **Mixed GC 回收效率低**：由于很多活跃对象实际上仍被引用，Mixed GC 只能回收少量的空间。
3. **老年代持续增长**：在此期间大量短生命周期对象通过 TLAB 晋升到老年代，进一步推高占用率。
4. **触发 Full GC**：当老年代占用率达到 G1 的触发 Full GC 阈值（默认 95%）时，Stop-The-World 的 Full GC 被触发。

这里出现的核心问题是：**G1 的适应性调整机制在应对突发流量时过于保守，默认的 IHOP 参数不适用于"短时间内大量对象涌入老年代"的场景。**

### 11.5.2 TLAB 与对象过早晋升

TLAB（Thread Local Allocation Buffer）是 JVM 为每个线程分配的线程本地缓冲区，用于加速对象分配。线程优先在 TLAB 中分配对象，当 TLAB 空间不足时，需要向 Eden 区申请新的 TLAB。

在高并发场景下，TLAB 的分配行为呈现出以下特征：

```
Thread-local allocation buffers:
  Thread "http-nio-8080-exec-1":  TLAB size=2MB, used=128KB, wastes=512KB
  Thread "http-nio-8080-exec-2":  TLAB size=2MB, used=96KB,  wastes=640KB
  Thread "http-nio-8080-exec-3":  TLAB size=2MB, used=192KB, wastes=448KB
  ...
```

每个工作线程的 TLAB 大小为 2 MB，但实际使用量只有 100-200 KB，浪费率高达 25%-30%。这意味着大量 TLAB 空间被浪费，当 Eden 区的空闲区域被零散的 TLAB 残留空间占用时，新的对象分配就需要更大的分配担保，间接导致部分对象直接进入老年代。

通过 `-XX:+PrintTLAB` 或 JFR 的 TLAB 事件可以观察到，当 TLAB 中的浪费空间累积到一定程度后，JVM 会调整 TLAB 的大小或直接在 Eden 区分配对象。在 Eden 区分配的对象如果较大，或者 Eden 区空间紧张，就会直接进入老年代。

结合 GC 日志中的年龄阈值调整，我们可以得出如下结论：**TLAB 浪费导致 Eden 区有效空间减少 → 晋升年龄阈值降低 → 短生命周期对象过早进入老年代 → 老年代快速膨胀 → IHOP 触发 Mixed GC 但回收不及时 → Full GC 爆发。**

### 11.5.3 Mixed GC 的困境

G1 的 Mixed GC 阶段旨在回收老年代中垃圾比例较高的 Region。但实际执行中，Mixed GC 面临着以下困境：

1. **候选 Region 选择困难**：G1 需要根据 Region 的垃圾比例选择回收性价比最高的 Region。但在本案例中，由于大量对象是最近才晋升的，很多 Region 的垃圾比例不高，选择范围受限。
2. **Mixed GC 次数不足**：默认的 `G1MixedGCCountTarget` 为 8，意味着一次并发标记周期后最多执行 8 次 Mixed GC。在对象晋升速率很高的情况下，8 次 Mixed GC 不足以完成所有候选 Region 的回收。
3. **暂停时间目标冲突**：`G1MaxPauseMillis`（默认 200 ms）限制了单次 GC 暂停的时间。G1 为了满足暂停时间目标，会限制每次 Mixed GC 回收的 Region 数量，导致需要更多次 Mixed GC 才能完成回收。

```
Mixed GC 阶段分析（一次并发标记周期后）：
  候选 Region 总数: 342
  每次 Mixed GC 回收 Region: 12-18 个
  预期 Mixed GC 次数: 8
  预期回收 Region: 96-144 个
  未回收 Region: 198-246 个
  未回收比例: 58%-72%
```

从数据可以看出，一次并发标记周期只能完成约 30%-42% 的候选 Region 回收，剩余的大量 Region 需要等到下一次并发标记才能被处理。在此期间，对象继续涌入老年代，加速了老年代的增长。

## 11.6 解决方案

基于根因分析的结果，我们从三个层面制定优化策略：调整 G1 参数、优化对象分配行为、实施对象池复用。下面逐一进行详细说明。

### 11.6.1 G1 参数调优

经过反复的试验和验证，最终确定的 G1 参数组合如下：

```bash
-XX:G1HeapRegionSize=4m \
-XX:InitiatingHeapOccupancyPercent=70 \
-XX:G1MixedGCLiveThresholdPercent=85 \
-XX:G1MixedGCCountTarget=4 \
-XX:G1ReservePercent=15 \
-XX:+UnlockExperimentalVMOptions \
-XX:G1NewSizePercent=10 \
-XX:G1MaxNewSizePercent=30
```

以下对每个参数的选择理由进行详细说明：

**G1HeapRegionSize=4m**

G1 将堆划分为多个大小相同的 Region，Region 的默认值会根据堆大小自动计算。对于 4 GB 的堆，默认 Region 大小约为 2 MB。将 Region 大小调整为 4 MB 有以下几个好处：

- 减少 Region 数量，降低 G1 的 Region 管理开销。
- 更大的 Region 可以容纳更多对象，减少跨 Region 引用。
- 改善 TLAB 分配效率，减少 TLAB 浪费。

**InitiatingHeapOccupancyPercent=70**

将 IHOP 从默认的 45% 提升到 70%，是本案例中最重要的调整。其逻辑是：

- 在闪购场景中，对象大量涌入老年代是不可避免的。
- 过早触发并发标记（45%）会导致标记结果中的垃圾比例偏低，Mixed GC 效率不高。
- 将阈值提升到 70% 后，老年代会在更高的占用率下才开始并发标记，此时更多的 Region 已经积累了足够的垃圾，Mixed GC 的回收效率显著提升。
- 70% 的阈值仍然为并发标记和 Mixed GC 留出了约 30% 的空间（约 1.2 GB）作为缓冲，在标记-回收周期完成之前不会触发 Full GC。

需要注意的是，IHOP 并非越高越好。设置过高（如 85% 以上）可能导致并发标记来不及完成，老年代就已经满了，反而更早触发 Full GC。70% 是在本案例中反复验证后的最佳值。

**G1MixedGCLiveThresholdPercent=85**

该参数控制了 Mixed GC 回收 Region 时，Region 中存活对象占比的上限。默认值为 85%，意味着只有存活对象占比低于 85% 的 Region 才会被纳入回收候选集。

在本案例中，保持 85% 的默认值意味着 G1 只回收垃圾比例超过 15% 的 Region。这个阈值相对保守，但考虑到本案例中老年代的对象大部分是近期晋升的，存活率较高，保持默认值可以避免 G1 浪费时间在回收那些实际上没有多少可回收空间的 Region 上。

**G1MixedGCCountTarget=4**

将 Mixed GC 的次数从默认的 8 次降低到 4 次，是提高回收效率的关键调整。其原理是：

- 减少 Mixed GC 的次数意味着单次 Mixed GC 需要回收更多的 Region。
- 更多的 Region 回收意味着每次 GC 的停顿时间会略长，但可以更快地完成老年代的整理。
- 在闪购场景中，快速完成老年代整理比降低单次暂停时间更重要。

调整后，每次 Mixed GC 回收的 Region 数量从 12-18 个增加到 40-60 个，一个并发标记周期即可完成所有候选 Region 的回收。虽然单次暂停时间从 112 ms 增加到约 180 ms，但总暂停时间从 13.3 秒降低到 4.2 秒。

**G1ReservePercent=15**

默认值为 10%，提升到 15% 意味着预留更多的堆空间用于应对晋升失败（Promotion Failure）的情况。在高并发场景下，晋升失败会导致 Full GC，预留更多的空间可以降低晋升失败的概率。

**G1NewSizePercent=10 和 G1MaxNewSizePercent=30**

这两个参数控制了年轻代的最小和最大大小。默认情况下，G1 会动态调整年轻代的大小，调整范围通常在 5% 到 60% 之间。在本案例中，我们将年轻代的最小值提高到 10%，最大值限制在 30%，避免 G1 过度扩大年轻代而压缩老年代的空间。

### 11.6.2 优化 Young GC 行为

除了直接调整 G1 参数外，还可以通过以下方式优化 Young GC 的行为：

```bash
-XX:MaxTenuringThreshold=5 \
-XX:TargetSurvivorRatio=90 \
-XX:SurvivorRatio=8
```

**MaxTenuringThreshold=5**

将最大晋升年龄从默认的 15 降低到 5。在 G1 的适应性调整中，年龄阈值通常会被动态降低到 1-2。设置一个明确的最大值可以避免在某些情况下阈值被设置得过高，导致 Survivor 空间过载。

**TargetSurvivorRatio=90**

默认值为 50%，表示 Survivor 空间使用率达到 50% 后，G1 会考虑提高晋升阈值。将其提高到 90%，可以让 Survivor 空间容纳更多的存活对象，推迟年龄阈值的降低。

需要注意的是，这些参数对 G1 的影响不如对 Parallel GC 或 CMS 那么直接，因为 G1 有自己的自适应调整机制。但在特定场景下，显式设定这些参数可以为 G1 的调整提供一个良好的初始值。

### 11.6.3 对象池复用

参数调优虽然可以缓解 GC 压力，但最根本的解决思路是**减少对象的创建**。在本案例中，我们可以通过对象池（Object Pool）复用热点的短生命周期对象。

```java
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;

public class OrderPool {
    private static final int POOL_SIZE = 10_000;
    private final Queue<Order> pool = new ConcurrentLinkedQueue<>();

    public Order borrow(long userId, java.math.BigDecimal amount, int itemCount) {
        Order order = pool.poll();
        if (order == null) {
            order = Order.create(userId, amount, itemCount);
        }
        return order;
    }

    public void release(Order order) {
        if (pool.size() < POOL_SIZE) {
            pool.offer(order);
        }
    }
}
```

然而需要特别强调的是，**对象池并非万能的解决方案**，在多数情况下甚至可能带来负面影响：

1. **对象池本身占用内存**：持有大量空闲对象会增加老年代的存活对象数量，反而加重 GC 负担。
2. **对象池的管理开销**：并发环境下的对象池需要使用线程安全的数据结构或锁机制，这些管理逻辑本身也会消耗 CPU 资源。
3. **现代 JVM 的优势**：JVM 的 GC 器（尤其是 G1 和 ZGC）对短生命周期对象的回收效率极高，对象池复用的收益往往被 GC 的优化所抵消。

在本案例中，对象池仅在以下特定场景中应用：频繁创建的 `ConcurrentLinkedDeque.Node` 对象。通过调整队列的实现方式——从 `ConcurrentLinkedDeque` 改为数组实现的环形缓冲区（Ring Buffer）——可以消除 Node 对象的创建。以下是使用 ring buffer 实现的订单缓冲区：

```java
import java.util.concurrent.atomic.AtomicLong;

public class OrderRingBuffer {
    private final Order[] buffer;
    private final int mask;
    private final AtomicLong writeIndex = new AtomicLong();
    private final AtomicLong readIndex = new AtomicLong();

    public OrderRingBuffer(int capacity) {
        int actual = 1;
        while (actual < capacity) {
            actual <<= 1;
        }
        buffer = new Order[actual];
        mask = actual - 1;
    }

    public boolean offer(Order order) {
        long w = writeIndex.get();
        long r = readIndex.get();
        if (w - r >= buffer.length) {
            return false;
        }
        buffer[(int) (w & mask)] = order;
        writeIndex.set(w + 1);
        return true;
    }

    public Order poll() {
        long r = readIndex.get();
        long w = writeIndex.get();
        if (r >= w) {
            return null;
        }
        int index = (int) (r & mask);
        Order order = buffer[index];
        buffer[index] = null;
        readIndex.set(r + 1);
        return order;
    }
}
```

环形缓冲区通过预分配固定大小的数组来消除 Node 对象的创建和销毁。结合 G1 参数调优后，系统的整体 GC 压力显著降低。

### 11.6.4 优化后的 JVM 参数完整配置

综合以上分析，最终使用的完整 JVM 参数如下：

```bash
-Xms4g -Xmx4g \
-XX:+UseG1GC \
-XX:G1HeapRegionSize=4m \
-XX:InitiatingHeapOccupancyPercent=70 \
-XX:G1MixedGCLiveThresholdPercent=85 \
-XX:G1MixedGCCountTarget=4 \
-XX:G1ReservePercent=15 \
-XX:+UnlockExperimentalVMOptions \
-XX:G1NewSizePercent=10 \
-XX:G1MaxNewSizePercent=30 \
-XX:MaxTenuringThreshold=5 \
-XX:TargetSurvivorRatio=90 \
-Xlog:gc*:file=gc-optimized.log:time,uptime,level,tags \
-XX:+PrintTLAB \
-XX:+UnlockDiagnosticVMOptions
```

## 11.7 效果验证

完成上述优化后，我们重新运行压测脚本，对比优化前后的性能指标。

### 11.7.1 GC 指标对比

首先对比 GC 日志的核心指标：

| 指标 | 优化前 | 优化后 | 改善幅度 |
|------|--------|--------|----------|
| Young GC 平均暂停 | 18.4 ms | 12.1 ms | 34% |
| Mixed GC 平均暂停 | 142.7 ms | 178.3 ms | -25%（可接受） |
| Full GC 次数 | 14 | 0 | 100% |
| GC 总暂停时间 | 68.9 s | 4.8 s | 93% |
| GC 吞吐量 | 82.3% | 97.1% | 提升 14.8 个百分点 |

优化后的 GC 数据中最显著的变化是 Full GC 次数降为 0。这意味着系统在整个压测期间没有发生过一次 Stop-The-World 式的 Full GC。虽然 Mixed GC 的平均暂停时间略有增加（从 142.7 ms 到 178.3 ms），但总暂停时间从 68.9 秒骤降至 4.8 秒。

GC 吞吐量从 82.3% 提升到 97.1%，意味着只有不到 3% 的 CPU 时间用于垃圾回收，系统将更多的计算资源投入到业务处理中。

### 11.7.2 业务指标对比

更关键的是业务层面的改善。通过 k6 压测的前后对比：

| 指标 | 优化前 | 优化后 | 改善幅度 |
|------|--------|--------|----------|
| P99 延迟 | 812.3 ms | 45.2 ms | 94.4% |
| P95 延迟 | 634.8 ms | 28.7 ms | 95.5% |
| 平均延迟 | 187.3 ms | 12.4 ms | 93.4% |
| 错误率 | 5.23% | 0.02% | 99.6% |
| 吞吐量 | 254 req/s | 5230 req/s | 20.6 倍 |

优化后的响应时间分布更加集中稳定：

```
http_req_duration......: avg=12.4ms  min=2.1ms  med=7.8ms   max=187.3ms
http_req_duration......: p(90)=19.2ms p(95)=28.7ms p(99)=45.2ms
http_reqs...............: 313800 // 5230.0/s
http_req_failed........: 0.02%  ✓ 62     ✗ 313738
```

P99 延迟从 812 ms 下降到 45 ms，系统完全恢复了正常的服务能力。吞吐量从 254 req/s 提升到 5230 req/s，达到了预期目标。错误率几乎降为零。

### 11.7.3 老年代占用率变化

优化前后的老年代占用率变化曲线也印证了调优的效果。优化前，老年代占用率快速攀升至 95% 以上，触发 Full GC 后虽然有所下降，但很快又再次攀升。优化后，老年代占用率稳定在 60%-75% 之间波动，Mixed GC 能够及时回收老年代空间，形成健康的动态平衡。

```
优化前老年代占用率变化：
时间(s):  0    10   20   30   40   50   60   70   80   90   100  110  120
占用率(%): 30   45   62   78   89   93   95*  78   85   92   95*  81   90
(* 表示 Full GC 触发点)

优化后老年代占用率变化：
时间(s):  0    10   20   30   40   50   60   70   80   90   100  110  120
占用率(%): 30   42   55   63   68   72   70   65   71   74   69   66   72
```

优化后老年代占用率始终在 IHOP 阈值 70% 附近波动，当占用率超过 70% 时触发并发标记，Mixed GC 紧随其后回收垃圾，将占用率拉回 65%-70% 的区间。这种"触发-回收-再触发-再回收"的良性循环正是 G1 GC 设计的理想工作模式。

## 11.8 知识要点总结

### 11.8.1 G1 调优核心参数速查

| 参数 | 默认值 | 本案例调整值 | 作用说明 |
|------|--------|-------------|----------|
| `G1HeapRegionSize` | 自动计算 | 4m | Region 大小，影响 TLAB 和分配效率 |
| `InitiatingHeapOccupancyPercent` | 45 | 70 | 触发并发标记的老年代占用率阈值 |
| `G1MixedGCLiveThresholdPercent` | 85 | 85（未改） | Mixed GC 回收 Region 的存活对象上限 |
| `G1MixedGCCountTarget` | 8 | 4 | 单次标记周期后的 Mixed GC 次数 |
| `G1ReservePercent` | 10 | 15 | 预留堆空间比例 |
| `G1NewSizePercent` | 5 | 10 | 年轻代最小比例 |
| `G1MaxNewSizePercent` | 60 | 30 | 年轻代最大比例 |
| `MaxTenuringThreshold` | 15 | 5 | 最大晋升年龄 |
| `TargetSurvivorRatio` | 50 | 90 | Survivor 空间目标使用率 |

### 11.8.2 IHOP 调优原则

IHOP（Initiating Heap Occupancy Percent）是 G1 GC 调优中最重要的参数之一。以下是 IHOP 调优的核心原则：

1. **过低的问题**：IHOP 设置过低（如 30%-40%）会过早触发并发标记，此时老年代中可回收的垃圾量不足，导致标记效率低下，多余的开销浪费在标记存活对象上。
2. **过高的问题**：IHOP 设置过高（如 85%-90%）虽然可以延迟标记启动，但可能没有给并发标记和 Mixed GC 留出足够的空间缓冲。如果标记期间对象继续快速涌入老年代，可能导致"标记未完，老年代已满"的窘境，触发 Full GC。
3. **最佳范围**：通常建议在 60%-75% 之间调整，具体值取决于应用的分配速率和存活对象比例。可以通过以下公式估算：
   - 标记时间 × 分配速率 = 标记期间老年代增长量
   - 最佳 IHOP = 100% - (标记期间增长量 / 老年代总大小 × 100%) - 安全余量
4. **动态调整**：G1 在 JDK 9 之后引入了自适应 IHOP 调整（`-XX:-G1UseAdaptiveIHOP`），默认开启。但自适应算法的收敛需要时间，在突发流量场景下可能会滞后。显式设置 IHOP 可以让调整立即生效。

### 11.8.3 TLAB 与分配效率

TLAB（Thread Local Allocation Buffer）是 JVM 提升对象分配效率的关键机制。其工作原理如下：

1. 每个 Java 线程在 Eden 区拥有一块私有的 TLAB 空间。
2. 对象分配优先在 TLAB 中进行，无需同步。
3. TLAB 空间不足时，线程向 Eden 区申请新的 TLAB（需要同步）。
4. TLAB 的尾部浪费空间被计入 `tlab_waste`。

高并发场景下 TLAB 的常见问题诊断：

- **TLAB 浪费率过高**：通过 `-XX:+PrintTLAB` 查看。如果浪费率超过 20%，说明 TLAB 大小与线程分配模式的匹配度不高。
- **TLAB 大小调整**：使用 `-XX:TLABSize` 可以手动设置 TLAB 大小，但通常建议让 JVM 自适应调整。
- **直接进入老年代的大对象**：超过 TLAB 大小的对象（或超过 `PretenureSizeThreshold` 的对象）会直接在老年代分配。在 G1 中，超过 Region 一半大小的对象被归类为 Humongous 对象，直接分配在老年代。

### 11.8.4 Mixed GC 工作机制

Mixed GC 是 G1 回收老年代垃圾的主要手段，其执行流程如下：

1. **并发标记（Concurrent Marking）**：GC 线程与应用线程并发执行，标记老年代 Region 中的存活对象。
2. **选择候选 Region**：基于 `G1MixedGCLiveThresholdPercent` 筛选存活比例低于阈值的 Region，并按垃圾比例排序。
3. **分次回收**：在 `G1MixedGCCountTarget` 次数的限制下，每次选择一批垃圾比例最高的 Region 进行回收。
4. **暂停时间约束**：每次 Mixed GC 的暂停时间受 `G1MaxPauseMillis`（默认 200 ms）约束，G1 会在该时间限制内尽量多地回收 Region。

Mixed GC 调优的关键在于平衡以下三个因素：

- **回收速度**：希望每次 Mixed GC 回收更多的 Region，但受限于暂停时间目标。
- **回收频次**：希望 Mixed GC 的次数足够覆盖所有候选 Region，但过于分散会导致回收周期过长。
- **回收质量**：优先回收垃圾比例高的 Region 可以获得更好的回收效果。

### 11.8.5 调优方法论

最后，本章的调优实践可以总结为一套方法论，适用于大多数 GC 问题诊断：

1. **定义基线**：在正常负载下采集性能指标（延迟、吞吐量、GC 暂停时间）作为基线。
2. **复现问题**：通过压测工具复现高负载场景，确保问题可在受控环境中重现。
3. **采集数据**：综合使用 JFR、GC 日志、jcmd、async-profiler 等工具采集多维度的运行时数据。
4. **定位根因**：避免停留在"GC 太慢"的表面认知上，深入分析是 IHOP 问题、晋升问题还是分配速率问题。
5. **制定方案**：从参数调优、代码优化、架构调整三个层面制定解决方案。
6. **小步验证**：每次只调整一个参数，验证效果后再继续。避免"组合拳"式调整导致无法确定每个参数的实际效果。
7. **回归对比**：优化前后的指标对比必须基于相同的压测条件和负载模式。

这套方法论贯穿了本章的整个案例。读者在实际工作中遇到类似问题时，可以按照同样的流程进行诊断和优化。

## 11.9 本章小结

本章通过一个高并发订单系统的 GC 调优案例，完整地展示了从问题发现、工具采集、数据分析、根因定位到解决方案和效果验证的全过程。案例的核心结论如下：

- **G1 的 IHOP 默认参数（45%）在闪购等高并发场景下过于保守**，需要通过 `InitiatingHeapOccupancyPercent` 调整为更高的阈值，以减少不必要的并发标记周期。
- **TLAB 浪费导致短生命周期对象过早晋升到老年代**，是老年代快速膨胀的重要推手。通过调整 G1 参数可以缓解但无法完全消除这一问题。
- **Mixed GC 的回收效率取决于候选 Region 的垃圾比例**。提升 IHOP 后，老年代在更高的占用率下开始标记，此时 Region 中的垃圾积累更多，Mixed GC 的回收效率显著提升。
- **参数调优配合代码优化效果最佳**。在 G1 参数调优的基础上，将链表结构的订单缓冲改为环形缓冲区（Ring Buffer），从根本上减少了 Node 对象的创建。
- **经过调优，P99 延迟从 812 ms 降至 45 ms，吞吐量从 254 req/s 提升至 5230 req/s，Full GC 次数降为零**，系统恢复了正常的服务能力。

GC 调优没有放之四海皆准的银弹。不同应用有不同的对象分配模式、存活对象比例和性能目标，调优的关键在于深入理解 GC 器的工作原理，结合应用的实际负载特征进行针对性调整。本章的案例和方法论可以为读者在面对类似的 GC 性能问题时提供参考和借鉴。
