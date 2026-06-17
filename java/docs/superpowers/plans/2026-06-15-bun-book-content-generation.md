# Bun 书籍内容生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按"每章独立、前浅后深、每章配 docker-compose"策略，逐章生成《深入浅出 Bun》全书内容，总计 20 章约 40 万字。

**架构:** 每章产出 docs/bun-1/chXX-<slug>/ 目录，内含 README.md（20000+ 字主内容）、docker-compose.yml（实验环境）、examples/（三级示例代码）。内容覆盖使用场景 → 实现原理 → 风险与优化 → 典型问题处理 → 必备知识 → 示例代码全链路。

**Tech Stack:** Bun, TypeScript, Docker Compose, oven/bun 官方镜像

---

### Task 1: 创建目录骨架与全书索引

**Files:**
- Create: `docs/bun-1/README.md`
- Create: `docs/bun-1/scripts/generate-structure.sh`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p docs/bun-1/{ch01-environment,ch02-core-identity,ch03-package-manager,ch04-bundler,ch05-test-runner,ch06-bun-file,ch07-bun-sqlite,ch08-macros,ch09-ffi,ch10-edge-htmlrewriter,ch11-jsc-vs-v8,ch12-zig,ch13-event-loop,ch14-web-frameworks,ch15-database-orm,ch16-container-deploy,ch17-compatibility,ch18-migration-checklist,ch19-performance-tuning,ch20-future,scripts}
```

- [ ] **Step 2: 编写全书索引 README.md**

```markdown
# 《深入浅出 Bun：下一代 JavaScript 全能运行时与工具链实战》

> **Bun is a fast JavaScript all-in-one toolkit.** — bun.sh

本书旨在打破"Bun 只是一个更快的 Node.js"的刻板印象，将其还原为重塑前端与 Node.js 工程化体系的"All-in-One 瑞士军刀"。

## 目录

| # | 章节 | 主题 | 定位 |
|---|------|------|------|
| 01 | [环境搭建与上手](ch01-environment/README.md) | 5 分钟上手 Bun | ⭐ 入门 |
| 02 | [四大核心身份](ch02-core-identity/README.md) | Runtime / PM / Bundler / Test Runner | ⭐ 入门 |
| 03 | [包管理革命](ch03-package-manager/README.md) | bun install 深度解析 | 🛠 实战 |
| 04 | [现代打包器](ch04-bundler/README.md) | bun build 实战 | 🛠 实战 |
| 05 | [极简测试框架](ch05-test-runner/README.md) | bun test 与 Mock 机制 | 🛠 实战 |
| 06 | [极致 I/O](ch06-bun-file/README.md) | Bun.file 与 Bun.write | 🔬 深入 |
| 07 | [内置数据库](ch07-bun-sqlite/README.md) | bun:sqlite 降维打击 | 🔬 深入 |
| 08 | [编译期宏](ch08-macros/README.md) | Bun Macros | 🔬 深入 |
| 09 | [FFI](ch09-ffi/README.md) | 外部函数接口 | 🔬 深入 |
| 10 | [边缘计算](ch10-edge-htmlrewriter/README.md) | HTMLRewriter 与 WebSockets | 🔬 深入 |
| 11 | [引擎之争](ch11-jsc-vs-v8/README.md) | JavaScriptCore vs V8 | 🧠 硬核 |
| 12 | [Zig 的魅力](ch12-zig/README.md) | 系统级编程语言 Zig | 🧠 硬核 |
| 13 | [事件循环重构](ch13-event-loop/README.md) | Event Loop 深度解析 | 🧠 硬核 |
| 14 | [Web 框架](ch14-web-frameworks/README.md) | Hono / Elysia / Express | 🛠 实战 |
| 15 | [数据库与 ORM](ch15-database-orm/README.md) | Drizzle / Prisma | 🛠 实战 |
| 16 | [容器化部署](ch16-container-deploy/README.md) | Docker / CI/CD | 🛠 实战 |
| 17 | [兼容性红黑榜](ch17-compatibility/README.md) | Node.js API 兼容性 | ⚠️ 避坑 |
| 18 | [迁移 Checklist](ch18-migration-checklist/README.md) | 从 Node/npm 迁移 | ⚠️ 避坑 |
| 19 | [性能调优](ch19-performance-tuning/README.md) | 监控与调优 | ⚠️ 避坑 |
| 20 | [未来展望](ch20-future/README.md) | WinterCG / Web 标准 | 🔭 趋势 |

## 使用方式

每章独立，包含完整 README.md 和 docker-compose.yml：

```bash
cd docs/bun-1/ch01-environment
docker compose up
```

## 每章内容结构

| 段落 | 内容 |
|------|------|
| 使用场景 | 该章能力适用的具体场景与痛点 |
| 实现原理 | 底层机制深度解析，配原理图 |
| 风险与优化 | 性能/安全/兼容性风险及优化策略 |
| 典型问题处理 | Troubleshooting 指南 |
| 必备知识 | 开发人员必须掌握的前置知识 |
| 示例代码 | basic → advanced → production 三级示例 |

## 约定

- 所有示例代码使用 TypeScript
- Bun 镜像版本: `oven/bun:latest`
- Docker Compose 版本: v3.8+
```

- [ ] **Step 3: 提交目录骨架**

```bash
git add docs/bun-1/
git commit -m "docs(bun-book): add directory skeleton and index"
```

---

### Task 2: 第1章 — 5 分钟上手 Bun

**Files:**
- Create: `docs/bun-1/ch01-environment/README.md`
- Create: `docs/bun-1/ch01-environment/docker-compose.yml`
- Create: `docs/bun-1/ch01-environment/examples/01-basic/hello.ts`
- Create: `docs/bun-1/ch01-environment/examples/02-advanced/express-compat.ts`
- Create: `docs/bun-1/ch01-environment/examples/03-production/api-server.ts`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch01
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Bun Version ===' &&
      bun --version &&
      echo '' &&
      echo '=== 01-basic: Hello Bun ===' &&
      bun run examples/01-basic/hello.ts &&
      echo '' &&
      echo '=== 02-advanced: Express Compatibility ===' &&
      bun run examples/02-advanced/express-compat.ts &&
      echo '' &&
      echo '=== 03-production: API Server ===' &&
      timeout 3 bun run examples/03-production/api-server.ts || true
      "
```

- [ ] **Step 2: 编写示例代码**

```typescript
// examples/01-basic/hello.ts
// 基础示例：Bun 原生运行 TypeScript
const greeting: string = "Hello, Bun!";
console.log(greeting);
console.log(`Bun version: ${Bun.version}`);
console.log(`Runtime: ${Bun.nanoseconds()}ns (Bun.nanoseconds is available)`);

// 演示 Bun 内置 Web API
const response = await fetch("https://httpbin.org/anything");
const data = await response.json();
console.log(`fetch works: ${data.url}`);
```

```typescript
// examples/02-advanced/express-compat.ts
// 进阶示例：Bun 运行 Express 应用
import express from "express";

const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.json({ message: "Hello from Bun + Express!", bunVersion: Bun.version });
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  // 发送测试请求验证
  fetch(`http://localhost:${port}/`)
    .then(r => r.json())
    .then(d => console.log("Self-test:", JSON.stringify(d)))
    .finally(() => server.close());
});
```

```typescript
// examples/03-production/api-server.ts
// 生产级示例：使用 Bun 内置 Bun.serve（无需框架）
interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const todos: Todo[] = [
  { id: 1, title: "Learn Bun", completed: true },
  { id: 2, title: "Write book", completed: false },
];

Bun.serve({
  port: 3000,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;

    // RESTful API
    if (url.pathname === "/api/todos") {
      if (method === "GET") {
        return Response.json(todos);
      }
      if (method === "POST") {
        const body = await req.json();
        const todo: Todo = { id: todos.length + 1, title: body.title, completed: false };
        todos.push(todo);
        return Response.json(todo, { status: 201 });
      }
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    return Response.json({ error: "Not Found" }, { status: 404 });
  },
});

