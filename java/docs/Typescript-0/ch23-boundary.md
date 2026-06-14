# 第23章 跨越静态与运行时的鸿沟（边界防御）

TypeScript 的类型系统在**编译时**保护你，但运行时世界是狂野的——网络请求可能返回畸形数据，用户输入可能包含恶意内容，LocalStorage 可能被其他应用篡改。

本章的核心认知：**TS 类型在边界处一定会失效。** 你必须在边界建立"防御工事"。

---

## 1. 核心概念

### 边界失效：为什么静态类型靠不住

想象一个场景：你住在一个有严格安检的小区（TS 类型检查），但你的快递（API 响应）是从外面送进来的。小区保安（TS 编译器）只能检查"包裹包装是否完好"（语法是否正确），但**不能检查包裹里面的东西是否符合你的预期**（运行时数据形状是否正确）。

```typescript
// TS 认为这是安全的，但运行时可能崩溃
interface User {
  name: string;
  age: number;
}

const user: User = JSON.parse(localStorage.getItem("user") || "{}");
// 如果 localStorage 里存的是 { "name": "Alice" }（没有 age）
// TS 不会报错，但 user.age 是 undefined
```

**边界**就是你的程序与外部世界交互的地方：

| 边界类型 | 典型场景 | 风险 |
|---------|---------|------|
| 网络请求 | API 响应、WebSocket 消息 | 服务器可能返回不符合约定的数据 |
| 用户输入 | 表单提交、URL 参数 | 恶意输入、格式错误 |
| 持久化 | LocalStorage、IndexedDB | 数据被篡改、版本不兼容 |
| 第三方库 | 外部 SDK、CDN 脚本 | 库的行为不符合类型声明 |
| 文件系统 | 配置文件、上传文件 | 文件损坏、格式错误 |

### 运行时校验工具链：Zod / Valibot / TypeBox

这三个是目前最主流的运行时校验库：

| 库 | 特点 | 包大小 | 适用场景 |
|------|------|--------|---------|
| **Zod** | 语法最直观，生态最大 | ~10KB | 通用场景，最推荐 |
| **Valibot** | 模块化，按需引入 | ~0.5KB (tree-shaken) | 对包体积敏感的场景 |
| **TypeBox** | 基于 JSON Schema，与 OpenAPI 兼容 | ~5KB | 需要生成 API 文档的场景 |

它们共同的核心能力：**写一次 Schema，同时生成 TS 静态类型与运行时校验逻辑。**

---

## 2. 典型问题与处理

### 问题 1：只相信 TS 静态类型，运行时收到 undefined 崩溃

```typescript
// === Bad: 完全依赖 TS 静态类型 ===

// ❌ 从 API 获取数据，直接当成 User 使用
interface User {
  id: number;
  name: string;
  email: string;
  address: {
    city: string;
    zip: string;
  };
}

async function getUserBad(userId: number): Promise<User> {
  const res = await fetch(`/api/users/${userId}`);
  return res.json() as User; // 只是"告诉 TS 它是 User"，没有校验
}

// 使用
async function displayUserBad(userId: number) {
  const user = await getUserBad(userId);
  console.log(user.name.toUpperCase()); // ❌ 如果 name 是 undefined，崩溃
  console.log(user.address.city); // ❌ 如果 address 是 undefined，崩溃
}

// 服务器可能返回：
// { "id": 1 } — 缺少 name、email、address
// { "id": 1, "name": null } — name 是 null
// 所有这些都是 TS 不报错，但运行时崩溃的场景
```

**为什么不好：** `as User` 只是编译时的类型断言，不产生任何运行时检查。如果 API 返回的数据不符合 `User` 接口的形状，TS 不会告诉你，你的代码会在运行时默默崩溃。

```typescript
// === Good: 使用 Zod 进行运行时校验 ===

import { z } from "zod";

// ✅ 定义 Schema：同时作为类型定义和校验规则
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  address: z.object({
    city: z.string(),
    zip: z.string(),
  }),
});

// 从 Schema 推导出 TS 类型
type User = z.infer<typeof UserSchema>;
// 等价于：{ id: number; name: string; email: string; address: { city: string; zip: string } }

async function getUserGood(userId: number): Promise<User> {
  const res = await fetch(`/api/users/${userId}`);
  const data = await res.json();

  // 校验：如果数据不符合 Schema，抛出详细错误
  const result = UserSchema.parse(data);
  return result;
}

// 或者使用 safeParse（不抛异常，返回结果对象）
async function getUserSafe(userId: number): Promise<User | null> {
  const res = await fetch(`/api/users/${userId}`);
  const data = await res.json();

  const result = UserSchema.safeParse(data);
  if (!result.success) {
    console.error("Invalid user data:", result.error.format());
    return null; // 返回默认值或抛出业务异常
  }
  return result.data;
}

// 使用
async function displayUserGood(userId: number) {
  const user = await getUserSafe(userId);
  if (!user) {
    console.log("User data invalid, showing fallback");
    return;
  }
  console.log(user.name.toUpperCase()); // ✅ 安全的，name 一定是 string
  console.log(user.address.city); // ✅ 安全的，address 和 city 都存在
}
```

