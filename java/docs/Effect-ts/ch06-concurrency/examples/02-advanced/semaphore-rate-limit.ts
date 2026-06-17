import { Effect, Console, Fiber, Semaphore, pipe } from "effect";

// ============================================================
// 02-advanced/semaphore-rate-limit.ts
// 进阶：Semaphore 限流与并发控制
// ============================================================

// --- 第1步：模拟 API 调用 ---
const apiCall = (userId: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`[开始] 处理用户 #${userId}`));
    yield* _(Effect.sleep("200 millis")); // 模拟 API 延迟
    yield* _(Console.log(`[完成] 用户 #${userId}`));
    return `用户-${userId}-数据`;
  });

// --- 第2步：使用 Semaphore 限制并发数 ---
const rateLimitedApi = (sem: Semaphore.Semaphore, userId: number) =>
  sem.withPermit(apiCall(userId));

// --- 第3步：批量处理（无限制） ---
const batchUnlimited = Effect.gen(function* (_) {
  const start = Date.now();
  const users = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const results = yield* _(
    Effect.all(users.map((id) => apiCall(id)), {
      concurrency: "unbounded",
    })
  );

  const elapsed = Date.now() - start;
  yield* _(Console.log(`无限制并发耗时: ${elapsed}ms`));
  return results;
});

// --- 第4步：批量处理（Semaphore 限制并发数为3） ---
const batchLimited = Effect.gen(function* (_) {
  const start = Date.now();
  const sem = yield* _(Semaphore.make(3)); // 最多3个并发
  const users = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const results = yield* _(
    Effect.all(users.map((id) => rateLimitedApi(sem, id)), {
      concurrency: "unbounded",
    })
  );

  const elapsed = Date.now() - start;
  yield* _(Console.log(`Semaphore 限流并发耗时: ${elapsed}ms`));
  return results;
});

// --- 第5步：超时与取消 ---
const withTimeout = Effect.gen(function* (_) {
  const sem = yield* _(Semaphore.make(1));

  // 获取许可但不释放（模拟死锁）
  const lock = sem.withPermit(
    Effect.gen(function* (__) {
      yield* _(Console.log("获取锁，开始长时间操作..."));
      yield* _(Effect.sleep("10 seconds"));
      yield* _(Console.log("操作完成"));
    })
  );

  // 5秒后超时取消
  const result = yield* _(lock.pipe(
    Effect.timeout("5 seconds"),
    Effect.catchAll((error) =>
      Console.log(`超时取消: ${error}`)
    )
  ));

  return result;
});

// --- 第6步：运行 ---
const main = batchLimited.pipe(
  Effect.flatMap((results) =>
    Console.log(`批量处理完成: ${results.length} 个用户`)
  )
);

Effect.runPromise(main).then(() => console.log("Semaphore 限流演示完成"));

// ============================================================
// 关键概念：
// 1. Semaphore.make(n)：创建有 n 个许可的信号量
// 2. sem.withPermit(effect)：获取许可后执行 Effect
// 3. 限流效果：10个任务，并发3个，约 4 批完成
// 4. 超时控制：Effect.timeout 与 Semaphore 结合
// 5. 公平性：Semaphore 保证先到先得
// 6. 无限制 vs 限流：无限制快但可能压垮系统
// ============================================================
