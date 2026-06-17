# 第10章 @effect/schema：类型安全的数据校验与转换

## 10.1 引言：为什么需要 Schema

在现代 TypeScript 应用开发中，类型安全是一个核心追求。TypeScript 编译器提供了强大的静态类型检查能力，能够在编译阶段捕获大量类型错误。然而，TypeScript 的类型系统有一个根本性的局限：**类型只在编译时存在，在运行时完全被擦除**。这意味着，当你的应用与外部世界交互时——接收 HTTP 请求、解析 JSON 数据、读取数据库记录、处理消息队列消息——你无法依赖 TypeScript 类型来保证数据的正确性。

这种"类型擦除"问题导致了大量运行时错误。一个典型的场景是：后端 API 返回的数据结构发生了变化，但前端代码仍然按照旧的类型定义来使用数据，结果在运行时出现 `undefined is not a function` 或 `Cannot read properties of undefined` 等错误。传统的解决方案是手动编写运行时校验逻辑，例如使用 `if (typeof x === 'string')` 这样的条件判断，或者使用 `zod`、`io-ts`、`yup` 等第三方校验库。但这些方案都有一个共同的问题：**类型定义和运行时校验是分离的**，你需要维护两套代码，它们很容易不同步。

让我们深入分析一下"两套代码不同步"带来的具体问题。假设你有一个用户管理系统，你定义了一个 TypeScript 接口 `User`，同时用 Zod 定义了一个校验 Schema。在项目初期，这两者是一致的。但随着需求变化，你可能在接口中添加了一个 `phone` 字段，却忘记更新校验 Schema。或者反过来，你在校验 Schema 中添加了 `role` 字段的枚举约束，却没有更新接口定义。这种不一致会导致以下问题：

- **类型安全假象**：TypeScript 认为数据是 `User` 类型，但运行时实际数据可能缺少字段或包含无效值。
- **调试困难**：错误在运行时才暴露，而且错误信息往往不明确，难以定位是类型定义还是校验逻辑的问题。
- **维护成本高**：每次修改都需要同时更新两处代码，增加了认知负担和出错概率。
- **团队协作问题**：不同开发者可能只更新了其中一处，导致代码库逐渐出现不一致。

在一个中等规模的项目中，这种不一致可能每周都会出现几次。随着团队规模增长和迭代速度加快，问题会呈指数级恶化。`@effect/schema` 通过"单一数据源"的理念从根本上解决了这个问题。

`@effect/schema` 解决了这个根本性问题。它的核心理念是：**Schema 是单一数据源**。你只需要定义一次 Schema，它就能同时生成 TypeScript 类型和运行时校验器。这意味着：

1. **类型和校验永远同步**：修改 Schema 后，TypeScript 类型和运行时校验逻辑会自动更新，不会出现不一致的情况。
2. **减少重复代码**：不需要分别定义接口和校验函数，Schema 就是唯一的真相来源。
3. **编译时和运行时双重保障**：TypeScript 在编译时检查类型，Schema 在运行时验证数据，两者互为补充。

`@effect/schema` 不仅仅是一个校验库，它是一个完整的 Schema 系统，提供了从定义、校验、转换到序列化的全套能力。它的设计哲学是"AST 级别转换"——每个 Schema 在内部都表示为一个抽象语法树（AST），你可以检查和操作这个 AST，实现 Schema 的转换、组合和优化。

本章将深入探讨 `@effect/schema` 的核心概念、高级用法和最佳实践。我们将从基础 Schema 定义开始，逐步深入到 AST 转换、Branded 类型、Filtered Schema，最后讨论如何在实际生产环境中使用 Schema 来构建类型安全的 HTTP API。

## 10.2 Schema 基础

### 10.2.1 Schema 的定义

在 `@effect/schema` 中，Schema 是一个描述数据结构的声明式定义。最基本的 Schema 定义方式如下：

```typescript
import { Schema } from "@effect/schema"

const PersonSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})
```

这段代码定义了一个 `PersonSchema`，它描述了一个包含 `id`、`name`、`age` 和 `email` 四个字段的对象结构。每个字段都使用对应的原始类型 Schema（`Schema.Number`、`Schema.String`）来定义。

Schema 的定义是声明式的，这意味着你描述的是"数据应该是什么样子"，而不是"如何校验数据"。这种声明式的方式使得 Schema 易于阅读、理解和维护。更重要的是，Schema 的定义本身也是可组合的——你可以将小的 Schema 组合成大的 Schema，就像用乐高积木搭建复杂的结构一样。

### 10.2.2 从 Schema 推导类型

`@effect/schema` 提供了类型工具，可以从 Schema 自动推导出 TypeScript 类型：

```typescript
type Person = Schema.Schema.Type<typeof PersonSchema>
// 等价于：
// { readonly id: number; readonly name: string; readonly age: number; readonly email: string }
```

这个类型是"只读"的（`readonly`），这符合函数式编程的不可变性原则。如果你需要可变版本，可以使用 `Schema.Schema.Encoded` 来获取编码后的类型。

类型推导的机制是：`@effect/schema` 在编译时通过 TypeScript 的类型系统，从 Schema 的结构中提取出对应的类型信息。这个过程是自动的，不需要任何手动映射。当你修改 Schema 时，推导出的类型会自动更新，TypeScript 编译器会立即检查所有使用该类型的地方是否仍然正确。

```typescript
// 更复杂的类型推导
const ComplexSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  tags: Schema.Array(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  status: Schema.Literal("active", "inactive", "pending"),
})

type Complex = Schema.Schema.Type<typeof ComplexSchema>
// {
//   readonly id: number;
//   readonly name: string;
//   readonly tags: readonly string[];
//   readonly metadata: { readonly [x: string]: unknown };
//   readonly status: "active" | "inactive" | "pending";
// }
```

### 10.2.3 运行时校验

Schema 的核心功能之一是运行时校验。`@effect/schema` 提供了三种主要的校验操作：

**decode（解码）**：将未知数据解析为类型安全的值。这是最常用的操作，通常用于处理外部输入。

```typescript
const decodePerson = Schema.decode(PersonSchema)

// 成功时返回 Right 值
const person = await Effect.runPromise(decodePerson({ id: 1, name: "Alice", age: 30, email: "alice@example.com" }))

// 失败时返回 Left 错误
const error = await Effect.runPromise(
  decodePerson({ id: "abc", name: "Bob", age: "unknown", email: 123 }).pipe(
    Effect.catchAll((e) => Effect.succeed(e.message))
  )
)
```

**encode（编码）**：将类型安全的值序列化为未知数据。这通常用于准备输出数据，例如在发送 HTTP 响应之前。

```typescript
const encodePerson = Schema.encode(PersonSchema)
const plainObject = await Effect.runPromise(encodePerson(person))
```

**assert（断言）**：仅验证数据是否符合 Schema，不进行转换。这在性能敏感的场景中很有用。

```typescript
const assertPerson = Schema.asserts(PersonSchema)
await Effect.runPromise(assertPerson(someUnknownData))
```

这三种操作覆盖了数据校验的完整生命周期：输入时解码、内部处理、输出时编码。decode 和 encode 是互逆操作，它们共同保证了数据在系统边界的一致性。assert 则是一种轻量级的校验方式，适用于只需要验证而不需要转换的场景。

### 10.2.4 原始类型 Schema

`@effect/schema` 提供了丰富的原始类型 Schema，覆盖了 JavaScript 的所有基本类型：

- `Schema.String`：字符串
- `Schema.Number`：数字
- `Schema.Boolean`：布尔值
- `Schema.BigInt`：大整数
- `Schema.Symbol`：符号
- `Schema.Undefined`：undefined
- `Schema.Null`：null
- `Schema.Void`：void
- `Schema.Any`：任意类型
- `Schema.Unknown`：未知类型
- `Schema.Never`：永不类型

此外，还有一些特殊的原始类型：

- `Schema.Int`：整数
- `Schema.Positive`：正数
- `Schema.NonNegative`：非负数
- `Schema.NonEmptyString`：非空字符串
- `Schema.UUID`：UUID 格式字符串
- `Schema.Email`：电子邮件格式字符串

这些特殊类型实际上是原始类型与约束的组合。例如，`Schema.Int` 等价于 `Schema.Number.pipe(Schema.int())`，`Schema.Email` 等价于 `Schema.String.pipe(Schema.email())`。这种设计使得你可以从简单的原始类型出发，通过组合约束来构建更精确的类型。

除了上述类型，`@effect/schema` 还提供了以下原始类型：

- `Schema.Date`：日期类型，在解码时接受 Date 对象或 ISO 字符串，在编码时输出 ISO 字符串
- `Schema.Json`：JSON 兼容类型，确保数据可以安全地序列化为 JSON
- `Schema.Uint8Array`：Uint8Array 类型，适用于二进制数据处理
- `Schema.Clamp`：数值裁剪，将超出范围的值裁剪到范围内而不是报错

```typescript
// Date 类型的双向转换
const DateSchema = Schema.Date
// 解码时：接受 "2024-01-15T00:00:00.000Z" 或 new Date("2024-01-15")
// 编码时：输出 "2024-01-15T00:00:00.000Z"

// Clamp 示例
const ClampedNumber = Schema.Number.pipe(Schema.clamp(Schema.between(0, 100)))
// 输入 150 会被裁剪为 100，输入 -10 会被裁剪为 0
```

### 10.2.5 组合 Schema

Schema 的强大之处在于可以组合。你可以将简单的 Schema 组合成复杂的结构：

