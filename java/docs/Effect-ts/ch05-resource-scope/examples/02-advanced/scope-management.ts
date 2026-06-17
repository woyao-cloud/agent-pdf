import { Effect, Console, Scope, pipe } from "effect";

// ============================================================
// 02-advanced/scope-management.ts
// 进阶：Scope 生命周期管理
// ============================================================

// --- 第1步：模拟数据库连接 ---
class DatabaseConnection {
  constructor(readonly id: number) {
    console.log(`[ACQUIRE] 创建数据库连接 #${id}`);
  }

  query(sql: string): Effect.Effect<unknown[]> {
    return Effect.sync(() => {
      console.log(`[QUERY] 连接 #${this.id} 执行: ${sql}`);
      return [{ result: "data" }];
    });
  }

  close(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[RELEASE] 关闭数据库连接 #${this.id}`);
    });
  }
}

// --- 第2步：使用 Scope 管理资源生命周期 ---
let connectionCounter = 0;

const createConnection = (): Effect.Effect<DatabaseConnection, never, Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      connectionCounter++;
      return new DatabaseConnection(connectionCounter);
    }),
    (conn) => conn.close()
  );

// --- 第3步：在 Scope 内使用资源 ---
const useDatabase = (sql: string) =>
  Effect.scoped(
    Effect.gen(function* (_) {
      const conn = yield* _(createConnection());
      const result = yield* _(conn.query(sql));
      yield* _(Console.log(`查询结果: ${JSON.stringify(result)}`));
      return result;
    })
  );

// --- 第4步：Scope 的嵌套与组合 ---
const nestedScope = Effect.scoped(
  Effect.gen(function* (_) {
    // 外层 Scope
    const conn1 = yield* _(createConnection());
    yield* _(conn1.query("SELECT 1"));

    // 内层 Scope：内层资源先释放
    yield* _(
      Effect.scoped(
        Effect.gen(function* (__) {
          const conn2 = yield* _(createConnection());
          yield* _(conn2.query("SELECT 2"));
          return conn2;
        })
      )
    );

    // 此时内层连接已释放，但外层连接仍然可用
    yield* _(conn1.query("SELECT 3"));
    return conn1;
  })
);

// --- 第5步：Scope 的 extend 机制（延长生命周期） ---
const extendScope = Effect.gen(function* (_) {
  // 创建一个可扩展的 Scope
  const scope = yield* _(Scope.make());

  // 在 Scope 内获取资源
  const conn = yield* _(createConnection().pipe(
    Effect.provideService(Scope.Scope, scope)
  ));

  yield* _(conn.query("SELECT extend"));

  // 将 Scope 延长到外部 Scope
  yield* _(Scope.extend(scope));

  // 注意：此时资源不会立即释放，而是等待外部 Scope 关闭
  console.log("Scope 已延长，资源将在外部 Scope 关闭时释放");
});

// --- 第6步：运行 ---
const main = nestedScope.pipe(
  Effect.tap(() => Console.log("所有资源已释放"))
);

Effect.runPromise(main).then(() => console.log("Scope 管理演示完成"));

// ============================================================
// 关键概念：
// 1. Effect.acquireRelease(acquire, release) 创建 Scope 管理的资源
// 2. Effect.scoped(effect) 创建 Scope 边界
// 3. Scope 嵌套：内层 Scope 先释放，外层 Scope 后释放
// 4. Scope.extend：将资源生命周期延长到外部 Scope
// 5. 资源释放顺序：后获取的资源先释放（栈顺序）
// ============================================================
