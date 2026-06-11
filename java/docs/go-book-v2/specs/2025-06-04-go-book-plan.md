# 精通Go语言 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a 20-chapter Go book at `docs/go-book-v2/` covering Go's advantages, principles, implementation mechanisms, typical scenarios, and developer skills — with 4 complete demo projects.

**Approach:** 6 sequential phases (Part 1→6), each phase writes 2-6 chapter files. Demo code projects are built alongside their chapters. No parallel work between phases — each phase depends on the previous one being committed.

**Tech Stack:** Markdown for chapters, Go 1.21+ for demos, Docker Compose for demo environments, Prometheus+Grafana for ch14.

**Key constraints:**
- Natural language first, code second in every chapter
- Each chapter must include "常见问题与处理" (Common Problems & Solutions) section
- Concurrency section (ch6-ch8) is ~30% of total content
- Demo code must be complete and independently runnable

---

## File Structure

```
docs/go-book-v2/
├── README.md                          # Book index / table of contents
├── PLAN.md                            # Already exists
├── specs/
│   ├── 2025-06-04-go-book-design.md   # Already exists (design doc)
│   └── 2025-06-04-go-book-plan.md     # ← This file (implementation plan)
│
├── chapter-01-overview.md             # Ch1: Go语言概述
├── chapter-02-philosophy.md           # Ch2: Go语言核心设计思想
├── chapter-03-type-system.md          # Ch3: 类型系统与结构体
├── chapter-04-error-handling.md       # Ch4: 错误处理与异常机制
├── chapter-05-memory-management.md    # Ch5: 内存管理机制
├── chapter-06-goroutine.md            # Ch6: Goroutine
├── chapter-07-channel.md              # Ch7: Channel
├── chapter-08-concurrency-sync.md     # Ch8: 并发同步与协调
├── chapter-09-web-development.md      # Ch9: Web应用开发
├── chapter-10-microservice.md         # Ch10: 微服务通信
├── chapter-11-cli-tool.md             # Ch11: 命令行工具开发
├── chapter-12-profiling.md            # Ch12: 性能分析与调优工具
├── chapter-13-performance-opt.md      # Ch13: 全方位性能优化实践
├── chapter-14-high-perf-server.md     # Ch14: 高性能服务器设计
├── chapter-15-testing.md              # Ch15: 测试与质量保证
├── chapter-16-project-management.md   # Ch16: 项目管理与工程化
├── chapter-17-security.md             # Ch17: 安全编程实践
├── chapter-18-compiler-runtime.md     # Ch18: Go编译与运行时探秘
├── chapter-19-roadmap.md              # Ch19: Go开发者的进阶之路
├── chapter-20-interview.md            # Ch20: 常见面试题与解析
│
├── demos/
│   ├── ch09-rest-api/                 # RESTful博客API
│   │   ├── main.go                    # 入口，路由注册
│   │   ├── go.mod                     # module go-book/demo/rest-api
│   │   ├── go.sum
│   │   ├── handler/
│   │   │   ├── post.go                # POST /posts CRUD
│   │   │   └── auth.go                # 认证中间件
│   │   ├── model/
│   │   │   └── post.go                # Post结构体 + DB操作
│   │   ├── middleware/
│   │   │   ├── logging.go             # 日志中间件
│   │   │   └── jwt.go                 # JWT认证中间件
│   │   ├── docker-compose.yml         # Go app + PostgreSQL
│   │   ├── init.sql                   # 初始化表结构
│   │   └── README.md                  # 运行说明
│   │
│   ├── ch10-grpc/                     # gRPC微服务通信
│   │   ├── proto/
│   │   │   └── order.proto            # Protocol Buffers定义
│   │   ├── order-server/
│   │   │   ├── main.go                # 订单服务入口
│   │   │   └── service.go             # 订单业务逻辑
│   │   ├── stock-server/
│   │   │   ├── main.go                # 库存服务入口
│   │   │   └── service.go             # 库存业务逻辑
│   │   ├── client/
│   │   │   └── main.go                # gRPC客户端
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── docker-compose.yml         # 多服务 + etcd
│   │   └── README.md
│   │
│   ├── ch11-cli/                      # 命令行工具
│   │   ├── main.go                    # 入口
│   │   ├── go.mod                     # module go-book/demo/cli
│   │   ├── cmd/
│   │   │   ├── root.go                # 根命令
│   │   │   ├── search.go              # search子命令
│   │   │   └── config.go              # config子命令
│   │   ├── pkg/
│   │   │   ├── searcher/
│   │   │   │   └── search.go          # 搜索逻辑
│   │   │   └── spinner/
│   │   │       └── spinner.go         # 进度显示
│   │   ├── Dockerfile                 # 多阶段构建
│   │   └── README.md
│   │
│   └── ch14-high-perf-server/         # 高性能服务器
│       ├── main.go                    # 入口 + 路由
│       ├── go.mod                     # module go-book/demo/high-perf
│       ├── pkg/
│       │   ├── limiter/
│       │   │   └── token_bucket.go    # 令牌桶限流器
│       │   ├── circuit/
│       │   │   └── breaker.go         # 熔断器
│       │   ├── pool/
│       │   │   └── conn_pool.go       # 连接池
│       │   └── middle/
│       │       ├── logging.go         # 日志
│       │       └── pprof.go           # pprof端点
│       ├── bench/
│       │   ├── bench.sh               # 压测脚本
│       │   └── report.md              # 预期性能报告模板
│       ├── docker-compose.yml         # 服务 + Prometheus + Grafana
│       ├── prometheus.yml             # Prometheus配置
│       └── README.md
```

---

## Phase 1: Part 1 — Foundation (ch1-ch2)
**Estimated effort: 2 chapters × 1-2 days each = 2-4 days**
**Style:** 100% natural language, zero code or minimal code snippets.
**Validation:** Chapters read fluidly without code; a non-Go programmer can understand Go's value.

### Task 1: Create README.md (book index)

**Files:**
- Create: `docs/go-book-v2/README.md`

- [ ] **Step 1: Write book index**

Write `README.md` with the full table of contents (6篇20章), a brief description per chapter, and links to each chapter file. Follow the structure from `PLAN.md`. The index must have:

```markdown
# 精通Go语言（Mastering Go）

> 优势·原理·实战·进阶

## 书籍简介

...

## 目录

### 第1篇：基础篇 — Go语言的优势与核心思想

- [第1章 Go语言概述](chapter-01-overview.md) — ...
- [第2章 Go语言核心设计思想](chapter-02-philosophy.md) — ...

... (all 20 chapters)
```

