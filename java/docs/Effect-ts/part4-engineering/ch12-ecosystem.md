# ch12 与现有框架融合

## 概述

Effect-TS 在设计上并非"全有或全无"的框架。它提供了**渐进式采用**路径：你可以从某个模块（例如用 `Effect` 封装 `async/await`、用 `Schema` 校验 API 请求）开始，逐步扩展到整个应用。本章涵盖 Effect-TS 与主流 Node.js / TypeScript 框架的集成方式——Express、NestJS、Prisma、CLI 工具，以及每种场景下的渐进式策略。

核心原则：**不要推翻重来**。逐个模块替换，让 Effect 从"角落使用"逐步演变为"核心基础设施"。

---

## 1. 使用场景

### 1.1 在 Express / NestJS 中集成 Effect

你将 Effect 用于**业务流程编排**，Express/NestJS 仍然负责 HTTP 路由和中间件。

### 1.2 与 Prisma / TypeORM 结合

将数据库查询封装为 Effect Service，这样测试时可以直接替换数据库层。

### 1.3 CLI 工具开发

使用 `@effect/cli` 构建类型安全的 CLI，或将 Effect 集成到 Commander/Yargs 中。

### 1.4 日志与监控集成

用 `@effect/opentelemetry` 自动追踪 Effect Pipeline，将日志输出到 Pino/Winston。

---

## 2. Express 集成

### 2.1 Express 中间件模式

```typescript
import express, { Request, Response, NextFunction } from "express"
import { Effect, Context, Layer } from "effect"

// 定义应用 Service
class UserService extends Context.Tag("UserService")<
  UserService,
  {
    findUser: (id: string) => Effect.Effect<{ id: string; name: string }>
  }
>() {}

const UserServiceLive = Layer.succeed(UserService, {
  findUser: (id) =>
    Effect.succeed({ id, name: `User-${id}` })
})

// Effect Runtime（应用全局单例）
const runtime = Effect.ManagedRuntime.make(
  Layer.mergeAll(UserServiceLive)
)

// Express 路由 Handler（适配器模式）
app.get("/users/:id", (req: Request, res: Response, next: NextFunction) => {
  const effect = Effect.gen(function* (_) {
    const userService = yield* _(UserService)
    const user = yield* _(userService.findUser(req.params.id))
    return user
  })

  runtime.runPromise(effect).then(
    (user) => res.json(user),
    (err) => next(err)
  )
})
```

### 2.2 统一错误处理

```typescript
import { Effect, Cause } from "effect"
import { Response } from "express"

// 自定义错误类型
class NotFoundError {
  readonly _tag = "NotFoundError"
  constructor(readonly message: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError"
  constructor(readonly message: string) {}
}

// Effect 到 HTTP Response 的适配器
const toResponse = <A, E>(
  effect: Effect.Effect<A, E, never>,
  runtime: Effect.ManagedRuntime<never, never>,
  res: Response
): Promise<void> => {
  return runtime.runPromiseExit(effect).then((exit) => {
    switch (exit._tag) {
      case "Success":
        return res.status(200).json(exit.value)
      case "Failure": {
        const cause = exit.cause
        if (Cause.isFailType(cause)) {
          const err = cause.error
          switch (err._tag) {
            case "NotFoundError":
              return res.status(404).json({ error: err.message })
            case "ValidationError":
              return res.status(400).json({ error: err.message })
            default:
              return res.status(500).json({ error: "Internal Error" })
          }
        }
        return res.status(500).json({ error: "Unexpected Error" })
      }
    }
  })
}

// 使用
app.get("/users/:id", (req, res) => {
  toResponse(
    Effect.gen(function* (_) {
      const userService = yield* _(UserService)
      const user = yield* _(userService.findUser(req.params.id))
      if (!user) {
        yield* _(Effect.fail(new NotFoundError("User not found")))
      }
      return user
    }),
    runtime,
    res
  )
})
```

