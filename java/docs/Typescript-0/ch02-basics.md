# 第 2 章：基础类型与类型推导

## 1. 核心概念

### 类型是"值的集合"

在 TypeScript 中，一个类型就是**一组可能的值**的集合：

```typescript
// boolean 类型 = { true, false } —— 2 个值
// number 类型 = 所有数字 —— 无穷多个值
// "hello" 类型 = { "hello" } —— 1 个值（字面量类型）
```

理解这一点很重要：当你写 `let x: number`，你是在说"x 可以是任何数字"。当你写 `const x = "hello" as const`，你是在说"x 只能是 'hello' 这个字符串"。

### 类型推导（Type Inference）

TypeScript 不需要你告诉它显而易见的事情。它自己会推导：

```typescript
let count = 42;        // 推导为 number
let name = "Alice";    // 推导为 string
let isDone = false;    // 推导为 boolean
let items = [1, 2, 3]; // 推导为 number[]
```

**老手很少写 `: string`、`: number`**，因为这些是"废话"——变量初始值已经告诉了编译器一切。显式注解只用在三个地方：

1. 函数参数和返回值（这是"契约"）
2. 变量声明时没有初始值
3. 需要比推导更宽或更窄的类型

```typescript
// ✅ 函数参数和返回值：必须注解（这是对外契约）
function add(a: number, b: number): number {
  return a + b;
}

// ✅ 声明时无初始值：必须注解
let data: string[];

// ✅ 需要比推导更宽的类型
const ids: (string | number)[] = [1, 2, "three"];

// ❌ 不必要：初始值已经说了类型
const message: string = "Hello";
```

---

## 2. 原始类型与复合类型

### 原始类型

```typescript
// 字符串
let title: string = "TypeScript Handbook";
let template: string = `Hello, ${title}`;

// 数字（整数、浮点数、NaN、Infinity 都是 number）
let count: number = 42;
let price: number = 19.99;
let notANumber: number = NaN;       // 是的，NaN 也是 number 类型
let infinity: number = Infinity;    // Infinity 也是 number

// 布尔
let isActive: boolean = true;
let isComplete: boolean = false;

// BigInt（ES2020+，处理超大整数）
let big: bigint = 9007199254740991n;

// Symbol（唯一标识符）
let sym: symbol = Symbol("unique");
```

### 数组

```typescript
// 两种写法等价
let nums1: number[] = [1, 2, 3];
let nums2: Array<number> = [1, 2, 3];

// 只读数组
let readonlyNums: readonly number[] = [1, 2, 3];
// readonlyNums.push(4); // ❌ 只读数组不能修改
```

### 元组（Tuple）

元组是**长度固定、每个位置类型已知**的数组：

```typescript
// 元组：精确控制每个位置的类型
let user: [string, number, boolean] = ["Alice", 30, true];

// 访问
user[0]; // string "Alice"
user[1]; // number 30

// 解构
const [name, age, active] = user;
//    ^string  ^number  ^boolean
```

**元组 vs 数组**：

```typescript
// 数组：任意数量，所有元素类型相同
let scores: number[] = [95, 87, 92];          // 可以 0 个、5 个、100 个

// 元组：固定数量，每个位置类型可能不同
let apiResponse: [number, string, object] = [200, "OK", { data: [] }];
```

**实际应用场景**：React 的 `useState` 返回的就是元组：

```typescript
// useState 返回 [T, Dispatch<SetStateAction<T>>] 元组
const [count, setCount] = useState(0);
//    ^number  ^函数
```

### 可选元素与剩余元素（TS 4.0+）

```typescript
// 可选元素
let tuple: [string, number?] = ["hello"];     // 可以
let tuple2: [string, number?] = ["hello", 42]; // 也可以

// 剩余元素
let stringNums: [string, ...number[]] = ["first", 1, 2, 3];
```

---

## 3. 类型推导进阶

### 最佳通用类型（Best Common Type）

当从多个元素推导数组类型时，TS 会找"最佳通用类型"：

