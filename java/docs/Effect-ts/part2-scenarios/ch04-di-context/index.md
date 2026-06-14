# 第四章：依赖注入与 Context 管理

假设你的应用需要数据库连接、日志记录器、配置管理和邮件服务——经典的四个外部依赖。在传统方式中，你有两个选择：全局变量或手动传参。全局变量让测试寸步难行（每个测试都要清理全局状态），手动传参则让函数签名膨胀到不可维护（`createUser(db, logger, config, emailer, ...)`）。更糟糕的是，TypeScript 编译器不会帮你检查某个依赖是否被遗漏——你只能在运行时看到 "undefined is not a function"。

Effect-TS 的依赖注入系统——`Context`、`Tag` 和 `Layer`——从根本上解决了这些问题。它让依赖关系成为类型系统的一部分，在编译期就能保证所有依赖都已满足，同时在运行时提供灵活的替换和组合能力。本章将带你从最朴素的手动 DI 开始，逐步演进到 Effect-TS 的完整 DI 方案。

---

## 使用场景

### 1. 微服务与多外部依赖

在微服务架构中，一个服务模块往往需要多个外部资源：数据库连接池、Redis 缓存、消息队列、远程 gRPC 客户端、配置中心和日志系统。手动管理这些依赖的创建、传递和生命周期维护极易出错。Effect-TS 的 Layer 机制允许你清晰地声明"我需要什么"，由框架自动完成依赖图的解析和初始化。

```typescript
// 声明依赖关系：UserService 需要 Database 和 Logger
const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const logger = yield* _(Logger)
    return {
      createUser: (data) =>
        Effect.gen(function* (_) {
          yield* _(logger.info("Creating user..."))
          return yield* _(db.query(`INSERT ...`))
        }),
    }
  })
)
```

当 Application Layer 组合起来时，Effect-TS 会自动确定 `Database` 和 `Logger` 需要在 `UserService` 之前初始化。

### 2. 测试环境依赖替换

这是 DI 最核心的价值。在单元测试中，你不希望真的连接数据库或发送邮件。Effect-TS 的 Layer 机制让你可以在测试中无缝替换任意依赖：

```typescript
// 测试中：用内存实现替换真实数据库
const TestDbLive = Layer.succeed(Database, {
  query: () => Effect.succeed({ rows: [{ id: "1", name: "Test" }] }),
})
const TestLoggerLive = Layer.succeed(Logger, {
  info: () => Effect.void,
})

const testLayer = Layer.merge(TestDbLive, TestLoggerLive)
const result = await program.pipe(Effect.provide(testLayer), Effect.runPromise)
```

### 3. 环境配置差异化

同一条业务逻辑，在不同环境（开发、测试、预发布、生产）下需要绑定不同的配置。通过 Layer，你可以在启动时注入对应环境的实现，而业务代码完全不需要感知：

```typescript
// 开发环境
const DevConfig = Layer.succeed(Config, devConfig)
// 生产环境
const ProdConfig = Layer.effect(Config, fetchFromK8sConfigMap)

// 启动脚本根据环境变量选择
const configLayer = process.env.NODE_ENV === "production"
  ? ProdConfig
  : DevConfig
const app = appProgram.pipe(Effect.provide(Layer.merge(configLayer, ...)))
```

### 4. AOP 横切关注点

日志记录、性能监控、链路追踪这些横切关注点非常适合通过 DI 实现。你可以在 Layer 层面对某个服务进行包装，而不修改业务代码：

```typescript
const TracedUserService = Layer.effect(
  UserService,
  Effect.gen(function* (_) {
    const inner = yield* _(UserService)
    const tracer = yield* _(Tracer)
    return {
      createUser: (data) =>
        tracer.withSpan("UserService.createUser")(inner.createUser(data)),
      findById: (id) =>
        tracer.withSpan("UserService.findById")(inner.findById(id)),
    }
  })
)
```

---

## 实现原理

### Context：Fiber-local 的依赖容器

