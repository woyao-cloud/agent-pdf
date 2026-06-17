import { Effect, Fiber, Console, Duration } from "effect";

// ============================================================
// 02-advanced: Effect.gen Generator 语法与结构化并发
// ============================================================

// --- 1. Effect.gen 基础 ---
// Generator 语法让 Effect 代码看起来像 async/await
const genBasic = Effect.gen(function* () {
  const a = yield* Effect.succeed(10);
  const b = yield* Effect.succeed(20);
  const sum = a + b;
  console.log(`[gen] 10 + 20 = ${sum}`);
  return sum;
});

// --- 2. 错误处理与 gen ---
class NotFoundError {
  readonly _tag = "NotFoundError";
  constructor(readonly id: string) {}
}

class PermissionError {
  readonly _tag = "PermissionError";
  constructor(readonly message: string) {}
}

const genWithError = Effect.gen(function* () {
  const user = yield* Effect.fail(new NotFoundError("user-42"));
  return user;
});

// 使用 catchTag 处理特定错误
const genErrorHandled = Effect.gen(function* () {
  const result = yield* genWithError.pipe(
    Effect.catchTag("NotFoundError", (err) =>
      Effect.succeed({ id: err.id, name: "默认用户" })
    )
  );
  console.log(`[gen 错误处理] 结果: ${result.name}`);
  return result;
});

// --- 3. 结构化并发: 父 Fiber 与子 Fiber ---
// 当父 Fiber 被取消时，所有子 Fiber 自动被取消
const structuredConcurrency = Effect.gen(function* () {
  console.log("[结构化并发] 父 Fiber 开始");

  // 启动子 Fiber
  const child1 = yield* Effect.fork(
    Effect.gen(function* () {
      console.log("[子 Fiber 1] 开始执行");
      yield* Effect.sleep("3 seconds");
      console.log("[子 Fiber 1] 完成");
      return 1;
    })
  );

  const child2 = yield* Effect.fork(
    Effect.gen(function* () {
      console.log("[子 Fiber 2] 开始执行");
      yield* Effect.sleep("1 second");
      console.log("[子 Fiber 2] 完成");
      return 2;
    })
  );

  // 等待所有子 Fiber
  const r1 = yield* Fiber.join(child1);
  const r2 = yield* Fiber.join(child2);
  console.log(`[结构化并发] 结果: ${r1}, ${r2}`);
  return [r1, r2];
});

// --- 4. 竞态条件: 谁先完成就用谁的结果 ---
const raceDemo = Effect.gen(function* () {
  console.log("[竞态] 开始竞态");

  const winner = yield* Effect.race(
    Effect.sleep("3 seconds").pipe(
      Effect.andThen(Effect.succeed("慢速任务"))
    ),
    Effect.sleep("1 second").pipe(
      Effect.andThen(Effect.succeed("快速任务"))
    )
  );

  console.log(`[竞态] 胜出者: ${winner}`);
  return winner;
});

// --- 5. 并行执行与结果收集 ---
const parallelDemo = Effect.gen(function* () {
  console.log("[并行] 开始并行执行");

  const results = yield* Effect.all(
    [
      Effect.sleep("2 seconds").pipe(Effect.andThen(Effect.succeed("A"))),
      Effect.sleep("1 second").pipe(Effect.andThen(Effect.succeed("B"))),
      Effect.sleep("3 seconds").pipe(Effect.andThen(Effect.succeed("C"))),
    ],
    { concurrency: "unbounded" }
  );

  console.log(`[并行] 结果: ${results}`);
  return results;
});

// --- 6. Scope: 限定 Fiber 的生命周期 ---
const scopeDemo = Effect.gen(function* () {
  // 使用 Scope 确保 Fiber 在超出作用域时被取消
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        Effect.gen(function* () {
          console.log("[Scope] 后台任务开始");
          yield* Effect.sleep("10 seconds");
          console.log("[Scope] 后台任务完成（这条不会输出）");
        })
      );
      yield* Effect.sleep("1 second");
      return "作用域内的结果";
    })
  );

  console.log(`[Scope] 结果: ${result}（后台任务已被自动取消）`);
  return result;
});

// --- 7. Supervisor: 监控所有 Fiber ---
const supervisorDemo = Effect.gen(function* () {
  console.log("[Supervisor] 开始监控");

  const supervised = yield* Effect.supervised(
    Effect.gen(function* () {
      const f1 = yield* Effect.fork(
        Effect.sleep("1 second").pipe(
          Effect.andThen(Console.log("[Supervisor] 子任务 1"))
        )
      );
      const f2 = yield* Effect.fork(
        Effect.sleep("2 seconds").pipe(
          Effect.andThen(Console.log("[Supervisor] 子任务 2"))
        )
      );
      yield* Fiber.join(f1);
      yield* Fiber.join(f2);
    })
  );

  return supervised;
});

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== Effect.gen 与结构化并发演示 ===\n");

  console.log("--- Effect.gen 基础 ---");
  await Effect.runPromise(genBasic);
  console.log("");

  console.log("--- 错误处理 ---");
  await Effect.runPromise(genErrorHandled);
  console.log("");

  console.log("--- 结构化并发 ---");
  await Effect.runPromise(structuredConcurrency);
  console.log("");

  console.log("--- 竞态条件 ---");
  await Effect.runPromise(raceDemo);
  console.log("");

  console.log("--- 并行执行 ---");
  await Effect.runPromise(parallelDemo);
  console.log("");

  console.log("--- Scope 生命周期管理 ---");
  await Effect.runPromise(scopeDemo);
  console.log("");

  console.log("--- Supervisor 监控 ---");
  await Effect.runPromise(supervisorDemo);
}

main();
