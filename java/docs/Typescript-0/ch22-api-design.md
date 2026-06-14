# 第22章 类型驱动的 API 设计能力

类型系统不仅是"检查工具"，更是你设计 API 的**杠杆**。好的类型 API 让调用者"根本感觉不到类型的存在"——他们写代码时 IDE 自动提示正确的选项，传错参数立即报红线，根本不需要查文档。

本章聚焦：如何设计对调用者友好的类型 API，以及如何避免"类型体操"的陷阱。

---

## 1. 核心概念

### 调用者体验优先：让类型"隐身"

好的类型 API 有一个共同特征：**调用者不需要写任何泛型参数**。类型推导自动完成所有工作。

把类型 API 想象成一个**自动售货机**：

- **坏的售货机**：你需要先输入"商品编号"（手动传泛型），它才给你东西
- **好的售货机**：你投币（传参数），它自动识别你要什么，直接弹出商品（类型自动推导）

```typescript
// ❌ 坏的 API：调用者必须手动传入泛型
function createStoreBad<T>() {
  return {
    get: (key: string): T | undefined => undefined,
    set: (key: string, value: T) => {},
  };
}
// 使用：const store = createStoreBad<User>(); // 每次都要写 <User>

// ✅ 好的 API：通过参数自动推导泛型
function createStoreGood<T>(initial: Record<string, T>) {
  return {
    get: (key: string): T | undefined => initial[key],
    set: (key: string, value: T) => { initial[key] = value; },
  };
}
// 使用：const store = createStoreGood({ user1: { name: "Alice" } });
// 自动推导出 T = { name: string }
```

### 防御性 API 设计：管好你自己的内部状态

一个函数/类的 API 不仅要"好用"，还要"不能滥用"。防御性设计的核心是：**让非法状态不可表达**。

- **`readonly`**：告诉调用者"这个字段你不能改"
- **`Omit` / `Pick`**：只暴露调用者需要的部分
- **Branded Types（品牌类型）**：让相同底层类型的值不能混用

### "类型体操"的阈值

类型体操的"适度"标准很朴素：

| 层次 | 特征 | 是否推荐 |
|------|------|---------|
| 必要抽象 | 1-2 层 infer，IDE 响应 < 200ms | 推荐 |
| 适度抽象 | 2-3 层条件类型，IDE 响应 < 500ms | 可以接受 |
| 过度体操 | >3 层 infer 嵌套，IDE 卡顿 >1s | 放弃，改用显式声明 |

**原则：如果一个类型推导需要超过 3 层 infer 且严重影响 IDE 性能，请果断放弃，改用显式声明。**

---

## 2. 典型问题与处理

### 问题 1：泛型参数设计不合理，调用者每次手动传参

```typescript
// === Bad: 调用者必须手动传入泛型 ===

// ❌ 问题：T 只出现在返回值中，TS 无法自动推导
async function fetchDataBad<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

// 调用：每次都要写类型参数
const user = await fetchDataBad<User>("/api/user/1"); // 手动写 <User>
const posts = await fetchDataBad<Post[]>("/api/posts"); // 手动写 <Post[]>
// 如果调用者写错了类型（例如 fetchDataBad<Post>("/api/user/1")），TS 不会报错
// 因为 T 只是"断言"，没有校验
```

**为什么不好：** 调用者手动传泛型 = 把类型安全的责任推给了调用方。调用者可能传错类型，而 TS 不会检查——因为 `T` 只在返回值出现，相当于"你说是啥就是啥"。

```typescript
// === Good: 通过参数自动推导泛型 ===

// ✅ 方案 1：让泛型出现在参数中
async function fetchDataGood<T extends Record<string, unknown>>(
  url: string,
  validator?: (data: unknown) => data is T
): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (validator && !validator(data)) {
    throw new Error("Invalid response shape");
  }
  return data as T;
}

// 调用：TS 自动推导
const user = await fetchDataGood("/api/user/1");
// 如果没有 validator，返回 unknown，强制调用者做类型保护

// ✅ 方案 2：使用 Zod schema 同时校验和推导类型
// import { z } from "zod";
// const UserSchema = z.object({ name: z.string(), age: z.number() });
// const user = await fetchDataGood("/api/user/1", (d): d is z.infer<typeof UserSchema> =>
//   UserSchema.safeParse(d).success
// );

// ✅ 方案 3：用参数驱动泛型推导
function createApi<T>(baseUrl: string) {
  return {
    get: <R>(path: string): Promise<R> =>
      fetch(`${baseUrl}${path}`).then((r) => r.json()),
    post: <B, R>(path: string, body: B): Promise<R> =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
  };
}

const api = createApi("/api");
// get 和 post 的泛型由每次调用时的参数自动推导
```

