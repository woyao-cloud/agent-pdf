import { Context, Effect, Console, pipe } from "effect";

// ============================================================
// 01-basic/context-tag.ts
// 基础：Context 和 Tag 实现类型安全的依赖注入
// ============================================================

// --- 第1步：定义服务接口 ---
interface LoggerService {
  readonly info: (message: string) => Effect.Effect<void>;
  readonly error: (message: string) => Effect.Effect<void>;
}

// --- 第2步：使用 Tag 创建类型安全的标识符 ---
const Logger = Context.Tag<LoggerService>("@app/Logger");

// --- 第3步：实现服务 ---
const LoggerLive: LoggerService = {
  info: (message) =>
    Effect.sync(() => console.log(`[INFO] ${new Date().toISOString()} - ${message}`)),
  error: (message) =>
    Effect.sync(() => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`)),
};

// --- 第4步：将实现注入 Context ---
const context = Context.make(Logger, LoggerLive);

// --- 第5步：编写消费依赖的 Effect ---
const greet = (name: string) =>
  Effect.gen(function* (_) {
    const logger = yield* _(Logger);
    yield* _(logger.info(`开始处理用户: ${name}`));
    yield* _(Console.log(`你好, ${name}!`));
    yield* _(logger.info(`完成处理用户: ${name}`));
  });

// --- 第6步：提供依赖并运行 ---
const program = greet("张三");

// 方式 A：使用 provideContext 提供整个 Context
// 有些版本的 `effect` 库未导出 `Effect.provideContext`，在这种情况下
// 使用 `Effect.provideService` 为单个 Tag 提供实现（等效且更兼容）。
const runnableA = program.pipe(Effect.provideService(Logger, LoggerLive));

// 方式 B：使用 provideService 直接提供单个服务（更简洁）
const runnableB = program.pipe(Effect.provideService(Logger, LoggerLive));

// 运行
Effect.runPromise(runnableB).then(() => console.log("程序执行完毕"));

// ============================================================
// 关键概念：
// 1. Context.Tag<T>() 创建类型安全的标识符，编译时保证类型匹配
// 2. Context.make(tag, service) 将服务实例绑定到 Tag
// 3. Effect.provideService(tag, service) 提供单个依赖
// 4. Effect.provideContext(context) 提供整个依赖上下文
// 5. yield* _(Tag) 从上下文中获取服务实例
// ============================================================
