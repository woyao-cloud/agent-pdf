import { Effect, Console } from "effect";

// ============================================================
// 02-advanced: Effect 核心哲学 — 惰性求值与描述式编程
// ============================================================

// --- Effect<A, E, R> 三维模型 ---
// A: 成功值类型 (Success)
// E: 错误类型 (Error)
// R: 环境依赖类型 (Requirements)

// 示例1: 纯成功值
const success: Effect.Effect<number, never, never> = Effect.succeed(42);

// 示例2: 可能失败
const maybeFail: Effect.Effect<string, Error, never> = Effect.fail(
  new Error("出错了")
);

// 示例3: 需要环境依赖
interface Database {
  readonly query: (sql: string) => Effect.Effect<unknown[], Error, never>;
}
const needsDb: Effect.Effect<unknown[], Error, Database> = Effect.flatMap(
  Effect.service(Database),
  (db) => db.query("SELECT * FROM users")
);

// --- 描述式编程: 构建执行计划而非立即执行 ---
// 就像蓝图和实际建筑的区别

// 第一步: 定义操作（蓝图）
const readConfig = Effect.sync(() => {
  return { host: "localhost", port: 3000 };
});

const validateConfig = (config: { host: string; port: number }) => {
  if (config.port < 0 || config.port > 65535) {
    return Effect.fail(new Error("无效端口"));
  }
  return Effect.succeed(config);
};

const startServer = (config: { host: string; port: number }) => {
  return Effect.sync(() => {
    console.log(`服务器启动在 ${config.host}:${config.port}`);
    return { status: "running", config };
  });
};

// 组合成完整的执行计划（仍然是惰性的）
const serverPlan = readConfig.pipe(
  Effect.flatMap(validateConfig),
  Effect.flatMap(startServer)
);

// 此时还没有任何实际执行发生！
console.log("[描述式编程] 执行计划已构建，但尚未执行");

// --- 操作符组合: 构建复杂流程 ---

// map: 转换成功值
const mapped = Effect.succeed(10).pipe(Effect.map((n) => n * 2));
// => Effect<number, never, never> 值为 20

// flatMap: 链式组合
const chained = Effect.succeed("hello").pipe(
  Effect.flatMap((s) => Effect.succeed(s.toUpperCase()))
);

// catchAll: 错误恢复
const recovered = Effect.fail(new Error("失败")).pipe(
  Effect.catchAll((err) => Effect.succeed(`恢复: ${err.message}`))
);

// zip: 并行组合
const parallel = Effect.all([Effect.succeed(1), Effect.succeed(2)]);

// --- 惰性求值的实际意义 ---

// 场景: 条件执行
const expensiveOp = Effect.sync(() => {
  console.log("[惰性求值] 这个昂贵的操作");
  return 42;
});

// 只有条件满足时才会执行
const conditional = Effect.flatMap(Effect.succeed(false), (flag) => {
  if (flag) {
    return expensiveOp;
  }
  return Effect.succeed(0);
});

// --- 可测试性: 依赖注入 ---
interface Logger {
  readonly log: (msg: string) => Effect.Effect<void, never, never>;
}

const Logger = Effect.service(Logger);

const businessLogic: Effect.Effect<string, never, Logger> = Effect.flatMap(
  Logger,
  (logger) =>
    Effect.flatMap(logger.log("开始处理"), () => Effect.succeed("处理完成"))
);

// 测试时可以注入 Mock Logger
const testLogger: Logger = {
  log: (msg) => Effect.sync(() => console.log(`[Mock] ${msg}`)),
};

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log("=== Effect 核心哲学演示 ===\n");

  // 执行服务器启动计划
  const serverResult = await Effect.runPromise(serverPlan);
  console.log("服务器结果:", serverResult);
  console.log("");

  // 演示惰性求值
  console.log("条件执行演示（条件为 false，不会执行昂贵操作）:");
  const condResult = await Effect.runPromise(conditional);
  console.log("条件结果:", condResult);
  console.log("");

  // 演示依赖注入
  console.log("依赖注入演示:");
  const bizResult = await Effect.runPromise(
    Effect.provideService(businessLogic, Logger, testLogger)
  );
  console.log("业务结果:", bizResult);
}

main();
