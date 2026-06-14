# ch08 Ref / Queue / Hub —— 并发原语

## 概述

你的应用需要维护一个在高并发下精确递增的计数器，却担心出现竞态条件导致计数不准。或者你需要实现一个生产者-消费者模式：多个请求处理器向队列提交任务，固定数量的 Worker 从队列中取出并执行。再或者，你希望实现一个实时事件总线：一个订单创建事件能被日志记录器、库存系统和通知服务同时接收并独立处理。

在这些场景中，你需要的不是互斥锁或 `SharedArrayBuffer`——而是 Effect-TS 提供的三个精心设计的并发原语：**Ref**（原子引用）、**Queue**（队列）和 **Hub**（广播通道）。

它们完全在 **Effect 系统** 内工作，天然支持结构化并发和资源安全，与 Fiber 模型无缝集成。

```typescript
import { Ref, Queue, Hub, Effect, Console } from "effect"

// 三原语对比
const refDemo = Ref.make(0)          // 原子状态
const queueDemo = Queue.bounded<number>(10) // 有界队列
const hubDemo = Hub.bounded<number>(10)     // 广播通道
```

| 原语 | 场景 | 核心特性 |
|------|------|---------|
| `Ref` | 共享状态 | 原子 CAS 更新 |
| `SynchronizedRef` | 复合状态更新 | 带 Effect 的互斥访问 |
| `Queue` | 生产者-消费者 | 有界背压 |
| `Hub` | 发布-订阅 | 一对多广播 |

---

### 使用场景

#### 1. 计数器与累计统计（Ref）

Web 服务器需要记录请求总数、当前活跃连接数和累计错误数。这些计数器会被多个 Fiber 同时更新：

```typescript
import { Ref, Effect, Console } from "effect"

interface ServerStats {
  totalRequests: number
  activeConnections: number
  errors: number
}

const createStats = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make<ServerStats>({
    totalRequests: 0,
    activeConnections: 0,
    errors: 0
  }))
  
  // 请求到达
  const onRequest = ref.update((s) => ({
    ...s,
    totalRequests: s.totalRequests + 1,
    activeConnections: s.activeConnections + 1
  }))
  
  // 请求完成
  const onRequestEnd = ref.update((s) => ({
    ...s,
    activeConnections: s.activeConnections - 1
  }))
  
  return { ref, onRequest, onRequestEnd }
})
```

#### 2. 任务队列（Queue）

图片处理系统接收用户上传，需要异步生成缩略图。上传速度可能远快于处理速度，队列提供背压保护：

```typescript
import { Queue, Effect, Fiber, Console } from "effect"

interface ImageTask {
  userId: string
  imagePath: string
  sizes: number[]
}

const imageProcessingSystem = Effect.gen(function* (_) {
  // 有界队列，最多积压 100 个任务
  const queue = yield* _(Queue.bounded<ImageTask>(100))
  
  // 启动 4 个 Worker Fiber
  const workers = yield* _(
    Effect.forEach(
      Array.from({ length: 4 }),
      (_, i) => createWorker(queue, i).pipe(Effect.fork),
      { concurrency: "unbounded" }
    )
  )
  
  return { queue, workers }
})
```

#### 3. 实时通知系统（Hub）

电子商务系统中，下单事件需要通知多个子系统：通知用户、更新库存、触发物流、记录日志。Hub 天然支持这种广播模式：

```typescript
import { Hub, Effect, Console, Fiber } from "effect"

type OrderEvent =
  | { type: "order.created"; orderId: string; userId: string }
  | { type: "payment.received"; orderId: string; amount: number }
  | { type: "order.shipped"; orderId: string; trackingId: string }

// 全局事件总线
const eventHub = Hub.bounded<OrderEvent>(256)
```

#### 4. 连接池管理（Ref + Queue 组合）

数据库连接池需要同时满足原子状态跟踪和队列等待：

```typescript
import { Ref, Queue, Effect } from "effect"

class ConnectionPool {
  private available = Queue.bounded<Connection>(10)
  private inUse = Ref.make(0)
  
  acquire = Effect.gen(function* (_) {
    const conn = yield* _(this.available.take)
    yield* _(this.inUse.update((n) => n + 1))
    return conn
  })
  
  release = (conn: Connection) =>
    Effect.gen(function* (_) {
      yield* _(this.inUse.update((n) => n - 1))
      yield* _(this.available.offer(conn))
    })
}
```

---

### 实现原理

#### Ref 原子操作 vs 锁

`Ref` 内部使用 **CAS（Compare-And-Swap）** 循环实现原子性，不依赖操作系统互斥锁：

