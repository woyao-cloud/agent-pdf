# 第14章：运行时排查：内存泄漏与死锁

## 1. 使用场景

### 1.1 生产环境内存持续增长

在生产环境中，内存持续增长是最常见也最危险的运行时问题之一。当 Effect-TS 应用程序的内存占用随时间推移不断上升，即使在没有请求处理的情况下也不回落，这通常意味着存在内存泄漏。在 Effect-TS 的上下文中，内存泄漏主要来源于以下几个方面：

**Fiber 泄漏**：每个 Effect-TS Fiber 都是一个轻量级执行单元，类似于操作系统线程但开销小得多。当 Fiber 被创建（fork）但没有被正确管理时，它会持续存在于运行时系统中，即使其工作已经完成。这些"僵尸 Fiber"会持有对闭包中变量的引用，阻止垃圾回收器回收这些内存。在 Effect-TS 中，每个 Fiber 都关联着一个执行上下文，包括其作用域链、错误处理器和最终化器。如果 Fiber 没有被正确关闭，这些关联的资源也无法被释放。

**闭包引用泄漏**：Effect-TS 大量使用闭包来实现延迟计算和函数式组合。每个 Effect 本质上都是一个惰性求值的计算描述，它捕获了创建时的环境变量。如果这些 Effect 被长期持有（例如存储在全局队列或缓存中），它们捕获的变量也无法被回收。这在 Effect-TS 的 Schedule、Queue 和 Ref 等持久化数据结构中尤为常见。

**Scope 泄漏**：Scope 是 Effect-TS 中管理资源生命周期的核心机制。当 Scope 被创建但没有被正确关闭时，Scope 内注册的所有终结器（finalizer）都不会被执行，导致资源泄漏。这包括文件句柄、网络连接、数据库连接池等系统资源。

### 1.2 请求处理变慢或超时

当应用程序的请求处理速度逐渐下降，或者出现间歇性超时，这可能是由以下原因导致的：

**Fiber 堆积**：当 Fiber 泄漏发生时，越来越多的 Fiber 在后台运行，消耗 CPU 时间片。即使这些 Fiber 处于挂起状态，它们仍然需要被运行时系统管理。Effect-TS 的调度器需要遍历所有活跃 Fiber 来检查它们是否可以继续执行。随着 Fiber 数量的增长，调度开销呈线性增长，最终导致请求处理延迟显著增加。

**锁竞争加剧**：在死锁场景中，多个 Fiber 互相等待对方释放锁资源。这不仅导致等待的 Fiber 无法完成，还会影响其他尝试获取同一锁资源的 Fiber。随着等待队列的增长，锁竞争变得更加激烈，进一步降低系统吞吐量。

**内存压力**：内存泄漏导致可用内存减少，触发更频繁的垃圾回收。垃圾回收（GC）会暂停所有 JavaScript 执行（Stop-The-World），导致请求处理出现明显的延迟尖峰。在极端情况下，GC 可能占用超过 50% 的 CPU 时间，使应用程序几乎无法响应。

### 1.3 并发任务无法完成

在 Effect-TS 中，并发任务通常通过 Fiber 和 Effect.race 来实现。当这些任务无法完成时，可能的原因包括：

**死锁**：两个或多个 Fiber 各自持有对方需要的锁资源，形成循环等待。这是最经典的并发问题，在 Effect-TS 中通常表现为使用 Semaphore 或自定义锁时的不正确锁顺序。死锁的四个必要条件（互斥、持有并等待、不可剥夺、循环等待）在 Effect-TS 的 Fiber 模型中同样适用。

**竞态条件中的永久等待**：Effect.race 在多个 Effect 之间进行竞态，返回最先完成的那个。但如果所有参与竞态的 Effect 都因为某种原因无法完成（例如它们都在等待同一个永远不会被释放的锁），那么 Effect.race 本身也会永久阻塞。

**Fiber 中断处理不当**：当 Fiber 被中断时，它会抛出一个 InterruptedException。如果这个异常没有被正确处理，Fiber 可能不会正常退出，而是进入一种不确定的状态。这在复杂的 Fiber 层次结构中尤为危险，因为父 Fiber 的中断需要传播到所有子 Fiber。

### 1.4 系统资源耗尽

系统资源耗尽是最严重的运行时问题，可能导致整个应用程序崩溃或无法响应：

**文件描述符耗尽**：每个打开的 Scope 可能对应一个文件句柄或网络连接。如果 Scope 泄漏，这些文件描述符不会被关闭。操作系统对每个进程的文件描述符数量有限制（通常为 1024 或更高），一旦耗尽，所有新的文件操作都会失败。

