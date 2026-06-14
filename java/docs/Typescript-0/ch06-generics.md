# 第6章 泛型

## 6.1 核心概念

### 什么是泛型？—— "月饼模具与月饼"的比喻

泛型（Generics）就像是**月饼模具**。模具本身不决定月饼的馅料——你可以用同一个模具做出豆沙月饼、莲蓉月饼、五仁月饼。模具的"形状"（约束）决定了什么样的馅料能放进去，但具体的馅料（类型）由使用的人决定。

```typescript
// 模具（泛型函数）
function makeMooncake<T>(filling: T): { filling: T } {
  return { filling };
}

// 用户决定馅料类型
const redBean = makeMooncake("豆沙");    // 类型是 { filling: string }
const lotus = makeMooncake(100);         // 类型是 { filling: number }
```

没有泛型的话，你只能用 `any` 或者给每种类型单独写一个函数。前者丢失类型安全，后者造成代码爆炸。

### 泛型约束（extends）—— "限定的模具"

`extends` 关键字给泛型加上"门槛"——不是所有类型都能用，只有满足条件的才能用。这就像**只接受甜味馅料的模具**——豆沙可以、莲蓉可以，但是辣椒不行。

```typescript
interface HasLength {
  length: number;
}

// T 必须满足 HasLength 约束
function logLength<T extends HasLength>(item: T): T {
  console.log(item.length);
  return item;
}

logLength("hello");   // OK——string 有 length
logLength([1, 2, 3]); // OK——数组有 length
logLength(42);        // 错误！number 没有 length
```

### 默认泛型—— "默认馅料"

默认泛型就像模具默认生产豆沙月饼，但如果你指定了馅料，就按指定的来。

```typescript
// 默认 T 是 string
function createContainer<T = string>(value?: T): { value: T } {
  return { value: value ?? ("" as any) };
}

const c1 = createContainer();          // { value: string }
const c2 = createContainer(42);        // { value: number }
const c3 = createContainer<boolean>(); // { value: boolean }
```

### 多泛型参数与"联动效应"

多个泛型参数可以互相依赖。想象你有一个**配对机器**——左边放钥匙，右边放锁，它们必须匹配。

```typescript
// K 和 V 有关联：V 是 K 对应的值类型
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: "Alice", age: 30 };
getProperty(user, "name"); // 返回值类型是 string
getProperty(user, "age");  // 返回值类型是 number
getProperty(user, "email"); // 错误！"email" 不是 user 的属性
```

这里 `K extends keyof T` 确保了第二个参数必须是第一个参数的合法属性，而返回值类型自动推导为对应属性的类型。这就是泛型的"联动效应"——一个参数约束另一个参数。

### 泛型在类、接口与箭头函数中的语法细节

**泛型接口：**

```typescript
interface Repository<T> {
  getById(id: string): T | undefined;
  save(item: T): void;
  delete(id: string): void;
}
```

**泛型类：**

```typescript
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }
}
```

**泛型箭头函数（注意 JSX 的坑）：**

在 `.tsx` 文件中，`<T>` 会被 JSX 解析器误认为 HTML 标签的开始。有两种解决方案：

```typescript
// 方案1：在泛型参数后加逗号（推荐）
const identity = <T,>(value: T): T => value;

// 方案2：显式约束
const identity = <T extends unknown>(value: T): T => value;
```

---

## 6.2 典型问题与处理

### 问题1：泛型约束不足导致类型不安全

```typescript
// Bad Code ❌
function getLength<T>(value: T): number {
  return value.length; // 错误！T 可能没有 length
}
```

**为什么不好？** 没有约束的泛型 T 可以是任何类型——number、boolean、null。它们没有 `length` 属性，编译器会报错。

```typescript
// Good Code ✅
interface HasLength {
  length: number;
}

function getLength<T extends HasLength>(value: T): number {
  return value.length; // OK——T 一定有 length
}
```

**为什么好？** `extends HasLength` 告诉编译器：只有具有 `length` 属性的类型才能传入。编译器可以安全地推导。

### 问题2：箭头函数泛型语法错误（与 JSX 冲突）

```typescript
// Bad Code ❌（在 .tsx 文件中）
const identity = <T>(value: T): T => value;
//                  ~~~  JSX 解析器认为这是 HTML 标签的开始
```

**为什么不好？** 在 `.tsx`（TypeScript + JSX）文件中，`<T>` 被解析为 JSX 元素的开始标签，导致语法错误或奇怪的错误信息。

```typescript
// Good Code ✅

// 方案1：逗号技巧（推荐）
const identity = <T,>(value: T): T => value;

// 方案2：extends 约束
const identity2 = <T extends unknown>(value: T): T => value;

// 方案3：使用普通函数（如果不是箭头函数不可替代）
function identity3<T>(value: T): T {
  return value;
}
```

**为什么好？** 逗号 `T,` 告诉解析器这是泛型参数，不是 JSX 标签。`extends unknown` 也达到了同样的效果，而且更清晰地表达了"对 T 没有实际约束"。

### 问题3：泛型类型参数未被使用

```typescript
// Bad Code ❌
function processData<T>(data: unknown): T {
  // 没有用到 T 来约束 data
  return JSON.parse(JSON.stringify(data));
}
```

**为什么不好？** 这里的 `T` 只是返回值类型的"声明"，实际上没有类型安全。调用方以为得到了 `T` 类型，但运行时可能完全不同。

```typescript
// Good Code ✅
function processData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// 或者明确声明风险
function processData<T>(data: T): T {
  // 注意：JSON.parse 返回 any，这里相当于"我保证返回 T"
  return JSON.parse(JSON.stringify(data)) as T;
}
```

