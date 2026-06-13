import { Effect } from "effect"
import { UserNotFound, DatabaseError } from "./errors"

interface User { id: string; name: string; email: string }

// 模拟数据库查询
const db: Record<string, User> = {
  "1": { id: "1", name: "Alice", email: "alice@test.com" },
}

export const findUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
  Effect.gen(function* (_) {
    if (!db[id]) {
      return yield* _(Effect.fail(new UserNotFound({ id })))
    }
    return db[id]
  })

// 使用 catchTag 精准捕获特定错误
export const getUserSafe = (id: string): Effect.Effect<User | null, DatabaseError> =>
  Effect.gen(function* (_) {
    const user = yield* _(findUser(id))
    return user
  }).pipe(
    Effect.catchTag("UserNotFound", () => Effect.succeed(null))
  )

// 使用 catchAll 兜底
export const getUserOrThrow = (id: string): Effect.Effect<User, never> =>
  findUser(id).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`Unexpected error: ${error._tag}`)
        throw error
      })
    )
  )

// 重试机制
export const fetchWithRetry = (id: string): Effect.Effect<User | null, never> =>
  getUserSafe(id).pipe(
    Effect.retry({ times: 3, delay: (n) => Effect.succeed(100 * n) })
  )