# 第2章 JFR 与 JMC：深入 JVM 的探针

> 如果说 GC 日志是 JVM 的"体温计"，那么 JFR 就是 JVM 的"CT 扫描仪"——它不仅能告诉你"发烧了"，还能精确定位"哪个器官在发炎"。

## 2.1 JFR 概述

### 2.1.1 什么是 JFR

Java Flight Recorder（JFR）是 Oracle JDK 从 7u40（2013 年）开始内置的一套**低开销事件采集框架**。它起源于 Oracle 的商用产品 JRockit Mission Control，在 JDK 11 中正式开源并免费提供给所有用户。

JFR 的核心设计理念是：**在生产环境中以极低的性能开销（通常低于 1%）持续采集 JVM 运行时数据**。这使得它成为线上问题排查和性能分析的理想工具——你不需要"在出问题时重启应用加上诊断参数"，因为 JFR 一直在默默地记录一切。

### 2.1.2 JFR 的技术架构

JFR 的架构可以分为三个层次：

```
  事件生产者             事件消费者
  ┌───────────┐        ┌───────────┐
  │ HotSpot   │        │ JMC (GUI)│
  │ JIT 编译器 │ ──→    │ jfr 工具  │
  │ GC 子系统  │   JFR  │ 自定义分析 │
  │ 线程系统   │  文件   └───────────┘
  │ 用户代码   │
  └───────────┘
         ↓
  ┌───────────────┐
  │ 环形缓冲区     │
  │ (Ring Buffer) │
  └───────────────┘
         ↓
  ┌───────────────┐
  │ 磁盘转储       │
  │ (.jfr 文件)   │
  └───────────────┘
```

**事件生产者**是 JVM 内部的各个子系统——GC、JIT、线程调度、类加载等。每个子系统在关键操作发生时生成事件。

**环形缓冲区**是 JFR 的核心数据结构。事件首先被写入内存中的环形缓冲区，当缓冲区满时，最旧的事件被覆盖。这种设计保证了内存占用是固定的，不会因为事件暴增而导致 OOM。

**磁盘转储**可以将环形缓冲区中的事件持久化到 `.jfr` 文件，供离线分析。

### 2.1.3 三种事件类型

JFR 定义了三种基本事件类型：

**Instant Event（瞬时事件）**：发生在某一时刻的事件，没有持续时间。例如：

- `jdk.ThreadStart`：线程启动
- `jdk.ClassLoad`：类加载
- `jdk.ExceptionStatistics`：异常统计

**Duration Event（持续事件）**：有开始时间和结束时间的事件。这类事件通常是我们分析的重点：

- `jdk.GarbageCollection`：一次 GC 暂停
- `jdk.SafepointBegin`：安全点同步
- `jdk.JavaMonitorEnter`：锁竞争等待

**Sample Event（采样事件）**：按固定间隔采样的事件，不代表全部数据，但通过统计可以反映整体趋势：

- `jdk.ExecutionSample`：线程执行栈采样
- `jdk.AllocationRequiringGC`：GC 触发时的分配采样

### 2.1.4 性能开销

JFR 的设计目标是将性能开销控制在 1% 以内。这一目标通过以下机制实现：

1. **无锁设计**：事件写入使用 CAS 操作而非锁
2. **批量提交**：线程本地缓冲区减少全局同步
3. **采样优于全量**：对于高频事件，使用采样而非记录每一次
4. **可配置的事件阈值**：可以设置持续时间阈值，只有超过阈值的事件才被记录

在默认配置下，JFR 对生产环境的性能影响通常在 **0.1% ~ 0.5%** 之间，完全可以接受。

---

## 2.2 启用 JFR

JFR 可以通过两种方式启用：启动参数和运行时动态命令。

### 2.2.1 启动参数启用

在 JVM 启动时通过 `-XX:StartFlightRecording` 参数开启 JFR：

```bash
java -XX:StartFlightRecording=name=myrecording,\
  duration=60s,\
  filename=/tmp/recording.jfr,\
  settings=profile,\
  delay=10s \
  -jar myapp.jar
```

