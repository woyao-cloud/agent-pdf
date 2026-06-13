# 类型守卫与断言

## 1. 使用场景

类型守卫（Type Guards）和类型断言（Type Assertions）是 TypeScript 类型收窄的核心工具。主要使用场景包括：

- **联合类型收窄**：从 `string | number` 收窄到具体类型
- **运行时类型验证**：验证 API 返回数据的类型
- **自定义类型检查**：检查复杂对象结构是否符合接口定义
- **断言函数**：在函数内部完成类型检查并收窄外部类型
- **satisfies 操作符**：验证表达式类型同时保留精确类型

## 2. 实现原理

### 内置类型守卫

TypeScript 内置的类型守卫通过控制流分析（Control Flow Analysis）实现类型收窄：

```typescript
// typeof 守卫
function process(value: string | number) {
  if (typeof value === "string") {
    // 这里 value 收窄为 string
    return value.toUpperCase();
  }
  // 这里 value 收窄为 number
  return value.toFixed(2);
}

// instanceof 守卫
class Dog {
  bark() { return "Woof!"; }
}
class Cat {
  meow() { return "Meow!"; }
}

function makeSound(animal: Dog | Cat) {
  if (animal instanceof Dog) {
    return animal.bark();  // animal: Dog
  }
  return animal.meow();    // animal: Cat
}

// in 守卫
interface Fish {
  swim: () => void;
  layEggs: () => void;
}
interface Bird {
  fly: () => void;
  layEggs: () => void;
}

function move(animal: Fish | Bird) {
  if ("swim" in animal) {
    return animal.swim();  // animal: Fish
  }
  return animal.fly();     // animal: Bird
}
```

### 自定义类型守卫（obj is Type）

自定义类型守卫使用 `parameterName is Type` 语法，告诉编译器当函数返回 true 时参数的类型：

```typescript
// 自定义类型守卫
interface User {
  name: string;
  age: number;
  email: string;
}

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.age === "number" &&
    typeof obj.email === "string"
  );
}

// 使用自定义守卫
const data: unknown = JSON.parse('{"name":"Alice","age":30,"email":"a@b.com"}');

if (isUser(data)) {
  // data 收窄为 User
  console.log(data.name.toUpperCase());
}
```

**实现原理**：类型守卫函数返回类型中的 `value is Type` 是一个**类型谓词**（type predicate）。编译器在分析控制流时，如果检测到 `if (isUser(data))` 分支，就会将 `data` 的类型收窄为 `User`。

### 断言函数（asserts condition）

断言函数使用 `asserts condition` 语法，当函数返回时断言条件成立：

```typescript
// 断言函数
function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("Value must be a string");
  }
}

function processValue(value: unknown) {
  assertString(value);
  // 这里 value 收窄为 string
  console.log(value.toUpperCase());
}

// 更复杂的断言
interface ValidUser {
  name: string;
  age: number;
}

function assertValidUser(value: unknown): asserts value is ValidUser {
  if (typeof value !== "object" || value === null) {
    throw new Error("Value must be an object");
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== "string") {
    throw new Error("name must be a string");
  }
  if (typeof obj.age !== "number") {
    throw new Error("age must be a number");
  }
}

// 使用断言函数
function handleRequest(body: unknown) {
  assertValidUser(body);
  // body 收窄为 ValidUser
  console.log(`${body.name} is ${body.age} years old`);
}
```

**断言函数 vs 类型守卫**：

| 特性 | 类型守卫 | 断言函数 |
|------|---------|---------|
| 返回值 | boolean | void |
| 失败行为 | 返回 false | 抛出异常 |
| 使用场景 | if 分支 | 前置条件检查 |
| 类型收窄 | 仅在 true 分支 | 函数返回后 |

### satisfies 操作符

`satisfies` 是 TypeScript 4.9 引入的操作符，用于验证表达式的类型同时保留最精确的类型：

```typescript
// 传统方式：类型注解会丢失精确类型
const palette: Record<string, string | number> = {
  red: "#ff0000",
  green: "#00ff00",
  blue: 255,  // 数字也可以
};
// palette.red 的类型是 string | number，不能直接调用 toUpperCase()

// 使用 satisfies
const palette2 = {
  red: "#ff0000",
  green: "#00ff00",
  blue: 255,
} satisfies Record<string, string | number>;

// palette2.red 的类型是 string（保留了字面量类型）
// palette2.blue 的类型是 number
palette2.red.toUpperCase();  // 正确
// palette2.blue.toFixed();  // 正确

// 验证对象结构
type Color = [number, number, number];
const colors = {
  primary: [255, 0, 0],
  secondary: [0, 255, 0],
} satisfies Record<string, Color>;

// colors.primary 的类型是 [number, number, number]
// 而不是 Record<string, Color> 的索引类型
```

## 3. 潜在风险

### 类型守卫不完整

```typescript
// 不完整的类型守卫
interface Circle {
  kind: "circle";
  radius: number;
}
interface Square {
  kind: "square";
  side: number;
}
type Shape = Circle | Square;

// 不完整的守卫：没有处理 Square
function isCircle(shape: Shape): shape is Circle {
  return shape.kind === "circle";
}

// 使用不完整守卫
function getArea(shape: Shape) {
  if (isCircle(shape)) {
    return Math.PI * shape.radius ** 2;
  }
  // 这里 shape 被收窄为 Square，但如果新增了 Triangle 类型
  // 编译器不会报错，但运行时可能出错
  return shape.side ** 2;
}
```

### 断言函数误用

