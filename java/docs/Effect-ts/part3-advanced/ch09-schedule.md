# ch09 Schedule 调度器

## 概述

`Schedule` 是 Effect-TS 中最具特色的模块之一。它将"重试策略"和"定时调度"抽象为一个**可组合的数据结构**，而非硬编码的配置参数。这意味着你可以像组合 `Effect` 一样组合 `Schedule` —— 叠加、交叉、取并集、映射输出，构建出极其灵活的调度策略。

```typescript
import { Schedule, Effect, Console } from "effect"

// Schedule 的类型签名
// Schedule<Out, In, R>
//  - Out: 每次调度产生的输出值类型
//  - In: 所需的输入类型（通常是 void 或 unknown）
//  - R: 所需的环境依赖
```

---

## 1. Schedule 核心概念

### 1.1 Schedule 的模型

一个 `Schedule` 本质上是一个**状态机**：它接收输入（通常是前一次尝试的结果），决定是否继续，并产生输出。

```typescript
import { Schedule, Effect, Console } from "effect"

// 最简单的 Schedule：执行一次
const once = Schedule.once

// 另一个简单 Schedule：永远每 1 秒执行
const forever = Schedule.fixed("1 seconds")

// 组合：取两者的交集 → 执行一次 1 秒后
const combined = Schedule.intersect(once, forever)
```

### 1.2 使用 Schedule 的场景

Schedule 主要服务于两大类场景：

1. **重试策略**：失败后等多久再试，什么时候放弃
2. **定时任务**：按固定间隔执行 Effect，何时停止

```typescript
import { Effect, Schedule, Console } from "effect"

// 场景一：重试
const retriedApi = Effect.tryPromise({
  try: () => fetch("https://api.example.com/users"),
  catch: (err) => new Error(`Network error: ${err}`)
}).pipe(
  Effect.retry(
    Schedule.exponential("500 millis").pipe(
      Schedule.intersect(Schedule.recurs(3))
    )
  ),
  Effect.catchAll((err) => Console.log(`finally failed: ${err.message}`))
)

// 场景二：定时任务
const repeatedTask = Console.log("heartbeat").pipe(
  Effect.repeat(Schedule.fixed("5 seconds").pipe(
    Schedule.intersect(Schedule.recurs(10)) // 最多 10 次
  ))
)
```

---

## 2. 内置调度策略

### 2.1 基础策略

```typescript
import { Schedule, Duration, Effect, Console } from "effect"

// 零延迟重复（等价于 while(true)）
Schedule.forever

// 执行一次即停
Schedule.once

// 递归 n 次后停止
Schedule.recurs(5)

// 永不执行（直接跳过）
Schedule.stop

// 立即执行，之后不再重复
Schedule.identity // 等同于 Schedule.once
```

### 2.2 固定间隔

```typescript
// 每 N 时间单位执行一次
Schedule.fixed("2 seconds")
// 等价于 setInterval(..., 2000)，但受 Effect 调度器控制

// 从上一个执行结束后开始计时
Schedule.spaced("1 seconds")
// "fixed" 是固定的日历间隔，不受执行时长影响
// "spaced" 保证相邻执行之间至少有指定间隔

// 每小时的整点执行
const hourly = Schedule.cron("0 * * * *")
// 接受标准 cron 表达式
```

### 2.3 指数退避

```typescript
import { Schedule, Effect, Console } from "effect"

// 基础指数退避：延迟 = base * 2^n
// 初始 100ms → 200ms → 400ms → 800ms → ...
const expBackoff = Schedule.exponential("100 millis").pipe(
  Schedule.intersect(Schedule.recurs(5))
)

// 使用指数退避的重试
const fetchWithRetry = Effect.tryPromise({
  try: () => fetch("https://api.example.com/unstable"),
  catch: (err) => new Error(String(err))
}).pipe(
  Effect.retry(
    Schedule.exponential("500 millis").pipe(
      Schedule.jittered, // 添加随机抖动
      Schedule.intersect(Schedule.recurs(10)),
      Schedule.andThen(Schedule.elapsed) // 输出已流逝时间
    )
  )
)
```

---

## 3. 组合器（Combinators）

