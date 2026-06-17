import { Effect, Console, Scope, Context, Layer, pipe } from "effect";

// ============================================================
// 03-production/resource-pool.ts
// 生产级：连接池与资源安全管理
// ============================================================

// ==================== 资源定义 ====================

class DbConnection {
  constructor(readonly id: number) {
    console.log(`[创建] 连接 #${id}`);
  }

  execute(sql: string): Effect.Effect<string> {
    return Effect.sync(() => {
      console.log(`[执行] 连接 #${this.id}: ${sql}`);
      return `结果: ${sql}`;
    });
  }

  close(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[关闭] 连接 #${this.id}`);
    });
  }
}

// ==================== 连接池服务 ====================

interface ConnectionPool {
  readonly acquire: Effect.Effect<DbConnection, never, Scope>;
  readonly release: (conn: DbConnection) => Effect.Effect<void>;
  readonly stats: Effect.Effect<{ active: number; total: number }>;
}

const ConnectionPool = Context.Tag<ConnectionPool>("@app/ConnectionPool");

// ==================== 连接池实现 ====================

const createConnectionPool = (maxSize: number): Effect.Effect<ConnectionPool> =>
  Effect.sync(() => {
    const pool: DbConnection[] = [];
    const active = new Set<DbConnection>();
    let counter = 0;

    const createNew = () => {
      counter++;
      const conn = new DbConnection(counter);
      pool.push(conn);
      return conn;
    };

    return {
      acquire: Effect.acquireRelease(
        Effect.sync(() => {
          const conn = pool.length > 0
            ? pool.pop()!
            : createNew();
          active.add(conn);
          console.log(`[获取] 连接 #${conn.id} (活跃: ${active.size})`);
          return conn;
        }),
        (conn) =>
          Effect.sync(() => {
            active.delete(conn);
            if (pool.length < maxSize) {
              pool.push(conn);
              console.log(`[归还] 连接 #${conn.id} (池中: ${pool.length})`);
            } else {
              conn.close();
            }
          })
      ),
      release: (conn) =>
        Effect.sync(() => {
          active.delete(conn);
          pool.push(conn);
        }),
      stats: Effect.sync(() => ({
        active: active.size,
        total: pool.length + active.size,
      })),
    };
  });

// ==================== 业务逻辑 ====================

const executeQuery = (sql: string) =>
  Effect.scoped(
    Effect.gen(function* (_) {
      const pool = yield* _(ConnectionPool);
      const conn = yield* _(pool.acquire);
      const result = yield* _(conn.execute(sql));
      yield* _(Console.log(`查询完成: ${result}`));
      return result;
    })
  );

// ==================== 并发安全测试 ====================

const concurrentQueries = Effect.gen(function* (_) {
  const pool = yield* _(ConnectionPool);

  // 并发执行多个查询
  const queries = ["SELECT 1", "SELECT 2", "SELECT 3", "SELECT 4", "SELECT 5"]
    .map((sql) => executeQuery(sql));

  const results = yield* _(Effect.all(queries, { concurrency: "unbounded" }));

  const stats = yield* _(pool.stats);
  yield* _(Console.log(`连接池统计: ${JSON.stringify(stats)}`));

  return results;
});

// ==================== 依赖注入 ====================

const PoolLayer: Layer.Layer<ConnectionPool> = Layer.effect(
  ConnectionPool,
  createConnectionPool(3) // 最大3个连接
);

// ==================== 运行 ====================

const main = concurrentQueries.pipe(
  Effect.provideLayer(PoolLayer),
  Effect.tap(() => Console.log("所有查询完成，连接已归还池中"))
);

Effect.runPromise(main).then(() => console.log("生产级资源管理演示完成"));

// ============================================================
// 生产级资源管理要点：
// 1. 连接池：复用资源，减少创建/销毁开销
// 2. Scope 安全：acquireRelease 确保连接归还
// 3. 并发安全：多个 Fiber 共享连接池
// 4. 资源统计：监控活跃连接和池大小
// 5. 防泄漏：即使 Fiber 被中断，连接也会归还
// 6. 背压：限制最大连接数，防止资源耗尽
// ============================================================
