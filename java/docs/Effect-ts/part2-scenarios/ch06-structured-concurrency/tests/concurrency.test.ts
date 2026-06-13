import { Effect, Fiber } from "effect"
import { processBatch, parallelTask, producerConsumer, raceApis, concurrentMap } from "../src/concurrency"

describe("Concurrency", () => {
  it("should run parallel tasks", async () => {
    const result = await Effect.runPromise(parallelTask)
    expect(result).toEqual(["task1", "task2"])
  })

  it("should process batch with semaphore", async () => {
    const result = await Effect.runPromise(processBatch(["url1", "url2", "url3"]))
    expect(result).toHaveLength(3)
    expect(result[0]).toContain("Fetched url1")
  })

  it("should run producer-consumer pattern", async () => {
    const result = await Effect.runPromise(producerConsumer)
    expect(result).toEqual(["a", "b", "c"])
  })

  it("should race two effects", async () => {
    const result = await Effect.runPromise(raceApis)
    expect(result).toBe("api1")
  })

  it("should concurrently map items", async () => {
    const result = await Effect.runPromise(
      concurrentMap([1, 2, 3], (n) => Effect.succeed(n * 2), 2)
    )
    expect(result).toEqual([2, 4, 6])
  })
})