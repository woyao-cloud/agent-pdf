// ---------------------------------------------------------------------------
// 框架基准测试 — 对比 Hono、Elysia、Bun.serve 原生、Express（模拟）的性能
//
// 测试策略：
//   1. 四种框架各自实现相同的 JSON 响应端点
//   2. 使用 Bun 内置的 performance.now() 进行高精度计时
//   3. 每个框架执行 N 轮请求（自调用），统计总耗时和平均耗时
//   4. 输出对比表格
//
// 注意：本测试在同一进程内模拟请求，目的是展示框架层开销差异，
//       不反映真实网络环境下的吞吐量。
// ---------------------------------------------------------------------------

import { Hono } from "hono";
// Elysia 需要额外安装，此处以 Hono 模拟对比；生产测试请取消注释
// import { Elysia } from "elysia";

// ---- 测试配置 ---------------------------------------------------------------
const ITERATIONS = 100_000; // 每轮请求数
const WARMUP = 10_000;      // 预热请求数

// ---- 1. Bun.serve 原生（无框架）-----------------------------------------------
function createBunNativeHandler() {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/api/hello" && req.method === "GET") {
      return Response.json({ message: "Hello from Bun native", timestamp: Date.now() });
    }
    if (url.pathname === "/api/echo" && req.method === "POST") {
      const body = await req.json();
      return Response.json({ received: body, timestamp: Date.now() });
    }
    return new Response("Not Found", { status: 404 });
  };
}

// ---- 2. Hono 框架 -----------------------------------------------------------
function createHonoApp() {
  const app = new Hono();
  app.get("/api/hello", (c) =>
    c.json({ message: "Hello from Hono", timestamp: Date.now() })
  );
  app.post("/api/echo", async (c) => {
    const body = await c.req.json();
    return c.json({ received: body, timestamp: Date.now() });
  });
  return app;
}

// ---- 3. Elysia 框架（模拟，实际测试请安装 elysia 包）--------------------------
// function createElysiaApp() {
//   const app = new Elysia();
//   app.get("/api/hello", () => ({ message: "Hello from Elysia", timestamp: Date.now() }));
//   app.post("/api/echo", ({ body }) => ({ received: body, timestamp: Date.now() }));
//   return app;
// }

// ---- 4. Express 兼容层（通过 node:http + Bun 适配）----------------------------
// 模拟 Express 风格的请求处理链
type ExpressHandler = (req: Request, res: { json: (data: unknown) => Response; status: (code: number) => void }) => Response | void;

function createExpressCompatHandler() {
  const routes: Array<{ method: string; path: string; handler: ExpressHandler }> = [];
  const app = {
    get: (path: string, handler: ExpressHandler) => routes.push({ method: "GET", path, handler }),
    post: (path: string, handler: ExpressHandler) => routes.push({ method: "POST", path, handler }),
  };
  app.get("/api/hello", (_req, res) => res.json({ message: "Hello from Express compat", timestamp: Date.now() }));
  app.post("/api/echo", async (req, res) => {
    const body = await req.json();
    return res.json({ received: body, timestamp: Date.now() });
  });
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    for (const route of routes) {
      if (route.method === req.method && route.path === url.pathname) {
        let response: Response | undefined;
        const res = {
          json: (data: unknown) => { response = Response.json(data); return response; },
          status: (_code: number) => {},
        };
        route.handler(req, res);
        if (response) return response;
      }
    }
    return new Response("Not Found", { status: 404 });
  };
}

// ---- 基准测试函数 -----------------------------------------------------------
async function benchmark(
  name: string,
  handler: (req: Request) => Promise<Response> | Response,
  warmup: number,
  iterations: number
): Promise<{ name: string; totalMs: number; avgUs: number; opsPerSec: number }> {
  const helloReq = new Request("http://localhost/api/hello", { method: "GET" });
  const echoReq = new Request("http://localhost/api/echo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true, value: 42 }),
  });

  // 预热
  for (let i = 0; i < warmup; i++) {
    await handler(helloReq);
    await handler(echoReq);
  }

  // 计时 — GET 请求
  const getStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await handler(helloReq);
  }
  const getEnd = performance.now();

  // 计时 — POST 请求（含 JSON 解析）
  const postStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await handler(echoReq);
  }
  const postEnd = performance.now();

  const totalMs = (getEnd - getStart) + (postEnd - postStart);
  const avgUs = (totalMs * 1000) / (iterations * 2);
  const opsPerSec = Math.round((iterations * 2) / (totalMs / 1000));

  return { name, totalMs: Math.round(totalMs * 100) / 100, avgUs: Math.round(avgUs * 100) / 100, opsPerSec };
}

// ---- 主函数 -----------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  Bun Web 框架基准测试");
  console.log("  Runtime:", Bun.version);
  console.log("  Platform:", process.platform, process.arch);
  console.log("=".repeat(70) + "\n");

  console.log(`  配置: 预热 ${WARMUP} 次, 测试 ${ITERATIONS} 次/轮\n`);

  // 初始化
  const handlers = {
    "Bun.serve 原生": createBunNativeHandler(),
    "Hono": createHonoApp().fetch,
    "Express 兼容层": createExpressCompatHandler(),
    // "Elysia": createElysiaApp().fetch,
  };

  // 运行基准测试
  const results: Array<{ name: string; totalMs: number; avgUs: number; opsPerSec: number }> = [];
  for (const [name, handler] of Object.entries(handlers)) {
    console.log(`  测试中: ${name} ...`);
    const result = await benchmark(name, handler, WARMUP, ITERATIONS);
    results.push(result);
    console.log(`  ✅ ${name} 完成`);
  }

  // 输出结果表格
  console.log("\n" + "-".repeat(70));
  console.log("  结果对比");
  console.log("-".repeat(70));
  console.log(
    `  ${"框架".padEnd(20)} ${"总耗时(ms)".padStart(12)} ${"平均耗时(μs)".padStart(14)} ${"请求/秒".padStart(14)}`
  );
  console.log("-".repeat(70));

  // 按总耗时升序排序
  results.sort((a, b) => a.totalMs - b.totalMs);

  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(20)} ${String(r.totalMs).padStart(12)} ${String(r.avgUs).padStart(14)} ${String(r.opsPerSec).padStart(14)}`
    );
  }

  console.log("-".repeat(70));
  console.log(`  测试时间: ${new Date().toISOString()}`);
  console.log("-".repeat(70));

  // 分析
  const fastest = results[0];
  console.log(`\n  最快: ${fastest.name} (${fastest.opsPerSec.toLocaleString()} req/s)`);
  for (let i = 1; i < results.length; i++) {
    const ratio = Math.round((results[i].totalMs / fastest.totalMs) * 100) / 100;
    console.log(`  ${results[i].name}: ${fastest.name} 的 ${ratio}x 耗时`);
  }

  // 返回结果供外部使用
  return results;
}

// ---- 启动 HTTP 服务供外部请求测试 -------------------------------------------
const port = Number(Bun.env.PORT) || 3002;

// 导出 fetch 处理器，兼容 docker-compose 场景
export default {
  port,
  fetch: async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/bench" || url.pathname === "/") {
      const results = await main();
      return Response.json(results);
    }
    return new Response("Use GET / or /bench to run benchmarks", { status: 200 });
  },
};

// 直接运行时触发基准测试
if (import.meta.main) {
  console.log(`\n  基准测试 HTTP 服务已启动: http://localhost:${port}`);
  console.log("  访问 / 或 /bench 执行测试\n");
  main();
}
