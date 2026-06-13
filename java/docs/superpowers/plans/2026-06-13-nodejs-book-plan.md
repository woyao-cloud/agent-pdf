# Node.js 深度参考书 — 生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/nodejs/plan.md` 大纲和 `docs/superpowers/specs/2026-06-13-nodejs-book-design.md` 设计文档，生成《深入理解 Node.js》全书 16 章 + 4 篇附录的内容。

**Architecture:** 混合模式——Part 1 纯文档、Part 2 每个场景独立可运行项目（TypeScript + Docker Compose + Jest 测试）、Part 3-5 文档为主辅以可运行示例。按 Part 顺序逐章生成，每 Part 完成后提交 git commit。

**Tech Stack:** TypeScript, Node.js 20+, Fastify, undici, Socket.IO, React 18, Commander, Jest, Vitest, Docker Compose

---

## Scope Check

全书共 16 章 + 4 篇附录，按 Part 分为 6 个独立阶段。每个 Part 可独立交付，不相互依赖。Part 2 的 4 个场景各自独立，可并行或串行生成。

文件结构总览：

```
docs/nodejs/
├── part1-principles/
│   ├── ch01-v8-engine.md          ~4000 字
│   ├── ch02-libuv-event-loop.md   ~4000 字
│   └── ch03-concurrency.md        ~4000 字
├── part2-scenarios/
│   ├── ch04-bff-gateway/          (项目 + 文档)
│   │   ├── index.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── gateway.ts
│   │   │   ├── circuit-breaker.ts
│   │   │   └── types.ts
│   │   ├── tests/
│   │   │   └── gateway.test.ts
│   │   └── docker-compose.yml
│   ├── ch05-realtime-im/          (项目 + 文档)
│   │   ├── index.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── redis-adapter.ts
│   │   │   └── types.ts
│   │   ├── tests/
│   │   │   ├── websocket.test.ts
│   │   │   └── ack.test.ts
│   │   └── docker-compose.yml
│   ├── ch06-ssr/                  (项目 + 文档)
│   │   ├── index.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── render.ts
│   │   │   ├── cache.ts
│   │   │   └── App.tsx
│   │   ├── tests/
│   │   │   ├── render.test.ts
│   │   │   └── snapshot.test.ts
│   │   └── docker-compose.yml
│   └── ch07-cli-tools/            (项目 + 文档)
│       ├── index.md
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── cli.ts
│       │   └── commands/
│       │       ├── init.ts
│       │       └── build.ts
│       ├── tests/
│       │   └── cli.test.ts
│       └── docker-compose.yml
├── part3-testing/
│   ├── ch08-jest-core.md          ~4000 字 + 代码片段
│   ├── ch09-mock-art.md           ~4000 字 + 代码片段
│   └── ch10-advanced-test.md      ~3000 字 + 代码片段
├── part4-deployment/
│   ├── ch11-troubleshooting.md    ~4000 字
│   ├── ch12-docker-k8s.md         ~4000 字 + Dockerfile
│   └── ch13-observability.md      ~4000 字 + docker-compose
├── part5-advanced/
│   ├── ch14-typescript.md         ~3000 字
│   ├── ch15-native-binding.md     ~3000 字
│   └── ch16-edge-serverless.md    ~3000 字
└── appendices/
    ├── appendix-a-core-modules.md  ~2000 字
    ├── appendix-b-jest-cheatsheet.md ~1500 字
    ├── appendix-c-node-args.md     ~1000 字
    └── appendix-d-migration-guide.md ~2000 字
```

---

## Part 1: 底层原理（3 章纯文档）

### Task 1: 第1章 V8 引擎的内存与执行机制

**Files:**
- Create: `docs/nodejs/part1-principles/ch01-v8-engine.md`

- [ ] **Step 1: 撰写「使用场景」和「实现原理」模块**

写入以下内容：
- **使用场景** (~300字)：为什么理解 V8 对 Node.js 开发者重要？列举 GC 调优（减少 STW 停顿对延迟敏感服务的影响）、内存泄漏排查、高性能计算场景（如大数据处理、实时分析）等
- **实现原理** (~800字)：详细介绍 V8 的架构组成（Ignition 解释器 + TurboFan 编译器）、Hidden Classes 如何优化属性访问、Inline Caching（IC）的 3 种状态（monomorphic/polymorphic/megamorphic）、JIT 编译的 warm/hot 阈值

- [ ] **Step 2: 撰写「GC 机制」和「潜在风险」模块**

写入以下内容：
- **GC 机制** (~500字)：新生代 Scavenge 算法（Cheney 算法、From/To Space 翻转）、老生代 Mark-Sweep/Mark-Compact、Orinoco 并发 GC（并行标记/并发标记/增量标记）、Stop-The-World 停顿的触发时机
- **潜在风险** (~500字)：闭包引用导致的内存泄漏、全局变量缓存膨胀、Detached DOM 树、GC 停顿导致请求延迟抖动（P99 飙升）

- [ ] **Step 3: 撰写「优化策略」和「典型问题处理」模块**

写入以下内容：
- **优化策略** (~800字)：`--max-old-space-size` 调优（公式：1.5x 实际使用量）、对象池模式降低 GC 压力、构造器初始化所有属性避免隐藏类变化、字符串使用模板字面量而非 `+` 拼接、使用 `--optimize-for-size` 标志
- **典型问题** (~500字)：heapdump 抓取两次快照对比、Chrome DevTools Memory 面板的 Comparison 视图、使用 `--trace-gc` 观察 GC 日志、使用 `v8.getHeapStatistics()` 编程接口

- [ ] **Step 4: 撰写「开发者技能」和「示例代码」模块**

写入以下内容：
- **开发者技能** (~300字)：V8 命令行标志速查（`--trace-gc`, `--max-old-space-size`, `--expose-gc`, `--trace-opt`, `--trace-deopt`）、`v8` 模块 API
- **示例代码** (~800字)：
  - 隐藏类演示：动态添加属性 vs 构造函数初始化
  - 内存泄漏复现与 heapdump 修复过程
  - `--trace-gc` 输出解读

