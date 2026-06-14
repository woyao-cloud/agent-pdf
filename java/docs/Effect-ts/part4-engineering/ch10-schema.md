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

## 1. 使用场景

### 1.1 API 请求校验

在 HTTP 服务中，对请求体、查询参数和路径参数进行类型安全校验是最常见的场景：

```typescript
import { Schema } from "@effect/schema"
import { Effect } from "effect"

const CreateUserRequest = Schema.struct({
  name: Schema.string.pipe(Schema.nonEmpty(), Schema.maxLength(100)),
  email: Schema.string.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
  age: Schema.optional(Schema.number.pipe(Schema.int(), Schema.gt(0)))
})

const validateAndProcess = (rawBody: unknown) =>
  Schema.decode(Effect)(CreateUserRequest, rawBody).pipe(
    Effect.catchAll((err) =>
      Effect.fail({ status: 400, errors: err.errors.map(e => e.message) })
    ),
    Effect.andThen((body) => createUser(body))
  )
```

### 1.2 环境变量解析

环境变量全部是字符串，需要解析为强类型配置：

```typescript
const EnvConfig = Schema.struct({
  PORT: Schema.NumberFromString.pipe(Schema.int(), Schema.between(1024, 65535)),
  LOG_LEVEL: Schema.literal("debug", "info", "warn", "error"),
  REDIS_URL: Schema.string.pipe(Schema.nonEmpty()),
  FEATURE_FLAGS: Schema.parseJson(Schema.record(Schema.string, Schema.boolean))
})

type EnvConfig = Schema.Schema.Type<typeof EnvConfig>
```

### 1.3 配置文件加载

YAML/JSON 配置文件在运行时加载并校验：

```typescript
import { Schema } from "@effect/schema"
import { Effect } from "effect"
import * as fs from "fs"

const loadConfig = <A>(schema: Schema.Schema<A>, path: string) =>
  Effect.trySync(() => JSON.parse(fs.readFileSync(path, "utf-8"))).pipe(
    Effect.andThen((raw) => Schema.decode(Effect)(schema, raw)),
    Effect.catchAll((err) => Effect.die(`Config error: ${err}`))
  )
```

### 1.4 JSON 编解码

在分布式系统中，消息需要在不同服务间传输，Schema 可以确保编解码的一致性：

```typescript
const Message = Schema.struct({
  id: Schema.UUID,
  type: Schema.literal("order_created", "payment_received"),
  payload: Schema.parseJson(Schema.unknown)
})

// 编码 → 传输 → 解码 全程类型安全
const encoded = Schema.encodeSync(Message)(message)
const decoded = Schema.decodeSync(Message)(encoded)
```

### 1.5 数据库 Schema 映射

对数据库返回的结果进行二次校验，确保数据完整性：

```typescript
const DbUser = Schema.struct({
  id: Schema.UUID,
  name: Schema.string.pipe(Schema.nonEmpty()),
  email: Schema.string.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
  created_at: Schema.DateFromString,
  metadata: Schema.parseJson(Schema.record(Schema.string, Schema.unknown))
})
```

---

## 2. 实现原理

### 2.1 Schema 作为 AST（抽象语法树）

`@effect/schema` 的核心是 AST 驱动。每个 Schema 定义实际上是一棵 AST 节点树，而非简单的运行时函数。这带来了几个关键优势：

- **可反射**：可以在不执行解码的情况下检查 Schema 的结构
- **可优化**：AST 可以被转换为更高效的执行计划
- **可序列化**：AST 可以被序列化为 JSON，实现跨进程 Schema 共享

```typescript
import { Schema, AST } from "@effect/schema"

const MySchema = Schema.struct({
  name: Schema.string,
  age: Schema.number.pipe(Schema.int())
})

// 检查 Schema 的 AST 结构
console.log(MySchema.ast)
// StructType {
//   properties: [
//     { name: "name", type: StringKeyword },
//     { name: "age", type: Refinement(IntKeyword) }
//   ]
// }

// 使用 AST API 进行反射
const isStringField = (schema: Schema.Schema<any>, field: string) => {
  const struct = schema.ast as AST.StructType
  const prop = struct.properties.find(p => p.name === field)
  return prop?.type._tag === "StringKeyword"
}
```

