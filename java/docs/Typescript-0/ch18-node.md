# 第18章 TypeScript + Node.js 与全栈共享

> 全栈开发最痛苦的体验是什么？"后端改了一个字段名，前端三天后才发现。"TypeScript 的全栈方案就像是给前后端之间拉了一条"类型光纤"——后端的任何变更，前端编译器瞬间感知。从 Express 到 tRPC，从 ORM 到全栈共享，TypeScript 正在重新定义全栈开发的体验。

---

## 1. 核心概念

### Node.js 后端的 TypeScript 演进

Node.js 后端框架对 TypeScript 的支持经历了三个阶段：

```
第一阶段：裸写 TS → 自己声明 req/res 类型
第二阶段：框架内置 TS → Express @types、NestJS 装饰器
第三阶段：全栈类型共享 → tRPC 端到端类型安全
```

### 三种主流框架的 TS 集成风格

| 框架 | 风格 | TS 集成度 | 适合场景 |
|---|---|---|---|
| **Express** | 传统中间件 | 通过 `@types/express` 手动声明 | 轻量 API、微服务 |
| **NestJS** | 全栈框架 | 装饰器 + 元数据反射 | 企业级应用、大型项目 |
| **Hono** | 现代轻量 | 泛型 + 类型推导，天然支持 | Edge、Serverless、现代化项目 |

### ORM 的类型推导

数据库 ORM 是后端类型安全的核心环节。TypeScript ORM 的进化路径：

```
手写 SQL → 手写类型 → Prisma schema → 自动生成类型
```

现代的 Prisma 和 Drizzle 都采用了 **Schema-first** 的方式——你在 schema 文件中定义数据模型，ORM 自动生成对应的 TypeScript 类型。这就像"用图纸（schema）自动生产零件（类型）"，而不是"手工打磨每个零件"。

### 全栈类型共享的终极方案：tRPC

传统的全栈开发是"两个世界"：

```
后端定义 API → 写 Swagger 文档 → 前端看文档 → 手动写类型 → 类型不一致！
```

tRPC 改变了这个流程：

```
后端定义 API（类型安全） → 前端直接调用（类型自动推导） → 类型 100% 一致！
```

tRPC 的核心思想是：**既然前后端都是 TypeScript，为什么要多一层 API 文档？** 让编译器来做类型检查，比任何文档都可靠。

---

## 2. 典型问题与处理

### 问题 1：Express 的 req/res 类型扩展

```typescript
// ❌ Bad Code — 使用 any 或未声明扩展类型
import express, { Request, Response } from 'express'

const app = express()

// 中间件：添加用户信息到请求
app.use((req: any, res: any, next: any) => {
  req.user = { id: 1, name: 'Alice' }  // ❌ req 没有 user 属性
  next()
})

app.get('/api/profile', (req: any, res: any) => {
  // req.user 类型是 any，没有智能提示
  // 拼写错误（req.usesr）不会被捕获
  res.json({ name: req.user.name })
})
```

**为什么不好？** `any` 类型关闭了所有类型检查。`req.user` 既没有类型定义，也没有编辑器提示。一旦中间件逻辑变化（比如 `user` 改为 `currentUser`），TypeScript 不会报错，但运行时必然出错。

```typescript
// ✅ Good Code — 使用声明合并扩展 Express 类型

// types/express.d.ts
import { Request } from 'express'

// 声明合并：扩展 Express 的 Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        name: string
        email: string
        role: 'admin' | 'user'
      }
    }
  }
}

// app.ts
import express, { Request, Response, NextFunction } from 'express'

const app = express()

// 中间件：使用正确的类型
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 模拟认证逻辑
  req.user = {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin'
  }
  next()
}

app.get('/api/profile', authMiddleware, (req: Request, res: Response) => {
  // req.user 现在有完整的类型提示
  // req.user?.name → string | undefined
  // req.user?.role → 'admin' | 'user' | undefined
  
  if (!req.user) {
    return res.status(401).json({ error: '未认证' })
  }
  
  res.json({
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  })
})
```

