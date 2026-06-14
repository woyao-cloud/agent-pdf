# 第三章：错误处理与领域建模

错误处理是软件工程中最棘手的难题之一。在 TypeScript 中，传统的 `try/catch` 机制虽然简单直接，却存在一个根本性缺陷：异常的类型信息在传播过程中被彻底抹去，导致调用方无法在编译期知晓可能发生的错误，只能在运行时被动防御。Effect-TS 将错误提升为类型系统的一等公民，通过 `Effect<A, E, R>` 的三元组设计，让错误的类型、传播和处理在编译期就得到保证。

本章从**使用场景**出发，逐步深入到**实现原理**、**潜在风险**、**优化策略**和**典型问题处理**，最后通过完整的**示例代码**和**开发者技能**总结，帮助你建立系统的 Effect-TS 错误处理思维。

---

### 使用场景

#### 问题引入：一个真实的用户管理微服务

假设你正在开发一个用户管理微服务。该服务需要完成以下三个连贯的操作：

1. 根据用户 ID 查询用户基本信息
2. 检查该用户是否具备执行操作的权限
3. 获取该用户的最近订单列表

这是一个非常典型的业务场景——多个依赖步骤串联，每一步都可能出现不同类型的错误，且调用方需要针对不同错误做出不同的响应。

让我们先看看在原生 Promise 中你会如何实现：

```typescript
// 问题场景：Promise 模式下的错误处理
interface User {
  id: string
  name: string
  role: "admin" | "user"
}
interface Order {
  orderId: string
  amount: number
}

// 模拟数据库查询
async function findUserById(id: string): Promise<User> {
  const user = database.get(id)
  if (!user) throw new Error("UserNotFound") // 只能用字符串区分
  return user
}

async function checkPermission(user: User): Promise<boolean> {
  if (user.role !== "admin") throw new Error("InsufficientPermission")
  return true
}

async function getRecentOrders(userId: string): Promise<Order[]> {
  const orders = await fetch(`/api/orders?userId=${userId}`)
  if (!orders.ok) throw new Error("NetworkError")
  return orders.json()
}

// 调用方：所有错误都混在一起
async function handleRequest(userId: string) {
  try {
    const user = await findUserById(userId)
    await checkPermission(user)
    const orders = await getRecentOrders(userId)
    return { user, orders }
  } catch (e: unknown) {
    // e 的类型是 unknown，完全不知道具体是什么错误
    if (e instanceof Error) {
      if (e.message === "UserNotFound") {
        return { status: 404, message: "用户不存在" }
      }
      // 如果某天有人把 message 改成了 "USER_NOT_FOUND"，这个分支就断了
    }
    // 兜底：所有错误都变成 500
    return { status: 500, message: "服务器内部错误" }
  }
}
```

这个实现隐藏着哪些问题？

| 问题 | 说明 |
|------|------|
| **类型盲区** | `catch(e: unknown)` 完全丧失了类型信息，你无法从编译器得到任何错误类型的提示 |
| **字符串耦合** | 用 `e.message` 字符串来区分错误类型，没有编译期检查，重构时极易遗漏 |
| **冒泡混乱** | `findUserById` 的数据库错误、`checkPermission` 的业务错误、`getRecentOrders` 的网络错误被一股脑抛到同一个 `catch` 块 |
| **分支遗漏** | 新增一个错误类型时，没有任何机制提醒调用方增加新的处理分支 |
| **资源泄漏** | `throw` 会跳过 `finally` 块之外的资源清理代码，如果中途分配了资源（数据库连接、文件句柄），可能无法释放 |

#### Effect-TS 的解决思路

Effect-TS 从根本上重新设计了错误处理的模型。它将函数签名从 `Promise<T>` 扩展为 `Effect<A, E, R>`，其中 `E` 就是错误类型的联合。这意味着：

- 调用方在编译期就知道函数可能产生哪些错误
- 错误类型是精确的 TypeScript 类型，不是字符串
- 每处理一个错误，该错误类型就从联合中移除（类型擦除）
- 遗漏处理分支会在编译时报错

在开始实际编码之前，让我们先理解这套机制背后的原理。

---

### 实现原理

#### Effect<A, E, R> 的三维模型

Effect-TS 将函数的返回类型分解为三个维度，这比 Promise 的单维模型提供了丰富得多的信息：

```
Effect<成功值类型 A, 错误类型 E, 依赖环境 R>
```

| 维度 | 含义 | Promise 对应物 | Effect-TS 的增强 |
|------|------|---------------|------------------|
| `A` (Success) | 操作成功时的返回值 | `Promise<T>` 的 `T` | 无差异 |
| `E` (Error) | 操作可能产生的错误类型 | **无**（`unknown`） | 精确的联合类型，编译期可见 |
| `R` (Requirements) | 操作所需的依赖环境 | **无** | Context 模块管理依赖（下章详解） |

重点在于 `E` 参数。在传统 Promise 中，一个函数的签名 `(): Promise<User>` 什么也说明不了——它可能抛出 `UserNotFound`、`DatabaseError`、`NetworkError`，甚至 `TypeError`（编程错误）。**调用方只有读文档或看源码才能知道，而这两者都可能过时。**