### 2.2 decode / encode / assert / is 方法族

Schema 提供了四类核心操作：

| 方法 | 行为 | 典型场景 |
|------|------|----------|
| `decode` | 解析输入为 Schema 类型 | API 请求反序列化 |
| `encode` | 将 Schema 类型序列化 | 发送数据到外部系统 |
| `assert` | 检查值是否符合 Schema | 防御性断言 |
| `is` | 类型谓词，返回 boolean | 条件分支中缩小类型 |

```typescript
// is — 类型安全的类型守卫
if (Schema.is(MySchema, unknownValue)) {
  // 此处 unknownValue 的类型自动收窄为 MySchema 的类型
  console.log(unknownValue.name)
}

// assert — 不符合时抛出，符合时返回原值
Schema.assert(MySchema)({ name: "Alice", age: 30 })
// ✅ ok
Schema.assert(MySchema)({ name: "Alice", age: -1 })
// ❌ ParseError: age must be an integer
```

### 2.3 品牌类型（Brand）：运行时 + 编译时双保险

品牌类型（Branded Types）是 TypeScript 的 nominal typing（名义类型）模拟。通过 `Schema.brand` 可以为值添加一个运行时和编译时都能识别的标记：

```typescript
import { Schema, Brand } from "@effect/schema"

// 编译时：UserId 与 string 不可互换
type UserId = string & Brand.Brand<"UserId">
const UserId = Schema.string.pipe(Schema.brand("UserId"))

type Email = string & Brand.Brand<"Email">
const Email = Schema.string.pipe(
  Schema.pattern(/^[^@]+@[^@]+$/),
  Schema.brand("Email")
)

// 函数签名强制类型安全
declare function getUser(id: UserId): void
declare function sendEmail(email: Email): void

const rawId: string = "abc123"
// getUser(rawId) ❌ 编译错误：string 不能赋值给 UserId

// 必须通过 Schema 解码后才能获取品牌类型
const validId = Schema.decodeSync(UserId)("abc123")
getUser(validId) // ✅ OK
```

品牌类型在大型项目中尤其有用，可以避免"字符串地狱"——当你有十几个 `string` 类型的 ID 时，传错参数在运行时才会发现，而品牌类型可以在编译时帮你捕获这类错误。

---

## 3. 对比：Zod vs @effect/schema

| 维度 | Zod | @effect/schema |
|------|-----|---------------|
| 运行时校验 | ✅ 核心功能 | ✅ 核心功能 |
| 类型推导 | `z.infer<typeof S>` | `Schema.Schema.Type<typeof S>` |
| AST 反射 | 有限（可通过 `._def` 检查） | 完整 AST API |
| 品牌类型 | ❌ 需额外库 | ✅ 原生支持 |
| Effect 集成 | ❌ 需手动适配 | ✅ 原生：decode 返回 Effect |
| Serializable | ❌ | ✅ `Schema.TaggedRequest` 内建 |
| 编解码转换 | 需 `z.transfrom` 手动实现 | ✅ 预置 `NumberFromString` 等 |
| 错误类型 | `ZodError`（独立） | `ParseResult`（与 Effect 共享） |
| 渐进校验 | ❌ | ✅ `Schema.partial` / `Schema.pick` |
| 社区生态 | 庞大（React Hook Form 等） | 较小但快速增长 |

核心区别：**Zod 是独立的校验库，@effect/schema 是 Effect 生态中的一等公民**。如果你已经在使用 Effect 管理副作用、依赖和并发，@effect/schema 的集成成本几乎为零——校验结果可以直接接入 Effect Pipeline，错误类型也是统一的 `ParseResult`。

---

## 4. 潜在风险

### 4.1 性能开销

Schema 解码涉及类型检查、模式匹配和转换，在高频调用路径上可能成为瓶颈：