`Context` 本质上是一个类型安全的 `Map<Tag, Implementation>`。它被设计为与 Effect 的 Fiber 绑定——每个 Fiber 拥有自己的 Context 实例，这意味着依赖的作用域天然是 fiber-local 的，不会污染全局。当通过 `Effect.provide` 注入 Layer 时，Effect-TS 在运行时构建出 Context 实例，并将其附着在 Effect 的执行链路上。

```typescript
// 伪代码示意：Context 的内部结构
class ContextImpl<Services> {
  private map: Map<Context.Tag<any>, any>

  get<T>(tag: Context.Tag<T>): T {
    const service = this.map.get(tag)
    if (service === undefined) {
      throw new MissingServiceError(tag)
    }
    return service as T
  }

  add<T>(tag: Context.Tag<T>, service: T): ContextImpl<Services | T> {
    const newMap = new Map(this.map)
    newMap.set(tag, service)
    return new ContextImpl(newMap)
  }
}
```

### Tag：类型安全的键

`Tag` 的表面形式是一个创建语句：`Context.Tag("Database")<Database, ServiceType>()`。其精妙之处在于它同时承担了两个角色：

1. **运行时的标识**——字符串 `"Database"` 用于调试和序列化，类似 Effect 的 `_tag` 字段
2. **编译期的类型链接**——Tag 本身的 TypeScript 类型绑定了 `ServiceType`，当你 `yield* _(Database)` 时，TypeScript 能够精确推导出返回值的类型

之所以使用 `class` 而非普通的 `symbol` 或 `string` 来定义 Tag，是因为 TypeScript 的类同时提供了"值空间"和"类型空间"——在运行时它可以作为 Map 的键，在编译期它携带了完整的类型签名。

### Layer：依赖图的声明与解析

`Layer` 的类型签名 `Layer<Requirements, Error, Output>` 精确描述了三个维度的信息：

| 类型参数 | 含义 | 示例 |
|---------|------|------|
| `Requirements` | 本 Layer 创建时需要的其他依赖 | `Database \| Logger` |
| `Error` | 创建过程中可能发生的错误 | `ConfigError` |
| `Output` | 本 Layer 提供的服务 | `UserService` |

当你使用 `Layer.merge(a, b)` 或 `Layer.provideMerge(a, b)` 组合多个 Layer 时，Effect-TS 会在内部构建一个有向无环图（DAG），然后按照拓扑排序的顺序依次初始化每个 Layer：

```
初始化顺序（拓扑排序）：
  Config (无依赖) ──┐
  Database (无依赖) ─┤
  Logger (无依赖) ───┼──> UserRepository (依赖 Database, Logger) ──> UserService (依赖 UserRepository)
                     │
  Emailer (无依赖) ──┘
```

无依赖的 Layer（Config、Database、Logger、Emailer）可以并行初始化，依赖它们的 Layer 则等待前置条件满足后再执行。这种自动化的依赖解析大幅度减少了手动编排初始化顺序的工作量。

---

## 潜在风险

### 1. Context 缺失（Requirement Not Met）

这是最常遇到的运行时错误：在 Effect 执行时，某个 Tag 对应的服务没有被注入 Context。Effect-TS 的类型系统会在编译期跟踪 `Requirements` 类型参数——如果一个 Effect 的 `Requirements` 不是 `never`，意味着它有未满足的依赖。但如果你通过 `Effect.runPromise` 强制运行一个未 provide 完全的 Effect，运行时会抛出缺失服务的异常。

```
错误现象：Fiber #0 因 MissingRequiredServiceException 失败
原因：Attempted to get service "Database" from Context, but it was not provided.
```

**预防措施**：确保在调用 `Effect.runPromise` / `runSync` 之前，Effect 的类型参数 `R`（Requirements）已经被消解为 `never`。在代码审查中，重点关注 `provide` 链是否完整。

### 2. Layer 循环依赖

如果 Layer A 需要 Layer B，而 Layer B 又直接或间接需要 Layer A，就形成了循环依赖。Effect-TS 在构建依赖图时可以检测到这种情况并抛出异常：

```typescript
// ❌ 错误：循环依赖
// ServiceA -> ServiceB -> ServiceA
const ServiceALive = Layer.effect(ServiceA, Effect.gen(function* (_) {
  const b = yield* _(ServiceB) // ServiceA 依赖 ServiceB
  return { ... }
}))

const ServiceBLive = Layer.effect(ServiceB, Effect.gen(function* (_) {
  const a = yield* _(ServiceA) // ServiceB 又依赖回 ServiceA ❌
  return { ... }
}))
```

