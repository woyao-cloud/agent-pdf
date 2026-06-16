#!/usr/bin/env bun

/**
 * Chapter 20: 未来展望与 Web 标准
 * Example 03 - Edge Function Demo
 *
 * Demonstrates edge computing concepts with Bun:
 * - Request handling similar to Cloudflare Workers / Deno Deploy
 * - Web standard APIs for edge compatibility
 * - Geographically distributed function patterns
 * - Bun as edge runtime
 */

import * as os from "os";

// ─── Edge Function Simulator ────────────────────────────────────────────

interface EdgeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  ip: string;
  geo?: {
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface EdgeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type EdgeHandler = (request: EdgeRequest) => EdgeResponse | Promise<EdgeResponse>;

// ─── Edge Runtime Environment ───────────────────────────────────────────

class EdgeRuntime {
  private handlers: Map<string, EdgeHandler> = new Map();
  private kv: Map<string, string> = new Map();

  route(pattern: string, handler: EdgeHandler): void {
    this.handlers.set(pattern, handler);
  }

  async handle(request: EdgeRequest): Promise<EdgeResponse> {
    // Find matching handler
    for (const [pattern, handler] of this.handlers) {
      if (this.match(pattern, request.url)) {
        try {
          return await handler(request);
        } catch (e: any) {
          return {
            status: 500,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: e.message || "Internal Server Error" }),
          };
        }
      }
    }

    // 404
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Not Found" }),
    };
  }

  private match(pattern: string, url: string): boolean {
    // Simple pattern matching: /api/* matches /api/users, /api/notes, etc.
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return url.startsWith(prefix);
    }
    return url === pattern;
  }

  // Simple KV store (edge-compatible)
  kvGet(key: string): string | undefined {
    return this.kv.get(key);
  }

  kvSet(key: string, value: string): void {
    this.kv.set(key, value);
  }

  kvDelete(key: string): void {
    this.kv.delete(key);
  }

  kvList(): string[] {
    return [...this.kv.keys()];
  }

  // Cache API (edge-compatible)
  private cache = new Map<string, { data: string; expiry: number }>();

  cachePut(key: string, data: string, ttlMs: number = 60000): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  cacheGet(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }
}

// ─── Edge Functions ─────────────────────────────────────────────────────

// 1. API Gateway / Router
const apiGateway: EdgeHandler = async (req) => {
  const start = performance.now();

  const response: EdgeResponse = {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-edge-runtime": "bun",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      service: "bun-edge-gateway",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip,
        geo: req.geo,
      },
      processingTime: `${(performance.now() - start).toFixed(2)}ms`,
    }),
  };

  return response;
};

// 2. Image Optimization
const imageOptimizer: EdgeHandler = async (req) => {
  const url = new URL(req.url);
  const imageUrl = url.searchParams.get("url") || "";
  const width = parseInt(url.searchParams.get("w") || "800");
  const format = url.searchParams.get("fmt") || "webp";
  const quality = parseInt(url.searchParams.get("q") || "80");

  // In a real edge function, this would call an image optimization service
  // or use WASM-based image processing
  return {
    status: 200,
    headers: {
      "content-type": `image/${format}`,
      "cache-control": "public, max-age=31536000, immutable",
      "x-image-width": width.toString(),
      "x-image-quality": quality.toString(),
      "x-original-url": imageUrl,
    },
    body: JSON.stringify({
      message: "Image optimization edge function",
      note: "In production, this would serve optimized images",
      params: { url: imageUrl, width, format, quality },
    }),
  };
};

// 3. Geolocation-based Content
const geolocationHandler: EdgeHandler = async (req) => {
  const country = req.geo?.country || "US";
  const language = getLanguageForCountry(country);

  const content: Record<string, any> = {
    US: { greeting: "Hello!", currency: "USD", theme: "default" },
    CN: { greeting: "你好！", currency: "CNY", theme: "china" },
    JP: { greeting: "こんにちは！", currency: "JPY", theme: "japan" },
    DE: { greeting: "Hallo!", currency: "EUR", theme: "europe" },
    FR: { greeting: "Bonjour!", currency: "EUR", theme: "europe" },
    GB: { greeting: "Hello!", currency: "GBP", theme: "uk" },
    BR: { greeting: "Olá!", currency: "BRL", theme: "brazil" },
    IN: { greeting: "Namaste!", currency: "INR", theme: "india" },
  };

  const localized = content[country] || content["US"];

  return {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-country": country,
      "x-language": language,
      "cache-control": "public, max-age=3600",
    },
    body: JSON.stringify({
      localized,
      geo: req.geo,
      language,
      timestamp: new Date().toISOString(),
    }),
  };
};

function getLanguageForCountry(country: string): string {
  const map: Record<string, string> = {
    US: "en-US", CN: "zh-CN", JP: "ja-JP",
    DE: "de-DE", FR: "fr-FR", GB: "en-GB",
    BR: "pt-BR", IN: "hi-IN", KR: "ko-KR",
  };
  return map[country] || "en-US";
}

