# 第8章 类型守卫

## 8.1 核心概念

### 控制流分析（Control Flow Analysis）—— TS 是如何"看懂" if/else 的

想象你是一个**侦探**，根据线索逐步缩小嫌疑人的范围。TS 的编译器就是这样一个侦探——它跟踪每个变量在不同代码路径中的类型，在 `if`、`switch`、`&&`、`||`、`try/catch` 等结构中自动"收窄"类型。

```typescript
function detective(value: string | number | boolean) {
  if (typeof value === "string") {
    // 这里 TS 知道 value 是 string
    return value.toUpperCase();
  }

  if (typeof value === "number") {
    // 这里 TS 知道 value 是 number
    return value.toFixed(2);
  }

  // 这里 TS 知道 value 只剩 boolean
  return value ? "yes" : "no";
}
```

TS 的控制流分析是基于**可达性（Reachability）**的——每经过一个条件判断，TS 就排除掉不可能的选项。这就像玩"谁是卧底"：每轮排除一个可能性，最后剩下的就是真相。

### 自定义类型守卫（Type Guards）—— `is` 关键字

`is` 关键字让你**自己告诉 TS 如何收窄类型**。这就像你给海关官员出示**专家鉴定书**——"我以专家的身份告诉你，这个东西是古董"。TS 信任你的鉴定。

```typescript
// 自定义类型守卫的签名：参数名 is 类型
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function process(value: unknown) {
  if (isString(value)) {
    // 这里 value 被收窄为 string
    value.toUpperCase();
  }
}
```

关键点：`value is string` 是返回类型的特殊标注——它不是真的返回一个 boolean，而是告诉 TS"如果返回 true，则 value 的类型是 string"。普通函数返回 `boolean` 不会触发收窄。

```typescript
// 不会收窄类型
function isStringBad(value: unknown): boolean {
  return typeof value === "string";
}

function process(value: unknown) {
  if (isStringBad(value)) {
    // 这里 value 仍然是 unknown！没有收窄
  }
}
```

### 断言函数（Assertion Functions）—— `asserts` 关键字

断言函数比类型守卫更"强硬"——它不是在条件分支中收窄，而是在断言通过后**全局收窄**剩余代码中的类型。这就像法官宣布："我以本庭的名义确认，这个人是成年人"——之后所有人的对话都基于这个事实。

```typescript
function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("Expected string");
  }
}

function process(value: unknown) {
  assertString(value);
  // 这里 value 被全局收窄为 string
  value.toUpperCase(); // 安全
}
```

### 闭包与异步回调中的类型"遗忘"问题

TS 的控制流分析是**基于作用域**的。当你进入一个闭包或异步回调时，TS 会"重置"对变量的类型认知。这是因为闭包捕获的是变量的引用，而变量可能在回调执行前被修改。

```typescript
function processValue(value: string | number) {
  if (typeof value === "string") {
    // 这里 value 是 string

    setTimeout(() => {
      // 这里 value 又变回了 string | number！
      // 因为 TS 不确定 setTimeout 执行时 value 是否被修改
    }, 1000);
  }
}
```

这不是 TS 的 bug，而是一种谨慎的设计——因为在非严格模式下，变量确实可能在异步回调执行前被重新赋值。

---

## 8.2 典型问题与处理

### 问题1：Array.filter 无法自动收窄类型

```typescript
// Bad Code ❌
const values: (string | null)[] = ["hello", null, "world", null];
const strings = values.filter(v => v !== null);
// strings 的类型是 (string | null)[]，不是 string[]！
```

**为什么不好？** `Array.filter` 的 TypeScript 类型签名返回的是原始数组类型的子集——`filter` 不知道你的回调函数起到了类型守卫的作用。

```typescript
// Good Code ✅

// 方案1：使用类型守卫断言
const strings = values.filter((v): v is string => v !== null);
// strings 的类型是 string[]

// 方案2：使用 flatMap
const strings2 = values.flatMap(v => v ?? []);
// strings2 的类型是 string[]

// 方案3：使用 reduce
const strings3 = values.reduce<string[]>((acc, v) => {
  if (v !== null) acc.push(v);
  return acc;
}, []);
```

**为什么好？** 方案1用 `v is string` 告诉 `filter` 这个回调是类型守卫。方案2利用 `flatMap` 和空数组来排除 null。方案3最通用，但最啰嗦。

### 问题2：async 回调中类型丢失

```typescript
// Bad Code ❌
interface User {
  id: number;
  name: string;
}

async function getUser(id: number): Promise<User> {
  return { id, name: "Alice" };
}

async function processUser(id: number) {
  const user: User | null = await getUser(id).catch(() => null);

  if (user !== null) {
    // 这里 user 是 User

    setTimeout(async () => {
      // 这里 user 仍然是 User（好在这个例子里没问题）
      // 但如果 user 是参数传递的，情况不同
    }, 1000);
  }
}
```

