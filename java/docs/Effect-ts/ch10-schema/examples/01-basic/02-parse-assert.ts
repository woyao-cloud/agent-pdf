import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Schema 提供 decode / encode / assert 三种操作

const UserSchema = Schema.Struct({
  id: Schema.Number,
  username: Schema.String.pipe(Schema.maxLength(20)),
  role: Schema.Literal("admin", "user", "guest"),
})

// decode: 从 unknown 解析为类型安全的值
const decodeUser = Schema.decode(UserSchema)

// encode: 将类型安全的值序列化为 unknown（用于输出）
const encodeUser = Schema.encode(UserSchema)

// assert: 仅验证，不转换
const assertUser = Schema.asserts(UserSchema)

const program = Effect.gen(function* () {
  // decode 成功
  const user = yield* decodeUser({ id: 1, username: "alice", role: "admin" })
  console.log("decode 成功:", user)

  // decode 失败 — 捕获错误
  const badRole = yield* decodeUser({ id: 2, username: "bob", role: "superadmin" }).pipe(
    Effect.catchAll((e) => Effect.succeed(`decode 失败: ${e.message}`)),
  )
  console.log(badRole)

  // encode 将类型安全的值转回 plain object
  const encoded = yield* encodeUser(user)
  console.log("encode 结果:", encoded)

  // assert — 不返回数据，只验证
  const validData: unknown = { id: 3, username: "charlie", role: "user" }
  yield* assertUser(validData)
  console.log("assert 通过: 数据有效")
})

Effect.runPromise(program)
