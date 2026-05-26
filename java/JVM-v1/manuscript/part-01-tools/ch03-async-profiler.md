# 第3章 async-profiler：火焰图与性能采样

> 如果说 JFR 是 JVM 的"CT 扫描仪"，那么 async-profiler 就是 JVM 的"心电图"——它以微秒级的精度捕捉每个线程的"心跳"，并以火焰图的形式直观呈现 CPU 的燃烧之处。

## 3.1 async-profiler 概述

### 3.1.1 什么是 async-profiler

async-profiler 是由俄罗斯工程师 Andrei Pangin 开发的一款**低开销的 Java 采样分析器**。它结合了 HotSpot JVM 的 `AsyncGetCallTrace` 接口和 Linux `perf_events` 子系统，能够以极低的开销（通常低于 1%）对 Java 应用进行 CPU、内存、锁等维度的采样分析。

与传统的 Java 分析器（如 JProfiler、YourKit）相比，async-profiler 具有以下显著优势：

- **无安全点偏差（Safepoint Bias）**：传统分析器通常在安全点（Safepoint）采样，导致采样数据偏向安全点附近的代码，而非真实热点
- **开销极低**：基于内核的 perf_events 机制，在纯 CPU 模式下仅需约 0.1% ~ 0.5% 的性能开销
- **可生成火焰图**：内置 FlameGraph 支持，一键生成交互式 HTML 火焰图
- **支持多种采样模式**：CPU、Allocation、Wall-Clock、Lock 等
- **无需对应用做任何修改**：不需要添加 JVM 参数（除少数特殊场景），完全无侵入

async-profiler 目前是 Java 性能分析领域的事实标准工具，被 Netflix、阿里巴巴等公司广泛应用于生产环境的性能诊断。

### 3.1.2 与其他工具的对比

| 特性 | async-profiler | JFR | Arthas | JProfiler |
|------|---------------|-----|--------|-----------|
| 采样开销 | <1% | <1% | 中等 | 5-10% |
| 安全点偏差 | 无 | 有 | 有 | 有 |
| CPU 采样 | 是（perf_events） | 是 | 是 | 是 |
| 分配采样 | 是（TLAB 回调） | 是 | 否 | 是 |
| 火焰图 | 原生生成 | 需转换 | 支持 | 不支持 |
| 生产使用 | 适合 | 适合 | 适合 | 不适合 |
| Docker 支持 | 需额外配置 | 原生支持 | 需额外配置 | 不适用 |

---

## 3.2 工作原理

### 3.2.1 核心架构

async-profiler 的工作原理可以拆解为三个核心层次：

```
  ┌─────────────────────────────────────────────┐
  │              用户态 (User Space)              │
  │  ┌─────────────────────────────────────────┐ │
  │  │         AsyncGetCallTrace (AGCT)         │ │
  │  │  ┌──────────┐  ┌──────────┐             │ │
  │  │  │ Java     │  │ JVM      │             │ │
  │  │  │ 方法帧   │  │ 内部帧   │             │ │
  │  │  └──────────┘  └──────────┘             │ │
  │  └─────────────────────────────────────────┘ │
  │                      │                       │
  │  ┌─────────────────────────────────────────┐ │
  │  │         信号处理器 (Signal Handler)       │ │
  │  │  在信号上下文中调用 AGCT 获取调用栈       │ │
  │  └─────────────────────────────────────────┘ │
  └──────────────────┬──────────────────────────┘
                     │
  ┌──────────────────▼──────────────────────────┐
  │              内核态 (Kernel Space)            │
  │  ┌─────────────────────────────────────────┐ │
  │  │         perf_events 子系统               │ │
  │  │  ┌──────────┐                          │ │
  │  │  │ PMC 计数器 │── 硬件性能计数器           │ │
  │  │  │ (周期中断) │  (CPU_CLK_UNHALTED)      │ │
  │  │  └──────────┘                          │ │
  │  │  ┌──────────┐                          │ │
  │  │  │ 环形缓冲区 │── 采样事件队列             │ │
  │  │  └──────────┘                          │ │
  │  └─────────────────────────────────────────┘ │
  └──────────────────────────────────────────────┘
```

**CPU 模式的完整工作流程如下：**

1. **perf_events 初始化**：async-profiler 通过 `perf_event_open` 系统调用，配置 CPU 的性能监控计数器（PMC），设置一个采样周期（如每 100,000 个 CPU 时钟周期采样一次）
2. **周期中断**：当 PMC 计数器溢出时，CPU 触发一个硬件中断
3. **信号传递**：内核将中断转换为 SIGPROF 信号，发送到目标 JVM 进程
4. **信号处理**：JVM 的信号处理器接收到 SIGPROF 后，调用 `AsyncGetCallTrace` 接口
5. **调用栈采集**：`AsyncGetCallTrace` 遍历线程的栈帧，返回当前执行的方法调用链
6. **记录**：async-profiler 将调用栈写入内部缓冲区
7. **聚合**：采样周期结束后，异步方式将缓冲区中的采样数据聚合为火焰图

