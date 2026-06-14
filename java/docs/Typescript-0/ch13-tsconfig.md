# 第13章 tsconfig.json 完全配置指南

## 1. 核心概念

### tsconfig.json 是什么？

tsconfig.json 是 TypeScript 项目的"宪法"。它告诉 TypeScript 编译器三件事：

1. **源文件在哪里**（include / exclude / files）
2. **怎么编译这些文件**（target / module / strict 等）
3. **输出什么格式**（outDir / declaration / sourceMap 等）

类比：如果把 TS 源码比作设计图纸，tsconfig.json 就是"打印设置"——它决定了图纸用 A4 还是 A3 纸、彩色还是黑白、要不要留边距。

### 编译目标（target）与模块系统（module）的演进

**target** 控制输出 JS 的语法级别：

| target | 输出语法 | 典型场景 |
|--------|---------|---------|
| ES2015 | 支持 class、箭头函数、let/const | 需要兼容旧浏览器 |
| ES2020 | 支持可选链、空值合并 | Node.js 14+ |
| ES2022 | 支持顶层 await、类静态块 | Node.js 18+ |
| ESNext | 使用最新语法（不推荐生产用） | 实验性项目 |

**module** 控制输出 JS 的模块格式：

| module | 输出 | 说明 |
|--------|------|------|
| CommonJS | `require()` / `module.exports` | Node.js 传统格式 |
| ES2020 / ESNext | `import` / `export` | 现代格式 |
| Node16 / NodeNext | 根据 package.json `type` 字段自动选择 | 推荐用于 Node.js 项目 |
| Bundler | 假设打包器处理模块 | 用于 Vite / esbuild 等 |

**重要演进：** 旧项目常用 `module: "commonjs"` + `target: "ES5"`，但在 2025 年的新项目中，推荐 `target: "ES2022"` + `module: "NodeNext"` 或 `module: "Bundler"`。

### moduleResolution 的三种模式

moduleResolution 决定了 TS 如何解析 `import` 语句中的路径：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `classic` | 旧版，仅向后兼容 | 几乎不用 |
| `node` | 模拟 Node.js 的 CommonJS 解析 | 旧项目 |
| `node16` / `nodenext` | 现代 Node.js ESM + CJS 双模式解析 | Node.js 新项目 |
| `bundler` | 假设打包器会处理模块解析，更宽松 | 使用 Vite/esbuild 的项目 |

**关键区别：** `node16` 要求文件有 `.js` 扩展名（即使是 TS 源码），而 `bundler` 允许省略扩展名。如果你的项目用 Vite，用 `bundler`；如果直接用 Node.js 跑 TS，用 `node16`。

---

## 2. 典型问题与处理

### 问题 1：moduleResolution 配置错误导致模块找不到

```typescript
// Bad — 使用 "node" 解析策略，import 时省略扩展名
// tsconfig.json 中设置 moduleResolution: "node"
// 实际运行时 Node.js ESM 模式下会报错

import { foo } from "./utils";  // Error: Cannot find module './utils'
```

```typescript
// Good — 根据项目场景选择合适的 moduleResolution

// 场景 A：Node.js ESM 项目（package.json 中 "type": "module"）
// tsconfig.json: moduleResolution: "node16"
import { foo } from "./utils.js";  // OK — 需要 .js 扩展名

// 场景 B：Vite 项目（打包器处理模块）
// tsconfig.json: moduleResolution: "bundler"
import { foo } from "./utils";  // OK — 打包器会补全扩展名
```

**为什么不好：** `moduleResolution: "node"` 是旧的 CommonJS 解析策略。在现代 ESM 模式下，Node.js 要求 import 路径包含完整文件名（包括扩展名），而 `"node"` 策略不强制这个要求，导致编译通过但运行时失败。

**为什么好：** `node16` 遵循 Node.js 的 ESM 解析规则，强制要求 `.js` 扩展名，确保编译时就能发现路径错误。`bundler` 则匹配打包器的行为，允许省略扩展名。

### 问题 2：strict 系列选项逐个说明

很多开发者对 `strict: true` 望而生畏，我们来拆解它的每个子选项：

| 选项 | 作用 | 建议 |
|------|------|------|
| `strictNullChecks` | 禁止 `null` / `undefined` 赋值给非空类型 | **必须开启** — 避免了最常见的崩溃原因 |
| `strictFunctionTypes` | 函数类型参数逆变检查 | 建议开启 |
| `strictBindCallApply` | 检查 `bind` / `call` / `apply` 的类型 | 建议开启 |
| `strictPropertyInitialization` | 类属性必须初始化 | 建议开启 |
| `noImplicitAny` | 禁止隐式 `any` 类型 | **必须开启** |
| `noImplicitThis` | 禁止 `this` 隐式推断为 `any` | 建议开启 |
| `alwaysStrict` | 自动添加 `"use strict"` | 建议开启 |
| `useUnknownInCatchVariables` | catch 变量类型为 `unknown` | 建议开启（TS 4.4+） |

