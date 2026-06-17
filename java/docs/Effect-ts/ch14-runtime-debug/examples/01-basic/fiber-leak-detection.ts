import { Effect, Fiber, Scope, Console, Duration, Schedule, Queue, Ref, pipe } from "effect"

// ============================================================
// Fiber Leak Detection in Effect-TS
// ============================================================
// This file demonstrates how fibers can leak when not properly
// managed, and how to detect and prevent such leaks using
// Scope, Fiber.dump, and proper lifecycle management.
// ============================================================

// ----------------------------------------------------------
// BAD: Forking fibers without Scope management
// ----------------------------------------------------------
// When a fiber is forked without being attached to a Scope,
// it continues running even after the parent fiber completes.
// This is the primary cause of fiber leaks in Effect-TS.
const leakyFiber = pipe(
  Effect.sync(() => {
    console.log("Fiber started but never managed!")
    return "leaked"
  }),
  Effect.fork  // Forked without Scope - will leak if not joined/interrupted
)

// ----------------------------------------------------------
// GOOD: Using Scope to manage fiber lifecycle
// ----------------------------------------------------------
// By forking within a Scope, the fiber's lifecycle is tied to
// the Scope's lifetime. When the Scope is closed, all fibers
// within it are automatically interrupted.
const managedFiber = (scope: Scope.Scope) => pipe(
  Effect.sync(() => "managed result"),
  Effect.forkIn(scope)  // Fork within Scope - auto cleanup
)

// ----------------------------------------------------------
// Detecting fiber leaks with Fiber.dump
// ----------------------------------------------------------
// Fiber.dump returns a snapshot of all active fibers in the
// runtime system. By comparing snapshots over time, we can
// detect fibers that persist (potential leaks).
const detectLeaks = pipe(
  Fiber.dump,
  Effect.flatMap(fibers => {
    console.log(`Active fibers: ${fibers.length}`)
    fibers.forEach(f => {
      console.log(`  Fiber ${f.id}: ${f.status}`)
    })
    return Effect.sync(() => fibers)
  })
)

// ----------------------------------------------------------
// Proper cleanup with Scope
// ----------------------------------------------------------
// The recommended pattern: create a Scope, fork fibers into it,
// do your work, then let the Scope close automatically.
const properScopeUsage = Effect.scoped(
  Effect.gen(function*(_) {
    const scope = yield* _(Scope.make())
    const fiber = yield* _(managedFiber(scope))
    // Work with fiber...
    yield* _(Fiber.join(fiber))
    // Scope auto-closes, cleaning up all fibers
  })
)

// ----------------------------------------------------------
// Simulating a fiber leak scenario
// ----------------------------------------------------------
const simulateLeak = Effect.gen(function*(_) {
  console.log("\n=== Simulating Fiber Leak ===")

  // Take initial snapshot
  const before = yield* _(Fiber.dump)
  console.log(`Fibers before: ${before.length}`)

  // Fork a fiber that will leak (not managed by Scope)
  const leaked = yield* _(
    pipe(
      Effect.sync(() => {
        console.log("Leaked fiber running...")
        return "leaked"
      }),
      Effect.fork
    )
  )

  // Fork a properly managed fiber
  const scope = yield* _(Scope.make())
  const managed = yield* _(
    pipe(
      Effect.sync(() => {
        console.log("Managed fiber running...")
        return "managed"
      }),
      Effect.forkIn(scope)
    )
  )

  // Let them run
  yield* _(Effect.sleep("100 millis"))

  // Take snapshot after
  const after = yield* _(Fiber.dump)
  console.log(`Fibers after: ${after.length}`)

  // The managed fiber will be cleaned up when scope closes
  yield* _(Scope.close(scope, Effect.void))

  // After cleanup
  const cleaned = yield* _(Fiber.dump)
  console.log(`Fibers after cleanup: ${cleaned.length}`)

  // The leaked fiber is still running!
  console.log("Leaked fiber still active (potential leak)")

  // Clean up the leaked fiber
  yield* _(Fiber.interrupt(leaked))
})

// ----------------------------------------------------------
// Fiber leak detection with periodic monitoring
// ----------------------------------------------------------
const monitorFibers = Effect.gen(function*(_) {
  console.log("\n=== Fiber Monitoring ===")

  const checkFibers = pipe(
    Fiber.dump,
    Effect.flatMap(fibers => {
      const running = fibers.filter(f => f.status === "running").length
      const suspended = fibers.filter(f => f.status === "suspended").length
      const done = fibers.filter(f => f.status === "done").length

      console.log(
        `Fiber stats - Running: ${running}, Suspended: ${suspended}, Done: ${done}, Total: ${fibers.length}`
      )

      if (fibers.length > 100) {
        console.warn("WARNING: High fiber count detected!")
      }

      return Effect.sync(() => fibers.length)
    })
  )

  // Run monitoring 3 times with 200ms intervals
  yield* _(
    checkFibers,
    Effect.repeat(Schedule.fixed("200 millis")),
    Effect.take(3)
  )
})

// ----------------------------------------------------------
// Running the examples
// ----------------------------------------------------------
Effect.runPromise(simulateLeak).then(() => {
  console.log("\nLeak simulation complete")
})

Effect.runPromise(monitorFibers).then(() => {
  console.log("\nMonitoring complete")
})
