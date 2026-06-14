# 第9章 映射类型与索引类型

---

## 1. 核心概念

### keyof 操作符：取对象的"键名集合"

把 `keyof` 想象成一把"钥匙提取器"——给定一个对象类型，它取出所有键名组成一个联合类型：

```typescript
interface Person {
  name: string;
  age: number;
  email: string;
}

// keyof Person → "name" | "age" | "email"
type PersonKeys = keyof Person;
```

它就像你站在一个抽屉柜前，`keyof` 把所有抽屉的标签撕下来放在你面前。有了这些标签，你就可以用它们去访问对应的值。

### 索引访问类型（T[K]）：用键名取值的类型

和 JS 中 `obj[key]` 访问值一样，TS 允许你用 `T[K]` 语法访问"键 K 对应的值类型"：

```typescript
interface Person {
  name: string;
  age: number;
  email: string;
}

type NameType = Person["name"]; // string
type AgeType = Person["age"];   // number

// 配合 keyof 可以取出所有值的类型
type ValueTypes = Person[keyof Person]; // string | number
```

`Person["name"]` 取的是"name 这个键对应的值的类型"（即 `string`）。`Person[keyof Person]` 相当于 `Person["name" | "age" | "email"]`，得到所有值类型的联合——即 `string | number`。

### 映射类型（Mapped Types）：批量制造新类型

映射类型是 TS 类型系统的"生产线"——输入一个对象类型，输出一个经过变换的新类型：

```typescript
// 基础语法：遍历一个类型的每个键，对其值类型做变换
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

interface Config {
  url: string;
  port: number;
  ssl: boolean;
}

// ConfigReadonly 的每个属性都变成了 readonly
type ConfigReadonly = MyReadonly<Config>;
// 等价于：
// {
//   readonly url: string;
//   readonly port: number;
//   readonly ssl: boolean;
// }
```

理解映射类型的关键是把 `[K in keyof T]` 看作 `for...in` 循环：对 T 的每个键 K，创建一个新属性，值的类型是 `T[K]`（即原始类型），并应用 `readonly` 修饰符。

### 键值重映射（as 子句）：在映射中过滤和修改键名

TS 4.1 引入了 `as` 子句，允许你在映射过程中修改或过滤键名：

```typescript
// 为所有属性添加 "get" 前缀
type WithGetters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

interface User {
  name: string;
  age: number;
}

// 结果：
// {
//   getName: () => string;
//   getAge: () => number;
// }
```

`as` 子句像是一个"传送带分拣器"——每个键经过它时，你可以决定：改名后放行、直接放行、或者扔掉（通过 `never`）：

```typescript
// 过滤掉所有函数类型的属性
type MethodsOnly<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

// 只保留字符串类型的属性
type StringKeys<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};
```

---

## 2. 典型问题与处理

### 2.1 映射类型中的 `-?` 和 `+readonly` 修饰符使用错误

**问题场景**：映射类型中有两个特殊的修饰符——`-?`（移除可选）和 `-readonly`（移除只读）。新手常搞混加减方向。

```typescript
// Bad — 错误使用修饰符方向
interface Options {
  a?: string;
  readonly b: number;
}

// 想创建"所有属性必选且可写"的类型
type Mutable1<T> = {
  [K in keyof T]-readonly: T[K]; // ❌ 语法错误：-readonly 后面不能直接跟 :
};

type Mutable2<T> = {
  [K in keyof T]: -readonly T[K]; // ❌ 语法错误：修饰符位置不对
};

type Required1<T> = {
  [K in keyof T]+?: T[K]; // ❌ +? 不存在！问号只有 -? 和 ?（+? 不是合法语法）
};
```

**为什么不好**：修饰符的语法规则是——`readonly` / `?` 写在冒号之前，`-` 或 `+` 写在修饰符之前。`+` 可以省略（默认就是加），所以 `readonly` 等价于 `+readonly`。但 `+?` 不是合法语法——可选属性的标记只有 `?` 或 `-?`，没有 `+?`。

```typescript
// Good — 正确的修饰符用法
interface Options {
  a?: string;
  readonly b: number;
}

// 去掉 readonly（使属性可写）
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
// 结果：{ a?: string; b: number; }

// 去掉可选（使属性必填）
type Concrete<T> = {
  [K in keyof T]-?: T[K];
};
// 结果：{ a: string; readonly b: number; }

// 同时去掉 readonly 和可选
type WritableRequired<T> = {
  -readonly [K in keyof T]-?: T[K];
};
// 结果：{ a: string; b: number; }
```

**为什么好**：修饰符的位置和语法是固定的——`readonly` 和 `?` 放在 `[K in keyof T]` 之后、冒号之前；用 `-` 前缀表示移除，`+`（可省略）表示添加。记住口诀：**"中括号后面冒号前，加减符号修饰符前"**。

