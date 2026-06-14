# 第21章 深入编译器底层与性能调优

TypeScript 编译器不仅仅是一个"类型检查器"——它是一个复杂的多阶段管道，从源代码到类型检查再到代码生成，每一步都有精妙的设计。

本章带你深入 TS 编译器的内部机制，理解它的工作方式，并学会诊断和优化编译性能。

---

## 1. 核心概念

### TS 编译器的五个阶段

TS 编译器的处理流程可以想象成一条**工厂流水线**：

```
源代码 → [Scanner] → 令牌流 → [Parser] → AST → [Binder] → 符号表 → [Checker] → 类型验证 → [Emitter] → 目标代码
```

#### 阶段 1：Scanner（扫描器）

- **输入**：源代码字符串
- **输出**：Token 流（关键字、标识符、操作符等）
- **比喻**：把一整篇文章切成一个个单词和标点符号

```typescript
// 源代码：
const x: number = 42;

// Scanner 输出（简化）：
// [
//   { kind: Keyword, text: "const" },
//   { kind: Identifier, text: "x" },
//   { kind: Colon, text: ":" },
//   { kind: Identifier, text: "number" },
//   { kind: Equals, text: "=" },
//   { kind: NumericLiteral, text: "42" },
//   { kind: Semicolon, text: ";" },
// ]
```

#### 阶段 2：Parser（解析器）

- **输入**：Token 流
- **输出**：AST（抽象语法树）
- **比喻**：根据语法规则，把单词组合成句子结构

#### 阶段 3：Binder（绑定器）

- **输入**：AST
- **输出**：符号表（Symbol Table）
- **作用**：将每个标识符绑定到它的声明。例如，知道 `x` 是 `const x` 声明
- **比喻**：建立"名字→人"的对应关系，知道谁是谁

#### 阶段 4：Checker（类型检查器）

- **输入**：AST + 符号表
- **输出**：类型检查结果（通过或报错）
- **作用**：最复杂的阶段，负责所有类型推断和验证
- **比喻**：检查"主语是名词、谓语是动词"的语法正确性

#### 阶段 5：Emitter（发射器）

- **输入**：类型检查通过的 AST
- **输出**：目标代码（JS、声明文件、SourceMap）
- **作用**：把 TS 代码转译成 JS 代码
- **注意**：Emitter 不关心类型信息——类型检查是 Checker 的事

### 比喻：编译器的"五个车间"

把编译器想象成一家汽车工厂：

1. **Scanner** = 拆解车间：把整车拆成零件（Token）
2. **Parser** = 焊接车间：把零件焊接成车架（AST）
3. **Binder** = 喷漆车间：给每个零件打标签（符号绑定）
4. **Checker** = 质检车间：检查每个零件是否合格（类型检查）
5. **Emitter** = 总装车间：把车架组装成成品车（输出 JS）

---

## 2. 典型问题与处理

### 问题 1：函数参数的双变（bivariance）陷阱

```typescript
// === Bad: 函数参数的双变导致类型不安全 ===

// 当一个函数参数是联合类型时，TS 默认允许双向赋值
// 这在 strictFunctionTypes: false 时是合法的

// 定义一个回调类型
type Callback = (value: string | number) => void;

// 按理说，只接收 string 的函数不能赋值给 Callback
// 因为 Callback 可能传 number 进来
const callback: Callback = (value: string) => {
  // ❌ 如果 value 是 number，这里就崩溃了
  console.log(value.toUpperCase());
};

// TS 默认允许这个赋值（双变），但运行时会崩溃
callback(42); // ❌ 42.toUpperCase() 不是函数
```

```typescript
// === Good: 启用 strictFunctionTypes 修复 ===

// 在 tsconfig.json 中开启 strictFunctionTypes
// {
//   "compilerOptions": {
//     "strictFunctionTypes": true
//   }
// }

// ✅ 开启后，上面的赋值会报错
type Callback = (value: string | number) => void;

// ❌ 报错：不能将 (value: string) => void 赋值给 (value: string | number) => void
// const callback: Callback = (value: string) => {
//   console.log(value.toUpperCase());
// };

// ✅ 正确的做法：保持参数类型一致
const callbackSafe: Callback = (value: string | number) => {
  if (typeof value === "string") {
    console.log(value.toUpperCase());
  } else {
    console.log(value.toFixed(2));
  }
};

// ============ 关于 Array 的特殊情况 ============

// 虽然函数参数默认是双变，但 Array 的方法参数在 TS 中做了特殊处理

// 以下代码在 strictFunctionTypes 下仍然合法：
const numbers: number[] = [1, 2, 3];
numbers.forEach((item: string | number) => {
  // ✅ forEach 的回调参数允许拓宽
  // 因为 forEach 的 callback 是 write position（写入位置）
});
```

