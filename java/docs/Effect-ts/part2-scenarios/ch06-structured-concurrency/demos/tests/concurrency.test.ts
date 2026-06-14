import { Effect } from "effect"
import { parallelTask, raceExample } from "../src/concurrency.js"

describe("Concurrency", () => {
  it("should run tasks in parallel", async () => {
    const result = await Effect.runPromise(parallelTask)
    expect(result).toEqual(["task1-done", "task2-done"])
  })

  it("should race tasks", async () => {
    const winner = await Effect.runPromise(raceExample)
    expect(["A-wins", "B-wins"]).toContain(winner)
  })
})