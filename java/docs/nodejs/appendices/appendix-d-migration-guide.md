# 附录D Express → Fastify/NestJS 重构指南

## D.1 概述

Express 是 Node.js 生态中最经典的 Web 框架，但随着应用规模的增长，其灵活有余而约束不足的设计逐渐暴露出维护难题。Fastify 和 NestJS 是当前最主流的两大替代方案：Fastify 追求极致性能与 Schema 驱动的验证，NestJS 追求工程化的模块组织与依赖注入。本附录提供从 Express 迁移到这两个框架的详细指南。

## D.2 Express → Fastify

### 性能对比

| 维度 | Express | Fastify |
|:--|:--|:--|
| 吞吐量 | ~20k req/s | ~40k req/s |
| 序列化 | JSON.stringify（运行时反射） | fast-json-stringify（Schema 驱动编译） |
| 路由查找 | 线性遍历中间件 | Radix Tree + 结构化路由 |
| 插件系统 | 中间件链（无隔离） | 封装插件（Encapsulation） |
| 请求验证 | 手动 | Ajv Schema 自动验证 |

### 序列化对比

Express 使用 `JSON.stringify` 动态序列化，Fastify 通过 Schema 预编译序列化函数：

```javascript
// Express：运行时反射，无优化
app.get('/api/users/:id', async (req, res) => {
  const user = await db.findUser(req.params.id);
  res.json(user); // JSON.stringify 在每次响应时执行
});
```

```javascript
// Fastify：Schema 驱动预编译
const schema = {
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    },
  },
};

app.get(
  '/api/users/:id',
  { schema },
  async (req, reply) => {
    const user = await db.findUser(req.params.id);
    return user; // 使用 Schema 预编译的序列化函数
  }
);
```

### 中间件与封装的差异

Express 的中间件链缺乏作用域隔离——中间件一旦注册就影响所有后续路由：

```javascript
// Express：中间件影响全局
app.use(cors());       // 全局生效
app.use(auth());       // 全局生效，无法隔离

app.get('/api/public', handler);           // auth 也会在这里执行
app.get('/api/private', authRequired, handler); // 最前面已经 auth 了一次
```

Fastify 的插件封装可以精确控制作用域：

```javascript
// Fastify：插件封装实现作用域隔离
import Fastify from 'fastify';

const app = Fastify();

// 公共路由 —— 不经过鉴权
app.register(async function publicRoutes(instance) {
  instance.get('/api/public', async (req, reply) => ({ ok: true }));
});

// 私有路由 —— 所有路由都经过鉴权
app.register(async function privateRoutes(instance) {
  instance.addHook('onRequest', authRequired); // 仅此插件内生效

  instance.get('/api/private', async (req, reply) => ({ secret: 'data' }));
  instance.get('/api/admin', async (req, reply) => ({ admin: 'panel' }));
  // onRequest hook 对上面两个路由都生效
});
```

### 请求验证

Express 中需要手动校验请求参数：

```javascript
// Express：手动验证
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;

  if (!name || typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const user = await db.createUser({ name, email });
  res.status(201).json(user);
});
```

Fastify 通过 Schema 自动验证并返回结构化错误：

```javascript
// Fastify：Schema 自动验证
const createUserSchema = {
  body: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', format: 'email' },
    },
  },
};

app.post(
  '/api/users',
  { schema: createUserSchema },
  async (req, reply) => {
    // body 已经通过验证，类型安全
    const user = await db.createUser(req.body);
    return reply.status(201).send(user);
  }
);
```

### 逐步迁移策略

从 Express 到 Fastify 建议渐进式迁移，而非重写：

```
Step 1: 抽象 Express 应用为可注入的 Server 接口
Step 2: 在外层 Fastify 实例中注册 Express 中间件（使用 @fastify/express 适配器）
Step 3: 逐路由用 Fastify 原生路由替换 Express 路由
Step 4: 移除 @fastify/express 依赖

// 示例 — 使用适配器共存
import Fastify from 'fastify';
import expressPlugin from '@fastify/express';

const app = Fastify();
await app.register(expressPlugin);

// Express 中间件在 Fastify 中运行
app.use(require('cors')());
app.use(require('morgan')('combined'));

// 新路由使用 Fastify 原生
app.get('/api/v2/users', async (req, reply) => {
  return db.findAll();
});
```

## D.3 Express → NestJS

### 架构对比

| 维度 | Express | NestJS |
|:--|:--|:--|
| 架构模式 | 自由 | 模块化 + AOP |
| 语言支持 | JavaScript | TypeScript 原生 |
| 依赖注入 | 手动 | @Injectable + providers |
| 分层 | 无强制分层 | Controller → Service → Repository |
| 测试 | 需要自行组织 | 内置 TestingModule |
| 学习曲线 | 低 | 中-高 |

### 模块化（@Module 装饰器）

NestJS 使用 `@Module` 装饰器组织应用结构：

```typescript
// app.module.ts — 应用根模块
import { Module } from '@nestjs/common';
import { UserModule } from './users/user.module';

@Module({
  imports: [UserModule],    // 导入子模块
  controllers: [],          // 控制器
  providers: [],            // 服务提供者
})
export class AppModule {}
```

```typescript
// users/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService], // 导出供其他模块使用
})
export class UserModule {}
```

### 依赖注入（@Injectable + providers）