```typescript
const AddressSchema = Schema.Struct({
  street: Schema.String,
  city: Schema.String,
  zipCode: Schema.String.pipe(Schema.pattern(/^\d{5}$/)),
})

const ContactSchema = Schema.Struct({
  phone: Schema.String,
  email: Schema.String.pipe(Schema.email()),
})

const EmployeeSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  address: AddressSchema,
  contact: ContactSchema,
  tags: Schema.Array(Schema.String),
})
```

这种组合方式与 TypeScript 的类型组合非常相似，但多了运行时校验的能力。

组合 Schema 时，`@effect/schema` 会自动推导出组合后的类型。例如，`EmployeeSchema` 的类型会自动包含 `AddressSchema` 和 `ContactSchema` 的所有字段，不需要手动定义接口。

Schema 的组合不仅限于 Struct。你可以将任意 Schema 组合在一起：

```typescript
// 组合多个 Schema 片段
const BaseEntity = Schema.Struct({
  id: Schema.Number,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

const UserEntity = Schema.Struct({
  ...BaseEntity.fields,
  name: Schema.String,
  email: Schema.String.pipe(Schema.email()),
})

// 使用 Intersect 组合
const Timestamped = Schema.Struct({
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

const FullUser = Schema.Intersect(
  Schema.Intersect(BaseEntity, Timestamped),
  Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  })
)
```

### 10.2.6 数组和元组

`@effect/schema` 支持数组和元组类型：

```typescript
// 数组
const StringArray = Schema.Array(Schema.String)
const NumberArray = Schema.Array(Schema.Number)

// 元组
const Pair = Schema.Tuple(Schema.String, Schema.Number)
const Triple = Schema.Tuple(Schema.String, Schema.Number, Schema.Boolean)
```

数组和元组还支持更高级的用法：

```typescript
// 非空数组
const NonEmptyArray = Schema.NonEmptyArray(Schema.String)

// 固定长度数组
const FixedArray = Schema.Array(Schema.String).pipe(Schema.maxItems(5))

// 带剩余元素的元组
const TupleWithRest = Schema.Tuple(
  [Schema.String, Schema.Number],
  Schema.Boolean  // 剩余元素类型
)
// 类型: [string, number, ...boolean[]]

// 可选元组元素
const OptionalTuple = Schema.Tuple(
  Schema.String,
  Schema.optional(Schema.Number),
)
// 类型: [string, number | undefined]
```

### 10.2.7 联合类型和交叉类型

```typescript
// 联合类型
const Status = Schema.Union(Schema.String, Schema.Number)

// 可辨识联合
const ApiResponse = Schema.Union(
  Schema.Struct({ type: Schema.Literal("success"), data: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
)

// 交叉类型
const Named = Schema.Struct({ name: Schema.String })
const Aged = Schema.Struct({ age: Schema.Number })
const Person = Schema.Intersect(Named, Aged)
```

可辨识联合（Discriminated Union）是 TypeScript 中非常常见的模式，`@effect/schema` 对其有原生支持。当联合类型的每个成员都有一个共同的字面量字段（如 `type`）时，Schema 会自动使用这个字段来区分不同的成员，从而提供更精确的错误信息和更高效的校验。

```typescript
// 更复杂的可辨识联合
const Shape = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("circle"),
    radius: Schema.Number.pipe(Schema.positive()),
  }),
  Schema.Struct({
    kind: Schema.Literal("rectangle"),
    width: Schema.Number.pipe(Schema.positive()),
    height: Schema.Number.pipe(Schema.positive()),
  }),
  Schema.Struct({
    kind: Schema.Literal("triangle"),
    base: Schema.Number.pipe(Schema.positive()),
    height: Schema.Number.pipe(Schema.positive()),
  }),
)

type Shape = Schema.Schema.Type<typeof Shape>
// { readonly kind: "circle"; readonly radius: number }
// | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
// | { readonly kind: "triangle"; readonly base: number; readonly height: number }
```

### 10.2.8 字面量类型

```typescript
const Role = Schema.Literal("admin", "user", "guest")
// 类型为 "admin" | "user" | "guest"
```

字面量类型在可辨识联合、枚举替代和配置管理中非常有用。与 TypeScript 的 `as const` 类似，`Schema.Literal` 创建的是精确的字面量类型，而不是通用的字符串类型。

```typescript
// 数字字面量
const HttpStatus = Schema.Literal(200, 201, 400, 401, 403, 404, 500)

// 布尔字面量
const Flag = Schema.Literal(true, false)

// 混合字面量
const MixedLiteral = Schema.Literal("active", 0, true)
```

### 10.2.9 递归 Schema 和懒加载 Schema

在处理树形结构或图结构数据时，Schema 需要能够引用自身。`@effect/schema` 通过 `Schema.suspend` 支持递归 Schema：

```typescript
// 树形结构
interface TreeNode {
  value: number
  children: TreeNode[]
}

const TreeNodeSchema: Schema.Schema<TreeNode> = Schema.Struct({
  value: Schema.Number,
  children: Schema.Array(Schema.suspend(() => TreeNodeSchema)),
})

// 链表结构
interface LinkedList {
  value: number
  next: LinkedList | null
}

const LinkedListSchema: Schema.Schema<LinkedList> = Schema.Struct({
  value: Schema.Number,
  next: Schema.Union(
    Schema.Null,
    Schema.suspend(() => LinkedListSchema),
  ),
})

// JSON 值（递归定义）
const JsonSchema: Schema.Schema<JsonValue> = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
  Schema.Array(Schema.suspend(() => JsonSchema)),
  Schema.Record(Schema.String, Schema.suspend(() => JsonSchema)),
)
```

`Schema.suspend` 通过延迟求值（lazy evaluation）来打破递归定义中的无限循环。在 Schema 首次被使用时，`suspend` 中的回调函数才会被执行，此时 Schema 已经定义完毕，可以安全地引用自身。

### 10.2.10 Record 和 Map 类型

除了 Struct 和 Array，`@effect/schema` 还支持键值对集合类型：

```typescript
// Record 类型（类似对象）
const StringMap = Schema.Record(Schema.String, Schema.Number)
// 类型: { readonly [x: string]: number }

// 枚举键的 Record
const RolePermissions = Schema.Record(
  Schema.Literal("admin", "user", "guest"),
  Schema.Array(Schema.String),
)

// Map 类型
const NumberMap = Schema.Map(Schema.String, Schema.Number)
// 类型: Map<string, number>
```

Record 和 Map 的区别在于：Record 对应普通的 JavaScript 对象，而 Map 对应 ES6 的 `Map` 数据结构。Record 的键必须是字符串或数字字面量，而 Map 的键可以是任意类型。

## 10.3 Schema 的 AST 级别转换

### 10.3.1 AST 结构

`@effect/schema` 的一个独特特性是它的 AST（抽象语法树）架构。每个 Schema 在内部都表示为一个 AST 节点，你可以检查和操作这个 AST。这使得 Schema 转换变得非常灵活和强大。

```typescript
const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

const ast = PersonSchema.ast
console.log(ast._tag) // "Struct"
```

AST 节点的 `_tag` 属性标识了节点的类型。常见的 AST 节点类型包括：

- `Struct`：对象结构
- `Union`：联合类型
- `Intersect`：交叉类型
- `Array`：数组类型
- `Tuple`：元组类型
- `Literal`：字面量类型
- `String`、`Number`、`Boolean` 等：原始类型
- `Transform`：转换类型
- `Refinement`：精炼类型

AST 的结构是树状的。每个节点可以包含子节点，子节点又可以包含更深层的子节点。例如，一个 `Struct` 节点的 `fields` 属性包含了所有字段的 Schema，每个字段的 Schema 本身又是一个 AST 节点。这种树状结构使得你可以递归地遍历和转换整个 Schema。

让我们深入分析一个复杂 Schema 的 AST 结构：

```typescript
const ComplexSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.int(), Schema.between(0, 150)),
  address: Schema.Struct({
    street: Schema.String,
    city: Schema.String,
  }),
  tags: Schema.Array(Schema.String),
  role: Schema.Literal("admin", "user"),
})
```

这个 Schema 的 AST 结构如下：

```
Struct
├── name: String
├── age: Refinement
│   ├── target: Refinement
│   │   ├── target: Number
│   │   └── constraint: int()
│   └── constraint: between(0, 150)
├── address: Struct
│   ├── street: String
│   └── city: String
├── tags: Array
│   └── element: String
└── role: Literal("admin", "user")
```

每个 AST 节点都包含丰富的元信息。例如，`Struct` 节点包含字段名到字段 Schema 的映射，`Refinement` 节点包含目标 Schema 和约束条件，`Literal` 节点包含所有允许的字面量值。

### 10.3.2 通过 AST 转换 Schema

AST 级别转换允许你编写通用的 Schema 转换函数。例如，将所有字段变为可选：

```typescript
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
```

这种转换能力在以下场景中非常有用：

1. **API 版本迁移**：将旧版本的 Schema 转换为新版本
2. **部分更新**：创建只包含部分字段的 Schema
3. **国际化**：根据语言环境调整字段的校验规则
4. **权限控制**：根据用户角色隐藏或暴露某些字段

更高级的 AST 转换示例——递归地将所有字段变为可选：

```typescript
const deepMakeOptional = (schema: Schema.Schema<any>): Schema.Schema<any> => {
  const ast = schema.ast
  switch (ast._tag) {
    case "Struct": {
      const structAst = ast as AST.Struct
      const optionalFields = Object.fromEntries(
        Object.entries(structAst.fields).map(([key, field]) => [
          key,
          Schema.optional(deepMakeOptional(field)),
        ]),
      )
      return Schema.Struct(optionalFields)
    }
    case "Array": {
      const arrayAst = ast as AST.Array
      return Schema.Array(deepMakeOptional(arrayAst.element))
    }
    case "Union": {
      const unionAst = ast as AST.Union
      return Schema.Union(...unionAst.types.map(deepMakeOptional))
    }
    default:
      return schema
  }
}
```

