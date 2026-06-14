# ch15 性能调优

## 使用场景

你用 Effect 重构了一个 Node.js 服务，部署后发现 QPS 从 5000 降到了 3000——整整降了 40%。第一个念头是：Effect 就这么慢吗？

不，你很可能踩了性能陷阱。Effect-TS 本身的开销（每个 Effect 对象分配、Fiber 调度、类型安全的包装/解包）在大多数场景下在 1-5 微秒级别，对于 I/O 密集型的 Web 服务来说本应是微不足道的。但如果使用不当，这些微小的开销会通过循环、链式操作和非必要的异步边界被放大到可感知的程度。

具体何时需要关注性能？

- **高频循环**：在 `Effect.forEach` 中对数万条数据逐条处理时，每次迭代的 Effect 创建成本会累积
- **深层 pipe 链**：每个操作符都创建一个中间闭包，深链增加 GC 压力
- **同步/异步边界频繁切换**：调度器需要为每次切换做状态保存和恢复
- **不合理的并发度**：`concurrency: "unbounded"` 可能耗尽系统资源
- **未使用批处理**：N+1 查询逐个发起请求，网络往返时间和连接数成为瓶颈

调优的目标不是消灭所有开销（那会牺牲 Effect 带来的类型安全和结构化并发），而是**消除性价比特差的浪费**——那些只需要一两行改动就能带来数倍性能提升的优化点。

---

## 实现原理

### Effect 运行时的内部结构

一个 `Effect` 在运行时是一个**状态机 + 指令链**。每个操作符（`map`、`flatMap`、`tap` 等）向指令链追加一个节点。当 `Effect.run*` 执行时，运行时遍历这个链，处理每个节点。

### 闭包的内存代价

每个 `Effect.map` 或 `Effect.flatMap` 调用都会创建一个 JavaScript 闭包：

```typescript
// 这段代码：
Effect.sync(() => initialValue).pipe(
  Effect.map((a) => a + 1),   // 闭包 1：捕获了 a
  Effect.map((b) => b * 2),   // 闭包 2：捕获了 b
  Effect.map((c) => c - 1)    // 闭包 3：捕获了 c
)

// 运行时创建了 3 个外加 1 个顶层 Effect 对象
// 4 次分配，约 200-400 字节的临时内存
// 如果这个链在循环中执行 10000 次 → 2-4MB 的临时分配
```

在 V8 引擎中，Young Generation 的 GC 对小型对象的收集足够快，但大批量、高频的分配仍然会引起 GC 暂停。Node.js 应用中，超过 5% 的时间花在 GC 上时就应该关注分配模式。

### 调度器的同步优化

Effect 的运行时对**纯同步的 Effect**有特殊优化路径：当一个 Effect 链中所有操作都是同步的（`sync`、`succeed`、`map` 等），运行时会尽量在同一帧内完成执行，不进入异步队列。但如果链中出现一个 `Effect.async` 或 `Effect.tryPromise`，整个链会被"分界"——边界之后的部分会进入微任务队列。

---

## 潜在风险

### 风险 1：微小的单次开销通过高频率放大

一个 `Effect.sync(() => x)` 相比纯 `x` 的开销约 0.5-1 微秒。单次看确实微不足道。但如果是在一个每请求处理 10000 条数据的循环中，且循环体内还有 5 个 Effect 操作：

```
1 微秒 × 5 个操作 × 10000 条 × 100 QPS = 5 秒/秒的 CPU 时间
```

这意味着这个循环本身就要用掉一个 CPU 核心的全部时间——在 16 核机器上占 6.25%。

这种"微小放大"是最难发现的性能问题，因为任何单点都不像瓶颈。

### 风险 2：GC 压力静默增长

Effect 的大量对象分配会导致 GC 频率显著增加。GC 的代价是：

- Young Gen GC（Scavenge）：0.5-2ms，频繁发生
- Old Gen GC（Mark-Sweep）：10-100ms，较不频繁但暂停时间长

一个每秒分配 100MB 临时对象的应用，即使这些对象 99% 被快速回收，GC 开销也能吃掉 3-5% 的 CPU。

### 风险 3：异步边界被错误放置

将纯计算包装在 `Effect.async` 中会导致不必要的调度开销。假设一个纯计算过程需要 10ms，如果误用 `Effect.async`，这 10ms 会被分解到微任务队列中执行，增加调度器的管理负担和上下文切换成本。