### 3.2.2 AsyncGetCallTrace 探秘

`AsyncGetCallTrace`（AGCT）是 HotSpot JVM 内部的一个非公开 C 接口（定义在 `vm/runtime/asyncGetCallTrace.hpp`），它的作用非常简单：**在任意时刻，给定一个线程的上下文，返回该线程当前的 Java 调用栈**。

AGCT 的签名如下：

```c
// JVM 内部接口
typedef void (*AsyncGetCallTrace)(JVMPI_CallTrace *trace, jint depth, void *ucontext);
```

**关键特性：**

- **异步安全**：AGCT 被设计为可以在信号处理器的上下文中安全调用，不会触发死锁
- **不保证完整性**：在某些 JVM 状态（如正在执行 GC、编译、类加载）下，AGCT 可能无法获取完整的调用栈
- **最大深度限制**：默认限制栈深度为 512 帧，超过部分被截断

**局限性**：

AGCT 并非万能。在以下情况下，它可能无法获取完整的调用栈：

| 情况 | 描述 | 表现 |
|------|------|------|
| GC 执行中 | GC 线程的栈帧不可用 | 采样点标记为 `GC_active` |
| 代码缓存满 | JIT 编译无法分配新代码 | 采样点标记为 `unknown_Java` |
| 解释器执行 | 解释模式与编译模式栈帧格式不同 | 获取的栈帧可能不完整 |
| 类加载期间 | 类加载器持有锁 | 采样点标记为 `stub` |
| 被阻塞 | 线程处于 `BLOCKED` 或 `WAITING` 状态 | 无 Java 栈帧 |

这些局限性导致了火焰图中的一些"神秘"顶部帧——它们本身不是性能问题，而是 AGCT 的能力边界。

### 3.2.3 perf_events 机制

Linux `perf_events` 是内核提供的一个强大的性能分析子系统。async-profiler 利用它来完成以下工作：

**硬件性能计数器（PMC）**：

现代 CPU 内部有一组硬件寄存器，用于统计各种微架构事件：

- `CPU_CLK_UNHALTED`：CPU 时钟周期（核心计数器，用于 CPU 采样）
- `INSTRUCTION_RETIRED`：已执行的指令数
- `CACHE_MISSES`：缓存未命中次数
- `BRANCH_MISSES`：分支预测失败次数

当 PMC 计数器达到预设的阈值（例如每 100,000 个周期）时，CPU 会触发一个 PMU 中断。perf_events 捕获这个中断，记录当前指令地址和进程信息，并将 SIGPROF 信号发送给目标进程。

**采样频率控制**：

```bash
# 每 100,000 个周期采样一次（默认）
profiler.sh -e cpu -i 100000 -d 30 -f profile.html <PID>

# 每 1,000,000 个周期采样一次（更低开销，更少采样点）
profiler.sh -e cpu -i 1000000 -d 30 -f profile.html <PID>

# 每 10,000 个周期采样一次（更高精度，更高开销）
profiler.sh -e cpu -i 10000 -d 30 -f profile.html <PID>
```

**关于采样间隔的权衡**：间隔越小（如 10,000 周期），采样越密集，火焰图分辨率越高，但开销也越大。间隔越大（如 1,000,000 周期），开销越低，但热点方法的边界可能模糊。生产环境中建议使用默认值 100,000 ~ 500,000。

---

## 3.3 安装与配置

### 3.3.1 下载安装

async-profiler 的官方仓库地址为 `github.com/async-profiler/async-profiler`。它提供了多种安装方式：

```bash
# 方式一：直接下载 Releases 包
wget https://github.com/async-profiler/async-profiler/releases/latest/download/async-profiler-3.0-linux-x64.tar.gz
tar -xzf async-profiler-3.0-linux-x64.tar.gz
cd async-profiler-3.0
# 核心可执行文件是 profiler.sh

# 方式二：使用包管理器（Ubuntu/Debian）
sudo apt install async-profiler
```

安装后，验证可用性：

```bash
# 检查 profiler.sh 是否可用
./profiler.sh --version

# 列出所有支持的采样事件
./profiler.sh list
```

输出示例：
```
Basic events:
  cpu
  alloc
  lock
  wall
  itimer

Java events:
  ...
```

### 3.3.2 Docker 环境配置

在 Docker 容器中使用 async-profiler 需要额外的权限配置。这是因为 perf_events 子系统需要访问内核的 PMU 硬件计数器，而 Docker 默认的 seccomp 安全策略和 Capability 限制阻止了这种访问。

**Docker Compose 配置：**

