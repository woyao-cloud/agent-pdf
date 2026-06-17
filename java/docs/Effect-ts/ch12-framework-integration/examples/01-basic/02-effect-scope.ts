import { Effect, Scope, Context, Layer } from "effect"

// Effect Scope：管理资源的生命周期

// 1. 定义需要清理的资源
interface DatabaseConnection {
  readonly query: (sql: string) => Effect.Effect<unknown[]>
  readonly close: () => Effect.Effect<void>
}

class DatabaseConnection extends Context.Tag("DatabaseConnection")<
  DatabaseConnection,
  DatabaseConnection
>() {}

// 2. 创建带 Scope 的资源
const createConnection = Effect.gen(function* () {
  const conn: DatabaseConnection = {
    query: (sql) => Effect.succeed([{ result: "data" }]),
    close: () => Effect.sync(() => console.log("数据库连接已关闭")),
  }

  // 注册清理函数
  yield* Scope.addFinalizer(() => conn.close())
  return conn
})

// 3. 使用 Scope 的业务逻辑
const queryUsers = Effect.gen(function* () {
  const conn = yield* DatabaseConnection
  return yield* conn.query("SELECT * FROM users")
})

// 4. 在 Fastify 请求生命周期中使用
const handleRequest = Effect.scoped(
  Effect.gen(function* () {
    // 创建连接（自动注册到 Scope）
    const conn = yield* createConnection
    const dbLayer = Layer.succeed(DatabaseConnection, conn)

    // 执行业务逻辑
    const result = yield* queryUsers.pipe(Effect.provide(dbLayer))
    console.log("查询结果:", result)

    return result
  }),
)

// 请求结束后，Scope 自动关闭连接
Effect.runPromise(handleRequest)
