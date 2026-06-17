import { Effect, pipe, Schema, Array, Record, Option, Either, Tuple, Struct } from "effect"

// ============================================================
// 过度工程化检测器
// 识别并修复导致类型爆炸的过度工程化模式
// ============================================================

// ─────────────────────────────────────────────
// 模式1：过多的类型参数
// ─────────────────────────────────────────────

// 过度工程化：5个类型参数，大多数从未使用
interface OverEngineered<
  T extends readonly unknown[],
  R = never,
  E = never,
  K extends keyof any = string,
  V = unknown,
  M = Record<K, V>
> {
  data: T
  context: R
  error: E
  metadata: M
  transform: (t: T[number]) => V
}

// 简化版：只保留真正需要的类型参数
interface SimpleProcessor<T, V> {
  data: readonly T[]
  transform: (item: T) => V
}

// ─────────────────────────────────────────────
// 模式2：嵌套的泛型约束
// ─────────────────────────────────────────────

// 过度工程化：4层嵌套的条件类型
// 每次嵌套都创建新的类型分支，导致类型检查时间呈指数增长
type DeepGeneric<T> = T extends Record<string, infer V>
  ? V extends Array<infer U>
    ? U extends { id: infer Id }
      ? Id extends string
        ? { ids: Id[]; items: U[] }
        : never
      : never
  : never
  : never

// 简化版：扁平结构，使用接口而非条件类型
interface ProcessedData<U extends { id: string }> {
  ids: string[]
  items: U[]
}

// ─────────────────────────────────────────────
// 模式3：过度包装的 Effect 函数
// ─────────────────────────────────────────────

// 过度工程化：接受6个泛型参数的 Effect 组合函数
// 每个泛型参数都需要 TypeScript 进行类型推导
const overEngineeredEffect = <A, B, C, D, E, F>(
  a: Effect.Effect<A>,
  b: (a: A) => Effect.Effect<B>,
  c: (b: B) => Effect.Effect<C>,
  d: (c: C) => Effect.Effect<D>,
  e: (d: D) => Effect.Effect<E>,
  f: (e: E) => Effect.Effect<F>
): Effect.Effect<F> =>
  pipe(a, Effect.flatMap(b), Effect.flatMap(c), Effect.flatMap(d), Effect.flatMap(e), Effect.flatMap(f))

// 简化版：直接使用 pipe 和 flatMap
// 不需要额外的包装函数
const step1 = (): Effect.Effect<number> => Effect.succeed(1)
const step2 = (n: number): Effect.Effect<string> => Effect.succeed(`Number: ${n}`)
const step3 = (s: string): Effect.Effect<number> => Effect.succeed(s.length)

const simpleChain = pipe(
  step1(),
  Effect.flatMap(step2),
  Effect.flatMap(step3)
)

// ─────────────────────────────────────────────
// 模式4：过度使用泛型约束
// ─────────────────────────────────────────────

// 过度工程化：不必要的泛型约束
function processData<
  T extends Record<string, unknown>,
  K extends keyof T,
  V extends T[K]
>(obj: T, key: K, value: V): T {
  return { ...obj, [key]: value }
}

// 简化版：使用 unknown 类型，减少泛型参数
function processDataSimple(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  return { ...obj, [key]: value }
}

// ─────────────────────────────────────────────
// 模式5：过度使用类型体操
// ─────────────────────────────────────────────

// 过度工程化：用类型系统实现运行时逻辑
type StringToNumber<T extends string> = T extends `${infer N extends number}` ? N : never
type AddOne<T extends number> = [...Array<T>, 1]["length"] extends infer L ? L extends number ? L : never : never
type Fibonacci<T extends number> = T extends 0 ? 0 : T extends 1 ? 1 : AddOne<Fibonacci<Subtract<T, 1>>>

// 简化版：运行时实现
function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// ─────────────────────────────────────────────
// 模式6：过度使用联合类型
// ─────────────────────────────────────────────

// 过度工程化：大型联合类型
type HttpMethod =
  | "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE"

// 简化版：使用 const 对象
const HttpMethods = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
} as const

type HttpMethodSimple = keyof typeof HttpMethods

// ─────────────────────────────────────────────
// 模式7：过度使用映射类型
// ─────────────────────────────────────────────

// 过度工程化：多层映射类型
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P] extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T[P]
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P]
}

type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object
    ? DeepRequired<T[P]>
    : T[P]
}

// 简化版：只使用一层映射
type SimpleReadonly<T> = {
  readonly [P in keyof T]: T[P]
}

// ─────────────────────────────────────────────
// 过度工程化检测清单
// ─────────────────────────────────────────────

interface EngineeringAudit {
  pattern: string
  severity: "critical" | "warning" | "info"
  description: string
  recommendation: string
}

const auditChecklist: EngineeringAudit[] = [
  {
    pattern: "过多泛型参数",
    severity: "critical",
    description: "函数或接口有超过3个泛型参数",
    recommendation: "减少泛型参数数量，使用具体类型替代",
  },
  {
    pattern: "嵌套条件类型",
    severity: "critical",
    description: "条件类型嵌套超过2层",
    recommendation: "使用接口或类型别名扁平化",
  },
  {
    pattern: "递归类型",
    severity: "warning",
    description: "类型定义中引用了自身",
    recommendation: "限制递归深度，使用具体类型替代",
  },
  {
    pattern: "大型联合类型",
    severity: "warning",
    description: "联合类型成员超过5个",
    recommendation: "使用 const 对象或枚举替代",
  },
  {
    pattern: "过度包装",
    severity: "info",
    description: "为简单的操作创建了包装函数",
    recommendation: "直接使用标准库函数",
  },
  {
    pattern: "类型体操",
    severity: "info",
    description: "在类型系统中实现运行时逻辑",
    recommendation: "将逻辑移到运行时实现",
  },
]

// ─────────────────────────────────────────────
// 最佳实践总结
// ─────────────────────────────────────────────
// 1. 类型参数不超过3个
// 2. 条件类型嵌套不超过2层
// 3. 避免递归类型
// 4. 联合类型成员不超过5个
// 5. 不要用类型系统实现运行时逻辑
// 6. 优先使用接口而非类型别名
// 7. 使用 satisfies 而非 as 断言
// 8. 为公共 API 添加明确的类型注解
