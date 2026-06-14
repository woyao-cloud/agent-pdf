# 第26章 平滑迁移与渐进式重构

将几十万行 JavaScript 项目迁移到 TypeScript，不是"一把梭"的工程——它是一场**外科手术**，需要在业务不中断的情况下，一刀一刀地替换。

本章教你如何制定和执行 JS 到 TS 的渐进式迁移计划。

---

## 1. 核心概念

### 迁移不是"重写"

最错误的迁移方式是：停下来所有业务开发，花三个月"重写"整个项目。

```
❌ 错误心态：迁移 = 重写
"我们把项目停掉，全部用 TS 重写一遍"

✅ 正确心态：迁移 = 渐进式替换
"今天把这个工具函数改成 TS，明天把这个组件改成 TS"
```

**比喻**：迁移就像给一辆飞驰的赛车换轮胎——你不能把车停下来换，你得在行驶过程中一个一个地换。

### 迁移的三个阶段

```
阶段 1：混合编译（开启 allowJs + checkJs）
  ┌─────────────┐    ┌─────────────┐
  │  .js 文件    │    │  .ts 文件   │
  │  (现有代码)   │    │  (新代码)    │
  └─────────────┘    └─────────────┘
        ↓                   ↓
  ┌─────────────────────────────────┐
  │      tsc (allowJs: true)        │
  │  .js 也能被编译，.ts 也能引用 .js │
  └─────────────────────────────────┘

阶段 2：从边缘向核心推进
  工具函数 → 类型定义 → 业务组件 → 核心模块

阶段 3：完全 TS（移除所有 .js 文件）
  ┌─────────────────────────────────┐
  │          全部 .ts 文件           │
  │     allowJs: false（可选）        │
  └─────────────────────────────────┘
```

### 巧用 `@ts-expect-error` 和 `@ts-ignore`

在迁移过程中，你不可避免地会遇到"这个类型太复杂，先不管"的情况。关键在于**标记 + 定期清理**：

- **`@ts-expect-error`**：告诉 TS "我知道这里有类型错误，但我现在不处理"。如果下一行没有错误，TS 会反过来报错——这迫使你及时修复。
- **`@ts-ignore`**：直接忽略错误，且不检查下一行是否有错误。**不推荐**。

```typescript
// ✅ 推荐：@ts-expect-error — 如果错误修好了，它会提醒你
// @ts-expect-error — TODO: 迁移阶段 2 需要处理
const result = legacyJsFunction("input"); // 这行如果有类型错误，被忽略

// ❌ 不推荐：@ts-ignore — 错误修好了也不会提醒你
// @ts-ignore
const result2 = anotherLegacyFunction("input");
```

---

## 2. 典型问题与处理

### 问题 1：混合 JS 和 TS 时模块解析混乱

```javascript
// === Bad: 迁移初期不做任何配置，直接混用 ===

// ❌ 问题场景：
// 项目原本是 JS，加了几个 .ts 文件后，模块解析出问题

// utils.js（原始 JS 文件）
export function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// user.ts（新建的 TS 文件）
// ❌ 直接引用 .js 文件，但 tsc 不知道如何解析
import { formatDate } from "./utils"; // 编译错误：找不到模块

// app.ts
import { formatDate } from "./utils";
console.log(formatDate("2024-01-01")); // ❌ 运行时崩溃：date.toISOString is not a function
// 因为 formatDate 期待 Date 对象，但传入了字符串
```

**为什么不好：** 没有配置 `allowJs` 时，TS 编译器不会解析 `.js` 文件。模块找不到，项目直接无法编译。即使编译通过了，JS 文件没有类型标注，传参错误只能在运行时暴露。

