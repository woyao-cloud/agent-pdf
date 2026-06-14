import { Context, Layer, Effect } from "effect"

export class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<any[]> }
>() {}

export class Logger extends Context.Tag("Logger")<
  Logger,
  { info: (msg: string) => Effect.Effect<void> }
>() {}

export class Config extends Context.Tag("Config")<
  Config,
  { dbUrl: string; logLevel: string }
>() {}

// Mock DB implementation
const mockDb = {
  users: [
    { id: "1", name: "Alice", email: "alice@test.com" },
    { id: "2", name: "Bob", email: "bob@test.com" },
  ],
}

export const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.sync(() => {
    console.log(`[DB] Executing: ${sql}`)
    return mockDb.users
  }),
})

export const LoggerLive = Layer.succeed(Logger, {
  info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
})

export const ConfigLive = Layer.succeed(Config, {
  dbUrl: "postgres://localhost:5432/mydb",
  logLevel: "debug",
})

export const AppLayer = Layer.mergeAll(DatabaseLive, LoggerLive, ConfigLive)