**解决方案**：通过引入第三个 Layer（如一个共享的 `Config` 或 `EventBus`）来打破循环，或者将其中一个依赖提取为惰性引用（例如通过函数闭包延迟获取）。

### 3. Layer 重复创建

在复杂应用中，同一个 Layer 可能被不小心创建多次。如果该 Layer 管理的是有状态资源（如数据库连接池），会导致资源泄漏。

```typescript
// ❌ 问题：DatabaseLive 被创建了两次，产生两个连接池
const appLayer = Layer.merge(
  Layer.provideMerge(UserServiceLive, DatabaseLive), // 这里提供一次
  Layer.provideMerge(OrderServiceLive, DatabaseLive), // 这里又提供一次
)
```

解决方案：将共享的 Layer 实例提取为单例变量，通过 `Layer.merge` 在最顶层统一组合，确保每个 Layer 只被构造一次。

---

## 优化策略

### Layer 生命周期管理

所有 Layer 默认是"全局单例"——一旦创建就持续存在。对于有状态资源（数据库连接、HTTP 客户端），这是合理的。但有时你需要**请求级别**的依赖：

```typescript
// 请求级别的 Context：每个 HTTP 请求一个实例
const RequestScopedLive = Layer.scoped(
  RequestContext,
  Effect.gen(function* (_) {
    const reqId = yield* _(generateRequestId)
    return new RequestContext(reqId)
  })
)

// 在 Express middleware 中为每个请求创建 Scope
app.use((req, res, next) => {
  const program = handleRequest(req).pipe(
    Effect.provide(BaseLayer),
    Effect.provide(RequestScopedLive),
    Effect.scoped, // 请求结束后自动释放资源
  )
  Effect.runPromise(program).then(next).catch(next)
})
```

通过 `Layer.scoped` 创建的资源，在执行完 `Effect.scoped` 后会自动清理（如关闭数据库连接、释放文件句柄）。

### Layer 拆分与合并

单一的巨大 Layer 违背了关注点分离原则。推荐的做法是按业务模块拆分：

```typescript
// ✅ 推荐：按模块拆分
const InfraLayer = Layer.mergeAll(
  DatabaseLive,
  RedisLive,
  MessageQueueLive,
)

const RepoLayer = Layer.mergeAll(
  UserRepoLive,
  OrderRepoLive,
).pipe(Layer.provide(InfraLayer))

const ServiceLayer = Layer.mergeAll(
  UserServiceLive,
  OrderServiceLive,
).pipe(Layer.provide(RepoLayer))

// 最终应用只需要提供 ServiceLayer
const AppLayer = ServiceLayer
```

这种分层结构的好处是：
- 每一层只关注自己需要的依赖
- 测试时可以只提供某一层及其下层依赖
- 依赖关系清晰，方便代码审查

### 部分 Mock 测试

在集成测试中，你通常只需要替换某一两个依赖（如数据库），其他依赖保持生产实现。Effect-TS 的 `Layer.merge` 可以灵活组合 Mock 和真实 Layer：

```typescript
// 只 Mock Database，Logger 和 Config 用真实实现
const testLayer = Layer.merge(
  DatabaseTest,       // Mock
  LoggerLive,         // 真实 Logger（但可以注入到测试日志）
  ConfigLive,         // 真实 Config（使用测试环境配置）
)

const result = await program.pipe(
  Effect.provide(testLayer),
  Effect.runPromise
)
```

---

## 典型问题处理

### Q1: 如何在大型应用中组织 Layer 文件？

推荐按领域模块组织：

```
src/
  infra/
    database.ts     // Database Tag + DatabaseLive
    logger.ts       // Logger Tag + LoggerLive
    config.ts       // Config Tag + ConfigLive
  repos/
    user-repo.ts    // UserRepository Tag + UserRepositoryLive
    order-repo.ts   // OrderRepository Tag + OrderRepositoryLive
  services/
    user-svc.ts     // UserService Tag + UserServiceLive
    order-svc.ts    // OrderService Tag + OrderServiceLive
  app/
    app-layer.ts    // 组合所有 Layer
    main.ts         // 入口
```

