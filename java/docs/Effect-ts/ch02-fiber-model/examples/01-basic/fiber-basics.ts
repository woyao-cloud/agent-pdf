import { Effect, Fiber, Console, Duration } from "effect";

// ============================================================
// 01-basic: Fiber 基础 — 比 Promise 更强大的并发原语
// ============================================================

// --- 1. Fork: 创建 Fiber（类似启动一个后台任务）---
const mainTask = Effect.sleep("2 seconds").pipe(
  Effect.andThen(Console.log("[Fiber] 主任务完成"))
);

// fork 创建一个 Fiber，不会阻塞当前执行流
const forked: Effect.Effect<Fiber.Fiber<void, never>, never, never> =
  Effect.fork(mainTask);

// --- 2. Join: 等待 Fiber 完成（类似 await）---
const joinDemo = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    Effect.sleep("1 second").pipe(
      Effect.andThen(Effect.succeed("Fiber 结果"))
    )
  );
  const result = yield* Fiber.join(fiber);
  console.log("[Join] Fiber 返回:", result);
  return result;
});

// --- 3. Interrupt: 取消 Fiber（Promise 做不到的事）---
const interruptDemo = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    Effect.sleep("10 seconds").pipe(
      Effect.andThen(Console.log("[Interrupt] 这条消息不会出现"))
    )
  );

  // 1 秒后取消 Fiber
  yield* Effect.sleep("1 second");
  yield* Fiber.interrupt(fiber);
  console.log("[Interrupt] Fiber 已被取消");
});

// --- 4. Await: 等待 Fiber 结束并获取退出状态 ---
const awaitDemo = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    Effect.sleep("500 millis").pipe(
      Effect.andThen(Effect.succeed("成功"))
    )
  );
  const exit = yield* Fiber.await(fiber);
  console.log("[Await] Fiber 退出状态:", exit._tag);
});

// --- 5. 同时管理多个 Fiber ---
const multiFiberDemo = Effect.gen(function* () {
  const fiber1 = yield* Effect.fork(
    Effect.sleep("1 second").pipe(
      Effect.andThen(Console.log("[多 Fiber] 任务 1 完成"))
    )
  );
  const fiber2 = yield* Effect.fork(
    Effect.sleep("2 seconds").pipe(
      Effect.andThen(Console.log("[多 Fiber] 任务 2 完成"))
    )
  );
  const fiber3 = yield* Effect.fork(
    Effect.sleep("3 seconds").pipe(
      Effect.andThen(Console.log("[多 Fiber] 任务 3 完成"))
    )
  );

  // 等待所有 Fiber 完成
  yield* Fiber.join(fiber1);
  yield* Fiber.join(fiber2);
  yield* Fiber.join(fiber3);
  console.log("[多 Fiber] 所有任务完成");
});

// --- 6. 超时自动取消 ---
const timeoutDemo = Effect.gen(function* () {
  const result = yield* Effect.sleep("5 seconds").pipe(
    Effect.andThen(Effect.succeed("最终结果")),
    Effect.timeout("2 seconds"),
    Effect.catchAll((err) => {
      if (err._tag === "TimeoutException") {
        return Effect.succeed("超时兜底");
      }
      return Effect.fail(err);
    })
  );
  console.log("[超时] 结果:", result);
});

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== Fiber 基础演示 ===\n");

  console.log("--- Join 演示 ---");
  await Effect.runPromise(joinDemo);
  console.log("");

  console.log("--- Interrupt 演示 ---");
  await Effect.runPromise(interruptDemo);
  console.log("");

  console.log("--- Await 演示 ---");
  await Effect.runPromise(awaitDemo);
  console.log("");

  console.log("--- 多 Fiber 演示 ---");
  await Effect.runPromise(multiFiberDemo);
  console.log("");

  console.log("--- 超时演示 ---");
  await Effect.runPromise(timeoutDemo);
}

main();
