# 第5章 联合与交叉

## 5.1 核心概念

### 联合类型（Union Types）—— "或者"的关系

联合类型用 `|` 符号表示"可以是其中一种"。想象你有一个**多合一充电线**——它可以是 USB-C 头、Lightning 头或者 Micro-USB 头，但**同一时刻只能是其中一种**。你要用它给手机充电，得先确认插头类型才知道怎么插。这就是"类型收窄"的本质。

```typescript
type Connector = "usb-c" | "lightning" | "micro-usb";
```

联合类型在数学上对应**联合集（Union Set）**：一个值可以属于 A 集**或** B 集。

### 类型收窄（Narrowing）—— "先确认，再操作"

TS 的编译器会在 `if`、`switch`、`typeof`、`instanceof` 等控制流中自动"收窄"类型。这就像你在超市买水果——你拿了一个东西，先看看它是不是圆的（typeof），再看看它是不是有籽的（instanceof），最后才确定它是橘子还是苹果。

```typescript
function getLength(value: string | string[]) {
  if (typeof value === "string") {
    return value.length;  // 这里 value 是 string
  }
  return value.length;    // 这里 value 是 string[]
}
```

### 判别联合类型（Discriminated Unions）—— 带"标签"的联合

这是 TS 中最强大的建模工具之一。想象你收到一个快递箱，箱子上贴了标签：易碎品、冷藏、普通。你看到标签就知道该怎么处理。判别联合就是每个成员都有一个**字面量类型的共有属性**（discriminant），TS 根据这个属性自动收窄。

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };
```

`kind` 就是判别属性，它的值是字面量类型 `"circle"` | `"rectangle"` | `"triangle"`。当你 `switch(shape.kind)` 时，TS 知道每个 case 里 shape 的具体形状。

### 交叉类型（Intersection Types）—— "并且"的关系

交叉类型用 `&` 符号表示"同时是多种类型"。想象你要找一个**同时会写前端又会写后端的全栈工程师**——这个人必须同时满足两套技能要求。

```typescript
type Frontend = { writeHTML: () => void; writeCSS: () => void };
type Backend = { writeSQL: () => void; manageServer: () => void };
type FullStack = Frontend & Backend;
```

交叉类型在数学上对应**交集（Intersection）**：一个值必须同时满足 A **和** B 的所有属性。

### 结构类型系统与多余属性检查

TypeScript 是**结构类型系统（Structural Type System）**，也叫"鸭子类型"——"如果它走起来像鸭子、叫起来像鸭子，那它就是鸭子"。只要一个对象有需要的属性，就算它声明的是另一个类型，也能通过检查。

```typescript
interface Point {
  x: number;
  y: number;
}
const point = { x: 10, y: 20, z: 30 };
const p: Point = point; // OK——有 x 和 y 就够了
```

但是，当你**直接使用对象字面量**时，TS 会进行**多余属性检查（Excess Property Checking）**：

```typescript
// 错误！对象字面量不能有未知属性
const p: Point = { x: 10, y: 20, z: 30 };
//                    ~~~~~~~~~~~~~~~~~~~~~~~
// 类型 '{ x: number; y: number; z: number }' 不能赋值给类型 'Point'
```

为什么？因为对象字面量通常意味着"我刚刚构造了这个对象"，如果有拼写错误（比如把 `y` 写成 `z`），TS 希望尽早提醒你。而通过变量间接赋值时，TS 认为"这个变量可能来自别处，不一定是拼写错误"。

---

## 5.2 典型问题与处理

### 问题1：联合类型收窄不充分

**问题：** 使用 `typeof` 收窄时，`typeof null` 返回 `"object"`，这是一个经典的 JavaScript 历史遗留 bug。

```typescript
// Bad Code ❌
function getLength(value: string | null): number {
  if (typeof value === "object") {
    // 这里 value 是 null，不是 string！null.length 会崩溃
    return value.length; // 运行时错误！
  }
  return value.length;
}
```

**为什么不好？** `typeof null === "object"` 是 JS 从第一天就有的 bug（1996 年的设计失误），所以用 `typeof` 检查对象类型时，需要**额外排除 null**。

```typescript
// Good Code ✅
function getLength(value: string | null): number {
  if (value === null) {
    return 0;
  }
  // 这里 value 已经被收窄为 string
  return value.length;
}
```

**为什么好？** 直接检查 `null` 是最清晰、最安全的方式。别跟 `typeof` 的坑较劲。

### 问题2：交叉类型的属性冲突导致 never

**问题：** 当两个类型有同名但类型不兼容的属性时，交叉类型会变成 `never`。

```typescript
// Bad Code ❌
interface A {
  value: string;
}
interface B {
  value: number;
}
type C = A & B;
// 这里 C 的 value 类型是 string & number = never
// 意味着你几乎无法创建 C 类型的值
```

**为什么不好？** 编译器悄悄地把冲突属性的类型变成了 `never`，但你很可能没意识到这个交叉类型已经"废了"。

```typescript
// Good Code ✅
interface A {
  value: string;
}
interface B {
  value: string | number; // 兼容 string
}
type C = A & B;
// 现在 C 的 value 类型是 string & (string | number) = string

// 或者用不同属性名避免冲突
interface A2 {
  stringValue: string;
}
interface B2 {
  numberValue: number;
}
type C2 = A2 & B2; // 干净整洁
```

**为什么好？** 设计接口时考虑交叉后的兼容性，或用不同属性名避免冲突。如果需要合并两个有冲突属性的对象，考虑使用工具类型手动处理。

### 问题3：多余属性检查的"陷阱"

```typescript
// Bad Code ❌
interface Options {
  url: string;
  method?: string;
}

function fetchAPI(options: Options) { /* ... */ }