### 2.3 Express 与 @effect/schema 结合

将 Schema 校验直接接入 Express 中间件：

```typescript
import { Schema } from "@effect/schema"
import { Effect } from "effect"
import { Request, Response, NextFunction } from "express"

const bodyValidator = <A>(schema: Schema.Schema<A, unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Schema.decode(Effect)(schema, req.body).pipe(
      Effect.andThen((validBody) => {
        req.body = validBody  // 替换为类型安全的数据
        next()
      }),
      Effect.catchAll((err) => {
        res.status(400).json({ error: err.errors.map(e => e.message) })
      }),
      runtime.runPromise
    )
  }

// 使用方式
app.post("/users", bodyValidator(CreateUserRequest), (req, res) => {
  // req.body 已经被校验，类型安全
  runtime.runPromise(createUser(req.body)).then(res.json)
})
```

---

## 3. NestJS 集成

NestJS 的装饰器 + DI 系统与 Effect 的 Context/Layer 可以和谐共存：

```typescript
import { Injectable, Controller, Get, Param } from "@nestjs/common"
import { Effect, Context, Layer, ManagedRuntime } from "effect"

// Effect Service
class UserQueries extends Context.Tag("UserQueries")<
  UserQueries,
  { findUser: (id: string) => Effect.Effect<{ id: string; name: string }> }
>() {}

const UserQueriesLive = Layer.succeed(UserQueries, {
  findUser: (id) =>
    Effect.tryPromise(() =>
      prisma.user.findUnique({ where: { id } })
    )
})

// 全局 Runtime
const runtime = Effect.ManagedRuntime.make(UserQueriesLive)

// NestJS Controller 通过 Runtime 调用 Effect
@Controller("users")
export class UserController {
  @Get(":id")
  async findUser(@Param("id") id: string) {
    const effect = Effect.gen(function* (_) {
      const queries = yield* _(UserQueries)
      return yield* _(queries.findUser(id))
    })

    const result = await runtime.runPromise(effect)
    return result
  }
}
```

**策略总结**：NestJS 负责 HTTP 层（路由、装饰器、Guard、Pipe），Effect 负责业务层（编排、重试、并发、错误处理）。两者通过 `ManagedRuntime` 桥接。

---

## 4. 数据库集成

### 4.1 Prisma + Effect

```typescript
import { PrismaClient } from "@prisma/client"
import { Effect, Context, Layer } from "effect"

// Prisma Client 作为 Effect Service
class Prisma extends Context.Tag("Prisma")<
  Prisma,
  PrismaClient
>() {}

// Live Layer：连接到数据库
const PrismaLive = Layer.scoped(
  Effect.acquireRelease(
    Effect.sync(() => {
      const client = new PrismaClient()
      return client.$connect().then(() => client)
    }),
    (client) => Effect.promise(() => client.$disconnect())
  )
)

// Service 封装
class UserRepo extends Context.Tag("UserRepo")<
  UserRepo,
  {
    findById: (id: string) => Effect.Effect<{
      id: string; name: string; email: string
    } | null>
    create: (data: { name: string; email: string }) =>
      Effect.Effect<{ id: string; name: string; email: string }>
  }
>() {}

const UserRepoLive = Layer.effect(
  UserRepo,
  Effect.gen(function* (_) {
    const prisma = yield* _(Prisma)

    return {
      findById: (id) =>
        Effect.tryPromise({
          try: () => prisma.user.findUnique({ where: { id } }),
          catch: (err) => new Error(`DB error: ${err}`)
        }),
      create: (data) =>
        Effect.tryPromise({
          try: () => prisma.user.create({ data }),
          catch: (err) => new Error(`DB error: ${err}`)
        })
    }
  })
)

// 使用
const program = Effect.gen(function* (_) {
  const repo = yield* _(UserRepo)
  return yield* _(repo.findById("user-1"))
}).pipe(Effect.provide(Layer.mergeAll(PrismaLive, UserRepoLive)))
```

