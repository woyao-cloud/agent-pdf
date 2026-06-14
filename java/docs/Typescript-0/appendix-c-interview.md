# 附录C：面试题与类型体操手写题解析

## 1. 概述

本附录汇集了 TypeScript 面试中最常见的高频题目和类型体操手写题，覆盖从基础类型到高级类型体操的各个层次。

### 本附录包含什么

- **10 道高频面试题**：选择题 + 手写题，覆盖基础类型、泛型、条件类型、映射类型、`infer` 和实际场景
- **6 道类型体操手写题**：从 `DeepReadonly` 到 `IsNever`，每题附带逐步推导过程
- **5 块标准化结构**：概述、详细内容、使用方式、相关章节、必须掌握的技能

### 适合谁

- **求职者**：准备 TypeScript 前端/全栈面试，需要系统复习高频考点
- **进阶学习者**：学完手册正文后，想通过题目检验自己的掌握程度
- **面试官**：作为出题参考，覆盖不同难度层级的题目

### 题目结构

每题包含三个部分：

| 部分 | 说明 |
|------|------|
| 题目 | 问题描述 + 初始代码（如有） |
| 解答 | 正确答案（选择题给出选项，手写题给出完整代码） |
| 解析 | 为什么对/为什么错，考察的知识点是什么 |

---

## 2. 详细内容

### 2.1 高频 TS 面试题

#### 2.1.1 基础类型 — 题1

**题目：** 以下代码的输出（或编译结果）是什么？

```typescript
const arr = [1, 2, 3];
const result = arr.map(item => item.toString());
```

A. `result` 的类型是 `string[]`
B. `result` 的类型是 `number[]`
C. 编译错误：`toString` 不存在于 `number` 上
D. `result` 的类型是 `any[]`

**解答：** A

**解析：**

`arr` 被推断为 `number[]`。`Array.prototype.map` 的 TypeScript 签名是：

```typescript
map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
```

其中 `T` 是数组元素类型（`number`），回调返回 `U`（即 `string`），因此 `result` 的类型是 `string[]`。

考察知识点：类型推导、泛型方法 `map` 的签名。

---

#### 2.1.2 基础类型 — 题2

**题目：** 以下代码是否有类型错误？如果有，如何修复？

```typescript
function greet(name: string) {
  return `Hello, ${name.toUpperCase()}`;
}

greet(null);
```

**解答：** 有类型错误。当 `strictNullChecks` 开启时，`null` 不能赋值给 `string`。

修复方式一：修改函数签名接受 `string | null`

```typescript
function greet(name: string | null) {
  if (name === null) return 'Hello, Guest';
  return `Hello, ${name.toUpperCase()}`;
}
```

修复方式二：调用时做空值处理

```typescript
const user: string | null = getUserName();
greet(user ?? 'Guest');
```

**解析：**

`strictNullChecks` 是 `strict` 模式的核心子选项。关闭它会导致 `null` / `undefined` 可赋值给任何类型，这是 JavaScript 运行时崩溃的首要原因。

考察知识点：`strictNullChecks`、联合类型 `string | null`、类型收窄。

---

#### 2.1.3 泛型 — 题1

**题目：** 实现一个泛型函数 `firstElement`，返回数组的第一个元素。

```typescript
// 请补全函数签名
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0];
}

// 测试用例
const num = firstElement([1, 2, 3]);     // number | undefined
const str = firstElement(['a', 'b']);    // string | undefined
const empty = firstElement([]);          // undefined
```

**解答：**

```typescript
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

**解析：**

泛型 `T` 捕获数组元素的类型，返回值类型为 `T | undefined` 是因为数组可能为空。

为什么不用 `T` 作为返回值？因为 `arr[0]` 在数组为空时返回 `undefined`，TypeScript 的类型安全要求体现这种可能性。

考察知识点：泛型函数定义、`T[]` 等价于 `Array<T>`、`undefined` 在索引访问中的处理。

---

#### 2.1.4 泛型 — 题2

**题目：** 以下泛型约束代码哪里有问题？

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

interface User {
  name: string;
  age: number;
}

const user: User = { name: 'Alice', age: 30 };
getProperty(user, 'name');  // string
getProperty(user, 'email'); // ?
```

**解答：**

`getProperty(user, 'email')` 会报编译错误，因为 `'email'` 不是 `User` 的键。

**解析：**

