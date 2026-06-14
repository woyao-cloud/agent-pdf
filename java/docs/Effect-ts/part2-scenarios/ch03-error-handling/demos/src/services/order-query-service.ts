import { Effect } from "effect"
import { findUserById } from "./user-service.js"
import { getRecentOrders } from "./order-service.js"
import { HttpError } from "../errors/user-errors.js"
import type { User } from "../models/user.js"
import type { Order } from "../models/user.js"

export const getUserWithOrders = (userId: string): Effect.Effect<
  { user: User; orders: Order[] },
  HttpError,
  never
> =>
  Effect.all({
    user: findUserById(userId),
    orders: getRecentOrders(userId),
  }).pipe(
    Effect.mapError((err) => {
      switch (err._tag) {
        case "UserNotFound":
          return new HttpError({ statusCode: 404, message: `用户 ${userId} 不存在`, internalError: err })
        case "DatabaseError":
        case "NetworkError":
          return new HttpError({ statusCode: 502, message: "服务暂时不可用", internalError: err })
        default:
          return new HttpError({ statusCode: 500, message: "服务器内部错误", internalError: err })
      }
    })
  )