另一个实用的 AST 转换——重命名字段：

```typescript
const renameField = (
  schema: Schema.Schema<any>,
  oldName: string,
  newName: string,
): Schema.Schema<any> => {
  if (schema.ast._tag === "Struct") {
    const structAst = schema.ast as AST.Struct
    const fields = { ...structAst.fields }
    if (oldName in fields) {
      fields[newName] = fields[oldName]
      delete fields[oldName]
    }
    return Schema.Struct(fields)
  }
  return schema
}

// 使用示例：将 API v1 的 "name" 重命名为 v2 的 "fullName"
const UserV2Schema = renameField(UserV1Schema, "name", "fullName")
```

AST 转换还可以用于添加字段：

```typescript
const addField = (
  schema: Schema.Schema<any>,
  fieldName: string,
  fieldSchema: Schema.Schema<any>,
  defaultValue?: unknown,
): Schema.Schema<any> => {
  if (schema.ast._tag === "Struct") {
    const structAst = schema.ast as AST.Struct
    const fields = {
      ...structAst.fields,
      [fieldName]: defaultValue !== undefined
        ? fieldSchema.pipe(Schema.default(defaultValue))
        : fieldSchema,
    }
    return Schema.Struct(fields)
  }
  return schema
}

// 使用示例：为所有响应 Schema 添加时间戳
const withTimestamp = (schema: Schema.Schema<any>) =>
  addField(schema, "timestamp", Schema.Number, Date.now())
```

### 10.3.3 Transform Schema

`@effect/schema` 提供了 `Schema.transform` 来定义类型之间的转换：

```typescript
const StringToNumber = Schema.transform(
  Schema.String,
  Schema.Number,
  { decode: (s) => parseFloat(s), encode: (n) => String(n) },
)
```

这个 Schema 在解码时将字符串转换为数字，在编码时将数字转换回字符串。这在处理表单数据或 URL 参数时非常有用。

Transform Schema 的核心是 `decode` 和 `encode` 两个函数。`decode` 函数将编码后的数据（通常是外部输入）转换为类型安全的值，`encode` 函数则执行反向操作。这两个函数必须是互逆的，即 `encode(decode(x)) === x` 对于所有有效的输入都成立。

更复杂的 Transform 示例——日期字符串转换：

```typescript
const DateFromString = Schema.transform(
  Schema.String,
  Schema.Date,
  {
    decode: (s) => {
      const date = new Date(s)
      if (isNaN(date.getTime())) {
        throw new Error(`无效的日期字符串: ${s}`)
      }
      return date
    },
    encode: (d) => d.toISOString(),
  },
)

// 对象结构转换
const ApiV1ToV2 = Schema.transform(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    email: Schema.String,
  }),
  Schema.Struct({
    id: Schema.Number,
    fullName: Schema.String,
    email: Schema.String,
    role: Schema.Literal("admin", "user").pipe(Schema.default("user")),
  }),
  {
    decode: (v1) => ({
      id: v1.id,
      fullName: v1.name,
      email: v1.email,
      role: "user" as const,
    }),
    encode: (v2) => ({
      id: v2.id,
      name: v2.fullName,
      email: v2.email,
    }),
  },
)
```

Transform Schema 还可以用于数据脱敏：

```typescript
const MaskedEmail = Schema.transform(
  Schema.String,
  Schema.String,
  {
    decode: (email) => {
      const [local, domain] = email.split("@")
      return `${local[0]}***@${domain}`
    },
    encode: (masked) => masked, // 不可逆转换
  },
)
```

### 10.3.4 Schema 的管道操作

`pipe` 方法是 Schema 组合的核心。它允许你将多个 Schema 操作串联起来：

```typescript
const PositiveEmailSchema = Schema.String.pipe(
  Schema.email(),
  Schema.maxLength(100),
  Schema.filter((s) => s.includes("@")),
)
```

`pipe` 的每个参数都是一个 Schema 转换或精炼操作，它们按顺序应用。

`pipe` 方法的执行顺序是从左到右的。每个操作接收前一个操作的输出作为输入。这种链式调用的方式使得 Schema 的构建非常直观和可读。

```typescript
// 复杂的管道链
const ValidatedPassword = Schema.String.pipe(
  Schema.minLength(8, { message: () => "密码至少 8 个字符" }),
  Schema.maxLength(128, { message: () => "密码最多 128 个字符" }),
  Schema.pattern(/[A-Z]/, { message: () => "需要大写字母" }),
  Schema.pattern(/[a-z]/, { message: () => "需要小写字母" }),
  Schema.pattern(/[0-9]/, { message: () => "需要数字" }),
  Schema.pattern(/[!@#$%^&*]/, { message: () => "需要特殊字符" }),
  Schema.brand("StrongPassword"),
)
```

### 10.3.5 AST 节点类型详解

`@effect/schema` 的 AST 系统包含丰富的节点类型。以下是主要节点类型的详细说明：

**类型节点（Type Nodes）**：
- `String`：字符串类型，无子节点
- `Number`：数字类型，无子节点
- `Boolean`：布尔类型，无子节点
- `BigInt`：大整数类型，无子节点
- `Symbol`：符号类型，无子节点
- `Undefined`：undefined 类型，无子节点
- `Null`：null 类型，无子节点
- `Any`：任意类型，无子节点
- `Unknown`：未知类型，无子节点
- `Never`：永不类型，无子节点
- `Literal`：字面量类型，包含 `literal` 属性（字面量值）
- `UniqueSymbol`：唯一符号类型

**结构节点（Structural Nodes）**：
- `Struct`：对象结构，包含 `fields` 属性（字段名到 Schema 的映射）和 `record` 属性（可选的通配符字段）
- `Union`：联合类型，包含 `types` 属性（Schema 数组）
- `Intersect`：交叉类型，包含 `types` 属性（Schema 数组）
- `Array`：数组类型，包含 `element` 属性（元素 Schema）
- `Tuple`：元组类型，包含 `elements` 属性（元素 Schema 数组）和 `rest` 属性（剩余元素 Schema）

**修饰节点（Modifier Nodes）**：
- `Refinement`：精炼类型，包含 `target` 属性（目标 Schema）和 `filter` 属性（过滤函数）
- `Transform`：转换类型，包含 `from` 属性（源 Schema）、`to` 属性（目标 Schema）和 `decode`/`encode` 函数
- `Suspend`：延迟求值类型，包含 `f` 属性（返回 Schema 的函数）

了解这些节点类型是编写高级 AST 转换函数的基础。通过递归遍历 AST 树，你可以实现几乎任何 Schema 转换。

```typescript
// 打印 Schema 的 AST 结构
const printAST = (schema: Schema.Schema<any>, indent: number = 0): void => {
  const prefix = "  ".repeat(indent)
  const ast = schema.ast
  console.log(`${prefix}_tag: ${ast._tag}`)

  switch (ast._tag) {
    case "Struct": {
      const structAst = ast as AST.Struct
      for (const [key, field] of Object.entries(structAst.fields)) {
        console.log(`${prefix}  field "${key}":`)
        printAST(field, indent + 2)
      }
      break
    }
    case "Union": {
      const unionAst = ast as AST.Union
      unionAst.types.forEach((t, i) => {
        console.log(`${prefix}  member ${i}:`)
        printAST(t, indent + 2)
      })
      break
    }
    case "Array": {
      const arrayAst = ast as AST.Array
      console.log(`${prefix}  element:`)
      printAST(arrayAst.element, indent + 2)
      break
    }
    case "Refinement": {
      const refAst = ast as AST.Refinement
      console.log(`${prefix}  target:`)
      printAST(refAst.target, indent + 2)
      break
    }
    default:
      break
  }
}
```

## 10.4 Branded 类型

### 10.4.1 什么是 Branded 类型

Branded 类型是 TypeScript 中的一种类型安全技术，它通过在类型上添加一个"品牌"标记来创建名义类型（nominal type）。在 TypeScript 的结构类型系统中，两个结构相同的类型被认为是兼容的，这可能导致一些难以发现的错误。例如，`UserId` 和 `OrderId` 都是数字，但将用户 ID 传递给需要订单 ID 的函数是一个逻辑错误。

Branded 类型通过在底层类型上添加一个唯一的品牌标记来解决这个问题：

```typescript
type UserId = number & Brand.Brand<"UserId">
type OrderId = number & Brand.Brand<"OrderId">
```

现在，`UserId` 和 `OrderId` 在类型层面是不兼容的，即使它们底层都是数字。

Branded 类型的本质是利用 TypeScript 的交叉类型（Intersection Type）和符号（Symbol）特性。`Brand.Brand<"UserId">` 在类型层面添加了一个不可见的标记，这个标记只在编译时存在，在运行时被完全擦除。因此，Branded 类型不会带来任何运行时开销。

### 10.4.2 在 Schema 中使用 Brand

`@effect/schema` 与 `effect/Brand` 模块无缝集成：

```typescript
const UserIdSchema = Schema.Number.pipe(
  Schema.brand("UserId"),
)

const OrderIdSchema = Schema.Number.pipe(
  Schema.brand("OrderId"),
)
```

当使用这些 Schema 解码数据时，返回的值会自动带上 Brand 标记，确保类型安全。

