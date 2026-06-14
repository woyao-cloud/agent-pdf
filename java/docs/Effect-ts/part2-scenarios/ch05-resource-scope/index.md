# 第五章：资源管理与 Scope

## 思考引入

假设你在写一个文件处理服务，需要打开文件 → 逐行读取 → 无论成功失败都要关闭文件。在 JavaScript 中你可能会用 `try/finally`，但如果读取过程中 Fiber 被中断了呢？`try/finally` 能保证执行吗？

```typescript
// 传统方式：try/finally
async function readFile(path: string): Promise<string> {
  const file = await openFile(path)
  try {
    return await readContent(file)
  } finally {
    await file.close()
    console.log(`文件 ${path} 已关闭`)
  }
}
```

这段代码在同步场景下工作良好。但在 Effect-TS 的世界里，Fiber 中断是协作式的——一个 Fiber 被中断时，它不会像线程那样被强制终止，而是收到一个中断信号，在到达下一个"中断检查点"时停止。如果中断发生在上面的 `try` 块执行 `readContent` 的过程中，`finally` 块是否还能执行？

答案是否定的。在 JavaScript 的 `Promise` 模型中，一旦 `await` 了一个被 reject 或 never-settle 的 Promise，后续的 `finally` 块依赖的 Promise 链已经断开，资源可能永远不会被释放。Effect-TS 的 `Scope` 机制正是为了解决这个根本性问题而设计的——它是 Effect-TS 中管理资源生命周期的核心方案，确保资源在成功、失败、中断三种 Exit 状态下都能被正确释放。

本章将从渐进式的代码进化入手，深入剖析 Scope 的实现原理、使用场景、潜在风险与优化策略。

---

## 使用场景

资源管理的需求遍布在应用开发的每一个角落。凡是涉及到有限系统资源的地方，就需要明确的获取与释放约定。

### 文件操作

文件句柄是操作系统层面的有限资源。每个进程能同时打开的文件数量有上限（通常为 1024 或更高），超出后会抛出 `EMFILE` 错误。在日志系统、配置文件加载器、数据导入导出工具中，文件的生命周期管理尤为关键。

```typescript
// 错误示范：打开文件后忘记关闭
const badRead = (path: string) =>
  Effect.gen(function* (_) {
    const file = yield* _(openFile(path))    // 文件已打开
    const content = yield* _(readContent(file)) // 读取内容
    // 忘记调用 file.close()！资源泄漏
    return content
  })
```

### 数据库连接池

数据库连接是昂贵的资源，每个连接都对应服务端的一个线程/进程和客户端的内存缓冲区。连接池限制了并发连接数，但连接的生命周期管理比文件更复杂——连接可能因网络问题意外断开、事务可能回滚、连接可能需要归还到池中而非直接关闭。

### 网络 Socket

网络 Socket 在 HTTP 客户端、WebSocket 连接、gRPC 流、消息队列消费者等场景中大量使用。Socket 的管理不仅涉及打开和关闭，还涉及到超时设置、心跳保活、优雅关闭等。

### 分布式锁

在分布式系统中，使用 Redis 或 ZooKeeper 实现的分布式锁需要严格的获取-释放契约。如果锁在持有期间发生异常或节点崩溃，锁必须被自动释放，否则会造成死锁。

```typescript
// 分布式锁场景（伪代码）
const withLock = (lockKey: string) =>
  Effect.acquireRelease(
    acquireLock(lockKey),   // 获取分布式锁
    (lock, exit) =>         // 无论成败都释放
      Effect.sync(() => lock.release())
  )
```

### 临时资源

临时目录、临时文件、内存映射、GPU 显存分配等临时资源同样需要生命周期管理。在批处理任务或测试框架中，临时资源的清理往往是手动管理最容易出错的环节。

---

## 实现原理

Scope 机制的核心可以分解为三个层次：原语层（acquireRelease）、跟踪层（Scope）、执行层（scoped）。

### acquireRelease 的三阶段模型

`Effect.acquireRelease` 是资源管理的基础原语。它将资源的使用分解为三个明确的阶段：