`K extends keyof T` 约束 `K` 必须是 `T` 的键之一。`keyof User` 是 `'name' | 'age'`，`'email'` 不在其中，所以 TypeScript 拒绝编译。

如果希望允许访问不存在的键，可以用 `K extends string` 并将返回值类型改为 `T[K] | undefined`。但在实际项目中，`keyof` 约束正是我们想要的——它在编译时捕获了"访问不存在的属性"这种常见 bug。

考察知识点：`keyof` 操作符、泛型约束、索引访问类型 `T[K]`。

---

#### 2.1.5 条件类型 — 题1

**题目：** 以下代码中 `Result` 的类型是什么？

```typescript
type IsString<T> = T extends string ? 'yes' : 'no';

type Result1 = IsString<'hello'>;
type Result2 = IsString<42>;
type Result3 = IsString<string | number>;
```

A. `Result1 = 'yes'`, `Result2 = 'no'`, `Result3 = 'no'`
B. `Result1 = 'yes'`, `Result2 = 'no'`, `Result3 = 'yes' | 'no'`
C. `Result1 = 'yes'`, `Result2 = 'no'`, `Result3 = 'yes'`
D. 全部编译错误

**解答：** B

**解析：**

关键点在于**条件类型的分配律（Distributive Conditional Types）**。

当条件类型 `T extends U ? X : Y` 中的 `T` 是裸类型参数（bare type parameter）且 `T` 是联合类型时，TypeScript 会将联合类型的每个成员分别代入判断，然后将结果联合起来。

所以 `IsString<string | number>` 等价于：

```typescript
IsString<string> | IsString<number>
// → 'yes' | 'no'
```

如果想避免分配律，可以用 `[T] extends [string]` 将 `T` 包裹起来。

考察知识点：条件类型分配律、裸类型参数、`never` 在条件类型中的特殊行为。

---

#### 2.1.6 条件类型 — 题2

**题目：** 实现一个 `ExcludeProps` 类型，从对象类型中排除指定属性。

```typescript
// 期望：从 T 中排除键为 K 的属性
type ExcludeProps<T, K extends keyof T> = {
  [P in Exclude<keyof T, K>]: T[P];
};

interface User {
  name: string;
  age: number;
  email: string;
}

// 结果类型：{ name: string; age: number }
type WithoutEmail = ExcludeProps<User, 'email'>;
```

**解答：**

```typescript
type ExcludeProps<T, K extends keyof T> = {
  [P in Exclude<keyof T, K>]: T[P];
};
```

**解析：**

`Exclude<keyof T, K>` 是 TypeScript 内置的条件类型，定义为 `T extends K ? never : T`。这里 `Exclude<keyof User, 'email'>` 得到 `'name' | 'age'`，然后映射类型遍历这两个键生成新类型。

更简洁的写法也可以直接用 `Omit<T, K>`，它是 TypeScript 内置工具类型：

```typescript
type WithoutEmail = Omit<User, 'email'>;
```

但面试中通常会要求你手写实现，以考查对条件类型和映射类型的理解。

考察知识点：`Exclude`、映射类型、条件类型、`keyof`。

---

#### 2.1.7 映射类型 — 题1

**题目：** 以下代码中 `ReadonlyUser` 的类型是什么？

```typescript
interface User {
  name: string;
  age: number;
  email: string;
}

type ReadonlyUser = {
  readonly [K in keyof User]: User[K];
};
```

A. 同 `User`，所有属性变为 `readonly`
B. 同 `User`，属性变为可选
C. 同 `User`，无变化
D. 编译错误

**解答：** A

**解析：**

映射类型 `{ readonly [K in keyof User]: User[K] }` 遍历 `User` 的所有键，对每个键加上 `readonly` 修饰符。结果等价于：

```typescript
interface ReadonlyUser {
  readonly name: string;
  readonly age: number;
  readonly email: string;
}
```

这其实就是 TypeScript 内置工具类型 `Readonly<T>` 的手写实现。

```typescript
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};
```

映射类型的完整语法支持 `+` / `-` 修饰符前缀（如 `-readonly`、`+?`、`-?`），以及 `as` 子句进行键的重新映射。

考察知识点：映射类型语法、`readonly` 修饰符、`keyof`。

---

#### 2.1.8 infer — 题1

**题目：** 实现一个 `ReturnTypeOf` 类型，提取函数类型的返回值类型。

