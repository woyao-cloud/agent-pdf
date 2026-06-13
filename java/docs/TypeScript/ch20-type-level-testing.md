# 类型级测试

## 1. 使用场景

类型级测试（Type-Level Testing）是在编译期验证类型行为的测试方法。主要使用场景包括：

- **工具类型测试**：验证自定义工具类型的正确性
- **泛型函数测试**：确保泛型在不同类型参数下的行为
- **类型守卫测试**：验证类型守卫的收窄效果
- **API 类型兼容性**：确保公共 API 的类型签名符合预期
- **重构安全**：类型重构后验证类型行为不变

## 2. 实现原理

### tsd 库

`tsd` 是专门用于 TypeScript 类型测试的库，它提供了一系列类型断言函数：

```typescript
// 安装：npm install tsd --save-dev
import { expectType, expectError, expectNotType, expectAssignable } from "tsd";

// 基本用法
const value: string = "hello";
expectType<string>(value);  // 编译通过：value 的类型是 string
expectNotType<number>(value);  // 编译通过：value 的类型不是 number

// 函数类型测试
function add(a: number, b: number): number {
  return a + b;
}
expectType<(a: number, b: number) => number>(add);

// 泛型函数测试
function identity<T>(value: T): T {
  return value;
}
expectType<string>(identity("hello"));
expectType<number>(identity(42));
```

**实现原理**：`tsd` 利用 TypeScript 的类型系统在编译期进行断言。如果断言失败，编译器会报错，导致测试失败。例如 `expectType<string>(42)` 会产生类型错误，因为 `42` 的类型是 `number`，不是 `string`。

### expect-type 库

`expect-type` 提供了更丰富的类型断言 API：

```typescript
// 安装：npm install expect-type --save-dev
import { expectTypeOf } from "expect-type";

// 基本用法
expectTypeOf("hello").toBeString();
expectTypeOf(42).toBeNumber();
expectTypeOf(true).toBeBoolean();

// 复杂类型断言
expectTypeOf({ a: 1, b: "hello" }).toHaveProperty("a");
expectTypeOf({ a: 1, b: "hello" }).toHaveProperty("b");

// 泛型测试
expectTypeOf(identity<string>).parameter(0).toBeString();
expectTypeOf(identity<string>).returns.toBeString();

// 类型关系测试
expectTypeOf<string>().toBeAssignableTo<string | number>();
expectTypeOf<string | number>().not.toBeAssignableTo<string>();
```

### 编译期类型断言

除了使用测试库，还可以直接利用 TypeScript 的类型系统进行编译期断言：

```typescript
// 使用类型断言变量
type AssertTrue<T extends true> = T;
type AssertFalse<T extends false> = T;

// 测试工具类型
type IsString<T> = T extends string ? true : false;

type Test1 = AssertTrue<IsString<"hello">>;  // 编译通过
type Test2 = AssertFalse<IsString<42>>;      // 编译通过
// type Test3 = AssertTrue<IsString<42>>;     // 编译错误

// 使用条件类型断言
type Expect<T, U> = T extends U ? (U extends T ? true : false) : false;
type Test4 = Expect<string, string>;  // true
type Test5 = Expect<string, number>;  // false
```

## 3. 潜在风险

### 测试覆盖不足

```typescript
// 风险：只测试了正常情况，未测试边界
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// 测试了简单对象
type Test1 = Expect<DeepReadonly<{ a: string }>, { readonly a: string }>;

// 但未测试：
// - 数组
// - 函数
// - Map/Set
// - 联合类型
// - 可选属性
```

### 类型测试与运行时测试分离

```typescript
// 风险：类型测试通过，但运行时行为不一致
function parseNumber(value: string): number {
  return parseInt(value, 10);
}

// 类型测试通过
expectType<number>(parseNumber("42"));

// 但运行时可能返回 NaN
console.log(parseNumber("abc"));  // NaN
```

## 4. 优化策略

### 完整的工具类型测试

```typescript
import { expectType, expectError, expectAssignable } from "tsd";
import type { DeepReadonly, DeepPartial, DeepRequired } from "./utility-types";

// 1. 基础功能测试
type Simple = { a: string; b: number };
type ReadonlySimple = DeepReadonly<Simple>;

expectType<{ readonly a: string; readonly b: number }>({} as ReadonlySimple);

// 2. 嵌套对象测试
type Nested = { a: { b: string; c: number } };
type ReadonlyNested = DeepReadonly<Nested>;

expectType<{ readonly a: { readonly b: string; readonly c: number } }>(
  {} as ReadonlyNested
);

// 3. 数组测试
type WithArray = { items: string[] };
type ReadonlyWithArray = DeepReadonly<WithArray>;

expectType<{ readonly items: readonly string[] }>({} as ReadonlyWithArray);

// 4. 可选属性测试
type WithOptional = { a?: string; b: number };
type ReadonlyWithOptional = DeepReadonly<WithOptional>;

expectType<{ readonly a?: string; readonly b: number }>(
  {} as ReadonlyWithOptional
);

// 5. 函数属性测试
type WithFunction = { fn: (x: number) => string };
type ReadonlyWithFunction = DeepReadonly<WithFunction>;

expectType<{ readonly fn: (x: number) => string }>(
  {} as ReadonlyWithFunction
);
```

