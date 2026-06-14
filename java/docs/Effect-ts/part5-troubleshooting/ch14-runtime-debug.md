# ch14 运行时排查

## 使用场景

服务器运行 72 小时后，内存占用从 200MB 涨到了 2GB——怀疑有 Fiber 泄漏。API 服务在低负载时正常，流量上来后随机超时——可能是死锁。某个 Effect 偶尔报错但 `catchAll` 没捕获到，调用方收到一个 `Defect`——未捕获的异常去哪了？

Effect-TS 的 Fiber 模型提供了前所未有的诊断手段：Fiber Dump、Supervisor 追踪、Cause 分析。本章聚焦三个典型场景：

- **Fiber 泄漏**：Fiber 数量无限增长导致内存耗尽
- **并发死锁**：Fiber 互相等待导致服务挂起
- **未捕获 Defect**：错误被静默吞掉

---

## 实现原理

### Fiber 运行时模型

Effect-TS 运行于**协作式调度**的 Fiber。每个 Fiber 是轻量级协程，在 JS 主线程上协作执行。关键点：Fiber 不会被抢占——它们必须主动 `yield`；一个 Fiber 被阻塞，整个线程上的所有 Fiber 都停止。单个 Fiber 占几百字节，10 万个就能吃掉几百 MB。

### 诊断架构

三层诊断工具：

1. **Fiber 级别**：`Fiber.dump`、`Fiber.status`、`Fiber.id`
2. **Supervisor 级别**：`Supervisor.track`——所有受管 Fiber 的集合视图
3. **全局级别**：`Metric` + `Supervisor`——运行时状态 → 可监控指标

---

## 潜在风险

### 风险 1：Fiber 泄漏的隐蔽性

内存缓慢增长但 GC 无法回收挂起的闭包；应用响应变长；CPU 逐渐爬升。典型路径：请求中用 `Effect.fork` 启动后台任务却未用 `forkScoped`，请求完成后 Fiber 成为孤儿。

### 风险 2：死锁的间歇性

Fiber 调度是非确定性的——一个 `Queue.bounded(1)` 死锁可能在 offer/take 完美交替时永远不出现，直到请求恰好触碰边界。极难在开发环境复现。

### 风险 3：Defect 的静默丢失

`Defect`（`Cause.Die`）不会被 `catchAll` 捕获。未配置 `catchAllCause` 时，Defect 表现为未处理的 Promise rejection——在 `unhandledRejection` 中完全丢失，没有日志、没有告警。

---

## 优化策略

### 策略 1：全局 Fiber 监控

```typescript
import { Effect, Supervisor, Metric, Console, Fiber } from "effect"

const setupFiberMonitoring = Effect.gen(function* (_) {
  const supervisor = yield* _(Supervisor.track)
  const fiberGauge = Metric.gauge("app.fibers.active")
  yield* _(
    Effect.gen(function* (__) {
      const fibers = yield* __(supervisor.value)
      yield* __(fiberGauge.set(fibers.length))
      if (fibers.length > 200) {
        Console.warn(`[FIBER WARN] Active fibers: ${fibers.length}`)
        for (const f of fibers.slice(0, 10)) {
          const status = yield* __(Fiber.status(f))
          Console.log(`  fiber ${f.id()}: ${status._tag}`)
        }
      }
    }).pipe(Effect.repeat({ delay: "30 seconds" }), Effect.fork)
  )
  return supervisor
})
```

### 策略 2：超时包装防死锁

```typescript
const withSafety = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeout: Duration.DurationInput = "10 seconds"
): Effect.Effect<A, E | Error, R> =>
  effect.pipe(Effect.timeoutFail({
    duration: timeout,
    onTimeout: () => new Error(`Fiber timed out after ${Duration.format(timeout)}`)
  }))
```

### 策略 3：全局 Defect 捕获

```typescript
const withDefectCapture = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  serviceName: string
): Effect.Effect<A, E, R> =>
  Effect.catchAllCause(effect, (cause) =>
    Effect.gen(function* (_) {
      if (Cause.isDie(cause)) {
        const defect = Cause.squash(cause)
        Console.error(`[${serviceName}] Unhandled defect:`, defect)
        yield* _(reportDefect(serviceName, defect))
      }
      if (Cause.isInterruptedOnly(cause)) {
        return yield* _(Effect.interrupt)
      }
      return yield* _(Effect.fail(new InternalError(`Error in ${serviceName}`)))
    })
  )
```

---

## 典型问题处理

### 问题 1：Fiber 泄漏

#### 问题复现

