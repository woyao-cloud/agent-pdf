# 第11章 生产环境三大杀手排查

## 11.1 使用场景

生产环境中，Node.js 应用最常见的故障可以归纳为三类，业界俗称"三大杀手"：

- **OOM（Out of Memory）**：进程内存持续增长，最终被操作系统 OOM Killer 终止。典型表现为应用突然无响应，日志中出现 `FATAL ERROR: Reached heap limit Allocation failed` 或进程直接消失。
- **CPU 飙高**：CPU 使用率长期维持在 90% 以上，导致请求响应变慢，甚至触发云平台自动扩缩容阈值。常见于循环陷阱、正则回溯、JSON 序列化大对象。
- **请求延迟抖动**：P99 延迟曲线出现周期性或突发性尖峰，但平均延迟正常。根因通常是事件循环阻塞、垃圾回收暂停、或下游依赖慢调用。

此外，还有应用彻底无响应（hang）的情况，比如死锁、文件描述符耗尽、或 Node.js 事件循环完全停滞。

## 11.2 实现原理

### V8 堆内存结构

V8 将 JavaScript 堆划分为几个逻辑空间，理解它们有助于定位内存问题：

- **新生代（New Space）**：存放短生命周期对象，使用 Scavenge 算法（From-Space → To-Space 复制），GC 频率高但单次停顿短，通常 1~8 MB。
- **老生代（Old Space）**：存活超过两轮新生代 GC 的对象被晋升至此，使用 Mark-Sweep-Compact 算法，GC 停顿时间较长，是内存泄漏监控的重点区域。
- **大对象空间（Large Object Space）**：存放超过 1 MB 的单个对象（例如大数组、Buffer），分配后不会移动，直接进行 mark-sweep。
- **代码空间（Code Space）**：存放 JIT 编译后的机器码。
- **Map 空间（Map Space）**：存放隐藏类（Hidden Class）元信息。

OOM 的根本原因是老生代中可回收对象无法被 GC 释放，导致 V8 向操作系统申请更多内存，触发操作系统限制。

### CPU 火焰图原理

CPU 火焰图是性能分析的"黄金标准"，其原理基于**定时采样**：

1. **采样（Sampling）**：以固定频率（通常 1000 Hz，即每秒 1000 次）中断进程执行，记录当前调用栈。每个采样点对应一个调用栈帧的堆叠。
2. **聚合（Aggregation）**：将所有采样点的调用栈汇总，相同栈帧路径合并，统计每个函数出现在栈顶（on-CPU）的次数。
3. **可视化**：X 轴按字母排序，不代表时间顺序；Y 轴为调用深度；方块宽度 = 该函数在采样中的出现频率占比。宽方块意味着该函数消耗了大量 CPU 时间。

工具如 `clinic.js flame`、`0x`、`perf` 均基于此原理。

### 事件循环延迟测量原理

Node.js 事件循环本质是一个单线程任务调度器。当某个阶段（如 timer callbacks、poll I/O）的执行时间过长，后续阶段的任务就会被延迟。

通过 `perf_hooks.monitorEventLoopDelay` 可以测量这种延迟：它在事件循环每次"tick"时记录一个高精度时间戳，与"预期 tick 时间"的差值即为延迟。该 API 输出一个 `Histogram` 对象，支持 `percentile`、`min`、`max` 等统计指标，是判断事件循环健康度的关键指标。

## 11.3 潜在风险

### 内存泄漏常见原因

| 原因 | 说明 | 代码特征 |
|------|------|----------|
| 闭包未释放 | 函数内部变量被外部闭包持有无法回收 | 回调嵌套过多、partial application |
| 全局缓存膨胀 | 使用 `Map`/`Object` 作为缓存但无淘汰策略 | `const cache = new Map(); cache.set(...)` 但从未 delete |
| 事件监听器未移除 | `EventEmitter.on()` 添加的监听器在对象销毁后未 detach | `emitter.on('data', handler)` 缺少 `emitter.off('data', handler)` |
| 定时器/Interval | `setInterval` 的回调中引用了大量外部变量 | 忘记 `clearInterval` |
| Stream 未消费 | `Readable` 处于 paused 模式且未被 pipe 或 data 事件消费 | 内部 buffer 无限增长 |

