# 第8章 Node.js 全栈类型共享

## 概述

全栈 TypeScript 开发的核心优势之一，是在前后端之间共享类型定义。传统开发模式中，前端需要手动维护与后端 API 对应的类型声明，这种重复劳动不仅低效，更是 bug 的温床——后端修改了字段类型，前端却浑然不知，直到运行时才暴露出问题。

本章将深入探讨 Node.js 全栈类型共享的完整方案，以 **tRPC** 为核心，结合 **Zod** 运行时校验与 **Prisma** ORM，构建一个从前端到数据库全程类型安全的现代应用。你将学到如何让类型定义成为整个技术栈的"单一事实来源"，消除前后端之间的类型鸿沟。

---

## 模块一：全栈类型共享的挑战与价值

### 1.1 传统架构中的类型断裂

在传统的 RESTful API 开发中，前后端通常使用不同的语言或框架，类型定义需要分别在两端维护：

```
后端 (TypeScript)         前端 (TypeScript)
┌─────────────────┐      ┌─────────────────┐
│ interface User  │      │ interface User  │  ← 重复定义
│   id: string    │      │   id: string    │
│   name: string  │      │   name: string  │
│   email: string │      │   email: string │
│   role: Role    │      │   role: Role    │
└─────────────────┘      └─────────────────┘
        │                          │
        └─────── JSON 响应 ────────┘
```

这种模式下，任何后端类型的变更都需要同步更新前端定义。一旦遗漏，就会产生类型断裂——TypeScript 编译通过，但运行时行为与预期不符。

### 1.2 类型共享的三种模式

| 模式 | 方案 | 优点 | 缺点 |
|------|------|------|------|
| 手动同步 | 两端各自维护类型 | 简单直接 | 容易不同步 |
| 共享包 | monorepo 中提取公共类型 | 类型统一 | 需要 monorepo 基础设施 |
| 自动推导 | tRPC / GraphQL 代码生成 | 零手动维护 | 框架绑定 |

**tRPC** 选择了第三种路径——让 API 的类型定义自动从服务端推导到客户端，无需任何代码生成步骤。

### 1.3 本章技术栈

- **tRPC v10** — 端到端类型安全的 RPC 框架
- **Zod v3** — 基于 TypeScript 的运行时 Schema 校验
- **Prisma** — 类型安全的 ORM
- **Express** — HTTP 服务器
- **tsx** — TypeScript 执行引擎

---

## 模块二：Zod Schema 驱动的类型系统

### 2.1 为什么需要运行时校验

TypeScript 的类型系统只在编译时生效，运行时 JavaScript 对类型一无所知。这意味着：

```typescript
// TypeScript 编译时检查通过
function greet(user: { name: string }) {
  console.log(`Hello, ${user.name.toUpperCase()}`);
}

// 但运行时可能收到任何数据
const data = JSON.parse(apiResponse); // 类型未知！
greet(data); // 如果 data.name 是 undefined，运行时崩溃
```

**Zod** 填补了这个空白——它在运行时执行校验，同时通过 `z.infer` 推导出对应的 TypeScript 类型。

### 2.2 定义 Schema

```typescript
// src/schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

export const CreateUserSchema = UserSchema.omit({ id: true });

export type User = z.infer<typeof UserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

关键点：
- `UserSchema` 是运行时校验器，也是类型的"单一事实来源"
- `z.infer<typeof UserSchema>` 自动推导出 TypeScript 类型
- `UserSchema.omit({ id: true })` 通过 Schema 组合创建新 Schema，无需重复定义

### 2.3 Zod 类型推导的深度

`z.infer` 不是简单的类型映射，它能够处理复杂的嵌套结构：

```typescript
const NestedSchema = z.object({
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  config: z.union([z.literal('a'), z.literal('b')]),
  nested: z.object({
    x: z.number().optional(),
  }),
});

// 推导出的类型：
type Nested = z.infer<typeof NestedSchema>;
// {
//   tags: string[];
//   metadata: Record<string, unknown>;
//   config: "a" | "b";
//   nested: { x?: number | undefined };
// }
```

---

## 模块三：tRPC Router 与服务端类型推导

### 3.1 tRPC 的核心概念

tRPC 的核心思想是：**过程（Procedure）**。每个过程是一个可被远程调用的函数，分为两种：

- **Query** — 查询数据（GET 语义）
- **Mutation** — 修改数据（POST 语义）

过程通过 Router 组织成树状结构，形成完整的 API 定义。

### 3.2 构建 Router

```typescript
// src/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { CreateUserSchema } from './schema.js';
import type { User } from './schema.js';