### 2.2 keyof + 索引访问时，键不存在导致的错误

**问题场景**：用索引访问类型时，用了对象上不存在的键。

```typescript
// Bad — 使用不存在的键
interface User {
  name: string;
  age: number;
}

type Username = User["username"]; // ❌ 错误：User 上没有 "username"
```

**为什么不好**：索引访问类型要求键必须在目标类型上存在，否则编译报错。这在重构时很有用——改名后旧键访问会立刻报错——但新手可能被吓到。

```typescript
// Good — 使用 keyof 确保键存在
interface User {
  name: string;
  age: number;
}

// 方式 1：直接使用存在的键
type Username = User["name"]; // ✅ string

// 方式 2：用 keyof 动态获取
type UserKey = keyof User; // "name" | "age"
type UserValue = User[UserKey]; // string | number

// 方式 3：用泛型约束确保键存在
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user: User = { name: "Alice", age: 30 };
const name = getProperty(user, "name"); // ✅ string
// getProperty(user, "username"); // ❌ 编译错误
```

**为什么好**：通过 `extends keyof T` 约束泛型参数 K，编译器能自动检查传入的键是否合法。这既保留了灵活性，又确保了类型安全。

### 2.3 映射类型中 `as` 子句的 `never` 过滤误解

**问题场景**：在 `as` 子句中返回 `never` 来过滤键时，对 `never` 的行为感到困惑。

```typescript
// Bad — 不理解 never 在 as 子句中的含义
type RemoveNullValues<T> = {
  // 想过滤掉值为 null 的属性
  [K in keyof T as T[K] extends null ? never : K]: T[K];
};

interface Data {
  name: string;
  data: null;
  error: Error | null;
}
// 结果：{ name: string; error: Error | null; }
// 注意：error 的值为 Error | null 而非 null，所以不会被过滤
```

**为什么不好**：`as` 子句中的 `never` 不是"空值"的意思，而是"丢弃这个键"的意思。当条件类型返回 `never` 时，这个键就不会出现在结果类型中。另外，条件类型 `T[K] extends null` 只匹配精确的 `null`，不匹配 `Error | null`。

```typescript
// Good — 正确理解 never 在 as 中的含义
// never 在 as 子句中 = "丢弃这个键"

// 过滤掉值为 null 或 undefined 的属性
type RemoveNullableValues<T> = {
  [K in keyof T as T[K] extends null | undefined ? never : K]: T[K];
};

// 只保留值为字符串的属性
type StringValuesOnly<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

// 移除所有键名以 "_" 开头的属性
type RemoveInternal<T> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K];
};

interface Config {
  url: string;
  _secret: string;
  _cache: number;
  timeout: number;
}

type PublicConfig = RemoveInternal<Config>;
// 结果：{ url: string; timeout: number; }
```

**为什么好**：明确 `never` 在 `as` 子句中的语义——它是"排除键"的标记，不是"空值"。结合模板字面量类型可以做出非常灵活的键名过滤。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：手写 Readonly / Partial / Required
// ==========================================

// Readonly：所有属性变为只读
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Partial：所有属性变为可选
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Required：所有属性变为必选
type MyRequired<T> = {
  [K in keyof T]-?: T[K];
};

// 测试
interface User {
  name: string;
  age?: number;
  readonly email: string;
}

// 使用手写版本
type ReadonlyUser = MyReadonly<User>;
// { readonly name: string; readonly age?: number; readonly email: string; }

type PartialUser = MyPartial<User>;
// { name?: string; age?: number; email?: string; }

type RequiredUser = MyRequired<User>;
// { name: string; age: number; readonly email: string; }

// 验证
const user1: ReadonlyUser = { name: "Alice", email: "a@b.com" };
// user1.name = "Bob"; // ❌ 编译错误：readonly

const user2: PartialUser = {}; // ✅ 所有属性可选

const user3: RequiredUser = { name: "Alice", age: 30, email: "a@b.com" }; // ✅ 必须全部提供

// ==========================================
// 示例 2：手写 Pick 和 Omit
// ==========================================

// Pick：从 T 中选取一组键 K
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit：从 T 中排除一组键 K
// 实现方式：先用 Exclude 取反，再用 Pick
type MyOmit<T, K extends keyof any> = {
  [P in Exclude<keyof T, K>]: T[P];
};