### 正则表达式回溯（ReDoS）

正则引擎在遇到嵌套量词（如 `(a+)+b`）且匹配失败时，会进行指数级的回溯试探，导致 CPU 瞬间飙高。

典型危险模式：

```typescript
// 危险：嵌套量词 + 重复分组
const re = /^(\w+[\s\S]*)+$/;
// 输入: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac"
// 回溯次数 ≈ 2^n

// 邮箱校验陷阱
const re = /^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})$/;
// 当输入极长用户名且没有 @ 时触指数级回溯
```

### 微任务队列积压

`Promise.then`、`process.nextTick`、`queueMicrotask` 的执行优先级高于 I/O 回调。如果微任务链无限递归，会饿死事件循环的 I/O 阶段，导致应用看似"卡死"——虽然 CPU 在全力工作，但网络请求得不到处理。

## 11.4 排查方法

### 内存泄漏：heapdump 对比法

这是排查 Node.js 内存泄漏最有效的手段，核心思路是"两次快照做差"。

**步骤：**

1. 在应用中集成 `heapdump` 模块，或通过 `--heapsnapshot-signal` 标志触发。
2. 在内存相对稳定的时间点（如刚启动后）抓取第一次快照。
3. 在有内存增长的场景下（如连续处理大量请求后）抓取第二次快照。
4. 在 Chrome DevTools → Memory → Load 中加载两个快照，选择 **Comparison** 视图。
5. 按 **Delta**（新增对象数）排序，查找增长量巨大的构造函数。
6. 按 **Retained Size**（保留大小）排序，查找占用内存最多的对象。

**典型发现模式：**

- `Array` 类型的 `# Delta` 暴增 → 检查数组是否被全局引用，且持续 push 永不 pop。
- `Closure` 类型的 `Retained Size` 很大 → 检查闭包中引用的外部变量链。
- `(string)` 类型的数量异常 → 检查是否存在大量字符串拼接的日志或数据缓存。

```typescript
// 内存泄漏排查示例
import heapdump from 'heapdump';

const leaks: any[] = [];

setInterval(() => {
  // 模拟内存泄漏：不断向全局数组 push 大对象
  leaks.push(new Array(10000).fill('leak'));

  // 每 10 次触发一次堆快照
  if (leaks.length % 10 === 0) {
    const snapshotPath = `/tmp/heap-${Date.now()}.heapsnapshot`;
    heapdump.writeSnapshot(snapshotPath, (err, filename) => {
      if (err) console.error('heapdump failed:', err);
      else console.log('heap snapshot saved:', filename);
    });
  }
}, 1000);
```

> **提示**：生产环境建议使用 `--heapsnapshot-signal=SIGUSR2`，通过发送信号来触发快照，而非在代码中固定间隔抓取。

### CPU 100%：火焰图分析

使用 `clinic.js` 工具链定位 CPU 热点：

```bash
# 安装 clinic.js
npm install -g clinic

# 以火焰图模式启动应用，-o 表示输出火焰图 HTML
clinic flame -- node app.js

# 在浏览器中打开生成的 .flamegraph.html 文件
```

**火焰图读图技巧：**

1. 看最宽的方块——它们是 CPU 真正的消耗点。
2. 关注 `RegExp.test` / `exec` 相关的方块——很可能是正则回溯。
3. 搜索形如 `/(a|aa)+b/` 的模式——这是经典 ReDoS 模式，`+` 嵌套在 `()` 分组内。
4. 关注 `JSON.stringify` / `JSON.parse`——如果处理超大 JSON，应考虑流式方案。

**另一种快速方案：使用 Node.js 内置的 CPU Profile：**

```bash
# 启动时开启 CPU Profile，持续 60 秒
node --cpu-prof --cpu-prof-dir=./profiles --cpu-prof-interval=1000 app.js
```

生成的 `.cpuprofile` 文件可直接导入 Chrome DevTools → Performance → Load Profile 查看火焰图。

### 事件循环阻塞：perf_hooks 监控

