# 第五章：条件类型与 infer

条件类型是 TypeScript 类型系统中的"条件表达式"，它允许我们根据类型关系在类型层面进行分支选择。结合 `infer` 关键字，条件类型甚至能够从复杂类型中"解构"出内部类型，实现类型层面的模式匹配。本章将深入剖析条件类型的运行机制、分布式行为、infer 模式匹配以及工程实践中的常见陷阱。

---

## 5.1 条件类型基础

### 5.1.1 三目运算符语法

条件类型的语法与 JavaScript 的三目运算符类似：`T extends U ? X : Y`。它的语义是：如果类型 `T` 可以赋值给类型 `U`，则结果为类型 `X`，否则为类型 `Y`。

```typescript
// 基础条件类型
type IsString<T> = T extends string ? true : false;

type A = IsString<'hello'>;   // true
type B = IsString<42>;        // false
type C = IsString<string>;    // true
type D = IsString<number>;    // false
```

### 5.1.2 条件类型与联合类型的交互

当条件类型作用于联合类型时，TypeScript 会执行分布式条件类型（Distributive Conditional Types）——将联合类型的每个成员分别代入条件判断，再将结果联合起来：

```typescript
// 分布式条件类型
type ToArray<T> = T extends unknown ? T[] : never;

type Result = ToArray<string | number>;
// 等价于：string[] | number[]
// 而不是：(string | number)[]
```

### 5.1.3 条件类型的嵌套

条件类型可以嵌套使用，实现多分支逻辑：

```typescript
type TypeName<T> =
  T extends string ? 'string' :
  T extends number ? 'number' :
  T extends boolean ? 'boolean' :
  T extends undefined ? 'undefined' :
  T extends null ? 'null' :
  T extends Function ? 'function' :
  T extends object ? 'object' :
  'unknown';

type Name1 = TypeName<string>;     // 'string'
type Name2 = TypeName<42>;         // 'number'
type Name3 = TypeName<true>;      // 'boolean'
type Name4 = TypeName<() => void>; // 'function'
type Name5 = TypeName<Date>;      // 'object'
```

---

## 5.2 分布式条件类型详解

### 5.2.1 分布式行为的触发条件

分布式条件类型仅在以下条件同时满足时触发：

1. 条件类型的形式为 `T extends U ? X : Y`
2. `T` 是一个裸类型参数（bare type parameter），即没有被方括号、元组或其他类型构造器包裹
3. `T` 的实际类型是一个联合类型

```typescript
// 触发分布式
type Distributive<T> = T extends string ? 'yes' : 'no';
type D1 = Distributive<string | number>; // 'yes' | 'no'

// 不触发分布式（被数组包裹）
type NonDistributive<T> = [T] extends [string] ? 'yes' : 'no';
type D2 = NonDistributive<string | number>; // 'no'
```

### 5.2.2 分布式条件类型的实际应用

分布式条件类型在类型过滤和类型转换中非常有用：

```typescript
// 从联合类型中排除特定成员
type MyExclude<T, U> = T extends U ? never : T;

type T1 = MyExclude<'a' | 'b' | 'c', 'a'>;
// 等价于：'b' | 'c'

// 从联合类型中提取特定成员
type MyExtract<T, U> = T extends U ? T : never;

type T2 = MyExtract<'a' | 'b' | 'c', 'a' | 'b'>;
// 等价于：'a' | 'b'

// 过滤出函数类型
type FunctionMembers<T> = T extends (...args: any[]) => any ? T : never;

type T3 = FunctionMembers<string | (() => void) | number>;
// 等价于：() => void
```

### 5.2.3 阻止分布式行为

使用方括号包裹类型参数可以阻止分布式条件类型：

```typescript
// 分布式版本：每个成员单独判断
type IsUnion<T, U = T> =
  T extends U ? (U extends T ? false : true) : never;

type Check1 = IsUnion<string>;        // false
type Check2 = IsUnion<string | number>; // true

// 非分布式版本：整体判断
type IsStringNonDist<T> = [T] extends [string] ? true : false;

type Check3 = IsStringNonDist<string | number>; // false（整体判断）
```

---

## 5.3 infer 模式匹配

### 5.3.1 infer 的基本语法

`infer` 关键字在条件类型的 `extends` 子句中使用，用于声明一个待推断的类型变量。它允许我们从复杂类型中"提取"出内部类型：

