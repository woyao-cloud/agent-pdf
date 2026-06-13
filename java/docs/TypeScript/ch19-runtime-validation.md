# 运行时校验技能

## 1. 使用场景

TypeScript 的类型系统只在编译时生效，运行时无法保证类型安全。运行时校验（Runtime Validation）弥补了这一缺陷。主要使用场景包括：

- **API 请求/响应验证**：确保外部数据符合预期结构
- **表单验证**：用户输入数据的类型和格式校验
- **配置文件验证**：环境变量和配置文件的类型安全
- **数据库数据验证**：从数据库读取的数据结构验证
- **消息队列**：跨服务消息的格式验证

## 2. 实现原理

### Zod Schema 共享

Zod 是最流行的 TypeScript 运行时校验库，核心思想是"一个 Schema，双重用途"：

```typescript
import { z } from "zod";

// 定义 Schema（运行时）
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(["admin", "user", "guest"]),
  createdAt: z.string().datetime(),
});

// 自动推导类型（编译时）
type User = z.infer<typeof UserSchema>;
// 等价于：
// type User = {
//   id: string;
//   name: string;
//   email: string;
//   age: number;
//   role: "admin" | "user" | "guest";
//   createdAt: string;
// }

// 运行时验证
const result = UserSchema.safeParse(unknownData);
if (result.success) {
  // result.data 的类型是 User
  console.log(result.data.name);
} else {
  // result.error 包含详细的验证错误
  console.error(result.error.format());
}
```

**实现原理**：Zod 的 Schema 对象在运行时存在，`z.infer` 在编译时提取 Schema 的类型信息。这样实现了"一次定义，双重使用"——运行时验证和编译时类型来自同一个定义，不会出现不一致。

### API 网关层校验

在 API 网关层进行统一的数据验证，确保进入系统的数据都是合法的：

```typescript
import { z } from "zod";
import express from "express";

const app = express();

// 定义请求 Schema
const CreateUserRequestSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// 验证中间件
function validate<T>(schema: z.ZodSchema<T>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (result.success) {
      // 将验证后的数据附加到请求对象
      req.validated = result.data;
      next();
    } else {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.format(),
      });
    }
  };
}

// 使用验证中间件
app.post("/api/users", validate(CreateUserRequestSchema), (req, res) => {
  // req.validated 的类型是 CreateUserRequest
  const { name, email } = req.validated.body;
  // 处理业务逻辑...
});
```

### z.infer 双保险

`z.infer` 实现了"编译时类型 + 运行时验证"的双保险机制：

```typescript
import { z } from "zod";

// 定义 Schema
const ConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  host: z.string().default("localhost"),
  database: z.object({
    url: z.string().url(),
    pool: z.object({
      min: z.number().int().min(1).default(2),
      max: z.number().int().max(100).default(10),
    }),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
});

type Config = z.infer<typeof ConfigSchema>;

// 运行时加载配置
function loadConfig(): Config {
  const raw = JSON.parse(fs.readFileSync("config.json", "utf-8"));
  return ConfigSchema.parse(raw);
}

// 编译时和运行时都安全
const config = loadConfig();
console.log(config.port);  // 类型安全，运行时也验证过
```

## 3. 潜在风险

### Schema 与类型不同步

```typescript
// 风险：手动定义的类型和 Schema 不一致
interface User {
  id: string;
  name: string;
  email: string;
}

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  // 忘记添加 email 字段
});

// 解决方案：始终使用 z.infer
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});
type User = z.infer<typeof UserSchema>;  // 自动同步
```

### 性能开销

```typescript
// 风险：高频调用的验证性能开销
for (const item of largeArray) {
  const result = ItemSchema.parse(item);  // 每次解析都有开销
}

// 优化：批量验证
const result = z.array(ItemSchema).parse(largeArray);

// 或者：只在边界层验证
// 在 API 入口验证一次，内部不再验证
```

## 4. 优化策略

### Schema 复用与组合

```typescript
import { z } from "zod";

// 基础字段
const IdSchema = z.string().uuid();
const TimestampSchema = z.string().datetime();
const EmailSchema = z.string().email();

// 组合 Schema
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string().regex(/^\d{5}$/),
});

const UserSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  email: EmailSchema,
  address: AddressSchema.optional(),
  createdAt: TimestampSchema,
});

// 部分 Schema
const UpdateUserSchema = UserSchema.partial();
const PublicUserSchema = UserSchema.omit({ email: true });
```

### 自定义验证

