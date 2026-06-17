import { Effect, Console, Duration, Schedule, Array, pipe } from "effect"

// ============================================================
// Effect.sync vs Effect.promise: Performance Implications
// ============================================================
//
// Choosing between Effect.sync and Effect.promise has
// significant performance implications:
//
// - Effect.sync: Wraps a synchronous thunk. No Promise
//   allocation. The runtime executes it immediately on the
//   current fiber. Zero overhead beyond the Effect wrapper.
//
// - Effect.promise: Wraps an async function that returns a
//   Promise. Allocates a Promise object, creates a microtask,
//   and may involve async scheduling overhead. Even if the
//   Promise resolves synchronously, the overhead is ~10-100x
//   more than Effect.sync.
//
// Rule of thumb: If your computation is synchronous, ALWAYS
// use Effect.sync. Only use Effect.promise when you actually
// need to await an async operation (I/O, network, etc.).

// ============================================================
// Basic Examples
// ============================================================

// Effect.sync - synchronous, no allocation overhead
// The thunk is called lazily when the Effect is executed.
// No Promise is created.
const syncEffect = Effect.sync(() => {
  // Synchronous computation
  return 1 + 2 + 3
})

// Effect.promise - asynchronous, allocates a Promise
// Even though the function body looks synchronous, it
// returns a Promise.resolve(), which creates a Promise
// object and schedules a microtask.
const promiseEffect = Effect.promise(() => {
  // Even synchronous-looking code creates a Promise
  return Promise.resolve(1 + 2 + 3)
})

// ============================================================
// Anti-pattern: Effect.promise for Synchronous Work
// ============================================================

// Helper: simulate a synchronous read from memory
const readFromMemory = (): number => {
  // This is purely synchronous - no I/O, no async
  return 42
}

// Helper: simulate data processing
const processData = (data: number): Effect.Effect<string> =>
  Effect.sync(() => `Processed: ${data}`)

// BAD: Using Effect.promise for synchronous work
// This creates an unnecessary Promise allocation and
// microtask scheduling overhead.
const badPromiseUsage = pipe(
  Effect.promise(() => {
    const data = readFromMemory()  // Synchronous!
    return Promise.resolve(data)
  }),
  Effect.flatMap(data => processData(data))
)

// GOOD: Use Effect.sync for synchronous work
// No Promise allocation, no microtask overhead.
const goodSyncUsage = pipe(
  Effect.sync(() => readFromMemory()),  // No Promise allocation
  Effect.flatMap(data => processData(data))
)

// ============================================================
// When to Use Effect.promise (Correctly)
// ============================================================

// CORRECT: Effect.promise for actual async work
const correctPromiseUsage = Effect.promise(() => {
  // This is genuinely async - fetching from an API
  return fetch("https://api.example.com/data").then(r => r.json())
})

// CORRECT: Effect.promise for callback-based APIs
const correctPromiseFromCallback = Effect.promise<string>(() => {
  return new Promise((resolve, reject) => {
    // Some callback-based API
    setTimeout(() => resolve("done"), 100)
  })
})

// ============================================================
// Effect.try vs Effect.tryPromise
// ============================================================

// BAD: Using Effect.tryPromise for synchronous code
const badTryPromise = Effect.tryPromise(() => {
  return Promise.resolve(JSON.parse('{"key": "value"}'))
})

// GOOD: Use Effect.try for synchronous code
const goodTry = Effect.try(() => {
  return JSON.parse('{"key": "value"}')
})

// ============================================================
// Benchmark Comparison
// ============================================================

const benchmark = (iterations: number) => {
  console.log(`\n=== Sync vs Promise Benchmark (${iterations.toLocaleString()} iterations) ===\n`)

  // Warm up
  for (let i = 0; i < 1000; i++) {
    Effect.runSync(syncEffect)
  }

  // Benchmark Effect.sync
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    Effect.runSync(syncEffect)
  }
  const syncTime = performance.now() - start

  // Benchmark Effect.promise
  const start2 = performance.now()
  const promises: Promise<number>[] = []
  for (let i = 0; i < iterations; i++) {
    promises.push(Effect.runPromise(promiseEffect))
  }
  // Wait for all promises to settle
  Promise.all(promises).then(() => {
    const promiseTime = performance.now() - start2

    console.log(`Effect.sync:    ${syncTime.toFixed(2)}ms`)
    console.log(`Effect.promise: ${promiseTime.toFixed(2)}ms`)
    console.log(`Promise overhead: ${((promiseTime / syncTime) - 1) * 100}%`)

    if (syncTime > 0) {
      const syncOpsPerMs = iterations / syncTime
      const promiseOpsPerMs = iterations / promiseTime
      console.log(`\nSync ops/ms:    ${syncOpsPerMs.toFixed(1)}`)
      console.log(`Promise ops/ms: ${promiseOpsPerMs.toFixed(1)}`)
      console.log(`Speed ratio:    ${(syncOpsPerMs / promiseOpsPerMs).toFixed(1)}x`)
    }
  })
}

// Run benchmark if executed directly
if (require.main === module) {
  benchmark(100000)
}
