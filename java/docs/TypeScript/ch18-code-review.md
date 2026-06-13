# 代码审查与反模式

## 1. 使用场景

TypeScript 代码审查（Code Review）是保证代码质量和类型安全的关键环节。主要使用场景包括：

- **团队协作**：确保团队成员遵循类型安全最佳实践
- **代码质量门禁**：在 CI 中自动检查类型反模式
- **新人指导**：通过审查帮助新人理解 TypeScript 规范
- **重构安全**：确保重构不引入类型安全问题
- **性能优化**：发现导致编译性能下降的类型体操

## 2. 实现原理

### 反模式：interface 继承滥用

```typescript
// 反模式：多层 interface 继承
interface A {
  a: string;
}
interface B extends A {
  b: string;
}
interface C extends B {
  c: string;
}
interface D extends C {
  d: string;
}
// D 同时继承了 a、b、c、d，但难以追踪来源

// 更好的做法：组合而非继承
interface Base {
  a: string;
  b: string;
  c: string;
  d: string;
}

// 或者使用交叉类型
type D = A & B & C & { d: string };

// 更清晰的替代方案
interface User {
  id: string;
  name: string;
  email: string;
}

interface AdminUser extends User {
  role: "admin";
  permissions: string[];
}

interface RegularUser extends User {
  role: "user";
}
```

### 反模式：as any 滥用

```typescript
// 反模式：使用 as any 绕过类型检查
function processData(data: any) {
  return data.map((item: any) => item.value);
}

// 更好的做法：使用 unknown + 类型守卫
function processDataSafe(data: unknown) {
  if (Array.isArray(data)) {
    return data.map(item => {
      if (item && typeof item === "object" && "value" in item) {
        return (item as { value: unknown }).value;
      }
      throw new Error("Invalid item format");
    });
  }
  throw new Error("Data must be an array");
}

// 可接受的 as 使用场景
// 1. DOM 类型断言
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// 2. JSON.parse 后的类型断言
const data = JSON.parse(json) as { name: string };

// 3. 测试中的类型断言
const mockUser = { name: "Alice" } as User;
```

### 反模式：单次泛型

```typescript
// 反模式：泛型只使用一次
function getFirst<T>(arr: T[]): T | undefined {
  return arr[0];
}
// 这里的 T 只使用了一次，直接写 unknown 或具体类型即可

// 更好的做法：不需要泛型
function getFirst(arr: unknown[]): unknown {
  return arr[0];
}

// 或者：使用具体类型
function getFirstString(arr: string[]): string | undefined {
  return arr[0];
}

// 泛型的正确使用场景：类型关系
function pair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}
// T 和 U 在输入和输出中都出现，建立了类型关系
```

### 反模式：过度可选链

```typescript
// 反模式：过度使用可选链掩盖类型问题
interface Config {
  server?: {
    host?: string;
    port?: number;
  };
}

function getPort(config: Config): number {
  return config?.server?.port ?? 3000;
}
// 问题：为什么 server 和 port 是可选的？是业务需要还是类型设计问题？

// 更好的做法：明确类型设计
interface Config {
  server: {
    host: string;
    port: number;
  };
}

// 如果确实需要可选，使用明确的默认值
const DEFAULT_CONFIG: Config = {
  server: {
    host: "localhost",
    port: 3000,
  },
};

function getPort(config?: Config): number {
  return config?.server.port ?? DEFAULT_CONFIG.server.port;
}
```

## 3. 潜在风险

### 类型断言的风险

```typescript
// 风险：类型断言隐藏了类型不匹配
const data = apiResponse as { name: string; age: number };
// 如果 apiResponse 实际结构不同，运行时崩溃

// 安全做法：运行时验证
import { z } from "zod";
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
});
const data = UserSchema.parse(apiResponse);
```

### 泛型约束不足

```typescript
// 风险：泛型约束太宽松
function merge<T, U>(a: T, b: U): T & U {
  return { ...a, ...b };
}
// T 和 U 可以是任何类型，可能导致意外的类型交叉

// 更好的做法：约束为对象
function merge<T extends object, U extends object>(a: T, b: U): T & U {
  return { ...a, ...b };
}
```

## 4. 优化策略

### ESLint 强制约束