**连接池耗尽**：数据库连接池、HTTP 连接池等资源池在 Effect-TS 中通常通过 Scope 管理。如果 Scope 泄漏，连接不会被归还到池中，导致连接池耗尽，新的请求无法获取连接。

**事件循环阻塞**：大量活跃 Fiber 可能导致事件循环被长时间占用。虽然 Effect-TS 的 Fiber 是协作式调度的，但如果某个 Fiber 执行了长时间同步操作（如大量计算或同步 I/O），它会阻塞整个事件循环，影响所有其他 Fiber 的执行。

## 2. 实现原理

### 2.1 Effect-TS Fiber 系统架构

Effect-TS 的 Fiber 系统是一个基于协程的轻量级并发模型，其核心架构包含以下几个关键组件：

**Fiber 运行时**：每个 Fiber 都运行在 Effect-TS 的运行时系统中。运行时负责调度 Fiber 的执行、处理异步操作、管理错误传播和中断信号。运行时系统维护一个活跃 Fiber 的注册表，通过 Fiber.dump API 可以获取所有活跃 Fiber 的快照。

**Fiber 状态机**：每个 Fiber 在其生命周期中经历多个状态：初始（initial）、运行中（running）、挂起（suspended，等待异步操作完成）、完成（done）和中断（interrupted）。Fiber 的状态转换由运行时系统管理，通过检查 Fiber 的状态可以判断其是否正常完成还是被中断。

**Fiber 标识符**：每个 Fiber 都有一个唯一的标识符（id），用于在 Fiber.dump 输出中区分不同的 Fiber。标识符是单调递增的，可以帮助判断 Fiber 的创建顺序和生命周期。

**Fiber 层次结构**：Fiber 可以形成父子层次结构。当父 Fiber 被中断时，中断信号会传播到所有子 Fiber。这种层次结构通过 Scope 来管理，Scope 本质上是一个 Fiber 的集合，提供了批量中断的能力。

**Fiber 的协作式调度**：与操作系统线程的抢占式调度不同，Effect-TS 的 Fiber 采用协作式调度。这意味着 Fiber 必须主动让出执行权（通过 yield 或等待异步操作）才能让其他 Fiber 执行。这种设计使得 Fiber 的开销极低（每个 Fiber 仅需几 KB 内存），但也意味着长时间运行的同步操作会阻塞其他 Fiber。

### 2.2 Fiber 生命周期管理

Fiber 的生命周期从 Effect.fork 开始，到 Fiber 完成或被中断结束。正确的生命周期管理是防止 Fiber 泄漏的关键：

**Fork 操作**：Effect.fork 创建一个新的 Fiber 来执行给定的 Effect。新 Fiber 与父 Fiber 并发执行。如果 fork 时没有指定 Scope，新 Fiber 的生命周期完全独立于父 Fiber，父 Fiber 的完成不会自动导致子 Fiber 的中断。

**Join 操作**：Fiber.join 等待 Fiber 完成并获取其结果。如果 Fiber 已经完成，join 立即返回结果。如果 Fiber 被中断，join 会传播中断错误。Join 是获取 Fiber 结果的唯一安全方式。

**Interrupt 操作**：Fiber.interrupt 发送中断信号给 Fiber。Fiber 收到中断信号后，会在下一个安全点（通常是异步操作或 yield 点）抛出 InterruptedException。中断是协作式的，Fiber 可以选择忽略中断信号（不推荐）。

**Scope 管理**：Scope 是 Effect-TS 中管理 Fiber 生命周期的推荐方式。通过 Effect.forkIn(scope) 创建的 Fiber 会被注册到 Scope 中。当 Scope 被关闭时（通过 Scope.close 或 Effect.scoped 自动关闭），Scope 内所有活跃的 Fiber 都会被中断。这确保了 Fiber 不会泄漏。

**Fiber.dump 的工作原理**：Fiber.dump 返回一个包含所有活跃 Fiber 信息的数组。每个 Fiber 信息包括其 id、状态（running/suspended/done）、创建位置（location）和当前执行位置。通过比较不同时间点的 Fiber.dump 输出，可以检测到那些持续存在的 Fiber（潜在泄漏）。

### 2.3 Scope 的自动清理机制

Scope 是 Effect-TS 中资源管理的核心抽象，其自动清理机制基于以下设计：

**Scope 的创建**：Scope.make 创建一个新的 Scope 实例。Scope 内部维护一个 Fiber 集合和一个终结器（finalizer）列表。当 Scope 被关闭时，所有注册的 Fiber 被中断，所有终结器按注册顺序的逆序执行。

