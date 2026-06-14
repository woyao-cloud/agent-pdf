# ch09 Schedule 调度器

## 概述

你的支付接口每天处理数百万笔交易，但偶尔会因网络抖动或上游服务超时而失败。简单地固定间隔重试三次可能会引发更严重的问题——当 1000 个请求都在同一秒重试时，原本只是轻微抖动的 API 会被真正的流量洪峰击垮。你需要一个**智能的重试策略**：间隔逐渐增大、加上随机抖动分散重试时间、超过总时间预算后放弃。

或者，你需要每小时整点执行一次缓存刷新、每 30 秒检查一次服务健康状态、或者在每天的凌晨 3 点运行数据清理任务。这些看似不同的需求背后，共享同一个核心抽象——**Schedule**。

`Schedule` 是 Effect-TS 中最具特色的模块之一。它将"重试策略"和"定时调度"抽象为一个**可组合的数据结构**，而非硬编码的配置参数。这意味着你可以像组合 `Effect` 一样组合 `Schedule`——叠加、交叉、取并集、映射输出，构建出极其灵活的调度策略。

```typescript
import { Schedule, Effect, Console } from "effect"

// Schedule 的类型签名
// Schedule<Out, In, R>
//  - Out: 每次调度产生的输出值类型
//  - In: 所需的输入类型（通常是 void 或 unknown）
//  - R: 所需的环境依赖
```

---

### 使用场景

#### 1. 支付接口重试（指数退避 + 抖动防雪崩）

```typescript
import { Schedule, Effect, Console, Duration, pipe } from "effect"

// 支付 API 调用策略
const paymentRetryPolicy = pipe(
  Schedule.exponential("100 millis"),    // 初始 100ms，每次翻倍
  Schedule.jittered(0.1, 2.0),          // 随机抖动 ± 0.1x ~ 2x
  Schedule.intersect(Schedule.recurs(5)), // 最多 5 次
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.untilOutput((d) => d >= Duration.decode("30 seconds"))
    )
  )
)

// 应用到支付调用
const chargePayment = (amount: number) =>
  Effect.tryPromise({
    try: () => fetch("https://payment.example.com/charge", {
      method: "POST",
      body: JSON.stringify({ amount })
    }),
    catch: (err) => new Error(`Payment API error: ${err}`)
  }).pipe(
    Effect.retry(paymentRetryPolicy),
    Effect.timeout("10 seconds"),
    Effect.catchAll((err) =>
      Console.error(`payment failed: ${err}`)
    )
  )
```

#### 2. 定时健康检查

```typescript
import { Schedule, Effect, Console } from "effect"

// 每 30 秒检查服务健康状态，连续失败 3 次后告警
const healthCheck = (serviceUrl: string) =>
  Effect.tryPromise({
    try: () => fetch(`${serviceUrl}/health`),
    catch: (err) => new Error(String(err))
  }).pipe(
    Effect.repeat(
      Schedule.fixed("30 seconds").pipe(
        Schedule.intersect(Schedule.recurs(Number.POSITIVE_INFINITY)) // 无限重复
      )
    ),
    Effect.catchAll((err) =>
      Console.error(`[ALERT] service ${serviceUrl} unhealthy: ${err}`)
    )
  )
```

#### 3. 定时任务调度（缓存刷新 / 数据清理 / 邮件发送）

```typescript
import { Schedule, Effect, Console } from "effect"

// 每小时整点刷新缓存
const cacheRefresh = Effect.sync(() => {
  /* 重新加载热点数据 */
}).pipe(
  Effect.repeat(Schedule.cron("0 * * * *"))
)

// 每天凌晨 3 点清理过期数据
const cleanup = Effect.sync(() => {
  /* 删除 30 天前的日志 */
}).pipe(
  Effect.repeat(Schedule.cron("0 3 * * *"))
)

// 每工作日早 9 点发送报表
const report = Effect.sync(() => {
  /* 生成并发送日报 */
}).pipe(
  Effect.repeat(Schedule.cron("0 9 * * 1-5"))
)
```

#### 4. 渐进式降级策略

当上游服务不稳定时，先用快速重试，失败后切换到慢速重试，最后降级到缓存或默认值：

```typescript
import { Schedule, Effect, Console, Duration } from "effect"

const tieredRetry = pipe(
  // 阶段 1：快速重试（100ms, 200ms, 400ms）
  Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(3))
  ),
  // 阶段 2：慢速重试（每 5 秒一次，最多 6 次）
  Schedule.andThen(
    Schedule.spaced("5 seconds").pipe(
      Schedule.intersect(Schedule.recurs(6))
    )
  ),
  // 阶段 3：降级（返回缓存数据）
  Schedule.andThen(Schedule.once) // 最后一次尝试
)
// 总重试时间：~8 秒快速 + ~30 秒慢速 + 降级
```

