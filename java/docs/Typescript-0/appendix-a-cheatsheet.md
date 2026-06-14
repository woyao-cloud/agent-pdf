# 附录 A：核心关键字与内置工具类型速查表

## 1. 概述

本附录是 TypeScript 核心关键字和内置工具类型的**一站式速查手册**。它不深入讲解每个概念的原理——那些内容分散在手册的各章节中——而是提供一个你可以在编码时快速翻阅的参考。

**适合谁**：已经读过手册正文、需要快速回忆语法或查找工具类型用法的读者。

---

## 2. 核心关键字速查表

### 2.1 类型查询与推导

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `typeof` | 获取值的类型（类型查询） | `type T = typeof value` | `const config = { url: "https://api.example.com" }; type Config = typeof config; // { url: string }` |
| `keyof` | 获取对象类型的所有键（索引查询） | `type K = keyof T` | `interface User { name: string; age: number; } type UserKeys = keyof User; // "name" \| "age"` |
| `infer` | 在条件类型中提取类型变量（模式匹配） | `T extends infer U ? ... : ...` | `type Return<T> = T extends (...args: any[]) => infer R ? R : never;` |
| `satisfies` | 约束推导：确保类型符合要求，同时保留精确类型（TS 4.9+） | `value satisfies Type` | `const palette = { red: "#ff0000", green: "#00ff00" } satisfies Record<string, string>;` |

**Bad vs Good：satisfies**

```typescript
// Bad — 用类型注解导致精确信息丢失
const palette: Record<string, string> = {
  red: "#ff0000",
  green: "#00ff00",
};
// palette.red 的类型是 string（精确字面量丢失）

// Good — 用 satisfies 保留精确类型
const palette = {
  red: "#ff0000",
  green: "#00ff00",
} satisfies Record<string, string>;
// palette.red 的类型是 "#ff0000"（精确字面量保留）
// 但 palette.blue 仍会报错（因为不在 Record 中）
```

### 2.2 类型守卫与断言

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `is` | 自定义类型守卫，收窄类型 | `function guard(x: unknown): x is T` | `function isString(x: unknown): x is string { return typeof x === "string"; }` |
| `asserts` | 断言函数：如果函数返回，则类型已收窄 | `function assert(condition: any): asserts condition` | `function assertString(x: unknown): asserts x is string { if (typeof x !== "string") throw new Error(); }` |
| `as` | 类型断言（告诉编译器"我知道我在做什么"） | `value as Type` | `const input = document.getElementById("btn") as HTMLButtonElement;` |
| `!` | 非空断言（告诉编译器"这个值不是 null/undefined"） | `value!` | `const name = user!.name; // 告诉 TS：user 一定存在` |
| `?.` | 可选链（短路求值，避免 Cannot read property of undefined） | `obj?.prop` | `const zipCode = user?.address?.zipCode; // 任一环节为 undefined 则返回 undefined` |
| `??` | 空值合并（仅当左侧为 null/undefined 时取右侧） | `a ?? b` | `const timeout = config.timeout ?? 5000; // 只有 undefined/null 时用默认值` |

**Bad vs Good：类型断言 vs 类型守卫**

```typescript
// Bad — 用 as 绕过检查，运行时可能炸
const data: unknown = JSON.parse('{"name": "Alice"}');
console.log((data as { name: string }).name.toUpperCase()); // 假设 data 有 name

// Good — 用 is 守卫安全收窄
function hasName(data: unknown): data is { name: string } {
  return typeof data === "object" && data !== null && "name" in data;
}
if (hasName(data)) {
  console.log(data.name.toUpperCase()); // ✅ 安全
}
```

### 2.3 修饰符

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `readonly` | 属性只读（初始化后可读不可写） | `readonly prop: Type` | `interface Config { readonly apiKey: string; }` |
| `readonly[]` | 只读数组（不可修改内容） | `readonly T[]` | `const items: readonly number[] = [1, 2, 3]; // items.push(4) ❌` |
| `as const` | 常量断言：推导最精确的字面量类型 | `value as const` | `const roles = ["admin", "user"] as const; // 推导为 readonly ["admin", "user"]` |

### 2.4 类型字面量

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `any` | 放弃类型检查（"核按钮"） | `let x: any` | `let data: any = JSON.parse(json); // 不推荐，除非迁移期临时使用` |
| `unknown` | 类型安全的"未知"（必须先收窄才能操作） | `let x: unknown` | `let data: unknown = JSON.parse(json); // 推荐：强迫收窄` |
| `never` | 永不发生的类型（不可能的值） | `type T = never` | `function throwErr(): never { throw new Error(); }` |
| `void` | 没有返回值（函数不返回有意义的值） | `function f(): void` | `function log(msg: string): void { console.log(msg); }` |

