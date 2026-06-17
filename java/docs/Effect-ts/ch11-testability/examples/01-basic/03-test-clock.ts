import { Effect, TestClock, Duration, Clock, Fiber, TestContext } from "effect"
import { pipe } from "effect"

// TestClock：在测试中跨越时间，无需真实等待

// 一个需要等待的业务逻辑
const waitAndLog = (duration: Duration.Duration): Effect.Effect<string> =>
  Effect.gen(function* () {
    yield* Effect.sleep(duration)
    const now = yield* Clock.currentTimeMillis
    return `经过 ${Duration.toMillis(duration)}ms 后，时间戳: ${now}`
  })

// 使用 TestClock 的测试
const testProgram = Effect.gen(function* () {
  // 启动一个需要 1 小时的任务
  const fiber = yield* waitAndLog(Duration.hours(1)).pipe(
    Effect.fork,
  )

  // 使用 TestClock 直接推进 1 小时
  yield* TestClock.adjust(Duration.hours(1))

  // 获取结果（无需真实等待）
  const result = yield* Fiber.join(fiber)
  console.log(result)

  // 验证时间推进
  const finalTime = yield* Clock.currentTimeMillis
  console.log(`最终时间: ${finalTime} (应为 3600000)`)
})

// 提供 TestContext（包含 TestClock）
const runnable = testProgram.pipe(
  Effect.provide(TestContext.TestContext),
)

Effect.runPromise(runnable)