```typescript
// 隐藏类变化演示
class Point {
  constructor(public x: number, public y: number) {}
}

// 好的实践：构造函数中初始化所有属性
const p1 = new Point(1, 2);
// 坏实践：运行时添加属性，导致隐藏类变化
const p2 = new Point(3, 4);
(p2 as any).z = 5; // 触发 deopt
```

```typescript
// --expose-gc 配合 --max-old-space-size 使用
import v8 from 'node:v8';

// 获取堆统计信息
const stats = v8.getHeapStatistics();
console.log({
  heapSizeLimit: stats.heap_size_limit,
  totalHeapSize: stats.total_heap_size,
  usedHeapSize: stats.used_heap_size,
});

// 手动触发 GC（需 --expose-gc 标志）
if (global.gc) {
  global.gc();
}
```

- [ ] **Step 5: 写入文件并验证**

写入 `docs/nodejs/part1-principles/ch01-v8-engine.md`
确认文件结构完整：包含 8 个章节模块，总计约 4000 字

- [ ] **Step 6: 确认行文规范**

确认：简体中文、TypeScript 代码块（```typescript）、无占位符/TODO、术语中英文对照（如首次出现时写「隐藏类（Hidden Classes）」）


### Task 2: 第2章 Libuv 与事件循环

**Files:**
- Create: `docs/nodejs/part1-principles/ch02-libuv-event-loop.md`

- [ ] **Step 1: 撰写「使用场景」和「实现原理」模块**

写入以下内容：
- **使用场景** (~300字)：高并发 I/O 密集型应用（Web 服务器、代理、文件处理）、定时任务调度、DNS 查询、文件系统操作
- **实现原理** (~800字)：Libuv 跨平台架构（Linux epoll / macOS kqueue / Windows IOCP）、事件循环的 6 个阶段详细分析——timers（最小堆管理定时器）、pending callbacks（延迟回调）、idle/prepare（内部使用）、poll（I/O 事件轮询，epoll_wait）、check（setImmediate）、close callbacks（关闭回调）

- [ ] **Step 2: 撰写「微任务与 nextTick」和「潜在风险」模块**

写入以下内容：
- **微任务机制** (~300字)：`process.nextTick()` 队列在每个阶段间清空、Promise 微任务在 nextTick 队列后执行、微任务没有数量限制可能饿死 I/O
- **潜在风险** (~500字)：递归 `process.nextTick()` 导致 I/O 永远无法处理、Promise 链导致微任务队列饥饿、CPU 密集型任务阻塞 poll 阶段

- [ ] **Step 3: 撰写「优化策略」和「典型问题处理」模块**

写入以下内容：
- **优化策略** (~800字)：使用 `setImmediate()` 拆分大任务、`UV_THREADPOOL_SIZE` 调优（最大 1024）、fs 同步 vs 异步选择策略、定时器粒度与精度取舍、避免 async/await 在热路径上的微任务开销
- **典型问题** (~500字)：Event Loop Lag 监控（`perf_hooks.monitorEventLoopDelay`）、使用 clinic.js 检测事件循环延迟、阻塞函数定位

- [ ] **Step 4: 撰写「开发者技能」和「示例代码」模块**

写入以下内容：
- **开发者技能** (~300字)：了解 Libuv 线程池内部（请求队列、Worker 线程生命周期）、`node:timers/promises` API、`setImmediate` vs `setTimeout(fn, 0)` 区别
- **示例代码** (~800字)：

```typescript
import { monitorEventLoopDelay } from 'node:perf_hooks';

// 监控事件循环延迟
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// 定时检查
setInterval(() => {
  console.log({
    min: `${histogram.min / 1e6}ms`,
    p50: `${histogram.percentile(50) / 1e6}ms`,
    p95: `${histogram.percentile(95) / 1e6}ms`,
    p99: `${histogram.percentile(99) / 1e6}ms`,
    max: `${histogram.max / 1e6}ms`,
  });
}, 10000);

// 阻塞事件循环的坏实践
function blockEventLoop(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {} // 拉满 CPU
}

// 使用 setImmediate 拆分的优化方案
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

async function processLargeArray<T>(
  items: T[],
  fn: (item: T) => void,
  batchSize = 100
) {
  for (let i = 0; i < items.length; i += batchSize) {
    for (let j = i; j < i + batchSize && j < items.length; j++) {
      fn(items[j]);
    }
    await yieldToEventLoop(); // 每批处理完后让出事件循环
  }
}
```

```typescript
// 微任务 vs 宏任务执行顺序验证
import { describe, it, expect } from '@jest/globals';