### 测试组织策略

```typescript
// 按功能模块组织测试
// __tests__/types/utility-types.test.ts
import { expectTypeOf } from "expect-type";

describe("DeepReadonly", () => {
  it("should make all properties readonly", () => {
    type Input = { a: string; b: number };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly a: string; readonly b: number }>();
  });

  it("should handle nested objects", () => {
    type Input = { a: { b: string } };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly a: { readonly b: string } }>();
  });

  it("should not affect primitive types", () => {
    type Result = DeepReadonly<string>;
    expectTypeOf<Result>().toBeString();
  });
});
```

## 5. 典型问题处理

### 问题：条件类型测试

```typescript
import { expectType } from "tsd";

// 测试条件类型
type IsNever<T> = [T] extends [never] ? true : false;

type Test1 = IsNever<never>;     // true
type Test2 = IsNever<string>;   // false

// 使用类型断言验证
type Assert1 = AssertTrue<IsNever<never>>;
type Assert2 = AssertFalse<IsNever<string>>;

// 使用 tsd
expectType<true>({} as IsNever<never>);
expectType<false>({} as IsNever<string>);
```

### 问题：泛型约束测试

```typescript
// 测试泛型约束
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// 类型测试
expectType<string>(getProperty({ name: "Alice", age: 30 }, "name"));
expectType<number>(getProperty({ name: "Alice", age: 30 }, "age"));

// 错误情况测试
// @ts-expect-error - "height" is not a key of the object
getProperty({ name: "Alice", age: 30 }, "height");
```

## 6. 开发者技能

类型级测试的核心技能：

1. **tsd 使用**：掌握 expectType、expectError、expectAssignable 等断言
2. **expect-type 使用**：掌握 toBeString、toBeNumber、toEqualTypeOf 等 API
3. **编译期断言**：使用类型变量进行编译期验证
4. **边界测试**：测试空对象、联合类型、可选属性等边界情况
5. **测试组织**：按功能模块组织类型测试

## 7. 示例代码

### 完整的工具类型测试套件

```typescript
// src/types/utility-types.ts
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? T[P] extends Function
      ? T[P]
      : DeepReadonly<T[P]>
    : T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends Function
      ? T[P]
      : DeepPartial<T[P]>
    : T[P];
};

// tests/types/utility-types.test.ts
import { expectType, expectNotType, expectAssignable } from "tsd";
import type { DeepReadonly, DeepPartial } from "../../src/types/utility-types";

// DeepReadonly 测试
describe("DeepReadonly", () => {
  // 基本类型
  type Simple = { a: string; b: number };
  type ReadonlySimple = DeepReadonly<Simple>;
  expectType<{ readonly a: string; readonly b: number }>(
    {} as ReadonlySimple
  );

  // 嵌套对象
  type Nested = { a: { b: string; c: { d: number } } };
  type ReadonlyNested = DeepReadonly<Nested>;
  expectType<{
    readonly a: { readonly b: string; readonly c: { readonly d: number } };
  }>({} as ReadonlyNested);

  // 函数属性不应被递归
  type WithFn = { fn: () => void };
  type ReadonlyWithFn = DeepReadonly<WithFn>;
  expectType<{ readonly fn: () => void }>({} as ReadonlyWithFn);

  // 数组
  type WithArray = { items: string[] };
  type ReadonlyWithArray = DeepReadonly<WithArray>;
  expectType<{ readonly items: readonly string[] }>(
    {} as ReadonlyWithArray
  );
});

// DeepPartial 测试
describe("DeepPartial", () => {
  type Simple = { a: string; b: number };
  type PartialSimple = DeepPartial<Simple>;
  expectType<{ a?: string; b?: number }>({} as PartialSimple);

  type Nested = { a: { b: string } };
  type PartialNested = DeepPartial<Nested>;
  expectType<{ a?: { b?: string } }>({} as PartialNested);
});
```

### 泛型函数测试

```typescript
// src/utils/array.ts
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  return a.map((item, index) => [item, b[index]]);
}

// tests/utils/array.test.ts
import { expectType } from "tsd";
import { first, last, zip } from "../../src/utils/array";

// first
expectType<string | undefined>(first(["a", "b", "c"]));
expectType<number | undefined>(first([1, 2, 3]));
expectType<never | undefined>(first([]));

// last
expectType<string | undefined>(last(["a", "b", "c"]));
expectType<number | undefined>(last([1, 2, 3]));

// zip
expectType<[string, number][]>(zip(["a", "b"], [1, 2]));
expectType<[number, string][]>(zip([1, 2], ["a", "b"]));
```

## 8. 小结

类型级测试的核心要点：

- **tsd 库**：提供 expectType、expectError、expectAssignable 等类型断言
- **expect-type 库**：提供更丰富的类型断言 API，如 toBeString、toEqualTypeOf
- **编译期断言**：使用类型变量直接在编译期验证类型
- **边界测试**：测试空对象、联合类型、可选属性、函数属性等边界情况
- **测试组织**：按功能模块组织类型测试，与运行时测试分开
- **双保险**：类型测试 + 运行时测试共同保证代码质量
- **重构安全**：类型测试确保类型重构后行为不变
