import { Effect, Context, Layer } from "effect"

// 核心概念：将副作用抽象为 Requirement (R)
// Effect<R, E, A> 中的 R 表示该 Effect 需要哪些依赖

// 1. 定义服务接口（Tag）
class Logger extends Context.Tag("Logger")<
  Logger,
  { readonly log: (msg: string) => Effect.Effect<void> }
>() {}

class Database extends Context.Tag("Database")<
  Database,
  { readonly query: (sql: string) => Effect.Effect<unknown[]> }
>() {}

// 2. 业务逻辑 — 声明对 Logger 和 Database 的依赖
const processUser = (userId: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database

    yield* logger.log(`开始处理用户 ${userId}`)
    const users = yield* db.query(`SELECT * FROM users WHERE id = ${userId}`)
    yield* logger.log(`查询结果: ${JSON.stringify(users)}`)
  })

// 3. 测试时提供 Mock 实现
const TestLogger = Layer.succeed(Logger, {
  log: (msg) =>
    Effect.sync(() => {
      console.log(`[测试日志] ${msg}`)
    }),
})

const TestDb = Layer.succeed(Database, {
  query: (sql) =>
    Effect.succeed([
      { id: 1, name: "测试用户", email: "test@example.com" },
    ]),
})

const TestEnv = Layer.merge(TestLogger, TestDb)

// 运行测试
const testProgram = processUser(1).pipe(Effect.provide(TestEnv))
Effect.runPromise(testProgram)
