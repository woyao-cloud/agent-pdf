# 第14章 TypeScript 与 Node.js

## 14.1 概述

TypeScript 是 JavaScript 的超集，为 Node.js 生态带来了静态类型系统。据 2024 年 State of JS 调查，超过 80% 的 Node.js 开发者在新项目中选择 TypeScript。本章从原理到实践，系统性地剖析 TypeScript 在 Node.js 中的使用场景、实现原理、潜在风险与优化策略。

## 14.2 使用场景

### 14.2.1 大型 Node.js 项目的类型安全

当项目规模超过 5 万行代码时，未经类型检查的 JavaScript 项目会出现显著的技术债务累积。TypeScript 的核心价值在于：

- **重构安全感**：类型系统捕获调用方未同步更新的错误
- **接口契约**：模块之间的类型定义成为隐式文档
- **IDE 支持**：VSCode 基于 TypeScript Language Server 提供精确的自动补全和内联提示

```typescript
// 类型安全的 Express 路由处理器
import { Request, Response, NextFunction } from 'express';

interface UserPayload {
  id: string;
  role: 'admin' | 'user';
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // Request.user 现在有明确的类型定义
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

### 14.2.2 API 参数校验与类型推导

TypeScript 仅在编译时生效，运行时类型信息会被擦除。因此需要结合运行时校验库来实现双保险。Zod 是最流行的方案之一——它既提供运行时校验，又能推导出编译时类型。

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

// 从 Schema 推导出 TypeScript 类型
type User = z.infer<typeof UserSchema>;

// 校验 + 类型安全的 Parse
const result = UserSchema.safeParse({ name: 'Alice', email: 'alice@example.com', role: 'admin' });
if (result.success) {
  // result.data 类型自动推导为 User
  console.log(result.data.name.toUpperCase());
} else {
  // result.error 包含结构化错误信息
  console.error(result.error.flatten());
}
```

### 14.2.3 依赖注入容器

NestJS 等框架利用 TypeScript 装饰器和类型元数据实现依赖注入容器：

```typescript
import { Injectable, Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getUsers(): Promise<User[]> {
    return this.userService.findAll();
  }
}
```

依赖注入容器的核心在于：装饰器会在编译时发射类型元数据，容器读取这些元数据自动解析构造函数参数的类型，从而完成依赖注入。

## 14.3 实现原理

### 14.3.1 TypeScript 编译过程

TypeScript 编译器（tsc）的工作流程分为三个阶段：

1. **解析（Parsing）**：将源代码解析为抽象语法树（AST）
2. **类型检查（Type Checking）**：遍历 AST 进行类型推导和错误检查
3. **代码生成（Emit）**：根据目标 ECMAScript 版本生成 JavaScript 代码，同时可选择生成声明文件（`.d.ts`）和 Source Map

```bash
# 编译过程的三个步骤示意
# 1. Scanner → Token Stream
# 2. Parser → AST
# 3. Binder → Symbols + TypeChecker → 类型检查
# 4. Emitter → JS + .d.ts + .js.map
```

值得注意的是，类型检查阶段和代码生成阶段是独立的——即使代码有类型错误，tsc 默认仍会生成 JavaScript 文件（除非设置了 `noEmitOnError: true`）。

### 14.3.2 moduleResolution 策略

TypeScript 的模块解析策略直接影响导入路径的查找方式。Node.js 生态中主要有三种策略：

| 策略 | 适用场景 | 特点 |
|:--|:--|:--|
| Node16/NodeNext | ESM 项目 | 遵循 Node.js 的 ESM 解析规则，需要 `.js` 扩展名 |
| bundler | 使用打包工具的项目 | 最宽松的策略，不需要写扩展名 |
| classic | 旧项目 | 已弃用，不推荐使用 |

```typescript
// Node16/NodeNext 策略下必须写扩展名
import { User } from '../models/user.js';
import { helper } from './utils/index.js';

// bundler 策略下可以省略扩展名
import { User } from '../models/user';
import { helper } from './utils';
```

选择策略时的一个常见误区：使用 `module: "ESNext"` 但 `moduleResolution: "Node"` 会导致 Node.js 运行时找不到模块。正确的组合如下：

