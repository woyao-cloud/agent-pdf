import { Effect, Scope } from "effect"
import { readFile, processMultiple } from "../src/resource"
import { queryDb } from "../src/connection-pool"

describe("Resource Management", () => {
  it("should acquire and release single file", async () => {
    const result = await Effect.runPromise(readFile("test.txt"))
    expect(result).toBe("Content of test.txt")
  })

  it("should process multiple files with Scope", async () => {
    const result = await Effect.runPromise(
      processMultiple("a.txt", "b.txt").pipe(Effect.scoped)
    )
    expect(result).toContain("Content of a.txt")
    expect(result).toContain("Content of b.txt")
  })

  it("should handle scope release order", async () => {
    const logs: string[] = []

    const trackedReadFile = (name: string): Effect.Effect<string, Error, never> =>
      Effect.acquireRelease(
        Effect.sync(() => {
          logs.push(`[Acquire] ${name}`)
          return {
            name,
            read: () => `Content of ${name}`,
            close: () => logs.push(`[Release] ${name}`),
          }
        }),
        (file) => Effect.sync(() => file.close()),
      ).pipe(
        Effect.flatMap((file) => Effect.sync(() => file.read()))
      )

    const program = Effect.gen(function* (_) {
      const a = yield* _(trackedReadFile("first.txt"))
      const b = yield* _(trackedReadFile("second.txt"))
      return `${a}\n${b}`
    })

    await Effect.runPromise(program.pipe(Effect.scoped))

    expect(logs.filter((l) => l.startsWith("[Acquire]"))).toHaveLength(2)
    expect(logs.filter((l) => l.startsWith("[Release]"))).toHaveLength(2)
    // Release order should be reverse of acquire
    const acquireIndices = logs
      .map((l, i) => (l.startsWith("[Acquire]") ? i : -1))
      .filter((i) => i >= 0)
    const releaseIndices = logs
      .map((l, i) => (l.startsWith("[Release]") ? i : -1))
      .filter((i) => i >= 0)
    // First acquired should be released last
    expect(releaseIndices[0]).toBeGreaterThan(releaseIndices[1])
  })

  it("should release resources on error", async () => {
    const released: string[] = []

    const failingFile = (name: string): Effect.Effect<string, Error, never> =>
      Effect.acquireRelease(
        Effect.sync(() => {
          return {
            name,
            read: () => {
              throw new Error("Read error")
            },
            close: () => released.push(name),
          }
        }),
        (file, exit) =>
          Effect.sync(() => {
            console.log(`Release on ${exit._tag}`)
            file.close()
          }),
      ).pipe(
        Effect.flatMap((file) => Effect.sync(() => file.read()))
      )

    const program = Effect.gen(function* (_) {
      const a = yield* _(failingFile("err.txt"))
      return a
    })

    await expect(
      Effect.runPromise(program.pipe(Effect.scoped))
    ).rejects.toThrow()

    expect(released).toContain("err.txt")
  })

  it("should execute connection pool query", async () => {
    const result = await Effect.runPromise(
      queryDb("SELECT * FROM users").pipe(Effect.scoped)
    )
    expect(result).toBe("Result of: SELECT * FROM users")
  })

  it("should create independent connections", async () => {
    // Each queryDb creates a separate connection when called independently
    const r1 = await Effect.runPromise(
      queryDb("SELECT 1").pipe(Effect.scoped)
    )
    const r2 = await Effect.runPromise(
      queryDb("SELECT 2").pipe(Effect.scoped)
    )
    expect(r1).toBe("Result of: SELECT 1")
    expect(r2).toBe("Result of: SELECT 2")
  })
})