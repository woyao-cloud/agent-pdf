import { Effect, Scope, Context, Layer } from "effect"

interface Connection {
  id: number
  query: (sql: string) => Effect.Effect<any>
  close: () => void
}

let connectionCounter = 0

const createConnection = Effect.sync(() => {
  connectionCounter++
  const id = connectionCounter
  console.log(`Creating connection #${id}`)
  return {
    id,
    query: (sql: string) => Effect.sync(() => ({ rows: [], sql, connectionId: id })),
    close: () => console.log(`Closing connection #${id}`),
  } as Connection
})

class ConnectionPool extends Context.Tag("ConnectionPool")<
  ConnectionPool,
  { acquire: Effect.Effect<Connection, never, Scope.Scope> }
>() {}

const ConnectionPoolLive = Layer.effect(
  ConnectionPool,
  Effect.sync(() => ({
    acquire: Effect.acquireRelease(createConnection, (conn) =>
      Effect.sync(() => conn.close())),
  }))
)

export const executeQuery = (sql: string): Effect.Effect<any, never, ConnectionPool | Scope.Scope> =>
  Effect.gen(function* (_) {
    const pool = yield* _(ConnectionPool)
    const conn = yield* _(pool.acquire)
    return yield* _(conn.query(sql))
  })

export { ConnectionPool, ConnectionPoolLive, Connection }