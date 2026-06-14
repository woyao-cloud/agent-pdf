# 第 1 章：环境搭建与第一次编译

## 1. 核心概念

### TypeScript 是怎么"跑"起来的？

浏览器和 Node.js 都不认识 TypeScript。它们只认识 JavaScript。所以 TypeScript 代码需要**先编译（转译）成 JavaScript**，然后才能执行。

这个编译过程的核心工具是 `tsc` —— TypeScript Compiler。

```
.ts 文件 ──→ tsc 编译 ──→ .js 文件 ──→ node / 浏览器执行
```

但每次都手动跑 `tsc` 太麻烦，于是有了各种"运行时"工具，让你"一步到位"地执行 `.ts` 文件。

### 编译 vs 转译

严格来说，TypeScript 做的事情是**转译（Transpile）**，不是传统意义上的编译（Compile）：

- **编译（Compile）**：高级语言 → 低级语言（如 C → 汇编）
- **转译（Transpile）**：同层级语言之间的转换（如 TS → JS）

TypeScript 的转译做了两件事：

1. **类型擦除（Type Erasure）**：去掉所有类型注解
2. **降级（Downleveling）**：把 ES2024 语法转成 ES2020（或你指定的目标）

```typescript
// 你的 TS 代码
const greet = (name: string): string => `Hello, ${name}`;

// tsc 编译后（target: ES2020）
const greet = (name) => `Hello, ${name}`;
//         ↑ 类型注解被擦除
//         箭头函数保留（ES2020 已原生支持）
```

如果 target 设为 ES5：

```javascript
// tsc 编译后（target: ES5）
var greet = function (name) { return "Hello, " + name; };
// ↑ var 替代 const
// ↑ 普通函数替代箭头函数
```

---

## 2. 工具链选型

### tsc 编译器 vs 运行时工具

| 工具 | 类型 | 执行方式 | 类型检查 | 适合场景 | 优劣分析 |
|------|------|----------|----------|----------|----------|
| **tsc** | 编译器 | `tsc` → `node dist/index.js` | ✅ 完整检查 | 正式构建、CI/CD | 优势：最完整类型检查；劣势：两步操作，开发迭代慢 |
| **ts-node** | 运行时 | `ts-node src/index.ts` | ✅ 默认检查 | 脚本、小项目 | 优势：一步执行；劣势：启动慢（需要全量编译），已被 tsx 取代趋势 |
| **tsx** | 运行时 | `tsx src/index.ts` | ✅ 检查 | 开发、脚本、测试 | 优势：基于 esbuild，极快启动；劣势：类型检查不如 tsc 严格（esbuild 不做类型检查） |
| **Bun** | 运行时 | `bun src/index.ts` | ❌ 不检查 | 快速原型、新项目 | 优势：最快的 TS 执行，自带打包器；劣势：不兼容所有 Node.js API，类型检查需额外配置 |

### 推荐组合

| 场景 | 推荐 |
|------|------|
| 正式项目构建 | `tsc`（构建）+ `tsx`（开发） |
| 快速脚本 | `tsx` |
| 新项目（愿意折腾） | `Bun` |
| 学习 TypeScript | `tsc`（体验完整流程） |

### TypeScript Playground

如果你不想装任何东西，直接在浏览器里体验 TypeScript：

**https://www.typescriptlang.org/play**

功能亮点：

- 左侧写 TS，右侧实时显示编译后的 JS
- 可切换 TS 版本（从 2.x 到最新版）
- 可切换 target（ES5 / ES2020 / ESNext）
- 显示编译后的 AST（抽象语法树）
- 分享代码片段（生成短链接）

> 学习阶段：先在 Playground 里试验各种类型，再搭本地环境。

---

## 3. 典型问题与处理

### 问题一：tsc 编译后代码与预期不符

**现象**：写了 ES6+ 的 `import/export`，编译后变成 `require/module.exports`。

**原因**：`tsconfig.json` 中的 `module` 配置默认为 `commonjs`（如果未显式设置）。

```typescript
// 你的代码
import { readFile } from 'fs';
export function loadConfig() { /* ... */ }
```

**编译后（module: "commonjs"）：**

```javascript
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = void 0;
const fs_1 = require("fs");
// ...
```

**编译后（module: "esnext"）：**

```javascript
import { readFile } from 'fs';
export function loadConfig() { /* ... */ }
// ↑ 保留原始模块语法
```

