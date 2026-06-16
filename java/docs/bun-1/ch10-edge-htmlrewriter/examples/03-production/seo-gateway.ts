/**
 * SEO 反向代理网关
 *
 * 使用 HTMLRewriter 在反向代理过程中动态注入 SEO 元标签。
 * 适用于 SSG 静态站点或没有服务端渲染能力的 SPA。
 */

const TARGET = "https://example.com"; // 目标源站

/** 从请求路径推断页面标题 */
function inferTitle(pathname: string): string {
  const map: Record<string, string> = {
    "/": "首页 | MySite",
    "/about": "关于我们 | MySite",
    "/products": "产品中心 | MySite",
    "/blog": "博客 | MySite",
    "/contact": "联系我们 | MySite",
  };
  return map[pathname] || `${pathname.replace(/^\/|\/$/g, "").replace(/[-_]/g, " ")} | MySite`;
}

/** 从请求路径推断页面描述 */
function inferDescription(pathname: string): string {
  const map: Record<string, string> = {
    "/": "欢迎访问 MySite，我们提供优质的产品和服务。",
    "/about": "了解 MySite 的故事、使命和团队。",
    "/products": "浏览 MySite 的全系列产品和服务。",
    "/blog": "阅读 MySite 的最新博客文章和技术分享。",
    "/contact": "联系我们获取更多信息和支持。",
  };
  return map[pathname] || `${pathname} 页面 - MySite`;
}

class SEOInjector {
  private title: string;
  private description: string;
  private headProcessed = false;

  constructor(pathname: string) {
    this.title = inferTitle(pathname);
    this.description = inferDescription(pathname);
  }

  element(element: Element) {
    if (element.tagName === "title" && !this.headProcessed) {
      this.headProcessed = true;
      element.setInnerContent(this.title);
    }
    if (element.tagName === "meta" && !this.headProcessed) {
      const name = element.getAttribute("name");
      const property = element.getAttribute("property");
      if (name === "description" || property === "og:description") {
        element.setAttribute("content", this.description);
      }
    }
  }

  /** 在 </head> 前注入额外的 SEO 标签 */
  text(text: Text) {
    if (!this.headProcessed && text.text.includes("</head>")) {
      const seoTags = `
  <meta name="description" content="${this.description}">
  <meta property="og:title" content="${this.title}">
  <meta property="og:description" content="${this.description}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${this.title}">
  <meta name="twitter:description" content="${this.description}">
`;
      text.replace(seoTags + "</head>", "</head>");
      this.headProcessed = true;
    }
  }
}

Bun.serve({
  port: 8080,
  async fetch(req) {
    const url = new URL(req.url);
    const targetUrl = `${TARGET}${url.pathname}${url.search}`;

    try {
      const upstream = await fetch(targetUrl);
      const contentType = upstream.headers.get("content-type") || "";

      // 仅对 HTML 响应进行 SEO 注入
      if (contentType.includes("text/html")) {
        const rewriter = new HTMLRewriter();
        const injector = new SEOInjector(url.pathname);
        rewriter.on("title", injector);
        rewriter.on("meta", injector);
        rewriter.on("head", injector);

        const transformed = rewriter.transform(upstream);

        return new Response(transformed.body, {
          status: upstream.status,
          headers: {
            ...Object.fromEntries(upstream.headers.entries()),
            "x-seo-gateway": "injected",
          },
        });
      }

      // 非 HTML 资源直接透传
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch (err) {
      return new Response(`Gateway Error: ${err}`, { status: 502 });
    }
  },
});

console.log(`SEO Gateway running on http://localhost:8080`);
console.log(`Proxying to ${TARGET}`);
