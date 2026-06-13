import { Data } from "effect"

export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}
export class NetworkTimeout extends Data.TaggedError("NetworkTimeout")<{ url: string; elapsedMs: number }> {}