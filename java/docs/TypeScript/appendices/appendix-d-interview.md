# 附录 D：面试高频题解析

## 1. any、unknown、never 的区别

```typescript
// any：退出类型检查器，可以赋值给任何类型，也可以接收任何类型
let value: any = 42;
value = "hello";         // 允许
value();                 // 不报错，但运行时错误
const str: string = value; // 允许，类型安全失效

// unknown：类型安全的 any，使用前必须收窄
let value2: unknown = 42;
value2 = "hello";        // 允许
// value2();             // 错误：Object is of type 'unknown'
// const str2: string = value2; // 错误：不能赋值
if (typeof value2 === "string") {
  const str2: string = value2; // 正确：收窄后
}

// never：永不出现的类型，用于死代码检测
function throwError(): never {
  throw new Error("Always throws");
}

type NonEmpty<T> = T extends null | undefined ? never : T;
```

## 2. interface 与 type 的区别

```typescript
// 1. 扩展方式
interface A { a: string }
interface B extends A { b: number }  // extends

type C = { c: string }
type D = C & { d: number }  // 交叉类型

// 2. 同名合并
interface User { name: string }
interface User { age: number }  // 合并为 { name: string; age: number }

// type 不支持同名合并
// type User = { name: string }
// type User = { age: number }  // 错误

// 3. 类型别名支持联合/元组
type Status = "active" | "inactive";
type Pair = [string, number];

// 4. interface 可以 extends class
class MyClass { prop = 42 }
interface MyInterface extends MyClass { method(): void }
```

## 3. 泛型约束与条件类型

```typescript
// 泛型约束
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// 条件类型
type IsString<T> = T extends string ? "yes" : "no";

// infer 关键字
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// 分配条件类型
type ToArray<T> = T extends any ? T[] : never;
type Result = ToArray<string | number>;  // string[] | number[]
```

## 4. 类型守卫与类型收窄

```typescript
// typeof 守卫
function process(value: string | number) {
  if (typeof value === "string") {
    return value.length;
  }
  return value.toFixed();
}

// instanceof 守卫
if (animal instanceof Dog) {
  animal.bark();
}

// in 守卫
if ("swim" in animal) {
  animal.swim();
}

// 自定义类型守卫
function isFish(pet: Fish | Bird): pet is Fish {
  return (pet as Fish).swim !== undefined;
}

// 可辨识联合
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.radius ** 2;
    case "square": return shape.side ** 2;
  }
}
```

## 5. 工具类型实现

```typescript
// 实现 Partial
type MyPartial<T> = {
  [P in keyof T]?: T[P];
};

// 实现 Pick
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// 实现 Exclude
type MyExclude<T, U> = T extends U ? never : T;

// 实现 ReturnType
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
```

## 6. 协变与逆变

```typescript
// 协变：保持子类型关系
type Animal = { name: string };
type Dog = Animal & { bark(): void };

let animals: Animal[] = [];
let dogs: Dog[] = [];
animals = dogs;  // 协变：可以赋值

// 逆变：反转子类型关系
type AnimalFn = (animal: Animal) => void;
type DogFn = (dog: Dog) => void;

let animalFn: AnimalFn = (a) => {};
let dogFn: DogFn = (d) => {};
// dogFn = animalFn;  // 逆变：函数参数只接受更具体的类型
```

## 7. 模板字面量类型

```typescript
type EventName = "click" | "focus" | "blur";
type HandlerName = `on${Capitalize<EventName>}`;
// "onClick" | "onFocus" | "onBlur"

type Color = "red" | "blue";
type Size = "small" | "large";
type ButtonVariant = `${Color}-${Size}`;
// "red-small" | "red-large" | "blue-small" | "blue-large"
```

## 8. satisfies 操作符

```typescript
type Colors = "red" | "green" | "blue";
type Config = Record<string, Colors>;

// 验证类型同时保留字面量
const config = {
  primary: "red",
  secondary: "green",
} satisfies Config;

// config.primary 的类型是 "red"，不是 string
```

## 9. 装饰器（TS 5.0+）

```typescript
function logged<T extends (...args: any[]) => any>(
  target: T,
  context: ClassMethodDecoratorContext
) {
  return function (this: any, ...args: any[]) {
    console.log(`Called ${String(context.name)}`);
    return target.apply(this, args);
  };
}

class MyClass {
  @logged
  method() {
    return 42;
  }
}
```

## 10. 实际面试题

### 实现 DeepReadonly

```typescript
type DeepReadonly<T> = T extends object
  ? T extends Function
    ? T
    : { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
```

### 实现 PickByType

```typescript
type PickByType<T, U> = {
  [P in keyof T as T[P] extends U ? P : never]: T[P];
};

type OnlyString = PickByType<{ a: string; b: number; c: string }, string>;
// { a: string; c: string }
```

### 实现 Chainable 类型

```typescript
type Chainable<T = {}> = {
  option<K extends string, V>(
    key: K extends keyof T ? never : K,
    value: V
  ): Chainable<T & { [P in K]: V }>;
  get(): T;
};

declare const config: Chainable;
const result = config
  .option("name", "foo")
  .option("count", 42)
  .get();
// result: { name: string; count: number }
```