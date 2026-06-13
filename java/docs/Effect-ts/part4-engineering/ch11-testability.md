# ch11 可测试性

## 概述

Effect-TS 的依赖注入系统天然解决了传统测试中的核心难题：**如何替换真实依赖**。不需要 Mock 库（如 Jest Mock、Sinon、ts-mockito），不需要 `jest.mock()` 对模块级别的猴子补丁。因为在 Effect 中，依赖是**显式声明**的 `Service`，在测试时只需提供一个 `TestLayer` 即可替换。

这种设计带来的优势：
- 测试代码与生产代码使用相同的接口
- 编译时可验证依赖是否全部替换
- Effect 的 `TestClock`、`TestRandom`、`TestConsole` 等测试服务提供精确控制

---

## 1. 依赖注入与测试架构

### 1.1 传统测试的痛点

```typescript
// 传统代码：依赖隐藏，难以替换
import { db } from "./database"
import { emailService } from "./email"

// 函数内部直接 import 模块，测试时只能 jest.mock
export const registerUser = async (name: string, email: string) => {
  const user = await db.users.create({ name, email })
  await emailService.sendWelcome(email)
  return user
}

// 测试：需要 jest.mock，模块级替换，类型不安全
jest.mock("./database", () => ({
  db: { users: { create: jest.fn() } }
}))
jest.mock("./email", () => ({
  emailService: { sendWelcome: jest.fn() }
}))
```

### 1.2 Effect 方式：接口即测试边界

```typescript
import { Effect, Context, Layer } from "effect"

// 1. 定义 Service Tag
class Database extends Context.Tag("Database")<
  Database,
  { readonly createUser: (name: string, email: string) => Effect.Effect<{
    id: string; name: string; email: string
  }> }
>() {}

class EmailService extends Context.Tag("EmailService")<
  EmailService,
  { readonly sendWelcome: (email: string) => Effect.Effect<void> }
>() {}

// 2. 生产代码只依赖 Tag
const registerUser = (name: string, email: string) =>
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const email = yield* _(EmailService)
    
    const user = yield* _(db.createUser(name, email))
    yield* _(email.sendWelcome(email))
    
    return user
  })

// 3. 测试：构建 Test Layer
const TestLive = Layer.merge(
  Layer.succeed(Database, {
    createUser: (name, email) =>
      Effect.succeed({ id: "test-id", name, email })
  }),
  Layer.succeed(EmailService, {
    sendWelcome: () => Effect.void
  })
)

// 4. 注入测试依赖运行
const testProgram = registerUser("Alice", "alice@test.com").pipe(
  Effect.provide(TestLive)
)
// ✅ 无需 mock 库，无需 jest.mock
```

---

## 2. TestClock —— 时间旅行

`TestClock` 是 Effect-TS 中最强大的测试工具之一。它允许你在测试中**完全控制时间**，无需使用 `setTimeout` 或 `jest.useFakeTimers`。

### 2.1 基本用法

```typescript
import { Effect, TestClock, Ref, Console } from "effect"
import { describe, it, expect } from "@effect/vitest" // 或 vitest/jest

describe("TestClock", () => {
  it("should allow time travel", () =>
    Effect.gen(function* (_) {
      const ref = yield* _(Ref.make(0))
      
      // 启动一个每秒递增的 Fiber
      yield* _(
        ref.update((n) => n + 1).pipe(
          Effect.repeat({ times: 10, delay: "1 seconds" }),
          Effect.fork
        )
      )
      
      // 初始时：count = 0
      const zero = yield* _(ref.get)
      expect(zero).toBe(0)
      
      // 前进 5 秒
      yield* _(TestClock.adjust("5 seconds"))
      
      // count 变成 5
      const five = yield* _(ref.get)
      expect(five).toBe(5)
      
      // 再前进 5 秒
      yield* _(TestClock.adjust("5 seconds"))
      
      // count 变成 10
      const ten = yield* _(ref.get)
      expect(ten).toBe(10)
    }).pipe(Effect.provide(TestClock.TestClockLive)))
})
```

### 2.2 测试超时与重试

```typescript
import { Effect, TestClock, Schedule } from "effect"

describe("timeout and retry", () => {
  it("should timeout after TestClock adjustment", () =>
    Effect.gen(function* (_) {
      // 一个非常慢的操作
      const slowOperation = Effect.sleep("1 hours").pipe(
        Effect.andThen(Effect.succeed("done"))
      )
      
      // 并行运行，但会在 TestClock 下被"加速"
      const fiber = yield* _(slowOperation.pipe(Effect.fork))
      
      // 前进 1 小时 —— 实际不需要等待
      yield* _(TestClock.adjust("1 hours"))
      
      // fiber 应该已经完成
      const result = yield* _(fiber.join)
      expect(result).toBe("done")
    }).pipe(Effect.provide(TestClock.TestClockLive)))
  
  it("should test retry with TestClock", () =>
    Effect.gen(function* (_) {
      let attempts = 0
      
      const flakyApi = Effect.sync(() => {
        attempts++
        if (attempts < 3) throw new Error("not yet")
        return "success"
      })
      
      const result = yield* _(
        flakyApi.pipe(
          Effect.retry(
            Schedule.exponential("1 seconds").pipe(
              Schedule.intersect(Schedule.recurs(5))
            )
          )
        )
      ).pipe(Effect.fork)
      
      // 第一次重试在 1 秒后
      yield* _(TestClock.adjust("1 seconds"))
      // 第二次在 2 秒后
      yield* _(TestClock.adjust("2 seconds"))
      // 第三次在 4 秒后
      yield* _(TestClock.adjust("4 seconds"))
      
      const value = yield* _(fiber.join)
      expect(value).toBe("success")
    }).pipe(Effect.provide(TestClock.TestClockLive)))
})
```

