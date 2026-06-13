# 第 2 章 执行引擎与 Fiber 模型

## 2.1 引言

第 1 章介绍了 Effect 的 `Effect<A, E, R>` 三维模型和惰性求值理念。然而，Effect 的威力远不止于类型安全 — 当我们将视角从"写什么"转向"怎么执行"时，才会真正理解 Effect-TS 架构设计的精妙之处。

在 JavaScript 的世界里，并发通常意味着"多个异步操作在事件循环中交错执行"。这种模型的问题在于：你无法精确控制执行流程，无法优雅地中断正在进行的任务，也无法在用户态创建轻量级的并发单元。线程有状态但太重，Promise 轻量但无状态。

Effect-TS 的设计者从 Erlang/OTP 的 Actor 模型和 Java Virtual Threads 中获得启发，在 JavaScript 运行时之上构建了一套完整的**协程**（Coroutine）系统 — Fiber。本章将从 Runtime 执行器、Fiber 生命周期、中断机制、Scope 资源管理等几个维度，深入剖析 Effect-TS 的执行引擎。

## 2.2 实现原理

### 2.2.1 Runtime 执行器

Runtime 是 Effect 执行引擎的核心入口。它的职责是将惰性的 Effect 描述"编译"为实际的运行时操作。Effect-TS 提供了三种执行模式，分别对应不同的场景。

```typescript
import { Effect, Runtime } from "effect";

const effect: Effect.Effect<string, never, never> = Effect.succeed("Hello");

// 1. runSync — 同步执行，仅适用于 never 错误的 Effect
const result1: string = Effect.runSync(effect);

// 2. runPromise — 异步执行，返回 Promise
const result2: Promise<string> = Effect.runPromise(effect);

// 3. runFork — 在后台 Fork 一个 Fiber，返回 Fiber 句柄
const fiber = Effect.runFork(effect);
```

三种模式的选择依据：

| 方法 | 适用场景 | 返回值 | 阻塞 |
|---|---|---|---|
| `runSync` | 纯计算、同步 Effect | 直接返回值 | 同步阻塞 |
| `runPromise` | 需要与 Promise 生态桥接 | `Promise<A>` | 异步等待 |
| `runFork` | 构建后台任务、长期运行的服务 | `Fiber<A, E>` | 不阻塞，立即返回 |

```typescript
// runSync 的局限性 — 不能用于异步 Effect
const asyncEffect = Effect.sleep("1 second").pipe(
  Effect.andThen(Effect.succeed("done"))
);

// 这会抛出异常：Effect.runSync 不能处理异步操作
// Effect.runSync(asyncEffect); // Error: 不能同步执行异步 Effect

// 正确做法
Effect.runPromise(asyncEffect).then(console.log); // 1 秒后输出 "done"
```

在更精细的控制场景中，可以手动创建 Runtime 实例：

```typescript
import { Runtime, ManagedRuntime, Layer } from "effect";

// 创建一个带有自定义服务的 Runtime
const MyRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    DatabaseLive,
    HttpClientLive,
    LoggerLive
  )
);

// 使用自定义 Runtime 执行 Effect
const result = await MyRuntime.runPromise(myEffect);
// 这样 myEffect 需要的 Database、HttpClient、Logger 依赖
// 会自动从 Runtime 中注入，无需在每次调用时手动 provide
```

### 2.2.2 Fiber — 轻量级用户态协程

Fiber 是 Effect-TS 中最核心的并发原语。理解 Fiber，才能理解 Effect 的并发能力。

**什么是 Fiber？**

Fiber 是一种轻量级的、用户态管理的协程。它与操作系统线程的关系是 M:N 映射 — 成千上万个 Fiber 可以共享一个 JavaScript 主线程，没有线程切换的内核态开销。

