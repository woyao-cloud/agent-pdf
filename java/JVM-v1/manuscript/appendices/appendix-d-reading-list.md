# 附录D 扩展阅读清单

> 本附录为希望深入理解 JVM 内部原理的读者提供了一份经过筛选的阅读路线图，涵盖 OpenJDK 源码阅读指南、经典论文推荐、权威书籍参考以及持续学习的在线资源。

---

## D.1 OpenJDK 源码导读

阅读 OpenJDK / HotSpot VM 的源码是深入理解 JVM 最直接的方式。以下指南帮助读者快速定位关键模块。

### D.1.1 源码目录结构

OpenJDK 的源码庞大，但核心模块集中在 `src/hotspot` 目录下：

```
src/hotspot/
├── share/
│   ├── gc/                  # 垃圾收集器实现
│   │   ├── g1/              # G1 GC 实现
│   │   ├── z/               # ZGC 实现
│   │   ├── parallel/        # Parallel GC 实现
│   │   ├── serial/          # Serial GC 实现
│   │   ├── shenandoah/      # Shenandoah GC 实现
│   │   └── shared/          # GC 共用基础设施
│   ├── runtime/             # 运行时核心（线程管理、锁、Java 调用等）
│   ├── interpreter/         # 字节码解释器
│   ├── c1/                  # Client 编译器（C1）
│   ├── c2/                  # Server 编译器（C2）
│   ├── classfile/           # 类文件解析和类加载
│   ├── memory/              # 内存管理（堆、元空间等）
│   ├── oops/                # Oop（Ordinary Object Pointer）实现
│   ├── compiler/            # 编译器抽象接口
│   └── services/            # 诊断服务（JFR、NMT 等）
├── cpu/
│   ├── x86/                 # x86 架构相关的代码生成
│   ├── aarch64/             # ARM 64 架构相关的代码生成
│   └── riscv/               # RISC-V 架构支持
└── os/
    ├── linux/               # Linux 平台适配
    ├── windows/             # Windows 平台适配
    └── bsd/                 # BSD/macOS 平台适配
```

### D.1.2 关键源码文件路径

以下列出各核心功能对应的入口文件和关键类：

**GC 相关：**

| 功能 | 文件路径 | 说明 |
|------|---------|------|
| G1 收集器入口 | `src/hotspot/share/gc/g1/g1CollectedHeap.cpp` | G1 主循环和全局管理 |
| G1 并发标记 | `src/hotspot/share/gc/g1/g1ConcurrentMark.cpp` | G1 并发标记阶段实现 |
| ZGC 入口 | `src/hotspot/share/gc/z/zCollectedHeap.cpp` | ZGC 主循环 |
| ZGC 并发阶段 | `src/hotspot/share/gc/z/zDirector.cpp` | ZGC 并发阶段调度 |
| Parallel GC | `src/hotspot/share/gc/parallel/psScavenge.cpp` | Parallel Scavenge 收集器 |
| GC 通用抽象 | `src/hotspot/share/gc/shared/collectedHeap.cpp` | 所有 GC 的基类 |

**类加载相关：**

| 功能 | 文件路径 | 说明 |
|------|---------|------|
| 类加载器 | `src/hotspot/share/classfile/classLoader.cpp` | 类文件加载入口 |
| 类文件解析 | `src/hotspot/share/classfile/classFileParser.cpp` | 字节码解析 |
| 类链接 | `src/hotspot/share/oops/instanceKlass.cpp` | 类链接和初始化 |

**运行时：**

| 功能 | 文件路径 | 说明 |
|------|---------|------|
| 线程管理 | `src/hotspot/share/runtime/thread.cpp` | Java 线程创建和管理 |
| 解释器调度 | `src/hotspot/share/interpreter/bytecodeInterpreter.cpp` | 模板解释器 |
| 锁实现 | `src/hotspot/share/runtime/objectMonitor.cpp` | 对象监视器（synchronized）|
| 栈回溯 | `src/hotspot/share/runtime/frame.cpp` | 栈帧结构 |

**JIT 编译器：**

