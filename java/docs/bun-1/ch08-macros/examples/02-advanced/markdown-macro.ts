/**
 * markdown-macro.ts — 编译期 Markdown 宏高级示例
 *
 * 演示：
 * 1. 编译时读取并转换 Markdown 文件
 * 2. 编译时内联配置文件
 * 3. 编译时读取 JSON 配置
 */

import { readMarkdown, readFile, readJSON } from "./markdown.macro" with { type: "macro" }

// ============================================================
// 示例 1: 编译期 Markdown 转 HTML
// ============================================================
console.log("=== 示例 1: 编译期 Markdown 转 HTML ===")

// 以下调用在编译时执行 readMarkdown()，
// 读取 ./content/readme.md 文件并将其转换为 HTML，
// 最终 HTML 字符串直接内联到打包后的代码中
const readmeHTML = readMarkdown("./content/readme.md")

console.log("编译转换后的 README HTML:")
console.log(readmeHTML)
console.log("")

// ============================================================
// 示例 2: 编译期 SQL 查询文件内联
// ============================================================
console.log("=== 示例 2: 编译期 SQL 查询文件内联 ===")

// 在编译时将 SQL 文件内容读取为字符串并内联
// 运行时无需读取文件系统
const getUserQuery = readFile("./sql/getUser.sql")
const listUsersQuery = readFile("./sql/listUsers.sql")

console.log("获取用户 SQL:")
console.log(getUserQuery)
console.log("")
console.log("用户列表 SQL:")
console.log(listUsersQuery)
console.log("")

// ============================================================
// 示例 3: 编译期 JSON 配置注入
// ============================================================
console.log("=== 示例 3: 编译期 JSON 配置注入 ===")

// 在编译时读取并解析 JSON 配置文件
// 配置对象直接内联到代码中
const appConfig = readJSON("./config/app.json")

console.log("应用配置:")
console.log(JSON.stringify(appConfig, null, 2))
console.log("")

// ============================================================
// 验证: 编译时文件读取
// ============================================================
console.log("=== 验证: 编译时文件读取 ===")

// 如果 readFile 在运行时执行，每次调用都会读取磁盘
// 但通过宏，文件内容在编译时就已经内联到代码中
console.log("以下内容在编译时已内联，运行时无 I/O 开销:")
console.log("---")
console.log(readFile("./content/notice.txt"))
console.log("---")