```yaml
version: "3.8"
services:
  async-profiler-demo:
    build: .
    container_name: async-profiler-demo
    cap_add:
      - SYS_PTRACE          # 允许 ptrace 附加到进程
      - SYS_ADMIN           # 允许 perf_event_open 系统调用
    security_opt:
      - seccomp:unconfined  # 禁用 seccomp 安全策略
    volumes:
      - /proc:/proc:ro      # 挂载 /proc 以访问进程信息
    environment:
      JAVA_OPTS: >
        -XX:+UnlockDiagnosticVMOptions
        -XX:+DebugNonSafepoints
        -XX:+UsePerfData
```

**关键配置说明：**

- **SYS_PTRACE**：允许 profiler.sh 使用 `ptrace` 系统调用附加到 JVM 进程。这是获取调用栈的必要权限
- **SYS_ADMIN**：允许调用 `perf_event_open` 系统调用以配置 PMU 计数器
- **seccomp:unconfined**：禁用 Docker 的 seccomp 安全策略。seccomp 默认会拦截 `perf_event_open` 系统调用
- **-XX:+UsePerfData**：让 JVM 在 `/tmp` 目录下创建 `hsperfdata_<user>` 文件，profiler.sh 通过读取该文件来获取 JVM PID 和参数信息
- **-XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints**：这两个参数配合使用，让 JVM 在非安全点也能为每个方法生成行号映射信息，显著提升火焰图的可读性

如果不想开放过多的权限，也可以使用 `-e itimer` 模式代替默认的 `-e cpu` 模式。itimer 模式不依赖 perf_events，而是基于 setitimer 系统调用（与 `SIGPROF` 信号配合），不需要 SYS_ADMIN 权限：

```bash
# itimer 模式：不需要 SYS_ADMIN，但采样精度较低
profiler.sh -e itimer -d 30 -f profile.html <PID>
```

**使用辅助脚本（本书配套）：**

```bash
# 语法：profiler-demo.sh <PID> [mode] [duration]
# mode: cpu（默认）、alloc、wall、lock
# duration: 采样持续时间（秒），默认 30

# CPU 采样
./profiler-demo.sh 123 cpu 30

# 分配采样
./profiler-demo.sh 123 alloc 30

# Wall-Clock 模式
./profiler-demo.sh 123 wall 60
```

脚本会自动生成火焰图文件，保存在 `/workspace/cases/ch03-async-profiler/` 目录下。

---

## 3.4 CPU 采样模式

### 3.4.1 基本原理

CPU 采样模式是 async-profiler 最核心、最常用的功能。当使用 `-e cpu` 参数时，profiler 利用 Linux 的 `perf_events` 子系统，配置 CPU 的性能计数器（PMC）每经过固定数量的 CPU 时钟周期触发一次采样中断。

**关键区别：CPU 采样只记录线程在"Running"状态时的栈帧**。当线程处于休眠（Sleeping）、阻塞（Blocked）或等待（Waiting）状态时，不消耗 CPU 时间，因此不会被采样到。

这意味着 CPU 采样火焰图**只反映 CPU 密集型的代码路径**，对于 I/O 等待、锁竞争等非 CPU 型瓶颈，需要其他采样模式来分析。

### 3.4.2 使用方法

```bash
# 基本用法
profiler.sh -e cpu -d 30 -f cpu-profile.html <PID>

# 自定义采样间隔
profiler.sh -e cpu -i 500000 -d 60 -f cpu-profile.html <PID>

# 指定采样线程（只采集主线程）
profiler.sh -e cpu -t main -d 30 -f cpu-thread.html <PID>

# 包含 JVM 内部帧（默认不包含）
profiler.sh -e cpu -j -d 30 -f cpu-jvm.html <PID>

# 简单报告模式（文本输出，非火焰图）
profiler.sh -e cpu -d 10 -o simple -f cpu-report.txt <PID>
```

### 3.4.3 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-e <event>` | 采样事件类型 | `cpu` |
| `-d <sec>` | 采样持续时间（秒） | 60 |
| `-f <file>` | 输出文件路径 | 标准输出 |
| `-i <count>` | 采样间隔（CPU 周期数） | 100000 |
| `-t <pattern>` | 只采样名称匹配的线程 | 全部线程 |
| `-j` | 包含 JVM 内部栈帧 | 不包含 |
| `-o <format>` | 输出格式：html、svg、txt、jfr | `html` |
| `--width <px>` | 火焰图宽度 | 1200 |
| `--height <px>` | 火焰图高度 | 自定义 |

---

## 3.5 分配采样模式

### 3.5.1 基本原理

分配采样模式（`-e alloc`）用于定位**哪些代码路径分配了最多的 Java 对象**。它利用 JVM 的 TLAB（Thread-Local Allocation Buffer，线程本地分配缓冲区）机制来实现低开销采样：

```
  无 TLAB 的分配路径（开销高）：

  线程 new 对象 → 需要同步（CAS） → Eden 区分配 → 更新全局指针

  有 TLAB 的分配路径（开销低）：

  线程 → 从 Eden 获取 TLAB（一次同步） → 在 TLAB 内 bump-the-pointer 分配
```

async-profiler 的分配采样工作原理如下：

