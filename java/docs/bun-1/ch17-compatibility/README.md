# 第 17 章：兼容性红黑榜

> **本章目标**：全面评估 Bun 与 Node.js 生态的兼容性，通过红黑榜分类了解哪些 API 和模块可以无缝使用、哪些需要特殊处理、哪些必须寻找替代方案。帮助你在项目迁移时做出正确的技术决策。

---

## 1. 使用场景

Bun 作为一个新兴的 JavaScript/TypeScript 运行时，其最核心的问题就是"兼容性"。Node.js 经过十四年的发展，积累了庞大的生态系统——超过 200 万个 npm 包、数十万个开源项目、无数的企业级应用。Bun 要想获得广泛采用，必须解决与这个生态系统的兼容性问题。

**兼容性评估的三大使用场景**：

1. **评估 Node.js 项目迁移可行性**：当团队考虑将现有 Node.js 项目迁移到 Bun 时，首先需要回答的问题就是"我们的依赖能在 Bun 上运行吗？"这涉及到对项目依赖树中每一个包的兼容性评估，尤其是那些使用了 C++ 原生模块的包。

2. **排查兼容性问题**：在迁移过程中或新项目开发中，遇到"在 Node.js 上能运行，在 Bun 上报错"的情况时，需要快速定位问题根因。这可能是因为 Bun 的 Node.js API 兼容层存在差异，也可能是因为某个依赖包使用了 Bun 不支持的 API。

3. **寻找 C++ Addon 替代方案**：许多流行的 npm 包（如 bcrypt、sharp、node-sass）依赖 C++ 原生模块，这些模块通过 node-gyp 编译，而 Bun 不直接支持 node-gyp。当遇到这类依赖时，需要寻找纯 JavaScript 或 WASM 的替代方案。

**Bun 兼容性的设计哲学**

Bun 的兼容性策略可以概括为三个层次：

第一层是 **Web 标准 API**。Bun 原生实现了 fetch、WebSocket、Request、Response、ReadableStream 等 Web 标准 API。这些 API 在浏览器、Deno、Cloudflare Workers 中也可用，是最高级别的兼容性保障。Bun 在这一层的实现非常彻底，几乎完全符合 Web 标准规范。

第二层是 **Node.js API 兼容层**。Bun 实现了大部分 Node.js 内置模块（如 fs、path、crypto、http），以提供"开箱即用"的兼容性。这一层的实现采用"尽可能兼容"的策略，但在某些细节上存在差异——因为 Bun 的底层架构（JavaScriptCore + Zig）与 Node.js（V8 + libuv + C++）完全不同，某些 API 的行为必然有所不同。

第三层是 **npm 包生态兼容性**。Bun 的包管理器（bun install）兼容 npm 注册表和大部分 npm 包格式。但对于依赖 C++ 原生模块（通过 node-gyp 编译）的包，Bun 的支持有限。这是因为 node-gyp 编译的模块直接链接到 Node.js 的 V8 引擎和 libuv 库，而 Bun 使用 JavaScriptCore 引擎和 Zig 运行时，二进制不兼容。

**兼容性分级体系**

本章采用"红黑榜"的形式来组织兼容性信息：

- **黑榜（❌）**：不兼容的 API 或模块，需要寻找替代方案
- **红榜（⚠️）**：部分兼容，存在差异需要注意
- **金榜（✅）**：完全兼容，可以放心使用

这个分级体系帮助你在不同场景下做出快速判断。如果你是初次评估 Bun，可以重点关注金榜内容——这些是 Bun 最成熟的兼容部分。如果你在迁移过程中遇到问题，可以查阅红榜和黑榜，找到对应的解决方案。

**兼容性的演进性**

需要特别注意的是，Bun 的兼容性不是静态的。Bun 团队将兼容性作为最高优先级之一，每个版本都在改进。本章节的内容基于 Bun 1.0 版本，但 Bun 的更新非常频繁——有时一周内会有多个版本发布，每个版本都可能带来新的兼容性改进。

因此，本章提供的不只是静态的兼容性清单，更重要的是评估方法和问题排查思路。即使未来 Bun 的兼容性发生了变化，你也能通过本章提供的方法论自行评估。

### 场景一：评估 Node.js 项目迁移可行性

当你考虑将一个现有的 Node.js 项目迁移到 Bun 时，需要进行系统的兼容性评估。这个过程可以分为以下几个步骤：

**第一步：依赖清单审计**

首先，列出项目的所有依赖（包括直接依赖和间接依赖），并标注每个依赖的兼容性状态。一个典型的 Node.js 项目可能有 50-200 个直接依赖，间接依赖则可能达到数百甚至上千个。

```
项目依赖兼容性清单示例：

✅ express@4.18.2 — 完全兼容（纯 JS Web 框架）
✅ lodash@4.17.21 — 完全兼容（纯 JS 工具库）
✅ pino@8.15.0 — 完全兼容（纯 JS 日志库）
⚠️ prisma@5.3.0 — 部分兼容（查询引擎使用 Rust，兼容性良好）
⚠️ sharp@0.32.6 — 部分兼容（依赖 libvips，Bun 上需要 WASM 版本）
❌ bcrypt@5.1.0 — 不兼容（C++ 原生模块，需要替换为 bcryptjs）
❌ node-sass@9.0.0 — 不兼容（C++ 原生模块，需要替换为 sass）
```

**第二步：核心模块使用分析**

检查项目中使用的 Node.js 核心模块 API，确认哪些在 Bun 中完全兼容、哪些有差异：

```typescript
// 项目代码中使用的 Node.js API 分析
import fs from "fs";           // ✅ 完全兼容
import path from "path";       // ✅ 完全兼容
import crypto from "crypto";   // ✅ 完全兼容
import http from "http";       // ✅ 完全兼容
import { spawn } from "child_process";  // ⚠️ 部分兼容（选项处理有差异）
import vm from "vm";           // ⚠️ 部分兼容（某些沙箱特性有限制）
```

**第三步：构建和测试工具链分析**

检查项目使用的构建工具和测试框架：

```bash
# 构建工具
tsc          → bun build（或保持 tsc，Bun 可以运行）
webpack      → bun build（或保持 webpack）
esbuild      → 原生兼容

# 测试框架
jest         → bun test（兼容 Jest API）
mocha        → bun test（兼容大部分功能）
vitest       → 完全兼容
```

**第四步：运行时行为对比**

在评估兼容性时，不仅要看"能否运行"，还要看"运行行为是否一致"。有些 API 在 Bun 上能运行，但行为细节可能与 Node.js 不同：

```typescript
// 行为差异示例
// Node.js: fs.readFileSync 返回 Buffer
// Bun: fs.readFileSync 返回 Buffer（行为一致）

// Node.js: child_process.exec 的 maxBuffer 默认值不同
// Bun: child_process.exec 的 maxBuffer 可能使用不同默认值

// Node.js: process.nextTick 微任务执行顺序
// Bun: process.nextTick 兼容，但执行顺序可能与 Node.js 有微妙差异
```

### 场景二：排查兼容性问题

当你在 Bun 上运行 Node.js 项目时遇到错误，需要系统地进行兼容性问题排查。

**典型问题模式**

兼容性问题通常表现为以下几种模式：

1. **模块未找到错误**：`Error: Cannot find module 'xxx'`。这通常不是因为模块不存在，而是因为模块依赖了 C++ 原生模块，在 Bun 上无法加载。

2. **API 不存在错误**：`TypeError: xxx is not a function`。这表明代码使用了 Bun 尚未实现的 Node.js API。

3. **行为差异错误**：代码能运行，但结果与预期不符。这通常是因为 Bun 的 API 实现与 Node.js 存在细微差异。

4. **性能异常**：代码能运行，但性能明显低于 Node.js。这可能是因为代码使用了 Bun 未优化的 API 路径。

**系统化排查流程**

```
遇到兼容性问题
    │
    ▼
问题分类：
├── 模块加载失败 → 检查是否依赖 C++ 原生模块
│   ├── 是 → 寻找纯 JS 替代品或 WASM 版本
│   └── 否 → 检查模块导入路径是否正确
│
├── API 调用失败 → 检查是否使用了 Bun 未实现的 API
│   ├── 是 → 查看 Bun 文档确认 API 状态
│   └── 否 → 检查 API 使用方式是否正确
│
├── 行为不符合预期 → 对比 Node.js 和 Bun 的 API 行为
│   ├── 已知差异 → 调整代码适应 Bun 的行为
│   └── 未知差异 → 提交 issue 给 Bun 团队
│
└── 性能问题 → 使用 profiler 定位瓶颈
    ├── 已知未优化路径 → 使用替代方案
    └── 非预期性能问题 → 提交 issue
```

### 场景三：寻找 C++ Addon 替代方案

对于依赖 C++ 原生模块的项目，需要评估替代方案。以下是常见的替代策略：

**策略一：纯 JavaScript 替代**

许多 C++ 原生模块有纯 JavaScript 的替代品：

| 原生模块 | 纯 JS 替代 | 性能差异 |
|---------|-----------|---------|
| bcrypt | bcryptjs | 慢 2-3 倍（但大多数场景可接受） |
| node-sass | sass (Dart Sass) | 慢 1.5-2 倍 |
| sharp | jimp | 慢 5-10 倍 |
| node-canvas | canvas-skia | 功能接近 |

**策略二：WebAssembly 替代**

WASM 版本的 C 库可以在 Bun 上原生运行：

```typescript
// 使用 WASM 版本的库
import init, { resize } from "@wasm-vips/pkg";
await init();
const result = resize(buffer, 800, 600);
```

**策略三：Bun.FFI 直接调用 C 库**

Bun 的 FFI（Foreign Function Interface）允许直接调用系统 C 库：

```typescript
import { dlopen, suffix } from "bun:ffi";

const lib = dlopen(`libc.${suffix}`, {
  getpid: { args: [], returns: "int" },
});
const pid = lib.symbols.getpid();
```

---

## 2. 实现原理

要深入理解 Bun 的兼容性，必须了解其底层的实现原理。Bun 的兼容性不是简单的"API 映射"，而是在不同架构上的重新实现。

### 2.1 Bun 的 Node.js API 兼容层架构

Bun 的 Node.js API 兼容层是一个复杂的软件工程成果。它不是简单地"在 Bun 中嵌入 Node.js"，而是使用 Zig 语言和 JavaScriptCore 引擎重新实现了 Node.js 的 API。

**兼容层的层次结构**

```
用户代码 (JavaScript/TypeScript)
    │
    ▼
┌─────────────────────────────────────────┐
│    Bun 的 Node.js API 兼容层            │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  Node.js     │  │  Web 标准 API    │  │
│  │  API 包装    │  │  原生实现        │  │
│  │  (JS 层面)   │  │  (JS 层面)       │  │
│  └──────┬───────┘  └───────┬──────────┘  │
│         │                  │              │
│  ┌──────▼──────────────────▼──────────┐  │
│  │   Zig 运行时核心层                  │  │
│  │   • 文件系统操作 (zig fs)          │  │
│  │   • 网络 I/O (io_uring/kqueue)    │  │
│  │   • 加密操作 (BoringSSL)          │  │
│  │   • 子进程管理                     │  │
│  └────────────────────────────────────┘  │
│         │                                │
│  ┌──────▼────────────────────────────┐   │
│  │   JavaScriptCore 引擎             │   │
│  │   • JS 解析和执行                 │   │
│  │   • 内存管理和 GC                 │   │
│  │   • Web API 实现                  │   │
│  └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**与 Node.js 的架构对比**

Node.js 的架构是：V8 引擎 + libuv I/O 框架 + C++ 绑定的 Node.js API。Bun 的架构是：JavaScriptCore 引擎 + Zig I/O 运行时 + Zig/JS 绑定的 API。

这个架构差异导致了以下兼容性特点：

1. **底层依赖不同**：Node.js 的 C++ 原生模块直接链接到 V8 和 libuv，而 Bun 使用 JavaScriptCore 和 Zig 运行时。因此，任何通过 node-gyp 编译的 C++ 模块都无法直接在 Bun 上运行。

2. **API 实现方式不同**：Node.js 的 fs 模块在 C++ 层面实现，通过 V8 的 N-API 暴露给 JavaScript。Bun 的 fs 模块在 Zig 层面实现，通过 JavaScriptCore 的 API 暴露给 JavaScript。虽然接口相同，但内部实现路径完全不同。

3. **事件循环模型不同**：Node.js 使用 libuv 的事件循环，Bun 使用 Zig 实现的事件循环（基于 io_uring/kqueue）。这导致某些与事件循环交互的 API（如 process.nextTick、setImmediate）的行为可能存在微妙差异。

**兼容层的实现策略**

Bun 采用三种策略来实现 Node.js API：

**策略一：直接映射到 Web 标准 API**

对于在 Web 标准中有对应物的 API，Bun 直接映射到其 Web 标准实现：

```typescript
// Bun 内部：fetch API 映射
// Node.js: require('http') 和 require('https')
// Bun: 直接使用内置的 Web fetch API

// 用户代码（在 Bun 和 Node.js 中都能运行）
const http = require('http');
http.get('http://example.com', (res) => {
  // ...
});

