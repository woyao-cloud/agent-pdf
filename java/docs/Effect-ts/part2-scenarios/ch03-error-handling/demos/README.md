# Effect 错误处理与领域建模 — 演示项目

本演示项目对应《Effect 实战》第三章「错误处理与领域建模」的完整代码示例。

## 项目结构

```
demos/
├── src/
│   ├── models/
│   │   └── user.ts              # 领域模型（User, Order）
│   ├── errors/
│   │   └── user-errors.ts       # 领域错误类型（TaggedError）
│   ├── services/
│   │   ├── user-service.ts      # 用户查询服务
│   │   ├── order-service.ts     # 订单查询服务
│   │   └── order-query-service.ts  # 聚合查询 + 错误映射
│   ├── controllers/
│   │   └── user-controller.ts   # HTTP 控制器（错误恢复）
│   └── main.ts                  # 入口演示
├── tests/
│   └── controller.test.ts       # 控制器测试
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## 核心概念演示

### 1. 领域错误类型（TaggedError）

使用 `Data.TaggedError` 声明类型安全的错误，每个错误带有一个唯一的 `_tag` 字段，
支持 `catchTag` / `match` 等精确匹配 API。

```typescript
export class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
```

### 2. 错误类型组合（Union Error Type）

每个 Effect 的第二个类型参数声明可能抛出的所有错误：

```typescript
Effect.Effect<User, UserNotFound | DatabaseError, never>
```

### 3. 错误映射（mapError）

将底层服务错误统一映射为 HTTP 错误，抽象层边界：

```typescript
Effect.mapError((err) => {
  switch (err._tag) {
    case "UserNotFound": return new HttpError({ statusCode: 404, ... })
    case "DatabaseError":
    case "NetworkError": return new HttpError({ statusCode: 502, ... })
  }
})
```

### 4. 错误恢复（catchTag）

在控制器层将 Effect 错误恢复为正常值，消除错误类型：

```typescript
Effect.catchTag("HttpError", (err) =>
  Effect.succeed({ status: err.statusCode, body: JSON.stringify({ error: err.message }) })
)
```

## 运行方式

```bash
# 安装依赖
pnpm install

# 运行演示
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```