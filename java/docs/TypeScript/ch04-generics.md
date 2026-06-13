# 第四章：泛型与类型约束

泛型是 TypeScript 类型系统的核心抽象机制，它允许我们在定义函数、类或接口时暂不指定具体类型，而是通过类型参数在使用时再确定。这种延迟绑定的能力使得代码在保持类型安全的同时具备高度的可复用性。本章将深入探讨泛型的设计原理、约束机制、变体行为以及工程实践中的优化策略。

---

## 4.1 泛型的基本概念与语法

### 4.1.1 类型参数的本质

泛型的核心是类型参数（Type Parameter）。与函数参数接受值类似，类型参数接受类型。当我们编写 `function identity<T>(arg: T): T` 时，`T` 就是一个类型参数，它在函数被调用时由编译器根据实际传入的参数类型自动推导填充。

```typescript
// 最基本的泛型函数
function identity<T>(arg: T): T {
  return arg;
}

// 显式指定类型参数
const result1 = identity<string>('hello');

// 类型推导
const result2 = identity(42); // result2 的类型为 number
```

类型参数可以出现在函数签名、类定义、接口定义和类型别名中，它们共同构成了 TypeScript 泛型系统的四大载体。

### 4.1.2 多类型参数与命名约定

当需要多个类型参数时，TypeScript 社区形成了一套约定俗成的命名规则：

- `T`（Type）：最通用的类型参数
- `K`（Key）：对象的键类型
- `V`（Value）：对象的值类型
- `P`（Property）：属性类型
- `R`（Return）：返回值类型
- `E`（Element）：元素类型（常用于数组）
- `N`（Number）：数值类型

```typescript
// 多类型参数：字典映射
class Dictionary<K extends string, V> {
  private data: Record<K, V> = {} as Record<K, V>;

  get(key: K): V | undefined {
    return this.data[key];
  }

  set(key: K, value: V): void {
    this.data[key] = value;
  }
}

// 使用
const dict = new Dictionary<string, number>();
dict.set('age', 25);
```

---

## 4.2 extends 约束：限定类型参数的范围

### 4.2.1 基本约束语法

没有约束的泛型参数可以接受任何类型，这在某些场景下过于宽泛。通过 `extends` 关键字，我们可以限定类型参数必须满足某个条件——即类型参数必须是某个特定类型的子类型。

```typescript
// 约束 T 必须具有 length 属性
function logLength<T extends { length: number }>(arg: T): number {
  return arg.length;
}

logLength('hello');     // ✅ string 有 length
logLength([1, 2, 3]);   // ✅ array 有 length
logLength({ length: 10 }); // ✅ 对象有 length
// logLength(42);       // ❌ number 没有 length
```

### 4.2.2 约束与条件类型的结合

`extends` 在泛型约束和条件类型中都有出现，但语义不同。在约束中，它表示"必须是某个类型的子类型"；在条件类型中，它表示"是否可以赋值给某个类型"。

```typescript
// 约束：T 必须是 { length: number } 的子类型
function constrained<T extends { length: number }>(x: T): void {}

// 条件类型：判断 T 是否可以赋值给 string
type IsString<T> = T extends string ? true : false;
```

### 4.2.3 多层约束与交叉类型

当需要同时满足多个约束条件时，可以使用交叉类型（Intersection Type）组合多个约束：

```typescript
interface HasName {
  name: string;
}

interface HasAge {
  age: number;
}

// 多层约束：T 必须同时具有 name 和 age
function describe<T extends HasName & HasAge>(obj: T): string {
  return `${obj.name} is ${obj.age} years old`;
}

describe({ name: 'Alice', age: 30 }); // ✅
```

---

## 4.3 泛型默认值与实际应用

### 4.3.1 默认类型参数

与函数参数可以有默认值类似，类型参数也可以指定默认类型。当调用方未显式指定且编译器无法推导时，将使用默认类型。

```typescript
// 带默认值的泛型
interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

// 使用默认类型
const response1: ApiResponse = {
  code: 200,
  data: { id: 1 }, // data 为 unknown
  message: 'ok',
};

// 指定具体类型
const response2: ApiResponse<{ id: number; name: string }> = {
  code: 200,
  data: { id: 1, name: 'Alice' },
  message: 'ok',
};
```

### 4.3.2 默认值依赖关系

类型参数的默认值可以依赖前面的类型参数，但不能依赖后面的：

```typescript
// ✅ 正确：第二个参数的默认值依赖第一个
function createMap<K extends string, V = number>(key: K, value?: V): Map<K, V> {
  return new Map([[key, value ?? 0 as V]]);
}

// ❌ 错误：不能依赖后面的参数
// function bad<T = U, U = string>(): void {}
```

---

## 4.4 逆变与协变：类型安全的基石

### 4.4.1 变体的基本概念

变体（Variance）描述了复合类型中类型参数之间的子类型关系如何传递。这是泛型类型安全的核心理论，也是许多难以理解的类型错误的根源。