```typescript
Effect.acquireRelease(
  acquire: Effect<Resource, E1, R1>,                 // 阶段一：获取
  release: (resource: Resource, exit: Exit<A, E2>) => Effect<void, never, R2>,  // 阶段三：释放
)
```

**阶段一：获取（Acquire）**

`acquire` 是一个 Effect，负责打开文件、建立连接、获取锁等操作。如果获取失败，整个 Effect 立即终止，不会进入后续阶段。获取阶段的 Effect 是不可中断的（uninterruptible），确保资源一旦开始获取就一定能完成初始化，不会在获取中途被 Fiber 中断导致部分初始化的资源永远无法释放。

**阶段二：使用（Use）**

使用阶段由调用方通过 `flatMap` 或 `Effect.gen` 提供。这是实际的业务逻辑——读取文件内容、执行数据库查询、发送网络请求。这个阶段是可中断的。如果 Fiber 在这个阶段被中断，中断信号会被捕获，并跳转到释放阶段。

**阶段三：释放（Release）**

释放阶段接收两个参数：获取到的资源和一个 `Exit` 值。`Exit` 描述了资源使用的结果——成功（包含返回值）、失败（包含错误）、缺陷（包含不可恢复的异常）或中断。释放函数可以基于 Exit 做不同的处理，例如：

```typescript
Effect.acquireRelease(
  acquireConnection(config),
  (conn, exit) => {
    if (exit._tag === 'Success') {
      // 操作成功：归还连接到连接池
      return Effect.sync(() => pool.release(conn))
    } else {
      // 操作失败：关闭损坏的连接
      return Effect.sync(() => conn.destroy())
    }
  }
)
```

释放阶段的 Effect 也是不可中断的——即使 Fiber 已经被中断，释放操作仍然会完整执行。

### 简化版本：acquireUseRelease

对于最常见的"获取-使用-释放"模式，Effect-TS 提供了 `acquireUseRelease` 将三个阶段合并为一个调用：

```typescript
const readFile = (path: string): Effect.Effect<string, never> =>
  Effect.acquireUseRelease(
    openFile(path),                          // 获取
    (file) => readContent(file),             // 使用
    (file) => Effect.sync(() => file.close()) // 释放
  )
```

### Scope 的跟踪机制

`Effect.acquireRelease` 只是定义了资源的释放逻辑，但它不会自动释放——资源需要被注册到一个 `Scope` 中。Scope 本质上是一个"资源容器"，内部维护着一个 Finalizer 列表（释放函数的有序集合）。

```typescript
// Scope 内部简化示意
interface Scope {
  // 注册一个释放函数，返回一个移除函数
  addFinalizer: (finalizer: Effect<void, never, any>) => Effect<void, never, never>
  // 关闭 Scope，按逆序执行所有注册的 Finalizer
  close: (exit: Exit<unknown, unknown>) => Effect<void, never, never>
}
```

当 `Effect.acquireRelease` 在 Scope 中运行时，它会将释放函数注册到最近的 Scope。如果在一个 Scope 中多次调用 `acquireRelease`，每个资源的释放函数都会注册到同一个 Scope。

`Effect.scoped` 是 Scope 的入口和出口：

```typescript
Effect.scoped(
  Effect.acquireRelease(openFile("a.txt"), (f) =>
    Effect.sync(() => {
      console.log("释放文件 a.txt")
      f.close()
    })
  ).pipe(
    Effect.flatMap((file) =>
      Effect.acquireRelease(openFile("b.txt"), (f) =>
        Effect.sync(() => {
          console.log("释放文件 b.txt")
          f.close()
        })
      ).pipe(Effect.flatMap((file2) => readContent(file, file2)))
    )
  )
)
```

外层 `Effect.scoped` 创建一个新的 Scope，内部的 `acquireRelease` 将释放函数注册到这个 Scope。当内部 Effect 执行完毕（无论成功、失败、中断），Scope 会按逆序释放所有注册的资源：