### 3.1 intersect（交集）

两个 Schedule 都同意继续时才能继续，实际延迟取**两者中的最大值**。常用于限制重试次数 + 最长时间：

```typescript
import { Schedule, Effect } from "effect"

// 同时满足：
// 1. 最多重试 5 次（recurs(5)）
// 2. 总共不超过 30 秒（elapsed <= 30s）
const boundedRetry = Schedule.intersect(
  Schedule.recurs(5),
  Schedule.elapsed.pipe(
    Schedule.whileOutput((d) => d < Duration.decode("30 seconds"))
  )
)
```

### 3.2 union（并集）

任一 Schedule 同意继续时就能继续，延迟取**两者中的最小值**：

```typescript
import { Schedule } from "effect"

// 重试到 10 次 或 最多 60 秒，任一条件满足则停止
const retryUntil10Or60s = Schedule.union(
  Schedule.recurs(10),
  Schedule.elapsed.pipe(
    Schedule.untilOutput((d) => d >= Duration.decode("60 seconds"))
  )
)
```

### 3.3 compose / andThen（顺序组合）

将一个 Schedule 的输出作为另一个的输入：

```typescript
import { Schedule, Duration, Effect } from "effect"

// 第一阶段：指数退避最多 5 次
// 第二阶段：固定间隔每 10 秒，最多 5 次
const twoPhase = Schedule.andThen(
  Schedule.exponential("200 millis").pipe(
    Schedule.intersect(Schedule.recurs(5))
  ),
  Schedule.spaced("10 seconds").pipe(
    Schedule.intersect(Schedule.recurs(5))
  )
)
// 总延迟进度：
// 200ms → 400ms → 800ms → 1.6s → 3.2s → (切换) → 10s → 10s → 10s → 10s → 10s
```

### 3.4 map / mapOutput（映射输出）

转换 Schedule 的输出类型：

```typescript
import { Schedule, Duration, Effect } from "effect"

// 将延迟映射为人类可读字符串
const labeled = Schedule.spaced("1 seconds").pipe(
  Schedule.mapOutput((n) => `delay: ${n} millis`),
  Schedule.andThen(Schedule.recurs(5))
)
```

---

## 4. 抖动策略（Jitter）

当多个客户端同时使用指数退避重试时，它们会"同步"地在相同时间点重试，造成**惊群效应**（Thundering Herd）。添加随机抖动可以分散重试时间。

```typescript
import { Schedule, Effect, Console, Random } from "effect"

// Schedule.jittered：内置抖动
const withDefaultJitter = Schedule.exponential("1 seconds").pipe(
  Schedule.jittered // 默认抖动范围：[0, 1) 的随机倍数
)

// 自定义抖动范围
const withCustomJitter = Schedule.exponential("1 seconds").pipe(
  Schedule.jittered(0.1, 2.0) // 0.1x ~ 2.0x 范围内的随机值
)

// 实际效果对比
const simulate = (schedule: Schedule.Schedule<number, void, never>) =>
  Effect.reduce(
    schedule,
    [],
    (acc, delay) => [...acc, delay]
  ).pipe(Effect.andThen(Console.log))
```

---

## 5. 决策操作：until / while

```typescript
import { Schedule, Effect, Console } from "effect"

// untilOutput：当输出满足条件时停止
Schedule.elapsed.pipe(
  Schedule.untilOutput((d) => d >= Duration.decode("30 seconds"))
)

// whileOutput：当输出满足条件时继续
Schedule.spaced("1 seconds").pipe(
  Schedule.whileOutput((n) => n < 10)
)

// 实践：根据错误类型决定重试
const conditionalRetry = (err: Error) =>
  Schedule.exponential("1 seconds").pipe(
    Schedule.intersect(Schedule.recurs(3)),
    // 只在特定错误时重试
    Schedule.whileInput((err) => err.message.includes("timeout"))
  )

// 使用
Effect.tryPromise(() => fetch("https://api.example.com")).pipe(
  Effect.retry(conditionalRetry)
)
```

---

## 6. 实战：API 重试策略设计

