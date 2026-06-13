# ch08 Ref / Queue / Hub —— 并发原语

## 概述

Effect-TS 提供了一套精心设计的并发原语，用于在 Fiber 之间安全地共享状态、传递数据和发布订阅消息。与 JavaScript 原生 `SharedArrayBuffer` 或互斥锁不同，这些原语完全在 **Effect 系统** 内工作，天然支持结构化并发和资源安全。

| 原语 | 场景 | 核心特性 |
|------|------|---------|
| `Ref` | 共享状态 | 原子 CAS 更新 |
| `SynchronizedRef` | 复合状态更新 | 带 Effect 的互斥访问 |
| `Queue` | 生产者-消费者 | 有界背压 |
| `Hub` | 发布-订阅 | 一对多广播 |

---

## 1. Ref：原子引用

`Ref<A>` 是一个封装了不可变值 `A` 的引用，所有更新操作都是**原子的**，无需加锁。

### 1.1 基本操作

```typescript
import { Ref, Effect, Console } from "effect"

// 创建 Ref
const program = Effect.gen(function* (_) {
  // 初始值
  const ref = yield* _(Ref.make(0))
  
  // 读取
  const current = yield* _(ref.get)
  Console.log(`current: ${current}`) // 0
  
  // 设置
  yield* _(ref.set(42))
  
  // 更新（原子操作）
  yield* _(ref.update((n) => n + 1))
  
  // 更新并返回旧值
  const old = yield* _(ref.getAndUpdate((n) => n * 2))
  Console.log(`old: ${old}, new: ${yield* _(ref.get)}`)
  // old: 43, new: 86
})

Effect.runPromise(program)
```

### 1.2 竞态安全

**关键特性**：即使多个 Fiber 同时更新 `Ref`，也不会出现脏写：

```typescript
import { Ref, Effect, Fiber, Console } from "effect"

const concurrentUpdate = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))
  
  // 100 个 Fiber 并发递增
  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 100 }),
    () =>
      ref.update((n) => n + 1).pipe(
        Effect.fork  // 每个更新在一个独立 Fiber 中执行
      ),
    { concurrency: "unbounded" }
  ))
  
  // 等待所有完成
  yield* _(Fiber.joinAll(fibers))
  
  const final = yield* _(ref.get)
  Console.log(`final: ${final}`) // 100 ✅ 每次都能得到 100
})

Effect.runPromise(concurrentUpdate)
```

`ref.update` 内部使用 CAS（Compare-And-Swap）循环：读取当前值 → 应用函数 → 尝试写入，如果失败则重试。

### 1.3 高级更新操作

```typescript
import { Ref, Effect } from "effect"

// modifyAndGet：更新并返回新值
const incrementAndGet = ref.pipe(
  Ref.modifyAndGet((n) => n + 1),
  Effect.andThen((newValue) => Effect.succeed(newValue))
)

// getAndModify：返回当前值，然后更新
const getAndReset = ref.pipe(
  Ref.getAndModify((n) => [n, 0]), // [returnValue, newState]
)

// 条件更新（modifySome）
const conditionalUpdate = ref.pipe(
  Ref.modifySome((n) => {
    if (n > 100) return [true, n - 100] // 条件满足，返回 Some
    return [false, n]                    // 条件不满足
  }, -1) // 失败时的默认值
)
```

---

## 2. SynchronizedRef：带 Effect 的互斥更新

当更新操作本身包含 `Effect` 时（例如确认余额足够再扣款），`Ref` 的 CAS 机制无法保证跨多步操作的原子性。此时需要使用 `SynchronizedRef`。

```typescript
import { SynchronizedRef, Effect, Console } from "effect"

// 场景：银行转账，需要先检查余额再扣款
interface Account {
  balance: number
  frozen: boolean
}

const safeTransfer = Effect.gen(function* (_) {
  const sRef = yield* _(SynchronizedRef.make<Account>({
    balance: 1000,
    frozen: false
  }))
  
  // SynchronizedRef.updateEffect 保证整个 Effect 原子执行
  // 在此期间，其他 Fiber 的更新会被排队等待
  
  const transfer = (amount: number) =>
    sRef.updateEffect((account) =>
      Effect.gen(function* (_) {
        // 异步检查（例如调用外部风控 API）
        const riskApproved = yield* _(
          Effect.succeed(account.balance >= amount * 2)
        )
        
        if (!riskApproved) {
          yield* _(Console.log("risk check failed"))
          return account // 返回原状态，无变化
        }
        
        Console.log(`transfer ${amount}, balance: ${account.balance}`)
        return { ...account, balance: account.balance - amount }
      })
    )
  
  // 并发转账 —— 安全检查不会出现竞态条件
  yield* _(Effect.forEach(
    [100, 200, 50],
    (amount) => transfer(amount).pipe(Effect.fork),
    { concurrency: "unbounded" }
  ))
})

Effect.runPromise(safeTransfer)
```