```typescript
// ❌ 高频热点路径中反复解码
for (const item of largeArray) {
  process(Schema.decodeSync(ItemSchema)(item))
}

// ✅ 批量解码 + 模块级 Schema 复用
const decodeItem = Schema.decodeSync(ItemSchema)
for (const item of largeArray) {
  process(decodeItem(item))
}
```

### 4.2 品牌类型丢失

品牌类型在 JSON 序列化/反序列化过程中会丢失：

```typescript
const userId = Schema.decodeSync(UserId)("abc123")
// userId: UserId (branded)

const json = JSON.stringify(userId)
const parsed = JSON.parse(json)
// parsed: string (brand lost!)

// 解决方案：始终通过 Schema 重新解码
const restored = Schema.decodeSync(UserId)(parsed)
```

### 4.3 Schema 版本兼容

Schema 变更后，已持久化的数据可能无法解码：

```typescript
// v1 Schema
const V1 = Schema.struct({ name: Schema.string, age: Schema.number })

// v2 Schema（新增字段）
const V2 = Schema.struct({
  name: Schema.string,
  age: Schema.number,
  email: Schema.optional(Schema.string)  // 向后兼容
})

// 从数据库读取 v1 数据，用 V2 解码
// ✅ 因为 email 是可选的
```

---

## 5. 核心概念

### 5.1 Schema<A, I, R>

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

### 5.2 ParseResult

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

## 6. 类型安全编解码

### 6.1 基本类型

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

### 6.2 编解码转换器

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

## 7. 验证与约束

### 7.1 Pipeable 约束

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

### 7.2 自定义验证

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

## 8. 优化策略

### 8.1 Schema 定义复用

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

### 8.2 懒加载 Schema

对于递归或自引用的 Schema，使用 `Schema.suspend` 延迟求值：

```typescript
interface TreeNode {
  value: number
  children: TreeNode[]
}

const TreeNodeSchema: Schema.Schema<TreeNode> = Schema.suspend(() =>
  Schema.struct({
    value: Schema.number,
    children: Schema.array(TreeNodeSchema)
  })
)
```

### 8.3 选择解码模式

根据场景选择最合适的解码函数以避免不必要的开销：

```typescript
// 已知数据可信 → decodeSync（最快）
decodeSync(schema, trustedData)

// 不确定输入 → decode（返回 Effect，可组合）
decode(Effect)(schema, unknownInput)

// 只需类型谓词 → is（最轻量，只做类型检查，无转换）
is(schema, data)
```

### 8.4 Schema 组合

使用 `Schema.extend`、`Schema.pick`、`Schema.partial` 等组合器复用已有 Schema：

```typescript
const BaseSchema = Schema.struct({
  id: Schema.string,
  createdAt: Schema.DateFromString
})

const UpdateSchema = Schema.struct({
  name: Schema.string,
  email: Schema.string
}).pipe(Schema.partial) // 所有字段可选

const FullSchema = Schema.extend(BaseSchema, UpdateSchema)
```

---

## 9. 典型问题处理

### 9.1 decode 失败时的 ParseResult 处理

```typescript
import { Schema, ParseResult } from "@effect/schema"
import { Effect } from "effect"

// 将 ParseResult 映射为友好的错误消息
const handleParseError = (error: ParseResult.ParseError) => ({
  field: error.errors[0]?.path ?? "unknown",
  message: error.errors.map(e => e.message).join("; ")
})

const decodeOrFallback = <A>(schema: Schema.Schema<A>, input: unknown, fallback: A) =>
  Schema.decode(Effect)(schema, input).pipe(
    Effect.catchAll((e) =>
      Effect.sync(() => {
        console.warn("Validation failed:", handleParseError(e))
        return fallback
      })
    )
  )
```

### 9.2 Schema 版本兼容

在微服务或持久化场景中，Schema 版本演进是常见挑战：

