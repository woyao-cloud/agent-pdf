# 第四章：依赖注入与 Context 演示

本 demo 演示 Effect-TS 中基于 `Context.Tag` 和 `Layer` 的依赖注入模式。依赖注入将 **依赖声明** 与 **具体实现** 解耦，使代码更可测试、可维护。

## 核心概念

| 概念          | 说明                                                               |
| ------------- | ------------------------------------------------------------------ |
| `Context.Tag` | 定义一个依赖的 **接口**（Service 标识符），不绑定具体实现            |
| `Layer`       | 将 `Tag` 与具体实现绑定，构建出可组合的依赖层                        |
| `Effect.provide` | 将 `Layer` 注入到 `Effect` 中，使 `Effect` 在执行时能访问到对应实例 |

## 文件结构

```
demos/
├── src/
│   ├── di.ts            # Tag 声明 + 各依赖的 Live 实现 + AppLayer 组合
│   ├── user-service.ts  # 业务逻辑，通过 yield* 取用依赖
│   └── main.ts          # 入口：将 AppLayer 注入程序并运行
├── tests/
│   └── di.test.ts       # 演示单元测试中用 Mock Layer 替换真实实现
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## 运行方式

```bash
# 安装依赖
pnpm install

# 运行主程序（观察 DI 输出日志 + 查询结果）
pnpm dev

# 运行测试
pnpm test
```

## 关键模式

### 1. 声明 Tag（定义接口）

```ts
export class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<any[]> }
>() {}
```

- `Context.Tag("Database")` 为 Tag 绑定一个唯一的标识键
- 第二个泛型参数描述该服务提供了哪些方法

### 2. 实现 Layer（绑定实现）

```ts
export const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.sync(() => mockDb.users),
})
```

- `Layer.succeed` 将一个值（通常是一个对象/实现）绑定到 Tag 上

### 3. 在业务代码中消费依赖

```ts
const db = yield* _(Database)
const logger = yield* _(Logger)
```

- `yield* _(Database)` 从当前的 `Context` 中取出 Database 实例，强类型推导

### 4. 注入到 Effect

```ts
const main = listUsers.pipe(Effect.provide(AppLayer))
```

- `Effect.provide` 将 Layer 中的所有服务注入到 Effect，程序运行时即可访问

### 5. 测试时替换依赖

在测试中，你可以创建只包含 Mock 的 Layer，不依赖真实的 Logger 或数据库：

```ts
class TestDb extends Context.Tag("TestDb")<TestDb, { ... }>() {}
const TestDbLive = Layer.succeed(TestDb, {
  query: () => Effect.succeed([{ id: "test-1", name: "Test User" }]),
})
const program = listUsers.pipe(Effect.provide(TestDbLive))
```

## Effect-TS 版本

本项目使用 `effect@^3.0.0`，Tag + Layer 模式是该版本的标准 DI 方式。