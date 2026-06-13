# TS 5.x+ 新特性

## 1. 使用场景

TypeScript 5.x 系列引入了多项重要特性，改变了类型系统的使用方式。主要使用场景包括：

- **更精确的类型推导**：const 类型参数、改进的 narrowing
- **装饰器标准化**：TC39 标准装饰器替代旧式装饰器
- **模块增强**：新的模块解析策略和导入方式
- **性能优化**：更快的编译速度和更小的包体积
- **AI 辅助开发**：类型生成和代码补全的新范式

## 2. 实现原理

### const 类型参数

TypeScript 5.0 引入了 `const` 类型参数，用于保留字面量类型的精确性：

```typescript
// 传统方式：类型参数会拓宽
function getConfig<T extends string>(key: T) {
  return config[key];
}

const key = "server.port";
const value = getConfig(key);
// value 的类型是 string，不是字面量类型

// 使用 const 类型参数
function getConfigV2<const T extends string>(key: T) {
  return config[key];
}

const key2 = "server.port";
const value2 = getConfigV2(key2);
// value2 的类型是 "server.port"（字面量类型保留）

// 更实用的例子
function tuple<const T extends readonly unknown[]>(...args: T): T {
  return args;
}

const result = tuple("hello", 42, true);
// result 的类型是 readonly ["hello", 42, true]
// 而不是 (string | number | boolean)[]
```

**实现原理**：`const` 类型参数告诉编译器将类型参数推断为字面量类型（或 `readonly` 元组），而不是拓宽为基类型。这类似于在调用处使用 `as const`，但由函数声明控制。

### TC39 标准装饰器

TypeScript 5.0 实现了 TC39 Stage 3 的装饰器标准，与旧式装饰器有本质区别：

```typescript
// 旧式装饰器（experimentalDecorators）
function log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with`, args);
    return original.apply(this, args);
  };
}

class MyClass {
  @log
  method(value: string) {
    return value.toUpperCase();
  }
}

// TC39 标准装饰器（TS 5.0+）
function logged<T, C extends { new (...args: any[]): any }>(
  target: T,
  context: ClassMethodDecoratorContext
) {
  return function (this: any, ...args: any[]) {
    console.log(`Calling ${String(context.name)} with`, args);
    return target.apply(this, args);
  };
}

class MyClass2 {
  @logged
  method(value: string) {
    return value.toUpperCase();
  }
}
```

**标准装饰器 vs 旧式装饰器**：

| 特性 | 旧式装饰器 | 标准装饰器 |
|------|-----------|-----------|
| 编译选项 | experimentalDecorators | 无需选项 |
| 参数签名 | (target, key, descriptor) | (target, context) |
| 返回值 | 替换 descriptor | 替换函数/类 |
| 类型安全 | 弱 | 强（context 携带类型信息） |
| 异步支持 | 有限 | 原生支持 |

### 模块增强

TypeScript 5.x 在模块系统方面有多项改进：

```typescript
// 1. 新的模块解析策略
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",  // TS 5.0+
    "module": "preserve"            // TS 5.4+
  }
}

// 2. 导入增强
// TS 5.3+ 支持 type-only 导入的自动补全
import type { User } from "./types";

// 3. 导出类型
// TS 5.0+ 支持 export type * from
export type * from "./types";

// 4. 条件类型中的模板字面量增强
// TS 5.1+ 支持模板字面量中的枚举
enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

type ColorKey = `color-${Color}`;
// "color-red" | "color-green" | "color-blue"
```

### 性能优化

TypeScript 5.x 在编译性能方面有显著提升：

```typescript
// 1. 包体积减少
// TS 5.0 从 63.8MB 减少到 56.4MB（约 12%）

// 2. 编译速度提升
// TS 5.3 在大型项目上编译速度提升约 20%

// 3. 类型检查优化
// - 更智能的缓存策略
// - 减少不必要的类型实例化
// - 改进的增量编译

// 4. --isolatedDeclarations
// TS 5.5+ 支持独立声明生成
// 允许 esbuild/SWC 等工具生成 .d.ts 文件
{
  "compilerOptions": {
    "isolatedDeclarations": true
  }
}
```

## 3. 潜在风险

### 装饰器迁移风险

```typescript
// 风险：旧式装饰器在 TS 5.x 中仍受支持，但未来可能废弃
// 新项目应使用标准装饰器
// 旧项目迁移需要注意 API 差异

// 旧式装饰器（将被废弃）
@logMethod
method() {}

// 标准装饰器（推荐）
@logged
method() {}
```

### 新特性兼容性

```typescript
// 风险：const 类型参数需要 TS 5.0+
// 如果项目使用旧版本 TS，无法使用

