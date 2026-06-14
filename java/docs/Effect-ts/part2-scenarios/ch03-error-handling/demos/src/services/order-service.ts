import { Effect } from "effect"
import { NetworkError } from "../errors/user-errors.js"
import type { Order } from "../models/user.js"

// Mock data
const orders: Record<string, Order[]> = {
  "1": [
    { orderId: "o1", userId: "1", amount: 99.99, status: "shipped" },
    { orderId: "o2", userId: "1", amount: 49.99, status: "pending" },
  ],
}

export const getRecentOrders = (userId: string): Effect.Effect<Order[], NetworkError, never> =>
  Effect.gen(function* (_) {
    const userOrders = orders[userId]
    if (!userOrders) {
      return yield* _(Effect.fail(new NetworkError({ url: `/api/orders/recent?userId=${userId}`, statusCode: 404 })))
    }
    return userOrders
  })