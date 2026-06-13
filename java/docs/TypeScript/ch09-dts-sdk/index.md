# 第9章 .d.ts 声明文件编写

## 模块1：声明文件的作用与意义

在 TypeScript 生态中，`.d.ts` 声明文件扮演着连接 JavaScript 运行时与 TypeScript 类型系统的桥梁角色。当我们在 TypeScript 项目中使用一个纯 JavaScript 编写的第三方库时，如果没有对应的类型声明，TypeScript 编译器将无法提供类型检查、自动补全和重构支持。声明文件正是为了解决这一问题而存在的。

声明文件的核心价值体现在以下几个方面：

**类型安全**：声明文件为 JavaScript 代码提供了完整的类型信息，使得 TypeScript 编译器能够对跨模块调用进行类型检查。例如，当我们使用一个返回 `any` 类型的函数时，编译器无法帮助我们捕获类型错误；而有了声明文件，编译器就能精确地知道每个函数的参数类型和返回值类型。

**开发体验**：现代 IDE（如 VS Code）利用声明文件提供智能代码补全、参数提示和文档预览。这极大地提升了开发效率，减少了查阅文档的时间。

**接口契约**：声明文件本质上是一种接口契约，它明确地定义了模块对外暴露的 API 形状。这对于团队协作和大型项目的维护尤为重要。

**渐进迁移**：对于从 JavaScript 向 TypeScript 迁移的项目，声明文件允许开发者在不修改原有 JavaScript 代码的情况下，逐步引入类型检查。这是许多大型项目采用的主流迁移策略。

声明文件有两种主要来源：一是由 TypeScript 编译器在编译时自动生成（通过 `declaration: true` 配置），二是由开发者手写。本章将重点讨论手写声明文件的场景和技术。

## 模块2：声明文件的基本语法

声明文件使用 TypeScript 的类型语法，但只包含类型信息，不包含实现逻辑。其文件扩展名为 `.d.ts`，编译器遇到此类文件时会自动识别并加载其中的类型定义。

### 基本类型声明

声明文件支持 TypeScript 中的所有类型构造：

```typescript
// 基本类型
declare const VERSION: string;
declare function parse(input: string): number;

// 接口
interface Config {
  host: string;
  port: number;
  timeout?: number;
}

// 类型别名
type Callback<T> = (error: Error | null, result: T) => void;

// 类
declare class HttpClient {
  constructor(baseUrl: string);
  get<T>(path: string): Promise<T>;
}
```

### declare 关键字

`declare` 是声明文件中的核心关键字，它告诉编译器某个变量、函数或类已经存在，但不需要提供实现。`declare` 可以修饰以下构造：

- `declare var` / `declare let` / `declare const`：声明全局变量
- `declare function`：声明函数签名
- `declare class`：声明类的类型结构
- `declare namespace`：声明命名空间
- `declare module`：声明模块
- `declare global`：扩展全局作用域

### 模块声明

当我们需要为没有类型定义的 npm 包编写声明时，使用 `declare module`：

```typescript
declare module 'legacy-package' {
  export function doSomething(input: string): void;
  export const version: string;
}
```

## 模块3：函数重载与类型重载

函数重载是声明文件中一个非常强大的特性。它允许我们为同一个函数声明多个不同的调用签名，编译器会根据实际传入的参数类型选择最匹配的签名。

### 基础重载

```typescript
// 声明文件中的重载
declare function formatDate(date: Date): string;
declare function formatDate(timestamp: number): string;
declare function formatDate(year: number, month: number, day: number): string;
```

### 基于字符串字面量的重载

在实际的 SDK 设计中，基于字符串字面量的重载非常常见：

```typescript
// 事件监听的重载
declare function on(event: 'click', handler: (e: MouseEvent) => void): void;
declare function on(event: 'keydown', handler: (e: KeyboardEvent) => void): void;
declare function on(event: string, handler: (e: Event) => void): void;
```

### 条件类型与重载的结合

对于更复杂的场景，可以将重载与条件类型结合使用：

