# 第3章 结构类型系统的陷阱

## 3.1 使用场景

结构类型系统（Structural Type System）是 TypeScript 区别于 Java、C# 等语言的核心设计之一。它的基本哲学是"如果它走路像鸭子、叫起来像鸭子，那它就是鸭子"——类型兼容性取决于类型的**形状（Shape）**，而非显式的声明或继承关系。

**理解鸭子类型与名义类型的差异**：在名义类型系统（Nominal Type System）中，两个类型是否兼容取决于它们是否有相同的名称或继承链。`class A` 和 `class B` 即使有完全相同的成员，也不能互相赋值。而在结构类型系统中，只要两个类型的成员结构兼容，它们就是兼容的。TypeScript 选择结构类型，是因为 JavaScript 本身就是鸭子类型语言——回调函数、对象字面量、混入（Mixin）等模式都依赖"对象长什么样"而非"对象叫什么"。

**在需要类型安全的场景使用品牌类型**：结构类型的灵活性也带来了隐患——两个语义完全不同但结构相同的类型（如 `UserId` 和 `OrderId` 都是字符串）可以互相赋值，导致运行时逻辑错误。在金融计算、权限校验、实体标识等场景中，开发者需要借助品牌类型（Branded Types）来模拟名义类型的行为，在编译期捕获语义错误。

**与第三方库的类型交互**：结构类型使得 TypeScript 可以天然兼容大多数 JavaScript 库——只要库返回的对象形状符合接口定义，无需显式声明 implements 关系。这在渐进式迁移和类型声明文件（`.d.ts`）编写中极大降低了成本。

## 3.2 实现原理

### 3.2.1 结构类型兼容性规则

TypeScript 判断两个类型是否兼容的核心规则是：**如果类型 A 拥有类型 B 所需的所有成员，则 A 可以赋值给 B**。换句话说，类型兼容性检查的是"子类型关系"（Subtyping Relation），而非"相等关系"。

```typescript
interface Named {
  name: string;
}

class Person {
  name: string = '';
  age: number = 0;
}

let p: Named = new Person(); // ✅ Person 有 name 属性，兼容 Named
```

这里 `Person` 拥有 `Named` 所需的所有成员（`name: string`），因此 `Person` 是 `Named` 的子类型。`Person` 多出的 `age` 属性不影响兼容性——**成员更多的类型可以赋值给成员更少的类型**，这与直觉相反：`Person`（成员多）是 `Named`（成员少）的子类型。

**函数类型的兼容性**：函数类型的兼容性规则更为复杂，遵循参数逆变（Contravariant）和返回值协变（Covariant）的规则。

```typescript
// 返回值：协变（与直觉一致）
type ReturnA = () => { name: string };
type ReturnB = () => { name: string; age: number };

let ra: ReturnA = (() => ({ name: 'a' })) as ReturnA;
let rb: ReturnB = (() => ({ name: 'b', age: 1 })) as ReturnB;

ra = rb; // ✅ 返回值多的可以赋值给返回值少的
// rb = ra; // ❌ 返回值少的不能赋值给返回值多的

// 参数：逆变（与直觉相反）
type ParamA = (x: { name: string }) => void;
type ParamB = (x: { name: string; age: number }) => void;

let pa: ParamA = (x) => {};
let pb: ParamB = (x) => {};

// pb = pa; // ✅ 参数少的可以赋值给参数多的（函数参数双向协变标志开启时）
// pa = pb; // ❌ 参数多的不能赋值给参数少的
```

函数参数兼容性的"反直觉"规则源于类型安全：如果 `ParamA` 的回调期望接收 `{ name: string }`，但实际传入的是 `{ name: string; age: number }`，多出的 `age` 被忽略，不会造成运行时错误。反之，如果 `ParamB` 的回调期望接收 `{ name: string; age: number }` 但实际只传入 `{ name: string }`，访问 `age` 会得到 `undefined`，导致运行时错误。

### 3.2.2 多余属性检查（Excess Property Checks）

这是结构类型系统中最重要的"例外"规则。当使用**对象字面量**直接赋值时，TypeScript 会执行比普通结构兼容性更严格的检查——不允许出现目标类型中未声明的属性。

```typescript
interface Person {
  name: string;
  age?: number;
}

// 对象字面量：严格模式
const p1: Person = { name: 'Alice', age: 30, email: 'a@b.com' };
// ❌ 类型 '{ name: string; age: number; email: string }' 不能赋值给类型 'Person'
// 对象字面量只能指定已知属性，'email' 不在类型 'Person' 中

// 变量赋值：宽松模式
const data = { name: 'Bob', age: 25, email: 'b@b.com' };
const p2: Person = data; // ✅ 结构兼容即可，不触发多余属性检查
```

