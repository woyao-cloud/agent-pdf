import { Effect } from "effect"
import { fetchAll, fanOut, workerPool, fetchWithRetrySchedule } from "../src/concurrent-http"

describe("Concurrent HTTP", () => {
  it("should fetch all URLs concurrently", async () => {
    const result = await Effect.runPromise(fetchAll(["http://a.com", "http://b.com"]))
    expect(result).toHaveLength(2)
    expect(result[0].url).toBe("http://a.com")
  })

  it("should fan out and return fastest", async () => {
    const result = await Effect.runPromise(fanOut(["http://slow.com", "http://fast.com"]))
    expect(result.status).toBe(200)
  })

  it("should work as worker pool", async () => {
    const result = await Effect.runPromise(
      workerPool([1, 2, 3, 4, 5], (n) => Effect.succeed(n * 10), 3)
    )
    expect(result).toEqual([10, 20, 30, 40, 50])
  })

  it("should retry with exponential backoff", async () => {
    const result = await Effect.runPromise(fetchWithRetrySchedule("http://test.com"))
    expect(result.status).toBe(200)
  })
})