### 2.5 声明关键字

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `abstract` | 抽象类/方法（不能实例化，必须被子类实现） | `abstract class C { abstract method(): void; }` | `abstract class Animal { abstract speak(): void; }` |
| `declare` | 声明但不实现（用于 .d.ts 文件或全局类型声明） | `declare var x: Type;` | `declare module "some-lib" { export function helper(): void; }` |
| `namespace` | 命名空间（旧式模块化，新项目推荐用 ES Module） | `namespace N { export type T = ...; }` | `namespace Utils { export function format(s: string): string; }` |
| `module` | 模块声明（与 namespace 类似，主要用于 .d.ts） | `declare module "path" { ... }` | `declare module "*.css" { const classes: Record<string, string>; export default classes; }` |

### 2.6 类型定义关键字

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `type` | 类型别名（给任何类型表达式起名） | `type T = ...` | `type Status = "idle" \| "loading" \| "error";` |
| `interface` | 接口（描述对象形状，支持声明合并） | `interface I { prop: Type; }` | `interface User { name: string; age: number; }` |
| `enum` | 枚举（定义一组命名常量） | `enum E { A, B, C }` | `enum Color { Red = "#FF0000", Green = "#00FF00" }` |
| `implements` | 类实现接口（保证类符合接口契约） | `class C implements I { ... }` | `class User implements Serializable { serialize(): string { ... } }` |

### 2.7 泛型约束与继承

| 关键字 | 用途 | 语法 | 示例 |
|--------|------|------|------|
| `extends` | 泛型约束 / 接口继承 | `<T extends U>` 或 `interface B extends A` | `function getProperty<T, K extends keyof T>(obj: T, key: K): T[K];` |

**Bad vs Good：泛型约束**

```typescript
// Bad — 约束太宽，类型信息丢失
function getLength<T>(arg: T): number {
  return (arg as any).length; // 强制断言，运行时可能炸
}

// Good — 用 extends 精确约束
function getLength<T extends { length: number }>(arg: T): number {
  return arg.length; // ✅ TS 知道 arg 一定有 length 属性
}

getLength("hello");    // ✅ 5
getLength([1, 2, 3]);  // ✅ 3
// getLength(42);       // ❌ number 没有 length 属性
```

---

## 3. 内置工具类型速查表

### 3.1 对象类型操作

| 工具类型 | 用途 | 语法 | 示例 |
|----------|------|------|------|
| `Partial<T>` | 将所有属性变为可选 | `Partial<{ a: string; b: number }>` | `type PartialUser = Partial<User>; // { name?: string; age?: number }` |
| `Required<T>` | 将所有属性变为必需 | `Required<{ a?: string; b?: number }>` | `type RequiredConfig = Required<Config>; // 所有属性必填` |
| `Readonly<T>` | 将所有属性变为只读 | `Readonly<{ a: string }>` | `type ImmutableUser = Readonly<User>; // 所有属性只读` |
| `Pick<T, K>` | 从 T 中选取部分属性 | `Pick<T, keyof T>` | `type UserName = Pick<User, "name" \| "email">; // 只保留 name 和 email` |
| `Omit<T, K>` | 从 T 中排除部分属性 | `Omit<T, keyof T>` | `type UserWithoutPassword = Omit<User, "password">; // 排除 password` |
| `Record<K, V>` | 构造一个键类型为 K、值类型为 V 的对象类型 | `Record<K, V>` | `type PageInfo = Record<"home" \| "about" \| "contact", { title: string }>;` |

**Bad vs Good：Pick / Omit 的选择**

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

// Bad — 排除太多，不直观
type PublicUser = Omit<User, "password" | "createdAt">;
// 以后新增了敏感字段忘记排除 → 泄露

// Good — 明确选取公开字段
type PublicUser = Pick<User, "id" | "name" | "email">;
// 新增字段默认不公开，显式加入才公开
```

### 3.2 联合类型操作

| 工具类型 | 用途 | 语法 | 示例 |
|----------|------|------|------|
| `Extract<T, U>` | 从联合类型 T 中提取属于 U 的子类型 | `Extract<T, U>` | `type T = Extract<"a" \| "b" \| "c", "a" \| "c">; // "a" \| "c"` |
| `Exclude<T, U>` | 从联合类型 T 中排除属于 U 的子类型 | `Exclude<T, U>` | `type T = Exclude<"a" \| "b" \| "c", "a">; // "b" \| "c"` |
| `NonNullable<T>` | 从 T 中排除 null 和 undefined | `NonNullable<T>` | `type T = NonNullable<string \| null \| undefined>; // string` |

**实际应用：Exclude 配合 keyof**

```typescript
// 排除特定键
type NonSensitiveKeys = Exclude<keyof User, "password" | "ssn">;
// "id" | "name" | "email" | "createdAt"
```