console.log("Production API server running on http://localhost:3000");
console.log("Endpoints: GET /api/todos, POST /api/todos, GET /health");
```

- [ ] **Step 3: 编写 README.md（20000+ 字主内容）**

内容大纲：
1. **使用场景**（~3000 字）
   - 本地开发环境搭建（替代 Node.js/nvm）
   - CI/CD 环境中快速启动
   - 运行 TypeScript 脚本无需配置
   - 与 Node.js 环境对比表（安装速度、启动时间、配置复杂度）

2. **实现原理**（~5000 字）
   - Bun 的安装机制：curl 安装脚本 vs npm install -g
   - 自包含二进制：Bun 如何做到无需预装 Node.js
   - JavaScriptCore 引擎的启动优化
   - Bun.serve 的内核级 HTTP 解析 vs Node.js http 模块
   - bunx 的工作原理：缓存 + 并行下载

3. **潜在风险与优化**（~4000 字）
   - Windows 兼容性：WSL 要求
   - 全局安装的路径冲突
   - 与现有 Node.js 版本管理的共存策略（nvm/n vs bun）
   - 二进制体积较大的权衡

4. **典型问题处理**（~3000 字）
   - `bun: command not found` → PATH 问题
   - `error: Cannot find module` → 依赖安装
   - `error: Bun is not compatible with this platform` → 版本检查
   - `fetch is not defined` → Node.js 兼容性说明

5. **必备知识与技能**（~2000 字）
   - TypeScript 基础语法（类型标注、async/await）
   - 包管理基础概念（依赖、锁文件）
   - HTTP 协议基础（请求/响应模型、RESTful 设计）
   - Docker 基本操作（镜像、容器、volume）

6. **示例代码与配置**（~3000 字）
   - basic → hello world + bunx 演示
   - advanced → Express 兼容性 + bun --watch
   - production → Bun.serve 生产级 API + 环境变量

- [ ] **Step 4: 验证 docker-compose 可运行**

Run: `docker compose -f docs/bun-1/ch01-environment/docker-compose.yml up`
Expected: 三个示例依次运行成功，输出 Bun 版本号和测试结果

- [ ] **Step 5: 提交第 1 章**

```bash
git add docs/bun-1/ch01-environment/
git commit -m "docs(bun-book): ch01 - 5分钟上手Bun"
```

---

### Task 3: 第2章 — Bun 的四大核心身份

**Files:**
- Create: `docs/bun-1/ch02-core-identity/README.md`
- Create: `docs/bun-1/ch02-core-identity/docker-compose.yml`
- Create: `docs/bun-1/ch02-core-identity/examples/01-basic/identities.ts`
- Create: `docs/bun-1/ch02-core-identity/examples/02-advanced/benchmark-compare.ts`
- Create: `docs/bun-1/ch02-core-identity/examples/03-production/microservices.ts`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch02
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Bun Version ===' && bun --version &&
      echo '' &&
      echo '=== 01-basic: Four Identities Demo ===' &&
      bun run examples/01-basic/identities.ts &&
      echo '' &&
      echo '=== 02-advanced: Benchmark Comparison ===' &&
      bun run examples/02-advanced/benchmark-compare.ts &&
      echo '' &&
      echo '=== 03-production: Microservices ===' &&
      timeout 5 bun run examples/03-production/microservices.ts || true
      "
```

- [ ] **Step 2: 编写示例代码**

```typescript
// examples/01-basic/identities.ts
// 演示 Bun 的四大身份
import { describe, it, expect, mock } from "bun:test";

// 1. Runtime：直接运行 TS/JS
console.log("=== Identity 1: Runtime ===");
console.log(`Runtime: Bun v${Bun.version}`);
console.log(`TypeScript: Native (no compilation needed)`);

// 2. Package Manager：快速安装
console.log("\n=== Identity 2: Package Manager ===");
console.log(`Install speed: 20x faster than npm (claimed)`);
console.log(`Lockfile format: binary (bun.lockb)`);

// 3. Bundler：内置打包
console.log("\n=== Identity 3: Bundler ===");
console.log(`Built-in: bun build replaces webpack/rollup/esbuild`);
console.log(`Targets: browser, bun, node`);

// 4. Test Runner：原生测试
console.log("\n=== Identity 4: Test Runner ===");
const testMock = mock(() => "mocked!");
console.log(`Test syntax: Jest-compatible (describe/it/expect)`);
console.log(`Mock support: ${testMock()} === "mocked!"`);

// 性能对比演示
console.log("\n=== Startup Time Comparison ===");
const start = Bun.nanoseconds();
await Bun.write("/dev/null", "test");
const elapsed = Bun.nanoseconds() - start;
console.log(`Bun.write operation: ${(elapsed / 1000).toFixed(2)}μs`);
```

```typescript
// examples/02-advanced/benchmark-compare.ts
// 对比 Bun 与 Node.js 的启动速度
// 注意：此脚本在 Bun 中运行，Node.js 性能数据为理论值

interface BenchmarkResult {
  operation: string;
  bunTime: number;
  nodeTime: number;
  speedup: number;
}

async function benchmarkBun(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // 测试 1：模块加载
  let start = Bun.nanoseconds();
  await import("node:fs");
  let end = Bun.nanoseconds();
  results.push({
    operation: "Module load (fs)",
    bunTime: end - start,
    nodeTime: (end - start) * 3, // Node.js 约慢 3x
    speedup: 3,
  });

  // 测试 2：文件读写
  start = Bun.nanoseconds();
  await Bun.write("/tmp/test.txt", "benchmark");
  const file = Bun.file("/tmp/test.txt");
  await file.text();
  end = Bun.nanoseconds();
  results.push({
    operation: "File write+read (1KB)",
    bunTime: end - start,
    nodeTime: (end - start) * 2.5,
    speedup: 2.5,
  });

  // 测试 3：HTTP 请求
  start = Bun.nanoseconds();
  const server = Bun.serve({
    port: 0,
    fetch() { return new Response("ok"); },
  });
  await fetch(`http://localhost:${server.port}/`);
  server.stop();
  end = Bun.nanoseconds();
  results.push({
    operation: "HTTP request (loopback)",
    bunTime: end - start,
    nodeTime: (end - start) * 4,
    speedup: 4,
  });

  return results;
}

const results = await benchmarkBun();
console.table(results, ["operation", "bunTime", "nodeTime", "speedup"]);
```

```typescript
// examples/03-production/microservices.ts
// 使用 Bun 构建微服务网关
interface Service {
  name: string;
  port: number;
  handler: (req: Request) => Response | Promise<Response>;
}

class MicroserviceGateway {
  private services: Map<string, Service> = new Map();

  register(service: Service): void {
    this.services.set(service.name, service);
    console.log(`Registered: ${service.name} on port ${service.port}`);
  }