```typescript
import { Effect, Fiber } from "effect";

// 使用 Effect.fork 创建一个 Fiber
const task = Effect.gen(function* (_) {
  yield* _(Effect.sleep("2 seconds"));
  return "任务完成";
});

// fork 在当前作用域中派生一个 Fiber
// ForkedFiber 可以独立于父 Fiber 存在
const fiber: Fiber.Fiber<string, never> = yield* _(Effect.fork(task));

// Fiber 的三个核心操作：
// 1. join — 等待 Fiber 完成，获取结果
const result: string = yield* _(Fiber.join(fiber));

// 2. interrupt — 中断 Fiber
const interrupted: Fiber.Fiber<string, never> = yield* _(
  Fiber.interrupt(fiber)
);

// 3. observe — 监听 Fiber 的完成状态
const exit: Fiber.Fiber.Exit<string, never> = yield* _(
  Fiber.observe(fiber)
);
// exit 是一个 Exit 类型，可以是 Success 或 Failure
```

**Fiber 与 JavaScript 事件循环的关系：**

Fiber 并不创造新的操作系统线程。所有 Fiber 都运行在同一个 JavaScript 主线程上，通过主动让出（yield）来实现协作式调度。这意味着：

- Fiber 之间的切换没有线程上下文切换的开销。
- Fiber 不受操作系统调度器控制，完全由 Effect-TS 运行时管理。
- 在一个 Fiber 中执行的 CPU 密集型计算会阻塞所有其他 Fiber，因为没有真正的并行。

```typescript
// Fiber 是协作式调度 — 不会抢占
const cpuIntensive = Effect.gen(function* (_) {
  for (let i = 0; i < 1e9; i++) {
    if (i % 1e6 === 0) {
      // Effect.yieldNow 主动让出控制权
      yield* _(Effect.yieldNow());
    }
  }
  return "done";
});

const cooperative = Effect.gen(function* (_) {
  // fork 两个 CPU 密集型任务
  const f1 = yield* _(Effect.fork(cpuIntensive));
  const f2 = yield* _(Effect.fork(cpuIntensive));
  // 如果没有 yieldNow，这两个任务会串行执行
  // 有了 yieldNow，它们会交替执行
  const [r1, r2] = yield* _(Fiber.join(f1), Fiber.join(f2));
  return [r1, r2];
});
```

**Fiber 的生命周期：**

```
Created → Forked (运行中) → Completed (正常结束)
                                    → Failed (抛出错误)
                                    → Interrupted (被取消)
```

```typescript
import { Effect, Fiber, FiberStatus } from "effect";

// 观察 Fiber 的实时状态
const monitorFiber = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(someLongTask));
  
  // 获取 Fiber 的当前状态
  const status: FiberStatus.FiberStatus = yield* _(Fiber.status(fiber));
  
  switch (status._tag) {
    case "Done":
      console.log("Fiber 已经完成");
      break;
    case "Running":
      console.log("Fiber 正在运行");
      break;
    case "Suspended":
      console.log("Fiber 被暂停（等待某个 Effect 完成）");
      break;
  }
  
  return yield* _(Fiber.join(fiber));
});
```

### 2.2.3 中断机制与资源自动回收

Effect-TS 的中断机制是其区别于 Promise 的关键特性之一。中断不仅仅是"忽略结果"，而是可以精确地终止进行中的操作并释放资源。

```typescript
import { Effect, Fiber, Exit } from "effect";

// 中断链 — 一个 Fiber 的中断可以传播到它的子 Fiber
const parentTask = Effect.gen(function* (_) {
  const childFiber = yield* _(Effect.fork(childTask));
  
  // 30 秒超时
  yield* _(Effect.sleep("30 seconds"));
  
  // 如果 30 秒后还没完成，中断子 Fiber
  yield* _(Fiber.interrupt(childFiber));
  return yield* _(Fiber.join(childFiber));
});

// Finalizers — 资源释放的保障
// Finalizer 在 Effect 成功、失败或被中断时都会执行
const withResource = Effect.acquireRelease(
  // acquire — 获取资源
  Effect.sync(() => {
    console.log("打开文件");
    return fileHandle;
  }),
  // release — 释放资源（无论成功/失败/中断都会调用）
  (handle) =>
    Effect.sync(() => {
      console.log("关闭文件");
      handle.close();
    })
);

// 使用 withResource 的 Effect
const program = Effect.gen(function* (_) {
  const file = yield* _(withResource);
  return yield* _(readFile(file));
});

// 即使 program 被中断，文件也会被正确关闭
```