```typescript
// ❌ fork 后没有管理生命周期——Fiber 成为孤儿
class BackgroundWorker {
  startJob(jobId: string) {
    const worker = Effect.forever(
      Effect.sleep("1 second").pipe(Effect.andThen(Console.log(`running`)))
    )
    Effect.runFork(worker) // ❌ 永不停止
  }
  stopJob(jobId: string) {
    // ❌ 只删了 Map，Fiber 仍在后台运行
  }
}
```

#### 诊断方法

```typescript
const diagnoseLeak = Effect.gen(function* (_) {
  const supervisor = yield* _(Supervisor.track)
  const children = yield* _(supervisor.value)
  for (const child of children) {
    const status = yield* _(Fiber.status(child))
    if (status._tag === "Suspended") {
      const dump = yield* _(Fiber.dump(child))
      Console.log(`Suspended fiber: ${dump.stack}`)
    }
    if (status._tag === "Done") {
      Console.warn(`Done fiber still referenced: ${child.id()}`)
    }
  }
})
```

#### 解决方案

```typescript
// ✅ 方案 1：forkScoped——Scope 关闭时自动中断
Effect.scoped(
  Effect.gen(function* (_) {
    const fiber = yield* _(backgroundTask().pipe(Effect.forkScoped))
    return fiber
  })
)

// ✅ 方案 2：FiberSet 管理一组 Fiber
const workerPool = Effect.scoped(
  Effect.gen(function* (_) {
    const set = yield* _(FiberSet.make())
    const start = (jobId: string) => FiberSet.run(set, backgroundTask(jobId))
    return { start, stopAll: () => FiberSet.interruptAll(set) }
  })
)
```

#### 修复前后对比

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 1000 次请求后 Fiber 数 | 1000（全部活跃） | 0（全部回收） |
| 内存使用 72h | 2.1GB OOM | 280MB 稳定 |
| 每次请求 Fiber 创建 | 1 个孤儿 Fiber | 1 个 Scope 管理 Fiber |
| GC 回收率 | 0%（Fiber 一直被引用） | 100%（Scope 关闭后回收） |

---

### 问题 2：并发死锁

#### 问题复现

```typescript
import { Effect, Queue, Ref, Console } from "effect"

// 死锁：生产者和消费者在同一个 Fiber 中
const deadlockExample = (items: number[]) =>
  Effect.gen(function* (_) {
    const queue = yield* _(Queue.bounded<number>(2))

    // 先 offer 两个（填满队列）
    yield* _(queue.offer(items[0]))
    yield* _(queue.offer(items[1]))

    // 第 3 个 offer 会阻塞，因为队列已满
    // 但当前 Fiber 被阻塞，无法执行下面的 take
    yield* _(queue.offer(items[2])) // ❌ 永远卡在这里
    yield* _(queue.take)            // 永远不会执行
  })

// 死锁：两个 Fiber 互相等待
const crossDeadlock = Effect.gen(function* (_) {
  const refA = yield* _(Ref.make(0))
  const refB = yield* _(Ref.make(0))

  const fiber1 = yield* _(
    Effect.gen(function* (__) {
      // Fiber 1: 锁定 refA，等待 refB
      yield* __(refA.update((n) => n + 1))
      yield* __(refB.update((n) => n + 1)) // 如果 refB 被 Fiber2 锁定...
    }).pipe(Effect.fork)
  )

  const fiber2 = yield* _(
    Effect.gen(function* (__) {
      // Fiber 2: 锁定 refB，等待 refA
      yield* __(refB.update((n) => n + 1))
      yield* __(refA.update((n) => n + 1)) // 如果 refA 被 Fiber1 锁定...
    }).pipe(Effect.fork)
  )

  yield* _(Fiber.join(fiber1))
  yield* _(Fiber.join(fiber2))
})
```

#### 诊断方法

```typescript
import { Effect, Fiber, Queue, Console, Duration } from "effect"

// 死锁检测：定时检查队列深度和 Fiber 状态
const deadlockDetector = (label: string, queue: Queue.Queue<unknown>) =>
  Effect.gen(function* (_) {
    const size = yield* _(Queue.size(queue))
    const capacity = queue.capacity

    Console.log(`[${label}] queue: ${size}/${capacity}`)

    // 队列满了 + 没有消费者 = 可能的死锁
    if (size === capacity && size > 0) {
      // 尝试一次 take 看是否能成功
      const result = yield* _(
        queue.take.pipe(
          Effect.timeout("100 millis"),
          Effect.optionFromOptional // 超时返回 None
        )
      )

      if (result._tag === "None") {
        Console.error(`[DEADLOCK DETECTED] ${label}: queue full, no consumer`)
        // 强制清空队列以恢复
        // yield* _(Queue.shutdown(queue))
      }
    }
  })

// 在生产环境部署探测
const monitoredQueue = <A>(label: string, capacity: number) =>
  Effect.gen(function* (_) {
    const queue = yield* _(Queue.bounded<A>(capacity))

    // 启动定时探测
    yield* _(
      deadlockDetector(label, queue).pipe(
        Effect.repeat({ delay: "5 seconds" }),
        Effect.fork
      )
    )

    return queue
  })
```