1. **TLAB 回调注册**：通过 JVMTI（JVM Tool Interface）注册 `VMObjectAlloc` 事件的回调函数
2. **采样策略**：每分配 N 字节（默认约 512 KB）采样一次，而不是记录每次分配
3. **调用栈记录**：在回调中获取当前线程的调用栈，记录分配点

**分配采样的优势：**

- 可以快速定位"谁在疯狂 new 对象"——这通常是 GC 压力的主要来源
- 开销非常低（约 1% ~ 2%），可以在生产环境中使用
- 不依赖 JFR，也不需要开启 `-XX:+UsePerfData`

### 3.5.2 使用方法

```bash
# 基本用法
profiler.sh -e alloc -d 30 -f alloc-profile.html <PID>

# 自定义采样间隔（每 1 MB 分配采样一次）
profiler.sh -e alloc -i 1m -d 30 -f alloc-profile.html <PID>

# 自定义采样间隔（每 100 KB 分配采样一次，更密集）
profiler.sh -e alloc -i 100k -d 30 -f alloc-dense.html <PID>

# 同时采集 CPU 和分配（使用内存火焰图）
profiler.sh -e alloc -d 30 -f alloc-profile.html --alloc <PID>
```

### 3.5.3 火焰图解读

在分配火焰图中：

- **x 轴（宽度）**：代表对象的**分配量**（字节数），而非 CPU 时间
- **y 轴（深度）**：调用栈深度
- **顶部帧**：直接执行 `new` 操作或调用 `malloc` 的方法
- **底部帧**：调用链的入口

**示例解读**：

```
  ┌────────────────────────────────────────┐
  │  HashMap.putVal()  ← 顶部帧：实际分配对象的地方 │
  │  HashMap.put()                          │
  │  MyService.process()                    │
  │  MyController.handleRequest()           │
  └────────────────────────────────────────┘
```

在这个例子中，`HashMap.putVal()` 是实际的分配点，占总分配量的 30%。这说明应用中大量使用 `HashMap`，并且可能频繁插入新键值对。优化方向是：① 预分配容量（`new HashMap<>(expectedSize)`）；② 使用更高效的数据结构；③ 避免在热点路径中创建临时 Map。

---

## 3.6 Wall-Clock 模式

### 3.6.1 基本原理

Wall-Clock 模式（`-e wall`）是解决"什么导致线程停滞"问题的利器。与 CPU 模式不同，wall 模式**不考虑线程状态**——无论线程是 running、sleeping、blocked 还是 waiting，都会被采样。

Wall 模式的实现原理很简单：使用一个定时器线程，以固定间隔（默认 10 ms）遍历所有线程的调用栈。无论线程当前处于什么状态，只要存在 Java 栈帧，就记录下来。

**Wall-Clock 采样的用途：**

- **线程停滞分析**：发现线程在哪些位置长时间阻塞或等待
- **锁竞争诊断**：配合 `-e lock` 模式，定位锁竞争的热点
- **I/O 等待分析**：发现 I/O 密集型的代码路径
- **休眠线程分析**：发现 Thread.sleep() 使用不当导致的问题

### 3.6.2 使用方法

```bash
# 基本用法
profiler.sh -e wall -d 30 -f wall-profile.html <PID>

# 自定义采样间隔（每 5 ms 采样一次，更高精度）
profiler.sh -e wall -i 5ms -d 30 -f wall-dense.html <PID>

# 只采集特定状态的线程（如 BLOCKED）
profiler.sh -e wall --threads --locked 10 -d 30 -f wall-locked.html <PID>
```

### 3.6.3 CPU 模式与 Wall 模式对比

| 特性 | CPU 模式 | Wall 模式 |
|------|---------|----------|
| 采样机制 | perf_events (PMC 中断) | 定时器轮询 |
| 开销 | <0.5% | 约 1-2%（高频时更高） |
| 采样范围 | Running 线程 | 所有线程（任意状态） |
| 适用场景 | CPU 密集型瓶颈 | I/O 等待、锁竞争、线程停-滞 |
| 输出含义 | 宽度 = CPU 消耗 | 宽度 = 墙上时间消耗 |

**选择指南：**

```
CPU 使用率高？ → CPU 采样模式
     ↓否
内存分配量大？ → 分配采样模式
     ↓否
响应时间慢但 CPU 不高？ → Wall 模式
线程频繁阻塞？ → Wall 模式 + Lock 模式
```

---

## 3.7 火焰图解读

### 3.7.1 火焰图基本结构

火焰图（Flame Graph）是 Brendan Gregg 在 2011 年发明的一种性能数据可视化方式。它的设计非常直观：

