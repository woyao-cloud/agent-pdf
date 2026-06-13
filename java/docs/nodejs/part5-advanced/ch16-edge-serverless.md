# 第16章 边缘计算与 Serverless

## 16.1 概述

Serverless 架构将应用部署从服务器运维中解放出来，而边缘计算进一步将计算推向离用户最近的位置。Node.js 因其轻量、异步、高并发特性，成为 Serverless 和边缘计算中最受欢迎的运行时之一。本章深入分析边缘计算与 Serverless 的实现原理、冷启动优化、运行时限制以及最佳实践。

## 16.2 使用场景

### 16.2.1 CDN 边缘计算

边缘计算将代码部署在全球分布的 CDN 节点上，用户请求触达最近的节点执行：

```javascript
// Cloudflare Workers 边缘函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const country = request.cf?.country || 'UNKNOWN';

    // 根据用户地理位置返回本地化内容
    if (url.pathname === '/api/hello') {
      const greetings = {
        CN: '你好',
        JP: 'こんにちは',
        FR: 'Bonjour',
        DEFAULT: 'Hello',
      };
      const greeting = greetings[country] || greetings.DEFAULT;
      return new Response(JSON.stringify({ message: `${greeting}, World!` }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 静态资源直接从 CDN 缓存返回
    return env.ASSETS.fetch(request);
  },
};
```

边缘场景的优势在于：
- **超低延迟**：用户到边缘节点的物理距离通常小于 50ms
- **全球分布**：天然支持多区域部署
- **按需计算**：仅在请求触发时消耗资源

### 16.2.2 API 网关

Serverless 函数作为 API 网关的后端处理单元，实现按需扩缩容：

```typescript
// AWS Lambda + API Gateway
import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  const { userId } = event.pathParameters!;

  // 查询 DynamoDB
  const result = await getFromDynamoDB(`user#${userId}`);

  return {
    statusCode: result ? 200 : 404,
    body: JSON.stringify(result ?? { error: 'User not found' }),
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=60', // API 网关层缓存
    },
  };
};

function getFromDynamoDB(key: string): Promise<unknown> {
  // 实际 DynamoDB 查询逻辑
  return Promise.resolve({ id: key, name: 'Alice' });
}
```

### 16.2.3 Serverless 函数

FaaS（Function as a Service）平台如 AWS Lambda、Vercel Functions、Deno Deploy 均支持 Node.js：

```javascript
// Vercel Serverless Function — 自动部署为 /api/users/[id]
// 文件路径：api/users/[id].js
export default async function handler(request, response) {
  const { id } = request.query;

  const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);

  if (!user) {
    return response.status(404).json({ error: 'Not found' });
  }

  response.status(200).json(user);
}

// 部署后自动成为 RESTful 端点
// GET https://example.com/api/users/123
```

### 16.2.4 IoT 数据处理

IoT 设备产生的大量传感器数据需要在边缘端进行预处理，减少回传云端的流量：

```javascript
// 边缘端数据过滤与聚合
function processSensorReading(reading) {
  // 过滤异常值
  if (reading.temperature < -50 || reading.temperature > 150) {
    return null; // 传感器故障，丢弃
  }

  // 滑动窗口平均
  const windowKey = `window:${reading.deviceId}`;
  const window = cache.get(windowKey) ?? [];
  window.push(reading.temperature);

  if (window.length >= 10) {
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    cache.set(windowKey, []);
    return { deviceId: reading.deviceId, avgTemperature: avg, timestamp: Date.now() };
  }

  cache.set(windowKey, window);
  return null; // 数据不足，暂不上报
}
```

## 16.3 实现原理

### 16.3.1 V8 Isolates 毫秒级冷启动 vs 容器级冷启动

Serverless 平台的冷启动机制决定了不同运行时平台之间的性能差异：

| 冷启动类型 | 典型时间 | 代表平台 | 原理 |
|:--|:--|:--|:--|
| V8 Isolates | 1-10ms | Cloudflare Workers, Deno | 进程级复用，每次请求创建独立的 V8 沙箱 |
| 容器级 | 200-500ms | AWS Lambda, Google Cloud Functions | Docker 容器启动 + Node.js 初始化 |
| 快照恢复 | 50-150ms | AWS Lambda SnapStart | 预初始化 JVM/V8 堆快照快速恢复 |

```javascript
// V8 Isolates 冷启动时间极短，无服务器进程
// Cloudflare Workers 的冷启动流程：
// 1. 已有 Node.js 进程 → 2. 创建新的 V8 Isolate (1-5ms)
// 3. 加载用户代码 ESM 模块 (5-10ms) → 4. 执行全局初始化