```
开始执行 →
  获取文件 a.txt ✓   → 注册释放 a 的 Finalizer
  获取文件 b.txt ✓   → 注册释放 b 的 Finalizer
  使用 a 和 b        → ...
  执行完毕            → Scope 关闭
                     → 释放 b.txt  → 释放 a.txt
```

### Fiber 中断时的自动释放

Scope 与 Fiber 的中断机制深度集成。当 Fiber 被中断时，Effect 运行时系统会：

1. 在 Fiber 的执行上下文中标记"已中断"
2. 在下一个中断检查点（如 `flatMap`、`Effect.gen` 的 `yield*` 操作）检查中断状态
3. 如果检查到中断，抛出一个 `InterruptedException`
4. 中断异常被 Effect 的错误处理机制捕获
5. 运行时查找当前 Scope，调用 Scope 的 `close` 方法
6. Scope 按逆序执行所有 Finalizer

```typescript
const demo = Effect.gen(function* (_) {
  const file = yield* _(Effect.acquireRelease(
    openFile("important.log"),
    (f) => Effect.sync(() => {
      console.log("[释放] 文件已关闭")
      f.close()
    })
  ))

  // 模拟长时间操作，可能被中断
  yield* _(Effect.sleep("5 seconds"))
  const content = yield* _(readContent(file))
  return content
})

const main = Effect.scoped(demo).pipe(
  Effect.timeout("1 second"),   // 1 秒超时 → 中断 Fiber
  Effect.catchAll((e) =>
    Effect.sync(() => console.log("捕获超时，但文件已自动释放"))
  )
)
```

输出结果：

```
[释放] 文件已关闭
捕获超时，但文件已自动释放
```

这正是 `try/finally` 做不到的——在异步超时场景中，JavaScript 的 `finally` 块依赖 Promise 的执行上下文，而 Effect-TS 的 Scope 由运行时系统直接管理，不依赖异步上下文的完整性。

### 栈顺序释放

Scope 跟踪 Finalizer 的注册顺序，释放时按照注册顺序的逆序执行。这个设计解决了资源依赖的问题：

```typescript
Effect.scoped(
  Effect.gen(function* (_) {
    const pool = yield* _(acquirePool())          // Finalizer #1: 关闭连接池
    const conn = yield* _(pool.acquire())          // Finalizer #2: 归还连接到池
    // 使用 conn ...
    // Scope 关闭时：先归还连接 #2，再关闭连接池 #1
    // 如果先关闭了连接池，归还连接就会失败
  })
)
```

---

## 潜在风险

Scope 机制虽然强大，但使用不当仍会导致各种问题。以下是最常见的一类。

### Scope 泄漏：脱离 Scope 上下文

**核心问题：** `acquireRelease` 本身只是"注册了一个释放计划"，实际的释放依赖于 Scope 的存在。如果在 `scoped` 的上下文之外调用 `acquireRelease`，资源会被获取但永远不会被释放。

```typescript
// 危险：没有 scoped 包裹！
const leakyResource = Effect.acquireRelease(
  openFile("secret.txt"),
  (f) => Effect.sync(() => {
    console.log("释放文件")
    f.close()
  })
)

// 使用
const result = await Effect.runPromise(
  leakyResource.pipe(Effect.flatMap((f) => readContent(f)))
)
// 文件被打开了，但 close 永远不会被执行！
```

`leakyResource` 的类型中隐含了 `Scope` 需求：

```typescript
// 类型签名中包含 Scope
const leakyResource: Effect.Effect<File, Error, Scope>  // 需要 Scope 支持
```

但 TypeScript 的类型检查并不强制要求提供 `Scope`——只有运行时调用 `Effect.scoped` 才会真正创建 Scope 实例。如果在 `runPromise` 中没有调用 `scoped`，资源就泄漏了。

**正确做法：**

```typescript
const safeResource = Effect.scoped(
  Effect.acquireRelease(
    openFile("secret.txt"),
    (f) => Effect.sync(() => {
      console.log("释放文件")
      f.close()
    })
  ).pipe(Effect.flatMap((f) => readContent(f)))
)

const result = await Effect.runPromise(safeResource)
// 执行完毕 → 文件自动关闭
```