### 3.3 函数类型操作

| 工具类型 | 用途 | 语法 | 示例 |
|----------|------|------|------|
| `ReturnType<T>` | 获取函数类型的返回值类型 | `ReturnType<typeof fn>` | `type R = ReturnType<() => string>; // string` |
| `Parameters<T>` | 获取函数类型的参数类型（元组） | `Parameters<typeof fn>` | `type P = Parameters<(a: string, b: number) => void>; // [string, number]` |
| `ConstructorParameters<T>` | 获取构造函数类型的参数类型 | `ConstructorParameters<typeof Ctor>` | `type P = ConstructorParameters<typeof Date>; // [] \| [string \| number \| Date]` |
| `InstanceType<T>` | 获取构造函数类型的实例类型 | `InstanceType<typeof Ctor>` | `type DateInstance = InstanceType<typeof Date>; // Date` |
| `ThisParameterType<T>` | 获取函数类型中 this 参数的类型 | `ThisParameterType<T>` | `type T = ThisParameterType<(this: Window) => void>; // Window` |
| `OmitThisParameter<T>` | 移除函数类型中的 this 参数 | `OmitThisParameter<T>` | `type Fn = OmitThisParameter<(this: Window, x: number) => void>; // (x: number) => void` |

**实际应用：Parameters + ReturnType 实现类型安全的 debounce**

```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

### 3.4 异步与工具类型

| 工具类型 | 用途 | 语法 | 示例 |
|----------|------|------|------|
| `Awaited<T>` | 递归解包 Promise 类型（TS 4.5+） | `Awaited<T>` | `type T = Awaited<Promise<Promise<string>>>; // string` |
| `NoInfer<T>` | 阻止 TypeScript 从该位置推导类型（TS 5.4+） | `NoInfer<T>` | `function create<T>(items: T[], item: NoInfer<T>): T[] { return [...items, item]; }` |
| `ThisType<T>` | 在对象字面量中标记 this 的类型（需要 `noImplicitThis`） | `ThisType<T>` | `type Obj = { methods: ThisType<{ count: number }> }` |

### 3.5 字符串操作类型

| 工具类型 | 用途 | 语法 | 示例 |
|----------|------|------|------|
| `Uppercase<S>` | 将字符串字面量转为大写 | `Uppercase<"hello">` | `type T = Uppercase<"hello">; // "HELLO"` |
| `Lowercase<S>` | 将字符串字面量转为小写 | `Lowercase<"HELLO">` | `type T = Lowercase<"HELLO">; // "hello"` |
| `Capitalize<S>` | 将字符串字面量首字母大写 | `Capitalize<"hello">` | `type T = Capitalize<"hello">; // "Hello"` |
| `Uncapitalize<S>` | 将字符串字面量首字母小写 | `Uncapitalize<"Hello">` | `type T = Uncapitalize<"Hello">; // "hello"` |

**实际应用：字符串操作类型 + 模板字面量**

```typescript
type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickEvent = EventName<"click">; // "onClick"
type ChangeEvent = EventName<"change">; // "onChange"

// 结合映射类型生成事件处理器类型
type EventHandlers<T extends string> = {
  [K in T as `on${Capitalize<K>}`]: (event: K) => void;
};
type Handlers = EventHandlers<"click" | "change">;
// { onClick: (event: "click") => void; onChange: (event: "change") => void }
```

---

## 4. 映射类型修饰符

映射类型可以**添加**或**移除**属性的 `readonly` 和 `?`（可选）修饰符。

| 修饰符 | 含义 | 示例 |
|--------|------|------|
| `-?` | 移除可选（变为必需） | `{ [K in keyof T]-?: T[K] }` — 等价于 `Required<T>` |
| `+?` | 添加可选 | `{ [K in keyof T]+?: T[K] }` — `+` 可省略，等价于 `Partial<T>` |
| `-readonly` | 移除只读（变为可写） | `{ -readonly [K in keyof T]: T[K] }` |
| `+readonly` | 添加只读 | `{ +readonly [K in keyof T]: T[K] }` — `+` 可省略，等价于 `Readonly<T>` |
| `as` | 键重映射（TS 4.1+） | `{ [K in keyof T as NewKey]: T[K] }` |

### 键重映射示例

```typescript
// 去掉属性名的 "get" 前缀
interface API {
  getUser: () => User;
  getPosts: () => Post[];
  setConfig: (config: Config) => void;
}

type GettersOnly<T> = {
  [K in keyof T as K extends `get${infer _}` ? K : never]: T[K];
};

type Getters = GettersOnly<API>;
// { getUser: () => User; getPosts: () => Post[] }

// 给所有属性名加前缀
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type PrefixedUser = Prefixed<User, "user">;
// { userName: string; userAge: number; userEmail: string }
```

