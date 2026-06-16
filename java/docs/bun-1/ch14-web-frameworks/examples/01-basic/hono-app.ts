import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// ---------------------------------------------------------------------------
// Hono CRUD API — 基于 Web Standard 的轻量级 REST 服务
// 完全运行在 Bun 运行时之上，无 Node.js 依赖
// ---------------------------------------------------------------------------

const app = new Hono();

// ---- 全局中间件 -----------------------------------------------------------
app.use("*", cors());
app.use("*", logger());

// ---- 内存存储（仅演示用，生产环境请使用数据库）-------------------------------
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

let todos: Todo[] = [
  { id: 1, title: "学习 Bun 运行时", completed: false, createdAt: new Date().toISOString() },
  { id: 2, title: "搭建 Hono 应用",   completed: true,  createdAt: new Date().toISOString() },
];

let nextId = 3;

// ---- RESTful 路由 -----------------------------------------------------------

// 健康检查
app.get("/health", (c) => c.json({ status: "ok", runtime: "Bun", framework: "Hono" }));

// 列表 — 支持 ?completed=true/false 过滤
app.get("/todos", (c) => {
  const completedParam = c.req.query("completed");
  if (completedParam === undefined) {
    return c.json(todos);
  }
  const completed = completedParam === "true";
  return c.json(todos.filter((t) => t.completed === completed));
});

// 查询单条
app.get("/todos/:id", (c) => {
  const id = Number(c.req.param("id"));
  const todo = todos.find((t) => t.id === id);
  if (!todo) return c.json({ error: "Not Found" }, 404);
  return c.json(todo);
});

// 创建
app.post("/todos", async (c) => {
  const body = await c.req.json<Pick<Todo, "title">>();
  if (!body.title || typeof body.title !== "string") {
    return c.json({ error: "title is required and must be a string" }, 400);
  }
  const todo: Todo = {
    id: nextId++,
    title: body.title,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  todos.push(todo);
  return c.json(todo, 201);
});

// 全量更新
app.put("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return c.json({ error: "Not Found" }, 404);

  const body = await c.req.json<Partial<Todo>>();
  todos[idx] = { ...todos[idx], ...body, id }; // id 不可变
  return c.json(todos[idx]);
});

// 部分更新
app.patch("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return c.json({ error: "Not Found" }, 404);

  const body = await c.req.json<Partial<Todo>>();
  if (body.title !== undefined) todos[idx].title = body.title;
  if (body.completed !== undefined) todos[idx].completed = body.completed;
  return c.json(todos[idx]);
});

// 删除
app.delete("/todos/:id", (c) => {
  const id = Number(c.req.param("id"));
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return c.json({ error: "Not Found" }, 404);
  todos.splice(idx, 1);
  return c.json({ message: "Deleted" });
});

// ---- 启动服务 ---------------------------------------------------------------
const port = Number(Bun.env.PORT) || 3000;
console.log(`\n🚀 Hono 服务已启动: http://localhost:${port}`);
console.log(`   📋 GET    /todos        — 列出所有待办事项`);
console.log(`   📋 GET    /todos/:id    — 查询单条待办事项`);
console.log(`   📝 POST   /todos        — 创建待办事项`);
console.log(`   🔄 PUT    /todos/:id    — 全量更新待办事项`);
console.log(`   🔄 PATCH  /todos/:id    — 部分更新待办事项`);
console.log(`   ❌ DELETE /todos/:id    — 删除待办事项\n`);

export default { port, fetch: app.fetch };