### 4.2 Prisma 事务的 Effect 封装

```typescript
import { Effect, Context, Layer, Scope } from "effect"
import { PrismaClient } from "@prisma/client"

// 事务作用域
const withTransaction = <A, E>(
  effect: Effect.Effect<A, E, Prisma>
): Effect.Effect<A, E | Error, Scope.Scope> =>
  Effect.scoped(
    Effect.gen(function* (_) {
      const prisma = yield* _(Prisma)

      // 在 Prisma 事务中执行
      return yield* _(
        Effect.tryPromise(() =>
          prisma.$transaction((tx) => {
            // 将 tx 替换到 Context 中
            return Effect.runPromise(effect)
          })
        )
      )
    })
  )
```

### 4.3 Sequelize / TypeORM

```typescript
import { DataSource } from "typeorm"
import { Effect, Context, Layer } from "effect"
import { User } from "./entities/User"

class Database extends Context.Tag("Database")<
  Database,
  DataSource
>() {}

const DatabaseLive = Layer.scoped(
  Effect.acquireRelease(
    Effect.tryPromise(() =>
      new DataSource({
        type: "postgres",
        entities: [User],
        synchronize: true
      }).initialize()
    ),
    (ds) => Effect.promise(() => ds.destroy())
  )
)
```

---

## 5. 消息队列集成

### 5.1 BullMQ（Redis Queue）

```typescript
import { Queue as BullQueue, Worker } from "bullmq"
import { Effect, Context, Layer, Stream, Queue as EffectQueue } from "effect"

class JobQueue extends Context.Tag("JobQueue")<
  JobQueue,
  { add: (name: string, data: unknown) => Effect.Effect<string> }
>() {}

const JobQueueLive = Layer.succeed(JobQueue, {
  add: (name, data) =>
    Effect.tryPromise({
      try: async () => {
        const queue = new BullQueue("default", {
          connection: { host: "localhost", port: 6379 }
        })
        const job = await queue.add(name, data)
        return job.id ?? "unknown"
      },
      catch: (err) => new Error(`Queue error: ${err}`)
    })
})

// 消费端：Bull Worker → Effect Queue → Stream
const createWorkerStream = (queueName: string) =>
  Stream.async<{ name: string; data: unknown }, Error>((emit) => {
    const worker = new Worker(queueName, async (job) => {
      emit.single({ name: job.name, data: job.data })
    }, { connection: { host: "localhost", port: 6379 } })

    worker.on("error", (err) => emit.fail(new Error(err.message)))
    worker.on("failed", (_, err) =>
      emit.fail(new Error(err?.message ?? "unknown"))
    )

    // 清理
    return () => worker.close()
  })
```

---

## 6. React / Next.js 集成

### 6.1 Server Actions（Next.js App Router）

```typescript
// app/actions/user.ts
"use server"

import { Effect } from "effect"
import { UserService, UserServiceLive } from "@/services/user-service"
import { Layer } from "effect/Layer"

const runtime = Effect.ManagedRuntime.make(UserServiceLive)

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string

  const effect = Effect.gen(function* (_) {
    const svc = yield* _(UserService)
    return yield* _(svc.createUser(name, email))
  })

  const result = await runtime.runPromiseExit(effect)

  if (result._tag === "Success") {
    return { success: true, user: result.value }
  }

  return { success: false, error: "Creation failed" }
}
```

### 6.2 React Query Integration

```typescript
import { useQuery, useMutation } from "@tanstack/react-query"
import { Effect } from "effect"

// Effect → React Query Adapter
const useEffectQuery = <A, E>(
  key: string[],
  effect: Effect.Effect<A, E, never>,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: key,
    queryFn: () => Effect.runPromise(effect),
    ...options
  })
}

// 在组件中使用
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading } = useEffectQuery(
    ["user", userId],
    Effect.gen(function* (_) {
      const svc = yield* _(UserService)
      return yield* _(svc.findUser(userId))
    }),
    { enabled: !!userId }
  )

  if (isLoading) return <div>Loading...</div>
  return <div>{data?.name}</div>
}
```

