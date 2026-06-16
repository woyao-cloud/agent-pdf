const PORT = 3000;
const PUBLIC_DIR = "/tmp/public";

// Create some sample files
await Bun.write(`${PUBLIC_DIR}/index.html`, "<h1>Bun Static Server</h1>");
await Bun.write(`${PUBLIC_DIR}/data.json`, JSON.stringify({ message: "Hello" }));

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;

    const file = Bun.file(PUBLIC_DIR + filePath);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });

    // ETag for caching
    const etag = `${file.size}-${file.lastModified}`;
    if (req.headers.get("If-None-Match") === etag) return new Response(null, { status: 304 });

    return new Response(file, {
      headers: {
        "ETag": etag,
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
});

const res = await fetch(`http://localhost:${PORT}/`);
console.log("Static server test:", await res.text());
process.exit(0);