| 功能 | 文件路径 | 说明 |
|------|---------|------|
| C2 编译入口 | `src/hotspot/share/opto/compile.cpp` | C2 主流程 |
| 内联决策 | `src/hotspot/share/opto/bytecodeInfo.cpp` | 方法内联实现 |
| 逃逸分析 | `src/hotspot/share/opto/escape.cpp` | 逃逸分析实现 |
| C1 编译入口 | `src/hotspot/share/c1/c1_Compilation.cpp` | C1 主流程 |

### D.1.3 如何构建 OpenJDK Debug 版本

构建 Debug 版本的 OpenJDK 可以帮助你深入了解 JVM 运行时行为，并通过断点调试代码。

**前置条件：**

```bash
# Ubuntu / Debian
sudo apt-get install build-essential autoconf make \
  zip libx11-dev libxext-dev libxrender-dev \
  libxtst-dev libxt-dev libcups2-dev libfontconfig1-dev \
  libasound2-dev

# macOS（使用 Homebrew）
brew install autoconf make
```

**下载源码并构建：**

```bash
# 克隆 OpenJDK 源码
git clone https://github.com/openjdk/jdk.git
cd jdk

# 配置构建（Debug 模式）
bash configure --enable-debug --with-conf-name=debug

# 开始构建
make images CONF=debug

# 构建完成后，JDK 位于：
# build/debug/images/jdk/

# 验证
build/debug/images/jdk/bin/java -version
```

**构建选项说明：**

| 配置选项 | 说明 |
|---------|------|
| `--enable-debug` | 启用完整调试信息（ASSERT 启用）|
| `--with-conf-name=debug` | 命名构建配置 |
| `--with-boot-jdk` | 指定引导 JDK 路径 |
| `--with-jvm-variants=server` | 仅构建 Server VM |

> **注意**：首次构建可能需要 30 分钟以上。可以使用 `make JOBS=$(nproc)` 加速。Debug 版本的 JVM 运行速度比 Release 版本慢 10~20 倍，仅用于调试和研究用途，不应用于生产环境。

---

## D.2 论文推荐

以下论文奠定了现代 JVM 和 GC 设计的理论基础。

### D.2.1 《The Garbage Collection Handbook》

**基本信息**：Richard Jones, Antony Hosking, Eliot Moss 著，CRC Press 出版，第二版 2023 年。

**中文介绍**：《垃圾收集手册》是 GC 领域最权威的参考书，全面覆盖了从引用计数、标记-清除到并发收集器的各类算法。第二版新增了 ZGC、Shenandoah 等现代收集器的内容。本书偏重理论，适合需要深入理解 GC 算法原理的读者。如果只读一本 GC 书籍，选这本。

**核心章节**：标记-清除（第 2 章）、分代收集（第 7 章）、并发收集（第 14 章）、现代收集器（第 17 章）。

### D.2.2 《ZGC: An Efficient Concurrent Garbage Collector for Large Heaps》

**基本信息**：2019 年，HotSpot 团队提交至 JVM 社区的论文。

**中文介绍**：ZGC 的设计论文，详细阐述了 ZGC 的核心设计理念：染色指针（Colored Pointers）、读屏障（Load Barrier）、并发重定位（Concurrent Relocation）等关键技术。阅读这篇论文有助于理解 ZGC 如何实现亚毫秒级 STW 停顿。

**关键概念**：染色指针将 GC 状态信息编码在指针的高位比特中，省去了对象头的标记位；读屏障在引用加载时检查并修正指针，确保应用程序始终看到正确的对象引用。

### D.2.3 《Shenandoah: An Ultra-Low Pause Time Garbage Collector for OpenJDK》

**基本信息**：2016 年，Red Hat 团队发表。

**中文介绍**：Shenandoah 的设计论文。与 ZGC 类似，Shenandoah 也以低停顿为目标，但采用了不同的实现路径：使用 Brooks 指针（间接指针）而非染色指针，通过写屏障来处理并发过程中的引用变更。Shenandoah 的优势在于不依赖特定的操作系统特性（如 ZGC 需要内存映射支持），移植性更好。