```typescript
// 期望：提取函数签名中的返回值类型
type ReturnTypeOf<T> = T extends (...args: any[]) => infer R ? R : never;

// 测试
type Fn = (x: number, y: string) => boolean;
type Result = ReturnTypeOf<Fn>; // boolean
```

**解答：**

```typescript
type ReturnTypeOf<T> = T extends (...args: any[]) => infer R ? R : never;
```

**解析：**

`infer R` 在条件类型中声明一个待推断的类型变量。当 `T` 匹配函数签名 `(...args: any[]) => infer R` 时，TypeScript 会从实际类型中推断出 `R` 的值。

`(...args: any[])` 匹配任意参数列表，`infer R` 捕获返回值类型。如果 `T` 不是函数类型，条件不满足，返回 `never`。

这实际上就是 TypeScript 内置工具类型 `ReturnType<T>` 的实现。

考察知识点：`infer` 关键字、条件类型中的类型推断、函数类型签名。

---

#### 2.1.9 实际场景 — 题1

**题目：** 实现一个类型安全的 `get` 函数，从嵌套对象中安全读取属性值，支持路径字符串。

```typescript
// 期望行为
const obj = {
  user: {
    name: 'Alice',
    settings: {
      theme: 'dark',
    },
  },
};

// get(obj, 'user.name') → string
// get(obj, 'user.settings.theme') → string
// get(obj, 'user.age') → 编译错误：'age' 不是 user 的属性
```

**解答：**

```typescript
// 逐层展开的路径类型
type Path<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? `${K}.${Path<T[K], keyof T[K]> & string}`
    : never
  : never;

// 简化的 get 函数（不要求完美类型推导，重点在类型安全）
function get<T, P extends string>(
  obj: T,
  path: P,
): P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rest extends string
      ? get<T[K], Rest> extends infer R
        ? R
        : never
      : never
    : never
  : P extends keyof T
    ? T[P]
    : never;
```

**解析：**

这是一个典型的"类型体操+实际场景"结合题。核心难点在于：

1. **路径类型**：用模板字面量类型表示 `'user.name'` 这样的路径
2. **逐层推断**：用递归条件类型 + `infer` 逐层提取路径每一段的类型
3. **边界处理**：路径不存在时编译报错

在实际项目中，这类深度嵌套的路径类型推断会显著增加编译负担。更实用的做法是用 `any` 做部分退让，或者用运行时库（如 `lodash.get`）配合简单的类型断言。

考察知识点：模板字面量类型、递归条件类型、`infer`、`keyof`。

---

#### 2.1.10 实际场景 — 题2

**题目：** 实现一个类型安全的事件发射器（EventEmitter），支持按事件名称推导 payload 类型。

```typescript
// 期望行为
interface MyEvents {
  click: { x: number; y: number };
  focus: void;
  keydown: { key: string };
}

const emitter = new TypedEmitter<MyEvents>();

emitter.on('click', (payload) => {
  // payload 被推导为 { x: number; y: number }
  console.log(payload.x, payload.y);
});

emitter.on('focus', () => {
  // focus 事件的 payload 是 void，不需要参数
});

emitter.on('keydown', (payload) => {
  console.log(payload.key); // string
});

// 错误：'resize' 不在 MyEvents 中
emitter.on('resize', () => {}); // 编译错误
```

**解答：**

```typescript
class TypedEmitter<Events extends Record<string, any>> {
  private handlers = new Map<keyof Events, Set<Function>>();

  on<E extends keyof Events>(
    event: E,
    handler: Events[E] extends void
      ? () => void
      : (payload: Events[E]) => void,
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  emit<E extends keyof Events>(event: E, payload?: Events[E]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(payload);
      });
    }
  }
}
```

**解析：**

关键设计点：

1. **泛型约束**：`Events extends Record<string, any>` 确保事件映射是对象类型
2. **条件 handler 签名**：`Events[E] extends void` 时 handler 无参数，否则接受 payload
3. **`E extends keyof Events`**：确保 `on('resize')` 在 `resize` 不存在时报错

这个模式在 Redux、Vue 的 EventBus 等实际框架中广泛应用。

考察知识点：泛型约束、条件类型、`keyof`、索引访问类型、实际设计模式。

---

### 2.2 类型体操手写题

#### 2.2.1 手写 DeepReadonly\<T\>

**题目描述：**

实现一个 `DeepReadonly<T>` 类型，将对象类型的所有属性（包括嵌套对象）递归地设为 `readonly`。

