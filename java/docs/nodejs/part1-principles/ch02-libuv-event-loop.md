# 第2章 Libuv 与事件循环

## 2.1 使用场景

Libuv 是 Node.js 底层的跨平台异步 I/O 库，其事件循环机制支撑了 Node.js 高并发处理的核心能力。典型使用场景包括：

- **高并发 I/O 密集型应用**：Web 服务器（如 HTTP/HTTPS 服务）、反向代理、API 网关、日志采集与文件处理服务。这些场景的核心特征是大量并行 I/O 操作但 CPU 计算量小，Libuv 的事件循环能以单线程高效调度数千个并发连接，避免了多线程上下文切换的开销。
- **定时任务调度**：`setTimeout`、`setInterval` 基于 Libuv 的定时器最小堆管理，适用于延迟执行、心跳检测、周期性数据同步等场景。
- **DNS 查询**：`dns.lookup()` 底层调用 Libuv 的 `getaddrinfo` 线程池接口，实现非阻塞域名解析。
- **文件系统操作**：`fs` 模块的大多数异步方法（`readFile`、`writeFile`、`stat` 等）均委托给 Libuv 线程池执行，避免阻塞主线程。
- **网络通信**：TCP/UDP Socket 的建立、读写、关闭全部由 Libuv 的事件循环驱动，支撑了 Node.js 作为网络编程平台的基础设施。

理解 Libuv 的事件循环是编写高性能 Node.js 应用的前提——它能解释为什么某些操作"慢"，以及如何编排异步任务以获得最佳吞吐量。

---

## 2.2 实现原理

### 2.2.1 跨平台架构

Libuv 的核心设计目标之一是跨平台统一抽象。它在不同操作系统上对接不同的高性能 I/O 多路复用机制：

| 操作系统 | I/O 轮询机制 | Libuv 中的实现 |
|---|---|---|
| Linux | `epoll` | `src/unix/epoll.c` |
| macOS / iOS | `kqueue` | `src/unix/kqueue.c` |
| Windows | `IOCP` (I/O Completion Port) | `src/win/core.c` |
| Solaris | `event ports` | `src/unix/sunos.c` |

这种抽象使得上层 Node.js 代码无需关心底层差异，开发者写出的异步代码在所有平台上表现一致。

### 2.2.2 事件循环的六个阶段

Libuv 事件循环的核心是一个 `while` 循环，每次迭代依次经过六个阶段。每个阶段维护一个 FIFO 回调队列，阶段之间会执行微任务队列（`process.nextTick` 和 Promise 回调）。

```
   ┌───────────────────────────┐
┌─>│           timers          │ 执行 setTimeout / setInterval 到期回调
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │ 执行延迟到下一轮循环的 I/O 回调
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     idle, prepare         │ 内部使用，与应用层无关
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │ 轮询 I/O 事件，执行 I/O 回调（核心阶段）
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │          check            │ 执行 setImmediate 回调
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     close callbacks       │ 执行 close 事件回调（如 socket.destroy()）
│  └───────────────────────────┘
```

#### 阶段一：Timers（定时器阶段）

Libuv 使用**最小堆（min-heap）** 管理所有活跃定时器，堆顶始终是到期时间最早的定时器。每次进入 timers 阶段时，Libuv 检查堆顶是否到期，若到期则逐个取出并执行其回调，直到遇到未到期的定时器为止。

关键特性：
- `setTimeout(fn, 0)` 并非立即执行，而是等待一轮事件循环的最短延迟（通常为 1ms，受系统时钟精度影响）。
- 定时器的执行时间取决于 poll 阶段是否阻塞——如果 poll 阶段耗时较长，定时器回调会被延迟。

#### 阶段二：Pending Callbacks（待处理回调）

执行上一轮循环中延迟的 I/O 回调。典型场景：TCP 连接建立失败时，`ECONNREFUSED` 错误会通过此阶段传递回调。该阶段的回调一般由 Libuv 内部调度，应用层较少直接感知。

#### 阶段三：Idle / Prepare（空闲与预备阶段）

这两个阶段供 Libuv 内部使用。`idle` 句柄在每次事件循环迭代中执行，`prepare` 句柄在每个 poll 阶段前执行。Libuv 内部某些组件（如 `uv_fs_poll`）依赖此阶段完成准备工作。应用层不应在此阶段注册回调。

