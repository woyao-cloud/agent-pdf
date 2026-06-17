import { Context, Effect, Console, Layer, pipe } from "effect";

// ============================================================
// 03-production/di-architecture.ts
// 生产级：完整的 DI 架构设计
// ============================================================

// ==================== 领域层 ====================

// 仓储接口
interface UserRepository {
  readonly findById: (id: string) => Effect.Effect<User | null>;
  readonly save: (user: User) => Effect.Effect<void>;
}
const UserRepository = Context.Tag<UserRepository>("@app/UserRepository");

interface EmailService {
  readonly send: (to: string, subject: string, body: string) => Effect.Effect<void>;
}
const EmailService = Context.Tag<EmailService>("@app/EmailService");

interface LoggingService {
  readonly info: (msg: string) => Effect.Effect<void>;
  readonly warn: (msg: string) => Effect.Effect<void>;
  readonly error: (msg: string) => Effect.Effect<void>;
}
const LoggingService = Context.Tag<LoggingService>("@app/LoggingService");

// 领域模型
interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly isActive: boolean;
}

// ==================== 基础设施层 ====================

// 日志实现
const LoggingLayer: Layer.Layer<LoggingService> = Layer.sync(LoggingService, () => ({
  info: (msg) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
  warn: (msg) => Effect.sync(() => console.warn(`[WARN] ${msg}`)),
  error: (msg) => Effect.sync(() => console.error(`[ERROR] ${msg}`)),
}));

// 用户仓储实现（依赖日志）
const UserRepositoryLayer: Layer.Layer<UserRepository, never, LoggingService> = Layer.effect(
  UserRepository,
  Effect.gen(function* (_) {
    const log = yield* _(LoggingService);
    const users = new Map<string, User>();

    return {
      findById: (id) =>
        Effect.gen(function* (__) {
          yield* _(log.info(`查询用户: ${id}`));
          const user = users.get(id) ?? null;
          if (user) {
            yield* _(log.info(`找到用户: ${user.name}`));
          } else {
            yield* _(log.warn(`用户未找到: ${id}`));
          }
          return user;
        }),
      save: (user) =>
        Effect.gen(function* (__) {
          users.set(user.id, user);
          yield* _(log.info(`保存用户: ${user.id}`));
        }),
    };
  })
);

// 邮件服务实现（依赖日志）
const EmailLayer: Layer.Layer<EmailService, never, LoggingService> = Layer.effect(
  EmailService,
  Effect.gen(function* (_) {
    const log = yield* _(LoggingService);
    return {
      send: (to, subject, body) =>
        Effect.gen(function* (__) {
          yield* _(log.info(`发送邮件到 ${to}: ${subject}`));
          // 模拟邮件发送
          yield* _(Effect.sleep("100 millis"));
          yield* _(log.info(`邮件发送成功: ${to}`));
        }),
    };
  })
);

// ==================== 应用层 ====================

// 应用服务
const registerUser = (user: User) =>
  Effect.gen(function* (_) {
    const repo = yield* _(UserRepository);
    const email = yield* _(EmailService);
    const log = yield* _(LoggingService);

    yield* _(log.info(`开始注册用户: ${user.name}`));

    // 保存用户
    yield* _(repo.save(user));

    // 发送欢迎邮件
    yield* _(email.send(
      user.email,
      "欢迎注册",
      `你好 ${user.name}，欢迎加入！`
    ));

    yield* _(log.info(`用户注册完成: ${user.id}`));
    return user;
  });

// ==================== 依赖组装 ====================

// 方式1：手动组装（适合测试）
const TestLayer = Layer.mergeAll(LoggingLayer)
  .pipe(Layer.provideMerge(UserRepositoryLayer))
  .pipe(Layer.provideMerge(EmailLayer));

// 方式2：使用 Layer 的自动组合
const AppLayer = Layer.mergeAll(
  LoggingLayer,
  UserRepositoryLayer,
  EmailLayer
);

// ==================== 运行 ====================

const program = registerUser({
  id: "user-001",
  name: "李四",
  email: "lisi@example.com",
  isActive: true,
});

const main = program.pipe(
  Effect.provideLayer(AppLayer),
  Effect.catchAll((error) =>
    Console.error(`程序执行失败: ${error}`)
  )
);

Effect.runPromise(main).then(() => console.log("生产级 DI 架构演示完成"));

// ============================================================
// 生产级 DI 架构要点：
// 1. 分层设计：领域层、基础设施层、应用层
// 2. 依赖倒置：高层模块不依赖低层实现
// 3. 可测试性：每个 Layer 可独立 Mock
// 4. 编译时安全：缺少依赖时 TypeScript 报错
// 5. 运行时安全：Layer 构建失败时 Effect 捕获错误
// 6. 可组合性：Layer 可以灵活组合和替换
// ============================================================