// Bun 内部实现（简化）
// Bun 将 http.get 映射到内部的 fetch 实现
```

**策略二：在 Zig 层面重新实现**

对于核心的 I/O 操作，Bun 在 Zig 层面重新实现，确保性能：

```zig
// Bun 内部（Zig 代码）：fs.readFileSync 的实现
pub fn readFileSync(path: []const u8) ![]u8 {
    const fd = try std.os.open(path, .{ .RDONLY }, 0);
    defer std.os.close(fd);
    
    const stat = try std.os.fstat(fd);
    const buf = try allocator.alloc(u8, @as(usize, @intCast(stat.size)));
    _ = try std.os.read(fd, buf);
    
    return buf;
}
```

**策略三：在 JS 层面包装**

对于非性能关键的 API，Bun 在 JavaScript 层面实现包装：

```typescript
// Bun 内部（JS 代码）：util.promisify 的实现
function promisify(original: Function): Function {
  return function (...args: any[]) {
    return new Promise((resolve, reject) => {
      original.call(this, ...args, (err: Error, ...results: any[]) => {
        if (err) reject(err);
        else resolve(results.length > 1 ? results : results[0]);
      });
    });
  };
}
```

**JS 包装层的拦截机制**

深入理解 Bun 的 Node.js API 兼容层，需要了解其模块拦截机制。当用户代码执行 `require("fs")` 或 `import fs from "fs"` 时，Bun 的模块加载器会拦截这个请求，并将其重定向到 Bun 内部的 Node.js 兼容实现，而不是 Node.js 的原生模块。这个拦截机制在 Bun 的 JavaScript 层实现，通过一个内部的模块映射表来完成。

```typescript
// Bun 内部的模块映射表（概念性代码）
const nodeModuleMap = new Map([
  ["fs", "bun:internal/node/fs"],
  ["path", "bun:internal/node/path"],
  ["crypto", "bun:internal/node/crypto"],
  ["http", "bun:internal/node/http"],
  ["child_process", "bun:internal/node/child_process"],
  // ... 其他模块映射
]);

// 当用户 require("fs") 时，Bun 实际加载的是 bun:internal/node/fs
// 这个内部模块使用 Zig 和 JavaScriptCore API 重新实现了 Node.js 的 fs API
```

这种拦截机制的实现方式决定了兼容层的两个关键特性。第一，**透明性**——用户代码不需要做任何修改就能使用 Node.js 的核心模块，因为模块名称和接口完全一致。第二，**独立性**——Bun 的兼容层实现完全独立于 Node.js 的源代码，不依赖于 Node.js 的任何内部实现细节，这使得 Bun 可以自由优化而不受 Node.js 实现变更的影响。

然而，这种独立实现也带来了挑战。Node.js 的某些 API 行为依赖于 V8 引擎的特殊特性（如微任务队列的执行时机、垃圾回收的回调机制），而 JavaScriptCore 没有完全等效的机制。Bun 的兼容层必须通过模拟来实现这些行为，而模拟在某些边缘情况下可能与原生行为存在差异。例如，`process.nextTick` 的回调执行顺序在 Bun 和 Node.js 之间可能存在细微差别，因为两个引擎的微任务队列调度策略不同。

**模块解析规则的差异**

Bun 的模块解析规则与 Node.js 大部分一致，但存在以下关键差异。第一，Bun 原生支持 TypeScript 和 JSX 的解析，不需要额外的编译步骤——当 `require("./module")` 时，Bun 会自动查找 `.ts`、`.tsx`、`.jsx` 文件，而 Node.js 默认只查找 `.js` 文件。第二，Bun 的包解析优先使用 Bun 自己的 lockfile（bun.lockb），而不是 package-lock.json 或 yarn.lock，但 bun.lockb 的内容与 npm 的 lockfile 是语义兼容的。第三，Bun 支持 `package.json` 中的 `"bun"` 条件导出字段，允许包作者为 Bun 提供专门的实现入口。这些差异在大多数场景下不会引起问题，但在某些依赖精确模块解析路径的场景下（如使用自定义 loader 或 resolver 的框架）可能导致行为不一致。

### 2.2 Node.js 核心模块兼容性分析

以下是 Bun 对 Node.js 核心模块的兼容性详细分析。

**fs 模块：完全兼容（✅）**

Bun 的 fs 模块实现了 Node.js fs 模块的绝大部分 API，包括同步和异步版本：

```typescript
import fs from "fs";
import fsp from "fs/promises";

// 同步 API — 全部兼容
fs.existsSync("/path");
fs.readFileSync("/path", "utf-8");
fs.writeFileSync("/path", "content");
fs.mkdirSync("/path", { recursive: true });
fs.readdirSync("/path");
fs.statSync("/path");
fs.unlinkSync("/path");
fs.rmSync("/path", { recursive: true, force: true });
fs.chmodSync("/path", 0o644);
fs.chownSync("/path", uid, gid);
fs.renameSync("/path", "/new-path");
fs.copyFileSync("/path", "/new-path");
fs.watchFile("/path", callback);
fs.unwatchFile("/path");

// 异步 API — 全部兼容
await fsp.readFile("/path", "utf-8");
await fsp.writeFile("/path", "content");
await fsp.mkdir("/path", { recursive: true });
await fsp.readdir("/path");
await fsp.stat("/path");
await fsp.unlink("/path");
await fsp.rm("/path", { recursive: true, force: true });

// fs.Dir 和 fs.Dirent — 兼容
const dir = await fsp.opendir("/path");
for await (const entry of dir) {
  console.log(entry.name, entry.isFile());
}
```

需要注意的是，fs 模块的性能在 Bun 上通常优于 Node.js，因为 Bun 在 Zig 层面实现了文件系统操作，利用了 io_uring（Linux）或 kqueue（macOS）的异步 I/O 能力。

**path 模块：完全兼容（✅）**

path 模块的所有 API 在 Bun 上完全兼容：

```typescript
import path from "path";

path.basename("/usr/local/bin/node");   // "node"
path.dirname("/usr/local/bin/node");    // "/usr/local/bin"
path.extname("image.png");              // ".png"
path.join("/app", "src", "index.ts");   // "/app/src/index.ts"
path.resolve("relative", "path");       // "/absolute/path"
path.parse("/var/log/app.log");         // { root, dir, base, ext, name }
path.format({ dir: "/home", base: "file.txt" });
path.isAbsolute("/usr/bin");            // true
path.normalize("/usr//local/../bin");   // "/usr/bin"
path.relative("/usr/local", "/usr/bin"); // "../bin"
path.sep;                               // "/" or "\\"
path.delimiter;                         // ":" or ";"
```

**crypto 模块：完全兼容（✅）**

Bun 的 crypto 模块使用 BoringSSL（Google 的 OpenSSL 分支）实现，提供了与 Node.js crypto 模块几乎相同的功能：

```typescript
import crypto from "crypto";

// 哈希算法
crypto.createHash("sha256").update("data").digest("hex");
crypto.createHash("sha512").update("data").digest("hex");
crypto.createHash("md5").update("data").digest("hex");
crypto.createHash("sha1").update("data").digest("hex");

// HMAC
crypto.createHmac("sha256", "key").update("data").digest("hex");

// 加密和解密
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
// ...

// 签名和验证
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const sign = crypto.createSign("SHA256");
sign.update("data");
const signature = sign.sign(privateKey, "hex");

// 随机数
crypto.randomBytes(32);
crypto.randomUUID();

// 密钥派生
crypto.pbkdf2Sync("password", "salt", 100000, 32, "sha256");

// 安全比较
crypto.timingSafeEqual(Buffer.from("a"), Buffer.from("a"));
```

**http 模块：完全兼容（✅）**

Bun 的 http 模块在 Zig 层面实现了 HTTP 解析和序列化，性能优于 Node.js 的 http 模块：

```typescript
import http from "http";

// 创建服务器
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});
server.listen(3000);

// 发起请求
http.get("http://example.com", (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => console.log(data));
});

// Agent
const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });

// 状态码和方法
http.STATUS_CODES[200]; // "OK"
http.METHODS;           // ["GET", "POST", ...]
```

**os 模块：完全兼容（✅）**

```typescript
import os from "os";

os.platform();     // "linux" / "darwin" / "win32"
os.arch();         // "x64" / "arm64"
os.type();         // "Linux" / "Darwin" / "Windows_NT"
os.release();      // "5.15.0-86-generic"
os.hostname();     // "my-host"
os.cpus();         // [{ model, speed, times }, ...]
os.totalmem();     // 17179869184 (16 GB)
os.freemem();      // 8589934592 (8 GB)
os.homedir();      // "/home/user"
os.tmpdir();       // "/tmp"
os.loadavg();      // [1.5, 1.2, 0.9]
os.networkInterfaces(); // { eth0: [...], lo: [...] }
os.userInfo();     // { username, uid, gid, shell, homedir }
os.uptime();       // 123456
os.EOL;            // "\n" or "\r\n"
```

**stream 模块：完全兼容（✅）**

```typescript
import { Readable, Writable, Transform } from "stream";

// Readable
const readable = new Readable({
  read() {
    this.push("data");
    this.push(null);
  },
});

// Writable
const writable = new Writable({
  write(chunk, encoding, callback) {
    console.log(chunk.toString());
    callback();
  },
});

// Transform
const transform = new Transform({
  transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  },
});

// pipeline
import { pipeline } from "stream/promises";
await pipeline(readable, transform, writable);
```

**events 模块：完全兼容（✅）**

```typescript
import { EventEmitter } from "events";

const emitter = new EventEmitter();
emitter.on("event", handler);
emitter.once("event", handler);
emitter.off("event", handler);
emitter.emit("event", data);
emitter.eventNames();
emitter.listenerCount("event");
emitter.setMaxListeners(100);
emitter.getMaxListeners();
emitter.prependListener("event", handler);
emitter.rawListeners("event");
emitter.removeAllListeners("event");
```

### 2.3 child_process 模块差异分析

Bun 的 child_process 模块在大部分场景下兼容，但存在一些已知差异。

**exec 和 execSync**

Bun 的 exec 实现与 Node.js 的差异主要体现在以下方面：

```typescript
import { exec, execSync } from "child_process";

// 基本用法兼容
const result = execSync("echo hello");
console.log(result.toString()); // "hello\n"

// 选项处理差异
execSync("command", {
  // ✅ 兼容的选项
  cwd: "/path",
  env: { PATH: "/usr/bin" },
  encoding: "utf-8",
  timeout: 5000,
  maxBuffer: 1024 * 1024,
  
  // ⚠️ 可能不兼容的选项
  // windowsHide: true,       // Windows 特定，Bun 不支持
  // killSignal: "SIGTERM",   // 行为可能不同
});

// Shell 选项
execSync("echo $HOME", { shell: true }); // ✅ 兼容
```

**spawn**

```typescript
import { spawn } from "child_process";

