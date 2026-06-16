/**
 * macro-basics.ts — 宏基础示例
 *
 * 演示 Bun Macros 的基本用法：
 * 1. 编译期 HTML 模板编译
 * 2. 编译期常量计算
 * 3. 编译期 UUID 生成
 */

// 使用 "macro" 后缀导入宏模块
// Bun 会在编译时执行这些导出函数，并将结果内联到代码中
import { html, constant, generateUUID } from "./html.macro" with { type: "macro" }

// ============================================================
// 示例 1: 编译期 HTML 模板编译
// ============================================================
console.log("=== 示例 1: 编译期 HTML 模板编译 ===")

// 以下调用在编译时执行 html() 函数，
// 返回预编译的渲染函数代码字符串，
// Bun 将其内联为普通函数定义
const renderUserCard = html`
  <div class="user-card">
    <h2>${"name"}</h2>
    <p>邮箱: ${"email"}</p>
    <p>角色: ${"role"}</p>
  </div>
`

// renderUserCard 在运行时是一个普通函数，无解析开销
const userHTML = renderUserCard({
  name: "张三",
  email: "zhangsan@example.com",
  role: "管理员",
})
console.log("用户卡片 HTML:")
console.log(userHTML)
console.log("")

// ============================================================
// 示例 2: 编译期常量计算
// ============================================================
console.log("=== 示例 2: 编译期常量计算 ===")

// constant() 宏在编译时求值并内联结果
// 运行时不存在函数调用开销
const appName = constant("Bun Macros Demo")
const version = constant("1.0.0")
const debugMode = constant(false)
const maxRetries = constant(3)

console.log(`应用名称: ${appName}`)
console.log(`版本: ${version}`)
console.log(`调试模式: ${debugMode}`)
console.log(`最大重试次数: ${maxRetries}`)

// 编译期复杂表达式求值
const computedValue = constant(
  [1, 2, 3, 4, 5]
    .filter((n) => n % 2 === 0)
    .reduce((a, b) => a + b, 0)
)
console.log(`编译期计算的偶数和: ${computedValue}`)
console.log("")

// ============================================================
// 示例 3: 编译期 UUID 生成
// ============================================================
console.log("=== 示例 3: 编译期 UUID 生成 ===")

// generateUUID() 宏在编译时生成一个 UUID
// 每次重新编译会生成新的 UUID，但在运行时保持不变
const sessionId = generateUUID()
const deploymentId = generateUUID()

console.log(`会话 ID (编译时生成): ${sessionId}`)
console.log(`部署 ID (编译时生成): ${deploymentId}`)
console.log("注意: 每次构建生成固定的 UUID，运行时不会变化")
console.log("")

// ============================================================
// 验证: 编译时执行 vs 运行时执行
// ============================================================
console.log("=== 验证: 编译时执行 ===")

// 如果 html() 在运行时执行，每次调用都会重新编译模板
// 但通过宏，模板在编译时只编译一次
console.log("多次调用 renderUserCard 复用编译结果:")
console.log(renderUserCard({ name: "李四", email: "lisi@example.com", role: "编辑" }))
console.log(renderUserCard({ name: "王五", email: "wangwu@example.com", role: "访客" }))
