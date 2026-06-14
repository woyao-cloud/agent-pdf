import { Effect, Console } from "effect"
import { handleUserRequest } from "./controllers/user-controller.js"
import { UserNotFound } from "./errors/user-errors.js"

const main = Effect.gen(function* (_) {
  // Case 1: User exists (userId "1" has both user record and orders)
  const result1 = yield* _(handleUserRequest("1"))
  yield* _(Console.log(`Case 1 (existing user): status=${result1.status}, body=${result1.body}`))

  // Case 2: User not found (no user with id "nonexistent")
  const result2 = yield* _(handleUserRequest("nonexistent"))
  yield* _(Console.log(`Case 2 (not found): status=${result2.status}, body=${result2.body}`))

  // Demonstrate the _tag discriminant for type-safe error matching
  const userNotFoundTag: UserNotFound["_tag"] = "UserNotFound"
  yield* _(Console.log(`UserNotFound tag: ${userNotFoundTag}`))
})

Effect.runPromise(main).catch(console.error)