// 基本用法兼容
const child = spawn("ls", ["-la"], {
  cwd: "/path",
  env: { PATH: "/usr/bin" },
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdout.on("data", (data) => {
  console.log(data.toString());
});

child.on("close", (code) => {
  console.log(`exit code: ${code}`);
});

// ⚠️ 已知差异
// - windowsVerbatimArguments: 不适用
// - detached: 行为可能不同
// - shell 选项：在某些平台上行为不同
```

**fork**

Bun 的 fork 实现目前存在较多限制。fork 在 Node.js 中用于创建新的 Node.js 进程来执行 JavaScript 文件，但在 Bun 中，由于没有嵌入 Node.js 运行时，fork 的实现面临挑战：

```typescript
import { fork } from "child_process";

// ⚠️ fork 在 Bun 上的限制：
// - 子进程默认使用 Bun 运行时，而非 Node.js
// - 某些 IPC 消息可能不兼容
// - 与 cluster 模块的交互可能有问题
```

**child_process 底层实现差异详解**

理解 child_process 在 Bun 上的行为差异，需要从底层实现原理入手。Node.js 的 child_process 模块使用 libuv 的进程管理 API（uv_spawn），而 Bun 使用 Zig 标准库中的进程管理功能。这两个实现的核心差异体现在以下四个方面。

第一个差异是 **进程创建机制**。libuv 的 uv_spawn 是一个跨平台封装，在 Unix 上使用 fork+exec 模式，在 Windows 上使用 CreateProcess API。Bun 的 Zig 实现同样使用平台原生 API，但参数处理和选项解析的逻辑与 Node.js 不同。例如，Node.js 在解析 spawn 选项时，会对 `env` 对象进行深拷贝并添加继承的环境变量，而 Bun 可能使用不同的环境变量合并策略。这意味着如果子进程的行为依赖于特定的环境变量继承规则，在 Bun 和 Node.js 上可能得到不同的结果。

第二个差异是 **stdio 管道管理**。Node.js 使用 libuv 的管道 API（uv_pipe）来管理子进程的 stdio，支持多种管道模式（pipe、inherit、ignore、overlapped）。Bun 使用 Zig 的管道实现，虽然功能等价，但管道缓冲区的大小和刷新策略可能不同。这在高吞吐量的 stdio 通信场景下表现尤为明显——如果父进程和子进程之间通过 stdin/stdout 传递大量数据，Bun 和 Node.js 的背压行为可能存在差异，导致死锁或数据截断的风险。

第三个差异是 **退出码和信号处理**。Node.js 的 child_process 模块对子进程退出码和信号的处理有一套完整的逻辑，包括对 Windows 平台的特殊处理。Bun 的实现可能在某些边缘情况下报告不同的退出码。例如，当子进程被信号杀死时，Node.js 通过 `process.kill` 和信号编号的映射来报告退出信号，而 Bun 的退出信号映射可能不完全一致。

```typescript
// 退出码处理差异示例
const { spawn } = require("child_process");

// 在 Node.js 中，被 SIGKILL 杀死的进程
// child.exitCode = null, child.signalCode = "SIGKILL"
// 在 Bun 中，signalCode 的字符串值可能不同

const child = spawn("sleep", ["10"]);
setTimeout(() => child.kill("SIGKILL"), 100);
child.on("exit", (code, signal) => {
  // Node.js: code = null, signal = "SIGKILL"
  // Bun: 行为可能类似，但某些信号名称可能有差异
  console.log(`exit code: ${code}, signal: ${signal}`);
});
```

第四个差异是 **Windows 平台兼容性**。Node.js 的 child_process 在 Windows 上有大量的特殊处理代码，包括命令路径自动补全（添加 .cmd 或 .exe 后缀）、windowsVerbatimArguments 选项、windowsHide 选项等。Bun 对 Windows 平台的支持目前仍在完善中，某些 Windows 特定的 child_process 选项可能不被支持或行为不同。在 Windows 上迁移 child_process 相关的代码时，建议进行充分的测试。

**child_process 兼容性最佳实践**

为了最大限度地减少 child_process 的兼容性问题，建议遵循以下最佳实践。第一，尽可能使用 `spawn` 而非 `exec`，因为 spawn 的选项更少、行为更可预测，且不存在缓冲区溢出风险。第二，始终显式指定所有关键选项，不要依赖默认值。第三，对于跨平台场景，避免使用 Windows 特定的选项（如 windowsHide、windowsVerbatimArguments）。第四，在代码中添加运行时检测，根据运行时选择不同的实现路径。

### 2.4 vm 模块的限制

Bun 实现了 vm 模块的核心功能，但在某些高级特性上存在限制。

**支持的 API**

```typescript
import vm from "vm";

// ✅ 兼容
vm.runInThisContext("1 + 2");              // 3
vm.runInNewContext("a + b", { a: 1, b: 2 }); // 3

const sandbox = {};
const ctx = vm.createContext(sandbox);
vm.runInContext("x = 42", ctx);
console.log(sandbox.x); // 42

const script = new vm.Script("return name");
const result = script.runInNewContext({ name: "Bun" });
console.log(result); // "Bun"

const fn = vm.compileFunction("return a + b", ["a", "b"]);
console.log(fn(3, 7)); // 10

console.log(vm.isContext(ctx)); // true
```

**已知限制**

vm 模块在 Bun 上存在以下限制：

1. **timeout 选项可能不精确**：在 Node.js 中，vm 模块的 timeout 选项使用 V8 的微任务检查点机制来实现精确超时。Bun 的 JavaScriptCore 引擎没有完全等效的机制，因此 timeout 的实现可能不如 Node.js 精确。

2. **importModuleDynamically 不支持**：Node.js 的 vm 模块支持在沙箱中使用动态 import（通过 importModuleDynamically 选项），但 Bun 目前不支持这个特性。

3. **sandbox 中的全局对象**：Bun 的 vm.createContext 创建的沙箱可能不包含与 Node.js 完全相同的全局对象。例如，某些 Node.js 特定的全局变量（如 process、Buffer）在 Bun 的沙箱中可能不可用，除非显式注入。

4. **性能差异**：由于 JavaScriptCore 和 V8 的沙箱实现不同，Bun 的 vm 模块在某些场景下的性能可能与 Node.js 有显著差异。

```typescript
// ⚠️ 在 Bun 中需要注意的模式
vm.runInNewContext(
  "console.log('hello')",
  { console } // 需要显式注入 console
);

// Node.js 中某些全局变量在 Bun 沙箱中可能不可用
vm.runInNewContext(
  "typeof process !== 'undefined'",
  {} // process 可能未定义
);
```

### 2.5 worker_threads 模块的替代方案

Bun 的 worker_threads 模块实现了与 Node.js 类似的 API，但底层实现不同。

**基本 API 兼容**

```typescript
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

// 主线程
if (isMainThread) {
  const worker = new Worker(`
    const { parentPort } = require("worker_threads");
    parentPort.postMessage("hello from worker");
  `, { eval: true });
  
  worker.on("message", (msg) => {
    console.log(msg); // "hello from worker"
  });
}
```

**Bun 的 Worker 实现**

Bun 使用 JavaScriptCore 的机制来实现 Web Workers 规范，worker_threads 模块是在此基础上的包装。这意味着：

1. **worker 使用 JavaScriptCore 引擎**：Bun 的 Worker 使用 JavaScriptCore 引擎执行代码，而不是 V8。

2. **与 Bun 运行时集成**：Worker 可以访问 Bun 的全局 API（如 Bun.file、Bun.write），但不能访问 Node.js 特定的全局变量（除非显式注入）。

3. **模块解析**：Worker 中的模块解析遵循 Bun 的解析规则，而不是 Node.js 的解析规则。

**与 Node.js worker_threads 的差异**

```typescript
// ⚠️ 在 Bun 中需要注意的差异

// 1. eval 模式中的 require
// Node.js: eval 模式中 require 可用
// Bun: eval 模式中 require 也可用（Bun 提供了兼容层）

// 2. workerData 传递
// Node.js: workerData 通过 V8 序列化
// Bun: workerData 通过 JavaScriptCore 序列化（行为类似）

// 3. SharedArrayBuffer
// Node.js: 支持
// Bun: 支持

// 4. transferList
// Node.js: 支持 ArrayBuffer 和 MessagePort
// Bun: 支持 ArrayBuffer
```

**worker_threads 底层序列化机制**

worker_threads 的核心机制之一是跨线程的数据序列化。Node.js 使用 V8 的序列化 API（v8.serialize 和 v8.deserialize）在线程间传递数据，支持结构化克隆算法（Structured Clone Algorithm），可以传输大多数 JavaScript 数据类型，包括对象、数组、Map、Set、Date、RegExp、ArrayBuffer 和 SharedArrayBuffer。

Bun 使用 JavaScriptCore 的序列化机制来实现类似的功能。两种序列化机制在语义上基本等价，但在以下方面存在差异。第一，JavaScriptCore 的序列化不支持 Node.js 特定的类型（如 Buffer 的子类、Stream 实例），如果 workerData 中包含了这些类型，在 Bun 上可能序列化失败或得到不同的结果。第二，原型链的处理方式不同——Node.js 的 V8 序列化会保留对象的原型链信息，而 JavaScriptCore 的序列化可能只保留普通对象的属性，不保留自定义原型。这意味着如果 workerData 中包含自定义类的实例，在 Bun 上反序列化后可能变成一个普通对象。

```typescript
// 序列化差异示例
class CustomClass {
  constructor(public value: number) {}
  getDouble(): number {
    return this.value * 2;
  }
}

const data = new CustomClass(42);

// 主线程发送
worker.postMessage(data);

// Worker 线程接收
parentPort.on("message", (received) => {
  // Node.js: received 是 CustomClass 的实例，received.getDouble() 可用
  // Bun: received 可能是普通对象 { value: 42 }，received.getDouble() 不可用
  console.log(received.value); // 42（两者都可用）
  // console.log(received.getDouble()); // Bun 上可能报错
});
```

**worker_threads 与 Bun.Worker 的选择**

Bun 提供了两套 Worker API：兼容 Node.js 的 `worker_threads` 模块和 Bun 原生的 `Bun.Worker` API。在 Bun 上使用 Worker 时，如果项目不要求与 Node.js 保持完全兼容，建议优先使用 Bun 原生的 `Bun.Worker` API，因为它性能更好且与 Bun 的运行环境集成更紧密。如果项目需要在 Bun 和 Node.js 之间保持可移植性，则使用 `worker_threads` 模块。

### 2.6 N-API 支持状态

N-API（Node-API）是 Node.js 提供的一个稳定的 C 语言 API，用于构建原生模块。它允许原生模块在不同版本的 Node.js 之间二进制兼容。

**Bun 的 N-API 兼容性**

Bun 实现了 N-API 规范（版本 1-8），但有一些限制：

```typescript
// N-API 模块在 Bun 上的兼容性
// ✅ 完全兼容的 N-API 功能
napi_get_undefined
napi_get_null
napi_get_global
napi_create_object
napi_create_string_utf8
napi_create_array
napi_get_named_property
napi_set_named_property
napi_call_function
napi_create_function
napi_create_buffer
napi_create_error

// ⚠️ 部分兼容
napi_create_external_buffer
napi_wrap
napi_unwrap
napi_add_env_cleanup_hook
napi_create_threadsafe_function

// ❌ 不兼容
// 直接操作 V8 引擎的 API（Node.js 内部使用）
// 依赖 libuv 的 API
```

**N-API 兼容性的实现原理**

Bun 的 N-API 兼容层是一个值得深入理解的技术细节。N-API 本质上是一个 C 语言的 ABI（应用程序二进制接口）规范，定义了原生模块与 JavaScript 运行时之间的交互方式。Node.js 的 N-API 实现直接调用 V8 引擎的 C++ API，而 Bun 的 N-API 实现则需要将这些调用翻译为 JavaScriptCore 引擎的对应操作。

这个过程涉及以下几个关键技术点。第一，**类型映射**——N-API 定义了 napi_value 类型来表示 JavaScript 值，在 Node.js 中它对应 V8 的 v8::Value 指针，在 Bun 中它对应 JavaScriptCore 的 JSValueRef。Bun 的 N-API 兼容层需要在这两种类型之间建立正确的映射关系。第二，**生命周期管理**——N-API 使用引用计数来管理 JavaScript 对象的生命周期，Bun 需要确保 JavaScriptCore 的垃圾回收机制与 N-API 的引用计数机制正确交互。第三，**错误处理**——N-API 使用状态码和异常机制来报告错误，Bun 需要将这些映射到 JavaScriptCore 的异常处理机制。

N-API 的版本演进也是需要关注的重点。N-API v1 到 v8 覆盖了大多数常见操作，包括创建和操作 JavaScript 值、调用函数、处理错误等。Bun 当前实现了这些版本中的大部分功能。N-API v9 引入了 Promise 相关的 API（napi_create_promise、napi_resolve_deferred 等），这些 API 依赖于 JavaScript 运行时的 Promise 实现。Bun 的 JavaScriptCore 引擎完全支持 Promise，因此理论上这些 API 也可以实现，但需要 Bun 团队在 N-API 兼容层中添加对应的绑定代码。

**N-API 模块加载流程**

当一个 N-API 模块在 Bun 上加载时，实际经历了以下步骤。第一步，Bun 的模块加载器检测到 .node 文件，识别其为原生模块。第二步，Bun 调用操作系统的动态链接器（dlopen 或 LoadLibrary）加载 .node 文件。第三步，Bun 调用模块的初始化函数（通常名为 napi_register_module_v1 或 Napi::RegisterModule），传入 Bun 自己实现的 napi_env 结构体。第四步，模块的初始化代码调用 N-API 函数来注册 JavaScript 函数和对象，这些调用被 Bun 的 N-API 兼容层拦截并翻译为 JavaScriptCore 的操作。第五步，模块初始化完成，返回一个包含导出函数和对象的 JavaScript 对象。

这个流程中的关键点在于第三步——Bun 提供的 napi_env 结构体必须与 Node.js 的 napi_env 在 ABI 层面兼容。任何结构体布局的差异都会导致模块初始化失败。Bun 通过精确模拟 Node.js 的 napi_env 结构体布局来实现 ABI 兼容性，这也是 Bun 的 N-API 兼容层最核心的技术挑战之一。

**NAPI-RS 兼容性**

NAPI-RS 是一个使用 Rust 构建 N-API 模块的框架。由于 Bun 实现了 N-API，大部分 NAPI-RS 模块可以在 Bun 上运行：

```rust
// 使用 NAPI-RS 构建的模块通常在 Bun 上兼容
#[napi]
fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}
```

常见的 NAPI-RS 模块兼容性：

| NAPI-RS 模块 | Bun 兼容性 | 说明 |
|-------------|-----------|------|
| lightningcss | ✅ | CSS 解析器 |
| @parcel/watcher | ✅ | 文件监控 |
| @napi-rs/snappy | ✅ | 压缩 |
| @napi-rs/image | ✅ | 图片处理 |
| @napi-rs/clipboard | ✅ | 剪贴板 |

---

## 3. 风险与优化

### 3.1 完全兼容列表（✅）

以下是经过验证、在 Bun 上完全兼容的 Node.js 核心模块和常用 npm 包。

**Node.js 核心模块**

| 模块 | 兼容性 | 说明 |
|------|--------|------|
| fs | ✅ | 包含 fs/promises，所有 API 兼容 |
| path | ✅ | 所有 API 兼容 |
| crypto | ✅ | 使用 BoringSSL，支持主要算法 |
| http | ✅ | 包含 http.get、http.createServer |
| https | ✅ | 基于 http 模块 |
| os | ✅ | 所有 API 兼容 |
| util | ✅ | 包含 promisify、callbackify、types |
| events | ✅ | 包含 EventEmitter |
| stream | ✅ | 包含 Readable、Writable、Transform |
| buffer | ✅ | 包含 Buffer |
| string_decoder | ✅ | 完全兼容 |
| url | ✅ | 包含 URL 和 URLSearchParams |
| querystring | ✅ | 完全兼容 |
| assert | ✅ | 完全兼容 |
| console | ✅ | 完全兼容 |
| process | ✅ | 大部分 API 兼容 |
| timers | ✅ | setTimeout、setInterval 等 |
| dns | ✅ | 包含 dns.lookup、dns.resolve |
| punycode | ✅ | 完全兼容（已弃用但可用） |
| readline | ⚠️ | 基本兼容，交互模式有差异 |
| path/posix | ✅ | POSIX 路径工具完全兼容 |
| path/win32 | ✅ | Windows 路径工具完全兼容 |
| stream/consumers | ✅ | stream 消费工具完全兼容 |
| stream/web | ✅ | Web Streams API 完全兼容 |
| diagnostics_channel | ⚠️ | 基础功能可用，部分通道未实现 |

**扩展模块兼容性详解**

以下对几个关键模块进行更深入的兼容性分析。

**dns 模块的兼容性细节**：Bun 的 dns 模块大部分兼容，但存在一个重要的实现差异——dns.lookup 使用 Bun 自己的 DNS 解析器（基于系统的 getaddrinfo 或自定义解析逻辑），而 Node.js 的 dns.lookup 使用 libuv 封装的 getaddrinfo。在正常网络环境下，两者行为一致，但在以下场景中可能出现差异：自定义 hosts 文件的解析顺序、DNS 缓存行为、IPv4/IPv6 双栈的地址排序。如果项目对 DNS 解析顺序有严格要求，建议使用 dns.resolve4 和 dns.resolve6 替代 dns.lookup，因为前两者的行为在 Bun 和 Node.js 之间更加一致。

**net 模块的兼容性细节**：Bun 的 net 模块使用 Zig 的 TCP 实现，与 Node.js 的 libuv TCP 实现存在以下差异。第一，连接超时的处理方式不同——Node.js 的 net.connect 使用 libuv 的连接超时机制，Bun 使用自己的超时实现，在某些极端网络条件下超时触发的时机可能不同。第二，socket 的缓冲区大小和写入策略不同，可能导致背压行为差异。第三，TLS/SSL 的实现依赖于 BoringSSL，与 Node.js 的 OpenSSL 在某些证书验证细节上可能存在差异。

**tls 模块的兼容性细节**：Bun 的 tls 模块使用 BoringSSL（Google 维护的 OpenSSL 分支）实现 TLS/SSL。BoringSSL 与 OpenSSL 在 API 层面兼容，但在证书验证策略上存在一些差异。例如，BoringSSL 默认启用了更严格的证书验证规则，某些在 Node.js 上可以通过的证书链在 Bun 上可能被拒绝。此外，BoringSSL 移除了某些过时的加密套件，如果项目依赖这些套件，需要在 Bun 上更换加密套件配置。

**常用 npm 包（完全兼容）**

| 包名 | 类型 | 说明 |
|------|------|------|
| express | Web 框架 | 完全兼容，性能提升 25-35% |
| koa | Web 框架 | 完全兼容 |
| fastify | Web 框架 | 完全兼容 |
| hono | Web 框架 | 完全兼容，推荐 Bun 使用 |
| lodash | 工具库 | 完全兼容 |
| moment | 日期处理 | 完全兼容 |
| dayjs | 日期处理 | 完全兼容 |
| date-fns | 日期处理 | 完全兼容 |
| uuid | UUID 生成 | 完全兼容 |
| axios | HTTP 客户端 | 完全兼容 |
| got | HTTP 客户端 | 完全兼容 |
| pino | 日志 | 完全兼容，性能优异 |
| winston | 日志 | 完全兼容 |
| dotenv | 环境变量 | 完全兼容 |
| chalk | 终端颜色 | 完全兼容 |
| commander | CLI 框架 | 完全兼容 |
| zod | 验证 | 完全兼容 |
| yup | 验证 | 完全兼容 |
| ws | WebSocket | 完全兼容 |
| socket.io | WebSocket | 完全兼容 |
| pg | PostgreSQL | 完全兼容 |
| mysql2 | MySQL | 完全兼容 |
| redis | Redis | 完全兼容 |
| ioredis | Redis | 完全兼容 |
| mongodb | MongoDB | 完全兼容 |
| prisma | ORM | 大部分兼容（查询引擎正常） |
| drizzle-orm | ORM | 完全兼容 |
| typeorm | ORM | 完全兼容 |
| sequelize | ORM | 完全兼容 |
| knex | SQL 查询构建器 | 完全兼容 |
| bull | 队列 | 完全兼容 |
| bullmq | 队列 | 完全兼容 |
| ioredis | 队列后端 | 完全兼容 |
| amqplib | 消息队列 (AMQP) | 完全兼容 |
| mqtt | MQTT 客户端 | 完全兼容 |
| kafkajs | Kafka 客户端 | 完全兼容 |
| cheerio | HTML 解析 | 完全兼容 |
| jsdom | DOM 实现 | 基本兼容，部分高级 API 有差异 |
| handlebars | 模板引擎 | 完全兼容 |
| ejs | 模板引擎 | 完全兼容 |
| pug | 模板引擎 | 完全兼容 |
| helmet | 安全中间件 | 完全兼容 |
| cors | CORS 中间件 | 完全兼容 |
| compression | 压缩中间件 | 完全兼容 |
| morgan | 请求日志中间件 | 完全兼容 |
| multer | 文件上传中间件 | 完全兼容 |
| cookie-parser | Cookie 解析中间件 | 完全兼容 |
| session | Session 中间件 | 完全兼容 |
| passport | 认证中间件 | 完全兼容 |
| jsonwebtoken | JWT | 完全兼容 |
| bcryptjs | 密码哈希 | 完全兼容（推荐替代 bcrypt） |
| nanoid | ID 生成 | 完全兼容 |
| micromatch | 文件匹配 | 完全兼容 |
| minimatch | 文件匹配 | 完全兼容 |
| glob | 文件匹配 | 完全兼容 |
| fsevents | 文件监控 | Bun 内置，无需额外安装 |
| bufferutil | WebSocket 工具 | Bun 内置，无需额外安装 |
| utf-8-validate | UTF-8 验证 | Bun 内置，无需额外安装 |
| nock | HTTP 模拟 | 完全兼容 |
| sinon | 测试替身 | 完全兼容 |
| chai | 断言库 | 完全兼容 |
| vitest | 测试框架 | 完全兼容 |
| ava | 测试框架 | 完全兼容 |
| tap | 测试框架 | 完全兼容 |
| node:test | 测试框架 | 完全兼容 |

### 3.2 部分兼容列表（⚠️）

以下 API 和模块在 Bun 上可以运行，但存在已知差异或限制。

**Node.js 核心模块（部分兼容）**

| API | 差异说明 | 影响程度 |
|-----|---------|---------|
| child_process.exec | maxBuffer 默认值不同，某些选项行为差异 | 低 |
| child_process.spawn | detached 行为差异，windows 选项不适用 | 低 |
| child_process.fork | 子进程使用 Bun 运行时，IPC 可能不同 | 中 |
| vm.runInNewContext | timeout 精度可能不如 Node.js，全局变量差异 | 中 |
| vm.Script | 某些高级特性不支持 | 中 |
| worker_threads | 底层使用 JavaScriptCore Worker | 低 |
| cluster | 部分 API 可用，但功能不完整 | 高 |
| async_hooks | 基础 API 可用，高级特性有限 | 中 |
| dgram (UDP) | 基础功能可用，某些选项差异 | 低 |
| net | 基本兼容，某些高级选项差异 | 低 |
| tls | 基本兼容，证书处理可能有差异 | 中 |
| readline | 基本兼容，某些交互模式差异 | 低 |

**常用 npm 包（部分兼容）**

| 包名 | 差异说明 |
|------|---------|
| sharp | 需要 WASM 版本，原生版本不可用 |
| prisma | 查询引擎正常，但生成器可能需要在 Node.js 上运行 |
| node-fetch | Bun 内置 fetch，但 node-fetch 包也兼容 |
| jsdom | 基本功能可用，性能不如 Node.js |
| puppeteer | 可以安装，但浏览器启动可能有差异 |
| aws-sdk | 大部分 API 兼容，某些流处理有差异 |
| graphql | 运行时兼容，但某些性能敏感路径不同 |

### 3.3 不兼容列表（❌）

以下 API 和模块在 Bun 上不可用，需要寻找替代方案。

**Node.js 核心模块（不兼容）**

| API | 替代方案 |
|-----|---------|
| C++ 原生模块 (node-gyp) | 使用纯 JS/WASM/NAPI-RS 替代 |
| N-API 模块（部分） | 检查 N-API 版本兼容性 |
| inspector 模块 | 使用 bun --inspect |

**node-gyp 不兼容的根本原因**

node-gyp 不兼容是 Bun 迁移中遇到的最常见问题，其根本原因在于 node-gyp 的工作机制。node-gyp 是一个构建工具，它将 C/C++ 源代码编译为 .node 文件，并在编译过程中链接到 Node.js 的头文件和库。具体来说，node-gyp 执行以下操作：第一，下载 Node.js 的头文件（通过 `node-gyp install` 或预先安装的 `node-headers`）。第二，使用平台对应的 C/C++ 编译器（gcc、clang 或 MSVC）编译源码。第三，在编译过程中将生成的二进制文件链接到 V8 的 C++ API、libuv 的 C API 和 Node.js 的内部 API。第四，生成一个 .node 共享库文件，可以直接被 Node.js 的 `require()` 加载。

由于 Bun 不使用 V8 引擎和 libuv 库，且 Node.js 的内部 API 在 Bun 中不存在，这些 .node 文件在 Bun 上无法加载。即使 Bun 在加载时检测到 .node 文件并尝试动态链接，也会因为符号解析失败而报错。这是一个架构层面的不兼容，无法通过简单的兼容层来解决。

**Bun 团队对 node-gyp 的策略**

Bun 团队对 node-gyp 的策略是"不支持 node-gyp 编译，但支持部分预编译的 N-API 模块"。这意味着：如果你有 C++ 源码，你不能在 Bun 上使用 node-gyp 编译它；但如果你有预编译的 .node 文件（特别是使用 N-API 构建的），Bun 可能可以加载它。这个策略反映了 Bun 团队的技术选择——与其在 Bun 中模拟 node-gyp 的编译环境（这需要模拟 V8 头文件和 libuv API），不如推动生态向 N-API 迁移，因为 N-API 是一个稳定且与运行时无关的规范。

**npm 包（不兼容，有替代方案）**

| 包名 | 替代方案 |
|------|---------|
| bcrypt | bcryptjs、Bun.password |
| node-sass | sass (Dart Sass) |
| node-canvas | skia-canvas、@napi-rs/canvas |
| leveldown | classic-level、Bun.SQLite |
| bufferutil | Bun 内置（无需安装） |
| utf-8-validate | Bun 内置（无需安装） |
| fsevents | Bun 内置（macOS 文件监控） |
| argon2 | Bun.password（使用 argon2） |
| sodium-native | libsodium-wrappers (WASM) |

### 3.4 原生模块兼容性矩阵

| 原生模块 | 类型 | Bun 兼容 | 替代方案 | 迁移成本 |
|---------|------|---------|---------|---------|
| bcrypt | C++ (node-gyp) | ❌ | bcryptjs / Bun.password | 低 |
| sharp | C++ (node-gyp) | ❌ | wasm-vips / jimp | 中 |
| node-sass | C++ (node-gyp) | ❌ | sass (Dart Sass) | 低 |
| node-canvas | C++ (node-gyp) | ❌ | skia-canvas | 中 |
| leveldown | C++ (node-gyp) | ❌ | classic-level | 低 |
| argon2 | C++ (node-gyp) | ❌ | Bun.password | 低 |
| sodium-native | C++ (node-gyp) | ❌ | libsodium-wrappers | 低 |
| better-sqlite3 | C++ (node-gyp) | ❌ | Bun.SQLite | 低 |
| lmdb | C++ (node-gyp) | ⚠️ | lmdb-js | 中 |
| grpc | C++ (node-gyp) | ⚠️ | @grpc/grpc-js | 低 |
| lightningcss | Rust (NAPI-RS) | ✅ | — | 无 |
| @parcel/watcher | Rust (NAPI-RS) | ✅ | — | 无 |
| @napi-rs/snappy | Rust (NAPI-RS) | ✅ | — | 无 |
| @napi-rs/image | Rust (NAPI-RS) | ✅ | — | 无 |

### 3.5 兼容性风险管理策略

**策略一：渐进式迁移**

不要一次性迁移所有服务。选择一个非关键服务作为试点，验证兼容性后再逐步扩大：

```
Phase 1: 选择非关键服务 → 验证兼容性 → 记录差异
Phase 2: 修复兼容性问题 → 更新 CI/CD → 灰度发布
Phase 3: 迁移核心服务 → 性能基准对比 → 全面切换
```

**策略二：依赖隔离**

对于不兼容的依赖，使用适配器模式隔离：

```typescript
// 适配器模式：隔离不兼容的依赖
interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

// Node.js 实现（使用 bcrypt）
class NodeBcryptHasher implements PasswordHasher {
  async hash(password: string) {
    const bcrypt = require("bcrypt");
    return bcrypt.hash(password, 10);
  }
  
  async verify(password: string, hash: string) {
    const bcrypt = require("bcrypt");
    return bcrypt.compare(password, hash);
  }
}

// Bun 实现（使用 Bun.password）
class BunPasswordHasher implements PasswordHasher {
  async hash(password: string) {
    return Bun.password.hash(password);
  }
  
  async verify(password: string, hash: string) {
    return Bun.password.verify(password, hash);
  }
}

// 运行时选择
const hasher: PasswordHasher = typeof Bun !== "undefined"
  ? new BunPasswordHasher()
  : new NodeBcryptHasher();
```

**策略三：多运行时支持**

在 package.json 中使用条件导出：

```json
{
  "exports": {
    ".": {
      "bun": "./dist/bun-index.js",
      "node": "./dist/node-index.js",
      "default": "./dist/index.js"
    }
  }
}
```

---

## 4. 典型问题处理

### 问题 1：bcrypt 在 Bun 上无法安装

**症状**
```
error: bcrypt@5.1.0 failed to install
  × node-gyp not supported in Bun
```

**原因**
bcrypt 使用 C++ 原生模块，需要通过 node-gyp 编译。Bun 不直接支持 node-gyp 编译的模块。

**解决方案**

方案 A：使用 bcryptjs（纯 JavaScript 实现）

```bash
bun remove bcrypt
bun add bcryptjs
```

```typescript
// 替换前
import bcrypt from "bcrypt";
const hash = await bcrypt.hash("password", 10);
const match = await bcrypt.compare("password", hash);

// 替换后
import bcryptjs from "bcryptjs";
const hash = await bcryptjs.hash("password", 10);
const match = await bcryptjs.compare("password", hash);
```

方案 B：使用 Bun.password（内置 API）

```typescript
// Bun 内置的密码哈希 API
const hash = await Bun.password.hash("password");
const match = await Bun.password.verify("password", hash);

// 指定算法
const hash2 = await Bun.password.hash("password", {
  algorithm: "argon2id",
  timeCost: 3,
  memoryCost: 4096,
});
```

方案 C：在 Docker 中使用兼容层

```dockerfile
FROM oven/bun:latest
RUN apt-get update && apt-get install -y python3 make g++
# 某些 C++ 模块可能通过兼容层运行
```

### 问题 2：child_process.exec 在 Bun 上行为不同

**症状**
```
// Node.js 中正常，Bun 中结果不同
const result = execSync("some command", { maxBuffer: 1024 * 1024 * 10 });
```

**原因**
Bun 的 child_process.exec 实现与 Node.js 在以下方面存在差异：

1. **maxBuffer 默认值**：Bun 的 maxBuffer 默认值可能与 Node.js 不同
2. **encoding 处理**：Bun 的编码处理逻辑可能与 Node.js 有细微差异
3. **错误处理**：某些错误场景的退出码和错误消息可能不同

**解决方案**

方案 A：明确指定所有选项

```typescript
// 显式指定所有关键选项，避免依赖默认值
const result = execSync("command", {
  encoding: "utf-8",
  maxBuffer: 10 * 1024 * 1024,
  timeout: 30000,
  cwd: process.cwd(),
});
```

方案 B：使用 spawn 替代 exec

```typescript
// spawn 的兼容性通常比 exec 更好
const child = spawn("command", ["arg1", "arg2"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
child.stdout.on("data", (chunk) => stdout += chunk);

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});
```

方案 C：使用 Bun 的内置 API

```typescript
// Bun 的 shell API（bun 1.0+）
const result = await Bun.$`command arg1 arg2`;
console.log(result.stdout.toString());

// 或者使用 Bun.spawn
const proc = Bun.spawn(["command", "arg1", "arg2"]);
const output = await new Response(proc.stdout).text();
```

### 问题 3：vm.runInNewContext 超时不准

**症状**
```
// 在 Bun 中，timeout 可能不如 Node.js 精确
vm.runInNewContext("while(true) {}", {}, { timeout: 100 });
// 可能超过 100ms 才抛出超时错误
```

**原因**
Bun 使用 JavaScriptCore 引擎，其沙箱超时机制与 V8 不同。JavaScriptCore 的 timeout 实现基于执行指令计数，而 V8 基于实时时间。

**解决方案**

方案 A：使用外部超时

```typescript
// 使用 AbortController 实现超时
function runWithTimeout<T>(fn: () => T, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Script execution timed out"));
    }, timeout);
    
    try {
      const result = fn();
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

const result = await runWithTimeout(
  () => vm.runInNewContext("1 + 2", {}),
  1000
);
```

方案 B：使用 Web Worker 隔离

```typescript
// 使用 Worker 实现真正的超时隔离
const worker = new Worker(`
  const { parentPort } = require("worker_threads");
  parentPort.on("message", (code) => {
    try {
      const result = eval(code);
      parentPort.postMessage({ success: true, result });
    } catch (e) {
      parentPort.postMessage({ success: false, error: e.message });
    }
  });
`, { eval: true });

const result = await Promise.race([
  new Promise((resolve) => {
    worker.once("message", resolve);
    worker.postMessage("1 + 2");
  }),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Timeout")), 100)
  ),
]);
```

### 问题 4：N-API 模块加载失败

**症状**
```
error: Cannot find module 'my-native-module'
  Require stack:
  - /app/node_modules/my-native-module/build/Release/addon.node
