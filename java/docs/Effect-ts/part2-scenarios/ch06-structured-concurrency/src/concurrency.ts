import { Effect, Fiber, Semaphore, Queue } from "effect"

// Semaphore 限流
export const processBatch = (urls: string[]) =>
  Effect.gen(function* (_) {
    const semaphore = yield* _(Effect.makeSemaphore(10))

    const tasks = urls.map((url) =>
      semaphore.withPermits(1)(fetchUrl(url))
    )

    return yield* _(
      Effect.all(tasks, { concurrency: "unbounded" }),
      Effect.timeout("5 seconds"),
    )
  })

// Fiber 手动管理
export const parallelTask = Effect.gen(function* (_) {
  const fiber1 = yield* _(Effect.fork(Effect.succeed("task1")))
  const fiber2 = yield* _(Effect.fork(Effect.succeed("task2")))
  const result1 = yield* _(Fiber.join(fiber1))
  const result2 = yield* _(Fiber.join(fiber2))
  return [result1, result2]
})

function fetchUrl(url: string): Effect.Effect<string> {
  return Effect.sync(() => `Fetched ${url}`)
}

// Queue 模式：生产者-消费者
export const producerConsumer = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<string>())

  const producer = Effect.gen(function* (_) {
    for (const item of ["a", "b", "c"]) {
      yield* _(queue.offer(item))
    }
    yield* _(queue.end)
  })

  const consumer = Effect.gen(function* (_) {
    const items: string[] = []
    let done = false
    while (!done) {
      const item = yield* _(queue.take)
      if (item === Queue.endMarker) {
        done = true
      } else {
        items.push(item)
      }
    }
    return items
  })

  const [_, consumed] = yield* _(Effect.all([producer, consumer], { concurrency: 2 }))
  return consumed
})

// Race 模式：最快响应
export const raceApis = Effect.gen(function* (_) {
  const result = yield* _(
    Effect.race(
      Effect.sync(() => "api1").pipe(Effect.delay("100 millis")),
      Effect.sync(() => "api2").pipe(Effect.delay("200 millis")),
    )
  )
  return result
})

// 批量并发控制
export const concurrentMap = <A, B>(
  items: A[],
  f: (item: A) => Effect.Effect<B>,
  concurrency: number,
): Effect.Effect<B[]> =>
  Effect.forEach(items, f, { concurrency })