---

### 实现原理

#### Schedule 作为可组合数据结构

与大多数库将重试策略定义为配置对象不同，Effect-TS 的 Schedule 是一个**一等公民的数据结构**。它描述的是"什么时候该做什么"，而不是"重试几次、间隔多少毫秒"这些僵硬的参数。

```typescript
import { Schedule, Effect, Duration } from "effect"

// Schedule 本质上是一个状态机
// 它接收输入（通常是执行的中间结果）
// 决定是否继续，并计算下一次的延迟

// Schedule 的两个核心问题：
// 1. ShouldContinue: 根据当前状态和输入，决定是否继续
// 2. NextDelay: 计算下一次执行的等待时间
```

这种设计让 Schedule 具备了与 Effect 同等级别的组合能力——你可以 `intersect`、`union`、`andThen`、`map` 它们，就像组合函数一样自然。

#### 决策树（Decision）模型

Schedule 内部使用一种决策树结构来表示调度策略：

```typescript
// 伪代码：Schedule 的决策模型
type Decision<A> =
  | { type: "continue"; delay: Duration; state: A }
  | { type: "done" }

// Schedule<Out, In, R> 的核心操作：
// step: (now: number, input: In, state: State) =>
//   Effect<Decision<Out>, never, R>
```

每次调度调用时，Schedule 会：
1. 接收当前时间、输入值和当前状态
2. 根据策略计算出 Decision：继续（附带延迟）或结束
3. 更新内部状态用于下次决策

```typescript
import { Schedule, Effect, Console } from "effect"

// 手动查看 Schedule 的执行步骤（用于调试）
const steps = Effect.gen(function* (_) {
  const policy = Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(3))
  )
  
  // 使用 Effect.reduce 遍历 Schedule 的每个步骤
  const delays = yield* _(Effect.reduce(
    policy,
    [] as number[],
    (acc, delay) => [...acc, delay]
  ))
  Console.log(delays) // [100, 200, 400, 800]
})
```

---

### 潜在风险

#### 1. 固定间隔重试导致雪崩

这是最经典也最常见的错误：

```typescript
// ❌ 错误示范：固定 1 秒重试
const badPolicy = Schedule.fixed("1 seconds").pipe(
  Schedule.intersect(Schedule.recurs(5))
)
// 1000 个请求同时失败 → 1 秒后同时重试 → API 再次被打垮
// 这就是惊群效应（Thundering Herd）

// ✅ 正确：指数退避 + 抖动
const goodPolicy = Schedule.exponential("500 millis").pipe(
  Schedule.jittered, // 添加随机抖动，分散重试时间
  Schedule.intersect(Schedule.recurs(5))
)
// 每个请求的重试时间被随机化，不再同步
```

对比两种策略的效果：

| 场景 | 固定间隔 | 指数退避 + 抖动 |
|------|---------|----------------|
| 1000 个请求第 1 次重试 | 1 秒后同时发起 | 0.5~1.5 秒内分散 |
| 第 3 次重试 | 3 秒后同时发起 | 2~8 秒内分散 |
| 对 API 的压力 | 峰值压力不变 | 峰值显著降低 |
| 恢复成功率 | 低（再次打垮） | 高（压力分散） |

#### 2. 无限重试导致资源耗尽

```typescript
// ❌ 危险：没有上限的重试
const infiniteRetry = Schedule.exponential("1 seconds")
// 如果 API 持续返回 500，将无限重试下去

// ✅ 安全：加上最大次数和总时间预算
const safeRetry = Schedule.exponential("1 seconds").pipe(
  Schedule.intersect(Schedule.recurs(10)),     // 最多 10 次
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.untilOutput((d) => d >= Duration.decode("60 seconds"))
    )
  ) // 最多 60 秒
)
```

#### 3. Schedule 状态共享导致策略失效

```typescript
// ❌ 错误：在多个 Effect 间共享同一个 Schedule 实例
const sharedPolicy = Schedule.recurs(3)

// 两个 Effect 使用同一个 Schedule，但状态是独立的！
// （Policy 定义可以共享，但运行时状态不共享）
// 这里没有实际风险，但要注意 Schedule 本身是无副作用的

// ✅ 正确：Schedule 定义可以安全复用
const policy = Schedule.exponential("1 seconds")

// 重用：两个不同的 Effect 使用相同的策略定义
Effect.retry(api1, policy)
Effect.retry(api2, policy)
// ✅ 每个 Effect 的调度状态是独立的
```

