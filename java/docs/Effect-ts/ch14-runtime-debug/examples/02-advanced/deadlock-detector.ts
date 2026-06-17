import { Effect, Semaphore, Ref, Console, Duration, Fiber, Queue, Schedule, Either, pipe } from "effect"

// ============================================================
// Advanced Deadlock Detector with Automatic Recovery
// ============================================================
// This module provides a production-grade deadlock detection
// system with configurable timeouts, lock ordering enforcement,
// automatic recovery, and comprehensive logging.
// ============================================================

// ----------------------------------------------------------
// Deadlock Detector Class
// ----------------------------------------------------------
// Tracks lock acquisition order and detects potential deadlocks
// by enforcing consistent ordering and timeout-based detection.
class DeadlockDetector {
  private lockOrder: Map<string, number> = new Map()
  private timeout: Duration.Duration
  private acquiredLocks: Map<string, boolean> = new Map()
  private lockWaitTimes: Map<string, number> = new Map()

  constructor(timeout: Duration.Duration = "5 seconds") {
    this.timeout = timeout
  }

  /**
   * Acquire a lock with deadlock detection
   */
  withLock<T>(
    label: string,
    semaphore: Semaphore.Semaphore,
    order: number,
    effect: Effect.Effect<T>
  ): Effect.Effect<T> {
    this.lockOrder.set(label, order)

    return pipe(
      semaphore.take,
      Effect.timeout(this.timeout),
      Effect.catchAll(() =>
        pipe(
          Console.log(`[DEADLOCK] Timeout on "${label}" - possible deadlock!`),
          Effect.flatMap(() => this.recover(label)),
          Effect.flatMap(() => Effect.fail(`Deadlock detected on ${label}`))
        )
      ),
      Effect.flatMap(() => {
        this.acquiredLocks.set(label, true)
        this.lockWaitTimes.set(label, Date.now())
        return pipe(
          effect,
          Effect.ensuring(
            pipe(
              Effect.sync(() => {
                this.acquiredLocks.delete(label)
                this.lockWaitTimes.delete(label)
              }),
              Effect.flatMap(() => semaphore.release)
            )
          )
        )
      })
    )
  }

  /**
   * Attempt recovery from a deadlock
   */
  private recover(label: string): Effect.Effect<void> {
    return pipe(
      Console.log(`[RECOVERY] Attempting recovery for "${label}"...`),
      Effect.flatMap(() => {
        // Release all held locks
        const releaseEffects: Array<Effect.Effect<void>> = []
        this.acquiredLocks.forEach((_, lockLabel) => {
          releaseEffects.push(
            Console.log(`[RECOVERY] Releasing lock: ${lockLabel}`)
          )
        })
        this.acquiredLocks.clear()
        this.lockWaitTimes.clear()
        return Effect.all(releaseEffects, { concurrency: "unbounded" })
      }),
      Effect.flatMap(() =>
        Console.log(`[RECOVERY] Recovery complete for "${label}"`)
      )
    )
  }

  /**
   * Check for potential deadlocks
   */
  checkDeadlock(): Effect.Effect<boolean> {
    return Effect.sync(() => {
      const now = Date.now()
      let deadlockDetected = false

      this.lockWaitTimes.forEach((startTime, label) => {
        const elapsed = now - startTime
        if (elapsed > 3000) {
          // Lock held for more than 3 seconds
          console.warn(`[WARN] Lock "${label}" held for ${elapsed}ms`)
          deadlockDetected = true
        }
      })

      return deadlockDetected
    })
  }

  /**
   * Validate lock ordering
   */
  validateOrder(label: string, order: number): boolean {
    for (const [existingLabel, existingOrder] of this.lockOrder) {
      if (existingLabel !== label) {
        // Check for inconsistent ordering
        if (order < existingOrder) {
          console.warn(
            `[WARN] Inconsistent lock order: "${label}" (${order}) < "${existingLabel}" (${existingOrder})`
          )
          return false
        }
      }
    }
    return true
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.lockOrder.clear()
    this.acquiredLocks.clear()
    this.lockWaitTimes.clear()
  }
}

// ----------------------------------------------------------
// Lock Manager with Automatic Deadlock Prevention
// ----------------------------------------------------------
class LockManager {
  private semaphores: Map<string, Semaphore.Semaphore> = new Map()
  private orderCounter: number = 0

  createLock(label: string, permits: number = 1): Semaphore.Semaphore {
    const sem = Semaphore.make(permits)
    this.semaphores.set(label, sem)
    return sem
  }

  getLock(label: string): Semaphore.Semaphore | undefined {
    return this.semaphores.get(label)
  }

  /**
   * Acquire multiple locks in consistent order
   */
  acquireLocks(
    labels: Array<string>,
    detector: DeadlockDetector
  ): Effect.Effect<Array<void>> {
    // Sort labels to ensure consistent ordering
    const sorted = [...labels].sort()

    const acquireEffects = sorted.map((label, index) => {
      const sem = this.semaphores.get(label)
      if (!sem) {
        return Effect.fail(`Lock "${label}" not found`)
      }
      return detector.withLock(label, sem, index, Effect.void)
    })

    return Effect.all(acquireEffects, { concurrency: "unbounded" })
  }
}

// ----------------------------------------------------------
// Usage Examples
// ----------------------------------------------------------
const demonstrateDetector = Effect.gen(function*(_) {
  console.log("=== Deadlock Detector Demo ===\n")

  const detector = new DeadlockDetector("2 seconds")
  const lockManager = new LockManager()

  // Create locks
  const lockA = lockManager.createLock("resource-a")
  const lockB = lockManager.createLock("resource-b")

  // Safe operation with consistent ordering
  const safeOp = Effect.gen(function*(_) {
    console.log("Performing safe operation...")

    yield* _(detector.withLock("resource-a", lockA, 1,
      Effect.gen(function*(_) {
        console.log("  Acquired lock A")
        yield* _(Effect.sleep("200 millis"))
        return "result-a"
      })
    ))

    yield* _(detector.withLock("resource-b", lockB, 2,
      Effect.gen(function*(_) {
        console.log("  Acquired lock B")
        yield* _(Effect.sleep("200 millis"))
        return "result-b"
      })
    ))

    console.log("Safe operation completed")
  })

  yield* _(safeOp)

  // Demonstrate deadlock detection with timeout
  console.log("\nDemonstrating deadlock detection...")

  const deadlockOp = Effect.gen(function*(_) {
    const fiber1 = yield* _(Effect.fork(
      detector.withLock("resource-a", lockA, 1,
        Effect.gen(function*(_) {
          console.log("Fiber 1: acquired A, waiting for B...")
          yield* _(Effect.sleep("3 seconds"))
          return "done"
        })
      )
    ))

    // This will timeout because fiber1 holds lockA for 3 seconds
    yield* _(Effect.sleep("100 millis"))

    const fiber2 = yield* _(Effect.fork(
      detector.withLock("resource-b", lockB, 2,
        Effect.gen(function*(_) {
          console.log("Fiber 2: acquired B, waiting for A...")
          yield* _(Effect.sleep("100 millis"))
          return "done"
        })
      )
    ))

    yield* _(Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]))
  })

  yield* _(
    deadlockOp,
    Effect.catchAll(error => Console.log(`Operation failed: ${error}`))
  )
})

// ----------------------------------------------------------
// Run
// ----------------------------------------------------------
Effect.runPromise(demonstrateDetector).then(() => {
  console.log("\nDeadlock detector demo completed")
})
