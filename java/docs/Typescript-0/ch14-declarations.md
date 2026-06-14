# 第14章 模块解析与声明文件

## 1. 核心概念

### TypeScript 是如何寻找模块的？

当你在代码中写下 `import { x } from "./utils"` 时，TypeScript 编译器会按一套规则去查找这个模块。理解这套规则，你就能预判编译器会找到哪个文件。

#### 相对路径 vs 非相对路径

```typescript
// 相对路径（以 ./ 或 ../ 开头）
import { something } from "./utils";        // 从当前文件所在目录开始找
import { something } from "../shared/utils"; // 从父目录开始找

// 非相对路径（不以 ./ 或 ../ 开头）
import { something } from "lodash";          // 从 node_modules 中找
import { something } from "@myorg/utils";    // 从 node_modules 中找
```

**相对路径**的解析逻辑很直观：
1. `./utils` -> 查找 `./utils.ts` -> `./utils.tsx` -> `./utils.d.ts`
2. 如果都没找到，查找 `./utils/index.ts` -> `./utils/index.d.ts`

**非相对路径**的解析逻辑类似于 Node.js 的 `require.resolve`：
1. 当前目录的 `node_modules/` 中查找
2. 父目录的 `node_modules/` 中查找
3. 直到根目录

#### 三种解析策略的差异

以 `import { x } from "./utils"` 为例：

```
项目结构：
src/
├── utils.ts     // 我们想要导入的文件
└── index.ts

node_modules/
└── utils/
    └── index.js
```

| 解析策略 | 查找顺序 | 结果 |
|---------|---------|------|
| `classic` | `./utils.ts` -> `./utils.d.ts` -> `./utils/index.d.ts` | 可能找到错误文件 |
| `node` | `./utils.ts` -> `./utils.tsx` -> `./utils.d.ts` -> `./utils/index.ts` -> `./utils/index.d.ts` | 找到 `./utils.ts` |
| `node16` | 严格遵循 ESM 规则，需要 `.js` 扩展名 | 找到 `./utils.ts`（对应 `./utils.js`） |
| `bundler` | 类似 `node` 但更宽松 | 找到 `./utils.ts` |

### 声明文件（.d.ts）是什么？

`.d.ts` 文件是 TypeScript 的类型描述文件，它就像一本"说明书"——告诉编辑器这个 JS 模块有哪些导出、每个导出是什么类型、接受什么参数。

类比：如果你买了一台进口电器，.d.ts 就是中文说明书——你不需要拆开电器就知道它怎么用。同样，TS 不需要看 JS 实现就知道这个模块的接口是什么。

```
// example.d.ts — 类型说明书
export function add(a: number, b: number): number;
export const VERSION: string;

// example.js — 实际实现
function add(a, b) { return a + b; }
const VERSION = "1.0.0";
```

---

## 2. 典型问题与处理

### 问题 1：声明文件中的模块声明与全局声明冲突

```typescript
// Bad — 在同一个 .d.ts 文件中混合模块声明和全局声明

// types/global.d.ts
declare namespace MyApp {
  interface User {
    name: string;
  }
}

// types/legacy.d.ts
// 这里想声明一个全局变量，但被模块声明覆盖了
declare var MyApp: {
  version: string;
};
// ❌ 冲突：MyApp 同时作为 namespace 和 var 被声明
```

```typescript
// Good — 区分模块声明和全局声明

// types/global.d.ts — 全局声明（没有 import/export 语句）
interface User {
  name: string;
  email: string;
}

declare namespace MyApp {
  export const VERSION: string;
  export function initialize(): void;
}

// types/legacy-plugin.d.ts — 扩展全局声明
interface Window {
  MyApp: typeof MyApp;
  legacyPlugin: {
    run: (config: Record<string, unknown>) => void;
  };
}
```

```typescript
// types/module-augmentation.d.ts — 模块增强（有 import/export）
import "some-library";

declare module "some-library" {
  export interface SomeInterface {
    newMethod(): void;  // 为第三方库添加新的方法类型
  }
}
```

