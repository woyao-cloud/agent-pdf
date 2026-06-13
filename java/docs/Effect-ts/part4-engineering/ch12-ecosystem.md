# ch12 与现有框架融合

## 概述

Effect-TS 在设计上并非"全有或全无"的框架。它提供了**渐进式采用**路径：你可以从某个模块（例如 `Effect` 的 Zod/Schema 整合、获取 HTTP 请求）开始，逐步扩展到整个应用。本章涵盖 Effect-TS 与主流 Node.js / TypeScript 框架的集成方式。

---

## 1. Express / Fastify 集成

### 1.1 Express 中间件模式

```typescript
import express, { Request, Response, NextFunction } from "express"
import { Effect, Context, Layer } from "effect"
import { pipe } from "effect/Function"

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

### 1.2 统一错误处理

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
  runtime: Effect.ManagedRuntime<never, never>
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
    runtime
  )
})
```

### 1.3 Fastify + @effect/platform

如果使用 `@effect/platform` 的 HTTP 客户端，可以更紧密地整合：

```typescript
import Fastify from "fastify"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { NodeServer } from "@effect/platform-node"

// Fastify 插件模式
const app = Fastify({ logger: true })

app.get("/proxy/:url", async (request, reply) => {
  const effect = HttpClientRequest.get(request.params.url).pipe(
    HttpClient.letClient(HttpClient.client),
    Effect.andThen((resp) => HttpClientResponse.text(resp)),
    Effect.timeout("10 seconds")
  )
  
  const result = await Effect.runPromise(effect)
  return reply.send(result)
})
```

---

## 2. 数据库集成

### 2.1 Prisma

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

### 2.2 Sequelize / TypeORM

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

### 2.3 事务支持

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

---

## 3. 消息队列集成

### 3.1 BullMQ（Redis Queue）

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

## 4. React / Next.js 集成

### 4.1 Server Actions（Next.js App Router）

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

### 4.2 React Query Integration

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

## 5. CLI 工具集成

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

---

## 6. 日志与监控集成

```typescript
import { Effect, Context, Layer } from "effect"
import pino from "pino"
import { opentelemetry as otel } from "@effect/opentelemetry"

// Pino Logger
class Logger extends Context.Tag("Logger")<
  Logger,
  pino.Logger
>() {}

const LoggerLive = Layer.succeed(
  Logger,
  pino({ level: "info", transport: { target: "pino-pretty" } })
)

// OpenTelemetry + Effect
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

const tracerProvider = new NodeTracerProvider()
tracerProvider.addSpanProcessor(
  new BatchSpanProcessor(new OTLPTraceExporter())
)
tracerProvider.register()

// Effect 自动集成：Effect.runPromise 内自动创建 Span
// 可通过 otel.Tracer Tag 手动控制 Span 范围
```

---

## 7. 渐进式采用策略

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

---

## 8. 常见问题

### 8.1 Effect 与 async/await 混用

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

### 8.2 类型安全边界

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

---

## 参考

- `@effect/platform` HTTP：https://effect.website/docs/platform/http
- `@effect/cli`：https://effect.website/docs/cli/introduction
- `@effect/opentelemetry`：https://effect.website/docs/observability/opentelemetry
- 相关章节：ch04（DI）、ch07（Stream）、ch10（Schema）