**解决方案**：根据目标环境配置 `module` 和 `moduleResolution`：

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",          // 输出 ES module 语法
    "moduleResolution": "bundler", // 使用 bundler 风格的模块解析
    "esModuleInterop": true,     // 兼容 CommonJS 模块导入
  }
}
```

### 问题二：esModuleInterop 导致的导入异常

**现象**：

```typescript
import express from 'express';
//          ^^^^^^^ 报错：模块 '"express"' 没有默认导出
```

**原因**：CommonJS 模块（如 express）使用 `module.exports` 整体导出，而不是 `export default`。TypeScript 默认不允许从 CJS 模块使用默认导入。

**解决方案**：开启 `esModuleInterop`：

```jsonc
{
  "compilerOptions": {
    "esModuleInterop": true
  }
}
```

开启后，TS 会生成兼容代码：

```javascript
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const express_1 = __importDefault(require("express"));
// 现在 express_1.default 就是原本的 module.exports
```

### 问题三：类型擦除后"原形毕露"

这是一个**新手容易误解的点**：

```typescript
// Bad ❌ — 以为 TS 类型能保护运行时
function safeDivide(a: number, b: number): number {
  return a / b;
}

// 从 API 获取数据（运行时）
const userInput = JSON.parse('{"a": "hello", "b": "world"}');
// tsc 编译通过，因为 JSON.parse 返回 any
safeDivide(userInput.a, userInput.b); // 运行时：NaN
```

```typescript
// Good ✅ — 在"边界"处验证类型
function safeDivide(a: number, b: number): number {
  return a / b;
}

function parseNumbers(input: string): { a: number; b: number } {
  const raw = JSON.parse(input);
  const a = Number(raw.a);
  const b = Number(raw.b);
  if (isNaN(a) || isNaN(b)) {
    throw new Error('Invalid input: expected numeric values');
  }
  return { a, b };
}

const { a, b } = parseNumbers('{"a": "hello", "b": "world"}');
safeDivide(a, b); // 运行时安全
```

> **关键认知**：TypeScript 类型检查只覆盖"你写的代码"——从外部进入的数据（API 响应、用户输入、localStorage 读取）需要额外的运行时验证。

---

## 4. 配置/环境示例

### 最小化 tsconfig.json

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",              // 编译目标
    "module": "ESNext",              // 模块格式
    "moduleResolution": "bundler",   // 模块解析策略
    "esModuleInterop": true,         // CJS 兼容
    "strict": true,                  // 启用所有严格检查
    "outDir": "./dist",              // 输出目录
    "rootDir": "./src",              // 源码目录
    "skipLibCheck": true             // 跳过 .d.ts 检查（加速编译）
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 推荐 tsconfig（Node.js 项目）

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,             // 生成 .d.ts 类型声明文件
    "sourceMap": true,               // 生成 source map（方便调试）
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### Docker Compose 开发环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  ts-dev:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    command: >
      sh -c "
        npm install &&
        npx tsc --watch
      "
    environment:
      - NODE_ENV=development

  ts-runtime:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    depends_on:
      - ts-dev
    command: >
      sh -c "
        npm install &&
        npx tsx watch src/index.ts
      "
    environment:
      - NODE_ENV=development
```

使用说明：

```bash
# 启动开发环境
docker compose up -d

# 查看编译日志
docker compose logs -f ts-dev

# 执行一次性脚本
docker compose run --rm ts-runtime npx tsx src/script.ts
```

### 初始化一个新 TypeScript 项目

```bash
# 1. 创建项目目录
mkdir my-ts-project && cd my-ts-project

# 2. 初始化 package.json
npm init -y

# 3. 安装 TypeScript
npm install -D typescript

# 4. 生成 tsconfig.json
npx tsc --init

# 5. 创建源码目录
mkdir src

# 6. 创建第一个 TS 文件
cat > src/index.ts << 'EOF'
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet('TypeScript'));
EOF

# 7. 编译并运行
npx tsc
node dist/index.js

# 或者一步到位（使用 tsx）
npx tsx src/index.ts
```

---

## 5. 必须掌握的技能

完成本章后，你应该：

1. **理解编译 vs 转译**：知道 TS 代码如何变成 JS，类型擦除意味着什么
2. **能配 tsconfig.json**：掌握 `target`、`module`、`strict`、`outDir`、`rootDir` 等核心选项
3. **选择合适的工具**：能区分 tsc / ts-node / tsx / Bun 的适用场景
4. **会使用 TypeScript Playground**：能快速在线验证类型行为
5. **理解类型擦除的边界**：知道编译时检查 ≠ 运行时安全，需要额外运行时验证
6. **能搭建完整的开发环境**：从初始化项目到 Docker 容器化开发

---

> **上一章**：[导读](./ch00-intro.md)
> **下一章**：[第 2 章：基础类型与类型推导](./ch02-basics.md)