**为什么 Bad：** 双变允许不安全的赋值——函数声明接受 `string | number`，但实际回调只处理 `string`。
**为什么 Good：** `strictFunctionTypes` 强制逆变检查，确保函数参数类型安全。

---

### 问题 2：复杂递归类型导致编译 OOM

```typescript
// === Bad: 无限递归类型 ===

// ❌ 反模式：没有终止条件的递归类型
type InfiniteRecursion<T> = T extends string
  ? InfiniteRecursion<T> // 永远不终止
  : never;

// ❌ 深度嵌套的泛型导致"类型实例化过深"
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// 如果 T 有循环引用，DeepPartial 会无限递归
interface Node {
  value: number;
  next: Node | null; // 循环引用！
}

// ❌ 编译时可能报错：Type instantiation is excessively deep and possibly infinite
// type DeepNode = DeepPartial<Node>;
```

```typescript
// === Good: 安全的递归类型 ===

// ✅ 方案 1：使用数组长度模拟深度限制
// 原理：用数组的 length 属性作为计数器
type DeepPartialSafe<T, Depth extends any[] = []> = Depth["length"] extends 5
  ? T // 达到深度限制，返回原始类型
  : {
      [K in keyof T]?: T[K] extends object
        ? DeepPartialSafe<T[K], [...Depth, any]>
        : T[K];
    };

// ✅ 方案 2：用映射类型限制深度
interface Node {
  value: number;
  next: Node | null;
}

// 只展开一层，不递归
type ShallowNode = {
  [K in keyof Node]: Node[K];
};
// 这样就不会触发递归

// ✅ 方案 3：联合类型代替递归
// 如果可能，用固定长度的联合类型替代递归
type Path = "" | `path.${string}`;
// 而不是 type RecursivePath = `${string}.${RecursivePath}` | string;
```

**为什么 Bad：** 无限递归类型在编译时无法终止，导致类型检查器耗尽内存或达到递归深度限制。
**为什么 Good：** 限制递归深度、避免展开循环引用类型，保证编译器能在有限时间内完成检查。

---

### 问题 3：大项目编译卡顿

```typescript
// === 编译性能问题诊断 ===

// ❌ 性能杀手 1：大型联合类型
type AllPermissions =
  | "read:users"
  | "write:users"
  | "delete:users"
  | "read:posts"
  | "write:posts"
  | "delete:posts"
  // ... 100+ 个成员
  ;

// 联合类型超过 50 个成员时，TS 的检查复杂度急剧上升

// ❌ 性能杀手 2：过度使用条件类型
type ComplexCondition<T> = T extends string
  ? T extends `api/${infer R}`
    ? R extends `${infer A}/${infer B}`
      ? { area: A; action: B }
      : never
    : never
  : never;

// 嵌套条件类型每层都增加编译时间

// ❌ 性能杀手 3：在 .d.ts 中导出大量计算类型
export type DeepMapped<T> = {
  [K in keyof T]: T[K] extends object ? DeepMapped<T[K]> : string;
};
// 每次引用都会重新计算
```

```typescript
// === Good: 优化编译性能 ===

// ✅ 方案 1：将大联合类型改为对象映射
type PermissionGroup = {
  users: ["read", "write", "delete"];
  posts: ["read", "write", "delete"];
  // ...
};

type Permission = {
  [G in keyof PermissionGroup]: PermissionGroup[G] extends readonly string[]
    ? `${G & string}:${PermissionGroup[G][number]}`
    : never;
}[keyof PermissionGroup];
// 编译时计算一次，缓存结果

// ✅ 方案 2：使用 interface 替代 type 进行对象类型
interface User {
  name: string;
  age: number;
}
// interface 比 type 检查更快
// type User = { name: string; age: number; } // 稍慢

// ✅ 方案 3：提取公共类型，减少重复计算
// Bad：每次都重新计算
// type Result1 = SomeComplexType<Input1>;
// type Result2 = SomeComplexType<Input2>;

// Good：缓存中间结果
type ComputedBase = SomeComplexType<Input1>;
type Result1 = ComputedBase; // 直接引用
type Result2 = ComputedBase extends infer U ? SomeComplexType<Input2, U> : never;

// ✅ 方案 4：使用 project references 分割项目
// 在 tsconfig.json 中配置 references
// 见下方"配置/环境示例"
```

---

## 3. 示例代码

### AST 初探