```typescript
// === Good: 正确配置混合编译环境 ===

// ✅ 第一步：配置 tsconfig.json
// tsconfig.json
{
  "compilerOptions": {
    "allowJs": true,           // 允许编译 JS 文件
    "checkJs": false,          // 暂时不检查 JS 文件（阶段 1）
    "outDir": "./dist",        // 输出目录
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": false,           // 迁移初期不要太严格
    "noEmit": true,            // 如果用 bundler 编译，不需要 tsc 输出
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.js",             // 包含 JS 文件
    "src/**/*.ts"              // 包含 TS 文件
  ]
}

// ✅ 第二步：为关键 JS 文件添加类型声明
// utils.d.ts（为 utils.js 编写类型声明）
declare module "./utils" {
  export function formatDate(date: Date): string;
  export function parseDate(str: string): Date;
}

// ✅ 第三步：使用 JSDoc 注释在 JS 文件中添加类型信息
// utils.js — 用 JSDoc 提供类型信息
/**
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// ✅ 第四步：TS 文件引用 JS 文件时，类型安全
// user.ts
import { formatDate } from "./utils";

const date = new Date("2024-01-01");
console.log(formatDate(date)); // ✅ 类型安全
```

**为什么好：** `allowJs: true` 让 tsc 能解析 JS 文件。JSDoc 注释为 JS 函数提供类型信息，让 TS 文件在引用 JS 时也能获得类型检查。类型声明文件（`.d.ts`）为没有源码的第三方 JS 库提供类型。

---

### 问题 2：第三方库无类型定义

```javascript
// === Bad: 遇到无类型的第三方库就卡住 ===

// ❌ 问题：lodash 的某个插件没有 @types 包

// 安装了一个 JS 库：npm install legacy-utils
// 但没有 @types/legacy-utils

// app.ts
import { specialTransform } from "legacy-utils";
// ❌ 编译错误：找不到模块 "legacy-utils" 的类型声明
// 或：specialTransform 的类型是 any

const result = specialTransform({ key: "value" });
// result 是 any，失去了类型安全
```

**为什么不好：** 遇到无类型的第三方库就卡住，导致迁移进度停滞。手动编写完整的类型声明文件成本太高。

```typescript
// === Good: 分层次处理无类型库 ===

// ✅ 方案 1：创建自己的 .d.ts 声明文件（最低成本）

// types/legacy-utils.d.ts
// 只声明你需要使用的 API，不需要声明全部
declare module "legacy-utils" {
  // 只声明你真正使用的函数
  export function specialTransform<T extends Record<string, unknown>>(
    input: T
  ): Record<string, string>;

  // 其他函数用 any 兜底
  export function otherFunction(...args: any[]): any;
}

// 使用
import { specialTransform } from "legacy-utils";

const result = specialTransform({ key: "value" });
// result 的类型是 Record<string, string> ✅

// ✅ 方案 2：使用 declare module 扩展现有类型
// 例如：express 的 Request 缺少自定义属性

// types/express.d.ts
import "express";

declare module "express" {
  interface Request {
    user?: {
      id: string;
      name: string;
      role: string;
    };
  }
}

// 使用
import express from "express";

const app = express();
app.get("/", (req, res) => {
  // req.user 现在有类型了 ✅
  console.log(req.user?.name);
});

// ✅ 方案 3：使用 tsconfig 中的 typeRoots 管理声明文件
{
  "compilerOptions": {
    "typeRoots": [
      "./node_modules/@types", // 官方类型包
      "./types"                // 自定义声明文件
    ]
  }
}

// ✅ 方案 4：使用 allowUmdGlobalAccess 处理 UMD 库
{
  "compilerOptions": {
    "allowUmdGlobalAccess": true // 允许访问 UMD 全局变量
  }
}
```

**为什么好：** 不需要为整个库写类型声明，只声明你使用的 API，成本最低。`declare module` 扩展现有类型，在不修改第三方库的情况下增加自定义属性。`typeRoots` 让自定义声明文件有组织地存放。

---

### 问题 3：迁移过程中"进度失控"