```typescript
type ApiResponse<T> = T extends 'users' ? User[] : T extends 'posts' ? Post[] : unknown;

declare function fetchResource<T extends string>(resource: T): Promise<ApiResponse<T>>;
```

在我们的 SDK 示例中，`getUser` 方法展示了两种不同的重载签名：一种通过 ID 查询，另一种通过邮箱查询。这使得 API 的使用更加灵活，同时保持了类型安全。

## 模块4：声明合并

声明合并是 TypeScript 声明文件中的一个独特机制。当多个同名的声明出现在同一作用域时，TypeScript 会将它们合并为一个声明。这一特性在扩展现有类型时非常有用。

### 接口合并

接口是声明合并最常见的应用场景：

```typescript
// 文件 A
interface User {
  id: string;
  name: string;
}

// 文件 B
interface User {
  email: string;
  age?: number;
}

// 合并结果
// interface User {
//   id: string;
//   name: string;
//   email: string;
//   age?: number;
// }
```

### 命名空间合并

命名空间与类、函数和枚举也可以进行合并：

```typescript
class Validator {
  validate(input: string): boolean {}
}

namespace Validator {
  export const regex = /^[a-z]+$/;
}

// 使用
Validator.regex.test('hello'); // true
new Validator().validate('hello'); // true
```

### 全局声明合并

通过 `declare global`，我们可以在模块文件中扩展全局类型：

```typescript
// 在模块文件中
declare global {
  interface Window {
    __SDK_VERSION__: string;
  }
}

// 现在可以在任何地方使用
console.log(window.__SDK_VERSION__);
```

这种模式在 SDK 开发中非常常见，用于向全局对象添加自定义属性。

## 模块5：泛型与条件类型在声明中的应用

泛型是声明文件中实现类型复用的核心工具。结合条件类型，我们可以构建出高度灵活且类型安全的 API。

### 泛型约束

```typescript
interface HasId {
  id: string;
}

declare function getById<T extends HasId>(items: T[], id: string): T | undefined;
```

### 条件类型

条件类型允许我们根据输入类型动态决定输出类型：

```typescript
type ExtractType<T> = T extends Promise<infer U> ? U : T;

// 使用
type A = ExtractType<Promise<string>>;  // string
type B = ExtractType<number>;            // number
```

### 映射类型

映射类型可以批量转换已有类型的属性：

```typescript
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Optional<T> = {
  [P in keyof T]?: T[P];
};
```

在我们的 SDK 声明中，`create<T extends Record<string, unknown>>` 方法使用了泛型约束，确保传入的数据是对象类型，同时保留了具体的属性类型信息。

## 模块6：全局声明与模块增强

### 全局声明

在非模块文件中（没有 `import` 或 `export`），声明默认处于全局作用域。但在模块文件中，如果需要声明全局类型，必须使用 `declare global`：

```typescript
// global.d.ts — 非模块文件，声明自动全局
interface Window {
  __APP_VERSION__: string;
}
```

```typescript
// types.ts — 模块文件，需要 declare global
export {};

declare global {
  interface String {
    capitalize(): string;
  }
}
```

### 模块增强

模块增强允许我们在不修改原始模块的情况下，为其添加新的类型定义：

```typescript
// express.d.ts
import 'express';

declare module 'express' {
  interface Request {
    user?: {
      id: string;
      role: 'admin' | 'user';
    };
  }
}
```

这种模式在框架扩展中非常常见，例如 Express 中间件向 `Request` 对象添加自定义属性。

### 三斜线指令

在 TypeScript 的早期版本中，三斜线指令是组织声明文件的主要方式。虽然现在推荐使用 ES 模块语法，但在某些场景下仍然会见到：

```typescript
/// <reference path="./types/global.d.ts" />
/// <reference types="node" />
/// <reference lib="es2022" />
```

## 模块7：SDK 声明文件实战

让我们通过本章的 SDK 示例，完整地分析一个实际项目的声明文件设计。

### 项目结构

```
ch09-dts-sdk/
  src/
    index.ts        # SDK 实现
  types/
    index.d.ts      # 手写声明文件
  tests/
    types.test.ts   # 类型测试
```

