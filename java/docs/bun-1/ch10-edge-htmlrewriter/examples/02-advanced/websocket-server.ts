const server = Bun.serve<{ name: string }>({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/chat") {
      const name = url.searchParams.get("name") || "anonymous";
      const upgraded = server.upgrade(req, { data: { name } });
      if (!upgraded) return new Response("Upgrade failed", { status: 400 });
      return;
    }
    return new Response("WebSocket chat server. Connect to /chat?name=yourname", { headers: { "Content-Type": "text/plain" } });
  },
  websocket: {
    open(ws) { ws.send(`Welcome ${ws.data.name}!`); console.log(`${ws.data.name} joined`); },
    message(ws, msg) { server.publish("chat", `${ws.data.name}: ${msg}`); },
    close(ws) { console.log(`${ws.data.name} left`); },
  },
});
console.log(`WebSocket server on ws://localhost:${server.port}/chat`);