Each chapter entry gets a one-sentence description. Under each Part heading, add a 2-3 sentence overview of what that part covers.

- [ ] **Step 2: Verify links are correct**

Manually check: every `chapter-XX-xxx.md` link in README.md matches the actual filename in the file structure. Fix any mismatches.

- [ ] **Step 3: Commit**

```bash
git add docs/go-book-v2/README.md
git commit -m "docs(go-book): add book index with full TOC"
```

### Task 2: Write Chapter 1 — Go语言概述

**Files:**
- Create: `docs/go-book-v2/chapter-01-overview.md`

- [ ] **Step 1: Write the opening sections (概述 + 核心概念)**

Write sections:

```markdown
## 第1章 Go语言概述

### 概述

并发编程太难了？编译速度太慢了？部署太复杂了？如果你在2007年的Google工作，这些问题会让你每天都想砸键盘。这就是Go语言诞生的背景。

...

### 核心概念

Go语言有六大核心优势，每一个都直击当时软件开发中的痛点：

**1. 简洁性** ...（自然语言描述，使用类比）

**2. 并发原生** ...（类比：传统线程像开一家新餐馆——成本高启动慢；goroutine像叫一份外卖——轻量快速）

**3. 快速编译** ...（类比：C++编译像砌一堵墙每块砖都要等水泥干；Go编译像用乐高积木——各块独立组装）

**4. 静态类型+动态体验** ...

**5. 内置工具链** ...

**6. 交叉编译** ...

### Go解决了哪些问题

用4个自然段描述：多核并发、编译速度、部署复杂性、云原生需求。
```

Use **zero Go code** in this chapter. If a code example is unavoidable, use pseudo-code or a single line. Write in Chinese, using everyday analogies. Target length: ~2000-3000 words.

- [ ] **Step 2: Write (适用场景与不适用场景) + (生态概览)**

适用场景：用列举方式，每点一小段自然语言。不适用场景：同样方式，但指出"不是Go不能做，而是有更好的选择"。

Go生态概览：用树状图列出标准库主要包和第三方生态主要领域，附一段整体评述。

- [ ] **Step 3: Add (常见问题与处理) + (小结)**

常见问题：
- "Go适合做游戏开发吗？" → 不直接适合，但服务端可以
- "Go和Rust比怎么样？" → 不同定位，Go偏工程效率，Rust偏底层控制
- "Go的生态够成熟吗？" → 云原生和网络服务领域很成熟

小结：3-5个核心要点 + 推荐阅读资源。

- [ ] **Step 4: Final review and commit**

Read the full chapter aloud (mentally), check for:
- Natural language flow (no abrupt code drops)
- Analogies make sense
- "常见问题与处理" section answers real questions
- No markdown formatting issues

```bash
git add docs/go-book-v2/chapter-01-overview.md
git commit -m "docs(go-book): add chapter 1 - Go语言概述"
```

### Task 3: Write Chapter 2 — Go语言核心设计思想

**Files:**
- Create: `docs/go-book-v2/chapter-02-philosophy.md`

- [ ] **Step 1: Write (概述) + (Less is More — 少即是多)**

```markdown
## 第2章 Go语言核心设计思想

### 概述

每门语言背后都有一套设计哲学。Go的设计哲学可以用一句话概括：少即是多（Less is More）。

...

### 2.1 少即是多（Less is More）的设计哲学

（用自然语言解释：Go的设计者刻意去掉了很多"高级"特性——继承、泛型（1.18前）、异常、运算符重载等。不是因为他们做不出来，而是因为他们认为这些特性带来的复杂度超过了其价值。用"瑞士军刀vs菜刀"做类比——工具越简单，适用范围反而越广。）
```

Target: each subsection is 1-2 paragraphs of natural language with real-world analogies.

- [ ] **Step 2: Write (组合优于继承) + (显式优于隐式)**

组合优于继承：用"乐高积木vs雕刻"做类比。嵌入（Embedding）机制的本质是组合而非继承。
显式错误处理：解释"错误是值而不是控制流"的理念，对比try-catch的隐式传递。

- [ ] **Step 3: Write (并发不是并行) + (零值有用性) + (包与可见性)**

并发不是并行：用"一个人交替处理多件事（并发）vs 多个人同时处理多件事（并行）"的类比。解释CSP模型的核心思想。

零值有用性：用"新买的房子不应该有垃圾在里面"解释为什么变量自动初始化为零值是好的设计。

包与可见性：大写=公开，小写=私有，这一规则的简洁之美。

- [ ] **Step 4: Add (常见问题与处理) + (小结)**

常见问题：
- "Go没有继承，那怎么实现代码复用？" → 组合+接口
- "没有异常，错误处理代码太啰嗦了" → 这是故意的设计，好处是...
- "为什么Go 1.18才加泛型？" → 设计者的谨慎

```bash
git add docs/go-book-v2/chapter-02-philosophy.md
git commit -m "docs(go-book): add chapter 2 - Go语言核心设计思想"
```

---

## Phase 2: Part 2 — Syntax & Mechanisms (ch3-ch5)
**Estimated effort: 3 chapters × 2-3 days each = 6-9 days**
**Style:** Natural language first, with targeted code snippets (5-15 lines each) to illustrate concepts. Code snippets use ` ```go ` blocks.
**Validation:** A Go beginner can follow the reasoning without needing to run code.

### Task 4: Write Chapter 3 — 类型系统与结构体

**Files:**
- Create: `docs/go-book-v2/chapter-03-type-system.md`

- [ ] **Step 1: Write (概述) + (类型体系)**

```markdown
## 第3章 类型系统与结构体

### 概述

...

### 3.1 Go的类型体系：值类型与引用类型

（用"复印件vs遥控器"类比。值类型：每个变量持有自己的数据副本。引用类型：多个变量可能指向同一个底层数据。）

展示代码片段：
```go
// 值类型：赋值就是复制
a := 42
b := a
b = 100
// a仍然是42，b是100 — 两者独立

// 引用类型：赋值共享底层数据
s1 := []int{1, 2, 3}
s2 := s1
s2[0] = 999
// s1[0]也变成了999 — 指向同一底层数组
```