```typescript
// 推导为 (string | number)[]
let arr = [1, "two", 3]; // 没有"公共父类型"（除了 unknown/any）

// 推导为 (Animal | Dog)[]
class Animal {}
class Dog extends Animal {}
let pets = [new Animal(), new Dog()]; // TS 会找最近的共同父类
```

### 上下文类型（Contextual Typing）

类型信息可以从"上下文"推导：

```typescript
// 事件处理器 —— 参数 e 的类型由 addEventListener 的签名推导
document.addEventListener("click", function (e) {
  // e 自动推导为 MouseEvent
  console.log(e.clientX, e.clientY);
});

// 数组方法 —— 回调参数自动推导
[1, 2, 3].map((item, index) => {
  // item: number, index: number
  return item * 2;
});
```

---

## 4. 字面量类型与 `as const`

### 字面量类型

字面量类型就是"具体的值作为类型"：

```typescript
let specificString: "hello" = "hello";
// specificString = "world"; // ❌ 不能赋值 "world"

let specificNumber: 42 = 42;
// specificNumber = 43; // ❌

let specificBoolean: true = true;
// specificBoolean = false; // ❌
```

### 实际应用：联合字面量类型

```typescript
// 精确控制可选值
type Direction = "up" | "down" | "left" | "right";

function move(direction: Direction): void {
  console.log(`Moving ${direction}`);
}

move("up");    // ✅
move("left");  // ✅
// move("back"); // ❌ 类型不匹配

type HttpStatus = 200 | 201 | 204 | 400 | 401 | 500;
```

### `as const` 的魔法

`as const` 告诉 TypeScript："这个值不会变，请用最精确的类型推断"。

```typescript
// 没有 as const —— TS 推导为 string[]
const colors1 = ["red", "green", "blue"];
// colors1 的类型: string[]
// 你可以 push 任何字符串进去

// 有 as const —— TS 推导为 readonly ["red", "green", "blue"]
const colors2 = ["red", "green", "blue"] as const;
// colors2 的类型: readonly ["red", "green", "blue"]
// 精确到每个元素的具体值
```

**更实用的例子**：

```typescript
// ❌ 没有 as const —— 类型丢失
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
};
// config 的类型: { apiUrl: string; timeout: number }
// 具体值 "https://api.example.com" 和 5000 丢失了

// ✅ 有 as const —— 保留精确值
const config2 = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
} as const;
// config2 的类型: {
//   readonly apiUrl: "https://api.example.com";
//   readonly timeout: 5000;
// }
```

**为什么需要 `as const`？** 联合类型需要具体值：

```typescript
// ❌ 报错
const directions = ["up", "down", "left", "right"];
// 类型: string[]
type Direction = (typeof directions)[number]; // string —— 太宽了

// ✅ 正确
const directions = ["up", "down", "left", "right"] as const;
// 类型: readonly ["up", "down", "left", "right"]
type Direction = (typeof directions)[number]; // "up" | "down" | "left" | "right" —— 精确！
```

---

## 5. 四大"虚空"类型辨析

### any / unknown / void / never 对比

| 类型 | 含义 | 可以赋什么值？ | 可以做什么操作？ | 使用场景 |
|------|------|----------------|------------------|----------|
| **any** | "我放弃类型检查" | 任何值 | 任何操作（无限制） | 迁移旧 JS 项目、临时绕过 |
| **unknown** | "我不知道是什么类型" | 任何值 | 必须先收窄才能操作 | 外部数据（API 响应、JSON.parse） |
| **void** | "没有返回值" | `undefined`（或 `null` 关 strict） | 不能做任何操作 | 函数不返回有意义的值 |
| **never** | "永远不会发生" | 无（无法赋值） | 无（不可能操作） | 不可能的分支、总是抛出异常的函数 |

### 详细讲解

#### any —— "核按钮"

```typescript
let value: any = 42;
value = "hello";      // ✅
value = true;         // ✅
value.toUpperCase();  // ✅ 运行时可能炸，但编译器不管
value.nonexistent();  // ✅ 编译器也不管
```

**什么时候该用 any？** 几乎从不。唯一合理的场景：