---

## 3. Queue：生产者-消费者

`Queue<A>` 是一个有界/无界的 FIFO 队列，用于在 Fiber 之间传递数据。核心特性是**背压**：当队列满时，生产者会被阻塞（有界队列），反之消费者在队列空时被阻塞。

### 3.1 有界队列

```typescript
import { Queue, Effect, Fiber, Console } from "effect"

const boundedExample = Effect.gen(function* (_) {
  // 容量为 3 的有界队列
  const queue = yield* _(Queue.bounded<number>(3))
  
  // 生产者 Fiber
  const producer = yield* _(
    Effect.forEach(
      [1, 2, 3, 4, 5], // 5 个元素，队列容量只有 3
      (n) => queue.offer(n).pipe(
        Effect.andThen(Console.log(`offered: ${n}`))
      ),
      { concurrency: "unbounded" }
    ).pipe(Effect.fork)
  )
  
  // 消费者 Fiber（慢速）
  const consumer = yield* _(
    Effect.replicate(5,
      queue.take.pipe(
        Effect.andThen((n) =>
          Effect.sleep("1 seconds").pipe(
            Effect.andThen(Console.log(`took: ${n}`))
          )
        )
      )
    ).pipe(
      Effect.forEach(Effect.identity, { concurrency: "unbounded" }),
      Effect.fork
    )
  )
  
  yield* _(Fiber.joinAll([producer, consumer]))
})
// ✅ 第 4、5 个 offer 会等待消费者 take 之后才执行
```

### 3.2 队列策略

```typescript
import { Queue, Effect, Console } from "effect"

// dropping：队列满时丢弃新元素
const droppingQueue = Queue.dropping<number>(5)
// offer 在队列满时返回 false 但不阻塞

// sliding：队列满时丢弃最早的元素
const slidingQueue = Queue.sliding<number>(5)
// 总是能 offer 成功，但会丢弃旧数据

// unbounded：无界队列（不限容量，注意内存）
const unboundedQueue = Queue.unbounded<number>()
// 适合消费者偶尔离线，但生产者不能阻塞的场景
```

### 3.3 实际场景：任务队列

```typescript
import { Queue, Effect, Fiber, Console, Schedule } from "effect"

interface WorkItem {
  id: string
  payload: string
  priority: number
}

const workQueue = (workerCount: number) =>
  Effect.gen(function* (_) {
    const queue = yield* _(Queue.bounded<WorkItem>(100))
    
    // 启动多个 Worker Fiber
    const workers = yield* _(
      Effect.forEach(
        Array.from({ length: workerCount }),
        (_, i) =>
          Effect.gen(function* (__) {
            yield* __(Console.log(`worker ${i} started`))
            
            while (true) {
              const item = yield* __(queue.take)
              yield* __(
                processWork(item).pipe(
                  Effect.retry(
                    Schedule.exponential("100 millis").pipe(
                      Schedule.intersect(Schedule.recurs(3))
                    )
                  ),
                  Effect.catchAll((err) =>
                    Console.log(`worker ${i} failed on item ${item.id}: ${err}`)
                  )
                )
              )
            }
          }).pipe(Effect.fork),
        { concurrency: "unbounded" }
      )
    )
    
    return { queue, workers }
  })
```

---

## 4. Hub：发布-订阅

`Hub<A>` 是一个广播通道：一个生产者发送消息，多个消费者各自接收到完整的消息流。类似于 RxJS 的 `Subject` 或 Kafka 的 Topic。

### 4.1 基本用法