#### 阶段四：Poll（I/O 轮询阶段）

这是事件循环最核心的阶段，也是决定事件循环行为的关键。在此阶段，Libuv 执行以下操作：

1. **计算阻塞超时时间**：根据 timers 阶段中最近到期的定时器决定 poll 阶段的阻塞时长，确保在定时器到期前回到 timers 阶段。
2. **调用 `epoll_wait` / `kevent` / `GetQueuedCompletionStatus`**：等待 I/O 事件（网络 Socket 可读/可写、文件描述符状态变化）。
3. **执行 I/O 回调**：当有 I/O 事件到达时，Libuv 取出事件并执行对应的回调函数。

如果 poll 队列为空且没有定时器待处理，poll 阶段会阻塞等待事件到达；如果 poll 队列非空，则同步处理完所有可用的 I/O 回调。

阻塞时间计算逻辑简化描述：

```c
// 伪代码
if (has_timers_ready) {
    poll_timeout = 0;  // 不阻塞，立即回到 timers
} else if (next_timer_expires_soon) {
    poll_timeout = next_timer - now;  // 阻塞到下一个定时器到期
} else {
    poll_timeout = -1;  // 无定时器，无限阻塞直到 I/O 事件到达
}
```

#### 阶段五：Check（检查阶段）

专门执行 `setImmediate()` 注册的回调。这个阶段在 poll 阶段之后立即执行——如果 poll 阶段无事可做，事件循环会直接进入 check 阶段而非阻塞等待。

`setImmediate` 和 `setTimeout(fn, 0)` 的微妙区别就在这里体现：在主模块中运行时，两者的执行顺序取决于 poll 阶段进入时的系统状态和定时器精度，因此顺序是不确定的。但在 I/O 回调内部，`setImmediate` 总是先于 `setTimeout(fn, 0)` 执行，因为 poll 阶段之后紧跟着 check 阶段。

#### 阶段六：Close Callbacks（关闭回调阶段）

处理所有 `close` 事件回调，例如 `socket.destroy()` 或 `fs.close()` 完成后的回调。每当一个句柄（handle）或请求（request）通过 `uv_close()` 关闭时，其回调会被加入此队列。此阶段执行完毕后，如果事件循环中不再有活跃的句柄、定时器或请求，循环终止。

---

## 2.3 微任务与 nextTick

### 2.3.1 微任务队列的执行时机

Node.js 中有两个微任务级别的队列，它们在事件循环的**每个阶段之间**被清空：

1. **`process.nextTick` 队列**（最高优先级）：在当前操作完成后立即执行，甚至在事件循环进入下一阶段之前。
2. **Promise 微任务队列**：在 nextTick 队列清空后执行。

执行顺序示例如下：

```
进入阶段 → process.nextTick 队列（全部清空）→ Promise 微任务队列（全部清空）→ 进入下一阶段
```

### 2.3.2 微任务可能饿死 I/O

设计上一个关键的考量是：微任务队列**没有数量限制**。这意味着：

- 如果在回调中递归调用 `process.nextTick()`，nextTick 队列会不断增长，事件循环将一直停留在"清空 nextTick 队列"的步骤，永远无法进入 poll 阶段处理 I/O 事件。
- 深层的 Promise 链也会产生同样的问题——微任务会持续执行，阻塞事件循环前进。

Node.js 为此引入了一个内部保护机制：当 `process.nextTick` 的递归深度超过约 1000 层时，Node.js 会在 stderr 输出 `"recursive process.nextTick detected"` 警告，但这仅是一个软限制，不会抛出错误。

```typescript
// 危险：无限递归 process.nextTick 会阻塞 I/O
function busyLoop() {
    process.nextTick(busyLoop);  // 永远不会进入 poll 阶段
}
```

---

## 2.4 潜在风险

理解事件循环的潜在风险对于生产环境稳定性至关重要。

### 2.4.1 递归 nextTick 导致 I/O 饥饿

如 2.3 节所述，递归的 `process.nextTick()` 是事件循环最常见的陷阱之一。假设一个日志库在每次 `nextTick` 中写日志并再次注册 `nextTick`，会导致文件描述符永远无法被读取或写入——因为事件循环永远无法进入 poll 阶段。

