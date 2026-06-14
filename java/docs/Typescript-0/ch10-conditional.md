# 第10章 条件类型与 infer

---

## 1. 核心概念

### 条件类型（T extends U ? X : Y）：类型系统中的 if-else

条件类型让类型本身能做"分支判断"——如果 T 是 U 的子类型，结果类型是 X，否则是 Y：

```typescript
// 基础语法：类似三目运算符
type IsString<T> = T extends string ? "yes" : "no";

type A = IsString<string>; // "yes"
type B = IsString<number>; // "no"
type C = IsString<"hello">; // "yes" — "hello" 是 string 的子类型
```

把条件类型想象成类型层面的 `if-else`：`T extends U` 就是判断条件，`? X : Y` 就是两个分支。`extends` 在这里不是"继承"，而是"是 U 的子类型吗？"——检查 T 是否能赋值给 U。

### 分布式条件类型：联合类型的自动展开机制（核心难点）

当条件类型作用于**裸泛型参数**（即泛型参数直接出现在 `extends` 左边，没有被 `[]` 包裹）时，如果传入联合类型，TS 会**自动展开**——对联合类型的每个成员分别求值，最后合并结果：

```typescript
// 裸泛型参数 → 分布式
type ToArray<T> = T extends unknown ? T[] : never;

type Result = ToArray<string | number>;
// 过程：ToArray<string> | ToArray<number>
//      = string[] | number[]
// 注意：不是 (string | number)[]！

// 如果不想展开，用 [] 包裹
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;

type Result2 = ToArrayNonDist<string | number>;
// (string | number)[] — 不展开，整体处理
```

**核心难点理解**：分布式行为就像"forEach"——`ToArray<string | number>` 不是"把 `string | number` 整个传给 T"，而是"分别把 `string` 和 `number` 传给 T，再把结果合并"。这非常有用，但也容易导致意外的行为。

### infer 模式匹配：在类型层面进行"解构赋值"

`infer` 允许你在条件类型的 `extends` 子句中"提取"一个类型的某部分——类似于 JS 中的解构赋值：

```typescript
// 提取数组元素的类型
type ElementType<T> = T extends (infer U)[] ? U : never;

type A = ElementType<string[]>; // string
type B = ElementType<number[]>; // number

// 提取函数返回值的类型
type ReturnOf<T> = T extends (...args: any[]) => infer R ? R : never;

type Fn = (x: number) => string;
type R = ReturnOf<Fn>; // string
```

把 `infer` 想象成"类型版的解构"——你在 `extends` 模式中放一个 `infer U` 占位，TS 会从匹配的类型中"提取"出对应位置的实际类型赋值给 U。

---

## 2. 典型问题与处理

### 2.1 分布式条件类型的意外展开

**问题场景**：当你不希望条件类型对联合类型展开时，裸泛型参数会"擅自"帮你展开。

```typescript
// Bad — 意外展开导致意料之外的结果
type IsString<T> = T extends string ? true : false;

// 直觉上你可能以为结果是 false
type Result = IsString<string | number>;
// 实际结果：boolean（即 true | false）
// 过程：IsString<string> | IsString<number>
//      = true | false
//      = boolean
```

**为什么不好**：如果本意是检查 `string | number` 整体是否是 `string` 的子类型，结果应该是 `false`。但分布式条件类型把它拆成了两个判断——`string extends string` → `true` 和 `number extends string` → `false`，最终得到 `true | false`（即 `boolean`）。

```typescript
// Good — 用 [] 包裹泛型参数阻止分发
type IsString<T> = [T] extends [string] ? true : false;

type Result = IsString<string | number>; // false ✅
type Result2 = IsString<string>;         // true ✅
type Result3 = IsString<never>;          // true — never 是任何类型的子类型

// 或者更通用的写法：用元组包裹
type IsUnion<T, U = T> =
  T extends U ? ([U] extends [T] ? false : true) : never;

type Test1 = IsUnion<string>;         // false
type Test2 = IsUnion<string | number>; // true
```

**为什么好**：用 `[T] extends [U]` 将泛型参数包裹在元组中，TS 不会对联合类型进行分布式展开。此时 `extends` 判断的是"整个联合类型是否是某个类型的子类型"，而不是分别判断每个成员。

### 2.2 infer 在逆变位置（函数参数）的行为差异

**问题场景**：`infer` 在函数返回值位置（协变）和函数参数位置（逆变）的行为不同。

```typescript
// Bad — 不理解逆变位置的 infer
type ParamType<T> = T extends (arg: infer P) => any ? P : never;

type Fn1 = (x: string) => void;
type P1 = ParamType<Fn1>; // string ✅

// 但传入联合类型时
type Fn2 = ((x: string) => void) | ((x: number) => void);
type P2 = ParamType<Fn2>; // string & number — 逆变位置取交叉！
```

**为什么不好**：新手通常期望结果是 `string | number`，但实际得到 `string & number`。这是因为函数参数是**逆变**（contravariant）位置——多个函数类型的参数类型取交叉而非联合。这不是 bug，是类型理论的要求，但确实反直觉。

