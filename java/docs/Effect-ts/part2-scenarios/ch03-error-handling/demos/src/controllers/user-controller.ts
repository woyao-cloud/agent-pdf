import { Effect } from "effect"
import { getUserWithOrders } from "../services/order-query-service.js"

export const handleUserRequest = (userId: string): Effect.Effect<{ status: number; body: string }, never, never> =>
  getUserWithOrders(userId).pipe(
    Effect.map(({ user, orders }) => ({
      status: 200,
      body: JSON.stringify({ user, orders }),
    })),
    Effect.catchTag("HttpError", (err) =>
      Effect.succeed({
        status: err.statusCode,
        body: JSON.stringify({ error: err.message }),
      })
    )
  )