```typescript
// === Bad: 没有计划，想改哪里改哪里 ===

// ❌ 典型表现：
// 1. 没有迁移清单，不知道哪些文件已迁移、哪些没迁移
// 2. 迁移和业务修改混在一起，Code Review 分不清哪是哪
// 3. 团队成员使用不同的迁移策略（有人用 any，有人用严格类型）
// 4. 迁移三个月了，还有 50% 的 .js 文件
```

**为什么不好：** 没有计划的迁移一定会失败。代码库长期处于"半 JS 半 TS"的混乱状态，新老成员都痛苦。迁移没有终点，最终所有人都失去了动力。

```typescript
// === Good: 制定清晰的迁移计划 ===

// ✅ 1. 创建迁移清单（使用脚本跟踪进度）

// scripts/track-migration.js
/**
 * 扫描项目中的 .js 和 .ts 文件，计算迁移进度
 */
const fs = require("fs");
const path = require("path");

function scanDirectory(dir) {
  let jsCount = 0;
  let tsCount = 0;

  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !file.startsWith(".") && file !== "node_modules") {
        walk(fullPath);
      } else if (file.endsWith(".js") && !file.endsWith(".config.js")) {
        jsCount++;
      } else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
        tsCount++;
      }
    }
  }

  walk(dir);
  const total = jsCount + tsCount;
  return {
    jsCount,
    tsCount,
    total,
    percentage: total > 0 ? ((tsCount / total) * 100).toFixed(1) : "0",
  };
}

const result = scanDirectory("./src");
console.log(`迁移进度：${result.percentage}%（${result.tsCount}/${result.total} 文件已迁移）`);
console.log(`剩余 JS 文件：${result.jsCount}`);

// ✅ 2. 使用 @ts-expect-error 标记并跟踪
// 定期运行脚本统计 @ts-expect-error 数量
// 如果数量在增长 → 迁移方向错了（应该减少才对）

// ✅ 3. 在 CI 中设置迁移进度门禁
// .github/workflows/migration-check.yml
//
// name: Migration Progress
// on: pull_request
// jobs:
//   check:
//     runs-on: ubuntu-latest
//     steps:
//       - uses: actions/checkout@v4
//       - name: Count JS files
//         run: |
//           JS_COUNT=$(find src -name "*.js" -not -name "*.config.js" | wc -l)
//           echo "JS files remaining: $JS_COUNT"
//           # 如果 JS 文件数量超过阈值，发出警告
//           if [ $JS_COUNT -gt 50 ]; then
//             echo "⚠️ Too many JS files remaining"
//           fi

// ✅ 4. 迁移路线图示例
//
// 第 1 周：配置 tsconfig.json（allowJs, checkJs）
// 第 2 周：迁移工具函数（纯函数，无副作用）
// 第 3 周：迁移类型定义和常量
// 第 4 周：迁移 API 客户端
// 第 5-6 周：迁移业务组件（从叶子组件开始）
// 第 7-8 周：迁移核心模块
// 第 9 周：清理 @ts-expect-error
// 第 10 周：开启 strict 模式
```

**为什么好：** 清晰的迁移计划让进度可追踪，每个阶段有明确的目标。`@ts-expect-error` 数量作为"技术债务计数器"——它应该越来越少，而不是越来越多。CI 中的进度门禁防止迁移倒退。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：完整的迁移实战：JS → TS
// ==========================================

// ---- 原始 JS 文件 ----
// userService.js
// 一个典型的 Express 路由处理

const express = require("express");
const router = express.Router();

router.get("/users/:id", async (req, res) => {
  try {
    const user = await db.findUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ---- 第一步：添加 JSDoc 类型注释 ----
// userService.js — 添加 JSDoc

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} created_at
 */

/**
 * @typedef {Object} UserResponse
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} createdAt
 */

/** @type {import("express").Router} */
const router = require("express").Router();

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
router.get("/users/:id", async (req, res) => {
  try {
    /** @type {User | null} */
    const user = await db.findUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    /** @type {UserResponse} */
    const response = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at,
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: /** @type {Error} */ (err).message });
  }
});