**为什么好：** `UserSchema.parse(data)` 在运行时检查数据是否符合预期形状。如果数据缺少字段、类型不对、格式错误，Zod 会抛出详细的错误信息（哪个字段缺失、期望什么类型、实际收到什么）。`safeParse` 让你优雅地处理校验失败，而不是让程序崩溃。

---

### 问题 2：在 API 网关层不做校验，让错误数据渗透到整个系统

```typescript
// === Bad: 数据未经校验就进入业务逻辑 ===

// ❌ 一个典型的"渗透"场景
interface Order {
  id: string;
  amount: number;
  items: Array<{ productId: string; quantity: number }>;
}

class OrderServiceBad {
  async processOrder(orderId: string): Promise<void> {
    // 1. 从 API 获取订单（没有校验）
    const res = await fetch(`/api/orders/${orderId}`);
    const order = (await res.json()) as Order;

    // 2. 直接使用 order 进行计算
    const total = order.items.reduce(
      (sum, item) => sum + item.quantity * 10, // ❌ 如果 quantity 是 undefined，得到 NaN
      0
    );

    // 3. 错误的数据继续向下游传播
    await this.saveToDatabase({ id: order.id, total }); // 存入 NaN
  }

  private async saveToDatabase(data: { id: string; total: number }): Promise<void> {
    // 数据库收到 NaN，可能引发更多问题
    console.log(`Saving order ${data.id} with total ${data.total}`);
  }
}
```

**为什么不好：** 错误数据像病毒一样从边界渗透到业务逻辑→计算结果→数据库。等到发现问题时，已经污染了多个系统，排查成本极高。

```typescript
// === Good: 在 API 网关层建立校验屏障 ===

import { z } from "zod";

// ✅ 在入口处定义 Schema
const OrderSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

type Order = z.infer<typeof OrderSchema>;

class OrderServiceGood {
  async processOrder(orderId: string): Promise<void> {
    // 1. 在网关层校验——数据不合格就立刻拒绝
    const res = await fetch(`/api/orders/${orderId}`);
    const rawData = await res.json();

    const parsed = OrderSchema.safeParse(rawData);
    if (!parsed.success) {
      // ✅ 校验失败，记录详细错误并优雅退出
      console.error("Order validation failed:", parsed.error.format());
      throw new Error(`Invalid order data: ${parsed.error.message}`);
    }

    // 2. 从这里开始，order 是经过验证的安全数据
    const order = parsed.data;

    // 3. 安全地使用
    const total = order.items.reduce(
      (sum, item) => sum + item.quantity * 10,
      0
    );

    // 4. 持久化
    await this.saveToDatabase({ id: order.id, total });
  }

  private async saveToDatabase(data: { id: string; total: number }): Promise<void> {
    console.log(`Saving order ${data.id} with total ${data.total}`);
  }
}
```

**为什么好：** 校验屏障在数据进入系统时就做了检查——不合格的数据被当场拦截，不会污染后续的业务逻辑和数据库。错误信息（哪个字段不符合什么规则）也清晰可追溯。

---

### 问题 3：LocalStorage 数据的版本兼容

```typescript
// === Bad: 直接从 LocalStorage 读取，假设格式正确 ===

const STORAGE_KEY = "app_state";

interface AppState {
  version: number;
  theme: "light" | "dark";
  language: string;
}

function loadStateBad(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { version: 1, theme: "light", language: "zh-CN" };
  }
  return JSON.parse(raw) as AppState; // ❌ 如果存储的是旧版本，缺少字段
}

function saveStateBad(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 假设之前存的是旧版本：
// localStorage.setItem("app_state", JSON.stringify({ version: 1, theme: "dark" }));
// 加载时，language 字段缺失，但 TS 不报错
```

**为什么不好：** LocalStorage 的数据可能来自旧版本、被其他应用修改、或被用户手动编辑。`as AppState` 不做任何检查，缺少字段时程序在运行时崩溃。