**检测方式**：如果 Node.js 输出 `"recursive process.nextTick detected"` 警告或应用响应缓慢但 CPU 使用率不高，可检查事件循环延迟指标确认 nextTick 队列耗尽问题。

### 2.4.2 Promise 链导致微任务队列饥饿

`async/await` 的广泛使用让微任务队列饥饿问题变得更加隐蔽。一个包含深层递归的 async 函数不会阻塞事件循环在其他阶段执行 I/O，但会阻塞微任务队列中的其他回调：

```typescript
async function deepChain(depth: number) {
    if (depth <= 0) return;
    // 每次 await 产生一个微任务
    await Promise.resolve();
    // 其他微任务（如 Promise.then 回调）无法在此之间执行
    await deepChain(depth - 1);
}
// 执行期间，其他 Promise 回调被延迟执行
```

### 2.4.3 CPU 密集型任务阻塞 poll 阶段

尽管 Libuv 的事件循环是高效的 I/O 调度器，但它本质上运行在**单线程**上。当一个 CPU 密集型任务在主线程上执行时：

- 整个事件循环被阻塞，poll 阶段无法处理任何新的 I/O 事件。
- 定时器回调无法按时触发，表现为 `setTimeout` 延迟远超设定值。
- 前端响应延迟飙升，连接数堆积，最终可能导致服务雪崩。

```typescript
// 阻塞事件循环的典型例子
function computeHeavy() {
    for (let i = 0; i < 1e10; i++) {
        // 同步计算会阻塞事件循环数秒甚至数分钟
        Math.sqrt(i);
    }
}
```

**解决思路**：将 CPU 密集型任务拆分到 Worker Thread、子进程，或使用 `setImmediate()` 分片执行。

---

## 2.5 优化策略

### 2.5.1 使用 `setImmediate()` 拆分大任务

将长任务拆分为多个小任务，每个小任务通过 `setImmediate()` 放入 check 阶段队列。这样每执行一小段后，事件循环有机会处理 pending 的 I/O 事件和定时器。

```typescript
// 拆分前：阻塞事件循环
function processLargeArraySync(items: number[]) {
    for (const item of items) {
        heavyComputation(item);
    }
}

// 拆分后：每 100 项让出一次事件循环
function processLargeArrayChunked(items: number[], index = 0) {
    const chunkSize = 100;
    const chunk = items.slice(index, index + chunkSize);
    for (const item of chunk) {
        heavyComputation(item);
    }
    if (index + chunkSize < items.length) {
        setImmediate(() => processLargeArrayChunked(items, index + chunkSize));
    }
}
```

### 2.5.2 `UV_THREADPOOL_SIZE` 调优

Libuv 内部维护一个线程池，默认大小为 4。涉及线程池的操作包括：

- `fs` 模块的异步操作（`readFile`、`writeFile`、`stat` 等）
- `dns.lookup()`
- `crypto` 模块的部分操作（`pbkdf2`、`randomBytes` 等）
- `zlib` 模块的压缩/解压操作

**调优建议**：

- **默认值 4** 适合大多数通用场景。
- **调高至 8~128**：文件 I/O 密集或 DNS 查询密集的服务（如日志处理、代理转发）。
- **最大 1024**（Node.js v12+）：需通过环境变量 `UV_THREADPOOL_SIZE=128` 设置。
- **调低至 1~2**：纯网络 I/O 服务（如网关），线程池不常用，保留更多系统资源。
- **注意**：线程池增大不总是提升性能。过多的线程会增加上下文切换开销和内存占用，应在真实负载下进行基准测试。

```bash
# Windows PowerShell
$env:UV_THREADPOOL_SIZE=128; node app.js

# Linux / macOS
UV_THREADPOOL_SIZE=128 node app.js
```

### 2.5.3 fs 同步 vs 异步选择策略

| 场景 | 推荐方式 | 原因 |
|---|---|---|
| 应用启动读配置文件 | `fs.readFileSync` | 启动阶段无需处理并发请求 |
| 服务运行时小文件读写 | `fs.promises.readFile` | 避免阻塞事件循环 |
| 高并发大文件处理 | Worker Thread + `fs.readSync` | 线程池可能成为瓶颈，Worker Thread 隔离 |
| 日志写入 | 异步流式写入 (`fs.createWriteStream`) | 避免每次写入占用线程池 |