**Effect.scoped**：Effect.scoped 是使用 Scope 的最安全方式。它自动创建 Scope，将 Effect 的执行绑定到该 Scope，然后在 Effect 完成后自动关闭 Scope。这确保了即使 Effect 执行失败或被中断，Scope 也会被正确清理。

**ForkIn 操作**：Effect.forkIn(scope) 在指定的 Scope 内创建 Fiber。这与 Effect.fork 的区别在于，创建的 Fiber 的生命周期与 Scope 绑定。当 Scope 关闭时，这些 Fiber 会被自动中断。

**Scope 的嵌套**：Scope 可以嵌套。当外部 Scope 关闭时，内部 Scope 也会被关闭。这种嵌套结构允许在不同层次上管理资源，例如在请求级别和连接级别分别管理 Scope。

**Scope 的线程安全**：Scope 的实现是线程安全的，可以在多个 Fiber 之间共享。多个 Fiber 可以同时向同一个 Scope 注册资源，Scope 会确保所有资源在关闭时被正确清理。

### 2.4 Semaphore 与锁机制

Semaphore 是 Effect-TS 中控制并发访问的核心原语：

**Semaphore 的基本操作**：Semaphore.make(n) 创建一个具有 n 个许可的 Semaphore。semaphore.take 获取一个许可（如果可用），否则挂起当前 Fiber 直到有许可可用。semaphore.release 释放一个许可，唤醒等待的 Fiber。

**Semaphore 的内部实现**：Semaphore 内部使用一个队列来管理等待的 Fiber。当 take 操作无法立即获取许可时，当前 Fiber 被挂起并加入等待队列。当 release 操作释放许可时，等待队列中的第一个 Fiber 被唤醒并获取许可。这种公平的 FIFO 队列确保了所有 Fiber 最终都能获取许可（避免饥饿）。

**Semaphore 与死锁**：当多个 Semaphore 被用于保护多个资源时，如果 Fiber 以不同的顺序获取 Semaphore，就可能发生死锁。例如，Fiber A 获取 Semaphore 1 然后 Semaphore 2，而 Fiber B 获取 Semaphore 2 然后 Semaphore 1。当两个 Fiber 都持有一个 Semaphore 并等待另一个时，就形成了死锁。

**Ref 作为锁**：Ref 是 Effect-TS 中的原子引用，也可以用于实现简单的锁。通过 Ref.modify 可以原子地检查和修改锁状态。但使用 Ref 实现锁需要手动处理等待和重试逻辑，更容易出错。

### 2.5 Effect.race 的竞态实现

Effect.race 是 Effect-TS 中实现竞态的核心操作：

**Race 的基本原理**：Effect.race 接受两个 Effect，同时启动它们，返回最先完成的结果。另一个 Effect 会被中断。这类似于 Promise.race，但 Effect.race 正确处理了中断和资源清理。

**Race 的内部实现**：Effect.race 内部创建两个 Fiber 来执行两个 Effect。当其中一个 Fiber 完成时，另一个 Fiber 被中断。如果两个 Fiber 都失败，race 返回最后一个错误。Race 的实现确保了即使被中断的 Fiber 也能正确清理其资源。

**Race 与超时**：Effect.timeout 实际上是 Effect.race 的一个特例。它创建一个在指定时间后完成的 Effect，与原始 Effect 进行竞态。如果超时 Effect 先完成，原始 Effect 被中断，返回超时错误。

**Race 的死锁风险**：如果参与竞态的所有 Effect 都因为等待锁资源而无法完成，Effect.race 本身也会永久阻塞。这就是为什么需要为 Effect.race 添加超时机制的原因。

## 3. 风险与优化

### 3.1 Fiber 泄漏的根本原因

Fiber 泄漏的根本原因可以归结为以下几点：

**未管理的 Fork**：最常见的 Fiber 泄漏原因是使用 Effect.fork 而没有将 Fiber 关联到任何 Scope。这样的 Fiber 在创建后完全独立，即使父 Fiber 完成，子 Fiber 仍然继续运行。如果这些 Fiber 被设计为短期任务，它们会在完成后自动退出，但如果它们因为某些原因（如等待永远不会到达的信号）而无法完成，就会永久存在于系统中。

**循环引用**：Fiber 之间可能形成循环引用，导致它们都无法被垃圾回收。例如，Fiber A 持有对 Fiber B 的引用，Fiber B 持有对 Fiber A 的引用。即使两个 Fiber 都已经完成，它们仍然无法被回收。

