# 附录C：面试题与类型体操手写题解析

## 概述

本附录专为 TypeScript 面试冲刺和自测准备，包含三部分内容：

- **选择题（6题）**：覆盖基础类型、联合类型、泛型、条件类型、infer 和实际场景，快速检验知识面
- **手写题（5题）**：常见类型体操（工具类型实现），考察类型编程能力
- **简答题（3题）**：工程经验向问题，考察对实际开发中类型系统选择的理解

适合读者：准备 TypeScript 面试的开发者、希望系统自测类型水平的工程师。建议先独立完成，再对照解析。

---

## 一、选择题

### 第1题：基础类型 — `typeof` 与类型收窄

```typescript
function process(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value.toFixed(2);
}
```

在 `typeof value === "string"` 的分支中，`value` 的类型是什么？

A. `string | number`  
B. `string`  
C. `never`  
D. `string & number`

**答案：B**

**解析：** TypeScript 的类型收窄（narrowing）机制能识别 `typeof` 守卫。当条件判断为 `true` 时，TypeScript 将联合类型 `string | number` 缩小为 `string`。这是 TypeScript 最基础的收窄方式之一，类似的还有 `instanceof`、`in`、`Array.isArray()` 和可辨识联合（discriminated union）。

---

### 第2题：联合类型 — 可辨识联合

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "triangle"; base: number; height: number };

function area(s: Shape) {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "square":
      return s.side ** 2;
    case "triangle":
      return (s.base * s.height) / 2;
  }
}
```

如果在 `switch` 中遗漏了 `triangle` 分支，会发生什么？

A. 运行时抛出错误  
B. TypeScript 编译报错  
C. 返回 `undefined`  
D. 不会报错，但逻辑错误

**答案：B**

**解析：** 当 `switch` 配合可辨识联合且函数有返回值时，最佳实践是在 `default` 分支设置穷举检查（exhaustive check）：

```typescript
function area(s: Shape) {
  switch (s.kind) {
    case "circle": return Math.PI * s.radius ** 2;
    case "square": return s.side ** 2;
    // 如果 case "triangle" 不存在，
    // default 分支中的 _ 会被赋值为 { kind: "triangle" }
    default:
      const _: never = s;
      return _;
  }
}
```

当 `_` 被赋值为非 `never` 类型时，TypeScript 会报错。这能有效防止遗漏分支。即使没有 `default` 分支，TypeScript 也会推断函数返回类型为 `number | undefined`，如果调用方期望 `number` 也会触发错误。

---

### 第3题：泛型 — 约束与默认类型

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const person = { name: "Alice", age: 30 };
const age = getProperty(person, "age");
```

`age` 的类型是什么？

A. `number`  
B. `string | number`  
C. `any`  
D. `number | undefined`

**答案：A**

**解析：** `K extends keyof T` 将 `K` 限制为 `T` 的键之一。当传入 `person`（类型为 `{ name: string; age: number }`）和 `"age"`（字面量类型）时，`K` 被推断为 `"age"`，`T[K]` 即为 `{ name: string; age: number }["age"]`，也就是 `number`。如果传入一个不存在于 `keyof T` 中的键，TypeScript 会直接报错，这是泛型约束的典型应用。

---

### 第4题：条件类型 — `extends` 条件分发

```typescript
type IsString<T> = T extends string ? "yes" : "no";

type Result = IsString<string | number>;
```

`Result` 的类型是什么？

A. `"yes"`  
B. `"no"`  
C. `"yes" | "no"`  
D. `"yes" & "no"`

**答案：C**

**解析：** 当条件类型作用于泛型且参数为联合类型时，TypeScript 会进行**条件分发（distributive conditional types）**。`IsString<string | number>` 等价于 `IsString<string> | IsString<number>`，即 `"yes" | "no"`。

这是 TypeScript 类型系统的一个重要特性，也是许多高级工具类型（如 `Exclude`、`Extract`）的实现基础。要禁用分发，可以用元组包裹：`type IsStringNonDistributive<T> = [T] extends [string] ? "yes" : "no"`。

---

