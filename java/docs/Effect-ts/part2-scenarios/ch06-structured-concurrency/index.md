# 第六章：高并发控制与结构化并发

假设你需要并发请求 100 个外部 API 获取用户数据。你的第一反应可能是 `Promise.all`：

```typescript
// 风险版本：一个失败，满盘皆输
const users = await Promise.all(
  userIds.map((id) => fetch(`/api/users/${id}`))
)
```

这段代码简洁，但藏着一颗定时炸弹——如果第 37 个请求失败了，`Promise.all` 会整体 reject，所有已经成功返回的结果都化为乌有。而且你无法取消那些还在路上的请求，它们在服务器上继续执行，浪费带宽和计算资源。

更糟糕的是，如果用户早在第 2 个请求返回时就离开了页面，`Promise.all` 依然会跑完剩下的 98 个请求。你尝试用 `AbortController` 来取消：

```typescript
const controller = new AbortController()

// 用户离开页面
window.addEventListener("beforeunload", () => controller.abort())

const users = await Promise.all(
  userIds.map((id) =>
    fetch(`/api/users/${id}`, { signal: controller.signal })
  )
)
```

到这里，你已经写了超出期待的样板代码，而 `AbortController` 只对 fetch 生效——对于数据库查询、文件读取、计算密集型任务，原生 Promise 根本没有通用的取消机制。更不用说控制并发数、超时处理、错误隔离这些需求了。

这正是 Effect-TS 结构化并发模型要解决的痛点。它从底层重新设计了并发原语，让取消、限流、资源清理成为一等公民，而不再是你需要手动拼凑的"事后补救"方案。

---

### 使用场景

结构化并发并非银弹，但它在以下四类场景中优势极其明显。

#### 批量 API 请求

这是最直观的使用场景。无论是聚合用户详情、拉取订单列表，还是批量调用第三方服务，你都需要在短时间内发出大量网络请求。核心挑战是：控制并发数以保护下游服务和自己，同时处理部分失败的弹性降级。

```typescript
// 用 Semaphore 控制并发 + 超时兜底 + 错误隔离
const safeFetchUsers = (ids: string[]): Effect.Effect<User[], FetchError> =>
  Effect.gen(function* (_) {
    const sem = yield* _(Effect.makeSemaphore(20)) // 最多 20 个并发
    const tasks = ids.map((id) =>
      sem.withPermits(1)(
        fetchUser(id).pipe(
          Effect.timeout("3 seconds"),
          Effect.catchAll((e) => Effect.succeed(null as unknown as User)),
        )
      )
    )
    const results = yield* _(Effect.all(tasks, { concurrency: "unbounded" }))
    return results.filter((u): u is User => u !== null)
  })
```

注意这里的模式：`Semaphore` 控制发送速率，`Effect.timeout` 防止单请求挂死，`Effect.catchAll` 做错误隔离，`Effect.all` 的 `"unbounded"` 并发配合 Semaphore 实现精确限流。每一项都可以独立组合，互不干扰。

#### 微服务聚合层

API Gateway 或 BFF（Backend For Frontend）层经常需要从多个下游服务聚合数据。用户请求页面时，Gateway 同时请求用户服务、订单服务、推荐服务，然后组合结果返回。这里的问题是：如果推荐服务响应慢（甚至超时），是否应当阻塞整个页面渲染？

```typescript
// 聚合层：允许部分失败
const aggregatePage = Effect.gen(function* (_) {
  const [profile, orders, recommendations] = yield* _(
    Effect.all({
      profile: fetchUserProfile().pipe(Effect.timeout("2 seconds")),
      orders: fetchUserOrders().pipe(Effect.timeout("3 seconds")),
      recommendations: fetchRecommendations()
        .pipe(Effect.timeout("1 second"))
        .pipe(Effect.catchAll(() => Effect.succeed([]))),
    }),
    { concurrency: 3 },
  )
  return { profile, orders, recommendations }
})
```

`Effect.all` 接收对象类型并保持并发执行，这是 Effect-TS 的一个细节优势——不需要像 `Promise.all` 那样在对象上用 `Promise.all(Object.values())` 然后再重新映射回 key。

#### 实时数据处理

