# 第三章：错误处理与领域建模

在 TypeScript 应用中，错误处理一直是痛点。传统 `try/catch` 无法表达错误的类型，异常会沿着调用栈向上传播，中间层难以精准处理特定错误。Effect-TS 提供了一套完整的错误处理体系，将错误作为类型信息纳入 Effect 签名，让错误的类型、传播和处理在编译期就得到保证。

本章将通过一个用户查询的场景，系统介绍 Effect-TS 的错误处理机制。

---

## 模块一：TaggedError — 领域错误的精确表达

Effect-TS 使用 `Data.TaggedError` 来定义领域错误。每个错误都有一个 `_tag` 字段用于运行时区分，同时携带结构化数据。

```typescript
import { Data } from "effect"

export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}
export class NetworkTimeout extends Data.TaggedError("NetworkTimeout")<{ url: string; elapsedMs: number }> {}
```

`TaggedError` 的优势：
- **类型安全**：每个错误在 TypeScript 类型系统中都可区分
- **结构化数据**：不再需要 `message` 字符串传参，直接携带业务字段
- **模式匹配友好**：`_tag` 字段让 `switch` 或 `catchTag` 可以精准定位

---

## 模块二：Effect 函数签名中的错误类型

在 Effect-TS 中，函数的返回类型明确声明了可能产生的错误：

```typescript
type Effect<Success, Error, Requirements>
```

第三章节中我们关注前两个参数。例如：

```typescript
export const findUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
```

这表示 `findUser` 成功时返回 `User`，可能失败于 `UserNotFound` 或 `DatabaseError`。这样的签名让调用者在编译期就知道需要处理哪些错误。

对比传统方式：
```typescript
// 传统：无法知道可能抛出什么
async function findUser(id: string): Promise<User> {
  // 可能抛 UserNotFoundError 也可能抛 DatabaseError
}
```

---

## 模块三：Effect.gen — 生成器风格的错误传播

`Effect.gen` 提供类似 `async/await` 的语法，但错误传播是显式的：

```typescript
export const findUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
  Effect.gen(function* (_) {
    if (!db[id]) {
      return yield* _(Effect.fail(new UserNotFound({ id })))
    }
    return db[id]
  })
```

关键点：
- 使用 `yield* _(effect)` 来解包 Effect
- `Effect.fail(error)` 产生一个失败效果
- 错误的类型自动融入外层 Effect 的签名
- 与传统 `throw` 不同，`Effect.fail` 不会意外跳过资源清理

---

## 模块四：catchTag — 精准捕获特定错误

`catchTag` 允许按 `_tag` 字段精准捕获特定错误类型，其余错误继续向上传播：

```typescript
export const getUserSafe = (id: string): Effect.Effect<User | null, DatabaseError> =>
  Effect.gen(function* (_) {
    const user = yield* _(findUser(id))
    return user
  }).pipe(
    Effect.catchTag("UserNotFound", () => Effect.succeed(null))
  )
```

注意观察签名变化：`UserNotFound` 从错误类型中被移除了，调用者只需要处理 `DatabaseError`。这是 Effect-TS 错误处理的核心优势——错误类型会在处理后被擦除。

`catchTag` 还支持同时处理多个标签：
```typescript
findUser(id).pipe(
  Effect.catchTag("UserNotFound", ...),
  Effect.catchTag("DatabaseError", ...),
)
```

---

## 模块五：catchAll — 兜底处理

当需要对所有错误做统一处理时使用 `catchAll`：

```typescript
export const getUserOrThrow = (id: string): Effect.Effect<User, never> =>
  findUser(id).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`Unexpected error: ${error._tag}`)
        throw error
      })
    )
  )
```

`catchAll` 接收一个函数处理所有错误类型。注意返回值：错误类型被擦除为 `never`，表示这个 Effect 不会再产生错误。

其他类似 API：
- `catchSome`：按谓词选择性捕获
- `catchIf`：按条件捕获
- `orElse`：失败时切换到备选 Effect
- `firstSuccessOf`：尝试多个 Effect，返回第一个成功的

---

## 模块六：重试与超时

Effect-TS 内置了灵活的重试机制：

```typescript
export const fetchWithRetry = (id: string): Effect.Effect<User | null, never> =>
  getUserSafe(id).pipe(
    Effect.retry({ times: 3, delay: (n) => Effect.succeed(100 * n) })
  )
```

重试策略：
- `times`：最大重试次数
- `delay`：延迟策略，支持固定延迟、指数退避等
- `while`：条件重试，只有满足条件时才重试

超时控制：
```typescript
Effect.timeout("5 seconds")
```

超时后 Effect 会返回 `Option<A>`，成功为 `Some(value)`，超时为 `None`。这避免了传统超时实现中的"超时了但任务还在跑"的问题——Effect-TS 会 Fiber 中断超时任务。

---

## 模块七：错误转换与 Map

`mapError` 允许在错误传播过程中转换错误类型：

```typescript
findUser(id).pipe(
  Effect.mapError((err) =>
    err._tag === "UserNotFound"
      ? new DatabaseError({ cause: err })
      : err
  )
)
```

这在适配层非常有用：当你调用第三方库或遗留系统时，可以将其错误统一转换为领域错误。

`mapBoth` 同时处理成功和错误分支：
```typescript
effect.pipe(
  Effect.mapBoth({
    onSuccess: (value) => transform(value),
    onFailure: (err) => new DatabaseError({ cause: err }),
  })
)
```

---

## 模块八：生产实践建议

### 8.1 错误类型设计原则

1. **领域驱动**：错误类型反映业务语义，而非技术细节。`UserNotFound` 优于 `NotFoundError("user")`
2. **携带上下文**：错误中保留必要的业务 ID、时间等字段，便于排查
3. **层级清晰**：按模块或层面组织错误，避免出现跨层耦合

### 8.2 边界处理

- 系统边界处（HTTP 响应、消息队列等）必须处理所有错误
- 内部调用可以允许错误传播，在边界处集中处理
- 使用 `Effect.catchAllDefect` 捕获非预期的缺陷（defect）

### 8.3 与第三方库集成

- 使用 `Effect.tryPromise` 包装 Promise 为 Effect
- 使用 `Effect.try` 包装同步代码
- 在包装层将第三方错误映射为领域错误

```typescript
// 包装第三方 SDK
Effect.tryPromise({
  try: () => sdk.fetchUser(id),
  catch: (unknown) => new NetworkTimeout({ url: `/users/${id}`, elapsedMs: 0 }),
})
```

### 8.4 测试策略

- 为每个错误路径编写测试
- 使用 `Effect.runPromise` 验证异步 Effect
- 使用 `Effect.runSync` 验证同步 Effect

---

## 总结

Effect-TS 的错误处理不是对 `try/catch` 的简单替代，而是一套将错误纳入类型系统的完整方案。通过 `TaggedError` 定义领域错误，通过 Effect 签名显式传递错误类型，通过 `catchTag`、`catchAll` 等 API 组合处理策略，我们可以编写出更健壮、更可维护的应用代码。

下一章将介绍依赖注入（DI）与 Context，展示 Effect-TS 如何优雅地管理应用的依赖关系。