### 第5题：`infer` — 类型推断

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type Fn = (x: number) => string;
type R = ReturnType<Fn>;
```

`R` 的类型是什么？

A. `number`  
B. `string`  
C. `any`  
D. `never`

**答案：B**

**解析：** `infer R` 声明一个待推断的类型变量，TypeScript 会从 `(...args: any[]) => infer R` 匹配 `Fn` 的签名，并将返回值类型 `string` 赋给 `R`。因此 `R` 为 `string`。

`infer` 只能在条件类型的 `extends` 子句中使用，是类型体操中最核心的关键字之一，常用于提取函数返回值、参数类型、Promise 内部类型等。TypeScript 内置的 `ReturnType`、`Parameters`、`Awaited` 等工具类型均基于 `infer` 实现。

---

### 第6题：实际场景 — 类型安全的 API 响应处理

```typescript
interface ApiResponse<T> {
  data: T;
  error: null;
  status: number;
}

type ApiResult<T> = ApiResponse<T> | { data: null; error: string; status: number };

function handleResult<T>(result: ApiResult<T>) {
  if (result.error) {
    // 此处 result 的类型是什么？
    console.error(result.error);
    return;
  }
  // 此处 result 的类型是什么？
  console.log(result.data);
}
```

在第一个注释处（`if (result.error)` 分支内），`result` 的类型是什么？第二个注释处呢？

A. 第一个：`ApiResult<T>`，第二个：`ApiResponse<T>`  
B. 第一个：`{ data: null; error: string; status: number }`，第二个：`ApiResponse<T>`  
C. 第一个：`ApiResponse<T>`，第二个：`ApiResult<T>`  
D. 第一个：`any`，第二个：`unknown`

**答案：B**

**解析：** 这是可辨识联合（discriminated union）结合类型收窄的实际应用。`ApiResult<T>` 的两个联合成员中，`error` 字段的类型不同（`null` vs `string`）。当 `result.error` 为真值时，TypeScript 能收窄到 `error: string` 的那个成员，即 `{ data: null; error: string; status: number }`。退出分支后，`result` 被收窄为 `ApiResponse<T>`。

这种模式在实际 API 封装中非常常见，比使用可选字段或 `any` 更安全。类似的设计也常用于 React 的 `useQuery` 等库的返回类型。

---

## 二、手写题

### 第1题：实现 `DeepReadonly<T>`

**题目描述：** 实现一个 `DeepReadonly<T>` 工具类型，将对象类型的所有属性（包括嵌套对象属性）标记为 `readonly`。

**示例：**
```typescript
type Obj = {
  a: string;
  b: {
    c: number;
    d: { e: boolean };
  };
};