```typescript
import { z } from "zod";

// 自定义验证
const PasswordSchema = z
  .string()
  .min(8)
  .max(100)
  .refine(
    (val) => /[A-Z]/.test(val),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (val) => /[0-9]/.test(val),
    "Password must contain at least one number"
  );

// 跨字段验证
const RegisterSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(
    (data) => data.password === data.confirmPassword,
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }
  );
```

### 使用 Valibot 作为轻量替代

```typescript
import { object, string, number, email, minLength, maxLength, infer } from "valibot";

// Valibot 的模块化设计，Tree Shaking 友好
const UserSchema = object({
  name: string([minLength(1), maxLength(100)]),
  email: string([email()]),
  age: number(),
});

type User = infer<typeof UserSchema>;
```

## 5. 典型问题处理

### 问题：嵌套对象验证

```typescript
// 深层嵌套的验证
const OrderSchema = z.object({
  id: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().min(1),
      price: z.number().positive(),
    })
  ).min(1),
  shipping: z.object({
    address: z.object({
      street: z.string(),
      city: z.string(),
      country: z.string(),
    }),
    method: z.enum(["standard", "express"]),
  }),
  total: z.number().positive(),
});

// 验证错误信息会包含完整路径
// error at "items[0].quantity": Expected number, received string
```

### 问题：环境变量验证

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  API_KEY: z.string().min(32),
});

// 在应用启动时验证
function validateEnv(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    process.exit(1);
  }
  return result.data;
}

const env = validateEnv();
```

## 6. 开发者技能

运行时校验的核心技能：

1. **Schema 驱动开发**：先定义 Schema，再推导类型
2. **边界验证**：在系统边界（API、文件、消息）进行验证
3. **Schema 组合**：将 Schema 拆分为可复用的基础组件
4. **错误处理**：优雅地处理验证错误，提供清晰的错误信息
5. **性能优化**：在边界层验证，避免高频验证

## 7. 示例代码

### 完整的 API 验证系统

```typescript
import { z } from "zod";
import express from "express";

// 1. 定义 Schema
const schemas = {
  createUser: z.object({
    body: z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8),
    }),
  }),

  updateUser: z.object({
    body: z.object({
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
    }),
    params: z.object({
      id: z.string().uuid(),
    }),
  }),

  listUsers: z.object({
    query: z.object({
      page: z.string().transform(Number).pipe(z.number().int().positive()).default("1"),
      limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default("20"),
      role: z.enum(["admin", "user"]).optional(),
    }),
  }),
};

// 2. 验证中间件工厂
function validate<T>(schema: z.ZodSchema<T>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: result.error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    req.validated = result.data;
    next();
  };
}

// 3. 路由定义
const app = express();
app.use(express.json());

app.post("/api/users", validate(schemas.createUser), (req, res) => {
  const { name, email } = req.validated.body;
  // 创建用户...
});

app.put("/api/users/:id", validate(schemas.updateUser), (req, res) => {
  const { id } = req.validated.params;
  const updates = req.validated.body;
  // 更新用户...
});

app.get("/api/users", validate(schemas.listUsers), (req, res) => {
  const { page, limit, role } = req.validated.query;
  // 查询用户列表...
});
```

### Zod 与 TypeScript 类型同步

```typescript
// 确保类型始终与 Schema 同步
const UserSchema = z.object({
  id: z.string().uuid(),
  profile: z.object({
    displayName: z.string(),
    avatar: z.string().url().optional(),
    bio: z.string().max(500).optional(),
  }),
  settings: z.object({
    theme: z.enum(["light", "dark", "auto"]).default("auto"),
    notifications: z.boolean().default(true),
  }),
  createdAt: z.string().datetime(),
});

// 自动推导类型
type User = z.infer<typeof UserSchema>;

// 部分类型
type CreateUserInput = z.input<typeof UserSchema>;
// 包含所有必填字段（不含默认值）

type UpdateUserInput = z.input<typeof UserSchema.partial()>;
// 所有字段可选
```

## 8. 小结

运行时校验的核心要点：

- **Schema 共享**：Zod Schema 同时提供运行时验证和编译时类型
- **z.infer 双保险**：从 Schema 推导类型，确保类型与验证一致
- **API 网关层校验**：在系统边界统一验证，内部信任数据
- **Schema 组合**：将 Schema 拆分为可复用的基础组件
- **自定义验证**：使用 refine 实现复杂的业务规则验证
- **性能优化**：在边界层验证，避免内部重复验证
- **Valibot 替代**：需要更小包体积时选择 Valibot
