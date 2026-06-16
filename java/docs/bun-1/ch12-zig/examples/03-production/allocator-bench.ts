/**
 * allocator-bench.ts — 自定义分配器性能基准测试
 *
 * 对比不同分配策略在不同工作负载下的性能表现。
 * 模拟 Bun 在真实场景中的内存分配模式。
 *
 * 测试负载类型:
 *   - 小对象密集型 (HTTP 头部解析): 32-256B
 *   - 中等对象混合 (JSON 解析): 256B-8KB
 *   - 大对象 (文件读取): 64KB-1MB
 *   - 随机大小 (通用负载)
 *   - 生命周期模式 (请求处理: 分配→使用→批量释放)
 */

import {
  GeneralPurposeAllocator,
  FixedBufferAllocator,
  StackAllocator,
  PoolAllocator,
  PageAllocator,
  ArenaFallbackAllocator,
  AllocatorImpl,
} from "../02-advanced/allocator-demo.ts";

// ─── 基准测试框架 ──────────────────────────────────────────────────────

interface BenchResult {
  name: string;
  workload: string;
  wallTime: number;
  opsPerSec: number;
  totalAllocated: number;
  peakUsage: number;
  allocations: number;
  frees: number;
  allocPerSec: number;
}

interface Workload {
  name: string;
  sizes: number[];
  iterations: number;
  description: string;
}

const WORKLOADS: Workload[] = [
  {
    name: "small-object",
    sizes: [32, 64, 128, 256],
    iterations: 10000,
    description: "小对象密集型 (HTTP 头部解析, 32-256B)",
  },
  {
    name: "medium-mixed",
    sizes: [256, 512, 1024, 2048, 4096, 8192],
    iterations: 5000,
    description: "中等对象混合 (JSON 解析, 256B-8KB)",
  },
  {
    name: "large-object",
    sizes: [65536, 131072, 262144, 524288, 1048576],
    iterations: 500,
    description: "大对象 (文件读取, 64KB-1MB)",
  },
  {
    name: "random-size",
    sizes: [], // 动态生成
    iterations: 5000,
    description: "随机大小 (通用负载, 32B-1MB)",
  },
  {
    name: "request-lifecycle",
    sizes: [64, 128, 256, 512, 1024],
    iterations: 2000,
    description: "请求生命周期 (分配→使用→批量释放)",
  },
];

// 生成随机大小
function getRandomSize(min: number, max: number): number {
  // 对数分布，更贴近真实场景
  const r = Math.random();
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return Math.round(Math.exp(logMin + r * (logMax - logMin)));
}

function runWorkload(
  allocator: AllocatorImpl,
  workload: Workload,
): BenchResult {
  const start = performance.now();

  let totalAllocated = 0;
  let peakUsage = 0;
  let currentUsage = 0;
  let allocCount = 0;
  let freeCount = 0;

  const liveAllocs: ArrayBuffer[] = [];

  for (let i = 0; i < workload.iterations; i++) {
    let size: number;

    switch (workload.name) {
      case "random-size":
        size = getRandomSize(32, 1048576);
        break;
      case "request-lifecycle":
        // 每 100 次分配模拟一个请求生命周期
        size = workload.sizes[i % workload.sizes.length];
        break;
      default:
        size = workload.sizes[i % workload.sizes.length];
    }

    const buf = allocator.alloc(size);
    if (buf) {
      allocCount++;
      totalAllocated += size;
      currentUsage += size;
      if (currentUsage > peakUsage) peakUsage = currentUsage;

      if (workload.name === "request-lifecycle") {
        liveAllocs.push(buf);
        // 每 100 次分配批量释放
        if (liveAllocs.length >= 100) {
          for (const b of liveAllocs) {
            allocator.free(b);
            freeCount++;
            currentUsage -= (b.byteLength);
          }
          liveAllocs.length = 0;
        }
      } else {
        // 其他负载: 50% 立即释放, 50% 保留
        if (Math.random() < 0.5) {
          allocator.free(buf);
          freeCount++;
          currentUsage -= size;
        } else {
          liveAllocs.push(buf);
        }
      }
    }
  }

  // 清理所有残留
  for (const b of liveAllocs) {
    allocator.free(b);
    freeCount++;
  }
  allocator.reset();

  const end = performance.now();
  const wallTime = end - start;

  return {
    name: allocator.name,
    workload: workload.name,
    wallTime,
    opsPerSec: Math.round(workload.iterations / (wallTime / 1000)),
    totalAllocated,
    peakUsage,
    allocations: allocCount,
    frees: freeCount,
    allocPerSec: Math.round(allocCount / (wallTime / 1000)),
  };
}