**全局状态持有**：将 Fiber 引用存储在全局变量或长期存在的集合中，会阻止 Fiber 被垃圾回收。这在缓存、注册表和观察者模式中尤为常见。

**中断处理不当**：当 Fiber 被中断时，它应该执行清理操作然后退出。但如果中断处理代码本身抛出异常或进入无限循环，Fiber 可能无法正常退出。

### 3.2 锁顺序不一致导致死锁

锁顺序不一致是导致死锁的最常见原因：

**循环等待的形成**：当多个 Fiber 以不同的顺序获取锁时，就可能形成循环等待。例如，Fiber 1 获取锁 A 然后锁 B，Fiber 2 获取锁 B 然后锁 A。当 Fiber 1 持有 A 等待 B，Fiber 2 持有 B 等待 A 时，死锁形成。

**预防策略**：预防死锁的最有效策略是强制所有 Fiber 以相同的顺序获取锁。这可以通过对锁进行排序（例如按名称或 ID）来实现。在 Effect-TS 中，可以通过 LockManager 等工具类来自动强制执行锁顺序。

**检测策略**：通过超时机制可以检测死锁。如果获取锁的操作在指定时间内没有完成，可以认为可能发生了死锁。检测到死锁后，可以尝试释放已持有的锁并重试，或者记录错误信息供人工分析。

### 3.3 超时机制的重要性

超时机制是防止系统永久阻塞的最后防线：

**防止资源耗尽**：超时确保即使发生死锁或无限等待，系统资源也不会被永久占用。通过设置合理的超时时间，可以确保 Fiber 最终会释放其持有的资源。

**优雅降级**：当超时发生时，应用程序可以执行降级逻辑，例如返回缓存数据、使用默认值或返回错误响应。这比系统完全无响应要好得多。

**诊断信息**：超时错误通常包含有用的诊断信息，如超时的操作名称、等待时间和当前 Fiber 的状态。这些信息对于排查问题非常有价值。

**超时时间的选择**：超时时间需要根据具体场景仔细选择。太短会导致误报（正常操作被错误地中断），太长则无法及时发现问题。通常建议从业务 SLA 的 1/3 开始，根据实际运行数据调整。

### 3.4 监控与告警策略

有效的监控和告警是预防运行时问题的关键：

**Fiber 计数监控**：定期检查活跃 Fiber 的数量。如果 Fiber 数量持续增长，即使在没有请求处理时也不下降，说明存在 Fiber 泄漏。建议设置 Fiber 数量的上限告警，当超过阈值时触发告警。

**内存使用监控**：监控堆内存使用量。如果内存使用持续增长，即使经过多次 GC 也不下降，说明存在内存泄漏。建议监控堆内存的增长趋势，计算增长率（MB/s），当增长率超过阈值时触发告警。

**锁等待时间监控**：监控锁获取的等待时间。如果等待时间持续增加，说明可能存在锁竞争或死锁。建议记录每次锁获取的等待时间，当平均等待时间超过阈值时触发告警。

**GC 活动监控**：监控垃圾回收的频率和持续时间。频繁的 GC 或长时间的 Stop-The-World 暂停通常意味着内存压力过大。

### 3.5 自动恢复机制

自动恢复机制可以在不人工干预的情况下从运行时问题中恢复：

**Fiber 回收**：当检测到 Fiber 泄漏时，可以强制中断长时间运行的 Fiber。这需要谨慎操作，因为强制中断可能导致数据不一致。

**锁超时重试**：当锁获取超时时，释放已持有的所有锁，等待随机时间后重试。这可以打破死锁的循环等待条件。

**资源池刷新**：当检测到资源泄漏时，可以刷新资源池，关闭所有现有连接并创建新的连接。这虽然会导致短暂的性能下降，但可以防止资源完全耗尽。

**优雅重启**：在极端情况下，可以触发应用程序的优雅重启。这包括完成当前正在处理的请求、关闭所有 Scope、然后重启应用程序。

## 4. 典型问题

### 4.1 Fork 未在 Scope 管理

**问题描述**：使用 Effect.fork 创建 Fiber 但没有将其关联到任何 Scope。这导致 Fiber 的生命周期不受管理，可能成为泄漏的 Fiber。

**代码示例**：
```typescript
// 错误的做法
const fiber = yield* _(Effect.fork(someEffect))
// fiber 没有被任何 Scope 管理

// 正确的做法
const fiber = yield* _(Effect.forkIn(scope, someEffect))
// fiber 的生命周期与 scope 绑定
```

**检测方法**：通过 Fiber.dump 检查活跃 Fiber 列表。如果发现大量 Fiber 处于"running"或"suspended"状态，且它们的创建位置不在任何 Scope 管理范围内，就说明存在未管理的 Fiber。