Brand 与 Schema 的集成是双向的：在解码时，Schema 会验证底层类型并添加 Brand 标记；在编码时，Schema 会移除 Brand 标记，返回底层类型的值。这种设计使得 Branded 类型在系统内部提供类型安全保障，同时与外部系统交互时保持兼容。

```typescript
// 完整的 Brand 使用流程
const decodeUserId = Schema.decode(UserIdSchema)

// 解码后得到 Branded 类型
const userId = await Effect.runPromise(decodeUserId(123))
// userId 的类型是 number & Brand.Brand<"UserId">

// 类型安全的函数
const getUserById = (id: UserId) => { /* ... */ }

getUserById(userId) // OK
getUserById(123) // TypeScript 编译错误！普通数字不能赋值给 UserId
```

### 10.4.3 Branded 类型的实际应用

Branded 类型在以下场景中特别有用：

1. **实体标识符**：区分不同类型的 ID（用户 ID、订单 ID、产品 ID）
2. **货币和单位**：区分不同货币的金额（USD、EUR、JPY）
3. **安全敏感数据**：标记已验证的电子邮件、已哈希的密码
4. **业务约束**：标记已审批的订单、已支付的交易

```typescript
type Email = string & Brand.Brand<"Email">
type HashedPassword = string & Brand.Brand<"HashedPassword">
type VerifiedEmail = Email & Brand.Brand<"Verified">
```

通过组合 Brand，你可以创建非常精确的类型，在编译时捕获业务逻辑错误。

更丰富的实际应用示例：

```typescript
// 货币和金额
type USD = number & Brand.Brand<"USD">
type EUR = number & Brand.Brand<"EUR">
type JPY = number & Brand.Brand<"JPY">

const USDSchema = Schema.Number.pipe(Schema.brand("USD"))
const EURSchema = Schema.Number.pipe(Schema.brand("EUR"))

// 类型安全的货币运算
const addUSD = (a: USD, b: USD): USD => (a + b) as USD
const convertToEUR = (usd: USD, rate: number): EUR => (usd * rate) as EUR

// 编译时防止货币混淆
const price: USD = 100 as USD
const tax: EUR = 20 as EUR
// addUSD(price, tax) // TypeScript 编译错误！

// 多品牌组合
type VerifiedAdminUser = VerifiedEmail & Brand.Brand<"Admin">

const VerifiedAdminSchema = Schema.String.pipe(
  Schema.email(),
  Schema.brand("Email"),
  Schema.brand("Verified"),
  Schema.brand("Admin"),
)

// 品牌继承模式
type BaseId = number & Brand.Brand<"BaseId">
type UserId = BaseId & Brand.Brand<"UserId">
type ProductId = BaseId & Brand.Brand<"ProductId">

// 带业务约束的 Brand
type NonNegativeNumber = number & Brand.Brand<"NonNegative">
type PositiveInt = NonNegativeNumber & Brand.Brand<"PositiveInt">

const PositiveIntSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.brand("NonNegative"),
  Schema.brand("PositiveInt"),
)
```

### 10.4.4 Brand 的运行时行为

Brand 在运行时实际上是通过一个 `_tag` 属性来实现的。当你解码一个 Branded Schema 时，返回的值会包含一个 `_tag` 属性，其值为品牌名称。这个属性在编码时会被移除。

```typescript
const UserIdSchema = Schema.Number.pipe(Schema.brand("UserId"))

// 解码后的值
const userId = await Effect.runPromise(Schema.decode(UserIdSchema)(123))
// { _tag: "UserId", value: 123 }

// 编码后的值
const plain = await Effect.runPromise(Schema.encode(UserIdSchema)(userId))
// 123
```

这种设计使得 Branded 类型在系统内部提供严格的类型安全保障，同时在与外部系统交互时自动转换为普通类型，无需手动处理。

## 10.5 Filtered Schema 和业务规则

### 10.5.1 使用 Filter 添加业务规则

`Schema.filter` 允许你在 Schema 层面添加自定义的业务规则约束：

```typescript
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
```

Filter 函数接收待校验的值作为参数，返回 `boolean` 或 `Effect<boolean>`。返回 `true` 表示校验通过，返回 `false` 表示校验失败。Filter 还可以返回一个 `ParseError` 来提供更详细的错误信息。

```typescript
// 返回详细错误信息的 Filter
const ComplexFilter = Schema.String.pipe(
  Schema.filter((s) => {
    if (s.length < 3) {
      return ParseError("字符串长度至少为 3")
    }
    if (s.length > 20) {
      return ParseError("字符串长度不能超过 20")
    }
    return true
  }),
)
```

### 10.5.2 内置约束

`@effect/schema` 提供了丰富的内置约束：

- `Schema.minLength(n)`：最小长度
- `Schema.maxLength(n)`：最大长度
- `Schema.pattern(regex)`：正则表达式匹配
- `Schema.email()`：电子邮件格式
- `Schema.uuid()`：UUID 格式
- `Schema.int()`：整数
- `Schema.positive()`：正数
- `Schema.nonNegative()`：非负数
- `Schema.between(min, max)`：数值范围
- `Schema.greaterThan(n)`：大于
- `Schema.lessThan(n)`：小于
- `Schema.minItems(n)`：数组最小长度
- `Schema.maxItems(n)`：数组最大长度

这些内置约束实际上是预定义的 Filter 函数。例如，`Schema.minLength(3)` 等价于：

```typescript
Schema.filter((s: string) => s.length >= 3, {
  message: (s) => `字符串长度至少为 3，实际长度为 ${s.length}`,
})
```

内置约束的优势在于它们提供了标准化的错误消息格式和更好的性能。在可能的情况下，优先使用内置约束而不是自定义 Filter。

### 10.5.3 自定义错误消息

每个约束和 filter 都支持自定义错误消息：

```typescript
const PasswordSchema = Schema.String.pipe(
  Schema.minLength(8, { message: () => "密码至少需要 8 个字符" }),
  Schema.filter(
    (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s),
    { message: () => "密码必须包含大小写字母和数字" },
  ),
)
```

自定义错误消息支持国际化。你可以根据当前语言环境返回不同语言的错误消息：

```typescript
const createPasswordSchema = (locale: string) =>
  Schema.String.pipe(
    Schema.minLength(8, {
      message: () => locale === "zh" ? "密码至少需要 8 个字符" : "Password must be at least 8 characters",
    }),
    Schema.filter(
      (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s),
      {
        message: () => locale === "zh"
          ? "密码必须包含大小写字母和数字"
          : "Password must contain uppercase, lowercase, and numbers",
      },
    ),
  )
```

### 10.5.4 组合多个约束

约束可以通过 `pipe` 组合，形成复杂的校验规则：

```typescript
const StrongPassword = Schema.String.pipe(
  Schema.minLength(8),
  Schema.maxLength(128),
  Schema.pattern(/[A-Z]/),
  Schema.pattern(/[a-z]/),
  Schema.pattern(/[0-9]/),
  Schema.pattern(/[!@#$%^&*]/),
)
```

### 10.5.5 跨字段验证

在实际业务中，很多校验规则涉及多个字段之间的关系。例如，密码确认、日期范围、价格与折扣的关系等。`@effect/schema` 支持跨字段验证：

```typescript
const RegistrationSchema = Schema.Struct({
  password: Schema.String.pipe(Schema.minLength(8)),
  confirmPassword: Schema.String,
}).pipe(
  Schema.filter((data) => data.password === data.confirmPassword, {
    message: () => "两次输入的密码不一致",
  }),
)

const DateRangeSchema = Schema.Struct({
  startDate: Schema.Date,
  endDate: Schema.Date,
}).pipe(
  Schema.filter((data) => data.startDate < data.endDate, {
    message: () => "开始日期必须早于结束日期",
  }),
)

const OrderSchema = Schema.Struct({
  items: Schema.Array(Schema.Struct({
    price: Schema.Number.pipe(Schema.positive()),
    quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  })),
  discount: Schema.Number.pipe(Schema.between(0, 1)),
  shipping: Schema.Number.pipe(Schema.nonNegative()),
}).pipe(
  Schema.filter((order) => {
    const subtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity, 0
    )
    const total = subtotal * (1 - order.discount) + order.shipping
    return total > 0
  }, {
    message: () => "订单总金额必须大于 0",
  }),
)
```

### 10.5.6 异步验证

某些业务规则需要异步验证，例如检查用户名是否已存在、验证邮箱是否有效等。`@effect/schema` 的 Filter 支持返回 `Effect`：

```typescript
const UniqueUsernameSchema = Schema.String.pipe(
  Schema.minLength(3),
  Schema.filter((username) =>
    Effect.gen(function* () {
      const exists = yield* checkUsernameExists(username)
      if (exists) {
        return ParseError(`用户名 "${username}" 已被占用`)
      }
      return true
    }),
    { message: () => "用户名验证失败" },
  ),
)

// 异步验证邮箱
const ValidEmailSchema = Schema.String.pipe(
  Schema.email(),
  Schema.filter((email) =>
    Effect.gen(function* () {
      const isValid = yield* verifyEmailDomain(email)
      return isValid
    }),
    { message: () => "邮箱域名验证失败" },
  ),
)
```

异步验证与 Effect 的深度集成使得你可以轻松地组合多个异步校验规则，同时利用 Effect 的错误处理、重试和超时机制。

## 10.6 生产级 HTTP API Schema 定义

### 10.6.1 通用 API 响应包装

在生产环境中，API 响应通常有统一的格式。你可以使用 Schema 来定义这个格式：

```typescript
const ApiResponse = <A>(schema: Schema.Schema<A>) =>
  Schema.Struct({
    success: Schema.Boolean,
    data: schema,
    timestamp: Schema.Number,
    requestId: Schema.String,
  })
```

