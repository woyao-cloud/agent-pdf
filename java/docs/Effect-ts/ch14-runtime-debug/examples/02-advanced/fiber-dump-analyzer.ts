import { Effect, Fiber, Console, Duration, Schedule, Queue, Ref, pipe } from "effect"

// ============================================================
// Advanced Fiber Dump Analyzer
// ============================================================
// This tool provides comprehensive fiber dump analysis
// capabilities, including snapshot comparison, leak detection,
// status distribution reporting, and trend analysis.
// ============================================================

// ----------------------------------------------------------
// Fiber Dump Analyzer Class
// ----------------------------------------------------------
// Maintains a history of fiber snapshots and provides
// analysis methods to detect leaks and anomalies.
class FiberDumpAnalyzer {
  private snapshots: Array<Fiber.FiberDump> = []

  /**
   * Take a snapshot of all active fibers
   */
  async takeSnapshot(): Promise<void> {
    const dump = await Effect.runPromise(Fiber.dump)
    this.snapshots.push(dump)
    console.log(`Snapshot taken: ${dump.length} active fibers`)
  }

  /**
   * Analyze potential fiber leaks by comparing consecutive snapshots
   */
  analyzeLeaks(): void {
    if (this.snapshots.length < 2) {
      console.log("Need at least 2 snapshots for leak analysis")
      return
    }

    const prev = this.snapshots[this.snapshots.length - 2]
    const curr = this.snapshots[this.snapshots.length - 1]

    // Find fibers that persist between snapshots
    const prevIds = new Set(prev.map(f => f.id))
    const persistentFibers = curr.filter(f => prevIds.has(f.id))

    console.log(`\n=== Leak Analysis ===`)
    console.log(`Previous snapshot: ${prev.length} fibers`)
    console.log(`Current snapshot: ${curr.length} fibers`)
    console.log(`Persistent fibers (potential leaks): ${persistentFibers.length}`)

    if (persistentFibers.length > 0) {
      console.log("\nPersistent fiber details:")
      persistentFibers.forEach(f => {
        console.log(`  Fiber ${f.id}: ${f.status} - ${f.location}`)
      })
    }

    // Check for fiber count growth
    const growth = curr.length - prev.length
    if (growth > 0) {
      console.log(`\nWARNING: Fiber count increased by ${growth}`)
    }
  }

  /**
   * Generate a comprehensive fiber status report
   */
  report(): void {
    if (this.snapshots.length === 0) {
      console.log("No snapshots available")
      return
    }

    const latest = this.snapshots[this.snapshots.length - 1]
    console.log("\n=== Fiber Dump Report ===")

    // Status distribution
    const byStatus = new Map<string, number>()
    latest.forEach(f => {
      byStatus.set(f.status, (byStatus.get(f.status) || 0) + 1)
    })

    console.log("\nStatus Distribution:")
    byStatus.forEach((count, status) => {
      const pct = ((count / latest.length) * 100).toFixed(1)
      console.log(`  ${status}: ${count} (${pct}%)`)
    })

    // Location summary
    const byLocation = new Map<string, number>()
    latest.forEach(f => {
      const loc = f.location || "unknown"
      byLocation.set(loc, (byLocation.get(loc) || 0) + 1)
    })

    console.log("\nTop Locations:")
    const sorted = [...byLocation.entries()].sort((a, b) => b[1] - a[1])
    sorted.slice(0, 5).forEach(([loc, count]) => {
      console.log(`  ${loc}: ${count}`)
    })

    // Total
    console.log(`\nTotal fibers: ${latest.length}`)
  }

  /**
   * Analyze fiber count trend over time
   */
  trendAnalysis(): void {
    if (this.snapshots.length < 3) {
      console.log("Need at least 3 snapshots for trend analysis")
      return
    }

    console.log("\n=== Trend Analysis ===")
    this.snapshots.forEach((snapshot, i) => {
      console.log(`  Snapshot ${i + 1}: ${snapshot.length} fibers`)
    })

    // Calculate growth rate
    const first = this.snapshots[0].length
    const last = this.snapshots[this.snapshots.length - 1].length
    const totalGrowth = last - first
    const avgGrowth = totalGrowth / (this.snapshots.length - 1)

    console.log(`\nTotal growth: ${totalGrowth > 0 ? "+" : ""}${totalGrowth}`)
    console.log(`Average growth per snapshot: ${avgGrowth.toFixed(2)}`)

    if (avgGrowth > 5) {
      console.warn("WARNING: Sustained fiber growth detected!")
    }
  }

  /**
   * Get the latest snapshot
   */
  getLatestSnapshot(): Fiber.FiberDump {
    return this.snapshots[this.snapshots.length - 1] || []
  }

  /**
   * Get snapshot count
   */
  getSnapshotCount(): number {
    return this.snapshots.length
  }
}

// ----------------------------------------------------------
// Usage Example
// ----------------------------------------------------------
const demonstrateAnalyzer = Effect.gen(function*(_) {
  console.log("=== Fiber Dump Analyzer Demo ===\n")

  const analyzer = new FiberDumpAnalyzer()

  // Take initial snapshot
  yield* _(Effect.fromPromise(async () => {
    await analyzer.takeSnapshot()
  }))

  // Fork some fibers to simulate activity
  const fibers: Array<Fiber.Fiber<void>> = []

  for (let i = 0; i < 3; i++) {
    const fiber = yield* _(Effect.fork(
      Effect.gen(function*(_) {
        yield* _(Effect.sleep("500 millis"))
        console.log(`Worker fiber ${i} completed`)
      })
    ))
    fibers.push(fiber)
  }

  // Take another snapshot while fibers are running
  yield* _(Effect.sleep("100 millis"))
  yield* _(Effect.fromPromise(async () => {
    await analyzer.takeSnapshot()
  }))

  // Analyze
  analyzer.analyzeLeaks()
  analyzer.report()

  // Wait for fibers to complete
  yield* _(Effect.all(fibers.map(f => Fiber.join(f))))

  // Final snapshot
  yield* _(Effect.fromPromise(async () => {
    await analyzer.takeSnapshot()
  }))

  analyzer.trendAnalysis()
})

// ----------------------------------------------------------
// Continuous Monitoring Example
// ----------------------------------------------------------
const continuousMonitoring = Effect.gen(function*(_) {
  console.log("\n=== Continuous Monitoring ===\n")

  const analyzer = new FiberDumpAnalyzer()

  const monitor = pipe(
    Effect.fromPromise(async () => {
      await analyzer.takeSnapshot()
      analyzer.analyzeLeaks()
      analyzer.report()
    }),
    Effect.repeat(Schedule.fixed("1 seconds")),
    Effect.take(5)  // Run 5 times
  )

  yield* _(monitor)
  console.log("\nContinuous monitoring completed")
})

// ----------------------------------------------------------
// Run examples
// ----------------------------------------------------------
Effect.runPromise(demonstrateAnalyzer).then(() => {
  console.log("\nAnalyzer demo completed")
})

Effect.runPromise(continuousMonitoring).then(() => {
  console.log("\nContinuous monitoring completed")
})