---

## 7. CLI 工具集成

`@effect/cli` 提供了完整的 CLI 构建能力，但与 `commander` / `yargs` 等传统库也能协作：

```typescript
import { program } from "commander"
import { Effect } from "effect"
import { Console } from "effect"

// Commander + Effect
program
  .command("process")
  .option("-f, --file <path>", "Input file path")
  .action(async (options) => {
    const effect = Effect.gen(function* (_) {
      yield* _(Console.log(`Processing file: ${options.file}`))
      // ... 业务逻辑
      return "done"
    })

    const result = await Effect.runPromise(effect)
    console.log(result)
  })

program.parse()
```

使用 `@effect/cli` 原生构建：

```typescript
import { Command, Options, Args } from "@effect/cli"
import { Effect, Console, NodeContext } from "effect"
import { NodeRuntime } from "@effect/platform-node"

const file = Args.text({ name: "file" })
const verbose = Options.boolean("verbose")

const command = Command.make("process", { file, verbose }, ({ file, verbose }) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`Processing ${file}`))
    if (verbose) yield* _(Console.log("Verbose mode enabled"))
    return "done"
  })
)

const cli = Command.run(command, {
  name: "my-cli",
  version: "1.0.0"
})

NodeRuntime.runMain(cli(process.argv))
```

---

## 8. 日志与监控集成

### 8.1 Pino Logger

```typescript
import { Effect, Context, Layer } from "effect"
import pino from "pino"

class Logger extends Context.Tag("Logger")<
  Logger,
  pino.Logger
>() {}

const LoggerLive = Layer.succeed(
  Logger,
  pino({ level: "info", transport: { target: "pino-pretty" } })
)
```

### 8.2 OpenTelemetry

Effect 对 OpenTelemetry 有一流支持。通过 `@effect/opentelemetry`，任何 `Effect.runPromise` 调用都会自动创建追踪 Span：

```typescript
import { opentelemetry as otel } from "@effect/opentelemetry"
import { Effect, Layer } from "effect"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

// 配置 OpenTelemetry
const TracingLayer = Layer.succeed(
  otel.TracerProvider,
  otel.TracerProvider.from(
    new NodeTracerProvider({
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter())
      ]
    })
  )
)

// Effect 中手动创建 Span
const tracedOperation = Effect.gen(function* (_) {
  const tracer = yield* _(otel.Tracer)
  return yield* _(tracer.startSpan("my-operation", {
    attributes: { key: "value" }
  }))
})
```

---

## 9. 渐进式采用策略

| 阶段 | 集成内容 | 对现有代码的影响 |
|------|---------|----------------|
| Phase 1 | 仅用 `Effect` 封装异步，替换 `async/await` | 无侵入 |
| Phase 2 | 引入 `Schedule` 重试 + `Effect.retry` | 改造重试逻辑 |
| Phase 3 | 用 `Context` + `Layer` 管理依赖 | 引入 DI 架构 |
| Phase 4 | 引入 `Stream` 处理事件/消息 | 新模块采用 |
| Phase 5 | 全面采用 Effect（CLI、Schema、测试） | 部分重写 |

```typescript
// Phase 1：最小侵入 —— 替换 async/await
// 之前
async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
}

// 之后（同一文件中）
const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`).then((r) => r.json()),
    catch: (err) => new Error(`Network error: ${err}`)
  })
// ✅ 调用方不关心是 Effect 还是 Promise
```

**何时推进到下一阶段？**
- Phase 1 → Phase 2：当发现需要重试逻辑、超时控制或并发编排时
- Phase 2 → Phase 3：当测试变得困难，需要替换依赖时
- Phase 3 → Phase 4：当应用需要处理事件流或消息队列时
- Phase 4 → Phase 5：当团队已经熟悉 Effect 生态，希望统一技术栈时

---

## 10. 实现原理：ManagedRuntime 桥接模式

Effect 与外部框架集成的核心是 `ManagedRuntime`——它是一个持有所有层和应用状态的 Effect Runtime 实例：

```typescript
// 1. 创建 Runtime（应用启动时）
const runtime = Effect.ManagedRuntime.make(AppLayer)