### 2.5.4 定时器粒度与精度取舍

- `setTimeout(fn, 0)` 的实际延迟通常在 1~4ms（受系统时钟粒度影响，Linux 默认为 1ms，Windows 通常为 15.6ms）。
- 高精度定时需求（如游戏帧率控制）应考虑 `perf_hooks` 或 `setImmediate` 轮询，而非依赖 `setTimeout` 的实时性。
- 大批量定时器（数千个 `setTimeout`）建议改用有序列表或时间轮算法自行管理，避免最小堆的性能退化。

### 2.5.5 避免 async/await 在热路径上的微任务开销

每次 `await` 会在微任务队列中插入一个 `.then()` 回调。在高频调用的热路径上（如每秒处理数万次请求），微任务的累积开销不可忽视。

```typescript
// 热路径上避免不必要的 await
// 不推荐：每次调用都会产生微任务
async function handleRequest(data: Buffer): Promise<Buffer> {
    const result = await transform(data);
    return result;
}

// 推荐：如果 transform 本身就是同步的，不要用 async
function handleRequestSync(data: Buffer): Buffer {
    return transform(data);
}
```

---

## 2.6 典型问题处理

### 2.6.1 Event Loop Lag 监控

Node.js 提供了 `perf_hooks.monitorEventLoopDelay` API，基于高精度时钟直方图测量事件循环延迟，无需第三方工具：

```typescript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 }); // 20ms 采样精度
histogram.enable();

setInterval(() => {
    const p99 = histogram.percentile(99) / 1e6; // 转换为毫秒
    if (p99 > 100) {
        console.warn(`Event Loop 延迟过高: p99 = ${p99.toFixed(2)}ms`);
        // 可在此触发告警或降级逻辑
    }
    // 输出延迟分布
    console.log({
        min: `${histogram.min / 1e6}ms`,
        p50: `${histogram.percentile(50) / 1e6}ms`,
        p95: `${histogram.percentile(95) / 1e6}ms`,
        p99: `${p99.toFixed(2)}ms`,
        max: `${histogram.max / 1e6}ms`,
    });
}, 10000);
```

**典型阈值**：
- `p99 < 50ms`：健康
- `p99 50~200ms`：需要注意，检查是否存在阻塞操作
- `p99 > 200ms`：严重延迟，应立即排查

### 2.6.2 使用 clinic.js 检测事件循环延迟