- **协变（Covariance）**：`A extends B` 则 `Container<A> extends Container<B>`
- **逆变（Contravariance）**：`A extends B` 则 `Container<B> extends Container<A>`
- **不变（Invariance）**：`Container<A>` 与 `Container<B>` 没有子类型关系

### 4.4.2 TypeScript 中的变体规则

TypeScript 的结构类型系统使得变体规则比名义类型系统更灵活：

```typescript
// 数组是协变的
type Animal = { name: string };
type Dog = Animal & { bark(): void };

const dogs: Dog[] = [];
const animals: Animal[] = dogs; // ✅ 数组协变

// 函数参数是逆变的（strictFunctionTypes 模式下）
type AnimalHandler = (animal: Animal) => void;
type DogHandler = (dog: Dog) => void;

let handler1: AnimalHandler = (a: Animal) => console.log(a.name);
let handler2: DogHandler = handler1; // ✅ 函数参数逆变

// 函数返回值是协变的
type Getter<T> = () => T;
const getDog: Getter<Dog> = () => ({ name: 'Fido', bark() {} });
const getAnimal: Getter<Animal> = getDog; // ✅ 返回值协变
```

### 4.4.3 函数参数逆变的实际意义

函数参数逆变的直觉理解是：如果一个函数能处理所有动物，那么它当然也能处理狗（因为狗是动物的一种）。反过来，一个只能处理狗的函数不能安全地处理所有动物。

```typescript
// 逆变的安全场景
type EventHandler<T> = (event: T) => void;

// 能处理所有事件的处理器
const handleAllEvents: EventHandler<Event> = (e) => {
  console.log(e.type, e.target);
};

// 可以赋值给更具体的事件处理器
const handleClick: EventHandler<MouseEvent> = handleAllEvents; // ✅

// 反过来不行
const handleOnlyClick: EventHandler<MouseEvent> = (e) => {
  console.log(e.clientX, e.clientY);
};
// const handleAll: EventHandler<Event> = handleOnlyClick; // ❌
```

### 4.4.4 变体标注（TS 4.7+）

TypeScript 4.7 引入了显式的变体标注，允许在泛型类型上声明变体：

```typescript
// 协变标注
interface Producer<out T> {
  produce(): T;
}

// 逆变标注
interface Consumer<in T> {
  consume(value: T): void;
}

// 不变（默认）
interface Container<T> {
  get(): T;
  set(value: T): void;
}
```

---

## 4.5 泛型推导的陷阱与 NoInfer

### 4.5.1 推导失败退化为 unknown

当 TypeScript 无法从使用上下文中推导出类型参数时，它会退化为 `unknown`（在 strict 模式下）或 `{}`：

```typescript
// 推导失败
function process<T>(data: T): T {
  return data;
}

// 没有提供任何推导线索
const result = process(undefined as unknown);
// result 的类型为 unknown
```

### 4.5.2 不期望的推导

有时 TypeScript 的推导过于"热心"，推导出的类型并非开发者所愿：

```typescript
// 问题：第二个参数不应参与推导
function createPair<T>(first: T, second: T): [T, T] {
  return [first, second];
}

// 期望推导为 [string, string]
// 实际推导为 [string, number] 的联合
const pair = createPair('hello', 42);
// pair 的类型为 [string | number, string | number]
```

### 4.5.3 NoInfer（TS 5.4+）

TypeScript 5.4 引入了 `NoInfer<T>` 工具类型，用于显式阻止类型推导：

```typescript
// 使用 NoInfer 阻止第二个参数参与推导
function createPair<T>(first: T, second: NoInfer<T>): [T, T] {
  return [first, second];
}

const pair = createPair('hello', 42);
// ❌ 错误：'number' 不能赋值给 'string'
```

`NoInfer` 的典型应用场景包括：

```typescript
// 1. 配置对象中的部分字段不参与推导
function createConfig<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<NoInfer<T>>
): T {
  return { ...defaults, ...overrides };
}

// 2. 回调参数类型由其他参数决定
function fetchData<T>(
  url: string,
  transform: (data: unknown) => NoInfer<T>
): Promise<T> {
  return fetch(url).then(r => r.json()).then(transform);
}
```

---

## 4.6 泛型约束设计原则

### 4.6.1 最小约束原则

泛型约束应该尽可能小——只约束必要的部分，给调用方最大的自由度：

```typescript
// ❌ 过度约束
function saveToDatabase<T extends { id: number; name: string; createdAt: Date }>(
  entity: T
): void {}

// ✅ 最小约束
interface Identifiable {
  id: number;
}

function saveToDatabase<T extends Identifiable>(entity: T): void {}
```

### 4.6.2 约束的粒度控制

当需要访问对象的多个属性时，考虑使用索引访问类型而不是列出所有属性：

