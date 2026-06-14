# 第24章 IDE 高级调试与类型探查

TypeScript 开发的大部分时间花在"和类型系统打交道"上。不理解你的工具，你就像在黑暗中摸索——看报错信息、猜类型、反复试错。

本章教你系统化使用 IDE 功能和辅助工具排查类型问题，让你从"猜"变成"查"。

---

## 1. 核心概念

### 类型探查的两大法宝：悬停 + 跳转

VSCode 中两个最被低估但最强大的类型排查工具：

**悬停（Hover）**：把鼠标放在变量/函数上，IDE 显示它的推断类型。

```
const x = [1, 2, 3].map(n => n * 2);
// 悬停在 x 上 → const x: number[]
```

**转到类型定义（Go to Type Definition）**：右键 → "Go to Type Definition"，跳转到某个变量的**实际推断类型**的定义处，而不是变量本身的声明位置。这在排查第三方库类型时尤其有用。

```
const fn = someThirdPartyFunction();
// "Go to Type Definition" → 跳到返回值类型的定义处
// 可以看到这个函数到底返回什么类型
```

### 类型沙盒隔离：TS Playground

当你遇到复杂的类型推导问题时，不要直接在项目中调试。使用 **TS Playground**（https://www.typescriptlang.org/play）隔离问题：

- 只保留最小复现代码
- 可以选择不同 TS 版本
- 显示编译后的 JS 代码
- 查看完整的类型推导过程

**比喻**：TS Playground 就像化学实验室的"通风橱"——在隔离环境中做危险的实验，不会炸掉你的项目。

### 类型级测试（Type-Level Testing）

普通测试测的是"运行时行为是否正确"，类型级测试测的是"类型推导是否正确"。

两个主流工具：
- **tsd**：TypeScript 官方团队维护的类型测试工具
- **expect-type**：社区流行的类型测试库，API 更直观

```typescript
// tsd 写法
import { expectType } from "tsd";

const result = [1, 2, 3].map(n => n * 2);
expectType<number[]>(result); // ✅ 如果 result 不是 number[]，编译报错

// expect-type 写法
import { expectTypeOf } from "expect-type";

expectTypeOf(result).toBeArray();
expectTypeOf(result).items.toEqualTypeOf<number>();
```

---

## 2. 典型问题与处理

### 问题 1：IDE 中类型提示与 tsc 编译结果不一致

```typescript
// === Bad: IDE 显示类型正确，但 tsc 报错 ===

// ❌ 场景：VSCode 中使用的 TS 版本和项目安装的版本不同
// IDE 使用 5.5（支持某些新语法），但项目 tsconfig 指向 5.0

// 假设项目安装了 TypeScript 5.0，但 VSCode 用了内置的 5.5
// 在 5.5 中支持的语法：
const arr = [1, 2, 3, null, undefined];
const filtered = arr.filter(Boolean);
// TS 5.5 中 filtered 类型：number[]
// TS 5.0 中 filtered 类型：(number | null | undefined)[]

// 你在 IDE 中看到 filtered 是 number[]，但 CI 中的 tsc 5.0 报错
```

**为什么不好：** IDE 和 tsc 版本不一致导致"本地看着没问题，CI 编译就报错"。这是最常见但也最容易忽视的陷阱。

```typescript
// === Good: 确保 IDE 使用项目安装的 TS 版本 ===

// ✅ 方案 1：在 VSCode 中选择项目 TS 版本
// Cmd+Shift+P → "TypeScript: Select TypeScript Version" → "Use Workspace Version"
// 确保 VSCode 使用的是 node_modules/typescript 而不是内置版本

// ✅ 方案 2：在项目根目录创建 .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}

// ✅ 方案 3：在 CI 中使用和本地完全相同的 TS 版本
// package.json
{
  "devDependencies": {
    "typescript": "~5.0.0" // 使用波浪号，只接受 patch 版本更新
  }
}
// CI 中运行：npx tsc --noEmit
// 确保 CI 使用项目安装的版本，而不是全局版本

// ✅ 方案 4：检查 tsconfig 中的 target 和 module 是否匹配
// 有时 IDE 显示的类型正确，但 tsc 报错是因为 target 太低
// 例如：TS 5.0 的某些类型特性需要 target: "ES2021" 以上
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext"
  }
}
```