// 风险：bundler moduleResolution 需要打包工具支持
// 如果使用 ts-node 直接运行，可能不兼容
```

## 4. 优化策略

### 渐进式升级

```typescript
// 从 TS 4.x 升级到 5.x 的策略
// 1. 升级 TypeScript 版本
npm install typescript@latest --save-dev

// 2. 检查 breaking changes
// https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes

// 3. 逐步启用新特性
// 先在非关键模块使用 const 类型参数
// 再迁移装饰器
// 最后启用新的模块解析策略
```

### 利用新特性简化代码

```typescript
// 使用 const 类型参数简化元组操作
function zip<const T extends readonly unknown[], const U extends readonly unknown[]>(
  a: T,
  b: U
): { [K in keyof T & keyof U]: [T[K], U[K]] } {
  return a.map((item, i) => [item, b[i]]) as any;
}

const zipped = zip(["a", "b"] as const, [1, 2] as const);
// zipped: [["a", 1], ["b", 2]]
```

## 5. 典型问题处理

### 问题：标准装饰器中的类型安全

```typescript
// 标准装饰器的类型安全使用
function validate<T extends Record<string, any>>(
  validator: (value: T) => boolean
) {
  return function (
    target: undefined,
    context: ClassFieldDecoratorContext
  ) {
    return function (this: any, initialValue: T) {
      if (!validator(initialValue)) {
        throw new Error(`Invalid value for ${String(context.name)}`);
      }
      return initialValue;
    };
  };
}

class User {
  @validate((v: string) => v.length > 0)
  name: string = "";
}
```

### 问题：const 类型参数与 readonly

```typescript
// const 类型参数自动推断为 readonly
function createArray<const T extends readonly unknown[]>(...items: T): T {
  return items;
}

const arr = createArray(1, "hello", true);
// arr: readonly [1, "hello", true]

// 如果需要可变数组，需要显式转换
const mutableArr = [...createArray(1, "hello", true)];
// mutableArr: (1 | "hello" | true)[]
```

## 6. 开发者技能

掌握 TS 5.x+ 新特性的核心技能：

1. **const 类型参数**：保留字面量类型精确性
2. **标准装饰器**：理解 TC39 标准装饰器的 API 差异
3. **模块解析**：掌握 bundler/preserve 等新策略
4. **性能优化**：利用 --isolatedDeclarations 等新选项
5. **AI 辅助**：了解 AI 类型生成的最佳实践

## 7. 示例代码

### 使用 const 类型参数构建类型安全 API

```typescript
// 类型安全的配置 API
function defineConfig<const T extends Record<string, any>>(config: T): T {
  return config;
}

const config = defineConfig({
  server: {
    port: 3000,
    host: "localhost",
  },
  database: {
    url: "postgres://localhost:5432/db",
    pool: {
      min: 2,
      max: 10,
    },
  },
});

// config 的类型保留了所有字面量值
// config.server.port 的类型是 3000（字面量类型）
// config.database.pool.min 的类型是 2
```

### 标准装饰器实战

```typescript
// 标准装饰器实现依赖注入
const container = new Map<string, any>();

function inject(token: string) {
  return function (
    target: undefined,
    context: ClassFieldDecoratorContext
  ) {
    return function (this: any) {
      return container.get(token);
    };
  };
}

class UserService {
  @inject("db")
  private db!: Database;

  @inject("logger")
  private logger!: Logger;

  async getUser(id: string) {
    this.logger.info(`Fetching user ${id}`);
    return this.db.query("SELECT * FROM users WHERE id = ?", [id]);
  }
}

// 注册依赖
container.set("db", new Database());
container.set("logger", new Logger());
```

### AI 辅助类型生成

```typescript
// AI 辅助类型生成的最佳实践
// 1. 为 AI 提供清晰的类型上下文
interface AIRequest {
  code: string;
  context: {
    existingTypes: string;
    framework: string;
    version: string;
  };
}

// 2. 使用 JSDoc 提供类型提示
/**
 * @param {string} name - The user's name
 * @param {number} age - The user's age
 * @returns {{ name: string; age: number }}
 */
function createUser(name: string, age: number) {
  return { name, age };
}

// 3. 利用 AI 生成类型守卫
// AI 可以根据 Zod Schema 自动生成类型守卫
// 或根据 API 文档生成类型定义
```

## 8. 小结

TypeScript 5.x+ 新特性的核心要点：

- **const 类型参数**：保留字面量类型精确性，简化元组和配置类型
- **TC39 标准装饰器**：替代旧式装饰器，提供更好的类型安全和标准化
- **模块增强**：bundler 解析策略、preserve 模块模式、export type *
- **性能优化**：包体积减少、编译速度提升、--isolatedDeclarations
- **渐进式升级**：从 4.x 到 5.x 的平滑迁移策略
- **AI 辅助**：利用 AI 生成类型定义和类型守卫
- **未来方向**：更快的编译速度、更好的类型推导、更紧密的 ECMAScript 标准对齐