**为什么好？** 通过 TypeScript 的声明合并（Declaration Merging），我们扩展了 Express 的 `Request` 接口，`req.user` 获得了完整的类型信息。中间件和路由处理函数之间有了类型契约——中间件确保 `user` 存在，路由安全地使用可选链访问。

### 问题 2：Prisma 生成的类型共享

```typescript
// ❌ Bad Code — 手动声明与 Prisma 类型不一致

// 后端手动声明的类型
interface User {
  id: number
  name: string
  email: string
  createdAt: string
}

// API 响应处理
app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany()
  // Prisma 返回的类型包含额外字段（passwordHash 等）
  res.json(users)  // ❌ 可能泄露敏感字段
})

// 前端手动声明的类型（与后端可能不一致）
interface User {
  id: number
  name: string
  email: string
  createAt: string  // ❌ 拼写错误！后端是 createdAt
}
```

**为什么不好？** 手动维护两套类型定义，前后端之间没有约束。后端改了字段名，前端不知道。`createdAt` 和 `createAt` 这样的差异不会在编译时被发现，只会在运行时变成 `undefined`。

```typescript
// ✅ Good Code — 使用 Prisma 生成的类型 + 选择导出

// prisma/schema.prisma
model User {
  id           Int      @id @default(autoincrement())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt()
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
}

// 运行 prisma generate 后，@prisma/client 自动生成类型

// types/api-types.ts
import { Prisma } from '@prisma/client'

// 方案 1：使用 Prisma 的 Pick 类型
// 选择 User 的子集作为 API 响应类型
export type UserPublic = Pick<
  Prisma.UserGetPayload<{}>,
  'id' | 'name' | 'email' | 'createdAt'
>

// 方案 2：使用 Prisma 的 Select 类型
// 定义选择器，Prisma 自动推导返回类型
export const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true
} satisfies Prisma.UserSelect

// UserPublicFromSelect 类型：{ id: number; name: string; email: string; createdAt: Date }
export type UserPublicFromSelect = Prisma.UserGetPayload<{
  select: typeof userPublicSelect
}>

// 方案 3：包含关联的复杂类型
export type PostWithAuthor = Prisma.PostGetPayload<{
  include: {
    author: {
      select: {
        id: true
        name: true
        email: true
      }
    }
  }
}>
// PostWithAuthor 类型：
// {
//   id: number
//   title: string
//   content: string | null
//   published: boolean
//   authorId: number
//   createdAt: Date
//   author: { id: number; name: string; email: string }
// }

// 后端路由
import { PrismaClient } from '@prisma/client'
import { userPublicSelect, type UserPublicFromSelect } from './types/api-types'

const prisma = new PrismaClient()

app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany({
    select: userPublicSelect  // ✅ 类型安全的选择器
  })
  // users 类型自动推导为 UserPublicFromSelect[]
  // passwordHash 不会出现在结果中
  res.json(users)
})

app.get('/api/posts', async (req, res) => {
  const posts = await prisma.post.findMany({
    include: {
      author: {
        select: { id: true, name: true, email: true }
      }
    }
  })
  // posts 类型自动推导为 PostWithAuthor[]
  // post.author 有完整的类型信息
  res.json(posts)
})
```

**为什么好？** Prisma 生成的类型是"活"的——schema 变更后重新 `generate`，所有类型自动更新。通过 `Prisma.UserGetPayload` 等工具类型，可以精确控制 API 返回的数据结构，既保证了类型安全，又防止了数据泄露。

### 问题 3：tRPC 的类型共享

