# 报错信息阅读与调试

## 1. 使用场景

TypeScript 的报错信息以"天书"著称，尤其是涉及泛型、条件类型和复杂嵌套时。掌握报错阅读技巧在以下场景尤为重要：

- **泛型错误**：条件类型和映射类型的报错信息极其冗长
- **第三方库类型不匹配**：React、Express 等库的类型错误
- **类型体操调试**：编写工具类型时的错误排查
- **团队代码审查**：快速定位类型错误根因
- **迁移升级**：TypeScript 版本升级后的新错误

## 2. 实现原理

### 从差异点开始读

TypeScript 的报错信息通常包含"期望类型"和"实际类型"两部分。关键技巧是**从差异点开始读**，而不是从头读到尾：

```typescript
// 典型报错示例
type Result = {
  data: {
    user: {
      name: string;
      age: number;
    };
  };
};

const result: Result = {
  data: {
    user: {
      name: "Alice",
      age: "30",  // 错误：应为 number，实际为 string
    },
  },
};

// 报错信息：
// Type 'string' is not assignable to type 'number'
//   at property 'age'
//   at property 'user'
//   at property 'data'
//   at type 'Result'

// 阅读技巧：从最内层的差异点开始读
// "Type 'string' is not assignable to type 'number'" ← 这是根因
// 后面的 "at property ..." 只是调用栈
```

### 复杂泛型报错解析

```typescript
// 复杂泛型报错
function transform<T, U>(input: T, fn: (x: T) => U): U {
  return fn(input);
}

const result = transform(42, (x) => {
  return x.toUpperCase();  // 错误：number 没有 toUpperCase 方法
});

// 报错信息：
// Property 'toUpperCase' does not exist on type 'number'.
//   The call would have succeeded against this implementation signature:
//     '<T, U>(input: T, fn: (x: T) => U): U'

// 阅读技巧：
// 1. 先看错误描述：Property 'toUpperCase' does not exist on type 'number'
// 2. 再看调用签名：确认泛型参数 T 被推导为 number
// 3. 定位到具体代码行
```

### VSCode Hover 调试

VSCode 的 Hover 功能是调试类型最强大的工具：

```typescript
// 将鼠标悬停在变量上查看类型
const complexType = {
  user: {
    name: "Alice",
    roles: ["admin", "user"] as const,
  },
  metadata: new Map<string, unknown>(),
};

// Hover 显示：
// const complexType: {
//   user: {
//     name: string;
//     roles: readonly ["admin", "user"];
//   };
//   metadata: Map<string, unknown>;
// }

// 悬停在泛型上查看实例化后的类型
const arr = [1, 2, 3].map(x => x.toString());
// Hover 显示：const arr: string[]
```

### TypeScript Playground

TypeScript Playground 是调试复杂类型的利器：

```typescript
// 1. 使用 Playground 查看编译输出
// 2. 使用 "Type" 视图查看类型推导结果
// 3. 使用 "Error" 视图查看所有错误
// 4. 使用 "Log" 视图查看类型计算过程

// 链接：https://www.typescriptlang.org/play
```

### @ts-expect-error vs @ts-ignore

```typescript
// @ts-expect-error（推荐）：期望下一行有错误
// 如果下一行没有错误，TypeScript 会报告未使用的 @ts-expect-error
function test(x: number) {
  // @ts-expect-error - 测试类型错误
  console.log(x.toUpperCase());
}

// @ts-ignore（不推荐）：无条件忽略下一行的错误
// 即使错误被修复，也不会收到通知
function test2(x: number) {
  // @ts-ignore
  console.log(x.toUpperCase());
}

// 区别：
// - @ts-expect-error：如果错误不存在会报错（更安全）
// - @ts-ignore：总是静默（可能导致隐藏的 bug）
```

## 3. 潜在风险

### 忽略错误

```typescript
// 风险：使用 @ts-ignore 隐藏真正的错误
// @ts-ignore
const data = JSON.parse(json);  // 隐藏了返回类型为 any 的问题

// 更好的做法：明确处理
const data: unknown = JSON.parse(json);
```

### 过度依赖类型推断

```typescript
// 风险：复杂类型推断可能不是预期的
const config = {
  api: {
    timeout: 3000,
    retries: undefined,  // 类型被推断为 undefined，而不是 number | undefined
  },
};

// 明确注解
interface ApiConfig {
  timeout: number;
  retries?: number;
}
const config: { api: ApiConfig } = {
  api: {
    timeout: 3000,
    retries: undefined,
  },
};
```

## 4. 优化策略

### 分步调试法