但真正的问题是：

```typescript
// Bad Code ❌
function fetchData(): Promise<string | null> {
  return Promise.resolve("data");
}

async function main() {
  const data = await fetchData();

  [1, 2, 3].forEach(async () => {
    // 这里 data 是 string | null，因为 forEach 回调是同步执行的？
    // 不，是因为 TS 对回调中外部变量的类型做保守估计
    // 实际上由于 await，data 已经确定是 string
    // 但 TS 不能确定回调执行时 data 是否被修改
  });
}
```

**为什么不好？** 回调函数中 TS 会"遗忘"外部作用域的收窄结果，因为它无法静态分析回调的执行时机。

```typescript
// Good Code ✅

// 方案1：在回调前赋值给局部常量
async function main() {
  const data = await fetchData();
  const dataConst = data; // const 保证了不会被重新赋值

  [1, 2, 3].forEach(() => {
    // dataConst 的类型是 string | null
    // 至少我们知道它不会变
  });
}

// 方案2：在回调内部重新收窄
async function main() {
  const data = await fetchData();

  [1, 2, 3].forEach(() => {
    if (data !== null) {
      // 这里 data 被收窄为 string
    }
  });
}

// 方案3：使用 for...of 代替 forEach
async function main() {
  const data = await fetchData();

  for (const item of [1, 2, 3]) {
    // 同步循环不会丢失类型信息
    if (data !== null) {
      // data 是 string
    }
  }
}
```

**为什么好？** 方案1使用 `const` 确保变量不会被重新赋值。方案2在回调内部重新收窄。方案3用同步循环代替异步回调，保留类型信息。

### 问题3：switch 中的联合类型穷尽性检查

```typescript
// Bad Code ❌
type Color = "red" | "green" | "blue";

function getHex(color: Color): string {
  switch (color) {
    case "red": return "#FF0000";
    case "green": return "#00FF00";
    // 忘记处理 "blue"
  }
  // 返回 undefined！没有编译错误
}
```

**为什么不好？** 如果忘记处理某个分支，函数可能返回 `undefined`，但编译器不会报错。

```typescript
// Good Code ✅
type Color = "red" | "green" | "blue";

function getHex(color: Color): string {
  switch (color) {
    case "red": return "#FF0000";
    case "green": return "#00FF00";
    case "blue": return "#0000FF";
    default:
      // 穷尽性检查：如果 color 是 never，说明所有分支都已处理
      const _exhaustive: never = color;
      return _exhaustive;
  }
}
```

**为什么好？** `never` 类型的变量只能赋值为 `never` 类型的值。如果 `Color` 增加了新的值（比如 `"yellow"`），`default` 分支中 `color` 就不是 `never`，编译器会报错。这就像"自动门铃"——有新颜色加入时自动提醒你更新所有 switch 分支。

### 问题4：in 操作符的类型守卫

```typescript
// Bad Code ❌
interface Bird { fly(): void; }
interface Fish { swim(): void; }

function move(animal: Bird | Fish) {
  if (typeof animal.fly === "function") { // 错误！
    animal.fly();
  }
}
```

**为什么不好？** 直接访问不存在的属性在类型检查时就报错了——`Fish` 没有 `fly` 属性。

```typescript
// Good Code ✅
interface Bird { fly(): void; }
interface Fish { swim(): void; }

function move(animal: Bird | Fish) {
  if ("fly" in animal) {
    // 这里 animal 被收窄为 Bird
    animal.fly();
  } else {
    // 这里 animal 被收窄为 Fish
    animal.swim();
  }
}
```

**为什么好？** `in` 操作符是 TS 原生支持的类型守卫方式——检查属性名是否存在，而不是访问属性。它不会因为属性不存在而报错。

---

## 8.3 示例代码

### 自定义类型守卫——可复用的工具函数

```typescript
// src/ch08/type-guards.ts
// 可复用的类型守卫集合

/** 检查值是否为非空字符串 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** 检查值是否为数字（排除 NaN） */
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/** 检查值是否为普通对象（非 null、非数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

/** 检查值是否具有特定属性 */
function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isPlainObject(obj) && key in obj;
}

// 使用示例
function processConfig(config: unknown) {
  if (!isPlainObject(config)) {
    throw new Error("Config must be a plain object");
  }

  if (hasProperty(config, "host") && typeof config.host === "string") {
    console.log(`Connecting to ${config.host}`);
  }
}
```

### 断言函数的实际应用

