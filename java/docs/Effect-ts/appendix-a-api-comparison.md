# 附录 A：Effect-TS 核心 API 与原生 Promise/Async 对照速查表

## 基础操作

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 创建成功值 | `Promise.resolve(val)` | `Effect.succeed(val)` | 创建一个立即成功的 Effect |
| 创建失败值 | `Promise.reject(err)` | `Effect.fail(err)` | 创建一个立即失败的 Effect |
| 同步计算 | `() => val` | `Effect.sync(() => val)` | 将同步计算包装为惰性 Effect |
| 异步计算 | `async () => val` | `Effect.promise(() => Promise.resolve(val))` | 将 Promise 工厂包装为 Effect |
| 可能抛异常 | `try { ... } catch { ... }` | `Effect.try(() => val)` | 捕获同步异常 |
| 可能抛异常的异步 | `async () => { ... }` | `Effect.tryPromise(() => fetch(url))` | 捕获异步异常 |
| 空值 | `Promise.resolve(undefined)` | `Effect.void` | 无返回值的 Effect |

## 转换操作

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 映射值 | `val.then(fn)` | `Effect.map(eff, fn)` | 对成功值进行转换 |
| 扁平映射 | `val.then(fn)` | `Effect.flatMap(eff, fn)` | 返回新的 Effect |
| 映射错误 | — | `Effect.mapError(eff, fn)` | 转换错误类型 |
| 同时处理成功/失败 | `val.then(fn).catch(errFn)` | `Effect.match(eff, { onSuccess, onFailure })` | 匹配两种结果 |
| 异步同时处理 | `async () => { try { ... } catch { ... } }` | `Effect.matchEffect(eff, { onSuccess, onFailure })` | 异步匹配 |
| 忽略结果 | `val.then(() => undefined)` | `Effect.as(eff, value)` | 替换成功值 |
| 延迟执行 | — | `Effect.suspend(() => eff)` | 惰性创建 Effect |

## 错误处理

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 捕获所有错误 | `.catch(fn)` | `Effect.catchAll(eff, fn)` | 捕获所有类型错误 |
| 捕获特定错误 | `if (err instanceof X)` | `Effect.catchTag(eff, "TagName", fn)` | 按标签精准捕获 |
| 捕获缺陷 | — | `Effect.catchAllDefect(eff, fn)` | 捕获非预期异常 |
| 兜底值 | `.catch(() => fallback)` | `Effect.orElse(eff, fn)` | 失败时使用备选 Effect |
| 兜底成功值 | `.catch(() => fallback)` | `Effect.orElseSucceed(eff, val)` | 失败时返回默认值 |
| 重试 | 手动实现 | `Effect.retry(eff, policy)` | 按策略自动重试 |
| 超时 | `Promise.race([val, timeout])` | `Effect.timeout(eff, duration)` | 超时自动取消 |

## 并发操作

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 全部执行 | `Promise.all([a, b])` | `Effect.all([a, b])` | 并发执行所有 Effect |
| 竞速 | `Promise.race([a, b])` | `Effect.race(a, b)` | 返回最先完成的 |
| 第一个成功 | — | `Effect.firstSuccessOf([a, b])` | 返回第一个成功的 |
| 分叉执行 | — | `Effect.fork(eff)` | 在后台 Fiber 中执行 |
| 等待分叉 | `await promise` | `Fiber.join(fiber)` | 等待 Fiber 完成 |
| 中断 | `AbortController.abort()` | `Fiber.interrupt(fiber)` | 取消 Fiber 执行 |

## 资源管理

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 获取使用释放 | — | `Effect.acquireUseRelease(acquire, use, release)` | 安全资源管理 |
| 获取释放 | — | `Effect.acquireRelease(acquire, release)` | 在 Scope 中使用 |
| Scope 作用域 | — | `Effect.scoped(eff)` | 创建资源作用域 |

## 依赖注入

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 定义服务标签 | — | `Context.Tag("ServiceName")` | 定义类型安全的服务标识 |
| 提供服务 | — | `Layer.succeed(Tag, impl)` | 创建服务实现层 |
| 组合层 | — | `Layer.merge(a, b)` | 合并多个层 |
| 注入依赖 | — | `Effect.provide(eff, layer)` | 提供依赖实现 |

## 调度与重试

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 固定间隔 | `setInterval` | `Schedule.fixed("1 second")` | 固定时间间隔 |
| 指数退避 | 手动实现 | `Schedule.exponential("100 millis")` | 指数增长间隔 |
| 最大重试次数 | — | `Schedule.recurs(5)` | 最多重试 N 次 |
| 添加抖动 | — | `Schedule.jittered(schedule)` | 随机偏移防雪崩 |
| 组合策略 | — | `Schedule.intersect(a, b)` | 两个策略同时满足 |

## 流处理

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 创建流 | — | `Stream.fromIterable(arr)` | 从可迭代对象创建 |
| 映射 | — | `Stream.map(stream, fn)` | 转换流元素 |
| 过滤 | — | `Stream.filter(stream, fn)` | 过滤流元素 |
| 分组 | — | `Stream.grouped(stream, n)` | 按批分组 |
| 合并 | — | `Stream.merge(a, b)` | 并发合并两个流 |
| 消费 | — | `Stream.runCollect(stream)` | 收集所有元素 |

## 运行 Effect

| 操作 | Promise / async/await | Effect-TS | 说明 |
|------|----------------------|----------|------|
| 运行返回 Promise | `fn()` | `Effect.runPromise(eff)` | 运行并返回 Promise |
| 运行返回 Exit | — | `Effect.runPromiseExit(eff)` | 返回 Exit 包含完整结果 |
| 同步运行 | — | `Effect.runSync(eff)` | 同步运行（仅同步 Effect） |
| 同步运行 Exit | — | `Effect.runSyncExit(eff)` | 同步运行返回 Exit |