这种设计是有意为之的：对象字面量通常是"一次性"的，多余的属性很可能是拼写错误或误解 API 签名。而变量赋值时，中间变量可能来自函数返回值、API 调用等，多余的属性可能是合法的扩展数据。

### 3.2.3 为什么 TypeScript 选择结构类型

TypeScript 选择结构类型而非名义类型，有三个核心原因：

**与 JavaScript 的鸭子类型一致**：JavaScript 是动态语言，对象之间的交互完全基于"是否有这个属性/方法"，而非"是否是这个类的实例"。结构类型系统精确地建模了这种运行时行为，使得 TypeScript 的类型检查结果与 JavaScript 的实际运行结果一致。

**降低迁移成本**：对于从 JavaScript 迁移到 TypeScript 的项目，结构类型意味着开发者不需要为每个对象声明 implements 关系。只要类型形状匹配，代码就能通过类型检查。这大幅降低了渐进式迁移的阻力。

**增强组合性**：结构类型天然支持混入（Mixin）、函数式组合、交叉类型等模式。开发者可以自由组合小型接口来构建复杂类型，而无需维护复杂的继承层次。

## 3.3 潜在风险

### 3.3.1 意外类型兼容导致运行时错误

结构类型系统最显著的风险是：**语义不同的类型如果结构相同，可以互相赋值**，导致逻辑错误在编译期无法被发现。

```typescript
type UserId = string;
type OrderId = string;

function getUser(id: UserId): User { /* ... */ }
function getOrder(id: OrderId): Order { /* ... */ }

const orderId: OrderId = 'ord-123';
getUser(orderId); // ✅ 编译通过！UserId 和 OrderId 都是 string
// 运行时：用订单 ID 查询用户，返回错误结果或空值
```

这种问题在实体标识、货币金额、度量单位等场景中尤为危险。`USD` 和 `CNY` 都是 `number`，`meters` 和 `feet` 都是 `number`——结构类型系统无法区分它们。

### 3.3.2 品牌类型缺失导致语义混淆

在没有品牌类型的情况下，团队中不同成员可能对同一基础类型赋予不同的语义含义：

```typescript
// 两个接口结构相同但语义不同
interface LoginRequest {
  token: string;
  timestamp: number;
}

interface PaymentRequest {
  token: string;
  timestamp: number;
}

function handleLogin(req: LoginRequest) { /* ... */ }
function handlePayment(req: PaymentRequest) { /* ... */ }

const payment: PaymentRequest = { token: 'pay_tok_123', timestamp: Date.now() };
handleLogin(payment); // ✅ 编译通过！结构相同
// 运行时：支付 token 被用于登录认证，可能造成安全漏洞
```

### 3.3.3 多余属性检查在变量赋值时失效

这是开发者最容易踩的坑——多余属性检查只在对象字面量上生效，一旦通过中间变量赋值，检查就会绕过：

```typescript
interface Config {
  url: string;
  port: number;
}

// 场景 1：函数返回值
function loadConfig(): Config {
  const raw = { url: 'http://api', port: 8080, secret: 'abc123' };
  return raw; // ✅ 通过中间变量返回，不触发多余属性检查
  // 但 secret 属性被意外暴露
}

// 场景 2：数组展开
const items: Config[] = [
  { url: 'a', port: 1, extra: true },  // ❌ 对象字面量，触发检查
];
const moreItems: Config[] = [{ url: 'b', port: 2 }];
const all = [...moreItems, { url: 'c', port: 3, extra: true }]; // ❌ 字面量触发检查

// 场景 3：类型断言绕过
const cfg = { url: 'http://api', port: 8080, secret: 'abc123' } as Config; // ✅ 断言绕过
```

## 3.4 优化策略

### 3.4.1 Branded Types：用 unique symbol 模拟标称类型

品牌类型（Branded Types）是 TypeScript 中模拟名义类型系统的标准模式。通过在基础类型上交叉一个唯一的"品牌"标记，使得结构相同但语义不同的类型在编译期被区分。

```typescript
// 基础品牌类型模式
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function createOrderId(id: string): OrderId {
  return id as OrderId;
}

function getUser(id: UserId): User { /* ... */ }
function getOrder(id: OrderId): Order { /* ... */ }

const uid = createUserId('user-1');
const oid = createOrderId('ord-123');

getUser(uid);  // ✅
getOrder(oid); // ✅
// getOrder(uid); // ❌ 类型 'UserId' 不能赋值给类型 'OrderId'
```