```typescript
// 伪代码：Ref.update 的内部机制
function updateRef<A>(ref: Ref<A>, f: (a: A) => A): Effect<A> {
  return Effect.suspend(() => {
    const current = ref.current       // 1. 读取当前值
    const newValue = f(current)       // 2. 计算新值（纯函数）
    const swapped = cas(ref, current, newValue) // 3. CAS 写入
    if (swapped) return Effect.succeed(newValue) // 成功
    return updateRef(ref, f)          // 失败则重试
  })
}
```

对比 Ref 与传统锁方案：

| 特性 | 传统互斥锁 | Ref（CAS） |
|------|-----------|-----------|
| 底层机制 | 操作系统锁 | 原子 CAS 指令 |
| 等待方式 | 线程阻塞/上下文切换 | 无阻塞重试 |
| 适用场景 | 长时间操作 | 快速状态更新 |
| 组合更新 | 需额外处理 | modify 原子组合 |
| Effect 内部 | 存在死锁风险 | 纯函数操作安全 |

#### SynchronizedRef 组合更新

当更新操作本身包含 `Effect` 时（例如确认余额足够再扣款），`Ref` 的 CAS 机制无法保证跨多步操作的原子性。`SynchronizedRef` 使用 Fiber 间的互斥信号量解决这个问题：

```typescript
import { SynchronizedRef, Effect, Console } from "effect"

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
  const transfer = (amount: number) =>
    sRef.updateEffect((account) =>
      Effect.gen(function* (_) {
        // 模拟异步风控检查
        const riskApproved = yield* _(
          Effect.succeed(account.balance >= amount * 2)
        )
        
        if (!riskApproved) {
          yield* _(Console.log("risk check failed"))
          return account
        }
        
        yield* _(Console.log(`transfer ${amount}`))
        return { ...account, balance: account.balance - amount }
      })
    )
  
  // 并发转账
  yield* _(Effect.forEach(
    [100, 200, 50],
    (amount) => transfer(amount).pipe(Effect.fork),
    { concurrency: "unbounded" }
  ))
})
```

#### Queue 背压策略

Queue 提供四种背压策略，分场景选择：

| 策略 | 构造方法 | 队列满时行为 | 适用场景 |
|------|---------|-------------|---------|
| 有界阻塞 | `Queue.bounded(n)` | 生产者阻塞等待 | 稳定吞吐系统 |
| 丢弃新元素 | `Queue.dropping(n)` | 返回 false，不阻塞 | 监控指标采集 |
| 丢弃旧元素 | `Queue.sliding(n)` | 自动淘汰最早元素 | 实时行情，只关心最新 |
| 无界 | `Queue.unbounded()` | 永不阻塞 | 消费者偶尔离线场景 |

```typescript
import { Queue, Effect, Console } from "effect"

// dropping：系统负载过高时丢弃非关键任务
const droppingQueue = Queue.dropping<LogEntry>(1000)
// offer 在队列满时返回 false 但不阻塞生产者

// sliding：保留最新行情数据
const slidingQueue = Queue.sliding<Price>(100)
// offer 总是成功，但旧行情被丢弃

// unbounded：消费者可能离线，但不能丢失消息
const unboundedQueue = Queue.unbounded<CriticalEvent>()
// ⚠️ 注意：消费者长期离线会导致 OOM
```

#### Hub 广播语义

Hub 在底层管理一组订阅 Queue。每条发布的消息会复制到所有活跃订阅者的队列中：

```typescript
import { Hub, Effect } from "effect"

// Hub 内部结构示意
// Hub.bounded(capacity) 创建后：
// - 每个 subscribe 调用创建一个新的 Queue（附属于 Hub）
// - publish 将消息推送到所有订阅 Queue
// - 如果某个订阅 Queue 已满，publish 会被阻塞
//   （这就是 Hub 的"订阅级别背压"）
```

不同于传统的事件发射器（EventEmitter），Hub 的每个订阅者拥有独立消费队列——一个慢订阅者不会影响其他订阅者的消费速度。

---

### 潜在风险

#### 1. Ref.update 内部执行 Effect 导致死锁

```typescript
import { Ref, Effect } from "effect"

// ❌ 错误示范：Ref.update 内使用 Effect
const ref = yield* _(Ref.make(0))

yield* _(ref.update((n) => {
  // 这里的 n * 2 是纯函数，没问题
  return n * 2
}))

// ❌ 危险：update 回调必须是纯函数！
// ref.update((n) => {
//   const result = yield* _(someEffect) // 编译错误 ✅ TypeScript 阻止了
//   return result
// })

// ✅ 正确：如果需要 Effect，先读取再更新
const current = yield* _(ref.get)
const newValue = yield* _(someEffect)
yield* _(ref.set(current + newValue))

// 或者使用 modify 在一次原子操作中完成
yield* _(ref.modify((n) => [n, n + 1])) // [返回值, 新状态]
```