```
  ┌─────────────────────────────────────────────────────┐
  │ 顶部（Top）：正在执行的方法（采样到的精确位置）             │
  │  ┌────────────────────────────────────────────┐      │
  │  │ MyApp.expensiveMethod                      │      │
  │  ├────────────────────────────────────────────┤      │
  │  │ MyApp.process                              │      │
  │  ├────────────────────────┬───────────────────┤      │
  │  │ MyApp.doWork           │ MyApp.report      │      │
  │  ├──────────────────┬─────┴────────┬──────────┤      │
  │  │ MyApp.main       │  ...         │          │      │
  │  └──────────────────┴──────────────┴──────────┘      │
  │ 底部（Bottom）：入口方法（通常是 main）                   │
  └─────────────────────────────────────────────────────┘
  x 轴：采样次数（比例） → 不等于执行时间，但正相关
```

**核心解读规则：**

- **x 轴** = 采样次数占总采样次数的比例。一个方法的"宽度"越宽，说明它在采样中被命中的次数越多
- **y 轴** = 调用栈深度。顶部是当前正在执行的方法，底部是整个调用链的入口
- **颜色**：通常是无意义的暖色渐变，仅用于视觉区分不同的栈帧。在某些变体（如 JavaScript 火焰图）中，颜色可能代表代码类型（内核 vs 用户态，或不熟悉的代码）
- **鼠标悬停**：在交互式 HTML 火焰图中，悬停在任何一帧上都会显示该方法的完整签名和采样计数

**注意**：火焰图的 x 轴**不表示时间顺序**。帧在 x 轴上的排列是基于字母排序或采样顺序的，目的是最大化视觉紧凑性。宽度仅代表该方法在所有采样中的出现频率。

### 3.7.2 分析方法

**第一步：找最宽的顶部帧**

火焰图的顶部帧（最外层）是实际消耗资源的位置。如果一个顶部帧的宽度超过总宽度的 30%，它可以被视为一个明确的优化目标。

**第二步：追踪调用路径**

从宽的顶部帧沿 y 轴向下看，可以理解"什么样的业务逻辑导致了这个热点"。例如：

```
  top：Math.sin()  ← 热点的直接执行者
        └── heavyTrigOperation()  ← 调用者
              └── expensiveCalculation()  ← 业务逻辑入口
```

这告诉我们需要优化的不是 `Math.sin()`，而是 `heavyTrigOperation()` 中调用三角函数的频率和范围。

**第三步：比较多个火焰图**

最佳实践是采集**优化前**和**优化后**的火焰图并排对比：

- 优化前的火焰图：确定热点（基准线）
- 优化后的火焰图：验证热点是否消失或缩小
- 如果有新的热点出现，说明性能问题可能被转移了

**第四步：关注"平顶"**

如果一个帧的顶部非常平坦（横跨宽 x 范围，且几乎没有调用子方法），说明这个方法本身的执行很耗时（而非它的子方法）。这类方法通常包含大量循环或内联后的密集计算。

### 3.7.3 常见模式

**模式一：单一热点（瓶颈在某一个方法）**

```
  ┌──────────────────────────────────────────────────┐
  │           ████████████████████████████            │
  │           ██  heavyTrigOperation  ██             │
  │           ████████████████████████████            │
  │  ███   ███████████████████████████████████   ███  │
  │  main  expensiveCalculation                  util │
  └──────────────────────────────────────────────────┘
```

**诊断**：CPU 时间集中在 `heavyTrigOperation` 这一个方法上。优化策略：① 减少计算精度（如 float 代替 double）；② 缓存计算结果；③ 并行化计算。

**模式二：宽分布（热点分散）**

```
  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
  │a │b │c │d │e │f │g │h │i │j │k │l │m │n │o │  │
  ├──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┤  │
  │                dispatcher                      │
  └───────────────────────────────────────────────┘
```

**诊断**：没有单一的热点方法，CPU 时间分散在大量小方法中。这通常说明应用本身的 CPU 效率尚可，瓶颈可能在系统层面（如线程切换、I/O 等待）。

**模式三：深栈（调用层次过深）**

```
  ┌──────────────────────────────────────────────┐
  │  doSomething                                 │
  ├──────────────────────────────────────────────┤
  │  doSomethingHelper                           │
  ├──────────────────────────────────────────────┤
  │  compute                                     │
  ├──────────────────────────────────────────────┤
  │  computeInternal                             │
  ├──────────────────────────────────────────────┤
  │  computeWithHelper                           │
  └──────────────────────────────────────────────┘
```

**诊断**：调用链过长可能有"上帝类"或过度抽象问题。深栈通常伴随方法内联（Inlining）失败的风险，因为 JIT 对内联的深度有限制（默认为 9 层）。

---

## 3.8 Docker 环境注意事项

在容器化环境中使用 async-profiler 比裸机复杂得多。容器隔离、安全策略、资源限制等因素都会影响 profiler 的正常工作。

### 3.8.1 权限配置

Docker 容器默认的安全策略限制了一系列系统调用，包括 `perf_event_open`。以下是必需的配置：