```jsonc
// tsconfig.json — ESM 项目（Node.js >= 16）
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}

// tsconfig.json — 使用打包工具（esbuild / webpack）
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### 14.3.3 声明文件（.d.ts）

声明文件是 TypeScript 类型系统的核心机制之一。它们是纯类型信息文件，不包含实现代码：

```typescript
// example.d.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export function createUser(data: Omit<User, 'id'>): Promise<User>;
```

声明文件的查找优先级：内建声明 > `@types/*` 包 > 项目中 `declare module` 声明。当第三方库没有提供类型时，可以通过创建本地声明文件来解决：

```typescript
// src/types/untyped-lib.d.ts
declare module 'untyped-lib' {
  export function doSomething(input: string): Promise<number>;
  export const VERSION: string;
}
```

## 14.4 潜在风险

### 14.4.1 类型声明与实际运行时不一致

第三方库的类型声明过时或错误是最常见的问题。例如，某个库的 API 已更新，但 `@types/*` 包未同步更新：

```typescript
// 类型声明中函数接受 string
declare function query(options: string): Promise<Result>;

// 但运行时实际需要对象
// 实际签名：query(options: { sql: string; params?: unknown[] }): Promise<Result>

// 类型通过编译，但运行时报错
await query('SELECT * FROM users'); // 运行时错误！
```

**解决方案**：
1. 使用 `patch-package` 或 `pnpm patch` 直接修补 `@types/*` 包
2. 使用 `zod` 在运行时做双重校验
3. 降级使用 `any` 并用注释说明原因（仅作为临时方案）

### 14.4.2 装饰器元数据发射

NestJS 等框架依赖装饰器元数据发射（`emitDecoratorMetadata`）来实现依赖注入。但这个功能存在诸多陷阱：

```jsonc
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

常见问题：
- 元数据发射只支持有限的类型，不支持泛型参数
- `emitDecoratorMetadata` 是一个实验性功能，可能在未来的 TypeScript 版本中发生变化
- 装饰器的标准提案与当前实现不兼容（Stage 3 vs experimental）

```typescript
// emitDecoratorMetadata 无法正确处理泛型
@Injectable()
class GenericService<T> {
  // 发射的类型信息中 T 会被擦除为 Object
  constructor(private readonly repo: Repository<T>) {}
  // 运行时获取到的类型是 Object 而非具体的 Repository<T>
}
```

### 14.4.3 tsconfig.json 配置错误导致的编译问题

复杂的 tsconfig 配置项组合容易导致难以排查的问题：

```jsonc
// 错误示例：配置冲突
{
  "compilerOptions": {
    "module": "ESNext",      // 输出 ESM 模块
    "moduleResolution": "Node", // 但使用 Node 的 CJS 解析策略
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

这种配置组合下，tsc 生成的导入语句可能与解析结果不符。推荐使用 `tsc --showConfig` 查看解析后的最终配置，使用 `tsc --traceResolution` 调试模块解析路径。

## 14.5 优化策略

### 14.5.1 严格模式

`strict: true` 是整个 TypeScript 类型安全的基础。它等同于开启以下所有严格检查：

```jsonc
{
  "compilerOptions": {
    "strict": true,
    // 等于同时开启以下选项：
    // "strictNullChecks": true,
    // "strictFunctionTypes": true,
    // "strictBindCallApply": true,
    // "strictPropertyInitialization": true,
    // "noImplicitAny": true,
    // "noImplicitThis": true,
    // "alwaysStrict": true
  }
}
```

建议从项目第一天就开启 `strict: true`。对于现有项目迁移，可以逐项开启并修复错误，而不是一次性全部启用。

### 14.5.2 Zod 运行时校验 + 编译时类型推导双保险

这种模式被称为 **"Parse, don't validate"**——不信任任何外部输入，强制在边界处进行类型转换：

```typescript
import { z } from 'zod';

// 1. 定义 Schema（运行时）
const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().max(65535),
  dbUrl: z.string().url(),
  apiKeys: z.record(z.string()),
  features: z.array(z.string()).optional().default([]),
});

// 2. 推导类型（编译时）
type Config = z.infer<typeof ConfigSchema>;

// 3. 在入口处执行一次校验
function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse({
    port: env.PORT ?? '3000',
    dbUrl: env.DATABASE_URL,
    apiKeys: env.API_KEYS ? JSON.parse(env.API_KEYS) : {},
  });
  return parsed; // 从此往后 Config 类型完全可信
}

// 4. 使用处不再需要额外校验
const app = createApp(loadConfig(process.env));
```

### 14.5.3 satisfies 操作符替代 as

TypeScript 4.9 引入的 `satisfies` 操作符可以替代 `as` 进行类型断言，同时保留更精确的推导：

```typescript
// ❌ as 会丢失精确类型
const palette = {
  red: [255, 0, 0] as const,
  blue: '#0000FF',
} as Record<string, string | readonly number[]>;

// palette.red 的类型是 readonly number[]，丢失了元组长度

// ✅ satisfies 保留精确类型
const palette = {
  red: [255, 0, 0],
  blue: '#0000FF',
} satisfies Record<string, string | readonly number[]>;

// palette.red 的类型是 readonly [255, 0, 0]（精确元组）
// palette.blue 的类型是 string
```

`satisfies` 的核心优势在于：它验证类型是否正确，但推断出最具体的类型，而不是用宽泛的类型覆盖具体实现。

## 14.6 典型问题处理

### 14.6.1 类型声明找不到

当安装的第三方库不包含内置声明文件时：

```bash
# 查找 @types 包
npm install --save-dev @types/lodash
npm install --save-dev @types/express

# 查看某个包是否有内置声明
# 检查 node_modules/pkg/package.json 中的 "types" 字段
```

如果 `@types` 包不存在，需要手动创建声明文件：

```typescript
// src/types/declarations.d.ts
declare module 'some-library-without-types' {
  export function main(config: Record<string, unknown>): Promise<void>;
  // 根据实际使用添加更多类型
}
```

对于 `tsconfig.json` 中的 `typeRoots` 配置，默认是 `["./node_modules/@types"]`。如果手动更改了 `typeRoots`，需要确保 `@types` 目录在列表中：

```jsonc
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./src/types"]
  }
}
```

### 14.6.2 路径别名配置

使用路径别名可以避免深层相对路径：

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@config/*": ["src/config/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

```typescript
// ✅ 使用别名
import { logger } from '@utils/logger';
import { config } from '@config/index';

// ❌ 避免深层相对路径
import { logger } from '../../../../utils/logger';
```

**重要**：路径别名只在编译时有效。运行时（Node.js）不认识这些别名，需要额外处理：

- **使用 tsc 编译**：配合 `tsconfig-paths` 包在运行时注册别名
- **使用打包工具**：在 esbuild/webpack 中配置对应的 alias/resolve 设置
- **使用 tsx**：直接运行 TypeScript 文件时内置支持 paths

### 14.6.3 ESM 与 CJS 互操作

当项目中同时存在 CommonJS 和 ES Module 时，类型声明可能不一致：

```typescript
// ESM 项目导入 CJS 模块
import pkg from 'cjs-package';
// 如果 cjs-package 是 default export，TypeScript 默认导入方式可能不匹配

// 在 tsconfig.json 中设置 esModuleInterop: true 解决
// 这允许在 CJS 导入中使用默认导入语法
{
  "compilerOptions": {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

对于纯 ESM 的 Node.js 包（`"type": "module"` in package.json），需要确保：
1. 导入路径包含 `.js` 扩展名（即使源文件是 `.ts`）
2. 不使用 `__dirname`、`__filename`、`require` 等 CJS 特有 API
3. 使用 `import.meta.url` 替代 `__dirname`

```typescript
// ESM 中获取当前目录
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## 14.7 开发者技能

### 14.7.1 ts-reset

`ts-reset` 是 Matt Pocock 开发的工具库，修复 TypeScript 内置类型中一些过于宽松的定义：

```typescript
import '@total-typescript/ts-reset';

// 默认 TypeScript 中：
// JSON.parse 返回 any（不好）
// .filter(Boolean) 不会移除 undefined（不好）
// .includes 不允许 readonly 数组（不好）

// 安装 ts-reset 后：
// JSON.parse 返回 unknown（更安全）
// .filter(Boolean) 正确推导为非空类型
// .includes 接受 readonly 数组
```

### 14.7.2 satisfies 操作符

如上文所述，`satisfies` 是验证类型而非强制类型转换的最佳实践：

```typescript
// 实际应用场景：类型安全的 event emitter
type EventMap = {
  userCreated: { id: string; name: string };
  userDeleted: { id: string };
  error: { message: string; code: number };
};

const eventHandlers = {
  userCreated: (data) => console.log(data.id),
  userDeleted: (data) => console.log(data.id),
  error: (data) => console.log(data.code),
} satisfies Record<keyof EventMap, (data: unknown) => void>;
// 每个处理函数的参数类型会被精确推导，不需要手动标注
```

### 14.7.3 TypeScript Language Server 高级用法

VSCode 内置的 TypeScript Language Server 提供了一些实用功能：

- **Go to Definition**（F12）：跳转到定义
- **Find References**（Shift+F12）：查找所有引用
- **Rename Symbol**（F2）：安全重命名
- **Quick Fix**（Ctrl+.）：自动修复常见错误

```jsonc
// .vscode/settings.json 中的 TypeScript 相关配置
{
  "typescript.preferences.importModuleSpecifier": "relative", // 导入路径风格
  "typescript.preferences.quoteStyle": "single",             // 引号风格
  "typescript.updateImportsOnFileMove.enabled": "always",    // 自动更新导入路径
  "typescript.suggest.completeFunctionCalls": true,          // 补全函数调用参数
}
```

## 14.8 tsconfig.json 最佳实践

完整的 tsconfig.json 配置模板：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

各选项说明：

| 选项 | 作用 | 推荐值 |
|:--|:--|:--|
| `target` | 输出 JS 的 ECMAScript 版本 | `ES2022`（Node 18+） |
| `module` | 模块系统 | `Node16`（ESM 项目） |
| `strict` | 启用所有严格类型检查 | `true` |
| `declaration` | 生成 `.d.ts` 声明文件 | `true`（库项目） |
| `skipLibCheck` | 跳过 node_modules 中的类型检查 | `true`（显著加速编译） |

---

## 本章小结

TypeScript 为 Node.js 项目带来了工程化的类型安全保障，但它并非银弹。开发团队需要理解其编译原理、模块解析策略和运行时校验的边界，才能在享受类型安全的同时避免常见的陷阱。下一章将探讨如何通过 Rust/C++ 原生绑定突破 Node.js 的性能瓶颈。