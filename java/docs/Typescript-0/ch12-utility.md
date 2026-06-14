# 第12章 内置工具类型源码全解析

---

## 1. 核心概念

### 什么是工具类型（Utility Types）？

工具类型是 TypeScript 内置的"类型函数"——它们接收一个或多个类型参数，返回一个新的类型。就像数组有 `.map()`、`.filter()` 方法一样，类型系统也有自己的一套"标准库"。

把工具类型想象成**乐高积木的模具**：你把一块原始积木（类型）放进去，它帮你压出想要的形状（新类型）。`Partial<T>` 让你的类型所有属性变可选，就像把一块平整的积木压出"缺口"；`Readonly<T>` 给积木涂上一层"保护漆"，不让别人修改。

### 工具类型的分类

TS 内置的工具类型可以分为几大类：

| 类别 | 代表 | 作用 |
|------|------|------|
| 对象操作 | `Partial`、`Required`、`Readonly` | 修改对象属性的修饰符 |
| 对象选择 | `Pick`、`Omit`、`Record` | 选取或排除属性 |
| 函数操作 | `ReturnType`、`Parameters`、`ThisType` | 提取函数相关信息 |
| 联合/交叉 | `Exclude`、`Extract`、`NonNullable` | 操作联合类型 |
| 字符串操作 | `Uppercase`、`Capitalize` 等 | 编译时字符串转换 |

本章重点剖析最常用的工具类型源码，让你知其然更知其所以然。

---

## 2. 典型问题与处理

### 2.1 滥用工具类型导致类型难以阅读和维护

**问题场景**：过度组合工具类型，写出"类型天书"。

```typescript
// Bad — 过度嵌套工具类型
type SuperComplex<T, K extends keyof T> = {
  readonly [P in K]-?: Partial<Required<Pick<T, P>>>[P];
} & {
  [P in Exclude<keyof T, K>]?: Readonly<Required<T>[P]>;
};

// 上面的类型在干什么？不仔细看根本不知道
// 实际上它只是想要：
// - K 中的属性：必填 + 只读
// - 其他属性：可选 + 可写
// 但用了 5 层工具类型嵌套，可读性极差
```

**为什么不好**：工具类型嵌套 3 层以上基本无法一眼读懂。这种代码不仅给阅读者带来巨大认知负担，而且每个嵌套都会增加编译器的计算量。更糟糕的是，出错时 TS 的错误信息会展开所有嵌套，堆栈信息长达几十行。

```typescript
// Good — 直接用映射类型，清晰表达意图
// 显式且直接，一眼就能看懂
type MyConfig<T, K extends keyof T> = {
  // 指定的键：必填且只读
  readonly [P in K]-?: T[P];
} & {
  // 其他键：可选且可写
  [P in Exclude<keyof T, K>]?: T[P];
};

// 或者，如果场景单一，用更简单的方式
interface UserConfig {
  readonly id: string;
  readonly createdAt: Date;
  name?: string;
  email?: string;
}
```

**为什么好**：直接使用映射类型比嵌套工具类型更清晰、性能更好。当工具类型嵌套 2 层以上时，考虑用原始映射类型重写。记住：**工具类型是手段，不是目的**——如果直接写类型更清晰，就直写。

### 2.2 误用 `Record` 导致类型太宽松

**问题场景**：`Record<string, T>` 几乎放弃了键名约束，失去了类型安全的优势。

```typescript
// Bad — 使用 Record<string, any> 放弃类型安全
type Config = Record<string, any>;

const config: Config = {
  url: "https://api.example.com",
  timeout: 5000,
};

// 可以访问不存在的属性，没有错误提示
console.log(config.apiUrl); // undefined — 没有编译错误
console.log(config.port);   // undefined — 没有编译错误
```

**为什么不好**：`Record<string, any>` 让所有字符串键名都合法，所有值类型都是 `any`——这基本上回到了 JavaScript 的无类型状态。你失去了编译时的属性名检查和类型检查。

