/**
 * app.ts — 生产环境应用入口
 *
 * 使用编译期宏注入构建时配置和数据库配置。
 * 通过 bun build 打包后，所有配置值都已内联，
 * 运行时不再读取环境变量。
 */

import { env, buildConfig, dbConfig } from "./config.macro" with { type: "macro" }

// ============================================================
// 编译时配置注入
// ============================================================

// 以下 env() 宏调用在编译时执行，
// 读取构建时的环境变量并内联结果
const nodeEnv = env("NODE_ENV", "development")
const appPort = env("APP_PORT", "3000")
const appHost = env("APP_HOST", "0.0.0.0")

// buildConfig() 宏生成完整的应用配置对象
const config = buildConfig()
const db = dbConfig()

// ============================================================
// 应用启动
// ============================================================

console.log("=== 应用启动配置 ===")
console.log(`运行环境: ${nodeEnv}`)
console.log(`监听地址: ${appHost}:${appPort}`)
console.log("")

console.log("=== 完整构建配置 ===")
console.log(JSON.stringify(config, null, 2))
console.log("")

console.log("=== 数据库配置 ===")
// 注意：密码在编译时内联，但编译后的代码中也会包含
// 实际生产环境应使用构建密钥管理系统
const safeDb = { ...db, password: "***" }
console.log(JSON.stringify(safeDb, null, 2))
console.log("")

// ============================================================
// 模拟服务器启动
// ============================================================

console.log("=== 启动信息 ===")
console.log(`[${config.buildTime}] 应用 v${config.buildVersion} 启动中...`)
console.log(`环境: ${config.buildEnvironment}`)
console.log(`API 地址: ${config.apiBaseUrl}`)
console.log(`超时设置: ${config.apiTimeout}ms`)

// 根据编译时确定的特性开关启动功能
if (config.features.enableAnalytics) {
  console.log("分析功能: 已启用")
}

if (config.features.enableNewDashboard) {
  console.log("新版仪表盘: 已启用")
}

console.log("")
console.log("应用启动完成！")

// 导出配置供其他模块使用
export { config, db, nodeEnv, appPort, appHost }