这个泛型函数接受一个数据 Schema，返回一个包装后的 API 响应 Schema。

更完整的 API 响应包装，包括错误响应：

```typescript
// 成功响应
const SuccessResponse = <A>(schema: Schema.Schema<A>) =>
  Schema.Struct({
    success: Schema.Literal(true),
    data: schema,
    timestamp: Schema.Number,
    requestId: Schema.String,
    version: Schema.String.pipe(Schema.default("1.0")),
  })

// 错误响应
const ErrorResponse = Schema.Struct({
  success: Schema.Literal(false),
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    details: Schema.optional(Schema.Unknown),
    stack: Schema.optional(Schema.String),
  }),
  timestamp: Schema.Number,
  requestId: Schema.String,
})

// 统一的 API 响应
const ApiResponseV2 = <A>(schema: Schema.Schema<A>) =>
  Schema.Union(
    SuccessResponse(schema),
    ErrorResponse,
  )
```

### 10.6.2 请求验证

使用 Schema 验证 HTTP 请求体：

```typescript
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String.pipe(Schema.email()),
  password: Schema.String.pipe(Schema.minLength(8)),
})

// 在路由处理中使用
const handleCreateUser = (req: CreateUserRequest): Effect.Effect<ApiResponse> => {
  // 处理逻辑
}
```

更完整的请求验证中间件模式：

```typescript
// 请求验证中间件
const validateRequest = <A>(
  schema: Schema.Schema<A>,
  request: unknown,
): Effect.Effect<A, ParseError> =>
  Schema.decode(schema)(request)

// 在 HTTP 路由中使用
const createUserHandler = (req: IncomingMessage): Effect.Effect<ApiResponse> =>
  Effect.gen(function* () {
    // 解析请求体
    const body = yield* parseRequestBody(req)

    // 验证请求体
    const validBody = yield* validateRequest(CreateUserRequest, body)

    // 处理业务逻辑
    const user = yield* createUser(validBody)

    // 返回响应
    return {
      success: true,
      data: user,
      timestamp: Date.now(),
      requestId: req.headers["x-request-id"] as string || "",
    }
  }).pipe(
    Effect.catchAll((error) => {
      if (error instanceof ParseError) {
        return Effect.succeed({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.message,
          },
          timestamp: Date.now(),
          requestId: req.headers["x-request-id"] as string || "",
        })
      }
      return Effect.succeed({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器内部错误",
        },
        timestamp: Date.now(),
        requestId: req.headers["x-request-id"] as string || "",
      })
    }),
  )

// 查询参数验证
const QueryParamsSchema = Schema.Struct({
  page: Schema.optional(Schema.String.pipe(Schema.int())).pipe(Schema.default("1")),
  pageSize: Schema.optional(Schema.String.pipe(Schema.int())).pipe(Schema.default("20")),
  sort: Schema.optional(Schema.String),
  search: Schema.optional(Schema.String),
}).pipe(
  Schema.transform(
    QueryParamsSchema,
    Schema.Struct({
      page: Schema.Number.pipe(Schema.int(), Schema.positive()),
      pageSize: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
      sort: Schema.optional(Schema.String),
      search: Schema.optional(Schema.String),
    }),
    {
      decode: (params) => ({
        page: parseInt(params.page, 10),
        pageSize: parseInt(params.pageSize, 10),
        sort: params.sort,
        search: params.search,
      }),
      encode: (params) => ({
        page: String(params.page),
        pageSize: String(params.pageSize),
        sort: params.sort,
        search: params.search,
      }),
    },
  ),
)
```

### 10.6.3 分页和查询参数

```typescript
const PaginationParams = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.positive()),
  pageSize: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
  sort: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.String),
})
```

更完整的分页响应 Schema：

```typescript
// 分页响应
const PaginatedResponse = <A>(schema: Schema.Schema<A>) =>
  Schema.Struct({
    data: Schema.Array(schema),
    pagination: Schema.Struct({
      page: Schema.Number,
      pageSize: Schema.Number,
      totalItems: Schema.Number,
      totalPages: Schema.Number,
      hasNext: Schema.Boolean,
      hasPrev: Schema.Boolean,
    }),
  })

// 排序参数
const SortParams = Schema.Struct({
  field: Schema.String,
  order: Schema.Literal("asc", "desc").pipe(Schema.default("asc")),
})

// 高级查询参数
const AdvancedQueryParams = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.positive()).pipe(Schema.default(1)),
  pageSize: Schema.Number.pipe(Schema.int(), Schema.between(1, 100)).pipe(Schema.default(20)),
  sort: Schema.optional(SortParams),
  search: Schema.optional(Schema.String),
  filters: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  include: Schema.optional(Schema.Array(Schema.String)),
})
```

### 10.6.4 默认值和可选字段

Schema 支持默认值和可选字段，这在处理不完整的输入数据时非常有用：

```typescript
const MetadataSchema = Schema.Struct({
  version: Schema.String.pipe(Schema.default("1.0")),
  source: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String).pipe(Schema.default([])),
})
```

当输入数据缺少某些字段时，Schema 会自动填充默认值，而不是报错。

默认值的计算可以是惰性的，即每次解码时重新计算：

```typescript
const RequestSchema = Schema.Struct({
  timestamp: Schema.Number.pipe(Schema.default(() => Date.now())),
  requestId: Schema.String.pipe(Schema.default(() => crypto.randomUUID())),
  userAgent: Schema.optional(Schema.String),
  ipAddress: Schema.optional(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.default({})),
})
```

### 10.6.5 Schema 演化

在实际项目中，API 会随着时间演化。Schema 可以帮助你管理这种演化：

```typescript
// v1 Schema
const UserV1 = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
})

// v2 Schema
const UserV2 = Schema.Struct({
  id: Schema.Number,
  fullName: Schema.String,
  email: Schema.String,
  phone: Schema.optional(Schema.String),
  role: Schema.Literal("admin", "user").pipe(Schema.default("user")),
})

// 迁移函数
const migrateV1toV2 = (v1: Schema.Schema.Type<typeof UserV1>): UserV2 => ({
  id: v1.id,
  fullName: v1.name,
  email: v1.email,
  phone: undefined,
  role: "user" as const,
})
```

这种模式让你能够安全地处理 API 版本迁移，同时保持向后兼容性。

更系统的 Schema 演化策略：

```typescript
// 版本化的 Schema 注册表
interface SchemaRegistry {
  [version: string]: {
    schema: Schema.Schema<any>
    migrateFrom?: Record<string, (data: any) => any>
  }
}

const UserSchemaRegistry: SchemaRegistry = {
  "v1": {
    schema: UserV1,
  },
  "v2": {
    schema: UserV2,
    migrateFrom: {
      "v1": (v1: Schema.Schema.Type<typeof UserV1>): UserV2 => ({
        id: v1.id,
        fullName: v1.name,
        email: v1.email,
        phone: undefined,
        role: "user" as const,
      }),
    },
  },
  "v3": {
    schema: Schema.Struct({
      id: Schema.Number,
      fullName: Schema.String,
      email: Schema.String,
      phone: Schema.optional(Schema.String),
      role: Schema.Literal("admin", "user", "moderator").pipe(Schema.default("user")),
      preferences: Schema.Struct({
        theme: Schema.Literal("light", "dark").pipe(Schema.default("light")),
        notifications: Schema.Boolean.pipe(Schema.default(true)),
      }).pipe(Schema.default({ theme: "light", notifications: true })),
    }),
    migrateFrom: {
      "v2": (v2: any) => ({
        ...v2,
        preferences: { theme: "light", notifications: true },
      }),
    },
  },
}

// 自动迁移函数
const migrateToLatest = <T>(
  data: unknown,
  fromVersion: string,
  registry: SchemaRegistry,
): T => {
  const versions = Object.keys(registry).sort()
  const fromIndex = versions.indexOf(fromVersion)
  const toIndex = versions.length - 1

  let current = data
  for (let i = fromIndex; i < toIndex; i++) {
    const currentVersion = versions[i]
    const nextVersion = versions[i + 1]
    const migrator = registry[nextVersion].migrateFrom?.[currentVersion]
    if (migrator) {
      current = migrator(current)
    }
  }

  return current as T
}
```

### 10.6.6 OpenAPI/Swagger 生成

`@effect/schema` 可以与 OpenAPI 规范集成，从 Schema 自动生成 API 文档：

```typescript
// 从 Schema 生成 OpenAPI 规范
const generateOpenAPI = (schemas: Record<string, Schema.Schema<any>>) => {
  const paths: Record<string, any> = {}

  for (const [name, schema] of Object.entries(schemas)) {
    paths[`/${name}`] = {
      get: {
        summary: `获取 ${name}`,
        responses: {
          "200": {
            description: "成功",
            content: {
              "application/json": {
                schema: schemaToOpenAPI(schema),
              },
            },
          },
        },
      },
    }
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "API 文档",
      version: "1.0.0",
    },
    paths,
  }
}

// 将 Schema 转换为 OpenAPI Schema 对象
const schemaToOpenAPI = (schema: Schema.Schema<any>): any => {
  const ast = schema.ast
  switch (ast._tag) {
    case "String":
      return { type: "string" }
    case "Number":
      return { type: "number" }
    case "Boolean":
      return { type: "boolean" }
    case "Struct": {
      const structAst = ast as AST.Struct
      const properties: Record<string, any> = {}
      for (const [key, field] of Object.entries(structAst.fields)) {
        properties[key] = schemaToOpenAPI(field)
      }
      return {
        type: "object",
        properties,
      }
    }
    case "Array": {
      const arrayAst = ast as AST.Array
      return {
        type: "array",
        items: schemaToOpenAPI(arrayAst.element),
      }
    }
    case "Literal": {
      const literalAst = ast as AST.Literal
      return { type: typeof literalAst.literal, enum: [literalAst.literal] }
    }
    default:
      return {}
  }
}
```