### 风险 4：预防过度优化

过早优化是万恶之源。在看到实际性能问题之前就大量使用 Stream 分组、手动内联、使用底层 API 等"优化"手段，会让代码更难维护，且优化的效果可能微乎其微。**永远先测量，再优化。**

---

## 优化策略

### 策略 1：减少 Effect 对象分配

```typescript
import { Effect } from "effect"

// ❌ 每次循环都创建新的 Effect.sync
const badLoop = Effect.forEach(
  Array.from({ length: 10000 }),
  (_, i) => Effect.sync(() => i * 2)
)
// 创建 10000 个 Effect 对象

// ✅ 合成纯函数，外移 Effect
const betterLoop = Effect.sync(() =>
  Array.from({ length: 10000 }, (_, i) => i * 2)
)
// 1 个 Effect 对象

// ✅ 使用 Stream 的 chunk 处理
import { Stream } from "effect"
const streamWay = Stream.range(0, 10000).pipe(
  Stream.map((i) => i * 2),
  Stream.runCollect
)
// Stream 内部使用 chunked 处理，每批 4096 条只需 3 个 Effect
```

### 策略 2：合并相邻的纯 map

```typescript
// ❌ 8 个独立 map，创建 8 个闭包 + 8 个中间 Effect
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

// ✅ 合并相邻的纯 map，从 8 个闭包减少到 3 个
const merged = initial.pipe(
  Effect.map((x) => f2(f1(x))),
  Effect.flatMap(f3),
  Effect.map((x) => f8(f7(f6(f5(x)))))
)
```

### 策略 3：Effect.sync 优先于 Effect.succeed

```typescript
// ❌ effect.succeed(computation())——computation 已经执行完毕
// 只是把结果包了一层 Effect
const worse = Effect.succeed(expensiveComputation())

// ✅ Effect.sync(() => computation())——惰性求值
// 同时避免中间状态
const better = Effect.sync(() => expensiveComputation())
```

### 策略 4：Effect.sync 优先于 Effect.promise

```typescript
// ❌ Effect.promise 总是创建一个 Promise，即使计算是同步的
const fromPromise = Effect.promise(() => {
  let sum = 0
  for (let i = 0; i < 1000000; i++) sum += i
  return Promise.resolve(sum)
})

// ✅ Effect.sync 直接执行，零调度开销
const fromSync = Effect.sync(() => {
  let sum = 0
  for (let i = 0; i < 1000000; i++) sum += i
  return sum
})
```

### 策略 5：批量处理 I/O

```typescript
import { Effect, Stream, Chunk } from "effect"

// ❌ 逐条发起 I/O 请求
const individual = Effect.forEach(
  items,
  (item) => apiCall(item),
  { concurrency: 4 }
)

// ✅ 批量处理
const batched = Stream.fromIterable(items).pipe(
  Stream.grouped(100),
  Stream.mapEffect((chunk) =>
    batchApiCall(Chunk.toReadonlyArray(chunk))
  ),
  Stream.runCollect
)
// 网络往返从 10000 次降低到 100 次

// ✅ 开启内置 batching
const withBatching = Effect.forEach(
  items,
  (item) => apiCall(item),
  { concurrency: 4, batching: true }
)
```

### 策略 6：合理的并发度

```typescript
// concurrency: "unbounded" 可能耗尽系统资源
// 经验公式：
//   CPU 密集型 → concurrency = CPU 核心数
//   I/O 密集型 → concurrency = IO延迟 / CPU处理时间（约 100-500）

// 建议配置为可调参数
const CONCURRENCY = parseInt(
  process.env.EFFECT_CONCURRENCY ?? "10", 10
)

const tuned = Effect.forEach(tasks, processTask, {
  concurrency: CONCURRENCY
})
```

### 策略 7：重用 Scope

```typescript
import { Effect, Scope } from "effect"

// ❌ 每个 item 创建独立的 Scope
Effect.scoped(
  Effect.forEach(items, (item) =>
    Effect.scoped(
      acquireResource(item).pipe(
        Effect.flatMap((res) => useResource(res)),
        Effect.acquireRelease
      )
    )
  )
)

// ✅ 共享同一个 Scope
Effect.scoped(
  Effect.gen(function* (_) {
    const pool = yield* _(acquirePool().pipe(Effect.acquireRelease))

    // 所有 item 共用同一个连接池
    return yield* _(Effect.forEach(items, (item) =>
      pool.use(item), { concurrency: 4 }
    ))
  })
)
```