**为什么好：** 泛型参数出现在参数中时，TS 能自动推导，调用者不需要手动写 `<User>`。配合 validator 还能做运行时校验，真正做到"类型安全+运行安全"。

---

### 问题 2：没有防御性设计，内部状态被外部篡改

```typescript
// === Bad: 内部状态暴露，外部可以随意修改 ===

class UserProfileBad {
  // ❌ 问题：public 字段可以被外部直接修改
  public email: string;
  public role: string;

  constructor(email: string, role: string) {
    this.email = email;
    this.role = role;
  }

  updateEmail(newEmail: string): boolean {
    // 有验证逻辑
    if (!newEmail.includes("@")) return false;
    this.email = newEmail;
    return true;
  }
}

const userBad = new UserProfileBad("alice@example.com", "admin");
userBad.email = "not-an-email"; // ❌ 直接绕过验证！
userBad.role = "superadmin"; // ❌ 外部可以直接提升权限！
```

**为什么不好：** 公有字段让外部可以绕过所有验证逻辑直接修改内部状态。`email` 直接被赋值为非法值，`role` 可以被提升到任何权限，安全漏洞。

```typescript
// === Good: 防御性设计，限制外部修改 ===

class UserProfileGood {
  // ✅ readonly 防止外部修改
  public readonly id: string;
  // ✅ private 隐藏内部状态
  private _email: string;
  private _role: string;

  constructor(id: string, email: string, role: string) {
    this.id = id;
    this._email = email;
    this._role = role;
  }

  get email(): string {
    return this._email;
  }

  updateEmail(newEmail: string): boolean {
    if (!newEmail.includes("@")) return false;
    this._email = newEmail;
    return true;
  }

  // ✅ 用 Omit 暴露"只读视图"
  getSnapshot(): Omit<UserProfileGood, "updateEmail" | "_email" | "_role"> {
    return {
      id: this.id,
      email: this._email,
      role: this._role,
    };
  }
}

const userGood = new UserProfileGood("u1", "alice@example.com", "admin");
// userGood.email = "bad"; // ❌ 编译错误：setter 是 private 的
// userGood.id = "u2"; // ❌ 编译错误：readonly
userGood.updateEmail("alice@new.com"); // ✅ 通过验证方法修改
```

**为什么好：** `readonly` 防止 id 被修改，private 字段配合 getter 控制访问，`Omit` 创建的只读快照让外部只能读取不能修改。

---

### 问题 3：品牌类型（Branded Types）防止类型混淆

```typescript
// === Bad: 相同底层类型导致"张冠李戴" ===

// ❌ 问题：userId 和 orderId 都是 string，可以混用
function getUser(id: string): void {
  console.log(`Fetching user: ${id}`);
}

function getOrder(id: string): void {
  console.log(`Fetching order: ${id}`);
}

const userId = "user_123";
const orderId = "order_456";

getUser(orderId); // ❌ 编译不报错，但语义错误：传了 orderId 给 getUser
getOrder(userId); // ❌ 同理
```

**为什么不好：** 当多个业务概念底层类型相同时（都是 string），TS 无法区分它们。调用者可能不小心传错参数，编译器不会报错，运行时可能返回 404 或更糟。

```typescript
// === Good: 使用品牌类型区分 ===

// ✅ 品牌类型：给 string 加一个"商标"
type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

// 工厂函数：安全地创建品牌类型
function createUserId(id: string): UserId {
  // 品牌类型只是编译时的标记，运行时还是普通 string
  if (!id.startsWith("user_")) {
    throw new Error("Invalid user ID format");
  }
  return id as UserId;
}

function createOrderId(id: string): OrderId {
  if (!id.startsWith("order_")) {
    throw new Error("Invalid order ID format");
  }
  return id as OrderId;
}

function getUser(id: UserId): void {
  console.log(`Fetching user: ${id}`);
}

function getOrder(id: OrderId): void {
  console.log(`Fetching order: ${id}`);
}

const userId = createUserId("user_123");
const orderId = createOrderId("order_456");

getUser(userId); // ✅ 正确
// getUser(orderId); // ❌ 编译错误：OrderId 不能赋值给 UserId
// getOrder(userId); // ❌ 编译错误：UserId 不能赋值给 OrderId

// ✅ 更优雅的品牌类型：使用 class
class Brand<T extends string> {
  // 运行时实际值
  constructor(public readonly value: string) {
    // 可以在构造函数中做校验
  }

  toString(): string {
    return this.value;
  }
}

// 用类继承创建品牌
class UserId2 extends Brand<"UserId"> {
  constructor(id: string) {
    super(id);
    if (!id.startsWith("user_")) throw new Error("Invalid UserId");
  }
}

class OrderId2 extends Brand<"OrderId"> {
  constructor(id: string) {
    super(id);
    if (!id.startsWith("order_")) throw new Error("Invalid OrderId");
  }
}
```

