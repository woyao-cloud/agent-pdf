#!/usr/bin/env bun

/**
 * Chapter 20: 未来展望与 Web 标准
 * Example 01 - WinterCG Compatibility Check
 *
 * Checks Bun's compliance with WinterCG (Web-interoperable Runtimes
 * Community Group) minimum common API.
 */

import * as os from "os";

// ─── WinterCG Minimum Common API ────────────────────────────────────────

interface WinterCGCheck {
  api: string;
  category: string;
  available: boolean;
  notes: string;
}

function checkWinterCGCompliance(): WinterCGCheck[] {
  const checks: WinterCGCheck[] = [];

  // ─── Globals ───────────────────────────────────────────────────────
  checks.push({
    api: "fetch",
    category: "HTTP",
    available: typeof fetch !== "undefined",
    notes: "Web标准 fetch API",
  });
  checks.push({
    api: "Request",
    category: "HTTP",
    available: typeof Request !== "undefined",
    notes: "Web标准 Request",
  });
  checks.push({
    api: "Response",
    category: "HTTP",
    available: typeof Response !== "undefined",
    notes: "Web标准 Response",
  });
  checks.push({
    api: "Headers",
    category: "HTTP",
    available: typeof Headers !== "undefined",
    notes: "Web标准 Headers",
  });
  checks.push({
    api: "URL",
    category: "URL",
    available: typeof URL !== "undefined",
    notes: "Web标准 URL",
  });
  checks.push({
    api: "URLSearchParams",
    category: "URL",
    available: typeof URLSearchParams !== "undefined",
    notes: "Web标准 URLSearchParams",
  });
  checks.push({
    api: "Blob",
    category: "Binary",
    available: typeof Blob !== "undefined",
    notes: "Web标准 Blob",
  });
  checks.push({
    api: "File",
    category: "Binary",
    available: typeof File !== "undefined",
    notes: "Web标准 File",
  });
  checks.push({
    api: "ArrayBuffer",
    category: "Binary",
    available: typeof ArrayBuffer !== "undefined",
    notes: "Web标准 ArrayBuffer",
  });
  checks.push({
    api: "Uint8Array",
    category: "Binary",
    available: typeof Uint8Array !== "undefined",
    notes: "Web标准 TypedArray",
  });
  checks.push({
    api: "TextEncoder",
    category: "Encoding",
    available: typeof TextEncoder !== "undefined",
    notes: "Web标准 TextEncoder",
  });
  checks.push({
    api: "TextDecoder",
    category: "Encoding",
    available: typeof TextDecoder !== "undefined",
    notes: "Web标准 TextDecoder",
  });
  checks.push({
    api: "ReadableStream",
    category: "Streams",
    available: typeof ReadableStream !== "undefined",
    notes: "Web标准 Streams",
  });
  checks.push({
    api: "WritableStream",
    category: "Streams",
    available: typeof WritableStream !== "undefined",
    notes: "Web标准 WritableStream",
  });
  checks.push({
    api: "TransformStream",
    category: "Streams",
    available: typeof TransformStream !== "undefined",
    notes: "Web标准 TransformStream",
  });
  checks.push({
    api: "WebSocket",
    category: "Network",
    available: typeof WebSocket !== "undefined",
    notes: "Web标准 WebSocket",
  });
  checks.push({
    api: "MessageChannel",
    category: "Messaging",
    available: typeof MessageChannel !== "undefined",
    notes: "Web标准 MessageChannel",
  });
  checks.push({
    api: "MessagePort",
    category: "Messaging",
    available: typeof MessagePort !== "undefined",
    notes: "Web标准 MessagePort",
  });
  checks.push({
    api: "AbortController",
    category: "Async",
    available: typeof AbortController !== "undefined",
    notes: "Web标准 AbortController",
  });
  checks.push({
    api: "AbortSignal",
    category: "Async",
    available: typeof AbortSignal !== "undefined",
    notes: "Web标准 AbortSignal",
  });
  checks.push({
    api: "setTimeout",
    category: "Timers",
    available: typeof setTimeout !== "undefined",
    notes: "Web标准 Timers",
  });
  checks.push({
    api: "clearTimeout",
    category: "Timers",
    available: typeof clearTimeout !== "undefined",
    notes: "Web标准 clearTimeout",
  });
  checks.push({
    api: "setInterval",
    category: "Timers",
    available: typeof setInterval !== "undefined",
    notes: "Web标准 setInterval",
  });
  checks.push({
    api: "clearInterval",
    category: "Timers",
    available: typeof clearInterval !== "undefined",
    notes: "Web标准 clearInterval",
  });
  checks.push({
    api: "queueMicrotask",
    category: "Async",
    available: typeof queueMicrotask !== "undefined",
    notes: "Web标准 queueMicrotask",
  });
  checks.push({
    api: "structuredClone",
    category: "Binary",
    available: typeof structuredClone !== "undefined",
    notes: "Web标准 structuredClone",
  });
  checks.push({
    api: "console",
    category: "Debug",
    available: typeof console !== "undefined",
    notes: "Web标准 Console",
  });
  checks.push({
    api: "atob",
    category: "Encoding",
    available: typeof atob !== "undefined",
    notes: "Web标准 Base64 decode",
  });
  checks.push({
    api: "btoa",
    category: "Encoding",
    available: typeof btoa !== "undefined",
    notes: "Web标准 Base64 encode",
  });
  checks.push({
    api: "performance",
    category: "Timing",
    available: typeof performance !== "undefined",
    notes: "Web标准 Performance API",
  });
  checks.push({
    api: "crypto.subtle",
    category: "Crypto",
    available: typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined",
    notes: "Web标准 Web Crypto API",
  });
  checks.push({
    api: "crypto.randomUUID",
    category: "Crypto",
    available: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function",
    notes: "Web标准 crypto.randomUUID",
  });
  checks.push({
    api: "navigator.sendBeacon",
    category: "Network",
    available: typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function",
    notes: "Web标准 Beacon (通常不需要在服务端)",
  });

  // ─── Bun-specific extras ───────────────────────────────────────────
  checks.push({
    api: "Bun",
    category: "Bun Specific",
    available: typeof Bun !== "undefined",
    notes: "Bun 运行时全局对象",
  });
  checks.push({
    api: "Bun.file",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.file === "function",
    notes: "Bun 文件 API",
  });
  checks.push({
    api: "Bun.write",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.write === "function",
    notes: "Bun 写入 API",
  });
  checks.push({
    api: "Bun.serve",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.serve === "function",
    notes: "Bun HTTP 服务器",
  });
  checks.push({
    api: "Bun.SQLite",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.SQLite === "function",
    notes: "Bun 内置 SQLite",
  });
  checks.push({
    api: "Bun.password",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.password !== "undefined",
    notes: "Bun 密码哈希",
  });
  checks.push({
    api: "Bun.hash",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.hash === "function",
    notes: "Bun 快速哈希",
  });
  checks.push({
    api: "Bun.FFI",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.FFI !== "undefined",
    notes: "Bun 外部函数接口",
  });
  checks.push({
    api: "Bun.env",
    category: "Bun Specific",
    available: typeof Bun !== "undefined" && typeof Bun.env !== "undefined",
    notes: "Bun 环境变量",
  });

  // ─── Node.js compatibility ─────────────────────────────────────────
  checks.push({
    api: "Buffer",
    category: "Node.js Compat",
    available: typeof Buffer !== "undefined",
    notes: "Node.js Buffer",
  });
  checks.push({
    api: "process",
    category: "Node.js Compat",
    available: typeof process !== "undefined",
    notes: "Node.js process",
  });
  checks.push({
    api: "global",
    category: "Node.js Compat",
    available: typeof global !== "undefined",
    notes: "Node.js global",
  });
  checks.push({
    api: "__dirname",
    category: "Node.js Compat",
    available: typeof __dirname !== "undefined",
    notes: "Node.js __dirname",
  });
  checks.push({
    api: "__filename",
    category: "Node.js Compat",
    available: typeof __filename !== "undefined",
    notes: "Node.js __filename",
  });
  checks.push({
    api: "require",
    category: "Node.js Compat",
    available: typeof require !== "undefined",
    notes: "Node.js require (CJS)",
  });

  return checks;
}

