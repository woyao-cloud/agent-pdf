import { Effect, pipe, Schema, Array, Record, Option } from "effect"

// ============================================================
// 类型实例化过深（Type instantiation is excessively deep）
// 这是 Effect-TS 开发中最常见的 TypeScript 编译器错误之一
// ============================================================

// ─────────────────────────────────────────────
// BAD: 深层嵌套的 pipe 导致类型爆炸
// ─────────────────────────────────────────────
// 当 pipe 中串联了过多操作时，TypeScript 需要为每一步推导中间类型。
// 每一步都会在前一步的类型基础上叠加新的泛型参数，导致类型呈指数级增长。
// 最终 TypeScript 会抛出 "Type instantiation is excessively deep and possibly infinite" 错误。

const badExample = pipe(
  [1, 2, 3, 4, 5],
  Array.map(n => n * 2),
  Array.filter(n => n > 5),
  Array.map(n => ({ value: n, label: `Item ${n}` })),
  Array.filter(item => item.value % 2 === 0),
  Array.map(item => ({ ...item, doubled: item.value * 2 })),
  // 继续添加更多操作会迅速达到类型检查的深度限制
)

// ─────────────────────────────────────────────
// GOOD: 拆分为更小的函数并添加类型注解
// ─────────────────────────────────────────────
// 核心策略：将长 pipe 拆分为多个命名函数，每个函数都有明确的类型注解。
// 这样 TypeScript 可以在每个函数边界处"重置"类型推导，避免类型膨胀。

// 第一步：处理数字（过滤和映射）
const processNumbers = (numbers: number[]) =>
  pipe(
    numbers,
    Array.map(n => n * 2),
    Array.filter(n => n > 5)
  )

// 第二步：转换项目（添加元数据）
const transformItems = (items: Array<{ value: number; label: string }>) =>
  pipe(
    items,
    Array.map(item => ({ ...item, doubled: item.value * 2 })),
    Array.filter(item => item.value % 2 === 0)
  )

// 组合：将拆分后的函数重新组合
const goodExample = pipe(
  [1, 2, 3, 4, 5],
  processNumbers,
  transformItems
)

// ─────────────────────────────────────────────
// 使用 satisfies 作为类型断点
// ─────────────────────────────────────────────
// TypeScript 5.3+ 引入的 satisfies 关键字可以在 pipe 中间作为"类型断点"使用。
// 它告诉编译器："检查这个表达式是否满足该类型约束"，从而给编译器一个重置点。

const withBreakpoint = pipe(
  [1, 2, 3, 4, 5],
  Array.map(n => n * 2),
  // satisfies 作为类型断点：TypeScript 在此处检查 arr 是否满足 number[] 约束
  // 这给了编译器一个"检查点"，避免类型继续膨胀
  ((arr: number[]) => arr satisfies number[]),
  Array.filter(n => n > 5)
)

// ─────────────────────────────────────────────
// 更实用的 satisfies 用法
// ─────────────────────────────────────────────
// 在复杂的 Schema 定义中使用 satisfies 来限制类型范围

const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

// 使用 satisfies 确保类型符合预期，同时保留最具体的类型信息
type User = Schema.Schema.Type<typeof UserSchema>
//    ^? { id: string; name: string; age: number; email: string }

// ─────────────────────────────────────────────
// 类型断点的其他技巧
// ─────────────────────────────────────────────

// 技巧1：使用明确的类型注解作为断点
const withExplicitType = pipe(
  [1, 2, 3, 4, 5],
  Array.map(n => n * 2),
  // 显式类型注解：告诉 TypeScript 这个变量的确切类型
  (nums: number[]): number[] => nums,
  Array.filter(n => n > 5)
)

// 技巧2：使用 as 断言（谨慎使用，可能隐藏类型错误）
const withAsAssertion = pipe(
  [1, 2, 3, 4, 5],
  Array.map(n => n * 2),
  // as 断言：强制类型转换，会丢失类型检查
  (nums) => nums as number[],
  Array.filter(n => n > 5)
)

// 技巧3：使用中间变量（最安全的方式）
const mapped = [1, 2, 3, 4, 5].map(n => n * 2)
// mapped: number[] — TypeScript 在此处完成类型推导
const filtered = mapped.filter(n => n > 5)
// filtered: number[] — 新的类型推导起点

// ─────────────────────────────────────────────
// 性能对比总结
// ─────────────────────────────────────────────
// 方法                     | 类型安全性 | 编译速度 | 推荐场景
// ─────────────────────────────────────────────
// 长 pipe（不拆分）         | 高        | 慢      | 小型项目
// 拆分函数 + 类型注解      | 高        | 快      | 中型项目
// satisfies 断点           | 高        | 中      | 需要保留精确类型
// 显式类型注解             | 高        | 快      | 大型项目
// as 断言                  | 低        | 最快    | 性能敏感区域
// 中间变量                 | 高        | 快      | 任何场景
