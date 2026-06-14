# ch11 可测试性

## 概述

Effect-TS 的依赖注入系统天然解决了传统测试中的核心难题：**如何替换真实依赖**。不需要 Mock 库（如 Jest Mock、Sinon、ts-mockito），不需要 `jest.mock()` 对模块级别的猴子补丁。因为在 Effect 中，依赖是**显式声明**的 `Service`，在测试时只需提供一个 `TestLayer` 即可替换。

这种设计带来的优势：
- 测试代码与生产代码使用相同的接口
- 编译时可验证依赖是否全部替换
- Effect 的 `TestClock`、`TestRandom`、`TestConsole` 等测试服务提供精确控制

这是 Effect-TS 最大的卖点之一：**可测试性不是后加的功能，而是架构设计的第一性原则**。

---

## 1. 使用场景

### 1.1 业务逻辑隔离测试

不启动数据库、不发送真实邮件，单独测试业务规则：

```typescript
// 生产代码只依赖 Tag，不依赖具体实现
const calculateDiscount = (userId: string, amount: number) =>
  Effect.gen(function* (_) {
    const db = yield* _(UserRepository)
    const user = yield* _(db.findById(userId))
    if (!user) return 0
    return user.loyaltyPoints > 1000 ? amount * 0.2 : amount * 0.05
  })
```

### 1.2 定时 / 重试逻辑测试

无需 `jest.useFakeTimers`，用 `TestClock` 瞬间验证超时和重试行为。

### 1.3 随机 / 控制台交互测试

使用 `TestRandom` 和 `TestConsole` 模拟用户输入和随机行为，无需手动 mock `Math.random` 或 `process.stdin`。

---

## 2. 实现原理：依赖是值而非模块

### 2.1 Context.Tag 的运行时表现

`Context.Tag` 返回的不是类也不是命名空间——它是一个**运行时可识别的键**，配合 `Layer` 可以在 Effect 运行时动态替换其对应的值：

```typescript
// 编译时：Database 是 interface 的类型约束
// 运行时：Database 是用于查找依赖的标记
class Database extends Context.Tag("Database")<
  Database,
  { readonly query: (sql: string) => Effect.Effect<unknown[]> }
>() {}

// 生产层
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.tryPromise(() => pool.query(sql))
})

// 测试层 —— 同样的 Tag，不同的实现
const DatabaseTest = Layer.succeed(Database, {
  query: (sql) => Effect.succeed([{ mocked: true }])
})
```

### 2.2 Layer 的组合与替换

`Layer` 的设计让依赖替换变得"声明式"——你只需要声明"测试时用 TestLayer 代替 LiveLayer"，编译器和运行时负责其余工作：

```typescript
// 生产
const AppLayer = Layer.mergeAll(DatabaseLive, EmailLive, LoggerLive)

// 测试：仅替换 Database 和 Email，Logger 继续使用生产实现
const TestLayer = Layer.mergeAll(DatabaseTest, EmailTest, LoggerLive)
```

---

## 3. 对比：Jest Mock vs Effect TestContext

| 维度 | Jest Mock | Effect TestContext |
|------|-----------|-------------------|
| Mock 实现 | `jest.mock` 模块替换 | 替换 `Layer` 实现 |
| Mock 泄漏 | 测试间可能污染，需 `beforeEach` 清理 | 每个测试独立 `Context`，天然隔离 |
| 定时器 | `jest.useFakeTimers` + `jest.advanceTimersByTime` | `TestClock.adjust` 精确时间旅行 |
| 随机数 | 手动 mock `Math.random` | `TestRandom.feedNextInts` 确定性值 |
| 类型安全 | `as jest.Mock` 类型断言 | 编译时检查，无需类型断言 |
| 可组合性 | 模块级 mock 难以组合 | `Layer.merge` / `Layer.mergeAll` 自由组合 |
| 异步边界 | 需 `waitFor` / `findBy` | Effect 运行完毕即为因果终点 |
| 调用验证 | `toHaveBeenCalledWith` | 通过 `Ref` 手动追踪 |

**为什么 Effect 方式更优？**

Jest Mock 的核心问题是**模块系统级别的猴子补丁**：`jest.mock` 在模块加载时替换整个模块，这会导致：

1. **泄漏风险**：如果 A 测试 mock 了一个模块，B 测试忘记还原，B 会继承 A 的 mock
2. **类型不安全**：`as jest.Mock` 是运行时强制转换，编译时无法验证 mock 接口的正确性
3. **难以组合**：如果两个测试需要同一个模块的不同 mock 实现，需要复杂的状态管理

Effect 的方式将依赖替换从"模块系统边界"移到了"值边界"：

```typescript
// Jest 方式：模块级别替换，测试间共享
jest.mock("./email")
// ❌ 所有测试的 email 模块都被替换了

// Effect 方式：每个测试独立提供 Layer
it("test A", () => myProgram.pipe(Effect.provide(LayerA)))
it("test B", () => myProgram.pipe(Effect.provide(LayerB)))
// ✅ 测试间完全独立
```

