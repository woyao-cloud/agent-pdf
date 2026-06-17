import { Effect, Console, Duration, Schedule, Array, Queue, Chunk, List, pipe, identity } from "effect"

// ============================================================
// Advanced Batching with Effect.forEach
// ============================================================
//
// Batching is a critical performance optimization for
// Effect-TS applications. Instead of processing items
// one at a time (which maximizes overhead), batching
// groups items together to amortize fixed costs.
//
// Key concepts:
// 1. Concurrency: Process multiple items simultaneously
// 2. Batching: Group items to reduce per-item overhead
// 3. Backpressure: Control the rate of processing

// ============================================================
// Simulated Expensive Operations
// ============================================================

const expensiveOperation = (n: number): number => {
  // Simulate CPU-bound work
  let result = 0
  for (let i = 0; i < 1000; i++) {
    result += Math.sqrt(n * i)
  }
  return result
}

const persistResult = (result: number): Effect.Effect<void> =>
  Effect.sync(() => {
    // Simulate database write
    // In production, this would be an actual I/O operation
  })

const persistBatch = (results: readonly number[]): Effect.Effect<void> =>
  Effect.sync(() => {
    // Simulate batch database write
    // In production, this would be a single INSERT with
    // multiple values, which is much faster than individual
    // INSERT statements.
  })

// ============================================================
// BAD: Sequential Processing
// ============================================================

// Each item is processed one at a time with concurrency: 1.
// This maximizes per-item overhead and doesn't utilize
// available I/O parallelism.
const processSequential = (items: number[]) =>
  Effect.forEach(items, n =>
    pipe(
      Effect.sync(() => expensiveOperation(n)),
      Effect.flatMap(result => persistResult(result))
    ),
    { concurrency: 1 }
  )

// ============================================================
// GOOD: Concurrent Processing with Batching
// ============================================================

// Process items concurrently (concurrency: 4) and then
// persist results in a single batch operation.
const processBatched = (items: number[]) =>
  pipe(
    Chunk.fromIterable(items),
    Effect.forEach(n => Effect.sync(() => expensiveOperation(n)), { concurrency: 4 }),
    Effect.flatMap(results => persistBatch(results))
  )

// ============================================================
// BATCHING STRATEGY: Chunked Processing
// ============================================================

// Group items into fixed-size batches, process each batch
// concurrently, and persist each batch as a group.
// This is useful when:
// - The persistence layer has batch APIs
// - You need to limit memory usage
// - You want to provide progress feedback per batch
const batchProcessor = (items: number[], batchSize: number = 10) =>
  pipe(
    items,
    Array.chunksOf(batchSize),
    Array.map(batch =>
      pipe(
        Effect.forEach(batch, n => Effect.sync(() => expensiveOperation(n)), { concurrency: 4 }),
        Effect.flatMap(results => persistBatch(results))
      )
    ),
    effects => Effect.forEach(effects, identity, { concurrency: 1 })
  )

// ============================================================
// ADVANCED: Adaptive Batching with Queue
// ============================================================

// An adaptive batch processor that dynamically adjusts
// batch size based on processing latency.
class AdaptiveBatchProcessor {
  private queue: number[] = []
  private processing = false
  private batchSize: number
  private minBatchSize: number
  private maxBatchSize: number

  constructor(
    private processFn: (batch: number[]) => Effect.Effect<void>,
    options: {
      initialBatchSize?: number
      minBatchSize?: number
      maxBatchSize?: number
    } = {}
  ) {
    this.batchSize = options.initialBatchSize ?? 10
    this.minBatchSize = options.minBatchSize ?? 1
    this.maxBatchSize = options.maxBatchSize ?? 100
  }

  add(item: number): void {
    this.queue.push(item)
    if (!this.processing) {
      this.processing = true
      this.processLoop().pipe(Effect.runPromise)
    }
  }

  private processLoop(): Effect.Effect<void> {
    return pipe(
      Effect.sync(() => {
        const batch = this.queue.splice(0, this.batchSize)
        return batch
      }),
      Effect.flatMap(batch => {
        if (batch.length === 0) {
          this.processing = false
          return Effect.void
        }

        const startTime = performance.now()
        return pipe(
          this.processFn(batch),
          Effect.flatMap(() =>
            Effect.sync(() => {
              const elapsed = performance.now() - startTime
              // Adjust batch size based on latency
              if (elapsed < 10 && this.batchSize < this.maxBatchSize) {
                this.batchSize = Math.min(this.batchSize * 2, this.maxBatchSize)
              } else if (elapsed > 100 && this.batchSize > this.minBatchSize) {
                this.batchSize = Math.max(Math.floor(this.batchSize / 2), this.minBatchSize)
              }
            })
          ),
          Effect.flatMap(() => this.processLoop())
        )
      })
    )
  }
}

// ============================================================
// ADVANCED: Concurrent Batch Processing with Backpressure
// ============================================================

// Process multiple batches concurrently while maintaining
// backpressure to prevent overwhelming downstream systems.
const concurrentBatchProcessor = (
  items: number[],
  batchSize: number = 10,
  concurrency: number = 3
) =>
  pipe(
    items,
    Array.chunksOf(batchSize),
    batches =>
      Effect.forEach(batches, batch =>
        pipe(
          Effect.forEach(batch, n => Effect.sync(() => expensiveOperation(n)), { concurrency: 4 }),
          Effect.flatMap(results => persistBatch(results))
        ),
        { concurrency }
      )
  )

// ============================================================
// Benchmark
// ============================================================

const benchmark = async () => {
  const items = Array.range(1, 100)
  console.log("\n=== Effect.forEach Batching Benchmarks ===\n")

  // Warm up
  await Effect.runPromise(processSequential(items.slice(0, 10)))

  // Sequential
  const start1 = performance.now()
  await Effect.runPromise(processSequential(items))
  const time1 = performance.now() - start1
  console.log(`Sequential (concurrency: 1): ${time1.toFixed(2)}ms`)

  // Batched
  const start2 = performance.now()
  await Effect.runPromise(processBatched(items))
  const time2 = performance.now() - start2
  console.log(`Batched (concurrency: 4):   ${time2.toFixed(2)}ms`)

  // Chunked
  const start3 = performance.now()
  await Effect.runPromise(batchProcessor(items, 10))
  const time3 = performance.now() - start3
  console.log(`Chunked (batch: 10):         ${time3.toFixed(2)}ms`)

  // Concurrent batches
  const start4 = performance.now()
  await Effect.runPromise(concurrentBatchProcessor(items, 10, 3))
  const time4 = performance.now() - start4
  console.log(`Concurrent batches (3):      ${time4.toFixed(2)}ms`)

  console.log("\n--- Summary ---")
  console.log(`Sequential vs Batched: ${(time1 / time2).toFixed(1)}x faster`)
  console.log(`Sequential vs Chunked: ${(time1 / time3).toFixed(1)}x faster`)
  console.log(`Sequential vs Concurrent: ${(time1 / time4).toFixed(1)}x faster`)
}

if (require.main === module) {
  benchmark()
}
