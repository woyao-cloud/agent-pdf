# 第五章：资源管理与 Scope

资源管理是应用开发中的核心问题——文件句柄、数据库连接、网络套接字等资源都需要确保在使用后正确释放。传统方式中，`try/catch/finally` 模式容易遗漏错误分支，且当多个资源嵌套时代码变得复杂难懂。

Effect-TS 提供了 `Scope` 机制来解决这个问题。Scope 基于"获取-使用-释放"（acquire-use-release）模式，确保资源无论在执行成功、失败还是中断时都能被正确释放。

---

## 模块一：AcquireRelease 模式

`Effect.acquireRelease` 是资源管理的核心原语。它接收三个参数：

```typescript
Effect.acquireRelease(
  acquire: Effect<Resource, Error, Requirements>,
  release: (resource: Resource, exit: Exit<A, E>) => Effect<void, never, R2>,
)
```

- **acquire**：获取资源的 Effect
- **use**：使用资源的 Effect
- **release**：释放资源的 Effect，无论成功还是失败都会执行

`release` 函数的第二个参数是 `Exit`，它可以告知释放函数资源使用的结果——成功还是失败，方便在释放时作不同的处理。

使用时的简化版本 `acquireUseRelease` 将三个步骤组合在一起：

```typescript
export const readFile = (name: string): Effect.Effect<string, Error> =>
  Effect.acquireUseRelease(
    openFile(name),
    (file) => Effect.sync(() => `Content of ${file.name}`),
    (file, exit) => Effect.sync(() => file.close()),
  )
```

---

## 模块二：Scope — 资源生命周期的作用域

Scope 是 Effect-TS 中管理资源生命周期的核心概念。每个资源都被注册到最近的 Scope 中，当 Scope 结束时，所有注册的资源都会被释放。

`Effect.scoped` 是进入 Scope 的入口：

```typescript
export const scopedResource = (name: string): Effect.Effect<string, Error, Scope.Scope> =>
  Effect.scoped(
    Effect.acquireRelease(
      openFile(name),
      (file) => Effect.sync(() => file.close()),
    ).pipe(
      Effect.flatMap((file) => Effect.sync(() => `Content of ${file.name}`))
    )
  )
```

当 `scopedResource` 执行完成后，Scope 自动结束，`openFile` 返回的资源被释放，`close` 方法被调用。

---

## 模块三：多个资源的自动管理

当在一个 Scope 内管理多个资源时，每个资源都会注册到同一个 Scope。如果任一资源获取失败或使用过程中出现错误，Scope 会自动释放所有已获取的资源：

```typescript
export const processMultipleFiles = Effect.gen(function* (_) {
  const content1 = yield* _(readFile("data1.txt"))
  const content2 = yield* _(readFile("data2.txt"))
  return `${content1}\n${content2}`
})
```

资源释放顺序是获取顺序的逆序（栈顺序），确保依赖关系正确——例如，如果资源 B 依赖于资源 A，A 会在 B 之后释放。

---

## 模块四：Fiber 安全与中断处理

Scope 机制是 Fiber 安全的。当一个 Fiber 被中断时，Scope 会自动执行清理：

```typescript
// 如果超时发生，Fiber 被中断，已打开的资源会被释放
export const readFileWithTimeout = (name: string): Effect.Effect<string, Error> =>
  readFile(name).pipe(Effect.timeout("1 seconds"), Effect.scoped)
```

这解决了传统编程中一个棘手的问题：超时通常是异步的，`finally` 块在同步代码中没问题，但在异步超时场景中，正在执行的异步操作可能无法被取消，资源可能泄漏。Effect-TS 的 Fiber 中断机制会强制中止正在执行的任务，并触发 Scope 的清理流程。

---

## 模块五：连接池实现

Scope 非常适合实现连接池模式。每次从池中获取连接时，连接被注册到当前 Scope，使用完毕后自动释放：

```typescript
class ConnectionPool extends Context.Tag("ConnectionPool")<
  ConnectionPool,
  { acquire: Effect.Effect<Connection, never, Scope.Scope> }
>() {}

const ConnectionPoolLive = Layer.effect(
  ConnectionPool,
  Effect.sync(() => ({
    acquire: Effect.acquireRelease(createConnection, (conn) =>
      Effect.sync(() => conn.close())),
  }))
)

export const executeQuery = (sql: string): Effect.Effect<any, never, ConnectionPool | Scope.Scope> =>
  Effect.gen(function* (_) {
    const pool = yield* _(ConnectionPool)
    const conn = yield* _(pool.acquire)
    return yield* _(conn.query(sql))
  })
```