- 迁移旧 JS 项目时临时标记（最终要替换掉）
- 和一些动态性极强的 JS 库交互（作为最后手段）

#### unknown —— "类型安全的 any"

```typescript
let value: unknown = "hello";

// 不能直接操作
// value.toUpperCase(); // ❌ 报错：类型 unknown

// 必须先收窄
if (typeof value === "string") {
  value.toUpperCase(); // ✅ 收窄为 string 后可操作
}
```

**处理外部数据的最佳实践**：

```typescript
// Bad ❌ — 用 any 处理 API 数据
async function fetchUser(): Promise<any> {
  const res = await fetch("/api/user");
  return res.json();
}
const user = await fetchUser();
console.log(user.name.toUpperCase()); // 运行时可能炸

// Good ✅ — 用 unknown + 验证
async function fetchUser(): Promise<unknown> {
  const res = await fetch("/api/user");
  return res.json();
}

function isUser(data: unknown): data is { name: string; age: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    "name" in data &&
    typeof (data as any).name === "string"
  );
}

const raw = await fetchUser();
if (isUser(raw)) {
  console.log(raw.name.toUpperCase()); // ✅ 安全
}
```

#### void —— "你不需要关心返回值"

```typescript
function log(message: string): void {
  console.log(message);
  // 没有 return 语句，或者 return undefined
}

const result = log("hello"); // result 的类型是 void
```

注意：`void` 不意味着"函数不能有返回值"，而是"调用方不应该依赖返回值"。

```typescript
// 这也是合法的 void 函数
function logAndReturn(message: string): void {
  console.log(message);
  return "done"; // ❌ 报错？不，实际上不会 —— void 函数可以返回，但调用方忽略
}
// 实际上 TypeScript 对 void 的理解是"返回值会被忽略"
```

#### never —— "不可能"

```typescript
// 总是抛出异常的函数
function throwError(message: string): never {
  throw new Error(message);
}

// 无限循环（不会正常结束）
function infiniteLoop(): never {
  while (true) {}
}

// exhaustive check —— 确保所有 case 都被覆盖
type Shape = "circle" | "square" | "triangle";

function area(shape: Shape): number {
  switch (shape) {
    case "circle": return 1;
    case "square": return 2;
    case "triangle": return 3;
    default:
      // 如果上面有未覆盖的 case，这里编译报错
      const _exhaustive: never = shape;
      return _exhaustive;
  }
}
```

---

## 6. 典型问题与处理

### 问题一：误用 any 导致类型安全完全失效

```typescript
// Bad ❌ — any 传染
function parseConfig(data: any) {
  return {
    url: data.apiUrl,       // any
    timeout: data.timeout,  // any
    retries: data.retries,  // any
  };
}

const config = parseConfig(someData);
config.url(); // 运行时错误：url 是字符串不是函数，但编译器不会发现
```

```typescript
// Good ✅ — 明确定义类型
interface Config {
  url: string;
  timeout: number;
  retries: number;
}

function parseConfig(data: unknown): Config {
  if (
    typeof data !== "object" ||
    data === null ||
    !("apiUrl" in data) ||
    !("timeout" in data) ||
    !("retries" in data)
  ) {
    throw new Error("Invalid config");
  }

  const d = data as Record<string, unknown>;

  return {
    url: String(d.apiUrl ?? ""),
    timeout: Number(d.timeout ?? 5000),
    retries: Number(d.retries ?? 3),
  };
}

const config = parseConfig(someData);
config.url(); // ❌ 编译报错：string 不是函数 —— 在编译期就发现了！
```

### 问题二：使用 unknown + 类型收窄

```typescript
// Bad ❌ — 直接用 any
function processInput(input: any) {
  if (input.length > 0) {
    return input.map((x: any) => x * 2);
  }
  return [];
}
// 问题：没有检查 input 是否有 length 属性，也没有检查是否可遍历
```

