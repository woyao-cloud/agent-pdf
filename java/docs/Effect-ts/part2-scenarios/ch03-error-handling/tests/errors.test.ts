import { Effect } from "effect"
import { findUser, getUserSafe, getUserOrThrow, fetchWithRetry } from "../src/service"
import { UserNotFound } from "../src/errors"

describe("Error Handling", () => {
  it("should return user for valid id", async () => {
    const result = await Effect.runPromise(findUser("1"))
    expect(result.id).toBe("1")
    expect(result.name).toBe("Alice")
  })

  it("should fail with UserNotFound for invalid id", async () => {
    await expect(Effect.runPromise(findUser("999"))).rejects.toThrow()
  })

  it("should return null when catching UserNotFound", async () => {
    const result = await Effect.runPromise(getUserSafe("999"))
    expect(result).toBeNull()
  })

  it("should catchAll and throw on unexpected error", async () => {
    await expect(Effect.runPromise(getUserOrThrow("999"))).rejects.toThrow()
  })

  it("should retry on failure", async () => {
    const result = await Effect.runPromise(fetchWithRetry("999"))
    expect(result).toBeNull()
  })
})