import { Effect, Console } from "effect"
import { parallelTask, processBatch, raceExample } from "./concurrency.js"

const main = Effect.gen(function* (_) {
  // Demo 1: Fiber parallel
  const parallel = yield* _(parallelTask)
  yield* _(Console.log(`Parallel results: ${JSON.stringify(parallel)}`))

  // Demo 2: Batch with Semaphore (concurrency-limited)
  const urls = Array.from({ length: 10 }, (_, i) => `https://api.example.com/item/${i}`)
  const batch = yield* _(processBatch(urls))
  yield* _(Console.log(`Batch completed: ${batch.length} results`))

  // Demo 3: Race
  const winner = yield* _(raceExample)
  yield* _(Console.log(`Race winner: ${winner}`))

  // Demo 4: Timeout (this will fail with timeout)
  try {
    const timed = yield* _(import("./concurrency.js").then(m => m.timeoutExample))
    yield* _(Console.log(`Timeout result: ${timed}`))
  } catch (e) {
    yield* _(Console.log(`Expected timeout error caught: ${(e as Error).message}`))
  }
})

Effect.runPromise(main).catch(console.error)