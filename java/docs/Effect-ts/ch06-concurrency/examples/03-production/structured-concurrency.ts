import { Effect, Console, Fiber, Scope, pipe, Queue } from "effect";

// ============================================================
// 03-production/structured-concurrency.ts
// 生产级：结构化并发与 Fiber 泄漏防护
// ============================================================

// ==================== 工作处理器 ====================

interface Job {
  readonly id: number;
  readonly payload: string;
}

// ==================== 结构化并发 Worker ====================

// 使用 Scope 确保所有 Fiber 在结束时被清理
const createWorker = (workerId: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`[Worker ${workerId}] 启动`));

    // 在 Scope 内创建 Fiber，确保不会泄漏
    const processJob = (job: Job) =>
      Effect.gen(function* (__) {
        yield* _(Console.log(`[Worker ${workerId}] 处理任务 #${job.id}: ${job.payload}`));
        yield* _(Effect.sleep(`${Math.random() * 500} millis`));
        yield* _(Console.log(`[Worker ${workerId}] 任务 #${job.id} 完成`));
        return `processed-${job.id}`;
      });

    return { workerId, processJob };
  });

// ==================== 任务分发器 ====================

const createDispatcher = (numWorkers: number) =>
  Effect.gen(function* (_) {
    const workers = yield* _(Effect.all(
      Array.from({ length: numWorkers }, (_, i) => createWorker(i + 1)),
      { concurrency: "unbounded" }
    ));

    // 轮询分发
    let nextWorker = 0;
    const dispatch = (job: Job) => {
      const worker = workers[nextWorker % workers.length];
      nextWorker++;
      return worker.processJob(job);
    };

    return { dispatch, workerCount: workers.length };
  });

// ==================== 安全 Fiber 管理 ====================

// 使用 Scope 管理 Fiber 生命周期
const supervisedFork = <A, E>(
  effect: Effect.Effect<A, E>
): Effect.Effect<Fiber.RuntimeFiber<A, E>, never, Scope> =>
  Effect.gen(function* (_) {
    const scope = yield* _(Scope.Scope);
    const fiber = yield* _(Effect.fork(effect));

    // 注册 Fiber 到 Scope，Scope 关闭时自动中断 Fiber
    yield* _(Scope.addFinalizer(
      Effect.flatMap(
        Fiber.interrupt(fiber),
        () => Console.log(`[Scope] Fiber 已中断`)
      )
    ));

    return fiber;
  });

// ==================== 并发任务执行器 ====================

const executeJobs = (jobs: Job[], concurrency: number) =>
  Effect.scoped(
    Effect.gen(function* (_) {
      const dispatcher = yield* _(createDispatcher(concurrency));
      yield* _(Console.log(`分发器已创建: ${dispatcher.workerCount} 个 Worker`));

      // 并发执行所有任务
      const results = yield* _(
        Effect.all(
          jobs.map((job) => dispatcher.dispatch(job)),
          { concurrency: "unbounded" }
        )
      );

      yield* _(Console.log(`所有任务完成: ${results.length} 个`));
      return results;
    })
  );

// ==================== Fiber 泄漏演示 ====================

// 错误的做法：Fork 后不 Join 也不 Interrupt
const leakyFork = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(
    Effect.sleep("10 seconds").pipe(
      Effect.flatMap(() => Console.log("这个 Fiber 泄漏了!"))
    )
  ));
  // 没有 Fiber.join 也没有 Fiber.interrupt
  // 程序结束后 Fiber 仍然在运行
  return "泄漏了!";
});

// 正确的做法：使用 Scope 管理
const safeFork = Effect.scoped(
  Effect.gen(function* (_) {
    const fiber = yield* _(supervisedFork(
      Effect.sleep("10 seconds").pipe(
        Effect.flatMap(() => Console.log("这个 Fiber 被安全管理"))
      )
    ));
    // Scope 结束时自动中断 Fiber
    return "安全的!";
  })
);

// ==================== 运行 ====================

const jobs: Job[] = Array.from(
  { length: 10 },
  (_, i) => ({ id: i + 1, payload: `data-${i + 1}` })
);

const main = executeJobs(jobs, 3).pipe(
  Effect.flatMap((results) =>
    Console.log(`最终结果: ${JSON.stringify(results)}`)
  )
);

Effect.runPromise(main).then(() => console.log("结构化并发演示完成"));

// ============================================================
// 生产级结构化并发要点：
// 1. Scope 管理 Fiber：Scope 关闭时自动中断所有子 Fiber
// 2. 防泄漏：每个 Fork 必须有对应的 Join 或 Interrupt
// 3. 结构化并发：Fiber 生命周期与 Scope 绑定
// 4. Worker 池：固定数量 Worker，避免无限创建 Fiber
// 5. 监督机制：父 Fiber 中断时自动中断子 Fiber
// 6. 资源安全：即使发生错误，所有 Fiber 也会被清理
// ============================================================