每段代码前有2-3句自然语言解释，代码后有1-2句总结。
```

- [ ] **Step 2: Write (结构体设计) + (方法与接收者)**

结构体：对比其他语言的class，说明Go的struct是"更纯粹的数据结构"。
方法接收者：值vs指针的选择标准——"这个方法会修改接收者吗？如果会，用指针。"

代码片段展示两种接收者的区别。

- [ ] **Step 3: Write (接口实现机制) — 重点章节**

3-4段自然语言解释接口的鸭子类型本质。然后展示接口值的内存布局：

```go
// eface（空接口）的内存布局
// type *itab {
//     inter *interfacetype  // 接口类型信息
//     _type *_type           // 具体类型信息
//     hash  uint32           // 类型哈希值，用于快速类型断言
//     fun   [1]uintptr       // 函数指针数组（方法集）
// }
// data unsafe.Pointer       // 指向实际数据的指针
```

类型断言示例代码 + 接口性能开销分析（用benchmark对比直接调用vs接口调用）。

- [ ] **Step 4: Write (类型嵌入) + (泛型) + (常见问题与处理) + (小结)**

类型嵌入：用"继承vs组合"对比解释。代码展示嵌入的两种典型用法。

泛型：Go 1.18引入的类型参数，用场景解释何时需要泛型（容器类型、通用算法）。

常见问题：
- 接口断言失败panic了怎么办 → 使用`ok`模式
- 空接口滥用导致类型不安全 → 优先用具体类型或泛型
- 值接收者无法修改原值 → 理解值语义

```bash
git add docs/go-book-v2/chapter-03-type-system.md
git commit -m "docs(go-book): add chapter 3 - 类型系统与结构体"
```

### Task 5: Write Chapter 4 — 错误处理与异常机制

**Files:**
- Create: `docs/go-book-v2/chapter-04-error-handling.md`

- [ ] **Step 1: Write (概述) + (error接口设计理念)**

概述：用"检查烟雾报警器vs等房子烧了再救火"类比解释Go的错误处理哲学——尽早发现、显式处理。

```markdown
### 4.1 error接口的设计理念

`type error interface { Error() string }` — 这可能是Go标准库中最简单的接口之一，但它的设计带来了深远的影响。

...
```

- [ ] **Step 2: Write (三种错误模式) + (panic/recover)**

- 哨兵错误：`io.EOF`、`sql.ErrNoRows` — 预定义的特定错误值
- 自定义错误类型：实现error接口的结构体，可携带额外上下文
- 不透明错误：只告诉"出错了"，不暴露内部细节（信息隐藏）

每个模式配一个代码片段（5-10行）。

panic/recover：解释panic的触发条件、执行流程（延迟函数执行→崩溃）。recover只能在defer中使用。

- [ ] **Step 3: Write (错误链) + (常见问题与处理)**

Go 1.13 `fmt.Errorf("%w", err)` / `errors.Is()` / `errors.As()` 的使用。

常见问题：
- 错误被吞掉：用`_`忽略错误或在defer中忽略错误
- panic滥用：panic不是替代try-catch的工具
- 错误链断裂：使用`%v`而不是`%w`导致包装断链

```bash
git add docs/go-book-v2/chapter-04-error-handling.md
git commit -m "docs(go-book): add chapter 4 - 错误处理与异常机制"
```

### Task 6: Write Chapter 5 — 内存管理机制（重点）

**Files:**
- Create: `docs/go-book-v2/chapter-05-memory-management.md`

- [ ] **Step 1: Write (概述) + (内存分配器)**

概述：为什么内存管理重要——直接影响程序性能和GC压力。

```markdown
### 5.1 Go的内存分配器

Go的内存分配器基于Google的tcmalloc设计，按分配大小分为三级：
- **tiny** (< 16 bytes)：微小对象，按16字节对齐
- **small** (16 bytes ~ 32 KB)：小对象，按规格分级
- **large** (> 32 KB)：大对象，直接使用mmap分配

（用"快递分拣系统"做类比：tiny是小包裹直接走传送带，small是按规格分到不同货架，large是超大件单独处理。）
```

- [ ] **Step 2: Write (栈与堆) + (逃逸分析)**

栈与堆的对比：栈上分配（快，函数返回自动回收）vs 堆上分配（有GC开销）。

逃逸分析：编译器确定变量分配位置的机制。"变量会逃逸到堆上的常见情况"——返回指针、闭包捕获、大对象、interface赋值。展示如何用 `go build -gcflags="-m"` 查看逃逸分析结果。

- [ ] **Step 3: Write (GC演进史) — 重点**

逐版讲述GC的改进：
- Go 1.3：串行STW（Stop The World）——全暂停，秒级停顿
- Go 1.5：并发标记清扫——STW降到毫秒级
- Go 1.8：混合写屏障——STW降到亚毫秒级（< 100μs）
- Go 1.12+：非分代并发三色标记——持续优化

用三色标记算法示意图（文字描述）解释GC过程：白色（初始）→ 灰色（待扫描）→ 黑色（已扫描）。

- [ ] **Step 4: Write (GC调优) + (内存泄漏排查) + (常见问题与处理)**

GC调优：GOGC环境变量（默认100）、减少堆分配、对象复用、降低指针密度。

内存泄漏常见原因：goroutine泄漏、对超大slice的小截取、time.Ticker未停止、defer中的锁。

常见问题：
- GC频繁导致延迟抖动 → 减少堆分配、调整GOGC
- 内存占用持续上涨 → pprof heap分析
- 逃逸太多 → 检查逃逸分析结果

```bash
git add docs/go-book-v2/chapter-05-memory-management.md
git commit -m "docs(go-book): add chapter 5 - 内存管理机制"
```

---

## Phase 3: Part 3 — Concurrency (ch6-ch8)
**Estimated effort: 3 chapters × 3-5 days each = 9-15 days (~30% of total)**
**Style:** Each concept starts with natural language explanation, then illustrative snippets (10-20 lines). Mini-examples are included inline in the chapter. A comprehensive coordinating example at the end of ch8 ties all patterns together.
**Validation:** A reader can mentally trace goroutine scheduling and channel operations without running code.

### Task 7: Write Chapter 6 — Goroutine（全书最重要章节之一）

**Files:**
- Create: `docs/go-book-v2/chapter-06-goroutine.md`

- [ ] **Step 1: Write (概述) + (什么是Goroutine)**

```markdown
## 第6章 Goroutine — 轻量级线程的秘密

### 概述

想象一下：你的电脑有8个CPU核心，但你要处理10万个并发请求。如果用操作系统线程，每个线程需要1MB的栈空间，10万线程需要约100GB内存——显然不可能。但如果每个"线程"只需要2KB的栈呢？

这就是Goroutine的核心秘密。

### 6.1 什么是Goroutine

Goroutine是Go语言实现的用户态线程（也称为协程）。与操作系统线程相比，它有三大关键区别：
- **创建成本极低**：初始栈仅2KB（对比OS线程的1MB）
- **调度由Go运行时管理**：不在内核态进行上下文切换
- **栈可动态增长**：初始小，需要时自动扩容（对比OS线程固定栈大小）