WebSocket 消息推送、日志流处理、股票行情分析这类场景需要处理高吞吐的持续数据流。每一条消息可能触发一系列异步操作：写入数据库、更新缓存、推送通知。这里的关键不是单批任务的并发，而是如何在消息之间和消息内部都保持有序的并发控制。

```typescript
// 实时数据处理：每条消息的处理内部可以并发，消息之间串行
const processStream = (stream: Stream<Message, never, never>) =>
  stream.pipe(
    Stream.mapEffect((msg) =>
      Effect.gen(function* (_) {
        const [db, cache, notify] = yield* _(
          Effect.all(
            [
              writeToDB(msg),
              updateCache(msg),
              sendNotification(msg),
            ],
            { concurrency: 3 },
          ),
        )
        return { db, cache, notify }
      }),
    ),
    Stream.runCollect,
  )
```

`Stream.mapEffect` 单条消息内部开启三个并发任务，下一条消息要等上一条完全处理完成才开始——这正是结构化并发最自然的表达方式。

#### 并行计算

数据处理管道、ETL 任务、图像处理和机器学习推理中，经常需要将数据分片后并行处理，再聚合结果。这类场景对并发度的控制要求更高——过低的并发度浪费 CPU，过高的并发度导致缓存抖动和上下文切换。

```typescript
// 分片并行计算
const parallelMap = <A, B>(
  items: A[],
  f: (item: A, index: number) => Effect.Effect<B>,
  parallelism: number,
): Effect.Effect<B[]> =>
  Effect.forEach(items, (item, i) => f(item, i), {
    concurrency: parallelism,
  })
```

这里 `parallelism` 通常设置为 CPU 核心数或略高于核心数，具体取决于任务类型（CPU 密集型还是 IO 密集型）。

---

### 实现原理

理解 Effect-TS 结构化并发的底层机制，有助于写出更安全、更高效的并发代码。其核心在于三层抽象：Fiber（执行单元）、Scope（生命周期管理）和 Semaphore（限流原语）。

#### Fiber：用户态轻量线程

Fiber 是 Effect-TS 中"可中断的执行单元"。它与操作系统线程的关键区别在于：

| 维度 | 系统线程 | Effect Fiber |
|------|---------|-------------|
| 创建开销 | ~1MB 栈空间 | 几十字节堆对象 |
| 最大数量 | 数千 | 数百万 |
| 调度单位 | 内核抢占 | 用户态协作式 |
| 上下文切换 | 微秒级（系统调用） | 纳秒级（函数调用） |
| 中断机制 | 不可靠（`Thread.stop` 已废弃） | 安全、可组合 |
| 资源清理 | try/finally 显式处理 | 自动集成 Scope |

Fiber 之所以"轻量"，是因为它的"栈"不是操作系统预留的连续内存，而是 Effect 运行时用异步状态机模拟的执行上下文。每当你 `yield*` 一个 Effect，当前 Fiber 会挂起，运行时调度其他就绪的 Fiber，等结果返回后再恢复执行——这一切都在单个 JavaScript 微任务循环中完成。

```typescript
// 每个 Effect 都在一个 Fiber 中执行
const example = Effect.gen(function* (_) {
  // 当前 Fiber 在跑
  const fiber = yield* _(Effect.fork(anotherEffect))
  // 这里开启了一个新 Fiber
  const result = yield* _(Fiber.join(fiber))
  // 当前 Fiber 阻塞等待子 Fiber 完成
  return result
})
```

#### 结构化并发：父 Fiber 管理子 Fiber

结构化并发的核心思想是：**Fiber 的生命周期不能超过创建它的作用域**。这听起来简单，但带来了三个极其有力的推论：

1. **父 Fiber 中断时，子 Fiber 自动中断**——不会出现孤儿 Fiber
2. **父 Fiber 等待所有子 Fiber 完成后才能退出**——不会出现资源泄漏
3. **子 Fiber 的失败可以冒泡到父 Fiber**——错误不会静默丢弃

```typescript
// 结构化生命周期演示
const structuredDemo = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(
    Effect.gen(function* (_) {
      // 子 Fiber 逻辑
      yield* _(Effect.sleep("10 seconds"))
      return "done"
    }),
  ))

  // 如果这里父 Fiber 被中断（超时、取消等），
  // 子 Fiber 也会自动中断——不需要手动清理

  yield* _(Effect.sleep("1 second"))
  yield* _(Fiber.interrupt(fiber)) // 即使手动中断，也是安全的
})
```