#### 解决方案

```typescript
// ✅ 方案 1：分离生产者和消费者到不同 Fiber
const safeQueueUsage = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(2))

  // 消费者 Fiber 独立运行
  yield* _(
    Effect.gen(function* (__) {
      while (true) {
        const item = yield* __(queue.take)
        Console.log(`consumed: ${item}`)
      }
    }).pipe(Effect.fork)
  )

  // 生产者不再自锁
  yield* _(queue.offer(1))
  yield* _(queue.offer(2))
  yield* _(queue.offer(3)) // ✅ 消费者 Fiber 会及时取走
  yield* _(queue.offer(4))
})

// ✅ 方案 2：使用 Queue 的 offer 变体避免阻塞
const nonBlockingOffer = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(2))

  // offer 立刻返回，失败也不阻塞
  const offered = yield* _(queue.offer(3).pipe(Effect.optionFromOptional))
  if (offered._tag === "None") {
    Console.log("queue full, item discarded")
  }
  // ✅ 不会阻塞当前 Fiber
})

// ✅ 方案 3：使用 Polling 模式而非阻塞
const pollQueue = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(100))

  // 用 poll 替代 take，不阻塞
  const item = yield* _(
    queue.take.pipe(
      Effect.timeout("100 millis"),
      Effect.optionFromOptional
    )
  )

  if (item._tag === "Some") {
    Console.log(`got: ${item.value}`)
  } else {
    Console.log("queue empty, doing other work")
  }
})
```

---

### 问题 3：未捕获 Defect

#### 问题复现

```typescript
const buggyEffect = Effect.gen(function* (_) {
  const data = yield* _(fetchData())
  return data.nested.value // TypeError: Cannot read properties of null
})

// ❌ catchAll 无法捕获 Die
const handled = buggyEffect.pipe(
  Effect.catchAll((err) => {
    Console.log("caught:", err) // 永远不会执行！
    return Effect.succeed("fallback")
  })
)
// → 不会输出任何日志，rejected promise 可能被静默吞掉
```

#### 诊断方法

```typescript
// 使用 catchAllCause 捕获所有 Error 种类
const diagnosticEffect = buggyEffect.pipe(
  Effect.catchAllCause((cause) =>
    Effect.gen(function* (_) {
      Console.error("full cause:", Cause.prettyPrint(cause))
      if (Cause.isDie(cause)) Console.error("DEFECT (Die): unexpected runtime error")
      if (Cause.isFail(cause)) Console.error("Expected failure (Fail)")
      if (Cause.isInterruptedOnly(cause)) Console.error("Interruption")
      return Effect.succeed("fallback")
    })
  )
)
```

#### 解决方案

```typescript
// ✅ 方案 1：将 Defect 转换为 Fail
const safeEffect = buggyEffect.pipe(
  Effect.catchAllDefect((defect) =>
    Effect.fail(new InternalError(`Defect: ${String(defect)}`))
  )
)

// ✅ 方案 2：全局错误边界
const withErrorBoundary = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  service: string
): Effect.Effect<A, E, R> =>
  Effect.catchAllCause(effect, (cause) =>
    Effect.gen(function* (_) {
      Console.error(`[${service}] Cause: ${Cause.prettyPrint(cause)}`)
      if (Cause.isDie(cause)) {
        return yield* _(Effect.fail(new ServiceError(`Unhandled defect in ${service}`)))
      }
      if (Cause.isInterruptedOnly(cause)) {
        return yield* _(Effect.interrupt)
      }
      return yield* _(Effect.fail(new ServiceError(`Failed: ${Cause.prettyPrint(cause)}`)))
    })
  )
```

---

## 开发者技能

### 技能 1：构建调试 REPL

```typescript
(globalThis as any).__effect_debug = {
  fibers: () =>
    Effect.runPromise(supervisor.value.then((fibers) =>
      console.table(fibers.map((f) => ({ id: f.id(), status: Fiber.status(f) })))
    )),
  dump: (id: string) =>
    Effect.runPromise(
      Effect.gen(function* (_) {
        const fibers = yield* _(supervisor.value)
        const target = fibers.find((f) => f.id() === id)
        if (target) console.log(yield* _(Fiber.dump(target)))
      })
    ),
  killAll: () => Effect.runPromise(
    supervisor.value.pipe(Effect.flatMap((fibers) => Effect.forEach(fibers, Fiber.interrupt)))
  )
}
```

