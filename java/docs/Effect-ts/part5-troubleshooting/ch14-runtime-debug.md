# ch14 运行时排查

## 概述

Effect-TS 的运行时系统基于 Fiber（轻量级协程）和 Supervisor（监督者），提供了传统 `async/await` 不具备的检查和调试能力。本章聚焦于运行时的**真实部署问题排**查：Fiber 泄漏、并发死锁、未捕获异常以及对 Fiber 树的诊断。

---

## 1. Fiber 泄漏排查

Fiber 泄漏类似于传统编程中的内存泄漏，但更隐蔽：一个 Fiber 可能不消耗大量内存，但无限增长的 Fiber 数量会耗尽系统资源。

### 1.1 泄漏的典型表现

- 应用运行时间越长响应越慢
- 内存使用持续增长但 GC 无法回收
- CPU 使用率逐渐升高

### 1.2 常见原因

```typescript
import { Effect, Queue, Console, Fiber } from "effect"

// ❌ 泄漏模式 1：fork 了 Fiber 但没有 join 也没有 supervise
const leaky = Effect.gen(function* (_) {
  // 每次请求都 fork 一个新 Fiber
  yield* _(
    Effect.forever(
      Effect.sleep("1 seconds").pipe(
        Effect.andThen(Console.log("background task"))
      )
    ).pipe(Effect.fork)
  )
  // ❌ 这个 Fiber 永远不会被 join、supervise、或者 interrupt
  // 每次请求都会留下一个僵尸 Fiber
})

// ✅ 修正：使用 Scope 管理 Fiber 生命周期
const fixed = Effect.scoped(
  Effect.gen(function* (_) {
    const fiber = yield* _(
      Effect.forever(
        Effect.sleep("1 seconds").pipe(
          Effect.andThen(Console.log("background task"))
        )
      ).pipe(Effect.forkScoped) // forkScoped 在 Scope 结束时自动中断
    )
    // 返回给调用方，调用方决定 Fiber 何时结束
    return fiber
  })
)

// ✅ 或手动 supervise
const supervised = Effect.gen(function* (_) {
  const supervisor = yield* _(Supervisor.track)
  yield* _(
    task().pipe(
      Effect.supervisedBy(supervisor), // 将此 Fiber 注册到 supervisor
      Effect.fork
    )
  )
  // 可以通过 supervisor 追踪所有子 Fiber
  const fibers = yield* _(supervisor.value)
  console.log(`active fibers: ${fibers.length}`)
})
```

### 1.3 使用 Supervisor 监控 Fiber

```typescript
import { Effect, Supervisor, Fiber, Console, Duration } from "effect"

const monitorFibers = Effect.gen(function* (_) {
  // 创建全局 Fiber 追踪器
  const supervisor = yield* _(Supervisor.track)
  
  // 让整个应用在监控下运行
  const program = Effect.gen(function* (__) {
    // ... 应用代码
    yield* __(someBackgroundWork().pipe(Effect.fork))
    yield* __(anotherBackgroundWork().pipe(Effect.fork))
  }).pipe(
    Effect.supervisedBy(supervisor)
  )
  
  // 定时检查 Fiber 数量
  yield* _(
    Effect.gen(function* (__) {
      const fibers = yield* __(supervisor.value)
      const count = fibers.length
      Console.log(`[monitor] active fibers: ${count}`)
      
      // 如果 Fiber 数量异常增长，打印详情
      if (count > 100) {
        yield* __(Console.log("[monitor] WARNING: fiber count high"))
        for (const fiber of fibers) {
          const status = yield* __(Fiber.status(fiber))
          Console.log(`  fiber ${fiber.id()}: ${status._tag}`)
        }
      }
    }).pipe(
      Effect.repeat({ delay: "5 seconds", times: 10 }),
      Effect.fork
    )
  )
  
  return program
})
```

### 1.4 周期性 Fiber Dump

```typescript
import { Effect, Fiber, Console, Supervisor } from "effect"

const addPeriodicDump = (app: Effect.Effect<void, never, never>) =>
  Effect.gen(function* (_) {
    const supervisor = yield* _(Supervisor.track)
    
    // 每 30 秒 dump 一次 Fiber 状态
    yield* _(
      Effect.gen(function* (__) {
        const fibers = yield* __(supervisor.value)
        Console.log(`=== Fiber Dump (${fibers.length} active) ===`)
        for (const fiber of fibers) {
          const id = fiber.id()
          const status = yield* __(Fiber.status(fiber))
          Console.log(`  [${id}] ${status._tag}`)
          
          // Done 状态：打印完成值
          if (status._tag === "Done") {
            Console.log(`    → ${JSON.stringify(status.value)}`)
          }
        }
      }).pipe(
        Effect.repeat({ delay: "30 seconds" }),
        Effect.fork
      )
    )
    
    return app.pipe(Effect.supervisedBy(supervisor))
  })
```

