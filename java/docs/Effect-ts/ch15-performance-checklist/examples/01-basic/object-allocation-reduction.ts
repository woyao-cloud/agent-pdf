import { Effect, pipe, Array, Record, Option, Tuple, Struct, Console } from "effect"

// ============================================================
// Object Allocation Reduction in Effect-TS
// ============================================================
//
// One of the most impactful performance optimizations in
// Effect-TS is reducing unnecessary object allocations.
// Each intermediate object creates pressure on the garbage
// collector, which can lead to significant latency spikes
// in production.
//
// This file demonstrates common allocation anti-patterns
// and their optimized alternatives.

// ============================================================
// EXAMPLE 1: Chained Array Operations
// ============================================================

// BAD: Creating unnecessary intermediate objects
// Each .map() and .filter() call creates a new array.
// With 1000 items, this creates 4 intermediate arrays
// (map -> filter -> map -> map) = 4000 temporary objects.
const badAllocation = pipe(
  Array.range(1, 1000),
  Array.map(n => ({ value: n, label: `Item ${n}` })),
  Array.filter(item => item.value % 2 === 0),
  Array.map(item => ({ ...item, doubled: item.value * 2 })),
  Array.map(item => ({ ...item, tripled: item.value * 3 }))
)

// GOOD: Single pass with minimal allocations
// Array.filterMap combines filter and map in one pass.
// We also build the final object directly instead of
// spreading intermediate versions.
const goodAllocation = pipe(
  Array.range(1, 1000),
  Array.filterMap(n => {
    if (n % 2 !== 0) return Option.none()
    return Option.some({
      value: n,
      label: `Item ${n}`,
      doubled: n * 2,
      tripled: n * 3
    })
  })
)

// ============================================================
// EXAMPLE 2: Spread Operator Overuse
// ============================================================

// BAD: Spreading objects repeatedly
// Each spread ({ ...item, ... }) creates a shallow copy
// of the entire object. In hot paths, this allocates
// thousands of unnecessary objects.
const badSpread = (items: Array<{ id: number }>) =>
  items.map(item => ({
    ...item,
    timestamp: Date.now(),
    processed: true
  }))

// GOOD: Mutate in place when safe
// When the original objects are not shared across threads
// or needed in their original form, mutation avoids
// allocation entirely.
const goodMutate = (items: Array<{ id: number; timestamp?: number; processed?: boolean }>) => {
  for (const item of items) {
    item.timestamp = Date.now()
    item.processed = true
  }
  return items
}

// ============================================================
// EXAMPLE 3: Effect Chain Allocation
// ============================================================

// BAD: Deeply nested Effect chains create many intermediate
// Effect objects. Each pipe() call allocates a new Effect.
const badEffectChain = (input: number) =>
  pipe(
    Effect.sync(() => input),
    Effect.flatMap(a => Effect.sync(() => a + 1)),
    Effect.flatMap(b => Effect.sync(() => b * 2)),
    Effect.flatMap(c => Effect.sync(() => c - 3)),
    Effect.map(d => d / 4)
  )

// GOOD: Flatten the computation
// Compute everything in a single Effect.sync() call.
// This creates exactly one Effect object instead of five.
const goodEffectChain = (input: number) =>
  Effect.sync(() => {
    const a = input
    const b = a + 1
    const c = b * 2
    const d = c - 3
    return d / 4
  })

// ============================================================
// EXAMPLE 4: Conditional Effect Allocation
// ============================================================

// BAD: Allocating Effects inside hot loops
// Each iteration creates new Effect objects even when
// the condition rarely changes.
const badConditional = (items: number[]) =>
  Effect.forEach(items, n =>
    n > 0
      ? Effect.sync(() => Math.sqrt(n))
      : Effect.sync(() => 0)
  )

// GOOD: Pre-compute the Effect structure
// Create the Effect once and reuse it.
const positiveEffect = Effect.sync(() => Math.sqrt(1))
const zeroEffect = Effect.sync(() => 0)

const goodConditional = (items: number[]) =>
  Effect.forEach(items, n =>
    n > 0
      ? Effect.sync(() => Math.sqrt(n))
      : zeroEffect
  )

// ============================================================
// EXAMPLE 5: Record Construction
// ============================================================

// BAD: Building records with spread in loops
const badRecordBuild = (keys: string[]) =>
  pipe(
    keys,
    Array.reduce({} as Record<string, number>, (acc, key, i) => ({
      ...acc,
      [key]: i
    }))
  )

// GOOD: Use Record.fromIterable or direct mutation
const goodRecordBuild = (keys: string[]) =>
  Record.fromIterable(
    keys.map((key, i) => [key, i] as const)
  )

// ============================================================
// Benchmark Helper
// ============================================================

const benchmark = (name: string, fn: () => void, iterations: number = 100000) => {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const elapsed = performance.now() - start
  console.log(`${name}: ${elapsed.toFixed(2)}ms (${iterations} iterations)`)
  return elapsed
}

// Run benchmarks if this file is executed directly
if (require.main === module) {
  console.log("\n=== Object Allocation Benchmarks ===\n")

  // Warm up
  for (let i = 0; i < 100; i++) {
    badAllocation
    goodAllocation
  }

  const badTime = benchmark("BAD  - chained map/filter", () => {
    const result = badAllocation
    // Force evaluation
    if (result.length === 0) console.log("empty")
  }, 10000)

  const goodTime = benchmark("GOOD - single filterMap", () => {
    const result = goodAllocation
    if (result.length === 0) console.log("empty")
  }, 10000)

  const savings = ((badTime - goodTime) / badTime * 100).toFixed(1)
  console.log(`\nImprovement: ${savings}% faster with single-pass approach`)
}