**Finalizer 的保证：**

```typescript
import { Effect, Fiber } from "effect";

Effect.gen(function* (_) {
  // Finalizer 在以下三种情况都会执行：
  
  // 1. 正常完成
  yield* _(Effect.addFinalizer(() =>
    Effect.sync(() => console.log("释放资源"))
  ));
  
  // 2. 抛出错误
  if (somethingWrong) {
    yield* _(Effect.fail(new Error()));
    // Finalizer 仍然执行
  }
  
  // 3. 被中断（发，即使外部调用了 Fiber.interrupt）
  // Finalizer 保证执行
  
  return "done";
});
```

这种"无论成功失败中断都要清理"的语义，与 Go 的 `defer`、Java 的 `try-with-resources`、Python 的 `with` 语句一脉相承，但在异步场景中，Effect-TS 的 Finalizer 比这些同步原语要强大得多 — 它能够处理分布在多个 Fiber 中的资源。

### 2.2.4 Scope — Fiber 生命周期的容器

Scope 是 Effect-TS 中管理 Fiber 和资源生命周期的核心机制。可以把它理解为一个"作用域"：当 Scope 关闭时，作用域内所有的 Fiber 和资源都会被自动清理。

```typescript
import { Effect, Scope, Fiber } from "effect";

// 在 Scope 内自动管理 Fiber 生命周期
const program = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(someTask));
  // 在 Scope 内自动管理 Fiber 生命周期
  const result = yield* _(Fiber.join(fiber));
  return result;
});

// 使用 Scope 显式控制生命周期
const scopedProgram = Effect.scoped(
  Effect.gen(function* (_) {
    // 在这个 Scope 中创建的所有 Fiber
    // 在 Scope 关闭时都会自动被中断
    const fiber = yield* _(Effect.fork(someTask));
    const fiber2 = yield* _(Effect.fork(anotherTask));
    
    // 使用结果
    return yield* _(Fiber.join(fiber));
  })
  // 当这个 Effect 完成（成功、失败或被外部中断）时，
  // Scope 关闭，fiber2 被自动中断
);
```

## 2.3 潜在风险

### 2.3.1 Fiber 泄漏（fork 后未管理）

Fiber 泄漏是 Effect-TS 使用中最常见的问题之一。与操作系统线程一样，Fiber 在被创建后如果没有被正确管理（join 或 interrupt），就会变成"孤儿 Fiber"。

```typescript
import { Effect, Fiber } from "effect";

// 危险：Fork 后忘记管理
const leakyProgram = Effect.gen(function* (_) {
  // fork 了一个长时间运行的任务
  yield* _(Effect.fork(longRunningTask));
  // 注意：这里 fork 后既没有 join 也没有 interrupt
  // fiber 句柄被丢弃了！
  
  // 即使主程序完成，这个 Fiber 仍然在后台运行
  return "主任务完成";
});

// 更隐蔽的泄漏：在循环中 fork
const loopLeak = Effect.gen(function* (_) {
  for (const item of items) {
    // 每次循环都 fork 一个新 Fiber
    yield* _(Effect.fork(processItem(item)));
    // 但没有保存 Fiber 句柄，也就无法管理这些 Fiber
  }
  // 循环结束后，N 个 Fiber 在后台泄漏
});
```

**Fiber 泄漏的后果：**

