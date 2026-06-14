# 第3章 描述数据的形状：Interface 与 Type

---

## 1. 核心概念

### 接口（Interface）：面向对象的契约

把 **Interface** 想象成一份"劳动合同"——它规定了一方必须提供哪些能力（属性或方法），但不关心具体怎么实现。在 TS 中，接口用来描述对象应有的结构：

```typescript
interface Person {
  name: string;
  age: number;
  greet(): void;
}
```

任何符合这个形状的对象都可以被当作 `Person` 使用——TS 采用的是**结构类型系统**（structural typing），也叫"鸭子类型"：只要长得像鸭子，叫起来像鸭子，那就是鸭子。你不需要显式地 `implements Person`，形状匹配即可。

### 声明合并（Declaration Merging）

这是 `interface` 独有的超能力：**同名的接口会自动合并**。想象你在拼乐高——每个同名的 `interface` 定义都是一块积木，TS 编译器会自动把它们拼在一起：

```typescript
interface User {
  name: string;
}
interface User {
  age: number;
}
// 最终 User 等价于：
// interface User { name: string; age: number; }
```

这听起来很方便，但也是一把双刃剑——后面会讲到它带来的意外覆盖问题。

### 类型别名（Type）：万物皆可组合的瑞士军刀

如果说 `interface` 是一份契约，那 **`type`** 就是一把瑞士军刀。它不仅能描述对象，还能组合原始类型、联合类型、元组、函数签名——几乎任何类型表达式：

```typescript
// 原始类型别名
type ID = string | number;

// 元组
type Point = [number, number];

// 函数签名
type Handler = (event: string) => void;

// 联合类型
type Status = "idle" | "loading" | "success" | "error";

// 交叉类型
type Named = { name: string };
type Aged = { age: number };
type Person = Named & Aged;
```

`type` 的本质是**给一个类型表达式起别名**——它不创建新类型，只是为一个复杂的类型组合起个名字。

---

## 2. 典型问题与处理

### 2.1 声明合并的意外覆盖

**问题场景**：你在项目中定义了一个 `interface Config`，第三方库的声明文件也定义了一个同名的 `interface Config`，两者合并后产生了意料之外的属性冲突。

```typescript
// Bad — 你不小心"污染"了全局类型
interface Window {
  title: string;
}
// 在另一个文件（或第三方库中）：
interface Window {
  title: number; // ❌ 错误：后续属性声明必须属于同一类型
}
```

**为什么不好**：声明合并要求同名属性的类型必须完全一致，否则会报错。在大型项目中，这种"隐形合并"会让你难以追踪 bug 的来源。

```typescript
// Good — 使用 interface 扩展时明确继承关系
interface BaseConfig {
  theme: string;
}
interface ExtendedConfig extends BaseConfig {
  theme: string; // 可以重新声明为更具体的类型，但要兼容
}
```

**为什么好**：使用 `extends` 显式声明继承关系，代码可读性更强，且不会出现意外的全局合并。如果确实需要扩展第三方类型，使用[模块扩充（Module Augmentation）](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation)语法，明确告知读者你在做什么。

### 2.2 交叉类型中同名属性冲突导致 `never`

**问题场景**：用 `type` 做交叉合并时，如果两个类型有同名但类型不同的属性，TS 会尝试求它们的交集，结果往往得到 `never`。

```typescript
// Bad — 交叉类型导致属性变成 never
type A = { value: string };
type B = { value: number };
type C = A & B;
// 此时 C 的 value 类型为 string & number → never

const obj: C = { value: "hello" }; // ❌ 类型错误
```

**为什么不好**：`string & number` 的交集是 `never`——没有任何值能同时是字符串和数字。这种错误通常在不经意间发生，且错误信息对新手不够友好。

```typescript
// Good — 避免同名异构属性的交叉
type A = { value: string };
type B = { count: number }; // 改名，避免冲突
type C = A & B;

const obj: C = { value: "hello", count: 42 }; // ✅ 正常

// 如果确实需要"或"的关系，用联合类型
type D = { value: string | number }; // ✅ 明确表达意图
```

**为什么好**：通过调整属性名避免冲突，或者使用联合类型明确表达"可以是其中一种"，让类型系统按预期工作。

### 2.3 interface extends vs type & 的性能陷阱

```typescript
// Bad — 深层交叉类型拖慢编译器
type A = { a: string };
type B = { b: number };
type C = A & B;
type D = C & { c: boolean };
type E = D & { d: Date };
// 每次 & 都创建一个新的匿名类型，编译器需要重新计算
```

**为什么不好**：每次使用 `&` 都会生成一个新的匿名交叉类型，编译器无法缓存。当交叉深度达到 5 层以上时，类型检查耗时显著增加。这在大型项目中可能导致 IDE 卡顿。

```typescript
// Good — 用 interface extends 代替多层交叉
interface A { a: string; }
interface B extends A { b: number; }
interface C extends B { c: boolean; }
interface D extends C { d: Date; }
// interface 的继承链可以被编译器缓存
```

**为什么好**：`interface extends` 创建的是命名类型，编译器可以缓存中间结果。对于 5 层以上的继承链，`interface` 比 `type &` 快 2-3 倍（数据来源：TS 编译器团队性能报告）。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：接口声明合并的实际应用
// ==========================================