### 释放操作抛出异常

释放阶段的 Effect 是"不可失败"的——它的错误类型是 `never`。这是因为释放操作不支持失败：如果释放本身抛出异常，运行时无法再次尝试释放，也无法忽略这个异常。

```typescript
Effect.acquireRelease(
  openFile("log.txt"),
  (file) => Effect.sync(() => {
    throw new Error("关闭文件时出错！")
  })
)
```

当释放抛出异常时，Effect 运行时会抛出一个 `Cause`，包含原始错误和释放错误两个缺陷：

```
Cause: {"_tag": "Fail", "error": "...",
  "_tag": "Defect", "defect": "关闭文件时出错！"}
```

**应对策略：**

- 释放操作中避免使用可能抛出的代码
- 如果必须使用可能失败的操作，用 `catchAll` 或 `catchAllDefect` 包裹：
```typescript
Effect.acquireRelease(
  openFile("log.txt"),
  (file) => Effect.sync(() => file.close()).pipe(
    Effect.catchAll(() => Effect.sync(() =>
      console.error("文件关闭失败，但已尽力而为")
    ))
  )
)
```

### 双重释放

如果同一个资源通过两种不同的机制释放，可能出现双重释放。例如，既在 `acquireRelease` 的释放函数中关闭了连接，又在外面手动调用了 `close`：

```typescript
const demo = Effect.scoped(
  Effect.gen(function* (_) {
    const conn = yield* _(Effect.acquireRelease(
      createConnection(),
      (c) => Effect.sync(() => {
        console.log("自动关闭连接")
        c.close()
      })
    ))

    // 手动关闭（错误！）
    yield* _(Effect.sync(() => {
      console.log("手动关闭连接")
      conn.close()
    }))

    return conn
  })
)
```

输出：

```
手动关闭连接
自动关闭连接
```

虽然这里没有崩溃（因为大多数 `close` 是幂等的），但双重释放反映了资源所有权不清晰的架构问题。正确的实践是：资源的所有权交给 Scope，使用者不应手动释放。

### 过早的 Scope 关闭

将 `Effect.scoped` 放在了过小的范围内，导致资源在使用前就被关闭：

```typescript
const badScoping = Effect.gen(function* (_) {
  // 错误：scoped 的范围太小
  const content = yield* _(Effect.scoped(
    Effect.acquireRelease(openFile("data.txt"), close)
      .pipe(Effect.flatMap(readContent))
  ))

  // 此时文件已经关闭！但还要用它……
  return content.length    // 没问题，content 是字符串
})

const worseScoping = Effect.gen(function* (_) {
  // 更危险：拿到文件引用但 scope 已结束
  const file = yield* _(Effect.scoped(
    Effect.acquireRelease(openFile("data.txt"), close)
  ))
  // 文件已关闭，但 file 引用仍然存在——悬垂引用！
  return yield* _(readContent(file))
})
```

---

## 优化策略

### Scope 嵌套

Scope 支持嵌套结构。内层 Scope 结束时释放自己的资源，外层 Scope 不受影响：

```typescript
const nestedScopes = Effect.scoped(
  Effect.gen(function* (_) {
    // 外层 Scope：数据库连接池级别的资源
    const pool = yield* _(Effect.acquireRelease(
      createPool(10),
      (p) => p.close()
    ))

    // 内层 Scope：单个请求级别的资源（事务）
    const result = yield* _(Effect.scoped(
      Effect.gen(function* (_) {
        const conn = yield* _(Effect.acquireRelease(
          pool.acquire(),
          (c) => c.release()  // 归还到连接池
        ))
        const tx = yield* _(conn.beginTransaction())
        yield* _(conn.query("UPDATE ..."))
        yield* _(tx.commit())
        return "done"
      })
      // 内层 Scope 结束 → 事务提交 → 连接归还到池
    ))

    // 外层 Scope 继续使用池
    return result
  })
  // 外层 Scope 结束 → 连接池关闭
)
```

Scope 嵌套的价值在于精确控制资源粒度——连接池的生命周期覆盖整个应用，而单个连接的生命周期只覆盖一个请求。内层 Scope 结束时归还连接，外层 Scope 结束时关闭整个池。

