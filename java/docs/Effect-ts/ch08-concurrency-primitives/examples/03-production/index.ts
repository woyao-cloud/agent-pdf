import { Effect, Ref, SynchronizedRef, Console, pipe, Fiber, Queue, Hub, Duration, Chunk, Option, Either, Schedule, Stream, Random, Array, HashMap, Tuple, Exit, Scope } from "effect"

// ============================================================
// 03-production: 生产级并发系统 —— 任务调度器
// ============================================================

// --- 3.1 系统架构 ---

// 我们构建一个生产级的任务调度系统，包含：
// - 任务队列：使用 Queue 管理待处理任务
// - 工作池：多个 worker 并发处理任务
// - 状态管理：使用 Ref 跟踪系统状态
// - 事件总线：使用 Hub 广播系统事件
// - 结果收集：使用 Queue 收集处理结果

// --- 3.2 类型定义 ---

type TaskStatus = "pending" | "running" | "completed" | "failed"

interface Task {
  id: string
  name: string
  payload: unknown
  priority: number
  createdAt: number
}

interface TaskResult {
  taskId: string
  status: TaskStatus
  output: Option.Option<string>
  error: Option.Option<string>
  processingTime: number
}

interface SystemEvent {
  type: "task-submitted" | "task-started" | "task-completed" | "task-failed" | "worker-status" | "system-error"
  data: unknown
  timestamp: number
}

interface SystemState {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  activeWorkers: number
  isRunning: boolean
}

// --- 3.3 任务调度器类 ---

class TaskScheduler {
  private taskQueue: Queue.Queue<Task>
  private resultQueue: Queue.Queue<TaskResult>
  private eventHub: Hub.Hub<SystemEvent>
  private state: Ref.Ref<SystemState>
  private workers: Ref.Ref<Array<Fiber.Fiber<void>>>

  private constructor(
    taskQueue: Queue.Queue<Task>,
    resultQueue: Queue.Queue<TaskResult>,
    eventHub: Hub.Hub<SystemEvent>,
    state: Ref.Ref<SystemState>,
    workers: Ref.Ref<Array<Fiber.Fiber<void>>>
  ) {
    this.taskQueue = taskQueue
    this.resultQueue = resultQueue
    this.eventHub = eventHub
    this.state = state
    this.workers = workers
  }

  static make(maxQueueSize: number): Effect.Effect<TaskScheduler> {
    return Effect.gen(function* (_) {
      const taskQueue = yield* _(Queue.bounded<Task>(maxQueueSize))
      const resultQueue = yield* _(Queue.unbounded<TaskResult>())
      const eventHub = yield* _(Hub.bounded<SystemEvent>(1000))
      const state = yield* _(Ref.make<SystemState>({
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        activeWorkers: 0,
        isRunning: false,
      }))
      const workers = yield* _(Ref.make<Fiber.Fiber<void>[]>([]))
      return new TaskScheduler(taskQueue, resultQueue, eventHub, state, workers)
    })
  }

  // 发布事件
  private publishEvent(type: SystemEvent["type"], data: unknown): Effect.Effect<void> {
    return Hub.publish(this.eventHub, { type, data, timestamp: Date.now() })
  }

  // 提交任务
  submit(task: Task): Effect.Effect<boolean> {
    return Effect.gen(function* (_) {
      const offered = yield* _(Queue.offer(this.taskQueue, task))
      if (offered) {
        yield* _(Ref.update(this.state, (s) => ({ ...s, totalTasks: s.totalTasks + 1 })))
        yield* _(this.publishEvent("task-submitted", { taskId: task.id, name: task.name }))
      }
      return offered
    })
  }

  // 工作函数
  private workerLogic(workerId: number): Effect.Effect<void> {
    const processTask = (task: Task): Effect.Effect<TaskResult> =>
      Effect.gen(function* (_) {
        yield* _(this.publishEvent("task-started", { taskId: task.id, workerId }))
        yield* _(Ref.update(this.state, (s) => ({ ...s, activeWorkers: s.activeWorkers + 1 })))

        const startTime = Date.now()

        // 模拟任务处理
        const result = yield* _(
          Effect.gen(function* (_) {
            // 模拟处理时间
            yield* _(Effect.sleep(`${task.priority * 100} millis`))

            // 模拟随机失败（10% 概率）
            if (Math.random() < 0.1) {
              return yield* _(Effect.fail(new Error(`Task ${task.id} failed randomly`)))
            }

            return `Processed: ${JSON.stringify(task.payload)}`
          }).pipe(
            Effect.catchAll((err) =>
              Effect.succeed({
                taskId: task.id,
                status: "failed" as TaskStatus,
                output: Option.none(),
                error: Option.some(err.message),
                processingTime: Date.now() - startTime,
              })
            )
          )
        )

        const endTime = Date.now()

        // 构造结果
        const taskResult: TaskResult = {
          taskId: task.id,
          status: "completed",
          output: Option.some(result),
          error: Option.none(),
          processingTime: endTime - startTime,
        }

        yield* _(Ref.update(this.state, (s) => ({
          ...s,
          completedTasks: s.completedTasks + 1,
          activeWorkers: s.activeWorkers - 1,
        })))

        yield* _(this.publishEvent("task-completed", {
          taskId: task.id,
          workerId,
          processingTime: taskResult.processingTime,
        }))

        return taskResult
      }).pipe(
        Effect.catchAll((err) =>
          Effect.succeed({
            taskId: task.id,
            status: "failed" as TaskStatus,
            output: Option.none(),
            error: Option.some(err.message),
            processingTime: 0,
          })
        )
      )

    // 无限循环：从队列取任务并处理
    const loop: Effect.Effect<void> = Effect.gen(function* (_) {
      while (true) {
        const task = yield* _(Queue.take(this.taskQueue))
        const result = yield* _(processTask(task))
        yield* _(Queue.offer(this.resultQueue, result))
      }
    })

    return loop
  }