这个模型借鉴了 Erlang/OTP 的 Actor 模型和 Java 虚拟线程的设计思路。Effect-TS 的实现在 JavaScript 生态中独树一帜，因为它不只是"模拟"了并发，而是从类型系统的角度保证了生命周期绑定的正确性。

#### Scope：生命周期的容器

`Scope` 是 Effect-TS 中管理 Fiber 生命周期的核心抽象。每个 `Scope` 是一组 Fiber 的集合，当 Scope 结束时，集合内的所有 Fiber 都被中断，所有通过 `Effect.acquireRelease` 注册的清理函数都被执行。

```typescript
// Scope 自动管理子 Fiber 生命周期
const scopedWork = Effect.scoped(
  Effect.gen(function* (_) {
    // 在这个 Scope 内 fork 的所有 Fiber
    // 在 Scope 结束时自动中断
    const fiber1 = yield* _(Effect.fork(task1))
    const fiber2 = yield* _(Effect.fork(task2))
    // 用的时候 join，不用的时候 Scope 负责清理
    return yield* _(Fiber.join(fiber1))
  }),
)
```

`Effect.scoped` 创建了一个新 Scope，当内部 Effect 完成时（无论成功还是失败），Scope 自动关闭。如果要让 Scope 跨越多个调用，可以使用 `Scope.extend`。

#### Semaphore：信号量限流

Semaphore 是控制并发访问共享资源的标准并发原语。Effect-TS 的 Semaphore 与 Fiber 模型深度集成：

```typescript
// Semaphore 的内部工作原理
const semDemo = Effect.gen(function* (_) {
  const sem = yield* _(Effect.makeSemaphore(3))

  // withPermits 内部逻辑（简化版）：
  // 1. 尝试获取 n 个许可
  // 2. 许可不足时，当前 Fiber 挂起，进入等待队列
  // 3. 许可充足时，继续执行 Effect
  // 4. Effect 完成后（或中断时），自动释放许可
  // 5. 唤醒等待队列中的下一个 Fiber

  const task = (id: number) =>
    sem.withPermits(1)(
      Effect.gen(function* (_) {
        console.log(`任务 ${id} 开始`)
        yield* _(Effect.sleep("1 second"))
        console.log(`任务 ${id} 结束`)
      }),
    )

  yield* _(
    Effect.all([1, 2, 3, 4, 5].map(task), { concurrency: "unbounded" }),
  )
  // 同时最多 3 个任务在执行，其余 2 个等待
})
```

关键点在于：Semaphore 的等待不会阻塞线程，而是挂起 Fiber。挂起的 Fiber 不消耗 CPU 资源，运行时会在许可可用时自动恢复执行。

---

### 潜在风险

结构化并发虽然大幅降低了复杂度，但并非免于犯错。以下是 Effect-TS 并发编程中最容易踩的五个坑。

#### Fiber 泄漏

最常见的问题：你 fork 了一个 Fiber 但忘记 join 或 interrupt，导致它在后台永远运行。

```typescript
// 错误示范：Fiber 泄漏
const leakyFunction = Effect.gen(function* (_) {
  // 这个 Fiber 被 fork 到后台，但没有被 join
  yield* _(Effect.fork(heavyComputation))

  // 函数返回了，但 heavyComputation 还在后台运行
  return "done"
  // 😱 heavyComputation 无法被取消，成为了孤儿 Fiber
})
```

如果 `leakyFunction` 被调用 1000 次，就会产生 1000 个不可控的后台任务，逐渐耗尽内存和 CPU。

**根因**：`Effect.fork` 默认将子 Fiber 附着到当前 *Scope* 而非当前 *Fiber*。如果当前 Scope 没有结束（例如最外层的应用 Scope），这些 Fiber 将永远运行。

```typescript
// 正确的做法：使用 forkScoped 显式声明生命周期
const correctFunction = Effect.scoped(
  Effect.gen(function* (_) {
    // forkScoped 将 Fiber 绑定到最近的 Scope
    const fiber = yield* _(Effect.forkScoped(heavyComputation))
    // Scope 结束时，这个 Fiber 会被自动中断
    return "done"
  }),
)
```

或者更常见的模式——如果你需要等待结果，直接 `join`：