---

## 5. 类型层级关系图

```
                    unknown
                       │
                       │
                      any
                       │
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     object         string         number  ...  (原始类型)
        │              │              │
        │         ┌────┴────┐    ┌────┴────┐
     arrays     "hello"    "world"   42      99   (字面量类型)
        │
    string[]
        │
       never  (底端 —— 所有类型的子类型)
```

**关键规则**：

1. `unknown` 是**顶端类型**（Top Type）—— 所有类型可以赋值给 `unknown`，但 `unknown` 不能赋值给其他类型（除非收窄）。
2. `never` 是**底端类型**（Bottom Type）—— `never` 可以赋值给任何类型，但没有任何值可以赋值给 `never`。
3. `any` 是个例外——它既可以被任何类型赋值，也可以赋值给任何类型（绕过类型检查）。这就是为什么 `any` 被称为"核按钮"。
4. **原始类型**（string、number、boolean 等）是**具体字面量类型**的父类型。
5. **联合类型**取"并集"——`string | number` 包含了所有 string 和所有 number。
6. **交叉类型**取"交集"——`string & number` 是 `never`（没有值同时是 string 和 number）。

### 类型兼容性速查

| 赋值方向 | 是否允许 | 说明 |
|----------|----------|------|
| `literal → primitive` | 允许 | `"hello"` 可赋值给 `string` |
| `primitive → literal` | 不允许 | `string` 不可赋值给 `"hello"` |
| `any → anything` | 允许 | `any` 可赋值给任何类型 |
| `anything → unknown` | 允许 | `unknown` 是 Top Type |
| `never → anything` | 允许 | `never` 是 Bottom Type |
| `never → nothing` | 不允许 | 没有值可赋值给 `never` |

---

## 6. 使用方式

本附录设计为**按需查阅**而非通读：

1. **忘记关键字语法了？** 去第 2 节找到对应关键字看语法和示例。
2. **需要某个内置工具类型？** 去第 3 节按类别查找（对象操作、联合操作、函数操作等）。
3. **想理解映射类型修饰符？** 第 4 节列出了所有修饰符和实际例子。
4. **不确定类型兼容性？** 第 5 节的层级图和兼容性表可以快速参考。

---

## 7. 相关章节

| 章节 | 与本附录的关系 |
|------|---------------|
| [第 2 章：基础类型与类型推导](./ch02-basics.md) | `any` / `unknown` / `never` / `void` 的详细讲解 |
| [第 3 章：Interface 与 Type](./ch03-interfaces.md) | `interface` / `type` 的选型原则与声明合并 |
| [第 4 章：函数的类型契约](./ch04-functions.md) | 函数重载、`this` 类型、`Parameters` / `ReturnType` 的使用场景 |
| [第 14 章：声明文件](./ch14-declarations.md) | `declare` / `namespace` / `module` 在 .d.ts 中的应用 |
| [第 19 章：常见编译错误](./ch19-errors.md) | 使用 `satisfies` / `as` / `!` 时常犯的错误 |
| [第 20 章：反模式](./ch20-antipatterns.md) | 滥用 `any`、过度使用 `as` 等反模式的危害 |

---

## 8. 必须掌握的技能

完成本附录的查阅后，你应该能：

| 技能 | 说明 |
|------|------|
| 区分 `typeof` / `keyof` / `infer` 的用途 | 知道什么时候用类型查询、什么时候用索引查询、什么时候用模式匹配 |
| 正确使用类型守卫和断言 | 知道 `is` 和 `as` 的区别，能用 `satisfies` 代替类型注解 |
| 掌握内置工具类型的分类 | 知道哪个工具类型属于"对象操作"、"联合操作"、"函数操作"还是"字符串操作" |
| 理解映射类型修饰符 | 能用 `-?` / `-readonly` / `as` 自定义映射类型 |
| 理解类型层级 | 知道 `unknown` > `any` > 原始类型 > 字面量类型 > `never` 的层级关系 |
| 快速定位 | 能在 10 秒内从本附录找到需要的关键字或工具类型 |

### 自我检查清单

- [ ] 我能在项目中区分 `any`、`unknown`、`never`、`void` 的使用场景
- [ ] 我知道什么时候用 `Pick` 而不是 `Omit`（反之亦然）
- [ ] 我能用 `Parameters<T>` 和 `ReturnType<T>` 实现类型安全的函数包装
- [ ] 我理解 `-?` 和 `+?` 在映射类型中的作用
- [ ] 我知道 `keyof` 返回的是联合类型，并能配合 `Exclude` / `Extract` 使用
- [ ] 我能用 `as` 键重映射实现属性名的变换
- [ ] 我理解 `unknown` 为什么比 `any` 更安全