```

**原因**
N-API 模块是编译为 .node 文件的二进制模块，它们链接到 Node.js 的运行时。Bun 虽然实现了 N-API 规范，但某些 N-API 功能可能不兼容。

**解决方案**

方案 A：检查 N-API 版本

```typescript
// 检查模块使用的 N-API 版本
const addon = require("my-native-module");
// 如果模块使用 N-API v1-8，Bun 应该兼容
// 如果模块使用 N-API v9+，可能需要等待 Bun 更新
```

方案 B：使用 NAPI-RS 重新编译

```bash
# 使用 NAPI-RS 构建原生模块
bun add @napi-rs/cli
npx napi build --platform
```

方案 C：寻找纯 JS 替代品

```bash
# 查找替代包
bun add my-native-module-js  # 如果存在纯 JS 版本
```

### 问题 5：fs.watch 行为差异

**症状**
```
// Node.js 中正常工作
const watcher = fs.watch("/path", { recursive: true }, (event, filename) => {
  console.log(event, filename);
});

// Bun 中可能不会触发某些事件
```

**原因**
Bun 的 fs.watch 使用操作系统的文件监控机制（inotify 或 kqueue），与 Node.js 使用的 libuv 机制不同。某些文件系统事件可能被 Bun 以不同的方式处理。

**解决方案**

```typescript
// 使用 Bun 内置的文件监控 API
const watcher = Bun.watchFile("./directory", (err, data) => {
  if (err) console.error(err);
  console.log("File changed:", data);
});