### 声明文件设计思路

1. **接口优先**：首先定义 `SDKConfig` 接口，明确配置项的完整结构。相比实现中的匿名类型，接口提供了更好的文档和可扩展性。

2. **方法重载**：`getUser` 方法提供了两种调用方式——按 ID 查询和按邮箱查询。声明文件中的重载签名比实现更丰富，为用户提供了更清晰的 API 视图。

3. **泛型方法**：`create<T>` 方法使用泛型来保持输入和输出类型的一致性，同时通过 `extends Record<string, unknown>` 约束确保参数是对象类型。

4. **全局声明**：通过 `declare global` 扩展 `Window` 接口，为 SDK 的版本信息提供类型支持。

5. **类型导出**：`User` 接口被单独导出，方便使用者直接引用。

### 类型测试

使用 `tsd` 工具可以对声明文件进行自动化测试：

```typescript
import { expectType, expectError } from 'tsd';
import { SDK } from '../types';

const sdk = new SDK({ baseUrl: 'https://api.example.com' });
expectType<Promise<{ id: string; name: string; email: string }>>(sdk.getUser('1'));
expectError(sdk.getUser(123)); // 编译错误：参数类型不匹配
```

`tsd` 会在编译时验证类型是否正确，如果类型不匹配或应该报错的地方没有报错，测试就会失败。

## 模块8：声明文件的最佳实践与常见陷阱

### 最佳实践

**保持声明与实现同步**：声明文件与实现代码分离时，很容易出现不同步的问题。建议在 CI 流程中加入类型检查步骤，确保声明文件与实现保持一致。

**优先使用接口而非类型别名**：接口支持声明合并，更易于扩展。对于库的作者来说，使用接口可以让使用者更容易地扩展类型。

**提供完整的 JSDoc 注释**：声明文件中的注释会直接显示在 IDE 的提示中，是 API 文档的重要组成部分。

```typescript
/**
 * 创建用户
 * @param data 用户数据
 * @returns 包含新用户 ID 的 Promise
 */
declare function createUser(data: CreateUserInput): Promise<{ id: string }>;
```

**使用 `unknown` 而非 `any`**：在声明文件中，`unknown` 比 `any` 更安全，因为它强制使用者进行类型检查。

**导出所有公开类型**：确保所有使用者可能需要的类型都被导出，避免使用者被迫自己定义类型。

### 常见陷阱

**声明文件路径不匹配**：`package.json` 中的 `types` 字段必须指向正确的声明文件路径。路径错误会导致 TypeScript 无法找到类型定义。

**忽略全局声明的作用域**：在模块文件中使用 `declare global` 时，必须确保文件至少有一个顶级 `export` 或 `import`，否则 `declare global` 不会生效。

**重载顺序错误**：TypeScript 在匹配重载时，会按声明顺序从上到下匹配。更具体的重载应该放在前面，更通用的放在后面。

```typescript
// 错误：通用的在前面，永远不会匹配到具体的
declare function format(input: string): string;
declare function format(input: string, format: 'json'): object;

// 正确：具体的在前面
declare function format(input: string, format: 'json'): object;
declare function format(input: string): string;
```

**忘记处理 `this` 类型**：在回调函数中，`this` 的类型需要显式声明：

```typescript
declare function onEvent(callback: (this: HTMLElement, e: Event) => void): void;
```

**过度使用 `namespace`**：在 ES 模块时代，`namespace` 已经不再是推荐的组织方式。优先使用模块和导出。

### 总结

声明文件是 TypeScript 生态中不可或缺的组成部分。掌握声明文件的编写技巧，不仅能够让我们更好地使用第三方库，还能提升我们自己库的用户体验。通过本章的学习，读者应该能够理解声明文件的核心概念，掌握函数重载、声明合并、泛型等高级技巧，并能够在实际项目中编写高质量的声明文件。

下一章，我们将探讨复杂状态机建模，学习如何利用 TypeScript 的类型系统来建模复杂的业务状态流转。
