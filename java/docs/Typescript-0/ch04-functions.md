# 第4章 函数的类型契约

---

## 1. 核心概念

### 参数与返回值的类型约束：给函数装上"安检门"

函数是程序的"入口"和"出口"。TS 的类型系统为函数的入口（参数）和出口（返回值）设置了安检门——你带什么东西进来（参数类型），带什么东西出去（返回值类型），必须提前说清楚。

```typescript
// 基础写法：参数和返回值都标注类型
function add(a: number, b: number): number {
  return a + b;
}
```

从直觉上看，这有点像填写海关申报单——你承诺你带的东西在允许范围内。如果你试图带一把 `string` 进一个只接受 `number` 的门，编译器会在"过安检"时拦住你。

### 可选参数、默认参数与剩余参数

**可选参数（`?`）**：有些参数可传可不传，用问号标记：

```typescript
function greet(name: string, greeting?: string): string {
  return greeting ? `${greeting}, ${name}` : `Hello, ${name}`;
}
```

**默认参数（`= value`）**：给参数一个默认值，不传时使用它：

```typescript
function createUrl(path: string, base: string = "https://api.example.com"): string {
  return `${base}/${path}`;
}
```

**剩余参数（`...`）**：接受不定数量的参数，用数组类型标注：

```typescript
function sum(...numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}
```

**注意事项**：可选参数必须在必需参数之后，默认参数没有这个限制。剩余参数必须是最后一个参数。

### 函数重载（Overloads）：让一个函数拥有多副"面孔"

重载就像同一个演员在不同剧本中扮演不同角色——函数名相同，但根据传入参数的类型和数量，表现出不同的行为。

TS 的重载不是运行时特性（JS 不支持真正的重载），而是**编译时的类型提示**。你需要写多个"签名"（signatures），再加一个实现体：

```typescript
// 重载签名（相当于"剧本"）
function process(x: number): number;
function process(x: string): string;
function process(x: boolean): boolean;

// 实现签名（相当于"后台操作"）
function process(x: any): any {
  if (typeof x === "number") return x * 2;
  if (typeof x === "string") return x.toUpperCase();
  return !x;
}
```

调用时，TS 会根据传入的参数类型匹配最合适的签名。

### 回调函数与 `this` 指向的类型约束

JS 的 `this` 是一个让无数开发者挠头的概念——它的值取决于函数**如何被调用**，而非**在哪里定义**。TS 允许你在函数签名中显式声明 `this` 的类型：

```typescript
interface ButtonConfig {
  text: string;
  onClick(this: HTMLElement, event: MouseEvent): void;
}
```

这里的 `this: HTMLElement` 告诉 TS：当这个回调被调用时，`this` 指向一个 `HTMLElement`。如果你错误地让 `this` 指向了别的东西，TS 会报错。

---

## 2. 典型问题与处理

### 2.1 重载签名顺序导致调用失败

**问题场景**：重载签名的匹配是**从上到下**的。如果把更宽泛的重载放在更具体的重载前面，具体的那一个永远不会被匹配到。

```typescript
// Bad — 更具体的重载（string 数组）放在更宽泛的重载（any 数组）之后
function process(items: any[]): any[];      // 宽泛
function process(items: string[]): string[]; // 具体 — ❌ 永远不会匹配到！
function process(items: any[]): any[] {
  return items.map(item => item);
}

const result = process(["a", "b"]);
// result 的类型是 any[]，而不是 string[] — 因为第一个签名已经匹配了
```

**为什么不好**：TS 按顺序匹配重载签名，第一个匹配的签名就是最终结果。如果把 `any[]` 放在 `string[]` 前面，任何数组参数都会先匹配到 `any[]`，后面的 `string[]` 签名就形同虚设了。

```typescript
// Good — 具体的重载放在前面
function process(items: string[]): string[];
function process(items: number[]): number[];
function process(items: any[]): any[]; // 兜底
function process(items: any[]): any[] {
  return items.map(item => item);
}

const strings = process(["a", "b"]); // ✅ string[]
const numbers = process([1, 2, 3]);  // ✅ number[]
```

**为什么好**：把更具体的重载放在前面，TS 会先尝试精确匹配，匹配失败后再回退到宽泛的兜底签名。这符合直觉——先试"专属通道"，走不通再走"普通通道"。

### 2.2 回调中 `this` 类型丢失

