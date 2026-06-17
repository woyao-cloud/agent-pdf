import { Effect, pipe, Schema, Array, Record, Option, Either, Tuple } from "effect"
import { Duration } from "effect"

// ============================================================
// 类型爆炸分析器
// 用于测量和分析 TypeScript 类型检查性能的工具
// ============================================================

// ─────────────────────────────────────────────
// 复杂的泛型类型（导致类型检查变慢的典型模式）
// ─────────────────────────────────────────────

// 模式1：过多泛型参数
// 每个泛型参数都会增加类型检查器的搜索空间
interface ComplexConfig<A, B, C, D> {
  input: A
  transformer: (a: A) => B
  validator: (b: B) => Either.Either<C, Error>
  fallback: D
  options: Record<string, unknown>
}

// 模式2：递归类型导致类型爆炸
// 递归类型在每次展开时都会创建新的类型节点
type DeepPipeline<T, N extends number> = N extends 0
  ? T
  : DeepPipeline<readonly T[], Subtract<N, 1>>

// 辅助类型：数字减法（用于递归类型）
type Subtract<N extends number, M extends number> = N extends M ? 0 : N extends (M | infer R) ? R extends number ? R : 0 : 0

// ─────────────────────────────────────────────
// 类型检查时间测量工具
// ─────────────────────────────────────────────