（用"自助餐厅"做类比：OS线程是每个客人有固定的大餐桌（1MB），Goroutine是每个客人先拿一个小托盘（2KB），吃不够再去加菜。）
```

- [ ] **Step 2: Write G-M-P调度模型（全书最重要知识点）**

用4-5段自然语言解释：

```
G = Goroutine：一个轻量级执行体，包含栈、指令指针、状态（_Grunning/_Grunnable/_Gwaiting等）
M = Machine：操作系统线程，由内核调度，负责真正执行Go代码
P = Processor：逻辑处理器，数量由GOMAXPROCS决定（通常等于CPU核心数）

三者关系：G需要在M上运行，但要运行G必须先持有P。
P就像"调度令牌"——只有拿到P的M才能执行Go代码。
```

解释工作窃取（Work Stealing）算法：
- 当一个P的本地队列为空时，它会从其他P的队列"偷"一半G来执行
- 避免某些P忙死某些P闲死的不均衡

解释系统调用时的M解绑：
- 当G执行系统调用（如文件读写）时，G和M绑定并进入阻塞
- Go运行时会将P从该M上剥离，分配给一个空闲M（或新建M）
- 这样P不会闲置，可以继续调度其他G

这一节可以有少量代码展示 `runtime.GOMAXPROCS` 和 `runtime.NumGoroutine` 的使用，但不超过15行。

- [ ] **Step 3: Write (栈管理) + (百万并发原理)**

展示栈从2KB到1GB的动态增长机制。解释为什么100万goroutine实际只需要约2GB内存（初始状态大多数goroutine的栈保持很小）。

- [ ] **Step 4: Write (常见陷阱) + (常见问题与处理)**

**陷阱一：Goroutine泄漏** — 启动了但永远不结束

```go
// 泄漏示例
func leak() {
    ch := make(chan int)
    go func() {
        // 这个goroutine永远阻塞在接收上，因为没有发送者
        val := <-ch
        fmt.Println(val)
    }()
}
```

解决方案：使用context取消、超时控制、确保有配套的close/发送机制。

**陷阱二：循环变量捕获**

```go
for i := 0; i < 3; i++ {
    go func() {
        fmt.Println(i) // 可能打印3,3,3而不是0,1,2
    }()
}
```

解决方案：Go 1.22已修复此问题，但理解其原理仍然重要。

**陷阱三：无法强制停止** — Go没有提供kill goroutine的API

解决方案：使用context取消 + 定期检查done channel。

Mini示例实现worker pool控制并发数量。

```bash
git add docs/go-book-v2/chapter-06-goroutine.md
git commit -m "docs(go-book): add chapter 6 - Goroutine"
```

### Task 8: Write Chapter 7 — Channel

**Files:**
- Create: `docs/go-book-v2/chapter-07-channel.md`

- [ ] **Step 1: Write (概述) + (CSP模型)**

```markdown
## 第7章 Channel — 通信原语

### 概述

Go语言最著名的设计哲学宣言是："Don't communicate by sharing memory; share memory by communicating."（不要通过共享内存来通信，而应通过通信来共享内存。）

这句话到底是什么意思？请想象两个同事合作完成一份报告：
- **共享内存方式**：两人都往同一个共享文档里写，需要锁机制防止冲突（mutex）
- **通信方式**：A写完一部分，通过邮件（channel）发给B，B继续往下写

第二种方式不需要锁，因为数据通过通信传递，而不是共享。

### 7.1 CSP模型的本质