**问题场景**：在回调函数中，`this` 的指向常常不是你期望的对象，尤其是在事件处理或数组方法中。

```typescript
// Bad — 回调中 this 类型丢失
class Counter {
  count = 0;

  start() {
    setInterval(function() {
      this.count++; // ❌ this 指向 global/window，不是 Counter 实例
    }, 1000);
  }
}
```

**为什么不好**：在非箭头函数中，`this` 由调用方式决定。`setInterval` 的回调中的 `this` 指向全局对象（浏览器中是 `window`，Node.js 中是 `global`），而不是 `Counter` 实例。这导致 `this.count` 是 `undefined`。

```typescript
// Good — 使用箭头函数绑定 this
class Counter {
  count = 0;

  start() {
    setInterval(() => {
      this.count++; // ✅ 箭头函数捕获外围 this
    }, 1000);
  }
}

// 或者显式标注 this 参数
class Counter2 {
  count = 0;

  start() {
    setInterval(function(this: Counter2) {
      this.count++; // ✅ 显式声明 this 类型，调用时检查
    }.bind(this), 1000);
  }
}
```

**为什么好**：箭头函数从定义时的作用域捕获 `this`，不存在"运行时 this 丢失"的问题。显式标注 `this` 参数则让编译器检查调用者是否提供了正确的 `this` 上下文。

### 2.3 可选参数与 `undefined` 的微妙差异

```typescript
// Bad — 把可选参数和 undefined 类型混为一谈
function greet(name?: string) {
  // name 类型是 string | undefined
  console.log(name.toUpperCase()); // ❌ 可能为 undefined
}
```

**为什么不好**：可选参数的实际类型是 `T | undefined`，但你不传参数时它就是 `undefined`。直接访问它的属性和方法会触发运行时错误。

```typescript
// Good — 处理可选参数的 undefined 情况
function greet(name?: string) {
  // 方式 1：默认值
  const safeName = name ?? "Guest";
  console.log(safeName.toUpperCase());

  // 方式 2：类型收窄
  if (name) {
    console.log(name.toUpperCase());
  }
}

// 方式 3：参数默认值
function greetBetter(name: string = "Guest") {
  console.log(name.toUpperCase()); // ✅ 永远不会 undefined
}
```

**为什么好**：显式处理 `undefined` 情况，避免运行时崩溃。使用默认参数可以完全消除 `undefined` 的可能性。

---

## 3. 示例代码

```typescript
// ==========================================
// 示例 1：参数与返回值的完整类型标注
// ==========================================

// 具名函数
function calculateTotal(price: number, quantity: number, taxRate: number = 0.1): number {
  const subtotal = price * quantity;
  return subtotal * (1 + taxRate);
}

// 函数表达式
const discount = (price: number, percent: number): number => {
  return price * (1 - percent);
};

// ==========================================
// 示例 2：函数重载 — 数据序列化
// ==========================================

// 重载签名
function serialize(data: string): string;
function serialize(data: number): string;
function serialize(data: boolean): string;
function serialize(data: Date): string;
function serialize(data: { toJSON(): string }): string;

// 实现签名
function serialize(data: any): string {
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (typeof data === "object") {
    return data.toJSON();
  }
  return String(data);
}

// 调用测试
console.log(serialize("hello"));      // "hello"
console.log(serialize(42));            // "42"
console.log(serialize(true));          // "true"
console.log(serialize(new Date()));    // "2026-06-14T..."
console.log(serialize({ toJSON() { return 'custom'; } })); // "custom"

// ==========================================
// 示例 3：回调函数与 this 约束
// ==========================================

interface UIElement {
  // 显式声明 this 类型
  onClick(this: HTMLElement, event: MouseEvent): void;
}

class Button {
  element: HTMLButtonElement;

  constructor(text: string) {
    this.element = document.createElement("button");
    this.element.textContent = text;
  }

  // 正确绑定 this
  attachHandler() {
    this.element.addEventListener("click", function(this: HTMLElement, e: Event) {
      this.style.backgroundColor = "blue"; // ✅ this 是 HTMLElement
    });
  }
}

// ==========================================
// 示例 4：剩余参数与泛型结合
// ==========================================

function mergeObjects<T extends object>(...objects: T[]): T {
  return Object.assign({}, ...objects);
}

const merged = mergeObjects(
  { a: 1 },
  { b: 2 },
  { c: 3 }
);
// merged 类型：{ a: number } & { b: number } & { c: number }

// ==========================================
// 示例 5：可运行测试
// ==========================================

// 定义一个"防抖"函数（带类型安全）
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const log = (message: string) => console.log(message);
const debouncedLog = debounce(log, 300);
debouncedLog("Hello"); // 300ms 后输出 "Hello"
```