NestJS 的依赖注入容器自动解析构造函数参数：

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable() // 标记为可注入的 Provider
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>, // 自动注入
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }
}
```

将 Service 注册到模块的 providers 中后，Controller 可以自动注入：

```typescript
// user.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService, // NestJS 自动注入
  ) {}

  @Get()
  async findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.userService.findById(id);
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }
}
```

### 控制器与路由

| Express 写法 | NestJS 等价写法 |
|:--|:--|
| `router.get('/users', handler)` | `@Get() findAll()` |
| `router.post('/users', handler)` | `@Post() create()` |
| `router.get('/users/:id', handler)` | `@Get(':id') findById(@Param('id') id: string)` |
| `req.params.id` | `@Param('id')` |
| `req.query.page` | `@Query('page')` |
| `req.body` | `@Body()` |
| `req.headers.authorization` | `@Headers('authorization')` |

### 中间件/守卫/拦截器/管道

NestJS 将 Express 的中间件概念拆分为四个层次清晰的关注点：

```
Request → Guard（是否允许访问？）→ Interceptor（预处理/后处理）
        → Pipe（参数校验与转换）→ Route Handler → Interceptor（响应映射）
                    ↓ 异常
              ExceptionFilter（错误处理）
```

| 组件 | 类比 Express | 职责 |
|:--|:--|:--|
| **Guard** | 鉴权中间件 | 判断请求是否允许通过（返回 boolean） |
| **Interceptor** | 响应中间件 | 转换请求/响应流，日志，缓存 |
| **Pipe** | 参数校验 | 校验和转换路由参数 |
| **ExceptionFilter** | 错误处理 | 格式化异常响应 |

```typescript
// Guard 示例：角色鉴权
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly roles: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return this.roles.includes(user?.role);
  }
}

// 在控制器中使用
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @UseGuards(new RolesGuard(['admin']))
  getDashboard() {
    return { data: 'sensitive' };
  }
}
```

```typescript
// Pipe 示例：参数校验
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const val = parseInt(value, 10);
    if (isNaN(val) || val <= 0) {
      throw new BadRequestException('必须是正整数');
    }
    return val;
  }
}

@Get(':id')
findById(@Param('id', ParsePositiveIntPipe) id: number) {
  return this.userService.findById(id);
}
```

### 从 Express 迁移到 NestJS 的实用步骤

```typescript
// Step 1: 创建 NestJS 项目
// npm install -g @nestjs/cli
// nest new nest-app

// Step 2: 将现有的 Express 路由分组为模块
// Express 文件结构：
//   routes/users.js
//   routes/products.js
//   middleware/auth.js

// NestJS 文件结构：
//   src/users/user.module.ts
//   src/users/user.controller.ts
//   src/users/user.service.ts
//   src/products/product.module.ts
//   src/products/product.controller.ts
//   src/products/product.service.ts
//   src/common/guards/auth.guard.ts

// Step 3: 将 Express 中间件转换为对应的 NestJS 组件
// - 鉴权逻辑 → Guard
// - 请求日志 → Interceptor
// - 参数校验 → Pipe + DTO 类
// - 错误处理 → ExceptionFilter

// Step 4: 将数据库操作迁移到 Service 层
// - Express 中混杂在路由里的 db 操作 → 抽取到 Service
```

### 常用的 NestJS DTO 定义

```typescript
// create-user.dto.ts
import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  role?: string;
}

// 在控制器中自动应用 Pipe 校验
@Post()
async create(@Body(new ValidationPipe()) createUserDto: CreateUserDto) {
  return this.userService.create(createUserDto);
}
```

## D.4 迁移决策树

```
现有 Express 项目
├── 项目规模小（<1万行）
│   └── 保持 Express 或迁移到 Fastify（性能提升显著）
├── 项目规模中等（1-5万行）
│   ├── 性能瓶颈明显 → Fastify（渐进替换路由）
│   └── 代码组织混乱 → NestJS（模块化重构）
├── 项目规模大（>5万行）
│   ├── 团队熟悉 TypeScript → NestJS（完整工程化方案）
│   └── 仅需性能提升 → Fastify（低侵入性迁移）
└── 新项目
    ├── 偏简单 → Fastify
    └── 偏复杂 → NestJS
```

## D.5 迁移检查清单

```markdown
### Express → Fastify
- [ ] 安装 fastify + @fastify/express（适配期）
- [ ] 将 Express 中间件迁移到 Fastify hook（onRequest/preHandler）
- [ ] 逐路由替换为 Fastify 原生路由
- [ ] 为每个端点添加 JSON Schema
- [ ] 测试性能差异
- [ ] 移除 @fastify/express 适配器

### Express → NestJS
- [ ] 安装 @nestjs/cli 创建项目骨架
- [ ] 将 Express 路由分组为模块
- [ ] 将业务逻辑抽取到 Service
- [ ] 将鉴权逻辑转换为 Guard
- [ ] 将参数校验转换为 Pipe + DTO
- [ ] 添加 ExceptionFilter 统一错误格式
- [ ] 编写模块测试
```

---

## 附录小结

Express 到 Fastify 的迁移适合以性能优化为主要目标的项目，迁移成本低且可以渐进进行。Express 到 NestJS 的迁移适合需要强工程化约束的大型项目，迁移成本较高但长期维护收益显著。选择迁移路径时，应考虑团队技术栈、项目规模和性能需求三个维度。无论选择哪个路径，建议都采用渐进式替换，而非一次性重写。