```typescript
// 提取函数返回值类型
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type Fn = (x: number) => string;
type R = ReturnType<Fn>; // string

// 提取 Promise 内部值类型
type PromiseValue<T> = T extends Promise<infer V> ? V : never;

type P = PromiseValue<Promise<number>>; // number
type P2 = PromiseValue<number>;         // never
```

### 5.3.2 多层 infer 与嵌套解构

`infer` 可以嵌套使用，从多层包装的类型中提取内部类型：

```typescript
// 提取嵌套 Promise 的值类型
type DeepPromiseValue<T> =
  T extends Promise<infer V> ? DeepPromiseValue<V> : T;

type D1 = DeepPromiseValue<Promise<Promise<number>>>; // number
type D2 = DeepPromiseValue<Promise<string[]>>;        // string[]

// 提取数组元素类型
type ArrayElement<T> = T extends Array<infer E> ? E : T;

type E1 = ArrayElement<number[]>;   // number
type E2 = ArrayElement<string>;     // string（非数组则返回自身）

// 提取函数参数类型
type FirstParameter<T> =
  T extends (first: infer P, ...args: any[]) => any ? P : never;

type FP = FirstParameter<(name: string, age: number) => void>; // string
```

### 5.3.3 多个 infer 变量

一个条件类型中可以包含多个 `infer` 变量，用于同时提取多个位置的类型：

```typescript
// 同时提取函数参数和返回值类型
type FnInfo<T> =
  T extends (...args: infer P) => infer R
    ? { params: P; returnType: R }
    : never;

type Info = FnInfo<(a: string, b: number) => boolean>;
// { params: [string, number]; returnType: boolean }

// 提取对象类型中特定属性的类型
type PropertyType<T, K extends keyof T> = T extends { [P in K]: infer V }
  ? V
  : never;

type Obj = { name: string; age: number };
type NameType = PropertyType<Obj, 'name'>; // string
```

---

## 5.4 内置条件类型解析

### 5.4.1 Exclude 与 Extract

`Exclude<T, U>` 和 `Extract<T, U>` 是 TypeScript 内置的两个基础条件类型，它们的实现非常简洁：

```typescript
// Exclude：从 T 中排除可以赋值给 U 的类型
type Exclude<T, U> = T extends U ? never : T;

// Extract：从 T 中提取可以赋值给 U 的类型
type Extract<T, U> = T extends U ? T : never;

// 使用示例
type Status = 'idle' | 'loading' | 'success' | 'error';
type ActiveStatus = Exclude<Status, 'idle' | 'error'>;
// 'loading' | 'success'

type ErrorStatus = Extract<Status, 'error' | 'idle'>;
// 'idle' | 'error'
```

### 5.4.2 NonNullable

`NonNullable<T>` 从类型中排除 `null` 和 `undefined`：

```typescript
type NonNullable<T> = T extends null | undefined ? never : T;

type T1 = NonNullable<string | null | undefined>;
// string

type T2 = NonNullable<number | null>;
// number
```

### 5.4.3 Parameters 与 ConstructorParameters

```typescript
// 提取函数参数类型
type Parameters<T extends (...args: any) => any> =
  T extends (...args: infer P) => any ? P : never;

// 提取构造函数参数类型
type ConstructorParameters<T extends abstract new (...args: any) => any> =
  T extends abstract new (...args: infer P) => any ? P : never;

class Person {
  constructor(public name: string, public age: number) {}
}

type PersonParams = ConstructorParameters<typeof Person>;
// [string, number]
```

### 5.4.4 InstanceType

```typescript
// 提取实例类型
type InstanceType<T extends abstract new (...args: any) => any> =
  T extends abstract new (...args: any) => infer R ? R : any;

type PersonInstance = InstanceType<typeof Person>;
// Person
```

---

## 5.5 条件类型的递归与深度限制

### 5.5.1 递归条件类型

条件类型可以递归调用自身，实现类型层面的循环处理：