module.exports = router;

// ---- 第二步：改为 .ts 文件 ----
// userService.ts

import { Router, Request, Response } from "express";

interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

// 假设 db 模块也有类型
interface Database {
  findUser(id: string): Promise<User | null>;
}

// 从某个地方获取 db 实例
declare const db: Database;

const router = Router();

router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await db.findUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const response: UserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at,
    };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;

// ==========================================
// 示例 2：使用 JSDoc 在 JS 文件中获得 TS 检查
// ==========================================

// 开启 checkJs: true 后，TS 会检查 JSDoc 注释

/**
 * 计算购物车总价
 * @param {Array<{price: number; quantity: number}>} items - 购物车商品列表
 * @param {number} taxRate - 税率（0-1）
 * @returns {number} 含税总价
 */
function calculateTotal(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal * (1 + taxRate);
}

// ❌ TS 会检查到错误：第二个参数传了字符串
// calculateTotal([{ price: 10, quantity: 2 }], "0.1");
// 编译报错：类型 'string' 的参数不能赋值给类型 'number' 的参数

// ✅ 正确调用
const total = calculateTotal(
  [
    { price: 10, quantity: 2 },
    { price: 5, quantity: 3 },
  ],
  0.1
);
console.log(total); // 38.5

// ==========================================
// 示例 3：渐进式开启 strict 模式
// ==========================================

// 迁移初期：strict: false
// 让项目先跑起来，不追求完美

// 阶段 1：先开启 noImplicitAny
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": true // 先确保所有参数都有类型
  }
}

// 阶段 2：开启 strictNullChecks
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": true,
    "strictNullChecks": true // 处理 null/undefined
  }
}

// 阶段 3：开启所有 strict 选项
{
  "compilerOptions": {
    "strict": true // 最终目标
  }
}

// 每个阶段之间留 1-2 周，专门修复该阶段新出现的类型错误
```

---

## 4. 配置/环境示例

### 迁移用的 tsconfig.json

```jsonc
// tsconfig.json — 迁移阶段配置

{
  "compilerOptions": {
    // === 核心迁移配置 ===
    "allowJs": true,           // 允许编译 JS 文件（最重要）
    "checkJs": false,          // 暂时不检查 JS（阶段 1 关闭，阶段 2 开启）

    // === 模块解析 ===
    "outDir": "./dist",
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,   // 兼容 CommonJS 模块
    "allowSyntheticDefaultImports": true, // 兼容默认导入

    // === 严格模式（逐步开启）===
    "strict": false,           // 迁移初期关闭
    "noImplicitAny": true,     // 可以先开
    "strictNullChecks": false, // 先不开

    // === 声明文件 ===
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // === 其他 ===
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": [
    "src/**/*.js",
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

### 迁移阶段对应的 tsconfig

```jsonc
// tsconfig.strict.json — 迁移最终目标
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "checkJs": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### 迁移进度跟踪脚本

```javascript
// scripts/migration-stats.js
// 运行：node scripts/migration-stats.js

const fs = require("fs");
const path = require("path");

const SRC_DIR = "./src";
const THRESHOLD_TS_EXPECT_ERROR = 50; // @ts-expect-error 阈值

function countFiles(dir) {
  let js = 0,
    ts = 0,
    dts = 0,
    tsExpectErrors = 0;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".js") && !entry.name.endsWith(".config.js")) {
          js++;
        } else if (entry.name.endsWith(".d.ts")) {
          dts++;
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          ts++;
          // 统计 @ts-expect-error
          const content = fs.readFileSync(full, "utf-8");
          const matches = content.match(/@ts-expect-error/g);
          if (matches) {
            tsExpectErrors += matches.length;
          }
        }
      }
    }
  }

  walk(SRC_DIR);

  const total = js + ts;
  return {
    js,
    ts,
    dts,
    total,
    tsExpectErrors,
    percentage: total > 0 ? ((ts / total) * 100).toFixed(1) : "0",
    status: tsExpectErrors > THRESHOLD_TS_EXPECT_ERROR ? "⚠️ 需要清理" : "✅ 健康",
  };
}