```typescript
const joinedFunction = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(heavyComputation))
  const result = yield* _(Fiber.join(fiber)) // 等它完成
  return result
})
```

#### 惊群效应：无限制 Fork

当你 fork 大量 Fiber 时，即使每个 Fiber 很轻量，数量级带来的冲击也会压垮系统。

```typescript
// 错误示范：无限制 fork
const fetchAllUsers_unbounded = (userIds: string[]) =>
  Effect.gen(function* (_) {
    // userIds 有 10 万个——瞬间 fork 10 万个 Fiber！
    const fibers = yield* _(
      Effect.all(
        userIds.map((id) => Effect.fork(fetchUser(id))),
        { concurrency: "unbounded" },
      ),
    )
    return yield* _(Effect.all(fibers.map((f) => Fiber.join(f))))
  })
```

这段代码秒级创建 10 万个 Fiber，每个 Fiber 都会发起一个 HTTP 请求。对于目标 API 服务器来说，这就是突发的 DDOS 攻击。如果 API 有限流，大量请求会被返回 429/503，大量 Fiber 也会被浪费——这就是"惊群效应"（Thundering Herd）。

```typescript
// 正确的做法：Semaphore 限流
const fetchAllUsers_throttled = (userIds: string[]) =>
  Effect.gen(function* (_) {
    const sem = yield* _(Effect.makeSemaphore(50))

    const tasks = userIds.map((id) =>
      sem.withPermits(1)(fetchUser(id))
    )
    // 虽然用了 unbounded，但 Semaphore 限制实际并发
    return yield* _(Effect.all(tasks, { concurrency: "unbounded" }))
  })
```

#### Semaphore 死锁

当你嵌套使用同一个 Semaphore 时，如果外层已经占用了大部分许可，内层请求可能永远得不到满足。

```typescript
// 错误示范：Semaphore 死锁
const deadlockDemo = Effect.gen(function* (_) {
  const sem = yield* _(Effect.makeSemaphore(2))

  const outerTask = sem.withPermits(2)(
    Effect.gen(function* (_) {
      // 外层占用了 2 个许可（全部）
      yield* _(Effect.sleep("100 millis"))

      // 内层请求 1 个许可——但许可已经用完了！
      // 当前 Fiber 被挂起等待，但它自己持有 2 个许可没有释放
      // 形成死锁
      return yield* _(sem.withPermits(1)(
        Effect.succeed("inner"),
      ))
    }),
  )

  return yield* _(outerTask)
  // 😱 永远卡在这里
})
```

你可以理解为：Semaphore 是"锁"，不是"配额"。如果你需要限制总并发量并在内部处理子任务，应该使用更细粒度的许可分配，或者用 `Effect.all({ concurrency: n })` 替代嵌套 Semaphore。

#### Effect.all 超时配置

`Effect.all` 本身没有超时参数，需要你手动为每个子任务添加超时，或者用 `Effect.timeout` 包裹 `Effect.all`。

```typescript
// 错误示范：整体超时会中断已完成的任务
const wrongTimeout = Effect.gen(function* (_) {
  return yield* _(
    Effect.all([task1, task2, task3], { concurrency: 3 }),
    Effect.timeout("3 seconds"),
    // 😱 如果 3 秒后 task1 已完成，task2 还在跑，Effect.timeout 会中断全部
    // 包括已经完成的任务的清理过程也可能被中断
  )
})

// 正确的做法：为每个任务单独设置超时
const correctTimeout = Effect.gen(function* (_) {
  return yield* _(
    Effect.all(
      [
        task1.pipe(Effect.timeout("3 seconds")),
        task2.pipe(Effect.timeout("3 seconds")),
        task3.pipe(Effect.timeout("3 seconds")),
      ],
      { concurrency: 3 },
    ),
  )
})
```

第二个版本中，单个任务超时不影响其他任务，超时的任务以失败告终，而 `mode: "either"` 可以进一步隔离这种失败。

#### 错误传播与吞没

`Fiber.join` 会传播子 Fiber 的失败。如果你 fork 了一个 Fiber 但没有 join 它，子 Fiber 的错误会被默默吞没。