```typescript
// ❌ Bad Code — 传统 REST API 的类型断裂

// 后端：定义路由
// server/router.ts
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 输入验证
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

// 路由处理
app.post('/api/users', async (req, res) => {
  const parsed = createUserSchema.parse(req.body)
  const user = await prisma.user.create({ data: parsed })
  res.json(user)
})

// 前端：手动维护调用代码
// client/api.ts
async function createUser(data: { name: string; email: string }) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.json()
  // 返回值类型是 any！前端不知道后端返回了什么
}

// ❌ 前端拼错字段名，编译时不会报错
const result = await createUser({ name: 'Alice', email: 'alice@test.com' })
console.log(result.creaetedAt)  // undefined，编译时没有错误
```

**为什么不好？** 前后端之间没有类型连接。后端的输入验证（Zod schema）和前端的请求类型是两份代码，可能不一致。后端的响应类型没有传递到前端，前端只能"猜"返回值的结构。

```typescript
// ✅ Good Code — tRPC 端到端类型安全

// 共享类型包（可以被前端和后端共同引用）
// shared/trpc.ts
import { z } from 'zod'
import { initTRPC } from '@trpc/server'

const t = initTRPC.create()

// 输入验证 schema（既是运行时验证，也是类型定义）
export const createUserSchema = z.object({
  name: z.string().min(1, '用户名不能为空'),
  email: z.string().email('邮箱格式不正确'),
})

export const updateUserSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
})

// 后端路由定义
// server/router.ts
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { publicProcedure, router } from './trpc'

const prisma = new PrismaClient()

export const appRouter = router({
  // 查询用户列表
  userList: publicProcedure
    .query(async () => {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, createdAt: true }
      })
      return users
      // 返回类型自动推导：{ id: number; name: string; email: string; createdAt: Date }[]
    }),
  
  // 创建用户
  userCreate: publicProcedure
    .input(createUserSchema)  // 输入类型从 Zod schema 推导
    .mutation(async ({ input }) => {
      const user = await prisma.user.create({
        data: input,
        select: { id: true, name: true, email: true, createdAt: true }
      })
      return user
      // 返回类型自动推导
    }),
  
  // 获取用户文章（带关联）
  userPosts: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const posts = await prisma.post.findMany({
        where: { authorId: input.userId },
        include: { author: { select: { id: true, name: true } } }
      })
      return posts
    }),
})

// 导出类型供前端使用
export type AppRouter = typeof appRouter

// 前端：类型安全的调用
// client/index.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../server/router'

// 创建客户端——AppRouter 类型参数让整个客户端类型安全
const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({ url: 'http://localhost:3000/trpc' })
  ]
})

// 所有调用都是类型安全的！
async function main() {
  // 查询用户列表
  const users = await client.userList.query()
  // users 类型：{ id: number; name: string; email: string; createdAt: Date }[]
  
  // 创建用户——输入参数有类型检查
  const newUser = await client.userCreate.mutate({
    name: 'Alice',
    email: 'alice@example.com'
  })
  // newUser 类型：{ id: number; name: string; email: string; createdAt: Date }
  
  // ❌ 编译时错误：缺少必填字段
  // await client.userCreate.mutate({ name: 'Bob' })
  
  // ❌ 编译时错误：字段类型不匹配
  // await client.userCreate.mutate({ name: 'Bob', email: 123 })
  
  // 获取用户文章——关联类型也是安全的
  const posts = await client.userPosts.query({ userId: 1 })
  // posts 类型：{ id: number; title: string; author: { id: number; name: string } }[]
  
  console.log(newUser.createdAt)  // ✅ 类型安全，Date 类型
}
```

**为什么好？** tRPC 实现了"一次定义，两端使用"。后端的路由定义（包括输入验证和返回类型）自动成为前端的调用 API。后端改动了字段，前端的 `tsc` 编译会立刻报错——这比任何 Swagger 文档都可靠。

---

## 3. 示例代码

### 示例 1：Hono + TypeScript（现代轻量方案）