```typescript
// src/ch08/assertions.ts
// 在 API 响应验证中使用断言函数

interface ApiResponse {
  status: "success" | "error";
  data?: unknown;
  message?: string;
}

function assertSuccess(response: ApiResponse): asserts response is ApiResponse & { status: "success"; data: unknown } {
  if (response.status !== "success") {
    throw new Error(`API error: ${response.message ?? "Unknown error"}`);
  }
}

function assertDataIsUser(data: unknown): asserts data is { id: number; name: string } {
  if (typeof data !== "object" || data === null) {
    throw new Error("Data must be an object");
  }
  if (!("id" in data) || typeof (data as any).id !== "number") {
    throw new Error("Data must have a numeric id");
  }
  if (!("name" in data) || typeof (data as any).name !== "string") {
    throw new Error("Data must have a string name");
  }
}

async function fetchUser(id: number) {
  const response: ApiResponse = await fetch(`/api/users/${id}`).then(r => r.json());

  assertSuccess(response);
  // 这里 response.data 的类型是 unknown

  assertDataIsUser(response.data);
  // 这里 response.data 被收窄为 { id: number; name: string }

  console.log(`User: ${response.data.name} (#${response.data.id})`);
}
```

### 判别联合 + 类型守卫的组合

```typescript
// src/ch08/discriminated-guards.ts
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

// 自定义类型守卫：判断是否成功状态
function isSuccess<T>(state: RequestState<T>): state is RequestState<T> & { status: "success"; data: T } {
  return state.status === "success";
}

// 自定义类型守卫：判断是否错误状态
function isError<T>(state: RequestState<T>): state is RequestState<T> & { status: "error"; error: Error } {
  return state.status === "error";
}

function handleState<T>(state: RequestState<T>) {
  if (isSuccess(state)) {
    // 安全访问 data
    console.log(state.data);
  }

  if (isError(state)) {
    // 安全访问 error
    console.error(state.error.message);
  }
}
```

### 解决 Array.filter 类型收窄问题

```typescript
// src/ch08/filter-guard.ts
// 可复用的 filter 类型守卫

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

// 使用
const mixed: (string | number | null | undefined)[] = [
  "hello", 42, null, undefined, "world", 0,
];

const strings = mixed.filter(isString);
// strings: string[]
const numbers = mixed.filter(isNumber);
// numbers: number[]
const defined = mixed.filter(isDefined);
// defined: (string | number)[]
```

---

## 8.4 配置/环境示例

### tsconfig.json 中与类型守卫相关的选项

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    // 必须开启！否则 null/undefined 不会参与联合类型
    // 类型守卫的效果大打折扣

    "noUnusedLocals": true,
    // 配合穷尽性检查使用
    // 如果 _exhaustive 变量未被使用，说明你的 switch 没有 default 分支

    "strict": true
    // 开启所有严格检查，包括控制流分析
  }
}
```

### ESLint 规则增强

```json
{
  "rules": {
    "@typescript-eslint/no-unnecessary-condition": "error",
    // 检查哪些条件判断是多余的（比如已知非 null 的类型还检查 null）

    "@typescript-eslint/strict-boolean-expressions": "error"
    // 强制 boolean 上下文中使用真实的 boolean 值
    // 避免 if(value) 这种隐式转换导致的问题
  }
}
```

---

## 8.5 必须掌握的技能

1. **理解 TS 控制流分析的工作原理**
   - TS 跟踪每个变量在每条代码路径中的类型
   - `if`、`switch`、`&&`、`||`、`??`、`try/catch` 都会触发收窄
   - 收窄基于**可达性**——每经过一个条件判断，排除不可能的选项
   - 注意：闭包和异步回调中，TS 会"遗忘"外部作用域的收窄结果

2. **能编写可复用的自定义类型守卫**
   - 语法：`function guard(value: unknown): value is T`
   - 返回 `boolean`，但用 `is` 关键字标注类型信息
   - 可复用的守卫应该放在工具模块中，如 `utils/guards.ts`
   - 常见守卫：`isDefined`、`isString`、`isNumber`、`isPlainObject`

3. **掌握断言函数的用法（asserts）**
   - 断言函数不返回布尔值，而是抛出错误或通过
   - 通过后全局收窄类型，不需要条件分支
   - 适合：输入验证、API 响应校验、表单数据验证
   - 注意：断言函数必须在函数体内真正检查，否则不安全

4. **解决 Array.filter 的类型收窄问题**
   - `arr.filter(v => v !== null)` 不会自动收窄
   - 用 `arr.filter((v): v is T => condition)` 形式
   - 或者创建可复用的守卫函数传给 filter
   - `flatMap` 和 `reduce` 也是替代方案

5. **使用穷尽性检查确保 switch 覆盖所有分支**
   - 在 `default` 分支中将变量赋值给 `never`
   - 新增联合类型成员时，编译器自动提醒更新所有 switch
   - 这是"使非法状态不可表示"原则的实践

6. **理解 `in` 操作符作为类型守卫的用法**
   - `"property" in obj` 可以收窄联合类型
   - 适合检查对象属性是否存在
   - 注意：`in` 检查属性名，不是属性值——不要用它检查方法