- **内存泄漏**：Fiber 的闭包环境不能被垃圾回收。
- **资源占用**：每个 Fiber 持有内部状态和调度数据。
- **副作用泄漏**：泄漏的 Fiber 可能继续执行本应被取消的操作（如写数据库、发送请求）。

**正确管理 Fiber 的策略：**

```typescript
// 策略一：收集所有 Fiber 句柄并分批管理
const managedFiber = Effect.gen(function* (_) {
  const fibers: Fiber.Fiber<void, never>[] = [];
  
  for (const item of items) {
    const fiber = yield* _(Effect.fork(processItem(item)));
    fibers.push(fiber);
  }
  
  // 等待所有 Fiber 完成
  yield* _(Fiber.all(fibers));
});

// 策略二：使用 forEach 替代手动 fork
const safeParallel = Effect.forEach(items, processItem, {
  concurrency: "unbounded",
});
// Effect.forEach 自动管理所有 Fiber 的生命周期

// 策略三：使用 Scope 确保 Fiber 被清理
const scopeManaged = Effect.scoped(
  Effect.gen(function* (_) {
    const fiber = yield* _(Effect.fork(longRunningTask));
    // 当 Scope 关闭时，fiber 会被自动中断
    return yield* _(Fiber.join(fiber));
  })
);
```

### 2.3.2 Runtime 不匹配导致 Effect 无法执行

每个 Effect 都声明了它的需求（R 类型参数），如果尝试在未提供这些需求的 Runtime 中执行，程序将从类型系统层面报错。

```typescript
import { Effect, Context } from "effect";

// 定义服务标识
class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<any, Error> }
>() {}

// 这个 Effect 需要 Database 服务
const queryUser = Effect.gen(function* (_) {
  const db = yield* _(Database);
  return yield* _(db.query("SELECT * FROM users"));
});

// 错误：编译失败
// Effect.runSync(queryUser);
// TypeError: 无法执行 Effect，因为需求 Database 未满足

// 正确：提供依赖后再执行
const provided = Effect.provideService(
  queryUser,
  Database,
  Database.of({
    query: (sql) => Effect.succeed([]),
  })
);

Effect.runSync(provided); // 正常运行
```

但即使类型通过编译，仍有运行时故障的风险：

```typescript
// Service Layer 配置不当导致的运行时问题
const MisconfiguredRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    // 实际上这里应该提供 Database 服务
    // 如果只提供了 Logger，但 Effect 需要 Database
    // 会在运行时抛出 MissingServiceError
    LoggerLive
  )
);

// 编译期通过（因为 R 类型被擦除了）
// 但运行时会失败
const result = await MisconfiguredRuntime.runPromise(queryUser);
// 抛出：Error: Service not found: Database
```

### 2.3.3 并发边界与协作式调度的注意点

由于 Fiber 是协作式调度而非抢占式，长时间运行的 CPU 密集型操作会阻塞所有其他 Fiber：

```typescript
// 阻塞问题：没有主动让出控制权
const blockingTask = Effect.gen(function* (_) {
  // 大数组排序 — CPU 密集型操作
  const sorted = largeArray.sort((a, b) => expensiveCompare(a, b));
  // 在执行排序期间，所有其他 Fiber 都被阻塞
  // 事件循环无法处理其他任务
  return sorted;
});

// 解决方案：将 CPU 密集型操作分解或使用 yieldNow
const cooperativeTask = Effect.gen(function* (_) {
  let result = [];
  for (let i = 0; i < largeArray.length; i++) {
    // 每次处理一个元素后主动让出
    result.push(processElement(largeArray[i]));
    if (i % 100 === 0) {
      yield* _(Effect.yieldNow()); // 让出控制权
    }
  }
  return result;
});
```

## 2.4 优化策略

### 2.4.1 Fiber 池与限并发

对于需要限制并发数量的场景，Fiber 池是一种常用的模式：

