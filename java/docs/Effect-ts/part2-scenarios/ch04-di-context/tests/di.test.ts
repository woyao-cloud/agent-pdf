import { Context, Layer, Effect } from "effect"
import { Database, Logger, program } from "../src/di"

describe("Dependency Injection", () => {
  it("should run program with live layer", async () => {
    const result = await Effect.runPromise(program)
    expect(result).toEqual({ rows: [], sql: "SELECT * FROM users" })
  })

  it("should work with mocked Database", async () => {
    const MockDatabase = Layer.succeed(Database, {
      query: (sql: string) => Effect.succeed({ rows: [{ id: "mock" }], sql }),
    })

    const MockLogger = Layer.succeed(Logger, {
      info: () => Effect.void,
    })

    const testLayer = Layer.merge(MockDatabase, MockLogger)
    const testProgram = program.pipe(Effect.provide(testLayer))
    const result = await Effect.runPromise(testProgram)
    expect(result.rows[0].id).toBe("mock")
  })

  it("should allow partial mocking", async () => {
    const LiveLogger = Layer.succeed(Logger, {
      info: () => Effect.void,
    })

    const testLayer = Layer.merge(Database.Default, LiveLogger)
    const testProgram = program.pipe(Effect.provide(testLayer))
    const result = await Effect.runPromise(testProgram)
    expect(result).toBeDefined()
  })
})