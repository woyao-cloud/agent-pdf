# ch15 性能调优 Checklist

## 概述

Effect-TS 的类型安全和结构化并发在带来开发效率的同时，也引入了抽象开销。本章提供了一份可操作的性能调优清单，涵盖对象分配、批处理、并发、同步/异步边界等关键维度。每项调优都附有可测量的**验证方法**，避免"我感觉变快了"的猜测式优化。

---

## 1. 对象分配优化

Effect-TS 的 `Effect` 本身就是一个对象，频繁创建微小的 `Effect` 会增加 GC 压力。

### 1.1 减少 Effect 对象创建

```typescript
import { Effect, Console } from "effect"

// ❌ 每次循环都创建新的 Effect.sync
const badLoop = Effect.forEach(
  Array.from({ length: 10000 }),
  (_, i) => Effect.sync(() => i * 2)
)

// ✅ 使用纯函数 + 外层 Effect
const betterLoop = Effect.sync(() =>
  Array.from({ length: 10000 }, (_, i) => i * 2)
)
// 单次 Effect 创建，内部是纯数组操作

// ✅ 使用 Stream 的 transform（如果数据源是流式）
import { Stream } from "effect"
const streamTransform = Stream.range(0, 10000).pipe(
  Stream.map((i) => i * 2),
  Stream.runCollect
)
// Stream.map 内部使用 chunked 处理，减少分配
```

### 1.2 避免过深的 pipe 链

每个 `pipe` 调用都会创建中间函数闭包：

```typescript
// ❌ 8 层 pipe，创建 8 个闭包
const deepPipe = initial.pipe(
  Effect.map(f1),
  Effect.map(f2),
  Effect.flatMap(f3),
  Effect.map(f4),
  Effect.tap(f5),
  Effect.map(f6),
  Effect.map(f7),
  Effect.map(f8)
)

// ✅ 合并相邻的纯 map
const merged = initial.pipe(
  Effect.map((x) => f2(f1(x))),    // 合并 f1 + f2
  Effect.flatMap(f3),
  Effect.map((x) => f8(f7(f6(f5(x))))) // 合并剩余的纯转换
)
// 从 8 个闭包减少到 3 个
```

### 1.3 使用 Effect.sync 而非 Effect.succeed

```typescript
// ❌ Effect.succeed(computation()) —— computation 已执行
const worse = Effect.succeed(expensiveComputation())

// ✅ Effect.sync(() => computation()) —— 惰性求值
const better = Effect.sync(() => expensiveComputation())
// 同时避免了 compute → wrap → unwrap 的中间状态
```

---

## 2. 批处理（Batching）

批处理是 Effect-TS 最重要的性能优化手段，特别适合 I/O 密集场景。

### 2.1 内置 Batching

`@effect/platform` 的 HTTP 和 DataLoader 风格批处理：

```typescript
import { Effect, batch } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"

// 设置 batching 上下文
const program = Effect.gen(function* (_) {
  const client = yield* _(HttpClient.client)
  
  // 多个请求在同一个 batch 上下文中
  const results = yield* _(Effect.forEach(
    ["user-1", "user-2", "user-3", "user-4"],
    (id) =>
      HttpClientRequest.get(`/api/users/${id}`).pipe(
        HttpClient.letClient(client),
        Effect.andThen(HttpClientResponse.json)
      ),
    { concurrency: "unbounded", batching: true } // 🔑 开启批处理
  ))
  
  return results
})
// 如果后端支持，多个请求可以被合并为一个
```

### 2.2 手动批量

```typescript
import { Effect, Stream, Chunk } from "effect"

// ❌ 逐条处理
const individual = Effect.forEach(
  items,
  (item) => apiCall(item),
  { concurrency: 4 } // 最多 4 并发
)

// ✅ 批量处理
const batched = Stream.fromIterable(items).pipe(
  Stream.grouped(100), // 每 100 条一批
  Stream.mapEffect((chunk) =>
    batchApiCall(Chunk.toReadonlyArray(chunk))
  ),
  Stream.runCollect
)
// 减少网络往返次数：10000 条 / 100 每批 = 100 次请求

// 数据库批量插入
const batchInsert = (rows: Array<{ id: string; data: string }>) =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        // 单条 INSERT ... VALUES (...) 比逐条快 10-100 倍
        const values = rows.map((r) => `('${r.id}', '${r.data}')`).join(",")
        await tx.execute(`INSERT INTO items VALUES ${values}`)
      }),
    catch: (err) => new Error(`Batch insert failed: ${err}`)
  })
```