```typescript
import { Effect, Queue, Fiber } from "effect";

// 创建一个有界队列作为 Fiber 池
const createFiberPool = (size: number) =>
  Effect.gen(function* (_) {
    const queue = yield* _(Queue.bounded<Effect.Effect<any, any>>(size));
    
    // 启动 size 个工作 Fiber
    const workers = Array.from({ length: size }, () =>
      Effect.fork(
        Queue.take(queue).pipe(
          Effect.flatMap((task) => task),
          Effect.forever // 每个 worker 无限循环取任务执行
        )
      )
    );
    
    return { queue, workers };
  });

// 使用 Fiber 池
const program = Effect.gen(function* (_) {
  const pool = yield* _(createFiberPool(4)); // 最多 4 个并发
  
  for (const task of manyTasks) {
    yield* _(Queue.offer(pool.queue, task));
    // 如果队列已满，offer 会自动等待
  }
  
  return "所有任务已提交";
});
```

### 2.4.2 结构化并发

结构化并发是一种编程范式，确保并发任务的生命周期被限定在明确的词法作用域内。Effect-TS 通过 `Scope` 和 `Effect.scoped` 天然支持结构化并发。

```typescript
import { Effect, Scope } from "effect";

// 非结构化并发 — Fiber 可能被遗忘
const unstructured = Effect.gen(function* (_) {
  yield* _(Effect.fork(taskA));
  yield* _(Effect.fork(taskB));
  // 如果这里抛出异常，taskB 的 Fiber 泄漏
});

// 结构化并发 — Fiber 生命周期被作用域管理
const structured = Effect.scoped(
  Effect.gen(function* (_) {
    // 在这个作用域内创建的 Fiber
    // 作用域结束时自动清理
    yield* _(Effect.fork(taskA));
    yield* _(Effect.fork(taskB));
    // 即使这里抛出异常，所有 Fiber 也被正确清理
    return yield* _(Effect.fail("出错"));
  })
);
```

结构化并发的核心原则：

1. **Fiber 的生命周期不能超过创建它的作用域。**
2. **父 Fiber 在子 Fiber 完成之前不会完成。**
3. **任何异常都会传播到整个作用域树。**
4. **资源清理是确定性的。**

```typescript
// 嵌套作用域
const nestedScope = Effect.scoped(
  Effect.gen(function* (_) {
    // 外层作用域
    const outerFiber = yield* _(Effect.fork(outerTask));
    
    // 内层作用域
    yield* _(
      Effect.scoped(
        Effect.gen(function* (_) {
          const innerFiber = yield* _(Effect.fork(innerTask));
          // 内层作用域结束时，innerFiber 被中断
        })
      )
    );
    
    // 外层作用域结束时，outerFiber 被中断
    return yield* _(Fiber.join(outerFiber));
  })
);
```

### 2.4.3 利用 Runtime 的自定义配置

有时需要为特定的 Effect 提供自定义的 Runtime 配置，如日志级别、错误处理策略等：

```typescript
import { Effect, Runtime, Logger } from "effect";

// 创建一个自定义 Runtime
const customRuntime = Runtime.make({
  // 自定义日志级别
  logger: Logger.logger,
  // 其他配置
});

// 使用自定义 Runtime 执行 Effect
const result = customRuntime.runPromise(customEffect);

// 也可以给 Effect 附加 Runtime 配置
const configuredEffect = Effect.withRuntimeConfig({
  logger: Logger.logger,
  tracer: tracerProvider,
}).pipe(Effect.andThen(customEffect));

// 不同环境使用不同 Runtime 配置
const devRuntime = Runtime.make({
  logger: Logger.logger.pipe(Logger.pretty),
});

const prodRuntime = Runtime.make({
  logger: Logger.logger,
});
```

## 2.5 Effect.gen 语法深度解析

### 2.5.1 Generator 与 async/await 的对比

`Effect.gen` 使用了 JavaScript 的 Generator 语法来模拟 async/await 的代码结构。但两者有本质区别。

