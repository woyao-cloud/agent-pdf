import { Effect, Fiber, Console, Duration, Schedule, Queue } from "effect";

// ============================================================
// 03-production: 生产级 Fiber 管理
// ============================================================

// --- 领域模型 ---
interface Task {
  readonly id: string;
  readonly type: "email" | "report" | "cleanup";
  readonly priority: number;
  readonly payload: unknown;
}

interface TaskResult {
  readonly taskId: string;
  readonly status: "success" | "failure";
  readonly duration: number;
}

// --- 错误类型 ---
class TaskTimeoutError {
  readonly _tag = "TaskTimeoutError";
  constructor(readonly taskId: string) {}
}

class TaskExecutionError {
  readonly _tag = "TaskExecutionError";
  constructor(readonly taskId: string, readonly message: string) {}
}

// --- 1. Fiber Pool: 限制并发数 ---
class FiberPool {
  private running = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  run<A, E>(
    task: Effect.Effect<A, E, never>
  ): Effect.Effect<A, E, never> {
    return Effect.gen(this, function* () {
      // 等待直到有空闲槽位
      while (this.running >= this.maxConcurrency) {
        yield* Effect.sleep("100 millis");
      }
      this.running++;
      try {
        return yield* task;
      } finally {
        this.running--;
      }
    });
  }
}

// --- 2. 带超时的任务执行器 ---
const executeTaskWithTimeout = (
  task: Task,
  timeout: Duration.DurationInput
): Effect.Effect<TaskResult, TaskTimeoutError | TaskExecutionError, never> => {
  const startTime = Date.now();

  const execute = Effect.gen(function* () {
    // 模拟不同类型的任务
    switch (task.type) {
      case "email":
        yield* Effect.sleep("2 seconds");
        break;
      case "report":
        yield* Effect.sleep("3 seconds");
        break;
      case "cleanup":
        yield* Effect.sleep("1 second");
        break;
    }

    const duration = Date.now() - startTime;
    return {
      taskId: task.id,
      status: "success" as const,
      duration,
    };
  });

  return execute.pipe(
    Effect.timeout(timeout),
    Effect.mapError((timeoutError) => {
      if (timeoutError._tag === "TimeoutException") {
        return new TaskTimeoutError(task.id);
      }
      return new TaskExecutionError(task.id, "未知错误");
    })
  );
};

// --- 3. 任务调度器（带优先级）---
class TaskScheduler {
  private pool: FiberPool;
  private activeFibers: Map<string, Fiber.Fiber<TaskResult, any>> = new Map();

  constructor(maxConcurrency: number) {
    this.pool = new FiberPool(maxConcurrency);
  }

  schedule(task: Task): Effect.Effect<TaskResult, never, never> {
    return Effect.gen(this, function* () {
      const execution = executeTaskWithTimeout(task, "10 seconds").pipe(
        Effect.catchAll((err) => {
          console.error(`[调度器] 任务 ${task.id} 失败: ${err._tag}`);
          return Effect.succeed({
            taskId: task.id,
            status: "failure" as const,
            duration: 0,
          });
        })
      );

      const fiber = yield* Effect.fork(this.pool.run(execution));
      this.activeFibers.set(task.id, fiber);

      const result = yield* Fiber.join(fiber);
      this.activeFibers.delete(task.id);
      return result;
    });
  }

  cancel(taskId: string): Effect.Effect<boolean, never, never> {
    const fiber = this.activeFibers.get(taskId);
    if (!fiber) {
      return Effect.succeed(false);
    }
    return Effect.gen(this, function* () {
      yield* Fiber.interrupt(fiber);
      this.activeFibers.delete(taskId);
      console.log(`[调度器] 任务 ${taskId} 已取消`);
      return true;
    });
  }

  cancelAll(): Effect.Effect<number, never, never> {
    return Effect.gen(this, function* () {
      let count = 0;
      for (const [taskId, fiber] of this.activeFibers) {
        yield* Fiber.interrupt(fiber);
        count++;
      }
      this.activeFibers.clear();
      console.log(`[调度器] 已取消 ${count} 个任务`);
      return count;
    });
  }
}

// --- 4. 健康检查与监控 ---
const healthCheck = (
  scheduler: TaskScheduler
): Effect.Effect<void, never, never> => {
  return Effect.gen(function* () {
    console.log("[监控] 执行健康检查...");

    // 模拟健康检查任务
    const healthTask: Task = {
      id: "health-check",
      type: "cleanup",
      priority: 100,
      payload: null,
    };

    const result = yield* scheduler.schedule(healthTask);
    console.log(`[监控] 健康检查结果: ${result.status}`);
  });
};

// --- 5. 优雅关闭 ---
const gracefulShutdown = (
  scheduler: TaskScheduler
): Effect.Effect<void, never, never> => {
  return Effect.gen(function* () {
    console.log("[关闭] 开始优雅关闭...");

    // 取消所有活跃任务
    const cancelled = yield* scheduler.cancelAll();
    console.log(`[关闭] 已取消 ${cancelled} 个活跃任务`);

    // 等待资源释放
    yield* Effect.sleep("1 second");
    console.log("[关闭] 优雅关闭完成");
  });
};

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== 生产级 Fiber 管理演示 ===\n");

  const scheduler = new TaskScheduler(3); // 最多 3 个并发

  // 创建一批任务
  const tasks: Task[] = [
    { id: "task-1", type: "email", priority: 1, payload: "用户注册通知" },
    { id: "task-2", type: "report", priority: 2, payload: "日报表" },
    { id: "task-3", type: "cleanup", priority: 3, payload: "清理缓存" },
    { id: "task-4", type: "email", priority: 1, payload: "密码重置" },
    { id: "task-5", type: "report", priority: 2, payload: "月报表" },
  ];

  // 调度所有任务
  console.log("调度任务中...");
  const results = yield* Effect.all(
    tasks.map((task) => scheduler.schedule(task)),
    { concurrency: "unbounded" }
  );

  console.log("\n任务执行结果:");
  for (const result of results) {
    console.log(`  ${result.taskId}: ${result.status} (${result.duration}ms)`);
  }

  // 健康检查
  console.log("");
  yield* healthCheck(scheduler);

  // 优雅关闭
  console.log("");
  yield* gracefulShutdown(scheduler);
}

// 使用 Effect.runPromise 运行
Effect.runPromise(
  Effect.gen(function* () {
    yield* main();
  })
).catch(console.error);
