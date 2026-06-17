import { Effect, Console, Duration, Schedule, Array, Option, Either, Tuple, pipe } from "effect"
import { performance } from "perf_hooks"

// ============================================================
// Production-Grade Performance Benchmark Suite
// ============================================================
//
// This benchmark suite provides:
// 1. Accurate timing with warm-up phases
// 2. Memory usage tracking
// 3. Statistical analysis (avg, p99, p999 latency)
// 4. Formatted report output
// 5. Comparison between implementations

// ============================================================
// Types
// ============================================================

interface BenchmarkResult {
  name: string
  opsPerSecond: number
  avgLatency: number
  medianLatency: number
  p95Latency: number
  p99Latency: number
  p999Latency: number
  minLatency: number
  maxLatency: number
  memoryDelta: number
  totalTime: number
  iterations: number
}

interface BenchmarkConfig {
  name: string
  fn: () => void
  iterations?: number
  warmupIterations?: number
}

// ============================================================
// Benchmark Suite
// ============================================================

class BenchmarkSuite {
  private results: BenchmarkResult[] = []
  private readonly gcEnabled: boolean

  constructor() {
    // Check if we can force garbage collection
    this.gcEnabled = typeof global.gc === "function"
  }

  /**
   * Run a single benchmark with warm-up and measurement phases.
   */
  async run(config: BenchmarkConfig): Promise<BenchmarkResult> {
    const iterations = config.iterations ?? 10000
    const warmupIterations = config.warmupIterations ?? Math.min(iterations, 1000)

    // Phase 1: Warm up
    // This ensures JIT compilation has happened and caches
    // are populated before we start measuring.
    for (let i = 0; i < warmupIterations; i++) {
      config.fn()
    }

    // Phase 2: Force GC if available
    if (this.gcEnabled) {
      global.gc!()
    }

    // Phase 3: Measure memory before
    const heapBefore = process.memoryUsage().heapUsed
    const rssBefore = process.memoryUsage().rss

    // Phase 4: Run benchmark with latency tracking
    const latencies: number[] = new Array(iterations)
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      const opStart = performance.now()
      config.fn()
      latencies[i] = performance.now() - opStart
    }

    const totalTime = performance.now() - start

    // Phase 5: Measure memory after
    const heapAfter = process.memoryUsage().heapUsed
    const rssAfter = process.memoryUsage().rss

    // Phase 6: Statistical analysis
    const sorted = [...latencies].sort((a, b) => a - b)
    const sum = sorted.reduce((a, b) => a + b, 0)

    const result: BenchmarkResult = {
      name: config.name,
      opsPerSecond: Math.round(iterations / (totalTime / 1000)),
      avgLatency: sum / sorted.length,
      medianLatency: sorted[Math.floor(sorted.length * 0.5)],
      p95Latency: sorted[Math.floor(sorted.length * 0.95)],
      p99Latency: sorted[Math.floor(sorted.length * 0.99)],
      p999Latency: sorted[Math.floor(sorted.length * 0.999)],
      minLatency: sorted[0],
      maxLatency: sorted[sorted.length - 1],
      memoryDelta: heapAfter - heapBefore,
      totalTime,
      iterations
    }

    this.results.push(result)
    return result
  }

  /**
   * Run a comparison between two implementations.
   */
  async compare(
    name: string,
    baseline: () => void,
    optimized: () => void,
    iterations: number = 10000
  ): Promise<{ baseline: BenchmarkResult; optimized: BenchmarkResult; improvement: number }> {
    const baselineResult = await this.run({
      name: `${name} (baseline)`,
      fn: baseline,
      iterations
    })

    const optimizedResult = await this.run({
      name: `${name} (optimized)`,
      fn: optimized,
      iterations
    })

    const improvement = ((baselineResult.totalTime - optimizedResult.totalTime) / baselineResult.totalTime) * 100

    return {
      baseline: baselineResult,
      optimized: optimizedResult,
      improvement
    }
  }

  /**
   * Print a formatted report of all benchmark results.
   */
  report(): void {
    console.log("\n" + "=".repeat(100))
    console.log("  Performance Benchmark Report")
    console.log("=".repeat(100))

    // Header
    console.log(
      `${"Name".padEnd(30)} ` +
      `${"Ops/s".padEnd(12)} ` +
      `${"Avg(ms)".padEnd(9)} ` +
      `${"P50(ms)".padEnd(9)} ` +
      `${"P95(ms)".padEnd(9)} ` +
      `${"P99(ms)".padEnd(9)} ` +
      `${"Mem(KB)".padEnd(10)}`
    )
    console.log("-".repeat(100))

    // Sort by ops/sec descending
    const sorted = [...this.results].sort((a, b) => b.opsPerSecond - a.opsPerSecond)

    for (const r of sorted) {
      console.log(
        `${r.name.padEnd(30)} ` +
        `${r.opsPerSecond.toLocaleString().padEnd(12)} ` +
        `${r.avgLatency.toFixed(3).padEnd(9)} ` +
        `${r.medianLatency.toFixed(3).padEnd(9)} ` +
        `${r.p95Latency.toFixed(3).padEnd(9)} ` +
        `${r.p99Latency.toFixed(3).padEnd(9)} ` +
        `${(r.memoryDelta / 1024).toFixed(1).padEnd(10)}`
      )
    }

    console.log("-".repeat(100))
    console.log(`Total benchmarks: ${this.results.length}`)
    console.log("=".repeat(100))
  }

  /**
   * Export results as JSON for further analysis.
   */
  toJSON(): BenchmarkResult[] {
    return [...this.results]
  }

  /**
   * Clear all results.
   */
  clear(): void {
    this.results = []
  }
}

// ============================================================
// Example Usage
// ============================================================

async function main() {
  const suite = new BenchmarkSuite()

  // Benchmark 1: Effect.sync vs Effect.promise
  console.log("\n--- Benchmark 1: Effect.sync vs Effect.promise ---")

  await suite.run({
    name: "Effect.sync (simple)",
    fn: () => Effect.runSync(Effect.sync(() => 1 + 2 + 3)),
    iterations: 50000
  })

  await suite.run({
    name: "Effect.promise (simple)",
    fn: () => Effect.runPromise(Effect.promise(() => Promise.resolve(1 + 2 + 3))),
    iterations: 5000  // Fewer iterations due to async overhead
  })

  // Benchmark 2: Object allocation
  console.log("\n--- Benchmark 2: Object Allocation Patterns ---")

  const items = Array.range(1, 100)

  await suite.run({
    name: "Chained map/filter",
    fn: () => {
      pipe(
        items,
        Array.map(n => ({ value: n })),
        Array.filter(item => item.value % 2 === 0),
        Array.map(item => ({ ...item, doubled: item.value * 2 }))
      )
    },
    iterations: 10000
  })

  await suite.run({
    name: "Single filterMap pass",
    fn: () => {
      pipe(
        items,
        Array.filterMap(n => {
          if (n % 2 !== 0) return Option.none()
          return Option.some({
            value: n,
            doubled: n * 2
          })
        })
      )
    },
    iterations: 10000
  })

  // Print report
  suite.report()
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}
