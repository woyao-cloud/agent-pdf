import { Effect, Ref, SynchronizedRef, Console, pipe, Fiber, Queue, Hub, Duration, Chunk, Option, Either, Schedule, Stream, Random, Array, Tuple } from "effect"

// ============================================================
// 02-advanced: 并发原语的高级用法
// ============================================================

// --- 2.1 Ref 的高级模式：状态机 ---

// 使用 Ref 实现一个简单的状态机
type State = "idle" | "running" | "completed" | "error"
interface StateMachine {
  state: State
  count: number
  lastError: Option.Option<string>
}

const stateMachineProgram = Effect.gen(function* (_) {
  const ref = yield* _(Ref.make<StateMachine>({
    state: "idle",
    count: 0,
    lastError: Option.none(),
  }))

  // 原子地转换状态
  const transition = (from: State, to: State) =>
    Ref.modify(ref, (s) => {
      if (s.state !== from) {
        return [false, s] as const // 转换失败
      }
      return [true, { ...s, state: to, count: s.count + 1 }] as const
    })

  // 尝试转换
  const r1 = yield* _(transition("idle", "running"))
  console.log(`idle -> running: ${r1}`)

  const r2 = yield* _(transition("idle", "completed")) // 应该失败
  console.log(`idle -> completed: ${r2}`)

  const r3 = yield* _(transition("running", "completed"))
  console.log(`running -> completed: ${r3}`)

  const state = yield* _(Ref.get(ref))
  console.log(`final state: ${JSON.stringify(state)}`)
})

Effect.runPromise(stateMachineProgram).then(() => console.log("state machine demo done"))

// --- 2.2 SynchronizedRef 的复合操作 ---

// 使用 SynchronizedRef 实现线程安全的计数器
const safeCounterProgram = Effect.gen(function* (_) {
  const ref = yield* _(SynchronizedRef.make(0))

  // 复合操作：读取当前值，执行副作用，然后更新
  const incrementAndLog = SynchronizedRef.modifyEffect(ref, (current) =>
    Console.log(`incrementing from ${current}`).pipe(
      Effect.andThen([current + 1, current] as const)
    )
  )

  // 并发执行复合操作
  const fibers = yield* _(Effect.forEach(
    Array.from({ length: 5 }, (_, i) => i),
    () => Effect.fork(incrementAndLog),
    { concurrency: "unbounded" }
  ))

  yield* _(Fiber.joinAll(fibers))
  const final = yield* _(SynchronizedRef.get(ref))
  console.log(`final counter: ${final}`)
})

Effect.runPromise(safeCounterProgram).then(() => console.log("safe counter demo done"))

// --- 2.3 Queue 的高级模式：工作池 ---

// 使用 Queue 实现工作池
interface WorkItem {
  id: number
  payload: string
  processTime: number
}

const workPoolProgram = Effect.gen(function* (_) {
  const queue = yield* _(Queue.unbounded<WorkItem>())

  // 工作函数
  const worker = (id: number) =>
    Effect.gen(function* (_) {
      while (true) {
        const item = yield* _(Queue.take(queue))
        console.log(`Worker ${id} processing item ${item.id}`)
        yield* _(Effect.sleep(`${item.processTime} millis`))
        console.log(`Worker ${id} completed item ${item.id}: ${item.payload}`)
      }
    })

  // 启动 3 个 worker
  const workers = yield* _(Effect.forEach(
    [1, 2, 3],
    (id) => Effect.fork(worker(id)),
    { concurrency: "unbounded" }
  ))

  // 提交 10 个工作项
  yield* _(Effect.forEach(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      payload: `task-${i + 1}`,
      processTime: Math.floor(Math.random() * 200) + 50,
    })),
    (item) => Queue.offer(queue, item),
    { concurrency: "unbounded" }
  ))

  // 等待所有工作完成
  yield* _(Effect.sleep("3 seconds"))

  // 关闭队列
  yield* _(Queue.shutdown(queue))
  console.log("work pool done")
})

Effect.runPromise(workPoolProgram).then(() => console.log("work pool demo done"))

// --- 2.4 Hub 的高级模式：事件广播 ---

// 使用 Hub 实现事件广播系统
interface AppEvent {
  type: string
  data: unknown
  timestamp: number
}