// 运行时测量类型检查时间
// 注意：这只能测量运行时性能，不能直接测量编译时类型检查时间
// 但通过观察运行时行为，可以间接推断类型检查的复杂度
const measureTypeCheck = <A, E, R>(
  label: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.tap(effect, () =>
    Effect.sync(() => {
      console.time(label)
      // 强制类型检查：通过访问结果触发完整的类型推导
      console.timeEnd(label)
    })
  )

// ─────────────────────────────────────────────
// 类型爆炸演示：复杂泛型管道
// ─────────────────────────────────────────────

// 不好的做法：在单个 pipe 中连续进行多次 map 操作
// 每次 map 都会创建新的中间类型，导致类型呈指数级增长
const complexPipeline = pipe(
  Effect.sync(() => [1, 2, 3] as const),
  Effect.map(arr => arr.map(n => ({ n, label: `num-${n}` }))),
  Effect.map(items => items.map(i => ({ ...i, doubled: i.n * 2 }))),
  Effect.map(items => items.map(i => ({ ...i, squared: i.n ** 2 }))),
  Effect.map(items => items.map(i => ({ ...i, isEven: i.n % 2 === 0 }))),
  Effect.map(items => items.map(i => ({ ...i, category: i.n > 2 ? "large" : "small" }))),
  Effect.map(items => items.map(i => ({ ...i, tags: [`tag-${i.n}`] }))),
  Effect.map(items => items.map(i => ({ ...i, priority: i.n === 1 ? "high" : "low" }))),
  Effect.map(items => items.map(i => ({ ...i, score: i.n * 1.5 }))),
  Effect.map(items => items.map(i => ({ ...i, rank: i.n > 2 ? "A" : "B" })))
)

// ─────────────────────────────────────────────
// 优化版本：使用中间类型注解
// ─────────────────────────────────────────────

// 定义明确的中间类型接口
// 这些接口为 TypeScript 提供了明确的类型检查边界
interface Item {
  n: number
  label: string
}

interface EnrichedItem extends Item {
  doubled: number
}

interface FinalItem extends EnrichedItem {
  squared: number
  isEven: boolean
}

// 优化后的管道：每个步骤都有明确的类型注解
// TypeScript 可以在每个 Effect.map 边界处完成类型推导
const optimizedPipeline = pipe(
  Effect.sync(() => [1, 2, 3] as const),
  Effect.map((arr): Item[] => arr.map(n => ({ n, label: `num-${n}` }))),
  Effect.map((items): EnrichedItem[] => items.map(i => ({ ...i, doubled: i.n * 2 }))),
  Effect.map((items): FinalItem[] => items.map(i => ({ ...i, squared: i.n ** 2, isEven: i.n % 2 === 0 })))
)

// ─────────────────────────────────────────────
// 类型爆炸分析工具
// ─────────────────────────────────────────────

// 分析类型复杂度的工具函数
// 通过统计泛型参数的数量来估算类型检查的复杂度
class TypeExplosionAnalyzer {
  private typeCounts: Map<string, number> = new Map()

  // 记录一个类型的复杂度
  recordType(label: string, complexity: number): void {
    this.typeCounts.set(label, complexity)
  }

  // 分析泛型类型的复杂度
  analyzeGenericType<T extends Record<string, unknown>>(
    label: string,
    obj: T
  ): number {
    const complexity = this.calculateComplexity(obj)
    this.recordType(label, complexity)
    return complexity
  }

  // 计算对象的类型复杂度
  private calculateComplexity(obj: Record<string, unknown>): number {
    let complexity = 0
    for (const [key, value] of Object.entries(obj)) {
      complexity += 1
      if (typeof value === "object" && value !== null) {
        complexity += this.calculateComplexity(value as Record<string, unknown>)
      }
      if (Array.isArray(value)) {
        complexity += value.length * 2
      }
    }
    return complexity
  }

  // 生成分析报告
  generateReport(): void {
    console.log("\n=== Type Explosion Analysis Report ===")
    console.log("Type Complexity Scores (higher = more complex):")
    console.log("----------------------------------------")

    const sorted = Array.from(this.typeCounts.entries())
      .sort((a, b) => b[1] - a[1])

    for (const [label, complexity] of sorted) {
      const severity = complexity > 50 ? "CRITICAL" : complexity > 20 ? "WARNING" : "OK"
      console.log(`${severity}: ${label} (complexity: ${complexity})`)
    }
  }
}

// ─────────────────────────────────────────────
// 实际使用示例
// ─────────────────────────────────────────────

const analyzer = new TypeExplosionAnalyzer()

// 分析简单类型
analyzer.analyzeGenericType("SimpleConfig", {
  input: "string",
  transformer: (a: string) => a.length,
})

// 分析复杂类型
analyzer.analyzeGenericType("ComplexConfig", {
  input: { id: "1", data: [1, 2, 3] },
  transformer: (a: { id: string; data: number[] }) => a.data,
  validator: Either.right("valid"),
  fallback: { message: "fallback" },
  options: { debug: true, timeout: 5000 },
})

// 生成报告
analyzer.generateReport()

// ─────────────────────────────────────────────
// 类型爆炸的常见模式与解决方案
// ─────────────────────────────────────────────

// 模式1：嵌套的条件类型
// 问题：每次条件判断都会创建新的类型分支
type NestedConditional<T> = T extends string
  ? T extends `${infer U}${infer V}`
    ? V extends `${infer X}${infer Y}`
      ? { first: U; second: X; rest: Y }
      : { first: U; rest: V }
    : { raw: T }
  : T extends number
    ? T extends 0 ? "zero" : "non-zero"
    : T extends boolean
      ? T extends true ? "yes" : "no"
      : "unknown"

// 解决方案：减少嵌套层级
type FlatConditional<T> =
  T extends `${infer U}${infer V}${infer W}`
    ? { first: U; second: V; rest: W }
    : T extends `${infer U}${infer V}`
      ? { first: U; rest: V }
      : T extends string
        ? { raw: T }
        : T extends number
          ? T extends 0 ? "zero" : "non-zero"
          : T extends boolean
            ? T extends true ? "yes" : "no"
            : "unknown"

// 模式2：过多的联合类型
// 问题：联合类型在条件类型中会展开为所有可能的分支
type LargeUnion =
  | { type: "a"; data: string }
  | { type: "b"; data: number }
  | { type: "c"; data: boolean }
  | { type: "d"; data: null }
  | { type: "e"; data: undefined }
  | { type: "f"; data: symbol }
  | { type: "g"; data: bigint }
  | { type: "h"; data: object }

// 解决方案：使用 discriminated union 并限制条件类型的展开
type ProcessLargeUnion<T extends LargeUnion> = T extends { type: infer K }
  ? { key: K; value: T["data"] }
  : never

// ─────────────────────────────────────────────
// 总结
// ─────────────────────────────────────────────
// 类型爆炸的主要原因：
// 1. 过多的泛型参数（3个以上开始影响性能）
// 2. 递归类型（每次展开都增加类型节点）
// 3. 嵌套的条件类型（分支数量呈指数增长）
// 4. 大型联合类型（条件类型会展开所有分支）
// 5. 深层 pipe 链（每一步都叠加泛型参数）
//
// 优化策略：
// 1. 减少泛型参数数量
// 2. 使用明确的类型注解作为断点
// 3. 拆分大型条件类型
// 4. 使用接口而非联合类型
// 5. 使用 satisfies 关键字