参数说明：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `name` | 录制名称，用于后续操作 | 自动生成 |
| `duration` | 录制持续时间 | 一直录制 |
| `filename` | 输出文件路径 | 随机生成 |
| `settings` | 事件配置模板：`default` 或 `profile` | `default` |
| `delay` | 启动后延迟开始录制的时间 | 无延迟 |
| `maxage` | 保留事件的最大时间 | 无限制 |
| `maxsize` | 保留事件的最大文件大小 | 无限制 |

`settings` 参数接受两种内置模板：

- **default**：默认配置，开销极低，适用于持续监控
- **profile**：详细配置，包含更多采样事件，适用于性能分析

你也可以指定自定义的 `.jfc` 配置文件路径。

### 2.2.2 运行时动态启用

如果应用已经启动，可以通过 `jcmd` 工具在运行时动态开始和停止录制：

```bash
# 列出所有正在运行的 Java 进程
jcmd -l

# 开始录制（PID 为 12345）
jcmd 12345 JFR.start name=demo settings=profile

# 查看录制状态
jcmd 12345 JFR.check

# 转储录制到文件
jcmd 12345 JFR.dump name=demo filename=/tmp/recording.jfr

# 停止录制
jcmd 12345 JFR.stop name=demo
```

这种方式的优势在于：**你不需要在启动时做任何配置**，当线上出现问题或需要进行性能分析时，随时可以开始录制，分析完成后立即停止，对业务无侵入。

### 2.2.3 Docker 环境配置

在 Docker 容器中，JFR 的使用方式与裸机完全相同。唯一的注意事项是：如果容器资源受限（如 CPU 或内存限制），JFR 的行为可能受到影响。

**Dockerfile 示例：**

```dockerfile
FROM eclipse-temurin:21-jdk
COPY target/app.jar /app.jar
# 启动时开启 JFR
CMD ["java", "-XX:StartFlightRecording=name=startup,filename=/tmp/startup.jfr,settings=profile,duration=120s", "-jar", "/app.jar"]
```

**docker-compose.yml 示例：**

```yaml
version: "3.8"
services:
  app:
    image: myapp:latest
    environment:
      JAVA_OPTS: >-
        -XX:StartFlightRecording=name=prod,settings=profile,
        maxage=1h,maxsize=500M
```

通过 `JAVA_OPTS` 环境变量传递 JFR 参数，是容器化部署中最灵活的方式——你可以在不修改镜像的情况下，随时调整录制策略。

---

## 2.3 JFR 事件详解

### 2.3.1 核心事件分类

JFR 提供了数百种事件类型，涵盖了 JVM 运行的所有方面。以下是核心事件分类：

**GC 事件：**

| 事件名称 | 类型 | 说明 |
|----------|------|------|
| `jdk.GarbageCollection` | Duration | 一次 GC 暂停 |
| `jdk.GCPhasePause` | Duration | GC 暂停的各个阶段 |
| `jdk.AllocationRequiringGC` | Sample | 触发 GC 的大对象分配 |
| `jdk.ObjectCount` | Sample | 各类型对象实例数 |
| `jdk.GCHeapConfiguration` | Instant | JVM 启动时的堆配置 |

**JIT 事件：**

| 事件名称 | 类型 | 说明 |
|----------|------|------|
| `jdk.Compilation` | Duration | 方法编译事件 |
| `jdk.CompilerPhase` | Duration | 编译器的各阶段耗时 |
| `jdk.CodeSweeper` | Duration | 代码缓存清理 |
| `jdk.CodeCacheConfig` | Instant | 代码缓存配置 |

**线程与锁事件：**

| 事件名称 | 类型 | 说明 |
|----------|------|------|
| `jdk.ThreadStart` / `jdk.ThreadEnd` | Instant | 线程生命周期 |
| `jdk.ThreadSleep` | Duration | 线程休眠 |
| `jdk.JavaMonitorEnter` | Duration | 锁等待（重量级锁） |
| `jdk.JavaMonitorBlocked` | Duration | 线程因锁阻塞 |

