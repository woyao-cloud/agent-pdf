/**
 * 03-production: API Server
 *
 * A production-quality RESTful API server using Bun.serve().
 * No Express, no framework — just Bun's built-in HTTP server.
 *
 * Features:
 * - CRUD operations for a Todo resource
 * - Health check endpoint
 * - JSON response handling
 * - Error handling with proper HTTP status codes
 * - Request logging
 */

// In-memory data store
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

let todos: Todo[] = [
  { id: 1, title: "Learn Bun", completed: false, createdAt: new Date().toISOString() },
  { id: 2, title: "Build something awesome", completed: false, createdAt: new Date().toISOString() },
];

let nextId = 3;

// Utility: parse JSON body from request
async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// Utility: build JSON response
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Powered-By": "Bun",
    },
  });
}

// Utility: log requests
function log(method: string, path: string, status: number) {
  console.log(`[${new Date().toISOString()}] ${method} ${path} => ${status}`);
}

// Route handler
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // --- Health check ---
  if (method === "GET" && path === "/health") {
    const res = jsonResponse({
      status: "ok",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      todoCount: todos.length,
    });
    log(method, path, res.status);
    return res;
  }

  // --- GET /api/todos — list all todos ---
  if (method === "GET" && path === "/api/todos") {
    const res = jsonResponse({ todos });
    log(method, path, res.status);
    return res;
  }

  // --- GET /api/todos/:id — get single todo ---
  if (method === "GET" && path.startsWith("/api/todos/")) {
    const id = parseInt(path.split("/").pop() || "", 10);
    if (isNaN(id)) {
      return jsonResponse({ error: "Invalid ID" }, 400);
    }
    const todo = todos.find((t) => t.id === id);
    if (!todo) {
      return jsonResponse({ error: "Todo not found" }, 404);
    }
    const res = jsonResponse({ todo });
    log(method, path, res.status);
    return res;
  }

  // --- POST /api/todos — create todo ---
  if (method === "POST" && path === "/api/todos") {
    const body = await parseBody(req);
    if (!body.title || typeof body.title !== "string") {
      return jsonResponse({ error: "Title is required (string)" }, 400);
    }
    const todo: Todo = {
      id: nextId++,
      title: body.title as string,
      completed: body.completed === true,
      createdAt: new Date().toISOString(),
    };
    todos.push(todo);
    const res = jsonResponse({ todo }, 201);
    log(method, path, res.status);
    return res;
  }

  // --- PUT /api/todos/:id — update todo ---
  if (method === "PUT" && path.startsWith("/api/todos/")) {
    const id = parseInt(path.split("/").pop() || "", 10);
    if (isNaN(id)) {
      return jsonResponse({ error: "Invalid ID" }, 400);
    }
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) {
      return jsonResponse({ error: "Todo not found" }, 404);
    }
    const body = await parseBody(req);
    if (typeof body.title === "string") todos[idx].title = body.title;
    if (typeof body.completed === "boolean") todos[idx].completed = body.completed;
    const res = jsonResponse({ todo: todos[idx] });
    log(method, path, res.status);
    return res;
  }

  // --- DELETE /api/todos/:id — delete todo ---
  if (method === "DELETE" && path.startsWith("/api/todos/")) {
    const id = parseInt(path.split("/").pop() || "", 10);
    if (isNaN(id)) {
      return jsonResponse({ error: "Invalid ID" }, 400);
    }
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) {
      return jsonResponse({ error: "Todo not found" }, 404);
    }
    todos.splice(idx, 1);
    const res = jsonResponse({ message: "Deleted" });
    log(method, path, res.status);
    return res;
  }

  // --- 404 for everything else ---
  const res = jsonResponse({ error: "Not found", path, method }, 404);
  log(method, path, res.status);
  return res;
}

// Start the server
const PORT = parseInt(process.env.PORT || "3000", 10);

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`\n  🚀 Todo API server running on http://localhost:${PORT}`);
console.log(`  📋 Bun version: ${Bun.version}`);
console.log(`  🔗 Endpoints:`);
console.log(`     GET  /health        — health check`);
console.log(`     GET  /api/todos     — list todos`);
console.log(`     GET  /api/todos/:id — get todo by ID`);
console.log(`     POST /api/todos     — create todo`);
console.log(`     PUT  /api/todos/:id — update todo`);
console.log(`     DELETE /api/todos/:id — delete todo`);
console.log(`\n  Press Ctrl+C to stop.\n`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n  Shutting down server...");
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n  Shutting down server...");
  server.stop();
  process.exit(0);
});
