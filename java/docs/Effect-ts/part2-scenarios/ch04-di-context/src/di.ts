import { Context, Layer, Effect } from "effect"

// 定义 Tag
class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<any> }
>() {}

class Logger extends Context.Tag("Logger")<
  Logger,
  { info: (msg: string) => Effect.Effect<void> }
>() {}

// 实现 Live Layer
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.sync(() => ({ rows: [], sql })),
})

const LoggerLive = Layer.succeed(Logger, {
  info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
})

// 合并依赖
const AppLayer = Layer.merge(DatabaseLive, LoggerLive)

// 使用依赖
const program = Effect.gen(function* (_) {
  const db = yield* _(Database)
  const logger = yield* _(Logger)
  yield* _(logger.info("querying users"))
  return yield* _(db.query("SELECT * FROM users"))
})

// 提供依赖后运行
const runnable = program.pipe(Effect.provide(AppLayer))

export { Database, Logger, DatabaseLive, LoggerLive, AppLayer, program, runnable }