```typescript
// Good — 理解逆变行为，必要时用分布式条件类型手动展开
type ParamTypeDistributive<T> = T extends (arg: infer P) => any ? P : never;

// 对联合类型，用分布式展开分别提取
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

// 如果确实需要联合而不是交叉，手动分布式处理
type ParamTypeAsUnion<T> =
  T extends any
    ? T extends (arg: infer P) => any ? P : never
    : never;

type Fn2 = ((x: string) => void) | ((x: number) => void);
type P3 = ParamTypeAsUnion<Fn2>; // string | number ✅
```

**为什么好**：理解协变/逆变后，你能精确控制 infer 的提取行为。如果确实需要联合类型结果，通过显式分布式展开来获得。

### 2.3 递归条件类型没有终止条件

**问题场景**：递归条件类型如果没有基准情况（base case），会导致无限递归。

```typescript
// Bad — 无限递归的条件类型
type DeepReadonly<T> = {
  readonly [K in keyof T]: DeepReadonly<T[K]>;
};

interface User {
  name: string;
  nested: {
    value: number;
    deeper: {
      x: boolean;
    };
  };
}

// DeepReadonly<User> 会无限递归！
// 因为 string、number、boolean 这些原始类型也有 keyof
// keyof string → number | typeof Symbol.iterator | "toString" | "charAt" | ...
// 然后 DeepReadonly<string> → 继续递归，永不停止
```

**为什么不好**：原始类型也有 `keyof`（比如 `keyof string` 返回 `number | typeof Symbol.iterator | ...`），递归会一直进行下去，导致编译器崩溃或类型检查超时。

```typescript
// Good — 为原始类型和数组添加终止条件
type DeepReadonly<T> =
  T extends Primitive ? T
  : T extends Array<infer U> ? ReadonlyArray<DeepReadonly<U>>
  : T extends Map<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends Set<infer U> ? ReadonlySet<DeepReadonly<U>>
  : {
    readonly [K in keyof T]: DeepReadonly<T[K]>;
  };

// 定义原始类型（递归终止条件）
type Primitive =
  | string | number | boolean | bigint | symbol | null | undefined
  | Date | RegExp | Error;

// 现在递归有了终止条件
interface User {
  name: string;
  nested: {
    value: number;
    deeper: {
      x: boolean;
    };
  };
}

type DeepReadonlyUser = DeepReadonly<User>;
// {
//   readonly name: string;
//   readonly nested: {
//     readonly value: number;
//     readonly deeper: {
//       readonly x: boolean;
//     };
//   };
// }
```

**为什么好**：通过在递归之前检查 `T extends Primitive`，遇到原始类型时直接返回 T 自身，不再继续展开。这确保了递归深度有限，编译器可以安全求值。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：手写 ReturnType
// ==========================================

// 提取函数返回值类型
type MyReturnType<T extends (...args: any) => any> =
  T extends (...args: any) => infer R ? R : any;

function greet(name: string): string {
  return `Hello, ${name}`;
}

function getCount(): number {
  return 42;
}

type GreetReturn = MyReturnType<typeof greet>; // string
type CountReturn = MyReturnType<typeof getCount>; // number

// 测试
const r1: GreetReturn = greet("World"); // ✅
const r2: CountReturn = getCount();     // ✅

// ==========================================
// 示例 2：手写 Parameters
// ==========================================

// 提取函数参数类型（元组）
type MyParameters<T extends (...args: any) => any> =
  T extends (...args: infer P) => any ? P : never;

function logUser(name: string, age: number): void {
  console.log(`${name}: ${age}`);
}

type LogParams = MyParameters<typeof logUser>;
// [string, number]

// 测试
const params: LogParams = ["Alice", 30]; // ✅
// const badParams: LogParams = ["Alice"]; // ❌ 类型错误

// ==========================================
// 示例 3：手写 Awaited（解开 Promise）
// ==========================================

// 递归解开嵌套的 Promise
type MyAwaited<T> =
  T extends Promise<infer U> ? MyAwaited<U> : T;

type P1 = MyAwaited<Promise<string>>;           // string
type P2 = MyAwaited<Promise<Promise<number>>>;   // number
type P3 = MyAwaited<Promise<Promise<Promise<boolean>>>>; // boolean

// 测试
async function fetchData(): Promise<string> {
  return "data";
}

type Fetched = MyAwaited<ReturnType<typeof fetchData>>; // string

// ==========================================
// 示例 4：提取数组/元组元素类型
// ==========================================

// 提取数组元素类型
type ArrayElement<T> = T extends (infer U)[] ? U : never;

type E1 = ArrayElement<string[]>;     // string
type E2 = ArrayElement<number[]>;     // number
type E3 = ArrayElement<boolean[][]>;  // boolean[] — 只解开一层

// 提取元组最后一个元素的类型
type LastInTuple<T extends any[]> = T extends [...infer _, infer Last]
  ? Last
  : never;

