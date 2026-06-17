import { Effect, Fiber, Console, Duration, Schedule, Queue, Ref, pipe } from "effect"

// ============================================================
// Production-Grade Memory Leak Monitoring System
// ============================================================
// This module provides comprehensive memory leak monitoring
// for Effect-TS applications in production environments.
// It tracks fiber counts, heap usage, and provides trend
// analysis to detect leaks before they cause outages.
// ============================================================

// ----------------------------------------------------------
// Memory Leak Monitor Class
// ----------------------------------------------------------
class MemoryLeakMonitor {
  private fiberCount: number = 0
  private heapUsed: number = 0
  private snapshotHistory: Array<{ time: number; fibers: number; heap: number }> = []
  private alertThresholds = {
    fiberGrowth: 10,     // Max fiber growth per sample
    heapGrowth: 50,      // Max heap growth in MB per sample
    maxFibers: 1000,     // Absolute max fiber count
    maxHeap: 500         // Absolute max heap in MB
  }

  /**
   * Main monitoring loop
   */
  monitor(): Effect.Effect<void> {
    const check = pipe(
      Fiber.dump,
      Effect.flatMap(fibers => {
        const heap = process.memoryUsage().heapUsed / 1024 / 1024
        this.fiberCount = fibers.length
        this.heapUsed = heap
        this.snapshotHistory.push({
          time: Date.now(),
          fibers: fibers.length,
          heap
        })

        // Trim history to last 100 entries
        if (this.snapshotHistory.length > 100) {
          this.snapshotHistory = this.snapshotHistory.slice(-100)
        }

        return this.logStatus(fibers)
      })
    )

    return pipe(
      check,
      Effect.repeat(Schedule.fixed("10 seconds")),
      Effect.forever
    )
  }

  /**
   * Log current status and check thresholds
   */
  private logStatus(fibers: Fiber.FiberDump): Effect.Effect<void> {
    const heapMB = this.heapUsed.toFixed(2)
    const status = `[MONITOR] Fibers: ${this.fiberCount}, Heap: ${heapMB}MB`

    return pipe(
      Console.log(status),
      Effect.flatMap(() => this.checkAlerts(fibers))
    )
  }

  /**
   * Check alert thresholds
   */
  private checkAlerts(fibers: Fiber.FiberDump): Effect.Effect<void> {
    const alerts: Array<string> = []

    // Check absolute thresholds
    if (this.fiberCount > this.alertThresholds.maxFibers) {
      alerts.push(`CRITICAL: Fiber count (${this.fiberCount}) exceeds max (${this.alertThresholds.maxFibers})`)
    }

    if (this.heapUsed > this.alertThresholds.maxHeap) {
      alerts.push(`CRITICAL: Heap usage (${this.heapUsed.toFixed(2)}MB) exceeds max (${this.alertThresholds.maxHeap}MB)`)
    }

    // Check trends
    if (this.snapshotHistory.length >= 5) {
      const recent = this.snapshotHistory.slice(-5)
      const fiberTrend = recent[recent.length - 1].fibers - recent[0].fibers
      const heapTrend = recent[recent.length - 1].heap - recent[0].heap

      if (fiberTrend > this.alertThresholds.fiberGrowth) {
        alerts.push(`WARNING: Fiber leak detected: +${fiberTrend} fibers in 5 samples`)
      }

      if (heapTrend > this.alertThresholds.heapGrowth) {
        alerts.push(`WARNING: Memory leak detected: +${heapTrend.toFixed(2)}MB in 5 samples`)
      }
    }

    // Log alerts
    if (alerts.length > 0) {
      return pipe(
        Console.error("=== ALERTS ==="),
        Effect.flatMap(() =>
          Effect.all(alerts.map(a => Console.error(a)))
        )
      )
    }

    return Effect.void
  }

  /**
   * Analyze memory trend
   */
  analyzeTrend(): void {
    if (this.snapshotHistory.length < 5) {
      console.log("Insufficient data for trend analysis (need 5+ samples)")
      return
    }

    const recent = this.snapshotHistory.slice(-5)
    const fiberTrend = recent[recent.length - 1].fibers - recent[0].fibers
    const heapTrend = recent[recent.length - 1].heap - recent[0].heap

    console.log("\n=== Trend Analysis ===")
    console.log(`Samples analyzed: ${this.snapshotHistory.length}`)
    console.log(`Fiber trend: ${fiberTrend > 0 ? "+" : ""}${fiberTrend}`)
    console.log(`Heap trend: ${heapTrend > 0 ? "+" : ""}${heapTrend.toFixed(2)}MB`)

    if (fiberTrend > 10) {
      console.warn(`Fiber leak detected: +${fiberTrend} in 5 samples`)
    }
    if (heapTrend > 50) {
      console.warn(`Memory leak detected: +${heapTrend.toFixed(2)}MB in 5 samples`)
    }

    // Calculate growth rate
    const timeSpan = recent[recent.length - 1].time - recent[0].time
    const growthRate = timeSpan > 0 ? (heapTrend / timeSpan) * 1000 : 0
    console.log(`Heap growth rate: ${growthRate.toFixed(4)}MB/s`)

    if (growthRate > 1) {
      console.error(`CRITICAL: Rapid memory growth (${growthRate.toFixed(4)}MB/s)`)
    }
  }