// ─── 运行基准测试 ──────────────────────────────────────────────────────

console.log("==================================================");
console.log("  Zig 风格分配器性能基准测试");
console.log("==================================================\n");

const allocators: AllocatorImpl[] = [
  new GeneralPurposeAllocator(),
  new FixedBufferAllocator(64 * 1024 * 1024), // 64MB arena
  new StackAllocator(),
  new PoolAllocator(256),
  new PageAllocator(),
  new ArenaFallbackAllocator(1024 * 1024), // 1MB arena
];

const results: BenchResult[] = [];

for (const workload of WORKLOADS) {
  // 跳过不适合的工作负载
  for (const allocator of allocators) {
    // PageAllocator 不适合小对象
    if (allocator instanceof PageAllocator && (workload.name === "small-object" || workload.name === "random-size")) {
      continue;
    }
    // PoolAllocator 只适合 <= 256B
    if (allocator instanceof PoolAllocator && (workload.name === "large-object" || workload.name === "medium-mixed")) {
      continue;
    }
    // FixedBufferAllocator 对大对象可能不够
    if (allocator instanceof FixedBufferAllocator && workload.name === "large-object") {
      continue;
    }

    try {
      const result = runWorkload(allocator, workload);
      results.push(result);
    } catch (e) {
      console.log(`  [SKIP] ${allocator.name} @ ${workload.name}: ${e}`);
    }
  }
}

// ─── 输出结果表格 ──────────────────────────────────────────────────────

function printResultsTable(results: BenchResult[]): void {
  // 按工作负载分组
  const grouped = new Map<string, BenchResult[]>();
  for (const r of results) {
    if (!grouped.has(r.workload)) grouped.set(r.workload, []);
    grouped.get(r.workload)!.push(r);
  }

  for (const [workloadName, workloadResults] of grouped) {
    const workloadDesc = WORKLOADS.find(w => w.name === workloadName)?.description ?? workloadName;
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  工作负载: ${workloadDesc}`);
    console.log(`${"=".repeat(70)}`);
    console.log(
      `  ${"分配器".padEnd(28)} ${"耗时(ms)".padEnd(10)} ${"op/s".padEnd(12)} ${"分配/s".padEnd(12)} ${"峰值".padEnd(10)}`
    );
    console.log(`  ${"-".repeat(70)}`);

    // 按耗时排序 (升序 = 最快在前)
    workloadResults.sort((a, b) => a.wallTime - b.wallTime);

    for (const r of workloadResults) {
      const peakMB = (r.peakUsage / (1024 * 1024)).toFixed(2);
      console.log(
        `  ${r.name.padEnd(28)} ` +
        `${r.wallTime.toFixed(2).padStart(8)}ms ` +
        `${r.opsPerSec.toLocaleString().padStart(10)} ` +
        `${r.allocPerSec.toLocaleString().padStart(10)} ` +
        `${peakMB.padStart(8)}MB`
      );
    }
  }
}

printResultsTable(results);

// ─── 总结建议 ──────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(70)}`);
console.log("  分配器选择建议 (基于 Bun/Zig 实践)");
console.log(`${"=".repeat(70)}`);
console.log(`
  小对象 (<256B)   → PoolAllocator (零碎片, O(1))
  中等对象 (256B-8K) → GPA 或 Arena (平衡性能与灵活性)
  大对象 (>64KB)   → PageAllocator (直接 mmap, 减少 TLB miss)
  请求生命周期     → Arena (批量分配, 整体释放)
  嵌入式/受限环境  → FixedBufferAllocator (零系统调用)
  通用场景         → GPA + ThreadCache (大多数情况的最佳选择)
  混合场景         → ArenaFallbackAllocator (两全其美)

  Bun 的 JavaScriptCore 集成:
    - JavaScript 对象: JSC 自身的 GC + Bun 自定义 Pool
    - 内部缓冲区: FixedBufferAllocator (Bun 的 Malloc)
    - 系统调用缓冲: PageAllocator (mmap)
    - 运行时杂项: GeneralPurposeAllocator (Zig std.heap)
`);

// 输出 CSV 格式便于外部分析
console.log("\n--- CSV Data ---");
console.log("allocator,workload,wall_time_ms,ops_per_sec,alloc_per_sec,peak_mb");
for (const r of results) {
  console.log(`${r.name},${r.workload},${r.wallTime.toFixed(2)},${r.opsPerSec},${r.allocPerSec},${(r.peakUsage / 1048576).toFixed(4)}`);
}
