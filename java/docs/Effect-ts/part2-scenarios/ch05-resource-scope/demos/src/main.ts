import { Effect, Console, Scope } from "effect"
import { readFile, processMultiple } from "./resource.js"
import { queryDb } from "./connection-pool.js"

const main = Effect.gen(function* (_) {
  // Demo 1: Single file
  const content = yield* _(readFile("data.txt"))
  yield* _(Console.log(`File content: ${content}`))

  // Demo 2: Multiple files with Scope
  const combined = yield* _(processMultiple("a.txt", "b.txt")).pipe(Effect.scoped)
  yield* _(Console.log(`Combined:\n${combined}`))

  // Demo 3: Connection pool
  const result = yield* _(queryDb("SELECT * FROM users")).pipe(Effect.scoped)
  yield* _(Console.log(`Query result: ${result}`))
})

Effect.runPromise(main).catch(console.error)