```typescript
// 事件循环延迟监控
import { monitorEventLoopDelay } from 'node:perf_hooks';
import express from 'express';

const app = express();
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

// 每 5 秒输出指标到控制台
setInterval(() => {
  console.log({
    eventLoopLagMs: {
      p50: (histogram.percentile(50) / 1e6).toFixed(2),
      p90: (histogram.percentile(90) / 1e6).toFixed(2),
      p99: (histogram.percentile(99) / 1e6).toFixed(2),
      max: (histogram.max / 1e6).toFixed(2),
    },
  });
}, 5000);

// 暴露到 /metrics 端点供 Prometheus 抓取
app.get('/metrics', async (req, res) => {
  res.json({
    event_loop_lag_ms_p50: histogram.percentile(50) / 1e6,
    event_loop_lag_ms_p90: histogram.percentile(90) / 1e6,
    event_loop_lag_ms_p99: histogram.percentile(99) / 1e6,
    event_loop_lag_ms_max: histogram.max / 1e6,
  });
});

app.listen(3000);
```

**判定标准：**

| 延迟范围 | 健康度 | 建议行动 |
|----------|--------|----------|
| < 10 ms | 健康 | 无需处理 |
| 10 ~ 50 ms | 亚健康 | 排查当前事件循环阶段的耗时操作 |
| 50 ~ 200 ms | 警告 | 检查 GC 频率、是否存在同步 I/O 或长循环 |
| > 200 ms | 严重 | 立即定位 CPU 热点或同步阻塞调用 |

## 11.5 典型问题处理

### 内存泄漏自动发现

启用 `--trace-gc` 标志可以输出所有 GC 事件日志，帮助判断 GC 频率与每次回收量是否异常：

```bash
node --trace-gc app.js 2>&1 | grep "Mark-sweep"
```

输出示例：

```
[17854:0x140008000]  1024 ms: Mark-sweep 45.2 (68.7) -> 42.1 (69.7) MB, 2.3 / 0.0 ms
[17854:0x140008000]  2048 ms: Mark-sweep 48.7 (72.4) -> 79.3 (84.0) MB, 3.1 / 0.0 ms
[17854:0x140008000]  3072 ms: Mark-sweep 82.5 (88.9) -> 112.4 (121.0) MB, 4.2 / 0.0 ms
```

如果发现 **used heap**（箭头前的数值）持续增长且从不回落到基线水平，说明存在内存泄漏。

### Node.js 诊断报告

Node.js 内置的诊断报告可以一键收集进程的全面状态：

```bash
# 启动时启用诊断报告
node --diagnostic-dir=./reports app.js

# 运行时触发报告（通过信号）
kill -USR2 <PID>
```

报告包含以下维度的快照：

- JavaScript 堆统计（heap statistics）
- GC 状态
- CPU 架构与资源使用
- 活跃 handle（定时器、Socket、文件描述符的数量）
- 事件循环延迟
- libuv 句柄队列

这是定位"应用无响应"问题的最佳起点。

### CPU Profile

Node.js 内置的 `--cpu-prof` 可以在不安装任何第三方工具的情况下生成火焰图数据：

```bash
# 持续 5 分钟后自动停止
node --cpu-prof --cpu-prof-dir=./profiles --cpu-prof-interval=500 --cpu-prof-duration=300 app.js
```

生成的 `.cpuprofile` 是 JSON 格式，可以直接在 Chrome DevTools 中加载查看。

## 11.6 开发者技能

以下是生产环境排查需要掌握的工具链：

| 工具 | 用途 | 难度 |
|------|------|------|
| Chrome DevTools Memory | 堆快照分析与 Comparison 视图 | 中 |
| Chrome DevTools Performance | JavaScript CPU Profile 火焰图查看 | 中 |
| clinic.js | 一键生成火焰图，定位 CPU 热点 | 低 |
| heapdump / v8-profiler | 进程内触发堆快照 | 低 |
| 0x | 火焰图生成（基于 perf + linux-trace） | 中 |
| perf_hooks | 事件循环延迟、GC 耗时、UV handle 统计 | 中 |
| Node.js --diagnostic-report | 一键进程诊断数据 | 低 |
| `--trace-gc` / `--trace-event-categories` | 开启详细 GC/事件追踪日志 | 低 |