---

## 2. 并发死锁排查

死锁在 Effect-TS 中比原生 JavaScript 更常见，因为 Fiber 是协作式调度 —— 一个 Fiber 如果完全阻塞（非 yield），整个线程都会被阻塞。

### 2.1 典型死锁模式

```typescript
import { Effect, Queue, Ref, Console } from "effect"

// ❌ 死锁模式 1：Fiber 在等待自己
const selfDeadlock = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))
  
  // 在同一个 Effect 中读一个又写同一个 Ref
  // 虽然 Ref 是原子的，但如果包在 SynchronizedRef 的 updateEffect 里
  // 且更新操作依赖于同一个 SynchronizedRef 的另一个状态 —— 死锁
  yield* _(ref.update((n) => {
    // 如果 update 内部再次操作 ref 的 get（在 Ref 中不允许）
    // ref.get 是 Effect，不能在纯函数中执行
    return n + 1
  }))
})

// ❌ 死锁模式 2：有限的 Queue 满了，消费者也是自己
const queueDeadlock = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(1))
  
  // offer(1) 成功（有空位）
  yield* _(queue.offer(1))
  // offer(2) 阻塞，因为队列容量为 1
  // 但当前 Fiber 需要 offer(2) 完成才能进入 take
  yield* _(queue.offer(2)) // ❌ 永远阻塞
  yield* _(queue.take)     // 永远不会执行到这
})

// ✅ 修正：使用单独的 Fiber
const fixedQueue = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(1))
  
  yield* _(queue.offer(1))
  
  // 单独的消费者 Fiber
  yield* _(
    queue.take.pipe(
      Effect.andThen(Console.log("took 1")),
      Effect.fork
    )
  )
  
  // 现在 offer(2) 可以继续，因为消费者 Fiber 已经就绪
  yield* _(queue.offer(2))
  yield* _(queue.take.pipe(Effect.andThen(Console.log("took 2"))))
})
```

### 2.2 死锁检测策略

```typescript
import { Effect, Fiber, Queue, Console, Duration } from "effect"

// 超时包装 —— 将潜在的死锁转换为超时错误
const withDeadlockDetection = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeout: Duration.DurationInput = "10 seconds"
): Effect.Effect<A, E | Error, R> =>
  effect.pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new Error("Possible deadlock detected"))
    )
  )

// 在开发环境使用
if (process.env.NODE_ENV === "development") {
  // 所有 Effect 都附加超时检测
  const safeEffect = withDeadlockDetection(myEffect)
}
```

### 2.3 死锁预防清单

| 场景 | 预防措施 |
|------|---------|
| Queue offer/take 同一 Fiber | 生产者/消费者分离到不同 Fiber |
| SynchronizedRef 嵌套 | 避免在 `updateEffect` 内操作其他同步原语 |
| 共享资源顺序锁定 | 所有 Fiber 按相同的顺序获取资源 |
| fiber.join 循环依赖 | Fiber A join B，B join A → 无解 |

---

## 3. Fiber.dump 诊断工具

Effect-TS 提供了 `Fiber.dump` 方法，可以在运行时获取 Fiber 的完整状态快照。

### 3.1 基本用法

```typescript
import { Effect, Fiber, Console } from "effect"

const dumpExample = Effect.gen(function* (_) {
  const fiber = yield* _(
    Effect.forever(
      Effect.sleep("1 seconds").pipe(
        Effect.andThen(Console.log("tick"))
      )
    ).pipe(Effect.fork)
  )
  
  // 某些条件触发 dump
  yield* _(Effect.sleep("3 seconds"))
  
  const dump = yield* _(Fiber.dump(fiber))
  Console.log(`=== Fiber Dump ===`)
  Console.log(`id: ${dump.id}`)
  Console.log(`status: ${dump.status}`)
  Console.log(`stack: ${dump.stack}`)
  
  yield* _(Fiber.interrupt(fiber))
})
```

### 3.2 实际场景：在 HTTP 请求中

```typescript
import { Effect, Fiber, Console, Ref, Supervisor, Duration } from "effect"

// HTTP 请求中间件 —— 自动 dump 超过阈值的请求
const withSlowRequestDump = <A, E>(
  effect: Effect.Effect<A, E, never>,
  requestId: string,
  threshold: Duration.DurationInput = "5 seconds"
): Effect.Effect<A, E, never> =>
  Effect.gen(function* (_) {
    const start = yield* _(Effect.sync(() => Date.now()))
    
    const supervisor = yield* _(Supervisor.track)
    const fiber = yield* _(
      effect.pipe(
        Effect.supervisedBy(supervisor),
        Effect.fork
      )
    )
    
    // 超时检测
    yield* _(
      Effect.gen(function* (__) {
        const elapsed = Date.now() - start
        if (elapsed > Duration.toMillis(threshold)) {
          Console.warn(`[SLOW] request ${requestId}: ${elapsed}ms`)
          
          const fibers = yield* __(supervisor.value)
          for (const f of fibers) {
            const dump = yield* __(Fiber.dump(f))
            Console.log(`  fiber ${dump.id}: ${dump.status}`)
          }
        }
      }).pipe(
        Effect.repeat({ delay: "1 seconds" }),
        Effect.fork,
        Effect.andThen(fiber.join)
      )
    )
    
    return fiber.join.pipe(
      Effect.andThen((result) => {
        const total = Date.now() - start
        Console.log(`[OK] request ${requestId}: ${total}ms`)
        return result
      })
    )
  })
```