#### 2. Ref.update 回调内的可变捕获导致非原子性

```typescript
import { Ref, Effect } from "effect"

// ❌ 错误：update 回调依赖外部可变变量
let externalFlag = true
yield* _(ref.update((n) => {
  if (externalFlag) return n + 1 // 非原子！externalFlag 可能在 CAS 重试时被修改
  return n
}))

// ✅ 正确：update 应只依赖被更新值本身
yield* _(ref.update((n) => n + 1))

// ✅ 如果确实需要外部条件，先读取再判断
const flag = externalFlag
yield* _(ref.update((n) => {
  if (flag) return n + 1
  return n
}))
```

#### 3. 无界队列内存爆炸

```typescript
// ❌ 危险：消费者处理慢，无界队列无限增长
const queue = Queue.unbounded<number>()

// 生产者快速投递
for (let i = 0; i < 1000000; i++) {
  queue.offer(i) // 内存暴涨
}

// ✅ 安全：使用有界队列 + 选择性丢队
const safeQueue = Queue.sliding<number>(1000)

// ✅ 或者监控队列大小
const monitored = Queue.bounded<number>(1000)
const offerWithCheck = (item: number) =>
  monitored.isFull().pipe(
    Effect.flatMap((isFull) =>
      isFull
        ? Console.warn("queue full, dropping item")
        : monitored.offer(item)
    )
  )
```

#### 4. Hub 订阅者忘记取消导致资源泄漏

```typescript
// ❌ 危险：Hub 订阅不被取消
const sub = yield* _(Hub.subscribe(hub))
// sub 是一个 Queue，即使不再需要也占用内存

// ✅ 正确：结构化并发自动清理
yield* _(
  Hub.subscribe(hub).pipe(
    Effect.flatMap((queue) =>
      Effect.gen(function* (_) {
        // 消费消息...
        yield* _(queue.take)
      })
    ),
    Effect.scoped // 自动取消订阅
  )
)
```

---

### 优化策略

| 场景 | 建议 | 原因 |
|------|------|------|
| 热点 Ref 频繁更新 | 使用 `Ref.modify` 取代 `get + set` | 减少 CAS 重试次数 |
| 复杂状态结构 | 最小化 Ref 粒度，拆分为多个 Ref | 减少不必要的 CAS 冲突 |
| 队列容量选择 | 容量 = 峰值吞吐量 × 最大容忍等待时间 | 平衡阻塞概率与内存 |
| Hub 慢消费者 | 使用 `Hub.sliding` 或 `Hub.dropping` | 避免慢消费者阻塞发布者 |
| 批量消费 | 使用 `Queue.takeBetween` / `Queue.takeUpTo` | 减少 Fiber 调度开销 |
| Fiber 数量控制 | `Effect.forEach` 的 `concurrency` 参数 | 避免无限 Fiber 创建 |

```typescript
import { Queue, Effect } from "effect"

// 批量消费优化
const batchWithTimeout = (queue: Queue.Queue<number>) =>
  Queue.takeBetween(queue, 1, 100).pipe(
    Effect.timeout("100 millis"),
    Effect.catchAll(() => Effect.succeed([] as number[])),
    Effect.filterOrElse(
      (items) => items.length > 0,
      () => batchWithTimeout(queue) // 重试直到取到数据
    )
  )
```

---

### 典型问题处理

#### 问题 1：Ref.update 回调中包含 Effect

```typescript
import { Ref, SynchronizedRef, Effect } from "effect"

// ❌ 错误：用 Ref.update 处理带 Effect 的更新
yield* _(ref.update((n) => {
  // 这里不能执行 Effect！
  return someExpensiveComputation(n) // 纯函数应该快速完成
}))

// ✅ 方法 1：拆分为 get + Effect + set
const current = yield* _(ref.get)
const result = yield* _(someEffect(current))
yield* _(ref.set(result))

// ✅ 方法 2：使用 SynchronizedRef.updateEffect
yield* _(sRef.updateEffect((n) =>
  someEffect(n).pipe(Effect.map((result) => result))
))
```

#### 问题 2：消费者从空队列取数据时阻塞

