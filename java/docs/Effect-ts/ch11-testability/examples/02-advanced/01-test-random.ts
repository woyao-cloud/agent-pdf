import { Effect, Random, TestRandom, TestContext } from "effect"

// TestRandom：确定性随机数生成

// 业务逻辑：生成随机验证码
const generateVerificationCode = Effect.gen(function* () {
  const code = yield* Random.nextIntBetween(100000, 999999)
  return code
})

// 业务逻辑：随机选择奖品
const selectPrize = Effect.gen(function* () {
  const prizes = ["一等奖", "二等奖", "三等奖", "谢谢参与"]
  const index = yield* Random.nextIntBetween(0, prizes.length)
  return prizes[index]
})

// 使用 TestRandom 的测试
const testProgram = Effect.gen(function* () {
  // 设置确定性随机种子
  yield* TestRandom.setSeed(42n)

  // 第一次调用
  const code1 = yield* generateVerificationCode
  console.log(`验证码 1: ${code1}`)

  // 第二次调用（相同种子 → 相同结果）
  yield* TestRandom.setSeed(42n)
  const code2 = yield* generateVerificationCode
  console.log(`验证码 2: ${code2}`)
  console.log(`两次结果相同: ${code1 === code2}`)

  // 测试奖品选择
  yield* TestRandom.setSeed(123n)
  const prize = yield* selectPrize
  console.log(`抽奖结果: ${prize}`)
})

const runnable = testProgram.pipe(
  Effect.provide(TestContext.TestContext),
)

Effect.runPromise(runnable)
