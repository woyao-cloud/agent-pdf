# 附录 A：内置工具类型源码解析

## 1. Partial\<T\>

```typescript
// 源码
type Partial<T> = {
  [P in keyof T]?: T[P];
};

// 解析
// - 使用映射类型（Mapped Type）遍历 T 的所有属性
// - ? 将每个属性变为可选
// - T[P] 保留原始属性值的类型

// 使用示例
interface User {
  name: string;
  age: number;
  email: string;
}

type PartialUser = Partial<User>;
// { name?: string; age?: number; email?: string; }
```

## 2. Required\<T\>

```typescript
// 源码
type Required<T> = {
  [P in keyof T]-?: T[P];
};

// 解析
// - 与 Partial 相反，-? 移除可选性
// - 将可选属性变为必选

// 使用示例
type OptionalUser = {
  name?: string;
  age?: number;
};

type RequiredUser = Required<OptionalUser>;
// { name: string; age: number; }
```

## 3. Readonly\<T\>

```typescript
// 源码
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// 解析
// - 为每个属性添加 readonly 修饰符
// - 防止属性被重新赋值

// 使用示例
type ReadonlyUser = Readonly<User>;
// { readonly name: string; readonly age: number; readonly email: string; }
```

## 4. Pick\<T, K\>

```typescript
// 源码
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// 解析
// - K extends keyof T 约束 K 必须是 T 的属性名
// - 从 T 中选取 K 指定的属性组成新类型

// 使用示例
type UserName = Pick<User, "name" | "email">;
// { name: string; email: string; }
```

## 5. Omit\<T, K\>

```typescript
// 源码
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

// 解析
// - 使用 Exclude 从 T 的属性中排除 K
// - 再用 Pick 选取剩余属性
// - K extends keyof any 允许 K 是任意字符串

// 使用示例
type UserWithoutEmail = Omit<User, "email">;
// { name: string; age: number; }
```

## 6. Record\<K, V\>

```typescript
// 源码
type Record<K extends keyof any, V> = {
  [P in K]: V;
};

// 解析
// - K extends keyof any 约束 K 为 string | number | symbol
// - 创建属性名为 K、属性值为 V 的对象类型

// 使用示例
type PageInfo = Record<string, { title: string; url: string }>;
// { [x: string]: { title: string; url: string } }
```

## 7. Exclude\<T, U\>

```typescript
// 源码
type Exclude<T, U> = T extends U ? never : T;

// 解析
// - 条件类型 + 联合类型分配律
// - 从 T 中排除可以赋值给 U 的类型
// - 联合类型 T 被分配后，每个成员单独判断

// 使用示例
type T0 = Exclude<"a" | "b" | "c", "a">;
// "b" | "c"
type T1 = Exclude<string | number | (() => void), Function>;
// string | number
```

## 8. Extract\<T, U\>

```typescript
// 源码
type Extract<T, U> = T extends U ? T : never;

// 解析
// - 与 Exclude 相反，提取可以赋值给 U 的类型
// - 同样利用联合类型分配律

// 使用示例
type T0 = Extract<"a" | "b" | "c", "a" | "f">;
// "a"
```

## 9. NonNullable\<T\>

```typescript
// 源码
type NonNullable<T> = T extends null | undefined ? never : T;

// 解析
// - 从 T 中排除 null 和 undefined
// - 利用条件类型分配律处理联合类型

// 使用示例
type T0 = NonNullable<string | number | undefined>;
// string | number
type T1 = NonNullable<string[] | null | undefined>;
// string[]
```

## 10. Parameters\<T\>

```typescript
// 源码
type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

// 解析
// - T extends (...args: any) => any 约束 T 为函数类型
// - 使用 infer P 提取参数类型元组
// - 返回参数类型的元组

// 使用示例
type Fn = (name: string, age: number) => void;
type FnParams = Parameters<Fn>;
// [name: string, age: number]
```

## 11. ReturnType\<T\>

```typescript
// 源码
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

// 解析
// - 使用 infer R 提取函数返回值类型
// - 返回值的类型

// 使用示例
type Fn = (name: string) => string;
type FnReturn = ReturnType<Fn>;
// string
```

## 12. ConstructorParameters\<T\>

```typescript
// 源码
type ConstructorParameters<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;

// 解析
// - T extends abstract new (...args: any) => any 约束为构造函数
// - 使用 infer P 提取构造函数参数
// - 返回参数类型元组

// 使用示例
type PointConstructor = new (x: number, y: number) => { x: number; y: number };
type PointParams = ConstructorParameters<PointConstructor>;
// [x: number, y: number]
```

## 13. InstanceType\<T\>

```typescript
// 源码
type InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : any;

// 解析
// - 使用 infer R 提取构造函数的实例类型
// - 返回实例类型

// 使用示例
class Point {
  constructor(public x: number, public y: number) {}
}
type PointInstance = InstanceType<typeof Point>;
// Point
```

## 14. ThisParameterType\<T\>

```typescript
// 源码
type ThisParameterType<T> = T extends (this: infer U, ...args: any) => any ? U : unknown;

// 解析
// - 提取函数类型中的 this 参数类型
// - 如果没有 this 参数，返回 unknown

// 使用示例
type Fn = (this: { name: string }, value: number) => void;
type ThisType = ThisParameterType<Fn>;
// { name: string }
```

## 15. OmitThisParameter\<T\>

```typescript
// 源码
type OmitThisParameter<T> = unknown extends ThisParameterType<T>
  ? T
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T;

// 解析
// - 如果 T 没有 this 参数，直接返回 T
// - 如果有 this 参数，移除 this 参数并返回新的函数类型

// 使用示例
type Fn = (this: { name: string }, value: number) => void;
type WithoutThis = OmitThisParameter<Fn>;
// (value: number) => void
```

## 16. ThisType\<T\>

```typescript
// 源码
interface ThisType<T> { }

// 解析
// - 这是一个空的 interface，没有实际定义
// - 它作为标记类型，告诉编译器 this 的上下文类型
// - 只在 --noImplicitThis 下生效

// 使用示例
interface MyObject {
  data: { name: string };
  methods: {
    getName(this: MyObject): string;
  } & ThisType<MyObject>;
}
```

## 小结

内置工具类型的核心设计模式：

- **映射类型**：Partial、Required、Readonly、Pick、Record
- **条件类型**：Exclude、Extract、NonNullable
- **infer 提取**：Parameters、ReturnType、ConstructorParameters、InstanceType
- **this 操作**：ThisParameterType、OmitThisParameter、ThisType
- **组合使用**：Omit = Pick + Exclude