`app-layer.ts` 是整个应用的依赖组合入口，是唯一需要了解全局结构的地方。

### Q2: Layer 初始化是惰性的还是即时的？

Layer 默认是**惰性**的——在调用 `Effect.provide` 时，Layer 不会被立即执行，而是注册到依赖图中。只有当 Effect 真正被 Fiber 执行时，Layer 才会按需初始化。这意味着：

- 你可以提前组装大的 Layer 树，而不会因为 `Config` 读取失败导致启动崩溃
- 同一 Effect 被多次运行，每次都会重新执行 Layer 的初始化逻辑
- 结合 `Layer.scoped` 可以实现每次请求都重新创建的资源

### Q3: 如何处理可选的依赖？

有时一个服务可能有默认行为，不需要强制注入所有依赖。你可以通过 `Effect.serviceOption` 来获取可选服务：

```typescript
class Analytics extends Context.Tag("Analytics")<
  Analytics,
  { track: (event: string) => Effect.Effect<void> }
>() {}

const program = Effect.gen(function* (_) {
  // 尝试获取 Analytics，如果不存在则跳过
  const analytics = yield* _(Effect.serviceOption(Analytics))
  if (analytics._tag === "Some") {
    yield* _(analytics.value.track("page_view"))
  }
  // 正常业务逻辑...
})

// 不提供 Analytics 也能正常运行
const result = await program.pipe(
  Effect.provide(BasicLayer),
  Effect.runPromise
)
```

### Q4: Layer 之间有副作用依赖怎么办？

某些场景下 Layer 的初始化顺序有隐式依赖（如必须先在 Config 中注册数据源，Database Layer 才能拿到连接字符串）。这类"副作用时序依赖"不应通过 DI 表达，而应该通过显式的初始化流程控制：

```typescript
// ✅ 正确：通过 Effect 流程控制初始化顺序
const initializeApp = Effect.gen(function* (_) {
  const config = yield* _(Config)
  yield* _(config.registerDataSources()) // 先注册
  const db = yield* _(Database)          // 后使用
  // ...
})
```

---

## 开发者技能

### 技能一：设计类型安全的服务接口

好的服务接口是 DI 系统的基石。几个核心原则：

- **方法返回 Effect**：保持一致性，让调用方可以用统一的方式组合
- **避免 `any`**：使用精确的输入输出类型，让 TypeScript 帮你检查
- **单一职责**：一个 Tag 对应一个聚焦的服务接口，不要创建"万能 Service"

```typescript
// ❌ 反例：模糊的类型定义
class BadService extends Context.Tag("BadService")<
  BadService,
  { doStuff: (input: any) => Effect.Effect<any> }
>() {}

// ✅ 正例：精确的类型定义
class UserService extends Context.Tag("UserService")<
  UserService,
  {
    findById: (id: string) => Effect.Effect<User | NotFoundError>
    listActive: (page: number, size: number) => Effect.Effect<PaginatedResult<User>>
  }
>() {}
```

### 技能二：善用 Layer 的组合器

Effect-TS 提供了多个 Layer 组合器，熟悉它们能大大提高开发效率：

| 组合器 | 作用 | 适用场景 |
|--------|------|---------|
| `Layer.merge(a, b)` | 合并两个平行 Layer | 两个无依赖关系的层 |
| `Layer.mergeAll(a, b, c, ...)` | 合并多个平行 Layer | 批量组合基础设施层 |
| `Layer.provide(a, b)` | 用 b 的输出来满足 a 的需求 | 分层提供依赖 |
| `Layer.provideMerge(a, b)` | 提供依赖后合并为一个新 Layer | 一层层构建依赖链 |
| `Layer.discard(a)` | 只使用 a 的副作用，丢弃其输出 | 只需要初始化，不需要服务 |

### 技能三：使用 Layer 做资源管理

结合 `Layer.scoped` 和 `Scope`，Layer 不仅可以管理依赖，还可以管理资源的生命周期：