// 期望: DeepReadonly<Obj> 中 b.c、b.d.e 均为 readonly
```

**解题思路：**

1. 首先对每个属性应用 `readonly` 修饰符
2. 如果属性值是对象（非函数），递归调用 `DeepReadonly`
3. 需要处理边界情况：原始类型、数组、函数

**逐步推导：**

第1步 — 基本 `Readonly<T>`（仅一层）：
```typescript
type Readonly<T> = {
  readonly [K in keyof T]: T[K];
};
```

第2步 — 添加递归：当 `T[K]` 是对象时，递归调用 `DeepReadonly`：
```typescript
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends Record<string, any> ? DeepReadonly<T[K]> : T[K];
};
```

第3步 — 处理函数和原始类型：函数不应被深度递归，原始类型也不应被映射。用 `keyof T extends never` 判断是否为非对象类型：
```typescript
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
```

**完整代码：**
```typescript
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// 验证
type Obj = { a: string; b: { c: number; d: { e: boolean } } };
type ReadonlyObj = DeepReadonly<Obj>;
// ReadonlyObj['b']['d']['e'] 为 readonly boolean
```

---

### 第2题：实现 `DeepPartial<T>`

**题目描述：** 实现一个 `DeepPartial<T>` 工具类型，将对象类型的所有属性（包括嵌套对象属性）变为可选。

**解题思路：**

1. `Partial<T>` 的核心是 `[K in keyof T]?: T[K]`
2. 递归处理嵌套对象，对每一层都应用可选修饰符
3. 同样需要区分原始类型、数组和函数

**逐步推导：**

第1步 — `Partial<T>` 实现：
```typescript
type Partial<T> = { [K in keyof T]?: T[K] };
```

第2步 — 添加递归和边界处理：
```typescript
type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
```

**完整代码：**
```typescript
type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// 验证
interface Config {
  server: { host: string; port: number };
  auth: { token: string };
}
type PartialConfig = DeepPartial<Config>;
// 所有属性变为可选：{ server?: { host?: string; port?: number }; auth?: { token?: string } }
```

---

### 第3题：实现 `UnionToIntersection<T>`

**题目描述：** 实现 `UnionToIntersection<T>`，将联合类型转换为交叉类型。例如 `UnionToIntersection<{ a: string } | { b: number }>` 结果为 `{ a: string } & { b: number }`。

**解题思路：**

1. 联合类型转交叉类型利用了**逆变位置（contravariant position）** 的特性
2. 函数参数在逆变位置，联合类型的函数参数会自动转换为交叉类型
3. 核心技巧：利用条件类型分发 + `infer` 在逆变位置的特性

**逐步推导：**

第1步 — 理解逆变转换原理：
```typescript
// 当把联合类型作为函数参数时，参数类型会变成交叉类型
type Contra<T> = T extends any ? (arg: T) => void : never;
// Contra<A | B> = (arg: A) => void | (arg: B) => void
```

第2步 — 利用函数重载的推断规则：多个函数签名取交叉类型作为参数类型：
```typescript
type UnionToIntersection<U> =
  (U extends any ? (arg: U) => void : never) extends
    (arg: infer I) => void ? I : never;
```

**完整代码：**
```typescript
type UnionToIntersection<U> =
  (U extends any ? (arg: U) => void : never) extends
    (arg: infer I) => void ? I : never;

// 验证
type Result = UnionToIntersection<{ a: string } | { b: number } | { c: boolean }>;
// 结果: { a: string } & { b: number } & { c: boolean }
```

**解析：** 这个实现分为两步：
1. `U extends any ? (arg: U) => void : never` — 利用条件类型分发，将 `A | B` 转换为 `(arg: A) => void | (arg: B) => void`
2. `extends (arg: infer I) => void ? I : never` — TypeScript 在推断多个函数类型的参数时，会取交叉类型。因此 `I` 被推断为 `A & B`

---

### 第4题：实现 `PickByType<T, Value>`

**题目描述：** 实现 `PickByType<T, Value>`，从 `T` 中选取属性值类型为 `Value` 的属性。例如 `PickByType<{ a: string; b: number; c: string }, string>` 结果为 `{ a: string; c: string }`。

**解题思路：**

1. 遍历 `T` 的所有键，筛选出值类型匹配 `Value` 的键
2. 使用条件类型判断 `T[K] extends Value` 是否成立
3. 使用 `as` 子句在映射类型中过滤键（TypeScript 4.1+）

**逐步推导：**

第1步 — 使用 `as` 子句重映射键：
```typescript
type PickByType<T, Value> = {
  [K in keyof T as T[K] extends Value ? K : never]: T[K];
};
```

第2步 — 理解 `as` 子句的作用：当 `as` 后的类型为 `never` 时，该键被排除。这是 TypeScript 4.1 引入的键重映射（key remapping）特性。

**完整代码：**
```typescript
type PickByType<T, Value> = {
  [K in keyof T as T[K] extends Value ? K : never]: T[K];
};

// 验证
type Test = PickByType<{ a: string; b: number; c: string; d: boolean }, string>;
// 结果: { a: string; c: string }

// 扩展：排除指定类型的属性
type OmitByType<T, Value> = {
  [K in keyof T as T[K] extends Value ? never : K]: T[K];
};
```

---

### 第5题：实现 `TupleToUnion<T>`

**题目描述：** 实现 `TupleToUnion<T>`，将元组类型转换为联合类型。例如 `TupleToUnion<[string, number, boolean]>` 结果为 `string | number | boolean`。

**解题思路：**

1. 元组本质上是带有数字索引的特殊数组类型
2. 可以通过 `T[number]` 索引访问获取所有元素的联合类型
3. 也可以使用 `infer` 递归提取

**方法一：索引访问（最简洁）**

```typescript
type TupleToUnion<T extends any[]> = T[number];

