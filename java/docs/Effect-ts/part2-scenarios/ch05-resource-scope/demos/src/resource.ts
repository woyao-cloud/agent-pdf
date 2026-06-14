import { Effect, Console, Scope } from "effect"

// Simulated file handle
interface FileHandle {
  name: string
  read(): string
  close(): void
}

const openFile = (name: string): Effect.Effect<FileHandle, Error, never> =>
  Effect.sync(() => {
    console.log(`[Acquire] Opening file: ${name}`)
    return {
      name,
      read() {
        console.log(`[Use] Reading: ${name}`)
        return `Content of ${name}`
      },
      close() {
        console.log(`[Release] Closing file: ${name}`)
      },
    }
  })

// Using acquireRelease
export const readFile = (name: string): Effect.Effect<string, Error, never> =>
  Effect.acquireRelease(
    openFile(name),
    (file, exit) => Effect.sync(() => {
      console.log(`[Release on exit: ${exit._tag}] Closing: ${file.name}`)
      file.close()
    }),
  ).pipe(
    Effect.flatMap((file) => Effect.sync(() => file.read()))
  )

// Multiple resources in Scope
export const processMultiple = (
  file1: string,
  file2: string
): Effect.Effect<string, Error, Scope.Scope> =>
  Effect.gen(function* (_) {
    const a = yield* _(readFile(file1))
    const b = yield* _(readFile(file2))
    return `${a}\n${b}`
  })