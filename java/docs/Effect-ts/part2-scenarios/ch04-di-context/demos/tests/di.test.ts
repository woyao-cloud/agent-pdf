import { Effect, Layer, Context } from "effect"
import { listUsers } from "../src/user-service.js"

// Mock Database for testing
class TestDb extends Context.Tag("TestDb")<TestDb, { query: (sql: string) => Effect.Effect<any[]> }>() {}
const TestDbLive = Layer.succeed(TestDb, {
  query: () => Effect.succeed([{ id: "test-1", name: "Test User" }]),
})

class TestLogger extends Context.Tag("TestLogger")<TestLogger, { info: (msg: string) => Effect.Effect<void> }>() {}
const TestLoggerLive = Layer.succeed(TestLogger, { info: () => Effect.void })

describe("DI Demo", () => {
  it("should work with mock dependencies", async () => {
    const result = await Effect.runPromise(listUsers)
    expect(Array.isArray(result)).toBe(true)
  })
})