```typescript
// Good — 精确的对象类型
interface AppConfig {
  url: string;
  timeout: number;
  retries: number;
}

const config: AppConfig = {
  url: "https://api.example.com",
  timeout: 5000,
  retries: 3,
};

// console.log(config.apiUrl); // ❌ 编译错误：不存在 apiUrl

// 如果确实需要动态键，使用索引签名 + 限制值类型
type StringMap<T> = { [key: string]: T };
type SafeConfig = StringMap<string | number>;

// 或者使用 Record 时指定具体的值类型联合
type StrictRecord = Record<string, string | number | boolean>;
```

**为什么好**：精确的类型定义让你在编译时就捕获拼写错误和类型错误。`Record<string, any>` 的正确用途非常有限——主要是在处理动态数据（如 JSON.parse 的结果）时的过渡方案。

### 2.3 自己实现工具类型时忽略边缘情况

**问题场景**：手写工具类型时没有考虑 `never`、联合类型、`any` 等边缘情况。

```typescript
// Bad — 简单实现，未考虑边缘情况
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

type Test1 = MyReadonly<never>;
// 结果：{} — never 的 keyof 是 never，映射后得到空对象
// 这可能不是你想要的

type Test2 = MyReadonly<{ a: string } | { b: number }>;
// 结果：{ readonly a: string } | { readonly b: number }
// 分布式生效，但有时候你可能期望整体只读
```

**为什么不好**：工具类型的"标准实现"考虑了很多边缘情况。`never` 作为泛型参数时，映射类型会得到 `{}` 而非 `never`，这可能是 bug 的来源。联合类型作为输入时，映射类型会在每个成员上分别应用，结果也是联合。

```typescript
// Good — 考虑边缘情况的实现
// 内置的 Readonly 已经处理好了这些情况
// 但你也可以自己处理：

type MyReadonlyRobust<T> =
  T extends never
    ? never  // 明确处理 never
    : {
      readonly [K in keyof T]: T[K];
    };

// 使用内置工具类型，它们已经经过了充分测试
type Safe1 = Readonly<never>;        // never — 内置版本处理了
type Safe2 = Readonly<{ a: string } | { b: number }>;
// { readonly a: string } | { readonly b: number }
```

**为什么好**：内置工具类型经过了 TS 团队的大量测试和优化。除非你有特别的定制需求，否则优先使用内置版本。自己实现时，要测试 `never`、`any`、`unknown`、联合类型、空对象等边缘情况。

### 2.4 不理解 `NoInfer` 的作用（TS 5.4+）

**问题场景**：泛型函数中，TS 从多个位置推导类型参数，有时候推导结果不是你想要的。

```typescript
// Bad — 泛型推导从所有位置收集信息
function createPair<T>(first: T, second: T): [T, T] {
  return [first, second];
}

// 你希望 T 是 string
const result = createPair("hello", "world"); // T = string ✅

// 但如果你不小心传了不同类型
const result2 = createPair("hello", 42);
// T = string | number — 这不是你想要的！
// 你希望 T 只能是 string，42 应该报错
```

**为什么不好**：TS 的泛型推导会从所有参数位置收集信息，然后找"最佳通用类型"。当你想让某个参数只参与约束检查而不参与类型推导时，没有 `NoInfer` 之前很难实现。

```typescript
// Good — 使用 NoInfer 阻止某个位置的推导
function createPairStrict<T>(
  first: T,
  second: NoInfer<T>  // second 的类型只用于检查，不参与推导
): [T, T] {
  return [first, second];
}

const result = createPairStrict("hello", "world"); // T = string ✅
// const result2 = createPairStrict("hello", 42);
// ❌ 类型错误：number 不能赋值给 string
// 因为 T 只从 "hello" 推导为 string，42 被检查是否满足 string

// 另一个实际场景：状态管理中的 action creator
function createAction<T extends string>(
  type: T,
  prepare?: (payload: any) => { payload: any }
): { type: T; prepare: (typeof prepare) } {
  return { type, prepare } as any;
}

// 如果不希望 type 从第二个参数推导
function createActionBetter<T extends string>(
  type: T,
  prepare?: NoInfer<(payload: any) => { payload: any }>
): { type: T; prepare: (typeof prepare) } {
  return { type, prepare } as any;
}
```