// 验证
type Result = TupleToUnion<[string, number, boolean]>;
// 结果: string | number | boolean
```

**方法二：infer 递归（理解原理）**

```typescript
type TupleToUnion<T extends any[]> = T extends [infer First, ...infer Rest]
  ? First | TupleToUnion<Rest>
  : never;
```

**完整代码（推荐方法一）：**
```typescript
type TupleToUnion<T extends any[]> = T[number];

// 验证
type Result1 = TupleToUnion<[string, number, boolean]>;
// string | number | boolean

type Result2 = TupleToUnion<[1, 2, 3]>;
// 1 | 2 | 3
```

**解析：** `T[number]` 利用了元组的数字索引签名。元组类型 `[string, number]` 的 `[number]` 索引返回所有元素类型的联合，即 `string | number`。这种方法不仅简洁，而且能正确处理任意长度的元组。

---

## 三、简答题

### 第1题：`interface` 和 `type` 如何选择？

**题目：** 在 TypeScript 中，`interface` 和 `type` 都可以用来定义对象类型，它们有什么区别？在实际项目中应该如何选择？

**参考答案：**

**相同点：**
- 都可以描述对象类型
- 都可以被实现（`implements`）
- 类型别名可以通过交叉类型（`&`）实现类似继承的效果

**不同点：**

| 特性 | interface | type |
|------|-----------|------|
| 声明合并 | 支持（同名自动合并） | 不支持（重复声明报错） |
| 扩展语法 | `extends` | `&`（交叉类型） |
| 适用类型 | 仅对象/函数/类 | 联合类型、元组、原始类型等 |
| 计算属性 | 不支持 | 支持 |
| 性能 | 通常更快（缓存友好） | 大型联合类型可能较慢 |

**推荐原则：**

1. **优先使用 `interface`** 定义公开 API 的对象形状，因为它支持声明合并，便于扩展
2. **使用 `type`** 的场景：
   - 需要联合类型、交叉类型、元组
   - 需要映射类型或条件类型
   - 需要工具类型组合（如 `Pick`、`Omit`）
3. **第三方库的类型扩展**使用 `interface`（通过声明合并添加字段）
4. **React Props/State** 两者皆可，团队约定即可

**示例：**
```typescript
// interface 适合公开 API（支持声明合并）
interface User {
  name: string;
}
interface User {
  age: number;
}
// User 自动合并为 { name: string; age: number }

// type 适合组合与工具类型
type Status = "idle" | "loading" | "success" | "error";
type ApiData<T> = { data: T; error: null } | { data: null; error: string };
```

---

### 第2题：`any` 和 `unknown` 的区别是什么？

**题目：** TypeScript 中 `any` 和 `unknown` 都表示"任意类型"，它们有什么区别？为什么推荐使用 `unknown` 而不是 `any`？

**参考答案：**

**核心区别：类型安全**

- **`any`**：关闭了该值的所有类型检查，可以对其执行任何操作而不报错
- **`unknown`**：表示"我确实不知道类型"，但在使用前必须进行类型收窄

**具体对比：**

```typescript
let anyValue: any = "hello";
let unknownValue: unknown = "hello";

// 1. 属性访问
anyValue.length;      // 不报错
unknownValue.length;  // 报错: Object is of type 'unknown'

// 2. 方法调用
anyValue.toFixed();   // 不报错（运行时崩溃）
unknownValue.toFixed(); // 报错

