import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Schema 演化：处理 API 版本迁移

// v1 Schema
const UserV1 = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
})

// v2 Schema：新增字段，修改字段名
const UserV2 = Schema.Struct({
  id: Schema.Number,
  fullName: Schema.String, // 从 name 改名
  email: Schema.String,
  phone: Schema.optional(Schema.String), // 新增可选字段
  role: Schema.Literal("admin", "user").pipe(
    Schema.default("user"),
  ),
})

// 迁移函数：v1 → v2
const migrateV1toV2 = (v1: Schema.Schema.Type<typeof UserV1>): UserV2 => ({
  id: v1.id,
  fullName: v1.name,
  email: v1.email,
  phone: undefined,
  role: "user" as const,
})

type UserV2 = Schema.Schema.Type<typeof UserV2>

const program = Effect.gen(function* () {
  // 旧数据
  const oldData: unknown = {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
  }

  // 用 v1 Schema 解析
  const v1User = yield* Schema.decode(UserV1)(oldData)
  console.log("v1:", v1User)

  // 迁移到 v2
  const v2User = migrateV1toV2(v1User)
  const validatedV2 = yield* Schema.decode(UserV2)(v2User)
  console.log("v2:", validatedV2)
  console.log("角色:", validatedV2.role) // "user"（默认值）

  // 新系统接收 v2 格式
  const newData: unknown = {
    id: 2,
    fullName: "Bob",
    email: "bob@example.com",
    phone: "13800138000",
    role: "admin",
  }
  const directV2 = yield* Schema.decode(UserV2)(newData)
  console.log("直接 v2:", directV2)
})

Effect.runPromise(program)
