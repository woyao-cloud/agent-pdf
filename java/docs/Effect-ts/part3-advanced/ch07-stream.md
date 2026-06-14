# ch07 Stream 流处理

## 概述

你的应用需要处理一个 2GB 的 CSV 文件，全部加载到内存会导致 OOM。或者你需要消费 Kafka 中每秒数万条的消息流，逐条处理的同时还要保证消费者不会崩溃。再或者你想实时 tail 一个日志文件，并在新日志出现时立即触发告警分析。

这些场景的共同点在于：**数据是连续的、可能无限的、无法一次性全部加载到内存的**。传统的数组或迭代器无法胜任——你需要一个具备 **惰性求值**、**背压感知** 和 **资源安全** 三大特性的抽象层。

Effect-TS 的 `Stream` 模块正是为此而生。它提供了一种声明式、可组合的方式来处理**可能无限**的数据序列，且与 Effect 生态系统无缝集成。

```typescript
import { Stream, Effect, Console } from "effect"

// 一个简单的 Stream：逐一发射元素
const stream = Stream.fromIterable([1, 2, 3, 4, 5])

// 消费 Stream 的两种方式
// 方式一：runCollect 收集到 Chunk
const collected = stream.pipe(Stream.runCollect)
Effect.runPromise(collected).then(console.log)
// { _id: 'Chunk', values: [ 1, 2, 3, 4, 5 ] }

// 方式二：runForEach 逐项处理（流式，内存友好）
stream.pipe(
  Stream.runForEach((n) => Console.log(`received: ${n}`))
)
// received: 1
// received: 2
// ...
```

---

### 使用场景

#### 1. 大文件流式处理（GB 级 CSV / JSONL）

传统的 `fs.readFileSync` 会将整个文件读入内存。对于 2GB 的 CSV 文件，这不现实。Stream 可以在任意时刻只保留一小块数据在内存中：

```typescript
import { Stream, Effect } from "effect"
import { createReadStream } from "fs"
import { createInterface } from "readline"

// ✅ 逐行读取，内存占用恒定
const readLargeFile = (path: string) =>
  Stream.acquireRelease(
    Effect.sync(() => {
      const rl = createInterface({
        input: createReadStream(path, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      })
      return rl
    }),
    (rl) => Effect.sync(() => rl.close())
  ).pipe(
    Stream.flatMap((rl) =>
      Stream.fromAsyncIterable(
        (async function* () {
          for await (const line of rl) yield line
        })()
      )
    )
  )
```

#### 2. Kafka / 消息队列消费

消息队列的消费者天然是流式的——你不断拉取新消息，处理，然后继续拉取。Stream 的背压特性确保消费者不会被消息洪峰冲垮：

```typescript
import { Stream, Effect, Queue, Console } from "effect"

// 模拟 Kafka 消费流
const kafkaStream = Stream.fromQueue(
  // 假设这是一个绑定到 Kafka 的 Queue
  yield* _(Queue.unbounded<Message>())
).pipe(
  Stream.mapEffect((msg) => processMessage(msg)),
  Stream.catchAll((err) =>
    Console.error(`consumer error: ${err}`).pipe(
      Effect.andThen(Stream.empty) // 降级为空流，不中断
    )
  )
)
```

#### 3. 日志文件实时 tail

实时监控日志文件，每当新行写入时触发分析 Pipeline：

```typescript
// 结合 fs.watch 和 Stream 实现实时 tail
const tailLog = (path: string) =>
  Stream.async<{ timestamp: Date; line: string }>((emit) => {
    const watcher = fs.watch(path, (event) => {
      if (event === "change") {
        // 读取新增行并发射
        emit.single({ timestamp: new Date(), line: newLine })
      }
    })
    // 注册清理回调
    emit.onAbort(() => watcher.close())
  })
```

#### 4. WebSocket / SSE 数据流

实时数据推送（股票行情、传感器数据）天然是流式结构：

```typescript
// WebSocket 消息流
const wsStream = Stream.async<WebSocketData>((emit) => {
  const ws = new WebSocket("wss://stream.example.com/prices")
  ws.onmessage = (event) => emit.single(JSON.parse(event.data))
  ws.onerror = (err) => emit.fail(new Error(String(err)))
  emit.onAbort(() => ws.close())
})
```

---

### 实现原理

#### Stream<A, E, R> 与 Effect 的关系

Stream 的类型签名与 Effect 高度对称，大大降低了学习成本：

| 类型参数 | 含义 | 类比 Effect |
|---------|------|------------|
| `A` | 发射的元素类型 | `Success` |
| `E` | 可能产生的错误类型 | `Error` |
| `R` | 所需的环境依赖 | `R` |