// 4. A/B Testing
const abTestHandler: EdgeHandler = async (req) => {
  const cookieHeader = req.headers["cookie"] || "";
  let variant = extractVariantFromCookie(cookieHeader, "ab_test");

  if (!variant) {
    // Random assignment based on IP hash
    variant = hashToVariant(req.ip, ["control", "variant-a", "variant-b"]);
  }

  return {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `ab_test=${variant}; Path=/; Max-Age=86400; SameSite=Lax`,
      "x-ab-variant": variant,
    },
    body: JSON.stringify({
      experiment: "homepage-redesign",
      variant,
      description: getVariantDescription(variant),
    }),
  };
};

function extractVariantFromCookie(cookie: string, name: string): string | null {
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

function hashToVariant(value: string, variants: string[]): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return variants[Math.abs(hash) % variants.length];
}

function getVariantDescription(variant: string): string {
  const descriptions: Record<string, string> = {
    "control": "Original homepage layout",
    "variant-a": "New hero section with video background",
    "variant-b": "Simplified navigation + larger CTAs",
  };
  return descriptions[variant] || "Unknown variant";
}

// 5. Rate Limiting
function createRateLimiter(windowMs: number = 60000, maxRequests: number = 100) {
  const store = new Map<string, { count: number; resetTime: number }>();

  return (req: EdgeRequest): { allowed: boolean; remaining: number; resetTime: number } => {
    const key = req.ip || "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;
    return {
      allowed: entry.count <= maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  };
}

// 6. Edge Cache
function createEdgeCache() {
  const cache = new Map<string, { data: string; etag: string; expires: number }>();

  return {
    get(key: string): { data: string; etag: string } | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expires) {
        cache.delete(key);
        return null;
      }
      return { data: entry.data, etag: entry.etag };
    },
    set(key: string, data: string, ttlMs: number = 60000): void {
      const etag = `"${Bun.hash(data).toString(36)}"`;
      cache.set(key, { data, etag, expires: Date.now() + ttlMs });
    },
    size: () => cache.size,
  };
}

// ─── Demo Runner ─────────────────────────────────────────────────────────

async function runEdgeDemo(): Promise<void> {
  console.log("\n  ─── Running Edge Function Demo ───\n");

  const runtime = new EdgeRuntime();

  // Register edge functions
  runtime.route("/api/*", apiGateway);
  runtime.route("/image", imageOptimizer);
  runtime.route("/geo", geolocationHandler);
  runtime.route("/ab-test", abTestHandler);

  // Rate limiter
  const rateLimiter = createRateLimiter(60000, 5);
  const edgeCache = createEdgeCache();

  // Test requests
  const testRequests: EdgeRequest[] = [
    {
      method: "GET",
      url: "/api/hello",
      headers: { "accept": "application/json" },
      ip: "203.0.113.1",
      geo: { country: "CN", region: "Beijing", city: "Beijing" },
    },
    {
      method: "GET",
      url: "/geo",
      headers: {},
      ip: "203.0.113.2",
      geo: { country: "JP", region: "Tokyo", city: "Tokyo" },
    },
    {
      method: "GET",
      url: "/geo",
      headers: {},
      ip: "203.0.113.3",
      geo: { country: "DE", region: "Berlin", city: "Berlin" },
    },
    {
      method: "GET",
      url: "/ab-test",
      headers: { "cookie": "ab_test=variant-a" },
      ip: "203.0.113.4",
    },
    {
      method: "GET",
      url: "/ab-test",
      headers: {},
      ip: "203.0.113.5",
    },
    {
      method: "GET",
      url: "/image?url=https://example.com/photo.jpg&w=400&fmt=webp",
      headers: {},
      ip: "203.0.113.6",
    },
  ];

  for (const req of testRequests) {
    console.log(`  → ${req.method} ${req.url}`);

    // Rate limit check
    const rl = rateLimiter(req);
    if (!rl.allowed) {
      console.log(`  ✗ Rate limited! Reset at ${new Date(rl.resetTime).toISOString()}`);
      continue;
    }

    // Cache check
    const cacheKey = `${req.method}:${req.url}`;
    const cached = edgeCache.get(cacheKey);
    if (cached) {
      console.log(`  ✓ (cached) ETag: ${cached.etag}`);
      console.log(`    Response: ${cached.data.substring(0, 100)}...`);
      continue;
    }

    // Process request
    const response = await runtime.handle(req);
    edgeCache.set(cacheKey, response.body, 5000);

    console.log(`  ← ${response.status}`);
    console.log(`    Headers: ${JSON.stringify(response.headers)}`);
    console.log(`    Body: ${response.body.substring(0, 150)}...`);
    console.log(`    Rate limit: ${rl.remaining} remaining`);
    console.log("");
  }
}

