# 第六章：结构化并发

并发编程一直是 TypeScript 开发中的难点。`Promise.all` 虽然可以实现并发，但控制能力有限——无法取消、无法限制并发数、难以处理超时和错误隔离。Effect-TS 基于 Fiber 模型实现了结构化并发（Structured Concurrency），让并发任务的管理像函数调用一样直观。

---

## 模块一：Fiber — Effect-TS 的执行单元

Fiber 是 Effect-TS 中的轻量级执行单元，类比操作系统线程，但由 Effect 运行时调度而非操作系统。每个 Effect 在执行时都会在一个 Fiber 中运行。

```typescript
import { Effect, Fiber } from "effect"

export const parallelTask = Effect.gen(function* (_) {
  const fiber1 = yield* _(Effect.fork(Effect.succeed("task1")))
  const fiber2 = yield* _(Effect.fork(Effect.succeed("task2")))
  const result1 = yield* _(Fiber.join(fiber1))
  const result2 = yield* _(Fiber.join(fiber2))
  return [result1, result2]
})
```

`Effect.fork` 创建一个新的 Fiber 在后台执行，不阻塞当前 Fiber。`Fiber.join` 等待 Fiber 完成并获取结果。Fiber 的特点：
- **轻量级**：数百万 Fiber 可以共存于一个进程
- **结构化**：父 Fiber 与子 Fiber 存在生命周期绑定
- **可中断**：Fiber 可以被安全地取消，自动执行资源清理

---

## 模块二：Fork-Join 模式

`fork` 和 `join` 构成了基础的结构化并发模式。父 Fiber `fork` 子 Fiber，子 Fiber 执行异步任务，父 Fiber 在需要结果时 `join` 它们。

更高级的 Fiber API：
- `Fiber.await`：等待 Fiber 完成，返回 `Exit`（包含成功或失败信息）
- `Fiber.poll`：非阻塞检查 Fiber 是否完成
- `Fiber.interrupt`：中断 Fiber
- `Fiber.interruptFork`：中断 Fiber 但不等待
- `Fiber.status`：查询 Fiber 状态

Fiber 的生命周期绑定到父 Fiber 的 Scope：当父 Fiber 被中断时，所有未完成的子 Fiber 也会被中断。

```typescript
// 超时自动中断 Fiber
effect.pipe(
  Effect.timeout("1 second"),
  // 如果超时，effect 被中断，Fiber 被取消，资源被清理
)
```

---

## 模块三：Effect.all — 声明式并发

`Effect.all` 是最常用的并发 API，可以并发执行多个 Effect：

```typescript
const result = yield* _(
  Effect.all([effect1, effect2, effect3], { concurrency: "unbounded" }),
)
```

`concurrency` 参数控制并发度：
- `"unbounded"`：无限并发，所有 Effect 同时启动
- 数字（如 `5`）：限制最多 5 个并发
- `1`：串行执行

`Effect.all` 支持多种输入类型：
- 数组：返回对应位置的数组结果
- 对象：返回同结构对象
- Iterable：返回数组

`Effect.forEach` 是 `Effect.all` 的迭代器版本：

```typescript
export const concurrentMap = <A, B>(
  items: A[],
  f: (item: A) => Effect.Effect<B>,
  concurrency: number,
): Effect.Effect<B[]> =>
  Effect.forEach(items, f, { concurrency })
```

---

## 模块四：Semaphore — 并发限流

Semaphore（信号量）是控制并发访问共享资源的标准模式。Effect-TS 的 Semaphore 与 Fiber 原生集成，当请求超过限制时自动挂起等待。

```typescript
export const processBatch = (urls: string[]) =>
  Effect.gen(function* (_) {
    const semaphore = yield* _(Effect.makeSemaphore(10))

    const tasks = urls.map((url) =>
      semaphore.withPermits(1)(fetchUrl(url))
    )

    return yield* _(
      Effect.all(tasks, { concurrency: "unbounded" }),
      Effect.timeout("5 seconds"),
    )
  })
```

`withPermits(n)` 的作用：
- 请求 n 个许可（permit）
- 如果有足够许可，立即执行
- 如果不够，Fiber 被挂起等待
- 执行完成后自动释放许可

Semaphore 与 Fiber 中断集成：当 Fiber 被中断时，已获取的许可会自动释放。

---

## 模块五：Queue — 生产者消费者模式

`Queue` 是 Fiber 间的通信原语，支持多个生产者和多个消费者：