const t = initTRPC.create();
const users: User[] = [];

export const appRouter = t.router({
  user: t.router({
    list: t.procedure.query(() => users),
    byId: t.procedure.input(z.string()).query(({ input }) =>
      users.find(u => u.id === input)
    ),
    create: t.procedure.input(CreateUserSchema).mutation(({ input }) => {
      const user: User = { id: crypto.randomUUID(), ...input };
      users.push(user);
      return user;
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

### 3.3 类型推导的魔法

`typeof appRouter` 的类型包含了完整的 API 形状——每个过程的输入输出类型都被精确捕获。这是 tRPC 实现端到端类型安全的基础。

```typescript
// 推导出的 AppRouter 类型（伪代码）：
type AppRouter = {
  user: {
    list: Procedure<{ input: void, output: User[] }>;
    byId: Procedure<{ input: string, output: User | undefined }>;
    create: Procedure<{ input: CreateUserInput, output: User }>;
  };
};
```

---

## 模块四：客户端类型安全调用

### 4.1 创建类型化客户端

tRPC 客户端通过泛型参数 `AppRouter` 获得完整的类型信息：

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/router';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
```

### 4.2 类型安全的 API 调用

一旦客户端创建完成，所有 API 调用都获得完整的类型推断：

```typescript
// 自动补全：client.user. → list, byId, create
// 自动补全：client.user.create. → mutate

// 输入类型检查
const result = await client.user.create.mutate({
  name: 'Alice',
  email: 'alice@test.com',
  role: 'user',
  // id: 'xxx'  ← 类型错误！CreateUserInput 没有 id 字段
});

// 输出类型已知
console.log(result.name); // string
console.log(result.role); // "admin" | "user"
```

### 4.3 编译时 vs 运行时

tRPC 的类型安全是**编译时**的——TypeScript 在编译阶段就确保了调用方传入正确的参数类型。运行时，tRPC 使用 Zod Schema 对输入进行二次校验，形成双重保障。

---

## 模块五：Express 集成与服务器部署

### 5.1 适配器模式

tRPC 通过适配器与各种 HTTP 框架集成。Express 适配器将 tRPC Router 挂载到 Express 应用的路由上：

```typescript
// src/service.ts
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router.js';

const app = express();
app.use('/trpc', createExpressMiddleware({ router: appRouter }));
app.listen(3000, () => console.log('Server on :3000'));
```

### 5.2 中间件与上下文

tRPC 支持自定义上下文（Context），用于注入认证信息、数据库连接等：

```typescript
const t = initTRPC.context<{ user: { id: string; role: string } }>().create();

// 认证中间件
const isAdmin = t.middleware(({ ctx, next }) => {
  if (ctx.role !== 'admin') throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx });
});

const adminProcedure = t.procedure.use(isAdmin);
```

### 5.3 Docker 部署

项目提供了 Dockerfile 和 docker-compose.yml 用于生产部署。Dockerfile 采用多阶段构建，第一阶段编译 TypeScript，第二阶段仅复制编译产物，最小化镜像体积。

---

## 模块六：Prisma ORM 集成

### 6.1 Prisma Schema 定义

Prisma 是 Node.js 生态中最流行的 ORM 之一，它通过自己的 Schema 语言定义数据模型，并自动生成 TypeScript 类型：

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  role      Role     @default(user)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  admin
  user
}
```

### 6.2 类型融合

Prisma 生成的类型可以与 Zod Schema 结合使用：

```typescript
import { Prisma } from '@prisma/client';

// Prisma 生成的类型
type PrismaUser = Prisma.UserGetPayload<{}>;

// 与 Zod 结合
const prismaUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// 在 tRPC 过程中使用 Prisma
const appRouter = t.router({
  user: t.router({
    list: t.procedure.query(async () => {
      return await prisma.user.findMany();
    }),
  }),
});
```

### 6.3 类型安全的 CRUD

Prisma Client 提供了完全类型安全的查询 API：

```typescript
// 类型安全的查询
const user = await prisma.user.findUnique({
  where: { email: 'alice@test.com' },
  select: { id: true, name: true, role: true },
});
// user 的类型：{ id: string; name: string; role: Role } | null

// 类型安全的创建
const newUser = await prisma.user.create({
  data: {
    name: 'Bob',
    email: 'bob@test.com',
    role: 'user',
  },
});
// newUser 的类型：User（完整的 Prisma User 类型）
```

---

## 模块七：Monorepo 共享类型方案

### 7.1 Monorepo 架构

对于大型项目，将类型定义提取到独立的共享包中是最佳实践。使用 npm workspaces 或 pnpm workspaces 可以轻松实现：

```
project-root/
├── packages/
│   ├── shared/          # 共享类型和 Schema
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/          # 后端服务
│   │   ├── src/
│   │   └── package.json
│   └── web/             # 前端应用
│       ├── src/
│       └── package.json
├── package.json         # workspace root
└── tsconfig.base.json
```

### 7.2 共享包定义

```typescript
// packages/shared/src/index.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

### 7.3 在前后端引用共享类型

```json
// packages/server/package.json
{
  "dependencies": {
    "@myapp/shared": "workspace:*"
  }
}
```

```json
// packages/web/package.json
{
  "dependencies": {
    "@myapp/shared": "workspace:*"
  }
}
```

这样，前后端引用的是同一份类型定义，任何修改都会在两端同时生效。

---

## 模块八：测试与类型安全验证

### 8.1 API 集成测试

使用 Jest 和 tRPC 客户端进行集成测试：

```typescript
// tests/api.test.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/router';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

describe('tRPC API', () => {
  it('should create and list users', async () => {
    const created = await client.user.create.mutate({
      name: 'Alice', email: 'alice@test.com', role: 'user',
    });
    expect(created.name).toBe('Alice');
    expect(created.id).toBeDefined();

    const list = await client.user.list.query();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
```

### 8.2 类型安全测试

使用 `tsd` 库可以在测试中验证类型推导的正确性：

```typescript
import { expectType } from 'tsd';
import type { User, CreateUserInput } from '../src/schema';

// 编译时类型检查
expectType<string>(null as unknown as User['id']);
expectType<'admin' | 'user'>(null as unknown as User['role']);

// 验证 CreateUserInput 不包含 id
type HasId = 'id' extends keyof CreateUserInput ? true : false;
// HasId 应为 false
```

### 8.3 类型安全验证清单

| 检查项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| Schema 类型推导 | `z.infer` 结果 | 与手动定义一致 |
| Router 类型导出 | `typeof appRouter` | 包含所有过程 |
| 客户端输入校验 | 传入错误类型参数 | 编译时报错 |
| 客户端输出类型 | 调用返回值 | 类型已知且完整 |
| Prisma 查询类型 | `findMany` 返回值 | 与模型定义一致 |

---

## 总结

本章介绍了 Node.js 全栈类型共享的完整方案，核心要点如下：

1. **Zod Schema 是类型的单一事实来源** — 通过 `z.infer` 自动推导 TypeScript 类型，消除手动维护
2. **tRPC 实现端到端类型安全** — Router 类型自动推导到客户端，无需代码生成
3. **Prisma 提供数据库层类型安全** — 生成的 Client 类型与 Zod Schema 无缝结合
4. **Monorepo 共享类型** — 通过 workspace 协议在前后端之间共享类型定义
5. **双重校验机制** — TypeScript 编译时类型检查 + Zod 运行时校验

全栈类型共享不仅减少了代码量，更重要的是将类型错误从运行时提前到编译时，大幅提升了代码质量和开发效率。当后端修改了某个字段类型，前端在编译阶段就能发现并修复问题，而不是等到线上报错才后知后觉。

在下一章中，我们将探讨 TypeScript 的高级类型编程技巧，包括条件类型、映射类型和模板字面量类型，进一步挖掘类型系统的潜力。

---

## 参考资源

- [tRPC 官方文档](https://trpc.io/docs)
- [Zod 官方文档](https://zod.dev)
- [Prisma 官方文档](https://www.prisma.io/docs)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs)