### 资源池化：共享而非创建

对于频繁创建销毁的资源（如数据库连接、HTTP 连接），每次创建新资源的成本很高。资源池模式通过缓存和复用资源来优化：

```typescript
// 资源池的最小接口
interface ResourcePool<A> {
  readonly acquire: Effect.Effect<A, never, Scope.Scope>
}

// 池的实现
const createPool = <A>(
  create: Effect.Effect<A>,
  destroy: (a: A) => Effect<void>,
  size: number
): ResourcePool<A> => {
  const items: A[] = []
  // ... 池化逻辑
  return {
    acquire: Effect.acquireRelease(
      items.length > 0
        ? Effect.sync(() => items.pop()!)
        : create,
      (item) => Effect.sync(() => items.push(item))  // 归还而非销毁
    )
  }
}
```

资源池配合 Scope 使用的核心思路是：`acquireRelease` 的释放函数不是销毁资源，而是归还资源。这样，Scope 结束时资源会回到池中，供其他 Scope 使用。

### Finalizers 注册

除了 `acquireRelease`，Effect-TS 提供了 `Effect.addFinalizer` 来手动注册清理逻辑：

```typescript
const withMetrics = Effect.gen(function* (_) {
  const start = Date.now()

  // 注册 Finalizer：无论成败都记录耗时
  yield* _(Effect.addFinalizer(() =>
    Effect.sync(() => {
      const elapsed = Date.now() - start
      metrics.recordLatency(elapsed)
    })
  ))

  // 主要业务逻辑
  return yield* _(doWork())
})
```

Finalizer 的特性：

- **无论成功、失败、中断都执行**：与 `acquireRelease` 的释放阶段语义一致
- **支持多个 Finalizer**：执行顺序与注册顺序相反（栈顺序）
- **Finalizer 本身是 Effect**：可以执行异步操作，但错误类型必须是 `never`
- **Finalizer 不影响主逻辑的 Exit**：即使 Finalizer 失败，主逻辑的 Exit 状态不受影响；但 Finalizer 的错误会作为缺陷（Defect）附加到 Cause 中

`addFinalizer` 适合在使用 Effect 的过程中动态注册清理逻辑，而 `acquireRelease` 更适合将资源的获取和释放逻辑封装在一起。

---

## 典型问题处理

### 问题一：资源必须是单例的

有时你需要确保一个资源在整个应用生命周期中只创建一次（如配置加载器、全局缓存）。

```typescript
// 错误：每次调用 scoped 都会创建新资源
const badConfigLoader = Effect.scoped(
  Effect.acquireRelease(
    Effect.sync(() => loadConfig("config.json")),
    () => Effect.void
  )
)

// 正确：使用 Effect.once 或 Layer 缓存
const configLoader = Effect.acquireRelease(
  Effect.sync(() => loadConfig("config.json")),
  () => Effect.void
).pipe(
  Effect.once,           // 只执行一次，结果被缓存
  Effect.flatMap((f) => f)
)
```

### 问题二：资源之间需要共享状态

两个资源之间需要共享状态时，应确保状态的生命周期与 Scope 绑定：

```typescript
const sharedStateScope = Effect.scoped(
  Effect.gen(function* (_) {
    // 共享状态随 Scope 创建
    const state = yield* _(Effect.acquireRelease(
      Effect.sync(() => new Map<string, any>()),
      (s) => Effect.sync(() => {
        s.clear()
        console.log("共享状态已清理")
      })
    ))

    // 资源 A 使用共享状态
    yield* _(resourceA(state))
    // 资源 B 使用共享状态
    yield* _(resourceB(state))

    return state
  })
)
```

### 问题三：资源获取顺序是业务敏感的

某些业务场景要求严格的资源获取顺序，Scope 的栈顺序释放能够保证这一点：

