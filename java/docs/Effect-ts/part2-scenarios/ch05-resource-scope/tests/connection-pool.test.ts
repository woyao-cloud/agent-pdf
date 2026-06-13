import { Effect, Layer, Scope } from "effect"
import { executeQuery, ConnectionPool, ConnectionPoolLive } from "../src/connection-pool"

describe("Connection Pool", () => {
  it("should execute query with connection pool", async () => {
    const program = executeQuery("SELECT * FROM users").pipe(
      Effect.provide(ConnectionPoolLive),
      Effect.scoped,
    )
    const result = await Effect.runPromise(program)
    expect(result).toBeDefined()
    expect(result.connectionId).toBeGreaterThan(0)
  })

  it("should create independent connections", async () => {
    const program = Effect.gen(function* (_) {
      const r1 = yield* _(executeQuery("SELECT 1"))
      const r2 = yield* _(executeQuery("SELECT 2"))
      return { r1, r2 }
    }).pipe(
      Effect.provide(ConnectionPoolLive),
      Effect.scoped,
    )
    const result = await Effect.runPromise(program)
    expect(result.r1.connectionId).not.toBe(result.r2.connectionId)
  })
})