```typescript
// ❌ 问题：take 在队列空时无限阻塞
queue.take // 没有数据时一直等

// ✅ 方案 1：使用 poll（非阻塞，队列空时返回 None）
const maybeItem = yield* _(queue.poll)

// ✅ 方案 2：带超时的 take
const itemWithTimeout = yield* _(
  queue.take.pipe(Effect.timeout("5 seconds"))
)

// ✅ 方案 3：shutdown 后所有等待 fiber 同时唤醒
yield* _(queue.shutdown)
// 所有挂起的 take/offer 会收到 None 或错误
```

#### 问题 3：多个生产者同时向 Ref 写入导致频繁 CAS 冲突

```typescript
// ❌ 问题：高并发下 CAS 频繁重试
for (let i = 0; i < 100; i++) {
  yield* _(ref.update((n) => n + 1).pipe(Effect.fork))
}

// ✅ 优化：使用 Ref.modify 减少重试窗口
yield* _(ref.modify((n) => [n, n + 1])) // 单次 CAS 完成

// ✅ 或者拆分为分片计数器
const sharded = Array.from({ length: 10 }, () => Ref.make(0))
const increment = (index: number) =>
  sharded[index % 10].update((n) => n + 1)
```

---

### 开发者技能

#### 1. 渐进掌握 Ref（3 步）

**第一步：基本计数器**

```typescript
import { Ref, Effect, Console } from "effect"

const counter = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))
  yield* _(ref.update((n) => n + 1))
  yield* _(ref.update((n) => n + 1))
  const result = yield* _(ref.get)
  Console.log(`counter: ${result}`) // counter: 2
})
```

**第二步：并发安全计数器**

```typescript
const concurrentCounter = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))
  
  yield* _(
    Effect.forEach(
      Array.from({ length: 1000 }),
      () => ref.update((n) => n + 1),
      { concurrency: "unbounded" }
    )
  )
  
  const result = yield* _(ref.get)
  Console.log(`concurrent counter: ${result}`) // 1000 ✅
})
```

**第三步：条件修改和复杂状态**

```typescript
const conditionalModify = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(100))
  
  // 只有当余额充足时才扣款
  const result = yield* _(ref.modify((balance) => {
    if (balance >= 50) {
      return [true, balance - 50] // [返回值, 新状态]
    }
    return [false, balance] // 不修改
  }))
  
  Console.log(`withdrew: ${result}`) // true 或 false
})
```

#### 2. 生产者-消费者模式（Queue 渐进示例）

```typescript
import { Queue, Effect, Console, Fiber } from "effect"

// 第一步：单生产者单消费者
const simple = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(5))
  
  yield* _(queue.offer(1))
  yield* _(queue.offer(2))
  
  const a = yield* _(queue.take)
  const b = yield* _(queue.take)
  
  Console.log(`${a}, ${b}`) // 1, 2
})

// 第二步：多生产者多消费者
const multi = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(20))
  
  // 2 个生产者，各生产 5 个
  const producers = yield* _(
    Effect.forEach(
      [1, 2],
      (id) =>
        Effect.forEach(
          Array.from({ length: 5 }, (_, i) => id * 100 + i),
          (n) =>
            queue.offer(n).pipe(
              Effect.andThen(Console.log(`producer ${id} offered ${n}`))
            ),
          { concurrency: "unbounded" }
        ).pipe(Effect.fork),
      { concurrency: "unbounded" }
    )
  )
  
  // 3 个消费者，各消费 3 个
  const consumers = yield* _(
    Effect.forEach(
      Array.from({ length: 3 }),
      (_, id) =>
        Effect.replicate(
          3,
          queue.take.pipe(
            Effect.andThen((n) => Console.log(`consumer ${id} took ${n}`))
          )
        ).pipe(
          Effect.forEach(Effect.identity, { concurrency: "unbounded" }),
          Effect.fork
        ),
      { concurrency: "unbounded" }
    )
  )
  
  yield* _(Fiber.joinAll([...producers, ...consumers]))
})
// 输出（顺序不定）：
// producer 1 offered 100
// producer 1 offered 101
// consumer 0 took 100
// ...
```

#### 3. 发布-订阅模式（Hub 渐进示例）

