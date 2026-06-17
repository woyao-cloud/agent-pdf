import { Schema, AST } from "@effect/schema"
import { Effect } from "effect"

// @effect/schema 的核心是 AST（抽象语法树）
// 每个 Schema 在内部表示为 AST 节点，可以检查和转换

const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

// 检查 Schema 的 AST 结构
const ast = PersonSchema.ast
console.log("AST 类型:", ast._tag)
// 输出: "Struct"

// 通过 AST 转换创建新 Schema：将所有字段变为可选
const makeOptional = (schema: Schema.Schema<any>): Schema.Schema<any> => {
  if (schema.ast._tag === "Struct") {
    const structAst = schema.ast as AST.Struct
    const optionalFields = Object.fromEntries(
      Object.entries(structAst.fields).map(([key, field]) => [
        key,
        Schema.optional(field),
      ]),
    )
    return Schema.Struct(optionalFields)
  }
  return schema
}

const OptionalPersonSchema = makeOptional(PersonSchema)

const program = Effect.gen(function* () {
  // 原始 Schema 要求所有字段
  const r1 = yield* Schema.decode(PersonSchema)({ name: "Alice", age: 30 }).pipe(
    Effect.map((p) => `完整: ${p.name}, ${p.age}`),
  )
  console.log(r1)

  // 可选 Schema 允许缺少字段
  const r2 = yield* Schema.decode(OptionalPersonSchema)({ name: "Bob" }).pipe(
    Effect.map((p) => `可选: ${p.name}, 年龄=${p.age ?? "未知"}`),
  )
  console.log(r2)
})

Effect.runPromise(program)