```typescript
export const producerConsumer = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<string>())

  const producer = Effect.gen(function* (_) {
    for (const item of ["a", "b", "c"]) {
      yield* _(queue.offer(item))
    }
    yield* _(queue.end)
  })

  const consumer = Effect.gen(function* (_) {
    const items: string[] = []
    let done = false
    while (!done) {
      const item = yield* _(queue.take)
      if (item === Queue.endMarker) {
        done = true
      } else {
        items.push(item)
      }
    }
    return items
  })

  const [_, consumed] = yield* _(Effect.all([producer, consumer], { concurrency: 2 }))
  return consumed
})
```

Queue 的类型：
- `Queue.unbounded<T>()`：无界队列，永不阻塞 offer
- `Queue.bounded<T>(capacity)`：有界队列，满了时 offer 阻塞
- `Queue.dropping<T>(capacity)`：有界队列，满了时丢弃新元素
- `Queue.sliding<T>(capacity)`：有界队列，满了时移除最旧的元素

---

## 模块六：Race 与 Timeout

`Effect.race` 同时执行多个 Effect，返回最先完成的那个：

```typescript
export const raceApis = Effect.gen(function* (_) {
  const result = yield* _(
    Effect.race(
      Effect.sync(() => "api1").pipe(Effect.delay("100 millis")),
      Effect.sync(() => "api2").pipe(Effect.delay("200 millis")),
    )
  )
  return result
})
```

`Effect.raceAll` 支持任意数量的 Effect。失败的处理：
- 如果获胜的 Effect 失败，race 整体失败
- 失败的 Effect 不会导致 race 立即失败，除非它赢了
- 所有失败的 Fiber 都会被自动清理

超时本质上也是 race：`Effect.timeout("5 seconds")` 等价于将原 Effect 与一个"5 秒后失败"的 Effect 做 race。

```typescript
// 为竞速添加超时兜底
const result = yield* _(
  Effect.race(
    primaryApi.pipe(Effect.timeout("2 seconds")),
    fallbackApi,
  )
)
```

---

## 模块七：工作池与扇出模式

工作池（Worker Pool）模式并发处理一批任务，控制同时运行的任务数：

```typescript
export const workerPool = <A, B>(
  items: A[],
  worker: (item: A) => Effect.Effect<B>,
  poolSize: number,
): Effect.Effect<B[]> =>
  Effect.forEach(items, worker, { concurrency: poolSize })
```

扇出（Fan-out）模式同时请求多个相同服务，使用最快响应：

```typescript
export const fanOut = (urls: string[]): Effect.Effect<HttpResult> =>
  Effect.raceAll(urls.map((url) => httpGet(url)))
```

这两种模式在微服务架构中非常常见：
- 工作池用于批量数据处理
- 扇出用于降低延迟（请求多个副本，取最快响应）

---

## 模块八：生产实践建议

### 8.1 并发度选择

| 场景 | 推荐并发度 | 说明 |
|------|-----------|------|
| CPU 密集型 | CPU 核心数 | 避免过多上下文切换 |
| IO 密集型 | 较高（10-100） | 等待时间远大于计算时间 |
| API 调用 | 5-20 | 考虑下游服务的负载 |
| 文件操作 | 4-8 | 磁盘 IO 瓶颈 |

### 8.2 错误隔离

并发任务间的错误隔离非常重要。`Effect.all` 的 `{ mode: "either" }` 选项让每个任务独立失败：

```typescript
const results = yield* _(
  Effect.all(tasks, { concurrency: 5, mode: "either" })
)
// results: [Either<A, E>]
```

每个任务要么成功返回 `Right(value)`，要么失败返回 `Left(error)`，不影响其他任务。

### 8.3 优雅关闭

在应用关闭时，需要确保所有 Fiber 被安全终止：

```typescript
const run = app.pipe(
  Effect.provide(AppLayer),
  Effect.scoped,  // Scope 管理应用生命周期
)
```

当最外层 Scope 结束时，Scope 内的所有 Fiber 都会被中断，资源被释放。

### 8.4 监控 Fiber

生产环境中可以通过 Fiber 状态监控并发健康度：
- `Fiber.runtimeFlags`：检查 Fiber 的运行状态
- `Effect.fiberId`：获取当前 Fiber 的 ID
- `Effect.fiberRefs`：获取 Fiber 的引用（类似线程局部变量）

---

## 总结

Effect-TS 的结构化并发通过 Fiber 模型解决了传统并发编程的多项难题：

1. **生命周期管理**：Fiber 的生命周期绑定到父 Fiber，结构化清理
2. **取消安全**：Fiber 中断时自动执行资源清理
3. **限流原语**：Semaphore 原生支持 Fiber 协作
4. **通信原语**：Queue 支持多生产者多消费者
5. **超时与竞速**：Timeout 和 Race 基于 Fiber 中断实现

至此，Effect-TS 基础系列的四章（错误处理、依赖注入、资源管理、结构化并发）全部完成。这些机制相互配合，构成了 Effect-TS 构建可靠应用的核心能力。