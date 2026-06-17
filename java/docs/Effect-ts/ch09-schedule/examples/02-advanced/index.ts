import { Effect, Schedule, Console, pipe, Duration, Random, Fiber, Option, Either, Chunk, Array, Tuple, DateTime } from "effect"

// ============================================================
// 02-advanced: Schedule 的组合与高级用法
// ============================================================

// --- 2.1 Schedule 的组合操作 ---

// Schedule.compose: 顺序组合，先执行第一个，再执行第二个
const composed = Schedule.recurs(3).pipe(
  Schedule.compose(Schedule.fixed("1 seconds"))
)
// 先重复 3 次，然后每 1 秒执行一次

// Schedule.union: 并集组合，两个调度同时运行，取先完成的
const union = Schedule.recurs(5).pipe(
  Schedule.union(Schedule.fixed("2 seconds"))
)
// 在 5 次重复或 2 秒间隔中，先满足条件的决定行为

// Schedule.intersect: 交集组合，两个调度同时运行，取后完成的
const intersect = Schedule.recurs(3).pipe(
  Schedule.intersect(Schedule.fixed("1 seconds"))
)
// 同时满足 3 次重复和 1 秒间隔

// --- 2.2 Schedule 的转换操作 ---

// Schedule.map: 转换 Schedule 的输出
const mapped = Schedule.recurs(3).pipe(
  Schedule.map((n) => `completed ${n} times`)
)

// Schedule.flatMap: 根据输出创建新的 Schedule
const flatMapped = Schedule.recurs(3).pipe(
  Schedule.flatMap((n) => Schedule.fixed(`${n * 1000} millis`))
)

// Schedule.filter: 过滤 Schedule 的决策
const filtered = Schedule.recurs(10).pipe(
  Schedule.filter((n) => n % 2 === 0) // 只在偶数次时执行
)

// --- 2.3 条件调度 ---

// Schedule.check: 根据条件决定是否继续
const checkSchedule = Schedule.recurs(10).pipe(
  Schedule.check((n) => n < 5 ? Effect.succeed(true) : Effect.succeed(false))
)

// Schedule.whileInput: 根据输入值决定是否继续
const whileInput = Schedule.whileInput<number>((n) => n > 0)

// Schedule.stop: 在满足条件时停止
const stopSchedule = Schedule.recurs(10).pipe(
  Schedule.stop((n) => n >= 5)
)

// --- 2.4 基于时间的调度 ---

// Schedule.cron: 使用 cron 表达式调度
const cronSchedule = Schedule.cron("0 * * * *") // 每小时执行一次

// Schedule.dayOfMonth: 在每月的特定日期执行
const dayOfMonth = Schedule.dayOfMonth(15) // 每月 15 号

// Schedule.dayOfWeek: 在每周的特定日期执行
const dayOfWeek = Schedule.dayOfWeek(1) // 每周一

// Schedule.hourOfDay: 在每天的特定小时执行
const hourOfDay = Schedule.hourOfDay(9) // 每天上午 9 点

// Schedule.minuteOfHour: 在每小时的特定分钟执行
const minuteOfHour = Schedule.minuteOfHour(30) // 每小时的 30 分

// --- 2.5 自定义延迟 ---

// Schedule.addDelay: 添加自定义延迟
const customDelay = Schedule.recurs(5).pipe(
  Schedule.addDelay((n) => `${n * 500} millis`)
)

// Schedule.modifyDelay: 修改现有延迟
const modifiedDelay = Schedule.fixed("1 seconds").pipe(
  Schedule.modifyDelay((n) => `${n * 2} seconds`)
)

// --- 2.6 高级组合示例 ---

const advancedComposition = Effect.gen(function* (_) {
  // 构建一个复杂的重试策略：
  // 1. 指数退避，从 500ms 开始，每次翻倍
  // 2. 最大延迟 10 秒
  // 3. 添加随机抖动
  // 4. 最多重试 10 次
  // 5. 在重试之间记录日志

  const retryPolicy = Schedule.exponential("500 millis", 2.0).pipe(
    Schedule.compose(Schedule.recurs(10)),
    Schedule.jittered({ min: 0.5, max: 1.5 }),
    Schedule.tap((n) => Console.log(`retry attempt ${n}`))
  )

  let attempts = 0
  const flakyOp = Effect.gen(function* (_) {
    attempts++
    if (attempts < 4) {
      return yield* _(Effect.fail(new Error(`attempt ${attempts} failed`)))
    }
    return "success"
  })

  const result = yield* _(flakyOp.pipe(Effect.retry(retryPolicy)))
  console.log(`final result: ${result}`)
})

Effect.runPromise(advancedComposition).then(() => console.log("advanced composition done"))

// --- 2.7 Schedule 的决策追踪 ---

const decisionTracking = Effect.gen(function* (_) {
  // 使用 collectAll 收集所有决策
  const policy = Schedule.recurs(5).pipe(
    Schedule.collectAll,
    Schedule.tap((n) => Console.log(`decision: ${n}`))
  )

  let count = 0
  const op = Effect.sync(() => {
    count++
    return count
  })

  const decisions = yield* _(op.pipe(Effect.repeat(policy)))
  console.log(`all decisions: ${decisions}`)
})

Effect.runPromise(decisionTracking).then(() => console.log("decision tracking done"))

// --- 2.8 使用 Either 处理重试结果 ---

const eitherRetry = Effect.gen(function* (_) {
  // retryOrElse: 重试失败后执行备选操作
  const policy = Schedule.recurs(3)

  let attempts = 0
  const alwaysFails = Effect.gen(function* (_) {
    attempts++
    return yield* _(Effect.fail(new Error(`failure #${attempts}`)))
  })

  const result = yield* _(
    alwaysFails.pipe(
      Effect.retryOrElse(policy, (err, n) =>
        Effect.succeed(`gave up after ${n} attempts: ${err.message}`)
      )
    )
  )
  console.log(`result: ${result}`)
})

Effect.runPromise(eitherRetry).then(() => console.log("either retry done"))
