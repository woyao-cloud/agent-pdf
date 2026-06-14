import { Effect } from "effect"
import { UserNotFound, DatabaseError } from "../errors/user-errors.js"
import type { User } from "../models/user.js"

// Mock database
const db: Record<string, User> = {
  "1": { id: "1", name: "Alice", role: "admin" },
  "2": { id: "2", name: "Bob", role: "user" },
}

const queryDatabase = (sql: string, params: unknown[]): Effect.Effect<unknown, DatabaseError, never> =>
  Effect.sync(() => {
    const id = params[0] as string
    return db[id] || null
  })

export const findUserById = (id: string): Effect.Effect<User, UserNotFound | DatabaseError, never> =>
  Effect.gen(function* (_) {
    const result = yield* _(queryDatabase("SELECT * FROM users WHERE id = ?", [id]))
    if (!result) {
      return yield* _(Effect.fail(new UserNotFound({ id })))
    }
    return result as User
  })