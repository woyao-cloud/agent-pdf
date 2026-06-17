import { Stream, Effect, Console, Chunk, pipe, Schedule, Duration, GroupBy, Option, Tuple } from "effect"

// ============================================================
// 02-advanced: 流的并发合并、分组与高级操作
// ============================================================

// --- 2.1 流的并发合并：merge / mergeAll ---

// 创建两个独立的流
const streamA = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.tap((n) => Effect.sleep(`${n * 100} millis`))
)
const streamB = Stream.fromIterable([10, 20, 30]).pipe(
  Stream.tap((n) => Effect.sleep(`${(4 - n / 10) * 100} millis`))
)

// merge: 将两个流并发合并，元素按到达顺序发射
const merged = Stream.merge(streamA, streamB)

Effect.runPromise(
  Stream.runForEach(merged, (n) => Console.log(`merged: ${n}`))
).then(() => console.log("merge done"))

// mergeAll: 合并多个流
const streams = [1, 2, 3].map((i) =>
  Stream.fromIterable([i * 10, i * 10 + 1, i * 10 + 2]).pipe(
    Stream.tap((n) => Effect.sleep(`${Math.random() * 200} millis`))
  )
)

const mergedAll = Stream.mergeAll(streams, { concurrency: 3 })

Effect.runPromise(
  Stream.runForEach(mergedAll, (n) => Console.log(`mergeAll: ${n}`))
).then(() => console.log("mergeAll done"))

// --- 2.2 流的连接：concat / interleave ---

// concat: 顺序连接两个流（先消费完第一个，再消费第二个）
const first = Stream.range(1, 5)
const second = Stream.range(6, 10)
const concatenated = Stream.concat(first, second)

Effect.runPromise(
  Stream.runForEach(concatenated, (n) => Console.log(`concat: ${n}`))
).then(() => console.log("concat done"))

// interleave: 交错合并两个流
const interleaved = Stream.interleave(first, second)

Effect.runPromise(
  Stream.runForEach(interleaved, (n) => Console.log(`interleave: ${n}`))
).then(() => console.log("interleave done"))

// --- 2.3 流的分组：groupBy ---

// groupBy: 按键分组，每个组是一个子流
const data = Stream.fromIterable([
  { category: "A", value: 1 },
  { category: "B", value: 2 },
  { category: "A", value: 3 },
  { category: "B", value: 4 },
  { category: "C", value: 5 },
])

// 按 category 分组，每组内求和
const grouped = data.pipe(
  Stream.groupByKey((item) => item.category, { bufferSize: 16 }),
  GroupBy.evaluate((key, group) =>
    pipe(
      group,
      Stream.map((item) => item.value),
      Stream.runFold(0, (acc, v) => acc + v),
      Effect.andThen((sum) => Console.log(`group ${key}: sum = ${sum}`))
    )
  )
)

Effect.runPromise(Stream.runDrain(grouped)).then(() => console.log("groupBy done"))

// --- 2.4 流的超时与中断 ---

// timeout: 如果流在指定时间内没有产生元素，则失败
const slowStream = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.tap((n) => Effect.sleep(`${n * 500} millis`))
)

const withTimeout = slowStream.pipe(
  Stream.timeout("1 seconds")
)

Effect.runPromise(
  Stream.runForEach(withTimeout, (n) => Console.log(`timeout test: ${n}`))
).then(
  () => console.log("timeout test completed"),
  (err) => console.log(`timeout test failed: ${err}`)
)

// --- 2.5 流的调度与重试 ---

// retry: 当流失败时，按调度策略重试
let attempt = 0
const flakyStream = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.flatMap((n) => {
    attempt++
    if (attempt <= 2) {
      return Stream.fail(new Error(`attempt ${attempt} failed`))
    }
    return Stream.succeed(n)
  })
)

const retried = flakyStream.pipe(
  Stream.retry(Schedule.recurs(3))
)

Effect.runPromise(
  Stream.runForEach(retried, (n) => Console.log(`retried: ${n}`))
).then(() => console.log("retry done"))

// --- 2.6 流的缓冲策略 ---

// buffer: 在消费者慢时缓冲元素
const fastProducer = Stream.range(1, 100).pipe(
  Stream.tap((n) => Console.log(`produced: ${n}`))
)

const buffered = fastProducer.pipe(
  Stream.buffer({ capacity: 20, strategy: "dropping" }) // 缓冲区满时丢弃新元素
)

Effect.runPromise(
  Stream.runForEach(buffered, (n) =>
    Effect.sleep("50 millis").pipe(Effect.andThen(Console.log(`buffered consumed: ${n}`)))
  )
).then(() => console.log("buffer done"))

// --- 2.7 流的扫描与折叠 ---

// scan: 类似 reduce，但发射每个中间结果
const scanned = pipe(
  Stream.range(1, 10),
  Stream.scan(0, (acc, n) => acc + n)
)

Effect.runPromise(
  Stream.runForEach(scanned, (n) => Console.log(`scan: ${n}`))
).then(() => console.log("scan done"))

// runFold: 将流折叠为一个值
const sum = Effect.runSync(
  pipe(Stream.range(1, 101), Stream.runFold(0, (acc, n) => acc + n))
)
console.log("sum 1-100:", sum) // 5050

// --- 2.8 流的扁平化 ---

// flatMap: 将每个元素映射为一个流，然后展平
const flatMapped = pipe(
  Stream.range(1, 5),
  Stream.flatMap((n) => Stream.range(1, n))
)

Effect.runPromise(
  Stream.runForEach(flatMapped, (n) => Console.log(`flatMap: ${n}`))
).then(() => console.log("flatMap done"))