### 策略 8：缓存

```typescript
const expensiveOp = Effect.cached(Effect.sync(() => heavyComputation()))
```

### Batching 策略对比

| 策略 | 适用场景 | 吞吐提升 | 额外代价 |
|------|---------|---------|---------|
| 单条并发 | 延迟敏感，少量请求 | 1x | 最低 |
| 批量 + 并发 | 大量 I/O，可合并 | 10-50x | 增加延迟（等待收集批次）|
| Stream chunked | 流式数据 | 2-5x | 流管理开销 |
| DataLoader 风格 | 嵌套 N+1 查询 | 10-100x | 需要后端支持批 API |
| 数据库批量 INSERT | 数据导入 | 10-100x | 需要构造复合 SQL |

---

## 典型问题处理

### 问题 1：逐条循环处理导致 QPS 下降

**问题复现**：

```typescript
// 一个订单处理服务，每次处理 5000 条记录
const processOrders = (orders: Order[]) =>
  Effect.forEach(orders, (order) =>
    Effect.gen(function* (_) {
      const validated = yield* _(validateOrder(order))
      const priced = yield* _(calculatePrice(validated))
      const saved = yield* _(saveToDb(priced))
      return saved
    })
  )
// 5000 条 × 3 个 Effect 操作 = 15000 个 Effect 对象
// 15000 个闭包捕获
// 计算 + I/O 来回切换，增加调度开销
```

**根因分析**：

1. 每个 `yield* _()` 在底层创建一个新的 Effect 指令节点
2. `forEach` 为每个元素创建一个 Fiber 上下文（一是 `{ concurrency: "unbounded" }` 会创建 5000 个 Fiber）
3. 每个 Fiber 的创建和调度约 2-5 微秒，5000 个就是 10-25 毫秒的调度开销
4. 加上 15000 个 Effect 对象分配和 GC 压力

**解决方案**：

```typescript
// ✅ 优化 1：合并纯计算步骤
const processOrdersOptimized1 = (orders: Order[]) =>
  Effect.sync(() =>
    orders.map((o) => validateAndPrice(o)) // 纯函数合并
  ).pipe(
    Effect.flatMap((pricedOrders) =>
      Effect.forEach(pricedOrders, saveToDb, { concurrency: 10 })
    )
  )
// 从 15000 个 Effect 减少到 ~5001 个

// ✅ 优化 2：批量数据库操作
const processOrdersOptimized2 = (orders: Order[]) =>
  Effect.gen(function* (_) {
    const validated = orders.map(validateAndPrice) // 纯计算
    return yield* _(batchSaveToDb(validated))       // 一次批量 I/O
  })
// 从 15000 个 Effect 减少到 3 个
```

**修复前后对比（基准测试）**：

| 指标 | 修复前 | 修复后（方案 1） | 修复后（方案 2） |
|------|--------|-----------------|-----------------|
| 5000 条处理时间 | 850ms | 320ms | 95ms |
| QPS（8 并发） | 4700 | 12500 | 42100 |
| GC 暂停时间占比 | 7.2% | 2.1% | 0.3% |
| 内存分配/请求 | 12MB | 3.5MB | 0.8MB |

### 问题 2：不必要的大量 Effect.gen 嵌套

**问题复现**：

```typescript
const deepNested = Effect.gen(function* (_) {
  const a = yield* _(step1())
  const b = yield* _(step2(a))
  const c = yield* _(step3(b))
  const d = yield* _(step4(c))
  const e = yield* _(step5(d))
  const f = yield* _(step6(e))
  const g = yield* _(step7(f))
  return g
})
```

**根因分析**：`Effect.gen` 使用生成器，每个 `yield*` 都创建中间状态。7 个 `yield*` = 7 次生成器状态切换 + 7 次 Effect 指令创建。对于纯同步操作，这些开销完全可以避免。

**解决方案**：

