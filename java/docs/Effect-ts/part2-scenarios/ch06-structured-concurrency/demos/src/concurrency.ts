import { Effect, Fiber, Console, Semaphore } from "effect"

// Demo 1: Fiber fork/join
export const parallelTask = Effect.gen(function* (_) {
  const fiber1 = yield* _(Effect.fork(Effect.succeed("task1-done")))
  const fiber2 = yield* _(Effect.fork(Effect.succeed("task2-done")))
  const result1 = yield* _(Fiber.join(fiber1))
  const result2 = yield* _(Fiber.join(fiber2))
  return [result1, result2]
})

// Demo 2: Semaphore rate limiting
const fetchUrl = (url: string): Effect.Effect<string, never, never> =>
  Effect.sync(() => {
    console.log(`Fetching: ${url}`)
    return `Result from ${url}`
  })

export const processBatch = (urls: string[]): Effect.Effect<string[], never, never> =>
  Effect.gen(function* (_) {
    const semaphore = yield* _(Effect.makeSemaphore(5))
    const tasks = urls.map((url) =>
      semaphore.withPermits(1)(fetchUrl(url))
    )
    return yield* _(Effect.all(tasks, { concurrency: "unbounded" }))
  })

// Demo 3: Race between tasks
export const raceExample = Effect.gen(function* (_) {
  const winner = yield* _(
    Effect.race(
      Effect.sync(() => {
        console.log("Task A running...")
        return "A-wins"
      }),
      Effect.sync(() => {
        console.log("Task B running...")
        return "B-wins"
      }),
    )
  )
  return winner
})

// Demo 4: Timeout
export const timeoutExample = Effect.gen(function* (_) {
  const result = yield* _(
    Effect.sleep("100 millis").pipe(
      Effect.flatMap(() => Effect.succeed("completed")),
      Effect.timeout("50 millis"),
    )
  )
  return result
})