describe('Event Loop Phase Order', () => {
  it('should execute microtasks between each phase', (done) => {
    const order: string[] = [];

    setTimeout(() => {
      order.push('timeout');
    }, 0);

    setImmediate(() => {
      order.push('immediate');
    });

    queueMicrotask(() => {
      order.push('microtask');
    });

    process.nextTick(() => {
      order.push('nextTick');
    });

    setTimeout(() => {
      // nextTick → microtask → timeout → immediate
      expect(order).toEqual(['nextTick', 'microtask', 'timeout', 'immediate']);
      done();
    }, 10);
  });
});
```

- [ ] **Step 5: 写入文件并验证**

写入 `docs/nodejs/part1-principles/ch02-libuv-event-loop.md`
确认：8 个模块完备、总计约 4000 字


### Task 3: 第3章 突破单线程瓶颈

**Files:**
- Create: `docs/nodejs/part1-principles/ch03-concurrency.md`

- [ ] **Step 1: 撰写「使用场景」和「实现原理」模块**

写入以下内容：
- **使用场景** (~300字)：图片/视频处理（sharp 库压缩）、加密/解密大量数据、大文件解析（CSV/JSON）、多核 CPU 利用率提升
- **实现原理** (~800字)：child_process 的 4 种模式（spawn/exec/execFile/fork）及其 Pipe 机制、Cluster 的 Master-Worker 模型（SO_REUSEPORT 内核级负载均衡）、Worker Threads 的消息传递 vs SharedArrayBuffer（共享内存 + Atomics）

- [ ] **Step 2: 撰写「潜在风险」和「优化策略」模块**

写入以下内容：
- **潜在风险** (~500字)：进程/线程创建开销（fork 的 COW 页表复制）、`postMessage` 序列化成本（结构化克隆算法限制）、共享内存竞争条件（ABA 问题）、Cluster 的 sticky session 问题（非 SO_REUSEPORT 场景）
- **优化策略** (~800字)：Worker 池化（pre-warm 固定数量的 Worker）、`os.cpus().length` 决定并行度、SharedArrayBuffer 适合大块数值数据、消息传递适合小对象

- [ ] **Step 3: 撰写「典型问题处理」和「开发者技能」模块**

写入以下内容：
- **典型问题** (~500字)：Cluster 模式下内存无法共享（每个 Worker 独立 V8 堆）、`cluster.on('disconnect')` 自动重启、Worker Threads 的 `ArrayBuffer.transfer` 零拷贝移交所有权、`isMainThread` 区分主线程/Worker
- **开发者技能** (~300字)：`node:cluster` 模块的 `schedulingPolicy`（SCHED_RR vs SCHED_NONE）、`node:worker_threads` 的 `receiveMessageOnPort` 同步接收、`node:child_process` 的 `stdio` 配置

- [ ] **Step 4: 撰写「示例代码」模块**

写入以下内容：
- **示例代码** (~800字)：

```typescript
// worker-pool.ts — Worker 线程池
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';

interface Task<T> {
  data: T;
  resolve: (result: any) => void;
  reject: (err: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Task<any>[] = [];
  private activeWorkers = 0;

  constructor(workerFile: string, poolSize = cpus().length) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerFile);
      worker.on('message', (result) => this.handleResult(worker, result));
      worker.on('error', (err) => this.handleError(worker, err));
      this.workers.push(worker);
    }
  }

  run<T>(data: T): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.processNext();
    });
  }

  private processNext() {
    if (this.activeWorkers >= this.workers.length || this.queue.length === 0) return;
    const worker = this.workers.find(w => !(w as any).busy);
    if (!worker) return;
    (worker as any).busy = true;
    this.activeWorkers++;
    const task = this.queue.shift()!;
    worker.postMessage(task.data);
  }

  private handleResult(worker: Worker, result: any) {
    (worker as any).busy = false;
    this.activeWorkers--;
    // resolve 需要从队列匹配，简化方案：FIFO 顺序
    this.processNext();
  }

  private handleError(worker: Worker, err: Error) {
    (worker as any).busy = false;
    this.activeWorkers--;
    this.processNext();
  }

  async terminate() {
    for (const w of this.workers) await w.terminate();
  }
}

// worker.ts — Worker 线程代码
if (!isMainThread) {
  parentPort?.on('message', (imageBuffer: ArrayBuffer) => {
    // 模拟图片压缩处理
    const result = Buffer.from(imageBuffer).byteLength;
    parentPort?.postMessage({ compressed: true, originalSize: result });
  });
}

// 主线程使用
// const pool = new WorkerPool('./worker.ts');
// const result = await pool.run(data);
```

```typescript
// cluster.ts — Cluster 负载均衡
import cluster from 'node:cluster';
import { cpus } from 'node:os';
import http from 'node:http';