```typescript
// ✅ 用 pipe 扁平化
const withPipe = pipe(
  step1(),
  Effect.flatMap(step2),
  Effect.flatMap(step3),
  Effect.flatMap(step4),
  Effect.flatMap(step5),
  Effect.flatMap(step6),
  Effect.flatMap(step7)
)

// ✅ 或者用 Do notation + bind
const withDo = Effect.Do.pipe(
  Effect.bind("a", () => step1()),
  Effect.bind("b", ({ a }) => step2(a)),
  Effect.bind("c", ({ b }) => step3(b)),
  Effect.bind("d", ({ c }) => step4(c)),
  Effect.bind("e", ({ d }) => step5(d)),
  Effect.bind("f", ({ e }) => step6(e)),
  Effect.bind("g", ({ f }) => step7(f)),
  Effect.map(({ g }) => g)
)
```

### 问题 3：同步/异步频繁切换

**问题复现**：

```typescript
// 在循环中来回切换同步/异步
const frequentSwitch = Effect.forEach(items, (item) =>
  Effect.sync(() => preprocess(item)).pipe(
    Effect.flatMap((pp) => asyncDbCall(pp)),
    Effect.map((result) => postprocess(result)),
    Effect.flatMap((final) => asyncLog(final))
  )
)
// 每个元素：sync → async → sync → async（4 次调度切换）
```

**解决方案**：

```typescript
// ✅ 分组：同步→异步→同步
const grouped = Effect.gen(function* (_) {
  const preprocessed = items.map(preprocess)       // 全部同步
  const dbResults = yield* _(
    Effect.forEach(preprocessed, asyncDbCall, { concurrency: 4 })
  )                                                // 全部异步
  return dbResults.map(postprocess)                // 全部同步
})
// 1 次同步块 + 1 次异步块 + 1 次同步块 = 2 次调度切换
```

---

## 开发者技能

### 技能 1：测量而非猜测

```typescript
const benchmark = <A, E>(name: string, effect: Effect.Effect<A, E, never>, iterations = 1000) =>
  Effect.gen(function* (_) {
    for (let i = 0; i < 3; i++) yield* _(effect) // 预热
    const start = yield* _(Effect.sync(() => performance.now()))
    for (let i = 0; i < iterations; i++) yield* _(effect)
    const elapsed = performance.now() - start
    Console.log(`[bench] ${name}: avg ${(elapsed / iterations).toFixed(3)}ms, ${(1000 / (elapsed / iterations)).toFixed(0)}/s`)
  })

// 比较不同写法
const v1 = benchmark("sync", Effect.sync(() => heavyWork()))
const v2 = benchmark("promise", Effect.promise(() => Promise.resolve(heavyWork())))
```

### 技能 2：使用 Node.js Profiling

```bash
# 生成 CPU 火焰图
node --prof app.js
# 处理为可读格式
node --prof-process isolate-*.log > processed.txt

# 查看 GC 统计
node --trace-gc app.js 2>&1 | grep "GC"

# 查看内存分配
node --trace-allocation app.js
```

---

## 示例代码

### 基准测试模板

```typescript
const measure = (name: string, effect: () => Effect.Effect<any, never, never>) =>
  Effect.gen(function* (_) {
    const eff = effect()
    for (let i = 0; i < 3; i++) yield* _(eff) // 预热
    const start = performance.now()
    const ITERS = 1000
    for (let i = 0; i < ITERS; i++) yield* _(eff)
    const avgMs = (performance.now() - start) / ITERS
    Console.log(`${name}: avg ${avgMs.toFixed(4)}ms, ${(1000 / avgMs).toFixed(0)}/s`)
  })

// 对比不同写法
// Effect.runPromise(measure("sync", () => Effect.sync(() => heavyWork())))
// Effect.runPromise(measure("stream", () => Stream.range(0, 100).pipe(Stream.runCollect)))
```

### Before/After 完整对比

```typescript
// ════════════════════════════════════════
// BEFORE：没有优化的 Effect 实现
// ════════════════════════════════════════
import { Effect, Console } from "effect"

const processBatchBefore = (records: Record[]) =>
  Effect.forEach(records, (record) =>
    Effect.gen(function* (_) {
      // 每个记录都重新 fetch 配置
      const config = yield* _(fetchConfig())  // 重复 I/O
      const enriched = yield* _(enrichRecord(record, config))
      const saved = yield* _(saveRecord(enriched))
      return saved
    }),
    { concurrency: "unbounded" } // 无限制并发
  )

// ════════════════════════════════════════
// AFTER：全面优化
// ════════════════════════════════════════
const processBatchAfter = (records: Record[]) =>
  Effect.gen(function* (_) {
    // 配置只 fetch 一次
    const config = yield* _(Effect.cached(fetchConfig()))

    // 纯函数预处理，脱离 Effect
    const prepared = records.map((r) => preprocess(r))

    // 批量 I/O，控制并发
    const saved = yield* _(
      Effect.forEach(
        prepared,
        (r) => saveRecord(enrichRecord(r, config)),
        { concurrency: 4, batching: true }
      )
    )

    return saved
  })

// 性能提升实测（10000 条记录）：
// Before: 3.2s, 12MB 临时分配, 3125 QPS
// After:  0.4s, 1.2MB 临时分配, 25000 QPS
```

