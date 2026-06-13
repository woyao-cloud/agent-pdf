# 第6章 服务端渲染 (SSR)

## 6.1 SSR 概述

服务端渲染（Server-Side Rendering, SSR）是指在服务器端生成完整的 HTML 页面，再将渲染好的 HTML 发送给客户端。与客户端渲染（CSR）相比，SSR 具有以下优势：

**优点：**
- **更快的首屏加载**：用户无需等待 JavaScript 下载执行即可看到内容
- **更好的 SEO**：搜索引擎爬虫可以直接读取完整的 HTML 内容
- **更优的性能感知**：内容逐步呈现，用户体验更流畅

**缺点：**
- **服务器负载增加**：每次请求都需要服务器执行渲染
- **响应时间变长**：需要等待数据获取和渲染完成才能响应
- **复杂度提升**：需要处理 hydration、缓存等额外问题

React 18 引入了流式 SSR（Streaming SSR），通过 `renderToPipeableStream` 实现逐步发送 HTML，进一步优化了首屏加载体验。

## 6.2 React 18 流式 SSR

React 18 的 `renderToPipeableStream` 允许服务器将 HTML 分块发送给客户端，而不是等待整个页面渲染完成。

核心 API：

```tsx
import { renderToPipeableStream } from 'react-dom/server';

const { pipe, abort } = renderToPipeableStream(
  React.createElement(App, props),
  {
    onShellReady() {
      // HTML shell 就绪后立即开始发送
      pipe(res);
    },
    onError(err) {
      console.error('Render error:', err);
    },
  }
);
```

流式 SSR 的工作流程：
1. 服务器收到请求后立即开始渲染 HTML shell
2. `onShellReady` 触发后，将 shell 通过流发送给客户端
3. 剩余的内容逐步渲染并发送
4. 客户端逐步接收并展示内容

本项目的 `src/render.ts` 封装了两种渲染模式：
- `renderStream`：直接流式发送到 HTTP 响应
- `renderToString`：收集完整 HTML 字符串，适用于缓存场景

## 6.3 Express 集成

本项目使用 Express 作为 HTTP 服务器，将 SSR 渲染集成到路由处理中。

基本路由：

```ts
import express from 'express';
import { renderStream } from './render.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  const user = { name: 'Alice', email: 'alice@example.com' };
  const items = ['Item A', 'Item B', 'Item C'];
  renderStream({ user, items }, res);
});
```

关键集成点：
- 路由处理函数中准备数据（user、items）
- 调用 `renderStream` 将 React 组件渲染为 HTML 流
- Express 响应对象直接作为 `pipe` 的目标
- 流式响应自动设置 `Content-Type` 头

## 6.4 缓存策略

SSR 的性能瓶颈在于每次请求都需要重新渲染。缓存是缓解服务器压力的关键手段。

本项目实现双层缓存策略：

**应用层 LRU 缓存 (`src/cache.ts`)：**
- 使用 `lru-cache` 库，最多缓存 500 个页面
- TTL 设置为 5 分钟
- 适用于个性化页面（如 `/user/:id`）

```ts
const cache = new LRUCache<string, string>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

export function get(key: string): string | undefined {
  return cache.get(key);
}

export function set(key: string, value: string): void {
  cache.set(key, value);
}
```

**Nginx 反向代理缓存 (`nginx.conf`)：**
- 作为前置缓存层，缓存 SSR 输出的 HTML
- 缓存键基于 URL 和方法
- 200 响应缓存 5 分钟
- 通过 `X-Cache-Status` 响应头监控缓存命中情况

```nginx
proxy_cache ssr_cache;
proxy_cache_key "$scheme$request_method$host$request_uri";
proxy_cache_valid 200 5m;
proxy_cache_use_stale error timeout updating;
```

这种双层架构在 Nginx 层拦截大量重复请求，只有缓存未命中时才到达 Node.js 应用。

## 6.5 性能优化

SSR 性能优化涉及多个层面：

**1. 数据获取优化：**
- 在渲染前并行获取所有必要数据
- 使用数据加载器（Data Loader）避免 N+1 查询

**2. 组件拆分：**
- 将不重要的组件标记为 `Suspense` 边界
- 关键内容优先渲染，次要内容流式加载

**3. 缓存策略：**
- 对公共页面启用 CDN/代理缓存
- 对用户相关页面使用应用层 LRU 缓存
- 设置合理的 TTL 平衡新鲜度和性能

**4. 流式传输：**
- 利用 `renderToPipeableStream` 减少 TTFB
- 尽早发送 HTML shell，让客户端可以开始加载 CSS

**5. 资源优化：**
- 内联关键 CSS
- 延迟加载非关键 JavaScript
- 使用 `bootstrapScripts` 控制 hydration 脚本

## 6.6 静态资源处理

SSR 应用中需要正确处理静态资源，确保服务端和客户端渲染一致。

**资源文件分类：**
- CSS 样式文件
- 客户端 JavaScript 脚本
- 图片、字体等媒体资源
- React hydration 所需的 bootstrap 脚本

**处理策略：**
- 开发环境通过 `tsx` 热更新，静态资源由 Express 直接托管
- 生产环境由 Nginx 直接提供静态文件
- `renderToPipeableStream` 的 `bootstrapScripts` 参数指定 hydration 脚本

```ts
const { pipe } = renderToPipeableStream(
  React.createElement(App, options),
  {
    bootstrapScripts: ['/static/client.js'],
    onShellReady() {
      pipe(res);
    },
  }
);
```

## 6.7 部署架构

生产环境部署采用 Docker + Nginx 的组合架构。

**服务组件：**
- **SSR App**：Node.js + Express 应用，提供 SSR 渲染服务
- **Nginx**：反向代理 + 缓存层，负载均衡

**Docker Compose 配置：**
- `ssr-app` 服务：暴露 3000 端口，设置健康检查
- `nginx` 服务：暴露 8080 端口，配置缓存和反向代理

```yaml
services:
  ssr-app:
    build: .
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]

  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
```

**健康检查机制：**
- Docker 定期检查 SSR 应用的 `/` 路由
- Nginx 仅在应用健康后才开始转发流量
- 缓存过期后自动回源到 SSR 应用

## 6.8 常见问题

**Q1: SSR 渲染与客户端渲染不一致**
确保服务端和客户端使用相同的数据和组件版本。检查 hydration 时的警告信息。

**Q2: 缓存过期导致用户看到旧数据**
合理设置 TTL，对实时性要求高的页面使用更短的缓存时间或跳过缓存。

**Q3: 流式 SSR 导致 CSS 闪烁**
使用内联关键 CSS 或在 HTML shell 中预先加载样式表。

**Q4: 内存泄漏**
避免在渲染函数外部持有大型对象引用。定期监控 Node.js 进程的内存使用。

**Q5: 错误处理**
`renderToPipeableStream` 的 `onError` 回调必须处理渲染异常，保证服务器不崩溃。

```ts
onError(err) {
  console.error('SSR error:', err);
  res.statusCode = 500;
  res.end('<h1>Internal Server Error</h1>');
}
```