**为什么好：** 统一 IDE 和 tsc 的版本，消除"本地 vs CI"的差异。在 `.vscode/settings.json` 中锁定 TS SDK 路径是最直接有效的做法。

---

### 问题 2：复杂泛型推导难以追踪

```typescript
// === Bad: 不知道泛型参数到底推导成了什么 ===

// ❌ 问题：多层泛型嵌套，悬停时看到的类型信息不完整
type DeepMap<T> = {
  [K in keyof T]: T[K] extends object ? DeepMap<T[K]> : string;
};

interface ComplexConfig {
  database: {
    host: string;
    port: number;
    credentials: {
      user: string;
      password: string;
    };
  };
  cache: {
    ttl: number;
    redis: {
      host: string;
      port: number;
    };
  };
}

// 悬停在 MappedConfig 上：看到的是 DeepMap<ComplexConfig>
// 但你真正想知道的是"展开后的具体类型是什么"
type MappedConfig = DeepMap<ComplexConfig>;
```

**为什么不好：** 泛型类型不展开时，悬停显示的是"这个泛型的名字"，而不是"这个泛型展开后的结果"。你不知道具体的属性类型是什么，也就无法确认类型推导是否正确。

```typescript
// === Good: 使用辅助工具展开复杂类型 ===

// ✅ 方案 1：使用 Expand 工具类型展开
// 这是排查复杂泛型最常用的技巧
type Expand<T> = T extends infer R ? { [K in keyof R]: R[K] } : never;

// 现在悬停在 ExpandedConfig 上，看到的是展开后的具体类型
type ExpandedConfig = Expand<DeepMap<ComplexConfig>>;
// 悬停显示：
// {
//   database: {
//     host: string;
//     port: string;
//     credentials: {
//       user: string;
//       password: string;
//     };
//   };
//   cache: {
//     ttl: string;
//     redis: {
//       host: string;
//       port: string;
//     };
//   };
// }

// ✅ 方案 2：使用 DeepExpand（展开嵌套对象）
type DeepExpand<T> = T extends object
  ? T extends infer R
    ? { [K in keyof R]: DeepExpand<R[K]> }
    : never
  : T;

type DeepExpandedConfig = DeepExpand<DeepMap<ComplexConfig>>;

// ✅ 方案 3：用 @ts-expect-error 检查类型（"负向测试"）
// 如果你想检查某个类型是不是预期的类型
const _test: Expand<DeepMap<ComplexConfig>> = {} as any;
// 故意写一个错误赋值来触发类型报错，看编译器怎么说
// @ts-expect-error — 预期这里会报错，因为 database 是对象不是 string
const _test2: Expand<DeepMap<ComplexConfig>>["database"] = "should fail";

// ✅ 方案 4：在 TS Playground 中隔离排查
// 1. 复制最小化的类型定义到 playground
// 2. 使用 Expand 工具类型展开
// 3. 切换 TS 版本验证
```

**为什么好：** `Expand<T>` 强制 TS 计算并展开泛型，悬停时看到的是最终类型而不是泛型名字。配合 `DeepExpand` 可以查看深层嵌套的完整展开结果。

---

### 问题 3：类型级测试缺失，重构时类型推导意外变化

```typescript
// === Bad: 没有类型测试，重构后类型推导变了但没人发现 ===

// ❌ 场景：重构了一个工具函数，返回值类型变了

// 原始版本
function createPair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}

// 某次重构后，不小心改成了：
function createPair<T, U>(first: T, second: U): [T | U] {
  return [first as T | U, second as T | U];
}
// 现在 createPair(1, "hello") 的类型是 [string | number]
// 而不是原来的 [number, string]

// 项目中的代码依赖原来的类型：
const pair = createPair(1, "hello");
// pair[0] 原来是 number，现在变成了 number | string
// 调用 .toFixed() 现在会报错了
```