```typescript
const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,
  Effect.gen(function* (_) {
    const config = yield* _(DbConfig)
    const pool = yield* _(acquireConnectionPool(config))
    // Scope 退出时自动释放
    yield* _(Effect.addFinalizer(() => pool.close()))
    return pool
  })
)
```

---

## 示例代码

下面是一个完整的用户管理模块，展示了从 Tag 定义到 Layer 组装再到运行的全流程。完整源码可参考项目中的 `src/di.ts` 和 `src/user-service.ts`。

### 第一步：定义 Tag 和接口

```typescript
// src/di.ts
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

### 第二步：实现 Live Layer

```typescript
// src/di.ts (续)
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.sync(() => {
    console.log(`Executing: ${sql}`)
    return { rows: [], sql }
  }),
})

const LoggerLive = Layer.succeed(Logger, {
  info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
})

// 合并两个无依赖的 Layer
const AppLayer = Layer.merge(DatabaseLive, LoggerLive)
```

### 第三步：编写业务逻辑

```typescript
// src/di.ts (续)
const program = Effect.gen(function* (_) {
  const db = yield* _(Database)
  const logger = yield* _(Logger)
  yield* _(logger.info("querying users"))
  return yield* _(db.query("SELECT * FROM users"))
})
```

此时 `program` 的类型签名会自动推导为：
```typescript
// Effect<{ rows: any[]; sql: string }, never, Database | Logger>
//                                    ^^^^^^^^^^^^^^^^^ 未满足的依赖
```

### 第四步：提供依赖并运行

```typescript
// 提供所有依赖，Requirements 变为 never
const runnable = program.pipe(Effect.provide(AppLayer))

// 运行结果
const result = await Effect.runPromise(runnable)
// 控制台输出:
// [INFO] querying users
// Executing: SELECT * FROM users
// result: { rows: [], sql: "SELECT * FROM users" }
```

### 第五步：依赖分层——UserRepository 示例

参照 `src/user-service.ts`，演示带有依赖的 Layer 如何定义：

```typescript
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    findById: (id: string) => Effect.Effect<User | null>
    create: (user: User) => Effect.Effect<User>
  }
>() {}

// UserRepository 依赖 Database 和 Logger
const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const logger = yield* _(Logger)
    return {
      findById: (id: string) =>
        Effect.gen(function* (_) {
          yield* _(logger.info(`Finding user: ${id}`))
          const result = yield* _(db.query(
            `SELECT * FROM users WHERE id = ${id}`
          ))
          return result.rows.length > 0 ? result.rows[0] : null
        }),
      create: (user: User) =>
        Effect.gen(function* (_) {
          yield* _(logger.info(`Creating user: ${user.name}`))
          yield* _(db.query(
            `INSERT INTO users VALUES (${user.id}, ${user.name}, ${user.email})`
          ))
          return user
        }),
    }
  })
)
```

### 第六步：编写测试（Mock 依赖）

参照 `tests/di.test.ts`，演示如何在测试中完全替换依赖或部分 Mock：

```typescript
import { Database, Logger, program } from "../src/di"
import { Layer, Effect } from "effect"

describe("Dependency Injection", () => {

  // 完全 Mock——所有依赖替换为测试实现
  it("should work with mocked Database", async () => {
    const MockDatabase = Layer.succeed(Database, {
      query: (sql: string) =>
        Effect.succeed({ rows: [{ id: "mock" }], sql }),
    })

    const MockLogger = Layer.succeed(Logger, {
      info: () => Effect.void,
    })

    const testLayer = Layer.merge(MockDatabase, MockLogger)
    const testProgram = program.pipe(Effect.provide(testLayer))
    const result = await Effect.runPromise(testProgram)

    // 运行结果:
    // result.rows[0].id === "mock" ✓
    // 控制台没有 "Executing:" 输出，因为 Mock 没有 console.log
    expect(result.rows[0].id).toBe("mock")
  })

  // 部分 Mock——只替换 Logger，Database 使用默认实现在测试中通常意味着替换为另一个轻量实现
  it("should allow partial mocking", async () => {
    const MockLogger = Layer.succeed(Logger, {
      info: () => Effect.void,
    })

    const testLayer = Layer.merge(DatabaseLive, MockLogger)
    const testProgram = program.pipe(Effect.provide(testLayer))
    const result = await Effect.runPromise(testProgram)

    // 运行结果:
    // 控制台没有 [INFO] 输出（Logger 被 Mock 了）
    // 但 Database 是真实实现，会执行 query
    expect(result).toBeDefined()
  })
})
```

### 反例警示：全局变量的陷阱

```typescript
// ❌ 错误示范：全局变量方式
const globalDb = { query: (sql: string) => Promise.resolve({ rows: [] }) }
const globalLogger = { info: (msg: string) => console.log(msg) }