### 10.6.7 版本化 API 处理器

结合 Schema 演化，可以构建版本化的 API 处理器：

```typescript
// 版本化路由处理器
const createVersionedHandler = <T>(
  version: string,
  requestSchema: Schema.Schema<T>,
  handler: (data: T) => Effect.Effect<any>,
) => {
  return (req: IncomingMessage): Effect.Effect<any> =>
    Effect.gen(function* () {
      const body = yield* parseRequestBody(req)
      const validData = yield* Schema.decode(requestSchema)(body)
      return yield* handler(validData)
    })
}

// 使用示例
const v1CreateUser = createVersionedHandler(
  "v1",
  CreateUserRequestV1,
  (data) => createUser(data),
)

const v2CreateUser = createVersionedHandler(
  "v2",
  CreateUserRequestV2,
  (data) => createUser(data),
)

// 版本路由
const routeByVersion = (
  req: IncomingMessage,
  handlers: Record<string, (req: IncomingMessage) => Effect.Effect<any>>,
) => {
  const version = req.headers["accept-version"] as string || "v1"
  const handler = handlers[version]
  if (!handler) {
    return Effect.succeed({
      status: 400,
      body: { error: `不支持的 API 版本: ${version}` },
    })
  }
  return handler(req)
}
```

## 10.7 Schema 与 Effect 的集成

### 10.7.1 在 Effect 中使用 Schema

Schema 的 decode/encode/assert 操作都返回 `Effect`，这意味着你可以将它们无缝集成到 Effect 工作流中：

```typescript
const program = Effect.gen(function* () {
  const rawData: unknown = fetchDataFromAPI()
  const validated = yield* Schema.decode(MySchema)(rawData)
  // 现在 validated 是类型安全的
  yield* processData(validated)
})
```

### 10.7.2 错误处理

Schema 校验失败时返回 `ParseError`，你可以使用 Effect 的错误处理机制来捕获和处理：

```typescript
const safeDecode = Schema.decode(MySchema)(rawData).pipe(
  Effect.catchAll((error) => {
    console.error("校验失败:", error.message)
    return Effect.succeed(defaultValue)
  }),
)
```

更完善的错误处理策略：

```typescript
// 分层错误处理
class ValidationError extends Error {
  readonly _tag = "ValidationError"
  constructor(
    message: string,
    readonly path: string[],
    readonly rawValue: unknown,
  ) {
    super(message)
  }
}

const decodeWithContext = <A>(
  schema: Schema.Schema<A>,
  data: unknown,
  context: string,
): Effect.Effect<A, ValidationError> =>
  Schema.decode(schema)(data).pipe(
    Effect.mapError((parseError) => {
      const path = extractErrorPath(parseError)
      return new ValidationError(
        `[${context}] ${parseError.message}`,
        path,
        data,
      )
    }),
  )

// 错误路径提取
const extractErrorPath = (error: ParseError): string[] => {
  const path: string[] = []
  let current = error
  while (current.cause) {
    if (current.cause._tag === "Type") {
      path.unshift(current.cause.actual)
    }
    current = current.cause
  }
  return path
}
```

### 10.7.3 Schema 与依赖注入

Schema 可以与 Effect 的依赖注入系统结合使用，实现可配置的校验规则：

```typescript
class ValidationConfig extends Effect.Tag("ValidationConfig")<
  ValidationConfig,
  { strictMode: boolean }
>() {}

const validateWithConfig = (schema: Schema.Schema<any>, data: unknown) =>
  Effect.gen(function* () {
    const config = yield* ValidationConfig
    if (config.strictMode) {
      return yield* Schema.decode(schema)(data)
    }
    return yield* Schema.decode(schema.pipe(Schema.partial()))(data)
  })
```

更复杂的依赖注入示例——可配置的校验规则：

```typescript
// 可配置的校验规则
class ValidationRules extends Effect.Tag("ValidationRules")<
  ValidationRules,
  {
    passwordMinLength: number
    requireSpecialChars: boolean
    maxLoginAttempts: number
  }
>() {}

const createUserSchema = Effect.gen(function* () {
  const rules = yield* ValidationRules

  let passwordSchema = Schema.String.pipe(
    Schema.minLength(rules.passwordMinLength),
  )

  if (rules.requireSpecialChars) {
    passwordSchema = passwordSchema.pipe(
      Schema.pattern(/[!@#$%^&*]/),
    )
  }

  return Schema.Struct({
    username: Schema.String.pipe(Schema.minLength(3)),
    email: Schema.String.pipe(Schema.email()),
    password: passwordSchema,
  })
})

// 在应用中使用
const program = Effect.gen(function* () {
  const schema = yield* createUserSchema
  const user = yield* Schema.decode(schema)(requestBody)
  // ...
}).pipe(
  Effect.provideService(ValidationRules, {
    passwordMinLength: 8,
    requireSpecialChars: true,
    maxLoginAttempts: 5,
  }),
)
```

### 10.7.4 Schema 与 Effect 的日志系统

Schema 校验失败时，可以利用 Effect 的日志系统记录详细信息：

```typescript
const decodeWithLogging = <A>(
  schema: Schema.Schema<A>,
  data: unknown,
  operation: string,
): Effect.Effect<A, ParseError> =>
  Schema.decode(schema)(data).pipe(
    Effect.tapError((error) =>
      Effect.logError("Schema 校验失败", {
        operation,
        error: error.message,
        data: JSON.stringify(data),
      }),
    ),
    Effect.tap((validData) =>
      Effect.logDebug("Schema 校验成功", {
        operation,
        data: JSON.stringify(validData),
      }),
    ),
  )
```

## 10.8 性能优化

### 10.8.1 Schema 缓存

`@effect/schema` 内部对 Schema 进行了缓存，避免重复解析。但在某些场景下，你可以进一步优化：

1. **复用 Schema 实例**：将 Schema 定义为模块级别的常量，避免在每次请求时重新创建。
2. **使用 assert 代替 decode**：当不需要转换数据时，assert 比 decode 更快。
3. **预编译 Schema**：对于频繁使用的 Schema，可以预编译为校验函数。

```typescript
// 预编译 Schema 为校验函数
const compiledValidator = Schema.asserts(MySchema)

// 在热路径中使用
const processBatch = (items: unknown[]) => {
  for (const item of items) {
    Effect.runSync(compiledValidator(item))
  }
}
```

### 10.8.2 懒加载 Schema

对于大型 Schema 或循环引用的 Schema，可以使用懒加载：

```typescript
const CategorySchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  children: Schema.Array(Schema.suspend(() => CategorySchema)),
})
```

懒加载 Schema 的另一个用途是优化启动性能。如果你的应用定义了大量的 Schema，但每个请求只使用其中一小部分，可以将不常用的 Schema 定义为懒加载：

```typescript
// 懒加载的大型 Schema
const LazyLargeSchema = Schema.suspend(() => {
  console.log("LargeSchema 被首次加载")
  return Schema.Struct({
    // 大量字段定义
  })
})
```

### 10.8.3 选择性校验

在某些场景下，你可能只需要校验部分字段。可以使用 `Schema.pick` 和 `Schema.omit` 来选择字段：

```typescript
const PartialPerson = Schema.pick(PersonSchema, "name", "email")
const PersonWithoutId = Schema.omit(PersonSchema, "id")
```

选择性校验在以下场景中特别有用：

1. **部分更新（PATCH）**：只校验请求中包含的字段
2. **字段级权限控制**：根据用户角色只校验有权限的字段
3. **渐进式表单验证**：分步骤验证表单的不同部分

```typescript
// 部分更新 Schema
const PartialUpdateSchema = Schema.partial(PersonSchema)

// 字段级权限控制
const adminFields = Schema.pick(PersonSchema, "id", "name", "email", "role", "permissions")
const userFields = Schema.pick(PersonSchema, "name", "email")
```

### 10.8.4 性能基准测试

在实际生产环境中，了解 Schema 操作的性能特征非常重要。以下是一些基准测试示例：

```typescript
// 基准测试辅助函数
const benchmark = async <A>(
  name: string,
  fn: () => A,
  iterations: number = 10000,
): Promise<void> => {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const end = performance.now()
  const avg = (end - start) / iterations
  console.log(`${name}: ${avg.toFixed(3)}ms/op (${iterations} iterations)`)
}

// 比较 decode 和 assert 的性能
const testSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String.pipe(Schema.email()),
  age: Schema.Number.pipe(Schema.int(), Schema.between(0, 150)),
})

const testData = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  age: 30,
}

const decodeFn = () => Effect.runSync(Schema.decode(testSchema)(testData))
const assertFn = () => Effect.runSync(Schema.asserts(testSchema)(testData))

// assert 通常比 decode 快 2-5 倍，因为它不进行数据转换
```

### 10.8.5 Schema 编译优化

对于高频调用的 Schema，可以将其编译为原生的 JavaScript 函数，获得接近手写校验的性能：

```typescript
// 编译 Schema 为原生函数
const compiledDecode = Schema.compile(Schema.decode(PersonSchema))
const compiledAssert = Schema.compile(Schema.asserts(PersonSchema))

// 编译后的函数没有 Effect 包装，直接返回结果或抛出异常
try {
  const person = compiledDecode(rawData)
  // 处理 person
} catch (error) {
  // 处理校验错误
}
```