```typescript
const transactionWithLock = Effect.scoped(
  Effect.gen(function* (_) {
    // 先获取锁（必须早释放）
    const lock = yield* _(Effect.acquireRelease(
      redis.lock("order:123"),
      (l) => l.unlock()
    ))
    // 再获取连接（后释放）
    const conn = yield* _(Effect.acquireRelease(
      pool.acquire(),
      (c) => c.release()
    ))
    // 释放顺序：先连接（归还到池）→ 后锁（解锁）
    // 确保在解锁之前，连接已经处理完毕
  })
)
```

### 问题四：资源释放的超时

如果释放操作太慢（如关闭数据库连接时等待未完成的事务），可以给释放加上超时：

```typescript
const safeRelease = (conn: Connection) =>
  Effect.sync(() => conn.close()).pipe(
    Effect.timeout("5 seconds"),
    Effect.catchAll(() =>
      Effect.sync(() => console.error("连接关闭超时，强制执行"))
    ),
    Effect.orDie   // 超时后转为缺陷，但不会阻止其他 Finalizer 执行
  )
```

### 问题五：多层资源中部分获取失败

当一个 Scope 中按顺序获取多个资源时，如果第二个资源获取失败，第一个资源必须被释放：

```typescript
Effect.scoped(
  Effect.gen(function* (_) {
    const a = yield* _(Effect.acquireRelease(
      acquireA(),                     // 成功
      (a) => Effect.sync(() => a.close())
    ))
    // 如果 acquireB() 抛出错误，Scope 会自动释放 a
    const b = yield* _(Effect.acquireRelease(
      acquireB(),                     // 失败！
      (b) => Effect.sync(() => b.close())
    ))
    // 执行不到这里
    return useBoth(a, b)
  })
)
// 输出：a 被自动释放（b 未获取到，不需要释放）
```

这是 Scope 相比传统 `try/catch` 的一个重要优势。在手动资源管理中，如果 `acquireB` 失败后你需要在 `catch` 中释放 `a`，而 Scope 自动处理了这个场景。

---

## 开发者技能

### 1. 培养"Scope 敏感"意识

编写 Effect-TS 代码时，每当出现打开、创建、连接等操作时，就要立刻问自己三个问题：

- 这个资源需要释放吗？释放逻辑是什么？
- 释放逻辑是否幂等？多次调用同一释放函数会怎样？
- 当前代码是否在 `Effect.scoped` 的上下文中？

把"获取资源 → 注册释放 → 使用资源"这个思维链条变成肌肉记忆。

### 2. 合理划分 Scope 边界

| 场景 | Scope 范围 | 典型资源 |
|------|-----------|---------|
| 单次文件读写 | 读取操作前后 | 文件句柄 |
| HTTP 请求 | 请求开始到响应结束 | 数据库连接、Session |
| 消息队列消费 | 消息接收 -> ack/nack | 事务上下文 |
| 定时批处理 | 一次批处理周期 | 临时文件、外部 API 客户端 |
| 应用生命周期 | 启动到优雅关闭 | 连接池、线程池 |

规则：Scope 的边界应该与资源的"使用单元"一致。如果资源只在单个操作中使用，Scope 就包裹这个操作；如果资源在多个请求中复用（如连接池），Scope 就包裹整个应用。

### 3. 优先使用 Layer 管理资源

对于应用级别的资源（数据库连接池、Redis 客户端、HTTP 服务器），优先使用 `Layer.scoped`：

```typescript
const DbLayer = Layer.scoped(
  Database,
  Effect.acquireRelease(connectToDatabase(), (db) => db.close())
)

const RedisLayer = Layer.scoped(
  RedisClient,
  Effect.acquireRelease(connectToRedis(), (r) => r.close())
)

const AppLayer = DbLayer.pipe(Layer.merge(RedisLayer))

// 应用退出时，所有资源自动释放
Effect.runFork(
  program.pipe(Effect.provide(AppLayer))
)
```

`Layer.scoped` 将资源的生命周期与 Layer 的 Scope 绑定。当应用退出或 Layer 被关闭时（通过 `Layer.finalizer` 或程序结束），所有通过 `Layer.scoped` 管理的资源都会被释放。

### 4. 善用类型系统