```typescript
// hono-app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

// Hono 的泛型设计让类型推导贯穿整个请求处理链
const app = new Hono()

// 中间件：CORS
app.use('/*', cors())

// 类型定义
interface Todo {
  id: number
  title: string
  completed: boolean
  createdAt: string
}

// 内存数据库
const todos: Todo[] = [
  { id: 1, title: '学习 TypeScript', completed: false, createdAt: new Date().toISOString() }
]

let nextId = 2

// Zod schema 用于验证
const createTodoSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100),
})

// 路由：类型安全，无需额外类型声明
app.get('/api/todos', (c) => {
  // c.json() 接受任意类型，但返回类型由泛型保证
  return c.json(todos)
})

app.post('/api/todos', zValidator('json', createTodoSchema), (c) => {
  // c.req.valid('json') 的类型自动推导为 z.infer<typeof createTodoSchema>
  const { title } = c.req.valid('json')
  
  const newTodo: Todo = {
    id: nextId++,
    title,
    completed: false,
    createdAt: new Date().toISOString()
  }
  
  todos.push(newTodo)
  return c.json(newTodo, 201)
})

app.get('/api/todos/:id', (c) => {
  const id = Number(c.req.param('id'))
  const todo = todos.find(t => t.id === id)
  
  if (!todo) {
    return c.json({ error: '未找到' }, 404)
  }
  
  return c.json(todo)
})

export default app
```

### 示例 2：Prisma + Drizzle 类型对比

```typescript
// prisma-example.ts
// Prisma：Schema-first，自动生成类型

// prisma/schema.prisma
// model Product {
//   id        Int      @id @default(autoincrement())
//   name      String
//   price     Float
//   category  Category @relation(fields: [categoryId], references: [id])
//   categoryId Int
//   createdAt DateTime @default(now())
// }
// 
// model Category {
//   id       Int       @id @default(autoincrement())
//   name     String    @unique
//   products Product[]
// }

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// Prisma 的关联查询类型完全自动推导
async function getProductsWithCategory() {
  const products = await prisma.product.findMany({
    include: {
      category: true
    },
    where: {
      price: { gt: 100 }
    }
  })
  
  // products 类型：Prisma.ProductGetPayload<{ include: { category: true } }>[]
  // 每个 product 有完整的 category 嵌套类型
  return products
}

// Drizzle：TypeScript-first，更接近手写 SQL
// drizzle-example.ts
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, gt, and } from 'drizzle-orm'

// 定义表结构（纯 TypeScript，不需要额外 schema 文件）
const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  categoryId: integer('category_id').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').unique().notNull()
})

const db = drizzle(process.env.DATABASE_URL!)

// Drizzle 的类型推导基于表定义
async function getExpensiveProducts() {
  const result = await db
    .select()
    .from(products)
    .where(gt(products.price, 100))
    .leftJoin(categories, eq(products.categoryId, categories.id))
  
  // result 类型自动推导，包含 products 和 categories 的字段
  return result
}
```

### 示例 3：NestJS + TypeScript 企业级写法

```typescript
// user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}
  
  async findAll(): Promise<User[]> {
    return this.userRepository.find()
  }
  
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOneBy({ id })
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`)
    return user
  }
  
  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(dto)
    return this.userRepository.save(user)
  }
  
  async update(id: number, dto: UpdateUserDto): Promise<User> {
    await this.userRepository.update(id, dto)
    return this.findOne(id)
  }
  
  async remove(id: number): Promise<void> {
    const result = await this.userRepository.delete(id)
    if (result.affected === 0) {
      throw new NotFoundException(`用户 ${id} 不存在`)
    }
  }
}

// user.controller.ts
import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common'
import { UserService } from './user.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}
  
  @Get()
  async findAll() {
    return this.userService.findAll()
  }
  
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(+id)
  }
  
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto)
  }
  
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(+id, dto)
  }
  
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.userService.remove(+id)
  }
}

// dto/create-user.dto.ts
import { IsString, IsEmail, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string
  
  @IsEmail()
  email: string
  
  @IsString()
  @MinLength(6)
  password: string
}
```

### 示例 4：完整 tRPC + Prisma 全栈项目骨架

```typescript
// server/trpc.ts
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const t = initTRPC.create()