---

## 4. TestClock —— 时间旅行

`TestClock` 是 Effect-TS 中最强大的测试工具之一。它允许你在测试中**完全控制时间**，无需使用 `setTimeout` 或 `jest.useFakeTimers`。

### 4.1 基本用法

```typescript
import { Effect, TestClock, Ref, Console } from "effect"
import { describe, it, expect } from "@effect/vitest"

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

### 4.2 测试超时与重试

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

      const fiber = yield* _(
        flakyApi.pipe(
          Effect.retry(
            Schedule.exponential("1 seconds").pipe(
              Schedule.intersect(Schedule.recurs(5))
            )
          ),
          Effect.fork
        )
      )

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

**关键原则**：TestClock 只在测试层的 Effect 内有效。生产代码中的 `Effect.sleep` 在 TestClock 下被自动替换为虚拟时间。这种机制的核心是 Effect 的**可替换执行器（Executor）**：TestClock 提供的虚拟时间执行器接管了所有定时器操作，使其跳过真实等待。

---

## 5. TestRandom 与 TestConsole

### 5.1 TestRandom —— 确定性随机

传统测试中，随机数是不可控的。Effect 的 `TestRandom` 允许你预设随机值序列：

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

`TestRandom` 支持预设的类型包括：
- `feedNextInts`：预设整数序列
- `feedNextDoubles`：预设浮点数序列
- `feedNextBooleans`：预设布尔值序列
- `setSeed`：设置种子，后续生成的随机值完全由种子确定

### 5.2 TestConsole —— 捕获日志与模拟输入

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

`TestConsole` 的 `output` 方法会清空缓存，因此后续调用只返回新产生的日志。这在验证日志分步输出时非常有用。

---

## 6. 潜在风险与优化策略

### 6.1 TestLayer 何时泄漏？

虽然在 Effect 中每个测试的 Context 是独立的，但仍然需要注意：

- `Layer.scoped` 创建的资源如果未正确关闭，可能在测试间残留
- 共享的可变状态（如全局 `process.env`）仍需手动清理
- `TestClock` 只在显式提供后才生效——如果一个测试忘记提供 `TestClock.TestClockLive`，`Effect.sleep` 会真实等待

### 6.2 测试速度优化

```typescript
// ❌ 每次测试都构造新的 Layer（如果构造开销大）
it("test 1", () => myEffect.pipe(Effect.provide(expensiveLayer)))
it("test 2", () => myEffect.pipe(Effect.provide(expensiveLayer)))

// ✅ 模块级复用 Layer
const TestLayer = buildExpensiveLayer()
it("test 1", () => myEffect.pipe(Effect.provide(TestLayer)))
it("test 2", () => myEffect.pipe(Effect.provide(TestLayer)))
```

### 6.3 避免测试中的 Effect 泄漏

```typescript
// ❌ 在测试中直接 runPromise 而不处理生命周期
const result = await Effect.runPromise(myProgram.pipe(Effect.provide(TestLayer)))

// ✅ 使用 Effect.vitest / Effect.jest 适配器
it("test", () =>
  Effect.gen(function* (_) {
    const result = yield* _(myProgram.pipe(Effect.provide(TestLayer)))
    expect(result).toBe(expected)
  })
)
```

---

## 7. 测试外部 API

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
      Effect.andThen((req) => HttpClient.execute(req)),
      Effect.andThen(HttpClientResponse.json)
    )
})

// 测试实现：直接返回预设响应
const PaymentApiTest = Layer.succeed(PaymentApi, {
  charge: (amount, token) =>
    Effect.succeed({
      success: true,
      transactionId: `txn-${amount}-${token.slice(0, 4)}`
    })
})

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

如果需要测试 HTTP 客户端本身（而非业务逻辑），也可以只替换传输层——仍然使用真正的 `HttpClient` 实现，但提供一个返回固定响应的模拟 HTTP 处理器。

---

## 8. 完整示例：测试带重试 + 超时的支付服务

以下示例整合了 TestClock、Service 替换和状态追踪，模拟一个完整的支付服务测试：

```typescript
import { Effect, Context, Layer, Ref, TestClock, Schedule, Console } from "effect"
import { describe, it, expect } from "@effect/vitest"

// ─── Service 定义 ───
class PaymentGateway extends Context.Tag("PaymentGateway")<
  PaymentGateway,
  {
    readonly charge: (amount: number, token: string) =>
      Effect.Effect<{ id: string; status: "success" | "failed" }>
  }
>() {}

class NotificationService extends Context.Tag("NotificationService")<
  NotificationService,
  { readonly send: (userId: string, message: string) => Effect.Effect<void> }
>() {}

