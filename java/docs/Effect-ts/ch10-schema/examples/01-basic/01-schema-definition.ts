import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Schema 是单一数据源：同时生成 TypeScript 类型和运行时校验器
const PersonSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

// 从 Schema 推导出的 TypeScript 类型
type Person = Schema.Schema.Type<typeof PersonSchema>
//   ^? { readonly id: number; readonly name: string; readonly age: number; readonly email: string }

// 运行时校验：传入未知数据，返回校验后的 Person
const program = Effect.gen(function* () {
  const validInput = { id: 1, name: "Alice", age: 30, email: "alice@example.com" }
  const person1 = yield* Schema.decode(PersonSchema)(validInput)
  console.log("校验通过:", person1)

  const invalidInput = { id: "abc", name: "Bob", age: "unknown", email: 123 }
  const failure = yield* Schema.decode(PersonSchema)(invalidInput).pipe(
    Effect.catchAll((e) =>
      Effect.succeed(`校验失败: ${e.message}`)
    ),
  )
  console.log(failure)
})

Effect.runPromise(program)
