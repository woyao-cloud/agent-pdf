import { Effect, Console, TestContext, TestConsole } from "effect"

// TestConsole：拦截控制台输出，验证日志行为

// 业务逻辑：带日志的订单处理
const processOrder = (orderId: number, amount: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    yield* Console.log(`处理订单 #${orderId}`)
    yield* Console.log(`订单金额: ¥${amount}`)

    if (amount > 1000) {
      yield* Console.warn(`大额订单 #${orderId} 需要人工审核`)
      return "pending_approval"
    }

    yield* Console.log(`订单 #${orderId} 已自动通过`)
    return "approved"
  })

// 使用 TestConsole 的测试
const testProgram = Effect.gen(function* () {
  // 测试大额订单
  const result1 = yield* processOrder(1, 2000)
  console.log(`结果 1: ${result1}`)

  // 获取 TestConsole 的输出
  const output1 = yield* TestConsole.getOutput()
  console.log("=== 控制台输出 1 ===")
  console.log(output1)

  // 重置控制台
  yield* TestConsole.clear()

  // 测试小额订单
  const result2 = yield* processOrder(2, 500)
  console.log(`结果 2: ${result2}`)

  const output2 = yield* TestConsole.getOutput()
  console.log("=== 控制台输出 2 ===")
  console.log(output2)
})

const runnable = testProgram.pipe(
  Effect.provide(TestContext.TestContext),
)

Effect.runPromise(runnable)