#### 4. 忽略抖动范围过小

```typescript
// ❌ 抖动范围太小，效果不佳
Schedule.exponential("1 seconds").pipe(
  Schedule.jittered(0.9, 1.1) // ±10%，几乎等于没抖动
)

// ✅ 有效抖动范围
Schedule.exponential("1 seconds").pipe(
  Schedule.jittered(0.5, 1.5) // ±50%：有效分散
)

// 或者使用默认抖动（[0, 1)）
Schedule.exponential("1 seconds").pipe(
  Schedule.jittered // 默认：延迟在 [0, 当前的随机值)
)
```

---

### 优化策略

| 场景 | 推荐策略 | 说明 |
|------|---------|------|
| 网络抖动 | `exponential + jittered` | 指数退避 + 随机抖动，分散重试 |
| API 限流返回 429 | `spaced + whileInput` | 检查 Retry-After 头决定等待时间 |
| 数据库死锁重试 | `exponential + recurs(3)` | 死锁通常快速自愈，3 次足够 |
| 定时心跳 | `fixed` | 精确的日历间隔，不受执行时长影响 |
| 任务间隔保护 | `spaced` | 保证相邻执行之间至少有最小间隔 |
| 整点任务 | `cron` | 标准 cron 表达式 |
| 两阶段降级 | `andThen(fast, slow)` | 先快速重试，再慢速重试，最后放弃 |
| 条件重试 | `whileInput` | 只在特定错误类型时重试 |

```typescript
import { Schedule, Effect, Duration } from "effect"

// API 限流响应优化：检查 Retry-After 头
const rateLimitAwareRetry = Schedule.fixed("1 seconds").pipe(
  // 只在收到 429 时继续重试
  Schedule.whileInput((response: Response) => response.status === 429),
  Schedule.intersect(Schedule.recurs(10))
)
```

---

### 典型问题处理

#### 问题 1：固定间隔重试导致雪崩效应

```typescript
// ❌ 错误：固定间隔导致惊群效应
Effect.tryPromise(() => fetch("https://api.example.com")).pipe(
  Effect.retry(
    Schedule.fixed("1 seconds").pipe(Schedule.intersect(Schedule.recurs(5)))
  )
)
// → 1000 个失败请求在 1s / 2s / 3s / 4s / 5s 后同时重试

// ✅ 正确：指数退避 + 抖动
Effect.tryPromise(() => fetch("https://api.example.com")).pipe(
  Effect.retry(
    Schedule.exponential("500 millis").pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(5))
    )
  )
)
// → 每个请求的延迟被随机化，分散在时间轴上
```

#### 问题 2：Effect.repeat 和 Effect.retry 混淆

```typescript
// ❌ 错误：用 Effect.repeat 处理错误重试
Effect.tryPromise(() => someApi()).pipe(
  Effect.repeat(Schedule.recurs(3)) // repeat 不会捕获错误！
  // 只有成功的 Effect 才会被 repeat
)

// ✅ 正确：失败时用 Effect.retry
Effect.tryPromise(() => someApi()).pipe(
  Effect.retry(Schedule.recurs(3)) // retry 在失败时触发
)

// ✅ 正确：成功时用 Effect.repeat
Console.log("doing work").pipe(
  Effect.repeat(Schedule.recurs(3)) // 成功时重复
)
```

#### 问题 3：带参数的 Effect 重复

```typescript
// ❌ 错误：Effect.repeat 不传递参数
const processOrder = (orderId: string) =>
  Console.log(`processing ${orderId}`)

// processOrder("123").pipe(Effect.repeat(...)) // 每次都用相同的 orderId

// ✅ 正确：使用 Effect 的递归或 Stream
import { Stream, Effect } from "effect"

// 方法 1：Stream 处理
Stream.fromIterable(["order-1", "order-2", "order-3"]).pipe(
  Stream.mapEffect((id) => processOrder(id)),
  Stream.runCollect
)

// 方法 2：Effect.iterate 动态计算
Effect.iterate(
  { page: 1, hasMore: true },
  (state) =>
    Effect.gen(function* (_) {
      if (!state.hasMore) return state
      const result = yield* _(fetchPage(state.page))
      return { page: state.page + 1, hasMore: result.hasMore }
    }),
)
```

#### 问题 4：嵌套重复导致语义模糊