**为什么好？** `data: T` 确保了输入和输出类型关联。调用方传入什么类型，就知道返回什么类型。

### 问题4：泛型在条件类型中的分发行为

```typescript
// Bad Code ❌
type ToArray<T> = T[];

type Result = ToArray<string | number>;
// 结果是 (string | number)[]，可能不是你想要的
```

```typescript
// Good Code ✅
type ToArray<T> = T extends unknown ? T[] : never;

type Result = ToArray<string | number>;
// 结果是 string[] | number[] —— 联合类型被"分发"了
```

**为什么好？** 条件类型中的泛型遇到联合类型时会自动分发（Distributive Conditional Types），每个成员独立处理后再联合起来。用 `[T] extends [unknown]` 可以禁用分发。

---

## 6.3 示例代码

### 泛型函数——类型安全的队列

```typescript
// src/ch06/queue.ts
class Queue<T> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  get length(): number {
    return this.items.length;
  }
}

// 使用
const numberQueue = new Queue<number>();
numberQueue.enqueue(1);
numberQueue.enqueue(2);
const first = numberQueue.dequeue(); // 类型是 number | undefined

const stringQueue = new Queue<string>();
stringQueue.enqueue("hello");
// stringQueue.enqueue(42); // 错误！不能把 number 放入 string 队列
```

### 泛型约束——键值提取器

```typescript
// src/ch06/key-extractor.ts
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map(item => item[key]);
}

interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
];

const ids = pluck(users, "id");    // 类型是 number[]
const names = pluck(users, "name"); // 类型是 string[]
// pluck(users, "age"); // 错误！"age" 不是 User 的属性
```

### 泛型与工厂模式

```typescript
// src/ch06/factory.ts
interface Constructor<T> {
  new (...args: any[]): T;
}

function createInstance<T>(ctor: Constructor<T>, ...args: any[]): T {
  return new ctor(...args);
}

class Product {
  constructor(public name: string, public price: number) {}
}

const product = createInstance(Product, "Widget", 29.99);
// product 类型是 Product
```

### 泛型工具类型实现（简化版）

```typescript
// src/ch06/utility-types.ts
// 实现简化版的 Partial
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// 实现简化版的 Pick
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// 实现简化版的 Record
type MyRecord<K extends keyof any, V> = {
  [P in K]: V;
};

// 使用
interface Todo {
  title: string;
  description: string;
  completed: boolean;
}

type PartialTodo = MyPartial<Todo>;
// { title?: string; description?: string; completed?: boolean }
```

---

## 6.4 配置/环境示例

### tsconfig.json 中与泛型相关的选项

```json
{
  "compilerOptions": {
    "strict": true,
    // 开启 strict 会启用 strictNullChecks，
    // 影响泛型中 null/undefined 的处理

    "noUncheckedIndexedAccess": true,
    // 泛型函数返回 T | undefined 时强制检查

    "jsx": "react-jsx",
    // 在 JSX 文件中使用泛型箭头函数时，
    // jsx 编译选项会影响 <T> 的解析
    // 推荐在 .tsx 中用 <T,> 或 <T extends unknown> 语法
  }
}
```

### 在 .tsx 文件中使用泛型的注意事项

```typescript
// 在 React 组件中使用泛型
function List<T,>(items: T[], renderItem: (item: T) => React.ReactNode) {
  return <ul>{items.map(renderItem)}</ul>;
}

// 或者
function List<T extends unknown>(items: T[], renderItem: (item: T) => React.ReactNode) {
  return <ul>{items.map(renderItem)}</ul>;
}
```

---

## 6.5 必须掌握的技能

1. **理解泛型的本质：类型参数化**
   - 泛型是"类型的函数"——输入一个类型，输出基于该类型的新类型
   - 目的是在**不丢失类型信息**的前提下实现代码复用
   - 对比：`any` 丢失类型信息，函数重载导致代码爆炸，泛型是两全之策

2. **会用 `extends` 约束泛型参数**
   - 约束告诉编译器"T 至少有哪些能力"
   - `T extends HasLength` → 可以安全访问 `.length`
   - `K extends keyof T` → K 必须是 T 的属性名
   - 约束越精确，类型越安全，调用方越容易使用

3. **掌握多泛型参数的联动**
   - 一个泛型参数可以约束另一个：`<T, K extends keyof T>`
   - 返回值类型可以依赖输入泛型：`T[K]`
   - 设计泛型 API 时，从**调用者的视角**思考：他们需要写多少类型标注？类型能自动推导吗？

4. **区分泛型在普通函数和箭头函数中的语法**
   - 普通函数：`function foo<T>(x: T): T`
   - 箭头函数（非 .tsx）：`const foo = <T>(x: T): T => x`
   - 箭头函数（.tsx 中）：`const foo = <T,>(x: T): T => x` 或 `const foo = <T extends unknown>(x: T): T => x`
   - 在类中：`class Box<T> { content: T }`
   - 在接口中：`interface Box<T> { content: T }`

5. **理解泛型在条件类型中的分发行为**
   - `T extends U ? X : Y` 中 T 是联合类型时会自动分发
   - 用 `[T] extends [U]` 包裹可以禁用分发
   - 分发是编写复杂工具类型的基石（如 `Exclude<T, U>`、`Extract<T, U>` 的内部实现）

6. **设计泛型 API 时考虑调用者推导体验**
   - 好的泛型 API：调用者不需要显式写类型参数，TS 自动推导
   - 坏的泛型 API：调用者必须写 `<string, number, boolean>` 这种冗长的类型标注
   - 经验法则：如果调用者需要频繁显式指定泛型参数，重新考虑 API 设计
