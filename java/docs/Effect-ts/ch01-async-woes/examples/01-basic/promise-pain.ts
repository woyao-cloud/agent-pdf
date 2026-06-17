import { Effect } from "effect";

// ============================================================
// 01-basic: Promise 四大痛点演示
// ============================================================

// --- 痛点1: 错误类型丢失 ---
// Promise 的 catch 只能拿到 unknown，无法精确处理不同错误
function promiseErrorLost(): Promise<string> {
  return Promise.resolve()
    .then(() => {
      throw new Error("网络错误");
    })
    .catch((err: unknown) => {
      // err 是 unknown 类型，无法区分是网络错误还是业务错误
      console.log("[Promise] 错误类型丢失: 只能拿到 unknown", err);
      return "兜底值";
    });
}

// Effect 方案: 错误类型保留在类型系统中
class NetworkError {
  readonly _tag = "NetworkError";
  constructor(readonly message: string) {}
}

class BusinessError {
  readonly _tag = "BusinessError";
  constructor(readonly code: number, readonly message: string) {}
}

function effectPreserveError(): Effect.Effect<string, NetworkError | BusinessError> {
  return Effect.fail(new NetworkError("网络连接失败"));
}

// --- 痛点2: 无法取消 ---
// Promise 一旦创建就无法取消
function promiseCannotCancel(): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("完成"), 5000);
    // 即使外部已经不需要结果了，这个 Promise 仍然会执行到结束
    console.log("[Promise] 无法取消: 即使不需要结果了，仍然会执行 5 秒");
  });
}

// Effect 方案: 通过 Fiber 可以随时中断
function effectCanCancel(): Effect.Effect<string, never, never> {
  return Effect.sleep("5 seconds").pipe(
    Effect.andThen(Effect.succeed("完成"))
  );
}

// --- 痛点3: 缺乏结构化并发 ---
// Promise.all 中任何一个失败，其他 Promise 不会被取消
function promiseNoStructuredConcurrency(): Promise<void> {
  return Promise.all([
    fetch("/api/slow").then((r) => r.json()),
    fetch("/api/fast").then((r) => r.json()),
    Promise.reject(new Error("快速失败")),
  ]).catch(() => {
    // 虽然第三个 Promise 失败了，但前两个仍然在后台运行
    console.log("[Promise] 缺乏结构化并发: 失败后其他任务仍在运行");
  });
}

// Effect 方案: 结构化并发自动取消兄弟 Fiber
function effectStructuredConcurrency(): Effect.Effect<void, never, never> {
  return Effect.all([
    Effect.sleep("5 seconds"),
    Effect.sleep("1 second"),
    Effect.fail(new Error("快速失败")),
  ]).pipe(
    Effect.catchAll(() => Effect.void)
  );
}

// --- 痛点4: 隐式副作用 ---
// Promise 在创建时就立即执行，副作用不可控
const promiseWithSideEffect = new Promise<string>((resolve) => {
  console.log("[Promise] 隐式副作用: 创建时就立即执行了！");
  resolve("数据");
});
// 即使还没有 await，上面的 console.log 已经输出了

// Effect 方案: 惰性求值，只有调用 run 时才执行
const effectLazy = Effect.sync(() => {
  console.log("[Effect] 惰性求值: 只有 run 时才会执行");
  return "数据";
});

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== Promise 四大痛点演示 ===\n");

  await promiseErrorLost();
  console.log("");

  // Effect 的错误类型保留
  const result = Effect.catchAll(effectPreserveError(), (err) => {
    if (err._tag === "NetworkError") {
      return Effect.succeed(`处理网络错误: ${err.message}`);
    }
    return Effect.succeed(`处理业务错误: ${err.message}`);
  });
  console.log("[Effect] 错误类型保留:", await Effect.runPromise(result));
  console.log("");

  // Effect 的惰性求值
  console.log("[Effect] 惰性求值演示: 下面这条消息只会在 runPromise 时出现");
  await Effect.runPromise(effectLazy);
}

main();