---

## 4. 配置/环境示例

### 4.1 tsconfig.json 中与函数相关的配置

```jsonc
{
  "compilerOptions": {
    // 严格模式：启用所有严格检查
    "strict": true,

    // 禁止隐式 any：确保函数参数必须标注类型
    "noImplicitAny": true,

    // 明确返回类型检查：要求函数有明确的返回值
    "noImplicitReturns": true,

    // 未使用的参数报错：避免残留参数
    "noUnusedParameters": true,

    // 启用 this 的类型检查（strict 模式下默认开启）
    "noImplicitThis": true
  }
}
```

### 4.2 使用 `@typescript-eslint` 规范函数写法

```jsonc
// .eslintrc.json
{
  "rules": {
    // 要求在函数上显式标注返回值类型
    "@typescript-eslint/explicit-function-return-type": "warn",

    // 禁止不必要的类型约束
    "@typescript-eslint/no-unnecessary-type-constraint": "error",

    // 强制使用箭头函数作为回调
    "@typescript-eslint/prefer-arrow-callback": "error"
  }
}
```

### 4.3 使用 `ts-reset` 改进数组方法回调的类型

```jsonc
// 安装：npm install @total-typescript/ts-reset
// 在 tsconfig.json 中添加：
{
  "compilerOptions": {
    "types": ["@total-typescript/ts-reset"]
  }
}
```

`ts-reset` 改进了 `Array.filter` 等方法的类型推导，让你在回调中更精确地控制类型收窄。

---

## 5. 必须掌握的技能

### 5.1 函数签名设计的调用者友好原则

好的函数签名应该让调用者一眼就能看出：

1. **需要传什么**（参数名要有意义）
2. **可以传什么**（可选参数要标记 `?`）
3. **会得到什么**（返回值类型要明确）

```typescript
// ❌ 不友好：参数含义模糊
function f(a: string, b?: number, ...c: any[]) {}

// ✅ 友好：参数名清晰，类型精确
function fetchUser(
  userId: string,
  options?: { includePosts?: boolean; cacheTTL?: number }
): Promise<UserProfile>;
```

### 5.2 重载设计要点

| 原则 | 说明 |
|------|------|
| **具体在前，宽泛在后** | 最具体的重载签名写在最前面 |
| **实现签名用 `any`** | 实现签名不对外暴露，类型安全由重载签名保证 |
| **不超过 5 个重载** | 重载太多说明函数职责不单一，应该拆分 |
| **优先用联合类型** | 如果参数差异不大，用联合类型比重载更简洁 |

```typescript
// 优先用联合类型（更简洁）
function format(input: string | number): string;

// 而不是重载（除非行为差异很大）
function format(input: string): string;
function format(input: number): string;
```

### 5.3 回调与 this 的黄金法则

1. **回调优先用箭头函数** — 自动捕获外围 `this`
2. **需要动态 `this` 时显式标注** — 用 `this: Type` 参数声明
3. **避免在回调中直接使用 `this`** — 将 `this` 赋值给变量再使用
4. **开启 `noImplicitThis`** — 让编译器帮你捕获 `this` 相关错误

### 5.4 总结：你必须带走的知识点

1. **参数和返回值是函数的契约** — 明确标注类型，让调用者一目了然。
2. **可选参数 ≠ 默认参数** — 可选参数可能为 `undefined`，需要显式处理；默认参数消除了 `undefined` 问题。
3. **重载签名顺序决定匹配结果** — 具体的签名放在前面，宽泛的签名作为兜底放在最后。
4. **回调的 `this` 要显式约束** — 用箭头函数绑定 `this`，或在签名中用 `this: Type` 声明。
5. **调用者友好优先** — 函数签名是 API 的门面，清晰性比灵活性更重要。
6. **实现签名用 `any`** — 实现签名的类型由重载签名保证，不需要对外暴露精确类型。
7. **剩余参数用数组类型** — `...args: T[]` 或 `...args: [string, number]`。