**使用 `unique symbol` 增强品牌安全性**：字符串字面量品牌（`'UserId'`）在跨模块时可能被伪造。使用 `unique symbol` 可以创建真正唯一的品牌标记：

```typescript
// 使用 unique symbol 创建不可伪造的品牌
declare const UserIdBrand: unique symbol;
declare const OrderIdBrand: unique symbol;

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };
type OrderId = string & { readonly [OrderIdBrand]: typeof OrderIdBrand };

// 工厂函数
function createUserId(id: string): UserId {
  return id as unknown as UserId;
}

function createOrderId(id: string): OrderId {
  return id as unknown as OrderId;
}
```

`unique symbol` 品牌无法在模块外部创建，因为 `UserIdBrand` 和 `OrderIdBrand` 是 `declare` 的且没有对应的运行时值。这提供了最强的编译期安全性。

**数值类型的品牌**：品牌类型同样适用于 `number` 基础类型：

```typescript
type Meters = number & { readonly __brand: 'Meters' };
type Feet = number & { readonly __brand: 'Feet' };

function toMeters(value: number): Meters { return value as Meters; }
function toFeet(value: number): Feet { return value as Feet; }

const distance = toMeters(100);
const height = toFeet(300);

function calculateArea(width: Meters, height: Meters): Meters {
  return (width * height) as Meters;
}

// calculateArea(distance, height); // ❌ Feet 不能赋值给 Meters
```

### 3.4.2 多余属性检查的边界理解

正确理解多余属性检查的触发条件，可以避免"为什么这里报错那里不报错"的困惑：

**触发多余属性检查的场景**：
- 对象字面量直接赋值给类型注解的变量
- 对象字面量作为函数实参传入
- 对象字面量在 `return` 语句中直接返回（函数返回值有类型注解时）
- 对象字面量在类型断言中（`as T` 会绕过，但 `satisfies T` 不会）

**不触发多余属性检查的场景**：
- 通过中间变量赋值
- 通过函数返回值赋值
- 通过类型断言（`as T`）赋值
- 通过展开运算符合并后的结果

```typescript
interface Options {
  url: string;
  method?: 'GET' | 'POST';
}

// 安全模式：使用 satisfies 保留严格检查
function createOptions(): Options satisfies Options {
  return { url: '/api', method: 'GET', extra: true };
  // ❌ satisfies 会触发多余属性检查
}

// 宽松模式：需要接受额外属性时，使用索引签名
interface FlexibleOptions {
  url: string;
  method?: 'GET' | 'POST';
  [key: string]: unknown; // 允许任意额外属性
}
```

### 3.4.3 使用 `type` 而非 `interface` 避免声明合并

`interface` 在 TypeScript 中具有声明合并（Declaration Merging）能力——同名的 `interface` 会自动合并成员。这在某些场景下是特性（如为第三方库扩展类型），但在团队协作中可能成为陷阱：

```typescript
// 文件 A：定义 User 接口
interface User { name: string; }

// 文件 B：无意中声明了同名的 User 接口
interface User { age: number; }

// 结果：User 被合并为 { name: string; age: number; }
// 文件 A 的代码可能因此通过意外的类型检查
```

使用 `type` 别名可以避免这个问题，因为 `type` 不支持声明合并：

```typescript
// 文件 A
type User = { name: string; };

// 文件 B
// type User = { age: number; }; // ❌ 重复标识符错误，编译时即被发现
```

**选择策略**：
- 优先使用 `type` 定义对象类型，除非明确需要声明合并
- 需要声明合并时（如扩展全局类型、增强第三方库类型），使用 `interface`
- 定义公共 API 的类型时，使用 `type` 更安全
- 定义类的契约（implements）时，使用 `interface` 更符合惯例

## 3.5 典型问题

### 3.5.1 接口字段相同但语义不同的类型互相赋值

这是结构类型系统最经典的陷阱。两个接口即使语义完全不同，只要字段名和类型匹配，就可以互相赋值：

```typescript
interface Celsius { value: number; }
interface Fahrenheit { value: number; }

function getTemperature(): Celsius {
  return { value: 25 }; // 25°C
}

function displayFahrenheit(temp: Fahrenheit) {
  console.log(`${temp.value}°F`);
}

const temp = getTemperature();
displayFahrenheit(temp); // ✅ 编译通过！显示 "25°F"，但实际是 25°C
// 运行时：用户看到 25°F，实际温度是 77°F（25°C 的换算值）
```