**使用场景：**

在大型配置对象或状态树中，需要确保整个对象树不可变（immutable）。

```typescript
// 期望
interface Config {
  server: {
    host: string;
    port: number;
  };
  database: {
    url: string;
    credentials: {
      user: string;
      password: string;
    };
  };
}

// DeepReadonly<Config> 后，所有层级的属性都不可修改
type FrozenConfig = DeepReadonly<Config>;
```

**解题思路（逐步推导）：**

**第一步：基础版本——单层 Readonly**

```typescript
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};
```

这只能处理最外层属性，嵌套对象内部的属性仍然是可写的。

**第二步：递归处理——对值类型也应用 DeepReadonly**

```typescript
type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};
```

这有问题：当 `T[P]` 是基本类型（`string`、`number`）时，`DeepReadonly<string>` 会尝试 `[P in keyof string]`，把 `string` 的属性也变成 `readonly`。这不是我们想要的。

**第三步：添加边界条件——非对象类型原样返回**

```typescript
type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
```

`T extends object` 排除了基本类型。但这里还有个问题：`Function` 也是 `object`，但我们通常不希望递归处理函数的属性。

**第四步：排除函数类型**

```typescript
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
    : T;
```

**最终代码：**

```typescript
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
    : T;
```

**测试用例：**

```typescript
interface Config {
  server: { host: string; port: number };
  database: { url: string };
  name: string;
  tags: string[];
  callback: () => void;
}

type FrozenConfig = DeepReadonly<Config>;

// ✅ 所有属性变为 readonly
// FrozenConfig['server']['host'] = 'new'  // ❌ 只读
// FrozenConfig['name'] = 'new'             // ❌ 只读
// FrozenConfig['callback']()               // ✅ 函数仍可调用
```

---

#### 2.2.2 手写 DeepPartial\<T\>

**题目描述：**

实现一个 `DeepPartial<T>` 类型，将对象类型的所有属性（包括嵌套对象）递归地设为可选（optional）。

**使用场景：**

API 更新请求中，用户可能只提交部分字段；或配置合并场景中，部分配置项可被覆盖。

```typescript
// 期望
interface UserProfile {
  name: string;
  address: {
    city: string;
    street: string;
  };
  settings: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

// 更新用户时，只需提供要修改的字段
type PartialProfile = DeepPartial<UserProfile>;
// 允许：{ name: 'Alice' }
// 允许：{ address: { city: 'Beijing' } }
// 允许：{}  // 空对象
```

**解题思路（逐步推导）：**

**第一步：基础版本——单层 Partial**

```typescript
type Partial<T> = {
  [P in keyof T]?: T[P];
};
```

**第二步：递归处理**

与 `DeepReadonly` 类似，需要递归处理嵌套对象，并对基本类型和函数类型做边界处理。

```typescript
type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;
```

**第三步（思考）：为什么 `T extends Function` 要先判断？**

`Function extends object` 为 `true`，如果不先排除函数类型，`DeepPartial<() => void>` 会递归处理函数的属性（如 `call`、`bind`、`apply`），产生一个巨大的无用类型。

**最终代码：**

```typescript
type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;
```

**测试用例：**

```typescript
interface UserProfile {
  name: string;
  address: {
    city: string;
    street: string;
  };
  settings: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
  callback: () => void;
}

type PartialProfile = DeepPartial<UserProfile>;

// ✅ 以下赋值都是类型安全的
const update1: PartialProfile = { name: 'Alice' };
const update2: PartialProfile = { address: { city: 'Beijing' } };
const update3: PartialProfile = {};
const update4: PartialProfile = { callback: () => {} };
```

---

#### 2.2.3 手写 UnionToIntersection\<T\>

**题目描述：**

实现一个 `UnionToIntersection<T>` 类型，将联合类型转换为交叉类型。

**使用场景：**

某些高级类型操作需要将分散的联合成员合并为一个整体类型。例如，将多个接口的联合类型合并为交叉类型。

```typescript
// 期望
type Union = { a: string } | { b: number } | { c: boolean };
type Intersection = UnionToIntersection<Union>;
// 结果：{ a: string } & { b: number } & { c: boolean }
```

**解题思路（逐步推导）：**

**第一步：理解核心原理——函数参数的逆变位置**

