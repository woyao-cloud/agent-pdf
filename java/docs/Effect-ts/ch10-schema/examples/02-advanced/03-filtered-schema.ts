import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Filtered Schema：在 Schema 层面添加业务规则约束

const PositiveNumber = Schema.Number.pipe(
  Schema.filter((n) => n > 0, { message: () => "值必须为正数" }),
)

const AgeSchema = Schema.Number.pipe(
  Schema.filter((n) => n >= 0 && n <= 150, {
    message: () => "年龄必须在 0-150 之间",
  }),
)

const UsernameSchema = Schema.String.pipe(
  Schema.minLength(3, { message: () => "用户名至少 3 个字符" }),
  Schema.maxLength(20, { message: () => "用户名最多 20 个字符" }),
  Schema.filter((s) => /^[a-zA-Z0-9_]+$/.test(s), {
    message: () => "用户名只能包含字母、数字和下划线",
  }),
)

const UserSchema = Schema.Struct({
  username: UsernameSchema,
  age: AgeSchema,
  score: PositiveNumber,
})

const program = Effect.gen(function* () {
  // 成功案例
  const valid = yield* Schema.decode(UserSchema)({
    username: "alice_123",
    age: 28,
    score: 95.5,
  })
  console.log("有效用户:", valid)

  // 失败案例 — 用户名太短
  const r1 = yield* Schema.decode(UserSchema)({
    username: "ab",
    age: 28,
    score: 95.5,
  }).pipe(Effect.catchAll((e) => Effect.succeed(`错误: ${e.message}`)))
  console.log(r1)

  // 失败案例 — 年龄超出范围
  const r2 = yield* Schema.decode(UserSchema)({
    username: "bob",
    age: 200,
    score: 95.5,
  }).pipe(Effect.catchAll((e) => Effect.succeed(`错误: ${e.message}`)))
  console.log(r2)
})

Effect.runPromise(program)
