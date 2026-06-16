Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = url.pathname === "/" ? "/tmp/sample.txt" : "." + url.pathname;

    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return new Response("Not Found", { status: 404 });

    // Bun.file() automatically sets Content-Type and Content-Length
    return new Response(file);
  },
});

// Create sample file and self-test
await Bun.write("/tmp/sample.txt", "Hello from Bun file server!\n");
const res = await fetch("http://localhost:3000/");
console.log(await res.text());
process.exit(0);