const eventBusProgram = Effect.gen(function* (_) {
  const hub = yield* _(Hub.bounded<AppEvent>(100))

  // 创建不同类型的订阅者
  const createSubscriber = (name: string, filter: (e: AppEvent) => boolean) =>
    Effect.gen(function* (_) {
      const queue = yield* _(Hub.subscribe(hub))
      while (true) {
        const event = yield* _(Queue.take(queue))
        if (filter(event)) {
          console.log(`[${name}] received: ${event.type} = ${JSON.stringify(event.data)}`)
        }
      }
    })

  // 启动订阅者
  const allEvents = yield* _(Effect.fork(createSubscriber("all", () => true)))
  const errorEvents = yield* _(Effect.fork(
    createSubscriber("error-logger", (e) => e.type === "error")
  ))

  // 发布事件
  const publish = (type: string, data: unknown) =>
    Hub.publish(hub, { type, data, timestamp: Date.now() })

  yield* _(publish("user-login", { userId: 1 }))
  yield* _(publish("data-update", { key: "value" }))
  yield* _(publish("error", { message: "something went wrong" }))
  yield* _(publish("user-logout", { userId: 1 }))

  yield* _(Effect.sleep("1 seconds"))
  yield* _(Hub.shutdown(hub))
  console.log("event bus demo done")
})

Effect.runPromise(eventBusProgram).then(() => console.log("event bus demo done"))

// --- 2.5 Queue 与 Stream 的集成 ---

const queueStreamProgram = Effect.gen(function* (_) {
  const queue = yield* _(Queue.bounded<number>(10))

  // 将 Queue 转换为 Stream
  const stream = Queue.toStream(queue)

  // 启动消费者 Fiber
  const consumer = Effect.fork(
    Effect.gen(function* (_) {
      const sum = yield* _(
        pipe(
          stream,
          Stream.take(5),
          Stream.runFold(0, (acc, n) => acc + n)
        )
      )
      console.log(`sum from queue stream: ${sum}`)
    })
  )

  // 向 Queue 中放入数据
  yield* _(Queue.offer(queue, 1))
  yield* _(Queue.offer(queue, 2))
  yield* _(Queue.offer(queue, 3))
  yield* _(Queue.offer(queue, 4))
  yield* _(Queue.offer(queue, 5))

  yield* _(Fiber.join(consumer))
  yield* _(Queue.shutdown(queue))
  console.log("queue stream demo done")
})

Effect.runPromise(queueStreamProgram).then(() => console.log("queue stream demo done"))

// --- 2.6 有界队列的背压与策略 ---

const queueStrategyProgram = Effect.gen(function* (_) {
  // 使用 dropping 策略的队列
  const droppingQueue = yield* _(Queue.dropping<number>(3))

  // 放入 5 个元素，但容量只有 3
  yield* _(Queue.offer(droppingQueue, 1))
  yield* _(Queue.offer(droppingQueue, 2))
  yield* _(Queue.offer(droppingQueue, 3))
  const offered4 = yield* _(Queue.offer(droppingQueue, 4)) // 被丢弃
  const offered5 = yield* _(Queue.offer(droppingQueue, 5)) // 被丢弃

  console.log(`dropping queue: offer 4 succeeded = ${offered4}, offer 5 succeeded = ${offered5}`)

  // 取出所有元素
  const values = yield* _(Queue.takeAll(droppingQueue))
  console.log(`dropping queue values: ${Chunk.toReadonlyArray(values)}`)

  // 使用 sliding 策略的队列
  const slidingQueue = yield* _(Queue.sliding<number>(3))

  yield* _(Queue.offer(slidingQueue, 1))
  yield* _(Queue.offer(slidingQueue, 2))
  yield* _(Queue.offer(slidingQueue, 3))
  yield* _(Queue.offer(slidingQueue, 4)) // 1 被丢弃
  yield* _(Queue.offer(slidingQueue, 5)) // 2 被丢弃

  const slidingValues = yield* _(Queue.takeAll(slidingQueue))
  console.log(`sliding queue values: ${Chunk.toReadonlyArray(slidingValues)}`) // [3, 4, 5]
})

Effect.runPromise(queueStrategyProgram).then(() => console.log("queue strategy demo done"))