type Tuple = [string, number, boolean];
type Last = LastInTuple<Tuple>; // boolean

// 提取元组第一个元素的类型
type FirstInTuple<T extends any[]> = T extends [infer First, ...infer _]
  ? First
  : never;

type First = FirstInTuple<Tuple>; // string

// ==========================================
// 示例 5：条件类型实现类型安全的路由匹配
// ==========================================

// 根据路由路径提取参数
type ExtractRouteParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractRouteParams<Rest>]: string }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

type UserRoute = ExtractRouteParams<"/users/:id">;
// { id: string }

type PostRoute = ExtractRouteParams<"/posts/:postId/comments/:commentId">;
// { postId: string; commentId: string }

type NoParams = ExtractRouteParams<"/about">;
// {}
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与条件类型相关的配置

```jsonc
{
  "compilerOptions": {
    // 严格模式确保条件类型中的 extends 判断更精确
    "strict": true,

    // 控制递归条件类型的最大深度（默认 50）
    // 如果你的递归类型较深，可以适当增加
    "maxNodeModuleJsDepth": 0,

    // 不相关但对类型检查有帮助
    "noUncheckedIndexedAccess": true,

    // target 不影响条件类型，但建议用较新的版本
    "target": "ES2022"
  }
}
```

### 4.2 使用 tsc 的 `--showConfig` 查看当前配置

```bash
# 查看当前生效的 tsconfig 配置
npx tsc --showConfig

# 检查类型（测试你的条件类型是否工作）
npx tsc --noEmit
```

### 4.3 条件类型的调试技巧

```typescript
// 技巧 1：用 never 验证条件是否命中
type Debug<T> = T extends string ? "IS_STRING" : never;
type Test = Debug<"hello">; // "IS_STRING"
type Test2 = Debug<42>;     // never（条件不命中，结果为 never）

// 技巧 2：使用工具类型展开查看中间结果
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

interface User { name: string; age: number; }
type ExpandedUser = Expand<User>; // IDE 中 hover 查看

// 技巧 3：类型断言验证（编译时检查）
type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Check1 = AssertEqual<string, string>; // true
type Check2 = AssertEqual<string, number>; // false
```

---

## 5. 必须掌握的技能

### 5.1 条件类型的心智模型

| 概念 | 类比 |
|------|------|
| `T extends U ? X : Y` | 类型版三目运算符 |
| 分布式条件类型 | `arr.map(x => fn(x))` — 对联合的每个成员分别处理 |
| `[T] extends [U]` 阻止分发 | 用元组"包裹"参数，让 `extends` 检查整个类型 |
| `infer U` | 类型版解构赋值 — 从模式中提取一部分 |
| 递归条件类型 | 类型版递归函数 — 需要基准情况终止 |

### 5.2 分布式条件类型触发条件

| 写法 | 是否分布式 | 示例结果 |
|------|-----------|---------|
| `T extends U ? X : Y` | 是（T 是裸泛型） | `F<string \| number>` = `F<string> \| F<number>` |
| `[T] extends [U] ? X : Y` | 否（T 被元组包裹） | `F<string \| number>` = 整体判断 |
| `(T & U) extends V ? ...` | 否（T 不是裸的） | 整体判断 |
| `T[] extends U[] ? ...` | 否（T 不是裸的） | 整体判断 |

### 5.3 infer 常用模式速查

```typescript
// 提取数组元素类型
type ElementOf<T> = T extends (infer U)[] ? U : never;

// 提取 Promise 值类型
type Unwrap<T> = T extends Promise<infer U> ? U : T;

// 提取函数参数
type Params<T> = T extends (...args: infer P) => any ? P : never;

// 提取函数返回值
type Returns<T> = T extends (...args: any) => infer R ? R : never;

// 提取构造函数实例类型
type Instance<T> = T extends new (...args: any) => infer R ? R : never;

// 提取 this 参数类型
type ThisParam<T> = T extends (this: infer T, ...args: any) => any ? T : never;
```

### 5.4 总结：你必须带走的知识点

1. **条件类型是类型系统的 if-else**——`T extends U ? X : Y`，在编译时做类型分支判断。
2. **分布式条件类型自动展开联合**——对联合类型的每个成员分别判断。这是特性不是 bug，但要用 `[]` 包裹来控制它。
3. **`infer` 做类型解构**——从函数签名、数组、Promise 等复合类型中提取子类型。
4. **递归条件类型需要终止条件**——没有 Primitive 检查的递归会导致无限递归。
5. **手写 ReturnType、Parameters、Awaited**——理解这些内置工具类型的实现，而不是只当黑盒用。
6. **协变 vs 逆变**——`infer` 在返回值位置（协变）取联合，在参数位置（逆变）取交叉。
7. **`infer` 是最强大的高级类型特性**——掌握它后，你可以读取和变换任意复杂类型的内部结构。

---

> **上一章**：[第9章 映射类型与索引类型](./ch09-mapped.md)
> **下一章**：[第11章 模板字面量类型](./ch11-template-literals.md)