// 或者使用 @parcel/watcher（NAPI-RS，兼容性好）
import watcher from "@parcel/watcher";
const subscription = await watcher.subscribe("/path", (err, events) => {
  for (const event of events) {
    console.log(event.type, event.path);
  }
});
```

### 问题 6：cluster 模块功能受限

**症状**
```
// cluster 模块在 Bun 上的功能有限
const cluster = require("cluster");
if (cluster.isPrimary) {
  cluster.fork(); // 可能无法正常工作
}
```

**原因**
cluster 模块在 Node.js 中依赖于操作系统的进程 fork 机制和进程间通信（IPC）。Bun 的 cluster 实现目前尚不完整。

**解决方案**

```typescript
// 方案 A：使用 PM2 或类似进程管理器
// pm2 start bun -- run index.ts

// 方案 B：使用负载均衡器
// 在多个端口启动多个实例，使用 nginx 或 haproxy 做负载均衡

// 方案 C：使用 Docker Compose 多实例
// docker-compose up --scale bun=4
```

### 问题 7：async_hooks 功能受限

**症状**
```
const asyncHooks = require("async_hooks");
const hook = asyncHooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    // Bun 中某些 init 事件可能不会触发
  },
});
hook.enable();
```

**原因**
async_hooks 模块深度依赖 V8 引擎的异步执行追踪机制。Bun 的 JavaScriptCore 引擎没有完全等效的机制，因此 async_hooks 的实现是模拟的，功能有限。

**解决方案**

```typescript
// 使用 OpenTelemetry 替代 async_hooks
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-app");
const span = tracer.startSpan("operation");
// 手动追踪异步操作
```

### 问题 8：dns.lookup 行为差异

**症状**
```
// Node.js 中 dns.lookup 使用操作系统 DNS 解析
// Bun 中可能使用不同的 DNS 解析方式
dns.lookup("example.com", (err, address) => {
  console.log(address);
});
```

**原因**
Bun 的 DNS 解析实现与 Node.js 不同。Node.js 的 dns.lookup 使用 libuv 的 getaddrinfo 调用，而 Bun 使用自己的 DNS 解析器。

**解决方案**

```typescript
// 如果需要一致的 DNS 行为，使用 dns.resolve 系列方法
dns.resolve4("example.com", (err, addresses) => {
  console.log(addresses); // 行为更一致
});

// 或者使用 Bun 的 DNS 解析
const addresses = await Bun.resolve("example.com");
```

### 问题 9：process.nextTick 执行顺序差异

**症状**
```
// 在 Node.js 中执行顺序确定，在 Bun 中可能不同
process.nextTick(() => console.log("nextTick 1"));
Promise.resolve().then(() => console.log("promise 1"));
process.nextTick(() => console.log("nextTick 2"));
// Node.js 输出: nextTick 1, nextTick 2, promise 1
// Bun 输出: 可能为 nextTick 1, promise 1, nextTick 2
```

**原因**
Node.js 的 process.nextTick 回调在 V8 的微任务检查点之前执行，而 Bun 的 process.nextTick 实现使用 JavaScriptCore 的微任务队列，其优先级排序可能与 Node.js 不同。具体来说，Node.js 的 process.nextTick 队列在 Promise 微任务队列之前处理，而 Bun 可能将两者放在同一个微任务队列中处理，导致执行顺序不确定。

**解决方案**

方案 A：使用 queueMicrotask 替代 process.nextTick

```typescript
// queueMicrotask 的行为在 Bun 和 Node.js 之间更一致
queueMicrotask(() => console.log("microtask 1"));
Promise.resolve().then(() => console.log("promise 1"));
queueMicrotask(() => console.log("microtask 2"));
// Bun 和 Node.js 输出一致: microtask 1, promise 1, microtask 2
```

方案 B：使用 setImmediate 替代 process.nextTick

```typescript
// setImmediate 在事件循环的下一个迭代中执行，行为更可预测
setImmediate(() => console.log("immediate 1"));
Promise.resolve().then(() => console.log("promise 1"));
setImmediate(() => console.log("immediate 2"));
```

方案 C：如果依赖特定的执行顺序，使用 Promise 链式调用

```typescript
// 使用 Promise 链式调用来保证执行顺序
Promise.resolve()
  .then(() => console.log("step 1"))
  .then(() => console.log("step 2"))
  .then(() => console.log("step 3"));
```

### 问题 10：Buffer 编码处理差异

**症状**
```
// Bun 中某些编码可能不被支持
const buf = Buffer.from("hello", "ucs2");
// Node.js: 支持 "ucs2" 编码
// Bun: 可能抛出 "Unknown encoding" 错误
```

**原因**
Node.js 的 Buffer 模块支持多种编码格式（utf8、utf16le、latin1、base64、hex、ascii、ucs2、binary 等），Bun 虽然支持大部分编码，但某些不常用的编码（如 ucs2、binary）可能不被支持或行为不同。

**解决方案**

```typescript
// 使用标准编码名称
// 替代 "ucs2" → 使用 "utf16le"
const buf = Buffer.from("hello", "utf16le");

// 替代 "binary" → 使用 "latin1"
const buf2 = Buffer.from("hello", "latin1");

// 通用编码检测函数
function safeBufferFrom(data: string, encoding: BufferEncoding): Buffer {
  const supportedEncodings: BufferEncoding[] = [
    "utf8", "utf-8", "utf16le", "latin1",
    "base64", "base64url", "hex", "ascii"
  ];
  if (supportedEncodings.includes(encoding)) {
    return Buffer.from(data, encoding);
  }
  // 回退到 UTF-8
  console.warn(`Encoding "${encoding}" not supported, falling back to utf8`);
  return Buffer.from(data, "utf8");
}
```

### 问题 11：util.inspect 输出格式差异

**症状**
```
const obj = { a: 1, b: { c: [1, 2, 3] } };
console.log(util.inspect(obj, { depth: null, colors: true }));
// Node.js 和 Bun 的格式化输出可能不同
```

**原因**
Bun 的 util.inspect 实现是重新编写的，虽然 API 签名兼容，但输出的格式化细节（缩进、颜色编码、对象展开方式）可能与 Node.js 不同。如果项目依赖 util.inspect 的输出格式进行自动化处理（如日志解析、测试快照），这些差异可能导致问题。

**解决方案**

```typescript
// 方案 A：使用 JSON.stringify 替代 util.inspect
// JSON.stringify 的输出格式在 Bun 和 Node.js 之间一致
console.log(JSON.stringify(obj, null, 2));

