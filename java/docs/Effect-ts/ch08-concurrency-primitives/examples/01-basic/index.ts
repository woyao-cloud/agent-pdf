import { Effect, Ref, SynchronizedRef, Console, pipe, Fiber, Queue, Hub, Duration, Chunk, Option, Either } from "effect"

// ============================================================
// 01-basic: Ref / SynchronizedRef / Queue / Hub 基础
// ============================================================

// --- 1.1 Ref：不可变状态的原子更新 ---

// Ref.make: 创建一个 Ref，初始值为给定值
const refProgram = Effect.gen(function* (_) {
  // 创建 Ref
  const ref = yield* _(Ref.make(0))

  // 读取当前值
  const current = yield* _(Ref.get(ref))
  console.log(`initial value: ${current}`)

  // 设置新值
  yield* _(Ref.set(ref, 42))
  const afterSet = yield* _(Ref.get(ref))
  console.log(`after set: ${afterSet}`)

  // 原子更新：update 使用函数更新值
  yield* _(Ref.update(ref, (n) => n + 1))
  const afterUpdate = yield* _(Ref.get(ref))
  console.log(`after update: ${afterUpdate}`)

  // 原子更新并返回新值
  const newValue = yield* _(Ref.updateAndGet(ref, (n) => n * 2))
  console.log(`updateAndGet: ${newValue}`)

  // 原子更新并返回旧值
  const oldValue = yield* _(Ref.getAndUpdate(ref, (n) => n - 10))
  console.log(`getAndUpdate: old=${oldValue}, new=${yield* _(Ref.get(ref))}`)

  // 修改并返回修改结果
  const modified = yield* _(Ref.modify(ref, (n) => [n * 2, n] as const))
  console.log(`modify: old=${modified}, new=${yield* _(Ref.get(ref))}`)
})

Effect.runPromise(refProgram).then(() => console.log("Ref demo done"))

// --- 1.2 并发安全的 Ref 操作 ---

// 多个 Fiber 同时更新 Ref，验证原子性
const concurrentRefProgram = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make(0))

  // 启动 10 个 Fiber，每个对 Ref 递增 100 次
  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 10 }, (_, i) => i),
    () =>
      Effect.fork(
        Effect.replicate(100, Ref.update(ref, (n) => n + 1)).pipe(
          Effect.flatMap(() => Effect.void)
        )
      ),
    { concurrency: "unbounded" }
  ))

  // 等待所有 Fiber 完成
  yield* _(Fiber.joinAll(fibers))

  const final = yield* _(Ref.get(ref))
  console.log(`concurrent increment result: ${final}`) // 应该为 1000
})

Effect.runPromise(concurrentRefProgram).then(() => console.log("concurrent Ref demo done"))

// --- 1.3 SynchronizedRef：复合操作的原子性 ---

// SynchronizedRef 保证复合操作（读-改-写）的原子性
const syncRefProgram = Effect.gen(function* (_) {
  const ref = yield* _(SynchronizedRef.make(0))

  // 使用 modifyEffect 执行基于当前值的复杂更新
  const result = yield* _(
    SynchronizedRef.modifyEffect(ref, (current) =>
      Effect.succeed([current * 2, `doubled from ${current}`] as const)
    )
  )
  console.log(`modifyEffect result: ${result}`)

  // 使用 modify 进行原子更新
  const old = yield* _(SynchronizedRef.modify(ref, (n) => [n + 1, n] as const))
  console.log(`SynchronizedRef modify: old=${old}, new=${yield* _(SynchronizedRef.get(ref))}`)
})

Effect.runPromise(syncRefProgram).then(() => console.log("SynchronizedRef demo done"))

// --- 1.4 Queue：生产者-消费者模型 ---

// Queue.bounded: 创建有界队列
const queueProgram = Effect.gen(function* (_) {
  // 创建容量为 5 的有界队列
  const queue = yield* _(Queue.bounded<number>(5))

  // 生产者：向队列中放入元素
  yield* _(Queue.offer(queue, 1))
  yield* _(Queue.offer(queue, 2))
  yield* _(Queue.offer(queue, 3))

  // 消费者：从队列中取出元素
  const value1 = yield* _(Queue.take(queue))
  const value2 = yield* _(Queue.take(queue))
  const value3 = yield* _(Queue.take(queue))

  console.log(`queue values: ${value1}, ${value2}, ${value3}`)

  // 队列为空时，take 会阻塞直到有元素可用
  // 使用 poll 进行非阻塞尝试
  const pollResult = yield* _(Queue.poll(queue))
  console.log(`poll on empty queue: ${Option.isNone(pollResult) ? "None" : "Some"}`)
})

Effect.runPromise(queueProgram).then(() => console.log("Queue demo done"))

// --- 1.5 Hub：发布-订阅模式 ---

// Hub.bounded: 创建有界 Hub
const hubProgram = Effect.gen(function* (_) {
  // 创建容量为 10 的 Hub
  const hub = yield* _(Hub.bounded<number>(10))

  // 订阅 Hub：每次订阅创建一个新的 Queue
  const subscriber1 = yield* _(Hub.subscribe(hub))
  const subscriber2 = yield* _(Hub.subscribe(hub))

  // 发布消息
  yield* _(Hub.publish(hub, 1))
  yield* _(Hub.publish(hub, 2))
  yield* _(Hub.publish(hub, 3))

  // 每个订阅者都能收到所有消息
  const from1 = yield* _(Queue.take(subscriber1))
  const from2 = yield* _(Queue.take(subscriber2))
  console.log(`subscriber1: ${from1}, subscriber2: ${from2}`)

  // 关闭 Hub
  yield* _(Hub.shutdown(hub))
})

Effect.runPromise(hubProgram).then(() => console.log("Hub demo done"))

// --- 1.6 有界队列的背压演示 ---

const backpressureProgram = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(3))

  // 快速放入 5 个元素（队列容量只有 3）
  // 第 4 个 offer 会阻塞，直到有消费者取走元素
  const producer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 1; i <= 5; i++) {
        yield* _(Queue.offer(queue, i))
        console.log(`produced: ${i}`)
      }
    })
  )

  // 慢消费者：每 500ms 取一个元素
  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      for (let i = 1; i <= 5; i++) {
        yield* _(Effect.sleep("500 millis"))
        const value = yield* _(Queue.take(queue))
        console.log(`consumed: ${value}`)
      }
    })
  )

  yield* _(Fiber.join(producer))
  yield* _(Fiber.join(consumer))
})

Effect.runPromise(backpressureProgram).then(() => console.log("backpressure demo done"))