这种问题在以下场景中尤为常见：
- **单位系统**：温度、长度、重量、货币
- **实体标识**：用户 ID、订单 ID、产品 ID
- **坐标系统**：屏幕坐标 vs 世界坐标、像素 vs 百分比
- **权限模型**：角色名称、权限标识

### 3.5.2 多余属性检查在变量赋值时失效的 3 种场景

**场景 1：通过中间变量传递**

```typescript
interface UserInput {
  username: string;
  password: string;
}

// 直接字面量：严格检查
const input1: UserInput = { username: 'alice', password: '123', role: 'admin' };
// ❌ 报错：'role' 不在类型 'UserInput' 中

// 通过中间变量：宽松检查
const raw = { username: 'alice', password: '123', role: 'admin' };
const input2: UserInput = raw; // ✅ 通过！role 属性被静默忽略
```

**场景 2：通过函数返回值传递**

```typescript
interface Config {
  host: string;
  port: number;
}

function loadRawConfig() {
  return { host: 'localhost', port: 3000, debug: true };
}

const config: Config = loadRawConfig(); // ✅ 通过！debug 属性被忽略
// 但 config.debug 在类型层面不可访问，需要类型断言才能读取
```

**场景 3：通过数组方法或展开运算**

```typescript
interface Item {
  id: number;
  name: string;
}

const items: Item[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b', extra: 'c' }, // ❌ 字面量触发检查
];

// 但通过 map 返回时：
const mapped: Item[] = [1, 2, 3].map((id) => ({
  id,
  name: `item-${id}`,
  extra: 'ignored', // ✅ 通过！map 回调返回值不是直接字面量赋值
}));
```

### 3.5.3 `interface` 声明合并的意外行为

声明合并是 `interface` 独有的特性，但在大型项目中可能造成难以追踪的 bug：

```typescript
// 基础库定义
interface ButtonProps {
  label: string;
  onClick: () => void;
}

// 业务代码中无意合并
interface ButtonProps {
  variant?: 'primary' | 'secondary';
}

// 现在 ButtonProps 是 { label: string; onClick: () => void; variant?: 'primary' | 'secondary' }

// 问题：如果业务代码中的 variant 是拼写错误（本意是 variant 但实际想写的是 size）
// 基础库的 ButtonProps 被"污染"，所有使用 ButtonProps 的地方都多了一个 variant 属性
```

更隐蔽的情况是第三方库的类型增强：

```typescript
// 第三方库：express.d.ts
interface Request {
  body: any;
}

// 自己的类型增强文件
interface Request {
  user?: { id: string; name: string };
}

// 现在 Request 同时有 body 和 user 属性
// 但如果两个文件中的 Request 语义不同（一个是 HTTP 请求，一个是数据库请求）
// 合并后两个模块的类型互相污染
```

## 3.6 开发者技能

### 3.6.1 `unique symbol` 创建品牌类型

`unique symbol` 是 TypeScript 3.7 引入的特性，用于创建不可重复的 symbol 类型。它是品牌类型的最佳实践：

```typescript
// 模式：declare const + unique symbol + 交叉类型
declare const Brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [Brand]: B };

type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;

// 泛型工厂函数
function createBranded<T, B extends string>(value: T, _brand: B): Branded<T, B> {
  return value as unknown as Branded<T, B>;
}

const uid = createBranded('user-1', 'UserId');
const oid = createBranded('ord-123', 'OrderId');
```

**关键要点**：
- `declare const Brand: unique symbol` 只在类型层面存在，无运行时开销
- 品牌类型只在编译期生效，`as unknown as Branded<T, B>` 在运行时是空操作
- 品牌类型应仅在模块边界使用（API 入口/出口），内部实现中可以使用原始类型

### 3.6.2 `type` vs `interface` 的选择策略

| 场景 | 推荐 | 原因 |
|------|------|------|
| 定义对象形状 | `type` | 避免意外声明合并 |
| 定义类的契约 | `interface` | `implements` 语义更清晰 |
| 扩展第三方库类型 | `interface` | 利用声明合并增强类型 |
| 联合类型 / 交叉类型 | `type` | `interface` 不支持 |
| 元组类型 | `type` | `interface` 不支持元组 |
| 公共 API 导出 | `type` | 更安全，消费者不会意外合并 |
| 组件 Props | `type` | React 社区惯例 |

### 6.3 `brand` 属性的命名约定

团队中使用品牌类型时，统一的命名约定可以提升可读性和可维护性：