```typescript
// .eslintrc.json - TypeScript 代码审查规则
{
  "rules": {
    // 禁止 any
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",

    // 禁止不必要的类型断言
    "@typescript-eslint/no-unnecessary-type-assertion": "error",

    // 禁止不必要的条件判断
    "@typescript-eslint/no-unnecessary-condition": "warn",

    // 要求显式返回值类型
    "@typescript-eslint/explicit-function-return-type": "warn",

    // 禁止空接口
    "@typescript-eslint/no-empty-interface": "error",

    // 禁止无用的泛型
    "@typescript-eslint/no-unnecessary-type-parameters": "error",

    // 要求使用 satisfies 替代 as
    "@typescript-eslint/prefer-satisfies": "warn"
  }
}
```

### 代码审查清单

```typescript
// TypeScript 代码审查清单
interface CodeReviewChecklist {
  // 类型安全
  noAny: boolean;           // 没有 any 类型
  noTypeAssertion: boolean; // 没有不必要的类型断言
  properGenerics: boolean;  // 泛型使用合理
  runtimeValidation: boolean; // 外部数据有运行时验证

  // 设计
  clearInterfaces: boolean;  // 接口设计清晰
  properInheritance: boolean; // 继承层次合理
  noOverAbstraction: boolean; // 没有过度抽象

  // 性能
  noDeepRecursion: boolean;  // 没有深度递归类型
  reasonableGenerics: boolean; // 泛型实例化次数合理
}
```

## 5. 典型问题处理

### 问题：审查时发现大量 any

```typescript
// 逐步替换策略
// 1. 先替换为 unknown
function process(data: unknown) { ... }

// 2. 添加类型守卫
function process(data: unknown) {
  if (isValidData(data)) { ... }
}

// 3. 定义具体类型
interface ValidData {
  id: string;
  value: number;
}
function process(data: ValidData) { ... }
```

### 问题：审查时发现类型体操过度

```typescript
// 过度类型体操
type DeepOmit<T, K extends string> = T extends object
  ? {
      [P in keyof T as P extends K ? never : P]: T[P] extends object
        ? DeepOmit<T[P], K>
        : T[P];
    }
  : T;

// 简化版本
type SimpleOmit<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};
```

## 6. 开发者技能

代码审查的核心技能：

1. **识别反模式**：interface 继承滥用、as any、单次泛型
2. **ESLint 规则**：配置自动化的类型安全规则
3. **渐进式改进**：对遗留代码逐步替换 any
4. **性能意识**：识别导致编译性能下降的类型体操
5. **平衡之道**：在类型安全和开发效率之间找到平衡

## 7. 示例代码

### 审查示例：好的 vs 坏的

```typescript
// 坏的代码
function process(items: any[]) {
  return items.map((item: any) => {
    if (item.type === "user") {
      return { name: item.name, role: "user" };
    }
    return { name: item.name, role: "guest" };
  });
}

// 好的代码
interface Item {
  type: string;
  name: string;
}

interface ProcessedItem {
  name: string;
  role: "user" | "guest";
}

function process(items: Item[]): ProcessedItem[] {
  return items.map(item => ({
    name: item.name,
    role: item.type === "user" ? "user" : "guest",
  }));
}
```

### 审查示例：泛型使用

```typescript
// 坏的泛型使用
function wrap<T>(value: T): { value: T } {
  return { value };
}
// T 只使用了一次，不需要泛型

// 好的泛型使用
function wrap<T>(value: T): { value: T } {
  return { value };
}
// 如果 T 在输入和输出中都出现，泛型有意义

// 更好的泛型使用
function createPair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}
// T 和 U 建立了输入到输出的类型关系
```

## 8. 小结

代码审查与反模式的核心要点：

- **interface 继承滥用**：组合优于继承，避免多层继承链
- **as any 滥用**：使用 unknown + 类型守卫替代 any
- **单次泛型**：泛型应建立类型关系，单次使用无意义
- **过度可选链**：可选链不应掩盖类型设计问题
- **ESLint 强制约束**：自动化规则比人工审查更可靠
- **审查清单**：类型安全、设计清晰、性能合理
- **渐进式改进**：对遗留代码逐步替换，而非一次性重构