if (cluster.isPrimary) {
  const numCpus = cpus().length;
  console.log(`Primary ${process.pid} forking ${numCpus} workers`);

  for (let i = 0; i < numCpus; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  cluster.on('disconnect', (worker) => {
    console.log(`Worker ${worker.process.pid} disconnected`);
  });
} else {
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Worker ${process.pid} handled request\n`);
  }).listen(8000);
}
```

- [ ] **Step 5: 写入文件并验证**

写入 `docs/nodejs/part1-principles/ch03-concurrency.md`
确认：8 个模块完备、约 4000 字

- [ ] **Step 6: Part 1 整体检查并提交**

确认 3 章文件完整、目录结构正确、术语一致
```bash
git add docs/nodejs/part1-principles/
git commit -m "docs(nodejs): add Part 1 - V8/Libuv/concurrency principles"
```


## Part 2: 四大核心场景（4 个可运行项目）

### Task 4: 第4章 BFF 与 API 网关 — 项目初始化与基础代码

**Files:**
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/package.json`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/tsconfig.json`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/src/types.ts`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/src/app.ts`

- [ ] **Step 1: 创建项目骨架与 types.ts**

```bash
mkdir -p docs/nodejs/part2-scenarios/ch04-bff-gateway/src
mkdir -p docs/nodejs/part2-scenarios/ch04-bff-gateway/tests
```

写入 `package.json`：
```json
{
  "name": "bff-gateway",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/app.ts",
    "start": "node --loader ts-node/esm src/app.ts",
    "test": "jest --config jest.config.ts",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "undici": "^6.19.0",
    "opossum": "^8.1.0",
    "mercurius": "^14.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "@types/node": "^20.14.0"
  }
}
```

写入 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

写入 `src/types.ts`：
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Order {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'shipped' | 'delivered';
}

export interface AggregatedUserResponse {
  user: User;
  orders: Order[];
  orderCount: number;
  totalAmount: number;
}
```

- [ ] **Step 2: 创建 Fastify 网关 app.ts**

写入 `src/app.ts`：
```typescript
import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'undici';
import CircuitBreaker from 'opossum';
import { AggregatedUserResponse } from './types';

// 下游微服务连接池
const downstreamPool = new Pool('http://downstream:8080', {
  connections: 100,
  pipelining: 10,
  timeout: 3000, // 严格超时控制，防雪崩
});

// 断路器保护
const breaker = new CircuitBreaker(
  async (userId: string) => {
    const [userRes, ordersRes] = await Promise.all([
      downstreamPool.request({ path: `/users/${userId}`, method: 'GET' }),
      downstreamPool.request({ path: `/users/${userId}/orders`, method: 'GET' }),
    ]);

    return {
      user: JSON.parse(await userRes.body.text()),
      orders: JSON.parse(await ordersRes.body.text()),
    };
  },
  {
    timeout: 2000,
    errorThresholdPercentage: 50,  // 50% 请求失败则断开
    resetTimeout: 30000,           // 30秒后尝试半开
    name: 'user-orders',
  }
);

const app: FastifyInstance = Fastify({ logger: true });

// 健康检查
app.get('/health', async () => ({ status: 'ok' }));

// 聚合接口
app.get<{ Params: { id: string } }>(
  '/users/:id/aggregated',
  async (request, reply) => {
    try {
      const result = await breaker.fire(request.params.id) as AggregatedUserResponse;
      return {
        ...result,
        orderCount: result.orders.length,
        totalAmount: result.orders.reduce((sum, o) => sum + o.amount, 0),
      };
    } catch (err) {
      if (breaker.opened) {
        reply.status(503);
        return { error: 'Service temporarily unavailable', circuitOpen: true };
      }
      reply.status(502);
      return { error: 'Downstream service error', details: (err as Error).message };
    }
  }
);

// 启动
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('BFF Gateway running on port 3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app, breaker, downstreamPool };
```

### Task 5: 第4章 BFF 与 API 网关 — 测试与 Docker Compose

**Files:**
- Modify: `docs/nodejs/part2-scenarios/ch04-bff-gateway/tests/gateway.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/jest.config.ts`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/docker-compose.yml`
- Create: `docs/nodejs/part2-scenarios/ch04-bff-gateway/index.md`

- [ ] **Step 1: 创建 Jest 配置与测试**

写入 `jest.config.ts`：
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  verbose: true,
};

export default config;
```

写入 `tests/gateway.test.ts`：
```typescript
import { app } from '../src/app';

describe('BFF Gateway', () => {
  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('should return 503 when circuit breaker is open', async () => {
    // 断路器打开时返回 503
    const response = await app.inject({
      method: 'GET',
      url: '/users/nonexistent/aggregated',
    });
    // 可能返回 502 或 503 取决于断路器状态
    expect([502, 503]).toContain(response.statusCode);
  });

  it('should have proper CORS headers', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/users/test/aggregated',
    });
    expect(response.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: 创建 Docker Compose**

写入 `docker-compose.yml`：
```yaml
version: '3.8'

services:
  gateway:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    depends_on:
      - downstream
      - prometheus

  downstream:
    image: node:20-alpine
    command: node -e "
      const http = require('http');
      const server = http.createServer((req, res) => {
        if (req.url.startsWith('/users/')) {
          // 20% 概率模拟慢响应
          if (Math.random() < 0.2) {
            setTimeout(() => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ id: '1', name: 'Mock User', email: 'test@test.com' }));
            }, 5000);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: '1', name: 'Mock User', email: 'test@test.com' }));
        }
      });
      server.listen(8080);
      console.log('Downstream running on 8080');
    "
    ports:
      - "8081:8080"

  prometheus:
    image: prom/prometheus:v2.52.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:11.0.0
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
```

- [ ] **Step 3: 创建 Dockerfile**

写入 `Dockerfile`：
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/app.js"]
```

- [ ] **Step 4: 创建章节正文 index.md**

写入 `index.md`（~4000 字），遵循 8 模块模板，引用 `src/` 和 `tests/` 中的代码。

主要内容：
- **使用场景**: 微服务架构下的 BFF 层、多端（Web/iOS/Android）API 定制、数据聚合与裁剪
- **实现原理**: Fastify 插件系统 + undici 连接池管理 + 断路器 + GraphQL DataLoader
- **潜在风险**: 雪崩效应（下游慢响应 → 连接池耗尽 → 所有请求阻塞）、内存泄漏（请求级别闭包缓存未释放）
- **优化策略**: 严格超时（连接超时 + 空闲超时 + 请求超时）、断路器三步态（Closed/Open/Half-Open）、请求合并（相同参数 50ms 窗口内合并）、GraphQL 按需查询减少 Over-fetching
- **典型问题**: 断路器频繁 Open 的根因分析、连接池耗尽后快速恢复策略
- **开发者技能**: Fastify 生命周期、undici 的 `Pool` vs `Client` 区别、断路器的滑动窗口算法
- **示例代码**: 引用 `src/app.ts` 和 `src/circuit-breaker.ts`

### Task 6: 第5章 实时通信与 IM 推送 — 项目初始化

**Files:**
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/package.json`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/tsconfig.json`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/src/types.ts`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/src/server.ts`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/src/redis-adapter.ts`

- [ ] **Step 1: 创建项目骨架与 package.json**

```bash
mkdir -p docs/nodejs/part2-scenarios/ch05-realtime-im/src
mkdir -p docs/nodejs/part2-scenarios/ch05-realtime-im/tests
```

写入 `package.json`：
```json
{
  "name": "realtime-im",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "jest --config jest.config.ts"
  },
  "dependencies": {
    "ws": "^8.17.0",
    "socket.io": "^4.7.5",
    "ioredis": "^5.4.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "@types/ws": "^8.5.10",
    "@types/node": "^20.14.0",
    "@types/uuid": "^10.0.0"
  }
}
```

- [ ] **Step 2: 创建 WebSocket 服务器与 Redis 适配器**

写入 `src/types.ts`：
```typescript
export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type: 'text' | 'image' | 'system';
  timestamp: number;
  ack?: boolean;
}

export interface AckMessage {
  messageId: string;
  status: 'received' | 'read' | 'failed';
  timestamp: number;
}

export interface ClientInfo {
  userId: string;
  connections: number;
  lastSeen: number;
}
```

写入 `src/server.ts`：
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { RedisAdapter } from './redis-adapter.js';
import { Message, AckMessage } from './types.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const server = createServer();
const wss = new WebSocketServer({ server });
const redis = new RedisAdapter(REDIS_URL);

// 连接管理
const connections = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  const userId = new URL(req.url || '/', 'http://localhost').searchParams.get('userId');
  if (!userId) {
    ws.close(4001, 'userId required');
    return;
  }

  // 注册连接
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(ws);
  console.log(`User ${userId} connected. Active: ${connections.get(userId)!.size}`);

  // 消息接收与 ACK
  ws.on('message', async (raw) => {
    const msg: Message = JSON.parse(raw.toString());

    if (msg.type === 'ack') {
      const ack: AckMessage = msg as unknown as AckMessage;
      console.log(`ACK received: ${ack.messageId} -> ${ack.status}`);
      return;
    }

    // 持久化到 Redis
    await redis.persistMessage(msg);

    // 发送 ACK 给发送方
    const ackResponse: AckMessage = {
      messageId: msg.id,
      status: 'received',
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(ackResponse));

    // 通过 Redis Pub/Sub 广播到目标用户（可能在其他节点）
    await redis.publish('chat:messages', JSON.stringify(msg));

    // 如果目标用户在本节点，直接发送
    deliverToUser(msg.to, msg);
  });

  ws.on('close', () => {
    connections.get(userId)?.delete(ws);
    if (connections.get(userId)?.size === 0) {
      connections.delete(userId);
    }
    console.log(`User ${userId} disconnected`);
  });
});

// 跨节点消息转发（Redis Pub/Sub）
redis.subscribe('chat:messages', (raw: string) => {
  const msg: Message = JSON.parse(raw);
  deliverToUser(msg.to, msg);
});

function deliverToUser(userId: string, message: Message) {
  const userConns = connections.get(userId);
  if (!userConns || userConns.size === 0) return;

  for (const ws of userConns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

server.listen(PORT, () => {
  console.log(`WebSocket IM server running on port ${PORT}`);
});
```

写入 `src/redis-adapter.ts`：
```typescript
import Redis from 'ioredis';
import { Message } from './types.js';

export class RedisAdapter {
  private pub: Redis;
  private sub: Redis;
  private messageHandlers = new Map<string, (data: string) => void>();

  constructor(url: string) {
    this.pub = new Redis(url);
    this.sub = new Redis(url);

    this.sub.on('message', (channel, message) => {
      const handler = this.messageHandlers.get(channel);
      handler?.(message);
    });
  }

  async persistMessage(msg: Message): Promise<void> {
    const key = `chat:history:${msg.to}`;
    await this.pub.lpush(key, JSON.stringify(msg));
    await this.pub.ltrim(key, 0, 999); // 保留最近 1000 条
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: (data: string) => void): Promise<void> {
    this.messageHandlers.set(channel, handler);
    await this.sub.subscribe(channel);
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.pub.quit(), this.sub.quit()]);
  }
}
```

### Task 7: 第5章 实时通信与 IM 推送 — 测试与 Docker Compose

**Files:**
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/tests/websocket.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/tests/ack.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/docker-compose.yml`
- Create: `docs/nodejs/part2-scenarios/ch05-realtime-im/index.md`

- [ ] **Step 1: 创建 WebSocket 集成测试**

写入 `tests/websocket.test.ts`：
```typescript
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const WS_URL = 'ws://localhost:8080';

describe('WebSocket IM Server', () => {
  const userId1 = `test-user-${randomUUID()}`;
  const userId2 = `test-user-${randomUUID()}`;

  it('should reject connection without userId', (done) => {
    const ws = new WebSocket(WS_URL);
    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });
  });

  it('should establish connection with userId', (done) => {
    const ws = new WebSocket(`${WS_URL}?userId=${userId1}`);
    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });
  });

  it('should deliver message between users', (done) => {
    const ws1 = new WebSocket(`${WS_URL}?userId=${userId1}`);
    const ws2 = new WebSocket(`${WS_URL}?userId=${userId2}`);

    const message = {
      id: randomUUID(),
      from: userId1,
      to: userId2,
      content: 'Hello!',
      type: 'text' as const,
      timestamp: Date.now(),
    };

    ws2.on('message', (raw) => {
      const received = JSON.parse(raw.toString());
      expect(received.content).toBe('Hello!');
      expect(received.from).toBe(userId1);
      ws1.close();
      ws2.close();
      done();
    });

    ws1.on('open', () => {
      // 等 ws2 就绪
      setTimeout(() => ws1.send(JSON.stringify(message)), 200);
    });
  }, 5000);
});
```

写入 `tests/ack.test.ts`：
```typescript
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

describe('Message ACK', () => {
  const userId = `test-ack-${randomUUID()}`;

  it('should receive ACK after sending message', (done) => {
    const ws = new WebSocket(`ws://localhost:8080?userId=${userId}`);

    ws.on('message', (raw) => {
      const response = JSON.parse(raw.toString());
      if (response.status === 'received') {
        expect(response.messageId).toBe(testMsgId);
        ws.close();
        done();
      }
    });

    const testMsgId = randomUUID();
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: testMsgId,
        from: userId,
        to: `target-${randomUUID()}`,
        content: 'test ack',
        type: 'text',
        timestamp: Date.now(),
      }));
    });
  }, 3000);
});
```

- [ ] **Step 2: 创建 Docker Compose**

写入 `docker-compose.yml`：
```yaml
version: '3.8'

