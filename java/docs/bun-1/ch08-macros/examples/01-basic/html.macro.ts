/**
 * html.macro.ts — 编译期 HTML 模板宏
 *
 * 在编译时将 HTML 字符串转换为预编译的模板函数，
 * 避免运行时重复解析 HTML 模板的开销。
 */

/**
 * 将 HTML 模板字符串编译为可重用的渲染函数。
 * 该函数在编译时执行，生成内联的 JavaScript 代码。
 *
 * @param strings - 模板字符串数组
 * @param ...keys - 插值键名
 * @returns 编译后的渲染函数代码字符串
 */
export function html(
  strings: TemplateStringsArray,
  ...keys: string[]
): string {
  // 在编译时执行：解析模板并生成优化的渲染代码
  const parts: string[] = []

  strings.forEach((str, i) => {
    // 转义 HTML 特殊字符以防止 XSS
    const escaped = str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

    parts.push(JSON.stringify(escaped))

    if (i < keys.length) {
      // 对于每个插值点，生成转义代码
      parts.push(`\${escapeHTML(${keys[i]})}`)
    }
  })

  // 生成编译后的渲染函数
  return `function(data) {
  const escapeHTML = (str) => String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return ${parts.join(" +\n    ")};
}`
}

/**
 * 编译期常量生成宏。
 * 在编译时将表达式求值并内联为常量。
 */
export function constant<T>(value: T): T {
  return value
}

/**
 * 编译期 UUID 生成宏。
 * 每次编译生成一个固定的 UUID，而非运行时生成。
 */
export function generateUUID(): string {
  // 使用 Bun 的 crypto 模块在编译时生成 UUID
  const { randomUUID } = require("crypto")
  return randomUUID()
}