逆变（Contravariance）是这道题的核心。当多个函数类型通过条件类型分配时，函数参数位置会产生逆变行为，将联合类型转换为交叉类型。

```typescript
// 如果有一个函数类型 (x: A) => void | (x: B) => void
// 它实际接受的是 A & B，因为要同时满足两个函数签名
```

**第二步：利用条件类型分配律**

```typescript
type ToIntersection<T> = T extends any ? (x: T) => void : never;
```

当 `T` 是联合类型时，`ToIntersection` 会将每个成员分配到单独的函数类型，得到联合的函数类型：

```typescript
((x: { a: string }) => void) | ((x: { b: number }) => void) | ((x: { c: boolean }) => void)
```

**第三步：提取参数类型的交叉**

现在，我们需要将上述函数联合类型的参数类型提取为交叉类型。这需要 `infer` 在逆变位置的特殊行为：

```typescript
type UnionToIntersection<T> =
  (T extends any ? (x: T) => void : never) extends (x: infer R) => void
    ? R
    : never;
```

这里的关键是：`(x: T1) => void | (x: T2) => void extends (x: infer R) => void` 时，TypeScript 会推断 `R` 为 `T1 & T2`，因为逆变位置会把联合转换为交叉。

**最终代码：**

```typescript
type UnionToIntersection<T> =
  (T extends any ? (x: T) => void : never) extends (x: infer R) => void
    ? R
    : never;
```

**测试用例：**

```typescript
type Union = { a: string } | { b: number } | { c: boolean };
type Intersection = UnionToIntersection<Union>;

// 验证
const obj: Intersection = {
  a: 'hello',
  b: 42,
  c: true,
}; // ✅

// 更实际的例子：合并函数重载
type FnTypes = ((x: string) => void) | ((x: number) => void);
type MergedFn = UnionToIntersection<FnTypes>;
// ((x: string) => void) & ((x: number) => void) —— 即函数重载
```

---

#### 2.2.4 手写 PickByValue\<T, V\>

**题目描述：**

实现一个 `PickByValue<T, V>` 类型，从对象类型中筛选出值类型为 `V` 的属性。

**使用场景：**

在数据处理中，需要根据值的类型来筛选属性。例如，从一个配置对象中提取所有字符串类型的属性。

```typescript
// 期望
interface Data {
  name: string;
  age: number;
  email: string;
  isActive: boolean;
}

type StringProps = PickByValue<Data, string>;
// 结果：{ name: string; email: string }

type NumberProps = PickByValue<Data, number>;
// 结果：{ age: number }
```

**解题思路（逐步推导）：**

**第一步：确定筛选条件**

我们需要遍历 `T` 的所有键，只保留值类型匹配 `V` 的键。关键工具是条件类型：

```typescript
T[K] extends V ? K : never
```

**第二步：提取匹配的键**

用 `{ [K in keyof T]: T[K] extends V ? K : never }` 可以得到一个值类型为键名或 `never` 的对象，然后提取值类型不为 `never` 的键。

更简洁的方式是用 `keyof` 和条件类型的组合：

```typescript
type FilteredKeys<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
```

这样得到的是匹配键的联合类型。

**第三步：用 Pick 筛选**

```typescript
type PickByValue<T, V> = Pick<T, {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T]>;
```

**第四步（优化）：处理 `never` 的情况**

当没有任何属性匹配时，`FilteredKeys` 的结果是 `never`，`Pick<T, never>` 会得到空对象 `{}`。这是我们期望的行为。

**最终代码：**

```typescript
type PickByValue<T, V> = Pick<T, {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T]>;
```

**测试用例：**

```typescript
interface Data {
  name: string;
  age: number;
  email: string;
  isActive: boolean;
  tags: string[];
}

type StringProps = PickByValue<Data, string>;
// { name: string; email: string }

type NumberProps = PickByValue<Data, number>;
// { age: number }

type StringArrayProps = PickByValue<Data, string[]>;
// { tags: string[] }

type EmptyProps = PickByValue<Data, symbol>;
// {} —— 没有匹配的属性
```

---

#### 2.2.5 手写 IsNever\<T\>

**题目描述：**

实现一个 `IsNever<T>` 类型，判断 `T` 是否为 `never` 类型。

**使用场景：**

在高级类型体操中，经常需要特殊处理 `never` 类型，因为它与其他类型的交互有特殊规则（如条件类型分配律）。