**修复方法**：将所有 Effect.fork 替换为 Effect.forkIn，并确保在适当的 Scope 中创建 Fiber。对于顶层 Fiber，使用 Effect.scoped 自动管理 Scope 的生命周期。

### 4.2 Fiber.dump 使用

**问题描述**：Fiber.dump 是检测 Fiber 泄漏的主要工具，但如果不正确使用，可能无法发现泄漏。

**正确使用方法**：
1. 在系统空闲时取基准快照
2. 在负载测试后取对比快照
3. 比较两个快照，找出持续存在的 Fiber
4. 分析这些 Fiber 的创建位置和状态

**注意事项**：
- Fiber.dump 返回的是快照，不是实时数据。两次调用之间创建的 Fiber 可能不会被捕获。
- Fiber.dump 的性能开销与活跃 Fiber 数量成正比。在生产环境中频繁调用可能影响性能。
- Fiber.dump 返回的 location 信息依赖于源映射（source map），在生产环境中需要确保源映射可用。

### 4.3 并发死锁排查

**问题描述**：多个 Fiber 互相等待对方释放锁资源，导致所有相关 Fiber 都无法继续执行。

**排查步骤**：
1. 使用 Fiber.dump 获取所有活跃 Fiber 的状态
2. 查找处于"suspended"状态的 Fiber
3. 分析这些 Fiber 的调用栈，找出它们正在等待的锁
4. 检查锁的获取顺序是否一致
5. 使用超时机制验证死锁假设

**预防措施**：
- 强制所有 Fiber 以相同的顺序获取锁
- 使用超时机制检测死锁
- 避免在持有锁时执行长时间操作
- 使用 Scope 管理锁的生命周期

### 4.4 Semaphore/Ref 锁顺序

**问题描述**：使用 Semaphore 或 Ref 实现锁时，如果 Fiber 以不同的顺序获取多个锁，就会发生死锁。

**Semaphore 死锁示例**：
```typescript
// Fiber 1
yield* _(semA.take)
yield* _(semB.take)  // 可能死锁

// Fiber 2
yield* _(semB.take)
yield* _(semA.take)  // 可能死锁
```

**Ref 死锁示例**：
```typescript
// 使用 Ref 实现的自旋锁也可能死锁
const lockA = yield* _(Ref.make(false))
const lockB = yield* _(Ref.make(false))
```

**解决方案**：
- 对所有锁进行排序，始终按相同顺序获取
- 使用 LockManager 等工具类自动管理锁顺序
- 使用 Effect.timeout 为锁获取操作添加超时

### 4.5 Effect.race 死锁超时

**问题描述**：Effect.race 在多个 Effect 之间进行竞态，但如果所有 Effect 都因为等待锁而无法完成，race 本身也会永久阻塞。

**解决方案**：
```typescript
const safeRace = <A, E>(
  effects: Array<Effect.Effect<A, E>>,
  timeout: Duration.Duration
) => pipe(
  effects.reduce((acc, e) => Effect.race(acc, e)),
  Effect.timeout(timeout),
  Effect.catchAll(error => handleTimeout(error))
)
```

**最佳实践**：
- 始终为 Effect.race 添加超时
- 记录超时时的 Fiber 状态用于诊断
- 实现优雅的降级逻辑
- 考虑使用 Effect.raceFirst 替代 Effect.race（如果只需要第一个成功的结果）

## 5. 必备知识

### 5.1 Effect-TS Fiber 模型

Effect-TS 的 Fiber 模型基于以下几个核心概念：

**Fiber 的定义**：Fiber 是 Effect-TS 中最小的并发执行单元。每个 Fiber 执行一个 Effect，可以与其他 Fiber 并发执行。Fiber 是协作式调度的，这意味着它们必须主动让出执行权。

**Fiber 的创建**：通过 Effect.fork 或 Effect.forkIn 创建 Fiber。fork 创建独立 Fiber，forkIn 创建受 Scope 管理的 Fiber。

**Fiber 的通信**：Fiber 之间可以通过 Queue、Ref 和 Deferred 等数据结构进行通信。Queue 提供了一对多的生产者-消费者模式，Ref 提供了共享状态，Deferred 提供了一次性的结果传递。

**Fiber 的中断**：Fiber 可以被中断（interrupt）。中断是协作式的，Fiber 在安全点检查中断信号。中断信号会从父 Fiber 传播到子 Fiber。

**Fiber 的监控**：通过 Fiber.dump 可以获取所有活跃 Fiber 的快照。每个 Fiber 的信息包括 id、状态、创建位置和当前执行位置。