`acquireRelease` 返回的 Effect 类型中，`Scope` 需求会出现在 `Requirements` 类型参数中：

```typescript
// acquireRelease 的返回值需要 Scope
const needScope: Effect.Effect<File, Error, Scope.Scope> =
  Effect.acquireRelease(openFile("x"), (f) => close(f))

// 被 scoped 包裹后，Scope 需求被消除
const noScope: Effect.Effect<string, Error, never> =
  Effect.scoped(needScope.pipe(Effect.flatMap(readFile)))
```

充分利用这个类型信息：如果函数签名中包含 `Scope`，调用者必须通过 `Effect.scoped` 来提供 Scope 上下文。不要随意用 `provideSome` 或 `as"never"` 来抹掉 Scope 类型——这会导致运行时泄漏。

### 5. 测试资源管理逻辑

测试资源是否被正确释放，可以通过注册副作用标记来验证：

```typescript
const testScope = () => {
  const released: string[] = []

  const effect = Effect.scoped(
    Effect.acquireRelease(
      Effect.sync(() => "resource-1"),
      (name) => Effect.sync(() => released.push(name))
    )
  )

  return Effect.runPromise(effect).pipe(
    Effect.map(() => {
      console.assert(released.includes("resource-1"), "资源应被释放")
    })
  )
}
```

对于更复杂的测试场景，使用 Effect-TS 的 Test 模块配合 TestClock 模拟超时和中断。

---

## 示例代码

本章的最后，我们用一个完整的文件复制示例来串联所有知识点。

```typescript
import { Effect, Console } from "effect"
import * as Fs from "node:fs/promises"

// ---- 辅助函数 ----
const openFile = (path: string) =>
  Effect.tryPromise({
    try: () => Fs.open(path),
    catch: (e) => new Error(`无法打开文件 ${path}: ${e}`),
  })

const readContent = (file: Awaited<ReturnType<typeof Fs.open>>) =>
  Effect.tryPromise({
    try: () => file.readFile("utf-8"),
    catch: (e) => new Error(`读取文件失败: ${e}`),
  })

const writeContent = (file: Awaited<ReturnType<typeof Fs.open>>, content: string) =>
  Effect.tryPromise({
    try: () => file.writeFile(content, "utf-8"),
    catch: (e) => new Error(`写入文件失败: ${e}`),
  })

// ---- 核心逻辑 ---- //
const copyFile = (source: string, target: string) =>
  Effect.scoped(
    Effect.gen(function* (_) {
      // 步骤1: 打开源文件（注册 Finalizer）
      const srcFile = yield* _(Effect.acquireRelease(
        openFile(source),
        (file) =>
          Effect.sync(() => {
            Console.log(`[释放] 关闭源文件: ${source}`)
            file.close()
          })
      ))

      // 步骤2: 打开目标文件（注册 Finalizer）
      const dstFile = yield* _(Effect.acquireRelease(
        openFile(target),
        (file) =>
          Effect.sync(() => {
            Console.log(`[释放] 关闭目标文件: ${target}`)
            file.close()
          })
      ))

      // 步骤3: 读取源内容
      Console.log(`[使用] 读取源文件: ${source}`)
      const content = yield* _(readContent(srcFile))

      // 步骤4: 写入目标文件
      Console.log(`[使用] 写入目标文件: ${target}`)
      yield* _(writeContent(dstFile, content))

      Console.log(`[完成] 文件复制成功: ${source} → ${target}`)

      return content.length
    })
  )

// ---- 运行 ----
const main = copyFile("data/source.txt", "data/target.txt").pipe(
  Effect.catchAll((error) =>
    Console.error(`复制失败: ${error.message}`)
  )
)

await Effect.runPromise(main)
```

**运行结果：**

```
[使用] 读取源文件: data/source.txt
[使用] 写入目标文件: data/target.txt
[完成] 文件复制成功: data/source.txt → data/target.txt
[释放] 关闭目标文件: data/target.txt
[释放] 关闭源文件: data/source.txt
```

注意释放顺序：目标文件（后打开）先释放，源文件（先打开）后释放——栈顺序。

