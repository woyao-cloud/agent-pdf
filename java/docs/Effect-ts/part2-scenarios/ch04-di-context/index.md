# 第四章：依赖注入与 Context

依赖注入（DI）是企业级应用的核心模式。传统的 TypeScript 应用中，DI 通常通过装饰器（如 Angular）或手动传递参数来实现。Effect-TS 提供了一套独特的 DI 机制——Context，它基于 `Tag` 和 `Layer`，在类型安全的前提下实现模块化的依赖管理。

---

## 模块一：Context 与 Tag 基础

Effect-TS 的 Context 是一个类型安全的键值容器。`Context.Tag` 是用来标识依赖的"键"，每个 Tag 都关联着一个服务和它的类型签名。

```typescript
import { Context, Layer, Effect } from "effect"

class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<any> }
>() {}

class Logger extends Context.Tag("Logger")<
  Logger,
  { info: (msg: string) => Effect.Effect<void> }
>() {}
```

`Context.Tag` 的双重参数：
- 第一个参数（字符串）：用于运行时标识，类似 `_tag`
- 第二个参数（类型）：服务的接口类型

Tag 本身的类型用作服务的唯一标识符，因此 Effect-TS 使用类而非字符串来定义 Tag，确保编译期类型安全。

---

## 模块二：Layer — 依赖的构建单元

`Layer` 是 Effect-TS 中组装和组合依赖的基本单元。每个 Layer 负责创建和提供一组服务。

```typescript
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.sync(() => ({ rows: [], sql })),
})

const LoggerLive = Layer.succeed(Logger, {
  info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
})
```

`Layer.succeed` 用于创建一个同步完成的 Layer。当服务的创建涉及异步操作或其他依赖时，可以使用 `Layer.effect`：

```typescript
const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* (_) {
    const config = yield* _(Config)
    const connection = yield* _(connectToDatabase(config))
    return {
      query: (sql: string) => connection.query(sql),
    }
  })
)
```

Layer 的类型签名：`Layer<Requirements, Error, Output>`，其中 Requirements 是创建本 Layer 所需的依赖，Error 是可能的错误，Output 是提供的服务。

---

## 模块三：Layer 组合

多个 Layer 可以通过组合构建依赖图：

```typescript
// 合并两个独立的 Layer
const AppLayer = Layer.merge(DatabaseLive, LoggerLive)
```

Layer 组合的方式：
- `Layer.merge(a, b)`：合并两个无依赖关系的 Layer
- `Layer.provide(a, b)`：用 b 提供的依赖来满足 a 的需求
- `Layer.provideMerge(a, b)`：提供依赖后合并

组合后的 Layer 可以作为一个整体提供给 Effect，Effect-TS 会自动解析依赖图。

---

## 模块四：在 Effect 中使用依赖

依赖在 Effect 中通过 `yield*` 获取：

```typescript
const program = Effect.gen(function* (_) {
  const db = yield* _(Database)
  const logger = yield* _(Logger)
  yield* _(logger.info("querying users"))
  return yield* _(db.query("SELECT * FROM users"))
})
```

Effect 的第三个类型参数（Requirements）会跟踪未满足的依赖。在上面的例子中，`program` 的签名会是：

```typescript
type program: Effect<{ rows: any[]; sql: string }, never, Database | Logger>
```

这意味着运行 `program` 前必须提供 `Database` 和 `Logger` 依赖。

---

## 模块五：提供依赖并运行

通过 `Effect.provide` 将 Layer 注入 Effect：

```typescript
const runnable = program.pipe(Effect.provide(AppLayer))
```

此时 Effect 的三个类型参数变为：
- Requirements: `never`（依赖已全部满足）
- 可以直接使用 `Effect.runPromise(runnable)` 执行

`provide` 的工作原理是在运行时构建一个 Context，所有依赖通过 Tag 注册到 Context 中，Effect 执行时通过 `yield* _(Tag)` 从 Context 中查找对应的服务实现。

---

## 模块六：测试中的依赖替换

Layer 机制的最大优势之一是测试友好。我们可以在测试中替换任意依赖：

```typescript
it("should work with mocked Database", async () => {
  const MockDatabase = Layer.succeed(Database, {
    query: (sql: string) => Effect.succeed({ rows: [{ id: "mock" }], sql }),
  })

  const MockLogger = Layer.succeed(Logger, {
    info: () => Effect.void,
  })

  const testLayer = Layer.merge(MockDatabase, MockLogger)
  const testProgram = program.pipe(Effect.provide(testLayer))
  const result = await Effect.runPromise(testProgram)
  expect(result.rows[0].id).toBe("mock")
})
```

可以按需替换部分依赖，其余依赖使用生产实现。这种"部分 Mock"的能力让测试更加精确：

```typescript
// 只 Mock Logger，Database 用默认实现
const testLayer = Layer.merge(Database.Default, MockLogger)
```

---

## 模块七：层级化依赖管理

对于复杂应用，依赖可以按层级组织：

```
Infrastructure Layer (Database, Redis, Message Queue)
    -> Repository Layer (UserRepository, OrderRepository)
        -> Service Layer (UserService, OrderService)
            -> Presentation Layer (HTTP Handler, Event Handler)
```

每层在其依赖之上构建，Layer 的 `provide` 机制保证了依赖图的正确解析：

```typescript
const UserRepoLayer = Layer.effect(UserRepository, ...)
const UserServiceLayer = Layer.effect(UserService, ...)

// 自底向上组合
const AppLayer = UserServiceLayer.pipe(
  Layer.provide(UserRepoLayer)
)
```

如果依赖图中有循环依赖，Effect-TS 会在编译期或运行时报错。

---

## 模块八：生产实践建议

### 8.1 接口设计原则

- 每个服务接口功能单一，职责明确
- 方法返回 Effect，保持一致性
- 使用具体类型而非 `any`

### 8.2 Layer 作用域

- 全局共享的服务（如数据库连接池）使用全局 Layer
- 请求级别的服务（如请求上下文）使用 Scope 管理
- 避免在 Layer 中持有可变状态

### 8.3 启动顺序管理

Layer 之间的依赖关系自动决定了初始化顺序。Effect-TS 确保：
1. 被依赖的 Layer 先初始化
2. 并行初始化无依赖关系的 Layer
3. 初始化错误会被精确传播

### 8.4 与现有框架集成

- Express/Koa：在请求入口处 provide 依赖
- NestJS：可以使用 Effect-TS 替代内置 DI
- React：结合 `useEffect` 管理依赖生命周期

---

## 总结

Effect-TS 的 DI 系统通过 `Context.Tag`、`Layer` 和 `Effect.provide` 提供了一套类型安全的依赖管理方案。与传统的装饰器或手动 DI 相比，它有以下优势：
- **类型安全**：依赖的缺失在编译期即可发现
- **可组合**：Layer 可以像乐高一样组合
- **可测试**：任意依赖可以在测试中被替换
- **生命周期管理**：Scope 机制自动管理资源的创建和释放

下一章将深入 Scope 机制，探讨资源管理与生命周期控制。