核心直觉：**Stream<A, E, R> 是一个惰性的、可重复拉取的 Effect**。每一次 `pull` 操作都会返回一个 `Effect<Option<A>, E, R>`——`Some` 表示还有一个元素，`None` 表示流已结束。

```typescript
import { Stream, Effect, Option } from "effect"

// 手动拉取（内部机制，通常不直接使用）
const pull: Effect.Effect<
  Option.Option<number>,
  Error,
  never
> = Stream.toPull(Stream.fromIterable([1, 2, 3]))
```

这种设计的精妙之处在于：**Effect 的异步、并发、资源管理能力被直接继承**。Stream 不需要自己实现调度器或 Fiber 管理，它直接复用了 Effect 运行时。

#### Pull-based 背压机制

背压是 Stream 的核心设计：**消费者决定拉取速度，生产者不会超前生产**。

```typescript
import { Stream, Effect, Console } from "effect"

// 快速生产者
const fastProducer = Stream.fromIterable(
  Array.from({ length: 1000 }, (_, i) => i)
)

// 慢速消费者 —— 背压自动生效
const slowConsumer = fastProducer.pipe(
  Stream.mapEffect((n) =>
    Effect.sleep("10 millis").pipe(
      Effect.andThen(Console.log(`processed: ${n}`))
    )
  ),
  Stream.runCollect
)
// 🔑 每次 mapEffect 完成后才会拉取下一条，天然背压
```

对比推送模型（如 RxJS Observable）与拉取模型（Effect Stream）：

| 特性 | RxJS Observable（推送） | Effect Stream（拉取） |
|------|------------------------|---------------------|
| 数据流向 | 生产者推给消费者 | 消费者拉取生产者 |
| 背压 | 需要手动 buffer/drop | 天然背压 |
| 慢消费 | 上游不感知，内存积压 | 上游等待下游完成 |
| 异常处理 | 中断整个流 | 可逐条恢复 |

#### Chunk 批处理优化

内部实现中，Stream 不会逐条发射元素，而是使用 `Chunk` 批量处理，降低 Fiber 调度开销：

```typescript
import { Stream, Chunk } from "effect"

// Stream.fromIterable 内部会将数组分块（默认 16 条一块）
const batched = Stream.fromIterable(
  Array.from({ length: 10000 }, (_, i) => i),
  { chunkSize: 256 } // 每块 256 条
)

// Chunk 是高效的不可变序列
const chunk = Chunk.fromIterable([1, 2, 3])
console.log(chunk) // { _id: 'Chunk', values: [ 1, 2, 3 ] }
```

---

### 潜在风险

#### 1. 无界 Stream 导致内存泄​​漏

当 Stream 的消费速度持续低于生产速度，且中间有 `buffer` 或 `broadcast` 操作时，未处理的数据会积压：

```typescript
// ❌ 危险：无界 buffer 可能耗尽内存
Stream.iterate(0, (n) => n + 1).pipe(
  Stream.buffer({ capacity: 1000000, strategy: "unbounded" }),
  // 如果下游处理慢，缓冲区会不断膨胀
  Stream.mapEffect((n) => Effect.sleep("1 seconds"))
)

// ✅ 安全：使用 sliding / dropping 策略
Stream.iterate(0, (n) => n + 1).pipe(
  Stream.buffer({ capacity: 256, strategy: "sliding" }),
  Stream.mapEffect((n) => Effect.sleep("1 seconds"))
)
```

#### 2. 在 Effect.all 中使用大量数据导致 OOM

这是最常见的错误：用处理数组的方式处理流式数据：

```typescript
// ❌ 错误示范：Effect.all 会将所有结果加载到内存
const bad = Effect.all(
  Array.from({ length: 1000000 }, (_, i) =>
    Effect.succeed(processItem(i))
  )
) // OOM！

// ✅ 正确示范：用 Stream 替代
const good = Stream.fromIterable(
  Array.from({ length: 1000000 }, (_, i) => i)
).pipe(
  Stream.mapEffect((i) => Effect.succeed(processItem(i))),
  Stream.runCollect // 内部使用 Chunk 分批处理
)
```

#### 3. 忘记关闭资源

使用 `Stream.acquireRelease` 或 `Stream.fromQueue` 时，如果 Stream 中途退出且未正确释放资源，可能造成文件句柄泄漏：

```typescript
// ❌ 资源泄漏：catchAll 后直接返回 Stream.empty
const leaky = Stream.acquireRelease(openFile, closeFile).pipe(
  Stream.flatMap(processLine),
  Stream.catchAll(() => Stream.empty) // 文件未关闭！
)

// ✅ 正确：catchAll 在 acquireRelease 之前
const safe = Stream.acquireRelease(openFile, closeFile).pipe(
  Stream.flatMap(processLine),
)

// 或者在 acquireRelease 外部处理错误
const safer = safe.pipe(
  Stream.catchAll(() => Stream.empty)
)
```