**类加载事件：**

| 事件名称 | 类型 | 说明 |
|----------|------|------|
| `jdk.ClassLoad` | Instant | 类加载 |
| `jdk.ClassDefine` | Instant | 类定义 |
| `jdk.ClassLoadingStatistics` | Sample | 类加载统计 |

**异常事件：**

| 事件名称 | 类型 | 说明 |
|----------|------|------|
| `jdk.ExceptionStatistics` | Sample | 异常抛出统计 |
| `jdk.JavaExceptionThrow` | Duration | 异常抛出详情 |

### 2.3.2 JDK 21 新增事件

JDK 21 作为 LTS 版本，在 JFR 事件体系上做了重要增强，特别是针对虚拟线程（Virtual Thread，即协程）和 GC 调度的细化。

**虚拟线程相关事件：**

| 事件名称 | 说明 |
|----------|------|
| `jdk.VirtualThreadStart` | 虚拟线程开始执行 |
| `jdk.VirtualThreadEnd` | 虚拟线程结束 |
| `jdk.VirtualThreadPinned` | 虚拟线程被固定到载体线程（阻止并行的关键指标） |
| `jdk.VirtualThreadSubmitFailed` | 虚拟线程提交失败 |

其中，`jdk.VirtualThreadPinned` 事件对于诊断虚拟线程性能问题至关重要。当虚拟线程执行以下操作时会被"固定"：

1. 进入 `synchronized` 块或方法
2. 执行 `native` 方法或 JNI 调用

被固定意味着虚拟线程无法从载体线程上"卸载"，会阻塞载体线程，从而影响整体吞吐量。

**GC Phase 细化：**

JDK 21 进一步细化了 GC 暂停阶段的 JFR 事件，新增了以下事件：

- `jdk.GCPhasePauseLevel1` 到 `jdk.GCPhasePauseLevel4`：多级暂停阶段细节
- `jdk.GCReferenceProcessing`：引用处理阶段细分（SoftReference、WeakReference、FinalReference、PhantomReference）

**JIT 编译增强：**

- `jdk.CompilationFailure`：编译失败事件（之前仅在内核日志中可见）
- `jdk.C1CompilerThreshold`：C1 编译触发阈值

---

## 2.4 JMC：飞行记录器的驾驶舱

### 2.4.1 JMC 简介

Java Mission Control（JMC）是 JFR 的最佳搭档——它是一个图形化的性能分析工具，可以打开 JFR 录制文件（`.jfr`）并以可视化的方式展示数据。

