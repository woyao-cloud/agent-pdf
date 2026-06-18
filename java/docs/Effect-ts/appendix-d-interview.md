# 附录 D：Effect-TS 面试高频问题与架构师级解答

## 1. Effect vs Promise 的根本区别是什么？

**核心区别：** Promise 是"端上桌的菜"（热执行），Effect 是"食谱"（惰性描述）。

**详细说明：**
- **执行时机**：Promise 在创建时立即执行，无法推迟；Effect 是惰性的，只有调用 `Effect.runPromise` 等运行函数时才执行
- **错误类型**：Promise 的 catch 将错误归约为 `unknown`；Effect 将错误编码在类型参数 `E` 中，编译期可检查
- **可取消性**：Promise 一旦创建无法取消；Effect 通过 Fiber 中断机制支持优雅取消
- **依赖声明**：Promise 隐式依赖外部环境；Effect 通过 `R` 类型参数显式声明依赖
- **资源管理**：Promise 没有内置资源管理；Effect 通过 Scope 和 acquireUseRelease 提供确定性资源释放

## 2. Effect<A, E, R> 三维模型是什么？

Effect<A, E, R> 是 Effect-TS 的核心类型，三个类型参数分别表示：

- **A (Success)** — 成功时返回值的类型
- **E (Error)** — 失败时错误类型（联合类型可精确表达多种错误）
- **R (Requirements)** — 执行所需的环境依赖（通过 Context 提供）

**示例：**
```typescript
// 需要 Database 服务，可能失败，成功返回 User
type GetUser = Effect<User, NotFoundError | DatabaseError, Database>
```

## 3. Fiber 与线程的区别？

| 特性 | 操作系统线程 | Effect Fiber |
|------|------------|-------------|
| 创建开销 | 微秒级（系统调用） | 纳秒级（内存分配） |
| 上下文切换 | 微秒级（内核态） | 纳秒级（用户态） |
| 内存占用 | ~1MB 栈空间 | ~几 KB（动态增长） |
| 数量限制 | 几千个 | 数百万个 |
| 调度方式 | 内核抢占式 | 用户态协作式 |

## 4. Effect 如何实现取消？

Effect 的取消基于 Fiber 中断机制：

1. `Effect.fork` 创建 Fiber 在后台执行
2. `Fiber.interrupt` 发送中断信号
3. Fiber 在下一个"检查点"检测到中断信号
4. 自动运行所有 acquireRelease 的 release 逻辑
5. 资源被安全释放

**关键点：** 中断是协作式的，CPU 密集型任务需要主动调用 `Effect.checkInterruption` 来检查中断信号。

## 5. Effect 的错误处理为什么比 try/catch 好？

1. **类型安全**：错误类型在编译期检查，不会遗漏
2. **精确分类**：通过 Tagged Union 精确区分错误类型
3. **组合性**：错误处理操作符可组合（catchTag, catchAll, orElse 等）
4. **可恢复性**：内置 retry、fallback、timeout 等恢复机制
5. **可测试性**：错误处理逻辑可独立测试

## 6. Effect 的依赖注入如何工作？

基于 Context 和 Tag 实现：

1. `Context.Tag` 定义服务标识（类型安全）
2. `Layer.succeed` 创建服务实现
3. `Layer.merge` 组合多个服务
4. `Effect.provide` 将依赖注入到 Effect 中

**优势：** 编译期检查依赖是否完整，无需运行时反射。

## 7. Effect.all 的并发策略有哪些？

- `{ concurrency: 1 }` — 串行执行
- `{ concurrency: 3 }` — 最多 3 个并发
- `{ concurrency: "unbounded" }` — 无限制并发
- 默认 — 根据 Effect 类型自动选择

## 8. Stream 的背压机制是什么？

Stream 的背压是消费者驱动的流量控制：

1. 消费者通过 Pull-based API 按需获取数据
2. 生产者只在消费者请求时生产数据
3. 慢消费者不会导致数据积压
4. 通过 Chunk 分块优化批量处理

## 9. Effect vs RxJS 的区别和选型？

| 维度 | Effect | RxJS |
|------|--------|------|
| 核心抽象 | Effect (单值) + Stream (多值) | Observable (多值) |
| 错误处理 | 类型系统编码 | 运行时处理 |
| 依赖注入 | 内置 Context/Layer | 无 |
| 资源管理 | Scope 机制 | 手动 unsubscribe |
| 取消机制 | Fiber 中断 | unsubscribe |
| 学习曲线 | 较陡 | 中等 |
| 适用场景 | 企业级后端、复杂业务编排 | 前端事件流、实时数据 |

**选型建议：** 后端服务、需要强类型错误处理和 DI 的项目选 Effect；前端 UI 事件流、实时数据管道选 RxJS。

## 10. Effect vs Zod 的优劣对比？

| 维度 | @effect/schema | Zod |
|------|---------------|-----|
| 类型推导 | 从 Schema 定义推导 TS 类型 | 从 Schema 定义推导 TS 类型 |
| 性能 | 更优（AST 级别优化） | 良好 |
| 转换 | 内置 AST 级别转换 | 需要手动 transform |
| 生态集成 | 与 Effect 深度集成 | 广泛（Express, tRPC 等） |
| 学习曲线 | 较陡 | 平缓 |
| 包体积 | 较大 | 较小 |

**选型建议：** 已使用 Effect 的项目选 @effect/schema；独立使用或需要广泛生态集成选 Zod。