**为什么好：** 品牌类型在编译时附加了"类型标签"，即使底层都是 string，TS 也会阻止你混用。工厂函数还可以做运行时校验，双重保险。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：构建一个类型安全的配置系统
// ==========================================

// 核心思想：让非法配置在编译时就无法构造

// 品牌类型：防止混淆不同来源的配置值
type DatabaseUrl = string & { readonly __brand: "DatabaseUrl" };
type ApiKey = string & { readonly __brand: "ApiKey" };

// 工厂函数：在创建时校验并标记类型
function createDatabaseUrl(url: string): DatabaseUrl {
  if (!url.startsWith("postgres://") && !url.startsWith("mysql://")) {
    throw new Error("Invalid database URL");
  }
  return url as DatabaseUrl;
}

function createApiKey(key: string): ApiKey {
  if (key.length < 16) {
    throw new Error("API key too short");
  }
  return key as ApiKey;
}

// 配置接口：使用品牌类型
interface AppConfig {
  readonly dbUrl: DatabaseUrl;
  readonly apiKey: ApiKey;
  readonly port: number;
  readonly debug: boolean;
}

// 安全的配置构建器
class ConfigBuilder {
  private config: Partial<AppConfig> = {};

  setDatabaseUrl(url: string): this {
    this.config.dbUrl = createDatabaseUrl(url);
    return this;
  }

  setApiKey(key: string): this {
    this.config.apiKey = createApiKey(key);
    return this;
  }

  setPort(port: number): this {
    if (port < 0 || port > 65535) throw new Error("Invalid port");
    this.config.port = port;
    return this;
  }

  setDebug(debug: boolean): this {
    this.config.debug = debug;
    return this;
  }

  build(): AppConfig {
    // 确保所有必需字段都已设置
    if (!this.config.dbUrl || !this.config.apiKey || !this.config.port) {
      throw new Error("Missing required config fields");
    }
    return this.config as AppConfig;
  }
}

// 使用
const config = new ConfigBuilder()
  .setDatabaseUrl("postgres://localhost:5432/mydb")
  .setApiKey("sk-abcdef1234567890")
  .setPort(3000)
  .setDebug(true)
  .build();

console.log(config.dbUrl); // postgres://localhost:5432/mydb

// ==========================================
// 示例 2：利用映射类型创建"只读响应"API
// ==========================================

// 核心思想：API 返回的数据应该是只读的，防止调用者意外修改

type ReadonlyResponse<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? ReadonlyResponse<T[K]>
    : T[K];
};

// 后端的数据模型（可写）
interface UserModel {
  id: string;
  name: string;
  email: string;
  settings: {
    theme: string;
    notifications: boolean;
  };
}

// API 返回的只读版本
type UserResponse = ReadonlyResponse<UserModel>;

// API 函数
function fetchUser(): UserResponse {
  // 模拟从数据库获取数据
  return {
    id: "u1",
    name: "Alice",
    email: "alice@example.com",
    settings: {
      theme: "dark",
      notifications: true,
    },
  };
}

const userResp = fetchUser();
// userResp.name = "Bob"; // ❌ 编译错误：readonly
// userResp.settings.theme = "light"; // ❌ 编译错误：深层 readonly

// ==========================================
// 示例 3：通过函数重载设计友好的 API
// ==========================================

// 核心思想：不同参数组合对应不同的返回值类型

// 一个"查找用户"的 API
interface User {
  id: string;
  name: string;
  email: string;
}

interface UserSummary {
  id: string;
  name: string;
}

// 重载签名：根据参数决定返回值
function findUser(id: string): User | undefined;
function findUser(ids: string[]): User[];
function findUser(options: { includeEmail: false }): UserSummary[];
function findUser(options: { includeEmail: true }): User[];

// 实现签名
function findUser(param: string | string[] | { includeEmail: boolean }): unknown {
  // 实际实现...
  if (typeof param === "string") {
    return { id: param, name: "Alice", email: "alice@example.com" };
  }
  if (Array.isArray(param)) {
    return param.map((id) => ({ id, name: "User", email: "" }));
  }
  if (param.includeEmail) {
    return [{ id: "1", name: "Alice", email: "alice@example.com" }];
  }
  return [{ id: "1", name: "Alice" }];
}

