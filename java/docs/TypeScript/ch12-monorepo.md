# Monorepo 配置

## 1. 使用场景

Monorepo（单仓库多项目）在 TypeScript 项目中越来越普遍，主要使用场景包括：

- **共享类型定义**：多个前端应用共享同一套 API 类型
- **公共工具库**：UI 组件库、工具函数库被多个项目引用
- **全栈项目**：前端 + 后端 + 共享类型放在同一个仓库
- **微前端架构**：多个子应用共享基础库和配置
- **库开发**：同时开发多个 npm 包，跨包调试

TypeScript 的 Monorepo 方案需要解决的核心问题：**跨包类型检查**、**增量编译**、**依赖顺序构建**。

## 2. 实现原理

### Project References（项目引用）

Project References 是 TypeScript 3.0 引入的原生 Monorepo 支持，通过三个配置字段实现：

```typescript
// packages/core/tsconfig.json
{
  "compilerOptions": {
    "composite": true,           // 必须：启用项目引用
    "declaration": true,         // 必须：生成 .d.ts 声明
    "declarationMap": true,      // 推荐：支持跳转到源码
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}

// packages/app/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../core" },       // 引用 core 项目
    { "path": "../shared" }      // 引用 shared 项目
  ],
  "include": ["src"]
}

// 根目录 tsconfig.json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/shared" },
    { "path": "packages/app" }
  ]
}
```

**composite** 的作用：
- 启用增量编译信息输出（`.tsbuildinfo`）
- 要求 `declaration: true`
- 允许其他项目通过 `references` 引用

**构建流程**：使用 `tsc --build` 替代 `tsc`，它会自动按依赖顺序构建：

```bash
# 构建所有项目（按依赖顺序）
tsc --build

# 清理所有项目的构建产物
tsc --build --clean

# 强制重新构建
tsc --build --force
```

### 多包编译策略

Monorepo 的编译策略有三种主流方案：

**方案一：TypeScript Project References（原生方案）**

优点：原生支持、类型安全、增量编译
缺点：配置繁琐、构建速度受限于 tsc

```bash
# 构建命令
tsc --build tsconfig.json
```

**方案二：Turborepo + tsc**

优点：缓存构建结果、并行执行、任务编排
缺点：需要额外工具

```typescript
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // 先构建依赖
      "outputs": ["dist/**", ".tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

**方案三：pnpm workspace + 构建工具**

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

### 增量编译原理

`incremental: true` 配合 `composite` 实现增量编译：

```typescript
// 编译器会生成 .tsbuildinfo 文件，记录：
// 1. 每个文件的修改时间戳
// 2. 文件之间的依赖关系图
// 3. 输出文件列表

// 第二次构建时，只重新编译：
// - 修改过的文件
// - 依赖了修改文件的其他文件
// - 依赖关系变化的文件
```

## 3. 潜在风险

### 循环引用

```typescript
// packages/a/tsconfig.json 引用了 packages/b
// packages/b/tsconfig.json 引用了 packages/a
// 构建时会报错：循环引用
```

### 类型不一致

```typescript
// 问题：core 包构建后，app 包引用了旧的 .d.ts
// 解决方案：确保构建顺序正确，或使用 workspace 协议
// package.json
{
  "dependencies": {
    "@my/core": "workspace:*"  // pnpm workspace 协议
  }
}
```

### 构建顺序错误

```typescript
// 错误：app 在 core 之前构建
// app 引用了 core 的类型，但 core 的 .d.ts 尚未生成
// 症状：找不到模块 "core" 或其类型声明
```

## 4. 优化策略

### 推荐的项目结构

```
monorepo/
├── packages/
│   ├── core/          # 核心类型和工具
│   │   ├── src/
│   │   └── tsconfig.json
│   ├── ui/            # UI 组件库
│   │   ├── src/
│   │   └── tsconfig.json
│   └── utils/         # 工具函数
│       ├── src/
│       └── tsconfig.json
├── apps/
│   ├── web/           # Web 应用
│   │   ├── src/
│   │   └── tsconfig.json
│   └── api/           # API 服务
│       ├── src/
│       └── tsconfig.json
├── tsconfig.base.json # 基础配置
├── tsconfig.json      # 根配置（references）
└── package.json
```

### 构建脚本优化

```typescript
// package.json
{
  "scripts": {
    "build": "tsc --build",
    "build:clean": "tsc --build --clean",
    "build:force": "tsc --build --force",
    "build:watch": "tsc --build --watch",
    "dev": "tsc --build --watch"
  }
}
```

### 与打包工具集成

```typescript
// vite.config.ts（在 Monorepo 中使用 Vite）
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
});
```

## 5. 典型问题处理

### 问题：构建时找不到依赖包的类型

```typescript
// 确保依赖包已构建（生成了 .d.ts）
// 在 package.json 中正确配置 main/types/exports
{
  "name": "@my/core",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

### 问题：VSCode 中跳转定义失败

```typescript
// 确保所有包都开启了 declarationMap
// 重启 TS 服务器
// 检查 tsconfig 的 references 配置是否正确
```

### 问题：构建速度慢

```typescript
// 1. 使用 --build 模式（增量编译）
// 2. 开启 skipLibCheck
// 3. 使用 Turborepo 缓存
// 4. 分离类型检查和构建
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "build": "tsc --build"
  }
}
```

## 6. 开发者技能

Monorepo 配置的核心技能：

1. **理解 composite 和 references**：知道何时需要项目引用
2. **构建编排**：掌握 `tsc --build` 的依赖解析机制
3. **工具选型**：根据项目规模选择 pnpm/Turborepo/Nx
4. **调试跨包问题**：使用 `--traceResolution` 调试模块解析
5. **CI/CD 优化**：利用缓存和增量编译加速 CI

## 7. 示例代码

### 完整的 Monorepo 配置

```typescript
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}

// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}

// packages/ui/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "references": [
    { "path": "../core" }
  ],
  "include": ["src"]
}

// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/ui" }
  ],
  "include": ["src"]
}

// tsconfig.json（根）
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/ui" },
    { "path": "apps/web" }
  ]
}
```

### pnpm workspace 配置

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

```typescript
// package.json（根）
{
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

```typescript
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".tsbuildinfo"],
      "inputs": ["src/**", "tsconfig.json"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

## 8. 小结

TypeScript Monorepo 配置的核心要点：

- **Project References** 是 TypeScript 原生的 Monorepo 方案，通过 `composite` + `references` + `tsc --build` 实现
- **增量编译** 通过 `.tsbuildinfo` 文件记录依赖图，只重新编译变更部分
- **工具选型**：小项目用原生 references，大项目用 Turborepo/Nx 增强缓存和编排
- **pnpm workspace** 提供包管理层面的 Monorepo 支持
- **关键配置**：`composite`、`declaration`、`declarationMap` 缺一不可
- **构建顺序**：`tsc --build` 自动处理依赖顺序，避免手动编排