在 Effect-TS 中：

```typescript
// 每一个可能的错误都在类型中明确声明
declare const findUser: (id: string) => Effect.Effect<User, UserNotFound | DatabaseError>
```

编译器看到这个签名后，会强制调用方处理 `UserNotFound` 和 `DatabaseError` 这两个错误分支。**如果新增了一个错误类型，所有调用方都会收到编译错误，直到它们处理了这个新的分支。** 这相当于给错误处理上了一道"类型安全带"。

#### Data.TaggedError 的工作原理

Effect-TS 使用 `Data.TaggedError` 来定义领域错误。它的核心设计是"可辨别联合"（Discriminated Union）：

```typescript
import { Data } from "effect"

// 每个错误都有一个独一无二的 _tag 字段
export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}
export class NetworkTimeout extends Data.TaggedError("NetworkTimeout")<{
  url: string
  elapsedMs: number
}> {}
```

为什么需要 `_tag` 字段？考虑下面这个场景：TypeScript 的结构化类型系统允许两个不同的类型拥有相同的结构。如果 `UserNotFound` 和 `OrderNotFound` 只有参数不同但结构一致：

```typescript
// 没有 _tag，两个类型结构相同，TypeScript 无法区分
class UserNotFound { constructor(public id: string) {} }
class OrderNotFound { constructor(public id: string) {} }
// TypeScript 认为它们是同一个类型！
```

加上 `_tag` 后：

```typescript
// _tag 作为字面量类型，使两个类型完全不同
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
class OrderNotFound extends Data.TaggedError("OrderNotFound")<{ id: string }> {}
// TypeScript 现在能区分它们了
```

`Data.TaggedError` 做了三件事：

1. **添加 `_tag` 字段**：为类添加一个值为字符串字面量的 `_tag` 字段，使每个错误成为可辨别联合的一支
2. **继承 `Error`**：保持与 JavaScript 原生错误机制的兼容，`instanceof Error` 返回 `true`
3. **结构化数据**：构造函数接受一个对象参数，将所有字段绑定到实例上

#### 错误传播的编译期保证

Effect-TS 错误模型的一个关键设计是：**错误类型在处理后被擦除**。看一个对比：

```typescript
// 步骤 1：原始 Effect，错误类型为 A | B | C
const step1: Effect.Effect<User, UserNotFound | DatabaseError | NetworkTimeout>
  = findUser(id)

// 步骤 2：catchTag 处理了 UserNotFound，错误类型减少为 DatabaseError | NetworkTimeout
const step2: Effect.Effect<User, DatabaseError | NetworkTimeout>
  = Effect.catchTag(step1, "UserNotFound", () => Effect.succeed(null as any))

// 步骤 3：catchAll 处理了所有剩余错误，错误类型变为 never
const step3: Effect.Effect<User, never>
  = Effect.catchAll(step2, () => Effect.succeed(null as any))
```

每一步处理都**缩小了错误类型的联合**。当所有错误被处理完毕后，`E` 变为 `never`，表示这个 Effect 不再产生预期错误。这与 Promise 的 `try/catch` 有本质区别：

| 维度 | Promise | Effect |
|------|---------|--------|
| **错误类型** | `catch(e: unknown)` — 类型完全丢失 | 精确的联合类型 `E`，编译期可见 |
| **捕获方式** | `try/catch` 运行时捕获 | `catchTag` / `catchAll` 编译期保证 |
| **类型擦除** | 捕获后异常类型信息仍然丢失 | 处理过的错误类型从联合中移除 |
| **错误组合** | 手动处理多个 Promise 的错误 | `Effect.all` 自动聚合所有错误类型 |
| **遗漏检查** | 无——运行时才知道没处理 | 有——编译时报错 |
| **重试支持** | 手写 `while` 循环 | 内置 `retry` / `schedule` 组合子 |

#### Effect.all 中的错误类型聚合

当使用 `Effect.all` 组合多个 Effect 时，所有错误类型会自动聚合：

```typescript
// 每个操作有不同的错误类型
const getUser = (id: string): Effect.Effect<User, UserNotFound, never>
const getOrders = (userId: string): Effect.Effect<Order[], NetworkError, never>

// Effect.all 自动推导出错误类型为 UserNotFound | NetworkError
const getCombined = (id: string): Effect.Effect<{ user: User; orders: Order[] }, UserNotFound | NetworkError, never> =>
  Effect.all({ user: getUser(id), orders: getOrders(id) })
```

如果你新增了一个错误类型：

```typescript
// 修改前
const getOrders = (userId: string): Effect.Effect<Order[], NetworkError, never>

// 修改后，新增了 RateLimitError
const getOrders = (userId: string): Effect.Effect<Order[], NetworkError | RateLimitError, never>
```

所有调用 `getCombined` 的地方，其错误类型会自动变为 `UserNotFound | NetworkError | RateLimitError`，编译器会提示它们在何处需要处理这个新的错误类型。

---

### 潜在风险

