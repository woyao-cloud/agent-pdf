import { Effect, Scope, Console } from "effect"

interface Connection {
  id: number
  query(sql: string): string
  close(): void
}

let nextId = 1

const createConnection = (): Effect.Effect<Connection, never, never> =>
  Effect.sync(() => {
    const conn = {
      id: nextId++,
      query(sql: string) {
        console.log(`[Conn #${conn.id}] Executing: ${sql}`)
        return `Result of: ${sql}`
      },
      close() {
        console.log(`[Conn #${conn.id}] Connection closed`)
      },
    }
    console.log(`[Conn #${conn.id}] Connection established`)
    return conn
  })

export const withConnection = <A>(use: (conn: Connection) => Effect.Effect<A, Error, never>): Effect.Effect<A, Error, Scope.Scope> =>
  Effect.acquireRelease(
    createConnection(),
    (conn, exit) => Effect.sync(() => {
      console.log(`[Release on ${exit._tag}] Connection #${conn.id}`)
      conn.close()
    }),
  ).pipe(
    Effect.flatMap(use)
  )

// Example: query database with connection
export const queryDb = (sql: string): Effect.Effect<string, Error, Scope.Scope> =>
  withConnection((conn) => Effect.sync(() => conn.query(sql)))