...
```

- [ ] **Step 2: Write Channel的实现原理（重点）**

解释 `hchan` 内部数据结构的核心字段：

```
hchan {
    buf      unsafe.Pointer  // 指向环形缓冲区的指针（有缓冲channel）
    elemsize uint16          // 缓冲区中每个元素的大小
    dataqsiz uint16          // 缓冲区最大元素数量
    qcount   uint16          // 缓冲区当前元素数量
    sendx    uint16          // 下次发送时在缓冲区中的索引
    recvx    uint16          // 下次接收时在缓冲区中的索引
    sendq    waitq           // 等待发送的goroutine队列（双向链表）
    recvq    waitq           // 等待接收的goroutine队列
    lock     mutex           // 保护hchan所有字段的互斥锁
}
```

用文字描述发送和接收的完整流程（无缓冲和有缓冲两种）：

**无缓冲channel发送流程**：
1. 加锁
2. 检查是否有等待接收的goroutine（recvq不空）
3. 如果有：直接将数据复制给该goroutine，唤醒它
4. 如果没有：当前goroutine包装成sudog加入sendq，挂起等待
5. 解锁

**无缓冲channel接收流程**：
1. 加锁
2. 检查是否有等待发送的goroutine（sendq不空）
3. 如果有：直接从发送者获取数据，唤醒它
4. 如果没有：当前goroutine加入recvq，挂起等待
5. 解锁

**有缓冲channel发送/接收**：检查和操作环形缓冲区。

配代码展示创建、发送、接收的基本操作（控制在20行以内）。

- [ ] **Step 3: Write (三种模式) + (select机制)**

同步模式（无缓冲）：goroutine间握手信号。展示一个goroutine通知另一个goroutine开始工作的场景。

异步模式（有缓冲）：生产者-消费者解耦。展示一个生产者、多个消费者的场景。

信号模式（close广播）：多个goroutine同时等待一个事件。展示`close(ch)`通知所有接收者的模式。

select机制：解释随机调度（而非轮询）的设计原因——避免饥饿。

- [ ] **Step 4: Write (性能考量与替代方案) + (常见问题与处理)**

Channel性能 vs Mutex的性能对比场景。

常见问题：
- 向已关闭的channel发送数据 → panic
- 从已关闭的channel接收 → 立即返回零值（可通过第二个返回值判断）
- nil channel永远阻塞（可用于select中禁用case）
- channel泄漏（创建但未使用，GC不会回收）

```bash
git add docs/go-book-v2/chapter-07-channel.md
git commit -m "docs(go-book): add chapter 7 - Channel"
```

### Task 9: Write Chapter 8 — 并发同步与协调

**Files:**
- Create: `docs/go-book-v2/chapter-08-concurrency-sync.md`

- [ ] **Step 1: Write (概述) + (sync包详解)**

概述：Channel解决的是goroutine间通信，但在不需要通信的共享状态场景下，sync包提供的同步原语更合适。

Mutex：用"公共厕所门锁"类比。
RWMutex：用"图书馆的阅览室"类比——很多人可以同时阅读（RLock），但写书时（Lock）所有人都不能进。

```
Mutex的演进：Go 1.9引入饥饿模式，当某个goroutine等待超过1ms时，进入饥饿模式保证公平。
```

WaitGroup：用"接力赛"类比——等待所有队员跑完才统计成绩。
Once：用"单次开门"类比——Do方法确保函数只执行一次。
Cond：用"候诊叫号"类比——等待某个条件满足再继续。
Pool：用"共享工具箱"类比——用完放回，别人可以接着用。

每个原语配一个5-10行的代码片段。

- [ ] **Step 2: Write (atomic操作) + (context包)**

atomic：用"收银台的零钱盒"类比——简单的加减操作不需要上锁，但必须保证原子性。
CAS（Compare And Swap）、Load/Store、Swap。

context：Go并发编程的"信号线"。解释三个核心功能：
1. 取消传播：父context取消，子context全部取消
2. 超时控制：`context.WithTimeout`
3. 传值：`context.WithValue`（用"在快递包裹上贴标签"类比）
配一个context超时控制的完整片段（15行）。

- [ ] **Step 3: Write 并发模式（每个模式先Mini示例，再综合）**

**Fan-in模式**：多个输入channel合并到一个输出channel

```go
func fanIn(chs ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup
    for _, ch := range chs {
        wg.Add(1)
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }
    go func() {
        wg.Wait()
        close(out)
    }()
    return out
}
```

**Fan-out模式**：一个输入分发到多个处理goroutine

**Pipeline模式**：将处理流程拆成多个阶段，每个阶段一个goroutine
示例：数字生成器 → 平方器 → 输出器，每阶段用channel连接。

**超时控制模式**：

```go
select {
case result := <-ch:
    return result
case <-ctx.Done():
    return nil, ctx.Err()
}
```

**限流模式**（令牌桶）：基于有缓冲channel实现。

**优雅退出模式**：`signal.Notify` + context取消。

**并发错误处理（errgroup）**：`golang.org/x/sync/errgroup`——第一个错误导致整个组取消。

- [ ] **Step 4: Add (综合示例) + (常见问题与处理)**

综合示例：一个并发的任务调度器，包含多个worker、任务分发、结果收集、超时控制、优雅退出。提供完整的运行代码。

常见问题：
- 死锁检测与预防（Go运行时可以检测到所有goroutine都阻塞的死锁）
- 数据竞争（使用 `-race` 标志检测，理解C++和Java中的data race概念）
- 并发安全map（sync.Map vs map+mutex）
- 如何优雅关闭worker pool

```bash
git add docs/go-book-v2/chapter-08-concurrency-sync.md
git commit -m "docs(go-book): add chapter 8 - 并发同步与协调"
```

---

## Phase 4: Part 4 — Practice (ch9-ch11 + Demo Code)
**Estimated effort: 3 chapters × 2-4 days each + demo code = 8-14 days**
**Style:** Problem-driven: "我需要做一个Web API → 怎么用Go实现？" Each chapter has a matching demo project.
**Validation:** Each demo project can be started with `docker-compose up` and works end-to-end.

### Task 10: Write Chapter 9 — Web应用开发 + Build Demo

**Files:**
- Create: `docs/go-book-v2/chapter-09-web-development.md`
- Create: `demos/ch09-rest-api/main.go`
- Create: `demos/ch09-rest-api/go.mod`
- Create: `demos/ch09-rest-api/handler/post.go`
- Create: `demos/ch09-rest-api/handler/auth.go`
- Create: `demos/ch09-rest-api/model/post.go`
- Create: `demos/ch09-rest-api/middleware/logging.go`
- Create: `demos/ch09-rest-api/middleware/jwt.go`
- Create: `demos/ch09-rest-api/docker-compose.yml`
- Create: `demos/ch09-rest-api/init.sql`
- Create: `demos/ch09-rest-api/README.md`

- [ ] **Step 1: Write chapter content (net/http原理 + 框架对比)**

```markdown
## 第9章 Web应用开发

### 概述

"我想用Go写一个Web API"——这可能是开发者接触Go最常见的场景。Go的标准库net/http已经提供了构建Web服务所需的核心能力。

...

### 9.1 net/http标准库原理

（ServeMux路由实现、Handler接口的设计巧思、中间件模式的实现。每个概念配代码片段。）
```

- [ ] **Step 2: Write chapter content (RESTful API + 数据库 + 认证)**

数据库操作：`database/sql` 标准库的使用。ORM（GORM）的基本使用。
JWT认证中间件的实现原理。

风格：自然语言先讲思路，每段后配5-15行代码片段展示核心逻辑。

- [ ] **Step 3: Add (常见问题与处理) + (小结)**

常见问题：
- JSON序列化小写字段 → struct tag配置
- 数据库连接泄漏 → 使用defer row.Close()
- CORS跨域配置

- [ ] **Step 4: Build demo — RESTful博客API**

Create all files under `demos/ch09-rest-api/`:

**go.mod:**
```
module go-book/demo/rest-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/lib/pq v1.10.9
    github.com/golang-jwt/jwt/v5 v5.2.0
)
```

**main.go:** Entry point, router setup, dependency injection.

**model/post.go:** Post struct, Create/GetAll/GetByID/Update/Delete methods using database/sql.

**handler/post.go:** HTTP handlers for CRUD operations.

**handler/auth.go:** Login handler returning JWT token.

**middleware/logging.go:** Request logging middleware.

**middleware/jwt.go:** JWT authentication middleware.

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - DB_NAME=blog
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: blog
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
```