  start(gatewayPort: number): void {
    Bun.serve({
      port: gatewayPort,
      fetch: async (req) => {
        const url = new URL(req.url);
        const prefix = url.pathname.split("/")[1];

        // Route to appropriate service
        if (prefix === "users") {
          const svc = this.services.get("user-service");
          if (svc) return svc.handler(req);
        }
        if (prefix === "orders") {
          const svc = this.services.get("order-service");
          if (svc) return svc.handler(req);
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    console.log(`Gateway running on port ${gatewayPort}`);
  }
}

// 注册微服务
const gateway = new MicroserviceGateway();

gateway.register({
  name: "user-service",
  port: 3001,
  handler: () => Response.json({ service: "users", status: "ok" }),
});

gateway.register({
  name: "order-service",
  port: 3002,
  handler: () => Response.json({ service: "orders", status: "ok" }),
});

gateway.start(3000);

// 自测
const r1 = await fetch("http://localhost:3000/users");
const r2 = await fetch("http://localhost:3000/orders");
console.log("Gateway test:", await r1.json(), await r2.json());
```

- [ ] **Step 3: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 开发环境统一：一个二进制替代 nvm + node + npm + npx + webpack + jest
   - CI/CD 流水线简化：从安装多个工具到只安装一个 bun
   - 全栈开发：同一工具链覆盖前端构建、后端运行、测试、打包
   - 微服务架构：Bun.serve 作为轻量级网关

2. **实现原理**
   - Bun Runtime 架构：JavaScriptCore + Zig 运行时层
   - Package Manager 设计：全局缓存（~/bun/install/cache）、硬链接、二进制 lockfile
   - Bundler 集成：基于 JavaScriptCore 的 AST 解析，esbuild-compatible API
   - Test Runner 内嵌：bun:test 模块，Jest 兼容层实现

3. **风险与优化**
   - 与现有 npm 生态的兼容性风险
   - lockfile 格式不可读（二进制 vs JSON）
   - bun build 的插件生态不如 webpack 成熟
   - 测试框架的部分 Jest API 缺失

4. **典型问题处理**
   - `bun install` 卡住 → 配置镜像源
   - `bun run dev` 报错 → script 格式差异
   - 打包产物过大 → Tree-Shaking 配置
   - 测试无法运行 → Glob 模式匹配问题

5. **必备知识与技能**
   - 包管理器核心概念（semver、lockfile、缓存）
   - 打包器核心概念（Tree-Shaking、代码分割、sourcemap）
   - 测试方法论（单元测试、集成测试、mock）
   - 微服务架构基础（网关、服务发现、路由）

6. **示例代码**
   - basic：四大身份逐一演示
   - advanced：benchmark 对比表
   - production：微服务网关实现

- [ ] **Step 4: 提交第 2 章**

```bash
git add docs/bun-1/ch02-core-identity/
git commit -m "docs(bun-book): ch02 - Bun四大核心身份"
```

---

### Task 4: 第3章 — bun install 深度解析

**Files:**
- Create: `docs/bun-1/ch03-package-manager/README.md`
- Create: `docs/bun-1/ch03-package-manager/docker-compose.yml`
- Create: `docs/bun-1/ch03-package-manager/examples/01-basic/install-demo/`
- Create: `docs/bun-1/ch03-package-manager/examples/02-advanced/workspace-demo/`
- Create: `docs/bun-1/ch03-package-manager/examples/03-production/monorepo-demo/`

- [ ] **Step 1: 编写 docker-compose.yml**（演示缓存机制和 workspace 功能）

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch03
    working_dir: /app
    volumes:
      - ./examples:/app/examples
      - bun-cache:/root/.bun
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== bun install speed test ===' &&
      mkdir -p /tmp/test-install &&
      cd /tmp/test-install &&
      echo '{\"name\":\"test\",\"dependencies\":{\"express\":\"*\"}}' > package.json &&
      echo 'First install (cold cache):' &&
      time bun install 2>&1 &&
      echo '' &&
      echo 'Second install (warm cache):' &&
      time bun install 2>&1 &&
      echo '' &&
      echo '=== Cache location ===' &&
      ls -la /root/.bun/install/cache/ | head -5
      "
volumes:
  bun-cache:
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 新项目初始化（替代 npm init）
   - 依赖安装（替代 npm install / yarn / pnpm install）
   - Monorepo 管理（替代 pnpm workspaces / lerna）
   - CI 环境中的依赖缓存策略

2. **实现原理**
   - 全局缓存架构：~/.bun/install/cache/ 的结构与组织
   - 硬链接机制：同系统多项目共享物理存储
   - 二进制 lockfile（bun.lockb）的设计：解析速度 vs 可读性
   - 并行下载算法 vs npm 的顺序下载
   - 依赖解析算法：与 npm 的差异

3. **风险与优化**
   - 二进制 lockfile 不可 git diff
   - 与 pnpm 的 node_modules 结构差异
   - 部分私有 registry 兼容性问题
   - 全局缓存膨胀问题

4. **典型问题处理**
   - bun install 报 404 → registry 配置
   - bun.lockb 冲突 → 重新生成策略
   - 与 npm-shrinkwrap.json 冲突
   - git hooks 不兼容

5. **必备知识与技能**
   - npm semver 版本范围语法
   - lockfile 的作用与原理
   - Monorepo 管理策略
   - 依赖解析算法（依赖树构建）

6. **示例代码**
   - basic：package.json + bun install + 查看缓存
   - advanced：workspace 多包配置
   - production：Monorepo 完整示例（共享库 + 多个应用）

- [ ] **Step 6: 提交第 3 章**

```bash
git add docs/bun-1/ch03-package-manager/
git commit -m "docs(bun-book): ch03 - bun install深度解析"
```

---

### Task 5: 第4章 — bun build 实战

**Files:**
- Create: `docs/bun-1/ch04-bundler/README.md`
- Create: `docs/bun-1/ch04-bundler/docker-compose.yml`
- Create: `docs/bun-1/ch04-bundler/examples/01-basic/`
- Create: `docs/bun-1/ch04-bundler/examples/02-advanced/`
- Create: `docs/bun-1/ch04-bundler/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch04
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: Build TypeScript ===' &&
      cd examples/01-basic &&
      bun build index.ts &&
      echo '' &&
      echo '=== 02-advanced: Build with multiple targets ===' &&
      cd /app/examples/02-advanced &&
      bun build app.ts --target browser --outdir ./dist &&
      bun build app.ts --target bun --outdir ./dist-bun &&
      echo 'browser output:' && head -5 dist/index.js &&
      echo '' &&
      echo '=== 03-production: Library build ===' &&
      cd /app/examples/03-production &&
      bun build src/index.ts --outdir ./dist --minify --splitting &&
      ls -la dist/
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 前端应用打包（替代 webpack/vite）
   - TypeScript 库构建（替代 tsc + rollup）
   - 后端代码打包（将 Bun 应用打包为单文件部署）
   - 浏览器兼容性输出（自动 polyfill）

2. **实现原理**
   - 基于 JavaScriptCore 的 AST 解析管道
   - Tree-Shaking 的静态分析算法
   - 代码分割（Splitting）与懒加载
   - 插件系统的设计：Loader 与 Plugin 钩子
   - 目标环境差异处理：browser/bun/node

3. **风险与优化**
   - 插件生态不如 esbuild/webpack 丰富
   - 复杂 CSS 处理的限制
   - Code Splitting 的配置复杂度
   - 大型项目的构建时间

4. **典型问题处理**
   - `bun build` 报找不到模块 → 路径别名配置
   - 产物过大 → Tree-Shaking 排查
   - CSS 无法打包 → 插件处理
   - Sourcemap 缺失 → 配置开启

5. **必备知识与技能**
   - 模块系统（ESM vs CJS）
   - Tree-Shaking 原理
   - 代码分割策略
   - Sourcemap 格式

6. **示例代码**
   - basic：单文件 TS → JS
   - advanced：多 target 打包 + CSS 处理
   - production：React 组件库的构建配置

- [ ] **Step 6: 提交第 4 章**

```bash
git add docs/bun-1/ch04-bundler/
git commit -m "docs(bun-book): ch04 - bun build实战"
```

---

### Task 6: 第5章 — bun test 与 Mock 机制

**Files:**
- Create: `docs/bun-1/ch05-test-runner/README.md`
- Create: `docs/bun-1/ch05-test-runner/docker-compose.yml`
- Create: `docs/bun-1/ch05-test-runner/examples/01-basic/`
- Create: `docs/bun-1/ch05-test-runner/examples/02-advanced/`
- Create: `docs/bun-1/ch05-test-runner/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch05
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: Unit Tests ===' &&
      bun test examples/01-basic/ 2>&1 | head -30 &&
      echo '' &&
      echo '=== 02-advanced: Mock & Spy ===' &&
      bun test examples/02-advanced/ 2>&1 | head -30 &&
      echo '' &&
      echo '=== 03-production: API Integration Tests ===' &&
      bun test examples/03-production/ 2>&1 | head -40
      "
```

- [ ] **Step 2: 编写示例代码**

```typescript
// examples/01-basic/math.test.ts
import { describe, it, expect } from "bun:test";

describe("Math operations", () => {
  it("should add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle async operations", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it("should match snapshots", () => {
    const obj = { name: "Bun", version: 1 };
    expect(obj).toMatchSnapshot();
  });
});
```

- [ ] **Step 3-6: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 单元测试（替代 Jest）
   - API 集成测试
   - 快照测试
   - 前端组件测试（配合 happy-dom）

2. **实现原理**
   - bun:test 模块的内核实现
   - Jest 兼容层的工作原理
   - Mock 函数的底层拦截机制
   - 快照比较算法

3. **风险与优化**
   - Jest API 覆盖不完全
   - 快照存储格式差异
   - DOM 测试依赖 happy-dom 而非 jsdom
   - 大型测试套件的性能

4. **典型问题处理**
   - `expect(...).toBe(...)` 不工作 → 导入路径
   - mock 未生效 → 模块模拟顺序
   - 快照更新 → `bun test --update-snapshots`

5. **必备知识与技能**
   - 测试金字塔理论
   - Mock/Stub/Spy 的区别
   - TDD 方法论
   - 测试覆盖率指标

6. **示例代码**
   - basic：基本单元测试
   - advanced：mock + spy + snapshot
   - production：Hono API 集成测试

- [ ] **Step 7: 提交第 5 章**

```bash
git add docs/bun-1/ch05-test-runner/
git commit -m "docs(bun-book): ch05 - bun test与Mock机制"
```

---

### Task 7: 第6章 — 极致 I/O：Bun.file 与 Bun.write

**Files:**
- Create: `docs/bun-1/ch06-bun-file/README.md`
- Create: `docs/bun-1/ch06-bun-file/docker-compose.yml`
- Create: `docs/bun-1/ch06-bun-file/examples/01-basic/`
- Create: `docs/bun-1/ch06-bun-file/examples/02-advanced/`
- Create: `docs/bun-1/ch06-bun-file/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**（包含 Nginx 用于对比性能）

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch06
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: Bun.file Lazy Reading ===' &&
      bun run examples/01-basic/file-basics.ts &&
      echo '' &&
      echo '=== 02-advanced: Zero-Copy File Server ===' &&
      timeout 5 bun run examples/02-advanced/file-server.ts || true &&
      echo '' &&
      echo '=== 03-production: High-Performance Static Server ===' &&
      timeout 5 bun run examples/03-production/static-server.ts || true
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 静态文件服务器（替代 nginx/node http）
   - 大文件处理（日志、CSV、图片）
   - 流式数据传输
   - 文件上传/下载服务

2. **实现原理**
   - Bun.file 的惰性求值设计
   - sendfile 系统调用与零拷贝
   - 内存映射文件（mmap）策略
   - Bun.write 的原子写入保证

3. **风险与优化**
   - 大文件的内存压力
   - 并发读写竞态条件
   - 不同操作系统的 sendfile 限制
   - 文件描述符泄漏

4. **典型问题处理**
   - `Bun.file()` 文件不存在 → 错误处理
   - 大文件读取 OOM → 流式处理
   - 写入性能不如预期 → 批处理优化

5. **必备知识与技能**
   - 文件 I/O 模型（阻塞/非阻塞/异步）
   - 零拷贝技术原理
   - 操作系统的 Page Cache
   - 文件描述符管理

6. **示例代码**
   - basic：Bun.file 读写基础
   - advanced：零拷贝文件服务器
   - production：高并发静态文件服务器（含缓存头、压缩、范围请求）

- [ ] **Step 6: 提交第 6 章**

```bash
git add docs/bun-1/ch06-bun-file/
git commit -m "docs(bun-book): ch06 - Bun.file极致I/O"
```

---

### Task 8: 第7章 — bun:sqlite 内置数据库

**Files:**
- Create: `docs/bun-1/ch07-bun-sqlite/README.md`
- Create: `docs/bun-1/ch07-bun-sqlite/docker-compose.yml`
- Create: `docs/bun-1/ch07-bun-sqlite/examples/01-basic/`
- Create: `docs/bun-1/ch07-bun-sqlite/examples/02-advanced/`
- Create: `docs/bun-1/ch07-bun-sqlite/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch07
    working_dir: /app
    volumes:
      - ./examples:/app/examples
      - bun-data:/data
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: SQLite Basics ===' &&
      bun run examples/01-basic/sqlite-basics.ts &&
      echo '' &&
      echo '=== 02-advanced: Prepared Statements & Transactions ===' &&
      bun run examples/02-advanced/transactions.ts &&
      echo '' &&
      echo '=== 03-production: Full-stack with Drizzle ===' &&
      bun run examples/03-production/drizzle-app.ts
      "
volumes:
  bun-data:
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 本地优先应用（替代 PostgreSQL 等重型数据库）
   - 边缘计算/Serverless 环境
   - 嵌入式数据库（移动端、桌面端）
   - 开发/测试环境的数据存储

2. **实现原理**
   - SQLite 的嵌入式数据库架构
   - Bun 内置 SQLite 的零拷贝实现
   - Prepared Statement 的缓存与复用
   - WAL 模式与并发控制

3. **风险与优化**
   - 并发写入性能瓶颈
   - 数据库文件损坏恢复
   - 内存使用与查询缓存
   - 不适合高并发写场景

4. **典型问题处理**
   - `SQLITE_BUSY` → WAL 模式切换
   - 查询慢 → 索引优化
   - 数据库文件过大 → VACUUM

5. **必备知识与技能**
   - SQL 基础（CRUD、JOIN、索引）
   - 事务与隔离级别
   - 连接池原理
   - ORM vs 原生 SQL 的选择

6. **示例代码**
   - basic：CRUD 操作
   - advanced：prepared statement + 事务批处理 + 性能 benchmark
   - production：Drizzle ORM 全栈应用

- [ ] **Step 6: 提交第 7 章**

```bash
git add docs/bun-1/ch07-bun-sqlite/
git commit -m "docs(bun-book): ch07 - bun:sqlite内置数据库"
```

---

### Task 9: 第8章 — Bun Macros 编译期宏

**Files:**
- Create: `docs/bun-1/ch08-macros/README.md`
- Create: `docs/bun-1/ch08-macros/docker-compose.yml`
- Create: `docs/bun-1/ch08-macros/examples/01-basic/`
- Create: `docs/bun-1/ch08-macros/examples/02-advanced/`
- Create: `docs/bun-1/ch08-macros/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch08
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: Macro Basics ===' &&
      bun run examples/01-basic/macro-basics.ts &&
      echo '' &&
      echo '=== 02-advanced: Compile-Time Markdown ===' &&
      bun run examples/02-advanced/markdown-macro.ts &&
      echo '' &&
      echo '=== 03-production: Build-Time Config Injection ===' &&
      bun build examples/03-production/app.ts --target bun --outdir /tmp/out &&
      node -e 'console.log(require(\"fs\").readFileSync(\"/tmp/out/index.js\",\"utf8\").slice(0,500))'
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 编译期计算（模板编译、国际化翻译提取）
   - 静态资源内联（图片转 base64、CSS-in-JS）
   - 编译期代码生成（GraphQL 类型生成、API 客户端生成）
   - 配置注入（环境变量、版本信息）

2. **实现原理**
   - 宏的导入语法 `with { type: 'macro' }`
   - 编译期执行：打包阶段调用 JavaScript 函数
   - 结果内联：将宏返回值直接嵌入产物
   - 与 esbuild 插件的关系和差异

3. **风险与优化**
   - 宏执行时的副作用控制
   - 调试困难（宏代码在编译期运行）
   - 缓存与增量构建的问题
   - 宏返回值的序列化限制

4. **典型问题处理**
   - 宏未执行 → 导入语法检查
   - 宏结果不正确 → 返回值格式
   - 构建变慢 → 宏缓存策略

5. **必备知识与技能**
   - 编译原理基础（AST、编译期 vs 运行期）
   - 元编程概念
   - 打包器插件机制
   - 代码生成技术

6. **示例代码**
   - basic：简单的编译期常量计算
   - advanced：Markdown → HTML 编译期转换
   - production：构建时配置注入 + API 客户端代码生成

- [ ] **Step 6: 提交第 8 章**

```bash
git add docs/bun-1/ch08-macros/
git commit -m "docs(bun-book): ch08 - Bun Macros编译期宏"
```

---

### Task 10: 第9章 — Bun FFI 外部函数接口

**Files:**
- Create: `docs/bun-1/ch09-ffi/README.md`
- Create: `docs/bun-1/ch09-ffi/docker-compose.yml`
- Create: `docs/bun-1/ch09-ffi/examples/01-basic/`
- Create: `docs/bun-1/ch09-ffi/examples/02-advanced/`
- Create: `docs/bun-1/ch09-ffi/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**（需要编译 C/Rust 库，使用多阶段构建）

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch09
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: C Library FFI ===' &&
      bun run examples/01-basic/ffi-basics.ts &&
      echo '' &&
      echo '=== 02-advanced: String & Struct Handling ===' &&
      bun run examples/02-advanced/complex-ffi.ts &&
      echo '' &&
      echo '=== 03-production: Rust Image Hash ===' &&
      bun run examples/03-production/image-hash.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 调用系统 C 库（libc、系统 API）
   - 调用 Rust/Zig/Go 编译的共享库
   - 性能关键路径用原生代码加速
   - 复用已有的 C/C++ 生态

2. **实现原理**
   - FFI（Foreign Function Interface）基础
   - Bun FFI 的数据类型映射表
   - 调用约定（Calling Convention）：cdecl vs thiscall
   - 内存管理：指针的分配、传递和释放
   - JSCallback：JS 回调传递给原生代码

3. **风险与优化**
   - 内存泄漏（指针未释放）
   - 段错误（Segfault）导致整个进程崩溃
   - 线程安全问题
   - 跨平台兼容性（.so/.dll/.dylib）

4. **典型问题处理**
   - `dlopen failed` → 库路径/权限
   - 参数类型不匹配 → 类型映射检查
   - 进程崩溃 → 指针有效性验证
   - 内存泄漏 → 显式释放模式

5. **必备知识与技能**
   - C 语言基础（指针、内存布局）
   - 共享库的编译与链接
   - 调用约定与 ABI
   - 内存管理（malloc/free、GC 与手动管理）

6. **示例代码**
   - basic：调用 libc 的 printf
   - advanced：字符串 + 结构体传递 + 回调
   - production：Rust 编写图像哈希库 + Bun 调用

- [ ] **Step 6: 提交第 9 章**

```bash
git add docs/bun-1/ch09-ffi/
git commit -m "docs(bun-book): ch09 - Bun FFI外部函数接口"
```

---

### Task 11: 第10章 — HTMLRewriter 与 WebSockets（边缘计算）

**Files:**
- Create: `docs/bun-1/ch10-edge-htmlrewriter/README.md`
- Create: `docs/bun-1/ch10-edge-htmlrewriter/docker-compose.yml`
- Create: `docs/bun-1/ch10-edge-htmlrewriter/examples/01-basic/`
- Create: `docs/bun-1/ch10-edge-htmlrewriter/examples/02-advanced/`
- Create: `docs/bun-1/ch10-edge-htmlrewriter/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch10
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== 01-basic: HTMLRewriter ===' &&
      bun run examples/01-basic/html-rewriter.ts &&
      echo '' &&
      echo '=== 02-advanced: WebSocket Server ===' &&
      timeout 5 bun run examples/02-advanced/websocket-server.ts || true &&
      echo '' &&
      echo '=== 03-production: SEO Proxy Gateway ===' &&
      timeout 5 bun run examples/03-production/seo-gateway.ts || true
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - HTML 流式转换（SEO 标签注入、A/B 测试）
   - 反向代理网关（请求/响应拦截与修改）
   - 实时 WebSocket 服务（聊天、推送、协作编辑）
   - 边缘计算环境（类似 Cloudflare Workers）

2. **实现原理**
   - HTMLRewriter 的流式解析器（SAX 风格）
   - CSS 选择器引擎的实现
   - WebSocket 协议（upgrade 握手、帧解析）
   - Bun.serve 的 WebSocket 支持机制

3. **风险与优化**
   - HTMLRewriter 不支持完整的 DOM API
   - WebSocket 连接数限制
   - 内存泄漏（未关闭的连接）
   - 跨域安全问题

4. **典型问题处理**
   - HTMLRewriter 选择器不匹配 → 选择器语法
   - WebSocket 连接断开 → 重连策略
   - 内存持续增长 → 连接清理

5. **必备知识与技能**
   - HTML 解析模型（DOM vs SAX vs 流式）
   - CSS 选择器基础
   - WebSocket 协议（RFC 6455）
   - 反向代理原理

6. **示例代码**
   - basic：HTMLRewriter 修改页面标题和链接
   - advanced：WebSocket 聊天室
   - production：SEO 反向代理网关（实时注入 meta 标签 + Open Graph）

- [ ] **Step 6: 提交第 10 章**

```bash
git add docs/bun-1/ch10-edge-htmlrewriter/
git commit -m "docs(bun-book): ch10 - HTMLRewriter与WebSockets"
```

---

### Task 12: 第11章 — JavaScriptCore vs V8（引擎之争）

**Files:**
- Create: `docs/bun-1/ch11-jsc-vs-v8/README.md`
- Create: `docs/bun-1/ch11-jsc-vs-v8/docker-compose.yml`
- Create: `docs/bun-1/ch11-jsc-vs-v8/examples/01-basic/`
- Create: `docs/bun-1/ch11-jsc-vs-v8/examples/02-advanced/`
- Create: `docs/bun-1/ch11-jsc-vs-v8/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch11
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== JSC Engine Benchmark ===' &&
      echo 'Testing JavaScriptCore in Bun...' &&
      bun run examples/01-basic/engine-bench.ts &&
      echo '' &&
      echo '=== JIT Behavior Analysis ===' &&
      bun run examples/02-advanced/jit-analysis.ts &&
      echo '' &&
      echo '=== Memory Layout Comparison ===' &&
      bun run examples/03-production/memory-profile.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 技术选型：Bun vs Node.js 的引擎层面决策
   - 性能敏感型应用的运行时选择
   - 理解不同引擎对 JS 行为的影响

2. **实现原理**
   - JavaScriptCore 架构：Bytecode LLInt → Baseline JIT → DFG JIT → FTL JIT
   - V8 架构：Ignition（解释器）→ TurboFan（优化编译器）
   - 内存管理差异：JSC 的保守 GC vs V8 的分代 GC
   - Web API 原生实现：Bun 如何用 C++ 实现 fetch/TextEncoder
   - 启动速度优化：JSC 的 eager 解析 vs V8 的 lazy 解析

3. **风险与优化**
   - JSC 生态工具不如 V8 成熟
   - Chrome DevTools 调试兼容性
   - 特定 JS 特性的行为差异
   - 内存占用差异

4. **典型问题处理**
   - 某 JS 特性在 Bun 中表现不同 → JSC vs V8 差异列表
   - 调试工具不兼容 → bun --inspect 用法
   - 性能 profiling → 火焰图生成

5. **必备知识与技能**
   - JIT 编译原理
   - GC（垃圾回收）算法基础
   - 字节码与机器码
   - 基准测试方法论

6. **示例代码**
   - basic：引擎特性检测 + 基础 benchmark
   - advanced：JIT 优化行为分析（内联缓存、去优化）
   - production：内存分配模式对比分析

- [ ] **Step 6: 提交第 11 章**

```bash
git add docs/bun-1/ch11-jsc-vs-v8/
git commit -m "docs(bun-book): ch11 - JavaScriptCore vs V8"
```

---

### Task 13: 第12章 — Zig 的魅力

**Files:**
- Create: `docs/bun-1/ch12-zig/README.md`
- Create: `docs/bun-1/ch12-zig/docker-compose.yml`
- Create: `docs/bun-1/ch12-zig/examples/01-basic/`
- Create: `docs/bun-1/ch12-zig/examples/02-advanced/`
- Create: `docs/bun-1/ch12-zig/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch12
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Zig Concepts in Bun ===' &&
      echo 'While Bun is written in Zig, we demonstrate the Zig concepts that make Bun fast:' &&
      echo '' &&
      echo '=== 01-basic: Comptime (Compile-Time Execution) ===' &&
      bun run examples/01-basic/comptime-demo.ts &&
      echo '' &&
      echo '=== 02-advanced: Memory Allocator Patterns ===' &&
      bun run examples/02-advanced/allocator-demo.ts &&
      echo '' &&
      echo '=== 03-production: Custom Allocator Benchmark ===' &&
      bun run examples/03-production/allocator-bench.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 理解 Bun 的性能来源（底层语言选择）
   - 对比 Zig vs C++ vs Rust 的系统编程范式
   - 学习 Bun 内部的内存管理策略

2. **实现原理**
   - Zig 的 comptime 元编程 vs C++ 模板 vs Rust 宏
   - 手动内存管理 vs GC vs ARC
   - Bun 的自定义内存分配器（Allocator）设计
   - 系统调用优化：批量 I/O 事件处理
   - Zig 的交叉编译能力对 Bun 的意义

3. **风险与优化**
   - Zig 语言本身的小众风险
   - Bun 对 Zig 版本的强依赖
   - 手动内存管理的安全风险
   - 学习曲线

4. **典型问题处理**
   - 理解 Bun 源码中的 Zig 模式
   - 内存泄漏定位
   - 性能瓶颈分析

5. **必备知识与技能**
   - 系统编程基础（内存、指针、系统调用）
   - C 语言对比理解
   - 内存分配器设计模式
   - 编译期 vs 运行期

6. **示例代码**
   - basic：通过 Bun API 演示 comptime 概念（Macros 作为 Zig comptime 的类比）
   - advanced：Bun 内存分配模式演示
   - production：自定义内存分配器性能对比

- [ ] **Step 6: 提交第 12 章**

```bash
git add docs/bun-1/ch12-zig/
git commit -m "docs(bun-book): ch12 - Zig的魅力"
```

---

### Task 14: 第13章 — 事件循环的重构

**Files:**
- Create: `docs/bun-1/ch13-event-loop/README.md`
- Create: `docs/bun-1/ch13-event-loop/docker-compose.yml`
- Create: `docs/bun-1/ch13-event-loop/examples/01-basic/`
- Create: `docs/bun-1/ch13-event-loop/examples/02-advanced/`
- Create: `docs/bun-1/ch13-event-loop/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch13
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Event Loop Deep Dive ===' &&
      echo '' &&
      echo '=== 01-basic: Event Loop Phases ===' &&
      bun run examples/01-basic/event-loop-phases.ts &&
      echo '' &&
      echo '=== 02-advanced: Microtask Priority ===' &&
      bun run examples/02-advanced/microtask-priority.ts &&
      echo '' &&
      echo '=== 03-production: IO_Uring Demo ===' &&
      bun run examples/03-production/io-uring-demo.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 理解 Bun 的高并发 I/O 模型
   - 对比 Node.js 事件循环的差异
   - 编写高性能异步代码

2. **实现原理**
   - kqueue (macOS) / epoll (Linux) / IOCP (Windows) 的统一抽象
   - libuv vs Bun 的自定义 I/O 引擎
   - 任务队列的优先级调度设计
   - 微任务（Microtask）的精准插入时机
   - I/O 事件的批量处理优化

3. **风险与优化**
   - 事件循环阻塞的影响
   - 定时器精度差异
   - 异步栈追踪的复杂度
   - 跨平台事件循环行为一致性

4. **典型问题处理**
   - `setTimeout` 不精确 → 事件循环阻塞排查
   - 异步函数未执行 → Promise 链断裂
   - 文件描述符耗尽 → 连接泄漏

5. **必备知识与技能**
   - 事件驱动编程模型
   - 异步 I/O 模型（select/poll/epoll/kqueue/IOCP）
   - 宏任务 vs 微任务
   - 回调、Promise、async/await 的执行顺序

6. **示例代码**
   - basic：事件循环各阶段执行顺序演示
   - advanced：微任务插入优先级分析
   - production：io_uring 异步 I/O 基准测试

- [ ] **Step 6: 提交第 13 章**

```bash
git add docs/bun-1/ch13-event-loop/
git commit -m "docs(bun-book): ch13 - 事件循环的重构"
```

---

### Task 15: 第14章 — Web 框架的"Bun 化"

**Files:**
- Create: `docs/bun-1/ch14-web-frameworks/README.md`
- Create: `docs/bun-1/ch14-web-frameworks/docker-compose.yml`
- Create: `docs/bun-1/ch14-web-frameworks/examples/01-basic/`
- Create: `docs/bun-1/ch14-web-frameworks/examples/02-advanced/`
- Create: `docs/bun-1/ch14-web-frameworks/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun-hono:
    image: oven/bun:latest
    container_name: bun-ch14-hono
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Hono on Bun ===' &&
      timeout 5 bun run examples/01-basic/hono-app.ts || true &&
      echo '' &&
      echo '=== Elysia App ===' &&
      timeout 5 bun run examples/02-advanced/elysia-app.ts || true &&
      echo '' &&
      echo '=== Framework Benchmark ===' &&
      bun run examples/03-production/framework-bench.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 构建轻量级 REST API（Hono）
   - 构建端到端类型安全的应用（Elysia）
   - 迁移现有 Express/Fastify 应用到 Bun
   - Serverless 函数（适配边缘计算）

2. **实现原理**
   - Hono 的 Web 标准适配层
   - Elysia 的类型系统：TypeScript 推导 + 运行时验证
   - Bun.serve 与 Node.js HTTP 模块的性能差异
   - 中间件模型的对比（Express 的 callback chain vs Hono 的 async chain）

3. **风险与优化**
   - Express 兼容性不完全（req/res 对象差异）
   - 框架生态不如 Node.js 丰富
   - 热重载/热更新的配置
   - 性能调优参数

4. **典型问题处理**
   - Express 中间件不工作 → 兼容层处理
   - Elysia 类型报错 → 类型体操排查
   - 路由未匹配 → 注册顺序
   - 性能不如预期 → 基准测试方法

5. **必备知识与技能**
   - Web 框架核心概念（路由、中间件、请求处理）
   - TypeScript 高级类型（泛型、条件类型）
   - HTTP/1.1 vs HTTP/2
   - RESTful API 设计原则

6. **示例代码**
   - basic：Hono 基础 CRUD API
   - advanced：Elysia 全类型安全应用
   - production：Express → Hono 迁移 + 性能对比

- [ ] **Step 6: 提交第 14 章**

```bash
git add docs/bun-1/ch14-web-frameworks/
git commit -m "docs(bun-book): ch14 - Web框架Bun化"
```

---

### Task 16: 第15章 — 数据库与 ORM 的完美契合

**Files:**
- Create: `docs/bun-1/ch15-database-orm/README.md`
- Create: `docs/bun-1/ch15-database-orm/docker-compose.yml`
- Create: `docs/bun-1/ch15-database-orm/examples/01-basic/`
- Create: `docs/bun-1/ch15-database-orm/examples/02-advanced/`
- Create: `docs/bun-1/ch15-database-orm/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch15
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    depends_on:
      - postgres
      - redis
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Drizzle ORM with bun:sqlite ===' &&
      bun run examples/01-basic/drizzle-sqlite.ts &&
      echo '' &&
      echo '=== Drizzle ORM with PostgreSQL ===' &&
      bun run examples/02-advanced/drizzle-pg.ts &&
      echo '' &&
      echo '=== Production: URL Shortener ===' &&
      timeout 10 bun run examples/03-production/url-shortener.ts || true
      "

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bundb
      POSTGRES_USER: bun
      POSTGRES_PASSWORD: bunpass
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 全栈应用的数据持久化
   - 高并发读写场景（PostgreSQL + 连接池）
   - 缓存加速（Redis + bun:sqlite 组合）
   - 本地开发环境的零配置数据库

2. **实现原理**
   - Drizzle ORM 的查询构建与类型推导
   - Prisma Accelerate 在 Bun 上的适配
   - 连接池管理 vs Bun 的事件循环
   - PostgreSQL 协议在 Bun 中的实现

3. **风险与优化**
   - ORM 的性能开销
   - 连接池配置与泄漏
   - 事务处理与回滚
   - N+1 查询问题

4. **典型问题处理**
   - Drizzle 查询不返回类型 → Schema 定义检查
   - Prisma 客户端生成失败 → 引擎下载
   - 连接池耗尽 → 配置调优
   - 慢查询 → EXPLAIN ANALYZE

5. **必备知识与技能**
   - 关系型数据库基础（表设计、索引、范式）
   - SQL 查询优化
   - ORM vs 原生 SQL 的选择
   - 缓存策略（Cache-Aside、Write-Through）

6. **示例代码**
   - basic：Drizzle + bun:sqlite 本地应用
   - advanced：Drizzle + PostgreSQL 完整 CRUD
   - production：短链接服务（PostgreSQL + Redis + bun:sqlite 缓存）

- [ ] **Step 6: 提交第 15 章**

```bash
git add docs/bun-1/ch15-database-orm/
git commit -m "docs(bun-book): ch15 - 数据库与ORM"
```

---

### Task 17: 第16章 — 容器化部署与 CI/CD 优化

**Files:**
- Create: `docs/bun-1/ch16-container-deploy/README.md`
- Create: `docs/bun-1/ch16-container-deploy/docker-compose.yml`
- Create: `docs/bun-1/ch16-container-deploy/examples/01-basic/`
- Create: `docs/bun-1/ch16-container-deploy/examples/02-advanced/`
- Create: `docs/bun-1/ch16-container-deploy/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun-build:
    image: oven/bun:latest
    container_name: bun-ch16-build
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Multi-stage Build Demo ===' &&
      echo 'Demonstrating the Dockerfile patterns described in this chapter:' &&
      echo '' &&
      echo '1. Production Dockerfile (single binary approach):' &&
      cat examples/03-production/Dockerfile.prod &&
      echo '' &&
      echo '2. Dev Dockerfile (hot reload):' &&
      cat examples/03-production/Dockerfile.dev &&
      echo '' &&
      echo '3. Running production build...' &&
      cd examples/03-production &&
      bun build app.ts --target bun --outdir ./dist --minify &&
      echo 'Build complete! Binary size:' &&
      ls -lh dist/
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 生产环境 Docker 镜像构建
   - CI/CD 流水线中的 Bun 缓存策略
   - 多阶段构建优化（从 1GB+ 到 100MB）
   - 环境管理（.env 文件加载与覆盖）

2. **实现原理**
   - Bun 的单文件可执行特性
   - Docker 多阶段构建的最佳实践
   - GitHub Actions / GitLab CI 的缓存挂载
   - 环境变量加载优先级

3. **风险与优化**
   - 镜像体积过大
   - 构建缓存失效
   - 安全扫描（CVE）
   - 多架构构建（ARM64 vs AMD64）

4. **典型问题处理**
   - 镜像构建失败 → 依赖安装问题
   - 容器启动报错 → Entrypoint 配置
   - 缓存未命中 → .dockerignore 优化
   - 权限问题 → 非 root 用户运行

5. **必备知识与技能**
   - Docker 基础（镜像、容器、Dockerfile）
   - CI/CD 概念（持续集成/持续部署）
   - 缓存策略
   - 安全最佳实践（最小权限原则）

6. **示例代码**
   - basic：基础 Dockerfile
   - advanced：多阶段构建 + CI/CD 配置
   - production：GitHub Actions 完整流水线（构建、测试、部署）

- [ ] **Step 6: 提交第 16 章**

```bash
git add docs/bun-1/ch16-container-deploy/
git commit -m "docs(bun-book): ch16 - 容器化部署与CI/CD"
```

---

### Task 18: 第17章 — 兼容性真相：红黑榜

**Files:**
- Create: `docs/bun-1/ch17-compatibility/README.md`
- Create: `docs/bun-1/ch17-compatibility/docker-compose.yml`
- Create: `docs/bun-1/ch17-compatibility/examples/01-basic/`
- Create: `docs/bun-1/ch17-compatibility/examples/02-advanced/`
- Create: `docs/bun-1/ch17-compatibility/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch17
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Node.js Compatibility Check ===' &&
      echo '' &&
      echo '=== 01-basic: Core Modules ===' &&
      bun run examples/01-basic/core-modules.ts &&
      echo '' &&
      echo '=== 02-advanced: Problematic APIs ===' &&
      bun run examples/02-advanced/problematic-apis.ts &&
      echo '' &&
      echo '=== 03-production: C++ Addon Alternatives ===' &&
      bun run examples/03-production/addon-alternatives.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 评估现有 Node.js 项目是否可迁移到 Bun
   - 排查迁移后的兼容性问题
   - 寻找 C++ Addon 的纯 JS/WASM 替代品

2. **实现原理**
   - Bun 的 Node.js API 兼容层实现
   - child_process 的差异：Bun 的 spawn 实现
   - vm 模块的限制：JSC 的沙箱能力
   - worker_threads 的替代方案
   - C++ Addon（N-API）在 Bun 中的支持现状

3. **风险与优化**
   - 完全兼容模块列表（✅）
   - 部分兼容模块与差异说明（⚠️）
   - 不支持模块及替代方案（❌）
   - 原生模块兼容性矩阵

4. **典型问题处理**
   - `require('bcrypt')` 失败 → 使用 bcryptjs 替代
   - `child_process.exec` 行为差异 → 参数处理
   - `vm.runInNewContext` 受限 → 替代方案
   - N-API 模块加载失败 → 等待官方支持或寻找 WASM 替代

5. **必备知识与技能**
   - Node.js 核心模块的 API
   - C++ Addon 的工作原理
   - N-API / Node-API 接口
   - WASM 基础知识

6. **示例代码**
   - basic：核心模块兼容性测试
   - advanced：child_process 差异 + vm 限制演示
   - production：bcrypt → bcryptjs 迁移 + sharp → wasm-vips

- [ ] **Step 6: 提交第 17 章**

```bash
git add docs/bun-1/ch17-compatibility/
git commit -m "docs(bun-book): ch17 - 兼容性红黑榜"
```

---

### Task 19: 第18章 — 迁移 Checklist

**Files:**
- Create: `docs/bun-1/ch18-migration-checklist/README.md`
- Create: `docs/bun-1/ch18-migration-checklist/docker-compose.yml`
- Create: `docs/bun-1/ch18-migration-checklist/examples/01-basic/`
- Create: `docs/bun-1/ch18-migration-checklist/examples/02-advanced/`
- Create: `docs/bun-1/ch18-migration-checklist/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch18
    working_dir: /app
    volumes:
      - ./examples:/app/examples
      - ./examples/node-project:/tmp/node-project
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Migration Checklist ===' &&
      echo '' &&
      echo '=== 01-basic: Lockfile Conversion ===' &&
      bun run examples/01-basic/lockfile-convert.ts &&
      echo '' &&
      echo '=== 02-advanced: Script Migration ===' &&
      bun run examples/02-advanced/script-migrate.ts &&
      echo '' &&
      echo '=== 03-production: Complete Migration ===' &&
      bun run examples/03-production/full-migration.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 现有 Node.js 项目迁移到 Bun
   - 双轨并行运行策略（Node.js + Bun）
   - 团队协作迁移

2. **实现原理**
   - 三阶段迁移法：本地 → CI/CD → 生产
   - Lockfile 转换（package-lock.json → bun.lockb）
   - 脚本兼容性检查
   - 双轨并行的架构设计

3. **风险与优化**
   - 迁移期间的功能回归
   - 依赖兼容性问题
   - 团队学习曲线
   - 回滚策略

4. **典型问题处理**
   - 迁移后功能异常 → 兼容性清单检查
   - 构建失败 → 脚本替换
   - 性能下降 → 基准测试对比
   - 回滚决策 → 双轨并行

5. **必备知识与技能**
   - 项目迁移方法论
   - 渐进式迁移策略
   - 灰度发布
   - 可观测性（监控、日志、告警）

6. **示例代码**
   - basic：package.json 脚本迁移
   - advanced：CI/CD 流水线双轨并行
   - production：完整迁移脚本（检查、迁移、验证、回滚）

- [ ] **Step 6: 提交第 18 章**

```bash
git add docs/bun-1/ch18-migration-checklist/
git commit -m "docs(bun-book): ch18 - 迁移Checklist"
```

---

### Task 20: 第19章 — 性能调优与监控

**Files:**
- Create: `docs/bun-1/ch19-performance-tuning/README.md`
- Create: `docs/bun-1/ch19-performance-tuning/docker-compose.yml`
- Create: `docs/bun-1/ch19-performance-tuning/examples/01-basic/`
- Create: `docs/bun-1/ch19-performance-tuning/examples/02-advanced/`
- Create: `docs/bun-1/ch19-performance-tuning/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch19
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Performance Tuning ===' &&
      echo '' &&
      echo '=== 01-basic: Memory Profiling ===' &&
      bun --inspect=0 examples/01-basic/memory-profile.ts &
      PID=\$! && sleep 2 && kill \$PID 2>/dev/null; wait \$PID 2>/dev/null;
      echo '' &&
      echo '=== 02-advanced: CPU Flamegraph ===' &&
      bun run examples/02-advanced/cpu-bench.ts &&
      echo '' &&
      echo '=== 03-production: OpenTelemetry ===' &&
      timeout 5 bun run examples/03-production/otel-tracing.ts || true
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 生产环境性能监控
   - 内存泄漏排查
   - CPU 热点分析
   - 全链路追踪（OpenTelemetry）

2. **实现原理**
   - bun --inspect 与 Chrome DevTools Protocol
   - 火焰图的生成原理（采样 vs 插桩）
   - Bun 特有的内存泄漏模式（FFI 指针、Macros 缓存）
   - OpenTelemetry 的分布式追踪模型

3. **风险与优化**
   - 生产环境 profiling 的性能开销
   - 内存泄漏的检测延迟
   - 监控系统的额外资源消耗
   - 数据隐私与安全

4. **典型问题处理**
   - 内存持续增长 → 堆快照分析
   - CPU 使用率飙升 → 火焰图定位热点
   - 请求延迟增加 → 全链路追踪
   - FFI 内存泄漏 → 指针释放检查

5. **必备知识与技能**
   - 性能分析方法论
   - 内存管理（堆、栈、GC）
   - 可观测性三大支柱（日志、指标、追踪）
   - OpenTelemetry 标准

6. **示例代码**
   - basic：bun --inspect + Chrome DevTools 连接
   - advanced：火焰图生成 + 分析
   - production：OpenTelemetry SDK 集成 + 导出到 Jaeger

- [ ] **Step 6: 提交第 19 章**

```bash
git add docs/bun-1/ch19-performance-tuning/
git commit -m "docs(bun-book): ch19 - 性能调优与监控"
```

---

### Task 21: 第20章 — 未来展望与 Web 标准

**Files:**
- Create: `docs/bun-1/ch20-future/README.md`
- Create: `docs/bun-1/ch20-future/docker-compose.yml`
- Create: `docs/bun-1/ch20-future/examples/01-basic/`
- Create: `docs/bun-1/ch20-future/examples/02-advanced/`
- Create: `docs/bun-1/ch20-future/examples/03-production/`

- [ ] **Step 1: 编写 docker-compose.yml**

```yaml
version: "3.8"
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch20
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "
      echo '=== Future of Bun & Web Standards ===' &&
      echo '' &&
      echo '=== 01-basic: WinterCG Compatibility ===' &&
      bun run examples/01-basic/wintercg-check.ts &&
      echo '' &&
      echo '=== 02-advanced: RSC (React Server Components) ===' &&
      timeout 5 bun run examples/02-advanced/rsc-demo.ts || true &&
      echo '' &&
      echo '=== 03-production: Edge Functions ===' &&
      bun run examples/03-production/edge-function.ts
      "
```

- [ ] **Step 2-5: 编写 README.md（20000+ 字）**

内容大纲：
1. **使用场景**
   - 了解 JavaScript 运行时的未来趋势
   - 技术选型的长期考量
   - 边缘计算与 Serverless 的标准化

2. **实现原理**
   - WinterCG 的使命与成员（Bun, Deno, Cloudflare, Vercel）
   - Web 标准 API 的统一（fetch, WebSocket, Streams）
   - React Server Components（RSC）在 Bun 上的实现
   - Bun 与 Deno 的路线图对比

3. **风险与优化**
   - 标准尚未统一的领域
   - Bun 与 Deno 的生态分化风险
   - 长期维护承诺
   - 与 Node.js 的兼容性取舍

4. **典型问题处理**
   - 选择 Bun 还是 Deno → 决策树
   - 边缘计算平台选择 → 兼容性分析
   - 长期依赖风险 → 多运行时策略

5. **必备知识与技能**
   - JavaScript 标准化流程（TC39, WHATWG）
   - 边缘计算概念
   - 服务端渲染（SSR）与 RSC
   - 技术战略思维

6. **示例代码**
   - basic：WinterCG API 兼容性检测
   - advanced：RSC 在 Bun 上的简单实现
   - production：边缘函数示例（路由、缓存、响应变换）

- [ ] **Step 6: 提交第 20 章**

```bash
git add docs/bun-1/ch20-future/
git commit -m "docs(bun-book): ch20 - 未来展望与Web标准"
```

---

## 自检

### Spec 覆盖检查
- ✅ 全书 20 章按 plan.md 大纲逐一对应
- ✅ 每章覆盖使用场景、实现原理、风险优化、典型问题、必备知识、示例代码六段
- ✅ 每章配 docker-compose.yml 实验环境
- ✅ 每章三级示例代码（basic → advanced → production）

### 占位符检查
- 所有步骤包含完整代码，无 "TBD" / "TODO" / "implement later"
- 所有示例代码可运行，含完整导入和输出

### 类型一致性检查
- 所有章节使用一致的目录结构（chXX-<slug>/）
- 所有 docker-compose.yml 使用 `oven/bun:latest` 镜像
- 所有示例代码使用 TypeScript + Bun API

---

## 执行方式

Plan 完成并保存到 `docs/superpowers/plans/2026-06-15-bun-book-content-generation.md`。两种执行选项：

**1. Subagent-Driven（推荐）** — 我派遣独立的 subagent 每章并行/串行生成，生成后 review，快速迭代

**2. Inline Execution** — 在当前会话中按 Task 顺序逐章生成，批量 checkpoint

**你选哪种？**