### 5.2 Scope 与资源管理

Scope 是 Effect-TS 中管理资源生命周期的核心机制：

**Scope 的作用**：Scope 管理一组 Fiber 和资源的生命周期。当 Scope 关闭时，所有注册的 Fiber 被中断，所有资源被释放。

**Scope 的创建**：通过 Scope.make 创建 Scope，通过 Effect.scoped 自动管理 Scope。

**Scope 的嵌套**：Scope 可以嵌套，形成层次结构。外部 Scope 关闭时，内部 Scope 也被关闭。

**Scope 的使用模式**：
```typescript
// 自动管理
Effect.scoped(
  Effect.gen(function*(_) {
    const scope = yield* _(Scope.make())
    const fiber = yield* _(Effect.forkIn(scope, someEffect))
    // 自动清理
  })
)
```

### 5.3 并发原语

Effect-TS 提供了丰富的并发原语：

**Semaphore**：控制对有限资源的并发访问。Semaphore.make(n) 创建具有 n 个许可的信号量。

**Queue**：提供 Fiber 之间的消息传递。支持有界和无界队列，支持背压（backpressure）。

**Ref**：提供原子性的共享状态。支持原子读取、写入和修改操作。

**Deferred**：提供一次性的结果传递。一个 Fiber 等待 Deferred，另一个 Fiber 完成它。

**Promise**：Effect-TS 中的 Promise 是 Deferred 和 Fiber 的组合，用于与回调风格的 API 交互。

### 5.4 死锁的四个必要条件

死锁的发生需要同时满足以下四个条件：

**互斥（Mutual Exclusion）**：资源不能被多个 Fiber 同时使用。在 Effect-TS 中，Semaphore 的许可就是互斥的体现。

**持有并等待（Hold and Wait）**：Fiber 在持有至少一个资源的同时，等待获取其他 Fiber 持有的资源。这是死锁的核心条件。

**不可剥夺（No Preemption）**：资源不能被强制从持有它的 Fiber 中剥夺。在 Effect-TS 中，Semaphore 的许可是不可剥夺的，只有持有者才能释放。

**循环等待（Circular Wait）**：存在一组 Fiber {F1, F2, ..., Fn}，其中 F1 等待 F2 持有的资源，F2 等待 F3 持有的资源，...，Fn 等待 F1 持有的资源。

**预防策略**：打破上述任何一个条件即可预防死锁。最常用的策略是打破"循环等待"条件，通过强制所有 Fiber 以相同的顺序获取锁来实现。

### 5.5 内存泄漏检测工具

**Node.js 内置工具**：
- process.memoryUsage()：获取当前内存使用情况
- v8.getHeapStatistics()：获取 V8 堆统计信息
- v8.getHeapSpaceStatistics()：获取堆空间统计信息
- --trace-gc 标志：跟踪垃圾回收活动

**Chrome DevTools**：
- Memory 面板：拍摄堆快照，比较不同时间点的内存使用
- Performance 面板：记录内存使用随时间的变化
- Allocation instrumentation：记录内存分配的位置

**heapdump 模块**：
- 生成堆快照文件（.heapsnapshot）
- 可以在 Chrome DevTools 中加载分析
- 支持在特定时间点触发堆快照

**clinic.js**：
- clinic doctor：诊断性能问题
- clinic flame：生成火焰图
- clinic bubbleprof：分析异步操作

**Effect-TS 特定工具**：
- Fiber.dump：获取所有活跃 Fiber 的快照
- Effect.trace：启用 Effect 执行跟踪
- 自定义监控：基于 Fiber.dump 和 process.memoryUsage() 构建监控系统

## 6. 示例代码

### 6.1 Fiber 泄漏检测

文件：`examples/01-basic/fiber-leak-detection.ts`

这个示例演示了：
- 使用 Effect.fork 创建未管理的 Fiber（泄漏场景）
- 使用 Effect.forkIn 在 Scope 中创建受管理的 Fiber
- 使用 Fiber.dump 检测活跃 Fiber
- 使用 Scope 自动清理 Fiber
- 模拟 Fiber 泄漏场景并观察 Fiber 数量的变化

关键代码分析：
```typescript
// 泄漏的 Fiber - 没有 Scope 管理
const leaked = yield* _(
  pipe(
    Effect.sync(() => "leaked"),
    Effect.fork  // 没有 Scope！
  )
)

// 受管理的 Fiber - 在 Scope 中创建
const managed = yield* _(
  pipe(
    Effect.sync(() => "managed"),
    Effect.forkIn(scope)  // 在 Scope 中管理
  )
)
```

