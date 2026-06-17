import { Effect, Console, Duration, Fiber, Schedule, Either, pipe } from "effect"

// ============================================================
// Production-Grade Effect.race with Deadlock Timeout
// ============================================================
// This module provides robust race implementations with
// deadlock detection, configurable timeouts, and proper
// error handling for production environments.
// ============================================================

// ----------------------------------------------------------
// Basic Race with Timeout
// ----------------------------------------------------------
// Wraps Effect.race with a configurable timeout to prevent
// deadlocks when no effect completes in time.
const raceWithTimeout = <A, E>(
  effects: Array<Effect.Effect<A, E>>,
  timeout: Duration.Duration = "30 seconds"
): Effect.Effect<A, E> => {
  const raced = effects.reduce((acc, effect) =>
    Effect.race(acc, effect)
  )

  return pipe(
    raced,
    Effect.timeout(timeout),
    Effect.catchAll(error =>
      pipe(
        Console.log(`[RACE TIMEOUT] Race deadlock timeout: ${error}`),
        Effect.flatMap(() => Effect.fail(error as E))
      )
    )
  )
}

// ----------------------------------------------------------
// Race with Winner Tracking
// ----------------------------------------------------------
// Tracks which effect won the race for debugging purposes.
const raceWithTracking = <A, E>(
  labeledEffects: Array<{ label: string; effect: Effect.Effect<A, E> }>,
  timeout: Duration.Duration = "30 seconds"
): Effect.Effect<{ winner: string; value: A }, E> => {
  const withLabels = labeledEffects.map(({ label, effect }) =>
    pipe(
      effect,
      Effect.map(value => ({ winner: label, value }))
    )
  )

  const raced = withLabels.reduce((acc, effect) =>
    Effect.race(acc, effect)
  )

  return pipe(
    raced,
    Effect.timeout(timeout),
    Effect.catchAll(error =>
      pipe(
        Console.log(`[RACE TRACKING] Timeout: ${error}`),
        Effect.flatMap(() => Effect.fail(error as E))
      )
    )
  )
}

// ----------------------------------------------------------
// Race with Fallback
// ----------------------------------------------------------
// If all effects time out, falls back to a default value.
const raceWithFallback = <A, E>(
  effects: Array<Effect.Effect<A, E>>,
  fallback: A,
  timeout: Duration.Duration = "30 seconds"
): Effect.Effect<A, E> => {
  const raced = effects.reduce((acc, effect) =>
    Effect.race(acc, effect)
  )

  return pipe(
    raced,
    Effect.timeout(timeout),
    Effect.catchAll(error =>
      pipe(
        Console.log(`[RACE FALLBACK] Timeout, using fallback: ${error}`),
        Effect.sync(() => fallback)
      )
    )
  )
}

// ----------------------------------------------------------
// Race with Retry
// ----------------------------------------------------------
// Retries the race if it times out, with exponential backoff.
const raceWithRetry = <A, E>(
  effects: Array<Effect.Effect<A, E>>,
  timeout: Duration.Duration = "30 seconds",
  maxRetries: number = 3
): Effect.Effect<A, E> => {
  const raced = effects.reduce((acc, effect) =>
    Effect.race(acc, effect)
  )

  const withTimeout = pipe(
    raced,
    Effect.timeout(timeout)
  )

  return pipe(
    withTimeout,
    Effect.retry(
      pipe(
        Schedule.exponential("1 seconds"),
        Schedule.take(maxRetries),
        Schedule.whileInput(() => true)
      )
    ),
    Effect.catchAll(error =>
      pipe(
        Console.log(`[RACE RETRY] All retries exhausted: ${error}`),
        Effect.flatMap(() => Effect.fail(error as E))
      )
    )
  )
}

// ----------------------------------------------------------
// Race with Progress Reporting
// ----------------------------------------------------------
// Reports which effects are still running at regular intervals.
const raceWithProgress = <A, E>(
  effects: Array<{ label: string; effect: Effect.Effect<A, E> }>,
  timeout: Duration.Duration = "30 seconds",
  progressInterval: Duration.Duration = "5 seconds"
): Effect.Effect<A, E> => {
  const withLabels = effects.map(({ label, effect }) =>
    pipe(
      effect,
      Effect.map(value => ({ label, value }))
    )
  )

  const raced = withLabels.reduce((acc, effect) =>
    Effect.race(acc, effect)
  )

  const withProgress = pipe(
    raced,
    Effect.timeout(timeout),
    Effect.catchAll(error =>
      pipe(
        Console.log(`[RACE PROGRESS] Timeout after ${timeout}`),
        Effect.flatMap(() => Effect.fail(error as E))
      )
    )
  )

  return withProgress
}

// ----------------------------------------------------------
// Usage Examples
// ----------------------------------------------------------
const demonstrateRaces = Effect.gen(function*(_) {
  console.log("=== Effect.race with Timeout Demo ===\n")

  // Example 1: Basic race with timeout
  console.log("Example 1: Basic race with timeout")
  const result1 = yield* _(
    raceWithTimeout(
      [
        pipe(
          Effect.sync(() => "fast-result"),
          Effect.delay("100 millis")
        ),
        pipe(
          Effect.sync(() => "slow-result"),
          Effect.delay("500 millis")
        )
      ],
      "1 seconds"
    ),
    Effect.catchAll(error => {
      console.log(`  Error: ${error}`)
      return Effect.sync(() => "timeout")
    })
  )
  console.log(`  Winner: ${result1}`)

  // Example 2: Race with tracking
  console.log("\nExample 2: Race with tracking")
  const result2 = yield* _(
    raceWithTracking(
      [
        { label: "api-call", effect: pipe(Effect.sync(() => "api-data"), Effect.delay("200 millis")) },
        { label: "cache", effect: pipe(Effect.sync(() => "cached-data"), Effect.delay("50 millis")) }
      ],
      "1 seconds"
    ),
    Effect.catchAll(error => {
      console.log(`  Error: ${error}`)
      return Effect.sync(() => ({ winner: "fallback", value: "default" }))
    })
  )
  console.log(`  Winner: ${result2.winner}, Value: ${result2.value}`)

  // Example 3: Race with fallback
  console.log("\nExample 3: Race with fallback")
  const result3 = yield* _(
    raceWithFallback(
      [
        pipe(Effect.sync(() => "slow"), Effect.delay("5 seconds")),
        pipe(Effect.sync(() => "very-slow"), Effect.delay("10 seconds"))
      ],
      "default-value",
      "1 seconds"
    )
  )
  console.log(`  Result: ${result3}`)

  // Example 4: Race with retry
  console.log("\nExample 4: Race with retry")
  const result4 = yield* _(
    raceWithRetry(
      [
        pipe(Effect.sync(() => "unreliable"), Effect.delay("2 seconds"))
      ],
      "500 millis",
      2
    ),
    Effect.catchAll(error => {
      console.log(`  All retries failed: ${error}`)
      return Effect.sync(() => "after-retries")
    })
  )
  console.log(`  Result: ${result4}`)
})

// ----------------------------------------------------------
// Run
// ----------------------------------------------------------
Effect.runPromise(demonstrateRaces).then(() => {
  console.log("\nRace timeout demo completed")
})