interface Article {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// 只选取 id 和 title
type ArticlePreview = MyPick<Article, "id" | "title">;
// { id: number; title: string; }

// 排除 createdAt 和 updatedAt
type ArticleInput = MyOmit<Article, "createdAt" | "updatedAt">;
// { id: number; title: string; content: string; }

const preview: ArticlePreview = { id: 1, title: "Hello" };
const input: ArticleInput = { id: 1, title: "Hello", content: "..." };

// ==========================================
// 示例 3：键值重映射实战
// ==========================================

// 为所有属性添加前缀
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

interface ApiEndpoints {
  user: string;
  post: string;
  comment: string;
}

type FullApi = Prefixed<ApiEndpoints, "fetch">;
// { fetchUser: string; fetchPost: string; fetchComment: string; }

// 创建 Getter 类型
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type Person = {
  name: string;
  age: number;
};

type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number; }

// ==========================================
// 示例 4：根据值类型过滤键
// ==========================================

// 只保留函数属性
type FunctionProperties<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

// 只保留非函数属性（即数据属性）
type NonFunctionProperties<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

class Service {
  name: string = "service";
  start(): void {}
  stop(): void {}
  config: object = {};
}

type ServiceMethods = FunctionProperties<Service>;
// { start: () => void; stop: () => void; }

type ServiceData = NonFunctionProperties<Service>;
// { name: string; config: object; }
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与映射类型相关的配置

```jsonc
{
  "compilerOptions": {
    // 严格模式确保映射类型中的 ? 和 readonly 语义正确
    "strict": true,

    // 当映射类型中产生 never 时给出更清晰的报错
    "strictNullChecks": true,

    // 控制 target 级别——映射类型需要 ES2015+ 的 Proxy/Reflect 概念
    // 但映射类型本身是编译时特性，不依赖 target
    "target": "ES2022"
  }
}
```

### 4.2 映射类型的常见使用场景：表单状态类型

```typescript
// 在表单库中，映射类型非常常见
type FormState<T> = {
  [K in keyof T]: {
    value: T[K];
    error: string | null;
    touched: boolean;
    dirty: boolean;
  };
};

interface LoginForm {
  username: string;
  password: string;
  remember: boolean;
}

type LoginFormState = FormState<LoginForm>;
// {
//   username: { value: string; error: string | null; touched: boolean; dirty: boolean; };
//   password: { value: string; error: string | null; touched: boolean; dirty: boolean; };
//   remember: { value: boolean; error: string | null; touched: boolean; dirty: boolean; };
// }
```

### 4.3 在 .d.ts 文件中使用映射类型增强第三方库

```typescript
// types/enhanced.d.ts
import "express";

// 为 Express 的 Response 添加类型安全的 send 方法重载
declare module "express-serve-static-core" {
  interface Response {
    // 使用映射类型确保所有 HTTP 状态码都有对应的快捷方法
    json<T>(body: T): this;
    status(code: number): this;
  }
}
```

---

## 5. 必须掌握的技能

### 5.1 映射类型的心智模型

映射类型本质上是一个"类型层面的 map 操作"：

| JS 数组的 map | TS 映射类型 |
|---------------|-------------|
| `arr.map(x => f(x))` | `{ [K in keyof T]: F<T[K]> }` |
| 遍历元素 | 遍历键 |
| 对每个元素做变换 | 对每个值类型做变换 |
| 可以 filter | `as` 子句中返回 `never` 过滤 |

### 5.2 修饰符速查表

| 语法 | 含义 |
|------|------|
| `[K in keyof T]: T[K]` | 原样复制 |
| `readonly [K in keyof T]: T[K]` | 全部只读 |
| `-readonly [K in keyof T]: T[K]` | 去掉只读 |
| `[K in keyof T]?: T[K]` | 全部可选 |
| `[K in keyof T]-?: T[K]` | 去掉可选（必填） |
| `-readonly [K in keyof T]-?: T[K]` | 去掉只读且去掉可选 |

### 5.3 总结：你必须带走的知识点

1. **`keyof T` 取出所有键**——返回联合类型，如 `"a" | "b" | "c"`。
2. **`T[K]` 取键 K 的值类型**——相当于 JS 中的 `obj[key]`。
3. **映射类型 `[K in keyof T]: F<T[K]>`**——遍历键并变换值类型。
4. **修饰符 `readonly` 和 `?`**——放在 `[K in keyof T]` 之后、冒号之前；`-` 前缀表示移除。
5. **`as` 子句重映射键名**——在映射中修改键名（模板字面量拼接）或过滤键（返回 `never`）。
6. **手写内置工具类型**——理解 `Readonly`、`Partial`、`Required`、`Pick`、`Omit` 的实现原理，而不是只当黑盒用。
7. **`Pick<T, K>` vs `Omit<T, K>`**——Pick 选取子集，Omit 排除子集；Omit 可以借助 `Exclude<keyof T, K>` 实现。
8. **映射类型是 TS 类型体操的基石**——几乎所有高级工具类型都建立在映射类型之上。

---

> **下一章**：[第10章 条件类型与 infer](./ch10-conditional.md)