```typescript
// 以下代码演示如何通过 @typescript-estree 查看 AST
// 安装：npm install @typescript-eslint/typescript-estree

import { parse } from "@typescript-eslint/typescript-estree";

const code = `
function greet(name: string): string {
  return "Hello, " + name;
}
`;

const ast = parse(code, {
  jsx: false,
  range: true,
  loc: true,
});

// 查看 AST 结构（简化输出）：
// {
//   type: "Program",
//   body: [
//     {
//       type: "FunctionDeclaration",
//       id: { type: "Identifier", name: "greet" },
//       params: [
//         {
//           type: "Identifier",
//           name: "name",
//           typeAnnotation: {
//             type: "TSStringKeyword",
//           },
//         },
//       ],
//       returnType: {
//         type: "TSStringKeyword",
//       },
//       body: {
//         type: "BlockStatement",
//         body: [
//           {
//             type: "ReturnStatement",
//             argument: {
//               type: "BinaryExpression",
//               operator: "+",
//               left: { type: "StringLiteral", value: "Hello, " },
//               right: { type: "Identifier", name: "name" },
//             },
//           },
//         ],
//       },
//     },
//   ],
// }

console.log(JSON.stringify(ast, null, 2));
```

### 自定义 ESLint 规则

```typescript
// 编写一个 ESLint 规则：禁止在回调中使用非空断言
// 规则名：no-non-null-in-callback

// 文件：eslint-rules/no-non-null-in-callback.ts
import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://example.com/rule/${name}`
);

const rule = createRule({
  name: "no-non-null-in-callback",
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止在回调函数中使用非空断言",
    },
    messages: {
      noNonNull:
        "不要在回调中使用非空断言 '!'，改用可选链或类型守卫",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // 监听 TSNonNullExpression 节点（即 x! 表达式）
      TSNonNullExpression(node: TSESTree.TSNonNullExpression) {
        // 检查父节点是否在回调中
        let current = node.parent;
        while (current) {
          if (
            current.type === "ArrowFunctionExpression" ||
            current.type === "FunctionExpression"
          ) {
            // 找到回调函数，报告错误
            context.report({
              node,
              messageId: "noNonNull",
            });
            return;
          }
          current = current.parent;
        }
      },
    };
  },
});

export default rule;
```

### 使用 --extendedDiagnostics 排查性能

```bash
# 在终端中运行
tsc --extendedDiagnostics --noEmit

# 输出示例：
# Files:                         156
# Lines:                     125,432
# Nodes:                     432,198
# Identifiers:               298,756
# Symbols:                   189,432
# Types:                     567,890
# Memory used:              245,760K
# Assignability cache size:  45,678
# Identity cache size:       23,456
# Subtype cache size:        34,567
# Strict type checking:   true
# 
# I/O Read time:           1.23s
# Parse time:              2.45s
# Bind time:               0.89s
# Check time:             12.34s   ← 类型检查占了大头
# Emit time:               1.56s
# Total time:             18.47s

# 如果 Check time 占比过高（> 60%），说明类型复杂度太高
# 重点关注：Types、Assignability cache size、Subtype cache size
```

---

## 4. 配置/环境示例

### 编译性能优化配置

```jsonc
// tsconfig.json — 性能优化版

{
  "compilerOptions": {
    // 严格模式：开启但注意性能影响
    "strict": true,
    "strictFunctionTypes": true,  // 启用逆变检查
    "strictNullChecks": true,
    "noImplicitAny": true,

    // 性能相关配置
    "skipLibCheck": true,         // 跳过 .d.ts 检查（大幅加速）
    "skipDefaultLibCheck": true,  // 跳过默认库检查

    // 增量编译（开发时加速）
    "incremental": true,          // 启用增量编译
    "tsBuildInfoFile": ".tsbuildinfo", // 缓存文件位置

    // 项目引用（大项目分割）
    "composite": true,
    "declaration": true,
    "declarationMap": true,

    // 模块解析优化
    "moduleResolution": "bundler", // 更快，适合现代 bundler
    "module": "esnext",
    "target": "esnext",

    // 可选：关闭不必要的检查
    "noUnusedLocals": false,      // 开发时可以关闭
    "noUnusedParameters": false,
  },

  // 使用 project references 分割项目
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/api" }
  ]
}
```

### 使用 Project References 分割项目

```jsonc
// 根目录 tsconfig.json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/api" }
  ]
}

// packages/core/tsconfig.json
{
  "compilerOptions": {
    "composite": true,          // 必须
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src"]
}

// packages/utils/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }       // 依赖 core
  ]
}

// 构建命令：
// tsc --build        // 构建所有项目
// tsc --build --force // 强制重新构建
// tsc --build --clean // 清理构建产物
```

### 协变与逆变的深入理解

```typescript
// ============ 协变（Covariance）============

// 定义：如果 A 是 B 的子类型，那么 Array<A> 也是 Array<B> 的子类型
// 在 TS 中：数组是协变的

class Animal {
  name: string = "";
}
class Dog extends Animal {
  bark() {}
}