```typescript
// async/await — 每次 await 都会交出控制权给 JavaScript 事件循环
async function asyncExample() {
  const user = await fetchUser(); // 1. 挂起，等待 Promise
  const orders = await fetchOrders(); // 2. 挂起，等待 Promise
  return { user, orders };
  // 注意：错误只能通过 try/catch 捕获
}

// Effect.gen — 每次 yield* _ 都会产生一个 Effect 的"中间状态"
const effectExample = Effect.gen(function* (_) {
  const user = yield* _(fetchUser()); // 1. 产生一个 Effect 状态
  const orders = yield* _(fetchOrders()); // 2. 产生下一个 Effect 状态
  return { user, orders };
  // 错误类型体现在 Effect 的 E 参数中
});
```

**Generator 的优势：**

| 特性 | async/await | Effect.gen |
|---|---|---|
| 中断性 | 一旦 await，无法外部打断 | 可以通过 Fiber.interrupt 中断 |
| 错误类型 | `catch (e: unknown)` | 类型系统精确追踪错误 |
| 可测试性 | 需要 mock 全局或路由 | 通过依赖注入隔离测试 |
| 并发控制 | 手动 Promise.all | 内置 Effect.all + 策略配置 |
| 恢复性 | try/catch 再重试 | 声明式 retry 策略 |
| 资源管理 | finally 块手动清理 | 自动 Finalizer 和 Scope 清理 |
| 组合性 | Promise 链，函数式受限于类型 | 高度可组合，类型安全 |

### 2.5.2 Effect.gen 内部工作原理

`Effect.gen` 的工作原理是将 Generator 函数的每次 `yield* _` 调用转换为 Effect 嵌套：

```typescript
// 开发者写的：
Effect.gen(function* (_) {
  const a = yield* _(effectA);
  const b = yield* _(effectB);
  return a + b;
});

// 等价于 Effect 链式调用：
effectA.pipe(
  Effect.flatMap((a) =>
    effectB.pipe(
      Effect.map((b) => a + b)
    )
  )
);
```

每次 `yield* _(effect)` 实际上是在做以下事情：

1. 执行 `effect` 的求值（仍然是惰性的）。
2. 将 Generator 的执行状态挂起。
3. 将当前 Generator 的状态（包括局部变量）存储在 Fiber 的上下文中。
4. 当 effect 完成时，恢复 Generator 的执行。

这种机制使得 Effect-TS 能够在每个"yield 点"插入中断检查（Check Interruption），实现精确的中断：

```typescript
// 每个 yield 点都是潜在的中断检查点
Effect.gen(function* (_) {
  // yield 点 1 — 检查是否被中断
  const data = yield* _(fetchData());
  
  // yield 点 2 — 检查是否被中断
  const processed = yield* _(process(data));
  
  // yield 点 3 — 检查是否被中断
  const saved = yield* _(save(processed));
  
  return saved;
});

// 如果外部调用 Fiber.interrupt：
// - 如果在 yield 点 1 之前中断：fetchData 不会被调用
// - 如果在 yield 点 1 和 2 之间中断：process 不会被调用
// - 在任何中断点上，已经获取的资源（如文件句柄）都会通过 Finalizer 清理
```

### 2.5.3 为什么使用 `_` 作为参数名

Effect.gen 的回调接收一个函数参数，通常命名为 `_`：

```typescript
Effect.gen(function* (_) {
  const x = yield* _(effect);
  return x;
});
```

`_` 是一个函数，它将 Effect 转换为 Generator 可 yield 的形式。这是一个惯例而不是强制的命名，但有特殊意义：

- `_` 代表"我不关心这个函数本身"。
- 它暗示这个函数的唯一用途就是包装 Effect 让 Generator 能够 yield。
- 在 Effect-TS 的文档和社区中，`_` 是标准命名。

实际上 `_` 函数的类型签名类似于：

```typescript
// 简化的类型
type EffectAdapter = <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>;
```