```typescript
// 策略：使用 tagged union 区分版本
const UserV1 = Schema.struct({
  _version: Schema.literal("v1"),
  name: Schema.string
})

const UserV2 = Schema.struct({
  _version: Schema.literal("v2"),
  firstName: Schema.string,
  lastName: Schema.string
})

const User = Schema.union(UserV1, UserV2)

const migrate = (user: Schema.Schema.Type<typeof User>) => {
  if (user._version === "v1") {
    return { ...user, firstName: user.name, lastName: "", _version: "v2" as const }
  }
  return user
}
```

### 9.3 品牌类型在多步骤流程中的保持

```typescript
// 确保品牌类型在整个 Pipeline 中不被意外丢失
const processUserId = (raw: unknown) =>
  Schema.decode(Effect)(UserId, raw).pipe(
    Effect.andThen((id) => {
      // 此处 id 仍然是 UserId 类型
      return lookupUser(id)
    }),
    Effect.andThen((user) => {
      // 如果 users.get 返回了未经 Schema 解码的数据
      // 需要重新校验
      return Schema.decode(Effect)(UserSchema, user)
    })
  )
```

---

## 10. 渐进式：从简单到深度集成

### 10.1 简单 Schema → Schema + Brand

```typescript
// Phase 1: 简单校验
const UserName = Schema.string.pipe(Schema.nonEmpty())

// Phase 2: 品牌类型 + 约束
const UserName = Schema.string.pipe(
  Schema.nonEmpty(),
  Schema.maxLength(100),
  Schema.brand("UserName")
)
```

### 10.2 Schema + Effect Pipeline

```typescript
// Phase 3: 将 Schema 解码直接接入 Effect 管道
const program = Schema.decode(Effect)(UserSchema, rawInput).pipe(
  Effect.andThen((user) => saveToDatabase(user)),
  Effect.catchAll((err) => logValidationError(err))
)
```

### 10.3 Schema + Layer 配置加载

```typescript
// Phase 4: 将 Schema 校验后的配置作为 Layer 依赖
class AppConfig extends Context.Tag("AppConfig")<
  AppConfig,
  Schema.Schema.Type<typeof AppConfigSchema>
>() {}

const AppConfigLive = Layer.effect(
  AppConfig,
  Schema.decode(Effect)(AppConfigSchema, process.env).pipe(
    Effect.catchAll(Effect.die)
  )
)
```

---

## 11. 开发者技能：Schema-first 设计思维

使用 `@effect/schema` 不仅是学会 API，更重要的是建立 **"Schema-first"** 的设计思维：

| 思维方式 | 传统做法 | Schema-first 做法 |
|----------|---------|------------------|
| 数据边界 | 隐式信任输入 | 显式声明 Schema 边界 |
| 类型安全 | 依靠 TypeScript 编译 | 编译 + 运行时双层校验 |
| 错误处理 | if/else 逐字段检查 | ParseResult 统一管道 |
| 序列化 | 手动 JSON.parse/stringify | Schema 自动编解码转换 |
| 版本管理 | 隐式假设格式不变 | Schema 显式版本策略 |

这种思维方式的核心是：**在系统边界处，永远不要信任数据的类型声明，永远使用 Schema 进行校验**。无论是 API 边界、文件边界、进程边界还是网络边界。

---

## 本章小结

- **`@effect/schema` 的定位**：不是又一个 Zod 替代品，而是 Effect 生态中数据校验、编解码、序列化的统一基础设施
- **核心优势**：AST 驱动的 Schema 定义、品牌类型双保险、与 Effect Pipeline 原生集成
- **使用场景**：API 校验、配置加载、环境变量解析、数据库映射、消息序列化
- **最佳实践**：模块级 Schema 定义、选择正确的解码模式、在系统边界处总是使用 Schema
- **与 Zod 的关系**：如果只做独立校验，Zod 完全够用；如果使用 Effect 生态，@effect/schema 可以避免心智转换成本

---

## 参考

- `@effect/schema` 文档：https://effect.website/docs/schema/introduction
- API 参考：`Schema` (`@effect/schema`), `ParseResult` (`effect/ParseResult`), `Serializable` (`effect/Serializable`)
- 相关章节：ch06（结构化并发中的消息序列化）、ch12（与 Express/Fastify 集成）