// 方案 B：自定义格式化函数
function formatObject(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return Array.from(value);
    if (typeof value === "bigint") return value.toString() + "n";
    return value;
  }, 2);
}

// 方案 C：对于测试快照，使用专用序列化库
// 使用 superjson 或 serialize-javascript 等库
import serialize from "serialize-javascript";
console.log(serialize(obj));
```

---

## 5. 必备知识与技能

### Node.js 核心模块 API

**为什么需要**

Node.js 的核心模块是 Bun 兼容层的核心。理解这些模块的 API 和行为，有助于判断哪些代码可以直接迁移、哪些需要修改。

**核心概念**

Node.js 核心模块分为以下几类：

1. **文件系统 (fs)**：用于文件读写、目录操作、文件监控。Bun 的 fs 实现使用 Zig 语言编写，性能优于 Node.js。理解 fs 模块的同步与异步 API 差异、流式读取与一次性读取的性能权衡、文件描述符的管理方式，有助于在 Bun 上编写高效的代码。特别需要关注的是 fs.watch 和 fs.watchFile 的行为差异——Bun 使用操作系统的原生文件监控机制（inotify/kqueue），而 Node.js 使用 libuv 的封装，两者在事件触发频率和事件类型上可能存在差异。

2. **路径处理 (path)**：用于路径解析、格式化和转换。Bun 的 path 实现与 Node.js 完全兼容。理解 path 模块的跨平台特性至关重要——Windows 使用反斜杠和分号作为分隔符，而 POSIX 系统使用正斜杠和冒号。Bun 的 path 实现自动适配当前平台，与 Node.js 的行为一致。此外，path.resolve 与 path.join 的行为差异也值得关注：resolve 返回绝对路径（从右向左构建直到找到根路径），join 只是简单拼接路径片段。

3. **加密 (crypto)**：用于哈希、加密、签名和随机数生成。Bun 使用 BoringSSL 库实现。BoringSSL 是 Google 从 OpenSSL 分支出来的版本，移除了大量过时的加密算法和协议版本，并修复了众多安全漏洞。这意味着 Bun 的 crypto 模块在安全性上可能优于某些旧版本的 Node.js，但也意味着某些在 Node.js 上可用的过时算法（如 MD4、DSA、RC4、DES）在 Bun 上可能不可用。理解加密算法的分类（对称加密、非对称加密、哈希算法、HMAC、数字签名）以及它们的适用场景，对于在 Bun 上安全地使用 crypto 模块至关重要。

4. **网络 (http/https/net)**：用于创建 HTTP 服务器和客户端。Bun 在 Zig 层面实现 HTTP 解析，这意味着 Bun 的 HTTP 性能通常优于 Node.js。理解 HTTP 协议的基本原理（请求方法、状态码、头部、正文、管道复用）有助于诊断网络相关的兼容性问题。Bun 的 http 模块在 API 层面与 Node.js 兼容，但内部使用了不同的连接池管理和 Keep-Alive 策略，这在高并发场景下可能导致与 Node.js 不同的行为。

5. **流 (stream)**：用于数据流处理。Bun 支持 Node.js 的 stream API。理解 Node.js 流的四种类型（Readable、Writable、Transform、Duplex）以及它们的背压机制（highWaterMark、drain 事件）是掌握流处理的关键。Bun 的流实现与 Node.js 在背压行为上可能存在细微差异，特别是在流的内部缓冲区大小和刷新策略方面。此外，Bun 对 Web Streams API 的原生支持意味着可以使用 ReadableStream、WritableStream 和 TransformStream 作为 Node.js 流的替代方案，这在某些场景下性能更优。

6. **子进程 (child_process)**：用于执行外部命令。Bun 的实现与 Node.js 大部分兼容。理解 child_process 的四种方法（exec、execSync、spawn、spawnSync）的适用场景和差异至关重要。exec 使用 shell 来执行命令，适合简单的命令执行；spawn 直接执行程序，适合需要流式输出处理的场景。Bun 的 spawn 兼容性优于 exec，建议在 Bun 上优先使用 spawn。

7. **VM (vm)**：用于在沙箱中执行 JavaScript 代码。Bun 的支持有限。vm 模块的底层依赖于 JavaScript 引擎的沙箱能力。Node.js 的 V8 引擎提供了强大的沙箱 API（包括精确的超时控制和上下文隔离），而 Bun 的 JavaScriptCore 引擎的沙箱能力相对有限。因此，如果项目重度使用 vm 模块（如代码编辑器中的代码执行、在线判题系统、安全沙箱），在迁移到 Bun 时需要特别谨慎。

**学习资源**

- Node.js 官方 API 文档：https://nodejs.org/api/
- Bun Node.js API 文档：https://bun.sh/docs/runtime/nodejs-apis
- Node.js 核心模块源码：https://github.com/nodejs/node/tree/main/lib

### C++ Addon 内部原理

**为什么需要**

理解 C++ Addon 的工作原理，有助于理解为什么 Bun 不直接支持它们，以及如何寻找替代方案。

**核心概念**

Node.js 的 C++ Addon 是编译为 .node 文件的共享库，它们直接链接到 Node.js 的运行时：

1. **V8 引擎 API**：Addon 直接调用 V8 的 C++ API 来操作 JavaScript 对象。
2. **libuv API**：Addon 调用 libuv 进行异步 I/O 操作。
3. **Node.js 内部 API**：Addon 调用 Node.js 的内部函数。

由于 Bun 使用 JavaScriptCore 引擎和 Zig 运行时，这些直接链接到 V8 和 libuv 的 Addon 无法在 Bun 上运行。

**C++ Addon 的编译流程**

深入理解 C++ Addon 的编译流程有助于认清为什么 Bun 无法支持 node-gyp。一个典型的 node-gyp 编译过程包含以下步骤。

第一步，node-gyp 读取 binding.gyp 配置文件，该文件描述了源代码文件列表、编译选项、链接库和包含路径。第二步，node-gyp 调用 `node-gyp configure`，根据平台和 Node.js 版本生成平台对应的构建文件（Makefile 或 vcxproj）。在这个步骤中，node-gyp 会查找 Node.js 的头文件目录，并设置包含路径指向 Node.js 的 V8 头文件（如 node.h、v8.h、uv.h）。第三步，node-gyp 调用 `node-gyp build`，执行编译和链接。编译器（gcc 或 MSVC）将 C++ 源码编译为目标文件，然后链接到 V8 和 libuv 的符号。链接器解析外部符号（如 v8::FunctionTemplate::New、uv_pipe_init），这些符号在 Node.js 的可执行文件或共享库中提供。

问题在于，Bun 的可执行文件不导出这些 V8 和 libuv 符号。即使 Bun 的模块加载器尝试加载一个编译好的 .node 文件，动态链接器也无法找到 V8 和 libuv 的函数实现，导致加载失败。

```bash
# 尝试在 Bun 中加载 C++ 原生模块时的错误
$ bun run app.js
Error: libnode.so: cannot open shared object file: No such file or directory
# 或者
Error: Dynamic loading not supported: /app/node_modules/bcrypt/build/Release/bcrypt_lib.node
```

**N-API 的作用**

N-API 是 Node.js 10+ 引入的稳定 C API，它抽象了 V8 和 libuv 的细节。理论上，只要 Bun 实现了 N-API 规范，使用 N-API 构建的模块可以在 Bun 上运行。

**N-API 与 node-gyp 的核心区别**

理解 N-API 和 node-gyp 的区别对于评估原生模块的兼容性至关重要。node-gyp 生成的模块直接使用 V8 和 libuv 的私有 API，这些 API 在不同 Node.js 版本之间可能发生变化，且与运行时引擎（V8）深度绑定。N-API 则是一个抽象的 C API 层，它隐藏了底层引擎的细节，提供了稳定的 ABI。这意味着：

第一，N-API 模块不需要在 Bun 上重新编译——只要 Bun 实现了 N-API 规范，预编译的 .node 文件可以直接加载。这与 node-gyp 模块不同，后者即使在 Node.js 的不同大版本之间也需要重新编译。

第二，N-API 模块不依赖于 V8 引擎的具体实现。N-API 规范只定义了函数签名和行为语义，不涉及底层的引擎调用。这使得任何实现了 N-API 规范的运行时（Node.js、Bun、Electron 等）都可以加载 N-API 模块。

第三，N-API 模块不能使用 V8 特有的功能。由于 N-API 是抽象的，它不提供访问 V8 私有 API 的能力。如果原生模块需要使用 V8 特有的功能（如 V8 的堆快照、性能分析、代码缓存），则无法使用 N-API，必须使用 node-gyp。

```typescript
// 判断原生模块使用 N-API 还是 node-gyp
// 方法一：查看 binding.gyp 中的配置
// 如果 binding.gyp 中使用了 "include_dirs": ["<!(node -e "require('napi')")"]，
// 则模块使用 N-API

// 方法二：查看编译后的 .node 文件
// N-API 模块导出的初始化函数名为 napi_register_module_v1
// node-gyp 模块导出的初始化函数名为 _register_<module_name>

// 方法三：查看 package.json
// N-API 模块通常会在 package.json 中指定 "napi_versions": [8]
const pkg = require("./node_modules/some-module/package.json");
if (pkg.napi_versions) {
  console.log("This module uses N-API, Bun may support it");
} else {
  console.log("This module may use node-gyp, check carefully");
}
```

**学习资源**

- Node.js C++ Addon 文档：https://nodejs.org/api/addons.html
- N-API 文档：https://nodejs.org/api/n-api.html
- NAPI-RS 文档：https://napi.rs/

### WASM 基础

**为什么需要**

WebAssembly 是替代 C++ Addon 的主要方案之一。理解 WASM 有助于在 Bun 上运行原本依赖 C++ 原生模块的代码。

**核心概念**

WebAssembly（WASM）是一种低级的二进制指令格式，可以在现代浏览器和 JavaScript 运行时中高效运行：

1. **WASM 模块**：从 C/C++/Rust 等语言编译而来，提供高性能计算能力。
2. **WASM 线性内存**：WASM 模块有自己的内存空间，通过 ArrayBuffer 与 JavaScript 交互。
3. **WASM 导入/导出**：WASM 模块可以导出函数给 JavaScript 调用，也可以导入 JavaScript 函数。

**Bun 的 WASM 支持**

Bun 支持 WebAssembly 标准 API：

```typescript
// 加载 WASM 模块
const wasmModule = await WebAssembly.compile(buffer);
const instance = await WebAssembly.instantiate(wasmModule, imports);

// 调用 WASM 函数
const result = instance.exports.add(1, 2);

// 流式编译
const instance2 = await WebAssembly.instantiateStreaming(
  fetch("https://example.com/module.wasm"),
  imports
);
```

**WASM 在 Bun 兼容性中的战略作用**

WebAssembly 在 Bun 的兼容性生态中扮演着至关重要的角色。许多原本依赖 C++ 原生模块的功能，通过编译为 WASM 可以在 Bun 上获得接近原生的性能。以下是 WASM 在 Bun 兼容性中的几个关键作用。

第一，**替代 C++ 原生模块**。许多 C 库（如 libsodium、libvips、sqlite）都有对应的 WASM 版本。通过使用 WASM 版本，可以在 Bun 上获得与原生实现几乎相同的功能和性能。例如，libsodium-wrappers 是 libsodium 加密库的 WASM 版本，可以在 Bun 上完全替代 sodium-native。

第二，**提供跨运行时的统一接口**。WASM 模块不依赖于特定的 JavaScript 运行时——一个 WASM 模块可以在 Bun、Node.js、Deno 和浏览器中运行。这意味着使用 WASM 模块可以实现真正的跨运行时兼容性，而不需要为每个运行时维护不同的实现。

第三，**性能与安全性的平衡**。WASM 模块在沙箱中运行，具有独立的内存空间，不会影响宿主运行时的稳定性。同时，WASM 的执行性能接近原生代码，仅比 C++ 原生模块慢 10-30%。对于大多数应用场景，这个性能差异是可以接受的。

```typescript
// WASM 替代 C++ 原生模块的典型示例
// 替代方案一：WASM 加密库
import sodium from "libsodium-wrappers";
await sodium.ready;
const key = sodium.crypto_secretbox_keygen();
const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
const ciphertext = sodium.crypto_secretbox_easy(message, nonce, key);

// 替代方案二：WASM 图片处理
import init, { resize } from "@wasm-vips/pkg";
await init();
const output = resize(inputBuffer, 800, 600);