```typescript
// === Good: 使用 Zod 校验 + 版本迁移 ===

import { z } from "zod";

// ✅ 定义带版本控制的 Schema
const AppStateV1Schema = z.object({
  version: z.literal(1),
  theme: z.enum(["light", "dark"]),
  language: z.string().default("zh-CN"), // 默认值
});

const AppStateV2Schema = z.object({
  version: z.literal(2),
  theme: z.enum(["light", "dark", "auto"]), // 新增选项
  language: z.string(),
  fontSize: z.number().default(14), // 新增字段
});

// 当前版本的 Schema
const CurrentSchema = AppStateV2Schema;

type AppState = z.infer<typeof CurrentSchema>;

function loadStateSafe(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { version: 2, theme: "light", language: "zh-CN", fontSize: 14 };
  }

  try {
    const data = JSON.parse(raw);

    // ✅ 版本迁移
    if (data.version === 1) {
      // V1 → V2 迁移
      const v1 = AppStateV1Schema.parse(data);
      return {
        version: 2,
        theme: v1.theme === "dark" ? "dark" : "light",
        language: v1.language,
        fontSize: 14, // 新字段的默认值
      };
    }

    // 校验当前版本
    return CurrentSchema.parse(data);
  } catch (e) {
    console.error("Failed to load state, using defaults");
    return { version: 2, theme: "light", language: "zh-CN", fontSize: 14 };
  }
}

function saveStateSafe(state: AppState): void {
  // 保存前也做一次校验，确保不会存脏数据
  const result = CurrentSchema.safeParse(state);
  if (!result.success) {
    console.error("Cannot save invalid state:", result.error.format());
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
}
```

**为什么好：** 版本迁移逻辑确保旧版本数据能被安全升级。Zod 的 `.default()` 自动填充缺失字段。保存前再次校验确保不会写入脏数据。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：完整的 API 客户端 + 校验层
// ==========================================

import { z } from "zod";

// ---- 定义 Schema ----

const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    error: z.string().optional(),
    timestamp: z.number(),
  });

const UserSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
  createdAt: z.string().datetime(),
});

// ---- 安全的 API 客户端 ----

class SafeApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    const raw = await res.json();
    const responseSchema = ApiResponseSchema(schema);
    const parsed = responseSchema.parse(raw);

    if (!parsed.success) {
      throw new Error(`API error: ${parsed.error}`);
    }

    return parsed.data;
  }

  async post<T, R>(path: string, body: T, schema: z.ZodType<R>): Promise<R> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = await res.json();
    const responseSchema = ApiResponseSchema(schema);
    const parsed = responseSchema.parse(raw);

    return parsed.data;
  }
}

// ---- 使用 ----

const api = new SafeApiClient("https://api.example.com");

async function main() {
  try {
    const user = await api.get("/users/1", UserSchema);
    console.log(user.name); // ✅ 安全
  } catch (e) {
    console.error("Failed to fetch user:", e);
  }
}

// ==========================================
// 示例 2：使用 Valibot（对包体积敏感的场景）
// ==========================================

// import { object, string, number, email, minLength, Output } from "valibot";

// const SignupSchema = object({
//   name: string([minLength(2)]),
//   email: string([email()]),
//   age: number(),
// });

// type SignupData = Output<typeof SignupSchema>;

// function validateSignup(data: unknown): SignupData {
//   const result = parse(SignupSchema, data);
//   return result;
// }

// ==========================================
// 示例 3：使用 TypeBox（JSON Schema 兼容）
// ==========================================

// import { Type, Static } from "@sinclair/typebox";
// import { Value } from "@sinclair/typebox/value";

// const ProductSchema = Type.Object({
//   id: Type.String({ format: "uuid" }),
//   name: Type.String({ minLength: 1 }),
//   price: Type.Number({ minimum: 0 }),
//   tags: Type.Array(Type.String()),
// });

// type Product = Static<typeof ProductSchema>;

// function validateProduct(data: unknown): Product {
//   if (!Value.Check(ProductSchema, data)) {
//     const errors = [...Value.Errors(ProductSchema, data)];
//     throw new Error(`Validation failed: ${errors.map(e => e.message).join(", ")}`);
//   }
//   return data as Product;
// }

// ==========================================
// 示例 4：嵌套数据的递归校验
// ==========================================

import { z } from "zod";

// 递归 Schema：Category 可以嵌套子 Category
const CategorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    children: z.array(CategorySchema).default([]),
  })
);

type Category = z.infer<typeof CategorySchema>;

// 测试
const data = {
  id: "cat1",
  name: "Electronics",
  parentId: null,
  children: [
    {
      id: "cat2",
      name: "Phones",
      parentId: "cat1",
      children: [],
    },
  ],
};

const result = CategorySchema.parse(data);
console.log(result.name); // "Electronics"
```

---

## 4. 配置/环境示例

### Zod 安装与基础配置

```bash
# 安装 Zod
npm install zod

# 使用
# import { z } from "zod";
```

### 在 API 网关层统一校验

```typescript
// api-gateway.ts
// 统一在网关层做校验，业务层不关心数据来源