Effect-TS 的错误模型虽然强大，但在实际使用中如果不加注意，也会引入新的问题。以下是几个最常见的陷阱。

#### 风险一：错误类型膨胀

Effect-TS 将错误类型暴露在函数签名中，这是它的优势，但也是潜在的风险来源。如果不对错误类型做层次管理，深层调用链的 `E` 会变成几十个错误类型的联合：

```typescript
// 深层调用链：每一层的错误都冒泡到顶层
const validateInput = (input: unknown): Effect.Effect<ValidInput, ValidationError, never>
const findUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError, never>
const checkPermission = (user: User): Effect.Effect<void, PermissionError, never>
const getOrders = (userId: string): Effect.Effect<Order[], NetworkError | RateLimitError, never>
const processPayment = (order: Order): Effect.Effect<Receipt, PaymentError | InsufficientBalance, never>
const sendNotification = (receipt: Receipt): Effect.Effect<void, NotificationError, never>

// 业务编排：E 变成了 7 个错误类型的联合
const checkout = (input: unknown): Effect.Effect<Receipt,
  ValidationError | UserNotFound | DatabaseError | PermissionError | NetworkError | RateLimitError | PaymentError | InsufficientBalance | NotificationError,
  never>
```

这就是**错误类型膨胀**问题。当调用方看到这个签名时，会感到无从下手——需要处理这么多错误吗？实际上，顶层的调用方可能只需要知道"是业务错误（4xx）还是系统错误（5xx）"。

#### 风险二：Defect 与 Error 的混淆

在 Effect-TS 中，错误被分为两个层次：

| 概念 | 含义 | 来源 | 示例 |
|------|------|------|------|
| **Error（预期错误）** | 业务上预期的失败，被类型系统追踪 | `Effect.fail(error)` | 用户不存在、余额不足 |
| **Defect（缺陷）** | 非预期的运行时异常，不被类型系统追踪 | 未捕获的 throw、断言失败、空指针 | 数组越界、类型转换错误 |

两者的核心区别在于：Error 是用 `Effect.fail` **显式**产生的，而 Defect 是程序内部**隐式**抛出的。

```typescript
// Error：被类型系统追踪
const failExample: Effect.Effect<never, UserNotFound, never> =
  Effect.fail(new UserNotFound({ id: "123" }))

// Defect：不被类型系统追踪，函数签名中的 E 仍然是 never
const defectExample: Effect.Effect<number, never, never> =
  Effect.sync(() => {
    // 这个 throw 不会被捕获到 Effect 的 E 中
    throw new Error("运行时异常")
    return 42
  })
```

一个常见的错误是：团队约定用 `throw` 抛异常，却在 Effect 的 `E` 类型中声明了对应的错误类型。**`throw` 和 `Effect.fail` 在 Effect-TS 中是完全不同的机制。** `throw` 产生的 Defect 不会被 `catchTag` 或 `catchAll` 捕获，必须用 `catchAllDefect` 才能捕获。

```typescript
// 错误示范：用 throw 代替 Effect.fail
const findUserBad = (id: string): Effect.Effect<User, UserNotFound, never> =>
  Effect.sync(() => {
    if (!db[id]) {
      throw new UserNotFound({ id }) // 这是 Defect，不是 Error！
    }
    return db[id]
  })

// catchTag 无法捕获上面这个 "Error"——因为它是 Defect
findUserBad("123").pipe(
  Effect.catchTag("UserNotFound", ...) // 不会触发！
)
```

#### 风险三：未捕获的 Defect 导致进程崩溃

当 Effect 运行时产生的 Defect 没有被任何 `catchAllDefect` 捕获时，Effect-TS 的运行时（Runtime）会**中断整个 Fiber**，并将 Defect 传播到 Runtime 的默认错误处理器。默认行为是**抛出异常**，可能导致 Node.js 进程崩溃。

```typescript
import { Effect, Console } from "effect"

const crashExample = Effect.gen(function* (_) {
  const arr = [1, 2, 3]
  // 越界访问——这是 Defect
  const value = arr[10]
  // 对 undefined 调用 toFixed 会触发 Defect（TypeError）
  return (value as any).toFixed(2)
})

// 运行这个 Effect 会导致进程抛出异常
Effect.runPromise(crashExample)
// => TypeError: Cannot read properties of undefined (reading 'toFixed')
// => 进程未经优雅处理直接崩溃
```

#### 风险四：catchTag 拼写错误

`catchTag` 的第一个参数是字符串，**没有编译期类型检查**。如果你的团队中有人拼错了 `_tag` 的值：

```typescript
Effect.catchTag(step1, "UserNotFount", ...) // 拼写错误！不会触发
```

这段代码**不会报编译错误**，但运行时也不会捕获到 `UserNotFound` 错误。`UserNotFound` 会穿透所有 `catchTag` 检查，最终到达 `catchAll` 或成为未处理错误。这种问题在多人协作的大型代码库中出现的频率远比想象的高。

---

### 优化策略

理解了潜在风险后，我们就可以针对性地制定优化策略。

#### 策略一：在模块边界使用 mapError 转换错误类型