// ─── 生产代码：带重试和超时的支付处理 ───
const processPayment = (userId: string, amount: number, token: string) =>
  Effect.gen(function* (_) {
    const gateway = yield* _(PaymentGateway)
    const notif = yield* _(NotificationService)

    // 重试最多 3 次，指数退避
    const result = yield* _(
      gateway.charge(amount, token).pipe(
        Effect.retry(
          Schedule.exponential("500 millis").pipe(
            Schedule.intersect(Schedule.recurs(3))
          )
        ),
        Effect.timeout("10 seconds")
      )
    )

    // 发送通知
    yield* _(notif.send(userId,
      `Payment ${result.status}: ${result.id}`
    ))

    return result
  })

// ─── 测试 ───
describe("processPayment with retry and timeout", () => {
  it("should succeed after 2 retries", () =>
    Effect.gen(function* (_) {
      let attempts = 0
      const notifications: string[] = []

      const TestLayer = Layer.merge(
        Layer.succeed(PaymentGateway, {
          charge: (_, __) => Effect.sync(() => {
            attempts++
            // 前两次失败，第三次成功
            if (attempts < 3) {
              throw new Error("Service unavailable")
            }
            return { id: "txn-123", status: "success" as const }
          })
        }),
        Layer.succeed(NotificationService, {
          send: (_, msg) => Effect.sync(() => { notifications.push(msg) })
        })
      )

      const fiber = yield* _(
        processPayment("user-1", 100, "tok_test").pipe(
          Effect.provide(TestLayer),
          Effect.fork
        )
      )

      // 指数退避：500ms → 1s → 2s
      yield* _(TestClock.adjust("500 millis")) // 第一次重试
      yield* _(TestClock.adjust("1 seconds"))  // 第二次重试
      yield* _(TestClock.adjust("2 seconds"))  // 第三次尝试（成功）

      const result = yield* _(fiber.join)

      expect(attempts).toBe(3)
      expect(result.status).toBe("success")
      expect(notifications[0]).toContain("success")
    }).pipe(Effect.provide(TestClock.TestClockLive)))

  it("should timeout if payment takes too long", () =>
    Effect.gen(function* (_) {
      const TestLayer = Layer.succeed(PaymentGateway, {
        charge: (_, __) =>
          // 支付永远不会完成
          Effect.never
      })

      const fiber = yield* _(
        processPayment("user-2", 200, "tok_test").pipe(
          Effect.provide(TestLayer),
          Effect.fork
        )
      )

      // 前进 10 秒触发超时
      yield* _(TestClock.adjust("10 seconds"))

      const exit = yield* _(fiber.await)
      expect(exit._tag).toBe("Failure")
    }).pipe(Effect.provide(TestClock.TestClockLive)))
})
```

---

## 9. 常见测试模式

| 模式 | 方法 | 适用场景 |
|------|------|----------|
| 替换 Service | `Layer.succeed(Tag, mock)` | 外部 API、数据库 |
| 时间控制 | `TestClock.adjust` | 超时、重试、定时任务 |
| 确定性随机 | `TestRandom.feedNextInts` | 随机算法测试 |
| 日志断言 | `TestConsole.output` | 验证日志输出 |
| 状态验证 | `Ref` + `Layer` | 验证副作用调用次数和参数 |
| Fiber 生命周期 | `fiber.await` / `fiber.join` | 测试并发和中断 |
| Exit 断言 | `runPromiseExit` | 完整验证 Success/Failure/Interrupt |

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

## 10. 无需 Mock 库的原因

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

## 11. 开发者技能：测试先行的依赖设计

在 Effect-TS 中，可测试性不是测试阶段考虑的事情——它是设计阶段的决策。以下原则可以帮助你写出天然可测试的 Effect 代码：

| 原则 | 说明 |
|------|------|
| **显式依赖** | 永远通过 `Context.Tag` 声明依赖，不要在 Effect 函数内部 import 外部模块 |
| **最小接口** | Service 接口越小越容易 mock，每个 Service 只暴露必要的操作 |
| **纯 Effect** | 副作用操作返回 `Effect` 而非 `Promise`，确保测试时可以替换执行器 |
| **分层测试** | 底层 Service 用简单 Effect 替换，上层业务逻辑专注测试规则 |
| **避免全局状态** | 全局状态（`process.env`、全局变量）无法被 Effect 替换，通过 Layer 注入 |

---

## 本章小结

- **核心卖点**：Effect-TS 的可测试性不是事后 Mock，而是架构设计的第一原则
- **TestClock**：最强大的测试工具，让时间旅行成为现实，无需真实等待
- **TestRandom / TestConsole**：确定性控制随机和 I/O 交互
- **对比优势**：相比 Jest Mock，Effect 的方式类型安全、天然隔离、可组合
- **测试模式**：Service 替换 + 时间控制 + 状态追踪 = 覆盖绝大多数测试场景

---

## 参考

- Effect-TS 测试指南：https://effect.website/docs/guides/testing
- API 参考：`TestClock` (`effect/TestClock`), `TestRandom` (`effect/TestRandom`), `TestConsole` (`effect/TestConsole`), `Layer` (`effect/Layer`)
- 相关章节：ch04（DI/Context）、ch05（Scope）、ch10（Schema in testing）