运行这个示例可以观察到：在 Scope 关闭后，受管理的 Fiber 被自动中断，而泄漏的 Fiber 仍然存在。

### 6.2 死锁检测与恢复

文件：`examples/01-basic/deadlock-detection.ts`

这个示例演示了：
- 使用 Semaphore 实现锁
- 不正确的锁顺序导致死锁
- 使用 Effect.timeout 检测死锁
- 一致的锁顺序预防死锁
- 使用 Ref 实现自定义锁

关键代码分析：
```typescript
// 死锁场景：Fiber 1 获取 A 然后 B，Fiber 2 获取 B 然后 A
const fiber1 = yield* _(Effect.fork(
  Effect.gen(function*(_) {
    yield* _(semA.take)  // 持有 A
    yield* _(Effect.sleep("100 millis"))
    yield* _(semB.take)  // 等待 B（被 Fiber 2 持有）
  })
))

const fiber2 = yield* _(Effect.fork(
  Effect.gen(function*(_) {
    yield* _(semB.take)  // 持有 B
    yield* _(Effect.sleep("100 millis"))
    yield* _(semA.take)  // 等待 A（被 Fiber 1 持有）
  })
))
```

运行这个示例可以观察到：两个 Fiber 互相等待，形成死锁。通过 Effect.timeout 可以检测到死锁并执行恢复逻辑。

### 6.3 高级 Fiber 转储分析

文件：`examples/02-advanced/fiber-dump-analyzer.ts`

这个示例提供了一个完整的 Fiber 转储分析工具，包括：
- 快照管理：记录多个时间点的 Fiber 状态
- 泄漏分析：比较连续快照，找出持续存在的 Fiber
- 状态分布报告：按状态统计 Fiber 数量
- 趋势分析：分析 Fiber 数量随时间的变化趋势
- 持续监控：定期检查 Fiber 状态

关键功能：
```typescript
class FiberDumpAnalyzer {
  private snapshots: Array<Fiber.FiberDump> = []
  
  async takeSnapshot(): Promise<void> {
    const dump = await Effect.runPromise(Fiber.dump)
    this.snapshots.push(dump)
  }
  
  analyzeLeaks(): void {
    // 比较连续快照，找出持续存在的 Fiber
    const prevIds = new Set(prev.map(f => f.id))
    const persistentFibers = curr.filter(f => prevIds.has(f.id))
    // 这些持续存在的 Fiber 可能是泄漏
  }
}
```

### 6.4 死锁检测器

文件：`examples/02-advanced/deadlock-detector.ts`

这个示例提供了一个生产级的死锁检测器，包括：
- 锁顺序跟踪：记录每个锁的获取顺序
- 超时检测：为锁获取操作设置超时
- 自动恢复：检测到死锁时释放已持有的锁
- 锁管理器：自动排序锁的获取顺序
- 验证功能：检查锁顺序是否一致

关键功能：
```typescript
class DeadlockDetector {
  withLock<T>(label: string, semaphore: Semaphore.Semaphore, order: number, effect: Effect.Effect<T>) {
    return pipe(
      semaphore.take,
      Effect.timeout(this.timeout),  // 超时检测
      Effect.catchAll(() => this.recover(label)),  // 自动恢复
      Effect.flatMap(() => effect),
      Effect.ensuring(semaphore.release)  // 确保释放
    )
  }
}
```

### 6.5 内存监控系统

文件：`examples/03-production/memory-leak-monitor.ts`

这个示例提供了一个生产级的内存泄漏监控系统，包括：
- Fiber 计数监控：跟踪活跃 Fiber 数量
- 堆内存监控：跟踪堆内存使用量
- 趋势分析：计算 Fiber 和内存的增长趋势
- 告警阈值：设置并检查告警阈值
- 堆快照管理：记录和比较堆快照

关键功能：
```typescript
class MemoryLeakMonitor {
  monitor(): Effect.Effect<void> {
    const check = pipe(
      Fiber.dump,
      Effect.flatMap(fibers => {
        const heap = process.memoryUsage().heapUsed / 1024 / 1024
        this.snapshotHistory.push({ time: Date.now(), fibers: fibers.length, heap })
        return this.checkAlerts(fibers)
      })
    )
    return pipe(check, Effect.repeat(Schedule.fixed("10 seconds")), Effect.forever)
  }
}
```

### 6.6 竞态超时处理

文件：`examples/03-production/effect-race-timeout.ts`