**为什么好**：`NoInfer<T>` 是一个"标记类型"——它告诉编译器"这个位置的类型信息不要用来推导 T"。T 只从其他位置推导，这个位置只做类型检查。这在泛型函数中非常有用，可以精确控制类型推导的来源。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：对象操作工具类型源码剖析
// ==========================================

// Partial<T> — 所有属性变为可选
// 源码实现：
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Required<T> — 所有属性变为必选
// 源码实现：
type MyRequired<T> = {
  [K in keyof T]-?: T[K];
};

// Readonly<T> — 所有属性变为只读
// 源码实现：
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// 测试
interface User {
  name: string;
  age: number;
  email?: string;
}

type PartialUser = MyPartial<User>;
// { name?: string; age?: number; email?: string; }

type RequiredUser = MyRequired<User>;
// { name: string; age: number; email: string; }

type ReadonlyUser = MyReadonly<User>;
// { readonly name: string; readonly age: number; readonly email?: string; }

// ==========================================
// 示例 2：对象选择工具类型源码剖析
// ==========================================

// Pick<T, K> — 从 T 中选取一组键
// 源码实现：
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit<T, K> — 从 T 中排除一组键
// 源码实现（TS 源码用 Pick + Exclude 实现）：
type MyOmit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

// Record<K, V> — 创建键为 K、值为 V 的对象类型
// 源码实现：
type MyRecord<K extends keyof any, V> = {
  [P in K]: V;
};

// 测试
interface Article {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  author: string;
}

type ArticlePreview = MyPick<Article, "id" | "title">;
// { id: number; title: string; }

type ArticleWithoutDates = MyOmit<Article, "createdAt">;
// { id: number; title: string; content: string; author: string; }

type PageInfo = MyRecord<"home" | "about" | "contact", { title: string }>;
// {
//   home: { title: string; };
//   about: { title: string; };
//   contact: { title: string; };
// }

// ==========================================
// 示例 3：联合类型操作工具类型源码剖析
// ==========================================

// Exclude<T, U> — 从联合类型 T 中排除 U
// 源码实现（利用分布式条件类型）：
type MyExclude<T, U> = T extends U ? never : T;

type T1 = MyExclude<"a" | "b" | "c", "a">;
// "b" | "c"
// 过程："a" extends "a" → never | "b" extends "a" → "b" | "c" extends "a" → "c"
// = never | "b" | "c" = "b" | "c"

// Extract<T, U> — 从联合类型 T 中提取 U
// 源码实现：
type MyExtract<T, U> = T extends U ? T : never;

type T2 = MyExtract<"a" | "b" | "c", "a" | "b">;
// "a" | "b"

// NonNullable<T> — 从 T 中排除 null 和 undefined
// 源码实现：
type MyNonNullable<T> = T extends null | undefined ? never : T;

type T3 = MyNonNullable<string | number | null | undefined>;
// string | number

// 测试
type Status = "idle" | "loading" | "success" | "error";
type ActiveStatus = MyExclude<Status, "idle" | "error">;
// "loading" | "success"

// ==========================================
// 示例 4：函数操作工具类型源码剖析
// ==========================================

// Parameters<T> — 提取函数参数类型（元组）
// 源码实现：
type MyParameters<T extends (...args: any) => any> =
  T extends (...args: infer P) => any ? P : never;

