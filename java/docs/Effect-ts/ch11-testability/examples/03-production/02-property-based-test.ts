import { Effect, Random, TestRandom, TestContext } from "effect"

// 基于属性的测试：验证函数在大量随机输入下的行为

// 被测试函数：将数字格式化为货币字符串
const formatCurrency = (amount: number, locale: string): string => {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
  })
  return formatter.format(amount)
}

// 属性：格式化后的字符串应该包含数字
const property_containsDigits = (amount: number): boolean => {
  const result = formatCurrency(amount, "zh-CN")
  return /\d/.test(result)
}

// 属性：格式化后的字符串应该包含货币符号
const property_containsCurrencySymbol = (amount: number): boolean => {
  const result = formatCurrency(amount, "zh-CN")
  return result.includes("¥")
}

// 使用 TestRandom 生成大量随机输入
const runPropertyTests = Effect.gen(function* () {
  yield* TestRandom.setSeed(42n)

  let passed = 0
  const totalTests = 100

  for (let i = 0; i < totalTests; i++) {
    // 生成随机金额
    const amount = yield* Random.nextIntBetween(-100000, 100000)

    // 验证属性
    if (property_containsDigits(amount) && property_containsCurrencySymbol(amount)) {
      passed++
    } else {
      console.log(`失败: amount=${amount}`)
    }
  }

  console.log(`通过率: ${passed}/${totalTests}`)
})

const runnable = runPropertyTests.pipe(
  Effect.provide(TestContext.TestContext),
)

Effect.runPromise(runnable)
