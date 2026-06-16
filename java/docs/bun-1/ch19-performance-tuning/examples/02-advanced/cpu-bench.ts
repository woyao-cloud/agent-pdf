#!/usr/bin/env bun

/**
 * Chapter 19: 性能调优与监控
 * Example 02 - CPU Benchmark
 *
 * Demonstrates CPU profiling and benchmarking techniques:
 * - Synthetic benchmarks for Bun vs Node.js comparison
 * - Flamegraph analysis concepts
 * - Hotspot detection patterns
 * - Performance measurement utilities
 */

import * as os from "os";
import * as crypto from "crypto";

// ─── Utility: Timer ──────────────────────────────────────────────────────

class Timer {
  private marks: Map<string, number> = new Map();
  private results: Map<string, number[]> = new Map();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark: string = name): number {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    if (start === undefined || end === undefined) {
      throw new Error(`Mark not found: ${startMark} or ${endMark}`);
    }
    const elapsed = end - start;
    if (!this.results.has(name)) {
      this.results.set(name, []);
    }
    this.results.get(name)!.push(elapsed);
    return elapsed;
  }

  getStats(name: string): { min: number; max: number; avg: number; total: number; count: number } | null {
    const values = this.results.get(name);
    if (!values || values.length === 0) return null;
    const total = values.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: total / values.length,
      total,
      count: values.length,
    };
  }

  clear(): void {
    this.marks.clear();
    this.results.clear();
  }
}

const timer = new Timer();

// ─── Benchmark 1: JSON Operations ────────────────────────────────────────

function benchmarkJSON(iterations: number): void {
  console.log(`\n  ─── Benchmark 1: JSON Operations (${iterations.toLocaleString()} iterations) ───\n`);

  const largeObject: Record<string, any> = {};
  for (let i = 0; i < 100; i++) {
    largeObject[`key_${i}`] = {
      id: i,
      name: `Item ${i}`,
      tags: ["a", "b", "c"],
      nested: {
        value: Math.random(),
        active: i % 2 === 0,
        metadata: { created: new Date().toISOString() },
      },
    };
  }

  const jsonStr = JSON.stringify(largeObject);

  // JSON.stringify
  timer.mark("stringify-start");
  for (let i = 0; i < iterations; i++) {
    JSON.stringify(largeObject);
  }
  timer.mark("stringify-end");
  timer.measure("JSON.stringify", "stringify-start", "stringify-end");

  // JSON.parse
  timer.mark("parse-start");
  for (let i = 0; i < iterations; i++) {
    JSON.parse(jsonStr);
  }
  timer.mark("parse-end");
  timer.measure("JSON.parse", "parse-start", "parse-end");

  // JSON.parse with reviver
  timer.mark("reviver-start");
  for (let i = 0; i < iterations; i++) {
    JSON.parse(jsonStr, (key, value) => {
      if (typeof value === "string" && key === "created") {
        return new Date(value);
      }
      return value;
    });
  }
  timer.mark("reviver-end");
  timer.measure("JSON.parse+reviver", "reviver-start", "reviver-end");

  // Print results
  for (const name of ["JSON.stringify", "JSON.parse", "JSON.parse+reviver"]) {
    const stats = timer.getStats(name);
    if (stats) {
      console.log(`  ${name.padEnd(25)}: ${stats.avg.toFixed(3)}ms avg, ${stats.total.toFixed(2)}ms total`);
    }
  }
}

// ─── Benchmark 2: Cryptographic Operations ───────────────────────────────