**为什么不好：** 在 `.d.ts` 文件中，只要包含 `import` 或 `export` 语句，该文件就自动变为"模块声明"——其所有声明都只在模块作用域内有效。如果同时使用 `declare namespace` 和 `declare var` 声明同名标识符，TS 会报重复声明错误。

**为什么好：** 将全局声明（无 import/export）、模块增强（有 import/export）和纯类型定义分离到不同文件，避免作用域污染和命名冲突。全局声明用于描述非模块化的 JS 文件，模块增强用于给第三方库补充类型。

### 问题 2：为无类型的第三方库补充声明

```typescript
// Bad — 使用 any 绕过类型检查
import oldLib from "old-lib";

// @ts-ignore
oldLib.doSomething("test");  // 无类型提示，无编译检查
// 任何参数类型错误都要到运行时才发现
```

```typescript
// Good — 为无类型库编写声明文件

// types/old-lib.d.ts
declare module "old-lib" {
  export interface Options {
    timeout?: number;
    retries?: number;
    onComplete?: (result: unknown) => void;
  }

  export function doSomething(input: string, options?: Options): Promise<unknown>;
  export const VERSION: string;
}

// index.ts — 使用时有完整类型提示
import oldLib from "old-lib";

oldLib.doSomething("test", { timeout: 5000 });  // ✅ 类型安全
// oldLib.doSomething(123);  // ❌ 编译报错：参数类型错误
```

**为什么不好：** 使用 `@ts-ignore` 或 `any` 完全放弃了类型检查——这就像把门锁拆了来避免找钥匙的麻烦。当你调用一个不存在的函数或传错参数时，只能在运行时发现。

**为什么好：** 手写 `.d.ts` 声明文件只需描述你实际使用的 API 部分（无需完整覆盖整个库），就能获得完整的类型检查和编辑器智能提示。投入产出比极高。

### 问题 3：声明文件中的类型导出问题

```typescript
// Bad — 在 .d.ts 中使用实现级别的细节

declare module "my-lib" {
  // ❌ .d.ts 中不应该有具体实现
  class InternalHelper {
    private cache: Map<string, any>;
    process(): void;
  }

  export function useHelper(): InternalHelper;
}

// Good — 只暴露公共 API 的类型

declare module "my-lib" {
  // ✅ .d.ts 只描述公共接口
  export interface Result {
    data: unknown;
    timestamp: number;
  }

  export function getData(id: string): Promise<Result>;
  export function setData(id: string, data: unknown): Promise<void>;
}
```

**为什么不好：** `.d.ts` 是类型说明书，不是实现源码。暴露内部类会泄露实现细节、增加维护负担，并可能导致消费者依赖不应依赖的内部 API。

---

## 3. 示例代码

### 手写声明文件完整示例

```typescript
// types/svg.d.ts — 为 SVG 文件声明类型
declare module "*.svg" {
  import React from "react";
  const SVGComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  export default SVGComponent;
}

// types/css.d.ts — 为 CSS 模块声明类型
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// types/env.d.ts — 为环境变量声明类型
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
    API_URL: string;
    DB_HOST?: string;
    DB_PORT?: string;
  }
}
```

### declare 的多种用法

```typescript
// 1. declare var / const / let — 声明全局变量
declare var __VERSION__: string;

// 2. declare function — 声明全局函数
declare function $(selector: string): HTMLElement | null;

// 3. declare class — 声明全局类
declare class Animal {
  constructor(name: string);
  speak(): void;
}

// 4. declare namespace — 声明全局命名空间（用于非模块化 JS 库）
declare namespace MyMath {
  function add(a: number, b: number): number;
  const PI: number;
}

// 5. declare module — 声明模块（用于模块化 JS 库）
declare module "my-custom-lib" {
  export function run(config: Record<string, unknown>): void;
  export interface Config {
    debug: boolean;
  }
}

// 6. declare global — 在模块文件中扩展全局作用域
// 仅在模块文件（包含 import/export）中使用
export {};
declare global {
  interface String {
    capitalize(): string;
  }
}
```

### 为自己的库生成 .d.ts