  // 启动工作池
  start(numWorkers: number): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.set(this.state, { ...(yield* _(Ref.get(this.state))), isRunning: true }))

      const workerFibers = yield* _(Effect.forEach(
        Array.from({ length: numWorkers }, (_, i) => i + 1),
        (id) => Effect.fork(this.workerLogic(id)),
        { concurrency: "unbounded" }
      ))

      yield* _(Ref.set(this.workers, workerFibers))
      yield* _(this.publishEvent("worker-status", { activeWorkers: numWorkers }))
      console.log(`Started ${numWorkers} workers`)
    })
  }

  // 获取结果流
  getResultStream(): Stream.Stream<TaskResult> {
    return Queue.toStream(this.resultQueue)
  }

  // 获取事件流
  getEventStream(): Stream.Stream<SystemEvent> {
    return Stream.fromEffect(
      Hub.subscribe(this.eventHub).pipe(
        Effect.andThen((queue) => Queue.toStream(queue))
      )
    )
  }

  // 获取系统状态
  getState(): Effect.Effect<SystemState> {
    return Ref.get(this.state)
  }

  // 关闭调度器
  shutdown(): Effect.Effect<void> {
    return Effect.gen(function* (_) {
      yield* _(Ref.update(this.state, (s) => ({ ...s, isRunning: false })))

      // 关闭队列
      yield* _(Queue.shutdown(this.taskQueue))
      yield* _(Queue.shutdown(this.resultQueue))
      yield* _(Hub.shutdown(this.eventHub))

      // 中断所有 worker
      const workers = yield* _(Ref.get(this.workers))
      yield* _(Fiber.interruptAll(workers))

      console.log("Scheduler shutdown complete")
    })
  }
}

// --- 3.4 主程序 ---

const main = Effect.gen(function* (_) {
  // 创建调度器
  const scheduler = yield* _(TaskScheduler.make(100))
  console.log("Task scheduler created")

  // 启动事件监控
  const eventMonitor = Effect.fork(
    Effect.gen(function* (_) {
      const eventStream = scheduler.getEventStream()
      yield* _(
        pipe(
          eventStream,
          Stream.take(20),
          Stream.runForEach((event) =>
            Console.log(`[Event] ${event.type}: ${JSON.stringify(event.data)}`)
          )
        )
      )
    })
  )

  // 启动结果收集器
  const resultCollector = Effect.fork(
    Effect.gen(function* (_) {
      const resultStream = scheduler.getResultStream()
      yield* _(
        pipe(
          resultStream,
          Stream.take(50),
          Stream.runFold(0, (count, result) => {
            if (result.status === "completed") {
              console.log(`[Result] Task ${result.taskId}: completed in ${result.processingTime}ms`)
            } else {
              console.log(`[Result] Task ${result.taskId}: failed - ${result.error}`)
            }
            return count + 1
          })
        )
      )
    })
  )

  // 启动工作池
  yield* _(scheduler.start(4))

  // 提交 50 个任务
  yield* _(Effect.forEach(
    Array.from({ length: 50 }, (_, i) => ({
      id: `task-${i + 1}`,
      name: `Task ${i + 1}`,
      payload: { index: i, data: `payload-${i}` },
      priority: (i % 5) + 1,
      createdAt: Date.now(),
    })),
    (task) => scheduler.submit(task),
    { concurrency: "unbounded" }
  ))
  console.log("Submitted 50 tasks")

  // 等待处理完成
  yield* _(Effect.sleep("15 seconds"))

  // 获取最终状态
  const finalState = yield* _(scheduler.getState())
  console.log("\n=== Final System State ===")
  console.log(`Total tasks: ${finalState.totalTasks}`)
  console.log(`Completed: ${finalState.completedTasks}`)
  console.log(`Failed: ${finalState.failedTasks}`)
  console.log(`Active workers: ${finalState.activeWorkers}`)
  console.log(`Is running: ${finalState.isRunning}`)

  // 关闭
  yield* _(scheduler.shutdown())
  console.log("Main program complete")
})

Effect.runPromise(main).then(
  () => console.log("Production scheduler completed successfully"),
  (err) => console.error("Scheduler failed:", err)
)