```typescript
// 递归展开嵌套数组
type Flatten<T> =
  T extends Array<infer E> ? Flatten<E> : T;

type F1 = Flatten<number[]>;                    // number
type F2 = Flatten<number[][]>;                  // number
type F3 = Flatten<Array<Array<Array<number>>>>; // number

// 递归提取对象中所有属性值的类型（深度展开）
type DeepValue<T> =
  T extends Record<string, infer V>
    ? V extends Record<string, unknown>
      ? DeepValue<V>
      : V
    : T;

type Config = {
  server: { host: string; port: number };
  database: { url: string; pool: { min: number; max: number } };
};

type ConfigValues = DeepValue<Config>;
// string | number（所有叶子节点的值类型）
```

### 5.5.2 递归深度限制

TypeScript 对递归条件类型有深度限制（默认为 50 层），超过限制会导致编译错误：

```typescript
// 深度递归可能导致编译错误
type DeepArray<T, N extends number, Acc extends any[] = []> =
  Acc['length'] extends N
    ? T
    : DeepArray<T[], N, [...Acc, any]>;

// 深度 45 层：✅ 正常
type D45 = DeepArray<number, 45>;

// 深度 55 层：❌ 可能触发深度限制
// type D55 = DeepArray<number, 55>;
```

### 5.5.3 尾递归优化

TypeScript 对条件类型的递归进行了尾递归优化，某些形式的递归可以突破深度限制：

```typescript
// 尾递归形式（编译器可以优化）
type TailRecursive<T, Acc extends unknown[] = []> =
  T extends [infer First, ...infer Rest]
    ? TailRecursive<Rest, [...Acc, First]>
    : Acc;

// 非尾递归形式（容易触发深度限制）
type NonTailRecursive<T> =
  T extends [infer First, ...infer Rest]
    ? [First, ...NonTailRecursive<Rest>]
    : [];
```

---

## 5.6 条件类型的调试与测试

### 5.6.1 类型断言验证

在开发条件类型时，使用类型断言进行验证是最直接的方法：

```typescript
// 类型断言验证
type _assert1 = true extends IsString<string> ? true : never; // ✅
type _assert2 = false extends IsString<number> ? true : never; // ✅

// 编译期断言工具
type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;

// 使用断言
type Test1 = Expect<Equal<ReturnType<() => string>, string>>; // ✅
type Test2 = Expect<Equal<PromiseValue<Promise<number>>, number>>; // ✅
```

### 5.6.2 逐步展开复杂条件类型

对于复杂的条件类型，可以将其拆解为多个中间步骤进行调试：

```typescript
// 复杂条件类型拆解
type DeepPick<T, K extends string> = T extends Record<string, any>
  ? {
      [P in K]: P extends keyof T
        ? T[P]
        : P extends `${infer K1}.${infer K2}`
          ? K1 extends keyof T
            ? DeepPick<T[K1], K2>
            : never
          : never;
    }[K]
  : never;

// 拆解为中间步骤
type _Step1<T, K extends string> = T extends Record<string, any> ? true : false;
type _Step2<T, K extends string> = K extends keyof T ? T[K] : never;
type _Step3<K extends string> = K extends `${infer K1}.${infer K2}` ? [K1, K2] : never;

// 分别验证每个步骤
type S1 = _Step1<{ a: number }, 'a'>; // true
type S2 = _Step2<{ a: number }, 'a'>; // number
type S3 = _Step3<'a.b'>;              // ['a', 'b']
```

### 5.6.3 条件类型的常见陷阱

```typescript
// 陷阱 1：联合类型意外展开
type IsStringArray<T> = T extends string[] ? true : false;
type Trap1 = IsStringArray<string | number>; // false（整体判断）

// 陷阱 2：never 在条件类型中的行为
type IsNever<T> = T extends never ? true : false;
type Trap2 = IsNever<never>; // never（不是 true！）

// 正确检测 never 的方式
type IsNeverCorrect<T> = [T] extends [never] ? true : false;
type Trap2Fixed = IsNeverCorrect<never>; // true

// 陷阱 3：any 在条件类型中的行为
type IsAny<T> = T extends any ? true : false;
type Trap3 = IsAny<any>; // boolean（any 会触发分布式）
```

---

## 5.7 条件类型在工具库中的应用

### 5.7.1 类型安全的深度路径访问