```json
// tsconfig.json — 开启声明文件生成
{
  "compilerOptions": {
    "declaration": true,           // 生成 .d.ts 文件
    "declarationMap": true,        // 生成 .d.ts.map（支持跳转到源码）
    "declarationDir": "./dist/types", // 声明文件输出目录
    "emitDeclarationOnly": false,  // 是否只输出声明文件
    "outDir": "./dist"
  }
}
```

运行 `tsc` 后：

```
项目结构：
src/
├── index.ts
├── utils.ts
└── types.ts

dist/
├── index.js
├── index.d.ts        ← 自动生成的类型声明
├── index.d.ts.map    ← 类型声明源映射
├── utils.js
├── utils.d.ts
├── types.js
├── types.d.ts
└── types.d.ts.map
```

生成的 `.d.ts` 示例：

```typescript
// dist/index.d.ts（自动生成）
export { createServer, type ServerConfig } from "./types";
export { formatDate, parseInput } from "./utils";
```

---

## 4. 配置/环境示例

### @types 包的查找机制

```json
// tsconfig.json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./types"],
    // 默认值：["node_modules/@types"]
    // 如果自定义了 typeRoots，默认路径就不再生效

    "types": ["node", "jest"]
    // 只加载 @types/node 和 @types/jest
    // 其他 @types 包不会被自动加载
  }
}
```

```
项目结构：
node_modules/
├── @types/
│   ├── node/          ← @types/node（Node.js 类型）
│   │   └── index.d.ts
│   ├── express/       ← @types/express（Express 类型）
│   │   └── index.d.ts
│   └── jest/          ← @types/jest（Jest 类型）
│       └── index.d.ts
types/
├── my-declarations.d.ts  ← 手写声明文件
└── env.d.ts              ← 环境声明
```

### 一个库项目的完整声明文件配置

```json
// package.json
{
  "name": "my-awesome-lib",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",          // 类型入口
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",    // ESM 类型入口
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.ts",    // CJS 类型入口
        "default": "./dist/index.js"
      }
    },
    "./utils": {
      "import": {
        "types": "./dist/utils.d.ts",
        "default": "./dist/utils.mjs"
      },
      "require": {
        "types": "./dist/utils.d.ts",
        "default": "./dist/utils.js"
      }
    }
  }
}
```

### 常见的 @types 包

| 包名 | 用途 |
|------|------|
| `@types/node` | Node.js 内置 API 类型 |
| `@types/express` | Express 框架类型 |
| `@types/react` | React 类型 |
| `@types/lodash` | Lodash 类型 |
| `@types/jest` | Jest 测试框架类型 |
| `@types/cors` | CORS 中间件类型 |
| `@types/morgan` | Morgan 日志中间件类型 |

---

## 5. 必须掌握的技能

| 技能 | 说明 | 优先级 |
|------|------|--------|
| 理解相对/非相对路径解析 | 能预测 import 语句会找到哪个文件 | 必需 |
| 手写 declare module | 为无类型第三方库补充声明 | 必需 |
| 区分全局声明和模块声明 | 理解 import/export 对声明作用域的影响 | 必需 |
| 配置 declaration 输出 | 为自己的库生成 .d.ts 文件 | 必需 |
| 理解 typeRoots 和 types | 控制 @types 包的加载 | 重要 |
| 声明合并与模块增强 | 使用 declare module 扩展第三方库类型 | 重要 |
| 为自定义文件类型写声明 | SVG、CSS Module、环境变量等 | 重要 |
| package.json 的 types 与 exports | 正确配置库的类型入口 | 重要 |

### 自我检查清单

- [ ] 我知道相对路径（`./`）和非相对路径解析的区别
- [ ] 我能在没有 @types 的情况下手写 declare module
- [ ] 我知道 `.d.ts` 文件中带 `import` 和不带 `import` 的区别
- [ ] 我能为团队库配置 `declaration: true` 并正确设置 `types` 入口
- [ ] 我理解 `typeRoots` 和 `types` 配置项的作用
- [ ] 我会使用 `declare module` 来增强第三方库的类型

---

> **一句话总结：** 声明文件是 TS 生态的"翻译器"——它让没有类型的 JS 代码也能享受到类型系统的保护。学会读写 `.d.ts`，你就不再受限于框架的类型支持是否完善。
