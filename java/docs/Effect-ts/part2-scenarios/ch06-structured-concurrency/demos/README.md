# Effect 高并发控制与结构化并发 — 演示项目

本演示项目对应《Effect 实战》第六章「高并发控制与结构化并发」的代码示例。

## 项目结构

```
demos/
├── src/
│   ├── concurrency.ts      # Fiber、Semaphore、Race、Timeout 示例
│   └── main.ts             # 入口演示
├── tests/
│   └── concurrency.test.ts # 并发控制测试
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## 核心概念演示

### 1. Fiber 并行 (fork/join)

使用 `Effect.fork` 将任务放入独立 Fiber 中执行，通过 `Fiber.join` 等待结果：

```typescript
const fiber1 = yield* _(Effect.fork(Effect.succeed("task1-done")))
const fiber2 = yield* _(Effect.fork(Effect.succeed("task2-done")))
const result1 = yield* _(Fiber.join(fiber1))
const result2 = yield* _(Fiber.join(fiber2))
```

### 2. Semaphore 限流

通过信号量控制并发度，限制同时执行的任务数量：

```typescript
const semaphore = yield* _(Effect.makeSemaphore(5))
// 最多同时 5 个请求
const tasks = urls.map((url) => semaphore.withPermits(1)(fetchUrl(url)))
```

### 3. 竞态 (Race)

多个任务竞争，谁先完成就返回谁的结果，其余任务自动取消：

```typescript
const winner = yield* _(Effect.race(taskA, taskB))
```

### 4. 超时控制 (Timeout)

为任务设置超时限制，超时后自动失败并清理资源：

```typescript
Effect.sleep("100 millis").pipe(
  Effect.flatMap(() => Effect.succeed("completed")),
  Effect.timeout("50 millis"),
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