# 附录 B：从 pipe 链式调用迁移到 Effect.gen (Generator) 的重构指南

## 为什么推荐 Effect.gen？

Effect.gen 使用 JavaScript Generator 语法，让 Effect 代码看起来像普通的 async/await，同时保留了 Effect 的全部优势（取消、类型安全、资源管理）。

**pipe 写法的问题：**
- 深层嵌套时类型推导链过长，导致 tsserver 卡顿
- 错误处理分散在链式调用中，可读性差
- 条件分支和循环难以表达

**Effect.gen 的优势：**
- 同步风格的代码，易于阅读和维护
- 类型推导链更短，IDE 性能更好
- 自然的条件分支和循环支持

## 基础迁移模式

### 简单映射

**Before (pipe):**
```typescript
import { pipe, Effect } from "effect"

const program = pipe(
  getUser(id),
  Effect.map(user => user.name)
)
```

**After (Effect.gen):**
```typescript
import { Effect } from "effect"

const program = Effect.gen(function*() {
  const user = yield* getUser(id)
  return user.name
})
```

### 链式 flatMap

**Before (pipe):**
```typescript
const program = pipe(
  getUser(id),
  Effect.flatMap(user => pipe(
    getOrders(user.id),
    Effect.map(orders => ({ user, orders }))
  ))
)
```

**After (Effect.gen):**
```typescript
const program = Effect.gen(function*() {
  const user = yield* getUser(id)
  const orders = yield* getOrders(user.id)
  return { user, orders }
})
```

### 错误处理

**Before (pipe):**
```typescript
const program = pipe(
  fetchData(url),
  Effect.catchAll(error => Effect.succeed(fallback)),
  Effect.map(data => process(data))
)
```

**After (Effect.gen):**
```typescript
const program = Effect.gen(function*() {
  const data = yield* fetchData(url).pipe(
    Effect.catchAll(error => Effect.succeed(fallback))
  )
  return process(data)
})
```

### 条件分支

**Before (pipe):**
```typescript
const program = pipe(
  getUser(id),
  Effect.flatMap(user =>
    user.role === "admin"
      ? getAdminDashboard(user.id)
      : getUserDashboard(user.id)
  )
)
```

**After (Effect.gen):**
```typescript
const program = Effect.gen(function*() {
  const user = yield* getUser(id)
  if (user.role === "admin") {
    return yield* getAdminDashboard(user.id)
  }
  return yield* getUserDashboard(user.id)
})
```

### 循环

**Before (pipe):**
```typescript
const program = pipe(
  getUsers(),
  Effect.flatMap(users =>
    Effect.all(users.map(user => processUser(user)))
  )
)
```

**After (Effect.gen):**
```typescript
const program = Effect.gen(function*() {
  const users = yield* getUsers()
  const results = []
  for (const user of users) {
    results.push(yield* processUser(user))
  }
  return results
})
```

## 混合使用

Effect.gen 内部仍然可以使用 pipe 处理局部逻辑：

```typescript
const program = Effect.gen(function*() {
  const user = yield* getUser(id)

  // 局部转换仍然可以用 pipe
  const displayName = pipe(
    user.name,
    StringUtils.capitalize,
    StringUtils.trim
  )

  return displayName
})
```

## 常见陷阱

### 忘记 yield*
```typescript
// ❌ 错误：Effect 被创建但不执行
const user = getUser(id)  // 返回 Effect，但未执行

// ✅ 正确：使用 yield* 执行 Effect
const user = yield* getUser(id)
```

### 在 Effect.gen 中使用 return
```typescript
// ✅ 正确：return 直接返回值
const program = Effect.gen(function*() {
  return "hello"
})
// 类型：Effect<string, never, never>

// ❌ 错误：return 一个 Effect
const program = Effect.gen(function*() {
  return getUser(id)  // 返回 Effect<Effect<User,...>,...>
})
```

### 错误处理位置
```typescript
// ✅ 推荐：在 Effect.gen 外部处理错误
const program = Effect.gen(function*() {
  const data = yield* fetchData(url)
  return process(data)
}).pipe(
  Effect.catchAll(error => Effect.succeed(fallback))
)

// ✅ 也可以在内部处理
const program = Effect.gen(function*() {
  const data = yield* fetchData(url).pipe(
    Effect.catchAll(error => Effect.succeed(fallback))
  )
  return process(data)
})
```

## 迁移策略

1. **从叶子节点开始**：先迁移最内层的 Effect 调用
2. **保持外部 pipe**：迁移内部后，外部 pipe 仍然可以保留
3. **逐步替换**：不需要一次性全部迁移
4. **类型标注**：在模块边界显式标注类型，帮助编译器
