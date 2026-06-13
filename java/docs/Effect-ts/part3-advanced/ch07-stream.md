# ch07 Stream 流处理

## 概述

Effect-TS 的 `Stream` 模块提供了一种声明式、可组合的方式来处理**可能无限**的数据序列。与传统的 `Iterable` 或 `Array` 不同，Stream 具有**惰性求值**、**背压感知**和**资源安全**三大特性，使其成为处理 GB 级 CSV、Kafka/RabbitMQ 消费或大文件逐行读取的理想选择。

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
```

---

## 1. Stream 核心模型：Stream<A, E, R>

Stream 的类型签名与 Effect 保持对称，降低学习成本：

| 类型参数 | 含义 | 类比 Effect |
|---------|------|------------|
| `A` | 发射的元素类型 | `Success` |
| `E` | 可能产生的错误类型 | `Error` |
| `R` | 所需的环境依赖 | `R` |

```typescript
import { Stream, Effect } from "effect"

// 类型定义示例
declare const stream: Stream.Stream<number, Error, never>
//               发射 number  | 可能失败于 Error | 无需依赖
```

核心直觉：**Stream<A, E, R> 是一个惰性的、可重复拉取的 Effect**。每一次 `pull` 操作都会返回一个 `Effect<A, E, R>`，直到 Stream 结束（`None`）。

```typescript
import { Stream, Effect, Option } from "effect"

// 手动拉取（内部机制，通常不直接使用）
const pull: Effect.Effect<
  Option.Option<number>,
  Error,
  never
> = Stream.toPull(Stream.fromIterable([1, 2, 3]))
```

---

## 2. 背压机制（Back-Pressure）

背压是 Stream 的核心设计：**消费者决定拉取速度，生产者不会超前生产**。

### 2.1 没有背压的问题

传统 `Observable`（如 RxJS）属于**推送模型**，数据生产速度可能远超消费速度，导致内存爆涨：

```typescript
// 伪代码：RxJS 推送模型
observable.pipe(
  // ❌ 如果每秒产生 10000 个事件，消费者处理不过来
  // 数据会积压在内存缓冲区
  bufferTime(1000)
)
```

### 2.2 Effect Stream 的拉取模型

```typescript
import { Stream, Effect, Console, Schedule, pipe } from "effect"

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

### 2.3 Chunk 分块

内部实现中，Stream 不会逐条发射元素，而是使用 `Chunk` 批量处理，降低调度开销：

```typescript
import { Stream, Chunk, Effect } from "effect"

// Stream.fromIterable 内部会将数组分块（默认 16 条一块）
// 可以通过 chunkSize 控制
const batched = Stream.fromIterable(
  Array.from({ length: 10000 }, (_, i) => i),
  { chunkSize: 256 } // 每块 256 条
)

// 查看 Chunk 内部结构
const chunk = Chunk.fromIterable([1, 2, 3])
console.log(chunk) // { _id: 'Chunk', values: [ 1, 2, 3 ] }
```

---

## 3. 创建 Stream

### 3.1 从集合创建

```typescript
import { Stream, Effect } from "effect"

// 从数组
Stream.fromIterable([1, 2, 3])

// 范围
Stream.range(1, 100) // 1..99（含头不含尾）

// 无限流
Stream.iterate(0, (n) => n + 1) // 0, 1, 2, 3, ...

// 重复单个值
Stream.make("ping", "ping", "ping")
```

### 3.2 从 Effect 创建

```typescript
import { Stream, Effect, Random } from "effect"

// 从单个 Effect
Stream.fromEffect(Random.nextNumber)

// 重复执行 Effect（可用于轮询）
Stream.repeatEffect(Random.nextNumber)
// ⚠️ 无限执行，记得用 Stream.take 限制

// 带条件的轮询
Stream.repeatEffectOption(
  Effect.map(Random.nextNumber, (n) =>
    n > 0.5 ? n : undefined
  ).pipe(Effect.mapError(() => undefined))
)
```

### 3.3 从外部资源（文件、网络）创建

