import { Effect } from "effect"
import { readFile, processMultipleFiles, scopedResource } from "../src/resource"

describe("Resource Management", () => {
  it("should acquire and release", async () => {
    const result = await Effect.runPromise(readFile("test.txt"))
    expect(result).toContain("Content of test.txt")
  })

  it("should process multiple files", async () => {
    const result = await Effect.runPromise(processMultipleFiles)
    expect(result).toContain("data1")
    expect(result).toContain("data2")
  })

  it("should work with scoped resource", async () => {
    const result = await Effect.runPromise(scopedResource("scoped.txt"))
    expect(result).toContain("Content of scoped.txt")
  })
})