**为什么不好：** 纯运行时测试覆盖不了"类型推导是否正确"这个问题。`createPair(1, "hello")` 在运行时仍然返回 `[1, "hello"]`，测试通过，但类型已经变了。所有使用了 `pair[0].toFixed()` 的地方都会在下次 tsc 时报错。

```typescript
// === Good: 使用 expect-type 或 tsd 进行类型级测试 ===

// 安装：npm install -D expect-type

import { expectTypeOf } from "expect-type";

// ✅ 方案 1：使用 expect-type 测试类型推导

function createPair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}

// 类型测试
const pair = createPair(1, "hello");
expectTypeOf(pair).toEqualTypeOf<[number, string]>(); // ✅ 如果类型变了，编译报错

const pair2 = createPair(true, { x: 1 });
expectTypeOf(pair2).toEqualTypeOf<[boolean, { x: number }]>(); // ✅

// ✅ 方案 2：使用 tsd

// 安装：npm install -D tsd
// 创建 .tsd 文件（通常放在 test-d/ 目录下）

// test-d/create-pair.test-d.ts
import { expectType } from "tsd";
import { createPair } from "../src/utils";

const pair = createPair(1, "hello");
expectType<[number, string]>(pair); // ✅ 如果类型变了，tsd 报错

// ✅ 方案 3：类型测试的常见模式

// 测试返回值类型
function process(input: string | number): string {
  return String(input);
}
const result = process(42);
expectTypeOf(result).toBeString();

// 测试泛型推导
function identity<T>(value: T): T {
  return value;
}
const idResult = identity("hello");
expectTypeOf(idResult).toEqualTypeOf<string>();

// 测试联合类型收窄
type Status = "active" | "inactive" | "pending";
function isActive(status: Status): status is "active" {
  return status === "active";
}
const status: Status = "active";
if (isActive(status)) {
  expectTypeOf(status).toEqualTypeOf<"active">(); // ✅ 类型守卫生效
}
```

**为什么好：** 类型级测试在编译时验证"类型推导是否符合预期"。如果重构改变了类型推导结果，类型测试会在编译时（或 CI 中）报错，而不是等到运行时才发现。将类型测试和运行时测试一起加入 CI，形成"双层防护"。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：使用 Expand 排查复杂类型
// ==========================================

// 工具：展开泛型，查看具体类型
type Expand<T> = T extends infer R ? { [K in keyof R]: R[K] } : never;

// 复杂类型示例
type ApiResponse<T> = {
  data: T;
  meta: {
    page: number;
    total: number;
    hasMore: boolean;
  };
  links: {
    self: string;
    next?: string;
    prev?: string;
  };
};

type User = {
  id: number;
  name: string;
  email: string;
};

// 查看展开后的类型
type UserResponse = Expand<ApiResponse<User>>;
// 悬停 UserResponse 看到：
// {
//   data: { id: number; name: string; email: string };
//   meta: { page: number; total: number; hasMore: boolean };
//   links: { self: string; next?: string; prev?: string };
// }

// ==========================================
// 示例 2：在 TS Playground 中隔离排查
// ==========================================

// 将以下代码复制到 https://www.typescriptlang.org/play

// 这是一个复杂的条件类型问题：
// 为什么这个类型推导不是我想象的？

type ExtractNames<T> = T extends { name: infer N } ? N : never;

// 测试
type Test1 = ExtractNames<{ name: string; age: number }>;
// 期望：string → ✅ 正确

type Test2 = ExtractNames<{ name: "alice" }>;
// 期望："alice" → ✅ 正确

type Test3 = ExtractNames<number>;
// 期望：never → ✅ 正确

// 如果结果不符合预期，在 Playground 中：
// 1. 简化代码到最小复现
// 2. 切换 TS 版本看是否是版本差异
// 3. 查看编译后的 JS 确认没有运行时影响