**关键原则**：TestClock 只在测试层的 Effect 内有效。生产代码中的 `Effect.sleep` 在 TestClock 下被自动替换为虚拟时间。

---

## 3. TestRandom 与 TestConsole

### 3.1 TestRandom

```typescript
import { Effect, TestRandom, Random, Console } from "effect"

describe("TestRandom", () => {
  it("should produce deterministic values", () =>
    Effect.gen(function* (_) {
      // 给 TestRandom 注入固定的随机值
      yield* _(TestRandom.setSeed(42n))
      yield* _(TestRandom.feedNextInts([1, 2, 3]))
      
      const a = yield* _(Random.nextIntBetween(1, 100))
      const b = yield* _(Random.nextIntBetween(1, 100))
      const c = yield* _(Random.nextIntBetween(1, 100))
      
      expect(a).toBe(1)
      expect(b).toBe(2)
      expect(c).toBe(3)
    }).pipe(Effect.provide(TestRandom.TestRandomLive)))
  
  it("test shuffle determinism", () =>
    Effect.gen(function* (_) {
      yield* _(TestRandom.feedNextInts([2, 0, 1, 2]))
      
      const shuffled = yield* _(Random.shuffle(["a", "b", "c"]))
      expect(shuffled).toEqual(["c", "a", "b"])
    }).pipe(Effect.provide(TestRandom.TestRandomLive)))
})
```

### 3.2 TestConsole

```typescript
import { Effect, TestConsole, Console } from "effect"

describe("TestConsole", () => {
  it("should capture console output", () =>
    Effect.gen(function* (_) {
      // 执行一些 Console.log
      yield* _(Console.log("step 1"))
      yield* _(Console.log("step 2"))
      
      // 获取已记录的输出
      const output = yield* _(TestConsole.output)
      expect(output).toHaveLength(2)
      expect(output[0].message).toContain("step 1")
    }).pipe(Effect.provide(TestConsole.TestConsoleLive)))
  
  it("should simulate user input", () =>
    Effect.gen(function* (_) {
      // 模拟用户输入
      yield* _(TestConsole.feedLines(["Alice", "30"]))
      
      // Console.readLine 会返回模拟的输入
      const name = yield* _(Console.readLine)
      const age = yield* _(Console.readLine)
      
      expect(name).toBe("Alice")
      expect(age).toBe("30")
    }).pipe(Effect.provide(TestConsole.TestConsoleLive)))
})
```

---

## 4. 测试外部 API（HTTP Calls）

传统 WireMock / MSW 需要单独启动 HTTP 服务。在 Effect 中，HTTP 客户端也是 Service，可以被直接替换。

```typescript
import { Effect, Context, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"

// 生产 HTTP 客户端
class PaymentApi extends Context.Tag("PaymentApi")<
  PaymentApi,
  {
    readonly charge: (amount: number, token: string) =>
      Effect.Effect<{ success: boolean; transactionId: string }>
  }
>() {}

// 生产实现
const PaymentApiLive = Layer.succeed(PaymentApi, {
  charge: (amount, token) =>
    HttpClientRequest.post("https://payment.example.com/charge").pipe(
      HttpClientRequest.bodyJson({ amount, token }),
      HttpClient.letClient(HttpClient.client),
      Effect.andThen(HttpClientResponse.json)
    )
})

// 测试实现
const PaymentApiTest = Layer.succeed(PaymentApi, {
  charge: (amount, token) =>
    Effect.succeed({
      success: true,
      transactionId: `txn-${amount}-${token.slice(0, 4)}`
    })
})

// 使用
describe("payment service", () => {
  it("should charge successfully", () =>
    Effect.gen(function* (_) {
      const api = yield* _(PaymentApi)
      const result = yield* _(api.charge(100, "tok_test_1234"))
      expect(result.success).toBe(true)
      expect(result.transactionId).toContain("txn-100")
    }).pipe(Effect.provide(PaymentApiTest)))
})
```

---

## 5. 完整测试示例