```dockerfile
# Dockerfile
FROM eclipse-temurin:21-jdk

# 安装 async-profiler
RUN apt-get update && apt-get install -y wget
RUN wget https://github.com/async-profiler/async-profiler/releases/latest/download/async-profiler-3.0-linux-x64.tar.gz \
    && tar -xzf async-profiler-3.0-linux-x64.tar.gz -C /opt \
    && ln -s /opt/async-profiler-3.0/profiler.sh /usr/local/bin/profiler.sh

COPY target/*.jar /app.jar
CMD ["java", "-XX:+UsePerfData", "-XX:+UnlockDiagnosticVMOptions", "-XX:+DebugNonSafepoints", "-jar", "/app.jar"]
```

```bash
# 运行容器时需要添加的权限
docker run \
  --cap-add SYS_PTRACE \
  --cap-add SYS_ADMIN \
  --security-opt seccomp:unconfined \
  -v /proc:/proc:ro \
  async-profiler-demo
```

### 3.8.2 常见问题排查

**问题 1：Operation not permitted**

```
Error: Could not start profiling, Operation not permitted
```

**原因**：容器缺少 `perf_event_open` 系统调用的权限。
**解决方案**：添加 `--cap-add SYS_ADMIN` 和 `--security-opt seccomp:unconfined`，或使用 `-e itimer` 模式。

**问题 2：No available events**

```
Error: No available events
```

**原因**：perf_events 子系统未正确映射到容器内。
**解决方案**：挂载 `/proc:/proc:ro` 卷。在某些定制内核中，需要启用 `kernel.perf_event_paranoid=1`。

**问题 3：无法附加到进程**

```
Error: Failed to attach to JVM
```

**原因**：JVM 没有创建 `hsperfdata` 文件（通常是因为 `-XX:-UsePerfData`）。
**解决方案**：确保 JVM 启动时添加了 `-XX:+UsePerfData`，或显式指定 PID。

**问题 4：火焰图不包含方法名**

```
火焰图中大量出现 `[unknown]` 帧
```

**原因**：JVM 没有编译足够的调试信息，或者栈帧不在 JIT 编译的代码中。
**解决方案**：添加 `-XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints`。

---

## 3.9 专项案例：CPU 热点分析

### 3.9.1 案例程序：CpuHotspotDemo

以下是本书配套的 CPU 热点演示程序 `CpuHotspotDemo`。它模拟了一个典型的"密集计算 + 内存管理"工作负载：

```java
package com.jvmbook.ch03;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class CpuHotspotDemo {
    private static final Random RANDOM = new Random();
    private static final List<Double> DATA = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        System.out.println("CPU Hotspot Demo started. PID: "
            + ProcessHandle.current().pid());
        while (true) {
            double result = expensiveCalculation();
            DATA.add(result);
            if (DATA.size() > 100_000) {
                DATA.clear();
            }
            Thread.sleep(10);
        }
    }

    private static double expensiveCalculation() {
        double sum = 0;
        for (int i = 0; i < 1000; i++) {
            sum += heavyTrigOperation(i);
            sum += matrixMultiplication(i);
        }
        return sum;
    }

    private static double heavyTrigOperation(int seed) {
        double result = 0;
        for (int i = 0; i < 500; i++) {
            result += Math.sin(seed * i * 0.001)
                    * Math.cos(seed * i * 0.002);
            result += Math.tan(seed * i * 0.003)
                    * Math.sqrt(Math.abs(seed * i * 0.004));
        }
        return result;
    }

    private static double matrixMultiplication(int seed) {
        int size = 50;
        double[][] a = new double[size][size];
        double[][] b = new double[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                a[i][j] = RANDOM.nextDouble();
                b[i][j] = RANDOM.nextDouble();
            }
        }
        double result = 0;
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                for (int k = 0; k < size; k++) {
                    result += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }
}
```

**程序行为分析：**

- 主循环每隔 10 ms 执行一次 `expensiveCalculation()` 方法
- `expensiveCalculation()` 包含两个耗时的计算子方法：
  - `heavyTrigOperation(int seed)`：每调用一次执行 500 次三角函数运算（sin、cos、tan、sqrt），总共循环 1000 次
  - `matrixMultiplication(int seed)`：每次创建一个 50x50 的随机矩阵并执行三重循环的矩阵乘法（125,000 次乘加运算），也循环 1000 次
- 计算结果写入 `DATA` 列表，列表超过 100,000 个元素时清空

**预期热点：**
1. `heavyTrigOperation` 中的 `Math.sin`、`Math.cos`、`Math.tan`、`Math.sqrt`——高密度的数学函数调用
2. `matrixMultiplication` 中的三重 `for` 循环——O(n^3) 的矩阵乘法
3. `matrixMultiplication` 中的 `RANDOM.nextDouble()`——矩阵初始化的随机数生成

### 3.9.2 操作流程

按照以下步骤完成完整的 async-profiler 分析流程。

**第一步：编译并启动程序**

```bash
# 编译
cd /workspace/cases/ch03-async-profiler
mvn clean compile

# 运行
java -cp target/classes com.jvmbook.ch03.CpuHotspotDemo
```