// 调用：IDE 自动提示正确的类型
const singleUser = findUser("u1"); // User | undefined
const multiUsers = findUser(["u1", "u2"]); // User[]
const summaries = findUser({ includeEmail: false }); // UserSummary[]
const fullUsers = findUser({ includeEmail: true }); // User[]
```

---

## 4. 配置/环境示例

### 在 tsconfig 中启用防御性相关的严格检查

```jsonc
{
  "compilerOptions": {
    "strict": true,

    // 禁止读取未赋值的属性（配合 readonly 使用）
    "strictNullChecks": true,

    // 精确可选属性：undefined 和 "属性不存在" 是不同的
    "exactOptionalPropertyTypes": true,

    // 禁止 this 隐式为 any（品牌类型中常见）
    "noImplicitThis": true,

    // 禁止隐式 any（强制显式类型标注）
    "noImplicitAny": true
  }
}
```

### ESLint 规则：强制防御性设计

```jsonc
// .eslintrc.json
{
  "rules": {
    // 强制 readonly 修饰符
    "@typescript-eslint/prefer-readonly": "warn",

    // 禁止 public 修饰符（TypeScript 中默认就是 public）
    "@typescript-eslint/explicit-member-accessibility": [
      "error",
      { accessibility: "no-public" }
    ],

    // 强制使用 readonly 参数
    "@typescript-eslint/parameter-properties": [
      "error",
      { prefer: "parameter-property" }
    ]
  }
}
```

### Branded Types 最佳实践

```typescript
// 统一的品牌类型工具

// 方式 1：使用类型标记（零运行时开销）
export type Brand<T, B extends string> = T & { readonly __brand: B };

// 方式 2：使用类（有运行时校验）
export abstract class Branded<T extends string> {
  // 品牌标记：只在类型层面存在
  declare protected readonly __brand: T;

  constructor(public readonly value: string) {}

  toString(): string {
    return this.value;
  }

  // 比较两个品牌类型的值是否相等
  equals(other: Branded<T>): boolean {
    return this.value === other.value;
  }
}

// 使用方式 1：
type UserId = Brand<string, "UserId">;
type Email = Brand<string, "Email">;

// 使用方式 2：
class ProductId extends Branded<"ProductId"> {
  constructor(id: string) {
    super(id);
    if (!id.startsWith("prod_")) throw new Error("Invalid product ID");
  }
}
```

---

## 5. 必须掌握的技能

### API 设计的"调用者体验"检查清单

1. **泛型参数是否在参数中出现？** —— 如果没有，调用者需要手动传参，说明设计有问题
2. **默认参数是否合理？** —— 给调用者最常用的默认值，减少样板代码
3. **返回值类型是否精确？** —— 不要总返回 `Promise<any>` 或 `Record<string, any>`
4. **IDE 提示是否清晰？** —— 悬停时看到的类型签名应该直观易读
5. **错误信息是否可理解？** —— 类型报错应该直接指向调用者的错误代码

### 防御性设计的四个层级

| 层级 | 工具 | 解决的问题 |
|------|------|-----------|
| L1：不可变 | `readonly`, `Readonly<T>`, `as const` | 防止外部修改内部状态 |
| L2：隐藏 | `private`, `#` (ES private fields) | 防止外部访问内部实现 |
| L3：限制 | `Omit<T, K>`, `Pick<T, K>` | 只暴露调用者需要的部分 |
| L4：区分 | Branded Types | 防止相同底层类型混淆 |

### "类型体操"的自检问题

写一个复杂类型之前，问自己三个问题：

1. **这个类型解决的是"类型问题"还是"业务问题"？** —— 如果只是炫技，放弃
2. **没有这个类型，代码会崩溃吗？** —— 如果不会，考虑简化
3. **半年后的同事能看懂吗？** —— 如果不能，加注释或简化

### 开发者应带走的知识点

1. **调用者体验优先**：好的类型 API 让调用者不用写任何泛型参数，类型推导自动完成。
2. **readonly 是廉价的防御**：加 `readonly` 零成本，但能防止大量意外修改。
3. **Branded Types 防止"张冠李戴"**：当多个业务概念底层类型相同时，用品牌类型区分。
4. **Omit / Pick 控制暴露面**：不要直接暴露完整类型，只给调用者需要的部分。
5. **类型体操适可而止**：超过 3 层 infer 且影响 IDE 性能的，用显式声明替代。
6. **API 是契约，不是实现**：设计 API 时思考"调用者需要什么"，而不是"我有什么"。