**关键概念**：Brooks 指针是对象头中的一个额外指针字段，指向对象的"真实"地址。在并发重定位期间，通过修改 Brooks 指针来保证所有线程访问到最新位置。

### D.2.4 《JSR 133: Java Memory Model and Thread Specification》

**基本信息**：2004 年，JCP 制定，由 Jeremy Manson、Bill Pugh、Sarita Adve 等人主导。

**中文介绍**：JSR 133 重新定义了 Java 内存模型（JMM），解决了原模型中 volatile 语义不清晰、final 字段初始化不安全等问题。JMM 是理解 Java 并发的基础，定义了 happen-before 规则、volatile 语义、锁语义等核心概念。虽然 JSR 133 已经是"老"规范，但其定义的内存模型仍然是 Java 并发的基石。

**核心概念**：happen-before 规则是 JMM 的核心，它规定了两个操作之间的内存可见性保证。理解 happen-before 规则是正确编写并发代码的前提。

### D.2.5 《Adaptive Optimization in the Jalapeno JVM》

**基本信息**：1999 年，IBM 研究团队发表。

**中文介绍**：虽然年代较早，但这篇论文首次系统性地提出了自适应优化系统，即"分层编译"的概念。IBM Jalapeno JVM（后更名为 Jikes RVM）中提出的"先快速解释/编译，再选择性深度优化"的思路，直接影响了 HotSpot VM 的分层编译设计。

---

## D.3 书籍推荐

### D.3.1 核心必读

#### 《深入理解Java虚拟机》（第3版）
**作者**：周志明  
**出版社**：机械工业出版社  
**推荐指数**：★★★★★

本书是国内 JVM 领域的经典之作，涵盖类加载机制、内存模型、GC 算法、字节码执行等核心主题。第 3 版新增了对 ZGC、Shenandoah、Graal VM 等新技术的介绍。适合所有 Java 开发者从头到尾阅读。

#### 《Java Performance: The Definitive Guide》
**作者**：Scott Oaks  
**出版社**：O'Reilly Media  
**推荐指数**：★★★★☆

本书是 Oracle 官方的性能调优指南，从 JIT 编译、GC 调优、JFR/JMC 使用到操作系统级优化均有覆盖。内容偏实践，有大量参数配置建议和基准测试示例。适合有 1~3 年经验的 Java 开发者阅读。

### D.3.2 并发编程

#### 《Java Concurrency in Practice》
**作者**：Brian Goetz 等  
**出版社**：Addison-Wesley  
**推荐指数**：★★★★★

Java 并发编程的圣经级著作。本书深入剖析了 JMM、锁机制、并发容器、线程池等内容。虽然出版于 2006 年，但其核心内容仍然适用。对理解 JVM 的线程管理和同步机制非常有帮助。

#### 《The Art of Multiprocessor Programming》（第2版）
**作者**：Maurice Herlihy, Nir Shavit  
**出版社**：Morgan Kaufmann  
**推荐指数**：★★★★☆

从理论角度深入讲解并发数据结构和同步原语。与 JVM 的锁优化、CAS 等机制直接相关。偏学术，需要一定的数学基础。

### D.3.3 性能优化与底层

#### 《Software Optimization for High Performance Computing》
**作者**：Kevin Wadleigh, Isom Crawford  
**出版社**：Prentice Hall  
**推荐指数**：★★★☆☆

从计算机体系结构的角度讲解性能优化，涵盖缓存层级、指令级并行、SIMD 等底层概念。虽然不专门针对 Java，但理解这些概念对于进行 JIT 调优（内联决策、循环优化等）非常有益。

#### 《Computer Architecture: A Quantitative Approach》（第6版）
**作者**：John L. Hennessy, David A. Patterson  
**出版社**：Morgan Kaufmann  
**推荐指数**：★★★★★

计算机体系结构的经典教材。理解 Cache 结构、内存层级、分支预测等硬件特性，是深入理解和调优 JVM 的基础。对于理解 JIT 编译器生成的代码如何在实际硬件上运行非常有帮助。

---

## D.4 在线资源

### D.4.1 邮件列表