记录输出的 PID，如 `CPU Hotspot Demo started. PID: 12345`。

**第二步：启动 CPU 采样**

```bash
# 使用 profiler.sh 进行 CPU 采样，持续 30 秒
profiler.sh -e cpu -d 30 -f /workspace/cases/ch03-async-profiler/cpu-profile.html 12345
```

**第三步：启动分配采样**

```bash
# 使用 profiler.sh 进行分配采样，持续 30 秒
profiler.sh -e alloc -d 30 -f /workspace/cases/ch03-async-profiler/alloc-profile.html 12345
```

**第四步：启动 Wall-Clock 采样**

```bash
# 使用 profiler.sh 进行 Wall-Clock 采样，持续 30 秒
profiler.sh -e wall -d 30 -f /workspace/cases/ch03-async-profiler/wall-profile.html 12345
```

**第五步：使用辅助脚本（可选）**

```bash
# 一站式完成 CPU 采样
./profiler-demo.sh 12345 cpu 30

# 分配采样
./profiler-demo.sh 12345 alloc 30

# Wall-Clock 采样
./profiler-demo.sh 12345 wall 30
```

### 3.9.3 火焰图分析

打开 `cpu-profile.html` 火焰图后，预期观察到以下特征：

**1. 顶部帧分析 - heavyTrigOperation**

火焰图中最宽的部分应为与三角/数学函数相关的帧。`Math.sin`、`Math.cos` 和 `Math.sqrt` 等函数占据了较大宽度。这是因为 `heavyTrigOperation` 在 1000 次外部循环 x 500 次内部循环 = 500,000 次三角函数调用。

火焰图中会出现类似的结构：

```
  ┌────────────────────────────────────────────┐
  │  StrictMath.sin() / cos() / tan()          │ ← 最宽顶部帧
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.heavyTrigOperation()       │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.expensiveCalculation()     │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.main()                     │
  └────────────────────────────────────────────┘
```

**优化建议**：三角函数是非常昂贵的数学运算。优化方向包括：
- 使用泰勒展开的近似公式代替标准库函数（精度换速度）
- 预计算查找表（Lookup Table），避免重复计算
- 使用 SIMD 指令（通过 Vector API，JDK 16+）
- 降低计算精度（float 代替 double）

**2. 顶部帧分析 - matrixMultiplication**

火焰图中另一个明显的宽帧是矩阵乘法循环内部。三重 for 循环在 JIT 编译后的机器码级别会产生大量的内存访问和乘加指令。

```
  ┌────────────────────────────────────────────┐
  │  CpuHotspotDemo.matrixMultiplication()     │ ← 宽顶部帧
  │  [JIT compiled inner loop]                 │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.expensiveCalculation()     │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.main()                     │
  └────────────────────────────────────────────┘
```

**优化建议**：
- 使用循环展开（Loop Unrolling）——现代 JIT 会自动做一定程度的展开，但手动展开仍可能获益
- 优化内存访问模式：将 `a[i][k] * b[k][j]` 改为按行访问模式，提高缓存命中率
- 使用 `jdk.incubator.vector` Vector API 进行 SIMD 向量化计算
- 在 Java 21+ 中考虑使用 `ParallelMatrixMultiplication` 进行并行计算

**3. 总 CPU 消耗对比**

通过比较两个热点的宽度，可以判断哪个方法消耗的 CPU 更多。预期结果：

- `heavyTrigOperation` 的调用链约占 60% ~ 70% 的采样
- `matrixMultiplication` 的调用链约占 20% ~ 30% 的采样
- `main` 循环、列表管理、随机数生成等约占 5% ~ 10%

**4. 分配火焰图分析**

`alloc-profile.html` 火焰图应该显示大量宽度集中在 `matrixMultiplication` 方法的 `RANDOM.nextDouble()` 调用链上。这是因为每次调用 `matrixMultiplication` 都会创建一个新的 50x50 矩阵并填充随机数（共 2500 个 `double` 值的分配）。

```
  ┌────────────────────────────────────────────┐
  │  Random.nextDouble()                       │ ← 最宽：随机数生成的分配
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.matrixMultiplication()     │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.expensiveCalculation()     │
  ├────────────────────────────────────────────┤
  │  CpuHotspotDemo.main()                     │
  └────────────────────────────────────────────┘
```

**优化建议**：
- 预先创建矩阵对象并复用，避免每次调用都重新分配
- 使用 `ThreadLocalRandom` 代替 `Random`（减少 CAS 竞争）
- 考虑使用对象池或数组池来管理临时矩阵

### 3.9.4 优化前后对比

以下是一个简单的优化思路——通过降低计算精度和复用矩阵：

