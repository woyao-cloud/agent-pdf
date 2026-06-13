# ch10 @effect/schema 数据校验

## 概述

`@effect/schema` 是 Effect 生态中的类型安全数据校验与编解码库。传统 `zod` 或 `yup` 是独立的运行时校验库，在 TypeScript 中解析类型的方式是通过 `z.infer<typeof schema>` 从运行时定义反向推导静态类型。`@effect/schema` 则更进一步：它与 Effect 的 `Effect`、`ParseResult`、`Serializable` 模块深度整合，提供从**声明到验证到编解码**的完整管道。

```typescript
import { Schema } from "@effect/schema"
import { Effect, ParseResult } from "effect"

// 声明 Schema
const Person = Schema.struct({
  name: Schema.string,
  age: Schema.number.pipe(Schema.int(), Schema.nonNegative()),
  email: Schema.optional(Schema.string.pipe(Schema.pattern(/^[^@]+@[^@]+$/)))
})

// TypeScript 类型自动推导
type Person = Schema.Schema.Type<typeof Person>
// { name: string; age: number; email?: string | undefined }

// 运行时解码
const decode = Schema.decodeSync(Person)
decode({ name: "Alice", age: 30 })
// { name: "Alice", age: 30 }

// 校验失败时抛出 ParseError
// decode({ name: "Alice", age: -1 })
// ❌ ParseError: { age: { nonNegative: "Expected a non-negative number" } }
```

---

## 1. 核心概念

### 1.1 Schema<A, I, R>

`Schema` 的三个类型参数：

| 参数 | 含义 |
|------|------|
| `A` | 解码后的类型（干净的、校验后的类型） |
| `I` | 编码前的输入类型（通常是 `unknown`） |
| `R` | 需要的依赖（通常 `never`） |

```typescript
// 最常见的场景：输入 unknown，输出 A
const NumberFromString: Schema.Schema<number, string, never> =
  Schema.transformOrFail(
    Schema.string,
    Schema.number,
    (s) => {
      const n = parseFloat(s)
      if (isNaN(n)) {
        return Effect.fail(new ParseResult.Type(
          Schema.number.ast, s, "not a number"
        ))
      }
      return Effect.succeed(n)
    },
    (n) => Effect.succeed(String(n))
  )
```

### 1.2 ParseResult

解码失败时返回 `ParseResult` 类型，可以使用 Effect 的错误处理机制进行组合：

```typescript
import { Schema } from "@effect/schema"
import { Effect, ParseResult } from "effect"

const schema = Schema.struct({
  name: Schema.string,
  age: Schema.number
})

// 安全解码（返回 Effect）
const safeDecode = Schema.decode(Effect)(schema, { age: "abc" })

Effect.runPromiseExit(safeDecode).then(console.log)
// { _id: 'Exit', tag: 'Failure',
//   cause: { _id: 'Cause', tag: 'Fail',
//     error: { _id: 'ParseResult', errors: [...] }
//   }
// }
```

---

## 2. 类型安全编解码

### 2.1 基本类型

```typescript
import { Schema } from "@effect/schema"

// 原始类型
Schema.string    // string
Schema.number    // number
Schema.boolean   // boolean
Schema.literal("a", "b", "c") // "a" | "b" | "c"
Schema.undefined // undefined
Schema.null      // null

// 复合类型
Schema.struct({ key: Schema.string })
Schema.array(Schema.number)   // number[]
Schema.tuple(Schema.string, Schema.number) // [string, number]
Schema.union(Schema.string, Schema.number) // string | number
Schema.record(Schema.string, Schema.number) // { [x: string]: number }
```

### 2.2 编解码转换器

```typescript
import { Schema } from "@effect/schema"

// 从字符串解析数字
const NumberFromString = Schema.NumberFromString
Schema.decodeSync(NumberFromString)("42") // 42

// 从字符串解析日期
const DateFromString = Schema.DateFromString
Schema.decodeSync(DateFromString)("2024-01-15") // Date(2024-01-15)

// 可选值与默认值
const OptionalWithDefault = Schema.optionalWith(
  Schema.string,
  { default: () => "fallback" }
)

// 可选字段的 nullable
const NullishField = Schema.optional(Schema.string, {
  nullable: true  // 允许 null 输入
})
```

