import { Context, Layer, Effect } from "effect"
import { Database, Logger } from "./di"

interface User {
  id: string
  name: string
  email: string
}

class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    findById: (id: string) => Effect.Effect<User | null>
    create: (user: User) => Effect.Effect<User>
  }
>() {}

const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* (_) {
    const db = yield* _(Database)
    const logger = yield* _(Logger)
    return {
      findById: (id: string) =>
        Effect.gen(function* (_) {
          yield* _(logger.info(`Finding user: ${id}`))
          const result = yield* _(db.query(`SELECT * FROM users WHERE id = ${id}`))
          return result.rows.length > 0 ? result.rows[0] : null
        }),
      create: (user: User) =>
        Effect.gen(function* (_) {
          yield* _(logger.info(`Creating user: ${user.name}`))
          yield* _(db.query(`INSERT INTO users VALUES (${user.id}, ${user.name}, ${user.email})`))
          return user
        }),
    }
  })
)

const UserServiceLive = Layer.merge(UserRepositoryLive)

export { UserRepository, UserRepositoryLive, UserServiceLive }