```typescript
// ❌ 列出所有需要的属性
function processItem<T extends { id: number; name: string; price: number }>(
  item: T
): void {}

// ✅ 使用接口组合
interface HasId { id: number; }
interface HasName { name: string; }
interface HasPrice { price: number; }

function processItem<T extends HasId & HasName & HasPrice>(item: T): void {}
```

### 4.6.3 约束与泛型工具类型的配合

```typescript
// 约束确保键存在
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// 约束确保是函数类型
function callMethod<T, K extends keyof T>(
  obj: T,
  key: K & (T[K] extends (...args: any[]) => any ? K : never)
): ReturnType<T[K]> {
  return (obj[key] as any)();
}
```

---

## 4.7 泛型性能与编译优化

### 4.7.1 泛型嵌套深度与编译性能

过度嵌套的泛型类型会显著增加编译时间。TypeScript 编译器对泛型实例化有深度限制（通常为 50 层）：

```typescript
// 深度嵌套的泛型会导致编译性能问题
type DeepWrapper<T> = { value: T };
type DeepNested<T, N extends number> =
  N extends 0 ? T : DeepWrapper<DeepNested<T, Subtract<N, 1>>>;

// 避免在类型层面进行递归计算
// 改用具体类型或减少嵌套深度
```

### 4.7.2 泛型实例化缓存

TypeScript 会缓存泛型实例化的结果。相同的类型参数组合只会被计算一次：

```typescript
// 以下两次实例化共享同一个缓存结果
type Result1 = Process<SomeType>;
type Result2 = Process<SomeType>; // 命中缓存

// 不同的类型参数会触发新的实例化
type Result3 = Process<OtherType>; // 新实例化
```

### 4.7.3 减少不必要的泛型

不是所有场景都需要泛型。当类型确定时，使用具体类型可以获得更好的编译性能和 IDE 体验：

```typescript
// ❌ 不必要的泛型
function wrapInArray<T>(value: T): T[] {
  return [value];
}

// ✅ 如果只用于 number，直接用具体类型
function wrapInArray(value: number): number[] {
  return [value];
}
```

---

## 4.8 实战：类型安全的事件发射器

综合运用本章知识，实现一个完整的事件发射器：

```typescript
// 事件映射定义
type EventMap = {
  userLogin: { userId: string; timestamp: number };
  pageView: { path: string; referrer?: string };
  error: { message: string; code: number };
  dataUpdate: { key: string; value: unknown };
};

// 泛型事件发射器
class TypedEmitter<T extends Record<string, unknown>> {
  private listeners: Map<keyof T, Set<(data: T[keyof T]) => void>> = new Map();

  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as (data: T[keyof T]) => void);
  }

  off<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    this.listeners.get(event)?.delete(handler as (data: T[keyof T]) => void);
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach(handler => {
      handler(data);
    });
  }

  once<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    const wrapper = (data: T[K]) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

// 使用示例
const emitter = new TypedEmitter<EventMap>();

// 类型安全的事件监听
emitter.on('userLogin', (data) => {
  console.log(`User ${data.userId} logged in at ${data.timestamp}`);
  // data.userId 是 string 类型
  // data.timestamp 是 number 类型
});

emitter.on('pageView', (data) => {
  console.log(`Page viewed: ${data.path}`);
  // data.referrer 是 string | undefined
});

// 类型安全的事件触发
emitter.emit('userLogin', {
  userId: 'user_123',
  timestamp: Date.now(),
});

emitter.emit('error', {
  message: 'Not found',
  code: 404,
});

// 编译时错误：缺少必需字段
// emitter.emit('userLogin', { userId: 'user_123' });
// ❌ 缺少 timestamp

// 编译时错误：字段类型不匹配
// emitter.emit('userLogin', { userId: 123, timestamp: Date.now() });
// ❌ userId 应为 string
```

这个实战案例展示了泛型的核心价值：通过 `T extends Record<string, unknown>` 约束事件映射必须是一个对象类型，通过 `K extends keyof T` 确保事件名必须是映射中的键，通过 `T[K]` 索引访问类型确保事件数据类型与事件名精确匹配。整个设计在编译期就杜绝了事件名拼写错误、数据类型不匹配等问题。

---

## 本章小结

泛型是 TypeScript 类型系统中最强大的抽象工具。理解类型参数的约束机制、变体规则和推导行为，是编写高质量泛型代码的前提。关键要点包括：

1. **约束最小化**：只约束必要的类型结构，给调用方最大自由度
2. **变体安全**：理解数组协变、函数参数逆变和返回值协变的规则
3. **推导控制**：利用 NoInfer（TS 5.4+）阻止不期望的类型推导
4. **性能意识**：避免过度嵌套的泛型，合理利用实例化缓存
5. **命名规范**：遵循 T/K/V 等社区约定，提高代码可读性

下一章将在此基础上，深入探讨条件类型与 infer 模式匹配——TypeScript 类型系统的"编程语言"特性。