const dogs: Dog[] = [new Dog()];
const animals: Animal[] = dogs; // ✅ 协变：Dog[] → Animal[]
// 这是安全的，因为数组是只读的——你可以从数组中读 Animal

// ============ 逆变（Contravariance）============

// 定义：如果 A 是 B 的子类型，那么 (x: B) => void 是 (x: A) => void 的子类型
// 在 TS 中（strictFunctionTypes 开启）：函数参数是逆变的

type HandlerAnimal = (a: Animal) => void;
type HandlerDog = (d: Dog) => void;

// ❌ 逆变：HandlerAnimal 不能赋值给 HandlerDog
// 因为 HandlerDog 期待 Dog 类型，但 HandlerAnimal 可能传 Animal
// const handler: HandlerDog = (a: Animal) => {}; // 报错

// ✅ 正确：HandlerDog 可以赋值给 HandlerAnimal
// 因为 HandlerAnimal 可以接受任何 Animal，包括 Dog
const handler2: HandlerAnimal = (d: Dog) => {};
// 但注意：如果 handler2 被传入 Cat，运行时可能崩溃
// 这就是为什么 TS 在 strictFunctionTypes 下不允许

// ============ 双变（Bivariance）============

// 在不开启 strictFunctionTypes 时，函数参数是双变的
// 即：既可以协变，也可以逆变

// 实际应用：Array 的方法回调
[1, 2, 3].forEach((item: number | string) => {
  // forEach 的回调参数允许拓宽
});

// ============ 不变（Invariance）============

// 定义：A 是 B 的子类型，但 Container<A> 和 Container<B> 没有子类型关系
// 在 TS 中：不直接支持，但可以通过设计实现

interface Container<T> {
  get(): T;
  set(value: T): void;
}

// Container<Dog> 和 Container<Animal> 没有子类型关系
// 因为 get 是协变的（返回 T），但 set 是逆变的（接收 T）
```

---

## 5. 必须掌握的技能

### 编译器架构速记

| 阶段 | 输入 | 输出 | 比喻 | 性能影响 |
|------|------|------|------|---------|
| Scanner | 源代码 | Token 流 | 切词 | 很小 |
| Parser | Token 流 | AST | 建语法树 | 中等 |
| Binder | AST | 符号表 | 绑定名字 | 中等 |
| Checker | AST + 符号表 | 类型结果 | 类型检查 | **最大** |
| Emitter | 检查后的 AST | JS 代码 | 生成输出 | 中等 |

### 性能调优检查清单

1. **运行 `tsc --extendedDiagnostics`** 查看各阶段耗时
2. **Check time > 60%**：检查是否有复杂类型（递归类型、大联合类型、深层泛型）
3. **开启 `skipLibCheck`**：跳过第三方库的类型检查
4. **使用 `incremental`**：开发时启用增量编译
5. **分割项目**：大项目使用 Project References 分割
6. **使用 `moduleResolution: "bundler"`**：减少模块解析时间
7. **减少 `export * from`**：使用显式导出
8. **检查 `.d.ts` 文件大小**：过大时考虑拆分为多个文件

### 核心概念速查

| 概念 | 定义 | TS 中默认行为 |
|------|------|-------------|
| 协变（Covariance） | 子类型关系方向一致 | 数组、返回值 |
| 逆变（Contravariance） | 子类型关系方向相反 | 函数参数（strict 模式） |
| 双变（Bivariance） | 两个方向都允许 | 函数参数（非 strict 模式） |
| 不变（Invariance） | 必须完全匹配 | 不直接支持 |

### 开发者应带走的知识点

1. **TS 编译器是五阶段流水线**：Scanner → Parser → Binder → Checker → Emitter，类型检查（Checker）是最耗时的阶段
2. **AST 不是魔法**：通过 `@typescript-eslint/typescript-estree` 可以查看任何 TS 代码的 AST，理解 AST 是编写自定义 ESLint 规则的基础
3. **`--extendedDiagnostics` 是你的性能仪表盘**：运行它，关注 Check time、Types 数量、cache size，这三个指标告诉你类型的复杂度
4. **函数参数是逆变的，返回值是协变的**：理解这个方向，就能理解为什么某些赋值合法或不合法
5. **递归类型要有限制**：不要写没有终止条件的递归类型，限制递归深度（建议 5 层以内）

### 最后的提醒

> **编译器是你的朋友，不是敌人。理解它的工作方式，你就能写出既安全又高效的类型代码。**

TS 编译器的设计经过了深思熟虑——每个阶段都有明确的分工，每条报错都有确定的产生路径。当你理解了编译器的内部机制，你就不再是"凭感觉写 TS"，而是"有策略地驾驭 TS"。