```typescript
// 错误示范：吞没子 Fiber 错误
const silentFailure = Effect.gen(function* (_) {
  yield* _(Effect.fork(
    Effect.gen(function* (_) {
      // 这个错误不会被任何人捕获
      yield* _(Effect.fail(new Error("崩溃了")))
    }),
  ))

  // 父 Fiber 正常执行，子 Fiber 在后台静默失败
  yield* _(Effect.sleep("1 second"))
  return "看起来一切正常..."
  // 😱 子 Fiber 的错误信息被永久丢失
})
```

正确的做法是至少记录错误，或者使用 `Fiber.await` 检查退出状态：

```typescript
const withErrorLogging = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(
    riskyTask.pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => console.error("子 Fiber 失败:", e))
      ),
    ),
  ))

  // 或者用 await 检查 Exit 状态
  const exit = yield* _(Fiber.await(fiber))
  yield* _(Exit.match(exit, {
    onSuccess: (v) => Effect.sync(() => console.log("成功:", v)),
    onFailure: (cause) =>
      Effect.sync(() => console.error("失败原因:", cause)),
  }))
})
```

---

### 优化策略

理解风险之后，我们来讨论如何写出既安全又高效的并发代码。

#### Fork-Join 模式

这是结构化并发最基础、最可靠的模式。适用于"并发执行 N 个任务，等待所有任务完成"的场景。

```typescript
// 标准 Fork-Join 模式
const forkJoin = <A, B>(
  tasks: (() => Effect.Effect<A>)[],
  concurrency: number,
): Effect.Effect<A[]> =>
  Effect.forEach(tasks, (task) => Effect.suspend(task), {
    concurrency,
  })
```

`Effect.forEach` 本质上就是 fork-join 的声明式版本。当你需要更精细的控制（例如在任务进行中逐步汇报进度），可以退回到手动 fork-join：

```typescript
// 带进度汇报的 Fork-Join
const forkJoinWithProgress = <A>(
  tasks: Effect.Effect<A>[],
  onProgress: (completed: number, total: number) => Effect.Effect<void>,
): Effect.Effect<A[]> =>
  Effect.gen(function* (_) {
    const total = tasks.length
    const results: A[] = []

    for (let i = 0; i < total; i++) {
      const fiber = yield* _(Effect.fork(tasks[i]))
      const result = yield* _(Fiber.join(fiber))
      results.push(result)
      yield* _(onProgress(i + 1, total))
    }

    return results
  })
```

这个模式不要滥用——如果你的场景只是"等所有任务完成"，`Effect.forEach` 或 `Effect.all` 更简单、更安全。手动 fork-join 的适用场景是：你需要在每个子任务完成后做点事情（比如汇报进度、更新 UI、写入中间结果）。

#### Fiber 池化

高频创建和销毁 Fiber 会产生开销。如果你需要反复执行相同类型的并发任务，可以考虑维持一个 Fiber 池。

```typescript
// 简单的 Fiber 池封装
interface FiberPool<A> {
  readonly execute: (task: Effect.Effect<A>) => Effect.Effect<A>
  readonly shutdown: Effect.Effect<void>
}

const makeFiberPool = <A>(
  size: number,
): Effect.Effect<FiberPool<A>> =>
  Effect.gen(function* (_) {
    // 使用 Queue 实现工作队列
    const queue = yield* _(Queue.bounded<Effect.Effect<A>>(size))

    // 启动固定数量的 Worker Fiber
    const workers = Array.from({ length: size }, () =>
      Effect.fork(
        Effect.gen(function* (_) {
          while (true) {
            const task = yield* _(queue.take)
            yield* _(task)
          }
        }),
      ),
    )

    yield* _(Effect.all(workers, { concurrency: size }))

    return {
      execute: (task: Effect.Effect<A>) =>
        Effect.gen(function* (_) {
          const deferred = yield* _(Deferred.make<never, A>())
          yield* _(queue.offer(task))
          return yield* _(Deferred.await(deferred))
        }),
      shutdown: Effect.all(
        workers.map((f) => Fiber.interrupt(f)),
        { concurrency: size },
      ),
    }
  })
```

> **注意**：在大多数应用场景中，`Effect.forEach` 的 `{ concurrency }` 参数已经足够高效，它的内部实现已经做了 Fiber 调度优化。Fiber 池只有在任务创建频率极高（每秒数千次）且任务本身很短时才有意义。

#### Semaphore + Effect.timeout 组合