---

## 性能检查清单（10 条规则）

在性能调优时，按照以下优先级逐项检查：

### [ ] 1. 是否开启了 `batching: true`（I/O 密集场景）
```
Effect.forEach(tasks, fn, { concurrency: 10, batching: true })
```
如果后端支持批处理，这个选项可以将网络往返降低 10-50 倍。

### [ ] 2. 是否使用了合理的 `concurrency`
- CPU 密集型：concurrency ≈ CPU 核心数
- I/O 密集型：concurrency ≈ IO延迟 / CPU处理时间（通常 50-500）
- 绝不使用 `concurrency: "unbounded"` 于大规模任务

### [ ] 3. 纯计算是否被移出 Effect
```typescript
// ❌ 不推荐
const bad = Effect.forEach(items, (item) =>
  Effect.sync(() => pureTransform(item))
)

// ✅ 推荐
const transformed = items.map(pureTransform)
const good = Effect.forEach(transformed, asyncStep)
```

### [ ] 4. 是否存在无意义的 `Effect.gen` 包装
```typescript
// ❌ 包装了纯函数
const wrap = Effect.gen(function* (_) {
  return 42
})

// ✅ 直接使用
const value = 42
```

### [ ] 5. Scope 管理是否合理
检查 `forkScoped` 是否替代了裸 `fork`。每个 `fork` 都应该有对应的生命周期管理。

### [ ] 6. 是否使用了 `Stream` 的 `chunkSize` 控制
```typescript
Stream.fromIterable(largeData).pipe(
  Stream.mapEffect(process, { concurrency: 4 }),
  Stream.runCollect
)
// 考虑调整 Stream 的默认 chunkSize（默认 4096）
```

### [ ] 7. 缓存是否应用在合适的层级
```typescript
Effect.cached     // 永久缓存（适合配置、token）
Effect.cachedWithTTL  // TTL 缓存（适合动态数据）
```

### [ ] 8. Effect.sync 和 Effect.promise 的选择是否正确
| 场景 | 应使用 |
|------|--------|
| 纯同步计算 | `Effect.sync` |
| 已有 Promise | `Effect.tryPromise` |
| 自定义异步 | `Effect.async` |
| 同步错误抛出 | `Effect.try` |

### [ ] 9. 相邻的纯 map 是否已合并
```typescript
Effect.map(f1), Effect.map(f2) → Effect.map(x => f2(f1(x)))
```

### [ ] 10. 是否通过基准测试验证了优化效果
不要依赖"感觉"，使用基准测试模板测量前后对比。

---

## 性能调优流程

```
发现性能问题 → 定位瓶颈 → 对照检查清单 → 每次改一项 → 基准测试
优化有效 → 继续下一项，优化无效 → 回退换方案
```

---

## 本章小结

性能调优的本质是**识别和消除不对称的成本**——那些代码看起来普通、但运行时开销异常高的使用模式。

1. **对象分配最容易被忽视**：一个 `Effect.sync` 在循环中就是 GC 压力的源头。将纯计算移出 Effect，合并纯 map。
2. **批处理是最大的杠杆**：将 N 次 I/O 调用合并为 N/M 次，收益往往是数量级的。
3. **同步/异步边界要清晰**：纯同步用 `Effect.sync`，已有 Promise 用 `Effect.tryPromise`。
4. **永远先测量再优化**：让数据说话，而非猜测。

---

## 参考

- Effect-TS 性能指南：https://effect.website/docs/guides/performance
- Node.js 性能火焰图：`node --prof --trace-deopt app.js`
- V8 GC 调优：https://v8.dev/blog/trash-talk
- 相关章节：ch07（Stream 性能）、ch08（Queue/Hub 背压）、ch13（DX 性能）