---

## 3. 验证与约束

### 3.1 Pipeable 约束

`@effect/schema` 的约束通过 `pipe` 组合器实现，与 Effect 风格一致：

```typescript
import { Schema } from "@effect/schema"

const PositiveInt = Schema.number.pipe(
  Schema.int(),          // 必须是整数
  Schema.positive(),     // 必须 > 0
  Schema.brand("UserId") // 品牌类型：结构类型而非 nominal 类型
)
// 类型：Schema.Schema<number & Brand<"UserId">, number, never>

// 字符串约束
const Email = Schema.string.pipe(
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  Schema.maxLength(255),
  Schema.brand("Email")
)

// 范围约束
const Age = Schema.number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(150)
)
```

### 3.2 自定义验证

```typescript
import { Schema, ParseResult } from "@effect/schema"
import { Effect } from "effect"

const Password = Schema.string.pipe(
  Schema.filter((s) => {
    if (s.length < 8) return false
    if (!/[A-Z]/.test(s)) return false
    if (!/[0-9]/.test(s)) return false
    return true
  }, {
    message: "Password must be at least 8 chars, contain a capital letter and a digit"
  }),
  Schema.brand("Password")
)
```

---

## 4. 编解码三兄弟

`@effect/schema` 提供三种解码模式以适应不同场景：

| 函数 | 行为 | 适用场景 |
|------|------|----------|
| `decodeSync` | 同步解码 | 单元测试、验证已知数据 |
| `decodeEither` | 返回 Either | 拒绝 Effect 的调用方 |
| `decode` | 返回 Effect | Effect 管道内的解码 |

```typescript
import { Schema } from "@effect/schema"
import { Effect, Either } from "effect"

const schema = Schema.struct({ name: Schema.string })

// decodeSync：同步，失败时抛出异常
try {
  Schema.decodeSync(schema, JSON.parse('{"name":123}'))
} catch (e) {
  // ParseError
}

// decodeEither：返回 Either
const result = Schema.decodeEither(schema, { name: 123 })
if (Either.isLeft(result)) {
  console.log(result.left) // ParseResult
} else {
  console.log(result.right) // { name: string }
}

// decode：返回 Effect
const program = Schema.decode(Effect)(schema, { name: 123 }).pipe(
  Effect.catchAll((error) =>
    Effect.succeed(`validation failed: ${error.message}`)
  )
)
```

对应的编码函数同样有三个变体：
- `encodeSync`, `encodeEither`, `encode`

```typescript
const schema = Schema.NumberFromString

// 解码：string → number
Schema.decodeSync(schema)("42") // 42

// 编码：number → string
Schema.encodeSync(schema)(42) // "42"
```

---

## 5. Effect.Serializable 接口

`@effect/schema` 与 Effect 的 `Serializable` 模块集成，支持将 Schema 直接用作 Effect 消息类型，实现跨 Fiber / 跨网络的类型安全序列化：

```typescript
import { Schema } from "@effect/schema"
import { Serializable } from "effect"

// 定义可序列化的消息
class UserCreated extends Schema.TaggedRequest<UserCreated>()("UserCreated", {
  payload: Schema.struct({
    id: Schema.string,
    name: Schema.string
  }),
  failure: Schema.never,
  success: Schema.boolean
}) {}

// 发送方
const send = (user: UserCreated["payload"]) =>
  UserCreated({ payload: user }).pipe(
    Serializable.serialize,    // 序列化为 Uint8Array
    Effect.andThen((bytes) => {
      // 发送到网络 / Fiber
      return bytes
    })
  )

// 接收方
const receive = (bytes: Uint8Array) =>
  Serializable.deserialize(bytes).pipe(
    Effect.andThen((msg) => {
      // msg 的类型自动推导为 UserCreated
      console.log("received:", msg)
    })
  )
```

---

## 6. 实际场景：API 请求校验

