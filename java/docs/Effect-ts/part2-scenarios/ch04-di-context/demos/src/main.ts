import { Effect, Console } from "effect"
import { AppLayer } from "./di.js"
import { listUsers } from "./user-service.js"

const main = listUsers.pipe(Effect.provide(AppLayer))

Effect.runPromise(main).then((users) => {
  console.log("Users:", JSON.stringify(users, null, 2))
}).catch(console.error)