**Dockerfile:**
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/server .
CMD ["./server"]
```

**init.sql:** Create `posts` table with id, title, content, author, created_at, updated_at.

**README.md:** Run instructions (`docker-compose up`), curl examples for each endpoint.

- [ ] **Step 5: Verify demo builds and runs**

```bash
cd docs/go-book-v2/demos/ch09-rest-api
go mod tidy
go build ./...
```

Ensure all Go code compiles without errors. Verify `docker-compose config` validates correctly.

- [ ] **Step 6: Commit all chapter + demo files**

```bash
git add docs/go-book-v2/chapter-09-web-development.md
git add docs/go-book-v2/demos/ch09-rest-api/
git commit -m "docs(go-book): add chapter 9 - Web应用开发 with demo"
```

### Task 11: Write Chapter 10 — 微服务通信 + Build Demo

**Files:**
- Create: `docs/go-book-v2/chapter-10-microservice.md`
- Create: `demos/ch10-grpc/proto/order.proto`
- Create: `demos/ch10-grpc/order-server/main.go`
- Create: `demos/ch10-grpc/order-server/service.go`
- Create: `demos/ch10-grpc/stock-server/main.go`
- Create: `demos/ch10-grpc/stock-server/service.go`
- Create: `demos/ch10-grpc/client/main.go`
- Create: `demos/ch10-grpc/go.mod`
- Create: `demos/ch10-grpc/docker-compose.yml`
- Create: `demos/ch10-grpc/README.md`

- [ ] **Step 1: Write chapter content (Go微服务优势 + gRPC原理)**

概述：Go为什么成为微服务首选语言——编译成小体积静态二进制、启动快（ms级vs JVM的s级）、goroutine天然适合高并发服务。

gRPC原理：Protocol Buffers作为接口定义语言（IDL），`.proto`文件定义服务和方法。

四种RPC类型：
1. 一元RPC（Unary）：客户端发一个请求，服务端回一个响应
2. 服务端流式（Server Streaming）：客户端发一个请求，服务端流式返回多个响应
3. 客户端流式（Client Streaming）：客户端流式发送请求，服务端返回一个响应
4. 双向流式（Bidirectional Streaming）：双方同时发送和接收

- [ ] **Step 2: Write chapter content (服务发现 + 链路追踪)**

服务注册与发现：etcd的基本使用。为什么需要服务发现——微服务实例动态变化。

链路追踪：OpenTelemetry的基本概念（Trace/Span/SpanContext）、分布式追踪的价值。

- [ ] **Step 3: Build demo — gRPC微服务通信**

**order.proto:**
```protobuf
syntax = "proto3";
package order;

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
}

service StockService {
  rpc DeductStock(DeductStockRequest) returns (DeductStockResponse);
}
```

**order-server/main.go:** gRPC server, listens for order requests, calls stock service.

**stock-server/main.go:** gRPC server, handles stock deduction.

**client/main.go:** gRPC client, sends order creation request.

**docker-compose.yml:** 3 services + etcd.

- [ ] **Step 4: Add chapter content (常见问题与处理) + verify + commit**

```bash
git add docs/go-book-v2/chapter-10-microservice.md
git add docs/go-book-v2/demos/ch10-grpc/
git commit -m "docs(go-book): add chapter 10 - 微服务通信 with demo"
```

### Task 12: Write Chapter 11 — 命令行工具开发 + Build Demo

**Files:**
- Create: `docs/go-book-v2/chapter-11-cli-tool.md`
- Create: `demos/ch11-cli/main.go`
- Create: `demos/ch11-cli/go.mod`
- Create: `demos/ch11-cli/cmd/root.go`
- Create: `demos/ch11-cli/cmd/search.go`
- Create: `demos/ch11-cli/cmd/config.go`
- Create: `demos/ch11-cli/pkg/searcher/search.go`
- Create: `demos/ch11-cli/pkg/spinner/spinner.go`
- Create: `demos/ch11-cli/Dockerfile`
- Create: `demos/ch11-cli/README.md`

- [ ] **Step 1: Write chapter + build demo + commit**

```bash
git add docs/go-book-v2/chapter-11-cli-tool.md
git add docs/go-book-v2/demos/ch11-cli/
git commit -m "docs(go-book): add chapter 11 - 命令行工具开发 with demo"
```

---

## Phase 5: Part 5 — Performance (ch12-ch14)
**Estimated effort: 3 chapters × 2-4 days each + demo = 7-13 days**
**Style:** Problem-driven, "程序跑得慢怎么办？" Each technique explained in natural language first, with benchmark comparisons.
**Validation:** Optimization advice includes concrete before/after comparison data.

### Task 13: Write Chapter 12 — 性能分析与调优工具

**Files:**
- Create: `docs/go-book-v2/chapter-12-profiling.md`

- [ ] **Step 1: Write (概述) + (pprof)**

```markdown
## 第12章 性能分析与调优工具

### 概述

"我的程序跑得很慢，但不知道瓶颈在哪里。"——这是最常见的性能问题。Go提供了强大的性能分析工具链，让你能"看到"程序内部发生了什么。

### 12.1 pprof性能剖析

pprof是Go内置的性能分析工具。它可以从多个维度"剖析"你的程序：

**CPU分析**：记录每个函数占用的CPU时间。输出火焰图，让"最宽的块"一目了然。
**内存分析**：记录每个函数分配的内存大小和次数。heap（当前内存）和allocs（累积分配）。
**goroutine分析**：记录当前所有goroutine的堆栈，查看哪些goroutine在等待什么。
**阻塞分析**：记录goroutine在同步原语上的等待时间。

（用"医院的体检中心"做类比：pprof就像给程序做一次全面体检——测心率（CPU）、查血常规（内存）、做CT（goroutine堆栈）。）

配代码展示如何集成pprof端点：
```go
import _ "net/http/pprof"

// 然后在main中启动HTTP服务
go func() {
    log.Println(http.ListenAndServe("localhost:6060", nil))
}()
```

以及如何查看分析结果：
```bash
# CPU分析采样30秒
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/profile?seconds=30
```

每步配自然语言解释。

- [ ] **Step 2: Write (trace) + (Benchmark) + (火焰图)**

trace：pprof关注"哪个函数花的时间多"，trace关注"一段时间内发生了什么"。
展示trace能看到的：Goroutine创建和销毁时间线、GC事件、网络IO、系统调用。

Benchmark：如何编写正确的基准测试（避免编译器优化干扰）。

```go
func BenchmarkStringConcat(b *testing.B) {
    // 错误写法：编译器可能优化掉不使用的结果
    for i := 0; i < b.N; i++ {
        s := "a" + "b"  // 编译器可能直接优化为"ab"
    }

    // 正确写法：使用结果，存储到包级变量防止优化
    var result string
    for i := 0; i < b.N; i++ {
        result = "a" + strconv.Itoa(i)
    }
    _ = result
}
```

- [ ] **Step 3: Add (常见问题与处理) + (小结)**

常见问题：
- 线上环境不能开pprof → 只在debug端口开启，不暴露到公网
- profile文件过大 → 调整采样率
- 为什么看到的"热函数"是runtime内的而不是自己的 → 关注子调用占比

```bash
git add docs/go-book-v2/chapter-12-profiling.md
git commit -m "docs(go-book): add chapter 12 - 性能分析与调优工具"
```

### Task 14: Write Chapter 13 — 全方位性能优化实践

**Files:**
- Create: `docs/go-book-v2/chapter-13-performance-opt.md`

- [ ] **Step 1: Write (概述) + (内存优化)**

概述：性能优化的核心原则——"先测量，再优化"（Measure, don't guess）。

**13.1 内存优化**

每个优化技巧配benchmark对比数据：

