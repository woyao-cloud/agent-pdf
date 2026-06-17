import { Effect, pipe, Schema, Array, Record, Option } from "effect"

// ============================================================
// Effect 链拆分：将大型 Effect 链拆分为更小的可组合单元
// 这是提升 TypeScript 类型检查性能的关键技术
// ============================================================

// ─────────────────────────────────────────────
// BAD: 一个巨大的 Effect 管道
// ─────────────────────────────────────────────
// 当所有逻辑都写在一个 pipe 中时，TypeScript 需要为每一步推导完整的类型信息。
// 每一步的 Effect 类型签名都会叠加前一步的泛型参数，导致类型检查时间呈指数增长。

// 假设的数据类型
interface RawData { id: string; value: number }
interface ValidData { id: string; value: number; isValid: boolean }
interface TransformedData { id: string; displayValue: string; score: number }
interface EnrichedData { id: string; displayValue: string; score: number; metadata: Record<string, unknown> }
interface PersistedData { id: string; status: "saved" | "failed"; timestamp: number }

// 辅助函数（模拟实现）
const fetchData = (): RawData => ({ id: "1", value: 42 })
const validateData = (data: RawData): ValidData => ({ ...data, isValid: data.value > 0 })
const transformData = (data: ValidData): TransformedData => ({
  id: data.id,
  displayValue: `Value: ${data.value}`,
  score: data.value * 2,
})
const enrichData = (data: TransformedData): EnrichedData => ({
  ...data,
  metadata: { source: "api", version: "1.0" },
})
const persistData = (data: EnrichedData): PersistedData => ({
  id: data.id,
  status: "saved",
  timestamp: Date.now(),
})
const notifyUsers = (data: PersistedData): void => {
  console.log(`Data ${data.id} persisted at ${data.timestamp}`)
}
const handleError = (error: unknown): Effect.Effect<void> => {
  console.error("Error:", error)
  return Effect.void
}

// 不好的做法：一个巨大的 Effect 管道
// TypeScript 需要为每一步推导完整的类型链
const monolithicEffect = pipe(
  Effect.sync(() => fetchData()),
  Effect.flatMap(data => validateData(data)),
  Effect.flatMap(valid => transformData(valid)),
  Effect.flatMap(transformed => enrichData(transformed)),
  Effect.flatMap(enriched => persistData(enriched)),
  Effect.flatMap(persisted => notifyUsers(persisted)),
  Effect.catchAll(error => handleError(error))
)

// ─────────────────────────────────────────────
// GOOD: 拆分为命名的中间 Effect
// ─────────────────────────────────────────────
// 每个中间 Effect 都有明确的类型签名，TypeScript 可以在每个边界处完成类型推导。
// 这不仅提升了编译速度，还让代码更易于测试和复用。

// 第一步：获取并验证数据
// 类型签名明确：Effect<ValidData, Error, never>
const fetchAndValidate: Effect.Effect<ValidData, Error, never> = pipe(
  Effect.sync(() => fetchData()),
  Effect.flatMap(data => validateData(data))
)

// 第二步：转换并丰富数据
// 类型签名明确：Effect<EnrichedData, Error, never>
const transformAndEnrich = (valid: ValidData): Effect.Effect<EnrichedData, Error, never> => pipe(
  Effect.sync(() => transformData(valid)),
  Effect.flatMap(transformed => enrichData(transformed))
)

// 第三步：持久化并通知
// 类型签名明确：Effect<void, Error, never>
const persistAndNotify = (enriched: EnrichedData): Effect.Effect<void, Error, never> => pipe(
  Effect.sync(() => persistData(enriched)),
  Effect.flatMap(persisted => notifyUsers(persisted))
)

// 组合：将拆分后的 Effect 重新组合
// 现在 TypeScript 只需要检查三个 Effect 的类型签名，而不是六个嵌套的 flatMap
const splitEffect: Effect.Effect<void, Error, never> = pipe(
  fetchAndValidate,
  Effect.flatMap(transformAndEnrich),
  Effect.flatMap(persistAndNotify),
  Effect.catchAll(error => handleError(error))
)

// ─────────────────────────────────────────────
// 更实用的拆分模式
// ─────────────────────────────────────────────

// 模式1：使用 Effect.gen（生成器语法）
// Effect.gen 使用生成器函数，天然地将大型 Effect 链拆分为多个步骤
const genEffect = Effect.gen(function* () {
  const raw = yield* Effect.sync(() => fetchData())
  const valid = yield* Effect.sync(() => validateData(raw))
  const transformed = yield* Effect.sync(() => transformData(valid))
  const enriched = yield* Effect.sync(() => enrichData(transformed))
  const persisted = yield* Effect.sync(() => persistData(enriched))
  yield* Effect.sync(() => notifyUsers(persisted))
})

// 模式2：使用 do 语法（函数式风格）
const doEffect = Effect.Do.pipe(
  Effect.bind("raw", () => Effect.sync(() => fetchData())),
  Effect.bind("valid", ({ raw }) => Effect.sync(() => validateData(raw))),
  Effect.bind("transformed", ({ valid }) => Effect.sync(() => transformData(valid))),
  Effect.bind("enriched", ({ transformed }) => Effect.sync(() => enrichData(transformed))),
  Effect.bind("persisted", ({ enriched }) => Effect.sync(() => persistData(enriched))),
  Effect.map(({ persisted }) => notifyUsers(persisted))
)

// 模式3：使用管道操作符（|>）
// TypeScript 5.5+ 支持管道操作符，可以替代 pipe 函数
// const pipelineEffect = Effect.sync(() => fetchData())
//   |> Effect.flatMap(validateData)
//   |> Effect.flatMap(transformData)
//   |> Effect.flatMap(enrichData)
//   |> Effect.flatMap(persistData)
//   |> Effect.flatMap(notifyUsers)

// ─────────────────────────────────────────────
// 拆分策略总结
// ─────────────────────────────────────────────
// 1. 按职责拆分：每个 Effect 只做一件事
// 2. 添加类型注解：为每个中间 Effect 添加明确的类型签名
// 3. 使用 Effect.gen：生成器语法天然支持分步执行
// 4. 使用 Effect.Do：绑定模式可以清晰地表达数据流
// 5. 避免过度拆分：3-5 个步骤的链不需要拆分
