import { Effect } from "effect"
import { handleUserRequest } from "../src/controllers/user-controller.js"

describe("User Controller", () => {
  it("should return 200 for existing user", async () => {
    const result = await Effect.runPromise(handleUserRequest("1"))
    expect(result.status).toBe(200)
  })

  it("should return 404 for non-existing user", async () => {
    const result = await Effect.runPromise(handleUserRequest("nonexistent"))
    expect(result.status).toBe(404)
  })
})