| 资源 | 地址 | 说明 |
|------|------|------|
| hotspot-gc-dev | `hotspot-gc-dev@openjdk.org` | GC 实现讨论，了解 GC 开发动态 |
| hotspot-compiler-dev | `hotspot-compiler-dev@openjdk.org` | JIT 编译器讨论 |
| hotspot-runtime-dev | `hotspot-runtime-dev@openjdk.org` | 运行时讨论 |
| jdk-dev | `jdk-dev@openjdk.org` | JDK 整体开发讨论 |

建议订阅 hotspot-gc-dev 和 hotspot-compiler-dev，及时了解 JVM 的最新变化。

### D.4.2 博客与技术专栏

| 资源 | 地址 | 说明 |
|------|------|------|
| Inside Java Blog | `https://inside.java/` | Oracle 官方 JVM 博客，JFR、GC 等最新动态 |
| Foojay.io | `https://foojay.io/` | OpenJDK 社区博客 |
| Alexey Shipilev 博客 | `https://shipilev.net/` | JMM、性能测试专家 |
| Nitsan Wakart 博客 | `https://nitsanw.github.io/` | JFR、性能分析专家 |
| Gunnar Morling 博客 | `https://www.morling.dev/` | JVM 工具、性能调优 |

### D.4.3 在线分析工具

| 工具 | 地址 | 说明 |
|------|------|------|
| GCeasy | `https://gceasy.io/` | GC 日志分析，支持上传 GC 日志文件并生成可视化报告 |
| FastThread | `https://fastthread.io/` | 线程转储分析，自动识别死锁、线程瓶颈 |
| JFR Online | `https://jfronline.com/` | JFR 文件在线分析 |
| Eclipse MAT 官方教程 | `https://eclipse.dev/mat/` | 堆转储分析教程 |

### D.4.4 GitHub 项目

| 项目 | 地址 | 说明 |
|------|------|------|
| async-profiler | `https://github.com/async-profiler/async-profiler` | 低开销的 CPU/内存采样器 |
| JITWatch | `https://github.com/AdoptOpenJDK/jitwatch` | JIT 编译日志可视化分析工具 |
| JMH | `https://github.com/openjdk/jmh` | Java 微基准测试框架 |
| Arthas | `https://github.com/alibaba/arthas` | 阿里巴巴开源的 Java 诊断工具 |
| Jattach | `https://github.com/jattach/jattach` | 轻量级 JVM Attach API |

### D.4.5 视频资源

- **JVM Language Summit**：每年一度的 JVM 语言技术峰会，YouTube 上有完整的会议录像，涵盖了 JVM 的最新技术进展。
- **Devoxx 大会**：每年有多场 JVM 性能调优相关的演讲，建议关注 Oracle 团队的演讲。
- **JFokus**：北欧最大的 Java 技术会议，经常有高质量的 JVM 相关内容。

---

## D.5 学习路线建议

对于不同阶段的读者，建议按以下路线逐步深入：

**入门阶段（0~1 年 Java 经验）：**
1. 阅读本书正文 + 《深入理解Java虚拟机》
2. 学会使用 JFR、async-profiler 等工具
3. 能从 GC 日志中识别常见问题

**进阶阶段（1~3 年）：**
1. 阅读 《Java Performance: The Definitive Guide》
2. 阅读 JSR 133 规范
3. 配置并运行 OpenJDK Debug 版本
4. 订阅 hotspot-gc-dev 邮件列表

**深入阶段（3 年以上）：**
1. 阅读《The Garbage Collection Handbook》
2. 阅读 ZGC 和 Shenandoah 论文
3. 在 OpenJDK Debug 版本上设置断点跟踪 GC 过程
4. 阅读 HotSpot 编译器源码，理解内联和逃逸分析
5. 参与 OpenJDK 社区讨论

---

> **最后一条建议**：纸上得来终觉浅。读完理论后，务必亲自使用工具验证。启动一个应用，用 JFR 采集数据，观察 GC 的每个阶段，用 async-profiler 火焰图分析 CPU 热点。只有将理论与实践中观察到的现象对应起来，才是真正的理解。