**如果源文件不存在：**

```
[释放] 关闭目标文件: data/target.txt
复制失败: 无法打开文件 data/source.txt: ENOENT: no such file or directory
```

源文件获取失败时，Scope 机制自动释放已经打开的目标文件。如果用传统的 `try/catch/finally` 嵌套来实现这个效果，代码会变成这样：

```typescript
// 手动资源管理的对比
async function copyFileManual(source: string, target: string) {
  let srcFile: Fs.FileHandle | null = null
  let dstFile: Fs.FileHandle | null = null
  try {
    srcFile = await Fs.open(source)
    try {
      dstFile = await Fs.open(target)
      const content = await srcFile.readFile("utf-8")
      await dstFile.writeFile(content, "utf-8")
    } finally {
      if (dstFile) await dstFile.close()
    }
  } finally {
    if (srcFile) await srcFile.close()
  }
}
```

手动版本的问题：
- 需要嵌套的 `try/finally` 来处理多资源释放
- 释放顺序依赖编码者的细心，而非自动保证
- 无法处理 Fiber 中断（没有 Fiber 概念的代码当然没问题，但在 Effect-TS 的并发模型中这是一个关键缺口）
- 如果 `dstFile.close()` 抛出异常，`srcFile.close()` 永远不会执行

### 对比表格

| 特性 | `try/finally` | `Effect.acquireRelease` | `Effect.scoped` |
|------|--------------|------------------------|----------------|
| 核心机制 | 同步代码块 | 原语层面的三段模型 | Scope + Fiber 集成 |
| 释放时机 | 代码块退出 | 注册到最近的 Scope | Scope 结束时 |
| 成功时释放 | ✅ | ✅ | ✅ |
| 失败时释放 | ✅ | ✅ | ✅ |
| Fiber 中断时释放 | ❌ | ✅（需在 Scope 中） | ✅ |
| 多资源逆序释放 | 手动嵌套 | 自动（同 Scope） | 自动 |
| 部分获取失败时释放已获取资源 | 手动 | 自动 | 自动 |
| 释放异常处理 | 可能覆盖原始异常 | 附加为缺陷 | 附加为缺陷 |
| 组合性 | 低（嵌套地狱） | 中（需 Scope 配合） | 高 |
| 类型安全 | 弱 | 中（Scope 需求在类型中） | 强 |

---

## 本章小结

Scope 机制是 Effect-TS 资源管理的基石，它将"获取 → 使用 → 释放"这一经典模式从手动约定提升为语言级保障。

其核心思维模型是：**每个资源都有一个明确的所有者**。Owner 是 Scope，而不是使用者。使用者只管"用"，Scope 负责"管"。这种职责分离让代码的关注点更加清晰——业务逻辑关心做什么，Scope 关心资源什么时候释放、怎么释放。

关键知识点回顾：

- **acquireRelease**：定义资源的获取和释放逻辑，释放通过 `Exit` 获知使用结果
- **Scope**：Finalizer 的有序容器，释放顺序为注册顺序的逆序（栈顺序）
- **scoped**：创建并关闭 Scope 的入口，Fiber 中断时也保证释放
- **Finalizer 不可中断**：释放阶段的 Effect 是 uninterruptible 的，保证即使 Fiber 被中断也能完成清理
- **Error 类型为 never**：释放操作不应失败，如果可能失败需要自行兜底
- **类型中的 Scope 需求**：通过类型系统追踪哪些资源需要 Scope，避免运行时泄漏

从手动 `try/finally` 到 `acquireRelease` 再到 `Scope`，这条进化路径反映了 Effect-TS 对资源管理的系统化思考：**不要相信程序员会记得释放资源，让类型系统和运行时来保证**。这种设计哲学贯穿整个 Effect-TS 库——通过类型和代数效应将运行时行为建模到编译可检查的层面，在开发阶段就消除一类常见的 Bug。

下一章将介绍结构化并发（Structured Concurrency），展示 Effect-TS 在高并发场景下的控制能力，以及它如何与 Scope 机制协同，实现 Fiber 生命周期的精确管理。