// ==========================================
// 示例 3：类型测试完整示例
// ==========================================

// 安装 expect-type：npm install -D expect-type

import { expectTypeOf } from "expect-type";

// ---- 测试工具函数 ----

// 函数：从数组中提取指定属性
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

// 类型测试
const users = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
];

const names = pluck(users, "name");
expectTypeOf(names).toEqualTypeOf<string[]>(); // ✅

const ages = pluck(users, "age");
expectTypeOf(ages).toEqualTypeOf<number[]>(); // ✅

// ---- 测试泛型组件 ----

// 函数：创建键值对
function createKeyValue<K extends string, V>(key: K, value: V): { key: K; value: V } {
  return { key, value };
}

const kv = createKeyValue("theme", "dark");
expectTypeOf(kv).toEqualTypeOf<{ key: "theme"; value: string }>(); // ✅

// ---- 测试联合类型收窄 ----

type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "triangle"; base: number; height: number };

function getArea(shape: Shape): number {
  if (shape.kind === "circle") {
    expectTypeOf(shape).toEqualTypeOf<{ kind: "circle"; radius: number }>();
    return Math.PI * shape.radius ** 2;
  }
  if (shape.kind === "square") {
    expectTypeOf(shape).toEqualTypeOf<{ kind: "square"; side: number }>();
    return shape.side ** 2;
  }
  expectTypeOf(shape).toEqualTypeOf<{ kind: "triangle"; base: number; height: number }>();
  return (shape.base * shape.height) / 2;
}

// ==========================================
// 示例 4：使用 "Go to Type Definition" 排查第三方库
// ==========================================

// 假设你使用了一个第三方库 my-utils
// 有一个函数 processData，你想知道它的确切返回值类型

import { processData } from "my-utils";

// 步骤：
// 1. 将鼠标悬停在 processData 上 → 查看函数签名
// 2. 右键 processData → "Go to Type Definition"
//    → 跳转到 .d.ts 文件中的定义
// 3. 查看完整的泛型签名和返回类型

// 示例：排查 express 的 Request 类型
import express from "express";

const app = express();

app.get("/", (req, res) => {
  // 悬停 req → 显示 req: Request<...>
  // "Go to Type Definition" → 跳转到 @types/express 中的 Request 类型定义
  // 可以看到 Request 有 Params, ResBody, ReqBody, Query 四个泛型参数
  // 所以正确用法是：
  // app.get<{ id: string }>("/:id", (req, res) => {
  //   req.params.id // 类型安全
  // });
});
```

---

## 4. 配置/环境示例

### VSCode 配置：统一 TS 版本

```jsonc
// .vscode/settings.json
{
  // 使用项目的 TypeScript 版本，而不是 VSCode 内置版本
  "typescript.tsdk": "node_modules/typescript/lib",

  // 提示用户使用工作区 TS 版本
  "typescript.enablePromptUseWorkspaceTsdk": true,

  // 在状态栏显示 TS 版本
  "typescript.showConfigVersionWarning": true,

  // 启用悬停时显示类型信息
  "typescript.hover.includeTypes": true,

  // 自动导入时显示类型信息
  "typescript.suggest.includeAutomaticOptionalChainCompletions": true
}
```

### 配置类型测试脚本

```jsonc
// package.json
{
  "scripts": {
    // 普通类型检查
    "type-check": "tsc --noEmit",

    // 类型级测试（使用 tsd）
    "type-test": "tsd",

    // 全部类型检查（包括类型测试）
    "check-all": "tsc --noEmit && tsd",

    // 使用 expect-type 时，类型测试和普通测试一起跑
    "test": "vitest run",
    "test:types": "vitest run --testPathPattern='\\.type-test\\.ts$'"
  }
}
```

### CI 中集成类型测试

```yaml
# .github/workflows/type-test.yml
name: Type-Level Tests

on: [pull_request]

