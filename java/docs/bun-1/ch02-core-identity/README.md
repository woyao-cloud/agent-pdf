# 第 2 章：Bun 的四大核心身份

> **本章目标**：深入理解 Bun 的四个核心身份——Runtime（运行时）、Package Manager（包管理器）、Bundler（打包器）和 Test Runner（测试运行器），掌握它们各自的适用场景、实现原理和最佳实践。

---

## 1. 使用场景

Bun 的定位从来不是"另一个 JavaScript 运行时"。它的目标更宏大：**整合 JavaScript 开发中最常用的四种工具为一个统一的二进制**。这四种能力——运行代码、管理依赖、打包构建、运行测试——在传统 Node.js 生态中分别由不同的工具提供，每种工具都有自己的配置、自己的缓存、自己的版本管理。Bun 将它们合而为一，从根本上改变了 JavaScript 工程的工具链架构。

这一节从四个真实场景出发，分析 Bun 的四个身份如何解决实际工程问题。

### 场景一：开发环境统一

**一个二进制替代 nvm + node + npm + npx + webpack + jest**

在传统 JavaScript 开发中，搭建一个可用的开发环境需要安装和配置多个工具。以一个标准的 TypeScript Web 应用为例：

```
传统开发环境工具链：

1. nvm          — Node.js 版本管理
2. node         — JavaScript 运行时
3. npm / yarn   — 包管理器
4. npx          — 包执行器
5. typescript   — TypeScript 编译器
6. webpack/vite — 打包器
7. jest/vitest  — 测试框架
8. eslint       — 代码检查（可选但常见）
9. prettier     — 代码格式化（可选但常见）
```

每个工具都有独立的学习曲线、配置文件、版本策略和生态插件。开发者在开始编码之前，需要先掌握至少 3-4 种工具的基本用法。这种"工具链碎片化"问题在 JavaScript 生态中尤其严重，以至于出现了"JavaScript 疲劳"（JavaScript Fatigue）这个专有名词来描述开发者的普遍感受。

Bun 用一个二进制解决了工具链碎片化问题：

```
Bun 开发环境工具链：

1. bun — 所有功能整合在一个二进制中
   ├── bun run      → 替代 node + ts-node + tsx
   ├── bun install  → 替代 npm install / yarn add
   ├── bunx         → 替代 npx
   ├── bun build    → 替代 webpack / rollup / esbuild
   └── bun test     → 替代 jest / vitest / mocha
```

**减少工具链安装和维护成本**

每个独立的工具都有其版本管理策略和升级路径。当工具链中有 5-6 个工具时，维护成本呈指数级增长：

| 维护项 | 传统工具链 | Bun |
|--------|-----------|-----|
| 升级方式 | 逐个工具升级 | `bun upgrade` 一次性升级所有 |
| 配置文件数量 | 5-8 个（tsconfig, webpack, jest, eslint, prettier...） | 1-2 个（bunfig.toml + package.json） |
| 依赖安装 | npm install 需要下载数百 MB | bun install 仅下载项目依赖 |
| 版本兼容性 | 工具之间可能版本冲突 | 单一二进制确保内部兼容 |
| 环境一致性 | 需要版本锁定文件（.nvmrc, 等） | 内置版本管理 |

特别值得注意的是配置文件的数量。一个中等规模的 TypeScript 项目，其配置文件可能包括：

```json
// tsconfig.json — 20-40 行配置
// webpack.config.js — 50-200 行配置
// jest.config.js — 20-50 行配置
// .eslintrc.js — 30-80 行配置
// .prettierrc — 10-20 行配置
// babel.config.js — 10-30 行配置（如果需要 Babel）
```

这些配置的总和可能达到 200-500 行，且每种配置都有自己独特的 DSL（领域特定语言）。Bun 通过内置功能和最小化配置原则，将这些配置压缩到最低限度：

```toml
# bunfig.toml — 可选，仅在需要自定义时使用
[install]
registry = "https://registry.npmmirror.com"
```

**团队协作时环境一致性**

在团队协作中，"在我的机器上能运行"是一个经典痛点。Bun 通过以下机制确保环境一致性：

1. **单一二进制版本**：所有团队成员使用相同版本的 Bun，通过 `bun --version` 可以即时验证
2. **锁文件**：`bun.lockb` 记录精确的依赖版本，确保所有成员安装完全相同的依赖树
3. **Docker 镜像**：通过 `oven/bun` 官方镜像，CI/CD 和开发环境使用完全相同的运行时

```yaml
# docker-compose.yml 中的版本锁定
services:
  app:
    image: oven/bun:1.0.0  # 锁定到具体版本
    # ...
```

对比传统方案中的版本管理：

| 维度 | 传统方案 | Bun |
|------|---------|-----|
| 运行时版本 | .nvmrc + nvm install | Docker 镜像标签 |
| 依赖版本 | package-lock.json / yarn.lock | bun.lockb |
| 工具版本 | 每个工具独立管理 | bun upgrade 统一管理 |
| 验证方式 | 检查多个版本号 | 检查一个版本号 |

### 场景二：CI/CD 流水线简化

CI/CD（持续集成/持续部署）流水线的核心价值是快速反馈。一个构建周期越短，开发者就能越早发现问题，修复成本也越低。Bun 的四个身份在 CI/CD 环境中分别贡献了显著的加速效果。

**从安装多个工具到只安装一个 bun**

在传统 CI/CD 流水线中，配置一个 Node.js 项目的构建步骤通常需要多个安装步骤：

```yaml
# 传统 Node.js CI/CD 配置（GitHub Actions）
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4    # 安装 Node.js
        with:
          node-version: '18'
      - run: npm ci                    # 安装依赖
      - run: npx tsc                   # TypeScript 编译
      - run: npx webpack --mode=production  # 打包
      - run: npx jest                  # 运行测试
```

使用 Bun 后，上述配置简化为：

```yaml
# Bun CI/CD 配置（GitHub Actions）
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1     # 安装 Bun（5 秒完成）
      - run: bun install               # 安装依赖（快 10-30 倍）
      - run: bun run build             # 构建（内置打包器）
      - run: bun test                  # 测试（内置测试框架）
```

**构建速度提升带来的反馈周期缩短**

CI/CD 流水线中每一步的耗时都有显著改善：

| 阶段 | 传统工具 | 耗时 | Bun | 耗时 | 加速比 |
|------|---------|------|-----|------|--------|
| 运行时安装 | actions/setup-node | 15-30s | oven-sh/setup-bun | 3-5s | 5x |
| 依赖安装 | npm ci | 30-120s | bun install | 2-10s | 10-15x |
| 类型检查 | tsc | 10-30s | 内置（运行时阶段） | 0s | N/A |
| 打包构建 | webpack | 20-60s | bun build | 5-15s | 3-4x |
| 测试 | jest | 15-45s | bun test | 5-20s | 2-3x |
| **总计** | | **90-285s** | | **15-50s** | **4-6x** |

这个加速意味着一个完整 CI 流水线从 3-5 分钟缩短到 30 秒以内。对于每天触发 50 次 CI 的团队，这相当于每天节省 2-4 小时的等待时间，全年累计节省超过 500 小时。

**Docker 镜像体积优化**

Bun 的另一个 CI/CD 优势是 Docker 镜像体积的优化。因为 Bun 二进制已经包含了运行时、打包器、测试框架和 TypeScript 解析器，所以不需要在镜像中额外安装这些工具：

```dockerfile
# 使用 Bun 的 Dockerfile
FROM oven/bun:alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build --target=bun ./src/index.ts --outdir=dist

FROM oven/bun:alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["bun", "run", "dist/index.js"]
```

对比等效的 Node.js Dockerfile：

```dockerfile
# 使用 Node.js 的 Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc                    # 需要额外安装 TypeScript
RUN npx webpack                # 需要额外安装 webpack

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

Bun 版本的 Dockerfile 减少了 2 个 RUN 指令（无需 TypeScript 编译和 Webpack 打包步骤），构建层数更少，镜像更小，构建速度更快。

最终镜像体积对比：

| 镜像 | 体积 | 说明 |
|------|------|------|
| Bun 生产镜像 | ~130MB | 仅包含 Bun 二进制和打包产物 |
| Node.js 生产镜像 | ~180MB | 包含 Node.js + node_modules |
| Node.js 生产镜像（优化） | ~150MB | 使用 --production 安装依赖 |

### 场景三：全栈开发

Bun 的四个身份使其成为全栈开发的理想选择。一个全栈开发者通常需要同时处理前端、后端、数据库和部署等多个领域，Bun 的统一工具链让这个流程更加顺畅。

**同一工具链覆盖前端构建、后端运行、测试、打包**

一个典型的全栈项目工作流程在 Bun 中完全由同一工具链覆盖：

```
全栈开发工作流（Bun 统一工具链）：