[clinic.js](https://clinicjs.org/) 是一套 Node.js 性能诊断工具集，其中的 `clinic doctor` 可以直观地展示事件循环延迟和阻塞情况：

```bash
# 安装
npm install -g clinic

# 运行诊断
clinic doctor -- node app.js

# 压测后访问生成的 .clinic/ 报告
# 报告会以火焰图和时间线形式展示事件循环健康状况
```

clinic.js 的输出包含几个关键指标：
- **Event Loop Delay**：事件循环延迟时间线，帮助定位阻塞时间段。
- **Asynchronous I/O**：异步操作的分布，判断是否线程池过载。
- **Memory Usage**：内存使用趋势，排查是否有 GC 拖慢事件循环。

### 2.6.3 阻塞函数定位

当事件循环延迟升高时，快速找到阻塞点的方法：

**方法一：CPU Profile**
```bash
node --cpu-prof --cpu-prof-interval=1000 app.js
# 生成 .cpuprofile 文件，可在 Chrome DevTools 中查看火焰图
```

**方法二：诊断报告**
```bash
node --report-on-fatalerror --report-on-signal app.js
kill -USR2 <pid>  # 触发诊断报告
# 报告中 "javascriptStack" 字段显示当前执行栈
```

**方法三：async_hooks 追踪（生产环境慎用）**
使用 `async_hooks` 或第三方库 `async_hook` 追踪异步操作的执行时间，定位长时间未返回的操作。

---

## 2.7 开发者技能

### 2.7.1 理解 Libuv 线程池内部

Libuv 的线程池（`src/threadpool.c`）实现了一个经典的**生产者-消费者**模型：

- **请求队列**：主线程提交异步请求（如文件读取）到互斥锁保护的队列中。
- **Worker 线程生命周期**：Worker 线程启动后循环从队列中取出请求并执行。执行完成后，通过 `uv_async_send` 通知主线程，将结果放入 pending 回调队列。
- **线程池大小**：由 `UV_THREADPOOL_SIZE` 环境变量控制，默认 4，最大 1024。Worker 线程在整个进程生命周期内保持存活，不会频繁创建销毁。

理解这一机制有助于做出正确的 API 选择：例如，高并发场景下应避免所有文件操作都经过线程池，考虑使用文件流的流式读写或直通操作系统 AIO（如果有）。

### 2.7.2 `node:timers/promises` API

Node.js v15+ 提供了 Promise 风格的定时器 API，无需手动 promisify：

```typescript
import { setTimeout, setInterval } from 'node:timers/promises';

async function delayedOperation() {
    console.log('等待 1 秒...');
    await setTimeout(1000);
    console.log('继续执行');
}

async function* pollingGenerator() {
    for await (const _ of setInterval(5000)) {
        console.log('每 5 秒执行一次');
        // 可以在此执行定时轮询逻辑
    }
}
```

### 2.7.3 `setImmediate` vs `setTimeout(fn, 0)` 区别

| 特性 | `setImmediate` | `setTimeout(fn, 0)` |
|---|---|---|
| 执行阶段 | check 阶段（poll 之后） | timers 阶段（下一次迭代开头） |
| 最小延迟 | 0（立即在当前事件循环的 check 阶段执行） | 1~4ms（受系统时钟精度限制） |
| I/O 回调内部 | 总是先于 `setTimeout(fn, 0)` | 总是晚于 `setImmediate` |
| 主模块中执行顺序 | 不确定（取决于 poll 阶段行为） | 不确定 |
| 推荐用途 | 拆分 CPU 密集任务、让出事件循环 | 延迟执行、定时任务 |

**最佳实践**：在 I/O 回调中需要使用异步调度时，优先使用 `setImmediate`；需要精确延迟时使用 `setTimeout`。

---

## 2.8 示例代码

### 2.8.1 事件循环延迟监控

```typescript
// event-loop-monitor.ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { appendFile } from 'node:fs/promises';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// 定时检查事件循环健康状况
setInterval(() => {
    const metrics = {
        min: `${histogram.min / 1e6}ms`,
        p50: `${histogram.percentile(50) / 1e6}ms`,
        p95: `${histogram.percentile(95) / 1e6}ms`,
        p99: `${histogram.percentile(99) / 1e6}ms`,
        max: `${histogram.max / 1e6}ms`,
    };

    console.log('Event Loop Latency:', metrics);

    // 延迟过高时写入诊断日志
    if (histogram.percentile(99) / 1e6 > 100) {
        await appendFile(
            'event-loop-alert.log',
            `${new Date().toISOString()} ${JSON.stringify(metrics)}\n`,
        );
    }
}, 10000);

setInterval(async () => {
    // 模拟数据库查询
    await new Promise((resolve) => setTimeout(resolve, 50));
}, 100);

// 模拟文件 I/O（使用异步版本避免阻塞事件循环）
setInterval(() => {
    import('node:fs').then(({ readFile }) => {
        readFile(__filename, () => {});
    });
}, 500);
```

### 2.8.2 微任务 vs 宏任务执行顺序验证

```typescript
// event-loop-order.test.ts
import { describe, it, expect, jest } from '@jest/globals';

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
            // nextTick 在 timers 阶段之前清空，因此排在最前
            // microtask 在 nextTick 之后清空
            // timeout 在 timers 阶段执行
            // immediate 在 check 阶段执行（timeout 之后的 poll 阶段后）
            expect(order).toEqual([
                'nextTick',
                'microtask',
                'timeout',
                'immediate',
            ]);
            done();
        }, 10);
    });

    it('should drain nextTick before Promise microtask', (done) => {
        const order: string[] = [];

        process.nextTick(() => {
            order.push('nextTick1');
        });

        Promise.resolve().then(() => {
            order.push('promise1');
        });

        process.nextTick(() => {
            order.push('nextTick2');
        });

        Promise.resolve().then(() => {
            order.push('promise2');
        });

        setTimeout(() => {
            expect(order).toEqual([
                'nextTick1',
                'nextTick2',
                'promise1',
                'promise2',
            ]);
            done();
        }, 10);
    });

    it('should prioritize setImmediate over setTimeout in I/O callback', (done) => {
        // 在 I/O 回调中，setImmediate 总是先于 setTimeout(fn, 0)
        const order: string[] = [];

        // 读取自身，触发 I/O 回调
        fs.readFile(__filename, () => {
            setImmediate(() => {
                order.push('immediate');
            });

            setTimeout(() => {
                order.push('timeout');
                expect(order[0]).toBe('immediate');
                done();
            }, 0);
        });
    });
});
```

### 2.8.3 `setImmediate` 拆分 CPU 密集任务

```typescript
// chunked-processing.ts
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = 3000;

// 模拟 CPU 密集型计算：素数检测
function isPrime(n: number): boolean {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i * i <= n; i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

// 使用 setImmediate 拆分大范围素数检测
function findPrimesInChunks(
    start: number,
    end: number,
    chunkSize: number,
    onPrime: (prime: number) => void,
    onComplete: () => void,
): void {
    let current = start;
    const primes: number[] = [];

    function processChunk(): void {
        const chunkEnd = Math.min(current + chunkSize, end);
        for (let i = current; i < chunkEnd; i++) {
            if (isPrime(i)) {
                primes.push(i);
                onPrime(i);
            }
        }
        current = chunkEnd;
        if (current < end) {
            // 让出事件循环给 I/O 和定时器
            setImmediate(processChunk);
        } else {
            onComplete();
        }
    }

    setImmediate(processChunk);
}

// HTTP 服务：接受素数范围请求
const server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
        if (req.url?.startsWith('/primes')) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const start = parseInt(url.searchParams.get('start') || '1', 10);
            const end = parseInt(url.searchParams.get('end') || '10000', 10);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write(JSON.stringify({ status: 'processing', range: [start, end] }));

            findPrimesInChunks(
                start,
                end,
                500,
                (prime) => {
                    // 每发现一个素数可以通知客户端（流式响应）
                },
                () => {
                    res.end(JSON.stringify({ status: 'complete', message: '处理完成' }));
                },
            );
        } else {
            res.writeHead(200);
            res.end('OK');
        }
    },
);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

### 2.8.4 `UV_THREADPOOL_SIZE` 压测对比

```typescript
// threadpool-benchmark.ts
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

const asyncRandomBytes = promisify(randomBytes);

async function benchmark(concurrency: number): Promise<void> {
    const start = Date.now();
    const tasks: Promise<Buffer>[] = [];

    for (let i = 0; i < concurrency; i++) {
        tasks.push(asyncRandomBytes(64 * 1024)); // 64KB 随机字节
    }

    await Promise.all(tasks);
    const elapsed = Date.now() - start;
    console.log(
        `Concurrency: ${concurrency}, ` +
        `UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE || 4}, ` +
        `Elapsed: ${elapsed}ms`,
    );
}

// 运行对比
async function main(): Promise<void> {
    console.log('=== Threadpool Benchmark ===');
    // 小并发
    await benchmark(4);
    // 中等并发
    await benchmark(16);
    // 高并发
    await benchmark(64);
}

main().catch(console.error);
```

---

## 本章小结

Libuv 与事件循环是 Node.js 高性能的基石。理解其六个阶段的调度机制、微任务与宏任务的交互关系，以及潜在的风险和优化手段，是编写健壮 Node.js 应用的必备能力。关键要点：

1. **事件循环的六个阶段**（timers → pending callbacks → idle/prepare → poll → check → close callbacks）决定了异步回调的执行顺序。
2. **微任务队列**（nextTick → Promise）在每个阶段之间清空，无数量限制的设计可能导致 I/O 饥饿。
3. **CPU 密集型任务**会阻塞整个事件循环，应使用 `setImmediate` 拆分、Worker Thread 或子进程隔离。
4. **`UV_THREADPOOL_SIZE`** 影响文件 I/O 和 DNS 查询的并发能力，需根据负载特性调整。
5. **监控手段**（`perf_hooks.monitorEventLoopDelay`、clinic.js）是发现事件循环问题的第一道防线。