```typescript
// 深度路径类型
type DeepPath<T, K extends string> =
  K extends keyof T
    ? T[K]
    : K extends `${infer K1}.${infer K2}`
      ? K1 extends keyof T
        ? DeepPath<T[K1], K2>
        : never
      : never;

type Config = {
  server: { host: string; port: number };
  database: { url: string; pool: { min: number; max: number } };
};

type HostType = DeepPath<Config, 'server.host'>;     // string
type MinType = DeepPath<Config, 'database.pool.min'>; // number
type Invalid = DeepPath<Config, 'invalid.path'>;      // never
```

### 5.7.2 函数重载的类型推导

```typescript
// 根据参数类型推导返回值类型
type OverloadedReturn<T> =
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T extends Promise<infer V> ? V :
  T;

function process<T>(input: T): OverloadedReturn<T> {
  if (typeof input === 'string') return input as any;
  if (typeof input === 'number') return input as any;
  if (typeof input === 'boolean') return input as any;
  return input as any;
}

const r1 = process('hello'); // string
const r2 = process(42);      // number
const r3 = process(true);    // boolean
```

### 5.7.3 类型安全的枚举映射

```typescript
// 根据枚举值映射到对应的处理函数类型
enum EventType {
  Click = 'click',
  Hover = 'hover',
  Focus = 'focus',
}

type EventPayload = {
  [EventType.Click]: { x: number; y: number };
  [EventType.Hover]: { element: string };
  [EventType.Focus]: { target: string };
};

type EventHandler<T extends EventType> =
  T extends keyof EventPayload
    ? (payload: EventPayload[T]) => void
    : never;

// 使用
const handleClick: EventHandler<EventType.Click> = (payload) => {
  console.log(payload.x, payload.y); // 类型安全
};
```

---

## 5.8 条件类型性能优化

### 5.8.1 减少不必要的条件分支

过多的条件分支会导致编译器进行大量的类型关系计算。应尽量简化条件类型的结构：

```typescript
// ❌ 过多的嵌套分支
type ComplexType<T> =
  T extends string ? 'string' :
  T extends number ? 'number' :
  T extends boolean ? 'boolean' :
  T extends null ? 'null' :
  T extends undefined ? 'undefined' :
  T extends symbol ? 'symbol' :
  T extends bigint ? 'bigint' :
  'object';

// ✅ 使用映射类型替代
type TypeNameMap = {
  string: 'string';
  number: 'number';
  boolean: 'boolean';
  null: 'null';
  undefined: 'undefined';
  symbol: 'symbol';
  bigint: 'bigint';
  object: 'object';
};

type SimpleType<T> = T extends keyof TypeNameMap
  ? TypeNameMap[T]
  : 'object';
```

### 5.8.2 缓存中间结果

对于重复使用的条件类型结果，使用类型别名缓存可以避免重复计算：

```typescript
// ❌ 重复计算
type Process<T> =
  T extends string
    ? Transform<T>
    : T extends number
      ? Transform<T>
      : never;

// ✅ 缓存中间结果
type ProcessOptimized<T> =
  T extends string | number
    ? Transform<T>
    : never;
```

### 5.8.3 避免过深的递归

递归条件类型是编译性能的主要瓶颈之一。应尽量使用迭代思维设计类型：

```typescript
// ❌ 深度递归
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? DeepReadonly<T[K]>
    : T[K];
};

// ✅ 限制递归深度
type DeepReadonlyLimited<T, Depth extends number = 3, Acc extends any[] = []> =
  Acc['length'] extends Depth
    ? T
    : {
        readonly [K in keyof T]: T[K] extends object
          ? DeepReadonlyLimited<T[K], Depth, [...Acc, any]>
          : T[K];
      };
```

---

## 本章小结

条件类型是 TypeScript 类型系统中真正的"编程语言"特性。通过条件分支和模式匹配，我们可以在类型层面实现复杂的逻辑运算。关键要点包括：

1. **分布式条件类型**：联合类型在裸类型参数上会自动展开，利用方括号可以阻止这一行为
2. **infer 模式匹配**：从函数、Promise、数组等复合类型中提取内部类型
3. **递归条件类型**：实现类型层面的循环处理，但需注意深度限制
4. **调试技巧**：使用类型断言、拆解中间步骤、注意 never 和 any 的特殊行为
5. **性能优化**：减少分支、缓存结果、控制递归深度

下一章将介绍映射类型与模板字面量类型，它们与条件类型配合使用，构成了 TypeScript 类型体操的三大支柱。