  /**
   * Generate a comprehensive report
   */
  generateReport(): void {
    console.log("\n=== Memory Leak Monitor Report ===")
    console.log(`Total snapshots: ${this.snapshotHistory.length}`)
    console.log(`Current fibers: ${this.fiberCount}`)
    console.log(`Current heap: ${this.heapUsed.toFixed(2)}MB`)

    if (this.snapshotHistory.length > 0) {
      const minHeap = Math.min(...this.snapshotHistory.map(s => s.heap))
      const maxHeap = Math.max(...this.snapshotHistory.map(s => s.heap))
      const avgHeap = this.snapshotHistory.reduce((a, s) => a + s.heap, 0) / this.snapshotHistory.length

      console.log(`Min heap: ${minHeap.toFixed(2)}MB`)
      console.log(`Max heap: ${maxHeap.toFixed(2)}MB`)
      console.log(`Avg heap: ${avgHeap.toFixed(2)}MB`)
    }

    this.analyzeTrend()
  }

  /**
   * Reset monitoring state
   */
  reset(): void {
    this.fiberCount = 0
    this.heapUsed = 0
    this.snapshotHistory = []
    console.log("Monitor state reset")
  }
}

// ----------------------------------------------------------
// Heap Snapshot Manager
// ----------------------------------------------------------
class HeapSnapshotManager {
  private snapshots: Array<{ time: number; heapUsed: number; heapTotal: number; external: number }> = []

  takeSnapshot(): Effect.Effect<void> {
    return Effect.sync(() => {
      const mem = process.memoryUsage()
      this.snapshots.push({
        time: Date.now(),
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external
      })
      console.log(
        `Heap snapshot: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB used, ` +
        `${(mem.heapTotal / 1024 / 1024).toFixed(2)}MB total`
      )
    })
  }

  compareSnapshots(): void {
    if (this.snapshots.length < 2) {
      console.log("Need at least 2 snapshots for comparison")
      return
    }

    const prev = this.snapshots[this.snapshots.length - 2]
    const curr = this.snapshots[this.snapshots.length - 1]

    const heapDiff = curr.heapUsed - prev.heapUsed
    const timeDiff = curr.time - prev.time

    console.log("\n=== Heap Comparison ===")
    console.log(`Heap change: ${heapDiff > 0 ? "+" : ""}${(heapDiff / 1024 / 1024).toFixed(2)}MB`)
    console.log(`Time span: ${(timeDiff / 1000).toFixed(1)}s`)

    if (timeDiff > 0) {
      const rate = (heapDiff / timeDiff) * 1000
      console.log(`Allocation rate: ${(rate / 1024 / 1024).toFixed(4)}MB/s`)
    }
  }
}

// ----------------------------------------------------------
// Usage Example
// ----------------------------------------------------------
const demonstrateMonitor = Effect.gen(function*(_) {
  console.log("=== Memory Leak Monitor Demo ===\n")

  const monitor = new MemoryLeakMonitor()
  const heapManager = new HeapSnapshotManager()

  // Take initial heap snapshot
  yield* _(heapManager.takeSnapshot())

  // Simulate some fiber activity
  const fibers: Array<Fiber.Fiber<void>> = []
  for (let i = 0; i < 5; i++) {
    const fiber = yield* _(Effect.fork(
      Effect.gen(function*(_) {
        yield* _(Effect.sleep("200 millis"))
        // Allocate some memory
        const arr = new Array(1000).fill("data")
        console.log(`Fiber ${i} allocated memory`)
      })
    ))
    fibers.push(fiber)
  }

  // Wait a bit
  yield* _(Effect.sleep("500 millis"))

  // Take another heap snapshot
  yield* _(heapManager.takeSnapshot())
  heapManager.compareSnapshots()

  // Wait for fibers
  yield* _(Effect.all(fibers.map(f => Fiber.join(f))))

  // Final heap snapshot
  yield* _(heapManager.takeSnapshot())

  // Generate report
  monitor.generateReport()
})

// ----------------------------------------------------------
// Run
// ----------------------------------------------------------
Effect.runPromise(demonstrateMonitor).then(() => {
  console.log("\nMemory leak monitor demo completed")
})