jobs:
  type-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      # 1. 标准类型检查
      - name: TypeScript Check
        run: npx tsc --noEmit

      # 2. 类型级测试
      - name: Type-Level Tests
        run: npx tsd

      # 3. 确保没有 @ts-ignore（只能用 @ts-expect-error）
      - name: Check @ts-expect-error usage
        run: |
          # 统计 @ts-expect-error 的数量
          COUNT=$(grep -r "@ts-expect-error" src/ --include="*.ts" | wc -l)
          echo "Found $COUNT @ts-expect-error comments"
          # 如果超过阈值（比如 10 个），需要清理
          if [ $COUNT -gt 10 ]; then
            echo "⚠️ Too many @ts-expect-error comments. Consider fixing them."
          fi
```

### TS Playground 使用指南

```
TS Playground (https://www.typescriptlang.org/play)

核心功能：

1. 左侧面板：写 TS 代码
2. 右侧面板：显示编译后的 JS
3. 右上角 "Options"：切换 TS 版本
4. 右上角 "Export"：分享你的 Playground 链接

排查步骤：

1. 将问题代码复制到 Playground
2. 移除所有无关代码（最小化复现）
3. 使用 Expand 工具类型展开泛型
4. 切换 TS 版本验证是否是版本差异
5. 使用 "Share" 生成链接，发给同事讨论
```

---

## 5. 必须掌握的技能

### IDE 类型排查的"三步法"

遇到任何类型问题时，按以下顺序排查：

| 步骤 | 操作 | 解决什么问题 |
|------|------|-------------|
| 1. 悬停 | 鼠标放在变量上查看推断类型 | 最基本的信息：当前类型是什么 |
| 2. 展开 | 使用 `Expand<T>` 查看泛型展开结果 | 泛型推导是否符合预期 |
| 3. 隔离 | 复制到 TS Playground 最小化复现 | 排除项目配置干扰，确认是 TS 问题还是配置问题 |

### 类型级测试的"必测清单"

```typescript
// 以下场景强烈建议编写类型测试

// 1. 工具函数（泛型）
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
// → 测试：expectTypeOf(pick({a:1,b:2}, ["a"])).toEqualTypeOf<{a: number}>();

// 2. 类型守卫
function isString(value: unknown): value is string;
// → 测试：收窄后的类型是否正确

// 3. 复杂条件类型
type DeepReadonly<T>;
// → 测试：嵌套对象是否全部 readonly

// 4. API 响应类型
type ApiResponse<T>;
// → 测试：展开后的结构是否符合预期

// 5. 品牌类型
type UserId = Brand<string, "UserId">;
// → 测试：UserId 不能赋值给其他品牌类型
```

### 版本一致性检查清单

```
□ .vscode/settings.json 中 typescript.tsdk 指向 node_modules/typescript/lib
□ 项目的 TypeScript 版本和 CI 中使用的版本一致（锁定版本号）
□ tsconfig.json 中的 target 和 module 设置正确
□ CI 运行 tsc --noEmit 使用项目本地安装的 TS（npx tsc）
□ 团队成员都使用 "Use Workspace Version" 而不是 VSCode 内置版本
```

### 开发者应带走的知识点

1. **悬停 + 跳转是排查类型的两个最基本工具** —— 悬停看类型，跳转看定义。
2. **`Expand<T>` 展开泛型** —— 不展开的泛型就像没拆封的快递，你不知道里面是什么。
3. **统一 IDE 和 tsc 的 TS 版本** —— `.vscode/settings.json` 中配置 `typescript.tsdk` 是最重要的一步。
4. **TS Playground 是隔离排查的最佳工具** —— 不要在项目中调试复杂类型，复制到 Playground 隔离排查。
5. **类型级测试保护你的类型契约** —— 使用 `expect-type` 或 `tsd` 在编译时验证类型推导是否正确。
6. **`@ts-expect-error` 要定期清理** —— 每个 `@ts-expect-error` 都是一个技术债务，设置数量阈值并在 CI 中检查。

### 最后的建议

> **类型系统不是玄学，是可排查的。用对工具，你就能从"猜类型"变成"查类型"。**