// 容器级冷启动流程：
// 1. 下载容器镜像 (100-500ms) → 2. 启动容器 (100-300ms)
// 3. 执行 npm start (50-200ms) → 4. 监听端口 (10ms)
```

V8 Isolates 方案的优势和限制：
- **优势**：毫秒级冷启动，资源利用率极高
- **限制**：每个 Isolate 有独立的内存空间，无法共享原生模块
- **限制**：不可使用 `fs`、`net`、`child_process` 等系统 API

### 16.3.2 ESM 模块加载优化

边缘运行时普遍采用 ESM 作为模块系统，并对其加载做了深度优化：

```javascript
// 边缘运行时的 ESM 加载优化策略
// 1. 树摇（Tree Shaking）——只加载实际使用的导出
// 2. 预编译 ——将 node_modules 预编译为单一 bundle
// 3. 延迟加载 ——非立即使用的模块延迟到首次访问时加载

// Cloudflare Workers 的模块系统
import { parse } from 'cookie';       // 同步加载
import { z } from 'zod';             // 同步加载

export default {
  async fetch(request) {
    // cookie 和 zod 只在首次请求时实际加载
    const cookies = parse(request.headers.get('Cookie') || '');
    return new Response('OK');
  },
};
```

## 16.4 潜在风险

### 16.4.1 冷启动延迟

虽然 V8 Isolates 方案冷启动极快，但容器级方案在以下场景中冷启动尤为显著：

- **突发流量**：流量从 0 瞬间飙升至峰值，新容器需要同时启动
- **定期空闲**：函数被调用后空闲数分钟，平台回收资源
- **部署更新**：新代码部署后，所有容器需要重新启动

```javascript
// 冷启动影响分析
// 场景：用户点击"查询订单"按钮
// 时间线：
// 0ms   — 用户发起请求
// +300ms — 容器冷启动（如果是空闲后首次请求）
// +50ms  — 建立数据库连接
// +20ms  — 执行查询
// = 总计 370ms（冷启动部分占 80%）

// 如果保持容器 warm：
// 0ms   — 用户发起请求
// +50ms  — 建立数据库连接
// +20ms  — 执行查询
// = 总计 70ms
```

缓解策略包括：定时心跳请求保持容器活跃、使用预置并发（Provisioned Concurrency）、选择 V8 Isolates 架构的平台。

### 16.4.2 API 限制

边缘运行时为了安全性，限制了部分 Node.js API：

```javascript
// 不可用的 API（在 Cloudflare Workers / Deno Deploy 中）
// ❌ fs —— 无文件系统
import fs from 'fs';
fs.readFileSync('/data/config.json'); // 运行时错误

// ❌ net —— 无法创建 TCP 连接
import net from 'net';
const socket = net.createConnection(80, 'example.com'); // 运行时错误

// ❌ child_process —— 无法创建子进程
import { execSync } from 'child_process';
execSync('curl https://api.example.com'); // 运行时错误

// 可用的替代方案
// ✅ fetch — 发起 HTTP 请求
const resp = await fetch('https://api.example.com');

// ✅ WebSocket — 双向通信
const ws = new WebSocket('wss://example.com/ws');