这个示例提供了多种 Effect.race 的超时处理策略，包括：
- 基本超时：为 Effect.race 添加超时
- 胜者追踪：记录哪个 Effect 赢得了竞态
- 降级策略：超时时使用默认值
- 重试机制：超时后自动重试
- 进度报告：定期报告竞态进度

关键功能：
```typescript
const raceWithTimeout = <A, E>(
  effects: Array<Effect.Effect<A, E>>,
  timeout: Duration.Duration = "30 seconds"
) => {
  const raced = effects.reduce((acc, effect) => Effect.race(acc, effect))
  return pipe(
    raced,
    Effect.timeout(timeout),
    Effect.catchAll(error => handleTimeout(error))
  )
}
```

## 7. 最佳实践总结

### 7.1 开发阶段

1. **始终使用 Scope 管理 Fiber**：所有 Effect.fork 调用都应该替换为 Effect.forkIn，并确保在适当的 Scope 中创建 Fiber。

2. **使用 Effect.scoped**：对于需要资源管理的操作，始终使用 Effect.scoped 自动管理 Scope 的生命周期。

3. **一致的锁顺序**：在使用多个 Semaphore 时，始终以相同的顺序获取它们。可以使用 LockManager 等工具类自动强制执行。

4. **添加超时**：为所有可能阻塞的操作添加超时，包括锁获取、Effect.race 和外部服务调用。

5. **编写测试**：编写并发测试，验证 Fiber 不会泄漏，锁不会导致死锁。

### 7.2 测试阶段

1. **负载测试**：使用负载测试工具模拟高并发场景，观察 Fiber 数量和内存使用情况。

2. **泄漏检测**：在负载测试前后使用 Fiber.dump 比较 Fiber 数量，检测是否存在泄漏。

3. **死锁测试**：编写特定的测试用例，验证锁顺序是否正确，超时机制是否有效。

4. **内存分析**：使用 heapdump 或 Chrome DevTools 分析堆快照，查找内存泄漏。

### 7.3 生产阶段

1. **持续监控**：部署 Fiber 计数和内存使用的监控系统，设置告警阈值。

2. **日志记录**：记录 Fiber 创建和销毁的日志，便于事后分析。

3. **自动恢复**：实现自动恢复机制，在检测到泄漏或死锁时自动执行恢复操作。

4. **定期分析**：定期分析 Fiber.dump 输出和内存使用趋势，及时发现潜在问题。

5. **容量规划**：根据监控数据规划系统容量，确保有足够的资源应对峰值负载。

## 8. 常见问题解答

### Q: 如何判断一个 Fiber 是否泄漏？

A: 通过 Fiber.dump 获取 Fiber 快照。如果同一个 Fiber（相同的 id）在多个快照中都存在，且其状态不是"done"，那么它可能是泄漏的。特别关注那些状态为"running"或"suspended"且长时间不变的 Fiber。

### Q: Effect.race 和 Effect.raceFirst 有什么区别？

A: Effect.race 返回第一个完成的 Effect 的结果，无论成功还是失败。Effect.raceFirst 只返回第一个成功的结果，如果第一个完成的 Effect 失败了，它会等待下一个。在死锁检测场景中，Effect.race 更常用，因为它能更快地返回结果。

### Q: Scope 和 Fiber 的关系是什么？

A: Scope 是 Fiber 的容器。一个 Scope 可以包含多个 Fiber，当 Scope 关闭时，所有包含的 Fiber 都会被中断。Fiber 通过 Effect.forkIn 注册到 Scope 中。Scope 提供了批量管理 Fiber 生命周期的能力。

### Q: 如何设置合理的超时时间？

A: 超时时间应该基于业务 SLA 和实际运行数据。一般建议从 SLA 的 1/3 开始，然后根据实际运行数据调整。对于锁获取操作，超时时间应该足够长以允许正常的等待，但又足够短以在死锁发生时及时检测。

### Q: 生产环境中 Fiber.dump 的性能影响大吗？

A: Fiber.dump 的性能开销与活跃 Fiber 数量成正比。在 Fiber 数量较少（<1000）时，开销可以忽略。在 Fiber 数量较多时，建议降低采样频率（例如每 60 秒一次），并避免在高负载时调用。

## 9. 参考资源

- Effect-TS 官方文档：https://effect.website/
- Effect-TS Fiber API：https://effect.website/docs/fibers/
- Effect-TS Scope API：https://effect.website/docs/resource-management/scope/
- Effect-TS Semaphore API：https://effect.website/docs/concurrency/semaphore/
- Node.js 内存分析：https://nodejs.org/en/docs/guides/diagnostics/memory/
- Chrome DevTools 内存分析：https://developer.chrome.com/docs/devtools/memory/
