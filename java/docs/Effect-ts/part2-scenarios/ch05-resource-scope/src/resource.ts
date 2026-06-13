import { Effect, Scope } from "effect"

// 使用 acquireRelease 确保资源释放
const openFile = (name: string): Effect.Effect<{ name: string; close: () => void }> =>
  Effect.sync(() => {
    console.log(`Opening file: ${name}`)
    return {
      name,
      close: () => console.log(`Closing file: ${name}`),
    }
  })

export const readFile = (name: string): Effect.Effect<string, Error> =>
  Effect.acquireUseRelease(
    openFile(name),
    (file) => Effect.sync(() => `Content of ${file.name}`),
    (file, exit) => Effect.sync(() => file.close()),
  )

// Scope 内自动管理多个资源
export const processMultipleFiles = Effect.gen(function* (_) {
  const content1 = yield* _(readFile("data1.txt"))
  const content2 = yield* _(readFile("data2.txt"))
  return `${content1}\n${content2}`
})

// 使用 Scope 手动控制
export const scopedResource = (name: string): Effect.Effect<string, Error, Scope.Scope> =>
  Effect.scoped(
    Effect.acquireRelease(
      openFile(name),
      (file) => Effect.sync(() => file.close()),
    ).pipe(
      Effect.flatMap((file) => Effect.sync(() => `Content of ${file.name}`))
    )
  )

// 资源超时自动释放
export const readFileWithTimeout = (name: string): Effect.Effect<string, Error> =>
  readFile(name).pipe(Effect.timeout("1 seconds"), Effect.scoped)