// ReturnType<T> — 提取函数返回值类型
// 源码实现：
type MyReturnType<T extends (...args: any) => any> =
  T extends (...args: any) => infer R ? R : any;

// ConstructorParameters<T> — 提取构造函数参数类型
// 源码实现：
type MyConstructorParameters<T extends new (...args: any) => any> =
  T extends new (...args: infer P) => any ? P : never;

// InstanceType<T> — 提取构造函数实例类型
// 源码实现：
type MyInstanceType<T extends new (...args: any) => any> =
  T extends new (...args: any) => infer R ? R : any;

// 测试
function fetchData(id: number, cache: boolean): Promise<string> {
  return Promise.resolve("data");
}

type FetchParams = MyParameters<typeof fetchData>;
// [number, boolean]

type FetchReturn = MyReturnType<typeof fetchData>;
// Promise<string>

class Service {
  constructor(name: string, port: number) {}
}

type ServiceParams = MyConstructorParameters<typeof Service>;
// [string, number]

type ServiceInstance = MyInstanceType<typeof Service>;
// Service

// ==========================================
// 示例 5：satisfies 操作符（TS 4.9+）
// ==========================================

// satisfies 的用途：既享受精确推导，又确保符合接口约束

// 场景：定义调色板
interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

// ❌ 方式 1：显式标注类型 — 丢失精确值信息
const palette1: Palette = {
  primary: "#ff0000",
  secondary: "#00ff00",
  accent: "#0000ff",
};
// palette1.primary 的类型是 string，不是 "#ff0000"
// 你无法用 palette1.primary 做字面量类型操作

// ❌ 方式 2：只用 as const — 没有类型约束
const palette2 = {
  primary: "#ff0000",
  secondary: "#00ff00",
  // accent: "#0000ff", // 忘了写 accent — 没有报错！
} as const;

// ✅ 方式 3：satisfies — 既约束又推导
const palette3 = {
  primary: "#ff0000",
  secondary: "#00ff00",
  accent: "#0000ff",
} satisfies Palette;

// palette3.primary 的类型是 "#ff0000"（保留了精确值）
// 但 palette3 必须符合 Palette 接口

// 另一个实用场景：对象键值约束
type Color = "red" | "green" | "blue";

// 不使用 satisfies
const colors1: Record<Color, string> = {
  red: "#FF0000",
  green: "#00FF00",
  blue: "#0000FF",
};
// colors1.red 的类型是 string，不是 "#FF0000"

// 使用 satisfies
const colors2 = {
  red: "#FF0000",
  green: "#00FF00",
  blue: "#0000FF",
} satisfies Record<Color, string>;
// colors2.red 的类型是 "#FF0000"
// 但 colors2 缺少 blue 属性时会报错
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与工具类型相关的配置

```jsonc
{
  "compilerOptions": {
    // 严格模式确保工具类型的语义正确
    "strict": true,

    // 启用 NoInfer（TS 5.4+ 默认支持）
    // 不需要额外配置

    // satisfies 操作符（TS 4.9+ 默认支持）
    // 不需要额外配置

    // 提升类型检查性能
    "skipLibCheck": true, // 跳过 .d.ts 文件的类型检查（推荐生产环境开启）

    // 控制类型检查的严格程度
    "exactOptionalPropertyTypes": true // 更精确地检查可选属性
  }
}
```

### 4.2 在项目中组织自己的工具类型

```typescript
// src/types/utilities.ts
// 项目中常用的自定义工具类型

// 深度可选
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// 至少包含一个属性
type AtLeastOne<T> = {
  [K in keyof T]: Pick<T, K>;
}[keyof T];

// 值类型映射
type ValueOf<T> = T[keyof T];

// 函数类型提取
type AsyncReturnType<T extends (...args: any) => Promise<any>> =
  T extends (...args: any) => Promise<infer R> ? R : never;

// 非空对象
type NonEmptyObject<T> = keyof T extends never ? never : T;
```