```typescript
import { Stream, Effect, NodeStream } from "effect"
import { createReadStream } from "fs"

// Node.js Readable Stream 转 Effect Stream
const fileStream = NodeStream.fromReadable(
  () => createReadStream("/var/log/app.log", {
    encoding: "utf-8",
    highWaterMark: 64 * 1024 // 64KB chunks
  })
)
// 🔑 资源安全：Stream 结束时自动关闭文件句柄
```

---

## 4. 转换操作（Operators）

### 4.1 映射与过滤

```typescript
import { Stream, Effect } from "effect"

const pipeline = Stream.range(1, 100).pipe(
  Stream.filter((n) => n % 2 === 0),        // 只保留偶数
  Stream.map((n) => n * 2),                  // 翻倍
  Stream.take(10),                           // 只取前 10 条
  Stream.runCollect
)
// 结果：[4, 8, 12, 16, 20, 24, 28, 32, 36, 40]
```

### 4.2 flatMap 扁平化

```typescript
import { Stream, Effect } from "effect"

// 每条记录对应一个子流
const flatMapped = Stream.range(1, 5).pipe(
  Stream.flatMap((n) =>
    Stream.fromIterable([n, n * 10, n * 100])
  ),
  Stream.runCollect
)
// 结果：[1, 10, 100, 2, 20, 200, 3, 30, 300, 4, 40, 400, 5, 50, 500]
```

### 4.3 mapEffect（带 Effect 的映射）

这是最常用也最重要的操作之一 —— 将每个元素映射为一个 Effect，并在保持背压的同时并发执行：

```typescript
import { Stream, Effect, Random, Console } from "effect"

// 串行处理（默认）
const serial = Stream.range(1, 10).pipe(
  Stream.mapEffect((n) =>
    Effect.sleep(Random.nextIntBetween(10, 100)).pipe(
      Effect.andThen(Console.log(`processed ${n}`))
    )
  ),
  Stream.runCollect
)
// 总共耗时：~10 个随机延迟之和

// 并发处理（指定最大并发数）
const concurrent = Stream.range(1, 10).pipe(
  Stream.mapEffect(
    (n) =>
      Effect.sleep(Random.nextIntBetween(10, 100)).pipe(
        Effect.andThen(Console.log(`processed ${n}`))
      ),
    { concurrency: 5 } // 最多 5 个并行 Fiber
  ),
  Stream.runCollect
)
// 总共耗时：约 2 个平均延迟
```

### 4.4 分组与窗口

```typescript
import { Stream, Effect, Chunk } from "effect"

// 按批次聚合（groupBy）
const batchProcess = Stream.range(1, 100).pipe(
  Stream.grouped(10), // 10 条一组，形成 Stream<Chunk<number>>
  Stream.mapEffect((chunk) => {
    // 批量调用 API
    return Effect.succeed(
      Chunk.map(chunk, (n) => n * 2)
    )
  }),
  Stream.map(Chunk.toReadonlyArray),
  Stream.runCollect
)
```

---

## 5. 资源管理与错误处理

### 5.1 资源安全

Stream 内部自动管理资源生命周期，无需手动 close：

```typescript
import { Stream, Effect } from "effect"

// Stream.acquireRelease 确保资源在结束/出错时释放
const safeStream = Stream.acquireRelease(
  Effect.sync(() => {
    console.log("open connection")
    return { query: () => [1, 2, 3] }
  }),
  (conn) => Effect.sync(() => {
    console.log("close connection")
    // conn.close()
  })
).pipe(
  Stream.flatMap((conn) =>
    Stream.fromIterable(conn.query())
  )
)
```

### 5.2 错误处理

```typescript
import { Stream, Effect } from "effect"

// Stream 层面的错误处理
const resilient = Stream.range(1, 10).pipe(
  Stream.map((n) => {
    if (n === 5) throw new Error("boom at 5")
    return n
  }),
  Stream.catchAll((err) => {
    console.error("caught:", err.message)
    // 返回一个降级流继续发射
    return Stream.make(-1)
  }),
  Stream.runCollect
)
```

---

## 6. 实战：GB 级 CSV 处理

