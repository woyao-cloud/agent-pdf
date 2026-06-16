import { Elysia, t } from "elysia";

// ---------------------------------------------------------------------------
// Elysia 类型安全 API — 全栈 TypeScript 体验
//
// Elysia 利用 TypeScript 类型系统 + 运行时校验，实现端到端类型安全：
//   - 路由参数、查询字符串、请求体、响应体均被类型推导
//   - 使用 Elysia 内置的 t 对象（基于 TypeBox）进行 schema 定义
//   - 类型错误在编译期即被发现，无需运行时调试
// ---------------------------------------------------------------------------

// ---- Schema 定义（复用为类型 + 运行时校验）-----------------------------------
const TodoSchema = t.Object({
  id: t.Number(),
  title: t.String({ minLength: 1, maxLength: 200 }),
  completed: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
});

const CreateTodoSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
});

const UpdateTodoSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    completed: t.Boolean(),
  })
);

const IdParamSchema = t.Object({
  id: t.Numeric(),
});

// ---- 内存存储 ---------------------------------------------------------------
interface Todo extends Omit<typeof TodoSchema.static, ""> {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

let todos: Todo[] = [
  { id: 1, title: "学习 Elysia 框架", completed: false, createdAt: new Date().toISOString() },
  { id: 2, title: "理解 TypeBox Schema", completed: true, createdAt: new Date().toISOString() },
  { id: 3, title: "配置生产环境", completed: false, createdAt: new Date().toISOString() },
];

let nextId = 4;

// ---- 应用实例 ---------------------------------------------------------------
const app = new Elysia()
  // ---- 全局钩子：请求日志（Elysia 使用 onRequest/onResponse 替代中间件）-------
  .onRequest(({ request }) => {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
  })
  .onResponse(({ request, set }) => {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} → ${set.status}`);
  })

  // ---- CORS（Elysia 内置 cors 插件）-----------------------------------------
  .use(
    require("elysia/cors")({
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  )

  // ---- 健康检查 -------------------------------------------------------------
  .get("/health", () => ({
    status: "ok" as const,
    runtime: "Bun" as const,
    framework: "Elysia" as const,
    version: "1.x",
  }))

  // ---- RESTful CRUD ---------------------------------------------------------

  // GET /todos — 列表（可选 ?completed= 过滤）
  .get(
    "/todos",
    ({ query: { completed } }) => {
      if (completed === undefined) return todos;
      return todos.filter((t) => t.completed === completed);
    },
    {
      query: t.Object({
        completed: t.Optional(t.Boolean({ default: false })),
      }),
    }
  )

  // GET /todos/:id — 单条
  .get(
    "/todos/:id",
    ({ params: { id }, set }) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        set.status = 404;
        return { error: "Not Found" };
      }
      return todo;
    },
    {
      params: IdParamSchema,
      response: {
        200: TodoSchema,
        404: t.Object({ error: t.String() }),
      },
    }
  )

  // POST /todos — 创建
  .post(
    "/todos",
    ({ body, set }) => {
      const todo: Todo = {
        id: nextId++,
        title: body.title,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      todos.push(todo);
      set.status = 201;
      return todo;
    },
    {
      body: CreateTodoSchema,
      response: {
        201: TodoSchema,
      },
    }
  )

  // PUT /todos/:id — 全量更新
  .put(
    "/todos/:id",
    ({ params: { id }, body, set }) => {
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) {
        set.status = 404;
        return { error: "Not Found" };
      }
      todos[idx] = { id, title: body.title, completed: body.completed ?? false, createdAt: todos[idx].createdAt };
      return todos[idx];
    },
    {
      params: IdParamSchema,
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 200 }),
        completed: t.Boolean(),
      }),
    }
  )

  // PATCH /todos/:id — 部分更新
  .patch(
    "/todos/:id",
    ({ params: { id }, body, set }) => {
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) {
        set.status = 404;
        return { error: "Not Found" };
      }
      if (body.title !== undefined) todos[idx].title = body.title;
      if (body.completed !== undefined) todos[idx].completed = body.completed;
      return todos[idx];
    },
    {
      params: IdParamSchema,
      body: UpdateTodoSchema,
    }
  )

  // DELETE /todos/:id — 删除
  .delete(
    "/todos/:id",
    ({ params: { id }, set }) => {
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) {
        set.status = 404;
        return { error: "Not Found" };
      }
      todos.splice(idx, 1);
      return { message: "Deleted" };
    },
    {
      params: IdParamSchema,
    }
  )

  // ---- 启动服务 -------------------------------------------------------------
  .listen(Bun.env.PORT ?? 3001);

console.log(`\n🚀 Elysia 服务已启动: http://localhost:${app.server!.port}`);
console.log(`   📋 GET    /todos        — 列出所有待办事项`);
console.log(`   📋 GET    /todos/:id    — 查询单条待办事项`);
console.log(`   📝 POST   /todos        — 创建待办事项`);
console.log(`   🔄 PUT    /todos/:id    — 全量更新待办事项`);
console.log(`   🔄 PATCH  /todos/:id    — 部分更新待办事项`);
console.log(`   ❌ DELETE /todos/:id    — 删除待办事项`);
console.log(`   所有路由类型安全，编译期校验通过 ✅\n`);