**错误类型膨胀**的最有效治理手段是在模块边界进行错误转换。每个模块只暴露有限的领域错误，内部细节用 `mapError` 屏蔽：

```typescript
// ===== 数据访问层（内部）=====
// 内部函数有细粒度的错误类型
const queryUserFromDb = (id: string): Effect.Effect<User, DatabaseError | ConnectionError | TimeoutError, never>
const queryOrdersFromDb = (userId: string): Effect.Effect<Order[], DatabaseError | ConnectionError | TimeoutError, never>

// ===== 服务层（对外暴露）=====
// 对外只暴露一个领域错误
class ServiceError extends Data.TaggedError("ServiceError")<{
  code: "NOT_FOUND" | "SERVICE_UNAVAILABLE"
  message: string
  internalCause: unknown
}> {}

// 在边界处将所有内部错误转换为 ServiceError
export const getUserWithOrders = (id: string): Effect.Effect<{ user: User; orders: Order[] }, ServiceError, never> =>
  Effect.all({
    user: queryUserFromDb(id),
    orders: queryOrdersFromDb(id),
  }).pipe(
    Effect.mapError((err) => {
      if (err._tag === "DatabaseError") {
        return new ServiceError({
          code: "SERVICE_UNAVAILABLE",
          message: "数据库暂时不可用",
          internalCause: err,
        })
      }
      // 其他内部错误统一转换为 SERVICE_UNAVAILABLE
      return new ServiceError({
        code: "SERVICE_UNAVAILABLE",
        message: "内部服务异常",
        internalCause: err,
      })
    })
  )
```

经过 `mapError` 的转换后，调用方的 `E` 从 `DatabaseError | ConnectionError | TimeoutError` 变成了单一的 `ServiceError`。**调用方不需要关心底层是数据库连接超时还是查询异常，它只需要知道"服务不可用"**。

#### 策略二：错误类型设计原则（扁平化、领域化）

设计错误类型时，遵循以下原则可以减少混乱：

**原则 1：领域化——错误反映业务语义，而非技术细节**

```typescript
// 不推荐：技术维度的错误
class NotFoundError extends Data.TaggedError("NotFoundError")<{ resource: string; id: string }> {}

// 推荐：业务维度的错误
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
class OrderNotFound extends Data.TaggedError("OrderNotFound")<{ orderId: string }> {}
```

**原则 2：扁平化——按使用场景组织错误，不按技术分层**

```typescript
// 不推荐：企业级过度分层
class BusinessError extends Data.TaggedError("BusinessError")<{ category: string; detail: unknown }> {}
class SystemError extends Data.TaggedError("SystemError")<{ code: number; detail: unknown }> {}

// 推荐：具体、扁平的错误类型，每个都有独立的 _tag
class InsufficientBalance extends Data.TaggedError("InsufficientBalance")<{
  currentBalance: number
  requiredAmount: number
}> {}
class AccountFrozen extends Data.TaggedError("AccountFrozen")<{ accountId: string }> {}
```

**原则 3：携带上下文——保留业务排查所需的字段**

```typescript
// 不推荐：上下文字段不足
class PaymentFailed extends Data.TaggedError("PaymentFailed")<{}> {}
// 排查时只能知道"支付失败"，完全无法定位原因

// 推荐：保留关键上下文
class PaymentFailed extends Data.TaggedError("PaymentFailed")<{
  orderId: string
  amount: number
  paymentProvider: string
  providerErrorCode: string
  providerErrorMessage: string
  timestamp: Date
}> {}
```

#### 策略三：catchTag 精准捕获 vs catchAll 兜底

构建错误处理链时，遵循"**先精准、后兜底**"的原则：

```typescript
const handleUserRequest = (id: string): Effect.Effect<Response, never> =>
  fetchUserWithOrders(id).pipe(
    // 第一层：精准捕获已知的错误类型
    Effect.catchTag("UserNotFound", (e) =>
      Effect.succeed(new Response(
        JSON.stringify({ error: `用户 ${e.id} 不存在` }),
        { status: 404 }
      ))),
    Effect.catchTag("InsufficientPermission", (e) =>
      Effect.succeed(new Response(
        JSON.stringify({ error: `用户 ${e.userId} 缺乏 ${e.requiredRole} 权限` }),
        { status: 403 }
      ))),
    // 第二层：兜底处理所有剩余错误
    Effect.catchAll((e) =>
      Effect.succeed(new Response(
        JSON.stringify({ error: `服务器错误: ${e._tag}` }),
        { status: 500 }
      )))
  )
```

设计原则：
- **`catchTag` 用于已知的业务错误**：你能明确知道这个错误该如何恢复或向用户展示
- **`catchAll` 用于兜底**：所有未被精准匹配的错误在这里统一处理，通常是日志记录 + 500 响应
- **不要只用 `catchAll`**：如果你发现代码中充斥着 `catchAll` + `if` 分支，那说明你放弃了类型系统的优势，回到了 Promise 的老路上

#### 策略四：使用 const assertions 防止 catchTag 拼写错误