---

### 优化策略

| 场景 | 建议 | 原因 |
|------|------|------|
| 大量小元素 | 增大 `chunkSize` | 减少 Fiber 调度次数 |
| 有状态计算 | 使用 `Stream.statefulMap` | 替代闭包内可变变量 |
| 并发 I/O | 设置 `concurrency` | 利用并行提升吞吐 |
| 资源密集型 | 使用 `Stream.buffer` 解耦 | 允许上下游以不同速度运行 |
| 大批量数据 | 配合 `grouped` 批量提交 | 减少网络往返次数 |
| 流中聚合 | 使用 `Stream.aggregate` | 内置窗口/滑动聚合支持 |

```typescript
import { Stream, Effect, Chunk } from "effect"

// 优化示例：分组批量写入数据库
const optimized = Stream.range(1, 10000).pipe(
  Stream.grouped(100), // 每组 100 条
  Stream.mapEffect((chunk) =>
    Effect.sleep("10 millis").pipe(
      Effect.andThen(Effect.succeed(Chunk.size(chunk)))
    ),
    { concurrency: 4 } // 4 个并发写入
  ),
  Stream.runCollect
)
```

---

### 典型问题处理

#### 问题 1：使用 Effect.all + 数组处理大量数据

```typescript
// ❌ 错误示范：加载 100 万条数据到内存
const processAll = Effect.all(
  hugeArray.map((item) => processItem(item)),
  { concurrency: "unbounded" }
)
// → 内存暴涨，可能 OOM

// ✅ 正确示范：使用 Stream.mapEffect 流式处理
const streamProcess = Stream.fromIterable(hugeArray).pipe(
  Stream.mapEffect(processItem, { concurrency: 10 }),
  Stream.runCollect
)
// → 任何时候只有少量数据在内存中
```

#### 问题 2：Stream 内可变状态导致竞态

```typescript
// ❌ 错误示范：闭包内可变变量
let counter = 0
const bad = Stream.range(1, 100).pipe(
  Stream.map((n) => {
    counter++ // 并发下不安全！
    return n + counter
  })
)

// ✅ 正确示范：使用 Stream.statefulMap
const good = Stream.range(1, 100).pipe(
  Stream.statefulMap<number, number, number>(
    () => 0, // 初始状态
    (state, n) => {
      const newState = state + 1
      return [newState, n + newState] // [新状态, 输出值]
    }
  )
)
```

#### 问题 3：消费者处理慢导致上游阻塞

```typescript
// ❌ 错误示范：上下游完全耦合
Stream.range(1, 1000).pipe(
  Stream.mapEffect((n) => slowApiCall(n)),
  Stream.runCollect
)
// → 上游等待下游，总时间 = sum(每个请求耗时)

// ✅ 正确示范：buffer 解耦 + 并发消费
Stream.range(1, 1000).pipe(
  Stream.buffer({ capacity: 64, strategy: "dropping" }),
  // 上游可以提前生产 64 个元素
  Stream.mapEffect((n) => slowApiCall(n), { concurrency: 10 }),
  Stream.runCollect
)
```

---

### 开发者技能

#### 1. 核心操作流（渐进 3 步）

**第一步：从 Iterable 创建到收集**

```typescript
import { Stream, Effect, Console } from "effect"

// 最简单形式
const simple = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
  Stream.map((n) => n * 2),
  Stream.runCollect
)
Effect.runPromise(simple).then(console.log)
// { _id: 'Chunk', values: [ 2, 4, 6, 8, 10 ] }
```

**第二步：加入 Effect 映射和过滤**

```typescript
const withEffect = Stream.range(1, 20).pipe(
  Stream.filter((n) => n % 2 === 0),
  Stream.mapEffect((n) =>
    Console.log(`processing ${n}`).pipe(
      Effect.andThen(Effect.succeed(n * 10))
    )
  ),
  Stream.take(3),
  Stream.runCollect
)
// processing 2
// processing 4
// processing 6
// 结果：[20, 40, 60]
```

**第三步：完整 Pipeline（错误处理 + 资源管理）**

```typescript
const fullPipeline = Stream.acquireRelease(
  Effect.sync(() => ({ data: [1, 2, 3], close: () => {} })),
  (res) => Effect.sync(() => res.close())
).pipe(
  Stream.flatMap((res) => Stream.fromIterable(res.data)),
  Stream.mapEffect((n) =>
    n === 2
      ? Effect.fail(new Error("boom"))
      : Effect.succeed(n)
  ),
  Stream.catchAll((err) => {
    console.error(err.message)
    return Stream.make(-1) // 降级
  }),
  Stream.runCollect
)
// 结果：[1, -1, 3]
```

#### 2. 对比：Stream 与普通数组操作