```typescript
import { Schema } from "@effect/schema"
import { Effect, Console } from "effect"

// 定义请求体 Schema
const CreateUserRequest = Schema.struct({
  name: Schema.string.pipe(Schema.nonEmpty(), Schema.maxLength(100)),
  email: Schema.string.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
  age: Schema.optional(Schema.number.pipe(Schema.int(), Schema.gt(0))),
  role: Schema.union(
    Schema.literal("admin", "user", "viewer"),
    Schema.never
  ).pipe(
    Schema.nullable,
    Schema.map((s) => s ?? "user") // 默认值
  )
})

type CreateUserRequest = Schema.Schema.Type<typeof CreateUserRequest>

// 中间件
const validateRequest = (rawBody: unknown) =>
  Schema.decode(Effect)(CreateUserRequest, rawBody).pipe(
    Effect.catchAll((parseErrors) =>
      Effect.fail({
        status: 400,
        errors: parseErrors.errors.map((e) => e.message)
      })
    ),
    Effect.andThen((validBody) => {
      // validBody 类型安全：CreateUserRequest
      return createUser(validBody)
    })
  )

const createUser = (body: CreateUserRequest) =>
  Effect.sync(() => {
    console.log(`creating user: ${body.name}`)
    return { id: crypto.randomUUID(), ...body }
  })
```

---

## 7. 实际场景：配置加载

```typescript
import { Schema } from "@effect/schema"
import { Effect, Console } from "effect"

// 应用配置 Schema
const AppConfig = Schema.struct({
  port: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.between(1024, 65535)
  ),
  database: Schema.struct({
    host: Schema.string.pipe(Schema.nonEmpty()),
    port: Schema.NumberFromString.pipe(Schema.int()),
    user: Schema.string,
    password: Schema.password
  }).pipe(
    Schema.rename({ user: "username" }) // 字段名映射
  ),
  features: Schema.record(
    Schema.string,
    Schema.boolean
  ).pipe(Schema.map(() => new Map())) // 转 Map
})

type AppConfig = Schema.Schema.Type<typeof AppConfig>

// 加载环境变量
const loadConfig = Effect.gen(function* (_) {
  const env = process.env as Record<string, string>
  
  const config = yield* _(
    Schema.decode(Effect)(AppConfig, {
      port: env["PORT"] ?? "3000",
      database: {
        host: env["DB_HOST"] ?? "localhost",
        port: env["DB_PORT"] ?? "5432",
        user: env["DB_USER"] ?? "postgres",
        password: env["DB_PASSWORD"] ?? ""
      },
      features: {}
    })
  )
  
  return config
})
```

---

## 8. 性能与注意事项

### 8.1 schema 定义复用

与 `zod` 类似，Schema 定义应尽量在模块级别（module level）创建，避免在热路径中重复构造：

```typescript
// ✅ 模块级定义（推荐）
const UserSchema = Schema.struct({
  id: Schema.string,
  name: Schema.string
})

// ❌ 每次调用都重新定义（不推荐）
function decodeUser(data: unknown) {
  const localSchema = Schema.struct({ id: Schema.string, name: Schema.string })
  return Schema.decodeSync(localSchema, data)
}
```

### 8.2 Schema 组合

与 z/Zod 的 merge 类似：

```typescript
const BaseSchema = Schema.struct({
  id: Schema.string
})

const ExtendedSchema = Schema.extend(
  BaseSchema,
  Schema.struct({ name: Schema.string })
)
```

### 8.3 错误信息定制

```typescript
const customErrorSchema = Schema.string.pipe(
  Schema.filter((s) => s.length > 0, {
    message: (s) => `expected non-empty string but got '${s}'`
  })
)
```

---

## 参考

- `@effect/schema` 文档：https://effect.website/docs/schema/introduction
- API 参考：`Schema` (`@effect/schema`), `ParseResult` (`effect/ParseResult`), `Serializable` (`effect/Serializable`)
- 相关章节：ch06（结构化并发中的消息序列化）、ch12（与 Express/Fastify 集成）