使用时通过 `Effect.scoped` 包裹：

```typescript
const result = await Effect.runPromise(
  executeQuery("SELECT * FROM users").pipe(
    Effect.provide(ConnectionPoolLive),
    Effect.scoped,
  )
)
```

每个 `scoped` 调用创建新的 Scope，连接在 Scope 结束时关闭。独立查询获得不同的连接，互不干扰。

---

## 模块六：Scope 嵌套与合并

Scope 可以嵌套。子 Scope 结束时释放自己的资源，父 Scope 不受影响。这在 HTTP 请求处理中非常有用——每个请求可以有独立的 Scope，请求结束时释放该请求的资源：

```typescript
Effect.scoped(
  Effect.gen(function* (_) {
    // 外层 Scope
    const conn = yield* _(pool.acquire)

    // 内层 Scope：请求级别
    const result = yield* _(
      Effect.scoped(
        Effect.gen(function* (_) {
          const tx = yield* _(beginTransaction())
          return yield* _(tx.query("..."))
        })
      )
    )

    return result
  })
)
```

当内层 Scope 结束时（事务提交或回滚），事务资源被释放，但外层数据库连接仍然存活。

---

## 模块七：Finalizers

Effect-TS 提供了 `Effect.addFinalizer` 来添加自定义的清理逻辑，类似于传统编程中的 `finally`：

```typescript
Effect.gen(function* (_) {
  yield* _(Effect.addFinalizer(() =>
    Effect.sync(() => console.log("Cleanup performed"))
  ))
  // 主要逻辑
  return yield* _(doWork())
})
```

Finalizer 的特性：
- 无论 Effect 成功、失败还是被中断，都会执行
- 支持多个 Finalizer，执行顺序与添加顺序相反
- Finalizer 本身也是 Effect，可以执行异步操作
- Finalizer 中的错误不会影响主逻辑的 Exit 状态

---

## 模块八：生产实践建议

### 8.1 资源建模

- 每个资源的生命周期应该是清晰的——有明确的获取点和释放点
- 资源的释放应该是幂等的（多次调用无害）
- 避免在资源释放后仍然持有资源的引用

### 8.2 常见的 Scope 边界

| 场景 | Scope 边界 | 说明 |
|------|-----------|------|
| HTTP 请求 | 请求开始到响应结束 | 请求级别的数据库连接 |
| 批处理任务 | 任务开始到任务结束 | 文件句柄、临时目录 |
| 消息消费 | 接收到处理完成 | 消息事务 |
| 定时任务 | 任务执行期间 | 外部 API 连接 |

### 8.3 与 Layer 结合

Scope 和 Layer 可以结合使用。当 Layer 创建的资源需要 Scope 管理时，可以在 Layer 的实现中使用 `Effect.acquireRelease`：

```typescript
const DatabaseLive = Layer.scoped(
  Database,
  Effect.acquireRelease(createConnectionPool, (pool) => pool.close())
)
```

这样，当最外层 Scope 结束时，整个应用的所有数据库连接都会被释放，非常适合优雅关闭的场景。

### 8.4 性能考虑

- Scope 的引入会带来微小的性能开销，但对于绝大多数应用来说可以忽略
- 频繁创建和销毁资源时，考虑使用连接池或资源池模式
- 避免 Scope 层级过深，通常在 3-5 层以内

---

## 总结

Scope 机制是 Effect-TS 资源管理的基石。通过 `acquireRelease` 和 `scoped`，Effect-TS 实现了：
- **自动释放**：资源在使用完毕后自动释放，无需手动 `finally`
- **Fiber 安全**：即使 Fiber 被中断，资源也能被正确清理
- **组合性**：多个资源可以组合在同一 Scope 内，释放顺序保证
- **嵌套支持**：子 Scope 独立管理资源，不影响父级

下一章将介绍结构化并发（Structured Concurrency），展示 Effect-TS 在高并发场景下的控制能力。