### 2.5.4 Effect.gen 中的错误处理

在 Effect.gen 中，错误处理有几种模式：

```typescript
import { Effect } from "effect";

// 模式一：使用 catchAll 包裹整个 gen
const program1 = Effect.gen(function* (_) {
  const user = yield* _(fetchUser(id));
  const orders = yield* _(fetchOrders(user.id));
  return { user, orders };
}).pipe(
  Effect.catchAll((error) => {
    switch (error._tag) {
      case "NetworkError":
        return Effect.succeed(fallbackData);
      case "NotFoundError":
        return Effect.fail(error); // 重新抛出
      default:
        return Effect.succeed(defaultData);
    }
  })
);

// 模式二：在 gen 内部处理特定错误
const program2 = Effect.gen(function* (_) {
  const user = yield* _(
    fetchUser(id).pipe(Effect.catchTag("NotFoundError", () =>
      Effect.succeed(fallbackUser)
    ))
  );
  // 只有 NetworkError 会传播到这里
  const orders = yield* _(fetchOrders(user.id));
  return { user, orders };
});

// 模式三：使用 try-catch（效果等同 catchAll，但类型不精确）
const program3 = Effect.gen(function* (_) {
  try {
    const user = yield* _(fetchUser(id));
    return user;
  } catch (error) {
    // 注意：这里的 error 是 unknown
    // 不如 Effect.catchAll 的类型安全好
    return fallbackUser;
  }
});
```

## 2.6 典型问题处理

### 2.6.1 超时控制的高级用法

结合 Fiber 和 Runtime 实现更精细的超时控制：

```typescript
import { Effect, Fiber, Schedule } from "effect";

// 分层超时：先快速失败，再进行优雅降级
const multiLevelTimeout = Effect.gen(function* (_) {
  // 第一层：100ms 内返回就使用结果
  const fastEnough = yield* _(
    fetchData().pipe(
      Effect.timeout("100 millis"),
      Effect.optionFromOptional // 超时时返回 None
    )
  );
  
  if (fastEnough._tag === "Some") {
    return fastEnough.value;
  }
  
  // 第二层：100ms - 1s 之间返回，从缓存读取
  console.log("主请求超时，尝试缓存");
  return yield* _(readFromCache().pipe(
    Effect.timeout("1 second"),
    Effect.catchAll(() =>
      // 第三层：都超时了，返回默认值
      Effect.succeed(DEFAULT_VALUE)
    )
  ));
});
```

### 2.6.2 Race — 多个 Fiber 竞争

与 Promise.race 类似，但 Effect 的 race 会在其中一个完成时自动中断另一个：

```typescript
import { Effect } from "effect";

// 从多个数据源竞争获取结果
const raceDataSources = Effect.gen(function* (_) {
  const result = yield* _(
    // 谁先返回就用谁的结果
    Effect.race(
      fetchFromPrimary(),
      fetchFromSecondary()
    )
  );
  // 失败的那个 Fiber 自动被中断
  return result;
});

// 也可以使用 raceAll 竞争多个
const fastestResponse = Effect.raceAll([
  fetchFromSourceA(),
  fetchFromSourceB(),
  fetchFromSourceC(),
]);

// 带超时的 race
const withDeadline = Effect.race(
  actualWork(),
  Effect.sleep("5 seconds").pipe(
    Effect.andThen(Effect.fail(new TimeoutError()))
  )
);
```

### 2.6.3 Supervisor — Fiber 的监控管理

Supervisor 是 Effect-TS 中用于监控和管理 Fiber 的机制：