```java
// 优化版本：复用矩阵 + 降低精度
private static final double[][] A = new double[50][50];
private static final double[][] B = new double[50][50];

private static float matrixMultiplicationOptimized(int seed) {
    // 复用矩阵，仅重新生成随机数
    for (int i = 0; i < 50; i++) {
        for (int j = 0; j < 50; j++) {
            A[i][j] = RANDOM.nextDouble();
            B[i][j] = RANDOM.nextDouble();
        }
    }
    float result = 0;  // float 代替 double
    // ... 三重循环保持不变
    return result;
}
```

建议读者采集优化前后的火焰图，并排对比观察以下变化：
- `matrixMultiplication` 的分配宽度应显著降低（因为不再重新分配矩阵对象）
- CPU 总采样数应有所下降
- 使用 `float` 代替 `double` 后，CPU 采样中浮点运算的宽度应减少

---

## 3.10 实战技巧

### 3.10.1 连续采样

与 JFR 的连续录制类似，async-profiler 也可以实现持续采样，将结果保存到文件轮转中：

```bash
# 循环采样脚本
while true; do
  profiler.sh -e cpu -d 60 -f /tmp/profiles/profile-$(date +%Y%m%d-%H%M).html <PID>
  sleep 30
done
```

### 3.10.2 对比分析

将两个采样周期的火焰图并排对比，可以直观地看到性能变化：

```bash
# 基线采样（优化前）
profiler.sh -e cpu -d 30 -f baseline.html <PID>

# 应用优化...

# 验证采样（优化后）
profiler.sh -e cpu -d 30 -f optimized.html <PID>
```

### 3.10.3 差异火焰图

async-profiler 支持生成差异火焰图，显示两个采样之间的变化：

```bash
# 生成差异火焰图（需要 SVG 格式）
profiler.sh -e cpu -o svg -d 30 -f before.svg <PID>
# ... 改动后再次采样
profiler.sh -e cpu -o svg -d 30 -f after.svg <PID>

# 使用 FlameGraph 的 diff 工具
$FLAMEGRAPH_DIR/difffolded.pl before.collapsed after.collapsed | \
  $FLAMEGRAPH_DIR/flamegraph.pl --countname="samples" > diff.svg
```

差异火焰图中红色表示新增的热点，蓝色表示消失的热点。

### 3.10.4 与其他工具配合

**与 JFR 配合**：

```bash
# 同时使用 JFR 录制和 async-profiler 采样
# 终端 1：async-profiler CPU 采样
profiler.sh -e cpu -d 120 -f cpu.html <PID>

# 终端 2：JFR 录制（同时进行）
jcmd <PID> JFR.start name=diagnose settings=profile
jcmd <PID> JFR.dump name=diagnose filename=/tmp/diagnose.jfr
```

JFR 提供宏观视角（GC、线程、异常、锁），async-profiler 提供微观热点（代码级 CPU 消耗）。两者互补，可以全面诊断应用性能。

**与 Arthas 配合**：

```bash
# 先用 async-profiler 找到热点方法
profiler.sh -e cpu -d 30 -f profile.html <PID>

# 再用 Arthas 深入分析具体方法的参数和返回值
java -jar arthas-boot.jar <PID>
# trace com.jvmbook.ch03.CpuHotspotDemo heavyTrigOperation
```

---

## 3.11 小结

本章深入介绍了 async-profiler——JVM 性能分析领域的标杆工具。

**核心要点：**

1. **async-profiler 结合了 AsyncGetCallTrace 和 perf_events**，实现了无安全点偏差、低开销的采样分析
2. **CPU 采样模式（-e cpu）** 基于硬件性能计数器，精确捕捉 CPU 密集型方法，火焰图中宽度表示 CPU 消耗比例
3. **分配采样模式（-e alloc）** 基于 TLAB 回调，定位"谁分配了最多的对象"，火焰图中宽度表示分配量
4. **Wall-Clock 模式（-e wall）** 定时器轮询所有线程，用于分析 I/O 等待、锁竞争等非 CPU 型瓶颈
5. **火焰图的正确解读方法**：关注最宽的顶部帧（即热点），沿着调用链向下理解业务上下文，x 轴宽度正比于采样频率而非时间
6. **Docker 环境需要额外配置**：SYS_PTRACE、SYS_ADMIN、seccomp:unconfined、`-XX:+UsePerfData`、`-XX:+DebugNonSafepoints` 等权限和 JVM 参数缺一不可
7. **专项案例验证了 heavyTrigOperation 和 matrixMultiplication 的 CPU 热点**，并展示了火焰图分析方法

**进一步学习：**

- 安装 async-profiler 后执行 `profiler.sh --help` 查看完整参数
- 阅读官方 Wiki：[github.com/async-profiler/async-profiler/wiki](https://github.com/async-profiler/async-profiler/wiki)
- Brendan Gregg 的火焰图原始论文：[brendangregg.com/flamegraphs.html](http://www.brendangregg.com/flamegraphs.html)

在下一章中，我们将介绍 Arthas——阿里巴巴开源的 Java 在线诊断工具，它是生产环境问题排查的瑞士军刀。