针对拼写错误风险，可以利用 TypeScript 的 `const assertions` 提取 `_tag` 字段作为类型：

```typescript
// 方案 A：定义一个帮助函数获取 _tag（推荐）
const tagOf = <T extends { _tag: string }>(error: T): T["_tag"] => error._tag

// 在捕获时使用 tagOf
Effect.catchTag(step1, tagOf(new UserNotFound({ id: "" })), ...)
// 如果拼写错误，TypeScript 会报错：因为 "UserNotFount" !== "UserNotFound"
```

更安全的方式是直接引用错误类的静态 `_tag`：

```typescript
// 方案 B：提取 _tag 到常量
const ERRORS = {
  USER_NOT_FOUND: new UserNotFound({ id: "" })._tag, // "UserNotFound"
  DATABASE_ERROR: new DatabaseError({ cause: "" })._tag,
  NETWORK_TIMEOUT: new NetworkTimeout({ url: "", elapsedMs: 0 })._tag,
} as const

// 使用时：拼写错误会被类型系统阻止
Effect.catchTag(step1, ERRORS.USER_NOT_FOUND, ...) // 自动补全，零拼写错误
```

---

### 典型问题处理

#### 问题 1：catchTag 拼写错误导致类型不匹配

**现象**：`catchTag("UserNotFount", ...)` 不会报编译错误，但也不会捕获到 `UserNotFound` 错误。错误会穿透所有 `catchTag`，最终在 `catchAll` 或运行时处理。

**根因**：`catchTag` 的第一个参数是普通的 `string` 类型，没有与错误类的 `_tag` 字面量类型关联。

**解决方案**：最佳实践中，始终从错误类的 `_tag` 属性提取字符串字面量，而不是手写字符串：

```typescript
// ✅ 正确方式：使用 const assertions 派生 _tag
const UserNotFoundTag = new UserNotFound({ id: "" })._tag // 类型为 "UserNotFound"
// 或者直接从类的 prototype 获取
// const UserNotFoundTag = UserNotFound.prototype._tag

Effect.catchTag(step1, UserNotFoundTag, ...)
// 如果写成了 UserNotFoundTag 的别名，TypeScript 会检测类型不匹配
```

#### 问题 2：Effect.all 中一个失败全部失败

**现象**：使用 `Effect.all` 并行执行多个 Effect 时，其中一个失败会导致整体立即失败，其他正在执行的 Effect 也会被中断。

```typescript
const getAllData = (): Effect.Effect<{ a: DataA; b: DataB; c: DataC }, ErrorA | ErrorB | ErrorC, never> =>
  Effect.all({
    a: fetchDataA(), // 失败了
    b: fetchDataB(), // 也在执行，但会收到 Fiber 中断信号
    c: fetchDataC(), // 也在执行，也会被中断
  })
// 结果：任务 A 失败后，B 和 C 被取消，整体返回 ErrorA
```

**需求**：有时候我们希望"尽力而为"——即使某些任务失败，也希望获取其他任务的成功结果。

**解决方案**：使用 `mode: "either"` 让每个任务独立执行，成功或失败都不影响其他任务：

```typescript
import { Effect, Either } from "effect"

const getAllDataEither = Effect.all({
  a: fetchDataA(),
  b: fetchDataB(),
  c: fetchDataC(),
}, { concurrency: "unbounded", mode: "either" })

// 返回类型: Effect<{ a: Either<Either.ErrorA, DataA>; b: Either<Either.ErrorB, DataB>; c: Either<Either.ErrorC, DataC> }, never, R>
// 注意：E 变成了 never，因为每个结果都被包裹在 Either 中
// 调用方可以单独检查每个字段是成功还是失败
```

处理结果：

```typescript
const handleEither = Effect.gen(function* (_) {
  const result = yield* _(getAllDataEither)
  
  if (Either.isRight(result.a)) {
    console.log("A 成功:", result.a.right)
  } else {
    console.log("A 失败:", result.a.left)
  }
  // B、C 同理
})
```

这在批量操作和监控场景下非常有用：你希望收集所有操作的结果（无论成败），而不是被第一个失败打断。

#### 问题 3：错误类型膨胀——深层调用链的 E 管理

**现象**：在一个多层架构的应用中，从 Controller 到 Service 到 Repository 到 HTTP 客户端，每一层的错误类型都向上冒泡，导致顶层 Controller 的 `E` 包含 10+ 个错误类型。

**解决方案**：分层治理——每一层在自己的边界做 `mapError` 转换，只暴露本层抽象级别的错误：

```
┌─────────────────────────────────────────────────────────────┐
│ Controller 层 E: HttpError（内部映射为 4xx / 5xx 状态码）     │
│   ▲ mapError(HttpError.fromServiceError)                    │
├─────────────────────────────────────────────────────────────┤
│ Service 层 E: ServiceError（统一业务错误）                     │
│   ▲ mapError(ServiceError.fromRepositoryError)              │
├─────────────────────────────────────────────────────────────┤
│ Repository 层 E: RepositoryError（数据访问相关）              │
│   ▲ mapError(RepositoryError.fromNetworkError)              │
├─────────────────────────────────────────────────────────────┤
│ Network 层 E: NetworkError | TimeoutError（原始网络错误）     │
└─────────────────────────────────────────────────────────────┘
```