编译优化适用于以下场景：

1. **高吞吐量的 API 端点**：每秒处理数千次请求
2. **批量数据处理**：处理大量记录的数据导入/导出
3. **实时数据流处理**：对每条消息进行快速校验

## 10.9 与其他校验库的对比

### 10.9.1 vs Zod

Zod 是目前最流行的 TypeScript 校验库之一。与 Zod 相比，`@effect/schema` 有以下优势：

1. **AST 级别转换**：`@effect/schema` 支持 AST 级别操作，而 Zod 不支持。
2. **与 Effect 深度集成**：Schema 操作返回 Effect，可以无缝集成到 Effect 工作流中。
3. **双向转换**：Schema 同时支持 decode 和 encode，而 Zod 主要关注解析。
4. **更丰富的类型系统**：Branded 类型、Filtered Schema 等高级特性。

**详细功能对比矩阵**：

| 特性 | @effect/schema | Zod |
|------|---------------|-----|
| 类型推导 | 原生支持 | 原生支持 |
| 运行时校验 | 原生支持 | 原生支持 |
| 双向转换（encode/decode） | 原生支持 | 有限支持（transform） |
| AST 级别操作 | 完整支持 | 不支持 |
| Branded 类型 | 原生支持 | 需手动实现 |
| 递归 Schema | 支持（suspend） | 支持（lazy） |
| 异步校验 | 原生支持（Effect） | 支持（Promise） |
| 错误消息自定义 | 支持 | 支持 |
| 与函数式生态集成 | Effect 生态 | 独立 |
| 性能 | 优秀（可编译优化） | 良好 |
| 学习曲线 | 较陡（需理解 Effect） | 较平缓 |
| 社区规模 | 较小但活跃 | 大型社区 |
| 文档质量 | 良好 | 优秀 |

**性能对比**（基准测试数据）：

```typescript
// 在相同条件下，@effect/schema 的 decode 操作
// 比 Zod 的 parse 操作快约 20-40%
// 编译后的 @effect/schema 比 Zod 快约 50-80%

// Zod 版本
import { z } from "zod"
const zodSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
})

// @effect/schema 版本
const effectSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String.pipe(Schema.email()),
})

// 编译后的 @effect/schema 版本
const compiledSchema = Schema.compile(Schema.decode(effectSchema))
```

**生态系统对比**：

- **Zod**：拥有丰富的第三方集成，包括 `@anatine/zod-nestjs`（NestJS 集成）、`zod-to-json-schema`（JSON Schema 生成）、`zod-to-openapi`（OpenAPI 生成）、`zod-form-data`（表单数据处理）等。
- **@effect/schema**：与 Effect 生态深度集成，包括 `@effect/platform`（HTTP 处理）、`@effect/sql`（数据库）、`@effect/rpc`（RPC 框架）等。虽然第三方集成较少，但 Effect 生态内部的集成非常紧密。

**学习曲线对比**：

- **Zod**：学习曲线平缓，API 设计直观，与普通 TypeScript 代码风格接近。适合快速上手。
- **@effect/schema**：学习曲线较陡，需要理解 Effect 的核心概念（Effect、Layer、Tag 等）。但一旦掌握，可以获得更强大的功能和更好的类型安全性。

**选择建议**：

- 选择 Zod 的场景：小型项目、快速原型、团队对函数式编程不熟悉、需要丰富的第三方集成。
- 选择 @effect/schema 的场景：大型项目、已经使用 Effect 生态、需要 AST 级别转换、需要 Branded 类型、对类型安全有极高要求。

### 10.9.2 vs io-ts

io-ts 是 fp-ts 生态中的校验库。`@effect/schema` 在设计上受到了 io-ts 的影响，但有以下改进：

1. **更好的错误消息**：提供更详细和可读的错误信息。
2. **更简洁的 API**：使用 `Schema.Struct` 而不是 `t.type`。
3. **更好的性能**：内部实现更高效。
4. **更丰富的内置类型**：提供了更多开箱即用的类型和约束。

**详细对比**：

| 特性 | @effect/schema | io-ts |
|------|---------------|-------|
| API 风格 | 声明式、链式调用 | 函数式、组合式 |
| 错误消息 | 详细、可读 | 较简略 |
| 内置类型 | 丰富 | 基础 |
| 性能 | 优秀 | 良好 |
| 与 Effect 集成 | 原生 | 需适配 |
| 维护状态 | 活跃开发 | 维护模式 |

```typescript
// io-ts 版本
import * as t from "io-ts"
const PersonIO = t.type({
  id: t.number,
  name: t.string,
  email: t.string,
})

// @effect/schema 版本
const PersonEffect = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
})
```

### 10.9.3 vs Yup

Yup 是另一个流行的校验库，主要用于表单验证。`@effect/schema` 的优势在于：

1. **类型安全**：Yup 的类型推导不如 `@effect/schema` 精确。
2. **函数式编程**：与 Effect 的函数式编程范式一致。
3. **更广泛的应用场景**：不仅适用于表单验证，还适用于 API 校验、数据序列化等。

**详细对比**：

| 特性 | @effect/schema | Yup |
|------|---------------|-----|
| 主要应用场景 | 通用数据校验 | 表单验证 |
| 类型推导 | 精确、完整 | 有限 |
| 链式调用 | 支持（pipe） | 支持 |
| 条件校验 | 支持（filter） | 支持（when） |
| 异步校验 | 原生支持 | 支持 |
| 性能 | 优秀 | 良好 |
| 包体积 | 中等 | 较小 |

```typescript
// Yup 版本
import * as yup from "yup"
const yupSchema = yup.object({
  name: yup.string().required(),
  email: yup.string().email().required(),
  age: yup.number().min(0).max(150),
})

// @effect/schema 版本
const effectSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String.pipe(Schema.email()),
  age: Schema.Number.pipe(Schema.between(0, 150)),
})
```

### 10.9.4 vs JSON Schema / Ajv

JSON Schema 是一种与语言无关的 Schema 规范，Ajv 是 JavaScript 中最流行的 JSON Schema 实现。`@effect/schema` 与 JSON Schema 的对比：

| 特性 | @effect/schema | JSON Schema / Ajv |
|------|---------------|-------------------|
| 语言绑定 | TypeScript 原生 | 语言无关 |
| 类型推导 | 自动推导 | 需额外工具（如 json-schema-to-ts） |
| 表达能力 | 强（支持 Transform、Brand 等） | 标准化的有限表达 |
| 互操作性 | Effect 生态 | 跨语言 |
| 性能 | 优秀 | 优秀（Ajv 编译优化） |
| 学习曲线 | 中等 | 较陡（JSON Schema 规范复杂） |

JSON Schema 的优势在于跨语言互操作性，而 `@effect/schema` 的优势在于与 TypeScript 和 Effect 生态的深度集成。在实际项目中，你可以将 `@effect/schema` 转换为 JSON Schema，以支持跨语言场景：

```typescript
// @effect/schema 转 JSON Schema（概念示例）
const toJsonSchema = (schema: Schema.Schema<any>): any => {
  // 递归转换 AST 为 JSON Schema
  // 实现细节取决于具体需求
}
```

## 10.10 最佳实践

### 10.10.1 Schema 组织

在大型项目中，建议按以下方式组织 Schema：

```
src/
  schemas/
    user.schema.ts
    product.schema.ts
    order.schema.ts
    common/
      pagination.schema.ts
      api-response.schema.ts
```

更详细的目录结构建议：

```
src/
  schemas/
    user/
      user.schema.ts          # 用户核心 Schema
      user-request.schema.ts  # 用户相关请求 Schema
      user-response.schema.ts # 用户相关响应 Schema
    product/
      product.schema.ts
      product-category.schema.ts
    order/
      order.schema.ts
      order-item.schema.ts
    common/
      pagination.schema.ts
      api-response.schema.ts
      date-time.schema.ts
      money.schema.ts
    validators/
      password.validator.ts
      email.validator.ts
    transforms/
      date.transform.ts
      money.transform.ts
```

### 10.10.2 Schema 命名约定

- 使用 `PascalCase` 命名 Schema 变量
- 使用 `Schema` 后缀：`UserSchema`、`ProductSchema`
- 使用 `Request`/`Response` 后缀区分输入输出：`CreateUserRequest`、`UserResponse`

更详细的命名约定：

```typescript
// 实体 Schema
UserSchema           // 用户实体
ProductSchema        // 产品实体
OrderSchema          // 订单实体

// 请求 Schema
CreateUserRequest    // 创建用户请求
UpdateUserRequest    // 更新用户请求
GetUserQuery         // 查询用户参数

// 响应 Schema
UserResponse         // 用户响应
UserListResponse     // 用户列表响应
PaginatedResponse    // 分页响应

// 值对象 Schema
EmailSchema          // 电子邮件
PhoneSchema          // 电话号码
MoneySchema          // 金额

// 枚举 Schema
UserRole             // 用户角色
OrderStatus          // 订单状态
```

### 10.10.3 错误处理策略

1. **在边界处校验**：在系统边界（API 入口、消息队列消费者）进行 Schema 校验。
2. **提供友好的错误消息**：使用自定义错误消息，而不是默认的机器可读消息。
3. **记录校验失败**：使用 Effect 的日志系统记录校验失败，便于调试。

更详细的错误处理策略：