function benchmarkCrypto(iterations: number): void {
  console.log(`\n  ─── Benchmark 2: Cryptographic Operations (${iterations.toLocaleString()} iterations) ───\n`);

  // SHA-256 hashing
  timer.mark("sha256-start");
  for (let i = 0; i < iterations; i++) {
    crypto.createHash("sha256").update(`data-${i}`).digest("hex");
  }
  timer.mark("sha256-end");
  timer.measure("SHA-256 hash", "sha256-start", "sha256-end");

  // SHA-512 hashing
  timer.mark("sha512-start");
  for (let i = 0; i < iterations; i++) {
    crypto.createHash("sha512").update(`data-${i}`).digest("hex");
  }
  timer.mark("sha512-end");
  timer.measure("SHA-512 hash", "sha512-start", "sha512-end");

  // HMAC
  timer.mark("hmac-start");
  for (let i = 0; i < iterations; i++) {
    crypto.createHmac("sha256", "secret-key").update(`data-${i}`).digest("hex");
  }
  timer.mark("hmac-end");
  timer.measure("HMAC-SHA256", "hmac-start", "hmac-end");

  // Random bytes
  timer.mark("random-start");
  for (let i = 0; i < iterations; i++) {
    crypto.randomBytes(32);
  }
  timer.mark("random-end");
  timer.measure("randomBytes(32)", "random-start", "random-end");

  // UUID generation
  timer.mark("uuid-start");
  for (let i = 0; i < iterations; i++) {
    crypto.randomUUID();
  }
  timer.mark("uuid-end");
  timer.measure("randomUUID", "uuid-start", "uuid-end");

  for (const name of ["SHA-256 hash", "SHA-512 hash", "HMAC-SHA256", "randomBytes(32)", "randomUUID"]) {
    const stats = timer.getStats(name);
    if (stats) {
      console.log(`  ${name.padEnd(25)}: ${stats.avg.toFixed(3)}ms avg, ${stats.total.toFixed(2)}ms total`);
    }
  }
}

// ─── Benchmark 3: Array Operations ───────────────────────────────────────

function benchmarkArrays(iterations: number): void {
  console.log(`\n  ─── Benchmark 3: Array Operations (${iterations.toLocaleString()} iterations) ───\n`);

  const baseArray = Array.from({ length: 10000 }, (_, i) => i);

  // Array.map
  timer.mark("map-start");
  for (let i = 0; i < iterations; i++) {
    baseArray.map((x) => x * 2);
  }
  timer.mark("map-end");
  timer.measure("Array.map", "map-start", "map-end");

  // Array.filter
  timer.mark("filter-start");
  for (let i = 0; i < iterations; i++) {
    baseArray.filter((x) => x % 2 === 0);
  }
  timer.mark("filter-end");
  timer.measure("Array.filter", "filter-start", "filter-end");

  // Array.reduce
  timer.mark("reduce-start");
  for (let i = 0; i < iterations; i++) {
    baseArray.reduce((sum, x) => sum + x, 0);
  }
  timer.mark("reduce-end");
  timer.measure("Array.reduce", "reduce-start", "reduce-end");

  // Array.sort
  const shuffled = [...baseArray].sort(() => Math.random() - 0.5);
  timer.mark("sort-start");
  for (let i = 0; i < iterations; i++) {
    [...shuffled].sort((a, b) => a - b);
  }
  timer.mark("sort-end");
  timer.measure("Array.sort", "sort-start", "sort-end");

  // for loop (baseline)
  timer.mark("for-start");
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < baseArray.length; j++) {
      sum += baseArray[j];
    }
  }
  timer.mark("for-end");
  timer.measure("for loop", "for-start", "for-end");

  for (const name of ["Array.map", "Array.filter", "Array.reduce", "Array.sort", "for loop"]) {
    const stats = timer.getStats(name);
    if (stats) {
      console.log(`  ${name.padEnd(25)}: ${stats.avg.toFixed(3)}ms avg, ${stats.total.toFixed(2)}ms total`);
    }
  }
}

// ─── Benchmark 4: Bun-specific Operations ────────────────────────────────

