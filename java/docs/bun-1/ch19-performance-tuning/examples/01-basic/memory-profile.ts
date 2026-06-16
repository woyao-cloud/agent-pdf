#!/usr/bin/env bun

/**
 * Chapter 19: 性能调优与监控
 * Example 01 - Memory Profiling
 *
 * Demonstrates memory profiling techniques in Bun:
 * - Heap snapshot analysis
 * - Memory leak detection patterns
 * - Garbage collection monitoring
 * - Process memory metrics
 */

import * as os from "os";

// ─── Memory Metrics ──────────────────────────────────────────────────────

interface MemoryMetrics {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

function getMemoryMetrics(): MemoryMetrics {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers || 0,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// ─── Memory Leak Pattern 1: Global Accumulator ──────────────────────────

class MemoryLeakSimulator {
  private leakyCache: Map<string, any[]> = new Map();
  private iterations = 0;

  simulateLeakyCache(): void {
    // This pattern causes memory leak: unbounded cache growth
    for (let i = 0; i < 100; i++) {
      const key = `cache_${this.iterations}_${i}`;
      this.leakyCache.set(key, new Array(1000).fill({ data: "leaked data " + key }));
    }
    this.iterations++;
  }

  simulateFixedCache(): void {
    // Fixed version: limit cache size
    for (let i = 0; i < 100; i++) {
      const key = `cache_${this.iterations}_${i}`;
      this.leakyCache.set(key, new Array(1000).fill({ data: "cached data " + key }));
    }
    // Evict old entries when cache exceeds limit
    if (this.leakyCache.size > 1000) {
      const keysToDelete = [...this.leakyCache.keys()].slice(0, 100);
      for (const k of keysToDelete) {
        this.leakyCache.delete(k);
      }
    }
    this.iterations++;
  }

  get cacheSize(): number {
    return this.leakyCache.size;
  }
}

// ─── Memory Leak Pattern 2: Forgotten Timers ─────────────────────────────

function simulateTimerLeak(): { stop: () => void; count: () => number } {
  const timers: ReturnType<typeof setInterval>[] = [];
  let count = 0;

  // Leaking: timers are never cleared
  for (let i = 0; i < 5; i++) {
    const timer = setInterval(() => {
      count++;
      // This closure captures 'count' and holds memory
      const data = new Array(1000).fill("timer data");
    }, 100000); // Long interval to avoid actual execution
    timers.push(timer);
  }

  return {
    stop: () => timers.forEach(clearInterval),
    count: () => timers.length,
  };
}

// ─── Memory Leak Pattern 3: Closure References ──────────────────────────

function createClosureLeak(): () => void {
  const largeData = new Array(10000).fill("A".repeat(100));

  return function leakyClosure() {
    // This closure holds reference to largeData
    // If this function is stored globally, largeData cannot be GC'd
    console.log(`  Closure referencing ${formatBytes(largeData.length * 100)} of data`);
  };
}

// ─── Bun.memoryUsage() ───────────────────────────────────────────────────

function showBunMemoryUsage(): void {
  console.log("\n  ─── Bun.memoryUsage() ───\n");

  try {
    const usage = process.memoryUsage();
    console.log(`  RSS (Resident Set Size):      ${formatBytes(usage.rss)}`);
    console.log(`  Heap Total:                   ${formatBytes(usage.heapTotal)}`);
    console.log(`  Heap Used:                    ${formatBytes(usage.heapUsed)}`);
    console.log(`  External:                     ${formatBytes(usage.external)}`);
    if (usage.arrayBuffers) {
      console.log(`  ArrayBuffers:                ${formatBytes(usage.arrayBuffers)}`);
    }

    const heapUsagePercent = (usage.heapUsed / usage.heapTotal * 100).toFixed(1);
    console.log(`  Heap Utilization:             ${heapUsagePercent}%`);
  } catch (e) {
    console.log(`  ✗ Error: ${e}`);
  }
}

// ─── Heap Snapshot Simulation ───────────────────────────────────────────

function simulateHeapSnapshot(): void {
  console.log("\n  ─── Heap Snapshot Analysis (Simulated) ───\n");

  const snapshot = {
    totalSize: 45.2 * 1024 * 1024, // 45.2 MB
    nodes: 125000,
    edges: 580000,
    topTypes: [
      { type: "(array)", count: 12400, size: "8.2 MB" },
      { type: "(string)", count: 45200, size: "12.5 MB" },
      { type: "(object)", count: 18300, size: "6.8 MB" },
      { type: "(closure)", count: 3200, size: "1.2 MB" },
      { type: "Map", count: 85, size: "4.5 MB" },
      { type: "Set", count: 42, size: "1.8 MB" },
      { type: "Buffer", count: 210, size: "3.2 MB" },
      { type: "Function", count: 8900, size: "2.1 MB" },
    ],
    retainedSizeByDepth: [
      { depth: 0, size: "0.5 MB" },
      { depth: 1, size: "4.2 MB" },
      { depth: 2, size: "12.8 MB" },
      { depth: 3, size: "18.5 MB" },
      { depth: 4, size: "6.3 MB" },
      { depth: "5+", size: "2.9 MB" },
    ],
  };

  console.log(`  Total heap size: ${formatBytes(snapshot.totalSize)}`);
  console.log(`  Nodes: ${snapshot.nodes.toLocaleString()}`);
  console.log(`  Edges: ${snapshot.edges.toLocaleString()}`);
  console.log("");

  console.log("  Top types by count:");
  console.log("  ─────────────────────────────────────");
  for (const t of snapshot.topTypes) {
    console.log(`  ${t.type.padEnd(20)} ${t.count.toLocaleString().padStart(8)} instances (${t.size})`);
  }

  console.log("\n  Retained size by GC depth:");
  console.log("  ─────────────────────────────────────");
  for (const d of snapshot.retainedSizeByDepth) {
    const bar = "█".repeat(Math.round(parseFloat(d.size) * 2));
    console.log(`  Depth ${d.depth.toString().padStart(3)}: ${bar} ${d.size}`);
  }
}

// ─── GC Monitoring ──────────────────────────────────────────────────────

async function monitorGC(): Promise<void> {
  console.log("\n  ─── GC Monitoring ───\n");

  // Force GC and measure
  if (global.gc) {
    console.log("  Forcing garbage collection...");

    const before = process.memoryUsage();
    global.gc();
    const after = process.memoryUsage();

    const freed = before.heapUsed - after.heapUsed;
    console.log(`  Heap before GC: ${formatBytes(before.heapUsed)}`);
    console.log(`  Heap after GC:  ${formatBytes(after.heapUsed)}`);
    console.log(`  Freed:          ${formatBytes(freed)} (${(freed / before.heapUsed * 100).toFixed(1)}%)`);
  } else {
    console.log("  GC not exposed. Run with --expose-gc flag for GC monitoring.");
    console.log("  bun --expose-gc run examples/01-basic/memory-profile.ts");
  }
}

// ─── FFI Memory Leak Pattern ─────────────────────────────────────────────

function demonstrateFFILeakPattern(): void {
  console.log("\n  ─── FFI Pointer Leak Pattern ───\n");

  console.log("  Common Bun-specific memory leak: FFI pointer not released");
  console.log("");
  console.log("  ❌ Leaky pattern:");
  console.log("  const ptr = ffi.symbols.create_buffer(1024);");
  console.log("  // ptr never freed — memory leak!");
  console.log("");
  console.log("  ✅ Correct pattern:");
  console.log("  const ptr = ffi.symbols.create_buffer(1024);");
  console.log("  try {");
  console.log("    // use ptr...");
  console.log("  } finally {");
  console.log("    ffi.symbols.free_buffer(ptr);");
  console.log("  }");
  console.log("");
  console.log("  Or use Bun's FFI with auto-free:");
  console.log("  const buf = Buffer.alloc(1024);");
  console.log("  // Bun automatically manages Buffer lifecycle");
}

// ─── Macros Cache Pattern ───────────────────────────────────────────────

function demonstrateMacrosCacheLeak(): void {
  console.log("\n  ─── Macros Cache Leak Pattern ───\n");

  console.log("  Another Bun-specific pattern: unbounded SQL cache");
  console.log("");
  console.log("  ❌ Leaky pattern (new query each time):");
  console.log("  function getUser(id: number) {");
  console.log("    return db.query('SELECT * FROM users WHERE id = ' + id).get();");
  console.log("  }");
  console.log("  // Bun caches prepared statements — unlimited unique queries = cache bloat");
  console.log("");
  console.log("  ✅ Correct pattern (parameterized query):");
  console.log("  const stmt = db.query('SELECT * FROM users WHERE id = ?');");
  console.log("  function getUser(id: number) {");
  console.log("    return stmt.get(id);");
  console.log("  }");
  console.log("  // Single cached prepared statement");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Memory Profiling in Bun");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  Total system memory: ${formatBytes(os.totalmem())}`);
  console.log(`  Free system memory:  ${formatBytes(os.freemem())}`);
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Current memory usage
  showBunMemoryUsage();

  // 2. Memory leak patterns
  console.log("\n  ─── Memory Leak Pattern Analysis ───\n");

  const leakSim = new MemoryLeakSimulator();

  console.log("  Pattern 1: Unbounded Cache Growth");
  console.log("  Running 10 iterations of leaky cache...");
  for (let i = 0; i < 10; i++) {
    leakSim.simulateLeakyCache();
  }
  console.log(`  Cache entries: ${leakSim.cacheSize}`);
  console.log(`  Memory after leaky cache:`);
  const afterLeak = process.memoryUsage();
  console.log(`  Heap Used: ${formatBytes(afterLeak.heapUsed)}`);

  console.log("\n  Pattern 2: Forgotten Timers/Intervals");
  const timerLeak = simulateTimerLeak();
  console.log(`  Active timers: ${timerLeak.count()}`);
  console.log("  Each timer holds a closure with allocated data");
  timerLeak.stop();
  console.log("  Timers cleared.");

  console.log("\n  Pattern 3: Closure References");
  const leakyFn = createClosureLeak();
  leakyFn();
  console.log("  Closure stored — largeData cannot be GC'd");

  // 3. GC monitoring
  await monitorGC();

  // 4. Simulate heap snapshot
  simulateHeapSnapshot();

  // 5. Bun-specific patterns
  demonstrateFFILeakPattern();
  demonstrateMacrosCacheLeak();

  // 6. Memory optimization tips
  console.log("\n  ─── Memory Optimization Tips ───\n");

  const tips = [
    "Use Bun.SQLite prepared statements (avoid string concatenation in queries)",
    "Limit Bun.file() usage — read files as streams for large files",
    "Avoid storing large objects in closure scopes",
    "Use WeakMap/WeakSet for caches that should not prevent GC",
    "Monitor Bun.memoryUsage() in production",
    "Use --expose-gc for manual GC triggering in test environments",
    "Set reasonable maxOldSpaceSize for containerized environments",
    "For long-running processes, periodically restart to reclaim memory",
    "Use Streams API instead of reading entire files into memory",
    "Avoid storing binary data in JavaScript objects — use ArrayBuffer",
  ];

  for (let i = 0; i < tips.length; i++) {
    console.log(`  ${i + 1}. ${tips[i]}`);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Memory profiling complete.");
  console.log("  For production profiling: bun --inspect");
  console.log("  Then connect Chrome DevTools for heap snapshots.");
  console.log("═══════════════════════════════════════════════════\n");
}

await main();
