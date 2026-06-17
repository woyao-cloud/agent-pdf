import { Effect, Context, Layer } from "effect"

// Express 到 Effect 的完整迁移示例

// === 原始 Express 代码 ===
// app.get('/users/:id', async (req, res) => {
//   const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id])
//   res.json(user)
// })

// === 迁移后的 Effect 代码 ===

// 1. 定义服务
interface Database {
  readonly query: (sql: string, params: unknown[]) => Effect.Effect<unknown[]>
}

class Database extends Context.Tag("Database")<Database, Database>() {}

interface Logger {
  readonly info: (msg: string) => Effect.Effect<void>
  readonly error: (msg: string) => Effect.Effect<void>
}

class Logger extends Context.Tag("Logger")<Logger, Logger>() {}

// 2. 定义 Express 上下文
class ExpressParams extends Context.Tag("ExpressParams")<
  ExpressParams,
  Record<string, string>
>() {}

// 3. 业务逻辑 Effect
const getUserById = Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger
  const params = yield* ExpressParams

  const userId = params["id"]
  yield* logger.info(`查询用户: ${userId}`)

  const result = yield* db.query("SELECT * FROM users WHERE id = ?", [userId])

  if (result.length === 0) {
    yield* logger.error(`用户不存在: ${userId}`)
    return { status: 404, body: { error: "用户不存在" } }
  }

  return { status: 200, body: result[0] }
})

// 4. Express 路由处理函数
const expressHandler = async (req: { params: Record<string, string> }, res: any) => {
  const program = getUserById.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(ExpressParams, req.params),
        Layer.succeed(Database, {
          query: async (sql, params) => {
            // 模拟数据库查询
            return [{ id: params[0], name: "Alice", email: "alice@example.com" }]
          },
        }),
        Layer.succeed(Logger, {
          info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
          error: (msg) => Effect.sync(() => console.log(`[ERROR] ${msg}`)),
        }),
      ),
    ),
  )

  const result = await Effect.runPromise(program)
  res.status(result.status).json(result.body)
}

// 测试
expressHandler({ params: { id: "1" } }, {
  status: (code: number) => ({
    json: (data: unknown) => console.log(`状态 ${code}:`, JSON.stringify(data)),
  }),
})