// 替代方案三：WASM 数据库
import initSqlJs from "sql.js";
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run("CREATE TABLE test (id INTEGER PRIMARY KEY)");
```

**WASM 模块的构建与优化**

如果需要在 Bun 上运行 C/C++ 库的 WASM 版本，通常需要经历以下步骤。第一步，使用 Emscripten 或 WASI SDK 将 C/C++ 源码编译为 WASM 模块。第二步，将 WASM 模块与 JavaScript 胶水代码打包为 npm 包。第三步，在 Bun 项目中安装并使用该包。在编译 WASM 模块时，需要特别注意以下优化点：使用 -O3 优化级别以获得最佳性能；使用 WASM BigInt 支持来处理 64 位整数；避免使用过于复杂的 C++ 特性（如异常、RTTI），这些特性会增加 WASM 模块的体积和运行开销。

**学习资源**

- MDN WebAssembly 文档：https://developer.mozilla.org/en-US/docs/WebAssembly
- WebAssembly 官方规范：https://webassembly.org/specs/
- WASM 与 Bun：https://bun.sh/docs/runtime/webassembly

### 兼容性评估方法论

**为什么需要**

掌握系统化的兼容性评估方法，可以在 Bun 版本更新时自行评估新 API 的兼容性。

**评估流程**

1. **文档优先**：查阅 Bun 官方文档的 Node.js API 兼容性列表。
2. **测试驱动**：编写兼容性测试用例，在 Bun 和 Node.js 上分别运行。
3. **边缘情况**：关注边界条件、错误处理和性能差异。
4. **社区验证**：查看 Bun 的 GitHub Issues 和 Discord 讨论。

**评估工具**

```bash
# Bun 兼容性检查
bun run my-app --check-compat

# 依赖兼容性扫描
bunx are-the-types-wrong

# 原生模块检测
bun install --native-check
```

## 6. 深入理解：兼容性测试方法论与工具链

### 6.1 兼容性测试的自动化策略

在大型项目中，手动检查每个依赖的兼容性是不现实的。因此，建立自动化的兼容性测试流程至关重要。以下是推荐的自动化策略。

**第一层：静态依赖分析**

在 CI 流程中集成依赖兼容性扫描工具，自动检测项目中使用的 npm 包是否与 Bun 兼容。这类工具通过分析 package.json 和 lockfile 中的依赖列表，与已知的兼容性数据库进行比对，快速给出兼容性报告。兼容性数据库的维护方式有两种：一种是社区维护的公共数据库（如 are-the-types-wrong），另一种是企业内部维护的私有数据库。对于大中型企业来说，建议两种数据库都使用——公共数据库提供通用兼容性信息，私有数据库记录企业内部特有依赖的兼容性验证结果。

静态依赖分析的输出应该包括：每个依赖的兼容性等级（完全兼容、部分兼容、不兼容）、不兼容的原因说明、建议的替代方案。这些信息需要以结构化格式（如 JSON）输出，以便后续的自动化处理。例如，CI 流水线可以根据静态分析结果自动决定是否阻断构建——如果检测到关键依赖不兼容，直接阻止构建继续执行，避免浪费时间。

**第二层：运行时兼容性测试**

静态分析只能检查"表面兼容性"——即依赖是否能在 Bun 上安装和加载。但真正的兼容性需要通过运行时测试来验证。运行时兼容性测试的策略是：在 Bun 和 Node.js 上分别运行相同的测试套件，对比测试结果。

```typescript
// 运行时兼容性测试框架示例
async function runCompatibilityTest(testName: string, testFn: () => Promise<void>): Promise<{ name: string; passed: boolean; error?: string }> {
  try {
    await testFn();
    return { name: testName, passed: true };
  } catch (error) {
    return { name: testName, passed: false, error: error.message };
  }
}

// 在每个核心模块上运行测试
const results = await Promise.all([
  runCompatibilityTest("fs.readFileSync", async () => {
    const content = fs.readFileSync("/tmp/test.txt", "utf-8");
    // 验证内容正确性
  }),
  runCompatibilityTest("crypto.createHash", async () => {
    const hash = crypto.createHash("sha256").update("test").digest("hex");
    // 验证哈希值
  }),
  // 更多测试...
]);
```

**第三层：性能基准测试**

兼容性不仅仅是"能否运行"，还包括"运行效率如何"。性能基准测试对比在 Bun 和 Node.js 上运行相同代码的性能差异。如果某个操作在 Bun 上的性能显著低于 Node.js，这也可以被视为一种兼容性问题——虽然功能正确，但性能不可接受。

性能基准测试需要关注以下指标：操作耗时（平均、P50、P95、P99）、内存使用（峰值、均值）、CPU 使用率。对比分析时，需要设置性能阈值——例如，如果 Bun 上的操作耗时超过 Node.js 的 1.5 倍，则标记为"性能兼容性警告"。

### 6.2 兼容性问题的根因分析框架

当遇到兼容性问题时，系统化的根因分析可以大大提高排查效率。以下是推荐的根因分析框架。

**第一步：问题分类**

将兼容性问题归入以下类别之一：

1. **模块加载失败**：`Error: Cannot find module` 或模块导入时抛出异常。这类问题通常由 C++ 原生模块引起，但也可能是由于模块解析规则差异导致。

2. **API 调用失败**：`TypeError: xxx is not a function` 或 API 调用时抛出异常。这类问题通常是因为代码使用了 Bun 尚未实现的 Node.js API。

3. **行为差异**：API 调用成功但结果与预期不符。这类问题最为隐蔽，通常需要详细的对比测试才能发现。

4. **性能差异**：功能正确但性能不可接受。这类问题虽然不影响正确性，但在生产环境中可能导致服务超时或资源耗尽。

**第二步：环境隔离**

为了准确诊断兼容性问题，需要在隔离的环境中进行测试。建议的做法是：创建最小化的测试用例，只包含触发问题的必要代码。这样可以排除其他依赖或配置的干扰。

```typescript
// 最小化测试用例示例
// 假设问题是 child_process.exec 行为不同

// test-minimal.js
const { execSync } = require("child_process");
try {
  const result = execSync("echo hello", { encoding: "utf-8", timeout: 1000 });
  console.log("Result:", JSON.stringify(result));
} catch (error) {
  console.log("Error:", error.message);
  console.log("Error code:", error.code);
  console.log("Error signal:", error.signal);
}
```

**第三步：源码级对比**

对于行为差异类问题，最有效的排查方法是对比 Bun 和 Node.js 的源码实现。虽然 Bun 的源码是用 Zig 编写的，但其 Node.js 兼容层的 JavaScript 部分在 Bun 的 GitHub 仓库中是公开的。通过对比源码，可以快速定位差异点。

```typescript
// 在 Bun 的源码中搜索对应实现
// Bun 的 Node.js 兼容层位于：
// https://github.com/oven-sh/bun/tree/main/src/js/node

// 例如，child_process.exec 的实现：
// src/js/node/child_process.ts
// 对比 Node.js 的 lib/child_process.js
```

### 6.3 兼容性数据库的构建与维护

对于企业级项目，建立自己的兼容性数据库是非常有价值的投资。这样的数据库可以帮助团队快速评估新依赖的兼容性，避免重复劳动。

**数据库结构设计**

兼容性数据库的核心字段包括：

```
依赖名称: string — npm 包名
依赖版本: string — 兼容性验证的版本
兼容性等级: enum — compatible | partial | incompatible | unknown
验证日期: date — 最近一次验证的日期
验证方法: string — 自动化测试 / 手动测试 / 社区报告
已知问题: string[] — 已知的兼容性问题列表
替代方案: string — 如果兼容性等级为 incompatible，推荐替代方案
性能评估: string — 与 Node.js 相比的性能差异
验证人: string — 验证执行者
备注: string — 额外信息
```

**数据库维护流程**

兼容性数据库不是一次性的工作，需要持续维护。推荐的维护流程是：

1. **初始填充**：将项目当前使用的所有依赖导入数据库，手动验证每个依赖的兼容性
2. **定期更新**：每月或每季度重新验证关键依赖的兼容性（因为 Bun 的兼容性在持续改进）
3. **增量更新**：每次添加新依赖时，自动查询数据库，如果数据库中不存在该依赖，触发兼容性验证流程
4. **社区整合**：将 Bun 社区报告的兼容性信息整合到数据库中

### 6.4 迁移兼容性检查清单

以下是一个实用的兼容性检查清单，可以帮助你在迁移过程中系统地检查兼容性。

**阶段一：基础兼容性检查**

```
[ ] Bun 已安装并能正常运行（bun --version）
[ ] 项目能在 Bun 上启动（bun run src/index.ts）
[ ] 所有依赖都能通过 bun install 安装
[ ] 没有 node-gyp 编译错误
[ ] tsconfig.json 与 Bun 兼容
```

**阶段二：功能兼容性检查**

```
[ ] 所有 API 端点响应正常
[ ] 数据库连接正常（PostgreSQL、MySQL、MongoDB、Redis）
[ ] 文件读写操作正常
[ ] 日志输出正常
[ ] 环境变量加载正常
[ ] 定时任务正常执行
[ ] WebSocket 连接正常
[ ] 文件上传/下载正常
```

**阶段三：高级兼容性检查**

```
[ ] 子进程操作正常（child_process.exec、spawn）
[ ] 加密操作正常（crypto.createHash、crypto.randomBytes）
[ ] 流操作正常（stream.Readable、stream.Writable）
[ ] 事件触发正常（EventEmitter）
[ ] 错误处理行为与 Node.js 一致
[ ] 进程信号处理正常（SIGINT、SIGTERM）
[ ] 内存使用在可接受范围内
[ ] 性能不低于 Node.js 的 80%
```

**阶段四：生产环境兼容性检查**

```
[ ] 日志和监控系统正常工作
[ ] 错误追踪系统正常工作（Sentry 等）
[ ] 性能监控系统正常工作（New Relic、Datadog 等）
[ ] 进程管理正常工作（PM2、systemd）
[ ] Docker 构建和部署正常
[ ] CI/CD 流水线正常
[ ] 回滚机制正常
```

### 6.5 Bun 版本升级的兼容性管理

Bun 的版本更新频繁，每次更新都可能带来兼容性的变化。因此，管理 Bun 版本的兼容性变化是长期使用 Bun 必须掌握的技能。

**版本兼容性管理策略**

```typescript
// 策略一：锁定 Bun 版本
// 在 package.json 中指定 Bun 版本
{
  "bun": "1.0.0"  // 锁定到特定版本
}

// 策略二：使用 Docker 版本锁定
FROM oven/bun:1.0.0  // 使用特定版本镜像

// 策略三：自动化版本兼容性测试
// 在 CI 中使用矩阵测试
name: Compatibility Test
on:
  schedule:
    - cron: '0 0 * * 1'  # 每周一运行
jobs:
  test:
    strategy:
      matrix:
        bun-version: [1.0.0, 1.1.0, latest]
    steps:
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: ${{ matrix.bun-version }}
      - run: bun test
```

**版本升级检查清单**

```
升级 Bun 版本前检查：
[ ] 阅读 Bun 的 Release Notes，了解新增功能和破坏性变更
[ ] 检查已知的兼容性问题是否在目标版本中得到修复
[ ] 在开发环境中升级 Bun 版本并运行完整测试套件
[ ] 检查所有依赖在新版本上是否正常工作
[ ] 运行性能基准测试，确认没有性能回退

