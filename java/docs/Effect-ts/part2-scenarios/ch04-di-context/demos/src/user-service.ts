import { Effect } from "effect"
import { Database, Logger, Config } from "./di.js"

export const listUsers = Effect.gen(function* (_) {
  const db = yield* _(Database)
  const logger = yield* _(Logger)
  const config = yield* _(Config)

  yield* _(logger.info(`Querying database at ${config.dbUrl}`))
  const users = yield* _(db.query("SELECT * FROM users"))
  yield* _(logger.info(`Found ${users.length} users`))

  return users
})

export const createUserProgram = (name: string, email: string) =>
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const logger = yield* _(Logger)
    yield* _(logger.info(`Creating user: ${name}`))
    const result = yield* _(db.query(`INSERT INTO users (name, email) VALUES ('${name}', '${email}')`))
    return result
  })