1. **预分配slice**：`make([]int, 0, 1000)` vs 动态append
2. **sync.Pool对象池**：减少GC压力，适合频繁创建销毁的临时对象
3. **buffer pool复用**：io操作复用缓冲区
4. **切片截取陷阱**：大slice截取小片段后，底层数组仍被引用
5. **大对象拆分**：>32KB的对象绕过小对象分配器

每个技巧的格式：
```
【技巧】预分配slice
【问题】使用append动态增长时，slice会多次扩容、复制、GC
【方案】预估容量，提前分配
【效果】Benchmark: 无预分配 ~200ns/op 3 allocs/op → 预分配 ~50ns/op 1 allocs/op
```

- [ ] **Step 2: Write (CPU优化) + (并发优化)**

CPU优化：
1. **内联控制**：`//go:noinline` 注解，何时需要禁止内联
2. **边界检查消除（BCE）**：编译器安全检查和优化
3. **PGO（Profile-Guided Optimization, Go 1.20+）**：基于运行时profile的编译优化
4. **编译优化标志**：`-gcflags="-l"` 等

并发优化：
1. **锁粒度优化**：粗锁→细锁→无锁的三步演进
2. **sync.Map vs map+sync.RWMutex**：适用场景对比
3. **读写分离**：读多写少的优化策略
4. **无锁数据结构**：CAS原子的实际应用

- [ ] **Step 3: Write (I/O优化) + (网络优化)**

I/O优化：
1. **零拷贝**：sendfile系统调用——数据直接从文件到网络socket，不需要经过应用程序缓冲
2. **buffer pool复用**：使用sync.Pool管理读写缓冲区
3. **io_uring简介**：Linux 5.1引入的异步I/O框架，Go未来可能支持的方向

网络优化：
1. **TCP keepalive调优**：快速检测断开连接
2. **HTTP连接池**：Transport配置、MaxIdleConnsPerHost
3. **自定义Dialer**：连接超时、拨号超时

- [ ] **Step 4: Write (GC优化) + (编译优化) + (常见问题与处理)**

GC优化：
1. **GOGC调优**：默认100，增大可减少GC频率但增加内存占用
2. **减少堆分配**：结构体复用、栈上分配优先
3. **降低指针密度**：指针越少，GC扫描越快
4. **对象复用**：sync.Pool

编译优化：PGO流程、SSA后端优化。

常见问题：
- 过早优化 → "优化前先测量"原则
- 微基准测试 vs 真实场景差异
- 可读性vs性能的权衡

```bash
git add docs/go-book-v2/chapter-13-performance-opt.md
git commit -m "docs(go-book): add chapter 13 - 全方位性能优化实践"
```

### Task 15: Write Chapter 14 + Build Demo (高性能服务器)

**Files:**
- Create: `docs/go-book-v2/chapter-14-high-perf-server.md`
- Create: `demos/ch14-high-perf-server/main.go`
- Create: `demos/ch14-high-perf-server/go.mod`
- Create: `demos/ch14-high-perf-server/pkg/limiter/token_bucket.go`
- Create: `demos/ch14-high-perf-server/pkg/circuit/breaker.go`
- Create: `demos/ch14-high-perf-server/pkg/pool/conn_pool.go`
- Create: `demos/ch14-high-perf-server/pkg/middle/logging.go`
- Create: `demos/ch14-high-perf-server/pkg/middle/pprof.go`
- Create: `demos/ch14-high-perf-server/docker-compose.yml`
- Create: `demos/ch14-high-perf-server/prometheus.yml`
- Create: `demos/ch14-high-perf-server/bench/bench.sh`
- Create: `demos/ch14-high-perf-server/bench/report.md`
- Create: `demos/ch14-high-perf-server/README.md`

- [ ] **Step 1: Write chapter content**

API网关原型的整体设计思路，每个组件的自然语言解释。

- [ ] **Step 2: Build demo — 高性能API网关**

**token_bucket.go:** 令牌桶限流器实现（带rate.Limiter封装）。

**breaker.go:** 熔断器实现（三种状态：Closed/Open/HalfOpen）。

**conn_pool.go:** 连接池实现。

**main.go:** 集成所有组件，启动HTTP服务器，注册pprof端点。

**docker-compose.yml:** 服务 + Prometheus + Grafana.

- [ ] **Step 3: Verify + commit**

```bash
git add docs/go-book-v2/chapter-14-high-perf-server.md
git add docs/go-book-v2/demos/ch14-high-perf-server/
git commit -m "docs(go-book): add chapter 14 - 高性能服务器设计 with demo"
```

---

## Phase 6: Part 6 — Advanced (ch15-ch20)
**Estimated effort: 6 chapters × 1-3 days each = 6-18 days**
**Style:** Problem-driven — "如何保证质量？" "如何管理项目？" "如何写出安全的代码？"
**Validation:** Each chapter answers at least 3 real-world practitioner questions.

### Task 16: Write Chapter 15 — 测试与质量保证

**Files:**
- Create: `docs/go-book-v2/chapter-15-testing.md`

- [ ] **Step 1: Write chapter**

go test深入（`-v/-run/-cover/-race` 完整参数说明）。
Table-driven测试范式（Go社区的标志性测试风格）。

```go
func TestIsPalindrome(t *testing.T) {
    tests := []struct {
        name  string
        input string
        want  bool
    }{
        {"空字符串", "", true},
        {"单个字符", "a", true},
        {"回文", "上海自来水来自海上", true},
        {"非回文", "hello", false},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            if got := isPalindrome(tt.input); got != tt.want {
                t.Errorf("isPalindrome(%q) = %v, want %v", tt.input, got, tt.want)
            }
        })
    }
}
```

Mock/Stub：接口天然可mock。gomock/testify的基本使用。
集成测试：Testcontainers启动真实数据库。
Fuzz Testing (Go 1.18+)：自动发现边界情况。

常见问题：
- 测试覆盖率高但bug多 → 测试质量 > 覆盖数字
- 外部依赖 → 接口抽象 + mock
- 并发代码测试 → race detector

```bash
git add docs/go-book-v2/chapter-15-testing.md
git commit -m "docs(go-book): add chapter 15 - 测试与质量保证"
```

### Task 17: Write Chapter 16 — 项目管理与工程化

**Files:**
- Create: `docs/go-book-v2/chapter-16-project-management.md`

- [ ] **Step 1: Write chapter**

go module深入（module path、replace、vendor）。
依赖管理（dependabot自动更新）。
项目结构（Standard Go Project Layout）。
CI/CD（GitHub Actions + 多阶段Docker构建 — 二进制从1GB瘦身到20MB）。

```yaml
# GitHub Actions示例
name: Go CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'
      - run: go build ./...
      - run: go test -race ./...
```