```typescript
import {
  Schedule, Effect, Console, Duration, Random, pipe
} from "effect"

// 完整的重试策略
const apiRetryPolicy = pipe(
  Schedule.exponential("100 millis"),  // 初始 100ms，每次翻倍
  Schedule.jittered(0.1, 2.0),        // 添加 0.1x-2x 的随机抖动
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.untilOutput((d) => d >= Duration.decode("30 seconds"))
    )
  ),
  Schedule.intersect(Schedule.recurs(10)),
  Schedule.andThen(Schedule.spaced("5 seconds")), // 退避结束后每 5s 重试
  Schedule.intersect(
    Schedule.elapsed.pipe(
      Schedule.whileOutput((d) => d < Duration.decode("5 minutes"))
    )
  )
)

// 应用到 API 调用
const callPaymentApi = (amount: number) =>
  Effect.tryPromise({
    try: () => fetch("https://payment.example.com/charge", {
      method: "POST",
      body: JSON.stringify({ amount })
    }),
    catch: (err) => new Error(`API error: ${err}`)
  }).pipe(
    Effect.retry(apiRetryPolicy),
    Effect.timeout("10 seconds"),
    Effect.catchAll((err) =>
      Console.error(`payment failed after retries: ${err}`)
    )
  )
```

---

## 7. 实战：定时任务调度

```typescript
import { Schedule, Effect, Console, Fiber } from "effect"

// 场景：定时健康检查
const healthCheck = Console.log("health check passed").pipe(
  Effect.repeat(Schedule.fixed("30 seconds").pipe(
    Schedule.intersect(Schedule.recurs(3)), // 最多 3 次后停止
    Schedule.andThen(
      Schedule.spaced("10 seconds").pipe(
        Schedule.intersect(Schedule.recurs(3))
      )
    ) // 然后每 10 秒再试 3 次
  )),
  Effect.ensuring(Console.log("health check stopped"))
)

// 场景：带状态的 Schedule（记录上次成功时间）
const withState = Schedule.fixed("5 seconds").pipe(
  Schedule.modify((now) => ({
    // 记录每次调度的状态
    state: now,
    next: now + 5000
  }))
)

// 场景：在后台 Fiber 中运行重复任务
const backgroundTask = Console.log("background task").pipe(
  Effect.repeat(Schedule.spaced("1 seconds")),
  Effect.fork
)
```

---

## 8. 性能与最佳实践

### 8.1 Schedule 是懒惰的

`Schedule` 定义策略时不执行任何 Effect，只在被 `Effect.retry` 或 `Effect.repeat` 消费时才起作用。可以安全地重复使用同一个 Schedule 定义。

```typescript
const policy = Schedule.exponential("1 seconds")

// 重用：两个不同的 Effect 使用相同的策略定义
Effect.retry(api1, policy)
Effect.retry(api2, policy)
// 每个 Effect 的调度状态是独立的
```

### 8.2 避免过度嵌套

```typescript
// ❌ 不推荐：嵌套重复
Effect.repeat(
  Effect.repeat(
    Console.log("hello"),
    Schedule.recurs(5)
  ),
  Schedule.recurs(5)
) // 总计 25 次，但难以阅读

// ✅ 推荐：在 Schedule 层面组合
Console.log("hello").pipe(
  Effect.repeat(
    Schedule.intersect(Schedule.recurs(5), Schedule.recurs(5))
  )
)
```

### 8.3 常见模式速查

| 需求 | Schedule |
|------|----------|
| 最多重试 3 次 | `Schedule.recurs(3)` |
| 指数退避 + 抖动 | `exponential("1s").pipe(jittered)` |
| 最多 30 秒重试 | `elapsed.pipe(untilOutput(d => d >= 30s))` |
| 每整点执行 | `Schedule.cron("0 * * * *")` |
| 固定间隔 | `Schedule.fixed("10s")` |
| 两次执行之间至少间隔 | `Schedule.spaced("1s")` |
| 条件重试 | `whileInput((e) => e.message.includes("timeout"))` |
| 两阶段策略 | `andThen(fastPhase, slowPhase)` |

---

## 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/scheduling
- API 参考：`Schedule` (`effect/Schedule`)
- 相关章节：ch03（错误处理）、ch07（Stream 中的重试）、ch14（运行时排查）