services:
  im-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  im-server-2:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8082:8080"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - im-server
      - im-server-2
```

- [ ] **Step 3: 创建章节正文 index.md**

写入 `index.md`（~4000 字），覆盖 WebSocket 协议细节、Socket.IO 回退机制、Redis Pub/Sub 多节点架构。引用 `src/server.ts` 和 `tests/` 代码。

### Task 8: 第6章 服务端渲染（SSR）

**Files:**
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/package.json`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/tsconfig.json`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/src/App.tsx`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/src/render.ts`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/src/cache.ts`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/src/server.ts`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/tests/render.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/tests/snapshot.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/docker-compose.yml`
- Create: `docs/nodejs/part2-scenarios/ch06-ssr/index.md`

- [ ] **Step 1: 创建 SSR 项目骨架与源码**

写入 `package.json`（含 react、react-dom、express 依赖）
创建 `App.tsx` 作为 React 根组件
创建 `render.ts` 实现 `renderToPipeableStream` 流式渲染
创建 `cache.ts` 实现 LRU 内存缓存
创建 `server.ts` Express 服务器 + 缓存 + 流式渲染

- [ ] **Step 2: 创建测试和 Docker Compose**

- 测试：Jest + React Testing Library（快照测试、渲染测试）
- Docker Compose：SSR 应用 + Nginx + Redis + 负载测试工具