### 2.3 Batching 策略对比

| 策略 | 适用场景 | 吞吐提升 |
|------|---------|---------|
| 单条并发 | 延迟敏感，少量请求 | 1x |
| 批量 + 并发 | 大量 I/O，可合并 | 10-50x |
| Stream chunked | 流式数据 | 2-5x |
| DataLoader | 嵌套 N+1 查询 | 10-100x |

---

## 3. 同步 vs 异步界限

Effect-TS 支持同步和异步两种模式，合理选择能减少运行时调度开销。

### 3.1 Effect.sync vs Effect.promise vs Effect.async

```typescript
import { Effect, Console } from "effect"

// ✅ 纯同步计算 —— 零调度开销
const sync = Effect.sync(() => {
  let sum = 0
  for (let i = 0; i < 1000000; i++) sum += i
  return sum
})

// ✅ 已有 Promise 的异步
const fromPromise = Effect.tryPromise({
  try: () => fetch("/api/data").then((r) => r.json()),
  catch: (err) => new Error(String(err))
})

// ❌ 不必要的异步包装
const unnecessaryAsync = Effect.async<number>((resume) => {
  resume(Effect.succeed(42))
})
// 等价于 Effect.succeed(42)，但多了异步调度的开销

// ✅ 在同步和异步之间明确标记
const mixed = Effect.gen(function* (_) {
  // 同步部分
  const config = yield* _(Effect.sync(() => loadLocalConfig()))
  
  // 异步部分
  const data = yield* _(
    Effect.tryPromise(() => fetchRemoteData(config.endpoint))
  )
  
  // 同步处理
  return yield* _(Effect.sync(() => processData(data)))
})
```

### 3.2 避免频繁的同步/异步切换

```typescript
// ❌ 在循环中频繁切换同步/异步
const bad = Effect.forEach(items, (item) =>
  Effect.sync(() => item).pipe(
    Effect.flatMap((x) => asyncProcess(x)) // 每个元素: sync → async → sync → async ...
  )
)

// ✅ 批量: 先同步处理 → 一次异步
const good = Effect.gen(function* (_) {
  const processed = items.map((x) => preprocess(x)) // 纯同步
  const result = yield* _(asyncProcess(processed))   // 一次异步
  return result
})
```

---

## 4. 并发配置

### 4.1 找到合适的 concurrency 值

```typescript
import { Effect } from "effect"

// 不是越大越快
// concurrency: "unbounded" 可能耗尽系统资源

// 经验公式：
// concurrency = CPU 核心数                 （CPU 密集型）
// concurrency = (IO 延迟 / CPU 处理时间)   （I/O 密集型）
//   ≈ 100~500 对于典型 HTTP 调用

// 建议：配置为可调参数
const CONCURRENCY = parseInt(
  process.env.EFFECT_CONCURRENCY ?? "10",
  10
)

const tuned = Effect.forEach(
  tasks,
  (task) => processTask(task),
  { concurrency: CONCURRENCY }
)
```

### 4.2 Structured Concurrency 的开销

```typescript
import { Effect, Scope, Console } from "effect"

// ❌ 每个 Fiber 都创建 Scope 可能很昂贵
Effect.scoped(
  Effect.gen(function* (_) {
    for (const item of items) {
      yield* _(
        Effect.gen(function* (__) {
          // 每个 item 一个 Scope
          const conn = yield* _(acquireConnection().pipe(Effect.acquireRelease))
          yield* __(conn.query(item))
        }).pipe(Effect.scoped, Effect.fork)
      )
    }
  })
)

// ✅ 重用 Scope（如果允许）
Effect.scoped(
  Effect.gen(function* (_) {
    const conn = yield* _(acquireConnection().pipe(Effect.acquireRelease))
    
    const results = yield* _(Effect.forEach(
      items,
      (item) => conn.query(item),
      { concurrency: 4 }
    ))
    
    return results
  })
)
// 同一个 Scope 管理一个连接池，减少 acquire/release 次数
```

---