**具体实现**：

```typescript
// ===== 网络层 =====
class NetworkError extends Data.TaggedError("NetworkError")<{ url: string; statusCode: number }> {}
class TimeoutError extends Data.TaggedError("TimeoutError")<{ url: string }> {}
const httpGet = (url: string): Effect.Effect<unknown, NetworkError | TimeoutError, never> => { /* ... */ }

// ===== Repository 层：将网络层错误转换为 RepositoryError =====
class RepositoryError extends Data.TaggedError("RepositoryError")<{
  code: "NETWORK" | "TIMEOUT" | "NOT_FOUND"
  message: string
}> {}

const fetchUserRepo = (id: string): Effect.Effect<User, RepositoryError, never> =>
  httpGet(`/users/${id}`).pipe(
    Effect.mapError((err) => {
      switch (err._tag) {
        case "NetworkError":
          return new RepositoryError({ code: "NETWORK", message: `HTTP ${err.statusCode}` })
        case "TimeoutError":
          return new RepositoryError({ code: "TIMEOUT", message: `Request to ${err.url} timed out` })
      }
    })
  )

// ===== Service 层：E 只有 RepositoryError，不会暴露 NetworkError 或 TimeoutError =====
const getUserService = (id: string): Effect.Effect<User, RepositoryError, never> =>
  fetchUserRepo(id)
```

经过分层治理后，每一层的调用方都只需要处理该层抽象级别的错误。**Controller 不需要知道底层用的是 HTTP 还是 gRPC，也不需要知道具体的超时策略。**

---

### 开发者技能

#### 领域驱动设计（DDD）中的错误建模

在 DDD 中，错误也是**领域概念**的一部分。一个设计良好的领域模型，其错误类型应该和实体、值对象一样，来自业务人员（产品经理、领域专家）的词汇表，而不是来自技术实现。

| 错误类型 | 来自技术的描述 | 来自业务的描述 |
|---------|---------------|---------------|
| 第一种 | `NotFoundError("user")` | `UserNotFound` — "这个用户不存在" |
| 第二种 | `ValidationError("insufficient balance")` | `InsufficientBalance` — "你的余额不够支付这笔订单" |
| 第三种 | `ForbiddenError("operation not allowed")` | `AccountFrozen` — "你的账户已经被冻结，请联系客服" |

**实践建议**：在代码评审中，看到 `class XxxError extends ...` 时，问自己一个问题——"如果我把这个错误类型给产品经理看，他能理解吗？" 如果不能，说明这个错误是技术驱动的，不是领域驱动的。

#### 使用 Data.TaggedError 还是 class extends Error

Effect-TS 提供了两种定义错误的方式：

```typescript
// 方式 A：Data.TaggedError（推荐用于领域错误）
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}

// 方式 B：普通 class extends Error
class UserNotFound extends Error {
  readonly _tag = "UserNotFound"
  constructor(readonly id: string) {
    super(`User ${id} not found`)
  }
}
```

| 对比维度 | `Data.TaggedError` | `class extends Error` |
|---------|-------------------|---------------------|
| 代码量 | 一行 | 多行（constructor + super + _tag） |
| 结构数据 | 自动展开为实例属性 | 需要手动赋值 |
| 字符串表示 | 自动生成 `toString()` | 需要手动实现 |
| 类型推断 | 自动推断 `_tag` 为字面量类型 | 需要 `as const` 或其他手段 |
| 可扩展性 | 有限（不支持自定义方法） | 完全自由 |

**建议**：领域错误用 `Data.TaggedError`，需要复杂逻辑的错误用 `class extends Error`。95% 的场景使用 `Data.TaggedError` 就够了。

#### 错误类型命名规范

推荐的命名规范可以帮助团队形成统一的错误处理风格：

**命名约定：`<业务领域> + <问题描述> + Error`**

```typescript
// ✅ 推荐的命名
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
class InsufficientBalance extends Data.TaggedError("InsufficientBalance")<{ current: number; required: number }> {}
class RateLimitExceeded extends Data.TaggedError("RateLimitExceeded")<{ retryAfterMs: number }> {}
class OrderAlreadyShipped extends Data.TaggedError("OrderAlreadyShipped")<{ orderId: string }> {}

// ❌ 不推荐的命名
class E1 extends Data.TaggedError("E1")<{}> {} // 毫无意义的名字
class SystemError extends Data.TaggedError("SystemError")<{}> {} // 过于宽泛
class CustomError extends Data.TaggedError("CustomError")<{}> {} // 完全没说清楚是什么错误
```

**`_tag` 与类名保持一致**：`_tag` 的值和类名应该完全相同。这不仅减少了理解成本，也方便了工具链的自动处理（如自动生成错误码映射表）。

---

### 示例代码

本节展示一个完整的用户订单查询业务，从**需求分析**到**最终实现**，带你走完 Effect-TS 错误处理的全部流程。

