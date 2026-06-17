import { Effect, Console, Fiber, pipe } from "effect";

// ============================================================
// 01-basic/fiber-concurrency.ts
// 基础：Fiber 并发模型与 Effect.all 并发执行
// ============================================================

// --- 第1步：模拟耗时任务 ---
const task = (id: number, duration: number) =>
  Effect.gen(function* (_) {
    yield* _(Console.log(`任务 ${id} 开始 (耗时 ${duration}ms)`));
    yield* _(Effect.sleep(`${duration} millis`));
    yield* _(Console.log(`任务 ${id} 完成`));
    return `结果-${id}`;
  });

// --- 第2步：顺序执行（基线） ---
const sequential = Effect.gen(function* (_) {
  const start = Date.now();
  const r1 = yield* _(task(1, 1000));
  const r2 = yield* _(task(2, 1000));
  const r3 = yield* _(task(3, 1000));
  const elapsed = Date.now() - start;
  yield* _(Console.log(`顺序执行耗时: ${elapsed}ms`));
  return [r1, r2, r3];
});

// --- 第3步：使用 Effect.all 并发执行 ---
const concurrent = Effect.gen(function* (_) {
  const start = Date.now();
  const results = yield* _(
    Effect.all([task(1, 1000), task(2, 1000), task(3, 1000)], {
      concurrency: "unbounded",
    })
  );
  const elapsed = Date.now() - start;
  yield* _(Console.log(`并发执行耗时: ${elapsed}ms`));
  return results;
});

// --- 第4步：使用 Fork/Join 手动管理 Fiber ---
const forkJoin = Effect.gen(function* (_) {
  const start = Date.now();

  // Fork 三个 Fiber
  const fiber1 = yield* _(Effect.fork(task(1, 1000)));
  const fiber2 = yield* _(Effect.fork(task(2, 1000)));
  const fiber3 = yield* _(Effect.fork(task(3, 1000)));

  // Join 等待所有 Fiber 完成
  const r1 = yield* _(Fiber.join(fiber1));
  const r2 = yield* _(Fiber.join(fiber2));
  const r3 = yield* _(Fiber.join(fiber3));

  const elapsed = Date.now() - start;
  yield* _(Console.log(`Fork/Join 耗时: ${elapsed}ms`));
  return [r1, r2, r3];
});

// --- 第5步：Fiber 状态检查 ---
const fiberStatus = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(task(1, 500)));

  // 检查 Fiber 状态
  const status = yield* _(Fiber.status(fiber));
  yield* _(Console.log(`Fiber 状态: ${status._tag}`));

  // 等待完成
  const result = yield* _(Fiber.join(fiber));
  yield* _(Console.log(`Fiber 结果: ${result}`));

  return result;
});

// --- 第6步：运行 ---
const main = concurrent.pipe(
  Effect.flatMap((results) => Console.log(`最终结果: ${JSON.stringify(results)}`))
);

Effect.runPromise(main).then(() => console.log("Fiber 并发演示完成"));

// ============================================================
// 关键概念：
// 1. Fiber：轻量级并发单元，类似线程但更轻量
// 2. Effect.fork：创建新的 Fiber
// 3. Fiber.join：等待 Fiber 完成并获取结果
// 4. Effect.all(..., { concurrency: "unbounded" })：并发执行多个 Effect
// 5. Fiber.status：检查 Fiber 当前状态
// 6. 并发 vs 顺序：3个1秒任务，顺序3秒，并发1秒
// ============================================================