// ─── Runtime Comparison Table ───────────────────────────────────────────

function printRuntimeComparison(): void {
  console.log("\n  ─── Runtime API Comparison ───\n");

  const comparison = [
    { api: "fetch", bun: "✅", node: "✅ (18+)", deno: "✅", cloudflare: "✅" },
    { api: "WebSocket", bun: "✅", node: "✅ (21+)", deno: "✅", cloudflare: "✅" },
    { api: "ReadableStream", bun: "✅", node: "✅ (16+)", deno: "✅", cloudflare: "✅" },
    { api: "TextEncoder/Decoder", bun: "✅", node: "✅ (11+)", deno: "✅", cloudflare: "✅" },
    { api: "crypto.subtle", bun: "✅", node: "✅ (15+)", deno: "✅", cloudflare: "✅" },
    { api: "URLPattern", bun: "✅", node: "⚠ (exp.)", deno: "✅", cloudflare: "✅" },
    { api: "EventSource", bun: "⚠", node: "⚠ (exp.)", deno: "✅", cloudflare: "❌" },
    { api: "navigator", bun: "✅", node: "❌", deno: "✅", cloudflare: "✅" },
    { api: "WebGPU", bun: "❌", node: "⚠ (exp.)", deno: "✅", cloudflare: "❌" },
    { api: "KV Storage", bun: "❌", node: "❌", deno: "✅", cloudflare: "✅" },
    { api: "Queue API", bun: "❌", node: "❌", deno: "✅", cloudflare: "✅" },
    { api: "Durable Objects", bun: "❌", node: "❌", deno: "❌", cloudflare: "✅" },
    { api: "Node.js CJS compat", bun: "✅", node: "✅", deno: "⚠", cloudflare: "⚠" },
    { api: "TypeScript native", bun: "✅", node: "❌", deno: "✅", cloudflare: "⚠" },
  ];

  console.log("  API                 | Bun   | Node  | Deno  | CF    ");
  console.log("  ────────────────────────────────────────────────────────");
  for (const row of comparison) {
    console.log(`  ${row.api.padEnd(21)}| ${row.bun.padEnd(6)}| ${row.node.padEnd(6)}| ${row.deno.padEnd(6)}| ${row.cloudflare}`);
  }
  console.log("  ────────────────────────────────────────────────────────");
  console.log("  ✅ = Native    ⚠ = Partial/Experimental    ❌ = Not available");
}