```typescript
import { Hub, Queue, Effect, Fiber, Console } from "effect"

const pubSubExample = Effect.gen(function* (_) {
  // 创建 Hub（容量为 16 的发布订阅通道）
  const hub = yield* _(Hub.bounded<{ type: string; data: string }>(16))
  
  // 订阅者 1
  const sub1 = yield* _(hub.pipe(Hub.subscribe, Effect.flatMap(
    (queue: Queue.Queue<{ type: string; data: string }>) =>
      Effect.gen(function* (_) {
        for (let i = 0; i < 3; i++) {
          const msg = yield* _(queue.take)
          Console.log(`[sub1] received: ${msg.type} - ${msg.data}`)
        }
      }).pipe(Effect.fork)
  )))
  
  // 订阅者 2（独立消费流）
  const sub2 = yield* _(hub.pipe(Hub.subscribe, Effect.flatMap(
    (queue) =>
      Effect.gen(function* (_) {
        for (let i = 0; i < 3; i++) {
          const msg = yield* _(queue.take)
          Console.log(`[sub2] received: ${msg.type} - ${msg.data}`)
        }
      }).pipe(Effect.fork)
  )))
  
  // 发布消息
  yield* _(hub.publish({ type: "order.created", data: "order-1" }))
  yield* _(hub.publish({ type: "payment.received", data: "pay-1" }))
  yield* _(hub.publish({ type: "order.shipped", data: "ship-1" }))
  
  // 等待订阅者处理结束
  yield* _(Fiber.joinAll([sub1, sub2]))
})

Effect.runPromise(pubSubExample)
// 输出：
// [sub1] received: order.created - order-1
// [sub2] received: order.created - order-1
// [sub1] received: payment.received - pay-1
// [sub2] received: payment.received - pay-1
// ...
```

### 4.2 实际场景：事件总线

```typescript
import { Hub, Effect, Console } from "effect"

// 定义应用级事件
type AppEvent =
  | { type: "user.login"; userId: string }
  | { type: "user.logout"; userId: string }
  | { type: "order.placed"; orderId: string; amount: number }

// 全局事件总线
class EventBus {
  private hub: Hub.Hub<AppEvent>
  
  constructor(capacity: number = 256) {
    this.hub = Hub.bounded<AppEvent>(capacity)
  }
  
  // 订阅特定类型的事件
  subscribe<T extends AppEvent["type"]>(
    type: T
  ): Effect.Effect<AppEvent & { type: T }, never, never> {
    return Hub.subscribe(this.hub).pipe(
      Effect.flatMap((queue) =>
        queue.take.pipe(
          Effect.filterOrDieMessage(
            (e): e is AppEvent & { type: T } => e.type === type,
            "wrong event type"
          )
        )
      ),
      Effect.retry({ times: 3 })
    )
  }
  
  // 发布事件
  publish(event: AppEvent) {
    return this.hub.publish(event)
  }
}

// 使用
Effect.gen(function* (_) {
  const bus = new EventBus()
  
  // 订阅登录事件
  yield* _(
    bus.subscribe("user.login").pipe(
      Effect.andThen((event) =>
        Console.log(`user logged in: ${event.userId}`)
      ),
      Effect.fork
    )
  )
  
  // 发布事件
  yield* _(bus.publish({ type: "user.login", userId: "u-123" }))
})
```

### 4.3 Hub vs Channel

`Channel` 是比 Hub 更低级的原语，提供了流式处理的最基础抽象。在实际应用中优先使用 `Stream` 和 `Hub`，仅在需要自定义背压策略或极低延迟场景时才使用 `Channel`。

---

## 5. 并发原语对比

| 特性 | Ref | SynchronizedRef | Queue | Hub |
|------|-----|----------------|-------|-----|
| 数据流 | 单值 | 单值 | FIFO 队列 | 广播 |
| 消费者数 | 单 | 单 | 单 | 多 |
| 背压 | 无 | 无 | 有 | 有（per-sub） |
| 原子范围 | 单操作 | 多步 Effect | N/A | N/A |
| 典型容量 | 1 | 1 | 可配置 | 可配置 |

---

## 6. 性能注意事项

```typescript
import { Queue, Effect } from "effect"

// 1. 选择合适的队列大小
// 太小 → 生产频繁阻塞
// 太大 → 内存占用高，消费者延迟变大
const balanced = Queue.bounded<number>(
  // 建议：峰值吞吐量 × 最大容忍延迟（秒）
  // 例如：1000 req/s × 0.1s = 100
  100
)

// 2. 避免频繁的 offer + take 空转
// 可以用 chunked 操作批量处理
const batchProcess = (queue: Queue.Queue<number>) =>
  Queue.takeBetween(queue, 1, 100).pipe(
    Effect.andThen((items) =>
      // 批量处理 items
      Effect.succeed(items.reduce((a, b) => a + b, 0))
    )
  )

// 3. Shutdown 清理
const withCleanup = (queue: Queue.Queue<number>) =>
  queue.shutdown.pipe(
    Effect.andThen(Console.log("queue shut down")),
    Effect.ensuring(
      // 确保消费者 Fiber 也被清理
      Effect.sync(() => console.log("consumer cleanup"))
    )
  )
```

---

## 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/concurrency
- API 参考：`Ref` (`effect/Ref`), `Queue` (`effect/Queue`), `Hub` (`effect/Hub`)
- 相关章节：ch06（结构化并发）、ch07（Stream）、ch09（Schedule）