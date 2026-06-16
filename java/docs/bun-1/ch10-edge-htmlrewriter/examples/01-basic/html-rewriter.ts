/**
 * 01-basic/html-rewriter.ts
 * =========================
 * HTMLRewriter 基础示例：流式修改 HTML 页面标题与链接
 *
 * 本示例演示 Bun 内置的 HTMLRewriter API，它采用流式 SAX 风格解析器，
 * 在数据流经时即时转换 HTML，无需构建 DOM 树，适合高吞吐的边缘场景。
 *
 * 运行：
 *   bun run examples/01-basic/html-rewriter.ts
 */

// ─── 1. 定义转换规则 ──────────────────────────────────────────────────────────

/**
 * 规则 1：修改 <title> 标签的内容
 * 使用 "title" 选择器匹配 <title> 元素
 */
class TitleHandler {
  element(element: Element) {
    // 清空原有内容并设置新标题
    element.setInnerContent("Bun HTMLRewriter 实战 - 边缘计算转换");
    console.log(`  [TitleHandler] 已修改 <title> 标签`);
  }
}

/**
 * 规则 2：为所有 <a> 链接添加 target="_blank" 和 rel="noopener"
 * 使用 "a" 选择器匹配所有 <a> 元素
 */
class LinkHandler {
  element(element: Element) {
    const href = element.getAttribute("href") || "(无 href)";
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
    // 为外部链接添加图标标记
    if (href.startsWith("http")) {
      element.append('<span class="external-icon">↗</span>', { html: true });
    }
    console.log(`  [LinkHandler] 处理链接: ${href} → 添加 target/rel/图标`);
  }
}

/**
 * 规则 3：修改 <h1> 标签内容
 */
class HeadingHandler {
  element(element: Element) {
    element.setInnerContent("Bun HTMLRewriter 与 WebSocket 边缘计算");
  }
}

// ─── 2. 构建测试 HTML ─────────────────────────────────────────────────────────

const originalHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>原始页面标题</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header>
    <h1>欢迎来到 Bun 教程</h1>
    <nav>
      <a href="/">首页</a>
      <a href="/about">关于</a>
      <a href="https://bun.sh/docs">Bun 官方文档</a>
      <a href="https://example.com">外部链接</a>
    </nav>
  </header>
  <main>
    <article>
      <h2>HTMLRewriter 特性</h2>
      <ul>
        <li>流式转换 — 无需等待完整 HTML 加载</li>
        <li>SAX 风格 — 低内存占用</li>
        <li>CSS 选择器 — 熟悉的语法</li>
        <li>边缘计算 — 类似 Cloudflare Workers</li>
      </ul>
      <p>了解更多请访问 <a href="https://bun.sh">Bun 官网</a>。</p>
    </article>
  </main>
  <footer>
    <p>&copy; 2026 Bun 教程</p>
  </footer>
</body>
</html>`;

// ─── 3. 使用 HTMLRewriter 进行转换 ────────────────────────────────────────────

async function transformHTML(html: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("title", new TitleHandler())
    .on("a", new LinkHandler())
    .on("h1", new HeadingHandler());

  // 方法 1：将 HTMLRewriter 与 Response 配合使用
  const response = rewriter.transform(
    new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );

  return await response.text();
}

// ─── 4. 方法 2：手动遍历 DOM 风格（流式处理文本） ─────────────────────────────

async function transformStreaming(html: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent("流式转换 - 通过 Response 管道");
      },
    })
    .on("a", {
      element(el) {
        const href = el.getAttribute("href");
        if (href && !href.startsWith("/")) {
          el.setAttribute("target", "_blank");
        }
      },
    });

  // 创建 ReadableStream 进行流式转换
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(html));
      controller.close();
    },
  });

  const response = rewriter.transform(
    new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );

  return await response.text();
}

// ─── 5. 方法 3：从文件读取并转换 ──────────────────────────────────────────────

import { file } from "bun";

async function transformFromFile(filePath: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent("从文件读取 - HTMLRewriter 转换");
      },
    })
    .on("img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !src.startsWith("https://")) {
          el.setAttribute("src", `https://cdn.example.com${src}`);
          console.log(`  [CDN] 重写图片路径: ${src}`);
        }
      },
    });

  const response = rewriter.transform(
    new Response(file(filePath), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );

  return await response.text();
}

// ─── 6. 动手试试 ──────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("📄 HTMLRewriter 基础示例");
  console.log("=".repeat(60);

  console.log("\n【原始 HTML】");
  console.log("-".repeat(40));
  console.log(originalHTML.substring(0, 200) + "...\n");

  console.log("\n【方法 1：Response 转换】");
  console.log("-".repeat(40));
  const transformed1 = await transformHTML(originalHTML);
  console.log(transformed1);

  console.log("\n【方法 2：流式转换】");
  console.log("-".repeat(40));
  const transformed2 = await transformStreaming(originalHTML);
  console.log(transformed2.substring(0, 300) + "...\n");

  console.log("\n【方法 3：从文件转换（Bun.file）】");
  console.log("-".repeat(40));
  // 使用自身文件作为演示 — 实际场景中应为 .html 文件
  // 此处使用原始 HTML 字符串演示
  console.log("（实际场景可使用 Bun.file('index.html') 读取文件进行转换）\n");

  console.log("\n✅ HTMLRewriter 示例完成！");
  console.log("=".repeat(60);
}

main().catch(console.error);
