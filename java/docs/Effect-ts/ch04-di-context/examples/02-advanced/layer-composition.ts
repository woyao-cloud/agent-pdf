import { Context, Effect, Console, pipe } from "effect";

// ============================================================
// 02-advanced/layer-composition.ts
// 进阶：Layer 依赖树组装与 provide 机制
// ============================================================

// --- 第1步：定义多个服务接口 ---

// 配置服务
interface ConfigService {
  readonly get: (key: string) => Effect.Effect<string>;
}
const Config = Context.Tag<ConfigService>("@app/Config");

// 数据库服务
interface DatabaseService {
  readonly query: (sql: string) => Effect.Effect<readonly Record<string, unknown>[]>;
}
const Database = Context.Tag<DatabaseService>("@app/Database");

// 用户服务
interface UserService {
  readonly findUser: (id: string) => Effect.Effect<{ id: string; name: string }>;
}
const User = Context.Tag<UserService>("@app/User");

// --- 第2步：使用 Layer 声明依赖关系 ---

import { Layer } from "effect";

// ConfigLayer：无依赖
const ConfigLayer: Layer.Layer<ConfigService> = Layer.sync(Config, () => ({
  get: (key) => Effect.succeed(`value-for-${key}`),
}));

// DatabaseLayer：依赖 Config
const DatabaseLayer: Layer.Layer<DatabaseService, never, ConfigService> = Layer.effect(
  Database,
  Effect.gen(function* (_) {
    const config = yield* _(Config);
    const dbUrl = yield* _(config.get("DATABASE_URL"));
    console.log(`[DB] 连接到: ${dbUrl}`);
    return {
      query: (sql) => {
        console.log(`[DB] 执行查询: ${sql}`);
        return Effect.succeed([{ id: "1", name: "张三" }]);
      },
    };
  })
);

// UserLayer：依赖 Database
const UserLayer: Layer.Layer<UserService, never, DatabaseService> = Layer.effect(
  User,
  Effect.gen(function* (_) {
    const db = yield* _(Database);
    return {
      findUser: (id) =>
        Effect.gen(function* (__) {
          const rows = yield* _(db.query(`SELECT * FROM users WHERE id = ${id}`));
          return { id, name: rows[0]?.name as string ?? "未知" };
        }),
    };
  })
);

// --- 第3步：组合 Layer 形成依赖树 ---

// Layer.mergeAll 将多个 Layer 合并为一个
const MainLayer: Layer.Layer<UserService, never, never> = Layer.mergeAll(ConfigLayer)
  .pipe(Layer.provideMerge(DatabaseLayer))
  .pipe(Layer.provideMerge(UserLayer));

// 等价写法：使用 pipe 链式组合
const MainLayer2 = UserLayer.pipe(
  Layer.provide(DatabaseLayer),
  Layer.provide(ConfigLayer)
);

// --- 第4步：使用 Layer 运行 Effect ---

const program = Effect.gen(function* (_) {
  const userService = yield* _(User);
  const user = yield* _(userService.findUser("1"));
  yield* _(Console.log(`找到用户: ${JSON.stringify(user)}`));
});

// 方式 A：使用 Layer 构建运行环境
const runnable = Layer.build(MainLayer).pipe(
  Effect.flatMap(() => program)
);

// 方式 B：使用 provideLayer 直接提供
const runnable2 = program.pipe(
  Effect.provideLayer(MainLayer)
);

Effect.runPromise(runnable2).then(() => console.log("依赖树组装完成"));

// ============================================================
// 关键概念：
// 1. Layer.sync / Layer.effect 创建 Layer
// 2. Layer.provide 将下层依赖注入上层
// 3. Layer.mergeAll 合并多个同层级的 Layer
// 4. Layer.provideMerge 合并并注入
// 5. Effect.provideLayer 为 Effect 提供完整的依赖树
// 6. 编译时保证：如果缺少依赖，TypeScript 会报错
// ============================================================