// 2. 在外部框架中通过 Runtime 执行 Effect
// Express Handler
app.get("/api", (req, res) => {
  runtime.runPromise(effect).then(res.json).catch(next)
})

// NestJS Controller
@Get()
async handler() {
  return runtime.runPromise(effect)
}

// 3. 或者创建更细粒度的 Runtime
const scopedRuntime = Effect.ManagedRuntime.make(
  Layer.mergeAll(UserServiceLive, RequestLayer.of(req))
)
```

---

## 11. 潜在风险与典型问题

### 11.1 Effect 与 async/await 混用

```typescript
// ❌ 避免：在 async 函数中手动 unwrap
async function badHandler(req: Request) {
  const runtime = Effect.ManagedRuntime.make(Layer.empty)
  return runtime.runPromise(myEffect)
}

// ✅ 推荐：在顶层创建 Runtime，注入依赖
const runtime = Effect.ManagedRuntime.make(AppLayer)

const handler = (req: Request) =>
  runtime.runPromise(
    myEffect.pipe(Effect.provide(RequestLayer.of(req)))
  )
```

### 11.2 类型安全边界

在 Effect 与第三方库的边界处，使用适配器模式隔离类型安全：

```typescript
// 适配器：Prisma → Effect
const adaptQuery = <A>(
  promise: Promise<A>
): Effect.Effect<A, DatabaseError, never> =>
  Effect.tryPromise({
    try: () => promise,
    catch: (err) => new DatabaseError(String(err))
  })
```

### 11.3 性能边界

Effect Pipeline 在 Express / NestJS 热路径上需要考虑性能：

- ManagedRuntime 应在应用启动时创建一次，而不是每个请求创建
- 使用 `Effect.provide(Layer)` 为 Effect 注入依赖，而非每次都 `pipe` 一个新的 Layer
- 对于简单路由（如健康检查），可以直接返回值而无需 Effect

---

## 12. 开发者技能：边界意识

在 Effect 与传统框架集成时，最重要的认知是**边界意识**：

| 层 | 框架职责 | Effect 职责 |
|----|---------|------------|
| HTTP 层 | 路由匹配、中间件、参数解析 | 无 |
| 校验层 | @effect/schema 中间件 | Schema 定义与解码 |
| 业务层 | 无 | Effect 编排、重试、并发 |
| 数据层 | ORM 自身 | Effect Service 封装 |
| 输出层 | 序列化 Response | Effect 返回类型安全数据 |

核心原则：**在边界处使用适配器，在内部使用纯 Effect**。不要试图让 Express 处理 Effect 错误，而是先转换到 Effect，再用适配器转换回 Express 格式。

---

## 本章小结

- **渐进式采用**：Phase 1 到 Phase 5 的路径，不要推翻重来
- **Express 集成**：ManagedRuntime 作为桥接，统一错误处理
- **NestJS 集成**：NestJS 管 HTTP 层，Effect 管业务层
- **Prisma 集成**：将 ORM 封装为 Effect Service，实现测试替换
- **CLI 集成**：Commander 或 @effect/cli 均可
- **日志与监控**：Pino + OpenTelemetry 的 Effect 原生支持
- **边界意识**：在框架与 Effect 的边界处使用适配器，内部保持纯 Effect

---

## 参考

- `@effect/platform` HTTP：https://effect.website/docs/platform/http
- `@effect/cli`：https://effect.website/docs/cli/introduction
- `@effect/opentelemetry`：https://effect.website/docs/observability/opentelemetry
- 相关章节：ch04（DI）、ch07（Stream）、ch10（Schema）