```typescript
import { Hub, Effect, Console, Fiber } from "effect"

// 第一步：创建 Hub 并发布订阅
const basicPubSub = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<string>(10))
  
  // 订阅者 1
  const sub1 = yield* _(Hub.subscribe(hub).pipe(
    Effect.flatMap((queue) =>
      queue.take.pipe(
        Effect.andThen((msg) => Console.log(`[1] ${msg}`))
      )
    ),
    Effect.fork
  ))
  
  // 订阅者 2
  const sub2 = yield* _(Hub.subscribe(hub).pipe(
    Effect.flatMap((queue) =>
      queue.take.pipe(
        Effect.andThen((msg) => Console.log(`[2] ${msg}`))
      )
    ),
    Effect.fork
  ))
  
  yield* _(hub.publish("hello"))
  yield* _(Fiber.joinAll([sub1, sub2]))
})
// [1] hello
// [2] hello

// 第二步：结构化订阅（自动清理）
const scopedPubSub = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<string>(10))
  yield* _(hub.publish("hello"))
  
  // 使用 scope 确保订阅在作用域结束时取消
  const result = yield* _(
    Effect.scoped(
      Effect.gen(function* (_) {
        const queue = yield* _(Hub.subscribe(hub))
        return yield* _(queue.take)
      })
    )
  )
  Console.log(result) // hello
})
```

---

### 示例代码

#### 完整例子：事件发布订阅系统

```typescript
import {
  Hub, Queue, Effect, Console, Fiber, Scope
} from "effect"

// 定义系统事件类型
type SystemEvent =
  | { type: "user.login"; userId: string; timestamp: number }
  | { type: "order.placed"; orderId: string; amount: number }
  | { type: "error.occurred"; service: string; message: string }

// 事件总线服务
class EventBus {
  constructor(private hub: Hub.Hub<SystemEvent>) {}
  
  static create(capacity: number = 256) {
    return Effect.map(
      Hub.bounded<SystemEvent>(capacity),
      (hub) => new EventBus(hub)
    )
  }
  
  // 发布事件
  publish(event: SystemEvent) {
    return this.hub.publish(event)
  }
  
  // 按类型订阅（自动过滤）
  subscribe<T extends SystemEvent["type"]>(
    type: T
  ) {
    return Hub.subscribe(this.hub).pipe(
      Effect.flatMap((queue) =>
        Effect.gen(function* (_) {
          while (true) {
            const event = yield* _(queue.take)
            if (event.type === type) {
              return event as Extract<SystemEvent, { type: T }>
            }
          }
        })
      ),
      Effect.scoped
    )
  }
  
  // 发布者数量
  subscriberCount() {
    return this.hub.subscriberCount()
  }
}

// 使用示例
const main = Effect.gen(function* (_) {
  const bus = yield* _(EventBus.create(128))
  
  // 订阅登录事件（后台 Fiber）
  yield* _(
    bus.subscribe("user.login").pipe(
      Effect.andThen((event) =>
        Console.log(
          `[AUDIT] user ${event.userId} logged in at ${event.timestamp}`
        )
      ),
      Effect.forever,
      Effect.fork
    )
  )
  
  // 订阅订单事件（后台 Fiber）
  yield* _(
    bus.subscribe("order.placed").pipe(
      Effect.andThen((event) =>
        Console.log(
          `[ORDER] order ${event.orderId} for $${event.amount}`
        )
      ),
      Effect.forever,
      Effect.fork
    )
  )
  
  // 发布事件
  yield* _(bus.publish({
    type: "user.login",
    userId: "user-001",
    timestamp: Date.now()
  }))
  
  yield* _(bus.publish({
    type: "order.placed",
    orderId: "order-123",
    amount: 99.99
  }))
})
// [AUDIT] user user-001 logged in at 1718000000000
// [ORDER] order order-123 for $99.99
```

---

### 本章小结

| 知识点 | 要点 | 使用场景 |
|--------|------|---------|
| Ref 原子操作 | CAS 无锁更新，纯函数回调 | 计数器、配置、状态跟踪 |
| SynchronizedRef | Effect 级别的互斥访问 | 转账、余额检查、多步更新 |
| Queue 四种策略 | bounded / dropping / sliding / unbounded | 任务队列、连接池、背压保护 |
| Hub 广播 | 一对多发布订阅，独立消费队列 | 事件总线、实时通知、审计日志 |
| 资源安全 | Scope 自动取消订阅和关闭队列 | 所有并发原语使用场景 |
| 批量消费 | takeBetween / takeUpTo | 减少调度开销，提升吞吐 |

**一句话总结**：三个原语分别解决**状态共享**、**数据传递**和**事件广播**三类核心并发问题，且完全在 Effect 系统的结构化并发框架内工作——忘记关闭队列或取消订阅不会造成资源泄漏。

---

### 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/concurrency
- API 参考：`Ref` (`effect/Ref`), `Queue` (`effect/Queue`), `Hub` (`effect/Hub`)
- 相关章节：ch06（结构化并发）、ch07（Stream）、ch09（Schedule）、ch14（运行时排查）