### 技能 2：运行时探针模式

使用 `Effect.repeat` 构建探针，在生产环境持续检查运行时健康度：

```typescript
const healthProbe = (options: { maxFibers: number; checkInterval: Duration.DurationInput }) =>
  Effect.gen(function* (_) {
    const supervisor = yield* _(Supervisor.track)
    yield* _(
      Effect.gen(function* (__) {
        const fibers = yield* __(supervisor.value)
        if (fibers.length > options.maxFibers)
          Console.warn(`[PROBE] Fiber count ${fibers.length} exceeds ${options.maxFibers}`)
        for (const f of fibers) {
          const status = yield* __(Fiber.status(f))
          if (status._tag === "Suspended" && (status as any).duration > 60000)
            Console.warn(`[PROBE] Fiber ${f.id()} suspended for >60s`)
        }
      }).pipe(Effect.repeat({ delay: options.checkInterval }), Effect.fork)
    )
    return supervisor
  })
```

---

## 示例代码

### Before/After：Fiber 泄漏修复

```typescript
// BEFORE：fork 后 Fiber 成为孤儿
const handleRequest = (req: Request) =>
  Effect.gen(function* (_) {
    const result = yield* _(processBusiness(req))
    yield* _(sendAnalytics(req, result).pipe(Effect.fork)) // ❌ 永不中断
    return result
  })
// 100 req/s × 30s = 3000 个活跃 Fiber（持续增长）

// AFTER：Scope 管理
const handleRequestFixed = (req: Request) =>
  Effect.scoped(
    Effect.gen(function* (_) {
      const result = yield* _(processBusiness(req))
      yield* _(sendAnalytics(req, result).pipe(Effect.forkScoped)) // ✅ Scope 结束时中断
      return result
    })
  )
// 100 req/s × 100ms = ~10 个活跃 Fiber（稳定）
```

### 监控集成示例：Prometheus 指标

```typescript
const fiberCountGauge = Metric.gauge("effect_fibers_total")
const collectMetrics = Effect.gen(function* (_) {
  const supervisor = yield* _(Supervisor.track)
  yield* _(
    Effect.gen(function* (__) {
      const fibers = yield* __(supervisor.value)
      yield* __(fiberCountGauge.set(fibers.length))
    }).pipe(Effect.repeat({ delay: "15 seconds" }), Effect.fork)
  )
  return supervisor
})
```

---

## 本章小结

Effect-TS 的运行时排查体系比原生 JavaScript 更为完善，关键在于利用它提供的一系列结构化诊断工具：

1. **Fiber 泄漏**：使用 `forkScoped` 替代 `fork`，或用 `Supervisor.track` 监控 Fiber 生命周期。建立 Fiber 数量基线并设置告警阈值。记住：每创建一个 Fiber，都要想清楚它的生命周期由谁管理。

2. **并发死锁**：分离生产者和消费者到不同 Fiber，使用非阻塞 API（`offer` + `Effect.optionFromOptional`）替代阻塞式 `take`。在所有关键操作外层包裹 `Effect.timeout` 将死锁转换为超时错误。

3. **未捕获 Defect**：在应用顶层设置 `catchAllCause` 全局边界，将所有 Defect 转换为可处理的 Fail。使用 `Effect.runPromiseExit` 在所有入口点检查 Exit 类型。不要在应用层面依赖 `process.on('unhandledRejection')`。

4. **运行时监控**：使用 `Metric` + `Supervisor` 构建生产环境的 Fiber 监控面板。定时的 Fiber Dump 可以辅助排查深层问题。

```typescript
// 生产环境启动模板
const productionApp = Effect.gen(function* (_) {
  // 1. 设置全局 Defect 边界
  const safeMain = withErrorBoundary(main, "app")

  // 2. 启动 Fiber 监控
  const supervisor = yield* _(setupFiberMonitoring())

  // 3. 启动健康探针
  yield* _(healthProbe({ maxFibers: 500, checkInterval: "30 seconds" }))

  // 4. 运行应用
  return yield* _(safeMain.pipe(Effect.supervisedBy(supervisor)))
})
```

---

## 参考

- Effect-TS Fiber 文档：https://effect.website/docs/concurrency/fibers
- Effect-TS Supervisor 文档：https://effect.website/docs/concurrency/supervisors
- Effect-TS Cause 文档：https://effect.website/docs/observability/cause
- 相关章节：ch06（结构化并发）、ch13（DX 痛点）、ch15（性能调优）