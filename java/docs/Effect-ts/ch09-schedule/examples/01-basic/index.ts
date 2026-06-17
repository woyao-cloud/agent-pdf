import { Effect, Schedule, Console, pipe, Duration, Random, Fiber, Option, Either } from "effect"

// ============================================================
// 01-basic: Schedule 基础 —— 重试、延迟与重复
// ============================================================

// --- 1.1 Schedule 的基本概念 ---

// Schedule 是一个可组合的数据结构，描述了"何时以及如何重复执行一个 Effect"
// 它的核心类型是：Schedule<Out, In, Env>
// - Out: 调度产生的输出值类型
// - In: 调度接收的输入值类型
// - Env: 调度所需的环境类型

// --- 1.2 基本调度策略 ---

// Schedule.recurs: 重复指定次数
const recurs3 = Schedule.recurs(3)

// Schedule.once: 只执行一次（等价于 recurs(1)）
const once = Schedule.once

// Schedule.forever: 无限重复
const forever = Schedule.forever

// Schedule.fixed: 固定间隔执行
const everySecond = Schedule.fixed("1 seconds")

// Schedule.spaced: 固定延迟执行（与 fixed 类似，但行为略有不同）
const spaced = Schedule.spaced("1 seconds")

// --- 1.3 使用 Effect.retry 进行重试 ---

// 模拟一个可能失败的操作
let attempt = 0
const flakyOperation = Effect.gen(function* (_) {
  attempt++
  console.log(`attempt ${attempt}`)
  if (attempt < 3) {
    return yield* _(Effect.fail(new Error(`attempt ${attempt} failed`)))
  }
  return "success"
})

// 使用 retry 重试最多 3 次
const retried = flakyOperation.pipe(
  Effect.retry(Schedule.recurs(3))
)

Effect.runPromise(
  retried.pipe(Effect.andThen(Console.log))
).then(() => console.log("retry demo done"))

// --- 1.4 使用 Effect.repeat 进行重复 ---

// 模拟一个每次返回不同值的操作
let counter = 0
const countingOperation = Effect.sync(() => {
  counter++
  return counter
})

// 重复 5 次
const repeated = countingOperation.pipe(
  Effect.repeat(Schedule.recurs(5))
)

Effect.runPromise(
  repeated.pipe(Effect.andThen((n) => Console.log(`final value: ${n}`)))
).then(() => console.log("repeat demo done"))

// --- 1.5 指数退避 ---

// Schedule.exponential: 指数退避，每次重试的延迟翻倍
const exponentialBackoff = Schedule.exponential("1 seconds", 2.0)
// 第 1 次重试: 1s, 第 2 次: 2s, 第 3 次: 4s, 第 4 次: 8s, ...

// 带最大延迟的指数退避
const cappedExponential = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.compose(Schedule.recurs(5))
)

// --- 1.6 随机抖动 ---

// Schedule.addDelay: 在延迟上添加随机抖动
const withJitter = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.addDelay((_) => Random.nextIntBetween(0, 1000).pipe(
    Effect.map((n) => `${n} millis`)
  ))
)

// Schedule.jittered: 内置的抖动函数
const jittered = Schedule.exponential("1 seconds", 2.0).pipe(
  Schedule.jittered
)

// --- 1.7 使用 retry 和 repeat 的完整示例 ---

const fullDemo = Effect.gen(function* (_) {
  // 重试策略：指数退避 + 最多 5 次
  const retryPolicy = Schedule.exponential("500 millis", 2.0).pipe(
    Schedule.compose(Schedule.recurs(5))
  )

  // 模拟一个最终会成功的操作
  let failCount = 0
  const operation = Effect.gen(function* (_) {
    failCount++
    if (failCount <= 3) {
      return yield* _(Effect.fail(new Error(`failure #${failCount}`)))
    }
    return "finally succeeded"
  })

  const result = yield* _(operation.pipe(Effect.retry(retryPolicy)))
  console.log(`result: ${result}`)
  console.log(`total failures: ${failCount - 1}`)
})

Effect.runPromise(fullDemo).then(() => console.log("full demo done"))

// --- 1.8 Schedule 的输出值 ---

// Schedule 不仅控制执行时机，还产生输出值
const scheduleWithOutput = Effect.gen(function* (_) {
  let count = 0
  const op = Effect.sync(() => {
    count++
    return count
  })

  // repeat 返回 Schedule 的最终输出值
  const result = yield* _(
    op.pipe(
      Effect.repeat(Schedule.recurs(3))
    )
  )
  console.log(`repeat result: ${result}`) // 4（执行了 4 次，包括初始执行）

  // 使用 collectAll 收集所有输出
  const allOutputs = yield* _(
    op.pipe(
      Effect.repeat(Schedule.recurs(3).pipe(Schedule.collectAll))
    )
  )
  console.log(`all outputs: ${allOutputs}`)
})

Effect.runPromise(scheduleWithOutput).then(() => console.log("schedule output demo done"))