```typescript
// Bad — 关闭 strictNullChecks
// tsconfig.json 中 noStrictNullChecks: true

function getLength(s: string | null): number {
  return s.length;  // 编译通过，但运行时 s 为 null 时崩溃！
}

// Good — 开启 strictNullChecks
// tsconfig.json 中 strictNullChecks: true

function getLength(s: string | null): number {
  // TypeScript 会报错：s 可能是 null
  return s.length;  // ❌ Object is possibly 'null'

  // 正确做法：
  if (s === null) return 0;
  return s.length;  // ✅ 类型收窄后安全
}
```

**为什么必须开启 strictNullChecks：** 一项研究表明，JavaScript 运行时错误中约 70% 与 null/undefined 相关。开启 strictNullChecks 后，TypeScript 在编译阶段就能捕获这些错误——这相当于给代码上了"安全带"。

### 问题 3：路径映射配置不当

```json
// Bad — 路径别名和实际解析不一致
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
// 运行时：Vite 需要额外配置 resolve.alias
// Jest 需要 moduleNameMapper
// 需要重复配置 3 次！
```

```json
// Good — 完整且一致的路径映射配置
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

```typescript
// 使用别名
import { Button } from "@components/Button";  // 而不是 ../../../components/Button
import { formatDate } from "@utils/date";
```

**为什么不好：** 路径别名虽然让 import 更简洁，但需要构建工具和测试框架配合配置（Vite 的 `resolve.alias`、Jest 的 `moduleNameMapper`、Webpack 的 `resolve.alias`），每缺少一处就会导致运行时或测试失败。

---

## 3. 示例代码

### 增量编译配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // 增量编译
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "include": ["src/**/*"]
}
```

增量编译开启后，tsc 会将编译元数据写入 `.tsbuildinfo` 文件。下次编译时只重新编译变更的文件——大型项目编译时间从分钟级降到秒级。

### 项目引用（Project References）示例

项目引用适用于将大型项目拆分为多个子项目（monorepo 风格）：

```
project-root/
├── tsconfig.json          # 根配置（引用子项目）
├── packages/
│   ├── core/
│   │   ├── tsconfig.json  # 核心库
│   │   └── src/
│   ├── utils/
│   │   ├── tsconfig.json  # 工具库
│   │   └── src/
│   └── app/
│       ├── tsconfig.json  # 应用入口
│       └── src/
```

```json
// 根 tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" },
    { "path": "./packages/app" }
  ]
}
```

```json
// packages/core/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,           // 项目引用必须开启
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

```json
// packages/app/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" },
    { "path": "../utils" }
  ]
}
```

项目引用的好处：
- **按需构建：** 只构建变更的子项目
- **类型隔离：** 子项目之间通过声明文件通信，不暴露内部实现
- **并行构建：** 使用 `tsc --build` 可并行编译所有子项目

---

## 4. 配置/环境示例

### 企业级 tsconfig.json 完整示例

```json
{
  "compilerOptions": {
    // --- 编译目标 ---
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],

    // --- 严格模式（全家桶） ---
    "strict": true,
    "noUncheckedIndexedAccess": true,    // 索引访问类型安全
    "noPropertyAccessFromIndexSignature": true,

    // --- 输出配置 ---
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // --- 模块解析 ---
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@config/*": ["src/config/*"],
      "@shared/*": ["src/shared/*"]
    },
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,         // 强制显式 type import

    // --- 代码质量 ---
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,

    // --- 增量编译 ---
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

### 针对不同场景的推荐配置

```json
// 场景 1：Node.js 库项目 — tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

```json
// 场景 2：前端 React + Vite 项目 — tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,              // Vite 负责编译，tsc 只做类型检查
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// 场景 3：Node.js ESM 库（package.json 中有 "type": "module"）
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

---

## 5. 必须掌握的技能

| 技能 | 说明 | 优先级 |
|------|------|--------|
| 理解 target 与 module 的关系 | target 控制语法特性，module 控制模块格式 | 必需 |
| 选择正确的 moduleResolution | 根据项目场景选择 node16 / bundler | 必需 |
| 严格模式全家桶 | 理解每个 strict 子选项的作用 | 必需 |
| 路径映射配置 | 配置 baseUrl + paths，并同步构建工具 | 重要 |
| 增量编译 | 开启 incremental 加速大型项目编译 | 重要 |
| 项目引用 | 多包 monorepo 场景的项目拆分 | 了解 |
| isolatedModules | 理解为什么 Vite/esbuild 需要它 | 重要 |
| 输出配置 | declaration / sourceMap / outDir 的协同使用 | 必需 |

### 自我检查清单

- [ ] 我能为团队新建一个项目编写完整的 tsconfig.json
- [ ] 我理解 `strict: true` 具体启用了哪些检查
- [ ] 我知道 `moduleResolution: "node16"` 和 `"bundler"` 的区别
- [ ] 我能在项目中正确配置路径别名并同步到构建工具
- [ ] 我知道为什么前端项目需要 `noEmit: true`
- [ ] 我能在大型项目中利用项目引用提升编译效率

---

> **一句话总结：** tsconfig.json 不是复制粘贴就完事的模板——每个配置项都对应一个编译决策。花半小时理解每行配置，能避免后续数小时的调试时间。