// 场景：为 Express 的 Request 对象扩展自定义属性
interface ExpressRequest {
  userId?: string;
}
interface ExpressRequest {
  traceId: string;
}
// 两个声明合并为一个 ExpressRequest

function handleRequest(req: ExpressRequest) {
  console.log(req.traceId);  // ✅ 来自第二个声明
  console.log(req.userId);   // ✅ 来自第一个声明
}

// ==========================================
// 示例 2：type 的联合与条件类型组合
// ==========================================

type ApiResponse<T> =
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// 使用判别联合收窄类型
function handleResponse(res: ApiResponse<{ id: number }>) {
  if (res.status === "success") {
    console.log(res.data.id); // ✅ 类型收窄后可直接访问 data
  } else {
    console.error(res.message); // ✅ 收窄后可直接访问 message
  }
}

// ==========================================
// 示例 3：interface extends 与 type &
// ==========================================

// interface 继承（推荐用于对象类型）
interface NamedEntity {
  name: string;
  createdAt: Date;
}

interface Employee extends NamedEntity {
  employeeId: number;
  department: string;
}

// type 交叉（适用于非对象类型的组合）
type WithTimestamps = { createdAt: Date; updatedAt: Date };
type WithMetadata = { metadata: Record<string, unknown> };

type LogEntry = WithTimestamps & WithMetadata;

const log: LogEntry = {
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: { source: "api" },
};

// ==========================================
// 示例 4：可运行测试
// ==========================================

// 定义一个既可描述对象又可描述函数的类型
type Logger = {
  (message: string): void;
  level: "info" | "warn" | "error";
};

function createLogger(): Logger {
  const log = ((msg: string) => console.log(msg)) as Logger;
  log.level = "info";
  return log;
}

const logger = createLogger();
logger("hello"); // ✅ 作为函数调用
console.log(logger.level); // ✅ 访问属性
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与类型定义相关的配置

```jsonc
{
  "compilerOptions": {
    // strict 模式下，interface 和 type 都受益于更严格的类型检查
    "strict": true,

    // 禁止隐式 any——强制你为函数参数等定义类型
    "noImplicitAny": true,

    // 允许你在 .ts 文件中使用 .d.ts 中的全局类型声明
    // 当你用 interface 做声明合并扩展全局类型时，这很有用
    "types": ["node", "express"]
  }
}
```

### 4.2 使用全局类型声明文件扩展接口

```typescript
// 文件：src/types/global.d.ts
// 扩展 Express 的 Request 接口，添加自定义属性

import "express";

declare module "express" {
  interface Request {
    currentUser?: {
      id: string;
      role: "admin" | "user";
    };
  }
}
```

### 4.3 使用 ESLint 强制接口命名规范

```jsonc
// .eslintrc.json
{
  "rules": {
    // 强制接口名以 I 开头（某些团队规范）
    "@typescript-eslint/naming-convention": [
      "error",
      {
        "selector": "interface",
        "format": ["PascalCase"],
        "prefix": ["I"]
      }
    ],
    // 禁止使用同名的 interface 声明合并（防止意外覆盖）
    "@typescript-eslint/no-redeclare": "error"
  }
}
```

---

## 5. 必须掌握的技能

### 5.1 核心选型原则：interface vs type

| 场景 | 推荐 | 原因 |
|------|------|------|
| 描述对象/类的形状 | `interface` | 性能更好、声明可合并、报错信息更清晰 |
| 组合原始类型/联合类型 | `type` | `interface` 无法表达非对象类型 |
| 定义元组 | `type` | `type Tuple = [string, number]` |
| 定义函数签名 | 两者均可 | 但 `type` 更简洁：`type Fn = (x: T) => U` |
| 需要声明合并 | `interface` | `type` 不支持声明合并 |
| 开源库的公共 API | `interface` | 用户可以通过声明合并扩展你的类型 |
| 内部工具类型 | `type` | 灵活、表达力强 |

### 5.2 企业级选型规范（推荐）

```typescript
// ✅ 推荐：公共 API 用 interface
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// ✅ 推荐：内部类型用 type
type UserStatus = "active" | "inactive" | "banned";
type UserMap = Map<string, UserProfile>;
type PartialProfile = Partial<UserProfile>;

// ✅ 推荐：组件 Props 用 interface（可扩展性）
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

// ✅ 推荐：联合/交叉类型用 type
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };
```

### 5.3 总结：你必须带走的知识点

1. **`interface` 是契约**：最适合描述对象和类的形状，支持声明合并，编译器性能更好。
2. **`type` 是别名**：可以表达任何类型组合（联合、交叉、元组、函数），灵活但不可合并。
3. **声明合并是双刃剑**：适合扩展第三方库的类型，但要警惕意外的全局污染。
4. **`extends` vs `&`**：对象类型优先用 `extends`（性能好）；非对象类型或需要组合多种类型时用 `&`。
5. **同名异构属性 → `never`**：交叉类型中同名但类型不同的属性会变成 `never`，小心这种"隐形陷阱"。
6. **企业级规范**：公共 API 用 `interface` 方便用户扩展，内部工具类型用 `type` 追求灵活。
7. **根据场景选择**：没有绝对的好坏，只有是否适合当前场景。