async function createUserBad(userData: any) {
  // 隐式依赖全局变量——很难测试
  await globalLogger.info("Creating user...")
  return globalDb.query(`INSERT ...`)
}

// 测试时需要手动替换全局变量——容易导致测试间污染
beforeEach(() => {
  (globalThis as any).globalDb = mockDb
  (globalThis as any).globalLogger = mockLogger
})
// 如果某个测试忘记清理，后续测试全部失败
```

```typescript
// ✅ 正确示范：Effect-TS 方式
const testDb = Layer.succeed(Database, {
  query: () => Effect.succeed({ rows: [{ id: "test" }] }),
})

const testLogger = Layer.succeed(Logger, {
  info: () => Effect.void,
})

it("should create user with context", async () => {
  const result = await createUserProgram.pipe(
    Effect.provide(Layer.merge(testDb, testLogger)),
    Effect.runPromise,
  )
  // 依赖完全隔离，不会影响其他测试
  expect(result.rows[0].id).toBe("test")
})
```

全局变量方式有几个致命的缺陷：
- **测试间状态污染**：一个测试修改全局变量会影响后续测试
- **隐式依赖**：函数签名看不出它依赖了什么
- **类型不安全**：`globalDb` 的类型可以在任何地方被覆盖
- **并发不安全**：在并发场景下，全局变量无法区分不同请求的上下文

### 方案对比总结

| 方式 | 可测试性 | 类型安全 | 生命周期管理 | 并发安全 | 编译期检查 |
|------|---------|---------|------------|---------|-----------|
| 全局变量 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 手动传参 | ✅ 部分 | ✅ | ❌ | ✅ | ✅ 部分 |
| Effect Context | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 本章小结

Effect-TS 的依赖注入系统——通过 `Context.Tag`、`Layer` 和 `Effect.provide` 的组合——提供了一套在类型安全和运行时灵活性之间达到优雅平衡的方案。它的核心价值在于：

- **类型安全是第一公民**：依赖的缺失不再是运行时才发现的惊喜。Effect 的第三个类型参数 `R` 精确追踪了未满足的依赖，TypeScript 编译器会阻止你运行一个依赖不全的 Effect。
- **Layer 是依赖的可组合单元**：`Layer.merge`、`Layer.provide`、`Layer.provideMerge` 这些组合器让依赖关系可以像搭积木一样构建。DAG 的自动拓扑排序消除了手动编排初始化顺序的负担。
- **测试基础设施级别提升**：任意依赖都可以在测试中被精确替换，无需全局状态清理、无需复杂的 Mock 框架。`Layer.succeed` 一行代码就能创建一个测试用的实现。
- **Scope 提供了资源生命周期管理**：通过 `Layer.scoped` 创建的资源可以在请求结束时自动释放，让数据库连接、文件句柄的管理回归到声明式范式。

从全局变量到手动传参，再到 Effect-TS 的 Context + Layer，每一次演进都解决了前一种方案的固有缺陷。对于任何需要管理三个以上外部依赖的中大型应用，Effect-TS 的 DI 系统都值得认真考虑。它的学习曲线主要体现在理解 `Tag` 的双重角色（运行时 + 编译期）和 Layer 组合器的语义上，一旦越过这个门槛，日常开发中几乎感受不到 DI 系统的存在——它变成了类型系统的一部分，安静地确保一切都在正确的位置。

下一章将深入 Effect-TS 的 **Scope** 机制，探讨资源管理与生命周期控制——这是 Layer 管理有状态资源的底层基础设施，也是实现 `Layer.scoped` 的幕后引擎。