JMC 起源于 JRockit Mission Control，随 Oracle JDK 一起发布。从 JDK 14 开始，JMC 与 JDK 分离，作为独立项目在 GitHub 上维护（[github.com/openjdk/jmc](https://github.com/openjdk/jmc)）。

**下载 JMC：**

- **JDK 11 ~ 13**：JMC 随 JDK 一起提供，位于 `$JAVA_HOME/bin/jmc`
- **JDK 14+**：需要单独下载，地址为 [https://jdk.java.net/jmc/](https://jdk.java.net/jmc/)
- **IDEA 插件**：IntelliJ IDEA 用户可以直接使用 JMC 插件（File > Settings > Plugins > 搜索 "Java Mission Control"）

### 2.4.2 核心视图解读

打开一个 `.jfr` 录制文件后，JMC 会呈现一个仪表盘视图。以下是核心视图及分析方法。

**1. 概述视图（Overview）**

这是打开录制文件后首先看到的页面。它展示了：

- **CPU 使用率**：总 CPU 和 JVM CPU 的时间线
- **堆内存使用**：已用堆和最大堆的折线图
- **GC 暂停**：每次 GC 暂停的标记和时间
- **类加载**：已加载类的数量
- **线程数**：活跃线程数和守护线程数

> **分析方法**：首先看 GC 暂停时间线——如果暂停频率高且时间长，说明 GC 是性能瓶颈；再对比 CPU 使用率和堆内存趋势，判断是否存在内存泄漏。

**2. 内存视图（Memory）**

内存视图是 GC 分析的核心页面。它包含：

- **堆总览**：各代（Young、Old、Metaspace）的内存使用时间线
- **GC 时间**：每次 GC 的持续时间，按 GC 类型分组（Young GC、Full GC、Mixed GC）
- **GC 原因**：触发 GC 的原因（Allocation Failure、System.gc()、Metadata GC Threshold 等）
- **对象统计**：堆中各类型对象的数量和占用空间

> **分析方法**：
> - 如果 Full GC 频繁且持续时间长，检查堆大小配置是否合理
> - 如果 Young GC 时间异常长，检查 Survivor 区大小
> - 如果某种对象类型占用了异常大的空间，定位到具体代码

**3. 方法分析视图（Method Profiling）**

方法分析视图展示 JVM 中最耗时的热点方法，基于采样事件生成。包含：

- **CPU 采样**：哪些方法占用了最多的 CPU 时间
- **分配采样**：哪些方法分配了最多的对象
- **阻塞采样**：哪些方法导致了线程阻塞

> **分析方法**：
> - 按 CPU 时间降序排列，聚焦 Top 10 的热点方法
> - 检查是否有意料之外的高耗时方法（如正则匹配、序列化）
> - 分配采样可以快速定位"谁在疯狂 new 对象"——通常是 GC 压力的源头

**4. GC 视图（Garbage Collections）**

GC 视图提供了 GC 事件的详细表格，每一行是一次 GC 事件：

- **持续时间**：GC 暂停的持续时间
- **暂停原因**：触发 GC 的原因
- **各阶段耗时**：GC 内部各阶段（标记、清理、复制等）的耗时

> **分析方法**：
> - 选择一次较长的 GC 暂停，展开查看各阶段耗时
> - 如果"标记阶段"耗时异常，说明存活对象数量很大
> - 如果"清理阶段"耗时异常，说明对象引用关系复杂

**5. 线程视图（Threads）**

线程视图展示线程的生命周期和状态：

- **线程时间线**：每条线程的生命线，颜色表示线程状态（运行中、休眠、阻塞、等待）
- **锁竞争**：线程因锁阻塞的位置
- **线程转储**：在时间线上特定点的线程栈

> **分析方法**：
> - 查找长时间处于"阻塞"状态的线程
> - 查看阻塞时的堆栈，定位锁竞争的代码
> - 如果大量虚拟线程被固定（Pinned），检查 `synchronized` 使用

**6. 异常视图（Exceptions）**

异常视图统计录制期间抛出的异常：

- **异常类型**：每种异常类型的计数
- **异常栈**：异常发生的位置
- **异常趋势**：异常数量随时间的变化

> **分析方法**：
> - 如果异常数量异常高（如每秒数百次），说明存在异常驱动的控制流
> - 异常构造的开销很大（需要填充栈轨迹），应避免用异常控制业务逻辑

**7. VM 操作视图（VM Operations）**

VM 操作视图展示 JVM 内部操作（安全点、GC 操作等）：

- **安全点（Safepoint）**：所有线程到达安全点的时间
- **VM Operation**：在安全点执行的操作（如 GC 触发、线程转储、类重定义）

> **分析方法**：
> - 安全点频率过高会导致"安全点抖动"（Safepoint Spinning）
> - 常见原因包括：`System.gc()`、`jstack`、`jmap` 等诊断命令
> - 如果安全点时间占用总运行时间的 5% 以上，需要关注

---

## 2.5 连续录制策略

JFR 最有价值的应用场景是**连续录制**——让 JFR 始终处于录制状态，当问题发生时，你有足够的历史数据来追溯根源。

### 2.5.1 配置方式

通过 `-XX:FlightRecorderOptions` 启用默认录制：

```bash
java -XX:+FlightRecorder \
     -XX:FlightRecorderOptions=defaultrecording=true,\
       disk=true,\
       maxage=1h,\
       maxsize=500M,\
       settings=default \
     -jar myapp.jar
```

参数说明：

- `defaultrecording=true`：启动后自动开始录制
- `disk=true`：将录制数据写入磁盘（设为 `false` 则仅保留在内存环形缓冲区中）
- `maxage=1h`：磁盘上的录制文件最多保留 1 小时的数据
- `maxsize=500M`：磁盘上的录制文件最大 500 MB
- `settings=default`：使用 `default` 模板（开销更低的模板适合持续运行）

### 2.5.2 滚动录制原理

连续录制实际上是一个**滚动缓冲区**。当满足 `maxage` 或 `maxsize` 条件时，最旧的数据被自动丢弃，新的数据持续写入。

```
时间线 ──────────────────────────────→
       ┌────┬────┬────┬────┬────┬────┐
       │ C1 │ C2 │ C3 │ C4 │ C5 │ C6 │  ← JFR 数据块
       └────┴────┴────┴────┴────┴────┘
         ↑                        ↑
      oldest                    newest
       ──→ 当达到 maxsize 时，最旧的数据块被覆盖

突发问题！→ 立即执行 jcmd PID JFR.dump
             ┌────┬────┬────┬────┬────┬────┐
             │ C1 │ C2 │ C3 │ C4 │ C5 │ C6 │  ← 完整转储
             └────┴────┴────┴────┴────┴────┘
```

当线上出现突发问题时，执行 `jcmd <PID> JFR.dump filename=problem.jfr`，即可将最近 1 小时（取决于 `maxage`）的 JVM 运行数据全部转储到文件中，然后使用 JMC 详细分析。

### 2.5.3 生产环境最佳实践

以下是生产环境中的 JFR 配置推荐：

**低开销持续监控方案：**

```bash
-XX:+FlightRecorder \
-XX:FlightRecorderOptions=defaultrecording=true,\
  disk=true,\
  maxage=24h,\
  maxsize=2G,\
  settings=default
```

- 使用 `default` 模板，开销约 0.1%
- 保留 24 小时的数据，覆盖一天的业务周期
- 磁盘空间最多 2 GB

**问题排查时临时切换为 profile：**

当需要详细分析时，不必重启应用：

```bash
# 开启新的详细录制
jcmd <PID> JFR.start name=diagnose settings=profile maxage=5m

# 等待问题复现...

# 完成后转储
jcmd <PID> JFR.dump name=diagnose filename=diagnose.jfr

# 可以同时保持默认录制继续运行
jcmd <PID> JFR.check

# 停止详细录制
jcmd <PID> JFR.stop name=diagnose

# 恢复默认录制（如果之前被暂停）
```

---

## 2.6 专项案例：GC 暂停分析

本节通过一个实际的 GC 模拟程序，演示完整的 JFR + JMC 分析流程。

### 2.6.1 案例程序：GcSimulator

以下是本书配套的 GC 模拟程序 `GcSimulator`。它模拟了一个典型的"分配 → 缓存 → 触发 GC"的内存工作负载：

```java
package com.jvmbook.ch02;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class GcSimulator {
    private static final List<byte[]> CACHE = new ArrayList<>();
    private static final Random RANDOM = new Random();

    public static void main(String[] args) throws Exception {
        System.out.println("GC Simulator started. PID: "
            + ProcessHandle.current().pid());
        int cycle = 0;
        while (true) {
            // 每个周期分配 10 MB 对象
            for (int i = 0; i < 10; i++) {
                byte[] chunk = new byte[1024 * 1024];
                RANDOM.nextBytes(chunk);
                // 每 3 个对象中有 1 个保留在缓存中
                if (i % 3 == 0) {
                    CACHE.add(chunk);
                }
            }
            // 每 5 个周期清理一半缓存
            if (++cycle % 5 == 0) {
                int retain = CACHE.size() / 2;
                CACHE.subList(0, retain).clear();
            }
            // 每 10 个周期显式触发 GC
            if (cycle % 10 == 0) {
                System.gc();
            }
            Thread.sleep(500);
        }
    }
}
```

**程序行为分析：**

- 每个周期（500 ms）分配 10 个 1 MB 的数组，共 10 MB
- 其中约 3 ~ 4 个数组被保留在 `CACHE` 中（约 3 ~ 4 MB/周期）
- 每 5 个周期（2.5 秒）清理一半缓存
- 每 10 个周期（5 秒）显式调用 `System.gc()` 触发 Full GC

这个模式模拟了真实应用中常见的"批量处理 + 缓存保留 + 定期清理"的内存使用模式。

### 2.6.2 操作流程

按照以下步骤完成完整的 JFR 录制与分析流程：

**第一步：编译并启动程序**

```bash
# 编译
cd /workspace/cases/ch02-jfr
mvn clean compile

# 运行（建议使用 docker 环境）
java -cp target/classes com.jvmbook.ch02.GcSimulator
```

记录输出的 PID，例如 `GC Simulator started. PID: 123`

**第二步：启动 JFR 录制**

```bash
# 使用 jcmd 动态开启录制
jcmd 123 JFR.start name=gcdemo settings=profile

# 确认录制已开始
jcmd 123 JFR.check
```

输出示例：
```
Recording: name=gcdemo, duration=0s (running)
  Settings: /usr/lib/jvm/java-21-openjdk/lib/jfr/profile.jfc
  Data: 2.3 MB written to /tmp/jfr_123.jfr (temporary)
```

**第三步：等待 GC 事件产生**

让程序运行 30 ~ 60 秒。在此期间，程序会不断分配对象并触发 GC。每 5 秒会触发一次 `System.gc()`。

**第四步：转储录制文件**

```bash
# 创建输出目录
mkdir -p /workspace/cases/ch02-jfr

# 转储录制到可访问的位置
jcmd 123 JFR.dump name=gcdemo filename=/workspace/cases/ch02-jfr/recording.jfr

# 停止录制（可选）
jcmd 123 JFR.stop name=gcdemo
```

**第五步：用 JMC 分析录制文件**

将 `recording.jfr` 文件拷贝到安装了 JMC 的机器上，用 JMC 打开进行分析。

### 2.6.3 数据分析要点

打开录制文件后，在 JMC 中重点关注以下指标：

**1. GC 暂停时间**

在 **Memory > Garbage Collections** 视图中：

- 查看每次 GC 的持续时间
- 预期：Young GC 应在 10 ms 以下，Full GC 应在 50 ms 以下
- 如果 Full GC 持续时间超过 100 ms，说明堆配置或对象生命周期需要优化

**2. 分配压力（Allocation Pressure）**

在 **Memory > Allocation** 视图中：

- 查看每秒分配速率（MB/s）
- 本例中，程序每秒分配约 20 MB（每 500ms 分配 10 MB）
- 如果分配速率远高于实际需求，说明存在不必要的对象创建

**3. 对象类型分布**

在 **Memory > Object Statistics** 视图中：

- 查看占用堆空间最多的对象类型
- 本例中，`byte[]` 应占据绝大部分空间
- 如果某种非预期的类型占据大量空间，说明存在内存泄漏隐患

**4. GC 触发原因**

在 GC 事件的详情面板中：

- 查看 `Cause` 字段
- 预期同时存在 `Allocation Failure`（分配失败触发的 Minor GC）和 `System.gc()`（显式触发的 Full GC）
- 如果 `Allocation Failure` 触发的 GC 过于频繁（每秒数次），说明 Eden 区过小或分配速率过高

**5. 线程活动**

在 **Threads** 视图中：

- 查看程序启动的 GC 线程（如 `GC Thread#0`）
- 验证 JFR 本身的守护线程

### 2.6.4 使用辅助脚本

本书提供了便捷脚本 `jfr-demo.sh`，可以一站式完成录制操作：

```bash
# 语法：jfr-demo.sh <PID> [duration_in_seconds]
# 示例：录制 30 秒
./jfr-demo.sh 123 30
```

脚本内容：

```bash
#!/bin/bash
PID=$1
DURATION=${2:-60}
OUTPUT="/workspace/cases/ch02-jfr/recording.jfr"

echo "Starting JFR recording for PID=$PID, duration=${DURATION}s"
jcmd "$PID" JFR.start name=demo duration="${DURATION}s" filename="$OUTPUT" settings=profile
echo "Recording saved to $OUTPUT"

echo ""
echo "Manual control alternative:"
echo "  jcmd $PID JFR.start name=demo settings=profile"
echo "  sleep $DURATION"
echo "  jcmd $PID JFR.dump name=demo filename=$OUTPUT"
echo "  jcmd $PID JFR.stop name=demo"
```

---

## 2.7 高阶技巧

### 2.7.1 自定义事件

在 JDK 9+ 中，用户代码也可以向 JFR 提交自定义事件。这对于分析特定业务逻辑的性能非常有用：

```java
import jdk.jfr.*;

@Label("Order Processing")
@Description("Time taken to process an order")
@Category({"Business", "Orders"})
public class OrderProcessingEvent extends Event {
    @Label("Order ID")
    private String orderId;

    @Label("Item Count")
    private int itemCount;

    // getters and setters...
}

// 使用方式
OrderProcessingEvent event = new OrderProcessingEvent();
event.orderId = order.getId();
event.itemCount = order.getItems().size();
event.begin();
try {
    processOrder(order);
} finally {
    event.end();
    event.commit(); // 提交事件到 JFR
}
```

自定义事件会被自动采集到 JFR 录制中，在 JMC 的 **Event Browser** 视图中可见。这为业务层面的性能分析提供了精确的数据。

### 2.7.2 JFR 事件流（JDK 14+）

JDK 14 引入了 `jdk.jfr.consumer.RecordingStream` API，允许以流式方式实时消费 JFR 事件，而不需要先录制到文件：

```java
import jdk.jfr.consumer.*;

try (var rs = new RecordingStream()) {
    rs.enable("jdk.GarbageCollection")
      .withThreshold(Duration.ofMillis(10));
    rs.onEvent("jdk.GarbageCollection", event -> {
        System.out.printf("GC pause: %.2f ms%n",
            event.getDuration().toMillis() / 1000.0);
    });
    rs.start(); // 阻塞，持续处理事件
}
```

这对于构建实时监控系统非常有用——你可以在自己的监控平台上直接接收 JFR 事件流，而不需要额外安装 JMC。

### 2.7.3 JFR 与 APM 集成

JFR 的事件数据可以通过 JMX 暴露，与 Prometheus 等监控系统集成：

```bash
# 通过 JMX 暴露 JFR 数据
java -Dcom.sun.management.jmxremote.port=9010 \
     -Dcom.sun.management.jmxremote.authenticate=false \
     -Dcom.sun.management.jmxremote.ssl=false \
     -jar myapp.jar
```

第三方工具如 Grafana 可以通过 JMX Exporter 采集 JFR 指标，构建实时仪表盘。

---

## 2.8 小结

本章深入介绍了 Java Flight Recorder 和 Java Mission Control 这对黄金搭档。

**核心要点：**

1. **JFR 是低开销的生产级事件采集框架**，开销通常低于 1%，可以直接运行在生产环境中
2. **三种事件类型**（Instant、Duration、Sample）覆盖了 JVM 运行的所有关键指标
3. **两种启用方式**：启动参数（`-XX:StartFlightRecording`）适合已知的需求；运行时动态 `jcmd` 命令适合应急排查
4. **JDK 21 新增了虚拟线程事件和 GC 阶段细化事件**，对现代 Java 应用的诊断能力更强
5. **JMC 是图形化的分析驾驶舱**，通过 Memory、Method Profiling、GC、Threads 等视图可以快速定位性能瓶颈
6. **连续录制策略**使 JFR 成为"行车记录仪"，问题发生时可以追溯历史数据
7. **专项案例演示了从录制到分析的全流程**——通过 GcSimulator 程序模拟 GC 压力，使用 JFR 录制并导入 JMC 分析 GC 暂停、分配压力和对象分布

在下一章中，我们将介绍 async-profiler——一个基于 perf_events 的低开销采样分析器，它可以与 JFR 互补，提供更细粒度的 CPU 和内存分析能力。