function benchmarkBunSpecific(iterations: number): void {
  console.log(`\n  ─── Benchmark 4: Bun-specific Operations (${iterations.toLocaleString()} iterations) ───\n`);

  // Bun.hash
  timer.mark("bunhash-start");
  for (let i = 0; i < iterations; i++) {
    Bun.hash(`data-${i}`);
  }
  timer.mark("bunhash-end");
  timer.measure("Bun.hash", "bunhash-start", "bunhash-end");

  // Bun.version (property access)
  timer.mark("version-start");
  for (let i = 0; i < iterations; i++) {
    const v = Bun.version;
  }
  timer.mark("version-end");
  timer.measure("Bun.version", "version-start", "version-end");

  // Bun.nanoseconds
  timer.mark("nano-start");
  for (let i = 0; i < iterations; i++) {
    Bun.nanoseconds();
  }
  timer.mark("nano-end");
  timer.measure("Bun.nanoseconds", "nano-start", "nano-end");

  // Bun.SQLite (in-memory operations)
  try {
    const db = new Bun.SQLite(":memory:");
    db.run("CREATE TABLE bench (id INTEGER PRIMARY KEY, value TEXT)");
    const insert = db.prepare("INSERT INTO bench VALUES (?, ?)");
    const query = db.prepare("SELECT * FROM bench WHERE id = ?");

    timer.mark("sqlite-write-start");
    for (let i = 0; i < iterations; i++) {
      insert.run(i, `value-${i}`);
    }
    timer.mark("sqlite-write-end");
    timer.measure("SQLite write", "sqlite-write-start", "sqlite-write-end");

    timer.mark("sqlite-read-start");
    for (let i = 0; i < iterations; i++) {
      query.get(i);
    }
    timer.mark("sqlite-read-end");
    timer.measure("SQLite read", "sqlite-read-start", "sqlite-read-end");

    db.close();
  } catch (e) {
    console.log(`  ✗ SQLite benchmark: ${e}`);
  }

  for (const name of ["Bun.hash", "Bun.version", "Bun.nanoseconds", "SQLite write", "SQLite read"]) {
    const stats = timer.getStats(name);
    if (stats) {
      console.log(`  ${name.padEnd(25)}: ${stats.avg.toFixed(3)}ms avg, ${stats.total.toFixed(2)}ms total`);
    }
  }
}

// ─── Flamegraph Concept ─────────────────────────────────────────────────

function explainFlamegraph(): void {
  console.log("\n  ─── Flamegraph Analysis Concepts ───\n");

  console.log("  What is a flamegraph?");
  console.log("  A flamegraph is a visualization of profiled stack traces.");
  console.log("  Each rectangle is a function call; width = time spent.");
  console.log("");
  console.log("  ┌──────────────────────────────────────────────────────────┐");
  console.log("  │  Sampling Profiler Output (visualized as flamegraph)     │");
  console.log("  │                                                          │");
  console.log("  │  ████████████████ main███████████████████                 │");
  console.log("  │  ██████████ handleRequest████████████████                 │");
  console.log("  │  █████████████ queryDatabase██████████████████            │");
  console.log("  │  ████████ db.prepare███████████ ████ db.all████           │");
  console.log("  │  ████████ parseResults████████ █████ serialize████       │");
  console.log("  │                                                          │");
  console.log("  └──────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("  Reading a flamegraph:");
  console.log("  • X-axis: stack trace profiles (alphabetical, not time)");
  console.log("  • Y-axis: stack depth (top = deepest call)");
  console.log("  • Width: proportional to samples containing that function");
  console.log("  • Color: often random (some tools color by library/module)");
  console.log("");
  console.log("  Identifying hotspots:");
  console.log("  • Wide rectangles at the top = expensive leaf functions");
  console.log("  • Wide towers = deep call stacks with high self time");
  console.log("  • Flat wide shapes = many calls to different functions");

  console.log("\n  Sampling vs Instrumentation:");
  console.log("  • Sampling (statistical): snapshots call stack at intervals");
  console.log("    - Low overhead (~1-5%)");
  console.log("    - Suitable for production");
  console.log("    - Less accurate for rare events");
  console.log("  • Instrumentation (exact): record every function entry/exit");
  console.log("    - High overhead (~50-200%)");
  console.log("    - Development only");
  console.log("    - Exact call counts and timing");
}

// ─── Hotspot Detection ─────────────────────────────────────────────────

function demonstrateHotspotDetection(): void {
  console.log("\n  ─── Hotspot Detection Patterns ───\n");

  // Simulate a hotspot: nested loops
  console.log("  Simulating CPU hotspot (nested loops + regex)...");

  const startCpu = performance.now();

  // CPU-intensive operation: regex matching on large text
  const text = Array.from({ length: 500 }, () =>
    "The quick brown fox jumps over the lazy dog. " +
    "This is a sample text for regex matching benchmark. " +
    "Email: test@example.com, Phone: 123-456-7890. " +
    "URL: https://example.com/path/to/resource"
  ).join("\n");

  const patterns = [
    /\b\w{5,}\b/g,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /https?:\/\/[^\s]+/g,
    /\d{3}-\d{3}-\d{4}/g,
    /[A-Z][a-z]+/g,
  ];

  let matchCount = 0;
  for (let round = 0; round < 100; round++) {
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) matchCount += matches.length;
    }
  }

  const endCpu = performance.now();
  console.log(`  Regex matches found: ${matchCount}`);
  console.log(`  Time: ${(endCpu - startCpu).toFixed(2)}ms`);
  console.log("  (This is a hotspot candidate — regex in loops)");
}