同时控制并发度和单个任务响应时间是生产级应用的标配。

```typescript
// Semaphore + Timeout 组合
const throttledWithTimeout = <A, E>(
  tasks: Effect.Effect<A, E>[],
  concurrency: number,
  timeout: Duration.DurationInput,
): Effect.Effect<A[], E> =>
  Effect.gen(function* (_) {
    const sem = yield* _(Effect.makeSemaphore(concurrency))

    return yield* _(
      Effect.all(
        tasks.map((task) =>
          sem.withPermits(1)(
            task.pipe(Effect.timeout(timeout)),
          ),
        ),
        { concurrency: "unbounded" },
      ),
    )
  })
```

这里 `Effect.all` 的 `"unbounded"` 和 Semaphore 的 `concurrency` 形成了双层控制：外层 `Effect.all` 确保所有任务都被调度，内层 Semaphore 确保实际执行的并发数不超过限制。这种组合比 `Effect.all({ concurrency: n })` 更灵活——因为 Semaphore 可以在不同的代码路径中共享。

#### 资源清理优先级

当多个 Fiber 并发执行且都需要资源清理时，确保清理操作的执行顺序不影响正确性。

```typescript
// 安全的并发资源清理
const concurrentResourceDemo = Effect.scoped(
  Effect.gen(function* (_) {
    const acquire = (name: string) =>
      Effect.addFinalizer(() =>
        Effect.sync(() => console.log(`清理 ${name}`))
      ).pipe(Effect.as(name))

    const fiber1 = yield* _(Effect.forkScoped(acquire("资源 A")))
    const fiber2 = yield* _(Effect.forkScoped(acquire("资源 B")))

    const a = yield* _(Fiber.join(fiber1))
    const b = yield* _(Fiber.join(fiber2))

    // 使用 a 和 b...

    return [a, b]
    // Scope 结束时，资源 B 和资源 A 的清理函数都会执行
    // 不需要关心顺序——清理是无副作用的
  }),
)
```

---

### 典型问题处理

将前面讨论的原则落实到具体的编码模式中。

#### 场景一：超时后优雅降级

```typescript
const fetchWithDegradation = (
  primary: Effect.Effect<Data>,
  fallback: Effect.Effect<Data>,
  timeout: Duration.DurationInput,
): Effect.Effect<Data> =>
  primary.pipe(
    Effect.timeout(timeout),
    Effect.catchAll(() => fallback),
    // 优雅降级：主服务超时 → 备用服务兜底
  )
```

#### 场景二：并发任务中的部分失败处理

```typescript
const processBatchWithPartialFailure = (
  items: Item[],
): Effect.Effect<{ successes: Item[]; failures: Error[] }> =>
  Effect.gen(function* (_) {
    const results = yield* _(
      Effect.all(
        items.map((item) =>
          processItem(item).pipe(Effect.either),
        ),
        { concurrency: 5 },
      ),
    )

    const successes: Item[] = []
    const failures: Error[] = []

    for (const result of results) {
      if (result._tag === "Right") {
        successes.push(result.right)
      } else {
        failures.push(result.left)
      }
    }

    return { successes, failures }
  })
```

`Effect.either` 将 Effect 的失败转换为 `Either` 类型，从而在 `Effect.all` 中隔离每个任务的失败。

#### 场景三：动态并发数调整

```typescript
const adaptiveConcurrency = <A, E>(
  tasks: Effect.Effect<A, E>[],
  maxConcurrency: number,
  minConcurrency: number,
): Effect.Effect<A[], E> =>
  Effect.gen(function* (_) {
    // 根据任务数量动态调整并发度
    const concurrency = Math.min(
      Math.max(minConcurrency, tasks.length),
      maxConcurrency,
    )

    return yield* _(
      Effect.all(tasks, { concurrency }),
    )
  })
```

---

### 开发者技能

如果你刚从 Promise 生态迁移到 Effect-TS 的结构化并发模型，以下三个认知转换能帮你更快适应。

#### 从"事件驱动"到"结构驱动"

Promise 世界的并发是事件驱动的：你创建 Promise，它们"自动"开始执行，你通过 `.then()` 或 `await` 订阅结果。控制流是隐式的——你无法轻松地暂停、取消或检查一个 Promise 的进度。

