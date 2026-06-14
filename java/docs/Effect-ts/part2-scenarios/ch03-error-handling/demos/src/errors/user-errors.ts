import { Data } from "effect"

// User errors
export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
export class UserBanned extends Data.TaggedError("UserBanned")<{ id: string; bannedAt: Date; reason: string }> {}

// Order errors
export class OrderNotFound extends Data.TaggedError("OrderNotFound")<{ orderId: string }> {}
export class OrderAccessDenied extends Data.TaggedError("OrderAccessDenied")<{ orderId: string; userId: string }> {}

// Infrastructure errors
export class DatabaseError extends Data.TaggedError("DatabaseError")<{ operation: string; cause: unknown }> {}
export class NetworkError extends Data.TaggedError("NetworkError")<{ url: string; statusCode: number }> {}
export class RateLimitError extends Data.TaggedError("RateLimitError")<{ retryAfterMs: number }> {}

// HTTP error
export class HttpError extends Data.TaggedError("HttpError")<{ statusCode: number; message: string; internalError?: unknown }> {}