```typescript
import { Effect, Supervisor, Fiber } from "effect";

// 创建一个 Supervisor 来监控所有子 Fiber
const program = Effect.gen(function* (_) {
  const supervisor = yield* _(Supervisor.trackChildren);
  
  // 在 Supervisor 的作用域内创建 Fiber
  const result = yield* _(
    Effect.supervise(
      Effect.gen(function* (_) {
        yield* _(Effect.fork(taskA));
        yield* _(Effect.fork(taskB));
        yield* _(Effect.fork(taskC));
        return "done";
      }),
      supervisor
    )
  );
  
  // 获取 Supervisor 跟踪的所有 Fiber
  const children = yield* _(supervisor.children);
  console.log(`当前活跃 Fiber 数：${children.length}`);
  
  return result;
});
```

## 2.7 开发者技能：并发编程的最佳实践

### 2.7.1 Fiber 使用原则

1. **不要 fork 后遗忘**：每个 fork 都应该有对应的 join 或 interrupt。
2. **优先使用高层并发 API**：`Effect.forEach`、`Effect.all`、`Effect.race` 比手动 fork 更安全。
3. **使用 Scope 管理生命周期**：对长时间运行的 Fiber，确保在 Scope 中创建。
4. **善用 Supervisor 做监控**：特别是在生产环境中，活跃 Fiber 数量是一个重要的可观测性指标。
5. **CPU 密集型任务加 yieldNow**：避免长时间阻塞事件循环。

### 2.7.2 从 Event Loop 思维到 Fiber 思维

| Event Loop 思维 | Fiber 思维 |
|---|---|
| 异步操作 = 回调/事件 | 异步操作 = 协程切换 |
| 无法取消正在进行的操作 | 可以在任何 yield 点中断 |
| 错误通过 rejection 传播 | 错误通过 E 通道传播 |
| 资源管理通过 finally 实现 | 资源管理通过 Finalizer/Scope 实现 |
| 并发通过多个 Promise 分散在事件循环中 | 并发通过 Fiber 在运行时统一调度 |

### 2.7.3 调试与诊断

```typescript
import { Effect, Tracer } from "effect";

// 在开发环境中启用 Fiber 追踪
const debugFiber = Effect.sync(() => {
  console.trace("当前 Fiber:");
  // 可以通过 Runtime 的 Tracer 获取 Fiber 信息
});

// 或者在 Effect 中注入追踪信息
const tracedEffect = Effect.withSpan("my-operation", {
  attributes: { userId: id },
})(myEffect);
```

## 2.8 小结

本章深入分析了 Effect-TS 的执行引擎和 Fiber 模型，可以归纳为三个层次：

**第一层：Runtime 执行器**

Runtime 是 Effect 的执行入口，提供 `runSync`、`runPromise`、`runFork` 三种执行模式。通过自定义 Runtime，可以为 Effect 提供统一的依赖注入、日志和错误处理策略。

**第二层：Fiber 轻量级协程**

Fiber 是 Effect-TS 的并发基石，是用户态管理的协程。它相比 Promise 的核心优势在于：
- **可中断**：在任何 yield 点都可以精确中断 Fiber。
- **可观察**：可以查询 Fiber 的运行状态、子 Fiber 列表。
- **可组合**：Fiber 可以通过 join、race、supervise 等组合操作。
- **零开销切换**：Fiber 切换没有内核态上下文切换开销。

**第三层：Scope 结构化并发**

Scope 是 Fiber 和资源生命周期的容器，确保 Fiber 不会泄漏、资源不会被遗忘释放。结构化并发原则保证了：
- 子 Fiber 不超出父作用域。
- 异常传播到整个作用域树。
- 资源清理确定且保证执行。

理解这三层架构，就掌握了 Effect-TS 运行时的全部核心设计。这三层共同构成了一个比原生 Promise + async/await 更安全、更可控、更可组合的并发编程模型。无论是构建高并发的 Web 服务、复杂的批处理任务、还是需要精细错误恢复的业务流程，Effect-TS 的 Fiber 模型都能提供坚实的基础设施支持。

下一章将进入 Part 2 的场景实战，介绍如何在 Spring Boot 微服务监控中应用 Effect-TS 的并发能力处理指标采集和数据聚合。