fetchAPI({ url: "/api", methood: "GET" });
//                    ~~~~~~~ 拼写错误没被检查！
```

**为什么不好？** 不对——上面的代码**确实**会报错。但是如果你换成变量：

```typescript
const opts = { url: "/api", methood: "GET" };
fetchAPI(opts); // 不报错！因为 opts 被推断为 { url: string; methood: string }
```

**为什么不好？** 变量绕过了多余属性检查，拼写错误就溜进去了。

```typescript
// Good Code ✅
interface Options {
  url: string;
  method?: string;
}

// 方式1：始终使用对象字面量
fetchAPI({ url: "/api", method: "GET" });

// 方式2：对变量使用类型标注
const opts: Options = { url: "/api", method: "GET" };

// 方式3：利用 satisfies 关键字（TS 4.9+）
const opts2 = { url: "/api", method: "GET" } satisfies Options;
```

**为什么好？** `satisfies` 既检查类型兼容性，又保留了字面量的精确类型——两全其美。

---

## 5.3 示例代码

### 联合类型与类型收窄

```typescript
// src/ch05/narrowing.ts
type Event =
  | { type: "click"; x: number; y: number }
  | { type: "keypress"; key: string; ctrlKey: boolean }
  | { type: "focus"; element: HTMLElement };

function handleEvent(event: Event) {
  switch (event.type) {
    case "click":
      console.log(`Clicked at (${event.x}, ${event.y})`);
      break;
    case "keypress":
      console.log(`Key pressed: ${event.key}, Ctrl: ${event.ctrlKey}`);
      break;
    case "focus":
      console.log(`Focused on:`, event.element);
      break;
  }
}
```

### 判别联合——状态机建模

```typescript
// src/ch05/discriminated-union.ts
// 用判别联合建模异步操作的状态
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function renderState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case "idle":
      return "等待操作...";
    case "loading":
      return "加载中...";
    case "success":
      // 这里能安全访问 state.data
      return `数据: ${JSON.stringify(state.data)}`;
    case "error":
      // 这里能安全访问 state.error
      return `错误: ${state.error.message}`;
  }
}
```

### 交叉类型——Mixin 模式

```typescript
// src/ch05/mixin.ts
type WithTimestamp = { createdAt: Date; updatedAt: Date };
type WithAuthor = { authorId: string; authorName: string };
type WithVersion = { version: number };

type AuditableEntity = WithTimestamp & WithAuthor & WithVersion;

function createEntity(base: Partial<AuditableEntity>): AuditableEntity {
  return {
    createdAt: new Date(),
    updatedAt: new Date(),
    authorId: "unknown",
    authorName: "Anonymous",
    version: 1,
    ...base,
  };
}
```

### 结构类型系统的"鸭子"特性

```typescript
// src/ch05/structural.ts
interface Named {
  name: string;
}

class Person {
  constructor(public name: string) {}
}

function greet(named: Named) {
  console.log(`Hello, ${named.name}!`);
}

greet(new Person("Alice")); // OK——Person 有 name 属性
greet({ name: "Bob", age: 30 }); // OK（通过变量）——有 name 就够了
greet({ name: "Charlie" }); // OK——对象字面量只有 name

// 这就是结构类型系统的威力：不需要显式 implements Named
```

---

## 5.4 配置/环境示例

### tsconfig.json 中与类型收窄相关的选项

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    // 开启后 null/undefined 被纳入类型系统
    // 联合类型才能有效地帮助收窄 null
    // 如果没有这个选项，string | null 会退化成 string | null | undefined
    // 收窄逻辑也会变得混乱

    "noUncheckedIndexedAccess": true,
    // 访问对象索引时，返回值会包含 undefined
    // 强制你收窄后再使用
    // const value = obj[key]; // value 类型是 T | undefined

    "exactOptionalPropertyTypes": true
    // 可选属性不能赋值为 undefined，除非显式声明
  }
}
```

### VSCode 中查看类型收窄的技巧

1. 将鼠标悬停在变量上查看当前收窄后的类型
2. 在 `if` 条件后，观察类型的变化
3. 使用 `// ^?` 注释快速查看类型（需要 TypeScript 插件）

---

## 5.5 必须掌握的技能

1. **用 `typeof`、`instanceof`、`in`、`=== null` 四种方式收窄联合类型**
   - `typeof` 适合原始类型（string、number、boolean），注意 `typeof null` 的陷阱
   - `instanceof` 适合类实例
   - `in` 适合检查对象属性是否存在
   - `=== null` / `=== undefined` 专门排除空值

2. **用判别联合建模复杂业务状态**
   - 核心技巧：共有的字面量属性 + switch/case 自动收窄
   - 适合：状态机、API 响应、表单状态、UI 组件状态
   - 原则："使非法状态不可表示"——如果某个状态组合在业务上不存在，就不要让它在类型中合法

3. **理解结构类型系统和多余属性检查的区别**
   - 结构类型系统（Duck Typing）：只要有需要的属性就兼容
   - 多余属性检查：**只对对象字面量**生效，防止拼写错误
   - 变量赋值会绕过多余属性检查——用 `satisfies` 或显式类型标注来解决

4. **避免交叉类型的属性冲突**
   - 同名属性类型不兼容 → 结果类型是 `never`
   - 用不同属性名或确保兼容性来避免
   - 需要合并对象时，考虑 `Object.assign` 或展开运算符 + 显式类型

5. **模板字面量类型与联合的结合**
   - 模板字面量类型可以生成联合类型
   - `type EventName = \`on${Capitalize<string>}\`;` 需要条件类型配合
   - 基础用法：`type Size = "sm" | "md" | "lg"; type ClassName = \`btn-${Size}\`;` → `"btn-sm" | "btn-md" | "btn-lg"`