// ─── Edge Computing Concepts ────────────────────────────────────────────

function printEdgeConcepts(): void {
  console.log("\n  ─── Edge Computing Concepts ───\n");

  const concepts = [
    {
      concept: "Cold Start",
      description: "Edge functions start on-demand. Bun's fast startup (15ms) minimizes cold starts.",
      bunAdvantage: "Bun 启动速度比 Node.js 快 5.7 倍，冷启动时间极短",
    },
    {
      concept: "Geographic Distribution",
      description: "Edge functions run at CDN edge locations, near users.",
      bunAdvantage: "Bun 二进制小（~80MB），部署更快，支持更多边缘节点",
    },
    {
      concept: "Web Standard APIs",
      description: "Edge runtimes use Web APIs (fetch, Request, Response).",
      bunAdvantage: "Bun 原生支持所有 WinterCG 标准 API",
    },
    {
      concept: "Isolation",
      description: "Each request runs in an isolated context (V8 isolates or similar).",
      bunAdvantage: "Bun 的 JavaScriptCore 隔离机制确保安全",
    },
    {
      concept: "Stateless Design",
      description: "Edge functions should be stateless; use external KV/DB for state.",
      bunAdvantage: "Bun 内置 SQLite 可作为边缘本地存储",
    },
    {
      concept: "Limited Resources",
      description: "Edge functions have CPU/memory limits (e.g., 128MB, 10ms CPU).",
      bunAdvantage: "Bun 内存占用小（idle ~28MB），适合资源受限环境",
    },
  ];

  for (const c of concepts) {
    console.log(`  ${c.concept}`);
    console.log(`  ${c.description}`);
    console.log(`  → ${c.bunAdvantage}`);
    console.log("");
  }
}

// ─── Edge Platform Comparison ──────────────────────────────────────────

function printPlatformComparison(): void {
  console.log("\n  ─── Edge Platform Comparison ───\n");

  const platforms = [
    { name: "Bun", startup: "15ms", memory: "28MB", regions: "N/A (self-host)", limits: "无硬限制", api: "Web + Node.js" },
    { name: "Cloudflare Workers", startup: "5ms", memory: "128MB", regions: "300+", limits: "10ms CPU", api: "Web + CF特有" },
    { name: "Deno Deploy", startup: "10ms", memory: "256MB", regions: "30+", limits: "50ms CPU", api: "Web + Deno特有" },
    { name: "Vercel Edge", startup: "50ms", memory: "128MB", regions: "18", limits: "50ms CPU", api: "Web + Vercel特有" },
    { name: "AWS Lambda@Edge", startup: "50ms+", memory: "128MB-10GB", regions: "13+", limits: "5s", api: "Node.js + AWS" },
    { name: "Fastly Compute@Edge", startup: "5ms", memory: "64MB", regions: "150+", limits: "10ms", api: "WASM" },
  ];

  console.log("  Platform            | Startup | Memory  | Regions | Runtime API");
  console.log("  ───────────────────────────────────────────────────────────────────");
  for (const p of platforms) {
    console.log(`  ${p.name.padEnd(21)}| ${p.startup.padEnd(8)}| ${p.memory.padEnd(8)}| ${p.regions.padEnd(8)}| ${p.api}`);
  }
  console.log("  ───────────────────────────────────────────────────────────────────");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Edge Computing with Bun");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("  This demo simulates edge function patterns using Bun.");
  console.log("  Bun's Web standard API support makes it ideal for edge computing.\n");

  // Run edge function demo
  await runEdgeDemo();

  // Print concepts
  printEdgeConcepts();

  // Platform comparison
  printPlatformComparison();

  // Bun as edge runtime
  console.log("\n  ─── Bun as Edge Runtime ───\n");

  console.log("  Why Bun is well-suited for edge computing:");
  console.log("  1. Fast startup (15ms) — minimal cold start overhead");
  console.log("  2. Small binary (~80MB) — faster deployment");
  console.log("  3. Web standard APIs — fetch, Request, Response, WebSocket");
  console.log("  4. TypeScript native — no compilation step needed");
  console.log("  5. Bun.serve() — high-performance HTTP server");
  console.log("  6. Bun.SQLite — edge-local data storage");
  console.log("  7. Bun.hash — fast hashing for caching/ETags");
  console.log("  8. WinterCG compliance — portable across runtimes");
  console.log("");
  console.log("  Deployment options:");
  console.log("  • Self-hosted: Docker + oven/bun image at edge locations");
  console.log("  • Fly.io: Deploy Bun apps globally with fly launch");
  console.log("  • Railway: One-click Bun deployment");
  console.log("  • Render: Bun native support");
  console.log("  • Custom: Any cloud with Docker support");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Edge function demo complete.");
  console.log("  See Chapter 20 README for edge computing with Bun.");
  console.log("═══════════════════════════════════════════════════════\n");
}

await main();