```typescript
// Good ✅ — 逐步收窄
function processInput(input: unknown): number[] {
  // 第一步：检查是否是数组
  if (!Array.isArray(input)) {
    return [];
  }

  // 第二步：检查元素是否都是数字
  if (!input.every((item): item is number => typeof item === "number")) {
    return [];
  }

  // 此时 input 的类型已收窄为 number[]
  return input.map((x) => x * 2);
}

console.log(processInput([1, 2, 3]));     // [2, 4, 6]
console.log(processInput("hello"));        // [] —— 安全
console.log(processInput([1, "x", 3]));    // [] —— 安全
```

### 问题三：类型断言滥用

```typescript
// Bad ❌ — 用 as 绕过类型检查
const form = document.getElementById("my-form") as HTMLFormElement;
form.submit(); // 运行时：如果 ID 不存在，form 为 null，炸了
```

```typescript
// Good ✅ — 先检查存在性
const form = document.getElementById("my-form");
if (form instanceof HTMLFormElement) {
  form.submit(); // ✅ 安全
} else {
  console.error("Form element not found");
}
```

---

## 7. 示例代码：完整可运行

```typescript
// demo-basics.ts
// 运行：npx tsx demo-basics.ts

// === 原始类型推导 ===
const name = "TypeScript";
const version = 5.4;
const isAwesome = true;
console.log(`${name} v${version}, Awesome: ${isAwesome}`);

// === 元组 ===
type User = [string, number, boolean];
const user: User = ["Alice", 30, true];
const [uName, uAge, uActive] = user;
console.log(`User: ${uName}, ${uAge}, Active: ${uActive}`);

// === 字面量类型 ===
type Status = "pending" | "active" | "inactive";
function getStatusMessage(status: Status): string {
  switch (status) {
    case "pending":
      return "等待中...";
    case "active":
      return "运行中";
    case "inactive":
      return "已停用";
  }
}
console.log(getStatusMessage("active"));

// === as const 应用 ===
const ROLES = ["admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "editor" | "viewer"

function checkPermission(role: Role): string {
  if (role === "admin") return "Full access";
  if (role === "editor") return "Edit access";
  return "Read only";
}
console.log(checkPermission("editor"));

// === unknown + 类型收窄 ===
function safeParse(input: string): unknown {
  return JSON.parse(input);
}

interface ApiResponse {
  success: boolean;
  data: Record<string, unknown>;
}

function isApiResponse(obj: unknown): obj is ApiResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "success" in obj &&
    typeof (obj as Record<string, unknown>).success === "boolean"
  );
}

const raw = safeParse('{"success": true, "data": {"id": 1}}');
if (isApiResponse(raw)) {
  console.log(`API success: ${raw.success}`);
}

// === never 的应用：穷举检查 ===
type Color = "red" | "green" | "blue";

function getHexColor(color: Color): string {
  switch (color) {
    case "red":
      return "#FF0000";
    case "green":
      return "#00FF00";
    case "blue":
      return "#0000FF";
    default:
      // 如果上面没有覆盖所有 Color，这里会报错
      const exhaustive: never = color;
      throw new Error(`Unhandled color: ${exhaustive}`);
  }
}

console.log(getHexColor("green"));
```

---

## 8. 配置/环境示例

本章不需要特殊配置，只需最基本的 `tsconfig.json`：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"]
}
```

运行本章示例：

```bash
# 安装 tsx（一次性）
npm install -g tsx

# 直接运行
tsx demo-basics.ts
```

---

## 9. 必须掌握的技能

完成本章后，你应该：

1. **能区分什么时候写类型注解、什么时候靠推导**：函数签名必须注解，局部变量优先推导
2. **能精确定义数组和元组**：知道 `number[]` 和 `[number, string]` 的区别
3. **能使用字面量类型 + `as const`**：创建精确的联合类型，避免 `string` 类型过宽
4. **能辨析 any / unknown / void / never**：知道每个的用途和适用场景
5. **能用 unknown + 类型收窄处理外部数据**：而不是直接用 any 放弃检查
6. **能用穷举检查（never）确保 switch 全覆盖**

---

> **上一章**：[第 1 章：环境搭建与第一次编译](./ch01-setup.md)