#### 步骤 1：定义领域错误

```typescript
// src/errors/user-errors.ts
import { Data } from "effect"

// 用户查询相关错误
export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
export class UserBanned extends Data.TaggedError("UserBanned")<{
  id: string
  bannedAt: Date
  reason: string
}> {}

// 订单查询相关错误
export class OrderNotFound extends Data.TaggedError("OrderNotFound")<{ orderId: string }> {}
export class OrderAccessDenied extends Data.TaggedError("OrderAccessDenied")<{
  orderId: string
  userId: string
}> {}

// 基础设施层错误
export class DatabaseError extends Data.TaggedError("DatabaseError")<{ operation: string; cause: unknown }> {}
export class NetworkError extends Data.TaggedError("NetworkError")<{ url: string; statusCode: number }> {}
export class RateLimitError extends Data.TaggedError("RateLimitError")<{ retryAfterMs: number }> {}

// 顶层 HTTP 错误（Controller 层使用）
export class HttpError extends Data.TaggedError("HttpError")<{
  statusCode: number
  message: string
  internalError?: unknown
}> {}
```

#### 步骤 2：业务逻辑实现

```typescript
// src/services/user-service.ts
import { Effect } from "effect"
import { UserNotFound, UserBanned, DatabaseError } from "../errors/user-errors"
import type { User } from "../models/user"

/**
 * 根据 ID 查找用户
 * 错误类型：UserNotFound | DatabaseError
 * 注意：数据库查询可能失败（DatabaseError），也可能找不到用户（UserNotFound）
 */
export const findUserById = (id: string): Effect.Effect<User, UserNotFound | DatabaseError, never> =>
  Effect.gen(function* (_) {
    // 模拟：向数据库发起查询
    const result = yield* _(queryDatabase(`SELECT * FROM users WHERE id = ?`, [id]))
    
    if (result === null) {
      // 显式产生 "用户不存在" 错误——这是一个预期的业务错误
      return yield* _(Effect.fail(new UserNotFound({ id })))
    }
    
    return result as User
  })

// src/services/order-service.ts
import { Effect } from "effect"
import { OrderNotFound, OrderAccessDenied, NetworkError } from "../errors/user-errors"
import type { Order } from "../models/order"

/**
 * 查询用户的最近订单
 * 错误类型：OrderNotFound | OrderAccessDenied | NetworkError
 */
export const getRecentOrders = (userId: string): Effect.Effect<Order[], OrderNotFound | OrderAccessDenied | NetworkError, never> =>
  Effect.gen(function* (_) {
    const response = yield* _(Effect.tryPromise({
      try: () => fetch(`/api/orders/recent?userId=${userId}`),
      catch: (unknown) => new NetworkError({
        url: `/api/orders/recent?userId=${userId}`,
        statusCode: unknown instanceof Response ? unknown.status : 0,
      }),
    }))
    
    if (!response.ok) {
      if (response.status === 404) {
        return yield* _(Effect.fail(new OrderNotFound({ orderId: "recent" })))
      }
      if (response.status === 403) {
        return yield* _(Effect.fail(new OrderAccessDenied({ orderId: "recent", userId })))
      }
      return yield* _(Effect.fail(new NetworkError({
        url: `/api/orders/recent?userId=${userId}`,
        statusCode: response.status,
      })))
    }
    
    return (yield* _(Effect.tryPromise({
      try: () => response.json(),
      catch: (unknown) => new NetworkError({
        url: `/api/orders/recent?userId=${userId}`,
        statusCode: response.status,
      }),
    }))) as Order[]
  })
```

#### 步骤 3：编排业务逻辑

```typescript
// src/services/order-query-service.ts
import { Effect } from "effect"
import { findUserById } from "./user-service"
import { getRecentOrders } from "./order-service"
import { UserNotFound, UserBanned, OrderNotFound, OrderAccessDenied, DatabaseError, NetworkError, RateLimitError, HttpError } from "../errors/user-errors"

/**
 * 顶层业务编排：查询用户和订单
 * 
 * 调用方（Controller）看到的是 HttpError，而不是底层的各种具体错误。
 * 我们在边界处通过 mapError 将底层错误转换为 HttpError。
 */
export const getUserWithOrders = (userId: string): Effect.Effect<
  { user: User; orders: Order[] },
  HttpError,
  never
> =>
  // 第一步：并行查询用户信息和订单
  Effect.all({
    user: findUserById(userId),
    orders: getRecentOrders(userId),
  }).pipe(
    // 第二步：在边界处将所有底层错误转换为 HttpError
    Effect.mapError((err) => {
      switch (err._tag) {
        case "UserNotFound":
          return new HttpError({
            statusCode: 404,
            message: `用户 ${userId} 不存在`,
            internalError: err,
          })
        case "UserBanned":
          return new HttpError({
            statusCode: 403,
            message: `用户已被封禁（原因：${err.reason}）`,
            internalError: err,
          })
        case "OrderAccessDenied":
          return new HttpError({
            statusCode: 403,
            message: `无权访问该订单`,
            internalError: err,
          })
        case "OrderNotFound":
          return new HttpError({
            statusCode: 404,
            message: `订单不存在`,
            internalError: err,
          })
        case "DatabaseError":
        case "NetworkError":
        case "RateLimitError":
          return new HttpError({
            statusCode: 502,
            message: `服务暂时不可用，请稍后重试`,
            internalError: err,
          })
        default:
          // 兜底：任何未预期的错误都作为 500
          return new HttpError({
            statusCode: 500,
            message: `服务器内部错误`,
            internalError: err,
          })
      }
    })
  )
```