**推荐学习路径**：

1. 从 `clinic.js flame` 和 Chrome DevTools Memory 入手，这两者覆盖 80% 的排查场景。
2. 进阶掌握 `perf_hooks` 事件循环监控和 `--diagnostic-report` 诊断报告。
3. 深入学习 V8 内存管理与 GC 策略。

## 11.7 示例代码

### 内存泄漏排查

```typescript
// memory-leak-demo.ts
import heapdump from 'heapdump';

class LeakDetector {
  private cache = new Map<string, Buffer>();

  /** 模拟内存泄漏：向闭包持有的大数组添加数据 */
  simulateArrayLeak() {
    const leaked: any[] = [];
    setInterval(() => {
      leaked.push(new Array(1000).fill('leaked-data'));
      process.stdout.write(`leaked array length: ${leaked.length}\n`);
    }, 100);
  }

  /** 模拟缓存泄漏：向全局 Map 不断添加却从不清理 */
  simulateCacheLeak() {
    setInterval(() => {
      const key = `key-${Date.now()}`;
      this.cache.set(key, Buffer.alloc(1024 * 100)); // 100KB per entry
      process.stdout.write(`cache size: ${this.cache.size}\n`);
    }, 50);
  }

  /** 在指定间隔生成堆快照 */
  startSnapshot(intervalMs = 5000) {
    setInterval(() => {
      const path = `/tmp/heap-${Date.now()}.heapsnapshot`;
      heapdump.writeSnapshot(path, (err) => {
        if (err) console.error('snapshot failed:', err);
        else console.log(`snapshot saved: ${path}`);
      });
    }, intervalMs);
  }
}

const detector = new LeakDetector();
detector.simulateArrayLeak();
detector.simulateCacheLeak();
detector.startSnapshot(10000);
```

### 事件循环延迟监控

```typescript
// event-loop-monitor.ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
import express from 'express';

const app = express();
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

app.get('/metrics', async (req, res) => {
  res.json({
    event_loop_lag_ms_p50: histogram.percentile(50) / 1e6,
    event_loop_lag_ms_p90: histogram.percentile(90) / 1e6,
    event_loop_lag_ms_p99: histogram.percentile(99) / 1e6,
    event_loop_lag_ms_max: histogram.max / 1e6,
    event_loop_lag_ms_min: histogram.min / 1e6,
  });
});

app.get('/block', (req, res) => {
  // 模拟同步阻塞操作——生产环境中 NEVER 这样写
  const start = Date.now();
  while (Date.now() - start < 5000) { /* busy wait */ }
  res.send('done blocking');
});

app.listen(3000, () => {
  console.log('monitor app listening on :3000');
});
```

### CPU Profile 生成

```typescript
// 使用 Node.js 内置模块生成 CPU Profile
// 通过 --cpu-prof 启动即可，无需额外代码
// 但也可以通过 inspector 模块在运行时动态控制
import * as inspector from 'node:inspector';
import * as fs from 'node:fs';

const session = new inspector.Session();
session.connect();

session.post('Profiler.enable', () => {
  session.post('Profiler.start', () => {
    console.log('CPU profiling started');

    // 30 秒后停止并保存
    setTimeout(() => {
      session.post('Profiler.stop', (err, { profile }) => {
        if (err) {
          console.error('profiler stop error:', err);
          return;
        }
        fs.writeFileSync('./profiles/dynamic-profile.cpuprofile', JSON.stringify(profile));
        console.log('CPU profile saved');
      });
    }, 30000);
  });
});
```

## 11.8 Docker Compose：监控基础设施

以下 Compose 文件部署生产环境问题排查所需的完整监控栈，包括 Node.js 应用、Prometheus 指标收集、Grafana 可视化、以及 Loki 日志中心。

```yaml
# docker-compose.monitoring.yml
services:
  node-app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', r => r.resume())"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

  prometheus:
    image: prom/prometheus:v2.52.0
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.console.libraries=/usr/share/prometheus/console_libraries"
      - "--web.console.templates=/usr/share/prometheus/consoles"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.0.0
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

  loki:
    image: grafana/loki:3.0.0
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```