```typescript
import { Stream, Effect, Console, Schedule, pipe } from "effect"
import { createReadStream } from "fs"
import { createInterface } from "readline"

// 数据行类型
interface TransactionRow {
  id: string
  amount: number
  timestamp: Date
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
  const [id, amount, timestamp] = line.split(",")
  return {
    id,
    amount: parseFloat(amount),
    timestamp: new Date(timestamp)
  }
}

// Step 3: 批量写入数据库（每 100 条一批）
const batchInsert = (
  rows: readonly TransactionRow[]
): Effect.Effect<void, Error, never> =>
  Effect.log(`inserting ${rows.length} rows`).pipe(
    Effect.andThen(
      // 模拟数据库写入
      Effect.sleep("50 millis")
    )
  )

// Step 4: 组装完整 Pipeline
const processTransactions = (filePath: string) =>
  readLines(filePath).pipe(
    Stream.drop(1), // 跳过表头
    Stream.filter((line) => line.trim().length > 0),
    Stream.map(parseRow),
    Stream.grouped(100), // 每 100 条一批
    Stream.mapEffect(batchInsert, { concurrency: 4 }),
    Stream.runCollect
  )
```

---

## 7. 实战：Kafka 消费

```typescript
import { Stream, Effect, Queue, Console, Schedule } from "effect"

// 模拟 Kafka 消费者
interface KafkaMessage {
  topic: string
  partition: number
  offset: string
  value: Buffer
}

// 创建 Kafka 消费 Stream
const kafkaStream = (topics: string[]) =>
  Stream.fromEffect(
    // 模拟连接 Kafka 并返回 Queue
    Effect.gen(function* (_) {
      const queue = yield* _(Queue.unbounded<KafkaMessage>())
      
      // 后台 Fiber 持续拉取消息
      yield* _(
        Effect.forever(
          Effect.sync(() => {
            // pollMessage 模拟从 Kafka 拉取
            const msg: KafkaMessage = {
              topic: topics[0],
              partition: 0,
              offset: String(Math.random()),
              value: Buffer.from("data")
            }
            queue.offer(msg)
          }).pipe(
            Effect.andThen(Effect.sleep("10 millis"))
          )
        ).pipe(
          Effect.forkScoped // 资源作用域：Stream 结束时自动终止
        )
      )
      
      return queue
    })
  ).pipe(
    Stream.flatMap((queue) => Stream.fromQueue(queue))
  )

// 带错误恢复的消费
const consumeWithRetry = kafkaStream(["orders", "payments"]).pipe(
  Stream.mapEffect((msg) =>
    Effect.tryPromise({
      try: () => processMessage(msg),
      catch: (err) => new Error(`process failed: ${err}`)
    }).pipe(
      Effect.retry(
        Schedule.exponential("100 millis").pipe(
          Schedule.intersect(Schedule.recurs(3))
        )
      )
    )
  ),
  Stream.runForEach((result) => Console.log(result))
)
```

---

## 8. 性能调优要点

| 场景 | 建议 | 原因 |
|------|------|------|
| 大量小元素 | 增大 `chunkSize` | 减少 Fiber 调度次数 |
| 有状态计算 | 使用 `Stream.statefulMap` | 替代闭包内可变变量 |
| 并发 I/O | 设置 `concurrency` | 利用并行提升吞吐 |
| 资源密集型 | 使用 `Stream.buffer` | 解耦生产与消费速度 |
| 大批量数据 | 配合 `grouped` 批量提交 | 减少网络往返 |

```typescript
import { Stream, Effect } from "effect"

// 使用 buffer 解耦上下游
const buffered = Stream.range(1, 10000).pipe(
  Stream.buffer({
    capacity: 256,           // 缓冲区大小
    strategy: "sliding"      // 策略：dropping / sliding / unbounded
  }),
  Stream.mapEffect((n) =>
    // 慢速下游不会阻塞上游太多
    Effect.sleep("1 millis").pipe(
      Effect.andThen(Effect.succeed(n))
    )
  ),
  Stream.runCollect
)
```

---

## 参考

- Effect-TS 官方文档：https://effect.website/docs/guides/stream
- API 参考：`Stream` (`effect/Stream`)
- 相关章节：ch03（错误处理）、ch06（结构化并发）、ch08（Queue/Hub）