const stats = countFiles(SRC_DIR);

console.log("===== 迁移进度报告 =====");
console.log(`TS 文件: ${stats.ts}`);
console.log(`JS 文件: ${stats.js}`);
console.log(`声明文件: ${stats.dts}`);
console.log(`迁移进度: ${stats.percentage}%`);
console.log(`@ts-expect-error 数量: ${stats.tsExpectErrors} (${stats.status})`);
console.log(`阈值: ${THRESHOLD_TS_EXPECT_ERROR}`);
```

---

## 5. 必须掌握的技能

### 迁移阶段对照表

| 阶段 | 配置 | 目标 | 预计时间 |
|------|------|------|---------|
| 0：准备 | `allowJs: true`, `checkJs: false` | 项目能用 tsc 编译，不报错 | 1-2 天 |
| 1：JSDoc | `checkJs: true` | 在 JS 文件中用 JSDoc 添加类型 | 1-2 周 |
| 2：边缘迁移 | `noImplicitAny: true` | 工具函数、类型定义改为 .ts | 2-4 周 |
| 3：核心迁移 | `strictNullChecks: true` | 业务组件、核心模块改为 .ts | 4-8 周 |
| 4：严格模式 | `strict: true` | 全部 .ts，开启严格模式 | 2-4 周 |
| 5：清理 | 清理 `@ts-expect-error` | 零技术债务 | 1-2 周 |

### 迁移原则

1. **从边缘向核心**：先迁移纯函数（工具函数、类型定义），再迁移有副作用的代码（API 调用、组件），最后迁移核心业务逻辑。
2. **改一个文件就改完整**：如果一个文件决定迁移为 .ts，就把它所有的类型都写完整，不要留下 `any` 债务。
3. **不要同时迁移和重构**：迁移时只改文件后缀和加类型，不改业务逻辑。重构是另一个任务。
4. **@ts-expect-error 要定期清理**：每个 `@ts-expect-error` 都有一个 TODO 和一个负责人。
5. **JSDoc 是 JS 文件的朋友**：在迁移到 TS 之前，先用 JSDoc 让 JS 文件获得类型检查。

### 迁移中常用的工具

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `allowJs: true` | 混合编译 JS 和 TS | 迁移初期 |
| `checkJs: true` | 检查 JS 文件中的 JSDoc | JSDoc 阶段 |
| `@ts-expect-error` | 临时跳过类型错误 | 迁移中遇到难处理的情况 |
| `declare module` | 为无类型的第三方库添加声明 | 遇到无 @types 的库 |
| `.d.ts` 文件 | 为 JS 文件提供类型声明 | 不想把 JS 改成 TS 的遗留代码 |
| `ts-migrate` | Airbnb 开源的自动迁移工具 | 大型项目自动迁移 |

### 开发者应带走的知识点

1. **迁移不是重写** —— 渐进式替换，而不是停下来全部重写。
2. **`allowJs: true` 是迁移的第一步** —— 让 tsc 能同时编译 JS 和 TS。
3. **从边缘向核心推进** —— 先改工具函数，再改业务组件，最后改核心模块。
4. **JSDoc 是 JS 文件的桥梁** —— 在迁移到 TS 之前，先用 JSDoc 获得类型检查。
5. **`@ts-expect-error` 是临时标记，不是永久方案** —— 每个标记都应该有清理计划。
6. **严格模式要逐步开启** —— 从 `noImplicitAny` 开始，最后开启 `strict`。
7. **迁移进度要可追踪** —— 定期统计 JS/TS 文件比例和 `@ts-expect-error` 数量。

### 最后的建议

> **迁移是一场马拉松，不是短跑。重要的是持续前进，而不是一步到位。每把一个 .js 文件改成 .ts，你就在减少一份技术债务。**