```typescript
// 期望
type Test1 = IsNever<never>;    // true
type Test2 = IsNever<string>;  // false
type Test3 = IsNever<any>;     // false
type Test4 = IsNever<undefined>; // false
```

**解题思路（逐步推导）：**

**第一步：尝试直观写法**

```typescript
type IsNever<T> = T extends never ? true : false;
```

**结果：** `IsNever<never>` 得到 `never`，而不是 `true`。

**为什么？**

因为条件类型 `T extends never ? true : false` 中的 `never` 会被视为"空的联合类型"。根据条件类型的分配律，`never` 作为联合类型没有任何成员，所以条件判断直接被跳过，结果是 `never`。

**第二步：利用 `never` 不能分配的特性**

`never` 是 bottom type，它不能分配给任何类型（除了它自己）。但我们不能直接用 `T extends never`，因为 `never` 会被分配。

解决方案：将 `T` 和 `never` 都包在元组中，避免分配律：

```typescript
type IsNever<T> = [T] extends [never] ? true : false;
```

**第三步：验证边界情况**

`any` 不满足 `[any] extends [never]`，所以 `IsNever<any>` 是 `false`。但要注意，`never` 本身在元组中的行为：

- `[never] extends [never]` → `true`
- `[string] extends [never]` → `false`

**最终代码：**

```typescript
type IsNever<T> = [T] extends [never] ? true : false;
```

**测试用例：**

```typescript
type Test1 = IsNever<never>;        // true
type Test2 = IsNever<string>;       // false
type Test3 = IsNever<any>;          // false
type Test4 = IsNever<undefined>;    // false
type Test5 = IsNever<null>;         // false
type Test6 = IsNever<never | string>; // false（never | string 被简化为 string）

// 实际应用：条件类型中排除 never
type FilterNever<T> = T extends infer U
  ? IsNever<U> extends true ? never : U
  : never;

type Result = FilterNever<never | string | number>;
// string | number（移除了 never）
```

---

#### 2.2.6 手写 TupleToUnion\<T\>

**题目描述：**

实现一个 `TupleToUnion<T>` 类型，将元组类型转换为联合类型。

**使用场景：**

当我们需要将固定长度的元组（如 API 参数列表）转换为联合类型时使用。例如，定义一组允许的颜色值。

```typescript
// 期望
type Colors = ['red', 'green', 'blue'];
type ColorUnion = TupleToUnion<Colors>;
// 结果：'red' | 'green' | 'blue'

type Numbers = [1, 2, 3];
type NumberUnion = TupleToUnion<Numbers>;
// 结果：1 | 2 | 3
```

**解题思路（逐步推导）：**

**第一步：利用元组的索引访问**

元组类型可以通过数字索引访问元素。`T[number]` 可以获取元组所有元素的联合类型：

```typescript
type TupleToUnion<T> = T[number];
```

**第二步：验证**

```typescript
type Colors = ['red', 'green', 'blue'];
type Result = Colors[number];
// 'red' | 'green' | 'blue'
```

这是因为元组类型的索引签名：`T[number]` 返回所有数字索引对应的值类型的联合。

**第三步：添加泛型约束（可选）**

```typescript
type TupleToUnion<T extends readonly any[]> = T[number];
```

添加 `extends readonly any[]` 约束，确保 `T` 是元组或数组类型，并兼容 `readonly` 元组。

**最终代码：**

```typescript
type TupleToUnion<T extends readonly any[]> = T[number];
```

**测试用例：**

```typescript
type Colors = ['red', 'green', 'blue'];
type ColorUnion = TupleToUnion<Colors>;
// 'red' | 'green' | 'blue'

type Numbers = [1, 2, 3];
type NumberUnion = TupleToUnion<Numbers>;
// 1 | 2 | 3

type Mixed = [string, number, boolean];
type MixedUnion = TupleToUnion<Mixed>;
// string | number | boolean

// 兼容 readonly
type ReadonlyColors = readonly ['a', 'b'];
type ReadonlyUnion = TupleToUnion<ReadonlyColors>;
// 'a' | 'b'

// 实际应用：定义枚举
const COLORS = ['red', 'green', 'blue'] as const;
type Color = TupleToUnion<typeof COLORS>;
// 'red' | 'green' | 'blue'
```

---

## 3. 使用方式

### 自学

1. 按顺序逐题练习，先尝试独立思考
2. 每道题先看题目，尝试自己解答，再对照解析
3. 类型体操题建议在 TypeScript Playground 中实际验证