```typescript
// 步骤1：提取中间类型
type Input = Parameters<typeof someFunction>;
type Output = ReturnType<typeof someFunction>;

// 步骤2：简化复杂类型
type Simplified = {
  [K in keyof ComplexType]: ComplexType[K] extends string ? K : never;
}[keyof ComplexType];

// 步骤3：使用类型别名
type UserName = ComplexType["user"]["name"];
type UserRoles = ComplexType["user"]["roles"];
```

### 使用工具类型辅助调试

```typescript
// 调试工具类型
type Debug<T> = {
  [K in keyof T]: T[K];
};

// 展开交叉类型
type Expand<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

// 使用示例
type Complex = { a: string } & { b: number } & { c: boolean };
type Expanded = Expand<Complex>;
// Expanded: { a: string; b: number; c: boolean }
```

### 错误信息简化

```typescript
// 使用类型别名简化报错
// 原始报错（冗长）：
// Type '{ id: string; name: string; email: string; password: string; }'
// is not assignable to type 'Pick<User, "id" | "name" | "email">'

// 使用别名简化
type PublicUser = Pick<User, "id" | "name" | "email">;

const user: PublicUser = {
  id: "1",
  name: "Alice",
  email: "a@b.com",
  password: "secret",  // 错误：PublicUser 没有 password
};
```

## 5. 典型问题处理

### 问题：泛型约束错误

```typescript
// 错误：Type 'T' does not satisfy the constraint 'HasId'
function getById<T>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);  // 错误
}

// 解决方案：添加泛型约束
interface HasId {
  id: string;
}
function getById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}
```

### 问题：条件类型不匹配

```typescript
// 错误：条件类型推导不符合预期
type IsString<T> = T extends string ? "yes" : "no";
type Result = IsString<string | number>;
// Result: "yes" | "no"（联合类型分配）

// 解决方案：使用 [] 包裹防止分配
type IsStringNonDistributive<T> = [T] extends [string] ? "yes" : "no";
type Result2 = IsStringNonDistributive<string | number>;
// Result2: "no"
```

## 6. 开发者技能

报错阅读的核心技能：

1. **从差异点开始读**：忽略调用栈，聚焦根因
2. **VSCode Hover**：悬停查看类型推导结果
3. **TypeScript Playground**：使用可视化工具调试复杂类型
4. **分步调试**：提取中间类型，逐步缩小问题范围
5. **@ts-expect-error**：优先使用 @ts-expect-error 而非 @ts-ignore

## 7. 示例代码

### 报错调试实战

```typescript
// 场景：React 组件类型错误
import React from "react";

interface ButtonProps {
  variant: "primary" | "secondary";
  size: "small" | "medium" | "large";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Button(props: ButtonProps) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

// 错误使用
<Button
  variant="primary"
  size="xl"  // 错误：Type '"xl"' is not assignable to type '"small" | "medium" | "large"'
  onClick={() => console.log("clicked")}
>
  Click me
</Button>;

// 调试步骤：
// 1. 看错误描述：Type '"xl"' is not assignable to type '"small" | "medium" | "large"'
// 2. 定位到 size 属性
// 3. 查看 ButtonProps 中 size 的定义
// 4. 修复：将 "xl" 改为 "large"
```

### 复杂泛型调试

```typescript
// 复杂泛型调试示例
function createSelector<T, K extends keyof T>(key: K) {
  return (obj: T): T[K] => obj[key];
}

// 调试步骤
// 1. 悬停查看类型
const getName = createSelector({ name: "Alice", age: 30 } as const);
// Hover: const getName: (obj: { readonly name: "Alice"; readonly age: 30 }) => "Alice" | 30

// 2. 使用类型别名展开
type SelectorResult<T, K extends keyof T> = T[K];
type TestResult = SelectorResult<
  { readonly name: "Alice"; readonly age: 30 },
  "name"
>;
// TestResult: "Alice"

// 3. 使用 Playground 查看完整类型计算过程
```

## 8. 小结

报错信息阅读与调试的核心要点：

- **从差异点开始读**：忽略冗长的调用栈，聚焦最内层的类型差异
- **VSCode Hover**：悬停查看类型推导结果，是最常用的调试工具
- **TypeScript Playground**：可视化调试复杂类型
- **@ts-expect-error**：优先于 @ts-ignore，能检测到已修复的错误
- **分步调试**：提取中间类型，逐步缩小问题范围
- **工具类型辅助**：使用 Expand、Debug 等工具类型展开复杂类型
- **简化报错**：使用类型别名减少报错信息的复杂度