---

## 4. 未捕获异常排查

Effect 中的错误不会"抛"到全局的 `process.on('unhandledRejection')` 或 `window.onerror`，但某些场景下的错误可能被**静默吞掉**。

### 4.1 常见静默错误

```typescript
import { Effect, Console } from "effect"

// ❌ 错误被静默吞掉
const silenced = Effect.gen(function* (_) {
  // Effect 中的 throw 会转为 Cause.Die，不会向上抛出
  // 但如果没有被任何 catch 捕获，并且也没有被 await
  // 错误就消失了
  throw new Error("silent error")
})

// 如果在测试/运行时不 await 这个 Effect，错误不会被观察到
// Effect.runPromise(silenced) // 这能捕获，但如果忘了 runPromise

// ✅ 使用 Effect.runPromiseExit 始终检查结果
Effect.runPromiseExit(silenced).then((exit) => {
  switch (exit._tag) {
    case "Success":
      console.log("success:", exit.value)
      break
    case "Failure":
      console.error("failure:", exit.cause)
      // 可以根据 Cause 分类处理
      break
  }
})
```

### 4.2 Cause 分析

```typescript
import { Effect, Cause, Console } from "effect"

const analyzeCause = (effect: Effect.Effect<unknown, Error, never>) =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (exit._tag === "Failure") {
      const cause = exit.cause
      
      // Cause 的种类
      switch (cause._tag) {
        case "Fail":
          // 预期的错误（Error 类型）
          console.error("Expected failure:", cause.error.message)
          break
        case "Die":
          // 意外的缺陷（抛出的非 Error 值）
          console.error("Unexpected defect:", cause.defect)
          break
        case "Interrupt":
          // Fiber 被中断
          console.warn("Fiber was interrupted")
          break
        case "Sequential":
          // 多个连续错误
          console.error("Sequential errors")
          break
        case "Parallel":
          // 多个并行错误
          console.error("Parallel errors:", cause.errors)
          break
      }
    }
  })
```

### 4.3 全局 Error Handler

```typescript
import { Effect, Cause, Console } from "effect"

// 全局错误监听器（类似 Cortensor / Sentry）
const withGlobalErrorHandler = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.catchAllCause(effect, (cause) =>
    Effect.gen(function* (_) {
      // 发送到 Sentry / 日志系统
      const errorInfo = yarn* _(Cause.prettyPrint(cause))
      Console.error("Unhandled cause:", errorInfo)
      
      // 重新抛出或者转换为默认值
      if (Cause.isInterruptedOnly(cause)) {
        return yield* _(Effect.interrupt)
      }
      
      // 返回默认错误
      return yield* _(Effect.fail(new Error("internal error")))
    })
  )
```

---

## 5. 运行指标收集

```typescript
import { Effect, Fiber, Supervisor, Console, Metric } from "effect"

// 自定义指标
const activeFibers = Metric.gauge("effect.fibers.active")

const withMetrics = (app: Effect.Effect<void, never, never>) =>
  Effect.gen(function* (_) {
    const supervisor = yield* _(Supervisor.track)
    
    // 更新活跃 Fiber 数量
    yield* _(
      Effect.gen(function* (__) {
        const fibers = yield* __(supervisor.value)
        yield* __(activeFibers.set(fibers.length))
      }).pipe(
        Effect.repeat({ delay: "10 seconds" }),
        Effect.fork
      )
    )
    
    return app.pipe(Effect.supervisedBy(supervisor))
  })
```

---

## 6. 生产环境 Checklist

| 检查项 | 工具/方法 |
|--------|----------|
| Fiber 数量监控 | Supervisor.track + Metric.gauge |
| 死锁检测 | Effect.timeout 包装 + 告警 |
| 异常上报 | Effect.catchAllCause + 全局 handler |
| 慢 Fiber 诊断 | Fiber.dump + 定期报告 |
| 资源泄露 | Scoped 管理确保 acquireRelease |
| 并发配置 | 确认 concurrency 参数不越界 |

---

## 参考

- Effect-TS Fiber 文档：https://effect.website/docs/concurrency/fibers
- Effect-TS Supervisor 文档：https://effect.website/docs/concurrency/supervisors
- 相关章节：ch06（结构化并发）、ch13（DX 痛点）、ch15（性能调优）