### 面试准备

- **高频面试题（第 2.1 节）**：建议全部掌握，覆盖了面试中 80% 的考点
- **类型体操题（第 2.2 节）**：根据目标公司要求选择性准备
  - `DeepReadonly` / `DeepPartial`：必考，映射类型+递归的经典组合
  - `UnionToIntersection`：进阶题，考察逆变理解
  - `PickByValue`：中等难度，映射类型+条件类型
  - `IsNever`：偏门考点，但理解了分配律就很简单
  - `TupleToUnion`：基础题，考察索引访问类型

### 推荐练习顺序

1. 先掌握面试题 2.1.1 - 2.1.8（基础到进阶）
2. 再练习实际场景题 2.1.9 - 2.1.10
3. 最后挑战类型体操 2.2.1 - 2.2.6

---

## 4. 相关章节

| 附录中的题目 | 相关手册章节 | 知识点 |
|-------------|------------|--------|
| 基础类型题（2.1.1 - 2.1.2） | 第2章 基础类型与类型推导 | `string`, `number`, `boolean`, `null`, `undefined`, 类型推导 |
| 泛型题（2.1.3 - 2.1.4） | 第6章 泛型 | 泛型函数、泛型约束、`keyof` |
| 条件类型题（2.1.5 - 2.1.6） | 第10章 条件类型与 infer | `extends ? :`、分配律、`Exclude` |
| 映射类型题（2.1.7） | 第9章 映射类型 | `[P in K]`、`readonly`、`?` 修饰符 |
| infer 题（2.1.8） | 第10章 条件类型与 infer | `infer` 在条件类型中的使用、`ReturnType` |
| 实际场景题（2.1.9 - 2.1.10） | 第4章 函数、第11章 模板字面量类型 | 函数重载、模板字面量类型、类型守卫 |
| DeepReadonly / DeepPartial | 第9章 映射类型 | 递归映射类型、边界处理 |
| UnionToIntersection | 第5章 联合与交叉 / 第21章 编译器底层原理 | 联合类型、交叉类型、逆变/协变 |
| PickByValue | 第9章 映射类型 / 第12章 内置工具类型 | 键重映射、条件类型筛选 |
| IsNever | 第10章 条件类型与 infer | 条件类型分配律、`never` 的特殊行为 |
| TupleToUnion | 第2章 基础类型与类型推导 | 元组类型、索引访问类型 `T[number]` |

---

## 5. 必须掌握的技能

完成本附录后，读者应该掌握以下技能：

### 基础能力

| 技能 | 说明 |
|------|------|
| 类型推导 | 理解 TypeScript 如何自动推断变量类型 |
| 联合类型与交叉类型 | 理解 `|` 和 `&` 的行为 |
| 泛型函数与泛型约束 | 能用泛型编写可复用的类型安全函数 |
| 条件类型 | 理解 `T extends U ? X : Y` 的用法和分配律 |
| 映射类型 | 能用 `[P in K]` 转换对象类型 |
| `infer` | 能在条件类型中提取子类型 |

### 进阶能力

| 技能 | 说明 |
|------|------|
| 递归类型 | 能处理嵌套对象类型的递归转换 |
| 逆变理解 | 理解函数参数位置的逆变行为 |
| 模板字面量类型 | 能用 `${}` 操作字符串字面量类型 |
| 内置工具类型 | 熟悉 `Pick`, `Omit`, `Exclude`, `Extract`, `ReturnType` 等 |
| 实际场景应用 | 能设计类型安全的事件系统、API 客户端等 |

### 自我检查清单

- [ ] 我能解释条件类型的分配律，并知道如何避免它
- [ ] 我能手写 `DeepReadonly` 和 `DeepPartial`
- [ ] 我理解 `infer` 的作用，能用它提取函数返回值类型
- [ ] 我知道 `UnionToIntersection` 的原理是利用逆变
- [ ] 我知道 `IsNever` 为什么需要 `[T] extends [never]` 而不是 `T extends never`
- [ ] 我能用映射类型 + 条件类型实现属性筛选（如 `PickByValue`）
- [ ] 我能在实际项目中选择合适的类型方案，而不是过度设计

---

> **一句话总结：** 面试题检验基础，类型体操考验深度。两者结合是掌握 TypeScript 类型系统的最佳路径——理解原理比记住答案重要得多。