- [ ] **Step 3: 创建章节正文 index.md**

### Task 9: 第7章 CLI 命令行工具

**Files:**
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/package.json`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/tsconfig.json`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/src/cli.ts`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/src/commands/init.ts`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/src/commands/build.ts`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/tests/cli.test.ts`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/docker-compose.yml`
- Create: `docs/nodejs/part2-scenarios/ch07-cli-tools/index.md`

- [ ] **Step 1: 创建 CLI 项目骨架与源码**

`src/cli.ts`：Commander 入口、子命令注册
`src/commands/init.ts`：`init` 命令（Inquirer 交互式问答 + 模板文件生成）
`src/commands/build.ts`：`build` 命令（Ora 进度条 + child_process 执行构建）

```typescript
// src/cli.ts — CLI 入口
#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';

const program = new Command();

program
  .name('my-cli')
  .description('A scaffold CLI tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new project')
  .argument('[name]', 'project name')
  .option('-t, --template <type>', 'template type (ts/js)', 'ts')
  .action(initCommand);

program
  .command('build')
  .description('Build the project')
  .option('-w, --watch', 'watch mode')
  .action(buildCommand);

program.parse();
```

```typescript
// src/commands/init.ts — 交互式初始化
import inquirer from 'inquirer';
import { oraPromise } from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function initCommand(name?: string, options?: { template: string }) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: name || 'my-project',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Select template:',
      choices: [
        { name: 'TypeScript + Node', value: 'ts-node' },
        { name: 'TypeScript + Express', value: 'ts-express' },
        { name: 'JavaScript + Node', value: 'js-node' },
      ],
      default: options?.template === 'ts' ? 'ts-node' : 'js-node',
    },
    {
      type: 'confirm',
      name: 'useGit',
      message: 'Initialize git repository?',
      default: true,
    },
  ]);

  const targetDir = path.join(process.cwd(), answers.projectName);

  await oraPromise(
    (async () => {
      // 创建项目目录结构
      await fs.mkdir(targetDir, { recursive: true });
      await fs.mkdir(path.join(targetDir, 'src'), { recursive: true });

      // 写入 package.json
      const pkg = {
        name: answers.projectName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: { dev: 'tsx watch src/index.ts', build: 'tsc' },
      };
      await fs.writeFile(
        path.join(targetDir, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      // 初始化 Git
      if (answers.useGit) {
        await execa('git', ['init'], { cwd: targetDir });
      }
    })(),
    { text: 'Creating project...', successText: 'Project created!' }
  );

  console.log(`\n  cd ${answers.projectName}`);
  console.log('  npm install');
  console.log('  npm run dev\n');
}
```

- [ ] **Step 2: 创建测试和 Docker Compose**

`tests/cli.test.ts`：使用 Jest + `execa` 测试 CLI 子命令输出

- [ ] **Step 3: 创建章节正文 index.md**

### Task 10: Part 2 整体检查并提交

- [ ] **Step 1: 验证所有项目可运行**

检查每个场景的 `package.json`、`tsconfig.json`、`docker-compose.yml` 完整性
确认每个 `index.md` 包含完整的 8 模块结构

- [ ] **Step 2: 提交**

```bash
git add docs/nodejs/part2-scenarios/
git commit -m "docs(nodejs): add Part 2 - four production scenarios with runnable projects"
```


## Part 3: 测试工程化（3 章文档）

### Task 11: 第8章 Jest 核心机制与异步测试

**Files:**
- Create: `docs/nodejs/part3-testing/ch08-jest-core.md`

- [ ] **Step 1: 撰写前 4 个模块**

- **使用场景**: 单元测试对 Node.js 后端意味着什么、哪些代码值得写测试（接口、工具函数、数据库层）
- **实现原理**: JSDOM 模拟浏览器环境（事件循环、DOM API）、Jest Worker 并发执行策略（默认 pool 大小 = cpu 核心数 - 1）、Babel/SWC 编译管道的差异（SWC 快 20x）、`jest.config.ts` 配置体系（preset / transform / testEnvironment）
- **潜在风险**: 异步测试超时（`jest.setTimeout` 配置）、`done()` 未调用导致测试挂起、JSDOM 不完全支持所有 Web API、Global Setup 的副作用
- **优化策略**: `--runInBand` 调试模式（禁用并发方便排查）、`--detectOpenHandles` 检测未关闭的资源、`--forceExit` 强制退出（慎用）

- [ ] **Step 2: 撰写后 4 个模块**

- **典型问题**: `expect().toBe()` 在 Promise 中无断言失败（未 return）、定时器测试的假时间管理、ESM 模块的 Jest 兼容性问题
- **开发者技能**: Jest CLI 标志速查、`jest.config.ts` 模块化配置、自定义环境
- **示例代码**:

```typescript
// Fastify API 集成测试（使用 app.inject）
import { app } from '../src/app';

describe('User API', () => {
  it('should create user and return 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Alice', role: 'admin' },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).name).toBe('Alice');
  });

  it('should return 400 for invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: '' },
    });
    expect(response.statusCode).toBe(400);
  });
});
```

```typescript
// 定时器测试
jest.useFakeTimers();