```typescript
import { Effect, Context, Layer, Ref, TestClock, Schedule, Console } from "effect"
import { describe, it, expect } from "@effect/vitest"

// ─── Service 定义 ───
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    findById: (id: string) =>
      Effect.Effect<{ id: string; name: string; points: number } | null>
    addPoints: (id: string, points: number) => Effect.Effect<void>
  }
>() {}

class NotificationService extends Context.Tag("NotificationService")<
  NotificationService,
  { send: (userId: string, message: string) => Effect.Effect<void> }
>() {}

// ─── 生产代码 ───
const awardPointsLoop = (userId: string) =>
  Effect.gen(function* (_) {
    const repo = yield* _(UserRepository)
    const notif = yield* _(NotificationService)
    
    const user = yield* _(repo.findById(userId))
    if (user === null) return
    
    yield* _(repo.addPoints(userId, 10))
    yield* _(notif.send(userId,
      `You earned 10 points! Total: ${user.points + 10}`
    ))
  }).pipe(
    Effect.repeat(
      Schedule.fixed("1 minutes").pipe(
        Schedule.intersect(Schedule.recurs(2))
      )
    )
  )

// ─── 测试 ───
describe("awardPointsLoop", () => {
  it("should award points 3 times across 2 minutes", () =>
    Effect.gen(function* (_) {
      const pointsRef = yield* _(Ref.make(0))
      const messages: string[] = []
      
      // Test layer with controlled state
      const TestLayer = Layer.merge(
        Layer.succeed(UserRepository, {
          findById: () =>
            Effect.succeed({ id: "u1", name: "Alice", points: 0 }),
          addPoints: (_, p) => pointsRef.update((n) => n + p)
        }),
        Layer.succeed(NotificationService, {
          send: (_, msg) =>
            Effect.sync(() => { messages.push(msg) })
        })
      )
      
      // 运行业务逻辑
      const fiber = yield* _(
        awardPointsLoop("u1").pipe(
          Effect.provide(TestLayer),
          Effect.fork
        )
      )
      
      // TestClock：前进 2 分钟（3 次触发）
      yield* _(TestClock.adjust("2 minutes"))
      yield* _(fiber.join)
      
      const totalPoints = yield* _(pointsRef.get)
      expect(totalPoints).toBe(30) // 3 × 10
      expect(messages).toHaveLength(3)
    }).pipe(
      Effect.provide(TestClock.TestClockLive)
    ))
})
```

---

## 6. 常见测试模式

| 模式 | 方法 | 适用场景 |
|------|------|----------|
| 替换 Service | `Layer.succeed(Tag, mock)` | 外部 API、数据库 |
| 时间控制 | `TestClock.adjust` | 超时、重试、定时任务 |
| 确定性随机 | `TestRandom.feedNextInts` | 随机算法测试 |
| 日志断言 | `TestConsole.output` | 验证日志输出 |
| 状态验证 | `Ref` + `Layer` | 验证副作用调用次数和参数 |

```typescript
// 验证 Service 被调用了特定次数
it("should call notification service once per award", () =>
  Effect.gen(function* (_) {
    let callCount = 0
    
    const TestLayer = Layer.succeed(NotificationService, {
      send: () => Effect.sync(() => { callCount++ })
    })
    
    yield* _(someBusinessLogic).pipe(
      Effect.provide(TestLayer)
    )
    
    expect(callCount).toBe(1)
  }))
```

---

## 7. 无需 Mock 库的原因

Effect-TS 不需要 Mock 库的核心原因：

1. **依赖是值（values）而非模块**：依赖是 `Context.Tag` 返回的值，可以被任何符合接口的对象替换
2. **分层架构**：`Layer` 是显式的依赖组合，测试时只需构建替代 Layer
3. **编译时检查**：`Effect.provide(Layer)` 在类型层面确保所有依赖被满足
4. **纯函数式**：Effect 可以轻松被 `Effect.succeed` 或 `Effect.fail` 替换

```typescript
// 对比：

// ❌ 传统 Mock：jest.mock 作用于模块，类型不安全
jest.mock("./email")
const emailMock = emailService.sendWelcome as jest.Mock

// ✅ Effect 方式：编译时类型安全，无需类型断言
Layer.succeed(EmailService, {
  sendWelcome: () => Effect.void
  // 类型错误：如果缺少方法，编译失败
})
```

---

## 8. 最佳实践

1. **优先测试接口，不测试实现**：通过替换 Layer 测试外部行为
2. **使用 TestClock 而非 sleep**：避免测试中的真实等待
3. **保持 Test Layer 简单**：不要构建过于复杂的 Mock 层
4. **快照测试 Effect**：使用 `Effect.runPromiseExit` 获取完整执行结果
5. **覆盖边界情况**：测试 `Effect.fail`、`Effect.die`、`Effect.interrupt` 等路径

```typescript
// 快照测试
it("should produce expected exit", () =>
  Effect.runPromiseExit(
    myProgram.pipe(Effect.provide(TestLayer))
  ).then((exit) => {
    expect(exit).toMatchSnapshot()
  })
)
```

---

## 参考

- Effect-TS 测试指南：https://effect.website/docs/guides/testing
- API 参考：`TestClock` (`effect/TestClock`), `TestRandom` (`effect/TestRandom`), `TestConsole` (`effect/TestConsole`), `Layer` (`effect/Layer`)
- 相关章节：ch04（DI/Context）、ch05（Scope）、ch14（运行时排查）