| 维度 | Array | Stream |
|------|-------|--------|
| 求值时机 | 立即 | 惰性 |
| 内存 | 全部在内存 | 按需拉取 |
| 无限数据 | 不支持 | 原生支持 |
| 背压 | 无 | 内置 |
| 资源安全 | 手动管理 | 自动 |
| 并发控制 | 手动 | 内置 concurrency 参数 |

#### 3. Stream 调试技巧

```typescript
import { Stream, Console, Effect } from "effect"

// 在 Pipeline 中插入调试点
const debugStream = Stream.range(1, 10).pipe(
  Stream.tap((n) => Console.log(`before filter: ${n}`)),
  Stream.filter((n) => n % 2 === 0),
  Stream.tap((n) => Console.log(`after filter: ${n}`)),
  Stream.runCollect
)
```

---

### 示例代码

#### 完整例子：GB 级 CSV 处理流水线

```typescript
import {
  Stream, Effect, Console, Schedule,
} from "effect"
import { createReadStream } from "fs"
import { createInterface } from "readline"

// 数据行类型
interface TransactionRow {
  id: string
  amount: number
  timestamp: Date
  category: string
}

// Step 1: 逐行读取大文件（内存友好）
const readLines = (filePath: string) =>
  Stream.acquireRelease(
    Effect.sync(() => {
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity
      })
      return rl
    }),
    (rl) => Effect.sync(() => rl.close())
  ).pipe(
    Stream.flatMap((rl) =>
      Stream.fromAsyncIterable(
        (async function* () {
          for await (const line of rl) yield line
        })()
      )
    )
  )

// Step 2: 解析 CSV 行
const parseRow = (line: string): TransactionRow => {
  const [id, amount, timestamp, category] = line.split(",")
  return {
    id,
    amount: parseFloat(amount),
    timestamp: new Date(timestamp),
    category: category?.trim() ?? "unknown"
  }
}

// Step 3: 根据金额做不同处理
const classifyAmount = (row: TransactionRow) =>
  row.amount > 10000
    ? { ...row, flag: "high-value" as const }
    : { ...row, flag: "normal" as const }

// Step 4: 批量写入数据库（每 100 条一批）
const batchInsert = (
  rows: readonly (TransactionRow & { flag: string })[]
): Effect.Effect<void, Error, never> =>
  Effect.log(`inserting ${rows.length} rows (flagged: ${
    rows.filter((r) => r.flag === "high-value").length
  })`).pipe(
    Effect.andThen(Effect.sleep("50 millis"))
  )

// Step 5: 组装完整 Pipeline
const processTransactions = (filePath: string) =>
  readLines(filePath).pipe(
    Stream.drop(1), // 跳过表头
    Stream.filter((line) => line.trim().length > 0),
    Stream.map(parseRow),
    Stream.map(classifyAmount),
    Stream.grouped(100),
    Stream.mapEffect(batchInsert, { concurrency: 4 }),
    Stream.runCollect
  )

// 运行
// Effect.runPromise(processTransactions("/data/transactions_2gb.csv"))
```

运行结果示例（假设 10 万行数据）：

```
timestamp=... level=INFO message="inserting 100 rows (flagged: 3)"
timestamp=... level=INFO message="inserting 100 rows (flagged: 1)"
timestamp=... level=INFO message="inserting 100 rows (flagged: 0)"
...（共 1000 批）
timestamp=... level=INFO message="all batches completed"
```

---

### 本章小结

| 知识点 | 要点 | 对应章节 |
|--------|------|---------|
| Stream 模型 | `Stream<A, E, R>` = 惰性、可重复拉取的 Effect | 1. 核心模型 |
| 背压机制 | 消费者决定速度，Pull-based 模型防内存溢出 | 2. 背压 |
| 创建 Stream | fromIterable / fromEffect / fromQueue / acquireRelease | 3. 创建 |
| 转换操作 | map / filter / mapEffect / flatMap / grouped | 4. 转换 |
| 资源管理 | acquireRelease 确保资源在结束/出错时释放 | 5. 资源管理 |
| 错误处理 | catchAll / catchSome / orElse | 5. 错误处理 |
| 并发控制 | mapEffect 的 concurrency 参数 | 4.3 mapEffect |
| 性能优化 | chunkSize / buffer / grouped / aggregate | 优化策略 |
| 典型错误 | Effect.all 处理大量数据、闭包内可变状态 | 典型问题 |

**一句话总结**：当你需要处理**大量**或**持续到达**的数据时，优先选择 Stream 而非 Array + Effect.all——Stream 的惰性求值和背压机制能让你以恒定内存完成看似不可能的数据处理任务。

---

### 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/stream
- API 参考：`Stream` (`effect/Stream`)
- 相关章节：ch03（错误处理）、ch06（结构化并发）、ch08（Queue/Hub）、ch14（运行时排查）