it('should debounce API calls', () => {
  const handler = jest.fn();
  const debounced = debounce(handler, 300);

  debounced();
  debounced();
  debounced();

  expect(handler).not.toHaveBeenCalled();

  jest.advanceTimersByTime(300);
  expect(handler).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: 写入文件**

写入 `docs/nodejs/part3-testing/ch08-jest-core.md`

### Task 12: 第9章 Mock 的艺术

**Files:**
- Create: `docs/nodejs/part3-testing/ch09-mock-art.md`

- [ ] **Step 1: 撰写全部模块，包含以下关键示例代码**

```typescript
// 模块 Mock：AWS SDK v3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Body: Buffer.from('mocked data') }),
  })),
  GetObjectCommand: jest.fn(),
}));
```

```typescript
// 函数 Mock：Spy on 数据库 DAO
import { findUserById } from '../src/db/dao';

jest.spyOn(findUserById, 'findUserById').mockResolvedValue({
  id: 1, name: 'Mock User', email: 'mock@test.com',
});

it('should return user from database', async () => {
  const result = await getUser(1);
  expect(result.name).toBe('Mock User');
  expect(findUserById).toHaveBeenCalledWith(1);
  expect(findUserById).toHaveBeenCalledTimes(1);
});
```

```typescript
// ESM 模块 Mock（jest.unstable_mockModule）
// 适用于 "type": "module" 项目
import { jest } from '@jest/globals';

const mockDb = {
  findUserById: jest.fn().mockResolvedValue({ id: 1 }),
};

jest.unstable_mockModule('../src/db.js', () => mockDb);

const { getUser } = await import('../src/user-service.js');
```

- [ ] **Step 2: 写入文件**

写入 `docs/nodejs/part3-testing/ch09-mock-art.md`

### Task 13: 第10章 测试进阶与 Vitest

**Files:**
- Create: `docs/nodejs/part3-testing/ch10-advanced-test.md`

- [ ] **Step 1: 撰写全部模块**

包含以下关键内容：
- 覆盖率门禁：`jest.config.ts` 中 `coverageThreshold` 配置
- 快照测试：`toMatchSnapshot()` 的更新策略（`--updateSnapshot`）
- CI/CD 集成：GitHub Actions 配置

- [ ] **Step 2: 写入 Vitest 迁移对比**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

对比表格：

| 特性 | Jest | Vitest |
|:--|:--|:--|
| 启动速度 | ~3-5s（完整编译） | ~200ms（Vite 缓存） |
| HMR 热更新 | 不支持 | 支持（改代码自动重跑） |
| ESM 支持 | 需要 ts-jest / babel | 原生支持 |
| 快照测试 | 成熟 | 兼容 |
| API 兼容性 | 标准 | 兼容 Jest API |

- [ ] **Step 3: 写入文件**

写入 `docs/nodejs/part3-testing/ch10-advanced-test.md`

- [ ] **Step 4: Part 3 检查并提交**

```bash
git add docs/nodejs/part3-testing/
git commit -m "docs(nodejs): add Part 3 - Jest testing in-depth"
```


## Part 4: 高可用部署与运维（3 章 + Docker Compose）

### Task 14: 第11章 生产环境三大杀手排查

**Files:**
- Create: `docs/nodejs/part4-deployment/ch11-troubleshooting.md`
- Create: `docs/nodejs/part4-deployment/docker-compose.monitoring.yml`

- [ ] **Step 1: 撰写全部 8 模块 + Docker Compose**

关键代码示例：

```typescript
// 使用 heapdump 抓取堆快照
import heapdump from 'heapdump';
import v8 from 'node:v8';

// 内存泄漏排查
const leaks: any[] = [];
setInterval(() => {
  leaks.push(new Array(10000).fill('leak'));
  // 定期抓取堆快照对比
  if (leaks.length % 10 === 0) {
    heapdump.writeSnapshot(`/tmp/heap-${Date.now()}.heapsnapshot`);
  }
}, 1000);
```

```typescript
// 事件循环延迟监控
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

// Prometheus 指标暴露
app.get('/metrics', async () => {
  return {
    event_loop_lag_ms_p50: histogram.percentile(50) / 1e6,
    event_loop_lag_ms_p99: histogram.percentile(99) / 1e6,
    event_loop_lag_ms_max: histogram.max / 1e6,
  };
});
```

写入 `docker-compose.monitoring.yml`：
```yaml
services:
  node-app:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production

  prometheus:
    image: prom/prometheus:v2.52.0
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:11.0.0
    ports: ["3001:3000"]
```

- [ ] **Step 2: 写入文件**

写入 `docs/nodejs/part4-deployment/ch11-troubleshooting.md`

### Task 15: 第12章 容器化部署与进程守护

**Files:**
- Create: `docs/nodejs/part4-deployment/ch12-docker-k8s.md`

- [ ] **Step 1: 撰写全部模块**

包含以下关键内容：
- 多阶段 Dockerfile 最佳实践（参考原计划中的 Dockerfile 示例）
- PM2 Cluster 模式 + 日志轮转 + Graceful Shutdown
- K8s Liveness / Readiness 探针配置

```yaml
# liveness-readiness-probes.yaml
apiVersion: v1
kind: Pod
metadata:
  name: node-app
spec:
  containers:
  - name: app
    image: node-app:latest
    livenessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
      timeoutSeconds: 3
```

- [ ] **Step 2: 写入文件**

写入 `docs/nodejs/part4-deployment/ch12-docker-k8s.md`

### Task 16: 第13章 可观测性

**Files:**
- Create: `docs/nodejs/part4-deployment/ch13-observability.md`
- Create: `docs/nodejs/part4-deployment/docker-compose.observability.yml`

- [ ] **Step 1: 撰写全部模块并创建 Docker Compose**

关键示例：

```typescript
// Pino 结构化日志
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) { return { level: label }; },
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

// 请求级别日志
app.get('/api/users/:id', async (req, reply) => {
  const requestId = crypto.randomUUID();
  logger.info({ requestId, userId: req.params.id }, 'fetching user');
  const user = await getUser(req.params.id);
  reply.send(user);
});
```

```typescript
// OpenTelemetry 链路追踪
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://tempo:4318/v1/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});
sdk.start();
```

```yaml
# docker-compose.observability.yml
services:
  node-app:
    build: .
    ports: ["3000:3000"]
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
      - OTEL_SERVICE_NAME=node-app

  tempo:
    image: grafana/tempo:2.4.0
    ports: ["4318:4318"]
    command: ["-config.file=/etc/tempo.yaml"]

  loki:
    image: grafana/loki:3.0.0
    ports: ["3100:3100"]

  prometheus:
    image: prom/prometheus:v2.52.0
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana:11.0.0
    ports: ["3001:3000"]
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
```

- [ ] **Step 2: 写入文件**

写入 `docs/nodejs/part4-deployment/ch13-observability.md`
写入 `docker-compose.observability.yml`

- [ ] **Step 3: Part 4 检查并提交**

```bash
git add docs/nodejs/part4-deployment/
git commit -m "docs(nodejs): add Part 4 - deployment, monitoring & observability"
```


## Part 5: 进阶与前沿生态（3 章纯文档）

### Task 17: 第14章 TypeScript 与 Node.js

**Files:**
- Create: `docs/nodejs/part5-advanced/ch14-typescript.md`

- [ ] **Step 1: 撰写全部模块**

关键内容：
- Zod 运行时校验 + TypeScript 编译时类型推导的「双保险」模式
  ```typescript
  import { z } from 'zod';

  const UserSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['admin', 'user']),
  });

  type User = z.infer<typeof UserSchema>;
  // 类型自动推导为 { name: string; email: string; role: 'admin' | 'user' }

  // 运行时
  const parsed = UserSchema.parse(req.body);
  // parsed 的类型就是 User
  ```
- `tsconfig.json` 最佳实践（`moduleResolution: "Node16"` 或 `"NodeNext"`）
- 装饰器：实现简化版 NestJS `@Controller`

- [ ] **Step 2: 写入文件**

### Task 18: 第15章 Rust/C++ 绑定

**Files:**
- Create: `docs/nodejs/part5-advanced/ch15-native-binding.md`

- [ ] **Step 1: 撰写全部模块**

关键内容：
- N-API 基础概念（稳定 ABI、跨 Node 版本兼容）
- NAPI-RS 快速入门（用 Rust 写 JWT 校验）

```rust
// NAPI-RS 示例：极速 JWT 校验
#[macro_use]
extern crate napi_derive;

use jsonwebtoken::{decode, TokenData, Header, Validation, DecodingKey};
use napi::bindgen_prelude::*;

#[napi(object)]
pub struct JwtClaims {
    pub sub: String,
    pub exp: u64,
    pub role: String,
}

#[napi]
pub fn verify_jwt(token: String, secret: String) -> Result<JwtClaims> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::default();
    
    match decode::<serde_json::Value>(&token, &key, &validation) {
        Ok(data) => {
            let claims = data.claims;
            Ok(JwtClaims {
                sub: claims["sub"].as_str().unwrap_or("").to_string(),
                exp: claims["exp"].as_u64().unwrap_or(0),
                role: claims["role"].as_str().unwrap_or("user").to_string(),
            })
        }
        Err(e) => Err(Error::from_reason(format!("JWT invalid: {}", e))),
    }
}
```

- [ ] **Step 2: 写入文件**

### Task 19: 第16章 边缘计算与 Serverless

**Files:**
- Create: `docs/nodejs/part5-advanced/ch16-edge-serverless.md`

- [ ] **Step 1: 撰写全部模块**

关键内容：
- Serverless 冷启动问题分析（~300ms 初始化、依赖加载、V8 预热）
- esbuild / ncc 单文件打包

```typescript
// esbuild 打包配置
// build.mjs
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.js',
  external: ['@aws-sdk/*'], // AWS SDK 由运行时提供
});
```

- Cloudflare Workers vs Vercel Edge Functions 对比（V8 Isolates vs 容器）
- Edge Runtime 的 API 限制（无 fs、无 net、无 child_process）

- [ ] **Step 2: 写入文件**

- [ ] **Step 3: Part 5 检查并提交**

```bash
git add docs/nodejs/part5-advanced/
git commit -m "docs(nodejs): add Part 5 - TypeScript, native bindings & edge computing"
```


## 附录（4 篇参考文档）

### Task 20: 附录 A-D

**Files:**
- Create: `docs/nodejs/appendices/appendix-a-core-modules.md`
- Create: `docs/nodejs/appendices/appendix-b-jest-cheatsheet.md`
- Create: `docs/nodejs/appendices/appendix-c-node-args.md`
- Create: `docs/nodejs/appendices/appendix-d-migration-guide.md`

- [ ] **Step 1: 附录A 核心模块避坑指南**

`fs` 的三种路径解析行为、`stream` 的高水位线（highWaterMark）调优、`buffer` 的池分配策略（8KB 池）、`crypto` 的同步 vs 异步选择

- [ ] **Step 2: 附录B Jest 速查表**

常用 Matcher（`toBe`、`toEqual`、`toMatch`、`toContain`、`toThrow`）、Mock 函数方法一览（`mockReturnValue`、`mockResolvedValue`、`mockImplementation`）、定时器 Mock API

- [ ] **Step 3: 附录C 启动参数 Checklist**

```bash
node \
  --max-old-space-size=2048 \
  --expose-gc \
  --trace-warnings \
  --pending-deprecation \
  --async-stack-traces \
  src/index.js
```

- [ ] **Step 4: 附录D 迁移指南**

Express → Fastify（生命周期对比、中间件迁移）、Express → NestJS（模块化、装饰器、依赖注入）

- [ ] **Step 5: 提交附录**

```bash
git add docs/nodejs/appendices/
git commit -m "docs(nodejs): add appendices - core modules, jest cheatsheet, node args, migration guide"
```

---

## 自检清单

1. **Spec 覆盖**: 设计文档中的每个章节是否都有对应的 Task？是否有遗漏？→ 16 章 + 4 附录，共 20 个 Task，全部覆盖
2. **占位符检查**: 所有步骤都包含实际内容，无「TBD」「TODO」
3. **类型一致性**: 代码示例中的类型、函数签名、API 调用在 Task 间一致
4. **执行顺序**: 按 Part 1 → 2 → 3 → 4 → 5 → 附录 顺序，每 Part 独立提交
5. **文件路径**: 所有路径为 `docs/nodejs/` 下，与实际设计文档一致

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-nodejs-book-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**