```typescript
// ❌ 不推荐：嵌套 Effect.repeat
Effect.repeat(
  Effect.repeat(
    Console.log("hello"),
    Schedule.recurs(5) // 内层：重复 5 次
  ),
  Schedule.recurs(5) // 外层：重复 5 次
)
// 总计 25 次，不容易理解

// ✅ 推荐：使用 Schedule.andThen 在调度层面组合
Console.log("hello").pipe(
  Effect.repeat(
    Schedule.andThen(
      Schedule.recurs(5),
      Schedule.recurs(5)
    )
  )
)
```

#### 问题 5：Schedule 的时间精度

```typescript
// Schedule.fixed 和 Schedule.spaced 的区别
Schedule.fixed("1 seconds")
// 固定日历间隔：每秒整点执行一次
// 如果执行耗时 700ms，下一次仍然是 1 秒后
// 实际间隔区：1s, 1s, 1s...

Schedule.spaced("1 seconds")
// 以执行完成时刻为起点计算间隔
// 如果执行耗时 700ms，下一次在 1.7 秒后
// 实际间隔区：1.7s, 1.7s, 1.7s...

// 选择建议：
// fixed → 定时心跳、固定频率采样
// spaced → 任务需要缓冲时间、API 请求保护
```

---

### 开发者技能

#### 1. 渐进掌握 Schedule（3 步）

**第一步：基础重试策略**

```typescript
import { Schedule, Effect, Console } from "effect"

// 最简单的重试：每 1 秒一次，最多 3 次
const basic = Effect.tryPromise({
  try: () => fetch("https://api.example.com"),
  catch: (err) => new Error(String(err))
}).pipe(
  Effect.retry(
    Schedule.fixed("1 seconds").pipe(
      Schedule.intersect(Schedule.recurs(3))
    )
  ),
  Effect.catchAll((err) => Console.log(`failed: ${err.message}`))
)

// 运行效果：
// 初始调用 → 失败 → 等 1s → 重试 → 失败 → 等 1s → 重试 → 失败 → 等 1s → 重试 → 放弃
```

**第二步：指数退避 + 条件重试**

```typescript
import { Schedule, Effect, Console, Duration } from "effect"

// 智能重试：根据错误类型决定是否重试
const conditionalRetry = (err: Error): boolean =>
  err.message.includes("timeout") || err.message.includes("5")

const smartRetry = Effect.tryPromise({
  try: () => fetch("https://api.example.com/unstable"),
  catch: (err) => new Error(String(err))
}).pipe(
  Effect.retry(
    Schedule.exponential("500 millis").pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(5)),
      Schedule.whileInput((err: Error) =>
        err.message.includes("timeout")
      ) // 只有超时才重试，4xx 不重试
    )
  )
)
```

**第三步：完整的业务重试策略**

```typescript
import { Schedule, Effect, Console, Duration, Random, pipe } from "effect"

// 生产级重试策略
const productionRetryPolicy = pipe(
  Schedule.exponential("100 millis"),
  Schedule.jittered(0.1, 2.0),
  Schedule.intersect(Schedule.recurs(10)),
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.untilOutput((d) => d >= Duration.decode("30 seconds"))
    )
  ),
  // 输出每次重试的累计耗时
  Schedule.mapOutput((n) => `retry attempt #${n}`)
)

// 应用到 Effect
Effect.tryPromise(() => fetch("https://example.com")).pipe(
  Effect.retry(productionRetryPolicy),
  Effect.tap((response) => Console.log("success!")),
  Effect.catchAll((err) => Console.error(`final: ${err}`))
)
```

#### 2. 调试 Schedule

```typescript
import { Schedule, Effect, Console, Duration } from "effect"

// 方法 1：用 Effect.reduce 预览执行步骤
const previewDelays = Effect.reduce(
  Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(5))
  ),
  [] as number[],
  (acc, delay) => [...acc, delay]
)
Effect.runPromise(previewDelays).then(console.log)
// [100, 200, 400, 800, 1600] （单位：毫秒）

// 方法 2：用 Effect.tap 日志记录每次重试
Effect.tryPromise(() => fetch("https://api.example.com")).pipe(
  Effect.tap((resp) => Console.log(`attempt succeeded: ${resp.status}`)),
  Effect.catchAll((err) =>
    Console.log(`attempt failed: ${err.message}`)
  ),
  Effect.retry(
    Schedule.spaced("500 millis").pipe(
      Schedule.intersect(Schedule.recurs(3)),
      Schedule.mapOutput((n) => `retry #${n}`)
    )
  )
)
```

#### 3. 对比：各种调度策略

| 策略 | 延迟序列 | 适用场景 |
|------|---------|---------|
| `fixed("1s")` | 1s, 1s, 1s, 1s... | 心率监测、固定频率采样 |
| `spaced("1s")` | ≥1s, ≥1s, ≥1s... | API 请求节流 |
| `exponential("100ms")` | 100, 200, 400, 800, 1600ms... | 网络错误重试 |
| `exponential + jittered` | ~86, ~234, ~367, ~912ms... | 防雪崩重试 |
| `cron("0 * * * *")` | 每整点 | 定时维护任务 |
| `recurs(3)` | 0, 0, 0 | 立即重试有限次数 |

---

### 示例代码

#### 完整例子：支付重试策略

```typescript
import {
  Schedule, Effect, Console, Duration, Random, pipe
} from "effect"

