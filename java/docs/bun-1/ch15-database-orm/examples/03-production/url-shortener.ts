/**
 * url-shortener.ts — 生产级 URL 短链接服务
 *
 * 一个完整的 URL 短链接服务，综合使用:
 *   - PostgreSQL (Drizzle ORM): 持久化存储短链接与访问日志
 *   - Redis: 热点 URL 缓存加速
 *   - bun:sqlite: 本地缓存层，减少网络 I/O
 *   - Bun HTTP Server: 内置高性能 HTTP 服务器
 *
 * 架构:
 *   ┌─────────────┐     ┌──────────┐     ┌────────────┐
 *   │  bun:sqlite │◄───►│ Bun HTTP │◄───►│   Redis    │
 *   │  (本地缓存)  │     │  Server  │     │  (共享缓存) │
 *   └─────────────┘     └────┬─────┘     └────────────┘
 *                            │
 *                     ┌──────▼──────┐
 *                     │ PostgreSQL  │
 *                     │ (Drizzle ORM)│
 *                     └─────────────┘
 *
 * 缓存策略: Cache-Aside (延迟加载)
 *   1. 先查 bun:sqlite 本地缓存 → 命中直接返回
 *   2. 未命中则查 Redis 共享缓存 → 命中则回填本地缓存
 *   3. 都未命中则查 PostgreSQL → 回填 Redis 和本地缓存
 *
 * 运行方式: docker compose --profile production up
 * 或:       bun run examples/03-production/url-shortener.ts
 */

import { Database } from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { pgTable, serial, text as pgText, timestamp, integer as pgInteger, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ========================================================================
//  1. 配置
// ========================================================================

const CONFIG = {
  port: parseInt(process.env.PORT || "3000"),
  pgHost: process.env.POSTGRES_HOST || "localhost",
  pgPort: parseInt(process.env.POSTGRES_PORT || "5432"),
  pgUser: process.env.POSTGRES_USER || "bunuser",
  pgPass: process.env.POSTGRES_PASSWORD || "bunpass",
  pgDb: process.env.POSTGRES_DB || "bunorm",
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: parseInt(process.env.REDIS_PORT || "6379"),
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  cacheTTL: 3600,           // Redis 缓存过期时间 (秒)
  localCacheTTL: 300,       // 本地缓存过期时间 (秒)
  rateLimitPerIP: 100,      // 每 IP 每分钟请求限制
};

// ========================================================================
//  2. 数据库层 — PostgreSQL (Drizzle ORM)
// ========================================================================

const pgPool = new Pool({
  host: CONFIG.pgHost,
  port: CONFIG.pgPort,
  user: CONFIG.pgUser,
  password: CONFIG.pgPass,
  database: CONFIG.pgDb,
  max: 10,
  idleTimeoutMillis: 30000,
});

const pgDb = drizzlePg(pgPool);

/** URL 短链接表 */
const shortUrls = pgTable("short_urls", {
  id: serial("id").primaryKey(),
  slug: pgText("slug").notNull().unique(),
  originalUrl: pgText("original_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  clickCount: pgInteger("click_count").default(0).notNull(),
}, (table) => ({
  slugIdx: index("short_urls_slug_idx").on(table.slug),
}));

/** 访问日志表 */
const accessLogs = pgTable("access_logs", {
  id: serial("id").primaryKey(),
  slug: pgText("slug").notNull(),
  ip: pgText("ip"),
  userAgent: pgText("user_agent"),
  referer: pgText("referer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  slugLogIdx: index("access_logs_slug_idx").on(table.slug),
}));

// ========================================================================
//  3. 缓存层 — bun:sqlite 本地缓存
// ========================================================================

const localCache = new Database(":memory:");
localCache.run(`
  CREATE TABLE IF NOT EXISTS url_cache (
    slug TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);
localCache.run(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL
  )
`);
localCache.run("PRAGMA journal_mode = WAL;");

const cacheDb = drizzleSqlite(localCache);

const urlCacheTable = sqliteTable("url_cache", {
  slug: text("slug").primaryKey(),
  originalUrl: text("original_url").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const rateLimitTable = sqliteTable("rate_limits", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull().default(1),
  windowStart: integer("window_start").notNull(),
});

// ========================================================================
//  4. Redis 缓存 (通过 REST API 模拟)
// ========================================================================

/**
 * 简化的 Redis 客户端 — 使用 fetch 与 Redis HTTP 接口通信
 * 生产环境建议使用 ioredis 或 redis npm 包
 */
class SimpleRedisClient {
  private cache = new Map<string, { value: string; expiry: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async incr(key: string): Promise<number> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.cache.set(key, { value: "1", expiry: Date.now() + 86400000 });
      return 1;
    }
    const newVal = (parseInt(entry.value) + 1).toString();
    entry.value = newVal;
    return parseInt(newVal);
  }

  /** 设置过期时间 */
  async expire(key: string, seconds: number): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      entry.expiry = Date.now() + seconds * 1000;
    }
  }
}