Effect-TS 的并发是结构驱动的：Fiber 的执行和生命周期由其所属的 Scope 决定。你不需要"事后取消"，而是从一开始就定义了生命周期边界。"取消"是 Scope 关闭的自然结果，而不是一次特殊的操作。

| 维度 | Promise 世界 | Effect-TS |
|------|-------------|-----------|
| 启动方式 | 创建即启动 | fork 才启动 |
| 取消机制 | AbortController（仅 fetch） | Fiber.interrupt（通用） |
| 错误隔离 | 手动 try/catch 分区 | mode: "either" / Effect.either |
| 生命周期 | 无绑定（可能泄漏） | Scope 自动管理 |
| 并发控制 | 第三方库（p-limit, async） | 内置 Semaphore + concurrency |
| 资源清理 | 依赖 finally 块 | Finalizer 自动注册 |

#### 掌握 Fiber 的三条黄金法则

1. **每个 fork 都要有一个 join 或 interrupt**——否则就是泄漏
2. **善用 forkScoped**——当 Fiber 需要跨越当前函数作用域时，显式绑定到 Scope
3. **不在 Effect 外部操作 Fiber**——所有 Fiber 操作都应在 Effect 上下文内完成

#### 从"并发数"思维转向"许可数"思维

使用 `Effect.all({ concurrency: 5 })` 时，你在思考"同时跑几个任务"。使用 Semaphore 时，你应当思考"我有几个许可"。许可可以跨多个代码路径共享，而 concurrency 参数只能作用域于一次 `Effect.all` 调用。

```typescript
// 共享 Semaphore 实现全局限流
const globalSemaphore = Effect.makeSemaphore(100)

// 多个模块共用同一个限流器
const moduleA = (data: Data) =>
  globalSemaphore.withPermits(1)(processA(data))

const moduleB = (data: Data) =>
  globalSemaphore.withPermits(1)(processB(data))

// 即使 moduleA 和 moduleB 在不同地方同时调用，
// 总并发数也不会超过 100
```

---

### 示例代码

以下是一段完整的渐进式示例，展示从原生 Promise 到 Effect-TS 结构化并发的演进路径。场景：从 50 个用户的 API 获取数据。

#### 第一代：Promise.all（朴素版）

```typescript
// 问题：一个失败全部失败；无法超时；无法取消
async function fetchUsersNaive(ids: string[]) {
  return await Promise.all(
    ids.map((id) => fetch(`/api/users/${id}`)),
  )
}
```

#### 第二代：Promise.allSettled（部分容错）

```typescript
// 改进：支持部分失败
// 问题：仍然无法超时或取消；类型不够精确
async function fetchUsersSettled(ids: string[]) {
  const results = await Promise.allSettled(
    ids.map((id) => fetch(`/api/users/${id}`)),
  )
  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
}
```

#### 第三代：Effect.all（声明式并发）

```typescript
// 优势：支持超时、错误隔离、类型安全
// 仍然需要自己控制并发数
const fetchUsersEffectAll = (ids: string[]) =>
  Effect.all(
    ids.map((id) =>
      fetchUser(id).pipe(
        Effect.timeout("3 seconds"),
        Effect.catchAll(() => Effect.succeed(null)),
      ),
    ),
    { concurrency: 10 },
  )
```

#### 第四代：Fiber 手动管理（精细控制）

```typescript
// 优势：可以逐步收集结果，中途检查状态
// 适用于需要实时进度的场景
const fetchUsersFiber = (ids: string[]) =>
  Effect.gen(function* (_) {
    const fibers = yield* _(
      Effect.all(
        ids.map((id) =>
          Effect.fork(
            fetchUser(id).pipe(
              Effect.timeout("3 seconds"),
              Effect.catchAll(() => Effect.succeed(null)),
            ),
          ),
        ),
        { concurrency: 10 },
      ),
    )

    const results: (User | null)[] = []
    for (const fiber of fibers) {
      const result = yield* _(Fiber.join(fiber))
      results.push(result)
    }
    return results.filter((u): u is User => u !== null)
  })
```

#### 第五代：Semaphore 限流（生产级）