- **`__brand`**：最常见的命名，双下划线前缀表示"内部/私有"语义
- **`_type`**：部分库（如 `io-ts`）使用的约定
- **`__tag`**：与判别联合的 `kind` 属性区分

```typescript
// 推荐：团队统一使用 __brand
type Email = string & { readonly __brand: 'Email' };
type Phone = string & { readonly __brand: 'Phone' };

// 品牌类型应配合工厂函数使用，禁止直接类型断言
function createEmail(value: string): Email {
  if (!value.includes('@')) throw new Error('Invalid email');
  return value as Email;
}
```

**最佳实践**：
- 品牌类型配合构造函数或工厂函数使用，在创建时验证数据合法性
- 品牌类型只在模块边界使用，内部实现使用原始类型
- 在 ESLint 规则中禁止直接的类型断言到品牌类型，强制使用工厂函数

## 3.7 示例代码

### 3.7.1 Branded Types 模拟标称类型

```typescript
// Branded Types 模拟标称类型
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getOrder(id: OrderId): Order { /* ... */ }

const uid = createUserId('user-1');
// getOrder(uid); // ❌ 类型错误：UserId 不能赋值给 OrderId
```

### 3.7.2 多余属性检查的严格与宽松模式

```typescript
// 多余属性检查
interface Person { name: string; age?: number; }

// 对象字面量：严格模式（多余属性报错）
const p1: Person = { name: 'Alice', age: 30, email: 'a@b.com' }; // ❌

// 变量赋值：宽松模式（不报错）
const data = { name: 'Bob', age: 25, email: 'b@b.com' };
const p2: Person = data; // ✅ 结构兼容即可
```

### 3.7.3 函数类型兼容性

```typescript
// 函数参数逆变与返回值协变
type Animal = { name: string };
type Dog = Animal & { bark(): void };

// 返回值：协变
let f1: () => Animal;
let f2: () => Dog;
f1 = f2; // ✅ 返回 Dog 的函数可以赋值给返回 Animal 的函数

// 参数：逆变
let g1: (x: Dog) => void;
let g2: (x: Animal) => void;
g1 = g2; // ✅ 接受 Animal 的函数可以赋值给接受 Dog 的函数
// g2 = g1; // ❌ 反之不行
```

### 3.7.4 泛型品牌类型工具

```typescript
// 可复用的品牌类型工具
type Brand<T, B extends string> = T & { readonly __brand: B };

type Email = Brand<string, 'Email'>;
type Phone = Brand<string, 'Phone'>;
type Meters = Brand<number, 'Meters'>;
type Seconds = Brand<number, 'Seconds'>;

// 带验证的工厂函数
function createEmail(value: string): Email {
  if (!/@/.test(value)) throw new Error('Invalid email format');
  return value as Email;
}

function createMeters(value: number): Meters {
  if (value < 0) throw new Error('Distance cannot be negative');
  return value as Meters;
}
```

### 3.7.5 声明合并的意外行为

```typescript
// 文件 user.ts
interface Entity {
  id: number;
  createdAt: Date;
}

// 文件 order.ts — 无意中声明同名接口
interface Entity {
  status: 'active' | 'inactive';
}

// 结果：Entity 被合并为 { id: number; createdAt: Date; status: 'active' | 'inactive' }
// 两个文件中的代码都受到影响

// 使用 type 避免此问题
// 文件 user.ts
type Entity2 = { id: number; createdAt: Date; };

// 文件 order.ts
// type Entity2 = { status: 'active' | 'inactive'; }; // ❌ 编译错误：重复标识符
```

## 3.8 总结

结构类型系统是 TypeScript 灵活性的核心来源，也是潜在陷阱的根源。理解其设计哲学——"形状决定兼容性"——是正确使用 TypeScript 类型系统的前提。

**核心要点**：
- 结构类型兼容性遵循"成员多的可以赋值给成员少的"规则，函数类型遵循参数逆变和返回值协变
- 多余属性检查是对象字面量的特殊保护机制，在变量赋值、函数返回值、类型断言中会失效
- 品牌类型（`Branded Types`）是模拟名义类型系统的标准模式，使用 `unique symbol` 或字符串字面量交叉类型实现
- `type` 和 `interface` 的选择直接影响类型安全性——`type` 更安全，`interface` 更灵活
- 在金融计算、权限校验、实体标识等场景中，品牌类型是编译期安全的重要保障

结构类型系统的陷阱并非设计缺陷，而是灵活性带来的必然代价。通过品牌类型、理解多余属性检查的边界、合理选择 `type` 与 `interface`，开发者可以在享受结构类型灵活性的同时，有效规避其潜在风险。