#### 步骤 4：Controller 层处理

```typescript
// src/controllers/user-controller.ts
import { Effect } from "effect"
import { getUserWithOrders } from "../services/order-query-service"
import type { HttpError } from "../errors/user-errors"

/**
 * HTTP 控制器：处理请求，生成 HTTP 响应
 * 
 * 此时 E 只有 HttpError 一个类型，处理逻辑极其简洁。
 */
export const handleUserRequest = (userId: string): Effect.Effect<Response, never, never> =>
  getUserWithOrders(userId).pipe(
    // 成功时的处理
    Effect.map(({ user, orders }) =>
      new Response(JSON.stringify({ user, orders }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ),
    // 失败时的处理——只有 HttpError，所以只需要一个 catchTag
    Effect.catchTag("HttpError", (err) =>
      Effect.succeed(
        new Response(JSON.stringify({ error: err.message }), {
          status: err.statusCode,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
  )
```

#### 步骤 5：运行与测试

```typescript
// tests/user-controller.test.ts
import { Effect } from "effect"
import { handleUserRequest } from "../src/controllers/user-controller"

// 测试 1：用户不存在的场景
// 预期：返回 404 状态码和错误信息
const testUserNotFound = Effect.gen(function* (_) {
  const response = yield* _(handleUserRequest("non-existent-id"))
  console.assert(response.status === 404, "预期状态码为 404")
  const body = yield* _(Effect.tryPromise(() => response.json()))
  console.assert(body.error === "用户 non-existent-id 不存在", "错误信息应包含用户 ID")
  console.log("✅ 测试通过：用户不存在场景")
})

// 测试 2：正常查询场景
// 预期：返回 200 状态码和用户数据
const testSuccess = Effect.gen(function* (_) {
  const response = yield* _(handleUserRequest("valid-user-id"))
  console.assert(response.status === 200, "预期状态码为 200")
  console.log("✅ 测试通过：正常查询场景")
})

// 运行测试
Effect.runPromise(testUserNotFound).catch(console.error)
Effect.runPromise(testSuccess).catch(console.error)
```

预期输出：

```
✅ 测试通过：用户不存在场景
✅ 测试通过：正常查询场景
```

完整的项目代码可在 `src/` 目录下查看，相关测试文件位于 `tests/` 目录。具体文件路径：

- **错误定义**: `src/errors/user-errors.ts`
- **用户服务**: `src/services/user-service.ts`
- **订单服务**: `src/services/order-service.ts`
- **业务编排**: `src/services/order-query-service.ts`
- **控制器**: `src/controllers/user-controller.ts`
- **测试**: `tests/user-controller.test.ts`

---

### 本章小结

本章系统地介绍了 Effect-TS 的错误处理机制。从最基础的 `Data.TaggedError` 定义领域错误，到 `Effect<A, E, R>` 的三维模型，再到 `catchTag`、`catchAll`、`mapError` 等丰富的处理 API，我们看到了 Effect-TS 如何将错误处理从"运行时盲猜"提升到"编译期保证"的层面。

**核心知识点回顾：**

1. **错误类型是签名的一部分**：`Effect<A, E, R>` 中的 `E` 让调用方在编译期就知道需要处理哪些错误，新增错误类型会触发编译错误，避免遗漏
2. **`Data.TaggedError` 使错误可辨别**：通过 `_tag` 字段，每个错误都成为可辨别联合的一支，`catchTag` 可以精确匹配
3. **类型擦除机制**：每处理一个错误，其类型就从 `E` 中移除，最终 `E` 变为 `never` 表示无错误
4. **分层治理**：在模块边界使用 `mapError` 转换错误类型，避免深层调用链的 `E` 膨胀
5. **先精准、后兜底**：错误处理链中，先用 `catchTag` 处理已知业务错误，再用 `catchAll` 做统一兜底

**最佳实践清单：**

- 使用 `Data.TaggedError` 定义领域错误，确保错误类型在类型系统中可区分
- 错误命名来自业务词汇表，而非技术实现
- 在模块边界（Service → Controller）用 `mapError` 转换错误抽象层级
- 利用 `catchTag` 的类型擦除特性，让处理过的错误不再出现在签名中
- 使用 `mode: "either"` 处理需要"尽力而为"的并行场景
- 提取 `_tag` 常量避免拼写错误

下一章将介绍依赖注入（DI）与 Context，展示 Effect-TS 如何优雅地管理应用的依赖关系。当你掌握了错误处理和依赖管理这两个核心能力后，就能编写出真正健壮的生产级应用了。