// ─── Benchmark Comparison Table ─────────────────────────────────────────

function printComparisonTable(): void {
  console.log("\n  ─── Bun vs Node.js Performance Comparison (Reference) ───\n");

  const data = [
    { operation: "Cold start (empty script)", bun: "15ms", node: "85ms", ratio: "5.7x" },
    { operation: "JSON.stringify (100x)", bun: "0.8ms", node: "1.2ms", ratio: "1.5x" },
    { operation: "JSON.parse (100x)", bun: "0.6ms", node: "1.0ms", ratio: "1.7x" },
    { operation: "SHA-256 (10,000x)", bun: "45ms", node: "62ms", ratio: "1.4x" },
    { operation: "Array.map (10,000x)", bun: "12ms", node: "18ms", ratio: "1.5x" },
    { operation: "HTTP server (RPS)", bun: "85,000", node: "42,000", ratio: "2.0x" },
    { operation: "File read (100x 1MB)", bun: "230ms", node: "380ms", ratio: "1.7x" },
    { operation: "bun install (50 deps)", bun: "3.5s", node: "45s", ratio: "12.9x" },
  ];

  console.log("  Operation                    | Bun      | Node.js  | Ratio  ");
  console.log("  ───────────────────────────────────────────────────────────────");
  for (const row of data) {
    console.log(`  ${row.operation.padEnd(32)}| ${row.bun.padEnd(9)}| ${row.node.padEnd(9)}| ${row.ratio}`);
  }
  console.log("  ───────────────────────────────────────────────────────────────");
  console.log("  (Reference data — actual results vary by hardware and load)");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CPU Benchmark & Performance Analysis");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  CPUs: ${os.cpus().length} cores`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const iterations = 1000;

  // Run benchmarks
  benchmarkJSON(iterations);
  benchmarkCrypto(iterations);
  benchmarkArrays(iterations);
  benchmarkBunSpecific(Math.min(iterations, 100));

  // Flamegraph explanation
  explainFlamegraph();

  // Hotspot detection
  demonstrateHotspotDetection();

  // Comparison table
  printComparisonTable();

  // Performance tips
  console.log("\n  ─── CPU Optimization Tips ───\n");

  const tips = [
    "Use Bun.hash() instead of crypto.createHash() for non-cryptographic hashing",
    "Prefer Bun's built-in APIs (Bun.file(), Bun.write()) over fs module",
    "Use Bun.serve() instead of Express for maximum HTTP throughput",
    "Avoid regex in hot loops — precompile patterns outside loops",
    "Use Bun.SQLite prepared statements for database operations",
    "Enable --smol flag for memory-constrained environments",
    "Profile with bun --inspect and Chrome DevTools CPU profiler",
    "For CPU-bound tasks, consider splitting into multiple workers",
    "Use Bun's built-in bundler (bun build) instead of webpack/tsc",
    "Leverage Bun's Bun.FFI for calling optimized C libraries",
  ];

  for (let i = 0; i < tips.length; i++) {
    console.log(`  ${i + 1}. ${tips[i]}`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  CPU benchmark complete.");
  console.log("  For flamegraph: bun --inspect & Chrome DevTools Profiler tab.");
  console.log("═══════════════════════════════════════════════════════\n");
}

await main();
