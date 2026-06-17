import { Effect, pipe, Array, Record, Option, Console, Duration, Schedule } from "effect"

// ============================================================
// Hot Path Optimization Techniques
// ============================================================
//
// A "hot path" is a section of code that executes very
// frequently (e.g., in a tight loop, request handler, or
// event callback). Optimizing hot paths is critical because
// even small inefficiencies are magnified by the frequency
// of execution.
//
// Key principles:
// 1. Minimize allocations in hot paths
// 2. Pre-compute what can be pre-computed
// 3. Avoid unnecessary Effect wrapping
// 4. Cache frequently used values
// 5. Inline simple computations

// ============================================================
// EXAMPLE 1: Effect Structure Pre-computation
// ============================================================

// HOT PATH: Frequently called function
// This function might be called millions of times per second.

// BAD: Creating new Effect on every call
// Each call to badHotPath creates two Effect objects:
// one for the sync wrapper and one for the flatMap result.
const badHotPath = (n: number) =>
  pipe(
    Effect.sync(() => n * 2),
    Effect.flatMap(result => Effect.sync(() => result + 1))
  )

// GOOD: Pre-compute the Effect structure
// A single Effect.sync() call creates exactly one Effect
// object. The computation is inlined into a single thunk.
const goodHotPath = (n: number) => Effect.sync(() => n * 2 + 1)

// ============================================================
// EXAMPLE 2: Caching Effect Instances
// ============================================================

// HOT PATH: Cache frequently used values
// For values that are computed once and used many times,
// caching the Effect instance avoids repeated allocation.

class HotPathCache {
  private cache = new Map<string, Effect.Effect<number>>()

  getOrCompute(key: string, compute: () => number): Effect.Effect<number> {
    const cached = this.cache.get(key)
    if (cached) return cached

    const effect = Effect.sync(compute)
    this.cache.set(key, effect)
    return effect
  }

  // Clear the cache when it grows too large
  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// ============================================================
// EXAMPLE 3: Avoiding Unnecessary Effect Wrapping
// ============================================================

// HOT PATH: Simple arithmetic operations

// BAD: Wrapping simple operations in multiple Effects
// Each Effect.sync() and flatMap() call creates overhead.
const badWrapping = (a: number, b: number) =>
  pipe(
    Effect.sync(() => a),
    Effect.flatMap(aVal =>
      pipe(
        Effect.sync(() => b),
        Effect.map(bVal => aVal + bVal)
      )
    )
  )

// GOOD: Compute first, wrap once
// Do the computation in plain JavaScript, then wrap
// the result in a single Effect.sync().
const goodWrapping = (a: number, b: number) =>
  Effect.sync(() => a + b)

// ============================================================
// EXAMPLE 4: Conditional Effect Selection
// ============================================================

// HOT PATH: Frequently called with different conditions

// BAD: Creating Effects inside the hot loop
const badConditionalEffect = (flag: boolean, value: number) =>
  flag
    ? Effect.sync(() => value * 2)
    : Effect.sync(() => value * 3)

// GOOD: Pre-create the Effect templates
const doubleEffect = (value: number) => Effect.sync(() => value * 2)
const tripleEffect = (value: number) => Effect.sync(() => value * 3)

// Even better: Use a lookup table for known values
const multipliers = new Map<boolean, (v: number) => number>([
  [true, (v) => v * 2],
  [false, (v) => v * 3]
])

const goodConditionalEffect = (flag: boolean, value: number) => {
  const fn = multipliers.get(flag)!
  return Effect.sync(() => fn(value))
}

// ============================================================
// EXAMPLE 5: Inline vs Function Call
// ============================================================

// HOT PATH: Simple transformation

// BAD: Function call overhead in hot path
const transformItem = (x: number) => ({ value: x, squared: x * x })
const badInline = (items: number[]) => items.map(transformItem)

// GOOD: Inline the transformation
// Avoids the function call overhead for simple operations.
const goodInline = (items: number[]) =>
  items.map(x => ({ value: x, squared: x * x }))

// ============================================================
// EXAMPLE 6: String Concatenation
// ============================================================

// HOT PATH: Building strings

// BAD: Using template literals in hot path
// Each template literal creates a new string allocation.
const badStringBuild = (items: Array<{ id: number; name: string }>) =>
  items.map(item => `${item.id}:${item.name}`)

// GOOD: Use array join for batch string building
// Array.join() is often faster than repeated concatenation.
const goodStringBuild = (items: Array<{ id: number; name: string }>) =>
  items.map(item => [item.id, item.name].join(":"))

// ============================================================
// EXAMPLE 7: Avoiding Optional Chaining in Hot Paths
// ============================================================

// HOT PATH: Property access

interface DeepObject {
  a?: {
    b?: {
      c?: number
    }
  }
}

// BAD: Optional chaining in hot path
// Each ?. operator adds a branch check.
const badDeepAccess = (obj: DeepObject) => obj?.a?.b?.c ?? 0

// GOOD: Direct access when structure is guaranteed
// If you know the structure exists, skip the checks.
const goodDeepAccess = (obj: DeepObject) => {
  // Only check at the top level
  if (!obj.a?.b) return 0
  return obj.a.b.c ?? 0
}

// ============================================================
// Benchmark
// ============================================================

const benchmark = (name: string, fn: () => void, iterations: number = 1000000) => {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const elapsed = performance.now() - start
  console.log(`${name}: ${elapsed.toFixed(2)}ms (${iterations.toLocaleString()} iterations)`)
  return elapsed
}

if (require.main === module) {
  console.log("\n=== Hot Path Optimization Benchmarks ===\n")

  // Warm up
  for (let i = 0; i < 10000; i++) {
    badHotPath(i)
    goodHotPath(i)
  }

  const badTime = benchmark("BAD  - multi-Effect chain", () => {
    Effect.runSync(badHotPath(5))
  }, 100000)

  const goodTime = benchmark("GOOD - single Effect", () => {
    Effect.runSync(goodHotPath(5))
  }, 100000)

  const savings = ((badTime - goodTime) / badTime * 100).toFixed(1)
  console.log(`\nImprovement: ${savings}% faster with single Effect`)
}