// ✅ Cache API — 数据缓存
const cache = await caches.open('my-cache');
await cache.put('key', new Response('value'));
```

平台限制清单应在开发前查阅文档：

| API | AWS Lambda | Cloudflare Workers | Deno Deploy | Vercel Edge |
|:--|:--|:--|:--|:--|
| fs | 只读 `/tmp` | 不支持 | Deno API | 不支持 |
| net | 支持 | 不支持 | 受限 | 不支持 |
| child_process | 不支持 | 不支持 | 不支持 | 不支持 |
| process.env | 支持 | 变量注入 | 支持 | 支持 |

### 16.4.3 内存和执行时长限制

Serverless 函数通常有严格的资源限制：

| 平台 | 内存上限 | 执行时长上限 | 包体大小上限 |
|:--|:--|:--|:--|
| AWS Lambda | 10GB | 15分钟 | 250MB（含层） |
| Cloudflare Workers | 128MB | 30秒（CPU） | 5MB（代码）/ 10MB（总） |
| Vercel Serverless | 1GB | 60秒 | 50MB |
| Deno Deploy | 256MB | 30秒 | 20MB |

```javascript
// 超时处理示例
async function handler(request) {
  // 使用 AbortController 避免超出平台限制的等待
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 平台限制 30s

  try {
    const response = await fetch('https://slow-api.example.com/data', {
      signal: controller.signal,
    });
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'Request timed out', timeout: true };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## 16.5 优化策略

### 16.5.1 esbuild/ncc 单文件打包

将依赖打包为单个文件是减少冷启动加载时间的关键策略：

```typescript
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.js',
  external: ['@aws-sdk/*'], // AWS SDK 由平台提供，无需打包
});
```

```bash
# 大小对比
# 原始 node_modules: 150MB, 5000+ 文件
# ncc 打包后: 5MB, 1 个文件
# 效果: 部署时间减少 90%, 冷启动减少 50%+

# 使用 ncc（另一种打包工具）
ncc build src/index.ts -o dist
```

打包后的代码体积管理：

```bash
# 分析打包后的文件大小
npx esbuild src/index.ts --bundle --outfile=dist/out.js --analyze

# 预期的输出类似于：
#  dist/out.js — total: 512kb
#  src/index.ts — 3kb
#  node_modules/lodash — 200kb
#  node_modules/express — 100kb
#  ...
```

### 16.5.2 代码分割懒加载

将非核心功能拆分为单独的模块，按需加载：

```typescript
// 主入口：只加载核心依赖
import { Router } from 'itty-router'; // 轻量路由（<2KB）

const router = Router();

router.get('/api/fast', () => new Response('Fast response'));

// 懒加载：重路由只在需要时加载
router.get('/api/heavy', async () => {
  // 动态 import，延迟到请求时
  const { processImage } = await import('./heavy-processor.js');
  const result = await processImage();
  return new Response(JSON.stringify(result));
});

export default {
  fetch: router.handle,
};
```

### 16.5.3 预初始化连接池

数据库连接和外部服务的连接池创建是一个昂贵的操作，应该在全局作用域中完成一次，在所有请求间复用：

```javascript
// ❌ 每个请求都创建新连接
export default async function handler(req, res) {
  // 每次请求都创建连接池（造成冷启动后首次请求慢）
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query('SELECT 1');
  res.json(result);
}

// ✅ 全局连接池，跨请求复用
// 全局作用域初始化（只在冷启动时执行一次）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2, // 边缘环境连接数有限
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default async function handler(req, res) {
  // 复用已有的连接池
  const result = await pool.query('SELECT 1');
  res.json(result);
}
```

对于 Serverless 环境的数据库连接管理：

```javascript
// 使用连接代理（如 PgBouncer、RDS Proxy）管理短连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  // 设置较短的超时，避免连接泄漏
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
  maxUses: 100, // 每个连接最多复用 100 次后重建
});

// 优雅关闭
process.on('SIGTERM', async () => {
  await pool.end();
  // Serverless 平台发送 SIGTERM 后有 ~300ms 完成清理
});
```

## 16.6 典型问题处理

### 16.6.1 冷启动优化

综合冷启动优化策略清单：

```javascript
// 1. 减少包体积
// 使用 esbuild/ncc 打包，移除不必要的依赖

// 2. 延迟加载非核心模块
const { heavyModule } = await import('./heavy.js');

// 3. 使用快照启动（AWS Lambda SnapStart）
// 通过 pre-SnapStart 钩子预热连接和缓存
// Lambda 控制台启用 SnapStart，然后：
exports.handler = async (event) => {
  if (event.__type === 'SNAPSHOT_START') {
    // 预热数据库连接
    await pool.query('SELECT 1');
    return { warm: true };
  }
  // 正常业务逻辑
};

// 4. 选择正确运行时
// V8 Isolates > Lambda SnapStart > 标准容器
```

### 16.6.2 请求超时处理

Serverless 函数应该在平台超时到达之前优雅降级：

```javascript
export default {
  async fetch(request, env, ctx) {
    // Cloudflare Workers 中，ctx.waitUntil 允许异步任务在响应后继续
    ctx.waitUntil(logRequest(request));

    // 为外部 API 请求设置较短超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await fetch('https://api.example.com/data', {
        signal: controller.signal,
      });
      return new Response(resp.body);
    } catch (err) {
      // 降级返回缓存数据
      const cached = await caches.default.match(request);
      if (cached) return cached;

      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
```

### 16.6.3 边缘运行时兼容性

处理不同运行时的 API 差异：

```javascript
// 运行时检测
const isCloudflare = typeof WebSocketPair !== 'undefined';
const isAWS = typeof process.env.AWS_LAMBDA_FUNCTION_NAME !== 'undefined';
const isDeno = typeof Deno !== 'undefined';
const isVercel = typeof process.env.VERCEL !== 'undefined';

// 根据运行时选择不同的实现
const storage = (() => {
  if (isCloudflare) {
    return {
      get: (key) => caches.default.match(key),
      set: (key, value) => caches.default.put(key, new Response(value)),
    };
  }
  if (isAWS) {
    return {
      get: async (key) => {
        const { getItem } = await import('./aws-storage.js');
        return getItem(key);
      },
      set: async (key, value) => {
        const { setItem } = await import('./aws-storage.js');
        await setItem(key, value);
      },
    };
  }
  // fallback: in-memory（仅用于开发）
  const mem = new Map();
  return {
    get: (key) => mem.get(key),
    set: (key, value) => mem.set(key, value),
  };
})();
```

## 16.7 开发者技能

### 16.7.1 esbuild 打包配置

完整的 esbuild 配置最佳实践：

```typescript
import esbuild from 'esbuild';

const isProduction = process.env.NODE_ENV === 'production';

const result = await esbuild.build({
  // 入口
  entryPoints: ['src/index.ts'],
  // 输出
  outfile: 'dist/index.js',
  // 打包选项
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  // 目标环境
  platform: 'node',
  target: ['node18', 'node20'],
  // 排除平台提供的依赖
  external: [
    '@aws-sdk/*',          // AWS Lambda 内置
    'cloudflare:*',        // Workers 内置
    '@vercel/*',           // Vercel 内置
  ],
  // 格式
  format: 'esm',
  // 代码分割
  splitting: true,
  // 输出分析
  metafile: isProduction,
});

if (isProduction) {
  const analysis = await esbuild.analyzeMetafile(result.metafile);
  console.log(analysis);
}
```

### 16.7.2 Edge Runtime API 差异

各边缘运行时在 Web API 兼容性上的差异：

| API | Cloudflare Workers | Deno Deploy | Vercel Edge |
|:--|:--|:--|:--|
| Fetch | 标准实现 | 标准实现 | 标准实现 |
| Request/Response | 标准实现 | 标准实现 | 标准实现 |
| WebSocket | 支持 | 支持 | 不支持 |
| Cache API | 支持 | 不支持 | 不支持 |
| atob/btoa | 支持 | 支持 | 支持 |
| crypto.subtle | 支持 | 支持 | 支持 |
| TextEncoder/Decoder | 支持 | 支持 | 支持 |
| URLPattern | 支持 | 支持 | 不支持 |

```javascript
// 使用 polyfill 处理差异
if (typeof URLPattern === 'undefined') {
  // Vercel Edge 不支持 URLPattern，使用正则替代
  const pattern = /^\/api\/users\/(?<id>\d+)$/;
  const match = pathname.match(pattern);
  if (match) {
    console.log(match.groups.id); // "123"
  }
}
```

### 16.7.3 Serverless 架构模式

常见的 Serverless 架构模式：

**1. 扇出模式（Fan-out）**：一个事件触发多个并行处理

```javascript
// SQS 事件 → 多个 Lambda 并行处理
export const handler = async (event) => {
  const records = event.Records.map(async (record) => {
    const body = JSON.parse(record.body);
    // 每个 record 独立处理
    await processRecord(body);
  });
  await Promise.all(records);
};
```

**2. 厚瘦函数模式（Fat vs Thin）**：将业务逻辑与基础设施代码分离

```javascript
// 瘦函数：只做路由和参数校验
// API Gateway → Lambda Thin → Lambda Fat（内部调用）
export const thinHandler = async (event) => {
  const { body } = event;
  const schema = z.object({ userId: z.string(), action: z.string() });
  const parsed = schema.parse(body);

  // 调用厚函数
  return invokeFatFunction(parsed);
};
```

**3. 预热模式（Keep Warm）**：通过定时触发保持容器活跃

```javascript
// 每 5 分钟触发一次以保持 warm
// CloudWatch Events → Lambda
export const keepWarm = async (event) => {
  if (event.source === 'aws.events' && event.resources[0].includes('keep-warm')) {
    // 预热操作，不处理业务
    await db.query('SELECT 1');
    return { warmed: true };
  }
  // 正常业务逻辑
};
```

## 16.8 平台选择决策树

选择 Serverless 平台时可以参考以下维度：

```
用户请求特征
├── 极低延迟需求 (< 50ms P99)
│   ├── 全球分布 → Cloudflare Workers / Deno Deploy
│   └── 区域分布 → Vercel Edge / AWS Lambda@Edge
├── 中等延迟需求 (< 500ms)
│   ├── 需要文件系统 → AWS Lambda (只读 /tmp)
│   ├── 需要数据库连接 → AWS Lambda + RDS Proxy
│   └── 简单 API → Vercel Serverless
├── 大批量数据处理
│   ├── 最长 15 分钟 → AWS Lambda
│   └── 超过 15 分钟 → AWS Fargate / ECS
└── 现有基础设施
    ├── AWS 生态 → Lambda
    ├── GCP 生态 → Cloud Functions
    └── 多平台 → 可移植性优先（标准 API）
```

---

## 本章小结

Serverless 与边缘计算代表了云原生的演进方向。选择正确的平台需要考虑冷启动特性、API 限制和应用场景。核心优化思路包括：减小部署包体积、延迟加载非核心模块、合理复用全局连接。同时需要时刻关注平台特有的限制，并在代码中做好降级处理。本章是 Node.js 进阶的最后一章，接下来的附录部分提供了开发过程中的实用速查工具。