import { z } from "zod";

// 定义所有 API 端点的 Schema
const schemas = {
  "POST /users": {
    body: z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      password: z.string().min(8),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
  },
  "GET /users/:id": {
    params: z.object({
      id: z.string().regex(/^\d+$/),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
  },
} as const;

// 通用校验函数
function validateRequest<T extends keyof typeof schemas>(
  endpoint: T,
  input: { body?: unknown; params?: unknown; query?: unknown }
) {
  const schema = schemas[endpoint];
  const result: Record<string, unknown> = {};

  if ("body" in schema && input.body) {
    result.body = schema.body.parse(input.body);
  }
  if ("params" in schema && input.params) {
    result.params = schema.params.parse(input.params);
  }

  return result as any;
}
```

### 使用 `z.infer` 同步 TS 类型

```typescript
// 关键模式：类型从 Schema 推导，而不是手动定义

import { z } from "zod";

// 1. 定义 Schema
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  metadata: z.record(z.unknown()).optional(),
});

// 2. 从 Schema 推导 TS 类型
export type User = z.infer<typeof UserSchema>;
// 等价于手动定义：
// {
//   id: number;
//   name: string;
//   email: string;
//   role: "admin" | "user";
//   metadata?: Record<string, unknown>;
// }

// 3. 使用：同一个 Schema 既是类型定义又是校验规则
function processUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

### CI 中强制边界校验

```yaml
# .github/workflows/boundary-check.yml
name: Boundary Validation Check

on:
  pull_request:
    paths:
      - "src/**/*.ts"

jobs:
  check-boundaries:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      # 检查：所有 API 调用是否有对应的 Schema
      - name: Check API calls have validation
        run: |
          # 查找所有 fetch/axios 调用，检查是否被 Schema 包裹
          BARE_CALLS=$(grep -r "\.json()" src/ --include="*.ts" | grep -v "\.parse\|\.safeParse" || true)
          if [ -n "$BARE_CALLS" ]; then
            echo "❌ Found API calls without validation:"
            echo "$BARE_CALLS"
            exit 1
          fi
```

---

## 5. 必须掌握的技能

### 边界防御的黄金法则

> **永远不要相信外部输入。每个边界都是攻击面。**

| 边界 | 防御策略 | 推荐工具 |
|------|---------|---------|
| API 响应 | Schema 校验 + 类型推导 | Zod `.parse()` |
| 用户输入 | 格式校验 + 消毒 | Zod + DOMPurify |
| LocalStorage | 版本控制 + 默认值 | Zod `.default()` |
| URL 参数 | 格式校验 + 默认值 | Zod `.regex()` |
| 第三方库 | 适配层 + 运行时断言 | Zod + `z.infer` |

### Zod 核心 API 速查

```typescript
import { z } from "zod";

// 基础类型
z.string();
z.number();
z.boolean();
z.null();
z.undefined();

// 复合类型
z.array(z.string());
z.object({ name: z.string() });
z.tuple([z.string(), z.number()]);
z.union([z.string(), z.number()]);
z.record(z.unknown());

// 校验规则
z.string().min(1).max(100).email().url();
z.number().int().positive().min(0).max(100);
z.array(z.string()).min(1).max(10).nonempty();

// 特殊处理
z.optional(z.string()); // string | undefined
z.nullable(z.string()); // string | null
z.default(z.string(), "default"); // 默认值

// 类型推导
type T = z.infer<typeof SomeSchema>;
type Input = z.input<typeof SomeSchema>;
type Output = z.output<typeof SomeSchema>;

// 解析方式
schema.parse(data); // 校验失败抛异常
schema.safeParse(data); // 返回 { success, data } 或 { success, error }
```

### 开发者应带走的知识点

1. **TS 类型在边界处一定失效** —— 网络请求、用户输入、LocalStorage 都是"外部世界"，必须做运行时校验。
2. **写一次 Schema，得到双重安全** —— Zod/Valibot/TypeBox 让你定义一次结构，同时获得 TS 类型和运行时校验。
3. **在网关层拦截，不要让脏数据渗透** —— 数据进入系统的第一时间做校验，不合格的当场拒绝。
4. **safeParse 是你的朋友** —— 不要用 `parse()` 抛异常，用 `safeParse()` 优雅处理失败场景。
5. **版本迁移是持久化数据的必修课** —— LocalStorage 数据可能来自旧版本，用 Schema 做版本兼容。
6. **类型从 Schema 推导** —— 不要手动定义类型再写 Schema，用 `z.infer` 从 Schema 自动推导类型。

### 最后的提醒

> **静态类型是蓝图，运行时校验是安检。缺了任何一个，你的程序都不安全。**
