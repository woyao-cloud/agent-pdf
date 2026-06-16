# 第十四章 Web 框架的「Bun 化」

## 目录

- [第十四章 Web 框架的「Bun 化」](#第十四章-web-框架的bun-化)
  - [目录](#目录)
  - [概述](#概述)
  - [使用场景](#使用场景)
    - [轻量级 REST API（Hono）](#轻量级-rest-apihono)
    - [端到端类型安全（Elysia）](#端到端类型安全elysia)
    - [从 Express / Fastify 迁移到 Bun](#从-express--fastify-迁移到-bun)
    - [Serverless 函数](#serverless-函数)
    - [全栈应用（前端 + API）](#全栈应用前端--api)
  - [实现原理](#实现原理)
    - [Hono Web Standard 适配器](#hono-web-standard-适配器)
    - [Elysia 类型系统：TypeScript 推导 + 运行时校验](#elysia-类型系统typescript-推导--运行时校验)
    - [Bun.serve 与 Node.js HTTP 性能对比](#bunserve-与-nodejs-http-性能对比)
    - [中间件模型对比：Express 回调链 vs Hono 异步链](#中间件模型对比express-回调链-vs-hono-异步链)
    - [Elysia 的生命周期钩子系统](#elysia-的生命周期钩子系统)
  - [风险与优化](#风险与优化)
    - [Express 兼容性问题（req/res 差异）](#express-兼容性问题reqres-差异)
    - [较小框架生态系统](#较小框架生态系统)
    - [热重载配置](#热重载配置)
    - [性能调优](#性能调优)
    - [生产环境部署注意事项](#生产环境部署注意事项)
  - [典型问题处理](#典型问题处理)
    - [Express 中间件无法工作](#express-中间件无法工作)
    - [Elysia 类型错误](#elysia-类型错误)
    - [路由无法匹配](#路由无法匹配)
    - [性能未达预期](#性能未达预期)
    - [Hono 请求体解析失败](#hono-请求体解析失败)
    - [CORS 配置问题](#cors-配置问题)
  - [必备知识](#必备知识)
    - [Web 框架核心概念](#web-框架核心概念)
      - [路由（Routing）](#路由routing)
      - [中间件（Middleware）](#中间件middleware)
      - [请求处理（Request Handling）](#请求处理request-handling)
    - [高级 TypeScript：泛型与条件类型](#高级-typescript泛型与条件类型)
      - [泛型基础](#泛型基础)
      - [条件类型](#条件类型)
      - [模板字面量类型](#模板字面量类型)
    - [HTTP/1.1 vs HTTP/2](#http11-vs-http2)
    - [RESTful API 设计](#restful-api-设计)
    - [Schema 验证与 TypeBox](#schema-验证与-typebox)
  - [本章小结](#本章小结)

## 概述

随着 Bun 运行时环境的不断成熟，越来越多的 Web 框架开始原生支持 Bun 或专门为 Bun 构建。Web 框架的「Bun 化」指的是将传统 Web 框架的工作方式适配到 Bun 运行时，或者利用 Bun 的特性构建全新的 Web 框架。本章深入探讨这一趋势的核心概念、技术原理和实践方法。

Bun 运行时提供了与 Web Standard API 高度兼容的底层基础设施，包括 `Request`、`Response`、`Fetch` 等标准接口。这意味着任何基于 Web Standard 构建的框架都可以在 Bun 上无缝运行。同时，Bun 内置的 TypeScript 转译器、高速包管理器、原生 SQLite 支持和 Bun.serve HTTP 服务器，为 Web 框架提供了传统 Node.js 环境所不具备的性能优势。

本章涵盖三个主要框架示例：

1. **Hono** — 超轻量级 Web 框架，基于 Web Standard，专注于性能和开发体验
2. **Elysia** — 端到端类型安全的 Web 框架，利用 TypeScript 类型系统实现编译期验证
3. **Bun.serve 原生** — 不依赖任何框架，直接使用 Bun 内置 HTTP 服务器

通过本章的学习，你将掌握如何在 Bun 环境下选择合适的 Web 框架，理解各框架的设计哲学和实现原理，以及如何在实际项目中应用这些框架构建高效、类型安全的 Web 应用。

## 使用场景

### 轻量级 REST API（Hono）

Hono 是一个极简主义的 Web 框架，它的设计目标是在保持轻量的同时提供出色的性能。Hono 的核心压缩后仅有约 14KB，却支持完整的路由、中间件、验证等功能。这使得 Hono 成为构建轻量级 REST API 的理想选择。

**典型应用场景：**

微服务架构中的单个服务。在微服务架构中，每个服务通常只负责有限的业务功能，不需要完整的 MVC 框架。Hono 的轻量特性使其非常适合这种场景。例如，一个用户认证服务只需要处理登录、注册、令牌刷新等少数几个端点，使用 Hono 可以将服务镜像大小控制在极低水平。

边缘计算和 CDN Worker。Hono 的 Web Standard 兼容性使其可以部署在各种边缘计算平台上，包括 Cloudflare Workers、Deno Deploy、Bun 等。同样的代码可以跨平台运行，无需修改。这对于需要全球低延迟的应用场景尤为重要。

BFF（Backend For Frontend）层。在前端应用中，经常需要一个后端代理层来聚合多个后端 API、处理认证、格式化响应等。Hono 的轻量和灵活性使其成为构建 BFF 层的理想选择。

简单的 CRUD 应用。对于不需要复杂业务逻辑的 CRUD 应用，Hono 提供了恰到好处的抽象层次。开发者可以快速搭建 RESTful API，同时保持代码的简洁和可维护性。

**Hono 的核心优势：**

Hono 的性能非常出色。它的路由匹配算法使用 Trie 树结构，时间复杂度为 O(n)，其中 n 为 URL 路径段数，与注册路由数量无关。这意味着即使注册了数千个路由，单个请求的匹配时间也保持恒定。

Hono 的中间件模型基于 Web Standard 的异步链式调用，这与 Express 的回调链模型有本质区别。异步链的优势在于中间件可以轻松处理异步操作（如数据库查询、外部 API 调用），而不会阻塞其他请求。

Hono 的 API 设计简洁直观。它使用 `c.req` 和 `c.json` 等简短的命名，减少了样板代码。同时，Hono 提供了丰富的内置中间件，包括 CORS、认证、压缩、日志、限流等，覆盖了大部分常见需求。

**代码示例分析：**

在 `examples/01-basic/hono-app.ts` 中，我们实现了一个完整的待办事项 CRUD API。这个示例展示了 Hono 的核心用法：

```typescript
const app = new Hono();
app.use("*", cors());
app.use("*", logger());
```

全局中间件注册使用通配符路径 `*`，表示对所有路由生效。cors 中间件处理跨域请求，logger 中间件记录请求日志。

```typescript
app.get("/todos", (c) => {
  const completedParam = c.req.query("completed");
  if (completedParam === undefined) return c.json(todos);
  return c.json(todos.filter((t) => t.completed === completed === "true"));
});
```

路由处理器接收 `Context` 对象 `c`，通过 `c.req.query()` 获取查询参数。Hono 的类型推导能够自动推断返回值类型。

```typescript
app.post("/todos", async (c) => {
  const body = await c.req.json<Pick<Todo, "title">>();
  if (!body.title || typeof body.title !== "string") {
    return c.json({ error: "title is required" }, 400);
  }
  // ...
  return c.json(todo, 201);
});
```

POST 路由使用 `async/await` 处理异步请求体解析。`c.req.json()` 接受可选的泛型参数用于类型标注。状态码通过 `c.json()` 的第二个参数指定。

```typescript
export default { port, fetch: app.fetch };
```

最后导出 `fetch` 处理器，使应用兼容 Bun.serve 的接口规范。这是 Hono 作为 Web Standard 框架的关键特性——它本质上是 `(Request) => Response` 函数的增强版本。

### 端到端类型安全（Elysia）

Elysia 是一个专为 Bun 构建的 Web 框架，其核心设计理念是「端到端类型安全」。这意味着从路由定义到请求处理，再到响应返回，整个流程都在 TypeScript 类型系统的保护之下。类型错误在编译期就被捕获，而不是在运行时才暴露。

**典型应用场景：**

API 优先的开发流程。在团队协作中，API 契约的维护是一个常见痛点。Elysia 通过类型系统将 API 契约编码到代码中，前端和后端团队可以共享类型定义，确保双方对 API 的理解一致。

复杂业务逻辑系统。当业务逻辑涉及多种实体和复杂关系时，类型系统可以帮助开发者避免常见错误。例如，订单系统中的商品信息、用户信息、支付信息的组合操作，Elysia 的类型检查可以在编译期发现字段名称错误、类型不匹配等问题。

OpenAPI 文档自动生成。Elysia 的内置 OpenAPI 插件可以根据路由定义自动生成 Swagger 文档，减少了文档维护的工作量。这对于需要对外提供 API 文档的服务尤其有价值。

高可靠性要求的服务。在金融、医疗等对数据准确性要求极高的领域，类型安全可以显著降低运行时错误率。Elysia 的编译期校验 + 运行时校验的双重保障，提供了业界领先的可靠性。

**Elysia 的类型系统实现：**

Elysia 的类型安全体系建立在三个层次之上：

第一层是 TypeScript 编译期类型检查。Elysia 利用 TypeScript 的高级类型特性（泛型、条件类型、模板字面量类型）来推导路由参数、请求体和响应体的类型。当开发者定义路由时，Elysia 自动提取 schema 定义中的类型信息，并将其关联到路由处理器的参数和返回值。

第二层是运行时 schema 验证。Elysia 使用 TypeBox（一个基于 JSON Schema 的运行时验证库）来执行实际的请求验证。当请求到达时，Elysia 会根据路由对应的 schema 验证请求体、查询参数和路径参数。如果验证失败，Elysia 自动返回格式化的错误响应。

第三层是响应体类型保证。Elysia 允许开发者为每个响应状态码定义独立的响应 schema。框架会在编译期检查处理器返回的数据是否符合对应状态码的 schema 定义。

**代码示例分析：**

在 `examples/02-advanced/elysia-app.ts` 中，我们展示了 Elysia 的类型安全特性：

```typescript
const TodoSchema = t.Object({
  id: t.Number(),
  title: t.String({ minLength: 1, maxLength: 200 }),
  completed: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
});
```

使用 Elysia 内置的 `t` 对象定义 schema。`t.Object` 定义对象结构，每个字段使用对应的类型函数定义约束条件。`t.String({ minLength: 1, maxLength: 200 })` 表示字符串长度在 1 到 200 之间。

```typescript
.get(
  "/todos/:id",
  ({ params: { id }, set }) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) { set.status = 404; return { error: "Not Found" }; }
    return todo;
  },
  {
    params: IdParamSchema,
    response: {
      200: TodoSchema,
      404: t.Object({ error: t.String() }),
    },
  }
)
```

路由的第三个参数是配置对象，包含 `params`、`query`、`body`、`response` 等 schema 定义。Elysia 根据这些 schema 自动推导处理器的参数类型，并在运行时执行验证。`response` 字段可以按状态码分别定义响应体结构。

```typescript
const UpdateTodoSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    completed: t.Boolean(),
  })
);
```

`t.Partial` 类似于 TypeScript 的 `Partial<T>` 工具类型，将所有字段标记为可选。这种组合方式使得 schema 定义具有良好的可组合性。

```typescript
.onRequest(({ request }) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
})
```

Elysia 使用生命周期钩子替代传统中间件。`onRequest` 和 `onResponse` 分别在请求处理前后触发，提供了更细粒度的控制。

### 从 Express / Fastify 迁移到 Bun

Express 是 Node.js 生态中最流行的 Web 框架，但它的设计基于 Node.js 的回调模型，与 Bun 的 Web Standard 兼容性存在差异。Fastify 虽然性能优于 Express，但其插件系统和 schema 验证机制依赖于 Node.js 特有的 API。迁移到 Bun 需要考虑以下方面：

**迁移策略一：使用兼容层。** 一些工具和库提供了 Express API 的 Bun 兼容实现。例如，`bun:http` 模块提供了与 `node:http` 相似的接口，使得部分 Express 应用可以直接在 Bun 上运行。然而，这种方法存在局限性：并非所有 Express 中间件都能正常工作，特别是一些依赖于 Node.js 核心模块内部行为的中间件。

**迁移策略二：逐步替换中间件。** 对于大型项目，一次性完全迁移风险较高。推荐采用逐步迁移策略：首先确保应用可以在 Bun 上运行，然后逐个替换中间件为 Bun 原生或兼容版本。在替换过程中，保持新旧中间件并行运行，通过 A/B 测试验证功能正确性。

**迁移策略三：重写为 Hono 或 Elysia。** 对于中小型项目，直接重写为 Hono 或 Elysia 可能是最彻底的方案。Hono 提供了 `@hono/node-server` 适配器，可以在迁移过程中作为过渡方案使用。Elysia 的 API 设计现代且类型安全，长期维护成本更低。

**关键差异对比：**

路由定义方式。Express 使用 `app.get(path, handler)` 的回调模式，中间件通过 `next()` 函数传递控制权。Hono 和 Elysia 使用更现代的异步链式调用，中间件通过返回 `Response` 或 `void` 来控制流程。

请求对象。Express 的 `req` 对象是 Node.js `http.IncomingMessage` 的扩展，包含大量自定义属性和方法。Bun 使用 Web Standard 的 `Request` 对象，API 更简洁但功能较少。例如，Express 的 `req.ip`、`req.path`、`req.query` 等便捷属性在 Web Standard 中需要通过 URL 对象手动获取。

响应对象。Express 的 `res` 对象提供了 `res.json()`、`res.send()`、`res.status()` 等链式方法。Bun 的 Web Standard 使用 `Response` 对象的构造函数或静态方法。Hono 通过 Context 对象提供了与 Express 类似的便捷 API。

中间件生态。Express 拥有庞大的中间件生态系统，而 Hono 和 Elysia 的生态相对较小。在迁移过程中，可能需要寻找替代品或自行实现某些功能。

**迁移清单：**

1. 检查所有依赖的兼容性。运行 `bun run your-app.js` 测试基本运行能力。
2. 替换 Node.js 核心模块的使用。使用 `import { ... } from "bun:..."` 替代 `require("...")`。
3. 更新环境变量读取方式。使用 `Bun.env` 替代 `process.env`。
4. 调整文件系统操作。使用 Bun 的 `Bun.file()` 和 `Bun.write()` API。
5. 检查异步操作。确保所有回调风格的代码都已转换为 Promise 或 async/await。
6. 测试中间件兼容性。逐个测试中间件在 Bun 环境下的行为。
7. 性能基准测试。迁移前后进行性能对比，验证性能提升。
8. 监控和日志适配。确保日志和监控系统在 Bun 环境下正常工作。

### Serverless 函数

Bun 的快速启动时间和低内存占用使其成为 Serverless 运行时的理想选择。许多 Serverless 平台已经开始支持 Bun，或者提供了 Bun 运行时选项。

**使用 Hono 构建 Serverless 函数：**

Hono 的 Web Standard 兼容性使其天然适合 Serverless 环境。在 Serverless 平台上，函数通常接收 `Request` 对象并返回 `Response` 对象，这与 Hono 的 `fetch` 处理器完全一致。

```typescript
// Lambda 风格的 Hono 处理器
const app = new Hono();
app.get("/api/users", async (c) => {
  const users = await db.query("SELECT * FROM users");
  return c.json(users);
});

// 导出为 Serverless handler
export const handler = async (event: any) => {
  const request = new Request(
    `http://localhost${event.path}`,
    { method: event.httpMethod, headers: event.headers, body: event.body }
  );
  return app.fetch(request);
};
```

**Elysia 在 Serverless 环境中的优势：**

Elysia 的类型安全特性在 Serverless 环境中尤为重要。由于 Serverless 函数通常是独立的、无状态的服务，API 契约的清晰度直接影响函数的可维护性。Elysia 的 schema 定义同时作为请求验证和 API 文档，减少了 Serverless 函数的文档编写和维护工作。

**Bun.serve 原生 Serverless：**

对于极简场景，可以直接使用 Bun.serve 构建 Serverless 函数。这种方式没有框架开销，启动时间最短，内存占用最低。

```typescript
// 直接使用 Bun.serve 作为 Serverless 入口
const server = Bun.serve({
  port: 3000,
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      // 自定义路由逻辑
    }
    return new Response("Not Found", { status: 404 });
  },
});
```

### 全栈应用（前端 + API）

Bun 不仅可以运行后端 API，还可以构建全栈应用。通过 Bun 的静态文件服务能力，可以将前端构建产物与后端 API 部署在同一个进程中。

**Hono 全栈示例：**

```typescript
import { serveStatic } from "hono/bun";
import { Hono } from "hono";

const app = new Hono();

// API 路由
app.route("/api", apiRouter);

// 静态文件服务 — 服务于前端构建产物
app.use("/*", serveStatic({ root: "./dist" }));

// SPA 回退 — 所有非 API 请求返回 index.html
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default { port: 3000, fetch: app.fetch };
```

这种架构简化了部署拓扑，减少了运维复杂度。前端和后端共享同一个端口和进程，无需配置反向代理。

**Bun.serve 原生全栈：**

```typescript
Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    // API 路由
    if (url.pathname.startsWith("/api/")) {
      return handleAPI(request);
    }

    // 静态文件
    const file = Bun.file(`./dist${url.pathname}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA 回退
    return new Response(Bun.file("./dist/index.html"));
  },
});
```

直接使用 Bun.serve 的全栈应用没有框架开销，性能最优。但需要自行处理路由、中间件、错误处理等功能，适用于对性能要求极高、逻辑相对简单的场景。

## 实现原理

### Hono Web Standard 适配器

Hono 的核心设计理念是「基于 Web Standard」。这意味着 Hono 的整个 API 都构建在 Web 标准接口之上，包括 `Request`、`Response`、`URL`、`Headers` 等。这一设计选择带来了跨平台兼容性和性能优势。

**Web Standard 适配层的架构：**

Hono 的架构可以分为三个层次：

底层是 Web Standard API。这是 Hono 的根基，包括 `Request`、`Response`、`Headers`、`URL`、`ReadableStream` 等标准接口。这些接口在 Bun、Deno、Cloudflare Workers 等现代运行时中都有原生实现。

中间层是 Hono 的抽象层。Hono 在 Web Standard API 之上构建了一套便捷的抽象，包括 Context 对象、路由匹配器、中间件链等。Context 对象封装了请求和响应的处理逻辑，提供了 `c.req`、`c.json`、`c.text`、`c.html` 等便捷方法。

最上层是运行时适配器。Hono 提供了多个运行时适配器，用于将 Hono 应用适配到不同的运行时环境。这些适配器负责将运行时的请求对象转换为 Web Standard 的 Request 对象，并将 Hono 的 Response 对象转换为运行时的响应格式。

**Hono 的运行时适配器包括：**

- `hono/bun` — Bun 运行时适配器
- `hono/node-server` — Node.js 运行时适配器（使用 `node:http`）
- `hono/cloudflare-workers` — Cloudflare Workers 适配器
- `hono/deno` — Deno 运行时适配器
- `hono/lambda` — AWS Lambda 适配器
- `hono/vercel` — Vercel 适配器

这种多平台支持使得 Hono 成为「一次编写，到处运行」的理想选择。

**Hono 的内部实现：**

Hono 的路由匹配使用 Trie 树（字典树）数据结构。当应用启动时，Hono 将所有注册的路由插入到 Trie 树中。当请求到达时，Hono 使用请求的 URL 路径在 Trie 树中查找匹配的路由。Trie 树的查找时间复杂度为 O(k)，其中 k 为路径段数，与路由总数无关。

Hono 的中间件模型基于函数组合。中间件是一个接收 Context 对象并返回 `Promise<Response | void>` 的函数。Hono 将中间件和路由处理器组合成一个函数链，请求依次通过每个中间件，最终到达路由处理器。中间件可以通过不调用 `next()` 来短路请求处理。

Hono 的 Context 对象是请求处理的核心。每个请求都会创建一个新的 Context 实例，包含请求信息、响应设置和状态管理。Context 对象的设计是 Hono 性能优化的关键——它避免了对请求和响应对象的频繁操作。

**Bun 环境下 Hono 的特殊优化：**

在 Bun 环境下，Hono 可以直接使用 Bun 的原生 API 进行优化。例如：

1. `Bun.file()` 用于静态文件服务，利用 Bun 的文件系统缓存提升性能
2. `Bun.write()` 用于响应写入，避免不必要的内存复制
3. `Bun.sleep()` 用于延迟处理，比 `setTimeout` 更高效
4. `Bun.peek()` 用于检查 Promise 状态，实现同步短路优化

Hono 的 `hono/bun` 适配器将这些优化集成到框架中，使得 Hono 在 Bun 上的性能优于在 Node.js 上的性能。

### Elysia 类型系统：TypeScript 推导 + 运行时校验

Elysia 的类型系统是其最显著的特性，它将 TypeScript 编译期类型检查与运行时 schema 验证结合起来，提供了双重安全保障。

**TypeScript 类型推导机制：**

Elysia 利用 TypeScript 的高级类型特性来实现类型推导。其核心机制是泛型参数的链式传递。

当开发者定义路由时：

```typescript
app.get("/todos/:id", ({ params: { id } }) => { ... }, { params: IdParamSchema });
```

Elysia 的 `get` 方法是一个泛型函数，其类型参数从第三个参数的 schema 定义中提取。TypeScript 编译器根据 `IdParamSchema` 的类型定义，自动推导出 `params` 参数的类型。如果处理器的参数类型与 schema 定义不匹配，TypeScript 会在编译期报错。

这一机制的原理是 Elysia 定义了一系列复杂的泛型类型，包括：

- `RouteSchema` — 路由配置的类型定义，包含 params、query、body、response 等字段
- `RouteHandler` — 路由处理器的类型定义，其参数类型根据 RouteSchema 推导
- `ElysiaApp` — 应用实例的类型定义，记录所有已注册路由的类型信息

这些泛型类型通过条件类型和映射类型实现灵活的推导逻辑。例如：

```typescript
// 简化的推导逻辑
type InferParams<T> = T extends { params: infer P } ? P : {};
type InferQuery<T> = T extends { query: infer Q } ? Q : {};
type InferBody<T> = T extends { body: infer B } ? B : {};

type HandlerParams<T> = {
  params: InferParams<T>;
  query: InferQuery<T>;
  body: InferBody<T>;
};
```

当路由处理器被调用时，TypeScript 编译器检查处理器的参数类型是否与推导出的类型兼容。如果 `IdParamSchema` 定义了 `id: t.Numeric()`，TypeScript 会推导出 `params.id` 的类型为 `number`。如果处理器尝试将 `params.id` 当作字符串使用，TypeScript 会报错。

**运行时验证机制：**

Elysia 的运行时验证基于 TypeBox 库，TypeBox 是一个基于 JSON Schema 的运行时验证工具。TypeBox 的核心功能是：

1. 从 TypeScript 类型生成 JSON Schema
2. 使用 JSON Schema 验证运行时数据
3. 提供类型安全的 API 用于定义 schema

当请求到达 Elysia 应用时，框架会执行以下验证步骤：

1. 路径参数验证：检查 URL 路径参数是否符合 schema 定义。例如，如果 schema 定义 `id` 为 `t.Numeric()`，Elysia 会验证路径中的 id 参数是否可以转换为数字。

2. 查询参数验证：检查 URL 查询字符串中的参数是否符合 schema 定义。Elysia 支持可选参数、默认值、枚举值等高级验证规则。

3. 请求体验证：解析请求体（JSON 格式），并验证其结构是否符合 schema 定义。验证失败时，Elysia 返回格式化的错误响应，包含详细的验证错误信息。

4. 响应体验证：在开发模式或测试环境下，Elysia 可以验证响应体是否符合 schema 定义。这有助于在开发阶段发现响应格式不匹配的问题。

**双重验证的协同工作：**

编译期类型检查和运行时验证各有优劣。编译期检查可以发现逻辑错误和类型不匹配，但无法验证动态输入（如用户提交的表单数据）。运行时验证可以确保输入数据的合法性和完整性，但只能在运行时发现问题。

Elysia 的双重验证机制将两者的优势结合起来：

- 编译期检查确保代码逻辑的类型正确性
- 运行时验证确保输入数据的合法性
- 两者共同确保端到端的数据完整性

**Elysia 的 Schema 类型体系：**

Elysia 的 `t` 对象提供了丰富的 schema 类型函数，覆盖了常见的数据验证需求：

```typescript
// 基本类型
t.String()       // 字符串
t.Number()       // 数字
t.Boolean()      // 布尔值
t.Integer()      // 整数
t.Null()         // null
t.Any()          // 任意类型

// 复合类型
t.Object({...})  // 对象
t.Array(T)       // 数组
t.Union([A, B])  // 联合类型
t.Intersect([A, B]) // 交叉类型

// 实用类型
t.Partial(T)     // 所有字段可选
t.Required(T)    // 所有字段必填
t.Pick(T, [...]) // 选择部分字段
t.Omit(T, [...]) // 排除部分字段

// 约束条件
t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z]+$" })
t.Number({ minimum: 0, maximum: 100, exclusiveMaximum: true })
t.Integer({ multipleOf: 2 })
```

每个 schema 类型函数都返回一个 TypeBox 类型对象，同时包含 TypeScript 类型信息和运行时验证规则。这使得同一个 schema 定义可以同时用于类型推导和运行时验证。

### Bun.serve 与 Node.js HTTP 性能对比

Bun.serve 是 Bun 内置的 HTTP 服务器，它的性能显著优于 Node.js 的 `http` 模块。这种性能差异源于底层技术实现的根本不同。

**Bun.serve 的架构：**

Bun.serve 使用 WebKit 的 JavaScriptCore 引擎的底层网络库实现。JavaScriptCore 的网络栈经过了深度优化，特别适合处理高并发 HTTP 请求。与 Node.js 的 libuv 事件循环不同，Bun 使用一种称为「任务驱动」的并发模型，减少了线程切换和锁竞争的开销。

Bun.serve 的核心组件包括：

1. HTTP 解析器：使用 WebKit 内置的高性能 HTTP 解析器，比 Node.js 的 `llhttp` 解析器更快
2. TLS/SSL 处理：集成 WebKit 的 TLS 实现，支持 ALPN、SNI 等高级特性
3. 连接管理：使用 epoll（Linux）或 kqueue（macOS）实现高效的 I/O 事件管理
4. 内存分配器：使用 mimalloc 替代传统的 malloc，减少内存碎片和分配开销

**性能对比关键指标：**

请求处理延迟。在相同的硬件条件下，Bun.serve 的处理延迟通常比 Node.js 低 30% 到 50%。这意味着每个请求的处理时间更短，用户体验更好。

吞吐量。Bun.serve 的吞吐量通常是 Node.js 的 2 到 4 倍。这得益于 Bun 更高效的并发模型和更少的内存复制操作。

内存使用。在处理相同数量的并发连接时，Bun.serve 的内存使用量通常比 Node.js 低 40% 到 60%。这对于内存受限的环境（如容器化部署）尤为重要。

连接数。Bun.serve 可以同时处理更多的并发连接。在测试中，Bun.serve 能够轻松处理超过 10 万并发连接，而 Node.js 在高并发场景下会出现性能瓶颈。

**性能差异的技术原因：**

语言实现。Node.js 的 HTTP 模块主要用 JavaScript 实现，部分核心组件使用 C++ 编写。Bun 的 HTTP 服务器主要用 Zig 编写，Zig 是一种系统编程语言，具有接近 C 语言的性能，同时提供了更好的内存安全性。

事件循环。Node.js 使用 libuv 实现事件循环，这是一个跨平台的异步 I/O 库。Bun 使用 JavaScriptCore 的事件循环，它与 JavaScriptCore 的垃圾回收器和 JIT 编译器紧密集成，减少了跨语言调用的开销。

系统调用优化。Bun.serve 在系统调用层面进行了大量优化。例如，它使用 `sendfile` 系统调用来发送文件，避免了数据在用户空间和内核空间之间的多次复制。Node.js 在早期版本中不支持 `sendfile`，虽然新版本已经添加了支持，但实现不如 Bun 高效。

连接缓冲。Bun.serve 使用智能缓冲策略，根据连接类型和负载动态调整缓冲区大小。Node.js 使用固定大小的缓冲区，在高负载下可能导致缓冲区溢出或内存浪费。

**基准测试分析：**

在 `examples/03-production/framework-bench.ts` 中，我们实现了一个框架基准测试工具。该工具在同一个进程中对比不同框架的处理性能，避免了网络延迟等外部因素的影响。

测试工具的核心设计：

1. 初始化阶段：创建每个框架的应用实例，预热处理器
2. 测试阶段：对每个框架执行指定次数的 GET 和 POST 请求，记录总耗时
3. 分析阶段：计算平均处理时间和每秒请求数，生成对比报告

测试中的关键考量：

预处理。测试前执行预热请求，确保 JIT 编译器已经完成优化编译，避免预热偏差影响测试结果。

请求多样性。测试同时包含 GET 请求（轻量、无请求体解析）和 POST 请求（包含 JSON 解析），覆盖不同类型的处理负载。

公平对比。每个框架实现相同的路由逻辑，确保对比的是框架本身的开销，而不是业务逻辑的差异。

**测试结果解读：**

一般来说，测试结果会显示以下趋势：

Bun.serve 原生性能最优，因为没有框架层的开销。所有请求处理都直接在底层 HTTP 处理器中完成，没有额外的路由匹配、中间件处理等步骤。

Hono 性能接近 Bun.serve 原生。Hono 的 Trie 树路由匹配和轻量级 Context 对象设计使其开销极低。在大多数场景下，Hono 的开销可以忽略不计。

Elysia 性能略低于 Hono。Elysia 的额外开销主要来自 schema 验证和类型推导。但考虑到类型安全带来的好处，这种开销通常是可接受的。

Express 兼容层性能最低。Express 的回调链模型和中间件管理机制导致更多的函数调用和上下文切换，性能开销较大。

### 中间件模型对比：Express 回调链 vs Hono 异步链

中间件是 Web 框架的核心组件之一，它允许开发者在请求处理管道中插入自定义逻辑。不同的框架采用不同的中间件模型，这些模型影响着框架的性能、可组合性和开发体验。

**Express 的回调链模型：**

Express 使用基于回调的中间件模型。中间件是一个接收 `req`、`res` 和 `next` 参数的函数。`next` 是一个回调函数，用于将控制权传递给下一个中间件。

```typescript
// Express 中间件示例
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next(); // 传递控制权
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});
```

Express 中间件模型的特点：

1. 基于回调。控制权通过 `next()` 回调函数传递。中间件必须显式调用 `next()` 才能将请求传递给下一个中间件或路由处理器。

2. 错误处理。Express 支持四参数错误处理中间件 `(err, req, res, next)`。当任何中间件或路由处理器抛出异常时，Express 会跳过所有普通中间件，直接调用错误处理中间件。

3. 同步优先。虽然 Express 中间件可以包含异步操作，但 `next()` 的调用时机需要开发者自行管理。如果 `next()` 在异步操作之前被调用，请求处理可能在异步操作完成之前就结束了。

4. 顺序执行。中间件按照注册顺序依次执行。一旦某个中间件调用了 `next()`，控制权就完全交给了下一个中间件，无法回退。

Express 回调链模型的局限性：

- 回调地狱：复杂的中间件组合可能导致多层嵌套的回调
- 异步处理困难：需要手动确保 `next()` 在异步操作完成后调用
- 错误处理不直观：错误处理中间件的匹配规则较为复杂
- 类型推导困难：Express 的 `req` 和 `res` 对象在中间件链中可能被修改，TypeScript 无法精确追踪类型变化

**Hono 的异步链模型：**

Hono 使用基于 Promise 的异步链模型。中间件是一个接收 Context 对象并返回 `Promise<Response | void>` 的函数。控制权通过 `await next()` 或 `c.next()` 传递。

```typescript
// Hono 中间件示例
app.use("*", async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  await next(); // 传递控制权（异步）
  console.log(`${c.req.method} ${c.req.url} → ${c.res.status}`);
});

app.onError((err, c) => {
  console.error(err);
  return c.text("Something broke!", 500);
});
```

Hono 异步链模型的特点：

1. 基于 Promise。控制权通过 `await next()` 传递。中间件可以等待异步操作完成后继续执行。

2. 前后钩子。在 `await next()` 之前和之后的代码分别在路由处理器执行前后执行。这使得日志记录、性能监控等操作变得简单。

3. 响应短路。中间件可以直接返回 `Response` 对象来短路请求处理，后续中间件和路由处理器都不会执行。

4. 类型安全。Hono 的 Context 对象提供类型安全的方法，TypeScript 可以精确追踪请求和响应对象的类型变化。

Hono 异步链模型的优势：

- 异步友好：Promise 原生支持异步操作，无需手动管理回调
- 清晰的执行顺序：`await next()` 前后的代码提供了清晰的「前处理」和「后处理」边界
- 错误处理统一：通过 `app.onError()` 统一处理所有错误，无需在中间件中手动捕获异常
- 类型推导完善：Context 对象的设计使 TypeScript 可以精确追踪类型变化

**两种模型的性能对比：**

Express 回调链的函数调用开销略低于 Hono 的 Promise 链，因为 Promise 的创建和解析有一定的开销。但在现代 JavaScript 引擎中，这种差异通常可以忽略不计（微秒级别）。

Hono 异步链的优势在于可预测的执行顺序和更少的调试困难。Express 回调链中，如果某个中间件忘记调用 `next()`，请求会被挂起，而这种错误很难调试。Hono 的 Promise 链中，如果中间件不调用 `await next()`，请求会直接返回，行为更加可预测。

**中间件组合模式的对比：**

Express 的组合模式。Express 的中间件通过 `app.use()` 注册，可以指定路径前缀来控制中间件的作用范围。例如，`app.use("/api", apiMiddleware)` 只对以 `/api` 开头的路径生效。Express 还支持 `app.use(router)` 将路由分组到 Router 实例中。

Hono 的组合模式。Hono 提供了类似的机制，但更加灵活。`app.use()` 支持通配符路径匹配。Hono 还支持 `app.route()` 用于路由分组，以及 `app.basePath()` 用于设置全局路径前缀。

Elysia 的组合模式。Elysia 使用 `app.use()` 和 `app.group()` 来组织路由。Elysia 还支持插件系统，可以将一组路由封装为插件，然后在不同的应用中复用。

**选择中间件模型的考量：**

选择中间件模型时，需要考虑以下因素：

- 团队熟悉度：如果团队有 Express 经验，迁移到 Hono 的学习成本较低
- 异步操作频率：如果应用大量使用异步操作（数据库查询、外部 API 调用等），Hono 的异步链模型更适合
- 错误处理需求：如果应用需要精细的错误处理，Hono 的 `onError` 和 `onNotFound` 提供了更清晰的方案
- 性能要求：对于极端性能要求，Bun.serve 原生模式（无框架）是最优选择
- 类型安全要求：如果需要严格的类型安全，Elysia 是最佳选择

### Elysia 的生命周期钩子系统

Elysia 的生命周期钩子系统是其架构的核心组成部分。与传统的中间件模型不同，Elysia 使用一系列定义良好的生命周期钩子来处理请求，每个钩子在请求处理管道的特定阶段触发。

**Elysia 的生命周期阶段：**

Elysia 的请求处理管道包含以下阶段，按执行顺序排列：

1. `onRequest` — 请求到达时触发。这是最早的生命周期钩子，在路由匹配之前执行。适用于全局请求日志、跨域处理、请求头修改等操作。

2. `onParse` — 请求体解析时触发。在默认情况下，Elysia 自动解析 JSON 请求体。`onParse` 钩子允许开发者自定义解析逻辑，例如解析 XML 或 form-data 格式的请求体。

3. `onBeforeHandle` — 路由处理器执行前触发。适用于认证检查、权限验证、参数预处理等操作。如果钩子返回响应，则路由处理器不会执行。

4. 路由处理器 — 实际的业务逻辑执行。根据 HTTP 方法和路径匹配对应的处理器。

5. `onAfterHandle` — 路由处理器执行后触发。适用于响应格式转换、数据加密、响应头添加等操作。

6. `onResponse` — 响应发送前触发。这是最后一个生命周期钩子，适用于全局响应日志、响应时间统计等操作。

7. `onError` — 错误处理。当任何阶段抛出异常时触发。适用于统一错误格式化、错误日志记录等操作。

8. `onNotFound` — 路由未匹配时触发。适用于自定义 404 响应、路由回退等操作。

**生命周期钩子的注册方式：**

```typescript
const app = new Elysia()
  .onRequest(({ request }) => {
    console.log(`[Request] ${request.method} ${request.url}`);
  })
  .onParse(({ request, contentType }) => {
    if (contentType === "application/xml") {
      return parseXML(request); // 自定义 XML 解析
    }
  })
  .onBeforeHandle(({ set }) => {
    // 认证检查
    const token = extractToken(request);
    if (!token) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .get("/api/data", () => {
    return { message: "Protected data" };
  })
  .onAfterHandle(({ response }) => {
    // 添加响应头
    return { ...response, processed: true };
  })
  .onResponse(({ request, set }) => {
    console.log(`[Response] ${request.method} ${request.url} → ${set.status}`);
  })
  .onError(({ error, set }) => {
    console.error(error);
    set.status = 500;
    return { error: "Internal Server Error" };
  })
  .onNotFound(() => {
    return { error: "Not Found" };
  });
```

**生命周期钩子的执行顺序控制：**

Elysia 允许开发者为钩子指定优先级，通过 `priority` 选项控制同类型钩子的执行顺序。数字越小，优先级越高，越先执行。

```typescript
app.onRequest(
  { priority: 10 },
  ({ request }) => { /* 先执行 */ }
);
app.onRequest(
  { priority: 20 },
  ({ request }) => { /* 后执行 */ }
);
```

**生命周期钩子 vs 传统中间件：**

与传统的「洋葱圈」中间件模型相比，Elysia 的生命周期钩子系统有以下区别：

更细粒度的控制。传统中间件模型在请求进入和响应返回时提供两个控制点。Elysia 的生命周期钩子提供了八个控制点，允许开发者在请求处理管道的任意阶段插入自定义逻辑。

更清晰的语义。每个生命周期钩子都有明确的语义和触发时机。开发者可以根据钩子的名称了解其用途，无需深入理解中间件链的执行机制。

更好的性能。Elysia 的生命周期钩子只在需要时注册和触发，避免了传统中间件模型中的函数链遍历开销。未注册的钩子不会对性能产生影响。

更容易的类型推导。每个生命周期钩子都有类型安全的参数。Elysia 可以在编译期检查钩子参数的使用是否正确，减少了运行时错误的可能性。

## 风险与优化

### Express 兼容性问题（req/res 差异）

从 Express 迁移到 Bun 原生框架时，最大的挑战是 `req` 和 `res` 对象的差异。Express 对 Node.js 原生的 `http.IncomingMessage` 和 `http.ServerResponse` 进行了大量扩展，而 Bun 使用 Web Standard 的 `Request` 和 `Response`。

**常见的兼容性问题：**

`req.ip` 和 `req.ips`。Express 的 `req.ip` 属性返回客户端的 IP 地址，`req.ips` 返回代理链中的 IP 地址列表。在 Web Standard 中，IP 地址通过 `request.headers.get("X-Forwarded-For")` 获取，或通过 `request.socket.remoteAddress` 在 Bun 扩展 API 中获取。

`req.path`。Express 的 `req.path` 返回 URL 的路径部分。在 Web Standard 中，通过 `new URL(request.url).pathname` 获取。

`req.query`。Express 的 `req.query` 返回解析后的查询参数对象。在 Web Standard 中，通过 `new URL(request.url).searchParams` 获取。

`req.params`。Express 的 `req.params` 包含路由参数。Hono 和 Elysia 通过各自的 Context 对象提供参数访问。

`req.body`。Express 的 `req.body` 包含解析后的请求体。在 Web Standard 中，需要手动调用 `request.json()`、`request.text()` 或 `request.formData()`。

`res.json()`。Express 的 `res.json()` 发送 JSON 响应。在 Hono 中，使用 `c.json()`；在 Elysia 中，直接返回对象。

`res.status()`。Express 的 `res.status()` 设置响应状态码。在 Hono 中，使用 `c.status()` 或 `c.json(data, status)`；在 Elysia 中，使用 `set.status`。

`res.send()`。Express 的 `res.send()` 发送任意类型的响应。在 Web Standard 中，使用 `new Response(body, init)` 构造函数。

`res.cookie()` 和 `res.clearCookie()`。Express 通过 `cookie-parser` 中间件提供 Cookie 操作。在 Hono 和 Elysia 中，通过设置 `Set-Cookie` 响应头来实现。

`req.session`。Express 通过 `express-session` 中间件提供会话管理。在 Bun 生态中，没有直接对应的替代品。可以通过 JWT 或自定义中间件实现会话管理。

**解决方案：**

使用适配器模式。创建一个适配器函数，将 Express 风格的 `req` 和 `res` 对象转换为 Hono 或 Elysia 的 Context 对象。这种方法可以复用部分 Express 中间件，但性能会受到影响。

逐步替换中间件。识别应用中使用的 Express 中间件，逐一寻找 Hono 或 Elysia 的替代品。Hono 提供了 `@hono/express` 适配器，可以兼容部分 Express 中间件。

重写业务逻辑。对于核心业务逻辑，推荐重写为 Hono 或 Elysia 的原生实现。虽然前期投入较大，但长期维护成本更低，且可以充分利用 Bun 的性能优势。

### 较小框架生态系统

Hono 和 Elysia 作为新兴的 Web 框架，其生态系统相比 Express 仍然较小。这意味着某些功能可能没有现成的中间件或插件可用。

**生态系统对比：**

Express 生态。Express 拥有最庞大的中间件生态系统，几乎所有的 Web 开发需求都有对应的中间件。从认证（Passport.js）、验证（Joi、express-validator）、会话管理（express-session）、文件上传（multer）到安全（helmet、cors、rate-limit），应有尽有。

Hono 生态。Hono 提供了核心中间件集，包括 CORS、认证、压缩、日志、限流、静态文件服务等。Hono 的中间件基于 Web Standard，可以在多个平台上运行。对于 Express 中常见的功能，Hono 通常有对应的实现，但功能可能不如 Express 中间件丰富。

Elysia 生态。Elysia 的插件系统是其扩展性的基础。官方提供了一些常用插件，如 CORS、JWT、Bearer 认证、Swagger、Static 等。Elysia 的社区插件正在快速增长，但仍然不如 Hono 丰富。

**应对策略：**

自行实现。对于简单的功能需求，可以直接在应用代码中实现。例如，文件上传功能可以通过解析 `multipart/form-data` 请求体来实现，无需依赖中间件。

适配现有库。许多 Node.js 库可以在 Bun 上运行，只需要适配 Web Standard 的接口。例如，可以使用 `bcryptjs` 进行密码哈希，使用 `jsonwebtoken` 处理 JWT，使用 `zod` 或 `yup` 进行数据验证。

封装自定义中间件。将常用的功能封装为可复用的中间件或插件。Hono 的中间件和 Elysia 的插件都支持参数化配置，可以在不同项目中复用。

社区贡献。如果发现某个功能缺失，可以考虑为社区贡献中间件或插件。Hono 和 Elysia 都是开源项目，社区贡献是推动生态发展的重要力量。

**核心中间件需求对照表：**

| 功能 | Express | Hono | Elysia |
|------|---------|------|--------|
| CORS | cors | @hono/cors | @elysiajs/cors |
| 日志 | morgan | @hono/logger | 内置 onRequest |
| 认证 | passport | @hono/auth | @elysiajs/jwt |
| 会话 | express-session | 需自定义 | 需自定义 |
| 限流 | express-rate-limit | @hono/rate-limiter | @elysiajs/rate-limit |
| 文件上传 | multer | @hono/multipart | 需自定义 |
| 压缩 | compression | @hono/compress | @elysiajs/compress |
| 安全 | helmet | @hono/secure-headers | @elysiajs/cors |
| 验证 | joi/express-validator | 内置 validator | 内置 schema |
| Swagger | swagger-jsdoc | @hono/swagger-ui | @elysiajs/swagger |
| 静态文件 | serve-static | @hono/serve-static | @elysiajs/static |
| WebSocket | ws/express-ws | @hono/ws | @elysiajs/websocket |

### 热重载配置

Bun 提供了内置的文件监视功能，可以实现应用的热重载。但 Web 框架的热重载配置需要额外的设置。

**Bun 的热重载机制：**

Bun 支持 `--watch` 标志，用于监视文件变化并自动重启应用。当监视的文件发生变化时，Bun 会重启应用进程，重新加载所有模块。

```bash
bun --watch run app.ts
```

`--watch` 的工作方式：

1. 启动时，Bun 记录所有被加载的文件的路径
2. 运行时，Bun 使用操作系统的文件系统事件 API（如 inotify、kqueue、FSEvents）监视这些文件的变化
3. 当检测到文件变化时，Bun 会先等待文件写入完成（延迟约 50ms），然后重启应用
4. 重启时，Bun 会重新加载所有模块，确保应用使用最新的代码

`--watch` 的优点：

- 零配置。不需要额外的配置文件或依赖
- 跨平台。在 Linux、macOS 和 Windows 上都能工作
- 高效。使用操作系统原生的事件通知机制，资源占用低

`--watch` 的局限性：

- 全量重启。每次文件变化都会重启整个应用，对于大型应用可能较慢
- 状态丢失。应用的内存状态（如数据库连接、缓存）会在重启时丢失
- 不支持选择性监视。无法指定只监视特定目录或文件类型

**框架级别的热重载：**

对于需要更精细控制的热重载方案，可以考虑使用框架级别的热重载工具：

Hono 的热重载。Hono 推荐使用 `@hono/vite-dev-server` 或 `tsx watch` 实现开发时的热重载。这些工具提供了模块级别的热替换，而不是进程级别的重启。

Elysia 的热重载。Elysia 推荐使用 `bun --watch` 进行开发。Elysia 的设计确保了快速启动时间，因此进程重启的开销可以接受。

自定义热重载方案。对于复杂应用，可以实现自定义的热重载方案：

```typescript
// 自定义热重载中间件（Hono）
import { Hono } from "hono";

const app = new Hono();

// 开发模式下的热重载端点
if (Bun.env.NODE_ENV === "development") {
  app.get("/__reload", async (c) => {
    // 清除 require 缓存
    for (const key of Object.keys(require.cache)) {
      delete require.cache[key];
    }
    return c.json({ reloaded: true });
  });
}
```

**热重载的最佳实践：**

1. 使用 `bun --watch` 作为默认开发模式
2. 将数据库连接和外部服务连接的管理放在模块顶层，确保重启后可以重新建立连接
3. 避免在模块顶层创建可变状态，这些状态会在重启时丢失
4. 使用环境变量区分开发环境和生产环境
5. 在 `package.json` 中配置开发脚本

```json
{
  "scripts": {
    "dev": "bun --watch run src/index.ts",
    "dev:hot": "bun --hot run src/index.ts",
    "start": "bun run src/index.ts"
  }
}
```

### 性能调优

虽然 Bun 和 Hono/Elysia 本身性能已经很好，但在实际应用中，仍然需要针对具体场景进行性能调优。

**Bun 层面的优化：**

使用 Bun.serve 的 `idleTimeout` 配置。`idleTimeout` 控制空闲连接的超时时间。对于 API 服务，建议设置为较短的超时时间（如 10 秒），以释放空闲连接占用的资源。

```typescript
Bun.serve({
  port: 3000,
  idleTimeout: 10, // 空闲 10 秒后关闭连接
  fetch(request) { /* ... */ },
});
```

调整最大连接数。Bun.serve 的默认最大连接数通常足够，但在高并发场景下，可以通过 `maxRequestBodySize` 和 `maxConnections` 进行调优。

使用 HTTP/2。Bun 支持 HTTP/2，可以通过 `tls` 配置启用。HTTP/2 的多路复用特性可以提高并发性能。

```typescript
Bun.serve({
  port: 443,
  tls: {
    key: Bun.file("key.pem"),
    cert: Bun.file("cert.pem"),
  },
  fetch(request) { /* ... */ },
});
```

**Hono 层面的优化：**

使用 `hono/bun` 适配器。确保使用 `hono/bun` 而不是 `hono` 默认适配器，以利用 Bun 特有的优化。

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
```

路由组织优化。将静态路由放在动态路由之前，因为 Hono 的 Trie 树匹配器对静态路由的匹配速度更快。

```typescript
// 优化前：动态路由在前
app.get("/users/:id/profile", handler);
app.get("/users/settings", handler);

// 优化后：静态路由在前
app.get("/users/settings", handler);
app.get("/users/:id/profile", handler);
```

中间件优化。只注册必要的中间件，避免全局注册不需要的中间件。使用路径限定将中间件的作用范围限制在需要的路由上。

```typescript
// 优化前：全局注册
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware);

// 优化后：限定范围
app.use("/api/admin/*", authMiddleware);
app.use("/api/*", rateLimitMiddleware);
```

**Elysia 层面的优化：**

schema 验证缓存。Elysia 的 schema 验证在首次请求时会进行编译，后续请求使用缓存的结果。确保在应用启动时触发一次验证，预热缓存。

```typescript
// 启动时预热验证
const app = new Elysia();
app.get("/api/data", handler, { schema: DataSchema });

// 发送预热请求
if (Bun.env.NODE_ENV === "production") {
  fetch("http://localhost:3000/api/data").catch(() => {});
}
```

避免不必要的 schema 验证。对于不需要验证的路由，省略 schema 定义以减少验证开销。

使用 `resolve` 钩子。Elysia 的 `resolve` 钩子可以缓存异步操作的结果，避免在多个处理器中重复执行相同的异步操作。

```typescript
app.resolve(({ request }) => {
  // 缓存用户认证信息
  const token = request.headers.get("authorization");
  const user = verifyToken(token);
  return { user };
});

app.get("/api/profile", ({ user }) => {
  return user;
});
```

**通用优化策略：**

使用连接池。对于数据库操作，使用连接池可以减少连接建立和释放的开销。Bun 原生支持 SQLite，并且内置了连接池管理。

启用响应压缩。对于文本类响应（JSON、HTML），启用 gzip 或 brotli 压缩可以显著减少传输数据量。但需要权衡压缩的 CPU 开销。

```typescript
// Hono 压缩中间件
import { compress } from "hono/compress";
app.use("*", compress());
```

减少 JSON 序列化开销。对于大数据量的响应，考虑使用流式响应或分页。Bun 的 `Response` 支持 `ReadableStream`，可以实现流式 JSON 序列化。

缓存策略。对于频繁访问但不经常变化的数据，使用内存缓存或 CDN 缓存。

```typescript
// 简单的内存缓存
const cache = new Map<string, { data: any; expiry: number }>();

app.get("/api/expensive-data", async (c) => {
  const key = c.req.url;
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return c.json(cached.data);
  }
  const data = await computeExpensiveData();
  cache.set(key, { data, expiry: Date.now() + 60_000 }); // 缓存 60 秒
  return c.json(data);
});
```

### 生产环境部署注意事项

将 Bun Web 应用部署到生产环境时，需要考虑以下方面：

**进程管理。** Bun 应用在开发模式下通常直接运行，但在生产环境中，建议使用进程管理器来确保应用的可用性。常用的方案包括：

使用 Docker 容器化部署。Bun 官方提供了 `oven/bun` Docker 镜像，可以直接使用。在 Docker 容器中运行 Bun 应用，可以获得隔离的运行环境和可重复的部署流程。

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
```

使用 `pm2` 或其他进程管理器。虽然 Bun 自身足够稳定，但使用进程管理器可以提供自动重启、负载均衡、日志管理等功能。

**日志管理。** Bun 应用的日志应该输出到标准输出（stdout）和标准错误（stderr），而不是文件。这样可以方便日志收集系统（如 ELK Stack、Datadog、Splunk 等）收集和分析日志。

```typescript
// 结构化日志输出
function log(level: string, message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}
```

**健康检查和监控。** 生产环境中的 Bun 应用应该提供健康检查端点，供负载均衡器和监控系统使用。

```typescript
// Hono 健康检查
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Elysia 健康检查
app.get("/health", () => ({
  status: "healthy" as const,
  uptime: process.uptime(),
}));
```

**环境变量管理。** Bun 支持 `.env` 文件，但生产环境中推荐使用操作系统环境变量或容器编排工具（如 Kubernetes ConfigMap）管理配置。

```typescript
// 安全的配置读取
function getConfig() {
  return {
    port: Number(Bun.env.PORT) || 3000,
    database: {
      url: Bun.env.DATABASE_URL,
      maxConnections: Number(Bun.env.DB_MAX_CONNECTIONS) || 10,
    },
    redis: {
      url: Bun.env.REDIS_URL,
    },
    jwt: {
      secret: Bun.env.JWT_SECRET,
      expiresIn: Bun.env.JWT_EXPIRES_IN || "7d",
    },
  };
}
```

**SSL/TLS 配置。** 生产环境中，API 服务应该使用 HTTPS。Bun.serve 支持内置的 TLS 配置。

```typescript
const config = getConfig();
Bun.serve({
  port: config.port,
  tls: {
    key: Bun.file("/etc/ssl/private/key.pem"),
    cert: Bun.file("/etc/ssl/certs/cert.pem"),
  },
  fetch(request) { /* ... */ },
});
```

在实际部署中，通常更推荐在反向代理层（如 Nginx、Cloudflare、AWS ALB）处理 TLS 终止，而不是在应用层。这样可以减轻应用服务器的计算负担，并集中管理证书。

## 典型问题处理

### Express 中间件无法工作

**问题描述：** 将 Express 中间件直接用于 Hono 或 Elysia 应用时，中间件无法正常工作或导致错误。

**原因分析：**

Express 中间件的接口签名是 `(req, res, next) => void`，其中 `req` 和 `res` 是 Node.js 特有的对象。Hono 和 Elysia 使用 Web Standard 的 `Request` 和 `Response`，接口签名完全不同。直接使用 Express 中间件会导致参数不匹配和运行时错误。

**解决方案：**

方案一：使用 Hono 的 Express 适配器。Hono 提供了 `@hono/express` 包，可以将 Express 中间件适配到 Hono 应用。

```typescript
import { Hono } from "hono";
import { express } from "@hono/express";
import cors from "cors";

const app = new Hono();

// 使用 Express 中间件适配器
app.use("/api/*", express(cors({ origin: "*" })));
```

方案二：寻找 Hono 或 Elysia 的原生替代品。大多数常用的 Express 中间件都有对应的 Hono 或 Elysia 实现。

```typescript
// Express 方式
app.use(cors());

// Hono 方式
import { cors } from "hono/cors";
app.use("*", cors());

// Elysia 方式
import { cors } from "@elysiajs/cors";
app.use(cors());
```

方案三：手动适配。对于简单的 Express 中间件，可以手动编写适配代码。

```typescript
// 适配一个简单的 Express 中间件到 Hono
function adaptExpressMiddleware(expressMw: Function) {
  return async (c: Context, next: () => Promise<void>) => {
    // 创建兼容的 req 和 res 对象
    const req = {
      headers: Object.fromEntries(c.req.headers),
      method: c.req.method,
      url: c.req.url,
      // 其他需要的属性
    };
    const res = {
      statusCode: 200,
      headers: new Headers(),
      status(code: number) { this.statusCode = code; },
      setHeader(key: string, value: string) { this.headers.set(key, value); },
      end(data?: string) { /* 处理响应 */ },
    };
    
    // 调用 Express 中间件
    return new Promise<void>((resolve, reject) => {
      expressMw(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    }).then(() => next());
  };
}
```

**预防措施：**

- 在迁移前，列出所有使用的 Express 中间件
- 逐一检查每个中间件是否有 Hono 或 Elysia 的替代品
- 对于没有替代品的中间件，评估是否可以省略或自行实现
- 在测试环境中充分验证中间件的兼容性

### Elysia 类型错误

**问题描述：** 在开发 Elysia 应用时，TypeScript 编译器报出类型错误，但代码逻辑看起来正确。

**常见类型错误及解决：**

错误一：路由处理器参数类型不匹配。

```typescript
// 错误示例
app.get("/user/:id", ({ params: { id } }) => {
  return { id: id.toUpperCase() }; // 错误：id 是 number 类型
}, {
  params: t.Object({ id: t.Numeric() }),
});

// 正确示例
app.get("/user/:id", ({ params: { id } }) => {
  return { id: String(id).toUpperCase() }; // 正确：显式转换为字符串
}, {
  params: t.Object({ id: t.Numeric() }),
});
```

**原因：** Elysia 根据 schema 定义推导参数类型。`t.Numeric()` 推导出 `number` 类型，但开发者可能预期是字符串。

错误二：响应体类型不匹配。

```typescript
// 错误示例
app.get("/data", () => {
  return { name: "test", extra: "field" }; // 错误：多余的字段
}, {
  response: t.Object({ name: t.String() }),
});

// 正确示例
app.get("/data", () => {
  return { name: "test" }; // 正确：只包含 schema 定义的字段
}, {
  response: t.Object({ name: t.String() }),
});
```

**原因：** Elysia 的响应体验证严格匹配 schema 定义。多余的字段会导致编译错误。

错误三：泛型参数推断失败。

```typescript
// 错误示例
async function createHandler<T>(schema: T) {
  return app.post("/create", ({ body }) => {
    return body; // 错误：body 类型无法推断
  }, { body: schema });
}

// 正确示例
function createHandler<T extends typeof t.Object>(schema: T) {
  return app.post("/create", ({ body }: { body: typeof schema.static }) => {
    return body;
  }, { body: schema });
}
```

**原因：** Elysia 的类型推导依赖具体的 schema 对象，泛型参数的约束不足会导致类型信息丢失。

**调试技巧：**

1. 使用 TypeScript 的 `satisfies` 关键字验证类型

```typescript
const schema = t.Object({ name: t.String() }) satisfies typeof t.Object;
```

2. 显式标注类型，帮助 TypeScript 编译器推导

```typescript
app.get("/data", (): { name: string } => {
  return { name: "test" };
});
```

3. 使用 `typeof` 提取 schema 的类型信息

```typescript
type Todo = typeof TodoSchema.static;
// 等价于 { id: number; title: string; completed: boolean; createdAt: string }
```

4. 检查 TypeScript 配置

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true
  }
}
```

### 路由无法匹配

**问题描述：** 请求发送到服务端后，返回 404 错误，但路由已经正确注册。

**常见原因及解决方案：**

原因一：路由路径拼写错误。

```typescript
// 错误：路径拼写不一致
app.get("/users", handler); // 注册
// 请求: GET /users/ (注意尾部斜杠)

// 解决方案：保持路径一致性
app.get("/users", handler);
// 或
app.get("/users/", handler);
```

原因二：HTTP 方法不匹配。

```typescript
// 错误：使用 GET 请求 POST 路由
app.post("/api/data", handler);
// 请求: GET /api/data → 404

// 解决方案：确认 HTTP 方法正确
app.get("/api/data", handler); // 改为 GET
// 或使用 app.all() 匹配所有方法
app.all("/api/data", handler);
```

原因三：路由注册顺序问题。

```typescript
// 错误：通配路由在前，特定路由在后
app.get("/api/*", wildcardHandler);
app.get("/api/users", specificHandler); // 永远不会匹配到

// 解决方案：将特定路由放在通配路由之前
app.get("/api/users", specificHandler);
app.get("/api/*", wildcardHandler);
```

原因四：中间件短路。

```typescript
// 错误：中间件返回了响应，导致路由处理器未执行
app.use("/api/*", async (c, next) => {
  // 未调用 await next()
  return c.json({ error: "Blocked" }, 403);
});
app.get("/api/data", handler);

// 解决方案：在中间件中正确调用 next()
app.use("/api/*", async (c, next) => {
  if (isBlocked(c)) {
    return c.json({ error: "Blocked" }, 403);
  }
  await next(); // 继续执行
});
```

原因五：路径前缀冲突。

```typescript
// Elysia 中的路径组
app.group("/api", (app) => app
  .get("/users", handler) // 实际路径: /api/users
);
// 请求: /api/users → 正确
// 请求: /users → 404

// 解决方案：确保请求路径包含组前缀
```

**调试方法：**

1. 启用请求日志中间件，查看实际请求的 URL 和方法

```typescript
// Hono
app.use("*", logger());

// Elysia
app.onRequest(({ request }) => {
  console.log(`${request.method} ${request.url}`);
});
```

2. 使用框架提供的路由列表功能

```typescript
// Hono：打印所有注册的路由
console.log(app.routes);

// Elysia：访问 /elysia 查看路由信息
```

3. 使用路由测试工具

```bash
# 使用 curl 测试
curl -v http://localhost:3000/api/users
# 使用 httpie
http GET http://localhost:3000/api/users
```

### 性能未达预期

**问题描述：** 迁移到 Bun 后，应用的性能提升没有达到预期，甚至在某些场景下比 Node.js 更慢。

**原因分析：**

原因一：应用瓶颈不在运行时。

性能优化应该从瓶颈处入手。如果应用的瓶颈在数据库查询、外部 API 调用或复杂的业务逻辑计算上，更换运行时不会带来显著的性能提升。

解决方案：使用性能分析工具定位瓶颈。

```typescript
// 使用 Bun 的内置性能分析
// 运行: bun --profile run app.ts

// 添加性能监控中间件
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const duration = performance.now() - start;
  if (duration > 100) { // 记录耗时超过 100ms 的请求
    console.warn(`Slow request: ${c.req.method} ${c.req.url} (${duration}ms)`);
  }
});
```

原因二：未使用 Bun 原生 API。

如果在 Bun 应用中使用 `node:http` 模块而不是 Bun.serve，就无法利用 Bun 的 HTTP 性能优势。

解决方案：确保使用 Bun 原生 API。

```typescript
// 错误：使用 Node.js 的 http 模块
import http from "node:http";
const server = http.createServer(handler);

// 正确：使用 Bun 原生 API
Bun.serve({ fetch: handler });

// 或使用 Hono 的 bun 适配器
import { Hono } from "hono";
const app = new Hono();
export default { fetch: app.fetch }; // Bun.serve 兼容
```

原因三：JSON 序列化开销。

大量的 JSON 序列化和反序列化操作会成为性能瓶颈，特别是在处理大型 JSON 对象时。

解决方案：

```typescript
// 优化 JSON 序列化
// 1. 使用更高效的 JSON 序列化方案
const jsonString = Bun.serialize(data); // Bun 原生序列化

// 2. 减少不必要的 JSON 解析
// 避免：先解析再重新序列化
const body = await request.json();
return Response.json(body);

// 优化：直接透传
return new Response(request.body, {
  headers: { "Content-Type": "application/json" },
});

// 3. 使用流式 JSON 序列化
// 对于大型数据集，使用 TransformStream 逐步序列化
const stream = new ReadableStream({
  start(controller) {
    for (const item of largeDataset) {
      controller.enqueue(JSON.stringify(item) + "\n");
    }
    controller.close();
  },
});
return new Response(stream);
```

原因四：中间件开销过大。

注册了过多的全局中间件，或者中间件本身性能较差。

解决方案：

```typescript
// 1. 限定中间件作用范围
app.use("/api/*", heavyMiddleware); // 只对 API 路由生效

// 2. 合并多个轻量中间件
app.use("*", async (c, next) => {
  // 同时完成日志、CORS、请求ID 等功能
  const start = Date.now();
  c.res.headers.set("X-Request-Id", crypto.randomUUID());
  await next();
  console.log(`${c.req.method} ${c.req.url} ${Date.now() - start}ms`);
});

// 3. 使用条件判断替代中间件
app.get("/api/data", (c) => {
  if (c.req.header("Authorization")?.startsWith("Bearer ")) {
    // 认证逻辑
  }
  // 业务逻辑
});
```

原因五：未启用 HTTP/2 或连接复用。

解决方案：

```typescript
// 启用 HTTP/2（需要 TLS 配置）
Bun.serve({
  port: 443,
  tls: {
    key: Bun.file("key.pem"),
    cert: Bun.file("cert.pem"),
  },
  fetch(request) {
    // HTTP/2 自动启用
  },
});
```

**性能分析工具：**

```bash
# Bun 内置性能分析
bun --profile run app.ts

# 使用 Chrome DevTools 分析
bun --inspect run app.ts

# 火焰图
bun --profile --cpu-profile run app.ts
```

### Hono 请求体解析失败

**问题描述：** 在 Hono 应用中，POST 或 PUT 请求无法正确解析请求体。

**常见原因：**

请求头 `Content-Type` 不正确。Hono 默认使用 `c.req.json()` 解析 JSON 请求体，但要求请求头中设置 `Content-Type: application/json`。

请求体格式错误。如果请求体不是合法的 JSON 字符串，`c.req.json()` 会抛出异常。

请求体过大。默认情况下，Bun 限制了请求体的大小。超过限制的请求体会被拒绝。

**解决方案：**

```typescript
// 1. 检查 Content-Type 并返回友好的错误信息
app.post("/api/data", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.includes("application/json")) {
    return c.json({
      error: "Content-Type must be application/json",
      received: contentType,
    }, 415);
  }
  try {
    const body = await c.req.json();
    return c.json({ received: body });
  } catch (error) {
    return c.json({
      error: "Invalid JSON in request body",
      detail: error instanceof Error ? error.message : "Unknown error",
    }, 400);
  }
});

// 2. 增加请求体大小限制
// Bun.serve 的 maxRequestBodySize 配置
export default {
  fetch: app.fetch,
  maxRequestBodySize: 1024 * 1024 * 10, // 10MB
};

// 3. 处理空请求体
app.post("/api/data", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "Request body is required" }, 400);
  }
  return c.json({ received: body });
});
```

### CORS 配置问题

**问题描述：** 浏览器端访问 Bun API 时出现跨域错误。

**常见错误：**

- `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- `Response to preflight request doesn't pass access control check`

**解决方案：**

```typescript
// Hono CORS 配置
import { cors } from "hono/cors";

// 开发环境：允许所有来源
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length", "X-Request-Id"],
  maxAge: 86400, // 预检请求缓存时间（秒）
}));

// 生产环境：限定特定来源
app.use("*", cors({
  origin: ["https://example.com", "https://admin.example.com"],
  credentials: true, // 允许携带 Cookie
}));
```

```typescript
// Elysia CORS 配置
import { cors } from "@elysiajs/cors";

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Length", "X-Request-Id"],
  maxAge: 86400,
}));
```

**常见问题排查：**

1. 确认 OPTIONS 预检请求被正确处理
2. 确认 `allowedHeaders` 包含前端实际发送的请求头
3. 确认 `credentials: true` 时，`origin` 不能为 `*`
4. 确认前端请求没有发送不被允许的自定义请求头

## 必备知识

### Web 框架核心概念

#### 路由（Routing）

路由是 Web 框架最基础的功能，它将 HTTP 请求映射到对应的处理器函数。一个路由定义通常包含三个要素：HTTP 方法、URL 路径和处理器函数。

**路由匹配算法：**

线性匹配。最简单的路由匹配方式，遍历所有注册的路由，逐一检查是否匹配。时间复杂度为 O(n)，n 为路由数量。Express 早期版本使用线性匹配。

Trie 树匹配。将路由路径组织成 Trie 树（字典树），匹配时沿着树结构查找。时间复杂度为 O(k)，k 为 URL 路径段数，与路由总数无关。Hono 使用 Trie 树匹配。

Radix 树匹配。Trie 树的优化版本，将连续的单子节点合并。减少了树的深度和节点数量。Fastro 和部分新版本框架使用 Radix 树。

正则表达式匹配。将路由模式编译为正则表达式，匹配时执行正则匹配。灵活性最高，但性能最差。部分框架将正则匹配作为 Trie 树匹配的补充。

**路由参数：**

路由参数是 URL 路径中的动态部分，使用占位符语法定义。

```typescript
// 路径参数
app.get("/users/:id", (c) => {
  const id = c.req.param("id"); // 获取路径参数
  return c.json({ id });
});

// 查询参数
app.get("/search", (c) => {
  const q = c.req.query("q"); // 获取查询参数
  const page = c.req.query("page");
  return c.json({ q, page });
});
```

**路由分组：**

路由分组用于组织相关路由，减少重复的路径前缀。

```typescript
// Hono 路由分组
const books = new Hono();
books.get("/", listBooks);
books.get("/:id", getBook);
books.post("/", createBook);
app.route("/api/books", books);

// Elysia 路由分组
app.group("/api/books", (app) => app
  .get("/", listBooks)
  .get("/:id", getBook)
  .post("/", createBook)
);
```

#### 中间件（Middleware）

中间件是 Web 框架中用于处理请求和响应的函数序列。中间件可以在请求到达路由处理器之前执行预处理，也可以在响应发送之前执行后处理。

**中间件的类型：**

应用级中间件。注册在应用实例上，对应用的所有路由生效。

```typescript
app.use("*", logger());
```

路由级中间件。注册在特定路由上，只对该路由生效。

```typescript
app.get("/admin", authMiddleware, adminHandler);
```

错误处理中间件。专门处理请求处理过程中抛出的异常。

```typescript
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});
```

**中间件的执行顺序：**

中间件的执行顺序遵循「洋葱圈」模型。请求从最外层中间件进入，逐层向内传递，到达路由处理器后，响应从最内层向外层返回。

```
请求 → 中间件1 → 中间件2 → 路由处理器 → 中间件2 → 中间件1 → 响应
```

这种模型使得中间件可以在请求处理的前后都执行代码，适用于日志记录、性能监控、事务管理等场景。

#### 请求处理（Request Handling）

请求处理是 Web 框架的核心流程，从接收请求到返回响应的完整过程。

**请求处理流程：**

1. 接收请求：HTTP 服务器接收到客户端请求
2. 请求解析：解析请求行、请求头、请求体
3. 路由匹配：根据 HTTP 方法和 URL 路径匹配对应的路由
4. 中间件链：按顺序执行中间件
5. 路由处理器：执行业务逻辑
6. 响应生成：生成 HTTP 响应
7. 响应发送：将响应发送给客户端

**请求对象：**

Web Standard 的 Request 对象包含以下信息：

- `request.method` — HTTP 方法（GET、POST、PUT 等）
- `request.url` — 完整 URL
- `request.headers` — 请求头
- `request.body` — 请求体（ReadableStream）
- `request.json()` — 解析为 JSON
- `request.text()` — 解析为文本
- `request.formData()` — 解析为表单数据
- `request.clone()` — 克隆请求（body 只能读取一次）

**响应对象：**

Web Standard 的 Response 对象的创建方式：

```typescript
// JSON 响应
new Response(JSON.stringify(data), {
  headers: { "Content-Type": "application/json" },
});

// HTML 响应
new Response("<html><body>Hello</body></html>", {
  headers: { "Content-Type": "text/html" },
});

// 文件响应
new Response(Bun.file("./file.pdf"), {
  headers: { "Content-Type": "application/pdf" },
});

// 流式响应
const stream = new ReadableStream({ ... });
new Response(stream, {
  headers: { "Content-Type": "text/event-stream" },
});
```

### 高级 TypeScript：泛型与条件类型

理解 Bun 框架的类型系统需要掌握 TypeScript 的高级类型特性。以下是与 Web 框架类型安全密切相关的 TypeScript 概念。

#### 泛型基础

泛型允许函数、类和类型定义在声明时使用类型参数，在调用时指定具体类型。

**泛型函数：**

```typescript
// 基础泛型函数
function identity<T>(arg: T): T {
  return arg;
}

const result = identity<string>("hello"); // result 的类型为 string
const result2 = identity(42); // 类型推断：result2 的类型为 number
```

**泛型约束：**

使用 `extends` 关键字约束泛型参数的类型范围。

```typescript
// 约束 T 必须有 length 属性
function logLength<T extends { length: number }>(arg: T): number {
  return arg.length;
}

logLength("hello"); // 5
logLength([1, 2, 3]); // 3
// logLength(42); // 错误：number 没有 length 属性
```

**泛型在框架中的应用：**

Elysia 的路由定义利用泛型链式传递类型信息：

```typescript
// 简化的 Elysia 类型推导模型
interface RouteConfig<T> {
  params?: T;
  query?: T;
  body?: T;
  response?: T;
}

class ElysiaApp {
  get<Config extends RouteConfig<any>>(
    path: string,
    handler: (context: InferContext<Config>) => InferResponse<Config>,
    config?: Config
  ): this {
    // 路由注册逻辑
    return this;
  }
}
```

#### 条件类型

条件类型根据类型关系选择不同的类型。

```typescript
// 基础条件类型
type IsString<T> = T extends string ? "yes" : "no";

type A = IsString<string>; // "yes"
type B = IsString<number>; // "no"
```

**分布式条件类型：**

当条件类型应用于联合类型时，会分布到每个成员。

```typescript
type ToArray<T> = T extends any ? T[] : never;

type Result = ToArray<string | number>;
// 等价于 string[] | number[]
// 而不是 (string | number)[]
```

**条件类型在框架中的应用：**

Hono 的 `c.req.json()` 的类型推导使用条件类型：

```typescript
// 简化的实现
interface Context {
  req: {
    json<T = any>(): Promise<T>;
  };
}

// 根据 Content-Type 推断响应类型
type InferResponseType<T> = T extends string
  ? Response
  : T extends object
    ? Response
    : Response;
```

Elysia 的响应类型推导：

```typescript
// 根据 schema 定义推断响应体类型
type InferResponseFromSchema<T> = T extends {
  response: infer R;
}
  ? R extends { 200: infer Success }
    ? Success
    : R extends infer SingleResponse
      ? SingleResponse
      : never
  : any;
```

#### 模板字面量类型

模板字面量类型允许在类型层面操作字符串。

```typescript
// 基础模板字面量类型
type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickEvent = EventName<"click">; // "onClick"

// 结合条件类型
type ApiPath<Version extends number, Resource extends string> = 
  `/api/v${Version}/${Resource}`;
type UserPath = ApiPath<1, "users">; // "/api/v1/users"
```

**在路由类型安全中的应用：**

```typescript
// 从路径模板提取参数类型
type ExtractParams<T extends string> = 
  T extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : T extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

type UserParams = ExtractParams<"/users/:id">;
// { id: string }
```

### HTTP/1.1 vs HTTP/2

理解 HTTP 协议的不同版本对于 Web 框架的性能调优非常重要。

**HTTP/1.1 的特点：**

串行请求。在同一个 TCP 连接上，请求必须按顺序发送和接收。后一个请求必须等待前一个请求的响应完成才能发送。

队头阻塞。如果前一个请求的响应较慢，后续所有请求都会被阻塞。这是 HTTP/1.1 性能的主要瓶颈。

连接数限制。浏览器对每个域名有最大连接数限制（通常为 6 个）。超过限制的请求需要等待空闲连接。

无状态。每个请求都是独立的，服务器不保留请求之间的状态信息。Cookie 和 Session 机制弥补了这一不足。

文本协议。HTTP/1.1 使用文本格式传输数据，解析效率较低。

**HTTP/2 的特点：**

多路复用。在同一个 TCP 连接上，多个请求可以同时发送和接收。解决了 HTTP/1.1 的队头阻塞问题。

二进制分帧。HTTP/2 使用二进制格式传输数据，解析效率更高。数据被分割为更小的帧，可以交错传输。

头部压缩。使用 HPACK 算法压缩请求头，减少传输开销。对于重复的头部信息（如 Cookie、User-Agent），压缩效果显著。

服务器推送。服务器可以主动向客户端推送资源，无需客户端请求。适用于提前推送 CSS、JavaScript 等静态资源。

流优先级。客户端可以为请求设置优先级，服务器根据优先级决定资源的发送顺序。

**HTTP/2 在 Bun 中的应用：**

Bun 原生支持 HTTP/2，只需要配置 TLS 即可启用。

```typescript
Bun.serve({
  port: 443,
  tls: {
    key: Bun.file("key.pem"),
    cert: Bun.file("cert.pem"),
  },
  fetch(request) {
    // 当客户端支持 HTTP/2 时，Bun 自动协商使用 HTTP/2
  },
});
```

**性能影响：**

在 HTTP/1.1 下，如果应用需要加载多个资源（API 请求、CSS、JavaScript 等），浏览器会创建多个 TCP 连接，增加了连接建立的开销。

在 HTTP/2 下，所有资源通过同一个连接传输，减少了连接建立的开销，并且资源可以并行传输，提高了页面加载速度。

对于 API 服务，HTTP/2 的多路复用特性在高并发场景下表现更优。但对于单个请求的处理性能，HTTP/1.1 和 HTTP/2 没有本质差异。

### RESTful API 设计

RESTful API 设计是 Web 框架应用的核心技能。良好的 API 设计可以提高接口的可用性、可维护性和可扩展性。

**资源命名：**

使用名词而非动词表示资源。

```
✅ GET /users — 获取用户列表
✅ GET /users/123 — 获取特定用户
✅ POST /users — 创建用户
✅ PUT /users/123 — 更新用户
✅ DELETE /users/123 — 删除用户

❌ GET /getUsers
❌ POST /createUser
❌ GET /userInfo?id=123
```

**HTTP 方法的使用：**

- GET — 获取资源，幂等，不改变服务器状态
- POST — 创建资源，非幂等
- PUT — 全量更新资源，幂等
- PATCH — 部分更新资源，非幂等
- DELETE — 删除资源，幂等

**HTTP 状态码的使用：**

- 200 OK — 请求成功
- 201 Created — 资源创建成功
- 204 No Content — 请求成功，无返回内容
- 400 Bad Request — 请求参数错误
- 401 Unauthorized — 未认证
- 403 Forbidden — 无权限
- 404 Not Found — 资源不存在
- 409 Conflict — 资源冲突
- 422 Unprocessable Entity — 请求体验证失败
- 429 Too Many Requests — 请求频率限制
- 500 Internal Server Error — 服务器内部错误

**响应格式：**

统一的响应格式可以提高 API 的可用性。

```typescript
// 成功响应
{
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}

// 错误响应
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      { "field": "email", "message": "邮箱格式不正确" }
    ]
  }
}
```

**分页：**

对于列表 API，应该支持分页。

```typescript
app.get("/users", (c) => {
  const page = Number(c.req.query("page")) || 1;
  const pageSize = Number(c.req.query("pageSize")) || 20;
  const offset = (page - 1) * pageSize;

  const users = db.query("SELECT * FROM users LIMIT ? OFFSET ?", [pageSize, offset]);
  const total = db.query("SELECT COUNT(*) as count FROM users")[0].count;

  return c.json({
    data: users,
    meta: { page, pageSize, total },
  });
});
```

**版本控制：**

API 版本控制可以通过 URL 路径或请求头实现。

```typescript
// URL 路径版本
app.get("/api/v1/users", handler);

// 请求头版本
app.get("/api/users", (c) => {
  const version = c.req.header("Accept-Version");
  if (version === "2") {
    return handleV2(c);
  }
  return handleV1(c);
});
```

### Schema 验证与 TypeBox

TypeBox 是 Elysia 使用的运行时验证库，它基于 JSON Schema 标准，提供了类型安全的 schema 定义和验证功能。

**TypeBox 的核心概念：**

TypeBox 的 `t` 对象提供了创建 schema 的函数。每个 schema 同时包含 TypeScript 类型信息和 JSON Schema 验证规则。

```typescript
import { t } from "elysia";

// 创建 schema
const StringSchema = t.String(); // TypeScript 类型: string
const NumberSchema = t.Number(); // TypeScript 类型: number
const BooleanSchema = t.Boolean(); // TypeScript 类型: boolean
```

**复合 Schema：**

```typescript
// 对象 schema
const UserSchema = t.Object({
  id: t.Number(),
  name: t.String(),
  email: t.String({ format: "email" }),
  age: t.Optional(t.Integer({ minimum: 0, maximum: 150 })),
  role: t.Union([t.Literal("admin"), t.Literal("user"), t.Literal("guest")]),
});

// 数组 schema
const UserListSchema = t.Array(UserSchema);

// 嵌套对象
const OrderSchema = t.Object({
  id: t.String(),
  items: t.Array(t.Object({
    productId: t.String(),
    quantity: t.Integer({ minimum: 1 }),
    price: t.Number({ minimum: 0 }),
  })),
  total: t.Number({ minimum: 0 }),
  status: t.Union([t.Literal("pending"), t.Literal("paid"), t.Literal("shipped"), t.Literal("delivered")]),
});
```

**Schema 组合：**

```typescript
// 部分类型
const PartialUser = t.Partial(UserSchema);
// 所有字段变为可选

// 选择部分字段
const UserName = t.Pick(UserSchema, ["id", "name"]);
// 只包含 id 和 name 字段

// 排除字段
const UserWithoutEmail = t.Omit(UserSchema, ["email"]);
// 排除 email 字段

// 交叉类型
const TimestampMixin = t.Object({
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});
const UserWithTimestamp = t.Intersect([UserSchema, TimestampMixin]);
```

**Schema 的静态类型提取：**

```typescript
// 提取 TypeScript 类型
type User = typeof UserSchema.static;
// 等价于:
// {
//   id: number;
//   name: string;
//   email: string;
//   age?: number;
//   role: "admin" | "user" | "guest";
// }
```

**自定义验证规则：**

```typescript
// 自定义格式验证
const PhoneSchema = t.String({
  pattern: "^1[3-9]\\d{9}$",
  error: "手机号格式不正确",
});

// 自定义验证函数
const PasswordSchema = t.String({
  minLength: 8,
  maxLength: 32,
  // 使用 transform 添加自定义验证
  transform: [
    (value: string) => {
      if (!/[A-Z]/.test(value)) {
        throw new Error("密码必须包含大写字母");
      }
      if (!/[0-9]/.test(value)) {
        throw new Error("密码必须包含数字");
      }
      return value;
    },
  ],
});
```

**TypeBox 在 Elysia 中的集成：**

Elysia 将 TypeBox 的 schema 验证集成到路由定义中，实现端到端的类型安全。

```typescript
// Elysia 中的完整 schema 集成
app.post(
  "/users",
  async ({ body, set }) => {
    // body 类型自动推导为 UserCreateSchema.static
    const user = await createUser(body);
    set.status = 201;
    return user;
  },
  {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 50 }),
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 8 }),
    }),
    response: {
      201: UserSchema,
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String(), field: t.String() }),
    },
  }
);
```

在这个例子中：

1. TypeScript 编译器根据 `body` schema 推导出处理器的 `body` 参数类型
2. 运行时，Elysia 验证请求体是否符合 schema 定义
3. 响应体也会根据 `response` schema 进行类型检查
4. 不同状态码对应不同的响应体结构，类型安全

## 本章小结

Web 框架的「Bun 化」代表了 JavaScript/TypeScript 后端开发的一个重要趋势。随着 Bun 运行时的成熟，基于 Web Standard 构建的现代 Web 框架正在重塑后端开发的范式。

Hono 代表了「轻量高性能」的方向。它通过 Web Standard 适配器实现了跨平台兼容，通过 Trie 树路由和优化的 Context 对象实现了高性能，通过简洁的 API 设计降低了开发者的认知负担。Hono 适合需要高性能、低资源占用的场景，如微服务、边缘计算和 BFF 层。

Elysia 代表了「类型安全」的方向。它将 TypeScript 的类型系统发挥到极致，通过泛型链式传递、条件类型推导和 TypeBox 运行时验证，实现了端到端的类型安全。Elysia 适合需要高可靠性、强类型约束的场景，如复杂业务系统、API 优先的团队协作和高可靠性服务。

Bun.serve 代表了「极致性能」的方向。通过放弃框架抽象层，直接使用 Bun 内置的高性能 HTTP 服务器，可以获得最优的性能和最低的资源消耗。Bun.serve 适合对性能有极端要求的场景，如高频交易、实时数据处理和 IoT 后端。

选择哪个框架取决于具体的业务需求：

- 如果需要快速搭建 API，注重开发体验和跨平台兼容性，选择 Hono
- 如果需要严格的类型安全和自动文档生成，选择 Elysia
- 如果对性能有极端要求，愿意自行处理更多底层细节，选择 Bun.serve 原生
- 如果正在从 Express 迁移，需要渐进式迁移路径，Hono 提供了最平滑的过渡方案

Web 框架的「Bun 化」不仅仅是运行时的替换，更是一种开发范式的转变。从 Node.js 的回调模型到 Bun 的 Web Standard 模型，从运行时错误到编译期类型检查，从庞大的框架到轻量的工具链，这些转变共同推动了 JavaScript/TypeScript 后端开发的进步。

随着 Bun 生态系统的持续发展，我们可以期待看到更多的框架和工具原生支持 Bun，以及更多专门为 Bun 构建的创新框架。Web 框架的「Bun 化」不是一个终点，而是一个持续演进的过程。