```typescript
// 错误：断言函数没有实际检查
function assertNotNull<T>(value: T): asserts value is NonNullable<T> {
  // 空的断言函数，没有实际检查
}

// 使用空的断言函数
const value: string | null = getValue();
assertNotNull(value);
value.toUpperCase();  // 编译通过，但运行时 value 可能为 null
```

## 4. 优化策略

### 可组合的类型守卫

```typescript
// 组合多个类型守卫
type Guard<T> = (value: unknown) => value is T;

function and<T, U>(a: Guard<T>, b: Guard<U>): Guard<T & U> {
  return (value: unknown): value is T & U => a(value) && b(value);
}

function or<T, U>(a: Guard<T>, b: Guard<U>): Guard<T | U> {
  return (value: unknown): value is T | U => a(value) || b(value);
}

// 使用组合
const isString: Guard<string> = (v): v is string => typeof v === "string";
const isNumber: Guard<number> = (v): v is number => typeof v === "number";

const isStringOrNumber = or(isString, isNumber);
const isStringAndNumber = and(isString, isNumber);  // never
```

### 可辨识联合类型守卫

```typescript
// 使用可辨识联合（Discriminated Union）简化守卫
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "triangle"; base: number; height: number };

// 不需要自定义守卫，直接使用 switch
function getArea(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.side ** 2;
    case "triangle":
      return (shape.base * shape.height) / 2;
  }
}
```

### 使用 Zod 自动生成类型守卫

```typescript
import { z } from "zod";

// Zod schema 自动生成类型和守卫
const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0).max(150),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

// 使用 Zod 的 safeParse 作为类型守卫
function isUser(value: unknown): value is User {
  return UserSchema.safeParse(value).success;
}
```

## 5. 典型问题处理

### 问题：数组元素类型守卫

```typescript
// 过滤数组时类型收窄
const mixed: (string | number)[] = [1, "hello", 2, "world"];

// 错误：filter 返回的是 (string | number)[]
const strings = mixed.filter(item => typeof item === "string");

// 正确：使用类型守卫
const strings2 = mixed.filter(
  (item): item is string => typeof item === "string"
);
// strings2: string[]
```

### 问题：嵌套对象类型守卫

```typescript
interface DeepObject {
  nested: {
    value: string;
    optional?: number;
  };
}

function isDeepObject(value: unknown): value is DeepObject {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.nested !== "object" || obj.nested === null) return false;
  const nested = obj.nested as Record<string, unknown>;
  return typeof nested.value === "string";
}
```

## 6. 开发者技能

类型守卫的核心技能：

1. **控制流分析**：理解 TypeScript 如何通过控制流收窄类型
2. **类型谓词**：掌握 `value is Type` 语法
3. **断言函数**：理解 `asserts condition` 的使用场景
4. **satisfies 操作符**：在保留精确类型的同时验证结构
5. **可辨识联合**：使用字面量类型字段简化守卫逻辑

## 7. 示例代码

### 完整的类型守卫系统

```typescript
// 类型守卫工具库
type Guard<T> = (value: unknown) => value is T;

// 基础守卫
const isString: Guard<string> = (v): v is string => typeof v === "string";
const isNumber: Guard<number> = (v): v is number => typeof v === "number";
const isBoolean: Guard<boolean> = (v): v is boolean => typeof v === "boolean";
const isArray = <T>(itemGuard: Guard<T>): Guard<T[]> =>
  (v): v is T[] => Array.isArray(v) && v.every(itemGuard);

// 对象守卫
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 精确对象守卫
function createObjectGuard<T extends Record<string, Guard<any>>>(
  guards: T
): Guard<{ [K in keyof T]: T[K] extends Guard<infer U> ? U : never }> {
  return (value: unknown): value is any => {
    if (!isObject(value)) return false;
    return Object.entries(guards).every(
      ([key, guard]) => key in value && guard(value[key])
    );
  };
}

// 使用
interface Person {
  name: string;
  age: number;
  hobbies: string[];
}

const isPerson = createObjectGuard({
  name: isString,
  age: isNumber,
  hobbies: isArray(isString),
});

// 测试
const data: unknown = {
  name: "Alice",
  age: 30,
  hobbies: ["reading", "coding"],
};

if (isPerson(data)) {
  console.log(data.name.toUpperCase());  // 类型安全
}
```

### satisfies 实战

```typescript
// 使用 satisfies 验证配置对象
type ColorScheme = "light" | "dark" | "auto";
type ThemeConfig = {
  colors: Record<string, string>;
  scheme: ColorScheme;
  fonts: {
    heading: string;
    body: string;
  };
};

const config = {
  colors: {
    primary: "#0070f3",
    secondary: "#7928ca",
    error: "#e00",
  },
  scheme: "auto",
  fonts: {
    heading: "Inter, sans-serif",
    body: "system-ui, sans-serif",
  },
} satisfies ThemeConfig;

// config.colors.primary 的类型是 string（字面量保留）
// config.scheme 的类型是 "auto"（字面量保留）
// 同时验证了结构符合 ThemeConfig
```

## 8. 小结

类型守卫与断言的核心要点：

- **内置守卫**：typeof、instanceof、in 是最常用的内置守卫
- **自定义守卫**：`value is Type` 谓词实现自定义类型收窄
- **断言函数**：`asserts condition` 在函数返回后收窄类型
- **satisfies**：验证类型同时保留精确类型，避免类型丢失
- **可辨识联合**：使用字面量类型字段实现自动收窄
- **组合守卫**：将多个守卫组合成复杂的类型验证系统
- **运行时校验**：结合 Zod 等库实现类型守卫的自动生成