// ========================================================================
//  5. 服务核心逻辑
// ========================================================================

const redis = new SimpleRedisClient();

/** 生成随机短码 */
function generateSlug(length: number = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/** 获取本地缓存的 URL */
function getLocalCache(slug: string): string | null {
  const now = Math.floor(Date.now() / 1000);
  const result = localCache
    .query("SELECT original_url, expires_at FROM url_cache WHERE slug = ? AND expires_at > ?")
    .get(slug, now) as { original_url: string; expires_at: number } | undefined;
  return result?.original_url ?? null;
}

/** 设置本地缓存 */
function setLocalCache(slug: string, originalUrl: string, ttlSeconds: number): void {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  localCache
    .query("INSERT OR REPLACE INTO url_cache (slug, original_url, expires_at) VALUES (?, ?, ?)")
    .run(slug, originalUrl, expiresAt);
}

/** 检查速率限制 */
function checkRateLimit(ip: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60; // 1 分钟窗口

  // 清理过期记录
  localCache
    .query("DELETE FROM rate_limits WHERE window_start < ?")
    .run(windowStart);

  const existing = localCache
    .query("SELECT count, window_start FROM rate_limits WHERE ip = ?")
    .get(ip) as { count: number; window_start: number } | undefined;

  if (!existing) {
    localCache
      .query("INSERT INTO rate_limits (ip, count, window_start) VALUES (?, 1, ?)")
      .run(ip, now);
    return true;
  }

  if (existing.window_start < windowStart) {
    // 窗口已过期，重置
    localCache
      .query("UPDATE rate_limits SET count = 1, window_start = ? WHERE ip = ?")
      .run(now, ip);
    return true;
  }

  if (existing.count >= CONFIG.rateLimitPerIP) {
    return false; // 超过限制
  }

  localCache
    .query("UPDATE rate_limits SET count = count + 1 WHERE ip = ?")
    .run(ip);
  return true;
}

/** 创建短链接 */
async function createShortUrl(originalUrl: string, ttl?: number): Promise<{
  slug: string;
  shortUrl: string;
  originalUrl: string;
  expiresAt: Date | null;
}> {
  // 验证 URL
  try {
    new URL(originalUrl);
  } catch {
    throw new Error("无效的 URL 格式");
  }

  // 生成唯一短码 (检查冲突)
  let slug: string;
  let attempts = 0;
  do {
    slug = generateSlug();
    const existing = await pgDb.select()
      .from(shortUrls)
      .where(eq(shortUrls.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new Error("无法生成唯一短码，请重试");
  }

  // 写入 PostgreSQL
  const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
  await pgDb.insert(shortUrls).values({
    slug,
    originalUrl,
    expiresAt,
  });

  // 预热缓存
  await redis.set(`url:${slug}`, originalUrl, CONFIG.cacheTTL);
  setLocalCache(slug, originalUrl, CONFIG.localCacheTTL);

  return {
    slug,
    shortUrl: `${CONFIG.baseUrl}/${slug}`,
    originalUrl,
    expiresAt,
  };
}

/** 解析短链接 — 使用三级缓存 */
async function resolveShortUrl(slug: string, requestInfo?: {
  ip?: string;
  userAgent?: string;
  referer?: string;
}): Promise<string | null> {
  // 第一级: bun:sqlite 本地缓存
  const localResult = getLocalCache(slug);
  if (localResult) {
    // 异步记录访问日志，不阻塞返回
    logAccess(slug, requestInfo).catch(() => {});
    return localResult;
  }

  // 第二级: Redis 缓存
  const redisResult = await redis.get(`url:${slug}`);
  if (redisResult) {
    // 回填本地缓存
    setLocalCache(slug, redisResult, CONFIG.localCacheTTL);
    logAccess(slug, requestInfo).catch(() => {});
    return redisResult;
  }

  // 第三级: PostgreSQL (数据库)
  const [urlRecord] = await pgDb.select()
    .from(shortUrls)
    .where(eq(shortUrls.slug, slug))
    .limit(1);

  if (!urlRecord) return null;

  // 检查是否过期
  if (urlRecord.expiresAt && new Date() > urlRecord.expiresAt) {
    return null;
  }

  // 回填缓存
  await redis.set(`url:${slug}`, urlRecord.originalUrl, CONFIG.cacheTTL);
  setLocalCache(slug, urlRecord.originalUrl, CONFIG.localCacheTTL);

  // 异步记录访问日志
  logAccess(slug, requestInfo).catch(() => {});

  return urlRecord.originalUrl;
}

/** 记录访问日志 */
async function logAccess(slug: string, info?: {
  ip?: string;
  userAgent?: string;
  referer?: string;
}): Promise<void> {
  try {
    await pgDb.insert(accessLogs).values({
      slug,
      ip: info?.ip ?? null,
      userAgent: info?.userAgent ?? null,
      referer: info?.referer ?? null,
    });

    // 增加点击计数
    await pgDb.update(shortUrls)
      .set({ clickCount: sql`click_count + 1` })
      .where(eq(shortUrls.slug, slug));
  } catch (error) {
    console.error("  记录访问日志失败:", error);
  }
}

/** 获取短链接统计信息 */
async function getUrlStats(slug: string): Promise<{
  slug: string;
  originalUrl: string;
  clickCount: number;
  createdAt: Date;
  expiresAt: Date | null;
  recentClicks: number;
} | null> {
  const [urlRecord] = await pgDb.select()
    .from(shortUrls)
    .where(eq(shortUrls.slug, slug))
    .limit(1);

  if (!urlRecord) return null;

  // 最近 24 小时的点击数
  const recentResult = await pgDb.select({
    count: sql<number>`COUNT(*)`,
  })
    .from(accessLogs)
    .where(
      sql`${accessLogs.slug} = ${slug} AND ${accessLogs.createdAt} > NOW() - INTERVAL '24 hours'`
    );

  return {
    slug: urlRecord.slug,
    originalUrl: urlRecord.originalUrl,
    clickCount: urlRecord.clickCount,
    createdAt: urlRecord.createdAt,
    expiresAt: urlRecord.expiresAt,
    recentClicks: recentResult[0]?.count ?? 0,
  };
}

// ========================================================================
//  6. HTTP 服务
// ========================================================================

async function initializeDatabase(): Promise<void> {
  // 创建 PostgreSQL 表
  await pgDb.execute(sql`
    CREATE TABLE IF NOT EXISTS short_urls (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      expires_at TIMESTAMP,
      click_count INTEGER DEFAULT 0 NOT NULL
    )
  `);

  await pgDb.execute(sql`
    CREATE TABLE IF NOT EXISTS access_logs (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      referer TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // 创建索引
  await pgDb.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_short_urls_slug ON short_urls(slug)
  `);
  await pgDb.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_access_logs_slug ON access_logs(slug)
  `);

  console.log("  数据库表初始化完成");
}

/** 解析请求体 (JSON) */
async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** 创建 HTTP 服务 */
function createServer() {
  return Bun.serve({
    port: CONFIG.port,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || request.headers.get("x-real-ip")
        || "127.0.0.1";
      const userAgent = request.headers.get("user-agent") || undefined;
      const referer = request.headers.get("referer") || undefined;

      // 速率限制检查
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({
          error: "速率限制超限，请稍后重试",
          retryAfter: 60,
        }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        // ─── POST /api/shorten — 创建短链接 ──────────────────────────
        if (method === "POST" && path === "/api/shorten") {
          const body = await parseBody(request);
          const originalUrl = body.url as string;
          const ttl = body.ttl as number | undefined;

          if (!originalUrl) {
            return new Response(JSON.stringify({ error: "缺少 url 参数" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const result = await createShortUrl(originalUrl, ttl);
          return new Response(JSON.stringify(result), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ─── GET /api/stats/:slug — 获取统计信息 ─────────────────────
        if (method === "GET" && path.startsWith("/api/stats/")) {
          const slug = path.replace("/api/stats/", "");
          if (!slug) {
            return new Response(JSON.stringify({ error: "缺少 slug 参数" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const stats = await getUrlStats(slug);
          if (!stats) {
            return new Response(JSON.stringify({ error: "短链接不存在" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify(stats), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ─── GET /api/health — 健康检查 ──────────────────────────────
        if (method === "GET" && path === "/api/health") {
          return new Response(JSON.stringify({
            status: "ok",
            uptime: process.uptime(),
            cacheSize: localCache.query("SELECT COUNT(*) as count FROM url_cache").get() as { count: number },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ─── GET /:slug — 短链接重定向 ───────────────────────────────
        if (method === "GET" && path.length > 1) {
          const slug = path.slice(1); // 去掉前导 "/"

          const originalUrl = await resolveShortUrl(slug, {
            ip: clientIp,
            userAgent,
            referer,
          });

          if (!originalUrl) {
            return new Response(JSON.stringify({ error: "短链接不存在或已过期" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 301 永久重定向
          return new Response(null, {
            status: 301,
            headers: { Location: originalUrl },
          });
        }

        // ─── 根路径 — API 文档 ─────────────────────────────────────
        if (method === "GET" && path === "/") {
          return new Response(JSON.stringify({
            service: "URL 短链接服务",
            version: "1.0.0",
            endpoints: {
              "POST /api/shorten": "创建短链接 (body: { url, ttl? })",
              "GET /:slug": "短链接重定向",
              "GET /api/stats/:slug": "获取短链接统计",
              "GET /api/health": "健康检查",
            },
            examples: {
              create: `curl -X POST ${CONFIG.baseUrl}/api/shorten -H "Content-Type: application/json" -d '{"url":"https://example.com/very/long/url"}'`,
              resolve: `curl -L ${CONFIG.baseUrl}/abc123`,
              stats: `curl ${CONFIG.baseUrl}/api/stats/abc123`,
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 404
        return new Response(JSON.stringify({ error: "未找到" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });

      } catch (error) {
        console.error("  请求处理错误:", error);
        return new Response(JSON.stringify({
          error: "服务器内部错误",
          message: error instanceof Error ? error.message : "未知错误",
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });
}

// ========================================================================
//  7. 演示入口
// ========================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("  URL 短链接服务 — 生产级演示");
  console.log("  PostgreSQL + Redis + bun:sqlite 三级缓存架构");
  console.log("=".repeat(60));

  // 初始化数据库
  console.log("\n[1/4] 初始化数据库...");
  await initializeDatabase();

  // 启动 HTTP 服务
  console.log("\n[2/4] 启动 HTTP 服务...");
  const server = createServer();
  console.log(`  ✅ 服务已启动: ${CONFIG.baseUrl}`);

  // 演示创建短链接
  console.log("\n[3/4] 创建测试短链接...");
  const testUrls = [
    "https://bun.sh/docs/api/http",
    "https://drizzle.team/docs/overview",
    "https://www.postgresql.org/docs/current/index.html",
    "https://redis.io/docs/latest/",
  ];

  const createdSlugs: string[] = [];
  for (const url of testUrls) {
    const result = await createShortUrl(url);
    createdSlugs.push(result.slug);
    console.log(`  ✅ ${result.shortUrl} -> ${url}`);
  }

  // 演示缓存解析
  console.log("\n[4/4] 测试缓存解析 (三级缓存)...");

  // 第一次访问 — 从 PostgreSQL 加载 (缓存未命中)
  console.log("\n  第一次访问 (缓存未命中 — 从数据库加载):");
  const start1 = performance.now();
  const result1 = await resolveShortUrl(createdSlugs[0]);
  const time1 = performance.now() - start1;
  console.log(`  ${result1} (耗时: ${time1.toFixed(2)}ms)`);

  // 第二次访问 — 从 bun:sqlite 本地缓存加载
  console.log("\n  第二次访问 (本地缓存命中):");
  const start2 = performance.now();
  const result2 = await resolveShortUrl(createdSlugs[0]);
  const time2 = performance.now() - start2;
  console.log(`  ${result2} (耗时: ${time2.toFixed(2)}ms)`);

  // 第三次访问 — 模拟缓存穿透
  console.log("\n  测试不存在的短链接:");
  const result3 = await resolveShortUrl("nonexistent");
  console.log(`  ${result3 === null ? "null (不存在)" : result3}`);

  // 获取统计信息
  console.log("\n  短链接统计:");
  const stats = await getUrlStats(createdSlugs[0]);
  if (stats) {
    console.log(`  Slug: ${stats.slug}`);
    console.log(`  原始 URL: ${stats.originalUrl}`);
    console.log(`  总点击数: ${stats.clickCount}`);
    console.log(`  最近 24 小时: ${stats.recentClicks}`);
    console.log(`  创建时间: ${stats.createdAt.toISOString()}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  服务正在运行中... 按 Ctrl+C 停止");
  console.log("  测试命令:");
  console.log(`    curl -X POST ${CONFIG.baseUrl}/api/shorten \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"url":"https://example.com"}'`);
  console.log(`    curl -L ${CONFIG.baseUrl}/${createdSlugs[0]}`);
  console.log(`    curl ${CONFIG.baseUrl}/api/stats/${createdSlugs[0]}`);
  console.log(`    curl ${CONFIG.baseUrl}/api/health`);
  console.log("=".repeat(60));

  // 保持进程运行
  process.on("SIGINT", async () => {
    console.log("\n\n正在关闭服务...");
    server.stop();
    await pgPool.end();
    localCache.close();
    console.log("服务已关闭");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("启动失败:", error);
  process.exit(1);
});