```typescript
// 优势：精确限流 + 超时 + 错误隔离
// 适合生产环境
const fetchUsersProduction = (ids: string[]) =>
  Effect.gen(function* (_) {
    const sem = yield* _(Effect.makeSemaphore(10))
    const tasks = ids.map((id) =>
      sem.withPermits(1)(
        fetchUser(id).pipe(
          Effect.timeout("3 seconds"),
          Effect.catchAll((e) => {
            console.error(`用户 ${id} 请求失败:`, e)
            return Effect.succeed(null as unknown as User)
          }),
        ),
      ),
    )
    return yield* _(
      Effect.all(tasks, { concurrency: "unbounded" }),
    )
  })
```

#### 完整可运行的例子

```typescript
import { Effect, Fiber, Console, Duration } from "effect"

// 模拟外部 API 调用
const fetchUser = (id: string): Effect.Effect<{ id: string; name: string }, Error> =>
  Effect.gen(function* (_) {
    yield* _(Effect.sleep(Duration.millis(Math.random() * 2000)))

    // 模拟随机失败
    if (Math.random() < 0.1) {
      return yield* _(Effect.fail(new Error(`用户 ${id} 服务异常`)))
    }

    return { id, name: `用户_${id}` }
  })

// 程序入口
const program = Effect.gen(function* (_) {
  const ids = Array.from({ length: 50 }, (_, i) => `U${String(i).padStart(3, "0")}`)

  const semaphore = yield* _(Effect.makeSemaphore(10))

  const tasks = ids.map((id) =>
    semaphore.withPermits(1)(
      fetchUser(id).pipe(
        Effect.timeout("3 seconds"),
        Effect.catchAll((e) => {
          Console.log(`用户 ${id} 跳过: ${e instanceof Error ? e.message : "超时"}`)
          return Effect.succeed(null)
        }),
      ),
    ),
  )

  const results = yield* _(Effect.all(tasks, { concurrency: "unbounded" }))
  const successful = results.filter((r): r is { id: string; name: string } => r !== null)

  Console.log(`请求完成: ${successful.length}/${ids.length} 个成功`)

  return successful
})

// 执行
Effect.runPromise(program)
```

---

### 本章小结

结构化并发是 Effect-TS 区别于 TypeScript 生态中绝大多数库的核心能力之一。它的设计目标不是让你"写更多并发代码"，而是让你"写更少、但更正确的并发代码"。

回顾本章的核心要点：

1. **Fiber 是革命性的执行模型**。它不是对 Promise 的语法糖封装，而是从零设计的轻量级并发原语。数百万 Fiber 可以共存于一个 JavaScript 进程，每个 Fiber 都可被安全取消，取消时自动执行资源清理。

2. **结构化并发消灭了教科书般的并发 Bug**。Fiber 泄漏、孤儿线程、静默吞没错误——这些 Promise 时代你必须靠纪律和代码审查来避免的问题，在结构化并发模型中通过 Scope 的生命周期管理被系统性地解决了。

3. **限流原语原生集成**。Semaphore 不是第三方库的外挂补丁，而是 Effect 运行时的一等公民。它与 Fiber 中断机制深度集成，没有死锁风险（除非你嵌套使用），使用体验远超 `p-limit` 或 `async` 队列。

4. **并发控制是多层次的**。`Effect.all({ concurrency })` 处理"批量并发"，Semaphore 处理"全局限流"，Fiber 手动管理处理"精细控制"——三者不是替代关系，而是互补关系，根据场景选择最合适的抽象层级。

5. **从 Promise 到 Fiber 的迁移是线性的**。你不需要重写所有代码。可以用 `Effect.promise` 包装遗留 Promise 代码，逐步将并发控制迁移到 Fiber 模型。关键是从小处开始——先在一个批量 API 调用场景中尝试 Semaphore + Timeout 组合，感受 Fiber 的可取消能力，再逐步扩展到更多场景。

最后，记住 F.I.R.E 原则作为结构化并发的设计准则：

- **F**ork（分离）：用 `fork` 将任务分离到独立 Fiber
- **I**nterrupt（中断）：用 `interrupt` 安全取消不需要的任务
- **R**esource（资源）：用 `Scope` 自动管理资源和 Fiber 生命周期
- **E**nsemble（聚合）：用 `join`、`await`、`race` 聚合结果

这一章是 Effect-TS 并发模型的基础。在接下来的章节中，我们将把这些并发原语应用于更复杂的场景：流式数据处理、分布式系统协调、以及可靠的消息队列消费。