/**
 * markdown.macro.ts — 编译期 Markdown 转换宏
 *
 * 在编译时将 Markdown 文件读取并转换为 HTML，
 * 避免运行时解析 Markdown 的开销，同时支持
 * 编译时静态资源内联。
 */

/**
 * 在编译时读取并解析 Markdown 文件。
 * 使用 bun:ffi 或 Node.js 的 fs 模块在编译时执行文件读取。
 *
 * @param filePath - Markdown 文件路径（相对于项目根目录）
 * @returns 编译后的 HTML 字符串
 */
export function readMarkdown(filePath: string): string {
  // 以下代码在编译时执行（Bun 的宏运行时环境）
  const fs = require("fs")
  const path = require("path")

  // 解析文件路径
  const resolvedPath = path.resolve(process.cwd(), filePath)

  // 读取 Markdown 文件内容
  const markdown = fs.readFileSync(resolvedPath, "utf-8")

  // 简单的 Markdown 到 HTML 转换
  // 在实际项目中，可以使用 marked、remark 等库
  const html = convertMarkdownToHtml(markdown)

  return html
}

/**
 * 编译时读取文件内容为纯文本（不做转换）。
 * 适用于内联配置文件、SQL 查询等。
 */
export function readFile(filePath: string): string {
  const fs = require("fs")
  const path = require("path")
  const resolvedPath = path.resolve(process.cwd(), filePath)
  return fs.readFileSync(resolvedPath, "utf-8")
}

/**
 * 编译时读取 JSON 配置文件并返回解析后的对象。
 * 常用于注入构建时配置。
 */
export function readJSON(filePath: string): Record<string, unknown> {
  const fs = require("fs")
  const path = require("path")
  const resolvedPath = path.resolve(process.cwd(), filePath)
  const content = fs.readFileSync(resolvedPath, "utf-8")
  return JSON.parse(content)
}

/**
 * 简单 Markdown 到 HTML 转换器。
 * 支持基础语法：标题、段落、粗体、斜体、代码块、列表、链接、图片。
 */
function convertMarkdownToHtml(md: string): string {
  let html = md

  // 转义 HTML 特殊字符
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // 代码块 (```code```)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="language-${lang || "plaintext"}">${code.trim()}</code></pre>`
  )

  // 行内代码 (`code`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // 标题 (## 标题)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // 粗体 (**text**) 和斜体 (*text*)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // 图片 (![alt](url))
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" />'
  )

  // 链接 ([text](url))
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  )

  // 无序列表 (- item)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")

  // 有序列表 (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
  html = html.replace(
    /(<li>.*<\/li>\n?)+/g,
    (match) => `<ol>${match}</ol>`
  )

  // 段落（连续非空行）
  html = html.replace(/^(?!<[hou])<p>(.+)$/gm, "<p>$1</p>")

  // 水平线
  html = html.replace(/^---$/gm, "<hr />")

  // 换行
  html = html.replace(/\n\n/g, "\n")

  return html.trim()
}
