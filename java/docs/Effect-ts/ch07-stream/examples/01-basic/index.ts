import { Stream, Effect, Console, Chunk, pipe } from "effect"

// ============================================================
// 01-basic: Stream 基础 —— 从 Effect 到流的思维转变
// ============================================================

// --- 1.1 创建流：从数组、区间、重复值 ---

// Stream.fromIterable: 将数组转换为流，逐个元素发射
const numberStream: Stream.Stream<number> = Stream.fromIterable([1, 2, 3, 4, 5])

// Stream.range: 生成一个整数区间流 [start, end)
const rangeStream: Stream.Stream<number> = Stream.range(1, 10)

// Stream.repeat: 重复一个值无限次（需配合 take 截断）
const repeatStream: Stream.Stream<number> = Stream.repeat(42)

// --- 1.2 消费流：collect / runCollect / runForEach ---

// runCollect: 将流的所有元素收集到 Chunk 中
const collected = Effect.runSync(Stream.runCollect(numberStream))
console.log("collected:", collected) // Chunk(1, 2, 3, 4, 5)

// runForEach: 对流中每个元素执行 Effect 操作
Effect.runPromise(
  Stream.runForEach(rangeStream, (n) => Console.log(`range: ${n}`))
).then(() => console.log("range done"))

// runCount: 统计流中元素个数
const count = Effect.runSync(Stream.runCount(Stream.range(0, 98)))
console.log("count:", count) // 99

// --- 1.3 流的转换：map / filter / take / drop ---

const transformed = pipe(
  Stream.range(1, 20),
  Stream.filter((n) => n % 2 === 0), // 只保留偶数
  Stream.map((n) => n * 10),          // 每个元素乘以 10
  Stream.take(7)                       // 只取前 7 个
)

Effect.runPromise(
  Stream.runForEach(transformed, (n) => Console.log(`transformed: ${n}`))
).then(() => console.log("transformed done"))

// --- 1.4 理解背压：慢消费者不会压垮生产者 ---

// 模拟一个慢消费者：每个元素处理需要 100ms
// 生产者即使很快，也会被消费者的速度自然节流
const slowConsumer = (n: number) =>
  Effect.sleep("100 millis").pipe(Effect.andThen(Console.log(`slow consumed: ${n}`)))

Effect.runPromise(
  pipe(
    Stream.range(1, 10),
    Stream.tap((n) => Console.log(`produced: ${n}`)), // 观察生产节奏
    Stream.runForEach(slowConsumer)
  )
).then(() => console.log("backpressure demo done"))

// --- 1.5 Chunk 分块：批量处理提升吞吐 ---

// 不使用 Chunk：逐个处理，开销大
const noChunk = pipe(
  Stream.range(1, 1000),
  Stream.map((n) => n * 2),
  Stream.runCollect
)

// 使用 chunks 方法：按块处理，减少调度开销
const withChunk = pipe(
  Stream.range(1, 1000),
  Stream.chunks, // 暴露底层的 Chunk 结构
  Stream.map((chunk) => {
    // 对整个 Chunk 做批量操作
    const doubled = Chunk.map(chunk, (n) => n * 2)
    return doubled
  }),
  Stream.runCollect
)

console.log("noChunk result length:", Effect.runSync(noChunk).length)
console.log("withChunk result length:", Effect.runSync(withChunk).length)

// --- 1.6 流的错误处理 ---

// Stream 可以携带错误类型，与 Effect 一致
const failingStream: Stream.Stream<number, Error> = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.flatMap((n) =>
    n === 3
      ? Stream.fail(new Error("boom at 3"))
      : Stream.succeed(n)
  )
)

// 使用 catchAll 捕获流中的错误并恢复
const recovered = failingStream.pipe(
  Stream.catchAll((err) => {
    console.log(`caught: ${err.message}`)
    return Stream.make(-1) // 恢复为一个默认值
  })
)

Effect.runPromise(
  Stream.runForEach(recovered, (n) => Console.log(`recovered: ${n}`))
).then(() => console.log("error handling done"))