1. bun create  → 初始化项目模板
2. bun install → 安装前后端依赖
3. bun run dev → 启动开发服务器（前后端）
4. bun test   → 运行单元测试 + 集成测试
5. bun build  → 打包前端产物 + 编译后端代码
6. bunx ...   → 运行一次性工具（数据库迁移等）
```

具体到代码层面：

```typescript
// 全栈项目的 package.json 示例
{
  "name": "fullstack-app",
  "scripts": {
    "dev": "bun run --watch src/server.ts",        // 后端开发
    "build:client": "bun build ./src/client.tsx --outdir=public", // 前端打包
    "build:server": "bun build ./src/server.ts --target=bun --outdir=dist", // 后端构建
    "test": "bun test",                             // 测试
    "db:migrate": "bunx drizzle-kit push"          // 数据库迁移
  },
  "dependencies": {
    "hono": "^4.0.0",
    "drizzle-orm": "^0.29.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

**减少上下文切换成本**

在全栈开发中，上下文切换是最大的效率杀手之一。开发者需要在"前端构建工具"、"后端运行时"、"测试框架"、"包管理器"等不同心智模型之间频繁切换。Bun 的统一工具链大幅降低了这种切换成本：

| 操作 | 传统方式 | Bun 方式 | 上下文切换成本 |
|------|---------|---------|--------------|
| 运行 TypeScript | npx ts-node | bun run | 无需安装额外工具 |
| 添加依赖 | npm install xxx | bun add xxx | 命令语法一致 |
| 运行测试 | npx jest | bun test | 无需配置 Jest |
| 打包前端 | npx webpack | bun build | 零配置 |
| 运行脚本 | npx xxx | bunx xxx | 语法一致 |

这种一致性在以下场景中特别有价值：

1. **小型团队**：每个开发者需要覆盖全栈，工具链的统一降低了学习成本
2. **快速原型**：从想法到可运行 demo 的时间大幅缩短
3. **教学场景**：学生只需要学习一个工具，而不是一套工具链
4. **开源项目**：贡献者只需要安装 Bun，无需处理复杂的工具链配置

### 场景四：微服务架构

Bun.serve() 是 Bun 内置的高性能 HTTP 服务器，它本身可以作为轻量级 API 网关使用。结合 Bun 的包管理器和打包器，Bun 在微服务架构中同样可以发挥核心作用。

**Bun.serve 作为轻量级 API 网关**

在微服务架构中，API 网关是客户端请求的入口，负责请求路由、负载均衡、认证授权等职责。Bun.serve() 虽然没有专门的网关框架功能丰富，但它的高性能和低开销使其非常适合作为轻量级网关：

```typescript
// 使用 Bun.serve 实现 API 网关
import { serve } from "bun";

const GATEWAY_PORT = 3000;
const SERVICES = {
  users: "http://users-service:4001",
  orders: "http://orders-service:4002",
  products: "http://products-service:4003",
};

serve({
  port: GATEWAY_PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const serviceName = url.pathname.split("/")[1];

    // 路由到对应的微服务
    const targetService = SERVICES[serviceName];
    if (!targetService) {
      return new Response("Service Not Found", { status: 404 });
    }

    // 转发请求
    const targetUrl = `${targetService}${url.pathname}${url.search}`;
    const proxiedRequest = new Request(targetUrl, request);
    return fetch(proxiedRequest);
  },
});
```

这个简单的网关实现具有以下特点：

| 特性 | 实现方式 | 说明 |
|------|---------|------|
| 请求路由 | URL 路径匹配 | 根据路径前缀分发到不同服务 |
| 请求转发 | fetch API | 直接转发请求和响应 |
| 性能 | 原生 HTTP 处理 | 比 Node.js 的 http-proxy 快 2-3 倍 |
| 资源占用 | 极低 | 基础内存占用约 20MB |
| 扩展性 | 按需添加服务 | 只需更新 SERVICES 映射表 |

**服务注册与路由分发**

在更复杂的微服务场景中，可以使用 Bun.serve() 实现动态服务注册和路由分发：

```typescript
// 动态服务注册中心
class ServiceRegistry {
  private services = new Map<string, string>();

  register(name: string, url: string) {
    this.services.set(name, url);
    console.log(`[Registry] Registered ${name} at ${url}`);
  }

  unregister(name: string) {
    this.services.delete(name);
    console.log(`[Registry] Unregistered ${name}`);
  }

  getUrl(name: string): string | undefined {
    return this.services.get(name);
  }

  list(): Array<{ name: string; url: string }> {
    return Array.from(this.services.entries()).map(([name, url]) => ({ name, url }));
  }
}
```

Bun 在微服务架构中的定位可以总结为以下模式：

```
                    ┌─────────────────────────┐
                    │     Bun API Gateway      │
                    │    (Bun.serve + fetch)   │
                    └──────┬──────┬──────┬────┘
                           │      │      │
                    ┌──────┘      │      └──────┐
                    ▼             ▼              ▼
             ┌──────────┐ ┌──────────┐ ┌──────────┐
             │ Users    │ │ Orders   │ │ Products │
             │ Service  │ │ Service  │ │ Service  │
             │ (Bun)    │ │ (Bun)    │ │ (Bun)    │
             └──────────┘ └──────────┘ └──────────┘
```

每个微服务可以是独立的 Bun 应用，也可以使用其他运行时。Bun 的灵活性在于它既可以作为网关运行，也可以作为后端服务运行，还可以在同一个 Docker Compose 环境中与其他服务协同工作。

**对比表：传统工具链 vs Bun 工具链**

以下对比表总结了 Bun 四个身份与传统工具链的对应关系：

| 功能 | 传统工具 | Bun | 加速比 | 配置复杂度 |
|------|---------|-----|--------|-----------|
| 运行时 | Node.js | Bun (JavaScriptCore) | 启动快 4-6x | 低（零配置） |
| 包管理器 | npm/yarn/pnpm | bun install | 快 10-30x | 低（零配置） |
| 打包器 | webpack/rollup/esbuild | bun build | 快 3-5x | 低（零配置） |
| 测试框架 | Jest/Vitest/Mocha | bun test | 快 2-5x | 低（零配置） |
| TypeScript 执行 | ts-node/tsx | 原生支持 | 快 30x+ | 极低（无需配置） |
| 脚本执行 | npx | bunx | 快 3-5x | 极低（零配置） |
| 配置管理 | 多个配置文件 | bunfig.toml（可选） | N/A | 极低 |

从这个对比可以看出，Bun 不仅仅是在每个单项上更快，更重要的是它通过统一工具链消除了工具之间的集成成本和配置复杂性。这种"整体大于部分之和"的效果，是 Bun 最核心的价值主张。

---

## 2. 实现原理

理解 Bun 四个身份的实现原理，有助于你深入掌握 Bun 的设计哲学和性能优势。本节从底层架构角度分析 Bun 如何将四个看似不相关的功能集成到一个二进制中。

### 2.1 Runtime 架构

Bun 的运行时（Runtime）是其所有功能的基石。与 Node.js 基于 V8 引擎不同，Bun 选择了 WebKit 的 JavaScriptCore（JSC）引擎。这个选择对 Bun 的架构产生了深远影响。

**JavaScriptCore 引擎集成**

Bun 将 JavaScriptCore 引擎直接嵌入其二进制文件中。JavaScriptCore 是 WebKit 浏览器的 JavaScript 引擎，也被 Safari 使用。Bun 是第一个将 JavaScriptCore 作为独立运行时（而非浏览器的一部分）大规模使用的项目。

```
Bun 运行时架构层次：

┌─────────────────────────────────────────┐
│           用户代码（TypeScript/JS）       │
├─────────────────────────────────────────┤
│            Bun API 层                    │
│  Bun.serve  Bun.file  Bun.write  Bun.sqlite │
├─────────────────────────────────────────┤
│        Web API 实现层                    │
│  fetch  WebSocket  Request  Response    │
│  TextEncoder  TextDecoder  Blob  File   │
├─────────────────────────────────────────┤
│     Node.js API 兼容层                   │
│  fs  path  http  crypto  child_process  │
├─────────────────────────────────────────┤
│        JavaScriptCore 引擎               │
│  解析器 → 字节码 → JIT → 执行           │
├─────────────────────────────────────────┤
│           Zig 运行时层                    │
│  内存管理  I/O 事件循环  系统调用封装    │
├─────────────────────────────────────────┤
│           操作系统内核                    │
│  io_uring(Linux) / kqueue(macOS)        │
└─────────────────────────────────────────┘
```

JavaScriptCore 的集成方式与 V8 在 Node.js 中的集成方式有本质区别：

| 特性 | Node.js (V8) | Bun (JavaScriptCore) |
|------|-------------|---------------------|
| 引擎定位 | 独立的 C++ 库 | 深度集成到二进制 |
| Web API 实现 | 通过第三方库（如 undici） | JavaScriptCore 原生实现 |
| 启动策略 | 懒解析（Lazy Parsing） | 急切解析（Eager Parsing） |
| JIT 架构 | Ignition + TurboFan | Baseline + DFG + FTL |
| 内存管理 | 分代垃圾回收 | 分代垃圾回收（不同实现） |
| 跨平台支持 | 多平台原生支持 | 主要支持 macOS/Linux |

JavaScriptCore 的"急切解析 + 多级 JIT"策略特别适合 Bun 的使用场景：CLI 工具和 HTTP 服务器通常需要在启动后立即达到峰值性能，而不是像浏览器那样需要长时间的预热。

**Zig 运行时层**

Bun 使用 Zig 语言编写了核心运行时层。Zig 是一种系统级编程语言，提供了与 C 相当的性能，同时具有更现代化的语法和内存安全特性。Bun 选择 Zig 而非 C++ 或 Rust 的原因包括：

1. **手动内存管理**：Zig 提供了精细的内存控制，适合编写高性能运行时
2. **comptime（编译期执行）**：Zig 的编译期计算功能允许在编译时生成高效的代码
3. **C ABI 兼容**：Zig 可以直接调用 C 库，无需 FFI 桥接
4. **无隐式控制流**：Zig 没有运算符重载、异常或隐式内存分配，使代码行为可预测

Zig 运行时层在 Bun 中负责以下关键任务：

```
Zig 运行时层的职责：

┌─────────────────────────────────────────┐
│          Zig 运行时核心                   │
│                                         │
│  1. 内存分配器（Allocator）              │
│     ├── 通用分配器（malloc 包装）         │
│     ├── 线程本地分配器（TLS）            │
│     └── 页面分配器（mmap 包装）          │
│                                         │
│  2. I/O 事件循环                         │
│     ├── Linux: io_uring 封装            │
│     ├── macOS: kqueue 封装              │
│     └── 任务队列调度                     │
│                                         │
│  3. 系统调用封装                         │
│     ├── 文件系统操作（open/read/write）   │
│     ├── 网络操作（socket/bind/accept）    │
│     └── 进程管理（fork/exec/wait）       │
│                                         │
│  4. HTTP 协议栈                          │
│     ├── HTTP/1.1 解析器（FSM 实现）      │
│     ├── HTTP 响应序列化                  │
│     └── WebSocket 协议实现               │
│                                         │
│  5. 并发原语                             │
│     ├── 线程池（Thread Pool）            │
│     ├── 锁（Mutex/RWLock）              │
│     └── 原子操作（Atomic）               │
└─────────────────────────────────────────┘
```

Zig 运行时层的核心优势在于它避免了 JavaScript 引擎与系统调用之间的额外抽象层。在 Node.js 中，V8 通过 C++ 绑定调用 libuv，libuv 再调用系统调用。而在 Bun 中，Zig 层直接调用系统调用，消除了 libuv 这个中间层：

```
Node.js 调用路径：
JavaScript → V8 → C++ 绑定 → libuv → 系统调用

Bun 调用路径：
JavaScript → JSC → Zig 运行时 → 系统调用
```

这个简化带来的性能提升在 I/O 密集型操作中特别明显：

| 操作 | Node.js 调用深度 | Bun 调用深度 | 加速原因 |
|------|-----------------|-------------|---------|
| 文件读取 | JS → V8 → C++ → libuv → kernel | JS → JSC → Zig → kernel | 减少 1 层抽象 |
| HTTP 请求 | JS → V8 → C++ → undici/libuv → kernel | JS → JSC → Zig → kernel | 减少 1-2 层抽象 |
| DNS 查询 | JS → V8 → C++ → c-ares → kernel | JS → JSC → Zig → kernel | 减少 1 层抽象 |

**Web API 原生实现**

Bun 的一个关键特性是"Web API 原生支持"。这意味着 `fetch`、`WebSocket`、`Request`、`Response`、`TextEncoder`、`TextDecoder`、`Blob`、`File` 等浏览器标准 API 在 Bun 中无需安装任何 polyfill 即可直接使用。

这些 Web API 的实现位于 Zig 运行时层和 JavaScriptCore 引擎的交界处：

```
fetch API 的实现架构：

┌─────────────────────────────────────────┐
│  JavaScript 层                           │
│  fetch("https://api.example.com")        │
│         │                                │
│         ▼                                │
│  JavaScriptCore Web API 实现             │
│  （内置 JSC 模块）                        │
│         │                                │
├─────────┼───────────────────────────────┤
│         ▼                                │
│  C++ 桥接层                              │
│  （JSC 原生函数绑定）                      │
│         │                                │
├─────────┼───────────────────────────────┤
│         ▼                                │
│  Zig HTTP 客户端实现                      │
│  1. DNS 解析                             │
│  2. TLS 握手（BoringSSL）                │
│  3. HTTP 请求发送                        │
│  4. 响应接收与解析                       │
│         │                                │
│         ▼                                │
│  io_uring 系统调用                        │
│  （非阻塞 I/O）                          │
└─────────────────────────────────────────┘
```

这种实现架构使得 `fetch` 在 Bun 中的性能显著优于 Node.js 的 `node-fetch` 或 `undici`：

| 指标 | Bun fetch | Node.js undici | Node.js node-fetch |
|------|-----------|---------------|-------------------|
| 请求/秒 | 25,000+ | 18,000+ | 8,000+ |
| 延迟 P50 | 2ms | 3ms | 5ms |
| 延迟 P99 | 8ms | 12ms | 25ms |
| 内存/请求 | ~5KB | ~8KB | ~15KB |

**Node.js API 兼容层**

Bun 不仅实现了 Web API，还实现了大量的 Node.js API，确保现有的 npm 包可以在 Bun 中运行。这个兼容层被称为"Node.js API 兼容层"（Node.js API Compatibility Layer）。

```
Node.js API 兼容层架构：

┌─────────────────────────────────────────┐
│           用户代码                       │
│  import fs from "node:fs"               │
│  import path from "node:path"           │
│  import http from "node:http"           │
├─────────────────────────────────────────┤
│       Bun 实现的 Node.js 模块            │
│                                         │
│  fs:     Bun.file → Zig 文件操作         │
│  path:   TypeScript 实现（轻量）         │
│  http:   Bun.serve → Zig HTTP 栈        │
│  crypto: BoringSSL → Zig 加密操作       │
│  buffer: TypedArray 包装                │
│  stream: Web Streams API 适配           │
│  child_process: Zig 进程管理            │
├─────────────────────────────────────────┤
│       JavaScriptCore + Zig 底层          │
└─────────────────────────────────────────┘
```

每个 Node.js 核心模块在 Bun 中都有独立的实现策略：

| Node.js 模块 | Bun 实现方式 | 兼容度 | 说明 |
|-------------|-------------|-------|------|
| fs | Zig 文件系统操作 | ~95% | 同步/异步 API 均已实现 |
| path | 纯 TypeScript 实现 | ~100% | 轻量级，完全兼容 |
| http | Bun.serve 封装 | ~85% | 基础功能完整，部分高级特性未实现 |
| crypto | BoringSSL 绑定 | ~90% | 常用加密操作支持 |
| buffer | Uint8Array 包装 | ~95% | 大部分 API 兼容 |
| stream | Web Streams 适配 | ~80% | 核心功能兼容，部分 Node.js 特有 API 缺失 |
| child_process | Zig 进程管理 | ~80% | 基础功能支持，高级 IPC 有限 |
| worker_threads | JSC  Worker 实现 | ~70% | 基础功能支持，部分特性差异 |

适配策略的核心原则是：**尽可能在 Zig 层面实现功能，然后在 JavaScript 层面包装为 Node.js 兼容的 API**。这种"底层 Zig + 上层 JS"的双层架构既保证了性能，又保持了 API 兼容性。

### 2.2 Package Manager 设计

Bun 的包管理器（`bun install`）是 Bun 四个身份中最受关注的一个。它之所以比 npm 快 10-30 倍，根本原因在于它的架构设计与 npm 有本质区别。

**全局缓存架构**

Bun 使用全局缓存来存储所有下载过的包。这个缓存位于 `~/.bun/install/cache/` 目录，其结构如下：

```
~/.bun/install/cache/
├── registry.npmjs.org/          # npm registry 缓存
│   ├── express/                 # 包名
│   │   ├── 4.18.2/              # 版本号
│   │   │   ├── package.json     # 包的元数据
│   │   │   └── index.js         # 包的内容
│   │   ├── 4.18.1/
│   │   └── ...
│   ├── react/
│   └── ...
├── registry.yarnpkg.com/        # Yarn registry 缓存（可选）
└── ...
```

缓存的组织方式是"registry → 包名 → 版本号"的三级结构。每个包版本被解压并存储在缓存中，供所有项目共享。

与传统 npm 缓存的对比：

| 特性 | npm 缓存 | Bun 缓存 |
|------|---------|---------|
| 存储格式 | 压缩的 tarball | 解压后的目录 |
| 访问速度 | 需要解压 | 直接访问 |
| 缓存验证 | 每次安装时验证 | 仅验证完整性 |
| 缓存清理 | 手动清理 | 自动 LRU 清理 |
| 跨项目共享 | 通过 npm cache 共享 | 所有项目自动共享 |

Bun 的缓存设计基于一个关键观察：**解压后的包比压缩的 tarball 更常用**。npm 在每次安装时都需要解压 tarball，而 Bun 在首次下载时解压一次，之后直接使用解压后的文件。

**硬链接机制**

Bun 的缓存与项目 node_modules 之间的连接使用硬链接（hard link）机制。这是 Bun 实现"多项目共享物理存储"的关键技术。

硬链接的工作原理：

```
文件系统的硬链接示意：

磁盘上的物理数据块
        │
        ├── 硬链接 1 → ~/.bun/install/cache/express/4.18.2/index.js
        │
        └── 硬链接 2 → project-A/node_modules/express/index.js
             │
             └── 硬链接 3 → project-B/node_modules/express/index.js
```

这三个"文件"实际上指向磁盘上的同一个物理数据块。任何一个"文件"的修改都会影响所有链接（但实际上包文件不会被修改，所以这不成问题）。删除任何一个"文件"只会删除该链接，不会影响物理数据块——只有当所有链接都被删除时，磁盘空间才会被释放。

硬链接的优势：

| 优势 | 说明 | 效果 |
|------|------|------|
| 节省磁盘空间 | 多个项目共享同一份包文件 | 10 个项目安装 express 只占用 1 份磁盘空间 |
| 安装速度提升 | 不需要复制文件，只需创建链接 | 安装速度提升 10-100 倍 |
| 原子性 | 链接创建是原子操作 | 不会出现部分写入的情况 |
| 缓存命中 | 一个项目安装过的包，另一个项目立即可用 | 新项目安装几乎瞬间完成 |

对比 npm 的复制策略：

```
npm 安装 express 到 5 个项目：
复制 5 次 × 2MB = 占用 10MB 磁盘空间
耗时：5 × 下载时间 + 5 × 解压时间 + 5 × 复制时间

Bun 安装 express 到 5 个项目：
第 1 次：下载 + 解压 + 创建链接 = 占用 2MB 磁盘空间
第 2-5 次：仅创建链接 = 不增加磁盘空间
总耗时：1 × 下载时间 + 1 × 解压时间 + 5 × 链接创建时间
```

在大型 monorepo 或多个使用相同依赖栈的项目中，这种差异非常显著。一个组织内如果有 50 个项目都使用 React + Express 技术栈，Bun 的硬链接机制可以节省数百 MB 到数 GB 的磁盘空间。

**二进制 lockfile（bun.lockb）设计**

Bun 使用二进制格式的锁文件（`bun.lockb`），而不是 npm 的 JSON 格式（`package-lock.json`）或 Yarn 的 YAML 格式（`yarn.lock`）。这个设计决策基于性能考虑。

**二进制 vs JSON 的对比**

| 特性 | JSON lockfile (npm) | YAML lockfile (yarn) | 二进制 lockfile (bun) |
|------|--------------------|--------------------|---------------------|
| 解析速度 | 5-20ms | 10-30ms | <1ms |
| 文件大小 | 50-500KB | 40-400KB | 20-200KB |
| 可读性 | 人类可读 | 人类可读 | 不可读（二进制） |
| 差异对比 | 易（git diff） | 易（git diff） | 难（需要专用工具） |
| 冲突解决 | 手动编辑 | 手动编辑 | 需要 regenerated |

Bun 选择二进制格式的原因：

1. **解析速度**：JSON 解析器需要遍历整个文件构建 AST，而二进制格式可以直接内存映射（mmap）到内存中，以 O(1) 时间访问任何字段。在大项目中，这个差异从毫秒级累积到秒级。

2. **序列化/反序列化效率**：二进制格式的序列化和反序列化速度比 JSON 快 10-50 倍，因为不需要字符串到对象的转换过程。

3. **确定性哈希**：二进制格式可以包含确定性哈希，确保在不同平台和环境下生成的锁文件完全一致。

4. **压缩效率**：二进制格式可以使用更紧凑的数据表示，文件体积比 JSON 格式小 50-60%。

Bun 的 lockfile 内部格式类似于 protobuf（Protocol Buffers），使用变长整数编码（varint）和紧凑的字段标识：

```
bun.lockb 内部结构（概念性）：

[Header]
  magic: "bunlock" (6 bytes)
  version: uint32
  entry_count: uint32

[Entries]
  for each package:
    name_length: varint
    name: utf8 string
    version_length: varint
    version: utf8 string
    resolved_url_length: varint
    resolved_url: utf8 string
    integrity_hash: 32 bytes (SHA-256)
    dependencies_count: varint
    for each dependency:
      dep_name_length: varint
      dep_name: utf8 string
      dep_version: varint (index into entries)

[Footer]
  checksum: 32 bytes (整个文件的 SHA-256)
```

这种紧凑的二进制格式使得 `bun.lockb` 的解析速度远超 JSON 格式。在包含 1000 个依赖的项目中：

| 操作 | package-lock.json | bun.lockb |
|------|------------------|-----------|
| 解析时间 | ~15ms | ~0.5ms |
| 内存占用 | ~5MB | ~0.5MB |
| 文件大小 | ~300KB | ~120KB |

**并行下载算法**

Bun 的包下载使用并行 HTTP 请求和连接复用技术，这是它比 npm 快 10-30 倍的关键原因之一。

```
Bun 的并行下载策略：

时间线 →
│
npm:   ┌──解析──┬──请求1──┬──请求2──┬──请求3──┬──解压──┐  ← 顺序执行
│
Bun:   ┌──解析──┬──请求1──┬──解压1──┐
              ├──请求2──┬──解压2──┤           ← 并行执行
              ├──请求3──┬──解压3──┤
              ├──请求4──┬──解压4──┤
              └──请求5──┬──解压5──┘
```

Bun 的并行下载算法包含以下优化：

1. **并发 HTTP 请求**：Bun 同时发起多个 HTTP 请求下载不同的包。默认并发数由系统自动调整，通常在 16-64 之间。相比之下，npm 的默认并发数较低（约 8-16）。

2. **连接复用**：Bun 使用 HTTP/2 多路复用（如果 registry 支持）或 HTTP/1.1 的 keep-alive 机制，复用 TCP 连接发送多个请求。这减少了 TCP 握手和 TLS 协商的开销。

3. **流式解压**：Bun 可以在下载数据的同时进行解压（流式解压），而不需要等待整个 tarball 下载完成。这意味着解压时间和下载时间重叠。

4. **优先级调度**：Bun 根据依赖树的结构确定下载优先级。被更多包依赖的包（如 React、lodash）会被优先下载，减少其他包的等待时间。

5. **DNS 预解析**：在解析 package.json 的同时，Bun 预解析 npm registry 的 DNS，减少后续请求的 DNS 查询时间。

下载性能对比（100 个依赖的项目）：

| 阶段 | npm | bun install | 加速比 |
|------|-----|-------------|--------|
| DNS 查询 | 150ms | 20ms（预解析） | 7.5x |
| TLS 握手 | 300ms | 50ms（复用） | 6x |
| HTTP 请求 | 2000ms | 400ms（并行） | 5x |
| 下载数据 | 8000ms | 1500ms（并行 + 流式） | 5.3x |
| 解压 | 2000ms | 300ms（流式 + 重叠） | 6.7x |
| 写入磁盘 | 500ms | 100ms（硬链接） | 5x |
| **总计** | **~12950ms** | **~2370ms** | **~5.5x** |

值得注意的是，Bun 的安装速度优势在首次安装时（需要下载所有包）约为 5-10 倍，而在缓存命中时（大部分包已在缓存中）可达 30-50 倍，因为只需要创建硬链接。

### 2.3 Bundler 集成

Bun 的打包器（`bun build`）是 Bun 中技术实现最复杂的身份之一。它需要解析 JavaScript/TypeScript 代码、处理模块依赖、进行 Tree-Shaking、代码分割，并生成优化后的输出。

**基于 JavaScriptCore 的 AST 解析管道**

Bun 的打包器直接使用 JavaScriptCore 的 AST（抽象语法树）解析器，而不是像 webpack 那样使用自己的解析器或 acorn 等第三方库。这个设计决策带来了显著的性能优势：

```
Bun 打包器的 AST 解析管道：

源代码（TS/JS/JSX/TSX）
    │
    ▼
JavaScriptCore 解析器
    │
    ├── 词法分析（Lexing）→ Token 流
    ├── 语法分析（Parsing）→ AST
    │
    ▼
Bun 打包器的 AST 处理
    │
    ├── 模块解析（import/export 语句）
    ├── Tree-Shaking（死代码删除）
    ├── 常量折叠（Constant Folding）
    ├── 代码压缩（Minification）
    │
    ▼
代码生成（Code Generation）
    │
    ├── JavaScript 代码
    ├── Source Map
    └── 声明文件（.d.ts，可选）
```

这种架构的优势在于避免了多次解析。在 webpack 中，代码需要经过以下流程：

```
webpack 的解析流程：

源代码 → Babel 解析（生成 AST）→ Babel 转换（类型擦除）→ 生成代码
       → webpack 解析（重新解析成 AST）→ 模块分析 → 生成打包代码
```

这里代码被解析了两次：第一次由 Babel 解析，第二次由 webpack 解析。Bun 只需要解析一次，因为 JavaScriptCore 的解析器直接处理 TypeScript，不需要 Babel 的转译步骤。

**esbuild-compatible API 的设计考量**

Bun 的打包器 API 设计参考了 esbuild，但并非完全兼容。Bun 团队认为 esbuild 的 API 设计是现代打包器的最佳实践，因此选择了类似的 API 风格：

```typescript
// Bun build API（与 esbuild 类似）
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
  sourcemap: "external",
});
```

对比 esbuild 的 API：

```typescript
// esbuild API
const result = await esbuild.build({
  entryPoints: ["./src/index.ts"],
  outdir: "./dist",
  platform: "node",
  minify: true,
  sourcemap: "external",
});
```

Bun build 与 esbuild 的异同：

| 特性 | Bun build | esbuild | 说明 |
|------|----------|---------|------|
| 入口配置 | entrypoints | entryPoints | 命名差异 |
| 输出目录 | outdir | outdir | 相同 |
| 目标环境 | target（bun/node/browser） | platform（node/browser） | Bun 增加了 "bun" 目标 |
| 压缩 | minify | minify | 相同 |
| Source Map | sourcemap | sourcemap | 相同 |
| 代码分割 | splitting | splitting | 相同 |
| 插件系统 | 内置插件 | 内置插件 | API 不同 |
| 自定义 Loader | Bun 插件 | esbuild 插件 | 不同 API |

Bun 选择 esbuild 兼容风格的原因：

1. **开发者熟悉度**：esbuild 在发布后获得了广泛采用，很多开发者熟悉其 API
2. **设计简洁性**：esbuild 的 API 设计以简洁著称，符合 Bun 的"零配置"理念
3. **迁移便利性**：从 esbuild 迁移到 Bun build 的成本最低

**Tree-Shaking 的静态分析算法**

Tree-Shaking（摇树优化）是打包器的核心功能之一，它通过静态分析删除未使用的代码，减小打包产物的体积。Bun 的 Tree-Shaking 实现基于 JavaScriptCore AST 的引用计数分析。

```
Tree-Shaking 分析流程：

1. 构建模块依赖图
   ├── 解析所有 import/export 语句
   ├── 标记每个模块的导出符号
   └── 建立模块之间的引用关系

2. 标记"副作用"（Side Effects）
   ├── 纯函数调用：可安全删除
   ├── 有副作用的调用：必须保留
   └── package.json 的 sideEffects 字段

3. 引用计数分析
   ├── 从入口点开始遍历依赖图
   ├── 标记被引用的导出
   └── 删除未被引用的导出

4. 死代码删除
   ├── 删除未使用的函数/变量/类
   ├── 删除不可达的条件分支
   └── 内联常量值
```

Bun 的 Tree-Shaking 与 webpack 的关键区别：

| 特性 | webpack | Bun build |
|------|--------|----------|
| 分析粒度 | 模块级别 | 符号级别 |
| 副作用分析 | 基于 sideEffects 配置 | 基于 sideEffects + AST 分析 |
| 内联优化 | 有限 | 积极内联 |
| 循环引用处理 | 容错性强 | 有限支持 |
| 动态导入 | 支持 | 支持 |

Bun 的 Tree-Shaking 在某些场景下比 webpack 更激进。例如，对于以下代码：

```typescript
// math.ts
export function add(a: number, b: number) { return a + b; }
export function subtract(a: number, b: number) { return a - b; }
export function multiply(a: number, b: number) { return a * b; }

// index.ts
import { add } from "./math";
console.log(add(1, 2));
```

Bun build 会完全删除 `subtract` 和 `multiply` 函数，甚至连 `add` 函数也可能被内联为 `console.log(3)`（如果启用了常量折叠优化）。

**代码分割与懒加载支持**

Bun build 支持代码分割（Code Splitting）和懒加载（Lazy Loading），通过动态 `import()` 语法触发：

```typescript
// 懒加载示例
const module = await import("./heavy-component.ts");
module.render();
```

Bun 在处理动态 import 时，会将其作为一个独立的"分割点"（Split Point），生成单独的 chunk 文件：

```
打包产物结构（启用代码分割）：

dist/
├── index.js          # 入口 chunk
├── chunk-abc123.js   # heavy-component.ts 的懒加载 chunk
├── chunk-def456.js   # 公共依赖 chunk（如果启用了 splitting）
└── index.js.map      # Source Map
```

| 特性 | Bun build | webpack | esbuild |
|------|----------|--------|---------|
| 动态 import | 支持 | 支持 | 支持 |
| 自动分割 | 需要 splitting: true | 需要配置 splitChunks | 需要 splitting: true |
| 公共 chunk | 支持 | 支持（splitChunks） | 有限支持 |
| 命名 chunk | 支持 | 支持 | 有限支持 |
| 异步加载 | 支持 | 支持 | 支持 |

### 2.4 Test Runner 内嵌

Bun 的测试运行器（`bun test`）是最后一个但同样重要的身份。它完全兼容 Jest API，但底层实现与 Jest 完全不同。

**bun:test 模块的架构**

Bun 的测试框架通过内置的 `bun:test` 模块提供。这个模块在 Bun 启动时就被加载到全局作用域中，不需要在项目中安装任何测试依赖。

```
bun:test 模块架构：

┌─────────────────────────────────────────┐
│            bun:test 模块                  │
│                                         │
│  用户可见 API：                          │
│  ├── describe()       测试套件           │
│  ├── it() / test()    测试用例           │
│  ├── expect()         断言               │
│  ├── beforeAll()      前置钩子           │
│  ├── afterAll()       后置钩子           │
│  ├── beforeEach()     每个测试前置        │
│  ├── afterEach()      每个测试后置        │
│  ├── mock()           模拟函数           │
│  ├── spyOn()          监视函数           │
│  └── jest             Jest 兼容对象      │
│                                         │
├─────────────────────────────────────────┤
│  测试执行引擎：                           │
│  ├── 测试文件发现（Glob 模式匹配）        │
│  ├── 测试执行调度（并行/顺序）            │
│  ├── 超时管理                            │
│  └── 结果汇总与报告                      │
│                                         │
├─────────────────────────────────────────┤
│  底层基础设施：                           │
│  ├── JavaScriptCore 的模块系统           │
│  ├── Zig 运行时的事件循环                │
│  └── 文件系统（用于快照）                │
└─────────────────────────────────────────┘
```

与 Jest 的关键架构差异：

| 特性 | Jest | bun test |
|------|------|---------|
| 依赖 | 需要安装 jest 包 | 内置，零依赖 |
| 配置 | jest.config.js | 零配置或 bunfig.toml |
| 文件发现 | 默认 **/__tests__/**/*.js | 默认 **/*.test.{ts,js,tsx,jsx} |
| 执行模式 | 默认并行 | 默认并行 |
| 进程模型 | 每个测试文件独立进程（worker） | 单进程多线程 |
| 快照存储 | __snapshots__ 目录 | __snapshots__ 目录 |
| 覆盖率 | 需要额外配置（istanbul） | 内置覆盖率支持 |

**Jest 兼容层实现**

Bun 的测试框架 API 设计目标是与 Jest 高度兼容，让现有 Jest 测试用例可以零修改地在 Bun 中运行。

```typescript
// Jest 测试用例 — 无需修改即可在 Bun 中运行
describe("Calculator", () => {
  beforeAll(() => {
    // 测试前置初始化
  });

  it("should add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle edge cases", () => {
    expect(() => JSON.parse("invalid")).toThrow();
  });
});
```

Jest 兼容层的实现策略：

| Jest API | Bun 实现 | 兼容度 |
|----------|---------|-------|
| describe | 原生实现 | 100% |
| it / test | 原生实现 | 100% |
| expect | 原生实现 | ~95% |
| .toBe() | 原生实现 | 100% |
| .toEqual() | 原生实现 | 100% |
| .toMatchSnapshot() | 原生实现 | 100% |
| jest.fn() | mock() | 100% |
| jest.spyOn() | spyOn() | 100% |
| jest.mock() | 部分支持 | ~70% |
| jest.useFakeTimers() | 原生实现 | 100% |
| jest.setTimeout() | 原生实现 | 100% |

兼容性方面需要注意的是 `jest.mock()` 的模块模拟（Module Mocking）功能。Jest 的模块模拟通过它的模块解析系统实现，可以透明地替换导入的模块。Bun 的模块系统与 Jest 不同，因此 `jest.mock()` 的支持不如 Jest 完整。Bun 推荐使用 `mock()` 函数进行函数级别的模拟，而不是模块级别的模拟。

**Mock 函数的底层拦截机制**

Bun 的 `mock()` 函数和 `spyOn()` 函数的底层实现与 Jest 类似，但在细节上有差异。

```
Mock 函数的底层机制：

原始函数：
function add(a, b) { return a + b; }

Mock 化后：
add = mock(add)
    │
    ├── 存储原始函数的引用
    ├── 创建新的包装函数
    ├── 包装函数记录调用信息：
    │   ├── calls: [参数列表]
    │   ├── results: [返回值列表]
    │   ├── instances: [this 上下文列表]
    │   └── invocationCount: 调用次数
    │
    └── 调用原始函数（或返回预设值）
```

Mock 函数的拦截机制在 Zig 层面实现。当调用 `mock()` 时，Bun 创建一个 JavaScript Proxy 对象，拦截函数调用并记录调用信息。

这个机制的核心优势在于：

1. **零成本抽象**：未被 mock 的函数不会产生任何额外开销。Bun 只在函数被 mock 时才创建 Proxy 对象，这意味着测试代码的性能与生产代码无关。

2. **透明的调用拦截**：Proxy 对象在拦截函数调用时，不仅记录参数和返回值，还捕获 this 上下文、异常抛出情况、异步操作的结果等完整信息。这使得测试断言可以覆盖几乎所有函数行为维度。

3. **链式调用支持**：mock 函数可以链式调用 `.mockImplementation()`、`.mockReturnValue()`、`.mockResolvedValue()` 等方法，每次调用都会更新 mock 行为。Bun 使用链表结构存储这些行为变更，确保在复杂测试场景中行为可预测。

4. **自动清理**：在每个测试用例（`it` 块）结束后，Bun 自动清理该用例中创建的 mock 函数，避免跨用例的状态污染。这与 Jest 的行为一致，但 Bun 的实现更高效——它使用作用域链跟踪而非全局注册表。

5. **性能优化**：Mock 函数的调用记录使用预分配数组而非动态扩容数组，减少了内存分配次数。在大量调用（数千次）的测试中，这种优化可以带来 2-3 倍的性能提升。

Mock 函数在 Bun 中的典型使用场景包括：

```typescript
// 场景一：模拟 API 调用
const mockFetch = mock(() => Response.json({ id: 1, name: "Alice" }));
const result = await mockFetch("/api/users/1");
expect(mockFetch).toHaveBeenCalledTimes(1);
expect(mockFetch).toHaveBeenCalledWith("/api/users/1");

// 场景二：模拟定时器
jest.useFakeTimers();
const callback = mock(() => {});
setTimeout(callback, 1000);
jest.advanceTimersByTime(1000);
expect(callback).toHaveBeenCalledTimes(1);

// 场景三：模拟模块函数
import { readFile } from "node:fs/promises";
const mockReadFile = mock(async (path: string) => "mocked content");
// 在测试中使用 mockReadFile 替代真实 readFile
```

```typescript
// Mock 函数的使用示例
const fn = mock(() => 42);

fn(1, 2);
fn(3, 4);

console.log(fn.mock.calls);    // [[1, 2], [3, 4]]
console.log(fn.mock.results);  // [{ type: "return", value: 42 }, ...]
console.log(fn.mock.instances); // [undefined, undefined]
```

与 Jest Mock 的差异：

| 特性 | Jest jest.fn() | Bun mock() |
|------|---------------|-----------|
| 基本功能 | 相同 | 相同 |
| 调用记录 | 相同 | 相同 |
| 返回值模拟 | 相同 | 相同 |
| 实现替换 | mockImplementation | mockImplementation |
| 异步模拟 | mockResolvedValue | mockResolvedValue |
| 一次性模拟 | mockImplementationOnce | mockImplementationOnce |
| 模块模拟 | jest.mock() | 有限支持 |

---

## 3. 潜在风险与优化

Bun 的四个身份虽然强大，但在实际使用中仍然存在一些风险和局限性。了解这些风险有助于你在选型和迁移时做出更明智的决策。

### 3.1 兼容性风险

**与现有 npm 生态的兼容性**

Bun 最核心的兼容性挑战在于它与 npm 生态的兼容程度。虽然 Bun 实现了大量 Node.js API，但完全兼容是一个长期目标，目前仍有一些未实现的 API 和不一致的行为。

| 风险等级 | 范围 | 说明 |
|---------|------|------|
| 高 | Node.js 核心模块 | 部分模块（如 vm、async_hooks）未完全实现 |
| 中 | C++ Addon | N-API 支持有限，旧的 C++ Addon 可能无法运行 |
| 低 | 纯 JavaScript 包 | 大多数纯 JS 包可以正常运行 |
| 低 | Web API | fetch、WebSocket 等 Web API 完全兼容 |

实际影响：

1. **依赖某些 Node.js 内部 API 的包**：如 `pino`（日志库）依赖 `async_hooks`，在 Bun 中可能行为异常
2. **依赖 `process.nextTick` 微任务时序的包**：Bun 的微任务执行顺序与 Node.js 有细微差异
3. **使用 `child_process` 高级 IPC 的包**：Bun 的进程间通信实现不完全

**部分 Node.js API 未实现**

截至 Bun 1.0，以下 Node.js API 仍未实现或部分实现：

| 模块 | 未实现/部分实现的 API | 影响范围 |
|------|---------------------|---------|
| vm | vm.Script, vm.createContext | 代码沙箱执行场景 |
| async_hooks | createHook, executionAsyncId | 性能监控、APM 工具 |
| cluster | cluster.fork, cluster.isMaster | 多进程部署 |
| dgram | createSocket, send | UDP 通信 |
| net | Socket.connect（部分选项） | TCP 客户端 |
| tls | TLSSocket（部分选项） | TLS 连接 |
| inspector | 部分调试协议 | 调试工具 |
| perf_hooks | PerformanceObserver | 性能监控 |

对于生产环境迁移，建议先在开发环境中运行完整的测试套件，确认所有依赖的 API 都已实现。

**C++ Addon 支持有限**

Bun 对 C++ Addon（Node.js 原生插件）的支持是一个重要的兼容性瓶颈。C++ Addon 是直接编译为机器码的 Node.js 插件，通常用于高性能计算或调用底层系统库。

```
C++ Addon 的兼容性层级：

┌─────────────────────────────────────────┐
│  完全兼容                              │
│  ├── N-API (Node-API) v8+ 原生插件     │
│  └── 纯 JavaScript/WASM 库             │
├─────────────────────────────────────────┤
│  部分兼容                              │
│  ├── 使用 nan (Native Abstractions)     │
│  └── 使用 N-API v7 及以下              │
├─────────────────────────────────────────┤
│  不兼容                                │
│  ├── 直接使用 V8 API 的插件            │
│  ├── 依赖 V8 内部数据结构的插件        │
│  └── 使用 Node.js 内部符号的插件       │
└─────────────────────────────────────────┘
```

常见的 C++ Addon 兼容情况：

| 包名 | 是否兼容 | 替代方案 |
|------|---------|---------|
| bcrypt (新版) | 部分兼容 | @node-rs/bcrypt |
| sharp | 不兼容 | 使用 WASM 版本 |
| node-canvas | 不兼容 | @napi-rs/canvas |
| sqlite3 | 兼容 | bun:sqlite |
| grpc | 部分兼容 | @grpc/grpc-js |
| node-sass | 不兼容 | sass (纯 JS 版) |

### 3.2 lockfile 格式

Bun 使用二进制 lockfile 的决策带来了性能优势，但也带来了工程实践中的一些挑战。

**二进制不可读 vs JSON 的可读性**

| 场景 | package-lock.json（文本） | bun.lockb（二进制） |
|------|-------------------------|-------------------|
| 查看依赖树 | `cat package-lock.json` 直接查看 | 需要 `bun.lockb --view` 或其他工具 |
| 手动编辑 | 可以手动编辑 | 不能手动编辑 |
| PR Review | 可以看到依赖版本变更 | 只能看到文件 hash 变更 |
| 调试依赖问题 | 可以直接搜索 | 需要通过 Bun 命令查看 |

在实际的代码审查（Code Review）中，这种差异的影响尤为明显：

```
# package-lock.json 的 diff（可读）
- "express": "4.18.1"
+ "express": "4.18.2"

# bun.lockb 的 diff（不可读）
- bun.lockb (binary)
+ bun.lockb (binary)
```

解决方案：

1. **使用 `bun.lockb --view` 查看锁文件内容**（如果该命令存在）
2. **在 CI 中运行 `bun install --frozen-lockfile` 验证锁文件一致性**
3. **维护一份 package.json 的依赖清单作为人工审查的参考**

**git diff 困难**

二进制文件在 git 中无法进行有意义的 diff 对比。当两个分支修改了 bun.lockb 时，git 只能显示"文件已更改"，而无法显示具体哪些依赖的版本发生了变化。

| 场景 | JSON lockfile | Binary lockfile |
|------|--------------|-----------------|
| git diff | 显示具体变更行 | 仅显示文件 hash 变更 |
| 合并冲突 | 可手动解决 | 需要重新生成 |
| 历史追溯 | 可查看任意版本的依赖 | 只能查看当前版本的依赖 |

**冲突解决策略**

当多人协作修改依赖时，bun.lockb 的冲突解决策略如下：

```bash
# 1. 接受当前分支的 lockfile（合并时最常见的策略）
git checkout --ours -- bun.lockb
bun install  # 重新生成 lockfile

# 2. 接受对方分支的 lockfile
git checkout --theirs -- bun.lockb
bun install  # 重新生成 lockfile

# 3. 重新安装所有依赖
rm bun.lockb node_modules
bun install  # 全新生成 lockfile
```

### 3.3 插件生态

Bun 的打包器虽然性能优异，但插件生态远不如 webpack 成熟。这可能会影响某些特定场景的使用。

**bun build 插件生态不如 webpack 成熟**

截至 Bun 1.0，bun build 的插件生态与 webpack 的差距：

| 维度 | webpack | Bun build |
|------|--------|----------|
| 插件数量 | 数千个 | 数十个 |
| 社区贡献 | 活跃 | 起步阶段 |
| 企业支持 | 广泛 | 有限 |
| 文档质量 | 完善 | 尚可 |

**自定义 loader 开发复杂度**

Bun 的插件系统使用与 esbuild 类似的 API：

```typescript
// Bun 插件示例
const myPlugin = {
  name: "my-plugin",
  setup(build) {
    // 拦截 .vue 文件的处理
    build.onLoad({ filter: /\.vue$/ }, async (args) => {
      const content = await Bun.file(args.path).text();
      // 处理 Vue 单文件组件
      const compiled = compileVue(content);
      return {
        contents: compiled,
        loader: "js",
      };
    });
  },
};

await Bun.build({
  entrypoints: ["./src/index.ts"],
  plugins: [myPlugin],
});
```

与 webpack loader 的对比：

| 特性 | webpack loader | Bun 插件 |
|------|---------------|---------|
| 配置方式 | 链式配置 | 编程式配置 |
| 开发复杂度 | 中等 | 中等 |
| 调试难度 | 较高 | 较低 |
| 文档 | 完善 | 有限 |
| 社区示例 | 丰富 | 较少 |

### 3.4 测试框架

Bun 的测试框架虽然是其核心身份之一，但与 Jest 相比仍有一些差距。

**部分 Jest API 缺失**

以下 Jest API 在 Bun 中尚未实现或支持不完全：

| API | Bun 状态 | 影响 |
|-----|---------|------|
| jest.mock(module, factory) | 部分支持 | 模块级模拟受限 |
| jest.doMock() | 不支持 | 条件模拟受限 |
| jest.requireActual() | 不支持 | 获取真实模块受限 |
| jest.createMockFromModule() | 不支持 | 自动模块模拟受限 |
| jest.enableAutomock() | 不支持 | 自动模拟受限 |
| jest.disableAutomock() | 不支持 | 禁用自动模拟受限 |

**Mock 机制差异**

Bun 的 `mock()` 函数与 Jest 的 `jest.fn()` 在核心功能上一致，但在以下方面存在差异：

```typescript
// Jest 特有功能（Bun 中不支持）
jest.mock("axios");  // 自动模拟整个 axios 模块
jest.mock("fs", () => ({ readFile: jest.fn() }));  // 手动模拟模块

// Bun 支持的 Mock 方式
const mockFn = mock(() => "return value");
mockFn.mockImplementation(() => "new return");
mockFn.mockReturnValue("mocked");
mockFn.mockResolvedValue(Promise.resolve("async mocked"));
mockFn.mockRejectedValue(Promise.reject(new Error("error")));
```

---

## 4. 典型问题处理

本章节收集了 Bun 四个身份使用中最常见的 4 个问题，按照"症状 → 原因 → 解决方案"的格式组织。

### 问题 1：bun install 卡住

**症状**

执行 `bun install` 后，进度条长时间不更新或命令没有任何输出：
```
bun install v1.0.0
# 长时间没有进一步输出
```

或者在下载阶段卡住：
```
bun install v1.0.0
  [1/100] Resolving dependencies
# 卡在 Resolving dependencies 阶段
```

**原因**

这个问题的原因通常有以下几种：

1. **网络问题**：npm registry 不可达或响应缓慢。在中国大陆等地区，访问默认的 npm registry（registry.npmjs.org）经常遇到网络延迟或连接超时。

2. **DNS 解析问题**：Bun 在解析 registry 域名时遇到 DNS 解析失败。

3. **TLS 证书问题**：某些网络环境下，Bun 使用的 TLS 证书可能不被信任。

4. **缓存损坏**：`~/.bun/install/cache/` 目录中的缓存数据损坏，导致 Bun 尝试读取损坏的缓存数据。

**解决方案**

**方案 A：配置镜像源（推荐）**

```toml
# bunfig.toml — 在项目根目录或 ~/.bunfig.toml
[install]
# 使用国内镜像源
registry = "https://registry.npmmirror.com"
```

或者使用环境变量：

```bash
# 临时使用镜像源
BUN_REGISTRY_URL=https://registry.npmmirror.com bun install

# 永久设置
export BUN_REGISTRY_URL=https://registry.npmmirror.com
```

**方案 B：清除缓存并重试**

```bash
# 清除 Bun 的安装缓存
rm -rf ~/.bun/install/cache/*

# 删除 node_modules 和 lockfile
rm -rf node_modules bun.lockb

# 重新安装
bun install
```

**方案 C：检查网络连接**

```bash
# 测试 registry 连通性
curl -I https://registry.npmjs.org

# 如果超时，说明网络有问题
# 尝试使用不同的网络环境
```

**方案 D：使用离线模式**

```bash
# 如果之前已经安装过依赖（有缓存）
# 使用 --frozen-lockfile 跳过网络请求
bun install --frozen-lockfile
```

### 问题 2：bun run dev 报错

**症状**

执行 `bun run dev` 后出现错误：
```
$ bun run dev
error: script "dev" not found
  Check "scripts" in /path/to/package.json
```

或者：
```
$ bun run dev
error: Cannot find module 'vite'
```

**原因**

1. **script 未定义**：`package.json` 的 `scripts` 字段中没有名为 `dev` 的脚本。

2. **依赖未安装**：虽然 `package.json` 中声明了依赖，但未执行 `bun install`。

3. **script 格式差异**：某些在 npm 中可用的语法在 Bun 中不被支持。

**解决方案**

**方案 A：检查 package.json scripts**

```bash
# 查看 package.json 中定义的脚本
cat package.json | grep -A 20 '"scripts"'

# 或者使用 bun 命令查看
bun run  # 不加参数会列出所有可用的 script
```

确保 `package.json` 中包含以下内容：

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build ./src/index.ts --outdir=dist",
    "test": "bun test",
    "start": "bun run src/index.ts"
  }
}
```

**方案 B：安装依赖**

```bash
# 安装所有依赖
bun install

# 验证依赖已安装
ls node_modules/ | head -5
```

**方案 C：检查 script 语法**

Bun 支持大部分 npm script 语法，但有一些差异：

```json
{
  "scripts": {
    // 支持的语法
    "dev": "bun run --watch src/index.ts",
    "build": "bun build ./src/index.ts --outdir=dist",

    // 支持的链式调用
    "test": "bun test && echo 'Tests completed'",

    // 支持的环境变量
    "start": "NODE_ENV=production bun run src/index.ts"
  }
}
```

Bun 不支持的 npm script 特性：

- **pre/post 钩子**：Bun 不支持 `predev`、`postdev` 这样的自动钩子。需要使用 `&&` 手动链接
- **`npm_config_*` 环境变量**：Bun 不支持 npm 特定的环境变量
- **`$npm_package_*` 环境变量**：Bun 不支持通过环境变量访问 package.json 字段

### 问题 3：打包产物过大

**症状**

使用 `bun build` 打包后，产物文件体积超出预期：
```
$ bun build ./src/index.ts --outdir=dist
$ ls -lh dist/
total 2.5M
-rw-r--r-- 1 user user 2.5M index.js
```

打包产物包含了大量看似不必要的代码。

**原因**

1. **Tree-Shaking 未生效**：某些模块被错误地标记为"有副作用"（side effects），导致整个模块被包含在产物中。

2. **依赖包含过多代码**：某些第三方库没有正确设置 `sideEffects` 字段，或者整个库被导入（如 `import * from "lodash"`）。

3. **源码包含不必要的导入**：项目中导入了大量未使用的模块。

4. **Source Map 过大**：`sourcemap: "inline"` 模式下，Source Map 被嵌入产物中，大幅增加文件体积。

**解决方案**

**方案 A：检查 sideEffects 配置**

在 `package.json` 中设置 `sideEffects` 字段，帮助 Bun 的 Tree-Shaking 算法判断哪些模块有副作用：

```json
{
  "sideEffects": false,
  // 或者指定有副作用的文件
  "sideEffects": [
    "*.css",
    "./src/polyfills.ts"
  ]
}
```

**方案 B：优化导入方式**

```typescript
// 错误：导入整个 lodash 库
import _ from "lodash";

// 正确：只导入需要的函数
import merge from "lodash/merge";
// 或者使用 tree-shakable 的导入
import { merge } from "lodash-es";
```

**方案 C：使用外部依赖**

```bash
# 将 node_modules 中的依赖标记为 external，不打包进产物
bun build ./src/index.ts --outdir=dist --external "react" --external "react-dom"
```

或者在配置中指定：

```typescript
await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  external: ["react", "react-dom"],
});
```

**方案 D：禁用 Source Map 或使用外部 Source Map**

```bash
# 不使用 Source Map（最小体积）
bun build ./src/index.ts --outdir=dist --sourcemap=none

# 使用外部 Source Map（方便调试）
bun build ./src/index.ts --outdir=dist --sourcemap=external
```

**方案 E：启用压缩**

```bash
# 启用代码压缩
bun build ./src/index.ts --outdir=dist --minify
```

`--minify` 会同时启用以下优化：

| 优化类型 | 效果 | 典型缩减 |
|---------|------|---------|
| 去除空白 | 删除空格和换行 | 30-40% |
| 缩短标识符 | 将变量名缩短为 a/b/c | 10-20% |
| 语法压缩 | 简化表达式 | 5-10% |
| 死代码删除 | 删除不可达代码 | 5-30% |

### 问题 4：测试无法运行

**症状**

执行 `bun test` 后没有找到任何测试文件：
```
$ bun test
bun test v1.0.0
No tests found
```

或者测试文件被找到但执行失败：
```
$ bun test
bun test v1.0.0
SyntaxError: Unexpected token 'export'
```

**原因**

1. **Glob 模式匹配问题**：Bun 默认只查找匹配特定模式的文件，如果测试文件的命名不符合默认模式，就不会被找到。

2. **文件路径问题**：测试文件位于默认搜索路径之外。

3. **语法错误**：测试文件中使用了 Bun 不支持的语法特性。

**解决方案**

**方案 A：调整测试文件路径**

Bun 默认搜索以下模式的文件：

```
**/*.test.{js,ts,jsx,tsx}
**/*.spec.{js,ts,jsx,tsx}
**/*.test.{cjs,mjs}
**/__tests__/**/*.{js,ts,jsx,tsx}
```

确保测试文件命名符合上述模式：

```
# 推荐的命名方式
src/__tests__/calculator.test.ts
src/utils/__tests__/helper.test.ts
src/components/Button.test.tsx
src/services/user.spec.ts
```

**方案 B：显式指定测试文件**

```bash
# 运行指定文件
bun test src/__tests__/calculator.test.ts

# 使用 Glob 模式
bun test "src/**/*.test.ts"
```

**方案 C：检查 Bun 版本**

```bash
# 确保使用最新版本的 Bun
bun --version

# 如果版本较旧，升级到最新版
bun upgrade
```

某些语法特性可能只在特定版本的 Bun 中支持。

**方案 D：检查 TypeScript 配置**

虽然 Bun 不需要 `tsconfig.json` 来运行 TypeScript，但某些测试配置可能依赖 TypeScript 的编译选项：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true
  }
}
```

---

## 5. 必备知识与技能

在深入学习 Bun 的四个身份之前，掌握以下基础知识将帮助你更好地理解本章内容。

### 包管理器核心概念

**为什么需要**

Bun 的包管理器身份（`bun install`）是最受关注的功能之一。理解包管理器的核心概念有助于你理解 Bun 为什么比 npm 快，以及如何更有效地管理项目依赖。

**semver（语义化版本控制）**

npm 生态使用语义化版本控制（Semantic Versioning），版本号格式为 `主版本.次版本.补丁`（如 `4.18.2`）：

| 版本号变化 | 含义 | 示例 |
|-----------|------|------|
| 主版本（Major） | 不兼容的 API 变更 | 4.0.0 → 5.0.0 |
| 次版本（Minor） | 向后兼容的功能新增 | 4.18.0 → 4.19.0 |
| 补丁（Patch） | 向后兼容的 bug 修复 | 4.18.1 → 4.18.2 |

常见的版本范围符号：

| 符号 | 含义 | 示例 | 匹配范围 |
|------|------|------|---------|
| `^` | 兼容主版本 | `^4.18.0` | >=4.18.0 且 <5.0.0 |
| `~` | 兼容次版本 | `~4.18.0` | >=4.18.0 且 <4.19.0 |
| `*` | 任意版本 | `*` | 任何版本 |
| `>=` | 大于等于 | `>=4.0.0` | >=4.0.0 |
| `<=` | 小于等于 | `<=5.0.0` | <=5.0.0 |

**lockfile**

Lockfile（锁文件）记录了安装时解析的确切依赖版本，确保所有开发环境和 CI 环境安装完全相同的依赖树。

| 包管理器 | lockfile 文件名 | 格式 |
|---------|----------------|------|
| npm | package-lock.json | JSON |
| Yarn | yarn.lock | YAML |
| pnpm | pnpm-lock.yaml | YAML |
| Bun | bun.lockb | 二进制 |

**缓存**

包管理器缓存是加速后续安装的关键机制：

| 缓存机制 | 说明 | Bun 的实现 |
|---------|------|-----------|
| 本地缓存 | 下载的包存储在本地 | ~/.bun/install/cache/ |
| 硬链接 | 多项目共享缓存文件 | 支持 |
| 内容寻址 | 通过内容 hash 索引 | 支持 |
| LRU 清理 | 自动清理不常用的缓存 | 支持 |

### 打包器核心概念

**为什么需要**

Bun 的打包器身份（`bun build`）将 TypeScript/JavaScript 代码转换为可以在浏览器或 Node.js 中运行的优化代码。理解打包器的核心概念有助于你理解 Bun build 的配置选项和优化策略。

**Tree-Shaking（摇树优化）**

Tree-Shaking 是打包器中最重要的优化技术之一。它通过静态分析删除未使用的代码，减小打包产物的体积。

Tree-Shaking 的工作原理：

```typescript
// 源代码
// utils.ts
export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }  // 未使用
export function multiply(a, b) { return a * b; }  // 未使用

// index.ts
import { add } from "./utils";
console.log(add(1, 2));

// 经过 Tree-Shaking 后的产物
// 只有 add 函数被包含
function add(a, b) { return a + b; }
console.log(add(1, 2));
```

Tree-Shaking 的有效性取决于以下因素：

| 因素 | 影响 | 最佳实践 |
|------|------|---------|
| 模块格式 | ESM 支持 Tree-Shaking，CommonJS 不支持 | 使用 ESM（import/export） |
| sideEffects 配置 | 标记无副作用的模块 | 在 package.json 中设置 "sideEffects": false |
| 导入方式 | 命名导入支持 Tree-Shaking，默认导入可能不支持 | 使用 `import { fn }` 而非 `import lib` |

**代码分割（Code Splitting）**

代码分割将打包产物分割为多个 chunk，按需加载，减少初始加载时间：

```typescript
// 动态 import 触发代码分割
const module = await import("./heavy-component.ts");

// 静态 import 不会触发代码分割
import { heavyComponent } from "./heavy-component.ts";
```

**Source Map**

Source Map 将打包后的代码映射回原始源代码，方便调试：

| Source Map 模式 | 产物体积 | 调试体验 | 使用场景 |
|----------------|---------|---------|---------|
| none | 最小 | 无法调试 | 生产环境 |
| external | 中等 | 需要加载 .map 文件 | 推荐的生产环境 |
| inline | 最大（内嵌到产物） | 立即可用 | 开发环境 |
| linked | 中等 | 需要浏览器支持 | 特殊场景 |

### 测试方法论

**为什么需要**

Bun 的测试框架身份（`bun test`）支持多种测试类型。理解测试方法论有助于你编写高质量的测试用例。

**单元测试（Unit Test）**

测试最小的代码单元（函数、方法、类），不依赖外部系统：

```typescript
describe("Calculator", () => {
  it("should add two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

**集成测试（Integration Test）**

测试多个模块之间的交互，可能依赖数据库、API 等外部系统：

```typescript
describe("User API", () => {
  it("should create a new user", async () => {
    const response = await fetch("http://localhost:3000/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
    });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe("Alice");
  });
});
```

**Mock（模拟）**

Mock 用于隔离测试目标，替换外部依赖：

```typescript
// 模拟数据库查询
const mockQuery = mock(() => ({ id: 1, name: "Alice" }));

// 测试业务逻辑
function getUserName(id: number) {
  const user = mockQuery(id);
  return user.name;
}

expect(getUserName(1)).toBe("Alice");
expect(mockQuery).toHaveBeenCalledTimes(1);
expect(mockQuery).toHaveBeenCalledWith(1);
```

### 微服务架构基础

**为什么需要**

Bun.serve() 作为轻量级 API 网关的能力使其在微服务架构中具有独特价值。理解微服务架构的基础概念有助于你设计基于 Bun 的微服务系统。

**网关（Gateway）**

API 网关是微服务架构中的统一入口，负责：

| 职责 | 说明 | Bun 实现 |
|------|------|---------|
| 请求路由 | 根据 URL 路径分发请求 | Bun.serve + URL 解析 |
| 认证授权 | 验证请求身份 | 自定义中间件 |
| 限流 | 控制请求速率 | 自定义计数器 |
| 日志 | 记录请求日志 | 自定义中间件 |
| 负载均衡 | 分发请求到多个实例 | 配合反向代理 |

**服务发现（Service Discovery）**

服务发现是微服务之间互相定位的机制：

| 模式 | 说明 | Bun 实现 |
|------|------|---------|
| 客户端发现 | 客户端直接查询注册中心 | 自定义 HTTP 请求 |
| 服务端发现 | 通过负载均衡器路由 | 配合 Docker Compose |
| DNS 发现 | 通过 DNS 解析服务地址 | 使用 Docker 内置 DNS |

**路由（Routing）**

路由是 API 网关的核心功能，将请求分发到对应的微服务：

```typescript
// 基于 URL 前缀的路由
const routeMap = {
  "/api/users": "http://users-service:4001",
  "/api/orders": "http://orders-service:4002",
  "/api/products": "http://products-service:4003",
};
```

---

## 6. 示例代码与配置

本节详细解释 `examples/` 目录中的三个示例，包括设计思路、关键代码解析和运行方法。

### 示例 1：01-basic/identities.ts — 四大身份演示

**设计思路**

这个示例的目的是用最简洁的代码展示 Bun 的四个核心身份。每个身份对应一个代码片段，让读者在一分钟内理解 Bun 的"All-in-One"定位。

**关键代码解析**

```typescript
// 1. Runtime: Direct TS execution
console.log("=== Identity 1: Runtime ===");
console.log(`Running TypeScript natively, no compilation needed`);
console.log(`Bun version: ${Bun.version}`);
```

第一部分展示 Bun 的运行时身份。关键点在于：
- **无需编译**：TypeScript 代码直接被 Bun 执行，不需要 `tsc` 或 `ts-node`
- **Bun 全局对象**：`Bun` 是一个全局对象，不需要 import。它提供了 `Bun.version`、`Bun.nanoseconds()`、`Bun.hash()` 等丰富的内置 API

```typescript
// 2. Package Manager: Fast installs
console.log("\n=== Identity 2: Package Manager ===");
console.log(`bun install: 20x faster than npm`);
console.log(`Uses binary lockfile (bun.lockb)`);
```

第二部分展示 Bun 的包管理器身份。核心信息：
- **20 倍加速**：`bun install` 比 `npm install` 快 20 倍（缓存命中时甚至更快）
- **二进制 lockfile**：`bun.lockb` 使用二进制格式，解析速度比 JSON 格式快 10-50 倍

```typescript
// 3. Bundler: Built-in bundling
console.log("\n=== Identity 3: Bundler ===");
console.log(`bun build replaces webpack/rollup/esbuild`);
console.log(`Targets: browser, bun, node`);
```

第三部分展示 Bun 的打包器身份。关键信息：
- **替代多个工具**：`bun build` 可以替代 webpack、rollup、esbuild
- **多目标支持**：支持 `browser`、`bun`、`node` 三种目标环境，每种目标生成不同的打包产物

```typescript
// 4. Test Runner: Native testing
console.log("\n=== Identity 4: Test Runner ===");
const testMock = mock(() => "mocked!");
console.log(`Jest-compatible syntax (describe/it/expect)`);
```

第四部分展示 Bun 的测试框架身份。关键点：
- **内置 mock**：`mock()` 函数是全局可用的，不需要 import
- **Jest 兼容**：`describe`、`it`、`expect` 等 Jest API 在 Bun 中直接可用

**运行方法和预期输出**

```bash
# 在项目根目录运行
cd examples/01-basic
bun install
bun run identities.ts

# 预期输出
=== Identity 1: Runtime ===
Running TypeScript natively, no compilation needed
Bun version: 1.0.0

=== Identity 2: Package Manager ===
bun install: 20x faster than npm
Uses binary lockfile (bun.lockb)

=== Identity 3: Bundler ===
bun build replaces webpack/rollup/esbuild
Targets: browser, bun, node

=== Identity 4: Test Runner ===
Jest-compatible syntax (describe/it/expect)
```

**建议读者尝试的修改**

1. 修改 `Bun.version` 的输出格式，添加更多运行时信息
2. 尝试使用 `bun build` 打包一个简单的 TypeScript 文件，观察输出
3. 创建一个 `.test.ts` 文件，使用 `describe` 和 `it` 编写测试用例，然后用 `bun test` 运行

### 示例 2：02-advanced/benchmark-compare.ts — 性能基准对比

**设计思路**

这个示例通过实际测量 Bun 中关键操作的性能，并与 Node.js 的估计性能进行对比，让读者直观感受 Bun 的加速效果。

**关键代码解析**

```typescript
interface BenchmarkResult {
  operation: string;
  bunTimeUs: number;
  estimatedNodeTimeUs: number;
  estimatedSpeedup: string;
}
```

定义了基准测试的结果类型。`bunTimeUs` 是 Bun 上实际测量的微秒级耗时，`estimatedNodeTimeUs` 是基于公开基准测试估算的 Node.js 耗时。

```typescript
// Module load benchmark
let start = Bun.nanoseconds();
await import("node:fs");
let end = Bun.nanoseconds();
results.push({
  operation: "Module load (fs)",
  bunTimeUs: Math.round((end - start) / 1000),
  estimatedNodeTimeUs: Math.round((end - start) * 3 / 1000),
  estimatedSpeedup: "~3x",
});
```

模块加载基准测试使用 `Bun.nanoseconds()` 进行高精度计时。这里测试的是加载 `node:fs` 模块的时间。Bun 的模块加载比 Node.js 快约 3 倍，因为 JavaScriptCore 的模块解析速度优于 V8。

```typescript
// File I/O benchmark
start = Bun.nanoseconds();
await Bun.write("/tmp/test.txt", "benchmark data for performance comparison");
const file = Bun.file("/tmp/test.txt");
await file.text();
end = Bun.nanoseconds();
```

文件 I/O 基准测试展示了 Bun 的文件操作 API。`Bun.write()` 和 `Bun.file()` 是 Bun 原生 API，底层使用 Zig 的文件操作，避免了 Node.js 中 libuv 的抽象开销。

```typescript
// HTTP benchmark
start = Bun.nanoseconds();
const server = Bun.serve({ port: 0, fetch() { return new Response("ok"); } });
await fetch(`http://localhost:${server.port}/`);
server.stop();
end = Bun.nanoseconds();
```

HTTP 基准测试在本地创建一个临时 HTTP 服务器，发送一个请求，然后关闭服务器。`port: 0` 让操作系统自动分配一个可用端口。Bun 的 HTTP 处理速度是 Node.js 的约 4 倍，这得益于 Zig 实现的 HTTP 解析器和 io_uring 事件驱动。

**运行方法和预期输出**

```bash
bun run examples/02-advanced/benchmark-compare.ts

# 预期输出示例
Bun Performance Benchmarks (lower is better):
┌─────────┬──────────────────────┬────────────┬────────────────────┬────────────────┐
│ (index) │ operation            │ bunTimeUs  │ estimatedNodeTimeUs│ estimatedSpeedup│
├─────────┼──────────────────────┼────────────┼────────────────────┼────────────────┤
│ 0       │ Module load (fs)     │    120     │       360          │    ~3x         │
│ 1       │ File write+read (1KB)│     85     │       212          │    ~2.5x       │
│ 2       │ HTTP request (loopback)│   250   │      1000          │    ~4x         │
└─────────┴──────────────────────┴────────────┴────────────────────┴────────────────┘
```

**建议读者尝试的修改**

1. 增加更多的基准测试项目，如 JSON 解析、正则表达式匹配、加密哈希计算。例如，可以添加以下测试项：

```typescript
// JSON 解析基准测试
start = Bun.nanoseconds();
const jsonStr = JSON.stringify({ data: Array(1000).fill({ id: 1, name: "test" }) });
const parsed = JSON.parse(jsonStr);
end = Bun.nanoseconds();
results.push({
  operation: "JSON parse (1000 items)",
  bunTimeUs: Math.round((end - start) / 1000),
  estimatedNodeTimeUs: Math.round((end - start) * 1.5 / 1000),
  estimatedSpeedup: "~1.5x",
});
```

2. 修改文件大小（1KB → 1MB → 10MB），观察文件 I/O 性能随文件大小的变化趋势。Bun 的 `Bun.write()` 在处理大文件时，由于使用了 sendfile 系统调用和零拷贝技术，加速比会进一步提升。

3. 修改 HTTP 请求的并发数，测试高并发场景下的性能。可以在循环中发送 100 个并发请求，比较 Bun 的事件循环处理能力与 Node.js 的差异。

4. 在实际的 Node.js 环境中运行等效的基准测试，验证估算值的准确性。可以使用 `child_process` 模块在 Bun 脚本中启动 Node.js 进行对比测试。

5. 测试 Bun 独有的 API，如 `Bun.hash()`、`Bun.CryptoHasher` 等，展示 Bun 在特定操作上的性能优势。

### 示例 3：03-production/microservices.ts — 微服务网关

**设计思路**

这个示例展示了如何使用 Bun.serve() 实现一个轻量级的微服务 API 网关。设计目标是展示 Bun 在微服务架构中的实际应用能力。

**关键代码解析**

```typescript
interface Service {
  name: string;
  handler: (req: Request) => Response | Promise<Response>;
}

class MicroserviceGateway {
  private services: Map<string, Service> = new Map();
  // ...
}
```

定义了微服务网关的核心数据结构。每个服务有一个名称和一个请求处理函数。使用 `Map` 而不是对象来存储服务注册信息，因为 `Map` 提供了更好的性能和更清晰的 API。

```typescript
register(service: Service): void {
  this.services.set(service.name, service);
  console.log(`Registered: ${service.name}`);
}
```

`register()` 方法用于注册微服务。在生产环境中，这个注册过程可以扩展为：
1. 从配置文件读取服务列表
2. 从服务注册中心（如 Consul、etcd）动态发现服务
3. 通过环境变量配置服务地址

```typescript
start(gatewayPort: number): void {
  Bun.serve({
    port: gatewayPort,
    fetch: async (req) => {
      const url = new URL(req.url);
      const prefix = url.pathname.split("/")[1];

      const svc = this.services.get(prefix + "-service");
      if (svc) return svc.handler(req);

      return new Response("Not Found", { status: 404 });
    },
  });
  console.log(`Gateway running on port ${gatewayPort}`);
}
```

`start()` 方法启动 Bun.serve() 作为网关服务器。请求处理逻辑：
1. 解析 URL，提取路径的第一个段作为服务前缀（如 `/users` 的前缀是 `users`）
2. 根据前缀查找注册的服务（将 `users` 映射为 `users-service`）
3. 如果找到对应的服务，调用其处理函数
4. 如果没有匹配的服务，返回 404

```typescript
const gateway = new MicroserviceGateway();
gateway.register({ name: "users-service", handler: () => Response.json({ service: "users" }) });
gateway.register({ name: "orders-service", handler: () => Response.json({ service: "orders" }) });
gateway.start(3000);
```

初始化代码：创建网关实例，注册两个微服务（users-service 和 orders-service），启动网关监听 3000 端口。在实际项目中，每个服务的 handler 可以是一个完整的 Bun.serve() 实例或任意的 HTTP 处理函数。

```typescript
// Self-test
const r1 = await fetch("http://localhost:3000/users");
const r2 = await fetch("http://localhost:3000/orders");
console.log("Gateway test:", await r1.json(), await r2.json());
```

自测试代码验证网关的路由功能正常工作。发送请求到 `/users` 和 `/orders` 路径，验证响应是否正确。

**运行方法和预期输出**

```bash
bun run examples/03-production/microservices.ts

# 预期输出
Registered: users-service
Registered: orders-service
Gateway running on port 3000
Gateway test: { service: "users" } { service: "orders" }
```

**建议读者尝试的修改**

1. **添加更多服务**：注册 `products-service`、`payments-service`、`inventory-service` 等更多微服务，观察网关的扩展方式

2. **添加中间件**：在网关中添加认证、日志、限流等中间件。例如，在请求处理函数中添加 JWT 令牌验证：

```typescript
fetch: async (req) => {
  // 认证中间件
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  // 验证通过后继续路由
  const url = new URL(req.url);
  const prefix = url.pathname.split("/")[1];
  const svc = this.services.get(prefix + "-service");
  if (svc) return svc.handler(req);
  return new Response("Not Found", { status: 404 });
}
```

3. **服务发现**：实现基于环境变量或配置文件的动态服务发现。在生产环境中，微服务的地址通常是动态分配的（如 Kubernetes 中的 Pod IP），需要一个服务注册中心来管理这些地址。可以使用 Bun 的 SQLite 内置数据库实现一个轻量级的服务注册表。

4. **健康检查**：添加 `/health` 端点，返回所有注册服务的健康状态。每个微服务可以提供自己的健康检查接口，网关定期轮询这些接口，维护一个服务健康状态表。

5. **请求转发**：将请求完整转发到后端服务（不仅仅是返回静态响应）。使用 `fetch()` 函数将请求代理到后端服务，实现真正的 API 网关功能。

6. **错误处理**：添加统一的错误处理机制，包括超时控制、熔断降级和重试策略。Bun 的 Promise API 和 AbortController 可以方便地实现这些功能。

```typescript
// 带超时控制的请求转发
async function forwardRequest(url: string, request: Request, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response("Gateway Timeout", { status: 504 });
    }
    return new Response("Bad Gateway", { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
```

这个错误处理示例展示了 Bun 中如何实现生产级的微服务网关功能。通过 AbortController 实现超时控制，确保单个服务故障不会拖垮整个网关。

7. **日志记录**：添加请求日志记录功能，记录每个请求的方法、路径、状态码和处理时间。可以使用 `Bun.nanoseconds()` 精确计时，结合 structured logging 生成可查询的日志。

---

## 本章小结

本章深入分析了 Bun 的四大核心身份——Runtime（运行时）、Package Manager（包管理器）、Bundler（打包器）和 Test Runner（测试运行器），覆盖了以下内容：

1. **使用场景**：从开发环境统一到 CI/CD 流水线简化，从全栈开发到微服务架构，Bun 的四个身份在四个关键场景中展现出显著的价值。传统工具链需要 6-8 个独立工具的配置和维护，而 Bun 用一个二进制覆盖了所有需求，将配置复杂度从数百行降至几乎为零。

2. **实现原理**：深入分析了 JavaScriptCore 引擎集成、Zig 运行时层、全局缓存与硬链接机制、二进制 lockfile 设计、AST 解析管道、Tree-Shaking 算法、测试框架的 Jest 兼容层和 Mock 拦截机制。这些底层技术细节解释了 Bun 为什么能在各个维度上超越传统工具——JavaScriptCore 的急切解析策略使启动速度快 4-6 倍，硬链接机制使重复安装几乎零成本，二进制 lockfile 的解析速度比 JSON 格式快 10-50 倍。

3. **潜在风险与优化**：客观分析了兼容性风险、lockfile 格式挑战、插件生态差距和测试框架局限性。Bun 虽然性能优异，但在 C++ Addon 兼容性、jest.mock() 模块模拟、webpack 插件生态等方面仍存在差距。了解这些风险有助于你在选型时做出理性判断。

4. **典型问题处理**：提供了 4 个常见问题的症状、原因和解决方案，涵盖 bun install 卡住、bun run dev 报错、打包产物过大和测试无法运行等实际场景。

5. **必备知识与技能**：介绍了包管理器、打包器、测试方法论和微服务架构的基础知识，为后续章节的深入学习打下基础。

6. **示例代码**：三个递进式示例，从基础的身份展示到性能基准测试，再到生产级的微服务网关。每个示例都配有详细的代码解析和运行说明。

理解 Bun 的四个身份只是第一步。在接下来的章节中，我们将深入每个身份的实战应用和底层原理，逐步掌握 Bun 的全部能力。下一章将从包管理器开始，深入分析 bun install 的依赖解析算法、缓存策略和 monorepo 支持。

---

## 参考资源

- **Bun 官方文档 — 运行时**：https://bun.sh/docs/runtime
- **Bun 官方文档 — 包管理器**：https://bun.sh/docs/install
- **Bun 官方文档 — 打包器**：https://bun.sh/docs/bundler
- **Bun 官方文档 — 测试**：https://bun.sh/docs/test
- **JavaScriptCore 引擎介绍**：https://webkit.org/blog/1892/webkit-javascriptcore/
- **Zig 语言官方文档**：https://ziglang.org/documentation/
- **io_uring 异步 I/O 框架**：https://kernel.dk/io_uring.pdf
- **语义化版本控制规范**：https://semver.org/
- **微服务架构模式**：https://microservices.io/patterns/index.html
