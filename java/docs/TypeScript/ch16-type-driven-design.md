# 类型驱动 API 设计

## 1. 使用场景

类型驱动设计（Type-Driven Design）是以类型系统为核心来指导 API 设计的方法论。主要使用场景包括：

- **库/框架开发**：设计类型安全的公共 API
- **团队协作**：通过类型约束规范团队代码
- **领域建模**：用类型系统表达业务规则
- **API 网关**：设计类型安全的请求/响应结构
- **配置系统**：类型安全的配置对象设计

## 2. 实现原理

### 调用者体验优先

类型驱动设计的核心原则是：**从调用者的角度设计类型**。好的类型设计让正确用法自然流畅，错误用法在编译期就被阻止。

```typescript
// 反例：调用者体验差
function fetchData(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) {
  // 调用者需要记住所有参数
}

// 正例：调用者体验好
interface FetchOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

function fetchData<T>(url: string, options?: FetchOptions): Promise<T> {
  // 类型约束让 IDE 自动补全
}

// 调用时 IDE 会提示可选字段
fetchData("/api/users", {
  method: "GET",
  // IDE 自动提示 headers、body 等字段
});
```

### 避免过度类型体操

类型驱动设计不是越复杂越好。过度类型体操会降低代码可读性和编译性能：

```typescript
// 过度类型体操
type DeepPath<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? `${K}.${DeepPath<T[K]>}`
    : K
  : never;

// 过于复杂的泛型约束
type StrictExtract<T, U> = T extends U
  ? U extends T
    ? T
    : never
  : never;

// 简洁的替代方案
// 使用简单的联合类型
type ConfigPath = "server.host" | "server.port" | "database.url";

// 使用简单的泛型
function getConfig<T>(key: string, defaultValue: T): T {
  return (config[key] as T) ?? defaultValue;
}
```

### 防御性 API 设计

防御性 API 设计通过类型系统防止误用：

```typescript
// readonly 防止修改
interface UserState {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

// Omit 排除不需要的字段
interface UserInput {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
}

// 创建用户时不需要 role 字段
type CreateUserInput = Omit<UserInput, "role">;

// 更新用户时所有字段可选
type UpdateUserInput = Partial<CreateUserInput>;

// 品牌类型（Branded Types）
type Brand<T, B> = T & { __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

function getUser(id: UserId): User {
  // ...
}

function getOrder(id: OrderId): Order {
  // ...
}

// 编译时阻止类型混淆
const userId = "user_123" as UserId;
const orderId = "order_456" as OrderId;

getUser(userId);   // 正确
getUser(orderId);  // 编译错误：不能将 OrderId 赋值给 UserId
```

## 3. 潜在风险

### 过度抽象

```typescript
// 过度抽象的泛型
class Repository<T extends Record<string, any>, K extends keyof T> {
  private items: Map<K, T> = new Map();

  getById(id: K): T[K] | undefined {
    return this.items.get(id);
  }
}

// 更清晰的替代方案
interface UserRepository {
  getUser(id: string): User | undefined;
  saveUser(user: User): void;
}
```

### 类型体操影响编译性能

```typescript
// 深度递归类型导致编译缓慢
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 限制递归深度
type DeepPartialV2<T, Depth extends number = 3> = Depth extends 0
  ? T
  : {
      [P in keyof T]?: T[P] extends object
        ? DeepPartialV2<T[P], Prev[Depth]>
        : T[P];
    };
```

## 4. 优化策略

### 渐进式类型设计

```typescript
// 第一阶段：基础类型
interface User {
  id: string;
  name: string;
  email: string;
}

// 第二阶段：操作类型
type CreateUser = Omit<User, "id">;
type UpdateUser = Partial<CreateUser>;

// 第三阶段：业务约束
type UserRole = "admin" | "editor" | "viewer";
interface UserWithRole extends User {
  role: UserRole;
}
```

### 类型安全的事件系统

```typescript
// 类型安全的事件系统
type EventMap = {
  userCreated: { id: string; name: string };
  userUpdated: { id: string; changes: Partial<User> };
  userDeleted: { id: string };
};

class TypedEmitter {
  private handlers = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ): void {
    if (!this.handlers.has(event as string)) {
      this.handlers.set(event as string, new Set());
    }
    this.handlers.get(event as string)!.add(handler);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.handlers.get(event as string)?.forEach(handler => handler(data));
  }
}

// 使用
const emitter = new TypedEmitter();
emitter.on("userCreated", (data) => {
  console.log(data.name);  // 类型安全
});
```