升级 Bun 版本后检查：
[ ] 应用正常启动
[ ] 所有测试通过
[ ] 性能指标正常
[ ] 没有新的错误日志
[ ] 监控系统数据显示正常
```

### 6.6 常见兼容性误判与纠正

在实际的兼容性评估中，开发者经常做出一些错误的判断。以下是常见的兼容性误判及其纠正。

**误判一：认为纯 JavaScript 包一定兼容**

纠正：纯 JavaScript 包虽然不依赖 C++ 原生模块，但可能使用了 Bun 尚未实现的 Node.js API。例如，某些纯 JavaScript 包可能使用了 vm 模块的高级特性或 async_hooks 模块。因此，即使包是纯 JavaScript 的，也需要进行兼容性验证。

**误判二：认为 Bun 版本越新兼容性越好**

纠正：虽然 Bun 团队在不断改进兼容性，但新版本可能引入新的行为差异。某些在旧版本上运行正常的代码，在新版本上可能因为兼容性层的优化而行为不同。因此，版本升级后需要重新验证兼容性。

**误判三：认为测试通过就等于兼容**

纠正：测试通过只说明在测试覆盖的场景下兼容。生产环境中的复杂场景（高并发、大数据量、长时间运行）可能暴露测试未能覆盖的兼容性问题。因此，即使测试全部通过，也建议在灰度环境中观察一段时间后再全量切换。

**误判四：认为兼容性问题是"全有或全无"**

纠正：兼容性不是二元的，而是分级的。一个包可能在 90% 的场景下兼容，只在某些边缘情况下有问题。这种部分兼容通常可以通过代码调整来解决，而不是需要完全替换。因此，在评估兼容性时，建议使用分级评估（完全兼容、大部分兼容、部分兼容、不兼容），而不是简单的"兼容"或"不兼容"。

## 7. 兼容性深度案例分析与实战经验

### 7.1 大型 Express 应用迁移的兼容性案例

本节通过一个真实的案例来分析 Express 应用从 Node.js 迁移到 Bun 过程中遇到的兼容性问题和解决方案。假设我们有一个包含 50 个路由、20 个中间件和 30 个直接依赖的中型 Express 应用，它使用了 Express 作为 Web 框架、Pino 作为日志框架、Prisma 作为 ORM、Redis 作为缓存、JWT 作为认证方案、Multer 作为文件上传中间件、Nodemailer 作为邮件发送工具和 node-cron 作为定时任务调度器。

在迁移过程中，我们首先遇到了 bcrypt 的兼容性问题，因为 bcrypt 是一个 C++ 原生模块，无法在 Bun 上直接安装。解决方案是将 bcrypt 替换为 bcryptjs，这是一个纯 JavaScript 实现，API 完全兼容。替换过程非常简单，只需要修改导入语句，将 bcrypt 改为 bcryptjs，调用方式保持不变。替换后运行测试，所有密码相关的测试用例全部通过。性能测试显示 bcryptjs 的哈希速度比 bcrypt 慢约 2.5 倍，但对于登录场景来说，这个性能差异在可接受范围内，因为登录操作的频率较低。

第二个兼容性问题是 Multer 的文件上传处理。在 Node.js 上 Multer 工作正常，但在 Bun 上，当上传大文件时出现内存使用异常增长的问题。经过分析，发现 Bun 的 stream 兼容层在处理大文件流时，其内部缓冲区的管理策略与 Node.js 不同，导致 Multer 在处理文件流时会将整个文件内容读入内存。解决方案是改用 Bun 内置的 Request 对象的 body 解析能力，直接处理 multipart/form-data 请求。具体来说，使用 req.formData API 来解析上传的文件，然后使用 Bun.write 将文件写入磁盘。这样不仅解决了内存问题，还获得了比 Multer 更好的性能。

第三个兼容性问题是 node-cron 定时任务的执行时间偏差。在 Node.js 上定时任务按照预期的时间精确执行，但在 Bun 上某些定时任务出现了几分钟的延迟。经过排查，发现问题的根因是 Bun 的 setTimeout 实现与 Node.js 存在细微差异。Bun 的 setTimeout 的最小精度受限于 JavaScriptCore 的事件循环实现，在某些情况下可能不如 Node.js 精确。解决方案是将 node-cron 替换为 Bun 的 setInterval 配合时间检查的方式来实现精确的定时任务调度。

第四个兼容性问题是 Prisma 的查询引擎启动。Prisma 使用 Rust 编写的查询引擎，通过 N-API 与运行时交互。在 Bun 上 Prisma 的查询引擎可以正常加载，但启动时间比 Node.js 长约 30%。经过分析，发现这是因为 Prisma 的查询引擎在启动时进行了一些 V8 特有的初始化操作，这些操作在 JavaScriptCore 中需要通过兼容层模拟。虽然启动时间增加了，但查询性能在 Bun 和 Node.js 上基本一致。这个案例说明，即使某些包在 Bun 上能运行，但启动阶段可能比 Node.js 慢，这在 Serverless 场景中需要特别注意。

第五个兼容性问题是 Redis 客户端的连接池管理。应用使用 ioredis 作为 Redis 客户端，在 Node.js 上连接池管理正常。在 Bun 上 ioredis 可以正常连接 Redis 并执行操作，但在高并发场景下出现了连接池耗尽的问题。经过分析，发现 Bun 的 socket 实现与 Node.js 在连接池回收机制上存在差异，导致 ioredis 的连接池管理算法在 Bun 上不如 Node.js 高效。解决方案是将 ioredis 的连接池大小从默认的 10 调整为 50，并启用自动重连机制。

通过这个案例可以看出，Express 应用迁移到 Bun 的整体兼容性良好，约 90% 的代码无需修改，但在文件上传、定时任务、密码哈希等特定领域需要调整。每个兼容性问题的解决都需要深入理解 Bun 和 Node.js 的底层实现差异，而不是简单地替换 API。

### 7.2 微服务架构的兼容性评估案例

假设我们有一个包含 12 个微服务的电商平台，每个服务使用不同的技术栈：用户服务使用 Express 加 Mongoose，商品服务使用 Fastify 加 PostgreSQL，订单服务使用 Koa 加 TypeORM，支付服务使用 NestJS 加 Prisma，通知服务使用 Socket.io，搜索服务使用 Elasticsearch 客户端，缓存服务使用 ioredis，文件服务使用 Sharp 加 Multer，消息队列服务使用 Bull，管理后台使用 AdminJS，网关服务使用 Express Gateway，定时任务服务使用 Agenda。

在评估这 12 个微服务的兼容性时，我们发现不同服务的兼容性表现差异很大。用户服务和网关服务的兼容性最好，因为它们的依赖主要是纯 JavaScript 包，几乎没有 C++ 原生模块依赖。商品服务和订单服务的兼容性也不错，Fastify、Koa、PostgreSQL 客户端和 TypeORM 在 Bun 上都能正常工作。

支付服务使用 NestJS，这是一个深度依赖 Node.js 特定 API 的框架。NestJS 本身在 Bun 上可以运行，但其依赖的某些装饰器和元数据反射 API 在 Bun 上存在兼容性问题。经过测试，发现 NestJS 的依赖注入系统在 Bun 上工作正常，但某些使用 Reflect.defineMetadata 的高级特性需要额外配置。解决方案是在 tsconfig.json 中启用 emitDecoratorMetadata 和 experimentalDecorators 选项。

文件服务的兼容性最差，因为它同时依赖 Sharp 和 Multer 两个与 C++ 原生模块相关的包。Sharp 在 Bun 上无法直接使用，需要替换为 wasm-vips 或 jimp；Multer 的文件流处理也存在兼容性问题。最终的解决方案是将文件服务重构为使用 Bun 内置的文件处理和图片处理能力，彻底移除对 Sharp 和 Multer 的依赖。

消息队列服务使用 Bull，Bull 依赖 Redis 和 ioredis。ioredis 在 Bun 上可以工作，但 Bull 的某些高级特性如延迟队列和重复任务去重在 Bun 上存在行为差异。经过测试，发现 Bull 的基本功能在 Bun 上正常，但延迟队列的精度不如 Node.js，存在约 500ms 的偏差。如果业务对延迟精度要求不高，可以接受这个偏差。

定时任务服务使用 Agenda，Agenda 使用 MongoDB 作为存储后端。MongoDB 客户端在 Bun 上兼容性良好，但 Agenda 的某些时间计算逻辑在 Bun 上存在微小的精度差异。解决方案是将 Agenda 替换为 Bun 的 setInterval 配合 MongoDB 查询的方式。

通过这个案例可以看出，在微服务架构中，不同服务的兼容性差异很大。兼容性评估不是简单的全兼容或全不兼容，而是需要针对每个服务单独评估。对于兼容性好的服务，可以直接迁移；对于兼容性一般的服务，需要做一些调整；对于兼容性差的服务，可能需要重构或寻找替代方案。

### 7.3 前端构建工具的兼容性案例

前端构建工具是 Bun 兼容性的一个重要领域。Bun 内置的打包器可以替代 Webpack、Rollup、esbuild 等工具，但在某些高级场景下可能需要特殊处理。

假设我们有一个使用 Vite 加 React 的前端项目，在 Bun 上构建时遇到了以下问题：Vite 的开发服务器在 Bun 上启动正常，但 HMR（热模块替换）在某些场景下不工作。经过分析，发现 Vite 的 HMR 依赖 WebSocket 通信，而 Bun 的 WebSocket 实现与浏览器标准的 WebSocket API 完全一致，但 Vite 的某些 HMR 逻辑依赖 Node.js 特有的 API，这些 API 在 Bun 上的行为差异导致了 HMR 的异常。

解决方案是将 Vite 的 HMR 配置调整为使用 Bun 兼容的模式，具体来说是在 vite.config.ts 中设置 server.hmr.overlay 为 false，并启用 server.watch.usePolling 选项。这些调整虽然降低了 HMR 的某些功能，但核心的 HMR 功能恢复正常。

另一个前端构建的兼容性问题是 CSS 预处理器的使用。项目中使用 sass（Dart Sass）作为 CSS 预处理器，在 Node.js 上运行正常。在 Bun 上，sass 可以正常安装和运行，但构建速度比 Node.js 慢约 20%。经过分析，发现这是因为 sass 的 Dart 运行时在 Bun 上的执行效率不如在 Node.js 上。解决方案是将 sass 替换为 Bun 内置的 CSS 处理能力，或者使用 lightningcss（一个基于 NAPI-RS 的高性能 CSS 处理器）。

### 7.4 数据库驱动和 ORM 的兼容性分析

数据库驱动和 ORM 是后端应用的核心组件，它们的兼容性直接影响应用的可用性。

在 PostgreSQL 驱动方面，pg 和 @neondatabase/serverless 在 Bun 上兼容性良好。pg 驱动的所有核心功能包括连接池、查询、事务、预处理语句和通知监听都经过测试，在 Bun 上工作正常。性能测试显示，pg 驱动在 Bun 上的查询吞吐量比 Node.js 高约 20% 到 30%。

在 MySQL 驱动方面，mysql2 在 Bun 上兼容性良好。测试覆盖了连接管理、查询执行、事务处理和预处理语句等功能，所有功能在 Bun 上都工作正常。性能表现与 PostgreSQL 驱动类似，在 Bun 上有明显的性能提升。

在 MongoDB 驱动方面，mongodb 官方驱动和 mongoose 在 Bun 上兼容性良好。MongoDB 驱动的核心功能包括连接、查询、聚合、事务和变更流都经过测试，在 Bun 上工作正常。但需要注意，MongoDB 的某些高级特性如会话管理和事务在 Bun 上的行为可能与 Node.js 存在细微差异。

在 Redis 驱动方面，ioredis 在 Bun 上兼容性良好，但在高并发场景下需要调整连接池配置。新版 redis 官方驱动在 Bun 上兼容性更好，推荐在新项目中使用。

在 ORM 方面，Prisma 在 Bun 上的兼容性最为成熟。Prisma 的查询引擎通过 N-API 与运行时交互，在 Bun 上可以正常加载。Drizzle ORM 在 Bun 上的兼容性也很好，因为它是纯 TypeScript 实现，不依赖 C++ 原生模块。TypeORM 在 Bun 上可以工作，但某些高级特性如迁移和订阅可能需要额外配置。Knex.js 在 Bun 上兼容性良好，因为它是纯 JavaScript 实现的查询构建器。

### 7.5 测试框架的兼容性分析

测试框架的兼容性直接影响开发效率和 CI/CD 流程。

Bun 内置的 bun test 与 Jest API 高度兼容。在迁移测试时，大部分 Jest 测试用例可以直接使用 bun test 运行。但存在一些已知的差异：jest.mock 的自动模拟行为在 bun test 中可能不同，jest.useFakeTimers 的精度在 bun test 中可能不如 Jest，jest.spyOn 的基本功能在 bun test 中支持但某些高级用法可能不兼容。

对于使用 Vitest 的项目，Vitest 在 Bun 上兼容性良好，因为 Vitest 本身在设计时就考虑到了多运行时的兼容性。建议在新项目中使用 Vitest 作为测试框架，因为它在 Bun 和 Node.js 上都能提供一致的测试体验。

对于使用 Mocha 和 Chai 的项目，这两个框架在 Bun 上兼容性良好，因为它们是纯 JavaScript 实现，不依赖 Node.js 特有的 API。

对于使用 Playwright 和 Cypress 的端到端测试，这两个工具在 Bun 上可以安装和配置，但浏览器启动和执行可能需要在系统中安装对应的浏览器。Playwright 的测试运行器在 Bun 上工作正常，但某些高级特性如视频录制和追踪可能需要额外配置。

### 7.6 兼容性测试的自动化实施

建立自动化的兼容性测试流程是确保迁移顺利进行的关键。推荐的自动化测试架构包括三个层次：静态依赖分析、运行时功能测试和性能基准测试。

静态依赖分析使用工具扫描项目的依赖树，与已知的兼容性数据库进行比对，快速识别不兼容的依赖。运行时功能测试在 Bun 和 Node.js 上分别运行相同的测试套件，对比测试结果。如果某个测试在 Node.js 上通过但在 Bun 上失败，说明存在兼容性问题。性能基准测试对比在 Bun 和 Node.js 上运行相同操作的时间消耗和资源使用，确保 Bun 的性能不低于 Node.js。

这三个层次的测试应该集成到 CI/CD 流水线中，每次代码提交都自动运行。当兼容性测试失败时，CI 应该阻断构建，并在 PR 中显示详细的兼容性报告。这样可以在开发阶段就发现兼容性问题，避免问题流入生产环境。

---

## 参考资源

- Bun Node.js API 兼容性文档：https://bun.sh/docs/runtime/nodejs-apis
- Bun GitHub Issues (兼容性标签)：https://github.com/oven-sh/bun/issues
- Bun 官方 Discord 兼容性频道：https://bun.sh/discord
- Node.js N-API 文档：https://nodejs.org/api/n-api.html
- NAPI-RS 文档：https://napi.rs/
- WinterCG 规范：https://wintercg.org/
- WebAssembly 官方文档：https://webassembly.org/
- are-the-types-wrong：https://github.com/arethetypeswrong/arethetypeswrong.github.io
