import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;

let server;

beforeAll(() => {
  server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/api/todos" && req.method === "GET") {
        return Response.json([{ id: 1, title: "Test todo", completed: false }]);
      }
      if (url.pathname === "/api/todos" && req.method === "POST") {
        const body = await req.json();
        return Response.json({ id: 2, ...body }, { status: 201 });
      }
      if (url.pathname === "/health") {
        return Response.json({ status: "ok" });
      }
      return new Response("Not Found", { status: 404 });
    },
  });
});

afterAll(() => {
  server?.stop();
});

describe("API Integration Tests", () => {
  it("GET /health returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /api/todos returns todo list", async () => {
    const res = await fetch(`${BASE_URL}/api/todos`);
    expect(res.status).toBe(200);
    const todos = await res.json();
    expect(Array.isArray(todos)).toBe(true);
    expect(todos[0].title).toBeDefined();
  });

  it("POST /api/todos creates a new todo", async () => {
    const res = await fetch(`${BASE_URL}/api/todos`, {
      method: "POST",
      body: JSON.stringify({ title: "New todo", completed: false }),
    });
    expect(res.status).toBe(201);
    const todo = await res.json();
    expect(todo.id).toBe(2);
    expect(todo.title).toBe("New todo");
  });

  it("GET unknown route returns 404", async () => {
    const res = await fetch(`${BASE_URL}/unknown`);
    expect(res.status).toBe(404);
  });
});