## 5. 缓存与 Memoization

### 5.1 Effect.cached

```typescript
import { Effect } from "effect"

// 昂贵的计算结果缓存
const expensiveOperation = Effect.cached(
  Effect.sync(() => {
    console.log("computing...")
    return heavyComputation()
  })
)

// 多次调用，但计算只执行一次
Effect.runPromise(expensiveOperation) // "computing..." ✅ 实际计算
Effect.runPromise(expensiveOperation) // 返回缓存值
Effect.runPromise(expensiveOperation) // 返回缓存值
```

### 5.2 带有效期的缓存

```typescript
import { Effect, Duration } from "effect"

const cachedWithTTL = (ttl: Duration.DurationInput) =>
  Effect.cachedWithTTL({
    create: () => fetchAccessToken(),
    capacity: 100,
    timeToLive: ttl
  })
```

---

## 6. 避免常见的性能陷阱

| 陷阱 | 影响 | 修正 |
|------|------|------|
| 不必要的大量 `Effect.gen` 嵌套 | 类型推导 + 运行时开销 | 使用 `pipe` 或纯函数 |
| `forEach` + `concurrency: unbounded` | 系统资源耗尽 | 设置合理的 concurrency |
| 深层 Control Flow（过深的 match） | 条件分支评估开销 | 提前返回，扁平化 |
| `Effect.sleep(0)` 繁忙等待 | CPU 空转 | 使用 Queue 或 Queue.take |
| 不必要的序列化/反序列化 | 内存 + CPU 开销 | 使用类型化的 Chunk/Record |

---

## 7. 基准测试模板

```typescript
import { Effect, Console, Duration } from "effect"

const benchmark = <A, E>(
  name: string,
  effect: Effect.Effect<A, E, never>,
  iterations: number = 1000
) =>
  Effect.gen(function* (_) {
    // 预热
    yield* _(effect)
    yield* _(effect)
    
    const start = yield* _(Effect.sync(() => Date.now()))
    
    for (let i = 0; i < iterations; i++) {
      yield* _(effect)
    }
    
    const elapsed = Date.now() - start
    const avgMs = elapsed / iterations
    
    Console.log(`[bench] ${name}: ${iterations} iterations in ${elapsed}ms (avg ${avgMs.toFixed(3)}ms)`)
    
    return { name, iterations, elapsed, avgMs }
  })

// 使用
const v1 = benchmark("sync only", Effect.sync(() => heavyWork()))
const v2 = benchmark("with map", Effect.sync(() => heavyWork()).pipe(Effect.map((x) => x)))
```

---

## 8. 性能调优流程

```
发现性能问题
    ↓
定位瓶颈（profiling / metrics）
    ↓
检查 Checklist 清单
    ↓
实施优化（一次一项）
    ↓
基准测试验证
    ↓
对比基线数据
    ↓
优化有效？→ 继续下一项
优化无效？→ 回退，换方案
```

**启动 Checklist（按优先级）**：

1. [ ] 是否开启了 `batching: true`（I/O 密集场景）
2. [ ] 是否使用了合适的并发度（非 `unbounded`）
3. [ ] 是否存在无意义的 `Effect.gen` 嵌套
4. [ ] 纯计算是否从 Effect 中提取出来
5. [ ] Scope 管理是否合理（避免过多 acquire/release）
6. [ ] 是否使用了 `Stream` 的 `chunkSize` 控制
7. [ ] 缓存是否应用在合适的层级
8. [ ] 同步/异步边界是否清晰标记

```typescript
// 示例：应用 Checklist 的改善前后对比
// 前：逐条处理 10000 条数据
Effect.forEach(data, apiCall)
// 后：批量 100 条，并发 4，开启 batching
Stream.fromIterable(data).pipe(
  Stream.grouped(100),
  Stream.mapEffect((chunk) => batchApiCall(Chunk.toReadonlyArray(chunk)), {
    concurrency: 4
  }),
  Stream.runCollect
)
// 改善：网络往返从 10000 次降低到 100 次
```

---

## 参考

- Effect-TS 性能指南：https://effect.website/docs/guides/performance
- Node.js 性能火焰图：`node --prof --trace-deopt app.js`
- 相关章节：ch07（Stream 性能）、ch08（Queue/Hub 背压）、ch13（DX 性能）