// 1. 定义错误类型
class NetworkError extends Error {
  readonly _tag = "NetworkError"
}
class RateLimitError extends Error {
  readonly _tag = "RateLimitError"
  constructor(readonly retryAfter: number) {
    super("rate limited")
  }
}
class ServerError extends Error {
  readonly _tag = "ServerError"
}

// 2. 创建差异化的重试策略
const paymentPolicy = pipe(
  // 阶段 1：指数退避（网络抖动）
  Schedule.exponential("200 millis"),
  Schedule.jittered(0.5, 1.5),
  Schedule.intersect(Schedule.recurs(5)),
  // 只在 NetworkError 和 ServerError 时使用这个策略
  Schedule.whileInput((err: Error) =>
    err instanceof NetworkError || err instanceof ServerError
  ),
  // 阶段 2：速率限制等待
  Schedule.andThen(
    // 根据 RateLimitError 的 retryAfter 决定等待时间
    Schedule.identity.pipe(
      Schedule.whileInput((err: Error) => err instanceof RateLimitError)
    )
  ),
  // 总的执行时间预算
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.untilOutput((d) => d >= Duration.decode("60 seconds"))
    )
  )
)

// 3. 应用重试策略
const processPayment = (orderId: string, amount: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`processing payment: order=${orderId}, amount=${amount}`))
    
    // 模拟网络请求
    const result = yield* _(
      Effect.tryPromise({
        try: () => fetch("https://payment.example.com/charge", {
          method: "POST",
          body: JSON.stringify({ orderId, amount })
        }),
        catch: (err) => {
          if (err instanceof TypeError) return new NetworkError(String(err))
          return new ServerError(String(err))
        }
      })
    )
    
    if (!result.ok) {
      if (result.status === 429) {
        const retryAfter = Number(result.headers.get("Retry-After") ?? "5")
        yield* _(Effect.fail(new RateLimitError(retryAfter)))
      }
      yield* _(Effect.fail(new ServerError(`HTTP ${result.status}`)))
    }
    
    return result
  }).pipe(
    Effect.retry(paymentPolicy),
    Effect.timeout("90 seconds"),
    Effect.catchAll((err) =>
      Console.error(`[ALERT] payment failed for ${orderId}: ${err}`)
    )
  )

// 模拟运行
Effect.runPromise(processPayment("order-123", 99.99))
```

运行结果示例：

```
timestamp=... level=INFO message="processing payment: order=order-123, amount=99.99"
timestamp=... level=ERROR message="attempt failed: NetworkError"
timestamp=... level=INFO message="retrying in 213ms..."    # 指数退避 + 抖动
timestamp=... level=ERROR message="attempt failed: NetworkError"
timestamp=... level=INFO message="retrying in 487ms..."
timestamp=... level=INFO message="payment succeeded on attempt 3"
```

---

### 本章小结

| 知识点 | 要点 | 对应章节 |
|--------|------|---------|
| Schedule 核心模型 | 可组合的状态机，决定继续/停止+延迟 | 1. 核心概念 |
| 内置策略 | fixed / spaced / exponential / cron / recurs | 2. 内置策略 |
| 组合器 | intersect / union / andThen / mapOutput | 3. 组合器 |
| 抖动策略 | jittered 分散重试时间，防雪崩 | 4. 抖动 |
| 条件决策 | whileInput / untilOutput 条件控制 | 5. 决策操作 |
| retry vs repeat | retry 用于失败时，repeat 用于成功后 | 典型问题 |
| 实践要点 | 指数退避+抖动+最大次数+时间预算 | 实战 |

**一句话总结**：Schedule 把"重试策略"从硬编码参数提升为一等公民的可组合数据结构，让指数退避、抖动、条件重试、两阶段降级等高级模式成为一行组合而非数百行胶水代码。

---

### 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/scheduling
- API 参考：`Schedule` (`effect/Schedule`)
- 相关章节：ch03（错误处理）、ch07（Stream 中的重试）、ch14（运行时排查）