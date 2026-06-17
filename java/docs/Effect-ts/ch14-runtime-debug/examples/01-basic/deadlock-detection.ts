import { Effect, Semaphore, Ref, Console, Duration, Fiber, Queue, pipe } from "effect"

// ============================================================
// Deadlock Detection in Effect-TS
// ============================================================
// This file demonstrates how deadlocks occur with Semaphore
// and Ref, and how to detect and prevent them using consistent
// lock ordering, timeouts, and proper error handling.
// ============================================================

// ----------------------------------------------------------
// BAD: Incorrect lock ordering causing deadlock
// ----------------------------------------------------------
// Deadlock occurs when two or more fibers each hold a lock
// and wait for the other to release. The classic example is
// lock ordering inversion.
const semA = Semaphore.make(1)
const semB = Semaphore.make(1)

const deadlockExample = Effect.gen(function*(_) {
  console.log("\n=== Deadlock Example ===")

  // Fiber 1: locks A then B
  const fiber1 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      console.log("Fiber 1: acquiring semaphore A")
      yield* _(semA.take)
      console.log("Fiber 1: acquired A, sleeping...")
      yield* _(Effect.sleep("100 millis"))
      console.log("Fiber 1: acquiring semaphore B")
      yield* _(semB.take)  // Deadlock! Fiber 2 holds B
      console.log("Fiber 1: acquired B (should not happen)")
      yield* _(semB.release)
      yield* _(semA.release)
    })
  ))

  // Fiber 2: locks B then A
  const fiber2 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      console.log("Fiber 2: acquiring semaphore B")
      yield* _(semB.take)
      console.log("Fiber 2: acquired B, sleeping...")
      yield* _(Effect.sleep("100 millis"))
      console.log("Fiber 2: acquiring semaphore A")
      yield* _(semA.take)  // Deadlock! Fiber 1 holds A
      console.log("Fiber 2: acquired A (should not happen)")
      yield* _(semA.release)
      yield* _(semB.release)
    })
  ))

  // Race with timeout to detect deadlock
  yield* _(
    Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]),
    Effect.timeout("1 seconds"),
    Effect.catchAll(error => Console.log(`Deadlock detected: ${error}`))
  )

  console.log("Deadlock example completed (with timeout)")
})

// ----------------------------------------------------------
// GOOD: Consistent lock ordering
// ----------------------------------------------------------
// The fix is simple: always acquire locks in the same order.
// This eliminates the circular wait condition.
const safeLocking = Effect.gen(function*(_) {
  console.log("\n=== Safe Locking Example ===")

  const fiber1 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      console.log("Fiber 1: acquiring A then B")
      yield* _(semA.take)
      yield* _(Effect.sleep("50 millis"))
      yield* _(semB.take)  // Always A then B
      console.log("Fiber 1: acquired both locks, working...")
      yield* _(Effect.sleep("50 millis"))
      yield* _(semB.release)
      yield* _(semA.release)
      console.log("Fiber 1: done")
    })
  ))

  const fiber2 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      console.log("Fiber 2: acquiring A then B")
      yield* _(semA.take)
      yield* _(Effect.sleep("50 millis"))
      yield* _(semB.take)  // Same order: A then B
      console.log("Fiber 2: acquired both locks, working...")
      yield* _(Effect.sleep("50 millis"))
      yield* _(semB.release)
      yield* _(semA.release)
      console.log("Fiber 2: done")
    })
  ))

  yield* _(Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]))
  console.log("Safe locking completed successfully")
})

// ----------------------------------------------------------
// Deadlock detection with Ref-based locks
// ----------------------------------------------------------
// Ref can also be used to implement custom locks, and the
// same deadlock risks apply.
const createLock = () => Ref.make(false)

const acquire = (lock: Ref.Ref<boolean>) =>
  Ref.modify(lock, (locked) =>
    locked
      ? [false as const, true as const]  // Failed to acquire
      : [true as const, false as const]  // Acquired successfully
  )

const release = (lock: Ref.Ref<boolean>) =>
  Ref.set(lock, false)

const refDeadlockExample = Effect.gen(function*(_) {
  console.log("\n=== Ref-based Deadlock Example ===")

  const lockA = yield* _(createLock())
  const lockB = yield* _(createLock())

  const fiber1 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      // Acquire lock A
      let acquired = false
      while (!acquired) {
        const result = yield* _(acquire(lockA))
        acquired = result[0]
        if (!acquired) yield* _(Effect.sleep("10 millis"))
      }
      console.log("Fiber 1: acquired lock A")

      yield* _(Effect.sleep("100 millis"))

      // Try to acquire lock B
      acquired = false
      while (!acquired) {
        const result = yield* _(acquire(lockB))
        acquired = result[0]
        if (!acquired) yield* _(Effect.sleep("10 millis"))
      }
      console.log("Fiber 1: acquired lock B")

      yield* _(release(lockB))
      yield* _(release(lockA))
    })
  ))

  const fiber2 = yield* _(Effect.fork(
    Effect.gen(function*(_) {
      // Acquire lock B
      let acquired = false
      while (!acquired) {
        const result = yield* _(acquire(lockB))
        acquired = result[0]
        if (!acquired) yield* _(Effect.sleep("10 millis"))
      }
      console.log("Fiber 2: acquired lock B")

      yield* _(Effect.sleep("100 millis"))

      // Try to acquire lock A
      acquired = false
      while (!acquired) {
        const result = yield* _(acquire(lockA))
        acquired = result[0]
        if (!acquired) yield* _(Effect.sleep("10 millis"))
      }
      console.log("Fiber 2: acquired lock A")

      yield* _(release(lockA))
      yield* _(release(lockB))
    })
  ))

  // Timeout to detect deadlock
  yield* _(
    Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]),
    Effect.timeout("2 seconds"),
    Effect.catchAll(error => Console.log(`Ref deadlock detected: ${error}`))
  )
})

// ----------------------------------------------------------
// Deadlock detection with timeout wrapper
// ----------------------------------------------------------
const withDeadlockDetection = <A, E>(
  effect: Effect.Effect<A, E>,
  timeout: Duration.Duration = "5 seconds",
  label: string = "operation"
): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.timeout(timeout),
    Effect.catchAll((error) =>
      pipe(
        Console.log(`[DEADLOCK DETECTED] ${label}: ${error}`),
        Effect.flatMap(() => Effect.fail(error as E))
      )
    )
  )

const safeOperation = withDeadlockDetection(
  safeLocking,
  "2 seconds",
  "safe-lock-example"
)

// ----------------------------------------------------------
// Running the examples
// ----------------------------------------------------------
Effect.runPromise(deadlockExample).then(() => {
  console.log("\nDeadlock example finished")
})

Effect.runPromise(safeLocking).then(() => {
  console.log("\nSafe locking finished")
})

Effect.runPromise(refDeadlockExample).then(() => {
  console.log("\nRef deadlock example finished")
})