// ─── WinterCG Standards ─────────────────────────────────────────────────

function printWinterCGInfo(): void {
  console.log("\n  ─── WinterCG (Web-interoperable Runtimes Community Group) ───\n");

  console.log("  Mission: Define common API standards for all JavaScript runtimes.");
  console.log("");
  console.log("  Members:");
  console.log("  • Bun (Oven) — 2023年加入");
  console.log("  • Deno (Deno Land) — 创始成员");
  console.log("  • Cloudflare Workers — 创始成员");
  console.log("  • Vercel Edge Functions — 2022年加入");
  console.log("  • Node.js (OpenJS Foundation) — 观察员");
  console.log("  • Google (Chrome V8) — 参与");
  console.log("  • Mozilla (SpiderMonkey) — 参与");
  console.log("  • Apple (JavaScriptCore) — 参与");
  console.log("");
  console.log("  Key Standards:");
  console.log("  • fetch() — 统一 HTTP 请求 API");
  console.log("  • Web Streams API — ReadableStream, WritableStream");
  console.log("  • Web Crypto API — crypto.subtle");
  console.log("  • URL / URLPattern — 统一 URL 处理");
  console.log("  • Encoding — TextEncoder, TextDecoder");
  console.log("  • WebSocket — 客户端 WebSocket");
  console.log("  • AbortController — 异步操作取消");
  console.log("  • Console — 统一控制台 API");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  WinterCG Compatibility Check — Bun Runtime");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Run WinterCG compliance check
  const checks = checkWinterCGCompliance();

  // Group by category
  const categories = [...new Set(checks.map((c) => c.category))];
  let total = 0;
  let passed = 0;

  for (const category of categories) {
    console.log(`  ─── ${category} ───\n`);
    const categoryChecks = checks.filter((c) => c.category === category);
    for (const check of categoryChecks) {
      const icon = check.available ? "✓" : "✗";
      console.log(`  ${icon} ${check.api.padEnd(25)} ${check.notes}`);
      total++;
      if (check.available) passed++;
    }
    console.log("");
  }

  // Summary
  const passPercent = (passed / total * 100).toFixed(1);
  console.log("  ─── Summary ───\n");
  console.log(`  Total APIs checked: ${total}`);
  console.log(`  Available:          ${passed} (${passPercent}%)`);
  console.log(`  Not available:      ${total - passed} (${(100 - parseFloat(passPercent)).toFixed(1)}%)`);
  console.log("");

  // Show what's missing
  const missing = checks.filter((c) => !c.available);
  if (missing.length > 0) {
    console.log("  Missing APIs:");
    for (const m of missing) {
      console.log(`  ✗ ${m.api} (${m.category}) — ${m.notes}`);
    }
    console.log("");
  }

  // Runtime comparison
  printRuntimeComparison();

  // WinterCG info
  printWinterCGInfo();

  // Future outlook
  console.log("\n  ─── WinterCG Roadmap ───\n");
  console.log("  Priority areas for standardization:");
  console.log("  1. Runtime file system API (WinterCG FS proposal)");
  console.log("  2. Server-side WebSocket (beyond client-side)");
  console.log("  3. Cron/scheduled tasks API");
  console.log("  4. Key-value storage API");
  console.log("  5. Environment variables standard");
  console.log("  6. Logging and telemetry API");
  console.log("  7. HTTP server API (request/response handling)");
  console.log("");
  console.log("  Bun's position:");
  console.log("  • Leading implementer of Web standard APIs");
  console.log("  • Active participant in WinterCG discussions");
  console.log("  • Strong Node.js compatibility as pragmatic bridge");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  WinterCG check complete.");
  console.log("  See Chapter 20 README for detailed analysis.");
  console.log("═══════════════════════════════════════════════════════\n");
}

await main();