常见问题：
- 依赖冲突 → go mod tidy
- 私有仓库 → GOPRIVATE配置
- 多阶段Docker构建优化

```bash
git add docs/go-book-v2/chapter-16-project-management.md
git commit -m "docs(go-book): add chapter 16 - 项目管理与工程化"
```

### Task 18: Write Chapter 17 — 安全编程实践

**Files:**
- Create: `docs/go-book-v2/chapter-17-security.md`

- [ ] **Step 1: Write chapter**

常见Go安全陷阱：整数溢出（无自动提示）、不安全的反序列化、竞争条件。
Web安全：SQL注入防御（参数化查询）、XSS/CSRF防护。
安全编码指南：输入验证、最小权限、日志安全。
govulncheck依赖漏洞扫描。

```bash
git add docs/go-book-v2/chapter-17-security.md
git commit -m "docs(go-book): add chapter 17 - 安全编程实践"
```

### Task 19: Write Chapter 18 — Go编译与运行时探秘

**Files:**
- Create: `docs/go-book-v2/chapter-18-compiler-runtime.md`

- [ ] **Step 1: Write chapter**

编译过程（词法分析→语法分析→类型检查→SSA中间表示→机器码生成）。
链接与静态编译（为什么Go二进制可以独立运行）。
交叉编译（GOOS/GOARCH、CGO的跨平台注意事项）。
运行时组件（调度器、GC、内存分配器的协同——在第5、6章的基础上总结）。
build标签与条件编译。

```bash
git add docs/go-book-v2/chapter-18-compiler-runtime.md
git commit -m "docs(go-book): add chapter 18 - Go编译与运行时探秘"
```

### Task 20: Write Chapter 19 — Go开发者的进阶之路

**Files:**
- Create: `docs/go-book-v2/chapter-19-roadmap.md`

- [ ] **Step 1: Write chapter**

知识体系图谱（Go开发者知识树——语言核心、并发、内存、性能、工程、系统、生态）。
必须熟练掌握的8项核心技能（每项配1-2段自然语言解释+学习建议）：
1. 用自然语言讲清楚G-M-P调度模型
2. 徒手画出Channel的发送/接收流程图
3. 解释逃逸分析如何工作
4. 熟练使用pprof定位性能瓶颈
5. 设计常见并发模式（Pipeline、Fan-in/Fan-out）
6. 编写Table-driven测试
7. 配置多阶段Docker构建
8. 进行基础GC调优

推荐学习路径：语言基础→并发原理→工程实践→系统深入→生态拓展的阶梯路线。

```bash
git add docs/go-book-v2/chapter-19-roadmap.md
git commit -m "docs(go-book): add chapter 19 - Go开发者的进阶之路"
```

### Task 21: Write Chapter 20 — 常见面试题与解析

**Files:**
- Create: `docs/go-book-v2/chapter-20-interview.md`

- [ ] **Step 1: Write chapter**

挑选10-15道高频面试题，分类组织，每道题讲思路而非背答案：

**Goroutine与调度**：G-M-P模型是什么？goroutine和线程的区别？goroutine泄漏怎么排查？

**Channel与并发**：channel有缓冲和无缓冲的区别？select的底层实现？如何实现限流？

**GC与内存**：Go GC的发展？三色标记是什么？如何减少GC压力？逃逸分析是什么？

**接口与类型**：接口底层实现（iface/eface）？空接口和nil的区别？类型断言的两种用法？

**性能优化**：pprof怎么用？sync.Pool的使用场景？PGO是什么？

**系统设计**：用Go设计一个高并发Web服务？如何设计微服务通信？如何确保数据一致性？

```bash
git add docs/go-book-v2/chapter-20-interview.md
git commit -m "docs(go-book): add chapter 20 - 常见面试题与解析"
```

---

## Effort Summary

| Phase | Chapters | Estimated Effort | Key Complexity |
|-------|----------|-----------------|----------------|
| Phase 1: 基础篇 | ch1-ch2 | 2-4 days | Low — pure natural language, no code |
| Phase 2: 语法与机制篇 | ch3-ch5 | 6-9 days | Medium — interface internals, GC mechanism |
| Phase 3: 并发编程篇 | ch6-ch8 | 9-15 days | **High** — G-M-P, hchan, sync patterns, min+combined examples |
| Phase 4: 实战篇 | ch9-ch11 | 8-14 days | Medium-High — chapter + demo code + Docker Compose |
| Phase 5: 高性能篇 | ch12-ch14 | 7-13 days | Medium — pprof, 7 optimization dimensions, API gateway demo |
| Phase 6: 进阶篇 | ch15-ch20 | 6-18 days | Low-Medium — broader content, less depth per topic |
| **Total** | **20 chapters** | **38-73 days** | |

## Self-Review Checklist

After writing this plan, verify against spec:

1. **Spec coverage**: 
   - ✅ 6篇20章 from spec → each has a dedicated task
   - ✅ Natural language first → stated in every chapter task
   - ✅ Concurrency ~30% → Phase 3 has largest tasks (ch6-ch8 most detailed)
   - ✅ 4 demo projects → Task 10 (ch9), Task 11 (ch10), Task 12 (ch11), Task 15 (ch14)
   - ✅ Docker Compose → ch9 (PostgreSQL), ch10 (etcd+services), ch14 (Prometheus+Grafana)
   - ✅ Developer skills chapter → Task 20 (ch19) with 8 specific skills
   - ✅ Interview chapter → Task 21 (ch20) with 6 categories
   - ✅ Common problems & solutions → every chapter has this section
   - ✅ 7 optimization dimensions in ch13 → Task 14 covers all 7

2. **Placeholder scan**: 
   - All steps contain explicit content descriptions or code templates
   - No "TBD", "TODO", or vague instructions
   - Code examples are written inline, not as placeholders

3. **Type consistency**: 
   - File paths in tasks match the file structure diagram exactly
   - All chapter filenames use the same `chapter-XX-slug.md` format
   - Demo package paths (`go-book/demo/...`) are consistent across projects

4. **Scope**: 
   - 20 chapters, 4 demo projects — focused scope
   - No content outside the approved spec
   - No feature creep (e.g., no mentioning Kubernetes operator patterns or mobile Go)

---

## Execution Options

### Option 1: Subagent-Driven (Recommended)
- A fresh subagent per task in sequential order (Phase 1→6)
- Each subagent handles one chapter + its demo code
- Review gates between each phase
- Fast iteration with isolated context per task

### Option 2: Inline Execution
- Execute tasks directly in this session in batch
- Each phase completed before moving to the next
- Checkpoint reviews after each phase

**Which approach do you prefer?**