// 公共过程（无需认证）
export const publicProcedure = t.procedure
export const router = t.router

// 认证中间件
const isAuthed = t.middleware(async ({ ctx, next }) => {
  // 模拟认证检查
  if (!ctx.user) {
    throw new Error('未认证')
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export const protectedProcedure = t.procedure.use(isAuthed)

// server/router.ts
export const appRouter = router({
  // 公开 API
  greeting: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return `Hello, ${input.name}!`
    }),
  
  // 需要认证的 API
  dashboard: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          posts: {
            select: { id: true, title: true, published: true },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      })
      return user
    }),
})

export type AppRouter = typeof appRouter

// client/index.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../server/router'

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })]
})

// 前端调用——100% 类型安全
async function main() {
  const greeting = await client.greeting.query({ name: 'World' })
  // greeting 类型：string
  
  const dashboard = await client.dashboard.query()
  // dashboard 类型：{ id: number; name: string; email: string; posts: {...}[] } | null
}
```

---

## 4. 配置/环境示例

### Express + TypeScript 项目配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### NestJS 项目配置

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### tRPC + Prisma 全栈 monorepo 结构

```
my-app/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
├── server/
│   ├── trpc.ts          # tRPC 初始化
│   ├── router.ts        # 路由定义
│   └── index.ts         # 服务入口
├── client/
│   ├── index.ts         # 前端入口
│   └── components/      # UI 组件
└── shared/
    └── types.ts         # 共享类型（如果使用纯 REST）
```

### Prisma schema 示例

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt()
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt()
}
```

### Hono + TypeScript 项目配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

## 5. 必须掌握的技能

### 基础知识

- [x] 理解 Express、NestJS、Hono 三种框架的 TS 集成差异
- [x] 掌握 Express 的声明合并机制（`declare global` 扩展 `Request`）
- [x] 理解 Prisma Schema 到 TypeScript 类型的生成机制

### ORM 类型安全

- [x] 掌握 Prisma 的 `Prisma.UserGetPayload` 等工具类型
- [x] 理解 `select` 和 `include` 在 Prisma 中的类型推导
- [x] 会使用 Prisma 的 Satisfies 模式创建类型安全的选择器
- [x] 了解 Drizzle 的 TypeScript-first 方案与 Prisma 的差异

### tRPC 全栈类型共享

- [x] 理解 tRPC 的核心架构：router → procedure → input → output 的类型链
- [x] 掌握 `createTRPCProxyClient<AppRouter>` 的泛型用法
- [x] 理解 Zod schema 在 tRPC 中既是运行时验证也是类型定义
- [x] 能搭建 tRPC + Prisma 的全栈项目

### 实战能力

- [x] 会配置 Node.js + TypeScript 项目的 tsconfig
- [x] 理解 monorepo 中前后端共享类型的两种方案（tRPC / 共享包）
- [x] 掌握 NestJS 中装饰器 + DTO 的类型安全模式
- [x] 能根据不同项目规模选择合适的技术方案

### 选型建议

```
小型 API / 微服务 → Hono + Drizzle（轻量、类型推导强）
中型全栈项目     → tRPC + Prisma（端到端类型安全）
企业级应用       → NestJS + TypeORM / Prisma（架构完整、生态丰富）
```

### 一句话总结

> **全栈 TypeScript 的终极愿景是"一次定义类型，两端（前后端）自动共享"——从数据库 Schema 到 UI 组件，类型系统贯穿整个应用栈，让编译时发现所有接口不一致的问题。**

---

*至此，TypeScript 手册的全部 18 章内容结束。从基础类型到全栈共享，TypeScript 不仅是一门语言，更是一种"让大型项目可持续维护"的工程实践。愿你在 TypeScript 的世界里，写出更安全、更优雅的代码！*