### 4.3 工具类型的性能考虑

```typescript
// 性能较好的工具类型（O(1) 或 O(n)）
// - Partial, Required, Readonly — 单层映射
// - Pick — 选取子集
// - Record — 创建新类型

// 性能较差的工具类型（O(n*m) 或递归）
// - Omit — 内部用 Exclude 取差集
// - 递归工具类型（DeepPartial）— 深度递归
// - 条件类型嵌套过多

// 性能建议：
// 1. 避免深层递归工具类型（深度 > 5）
// 2. 避免大联合类型上的条件类型（成员 > 50）
// 3. 优先用映射类型代替多层工具类型嵌套
// 4. 在大型项目中使用 type-fest 等社区方案，它们已经过性能优化
```

---

## 5. 必须掌握的技能

### 5.1 工具类型源码速查表

| 工具类型 | 源码（简化） | 核心技巧 |
|----------|-------------|----------|
| `Partial<T>` | `{ [K in keyof T]?: T[K] }` | 映射类型 + `?` |
| `Required<T>` | `{ [K in keyof T]-?: T[K] }` | 映射类型 + `-?` |
| `Readonly<T>` | `{ readonly [K in keyof T]: T[K] }` | 映射类型 + `readonly` |
| `Pick<T, K>` | `{ [P in K]: T[P] }` | 映射类型 + `K extends keyof T` |
| `Omit<T, K>` | `Pick<T, Exclude<keyof T, K>>` | Pick + Exclude 组合 |
| `Record<K, V>` | `{ [P in K]: V }` | 映射类型 |
| `Exclude<T, U>` | `T extends U ? never : T` | 分布式条件类型 |
| `Extract<T, U>` | `T extends U ? T : never` | 分布式条件类型 |
| `NonNullable<T>` | `T extends null \| undefined ? never : T` | 分布式条件类型 |
| `ReturnType<T>` | `T extends (...args: any) => infer R ? R : any` | infer 模式匹配 |
| `Parameters<T>` | `T extends (...args: infer P) => any ? P : never` | infer 模式匹配 |
| `Awaited<T>` | 递归 `T extends Promise<infer U> ? Awaited<U> : T` | 递归 infer |

### 5.2 选择：内置工具类型 vs 自己实现

| 场景 | 推荐 | 原因 |
|------|------|------|
| 标准对象变换 | 内置 | 经过测试和优化 |
| 深度递归操作 | 自己实现 | 内置不提供 DeepPartial |
| 特定业务逻辑 | 自己实现 | 内置类型无法覆盖 |
| 性能敏感场景 | 内置 | 比手写版本优化更好 |
| 学习理解 | 自己实现 | 掌握原理后更好使用内置类型 |

### 5.3 总结：你必须带走的知识点

1. **工具类型是类型系统的"标准库"**——每个工具类型本质上是一个泛型类型别名。
2. **理解源码比记住用法更重要**——知道 `Partial` 是映射类型 + `?`，遇到类似需求可以自己实现。
3. **不要滥用工具类型**——嵌套 3 层以上可读性急剧下降，此时用原始映射类型代替。
4. **`NoInfer` 控制类型推导**——TS 5.4+ 引入，阻止某个位置的类型信息参与推导。
5. **`satisfies` 兼具推导和约束**——TS 4.9+，保留精确类型的同时确保符合接口。
6. **优先使用内置工具类型**——它们经过了充分测试和性能优化，自己实现的版本通常不会更好。
7. **边缘情况要小心**——`never`、`any`、联合类型作为输入时，工具类型的行为可能出乎意料。
8. **工具类型是手段，不是目的**——类型系统的目的是让代码更安全，而不是让类型更复杂。

---

> **上一章**：[第11章 模板字面量类型](./ch11-template-literals.md)
> **下一章**：[第13章 tsconfig.json 完全配置指南](./ch13-tsconfig.md)