## 5. 典型问题处理

### 问题：API 响应类型不匹配

```typescript
// 使用 Zod 进行运行时验证
import { z } from "zod";

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

type UserResponse = z.infer<typeof UserResponseSchema>;

async function fetchUser(id: string): Promise<UserResponse> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return UserResponseSchema.parse(data);
}
```

### 问题：配置对象类型安全

```typescript
// 类型安全的配置系统
interface AppConfig {
  server: {
    port: number;
    host: string;
    ssl: boolean;
  };
  database: {
    url: string;
    pool: {
      min: number;
      max: number;
    };
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "text";
  };
}

// 使用 satisfies 验证配置
const config = {
  server: {
    port: 3000,
    host: "localhost",
    ssl: true,
  },
  database: {
    url: "postgres://localhost:5432/db",
    pool: {
      min: 2,
      max: 10,
    },
  },
  logging: {
    level: "info",
    format: "json",
  },
} satisfies AppConfig;
```

## 6. 开发者技能

类型驱动设计的核心技能：

1. **调用者视角**：从使用者的角度设计类型
2. **适度抽象**：知道何时使用泛型，何时保持简单
3. **防御性设计**：使用 readonly、Omit、品牌类型防止误用
4. **渐进式设计**：从简单类型开始，逐步增加约束
5. **运行时验证**：结合 Zod 等库实现双保险

## 7. 示例代码

### 类型安全的 API 客户端

```typescript
// 类型安全的 API 客户端设计
interface ApiEndpoints {
  "/api/users": {
    GET: { response: User[] };
    POST: { body: CreateUser; response: User };
  };
  "/api/users/:id": {
    GET: { params: { id: string }; response: User };
    PUT: { params: { id: string }; body: UpdateUser; response: User };
    DELETE: { params: { id: string }; response: void };
  };
}

type ApiClient = {
  [Url in keyof ApiEndpoints]: {
    [Method in keyof ApiEndpoints[Url]]: (
      ...args: ApiEndpoints[Url][Method] extends { params: infer P }
        ? [params: P, ...(ApiEndpoints[Url][Method] extends { body: infer B }
          ? [body: B]
          : [])]
        : ApiEndpoints[Url][Method] extends { body: infer B }
          ? [body: B]
          : []
    ) => Promise<ApiEndpoints[Url][Method] extends { response: infer R }
      ? R
      : void>;
  };
};

// 简化的实现
function createApiClient(): ApiClient {
  return new Proxy({} as any, {
    get(target, url: string) {
      return new Proxy({}, {
        get(_, method: string) {
          return async (...args: any[]) => {
            // 实际的 HTTP 请求
            const response = await fetch(url, { method: method as string });
            return response.json();
          };
        },
      });
    },
  });
}

// 使用
const api = createApiClient();
const users = await api["/api/users"].GET();  // 返回 User[]
```

### 品牌类型实战

```typescript
// 品牌类型防止 ID 混淆
type Brand<T, B> = T & { __brand: B };

type UserId = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;
type OrderId = Brand<string, "OrderId">;

// 类型安全的 ID 生成
function createUserId(): UserId {
  return crypto.randomUUID() as UserId;
}

function createProductId(): ProductId {
  return crypto.randomUUID() as ProductId;
}

// 类型安全的查询
interface Database {
  findUser(id: UserId): User | undefined;
  findProduct(id: ProductId): Product | undefined;
  findOrder(id: OrderId): Order | undefined;
}

const db: Database = { /* ... */ };

const userId = createUserId();
const productId = createProductId();

db.findUser(userId);      // 正确
db.findUser(productId);   // 编译错误：类型不匹配
```

## 8. 小结

类型驱动 API 设计的核心要点：

- **调用者体验优先**：类型设计应以使用体验为中心
- **避免过度类型体操**：保持类型简单可读，不过度抽象
- **防御性 API**：使用 readonly、Omit、品牌类型防止误用
- **渐进式设计**：从基础类型开始，逐步增加业务约束
- **运行时验证**：类型系统 + 运行时校验双保险
- **品牌类型**：通过交叉类型创建不兼容的"品牌"，防止类型混淆