// 3. 赋值给其他类型
const str1: string = anyValue;     // 不报错（any 可以赋值给任何类型）
const str2: string = unknownValue; // 报错: Type 'unknown' is not assignable to type 'string'
```

**使用 unknown 的正确方式（类型收窄后操作）：**

```typescript
function safeProcess(value: unknown) {
  if (typeof value === "string") {
    // 此处 value 被收窄为 string
    return value.toUpperCase();
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  // 也可以使用自定义类型守卫
  if (isUser(value)) {
    return value.name;
  }
}

function isUser(value: unknown): value is { name: string } {
  return typeof value === "object" && value !== null && "name" in value;
}
```

**推荐原因：**

- `unknown` 强制开发者进行类型检查，避免运行时错误传播
- `any` 是类型系统的"逃生舱"，应尽量不用
- 在解析 JSON、处理第三方数据、类型安全的自反函数中，优先使用 `unknown`

---

### 第3题：类型守卫（Type Guard）和类型断言（Type Assertion）的区别是什么？

**题目：** 类型守卫和类型断言都是 TypeScript 中处理不确定类型的手段，它们有什么区别？各在什么场景下使用？

**参考答案：**

**核心区别：**

| 特性 | 类型守卫 | 类型断言 |
|------|----------|----------|
| 机制 | 运行时检查 + 编译时收窄 | 编译时告诉编译器"相信我" |
| 安全性 | 安全（有运行时验证） | 不安全（绕过编译器检查） |
| 形式 | `typeof`、`instanceof`、自定义守卫 | `as`、`as any`、`!` 非空断言 |
| 影响范围 | 在控制流中收窄类型 | 一次性转换 |
| 可复用性 | 可封装为函数复用 | 通常就地使用 |

**类型守卫示例：**

```typescript
// 内置守卫
function process(value: string | number) {
  if (typeof value === "string") {
    // value 被收窄为 string
    return value.length;
  }
  // value 被收窄为 number
  return value.toFixed(2);
}

// 自定义类型守卫（返回类型为 value is X）
interface User { name: string; age: number }
interface Admin { name: string; role: string }

function isAdmin(user: User | Admin): user is Admin {
  return "role" in user;
}

function processUser(user: User | Admin) {
  if (isAdmin(user)) {
    // user 被收窄为 Admin
    return user.role;
  }
  // user 被收窄为 User
  return user.age;
}
```

**类型断言示例：**

```typescript
// DOM 操作（常见合理使用场景）
const input = document.getElementById("myInput") as HTMLInputElement;
// 等价于：const input = document.getElementById("myInput")!;
input.value = "hello";

// 非空断言（确信不会为 null/undefined）
function processElement(el?: HTMLElement) {
  el!.innerHTML = "content"; // 跳过 null 检查
}

// 双重断言（极少使用，通常是设计问题的信号）
const value = ("hello" as unknown) as number;
```

**何时使用类型守卫：**
- 处理联合类型时，通过运行时检查安全收窄
- 解析 API 响应、用户输入等不可信数据
- 需要可复用的类型检查逻辑

**何时使用类型断言：**
- DOM 操作（`document.getElementById` 返回 `HTMLElement | null`，确信存在时用 `as`）
- 第三方库类型定义不准确时，临时绕过
- 与非 TypeScript 代码交互的边界

**最佳实践：** 能用类型守卫解决的问题，就不用类型断言。类型断言本质上是告诉编译器"别管了，我知道我在做什么"，使用不当会引入运行时错误。

---

## 使用建议

### 面试冲刺

- **选择题**：快速过一遍，标记错题。重点关注条件类型分发（第4题）和 `infer`（第5题），这是面试高频考点
- **手写题**：建议手写 2-3 遍，直到能脱离编辑器独立写出。`DeepReadonly`（递归映射类型）和 `UnionToIntersection`（逆变位置利用）是面试中最常被问到的
- **简答题**：第1题（interface vs type）几乎是必考题，第2题（any vs unknown）出现频率也很高，建议准备 2-3 个实际例子

### 自测建议

- **20分钟限时**完成选择题部分
- **40分钟**完成手写题（每道题限时 8 分钟）
- 简答题建议口头回答，模拟面试场景

### 进阶学习路径

1. 掌握内置工具类型原理：`Partial`、`Required`、`Readonly`、`Pick`、`Exclude`、`Extract`
2. 掌握 `infer` 的三种常见模式：函数参数/返回值、Promise 展开、数组元素提取
3. 理解逆变（contravariance）和协变（covariance）在类型体操中的应用
4. 练习从实际库（React、Vue、Express）的类型定义中理解高级类型设计