```typescript
// 统一的错误处理中间件
const withValidation = <A>(
  schema: Schema.Schema<A>,
  handler: (data: A) => Effect.Effect<any>,
): (raw: unknown) => Effect.Effect<any> =>
  (raw: unknown) =>
    Schema.decode(schema)(raw).pipe(
      Effect.mapError((error) => ({
        status: 400,
        body: {
          code: "VALIDATION_ERROR",
          message: "请求数据校验失败",
          details: formatParseError(error),
        },
      })),
      Effect.flatMap(handler),
    )

// 格式化 ParseError 为可读的错误信息
const formatParseError = (error: ParseError): ValidationErrorDetail[] => {
  const details: ValidationErrorDetail[] = []

  const walk = (e: ParseError, path: string[] = []) => {
    if (e._tag === "Type") {
      details.push({
        path: [...path, e.actual],
        message: e.message,
        expected: e.expected,
      })
    }
    if (e.cause) {
      walk(e.cause, path)
    }
  }

  walk(error)
  return details
}

interface ValidationErrorDetail {
  path: string[]
  message: string
  expected: string
}
```

### 10.10.4 测试策略

1. **测试 Schema 定义**：确保 Schema 能正确解析有效数据。
2. **测试校验规则**：确保 Schema 能正确拒绝无效数据。
3. **测试转换逻辑**：确保 Transform Schema 的 decode 和 encode 逻辑正确。
4. **测试边界条件**：测试空值、边界值、特殊字符等。

更详细的测试策略和示例：

```typescript
import { describe, it, expect } from "vitest"

describe("UserSchema", () => {
  // 测试有效数据
  it("应该正确解析有效的用户数据", async () => {
    const validData = {
      id: 1,
      name: "Alice",
      email: "alice@example.com",
      age: 30,
    }

    const result = await Effect.runPromise(
      Schema.decode(UserSchema)(validData)
    )

    expect(result).toEqual(validData)
  })

  // 测试无效数据
  it("应该拒绝无效的电子邮件", async () => {
    const invalidData = {
      id: 1,
      name: "Alice",
      email: "not-an-email",
      age: 30,
    }

    const result = await Effect.runPromise(
      Schema.decode(UserSchema)(invalidData).pipe(
        Effect.catchAll((error) => Effect.succeed(error)),
      )
    )

    expect(result).toBeInstanceOf(ParseError)
    expect(result.message).toContain("email")
  })

  // 测试边界条件
  it("应该拒绝负数的年龄", async () => {
    const invalidData = {
      id: 1,
      name: "Alice",
      email: "alice@example.com",
      age: -1,
    }

    const result = await Effect.runPromise(
      Schema.decode(UserSchema)(invalidData).pipe(
        Effect.catchAll((error) => Effect.succeed(error)),
      )
    )

    expect(result).toBeInstanceOf(ParseError)
  })

  // 测试 Transform Schema
  it("StringToNumber 应该正确转换", async () => {
    const result = await Effect.runPromise(
      Schema.decode(StringToNumber)("123.45")
    )

    expect(result).toBe(123.45)

    const encoded = await Effect.runPromise(
      Schema.encode(StringToNumber)(123.45)
    )

    expect(encoded).toBe("123.45")
  })

  // 测试 Branded 类型
  it("应该返回 Branded 类型的值", async () => {
    const result = await Effect.runPromise(
      Schema.decode(UserIdSchema)(123)
    )

    // 验证类型
    const userId: UserId = result
    expect(userId).toBeDefined()
  })

  // 测试递归 Schema
  it("应该正确解析递归 Schema", async () => {
    const treeData = {
      value: 1,
      children: [
        { value: 2, children: [] },
        { value: 3, children: [{ value: 4, children: [] }] },
      ],
    }

    const result = await Effect.runPromise(
      Schema.decode(TreeNodeSchema)(treeData)
    )

    expect(result.value).toBe(1)
    expect(result.children).toHaveLength(2)
  })

  // 测试默认值
  it("应该填充默认值", async () => {
    const data = { name: "Alice" }
    const schema = Schema.Struct({
      name: Schema.String,
      role: Schema.Literal("admin", "user").pipe(Schema.default("user")),
    })

    const result = await Effect.runPromise(
      Schema.decode(schema)(data)
    )

    expect(result.role).toBe("user")
  })

  // 测试跨字段验证
  it("应该验证密码一致性", async () => {
    const data = {
      password: "password123",
      confirmPassword: "different",
    }

    const result = await Effect.runPromise(
      Schema.decode(RegistrationSchema)(data).pipe(
        Effect.catchAll((error) => Effect.succeed(error)),
      )
    )

    expect(result).toBeInstanceOf(ParseError)
    expect(result.message).toContain("密码不一致")
  })
})
```

### 10.10.5 性能优化策略

1. **Schema 复用**：将 Schema 定义为模块级常量
2. **编译优化**：对高频 Schema 使用 `Schema.compile`
3. **选择性校验**：使用 `Schema.pick` 和 `Schema.omit` 减少校验范围
4. **懒加载**：对大型 Schema 使用 `Schema.suspend`
5. **缓存校验结果**：对不变的数据缓存校验结果

```typescript
// 缓存校验结果
class ValidationCache {
  private cache = new Map<string, unknown>()

  getOrValidate<A>(
    key: string,
    schema: Schema.Schema<A>,
    data: unknown,
  ): Effect.Effect<A> {
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      return Effect.succeed(cached as A)
    }

    return Schema.decode(schema)(data).pipe(
      Effect.tap((valid) => {
        this.cache.set(key, valid)
      }),
    )
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}
```

### 10.10.6 团队协作规范

在团队中使用 `@effect/schema` 时，建议建立以下规范：

1. **Schema 审查**：在 Code Review 中重点检查 Schema 定义的正确性和完整性
2. **Schema 版本控制**：使用 Git 追踪 Schema 的变更历史
3. **Schema 文档**：为每个 Schema 添加 JSDoc 注释，说明其用途和约束
4. **Schema 测试覆盖率**：要求每个 Schema 都有对应的测试用例
5. **Schema 变更通知**：Schema 变更时通知相关团队成员

```typescript
/**
 * 用户创建请求 Schema
 *
 * 用于 POST /api/v1/users 接口的请求体验证
 *
 * @remarks
 * - name: 用户名，至少 2 个字符，最多 50 个字符
 * - email: 有效的电子邮件地址
 * - password: 密码，至少 8 个字符，必须包含大小写字母和数字
 * - role: 用户角色，默认为 "user"
 *
 * @example
 * ```typescript
 * const validRequest = {
 *   name: "Alice",
 *   email: "alice@example.com",
 *   password: "SecurePass123",
 * }
 * ```
 */
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(2, { message: () => "用户名至少 2 个字符" }),
    Schema.maxLength(50, { message: () => "用户名最多 50 个字符" }),
  ),
  email: Schema.String.pipe(
    Schema.email({ message: () => "请输入有效的电子邮件地址" }),
  ),
  password: Schema.String.pipe(
    Schema.minLength(8, { message: () => "密码至少 8 个字符" }),
    Schema.pattern(/[A-Z]/, { message: () => "密码需要包含大写字母" }),
    Schema.pattern(/[a-z]/, { message: () => "密码需要包含小写字母" }),
    Schema.pattern(/[0-9]/, { message: () => "密码需要包含数字" }),
  ),
  role: Schema.Literal("admin", "user").pipe(
    Schema.default("user"),
  ),
})
```

## 10.11 总结

`@effect/schema` 是 Effect 生态中一个强大而灵活的 Schema 系统。它通过"单一数据源"的理念，解决了 TypeScript 类型系统在运行时的局限性。Schema 同时生成 TypeScript 类型和运行时校验器，确保类型定义和校验逻辑永远同步。

本章介绍了 Schema 的核心概念，包括基础 Schema 定义、运行时校验操作、Schema 组合、AST 级别转换、Branded 类型、Filtered Schema 和业务规则约束。我们还讨论了如何在实际生产环境中使用 Schema 来构建类型安全的 HTTP API，包括通用 API 响应包装、请求验证、分页参数、默认值和可选字段，以及 Schema 演化。

`@effect/schema` 的 AST 级别转换能力是其最独特的特性之一。通过操作 Schema 的 AST，你可以编写通用的 Schema 转换函数，实现 Schema 的自动化转换和优化。这种能力在 API 版本迁移、部分更新、国际化等场景中非常有用。

Branded 类型和 Filtered Schema 提供了更精确的类型安全和业务规则约束。Branded 类型通过在类型上添加品牌标记来创建名义类型，防止不同类型之间的混淆。Filtered Schema 允许你在 Schema 层面添加自定义的业务规则约束，确保数据满足业务需求。

在生产环境中，Schema 的最佳实践包括：在系统边界处进行校验、提供友好的错误消息、记录校验失败、以及使用 Schema 演化来管理 API 版本迁移。通过遵循这些最佳实践，你可以构建更健壮、更可维护的 TypeScript 应用。

`@effect/schema` 与 Effect 的深度集成使其成为 Effect 生态中不可或缺的一部分。Schema 操作返回 Effect，可以无缝集成到 Effect 工作流中，与 Effect 的依赖注入、错误处理、日志系统等特性协同工作。

总的来说，`@effect/schema` 是一个值得在 TypeScript 项目中采用的 Schema 系统。它不仅解决了类型安全的问题，还提供了丰富的功能和灵活的扩展能力，适用于从简单的表单验证到复杂的 API 校验等各种场景。通过掌握 `@effect/schema`，你可以显著提高代码的类型安全性和可维护性，减少运行时错误，提升开发效率。

在下一章中，我们将探讨 Effect 的测试能力，包括如何利用 Effect 的依赖注入系统来编写可测试的代码，以及如何使用 TestClock、TestRandom 和 TestConsole 等测试工具来模拟时间、随机数和控制台输出。
